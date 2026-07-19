import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/test",
  testMatch: "**/*.spec.ts",
  timeout: 30000,
  fullyParallel: true,
  retries: 1,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3435",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run test:dev",
    port: 3435,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
