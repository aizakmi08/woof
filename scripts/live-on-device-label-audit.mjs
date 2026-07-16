import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = path.join(ROOT, "scripts", "fixtures", "live-label-lookup-cases.json");
const IMAGE_DIR = path.join(ROOT, "outputs", "live-label-audit", "images");
const OUTPUT_PATH = path.join(ROOT, "outputs", "live-label-audit", "on-device-report.json");
const MATCHING_PATH = path.join(ROOT, "services", "labelOcrMatching.js");
const SIMULATOR_ID = process.env.WOOF_SIMULATOR_ID || "booted";
const BUNDLE_ID = process.env.WOOF_BUNDLE_ID || "io.woof.app";
const P95_TARGET_MS = 3_000;
const REQUESTED_IDS = new Set(
  compact(process.env.WOOF_LABEL_AUDIT_IDS).split(",").map(compact).filter(Boolean)
);

const SWIFT_OCR = `
import Foundation
import Vision
let imageUrl = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]
request.usesLanguageCorrection = true
request.minimumTextHeight = 0.012
let startedAt = CFAbsoluteTimeGetCurrent()
try VNImageRequestHandler(url: imageUrl, options: [:]).perform([request])
let candidates = (request.results ?? []).compactMap { $0.topCandidates(1).first }
let lines = candidates.map { ["text": $0.string, "confidence": Double($0.confidence)] as [String: Any] }
let payload: [String: Any] = [
  "text": candidates.map { $0.string }.joined(separator: "\\n"),
  "lines": lines,
  "durationMs": (CFAbsoluteTimeGetCurrent() - startedAt) * 1000,
]
let data = try JSONSerialization.data(withJSONObject: payload)
print(String(data: data, encoding: .utf8)!)
`;

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
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(compact(result.stderr || result.stdout || `${command} failed`));
  }
  return result.stdout.trim();
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
    const filename = crypto.createHash("md5").update(storageKey).digest("hex");
    rawSession = await fsp.readFile(path.join(storageDir, filename), "utf8");
  }
  const session = recursivelyParseJson(rawSession);
  const accessToken = compact(session?.access_token || session?.currentSession?.access_token);
  if (!accessToken) throw new Error("The selected simulator does not contain a signed-in Supabase session.");
  return accessToken;
}

async function loadMatchingApi() {
  const source = await fsp.readFile(MATCHING_PATH, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function recognizeImage(imagePath) {
  return JSON.parse(commandOutput("xcrun", ["swift", "-e", SWIFT_OCR, imagePath]));
}

async function callSearchRpc({ supabaseUrl, anonKey, accessToken, functionName, body: requestBody }) {
  const startedAt = performance.now();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-client-info": "woof-on-device-label-audit/1.0",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(8_000),
  });
  const elapsedMs = performance.now() - startedAt;
  const body = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(compact(body?.message || body?.error || `OCR batch search returned HTTP ${response.status}`));
  }
  return { rows: Array.isArray(body) ? body : [], elapsedMs };
}

async function searchCatalog({ supabaseUrl, anonKey, accessToken, ocrText, queries, matching }) {
  const primary = await callSearchRpc({
    supabaseUrl,
    anonKey,
    accessToken,
    functionName: "search_verified_products",
    body: { q: queries[0], max_results: 25 },
  });
  const primaryRanked = matching.rankProductsForOcr(
    matching.filterProductsForOcr(primary.rows.map(normalizeProduct), ocrText),
    ocrText
  );
  if (primaryRanked[0]?.ocrMatchScore >= 0.34) {
    return { ...primary, path: "primary", primaryTopScore: primaryRanked[0].ocrMatchScore };
  }

  const broad = await callSearchRpc({
    supabaseUrl,
    anonKey,
    accessToken,
    functionName: "search_verified_products_for_label_ocr_text",
    body: { ocr_text: ocrText, max_results: 96 },
  });
  return {
    rows: broad.rows,
    elapsedMs: primary.elapsedMs + broad.elapsedMs,
    path: "broad",
    primaryTopScore: primaryRanked[0]?.ocrMatchScore || 0,
  };
}

function normalizeProduct(row) {
  return {
    cacheKey: compact(row.cache_key),
    productName: compact(row.product_name),
    brand: compact(row.brand),
    gtin: compact(row.gtin),
    productLine: compact(row.product_line),
    flavor: compact(row.flavor),
    lifeStage: compact(row.life_stage),
    foodForm: compact(row.food_form),
    packageSize: compact(row.package_size),
    petType: compact(row.pet_type),
    rank: Number(row.rank) || 0,
  };
}

