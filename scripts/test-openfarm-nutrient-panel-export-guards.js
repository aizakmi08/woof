#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-openfarm-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Open Farm nutrient panel export guard failed: ${message}`);
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
  source.includes("https://openfarmpet.com/products.json?limit=250") &&
    source.includes("const BRAND = \"Open Farm\"") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchProducts()") &&
    source.includes("fetchText(sourceUrl)") &&
    source.includes("parseGuaranteedAnalysis(html, sourceUrl)") &&
    source.includes("Guaranteed Analysis") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Open Farm product feed/pages and avoid product-lookup or browser scraping"
);

assert(
  source.includes("KEEP_PRODUCT_TYPES") &&
    source.includes("\"Dog Food\"") &&
    source.includes("\"Cat Food\"") &&
    source.includes("KEEP_PRODUCT_TYPE_TAGS") &&
    source.includes("\"_productType::dry\"") &&
    source.includes("\"_productType::wet\"") &&
    source.includes("\"_productType::frozen\"") &&
    source.includes("\"_productType::freeze_dried\"") &&
    source.includes("REJECT_PRODUCT_TYPE_TAGS") &&
    source.includes("\"_productType::treat\"") &&
    source.includes("\"_productType::supplement\"") &&
    source.includes("\"_productType::bonebroth\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"variety pack\"") &&
    source.includes("\"meal plan\"") &&
    source.includes("tags.has(\"_complete::yes\")") &&
    source.includes("tags.has(\"_complete::no\")") &&
    source.includes("hasRegexTag(tags, /^(_hidden|_nonsalable|YBlocklist)$/i)") &&
    source.includes("function inferPetType(product, tags)"),
  "exporter must keep complete Open Farm dog/cat foods and reject treats, supplements, broths, bundles, hidden rows, and non-food rows"
);

assert(
  source.includes("fetchExistingOpenFarmAliases") &&
    source.includes("brand: \"ilike.Open Farm\"") &&
    source.includes("select: \"cache_key,product_name,brand\"") &&
    source.includes("Authorization: `Bearer ${SUPABASE_ANON_KEY}`") &&
    source.includes("matchCatalogRow(product, existingAliases)") &&
    source.includes("missingCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must match official page panels to existing product_data cache keys before making write-ready targets"
);

assert(
  source.includes("[/^crude protein\\b/i, \"protein_pct\"]") &&
    source.includes("[/^crude fat\\b/i, \"fat_pct\"]") &&
    source.includes("[/^crude fib(?:er|re)\\b/i, \"fiber_pct\"]") &&
    source.includes("[/^moisture\\b/i, \"moisture_pct\"]") &&
    source.includes("[/^calcium\\b/i, \"calcium_pct\"]") &&
    source.includes("[/^phosphorus\\b/i, \"phosphorus_pct\"]") &&
    source.includes("[/^omega[-\\s]*3\\b/i, \"omega_3_pct\"]") &&
    source.includes("[/^omega[-\\s]*6\\b/i, \"omega_6_pct\"]") &&
    source.includes("panel.calories_per_kg") &&
    source.includes("panel.calories_per_cup") &&
    source.includes("basis: \"as-fed\"") &&
    source.includes("numericCount < 2"),
  "exporter must normalize guaranteed-analysis percentages and calorie fields into validated nutrientPanel shape"
);

assert(
  source.includes("source: \"openfarm_official_product_page\"") &&
    source.includes("nutrientPanel: panel") &&
    source.includes("sourceUrl,") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText") &&
    !source.includes("ingredients_text") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64"),
  "targets must be nutrient-backfill-compatible and must not export ingredients, analysis payloads, or image-base64 data"
);

assert(
  packageJson.includes('"export:openfarm-nutrient-panels": "node scripts/export-openfarm-nutrient-panels.js"') &&
    packageJson.includes('"test:openfarm-nutrient-panel-export": "node scripts/test-openfarm-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:openfarm-nutrient-panel-export"),
  "package scripts must expose Open Farm nutrient exporter and include its guard in test:guards"
);

console.log("Open Farm nutrient panel export guard passed");
