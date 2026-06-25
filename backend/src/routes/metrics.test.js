import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireApiKeyAuth,
  mockAuthMiddleware,
  mockGetMonthlySummary,
  mockGetRevenueByAsset,
  mockGetVolumeOverTime,
} = vi.hoisted(() => ({
  mockAuthMiddleware: (req, _res, next) => {
    req.merchant = { id: "merchant_123" };
    next();
  },
  mockRequireApiKeyAuth: vi.fn(),
  mockGetMonthlySummary: vi.fn(),
  mockGetRevenueByAsset: vi.fn(),
  mockGetVolumeOverTime: vi.fn(),
}));

vi.mock("../lib/auth.js", () => ({
  requireApiKeyAuth: mockRequireApiKeyAuth,
}));

vi.mock("../services/metricService.js", () => ({
  metricService: {
    getMonthlySummary: mockGetMonthlySummary,
    getRevenueByAsset: mockGetRevenueByAsset,
    getVolumeOverTime: mockGetVolumeOverTime,
  },
}));

import createMetricsRouter from "./metrics.js";

function createApp({ dashboardMetricsRateLimit } = {}) {
  const app = express();
  app.use(express.json());
  app.locals.pool = {};
  app.use("/api", createMetricsRouter({ dashboardMetricsRateLimit }));
  return app;
}

describe("Metrics (Admin Dashboard) routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiKeyAuth.mockReturnValue(mockAuthMiddleware);
  });

  it("requires a signed API key request (requireApiKeyAuth invoked with requireSignature: true)", async () => {
    mockGetMonthlySummary.mockResolvedValue({ last_month: {}, current_month: {} });

    const app = createApp({ dashboardMetricsRateLimit: (_req, _res, next) => next() });
    await request(app).get("/api/metrics/summary");

    expect(mockRequireApiKeyAuth).toHaveBeenCalledWith({ requireSignature: true });
  });

  it("returns 429 when the dashboard rate limit rejects the request", async () => {
    const rateLimited = (_req, res) =>
      res.status(429).json({ error: "Too many dashboard requests, please try again later." });

    const app = createApp({ dashboardMetricsRateLimit: rateLimited });
    const response = await request(app).get("/api/metrics/revenue");

    expect(response.status).toBe(429);
    expect(mockGetRevenueByAsset).not.toHaveBeenCalled();
  });

  it("GET /api/metrics/summary returns the monthly summary for the authenticated merchant", async () => {
    mockGetMonthlySummary.mockResolvedValue({
      last_month: { by_asset: [], total: 0 },
      current_month: { by_asset: [], total: 0 },
    });

    const app = createApp({ dashboardMetricsRateLimit: (_req, _res, next) => next() });
    const response = await request(app).get("/api/metrics/summary");

    expect(response.status).toBe(200);
    expect(mockGetMonthlySummary).toHaveBeenCalledWith(expect.anything(), "merchant_123");
  });

  it("GET /api/metrics/volume validates the range query param", async () => {
    const app = createApp({ dashboardMetricsRateLimit: (_req, _res, next) => next() });
    const response = await request(app).get("/api/metrics/volume?range=BOGUS");

    expect(response.status).toBe(400);
    expect(mockGetVolumeOverTime).not.toHaveBeenCalled();
  });

  it("GET /api/metrics/volume delegates to metricService for a valid range", async () => {
    mockGetVolumeOverTime.mockResolvedValue({ range: "7D", assets: [], data: [] });

    const app = createApp({ dashboardMetricsRateLimit: (_req, _res, next) => next() });
    const response = await request(app).get("/api/metrics/volume?range=7D");

    expect(response.status).toBe(200);
    expect(mockGetVolumeOverTime).toHaveBeenCalledWith(expect.anything(), "merchant_123", "7D");
  });
});
