#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-grandmalucys-shopify-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Grandma Lucy's Shopify catalog export guard failed: ${message}`);
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
  source.includes("https://www.grandmalucys.com/products.json?limit=250") &&
    source.includes("const BRAND = \"Grandma Lucy's\"") &&
    source.includes("--products-url=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchProducts()") &&
    source.includes("Accept: \"application/json,*/*;q=0.8\"") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Grandma Lucy's Shopify products JSON feed and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("KEEP_HANDLES") &&
    source.includes("\"artisan-chicken\"") &&
    source.includes("\"artisan-pork\"") &&
    source.includes("\"artisan-lamb\"") &&
    source.includes("\"artisan-venison\"") &&
    source.includes("\"pureformance-chicken\"") &&
    source.includes("\"pureformance-fish\"") &&
    source.includes("\"pureformance-lamb\"") &&
    source.includes("\"pureformance-rabbit\"") &&
    source.includes("\"macanna-beef\"") &&
    source.includes("\"macanna-salmon\"") &&
    source.includes("\"macanna-turkey\"") &&
    source.includes("\"3-bears-chicken\"") &&
    source.includes("\"3-bears-beef\"") &&
    source.includes("\"3-bears-fish\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"sample\"") &&
    source.includes("\"pre-mix\"") &&
    source.includes("\"top it\"") &&
    source.includes("\"singles\"") &&
    source.includes("\"pumpkin pouch\"") &&
    source.includes("\"gift card\"") &&
    source.includes("function isCandidateFoodProduct(product)") &&
    source.includes("KEEP_HANDLES.has(handle)") &&
    source.includes("function addSpeciesQualifier(name)") &&
    source.includes("return `${name} Dog Food`"),
  "exporter must use an explicit complete-food allowlist and reject samples, pre-mixes, toppers, singles, pumpkin pouches, bundles, gifts, treats, and non-food rows"
);

assert(
  source.includes("source: \"grandmalucys_shopify_export\"") &&
    source.includes("sourceQuality: \"official_brand_shopify_json_allowlist\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl,") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: String(product.id || product.handle || \"\")") &&
    source.includes("form: \"fresh\"") &&
    source.includes("productType: \"freeze_dried_dog_food\"") &&
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
    source.includes("source: \"grandmalucys_shopify_products\"") &&
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
  packageJson.includes('"export:grandmalucys-shopify-catalog": "node scripts/export-grandmalucys-shopify-targets.js"') &&
    packageJson.includes('"test:grandmalucys-shopify-catalog-export": "node scripts/test-grandmalucys-shopify-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:grandmalucys-shopify-catalog-export"),
  "package scripts must expose Grandma Lucy's Shopify exporter and include its guard in test:guards"
);

console.log("Grandma Lucy's Shopify catalog export guard passed");
