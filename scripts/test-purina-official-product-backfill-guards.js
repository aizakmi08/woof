#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/backfill-purina-official-products.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Purina official product backfill guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("PURINA_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("PRODUCT_LOOKUP_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("Set PURINA_PRODUCT_IMPORT_SERVICE_KEY, PRODUCT_LOOKUP_SERVICE_KEY, or Supabase service key") &&
    source.includes("if (!dryRun && !PURINA_PRODUCT_IMPORT_SERVICE_KEY)"),
  "official Purina product import must be env-quiet and service-key gated for writes"
);

assert(
  source.includes("\".tmp/purinaproplan-sitemap-catalog-targets.json\"") &&
    source.includes("\".tmp/purinaone-sitemap-catalog-targets.json\"") &&
    source.includes("\".tmp/fancyfeast-sitemap-catalog-targets.json\"") &&
    source.includes("\".tmp/friskies-sitemap-catalog-targets.json\"") &&
    source.includes("DEFAULT_EXPORT_PARSED = \".tmp/purina-official-product-data.json\"") &&
    source.includes("--dry-run") &&
    source.includes("--export-parsed=path.json") &&
    source.includes("--resume-report") &&
    source.includes("--include-existing") &&
    source.includes("--concurrency=N") &&
    source.includes("MAX_CONCURRENCY = 4"),
  "script must support bounded dry-run/export/report/resume options over the main Purina-family target manifests"
);

assert(
  source.includes("function pageDataUrl(sourceUrl)") &&
    source.includes("https://www.purina.com/page-data") &&
    source.includes("function fetchPageData(target, attempt = 1)") &&
    source.includes("Accept: \"application/json,text/plain;q=0.9,*/*;q=0.8\"") &&
    source.includes("function parseIngredients(node)") &&
    source.includes("node?.relationships?.ingredients") &&
    source.includes("ingredient?.name") &&
    source.includes("ingredients.length < 5") &&
    source.includes("function ensureUniqueCacheKeys(targets)") &&
    source.includes("row.baseCacheKey = cacheKey") &&
    source.includes("row.cacheKey = normalizeCacheKey(`${cacheKey} ${suffix}`)") &&
    source.includes("function isMultiPack(target)") &&
    source.includes("multipack_or_variety_pack") &&
    source.includes("skippedDetails") &&
    !source.includes("product-lookup") &&
    !source.includes("puppeteer") &&
    !source.includes("cheerio"),
  "script must parse official Purina Gatsby page-data ingredients without product-lookup or browser scraping"
);

assert(
  source.includes("function parseCalories(node)") &&
    source.includes("feeding_instructions?.processed") &&
    source.includes("calories_per_kg") &&
    source.includes("calories_per_cup") &&
    source.includes("calories_per_serving") &&
    source.includes("labelDeckUrl") &&
    !source.includes("save_product_data_with_nutrients") &&
    !source.includes("p_nutrient_panel"),
  "script must preserve calorie/label-deck provenance but avoid writing sparse nutrient panels without guaranteed-analysis percentages"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
    source.includes("/rest/v1/product_data") &&
    source.includes("brand.ilike.*Purina*") &&
    source.includes("brand.ilike.*Fancy%20Feast*") &&
    source.includes("brand.ilike.*Friskies*") &&
    source.includes("Existing Purina keys skipped") &&
    source.includes("includeExisting"),
  "script must skip existing Purina-family product_data aliases unless explicitly included"
);

assert(
  source.includes("save_product_data") &&
    source.includes("p_cache_key: target.cacheKey") &&
    source.includes("p_ingredients: target.ingredients") &&
    source.includes("p_ingredient_text: target.ingredientText") &&
    source.includes("p_ingredient_count: target.ingredientCount") &&
    source.includes("p_source: \"brand_site\"") &&
    source.includes("select=cache_key,ingredient_count,source"),
  "script must write official Purina ingredients through the service-role product_data RPC and verify writes"
);

assert(
  source.includes("source: \"purina_official_product_data\"") &&
    source.includes("source: \"brand_site\"") &&
    source.includes("officialProductName") &&
    source.includes("ingredientText: ingredients.join(\", \")") &&
    source.includes("summary: summarizeParsed(targets)") &&
    source.includes("reason: result.reason || \"missing_parsed_target\"") &&
    source.includes("purina_official_product_result") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64") &&
    !source.includes("modelOutput"),
  "exported parsed manifest must be official product data only, with skipped-target diagnostics and no model output or image payloads"
);

assert(
  packageJson.includes('"backfill:purina-official-products": "node scripts/backfill-purina-official-products.js"') &&
    packageJson.includes('"test:purina-official-product-backfill": "node scripts/test-purina-official-product-backfill-guards.js"') &&
    packageJson.includes("npm run test:purina-official-product-backfill"),
  "package scripts must expose Purina official product backfill and include its guard in test:guards"
);

console.log("Purina official product backfill guard passed");
