import path from "node:path";
import { fileURLToPath } from "node:url";
import swaggerJsdoc from "swagger-jsdoc";

const swaggerFilePath = fileURLToPath(import.meta.url);
const swaggerDirectory = path.dirname(swaggerFilePath);
const routeGlobs = [path.join(swaggerDirectory, "routes/*.js")];

export function createSwaggerDefinition({
  serverUrl = "http://localhost:4000",
} = {}) {
  return {
    openapi: "3.0.0",
    info: {
      title: "Stellar Payment API",
      version: "0.1.0",
      description: "API for creating and verifying Stellar network payments. Accept Stellar-based payments with simple links and status tracking.",
      contact: {
        name: "Stellar Payment API Support",
        url: "https://github.com/emdevelopa/Stellar_Payment_API",
      },
      license: {
        name: "MIT",
      },
    },
    servers: [
      { 
        url: serverUrl,
        description: "API Server"
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "API Key for authenticating merchant requests. Obtain this key when registering a merchant.",
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
    tags: [
      {
        name: "Payments",
        description: "Payment creation and verification endpoints",
      },
      {
        name: "Merchants",
        description: "Merchant account and API key management",
      },
      {
        name: "Webhooks",
        description: "Webhook configuration and delivery logs",
      },
      {
        name: "Metrics",
        description: "Payment metrics and analytics",
      },
    ],
  };
}

export function createSwaggerSpec(options = {}) {
  return swaggerJsdoc({
    definition: createSwaggerDefinition(options),
    apis: routeGlobs,
  });
}

export const swaggerDocument = createSwaggerSpec();
