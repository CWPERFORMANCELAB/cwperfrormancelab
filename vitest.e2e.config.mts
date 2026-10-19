import path from "node:path";
import { defineConfig } from "vitest/config";

/** End-to-end tests against the real production build (`npm run test:e2e`). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    globalSetup: ["tests/e2e/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@config": path.resolve(import.meta.dirname, "config"),
      "@content": path.resolve(import.meta.dirname, "content"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
});
