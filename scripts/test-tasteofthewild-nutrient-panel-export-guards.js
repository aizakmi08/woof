#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-tasteofthewild-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Taste of the Wild nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.tasteofthewildpetfood.com/dog/taste-of-the-wild/") &&
    source.includes("https://www.tasteofthewildpetfood.com/cat/taste-of-the-wild/") &&
    source.includes("https://www.tasteofthewildpetfood.com/dog/prey/") &&
    source.includes("https://www.tasteofthewildpetfood.com/cat/prey/") &&
    source.includes("https://www.tasteofthewildpetfood.com/recipe-finder/?_sfm_umbrella_brand=totw") &&
    source.includes("https://www.tasteofthewildpetfood.com/recipe-finder/?_sfm_umbrella_brand=prey") &&
    source.includes("const RETRY_HTTP_STATUS = new Set([429, 503])") &&
    source.includes("const retryAfter = Number(response.headers.get(\"retry-after\"))") &&
    source.includes("tasteofthewildpetfood\\.com\\/(dog|cat)\\/(ancient-grains|grain-free|prey)") &&
    source.includes("parseNutrientPanel(html, sourceUrl)") &&
    source.includes("guaranteed analysis") &&
    source.includes("Calorie Content") &&
    source.includes("Crude\\s+Protein") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Taste of the Wild product pages and parse published Guaranteed Analysis without product-lookup or browser scraping"
);

assert(
  source.includes("DISTINCTIVE_STOP_TOKENS") &&
    source.includes("distinctiveTokens") &&
    source.includes("formCompatible(target, row)") &&
    source.includes("hasLifeStageConflict(target, row)") &&
    source.includes("proteinCompatible(target, row)") &&
    source.includes("preferMostSpecificMatches(target, matches)") &&
    source.includes("isSubsetOfText(target.distinctiveTokens, row.normalizedText)") &&
    source.includes("row.petType === target.petType") &&
    source.includes("missingCatalogAlias") &&
    source.includes("ambiguousCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must match official panels to existing Taste of the Wild catalog rows by species, form, life stage, protein compatibility, and distinctive recipe tokens"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"supplement\"") &&
    source.includes("source: \"tasteofthewild_official_product_page\"") &&
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
  packageJson.includes('"export:tasteofthewild-nutrient-panels": "node scripts/export-tasteofthewild-nutrient-panels.js"') &&
    packageJson.includes('"test:tasteofthewild-nutrient-panel-export": "node scripts/test-tasteofthewild-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:tasteofthewild-nutrient-panel-export"),
  "package scripts must expose Taste of the Wild nutrient exporter and include its guard in test:guards"
);

console.log("Taste of the Wild nutrient panel export guard passed");
