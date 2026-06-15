#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/merge-catalog-targets.js"), "utf8");
const backfillSource = fs.readFileSync(path.join(root, "scripts/backfill-product-catalog-via-lookup.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`catalog target merge guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("const fs = require(\"fs\")") &&
    source.includes("require(\"./catalog-pet-type\")") &&
    !source.includes("fetch(") &&
    !source.includes("SUPABASE") &&
    !source.includes("PRODUCT_LOOKUP_SERVICE_KEY"),
  "merge script must be a read-only local manifest operation with no network or write credentials"
);

assert(
  source.includes("DEFAULT_OUTPUT = \".tmp/catalog-backfill-unified-targets.json\"") &&
    source.includes("inputArgs = process.argv.filter((arg) => arg.startsWith(\"--input=\"))") &&
    source.includes("expandInputFiles") &&
    source.includes("arg.split(\"=\")[1].split(\",\")") &&
    source.includes("--output=path.json") &&
    source.includes("--limit=N"),
  "merge script must expose repeatable input, output, and bounded planning options"
);

assert(
  source.includes("function normalizeCacheKey(text)") &&
    source.includes("function productLookupRequestCacheKey(target)") &&
    source.includes("function collectPlannedCacheKeys(target)") &&
    source.includes("aliasToCanonicalKey") &&
    source.includes("existingCanonical") &&
    source.includes("mergeTarget(byCanonicalKey.get(canonicalKey), target)"),
  "merge script must dedupe across canonical and product-lookup request cache keys"
);

assert(
  source.includes("function normalizeExplicitPetTypes(target)") &&
    source.includes("inferPetTypes({") &&
    source.includes("includeAmbiguous: true") &&
    source.includes("petTypes") &&
    source.includes("explicitPetType") &&
    source.includes("searchTerms") &&
    source.includes("barcode: normalizeBarcode"),
  "merged targets must preserve backfill-compatible species, barcode, and search hints"
);

assert(
  source.includes("SOURCE_BACKFILL_PRIORITY") &&
    source.includes("sourceQualityRank") &&
    source.includes("quality === \"ingredient_text\"") &&
    source.includes("quality === \"barcode_name\"") &&
    source.includes("quality === \"curated_name\"") &&
    source.includes("quality.startsWith(\"official_brand_\")") &&
    source.includes("return 4") &&
    source.includes("[\"opff_export\", 4]") &&
    source.includes("compareTargets") &&
    source.includes("sourceRank - rankB.sourceRank") &&
    source.includes("Number(rankB.hasBarcode) - Number(rankA.hasBarcode)"),
  "merge script must keep higher-confidence targets first for service-key batches"
);

assert(
  source.includes("sourceManifests") &&
    source.includes("imageUrl: cleanText(entry.imageUrl || entry.image_url, 500)") &&
    source.includes("retailerProductId: cleanText(entry.retailerProductId || entry.retailer_product_id, 160)") &&
    source.includes("form: cleanText(entry.form, 40)") &&
    source.includes("productType: cleanText(entry.productType || entry.product_type, 120)") &&
    source.includes("sourceSitemap: cleanText(entry.sourceSitemap || entry.source_sitemap, 500)") &&
    source.includes("bySourceQuality") &&
    source.includes("byInput") &&
    source.includes("inputStats.push(stat)") &&
    source.includes("summary: summarizeTargets(targets, inputStats)") &&
    source.includes("source: \"merged_catalog_backfill_targets\"") &&
    source.includes("skipped: {") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText"),
  "merged manifest must retain audit provenance and avoid raw ingredient payloads"
);

assert(
  source.includes("const BRAND_HINTS = [") &&
    source.includes("function inferBrand(name)") &&
    source.includes("entry.brand || inferBrand(name)"),
  "merge script must mirror backfill brand inference so sparse barcode manifests stay valid"
);

assert(
  backfillSource.includes("const targetSource = String(target.source || source || \"\").trim() || source") &&
    backfillSource.includes("source: targetSource,"),
  "backfill input normalization must preserve per-row source metadata from merged manifests"
);

assert(
  packageJson.includes('"merge:catalog-targets": "node scripts/merge-catalog-targets.js"') &&
    packageJson.includes('"test:catalog-target-merge": "node scripts/test-catalog-target-merge-guards.js"') &&
    packageJson.includes("npm run test:catalog-target-merge"),
  "package scripts must expose catalog target merging and include its guard in test:guards"
);

console.log("catalog target merge guard passed");
