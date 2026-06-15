#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-weruva-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Weruva sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.weruva.com/sitemap.xml") &&
    source.includes("const SOURCE_BRAND = \"Weruva\"") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("productSitemapUrls(indexXml)") &&
    source.includes("productNameFromSlug(parsed.slug)") &&
    source.includes("www\\.weruva\\.com\\/products") &&
    source.includes("sitemap_products_") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Weruva product sitemap index, derive titles from product slugs, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"cat can\"") &&
    source.includes("\"dog pouch\"") &&
    source.includes("\"dog cup\"") &&
    source.includes("\"variety pack\"") &&
    source.includes("PACKAGE_TERMS") &&
    source.includes("TREAT_TERMS") &&
    source.includes("\"lickable treats\"") &&
    source.includes("\"puddy pops\"") &&
    source.includes("SUPPLEMENTAL_FOOD_TERMS") &&
    source.includes("\"bone broth\"") &&
    source.includes("\"bisque\"") &&
    source.includes("\"saucy supplement\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("\"catnip toy\"") &&
    source.includes("\"litter box\"") &&
    source.includes("function inferWeruvaPetTypes(row)") &&
    source.includes("if (hasTerm(text, \"dog\") || hasTerm(text, \"puppy\")) return [\"dog\"]") &&
    source.includes("if (hasTerm(text, \"cat\") || hasTerm(text, \"kitten\")) return [\"cat\"]") &&
    source.includes("function brandFromSlug(slug)") &&
    source.includes("return \"Cat Person\"") &&
    source.includes("return \"Soulistic\"") &&
    source.includes("return \"BFF\"") &&
    source.includes("function parsedProductPath(url)") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Dogs`") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!/^https:\\/\\/www\\.weruva\\.com\\/products\\//i.test(row.sourceUrl)) return false") &&
    source.includes("if (!PACKAGE_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (TREAT_TERMS.some((term) => hasTerm(text, term))) return false"),
  "exporter must strictly filter Weruva sitemap rows to species-explicit packaged foods while rejecting treats, broths, bisques, supplements, litter, toys, and non-food rows"
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
  source.includes("source: \"weruva_sitemap_export\"") &&
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
    source.includes("source: \"weruva_product_sitemap\"") &&
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
  packageJson.includes('"export:weruva-sitemap-catalog": "node scripts/export-weruva-sitemap-targets.js"') &&
    packageJson.includes('"test:weruva-sitemap-catalog-export": "node scripts/test-weruva-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:weruva-sitemap-catalog-export"),
  "package scripts must expose Weruva sitemap exporter and include its guard in test:guards"
);

console.log("Weruva sitemap catalog export guard passed");
