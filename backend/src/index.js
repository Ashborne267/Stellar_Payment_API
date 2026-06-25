import 'dotenv/config';
import { randomUUID } from "crypto";
import cors from "cors";

import express from "express";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { ZodError } from "zod";
import createPaymentsRouter from "./routes/payments.js";
import createMerchantsRouter from "./routes/merchants.js";
import webhooksRouter from "./routes/webhooks.js";
import metricsRouter from "./routes/metrics.js";
import authRouter from "./routes/auth.js";
import auditRouter from "./routes/audit.js";
import { requireApiKeyAuth } from "./lib/auth.js";
import { isHorizonReachable } from "./lib/stellar.js";
import { supabase } from "./lib/supabase.js";
import { pool, closePool } from "./lib/db.js";
import { validateEnvironmentVariables } from "./lib/env-validation.js";
import {
  getSecurityHeaders,
  sanitizeRequest,
  errorHandler,
  rateLimiters,
} from "./lib/security.js";
import { formatZodError } from "./lib/request-schemas.js";
import { idempotencyMiddleware } from "./lib/idempotency.js";
import { closeRedisClient, connectRedisClient } from "./lib/redis.js";
import {
  createRedisRateLimitStore,
  createVerifyPaymentRateLimit,
  createMerchantRegistrationRateLimit,
} from "./lib/rate-limit.js";
import { createSwaggerSpec } from "./swagger.js";

validateEnvironmentVariables();

const redisClient = await connectRedisClient();
const verifyPaymentRateLimit = createVerifyPaymentRateLimit({
  store: createRedisRateLimitStore({ client: redisClient }),
});
const merchantRegistrationRateLimit = createMerchantRegistrationRateLimit({
  store: createRedisRateLimitStore({ client: redisClient }),
});

const app = express();
const port = process.env.PORT || 4000;

// Make the pool available to all routes via req.app.locals.pool
app.locals.pool = pool;

const swaggerSpec = createSwaggerSpec({
  serverUrl: `http://localhost:${port}`,
});

// ============================================================================
// SECURITY MIDDLEWARE (applied before routes)
// ============================================================================

// Attach a unique x-request-id to every request/response for tracing
app.use((req, res, next) => {
  const requestId = (req.headers["x-request-id"] || randomUUID());
  req.id = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

// Custom morgan token so request IDs appear in every log line
morgan.token("request-id", (req) => req.id);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Apply security headers first
app.use(getSecurityHeaders());

// Apply global rate limiting as early as possible
app.use(rateLimiters.global);

// CORS configuration
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without origin (mobile apps, curl, etc)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Log suspicious CORS violations
        console.warn(`[SECURITY] CORS violation attempted from: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-api-key"],
    maxAge: 3600,
  })
);

// Body parsing with strict size limit
app.use(express.json({ limit: "1mb" }));

// Request sanitization
app.use(sanitizeRequest);

// Request logging with Morgan
app.use(
  morgan(":request-id :method :url :status :response-time ms")
);

// Swagger UI (only in development)
if (process.env.NODE_ENV !== "production") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.get("/health", async (req, res) => {
  try {
    const [dbResult, horizonReachable] = await Promise.all([
      supabase.from("merchants").select("id").limit(1),
      isHorizonReachable(),
    ]);

    const { error } = dbResult;

    if (error) {
      return res.status(503).json({
        ok: false,
        service: "stellar-payment-api",
        error: "Database unavailable",
        horizon_reachable: horizonReachable,
      });
    }

    if (!horizonReachable) {
      return res.status(503).json({
        ok: false,
        service: "stellar-payment-api",
        error: "Horizon unavailable",
        horizon_reachable: false,
      });
    }

    res.json({
      ok: true,
      service: "stellar-payment-api",
      horizon_reachable: true,
    });
  } catch {
    res.status(503).json({
      ok: false,
      service: "stellar-payment-api",
      error: "Health check failed",
      horizon_reachable: false,
    });
  }
});

// ============================================================================
// ROUTES
// ============================================================================

// Apply authentication rate limiter to merchant registration
app.post("/api/register-merchant", rateLimiters.auth);

// Apply authentication rate limiter to key rotation
app.post("/api/rotate-key", rateLimiters.auth, requireApiKeyAuth());

// Apply API rate limiter to create-payment
app.post("/api/create-payment", rateLimiters.api, requireApiKeyAuth());

// Apply verification rate limiter to payment verification endpoints
app.post("/api/verify-payment/:id", rateLimiters.verification);

// Idempotency middleware for critical endpoints
app.use("/api/create-payment", idempotencyMiddleware);
app.use("/api/sessions", idempotencyMiddleware);

// Mount routers
app.use("/api", createPaymentsRouter());
app.use("/api", createMerchantsRouter());
app.use("/api", webhooksRouter);
app.use("/api", metricsRouter);
app.use("/api", authRouter);
app.use("/api", auditRouter);

// ============================================================================
// ERROR HANDLING (must be last)
// ============================================================================

// Zod validation error handler
app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: formatZodError(err),
    });
  }

  const status = err.status || 500;
  let errorMessage;

  if (process.env.NODE_ENV === "production" && status >= 500) {
    errorMessage = "An unexpected error occurred. Please try again later.";
    console.error("Unhandled Production Server Error:", err);
  } else {
    errorMessage = err.message || "Internal Server Error";
    console.error("Unhandled Error:", err);
  }

  res.status(status).json({
    error: errorMessage,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found"

// Global error handler (must be last)
app.use(errorHandler);

// ============================================================================
// DATABASE AND SERVER STARTUP
// ============================================================================

// Verify pg pool reaches Postgres before accepting traffic
pool
  .query("SELECT 1")
  .then(() => {
    console.log("✅ pg pool connected (Supabase pooler)");
  })
  .catch((err) => {
    console.warn("⚠️  pg pool probe failed — check DATABASE_URL:", err.message);
  });

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown: drain in-flight queries then exit
function shutdown(signal) {
  console.log(`${signal} received — closing server and pg pool...`);
  server.close(async () => {
    await closePool();
    await closeRedisClient();
    console.log("pg pool closed. Goodbye.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
