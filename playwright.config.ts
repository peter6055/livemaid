import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/test",
  testMatch: "**/*.spec.ts",
  timeout: 30000,
  fullyParallel: true,
  retries: 1,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report" }]],
  globalSetup: require.resolve("./scripts/playwright-global-setup.mjs"),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3435",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
