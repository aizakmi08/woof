import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeScraperCandidate,
  validateScraperCandidate,
} from "./catalog-scraper-contract.mjs";

const DEFAULT_ROOT = "outputs/catalog-source-imports";
const DEFAULT_OUTPUT = "outputs/catalog-source-imports/live-gap-report.json";
const DEFAULT_TOP = 60;
const PAGE_SIZE = 1000;

const VERIFIED_SOURCE_QUALITIES = new Set(["gdsn", "official", "manufacturer", "retailer_verified"]);
const VERIFIED_INGREDIENT_STATUSES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
]);
const VERIFIED_IMAGE_STATUSES = new Set(["official", "manufacturer", "retailer_verified"]);

const DEFAULT_EXCLUDED_DIR_PATTERNS = [
  /\bprobe\b/i,
  /\bdebug\b/i,
  /\btest\b/i,
  /\bfocused\b/i,
  /\bexpanded\b/i,
  /\brecovered\b/i,
  /\brerun\b/i,
  /\bfixed\b/i,
];

const CANONICAL_SOURCE_BY_OUTPUT_DIR = new Map([
  ["diamond-naturals-probe", "diamond-pet-foods"],
  ["fussie-cat-probe", "fussie-cat"],
  ["go-solutions-probe", "go-solutions-petcurean"],
  ["halo-probe", "halo-pets"],
  ["natural-balance-api-probe", "natural-balance"],
  ["natural-balance-api-probe-2", "natural-balance"],
  ["natural-balance-probe", "natural-balance"],
  ["natures-logic-probe", "natures-logic"],
  ["now-fresh-probe", "now-fresh-petcurean"],
  ["primal-probe", "primal-pet-foods"],
  ["ziwi-peak-probe", "ziwi-peak"],
]);
const SQL_MANIFEST_DIR_NAMES = new Set(["sql", "sql-mcp"]);

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) values.push(value);
  }
  return values;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalUrl(value) {
  return compact(value).replace(/\/+$/g, "");
}

function normalizedText(value) {
  return compact(String(value || "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " "));
}

function identityKey(brand, productName) {
  const brandKey = normalizedText(brand);
  let nameKey = normalizedText(productName);
  if (brandKey && nameKey.startsWith(`${brandKey} `)) {
    nameKey = compact(nameKey.slice(brandKey.length + 1));
  }
  return compact(nameKey) || "";
}

function normalizedPackageSize(value) {
  return normalizedText(value);
}

function normalizedGtin(value) {
  return compact(value).replace(/\D+/g, "");
}

function liveIdentityKeysFor(row) {
  const brand = normalizedText(row.brand);
  const identity = identityKey(row.brand, row.product_name);
  if (!brand || !identity) return [];

  const petType = normalizedText(row.pet_type);
  const gtin = normalizedGtin(row.gtin);
  const packageSize = normalizedPackageSize(row.package_size);
  const keys = new Set([
    `${brand}|${identity}|${petType}|${gtin}|${packageSize}`,
    `${brand}|${identity}|${petType}|${gtin}|`,
    `${brand}|${identity}|${petType}||${packageSize}`,
    `${brand}|${identity}|${petType}||`,
  ]);
  if (!petType) {
    keys.add(`${brand}|${identity}|||`);
  }
  return [...keys];
}

function candidateIdentityKeysFor(row) {
  const brand = normalizedText(row.brand);
  const identity = identityKey(row.brand, row.product_name);
  if (!brand || !identity) return [];

  const petType = normalizedText(row.pet_type);
  const gtin = normalizedGtin(row.gtin);
  const packageSize = normalizedPackageSize(row.package_size);
  const keys = new Set([
    `${brand}|${identity}|${petType}|${gtin}|${packageSize}`,
  ]);
  if (gtin) keys.add(`${brand}|${identity}|${petType}|${gtin}|`);
  if (packageSize) keys.add(`${brand}|${identity}|${petType}||${packageSize}`);
  keys.add(`${brand}|${identity}|${petType}||`);
  if (!petType) {
    keys.add(`${brand}|${identity}|||`);
  }
  return [...keys];
}

function hasIdentityMatch(row, liveBucket, strictOnly) {
  const keys = candidateIdentityKeysFor(row);
  if (keys.length === 0) return false;
  const liveKeys = strictOnly ? liveBucket?.strictIdentityKeys : liveBucket?.allIdentityKeys;
  if (!liveKeys) return false;
  return keys.some((key) => liveKeys.has(key));
}

function isNonServingCandidate(row) {
  const identity = normalizedText([
    row.product_name,
    row.product_line,
    row.flavor,
    row.source_url,
  ].filter(Boolean).join(" "));

  return /(^| )(variety|varieties|variety packs?|bundles?|samplers?|samples?|sample packs?|starter packs?|starter kits?|multipacks?|multi packs?|(?:new )?(?:puppy|kitten) packs?|(?:puppy|kitten) essentials packs?|essentials packs?)( |$)/.test(identity);
}

function relativePath(value) {
  return path.relative(process.cwd(), value) || value;
}

function incrementCount(map, key) {
  const normalized = compact(key) || "unknown";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function sortedCountObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  );
}

function shouldSkipDir(dir, { includeVariants }) {
  if (includeVariants) return false;
  return DEFAULT_EXCLUDED_DIR_PATTERNS.some((pattern) => pattern.test(dir));
}

function findManifestPaths(root, { includeVariants }) {
  const manifests = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        stack.push(fullPath);
        continue;
      }
      if (entry.name !== "manifest.json") continue;
      if (!SQL_MANIFEST_DIR_NAMES.has(path.basename(path.dirname(fullPath)))) continue;
      if (shouldSkipDir(path.dirname(path.dirname(fullPath)), { includeVariants })) continue;
      manifests.push(fullPath);
    }
  }

  return manifests.sort();
}

