#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const claudeSource = fs.readFileSync(path.join(root, "services/claude.js"), "utf8");
const scannerSource = fs.readFileSync(path.join(root, "screens/ScannerScreen.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`scan latency guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  /const ocr = ingredientBase64[\s\S]{0,120}ocrIngredients\(ingredientBase64, productName, \{ signal \}\)[\s\S]{0,120}reason: "no_ingredient_photo"/.test(analysisSource),
  "photo_with_ingredients estimate fallback must skip OCR immediately when no ingredient label image exists"
);

	assert(
	  (() => {
		    const noLabelStart = analysisSource.indexOf("if (!ingredientBase64) {");
		    const fallbackStart = analysisSource.indexOf("Ingredient estimate lookup missed", noLabelStart);
		    const block = analysisSource.slice(noLabelStart, fallbackStart);
		    const localPromise = block.indexOf("const skippedLabelLocalPromise = _getSpeciesLocalResult(realCacheKey, replayFallbackKeys, resolvedPetType).catch((err) => {");
		    const sharedPromise = block.indexOf("const skippedLabelCachedPromise = _getSpeciesCachedAnalysis(realCacheKey, replayFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {");
		    const ingredientLookupPromise = block.indexOf("skippedLabelIngredientLookupPromise = lookupIngredients(lookupName, { signal, timeoutMs: INGREDIENT_ESTIMATE_LOOKUP_TIMEOUT_MS }).catch((err) => {");
		    const replay = block.indexOf("const skippedLabelReplay = await _firstCompletedReplayResult(");
		    const ingredientLookup = block.indexOf("const ingredientLookup = await skippedLabelIngredientLookupPromise;");
		    return noLabelStart !== -1 &&
		      fallbackStart !== -1 &&
		      localPromise !== -1 &&
		      sharedPromise !== -1 &&
		      ingredientLookupPromise !== -1 &&
		      replay !== -1 &&
		      ingredientLookup !== -1 &&
		      localPromise < sharedPromise &&
		      sharedPromise < ingredientLookupPromise &&
		      ingredientLookupPromise < replay &&
		      replay < ingredientLookup &&
	      block.includes("Skip-label INSTANT (local cache)") &&
	      block.includes("Skip-label INSTANT (shared cache)") &&
	      block.includes('phase: "looking_up_ingredients"') &&
		      block.includes("ingredientLookup?.found && ingredientLookup.ingredients?.length >= 5") &&
		      block.includes('analyzeWithData(opffProduct, undefined, { onUpdate, signal, cacheKey: analysisKey, lookupType: "name", cacheAliases: targetAnalysisKeys, clientProStatus: isPro === true })');
	  })(),
	  "skip-label estimate flow must replay local/shared cached scores before bounded ingredient lookup and slower full-photo analysis"
	);

assert(
  analysisSource.includes("const identifiedProductBaseKey = mode === \"photo_with_ingredients\"") &&
    analysisSource.includes("`${identifiedProductBaseKey}__estimate`") &&
    analysisSource.includes("`${realCacheKey}__estimate`") &&
    analysisSource.includes('state.dataSource = "gpt"') &&
    analysisSource.includes('_stampIngredientProvenance(analysis, "gpt")'),
  "AI ingredient estimates must use separate estimate cache keys and provenance"
);

assert(
  /export async function lookupIngredients\(productName, \{ signal, timeoutMs = 12000 \} = \{\}\)/.test(claudeSource) &&
    /_startTimedRequest\("lookupIngredients", timeoutMs, signal\)/.test(claudeSource) &&
    analysisSource.includes("const INGREDIENT_ESTIMATE_LOOKUP_TIMEOUT_MS = 4_500") &&
    analysisSource.includes("lookupIngredients(lookupName, { signal, timeoutMs: INGREDIENT_ESTIMATE_LOOKUP_TIMEOUT_MS })"),
  "ingredient estimate lookup must be cancellable and use a shorter skip-label scan budget"
);

assert(
  !/ocrIngredients\(ingredientBase64, productName, \{ signal \}\);\s*if \(signal\.aborted\) return;/.test(analysisSource),
  "photo_with_ingredients must not unconditionally call OCR before checking ingredientBase64"
);

assert(
  scannerSource.includes('import * as analysisService from "../services/analysisService";') &&
    scannerSource.includes("const { checkSession, isPro } = useAuth();") &&
    /if \(!resized\?\.base64\) \{[\s\S]{0,180}Could not prepare the photo[\s\S]{0,80}return;[\s\S]{0,80}\}\s*try \{[\s\S]{0,80}analysisService\.startAnalysis\(\{[\s\S]{0,120}mode: isHumanFood \? "human_food" : "photo",[\s\S]{0,120}base64: resized\.base64,[\s\S]{0,80}uri: photo\.uri,[\s\S]{0,80}petType,[\s\S]{0,80}isPro,[\s\S]{0,160}\}\);[\s\S]{0,160}\} catch \(err\) \{[\s\S]{0,120}Background analysis start failed[\s\S]{0,120}\}\s*navigation\.push\("Results"/.test(scannerSource),
  "front-photo captures must pre-start analysis after image preparation and before Results navigation"
);

assert(
  claudeSource.includes('_startTimedRequest("Stream response", 30000, signal)') &&
    claudeSource.includes('_startTimedRequest("Photo analysis", 60000, signal)') &&
    claudeSource.includes('_startTimedRequest("Verified analysis", 60000, signal)') &&
    claudeSource.includes('_startTimedRequest("Human food analysis", 45000, signal)') &&
    !claudeSource.includes('_startTimedRequest("Photo analysis", 90000, signal)') &&
    !claudeSource.includes('_startTimedRequest("Verified analysis", 90000, signal)'),
  "failed streaming plus fallback must not recreate a near-2-minute scan path"
);

assert(
  analysisSource.includes("const BARCODE_ANALYSIS_CACHE_TIMEOUT_MS = 1800") &&
    analysisSource.includes("const CATALOG_ANALYSIS_CACHE_TIMEOUT_MS = 2500") &&
    analysisSource.includes("const SEARCH_SELECTED_PRODUCT_DATA_TIMEOUT_MS = 2_500") &&
    analysisSource.includes("const SEARCH_FALLBACK_PRODUCT_DATA_TIMEOUT_MS = 4_000") &&
    analysisSource.includes("const PHOTO_PRODUCT_DATA_TIMEOUT_MS = 4_500") &&
	    analysisSource.includes("const cachedPromise = (requestedPetType") &&
	    analysisSource.includes("_getSpeciesCachedAnalysis(barcode, null, requestedPetType, { signal, timeoutMs: BARCODE_ANALYSIS_CACHE_TIMEOUT_MS })") &&
	    analysisSource.includes('_getSingleSpeciesOrLegacyCachedAnalysis(barcode, "barcode", { signal, timeoutMs: BARCODE_ANALYSIS_CACHE_TIMEOUT_MS })') &&
		    analysisSource.includes("const lookupPromise = lookupBarcode(barcode, { signal })") &&
		    analysisSource.includes("const barcodeReplay = await _firstCompletedReplayResult(") &&
		    analysisSource.includes('barcodeReplay?.source === "local"') &&
		    analysisSource.includes('barcodeReplay?.source === "shared"') &&
		    analysisSource.includes("const lookup = await lookupPromise") &&
		    analysisSource.includes("const opffNameReplayPromise = opffNameBaseKey") &&
		    analysisSource.includes("_getSpeciesCachedAnalysis(opffNameBaseKey, opffNameFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {") &&
		    analysisSource.includes("const localCatalogPromise = _getSpeciesLocalResult(catalogBaseKey, catalogFallbackKeys, resolvedPetType).catch((err) => {") &&
		    analysisSource.includes("const cachedCatalogPromise = _getSpeciesCachedAnalysis(catalogBaseKey, catalogFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {") &&
		    analysisSource.includes("const catalogReplayResult = await _firstCompletedReplayResult(") &&
		    analysisSource.includes("const cachedAnalysisPromise = _getSpeciesCachedAnalysis(sharedCacheKey, searchFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {") &&
			    analysisSource.includes("const cachedAnalysisPromise = _getSpeciesCachedAnalysis(sharedCacheKey, photoFallbackKeys, petType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {") &&
		    analysisSource.includes("function _identifiedProductFallbackKeys({ productName, brand, variant, excludeKey })") &&
		    analysisSource.includes("const identifiedFallbackKeys = _identifiedProductFallbackKeys({") &&
		    analysisSource.includes("const identifiedFallbackAnalysisKeys = identifiedFallbackKeys") &&
		    analysisSource.includes("const identifiedLocalPromise = _getSpeciesLocalResult(realCacheKey, identifiedFallbackKeys, petType).catch((err) => {") &&
		    analysisSource.includes("const identifiedCachedPromise = _getSpeciesCachedAnalysis(realCacheKey, identifiedFallbackKeys, petType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {") &&
		    analysisSource.includes("const dbResultPromise = getProductData(idObj, undefined, { signal, timeoutMs: PHOTO_PRODUCT_DATA_TIMEOUT_MS }).catch((err) => {") &&
		    analysisSource.includes("const identifiedReplay = await _firstCompletedReplayResult(") &&
		    analysisSource.includes("_saveLocalResultCopies([identifiedCachedResult.cacheKey, serviceAnalysisKey, ...identifiedFallbackAnalysisKeys], replayed, state.dataSource, state.opffData);") &&
				    analysisSource.includes("const skippedLabelCachedPromise = _getSpeciesCachedAnalysis(realCacheKey, replayFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {") &&
				    analysisSource.includes("const skippedLabelReplay = await _firstCompletedReplayResult(") &&
		    analysisSource.includes("const routeReplayPromise = exactSelectedCacheKey && !selectedSnapshot") &&
		    analysisSource.includes("const exactProductDataPromise = exactSelectedCacheKey && !selectedSnapshot") &&
		    analysisSource.includes("getProductDataByCacheKey(exactSelectedCacheKey, { signal, timeoutMs: SEARCH_SELECTED_PRODUCT_DATA_TIMEOUT_MS })") &&
		    analysisSource.includes("const selectedRace = await Promise.race([") &&
		    analysisSource.includes("type: \"product_data\"") &&
		    analysisSource.includes("type: \"replay\"") &&
		    analysisSource.includes("dbResult = await getProductData(productName, brand, { signal, timeoutMs: SEARCH_FALLBACK_PRODUCT_DATA_TIMEOUT_MS });") &&
		    analysisSource.includes("let dbResult = await dbResultPromise;"),
  "scan flows must cap shared analysis-cache and product-data waits so slow Supabase reads cannot stall first-score fallback"
);

assert(
  analysisSource.includes("const REPLAY_MISS_FALLTHROUGH_MS = 450") &&
    /async function _firstCompletedReplayResult\(localPromise, sharedPromise, mode, signal = null, maxWaitMs = 0\)[\s\S]{0,340}deadlinePromise = maxWaitMs > 0[\s\S]{0,240}resolve\(\{ timedOut: true, index: -1 \}\)[\s\S]{0,700}if \(settled\.timedOut\) return null;/.test(analysisSource) &&
    /const barcodeReplay = await _firstCompletedReplayResult\([\s\S]{0,180}"barcode",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(analysisSource) &&
    /const opffNameReplayPromise = opffNameBaseKey[\s\S]{0,620}"barcode",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(analysisSource) &&
    /const catalogReplayResult = await _firstCompletedReplayResult\([\s\S]{0,180}"barcode",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(analysisSource) &&
    /const routeReplayPromise = exactSelectedCacheKey && !selectedSnapshot[\s\S]{0,620}"search",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(analysisSource) &&
    /const replayResult = await _firstCompletedReplayResult\([\s\S]{0,180}"search",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(analysisSource) &&
    /const photoReplayResult = await _firstCompletedReplayResult\([\s\S]{0,180}"photo",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(analysisSource) &&
    /const skippedLabelReplay = await _firstCompletedReplayResult\([\s\S]{0,180}"photo_with_ingredients",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(analysisSource) &&
    /const identifiedReplay = await _firstCompletedReplayResult\([\s\S]{0,180}"photo",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(analysisSource),
  "parallel barcode/search/photo lookup paths must stop waiting on slow cache misses after a short replay deadline"
);

for (const [fn, mode, fallbackLog] of [
  ["analyzeIngredients", "photo", "Streaming failed, falling back to non-streaming"],
  ["analyzeWithData", "verified", "Streaming failed, falling back to non-streaming"],
  ["analyzeHumanFood", "human_food", "Human food streaming failed, falling back to non-streaming"],
]) {
  const start = claudeSource.indexOf(`export async function ${fn}`);
  const end = claudeSource.indexOf("\nexport async function ", start + 1);
  const body = claudeSource.slice(start, end === -1 ? undefined : end);

  assert(start !== -1, `${fn} must exist`);
  assert(
    !/for\s*\(\s*let attempt\s*=\s*0\s*;\s*attempt\s*<\s*2\s*;/.test(body) &&
      !body.includes("attempt 1 failed, retrying") &&
      !body.includes("failed after 2 attempts"),
    `${fn} must not spend two streaming deadlines before non-streaming fallback`
  );
  assert(
    new RegExp(`_callStreaming\\([\\s\\S]{0,180}mode: "${mode}"[\\s\\S]{0,240}\\} catch \\(err\\) \\{[\\s\\S]{0,120}signal\\?\\.aborted\\) throw err;[\\s\\S]{0,160}${fallbackLog}`).test(body),
    `${fn} must try streaming once, preserve cancellation, then fall back to non-streaming`
  );
  assert(
    /if \(err\.code === "REQUEST_TIMEOUT"\) throw err;[\s\S]{0,160}falling back to non-streaming/.test(body),
    `${fn} must not stack non-streaming fallback after the streaming deadline times out`
  );
}

assert(
  packageJson.includes('"test:scan-latency": "node scripts/test-scan-latency-guards.js"') &&
    packageJson.includes("npm run test:scan-latency"),
  "scan latency guard must be wired into package scripts"
);

console.log("scan latency guard passed");
