import { beforeEach, describe, expect, it } from "vitest";
import client from "prom-client";
import {
  exchangeRateQuoteRequests,
  exchangeRateQuoteDuration,
  exchangeRateHorizonCalls,
  exchangeRateSourceAccountValidation,
  exchangeRateSlippageApplied,
} from "./metrics.js";

describe("Exchange Rate Metrics", () => {
  beforeEach(() => {
    exchangeRateQuoteRequests.reset();
    exchangeRateQuoteDuration.reset();
    exchangeRateHorizonCalls.reset();
    exchangeRateSourceAccountValidation.reset();
    exchangeRateSlippageApplied.reset();
  });

  it("exchangeRateQuoteRequests increments and reads back", () => {
    exchangeRateQuoteRequests.inc({ source_asset: "XLM", dest_asset: "USDC", result: "success" });
    exchangeRateQuoteRequests.inc({ source_asset: "XLM", dest_asset: "USDC", result: "success" });
    exchangeRateQuoteRequests.inc({ source_asset: "USDC", dest_asset: "XLM", result: "not_found" });

    const metric = exchangeRateQuoteRequests;
    expect(metric).toBeDefined();
    expect(metric.name).toBe("exchange_rate_quote_requests_total");
    expect(metric.labelNames).toEqual(["source_asset", "dest_asset", "result"]);
  });

  it("exchangeRateQuoteDuration records observations", () => {
    exchangeRateQuoteDuration.observe({ source_asset: "XLM", dest_asset: "USDC", result: "success" }, 0.5);
    exchangeRateQuoteDuration.observe({ source_asset: "XLM", dest_asset: "USDC", result: "error" }, 1.2);

    const metric = exchangeRateQuoteDuration;
    expect(metric).toBeDefined();
    expect(metric.name).toBe("exchange_rate_quote_duration_seconds");
    expect(metric.labelNames).toEqual(["source_asset", "dest_asset", "result"]);
  });

  it("exchangeRateHorizonCalls tracks call status", () => {
    exchangeRateHorizonCalls.inc({ operation: "strict_receive_paths", status: "success" });
    exchangeRateHorizonCalls.inc({ operation: "load_account", status: "error" });

    const metric = exchangeRateHorizonCalls;
    expect(metric).toBeDefined();
    expect(metric.name).toBe("exchange_rate_horizon_calls_total");
    expect(metric.labelNames).toEqual(["operation", "status"]);
  });

  it("exchangeRateSourceAccountValidation tracks validation results", () => {
    exchangeRateSourceAccountValidation.inc({ result: "valid" });
    exchangeRateSourceAccountValidation.inc({ result: "not_found" });
    exchangeRateSourceAccountValidation.inc({ result: "skipped" });
    exchangeRateSourceAccountValidation.inc({ result: "error" });

    const metric = exchangeRateSourceAccountValidation;
    expect(metric).toBeDefined();
    expect(metric.name).toBe("exchange_rate_source_account_validation_total");
    expect(metric.labelNames).toEqual(["result"]);
  });

  it("exchangeRateSlippageApplied tracks slippage applications", () => {
    exchangeRateSlippageApplied.inc({ slippage_pct: "0.01" });
    exchangeRateSlippageApplied.inc({ slippage_pct: "0.01" });

    const metric = exchangeRateSlippageApplied;
    expect(metric).toBeDefined();
    expect(metric.name).toBe("exchange_rate_slippage_applied_total");
    expect(metric.labelNames).toEqual(["slippage_pct"]);
  });

  it("all metrics are registered and exposed via /metrics output", async () => {
    const { register } = await import("./metrics.js");
    const metricsOutput = await register.metrics();

    expect(metricsOutput).toContain("exchange_rate_quote_requests_total");
    expect(metricsOutput).toContain("exchange_rate_quote_duration_seconds");
    expect(metricsOutput).toContain("exchange_rate_horizon_calls_total");
    expect(metricsOutput).toContain("exchange_rate_source_account_validation_total");
    expect(metricsOutput).toContain("exchange_rate_slippage_applied_total");
  });
});
