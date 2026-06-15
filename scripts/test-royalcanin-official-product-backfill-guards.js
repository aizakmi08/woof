#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/backfill-royalcanin-official-products.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Royal Canin official product backfill guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("ROYALCANIN_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("PRODUCT_LOOKUP_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("Set ROYALCANIN_PRODUCT_IMPORT_SERVICE_KEY, PRODUCT_LOOKUP_SERVICE_KEY, or Supabase service key") &&
    source.includes("if (!dryRun && !ROYALCANIN_PRODUCT_IMPORT_SERVICE_KEY)"),
  "official Royal Canin product import must be env-quiet and service-key gated for writes"
);

assert(
  source.includes("DEFAULT_INPUT = \".tmp/royalcanin-sitemap-catalog-targets.json\"") &&
    source.includes("DEFAULT_EXPORT_PARSED = \".tmp/royalcanin-official-product-data.json\"") &&
    source.includes("--dry-run") &&
    source.includes("--export-parsed=path.json") &&
    source.includes("--resume-report") &&
    source.includes("--include-existing") &&
    source.includes("--concurrency=N") &&
    source.includes("MAX_CONCURRENCY = 4"),
  "script must support bounded dry-run/export/report/resume options for service-key batches"
);

assert(
  source.includes("www\\.royalcanin\\.com\\/us\\/(dogs|cats)\\/products\\/retail-products") &&
    source.includes("function nutritionContent(html, heading)") &&
    source.includes("data-testid=[\"']product-nutrition-content") &&
    source.includes("function parseIngredients(html)") &&
    source.includes("nutritionContent(html, \"Ingredients\")") &&
    source.includes("nutritionContent(html, \"Composition\")") &&
    source.includes("function splitIngredientText(text)") &&
    source.includes("parenDepth === 0 && bracketDepth === 0") &&
    source.includes("ingredients.length < 5") &&
    !source.includes("product-lookup") &&
    !source.includes("puppeteer") &&
    !source.includes("cheerio"),
  "script must parse official Royal Canin nutrition content without product-lookup or browser scraping"
);

assert(
  source.includes("function parseNutrientPanel(html, sourceUrl)") &&
    source.includes("nutritionContent(html, \"Guaranteed Analysis\")") &&
    source.includes("nutritionContent(html, \"Calorie Content\")") &&
    source.includes("protein_pct") &&
    source.includes("fat_pct") &&
    source.includes("fiber_pct") &&
    source.includes("moisture_pct") &&
    source.includes("calories_per_cup") &&
    source.includes("calories_per_kg") &&
    !source.includes("calories_per_can") &&
    source.includes("basis: \"as-fed\""),
  "script must parse official Royal Canin guaranteed analysis into the supported nutrient-panel contract"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
    source.includes("/rest/v1/product_data") &&
    source.includes("brand=ilike.Royal%20Canin*") &&
    source.includes("Existing Royal Canin keys skipped") &&
    source.includes("includeExisting"),
  "script must skip existing Royal Canin product_data aliases unless explicitly included"
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
  "script must write official Royal Canin ingredients through service-role product_data RPCs and verify nutrient writes"
);

assert(
  source.includes("source: \"royalcanin_official_product_data\"") &&
    source.includes("source: \"brand_site\"") &&
    source.includes("ingredientText: ingredients.join(\", \")") &&
    source.includes("summary: summarizeParsed(targets)") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64") &&
    !source.includes("modelOutput"),
  "exported parsed manifest must be official product data only, with no model output or image payloads"
);

assert(
  packageJson.includes('"backfill:royalcanin-official-products": "node scripts/backfill-royalcanin-official-products.js"') &&
    packageJson.includes('"test:royalcanin-official-product-backfill": "node scripts/test-royalcanin-official-product-backfill-guards.js"') &&
    packageJson.includes("npm run test:royalcanin-official-product-backfill"),
  "package scripts must expose Royal Canin official product backfill and include its guard in test:guards"
);

console.log("Royal Canin official product backfill guard passed");
