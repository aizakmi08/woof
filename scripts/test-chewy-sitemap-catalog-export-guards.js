#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-chewy-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Chewy sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.chewy.com/app/sitemap/behijkmoqrrtttvvy-pdp-sitemap_index.xml") &&
    source.includes("--sitemap-index=url") &&
    source.includes("--max-sitemaps=N") &&
    source.includes("--include-existing") &&
    source.includes("--include-treats") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapIndexUrl)") &&
    source.includes("pdp_\\d+\\.xml\\.gz") &&
    !source.includes("/b/dry-food") &&
    !source.includes("/b/wet-food") &&
    !source.includes("app/dp"),
  "exporter must use bounded Chewy PDP sitemaps instead of challenged category/product scraping"
);

assert(
  source.includes("const zlib = require(\"zlib\")") &&
    source.includes("zlib.gunzipSync(buffer)") &&
    source.includes("function parseProductUrls(xml, sitemapUrl)") &&
    source.includes("<image:title>") &&
    source.includes("<image:loc>") &&
    source.includes("case of|pack of") &&
    source.includes("oz|fl\\s*-?\\s*oz|lb|lbs|kg|g|pound|ounce") &&
    source.includes("retailerProductId") &&
    source.includes("sourceSitemap"),
  "exporter must parse sitemap product titles, image URLs, product ids, and source sitemap provenance"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("TREAT_TERMS") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("function isCandidateFoodTitle(title)") &&
    source.includes("if (!coreFood && !treat) return false") &&
    source.includes("petTypes.length === 0"),
  "exporter must strictly filter sitemap titles to dog/cat food-like products before backfill"
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
    source.includes("skipped.existing++") &&
    source.includes("!includeExisting"),
  "exporter must read existing product_data keys and skip existing targets unless explicitly included"
);

assert(
  source.includes("source: \"chewy_sitemap_export\"") &&
    source.includes("sourceQuality: \"retailer_sitemap_title\"") &&
    source.includes("sourceUrl: row.sourceUrl") &&
    source.includes("imageUrl: row.imageUrl") &&
    source.includes("searchTerms: [...new Set([name, row.sourceUrl].filter(Boolean))]") &&
    source.includes("cacheKey,") &&
    source.includes("petTypes,") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText") &&
    !source.includes("ingredients_text"),
  "targets must be backfill-compatible and must not export raw ingredient payloads"
);

assert(
  source.includes("!/^https:\\/\\/www\\.chewy\\.com\\//i.test(url)") &&
    source.includes("/^https:\\/\\/www\\.chewy\\.com\\/ca\\//i.test(url)") &&
    source.includes("!//dp/") === false &&
    source.includes("if (!/\\/dp\\/\\d+(?:$|[/?#])/i.test(url)) return \"\";"),
  "exporter must keep only US Chewy PDP URLs"
);

assert(
  source.includes("generatedAt: new Date().toISOString()") &&
    source.includes("source: \"chewy_pdp_sitemap\"") &&
    source.includes("sitemapIndexUrl,") &&
    source.includes("sitemapsFetched,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:chewy-sitemap-catalog": "node scripts/export-chewy-sitemap-targets.js"') &&
    packageJson.includes('"test:chewy-sitemap-catalog-export": "node scripts/test-chewy-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:chewy-sitemap-catalog-export"),
  "package scripts must expose Chewy sitemap exporter and include its guard in test:guards"
);

console.log("Chewy sitemap catalog export guard passed");
