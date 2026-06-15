#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-hillspet-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Hill's nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.hillspet.com/sitemap.xml") &&
    source.includes("const BRAND = \"Hill's\"") &&
    source.includes("parseSitemapRows(xml)") &&
    source.includes("hillspet\\.com\\/(dog-food|cat-food)") &&
    source.includes("response.status === 429 || response.status >= 500") &&
    source.includes("response.headers.get(\"retry-after\")") &&
    source.includes("parseOfficialProductName(html)") &&
    source.includes("<b>\\s*Nutrient\\s*<\\/b>") &&
    source.includes("Dry\\s*Matter") &&
    source.includes("kcal\\s*\\/\\s*kg") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Hill's sitemap/product pages and parse published dry-matter nutrition tables without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"treats\"") &&
    source.includes("\"snacks\"") &&
    source.includes("\"variety pack\""),
  "exporter must reject Hill's treats, snacks, and variety packs"
);

assert(
  source.includes("function isHillsCatalogRow(row)") &&
    source.includes("function matchCandidates(target, rows)") &&
    source.includes("row.petType === target.petType") &&
    source.includes("row.productForm === target.productForm") &&
    source.includes("markerCompatible(target, row)") &&
    source.includes("proteinCompatible(target, row)") &&
    source.includes("distinctiveCompatible(target, row)") &&
    source.includes("CONFLICT_MARKER_GROUPS") &&
    source.includes("PROTEIN_TERMS"),
  "exporter must match Hill's rows by species, explicit form, line/marker compatibility, proteins, and distinctive tokens"
);

assert(
  source.includes("basis: \"dry-matter\"") &&
    source.includes("source: \"hillspet_official_product_page\"") &&
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
  packageJson.includes('"export:hillspet-nutrient-panels": "node scripts/export-hillspet-nutrient-panels.js"') &&
    packageJson.includes('"test:hillspet-nutrient-panel-export": "node scripts/test-hillspet-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:hillspet-nutrient-panel-export"),
  "package scripts must expose Hill's nutrient exporter and include its guard in test:guards"
);

console.log("Hill's nutrient panel export guard passed");
