import { randomBytes } from "node:crypto";

const VERIFICATION_METADATA_KEY = "webhook_domain_verification";
const VERIFICATION_FILE_PATH = "/.well-known/stellar-pay-verification.txt";
const VERIFICATION_TIMEOUT_MS = 5_000;

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...metadata }
    : {};
}

function normalizeVerification(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  return {
    status: record.status === "verified" ? "verified" : "unverified",
    domain: typeof record.domain === "string" ? record.domain : null,
    verification_token:
      typeof record.verification_token === "string"
        ? record.verification_token
        : null,
    verification_file_url:
      typeof record.verification_file_url === "string"
        ? record.verification_file_url
        : null,
    checked_at: typeof record.checked_at === "string" ? record.checked_at : null,
    verified_at:
      typeof record.verified_at === "string" ? record.verified_at : null,
    failure_reason:
      typeof record.failure_reason === "string" ? record.failure_reason : null,
  };
}

export function getWebhookVerificationFileUrl(webhookUrl) {
  const url = new URL(webhookUrl);
  return `${url.origin}${VERIFICATION_FILE_PATH}`;
}

export function getWebhookVerificationDomain(webhookUrl) {
  return new URL(webhookUrl).hostname.toLowerCase();
}

function buildVerificationToken() {
  return `spv_${randomBytes(24).toString("hex")}`;
}

export function readWebhookDomainVerification(metadata, webhookUrl = "") {
  const current = normalizeVerification(
    normalizeMetadata(metadata)[VERIFICATION_METADATA_KEY],
  );

  if (!current) {
    return null;
  }

  if (webhookUrl) {
    const currentDomain = getWebhookVerificationDomain(webhookUrl);
    if (current.domain !== currentDomain) {
      return null;
    }
  }

  return current;
}

export function createWebhookDomainVerificationState(webhookUrl, metadata) {
  const nextMetadata = normalizeMetadata(metadata);

  if (!webhookUrl) {
    delete nextMetadata[VERIFICATION_METADATA_KEY];
    return {
      metadata: nextMetadata,
      verification: null,
    };
  }

  const existing = readWebhookDomainVerification(nextMetadata, webhookUrl);
  if (existing?.verification_token) {
    return {
      metadata: nextMetadata,
      verification: existing,
    };
  }

  const verification = {
    status: "unverified",
    domain: getWebhookVerificationDomain(webhookUrl),
    verification_token: buildVerificationToken(),
    verification_file_url: getWebhookVerificationFileUrl(webhookUrl),
    checked_at: null,
    verified_at: null,
    failure_reason: null,
  };

  nextMetadata[VERIFICATION_METADATA_KEY] = verification;

  return {
    metadata: nextMetadata,
    verification,
  };
}

export async function verifyWebhookDomain({
  webhookUrl,
  metadata,
  fetchImpl = fetch,
}) {
  const nextMetadata = normalizeMetadata(metadata);
  const verification = readWebhookDomainVerification(nextMetadata, webhookUrl);

  if (!webhookUrl || !verification?.verification_token) {
    throw new Error("Webhook domain verification is not configured.");
  }

  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

  try {
    const response = await fetchImpl(verification.verification_file_url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/plain",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Verification file request failed with status ${response.status}.`,
      );
    }

    const body = await response.text();
    const matches = body
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .includes(verification.verification_token);

    const nextVerification = {
      ...verification,
      status: matches ? "verified" : "unverified",
      checked_at: checkedAt,
      verified_at: matches
        ? verification.verified_at || checkedAt
        : null,
      failure_reason: matches
        ? null
        : `Verification token not found at ${verification.verification_file_url}.`,
    };

    nextMetadata[VERIFICATION_METADATA_KEY] = nextVerification;

    return {
      metadata: nextMetadata,
      verification: nextVerification,
    };
  } catch (err) {
    const nextVerification = {
      ...verification,
      status: "unverified",
      checked_at: checkedAt,
      verified_at: null,
      failure_reason:
        err instanceof Error
          ? err.name === "AbortError"
            ? "Verification file request timed out."
            : err.message
          : "Verification failed.",
    };

    nextMetadata[VERIFICATION_METADATA_KEY] = nextVerification;

    return {
      metadata: nextMetadata,
      verification: nextVerification,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
