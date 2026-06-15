#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-openfarm-shopify-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Open Farm Shopify catalog export guard failed: ${message}`);
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
  source.includes("https://openfarmpet.com/products.json?limit=250") &&
    source.includes("const BRAND = \"Open Farm\"") &&
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
  "exporter must read the official Open Farm Shopify products JSON feed and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("KEEP_PRODUCT_TYPES") &&
    source.includes("\"Dog Food Frozen\"") &&
    source.includes("KEEP_PRODUCT_TYPE_TAGS") &&
    source.includes("\"_productType::dry\"") &&
    source.includes("\"_productType::wet\"") &&
    source.includes("\"_productType::frozen\"") &&
    source.includes("\"_productType::freeze_dried\"") &&
    source.includes("REJECT_PRODUCT_TYPE_TAGS") &&
    source.includes("\"_productType::treat\"") &&
    source.includes("\"_productType::supplement\"") &&
    source.includes("\"_productType::bonebroth\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"variety pack\"") &&
    source.includes("\"meal plan\"") &&
    source.includes("tags.has(\"_complete::yes\")") &&
    source.includes("tags.has(\"_complete::no\")") &&
    source.includes("hasRegexTag(tags, /^(_hidden|_nonsalable|YBlocklist)$/i)") &&
    source.includes("hasRegexTag(tags, /^category::Bundle$/i)") &&
    source.includes("function inferPetType(product, tags)") &&
    source.includes("function formFromTags(tags)") &&
    source.includes("return \"fresh\"") &&
    source.includes("return \"wet\"") &&
    source.includes("return \"dry\"") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("return `${name} for Dogs`"),
  "exporter must keep complete Open Farm dry/wet/fresh dog/cat foods and reject treats, supplements, broths, bundles, hidden/non-salable meal-plan rows, and non-food rows"
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
  source.includes("source: \"openfarm_shopify_export\"") &&
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
  source.includes("generatedAt: new Date().toISOString()") &&
    source.includes("source: \"openfarm_shopify_products\"") &&
    source.includes("productsUrl,") &&
    source.includes("scannedProducts: products.length") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, product feed, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:openfarm-shopify-catalog": "node scripts/export-openfarm-shopify-targets.js"') &&
    packageJson.includes('"test:openfarm-shopify-catalog-export": "node scripts/test-openfarm-shopify-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:openfarm-shopify-catalog-export"),
  "package scripts must expose Open Farm Shopify exporter and include its guard in test:guards"
);

console.log("Open Farm Shopify catalog export guard passed");
