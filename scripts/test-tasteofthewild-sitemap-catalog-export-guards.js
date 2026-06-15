#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-tasteofthewild-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Taste of the Wild product index catalog export guard failed: ${message}`);
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
  source.includes("https://www.tasteofthewildpetfood.com/dog/taste-of-the-wild/") &&
    source.includes("https://www.tasteofthewildpetfood.com/cat/taste-of-the-wild/") &&
    source.includes("https://www.tasteofthewildpetfood.com/dog/prey/") &&
    source.includes("https://www.tasteofthewildpetfood.com/cat/prey/") &&
    source.includes("https://www.tasteofthewildpetfood.com/recipe-finder/?_sfm_umbrella_brand=totw") &&
    source.includes("https://www.tasteofthewildpetfood.com/recipe-finder/?_sfm_umbrella_brand=prey") &&
    source.includes("const BRAND = \"Taste of the Wild\"") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(pageUrl)") &&
    source.includes("Accept: \"text/html,application/xhtml+xml;q=0.9,*/*;q=0.8\"") &&
    source.includes("href=[\"']([^\"']+)[\"']") &&
    source.includes("tasteofthewildpetfood\\.com\\/(dog|cat)\\/(ancient-grains|grain-free|prey)\\/[a-z0-9.-]+") &&
    source.includes("productNameFromPath(parsed)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Taste of the Wild product index pages, derive titles from product slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("LINE_LABELS") &&
    source.includes("\"ancient-grains\": \"Ancient Grains\"") &&
    source.includes("\"grain-free\": \"Grain-Free\"") &&
    source.includes("prey: \"PREY\"") &&
    source.includes("function formFromSlug(slug)") &&
    source.includes("if (hasTerm(text, \"gravy\")) return \"wet\"") &&
    source.includes("return \"dry\"") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"limited ingredient\"") &&
    source.includes("\"high prairie\"") &&
    source.includes("\"pacific stream\"") &&
    source.includes("\"canyon river\"") &&
    source.includes("\"rocky mountain\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"broth\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"apps.bazaarvoice.com\"") &&
    source.includes("\"recipe finder\"") &&
    source.includes("\"questionnaire\"") &&
    source.includes("\"facebook\"") &&
    source.includes("function inferTasteOfTheWildPetTypes(row)") &&
    source.includes("return [row.petType]") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("return `${name} for Dogs`") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!/^https:\\/\\/www\\.tasteofthewildpetfood\\.com\\/(dog|cat)\\/(ancient-grains|grain-free|prey)\\/[a-z0-9-]+$/i.test(row.sourceUrl)) return false") &&
    source.includes("if (![\"dry\", \"wet\"].includes(row.form)) return false") &&
    source.includes("if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false"),
  "exporter must strictly filter Taste of the Wild product-index rows to dry/wet dog and cat foods while rejecting social/noise, treats, toppers, supplements, and non-food rows"
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
  source.includes("source: \"tasteofthewild_product_index_export\"") &&
    source.includes("sourceQuality: \"official_brand_product_index_slug\"") &&
    source.includes("brand: BRAND") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: row.retailerProductId") &&
    source.includes("form: row.form") &&
    !source.includes("sourcePage: row.sourcePage") &&
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
    source.includes("source: \"tasteofthewild_product_index\"") &&
    source.includes("sourcePages: SOURCE_PAGES") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, index pages, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:tasteofthewild-sitemap-catalog": "node scripts/export-tasteofthewild-sitemap-targets.js"') &&
    packageJson.includes('"test:tasteofthewild-sitemap-catalog-export": "node scripts/test-tasteofthewild-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:tasteofthewild-sitemap-catalog-export"),
  "package scripts must expose Taste of the Wild exporter and include its guard in test:guards"
);

console.log("Taste of the Wild product index catalog export guard passed");
