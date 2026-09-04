import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = path.join(ROOT, "scripts", "fixtures", "live-label-lookup-cases.json");
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "outputs", "live-label-audit");
const MAX_IMAGE_BASE64_LENGTH = 2_400_000;
const DEFAULT_SIMULATOR_ID = "booted";
const DEFAULT_BUNDLE_ID = "io.woof.app";
const DEFAULT_LIMIT = 12;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_P95_TARGET_MS = 3_000;

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return compact(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {
    bundleId: DEFAULT_BUNDLE_ID,
    concurrency: DEFAULT_CONCURRENCY,
    ids: [],
    limit: DEFAULT_LIMIT,
    outputDir: DEFAULT_OUTPUT_DIR,
    p95TargetMs: DEFAULT_P95_TARGET_MS,
    simulatorId: DEFAULT_SIMULATOR_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--bundle-id" && value) args.bundleId = value;
    else if (flag === "--concurrency" && value) args.concurrency = parsePositiveInteger(value, args.concurrency);
    else if (flag === "--limit" && value) args.limit = parsePositiveInteger(value, args.limit);
    else if (flag === "--ids" && value) args.ids.push(...value.split(",").map(compact).filter(Boolean));
    else if (flag === "--output-dir" && value) args.outputDir = path.resolve(ROOT, value);
    else if (flag === "--p95-target-ms" && value) args.p95TargetMs = parsePositiveInteger(value, args.p95TargetMs);
    else if (flag === "--simulator-id" && value) args.simulatorId = value;
    else continue;
    index += 1;
  }

  args.concurrency = Math.min(args.concurrency, 4);
  return args;
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
  return compact(result.stdout);
}

function recursivelyParseJson(value) {
  let current = value;
  for (let attempt = 0; attempt < 3 && typeof current === "string"; attempt += 1) {
    current = JSON.parse(current);
  }
  return current;
}

async function simulatorAccessToken({ simulatorId, bundleId, projectRef }) {
  const appData = commandOutput("xcrun", ["simctl", "get_app_container", simulatorId, bundleId, "data"]);
  const storageDir = path.join(
    appData,
    "Library",
    "Application Support",
    bundleId,
    "RCTAsyncLocalStorage_V1",
  );
  const manifest = JSON.parse(await fsp.readFile(path.join(storageDir, "manifest.json"), "utf8"));
  const storageKey = `sb-${projectRef}-auth-token`;
  let rawSession = manifest[storageKey];
  if (rawSession === null) {
    const filename = crypto.createHash("md5").update(storageKey).digest("hex");
    rawSession = await fsp.readFile(path.join(storageDir, filename), "utf8");
  }
  const session = recursivelyParseJson(rawSession);
  const accessToken = compact(session?.access_token || session?.currentSession?.access_token);
  if (!accessToken) throw new Error("The selected simulator app does not contain a signed-in Supabase session.");
  return accessToken;
}

function projectRefFromUrl(supabaseUrl) {
  const hostname = new URL(supabaseUrl).hostname;
  const [projectRef] = hostname.split(".");
  if (!projectRef) throw new Error("Could not derive the Supabase project ref.");
  return projectRef;
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500 || attempt === attempts) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
  }
  throw lastError || new Error("Request failed");
}