function fixtureMatchesProduct(fixture, product) {
  if (fixture.cache_key === product.cacheKey) return true;
  const identity = normalized([product.brand, product.productName, product.productLine, product.flavor].join(" "));
  return fixture.expected_terms.every((term) => identity.includes(normalized(term)));
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] || null;
}

const supabaseUrl = compact(process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL);
const anonKey = compact(process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
if (!supabaseUrl || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const accessToken = await simulatorAccessToken(projectRef);
const matching = await loadMatchingApi();
const allFixtures = JSON.parse(await fsp.readFile(FIXTURE_PATH, "utf8"));
const fixtures = REQUESTED_IDS.size > 0
  ? allFixtures.filter((fixture) => REQUESTED_IDS.has(fixture.id))
  : allFixtures;
const cases = [];

for (const fixture of fixtures) {
  const imagePath = path.join(IMAGE_DIR, `${fixture.id}.jpg`);
  if (!fs.existsSync(imagePath)) throw new Error(`Missing fixture image: ${imagePath}`);

  const harnessStartedAt = performance.now();
  const ocr = recognizeImage(imagePath);
  const queries = matching.labelOcrSearchQueries(ocr.text, ocr.lines);
  const search = await searchCatalog({
    supabaseUrl,
    anonKey,
    accessToken,
    ocrText: matching.normalizeLabelOcrText(ocr.text),
    queries,
    matching,
  });
  const rankingStartedAt = performance.now();
  const ranked = matching.rankProductsForOcr(
    matching.filterProductsForOcr(search.rows.map(normalizeProduct), ocr.text),
    ocr.text
  );
  const selected = matching.pickVerifiedProductForOcr(ranked, ocr.text);
  const expectedIndex = ranked.findIndex((product) => fixtureMatchesProduct(fixture, product));
  const rankingMs = performance.now() - rankingStartedAt;
  // The app ships compiled Vision code; exclude `swift -e` compilation and
  // process startup while retaining it separately as harness wall-clock time.
  const totalMs = (Number(ocr.durationMs) || 0) + search.elapsedMs + rankingMs;
  const harnessWallClockMs = performance.now() - harnessStartedAt;
  const passed = expectedIndex >= 0 && expectedIndex < 5;

  cases.push({
    id: fixture.id,
    passed,
    expectedRank: expectedIndex >= 0 ? expectedIndex + 1 : null,
    autoOpenedExpected: Boolean(selected && fixtureMatchesProduct(fixture, selected)),
    selectedCacheKey: selected?.cacheKey || null,
    topCacheKey: ranked[0]?.cacheKey || null,
    resultCount: ranked.length,
    queryCount: queries.length,
    resolutionPath: search.path,
    primaryTopScore: search.primaryTopScore,
    ocrMs: Math.round(Number(ocr.durationMs) || 0),
    searchMs: Math.round(search.elapsedMs),
    rankingMs: Math.round(rankingMs),
    totalMs: Math.round(totalMs),
    harnessWallClockMs: Math.round(harnessWallClockMs),
    ocrText: ocr.text,
  });
  console.log(`${passed ? "PASS" : "FAIL"} ${fixture.id} rank=${expectedIndex >= 0 ? expectedIndex + 1 : "-"} path=${search.path} score=${Number(search.primaryTopScore || 0).toFixed(2)} ocr=${Math.round(ocr.durationMs)}ms search=${Math.round(search.elapsedMs)}ms pipeline=${Math.round(totalMs)}ms harness=${Math.round(harnessWallClockMs)}ms`);
}

const totals = cases.map((testCase) => testCase.totalMs);
const summary = {
  generatedAt: new Date().toISOString(),
  passed: cases.filter((testCase) => testCase.passed).length,
  total: cases.length,
  accuracy: cases.filter((testCase) => testCase.passed).length / cases.length,
  autoOpenedExpected: cases.filter((testCase) => testCase.autoOpenedExpected).length,
  p50Ms: Math.round(percentile(totals, 0.5)),
  p95Ms: Math.round(percentile(totals, 0.95)),
  p95HarnessWallClockMs: Math.round(percentile(cases.map((testCase) => testCase.harnessWallClockMs), 0.95)),
  targetP95Ms: P95_TARGET_MS,
};
await fsp.writeFile(OUTPUT_PATH, `${JSON.stringify({ summary, cases }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (summary.passed !== summary.total || summary.p95Ms > P95_TARGET_MS) process.exitCode = 1;
