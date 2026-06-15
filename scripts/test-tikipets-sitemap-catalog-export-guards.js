#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-tikipets-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Tiki Pets sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://tikipets.com/sitemap.xml") &&
    source.includes("https://tikipets.com/product-sitemap.xml") &&
    source.includes("const SOURCE_BRAND = \"Tiki Pets\"") &&
    source.includes("--product-sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("fetchText(productSitemapUrl)") &&
    source.includes("productNameFromPath(parsed)") &&
    source.includes("tikipets\\.com\\/product\\/tiki-(cat|dog)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Tiki Pets product sitemap, derive titles from product path slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"dog wet food\"") &&
    source.includes("\"tiki cat wet food\"") &&
    source.includes("\"after dark\"") &&
    source.includes("\"aloha\"") &&
    source.includes("REJECT_PATH_TERMS") &&
    source.includes("\"meal toppers\"") &&
    source.includes("\"tiki cat treats\"") &&
    source.includes("\"protein boosters\"") &&
    source.includes("\"functional toppers\"") &&
    source.includes("REJECT_NAME_TERMS") &&
    source.includes("\"bisque\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"mega jar\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"litter\"") &&
    source.includes("function inferTikiPetTypes(row)") &&
    source.includes("if (row.brandSegment === \"tiki-dog\") return [\"dog\"]") &&
    source.includes("if (row.brandSegment === \"tiki-cat\") return [\"cat\"]") &&
    source.includes("function brandFromPath(parsed)") &&
    source.includes("return parsed.brandSegment === \"tiki-dog\" ? \"Tiki Dog\" : \"Tiki Cat\"") &&
    source.includes("function parsedProductPath(url)") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Dogs`") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!/^https:\\/\\/tikipets\\.com\\/product\\/tiki-(cat|dog)\\//i.test(row.sourceUrl)) return false") &&
    source.includes("if (REJECT_PATH_TERMS.some((term) => hasTerm(pathText, term))) return false") &&
    source.includes("if (REJECT_NAME_TERMS.some((term) => hasTerm(nameText, term))) return false"),
  "exporter must strictly filter Tiki Pets sitemap rows to species-explicit foods while rejecting treats, toppers, boosters, bisques, supplements, filets, and non-food rows"
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
  source.includes("source: \"tikipets_sitemap_export\"") &&
    source.includes("sourceQuality: \"official_brand_sitemap_slug\"") &&
    source.includes("brand,") &&
    source.includes("sourceBrand: SOURCE_BRAND") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: row.retailerProductId") &&
    source.includes("form: row.form") &&
    source.includes("searchTerms: [...new Set([`${brand} ${name}`, `${SOURCE_BRAND} ${name}`, name, row.sourceUrl].filter(Boolean))]") &&
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
    source.includes("source: \"tikipets_product_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("productSitemaps,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, product sitemap list, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:tikipets-sitemap-catalog": "node scripts/export-tikipets-sitemap-targets.js"') &&
    packageJson.includes('"test:tikipets-sitemap-catalog-export": "node scripts/test-tikipets-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:tikipets-sitemap-catalog-export"),
  "package scripts must expose Tiki Pets sitemap exporter and include its guard in test:guards"
);

console.log("Tiki Pets sitemap catalog export guard passed");
