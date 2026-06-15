#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-vitalessentials-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Vital Essentials sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.vitalessentials.com/sitemap.xml") &&
    source.includes("const BRAND = \"Vital Essentials\"") &&
    source.includes("--sitemap-url=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("Accept: \"application/xml,text/xml,*/*;q=0.8\"") &&
    source.includes("function extractUrls(xml)") &&
    source.includes("function slugFromUrl(url)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Vital Essentials sitemap and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"chews\"") &&
    source.includes("\"raw bar\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"mixer\"") &&
    source.includes("\"hound on the ground\"") &&
    source.includes("function isCandidateFoodSlug(slug)") &&
    source.includes("dog-food") &&
    source.includes("cat-food") &&
    source.includes("entree") &&
    source.includes("raw-fusion") &&
    source.includes("function inferPetType(slug)") &&
    source.includes("form: \"fresh\"") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("return `${name} for Dogs`"),
  "exporter must keep only official complete dog/cat food slugs and reject treats, chews, raw-bar snacks, toppers, mixers, and non-food rows"
);

assert(
  source.includes("source: \"vitalessentials_sitemap_export\"") &&
    source.includes("sourceQuality: \"official_brand_sitemap_slug\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl: url") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: slug") &&
    source.includes("form: \"fresh\"") &&
    source.includes("productType: \"raw_freeze_dried_or_frozen_food\"") &&
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
    source.includes("source: \"vitalessentials_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedUrls: urls.length") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:vitalessentials-sitemap-catalog": "node scripts/export-vitalessentials-sitemap-targets.js"') &&
    packageJson.includes('"test:vitalessentials-sitemap-catalog-export": "node scripts/test-vitalessentials-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:vitalessentials-sitemap-catalog-export"),
  "package scripts must expose Vital Essentials sitemap exporter and include its guard in test:guards"
);

console.log("Vital Essentials sitemap catalog export guard passed");
