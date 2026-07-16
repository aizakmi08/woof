import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = path.join(ROOT, "scripts", "fixtures", "store-scan-screenshot-cases.json");
const OUTPUT_DIR = path.join(ROOT, "outputs", "store-scan-screenshot-audit");
const INPUT_DIR = path.resolve(process.env.WOOF_STORE_SCAN_SCREENSHOT_DIR || path.join(os.homedir(), "Downloads"));
const SIMULATOR_ID = process.env.WOOF_SIMULATOR_ID || "booted";
const BUNDLE_ID = process.env.WOOF_BUNDLE_ID || "io.woof.app";
const REQUESTED_IDS = new Set(
  compact(process.env.WOOF_STORE_SCAN_IDS).split(",").map(compact).filter(Boolean)
);

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return compact(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(compact(result.stderr || result.stdout || `${command} failed`));
  }
  return compact(result.stdout);
}

function recursivelyParseJson(value) {
  let current = value;
  for (let attempt = 0; attempt < 3 && typeof current === "string"; attempt += 1) {
    current = JSON.parse(current);
  }
  return current;
}

async function simulatorAccessToken(projectRef) {
  const appData = commandOutput("xcrun", ["simctl", "get_app_container", SIMULATOR_ID, BUNDLE_ID, "data"]);
  const storageDir = path.join(appData, "Library", "Application Support", BUNDLE_ID, "RCTAsyncLocalStorage_V1");
  const manifest = JSON.parse(await fsp.readFile(path.join(storageDir, "manifest.json"), "utf8"));
  const storageKey = `sb-${projectRef}-auth-token`;
  let rawSession = manifest[storageKey];
  if (rawSession === null) {
    rawSession = await fsp.readFile(path.join(storageDir, crypto.createHash("md5").update(storageKey).digest("hex")), "utf8");
  }
  const session = recursivelyParseJson(rawSession);
  const accessToken = compact(session?.access_token || session?.currentSession?.access_token);
  if (!accessToken) throw new Error("The booted simulator does not contain a signed-in Woof session.");
  return accessToken;
}

async function jpegForFixture(fixture) {
  const inputPath = path.join(INPUT_DIR, fixture.file);
  if (!fs.existsSync(inputPath)) throw new Error(`Missing screenshot: ${inputPath}`);
  const outputPath = path.join(OUTPUT_DIR, `${fixture.id}.jpg`);
  commandOutput("sips", [
    "-s", "format", "jpeg",
    "-s", "formatOptions", "72",
    "-Z", "1280",
    inputPath,
    "--out", outputPath,
  ]);
  return outputPath;
}

async function identify({ supabaseUrl, anonKey, accessToken, imagePath }) {
  const imageBase64 = (await fsp.readFile(imagePath)).toString("base64");
  const startedAt = performance.now();
  const response = await fetch(`${supabaseUrl}/functions/v1/label-lookup`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-client-info": "woof-store-scan-screenshot-audit/1.0",
    },
    body: JSON.stringify({ imageBase64 }),
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(compact(body?.error || `Label lookup returned HTTP ${response.status}`));
  return { body, durationMs: Math.round(performance.now() - startedAt) };
}

function evaluate(fixture, identification) {
  const identity = normalized([
    identification.brand,
    identification.productLine,
    identification.productName,
    identification.flavor,
    identification.lifeStage,
    identification.foodForm,
    identification.petType,
  ].join(" "));
  const missingTerms = fixture.terms.filter((term) => !identity.includes(normalized(term)));
  const petTypeMatches = !fixture.petType || identification.petType === fixture.petType;
  const normalizedForm = normalized(identification.foodForm).replace(/\s+/g, "-");
  const foodFormMatches = !fixture.foodForm || normalizedForm.includes(normalized(fixture.foodForm).replace(/\s+/g, "-"));
  const identityMatches = identification.found === true && missingTerms.length === 0;
  const passed = fixture.expectedStatus === "excluded"
    ? identityMatches
    : identityMatches && petTypeMatches && foodFormMatches;
  return {
    passed,
    missingTerms,
    petTypeMatches,
    foodFormMatches,
  };
}

const supabaseUrl = compact(process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL);
const anonKey = compact(process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
if (!supabaseUrl || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");

await fsp.mkdir(OUTPUT_DIR, { recursive: true });
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const accessToken = await simulatorAccessToken(projectRef);
const allFixtures = JSON.parse(await fsp.readFile(FIXTURE_PATH, "utf8"));
const fixtures = REQUESTED_IDS.size > 0
  ? allFixtures.filter((fixture) => REQUESTED_IDS.has(fixture.id))
  : allFixtures;
const cases = [];

for (const fixture of fixtures) {
  try {
    const imagePath = await jpegForFixture(fixture);
    const lookup = await identify({ supabaseUrl, anonKey, accessToken, imagePath });
    const evaluation = evaluate(fixture, lookup.body);
    cases.push({ id: fixture.id, expectedStatus: fixture.expectedStatus || "verified_match", ...evaluation, durationMs: lookup.durationMs, identification: lookup.body });
    console.log(`${evaluation.passed ? "PASS" : "FAIL"} ${fixture.id} ${lookup.durationMs}ms`);
  } catch (error) {
    cases.push({ id: fixture.id, passed: false, error: compact(error.message) });
    console.log(`FAIL ${fixture.id} ${compact(error.message)}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  passed: cases.filter((testCase) => testCase.passed).length,
  total: cases.length,
  cases,
};
await fsp.writeFile(path.join(OUTPUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, total: report.total }, null, 2));
if (report.passed !== report.total) process.exitCode = 1;
