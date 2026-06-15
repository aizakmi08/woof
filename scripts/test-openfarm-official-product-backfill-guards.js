#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/backfill-openfarm-official-products.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Open Farm official product backfill guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("OPENFARM_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("PRODUCT_LOOKUP_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("Set OPENFARM_PRODUCT_IMPORT_SERVICE_KEY, PRODUCT_LOOKUP_SERVICE_KEY, or Supabase service key") &&
    source.includes("if (!dryRun && !OPENFARM_PRODUCT_IMPORT_SERVICE_KEY)"),
  "official Open Farm product import must be env-quiet and service-key gated for writes"
);

assert(
  source.includes("DEFAULT_INPUT = \".tmp/openfarm-shopify-catalog-targets.json\"") &&
    source.includes("DEFAULT_EXPORT_PARSED = \".tmp/openfarm-official-product-data.json\"") &&
    source.includes("--dry-run") &&
    source.includes("--export-parsed=path.json") &&
    source.includes("--resume-report") &&
    source.includes("--include-existing") &&
    source.includes("--concurrency=N") &&
    source.includes("MAX_CONCURRENCY = 4"),
  "script must support bounded dry-run/export/report/resume options for service-key batches"
);

assert(
  source.includes("openfarmpet\\.com\\/products") &&
    source.includes("function modalSection(html, id)") &&
    source.includes("activeModalIds.includes('${id}')") &&
    source.includes("function parseIngredients(html)") &&
    source.includes("modalSection(html, \"ingredients-modal\")") &&
    source.includes("section.matchAll(/<h4\\b[^>]*>([\\s\\S]*?)<\\/h4>/gi)") &&
    source.includes("function splitIngredientText(text)") &&
    source.includes("depth === 0") &&
    source.includes("ingredients.length < 5") &&
    !source.includes("product-lookup") &&
    !source.includes("puppeteer") &&
    !source.includes("cheerio"),
  "script must parse official Open Farm ingredient modal data without product-lookup or browser scraping"
);

assert(
  source.includes("function parseNutrientPanel(html, sourceUrl)") &&
    source.includes("guaranteed analysis") &&
    source.includes("protein_pct") &&
    source.includes("fat_pct") &&
    source.includes("fiber_pct") &&
    source.includes("moisture_pct") &&
    source.includes("omega_3_pct") &&
    source.includes("omega_6_pct") &&
    source.includes("calories_per_cup") &&
    source.includes("calories_per_kg") &&
    source.includes("basis: \"as-fed\""),
  "script must parse official Open Farm guaranteed analysis and calorie fields into the nutrient-panel contract"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
    source.includes("/rest/v1/product_data") &&
    source.includes("brand=ilike.Open%20Farm*") &&
    source.includes("Existing Open Farm keys skipped") &&
    source.includes("includeExisting"),
  "script must skip existing Open Farm product_data aliases unless explicitly included"
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
  "script must write official Open Farm ingredients through service-role product_data RPCs and verify nutrient writes"
);

assert(
  source.includes("source: \"openfarm_official_product_data\"") &&
    source.includes("source: \"brand_site\"") &&
    source.includes("ingredientText: ingredients.join(\", \")") &&
    source.includes("summary: summarizeParsed(targets)") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64") &&
    !source.includes("modelOutput"),
  "exported parsed manifest must be official product data only, with no model output or image payloads"
);

assert(
  packageJson.includes('"backfill:openfarm-official-products": "node scripts/backfill-openfarm-official-products.js"') &&
    packageJson.includes('"test:openfarm-official-product-backfill": "node scripts/test-openfarm-official-product-backfill-guards.js"') &&
    packageJson.includes("npm run test:openfarm-official-product-backfill"),
  "package scripts must expose Open Farm official product backfill and include its guard in test:guards"
);

console.log("Open Farm official product backfill guard passed");
