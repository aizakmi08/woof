#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/backfill-bluebuffalo-official-products.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Blue Buffalo official product backfill guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("BLUEBUFFALO_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("PRODUCT_LOOKUP_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("Set BLUEBUFFALO_PRODUCT_IMPORT_SERVICE_KEY, PRODUCT_LOOKUP_SERVICE_KEY, or Supabase service key") &&
    source.includes("if (!dryRun && !BLUEBUFFALO_PRODUCT_IMPORT_SERVICE_KEY)"),
  "official Blue Buffalo product import must be env-quiet and service-key gated for writes"
);

assert(
  source.includes("DEFAULT_INPUT = \".tmp/bluebuffalo-sitemap-catalog-targets.json\"") &&
    source.includes("DEFAULT_EXPORT_PARSED = \".tmp/bluebuffalo-official-product-data.json\"") &&
    source.includes("--dry-run") &&
    source.includes("--export-parsed=path.json") &&
    source.includes("--resume-report") &&
    source.includes("--include-existing") &&
    source.includes("--concurrency=N") &&
    source.includes("MAX_CONCURRENCY = 4"),
  "script must support bounded dry-run/export/report/resume options for service-key batches"
);

assert(
  source.includes("www\\.bluebuffalo\\.com\\/") &&
    source.includes("function extractWindowAssignment(html, name)") &&
    source.includes("extractWindowAssignment(html, \"ingredientsJson\")") &&
    source.includes("JSON.parse(raw)") &&
    source.includes("function splitIngredientsFromNames(names)") &&
    source.includes("ingredients.length < 5") &&
    !source.includes("product-lookup") &&
    !source.includes("puppeteer") &&
    !source.includes("cheerio"),
  "script must parse official Blue Buffalo ingredients from static page data without product-lookup or browser scraping"
);

assert(
  source.includes("function parseNutrientPanel(html, sourceUrl)") &&
    source.includes("extractWindowAssignment(html, \"guaranteedAnalysisHtml\")") &&
    source.includes("extractWindowAssignment(html, \"feedingGuidelinesHtml\")") &&
    source.includes("protein_pct") &&
    source.includes("fat_pct") &&
    source.includes("fiber_pct") &&
    source.includes("moisture_pct") &&
    source.includes("omega_3_pct") &&
    source.includes("omega_6_pct") &&
    source.includes("calories_per_cup") &&
    source.includes("calories_per_kg") &&
    source.includes("basis: \"as-fed\""),
  "script must parse official Blue Buffalo guaranteed analysis and calorie fields into the nutrient-panel contract"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
    source.includes("/rest/v1/product_data") &&
    source.includes("brand.ilike.*Blue%20Buffalo*") &&
    source.includes("Existing Blue Buffalo keys skipped") &&
    source.includes("includeExisting"),
  "script must skip existing Blue Buffalo product_data aliases unless explicitly included"
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
  "script must write official Blue Buffalo ingredients through service-role product_data RPCs and verify nutrient writes"
);

assert(
  source.includes("source: \"bluebuffalo_official_product_data\"") &&
    source.includes("source: \"brand_site\"") &&
    source.includes("ingredientText: ingredients.join(\", \")") &&
    source.includes("summary: summarizeParsed(targets)") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64") &&
    !source.includes("modelOutput"),
  "exported parsed manifest must be official product data only, with no model output or image payloads"
);

assert(
  packageJson.includes('"backfill:bluebuffalo-official-products": "node scripts/backfill-bluebuffalo-official-products.js"') &&
    packageJson.includes('"test:bluebuffalo-official-product-backfill": "node scripts/test-bluebuffalo-official-product-backfill-guards.js"') &&
    packageJson.includes("npm run test:bluebuffalo-official-product-backfill"),
  "package scripts must expose Blue Buffalo official product backfill and include its guard in test:guards"
);

console.log("Blue Buffalo official product backfill guard passed");
