#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-petcarerx-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`PetCareRx sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.petcarerx.com/xml/sitemap.ashx") &&
    source.includes("https://www.petcarerx.com/xml/sitemap.ashx?map=ProductSitemap") &&
    source.includes("const configuredSitemapUrl = explicitSitemapUrl || DEFAULT_SITEMAP_URL") &&
    source.includes("--sitemap-index=url") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("USER_AGENT") &&
    /async function fetchText\(url\) \{[\s\S]{0,120}const curlText = fetchTextWithCurl\(url\);[\s\S]{0,80}if \(curlText\) return curlText;/.test(source) &&
    source.includes("spawnSync(\"curl\"") &&
    source.includes("fs.mkdtempSync(path.join(os.tmpdir(), \"woof-petcarerx-\"))") &&
    source.includes("\"-o\"") &&
    source.includes("fs.rmSync(tempDir, { recursive: true, force: true })") &&
    source.includes("function fetchTextWithCurl(url)") &&
    source.includes("fetchText(sitemapIndexUrl)") &&
    source.includes("function extractSitemapLocs(xml)") &&
    source.includes("async function resolveSitemapUrl()") &&
    source.includes("if (!sitemapIndexArg) return DEFAULT_SITEMAP_URL") &&
    source.includes("fetchText(sitemapUrl)") &&
    !source.includes("product-lookup"),
  "exporter must default to the reachable PetCareRx ProductSitemap and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("function parseProductUrls(xml, sitemapUrl)") &&
    source.includes("cleanProductName(block.match(/<image:title>") &&
    source.includes("productNameFromUrl(sourceUrl)") &&
    source.includes("retailerProductId") &&
    source.includes("sourceSitemap") &&
    source.includes("productIdFromUrl(sourceUrl)") &&
    source.includes("case of|pack of") &&
    source.includes("oz|fl\\s*-?\\s*oz|lb|lbs|kg|g|pound|ounce") &&
    source.includes("function titleCaseProductName(value)") &&
    source.includes("smallWords") &&
    source.includes("normalizedName.startsWith(`${normalizedBrand}-`)"),
  "exporter must derive cleaned product titles, product ids, and source sitemap provenance from sitemap entries"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("TREAT_TERMS") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"supplemental cat food\"") &&
    source.includes("\"meal topper\"") &&
    source.includes("\"medicine\"") &&
    source.includes("\"medicated\"") &&
    source.includes("\"tablet\"") &&
    source.includes("\"ointment\"") &&
    source.includes("BRAND_HINTS") &&
    source.includes("\"Badlands Ranch\"") &&
    source.includes("BRAND_PREFIX_ALIASES") &&
    source.includes("[\"Blue Natural Veterinarian Diet\", \"Blue Buffalo\"]") &&
    source.includes("[\"Beneful\", \"Purina Beneful\"]") &&
    source.includes("function inferBrand(name)") &&
    source.includes("function restoreKnownBrandTypography(value)") &&
    source.includes(".replace(/\\bHill S\\b/g, \"Hill's\")") &&
    source.includes("function isCandidateFoodUrl(row)") &&
    source.includes("if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("return coreFood || treat"),
  "exporter must strictly filter PetCareRx's mixed product sitemap to dog/cat food-like rows and reject medication/care/supplemental/treat rows by default"
);

assert(
  source.includes("async function fetchExistingCacheKeys()") &&
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
  source.includes("source: \"petcarerx_sitemap_export\"") &&
    source.includes("sourceQuality: \"retailer_sitemap_title\"") &&
    source.includes("brand,") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: row.imageUrl") &&
    source.includes("barcode: \"\"") &&
    source.includes("searchTerms: [...new Set([name, row.sourceUrl].filter(Boolean))]") &&
    source.includes("cacheKey,") &&
    source.includes("petTypes,") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText") &&
    !source.includes("ingredients_text"),
  "targets must be backfill-compatible and must not export raw ingredient payloads"
);

assert(
  source.includes("generatedAt: new Date().toISOString()") &&
    source.includes("source: \"petcarerx_product_sitemap\"") &&
    source.includes("sitemapIndexUrl,") &&
    source.includes("sitemapUrl,") &&
    source.includes("explicitSitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:petcarerx-sitemap-catalog": "node scripts/export-petcarerx-sitemap-targets.js"') &&
    packageJson.includes('"test:petcarerx-sitemap-catalog-export": "node scripts/test-petcarerx-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:petcarerx-sitemap-catalog-export"),
  "package scripts must expose PetCareRx sitemap exporter and include its guard in test:guards"
);

console.log("PetCareRx sitemap catalog export guard passed");
