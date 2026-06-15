#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-fancyfeast-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Fancy Feast sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.purina.com/sitemap.xml") &&
    source.includes("const BRAND = \"Fancy Feast\"") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("english-hreflang\\/sitemap\\.xml\\?page=\\d+") &&
    source.includes("productNameFromPath(parsed)") &&
    source.includes("www\\.purina\\.com\\/cats\\/shop\\/fancy-feast-") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Purina sitemap index, derive titles from Fancy Feast shop slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"timeless favorites\"") &&
    source.includes("\"gravy lovers\"") &&
    source.includes("\"gourmet naturals\"") &&
    source.includes("\"savory centers\"") &&
    source.includes("\"petites\"") &&
    source.includes("\"gems\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"savory cravings\"") &&
    source.includes("\"appetizer\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"broth\"") &&
    source.includes("\"bisque\"") &&
    source.includes("\"puree\"") &&
    source.includes("\"lickable\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("function inferFancyFeastPetTypes(row)") &&
    source.includes("return [\"cat\"]") &&
    source.includes("function parsedProductPath(url)") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!/^https:\\/\\/www\\.purina\\.com\\/cats\\/shop\\/fancy-feast-/i.test(row.sourceUrl)) return false") &&
    source.includes("if (!/-(wet|dry)-cat-food(?:-|$)/i.test(row.retailerProductId)) return false") &&
    source.includes("if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false"),
  "exporter must strictly filter Fancy Feast sitemap rows to core dry/wet cat foods while rejecting treats, toppers, broths, appetizers, purees, supplements, accessories, and non-food rows"
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
  source.includes("source: \"fancyfeast_sitemap_export\"") &&
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
    source.includes("source: \"fancyfeast_product_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:fancyfeast-sitemap-catalog": "node scripts/export-fancyfeast-sitemap-targets.js"') &&
    packageJson.includes('"test:fancyfeast-sitemap-catalog-export": "node scripts/test-fancyfeast-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:fancyfeast-sitemap-catalog-export"),
  "package scripts must expose Fancy Feast sitemap exporter and include its guard in test:guards"
);

console.log("Fancy Feast sitemap catalog export guard passed");
