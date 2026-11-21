import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      ANTHROPIC_API_KEY: "",
      ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      DISABLE_SCHEDULER: "1",
    },
  },
});
