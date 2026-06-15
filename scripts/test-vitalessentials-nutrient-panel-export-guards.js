#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-vitalessentials-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Vital Essentials nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.vitalessentials.com/sitemap.xml") &&
    source.includes("const BRAND = \"Vital Essentials\"") &&
    source.includes("parseNextPageData(html)") &&
    source.includes("__NEXT_DATA__") &&
    source.includes("pageData?.product?.metafields?.veraw") &&
    source.includes("crude_protein_min") &&
    source.includes("crude_fat_min") &&
    source.includes("calorie_content") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official sitemap/product pages and parse embedded Vital Essentials metafields without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"mixins\"") &&
    source.includes("\"variety pack\"") &&
    source.includes("return \"freeze_dried_soft_nibs\"") &&
    source.includes("return \"freeze_dried_micro_nibs\"") &&
    source.includes("return \"freeze_dried_mini_nibs\"") &&
    source.includes("return \"freeze_dried_nibs\"") &&
    source.includes("return \"frozen_mini_patties\"") &&
    source.includes("return \"freeze_dried_mini_patties\"") &&
    source.includes("return \"frozen_patties\"") &&
    source.includes("return \"raw_fusion_patties\""),
  "exporter must reject non-food rows and separate Vital Essentials forms before matching"
);

assert(
  source.includes("fetchExistingRows") &&
    source.includes("select=cache_key,product_name,brand") &&
    source.includes("Authorization: `Bearer ${SUPABASE_ANON_KEY}`") &&
    source.includes("isVitalEssentialsRow(row)") &&
    source.includes("sameProteinSet(target, row)") &&
    source.includes("row.petType === target.petType") &&
    source.includes("row.productForm === target.productForm") &&
    source.includes("missingCatalogAlias") &&
    source.includes("ambiguousCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must match official page panels to existing Vital Essentials product_data cache keys before making write-ready targets"
);

assert(
  source.includes("source: \"vitalessentials_official_product_page\"") &&
    source.includes("nutrientPanel: candidate.nutrientPanel") &&
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
  packageJson.includes('"export:vitalessentials-nutrient-panels": "node scripts/export-vitalessentials-nutrient-panels.js"') &&
    packageJson.includes('"test:vitalessentials-nutrient-panel-export": "node scripts/test-vitalessentials-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:vitalessentials-nutrient-panel-export"),
  "package scripts must expose Vital Essentials nutrient exporter and include its guard in test:guards"
);

console.log("Vital Essentials nutrient panel export guard passed");
