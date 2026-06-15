#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-ziwi-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`ZIWI nutrient panel export guard failed: ${message}`);
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
  source.includes("https://us.ziwipets.com/sitemap.xml") &&
    source.includes("extractSitemapUrls") &&
    source.includes("sitemap_products_") &&
    source.includes("fetchProductUrls") &&
    source.includes("parseGuaranteedAnalysis(html, candidate.sourceUrl)") &&
    source.includes("crude protein") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official ZIWI sitemap/product pages and avoid product-lookup or browser scraping"
);

assert(
  source.includes("KEEP_TERMS") &&
    source.includes("\"air dried\"") &&
    source.includes("\"steam dried\"") &&
    source.includes("\"wet\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"tripe for dogs\"") &&
    source.includes("\"green tripe\"") &&
    source.includes("\"trachea\"") &&
    source.includes("\"chew\"") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("inferPetType") &&
    source.includes("formFromSlug"),
  "exporter must keep ZIWI dog/cat food pages and reject treats, chews, toppers, organs, bundles, and non-food rows"
);

assert(
  source.includes("fetchExistingAliases") &&
    source.includes("select=cache_key,product_name,brand") &&
    source.includes("isZiwiRow") &&
    source.includes("matchCatalogRow(candidate, existingAliases)") &&
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
    source.includes("[/^ash\\b/i, \"ash_pct\"]") &&
    source.includes("[/^calcium\\b/i, \"calcium_pct\"]") &&
    source.includes("[/^phosphorus\\b/i, \"phosphorus_pct\"]") &&
    source.includes("panel.calories_per_kg") &&
    source.includes("panel.calories_per_cup") &&
    source.includes("basis: \"as-fed\"") &&
    source.includes("numericCount < 2"),
  "exporter must normalize guaranteed-analysis percentages and calorie fields into validated nutrientPanel shape"
);

assert(
  source.includes("source: \"ziwi_official_product_page\"") &&
    source.includes("nutrientPanel: panel") &&
    source.includes("sourceUrl: candidate.sourceUrl") &&
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
  packageJson.includes('"export:ziwi-nutrient-panels": "node scripts/export-ziwi-nutrient-panels.js"') &&
    packageJson.includes('"test:ziwi-nutrient-panel-export": "node scripts/test-ziwi-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:ziwi-nutrient-panel-export"),
  "package scripts must expose ZIWI nutrient exporter and include its guard in test:guards"
);

console.log("ZIWI nutrient panel export guard passed");