function parsePayloadRows(sql) {
  const rows = [];

  for (const match of sql.matchAll(/decode\('([^']+)', 'base64'\)/g)) {
    rows.push(...JSON.parse(Buffer.from(match[1], "base64").toString("utf8")));
  }
  for (const match of sql.matchAll(/decode\('([0-9a-fA-F]+)', 'hex'\)/g)) {
    rows.push(...JSON.parse(Buffer.from(match[1], "hex").toString("utf8")));
  }

  return rows;
}

function readManifestRows(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifestDir = path.dirname(manifestPath);
  const rows = [];

  for (const chunk of manifest.chunks || []) {
    const chunkFile = compact(chunk.file);
    const chunkPath = path.isAbsolute(chunkFile)
      ? chunkFile
      : fs.existsSync(chunkFile)
        ? chunkFile
        : path.resolve(manifestDir, chunkFile);
    if (!fs.existsSync(chunkPath)) continue;
    rows.push(...parsePayloadRows(fs.readFileSync(chunkPath, "utf8")));
  }

  return { manifest, rows };
}

function outputDirNameFromManifestPath(manifestPath) {
  return path.basename(path.dirname(path.dirname(manifestPath)));
}

function sourceForManifest(manifestPath, manifest, rows, { canonicalizeProbes }) {
  const manifestSource = compact(manifest.source || rows[0]?.source);
  if (!canonicalizeProbes) return manifestSource;

  const outputDirName = outputDirNameFromManifestPath(manifestPath);
  return CANONICAL_SOURCE_BY_OUTPUT_DIR.get(outputDirName) || manifestSource;
}

function supabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isStrictReady(row) {
  const sourceUrl = canonicalUrl(row.source_url);
  const imageUrl = compact(row.image_url);
  const ingredientText = compact(row.ingredient_text);

  return Boolean(
    sourceUrl
      && ingredientText
      && imageUrl
      && !/^data:/i.test(imageUrl)
      && row.verified_at
      && Number(row.ingredient_count || 0) >= 5
      && row.is_complete_food === true
      && !row.catalog_exclusion_reason
      && VERIFIED_SOURCE_QUALITIES.has(compact(row.source_quality).toLowerCase())
      && VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status).toLowerCase())
      && VERIFIED_IMAGE_STATUSES.has(compact(row.image_verification_status).toLowerCase())
  );
}

