import express from "express";
import { requireApiKeyAuth } from "../lib/auth.js";
import { validateRequest } from "../lib/validation.js";
import { metricsVolumeQuerySchema } from "../lib/request-schemas.js";
import { metricService } from "../services/metricService.js";
import { createDashboardMetricsRateLimit } from "../lib/rate-limit.js";

const defaultDashboardMetricsRateLimit = createDashboardMetricsRateLimit();

/**
 * Admin Dashboard Service routes (revenue summary, revenue by asset, volume
 * over time). All routes require a signed, rate-limited API key request:
 *  - requireApiKeyAuth({ requireSignature: true }) enforces HMAC request
 *    signing via the existing x-api-signature/x-api-timestamp headers
 *    (issue #928).
 *  - dashboardMetricsRateLimit caps how often a merchant can poll these
 *    aggregate queries (issue #927).
 */
function createMetricsRouter({
  dashboardMetricsRateLimit = defaultDashboardMetricsRateLimit,
} = {}) {
  const router = express.Router();

  /**
   * @swagger
   * /api/metrics/summary:
   *   get:
   *     summary: Get monthly revenue summary grouped by asset
   *     tags: [Metrics]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       429:
   *         description: Rate limit exceeded
   */
  router.get(
    "/metrics/summary",
    requireApiKeyAuth({ requireSignature: true }),
    dashboardMetricsRateLimit,
    async (req, res, next) => {
      try {
        const pool = req.app.locals.pool;
        const result = await metricService.getMonthlySummary(pool, req.merchant.id);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * @swagger
   * /api/metrics/revenue:
   *   get:
   *     summary: Get aggregate revenue by asset
   *     tags: [Metrics]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       429:
   *         description: Rate limit exceeded
   */
  router.get(
    "/metrics/revenue",
    requireApiKeyAuth({ requireSignature: true }),
    dashboardMetricsRateLimit,
    async (req, res, next) => {
      try {
        const pool = req.app.locals.pool;
        const result = await metricService.getRevenueByAsset(pool, req.merchant.id);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * @swagger
   * /api/metrics/volume:
   *   get:
   *     summary: Get per-asset daily volume for a time range
   *     tags: [Metrics]
   *     security:
   *       - ApiKeyAuth: []
   *     responses:
   *       429:
   *         description: Rate limit exceeded
   */
  router.get(
    "/metrics/volume",
    requireApiKeyAuth({ requireSignature: true }),
    dashboardMetricsRateLimit,
    validateRequest({ query: metricsVolumeQuerySchema }),
    async (req, res, next) => {
      try {
        const pool = req.app.locals.pool;
        const result = await metricService.getVolumeOverTime(
          pool,
          req.merchant.id,
          req.query.range,
        );
        res.json(result);
      } catch (err) {
        if (err.message.includes("Invalid range")) {
          return res.status(400).json({ error: err.message });
        }
        next(err);
      }
    },
  );

  return router;
}

export default createMetricsRouter;
