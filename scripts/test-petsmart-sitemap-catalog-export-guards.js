#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-petsmart-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`PetSmart sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.petsmart.com/sitemap_0.xml") &&
    source.includes("https://www.petsmart.com/sitemap_index.xml") &&
    source.includes("--sitemap-index=url") &&
    source.includes("--sitemap=url[,url]") &&
    source.includes("--max-sitemaps=N") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapIndexUrl)") &&
    source.includes("function extractSitemapLocs(xml)") &&
    source.includes("async function resolveSitemapUrls()") &&
    source.includes("explicitSitemapUrls.length > 0") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("www.petsmart.com/sitemap_") &&
    !source.includes("app/dp") &&
    !source.includes("product-lookup"),
  "exporter must use bounded PetSmart product sitemaps instead of product-page scraping or product-lookup calls"
);

assert(
  source.includes("function parseProductUrls(xml, sitemapUrl)") &&
    source.includes("productNameFromUrl(sourceUrl)") &&
    source.includes("retailerProductId") &&
    source.includes("sourceSitemap") &&
    source.includes("andtrade\\b") &&
    source.includes("\\bwellnessr\\b") &&
    source.includes("\\bcaninr\\b") &&
    source.includes("case of|pack of") &&
    source.includes("oz|fl\\s*-?\\s*oz|lb|lbs|kg|g|pound|ounce"),
  "exporter must derive cleaned product titles, product ids, and source sitemap provenance from sitemap URLs"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_PATHS") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("TREAT_TERMS") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("BRAND_HINTS") &&
    source.includes("function inferBrand(name)") &&
    source.includes("function isCandidateFoodUrl(row)") &&
    source.includes("if (!includeTreats && urlPath.includes(\"/treats/\")) return false") &&
    source.includes("return coreFood || treat"),
  "exporter must strictly filter PetSmart sitemap URLs to dog/cat food-like products and preserve brand hints before backfill"
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
  source.includes("source: \"petsmart_sitemap_export\"") &&
    source.includes("sourceQuality: \"retailer_sitemap_title\"") &&
    source.includes("brand,") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
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
    source.includes("source: \"petsmart_product_sitemap\"") &&
    source.includes("sitemapIndexUrl,") &&
    source.includes("sitemapUrls,") &&
    source.includes("explicitSitemapUrls,") &&
    source.includes("sitemapsFetched,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:petsmart-sitemap-catalog": "node scripts/export-petsmart-sitemap-targets.js"') &&
    packageJson.includes('"test:petsmart-sitemap-catalog-export": "node scripts/test-petsmart-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:petsmart-sitemap-catalog-export"),
  "package scripts must expose PetSmart sitemap exporter and include its guard in test:guards"
);

console.log("PetSmart sitemap catalog export guard passed");
