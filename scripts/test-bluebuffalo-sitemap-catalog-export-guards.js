#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-bluebuffalo-sitemap-targets.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Blue Buffalo sitemap catalog export guard failed: ${message}`);
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
  source.includes("https://www.bluebuffalo.com/sitemap.xml") &&
    source.includes("const BRAND = \"Blue Buffalo\"") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-existing") &&
    source.includes("--skip-existing-scan") &&
    source.includes("USER_AGENT") &&
    source.includes("fetchText(sitemapUrl)") &&
    source.includes("sitemap\\.en\\.xml") &&
    source.includes("sitemapLocs.length !== 1") &&
    source.includes("productNameFromPath(parsed)") &&
    source.includes("www\\.bluebuffalo\\.com\\/(dry|wet)-(dog|cat)-food\\/[a-z0-9-]+\\/[a-z0-9-]+") &&
    source.includes("isRejectedPath(sourceUrl)") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read the official Blue Buffalo sitemap index, derive titles from English dry/wet dog/cat food paths, and avoid product-page scraping or product-lookup calls"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("includeAmbiguous: false") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("\"life protection\"") &&
    source.includes("\"wilderness\"") &&
    source.includes("\"basics\"") &&
    source.includes("\"freedom\"") &&
    source.includes("\"tastefuls\"") &&
    source.includes("\"true solutions\"") &&
    source.includes("\"natural veterinary diet\"") &&
    source.includes("\"baby blue\"") &&
    source.includes("\"blue delights\"") &&
    source.includes("\"puppy\"") &&
    source.includes("\"kitten\"") &&
    source.includes("REJECT_TERMS") &&
    source.includes("\"lickable\"") &&
    source.includes("\"puree\"") &&
    source.includes("\"purees\"") &&
    source.includes("\"treat\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"supplement\"") &&
    source.includes("\"food topper\"") &&
    source.includes("\"delectables\"") &&
    source.includes("\"meal makers\"") &&
    source.includes("\"tender shreds\"") &&
    source.includes("\"health bars\"") &&
    source.includes("\"blue bits\"") &&
    source.includes("\"purrfect moments\"") &&
    source.includes("\"mini purees\"") &&
    source.includes("\"soft chews\"") &&
    source.includes("NON_FOOD_TERMS") &&
    source.includes("function inferBlueBuffaloPetTypes(row)") &&
    source.includes("return [row.petType]") &&
    source.includes("function parsedProductPath(url)") &&
    source.includes("function formAndPetFromProductType(productType)") &&
    source.includes("function lineLabel(line, slug)") &&
    source.includes("\"life-protection-formula\": \"Life Protection Formula\"") &&
    source.includes("\"blue-natural-veterinary-diet\": \"Natural Veterinary Diet\"") &&
    source.includes("function productNameFromLineAndSlug(line, slug)") &&
    source.includes("const parsedType = formAndPetFromProductType(segments[0])") &&
    source.includes("function addSpeciesQualifier(name, petType)") &&
    source.includes("return `${name} for Cats`") &&
    source.includes("return `${name} for Dogs`") &&
    source.includes("function isCandidateFoodRow(row)") &&
    source.includes("if (!/^https:\\/\\/www\\.bluebuffalo\\.com\\/(dry|wet)-(dog|cat)-food\\/[a-z0-9-]+\\/[a-z0-9-]+$/i.test(row.sourceUrl)) return false") &&
    source.includes("if (![\"dry\", \"wet\"].includes(row.form)) return false") &&
    source.includes("if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false") &&
    source.includes("if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false"),
  "exporter must strictly filter Blue Buffalo sitemap rows to core dry/wet cat and dog foods while rejecting purees, treats, toppers, supplements, accessories, and non-food rows"
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
  source.includes("source: \"bluebuffalo_sitemap_export\"") &&
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
    source.includes("source: \"bluebuffalo_product_sitemap\"") &&
    source.includes("sitemapUrl,") &&
    source.includes("scannedProducts,") &&
    source.includes("existingCount: existing.size") &&
    source.includes("missingCount: targets.length") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,"),
  "manifest must include auditable source, sitemap, skip, summary, and target counts"
);

assert(
  packageJson.includes('"export:bluebuffalo-sitemap-catalog": "node scripts/export-bluebuffalo-sitemap-targets.js"') &&
    packageJson.includes('"test:bluebuffalo-sitemap-catalog-export": "node scripts/test-bluebuffalo-sitemap-catalog-export-guards.js"') &&
    packageJson.includes("npm run test:bluebuffalo-sitemap-catalog-export"),
  "package scripts must expose Blue Buffalo sitemap exporter and include its guard in test:guards"
);

console.log("Blue Buffalo sitemap catalog export guard passed");
