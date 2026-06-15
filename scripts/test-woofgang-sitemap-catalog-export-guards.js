#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-woofgang-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Woof Gang Bakery sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://shop.woofgangbakery.com/sitemap.xml") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("parseProductRows(xml)") &&
    source.includes("productPartsFromUrl(sourceUrl)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read Woof Gang Bakery public sitemap product URLs and avoid page scraping or product-lookup calls"
);

assert(
  source.includes("function parseProductRows(xml)") &&
    source.includes("retailerProductId") &&
    source.includes("sourceCategoryId") &&
    source.includes("sourceSitemap: sitemapUrl") &&
    source.includes("sourceQuality: \"retailer_sitemap_title\"") &&
    source.includes("function titleCaseProductName(value)") &&
    source.includes("smallWords"),
  "exporter must derive cleaned product names, source category ids, product ids, and sitemap provenance"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"large breed\"") &&
    source.includes("\"small breed\"") &&
    source.includes("\"cat can\"") &&
    source.includes("\"fd food\"") &&
    source.includes("TREAT_TERMS") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"ice cream\"") &&
    source.includes("\"cake mix\"") &&
    source.includes("\"trt\"") &&
    source.includes("\"pumpkin patch up\"") &&
    source.includes("\"butcher s blend\"") &&
    source.includes("\"goat s milk\"") &&
    source.includes("\"daily boosters\"") &&
    source.includes("\"flea\"") &&
    source.includes("\"litter\"") &&
    source.includes("BRAND_HINTS") &&
    source.includes("\"Fromm\"") &&
    source.includes("\"Primal\"") &&
    source.includes("\"Vital Essentials\"") &&
    source.includes("\"Weruva\"") &&
    source.includes("BRAND_PREFIX_ALIASES") &&
    source.includes("[\"ve\", \"Vital Essentials\"]") &&
    source.includes("[\"gl\", \"Grandma Lucy's\"]") &&
    source.includes("[\"primal raw\", \"Primal\"]") &&
    source.includes("function inferBrand(name)") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("const trustedFoodLine = Boolean(brand) && packageSizeSignal(text)") &&
    source.includes("if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("return coreFood || trustedFoodLine || treat"),
  "exporter must strictly filter the mixed Woof Gang Bakery sitemap to explicit dog/cat complete-food rows and reject treat/supplement/accessory rows by default"
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
    source.includes("skipped.existing++") &&
    source.includes("!includeExisting"),
  "exporter must read existing product_data keys and skip existing target/name/brand lookup aliases unless explicitly included"
);

assert(
  source.includes("source: \"woofgang_sitemap_export\"") &&
    source.includes("sourceQuality: \"retailer_sitemap_title\"") &&
    source.includes("brand,") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: row.retailerProductId") &&
    source.includes("sourceCategoryId: row.categoryId") &&
    source.includes("searchTerms: [...new Set([name, row.sourceUrl].filter(Boolean))]") &&
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
    source.includes("source: \"woofgangbakery_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("bySourceCategoryId") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, category, and target counts"
);

assert(
  packageJson.includes('"export:woofgang-sitemap-catalog": "node scripts/export-woofgang-sitemap-targets.js"') &&
    packageJson.includes('"test:woofgang-sitemap-catalog-export": "node scripts/test-woofgang-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:woofgang-sitemap-catalog-export"),
  "package scripts must expose Woof Gang Bakery sitemap exporter and include its guard in test:guards"
);

console.log("Woof Gang Bakery sitemap catalog export guard passed");
