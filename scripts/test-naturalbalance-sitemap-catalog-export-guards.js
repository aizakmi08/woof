#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-naturalbalance-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Natural Balance sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.naturalbalanceinc.com/sitemap.xml") &&
    source.includes("const BRAND = \"Natural Balance\"") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("productNameFromSlug(parsed.slug)") &&
    source.includes("naturalbalanceinc\\.com\\/(dog|cat)-recipes\\/(dry|wet|treat)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Natural Balance sitemap, derive titles from product slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("DEFAULT_PRODUCT_FORMS") &&
    source.includes("new Set([\"dry\", \"wet\"])") &&
    source.includes("PRODUCT_LINE_TERMS") &&
    source.includes("\"limited ingredient\"") &&
    source.includes("\"original ultra\"") &&
    source.includes("\"platefulls\"") &&
    source.includes("\"delectable delights\"") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"green pea\"") &&
    source.includes("\"all life stage\"") &&
    source.includes("TREAT_TERMS") &&
    source.includes("\"mini rewards\"") &&
    source.includes("\"crunchy biscuits\"") &&
    source.includes("\"jumpin stix\"") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("\"probiotic\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"litter\"") &&
    source.includes("function inferNaturalBalancePetTypes(row)") &&
    source.includes("function parsedProductPath(url)") &&
    source.includes("if (!DEFAULT_PRODUCT_FORMS.has(row.form) && !(includeTreats && row.form === \"treat\")) return false") &&
    source.includes("if (row.form === \"treat\" && !includeTreats) return false") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Dogs`") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!/^https:\\/\\/www\\.naturalbalanceinc\\.com\\/(dog|cat)-recipes\\/(dry|wet|treat)\\//i.test(row.sourceUrl)) return false") &&
    source.includes("if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false"),
  "exporter must strictly filter Natural Balance sitemap rows to explicit dog/cat dry and wet foods while rejecting treats, supplements, and non-food rows by default"
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
  source.includes("source: \"naturalbalance_sitemap_export\"") &&
    source.includes("sourceQuality: \"official_brand_sitemap_slug\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: row.retailerProductId") &&
    source.includes("productLine: row.productLine") &&
    source.includes("form: row.form") &&
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
    source.includes("source: \"naturalbalance_product_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:naturalbalance-sitemap-catalog": "node scripts/export-naturalbalance-sitemap-targets.js"') &&
    packageJson.includes('"test:naturalbalance-sitemap-catalog-export": "node scripts/test-naturalbalance-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:naturalbalance-sitemap-catalog-export"),
  "package scripts must expose Natural Balance sitemap exporter and include its guard in test:guards"
);

console.log("Natural Balance sitemap catalog export guard passed");
