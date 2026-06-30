import { sendWebhook } from "./webhooks.js";
import { getPayloadForVersion } from "../webhooks/resolver.js";

export const RETRYABLE_WEBHOOK_STATUS_CODE = 400;

export function isRetryableWebhookLog(log) {
  return Number(log?.status_code) >= RETRYABLE_WEBHOOK_STATUS_CODE;
}

export function queueWebhookRetry(
  { url, payload, secret },
  {
    dispatchWebhook = sendWebhook,
    schedule = setTimeout,
  } = {},
) {
  schedule(() => {
    Promise.resolve(dispatchWebhook(url, payload, secret)).catch((error) => {
      console.warn("Bulk webhook retry dispatch failed:", error.message);
    });
  }, 0);
}

export async function queueBulkWebhookRetries(
  { db, merchantId, logIds },
  { queueWebhook = queueWebhookRetry } = {},
) {
  const uniqueLogIds = [...new Set(logIds)];

  if (uniqueLogIds.length === 0) {
    return {
      requested_count: 0,
      queued_count: 0,
      skipped_count: 0,
      queued_log_ids: [],
    };
  }

  const { rows } = await db.query(
    `
      select
        l.id,
        l.status_code,
        p.webhook_url,
        p.id as payment_id,
        p.amount,
        p.asset,
        p.asset_issuer,
        p.recipient,
        p.tx_id,
        m.webhook_secret,
        m.webhook_version
      from webhook_delivery_logs l
      join payments p on p.id = l.payment_id
      join merchants m on m.id = p.merchant_id
      where p.merchant_id = $1
        and l.id = any($2::uuid[])
    `,
    [merchantId, uniqueLogIds],
  );

  const queuedLogIds = [];

  for (const row of rows) {
    if (!isRetryableWebhookLog(row) || !row.webhook_url) {
      continue;
    }

    const payload = getPayloadForVersion(
      row.webhook_version,
      "payment.confirmed",
      {
        payment_id: row.payment_id,
        amount: row.amount,
        asset: row.asset,
        asset_issuer: row.asset_issuer,
        recipient: row.recipient,
        tx_id: row.tx_id,
      },
    );

    queueWebhook({
      url: row.webhook_url,
      payload,
      secret: row.webhook_secret,
    });

    queuedLogIds.push(row.id);
  }

  return {
    requested_count: uniqueLogIds.length,
    queued_count: queuedLogIds.length,
    skipped_count: uniqueLogIds.length - queuedLogIds.length,
    queued_log_ids: queuedLogIds,
  };
}
