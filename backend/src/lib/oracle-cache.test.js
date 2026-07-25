import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./metrics.js", () => ({
  oracleCacheHitTotal: { inc: vi.fn() },
  oracleCacheMissTotal: { inc: vi.fn() },
  oracleCacheSize: { set: vi.fn() },
  oracleFetchDuration: { observe: vi.fn() },
  oracleFetchErrorsTotal: { inc: vi.fn() },
  oracleStaleDataServedTotal: { inc: vi.fn() },
  oracleCircuitBreakerTripsTotal: { inc: vi.fn() },
}));

vi.mock("./logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  generateOracleCacheKey,
  OracleCache,
  SmartContractOracleIntegrator,
  resetCircuitBreaker,
  getCircuitBreakerMetrics,
  createDefaultIntegrator,
  oracleIntegrator,
} from "./oracle-cache.js";

describe("generateOracleCacheKey", () => {
  it("produces a hex string", () => {
    const key = generateOracleCacheKey("stellar", "price/USDC");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for same inputs", () => {
    const k1 = generateOracleCacheKey("stellar", "price/USDC", { asset: "USDC" });
    const k2 = generateOracleCacheKey("stellar", "price/USDC", { asset: "USDC" });
    expect(k1).toBe(k2);
  });

  it("differs for different feeds", () => {
    const k1 = generateOracleCacheKey("stellar", "price/USDC");
    const k2 = generateOracleCacheKey("stellar", "price/XLM");
    expect(k1).not.toBe(k2);
  });

  it("differs for different parameters", () => {
    const k1 = generateOracleCacheKey("stellar", "price", { asset: "USDC" });
    const k2 = generateOracleCacheKey("stellar", "price", { asset: "XLM" });
    expect(k1).not.toBe(k2);
  });
});

describe("OracleCache", () => {
  let cache;

  beforeEach(() => {
    cache = new OracleCache("test-provider", { maxEntries: 5, ttlMs: 5000, staleToleranceMs: 10000 });
    vi.clearAllMocks();
  });

  it("returns miss for unknown key", () => {
    expect(cache.get("missing").hit).toBe(false);
  });

  it("returns hit for cached entry", () => {
    cache.set("k1", { price: 1.0 });
    const r = cache.get("k1");
    expect(r.hit).toBe(true);
    expect(r.data).toEqual({ price: 1.0 });
    expect(r.stale).toBe(false);
  });

  it("overwrites existing key", () => {
    cache.set("k", { price: 1.0 });
    cache.set("k", { price: 2.0 });
    expect(cache.get("k").data).toEqual({ price: 2.0 });
  });

  it("evicts LRU entry when full", () => {
    for (let i = 0; i < 5; i++) cache.set(`k${i}`, { i });
    cache.set("k5", { i: 5 });
    expect(cache.get("k0").hit).toBe(false);
    expect(cache.get("k5").data).toEqual({ i: 5 });
  });

  it("expires entries after TTL (no stale tolerance)", () => {
    vi.useFakeTimers();
    const c = new OracleCache("test", { maxEntries: 10, ttlMs: 200, staleToleranceMs: 0 });
    c.set("k", { price: 1.0 });
    expect(c.get("k").hit).toBe(true);
    vi.advanceTimersByTime(250);
    expect(c.get("k").hit).toBe(false);
    vi.useRealTimers();
  });

  it("serves stale data within tolerance window", () => {
    vi.useFakeTimers();
    const c = new OracleCache("test", { maxEntries: 10, ttlMs: 200, staleToleranceMs: 500 });
    c.set("k", { price: 1.0 });
    expect(c.get("k").hit).toBe(true);
    vi.advanceTimersByTime(300);
    const r = c.get("k");
    expect(r.hit).toBe(true);
    expect(r.stale).toBe(true);
    expect(r.data).toEqual({ price: 1.0 });
    vi.useRealTimers();
  });

  it("rejects data beyond stale tolerance", () => {
    vi.useFakeTimers();
    const c = new OracleCache("test", { maxEntries: 10, ttlMs: 200, staleToleranceMs: 300 });
    c.set("k", { price: 1.0 });
    vi.advanceTimersByTime(600);
    expect(c.get("k").hit).toBe(false);
    vi.useRealTimers();
  });

  it("refreshes LRU position on read", () => {
    for (let i = 0; i < 5; i++) cache.set(`k${i}`, { i });
    cache.get("k0");
    cache.set("k5", { i: 5 });
    expect(cache.get("k0").hit).toBe(true);
    expect(cache.get("k1").hit).toBe(false);
  });

  it("clear() removes all entries and returns count", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.clear()).toBe(2);
    expect(cache.get("a").hit).toBe(false);
    expect(cache.get("b").hit).toBe(false);
  });

  it("invalidate removes a specific key", () => {
    cache.set("a", 1);
    cache.invalidate("a");
    expect(cache.get("a").hit).toBe(false);
  });

  it("getStats returns correct shape", () => {
    cache.set("x", 1);
    const s = cache.getStats();
    expect(s.name).toBe("test-provider");
    expect(s.size).toBe(1);
    expect(s.maxEntries).toBe(5);
    expect(s.ttlMs).toBe(5000);
    expect(s.staleToleranceMs).toBe(10000);
  });
});

