#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-bjs-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`BJ's sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.bjs.com/bjs_product_sitemap.xml") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("parseProductRows(xml)") &&
    source.includes("productNameFromUrl(sourceUrl)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read BJ's public product sitemap, derive titles from slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("function parseProductRows(xml)") &&
    source.includes("imageLocFromBlock(block)") &&
    source.includes("retailerProductId") &&
    source.includes("sourceSitemap") &&
    source.includes("productIdFromUrl(sourceUrl)") &&
    source.includes("sourceQuality: \"retailer_sitemap_slug\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("function titleCaseProductName(value)") &&
    source.includes("smallWords"),
  "exporter must derive cleaned slug titles, retailer product ids, image URLs, and source sitemap provenance"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("TREAT_TERMS") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"tidy cats\"") &&
    source.includes("\"litter\"") &&
    source.includes("\"baby food\"") &&
    source.includes("\"blue cheese\"") &&
    source.includes("\"pup peroni\"") &&
    source.includes("\"milk bone\"") &&
    source.includes("\"necklace\"") &&
    source.includes("BRAND_HINTS") &&
    source.includes("\"Berkley Jensen\"") &&
    source.includes("\"Freshpet\"") &&
    source.includes("\"Purina ONE\"") &&
    source.includes("\"Blue Buffalo\"") &&
    source.includes("BRAND_PREFIX_ALIASES") &&
    source.includes("[\"nutrish\", \"Rachael Ray Nutrish\"]") &&
    source.includes("function inferBrand(name)") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("return coreFood || treat"),
  "exporter must strictly filter BJ's mixed club-store sitemap to complete dog/cat food rows and reject litter, treats, human food, and non-food rows by default"
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
  source.includes("source: \"bjs_sitemap_export\"") &&
    source.includes("sourceQuality: \"retailer_sitemap_slug\"") &&
    source.includes("brand,") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: row.imageUrl || \"\"") &&
    source.includes("retailerProductId: row.productId") &&
    source.includes("searchTerms: [...new Set([name, row.sourceUrl, row.productId].filter(Boolean))]") &&
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
    source.includes("source: \"bjs_product_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("imageCount") &&
    source.includes("targets,"),
  "manifest must include auditable source, skip, image, summary, and target counts"
);

assert(
  packageJson.includes('"export:bjs-sitemap-catalog": "node scripts/export-bjs-sitemap-targets.js"') &&
    packageJson.includes('"test:bjs-sitemap-catalog-export": "node scripts/test-bjs-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:bjs-sitemap-catalog-export"),
  "package scripts must expose BJ's sitemap exporter and include its guard in test:guards"
);

console.log("BJ's sitemap catalog export guard passed");
