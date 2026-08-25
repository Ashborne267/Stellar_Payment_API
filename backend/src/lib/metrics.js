import client from "prom-client";

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "stellar-payment-api",
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

/**
 * Payment Metrics
 */

export const paymentCreatedCounter = new client.Counter({
  name: "payment_created_total",
  help: "Total number of payment sessions created",
  labelNames: ["asset"],
});

export const paymentConfirmedCounter = new client.Counter({
  name: "payment_confirmed_total",
  help: "Total number of payments confirmed on the Stellar network",
  labelNames: ["asset"],
});

export const paymentFailedCounter = new client.Counter({
  name: "payment_failed_total",
  help: "Total number of failed payment attempts",
  labelNames: ["asset", "reason"],
});

export const paymentConfirmationLatency = new client.Histogram({
  name: "payment_confirmation_latency_seconds",
  help: "Time from payment creation to confirmation in seconds",
  labelNames: ["asset"],
  buckets: [10, 30, 60, 120, 300, 600, 1800, 3600], // Buckets in seconds
});

/**
 * Database Connection Pool Metrics
 */

export const pgPoolTotalConnections = new client.Gauge({
  name: "pg_pool_total_connections",
  help: "Total number of connections in the pool",
});

export const pgPoolIdleConnections = new client.Gauge({
  name: "pg_pool_idle_connections",
  help: "Number of idle connections available in the pool",
});

export const pgPoolWaitingRequests = new client.Gauge({
  name: "pg_pool_waiting_requests",
  help: "Number of requests waiting for a connection from the pool",
});

export const pgPoolUtilizationPercent = new client.Gauge({
  name: "pg_pool_utilization_percent",
  help: "Percentage of pool connections in use",
});

/**
 * Query Performance Metrics
 */

