import { beforeEach, describe, expect, it, vi } from "vitest";

const eq = vi.fn();
const is = vi.fn();
const maybeSingle = vi.fn();

const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  is: vi.fn(() => chain),
  maybeSingle,
};

const update = vi.fn(() => chain);
const from = vi.fn(() => chain);

vi.mock("../lib/supabase.js", () => ({
  supabase: { from },
}));

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("API Key Rotation and Expiry - Auth Integration", () => {
    let requireApiKeyAuth;
    
    beforeEach(async () => {
        vi.clearAllMocks();
        const { createApiKeyAuth } = await import("../lib/auth.js");
        // Mock usageRecorder to avoid Redis connection attempts in tests
        const usageRecorder = vi.fn().mockResolvedValue(undefined);
        requireApiKeyAuth = createApiKeyAuth({ 
            supabaseClient: { from },
            usageRecorder
        });
    });

    it("allows authentication with the current API key", async () => {
        const req = { get: vi.fn().mockReturnValue("sk_current_123") };
        const res = createResponse();
        const next = vi.fn();

        maybeSingle.mockResolvedValueOnce({
            data: {
                id: "m1",
                api_key: "sk_current_123",
                api_key_expires_at: null
            },
            error: null
        });

        await requireApiKeyAuth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.merchant.id).toBe("m1");
    });

    it("allows authentication with the old API key within grace period", async () => {
        const req = { get: vi.fn().mockReturnValue("sk_old_123") };
        const res = createResponse();
        const next = vi.fn();

        // 1. Current key lookup fails
        maybeSingle.mockResolvedValueOnce({ data: null, error: null });
        
        // 2. Old key lookup succeeds
        const futureExpiry = new Date(Date.now() + 3600000).toISOString();
        maybeSingle.mockResolvedValueOnce({
            data: {
                id: "m1",
                api_key: "sk_new_123",
                api_key_old: "sk_old_123",
                api_key_old_expires_at: futureExpiry
            },
            error: null
        });

        await requireApiKeyAuth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.merchant.id).toBe("m1");
    });

    it("rejects authentication with the old API key after grace period", async () => {
        const req = { get: vi.fn().mockReturnValue("sk_old_expired") };
        const res = createResponse();
        const next = vi.fn();

        // 1. Current key lookup fails
        maybeSingle.mockResolvedValueOnce({ data: null, error: null });
        
        // 2. Old key lookup succeeds but it's expired
        const pastExpiry = new Date(Date.now() - 3600000).toISOString();
        maybeSingle.mockResolvedValueOnce({
            data: {
                id: "m1",
                api_key_old: "sk_old_expired",
                api_key_old_expires_at: pastExpiry
            },
            error: null
        });

        await requireApiKeyAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "API_KEY_EXPIRED" }));
        expect(next).not.toHaveBeenCalled();
    });

    it("rejects authentication with an expired current key", async () => {
        const req = { get: vi.fn().mockReturnValue("sk_expired_current") };
        const res = createResponse();
        const next = vi.fn();

        const pastExpiry = new Date(Date.now() - 3600000).toISOString();
        maybeSingle.mockResolvedValueOnce({
            data: {
                id: "m1",
                api_key: "sk_expired_current",
                api_key_expires_at: pastExpiry
            },
            error: null
        });

        await requireApiKeyAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "API_KEY_EXPIRED" }));
        expect(next).not.toHaveBeenCalled();
    });
});
