#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-solidgold-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Solid Gold nutrient panel export guard failed: ${message}`);
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
  source.includes("https://solidgoldpet.com/products.json?limit=250") &&
    source.includes("const BRAND = \"Solid Gold\"") &&
    source.includes("fetchProducts()") &&
    source.includes("fetchText(candidate.sourceUrl)") &&
    source.includes("parseGuaranteedAnalysis(html, candidate.sourceUrl)") &&
    source.includes("solidgold_official_product_page") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Solid Gold product feed/pages and avoid product-lookup or browser scraping"
);

assert(
  source.includes("KEEP_PRODUCT_TYPES") &&
    source.includes("\"dry food\"") &&
    source.includes("\"wet food\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"bone broth\"") &&
    source.includes("\"meal topper\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"treat\"") &&
    source.includes("\"variety\"") &&
    source.includes("function isCandidateFoodProduct(product)") &&
    source.includes("function inferPetType(product)") &&
    source.includes("function inferProductForm(product)"),
  "exporter must keep complete wet/dry foods and reject broths, toppers, supplements, treats, bundles, variety packs, and non-food rows"
);

assert(
  source.includes("fetchExistingRows") &&
    source.includes("isSolidGoldRow") &&
    source.includes("inferPetTypeFromText(rowText(row))") &&
    source.includes("inferProductFormFromText(rowText(row))") &&
    source.includes("rowHasSameProteins") &&
    source.includes("ANIMAL_PROTEIN_TOKENS") &&
    source.includes("target.lineTokens.length === 0 || target.proteinTokens.length === 0") &&
    source.includes("row.petType === target.petType && row.productForm === target.productForm") &&
    source.includes("matchState(candidate, existingRows)") &&
    source.includes("weak_target_tokens") &&
    source.includes("ambiguousCatalogAlias") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan"),
  "exporter must require same species, wet/dry form, product-line tokens, and animal-protein tokens before making write-ready targets"
);

assert(
  source.includes("[/\\b(?:crude\\s+)?protein\\b/i, \"protein_pct\"]") &&
    source.includes("[/\\b(?:crude\\s+)?fat\\b/i, \"fat_pct\"]") &&
    source.includes("[/\\b(?:crude\\s+)?fib(?:er|re)\\b/i, \"fiber_pct\"]") &&
    source.includes("[/\\bmoisture\\b/i, \"moisture_pct\"]") &&
    source.includes("[/\\bcalcium\\b/i, \"calcium_pct\"]") &&
    source.includes("[/\\bphosphorus\\b/i, \"phosphorus_pct\"]") &&
    source.includes("[/\\bomega[-\\s]*3(?:\\s+fatty\\s+acids?)?\\b/i, \"omega_3_pct\"]") &&
    source.includes("[/\\bomega[-\\s]*6(?:\\s+fatty\\s+acids?)?\\b/i, \"omega_6_pct\"]") &&
    source.includes("panel.calories_per_kg") &&
    source.includes("panel.calories_per_cup") &&
    source.includes("basis: \"as-fed\"") &&
    source.includes("panel.protein_pct == null || panel.fat_pct == null"),
  "exporter must normalize Guaranteed Analysis percentages and calorie fields into the nutrientPanel shape"
);

assert(
  source.includes("source: \"solidgold_official_product_page\"") &&
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
  packageJson.includes('"export:solidgold-nutrient-panels": "node scripts/export-solidgold-nutrient-panels.js"') &&
    packageJson.includes('"test:solidgold-nutrient-panel-export": "node scripts/test-solidgold-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:solidgold-nutrient-panel-export"),
  "package scripts must expose Solid Gold nutrient exporter and include its guard in test:guards"
);

console.log("Solid Gold nutrient panel export guard passed");