export const queryDuration = new client.Histogram({
  name: "db_query_duration_milliseconds",
  help: "Database query execution time in milliseconds",
  labelNames: ["label"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

export const queryRetryCount = new client.Counter({
  name: "db_query_retry_total",
  help: "Total number of query retry attempts",
  labelNames: ["label"],
});

export const slowQueryCount = new client.Counter({
  name: "db_slow_query_total",
  help: "Total number of slow queries exceeding threshold",
  labelNames: ["label", "threshold"],
});

/**
 * Transaction Signer Metrics
 */

export const signatureVerificationTotal = new client.Counter({
  name: "transaction_signer_verification_total",
  help: "Total number of transaction signature verifications",
  labelNames: ["result"], // valid, invalid, error
});

export const signatureVerificationDuration = new client.Histogram({
  name: "transaction_signer_verification_duration_seconds",
  help: "Time taken to verify transaction signature in seconds",
  labelNames: ["result"],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const signatureVerificationReplayAttempts = new client.Counter({
  name: "transaction_signer_replay_attempts_total",
  help: "Total number of detected signature replay attempts",
});

export const txSignatureVerificationTotal = new client.Counter({
  name: "tx_signature_verification_total",
  help: "Total number of transaction signature verifications",
  labelNames: ["outcome"], // valid, invalid
});

export const txSignatureVerificationLatency = new client.Histogram({
  name: "tx_signature_verification_latency_seconds",
  help: "Latency of transaction signature verification",
  labelNames: ["label"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const txSignatureVerificationErrors = new client.Counter({
  name: "tx_signature_verification_errors_total",
  help: "Total number of transaction signature verification errors",
  labelNames: ["error_type"], // validation_failure, replay_attempt, verification_exception, invalid_signature
});

export const txSignatureReplayAttempts = new client.Counter({
  name: "tx_signature_replay_attempts_total",
  help: "Total number of replay attempts detected by the transaction signer",
});

export const txSignatureValidationFailures = new client.Counter({
  name: "tx_signature_validation_failures_total",
  help: "Total number of txHash validation failures",
  labelNames: ["reason"], // empty_or_non_string, invalid_format
});

export const txSignatureCacheSize = new client.Gauge({
  name: "tx_signature_cache_size",
  help: "Current number of entries in the transaction signer replay cache",
});

/**
 * Ledger Monitor Metrics
 */

export const ledgerMonitorCycleDuration = new client.Histogram({
  name: "ledger_monitor_cycle_duration_seconds",
  help: "Time taken for each ledger monitor poll cycle",
  buckets: [1, 5, 10, 30, 60, 120],
});

export const ledgerMonitorPaymentsChecked = new client.Counter({
  name: "ledger_monitor_payments_checked_total",
  help: "Total number of payments checked by ledger monitor",
  labelNames: ["result"], // confirmed, failed, pending, skipped
});

export const ledgerMonitorCircuitBreakerTrips = new client.Counter({
  name: "ledger_monitor_circuit_breaker_trips_total",
  help: "Total number of times the circuit breaker was tripped",
});

export const ledgerMonitorBatchSize = new client.Gauge({
  name: "ledger_monitor_batch_size",
  help: "Number of pending payments fetched in the most recent ledger monitor cycle",
});

export const ledgerMonitorRateLimiterWaitSeconds = new client.Histogram({
  name: "ledger_monitor_rate_limiter_wait_seconds",
  help: "Time spent waiting for a Horizon rate-limit token during a ledger monitor cycle",
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

/**
 * Rate Limiting Metrics
 */

export const rateLimitExceededTotal = new client.Counter({
  name: "rate_limit_exceeded_total",
  help: "Total number of rate limit violations",
  labelNames: ["endpoint", "type"], // endpoint name, type (ip, api_key, merchant)
});

export const rateLimitRequestsTotal = new client.Counter({
  name: "rate_limit_requests_total",
  help: "Total number of requests subject to rate limiting",
  labelNames: ["endpoint", "type"],
});

/**
 * Query Cache Metrics (Issue #760)
 */

export const queryCacheHitTotal = new client.Counter({
  name: "db_query_cache_hit_total",
  help: "Total number of query cache hits",
});

export const queryCacheMissTotal = new client.Counter({
  name: "db_query_cache_miss_total",
  help: "Total number of query cache misses",
});

export const queryCacheSize = new client.Gauge({
  name: "db_query_cache_size",
  help: "Current number of entries in the query cache",
});

/**
 * Database Pooler Rate Limiting Metrics (Issue #758)
 */

export const dbPoolerRateLimitExceeded = new client.Counter({
  name: "db_pooler_rate_limit_exceeded_total",
  help: "Total number of database pooler rate limit violations",
  labelNames: ["type"], // query, connection, merchant
});

export const dbPoolerQueryTotal = new client.Counter({
  name: "db_pooler_query_total",
  help: "Total number of queries executed through the pooler",
  labelNames: ["label", "status"], // success, error, rate_limited
});

/**
 * Database Pooler Signature Verification Metrics (Issue #759)
 */

export const dbPoolerSignatureVerified = new client.Counter({
  name: "db_pooler_signature_verified_total",
  help: "Total number of query signature verifications",
  labelNames: ["result"], // valid, invalid, skipped
});

/**
 * Exchange Rate Service Metrics
 */

export const exchangeRateQuoteRequests = new client.Counter({
  name: "exchange_rate_quote_requests_total",
  help: "Total number of exchange rate quote requests",
  labelNames: ["source_asset", "dest_asset", "result"], // success, not_found, error, rate_limited, same_asset, not_pending
});

export const exchangeRateQuoteDuration = new client.Histogram({
  name: "exchange_rate_quote_duration_seconds",
  help: "Time taken to resolve an exchange rate quote in seconds",
  labelNames: ["source_asset", "dest_asset", "result"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const exchangeRateHorizonCalls = new client.Counter({
  name: "exchange_rate_horizon_calls_total",
  help: "Total number of Horizon API calls made by the exchange rate service",
  labelNames: ["operation", "status"], // operation: strict_receive_paths, load_account; status: success, error
});

export const exchangeRateSourceAccountValidation = new client.Counter({
  name: "exchange_rate_source_account_validation_total",
  help: "Total number of source account validations",
  labelNames: ["result"], // valid, not_found, error, skipped
});

export const exchangeRateSlippageApplied = new client.Counter({
  name: "exchange_rate_slippage_applied_total",
  help: "Total number of exchange rate quotes with slippage applied",
  labelNames: ["slippage_pct"],
});

/**
 * Horizon Client Cache Metrics
 */

export const horizonCacheHitsTotal = new client.Counter({
  name: "horizon_cache_hits_total",
  help: "Total number of Horizon client cache hits",
  labelNames: ["operation"],
});

export const horizonCacheMissesTotal = new client.Counter({
  name: "horizon_cache_misses_total",
  help: "Total number of Horizon client cache misses",
  labelNames: ["operation"],
});

export const horizonCacheEntries = new client.Gauge({
  name: "horizon_cache_entries",
  help: "Current number of entries in the Horizon client response cache",
});

/**
 * Webhook Dispatcher Metrics
 */

export const webhookDispatchAttemptsTotal = new client.Counter({
  name: "webhook_dispatch_attempts_total",
  help: "Total number of webhook dispatch attempts",
  labelNames: ["event_type", "result", "status_code"],
});

export const webhookDispatchDuration = new client.Histogram({
  name: "webhook_dispatch_duration_seconds",
  help: "Time spent dispatching webhook requests",
  labelNames: ["event_type", "result"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

export const webhookDispatchRetriesTotal = new client.Counter({
  name: "webhook_dispatch_retries_total",
  help: "Total number of webhook retries scheduled by the dispatcher",
  labelNames: ["event_type", "reason"],
});

export const webhookDispatchBlockedTotal = new client.Counter({
  name: "webhook_dispatch_blocked_total",
  help: "Total number of webhook dispatches blocked before delivery",
  labelNames: ["event_type", "reason"],
});

/**
 * Smart Contract Oracle Integrator Metrics (Issue #TBD)
 */

export const oracleCacheHitTotal = new client.Counter({
  name: "oracle_cache_hit_total",
  help: "Total number of oracle cache hits",
  labelNames: ["provider"],
});

export const oracleCacheMissTotal = new client.Counter({
  name: "oracle_cache_miss_total",
  help: "Total number of oracle cache misses",
  labelNames: ["provider"],
});

export const oracleCacheSize = new client.Gauge({
  name: "oracle_cache_size",
  help: "Current number of entries in the oracle cache",
  labelNames: ["provider"],
});

export const oracleFetchDuration = new client.Histogram({
  name: "oracle_fetch_duration_seconds",
  help: "Time taken to fetch oracle data from provider",
  labelNames: ["provider", "result"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

export const oracleFetchErrorsTotal = new client.Counter({
  name: "oracle_fetch_errors_total",
  help: "Total number of oracle fetch errors",
  labelNames: ["provider", "error_type"],
});

export const oracleStaleDataServedTotal = new client.Counter({
  name: "oracle_stale_data_served_total",
  help: "Total number of times stale oracle data was served as fallback",
  labelNames: ["provider"],
});

export const oracleCircuitBreakerTripsTotal = new client.Counter({
  name: "oracle_circuit_breaker_trips_total",
  help: "Total number of times the oracle circuit breaker was tripped",
  labelNames: ["provider"],
});

/**
 * Admin Dashboard Service Metrics (granular per-endpoint request tracking)
 *
 * Labeled by `endpoint` (summary/revenue/volume) rather than merchant_id to
 * keep Prometheus label cardinality bounded - per-merchant breakdowns belong
 * in the business-facing responses these endpoints already return, not in
 * the internal request/latency series.
 */

export const dashboardMetricsRequestsTotal = new client.Counter({
  name: "dashboard_metrics_requests_total",
  help: "Total number of requests to Admin Dashboard Service endpoints",
  labelNames: ["endpoint", "status_code"],
});

export const dashboardMetricsRequestDuration = new client.Histogram({
  name: "dashboard_metrics_request_duration_seconds",
  help: "Time taken to serve Admin Dashboard Service endpoint requests",
  labelNames: ["endpoint"],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const dashboardMetricsErrorsTotal = new client.Counter({
  name: "dashboard_metrics_errors_total",
  help: "Total number of errors from Admin Dashboard Service endpoints",
  labelNames: ["endpoint", "error_type"],
});

// Register custom metrics
register.registerMetric(paymentCreatedCounter);
register.registerMetric(paymentConfirmedCounter);
register.registerMetric(paymentFailedCounter);
register.registerMetric(paymentConfirmationLatency);
register.registerMetric(pgPoolTotalConnections);
register.registerMetric(pgPoolIdleConnections);
register.registerMetric(pgPoolWaitingRequests);
register.registerMetric(pgPoolUtilizationPercent);
register.registerMetric(queryDuration);
register.registerMetric(queryRetryCount);
register.registerMetric(slowQueryCount);
register.registerMetric(signatureVerificationTotal);
register.registerMetric(signatureVerificationDuration);
register.registerMetric(signatureVerificationReplayAttempts);
register.registerMetric(txSignatureVerificationTotal);
register.registerMetric(txSignatureVerificationLatency);
register.registerMetric(txSignatureVerificationErrors);
register.registerMetric(txSignatureReplayAttempts);
register.registerMetric(txSignatureValidationFailures);
register.registerMetric(txSignatureCacheSize);
register.registerMetric(ledgerMonitorCycleDuration);
register.registerMetric(ledgerMonitorPaymentsChecked);
register.registerMetric(ledgerMonitorCircuitBreakerTrips);
register.registerMetric(ledgerMonitorBatchSize);
register.registerMetric(ledgerMonitorRateLimiterWaitSeconds);
register.registerMetric(rateLimitExceededTotal);
register.registerMetric(rateLimitRequestsTotal);
register.registerMetric(queryCacheHitTotal);
register.registerMetric(queryCacheMissTotal);
register.registerMetric(queryCacheSize);
register.registerMetric(dbPoolerRateLimitExceeded);
register.registerMetric(dbPoolerQueryTotal);
register.registerMetric(dbPoolerSignatureVerified);
register.registerMetric(exchangeRateQuoteRequests);
register.registerMetric(exchangeRateQuoteDuration);
register.registerMetric(exchangeRateHorizonCalls);
register.registerMetric(exchangeRateSourceAccountValidation);
register.registerMetric(exchangeRateSlippageApplied);
register.registerMetric(horizonCacheHitsTotal);
register.registerMetric(horizonCacheMissesTotal);
register.registerMetric(horizonCacheEntries);
register.registerMetric(webhookDispatchAttemptsTotal);
register.registerMetric(webhookDispatchDuration);
register.registerMetric(webhookDispatchRetriesTotal);
register.registerMetric(webhookDispatchBlockedTotal);
register.registerMetric(oracleCacheHitTotal);
register.registerMetric(oracleCacheMissTotal);
register.registerMetric(oracleCacheSize);
register.registerMetric(oracleFetchDuration);
register.registerMetric(oracleFetchErrorsTotal);
register.registerMetric(oracleStaleDataServedTotal);
register.registerMetric(oracleCircuitBreakerTripsTotal);
register.registerMetric(dashboardMetricsRequestsTotal);
register.registerMetric(dashboardMetricsRequestDuration);
register.registerMetric(dashboardMetricsErrorsTotal);

export { register };
