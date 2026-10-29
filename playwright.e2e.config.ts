import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "import-flow.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command:
      "npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
