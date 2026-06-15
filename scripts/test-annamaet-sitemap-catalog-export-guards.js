#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-annamaet-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Annamaet sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://annamaet.com/products-sitemap.xml") &&
    source.includes("const BRAND = \"Annamaet\"") &&
    source.includes("--sitemap=url") &&
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
  "exporter must read the official Annamaet products sitemap and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("DOG_FORMULA_SLUGS") &&
    source.includes("CAT_FORMULA_SLUGS") &&
    source.includes("DOG_CAT_FORMULA_SLUGS") &&
    source.includes("\"aqualuk-formula\"") &&
    source.includes("\"feline-sustain-no-29\"") &&
    source.includes("\"chicken-freez-dried-raw\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"glycocharge\"") &&
    source.includes("\"enhance\"") &&
    source.includes("\"endure\"") &&
    source.includes("\"impact\"") &&
    source.includes("\"recovery chews\"") &&
    source.includes("function isCandidateFoodSlug(slug)") &&
    source.includes("function petTypesFromSlug(slug)") &&
    source.includes("return [\"dog\", \"cat\"]") &&
    source.includes("function addSpeciesQualifier(name, petTypes)") &&
    source.includes("`${name} Dog & Cat Food`") &&
    source.includes("return `${name} Cat Food`") &&
    source.includes("return `${name} Dog Food`"),
  "exporter must keep only official complete food formula slugs, support dog/cat raw foods, and reject supplements, chews, treats, and non-food rows"
);

assert(
  source.includes("source: \"annamaet_sitemap_export\"") &&
    source.includes("sourceQuality: \"official_brand_sitemap_slug\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl: url") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: slug") &&
    source.includes("form: formFromSlug(slug)") &&
    source.includes("productType: DOG_CAT_FORMULA_SLUGS.has(slug) ? \"freeze_dried_raw_food\" : \"dry_food\"") &&
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
    source.includes("source: \"annamaet_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedUrls: rawUrls.length") &&
    source.includes("candidateUrls: urls.length") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("byLookupPetType") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, lookup pet-type, and target counts"
);

assert(
  packageJson.includes('"export:annamaet-sitemap-catalog": "node scripts/export-annamaet-sitemap-targets.js"') &&
    packageJson.includes('"test:annamaet-sitemap-catalog-export": "node scripts/test-annamaet-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:annamaet-sitemap-catalog-export"),
  "package scripts must expose Annamaet sitemap exporter and include its guard in test:guards"
);

console.log("Annamaet sitemap catalog export guard passed");
