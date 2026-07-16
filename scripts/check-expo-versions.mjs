import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function expoBinaryPath() {
  const basePath = path.join("node_modules", ".bin", process.platform === "win32" ? "expo.cmd" : "expo");
  assert(
    fs.existsSync(basePath),
    "Expo CLI binary is missing. Run npm ci before npm run check:expo-versions."
  );
  return basePath;
}

function parseJsonOutput(output) {
  const starts = [...output.matchAll(/\{/g)].map((match) => match.index);
  for (const start of starts) {
    try {
      return JSON.parse(output.slice(start));
    } catch {
      // Expo/dotenv can print tips containing object-like snippets before JSON.
    }
  }
  throw new Error("Expo install check did not print parseable JSON output");
}

const result = spawnSync(
  expoBinaryPath(),
  ["install", "--check", "--json"],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ""}`,
    },
  }
);

const output = `${result.stdout}\n${result.stderr}`;
const check = parseJsonOutput(output);
const mismatches = check.dependencies || [];

if (mismatches.length > 0) {
  console.error("Expo SDK package version check failed:");
  for (const mismatch of mismatches) {
    console.error(
      `- ${mismatch.packageName}: expected ${mismatch.expectedVersionOrRange}, found ${mismatch.actualVersion}`
    );
  }
  process.exit(1);
}

assert(check.upToDate === true, "Expo install check did not report upToDate=true");

console.log("Expo package version check passed");
