#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-koha-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`KOHA nutrient panel export guard failed: ${message}`);
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
  source.includes("https://kohapet.com/products.json?limit=250") &&
    source.includes("const BRAND = \"KOHA\"") &&
    source.includes("fetchProducts()") &&
    source.includes("fetchText(candidate.sourceUrl)") &&
    source.includes("parseGuaranteedAnalysis(html, candidate.sourceUrl)") &&
    source.includes("koha_official_product_page") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official KOHA product feed/pages and avoid product-lookup or browser scraping"
);

assert(
  source.includes("KEEP_TAG_TERMS") &&
    source.includes("\"limited ingredient diet\"") &&
    source.includes("\"stew recipes\"") &&
    source.includes("\"slow cooked stews\"") &&
    source.includes("\"pure shreds\"") &&
    source.includes("\"poke bowl\"") &&
    source.includes("\"bland diet\"") &&
    source.includes("\"raw-bites\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"single ingredient\"") &&
    source.includes("\"hidden\"") &&
    source.includes("\"trial pack\"") &&
    source.includes("\"variety pack\"") &&
    source.includes("\"raw topper\"") &&
    source.includes("\"cod skins\"") &&
    source.includes("\"beef lung\"") &&
    source.includes("function isCandidateFoodProduct(product)") &&
    source.includes("function inferPetType(product)"),
  "exporter must keep species-explicit KOHA foods and reject treats, trial/variety packs, toppers, supplements, chews, and non-food rows"
);

assert(
  source.includes("fetchExistingRows") &&
    source.includes("isKohaRow") &&
    source.includes("rowPetType") &&
    source.includes("rowHasNoExtraProteins") &&
    source.includes("target.proteinTokens") &&
    source.includes("row.proteinSet") &&
    source.includes("target.lineTokens.every") &&
    source.includes("matchState(candidate, existingRows)") &&
    source.includes("ambiguousCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must require same species, matching product-line tokens, and no extra live-row protein tokens before making write-ready targets"
);

assert(
  source.includes("[/^crude protein\\b/i, \"protein_pct\"]") &&
    source.includes("[/^crude fat\\b/i, \"fat_pct\"]") &&
    source.includes("[/^crude fib(?:er|re)\\b/i, \"fiber_pct\"]") &&
    source.includes("[/^moisture\\b/i, \"moisture_pct\"]") &&
    source.includes("[/^calcium\\b/i, \"calcium_pct\"]") &&
    source.includes("[/^phosphorus\\b/i, \"phosphorus_pct\"]") &&
    source.includes("[/^omega[-\\s]*3\\b/i, \"omega_3_pct\"]") &&
    source.includes("[/^omega[-\\s]*6\\b/i, \"omega_6_pct\"]") &&
    source.includes("panel.calories_per_kg") &&
    source.includes("panel.calories_per_cup") &&
    source.includes("basis: \"as-fed\"") &&
    source.includes("numericCount < 2"),
  "exporter must normalize Guaranteed Analysis percentages and calorie fields into the nutrientPanel shape"
);

assert(
  source.includes("source: \"koha_official_product_page\"") &&
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
  packageJson.includes('"export:koha-nutrient-panels": "node scripts/export-koha-nutrient-panels.js"') &&
    packageJson.includes('"test:koha-nutrient-panel-export": "node scripts/test-koha-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:koha-nutrient-panel-export"),
  "package scripts must expose KOHA nutrient exporter and include its guard in test:guards"
);

console.log("KOHA nutrient panel export guard passed");
