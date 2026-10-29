import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const command =
  process.platform === "win32"
    ? "npm.cmd exec -- supabase status --output json"
    : "npm exec -- supabase status --output json";
const output = execSync(command, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
const jsonStart = output.indexOf("{");
if (jsonStart === -1) {
  throw new Error(
    "Supabase status did not return local service configuration.",
  );
}

const status = JSON.parse(output.slice(jsonStart));
const projectUrl = status.API_URL;
const publishableKey = status.PUBLISHABLE_KEY;
if (
  typeof projectUrl !== "string" ||
  typeof publishableKey !== "string" ||
  !publishableKey.startsWith("sb_publishable_")
) {
  throw new Error(
    "Supabase status did not return a URL and publishable key. Start the local Supabase stack first.",
  );
}

const envPath = resolve(".env.local");
const existingLines = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter(
        (line) =>
          line.length > 0 &&
          !line.startsWith("VITE_SUPABASE_URL=") &&
          !line.startsWith("VITE_SUPABASE_PUBLISHABLE_KEY="),
      )
  : [];

existingLines.push(
  `VITE_SUPABASE_URL=${projectUrl}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
);
writeFileSync(envPath, `${existingLines.join("\n")}\n`, "utf8");
console.log("Wrote the local URL and publishable key to ignored .env.local.");
