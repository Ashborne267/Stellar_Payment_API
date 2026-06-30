import { describe, expect, it, vi } from "vitest";

// Mock supabase to avoid initialization errors
vi.mock("./supabase.js", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

import {
  signPayload,
  verifyWebhook,
  verifyWebhookWithTimestamp,
  isPrivateIP,
  validateWebhookUrl,
} from "./webhooks.js";

describe("verifyWebhook", () => {
  it("accepts signatures generated with the current webhook secret", () => {
    const rawBody = JSON.stringify({ event: "payment.confirmed", amount: "10" });
    const merchant = {
      webhook_secret: "current-secret",
      webhook_secret_old: null,
      webhook_secret_expiry: null,
    };

    const signature = signPayload(rawBody, merchant.webhook_secret);

    expect(verifyWebhook(rawBody, `sha256=${signature}`, merchant)).toBe(true);
  });

  it("accepts signatures generated with old secret before expiry", () => {
    const rawBody = JSON.stringify({ event: "payment.confirmed", amount: "10" });
    const merchant = {
      webhook_secret: "current-secret",
      webhook_secret_old: "old-secret",
      webhook_secret_expiry: new Date(Date.now() + 60_000).toISOString(),
    };

    const signature = signPayload(rawBody, merchant.webhook_secret_old);

    expect(verifyWebhook(rawBody, `sha256=${signature}`, merchant)).toBe(true);
  });

  it("rejects signatures generated with old secret after expiry", () => {
    const rawBody = JSON.stringify({ event: "payment.confirmed", amount: "10" });
    const merchant = {
      webhook_secret: "current-secret",
      webhook_secret_old: "old-secret",
      webhook_secret_expiry: new Date(Date.now() - 60_000).toISOString(),
    };

    const signature = signPayload(rawBody, merchant.webhook_secret_old);

    expect(verifyWebhook(rawBody, `sha256=${signature}`, merchant)).toBe(false);
  });

  it("rejects malformed signature headers", () => {
    const rawBody = JSON.stringify({ event: "payment.confirmed", amount: "10" });
    const merchant = {
      webhook_secret: "current-secret",
      webhook_secret_old: null,
      webhook_secret_expiry: null,
    };

    expect(verifyWebhook(rawBody, "invalid", merchant)).toBe(false);
  });
});

describe("verifyWebhookWithTimestamp", () => {
  it("accepts valid signature with recent timestamp", () => {
    const rawBody = JSON.stringify({ event: "payment.confirmed", amount: "10" });
    const merchant = {
      webhook_secret: "current-secret",
      webhook_secret_old: null,
      webhook_secret_expiry: null,
    };

    const signature = signPayload(rawBody, merchant.webhook_secret);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    expect(
      verifyWebhookWithTimestamp(
        rawBody,
        `sha256=${signature}`,
        timestamp,
        merchant
      )
    ).toBe(true);
  });

  it("rejects old timestamp (replay attack)", () => {
    const rawBody = JSON.stringify({ event: "payment.confirmed", amount: "10" });
    const merchant = {
      webhook_secret: "current-secret",
      webhook_secret_old: null,
      webhook_secret_expiry: null,
    };

    const signature = signPayload(rawBody, merchant.webhook_secret);
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();

    expect(
      verifyWebhookWithTimestamp(
        rawBody,
        `sha256=${signature}`,
        oldTimestamp,
        merchant
      )
    ).toBe(false);
  });

  it("rejects future timestamp", () => {
    const rawBody = JSON.stringify({ event: "payment.confirmed", amount: "10" });
    const merchant = {
      webhook_secret: "current-secret",
      webhook_secret_old: null,
      webhook_secret_expiry: null,
    };

    const signature = signPayload(rawBody, merchant.webhook_secret);
    const futureTimestamp = (Math.floor(Date.now() / 1000) + 600).toString();

    expect(
      verifyWebhookWithTimestamp(
        rawBody,
        `sha256=${signature}`,
        futureTimestamp,
        merchant
      )
    ).toBe(false);
  });

  it("rejects invalid signature regardless of timestamp", () => {
    const rawBody = JSON.stringify({ event: "payment.confirmed", amount: "10" });
    const merchant = {
      webhook_secret: "current-secret",
      webhook_secret_old: null,
      webhook_secret_expiry: null,
    };

    const timestamp = Math.floor(Date.now() / 1000).toString();

    expect(
      verifyWebhookWithTimestamp(
        rawBody,
        "sha256=invalid",
        timestamp,
        merchant
      )
    ).toBe(false);
  });
});

describe("isPrivateIP", () => {
  it("identifies private IPv4 addresses", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("172.16.0.1")).toBe(true);
    expect(isPrivateIP("192.168.1.1")).toBe(true);
    expect(isPrivateIP("169.254.1.1")).toBe(true);
    expect(isPrivateIP("0.0.0.0")).toBe(true);
  });

  it("identifies private IPv6 addresses", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("fe80::1")).toBe(true);
    expect(isPrivateIP("fc00::1")).toBe(true);
  });

  it("allows public IP addresses", () => {
    expect(isPrivateIP("1.1.1.1")).toBe(false);
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("208.67.222.222")).toBe(false);
  });
});

describe("validateWebhookUrl", () => {
  it("blocks localhost and loopback", async () => {
    expect(await validateWebhookUrl("http://localhost/webhook")).toBe(false);
    expect(await validateWebhookUrl("http://127.0.0.1/webhook")).toBe(false);
    expect(await validateWebhookUrl("http://[::1]/webhook")).toBe(false);
  });

  it("blocks private network URLs", async () => {
    expect(await validateWebhookUrl("http://192.168.1.50/webhook")).toBe(false);
    expect(await validateWebhookUrl("http://10.0.0.5/webhook")).toBe(false);
  });

  it("allows public URLs", async () => {
    expect(await validateWebhookUrl("https://example.com/webhook")).toBe(true);
    expect(await validateWebhookUrl("https://hooks.stripe.com/abc")).toBe(true);
  });

  it("blocks invalid URLs", async () => {
    expect(await validateWebhookUrl("not-a-url")).toBe(false);
  });
});