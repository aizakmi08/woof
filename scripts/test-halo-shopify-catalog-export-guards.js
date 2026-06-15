#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-halo-shopify-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Halo Shopify catalog export guard failed: ${message}`);
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
  source.includes("https://halopets.com/sitemap.xml") &&
    source.includes("const BRAND = \"Halo\"") &&
    source.includes("--sitemap-index=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapIndexUrl)") &&
    source.includes("application/xml,text/xml;q=0.9") &&
    source.includes("sitemap_products_\\d+\\.xml") &&
    source.includes("function parseProductRows(xml, sourceSitemap)") &&
    source.includes("<image:title>") &&
    source.includes("<image:loc>") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read Halo's official Shopify product sitemap and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"dry dog food\"") &&
    source.includes("\"wet cat food\"") &&
    source.includes("\"healthy grains\"") &&
    source.includes("\"grain free\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"bone broth\"") &&
    !source.includes("\"broth\",") &&
    source.includes("\"variety pack\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"store locator\"") &&
    source.includes("function inferHaloPetType(row)") &&
    source.includes("function formFromTitle(title)") &&
    source.includes("return \"wet\"") &&
    source.includes("return \"dry\"") &&
    source.includes("hasTerm(text, \"wet dog food\")") &&
    source.includes("hasTerm(text, \"wet cat food\")") &&
    source.includes("hasTerm(text, \"dry dog food\")") &&
    source.includes("hasTerm(text, \"dry cat food\")") &&
    source.includes("hasTerm(text, \"dry puppy food\")") &&
    source.includes("hasTerm(text, \"dry kitten food\")") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("return `${name} for Dogs`") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!/^https:\\/\\/halopets\\.com\\/products\\//i.test(row.sourceUrl)) return false") &&
    source.includes("if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (!CORE_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("return [\"dry\", \"wet\"].includes(formFromTitle(row.title))"),
  "exporter must strictly keep complete dry/wet Halo dog/cat foods while rejecting treats, toppers, supplements, variety packs, and non-food rows"
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
  source.includes("source: \"halo_shopify_sitemap_export\"") &&
    source.includes("sourceQuality: \"official_brand_shopify_sitemap\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: row.imageUrl") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: productHandleFromUrl(row.sourceUrl)") &&
    source.includes("form,") &&
    source.includes("sourceSitemap: row.sourceSitemap") &&
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
    source.includes("source: \"halo_shopify_sitemap\"") &&
    source.includes("sitemapIndexUrl,") &&
    source.includes("sitemapsFetched,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:halo-shopify-catalog": "node scripts/export-halo-shopify-targets.js"') &&
    packageJson.includes('"test:halo-shopify-catalog-export": "node scripts/test-halo-shopify-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:halo-shopify-catalog-export"),
  "package scripts must expose Halo Shopify exporter and include its guard in test:guards"
);

console.log("Halo Shopify catalog export guard passed");
