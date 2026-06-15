#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-pedigree-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Pedigree sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.pedigree.com/sitemap.xml") &&
    source.includes("const BRAND = \"Pedigree\"") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("productNameFromSlug(parsed.slug)") &&
    source.includes("www\\.pedigree\\.com\\/products\\/(dry|wet|wet-can|wet-pouch)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Pedigree sitemap, derive titles from product slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("DEFAULT_PRODUCT_FORMS") &&
    source.includes("new Set([\"wet\", \"dry\"])") &&
    source.includes("PRODUCT_PATH_FORMS") &&
    source.includes("new Set([\"wet\", \"dry\", \"wet-can\", \"wet-pouch\"])") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"choice cuts\"") &&
    source.includes("\"chopped ground dinner\"") &&
    source.includes("\"complete nutrition\"") &&
    source.includes("\"tender bites\"") &&
    source.includes("\"high protein\"") &&
    source.includes("\"morsels sauce\"") &&
    source.includes("TREAT_TERMS") &&
    source.includes("\"drizzlers\"") &&
    source.includes("\"dentastix\"") &&
    source.includes("\"jumbone\"") &&
    source.includes("\"marrobone\"") &&
    source.includes("\"twisty\"") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("\"topper\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"litter\"") &&
    source.includes("function inferPedigreePetTypes(row)") &&
    source.includes("return [\"dog\"]") &&
    source.includes("function parsedProductPath(url)") &&
    source.includes("return { pathForm, form: pathForm === \"dry\" ? \"dry\" : \"wet\", slug }") &&
    source.includes("if (!DEFAULT_PRODUCT_FORMS.has(row.form)) return false") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Dogs`") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!/^https:\\/\\/www\\.pedigree\\.com\\/products\\/(dry|wet|wet-can|wet-pouch)\\//i.test(row.sourceUrl)) return false") &&
    source.includes("if (SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (TREAT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    !source.includes("includeTreats") &&
    !source.includes("includeToppers"),
  "exporter must strictly filter Pedigree sitemap rows to explicit wet/dry dog foods while rejecting Drizzlers, treats, toppers, complements, supplements, and non-food rows by default"
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
  source.includes("source: \"pedigree_sitemap_export\"") &&
    source.includes("sourceQuality: \"official_brand_sitemap_slug\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: row.retailerProductId") &&
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
    source.includes("source: \"pedigree_product_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:pedigree-sitemap-catalog": "node scripts/export-pedigree-sitemap-targets.js"') &&
    packageJson.includes('"test:pedigree-sitemap-catalog-export": "node scripts/test-pedigree-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:pedigree-sitemap-catalog-export"),
  "package scripts must expose Pedigree sitemap exporter and include its guard in test:guards"
);

console.log("Pedigree sitemap catalog export guard passed");
