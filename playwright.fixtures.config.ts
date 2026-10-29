import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./scripts/fixture-tests",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results/fixtures",
  reporter: [
    [
      "json",
      { outputFile: "src/test-fixtures/playwright-json/generated.json" },
    ],
  ],
  retries: 1,
  workers: 1,
});
