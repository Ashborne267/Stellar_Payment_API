import * as Sentry from "@sentry/node";

// Fields that must never appear in Sentry error reports
const SENSITIVE_HEADERS = ["x-api-key", "authorization"];
const SENSITIVE_BODY_KEYS = ["api_key", "webhook_secret"];

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 1.0,
    beforeSend(event) {
      // Strip sensitive request headers from error reports
      if (event.request?.headers) {
        for (const key of SENSITIVE_HEADERS) {
          if (event.request.headers[key] !== undefined) {
            event.request.headers[key] = "[REDACTED]";
          }
        }
      }
      // Strip sensitive body fields from error reports
      if (event.request?.data && typeof event.request.data === "object") {
        for (const key of SENSITIVE_BODY_KEYS) {
          if (event.request.data[key] !== undefined) {
            event.request.data[key] = "[REDACTED]";
          }
        }
      }
      return event;
    },
  });
}

export function setupSentryErrorHandler(app) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.setupExpressErrorHandler(app);
}
