#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-nutrish-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Nutrish sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.nutrish.com/product-sitemap.xml") &&
    source.includes("const BRAND = \"Rachael Ray Nutrish\"") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("productNameFromSlug(retailerProductId)") &&
    source.includes("www\\.nutrish\\.com\\/product\\/[a-z0-9-]+") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Nutrish product sitemap, derive titles from product slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"dry dog food\"") &&
    source.includes("\"wet cat food\"") &&
    source.includes("\"premium pate\"") &&
    source.includes("\"chunks in gravy\"") &&
    source.includes("TREAT_TERMS") &&
    source.includes("\"soup bones\"") &&
    source.includes("\"burger bites\"") &&
    source.includes("\"triple delights\"") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("\"broths\"") &&
    source.includes("\"lickable\"") &&
    source.includes("\"complements\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"litter\"") &&
    source.includes("function inferNutrishPetTypes(row)") &&
    source.includes("if (/\\b(puppy|dog|dogs)\\b/.test(slug)) return [\"dog\"]") &&
    source.includes("if (/\\b(cat|cats|kitten|kittens)\\b/.test(slug)) return [\"cat\"]") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Dogs`") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!/^https:\\/\\/www\\.nutrish\\.com\\/product\\//i.test(row.sourceUrl)) return false") &&
    source.includes("if (!/\\b(dry|wet)\\b/.test(text)) return false") &&
    source.includes("if (!/\\b(dog|cat|puppy|kitten)\\b/.test(text)) return false") &&
    source.includes("if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false"),
  "exporter must strictly filter Nutrish product sitemap rows to explicit dry/wet dog/cat foods while rejecting treats, chews, broths, complements, supplements, and non-food rows by default"
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
  source.includes("source: \"nutrish_sitemap_export\"") &&
    source.includes("sourceQuality: \"official_brand_sitemap_slug\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: row.retailerProductId") &&
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
    source.includes("source: \"nutrish_product_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:nutrish-sitemap-catalog": "node scripts/export-nutrish-sitemap-targets.js"') &&
    packageJson.includes('"test:nutrish-sitemap-catalog-export": "node scripts/test-nutrish-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:nutrish-sitemap-catalog-export"),
  "package scripts must expose Nutrish sitemap exporter and include its guard in test:guards"
);

console.log("Nutrish sitemap catalog export guard passed");
