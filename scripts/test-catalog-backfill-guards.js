#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/backfill-product-catalog-via-lookup.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`catalog backfill guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("PRODUCT_LOOKUP_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("SUPABASE_SERVICE_KEY"),
  "backfill runner must load env quietly and support service-role lookup credentials"
);

assert(
  source.includes("!PRODUCT_LOOKUP_SERVICE_KEY && !allowRateLimited") &&
    source.includes("Set PRODUCT_LOOKUP_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("--allow-rate-limited"),
  "backfill runner must refuse broad anonymous imports unless explicitly allowed"
);

assert(
  source.includes("scripts/prepopulate-products.js") &&
    source.includes("scripts/build-database.js") &&
    source.includes("scripts/fill-gaps.js") &&
    source.includes("scripts/save-verified.js") &&
    source.includes("scripts/seed-accurate.js") &&
    source.includes("parseObjectTargets") &&
    source.includes("parseStringTargets") &&
    source.includes("loadExtraTargets") &&
    source.includes("scripts/seed-universal.js"),
  "backfill runner must build candidates from existing curated product lists and optional input"
);

assert(
  source.includes("function normalizeExplicitPetTypes(target)") &&
    source.includes("target.petType, target.pet_type, target.pet, target.species") &&
    source.includes('if (value === "dog" || value === "cat") normalized.push(value);') &&
    source.includes("const explicitPetTypes = normalizeExplicitPetTypes(target)") &&
    source.includes("const petTypes = explicitPetTypes.length > 0 ? explicitPetTypes : inferPetTypes({"),
  "backfill targets must preserve explicit dog/cat hints from curated lists and exported manifests before using ambiguous inference"
);

assert(
  source.includes("const productsStart = sourceText.search(/const\\s+(?:PRODUCTS|ALL_PRODUCTS|FIX)\\s*=\\s*\\[/)"),
  "backfill runner must parse legacy PRODUCTS arrays plus ALL_PRODUCTS/FIX product target arrays"
);

assert(
  source.includes("function loadTargetSourceFiles()") &&
    source.includes("scripts/mega-scraper") &&
    source.includes("fs.readdirSync(megaDir)") &&
    source.includes('if (name.endsWith(".js")) sourceSet.add(path.join("scripts/mega-scraper", name))'),
  "backfill runner must include additional mega-scraper target lists instead of only the four legacy curated scripts"
);

assert(
  source.includes('const objectPattern = /\\{[^{}]*(?:name|productName):\\s*["\'][^"\']+["\'][^{}]*\\}/g') &&
    source.includes('const name = block.match(/\\b(?:name|productName):\\s*["\']([^"\']+)["\']/)?.[1]') &&
    source.includes('const brand = block.match(/\\bbrand:\\s*["\']([^"\']+)["\']/)?.[1]') &&
    source.includes('const petType = block.match(/\\b(?:petType|pet_type|pet|species):\\s*["\']([^"\']+)["\']/)?.[1]') &&
    source.includes("if (!name || !brand) continue;") &&
    source.includes("cleanTarget({ name, brand, petType }, source)"),
  "backfill runner must parse single- or double-quoted multiline name/brand object targets with optional species hints and infer dog/cat when missing"
);

assert(
  source.includes('if (/\\{\\s*(?:name|productName|brand)\\s*:/.test(block)) return targets;') &&
    source.includes('for (const match of block.matchAll(/["\']([^"\'\\n]{8,220})["\']/g))'),
  "backfill string-array parsing must support single quotes but skip object arrays so brands and species values are not treated as products"
);

assert(
  source.includes("require(\"./catalog-pet-type\")") &&
    source.includes("inferPetTypes") &&
    source.includes("const petTypes = explicitPetTypes.length > 0 ? explicitPetTypes : inferPetTypes({") &&
    source.includes("const targetSource = String(target.source || source || \"\").trim() || source") &&
    source.includes("source,") &&
    source.includes("source: targetSource,") &&
    source.includes("petType: target.petType || target.pet") &&
    source.includes("pet_type: target.pet_type || target.species") &&
    source.includes("petTypes,") &&
    source.includes("byTargetPetType") &&
    source.includes("for (const petType of target.petTypes || [target.petType])"),
  "backfill targets must keep explicit or inferred dog/cat lookup candidates instead of defaulting ambiguous products to dog-only"
);

assert(
  source.includes("getExistingCacheKeys") &&
    source.includes("const plannedCacheKeys = collectVerificationCacheKeys(target)") &&
    source.includes("const existingCacheKey = plannedCacheKeys.find((cacheKey) => existing.has(cacheKey))") &&
    source.includes("return !existingCacheKey") &&
    source.includes("/functions/v1/product-lookup") &&
    source.includes("productName: target.name") &&
    source.includes("async function lookupTarget(target, petType = target.petType)") &&
    source.includes("petType,") &&
    source.includes("barcode: target.barcode || undefined") &&
    source.includes("searchTerms: target.searchTerms"),
  "backfill runner must skip existing product_data rows across planned target and product-lookup request keys, then use product-lookup for verified writes with barcode hints when available"
);

assert(
  source.includes("const fullName = brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name") &&
    source.includes("const cacheKey = normalizeCacheKey(fullName)") &&
    source.includes("searchTerms: [...new Set([name, fullName].filter(Boolean))]"),
  "backfill targets must avoid duplicated brand prefixes in cache keys and product-lookup search terms"
);

assert(
  source.includes("--dry-run") &&
    source.includes("--limit=") &&
    source.includes("--concurrency=N") &&
    source.includes("--input-only") &&
    source.includes("--delay-ms=") &&
    source.includes("--max-failures=") &&
    source.includes("--report=") &&
    source.includes("--resume-report") &&
    source.includes("--export-missing=path.json") &&
    source.includes("--no-verify-writes") &&
    source.includes("AbortSignal.timeout(90_000)"),
  "backfill runner must support dry-runs, bounded batches, pacing, reports, resume, failure caps, and request timeouts"
);

assert(
  source.includes("BACKFILL_PRIORITY_DESCRIPTION = \"source_quality,ingredient_source,species_specificity,brand_confidence,name_specificity,name\"") &&
    source.includes("SOURCE_BACKFILL_PRIORITY = [") &&
    source.includes("[\"scripts/seed-accurate.js\", 0]") &&
    source.includes("[\"scripts/save-verified.js\", 0]") &&
    source.includes("[\"scripts/prepopulate-products.js\", 1]") &&
    source.includes("[\"scripts/mega-scraper/openfarm-complete.js\", 1]") &&
    source.includes("[\"scripts/mega-scraper\", 4]") &&
    source.includes("explicitPetType: explicitPetTypes.length > 0") &&
    source.includes("function backfillSourcePriority(source)") &&
    source.includes("function targetNameSpecificity(target)") &&
    source.includes("function knownBrandConfidence(target)") &&
    source.includes("function sourceQualityRank(target)") &&
    source.includes("quality === \"ingredient_text\"") &&
    source.includes("quality === \"barcode_name\"") &&
    source.includes("quality === \"curated_name\"") &&
    source.includes("quality === \"retailer_sitemap_title\"") &&
    source.indexOf("quality === \"curated_name\"") < source.indexOf("quality === \"retailer_sitemap_title\"") &&
    source.includes("function catalogBackfillPriority(target)") &&
    source.includes("function compareCatalogBackfillTargets(a, b)") &&
    source.includes("function prioritizeCatalogBackfillTargets(targets)") &&
    source.includes("priorityA.sourceRank - priorityB.sourceRank") &&
    source.includes("priorityA.sourceQualityRank - priorityB.sourceQualityRank") &&
    source.includes("Number(priorityB.explicitPetType) - Number(priorityA.explicitPetType)") &&
    source.includes("priorityA.targetPetTypeCount - priorityB.targetPetTypeCount") &&
    source.includes("priorityB.nameSpecificity - priorityA.nameSpecificity") &&
    source.includes("const missing = prioritizeCatalogBackfillTargets(targets.filter((target)") &&
    source.includes("Selection priority: ${BACKFILL_PRIORITY_DESCRIPTION}") &&
    source.includes("selectionPriority: BACKFILL_PRIORITY_DESCRIPTION") &&
    source.includes("selection_priority: BACKFILL_PRIORITY_DESCRIPTION"),
  "backfill runner must prioritize first service-key batches toward higher-confidence, species-specific catalog targets instead of parser order"
);

assert(
    source.includes("const entries = Array.isArray(data) ? data : data?.targets") &&
    source.includes('usage("--input JSON must be an array or an object with a targets array.")') &&
    source.includes("const inputOnly = process.argv.includes(\"--input-only\")") &&
    source.includes("let inputTargetStats = null") &&
    source.includes("inputTargetStats = {") &&
    source.includes("entries: entries.length") &&
    source.includes("valid: byKey.size") &&
    source.includes("invalid,") &&
    source.includes("duplicate,") &&
    source.includes("Input target filter:") &&
    source.includes("inputTargetFilter: inputTargetStats") &&
    source.includes("input_target_filter: inputTargetStats") &&
    source.includes("No valid --input-only catalog targets were found") &&
    source.includes("!dryRun && inputOnly && inputTargetStats && inputTargetStats.valid === 0") &&
    source.includes('usage("--input-only requires --input=path.json.")') &&
    source.includes("if (inputOnly) return loadExtraTargets();"),
  "backfill --input must accept raw arrays/exported { targets } manifests, report input quality, and fail closed for empty input-only write runs"
);

assert(
  source.includes("const MAX_BACKFILL_CONCURRENCY = 8") &&
    source.includes("const concurrencyArg = process.argv.find((arg) => arg.startsWith(\"--concurrency=\"))") &&
    source.includes("const concurrency = concurrencyArg ? Number(concurrencyArg.split(\"=\")[1]) : 1") &&
    source.includes("concurrency > MAX_BACKFILL_CONCURRENCY") &&
    source.includes("--concurrency must be an integer between 1 and ${MAX_BACKFILL_CONCURRENCY}") &&
    source.includes("async function processSelectedTargets(selected)") &&
    source.includes("async function waitForLaunchSlot()") &&
    source.includes("const launchAt = Math.max(nextLaunchAt, now)") &&
    source.includes("nextLaunchAt = launchAt + delayMs") &&
    source.includes("await waitForLaunchSlot();\n      if (stopRequested) break;") &&
    source.includes("const workerCount = Math.min(concurrency, selected.length)") &&
    source.includes("Promise.all(Array.from({ length: workerCount }, () => worker()))") &&
    source.includes("Concurrency: ${dryRun ? 0 : concurrency}") &&
    source.includes("delay_ms: delayMs"),
  "backfill runner must support capped concurrent product-lookup workers with globally paced launches and report metadata"
);

assert(
  source.includes("const exportMissingArg = process.argv.find((arg) => arg.startsWith(\"--export-missing=\"))") &&
    source.includes("const exportMissingPath = exportMissingArg ? path.resolve(root, exportMissingArg.split(\"=\")[1]) : null") &&
    source.includes("function summarizeTargets(targets)") &&
    source.includes("function exportMissingTargets(targets, metadata)") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets: targets.map((target) => ({") &&
    source.includes("priority: catalogBackfillPriority(target)") &&
    source.includes("Missing by pet type:") &&
    source.includes("Missing lookup target pet types:") &&
    source.includes("Top missing sources:") &&
    source.includes("exportMissingTargets(missing, {"),
  "backfill runner must export an auditable missing-target manifest with source and pet-type summaries"
);

assert(
  source.includes("getProductDataRow") &&
    source.includes("verifyProductDataWrite") &&
    source.includes("productLookupRequestCacheKey") &&
    source.includes("collectVerificationCacheKeys") &&
    source.includes("const FATAL_PRODUCT_LOOKUP_HTTP_STATUS = new Set([401, 403, 429, 503])") &&
    source.includes("function fatalProductLookupFailureReason(result)") &&
    source.includes('return "product_lookup_auth"') &&
    source.includes('return "product_lookup_rate_limited"') &&
    source.includes('return "product_lookup_unavailable"') &&
    source.includes("lookupData?.cacheKey") &&
    source.includes("lookupData?.cache_key") &&
    source.includes("product_data_ready") &&
    source.includes("verified saved") &&
    source.includes("const petTypes = [...new Set(target.petTypes || [target.petType])]") &&
    source.includes("for (const petType of petTypes)") &&
    source.includes("const result = await lookupTarget(target, petType)") &&
    source.includes("verifyProductDataWrite(target, result.data)") &&
    source.includes("saved_cache_key") &&
    source.includes("target_cache_key") &&
    source.includes("checked_cache_keys") &&
    source.includes("attempted_pet_types: petTypes") &&
    source.includes("misses.push({") &&
    source.includes("const fatalReason = fatalProductLookupFailureReason(result)") &&
    source.includes("fatalReason: fatalReason || undefined") &&
    source.includes("const fatalReason = misses.map((entry) => entry.fatalReason).find(Boolean) || \"\"") &&
    source.includes('status: fatalReason ? "fatal_failed" : hardFailure ? "failed" : "not_found"') &&
    source.includes("fatal_reason: fatalReason || undefined") &&
    source.includes("stopRequested = true;") &&
    source.includes("const hardFailure = fatalReason || misses.some((entry) => !entry.notFound)") &&
    source.includes("if (failed > 0 || unverified > 0) process.exit(1)"),
  "backfill runner must try each inferred pet type, verify writes, stop on fatal lookup auth/rate-limit/service failures, and fail nonzero for failed or unverified imports"
);

assert(
  source.includes("appendReport") &&
    source.includes("catalog_backfill_start") &&
    source.includes("catalog_backfill_result") &&
    source.includes("catalog_backfill_done") &&
    source.includes("concurrency,") &&
    source.includes("status === \"verified_saved\"") &&
    source.includes("entry?.target_cache_key") &&
    source.includes("entry?.saved_cache_key") &&
    source.includes("collectVerificationCacheKeys(target).some((cacheKey) => reportVerifiedKeys.has(cacheKey))") &&
    source.includes("[skip report-verified]"),
  "backfill runner must write resumable JSONL reports and only resume from verified saved target or saved rows"
);

assert(
  packageJson.includes('"backfill:catalog": "node scripts/backfill-product-catalog-via-lookup.js"') &&
    packageJson.includes('"test:catalog-backfill": "node scripts/test-catalog-backfill-guards.js"') &&
    packageJson.includes("npm run test:catalog-backfill"),
  "catalog backfill script and guard must be wired into package scripts and test:guards"
);

console.log("catalog backfill guard passed");
