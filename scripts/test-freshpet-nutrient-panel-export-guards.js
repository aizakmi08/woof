#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-freshpet-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Freshpet nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.freshpet.com/sitemap.xml") &&
    source.includes("const BRAND = \"Freshpet\"") &&
    source.includes("parseLocs(sitemapXml)") &&
    source.includes("freshpet\\.com\\/products") &&
    source.includes("response.status === 429 || response.status >= 500") &&
    source.includes("response.headers.get(\"retry-after\")") &&
    source.includes("parseProductFromHtml") &&
    source.includes("__NEXT_DATA__") &&
    source.includes("fullGuaranteedAnalysis") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Freshpet sitemap/product pages and parse published nutrition payloads without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"dognation\"") &&
    source.includes("\"dog joy\"") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\""),
  "exporter must reject Freshpet treats, toppers, and supplemental rows"
);

assert(
  source.includes("function matchCandidates(target, rows)") &&
    source.includes("markersCompatible(target, row)") &&
    source.includes("proteinsCompatible(target, row)") &&
    source.includes("distinctiveCompatible(target, row)") &&
    source.includes("matches.length === 1") &&
    source.includes("CONFLICT_MARKER_GROUPS") &&
    source.includes("PROTEIN_TERMS"),
  "exporter must require unique matches by line/form markers, proteins, and distinctive recipe tokens"
);

assert(
  source.includes("basis: \"as-fed\"") &&
    source.includes("source: \"freshpet_official_product_page\"") &&
    source.includes("nutrientPanel: parsed.panel") &&
    source.includes("sourceUrl,") &&
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
  packageJson.includes('"export:freshpet-nutrient-panels": "node scripts/export-freshpet-nutrient-panels.js"') &&
    packageJson.includes('"test:freshpet-nutrient-panel-export": "node scripts/test-freshpet-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:freshpet-nutrient-panel-export"),
  "package scripts must expose Freshpet nutrient exporter and include its guard in test:guards"
);

console.log("Freshpet nutrient panel export guard passed");
