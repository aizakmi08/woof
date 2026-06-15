#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-curated-catalog-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`curated catalog export guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("const SUPABASE_URL = process.env.SUPABASE_URL") &&
    source.includes("const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY") &&
    source.includes("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env."),
  "curated exporter must load env quietly and use anon Supabase reads only"
);

assert(
  source.includes("DEFAULT_SOURCE_FILES = [") &&
    source.includes("scripts/mega-scraper/underrepresented.js") &&
    source.includes("scripts/mega-scraper/us-canada-complete.js") &&
    source.includes("scripts/mega-scraper/store-brands.js") &&
    source.includes("scripts/mega-scraper/openfarm-complete.js") &&
    source.includes("--source-files=a,b") &&
    source.includes("--include-existing"),
  "curated exporter must expose auditable source-list selection and include-existing mode"
);

assert(
    source.includes("function parseCuratedProducts(file)") &&
    source.includes("sourceText.matchAll(pattern)") &&
    source.includes("const name = cleanProductName") &&
    source.includes("const brand = cleanBrand") &&
    source.includes("sourceFile: relative") &&
    !source.includes("require(\"./mega-scraper") &&
    !source.includes("dbSave(") &&
    !source.includes("scrapeIngredients("),
  "curated exporter must parse legacy product constants without executing scraper writes"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: true") &&
    source.includes("petTypes,") &&
    source.includes("explicitPetType") &&
    source.includes("sourceQuality: \"curated_name\"") &&
    source.includes("searchTerms: [...new Set([entry.name, fullName].filter(Boolean))]"),
  "curated targets must be backfill-compatible and preserve pet-type/search hints"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
    source.includes("/rest/v1/product_data") &&
    source.includes("select=cache_key") &&
    source.includes("Authorization: `Bearer ${SUPABASE_ANON_KEY}`") &&
    source.includes("function collectPlannedCacheKeys(target)") &&
    source.includes("productLookupRequestCacheKey(target)") &&
    source.includes("collectPlannedCacheKeys(target).some((key) => existing.has(key))") &&
    source.includes("skipped.existing++"),
  "curated exporter must skip rows already present under planned product-lookup cache keys"
);

assert(
  source.includes("source: \"legacy_curated_product_lists\"") &&
    source.includes("parsedCount") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("skipped,") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText"),
  "curated manifest must include audit counts and avoid raw ingredient payloads"
);

assert(
  packageJson.includes('"export:curated-catalog": "node scripts/export-curated-catalog-targets.js"') &&
    packageJson.includes('"test:curated-catalog-export": "node scripts/test-curated-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:curated-catalog-export"),
  "package scripts must expose curated exporter and include its guard in test:guards"
);

console.log("curated catalog export guard passed");
