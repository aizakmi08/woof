#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-petguys-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`PetGuys sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.petguys.com/sitemap.xml") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("parseProductRows(xml)") &&
    source.includes("productNameFromUrl(sourceUrl)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the public PetGuys sitemap, derive titles from slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("function hasPackageSignal(text)") &&
    source.includes("if (!hasPackageSignal(row.name)) return false") &&
    source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("TREAT_TERMS") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"food mat\"") &&
    source.includes("\"food containers\"") &&
    source.includes("\"bird\"") &&
    source.includes("\"chinchilla\"") &&
    source.includes("\"rabbit\"") &&
    source.includes("\"raw rewards\"") &&
    source.includes("\"bone broth\"") &&
    source.includes("\"mix a meal\"") &&
    source.includes("\"premix\"") &&
    source.includes("BRAND_HINTS") &&
    source.includes("\"Fussie Cat\"") &&
    source.includes("\"Love Nala\"") &&
    source.includes("\"Nulo\"") &&
    source.includes("\"Dr. Marty's\"") &&
    source.includes("\"Badlands Ranch\"") &&
    source.includes("\"Northwest Naturals\"") &&
    source.includes("\"Portland Pet Food Company\"") &&
    source.includes("\"Real Meat Co\"") &&
    source.includes("BRAND_PREFIX_ALIASES") &&
    source.includes("[\"dr marty\", \"Dr. Marty's\"]") &&
    source.includes("function inferBrand(name)") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("return coreFood || treat"),
  "exporter must strictly filter PetGuys category-heavy sitemap to packaged complete dog/cat food rows and reject treats, toppers, accessories, bird/small-animal food, and category pages by default"
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
  source.includes("source: \"petguys_sitemap_export\"") &&
    source.includes("sourceQuality: \"retailer_sitemap_slug\"") &&
    source.includes("brand,") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: \"\"") &&
    source.includes("barcode: \"\"") &&
    source.includes("retailerProductId: \"\"") &&
    source.includes("searchTerms: [...new Set([name, row.sourceUrl].filter(Boolean))]") &&
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
    source.includes("source: \"petguys_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:petguys-sitemap-catalog": "node scripts/export-petguys-sitemap-targets.js"') &&
    packageJson.includes('"test:petguys-sitemap-catalog-export": "node scripts/test-petguys-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:petguys-sitemap-catalog-export"),
  "package scripts must expose PetGuys sitemap exporter and include its guard in test:guards"
);

console.log("PetGuys sitemap catalog export guard passed");
