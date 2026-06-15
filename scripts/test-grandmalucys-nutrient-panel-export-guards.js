#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-grandmalucys-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Grandma Lucy's nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.grandmalucys.com/products.json?limit=250") &&
    source.includes("const BRAND = \"Grandma Lucy's\"") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchProducts()") &&
    source.includes("parseGuaranteedAnalysis(product.body_html, url)") &&
    source.includes("guaranteed analysis") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Grandma Lucy's Shopify JSON and avoid product-lookup or browser scraping"
);

assert(
  source.includes("COMPLETE_FOOD_LINE_TERMS") &&
    source.includes("\"artisan\"") &&
    source.includes("\"pureformance\"") &&
    source.includes("\"macanna\"") &&
    source.includes("\"3 bears\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"pre-mix\"") &&
    source.includes("\"simple replacement\"") &&
    source.includes("\"top it\"") &&
    source.includes("\"sample\"") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"supplement\"") &&
    source.includes("isCandidateFoodProduct"),
  "exporter must keep complete Grandma Lucy's food lines and reject samples, premixes, replacements, toppers, treats, supplements, bundles, and non-food rows"
);

assert(
    source.includes("fetchExistingAliases") &&
    source.includes("isGrandmaLucysRow") &&
    source.includes("!/grandma mae/i") &&
    source.includes("Authorization: `Bearer ${SUPABASE_ANON_KEY}`") &&
    source.includes("matchCatalogRow(product, aliases)") &&
    source.includes("missingCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must match official panels to existing Grandma Lucy's product_data aliases before making write-ready targets"
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
  "exporter must normalize Guaranteed Analysis percentages and calorie fields into the nutrientPanel shape"
);

assert(
  source.includes("source: \"grandmalucys_official_shopify_json\"") &&
    source.includes("nutrientPanel: panel") &&
    source.includes("sourceUrl: url") &&
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
  packageJson.includes('"export:grandmalucys-nutrient-panels": "node scripts/export-grandmalucys-nutrient-panels.js"') &&
    packageJson.includes('"test:grandmalucys-nutrient-panel-export": "node scripts/test-grandmalucys-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:grandmalucys-nutrient-panel-export"),
  "package scripts must expose Grandma Lucy's nutrient exporter and include its guard in test:guards"
);

console.log("Grandma Lucy's nutrient panel export guard passed");
