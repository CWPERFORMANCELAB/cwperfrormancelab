import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "**/node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { PGLITE_MEMORY: "1", NODE_ENV: "test" },
    // PGlite instances are per-process; keep DB suites isolated.
    pool: "forks",
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
