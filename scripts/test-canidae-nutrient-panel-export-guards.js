#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-canidae-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Canidae nutrient panel export guard failed: ${message}`);
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
  source.includes("https://canidae.com/xmlsitemap.php?type=products&page=1") &&
    source.includes("window\\.stencilBootstrap") &&
    source.includes("productIdFromHtml(html)") &&
    source.includes("cdn11.bigcommerce.com/s-lnkn0tcvqc/content/pdp/products/${productId}.json") &&
    source.includes("\"guaranteed-analysis\"") &&
    source.includes("\"calorie-content\"") &&
    source.includes("crude\\s+protein") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Canidae sitemap/pages and parse official BigCommerce nutrient JSON without product-lookup or browser scraping"
);

assert(
  source.includes("DISTINCTIVE_STOP_TOKENS") &&
    source.includes("distinctiveTokens") &&
    source.includes("isSubsetOfText(target.distinctiveTokens, row.normalizedText)") &&
    source.includes("sameProteinSet(target, row)") &&
    source.includes("row.petType === target.petType") &&
    source.includes("row.productForm === target.form") &&
    source.includes("missingCatalogAlias") &&
    source.includes("ambiguousCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must match official panels to existing Canidae catalog rows by species, form, protein set, and distinctive recipe tokens"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"variety pack\"") &&
    source.includes("source: \"canidae_official_product_json\"") &&
    source.includes("nutrientPanel: parsed.panel") &&
    source.includes("sourceUrl: candidate.sourceUrl") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText") &&
    !source.includes("ingredients_text") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64"),
  "targets must reject non-food rows, stay nutrient-backfill-compatible, and avoid ingredients, analysis payloads, or image-base64 data"
);

assert(
  packageJson.includes('"export:canidae-nutrient-panels": "node scripts/export-canidae-nutrient-panels.js"') &&
    packageJson.includes('"test:canidae-nutrient-panel-export": "node scripts/test-canidae-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:canidae-nutrient-panel-export"),
  "package scripts must expose Canidae nutrient exporter and include its guard in test:guards"
);

console.log("Canidae nutrient panel export guard passed");
