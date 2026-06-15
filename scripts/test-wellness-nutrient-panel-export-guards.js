#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-wellness-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Wellness nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.wellnesspetfood.com/salsify-products-sitemap.xml") &&
    source.includes("productMetadataFromHtml(html, fallbackUrl)") &&
    source.includes("application\\/ld\\+json") &&
    source.includes("parseNutrientPanel(html, sourceUrl)") &&
    source.includes("guaranteedAnalysisModal") &&
    source.includes("crude\\s+protein") &&
    source.includes("crude\\s+fat") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Wellness sitemap/product pages and parse published Guaranteed Analysis without product-lookup or browser scraping"
);

assert(
  source.includes("DISTINCTIVE_STOP_TOKENS") &&
    source.includes("CONFLICT_TOKENS") &&
    source.includes("distinctive.length < 3") &&
    source.includes("isSubsetOfText(target.distinctiveTokens, row.normalizedText)") &&
    source.includes("conflictTokensMatch(target, row.normalizedText)") &&
    source.includes("sameProteinSet(target, row)") &&
    source.includes("row.petType === target.petType") &&
    source.includes("row.productForm === target.form") &&
    source.includes("missingCatalogAlias") &&
    source.includes("ambiguousCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must match official panels to existing Wellness catalog rows by species, form, exact protein set, distinctive recipe tokens, and line/life-stage conflict tokens"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"whimzees\"") &&
    source.includes("\"old mother hubbard\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"variety pack\"") &&
    source.includes("source: \"wellness_official_product_page\"") &&
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
  packageJson.includes('"export:wellness-nutrient-panels": "node scripts/export-wellness-nutrient-panels.js"') &&
    packageJson.includes('"test:wellness-nutrient-panel-export": "node scripts/test-wellness-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:wellness-nutrient-panel-export"),
  "package scripts must expose Wellness nutrient exporter and include its guard in test:guards"
);

console.log("Wellness nutrient panel export guard passed");