async function imageToJpeg(imageUrl, fixtureId, outputDir) {
  const imageDir = path.join(outputDir, "images");
  await fsp.mkdir(imageDir, { recursive: true });
  const jpegPath = path.join(imageDir, `${fixtureId}.jpg`);
  if (fs.existsSync(jpegPath) && (await fsp.stat(jpegPath)).size > 0) return jpegPath;

  const response = await fetchWithRetry(imageUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
      "User-Agent": "WoofCatalogQualityAudit/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Image download returned HTTP ${response.status}`);

  const rawPath = path.join(imageDir, `${fixtureId}.source`);
  await fsp.writeFile(rawPath, Buffer.from(await response.arrayBuffer()));
  const convert = spawnSync("sips", [
    "-s", "format", "jpeg",
    "-s", "formatOptions", "64",
    "-Z", "512",
    rawPath,
    "--out", jpegPath,
  ], { encoding: "utf8" });
  await fsp.rm(rawPath, { force: true });
  if (convert.status !== 0 || !fs.existsSync(jpegPath)) {
    throw new Error(compact(convert.stderr || convert.stdout || "Image conversion failed"));
  }

  let base64Length = Math.ceil((await fsp.stat(jpegPath)).size / 3) * 4;
  if (base64Length > MAX_IMAGE_BASE64_LENGTH) {
    const shrink = spawnSync("sips", [
      "-s", "format", "jpeg",
      "-s", "formatOptions", "68",
      "-Z", "900",
      jpegPath,
      "--out", jpegPath,
    ], { encoding: "utf8" });
    if (shrink.status !== 0) throw new Error("Image could not be compressed below the Edge limit.");
    base64Length = Math.ceil((await fsp.stat(jpegPath)).size / 3) * 4;
  }
  if (base64Length > MAX_IMAGE_BASE64_LENGTH) throw new Error("Image remains above the Edge image limit.");
  return jpegPath;
}

async function identifyLabel({ supabaseUrl, anonKey, accessToken, jpegPath }) {
  const imageBase64 = (await fsp.readFile(jpegPath)).toString("base64");
  const startedAt = performance.now();
  const response = await fetch(`${supabaseUrl}/functions/v1/label-lookup`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-client-info": "woof-live-label-fixture-audit/1.0",
    },
    body: JSON.stringify({ imageBase64 }),
    signal: AbortSignal.timeout(12_000),
  });
  const elapsedMs = performance.now() - startedAt;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(compact(body?.error || `Label lookup returned HTTP ${response.status}`));
  return {
    body,
    elapsedMs,
    model: compact(response.headers.get("x-woof-label-model")),
  };
}

function labelSearchQuery(identification = {}) {
  const productName = compact(identification.productName);
  const brand = compact(identification.brand);
  const identityParts = [];
  if (brand && !normalized(productName).includes(normalized(brand))) identityParts.push(brand);
  if (productName) identityParts.push(productName);
  for (const value of [identification.productLine, identification.flavor, identification.lifeStage]) {
    const part = compact(value);
    if (!part) continue;
    const currentIdentity = normalized(identityParts.join(" "));
    const normalizedPart = normalized(part);
    if (currentIdentity.includes(normalizedPart)) continue;
    identityParts.push(part);
  }
  return identityParts.join(" ") || [brand, compact(identification.productLine), compact(identification.flavor)]
    .filter(Boolean)
    .join(" ");
}

function labelCoreSearchQuery(identification = {}) {
  const brand = compact(identification.brand);
  const productName = compact(identification.productName);
  if (!productName) return [brand, compact(identification.productLine)].filter(Boolean).join(" ");
  return brand && !normalized(productName).includes(normalized(brand))
    ? `${brand} ${productName}`
    : productName;
}

const LABEL_RECIPE_TERMS = new Set([
  "95", "adult", "ancient", "beef", "bison", "broth", "chicken", "cod", "cuts", "dehydrated",
  "duck", "filet", "fish", "free", "giblets", "grain", "grains", "gravy", "hydrolyzed", "indoor",
  "insect", "kitten", "lamb", "large", "liver", "loaf", "mackerel", "mature", "minced", "mobility",
  "morsels", "mousse", "oatmeal", "ocean", "pate", "plant", "pollock", "potato", "puppy", "pumpkin",
  "rabbit", "rice", "salmon", "sardine", "sardines", "senior", "sensitive", "shreds", "shrimp", "small",
  "sole", "stew", "stews", "sweet", "tilapia", "toy", "trout", "tuna", "turkey", "urinary", "vegetarian",
  "venison", "weight", "whitefish",
]);
const LABEL_RELAXED_RECIPE_NOISE = new Set([
  "broth", "cuts", "dehydrated", "filet", "gravy", "loaf", "minced", "morsels", "mousse", "pate",
  "shreds", "stew", "stews",
]);
const SEARCH_PHRASE_ALIASES = new Map([
  ["advanced edge", "advantedge"],
  ["hill s", "hills"],
  ["whole hearted", "wholehearted"],
]);

function labelRecipeSearchQuery(identification = {}) {
  const brandAndLine = [identification.brand, identification.productLine]
    .map(compact)
    .filter(Boolean)
    .join(" ");
  const seen = new Set();
  const terms = [];
  for (const token of normalized([
    identification.productName,
    identification.flavor,
    identification.lifeStage,
  ].map(compact).filter(Boolean).join(" ")).split(" ")) {
    if (!LABEL_RECIPE_TERMS.has(token) || token === "adult" || seen.has(token)) continue;
    seen.add(token);
    terms.push(token);
  }
  return [brandAndLine, terms.join(" ")].filter(Boolean).join(" ");
}

