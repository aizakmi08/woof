#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-nutrisource-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`NutriSource nutrient panel export guard failed: ${message}`);
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
    source.includes("https://discovernutrisource.com/products.json?limit=250") &&
    source.includes("const BRAND = \"NutriSource\"") &&
    source.includes("fetchProducts(), fetchExistingRows()") &&
    source.includes("pageUrl(productsUrl, page)") &&
    source.includes("html = await fetchText(candidate.sourceUrl)") &&
    source.includes("parseGuaranteedAnalysis(html, candidate.sourceUrl)") &&
    source.includes("Guaranteed Analysis") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official NutriSource product feed/pages and avoid product-lookup or browser scraping"
);

assert(
  source.includes("KEEP_PRODUCT_TYPES") &&
    source.includes("\"Grain Inclusive Dog Food\"") &&
    source.includes("\"Grain Free Canned Cat Food\"") &&
    source.includes("\"Raw Freeze-Dried Dog Food\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"bone broth\"") &&
    source.includes("tagSet(product).has(\"Food\")") &&
    source.includes("function inferPetType(product)") &&
    source.includes("function inferProductForm(product)"),
  "exporter must keep dog/cat food forms and reject treats, toppers, supplements, broths, bundles, and non-food rows"
);

assert(
  source.includes("fetchExistingRows") &&
    source.includes("select=cache_key,product_name,brand") &&
    source.includes("Authorization: `Bearer ${SUPABASE_ANON_KEY}`") &&
    source.includes("isNutriSourceFamilyRow(row)") &&
    source.includes("matchState(candidate, existingRows)") &&
    source.includes("missingCatalogAlias") &&
    source.includes("ambiguousCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must match official page panels to existing product_data cache keys before making write-ready targets"
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
  "exporter must normalize guaranteed-analysis percentages and calorie fields into validated nutrientPanel shape"
);

assert(
  source.includes("source: \"nutrisource_official_product_page\"") &&
    source.includes("nutrientPanel: panel") &&
    source.includes("sourceUrl,") &&
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
  packageJson.includes('"export:nutrisource-nutrient-panels": "node scripts/export-nutrisource-nutrient-panels.js"') &&
    packageJson.includes('"test:nutrisource-nutrient-panel-export": "node scripts/test-nutrisource-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:nutrisource-nutrient-panel-export"),
  "package scripts must expose NutriSource nutrient exporter and include its guard in test:guards"
);

console.log("NutriSource nutrient panel export guard passed");
