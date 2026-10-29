import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixturePath = resolve(
  projectRoot,
  "src/test-fixtures/playwright-json/generated.json",
);
const report = JSON.parse(await readFile(fixturePath, "utf8"));
const normalizedRoot = projectRoot.replaceAll("\\", "/");

function normalizePaths(value) {
  if (typeof value === "string") {
    return value
      .replaceAll(projectRoot, "<project>")
      .replaceAll(normalizedRoot, "<project>");
  }
  if (Array.isArray(value)) {
    return value.map(normalizePaths);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizePaths(child)]),
    );
  }
  return value;
}

report.config.argv = [];
report.config.configFile = "playwright.fixtures.config.ts";
report.config.rootDir = "scripts/fixture-tests";

const sanitized = JSON.stringify(normalizePaths(report));
const formatted = await prettier.format(sanitized, { parser: "json" });
await writeFile(fixturePath, formatted, "utf8");
