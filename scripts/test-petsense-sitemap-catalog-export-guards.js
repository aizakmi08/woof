#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-petsense-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`PetSense sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.petsense.com/sitemap.xml") &&
    source.includes("sitemap_products_") &&
    source.includes("--sitemap-index=url") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapIndexUrl)") &&
    source.includes("extractProductSitemapLocs") &&
    source.includes("resolveSitemapUrls") &&
    source.includes("productNameFromUrl(sourceUrl)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must discover Shopify product sitemaps, derive titles from slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("function parseProductRows(xml, sitemapUrl)") &&
    source.includes("retailerProductId") &&
    source.includes("sourceSitemap") &&
    source.includes("productIdFromUrl(sourceUrl)") &&
    source.includes("sourceQuality: \"retailer_sitemap_slug\"") &&
    source.includes("function titleCaseProductName(value)") &&
    source.includes("smallWords"),
  "exporter must derive cleaned slug titles, product ids, and source sitemap provenance"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("TREAT_TERMS") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"meal mixer\"") &&
    source.includes("\"goat milk\"") &&
    source.includes("\"milk replacer\"") &&
    source.includes("\"bully\"") &&
    source.includes("\"pizzle\"") &&
    source.includes("\"trachea\"") &&
    source.includes("\"tendon\"") &&
    source.includes("\"litter\"") &&
    source.includes("\"scooper\"") &&
    source.includes("BRAND_HINTS") &&
    !source.includes("\"PetSense\"") &&
    source.includes("\"Blue Buffalo\"") &&
    source.includes("\"Taste of the Wild\"") &&
    source.includes("\"Natural Balance\"") &&
    source.includes("\"Hill's Science Diet\"") &&
    source.includes("\"Nulo\"") &&
    source.includes("\"4health\"") &&
    source.includes("\"Chicken Soup for the Soul\"") &&
    source.includes("\"Holistic Select\"") &&
    source.includes("BRAND_PREFIX_ALIASES") &&
    source.includes("[\"hill s science diet\", \"Hill's Science Diet\"]") &&
    source.includes("[\"natures variety instinct\", \"Instinct\"]") &&
    source.includes("function inferBrand(name)") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("return coreFood || treat"),
  "exporter must strictly filter PetSense's mixed Shopify sitemap to complete dog/cat food-like rows and reject supplement/topper/treat rows by default"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
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
  source.includes("source: \"petsense_sitemap_export\"") &&
    source.includes("sourceQuality: \"retailer_sitemap_slug\"") &&
    source.includes("brand,") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("searchTerms: [...new Set([name, row.sourceUrl].filter(Boolean))]") &&
    source.includes("cacheKey,") &&
    source.includes("petTypes,") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText") &&
    !source.includes("ingredients_text"),
  "targets must be backfill-compatible and must not export raw ingredient payloads"
);

assert(
  source.includes("generatedAt: new Date().toISOString()") &&
    source.includes("source: \"petsense_product_sitemap\"") &&
    source.includes("sitemapIndexUrl,") &&
    source.includes("sitemapUrls,") &&
    source.includes("explicitSitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:petsense-sitemap-catalog": "node scripts/export-petsense-sitemap-targets.js"') &&
    packageJson.includes('"test:petsense-sitemap-catalog-export": "node scripts/test-petsense-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:petsense-sitemap-catalog-export"),
  "package scripts must expose PetSense sitemap exporter and include its guard in test:guards"
);

console.log("PetSense sitemap catalog export guard passed");
