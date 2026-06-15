#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-farmandfleet-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Farm & Fleet sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.farmandfleet.com/sitemap.xml.gz") &&
    source.includes("sitemap_products") &&
    source.includes("const MAX_SITEMAPS = 12") &&
    source.includes("zlib.gunzipSync(buffer)") &&
    source.includes("--sitemap-index=url") &&
    source.includes("--sitemap=url[,url]") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapIndexUrl)") &&
    source.includes("function extractSitemapLocs(xml)") &&
    source.includes("async function resolveSitemapUrls()") &&
    source.includes("fetchText(sitemapUrl)") &&
    !source.includes("product-lookup"),
  "exporter must read public Farm & Fleet product sitemaps and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("function parseProductUrls(xml, sitemapUrl)") &&
    source.includes("cleanProductName(block.match(/<image:caption>") &&
    source.includes("productNameFromUrl(sourceUrl)") &&
    source.includes("retailerProductId") &&
    source.includes("sourceSitemap") &&
    source.includes("productIdFromUrl(sourceUrl)") &&
    source.includes("case of|pack of") &&
    source.includes("oz|fl\\s*-?\\s*oz|lb|lbs|kg|g|pound|ounce"),
  "exporter must derive cleaned product titles, product ids, and source sitemap provenance from sitemap entries"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("TREAT_TERMS") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("BRAND_HINTS") &&
    source.includes("\"9 Lives\"") &&
    source.includes("function inferBrand(name)") &&
    source.includes("function isCandidateFoodUrl(row)") &&
    source.includes("if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("return coreFood || treat"),
  "exporter must strictly filter Farm & Fleet sitemap rows to dog/cat food-like products and preserve brand hints before backfill"
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
  source.includes("source: \"farmandfleet_sitemap_export\"") &&
    source.includes("sourceQuality: \"retailer_sitemap_title\"") &&
    source.includes("brand,") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: row.imageUrl") &&
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
    source.includes("source: \"farmandfleet_product_sitemap\"") &&
    source.includes("sitemapIndexUrl,") &&
    source.includes("sitemapUrls,") &&
    source.includes("explicitSitemapUrls,") &&
    source.includes("requestedMaxSitemaps: maxSitemaps") &&
    source.includes("sitemapsFetched,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:farmandfleet-sitemap-catalog": "node scripts/export-farmandfleet-sitemap-targets.js"') &&
    packageJson.includes('"test:farmandfleet-sitemap-catalog-export": "node scripts/test-farmandfleet-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:farmandfleet-sitemap-catalog-export"),
  "package scripts must expose Farm & Fleet sitemap exporter and include its guard in test:guards"
);

console.log("Farm & Fleet sitemap catalog export guard passed");