async function fetchLiveRows(client) {
  const bySource = new Map();

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await client
      .from("product_data")
      .select([
        "id",
        "source",
        "source_url",
        "brand",
        "product_name",
        "pet_type",
        "gtin",
        "package_size",
        "source_quality",
        "ingredient_verification_status",
        "image_verification_status",
        "verified_at",
        "ingredient_count",
        "ingredient_text",
        "image_url",
        "is_complete_food",
        "catalog_exclusion_reason",
      ].join(","))
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    for (const row of data || []) {
      const source = compact(row.source);
      if (!source) continue;
      if (!bySource.has(source)) {
        bySource.set(source, {
          allUrls: new Set(),
          strictUrls: new Set(),
          allIdentityKeys: new Set(),
          strictIdentityKeys: new Set(),
          totalRows: 0,
          strictRows: 0,
        });
      }
      const bucket = bySource.get(source);
      bucket.totalRows += 1;
      const url = canonicalUrl(row.source_url);
      if (url) bucket.allUrls.add(url);
      for (const key of liveIdentityKeysFor(row)) {
        bucket.allIdentityKeys.add(key);
      }
      if (isStrictReady(row)) {
        bucket.strictRows += 1;
        bucket.strictUrls.add(url);
        for (const key of liveIdentityKeysFor(row)) {
          bucket.strictIdentityKeys.add(key);
        }
      }
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  return bySource;
}

function summarizeRows(rows, liveBucket, { sampleLimit }) {
  const localUrls = new Set();
  const strictMissing = [];
  const strictMissingByUrlOnly = [];
  const strictMissingByIdentity = [];
  const notLive = [];
  const liveButNotStrict = [];
  const identityAlreadyStrict = [];
  const identityAlreadyLive = [];
  let skippedNonServing = 0;
  let skippedCurrentInvalid = 0;
  const skippedInvalidByReason = new Map();

  for (const row of rows) {
    const validation = validateScraperCandidate(normalizeScraperCandidate(row));
    if (!validation.ok) {
      skippedCurrentInvalid += 1;
      for (const reason of validation.reasons) incrementCount(skippedInvalidByReason, reason);
      continue;
    }

    if (isNonServingCandidate(row)) {
      skippedNonServing += 1;
      continue;
    }

    const url = canonicalUrl(row.source_url);
    if (!url || localUrls.has(url)) continue;
    localUrls.add(url);

    const hasStrictUrl = liveBucket?.strictUrls.has(url);
    const hasLiveUrl = liveBucket?.allUrls.has(url);
    const hasStrictIdentity = hasIdentityMatch(row, liveBucket, true);
    const hasLiveIdentity = hasIdentityMatch(row, liveBucket, false);

    if (hasStrictIdentity && !hasStrictUrl) {
      identityAlreadyStrict.push(row);
    }
    if (hasLiveIdentity && !hasLiveUrl) {
      identityAlreadyLive.push(row);
    }

    if (hasStrictUrl || hasStrictIdentity) continue;
    strictMissing.push(row);
    strictMissingByIdentity.push(row);
    if (!hasStrictUrl) strictMissingByUrlOnly.push(row);
    if (liveBucket?.allUrls.has(url)) {
      liveButNotStrict.push(row);
    } else {
      notLive.push(row);
    }
  }

  const sample = strictMissing.slice(0, sampleLimit).map((row) => ({
    product_name: row.product_name || "",
    brand: row.brand || "",
    source_url: row.source_url || "",
    cache_key: row.cache_key || "",
  }));

  return {
    local_unique_source_urls: localUrls.size,
    live_rows: liveBucket?.totalRows || 0,
    live_source_urls: liveBucket?.allUrls.size || 0,
    live_strict_rows: liveBucket?.strictRows || 0,
    live_strict_source_urls: liveBucket?.strictUrls.size || 0,
    strict_missing_source_urls: strictMissing.length,
    strict_missing_by_url_only: strictMissingByUrlOnly.length,
    strict_missing_by_identity: strictMissingByIdentity.length,
    strict_identity_already_live_with_url_drift: identityAlreadyStrict.length,
    identity_already_live_with_url_drift: identityAlreadyLive.length,
    local_skipped_non_serving_rows: skippedNonServing,
    local_skipped_current_invalid_rows: skippedCurrentInvalid,
    local_skipped_current_invalid_by_reason: sortedCountObject(skippedInvalidByReason),
    not_live_source_urls: notLive.length,
    live_but_not_strict_source_urls: liveButNotStrict.length,
    sample_missing: sample,
  };
}

async function main() {
  const root = compact(getArg("--root", DEFAULT_ROOT));
  const output = compact(getArg("--output", DEFAULT_OUTPUT));
  const top = positiveInteger(getArg("--top"), DEFAULT_TOP);
  const sampleLimit = positiveInteger(getArg("--sample-limit"), 10);
  const includeVariants = hasArg("--include-variants");
  const canonicalizeProbes = hasArg("--canonicalize-probes") || includeVariants;
  const wantedSources = new Set(getArgs("--source").map(compact).filter(Boolean));
  const minMissing = positiveInteger(getArg("--min-missing"), 1);

  const client = supabaseClient();
  if (!client) throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY for live comparison.");

  const manifestPaths = findManifestPaths(root, { includeVariants });
  const liveBySource = await fetchLiveRows(client);
  const reports = [];

  for (const manifestPath of manifestPaths) {
    const { manifest, rows } = readManifestRows(manifestPath);
    const source = sourceForManifest(manifestPath, manifest, rows, { canonicalizeProbes });
    if (!source) continue;
    if (wantedSources.size > 0 && !wantedSources.has(source)) continue;

    const summary = summarizeRows(rows, liveBySource.get(source), { sampleLimit });
    if (summary.strict_missing_source_urls < minMissing) continue;

    reports.push({
      source,
      original_source: compact(manifest.source || rows[0]?.source) || null,
      output_dir: outputDirNameFromManifestPath(manifestPath),
      sql_dir: relativePath(path.dirname(manifestPath)),
      manifest: relativePath(manifestPath),
      generated_at: manifest.generated_at || null,
      source_quality: manifest.source_quality || null,
      expected_brands: manifest.expected_brands || [],
      total_sql_rows: rows.length,
      ...summary,
    });
  }

  reports.sort((a, b) => (
    b.strict_missing_source_urls - a.strict_missing_source_urls
      || b.not_live_source_urls - a.not_live_source_urls
      || b.total_sql_rows - a.total_sql_rows
      || a.source.localeCompare(b.source)
  ));

  const result = {
    generated_at: new Date().toISOString(),
    root,
    include_variants: includeVariants,
    canonicalize_probes: canonicalizeProbes,
    manifest_count: manifestPaths.length,
    reported_sources: reports.length,
    min_missing: minMissing,
    top: reports.slice(0, top),
  };

  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
