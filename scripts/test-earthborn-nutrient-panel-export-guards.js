#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-earthborn-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Earthborn nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.earthbornholisticpetfood.com/product-sitemap.xml") &&
    source.includes("const BRAND = \"Earthborn Holistic\"") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan") &&
    source.includes("fetchText(sitemapUrl, \"application/xml,text/xml,*/*;q=0.8\")") &&
    source.includes("parseNutrientPanel(await fetchText(candidate.sourceUrl), candidate.sourceUrl)") &&
    source.includes("earthbornholisticpetfood\\.com\\/product\\/(?:dog-food|cat-food)") &&
    source.includes("guaranteed analysis") &&
    source.includes("Metabolizable Energy") &&
    source.includes("crude\\s+protein") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Earthborn sitemap/product pages and parse published Guaranteed Analysis without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"earthbites\"") &&
    source.includes("\"treats\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"intl\"") &&
    source.includes("function isCandidateFoodUrl(url)") &&
    source.includes("dog-food") &&
    source.includes("cat-food") &&
    source.includes("formFromPath(parsed)") &&
    source.includes("return \"wet\"") &&
    source.includes("return \"dry\""),
  "exporter must keep only official complete dog/cat food rows and reject treats, international rows, supplements, and non-food rows"
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
    source.includes("weakTargetTokens"),
  "exporter must match official panels to existing Earthborn catalog rows by species, form, life stage, protein compatibility, and distinctive recipe tokens"
);

assert(
  source.includes("source: \"earthborn_official_product_page\"") &&
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
  packageJson.includes('"export:earthborn-nutrient-panels": "node scripts/export-earthborn-nutrient-panels.js"') &&
    packageJson.includes('"test:earthborn-nutrient-panel-export": "node scripts/test-earthborn-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:earthborn-nutrient-panel-export"),
  "package scripts must expose Earthborn nutrient exporter and include its guard in test:guards"
);

console.log("Earthborn nutrient panel export guard passed");
