#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-honestkitchen-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`The Honest Kitchen nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.thehonestkitchen.com/sitemap.xml") &&
    source.includes("extractProductSitemaps") &&
    source.includes("sitemap_products_") &&
    source.includes("fetchProductUrls") &&
    source.includes("parseNutritionPanel(html, candidate.sourceUrl)") &&
    source.includes("nutrition calories:") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official The Honest Kitchen sitemap/product pages and avoid product-lookup or browser scraping"
);

assert(
  source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"whole food clusters\"") &&
    source.includes("\"dehydrated dog food\"") &&
    source.includes("\"one pot stew\"") &&
    source.includes("\"butcher block pate\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"bone broth\"") &&
    source.includes("\"variety pack\"") &&
    source.includes("inferPetType") &&
    source.includes("isCandidateFoodUrl"),
  "exporter must keep complete Honest Kitchen dog/cat food pages and reject treats, supplements, toppers, broths, bundles, and non-food rows"
);

assert(
  source.includes("TOKEN_STOP_WORDS") &&
    source.includes("meaningfulTokens") &&
    source.includes("matchState(candidate, existingRows)") &&
    source.includes("target.matchTokens.every((token) => row.tokenSet.has(token))") &&
    source.includes("matches.length === 1") &&
    source.includes("ambiguousCatalogAlias") &&
    source.includes("missingCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must require unique deterministic token-subset matching before making write-ready targets"
);

assert(
  source.includes("panel.calories_per_cup") &&
    source.includes("[\"Protein\", \"protein_pct\"]") &&
    source.includes("[\"Fat\", \"fat_pct\"]") &&
    source.includes("[\"Fiber\", \"fiber_pct\"]") &&
    source.includes("[\"Moisture\", \"moisture_pct\"]") &&
    source.includes("basis: \"as-fed\"") &&
    source.includes("numericCount < 2"),
  "exporter must normalize official nutrition calories/macros into validated nutrientPanel shape"
);

assert(
  source.includes("source: \"honestkitchen_official_product_page\"") &&
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
  packageJson.includes('"export:honestkitchen-nutrient-panels": "node scripts/export-honestkitchen-nutrient-panels.js"') &&
    packageJson.includes('"test:honestkitchen-nutrient-panel-export": "node scripts/test-honestkitchen-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:honestkitchen-nutrient-panel-export"),
  "package scripts must expose The Honest Kitchen nutrient exporter and include its guard in test:guards"
);

console.log("The Honest Kitchen nutrient panel export guard passed");
