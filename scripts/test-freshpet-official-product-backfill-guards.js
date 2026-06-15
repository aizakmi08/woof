#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/backfill-freshpet-official-products.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Freshpet official product backfill guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("FRESHPET_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("PRODUCT_LOOKUP_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("Set FRESHPET_PRODUCT_IMPORT_SERVICE_KEY, PRODUCT_LOOKUP_SERVICE_KEY, or Supabase service key") &&
    source.includes("if (!dryRun && !FRESHPET_PRODUCT_IMPORT_SERVICE_KEY)"),
  "official Freshpet product import must be env-quiet and service-key gated for writes"
);

assert(
  source.includes("DEFAULT_INPUT = \".tmp/freshpet-sitemap-catalog-targets.json\"") &&
    source.includes("DEFAULT_EXPORT_PARSED = \".tmp/freshpet-official-product-data.json\"") &&
    source.includes("--dry-run") &&
    source.includes("--export-parsed=path.json") &&
    source.includes("--resume-report") &&
    source.includes("--include-existing") &&
    source.includes("--concurrency=N") &&
    source.includes("MAX_CONCURRENCY = 4"),
  "script must support bounded dry-run/export/report/resume options for service-key batches"
);

assert(
  source.includes("freshpet\\.com\\/products") &&
    source.includes("function parseProductFromHtml(html)") &&
    source.includes("__NEXT_DATA__") &&
    source.includes("json?.props?.pageProps?.product?.data") &&
    source.includes("function splitIngredientText(text)") &&
    source.includes("product.allIngredients") &&
    source.includes("parenDepth === 0") &&
    source.includes("ingredients.length < 5") &&
    !source.includes("product-lookup") &&
    !source.includes("puppeteer") &&
    !source.includes("cheerio"),
  "script must parse official Freshpet structured page ingredients without product-lookup or browser scraping"
);

assert(
  source.includes("function parseNutrientPanel(product, sourceUrl)") &&
    source.includes("fullGuaranteedAnalysis") &&
    source.includes("nutrientAnalysis") &&
    source.includes("mineralAnalysis") &&
    source.includes("essentialFattyAcidAnalysis") &&
    source.includes("protein_pct") &&
    source.includes("fat_pct") &&
    source.includes("fiber_pct") &&
    source.includes("moisture_pct") &&
    source.includes("calcium_pct") &&
    source.includes("phosphorus_pct") &&
    source.includes("calories_per_cup") &&
    source.includes("calories_per_kg") &&
    source.includes("basis: \"as-fed\""),
  "script must parse official Freshpet guaranteed analysis and calorie fields into the nutrient-panel contract"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
    source.includes("/rest/v1/product_data") &&
    source.includes("brand.ilike.*Freshpet*") &&
    source.includes("Existing Freshpet keys skipped") &&
    source.includes("includeExisting"),
  "script must skip existing Freshpet product_data aliases unless explicitly included"
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
  "script must write official Freshpet ingredients through service-role product_data RPCs and verify nutrient writes"
);

assert(
  source.includes("source: \"freshpet_official_product_data\"") &&
    source.includes("source: \"brand_site\"") &&
    source.includes("officialProductName") &&
    source.includes("ingredientText: ingredients.join(\", \")") &&
    source.includes("summary: summarizeParsed(targets)") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64") &&
    !source.includes("modelOutput"),
  "exported parsed manifest must be official product data only, with no model output or image payloads"
);

assert(
  packageJson.includes('"backfill:freshpet-official-products": "node scripts/backfill-freshpet-official-products.js"') &&
    packageJson.includes('"test:freshpet-official-product-backfill": "node scripts/test-freshpet-official-product-backfill-guards.js"') &&
    packageJson.includes("npm run test:freshpet-official-product-backfill"),
  "package scripts must expose Freshpet official product backfill and include its guard in test:guards"
);

console.log("Freshpet official product backfill guard passed");
