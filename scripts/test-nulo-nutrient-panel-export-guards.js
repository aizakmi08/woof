#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-nulo-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Nulo nutrient panel export guard failed: ${message}`);
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
  source.includes("https://nulo.com/sitemap-products.xml") &&
    source.includes("const BRAND = \"Nulo\"") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan") &&
    source.includes("fetchText(sitemapUrl, \"application/xml,text/xml,*/*;q=0.8\")") &&
    source.includes("parseProductPage(await fetchText(row.sourceUrl), row)") &&
    source.includes("application\\/ld\\+json") &&
    source.includes("additionalProperty") &&
    source.includes("ingredientsanalysistable") &&
    source.includes("caloriecontent") &&
    source.includes("crude\\s+protein") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Nulo sitemap/product JSON-LD and parse published Guaranteed Analysis without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"perfect puree\"") &&
    source.includes("\"bone broth\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"treats\"") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("function isCandidateSitemapRow(row)") &&
    source.includes("signature stew") &&
    source.includes("high protein kibble") &&
    source.includes("inferProductFormFromText") &&
    source.includes("return \"wet\"") &&
    source.includes("return \"dry\""),
  "exporter must keep complete Nulo dog/cat foods and reject treats, broths, purees, supplements, and non-core rows"
);

assert(
  source.includes("DISTINCTIVE_STOP_TOKENS") &&
    source.includes("\"https\"") &&
    source.includes("\"products\"") &&
    source.includes("function matchState(target, rows)") &&
    source.includes("target.proteinTokens.length === 0") &&
    source.includes("target.distinctiveTokens.length < 2") &&
    source.includes("petTypeCompatible(target, row)") &&
    source.includes("strongUnknownCatalogAgreement(target, row)") &&
    source.includes("formCompatible(target, row)") &&
    source.includes("productFormCompatible(target, row)") &&
    source.includes("lineCompatible(target, row)") &&
    source.includes("hasLifeStageConflict(target, row)") &&
    source.includes("proteinCompatible(target, row)") &&
    source.includes("distinctiveCompatible(target, row)") &&
    source.includes("missingCatalogAlias") &&
    source.includes("weakTargetTokens"),
  "exporter must match official panels to existing Nulo catalog rows by species, form, line, life stage, exact protein tokens, and at least two distinctive recipe tokens"
);

assert(
  source.includes("source: \"nulo_official_product_page\"") &&
    source.includes("nutrientPanel: parsed.panel") &&
    source.includes("sourceUrl: parsed.candidate.sourceUrl") &&
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
  packageJson.includes('"export:nulo-nutrient-panels": "node scripts/export-nulo-nutrient-panels.js"') &&
    packageJson.includes('"test:nulo-nutrient-panel-export": "node scripts/test-nulo-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:nulo-nutrient-panel-export"),
  "package scripts must expose Nulo nutrient exporter and include its guard in test:guards"
);

console.log("Nulo nutrient panel export guard passed");
