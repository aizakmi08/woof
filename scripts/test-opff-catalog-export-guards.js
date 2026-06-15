#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-opff-catalog-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`OPFF catalog export guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("const SUPABASE_URL = process.env.SUPABASE_URL") &&
    source.includes("const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY") &&
    source.includes("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env."),
  "exporter must load env quietly and use anon Supabase reads only"
);

assert(
  source.includes("https://world.openpetfoodfacts.org/api/v2/search") &&
    source.includes("countries_tags_en: country") &&
    source.includes("fields: [") &&
    source.includes("\"ingredients_text\"") &&
    source.includes("\"ingredients_text_en\"") &&
    source.includes("User-Agent"),
  "exporter must use OPFF search with bounded fields and country filtering"
);

assert(
  source.includes("--output=path.json") &&
    source.includes("--page-size=N") &&
    source.includes("--max-pages=N") &&
    source.includes("--limit=N") &&
    source.includes("--country=slug") &&
    source.includes("--include-existing") &&
    source.includes("--include-sparse"),
  "exporter must expose output, paging, limit, country, include-existing, and sparse-target options"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("petTypes.length === 0") &&
    source.includes("petType: petTypes[0]") &&
    source.includes("petTypes,"),
  "exported OPFF targets must use strict dog/cat inference and preserve pet-type hints"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
    source.includes("/rest/v1/product_data") &&
    source.includes("select=cache_key") &&
    source.includes("Authorization: `Bearer ${SUPABASE_ANON_KEY}`") &&
    source.includes("collectPlannedCacheKeys(target).some((key) => existing.has(key))") &&
    source.includes("skipped.existing++") &&
    source.includes("!includeExisting"),
  "exporter must read existing product_data keys and skip existing rows unless explicitly included"
);

assert(
  source.includes("function parseIngredientsCount(text)") &&
    source.includes("ingredientCount < 5 && !includeSparse") &&
    source.includes("ingredientCount < 5 && !barcode") &&
    source.includes("sourceQuality: ingredientCount >= 5 ? \"ingredient_text\" : \"barcode_name\"") &&
    source.includes("ingredientCount,") &&
    !source.includes("ingredients: product") &&
    !source.includes("ingredientText") &&
    !source.includes("ingredients_text:"),
  "exporter must use ingredient text only for quality filtering and must not export raw ingredient text"
);

assert(
  source.includes("source: \"opff_export\"") &&
    source.includes("const barcode = String(product?.code || product?._id || \"\").trim()") &&
    source.includes("barcode,") &&
    source.includes("sourceUrl: opffProductUrl(product)") &&
    source.includes("searchTerms: [...new Set([name, fullName].filter(Boolean))]") &&
    source.includes("cacheKey,"),
  "targets must be backfill-compatible and include provenance/search metadata"
);

assert(
  source.includes("generatedAt: new Date().toISOString()") &&
    source.includes("source: \"openpetfoodfacts\"") &&
    source.includes("endpoint: OPFF_SEARCH_URL") &&
    source.includes("productsScanned: scanned") &&
    source.includes("existingCount: existing.size") &&
    source.includes("includeSparse,") &&
    source.includes("missingCount: targets.length") &&
    source.includes("skipped,") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, skip, summary, and target counts"
);

assert(
  packageJson.includes("\"export:opff-catalog\": \"node scripts/export-opff-catalog-targets.js\"") &&
    packageJson.includes("\"test:opff-catalog-export\": \"node scripts/test-opff-catalog-export-guards.js\"") &&
    packageJson.includes("npm run test:opff-catalog-export"),
  "package scripts must expose exporter and include its guard in test:guards"
);

console.log("OPFF catalog export guard passed");
