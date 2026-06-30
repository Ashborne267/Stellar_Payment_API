import { ZodError } from "zod";

/**
 * Express middleware to validate request body, query, and params using Zod schemas.
 * 
 * @param {Object} schemas - Object containing Zod schemas for validation
 * @param {import("zod").ZodSchema} schemas.body - Validation schema for req.body
 * @param {import("zod").ZodSchema} schemas.query - Validation schema for req.query
 * @param {import("zod").ZodSchema} schemas.params - Validation schema for req.params
 */
export const validateRequest = (schemas) => async (req, res, next) => {
  try {
    if (schemas.body) {
      req.body = await schemas.body.parseAsync(req.body || {});
    }
    
    if (schemas.query) {
      req.query = await schemas.query.parseAsync(req.query || {});
    }
    
    if (schemas.params) {
      req.params = await schemas.params.parseAsync(req.params || {});
    }
    
    return next();
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        errors: error.format(),
      });
    }
    
    return next(error);
  }
};
