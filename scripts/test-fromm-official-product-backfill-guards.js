#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/backfill-fromm-official-products.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Fromm official product backfill guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("FROMM_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("PRODUCT_LOOKUP_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("Set FROMM_PRODUCT_IMPORT_SERVICE_KEY, PRODUCT_LOOKUP_SERVICE_KEY, or Supabase service key") &&
    source.includes("if (!dryRun && !FROMM_PRODUCT_IMPORT_SERVICE_KEY)"),
  "official Fromm product import must be env-quiet and service-key gated for writes"
);

assert(
  source.includes("DEFAULT_INPUT = \".tmp/fromm-sitemap-catalog-targets.json\"") &&
    source.includes("DEFAULT_EXPORT_PARSED = \".tmp/fromm-official-product-data.json\"") &&
    source.includes("--dry-run") &&
    source.includes("--export-parsed=path.json") &&
    source.includes("--resume-report") &&
    source.includes("--include-existing") &&
    source.includes("--concurrency=N") &&
    source.includes("MAX_CONCURRENCY = 4"),
  "script must support bounded dry-run/export/report/resume options for service-key batches"
);

assert(
  source.includes("frommfamily\\.com\\/products") &&
    source.includes("function parseIngredients(html)") &&
    source.includes("<!--\\s*Ingredients\\s*-->") &&
    source.includes("<h3[^>]*>\\s*Ingredients\\s*<\\/h3>") &&
    source.includes("source.indexOf(\"</section>\", markerIndex)") &&
    source.includes("class=[\"'][^\"']*\\bingredients\\b") &&
    source.includes("function splitIngredientText(text)") &&
    source.includes("bracketDepth === 0") &&
    source.includes("ingredients.length < 5") &&
    !source.includes("product-lookup") &&
    !source.includes("puppeteer") &&
    !source.includes("cheerio"),
  "script must parse official Fromm ingredient text without product-lookup or browser scraping"
);

assert(
  source.includes("function parseNutrientPanel(html, sourceUrl)") &&
    source.includes("guaranteed analysis") &&
    source.includes("Caloric Content") &&
    source.includes("protein_pct") &&
    source.includes("fat_pct") &&
    source.includes("fiber_pct") &&
    source.includes("moisture_pct") &&
    source.includes("ash_pct") &&
    source.includes("calcium_pct") &&
    source.includes("phosphorus_pct") &&
    source.includes("calories_per_cup") &&
    source.includes("calories_per_kg") &&
    source.includes("basis: \"as-fed\""),
  "script must parse official Fromm guaranteed analysis and calorie fields into the nutrient-panel contract"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
    source.includes("/rest/v1/product_data") &&
    source.includes("brand.ilike.*Fromm*") &&
    source.includes("Existing Fromm keys skipped") &&
    source.includes("includeExisting"),
  "script must skip existing Fromm product_data aliases unless explicitly included"
);

assert(
  source.includes("save_product_data_with_nutrients") &&
    source.includes("save_product_data") &&
    source.includes("p_cache_key: target.cacheKey") &&
    source.includes("p_ingredients: target.ingredients") &&
    source.includes("p_ingredient_text: target.ingredientText") &&
    source.includes("p_ingredient_count: target.ingredientCount") &&
    source.includes("p_source: \"brand_site\"") &&
    source.includes("p_nutrient_panel") &&
    source.includes("has_published_nutrients"),
  "script must write official Fromm ingredients through service-role product_data RPCs and verify nutrient writes"
);

assert(
  source.includes("source: \"fromm_official_product_data\"") &&
    source.includes("source: \"brand_site\"") &&
    source.includes("officialProductName") &&
    source.includes("ingredientText: ingredients.join(\", \")") &&
    source.includes("summary: summarizeParsed(targets)") &&
    source.includes("skippedDetails") &&
    source.includes("reason: result.reason || \"missing_parsed_target\"") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64") &&
    !source.includes("modelOutput"),
  "exported parsed manifest must be official product data only, with skipped-target diagnostics and no model output or image payloads"
);

assert(
  packageJson.includes('"backfill:fromm-official-products": "node scripts/backfill-fromm-official-products.js"') &&
    packageJson.includes('"test:fromm-official-product-backfill": "node scripts/test-fromm-official-product-backfill-guards.js"') &&
    packageJson.includes("npm run test:fromm-official-product-backfill"),
  "package scripts must expose Fromm official product backfill and include its guard in test:guards"
);

console.log("Fromm official product backfill guard passed");
