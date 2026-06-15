#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-primal-shopify-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Primal Shopify catalog export guard failed: ${message}`);
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
  source.includes("https://www.primalpetfoods.com/products.json?limit=250") &&
    source.includes("const BRAND = \"Primal\"") &&
    source.includes("--products-url=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchProducts()") &&
    source.includes("Accept: \"application/json,*/*;q=0.8\"") &&
    source.includes("function pageUrl(baseUrl, page)") &&
    source.includes("for (let page = 1; page <= 20; page++)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Primal Shopify products JSON feed and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("KEEP_PRODUCT_TYPES") &&
    source.includes("\"Nuggets Dog\"") &&
    source.includes("\"Balanced Bases\"") &&
    source.includes("\"KITR Cat\"") &&
    source.includes("\"KITR Dog\"") &&
    source.includes("\"Pronto Dog\"") &&
    source.includes("\"Nuggets Cat\"") &&
    source.includes("REJECT_PRODUCT_TYPE_TERMS") &&
    source.includes("\"hydrator\"") &&
    source.includes("\"chew\"") &&
    source.includes("\"supplement\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"starter bundle\"") &&
    source.includes("\"goat milk\"") &&
    source.includes("\"jerky\"") &&
    source.includes("hasTag(tags, \"Pet Food Product\")") &&
    source.includes("hasTag(tags, \"parent\")") &&
    source.includes("hasTag(tags, \"species-both\")") &&
    source.includes("function inferPetType(product, tags)") &&
    source.includes("function formFromProduct(product, tags)") &&
    source.includes("return \"fresh\"") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("return `${name} for Dogs`"),
  "exporter must keep complete Primal raw/freeze-dried dog/cat foods and reject bundles, treats, toppers, hydrators, supplements, chews, ambiguous species-both rows, and non-food rows"
);

assert(
  source.includes("source: \"primal_shopify_export\"") &&
    source.includes("sourceQuality: \"official_brand_shopify_json\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl,") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: String(product.id || product.handle || \"\")") &&
    source.includes("form,") &&
    source.includes("productType: product.product_type || \"\"") &&
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
    source.includes("const name = cleanProductName(row?.product_name)") &&
    source.includes("normalizeCacheKey(brand && name") &&
    source.includes("Authorization: `Bearer ${SUPABASE_ANON_KEY}`") &&
    source.includes("collectPlannedCacheKeys(target).some((key) => existing.has(key))") &&
    source.includes("const lookupName = target.brand && target.name") &&
    source.includes("skipped.existing++") &&
    source.includes("!includeExisting"),
  "exporter must read existing product_data keys and skip existing target/name/brand lookup aliases unless explicitly included"
);

assert(
  source.includes("generatedAt: new Date().toISOString()") &&
    source.includes("source: \"primal_shopify_products\"") &&
    source.includes("productsUrl,") &&
    source.includes("scannedProducts: products.length") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, product feed, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:primal-shopify-catalog": "node scripts/export-primal-shopify-targets.js"') &&
    packageJson.includes('"test:primal-shopify-catalog-export": "node scripts/test-primal-shopify-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:primal-shopify-catalog-export"),
  "package scripts must expose Primal Shopify exporter and include its guard in test:guards"
);

console.log("Primal Shopify catalog export guard passed");
