#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-koha-shopify-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`KOHA Shopify catalog export guard failed: ${message}`);
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
    source.includes("--products-url=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchProducts()") &&
    source.includes("Accept: \"application/json,*/*;q=0.8\"") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official KOHA Shopify products JSON feed and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("KEEP_TAG_TERMS") &&
    source.includes("\"dog food\"") &&
    source.includes("\"cat food\"") &&
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
    source.includes("function inferPetType(product)") &&
    source.includes("function formFromProduct(product)") &&
    source.includes("return \"dry\"") &&
    source.includes("return \"fresh\"") &&
    source.includes("return \"wet\"") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("return `${name} for Dogs`"),
  "exporter must keep species-explicit KOHA food families and reject treats, hidden gifts, trial/variety packs, raw toppers, supplements, chews, and non-food rows"
);

assert(
  source.includes("source: \"koha_shopify_export\"") &&
    source.includes("sourceQuality: \"official_brand_shopify_json\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl,") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: String(product.id || product.handle || \"\")") &&
    source.includes("form,") &&
    source.includes("productType: `koha_${form}_food`") &&
    source.includes("searchTerms: [...new Set([`${BRAND} ${name}`, name, sourceUrl].filter(Boolean))]") &&
    source.includes("cacheKey,") &&
    source.includes("petTypes,") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText") &&
    !source.includes("ingredients_text") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64"),
  "targets must be backfill-compatible and must not export raw ingredient, analysis, or image-base64 payloads"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
    source.includes("if (skipExistingScan) return new Set()") &&
    source.includes("/rest/v1/product_data") &&
    source.includes("select=cache_key,product_name,brand") &&
    source.includes("const keys = new Set()") &&
    source.includes("Authorization: `Bearer ${SUPABASE_ANON_KEY}`") &&
    source.includes("collectPlannedCacheKeys(target).some((key) => existing.has(key))") &&
    source.includes("const lookupName = target.brand && target.name") &&
    source.includes("skipped.existing++") &&
    source.includes("!includeExisting"),
  "exporter must read existing product_data keys and skip existing target/name/brand lookup aliases unless explicitly included"
);

assert(
  source.includes("generatedAt: new Date().toISOString()") &&
    source.includes("source: \"koha_shopify_products\"") &&
    source.includes("productsUrl,") &&
    source.includes("scannedProducts: products.length") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("byLine") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, products URL, skip, line, summary, and target counts"
);

assert(
  packageJson.includes('"export:koha-shopify-catalog": "node scripts/export-koha-shopify-targets.js"') &&
    packageJson.includes('"test:koha-shopify-catalog-export": "node scripts/test-koha-shopify-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:koha-shopify-catalog-export"),
  "package scripts must expose KOHA Shopify exporter and include its guard in test:guards"
);

console.log("KOHA Shopify catalog export guard passed");