describe("SmartContractOracleIntegrator", () => {
  let integrator;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCircuitBreaker();
  });

  it("registers providers and creates caches", () => {
    integrator = new SmartContractOracleIntegrator({
      providers: [{ name: "p1", fetch: vi.fn().mockResolvedValue({}) }],
    });
    expect(integrator.providers.size).toBe(1);
    expect(integrator.caches.size).toBe(1);
    expect(integrator.getCache("p1")).toBeInstanceOf(OracleCache);
  });

  it("throws on provider without name", () => {
    expect(() => new SmartContractOracleIntegrator({ providers: [{ fetch: () => {} }] }))
      .toThrow("Provider must have a name");
  });

  it("throws on provider without fetch function", () => {
    expect(() => new SmartContractOracleIntegrator({ providers: [{ name: "bad" }] }))
      .toThrow("Provider must have a fetch function");
  });

  it("fetches data from provider on first call", async () => {
    const fn = vi.fn().mockResolvedValue({ price: 1.0 });
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });
    const result = await integrator.fetch("p1", "price/USDC");
    expect(result.data).toEqual({ price: 1.0 });
    expect(result.source).toBe("provider");
    expect(result.stale).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns cached data on second call", async () => {
    const fn = vi.fn().mockResolvedValue({ price: 1.0 });
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });
    await integrator.fetch("p1", "x");
    const r = await integrator.fetch("p1", "x");
    expect(r.source).toBe("cache");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws for unknown provider", async () => {
    integrator = new SmartContractOracleIntegrator();
    await expect(integrator.fetch("ghost", "feed")).rejects.toThrow("Unknown oracle provider: ghost");
  });

  it("retries and succeeds on third attempt", async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockImplementationOnce(() => Promise.reject(new Error("timeout")))
      .mockImplementationOnce(() => Promise.reject(new Error("network")))
      .mockResolvedValue({ price: 1.0 });
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });

    const promise = integrator.fetch("p1", "price");
    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;

    expect(result.data).toEqual({ price: 1.0 });
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("throws after exhausting retries", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("persistent failure")));
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });

    const promise = integrator.fetch("p1", "price");
    await vi.advanceTimersByTimeAsync(10000);
    await expect(promise).rejects.toThrow("persistent failure");
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("serves stale data when provider fails and stale exists", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ price: 1.0 });
      return Promise.reject(new Error("down"));
    });
    integrator = new SmartContractOracleIntegrator({
      providers: [{ name: "p1", fetch: fn, ttlMs: 200, staleToleranceMs: 5000 }],
    });

    await integrator.fetch("p1", "price");
    vi.advanceTimersByTime(300);
    const promise = integrator.fetch("p1", "price");
    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;

    expect(result.source).toBe("stale-cache");
    expect(result.stale).toBe(true);
    expect(result.data).toEqual({ price: 1.0 });
    vi.useRealTimers();
  });

  it("trips circuit breaker after threshold failures", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("down")));
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });

    for (let i = 0; i < 5; i++) {
      const p = integrator.fetch("p1", "price");
      await vi.advanceTimersByTimeAsync(10000);
      await expect(p).rejects.toThrow();
    }

    expect(getCircuitBreakerMetrics()["p1"].state).toBe("open");
    vi.useRealTimers();
  });

  it("rejects fast when circuit breaker is open", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("down")));
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });

    for (let i = 0; i < 5; i++) {
      const p = integrator.fetch("p1", "price");
      await vi.advanceTimersByTimeAsync(10000);
      await expect(p).rejects.toThrow();
    }

    const p = integrator.fetch("p1", "price");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).rejects.toThrow("Circuit breaker open");
    vi.useRealTimers();
  });

  it("recovers circuit breaker after reset timeout", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("down")));
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });

    for (let i = 0; i < 5; i++) {
      const p = integrator.fetch("p1", "price");
      await vi.advanceTimersByTimeAsync(10000);
      await expect(p).rejects.toThrow();
    }

    vi.advanceTimersByTime(31_000);
    fn.mockResolvedValue({ price: 2.0 });
    const p = integrator.fetch("p1", "price");
    await vi.advanceTimersByTimeAsync(10000);
    const result = await p;

    expect(result.data).toEqual({ price: 2.0 });
    vi.useRealTimers();
  });

  it("fetchWithFallback tries all providers sequentially", async () => {
    vi.useFakeTimers();
    const p1 = { name: "p1", fetch: vi.fn().mockImplementation(() => Promise.reject(new Error("down"))) };
    const p2 = { name: "p2", fetch: vi.fn().mockResolvedValue({ price: 2.0 }) };
    integrator = new SmartContractOracleIntegrator({ providers: [p1, p2] });

    const promise = integrator.fetchWithFallback("price");
    await vi.advanceTimersByTimeAsync(20000);
    const result = await promise;

    expect(result.data).toEqual({ price: 2.0 });
    expect(result.provider).toBe("p2");
    vi.useRealTimers();
  });

  it("fetchWithFallback throws when all providers fail", async () => {
    vi.useFakeTimers();
    const p1 = { name: "p1", fetch: vi.fn().mockImplementation(() => Promise.reject(new Error("down"))) };
    const p2 = { name: "p2", fetch: vi.fn().mockImplementation(() => Promise.reject(new Error("down"))) };
    integrator = new SmartContractOracleIntegrator({ providers: [p1, p2] });

    const promise = integrator.fetchWithFallback("price");
    await vi.advanceTimersByTimeAsync(20000);
    await expect(promise).rejects.toThrow("All oracle providers failed");
    vi.useRealTimers();
  });

  it("fetchBatch executes multiple queries", async () => {
    const fn = vi.fn().mockResolvedValue({ price: 1.0 });
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });
    const { results, errors } = await integrator.fetchBatch([
      { provider: "p1", feed: "f1", requestId: "r1" },
      { provider: "p1", feed: "f2", requestId: "r2" },
    ]);
    expect(results).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(results[0].requestId).toBe("r1");
  });

  it("fetchBatch collects errors per query", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("fail")));
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });

    const promise = integrator.fetchBatch([{ provider: "p1", feed: "f1", requestId: "r1" }]);
    await vi.advanceTimersByTimeAsync(10000);
    const { results, errors } = await promise;

    expect(results).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].requestId).toBe("r1");
    vi.useRealTimers();
  });

  it("invalidateCache removes specific cache entry", async () => {
    const fn = vi.fn().mockResolvedValue({ price: 1.0 });
    integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });
    await integrator.fetch("p1", "price");
    integrator.invalidateCache("p1", "price");
    await integrator.fetch("p1", "price");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clearAllCaches empties all provider caches", async () => {
    const p1 = { name: "p1", fetch: vi.fn().mockResolvedValue({ a: 1 }) };
    const p2 = { name: "p2", fetch: vi.fn().mockResolvedValue({ b: 2 }) };
    integrator = new SmartContractOracleIntegrator({ providers: [p1, p2] });
    await integrator.fetch("p1", "a");
    await integrator.fetch("p2", "b");

    expect(integrator.clearAllCaches()).toBe(2);
    expect(integrator.getCache("p1").getStats().size).toBe(0);
    expect(integrator.getCache("p2").getStats().size).toBe(0);
  });

  it("getStats returns stats for all providers", async () => {
    integrator = new SmartContractOracleIntegrator({
      providers: [{ name: "p1", fetch: vi.fn().mockResolvedValue({}) }],
    });
    await integrator.fetch("p1", "a");
    expect(integrator.getStats().p1.size).toBe(1);
  });
});

