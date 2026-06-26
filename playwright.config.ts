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
    baseURL: "http://localhost:3434",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- -p 3434",
    port: 3434,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
