#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-honestkitchen-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`The Honest Kitchen sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.thehonestkitchen.com/sitemap.xml") &&
    source.includes("sitemap_products_") &&
    source.includes("const BRAND = \"The Honest Kitchen\"") &&
    source.includes("--sitemap-index=url") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapIndexUrl)") &&
    source.includes("extractProductSitemapLocs") &&
    source.includes("resolveSitemapUrls") &&
    source.includes("imageTitleFromBlock(block)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must discover The Honest Kitchen Shopify product sitemaps, derive titles from sitemap image titles, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"whole food clusters\"") &&
    source.includes("\"dehydrated dog food\"") &&
    source.includes("\"butcher block pate\"") &&
    source.includes("\"minced wet cat food\"") &&
    source.includes("TREAT_TERMS") &&
    source.includes("\"meaty littles\"") &&
    source.includes("\"jerky\"") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("\"base mix\"") &&
    source.includes("\"pour overs\"") &&
    source.includes("\"meal booster\"") &&
    source.includes("\"perfect form\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"toy\"") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("product_name: `${row.name} ${row.sourceUrl}`") &&
    source.includes("product_name: `${name} ${row.sourceUrl}`") &&
    source.includes("if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("/\\/products\\/.*-(dry|wet|dehydrated)-(dog|cat|puppy)-food"),
  "exporter must strictly filter The Honest Kitchen sitemap to complete food rows and reject treats, toppers, base mixes, supplements, toys, and accessories by default"
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
  source.includes("source: \"honestkitchen_sitemap_export\"") &&
    source.includes("sourceQuality: \"official_brand_sitemap_title\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: row.retailerProductId") &&
    source.includes("searchTerms: [...new Set([`${BRAND} ${name}`, name, row.sourceUrl].filter(Boolean))]") &&
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
    source.includes("source: \"honestkitchen_product_sitemap\"") &&
    source.includes("sitemapIndexUrl,") &&
    source.includes("sitemapUrls,") &&
    source.includes("explicitSitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:honestkitchen-sitemap-catalog": "node scripts/export-honestkitchen-sitemap-targets.js"') &&
    packageJson.includes('"test:honestkitchen-sitemap-catalog-export": "node scripts/test-honestkitchen-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:honestkitchen-sitemap-catalog-export"),
  "package scripts must expose The Honest Kitchen sitemap exporter and include its guard in test:guards"
);

console.log("The Honest Kitchen sitemap catalog export guard passed");