describe("Circuit Breaker - resetCircuitBreaker", () => {
  beforeEach(() => {
    resetCircuitBreaker();
    vi.clearAllMocks();
  });

  it("resets circuit breaker for a specific provider", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("down")));
    const integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });

    for (let i = 0; i < 5; i++) {
      const p = integrator.fetch("p1", "x");
      await vi.advanceTimersByTimeAsync(10000);
      await expect(p).rejects.toThrow();
    }

    expect(getCircuitBreakerMetrics()["p1"].state).toBe("open");
    resetCircuitBreaker("p1");
    expect(getCircuitBreakerMetrics()["p1"]).toBeUndefined();
    vi.useRealTimers();
  });

  it("resets all circuit breakers when no provider specified", async () => {
    vi.useFakeTimers();
    const p1 = { name: "p1", fetch: vi.fn().mockImplementation(() => Promise.reject(new Error("down"))) };
    const p2 = { name: "p2", fetch: vi.fn().mockImplementation(() => Promise.reject(new Error("down"))) };
    const integrator = new SmartContractOracleIntegrator({ providers: [p1, p2] });

    for (let i = 0; i < 5; i++) {
      const pa = integrator.fetch("p1", "x");
      const pb = integrator.fetch("p2", "x");
      await vi.advanceTimersByTimeAsync(10000);
      await expect(pa).rejects.toThrow();
      await expect(pb).rejects.toThrow();
    }

    resetCircuitBreaker();
    expect(getCircuitBreakerMetrics()).toEqual({});
    vi.useRealTimers();
  });

  it("getCircuitBreakerMetrics returns a snapshot", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("down")));
    const integrator = new SmartContractOracleIntegrator({ providers: [{ name: "p1", fetch: fn }] });

    for (let i = 0; i < 5; i++) {
      const p = integrator.fetch("p1", "x");
      await vi.advanceTimersByTimeAsync(10000);
      await expect(p).rejects.toThrow();
    }

    const metrics = getCircuitBreakerMetrics();
    expect(metrics["p1"].failures).toBeGreaterThanOrEqual(5);
    expect(metrics["p1"].state).toBe("open");
    vi.useRealTimers();
  });
});

describe("createDefaultIntegrator", () => {
  it("creates an integrator with Stellar price feed", () => {
    const integ = createDefaultIntegrator();
    expect(integ).toBeInstanceOf(SmartContractOracleIntegrator);
    expect(integ.providers.has("stellar")).toBe(true);
  });

  it("oracleIntegrator singleton is an integrator instance", () => {
    expect(oracleIntegrator).toBeInstanceOf(SmartContractOracleIntegrator);
  });
});
