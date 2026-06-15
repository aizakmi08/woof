#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-instinct-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Instinct nutrient panel export guard failed: ${message}`);
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
  source.includes("https://instinctpetfood.com/product-sitemap.xml") &&
    source.includes("const BRAND = \"Instinct\"") &&
    source.includes("parseSitemapRows(xml)") &&
    source.includes("instinctpetfood\\.com\\/products") &&
    source.includes("response.status === 429 || response.status >= 500") &&
    source.includes("response.headers.get(\"retry-after\")") &&
    source.includes("parseNutrientPanel(await fetchText(candidate.sourceUrl), candidate.sourceUrl)") &&
    source.includes("<strong>\\s*Guaranteed Analysis\\s*<\\/strong>") &&
    source.includes("nutrition-cell") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Instinct sitemap/product pages and parse published Guaranteed Analysis without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"raw boost mixers\"") &&
    source.includes("\"raw boost shakers\"") &&
    source.includes("\"healthy cravings\"") &&
    source.includes("\"mobility support\"") &&
    source.includes("\"digestive health\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"treats\""),
  "exporter must reject Instinct treats, toppers, mixers, shakers, supplements, and support products"
);

assert(
  source.includes("function isInstinctCatalogRow(row)") &&
    source.includes("/^instinct\\b/.test(brand)") &&
    source.includes("combined.includes(\"purina\") || combined.includes(\"true instinct\")") &&
    source.includes("function lineTokens(value)") &&
    source.includes("raw_longevity") &&
    source.includes("raw_boost") &&
    source.includes("limited_ingredient") &&
    source.includes("ultimate_protein") &&
    source.includes("freshdried_bites") &&
    source.includes("freshdried_pates") &&
    source.includes("LINE_CONFLICT_GROUPS") &&
    source.includes("lineCompatible(target, row)") &&
    source.includes("proteinCompatible(target, row)") &&
    source.includes("distinctiveCompatible(target, row)") &&
    source.includes("row.productForm === target.form") &&
    source.includes("row.petType === target.petType"),
  "exporter must exclude Purina True Instinct noise and match by species, form, line, protein, and distinctive recipe tokens"
);

assert(
  source.includes("source: \"instinct_official_product_page\"") &&
    source.includes("nutrientPanel: parsed.panel") &&
    source.includes("sourceUrl: candidate.sourceUrl") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText") &&
    !source.includes("ingredients_text") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64"),
  "targets must stay nutrient-backfill-compatible and avoid ingredient, analysis payload, or image-base64 data"
);

assert(
  packageJson.includes('"export:instinct-nutrient-panels": "node scripts/export-instinct-nutrient-panels.js"') &&
    packageJson.includes('"test:instinct-nutrient-panel-export": "node scripts/test-instinct-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:instinct-nutrient-panel-export"),
  "package scripts must expose Instinct nutrient exporter and include its guard in test:guards"
);

console.log("Instinct nutrient panel export guard passed");
