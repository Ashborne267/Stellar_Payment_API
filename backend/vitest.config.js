import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "stellar-sdk": path.resolve(__dirname, "./node_modules/stellar-sdk")
    }
  },
  test: {
    environment: "node",
    globals: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Silence noisy pino / pino-pretty logs during test runs
    silent: true,
  },
});
