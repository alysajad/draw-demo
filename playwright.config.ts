import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 90000,
  use: {
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ["--no-sandbox"] },
  },
});
