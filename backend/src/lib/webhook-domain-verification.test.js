import { describe, expect, it, vi } from "vitest";
import nock from "nock";
import {
  createWebhookDomainVerificationState,
  getWebhookVerificationDomain,
  getWebhookVerificationFileUrl,
  readWebhookDomainVerification,
  verifyWebhookDomain,
} from "./webhook-domain-verification.js";

describe("webhook domain verification", () => {
  it("creates an unverified state with a token and well-known file URL", () => {
    const result = createWebhookDomainVerificationState(
      "https://merchant.example/webhooks/stellar",
      null,
    );

    expect(result.verification).toMatchObject({
      status: "unverified",
      domain: "merchant.example",
      verification_file_url:
        "https://merchant.example/.well-known/stellar-pay-verification.txt",
      checked_at: null,
      verified_at: null,
      failure_reason: null,
    });
    expect(result.verification.verification_token).toMatch(/^spv_[a-f0-9]{48}$/);
  });

  it("preserves an existing verification token for the same domain", () => {
    const metadata = {
      webhook_domain_verification: {
        status: "verified",
        domain: "merchant.example",
        verification_token: "spv_keep_me",
        verification_file_url:
          "https://merchant.example/.well-known/stellar-pay-verification.txt",
        checked_at: null,
        verified_at: "2026-03-28T00:00:00.000Z",
        failure_reason: null,
      },
    };

    const result = createWebhookDomainVerificationState(
      "https://merchant.example/hooks/payments",
      metadata,
    );

    expect(result.verification.verification_token).toBe("spv_keep_me");
    expect(result.verification.status).toBe("verified");
  });

  it("clears verification metadata when the webhook URL is removed", () => {
    const result = createWebhookDomainVerificationState("", {
      webhook_domain_verification: {
        status: "verified",
      },
      other_key: true,
    });

    expect(result.verification).toBeNull();
    expect(result.metadata).toEqual({ other_key: true });
  });

  it("marks the domain verified when the file contains the expected token", async () => {
    const initial = createWebhookDomainVerificationState(
      "https://merchant.example/webhooks/stellar",
      null,
    );

    nock("https://merchant.example")
      .get("/.well-known/stellar-pay-verification.txt")
      .reply(200, `${initial.verification.verification_token}\n`);

    const result = await verifyWebhookDomain({
      webhookUrl: "https://merchant.example/webhooks/stellar",
      metadata: initial.metadata,
    });

    expect(result.verification.status).toBe("verified");
    expect(result.verification.failure_reason).toBeNull();
    expect(result.verification.verified_at).toBeTruthy();
  });

  it("keeps the domain unverified when the token is missing", async () => {
    const initial = createWebhookDomainVerificationState(
      "https://merchant.example/webhooks/stellar",
      null,
    );

    nock("https://merchant.example")
      .get("/.well-known/stellar-pay-verification.txt")
      .reply(200, "wrong-token");

    const result = await verifyWebhookDomain({
      webhookUrl: "https://merchant.example/webhooks/stellar",
      metadata: initial.metadata,
    });

    expect(result.verification.status).toBe("unverified");
    expect(result.verification.failure_reason).toContain("Verification token not found");
  });

  it("reads the verification metadata only when it matches the webhook domain", () => {
    const metadata = {
      webhook_domain_verification: {
        status: "verified",
        domain: "merchant.example",
        verification_token: "spv_token",
        verification_file_url:
          "https://merchant.example/.well-known/stellar-pay-verification.txt",
        checked_at: null,
        verified_at: null,
        failure_reason: null,
      },
    };

    expect(
      readWebhookDomainVerification(
        metadata,
        "https://merchant.example/webhooks/stellar",
      ),
    ).not.toBeNull();
    expect(
      readWebhookDomainVerification(
        metadata,
        "https://other.example/webhooks/stellar",
      ),
    ).toBeNull();
    expect(getWebhookVerificationDomain("https://merchant.example/hooks")).toBe(
      "merchant.example",
    );
    expect(
      getWebhookVerificationFileUrl("https://merchant.example/hooks/stellar"),
    ).toBe("https://merchant.example/.well-known/stellar-pay-verification.txt");
  });
});
