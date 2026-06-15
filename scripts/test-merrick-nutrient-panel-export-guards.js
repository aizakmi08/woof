#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-merrick-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Merrick nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.merrickpetcare.com/sitemaps/default/sitemap.xml") &&
    source.includes("const BRAND = \"Merrick\"") &&
    source.includes("parseSitemapRows(xml)") &&
    source.includes("merrickpetcare\\.com\\/shop") &&
    source.includes("response.status === 429 || response.status >= 500") &&
    source.includes("response.headers.get(\"retry-after\")") &&
    source.includes("parseOfficialProductName(html)") &&
    source.includes("Guaranteed Analysis") &&
    source.includes("Calorie Content") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Merrick sitemap/product pages and parse published nutrition blocks without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"variety pack\"") &&
    source.includes("\"bone broth\""),
  "exporter must reject Merrick treats, toppers, broths, bundles, and variety packs"
);

assert(
  source.includes("function isMerrickCatalogRow(row)") &&
    source.includes("function matchCandidates(target, rows)") &&
    source.includes("row.petType === target.petType") &&
    source.includes("row.productForm === target.productForm") &&
    source.includes("markerCompatible(target, row)") &&
    source.includes("proteinCompatible(target, row)") &&
    source.includes("distinctiveCompatible(target, row)") &&
    source.includes("CONFLICT_MARKER_GROUPS") &&
    source.includes("PROTEIN_TERMS"),
  "exporter must match Merrick rows by species, form, line/marker compatibility, proteins, and distinctive tokens"
);

assert(
  source.includes("basis: \"as-fed\"") &&
    source.includes("source: \"merrick_official_product_page\"") &&
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
  packageJson.includes('"export:merrick-nutrient-panels": "node scripts/export-merrick-nutrient-panels.js"') &&
    packageJson.includes('"test:merrick-nutrient-panel-export": "node scripts/test-merrick-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:merrick-nutrient-panel-export"),
  "package scripts must expose Merrick nutrient exporter and include its guard in test:guards"
);

console.log("Merrick nutrient panel export guard passed");
