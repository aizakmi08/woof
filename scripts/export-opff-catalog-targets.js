#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPFF_SEARCH_URL = "https://world.openpetfoodfacts.org/api/v2/search";
const DEFAULT_OUTPUT = ".tmp/opff-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 100;
const USER_AGENT = "WoofApp/1.1 catalog coverage export (contact: support@woof.app)";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const pageSizeArg = process.argv.find((arg) => arg.startsWith("--page-size="));
const maxPagesArg = process.argv.find((arg) => arg.startsWith("--max-pages="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const countryArg = process.argv.find((arg) => arg.startsWith("--country="));
const includeExisting = process.argv.includes("--include-existing");
const includeSparse = process.argv.includes("--include-sparse");
const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const pageSize = pageSizeArg ? Number(pageSizeArg.split("=")[1]) : 100;
const maxPages = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : 10;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const country = countryArg ? countryArg.split("=")[1].trim() : "united-states";

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:opff-catalog -- --output=.tmp/opff-catalog-targets.json --max-pages=25

Options:
  --output=path.json        Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --page-size=N             OPFF page size, 1-${MAX_PAGE_SIZE} (default 100)
  --max-pages=N             Pages to fetch, 0 means all available pages (default 10)
  --limit=N                 Stop after N missing targets are collected (default 0, no limit)
  --country=slug            OPFF country tag slug (default united-states)
  --include-existing        Include targets already present in product_data for audit only
  --include-sparse          Include barcode-backed targets without OPFF ingredient text
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    usage(`--page-size must be an integer between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (!Number.isInteger(maxPages) || maxPages < 0) {
    usage("--max-pages must be a non-negative integer.");
  }
  if (!Number.isFinite(limit) || limit < 0) {
    usage("--limit must be a non-negative number.");
  }
  if (!country) {
    usage("--country must not be empty.");
  }
}

function normalizeCacheKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[-/&]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductName(name) {
  return String(name || "")
    .replace(/\s*\d+(\.\d+)?\s*(oz|lb|lbs|kg|g|pound|ounce)s?\b/gi, "")
    .replace(/\s*-\s*\d+\s*(count|pack|ct|can|pouch|bag)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function cleanBrand(value) {
  return String(value || "")
    .split(",")[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function parseIngredientsCount(text) {
  const raw = String(text || "").trim();
  if (!raw) return 0;
  const parts = [];
  let current = "";
  let depth = 0;
  for (const char of raw) {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    if ((char === "," || char === ";") && depth === 0) {
      const item = current.trim();
      if (item) parts.push(item);
      current = "";
    } else {
      current += char;
    }
  }
  const last = current.trim();
  if (last) parts.push(last);
  return parts.filter((item) => item.length > 1 && item.length < 250).length;
}

function opffProductUrl(product) {
  const code = String(product?.code || product?._id || "").trim();
  return code ? `https://world.openpetfoodfacts.org/product/${encodeURIComponent(code)}` : "";
}

function normalizeOpffTarget(product) {
  const name = cleanProductName(product?.product_name || product?.product_name_en);
  const brand = cleanBrand(product?.brands);
  if (!name || name.length < 3 || name.length > 220) return null;
  const fullName = brand && !name.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${name}`
    : name;
  const cacheKey = normalizeCacheKey(fullName);
  if (!cacheKey) return null;
  const ingredientCount = parseIngredientsCount(product?.ingredients_text || product?.ingredients_text_en);
  if (ingredientCount < 5 && !includeSparse) return null;
  const barcode = String(product?.code || product?._id || "").trim();
  if (ingredientCount < 5 && !barcode) return null;
  const petTypes = inferPetTypes({
    product_name: name,
    brand,
    cache_key: cacheKey,
    source: "opff",
    categories: [
      product?.categories,
      ...(Array.isArray(product?.categories_tags) ? product.categories_tags : []),
    ].filter(Boolean).join(" "),
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return null;

  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    cacheKey,
    source: "opff_export",
    sourceQuality: ingredientCount >= 5 ? "ingredient_text" : "barcode_name",
    barcode,
    sourceUrl: opffProductUrl(product),
    ingredientCount,
    searchTerms: [...new Set([name, fullName].filter(Boolean))],
  };
}

function collectPlannedCacheKeys(target) {
  return [
    target.cacheKey,
    normalizeCacheKey(target.brand ? `${target.brand} ${target.name}` : target.name),
  ].filter(Boolean);
}

async function fetchExistingCacheKeys() {
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < REST_PAGE_SIZE) break;
  }
  return new Set(rows.map((row) => row.cache_key).filter(Boolean));
}

async function fetchOpffPage(page) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    countries_tags_en: country,
    fields: [
      "code",
      "product_name",
      "product_name_en",
      "brands",
      "ingredients_text",
      "ingredients_text_en",
      "categories",
      "categories_tags",
    ].join(","),
  });
  const response = await fetch(`${OPFF_SEARCH_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`OPFF page ${page} failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function summarizeTargets(targets) {
  const byPetType = new Map();
  let withBarcode = 0;
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    if (target.barcode) withBarcode++;
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    withBarcode,
  };
}

async function main() {
  assertConfig();
  const existing = await fetchExistingCacheKeys();
  const byKey = new Map();
  const skipped = {
    existing: 0,
    duplicate: 0,
    invalidOrSparse: 0,
  };
  let scanned = 0;
  let pagesFetched = 0;
  let totalPages = maxPages || Infinity;

  for (let page = 1; page <= totalPages; page++) {
    const data = await fetchOpffPage(page);
    pagesFetched++;
    const products = Array.isArray(data.products) ? data.products : [];
    if (page === 1 && maxPages === 0) {
      totalPages = Math.ceil(Number(data.count || 0) / pageSize) || 1;
    }
    if (products.length === 0) break;

    for (const product of products) {
      scanned++;
      const target = normalizeOpffTarget(product);
      if (!target) {
        skipped.invalidOrSparse++;
        continue;
      }
      if (!includeExisting && collectPlannedCacheKeys(target).some((key) => existing.has(key))) {
        skipped.existing++;
        continue;
      }
      if (byKey.has(target.cacheKey)) {
        skipped.duplicate++;
        continue;
      }
      byKey.set(target.cacheKey, target);
      if (limit > 0 && byKey.size >= limit) break;
    }

    if (limit > 0 && byKey.size >= limit) break;
  }

  const targets = [...byKey.values()].sort((a, b) =>
    b.ingredientCount - a.ingredientCount ||
    String(a.brand || "").localeCompare(String(b.brand || "")) ||
    String(a.name || "").localeCompare(String(b.name || ""))
  );
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "openpetfoodfacts",
    endpoint: OPFF_SEARCH_URL,
    country,
    includeSparse,
    pageSize,
    requestedMaxPages: maxPages,
    pagesFetched,
    productsScanned: scanned,
    existingCount: existing.size,
    missingCount: targets.length,
    skipped,
    summary: summarizeTargets(targets),
    targets,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`OPFF pages fetched: ${pagesFetched}`);
  console.log(`OPFF products scanned: ${scanned}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing OPFF targets exported: ${targets.length}`);
  console.log(`Skipped existing: ${skipped.existing}; duplicate: ${skipped.duplicate}; invalid/sparse: ${skipped.invalidOrSparse}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("OPFF catalog target export failed:", err.message);
  process.exit(1);
});
