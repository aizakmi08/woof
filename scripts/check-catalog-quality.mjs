import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const failures = [];
const tempRoot = tmpdir();

function fail(message) {
  failures.push(message);
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireSnippet(filePath, source, snippet, label) {
  if (!source.includes(snippet)) {
    fail(`${filePath}: missing ${label || snippet}`);
  }
}

function forbidSnippet(filePath, source, snippet, label) {
  if (source.includes(snippet)) {
    fail(`${filePath}: forbidden ${label || snippet}`);
  }
}

function requireRegex(filePath, source, regex, label) {
  if (!regex.test(source)) {
    fail(`${filePath}: missing ${label}`);
  }
}

const productCatalogPath = "services/productCatalog.js";
const productCatalog = read(productCatalogPath);
requireSnippet(productCatalogPath, productCatalog, "product.pet_type === \"dog\"", "catalog pet_type detection");
requireSnippet(productCatalogPath, productCatalog, "function strongImageMatch", "strict image match guard");
requireSnippet(productCatalogPath, productCatalog, "MIN_SCORABLE_CATALOG_RANK", "catalog search rank confidence floor");
requireSnippet(productCatalogPath, productCatalog, "function filterScorableCatalogResults", "catalog search hides unscoreable rows");
requireSnippet(productCatalogPath, productCatalog, "function formulaDedupeKey", "visible catalog search collapses package duplicates by formula");
requireSnippet(productCatalogPath, productCatalog, "verifiedIngredientSignature", "package merging requires an exact verified ingredient statement");
requireSnippet(productCatalogPath, productCatalog, "function mergeFormulaPackageSizes", "formula matches retain their available package sizes");
requireSnippet(productCatalogPath, productCatalog, "availablePackageSizes", "merged formula results expose package-size choices");
requireSnippet(productCatalogPath, productCatalog, "supabase.rpc(\"search_verified_products\"", "app search uses strict verified RPC");
requireSnippet(productCatalogPath, productCatalog, "search_verified_products error; falling back", "strict verified RPC fallback logging");
requireSnippet(productCatalogPath, productCatalog, "productHasVerifiedIngredients(product)", "catalog search requires verified ingredients");
requireSnippet(productCatalogPath, productCatalog, "productHasVerifiedImage(product)", "catalog search requires verified product image");
requireSnippet(productCatalogPath, productCatalog, "Number(product.rank || 0) >= MIN_SCORABLE_CATALOG_RANK", "catalog search rejects weak verified siblings");
forbidSnippet(productCatalogPath, productCatalog, "KNOWN_IMMEDIATE_GAP_BRANDS", "brand-wide app search suppression");
forbidSnippet(productCatalogPath, productCatalog, "known verified-source gap; returning empty result set", "brand-wide verified miss shortcut");
forbidSnippet(productCatalogPath, productCatalog, "queryContainsKnownImmediateGapBrand", "brand-wide immediate gap helper");
forbidSnippet(productCatalogPath, productCatalog, "searchOpenPetFoodFacts", "typed product search community fallback");
requireSnippet(productCatalogPath, productCatalog, "export async function findVerifiedCatalogProductForLookup", "barcode-to-catalog lookup helper");
requireSnippet(productCatalogPath, productCatalog, "export async function findVerifiedCatalogProductByBarcode", "direct barcode-to-catalog GTIN lookup helper");
requireSnippet(productCatalogPath, productCatalog, "const matches = await searchWoofCatalog(variant, 8)", "direct barcode lookup uses verified search RPC");
requireSnippet(productCatalogPath, productCatalog, "const productBarcodes = barcodeVariants(product.gtin || product.barcode)", "direct barcode lookup checks GTIN variants");
forbidSnippet(productCatalogPath, productCatalog, ".in(\"gtin\", variants)", "direct barcode lookup must not depend on product_data table Data API access");
requireSnippet(productCatalogPath, productCatalog, "strongProductMatch(product, lookupProduct)", "strict verified catalog match");
requireRegex(productCatalogPath, productCatalog, /const match = catalogResults\.find\(\(product\) => \([\s\S]+productHasVerifiedIngredients\(product\) &&[\s\S]+productHasVerifiedImage\(product\) &&[\s\S]+strongProductMatch\(product, lookupProduct\)/, "barcode OPFF identity fallback requires verified image");
requireSnippet(productCatalogPath, productCatalog, "export function pickVerifiedProductForIdentification", "label verified recommendation helper");
requireSnippet(productCatalogPath, productCatalog, "LABEL_AUTO_OPEN_CONFIDENCE", "label auto-open confidence gate");
requireSnippet(productCatalogPath, productCatalog, "LABEL_AUTO_OPEN_CANDIDATE_COUNT", "label auto-open top-candidate window");
requireSnippet(productCatalogPath, productCatalog, "function hasSpeciesAmbiguousLabelMatches", "label auto-open blocks dog/cat ambiguous matches");
requireSnippet(productCatalogPath, productCatalog, "function labelIdentityText", "label identity combines flavor/product-line fields");
requireSnippet(productCatalogPath, productCatalog, "identification.flavor", "label identity uses visible flavor");
requireSnippet(productCatalogPath, productCatalog, "new Set(normalizeText(labelIdentityText", "label distinctive tokens are unique full-identity tokens");
requireSnippet(productCatalogPath, productCatalog, "function productHasDisplayImage", "label auto-open requires display image");
requireSnippet(productCatalogPath, productCatalog, "function strongLabelProductMatch", "label auto-open stricter identity match");
requireSnippet(productCatalogPath, productCatalog, "export function filterLabelCandidatesForIdentification", "label candidate list uses strict identity matching");
requireSnippet(productCatalogPath, productCatalog, "function inferredFoodForm", "label matching rejects wet and dry sibling products");
requireSnippet(productCatalogPath, productCatalog, "function labelBrandCompatible", "label matching rejects cross-brand sibling products");
requireSnippet(productCatalogPath, productCatalog, "searchWoofCatalogForLabelIdentity(searchQueries, 96)", "label matching batches catalog identity queries");
requireSnippet(productCatalogPath, productCatalog, "export function nonCompleteFoodReason", "non-complete label products are detected before scoring");
requireSnippet(productCatalogPath, productCatalog, "LABEL_REQUIRED_MATCH_TERMS", "label auto-open required recipe terms");
requireSnippet(productCatalogPath, productCatalog, "\"wholemade\"", "label auto-open requires product-line terms");
requireSnippet(productCatalogPath, productCatalog, "\"clusters\"", "label auto-open requires texture/format terms");
requireSnippet(productCatalogPath, productCatalog, "\"pumpkin\"", "label auto-open protects visible flavor terms");
requireSnippet(productCatalogPath, productCatalog, "\"rabbit\"", "label auto-open protects less common proteins");
requireSnippet(productCatalogPath, productCatalog, "\"insect\"", "label/search matching protects insect protein formulas");
requireSnippet(productCatalogPath, productCatalog, "\"plant\"", "label/search matching protects plant-based formulas");
requireSnippet(productCatalogPath, productCatalog, "\"ancient\"", "label/search matching protects ancient-grains variants");
requireSnippet(productCatalogPath, productCatalog, "\"grains\"", "label/search matching protects ancient-grains variants");
requireSnippet(productCatalogPath, productCatalog, "\"grain\"", "label/search matching protects grain-free variants");
requireSnippet(productCatalogPath, productCatalog, "\"free\"", "label/search matching protects grain-free variants");
requireSnippet(productCatalogPath, productCatalog, "\"toy\"", "catalog search protects toy-breed variant terms");
requireSnippet(productCatalogPath, productCatalog, "function requiredMatchTokenSet", "required recipe terms are not search-stop-word filtered");
requireSnippet(productCatalogPath, productCatalog, "VERIFIED_IMAGE_STATUSES", "label auto-open verified image statuses");
requireSnippet(productCatalogPath, productCatalog, "function hasRequiredLabelTerms", "label auto-open blocks missing variant terms");
requireSnippet(productCatalogPath, productCatalog, "!hasRequiredLabelTerms(catalogProduct, lookupProduct)", "label auto-open enforces required recipe terms");
requireSnippet(productCatalogPath, productCatalog, "function filterByRequiredQueryTerms", "typed and label search hide missing variant terms");
requireSnippet(productCatalogPath, productCatalog, "function productHasVerifiedImage", "label auto-open verified image guard helper");
requireSnippet(productCatalogPath, productCatalog, "products.slice(0, LABEL_AUTO_OPEN_CANDIDATE_COUNT)", "label auto-open scans top verified candidates");
requireSnippet(productCatalogPath, productCatalog, "productHasDisplayImage(product)", "label auto-open image gate");
requireSnippet(productCatalogPath, productCatalog, "productHasVerifiedImage(product)", "label auto-open requires verified image");
requireSnippet(productCatalogPath, productCatalog, "strongLabelProductMatch(product, lookupProduct)", "label auto-open strong label match");
requireSnippet(productCatalogPath, productCatalog, "if (hasSpeciesAmbiguousLabelMatches(identification, matches)) return null", "label auto-open returns choice list for dog/cat ambiguity");
requireSnippet(productCatalogPath, productCatalog, "labelSearchQuery(identification)", "label search uses full parsed identity");
requireSnippet(productCatalogPath, productCatalog, "compact(productIdentityText(lookupProduct))", "barcode catalog lookup uses full product identity");
requireRegex(productCatalogPath, productCatalog, /selectedProduct\s*=\s*pickVerifiedProductForIdentification\(identification, products\)/, "label lookup recommended product");
requireSnippet(productCatalogPath, productCatalog, "export async function resolveProduct", "unified product resolver export");
requireSnippet(productCatalogPath, productCatalog, "verificationState: selected?.verificationState", "unified resolver verification state");
requireSnippet(productCatalogPath, productCatalog, "if (!status) return false;", "catalog ingredients fail closed without verification status");
requireSnippet(productCatalogPath, productCatalog, "function productHasSourceEvidence", "catalog ingredients source evidence guard");
requireSnippet(productCatalogPath, productCatalog, "function productIdentityText", "catalog variant identity text");
requireSnippet(productCatalogPath, productCatalog, "productLine: firstCompact", "catalog product-line mapping");
requireSnippet(productCatalogPath, productCatalog, "flavor: firstCompact", "catalog flavor mapping");
requireSnippet(productCatalogPath, productCatalog, "packageSize: firstCompact", "catalog package-size mapping");
forbidSnippet(productCatalogPath, productCatalog, "if (!status) return true;", "catalog ingredients fail-open verification status");

const analysisPath = "services/analysisService.js";
const analysis = read(analysisPath);
requireSnippet(analysisPath, analysis, "findVerifiedCatalogProductForLookup", "barcode verified catalog import");
requireSnippet(analysisPath, analysis, "findVerifiedCatalogProductByBarcode", "barcode direct verified catalog import");
requireRegex(analysisPath, analysis, /const directCatalogMatch = await findVerifiedCatalogProductByBarcode\(barcode,[\s\S]+const lookup = await lookupBarcode\(barcode\)/, "barcode checks verified catalog before OPFF");
requireRegex(analysisPath, analysis, /const catalogMatch = await findVerifiedCatalogProductForLookup\(lookup\.product/, "barcode catalog match before AI fallback");
requireSnippet(analysisPath, analysis, "Barcode not found in OPFF or verified catalog", "barcode miss message includes verified catalog lookup");
requireRegex(analysisPath, analysis, /await _consumeScanForState\(state,\s*\"barcode\"\)[\s\S]+buildVerifiedPetFoodAnalysis\(verifiedProduct\)/, "barcode deterministic verified scoring");
requireSnippet(analysisPath, analysis, "hasVerifiedProductImageData", "analysis service checks verified image provenance");
requireSnippet(analysisPath, analysis, "function _hasVerifiedResultProvenance", "analysis service shared verified result provenance helper");
requireSnippet(analysisPath, analysis, "Ignoring barcode cache without verified ingredient/image provenance", "barcode rejects stale unverified cache");
requireSnippet(analysisPath, analysis, "Ignoring local verified result without ingredient/image provenance", "local result rejects stale unverified cache");
requireSnippet(analysisPath, analysis, "reason: \"verification_required\"", "barcode OPFF-only hit requires verification fallback");
forbidSnippet(analysisPath, analysis, "analyzeWithData(lookup.product", "barcode OPFF-only AI scoring fallback");
forbidSnippet(analysisPath, analysis, "_saveLocalResult(barcode, analysis, \"verified\", lookup.product)", "barcode OPFF-only verified cache write");

const opffPath = "services/opff.js";
const opff = read(opffPath);
requireSnippet(opffPath, opff, "product-lookup function barcode", "barcode lookup uses catalog-first product lookup edge function");
requireSnippet(opffPath, opff, "sourceKind: p.sourceKind || p.source_kind || null", "product lookup preserves catalog provenance");
requireSnippet(opffPath, opff, "ingredientVerificationStatus", "product lookup preserves ingredient verification status");
requireSnippet(opffPath, opff, "imageVerificationStatus", "product lookup preserves image verification status");

const claudePath = "services/claude.js";
const claude = read(claudePath);
requireSnippet(claudePath, claude, "productLine: optionalString(result.productLine)", "label lookup product-line client field");
requireSnippet(claudePath, claude, "flavor: optionalString(result.flavor)", "label lookup flavor client field");
requireSnippet(claudePath, claude, "packageSize: optionalString(result.packageSize)", "label lookup package-size client field");

const labelLookupFunctionPath = "supabase/functions/label-lookup/index.ts";
const labelLookupFunction = read(labelLookupFunctionPath);
requireSnippet(labelLookupFunctionPath, labelLookupFunction, "\"productLine\": \"visible product line/sub-brand or empty string\"", "label lookup product-line prompt schema");
requireSnippet(labelLookupFunctionPath, labelLookupFunction, "\"flavor\": \"visible flavor or recipe", "label lookup flavor prompt schema");
requireSnippet(labelLookupFunctionPath, labelLookupFunction, "packageSize", "label lookup package-size prompt schema");

const productLookupFunctionPath = "supabase/functions/product-lookup/index.ts";
const productLookupFunction = read(productLookupFunctionPath);
requireSnippet(productLookupFunctionPath, productLookupFunction, "search_verified_products", "product lookup edge function uses verified catalog RPC");
requireSnippet(productLookupFunctionPath, productLookupFunction, "findCatalogByBarcode", "product lookup edge function checks verified GTIN matches");
requireSnippet(productLookupFunctionPath, productLookupFunction, "dedupeCatalogFormulaProducts", "product lookup edge function collapses package variants by formula");
requireSnippet(productLookupFunctionPath, productLookupFunction, "verifiedIngredientSignature", "edge formula merging requires exact verified ingredients");
requireSnippet(productLookupFunctionPath, productLookupFunction, "mergeFormulaPackageSizes", "edge formula merging retains package sizes");
requireRegex(productLookupFunctionPath, productLookupFunction, /async function lookupBarcode[\s\S]+findCatalogByBarcode[\s\S]+OPFF_BASE/, "product lookup barcode path checks verified catalog before OPFF");
requireRegex(productLookupFunctionPath, productLookupFunction, /async function searchByName[\s\S]+searchVerifiedCatalog[\s\S]+OPFF_BASE/, "product lookup search path checks verified catalog before OPFF");

const analyzeFunctionPath = "supabase/functions/analyze/index.ts";
const analyzeFunction = read(analyzeFunctionPath);
requireSnippet(analyzeFunctionPath, analyzeFunction, "\"productLine\": \"visible product line/sub-brand or empty string\"", "analyze label lookup product-line prompt schema");
requireSnippet(analyzeFunctionPath, analyzeFunction, "\"flavor\": \"visible flavor or recipe", "analyze label lookup flavor prompt schema");
requireSnippet(analyzeFunctionPath, analyzeFunction, "packageSize", "analyze label lookup package-size prompt schema");

const verifiedScoringPath = "services/verifiedScoring.js";
const verifiedScoring = read(verifiedScoringPath);
requireSnippet(verifiedScoringPath, verifiedScoring, "imageUrl: product.imageUrl || null", "verified scoring carries image URL");
requireSnippet(verifiedScoringPath, verifiedScoring, "product.sourceUrl || product.source_url", "verified scoring requires source evidence");
requireSnippet(verifiedScoringPath, verifiedScoring, "export function hasVerifiedProductImageData", "verified scoring exposes image provenance helper");
requireSnippet(verifiedScoringPath, verifiedScoring, "VERIFIED_IMAGE_STATUSES", "verified scoring image status allowlist");
requireSnippet(verifiedScoringPath, verifiedScoring, "productLine: product.productLine ||", "verified scoring carries product-line identity");
requireSnippet(verifiedScoringPath, verifiedScoring, "flavor: product.flavor ||", "verified scoring carries flavor identity");
requireSnippet(verifiedScoringPath, verifiedScoring, "packageSize: product.packageSize ||", "verified scoring carries package-size identity");
requireSnippet(verifiedScoringPath, verifiedScoring, "if (!status) return false;", "verified scoring fails closed without verification status");
forbidSnippet(verifiedScoringPath, verifiedScoring, "if (!status) return true;", "verified scoring fail-open verification status");

const resultScreenPath = "screens/ResultsScreen/index.js";
const resultScreen = read(resultScreenPath);
requireSnippet(resultScreenPath, resultScreen, "function productImageUri", "result product image resolver");
requireSnippet(resultScreenPath, resultScreen, "styles.productImageHero", "result product image hero");
requireSnippet(resultScreenPath, resultScreen, "compactUrl(uri)", "scanned photo fallback image");
requireSnippet(resultScreenPath, resultScreen, "Ingredients not verified yet", "barcode verification fallback message");
requireSnippet(resultScreenPath, resultScreen, "verification_required", "barcode verification fallback telemetry");
requireSnippet(resultScreenPath, resultScreen, "Pending catalog verification", "user ingredient capture is not presented as verified catalog evidence");
requireSnippet(resultScreenPath, resultScreen, "User submission", "ingredient capture provenance identifies user-submitted evidence");

const scannerPath = "screens/ScannerScreen.js";
const scanner = read(scannerPath);
requireSnippet(scannerPath, scanner, "BARCODE_PREVIEW_TIMEOUT_MS", "barcode preview capture timeout");
requireSnippet(scannerPath, scanner, "captureBarcodePreview(cameraRef)", "barcode package preview capture");
requireSnippet(scannerPath, scanner, "uri: previewUri", "barcode preview image handoff");

const homeScreenPath = "screens/HomeScreen.js";
const homeScreen = read(homeScreenPath);
requireSnippet(homeScreenPath, homeScreen, "scan_mode: \"label_lookup\"", "home primary scan is front-label lookup");
requireSnippet(homeScreenPath, homeScreen, "navigation.navigate(\"Scanner\", { mode: \"label_lookup\" });", "home primary scan opens label lookup scanner");
requireSnippet(homeScreenPath, homeScreen, "Scan Ingredients", "ingredient capture remains secondary");
requireSnippet(homeScreenPath, homeScreen, "mode: \"ingredient_capture\"", "home secondary scan opens ingredient capture mode");

const coveragePath = "services/catalogCoverage.js";
const coverage = read(coveragePath);
requireSnippet(coveragePath, coverage, "catalog_lookup_completed", "catalog hit event");
requireSnippet(coveragePath, coverage, "catalog_lookup_miss", "catalog miss event");
requireSnippet(coveragePath, coverage, "catalog_lookup_failed", "catalog failed event");
requireSnippet(coveragePath, coverage, "catalog_verification_gap", "catalog verification gap event");
requireSnippet(coveragePath, coverage, "fallback_image_count", "fallback image telemetry");
requireSnippet(coveragePath, coverage, "logCatalogVerificationGapEvent", "verification gap telemetry export");
requireSnippet(coveragePath, coverage, "submitCatalogIngredientCapture", "user ingredient capture submission export");
requireSnippet(coveragePath, coverage, "needs_verified_ingredient_count", "verified ingredient gap telemetry");
requireSnippet(coveragePath, coverage, "needs_verified_image_count", "verified image gap telemetry");
requireSnippet(coveragePath, coverage, "function hasSourceEvidence", "catalog coverage source evidence guard");
forbidSnippet(coveragePath, coverage, "\"scan_preview\"", "scan preview is not verified product-image evidence");

const searchScreenPath = "screens/ProductSearchScreen.js";
const searchScreen = read(searchScreenPath);
requireSnippet(searchScreenPath, searchScreen, "logCatalogLookupEvent", "catalog coverage import");
requireSnippet(searchScreenPath, searchScreen, "logCatalogVerificationGapEvent", "catalog verification gap import");
requireSnippet(searchScreenPath, searchScreen, "Scan Ingredients", "search gap asks for ingredient capture");
requireSnippet(searchScreenPath, searchScreen, "mode: \"ingredient_capture\"", "search gap opens ingredient capture mode");
requireSnippet(searchScreenPath, searchScreen, "SEARCH_RESULT_LIMIT = 12", "catalog search result window stays latency-friendly");
requireSnippet(searchScreenPath, searchScreen, "PRODUCT_QUERY_REQUIRED_TERMS", "typed search required recipe terms");
requireSnippet(searchScreenPath, searchScreen, "\"wholemade\"", "typed search requires product-line terms");
requireSnippet(searchScreenPath, searchScreen, "\"clusters\"", "typed search requires texture/format terms");
requireSnippet(searchScreenPath, searchScreen, "\"pumpkin\"", "typed search protects visible flavor terms");
requireSnippet(searchScreenPath, searchScreen, "\"rabbit\"", "typed search protects less common proteins");
requireSnippet(searchScreenPath, searchScreen, "function productMatchesQueryTerms", "typed search exact recipe guard helper");
requireSnippet(searchScreenPath, searchScreen, "catalogVerificationState", "typed search shared verification state helper");
requireSnippet(searchScreenPath, searchScreen, "productIsReady(product)", "search result readiness uses catalog evidence");
requireSnippet(searchScreenPath, searchScreen, "getCachedCatalogSearch", "catalog search cache read");
requireSnippet(searchScreenPath, searchScreen, "saveCachedCatalogSearch", "catalog search cache write");
requireSnippet(searchScreenPath, searchScreen, "catalog_search_cache_hit", "catalog search cache telemetry");
requireSnippet(searchScreenPath, searchScreen, "productIsVerifiedReady(product)", "search readiness source/image/ingredient evidence guard");
requireSnippet(searchScreenPath, searchScreen, "catalogVerificationState(product).label", "search result status labels from verification state");
requireSnippet(searchScreenPath, searchScreen, "function productVariantLabel", "search result variant identity label");
requireRegex(searchScreenPath, searchScreen, /logCatalogLookupEvent\(\{[\s\S]+source,[\s\S]+query:\s*term,[\s\S]+products:\s*result\.products/, "typed search coverage logging");
requireRegex(searchScreenPath, searchScreen, /logCatalogLookupEvent\(\{[\s\S]+source:\s*recognitionPath === \"on_device_ocr\" \? \"label_scan_on_device\" : \"label_scan\"[\s\S]+identification:\s*result\.identification/, "label scan coverage logging");
requireRegex(searchScreenPath, searchScreen, /logCatalogVerificationGapEvent\(\{[\s\S]+trigger:\s*\"search_results\"/, "typed search verification gap logging");
requireRegex(searchScreenPath, searchScreen, /logCatalogVerificationGapEvent\(\{[\s\S]+source:\s*recognitionPath === \"on_device_ocr\" \? \"label_scan_on_device\" : \"label_scan\"[\s\S]+trigger:\s*result\.selectedProduct \? \"label_recommendation\" : \"label_results\"/, "label scan verification gap logging");
requireRegex(searchScreenPath, searchScreen, /logCatalogVerificationGapEvent\(\{[\s\S]+trigger:\s*autoOpen \? \"auto_open_blocked\" : \"product_tapped\"/, "blocked product tap verification gap logging");
requireSnippet(searchScreenPath, searchScreen, "catalog_label_auto_opened", "label auto-open telemetry");
requireRegex(searchScreenPath, searchScreen, /if \(result\.selectedProduct\) \{[\s\S]+openProductResultRef\.current\(result\.selectedProduct/, "label scan auto-opens recommended product");
requireSnippet(searchScreenPath, searchScreen, "uri: labelImageUri || product.imageUrl || null", "label scan image handoff");
requireRegex(searchScreenPath, searchScreen, /function productIsReady[\s\S]+productIsVerifiedReady\(product\)/, "search result readiness fails closed without ingredient provenance");
requireRegex(searchScreenPath, searchScreen, /function ingredientStatusLabel[\s\S]+catalogVerificationState\(product\)\.label/, "search result status labels missing provenance as unverified");
requireSnippet(searchScreenPath, searchScreen, "Not a complete pet food", "non-complete label results avoid ingredient capture");
requireSnippet(searchScreenPath, searchScreen, "onError={() => setImageFailed(true)}", "broken catalog images fall back cleanly");
forbidSnippet(searchScreenPath, searchScreen, "if (!status) return true;", "search result fail-open ingredient readiness");

const searchCachePath = "services/catalogSearchCache.js";
const searchCache = read(searchCachePath);
requireSnippet(searchCachePath, searchCache, "CACHE_TTL_MS", "catalog search cache TTL");
requireSnippet(searchCachePath, searchCache, "MAX_CACHE_ENTRIES", "catalog search cache cap");
requireSnippet(searchCachePath, searchCache, "@woof_catalog_search_cache_v6", "catalog search cache contract version");
requireSnippet(searchCachePath, searchCache, "ingredientVerificationStatus", "catalog cache preserves ingredient verification");
requireSnippet(searchCachePath, searchCache, "imageVerificationStatus", "catalog cache preserves image verification");
requireSnippet(searchCachePath, searchCache, "productLine", "catalog cache preserves product-line identity");
requireSnippet(searchCachePath, searchCache, "flavor", "catalog cache preserves flavor identity");
requireSnippet(searchCachePath, searchCache, "packageSize", "catalog cache preserves package-size identity");
requireSnippet(searchCachePath, searchCache, "function cachedProductIsVisible", "catalog cache validates current visible readiness");
requireSnippet(searchCachePath, searchCache, "productIsVerifiedReady(product, { queryText })", "catalog cache requires verified ingredients, image, and exact query terms");
requireSnippet(searchCachePath, searchCache, "MIN_CACHED_PRODUCT_RANK", "catalog cache preserves rank floor");
requireSnippet(searchCachePath, searchCache, "\"pumpkin\"", "catalog cache protects visible flavor terms");
requireSnippet(searchCachePath, searchCache, "\"rabbit\"", "catalog cache protects less common proteins");
requireSnippet(searchCachePath, searchCache, "export async function getCachedCatalogSearch", "catalog cache read export");
requireSnippet(searchCachePath, searchCache, "export async function saveCachedCatalogSearch", "catalog cache write export");

const analysisCachePath = "services/cache.js";
const analysisCache = read(analysisCachePath);
requireSnippet(analysisCachePath, analysisCache, "hasVerifiedIngredientData", "analysis cache validates verified ingredient provenance");
requireSnippet(analysisCachePath, analysisCache, "hasVerifiedProductImageData", "analysis cache validates verified image provenance");
requireSnippet(analysisCachePath, analysisCache, "Ignoring verified cache without ingredient and image provenance", "analysis cache rejects stale verified results");

const migrationPath = "supabase/migrations/074_catalog_coverage_product_events.sql";
const migration = read(migrationPath);
requireSnippet(migrationPath, migration, "'catalog_lookup_completed'", "catalog completed event allowlist");
requireSnippet(migrationPath, migration, "'catalog_lookup_miss'", "catalog miss event allowlist");
requireSnippet(migrationPath, migration, "'catalog_lookup_failed'", "catalog failed event allowlist");
requireSnippet(migrationPath, migration, "REVOKE ALL ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) FROM anon", "anonymous RPC revoke");
requireSnippet(migrationPath, migration, "GRANT EXECUTE ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) TO authenticated", "authenticated RPC grant");

const verificationGapEventMigrationPath = "supabase/migrations/081_catalog_verification_gap_event.sql";
const verificationGapEventMigration = read(verificationGapEventMigrationPath);
requireSnippet(verificationGapEventMigrationPath, verificationGapEventMigration, "'catalog_verification_gap'", "catalog verification gap event allowlist");
requireSnippet(verificationGapEventMigrationPath, verificationGapEventMigration, "SET search_path = public", "catalog verification gap RPC search path");
requireSnippet(verificationGapEventMigrationPath, verificationGapEventMigration, "REVOKE ALL ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) FROM anon", "catalog verification gap anonymous RPC revoke");

const acquisitionQueueMigrationPath = "supabase/migrations/082_catalog_acquisition_queue.sql";
const acquisitionQueueMigration = read(acquisitionQueueMigrationPath);
requireSnippet(acquisitionQueueMigrationPath, acquisitionQueueMigration, "CREATE TABLE IF NOT EXISTS public.catalog_acquisition_queue", "catalog acquisition queue table");
requireSnippet(acquisitionQueueMigrationPath, acquisitionQueueMigration, "refresh_catalog_acquisition_queue", "catalog acquisition queue refresh RPC");
requireSnippet(acquisitionQueueMigrationPath, acquisitionQueueMigration, "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_acquisition_queue TO service_role", "service-role-only acquisition table access");
requireSnippet(acquisitionQueueMigrationPath, acquisitionQueueMigration, "REVOKE ALL ON FUNCTION public.refresh_catalog_acquisition_queue(INTEGER, INTEGER) FROM authenticated", "authenticated acquisition RPC revoke");
requireSnippet(acquisitionQueueMigrationPath, acquisitionQueueMigration, "catalog_verification_gap", "acquisition queue uses verification-gap events");
requireSnippet(acquisitionQueueMigrationPath, acquisitionQueueMigration, "official", "acquisition queue tracks official ingredient gaps");

const acquisitionQueueDedupeMigrationPath = "supabase/migrations/083_dedupe_catalog_acquisition_refresh.sql";
const acquisitionQueueDedupeMigration = read(acquisitionQueueDedupeMigrationPath);
requireSnippet(acquisitionQueueDedupeMigrationPath, acquisitionQueueDedupeMigration, "deduped_queue_rows", "acquisition queue dedupes overlapping gap rows before upsert");
requireSnippet(acquisitionQueueDedupeMigrationPath, acquisitionQueueDedupeMigration, "SELECT DISTINCT ON (gap_key)", "acquisition queue duplicate gap-key guard");
requireSnippet(acquisitionQueueDedupeMigrationPath, acquisitionQueueDedupeMigration, "FROM deduped_queue_rows", "acquisition queue upserts deduped rows");

const acquisitionQueueReconcileMigrationPath = "supabase/migrations/084_reconcile_catalog_acquisition_queue.sql";
const acquisitionQueueReconcileMigration = read(acquisitionQueueReconcileMigrationPath);
requireSnippet(acquisitionQueueReconcileMigrationPath, acquisitionQueueReconcileMigration, "reconcile_catalog_acquisition_queue", "acquisition queue reconcile RPC");
requireSnippet(acquisitionQueueReconcileMigrationPath, acquisitionQueueReconcileMigration, "resolved_at", "acquisition queue resolved timestamp");
requireSnippet(acquisitionQueueReconcileMigrationPath, acquisitionQueueReconcileMigration, "status = 'resolved'", "acquisition queue closes resolved rows");
requireSnippet(acquisitionQueueReconcileMigrationPath, acquisitionQueueReconcileMigration, "public.search_products(q.normalized_query, 5)", "lookup queue reconciliation uses live search");
requireSnippet(acquisitionQueueReconcileMigrationPath, acquisitionQueueReconcileMigration, "REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM authenticated", "authenticated reconcile RPC revoke");

const duplicateLegacyCatalogRowsMigrationPath = "supabase/migrations/219_exclude_verified_duplicate_legacy_catalog_rows.sql";
const duplicateLegacyCatalogRowsMigration = read(duplicateLegacyCatalogRowsMigrationPath);
requireSnippet(duplicateLegacyCatalogRowsMigrationPath, duplicateLegacyCatalogRowsMigration, "exclude_verified_duplicate_legacy_catalog_rows_for_brand", "duplicate legacy catalog closer RPC");
requireSnippet(duplicateLegacyCatalogRowsMigrationPath, duplicateLegacyCatalogRowsMigration, "catalog_acquisition_strict_search_high_confidence", "duplicate legacy closer uses strict identity guard");
requireSnippet(duplicateLegacyCatalogRowsMigrationPath, duplicateLegacyCatalogRowsMigration, "matched.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')", "duplicate legacy closer requires source-backed verified match");
requireSnippet(duplicateLegacyCatalogRowsMigrationPath, duplicateLegacyCatalogRowsMigration, "catalog_exclusion_reason", "duplicate legacy closer excludes no-source product row");
requireSnippet(duplicateLegacyCatalogRowsMigrationPath, duplicateLegacyCatalogRowsMigration, "last_reconcile_checked_result', 'no_verified_duplicate_match'", "duplicate legacy closer marks checked unresolved rows");
requireSnippet(duplicateLegacyCatalogRowsMigrationPath, duplicateLegacyCatalogRowsMigration, "REVOKE ALL ON FUNCTION public.exclude_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated", "duplicate legacy closer authenticated revoke");

const directVerifiedIdentityDuplicateMigrationPath = "supabase/migrations/230_fast_verified_identity_duplicate_reconcile.sql";
const directVerifiedIdentityDuplicateMigration = read(directVerifiedIdentityDuplicateMigrationPath);
requireSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand", "direct verified identity duplicate closer RPC");
requireSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "catalog_quality_state", "direct verified identity duplicate closer requires verified-ready catalog rows");
requireSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "direct verified identity duplicate closer must not call search_verified_products", "direct verified identity duplicate closer avoids search RPC");
forbidSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "JOIN LATERAL public.search_verified_products", "direct verified identity duplicate closer must not use search RPC lateral scans");
requireSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "catalog_acquisition_life_stage_terms_match", "direct verified identity duplicate closer keeps life-stage guard");
requireSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "catalog_acquisition_protected_line_terms_match", "direct verified identity duplicate closer keeps protected line guard");
requireSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "catalog_acquisition_package_count_match", "direct verified identity duplicate closer keeps package-count guard");
requireSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "ambiguous_direct_verified_identity_match", "direct verified identity duplicate closer marks ambiguous rows");
requireSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "Small Bite direct identity fixture must not match Small Breed official row", "direct verified identity duplicate closer protects Small Bite vs Small Breed");
requireSnippet(directVerifiedIdentityDuplicateMigrationPath, directVerifiedIdentityDuplicateMigration, "GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role", "direct verified identity duplicate closer service-role grant");

const optimizedDirectVerifiedIdentityDuplicateMigrationPath = "supabase/migrations/231_optimize_direct_verified_identity_duplicate_reconcile.sql";
const optimizedDirectVerifiedIdentityDuplicateMigration = read(optimizedDirectVerifiedIdentityDuplicateMigrationPath);
requireSnippet(optimizedDirectVerifiedIdentityDuplicateMigrationPath, optimizedDirectVerifiedIdentityDuplicateMigration, "prefilter_candidates", "optimized direct identity duplicate closer prefilters candidates");
requireSnippet(optimizedDirectVerifiedIdentityDuplicateMigrationPath, optimizedDirectVerifiedIdentityDuplicateMigration, "prefilter_rank <= 24", "optimized direct identity duplicate closer bounds strict guard window");
requireSnippet(optimizedDirectVerifiedIdentityDuplicateMigrationPath, optimizedDirectVerifiedIdentityDuplicateMigration, "prefiltered_direct_identity_v2", "optimized direct identity duplicate closer reports optimizer version");
requireSnippet(optimizedDirectVerifiedIdentityDuplicateMigrationPath, optimizedDirectVerifiedIdentityDuplicateMigration, "must stay bounded and skip global stale-gap closure", "optimized direct identity duplicate closer skips global stale close");
forbidSnippet(optimizedDirectVerifiedIdentityDuplicateMigrationPath, optimizedDirectVerifiedIdentityDuplicateMigration, "PERFORM public.close_stale_catalog_acquisition_queue_gaps", "optimized direct identity duplicate closer must not run global stale close");
forbidSnippet(optimizedDirectVerifiedIdentityDuplicateMigrationPath, optimizedDirectVerifiedIdentityDuplicateMigration, "JOIN LATERAL public.search_verified_products", "optimized direct identity duplicate closer must not use search RPC lateral scans");
requireSnippet(optimizedDirectVerifiedIdentityDuplicateMigrationPath, optimizedDirectVerifiedIdentityDuplicateMigration, "Small Bite direct identity fixture must not match Small Breed official row", "optimized direct identity duplicate closer protects Small Bite vs Small Breed");
requireSnippet(optimizedDirectVerifiedIdentityDuplicateMigrationPath, optimizedDirectVerifiedIdentityDuplicateMigration, "GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role", "optimized direct identity duplicate closer service-role grant");

const directDuplicateExactIdentityPriorityMigrationPath = "supabase/migrations/238_direct_duplicate_exact_identity_priority.sql";
const directDuplicateExactIdentityPriorityMigration = read(directDuplicateExactIdentityPriorityMigrationPath);
requireSnippet(directDuplicateExactIdentityPriorityMigrationPath, directDuplicateExactIdentityPriorityMigration, "direct duplicate exact identity priority", "direct duplicate closer exact identity priority marker");
requireSnippet(directDuplicateExactIdentityPriorityMigrationPath, directDuplicateExactIdentityPriorityMigration, "THEN 10.0", "direct duplicate closer gives direct identity matches a large rank bonus");
requireSnippet(directDuplicateExactIdentityPriorityMigrationPath, directDuplicateExactIdentityPriorityMigration, "catalog_acquisition_identity_match", "direct duplicate closer ranks identity matches above strict-search-only siblings");
requireSnippet(directDuplicateExactIdentityPriorityMigrationPath, directDuplicateExactIdentityPriorityMigration, "catalog_acquisition_strict_search_high_confidence", "direct duplicate closer still allows strict-search-only matches below direct identity matches");
requireSnippet(directDuplicateExactIdentityPriorityMigrationPath, directDuplicateExactIdentityPriorityMigration, "GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role", "direct duplicate exact identity priority service-role grant");

const directDuplicateSourceUrlProvenancePath = "supabase/migrations/239_direct_duplicate_source_url_provenance_only.sql";
const directDuplicateSourceUrlProvenance = read(directDuplicateSourceUrlProvenancePath);
requireSnippet(directDuplicateSourceUrlProvenancePath, directDuplicateSourceUrlProvenance, "source URL omitted from normalized catalog duplicate identity", "direct duplicate closer keeps source URL out of normalized formula identity");
requireSnippet(directDuplicateSourceUrlProvenancePath, directDuplicateSourceUrlProvenance, "source URL omitted from raw catalog duplicate identity", "direct duplicate closer keeps source URL out of raw formula identity");
requireSnippet(directDuplicateSourceUrlProvenancePath, directDuplicateSourceUrlProvenance, "Open Farm Chicken & Salmon Freeze-Dried Raw Morsels Cat Food", "direct duplicate source-url guard covers Open Farm official slug noise");
requireSnippet(directDuplicateSourceUrlProvenancePath, directDuplicateSourceUrlProvenance, "must not reconcile to patties", "direct duplicate source-url guard preserves morsels vs patties variant safety");
requireSnippet(directDuplicateSourceUrlProvenancePath, directDuplicateSourceUrlProvenance, "GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role", "direct duplicate source-url provenance service-role grant");

const directDuplicateFoodFormSourceUrlPath = "supabase/migrations/243_direct_duplicate_food_form_source_url_identity.sql";
const directDuplicateFoodFormSourceUrl = read(directDuplicateFoodFormSourceUrlPath);
requireSnippet(directDuplicateFoodFormSourceUrlPath, directDuplicateFoodFormSourceUrl, "catalog_food_form_identity", "direct duplicate closer has source-url-backed food-form identity");
requireSnippet(directDuplicateFoodFormSourceUrlPath, directDuplicateFoodFormSourceUrl, "matched_food_form_identity", "direct duplicate closer passes source-url-backed food-form identity");
requireSnippet(directDuplicateFoodFormSourceUrlPath, directDuplicateFoodFormSourceUrl, "catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)", "direct duplicate closer uses source-url-backed food-form guard");
requireSnippet(directDuplicateFoodFormSourceUrlPath, directDuplicateFoodFormSourceUrl, "formula identity must still omit source URL", "direct duplicate formula identity still omits source URL");
requireSnippet(directDuplicateFoodFormSourceUrlPath, directDuplicateFoodFormSourceUrl, "Wellness Complete Health Puppy Dry Dog Food", "direct duplicate food-form source URL fixture");
requireSnippet(directDuplicateFoodFormSourceUrlPath, directDuplicateFoodFormSourceUrl, "wellness-complete-health-pate-puppy-chicken-salmon", "direct duplicate food-form fixture catches pate URL");
requireSnippet(directDuplicateFoodFormSourceUrlPath, directDuplicateFoodFormSourceUrl, "reopened_food_form_variant_mismatch", "direct duplicate food-form source URL guard reopens bad closures");
requireSnippet(directDuplicateFoodFormSourceUrlPath, directDuplicateFoodFormSourceUrl, "direct duplicate food-form mismatches remain", "direct duplicate food-form source URL guard verifies no remaining mismatches");
requireSnippet(directDuplicateFoodFormSourceUrlPath, directDuplicateFoodFormSourceUrl, "GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role", "direct duplicate food-form source URL service-role grant");

const searchDuplicateClosureGuardPath = "supabase/migrations/244_harden_search_duplicate_closures.sql";
const searchDuplicateClosureGuard = read(searchDuplicateClosureGuardPath);
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "catalog_acquisition_life_stage_terms_match(qs.product_name", "legacy search duplicate closer requires life-stage guard");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "catalog_acquisition_protected_line_terms_match(qs.product_name", "legacy search duplicate closer requires protected-line guard");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "catalog_acquisition_food_form_terms_match(qs.product_name", "legacy search duplicate closer requires food-form guard");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "catalog_acquisition_package_count_match(qs.product_name", "legacy search duplicate closer requires package-count guard");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "catalog_acquisition_food_form_terms_match(rm.legacy_product_name", "unknown-species duplicate closer requires food-form guard");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "catalog_acquisition_package_count_match(rm.legacy_product_name", "unknown-species duplicate closer requires package-count guard");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "reopened_variant_guard_mismatch", "search duplicate closure guard reopens bad closures");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "search duplicate closure guard mismatches remain", "search duplicate closure guard verifies no remaining mismatches");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "Blue Buffalo True Solutions Digestive Care Natural Dry Dog Food", "search duplicate closure guard covers dry-to-wet source URL fixture");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "Purina Fancy Feast Gravy Lovers Chicken Feast Pate", "search duplicate closure guard covers pack-count fixture");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "GRANT EXECUTE ON FUNCTION public.exclude_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role", "legacy search duplicate closer service-role grant after hardening");
requireSnippet(searchDuplicateClosureGuardPath, searchDuplicateClosureGuard, "GRANT EXECUTE ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) TO service_role", "unknown-species duplicate closer service-role grant after hardening");

const directVariantSourceUrlGuardPath = "supabase/migrations/245_direct_duplicate_variant_source_url_guards.sql";
const directVariantSourceUrlGuard = read(directVariantSourceUrlGuardPath);
requireSnippet(directVariantSourceUrlGuardPath, directVariantSourceUrlGuard, "catalog_acquisition_life_stage_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)", "direct duplicate closer uses source-url-backed life-stage guard");
requireSnippet(directVariantSourceUrlGuardPath, directVariantSourceUrlGuard, "catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)", "direct duplicate closer uses source-url-backed protected-line guard");
requireSnippet(directVariantSourceUrlGuardPath, directVariantSourceUrlGuard, "catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)", "direct duplicate closer uses source-url-backed size guard");
requireSnippet(directVariantSourceUrlGuardPath, directVariantSourceUrlGuard, "catalog_acquisition_package_count_match(bc.legacy_product_name, bc.matched_food_form_identity)", "direct duplicate closer uses source-url-backed package-count guard");
requireSnippet(directVariantSourceUrlGuardPath, directVariantSourceUrlGuard, "reopened_variant_source_url_mismatch", "direct duplicate source-url variant guard reopens bad closures");
requireSnippet(directVariantSourceUrlGuardPath, directVariantSourceUrlGuard, "Nulo MedalSeries Baked & Coated Large Breed Whitefish", "direct duplicate source-url variant guard covers Nulo puppy URL fixture");
requireSnippet(directVariantSourceUrlGuardPath, directVariantSourceUrlGuard, "direct duplicate source-url-backed variant guard mismatches remain", "direct duplicate source-url variant guard verifies no remaining mismatches");
requireSnippet(directVariantSourceUrlGuardPath, directVariantSourceUrlGuard, "GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role", "direct duplicate source-url variant guard service-role grant");

const specialFoodFormDuplicateGuardPath = "supabase/migrations/269_require_special_food_form_duplicate_match.sql";
const specialFoodFormDuplicateGuard = read(specialFoodFormDuplicateGuardPath);
requireSnippet(specialFoodFormDuplicateGuardPath, specialFoodFormDuplicateGuard, "q_special_forms", "special food-form duplicate guard separates special forms from dry/wet base forms");
requireSnippet(specialFoodFormDuplicateGuardPath, specialFoodFormDuplicateGuard, "reopened_special_food_form_mismatch", "special food-form duplicate guard reopens mismatches");
requireSnippet(specialFoodFormDuplicateGuardPath, specialFoodFormDuplicateGuard, "Nature''s Recipe Freeze Dried Blend Chicken, Barley & Brown Rice Dry Dog Food", "special food-form duplicate guard covers freeze-dried blend fixture");
requireSnippet(specialFoodFormDuplicateGuardPath, specialFoodFormDuplicateGuard, "direct duplicate special food-form guard failures remain", "special food-form duplicate guard verifies no remaining mismatches");
requireSnippet(specialFoodFormDuplicateGuardPath, specialFoodFormDuplicateGuard, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) TO service_role", "special food-form duplicate guard service-role grant");

const specialFoodFormSourceIdentityPath = "supabase/migrations/270_allow_special_food_form_source_identity_duplicates.sql";
const specialFoodFormSourceIdentity = read(specialFoodFormSourceIdentityPath);
requireSnippet(specialFoodFormSourceIdentityPath, specialFoodFormSourceIdentity, "catalog_acquisition_special_food_form_source_identity_match", "special food-form source identity helper");
requireSnippet(specialFoodFormSourceIdentityPath, specialFoodFormSourceIdentity, "source-backed special food-form duplicate match", "direct duplicate closer allows guarded source-backed special food-form identity");
requireSnippet(specialFoodFormSourceIdentityPath, specialFoodFormSourceIdentity, "Nature''s Recipe Freeze Dried Blend Chicken, Barley & Brown Rice Dry Dog Food", "special food-form source identity fixture covers official URL flavor tokens");
requireSnippet(specialFoodFormSourceIdentityPath, specialFoodFormSourceIdentity, "must reject normal dry title matched to freeze-dried source URL", "special food-form source identity rejects generic dry-to-special matches");
requireSnippet(specialFoodFormSourceIdentityPath, specialFoodFormSourceIdentity, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_special_food_form_source_identity_match(TEXT, TEXT, TEXT, TEXT) TO service_role", "special food-form source identity service-role grant");

const directIdentitySizeVariantGuardMigrationPath = "supabase/migrations/232_direct_identity_size_variant_guard.sql";
const directIdentitySizeVariantGuardMigration = read(directIdentitySizeVariantGuardMigrationPath);
requireSnippet(directIdentitySizeVariantGuardMigrationPath, directIdentitySizeVariantGuardMigration, "catalog_acquisition_size_terms_match", "direct identity duplicate closer size guard helper");
requireSnippet(directIdentitySizeVariantGuardMigrationPath, directIdentitySizeVariantGuardMigration, "Small & Mini", "direct identity size guard covers Small & Mini variants");
requireSnippet(directIdentitySizeVariantGuardMigrationPath, directIdentitySizeVariantGuardMigration, "reopened_size_variant_mismatch", "direct identity size guard reopens bad closures");
requireSnippet(directIdentitySizeVariantGuardMigrationPath, directIdentitySizeVariantGuardMigration, "Small Bites as Small Breed", "direct identity size guard rejects Small Bites vs Small Breed");
requireSnippet(directIdentitySizeVariantGuardMigrationPath, directIdentitySizeVariantGuardMigration, "catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_identity)", "direct identity duplicate closer calls size guard");
requireSnippet(directIdentitySizeVariantGuardMigrationPath, directIdentitySizeVariantGuardMigration, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_size_terms_match(TEXT, TEXT) TO service_role", "direct identity size guard service-role grant");

const productEvidenceGapSummaryMigrationPath = "supabase/migrations/220_catalog_product_evidence_gap_summary.sql";
const productEvidenceGapSummaryMigration = read(productEvidenceGapSummaryMigrationPath);
requireSnippet(productEvidenceGapSummaryMigrationPath, productEvidenceGapSummaryMigration, "catalog_product_evidence_gap_summary", "catalog evidence-gap summary RPC");
requireSnippet(productEvidenceGapSummaryMigrationPath, productEvidenceGapSummaryMigration, "catalog_quality_state", "catalog evidence-gap summary uses quality-state contract");
requireSnippet(productEvidenceGapSummaryMigrationPath, productEvidenceGapSummaryMigration, "legacy_no_source_do_not_promote", "catalog evidence-gap summary reports legacy no-source action");
requireSnippet(productEvidenceGapSummaryMigrationPath, productEvidenceGapSummaryMigration, "duplicate_verified_official_catalog_row", "catalog evidence-gap summary reports duplicate exclusions");
requireSnippet(productEvidenceGapSummaryMigrationPath, productEvidenceGapSummaryMigration, "GRANT EXECUTE ON FUNCTION public.catalog_product_evidence_gap_summary(INTEGER) TO service_role", "catalog evidence-gap summary service-role grant");

const healthExtensionBrothSampleMigrationPath = "supabase/migrations/221_exclude_health_extension_broth_sample_rows.sql";
const healthExtensionBrothSampleMigration = read(healthExtensionBrothSampleMigrationPath);
requireSnippet(healthExtensionBrothSampleMigrationPath, healthExtensionBrothSampleMigration, "source = 'health-extension'", "Health Extension cleanup stays source-scoped");
requireSnippet(healthExtensionBrothSampleMigrationPath, healthExtensionBrothSampleMigration, "broth-licious", "Health Extension cleanup excludes broth rows");
requireSnippet(healthExtensionBrothSampleMigrationPath, healthExtensionBrothSampleMigration, "air-dried-complete-samples", "Health Extension cleanup excludes sample rows");
requireSnippet(healthExtensionBrothSampleMigrationPath, healthExtensionBrothSampleMigration, "catalog_quality_state", "Health Extension cleanup asserts non-ready rows");

const healthExtensionStale404MigrationPath = "supabase/migrations/222_exclude_stale_health_extension_404_rows.sql";
const healthExtensionStale404Migration = read(healthExtensionStale404MigrationPath);
requireSnippet(healthExtensionStale404MigrationPath, healthExtensionStale404Migration, "source = 'health-extension'", "Health Extension stale cleanup stays source-scoped");
requireSnippet(healthExtensionStale404MigrationPath, healthExtensionStale404Migration, "cat-grain-free-chicken-duck-recipe", "Health Extension stale cleanup excludes 404 chicken duck row");
requireSnippet(healthExtensionStale404MigrationPath, healthExtensionStale404Migration, "cat-grain-free-chicken-pate-recipe", "Health Extension stale cleanup excludes 404 chicken pate row");
requireSnippet(healthExtensionStale404MigrationPath, healthExtensionStale404Migration, "stale_official_source_404", "Health Extension stale cleanup records stale source reason");
requireSnippet(healthExtensionStale404MigrationPath, healthExtensionStale404Migration, "catalog_quality_state", "Health Extension stale cleanup asserts non-ready rows");

const unknownSpeciesLegacyDuplicateMigrationPath = "supabase/migrations/223_exclude_unknown_species_legacy_duplicate_rows.sql";
const unknownSpeciesLegacyDuplicateMigration = read(unknownSpeciesLegacyDuplicateMigrationPath);
requireSnippet(unknownSpeciesLegacyDuplicateMigrationPath, unknownSpeciesLegacyDuplicateMigration, "exclude_unknown_species_legacy_duplicate_rows_for_brand", "unknown-species legacy duplicate closer RPC");
requireSnippet(unknownSpeciesLegacyDuplicateMigrationPath, unknownSpeciesLegacyDuplicateMigration, "COALESCE(q.pet_type, 'unknown') NOT IN ('dog', 'cat')", "unknown-species duplicate closer only processes unknown species rows");
requireSnippet(unknownSpeciesLegacyDuplicateMigrationPath, unknownSpeciesLegacyDuplicateMigration, "count(DISTINCT matched_pet_type)", "unknown-species duplicate closer requires single-species search results");
requireSnippet(unknownSpeciesLegacyDuplicateMigrationPath, unknownSpeciesLegacyDuplicateMigration, "catalog_acquisition_strict_search_high_confidence", "unknown-species duplicate closer preserves strict identity guard");
requireSnippet(unknownSpeciesLegacyDuplicateMigrationPath, unknownSpeciesLegacyDuplicateMigration, "matched.rank >= 8.0", "unknown-species duplicate closer requires high search rank");
requireSnippet(unknownSpeciesLegacyDuplicateMigrationPath, unknownSpeciesLegacyDuplicateMigration, "matched.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')", "unknown-species duplicate closer requires source-backed verified matches");
requireSnippet(unknownSpeciesLegacyDuplicateMigrationPath, unknownSpeciesLegacyDuplicateMigration, "REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM authenticated", "unknown-species duplicate closer authenticated revoke");

const unknownSpeciesLifeStageGuardMigrationPath = "supabase/migrations/224_unknown_species_duplicate_life_stage_guard.sql";
const unknownSpeciesLifeStageGuardMigration = read(unknownSpeciesLifeStageGuardMigrationPath);
requireSnippet(unknownSpeciesLifeStageGuardMigrationPath, unknownSpeciesLifeStageGuardMigration, "catalog_acquisition_life_stage_terms_match", "unknown-species duplicate closer life-stage guard helper");
requireSnippet(unknownSpeciesLifeStageGuardMigrationPath, unknownSpeciesLifeStageGuardMigration, "MEDIUM ADULT 7+ adult 7+ dry", "unknown-species duplicate closer rejects adult vs adult 7+ fixture");
requireSnippet(unknownSpeciesLifeStageGuardMigrationPath, unknownSpeciesLifeStageGuardMigration, "wrong_life_stage_duplicate_match", "unknown-species duplicate closer reopens wrong life-stage closure");
requireSnippet(unknownSpeciesLifeStageGuardMigrationPath, unknownSpeciesLifeStageGuardMigration, "catalog_acquisition_life_stage_terms_match(", "unknown-species duplicate closer calls life-stage guard");
requireSnippet(unknownSpeciesLifeStageGuardMigrationPath, unknownSpeciesLifeStageGuardMigration, "REVOKE ALL ON FUNCTION public.catalog_acquisition_life_stage_terms_match(TEXT, TEXT) FROM authenticated", "life-stage guard authenticated revoke");

const royalCaninMediumAdultFixMigrationPath = "supabase/migrations/225_fix_royal_canin_medium_adult_duplicate.sql";
const royalCaninMediumAdultFixMigration = read(royalCaninMediumAdultFixMigrationPath);
requireSnippet(royalCaninMediumAdultFixMigrationPath, royalCaninMediumAdultFixMigration, "medium-adult-3004", "Royal Canin Medium Adult duplicate resolves to exact adult source");
requireSnippet(royalCaninMediumAdultFixMigrationPath, royalCaninMediumAdultFixMigration, "matched_after_life_stage_guard", "Royal Canin Medium Adult correction records life-stage guard repair");
forbidSnippet(royalCaninMediumAdultFixMigrationPath, royalCaninMediumAdultFixMigration, "medium-adult-7+-3005", "Royal Canin Medium Adult correction must not resolve to adult 7+ source");

const unknownSpeciesLineTermGuardMigrationPath = "supabase/migrations/226_unknown_species_duplicate_line_term_guard.sql";
const unknownSpeciesLineTermGuardMigration = read(unknownSpeciesLineTermGuardMigrationPath);
requireSnippet(unknownSpeciesLineTermGuardMigrationPath, unknownSpeciesLineTermGuardMigration, "catalog_acquisition_protected_line_terms_match", "unknown-species duplicate closer protected line-term guard helper");
requireSnippet(unknownSpeciesLineTermGuardMigrationPath, unknownSpeciesLineTermGuardMigration, "FreeStyle High-Protein Kibble Turkey & Sweet Potato Recipe", "protected line-term guard rejects high-protein sibling fixture");
requireSnippet(unknownSpeciesLineTermGuardMigrationPath, unknownSpeciesLineTermGuardMigration, "corrected_after_protected_line_guard", "Nulo correction records protected line-term repair");
requireSnippet(unknownSpeciesLineTermGuardMigrationPath, unknownSpeciesLineTermGuardMigration, "pate-turkey-sweet-potato-recipe-for-dogs", "Nulo correction resolves to non-high-protein official source");
requireSnippet(unknownSpeciesLineTermGuardMigrationPath, unknownSpeciesLineTermGuardMigration, "REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM authenticated", "protected line-term guard authenticated revoke");

const blueWildernessHighProteinLineEquivalencePath = "supabase/migrations/240_blue_wilderness_high_protein_line_equivalence.sql";
const blueWildernessHighProteinLineEquivalence = read(blueWildernessHighProteinLineEquivalencePath);
requireSnippet(blueWildernessHighProteinLineEquivalencePath, blueWildernessHighProteinLineEquivalence, "Blue Wilderness high-protein line equivalence", "Blue Wilderness high-protein official-title equivalence marker");
requireSnippet(blueWildernessHighProteinLineEquivalencePath, blueWildernessHighProteinLineEquivalence, "q_blue_wilderness", "Blue Wilderness high-protein equivalence requires query Wilderness line");
requireSnippet(blueWildernessHighProteinLineEquivalencePath, blueWildernessHighProteinLineEquivalence, "c_blue_wilderness", "Blue Wilderness high-protein equivalence requires candidate Wilderness line");
requireSnippet(blueWildernessHighProteinLineEquivalencePath, blueWildernessHighProteinLineEquivalence, "BLUE Wilderness Nature''s Evolutionary Diet", "Blue Wilderness high-protein equivalence positive fixture");
requireSnippet(blueWildernessHighProteinLineEquivalencePath, blueWildernessHighProteinLineEquivalence, "Blue non-Wilderness high-protein title must not match", "Blue Wilderness high-protein equivalence rejects non-Wilderness Blue lines");
requireSnippet(blueWildernessHighProteinLineEquivalencePath, blueWildernessHighProteinLineEquivalence, "Nulo missing high-protein term must remain protected", "Blue Wilderness high-protein equivalence preserves Nulo high-protein guard");
requireSnippet(blueWildernessHighProteinLineEquivalencePath, blueWildernessHighProteinLineEquivalence, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) TO service_role", "Blue Wilderness high-protein equivalence service-role grant");

const dfaPetTypeInferencePath = "supabase/migrations/242_infer_dfa_pet_type.sql";
const dfaPetTypeInference = read(dfaPetTypeInferencePath);
requireSnippet(dfaPetTypeInferencePath, dfaPetTypeInference, "catalog_source_pet_type_inference", "source-derived catalog pet-type helper");
requireSnippet(dfaPetTypeInferencePath, dfaPetTypeInference, "WHEN source_key = 'dfa' THEN 'dog'", "Dog Food Advisor source infers dog");
requireSnippet(dfaPetTypeInferencePath, dfaPetTypeInference, "catalog_source_pet_type_inference(", "acquisition refresh uses source-derived pet-type inference");
requireSnippet(dfaPetTypeInferencePath, dfaPetTypeInference, "product_source,", "acquisition refresh passes source to pet-type inference");
requireSnippet(dfaPetTypeInferencePath, dfaPetTypeInference, "pet_type_inferred_from_source", "dfa queue backfill records source-derived inference");
requireSnippet(dfaPetTypeInferencePath, dfaPetTypeInference, "explicit pet_type must override source-derived inference", "dfa pet-type helper preserves explicit species");
requireSnippet(dfaPetTypeInferencePath, dfaPetTypeInference, "open dfa queue rows still have non-dog pet type", "dfa queue backfill verifies open queue species");
requireSnippet(dfaPetTypeInferencePath, dfaPetTypeInference, "GRANT EXECUTE ON FUNCTION public.catalog_source_pet_type_inference(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role", "dfa pet-type helper service-role grant");

const batchedAcquisitionReconcileMigrationPath = "supabase/migrations/103_batched_catalog_acquisition_reconcile.sql";
const batchedAcquisitionReconcileMigration = read(batchedAcquisitionReconcileMigrationPath);
requireSnippet(batchedAcquisitionReconcileMigrationPath, batchedAcquisitionReconcileMigration, "reconcile_catalog_acquisition_queue_batch", "batched acquisition queue reconcile RPC");
requireSnippet(batchedAcquisitionReconcileMigrationPath, batchedAcquisitionReconcileMigration, "idx_catalog_acquisition_queue_product_open_priority", "batched acquisition product priority index");
requireSnippet(batchedAcquisitionReconcileMigrationPath, batchedAcquisitionReconcileMigration, "LIMIT v_limit", "batched acquisition queue bounded product scope");
requireSnippet(batchedAcquisitionReconcileMigrationPath, batchedAcquisitionReconcileMigration, "compatibility_wrapper", "legacy no-arg reconcile stays bounded");
requireSnippet(batchedAcquisitionReconcileMigrationPath, batchedAcquisitionReconcileMigration, "REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM authenticated", "authenticated batched reconcile RPC revoke");

const sweepAcquisitionReconcileMigrationPath = "supabase/migrations/104_sweep_catalog_acquisition_reconcile_batches.sql";
const sweepAcquisitionReconcileMigration = read(sweepAcquisitionReconcileMigrationPath);
requireSnippet(sweepAcquisitionReconcileMigrationPath, sweepAcquisitionReconcileMigration, "catalog_acquisition_reconcile_checked_at", "batched acquisition queue checked-at helper");
requireSnippet(sweepAcquisitionReconcileMigrationPath, sweepAcquisitionReconcileMigration, "last_reconcile_checked_at", "batched acquisition queue marks checked rows");
requireSnippet(sweepAcquisitionReconcileMigrationPath, sweepAcquisitionReconcileMigration, "catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC", "batched acquisition queue sweeps old unchecked rows first");
requireSnippet(sweepAcquisitionReconcileMigrationPath, sweepAcquisitionReconcileMigration, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_reconcile_checked_at(JSONB) TO service_role", "checked-at helper service-role grant");

const prefilterAcquisitionReconcileMigrationPath = "supabase/migrations/105_prefilter_catalog_acquisition_identity_reconcile.sql";
const prefilterAcquisitionReconcileMigration = read(prefilterAcquisitionReconcileMigrationPath);
requireSnippet(prefilterAcquisitionReconcileMigrationPath, prefilterAcquisitionReconcileMigration, "catalog acquisition identity prefilter", "batched acquisition queue identity prefilter");
requireSnippet(prefilterAcquisitionReconcileMigrationPath, prefilterAcquisitionReconcileMigration, "word_similarity(public.catalog_acquisition_identity_normalize(q.product_name), vp.identity_norm) > 0.48", "identity prefilter word similarity threshold");
requireSnippet(prefilterAcquisitionReconcileMigrationPath, prefilterAcquisitionReconcileMigration, "similarity(public.catalog_acquisition_identity_normalize(q.product_name), vp.identity_norm) > 0.30", "identity prefilter trigram threshold");

const saferAcquisitionBatchDefaultMigrationPath = "supabase/migrations/106_safer_catalog_acquisition_reconcile_batch_default.sql";
const saferAcquisitionBatchDefaultMigration = read(saferAcquisitionBatchDefaultMigrationPath);
requireSnippet(saferAcquisitionBatchDefaultMigrationPath, saferAcquisitionBatchDefaultMigration, "p_max_rows INTEGER DEFAULT 100", "batched acquisition reconcile safer default size");
requireSnippet(saferAcquisitionBatchDefaultMigrationPath, saferAcquisitionBatchDefaultMigration, "reconcile_catalog_acquisition_queue_batch(100)", "legacy reconcile wrapper uses safer batch size");
requireSnippet(saferAcquisitionBatchDefaultMigrationPath, saferAcquisitionBatchDefaultMigration, "timeout observed on dense brand slices", "safer batch default rationale");

const strictSearchAcquisitionReconcileMigrationPath = "supabase/migrations/160_acquisition_reconcile_strict_verified_search.sql";
const strictSearchAcquisitionReconcileMigration = read(strictSearchAcquisitionReconcileMigrationPath);
requireSnippet(strictSearchAcquisitionReconcileMigrationPath, strictSearchAcquisitionReconcileMigration, "reconcile_catalog_acquisition_queue_strict_search", "strict verified-search acquisition reconcile helper");
requireSnippet(strictSearchAcquisitionReconcileMigrationPath, strictSearchAcquisitionReconcileMigration, "public.search_verified_products(qs.search_query, 8)", "strict acquisition reconcile uses app verified search RPC");
requireSnippet(strictSearchAcquisitionReconcileMigrationPath, strictSearchAcquisitionReconcileMigration, "strict verified catalog search matched queued product identity", "strict acquisition reconcile resolution reason");
requireSnippet(strictSearchAcquisitionReconcileMigrationPath, strictSearchAcquisitionReconcileMigration, "image_verification_status IN (''official'', ''manufacturer'', ''retailer_verified'')", "acquisition reconcile image statuses match visible search");
requireSnippet(strictSearchAcquisitionReconcileMigrationPath, strictSearchAcquisitionReconcileMigration, "resolved_product_strict_search_rows", "strict acquisition reconcile returns resolved count");
requireSnippet(strictSearchAcquisitionReconcileMigrationPath, strictSearchAcquisitionReconcileMigration, "REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) FROM authenticated", "strict acquisition reconcile authenticated revoke");
requireSnippet(strictSearchAcquisitionReconcileMigrationPath, strictSearchAcquisitionReconcileMigration, "GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) TO service_role", "strict acquisition reconcile service-role grant");
requireSnippet(strictSearchAcquisitionReconcileMigrationPath, strictSearchAcquisitionReconcileMigration, "stale image verification status set remains in batch reconciler", "strict acquisition reconcile rejects stale image status set");

const highConfidenceStrictSearchReconcilePath = "supabase/migrations/171_reconcile_high_confidence_verified_search_matches.sql";
const highConfidenceStrictSearchReconcile = read(highConfidenceStrictSearchReconcilePath);
requireSnippet(highConfidenceStrictSearchReconcilePath, highConfidenceStrictSearchReconcile, "catalog_acquisition_strict_search_high_confidence", "acquisition queue high-confidence strict-search helper");
requireSnippet(highConfidenceStrictSearchReconcilePath, highConfidenceStrictSearchReconcile, "match_strategy", "acquisition queue strict-search stores reconciliation strategy");
requireSnippet(highConfidenceStrictSearchReconcilePath, highConfidenceStrictSearchReconcile, "Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice", "acquisition queue high-confidence fixture covers legacy repeated-brand title");
requireSnippet(highConfidenceStrictSearchReconcilePath, highConfidenceStrictSearchReconcile, "Toy Breed Adult Dry Dog Food", "acquisition queue high-confidence fixture rejects sibling size formula");
requireSnippet(highConfidenceStrictSearchReconcilePath, highConfidenceStrictSearchReconcile, "wrong protected protein should not resolve", "acquisition queue high-confidence fixture rejects wrong protein");

const brandScopedStrictSearchReconcilePath = "supabase/migrations/172_brand_scoped_acquisition_strict_search_reconcile.sql";
const brandScopedStrictSearchReconcile = read(brandScopedStrictSearchReconcilePath);
requireSnippet(brandScopedStrictSearchReconcilePath, brandScopedStrictSearchReconcile, "idx_catalog_acquisition_queue_brand_product_open", "brand-scoped acquisition reconcile index");
requireSnippet(brandScopedStrictSearchReconcilePath, brandScopedStrictSearchReconcile, "reconcile_catalog_acquisition_queue_strict_search_for_brand", "brand-scoped acquisition strict-search reconciler");
requireSnippet(brandScopedStrictSearchReconcilePath, brandScopedStrictSearchReconcile, "brand-scoped strict verified catalog search matched queued product identity", "brand-scoped acquisition reconcile resolution reason");
requireSnippet(brandScopedStrictSearchReconcilePath, brandScopedStrictSearchReconcile, "catalog_acquisition_strict_search_high_confidence", "brand-scoped acquisition reconcile uses high-confidence helper");
requireSnippet(brandScopedStrictSearchReconcilePath, brandScopedStrictSearchReconcile, "GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role", "brand-scoped acquisition reconcile service-role grant");

const brandScopedCheckedReconcilePath = "supabase/migrations/191_brand_scoped_reconcile_marks_unresolved_checked.sql";
const brandScopedCheckedReconcile = read(brandScopedCheckedReconcilePath);
requireSnippet(brandScopedCheckedReconcilePath, brandScopedCheckedReconcile, "last_reconcile_checked_at", "brand-scoped acquisition reconcile marks checked rows");
requireSnippet(brandScopedCheckedReconcilePath, brandScopedCheckedReconcile, "checked_unresolved_search_rows", "brand-scoped acquisition reconcile reports checked unresolved rows");
requireSnippet(brandScopedCheckedReconcilePath, brandScopedCheckedReconcile, "last_reconcile_checked_result", "brand-scoped acquisition reconcile stores checked result");
requireSnippet(brandScopedCheckedReconcilePath, brandScopedCheckedReconcile, "no_strict_match", "brand-scoped acquisition reconcile advances unresolved rows safely");
requireSnippet(brandScopedCheckedReconcilePath, brandScopedCheckedReconcile, "GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role", "brand-scoped checked reconcile service-role grant");

const defaultAdultSpeciesInferenceReconcilePath = "supabase/migrations/196_acquisition_reconcile_default_adult_species_inference.sql";
const defaultAdultSpeciesInferenceReconcile = read(defaultAdultSpeciesInferenceReconcilePath);
requireSnippet(defaultAdultSpeciesInferenceReconcilePath, defaultAdultSpeciesInferenceReconcile, "default adult acquisition key token", "acquisition reconcile default adult key token");
requireSnippet(defaultAdultSpeciesInferenceReconcilePath, defaultAdultSpeciesInferenceReconcile, "high_rank_species_count", "acquisition reconcile infers species from high-rank candidates only");
requireSnippet(defaultAdultSpeciesInferenceReconcilePath, defaultAdultSpeciesInferenceReconcile, "cs.high_rank_species_count = 1", "acquisition reconcile requires one inferred species");
requireSnippet(defaultAdultSpeciesInferenceReconcilePath, defaultAdultSpeciesInferenceReconcile, "Blue Buffalo Basics Adult Salmon and Potato Recipe", "acquisition reconcile default-adult Blue Buffalo fixture");
requireSnippet(defaultAdultSpeciesInferenceReconcilePath, defaultAdultSpeciesInferenceReconcile, "must not reconcile to protected puppy variants", "acquisition reconcile default-adult protected variant fixture");
requireSnippet(defaultAdultSpeciesInferenceReconcilePath, defaultAdultSpeciesInferenceReconcile, "GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role", "default-adult species inference reconcile service-role grant");

const brandScopedAmbiguousVariantReconcilePath = "supabase/migrations/199_brand_scoped_reconcile_ambiguous_variant_guard.sql";
const brandScopedAmbiguousVariantReconcile = read(brandScopedAmbiguousVariantReconcilePath);
requireSnippet(brandScopedAmbiguousVariantReconcilePath, brandScopedAmbiguousVariantReconcile, "ambiguous verified formula guard", "brand-scoped reconcile keeps ambiguous verified formulas open");
requireSnippet(brandScopedAmbiguousVariantReconcilePath, brandScopedAmbiguousVariantReconcile, "high_confidence_candidates", "brand-scoped reconcile separates high-confidence candidates before ambiguity checks");
requireSnippet(brandScopedAmbiguousVariantReconcilePath, brandScopedAmbiguousVariantReconcile, "alt.matched_rank >= hc.matched_rank - 0.50", "brand-scoped reconcile close-rank ambiguity threshold");
requireSnippet(brandScopedAmbiguousVariantReconcilePath, brandScopedAmbiguousVariantReconcile, "catalog_acquisition_identity_normalize(alt.matched_product_name)", "brand-scoped reconcile allows package duplicates of same product identity");
requireSnippet(brandScopedAmbiguousVariantReconcilePath, brandScopedAmbiguousVariantReconcile, "GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role", "ambiguous variant reconcile service-role grant");

const brandScopedPackageCountReconcilePath = "supabase/migrations/216_brand_reconcile_package_count_guard.sql";
const brandScopedPackageCountReconcile = read(brandScopedPackageCountReconcilePath);
requireSnippet(brandScopedPackageCountReconcilePath, brandScopedPackageCountReconcile, "catalog_acquisition_package_count_match(hc.product_name, hc.matched_identity)", "brand-scoped reconcile requires package-count compatibility");
requireSnippet(brandScopedPackageCountReconcilePath, brandScopedPackageCountReconcile, "reopened_package_count_mismatch", "brand-scoped reconcile reopens package-count mismatches");
requireSnippet(brandScopedPackageCountReconcilePath, brandScopedPackageCountReconcile, "24-pack title must not reconcile to 12-count verified package identity", "package-count guard rejects wrong count fixture");
requireSnippet(brandScopedPackageCountReconcilePath, brandScopedPackageCountReconcile, "multi-pack title must not reconcile to single-package verified identity without count evidence", "package-count guard rejects missing count evidence fixture");
requireSnippet(brandScopedPackageCountReconcilePath, brandScopedPackageCountReconcile, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_package_count_match(TEXT, TEXT) TO service_role", "package-count guard service-role grant");

const aliasVerifiedDuplicateReconcilePath = "supabase/migrations/227_alias_verified_duplicate_acquisition_reconcile.sql";
const aliasVerifiedDuplicateReconcile = read(aliasVerifiedDuplicateReconcilePath);
requireSnippet(aliasVerifiedDuplicateReconcilePath, aliasVerifiedDuplicateReconcile, "catalog_acquisition_verified_brand_alias_match", "alias duplicate reconcile has verified brand alias guard");
requireSnippet(aliasVerifiedDuplicateReconcilePath, aliasVerifiedDuplicateReconcile, "catalog_acquisition_alias_formula_terms_match", "alias duplicate reconcile has exact formula-term guard");
requireSnippet(aliasVerifiedDuplicateReconcilePath, aliasVerifiedDuplicateReconcile, "exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand", "alias duplicate reconcile service-role function");
requireSnippet(aliasVerifiedDuplicateReconcilePath, aliasVerifiedDuplicateReconcile, "dave s 95 premium meats", "alias duplicate reconcile covers Dave's 95% line");
requireSnippet(aliasVerifiedDuplicateReconcilePath, aliasVerifiedDuplicateReconcile, "Dave''s alias formula guard must reject chicken beef sibling formula", "alias duplicate reconcile rejects sibling formula fixture");
requireSnippet(aliasVerifiedDuplicateReconcilePath, aliasVerifiedDuplicateReconcile, "GRANT EXECUTE ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role", "alias duplicate reconcile service-role grant");

const aliasDuplicateSizeVariantGuardPath = "supabase/migrations/233_alias_duplicate_size_variant_guard.sql";
const aliasDuplicateSizeVariantGuard = read(aliasDuplicateSizeVariantGuardPath);
requireSnippet(aliasDuplicateSizeVariantGuardPath, aliasDuplicateSizeVariantGuard, "catalog_acquisition_size_terms_match(hc.legacy_product_name, hc.matched_identity)", "alias duplicate closer requires size guard");
requireSnippet(aliasDuplicateSizeVariantGuardPath, aliasDuplicateSizeVariantGuard, "reopened_size_variant_mismatch", "alias duplicate closer reopens size mismatches");
requireSnippet(aliasDuplicateSizeVariantGuardPath, aliasDuplicateSizeVariantGuard, "alias verified duplicate size mismatches remain", "alias duplicate closer verifies no remaining size mismatches");
requireSnippet(aliasDuplicateSizeVariantGuardPath, aliasDuplicateSizeVariantGuard, "GRANT EXECUTE ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role", "alias size guard service-role grant");

const duplicateFoodFormVariantGuardPath = "supabase/migrations/234_duplicate_food_form_variant_guard.sql";
const duplicateFoodFormVariantGuard = read(duplicateFoodFormVariantGuardPath);
requireSnippet(duplicateFoodFormVariantGuardPath, duplicateFoodFormVariantGuard, "CREATE OR REPLACE FUNCTION public.catalog_acquisition_food_form_terms_match", "duplicate cleanup has food-form guard helper");
requireSnippet(duplicateFoodFormVariantGuardPath, duplicateFoodFormVariantGuard, "catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_identity)", "direct duplicate closer requires food-form guard");
requireSnippet(duplicateFoodFormVariantGuardPath, duplicateFoodFormVariantGuard, "catalog_acquisition_food_form_terms_match(hc.legacy_product_name, hc.matched_identity)", "alias duplicate closer requires food-form guard");
requireSnippet(duplicateFoodFormVariantGuardPath, duplicateFoodFormVariantGuard, "reopened_food_form_variant_mismatch", "duplicate food-form guard reopens mismatches");
requireSnippet(duplicateFoodFormVariantGuardPath, duplicateFoodFormVariantGuard, "dry title matched to wet verified row", "food-form guard rejects dry-to-wet fixture");
requireSnippet(duplicateFoodFormVariantGuardPath, duplicateFoodFormVariantGuard, "wet title matched to dry verified row", "food-form guard rejects wet-to-dry fixture");
requireSnippet(duplicateFoodFormVariantGuardPath, duplicateFoodFormVariantGuard, "duplicate food-form mismatches remain", "duplicate food-form guard verifies no remaining mismatches");
requireSnippet(duplicateFoodFormVariantGuardPath, duplicateFoodFormVariantGuard, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) TO service_role", "food-form guard service-role grant");

const foodFormGuardMissingSideRefinementPath = "supabase/migrations/235_food_form_guard_missing_side_refinement.sql";
const foodFormGuardMissingSideRefinement = read(foodFormGuardMissingSideRefinementPath);
requireSnippet(foodFormGuardMissingSideRefinementPath, foodFormGuardMissingSideRefinement, "reject explicit form conflicts", "food-form guard refinement rationale");
requireSnippet(foodFormGuardMissingSideRefinementPath, foodFormGuardMissingSideRefinement, "cardinality(q_forms) = 0 OR cardinality(c_forms) = 0 THEN TRUE", "food-form guard allows missing-side form evidence");
requireSnippet(foodFormGuardMissingSideRefinementPath, foodFormGuardMissingSideRefinement, "food-form guard must still reject explicit dry title matched to wet verified row", "food-form guard still rejects dry-to-wet fixture");
requireSnippet(foodFormGuardMissingSideRefinementPath, foodFormGuardMissingSideRefinement, "food-form guard must still reject explicit wet title matched to dry verified row", "food-form guard still rejects wet-to-dry fixture");
requireSnippet(foodFormGuardMissingSideRefinementPath, foodFormGuardMissingSideRefinement, "food-form guard should allow missing query form when verified identity is dry", "food-form guard allows missing query form dry fixture");
requireSnippet(foodFormGuardMissingSideRefinementPath, foodFormGuardMissingSideRefinement, "raw coated kibble should be treated as dry kibble", "food-form guard treats raw coated kibble as dry");
requireSnippet(foodFormGuardMissingSideRefinementPath, foodFormGuardMissingSideRefinement, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) TO service_role", "food-form refinement service-role grant");

const strictSearchFoodFormGuardPath = "supabase/migrations/236_strict_search_food_form_guard.sql";
const strictSearchFoodFormGuard = read(strictSearchFoodFormGuardPath);
requireSnippet(strictSearchFoodFormGuardPath, strictSearchFoodFormGuard, "catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)", "strict-search reconciler requires food-form guard");
requireSnippet(strictSearchFoodFormGuardPath, strictSearchFoodFormGuard, "reopened_food_form_variant_mismatch", "strict-search food-form guard reopens mismatches");
requireSnippet(strictSearchFoodFormGuardPath, strictSearchFoodFormGuard, "strict-search food-form guard must reject explicit dry title matched to wet verified source URL", "strict-search food-form guard rejects dry-to-wet fixture");
requireSnippet(strictSearchFoodFormGuardPath, strictSearchFoodFormGuard, "strict-search food-form guard must reject explicit wet title matched to dry verified source URL", "strict-search food-form guard rejects wet-to-dry fixture");
requireSnippet(strictSearchFoodFormGuardPath, strictSearchFoodFormGuard, "strict-search food-form guard should allow raw coated kibble dry identities", "strict-search food-form guard allows raw coated kibble fixture");
requireSnippet(strictSearchFoodFormGuardPath, strictSearchFoodFormGuard, "strict-search food-form mismatches remain", "strict-search food-form guard verifies no remaining mismatches");
requireSnippet(strictSearchFoodFormGuardPath, strictSearchFoodFormGuard, "GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role", "strict-search food-form guard service-role grant");

const strictSearchLifeStageGuardPath = "supabase/migrations/241_strict_search_life_stage_guard.sql";
const strictSearchLifeStageGuard = read(strictSearchLifeStageGuardPath);
requireSnippet(strictSearchLifeStageGuardPath, strictSearchLifeStageGuard, "catalog_acquisition_life_stage_terms_match(hc.product_name, hc.matched_identity)", "strict-search reconciler requires life-stage guard");
requireSnippet(strictSearchLifeStageGuardPath, strictSearchLifeStageGuard, "reopened_life_stage_variant_mismatch", "strict-search life-stage guard reopens mismatches");
requireSnippet(strictSearchLifeStageGuardPath, strictSearchLifeStageGuard, "Adult Cats 7+", "strict-search life-stage guard covers adult 7+ fixture");
requireSnippet(strictSearchLifeStageGuardPath, strictSearchLifeStageGuard, "adult 7+ title matched to non-senior adult row", "strict-search life-stage guard rejects adult 7+ to base adult fixture");
requireSnippet(strictSearchLifeStageGuardPath, strictSearchLifeStageGuard, "strict-search life-stage mismatches remain", "strict-search life-stage guard verifies no remaining mismatches");
requireSnippet(strictSearchLifeStageGuardPath, strictSearchLifeStageGuard, "GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role", "strict-search life-stage guard service-role grant");

const strictSearchReopenMetadataCleanupPath = "supabase/migrations/237_strict_search_reopen_metadata_cleanup.sql";
const strictSearchReopenMetadataCleanup = read(strictSearchReopenMetadataCleanupPath);
requireSnippet(strictSearchReopenMetadataCleanupPath, strictSearchReopenMetadataCleanup, "reopened_by' = '236_strict_search_food_form_guard", "strict-search reopen metadata cleanup scoped to food-form guard");
requireSnippet(strictSearchReopenMetadataCleanupPath, strictSearchReopenMetadataCleanup, "- 'reconciled_by'", "strict-search reopen metadata cleanup removes reconciled_by");
requireSnippet(strictSearchReopenMetadataCleanupPath, strictSearchReopenMetadataCleanup, "reopened strict-search rows still have stale reconciled_by metadata", "strict-search reopen metadata cleanup verifies no stale markers");

const editorialToolNoisePath = "supabase/migrations/217_exclude_editorial_tools_and_treat_queue_noise.sql";
const editorialToolNoise = read(editorialToolNoisePath);
requireSnippet(editorialToolNoisePath, editorialToolNoise, "editorial_or_tool", "non-product classifier rejects editorial/tool rows");
requireSnippet(editorialToolNoisePath, editorialToolNoise, "Taste of the Wild Ingredient Finder", "ingredient-finder acquisition gap fixture");
requireSnippet(editorialToolNoisePath, editorialToolNoise, "The Honest Kitchen Launches Essential Clusters - PETSPLUSMAG.COM", "editorial launch acquisition gap fixture");
requireSnippet(editorialToolNoisePath, editorialToolNoise, "Purina Friskies Party Mix Beachside Crunch", "treat acquisition gap fixture");
requireSnippet(editorialToolNoisePath, editorialToolNoise, "valid Honest Kitchen formula should not be rejected", "editorial/tool guard keeps valid formulas");

const tightenedStrictSearchReconcilePath = "supabase/migrations/173_tighten_high_confidence_reconcile_species_guard.sql";
const tightenedStrictSearchReconcile = read(tightenedStrictSearchReconcilePath);
requireSnippet(tightenedStrictSearchReconcilePath, tightenedStrictSearchReconcile, "q_has_dog = q_has_cat", "high-confidence acquisition reconcile requires one explicit species");
requireSnippet(tightenedStrictSearchReconcilePath, tightenedStrictSearchReconcile, "reopened after stricter species guard", "high-confidence acquisition reconcile reopens earlier optimistic matches");
requireSnippet(tightenedStrictSearchReconcilePath, tightenedStrictSearchReconcile, "species-ambiguous Blue Buffalo queue row should stay open", "high-confidence acquisition reconcile rejects species-ambiguous legacy row");
requireSnippet(tightenedStrictSearchReconcilePath, tightenedStrictSearchReconcile, "species-explicit puppy row should resolve", "high-confidence acquisition reconcile still resolves species-explicit row");

const royalCaninBreedReconcilePath = "supabase/migrations/193_royal_canin_breed_reconcile_guard.sql";
const royalCaninBreedReconcile = read(royalCaninBreedReconcilePath);
requireSnippet(royalCaninBreedReconcilePath, royalCaninBreedReconcile, "royal_canin_dog_breed_signal", "Royal Canin acquisition reconcile has narrow dog-breed fallback");
requireSnippet(royalCaninBreedReconcilePath, royalCaninBreedReconcile, "German Shepherd Adult", "Royal Canin acquisition reconcile covers dog-breed official row");
requireSnippet(royalCaninBreedReconcilePath, royalCaninBreedReconcile, "Royal Canin Weight Care", "Royal Canin acquisition reconcile keeps unknown-species non-breed rows unresolved");
requireSnippet(royalCaninBreedReconcilePath, royalCaninBreedReconcile, "must not reconcile to cat verified rows", "Royal Canin acquisition reconcile rejects wrong-species match");

const royalCaninSizeBreedReconcilePath = "supabase/migrations/198_royal_canin_size_and_breed_reconcile_guard.sql";
const royalCaninSizeBreedReconcile = read(royalCaninSizeBreedReconcilePath);
requireSnippet(royalCaninSizeBreedReconcilePath, royalCaninSizeBreedReconcile, "bichon frise", "Royal Canin acquisition reconcile covers Bichon Frise official breed row");
requireSnippet(royalCaninSizeBreedReconcilePath, royalCaninSizeBreedReconcile, "Royal Canin dog size-health signal", "Royal Canin acquisition reconcile has dog size-health fallback");
requireSnippet(royalCaninSizeBreedReconcilePath, royalCaninSizeBreedReconcile, "WHEN royal_canin_dog_size_signal THEN 1", "Royal Canin size-health fallback uses narrow key-term threshold");
requireSnippet(royalCaninSizeBreedReconcilePath, royalCaninSizeBreedReconcile, "Royal Canin Size Health Nutrition Large Adult", "Royal Canin size-health fixture");
requireSnippet(royalCaninSizeBreedReconcilePath, royalCaninSizeBreedReconcile, "generic unknown-species care title must remain unresolved", "Royal Canin generic care fixture stays unresolved");
requireSnippet(royalCaninSizeBreedReconcilePath, royalCaninSizeBreedReconcile, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role", "Royal Canin size/breed reconcile service-role grant");

const openFarmLineReconcilePath = "supabase/migrations/200_open_farm_line_reconcile_guard.sql";
const openFarmLineReconcile = read(openFarmLineReconcilePath);
requireSnippet(openFarmLineReconcilePath, openFarmLineReconcile, "Open Farm distinct line-name signal", "Open Farm acquisition reconcile has line-name fallback");
requireSnippet(openFarmLineReconcilePath, openFarmLineReconcile, "front range|open prairie|tide terrain|great plains|goodbowl|goodgut", "Open Farm line-name fallback stays specific");
requireSnippet(openFarmLineReconcilePath, openFarmLineReconcile, "Open Farm RawMix Grain-Free Front Range Dry Dog Food", "Open Farm RawMix fixture");
requireSnippet(openFarmLineReconcilePath, openFarmLineReconcile, "Open Farm Small Breed Grain-Free Dog Kibble", "Open Farm Small Breed fixture");
requireSnippet(openFarmLineReconcilePath, openFarmLineReconcile, "Open Farm Surf Turf Pate for Dogs", "Open Farm Surf Turf Pate fixture");
requireSnippet(openFarmLineReconcilePath, openFarmLineReconcile, "Open Farm vague senior dog title must stay unresolved", "Open Farm vague senior fixture stays unresolved");
requireSnippet(openFarmLineReconcilePath, openFarmLineReconcile, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role", "Open Farm line reconcile service-role grant");

const catalogFormulaTermGuardReconcilePath = "supabase/migrations/201_acquisition_reconcile_catalog_formula_term_guard.sql";
const catalogFormulaTermGuardReconcile = read(catalogFormulaTermGuardReconcilePath);
requireSnippet(catalogFormulaTermGuardReconcilePath, catalogFormulaTermGuardReconcile, "catalog formula-term containment guard", "acquisition reconcile rejects extra verified formula terms");
requireSnippet(catalogFormulaTermGuardReconcilePath, catalogFormulaTermGuardReconcile, "Fancy Feast exact classic chicken pate title should reconcile", "Fancy Feast exact chicken pate fixture");
requireSnippet(catalogFormulaTermGuardReconcilePath, catalogFormulaTermGuardReconcile, "must not reconcile to beef chicken variant", "Fancy Feast extra protein fixture stays unresolved");
requireSnippet(catalogFormulaTermGuardReconcilePath, catalogFormulaTermGuardReconcile, "must not reconcile to cheddar variant", "Fancy Feast extra cheddar fixture stays unresolved");
requireSnippet(catalogFormulaTermGuardReconcilePath, catalogFormulaTermGuardReconcile, "Fancy Feast cheddar grilled chicken title should reconcile", "Fancy Feast explicit cheddar fixture still resolves");
requireSnippet(catalogFormulaTermGuardReconcilePath, catalogFormulaTermGuardReconcile, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role", "catalog formula-term guard service-role grant");

const greenBeanFormulaTermReconcilePath = "supabase/migrations/202_acquisition_reconcile_green_bean_formula_terms.sql";
const greenBeanFormulaTermReconcile = read(greenBeanFormulaTermReconcilePath);
requireSnippet(greenBeanFormulaTermReconcilePath, greenBeanFormulaTermReconcile, "'bean', 'beans'", "acquisition reconcile treats bean as a protected formula term");
requireSnippet(greenBeanFormulaTermReconcilePath, greenBeanFormulaTermReconcile, "'green', 'heart'", "acquisition reconcile treats green as a protected formula term");
requireSnippet(greenBeanFormulaTermReconcilePath, greenBeanFormulaTermReconcile, "must not reconcile to green bean petite entree", "Wellness extra green bean fixture stays unresolved");
requireSnippet(greenBeanFormulaTermReconcilePath, greenBeanFormulaTermReconcile, "Wellness protein bowls salmon whitefish rice title should reconcile", "Wellness exact protein bowls fixture still resolves");
requireSnippet(greenBeanFormulaTermReconcilePath, greenBeanFormulaTermReconcile, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role", "green bean formula-term guard service-role grant");

const expandedFormulaTermReconcilePath = "supabase/migrations/203_acquisition_reconcile_expanded_formula_terms.sql";
const expandedFormulaTermReconcile = read(expandedFormulaTermReconcilePath);
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "'blueberry',", "acquisition reconcile protects blueberry formula terms");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "'lentil', 'lentils'", "acquisition reconcile protects lentil formula terms");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "'raspberry', 'raspberries'", "acquisition reconcile protects raspberry formula terms");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "'haddock', 'heart'", "acquisition reconcile protects haddock formula terms");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "'pea', 'peas'", "acquisition reconcile protects plural pea formula terms");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "must not reconcile to lamb raspberries formula", "Nulo extra raspberry fixture stays unresolved");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "Nulo chicken blueberries title should reconcile", "Nulo blueberry fixture still resolves");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "Nulo lamb lentils title should reconcile", "Nulo lentil fixture still resolves");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "Nulo chicken quinoa title should reconcile", "Nulo quinoa fixture still resolves");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "Nulo haddock salmon redfish title should reconcile", "Nulo fish-combo fixture still resolves");
requireSnippet(expandedFormulaTermReconcilePath, expandedFormulaTermReconcile, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role", "expanded formula-term guard service-role grant");

const purinaGatsbyImportMigrationPath = "supabase/migrations/107_purina_gatsby_page_data_import.sql";
const purinaGatsbyImportMigration = read(purinaGatsbyImportMigrationPath);
requireSnippet(purinaGatsbyImportMigrationPath, purinaGatsbyImportMigration, "CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions", "Purina Gatsby importer enables http extension outside public");
requireSnippet(purinaGatsbyImportMigrationPath, purinaGatsbyImportMigration, "purina_gatsby_page_data_url", "Purina Gatsby importer page-data URL helper");
requireSnippet(purinaGatsbyImportMigrationPath, purinaGatsbyImportMigration, "extensions.http_get", "Purina Gatsby importer fetches official page-data");
requireSnippet(purinaGatsbyImportMigrationPath, purinaGatsbyImportMigration, "relationships,products", "Purina Gatsby importer expands variety-pack product relationships");
requireSnippet(purinaGatsbyImportMigrationPath, purinaGatsbyImportMigration, "bundle_formulas", "Purina Gatsby importer preserves formula-level bundle ingredient evidence");
requireSnippet(purinaGatsbyImportMigrationPath, purinaGatsbyImportMigration, "import_purina_gatsby_product_feed", "Purina Gatsby importer live RPC");
requireSnippet(purinaGatsbyImportMigrationPath, purinaGatsbyImportMigration, "GRANT EXECUTE ON FUNCTION public.import_purina_gatsby_product_feed(TEXT[], TEXT, TEXT, INTEGER) TO service_role", "Purina Gatsby importer service-role grant");
requireSnippet(purinaGatsbyImportMigrationPath, purinaGatsbyImportMigration, "REVOKE ALL ON FUNCTION public.import_purina_gatsby_product_feed(TEXT[], TEXT, TEXT, INTEGER) FROM authenticated", "Purina Gatsby importer authenticated revoke");

const dedupeFeedPayloadMigrationPath = "supabase/migrations/108_dedupe_catalog_feed_payload.sql";
const dedupeFeedPayloadMigration = read(dedupeFeedPayloadMigrationPath);
requireSnippet(dedupeFeedPayloadMigrationPath, dedupeFeedPayloadMigration, "jsonb_array_elements(COALESCE(payload, '[]'::jsonb)) WITH ORDINALITY", "catalog feed RPC preserves payload row order before dedupe");
requireSnippet(dedupeFeedPayloadMigrationPath, dedupeFeedPayloadMigration, "SELECT DISTINCT ON (cache_key)", "catalog feed RPC dedupes duplicate cache keys");
requireSnippet(dedupeFeedPayloadMigrationPath, dedupeFeedPayloadMigration, "WHERE NULLIF(btrim(cache_key), '') IS NOT NULL", "catalog feed RPC rejects empty cache keys before upsert");
requireSnippet(dedupeFeedPayloadMigrationPath, dedupeFeedPayloadMigration, "CASE WHEN ingredient_verification_status = 'manufacturer' THEN 0 ELSE 1 END", "catalog feed RPC prefers manufacturer ingredient evidence on duplicate keys");
requireSnippet(dedupeFeedPayloadMigrationPath, dedupeFeedPayloadMigration, "ON CONFLICT (cache_key) DO UPDATE", "catalog feed RPC still upserts by cache key");
requireSnippet(dedupeFeedPayloadMigrationPath, dedupeFeedPayloadMigration, "GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_feed(JSONB) TO service_role", "catalog feed RPC dedupe keeps service-role grant");

const sourceUrlIngredientHardenMigrationPath = "supabase/migrations/168_harden_catalog_feed_source_url_and_ingredient_braces.sql";
const sourceUrlIngredientHardenMigration = read(sourceUrlIngredientHardenMigrationPath);
requireSnippet(sourceUrlIngredientHardenMigrationPath, sourceUrlIngredientHardenMigration, "Calcium Pantothenate {Vitamin B5)", "ingredient validator preserves source-backed internal braces");
requireSnippet(sourceUrlIngredientHardenMigrationPath, sourceUrlIngredientHardenMigration, "is_plausible_product_ingredient('{\"name\":\"Chicken\"}')", "ingredient validator still rejects JSON object payloads");
requireSnippet(sourceUrlIngredientHardenMigrationPath, sourceUrlIngredientHardenMigration, "existing.cache_key <> incoming.cache_key", "catalog feed RPC removes changed-cache-key source URL duplicates");
requireSnippet(sourceUrlIngredientHardenMigrationPath, sourceUrlIngredientHardenMigration, "existing.source_url = incoming.source_url", "catalog feed RPC duplicate guard uses source URL");
requireSnippet(sourceUrlIngredientHardenMigrationPath, sourceUrlIngredientHardenMigration, "lower(existing.product_name) = lower(incoming.product_name)", "catalog feed RPC duplicate guard keeps product identity");
forbidSnippet(sourceUrlIngredientHardenMigrationPath, sourceUrlIngredientHardenMigration, "incoming.gtin IS NOT NULL", "catalog feed source URL duplicate guard must not require GTIN");

const sourceBackedCurlyGroupsMigrationPath = "supabase/migrations/263_allow_source_backed_curly_ingredient_groups.sql";
const sourceBackedCurlyGroupsMigration = read(sourceBackedCurlyGroupsMigrationPath);
requireSnippet(sourceBackedCurlyGroupsMigrationPath, sourceBackedCurlyGroupsMigration, "value_without_allowed_curly_groups", "OCR artifact detector allows reviewed vitamin/mineral curly groups only");
requireSnippet(sourceBackedCurlyGroupsMigrationPath, sourceBackedCurlyGroupsMigration, "JSON object fragments with braces must still be flagged", "OCR artifact detector still rejects JSON brace artifacts");
requireSnippet(sourceBackedCurlyGroupsMigrationPath, sourceBackedCurlyGroupsMigration, "malformed OCR ingredient text must still be flagged", "OCR artifact detector still rejects malformed OCR text");

const preserveIngredientTextMigrationPath = "supabase/migrations/169_preserve_source_backed_ingredient_text.sql";
const preserveIngredientTextMigration = read(preserveIngredientTextMigrationPath);
requireSnippet(preserveIngredientTextMigrationPath, preserveIngredientTextMigration, "exact_ingredient_text", "ingredient contract preserves exact source-backed text");
requireSnippet(preserveIngredientTextMigrationPath, preserveIngredientTextMigration, "NEW.ingredient_text := COALESCE(exact_ingredient_text, clean_ingredient_text)", "ingredient contract does not rewrite source-backed ingredient text from split array");
requireSnippet(preserveIngredientTextMigrationPath, preserveIngredientTextMigration, "Vitamins [...]", "ingredient contract migration documents bracketed ingredient groups");

const petTypeMigrationPath = "supabase/migrations/076_product_data_pet_type.sql";
const petTypeMigration = read(petTypeMigrationPath);
requireSnippet(petTypeMigrationPath, petTypeMigration, "ADD COLUMN IF NOT EXISTS pet_type TEXT", "product_data pet_type column");
requireSnippet(petTypeMigrationPath, petTypeMigration, "DROP FUNCTION IF EXISTS public.search_products(TEXT, INTEGER)", "search_products return type refresh");
requireSnippet(petTypeMigrationPath, petTypeMigration, "pet_type TEXT", "search_products pet_type return column");

const petTypeBackfillMigrationPath = "supabase/migrations/086_backfill_catalog_pet_type.sql";
const petTypeBackfillMigration = read(petTypeBackfillMigrationPath);
requireSnippet(petTypeBackfillMigrationPath, petTypeBackfillMigration, "unambiguous", "pet-type backfill ambiguity guard comment");
requireSnippet(petTypeBackfillMigrationPath, petTypeBackfillMigration, "product_name, brand, cache_key, source_url", "pet-type backfill uses searchable product text");
requireSnippet(petTypeBackfillMigrationPath, petTypeBackfillMigration, "puppies", "pet-type backfill plural dog taxonomy");
requireSnippet(petTypeBackfillMigrationPath, petTypeBackfillMigration, "kittens", "pet-type backfill plural cat taxonomy");
requireSnippet(petTypeBackfillMigrationPath, petTypeBackfillMigration, "is_likely_non_product_catalog_row", "pet-type backfill avoids legacy non-product rows");
requireSnippet(petTypeBackfillMigrationPath, petTypeBackfillMigration, "is_plausible_product_ingredient", "pet-type backfill respects ingredient contract");
requireSnippet(petTypeBackfillMigrationPath, petTypeBackfillMigration, "refresh_catalog_acquisition_queue", "pet-type backfill refreshes acquisition queue");
requireSnippet(petTypeBackfillMigrationPath, petTypeBackfillMigration, "reconcile_catalog_acquisition_queue", "pet-type backfill reconciles acquisition queue");

const sourceEvidenceMigrationPath = "supabase/migrations/087_require_source_evidence_for_verified_catalog.sql";
const sourceEvidenceMigration = read(sourceEvidenceMigrationPath);
requireSnippet(sourceEvidenceMigrationPath, sourceEvidenceMigration, "product_data_verified_source_evidence_check", "verified source evidence check constraint");
requireSnippet(sourceEvidenceMigrationPath, sourceEvidenceMigration, "ingredient_verification_status = CASE", "verified ingredient demotion without source evidence");
requireSnippet(sourceEvidenceMigrationPath, sourceEvidenceMigration, "image_verification_status = CASE", "verified image demotion without source evidence");
requireSnippet(sourceEvidenceMigrationPath, sourceEvidenceMigration, "source_quality = CASE", "verified source-quality demotion without source evidence");
requireSnippet(sourceEvidenceMigrationPath, sourceEvidenceMigration, "refresh_catalog_acquisition_queue", "source evidence cleanup refreshes acquisition queue");
requireSnippet(sourceEvidenceMigrationPath, sourceEvidenceMigration, "reconcile_catalog_acquisition_queue", "source evidence cleanup reconciles acquisition queue");

const productIdentityMigrationPath = "supabase/migrations/088_catalog_product_identity.sql";
const productIdentityMigration = read(productIdentityMigrationPath);
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions", "base catalog search unaccent extension");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "ADD COLUMN IF NOT EXISTS gtin", "catalog GTIN identity column");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "ADD COLUMN IF NOT EXISTS product_line", "catalog product-line identity column");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "ADD COLUMN IF NOT EXISTS flavor", "catalog flavor identity column");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "ADD COLUMN IF NOT EXISTS life_stage", "catalog life-stage identity column");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "ADD COLUMN IF NOT EXISTS food_form", "catalog food-form identity column");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "ADD COLUMN IF NOT EXISTS package_size", "catalog package-size identity column");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "idx_product_data_identity_trgm", "catalog identity trigram index");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "gtin TEXT", "search_products returns GTIN");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "product_line TEXT", "search_products returns product line");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "identity_lc", "search_products ranks identity text");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "THEN 1.25", "source-backed verified search rank bonus");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "THEN 0.20", "community search rank bonus stays below source-backed rows");

const productFeedImportRpcMigrationPath = "supabase/migrations/089_catalog_product_feed_import_rpc.sql";
const productFeedImportRpcMigration = read(productFeedImportRpcMigrationPath);
requireSnippet(productFeedImportRpcMigrationPath, productFeedImportRpcMigration, "upsert_catalog_product_feed", "catalog feed import RPC");
requireSnippet(productFeedImportRpcMigrationPath, productFeedImportRpcMigration, "SECURITY INVOKER", "catalog feed import RPC does not bypass caller privileges");
requireSnippet(productFeedImportRpcMigrationPath, productFeedImportRpcMigration, "SET search_path = public", "catalog feed import RPC search path");
requireSnippet(productFeedImportRpcMigrationPath, productFeedImportRpcMigration, "jsonb_to_recordset", "catalog feed import RPC compact JSON payload");
requireSnippet(productFeedImportRpcMigrationPath, productFeedImportRpcMigration, "REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM authenticated", "catalog feed import RPC authenticated revoke");
requireSnippet(productFeedImportRpcMigrationPath, productFeedImportRpcMigration, "GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_feed(JSONB) TO service_role", "catalog feed import RPC service-role grant");

const preservePackVariantsMigrationPath = "supabase/migrations/175_preserve_catalog_pack_variants.sql";
const preservePackVariantsMigration = read(preservePackVariantsMigrationPath);
requireSnippet(preservePackVariantsMigrationPath, preservePackVariantsMigration, "removed_source_url_duplicates", "catalog feed RPC still removes stale duplicate source-url rows");
requireSnippet(preservePackVariantsMigrationPath, preservePackVariantsMigration, "NULLIF(btrim(existing.gtin), '') IS NULL", "catalog feed RPC duplicate cleanup preserves distinct GTIN variants");
requireSnippet(preservePackVariantsMigrationPath, preservePackVariantsMigration, "NULLIF(btrim(incoming.package_size), '') IS NULL", "catalog feed RPC duplicate cleanup preserves distinct package-size variants");
requireSnippet(preservePackVariantsMigrationPath, preservePackVariantsMigration, "GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_feed(JSONB) TO service_role", "catalog feed RPC variant-preservation keeps service-role grant");

const genericVerifiedSourceMigrationPath = "supabase/migrations/178_reject_generic_verified_catalog_sources.sql";
const genericVerifiedSourceMigration = read(genericVerifiedSourceMigrationPath);
requireSnippet(genericVerifiedSourceMigrationPath, genericVerifiedSourceMigration, "product_data_verified_source_not_generic", "generic source names cannot become verified-ready");
requireSnippet(genericVerifiedSourceMigrationPath, genericVerifiedSourceMigration, "generic_verified_source", "generic source cleanup tags excluded rows");
requireSnippet(genericVerifiedSourceMigrationPath, genericVerifiedSourceMigration, "review_state = 'rejected'", "generic source evidence is rejected");
requireSnippet(genericVerifiedSourceMigrationPath, genericVerifiedSourceMigration, "VALIDATE CONSTRAINT product_data_verified_source_not_generic", "generic source constraint is validated");

const officialFeedImportPath = "scripts/catalog-official-feed-import.mjs";
const officialFeedImport = read(officialFeedImportPath);
requireSnippet(officialFeedImportPath, officialFeedImport, "function emitMcpRpcGroupSql", "MCP-safe grouped RPC SQL export");
requireSnippet(officialFeedImportPath, officialFeedImport, "--sql-mcp-group-size", "MCP-safe grouped SQL export flag");
requireSnippet(officialFeedImportPath, officialFeedImport, "mcp_groups", "MCP group manifest entries");
requireSnippet(officialFeedImportPath, officialFeedImport, "CASE WHEN payload_text IS NULL THEN 0 ELSE 0 END", "checksum guard avoids constant-folded division-by-zero");
requireSnippet(officialFeedImportPath, officialFeedImport, "audit_ingredient_source_url", "audited SQL preserves separate ingredient evidence URL");
requireSnippet(officialFeedImportPath, officialFeedImport, "audit_image_source_url", "audited SQL preserves separate image evidence URL");
requireSnippet(officialFeedImportPath, officialFeedImport, "not_complete_food", "non-complete rows skipped before SQL export");
requireSnippet(officialFeedImportPath, officialFeedImport, "COMPLETE_FOOD_NUTRIENT_MARKER_REGEX", "complete-food ingredient plausibility marker gate");
requireSnippet(officialFeedImportPath, officialFeedImport, "incomplete_ingredient_statement", "truncated official ingredient statement skip reason");
requireSnippet(officialFeedImportPath, officialFeedImport, "(?:\\.\\.\\.|…)", "official feed rejects visibly truncated ingredient evidence");
requireSnippet(officialFeedImportPath, officialFeedImport, "(?:main|key)\\s+ingredients", "official feed rejects main-ingredients-only evidence");
requireSnippet(officialFeedImportPath, officialFeedImport, "what's inside|where to buy|nutritional facts|nutritional info|nutritional information", "official feed rejects Petcurean marketing-copy ingredient evidence");
requireSnippet(officialFeedImportPath, officialFeedImport, "--include-non-complete", "explicit non-complete diagnostic override");
requireSnippet(officialFeedImportPath, officialFeedImport, "sourceUrlPatternConfig", "official feed source URL pattern guard");
requireSnippet(officialFeedImportPath, officialFeedImport, "source_url_pattern_mismatch", "official feed source URL mismatch skip reason");
requireSnippet(officialFeedImportPath, officialFeedImport, "function sourceUrlIdentitySegment", "official feed fallback cache keys include source URL identity");
requireSnippet(officialFeedImportPath, officialFeedImport, "FISH_PROTEIN_TERMS", "official feed allows generic fish URL slugs to match specific fish recipes");
requireSnippet(officialFeedImportPath, officialFeedImport, "hasCoreFoodSignal(productName) || hasCoreFoodSignal(identityText)", "official feed treats official wet/dry food URL context as core food signal");
requireSnippet(officialFeedImportPath, officialFeedImport, "pate|pat|mousse", "official feed treats mousse as a core wet-food signal");

const scraperContractPath = "scripts/catalog-scraper-contract.mjs";
const scraperContract = read(scraperContractPath);
requireSnippet(scraperContractPath, scraperContract, "COMPLETE_FOOD_NUTRIENT_MARKER_REGEX", "scraper contract complete-food ingredient plausibility marker gate");
requireSnippet(scraperContractPath, scraperContract, "function hasCompleteFoodIngredientEvidence", "scraper contract complete-food ingredient evidence helper");
requireSnippet(scraperContractPath, scraperContract, "incomplete_ingredient_statement", "scraper contract rejects incomplete complete-food ingredients");
requireSnippet(scraperContractPath, scraperContract, "function sourceUrlIdentitySegment", "scraper contract fallback cache keys include source URL identity");
requireSnippet(scraperContractPath, scraperContract, "FISH_PROTEIN_TERMS", "scraper contract allows generic fish terms to match specific fish recipes");

const verifiedSearchMigrationPath = "supabase/migrations/090_prioritize_verified_catalog_search.sql";
const verifiedSearchMigration = read(verifiedSearchMigrationPath);
requireSnippet(verifiedSearchMigrationPath, verifiedSearchMigration, "search_products(q text, max_results integer)", "verified search migration targets current RPC signature");
requireSnippet(verifiedSearchMigrationPath, verifiedSearchMigration, "'THEN 0.08', 'THEN 1.25'", "verified search migration lifts source-backed bonus");
requireSnippet(verifiedSearchMigrationPath, verifiedSearchMigration, "'THEN 0.02', 'THEN 0.20'", "verified search migration lifts community bonus below source-backed rows");

const suspiciousIngredientsMigrationPath = "supabase/migrations/091_demote_suspicious_catalog_ingredients.sql";
const suspiciousIngredientsMigration = read(suspiciousIngredientsMigrationPath);
requireSnippet(suspiciousIngredientsMigrationPath, suspiciousIngredientsMigration, "has_complete_food_ingredient_evidence", "database guard for truncated verified ingredients");
requireSnippet(suspiciousIngredientsMigrationPath, suspiciousIngredientsMigration, "ingredient_verification_status := 'unverified'", "database demotes suspicious verified ingredient statements");
requireSnippet(suspiciousIngredientsMigrationPath, suspiciousIngredientsMigration, "UPDATE public.product_data", "database backfill demotes existing suspicious ingredient statements");

const verifiedBonusIdentityMigrationPath = "supabase/migrations/092_verified_search_bonus_identity_guard.sql";
const verifiedBonusIdentityMigration = read(verifiedBonusIdentityMigrationPath);
requireSnippet(verifiedBonusIdentityMigrationPath, verifiedBonusIdentityMigration, "word_similarity(query.normalized, r.identity_lc) > 0.72", "verified search bonus identity guard");
requireSnippet(verifiedBonusIdentityMigrationPath, verifiedBonusIdentityMigration, "r.verified_rank_bonus * 0.25", "verified bonus dampened for weak identity matches");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "r.verified_rank_bonus * 0.25", "base search migration dampens weak verified identity matches");

const accentNormalizedSearchMigrationPath = "supabase/migrations/093_accent_normalized_catalog_search.sql";
const accentNormalizedSearchMigration = read(accentNormalizedSearchMigrationPath);
requireSnippet(accentNormalizedSearchMigrationPath, accentNormalizedSearchMigration, "CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions", "catalog search accent normalization extension");
requireSnippet(accentNormalizedSearchMigrationPath, accentNormalizedSearchMigration, "extensions.unaccent(lower(trim(q)))", "search query accent normalization");
requireSnippet(accentNormalizedSearchMigrationPath, accentNormalizedSearchMigration, "extensions.unaccent(lower(COALESCE(pd.product_name, '')))", "product-name accent normalization");
requireSnippet(productIdentityMigrationPath, productIdentityMigration, "extensions.unaccent(lower(concat_ws(", "base search identity accent normalization");

const acquisitionIdentityReconcileMigrationPath = "supabase/migrations/094_reconcile_catalog_acquisition_identity_matches.sql";
const acquisitionIdentityReconcileMigration = read(acquisitionIdentityReconcileMigrationPath);
requireSnippet(acquisitionIdentityReconcileMigrationPath, acquisitionIdentityReconcileMigration, "catalog_acquisition_identity_match", "acquisition queue identity-match guard");
requireSnippet(acquisitionIdentityReconcileMigrationPath, acquisitionIdentityReconcileMigration, "p_queue_pet_type <> p_catalog_pet_type", "acquisition queue prevents dog/cat identity mismatches");
requireSnippet(acquisitionIdentityReconcileMigrationPath, acquisitionIdentityReconcileMigration, "q_proteins", "acquisition queue recipe protein guard");
requireSnippet(acquisitionIdentityReconcileMigrationPath, acquisitionIdentityReconcileMigration, "variety|assorted|assortment|bundle|sampler|multipack|mixed", "acquisition queue variety-pack guard");
requireSnippet(acquisitionIdentityReconcileMigrationPath, acquisitionIdentityReconcileMigration, "source-backed catalog product matched queued product identity", "acquisition queue records source-backed identity resolution");
requireSnippet(acquisitionIdentityReconcileMigrationPath, acquisitionIdentityReconcileMigration, "resolved_product_identity_rows", "acquisition queue returns identity-resolution count");
requireSnippet(acquisitionIdentityReconcileMigrationPath, acquisitionIdentityReconcileMigration, "idx_product_data_ready_brand_lower", "acquisition queue identity reconciliation brand index");
requireSnippet(acquisitionIdentityReconcileMigrationPath, acquisitionIdentityReconcileMigration, "REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM authenticated", "authenticated identity-match helper revoke");
requireSnippet(acquisitionIdentityReconcileMigrationPath, acquisitionIdentityReconcileMigration, "GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) TO service_role", "service-role identity-match helper grant");

const stricterAcquisitionIdentityMigrationPath = "supabase/migrations/095_stricter_catalog_acquisition_identity_guard.sql";
const stricterAcquisitionIdentityMigration = read(stricterAcquisitionIdentityMigrationPath);
requireSnippet(stricterAcquisitionIdentityMigrationPath, stricterAcquisitionIdentityMigration, "cardinality(q_proteins) = 0", "acquisition queue refuses generic no-protein recipe identity");
requireSnippet(stricterAcquisitionIdentityMigrationPath, stricterAcquisitionIdentityMigration, "WHERE NOT c_token = ANY(q_proteins)", "acquisition queue requires exact source-backed protein set");
requireSnippet(stricterAcquisitionIdentityMigrationPath, stricterAcquisitionIdentityMigration, "q_recipe_terms", "acquisition queue recipe term guard");
requireSnippet(stricterAcquisitionIdentityMigrationPath, stricterAcquisitionIdentityMigration, "stale_identity_resolutions", "acquisition queue reopens stale loose identity resolutions");
requireSnippet(stricterAcquisitionIdentityMigrationPath, stricterAcquisitionIdentityMigration, "reopened after stricter source-backed identity guard", "acquisition queue records stricter reopen reason");

const exactRecipeIdentityMigrationPath = "supabase/migrations/096_exact_recipe_terms_for_acquisition_identity.sql";
const exactRecipeIdentityMigration = read(exactRecipeIdentityMigrationPath);
requireSnippet(exactRecipeIdentityMigrationPath, exactRecipeIdentityMigration, "WHERE NOT c_term = ANY(q_recipe_terms)", "acquisition queue requires exact notable recipe terms");
requireSnippet(exactRecipeIdentityMigrationPath, exactRecipeIdentityMigration, "'bone'", "acquisition queue blocks bone/joint specialty mismatches");
requireSnippet(exactRecipeIdentityMigrationPath, exactRecipeIdentityMigration, "'high protein'", "acquisition queue blocks high-protein specialty mismatches");
requireSnippet(exactRecipeIdentityMigrationPath, exactRecipeIdentityMigration, "reopened after exact recipe-term identity guard", "acquisition queue records exact recipe-term reopen reason");

const packageSizeSearchMigrationPath = "supabase/migrations/097_package_size_catalog_search_tiebreaker.sql";
const packageSizeSearchMigration = read(packageSizeSearchMigrationPath);
requireSnippet(packageSizeSearchMigrationPath, packageSizeSearchMigration, "package_query_key", "catalog search extracts requested package size");
requireSnippet(packageSizeSearchMigrationPath, packageSizeSearchMigration, "package_size_key", "catalog search normalizes package-size variants");
requireSnippet(packageSizeSearchMigrationPath, packageSizeSearchMigration, "r.package_size_key = query.package_query_key", "catalog search rewards exact package-size matches");
requireSnippet(packageSizeSearchMigrationPath, packageSizeSearchMigration, "Package size is still only a search/display tie-breaker", "package-size ranking remains non-safety identity");

const verifiedSourceSearchMigrationPath = "supabase/migrations/098_verified_source_search_rank_bonus.sql";
const verifiedSourceSearchMigration = read(verifiedSourceSearchMigrationPath);
requireSnippet(verifiedSourceSearchMigrationPath, verifiedSourceSearchMigration, "verified_source_rank_bonus", "catalog search source-backed rank bonus");
requireSnippet(verifiedSourceSearchMigrationPath, verifiedSourceSearchMigration, "query_has_dog", "catalog search source-backed rank respects dog query species");
requireSnippet(verifiedSourceSearchMigrationPath, verifiedSourceSearchMigration, "query_has_cat", "catalog search source-backed rank respects cat query species");
requireSnippet(verifiedSourceSearchMigrationPath, verifiedSourceSearchMigration, "pd.image_verification_status IN", "catalog search source-backed rank requires verified image evidence");
requireSnippet(verifiedSourceSearchMigrationPath, verifiedSourceSearchMigration, "word_similarity(query.normalized, r.identity_lc) > 0.62", "catalog search source-backed rank requires strong identity similarity");

const verifiedSourceCandidateWideningMigrationPath = "supabase/migrations/099_verified_source_candidate_widening.sql";
const verifiedSourceCandidateWideningMigration = read(verifiedSourceCandidateWideningMigrationPath);
requireSnippet(verifiedSourceCandidateWideningMigrationPath, verifiedSourceCandidateWideningMigration, "r.verified_source_rank_bonus > 0", "catalog search admits verified source candidates");
requireSnippet(verifiedSourceCandidateWideningMigrationPath, verifiedSourceCandidateWideningMigration, "word_similarity(query.normalized, r.identity_lc) > 0.54", "catalog search widens verified source candidate similarity");

const verifiedSourceBonusWeightMigrationPath = "supabase/migrations/100_verified_source_bonus_weight.sql";
const verifiedSourceBonusWeightMigration = read(verifiedSourceBonusWeightMigrationPath);
requireSnippet(verifiedSourceBonusWeightMigrationPath, verifiedSourceBonusWeightMigration, "THEN 2.30", "catalog search verified source bonus weight");

const verifiedSourceExactProductTermsMigrationPath = "supabase/migrations/101_verified_source_exact_product_terms.sql";
const verifiedSourceExactProductTermsMigration = read(verifiedSourceExactProductTermsMigrationPath);
requireSnippet(verifiedSourceExactProductTermsMigrationPath, verifiedSourceExactProductTermsMigration, "verified source exact product terms", "catalog search exact source product term boost");
requireSnippet(verifiedSourceExactProductTermsMigrationPath, verifiedSourceExactProductTermsMigration, "grain free", "catalog search avoids grain-free/whole-grain source sibling boost");
requireSnippet(verifiedSourceExactProductTermsMigrationPath, verifiedSourceExactProductTermsMigration, "NOT EXISTS", "catalog search requires meaningful product tokens in query");

const verifiedSourceVariantTermPrecisionMigrationPath = "supabase/migrations/102_verified_source_variant_term_precision.sql";
const verifiedSourceVariantTermPrecisionMigration = read(verifiedSourceVariantTermPrecisionMigrationPath);
requireSnippet(verifiedSourceVariantTermPrecisionMigrationPath, verifiedSourceVariantTermPrecisionMigration, "THEN 1.35", "catalog search exact verified source product-term boost weight");
requireSnippet(verifiedSourceVariantTermPrecisionMigrationPath, verifiedSourceVariantTermPrecisionMigration, "variant terms like", "catalog search does not ignore source variant terms");
requireSnippet(verifiedSourceVariantTermPrecisionMigrationPath, verifiedSourceVariantTermPrecisionMigration, "''breed'', ''breeds''", "catalog search removes breed terms from exact source stopwords");
requireSnippet(verifiedSourceVariantTermPrecisionMigrationPath, verifiedSourceVariantTermPrecisionMigration, "''small''", "catalog search removes small from exact source stopwords");

const verifiedSourceTokenOverlapMigrationPath = "supabase/migrations/109_verified_source_token_overlap_rank.sql";
const verifiedSourceTokenOverlapMigration = read(verifiedSourceTokenOverlapMigrationPath);
requireSnippet(verifiedSourceTokenOverlapMigrationPath, verifiedSourceTokenOverlapMigration, "verified source distinctive token overlap", "catalog search verified source distinctive token boost");
requireSnippet(verifiedSourceTokenOverlapMigrationPath, verifiedSourceTokenOverlapMigration, "query_token.value IN", "catalog search checks important query terms");
requireSnippet(verifiedSourceTokenOverlapMigrationPath, verifiedSourceTokenOverlapMigration, "'hydrolyzed'", "catalog search protects veterinary formula terms");
requireSnippet(verifiedSourceTokenOverlapMigrationPath, verifiedSourceTokenOverlapMigration, "'vegetarian'", "catalog search protects specialty diet terms");
requireSnippet(verifiedSourceTokenOverlapMigrationPath, verifiedSourceTokenOverlapMigration, "'oatmeal'", "catalog search protects recipe grain terms");
requireSnippet(verifiedSourceTokenOverlapMigrationPath, verifiedSourceTokenOverlapMigration, "THEN 2.75", "catalog search strong verified overlap boost");

const countDelightsSearchMigrationPath = "supabase/migrations/110_count_delights_as_verified_source_identity.sql";
const countDelightsSearchMigration = read(countDelightsSearchMigrationPath);
requireSnippet(countDelightsSearchMigrationPath, countDelightsSearchMigration, "verified source distinctive token overlap", "Delights patch targets verified source overlap block");
requireSnippet(countDelightsSearchMigrationPath, countDelightsSearchMigration, "Blue Buffalo uses it as the visible line", "Delights patch documents product-line rationale");
requireSnippet(countDelightsSearchMigrationPath, countDelightsSearchMigration, "'complete', 'delight'", "Delights patch removes singular line token from stopwords");
requireSnippet(countDelightsSearchMigrationPath, countDelightsSearchMigration, "'delights', 'diets'", "Delights patch removes plural line token from stopwords");

const verifiedSourceBaseBonusGuardMigrationPath = "supabase/migrations/111_guard_verified_source_bonus_missing_query_terms.sql";
const verifiedSourceBaseBonusGuardMigration = read(verifiedSourceBaseBonusGuardMigrationPath);
requireSnippet(verifiedSourceBaseBonusGuardMigrationPath, verifiedSourceBaseBonusGuardMigration, "verified source base bonus requires important terms", "verified source base bonus query-term guard");
requireSnippet(verifiedSourceBaseBonusGuardMigrationPath, verifiedSourceBaseBonusGuardMigration, "regexp_count(function_sql, 'THEN r\\.verified_source_rank_bonus') <> 2", "verified source base bonus patch count guard");
requireSnippet(verifiedSourceBaseBonusGuardMigrationPath, verifiedSourceBaseBonusGuardMigration, "'turkey'", "verified source base bonus protects turkey formula terms");
requireSnippet(verifiedSourceBaseBonusGuardMigrationPath, verifiedSourceBaseBonusGuardMigration, "'giblets'", "verified source base bonus protects giblets formula terms");
requireSnippet(verifiedSourceBaseBonusGuardMigrationPath, verifiedSourceBaseBonusGuardMigration, "'hydrolyzed'", "verified source base bonus protects veterinary diet formula terms");
requireSnippet(verifiedSourceBaseBonusGuardMigrationPath, verifiedSourceBaseBonusGuardMigration, "ELSE 0.0", "verified source base bonus falls to zero for missing important terms");
requireSnippet(verifiedSourceBaseBonusGuardMigrationPath, verifiedSourceBaseBonusGuardMigration, "regexp_count(function_sql, 'verified source base bonus requires important terms') <> 2", "verified source base bonus guard applied twice");

const speciesRankAlignmentMigrationPath = "supabase/migrations/117_search_products_species_rank_alignment.sql";
const speciesRankAlignmentMigration = read(speciesRankAlignmentMigrationPath);
requireSnippet(speciesRankAlignmentMigrationPath, speciesRankAlignmentMigration, "explicit pet species rank alignment", "catalog search aligns explicit dog/cat query terms");
requireSnippet(speciesRankAlignmentMigrationPath, speciesRankAlignmentMigration, "WHEN query.query_has_dog AND r.pet_type = 'dog' THEN 0.85", "catalog search boosts dog rows for dog queries");
requireSnippet(speciesRankAlignmentMigrationPath, speciesRankAlignmentMigration, "WHEN query.query_has_cat AND r.pet_type = 'cat' THEN 0.85", "catalog search boosts cat rows for cat queries");
requireSnippet(speciesRankAlignmentMigrationPath, speciesRankAlignmentMigration, "WHEN query.query_has_cat AND r.pet_type = 'dog' THEN -1.35", "catalog search penalizes dog rows for cat queries");

const brandRankAlignmentMigrationPath = "supabase/migrations/118_search_products_brand_rank_alignment.sql";
const brandRankAlignmentMigration = read(brandRankAlignmentMigrationPath);
requireSnippet(brandRankAlignmentMigrationPath, brandRankAlignmentMigration, "explicit brand phrase rank alignment", "catalog search aligns exact brand phrases");
requireSnippet(brandRankAlignmentMigrationPath, brandRankAlignmentMigration, "length(r.brand_lc) >= 4", "catalog search brand boost ignores tiny brand tokens");
requireSnippet(brandRankAlignmentMigrationPath, brandRankAlignmentMigration, "query.normalized LIKE '%' || r.brand_lc || '%'", "catalog search boosts exact brand phrase matches");

const sourceBrandAliasMigrationPath = "supabase/migrations/112_canonicalize_source_brand_aliases.sql";
const sourceBrandAliasMigration = read(sourceBrandAliasMigrationPath);
requireSnippet(sourceBrandAliasMigrationPath, sourceBrandAliasMigration, "canonicalized source brands", "source brand aliases are canonicalized in live catalog");
requireSnippet(sourceBrandAliasMigrationPath, sourceBrandAliasMigration, "Wellness canonical brand cache-key collision", "Wellness canonical key collision guard");
requireSnippet(sourceBrandAliasMigrationPath, sourceBrandAliasMigration, "Hill''s Science Diet", "Hill's source rows canonicalize to shelf-facing Science Diet");
requireSnippet(sourceBrandAliasMigrationPath, sourceBrandAliasMigration, "Old Mother Hubbard", "Wellness-owned treat sub-brand is excluded from complete-food catalog");
requireSnippet(sourceBrandAliasMigrationPath, sourceBrandAliasMigration, "refresh_catalog_acquisition_queue(30, 10000)", "source brand alias migration refreshes acquisition queue");

const explicitNonCompleteMigrationPath = "supabase/migrations/113_preserve_explicit_non_complete_catalog_rows.sql";
const explicitNonCompleteMigration = read(explicitNonCompleteMigrationPath);
requireSnippet(explicitNonCompleteMigrationPath, explicitNonCompleteMigration, "explicit_exclusion_reason", "catalog trigger preserves explicit exclusion markers");
requireSnippet(explicitNonCompleteMigrationPath, explicitNonCompleteMigration, "NEW.is_complete_food IS FALSE OR explicit_exclusion_reason IS NOT NULL", "explicit non-complete rows stay excluded");
requireSnippet(explicitNonCompleteMigrationPath, explicitNonCompleteMigration, "COALESCE(explicit_exclusion_reason, 'not_complete_food')", "catalog trigger defaults preserved exclusion reason");
requireSnippet(explicitNonCompleteMigrationPath, explicitNonCompleteMigration, "brand IN ('Old Mother Hubbard', 'WHIMZEES')", "known Wellness treat sub-brands re-excluded after trigger patch");

const wholeheartedExclusionMigrationPath = "supabase/migrations/143_exclude_unverified_wholehearted_rows.sql";
const wholeheartedExclusionMigration = read(wholeheartedExclusionMigrationPath);
requireSnippet(wholeheartedExclusionMigrationPath, wholeheartedExclusionMigration, "explicit_exclusion_reason IS NOT NULL", "catalog trigger permits explicit cleanup exclusions");
requireSnippet(wholeheartedExclusionMigrationPath, wholeheartedExclusionMigration, "RETURN NEW;", "explicit excluded rows bypass ready-row rejection");
requireSnippet(wholeheartedExclusionMigrationPath, wholeheartedExclusionMigration, "awaiting_verified_retailer_source", "WholeHearted rows are excluded until retailer verification");
requireSnippet(wholeheartedExclusionMigrationPath, wholeheartedExclusionMigration, "brand ilike '%wholehearted%'", "WholeHearted exclusion targets brand/source/product identity");

const dentalFoodGuardMigrationPath = "supabase/migrations/144_allow_verified_dental_food_catalog_rows.sql";
const dentalFoodGuardMigration = read(dentalFoodGuardMigrationPath);
requireSnippet(dentalFoodGuardMigrationPath, dentalFoodGuardMigration, "Dental treats and chews are still excluded", "database dental guard rationale");
requireSnippet(dentalFoodGuardMigrationPath, dentalFoodGuardMigration, "Royal Canin veterinary Dental diets", "database dental guard covers source-backed complete diets");
requireSnippet(dentalFoodGuardMigrationPath, dentalFoodGuardMigration, "(training|sausage|sausages)", "database guard still rejects training/sausage non-food rows");
forbidSnippet(dentalFoodGuardMigrationPath, dentalFoodGuardMigration, "(dental|training|sausage|sausages)", "database guard must not reject dental complete-food names by token alone");

const verifiedProductsAppRpcMigrationPath = "supabase/migrations/147_search_verified_products_app_rpc.sql";
const verifiedProductsAppRpcMigration = read(verifiedProductsAppRpcMigrationPath);
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "CREATE OR REPLACE FUNCTION public.search_verified_products", "verified app search RPC");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "SECURITY DEFINER", "verified app search RPC definer contract");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "SET search_path = public", "verified app search RPC search path");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "pd.ingredient_count >= 5", "verified app search requires ingredient count");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "pd.is_complete_food = TRUE", "verified app search requires complete food");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "pd.catalog_exclusion_reason IS NULL", "verified app search excludes blocked rows");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "lower(COALESCE(pd.pet_type, '')) IN ('dog', 'cat')", "verified app search requires known dog/cat pet type");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "pd.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')", "verified app search requires source quality");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "pd.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')", "verified app search requires verified ingredients");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "pd.image_verification_status IN ('official', 'manufacturer', 'retailer_verified')", "verified app search requires verified product image");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "pd.image_url !~* '^data:'", "verified app search rejects data-url images");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "WHERE scored.rank >= 3.0", "verified app search applies rank floor");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon", "verified app search anonymous revoke");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search authenticated grant");
requireSnippet(verifiedProductsAppRpcMigrationPath, verifiedProductsAppRpcMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role", "verified app search service-role grant");

const petcoWholeheartedSeedMigrationPath = "supabase/migrations/148_import_petco_wholehearted_verified_seed.sql";
const petcoWholeheartedSeedMigration = read(petcoWholeheartedSeedMigrationPath);
requireSnippet(petcoWholeheartedSeedMigrationPath, petcoWholeheartedSeedMigration, "petco-wholehearted:3001041", "Petco WholeHearted reviewed seed cache key");
requireSnippet(petcoWholeheartedSeedMigrationPath, petcoWholeheartedSeedMigration, "retailer_verified", "Petco WholeHearted seed is retailer verified");
requireSnippet(petcoWholeheartedSeedMigrationPath, petcoWholeheartedSeedMigration, "wholehearted-chicken-and-rice-formula-dog-food", "Petco WholeHearted seed source URL");
requireSnippet(petcoWholeheartedSeedMigrationPath, petcoWholeheartedSeedMigration, "3001041-center-1", "Petco WholeHearted seed verified image");
requireSnippet(petcoWholeheartedSeedMigrationPath, petcoWholeheartedSeedMigration, "refresh_catalog_acquisition_queue", "Petco WholeHearted seed refreshes acquisition queue");

const verifiedProductsRequiredTermsMigrationPath = "supabase/migrations/149_search_verified_products_required_terms.sql";
const verifiedProductsRequiredTermsMigration = read(verifiedProductsRequiredTermsMigrationPath);
requireSnippet(verifiedProductsRequiredTermsMigrationPath, verifiedProductsRequiredTermsMigration, "query_required_terms", "verified app search SQL required-term guard");
requireSnippet(verifiedProductsRequiredTermsMigrationPath, verifiedProductsRequiredTermsMigration, "required_term.term IN", "verified app search required-term allowlist");
requireSnippet(verifiedProductsRequiredTermsMigrationPath, verifiedProductsRequiredTermsMigration, "'salmon'", "verified app search protects sibling protein terms");
requireSnippet(verifiedProductsRequiredTermsMigrationPath, verifiedProductsRequiredTermsMigration, "WHERE r.identity_lc !~ ('\\m' || qrt.term || '\\M')", "verified app search blocks missing recipe terms");
requireSnippet(verifiedProductsRequiredTermsMigrationPath, verifiedProductsRequiredTermsMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search required-term authenticated grant");

const verifiedProductsIdentityTokenBoostMigrationPath = "supabase/migrations/152_search_verified_products_identity_token_boost.sql";
const verifiedProductsIdentityTokenBoostMigration = read(verifiedProductsIdentityTokenBoostMigrationPath);
requireSnippet(verifiedProductsIdentityTokenBoostMigrationPath, verifiedProductsIdentityTokenBoostMigration, "verified identity all-token coverage boost", "verified app search all-token identity boost");
requireSnippet(verifiedProductsIdentityTokenBoostMigrationPath, verifiedProductsIdentityTokenBoostMigration, "regexp_split_to_table(query.normalized, '\\s+')", "verified app search tokenizes normalized query");

const verifiedProductsExtraTermPenaltyMigrationPath = "supabase/migrations/162_search_verified_products_extra_recipe_term_penalty.sql";
const verifiedProductsExtraTermPenaltyMigration = read(verifiedProductsExtraTermPenaltyMigrationPath);
requireSnippet(verifiedProductsExtraTermPenaltyMigrationPath, verifiedProductsExtraTermPenaltyMigration, "verified extra protected-term penalty", "verified app search penalizes sibling formulas with extra protected terms");
requireSnippet(verifiedProductsExtraTermPenaltyMigrationPath, verifiedProductsExtraTermPenaltyMigration, "-2.5 *", "verified app search extra-term penalty weight");
requireSnippet(verifiedProductsExtraTermPenaltyMigrationPath, verifiedProductsExtraTermPenaltyMigration, "'pumpkin'", "verified app search protects visible flavor terms");
requireSnippet(verifiedProductsExtraTermPenaltyMigrationPath, verifiedProductsExtraTermPenaltyMigration, "'rabbit'", "verified app search protects less common proteins");
requireSnippet(verifiedProductsExtraTermPenaltyMigrationPath, verifiedProductsExtraTermPenaltyMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search extra-term migration keeps authenticated grant");

const verifiedProductsToyBreedGuardMigrationPath = "supabase/migrations/185_search_verified_products_toy_breed_variant_guard.sql";
const verifiedProductsToyBreedGuardMigration = read(verifiedProductsToyBreedGuardMigrationPath);
requireSnippet(verifiedProductsToyBreedGuardMigrationPath, verifiedProductsToyBreedGuardMigration, "Toy Breed sibling formula", "verified app search toy-breed variant guard rationale");
requireSnippet(verifiedProductsToyBreedGuardMigrationPath, verifiedProductsToyBreedGuardMigration, "'toy'", "verified app search protects toy-breed variants");
requireSnippet(verifiedProductsToyBreedGuardMigrationPath, verifiedProductsToyBreedGuardMigration, "toy breed verified-search variant guard was not applied", "verified app search toy-breed patch guard");
requireSnippet(verifiedProductsToyBreedGuardMigrationPath, verifiedProductsToyBreedGuardMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search toy-breed migration keeps authenticated grant");

const verifiedProductsAbbreviatedLabelBoostMigrationPath = "supabase/migrations/186_search_verified_products_abbreviated_label_boost.sql";
const verifiedProductsAbbreviatedLabelBoostMigration = read(verifiedProductsAbbreviatedLabelBoostMigrationPath);
requireSnippet(verifiedProductsAbbreviatedLabelBoostMigrationPath, verifiedProductsAbbreviatedLabelBoostMigration, "verified omitted default side-term rescue boost", "verified app search rescues abbreviated shelf-label queries");
requireSnippet(verifiedProductsAbbreviatedLabelBoostMigrationPath, verifiedProductsAbbreviatedLabelBoostMigration, "SELECT count(*)::INTEGER", "verified app search abbreviated-label boost requires enough identity tokens");
requireSnippet(verifiedProductsAbbreviatedLabelBoostMigrationPath, verifiedProductsAbbreviatedLabelBoostMigration, "extra_term.term IN ('adult', 'rice', 'oatmeal', 'potato', 'sweet')", "verified app search only rescues weak omitted side terms");
requireSnippet(verifiedProductsAbbreviatedLabelBoostMigrationPath, verifiedProductsAbbreviatedLabelBoostMigration, "extra_term.term NOT IN ('adult', 'rice', 'oatmeal', 'potato', 'sweet')", "verified app search keeps hard sibling-variant guard terms");
requireSnippet(verifiedProductsAbbreviatedLabelBoostMigrationPath, verifiedProductsAbbreviatedLabelBoostMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search abbreviated-label migration keeps authenticated grant");

const verifiedProductsInsectRecipeGuardMigrationPath = "supabase/migrations/187_search_verified_products_insect_recipe_guard.sql";
const verifiedProductsInsectRecipeGuardMigration = read(verifiedProductsInsectRecipeGuardMigrationPath);
requireSnippet(verifiedProductsInsectRecipeGuardMigrationPath, verifiedProductsInsectRecipeGuardMigration, "Insect protein products are distinct formulas", "verified app search insect recipe guard rationale");
requireSnippet(verifiedProductsInsectRecipeGuardMigrationPath, verifiedProductsInsectRecipeGuardMigration, "'insect'", "verified app search protects insect protein terms");
requireSnippet(verifiedProductsInsectRecipeGuardMigrationPath, verifiedProductsInsectRecipeGuardMigration, "search_verified_products insect recipe guard was not applied", "verified app search insect guard patch guard");
requireSnippet(verifiedProductsInsectRecipeGuardMigrationPath, verifiedProductsInsectRecipeGuardMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search insect guard migration keeps authenticated grant");

const verifiedProductsPlantRecipeGuardMigrationPath = "supabase/migrations/188_search_verified_products_plant_recipe_guard.sql";
const verifiedProductsPlantRecipeGuardMigration = read(verifiedProductsPlantRecipeGuardMigrationPath);
requireSnippet(verifiedProductsPlantRecipeGuardMigrationPath, verifiedProductsPlantRecipeGuardMigration, "Plant-based products are distinct formulas", "verified app search plant recipe guard rationale");
requireSnippet(verifiedProductsPlantRecipeGuardMigrationPath, verifiedProductsPlantRecipeGuardMigration, "'plant'", "verified app search protects plant-based terms");
requireSnippet(verifiedProductsPlantRecipeGuardMigrationPath, verifiedProductsPlantRecipeGuardMigration, "search_verified_products plant recipe guard was not applied", "verified app search plant guard patch guard");
requireSnippet(verifiedProductsPlantRecipeGuardMigrationPath, verifiedProductsPlantRecipeGuardMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search plant guard migration keeps authenticated grant");

const verifiedProductsGrainFreeGuardMigrationPath = "supabase/migrations/189_search_verified_products_grain_free_variant_guard.sql";
const verifiedProductsGrainFreeGuardMigration = read(verifiedProductsGrainFreeGuardMigrationPath);
requireSnippet(verifiedProductsGrainFreeGuardMigrationPath, verifiedProductsGrainFreeGuardMigration, "Grain-free and grain-inclusive formulas are distinct variants", "verified app search grain-free guard rationale");
requireSnippet(verifiedProductsGrainFreeGuardMigrationPath, verifiedProductsGrainFreeGuardMigration, "'grain'", "verified app search protects grain-free terms");
requireSnippet(verifiedProductsGrainFreeGuardMigrationPath, verifiedProductsGrainFreeGuardMigration, "'free'", "verified app search protects grain-free terms");
requireSnippet(verifiedProductsGrainFreeGuardMigrationPath, verifiedProductsGrainFreeGuardMigration, "search_verified_products grain-free variant guard was not applied", "verified app search grain-free guard patch guard");
requireSnippet(verifiedProductsGrainFreeGuardMigrationPath, verifiedProductsGrainFreeGuardMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search grain-free guard migration keeps authenticated grant");

const verifiedProductsAncientGrainsGuardMigrationPath = "supabase/migrations/190_search_verified_products_ancient_grains_variant_guard.sql";
const verifiedProductsAncientGrainsGuardMigration = read(verifiedProductsAncientGrainsGuardMigrationPath);
requireSnippet(verifiedProductsAncientGrainsGuardMigrationPath, verifiedProductsAncientGrainsGuardMigration, "Ancient-grains and grain-free formulas are distinct variants", "verified app search ancient-grains guard rationale");
requireSnippet(verifiedProductsAncientGrainsGuardMigrationPath, verifiedProductsAncientGrainsGuardMigration, "'ancient'", "verified app search protects ancient-grains terms");
requireSnippet(verifiedProductsAncientGrainsGuardMigrationPath, verifiedProductsAncientGrainsGuardMigration, "'grains'", "verified app search protects ancient-grains terms");
requireSnippet(verifiedProductsAncientGrainsGuardMigrationPath, verifiedProductsAncientGrainsGuardMigration, "search_verified_products ancient-grains variant guard was not applied", "verified app search ancient-grains guard patch guard");
requireSnippet(verifiedProductsAncientGrainsGuardMigrationPath, verifiedProductsAncientGrainsGuardMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search ancient-grains guard migration keeps authenticated grant");

const verifiedProductsLabelSynonymsMigrationPath = "supabase/migrations/194_search_verified_products_label_synonyms.sql";
const verifiedProductsLabelSynonymsMigration = read(verifiedProductsLabelSynonymsMigrationPath);
requireSnippet(verifiedProductsLabelSynonymsMigrationPath, verifiedProductsLabelSynonymsMigration, "Label photos and retailer titles", "verified app search label synonym rationale");
requireSnippet(verifiedProductsLabelSynonymsMigrationPath, verifiedProductsLabelSynonymsMigration, "\\mdivine delights\\M", "verified app search Blue Divine Delights synonym");
requireSnippet(verifiedProductsLabelSynonymsMigrationPath, verifiedProductsLabelSynonymsMigration, "canned|dinner|hearty", "verified app search label noise terms");
requireSnippet(verifiedProductsLabelSynonymsMigrationPath, verifiedProductsLabelSynonymsMigration, "pd.gtin,", "verified app search source URL identity patch target");
requireSnippet(verifiedProductsLabelSynonymsMigrationPath, verifiedProductsLabelSynonymsMigration, "pd.source_url", "verified app search includes source URL in identity matching");
requireSnippet(verifiedProductsLabelSynonymsMigrationPath, verifiedProductsLabelSynonymsMigration, "verified omitted grain variant penalty", "verified app search omitted grain variant penalty");
requireSnippet(verifiedProductsLabelSynonymsMigrationPath, verifiedProductsLabelSynonymsMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search label synonym migration keeps authenticated grant");

const verifiedProductsDefaultAdultTermMigrationPath = "supabase/migrations/195_search_verified_products_default_adult_term.sql";
const verifiedProductsDefaultAdultTermMigration = read(verifiedProductsDefaultAdultTermMigrationPath);
requireSnippet(verifiedProductsDefaultAdultTermMigrationPath, verifiedProductsDefaultAdultTermMigration, "default adult verified-search term", "verified app search default adult term rationale");
requireSnippet(verifiedProductsDefaultAdultTermMigrationPath, verifiedProductsDefaultAdultTermMigration, "default adult verified-search token", "verified app search default adult token rationale");
requireSnippet(verifiedProductsDefaultAdultTermMigrationPath, verifiedProductsDefaultAdultTermMigration, "qrt.term = 'adult'", "verified app search only relaxes adult required term");
requireSnippet(verifiedProductsDefaultAdultTermMigrationPath, verifiedProductsDefaultAdultTermMigration, "query.normalized !~ '\\m(puppy|kitten|senior|mature|small|toy|large)\\M'", "verified app search keeps explicit query life-stage and size terms protected");
requireSnippet(verifiedProductsDefaultAdultTermMigrationPath, verifiedProductsDefaultAdultTermMigration, "r.identity_lc !~ '\\m(puppy|kitten|senior|mature|small|toy|large)\\M'", "verified app search does not match adult queries to protected catalog variants");
requireSnippet(verifiedProductsDefaultAdultTermMigrationPath, verifiedProductsDefaultAdultTermMigration, "regexp_count(function_sql, 'default adult verified-search token') < 3", "verified app search patches all adult token guards");
requireSnippet(verifiedProductsDefaultAdultTermMigrationPath, verifiedProductsDefaultAdultTermMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search default-adult migration keeps authenticated grant");

const verifiedProductsRetailerSuffixMigrationPath = "supabase/migrations/197_normalize_verified_product_search_retailer_suffixes.sql";
const verifiedProductsRetailerSuffixMigration = read(verifiedProductsRetailerSuffixMigrationPath);
requireSnippet(verifiedProductsRetailerSuffixMigrationPath, verifiedProductsRetailerSuffixMigration, "chewy|amazon|walmart|target|petco|petsmart|petsense", "verified app search strips retailer suffixes");
requireSnippet(verifiedProductsRetailerSuffixMigrationPath, verifiedProductsRetailerSuffixMigration, "Purina Pro Plan Complete Essentials Shredded Blend Chicken and Rice Do - Petsense", "verified app search retailer suffix fixture");
requireSnippet(verifiedProductsRetailerSuffixMigrationPath, verifiedProductsRetailerSuffixMigration, "must preserve product identity terms", "verified app search retailer suffix identity preservation");
requireSnippet(verifiedProductsRetailerSuffixMigrationPath, verifiedProductsRetailerSuffixMigration, "GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO authenticated", "verified app search retailer suffix normalizer authenticated grant");

const bilJacDryTitleNormalizerMigrationPath = "supabase/migrations/228_bil_jac_dry_title_normalizer.sql";
const bilJacDryTitleNormalizerMigration = read(bilJacDryTitleNormalizerMigrationPath);
requireSnippet(bilJacDryTitleNormalizerMigrationPath, bilJacDryTitleNormalizerMigration, "Bil-Jac dry dog pages use official titles", "Bil-Jac dry title normalizer rationale");
requireSnippet(bilJacDryTitleNormalizerMigrationPath, bilJacDryTitleNormalizerMigration, "value ~ '\\mbil jac\\M'", "Bil-Jac dry title normalizer is brand-scoped");
requireSnippet(bilJacDryTitleNormalizerMigrationPath, bilJacDryTitleNormalizerMigration, "value ~ '\\mdry dog\\M'", "Bil-Jac dry title normalizer is dry dog scoped");
requireSnippet(bilJacDryTitleNormalizerMigrationPath, bilJacDryTitleNormalizerMigration, "value !~ '\\m(wet|canned|can|cans|gravy|pate|pat|stew|stews|platter|platters)\\M'", "Bil-Jac dry title normalizer preserves wet/protein variants");
requireSnippet(bilJacDryTitleNormalizerMigrationPath, bilJacDryTitleNormalizerMigration, "Bil-Jac Puppy Select Dry Dog Food, Fresh Chicken Recipe", "Bil-Jac dry title normalizer search fixture");
requireSnippet(bilJacDryTitleNormalizerMigrationPath, bilJacDryTitleNormalizerMigration, "Pâté Platters with Chicken & Vegetables Wet Dog Food", "Bil-Jac wet variant fixture remains strict");
requireSnippet(bilJacDryTitleNormalizerMigrationPath, bilJacDryTitleNormalizerMigration, "GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO authenticated", "Bil-Jac dry title normalizer keeps authenticated grant");

const smallBiteGuardMigrationPath = "supabase/migrations/229_search_verified_products_small_bite_guard.sql";
const smallBiteGuardMigration = read(smallBiteGuardMigrationPath);
requireSnippet(smallBiteGuardMigrationPath, smallBiteGuardMigration, "Small Bite", "verified app search small-bite guard rationale");
requireSnippet(smallBiteGuardMigrationPath, smallBiteGuardMigration, "'bite'", "verified app search protects bite variants");
requireSnippet(smallBiteGuardMigrationPath, smallBiteGuardMigration, "'bites'", "verified app search protects bites variants");
requireSnippet(smallBiteGuardMigrationPath, smallBiteGuardMigration, "Small Bite query must not resolve to Small Breed formula", "verified app search small-bite negative fixture");
requireSnippet(smallBiteGuardMigrationPath, smallBiteGuardMigration, "Small Breed query should still resolve to official Small Breed row", "verified app search small-breed positive fixture");
requireSnippet(smallBiteGuardMigrationPath, smallBiteGuardMigration, "case|cases|pack|packs", "verified app search strips retail packaging noise");
requireSnippet(smallBiteGuardMigrationPath, smallBiteGuardMigration, "GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated", "verified app search small-bite migration keeps authenticated grant");

const tikiPetsAliasMigrationPath = "supabase/migrations/156_search_verified_products_tiki_pets_alias.sql";
const tikiPetsAliasMigration = read(tikiPetsAliasMigrationPath);
requireSnippet(tikiPetsAliasMigrationPath, tikiPetsAliasMigration, "TIKI PETS verified-search alias normalization", "verified app search normalizes TIKI PETS parent brand aliases");
requireSnippet(tikiPetsAliasMigrationPath, tikiPetsAliasMigration, "regexp_replace(normalized, '\\mtiki pets\\M', 'tiki cat'", "verified app search maps TIKI PETS cat queries to Tiki Cat");
requireSnippet(tikiPetsAliasMigrationPath, tikiPetsAliasMigration, "regexp_replace(normalized, '\\mtiki pets\\M', 'tiki dog'", "verified app search maps TIKI PETS dog queries to Tiki Dog");

const nonUsCommunityRowsMigrationPath = "supabase/migrations/158_exclude_non_us_community_catalog_rows.sql";
const nonUsCommunityRowsMigration = read(nonUsCommunityRowsMigrationPath);
requireSnippet(nonUsCommunityRowsMigrationPath, nonUsCommunityRowsMigration, "non_us_locale_product", "non-US community rows are excluded from ready catalog");
requireSnippet(nonUsCommunityRowsMigrationPath, nonUsCommunityRowsMigration, "source_quality IN ('community', 'unknown', 'scraped')", "non-US cleanup is limited to community/unknown source rows");
requireSnippet(nonUsCommunityRowsMigrationPath, nonUsCommunityRowsMigration, "refresh_catalog_acquisition_queue", "non-US cleanup refreshes acquisition queue");
requireSnippet(verifiedProductsIdentityTokenBoostMigrationPath, verifiedProductsIdentityTokenBoostMigration, "right(identity_token.term, 1) = 's'", "verified app search singular fallback for possessive/plural terms");
requireSnippet(verifiedProductsIdentityTokenBoostMigrationPath, verifiedProductsIdentityTokenBoostMigration, "THEN 3.6", "verified app search all-token boost weight");
requireSnippet(verifiedProductsIdentityTokenBoostMigrationPath, verifiedProductsIdentityTokenBoostMigration, "search_verified_products identity token boost patch target not found", "verified app search patch target guard");

const brothNonProductMigrationPath = "supabase/migrations/116_refine_non_product_broth_guard.sql";
const brothNonProductMigration = read(brothNonProductMigrationPath);
requireSnippet(brothNonProductMigrationPath, brothNonProductMigration, "Plain \"in Broth\" wet foods are valid complete-food products", "database broth guard rationale");
requireSnippet(brothNonProductMigrationPath, brothNonProductMigration, "CREATE OR REPLACE FUNCTION public.is_likely_non_product_catalog_row", "database non-product guard replacement");
requireSnippet(brothNonProductMigrationPath, brothNonProductMigration, "broth toppers?", "database broth topper exclusion");
requireSnippet(brothNonProductMigrationPath, brothNonProductMigration, "AND NOT core_food_signal", "database plain broth requires missing food signal before exclusion");

const namedBrothProductMigrationPath = "supabase/migrations/161_allow_valid_in_broth_product_names.sql";
const namedBrothProductMigration = read(namedBrothProductMigrationPath);
requireSnippet(namedBrothProductMigrationPath, namedBrothProductMigration, "named_broth_formula", "database guard allows named in-broth formulas");
requireSnippet(namedBrothProductMigrationPath, namedBrothProductMigration, "Ahi Tuna & Crab in Broth", "database guard validates Tiki in-broth formula");
requireSnippet(namedBrothProductMigrationPath, namedBrothProductMigration, "Bone Broth Topping", "database guard still rejects broth toppers");
requireSnippet(namedBrothProductMigrationPath, namedBrothProductMigration, "Seafood Selects - 24 ct.", "database guard still rejects count packs");
requireSnippet(namedBrothProductMigrationPath, namedBrothProductMigration, "AND NOT named_broth_formula", "database broth rejection exempts named formulas only");

const namedWetGravySauceMigrationPath = "supabase/migrations/170_allow_named_wet_gravy_sauce_catalog_rows.sql";
const namedWetGravySauceMigration = read(namedWetGravySauceMigrationPath);
requireSnippet(namedWetGravySauceMigrationPath, namedWetGravySauceMigration, "named_wet_formula", "database guard allows named wet gravy/sauce formulas");
requireSnippet(namedWetGravySauceMigrationPath, namedWetGravySauceMigration, "Minced Salmon & Cod in Fish Broth Gravy", "database guard validates named fish-broth gravy formula");
requireSnippet(namedWetGravySauceMigrationPath, namedWetGravySauceMigration, "Home Delights Sausage with Egg & Cheese in Sauce", "database guard validates named wet sauce formula");
requireSnippet(namedWetGravySauceMigrationPath, namedWetGravySauceMigration, "Training Sausage Bites", "database guard still rejects training sausage rows");

const accentedPateGuardMigrationPath = "supabase/migrations/119_non_product_guard_accented_pate_kittens.sql";
const accentedPateGuardMigration = read(accentedPateGuardMigrationPath);
requireSnippet(accentedPateGuardMigrationPath, accentedPateGuardMigration, "paté", "database non-product guard accepts accented pate");
requireSnippet(accentedPateGuardMigrationPath, accentedPateGuardMigration, "pupp(y|ies)", "database non-product guard accepts puppy/puppies food signals");
requireSnippet(accentedPateGuardMigrationPath, accentedPateGuardMigration, "kitten|kittens", "database non-product guard accepts kitten/kittens food signals");
requireSnippet(accentedPateGuardMigrationPath, accentedPateGuardMigration, "source titles use plural species/life-stage terms", "database non-product guard documents plural life-stage fix");

const fuzzySearchMigrationPath = "supabase/migrations/078_fuzzy_catalog_search.sql";
const fuzzySearchMigration = read(fuzzySearchMigrationPath);
requireSnippet(fuzzySearchMigrationPath, fuzzySearchMigration, "CREATE EXTENSION IF NOT EXISTS pg_trgm", "pg_trgm extension guard");
requireSnippet(fuzzySearchMigrationPath, fuzzySearchMigration, "strict_matched", "strict catalog search path");
requireSnippet(fuzzySearchMigrationPath, fuzzySearchMigration, "fuzzy_matched", "fuzzy catalog search fallback");
requireSnippet(fuzzySearchMigrationPath, fuzzySearchMigration, "word_similarity", "typo-tolerant word similarity");
requireSnippet(fuzzySearchMigrationPath, fuzzySearchMigration, "idx_product_data_product_name_trgm", "product-name trigram index");

const strictPriorityMigrationPath = "supabase/migrations/079_prioritize_strict_catalog_search.sql";
const strictPriorityMigration = read(strictPriorityMigrationPath);
requireSnippet(strictPriorityMigrationPath, strictPriorityMigration, "1.0 + GREATEST", "strict rank boost above fuzzy matches");
requireSnippet(strictPriorityMigrationPath, strictPriorityMigration, "fuzzy_matched", "fuzzy fallback preserved after strict priority fix");

const sourceProvenanceMigrationPath = "supabase/migrations/080_catalog_source_provenance.sql";
const sourceProvenanceMigration = read(sourceProvenanceMigrationPath);
requireSnippet(sourceProvenanceMigrationPath, sourceProvenanceMigration, "ADD COLUMN IF NOT EXISTS source_quality", "catalog source-quality provenance column");
requireSnippet(sourceProvenanceMigrationPath, sourceProvenanceMigration, "ingredient_verification_status", "ingredient verification provenance column");
requireSnippet(sourceProvenanceMigrationPath, sourceProvenanceMigration, "image_verification_status", "image verification provenance column");
requireSnippet(sourceProvenanceMigrationPath, sourceProvenanceMigration, "idx_product_data_verified_catalog_ready", "verified catalog readiness index");
requireSnippet(sourceProvenanceMigrationPath, sourceProvenanceMigration, "verified_rank_bonus", "verified-source search ranking nudge");

const backfillPath = "scripts/catalog-opff-backfill.mjs";
const backfill = read(backfillPath);
requireSnippet(backfillPath, backfill, "tag_0: \"united-states\"", "US OPFF backfill filter");
requireSnippet(backfillPath, backfill, ".from(\"product_data\")", "product_data upsert target");
requireSnippet(backfillPath, backfill, ".upsert(rows, { onConflict: \"cache_key\" })", "idempotent product_data upsert");
requireSnippet(backfillPath, backfill, "pet_type: petType", "OPFF backfill pet_type");
requireSnippet(backfillPath, backfill, "source_quality: \"community\"", "OPFF backfill community provenance");
requireSnippet(backfillPath, backfill, "ingredient_verification_status: \"community\"", "OPFF backfill ingredient provenance");
requireSnippet(backfillPath, backfill, "updateCatalogAcquisitionQueue", "OPFF backfill refreshes acquisition queue");

const opffImportPath = "scripts/catalog-opff-us-import.mjs";
const opffImport = read(opffImportPath);
requireSnippet(opffImportPath, opffImport, "tag_0: \"united-states\"", "full US OPFF import filter");
requireSnippet(opffImportPath, opffImport, "page += 1", "paged full-catalog import");
requireSnippet(opffImportPath, opffImport, ".upsert(rows, { onConflict: \"cache_key\" })", "idempotent full import upsert");
requireSnippet(opffImportPath, opffImport, "catalog_exclusion_reason: isCompleteFood ? null : \"not_complete_food\"", "treat/supplement exclusion marker");
requireSnippet(opffImportPath, opffImport, "pet_type: petType", "full OPFF import pet_type");
requireSnippet(opffImportPath, opffImport, "function isLikelyNonUsCommunityProduct", "full OPFF import non-US locale guard");
requireSnippet(opffImportPath, opffImport, "non_us_locale_product", "full OPFF import rejects obvious non-US locale products");
requireSnippet(opffImportPath, opffImport, "source_quality: \"community\"", "full OPFF import community provenance");
requireSnippet(opffImportPath, opffImport, "ingredient_verification_status: \"community\"", "full OPFF import ingredient provenance");
requireSnippet(opffImportPath, opffImport, "updateCatalogAcquisitionQueue", "full OPFF import refreshes acquisition queue");

const officialImportPath = "scripts/catalog-official-feed-import.mjs";
const officialImport = read(officialImportPath);
requireSnippet(officialImportPath, officialImport, "parseFeed(filePath)", "official JSON/NDJSON feed parser");
requireSnippet(officialImportPath, officialImport, "function parseCsv", "official CSV feed parser");
requireSnippet(officialImportPath, officialImport, "detectDelimiter", "official feed detects CSV/TSV/pipe delimiters");
requireSnippet(officialImportPath, officialImport, "\\t", "official feed supports TSV exports");
requireSnippet(officialImportPath, officialImport, "gunzipSync", "official feed supports gzip-compressed exports");
requireSnippet(officialImportPath, officialImport, "parseXmlFeed", "official XML feed parser");
requireSnippet(officialImportPath, officialImport, "extractRowsFromXmlObject", "official XML feed extracts product rows");
requireSnippet(officialImportPath, officialImport, "HEADER_ALIASES", "official feed header aliases");
requireSnippet(officialImportPath, officialImport, "global_trade_item_number", "official feed GDSN GTIN alias");
requireSnippet(officialImportPath, officialImport, "trade_item_description", "official feed GDSN product-name alias");
requireSnippet(officialImportPath, officialImport, "normalizeRecordKeys", "official feed normalizes JSON feed aliases");
requireSnippet(officialImportPath, officialImport, "applyNestedFeedAliases", "official feed normalizes nested licensed feed aliases");
requireSnippet(officialImportPath, officialImport, "nestedImageUrl", "official feed extracts nested front image evidence");
requireSnippet(officialImportPath, officialImport, "nestedSourceUrl", "official feed extracts nested product source evidence");
requireSnippet(officialImportPath, officialImport, "nestedIngredients", "official feed extracts nested ingredient arrays");
requireSnippet(officialImportPath, officialImport, "requireImage", "official feed image requirement");
requireSnippet(officialImportPath, officialImport, "\"--allow-missing-image\"", "explicit missing-image override");
requireSnippet(officialImportPath, officialImport, "requireSourceUrl", "official feed source evidence requirement");
requireSnippet(officialImportPath, officialImport, "\"--allow-missing-source-url\"", "explicit missing-source evidence override");
requireSnippet(officialImportPath, officialImport, "requiresSourceEvidence", "official feed verified-source evidence guard");
requireSnippet(officialImportPath, officialImport, "reason: \"not_complete_food\"", "official feed import skips non-complete rows before product_data SQL export");
requireSnippet(officialImportPath, officialImport, "function normalizeLifeStage", "official feed import normalizes life stage from source identity context");
requireSnippet(officialImportPath, officialImport, "row.sourceUrl", "official feed import life-stage fallback reads source URL");
requireSnippet(officialImportPath, officialImport, "\"--include-non-complete\"", "official feed import requires explicit override for non-complete diagnostics");
requireSnippet(officialImportPath, officialImport, "function hasContaminatedIngredientText", "contaminated ingredient guard helper");
requireSnippet(officialImportPath, officialImport, "contaminated_ingredient_statement", "contaminated ingredient skip reason");
requireSnippet(officialImportPath, officialImport, "made without|guaranteed levels", "official feed import rejects marketing prose as ingredient evidence");
requireSnippet(officialImportPath, officialImport, "function cleanIngredientStatement", "official feed cleans extracted ingredient statements");
requireSnippet(officialImportPath, officialImport, "isPasted", "official feed strips pasted HTML editor artifacts");
forbidSnippet(officialImportPath, officialImport, "source of omega", "official feed import must allow valid ingredient parentheticals like source of Omega 3 Fatty Acids");
requireSnippet(officialImportPath, officialImport, "function isLikelyNonProductCatalogRow", "official feed mirrors live non-product catalog guard");
requireSnippet(officialImportPath, officialImport, "const brothNonProduct", "official feed separates broth toppers from complete wet food");
requireSnippet(officialImportPath, officialImport, "samples?|sample packs?", "official feed rejects sample rows and non-single-formula packs");
requireSnippet(officialImportPath, officialImport, "blue bits", "official feed rejects Blue Bits treats");
requireSnippet(officialImportPath, officialImport, "bone broth|broth toppers?", "official feed rejects explicit broth toppers");
requireSnippet(officialImportPath, officialImport, "&& !coreFoodSignal", "official feed allows plain broth when wet/food signals are present");
requireSnippet(officialImportPath, officialImport, "pupp(y|ies)|kitten|kittens", "official feed accepts plural puppy/kitten food signals");
requireSnippet(officialImportPath, officialImport, "(training|sausage|sausages)", "official feed still rejects training/sausage non-food rows");
forbidSnippet(officialImportPath, officialImport, "(dental|training|sausage|sausages)", "official feed must not reject dental complete-food names by token alone");
requireSnippet(officialImportPath, officialImport, "non_product_catalog_row", "official feed skips rows rejected by product_data non-product trigger");
requireSnippet(officialImportPath, officialImport, "function canonicalSourceBrand", "official feed canonical source brand helper");
requireSnippet(officialImportPath, officialImport, "hill-s-pet-nutrition", "official feed canonicalizes Hill's source brand");
requireSnippet(officialImportPath, officialImport, "cat[- ]food|dog[- ]food", "official feed canonicalizes Hill's hyphenated food URL paths");
requireSnippet(officialImportPath, officialImport, "prescription[- ]diet", "official feed canonicalizes Hill's hyphenated Prescription Diet URL paths");
requireSnippet(officialImportPath, officialImport, "wellness-pet-company", "official feed canonicalizes Wellness source brand");
requireSnippet(officialImportPath, officialImport, "stella-and-chewys", "official feed canonicalizes Stella & Chewy's source brand");
requireSnippet(officialImportPath, officialImport, "Stella & Chewy's", "official feed canonical Stella & Chewy's shelf brand");
requireSnippet(officialImportPath, officialImport, "royal-canin-mars-petcare", "official feed canonicalizes Royal Canin source brand");
requireSnippet(officialImportPath, officialImport, "source === \"nutro\"", "official feed canonicalizes Nutro source brand");
requireSnippet(officialImportPath, officialImport, "return \"Nutro\"", "official feed canonical Nutro shelf brand");
requireSnippet(officialImportPath, officialImport, "farmina-pet-foods", "official feed canonicalizes Farmina source brand");
requireSnippet(officialImportPath, officialImport, "Tiki Cat", "official feed canonicalizes Tiki Cat source brand");
requireSnippet(officialImportPath, officialImport, "Tiki Dog", "official feed canonicalizes Tiki Dog source brand");
requireSnippet(officialImportPath, officialImport, "function isKnownNonCompleteSourceProduct", "official feed known source non-complete helper");
requireSnippet(officialImportPath, officialImport, "old mother hubbard", "official feed marks Old Mother Hubbard source rows as non-complete");
requireSnippet(officialImportPath, officialImport, "whimzees", "official feed marks WHIMZEES source rows as non-complete");
requireSnippet(officialImportPath, officialImport, "grandma-lucy-s", "official feed marks Grandma Lucy's non-complete sample/topper rows");
requireSnippet(officialImportPath, officialImport, "function isKnownNonDogCatPetProduct", "official feed rejects non-dog/cat pet products");
requireSnippet(officialImportPath, officialImport, "petType = \"\"", "official feed non-dog/cat guard accepts pet type context");
requireSnippet(officialImportPath, officialImport, "[\"dog\", \"cat\"].includes(compact(petType).toLowerCase())", "official feed dog/cat metadata overrides recipe words");
requireSnippet(officialImportPath, officialImport, "parakeet|parakeets", "official feed rejects bird products before dog/cat catalog import");
requireSnippet(officialImportPath, officialImport, "non_dog_cat_product", "official feed non-dog/cat skip reason");
requireSnippet(officialImportPath, officialImport, "base mix|base mixes|pre mix|pre mixes|premix", "official feed marks base/pre-mix products non-complete");
requireSnippet(officialImportPath, officialImport, "complete diet|complete and balanced|complete food|complete meal", "official feed allows explicit complete diet override for mix wording");
requireSnippet(officialImportPath, officialImport, "function hasVariantIngredientMismatch", "official feed variant ingredient mismatch guard");
requireSnippet(officialImportPath, officialImport, "variant_ingredient_mismatch", "official feed variant ingredient mismatch skip reason");
requireSnippet(officialImportPath, officialImport, "function hasVariantNutrientMismatch", "official feed variant nutrient mismatch guard");
requireSnippet(officialImportPath, officialImport, "variant_nutrient_mismatch", "official feed variant nutrient mismatch skip reason");
requireSnippet(officialImportPath, officialImport, "function hasVariantSourceUrlMismatch", "official feed variant source URL mismatch guard");
requireSnippet(officialImportPath, officialImport, "variant_source_url_mismatch", "official feed variant source URL mismatch skip reason");
requireSnippet(officialImportPath, officialImport, "function hasInvalidPackageSize", "official feed package-size metadata guard");
requireSnippet(officialImportPath, officialImport, "invalid_package_size", "official feed invalid package-size skip reason");
requireSnippet(officialImportPath, officialImport, "missing_source_url", "official feed source evidence skip reason");
requireSnippet(officialImportPath, officialImport, "\"--required-source-url-pattern\"", "official feed required source URL pattern argument");
requireSnippet(officialImportPath, officialImport, "function emitUpsertSql", "official feed SQL export");
requireSnippet(officialImportPath, officialImport, "function emitUpsertRpcSql", "official feed RPC SQL export");
requireSnippet(officialImportPath, officialImport, "function writeSqlChunks", "official feed chunked SQL export");
requireSnippet(officialImportPath, officialImport, "function cleanSqlOutputDir", "official feed SQL chunk cleanup");
requireSnippet(officialImportPath, officialImport, "function expectedBrandConfig", "official feed expected brand guard config");
requireSnippet(officialImportPath, officialImport, "brand_source_mismatch", "official feed brand/source mismatch skip reason");
requireSnippet(officialImportPath, officialImport, "\"--expected-brand\"", "official feed expected brand argument");
requireSnippet(officialImportPath, officialImport, "\"--allow-source-brand-mismatch\"", "official feed explicit brand mismatch override");
requireSnippet(officialImportPath, officialImport, "function md5Hex", "official feed SQL payload checksum helper");
requireSnippet(officialImportPath, officialImport, "md5(payload_text)", "official feed SQL payload checksum guard");
requireSnippet(officialImportPath, officialImport, "\"--emit-sql\"", "official feed SQL export flag");
requireSnippet(officialImportPath, officialImport, "\"--emit-sql-rpc\"", "official feed RPC SQL export flag");
requireSnippet(officialImportPath, officialImport, "\"--emit-sql-dir\"", "official feed SQL chunk directory flag");
requireSnippet(officialImportPath, officialImport, "\"--sql-offset\"", "official feed SQL export window offset");
requireSnippet(officialImportPath, officialImport, "\"--sql-limit\"", "official feed SQL export window limit");
requireSnippet(officialImportPath, officialImport, "\"--sql-chunk-size\"", "official feed SQL chunk size flag");
requireSnippet(officialImportPath, officialImport, "\"--sql-payload-format\"", "official feed SQL payload format flag");
requireSnippet(officialImportPath, officialImport, "jsonb_to_recordset", "official feed compact SQL JSON import");
requireSnippet(officialImportPath, officialImport, "function compactSqlPayloadRow", "official feed compact SQL payload");
requireSnippet(officialImportPath, officialImport, "splitIngredientStatement", "official feed shared ingredient parser");
requireSnippet(officialImportPath, officialImport, "public.catalog_split_ingredient_statement", "official feed SQL uses balanced ingredient parser");
requireSnippet(officialImportPath, officialImport, "convert_from(decode", "official feed base64 SQL payload");
requireSnippet(officialImportPath, officialImport, "toString(\"hex\")", "official feed hex SQL payload");
requireSnippet(officialImportPath, officialImport, "[\"base64\", \"hex\"]", "official feed accepts base64 and hex SQL payloads");
requireSnippet(officialImportPath, officialImport, "WITH payloads(row_number, expected_md5, payload_hex) AS", "official feed compact hex MCP group payloads");
requireSnippet(officialImportPath, officialImport, "decoded_payloads", "official feed compact hex MCP group decode step");
requireSnippet(officialImportPath, officialImport, "ON CONFLICT (cache_key) DO UPDATE", "official feed SQL upsert conflict handling");
requireSnippet(officialImportPath, officialImport, "upsert_catalog_product_feed", "official feed RPC SQL export uses catalog import RPC");
requireSnippet(officialImportPath, officialImport, "9999-refresh-catalog-acquisition-queue.sql", "official feed chunk export writes acquisition refresh SQL");
requireSnippet(officialImportPath, officialImport, "[\"product_line\", \"productLine\"]", "official feed product-line header");
requireSnippet(officialImportPath, officialImport, "[\"flavor\", \"flavor\"]", "official feed flavor header");
requireSnippet(officialImportPath, officialImport, "[\"package_size\", \"packageSize\"]", "official feed package-size header");
requireSnippet(officialImportPath, officialImport, "gtin: gtin || null", "official feed GTIN upsert");
requireSnippet(officialImportPath, officialImport, "product_line: productLine || null", "official feed product-line upsert");
requireSnippet(officialImportPath, officialImport, "flavor: flavor || null", "official feed flavor upsert");
requireSnippet(officialImportPath, officialImport, "pet_type: petType", "official feed pet_type");
requireSnippet(officialImportPath, officialImport, "--source-quality", "official feed source-quality argument");
requireSnippet(officialImportPath, officialImport, "--ingredient-verification", "official feed ingredient verification argument");
requireSnippet(officialImportPath, officialImport, "--image-verification", "official feed image verification argument");
requireSnippet(officialImportPath, officialImport, "source_quality: rowSourceQuality", "official feed source provenance upsert");
requireSnippet(officialImportPath, officialImport, "ingredient_verification_status: rowIngredientVerification", "official feed ingredient provenance upsert");
requireSnippet(officialImportPath, officialImport, "rpcName = \"upsert_catalog_product_feed\"", "official feed service-role import defaults to audited RPC");
requireSnippet(officialImportPath, officialImport, "client.rpc(rpcName", "official feed import can target an explicit RPC");
requireSnippet(officialImportPath, officialImport, "\"--rpc-name\"", "official feed import explicit RPC flag");
requireSnippet(officialImportPath, officialImport, "\"--import-key\"", "official feed import one-time RPC key flag");
requireSnippet(officialImportPath, officialImport, "\"--use-anon-key\"", "official feed import temporary anon-key RPC mode");
requireSnippet(officialImportPath, officialImport, "\"--skip-acquisition-refresh\"", "official feed import can suppress queue refresh for controlled RPC imports");
requireSnippet(officialImportPath, officialImport, "payload: rows", "official feed RPC payload comes from normalized disk rows");
requireSnippet(officialImportPath, officialImport, "updateCatalogAcquisitionQueue", "official feed import refreshes acquisition queue");

const officialImportAllPath = "scripts/catalog-official-feed-import-all.mjs";
const officialImportAll = read(officialImportAllPath);
requireSnippet(officialImportAllPath, officialImportAll, "OFFICIAL_IMPORT_SCRIPT", "bulk official feed runner delegates to audited single-feed importer");
requireSnippet(officialImportAllPath, officialImportAll, "\"--execute\"", "bulk official feed runner requires explicit execute flag");
requireSnippet(officialImportAllPath, officialImportAll, "\"--dry-run\"", "bulk official feed runner defaults to dry-run preflight");
requireSnippet(officialImportAllPath, officialImportAll, "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", "bulk official feed runner service-role guard");
requireSnippet(officialImportAllPath, officialImportAll, "PROBE_OR_TEST_RE", "bulk official feed runner skips probe/test directories by default");
requireSnippet(officialImportAllPath, officialImportAll, "--skip-acquisition-refresh", "bulk official feed runner suppresses per-feed acquisition refresh");
requireSnippet(officialImportAllPath, officialImportAll, "\"--rpc-name\"", "bulk official feed runner forwards explicit RPC flag");
requireSnippet(officialImportAllPath, officialImportAll, "\"--import-key\"", "bulk official feed runner forwards import key flag");
requireSnippet(officialImportAllPath, officialImportAll, "\"--use-anon-key\"", "bulk official feed runner supports temporary anon-key RPC mode");
requireSnippet(officialImportAllPath, officialImportAll, "Skipping final acquisition refresh for anon-key RPC import", "bulk official feed runner avoids privileged refresh with anon RPC imports");
requireSnippet(officialImportAllPath, officialImportAll, "updateCatalogAcquisitionQueue", "bulk official feed runner refreshes acquisition queue once after execute");
requireSnippet(officialImportAllPath, officialImportAll, "expected_brand_terms", "bulk official feed runner preserves staged expected brand terms");
requireSnippet(officialImportAllPath, officialImportAll, "--expected-brand", "bulk official feed runner forwards expected brand guards");
requireSnippet(officialImportAllPath, officialImportAll, "requiredSourceUrlPattern", "bulk official feed runner reads source URL pattern guards");
requireSnippet(officialImportAllPath, officialImportAll, "--required-source-url-pattern", "bulk official feed runner forwards source URL pattern guards");

const authorizedFeedDropImportPath = "scripts/catalog-authorized-feed-drop-import.mjs";
const authorizedFeedDropImport = read(authorizedFeedDropImportPath);
requireSnippet(authorizedFeedDropImportPath, authorizedFeedDropImport, "inputs/catalog-authorized-feeds", "authorized feed drop default input directory");
requireSnippet(authorizedFeedDropImportPath, authorizedFeedDropImport, "outputs/catalog-authorized-feed-imports", "authorized feed drop default output directory");
requireSnippet(authorizedFeedDropImportPath, authorizedFeedDropImport, "catalog-official-feed-import.mjs", "authorized feed drop delegates guarded official importer");
requireSnippet(authorizedFeedDropImportPath, authorizedFeedDropImport, "--emit-sql-rpc", "authorized feed drop emits guarded SQL RPC chunks by default");
requireSnippet(authorizedFeedDropImportPath, authorizedFeedDropImport, "--dry-run", "authorized feed drop supports validation-only mode");
requireSnippet(authorizedFeedDropImportPath, authorizedFeedDropImport, "--expected-brand", "authorized feed drop forwards expected-brand guards");
requireSnippet(authorizedFeedDropImportPath, authorizedFeedDropImport, "retail\\s+catalog", "authorized feed drop does not force fake broad-retailer brand guards");
requireSnippet(authorizedFeedDropImportPath, authorizedFeedDropImport, "-retail-catalog", "authorized feed drop detects broad-retailer source slugs");
requireSnippet(authorizedFeedDropImportPath, authorizedFeedDropImport, "summary.json", "authorized feed drop writes audit summary");

const authorizedFeedRequestPackPath = "scripts/catalog-authorized-feed-request-pack.mjs";
const authorizedFeedRequestPack = read(authorizedFeedRequestPackPath);
requireSnippet(authorizedFeedRequestPackPath, authorizedFeedRequestPack, "--write-input-dropzone", "authorized feed request pack can scaffold input drop zones");
requireSnippet(authorizedFeedRequestPackPath, authorizedFeedRequestPack, "inputs/catalog-authorized-feeds", "authorized feed request pack default input drop zone");
requireSnippet(authorizedFeedRequestPackPath, authorizedFeedRequestPack, "feed.csv.template", "authorized feed request pack writes ignored template files");
requireSnippet(authorizedFeedRequestPackPath, authorizedFeedRequestPack, "writeInputDropzone", "authorized feed request pack source intake writer");
requireSnippet(authorizedFeedRequestPackPath, authorizedFeedRequestPack, "dropzoneRootReadme", "authorized feed request pack root intake README");
requireSnippet(authorizedFeedRequestPackPath, authorizedFeedRequestPack, "cleanPackOutput", "authorized feed request pack clears stale generated artifacts");

const marketLeaderRunPath = "scripts/catalog-market-leader-run.mjs";
const marketLeaderRun = read(marketLeaderRunPath);
requireSnippet(marketLeaderRunPath, marketLeaderRun, "--write-input-dropzone", "market-leader restricted pack scaffolds input drop zones");
requireSnippet(marketLeaderRunPath, marketLeaderRun, "--input-dropzone-dir", "market-leader restricted pack supports configurable input drop zone");
requireSnippet(marketLeaderRunPath, marketLeaderRun, "inputs/catalog-authorized-feeds", "market-leader restricted pack default input drop zone");

const missingSourceUrlImportPath = "scripts/catalog-import-missing-source-urls.mjs";
const missingSourceUrlImport = read(missingSourceUrlImportPath);
requireSnippet(missingSourceUrlImportPath, missingSourceUrlImport, "fetchLiveSourceUrls", "missing source URL importer compares live catalog first");
requireSnippet(missingSourceUrlImportPath, missingSourceUrlImport, "SUPABASE_SERVICE_ROLE_KEY", "missing source URL importer requires service role for writes");
requireSnippet(missingSourceUrlImportPath, missingSourceUrlImport, "dry_run: dryRun || !canImport", "missing source URL importer fails closed without service role");
requireSnippet(missingSourceUrlImportPath, missingSourceUrlImport, "upsert_catalog_product_feed", "missing source URL importer uses audited feed RPC");
requireSnippet(missingSourceUrlImportPath, missingSourceUrlImport, "wantedUrls", "missing source URL importer can limit to reviewed URLs");

const missingSourceUrlRpcSqlExportPath = "scripts/catalog-export-missing-source-url-rpc-sql.mjs";
const missingSourceUrlRpcSqlExport = read(missingSourceUrlRpcSqlExportPath);
requireSnippet(missingSourceUrlRpcSqlExportPath, missingSourceUrlRpcSqlExport, "fetchLiveSourceUrls", "missing source URL RPC SQL exporter compares live catalog first");
requireSnippet(missingSourceUrlRpcSqlExportPath, missingSourceUrlRpcSqlExport, "expected_md5", "missing source URL RPC SQL exporter emits guarded payload hashes");
requireSnippet(missingSourceUrlRpcSqlExportPath, missingSourceUrlRpcSqlExport, "upsert_catalog_product_feed", "missing source URL RPC SQL exporter uses audited feed RPC");

const pageFeedExtractPath = "scripts/catalog-page-feed-extract.mjs";
const pageFeedExtract = read(pageFeedExtractPath);
requireSnippet(pageFeedExtractPath, pageFeedExtract, "application\\/ld\\+json", "page feed extractor JSON-LD parser");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractIngredients", "page feed extractor ingredient section parser");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractMarsNutritionImageIngredients", "page feed extractor Mars nutrition-image OCR ingredient support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function marsNutritionIngredientLabelStartIndex", "page feed extractor supports inline Mars Ingredients labels after marketing text");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function isMarsNutritionIngredientLead", "page feed extractor validates Mars inline ingredient labels before accepting OCR text");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "from around the world\\s+ingredients", "page feed extractor rejects Mars marketing text before ingredient labels");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "Guaranteed Analysis", "page feed extractor Mars OCR support requires analysis boundary");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractGuaranteedAnalysis", "page feed extractor guaranteed analysis parser");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function parseWindowJson", "page feed extractor window JSON parser");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "\\bdots\\b", "page feed extractor removes cosmetic expanded-text ellipses");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "<\\/?span", "page feed extractor preserves inline expanded ingredient words");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "FORCE_HTTPS_HOSTS", "page feed extractor upgrades known HTTPS-capable official hosts");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "PAGE_DATA_CACHE", "page feed extractor caches Purina Gatsby page-data");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function pageDataUrlFor", "page feed extractor builds Purina Gatsby page-data URLs");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function ingredientNamesFromGatsbyNode", "page feed extractor reads Purina Gatsby ingredient relationships");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function officialLabelPdfIngredients", "page feed extractor official label PDF fallback");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function officialPagePdfIngredients", "page feed extractor official same-page ingredient PDF fallback");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function officialIngredientPdfUrlFromHtml", "page feed extractor discovers official full-ingredient PDF links");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "sameHostUrl", "page feed extractor keeps full-ingredient PDF evidence same-host");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "full\\s+ingredient\\s+list", "page feed extractor requires explicit full-ingredient PDF label");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "label_deck", "page feed extractor reads Purina official label deck URLs");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "application/pdf", "page feed extractor fetches official label PDFs as PDF content");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "WOOF_PYTHON_BIN", "page feed extractor supports configured PDF text extraction runtime");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "ingredient_source_url", "page feed extractor emits ingredient evidence URL");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function bundleFormulasFromGatsbyNode", "page feed extractor reads Purina Gatsby variety-pack formulas");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "bundle_formulas", "page feed extractor exports Purina formula-level bundle evidence");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "ingredientsJson", "page feed extractor manufacturer ingredient JSON support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "guaranteedAnalysisHtml", "page feed extractor manufacturer analysis HTML support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function additionalPropertyValue", "page feed extractor JSON-LD additionalProperty support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "ingredientsAnalysis", "page feed extractor Nulo ingredient analysis support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "ingredientsAnalysisTable", "page feed extractor Nulo guaranteed analysis support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function hasSupplementalFeedingEvidence", "page feed extractor supplemental feeding guard");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "feedingGuidelines", "page feed extractor reads official feeding guidance");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "nutritionStatement", "page feed extractor reads official nutrition statement");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "intermittent or supplemental feeding only", "page feed extractor rejects supplemental feeding evidence");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "hasSupplementalFeedingEvidence(feedingEvidence, availabilityEvidence)", "page feed supplemental guard uses feeding and availability evidence");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function hasCompleteNutritionEvidence", "page feed extractor keeps AAFCO-complete foods despite qualified feeding caveats");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "formulated to meet", "page feed extractor recognizes AAFCO complete-food evidence");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractIngredientList", "page feed extractor list ingredient support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "data-accordion-value", "page feed extractor accordion ingredient support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractOpenFarmIngredientsModal", "page feed extractor Open Farm complete-ingredients modal support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "G\\.A\\.P\\.\\s*Step", "page feed extractor normalizes Open Farm sourcing certification prefixes");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractProductIngredientsList", "page feed extractor WooCommerce product ingredient-list support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "product-ingredients-list", "page feed extractor FirstMate ingredient list support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractIngredientDescriptionText", "page feed extractor Jinx ingredient-description support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractIngredientItemList", "page feed extractor RAWZ ingredient-item support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function productPageUrl", "page feed extractor canonical product URL guard");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "where-to-buy|store-locator|stores?", "page feed extractor skips non-product JSON-LD URLs");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function inferPetTypeFromProductClass", "page feed extractor WooCommerce product class pet-type support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function inferPetTypeFromAafcoStatement", "page feed extractor AAFCO pet-type support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "life_stage: firstText(petcoEvidence.lifeStage, inferLifeStage(productName, productUrl, productDescription, category, shopifyTagText(shopifyProduct)))", "page feed extractor derives life stage from source identity context");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractHeadingParagraphIngredientText", "page feed extractor heading/tab ingredient support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractPageImage", "page feed extractor product carousel image support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function imageFromSrcSet", "page feed extractor responsive srcset image support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "__responsive_", "page feed extractor prefers responsive product thumbnails");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractGuaranteedAnalysisHtml", "page feed extractor guaranteed-analysis tab support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractControlledTabBlock", "page feed extractor controlled tab panel support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "aria-controls", "page feed extractor maps tab titles to controlled panels");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractInlineNutrientRows", "page feed extractor inline guaranteed-analysis row support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function decodeEscapedHtmlFragment", "page feed extractor decodes escaped retailer payloads");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractPetSmartEscapedIngredients", "page feed extractor PetSmart escaped ingredients support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractPetSmartEscapedGuaranteedAnalysis", "page feed extractor PetSmart escaped guaranteed-analysis support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractPetcoEvidence", "page feed extractor Petco rendered-content support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function parseSnapshotSource", "page feed extractor browser snapshot support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "petco-wholehearted", "page feed extractor Petco WholeHearted SKU cache key support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "sourceOverrides", "page feed extractor snapshot override passthrough");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractNextDataProduct", "page feed extractor Next data product support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "allIngredients", "page feed extractor Freshpet exact ingredient support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractInlineIngredientList", "page feed extractor Fromm inline ingredient support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractFrommGuaranteedAnalysis", "page feed extractor Fromm guaranteed-analysis support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractIngredientsTabPane", "page feed extractor tab-pane ingredient support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "ingredients-tab-pane", "page feed extractor Nutrish ingredient tab-pane support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "ingredients-accordion-panel", "page feed extractor Nutrish ingredient accordion support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractIngredientClassBlock", "page feed extractor Nutrish ingredient class block support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "ingredients-pane", "page feed extractor TIKI PETS/WooCommerce ingredient tab-pane support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "analysis-and-calorie-pane", "page feed extractor TIKI PETS/WooCommerce analysis tab-pane support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function extractTableRows", "page feed extractor guaranteed-analysis table support");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function inferBrandFromUrl", "page feed extractor source URL brand inference");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "diamondpet.com", "page feed extractor Diamond Pet Foods brand inference");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function isPlausibleIngredientStatement", "page feed extractor rejects marketing copy as ingredients");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "where to buy|nutritional facts|nutritional info", "page feed extractor rejects page chrome as ingredient evidence");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "what's inside|where to buy|nutritional facts|nutritional info|nutritional information", "page feed extractor rejects Petcurean marketing-copy ingredient evidence");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "made without|guaranteed levels", "page feed extractor rejects benefit marketing as ingredient evidence");
forbidSnippet(pageFeedExtractPath, pageFeedExtract, "source of omega", "page feed extractor must allow valid ingredient parentheticals like source of Omega 3 Fatty Acids");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "never any corn", "page feed extractor rejects Jinx marketing fragments as ingredient evidence");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function firstIngredientText", "page feed extractor gates ingredient candidates");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "\"--continue-on-error\"", "page feed extractor explicit fetch-error continuation mode");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "REQUIRED_VERIFIED_FIELDS", "page feed extractor verified-field guard");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "WoofCatalogVerifier/1.0", "page feed extractor user agent");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "product_image_url", "page feed extractor image output");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "ingredient_statement", "page feed extractor ingredient output");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "getArg(\"--brand\")", "page feed extractor source brand fallback");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "\"--prefer-page-brand\"", "page feed extractor can preserve page-level source brand");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "NON_COMPLETE_FOOD_IDENTITY_PATTERNS", "page feed non-complete product identity patterns");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "dental\\s+(?:treat", "page feed keeps complete dental kibble while excluding dental treats");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "variety[-\\s]*packs?|bundles?|samplers?|samples?|sample[-\\s]*packs?|starter[-\\s]*(?:packs?|kits?)|multi[-\\s]*packs?|multipacks?", "page feed marks samples and non-single-formula products non-complete");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "blue bits", "page feed marks Blue Bits treats non-complete");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "k9\\s+mobility\\s+ultra", "page feed marks Healthy Dogma K9 Mobility Ultra non-complete");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function inferIsCompleteFood", "page feed complete-food inference");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function canonicalSourceBrand", "page feed canonical source brand helper");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "Hill's Science Diet", "page feed canonicalizes Hill's Science Diet source rows");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "Hill's Prescription Diet", "page feed canonicalizes Hill's Prescription Diet source rows");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "stellaandchewys\\.com", "page feed canonicalizes Stella & Chewy's source brand");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "Stella & Chewy's", "page feed canonical Stella & Chewy's shelf brand");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "royalcanin\\.com", "page feed canonicalizes Royal Canin source brand");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "nutro\\.com", "page feed canonicalizes Nutro source brand");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "farmina\\.com", "page feed canonicalizes Farmina source brand");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "tikipets\\.com", "page feed canonicalizes TIKI PETS source brand");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "function isKnownNonCompleteSourceProduct", "page feed known source non-complete helper");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "old-mother-hubbard", "page feed marks Old Mother Hubbard source rows non-complete");
requireSnippet(pageFeedExtractPath, pageFeedExtract, "whimzees", "page feed marks WHIMZEES source rows non-complete");

const petcoSnapshotExtract = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-petco-snapshot.json",
  "--brand",
  "WholeHearted",
  "--json",
  "--strict",
], {
  encoding: "utf8",
});

if (petcoSnapshotExtract.status !== 0) {
  fail(`Petco snapshot page extraction failed: ${petcoSnapshotExtract.stderr || petcoSnapshotExtract.stdout}`);
} else {
  requireSnippet("Petco snapshot page extraction output", petcoSnapshotExtract.stdout, "petco-wholehearted:3001041", "Petco snapshot stable cache key");
  requireSnippet("Petco snapshot page extraction output", petcoSnapshotExtract.stdout, "WholeHearted All Life Stages Chicken and Brown Rice Recipe Dry Dog Food", "Petco snapshot product name");
  requireSnippet("Petco snapshot page extraction output", petcoSnapshotExtract.stdout, "3001041-center-1", "Petco snapshot verified product image URL");
  requireSnippet("Petco snapshot page extraction output", petcoSnapshotExtract.stdout, "Crude Protein", "Petco snapshot guaranteed analysis");
}

const petcoSnapshotImportBatchPath = "scripts/catalog-petco-snapshot-import-batch.mjs";
const petcoSnapshotImportBatch = read(petcoSnapshotImportBatchPath);
requireSnippet(petcoSnapshotImportBatchPath, petcoSnapshotImportBatch, "catalog-page-feed-extract.mjs", "Petco snapshot batch delegates page extraction");
requireSnippet(petcoSnapshotImportBatchPath, petcoSnapshotImportBatch, "catalog-official-feed-import.mjs", "Petco snapshot batch delegates official feed importer");
requireSnippet(petcoSnapshotImportBatchPath, petcoSnapshotImportBatch, "retailer_verified", "Petco snapshot batch marks retailer-verified evidence");
requireSnippet(petcoSnapshotImportBatchPath, petcoSnapshotImportBatch, "^https://www\\\\.petco\\\\.com/product/", "Petco snapshot batch requires Petco product URLs");
requireSnippet(petcoSnapshotImportBatchPath, petcoSnapshotImportBatch, "--emit-sql-rpc", "Petco snapshot batch emits audited RPC SQL by default");
requireSnippet(petcoSnapshotImportBatchPath, petcoSnapshotImportBatch, "function parseTextSnapshot", "Petco snapshot batch accepts rendered text snapshots");
requireSnippet(petcoSnapshotImportBatchPath, petcoSnapshotImportBatch, "Array.isArray(parsed)", "Petco snapshot batch accepts browser-exported JSON arrays");

const retailerSnapshotImportBatchPath = "scripts/catalog-retailer-snapshot-import-batch.mjs";
const retailerSnapshotImportBatch = read(retailerSnapshotImportBatchPath);
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "catalog-page-feed-extract.mjs", "retailer snapshot batch delegates page extraction");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "catalog-official-feed-import.mjs", "retailer snapshot batch delegates official feed importer");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "retailer_verified", "retailer snapshot batch marks retailer-verified evidence");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "RETAILER_URL_PATTERNS", "retailer snapshot batch has retailer URL allow-list");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "petco", "retailer snapshot batch supports Petco");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "petsmart", "retailer snapshot batch supports PetSmart");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "chewy", "retailer snapshot batch supports Chewy");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "walmart", "retailer snapshot batch supports Walmart");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "--emit-sql-rpc", "retailer snapshot batch emits audited RPC SQL by default");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "function parseTextSnapshot", "retailer snapshot batch accepts rendered text snapshots");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "Array.isArray(parsed)", "retailer snapshot batch accepts browser-exported JSON arrays");
requireSnippet(retailerSnapshotImportBatchPath, retailerSnapshotImportBatch, "required-source-url-pattern", "retailer snapshot batch exposes URL allow-list override");
requireSnippet("scripts/petco-browser-snapshot-collector.js", read("scripts/petco-browser-snapshot-collector.js"), "Woof Petco snapshot copied to clipboard.", "Petco browser snapshot collector");
requireSnippet("scripts/petco-browser-batch-snapshot-collector.js", read("scripts/petco-browser-batch-snapshot-collector.js"), "Woof Petco batch copied to clipboard", "Petco browser batch snapshot collector");

const petcoSnapshotBatchImport = spawnSync(process.execPath, [
  petcoSnapshotImportBatchPath,
  "--snapshot",
  "scripts/fixtures/catalog-product-petco-snapshot.json",
  "--brand",
  "WholeHearted",
  "--output-dir",
  `${tempRoot}/woof-petco-snapshot-import-check`,
], {
  encoding: "utf8",
});

if (petcoSnapshotBatchImport.status !== 0) {
  fail(`Petco snapshot batch import failed: ${petcoSnapshotBatchImport.stderr || petcoSnapshotBatchImport.stdout}`);
} else {
  requireSnippet("Petco snapshot batch import output", petcoSnapshotBatchImport.stdout, "\"snapshot_count\": 1", "Petco snapshot batch input count");
  requireSnippet("Petco snapshot batch import output", petcoSnapshotBatchImport.stdout, "\"rows\": 1", "Petco snapshot batch feed row count");
  requireSnippet("Petco snapshot batch import output", petcoSnapshotBatchImport.stdout, "\"stable_cache_key_rows\": 1", "Petco snapshot batch stable cache key count");
}

const retailerSnapshotBatchImport = spawnSync(process.execPath, [
  retailerSnapshotImportBatchPath,
  "--snapshot",
  "scripts/fixtures/catalog-product-petco-snapshot.json",
  "--brand",
  "WholeHearted",
  "--source",
  "petco-wholehearted",
  "--retailer",
  "petco",
  "--output-dir",
  `${tempRoot}/woof-retailer-snapshot-import-check`,
], {
  encoding: "utf8",
});

if (retailerSnapshotBatchImport.status !== 0) {
  fail(`Retailer snapshot batch import failed: ${retailerSnapshotBatchImport.stderr || retailerSnapshotBatchImport.stdout}`);
} else {
  requireSnippet("Retailer snapshot batch import output", retailerSnapshotBatchImport.stdout, "\"snapshot_count\": 1", "retailer snapshot batch input count");
  requireSnippet("Retailer snapshot batch import output", retailerSnapshotBatchImport.stdout, "\"rows\": 1", "retailer snapshot batch feed row count");
  requireSnippet("Retailer snapshot batch import output", retailerSnapshotBatchImport.stdout, "\"source_url_rows_matching_required_pattern\": 1", "retailer snapshot batch source URL allow-list count");
  requireSnippet("Retailer snapshot batch import output", retailerSnapshotBatchImport.stdout, "\"stable_cache_key_rows\": 1", "retailer snapshot batch stable cache key count");
}

const petcoTextSnapshot = JSON.parse(read("scripts/fixtures/catalog-product-petco-snapshot.json"));
const petcoArraySnapshotPath = `${tempRoot}/woof-petco-snapshot-array-fixture.json`;
fs.writeFileSync(petcoArraySnapshotPath, `${JSON.stringify([petcoTextSnapshot, petcoTextSnapshot], null, 2)}\n`, "utf8");

const petcoArraySnapshotBatchImport = spawnSync(process.execPath, [
  petcoSnapshotImportBatchPath,
  "--snapshot",
  petcoArraySnapshotPath,
  "--brand",
  "WholeHearted",
  "--output-dir",
  `${tempRoot}/woof-petco-array-snapshot-import-check`,
], {
  encoding: "utf8",
});

if (petcoArraySnapshotBatchImport.status !== 0) {
  fail(`Petco array snapshot batch import failed: ${petcoArraySnapshotBatchImport.stderr || petcoArraySnapshotBatchImport.stdout}`);
} else {
  requireSnippet("Petco array snapshot batch import output", petcoArraySnapshotBatchImport.stdout, "\"snapshot_count\": 2", "Petco array snapshot batch input count");
  requireSnippet("Petco array snapshot batch import output", petcoArraySnapshotBatchImport.stdout, "\"rows\": 2", "Petco array snapshot expanded feed rows");
}

const petcoTextSnapshotPath = `${tempRoot}/woof-petco-snapshot-text-fixture.txt`;
fs.writeFileSync(petcoTextSnapshotPath, [
  `source_url: ${petcoTextSnapshot.source_url}`,
  `product_image_url: ${petcoTextSnapshot.product_image_url}`,
  "---",
  petcoTextSnapshot.text,
  "",
].join("\n"), "utf8");

const petcoTextSnapshotBatchImport = spawnSync(process.execPath, [
  petcoSnapshotImportBatchPath,
  "--snapshot",
  petcoTextSnapshotPath,
  "--brand",
  "WholeHearted",
  "--output-dir",
  `${tempRoot}/woof-petco-text-snapshot-import-check`,
], {
  encoding: "utf8",
});

if (petcoTextSnapshotBatchImport.status !== 0) {
  fail(`Petco text snapshot batch import failed: ${petcoTextSnapshotBatchImport.stderr || petcoTextSnapshotBatchImport.stdout}`);
} else {
  requireSnippet("Petco text snapshot batch import output", petcoTextSnapshotBatchImport.stdout, "\"snapshot_count\": 1", "Petco text snapshot batch input count");
  requireSnippet("Petco text snapshot batch import output", petcoTextSnapshotBatchImport.stdout, "\"stable_cache_key_rows\": 1", "Petco text snapshot stable cache key count");
}

const sourceUrlDiscoveryPath = "scripts/catalog-source-url-discovery.mjs";
const sourceUrlDiscovery = read(sourceUrlDiscoveryPath);
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "catalog-source-targets.json", "source URL discovery source-target manifest");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "function extractSitemapUrls", "source URL discovery sitemap parser");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "function extractHtmlLinks", "source URL discovery collection-page parser");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "PRODUCT_PATH_PATTERNS", "source URL discovery product URL scoring");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "EXCLUDED_PATH_PATTERNS", "source URL discovery noise filters");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "^\\/(?:dogs|cats)\\/shop", "source URL discovery Purina product-page pattern");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "/\\/pro-plan\\/products", "source URL discovery Pro Plan category crawl/exclude pattern");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "fancy-feast|friskies|purina-one|beneful", "source URL discovery Purina brand collection crawl/exclude pattern");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "LOCALE_PREFIX_PATTERN", "source URL discovery locale prefix guard");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "function nonUsLocaleCountry", "source URL discovery non-US locale detection");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "\"--allow-non-us-locales\"", "source URL discovery explicit non-US locale override");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "CRAWL_PATH_PATTERNS", "source URL discovery crawl seed patterns");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "Search-UpdateGrid", "source URL discovery Salesforce Commerce Cloud grid pagination crawl pattern");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "data-url", "source URL discovery Salesforce Commerce Cloud pagination data-url extraction");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "function shouldCrawlUrl", "source URL discovery crawl seed detection");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "\"--max-crawl-pages\"", "source URL discovery crawl limit argument");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "\"--required-url-pattern\"", "source URL discovery pre-slice URL allow-pattern");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "\"--excluded-url-pattern\"", "source URL discovery pre-slice URL exclude-pattern");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "\"--shopify-product-type-pattern\"", "source URL discovery Shopify product type include filter");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "\"--shopify-excluded-product-type-pattern\"", "source URL discovery Shopify product type exclude filter");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "productMatchesMetadataFilters", "source URL discovery metadata filter helper");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "\"--extra-target-url\"", "source URL discovery accepts additional collection entry points");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "requiredUrlPattern", "source URL discovery required pattern option");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "excludedUrlPattern", "source URL discovery excluded pattern option");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "function nonNegativeInteger", "source URL discovery permits zero nested sitemaps");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "queueCrawl", "source URL discovery crawls category pages without outputting them");
requireSnippet(sourceUrlDiscoveryPath, sourceUrlDiscovery, "WoofCatalogVerifier/1.0", "source URL discovery user agent");

const acquisitionQueueUtilsPath = "scripts/catalog-acquisition-queue-utils.mjs";
const acquisitionQueueUtils = read(acquisitionQueueUtilsPath);
requireSnippet(acquisitionQueueUtilsPath, acquisitionQueueUtils, "refresh_catalog_acquisition_queue", "shared acquisition refresh helper");
requireSnippet(acquisitionQueueUtilsPath, acquisitionQueueUtils, "reconcile_catalog_acquisition_queue_batch", "shared acquisition batched reconcile helper");
requireSnippet(acquisitionQueueUtilsPath, acquisitionQueueUtils, "DEFAULT_RECONCILE_LIMIT = 100", "shared acquisition safer batch default");
requireSnippet(acquisitionQueueUtilsPath, acquisitionQueueUtils, "--skip-acquisition-refresh", "shared acquisition refresh skip flag");
requireSnippet(acquisitionQueueUtilsPath, acquisitionQueueUtils, "--skip-acquisition-reconcile", "shared acquisition reconcile skip flag");
requireSnippet(acquisitionQueueUtilsPath, acquisitionQueueUtils, "--acquisition-reconcile-batches", "shared acquisition reconcile batch option");
requireSnippet(acquisitionQueueUtilsPath, acquisitionQueueUtils, "--acquisition-reconcile-limit", "shared acquisition reconcile limit option");

const completenessPath = "scripts/catalog-completeness-report.mjs";
const completeness = read(completenessPath);
requireSnippet(completenessPath, completeness, "DEFAULT_MIN_READY_PRODUCTS = 12000", "12k product readiness gate");
requireSnippet(completenessPath, completeness, "DEFAULT_MIN_IMAGE_RATE = 0.9", "catalog image readiness gate");
requireSnippet(completenessPath, completeness, "DEFAULT_MIN_DOG_PRODUCTS = 5000", "dog catalog readiness gate");
requireSnippet(completenessPath, completeness, "DEFAULT_MIN_CAT_PRODUCTS = 3000", "cat catalog readiness gate");
requireSnippet(completenessPath, completeness, "DEFAULT_MAX_UNKNOWN_PET_TYPE_RATE = 0.05", "unknown pet-type readiness gate");
requireSnippet(completenessPath, completeness, "DEFAULT_MIN_VERIFIED_INGREDIENT_RATE = 1", "verified ingredient readiness gate");
requireSnippet(completenessPath, completeness, "DEFAULT_MIN_VERIFIED_IMAGE_RATE = 0.95", "verified image readiness gate");
requireSnippet(completenessPath, completeness, "DEFAULT_MIN_STRUCTURED_IDENTITY_RATE = 0.95", "structured identity readiness gate");
requireSnippet(completenessPath, completeness, "DEFAULT_MAX_OPEN_QUEUE_ROWS = 0", "open acquisition queue release gate");
requireSnippet(completenessPath, completeness, "DEFAULT_MAX_OPEN_QUEUE_AFFECTED_PRODUCTS = 0", "open affected-product release gate");
requireSnippet(completenessPath, completeness, "row.cache_key", "catalog completeness uses cache key for pet-type inference");
requireSnippet(completenessPath, completeness, "row.source_url", "catalog completeness uses source URL for pet-type inference");
requireSnippet(completenessPath, completeness, "hasDog && !hasCat", "catalog completeness avoids ambiguous dog+cat inference");
requireSnippet(completenessPath, completeness, "function hasSourceEvidence", "catalog completeness source evidence guard");
requireSnippet(completenessPath, completeness, "function hasIngredientText", "catalog completeness ingredient text guard");
requireSnippet(completenessPath, completeness, "function hasStructuredIdentity", "catalog completeness structured identity guard");
requireSnippet(completenessPath, completeness, "&& hasIngredientText(row)", "verified ingredient gate requires exact ingredient text");
requireSnippet(completenessPath, completeness, "NULLIF(trim(food_form), '')\n      ) IS NOT NULL", "structured identity gate does not pass on package size alone");
forbidSnippet(completenessPath, completeness, "\"scan_preview\"", "scan preview is not verified product-image evidence");
requireSnippet(completenessPath, completeness, "product_events", "lookup gap report");
requireSnippet(completenessPath, completeness, "catalog_acquisition_queue", "open acquisition queue completeness gate");
requireSnippet(completenessPath, completeness, "catalog_verification_gap", "verification gap completeness evidence");
requireSnippet(completenessPath, completeness, "--min-dog-products", "dog catalog gate argument");
requireSnippet(completenessPath, completeness, "--min-cat-products", "cat catalog gate argument");
requireSnippet(completenessPath, completeness, "--max-unknown-pet-type-rate", "unknown pet-type gate argument");
requireSnippet(completenessPath, completeness, "--min-verified-ingredient-rate", "verified ingredient gate argument");
requireSnippet(completenessPath, completeness, "--min-verified-image-rate", "verified image gate argument");
requireSnippet(completenessPath, completeness, "--min-structured-identity-rate", "structured identity gate argument");
requireSnippet(completenessPath, completeness, "--max-open-queue-rows", "open acquisition queue gate argument");
requireSnippet(completenessPath, completeness, "--max-open-queue-affected-products", "open affected-product gate argument");

const verificationGapPath = "scripts/catalog-verification-gap-report.mjs";
const verificationGap = read(verificationGapPath);
requireSnippet(verificationGapPath, verificationGap, "Catalog verification gap report", "verification gap report title");
requireSnippet(verificationGapPath, verificationGap, "official/manufacturer ingredients", "official ingredient acquisition target");
requireSnippet(verificationGapPath, verificationGap, "verified product images", "verified image acquisition target");
requireSnippet(verificationGapPath, verificationGap, "brandRows", "brand-level acquisition priorities");
requireSnippet(verificationGapPath, verificationGap, "productRows", "product-level verification gaps");
requireSnippet(verificationGapPath, verificationGap, "lookupGaps", "recent lookup gap evidence");
requireSnippet(verificationGapPath, verificationGap, "catalog_verification_gap", "recent verification gap evidence");
requireSnippet(verificationGapPath, verificationGap, "maxNeedsVerifiedIngredientCount", "lookup-driven ingredient verification demand");
requireSnippet(verificationGapPath, verificationGap, "maxNeedsVerifiedImageCount", "lookup-driven image verification demand");
requireSnippet(verificationGapPath, verificationGap, "function hasSourceEvidence", "verification gap source evidence guard");
forbidSnippet(verificationGapPath, verificationGap, "\"scan_preview\"", "scan preview is not verified product-image evidence");

const acquisitionQueuePath = "scripts/catalog-acquisition-queue.mjs";
const acquisitionQueue = read(acquisitionQueuePath);
requireSnippet(acquisitionQueuePath, acquisitionQueue, "Catalog acquisition queue", "acquisition queue report title");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "refresh_catalog_acquisition_queue", "acquisition queue refresh RPC call");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "reconcile_catalog_acquisition_queue_batch", "acquisition queue batched reconcile RPC call");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "DEFAULT_RECONCILE_LIMIT = 100", "acquisition queue safer batch default");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "--no-reconcile", "acquisition queue reconcile opt-out");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "--reconcile-batches", "acquisition queue batched reconcile CLI batches");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "--reconcile-limit", "acquisition queue batched reconcile CLI limit");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "--csv", "acquisition queue CSV worklist export");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "sourceRecommendation", "acquisition queue source-target recommendations");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "currentSources", "acquisition queue current source summary");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "SOURCE_TARGETS_PATH", "acquisition queue source manifest");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "sourceOwner", "acquisition queue source owner output");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "sourceTargetUrl", "acquisition queue source target URL output");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "target.aliases", "acquisition queue source alias mapping");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "official/manufacturer ingredients", "acquisition queue ingredient need copy");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "verified product image", "acquisition queue image need copy");
requireSnippet(acquisitionQueuePath, acquisitionQueue, "SUPABASE_SERVICE_ROLE_KEY", "acquisition queue service role requirement");

const duplicateSweepPath = "scripts/catalog-verified-duplicate-sweep.mjs";
const duplicateSweep = read(duplicateSweepPath);
requireSnippet(duplicateSweepPath, duplicateSweep, "exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand", "verified duplicate sweep direct identity RPC");
requireSnippet(duplicateSweepPath, duplicateSweep, "DEFAULT_OPERATIONS = [\"identity\"]", "verified duplicate sweep defaults to direct identity only");
requireSnippet(duplicateSweepPath, duplicateSweep, "--include-legacy-search-closures", "verified duplicate sweep requires opt-in for legacy search closures");
requireSnippet(duplicateSweepPath, duplicateSweep, "Audit variants first", "verified duplicate sweep warns before legacy search closures");
requireSnippet(duplicateSweepPath, duplicateSweep, "catalog_duplicate_closure_audit", "verified duplicate sweep runs post-closure audit RPC");
requireSnippet(duplicateSweepPath, duplicateSweep, "--skip-audit", "verified duplicate sweep audit requires explicit opt-out");
requireSnippet(duplicateSweepPath, duplicateSweep, "Duplicate closure audit failed", "verified duplicate sweep fails on unsafe closures");
requireSnippet(duplicateSweepPath, duplicateSweep, "--audit-all-closures", "verified duplicate sweep can audit all automated closure functions");
requireSnippet(duplicateSweepPath, duplicateSweep, "exclude_verified_duplicate_legacy_catalog_rows_for_brand", "verified duplicate sweep exact duplicate RPC");
requireSnippet(duplicateSweepPath, duplicateSweep, "exclude_unknown_species_legacy_duplicate_rows_for_brand", "verified duplicate sweep unknown-species duplicate RPC");
requireSnippet(duplicateSweepPath, duplicateSweep, "exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand", "verified duplicate sweep alias duplicate RPC");
requireSnippet(duplicateSweepPath, duplicateSweep, "reconcile_catalog_acquisition_queue_strict_search_for_brand", "verified duplicate sweep optional strict reconcile RPC");
requireSnippet(duplicateSweepPath, duplicateSweep, "SUPABASE_SERVICE_ROLE_KEY", "verified duplicate sweep service role requirement");
requireSnippet(duplicateSweepPath, duplicateSweep, "Keep these statements separate if Supabase times out", "verified duplicate sweep SQL fallback avoids timeout-prone combined calls");
requireSnippet(duplicateSweepPath, duplicateSweep, "does not promote unverified ingredients", "verified duplicate sweep states no unverified promotion");
requireSnippet(duplicateSweepPath, duplicateSweep, "direct same-brand verified-ready rows", "verified duplicate sweep explains direct identity operation");
requireSnippet(duplicateSweepPath, duplicateSweep, "DEFAULT_PER_BRAND_LIMIT = 10", "verified duplicate sweep uses bounded per-brand default");

const acquisitionMatchAuditPath = "scripts/catalog-acquisition-match-audit-sql.mjs";
const acquisitionMatchAudit = read(acquisitionMatchAuditPath);
requireSnippet(acquisitionMatchAuditPath, acquisitionMatchAudit, "retail_or_community_alias_review", "acquisition match audit separates retail/community alias review rows");
requireSnippet(acquisitionMatchAuditPath, acquisitionMatchAudit, "legacy_ingredient_verification_status", "acquisition match audit includes legacy ingredient status");
requireSnippet(acquisitionMatchAuditPath, acquisitionMatchAudit, "matched_quality_state", "acquisition match audit verifies matched catalog quality");
requireSnippet(acquisitionMatchAuditPath, acquisitionMatchAudit, "matched_pd.cache_key = matched.cache_key", "acquisition match audit joins matched rows back to product_data");
requireSnippet(acquisitionMatchAuditPath, acquisitionMatchAudit, "proof_required", "acquisition match audit reports proof requirement");
requireSnippet(acquisitionMatchAuditPath, acquisitionMatchAudit, "matched_quality_state = 'verified_ready'", "acquisition match audit safe matches require verified-ready rows");
requireSnippet(acquisitionMatchAuditPath, acquisitionMatchAudit, "catalog_acquisition_food_form_terms_match", "acquisition match audit requires food-form match");
requireSnippet(acquisitionMatchAuditPath, acquisitionMatchAudit, "food_form_match", "acquisition match audit reports food-form match");
requireSnippet(acquisitionMatchAuditPath, acquisitionMatchAudit, "exact source-backed ingredient statement", "acquisition match audit preserves source-backed ingredient requirement");

const retailAliasCandidateAuditPath = "scripts/catalog-retail-alias-candidate-sql.mjs";
const retailAliasCandidateAudit = read(retailAliasCandidateAuditPath);
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "formula_alias_review_candidate", "retail alias audit separates formula review candidates");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "ambiguous_formula_alias_review", "retail alias audit separates ambiguous formula candidates");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "matched_quality_state = 'verified_ready'", "retail alias audit requires verified-ready matches");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "catalog_acquisition_alias_formula_terms_match", "retail alias audit checks exact formula-term guard");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "catalog_acquisition_food_form_terms_match", "retail alias audit checks food-form guard");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "food_form_guard_failed", "retail alias audit separates food-form failures");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "catalog_acquisition_size_terms_match", "retail alias audit checks size guard");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "source_guard_pass", "retail alias audit checks matched source evidence");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "exact source-backed ingredient statement", "retail alias audit preserves source-backed ingredient requirement");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "verified front image", "retail alias audit preserves image requirement");
requireSnippet(retailAliasCandidateAuditPath, retailAliasCandidateAudit, "This query does not update rows", "retail alias audit is dry-run only");

const retailAliasReviewPackPath = "scripts/catalog-retail-alias-review-pack.mjs";
const retailAliasReviewPack = read(retailAliasReviewPackPath);
requireSnippet(retailAliasReviewPackPath, retailAliasReviewPack, "catalog-retail-alias-candidate-sql.mjs", "retail alias review pack reuses guarded audit SQL");
requireSnippet(retailAliasReviewPackPath, retailAliasReviewPack, "retail-alias-samples.sql", "retail alias review pack emits sample export SQL");
requireSnippet(retailAliasReviewPackPath, retailAliasReviewPack, "retail-alias-summary.sql", "retail alias review pack emits summary SQL");
requireSnippet(retailAliasReviewPackPath, retailAliasReviewPack, "retail-alias-review.csv", "retail alias review pack emits review CSV template");
requireSnippet(retailAliasReviewPackPath, retailAliasReviewPack, "They never import ingredients, never mark rows verified-ready, and never close queue gaps", "retail alias review pack is read-only");
requireSnippet(retailAliasReviewPackPath, retailAliasReviewPack, "Do not copy ingredients from a retail/community row", "retail alias review pack blocks unsafe ingredient reuse");
requireSnippet(retailAliasReviewPackPath, retailAliasReviewPack, "exact source-backed ingredients and verified front images", "retail alias review pack preserves source-backed proof requirement");

const retailAliasReviewImportSqlPath = "scripts/catalog-retail-alias-review-import-sql.mjs";
const retailAliasReviewImportSql = read(retailAliasReviewImportSqlPath);
requireSnippet(retailAliasReviewImportSqlPath, retailAliasReviewImportSql, "catalog_quality_state", "retail alias review import verifies matched catalog quality");
requireSnippet(retailAliasReviewImportSqlPath, retailAliasReviewImportSql, "= 'verified_ready'", "retail alias review import requires verified-ready matched rows");
requireSnippet(retailAliasReviewImportSqlPath, retailAliasReviewImportSql, "proof_url", "retail alias review import requires proof URL");
requireSnippet(retailAliasReviewImportSqlPath, retailAliasReviewImportSql, "This SQL never imports ingredients from retail/community rows", "retail alias review import blocks unsafe ingredient reuse");
requireSnippet(retailAliasReviewImportSqlPath, retailAliasReviewImportSql, "retail_alias_review_closed_by", "retail alias review import records closure provenance");
requireSnippet(retailAliasReviewImportSqlPath, retailAliasReviewImportSql, "matched.source NOT IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr')", "retail alias review import blocks unverified matched sources");
requireSnippet(retailAliasReviewImportSqlPath, retailAliasReviewImportSql, "COALESCE(NULLIF(matched.source_url, ''), '') <> ''", "retail alias review import requires matched source URL");
requireSnippet(retailAliasReviewImportSqlPath, retailAliasReviewImportSql, "catalog_exclusion_reason = COALESCE", "retail alias review import excludes legacy duplicate rows");

const retailAliasAutoCloseSqlPath = "scripts/catalog-retail-alias-auto-close-sql.mjs";
const retailAliasAutoCloseSql = read(retailAliasAutoCloseSqlPath);
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "catalog-retail-alias-candidate-sql.mjs", "retail alias auto-close reuses guarded candidate audit");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "Default mode is dry-run", "retail alias auto-close defaults to dry-run");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "This SQL never imports ingredients from retail/community rows", "retail alias auto-close blocks unsafe ingredient reuse");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "formula_alias_review_candidate", "retail alias auto-close only considers single formula alias candidates");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "formula_candidate_count", "retail alias auto-close requires a single formula candidate");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "formula_candidate_identity_count", "retail alias auto-close requires a single formula identity");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "catalog_quality_state", "retail alias auto-close verifies matched catalog quality");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "= 'verified_ready'", "retail alias auto-close requires verified-ready matched rows");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "matched.source NOT IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr')", "retail alias auto-close blocks unverified matched sources");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "COALESCE(NULLIF(matched.source_url, ''), '') <> ''", "retail alias auto-close requires matched source URL");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "catalog_acquisition_verified_brand_alias_match", "retail alias auto-close requires brand alias guard");
requireSnippet(retailAliasAutoCloseSqlPath, retailAliasAutoCloseSql, "retail_alias_auto_closed_by", "retail alias auto-close records closure provenance");

const directDuplicateAuditPath = "scripts/catalog-direct-duplicate-audit-sql.mjs";
const directDuplicateAudit = read(directDuplicateAuditPath);
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "direct verified-identity duplicate closures", "direct duplicate audit title");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "matched_quality_state IS DISTINCT FROM 'verified_ready'", "direct duplicate audit catches non-ready matches");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "wrongly_promoted_legacy_rows", "direct duplicate audit catches promoted legacy rows");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "catalog_acquisition_life_stage_terms_match", "direct duplicate audit checks life-stage guard");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "catalog_acquisition_protected_line_terms_match", "direct duplicate audit checks protected line guard");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "catalog_acquisition_food_form_terms_match", "direct duplicate audit checks food-form guard");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "food_form_mismatch_rows", "direct duplicate audit reports food-form mismatches");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "catalog_acquisition_size_terms_match", "direct duplicate audit checks size guard");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "catalog_acquisition_package_count_match", "direct duplicate audit checks package-count guard");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "--all-automated-closures", "direct duplicate audit can audit all automated closure functions");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "closure_counts", "direct duplicate audit reports closure counts");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "duplicate_closed_by", "direct duplicate audit includes closure source in failures");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "failure_rows", "direct duplicate audit returns failure count");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "sampled_failure_rows", "direct duplicate audit separates sampled failure count");
requireSnippet(directDuplicateAuditPath, directDuplicateAudit, "all_failures", "direct duplicate audit counts all failures before sampling");

const duplicateClosureAuditRpcPath = "supabase/migrations/246_duplicate_closure_audit_rpc.sql";
const duplicateClosureAuditRpc = read(duplicateClosureAuditRpcPath);
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "catalog_duplicate_closure_audit", "duplicate closure audit RPC");
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "RETURNS JSONB", "duplicate closure audit returns JSONB");
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "STABLE", "duplicate closure audit is read-only stable");
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "matched_quality_state IS DISTINCT FROM 'verified_ready'", "duplicate closure audit rejects non-ready matches");
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "wrongly_promoted_legacy_rows", "duplicate closure audit reports wrongly promoted rows");
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "catalog_acquisition_life_stage_terms_match", "duplicate closure audit checks life-stage guard");
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "catalog_acquisition_food_form_terms_match", "duplicate closure audit checks food-form guard");
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "catalog_acquisition_package_count_match", "duplicate closure audit checks package-count guard");
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "REVOKE ALL ON FUNCTION public.catalog_duplicate_closure_audit(TEXT[], TEXT[], INTEGER) FROM authenticated", "duplicate closure audit RPC authenticated revoke");
requireSnippet(duplicateClosureAuditRpcPath, duplicateClosureAuditRpc, "GRANT EXECUTE ON FUNCTION public.catalog_duplicate_closure_audit(TEXT[], TEXT[], INTEGER) TO service_role", "duplicate closure audit RPC service-role grant");

const communityNoiseCleanupPath = "scripts/catalog-community-noise-cleanup-sql.mjs";
const communityNoiseCleanup = read(communityNoiseCleanupPath);
requireSnippet(communityNoiseCleanupPath, communityNoiseCleanup, "non-US/unclear community catalog rows", "community noise cleanup title");
requireSnippet(communityNoiseCleanupPath, communityNoiseCleanup, "non_english_or_non_us_title", "community noise cleanup non-US title class");
requireSnippet(communityNoiseCleanupPath, communityNoiseCleanup, "ocr_unclear_identity", "community noise cleanup unclear OCR class");
requireSnippet(communityNoiseCleanupPath, communityNoiseCleanup, "COALESCE(q.product_source, pd.source) IN ('opff', 'community', 'user_ocr')", "community noise cleanup source guard");
requireSnippet(communityNoiseCleanupPath, communityNoiseCleanup, "COALESCE(NULLIF(q.source_url, ''), NULLIF(pd.source_url, '')) IS NULL", "community noise cleanup no-source guard");
requireSnippet(communityNoiseCleanupPath, communityNoiseCleanup, "COALESCE(pd.ingredient_verification_status, 'unverified') NOT IN", "community noise cleanup verified ingredient guard");
requireSnippet(communityNoiseCleanupPath, communityNoiseCleanup, "non_us_or_unclear_community_catalog_row", "community noise cleanup exclusion reason");
requireSnippet(communityNoiseCleanupPath, communityNoiseCleanup, "safe_candidates", "community noise cleanup uses safe candidate subset");

const sourceTargetsPath = "scripts/catalog-source-targets.json";
const sourceTargets = JSON.parse(read(sourceTargetsPath));
const sourceTargetBrands = new Set();
const normalizedSourceTargetKeys = new Set();
function normalizedSourceTarget(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
for (const target of sourceTargets) {
  if (target.aliases && !Array.isArray(target.aliases)) {
    fail(`${sourceTargetsPath}: ${target.brand || "unknown brand"} aliases must be an array`);
  }
  for (const value of [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])]) {
    const normalized = normalizedSourceTarget(value);
    if (!normalized) continue;
    if (normalizedSourceTargetKeys.has(normalized)) {
      fail(`${sourceTargetsPath}: duplicate source target key ${normalized}`);
    }
    normalizedSourceTargetKeys.add(normalized);
    sourceTargetBrands.add(String(value || "").toLowerCase());
  }
}
for (const brand of [
  "Blue Buffalo",
  "Blue Wilderness",
  "Purina Pro Plan",
  "Pro Plan Veterinary Diets",
  "Fancy Feast",
  "Wellness",
  "Friskies",
  "Royal Canin",
  "Royal Canin Veterinary Diet",
  "Hill's Science Diet",
  "Hill's Prescription Diet",
  "Purina ONE",
  "Nutro",
  "Pedigree",
  "Cesar",
  "IAMS",
  "Instinct",
  "Eukanuba",
  "Stella & Chewy's",
  "TIKI PETS",
  "Tiki Cat",
  "Tiki Dog",
  "Weruva",
  "Merrick",
  "Open Farm",
  "Taste of the Wild",
  "Natural Balance",
  "Nature's Recipe",
  "Best Breed",
  "Earthborn Holistic",
  "Solid Gold",
  "CANIDAE",
  "I AND LOVE AND YOU",
  "Bully Max",
  "Rawz",
  "Ziwi Peak",
  "Go! Solutions",
  "Now Fresh",
  "Pure Balance",
  "Berkley Jensen",
  "Diamond Naturals",
  "Primal",
  "Jinx",
  "4Health",
  "Crave",
  "Kirkland Signature",
  "Trader Joe's",
  "9Lives",
  "FirstMate",
  "Kasiks",
  "SKOKI",
  "NutriSource",
  "PureVita",
  "Fussie Cat",
  "Halo",
  "Kindfull",
  "Wag",
  "Ol' Roy",
  "Purina Beyond",
  "Nutrish",
  "Sheba",
  "Simply Nourish",
  "Whiskas",
  "Authority",
  "Optimeal",
]) {
  if (!sourceTargetBrands.has(brand.toLowerCase())) {
    fail(`${sourceTargetsPath}: missing priority source target for ${brand}`);
  }
}
for (const target of sourceTargets) {
  if (!target.sourceOwner || !target.targetUrl || !target.coverageTier || !target.sourcePriority) {
    fail(`${sourceTargetsPath}: ${target.brand || "unknown brand"} is missing source owner, URL, tier, or priority`);
  }
}
const blueBuffaloTarget = sourceTargets.find((target) => target.brand === "Blue Buffalo");
const wellnessTarget = sourceTargets.find((target) => target.brand === "Wellness");
const purinaProPlanTarget = sourceTargets.find((target) => target.brand === "Purina Pro Plan");
const fancyFeastTarget = sourceTargets.find((target) => target.brand === "Fancy Feast");
const friskiesTarget = sourceTargets.find((target) => target.brand === "Friskies");
const purinaOneTarget = sourceTargets.find((target) => target.brand === "Purina ONE");
const benefulTarget = sourceTargets.find((target) => target.brand === "Beneful");
const royalCaninTarget = sourceTargets.find((target) => target.brand === "Royal Canin");
const openFarmTarget = sourceTargets.find((target) => target.brand === "Open Farm");
const nuloTarget = sourceTargets.find((target) => target.brand === "Nulo");
const nutroTarget = sourceTargets.find((target) => target.brand === "Nutro");
const pedigreeTarget = sourceTargets.find((target) => target.brand === "Pedigree");
const cesarTarget = sourceTargets.find((target) => target.brand === "Cesar");
const iamsTarget = sourceTargets.find((target) => target.brand === "IAMS");
const shebaTarget = sourceTargets.find((target) => target.brand === "Sheba");
const craveTarget = sourceTargets.find((target) => target.brand === "Crave");
const instinctTarget = sourceTargets.find((target) => target.brand === "Instinct");
const eukanubaTarget = sourceTargets.find((target) => target.brand === "Eukanuba");
const stellaTarget = sourceTargets.find((target) => target.brand === "Stella & Chewy's");
const tikiTarget = sourceTargets.find((target) => target.brand === "TIKI PETS");
const weruvaTarget = sourceTargets.find((target) => target.brand === "Weruva");
const nutrishTarget = sourceTargets.find((target) => target.brand === "Nutrish");
const merrickTarget = sourceTargets.find((target) => target.brand === "Merrick");
const orijenTarget = sourceTargets.find((target) => target.brand === "Orijen");
const acanaTarget = sourceTargets.find((target) => target.brand === "ACANA");
const victorTarget = sourceTargets.find((target) => target.brand === "VICTOR");
const tasteOfTheWildTarget = sourceTargets.find((target) => target.brand === "Taste of the Wild");
const earthbornTarget = sourceTargets.find((target) => target.brand === "Earthborn Holistic");
const solidGoldTarget = sourceTargets.find((target) => target.brand === "Solid Gold");
const canidaeTarget = sourceTargets.find((target) => target.brand === "CANIDAE");
const iAndLoveAndYouTarget = sourceTargets.find((target) => target.brand === "I AND LOVE AND YOU");
const bullyMaxTarget = sourceTargets.find((target) => target.brand === "Bully Max");
const freshpetTarget = sourceTargets.find((target) => target.brand === "Freshpet");
const frommTarget = sourceTargets.find((target) => target.brand === "Fromm");
const justFoodForDogsTarget = sourceTargets.find((target) => target.brand === "JustFoodForDogs");
const honestKitchenTarget = sourceTargets.find((target) => target.brand === "The Honest Kitchen");
const naturalBalanceTarget = sourceTargets.find((target) => target.brand === "Natural Balance");
const natureRecipeTarget = sourceTargets.find((target) => target.brand === "Nature's Recipe");
const bestBreedTarget = sourceTargets.find((target) => target.brand === "Best Breed");
const diamondTarget = sourceTargets.find((target) => target.brand === "Diamond Naturals");
const davesTarget = sourceTargets.find((target) => target.brand === "Dave's Pet Food");
const dogChowTarget = sourceTargets.find((target) => target.brand === "Purina Dog Chow");
const catChowTarget = sourceTargets.find((target) => target.brand === "Purina Cat Chow");
const kitKaboodleTarget = sourceTargets.find((target) => target.brand === "Kit & Kaboodle");
const nineLivesTarget = sourceTargets.find((target) => target.brand === "9Lives");
const fussieCatTarget = sourceTargets.find((target) => target.brand === "Fussie Cat");
const annamaetTarget = sourceTargets.find((target) => target.brand === "Annamaet");
const firstMateTarget = sourceTargets.find((target) => target.brand === "FirstMate");
const nutriSourceTarget = sourceTargets.find((target) => target.brand === "NutriSource");
const primalTarget = sourceTargets.find((target) => target.brand === "Primal");
const naturesLogicTarget = sourceTargets.find((target) => target.brand === "NATURE'S LOGIC");
const kohaTarget = sourceTargets.find((target) => target.brand === "KOHA");
const rawzTarget = sourceTargets.find((target) => target.brand === "Rawz");
const jinxTarget = sourceTargets.find((target) => target.brand === "Jinx");
const healthExtensionTarget = sourceTargets.find((target) => target.brand === "Health Extension");
const goSolutionsTarget = sourceTargets.find((target) => target.brand === "Go! Solutions");
const nowFreshTarget = sourceTargets.find((target) => target.brand === "Now Fresh");
if (blueBuffaloTarget?.discovery?.targetUrl !== "https://www.bluebuffalo.com/sitemap.en.xml") {
  fail(`${sourceTargetsPath}: Blue Buffalo should use the official product sitemap discovery target`);
}
if (blueBuffaloTarget?.sourceSlug !== "blue-buffalo-general-mills") {
  fail(`${sourceTargetsPath}: Blue Buffalo should define a stable source slug`);
}
if (blueBuffaloTarget?.discovery?.requiredUrlPattern !== "^https://www\\.bluebuffalo\\.com/(?:dry|wet|fresh)-(?:dog|cat)-food/") {
  fail(`${sourceTargetsPath}: Blue Buffalo discovery should exclude non-product sitemap pages`);
}
if (wellnessTarget?.sourceSlug !== "wellness-pet-company") {
  fail(`${sourceTargetsPath}: Wellness should define the canonical Wellness Pet Company source slug`);
}
if (wellnessTarget?.discovery?.targetUrl !== "https://www.wellnesspetfood.com/salsify-products-sitemap.xml") {
  fail(`${sourceTargetsPath}: Wellness should use the official Salsify product sitemap`);
}
if (wellnessTarget?.discovery?.requiredUrlPattern !== "^https://www\\.wellnesspetfood\\.com/product-catalog/") {
  fail(`${sourceTargetsPath}: Wellness should isolate discovery to official product-catalog URLs`);
}
if (wellnessTarget?.discovery?.minScore !== 1) {
  fail(`${sourceTargetsPath}: Wellness should keep minScore 1 so short official Salsify formula slugs are not dropped`);
}
if (!/bowl-boosters/.test(wellnessTarget?.discovery?.excludedUrlPattern || "") || !/whimzees/.test(wellnessTarget?.discovery?.excludedUrlPattern || "")) {
  fail(`${sourceTargetsPath}: Wellness should exclude obvious toppers, treats, dental chews, and variety packs before extraction`);
}
if (!/bundle/.test(justFoodForDogsTarget?.discovery?.excludedUrlPattern || "") || !/chews/.test(justFoodForDogsTarget?.discovery?.excludedUrlPattern || "") || !/nutrient-blend/.test(justFoodForDogsTarget?.discovery?.excludedUrlPattern || "")) {
  fail(`${sourceTargetsPath}: JustFoodForDogs should exclude bundles, chews, supplements, and DIY blends before extraction`);
}
if (dogChowTarget?.sourceSlug !== "nestle-purina-dog-chow") {
  fail(`${sourceTargetsPath}: Purina Dog Chow should define a stable source slug`);
}
if (dogChowTarget?.discovery?.requiredUrlPattern !== "^https://www\\.purina\\.com/dogs/shop/(?:purina-)?dog-chow-") {
  fail(`${sourceTargetsPath}: Purina Dog Chow should isolate discovery to exact dog shop formula URLs`);
}
if (!/variety/.test(dogChowTarget?.discovery?.excludedUrlPattern || "") || !/treats/.test(dogChowTarget?.discovery?.excludedUrlPattern || "")) {
  fail(`${sourceTargetsPath}: Purina Dog Chow should exclude variety packs and non-complete products before extraction`);
}
if (catChowTarget?.sourceSlug !== "nestle-purina-cat-chow") {
  fail(`${sourceTargetsPath}: Purina Cat Chow should define a stable source slug`);
}
if (catChowTarget?.discovery?.requiredUrlPattern !== "^https://www\\.purina\\.com/cats/shop/.*cat-chow") {
  fail(`${sourceTargetsPath}: Purina Cat Chow should isolate discovery to exact cat shop formula URLs`);
}
if (kitKaboodleTarget?.sourceSlug !== "nestle-purina-kit-kaboodle") {
  fail(`${sourceTargetsPath}: Kit & Kaboodle should define a stable source slug`);
}
if (kitKaboodleTarget?.discovery?.requiredUrlPattern !== "^https://www\\.purina\\.com/cats/shop/kit-kaboodle-") {
  fail(`${sourceTargetsPath}: Kit & Kaboodle should isolate discovery to exact cat shop formula URLs`);
}
if (!/treats/.test(kitKaboodleTarget?.discovery?.excludedUrlPattern || "")) {
  fail(`${sourceTargetsPath}: Kit & Kaboodle should exclude treat URLs before extraction`);
}
if (goSolutionsTarget?.sourceSlug !== "go-solutions-petcurean") {
  fail(`${sourceTargetsPath}: Go! Solutions should define a stable source slug`);
}
if (goSolutionsTarget?.discovery?.targetUrl !== "https://go-solutions.com/sitemap.xml") {
  fail(`${sourceTargetsPath}: Go! Solutions should use the official sitemap discovery target`);
}
if (goSolutionsTarget?.discovery?.requiredUrlPattern !== "^https://go-solutions\\.com/en-us/(cat-food|dog-food)/(dry|wet)/") {
  fail(`${sourceTargetsPath}: Go! Solutions should isolate discovery to US dry/wet dog/cat product URLs`);
}
if (nowFreshTarget?.sourceSlug !== "now-fresh-petcurean") {
  fail(`${sourceTargetsPath}: Now Fresh should define a stable source slug`);
}
if (nowFreshTarget?.discovery?.targetUrl !== "https://nowfresh.com/sitemap.xml") {
  fail(`${sourceTargetsPath}: Now Fresh should use the official sitemap discovery target`);
}
if (nowFreshTarget?.discovery?.requiredUrlPattern !== "^https://nowfresh\\.com/en-us/(cat-food|dog-food)/(dry|wet|good-gravy)/") {
  fail(`${sourceTargetsPath}: Now Fresh should isolate discovery to US dog/cat product URLs`);
}
if (nineLivesTarget?.sourceSlug !== "9lives") {
  fail(`${sourceTargetsPath}: 9Lives should define a stable source slug`);
}
if (nineLivesTarget?.discovery?.trailingSlash !== "append") {
  fail(`${sourceTargetsPath}: 9Lives should preserve trailing-slash product URLs`);
}
if (fussieCatTarget?.sourceSlug !== "fussie-cat") {
  fail(`${sourceTargetsPath}: Fussie Cat should define a stable source slug`);
}
if (fussieCatTarget?.discovery?.targetUrl !== "https://fussiecat.com/product-sitemap.xml") {
  fail(`${sourceTargetsPath}: Fussie Cat should use the official product sitemap`);
}
if (fussieCatTarget?.discovery?.requiredUrlPattern !== "^https://fussiecat\\.com/product/") {
  fail(`${sourceTargetsPath}: Fussie Cat should isolate discovery to official product URLs`);
}
if (fussieCatTarget?.discovery?.trailingSlash !== "append") {
  fail(`${sourceTargetsPath}: Fussie Cat should preserve slash-sensitive canonical product URLs`);
}
if (annamaetTarget?.sourceSlug !== "annamaet") {
  fail(`${sourceTargetsPath}: Annamaet should define a stable source slug`);
}
if (annamaetTarget?.discovery?.targetUrl !== "https://annamaet.com/products-sitemap.xml") {
  fail(`${sourceTargetsPath}: Annamaet should use the official plural products sitemap, not the supplement-heavy singular product sitemap`);
}
if (annamaetTarget?.discovery?.requiredUrlPattern !== "^https://annamaet\\.com/products/") {
  fail(`${sourceTargetsPath}: Annamaet should isolate discovery to official products URLs`);
}
if (annamaetTarget?.discovery?.trailingSlash !== "append") {
  fail(`${sourceTargetsPath}: Annamaet should preserve slash-sensitive canonical product URLs`);
}
if (firstMateTarget?.sourceSlug !== "firstmate") {
  fail(`${sourceTargetsPath}: FirstMate should define a stable source slug`);
}
if (!firstMateTarget?.aliases?.includes("Kasiks") || !firstMateTarget?.aliases?.includes("SKOKI")) {
  fail(`${sourceTargetsPath}: FirstMate should include Kasiks and SKOKI source aliases`);
}
if (firstMateTarget?.discovery?.targetUrl !== "https://firstmate.com/product-sitemap.xml") {
  fail(`${sourceTargetsPath}: FirstMate should use the official product sitemap discovery target`);
}
if (firstMateTarget?.discovery?.requiredUrlPattern !== "^https://firstmate\\.com/product/") {
  fail(`${sourceTargetsPath}: FirstMate should isolate discovery to official product URLs`);
}
if (nutriSourceTarget?.sourceSlug !== "nutrisource") {
  fail(`${sourceTargetsPath}: NutriSource should define a stable source slug`);
}
if (!nutriSourceTarget?.aliases?.includes("PureVita") || !nutriSourceTarget?.aliases?.includes("NutriSource Choice")) {
  fail(`${sourceTargetsPath}: NutriSource should include PureVita and Choice source aliases`);
}
if (nutriSourceTarget?.discovery?.targetUrl !== "https://discovernutrisource.com/sitemap_products_1.xml?from=1655976984650&to=9158865617134") {
  fail(`${sourceTargetsPath}: NutriSource should use the official Shopify product sitemap`);
}
if (nutriSourceTarget?.discovery?.requiredUrlPattern !== "^https://discovernutrisource\\.com/products/") {
  fail(`${sourceTargetsPath}: NutriSource should isolate discovery to official product URLs`);
}
if (nutriSourceTarget?.discovery?.officialApi !== "Shopify product sitemap + product pages + product JSON") {
  fail(`${sourceTargetsPath}: NutriSource should record the public Shopify page and product JSON source shape`);
}
if (nutriSourceTarget?.discovery?.fetchDelayMs !== 1500) {
  fail(`${sourceTargetsPath}: NutriSource should preserve the official-site throttle-safe page fetch delay`);
}
if (primalTarget?.sourceSlug !== "primal-pet-foods") {
  fail(`${sourceTargetsPath}: Primal should define a stable source slug`);
}
if (!primalTarget?.aliases?.includes("Primal Pet Foods")) {
  fail(`${sourceTargetsPath}: Primal should include Primal Pet Foods as a source alias`);
}
if (primalTarget?.discovery?.targetUrl !== "https://www.primalpetfoods.com/sitemap_products_1.xml?from=9718299090&to=9161469493475") {
  fail(`${sourceTargetsPath}: Primal should use the official Shopify product sitemap`);
}
if (primalTarget?.discovery?.requiredUrlPattern !== "^https://www\\.primalpetfoods\\.com/products/") {
  fail(`${sourceTargetsPath}: Primal should isolate discovery to official product URLs`);
}
if (primalTarget?.discovery?.officialApi !== "Shopify product sitemap + product pages + product JSON") {
  fail(`${sourceTargetsPath}: Primal should record the public Shopify page and product JSON source shape`);
}
if (primalTarget?.discovery?.fetchDelayMs !== 1500) {
  fail(`${sourceTargetsPath}: Primal should preserve the official-site throttle-safe page fetch delay`);
}
if (naturesLogicTarget?.sourceSlug !== "natures-logic") {
  fail(`${sourceTargetsPath}: Nature's Logic should define a stable source slug`);
}
if (!naturesLogicTarget?.aliases?.includes("Natures Logic")) {
  fail(`${sourceTargetsPath}: Nature's Logic should include a non-apostrophe source alias`);
}
if (naturesLogicTarget?.discovery?.targetUrl !== "https://natureslogic.com/product-sitemap.xml") {
  fail(`${sourceTargetsPath}: Nature's Logic should use the official product sitemap`);
}
if (naturesLogicTarget?.discovery?.requiredUrlPattern !== "^https://natureslogic\\.com/(cat-products|dog-products)/") {
  fail(`${sourceTargetsPath}: Nature's Logic should isolate discovery to official dog/cat product URLs`);
}
if (naturesLogicTarget?.discovery?.trailingSlash !== "append") {
  fail(`${sourceTargetsPath}: Nature's Logic should preserve slash-sensitive canonical product URLs`);
}
if (kohaTarget?.sourceSlug !== "koha") {
  fail(`${sourceTargetsPath}: KOHA should define a stable source slug`);
}
if (kohaTarget?.discovery?.targetUrl !== "https://kohapet.com/sitemap_products_1.xml?from=4174606237781&to=7354637713493") {
  fail(`${sourceTargetsPath}: KOHA should use the official Shopify product sitemap`);
}
if (kohaTarget?.discovery?.requiredUrlPattern !== "^https://kohapet\\.com/products/") {
  fail(`${sourceTargetsPath}: KOHA should isolate discovery to official product URLs`);
}
if (rawzTarget?.sourceSlug !== "rawz") {
  fail(`${sourceTargetsPath}: RAWZ should define a stable source slug`);
}
if (rawzTarget?.discovery?.targetUrl !== "https://rawznaturalpetfood.com/product-sitemap.xml") {
  fail(`${sourceTargetsPath}: RAWZ should use the official product sitemap`);
}
if (rawzTarget?.discovery?.requiredUrlPattern !== "^https://rawznaturalpetfood\\.com/product/") {
  fail(`${sourceTargetsPath}: RAWZ should isolate discovery to official product URLs`);
}
if (jinxTarget?.sourceSlug !== "jinx") {
  fail(`${sourceTargetsPath}: Jinx should define a stable source slug`);
}
if (jinxTarget?.discovery?.targetUrl !== "https://www.thinkjinx.com/sitemap_products_1.xml?from=6544412409949&to=8142343340125") {
  fail(`${sourceTargetsPath}: Jinx should use the official Shopify product sitemap`);
}
if (jinxTarget?.discovery?.requiredUrlPattern !== "^https://www\\.thinkjinx\\.com/products/") {
  fail(`${sourceTargetsPath}: Jinx should isolate discovery to official product URLs`);
}
if (healthExtensionTarget?.sourceSlug !== "health-extension") {
  fail(`${sourceTargetsPath}: Health Extension should define a stable source slug`);
}
if (healthExtensionTarget?.discovery?.targetUrl !== "https://www.healthextension.com/products.json?limit=250") {
  fail(`${sourceTargetsPath}: Health Extension should use the official Shopify products JSON feed`);
}
if (healthExtensionTarget?.discovery?.requiredUrlPattern !== "^https://www\\.healthextension\\.com/products/") {
  fail(`${sourceTargetsPath}: Health Extension should isolate discovery to official product URLs`);
}
if (!/samples\?/.test(healthExtensionTarget?.discovery?.excludedUrlPattern || "")) {
  fail(`${sourceTargetsPath}: Health Extension should exclude official sample products before extraction`);
}
if (!healthExtensionTarget?.discovery?.shopifyProductTypePattern?.includes("air-dried complete")) {
  fail(`${sourceTargetsPath}: Health Extension should filter official Shopify discovery to dog/cat food product types`);
}
if (!healthExtensionTarget?.discovery?.shopifyExcludedProductTypePattern?.includes("supplements?")) {
  fail(`${sourceTargetsPath}: Health Extension should exclude known official non-complete and non-food product types before extraction`);
}
if (!healthExtensionTarget?.discovery?.shopifyProductTagPattern?.includes("air-dried complete")) {
  fail(`${sourceTargetsPath}: Health Extension should require dog/cat food tags for Shopify discovery`);
}
if (!healthExtensionTarget?.discovery?.shopifyExcludedProductTagPattern?.includes("meal enhancers?")) {
  fail(`${sourceTargetsPath}: Health Extension should exclude tagged meal enhancers before extraction`);
}
if (!healthExtensionTarget?.discovery?.shopifyExcludedProductTagPattern?.includes("product type_treats?")) {
  fail(`${sourceTargetsPath}: Health Extension should exclude Shopify structured treat tags before extraction`);
}
if (!healthExtensionTarget?.discovery?.shopifyExcludedProductTagPattern?.includes("toppers?")) {
  fail(`${sourceTargetsPath}: Health Extension should exclude tagged toppers before extraction`);
}
if (openFarmTarget?.sourceSlug !== "open-farm") {
  fail(`${sourceTargetsPath}: Open Farm should define a stable source slug`);
}
if (openFarmTarget?.discovery?.targetUrl !== "https://openfarmpet.com/collections/dog-food") {
  fail(`${sourceTargetsPath}: Open Farm should use the official dog-food collection discovery target`);
}
if (!openFarmTarget?.discovery?.extraTargetUrls?.includes("https://openfarmpet.com/collections/cat-food")) {
  fail(`${sourceTargetsPath}: Open Farm should include the official cat-food collection discovery target`);
}
if (openFarmTarget?.discovery?.requiredUrlPattern !== "^https://openfarmpet\\.com/products/") {
  fail(`${sourceTargetsPath}: Open Farm should isolate discovery to product URLs`);
}
if (royalCaninTarget?.sourceSlug !== "royal-canin-mars-petcare") {
  fail(`${sourceTargetsPath}: Royal Canin should define a stable source slug`);
}
if (royalCaninTarget?.discovery?.targetUrl !== "https://www.royalcanin.com/us/view-all-products") {
  fail(`${sourceTargetsPath}: Royal Canin should use the official all-products search page`);
}
if (royalCaninTarget?.discovery?.officialIndex !== "prod_apif-products_en_US") {
  fail(`${sourceTargetsPath}: Royal Canin should record the official US product index`);
}
if (royalCaninTarget?.discovery?.officialIndexFilter !== "brand_code:royal_canin AND family:food") {
  fail(`${sourceTargetsPath}: Royal Canin should record the official food-only index filter`);
}
if (nuloTarget?.sourceSlug !== "nulo") {
  fail(`${sourceTargetsPath}: Nulo should define a stable source slug`);
}
if (nuloTarget?.discovery?.targetUrl !== "https://nulo.com/sitemap-products.xml") {
  fail(`${sourceTargetsPath}: Nulo should use the official products sitemap`);
}
if (nuloTarget?.discovery?.requiredUrlPattern !== "^https://nulo\\.com/products/") {
  fail(`${sourceTargetsPath}: Nulo should isolate discovery to product URLs`);
}
if (nutroTarget?.sourceSlug !== "nutro") {
  fail(`${sourceTargetsPath}: Nutro should define a stable source slug`);
}
if (nutroTarget?.discovery?.targetUrl !== "https://www.nutro.com/") {
  fail(`${sourceTargetsPath}: Nutro should use the official brand site discovery target`);
}
if (nutroTarget?.discovery?.requiredUrlPattern !== "^https://www\\.nutro\\.com/products/") {
  fail(`${sourceTargetsPath}: Nutro should isolate discovery to official product URLs`);
}
if (pedigreeTarget?.sourceSlug !== "pedigree-mars-petcare") {
  fail(`${sourceTargetsPath}: Pedigree should define a stable source slug`);
}
if (pedigreeTarget?.discovery?.targetUrl !== "https://www.pedigree.com/") {
  fail(`${sourceTargetsPath}: Pedigree should use the official brand site discovery target`);
}
if (pedigreeTarget?.discovery?.requiredUrlPattern !== "^https://www\\.pedigree\\.com/products/") {
  fail(`${sourceTargetsPath}: Pedigree should isolate discovery to official product URLs`);
}
if (cesarTarget?.sourceSlug !== "cesar-mars-petcare") {
  fail(`${sourceTargetsPath}: Cesar should define a stable source slug`);
}
if (cesarTarget?.discovery?.targetUrl !== "https://www.cesar.com/") {
  fail(`${sourceTargetsPath}: Cesar should use the official brand site discovery target`);
}
if (cesarTarget?.discovery?.requiredUrlPattern !== "^https://www\\.cesar\\.com/products/") {
  fail(`${sourceTargetsPath}: Cesar should isolate discovery to official product URLs`);
}
if (iamsTarget?.sourceSlug !== "iams") {
  fail(`${sourceTargetsPath}: IAMS should define a stable source slug`);
}
if (iamsTarget?.discovery?.targetUrl !== "https://www.iams.com/") {
  fail(`${sourceTargetsPath}: IAMS should use the official brand site discovery target`);
}
if (iamsTarget?.discovery?.requiredUrlPattern !== "^https://www\\.iams\\.com/products/") {
  fail(`${sourceTargetsPath}: IAMS should isolate discovery to official product URLs`);
}
if (shebaTarget?.sourceSlug !== "sheba-mars-petcare") {
  fail(`${sourceTargetsPath}: Sheba should define a stable source slug`);
}
if (shebaTarget?.discovery?.targetUrl !== "https://www.sheba.com/") {
  fail(`${sourceTargetsPath}: Sheba should use the official brand site discovery target`);
}
if (shebaTarget?.discovery?.requiredUrlPattern !== "^https://www\\.sheba\\.com/products/") {
  fail(`${sourceTargetsPath}: Sheba should isolate discovery to official product URLs`);
}
if (craveTarget?.sourceSlug !== "crave-mars-petcare") {
  fail(`${sourceTargetsPath}: Crave should define a stable source slug`);
}
if (craveTarget?.discovery?.targetUrl !== "https://www.cravepetfoods.com/") {
  fail(`${sourceTargetsPath}: Crave should use the official brand site discovery target`);
}
if (craveTarget?.discovery?.requiredUrlPattern !== "^https://www\\.cravepetfoods\\.com/products/") {
  fail(`${sourceTargetsPath}: Crave should isolate discovery to official product URLs`);
}
if (instinctTarget?.sourceSlug !== "instinct-pet-food") {
  fail(`${sourceTargetsPath}: Instinct should define a stable source slug`);
}
if (instinctTarget?.discovery?.targetUrl !== "https://instinctpetfood.com/wp-json/wp/v2/product?per_page=100&_embed") {
  fail(`${sourceTargetsPath}: Instinct should use the official WordPress product API`);
}
if (instinctTarget?.discovery?.officialApi !== "wp-json/wp/v2/product") {
  fail(`${sourceTargetsPath}: Instinct should record the official WordPress product API shape`);
}
if (instinctTarget?.discovery?.fetchDelayMs !== 250) {
  fail(`${sourceTargetsPath}: Instinct should preserve a respectful API fetch delay`);
}
if (instinctTarget?.discovery?.requiredUrlPattern !== "^https://instinctpetfood\\.com/products/") {
  fail(`${sourceTargetsPath}: Instinct should isolate discovery to official product URLs`);
}
if (eukanubaTarget?.sourceSlug !== "eukanuba") {
  fail(`${sourceTargetsPath}: Eukanuba should define a stable source slug`);
}
if (eukanubaTarget?.discovery?.targetUrl !== "https://www.eukanuba.com/") {
  fail(`${sourceTargetsPath}: Eukanuba should use the official brand site discovery target`);
}
if (eukanubaTarget?.discovery?.requiredUrlPattern !== "^https://www\\.eukanuba\\.com/products/") {
  fail(`${sourceTargetsPath}: Eukanuba should isolate discovery to official product URLs`);
}
if (stellaTarget?.sourceSlug !== "stella-and-chewys") {
  fail(`${sourceTargetsPath}: Stella & Chewy's should define a stable source slug`);
}
if (!stellaTarget?.aliases?.includes("Stella & Chewy's DTC")) {
  fail(`${sourceTargetsPath}: Stella & Chewy's should include the official storefront brand alias`);
}
if (stellaTarget?.discovery?.targetUrl !== "https://www.stellaandchewys.com/products.json?limit=250") {
  fail(`${sourceTargetsPath}: Stella & Chewy's should use the official Shopify products JSON discovery target`);
}
if (stellaTarget?.discovery?.requiredUrlPattern !== "^https://www\\.stellaandchewys\\.com/products/") {
  fail(`${sourceTargetsPath}: Stella & Chewy's should isolate discovery to official product URLs`);
}
if (stellaTarget?.discovery?.officialApi !== "Shopify products.json + product pages") {
  fail(`${sourceTargetsPath}: Stella & Chewy's should record the official Shopify source shape`);
}
if (tikiTarget?.sourceSlug !== "tiki-pets") {
  fail(`${sourceTargetsPath}: TIKI PETS should define a stable source slug`);
}
if (!tikiTarget?.aliases?.includes("Tiki Cat") || !tikiTarget?.aliases?.includes("Tiki Dog")) {
  fail(`${sourceTargetsPath}: TIKI PETS should include Tiki Cat and Tiki Dog source aliases`);
}
if (tikiTarget?.discovery?.targetUrl !== "https://tikipets.com/product-sitemap.xml") {
  fail(`${sourceTargetsPath}: TIKI PETS should use the official product sitemap discovery target`);
}
if (tikiTarget?.discovery?.requiredUrlPattern !== "^https://tikipets\\.com/product/") {
  fail(`${sourceTargetsPath}: TIKI PETS should isolate discovery to official product URLs`);
}
if (!tikiTarget?.discovery?.excludedUrlPattern?.includes("meal-toppers") || !tikiTarget.discovery.excludedUrlPattern.includes("tiki-cat-treats") || !tikiTarget.discovery.excludedUrlPattern.includes("variety[-/]?pack")) {
  fail(`${sourceTargetsPath}: TIKI PETS should exclude official topper, supplement, treat, and multipack sitemap paths`);
}
if (tikiTarget?.discovery?.maxUrls < 500) {
  fail(`${sourceTargetsPath}: TIKI PETS discovery cap should be high enough to avoid cutting off later official product URLs`);
}
if (weruvaTarget?.sourceSlug !== "weruva") {
  fail(`${sourceTargetsPath}: Weruva should define a stable source slug`);
}
if (weruvaTarget?.discovery?.targetUrl !== "https://www.weruva.com/products.json?limit=250") {
  fail(`${sourceTargetsPath}: Weruva should use the official Shopify products JSON discovery target`);
}
if (weruvaTarget?.discovery?.requiredUrlPattern !== "^https://www\\.weruva\\.com/products/") {
  fail(`${sourceTargetsPath}: Weruva should isolate discovery to official product URLs`);
}
if (weruvaTarget?.discovery?.officialApi !== "Shopify products.json + product pages") {
  fail(`${sourceTargetsPath}: Weruva should record the official Shopify source shape`);
}
if (nutrishTarget?.sourceSlug !== "nutrish") {
  fail(`${sourceTargetsPath}: Nutrish should define a stable source slug`);
}
if (!nutrishTarget?.aliases?.includes("Rachael Ray Nutrish") || !nutrishTarget?.aliases?.includes("Rachael Ray")) {
  fail(`${sourceTargetsPath}: Nutrish should include Rachael Ray source aliases`);
}
if (nutrishTarget?.discovery?.targetUrl !== "https://www.nutrish.com/product-sitemap.xml") {
  fail(`${sourceTargetsPath}: Nutrish should use the official product sitemap discovery target`);
}
if (nutrishTarget?.discovery?.requiredUrlPattern !== "^https://www\\.nutrish\\.com/product/") {
  fail(`${sourceTargetsPath}: Nutrish should isolate discovery to official product URLs`);
}
if (nutrishTarget?.discovery?.maxUrls !== 250) {
  fail(`${sourceTargetsPath}: Nutrish should cap official product sitemap discovery at 250 URLs`);
}
if (nutrishTarget?.discovery?.trailingSlash !== "append") {
  fail(`${sourceTargetsPath}: Nutrish should preserve slash-sensitive canonical product URLs`);
}
if (merrickTarget?.sourceSlug !== "merrick-pet-care") {
  fail(`${sourceTargetsPath}: Merrick should define a stable source slug`);
}
if (merrickTarget?.discovery?.targetUrl !== "https://www.merrickpetcare.com/") {
  fail(`${sourceTargetsPath}: Merrick should use the official brand site discovery target`);
}
if (merrickTarget?.discovery?.requiredUrlPattern !== "^https://www\\.merrickpetcare\\.com/shop/(?!canada/)") {
  fail(`${sourceTargetsPath}: Merrick should isolate discovery to US official shop URLs`);
}
if (orijenTarget?.sourceSlug !== "orijen-champion-petfoods") {
  fail(`${sourceTargetsPath}: Orijen should define a stable source slug`);
}
if (orijenTarget?.discovery?.targetUrl !== "https://www.orijenpetfoods.com/en-US/dogs/dog-food") {
  fail(`${sourceTargetsPath}: Orijen should use the official US dog-food category discovery target`);
}
if (!orijenTarget?.discovery?.extraTargetUrls?.includes("https://www.orijenpetfoods.com/en-US/cats/cat-food")) {
  fail(`${sourceTargetsPath}: Orijen should include the official US cat-food category discovery target`);
}
if (orijenTarget?.discovery?.requiredUrlPattern !== "^https://www\\.orijenpetfoods\\.com/en-US/(dogs|cats)/.+\\.html") {
  fail(`${sourceTargetsPath}: Orijen should isolate discovery to official US dog/cat product pages`);
}
if (!/variety-pack/.test(orijenTarget?.discovery?.excludedUrlPattern || "") || !/multipack/.test(orijenTarget?.discovery?.excludedUrlPattern || "")) {
  fail(`${sourceTargetsPath}: Orijen should exclude variety packs and multipacks before single-formula extraction`);
}
if (orijenTarget?.discovery?.officialApi !== "Salesforce Commerce Cloud Search-UpdateGrid + official product pages") {
  fail(`${sourceTargetsPath}: Orijen should record the official Salesforce Commerce Cloud source shape`);
}
if (acanaTarget?.sourceSlug !== "acana-champion-petfoods") {
  fail(`${sourceTargetsPath}: ACANA should define a stable source slug`);
}
if (acanaTarget?.discovery?.targetUrl !== "https://www.acana.com/en-US/dogs/dog-food") {
  fail(`${sourceTargetsPath}: ACANA should use the official US dog-food category discovery target`);
}
if (!acanaTarget?.discovery?.extraTargetUrls?.includes("https://www.acana.com/en-US/cats/cat-food")) {
  fail(`${sourceTargetsPath}: ACANA should include the official US cat-food category discovery target`);
}
if (acanaTarget?.discovery?.requiredUrlPattern !== "^https://www\\.acana\\.com/en-US/(dogs|cats)/.+\\.html") {
  fail(`${sourceTargetsPath}: ACANA should isolate discovery to official US dog/cat product pages`);
}
if (!/variety-pack/.test(acanaTarget?.discovery?.excludedUrlPattern || "") || !/lickables/.test(acanaTarget?.discovery?.excludedUrlPattern || "") || !/jerky-bites/.test(acanaTarget?.discovery?.excludedUrlPattern || "")) {
  fail(`${sourceTargetsPath}: ACANA should exclude variety packs, lickables, and treat-style rows before complete-food extraction`);
}
if (acanaTarget?.discovery?.officialApi !== "Salesforce Commerce Cloud Search-UpdateGrid + official product pages") {
  fail(`${sourceTargetsPath}: ACANA should record the official Salesforce Commerce Cloud source shape`);
}
if (victorTarget?.sourceSlug !== "victor-pet-food") {
  fail(`${sourceTargetsPath}: VICTOR should define a stable source slug`);
}
if (victorTarget?.discovery?.targetUrl !== "https://victorpetfood.com/") {
  fail(`${sourceTargetsPath}: VICTOR should use the official brand site discovery target`);
}
if (victorTarget?.discovery?.requiredUrlPattern !== "^https://victorpetfood\\.com/products/(?!dogs/options|cat-formulas$)") {
  fail(`${sourceTargetsPath}: VICTOR should isolate discovery to official product URLs`);
}
if (tasteOfTheWildTarget?.sourceSlug !== "taste-of-the-wild-diamond-pet-foods") {
  fail(`${sourceTargetsPath}: Taste of the Wild should define a stable source slug`);
}
if (tasteOfTheWildTarget?.discovery?.targetUrl !== "https://www.tasteofthewildpetfood.com/wp-json/wp/v2/product?per_page=100&_embed") {
  fail(`${sourceTargetsPath}: Taste of the Wild should use the official WordPress product API`);
}
if (tasteOfTheWildTarget?.discovery?.officialApi !== "wp-json/wp/v2/product") {
  fail(`${sourceTargetsPath}: Taste of the Wild should record the official WordPress product API shape`);
}
if (tasteOfTheWildTarget?.discovery?.requiredUrlPattern !== "^https://www\\.tasteofthewildpetfood\\.com/(dog|cat)/") {
  fail(`${sourceTargetsPath}: Taste of the Wild should isolate discovery to official dog/cat product pages`);
}
if (tasteOfTheWildTarget?.discovery?.fetchDelayMs !== 10000) {
  fail(`${sourceTargetsPath}: Taste of the Wild should preserve the official robots crawl-delay guidance`);
}
if (earthbornTarget?.sourceSlug !== "earthborn-holistic-midwestern") {
  fail(`${sourceTargetsPath}: Earthborn Holistic should define a stable source slug`);
}
if (earthbornTarget?.discovery?.targetUrl !== "https://www.earthbornholisticpetfood.com/product-sitemap.xml") {
  fail(`${sourceTargetsPath}: Earthborn Holistic should use the official product sitemap discovery target`);
}
if (earthbornTarget?.discovery?.requiredUrlPattern !== "^https://www\\.earthbornholisticpetfood\\.com/product/(dog-food|cat-food)/") {
  fail(`${sourceTargetsPath}: Earthborn Holistic should isolate discovery to official US dog/cat food pages`);
}
if (solidGoldTarget?.sourceSlug !== "solid-gold") {
  fail(`${sourceTargetsPath}: Solid Gold should define a stable source slug`);
}
if (solidGoldTarget?.discovery?.targetUrl !== "https://solidgoldpet.com/products.json?limit=250") {
  fail(`${sourceTargetsPath}: Solid Gold should use the official Shopify products JSON discovery target`);
}
if (solidGoldTarget?.discovery?.officialApi !== "Shopify products.json") {
  fail(`${sourceTargetsPath}: Solid Gold should record the public Shopify products JSON shape`);
}
if (solidGoldTarget?.discovery?.requiredUrlPattern !== "^https://solidgoldpet\\.com/products/") {
  fail(`${sourceTargetsPath}: Solid Gold should isolate discovery to official product URLs`);
}
if (iAndLoveAndYouTarget?.sourceSlug !== "i-and-love-and-you") {
  fail(`${sourceTargetsPath}: I AND LOVE AND YOU should define a stable source slug`);
}
if (iAndLoveAndYouTarget?.discovery?.targetUrl !== "https://iandloveandyou.com/products.json?limit=250") {
  fail(`${sourceTargetsPath}: I AND LOVE AND YOU should use the official Shopify products JSON discovery target`);
}
if (iAndLoveAndYouTarget?.discovery?.officialApi !== "Shopify products.json + product pages") {
  fail(`${sourceTargetsPath}: I AND LOVE AND YOU should record the public Shopify products JSON and product-page source shape`);
}
if (iAndLoveAndYouTarget?.discovery?.requiredUrlPattern !== "^https://iandloveandyou\\.com/products/") {
  fail(`${sourceTargetsPath}: I AND LOVE AND YOU should isolate discovery to official product URLs`);
}
if (iAndLoveAndYouTarget?.discovery?.fetchDelayMs !== 250) {
  fail(`${sourceTargetsPath}: I AND LOVE AND YOU should preserve a respectful official page fetch delay`);
}
if (bullyMaxTarget?.sourceSlug !== "bully-max") {
  fail(`${sourceTargetsPath}: Bully Max should define a stable source slug`);
}
if (bullyMaxTarget?.discovery?.targetUrl !== "https://shop.bullymax.com/products.json?limit=250") {
  fail(`${sourceTargetsPath}: Bully Max should use the official Shopify products JSON discovery target`);
}
if (bullyMaxTarget?.discovery?.officialApi !== "Shopify products.json + product pages") {
  fail(`${sourceTargetsPath}: Bully Max should record the public Shopify products JSON and product-page source shape`);
}
if (bullyMaxTarget?.discovery?.requiredUrlPattern !== "^https://shop\\.bullymax\\.com/products/") {
  fail(`${sourceTargetsPath}: Bully Max should isolate discovery to official product URLs`);
}
if (bullyMaxTarget?.discovery?.fetchDelayMs !== 250) {
  fail(`${sourceTargetsPath}: Bully Max should preserve a respectful official page fetch delay`);
}
if (canidaeTarget?.sourceSlug !== "canidae") {
  fail(`${sourceTargetsPath}: CANIDAE should define a stable source slug`);
}
if (canidaeTarget?.discovery?.targetUrl !== "https://canidae.com/xmlsitemap.php?type=products&page=1") {
  fail(`${sourceTargetsPath}: CANIDAE should use the official BigCommerce product sitemap discovery target`);
}
if (canidaeTarget?.discovery?.officialApi !== "BigCommerce product pages + CDN content/pdp/products JSON + Storefront GraphQL SKU") {
  fail(`${sourceTargetsPath}: CANIDAE should record the official BigCommerce/CDN/GraphQL source shape`);
}
if (canidaeTarget?.discovery?.requiredUrlPattern !== "^https://canidae\\.com/[^/?#]+/?$") {
  fail(`${sourceTargetsPath}: CANIDAE should isolate discovery to official product URLs`);
}
if (freshpetTarget?.sourceSlug !== "freshpet") {
  fail(`${sourceTargetsPath}: Freshpet should define a stable source slug`);
}
if (freshpetTarget?.discovery?.targetUrl !== "https://www.freshpet.com/sitemap.xml") {
  fail(`${sourceTargetsPath}: Freshpet should use the official product sitemap discovery target`);
}
if (freshpetTarget?.discovery?.requiredUrlPattern !== "^https://www\\.freshpet\\.com/products/") {
  fail(`${sourceTargetsPath}: Freshpet should isolate discovery to official product URLs`);
}
if (frommTarget?.sourceSlug !== "fromm-family-foods") {
  fail(`${sourceTargetsPath}: Fromm should define a stable source slug`);
}
if (frommTarget?.discovery?.targetUrl !== "https://frommfamily.com/sitemap.xml") {
  fail(`${sourceTargetsPath}: Fromm should use the official sitemap discovery target`);
}
if (frommTarget?.discovery?.requiredUrlPattern !== "^https://frommfamily\\.com/(?!search|contactus|sitemap|privacy|terms|articles|why-fromm|timeline|give-back|faq|mailing-list|safety-alerts)(?!.*(?:crunchy-os|tenderollies))") {
  fail(`${sourceTargetsPath}: Fromm should isolate discovery to official host URLs`);
}
if (!frommTarget?.discovery?.excludedUrlPattern?.includes("ingredients") || !frommTarget.discovery.excludedUrlPattern.includes("functional-dog-treats")) {
  fail(`${sourceTargetsPath}: Fromm should exclude official non-product, ingredient-glossary, offer, and treat-only sitemap paths`);
}
if (frommTarget?.discovery?.maxUrls < 500) {
  fail(`${sourceTargetsPath}: Fromm discovery cap should be high enough to avoid cutting off later official product URLs`);
}
if (honestKitchenTarget?.sourceSlug !== "the-honest-kitchen") {
  fail(`${sourceTargetsPath}: The Honest Kitchen should define a stable source slug`);
}
if (honestKitchenTarget?.discovery?.targetUrl !== "https://www.thehonestkitchen.com/sitemap_products_1.xml?from=7558707642618&to=9203487342842") {
  fail(`${sourceTargetsPath}: The Honest Kitchen should use the official Shopify product sitemap`);
}
if (honestKitchenTarget?.discovery?.officialApi !== "Shopify product JSON") {
  fail(`${sourceTargetsPath}: The Honest Kitchen should record the public Shopify product JSON shape`);
}
if (honestKitchenTarget?.discovery?.requiredUrlPattern !== "^https://www\\.thehonestkitchen\\.com/products/") {
  fail(`${sourceTargetsPath}: The Honest Kitchen should isolate discovery to official product URLs`);
}
if (naturalBalanceTarget?.sourceSlug !== "natural-balance") {
  fail(`${sourceTargetsPath}: Natural Balance should define a stable source slug`);
}
if (naturalBalanceTarget?.discovery?.targetUrl !== "https://www.naturalbalanceinc.com/wp-json/wp/v2/product?per_page=100") {
  fail(`${sourceTargetsPath}: Natural Balance should use the official WordPress product API`);
}
if (naturalBalanceTarget?.discovery?.officialApi !== "wp-json/wp/v2/product") {
  fail(`${sourceTargetsPath}: Natural Balance should record the official WordPress product API shape`);
}
if (naturalBalanceTarget?.discovery?.requiredUrlPattern !== "^https://www\\.naturalbalanceinc\\.com/(dog|cat)-recipes/") {
  fail(`${sourceTargetsPath}: Natural Balance should isolate API products to official dog/cat recipe URLs`);
}
if (natureRecipeTarget?.sourceSlug !== "nature-s-recipe") {
  fail(`${sourceTargetsPath}: Nature's Recipe should define a stable source slug`);
}
if (natureRecipeTarget?.discovery?.targetUrl !== "https://www.naturesrecipe.com/product-sitemap.xml") {
  fail(`${sourceTargetsPath}: Nature's Recipe should use the official product sitemap discovery target`);
}
if (natureRecipeTarget?.discovery?.requiredUrlPattern !== "^https://www\\.naturesrecipe\\.com/product/") {
  fail(`${sourceTargetsPath}: Nature's Recipe should isolate discovery to official product URLs`);
}
if (natureRecipeTarget?.discovery?.trailingSlash !== "append") {
  fail(`${sourceTargetsPath}: Nature's Recipe should preserve slash-sensitive canonical product URLs`);
}
if (bestBreedTarget?.sourceSlug !== "best-breed") {
  fail(`${sourceTargetsPath}: Best Breed should define a stable source slug`);
}
if (!bestBreedTarget?.aliases?.includes("Dr. Gary's Best Breed")) {
  fail(`${sourceTargetsPath}: Best Breed should include Dr. Gary brand aliases`);
}
if (bestBreedTarget?.discovery?.targetUrl !== "https://bestbreed.com/product_detail-sitemap.xml") {
  fail(`${sourceTargetsPath}: Best Breed should use the official product_detail sitemap`);
}
if (bestBreedTarget?.discovery?.requiredUrlPattern !== "^https://bestbreed\\.com/product_detail/") {
  fail(`${sourceTargetsPath}: Best Breed should isolate discovery to official product detail URLs`);
}
if (!/supplement/.test(bestBreedTarget?.discovery?.excludedUrlPattern || "") || !/biscuits/.test(bestBreedTarget?.discovery?.excludedUrlPattern || "")) {
  fail(`${sourceTargetsPath}: Best Breed should exclude supplements, biscuits, and non-food pages before extraction`);
}
if (bestBreedTarget?.discovery?.fetchDelayMs !== 250) {
  fail(`${sourceTargetsPath}: Best Breed should preserve the official-site fetch delay`);
}
if (diamondTarget?.sourceSlug !== "diamond-pet-foods") {
  fail(`${sourceTargetsPath}: Diamond Pet Foods should define a stable source slug`);
}
if (!diamondTarget?.aliases?.includes("Diamond CARE") || !diamondTarget?.aliases?.includes("Diamond Pro89")) {
  fail(`${sourceTargetsPath}: Diamond Pet Foods should include sibling source aliases`);
}
if (diamondTarget?.discovery?.targetUrl !== "https://www.diamondpet.com/page-sitemap1.xml") {
  fail(`${sourceTargetsPath}: Diamond Pet Foods should use the official page sitemap discovery target`);
}
if (diamondTarget?.discovery?.requiredUrlPattern !== "^https://www\\.diamondpet\\.com/(dog|cat)/(diamond|diamond-naturals|diamond-naturals-grain-free|diamond-care|diamond-pro89)/") {
  fail(`${sourceTargetsPath}: Diamond Pet Foods should isolate discovery to official dog/cat formula pages`);
}
if (davesTarget?.sourceSlug !== "daves-pet-food") {
  fail(`${sourceTargetsPath}: Dave's Pet Food should define a stable source slug`);
}
if (!davesTarget?.aliases?.includes("Dave's 95%") || !davesTarget?.aliases?.includes("Dave's 95% Premium Meats")) {
  fail(`${sourceTargetsPath}: Dave's Pet Food should include Dave's 95% retail line aliases`);
}
if (purinaProPlanTarget?.discovery?.targetUrl !== "https://www.purina.com/pro-plan/products") {
  fail(`${sourceTargetsPath}: Purina Pro Plan should use the official Pro Plan product discovery target`);
}
if (purinaProPlanTarget?.sourceSlug !== "nestle-purina-pro-plan") {
  fail(`${sourceTargetsPath}: Purina Pro Plan should define a line-specific source slug`);
}
if (purinaProPlanTarget?.discovery?.requiredUrlPattern !== "^https://www\\.purina\\.com/(?:cats|dogs)/shop/(?:purina-)?pro-plan-") {
  fail(`${sourceTargetsPath}: Purina Pro Plan should keep source discovery isolated to formula shop URLs`);
}
if (purinaProPlanTarget?.discovery?.excludedUrlPattern !== "(?:variety-pack|starter-kit)") {
  fail(`${sourceTargetsPath}: Purina Pro Plan should exclude multi-formula variety packs and starter kits`);
}
if (purinaProPlanTarget?.discovery?.maxNestedSitemaps !== 0) {
  fail(`${sourceTargetsPath}: Purina Pro Plan discovery should allow zero nested sitemaps`);
}
if (purinaProPlanTarget?.discovery?.discoveryTimeoutMs < 240000) {
  fail(`${sourceTargetsPath}: Purina Pro Plan should use a source-specific discovery timeout for slow product grids`);
}
for (const [target, slug, url, pattern] of [
  [fancyFeastTarget, "nestle-purina-fancy-feast", "https://www.purina.com/fancy-feast/products", "^https://www\\.purina\\.com/cats/shop/fancy-feast-"],
  [friskiesTarget, "nestle-purina-friskies", "https://www.purina.com/friskies/products", "^https://www\\.purina\\.com/cats/shop/friskies-"],
  [purinaOneTarget, "nestle-purina-one", "https://www.purina.com/purina-one/products", "^https://www\\.purina\\.com/(?:cats|dogs)/shop/purina-one-"],
  [benefulTarget, "nestle-purina-beneful", "https://www.purina.com/beneful/products", "^https://www\\.purina\\.com/dogs/shop/beneful-"],
]) {
  if (target?.sourceSlug !== slug) fail(`${sourceTargetsPath}: ${target?.brand || slug} should define sourceSlug ${slug}`);
  if (target?.discovery?.targetUrl !== url) fail(`${sourceTargetsPath}: ${target?.brand || slug} should use product collection discovery target ${url}`);
  if (target?.discovery?.requiredUrlPattern !== pattern) fail(`${sourceTargetsPath}: ${target?.brand || slug} should isolate discovery to single-formula shop URLs with ${pattern}`);
  if (!/variety/.test(target?.discovery?.excludedUrlPattern || "")) fail(`${sourceTargetsPath}: ${target?.brand || slug} should exclude variety packs at discovery`);
  if (target?.discovery?.maxNestedSitemaps !== 0) fail(`${sourceTargetsPath}: ${target?.brand || slug} discovery should allow zero nested sitemaps`);
}

const sourceTargetsReportPath = "scripts/catalog-source-targets-report.mjs";
const sourceTargetsReport = read(sourceTargetsReportPath);
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "Catalog source targets report", "source target report title");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "REQUIRED_SOURCE_KEYS", "required US retail source target list");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "Runnable source local reports", "source target report local extraction coverage");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "outputAliases", "source target report recognizes historic output directories");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "--strict-live", "strict live source target audit");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "--min-affected-products", "strict live affected-product threshold");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "EXPECTED_NON_US_GENERIC_OR_NON_COMPLETE_QUEUE_BRANDS", "non-US/generic/non-complete queue separation");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "Farmina Pet Foods", "expanded top-live-backlog source target list");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "WholeHearted", "Petco private-label source target");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "Diamond Naturals", "expanded meaningful live backlog source target list");
requireSnippet(sourceTargetsReportPath, sourceTargetsReport, "Kindfull", "Target private-label source target");

const sourceFeedWorklistPath = "scripts/catalog-source-feed-worklist.mjs";
const sourceFeedWorklist = read(sourceFeedWorklistPath);
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "Catalog source feed worklist", "source feed worklist report title");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "TEMPLATE_HEADERS", "source feed worklist template headers");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "DEFAULT_TEMPLATE_SAMPLE_LIMIT", "source feed worklist default sample template limit");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "csvLineFromObject", "source feed worklist writes ordered CSV sample rows");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "\"product_line\"", "source feed worklist product-line template header");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "\"flavor\"", "source feed worklist flavor template header");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "\"package_size\"", "source feed worklist package-size template header");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "catalog-official-feed-import.mjs", "source feed worklist import command");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "catalog-scrape-all.mjs", "source feed worklist orchestrated scrape command");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "runnableStatus", "source feed worklist runnable source status");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "recommendedNextAction", "source feed worklist actionable next step");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "sourceSlug", "source feed worklist exact source slug");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "speciesAmbiguousRows", "source feed worklist species ambiguity metric");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "speciesExplicitRows", "source feed worklist species explicit metric");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "localSqlRows", "source feed worklist local generated SQL metric");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "localRejectedRows", "source feed worklist local rejection metric");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "liveGeneratedMissingUrls", "source feed worklist live generated SQL gap metric");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "import_missing_generated_sql", "source feed worklist import-missing action");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "run_official_source_extraction", "source feed worklist extraction action");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "request_or_load_authorized_feed", "source feed worklist authorized feed action");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "DEFAULT_ACTION_PLAN", "source feed worklist saved action-plan default");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "actionPlanRows", "source feed worklist action-plan fallback reader");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "saved_action_plan", "source feed worklist saved action-plan queue source");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "queueSource", "source feed worklist queue source output");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "--import-root", "source feed worklist fixture import-root option");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "sourceImportDirsFor", "source feed worklist safe local import directory discovery");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "BROAD_SOURCE_PREFIXES", "source feed worklist broad parent source guard");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "sqlManifestPathsFor", "source feed worklist SQL manifest fallback");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "reportHasLocalMetrics", "source feed worklist skips metric-empty reports");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "outputs/catalog-source-feed-worklist/current", "source feed worklist default output directory");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "writeSourceWorklistOutputs", "source feed worklist durable source output");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "writeEvidenceWorklistOutputs", "source feed worklist durable evidence output");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "worklist.md", "source feed worklist markdown output");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "worklist.csv", "source feed worklist csv output");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "official_source_current_acquire_feed_for_remaining_queue", "source feed worklist current-source queue action");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "catalog-source-url-discovery.mjs", "source feed worklist URL discovery command");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "catalog-page-feed-extract.mjs", "source feed worklist page extractor command");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "--brand", "source feed worklist passes brand fallback to page extraction");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "product_url/evidence URL", "source feed worklist proof requirement");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "--template-dir", "source feed worklist template directory option");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "--template-sample-limit", "source feed worklist sample template limit option");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "--fixture-queue-json", "source feed worklist fixture queue input for local gates");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "--fixture-evidence-json", "source feed worklist fixture evidence input for local gates");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "--evidence-gaps", "source feed worklist product evidence gap mode");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "--action", "source feed worklist evidence action filter");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "Catalog product evidence gap worklist", "source feed worklist evidence gap report title");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "third_party_no_source_review_required", "source feed worklist third-party no-source action");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "legacy_no_source_do_not_promote", "source feed worklist legacy no-source action");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "proofRequired", "source feed worklist evidence proof requirement");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "sampleProducts", "source feed worklist exposes sample product names");
requireSnippet(sourceFeedWorklistPath, sourceFeedWorklist, "templateRows", "source feed worklist carries prefilled template rows");

const sourceUrlCoverageAuditPath = "scripts/catalog-source-url-coverage-audit.mjs";
const sourceUrlCoverageAudit = read(sourceUrlCoverageAuditPath);
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "Catalog source URL coverage audit", "source URL coverage audit report title");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "catalog-source-url-discovery.mjs", "source URL coverage audit discovery script");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "catalog-source-import-batch.mjs", "source URL coverage audit import command");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "--write-missing-dir", "source URL coverage audit missing URL output");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "missingUrls", "source URL coverage audit missing URL metric");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "discoveryStatus", "source URL coverage audit discovery status");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "no_urls_discovered", "source URL coverage audit flags zero-discovery adapters");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "--fail-on-zero-discovery", "source URL coverage audit zero-discovery failure flag");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "--ndjson", "source URL coverage audit streaming output mode");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "target.discovery?.discoveryTimeoutMs", "source URL coverage audit per-source discovery timeout");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "outputAliases", "source URL coverage audit historic output aliases");
requireSnippet(sourceUrlCoverageAuditPath, sourceUrlCoverageAudit, "startsWith(`${alias}-`)", "source URL coverage audit window directory coverage");

const scrapeAllPath = "scripts/catalog-scrape-all.mjs";
const scrapeAll = read(scrapeAllPath);
requireSnippet(scrapeAllPath, scrapeAll, "discovery.extractTimeoutMs", "scrape-all forwards per-source extraction timeout");
requireSnippet(scrapeAllPath, scrapeAll, "--extract-timeout-ms", "scrape-all forwards extraction timeout flag");
requireSnippet(scrapeAllPath, scrapeAll, "quality_state_counts", "scrape-all report quality-state dashboard");
requireSnippet(scrapeAllPath, scrapeAll, "legacy_unverified_no_source_rows", "scrape-all report legacy no-source bucket");
requireSnippet(scrapeAllPath, scrapeAll, "needs_ingredients_action_counts", "scrape-all report ingredient evidence action buckets");
requireSnippet(scrapeAllPath, scrapeAll, "top_needs_ingredients_by_brand_source", "scrape-all report top ingredient evidence gaps");
requireSnippet(scrapeAllPath, scrapeAll, "catalog_product_evidence_gap_summary", "scrape-all report uses timeout-safe summary RPC");
requireSnippet(scrapeAllPath, scrapeAll, "--allow-client-report-scan", "scrape-all report legacy scan requires explicit opt-in");
requireSnippet(scrapeAllPath, scrapeAll, "rowHasVerifiedIngredients", "scrape-all report verified ingredient guard");
requireSnippet(scrapeAllPath, scrapeAll, "rowHasVerifiedImage", "scrape-all report verified image guard");
requireSnippet(scrapeAllPath, scrapeAll, "legacy_no_source_do_not_promote", "scrape-all report legacy no-source action");
requireSnippet(scrapeAllPath, scrapeAll, "third_party_no_source_review_required", "scrape-all report third-party no-source action");
requireSnippet(scrapeAllPath, scrapeAll, "authorized_feed_or_official_import_required", "scrape-all report authorized feed action");
requireSnippet(scrapeAllPath, scrapeAll, "runnable_source_reextract_or_validate", "scrape-all report runnable source action");
requireSnippet(scrapeAllPath, scrapeAll, "function windowSuffix", "scrape-all windowed output directory helper");
requireSnippet(scrapeAllPath, scrapeAll, "-window-${offset}-${limit}", "scrape-all writes URL windows to suffix directories");
requireSnippet(scrapeAllPath, scrapeAll, "function appendWindowArgs", "scrape-all forwards URL window arguments");
requireSnippet(scrapeAllPath, scrapeAll, "--url-offset", "scrape-all forwards URL window offset");
requireSnippet(scrapeAllPath, scrapeAll, "--url-limit", "scrape-all forwards URL window limit");

const scrapeWindowsPath = "scripts/catalog-scrape-windows.mjs";
const scrapeWindows = read(scrapeWindowsPath);
requireSnippet(scrapeWindowsPath, scrapeWindows, "catalog-scrape-all.mjs", "scrape windows delegates to scrape-all runner");
requireSnippet(scrapeWindowsPath, scrapeWindows, "--window-size", "scrape windows window size flag");
requireSnippet(scrapeWindowsPath, scrapeWindows, "--window-count", "scrape windows window count flag");
requireSnippet(scrapeWindowsPath, scrapeWindows, "--start-offset", "scrape windows start offset flag");
requireSnippet(scrapeWindowsPath, scrapeWindows, "window_run_report_already_succeeded", "scrape windows resumable window skip");
requireSnippet(scrapeWindowsPath, scrapeWindows, "accepted_candidates", "scrape windows accepted candidate summary");

const sourceImportBatchPath = "scripts/catalog-source-import-batch.mjs";
const sourceImportBatch = read(sourceImportBatchPath);
requireSnippet(sourceImportBatchPath, sourceImportBatch, "catalog-source-targets.json", "source import batch source-target mapping");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "catalog-source-url-discovery.mjs", "source import batch URL discovery step");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "catalog-page-feed-extract.mjs", "source import batch page extraction step");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "catalog-official-feed-import.mjs", "source import batch SQL chunk step");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "target?.sourceSlug", "source import batch source slug mapping");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--emit-sql-rpc", "source import batch uses RPC import SQL");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--emit-sql-dir", "source import batch writes reviewable SQL directory");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--shopify-product-type-pattern", "source import batch forwards Shopify product type include filters");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--shopify-excluded-product-type-pattern", "source import batch forwards Shopify product type exclude filters");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "function expectedBrandTermsFor", "source import batch expected brand helper");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--expected-brand", "source import batch passes expected brand guard");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--required-source-url-pattern", "source import batch forwards discovery URL pattern to official feed importer");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--allow-source-brand-mismatch", "source import batch explicit brand mismatch override");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "expected_brand_terms", "source import batch reports expected brand terms");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--url-list", "source import batch accepts existing URL lists");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--required-url-pattern", "source import batch source URL allow-pattern");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "filtered_out_urls", "source import batch reports filtered URLs");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "function windowUrlList", "source import batch supports repeatable URL windows");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--url-offset", "source import batch URL window offset option");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--url-limit", "source import batch URL window limit option");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "url_offset", "source import batch reports URL window offset");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "url_limit", "source import batch reports URL window limit");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "function discoveryConfigFor", "source import batch source-specific discovery config");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "source_discovery", "source import batch reports source-specific discovery config");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "function applyDiscoveryUrlRules", "source import batch applies source-specific URL rules");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "trailingSlash", "source import batch supports slash-sensitive product URLs");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "extraTargetUrls", "source import batch passes extra source-target entry points");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--extra-sitemap", "source import batch forwards additional source discovery URLs");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--fetch-delay-ms", "source import batch page fetch delay option");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "discoveryArgs.push(\"--fetch-delay-ms\"", "source import batch forwards fetch delay to URL discovery");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "fetch_delay_ms", "source import batch reports page fetch delay");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "discoveryConfig.fetchDelayMs", "source import batch uses source-target fetch delay defaults");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--allow-partial-pages", "source import batch explicit partial-page extraction mode");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "allow_partial_pages", "source import batch reports partial-page extraction mode");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--prefer-page-brand", "source import batch can preserve page-level source brand");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "prefer_page_brand", "source import batch reports page-brand preservation mode");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--continue-on-error", "source import batch skips individual page fetch errors only in partial mode");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--discovery-timeout-ms", "source import batch discovery timeout");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "--extract-timeout-ms", "source import batch extraction timeout");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "complete_food_rows", "source import batch reports complete-food rows");
requireSnippet(sourceImportBatchPath, sourceImportBatch, "non_complete_rows", "source import batch reports non-complete rows");

const safeFetchPath = "scripts/catalog-safe-fetch.mjs";
const safeFetch = read(safeFetchPath);
requireSnippet(safeFetchPath, safeFetch, "hostLastFetchAt", "safe fetch tracks per-host fetch timing");
requireSnippet(safeFetchPath, safeFetch, "waitForHostDelay", "safe fetch applies per-host fetch delay");
requireSnippet(safeFetchPath, safeFetch, "fetchDelayMs", "safe fetch exposes fetch delay option");
requireSnippet(safeFetchPath, safeFetch, "If-None-Match", "safe fetch uses ETag revalidation");
requireSnippet(safeFetchPath, safeFetch, "If-Modified-Since", "safe fetch uses Last-Modified revalidation");

const farminaImportPath = "scripts/catalog-farmina-import-batch.mjs";
const farminaImport = read(farminaImportPath);
requireSnippet(farminaImportPath, farminaImport, "function cleanFarminaIngredientStatement", "Farmina import cleans ingredient text before validation");
requireSnippet(farminaImportPath, farminaImport, "\\bGuaranteed\\s+Analysis\\b", "Farmina import strips guaranteed analysis from ingredient evidence");
requireSnippet(farminaImportPath, farminaImport, "\\bCalorie\\s+Content\\b", "Farmina import strips calorie content from ingredient evidence");

const royalCaninImportPath = "scripts/catalog-royal-canin-algolia-import-batch.mjs";
const royalCaninImport = read(royalCaninImportPath);
requireSnippet(royalCaninImportPath, royalCaninImport, "prod_apif-products_en_US", "Royal Canin import uses the official US product index");
requireSnippet(royalCaninImportPath, royalCaninImport, "brand_code:royal_canin AND family:food", "Royal Canin import isolates official food products");
requireSnippet(royalCaninImportPath, royalCaninImport, "x-algolia-application-id", "Royal Canin import uses official site Algolia headers");
requireSnippet(royalCaninImportPath, royalCaninImport, "https://www.royalcanin.com/us/view-all-products", "Royal Canin import records official search page evidence");
requireSnippet(royalCaninImportPath, royalCaninImport, "hit.packs", "Royal Canin import creates package/barcode rows");
requireSnippet(royalCaninImportPath, royalCaninImport, "product_url", "Royal Canin import emits official product URLs");
requireSnippet(royalCaninImportPath, royalCaninImport, "ingredient_statement", "Royal Canin import emits ingredient statements");
requireSnippet(royalCaninImportPath, royalCaninImport, "intermittent|supplemental", "Royal Canin import marks supplemental diets as non-complete");
requireSnippet(royalCaninImportPath, royalCaninImport, "catalog-official-feed-import.mjs", "Royal Canin import delegates to official feed SQL exporter");
requireSnippet(royalCaninImportPath, royalCaninImport, "--expected-brand", "Royal Canin import preserves expected brand guard");
requireSnippet(royalCaninImportPath, royalCaninImport, "function dedupeSellableRows", "Royal Canin importer dedupes same sellable GTIN/package rows");
requireSnippet(royalCaninImportPath, royalCaninImport, "duplicate_sellable_conflict_rows", "Royal Canin importer reports conflicting same-GTIN official duplicates");
requireSnippet(royalCaninImportPath, royalCaninImport, "rowEvidenceScore", "Royal Canin importer chooses stronger package evidence for same-GTIN duplicates");
requireSnippet(royalCaninImportPath, royalCaninImport, "function copyIngredientEvidenceFromSameGtin", "Royal Canin importer can fill duplicate official GTIN rows from source-backed sibling ingredients");
requireSnippet(royalCaninImportPath, royalCaninImport, "ingredient_source_url", "Royal Canin importer records ingredient evidence URL separately from product URL");
requireSnippet(royalCaninImportPath, royalCaninImport, "same_gtin_ingredient_backfill_rows", "Royal Canin importer reports same-GTIN ingredient evidence backfills");

const nutroImportPath = "scripts/catalog-nutro-ocr-import-batch.mjs";
const nutroImport = read(nutroImportPath);
requireSnippet(nutroImportPath, nutroImport, "scripts/ocr-image-text.swift", "Nutro import uses Apple Vision OCR helper");
requireSnippet(nutroImportPath, nutroImport, "DEFAULT_BRAND", "OCR import keeps brand configurable");
requireSnippet(nutroImportPath, nutroImport, "--brand", "OCR import accepts a brand override");
requireSnippet(nutroImportPath, nutroImport, "label_ocr_verified", "Nutro import marks label-image OCR ingredient evidence");
requireSnippet(nutroImportPath, nutroImport, "htmlIngredientStatement", "Nutro import prefers official HTML ingredient text when present");
requireSnippet(nutroImportPath, nutroImport, "ingredient_image_url", "Nutro import records official ingredient image evidence");
requireSnippet(nutroImportPath, nutroImport, "productGalleryImageUrls", "OCR import scans current-product gallery images as an official evidence fallback");
requireSnippet(nutroImportPath, nutroImport, "productHeroHtml", "OCR import scopes gallery fallback before recommendation images");
requireSnippet(nutroImportPath, nutroImport, "[/^ingredients?\\b/i, /^feeding\\b/i]", "OCR import keeps guaranteed analysis separate from ingredients");
requireSnippet(nutroImportPath, nutroImport, "function ingredientStatementFromMarsNutritionOcr", "OCR import supports Mars nutrition-image ingredient text without an Ingredients heading");
requireSnippet(nutroImportPath, nutroImport, "function normalizeMarsLabeledIngredientCandidate", "OCR import trims Mars marketing text before inline Ingredients labels");
requireSnippet(nutroImportPath, nutroImport, "OCR_MODES", "OCR import tries multiple Apple Vision recognition modes");
requireSnippet(nutroImportPath, nutroImport, "fallbackOcrCandidates", "OCR import reparses fallback nutrition images for ingredient evidence");
requireSnippet(nutroImportPath, nutroImport, "selected_ocr_mode", "OCR import records the selected OCR mode for audit evidence");
requireSnippet(nutroImportPath, nutroImport, "function marsNutritionIngredientLabelStartIndex", "OCR import supports inline Mars Ingredients labels after marketing text");
requireSnippet(nutroImportPath, nutroImport, "function isMarsNutritionIngredientLead", "OCR import validates Mars inline ingredient labels before accepting OCR text");
requireSnippet(nutroImportPath, nutroImport, "from around the world\\s+ingredients", "OCR import rejects Mars marketing text before ingredient labels");
requireSnippet(nutroImportPath, nutroImport, "function isMarsNutritionImageSource", "OCR import gates Mars-specific OCR parsing by source domain");
requireSnippet(nutroImportPath, nutroImport, "rows_with_html_ingredients", "Nutro import reports HTML ingredient coverage");
requireSnippet(nutroImportPath, nutroImport, "rows_with_ocr_ingredients", "Nutro import reports OCR ingredient coverage");
requireSnippet(nutroImportPath, nutroImport, "catalog-official-feed-import.mjs", "Nutro import delegates to official feed SQL exporter");
requireSnippet(nutroImportPath, nutroImport, "--expected-brand", "Nutro import preserves expected brand guard");
requireSnippet(nutroImportPath, nutroImport, "expectedBrands", "OCR import preserves configurable expected-brand guards");
requireSnippet(nutroImportPath, nutroImport, "function parseDataLayerSettings", "OCR import reads page-level Mars data layer identity");
requireSnippet(nutroImportPath, nutroImport, "pageDataValue(dataLayerSettings", "OCR import prefers page-level pet type/form/life-stage data");

const naturalBalanceImportPath = "scripts/catalog-natural-balance-api-ocr-import-batch.mjs";
const naturalBalanceImport = read(naturalBalanceImportPath);
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "wp-json/wp/v2/product?per_page=100", "Natural Balance import uses the official WordPress product API");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "scripts/ocr-image-text.swift", "Natural Balance import uses Apple Vision OCR helper");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "sips", "Natural Balance import converts official label images before OCR");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "acf.ingredients_image", "Natural Balance import OCRs official ingredient-panel images");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "acf.fg_image", "Natural Balance import uses official product foreground images");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "acf.parent_gtin", "Natural Balance import reads available official GTIN identity");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "label_ocr_verified", "Natural Balance import marks label-image OCR ingredient evidence");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "Potassium Iodide", "Natural Balance import corrects iodine OCR confusion");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "Calcium Iodate", "Natural Balance import corrects iodate OCR confusion");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "lodate", "Natural Balance import rejects leftover iodate OCR artifacts");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "function isPlausibleIngredientStatement", "Natural Balance import gates OCR ingredient statements");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "catalog-official-feed-import.mjs", "Natural Balance import delegates to official feed SQL exporter");
requireSnippet(naturalBalanceImportPath, naturalBalanceImport, "--expected-brand", "Natural Balance import preserves expected brand guard");

const solidGoldImportPath = "scripts/catalog-solid-gold-shopify-ocr-import-batch.mjs";
const solidGoldImport = read(solidGoldImportPath);
requireSnippet(solidGoldImportPath, solidGoldImport, "solidgoldpet.com/products.json?limit=250", "Solid Gold import uses the official Shopify products JSON");
requireSnippet(solidGoldImportPath, solidGoldImport, "scripts/ocr-image-text.swift", "Solid Gold import uses Apple Vision OCR helper");
requireSnippet(solidGoldImportPath, solidGoldImport, "label_ocr_verified", "Solid Gold import marks official label OCR ingredient evidence");
requireSnippet(solidGoldImportPath, solidGoldImport, "ingredientCandidateScore", "Solid Gold import scores official label/ingredient panel images");
requireSnippet(solidGoldImportPath, solidGoldImport, "ingredient\\s+checklist", "Solid Gold import rejects ingredient-checklist marketing panels");
requireSnippet(solidGoldImportPath, solidGoldImport, "Potassium Iodide", "Solid Gold import corrects iodine OCR confusion");
requireSnippet(solidGoldImportPath, solidGoldImport, "Zinc $1", "Solid Gold import corrects zinc OCR confusion");
requireSnippet(solidGoldImportPath, solidGoldImport, "catalog-official-feed-import.mjs", "Solid Gold import delegates to official feed SQL exporter");
requireSnippet(solidGoldImportPath, solidGoldImport, "--expected-brand", "Solid Gold import preserves expected brand guard");

const canidaeImportPath = "scripts/catalog-canidae-bigcommerce-import-batch.mjs";
const canidaeImport = read(canidaeImportPath);
requireSnippet(canidaeImportPath, canidaeImport, "xmlsitemap.php?type=products&page=1", "CANIDAE import uses the official BigCommerce product sitemap");
requireSnippet(canidaeImportPath, canidaeImport, "window\\.stencilBootstrap\\(\"product\"", "CANIDAE import reads BigCommerce product bootstrap data");
requireSnippet(canidaeImportPath, canidaeImport, "ingredientsJSONPath", "CANIDAE import reads official CDN ingredient JSON paths");
requireSnippet(canidaeImportPath, canidaeImport, "https://canidae.com/graphql", "CANIDAE import reads Storefront GraphQL SKU and image identity");
requireSnippet(canidaeImportPath, canidaeImport, "normalizeSkuGtin", "CANIDAE import rejects internal non-GTIN SKUs");
requireSnippet(canidaeImportPath, canidaeImport, "PRODUCT_JSON_FALLBACKS", "CANIDAE import records reviewed official package-image fallbacks");
requireSnippet(canidaeImportPath, canidaeImport, "label_ocr_verified", "CANIDAE import marks reviewed package-image ingredient fallback evidence");
requireSnippet(canidaeImportPath, canidaeImport, "catalog-official-feed-import.mjs", "CANIDAE import delegates to official feed SQL exporter");
requireSnippet(canidaeImportPath, canidaeImport, "--expected-brand", "CANIDAE import preserves expected brand guard");

const instinctImportPath = "scripts/catalog-instinct-wp-api-import-batch.mjs";
const instinctImport = read(instinctImportPath);
requireSnippet(instinctImportPath, instinctImport, "wp-json/wp/v2/product?per_page=100&_embed", "Instinct import uses the official WordPress product API");
requireSnippet(instinctImportPath, instinctImport, "acf.ingredients", "Instinct import reads official ACF ingredient statements");
requireSnippet(instinctImportPath, instinctImport, "acf.product_images", "Instinct import reads official Salsify product image lists");
requireSnippet(instinctImportPath, instinctImport, "complete_&_balanced", "Instinct import uses complete-and-balanced evidence");
requireSnippet(instinctImportPath, instinctImport, "guaranteed_analysis", "Instinct import records guaranteed analysis rows");
requireSnippet(instinctImportPath, instinctImport, "variety pack", "Instinct import excludes multi-formula variety packs");
requireSnippet(instinctImportPath, instinctImport, "catalog-official-feed-import.mjs", "Instinct import delegates to official feed SQL exporter");
requireSnippet(instinctImportPath, instinctImport, "--expected-brand", "Instinct import preserves expected brand guard");

const tasteOfTheWildImportPath = "scripts/catalog-taste-of-the-wild-wp-api-import-batch.mjs";
const tasteOfTheWildImport = read(tasteOfTheWildImportPath);
requireSnippet(tasteOfTheWildImportPath, tasteOfTheWildImport, "wp-json/wp/v2/product?per_page=100&_embed", "Taste of the Wild import uses the official WordPress product API");
requireSnippet(tasteOfTheWildImportPath, tasteOfTheWildImport, "all-ingred-pills-list", "Taste of the Wild import reads official full ingredient blocks");
requireSnippet(tasteOfTheWildImportPath, tasteOfTheWildImport, "DEFAULT_FETCH_DELAY_MS = 10_000", "Taste of the Wild import respects the official crawl delay");
requireSnippet(tasteOfTheWildImportPath, tasteOfTheWildImport, "catalog-official-feed-import.mjs", "Taste of the Wild import delegates to official feed SQL exporter");
requireSnippet(tasteOfTheWildImportPath, tasteOfTheWildImport, "--expected-brand", "Taste of the Wild import preserves expected brand guard");

const honestKitchenImportPath = "scripts/catalog-the-honest-kitchen-shopify-import-batch.mjs";
const honestKitchenImport = read(honestKitchenImportPath);
requireSnippet(honestKitchenImportPath, honestKitchenImport, "sitemap_products_1.xml", "The Honest Kitchen import uses the official Shopify product sitemap");
requireSnippet(honestKitchenImportPath, honestKitchenImport, ".json", "The Honest Kitchen import reads public Shopify product JSON");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "variant.barcode", "The Honest Kitchen import expands UPC/package variants");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "aria-controls", "The Honest Kitchen import reads official Ingredients/Nutrition accordions");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "expandLabeledIngredientGroups", "The Honest Kitchen import expands official vitamin/mineral ingredient groups");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "minerals?\\*+", "The Honest Kitchen import replaces official mineral placeholders");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "vitamins?\\*+", "The Honest Kitchen import replaces official vitamin placeholders");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "--fetch-delay-ms", "The Honest Kitchen import supports respectful fetch pacing");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "if (value === null || value === undefined || value === \"\") return fallback;", "The Honest Kitchen fetch delay default is not coerced to zero");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "DEFAULT_FETCH_RETRIES", "The Honest Kitchen import retries rate-limited requests");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "base mix", "The Honest Kitchen import marks base mixes as non-complete");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "catalog-official-feed-import.mjs", "The Honest Kitchen import delegates to official feed SQL exporter");
requireSnippet(honestKitchenImportPath, honestKitchenImport, "--expected-brand", "The Honest Kitchen import preserves expected brand guard");

const iAndLoveAndYouImportPath = "scripts/catalog-i-and-love-and-you-shopify-import-batch.mjs";
const iAndLoveAndYouImport = read(iAndLoveAndYouImportPath);
requireSnippet(iAndLoveAndYouImportPath, iAndLoveAndYouImport, "iandloveandyou.com/products.json?limit=250", "I AND LOVE AND YOU import uses the official Shopify products JSON");
requireSnippet(iAndLoveAndYouImportPath, iAndLoveAndYouImport, ".js", "I AND LOVE AND YOU import reads per-product Shopify JSON for variants");
requireSnippet(iAndLoveAndYouImportPath, iAndLoveAndYouImport, "variant.barcode", "I AND LOVE AND YOU import expands GTIN/package variants");
requireSnippet(iAndLoveAndYouImportPath, iAndLoveAndYouImport, "ingredient list", "I AND LOVE AND YOU import reads official ingredient-list accordions");
requireSnippet(iAndLoveAndYouImportPath, iAndLoveAndYouImport, "guaranteed analysis", "I AND LOVE AND YOU import reads official guaranteed-analysis accordions");
requireSnippet(iAndLoveAndYouImportPath, iAndLoveAndYouImport, "FOOD_PRODUCT_TYPES", "I AND LOVE AND YOU import isolates official complete-food product types");
requireSnippet(iAndLoveAndYouImportPath, iAndLoveAndYouImport, "variety\\s+pack", "I AND LOVE AND YOU import excludes variety packs and multi-formula rows");
requireSnippet(iAndLoveAndYouImportPath, iAndLoveAndYouImport, "catalog-official-feed-import.mjs", "I AND LOVE AND YOU import delegates to official feed SQL exporter");
requireSnippet(iAndLoveAndYouImportPath, iAndLoveAndYouImport, "--expected-brand", "I AND LOVE AND YOU import preserves expected brand guard");

const bullyMaxImportPath = "scripts/catalog-bully-max-shopify-import-batch.mjs";
const bullyMaxImport = read(bullyMaxImportPath);
requireSnippet(bullyMaxImportPath, bullyMaxImport, "shop.bullymax.com/products.json?limit=250", "Bully Max import uses the official Shopify products JSON");
requireSnippet(bullyMaxImportPath, bullyMaxImport, ".js", "Bully Max import reads per-product Shopify JSON for variants");
requireSnippet(bullyMaxImportPath, bullyMaxImport, "variant.barcode", "Bully Max import expands GTIN/package variants");
requireSnippet(bullyMaxImportPath, bullyMaxImport, "ingredient list", "Bully Max import reads official ingredient-list sections");
requireSnippet(bullyMaxImportPath, bullyMaxImport, "guaranteed analysis", "Bully Max import reads official guaranteed-analysis sections");
requireSnippet(bullyMaxImportPath, bullyMaxImport, "MeaI", "Bully Max import corrects official letter artifacts");
requireSnippet(bullyMaxImportPath, bullyMaxImport, "FOOD_PRODUCT_TYPES", "Bully Max import isolates official complete-food product types");
requireSnippet(bullyMaxImportPath, bullyMaxImport, "dry\\s*&\\s*wet", "Bully Max import excludes dry/wet bundles and multi-formula rows");
requireSnippet(bullyMaxImportPath, bullyMaxImport, "catalog-official-feed-import.mjs", "Bully Max import delegates to official feed SQL exporter");
requireSnippet(bullyMaxImportPath, bullyMaxImport, "--expected-brand", "Bully Max import preserves expected brand guard");

const packagePath = "package.json";
const packageJson = read(packagePath);
requireSnippet(packagePath, packageJson, "\"catalog:opff-us-import\"", "full OPFF import script");
requireSnippet(packagePath, packageJson, "\"catalog:official-feed-import\"", "official feed import script");
requireSnippet(packagePath, packageJson, "\"catalog:official-feed-import-all\"", "bulk official feed import script");
requireSnippet(packagePath, packageJson, "\"catalog:authorized-feed-drop-import\"", "authorized feed drop import script");
requireSnippet(packagePath, packageJson, "\"catalog:verification-gaps\"", "catalog verification gap report script");
requireSnippet(packagePath, packageJson, "\"catalog:acquisition-queue\"", "catalog acquisition queue script");
requireSnippet(packagePath, packageJson, "\"catalog:direct-duplicate-audit-sql\"", "catalog direct duplicate audit SQL script");
requireSnippet(packagePath, packageJson, "\"catalog:community-noise-cleanup-sql\"", "catalog community noise cleanup SQL script");
requireSnippet(packagePath, packageJson, "\"catalog:queue-source-target-audit-sql\"", "catalog queue source-target audit SQL script");
requireSnippet(packagePath, packageJson, "\"catalog:source-targets\"", "catalog source target report script");
requireSnippet(packagePath, packageJson, "\"catalog:source-feed-worklist\"", "catalog source feed worklist script");
requireSnippet(packagePath, packageJson, "\"catalog:verified-duplicate-sweep\"", "catalog verified duplicate sweep script");
requireSnippet(packagePath, packageJson, "\"catalog:source-url-coverage\"", "catalog source URL coverage audit script");
requireSnippet(packagePath, packageJson, "\"catalog:source-import-batch\"", "catalog source import batch script");
requireSnippet(packagePath, packageJson, "\"catalog:live-gap-report\"", "generated SQL live gap report script");
requireSnippet(packagePath, packageJson, "\"catalog:retail-alias-review-pack\"", "retail alias review pack script");
requireSnippet(packagePath, packageJson, "\"catalog:retail-alias-review-import-sql\"", "retail alias review import SQL script");
requireSnippet(packagePath, packageJson, "\"catalog:retail-alias-auto-close-sql\"", "retail alias auto-close SQL script");
const communityNoiseCleanupSqlPath = "scripts/catalog-community-noise-cleanup-sql.mjs";
const communityNoiseCleanupSql = read(communityNoiseCleanupSqlPath);
requireSnippet(communityNoiseCleanupSqlPath, communityNoiseCleanupSql, "non_english_or_non_us_title", "community noise cleanup non-US classifier");
requireSnippet(communityNoiseCleanupSqlPath, communityNoiseCleanupSql, "poulet|bœuf|boeuf|volaille|saumon", "community noise cleanup explicit non-US language tokens");
forbidSnippet(communityNoiseCleanupSqlPath, communityNoiseCleanupSql, "[àâäéèêëîïôöùûüçœ]", "community noise cleanup must not classify accent-only titles as non-US");
const generatedSqlLiveGapReportPath = "scripts/catalog-generated-sql-live-gap-report.mjs";
const generatedSqlLiveGapReport = read(generatedSqlLiveGapReportPath);
requireSnippet(generatedSqlLiveGapReportPath, generatedSqlLiveGapReport, "\\bexpanded\\b", "generated SQL live gap report excludes expanded variant artifacts");

const queueSourceTargetAuditSqlPath = "scripts/catalog-queue-source-target-audit-sql.mjs";
const queueSourceTargetAuditSql = read(queueSourceTargetAuditSqlPath);
requireSnippet(queueSourceTargetAuditSqlPath, queueSourceTargetAuditSql, "Catalog queue source-target audit SQL", "queue source-target audit report title");
requireSnippet(queueSourceTargetAuditSqlPath, queueSourceTargetAuditSql, "catalog_acquisition_queue", "queue source-target audit reads acquisition queue");
requireSnippet(queueSourceTargetAuditSqlPath, queueSourceTargetAuditSql, "source_targets(", "queue source-target audit embeds source target manifest");
requireSnippet(queueSourceTargetAuditSqlPath, queueSourceTargetAuditSql, "operational_bucket", "queue source-target audit operational bucket");
requireSnippet(queueSourceTargetAuditSqlPath, queueSourceTargetAuditSql, "runnable_official_source", "queue source-target audit runnable source bucket");
requireSnippet(queueSourceTargetAuditSqlPath, queueSourceTargetAuditSql, "authorized_retailer_feed_required", "queue source-target audit retailer feed bucket");
requireSnippet(queueSourceTargetAuditSqlPath, queueSourceTargetAuditSql, "unmapped_source_target", "queue source-target audit unmapped bucket");
requireSnippet(packagePath, packageJson, "\"catalog:royal-canin-import-batch\"", "Royal Canin official index import script");
requireSnippet(packagePath, packageJson, "\"catalog:nutro-ocr-import-batch\"", "Nutro official OCR import script");
requireSnippet(packagePath, packageJson, "\"catalog:pedigree-ocr-import-batch\"", "Pedigree official OCR import script");
requireSnippet(packagePath, packageJson, "\"catalog:iams-ocr-import-batch\"", "IAMS official OCR import script");
requireSnippet(packagePath, packageJson, "\"catalog:cesar-ocr-import-batch\"", "Cesar official OCR import script");
requireSnippet(packagePath, packageJson, "\"catalog:sheba-ocr-import-batch\"", "Sheba official OCR import script");
requireSnippet(packagePath, packageJson, "\"catalog:crave-ocr-import-batch\"", "Crave official OCR import script");
requireSnippet(packagePath, packageJson, "\"catalog:eukanuba-ocr-import-batch\"", "Eukanuba official OCR import diagnostic script");
requireSnippet(packagePath, packageJson, "\"catalog:stella-and-chewys-import-batch\"", "Stella & Chewy's source import script");
requireSnippet(packagePath, packageJson, "\"catalog:tiki-pets-import-batch\"", "TIKI PETS source import script");
requireSnippet(packagePath, packageJson, "\"catalog:weruva-import-batch\"", "Weruva source import script");
requireSnippet(packagePath, packageJson, "\"catalog:nutrish-import-batch\"", "Nutrish source import script");
requireSnippet(packagePath, packageJson, "\"catalog:instinct-import-batch\"", "Instinct official API import script");
requireSnippet(packagePath, packageJson, "\"catalog:merrick-import-batch\"", "Merrick source import script");
requireSnippet(packagePath, packageJson, "\"catalog:orijen-import-batch\"", "Orijen source import script");
requireSnippet(packagePath, packageJson, "\"catalog:acana-import-batch\"", "ACANA source import script");
requireSnippet(packagePath, packageJson, "\"catalog:victor-import-batch\"", "VICTOR source import script");
requireSnippet(packagePath, packageJson, "\"catalog:taste-of-the-wild-import-batch\"", "Taste of the Wild official API import script");
requireSnippet(packagePath, packageJson, "\"catalog:earthborn-holistic-import-batch\"", "Earthborn Holistic source import script");
requireSnippet(packagePath, packageJson, "\"catalog:go-solutions-import-batch\"", "Go! Solutions source import script");
requireSnippet(packagePath, packageJson, "\"catalog:now-fresh-import-batch\"", "Now Fresh source import script");
requireSnippet(packagePath, packageJson, "\"catalog:freshpet-import-batch\"", "Freshpet source import script");
requireSnippet(packagePath, packageJson, "\"catalog:fromm-import-batch\"", "Fromm source import script");
requireSnippet(packagePath, packageJson, "\"catalog:natural-balance-api-ocr-import-batch\"", "Natural Balance official API OCR import script");
requireSnippet(packagePath, packageJson, "\"catalog:diamond-pet-foods-import-batch\"", "Diamond Pet Foods source import script");
requireSnippet(packagePath, packageJson, "\"catalog:the-honest-kitchen-import-batch\"", "The Honest Kitchen source import script");
requireSnippet(packagePath, packageJson, "\"catalog:i-and-love-and-you-import-batch\"", "I AND LOVE AND YOU official Shopify import script");
requireSnippet(packagePath, packageJson, "\"catalog:bully-max-import-batch\"", "Bully Max official Shopify import script");
requireSnippet(packagePath, packageJson, "\"catalog:solid-gold-import-batch\"", "Solid Gold official Shopify OCR import script");
requireSnippet(packagePath, packageJson, "\"catalog:canidae-import-batch\"", "CANIDAE official BigCommerce import script");
requireSnippet(packagePath, packageJson, "\"catalog:retailer-snapshot-import-batch\"", "generic retailer browser snapshot import script");
requireSnippet(packagePath, packageJson, "\"catalog:petco-snapshot-import-batch\"", "Petco browser snapshot import script");
requireSnippet(packagePath, packageJson, "\"catalog:source-url-discovery\"", "catalog source URL discovery script");
requireSnippet(packagePath, packageJson, "\"catalog:page-feed-extract\"", "catalog page feed extractor script");
requireSnippet(packagePath, packageJson, "\"check:catalog-source-targets\"", "catalog source target check script");
requireSnippet(packagePath, packageJson, "\"check:catalog-completeness\"", "catalog completeness check script");

const fixtureImport = spawnSync(process.execPath, [
  officialImportPath,
  "--file",
  "scripts/fixtures/catalog-official-feed.csv",
  "--source",
  "fixture",
  "--dry-run",
], {
  encoding: "utf8",
});

if (fixtureImport.status !== 0) {
  fail(`official feed fixture import failed: ${fixtureImport.stderr || fixtureImport.stdout}`);
} else {
  requireSnippet("official feed fixture output", fixtureImport.stdout, "Input rows: 4", "fixture input row count");
  requireSnippet("official feed fixture output", fixtureImport.stdout, "Normalized rows: 2", "fixture normalized row count");
  requireSnippet("official feed fixture output", fixtureImport.stdout, "missing_image", "fixture missing image skip reason");
  requireSnippet("official feed fixture output", fixtureImport.stdout, "missing_source_url", "fixture missing source evidence skip reason");
}

const brothFixtureImport = spawnSync(process.execPath, [
  officialImportPath,
  "--file",
  "scripts/fixtures/catalog-official-feed-broth.csv",
  "--source",
  "fixture-broth",
  "--dry-run",
], {
  encoding: "utf8",
});

if (brothFixtureImport.status !== 0) {
  fail(`official feed broth fixture import failed: ${brothFixtureImport.stderr || brothFixtureImport.stdout}`);
} else {
  requireSnippet("official feed broth fixture output", brothFixtureImport.stdout, "Input rows: 2", "broth fixture input row count");
  requireSnippet("official feed broth fixture output", brothFixtureImport.stdout, "Normalized rows: 1", "broth fixture normalized row count");
  requireSnippet("official feed broth fixture output", brothFixtureImport.stdout, "non_product_catalog_row", "broth fixture excludes explicit broth topper");
}

const pastedFixtureDir = fs.mkdtempSync(`${tempRoot}/woof-catalog-pasted-fixture-`);
const pastedFixturePath = `${pastedFixtureDir}/official-feed-pasted.csv`;
const pastedIngredient = "Beef, Chicken, Carrots, Potatoes, Beef Bone Broth, Sunflower Oil, Spinach, Potassium Chloride, Choline Chloride, Vitamins (Vitamin E Supplement, Thiamine Mononitrate, Niacin Supplement, Vitamin A Supplement), Minerals (Zinc Proteinate, Iron Proteinate, Copper Proteinate, Manganese Proteinate), Rosemary.";
fs.writeFileSync(pastedFixturePath, [
  "gtin,product_name,brand,pet_type,ingredient_text,image_url,source_url,is_complete_food,nutrient_panel",
  `00011122233369,Fixture Beef Stew Wet Dog Food,Fixture,dog,""" id=""isPasted"">"">${pastedIngredient}",https://example.com/fixture-beef-stew-front.jpg,https://example.com/products/fixture-beef-stew,true,"Crude Protein Min 8 %, Crude Fat Min 5 %, Crude Fiber Max 1.5 %, Moisture Max 78 %"`,
  "",
].join("\n"), "utf8");
const pastedFixtureSqlExport = spawnSync(process.execPath, [
  officialImportPath,
  "--file",
  pastedFixturePath,
  "--source",
  "fixture",
  "--emit-sql-rpc",
  "--sql-payload-format",
  "base64",
], {
  encoding: "utf8",
});

if (pastedFixtureSqlExport.status !== 0) {
  fail(`official feed pasted fixture SQL export failed: ${pastedFixtureSqlExport.stderr || pastedFixtureSqlExport.stdout}`);
} else {
  const payloadMatch = pastedFixtureSqlExport.stdout.match(/decode\('([^']+)', 'base64'\)/);
  if (!payloadMatch) {
    fail("official feed pasted fixture SQL output: missing base64 payload");
  } else {
    const rows = JSON.parse(Buffer.from(payloadMatch[1], "base64").toString("utf8"));
    if (rows[0]?.ingredient_text !== pastedIngredient) {
      fail(`official feed pasted fixture SQL output: ingredient text was not cleaned (${rows[0]?.ingredient_text || "missing"})`);
    }
    if (rows[0]?.ingredient_text?.split(",")[0] !== "Beef") {
      fail(`official feed pasted fixture SQL output: first ingredient was not cleaned (${rows[0]?.ingredient_text?.split(",")[0] || "missing"})`);
    }
  }
  if (pastedFixtureSqlExport.stdout.includes("isPasted")) {
    fail("official feed pasted fixture SQL output leaked isPasted markup");
  }
}

const fixtureSqlExport = spawnSync(process.execPath, [
  officialImportPath,
  "--file",
  "scripts/fixtures/catalog-official-feed.csv",
  "--source",
  "fixture",
  "--emit-sql",
  "--sql-limit",
  "1",
], {
  encoding: "utf8",
});

if (fixtureSqlExport.status !== 0) {
  fail(`official feed fixture SQL export failed: ${fixtureSqlExport.stderr || fixtureSqlExport.stdout}`);
} else {
  requireSnippet("official feed fixture SQL output", fixtureSqlExport.stdout, "INSERT INTO public.product_data", "fixture SQL insert");
  requireSnippet("official feed fixture SQL output", fixtureSqlExport.stdout, "jsonb_to_recordset", "fixture compact SQL payload");
  requireSnippet("official feed fixture SQL output", fixtureSqlExport.stdout, "ON CONFLICT (cache_key) DO UPDATE", "fixture SQL upsert");
  requireSnippet("official feed fixture SQL output", fixtureSqlExport.stderr, "Normalized rows: 2", "fixture SQL normalized row count");
  requireSnippet("official feed fixture SQL output", fixtureSqlExport.stderr, "SQL rows: 1", "fixture SQL window row count");
}

const fixtureBase64SqlExport = spawnSync(process.execPath, [
  officialImportPath,
  "--file",
  "scripts/fixtures/catalog-official-feed.csv",
  "--source",
  "fixture",
  "--emit-sql",
  "--sql-limit",
  "1",
  "--sql-payload-format",
  "base64",
], {
  encoding: "utf8",
});

if (fixtureBase64SqlExport.status !== 0) {
  fail(`official feed fixture base64 SQL export failed: ${fixtureBase64SqlExport.stderr || fixtureBase64SqlExport.stdout}`);
} else {
  requireSnippet("official feed fixture base64 SQL output", fixtureBase64SqlExport.stdout, "convert_from(decode", "fixture base64 SQL payload");
  requireSnippet("official feed fixture base64 SQL output", fixtureBase64SqlExport.stderr, "SQL payload format: base64", "fixture base64 SQL payload log");
}

const fixtureHexSqlExport = spawnSync(process.execPath, [
  officialImportPath,
  "--file",
  "scripts/fixtures/catalog-official-feed.csv",
  "--source",
  "fixture",
  "--emit-sql-rpc",
  "--sql-limit",
  "1",
  "--sql-payload-format",
  "hex",
], {
  encoding: "utf8",
});

if (fixtureHexSqlExport.status !== 0) {
  fail(`official feed fixture hex SQL export failed: ${fixtureHexSqlExport.stderr || fixtureHexSqlExport.stdout}`);
} else {
  requireSnippet("official feed fixture hex SQL output", fixtureHexSqlExport.stdout, "decode('5b7b", "fixture hex SQL payload");
  requireSnippet("official feed fixture hex SQL output", fixtureHexSqlExport.stdout, "'hex'", "fixture hex SQL decode mode");
  requireSnippet("official feed fixture hex SQL output", fixtureHexSqlExport.stdout, "md5(payload_text)", "fixture hex SQL checksum guard");
  requireSnippet("official feed fixture hex SQL output", fixtureHexSqlExport.stderr, "SQL payload format: hex", "fixture hex SQL payload log");
}

const fixtureRpcSqlExport = spawnSync(process.execPath, [
  officialImportPath,
  "--file",
  "scripts/fixtures/catalog-official-feed.csv",
  "--source",
  "fixture",
  "--emit-sql-rpc",
  "--sql-limit",
  "1",
  "--sql-payload-format",
  "base64",
], {
  encoding: "utf8",
});

if (fixtureRpcSqlExport.status !== 0) {
  fail(`official feed fixture RPC SQL export failed: ${fixtureRpcSqlExport.stderr || fixtureRpcSqlExport.stdout}`);
} else {
  requireSnippet("official feed fixture RPC SQL output", fixtureRpcSqlExport.stdout, "upsert_catalog_product_feed", "fixture RPC SQL function call");
  requireSnippet("official feed fixture RPC SQL output", fixtureRpcSqlExport.stdout, "convert_from(decode", "fixture RPC base64 SQL payload");
  requireSnippet("official feed fixture RPC SQL output", fixtureRpcSqlExport.stdout, "md5(payload_text)", "fixture RPC SQL checksum guard");
  requireSnippet("official feed fixture RPC SQL output", fixtureRpcSqlExport.stderr, "SQL mode: rpc", "fixture RPC SQL mode log");
}

const fixtureSqlDir = fs.mkdtempSync(`${tempRoot}/woof-catalog-quality-sql-chunks-`);
const staleFixtureChunk = `${fixtureSqlDir}/9999-fixture-rpc-offset-999-rows-99.sql`;
fs.writeFileSync(staleFixtureChunk, "-- stale chunk should be removed\n", "utf8");
const fixtureRpcSqlDirExport = spawnSync(process.execPath, [
  officialImportPath,
  "--file",
  "scripts/fixtures/catalog-official-feed.csv",
  "--source",
  "fixture",
  "--emit-sql-rpc",
  "--emit-sql-dir",
  fixtureSqlDir,
  "--sql-chunk-size",
  "1",
  "--sql-payload-format",
  "base64",
], {
  encoding: "utf8",
});

if (fixtureRpcSqlDirExport.status !== 0) {
  fail(`official feed fixture RPC SQL directory export failed: ${fixtureRpcSqlDirExport.stderr || fixtureRpcSqlDirExport.stdout}`);
} else {
  requireSnippet("official feed fixture RPC SQL directory output", fixtureRpcSqlDirExport.stdout, "Wrote 2 SQL chunk file(s)", "fixture RPC SQL chunk count");
  requireSnippet("official feed fixture RPC SQL directory output", fixtureRpcSqlDirExport.stdout, "Manifest:", "fixture RPC SQL chunk manifest");
  requireSnippet("official feed fixture RPC SQL directory output", fixtureRpcSqlDirExport.stderr, "SQL chunk size: 1", "fixture RPC SQL chunk size log");

  const manifestPath = `${fixtureSqlDir}/manifest.json`;
  const refreshPath = `${fixtureSqlDir}/9999-refresh-catalog-acquisition-queue.sql`;
  const manifest = read(manifestPath);
  const refreshSql = read(refreshPath);
  requireSnippet(manifestPath, manifest, "\"chunk_size\": 1", "fixture RPC SQL manifest chunk size");
  requireSnippet(manifestPath, manifest, "\"mode\": \"rpc\"", "fixture RPC SQL manifest mode");
  requireSnippet(refreshPath, refreshSql, "refresh_catalog_acquisition_queue", "fixture RPC SQL refresh call");
  requireSnippet(refreshPath, refreshSql, "reconcile_catalog_acquisition_queue", "fixture RPC SQL reconcile call");

  const chunkFiles = fs.readdirSync(fixtureSqlDir).filter((file) => /-rpc-offset-\d+-rows-1\.sql$/.test(file));
  if (chunkFiles.length !== 2) {
    fail(`official feed fixture RPC SQL directory output: expected 2 chunk files, found ${chunkFiles.length}`);
  } else {
    const chunkSql = read(`${fixtureSqlDir}/${chunkFiles[0]}`);
    requireSnippet(chunkFiles[0], chunkSql, "upsert_catalog_product_feed", "fixture RPC SQL chunk function call");
    requireSnippet(chunkFiles[0], chunkSql, "convert_from(decode", "fixture RPC SQL chunk base64 payload");
    requireSnippet(chunkFiles[0], chunkSql, "md5(payload_text)", "fixture RPC SQL chunk checksum guard");
  }

  if (fs.existsSync(staleFixtureChunk)) {
    fail("official feed fixture RPC SQL directory output: stale chunk file was not removed");
  }
}

const fixtureHexMcpDir = fs.mkdtempSync(`${tempRoot}/woof-catalog-quality-hex-mcp-`);
const fixtureHexMcpExport = spawnSync(process.execPath, [
  officialImportPath,
  "--file",
  "scripts/fixtures/catalog-official-feed.csv",
  "--source",
  "fixture",
  "--emit-sql-rpc",
  "--emit-sql-dir",
  fixtureHexMcpDir,
  "--sql-chunk-size",
  "1",
  "--sql-mcp-group-size",
  "2",
  "--sql-payload-format",
  "hex",
], {
  encoding: "utf8",
});

if (fixtureHexMcpExport.status !== 0) {
  fail(`official feed fixture hex MCP SQL export failed: ${fixtureHexMcpExport.stderr || fixtureHexMcpExport.stdout}`);
} else {
  requireSnippet("official feed fixture hex MCP SQL directory output", fixtureHexMcpExport.stdout, "Wrote 1 MCP group SQL file(s)", "fixture hex MCP SQL group count");
  requireSnippet("official feed fixture hex MCP SQL directory output", fixtureHexMcpExport.stderr, "SQL payload format: hex", "fixture hex MCP SQL payload log");

  const mcpGroupFiles = fs.readdirSync(fixtureHexMcpDir).filter((file) => /^mcp-.*-rpc-offset-\d+-rows-2\.sql$/.test(file));
  if (mcpGroupFiles.length !== 1) {
    fail(`official feed fixture hex MCP SQL directory output: expected 1 group file, found ${mcpGroupFiles.length}`);
  } else {
    const groupSql = read(`${fixtureHexMcpDir}/${mcpGroupFiles[0]}`);
    requireSnippet(mcpGroupFiles[0], groupSql, "WITH payloads(row_number, expected_md5, payload_hex) AS", "fixture hex MCP SQL compact payload table");
    requireSnippet(mcpGroupFiles[0], groupSql, "convert_from(decode(payload_hex, 'hex'), 'UTF8')", "fixture hex MCP SQL shared decode");
    requireSnippet(mcpGroupFiles[0], groupSql, "md5(payload_text) = expected_md5", "fixture hex MCP SQL checksum guard");
    requireSnippet(mcpGroupFiles[0], groupSql, "upsert_catalog_product_feed(payload)", "fixture hex MCP SQL shared RPC call");
  }
}

const sourceTargetReport = spawnSync(process.execPath, [
  sourceTargetsReportPath,
], {
  encoding: "utf8",
});

if (sourceTargetReport.status !== 0) {
  fail(`source target report failed: ${sourceTargetReport.stderr || sourceTargetReport.stdout}`);
} else {
  requireSnippet("source target report output", sourceTargetReport.stdout, "Catalog source targets report", "source target report title");
  requireSnippet("source target report output", sourceTargetReport.stdout, "Manifest brands:", "source target report manifest count");
}

const sourceFeedWorklistReport = spawnSync(process.execPath, [
  sourceFeedWorklistPath,
], {
  encoding: "utf8",
});

if (sourceFeedWorklistReport.status !== 0) {
  fail(`source feed worklist failed: ${sourceFeedWorklistReport.stderr || sourceFeedWorklistReport.stdout}`);
} else {
  requireSnippet("source feed worklist output", sourceFeedWorklistReport.stdout, "Set SUPABASE_SERVICE_ROLE_KEY for a live prioritized worklist", "source feed worklist service role guard");
  requireSnippet("source feed worklist output", sourceFeedWorklistReport.stdout, "catalog_acquisition_queue", "source feed worklist fallback SQL");
}

const sourceFeedWorklistFixtureDir = fs.mkdtempSync(`${tempRoot}/woof-catalog-source-feed-worklist-`);
const sourceFeedWorklistQueuePath = `${sourceFeedWorklistFixtureDir}/queue.json`;
const sourceFeedWorklistOutputDir = `${sourceFeedWorklistFixtureDir}/output`;
const sourceFeedWorklistImportRoot = `${sourceFeedWorklistFixtureDir}/import-root`;
const sourceFeedWorklistImportDir = `${sourceFeedWorklistImportRoot}/blue-buffalo-general-mills`;
const sourceFeedWorklistTemplateDir = `${sourceFeedWorklistFixtureDir}/templates`;
fs.mkdirSync(`${sourceFeedWorklistImportDir}/sql`, { recursive: true });
fs.writeFileSync(`${sourceFeedWorklistImportDir}/report.json`, JSON.stringify({
  generated_at: "2026-06-01T00:00:00.000Z",
  source: "blue-buffalo-general-mills",
  feed: {
    rows: 4,
    complete_food_rows: 4,
    rows_with_ingredients: 4,
    rows_with_images: 4,
  },
  import_warnings: "Input rows: 4 Normalized rows: 3 SQL rows: 3",
}, null, 2), "utf8");
fs.writeFileSync(`${sourceFeedWorklistImportDir}/run-report.json`, JSON.stringify({
  generated_at: "2026-06-02T00:00:00.000Z",
  source: "blue-buffalo-general-mills",
  status: "skipped",
  reason: "changed_only_recent_report",
}, null, 2), "utf8");
fs.writeFileSync(`${sourceFeedWorklistImportDir}/sql/manifest.json`, JSON.stringify({
  generated_at: "2026-06-01T00:00:00.000Z",
  source: "blue-buffalo-general-mills",
  total_sql_rows: 3,
  chunks: [{ file: "0001.sql", rows: 3 }],
}, null, 2), "utf8");
fs.writeFileSync(sourceFeedWorklistQueuePath, JSON.stringify([
  {
    brand: "Blue Buffalo",
    gap_type: "product",
    priority_score: 80,
    affected_product_count: 1,
    demand_events: 4,
    needs_verified_ingredients: true,
    needs_verified_image: true,
    needs_pet_type: false,
    product_name: "BLUE Wilderness Adult Chicken Recipe Dry Dog Food",
    pet_type: "dog",
    sample_metadata: { sources: ["amazon"] },
  },
], null, 2));

const sourceFeedWorklistFixtureReport = spawnSync(process.execPath, [
  sourceFeedWorklistPath,
  "--fixture-queue-json",
  sourceFeedWorklistQueuePath,
  "--import-root",
  sourceFeedWorklistImportRoot,
  "--output-dir",
  sourceFeedWorklistOutputDir,
  "--template-dir",
  sourceFeedWorklistTemplateDir,
  "--template-sample-limit",
  "1",
  "--json",
], {
  encoding: "utf8",
});

if (sourceFeedWorklistFixtureReport.status !== 0) {
  fail(`source feed worklist fixture failed: ${sourceFeedWorklistFixtureReport.stderr || sourceFeedWorklistFixtureReport.stdout}`);
} else {
  const rows = JSON.parse(sourceFeedWorklistFixtureReport.stdout);
  const blueRow = rows.find((row) => row.sourceSlug === "blue-buffalo-general-mills");
  if (blueRow?.localSqlRows !== 3) {
    fail(`source feed worklist fixture localSqlRows was ${blueRow?.localSqlRows}, expected 3 from SQL manifest`);
  }
  if (!String(blueRow?.localReportPath || "").endsWith("report.json")) {
    fail(`source feed worklist fixture localReportPath was ${blueRow?.localReportPath}, expected data-bearing report.json over skipped run-report.json`);
  }
  if (blueRow?.localRejectedRows !== 1) {
    fail(`source feed worklist fixture localRejectedRows was ${blueRow?.localRejectedRows}, expected 1`);
  }
  const templateFiles = fs.readdirSync(sourceFeedWorklistTemplateDir).filter((file) => file.endsWith(".csv"));
  if (templateFiles.length !== 1) {
    fail(`source feed worklist fixture wrote ${templateFiles.length} template files, expected 1`);
  } else {
    const templateCsv = read(`${sourceFeedWorklistTemplateDir}/${templateFiles[0]}`);
    const [headerLine, sampleLine] = templateCsv.trimEnd().split("\n");
    const headers = headerLine.split(",");
    const values = sampleLine.split(",");
    const templateValue = (name) => values[headers.indexOf(name)] || "";
    requireSnippet("source feed worklist fixture template", templateCsv, "BLUE Wilderness Adult Chicken Recipe Dry Dog Food", "prefilled product name");
    requireSnippet("source feed worklist fixture template", templateCsv, "Blue Buffalo", "prefilled brand");
    if (templateValue("pet_type") !== "dog") {
      fail(`source feed worklist fixture pet_type was ${templateValue("pet_type")}, expected dog`);
    }
    if (templateValue("is_complete_food") !== "true") {
      fail(`source feed worklist fixture is_complete_food was ${templateValue("is_complete_food")}, expected true`);
    }
    for (const evidenceColumn of ["ingredient_statement", "product_image_url", "product_url"]) {
      if (templateValue(evidenceColumn) !== "") {
        fail(`source feed worklist fixture should leave ${evidenceColumn} blank until verified evidence is supplied`);
      }
    }
  }
}

const sourceFeedWorklistEvidencePath = `${sourceFeedWorklistFixtureDir}/evidence.json`;
const sourceFeedWorklistEvidenceOutputDir = `${sourceFeedWorklistFixtureDir}/evidence-output`;
const sourceFeedWorklistEvidenceTemplateDir = `${sourceFeedWorklistFixtureDir}/evidence-templates`;
fs.writeFileSync(sourceFeedWorklistEvidencePath, JSON.stringify([
  {
    cache_key: "fixture-blue-dog",
    brand: "Blue Buffalo",
    source: "amazon",
    product_name: "BLUE Life Protection Formula Adult Chicken and Brown Rice Dry Dog Food",
    product_line: "Life Protection Formula",
    flavor: "Chicken and Brown Rice",
    life_stage: "adult",
    food_form: "dry",
    package_size: "30 lb",
    pet_type: "dog",
    gtin: "00085942000123",
    ingredient_verification_status: "unverified",
    image_verification_status: "unverified",
    source_url: "",
    image_url: "",
    ingredient_text: "",
    ingredient_count: 0,
    is_complete_food: true,
    catalog_exclusion_reason: "",
    expires_at: null,
  },
], null, 2));

const sourceFeedWorklistEvidenceReport = spawnSync(process.execPath, [
  sourceFeedWorklistPath,
  "--evidence-gaps",
  "--fixture-evidence-json",
  sourceFeedWorklistEvidencePath,
  "--output-dir",
  sourceFeedWorklistEvidenceOutputDir,
  "--template-dir",
  sourceFeedWorklistEvidenceTemplateDir,
  "--template-sample-limit",
  "1",
  "--json",
], {
  encoding: "utf8",
});

if (sourceFeedWorklistEvidenceReport.status !== 0) {
  fail(`source feed worklist evidence fixture failed: ${sourceFeedWorklistEvidenceReport.stderr || sourceFeedWorklistEvidenceReport.stdout}`);
} else {
  const templateFiles = fs.readdirSync(sourceFeedWorklistEvidenceTemplateDir).filter((file) => file.endsWith(".csv"));
  if (templateFiles.length !== 1) {
    fail(`source feed worklist evidence fixture wrote ${templateFiles.length} template files, expected 1`);
  } else {
    const templateCsv = read(`${sourceFeedWorklistEvidenceTemplateDir}/${templateFiles[0]}`);
    const [headerLine, sampleLine] = templateCsv.trimEnd().split("\n");
    const headers = headerLine.split(",");
    const values = sampleLine.split(",");
    const templateValue = (name) => values[headers.indexOf(name)] || "";
    if (templateValue("gtin") !== "00085942000123") {
      fail(`source feed worklist evidence fixture gtin was ${templateValue("gtin")}, expected 00085942000123`);
    }
    if (templateValue("product_line") !== "Life Protection Formula") {
      fail(`source feed worklist evidence fixture product_line was ${templateValue("product_line")}, expected Life Protection Formula`);
    }
    if (templateValue("flavor") !== "Chicken and Brown Rice") {
      fail(`source feed worklist evidence fixture flavor was ${templateValue("flavor")}, expected Chicken and Brown Rice`);
    }
    if (templateValue("food_form") !== "dry") {
      fail(`source feed worklist evidence fixture food_form was ${templateValue("food_form")}, expected dry`);
    }
    if (templateValue("package_size") !== "30 lb") {
      fail(`source feed worklist evidence fixture package_size was ${templateValue("package_size")}, expected 30 lb`);
    }
    for (const evidenceColumn of ["ingredient_statement", "product_image_url", "product_url"]) {
      if (templateValue(evidenceColumn) !== "") {
        fail(`source feed worklist evidence fixture should leave ${evidenceColumn} blank until verified evidence is supplied`);
      }
    }
  }
}

const pageFeedExtractFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-page.html",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractFixture.status !== 0) {
  fail(`page feed extractor fixture failed: ${pageFeedExtractFixture.stderr || pageFeedExtractFixture.stdout}`);
} else {
  requireSnippet("page feed extractor fixture output", pageFeedExtractFixture.stdout, "840243100015", "fixture GTIN");
  requireSnippet("page feed extractor fixture output", pageFeedExtractFixture.stdout, "Blue Buffalo", "fixture brand");
  requireSnippet("page feed extractor fixture output", pageFeedExtractFixture.stdout, "Deboned Chicken", "fixture ingredients");
  requireSnippet("page feed extractor fixture output", pageFeedExtractFixture.stdout, "https://example.com/images/blue-buffalo-adult-chicken-30-lb.jpg", "fixture image URL");
  requireSnippet("page feed extractor fixture output", pageFeedExtractFixture.stdout, "adult", "fixture life stage");
  requireSnippet("page feed extractor fixture output", pageFeedExtractFixture.stdout, "dry", "fixture food form");
}

const pageFeedExtractNonCompleteFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-non-complete-page.html",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractNonCompleteFixture.status !== 0) {
  fail(`page feed extractor non-complete fixture failed: ${pageFeedExtractNonCompleteFixture.stderr || pageFeedExtractNonCompleteFixture.stdout}`);
} else {
  requireSnippet("page feed extractor non-complete fixture output", pageFeedExtractNonCompleteFixture.stdout, "Blue Buffalo Tastefuls Chicken Puree Cat Treats", "non-complete fixture product");
  requireSnippet("page feed extractor non-complete fixture output", pageFeedExtractNonCompleteFixture.stdout, ",false,", "non-complete fixture complete-food false flag");
}

const pageFeedExtractSupplementalFeedingFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-supplemental-feeding-page.html",
  "--brand",
  "Nulo",
], {
  encoding: "utf8",
});

if (pageFeedExtractSupplementalFeedingFixture.status !== 0) {
  fail(`page feed extractor supplemental-feeding fixture failed: ${pageFeedExtractSupplementalFeedingFixture.stderr || pageFeedExtractSupplementalFeedingFixture.stdout}`);
} else {
  requireSnippet("page feed extractor supplemental-feeding fixture output", pageFeedExtractSupplementalFeedingFixture.stdout, "Nulo Freestyle Meaty Pouches Beef, Beef Liver & Kale Recipe for Dogs", "supplemental-feeding fixture product");
  requireSnippet("page feed extractor supplemental-feeding fixture output", pageFeedExtractSupplementalFeedingFixture.stdout, ",false,", "supplemental-feeding fixture complete-food false flag");
}

const pageFeedExtractCompleteFeedingFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-complete-feeding-page.html",
  "--brand",
  "Nulo",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractCompleteFeedingFixture.status !== 0) {
  fail(`page feed extractor complete-feeding fixture failed: ${pageFeedExtractCompleteFeedingFixture.stderr || pageFeedExtractCompleteFeedingFixture.stdout}`);
} else {
  requireSnippet("page feed extractor complete-feeding fixture output", pageFeedExtractCompleteFeedingFixture.stdout, "Nulo Challenger High-Protein Kibble Alpine Ranch Beef, Lamb & Pork Recipe", "complete-feeding fixture product");
  requireSnippet("page feed extractor complete-feeding fixture output", pageFeedExtractCompleteFeedingFixture.stdout, ",true,", "complete-feeding fixture complete-food true flag");
}

const pageFeedExtractPurinaFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-purina-list-page.html",
  "--brand",
  "Purina Pro Plan",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractPurinaFixture.status !== 0) {
  fail(`page feed extractor Purina fixture failed: ${pageFeedExtractPurinaFixture.stderr || pageFeedExtractPurinaFixture.stdout}`);
} else {
  requireSnippet("page feed extractor Purina fixture output", pageFeedExtractPurinaFixture.stdout, "Pro Plan Adult Digestive Support Salmon", "Purina fixture product");
  requireSnippet("page feed extractor Purina fixture output", pageFeedExtractPurinaFixture.stdout, "\"Salmon, Oat Meal, Rice, Barley, Canola Meal, Fish Meal, Salmon Meal, Beef Fat Preserved With Mixed-Tocopherols\"", "Purina fixture comma-separated ingredients");
  forbidSnippet("page feed extractor Purina fixture output", pageFeedExtractPurinaFixture.stdout, "View All Ingredients", "Purina fixture excludes ingredient UI tail");
}

const pageFeedExtractWetSauceFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-wet-sauce-complete-page.html",
  "--brand",
  "Purina Pro Plan",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractWetSauceFixture.status !== 0) {
  fail(`page feed extractor wet sauce fixture failed: ${pageFeedExtractWetSauceFixture.stderr || pageFeedExtractWetSauceFixture.stdout}`);
} else {
  requireSnippet("page feed extractor wet sauce fixture output", pageFeedExtractWetSauceFixture.stdout, "Pro Plan Indoor Balance Salmon Entrée in Sauce Wet Cat Food", "wet sauce fixture product");
  requireSnippet("page feed extractor wet sauce fixture output", pageFeedExtractWetSauceFixture.stdout, ",true,", "wet sauce fixture complete-food true flag");
}

const pageFeedExtractElementorTabsFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-elementor-tabs-page.html",
  "--brand",
  "Bil-Jac",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractElementorTabsFixture.status !== 0) {
  fail(`page feed extractor Elementor tabs fixture failed: ${pageFeedExtractElementorTabsFixture.stderr || pageFeedExtractElementorTabsFixture.stdout}`);
} else {
  requireSnippet("page feed extractor Elementor tabs fixture output", pageFeedExtractElementorTabsFixture.stdout, "Bil-Jac Chunky Stew with Chicken & Vegetables Wet Dog Food", "Elementor tabs fixture product");
  requireSnippet("page feed extractor Elementor tabs fixture output", pageFeedExtractElementorTabsFixture.stdout, "Chicken Broth, Chicken, Egg Product", "Elementor tabs fixture ingredients");
  requireSnippet("page feed extractor Elementor tabs fixture output", pageFeedExtractElementorTabsFixture.stdout, "Crude Protein, not less than 8.0%", "Elementor tabs fixture guaranteed analysis");
  forbidSnippet("page feed extractor Elementor tabs fixture output", pageFeedExtractElementorTabsFixture.stdout, "For adult dogs, feed three trays", "Elementor tabs fixture excludes feeding copy");
}

const pageFeedExtractFirstMateFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-firstmate-page.html",
  "--brand",
  "FirstMate",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractFirstMateFixture.status !== 0) {
  fail(`page feed extractor FirstMate fixture failed: ${pageFeedExtractFirstMateFixture.stderr || pageFeedExtractFirstMateFixture.stdout}`);
} else {
  requireSnippet("page feed extractor FirstMate fixture output", pageFeedExtractFirstMateFixture.stdout, "SKOKI Can: Coastal 12.2oz - 12 Cans", "FirstMate fixture product");
  requireSnippet("page feed extractor FirstMate fixture output", pageFeedExtractFirstMateFixture.stdout, "dog", "FirstMate fixture AAFCO pet type");
  requireSnippet("page feed extractor FirstMate fixture output", pageFeedExtractFirstMateFixture.stdout, "Water sufficient for processing, Salmon, Whitefish, Boneless chicken", "FirstMate fixture displayed ingredients");
  requireSnippet("page feed extractor FirstMate fixture output", pageFeedExtractFirstMateFixture.stdout, "Crude Protein (min) 11%", "FirstMate fixture guaranteed analysis table");
  forbidSnippet("page feed extractor FirstMate fixture output", pageFeedExtractFirstMateFixture.stdout, "Description text that must not be included", "FirstMate fixture excludes ingredient popover text");
}

const pageFeedExtractJinxFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-jinx-page.html",
  "--brand",
  "Jinx",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractJinxFixture.status !== 0) {
  fail(`page feed extractor Jinx fixture failed: ${pageFeedExtractJinxFixture.stderr || pageFeedExtractJinxFixture.stdout}`);
} else {
  requireSnippet("page feed extractor Jinx fixture output", pageFeedExtractJinxFixture.stdout, "Cage-Free Chicken, Turkey, & Duck Dry Cat Food", "Jinx fixture product");
  requireSnippet("page feed extractor Jinx fixture output", pageFeedExtractJinxFixture.stdout, ",cat,\"Chicken, Chicken Meal", "Jinx fixture cat pet type and ingredients");
  requireSnippet("page feed extractor Jinx fixture output", pageFeedExtractJinxFixture.stdout, "Crude Protein Min 30 %", "Jinx fixture guaranteed analysis table");
}

const pageFeedExtractRawzFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-rawz-page.html",
  "--brand",
  "Rawz",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractRawzFixture.status !== 0) {
  fail(`page feed extractor RAWZ fixture failed: ${pageFeedExtractRawzFixture.stderr || pageFeedExtractRawzFixture.stdout}`);
} else {
  requireSnippet("page feed extractor RAWZ fixture output", pageFeedExtractRawzFixture.stdout, "10+ Essentials Fish & Dehydrated Fish Cat Food Recipe", "RAWZ fixture product");
  requireSnippet("page feed extractor RAWZ fixture output", pageFeedExtractRawzFixture.stdout, "Salmon, Cod, Trout, Pollock, Herring", "RAWZ fixture ingredient-item list");
  requireSnippet("page feed extractor RAWZ fixture output", pageFeedExtractRawzFixture.stdout, "https://rawznaturalpetfood.com/product/10-essentials-fish-and-dehydrated-fish-cat-food/", "RAWZ fixture canonical product URL");
  forbidSnippet("page feed extractor RAWZ fixture output", pageFeedExtractRawzFixture.stdout, "https://rawznaturalpetfood.com/where-to-buy/", "RAWZ fixture skips where-to-buy JSON-LD URL");
  forbidSnippet("page feed extractor RAWZ fixture output", pageFeedExtractRawzFixture.stdout, "Tooltip text that must not be included", "RAWZ fixture excludes ingredient tooltip text");
}

const pageFeedExtractPetSmartFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-petsmart-flight-page.html",
  "--brand",
  "Authority",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractPetSmartFixture.status !== 0) {
  fail(`page feed extractor PetSmart fixture failed: ${pageFeedExtractPetSmartFixture.stderr || pageFeedExtractPetSmartFixture.stdout}`);
} else {
  requireSnippet("page feed extractor PetSmart fixture output", pageFeedExtractPetSmartFixture.stdout, "Authority Everyday Health Adult Dry Dog Food - Chicken & Rice", "PetSmart fixture product");
  requireSnippet("page feed extractor PetSmart fixture output", pageFeedExtractPetSmartFixture.stdout, "0737257782747", "PetSmart fixture GTIN");
  requireSnippet("page feed extractor PetSmart fixture output", pageFeedExtractPetSmartFixture.stdout, "Deboned Chicken, Chicken Meal, Brown Rice", "PetSmart fixture ingredients");
  requireSnippet("page feed extractor PetSmart fixture output", pageFeedExtractPetSmartFixture.stdout, "Crude Protein (min) 25.5%", "PetSmart fixture guaranteed analysis");
}

const pageFeedExtractPetSmartHeadingFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-petsmart-heading-page.html",
  "--brand",
  "Authority",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractPetSmartHeadingFixture.status !== 0) {
  fail(`page feed extractor PetSmart heading fixture failed: ${pageFeedExtractPetSmartHeadingFixture.stderr || pageFeedExtractPetSmartHeadingFixture.stdout}`);
} else {
  requireSnippet("page feed extractor PetSmart heading fixture output", pageFeedExtractPetSmartHeadingFixture.stdout, "Authority Healthy Weight Large Breed Adult Dog Dry Food", "PetSmart heading fixture product");
  requireSnippet("page feed extractor PetSmart heading fixture output", pageFeedExtractPetSmartHeadingFixture.stdout, "Deboned Chicken, Chicken Meal, Brown Rice", "PetSmart heading fixture ingredients");
  requireSnippet("page feed extractor PetSmart heading fixture output", pageFeedExtractPetSmartHeadingFixture.stdout, "Crude Protein (min) 26.0%", "PetSmart heading fixture guaranteed analysis");
  forbidSnippet("page feed extractor PetSmart heading fixture output", pageFeedExtractPetSmartHeadingFixture.stdout, "Caloric Content", "PetSmart heading fixture excludes calorie content from guaranteed analysis");
}

const pageFeedExtractMarketingIngredientsFixture = spawnSync(process.execPath, [
  pageFeedExtractPath,
  "--html",
  "scripts/fixtures/catalog-product-marketing-ingredients-page.html",
  "--brand",
  "Purina Pro Plan",
  "--strict",
], {
  encoding: "utf8",
});

if (pageFeedExtractMarketingIngredientsFixture.status === 0) {
  fail("page feed extractor marketing-copy fixture should fail strict extraction without exact ingredients");
} else {
  requireSnippet("page feed extractor marketing-copy fixture output", pageFeedExtractMarketingIngredientsFixture.stderr, "missing ingredient_statement", "marketing-copy fixture rejects prose ingredients");
}

const sourceUrlDiscoverySitemapFixture = spawnSync(process.execPath, [
  sourceUrlDiscoveryPath,
  "--sitemap",
  "scripts/fixtures/catalog-source-sitemap.xml",
  "--min-score",
  "3",
], {
  encoding: "utf8",
});

if (sourceUrlDiscoverySitemapFixture.status !== 0) {
  fail(`source URL discovery sitemap fixture failed: ${sourceUrlDiscoverySitemapFixture.stderr || sourceUrlDiscoverySitemapFixture.stdout}`);
} else {
  requireSnippet("source URL discovery sitemap fixture output", sourceUrlDiscoverySitemapFixture.stdout, "/products/blue-buffalo-life-protection", "sitemap fixture dog product URL");
  requireSnippet("source URL discovery sitemap fixture output", sourceUrlDiscoverySitemapFixture.stdout, "/products/fancy-feast", "sitemap fixture cat product URL");
  requireSnippet("source URL discovery sitemap fixture output", sourceUrlDiscoverySitemapFixture.stdout, "/en-us/products/blue-buffalo-sensitive-stomach", "sitemap fixture allows explicit US locale URL");
  forbidSnippet("source URL discovery sitemap fixture output", sourceUrlDiscoverySitemapFixture.stdout, "/en-ca/products/blue-buffalo-canadian", "sitemap fixture excludes non-US locale URL");
  forbidSnippet("source URL discovery sitemap fixture output", sourceUrlDiscoverySitemapFixture.stdout, "/blog/", "sitemap fixture excludes blog URL");
  forbidSnippet("source URL discovery sitemap fixture output", sourceUrlDiscoverySitemapFixture.stdout, "/collections/", "sitemap fixture excludes collection URL");
  forbidSnippet("source URL discovery sitemap fixture output", sourceUrlDiscoverySitemapFixture.stdout, "/product-finder/", "sitemap fixture excludes product finder category URL");
  forbidSnippet("source URL discovery sitemap fixture output", sourceUrlDiscoverySitemapFixture.stdout, "/natural-dog-food/", "sitemap fixture excludes brand category URL");
  forbidSnippet("source URL discovery sitemap fixture output", sourceUrlDiscoverySitemapFixture.stdout, "/dog/food-toppers", "sitemap fixture excludes food-topper category URL");
}

const sourceUrlDiscoveryHtmlFixture = spawnSync(process.execPath, [
  sourceUrlDiscoveryPath,
  "--html",
  "scripts/fixtures/catalog-source-collection.html",
  "--source-url",
  "https://example.com/collections/dog-food",
  "--min-score",
  "3",
], {
  encoding: "utf8",
});

if (sourceUrlDiscoveryHtmlFixture.status !== 0) {
  fail(`source URL discovery HTML fixture failed: ${sourceUrlDiscoveryHtmlFixture.stderr || sourceUrlDiscoveryHtmlFixture.stdout}`);
} else {
  requireSnippet("source URL discovery HTML fixture output", sourceUrlDiscoveryHtmlFixture.stdout, "/products/open-farm", "HTML fixture dog product URL");
  requireSnippet("source URL discovery HTML fixture output", sourceUrlDiscoveryHtmlFixture.stdout, "/products/royal-canin", "HTML fixture cat product URL");
  requireSnippet("source URL discovery HTML fixture output", sourceUrlDiscoveryHtmlFixture.stdout, "/dogs/shop/pro-plan-advantedge", "HTML fixture Purina product URL");
  forbidSnippet("source URL discovery HTML fixture output", sourceUrlDiscoveryHtmlFixture.stdout, "/pro-plan/products/dog-food", "HTML fixture excludes Pro Plan category URL");
  forbidSnippet("source URL discovery HTML fixture output", sourceUrlDiscoveryHtmlFixture.stdout, "/en-ca/products/open-farm-canada", "HTML fixture excludes non-US locale URL");
  forbidSnippet("source URL discovery HTML fixture output", sourceUrlDiscoveryHtmlFixture.stdout, "/blogs/", "HTML fixture excludes blog URL");
  forbidSnippet("source URL discovery HTML fixture output", sourceUrlDiscoveryHtmlFixture.stdout, "/cart", "HTML fixture excludes cart URL");
}

if (failures.length > 0) {
  console.error("Catalog quality check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Catalog quality check passed");