function labelRelaxedRecipeSearchQuery(identification = {}) {
  const seen = new Set();
  const terms = [];
  for (const token of normalized([
    identification.productName,
    identification.flavor,
    identification.lifeStage,
  ].map(compact).filter(Boolean).join(" ")).split(" ")) {
    if (
      !LABEL_RECIPE_TERMS.has(token) ||
      token === "adult" ||
      LABEL_RELAXED_RECIPE_NOISE.has(token) ||
      seen.has(token)
    ) continue;
    seen.add(token);
    terms.push(token);
  }
  return [compact(identification.brand), terms.join(" ")].filter(Boolean).join(" ");
}

function correctSearchPhrases(query) {
  let corrected = normalized(query);
  for (const [phrase, replacement] of SEARCH_PHRASE_ALIASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "g");
    corrected = corrected.replace(pattern, replacement);
  }
  return corrected;
}

function labelSearchQueries(identification = {}) {
  const queries = [
    labelSearchQuery(identification),
    labelCoreSearchQuery(identification),
    labelRecipeSearchQuery(identification),
    labelRelaxedRecipeSearchQuery(identification),
  ].map(compact).filter((query) => query.length >= 2);
  return [...new Map(queries.map((query) => [normalized(query), query])).values()];
}

async function searchCatalog({ supabaseUrl, anonKey, accessToken, query }) {
  const startedAt = performance.now();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/search_verified_products`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, max_results: 8 }),
    signal: AbortSignal.timeout(8_000),
  });
  const elapsedMs = performance.now() - startedAt;
  const body = await response.json().catch(() => []);
  if (!response.ok) throw new Error(compact(body?.message || body?.error || `Catalog search returned HTTP ${response.status}`));
  return { rows: Array.isArray(body) ? body : [], elapsedMs };
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function roundMs(value) {
  return Math.round(Number(value || 0));
}

function identityText(identity = {}) {
  return normalized([
    identity.brand,
    identity.productLine,
    identity.productName,
    identity.flavor,
    identity.lifeStage,
    identity.foodForm,
    identity.packageSize,
    identity.searchQuery,
  ].filter(Boolean).join(" "));
}

async function auditFixture(fixture, context) {
  const startedAt = performance.now();
  try {
    const jpegPath = await imageToJpeg(fixture.image_url, fixture.id, context.outputDir);
    const label = await identifyLabel({ ...context, jpegPath });
    const queries = labelSearchQueries(label.body);
    if (queries.length === 0) throw new Error("Label lookup returned no searchable identity.");
    const searchAttempts = [];
    const rows = [];
    const seenRows = new Set();
    let searchElapsedMs = 0;
    for (const query of queries) {
      const correctedQuery = correctSearchPhrases(query);
      const search = await searchCatalog({ ...context, query: correctedQuery });
      searchElapsedMs += search.elapsedMs;
      searchAttempts.push({
        query,
        corrected_query: correctedQuery,
        elapsed_ms: roundMs(search.elapsedMs),
        result_count: search.rows.length,
      });
      for (const row of search.rows) {
        if (!row?.cache_key || seenRows.has(row.cache_key)) continue;
        seenRows.add(row.cache_key);
        rows.push(row);
      }
      if (rows.some((row) => row.cache_key === fixture.cache_key)) break;
    }
    const expectedRankIndex = rows.findIndex((row) => row.cache_key === fixture.cache_key);
    const extractedText = identityText(label.body);
    const matchedExpectedTerms = fixture.expected_terms.filter((term) => extractedText.includes(normalized(term)));
    const confidence = Number(label.body?.confidence || 0);
    const found = label.body?.found !== false;
    const petTypeMatches = label.body?.petType === fixture.pet_type;
    const expectedInTopFive = expectedRankIndex >= 0 && expectedRankIndex < 5;
    const passed = found && confidence >= 0.78 && petTypeMatches && expectedInTopFive;

    return {
      id: fixture.id,
      cache_key: fixture.cache_key,
      expected_product_name: fixture.product_name,
      expected_pet_type: fixture.pet_type,
      source_url: fixture.source_url,
      fixture_image_path: path.relative(ROOT, jpegPath),
      passed,
      found,
      confidence,
      extracted: {
        brand: compact(label.body?.brand),
        product_name: compact(label.body?.productName),
        product_line: compact(label.body?.productLine),
        flavor: compact(label.body?.flavor),
        life_stage: compact(label.body?.lifeStage),
        food_form: compact(label.body?.foodForm),
        package_size: compact(label.body?.packageSize),
        pet_type: compact(label.body?.petType),
      },
      matched_expected_terms: matchedExpectedTerms,
      expected_term_count: fixture.expected_terms.length,
      search_query: queries[0],
      search_attempts: searchAttempts,
      expected_rank: expectedRankIndex >= 0 ? expectedRankIndex + 1 : null,
      top_cache_keys: rows.slice(0, 8).map((row) => row.cache_key),
      model: label.model,
      timings_ms: {
        label: roundMs(label.elapsedMs),
        search: roundMs(searchElapsedMs),
        total: roundMs(performance.now() - startedAt),
      },
    };
  } catch (error) {
    return {
      id: fixture.id,
      cache_key: fixture.cache_key,
      expected_product_name: fixture.product_name,
      expected_pet_type: fixture.pet_type,
      source_url: fixture.source_url,
      passed: false,
      error: compact(error?.message || error),
      timings_ms: { total: roundMs(performance.now() - startedAt) },
    };
  }
}

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
      const result = results[index];
      const timing = result.timings_ms?.total ? `${result.timings_ms.total}ms` : "no timing";
      console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id} (${timing})`);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = compact(process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = compact(process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");
  const projectRef = projectRefFromUrl(supabaseUrl);
  const accessToken = compact(process.env.WOOF_TEST_ACCESS_TOKEN) || await simulatorAccessToken({
    simulatorId: args.simulatorId,
    bundleId: args.bundleId,
    projectRef,
  });
  const allFixtures = JSON.parse(await fsp.readFile(FIXTURE_PATH, "utf8"));
  const selectedFixtures = args.ids.length > 0
    ? allFixtures.filter((fixture) => args.ids.includes(fixture.id))
    : allFixtures;
  const fixtures = selectedFixtures.slice(0, Math.min(args.limit, selectedFixtures.length));
  if (args.ids.length > 0 && fixtures.length !== new Set(args.ids).size) {
    throw new Error("One or more --ids values do not match a live label fixture.");
  }
  await fsp.mkdir(args.outputDir, { recursive: true });

  console.log(`Auditing ${fixtures.length} official front-package fixtures with concurrency ${args.concurrency}.`);
  const results = await mapWithConcurrency(fixtures, args.concurrency, (fixture) => auditFixture(fixture, {
    supabaseUrl,
    anonKey,
    accessToken,
    outputDir: args.outputDir,
  }));
  const totalTimings = results.filter((result) => !result.error).map((result) => result.timings_ms.total);
  const labelTimings = results.filter((result) => result.timings_ms?.label).map((result) => result.timings_ms.label);
  const passedCount = results.filter((result) => result.passed).length;
  const p95TotalMs = percentile(totalTimings, 0.95);
  const report = {
    generated_at: new Date().toISOString(),
    fixture_source: path.relative(ROOT, FIXTURE_PATH),
    target: {
      pass_rate: 1,
      p95_total_ms: args.p95TargetMs,
    },
    summary: {
      total: results.length,
      passed: passedCount,
      failed: results.length - passedCount,
      pass_rate: results.length ? Number((passedCount / results.length).toFixed(4)) : 0,
      p50_label_ms: roundMs(percentile(labelTimings, 0.5)),
      p95_label_ms: roundMs(percentile(labelTimings, 0.95)),
      p50_total_ms: roundMs(percentile(totalTimings, 0.5)),
      p95_total_ms: roundMs(p95TotalMs),
      speed_target_met: Number.isFinite(p95TotalMs) && p95TotalMs <= args.p95TargetMs,
    },
    results,
  };
  await fsp.writeFile(path.join(args.outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));

  if (passedCount !== results.length || !report.summary.speed_target_met) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Live label fixture audit failed: ${compact(error?.message || error)}`);
  process.exitCode = 1;
});
