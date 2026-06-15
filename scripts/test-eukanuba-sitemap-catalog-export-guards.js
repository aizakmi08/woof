#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-eukanuba-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Eukanuba sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.eukanuba.com/us/sitemap.xml") &&
    source.includes("const BRAND = \"Eukanuba\"") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("Accept: \"application/xml,text/xml,*/*;q=0.8\"") &&
    source.includes("function extractUrls(xml)") &&
    source.includes("function parseProductUrl(url)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Eukanuba sitemap and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CATEGORY_SLUGS") &&
    source.includes("\"active-dog-food\"") &&
    source.includes("\"performance-dog-food\"") &&
    source.includes("\"weight-control-dog-food\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"treats\"") &&
    source.includes("\"supplement\"") &&
    source.includes("function isCandidateFoodUrl(url)") &&
    source.includes("function formFromSlug(slug)") &&
    source.includes("return \"wet\"") &&
    source.includes("return \"dry\"") &&
    source.includes("function addSpeciesQualifier(name)") &&
    source.includes("return `${name} Dog Food`") &&
    source.includes("petType: \"dog\""),
  "exporter must keep only official Eukanuba dog food leaf rows and reject category, treat, supplement, and non-food rows"
);

assert(
  source.includes("source: \"eukanuba_sitemap_export\"") &&
    source.includes("sourceQuality: \"official_brand_sitemap_slug\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl: url") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: row.slug") &&
    source.includes("form,") &&
    source.includes("productType: `${row.line}_${form}_food`") &&
    source.includes("searchTerms: [...new Set([`${BRAND} ${name}`, name, url].filter(Boolean))]") &&
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
    source.includes("source: \"eukanuba_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedUrls: rawUrls.length") &&
    source.includes("candidateUrls: urls.length") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("byLine") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, line, summary, and target counts"
);

assert(
  packageJson.includes('"export:eukanuba-sitemap-catalog": "node scripts/export-eukanuba-sitemap-targets.js"') &&
    packageJson.includes('"test:eukanuba-sitemap-catalog-export": "node scripts/test-eukanuba-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:eukanuba-sitemap-catalog-export"),
  "package scripts must expose Eukanuba sitemap exporter and include its guard in test:guards"
);

console.log("Eukanuba sitemap catalog export guard passed");
