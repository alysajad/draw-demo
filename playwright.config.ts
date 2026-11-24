import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  workers: 1,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
  },
  timeout: 90000,
  use: {
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ["--no-sandbox"] },
  },
});
