#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analysisSource = fs.readFileSync(
  path.join(root, "services/analysisService.js"),
  "utf8"
);
const resultsSource = fs.readFileSync(
  path.join(root, "screens/ResultsScreen/index.js"),
  "utf8"
);
const claudeSource = fs.readFileSync(
  path.join(root, "services/claude.js"),
  "utf8"
);
const componentsSource = fs.readFileSync(
  path.join(root, "screens/ResultsScreen/components.js"),
  "utf8"
);
const errorsSource = fs.readFileSync(
  path.join(root, "services/errors.js"),
  "utf8"
);
const timeoutStart = analysisSource.indexOf("async function _withTimeout");
const timeoutEnd = analysisSource.indexOf("/**\n * Subscribe", timeoutStart);
const timeoutBlock = analysisSource.slice(timeoutStart, timeoutEnd);
const analysisTimeoutMatch = analysisSource.match(/const ANALYSIS_TIMEOUT_MS = (\d+);/);

function assert(condition, message) {
  if (!condition) {
    console.error(`analysis completion guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  analysisTimeoutMatch &&
    Number(analysisTimeoutMatch[1]) <= 70000 &&
    analysisSource.includes("longest Claude client request deadline (60s)"),
  "analysis hard timeout must stay near the request deadline so Results cannot keep loading for another minute"
);

assert(
  claudeSource.includes("function completionValidationError") &&
    claudeSource.includes("missing overallScore") &&
    claudeSource.includes("missing safetyLevel"),
  "Claude streaming must validate pet-food and human-food final objects"
);

assert(
  /const validationError = completionValidationError\(mode, final\);[\s\S]{0,160}throw new Error\(`Incomplete Claude stream: \$\{validationError\}`\);[\s\S]{0,80}onUpdate\(final\);/.test(claudeSource),
  "incomplete final streams must throw before final onUpdate"
);

assert(
  analysisSource.includes("INCOMPLETE_ANALYSIS_ERROR") &&
    analysisSource.includes("function _validateCompletedResult") &&
    analysisSource.includes("function _guardCompletedAnalysis") &&
    analysisSource.includes("function _failInvalidCompletion"),
  "analysis service must have a shared completion validation gate"
);

assert(
  analysisSource.includes("function _createCatalogPreview(product, source)") &&
    analysisSource.includes("scorePending: true") &&
    analysisSource.includes("Verified ingredient; scoring is still in progress.") &&
    analysisSource.includes("function _mergeCatalogPreview(partial, preview, source)") &&
    analysisSource.includes("ingredients: hasCompleteIngredientList ? partialIngredients : preview.ingredients") &&
    analysisSource.includes("function _publishCatalogPreview({ state, notifyKey, product, source })") &&
    /function _publishCatalogPreview[\s\S]{0,220}_notify\(\{ type: "update", cacheKey: notifyKey, result: preview, opffData: product \}\);/.test(analysisSource),
  "catalog-backed scans must publish a non-terminal verified-ingredient preview while score generation is still running"
);

assert(
  [...analysisSource.matchAll(/_publishCatalogPreview\(\{/g)].length >= 5 &&
    [...analysisSource.matchAll(/_mergeCatalogPreview\(partial, catalogPreview/g)].length >= 5 &&
    !/scorePending[\s\S]{0,120}_saveLocalResult/.test(analysisSource),
  "catalog previews must be merged into streaming updates across catalog-backed branches without being saved as completed results"
);

assert(
  analysisSource.includes("function _cacheKeySpellingVariants(cacheKey)") &&
    analysisSource.includes("const variants = new Set([key])") &&
    analysisSource.includes("for (const existing of [...variants])") &&
    analysisSource.includes("if (variants.size >= 32) break;") &&
    analysisSource.includes("variants.delete(key)") &&
    analysisSource.includes('[/grain free/g, "grainfree"]') &&
    analysisSource.includes('[/grainfree/g, "grain free"]') &&
    analysisSource.includes('[/raw mix/g, "rawmix"]') &&
    analysisSource.includes('[/rawmix/g, "raw mix"]') &&
    analysisSource.includes("function _normalizeCacheKeyVariants(...values)") &&
    /function _catalogNameFallbackKeys[\s\S]{0,260}\.\.\._normalizeCacheKeyVariants\(catalogProductName\)[\s\S]{0,220}\.\.\.\(catalogBrand && catalogProductName \? _normalizeCacheKeyVariants\(`\$\{catalogBrand\} \$\{catalogProductName\}`\) : \[\]\)[\s\S]{0,260}\.\.\._normalizeCacheKeyVariants\(routeProductName\)/.test(analysisSource) &&
    /function _identifiedProductFallbackKeys[\s\S]{0,260}\.\.\.\(brand && productName \? _normalizeCacheKeyVariants\(`\$\{brand\} \$\{productName\}`\) : \[\]\)[\s\S]{0,220}\.\.\.\(variant && productName \? _normalizeCacheKeyVariants\(`\$\{productName\} \$\{variant\}`\) : \[\]\)/.test(analysisSource),
  "catalog replay aliases must include conservative normalized spelling variants so grain-free/raw-mix style cache keys can reuse existing scores without loosening product matching"
);

assert(
  (() => {
    const barcodeStart = analysisSource.indexOf("async function _runBarcode(");
    const searchStart = analysisSource.indexOf("async function _runSearch(");
    const humanStart = analysisSource.indexOf("\n// ── Human food flow", searchStart);
    const photoStart = analysisSource.indexOf("async function _runPhoto(");
    const localResultStart = analysisSource.indexOf("\n// ── Local result cache", photoStart);
    const barcodeBody = analysisSource.slice(barcodeStart, searchStart);
    const searchBody = analysisSource.slice(searchStart, humanStart);
    const photoBody = analysisSource.slice(photoStart, localResultStart);
    const previewBeforeReplay = (body, previewNeedle, replayNeedle) => {
      const previewIndex = body.indexOf(previewNeedle);
      const replayIndex = body.indexOf(replayNeedle);
      return previewIndex !== -1 && replayIndex !== -1 && previewIndex < replayIndex;
    };
    return previewBeforeReplay(
      barcodeBody,
      "catalogPreview = _publishCatalogPreview({",
      "const catalogReplayResult = await _firstCompletedReplayResult("
    ) && previewBeforeReplay(
      searchBody,
      "const catalogPreview = _publishCatalogPreview({",
      "const replayResult = await _firstCompletedReplayResult("
    ) && previewBeforeReplay(
      photoBody,
      "const catalogPreview = _publishCatalogPreview({",
      "const photoReplayResult = await _firstCompletedReplayResult("
    );
  })(),
  "barcode/search/photo product-data hits must publish verified ingredient previews before waiting on catalog score replay misses"
);

assert(
  resultsSource.includes("function ScoreUnavailableCard({ error, theme, isPro, onRetry, onUpgrade })") &&
    resultsSource.includes("const hasCatalogPreviewWithoutScore = Boolean(") &&
    resultsSource.includes("!hasCatalogPreviewWithoutScore") &&
    resultsSource.includes("const scoreUnavailable = Boolean(error && !hasScore && result?.scorePending === true)") &&
    resultsSource.includes("const isScorePending = !hasScore && (streaming || scoreUnavailable) && result?.scorePending === true") &&
    resultsSource.includes("const scorePendingIngredientPreview = isScorePending && !isPro && Array.isArray(result?.ingredients)") &&
    resultsSource.includes("result.ingredients.slice(0, 3)") &&
    /scoreUnavailable \? \([\s\S]{0,220}<ScoreUnavailableCard[\s\S]{0,120}error=\{error\}[\s\S]{0,120}onRetry=\{handleRetry\}[\s\S]{0,120}onUpgrade=\{handleUpgradeFromError\}/.test(resultsSource) &&
    /!isPro && isScorePending && scorePendingIngredientPreview\.length > 0[\s\S]{0,260}<IngredientsSection[\s\S]{0,160}ingredients=\{scorePendingIngredientPreview\}[\s\S]{0,120}totalCount=\{result\.ingredients\.length\}[\s\S]{0,160}fadeLastItem=\{result\.ingredients\.length > scorePendingIngredientPreview\.length\}/.test(resultsSource) &&
    /!isPro && done && hasScore[\s\S]{0,180}<ProGateOverlay/.test(resultsSource),
  "Results must keep verified catalog previews visible with a score-unavailable recovery card after score failures, show only a short gated ingredient preview for free users, then keep the normal free-user Pro gate after completion"
);

assert(
  /function _getEntry\(key\) \{[\s\S]{0,120}const resolvedKey = resolveKey\(key\);[\s\S]{0,120}analyses\.get\(resolvedKey\)/.test(analysisSource) &&
    /function _rekey\(oldKey, newKey, state\) \{[\s\S]{0,520}for \(const \[alias, target\] of keyAliases\)[\s\S]{0,120}target === oldKey[\s\S]{0,120}keyAliases\.set\(alias, newKey\)/.test(analysisSource),
  "analysis aliases must resolve through multi-stage rekeys so cancellation and replay find the canonical entry"
);

assert(
  analysisSource.includes("function _cloneJsonish(value)") &&
    /function _analysisStateSnapshot\(entry\) \{[\s\S]{0,120}status: entry\.status[\s\S]{0,120}result: entry\.result \? _cloneJsonish\(entry\.result\) : entry\.result[\s\S]{0,160}opffData: entry\.opffData \? _cloneJsonish\(entry\.opffData\) : entry\.opffData[\s\S]{0,160}recovery: entry\.recovery \? _cloneJsonish\(entry\.recovery\) : entry\.recovery/.test(analysisSource) &&
    /export function getAnalysis\(key\) \{[\s\S]{0,120}const \{ entry \} = _getEntry\(key\);[\s\S]{0,80}return _analysisStateSnapshot\(entry\);/.test(analysisSource),
  "public analysis reattachment must return cloned snapshots instead of mutable singleton service state"
);

assert(
  /function _analysisEventSnapshot\(event\) \{[\s\S]{0,100}\.\.\.event[\s\S]{0,120}result: event\.result \? _cloneJsonish\(event\.result\) : event\.result[\s\S]{0,160}opffData: event\.opffData \? _cloneJsonish\(event\.opffData\) : event\.opffData[\s\S]{0,160}recovery: event\.recovery \? _cloneJsonish\(event\.recovery\) : event\.recovery/.test(analysisSource) &&
    /function _notify\(event\) \{[\s\S]{0,100}cb\(_analysisEventSnapshot\(event\)\);/.test(analysisSource),
  "analysis subscriber events must receive cloned result/opff/recovery payloads instead of mutable service state"
);

assert(
  analysisSource.includes('const ANALYSIS_START_MODES = new Set(["barcode", "search", "photo", "photo_with_ingredients", "human_food"])') &&
    analysisSource.includes("!ANALYSIS_START_MODES.has(mode)") &&
    analysisSource.includes("startAnalysis called with unsupported mode") &&
    analysisSource.includes('(mode === "photo" || mode === "photo_with_ingredients") && !base64') &&
    analysisSource.includes('mode === "photo_with_ingredients" && !preIdentifiedName'),
  "analysis startup must reject unsupported modes and malformed photo_with_ingredients params"
);

assert(
  analysisSource.includes("function _fingerprintString(value)") &&
    analysisSource.includes("const sampleSize = 160") &&
    analysisSource.includes("Math.imul(hash, 16777619)") &&
    analysisSource.includes("function _pendingInputKey(prefix, parts)") &&
    analysisSource.includes('return `_pending_${prefix}_${keyParts.join("_")}`;') &&
    /const photoPendingKey = mode === "photo"[\s\S]{0,180}_pendingInputKey\("photo", \[_knownPetType\(petType\) \|\| "species_pending", _fingerprintString\(base64\)\]\)/.test(analysisSource) &&
    /const labelPhotoPendingKey = mode === "photo_with_ingredients" && ingredientBase64[\s\S]{0,260}_pendingInputKey\("label", \[[\s\S]{0,180}_fingerprintString\(ingredientBase64\)/.test(analysisSource) &&
    /const humanFoodPendingKey = mode === "human_food"[\s\S]{0,220}_pendingInputKey\("human_food", \[[\s\S]{0,180}foodName \? normalizeCacheKey\(foodName\) : _fingerprintString\(base64\)/.test(analysisSource) &&
    analysisSource.includes("labelPhotoPendingKey || photoPendingKey"),
  "image/text scans without stable product keys must use deterministic pending keys so duplicate route starts attach to one background analysis"
);

assert(
  /Already running, complete, or paused for user input for this key\? Reuse it\.[\s\S]{0,360}entry\.status === "running"[\s\S]{0,120}entry\.status === "complete"[\s\S]{0,120}entry\.status === "needs_pet_type"[\s\S]{0,120}entry\.status === "needs_ingredient_photo"[\s\S]{0,180}Reusing existing analysis for key/.test(analysisSource),
  "startAnalysis must reuse paused pet-type and ingredient-photo recovery states instead of restarting the same scan on route/auth re-renders"
);

const guardCalls = [...analysisSource.matchAll(/_guardCompletedAnalysis\(/g)].length;
assert(
  guardCalls >= 6,
  "first-time analysis completion branches must call _guardCompletedAnalysis"
);

assert(
  /async function _saveLocalResult\(cacheKey, analysis, dataSource, opffData\) \{[\s\S]{0,220}_validateAnyCompletedResult\(analysis\)[\s\S]{0,180}const savedAt = Date\.now\(\);[\s\S]{0,180}const fingerprint = _localResultFingerprint\(analysis, dataSource, opffData\);[\s\S]{0,180}_rememberLocalResultMemory\(normalizedCacheKey, \{ analysis, dataSource, opffData, savedAt \}, savedAt, fingerprint\);[\s\S]{0,180}Skipped duplicate local result write[\s\S]{0,120}await Promise\.resolve\(\);[\s\S]{0,180}AsyncStorage\.setItem/.test(analysisSource) &&
    /async function _saveLocalResultCopies\(cacheKeys, analysis, dataSource, opffData\) \{[\s\S]{0,220}_validateAnyCompletedResult\(analysis\)[\s\S]{0,180}const savedAt = Date\.now\(\);[\s\S]{0,180}const keysToWrite = uniqueKeys\.filter[\s\S]{0,260}_rememberLocalResultMemory\(key, \{ analysis, dataSource, opffData, savedAt \}, savedAt, fingerprint\);[\s\S]{0,180}Skipped duplicate local result copy writes[\s\S]{0,120}await Promise\.resolve\(\);[\s\S]{0,180}AsyncStorage\.multiSet/.test(analysisSource),
  "local result saves must seed validated memory replay immediately, skip duplicate hot rewrites, and defer AsyncStorage writes off the completion path"
);

const saveHistoryStart = analysisSource.indexOf("function _saveHistory");
const addHistoryCall = analysisSource.indexOf("addHistoryEntry", saveHistoryStart);
const historyValidationCall = analysisSource.indexOf("_validateCompletedResult(state.result, state.mode)", saveHistoryStart);
assert(
  saveHistoryStart !== -1 &&
    historyValidationCall !== -1 &&
    addHistoryCall !== -1 &&
    historyValidationCall < addHistoryCall,
  "history saves must reject incomplete analyses before addHistoryEntry"
);

assert(
  /if \(state\.historySaved \|\| state\.historySaveQueued\) \{[\s\S]{0,120}Skipping duplicate history save/.test(analysisSource) &&
    /const entry = \{[\s\S]{0,520}analysisPayload: humanFoodHistoryPayload[\s\S]{0,40}\};[\s\S]{0,80}state\.historySaveQueued = true;[\s\S]{0,120}Promise\.resolve\(\)[\s\S]{0,80}\.then\(\(\) => addHistoryEntry\(entry\)\)[\s\S]{0,80}state\.historySaved = true/.test(analysisSource) &&
    /catch \(err\) \{[\s\S]{0,80}state\.historySaveQueued = false;[\s\S]{0,120}Error saving history/.test(analysisSource),
  "history saves must snapshot rows and mark queued synchronously before yielding storage work to prevent duplicate terminal writes"
);

assert(
  /function _parseStoredLocalResult\(cacheKey, json\) \{[\s\S]{0,120}try \{[\s\S]{0,80}parsed = JSON\.parse\(json\);[\s\S]{0,80}catch \{[\s\S]{0,80}return \{ result: null, shouldRemove: true \};/.test(analysisSource) &&
  /if \(!_validateAnyCompletedResult\(parsed\?\.analysis\)\) \{[\s\S]{0,80}return \{ result: null, shouldRemove: true \};/.test(analysisSource) &&
    /const \{ result, shouldRemove \} = _parseStoredLocalResult\(normalizedCacheKey, json\);[\s\S]{0,160}AsyncStorage\.removeItem/.test(analysisSource) &&
    /const \{ result, shouldRemove \} = _parseStoredLocalResult\(cacheKey, json\);[\s\S]{0,160}staleStorageKeys\.push\(storageKeys\[i\]\)/.test(analysisSource),
  "local cache reads must evict malformed completed analyses and corrupt JSON rows without poisoning batch replay"
);

assert(
  analysisSource.includes("function _parseLocalResultKeys(json)") &&
    analysisSource.includes("function _normalizeLocalResultCacheKey(cacheKey)") &&
    analysisSource.includes("function _normalizeLocalResultCacheKeys(cacheKeys)") &&
    analysisSource.includes("async function _readLocalResultKeys()") &&
    analysisSource.includes("async function _removeLocalResultKeysFromIndex(cacheKeys)") &&
    analysisSource.includes("const LOCAL_RESULT_READ_TIMEOUT_MS = 700") &&
    analysisSource.includes("async function _withLocalResultReadTimeout") &&
    analysisSource.includes('err.code = "LOCAL_RESULT_TIMEOUT"') &&
    analysisSource.includes("const seen = new Set();") &&
    analysisSource.includes('return typeof cacheKey === "string" ? cacheKey.trim() : "";') &&
    analysisSource.includes(".map(_normalizeLocalResultCacheKey)") &&
    analysisSource.includes("if (!key || seen.has(key)) return false;") &&
    /const normalizedCacheKey = _normalizeLocalResultCacheKey\(cacheKey\);[\s\S]{0,80}if \(!normalizedCacheKey\) return;/.test(analysisSource) &&
    /const uniqueKeys = _normalizeLocalResultCacheKeys\(cacheKeys\);[\s\S]{0,80}if \(uniqueKeys\.length === 0\) return;/.test(analysisSource) &&
    /const keys = await _readLocalResultKeys\(\);[\s\S]{0,140}const filtered = keys\.filter\(\(k\) => k !== normalizedCacheKey\)/.test(analysisSource) &&
    /const keys = await _readLocalResultKeys\(\);[\s\S]{0,140}const filtered = keys\.filter\(\(key\) => !uniqueKeys\.includes\(key\)\)/.test(analysisSource) &&
    /const removeSet = new Set\(_normalizeLocalResultCacheKeys\(cacheKeys\)\);/.test(analysisSource) &&
    /async function _getLocalResults\(cacheKeys\) \{[\s\S]{0,80}const keys = _normalizeLocalResultCacheKeys\(cacheKeys\);/.test(analysisSource) &&
    /export async function getLocalResults\(cacheKeys\) \{[\s\S]{0,80}return _getLocalResults\(cacheKeys\);/.test(analysisSource) &&
    /export async function getLocalResult\(cacheKey\) \{[\s\S]{0,120}const normalizedCacheKey = _normalizeLocalResultCacheKey\(cacheKey\);[\s\S]{0,80}if \(!normalizedCacheKey\) return null;/.test(analysisSource) &&
    analysisSource.includes('AsyncStorage.getItem(`${LOCAL_RESULT_PREFIX}${normalizedCacheKey}`)') &&
    analysisSource.includes('label, timeoutMs = LOCAL_RESULT_READ_TIMEOUT_MS') &&
    analysisSource.includes("const staleCacheKeys = []") &&
    analysisSource.includes("staleCacheKeys.push(cacheKey);") &&
    analysisSource.includes("_removeLocalResultKeysFromIndex(staleCacheKeys).catch(() => {});") &&
    analysisSource.includes("_removeLocalResultKeysFromIndex([normalizedCacheKey]).catch(() => {});"),
  "local result cache must normalize helper boundary keys, sanitize its key index, and prune stale keys when evicting stale replay rows"
);

assert(
  !/if \(!analysis\.error\) \{[\s\S]{0,120}state\.status = "complete";[\s\S]{0,220}_guardCompletedAnalysis/.test(analysisSource),
  "completion guards must run before marking state complete"
);

assert(
  analysisSource.includes("export function cancelAnalysis") &&
    analysisSource.includes("export function retainAnalysis") &&
    analysisSource.includes("export function releaseAnalysis") &&
    analysisSource.includes("const activeAnalysisOwners = new Map()") &&
    analysisSource.includes("function _analysisOwnerCount(key)") &&
    analysisSource.includes("entry.controller?.abort()") &&
    analysisSource.includes("_analysisOwnerCount(resolvedKey) > 0") &&
    !analysisSource.includes("subscribers.size > 0") &&
    analysisSource.includes("Analysis cancelled."),
  "analysis service must cancel abandoned running scans based on per-analysis ownership, not unrelated global subscribers"
);

assert(
  /function _rekey\(oldKey, newKey, state\) \{[\s\S]{0,220}const ownerCount = activeAnalysisOwners\.get\(oldKey\);[\s\S]{0,220}activeAnalysisOwners\.set\(newKey, \(activeAnalysisOwners\.get\(newKey\) \|\| 0\) \+ ownerCount\);[\s\S]{0,80}activeAnalysisOwners\.delete\(oldKey\);/.test(analysisSource),
  "analysis rekeys must migrate active owner counts so canonical cancellation cannot abort an owned result"
);

assert(
  analysisSource.includes("function _clearScheduledCleanup(key)") &&
    analysisSource.includes("const ANALYSIS_CLEANUP_MS = 5 * 60 * 1000") &&
    /function _scheduleCleanup\(key\) \{[\s\S]{0,160}_clearScheduledCleanup\(cleanupKey\);[\s\S]{0,120}const targetEntry = analyses\.get\(cleanupKey\);[\s\S]{0,320}entry === targetEntry[\s\S]{0,120}analyses\.delete\(cleanupKey\)/.test(analysisSource) &&
    /if \(entry && entry === targetEntry && _analysisOwnerCount\(cleanupKey\) > 0\) \{[\s\S]{0,80}_scheduleCleanup\(cleanupKey\);[\s\S]{0,40}return;[\s\S]{0,20}\}/.test(analysisSource) &&
    analysisSource.includes("}, ANALYSIS_CLEANUP_MS);") &&
    /function _rekey\(oldKey, newKey, state\) \{[\s\S]{0,120}_clearScheduledCleanup\(oldKey\);[\s\S]{0,80}_clearScheduledCleanup\(newKey\);/.test(analysisSource) &&
    /_clearScheduledCleanup\(tempId\);\s*analyses\.set\(tempId, state\);/.test(analysisSource),
  "analysis cleanup timers must be state-specific, owner-aware, and cleared before retry/rekey reuse of the same key"
);

assert(
  analysisSource.includes('state.status = "needs_ingredient_photo"') &&
    analysisSource.includes('type: "need_ingredient_photo"') &&
    analysisSource.includes('const labelRecoveryReason = dbResult.reason === "unusable"') &&
    analysisSource.includes('? "catalog_lookup_error"') &&
    analysisSource.includes('reason: labelRecoveryReason') &&
    (() => {
      const start = analysisSource.indexOf("async function _runPhoto(");
      const end = analysisSource.indexOf("\n// ── Local result cache", start);
      const body = analysisSource.slice(start, end === -1 ? undefined : end);
      return start !== -1 &&
        body.includes('dbResult.reason === "lookup_error"') &&
        !/dbResult\.reason === "lookup_error"[\s\S]{0,160}state\.status = "error"/.test(body);
    })() &&
    /state\.status = "needs_pet_type";[\s\S]{0,120}state\.recovery = \{[\s\S]{0,120}mode: "search"/.test(analysisSource) &&
    /state\.status = "needs_pet_type";[\s\S]{0,120}state\.recovery = \{[\s\S]{0,120}mode: "photo_with_ingredients"/.test(analysisSource) &&
    /state\.status = "needs_ingredient_photo";[\s\S]{0,160}state\.recovery = \{[\s\S]{0,120}productName/.test(analysisSource),
  "paused recovery states must not stay running and must store card metadata for immediate UI reattachment"
);

assert(
  /await Promise\.race\(\[analysisPromise, timeoutPromise\]\);[\s\S]{0,220}state\.status === "running"[\s\S]{0,100}const notifyKey = resolveKey\(cacheKey\)[\s\S]{0,180}INCOMPLETE_ANALYSIS_ERROR[\s\S]{0,180}cacheKey: notifyKey[\s\S]{0,80}_scheduleCleanup\(notifyKey\)/.test(analysisSource),
  "resolved analyses that never reached a terminal state must emit and clean up by canonical key"
);

assert(
  timeoutBlock.includes("const notifyKey = resolveKey(cacheKey)") &&
    /err\.message === "ANALYSIS_TIMEOUT"[\s\S]{0,120}state\.status === "running"[\s\S]{0,260}cacheKey: notifyKey[\s\S]{0,120}_scheduleCleanup\(notifyKey\)/.test(timeoutBlock),
  "hard analysis timeouts must emit and clean up by canonical key after rekeying"
);

assert(
  /else if \(state\.status === "running" && !state\.controller\?\.signal\?\.aborted\) \{[\s\S]{0,120}state\.result = null;[\s\S]{0,120}state\.error = err\?\.message \|\| INCOMPLETE_ANALYSIS_ERROR;[\s\S]{0,120}state\.status = "error";[\s\S]{0,120}cacheKey: notifyKey[\s\S]{0,120}_scheduleCleanup\(notifyKey\)/.test(timeoutBlock),
  "unexpected runner rejections must emit a terminal error and clean up instead of leaving Results loading"
);

assert(
  analysisSource.includes("const hits = await getCachedAnalyses(keys, options)") &&
    analysisSource.includes("const cachedPromise = (requestedPetType") &&
    analysisSource.includes("_getSpeciesCachedAnalysis(barcode, null, requestedPetType, { signal, timeoutMs: BARCODE_ANALYSIS_CACHE_TIMEOUT_MS })") &&
    analysisSource.includes('_getSingleSpeciesOrLegacyCachedAnalysis(barcode, "barcode", { signal, timeoutMs: BARCODE_ANALYSIS_CACHE_TIMEOUT_MS })') &&
    analysisSource.includes("const BARCODE_ANALYSIS_CACHE_TIMEOUT_MS = 1800") &&
    analysisSource.includes("const CATALOG_ANALYSIS_CACHE_TIMEOUT_MS = 2500") &&
    analysisSource.includes("const localPromise = (requestedPetType") &&
    analysisSource.includes("_getSpeciesLocalResult(barcode, null, requestedPetType)") &&
    analysisSource.includes('_getSingleSpeciesOrLegacyLocalResult(barcode, "barcode")') &&
    analysisSource.includes("const lookupPromise = lookupBarcode(barcode, { signal })") &&
    analysisSource.includes("const SEARCH_SELECTED_PRODUCT_DATA_TIMEOUT_MS = 2_500") &&
    analysisSource.includes("const SEARCH_FALLBACK_PRODUCT_DATA_TIMEOUT_MS = 4_000") &&
    analysisSource.includes("const PHOTO_PRODUCT_DATA_TIMEOUT_MS = 4_500") &&
    analysisSource.includes("getProductDataByCacheKey(exactSelectedCacheKey, { signal, timeoutMs: SEARCH_SELECTED_PRODUCT_DATA_TIMEOUT_MS })") &&
    analysisSource.includes("getProductData(productName, brand, { signal, timeoutMs: SEARCH_FALLBACK_PRODUCT_DATA_TIMEOUT_MS })") &&
    analysisSource.includes("getProductData(idObj, undefined, { signal, timeoutMs: PHOTO_PRODUCT_DATA_TIMEOUT_MS })"),
  "analysis database/cache reads must be linked to the analysis abort signal"
);

assert(
  (() => {
    const speciesStart = analysisSource.indexOf("async function _getSpeciesLocalResult");
    const speciesEnd = analysisSource.indexOf("\nfunction _hasText", speciesStart);
    const speciesBody = analysisSource.slice(speciesStart, speciesEnd);
    const batchStart = analysisSource.indexOf("async function _getLocalResults");
    const batchEnd = analysisSource.indexOf("\n/**", batchStart);
    const batchBody = analysisSource.slice(batchStart, batchEnd);
    return speciesStart !== -1 &&
      batchStart !== -1 &&
      speciesBody.includes("const localHits = await _getLocalResults(keys)") &&
      speciesBody.includes("const local = localHits.get(key)") &&
      speciesBody.includes("_analysisMatchesPetType(local.analysis, petType)") &&
      batchBody.includes("const rows = await _withLocalResultReadTimeout(") &&
      batchBody.includes("AsyncStorage.multiGet(storageKeys)") &&
      batchBody.includes('"Local result batch read"') &&
      batchBody.includes("const { result, shouldRemove } = _parseStoredLocalResult(cacheKey, json)") &&
      batchBody.includes("AsyncStorage.multiRemove(staleStorageKeys).catch(() => {})");
  })(),
  "species local-cache fallback keys must be read in one AsyncStorage batch while preserving validation"
);

assert(
  (() => {
    const start = analysisSource.indexOf("async function _runBarcode(");
    const end = analysisSource.indexOf("\n// ── Search flow", start);
    const body = analysisSource.slice(start, end === -1 ? undefined : end);
    const localPromise = body.indexOf("const localPromise = (requestedPetType");
    const cachedPromise = body.indexOf("const cachedPromise = (requestedPetType");
    const lookupPromise = body.indexOf("const lookupPromise = lookupBarcode(barcode, { signal })");
    const replayStart = body.indexOf("const barcodeReplay = await _firstCompletedReplayResult(");
    const opffLookup = body.indexOf("const lookup = await lookupPromise");
    const setupBlock = body.slice(localPromise, replayStart);
    const replayBlock = body.slice(replayStart, opffLookup);
    return start !== -1 &&
      localPromise !== -1 &&
      cachedPromise !== -1 &&
      lookupPromise !== -1 &&
      replayStart !== -1 &&
      opffLookup !== -1 &&
      localPromise < cachedPromise &&
      cachedPromise < lookupPromise &&
      lookupPromise < replayStart &&
      replayStart < opffLookup &&
      setupBlock.includes("_getSpeciesLocalResult(barcode, null, requestedPetType)") &&
      setupBlock.includes('_getSingleSpeciesOrLegacyLocalResult(barcode, "barcode")') &&
      setupBlock.includes("_getSpeciesCachedAnalysis(barcode, null, requestedPetType") &&
      setupBlock.includes('_getSingleSpeciesOrLegacyCachedAnalysis(barcode, "barcode"') &&
      setupBlock.includes("lookupBarcode(barcode, { signal })") &&
      replayBlock.includes("if (signal.aborted) return;") &&
      replayBlock.includes('barcodeReplay?.source === "local"') &&
      replayBlock.includes('barcodeReplay?.source === "shared"') &&
      replayBlock.includes('state.status = "complete";') &&
      replayBlock.includes('fromCache: true') &&
      replayBlock.includes("_scheduleCleanup(notifyKey);") &&
      replayBlock.includes("return;");
  })(),
  "barcode scans must start OPFF lookup while local/shared cache reads are in flight, then render the first valid replay before waiting on OPFF"
);

assert(
  (() => {
    const localStart = analysisSource.indexOf("async function _getSingleSpeciesOrLegacyLocalResult");
    const cachedStart = analysisSource.indexOf("async function _getSingleSpeciesOrLegacyCachedAnalysis");
    const hasTextStart = analysisSource.indexOf("\nfunction _hasText", cachedStart);
    const localBody = analysisSource.slice(localStart, cachedStart);
    const cachedBody = analysisSource.slice(cachedStart, hasTextStart);
    return localStart !== -1 &&
      cachedStart !== -1 &&
      localBody.includes('["dog", "cat"]') &&
      localBody.includes("_analysisCacheKey(baseKey, petType)") &&
      localBody.includes("const now = Date.now();") &&
      localBody.includes("const memorySpeciesHits = [];") &&
      localBody.includes("const local = key ? _getLocalResultMemory(key, now) : null;") &&
      localBody.includes("if (memorySpeciesHits.length === 1) return memorySpeciesHits[0];") &&
      localBody.includes("if (memorySpeciesHits.length > 1) return null;") &&
      localBody.includes("const memoryLegacy = _getLocalResultMemory(baseKey, now);") &&
      localBody.indexOf("const memorySpeciesHits = [];") < localBody.indexOf("const localHits = await _getLocalResults(keys)") &&
      localBody.includes("const localHits = await _getLocalResults(keys)") &&
      localBody.includes("speciesHits.length === 1") &&
      localBody.includes("speciesHits.length > 1") &&
      localBody.includes("const legacy = localHits.get(baseKey)") &&
      localBody.includes("_validateCompletedResult(legacy.analysis, mode) === null") &&
      cachedBody.includes('["dog", "cat"]') &&
      cachedBody.includes("_analysisCacheKey(baseKey, petType)") &&
      cachedBody.includes("const hits = await getCachedAnalyses(keys, options)") &&
      cachedBody.includes("speciesHits.length === 1") &&
      cachedBody.includes("speciesHits.length > 1") &&
      cachedBody.includes("const legacy = hits.get(baseKey)") &&
      cachedBody.includes("_validateCompletedResult(legacy.analysis, mode) === null");
  })(),
  "barcode scans without an explicit pet type must batch dog/cat/legacy replay keys and only accept one unambiguous completed species hit"
);

assert(
  (() => {
    const speciesStart = analysisSource.indexOf("async function _getSpeciesLocalResult");
    const memoryStart = analysisSource.indexOf("function _getSpeciesMemoryResult", speciesStart);
    const body = analysisSource.slice(speciesStart, memoryStart);
    const directMemoryStart = body.indexOf("const now = Date.now();");
    const storageStart = body.indexOf("const localHits = await _getLocalResults(keys);");
    return speciesStart !== -1 &&
      memoryStart !== -1 &&
      body.includes("const local = _getLocalResultMemory(key, now);") &&
      body.includes("if (local?.analysis && _analysisMatchesPetType(local.analysis, petType))") &&
      body.includes("return { ...local, cacheKey: key };") &&
      directMemoryStart !== -1 &&
      storageStart !== -1 &&
      directMemoryStart < storageStart;
  })(),
  "species local replay must return hot memory hits before waiting on AsyncStorage misses"
);

assert(
  (() => {
    const orderedPair = (body, localNeedle, sharedNeedle) => {
      const localIndex = body.indexOf(localNeedle);
      const sharedIndex = body.indexOf(sharedNeedle);
      return localIndex !== -1 && sharedIndex !== -1 && localIndex < sharedIndex;
    };
    const barcodeStart = analysisSource.indexOf("async function _runBarcode(");
    const searchStart = analysisSource.indexOf("async function _runSearch(");
    const humanStart = analysisSource.indexOf("\n// ── Human food flow", searchStart);
	    const photoStart = analysisSource.indexOf("async function _runPhoto(");
	    const localResultStart = analysisSource.indexOf("\n// ── Local result cache", photoStart);
	    const barcodeBody = analysisSource.slice(barcodeStart, searchStart);
	    const searchBody = analysisSource.slice(searchStart, humanStart);
	    const photoBody = analysisSource.slice(photoStart, localResultStart);
	    const barcodeLocalPromise = barcodeBody.indexOf("const localCatalogPromise = _getSpeciesLocalResult(catalogBaseKey, catalogFallbackKeys, resolvedPetType).catch((err) => {");
	    const barcodeSharedPromise = barcodeBody.indexOf("const cachedCatalogPromise = _getSpeciesCachedAnalysis(catalogBaseKey, catalogFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {");
	    const barcodeReplayAwait = barcodeBody.indexOf("const catalogReplayResult = await _firstCompletedReplayResult(");
	    const searchLocalPromise = searchBody.indexOf("const localResultPromise = _getSpeciesLocalResult(sharedCacheKey, searchFallbackKeys, resolvedPetType).catch((err) => {");
	    const searchSharedPromise = searchBody.indexOf("const cachedAnalysisPromise = _getSpeciesCachedAnalysis(sharedCacheKey, searchFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {");
	    const searchReplayAwait = searchBody.indexOf("const replayResult = await _firstCompletedReplayResult(");
	    const photoLocalPromise = photoBody.indexOf("const localResultPromise = _getSpeciesLocalResult(sharedCacheKey, photoFallbackKeys, petType).catch((err) => {");
	    const photoSharedPromise = photoBody.indexOf("const cachedAnalysisPromise = _getSpeciesCachedAnalysis(sharedCacheKey, photoFallbackKeys, petType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {");
	    const photoReplayAwait = photoBody.indexOf("const photoReplayResult = await _firstCompletedReplayResult(");
	    const hasAbortAfter = (body, needle) => {
	      const index = body.indexOf(needle);
	      if (index === -1) return false;
	      return body.slice(index, index + needle.length + 260).includes("if (signal.aborted) return;");
	    };
		    return analysisSource.includes("async function _firstCompletedReplayResult(localPromise, sharedPromise, mode, signal = null, maxWaitMs = 0)") &&
		      analysisSource.includes("function _validReplayResult(source, result, mode)") &&
		      barcodeLocalPromise !== -1 &&
		      barcodeSharedPromise !== -1 &&
		      barcodeReplayAwait !== -1 &&
		      barcodeLocalPromise < barcodeSharedPromise &&
		      barcodeSharedPromise < barcodeReplayAwait &&
	      searchLocalPromise !== -1 &&
	      searchSharedPromise !== -1 &&
	      searchReplayAwait !== -1 &&
	      searchLocalPromise < searchSharedPromise &&
	      searchSharedPromise < searchReplayAwait &&
	      photoLocalPromise !== -1 &&
	      photoSharedPromise !== -1 &&
	      photoReplayAwait !== -1 &&
	      photoLocalPromise < photoSharedPromise &&
	      photoSharedPromise < photoReplayAwait &&
	      searchBody.includes("Search INSTANT (local)") &&
	      searchBody.includes("Search INSTANT (cached)") &&
      photoBody.includes("INSTANT (local cache)") &&
      photoBody.includes("INSTANT (cached)") &&
		    barcodeBody.includes("Barcode reused local catalog cache") &&
		    barcodeBody.includes("Barcode reused catalog cache") &&
		    hasAbortAfter(barcodeBody, "const catalogReplayResult = await _firstCompletedReplayResult(") &&
		      hasAbortAfter(searchBody, "const replayResult = await _firstCompletedReplayResult(") &&
		      hasAbortAfter(photoBody, "const photoReplayResult = await _firstCompletedReplayResult(");
  })(),
  "catalog-backed barcode/search/photo flows must race validated local and shared score replay, then stop on abort before publishing cached completions"
);

assert(
  analysisSource.includes("function _abortFinishedParallelWork(state, reason = \"analysis completed from replay\")") &&
    analysisSource.includes("state.controller.abort(err);") &&
    (analysisSource.match(/_abortFinishedParallelWork\(state,/g) || []).length >= 10 &&
    analysisSource.includes("_abortFinishedParallelWork(state, \"barcode replay completed\")") &&
    analysisSource.includes("_abortFinishedParallelWork(state, \"barcode catalog replay completed\")") &&
    analysisSource.includes("_abortFinishedParallelWork(state, \"search replay completed\")") &&
    analysisSource.includes("_abortFinishedParallelWork(state, \"search catalog replay completed\")") &&
    analysisSource.includes("_abortFinishedParallelWork(state, \"skip-label replay completed\")") &&
    analysisSource.includes("_abortFinishedParallelWork(state, \"photo identified replay completed\")") &&
    analysisSource.includes("_abortFinishedParallelWork(state, \"photo catalog replay completed\")") &&
    analysisSource.includes("if (!signal.aborted) console.log(\"[ANALYSIS] Barcode lookup failed:\""),
  "validated replay completions must abort their own slower fallback lookups so repeat scans do not leave abandoned network work running"
);

assert(
  (() => {
    const start = analysisSource.indexOf("async function _runBarcode(");
    const end = analysisSource.indexOf("\n// ── Search flow", start);
    const body = analysisSource.slice(start, end === -1 ? undefined : end);
    const lookupStart = body.indexOf("const lookup = await lookupPromise;");
    const analyzeStart = body.indexOf("const analysis = await analyzeWithData", lookupStart);
    const preAnalyzeBlock = body.slice(lookupStart, analyzeStart);
    return body.includes("async function _runBarcode({ cacheKey, barcode, petType, signal, state, isPro })") &&
      body.includes("const requestedPetType = _knownPetType(petType);") &&
      preAnalyzeBlock.includes("const resolvedPetType = requestedPetType || _knownPetType(lookup.product?.petType);") &&
      preAnalyzeBlock.includes('state.status = "needs_pet_type";') &&
      preAnalyzeBlock.includes('mode: "barcode"') &&
      preAnalyzeBlock.includes("barcode,") &&
      preAnalyzeBlock.includes('type: "need_pet_type"') &&
      preAnalyzeBlock.includes("lookup.product.petType = resolvedPetType;") &&
      preAnalyzeBlock.includes("const analysisKey = _analysisCacheKey(barcode, resolvedPetType);") &&
      preAnalyzeBlock.includes("_rekey(notifyKey, analysisKey, state);") &&
      body.includes("analysis.petType = resolvedPetType;");
  })(),
  "barcode scans must resolve dog/cat context or pause for species confirmation before AI analysis"
);

assert(
  /const lookup = await lookupPromise;[\s\S]{0,120}if \(!lookup\.found\) \{[\s\S]{0,120}lookup\.reason && lookup\.reason !== "not_found"[\s\S]{0,160}Could not check the barcode database[\s\S]{0,120}cacheKey: notifyKey, error: state\.error[\s\S]{0,120}_scheduleCleanup\(notifyKey\)[\s\S]{0,220}type: "barcode_not_found"/.test(analysisSource),
  "barcode lookup timeouts/network failures must emit retryable errors instead of false barcode-not-found events"
);

assert(
  (() => {
    const start = analysisSource.indexOf("async function _runPhoto(");
    const end = analysisSource.indexOf("\n// ── Local result cache", start);
    const body = analysisSource.slice(start, end === -1 ? undefined : end);
    const reasonStart = body.indexOf('const labelRecoveryReason = dbResult.reason === "unusable"');
    const notifyStart = body.indexOf('type: "need_ingredient_photo"', reasonStart);
    return start !== -1 &&
      reasonStart !== -1 &&
      notifyStart !== -1 &&
      body.includes('? "catalog_lookup_error"') &&
      body.includes("reason: labelRecoveryReason") &&
      !/dbResult\.reason === "lookup_error"[\s\S]{0,160}state\.status = "error"/.test(body);
  })(),
  "identified photo catalog lookup failures must pause for label-capture recovery instead of becoming terminal errors"
);

assert(
  (() => {
    const start = analysisSource.indexOf("async function _runPhoto(");
    const end = analysisSource.indexOf("\nasync function _saveLocalResult", start);
    const body = analysisSource.slice(start, end === -1 ? undefined : end);
    const catchStart = body.indexOf("} catch (err) {", body.indexOf("identification = await identifyProduct"));
    const notIdentifiedStart = body.indexOf("if (!identification?.identified || !identification?.productName)", catchStart);
    const catchBlock = body.slice(catchStart, notIdentifiedStart);
    return start !== -1 &&
      catchStart !== -1 &&
      notIdentifiedStart !== -1 &&
      catchBlock.includes('if (err.name === "AbortError" || signal.aborted) return;') &&
      catchBlock.includes('state.error = err.message || "Could not identify the product. Check your connection and try again.";') &&
      catchBlock.includes('state.status = "error";') &&
      catchBlock.includes('_notify({ type: "error", cacheKey: tempId, error: state.error });') &&
      catchBlock.includes("_scheduleCleanup(tempId);") &&
      catchBlock.includes("return;");
  })(),
  "thrown product-identification failures must become retryable terminal errors instead of falling through to could-not-read-photo copy"
);

assert(
  (() => {
    const start = analysisSource.indexOf("async function _runPhoto(");
    const end = analysisSource.indexOf("\nasync function _saveLocalResult", start);
	    const body = analysisSource.slice(start, end === -1 ? undefined : end);
	    const aliasKeyStart = body.indexOf("const identifiedFallbackKeys = _identifiedProductFallbackKeys({");
	    const aliasAnalysisKeyStart = body.indexOf("const identifiedFallbackAnalysisKeys = identifiedFallbackKeys");
	    const idObjStart = body.indexOf("const idObj = { productName, brand, variant, searchTerms };");
	    const localPromiseStart = body.indexOf("const identifiedLocalPromise = _getSpeciesLocalResult(realCacheKey, identifiedFallbackKeys, petType).catch((err) => {");
	    const sharedPromiseStart = body.indexOf("const identifiedCachedPromise = _getSpeciesCachedAnalysis(realCacheKey, identifiedFallbackKeys, petType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {");
	    const dbPromiseStart = body.indexOf("const dbResultPromise = getProductData(idObj, undefined, { signal, timeoutMs: PHOTO_PRODUCT_DATA_TIMEOUT_MS }).catch((err) => {");
	    const replayStart = body.indexOf("const identifiedReplay = await _firstCompletedReplayResult(");
	    const dbStart = body.indexOf("let dbResult = await dbResultPromise;");
	    return start !== -1 &&
	      analysisSource.includes("function _identifiedProductFallbackKeys({ productName, brand, variant, excludeKey })") &&
	      analysisSource.includes("variant && productName ? _normalizeCacheKeyVariants(`${productName} ${variant}`) : []") &&
	      analysisSource.includes("brand && variant ? _normalizeCacheKeyVariants(`${brand} ${variant}`) : []") &&
	      aliasKeyStart !== -1 &&
	      aliasAnalysisKeyStart !== -1 &&
	      idObjStart !== -1 &&
	      localPromiseStart !== -1 &&
	      sharedPromiseStart !== -1 &&
	      dbPromiseStart !== -1 &&
	      replayStart !== -1 &&
	      dbStart !== -1 &&
	      aliasKeyStart < aliasAnalysisKeyStart &&
	      aliasAnalysisKeyStart < idObjStart &&
	      idObjStart < localPromiseStart &&
	      localPromiseStart < sharedPromiseStart &&
	      sharedPromiseStart < dbPromiseStart &&
	      dbPromiseStart < replayStart &&
	      replayStart < dbStart &&
	      body.includes('Photo INSTANT (identified local cache)') &&
	      body.includes('Photo INSTANT (identified shared cache)') &&
	      body.includes('identifiedReplay?.source === "local"') &&
	      body.includes('identifiedReplay?.source === "shared"') &&
	      body.includes("_saveLocalResultCopies([identifiedLocalResult.cacheKey, serviceAnalysisKey, ...identifiedFallbackAnalysisKeys], replayed, state.dataSource, state.opffData);") &&
	      body.includes("_saveLocalResultCopies([identifiedCachedResult.cacheKey, serviceAnalysisKey, ...identifiedFallbackAnalysisKeys], replayed, state.dataSource, state.opffData);") &&
	      body.includes("const photoAnalysisKeys = [sharedCacheKey, ...photoFallbackKeys]") &&
	      body.includes("if (sharedAnalysisKey && sharedAnalysisKey !== notifyKey)") &&
	      body.includes("_rekey(notifyKey, sharedAnalysisKey, state)") &&
	      body.includes("_notify({ type: \"complete\", cacheKey: notifyKey, ...state, fromCache: true });") &&
	      body.includes("_saveHistory(state, identifiedLocalResult.cacheKey || serviceAnalysisKey || realCacheKey);");
	  })(),
	  "photo scans must replay the first validated identified local/shared-cache score before waiting on product_data"
	);

assert(
  (() => {
    const start = analysisSource.indexOf("async function _runSearch(");
    const end = analysisSource.indexOf("\n// ── Human food flow", start);
    const body = analysisSource.slice(start, end === -1 ? undefined : end);
    const phaseStart = body.indexOf('phase: "looking_up"');
    const memoryStart = body.indexOf("const routeMemoryResult = _getSpeciesMemoryResult(realCacheKey, routeSearchFallbackKeys, resolvedPetType);");
    const replayPromiseStart = body.indexOf("const routeReplayPromise = exactSelectedCacheKey && !selectedSnapshot");
    const exactPromiseStart = body.indexOf("const exactProductDataPromise = exactSelectedCacheKey && !selectedSnapshot");
    const dbStart = body.indexOf("let dbResult = selectedSnapshot || { found: false };");
    const raceStart = body.indexOf("const selectedRace = await Promise.race([");
    const lookupErrorStart = body.indexOf('if (exactSelectedCacheKey && dbResult.reason === "lookup_error")');
    const fallbackStart = body.indexOf("const selectedReplayResult = routeReplayPromise ? await routeReplayPromise : null;", lookupErrorStart);
    return start !== -1 &&
      analysisSource.includes("function _searchRouteFallbackKeys({ realCacheKey, productName, brand })") &&
      analysisSource.includes("function _completeSearchFromLocalReplay({") &&
      body.includes("const routeSearchAnalysisKeys = [realCacheKey, ...routeSearchFallbackKeys]") &&
      /const routeReplayPromise = exactSelectedCacheKey && !selectedSnapshot[\s\S]{0,620}"search",[\s\S]{0,120}signal,[\s\S]{0,120}REPLAY_MISS_FALLTHROUGH_MS/.test(body) &&
      phaseStart !== -1 &&
      memoryStart !== -1 &&
      replayPromiseStart !== -1 &&
      exactPromiseStart !== -1 &&
      dbStart !== -1 &&
      raceStart !== -1 &&
      lookupErrorStart !== -1 &&
      fallbackStart !== -1 &&
      phaseStart < memoryStart &&
      memoryStart < replayPromiseStart &&
      replayPromiseStart < exactPromiseStart &&
      exactPromiseStart < dbStart &&
      dbStart < raceStart &&
      lookupErrorStart < fallbackStart &&
      body.includes('sourceLabel: "memory"') &&
      body.includes("sourceLabel: selectedRace.result?.source === \"shared\" ? \"shared\" : \"local\"") &&
      body.includes("sourceLabel: selectedReplayResult?.source === \"shared\" ? \"shared\" : \"local\"") &&
      body.includes("localResult: selectedReplayResult?.result") &&
      body.includes("fromFallback: true") &&
      body.includes("if (_completeSearchFromLocalReplay({") &&
      body.includes("_scheduleCleanup(notifyKey);");
  })(),
  "selected search results must replay validated memory scores before product_data and race exact product_data with bounded local/shared score replay"
);

assert(
  /state\.error = dbResult\.reason === "unusable"[\s\S]{0,160}not analysis-ready[\s\S]{0,160}Try scanning the product instead[\s\S]{0,160}Product not found in database/.test(analysisSource) &&
    errorsSource.includes("/not analysis-ready/i"),
  "unusable catalog data in search mode must surface a product-not-found-classified scan recovery instead of a generic miss"
);

	assert(
	  /const analysis = await analyzeIngredients\(base64, \{ onUpdate, signal, clientProStatus: isPro === true \}\);[\s\S]{0,180}if \(!analysis \|\| analysis\.error\) \{[\s\S]{0,220}state\.status = "error"[\s\S]{0,120}type: "error"[\s\S]{0,260}_guardCompletedAnalysis/.test(analysisSource),
	  "photo_with_ingredients estimate fallback must handle failed photo analysis before returning"
	);

	assert(
	  (() => {
	    const start = analysisSource.indexOf("async function _runPhotoWithIngredients(");
		    const end = analysisSource.indexOf("\n// ── Photo flow", start);
		    const body = analysisSource.slice(start, end === -1 ? undefined : end);
		    const noLabelStart = body.indexOf("if (!ingredientBase64) {");
		    const localPromiseStart = body.indexOf("const skippedLabelLocalPromise = _getSpeciesLocalResult(realCacheKey, replayFallbackKeys, resolvedPetType).catch((err) => {", noLabelStart);
		    const sharedPromiseStart = body.indexOf("const skippedLabelCachedPromise = _getSpeciesCachedAnalysis(realCacheKey, replayFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {", noLabelStart);
		    const lookupPromiseStart = body.indexOf("skippedLabelIngredientLookupPromise = lookupIngredients(lookupName, { signal, timeoutMs: INGREDIENT_ESTIMATE_LOOKUP_TIMEOUT_MS }).catch((err) => {", noLabelStart);
		    const replayStart = body.indexOf("const skippedLabelReplay = await _firstCompletedReplayResult(", noLabelStart);
		    const lookupStart = body.indexOf("const ingredientLookup = await skippedLabelIngredientLookupPromise;", noLabelStart);
		    return start !== -1 &&
		      noLabelStart !== -1 &&
		      localPromiseStart !== -1 &&
		      sharedPromiseStart !== -1 &&
		      lookupPromiseStart !== -1 &&
		      replayStart !== -1 &&
		      lookupStart !== -1 &&
		      localPromiseStart < sharedPromiseStart &&
		      sharedPromiseStart < lookupPromiseStart &&
		      lookupPromiseStart < replayStart &&
		      replayStart < lookupStart &&
	      body.includes('Skip-label INSTANT (local cache)') &&
	      body.includes('Skip-label INSTANT (shared cache)') &&
	      body.includes('skippedLabelReplay?.source === "local"') &&
	      body.includes('skippedLabelReplay?.source === "shared"') &&
		      body.includes("const replayCopyKeys = skippedLabelCachedResult.cacheKey?.includes(\"__estimate\")") &&
		      body.includes("_saveLocalResultCopies(replayCopyKeys, replayed, state.dataSource, state.opffData);") &&
	      body.includes("_notify({ type: \"complete\", cacheKey: notifyKey, ...state, fromCache: true });") &&
	      body.includes("_saveHistory(state, skippedLabelCachedResult.cacheKey || analysisKey || targetKey || realCacheKey);");
	  })(),
	  "skip-label photo_with_ingredients flow must replay validated local/shared cached scores before estimate lookup"
	);

	for (const fn of ["_runSearch", "_runPhotoWithIngredients", "_runPhoto"]) {
  const start = analysisSource.indexOf(`async function ${fn}(`);
  const end = analysisSource.indexOf("\n// ──", start + 1);
  const body = analysisSource.slice(start, end === -1 ? undefined : end);
  const expectedNotifyKeyAssignment = {
    _runSearch: "notifyKey = serviceCacheKey || tempId",
    _runPhotoWithIngredients: "notifyKey = targetKey || tempId",
    _runPhoto: "notifyKey = realCacheKey || tempId",
  }[fn];

  assert(start !== -1, `${fn} must exist`);
  assert(
    body.includes("let notifyKey = tempId") &&
      body.includes(expectedNotifyKeyAssignment) &&
      /catch \(err\) \{[\s\S]{0,220}cacheKey: notifyKey[\s\S]{0,120}_scheduleCleanup\(notifyKey\)/.test(body),
    `${fn} errors after rekeying must notify and clean up the resolved product key`
  );
}

assert(
  resultsSource.includes("const doneRef = useRef(false)") &&
    resultsSource.includes("doneRef.current = done") &&
    resultsSource.includes("!navigation.isFocused()") &&
    resultsSource.includes("analysisService.retainAnalysis(currentKey)") &&
    resultsSource.includes("const cleanupKey = retainedKey || currentKey") &&
    /analysisService\.releaseAnalysis\(cleanupKey\);[\s\S]{0,160}analysisService\.cancelAnalysis\(cleanupKey, "results_unmounted"\)/.test(resultsSource) &&
    resultsSource.includes("route?.key, mode, navigation") &&
    resultsSource.includes("base64, uri, ingredientBase64") &&
    resultsSource.includes("scanMode, historyAnalysis, catalogSnapshot"),
  "Results must retain only its active analysis key, track replacement routes, and cancel only the captured unfinished analysis"
);

assert(
    resultsSource.includes('existing.status === "not_found"') &&
    resultsSource.includes("Barcode not found. Try scanning the front of the package instead.") &&
    /const currentKey = serviceKeyRef\.current;[\s\S]{0,160}analysisService\.retainAnalysis\(currentKey\);[\s\S]{0,120}applyExistingAnalysisState\(analysisService\.getAnalysis\(currentKey\), mode\);/.test(resultsSource) &&
    /\}, \[route\?\.key, mode, navigation, throttledSetResult, clearPendingResultUpdate, isHumanFood, petType, preProductName, preBrand, preFoodName, barcode, cacheKey, base64, uri, ingredientBase64, scanMode, historyAnalysis, catalogSnapshot, applyExistingAnalysisState\]\);/.test(resultsSource),
  "Results subscription must replay missed terminal states, including fast barcode/product not-found events"
);

assert(
    resultsSource.includes("const analysisRunKey = route?.key") &&
    resultsSource.includes("analysisStartedRef.current === analysisRunKey") &&
    resultsSource.includes("analysisStartedRef.current = analysisRunKey") &&
    resultsSource.includes("const isCurrentRun = () => mountedRef.current && analysisStartedRef.current === analysisRunKey") &&
    resultsSource.includes("clearTimeout(throttleRef.current.timer)") &&
    resultsSource.includes("throttleRef.current.timer = null") &&
    resultsSource.includes("clearTimeout(redirectTimerRef.current)") &&
    resultsSource.includes("redirectTimerRef.current = null") &&
    resultsSource.includes("serviceKeyRef.current = null") &&
    resultsSource.includes("proQuotaRecoveryAttempted = false") &&
    resultsSource.includes("proQuotaAutoRetryRef.current = Boolean(proQuotaRecoveryAttempted)") &&
    resultsSource.includes("setNeedsLabel(null)") &&
    resultsSource.includes("setNeedsPetType(null)") &&
    resultsSource.includes("setIsSlowLoading(false)") &&
    /\}, \[route\?\.key[\s\S]{0,260}ingredientBase64[\s\S]{0,120}proQuotaRecoveryAttempted[\s\S]{0,120}isPro[\s\S]{0,120}throttledSetResult[\s\S]{0,80}applyExistingAnalysisState,[\s\S]{0,40}failAnalysisStartup\]\);/.test(resultsSource),
  "Results startup must rerun and clear stale UI state for replacement route keys"
);

assert(
  resultsSource.includes("function historyReplayCacheKeys(cacheKey, petType, scanMode)") &&
    resultsSource.includes("function inferHistoryPetType(cacheKey, historyAnalysis, scanMode)") &&
    resultsSource.includes('const petType = routePetType || (mode === "history" ? inferHistoryPetType(cacheKey, historyAnalysis, scanMode) : null);') &&
    resultsSource.includes('if (key.endsWith("__dog")) return "dog";') &&
    resultsSource.includes('if (key.endsWith("__cat")) return "cat";') &&
    resultsSource.includes("return [...new Set([`${baseKey}__${petType}`, key])];") &&
    resultsSource.includes("import { getCachedAnalyses }") &&
    resultsSource.includes("const HISTORY_SHARED_CACHE_TIMEOUT_MS = 2500") &&
    /const replayCacheKeys = historyReplayCacheKeys\(cacheKey, petType, scanMode\);[\s\S]{0,120}let active = null;[\s\S]{0,80}let activeKey = null;[\s\S]{0,120}for \(const replayKey of replayCacheKeys\) \{[\s\S]{0,120}analysisService\.getAnalysis\(replayKey\)[\s\S]{0,900}serviceKeyRef\.current = activeKey \|\| cacheKey/.test(resultsSource) &&
    /const historyCacheController = new AbortController\(\);[\s\S]{0,520}const historyTimeout = setTimeout\(\(\) => \{[\s\S]{0,260}historyCacheController\.abort\(\);[\s\S]{0,180}Scan it again to refresh the analysis\./.test(resultsSource) &&
    /const cachedHitsPromise = getCachedAnalyses\(replayCacheKeys, \{[\s\S]{0,120}signal: historyCacheController\.signal,[\s\S]{0,120}timeoutMs: HISTORY_SHARED_CACHE_TIMEOUT_MS,[\s\S]{0,80}\}\)\.catch/.test(resultsSource) &&
    (() => {
      const historyStart = resultsSource.indexOf('if (mode === "history")');
      const historyEnd = resultsSource.indexOf("// Search mode:", historyStart);
      const historyBlock = resultsSource.slice(historyStart, historyEnd);
      const localPromiseStart = historyBlock.indexOf("const localHitsPromise = analysisService.getLocalResults(replayCacheKeys).catch((err) => {");
      const sharedPromiseStart = historyBlock.indexOf("const cachedHitsPromise = getCachedAnalyses(replayCacheKeys, {");
      const sharedPromiseEnd = historyBlock.indexOf("}).catch((err) => {", sharedPromiseStart);
      const sharedPromiseBlock = historyBlock.slice(sharedPromiseStart, sharedPromiseEnd);
      const pendingReplayStart = historyBlock.indexOf("const pendingReplays = [");
      const raceStart = historyBlock.indexOf("const settled = await Promise.race(");
      const replayStart = historyBlock.indexOf("const replay = historyReplayFromHits(settled.source, settled.hits, replayCacheKeys, petType, scanMode);");
      return historyStart !== -1 &&
        historyEnd !== -1 &&
        resultsSource.includes("function historyReplayFromHits(source, hits, replayCacheKeys, petType, scanMode)") &&
        resultsSource.includes('const analysis = source === "local"') &&
        resultsSource.includes('hit?.hit') &&
        localPromiseStart !== -1 &&
        sharedPromiseStart !== -1 &&
        sharedPromiseBlock.includes("signal: historyCacheController.signal") &&
        sharedPromiseBlock.includes("timeoutMs: HISTORY_SHARED_CACHE_TIMEOUT_MS") &&
        pendingReplayStart !== -1 &&
        raceStart !== -1 &&
        replayStart !== -1 &&
        localPromiseStart < sharedPromiseStart &&
        sharedPromiseStart < pendingReplayStart &&
        pendingReplayStart < raceStart &&
        raceStart < replayStart &&
        historyBlock.includes("pendingReplays.splice(settled.index, 1);") &&
        historyBlock.includes("if (replay) {") &&
        historyBlock.includes("setResult(replay.analysis);") &&
        historyBlock.includes("setDataSource(replay.dataSource);") &&
        historyBlock.includes('console.log("[RESULTS] Local history replay failed:", err.message);') &&
        historyBlock.includes('console.log("[RESULTS] Shared history replay failed:", err.message);') &&
        historyBlock.includes("historyCacheController.abort();") &&
        historyBlock.includes("return new Map();");
    })() &&
    /catch \(err\) \{[\s\S]{0,80}if \(historyCacheController\.signal\.aborted\) return;[\s\S]{0,80}if \(!isCurrentRun\(\)\) return;[\s\S]{0,260}finally \{[\s\S]{0,80}clearTimeout\(historyTimeout\);[\s\S]{0,80}return \(\) => \{[\s\S]{0,80}clearTimeout\(historyTimeout\);[\s\S]{0,80}historyCacheController\.abort\(\);/.test(resultsSource) &&
    /\}, \[route\?\.key, mode, navigation, throttledSetResult, clearPendingResultUpdate, isHumanFood, petType, preProductName, preBrand, preFoodName, barcode, cacheKey, base64, uri, ingredientBase64, scanMode, historyAnalysis, catalogSnapshot, applyExistingAnalysisState\]\);/.test(resultsSource),
  "Results must abort stale async history cache loads, replay species-first history cache keys, and process service events with current route metadata"
);

const genericAnalysisBlock = resultsSource.slice(
  resultsSource.indexOf("// Photo mode: delegate to analysis service"),
  resultsSource.indexOf("// Subscribe to service events")
);
const applyStateBlock = resultsSource.slice(
  resultsSource.indexOf("const applyExistingAnalysisState = useCallback"),
  resultsSource.indexOf("useEffect(() => {", resultsSource.indexOf("const applyExistingAnalysisState = useCallback"))
);
const subscriptionBlock = resultsSource.slice(
  resultsSource.indexOf("const unsub = analysisService.subscribe"),
  resultsSource.indexOf("return () => {", resultsSource.indexOf("const unsub = analysisService.subscribe"))
);
assert(
    resultsSource.includes("const applyExistingAnalysisState = useCallback") &&
    resultsSource.includes('existing.status === "complete"') &&
    resultsSource.includes('existing.status === "running"') &&
    resultsSource.includes("setError(null)") &&
    resultsSource.includes("setDone(false)") &&
    resultsSource.includes("setStreaming(true)") &&
    resultsSource.includes("setResult(existing.result ? { ...existing.result } : {})") &&
    resultsSource.includes('existing.status === "needs_pet_type"') &&
    resultsSource.includes('existing.status === "needs_ingredient_photo"') &&
    resultsSource.includes("existing.recovery || {}") &&
    resultsSource.includes("recovery.productName || preProductName") &&
    resultsSource.includes("cacheKey: recovery.selectedCacheKey || cacheKey") &&
    resultsSource.includes("catalogSnapshot: recovery.catalogSnapshot || catalogSnapshot") &&
    resultsSource.includes("cacheKey: event.selectedCacheKey || cacheKey") &&
    resultsSource.includes("catalogSnapshot: event.catalogSnapshot || catalogSnapshot") &&
    resultsSource.includes("cacheKey: needsPetType.cacheKey || cacheKey") &&
    resultsSource.includes("catalogSnapshot: needsPetType.catalogSnapshot || catalogSnapshot") &&
    /\}, \[needsPetType, navigation, preProductName, preBrand, cacheKey, catalogSnapshot, barcode, base64, uri, ingredientBase64, prestartReplacementAnalysis\]\);/.test(resultsSource) &&
    analysisSource.includes("selectedCacheKey: exactSelectedCacheKey") &&
    analysisSource.includes("catalogSnapshot: selectedProductData || null") &&
    resultsSource.includes("reason: recovery.reason") &&
    resultsSource.includes("reason: event.reason") &&
    resultsSource.includes('needsLabel.reason === "catalog_unusable"') &&
    resultsSource.includes('needsLabel.reason === "catalog_lookup_error"') &&
    resultsSource.includes("catalog ingredient data is incomplete") &&
    resultsSource.includes("couldn't check the catalog") &&
    genericAnalysisBlock.includes("const existing = analysisService.getAnalysis(key)") &&
    genericAnalysisBlock.includes("applyExistingAnalysisState(existing, mode)") &&
    genericAnalysisBlock.includes("if (!key)") &&
    genericAnalysisBlock.includes("Could not start analysis. Please try scanning again.") &&
    genericAnalysisBlock.includes("failAnalysisStartup(\"Could not start analysis. Please try scanning again.") &&
    genericAnalysisBlock.includes("catch (err)") &&
    applyStateBlock.includes("const failAnalysisStartup = useCallback") &&
    applyStateBlock.includes("[RESULTS] Analysis startup failed:") &&
    resultsSource.includes("const clearPendingResultUpdate = useCallback") &&
    resultsSource.includes("ref.timer = null;") &&
    applyStateBlock.includes("serviceKeyRef.current = null") &&
    applyStateBlock.includes("setNeedsLabel(null)") &&
    applyStateBlock.includes("setNeedsPetType(null)") &&
    applyStateBlock.includes("setResult(null)") &&
    applyStateBlock.includes("setStreaming(false)") &&
    applyStateBlock.includes("setDone(true)") &&
    /const applyExistingAnalysisState = useCallback[\s\S]{0,3600}\}, \[barcode, cacheKey, catalogSnapshot, mode, petType, preBrand, preProductName\]\);/.test(resultsSource),
  "Results must immediately attach reused running, completed, and paused non-search analyses"
);

assert(
  /existing\.status === "complete"[\s\S]{0,120}setError\(null\)[\s\S]{0,120}setNeedsLabel\(null\)[\s\S]{0,120}setNeedsPetType\(null\)/.test(applyStateBlock) &&
    /existing\.status === "running"[\s\S]{0,120}setError\(null\)[\s\S]{0,120}setNeedsLabel\(null\)[\s\S]{0,120}setNeedsPetType\(null\)/.test(applyStateBlock) &&
    /existing\.status === "needs_pet_type"[\s\S]{0,120}setError\(null\)[\s\S]{0,120}setDone\(false\)[\s\S]{0,120}setStreaming\(false\)/.test(applyStateBlock) &&
    /existing\.status === "needs_ingredient_photo"[\s\S]{0,120}setError\(null\)[\s\S]{0,120}setDone\(false\)[\s\S]{0,120}setStreaming\(false\)/.test(applyStateBlock) &&
    /existing\.status === "error"[\s\S]{0,120}setNeedsLabel\(null\)[\s\S]{0,120}setNeedsPetType\(null\)/.test(applyStateBlock) &&
    /existing\.status === "not_found"[\s\S]{0,120}setNeedsLabel\(null\)[\s\S]{0,120}setNeedsPetType\(null\)/.test(applyStateBlock) &&
    /event\.type === "phase"[\s\S]{0,180}setError\(null\)[\s\S]{0,120}setNeedsLabel\(null\)[\s\S]{0,120}setNeedsPetType\(null\)[\s\S]{0,120}setDone\(false\)[\s\S]{0,120}setStreaming\(true\)/.test(subscriptionBlock) &&
    /event\.type === "update"[\s\S]{0,180}setError\(null\)[\s\S]{0,120}setNeedsLabel\(null\)[\s\S]{0,120}setNeedsPetType\(null\)[\s\S]{0,120}setDone\(false\)[\s\S]{0,120}setStreaming\(true\)/.test(subscriptionBlock) &&
    /event\.type === "complete"[\s\S]{0,80}clearPendingResultUpdate\(\);[\s\S]{0,220}setError\(null\)[\s\S]{0,120}setNeedsLabel\(null\)[\s\S]{0,120}setNeedsPetType\(null\)/.test(subscriptionBlock) &&
    /event\.type === "need_ingredient_photo"[\s\S]{0,240}clearPendingResultUpdate\(\);[\s\S]{0,120}setError\(null\)[\s\S]{0,120}setDone\(false\)[\s\S]{0,120}setStreaming\(false\)/.test(subscriptionBlock) &&
    /event\.type === "need_pet_type"[\s\S]{0,120}clearPendingResultUpdate\(\);[\s\S]{0,120}setError\(null\)[\s\S]{0,120}setDone\(false\)[\s\S]{0,120}setStreaming\(false\)/.test(subscriptionBlock) &&
    /event\.type === "barcode_not_found"[\s\S]{0,120}clearPendingResultUpdate\(\);[\s\S]{0,180}setStreaming\(false\)/.test(subscriptionBlock) &&
    /event\.type === "error"[\s\S]{0,80}clearPendingResultUpdate\(\);[\s\S]{0,180}setNeedsLabel\(null\)[\s\S]{0,120}setNeedsPetType\(null\)/.test(subscriptionBlock),
  "progress, complete, and terminal analysis states must clear stale paused-input recovery UI and keep active work visibly streaming"
);

assert(
  resultsSource.indexOf("const [isSlowLoading, setIsSlowLoading] = useState(false)") <
    resultsSource.indexOf("const applyExistingAnalysisState = useCallback") &&
    /existing\.status === "complete"[\s\S]{0,260}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);[\s\S]{0,80}setDone\(true\);/.test(applyStateBlock) &&
    /existing\.status === "needs_pet_type"[\s\S]{0,220}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);/.test(applyStateBlock) &&
    /existing\.status === "needs_ingredient_photo"[\s\S]{0,220}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);/.test(applyStateBlock) &&
    /existing\.status === "error"[\s\S]{0,220}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);[\s\S]{0,80}setDone\(true\);/.test(applyStateBlock) &&
    /existing\.status === "not_found"[\s\S]{0,420}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);[\s\S]{0,80}setDone\(true\);/.test(applyStateBlock) &&
    /event\.type === "complete"[\s\S]{0,420}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);[\s\S]{0,80}setDone\(true\);/.test(subscriptionBlock) &&
    /event\.type === "need_ingredient_photo"[\s\S]{0,360}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);/.test(subscriptionBlock) &&
    /event\.type === "need_pet_type"[\s\S]{0,220}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);/.test(subscriptionBlock) &&
    /event\.type === "barcode_not_found"[\s\S]{0,320}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);[\s\S]{0,80}setDone\(true\);/.test(subscriptionBlock) &&
    /event\.type === "error"[\s\S]{0,2200}setStreaming\(false\);[\s\S]{0,80}setIsSlowLoading\(false\);[\s\S]{0,80}setDone\(true\);/.test(subscriptionBlock),
  "completed, paused, and terminal Results states must clear slow-loading UI so stale skeleton state cannot leak into recovery or error screens"
);

assert(
  componentsSource.includes("export function LoadingSkeleton({ loadingStatus, isSlowLoading, phase, productName, dataSource, ingredientCount, onRetry })") &&
    componentsSource.includes("{onRetry && (") &&
    componentsSource.includes("onPress={onRetry}") &&
    componentsSource.includes('accessibilityLabel="Retry analysis"') &&
    componentsSource.includes("Try Again") &&
    resultsSource.includes("const handleLoadingRetry = useCallback(() => {") &&
    /const currentKey = serviceKeyRef\.current;[\s\S]{0,120}analysisService\.releaseAnalysis\(currentKey\);[\s\S]{0,120}analysisService\.cancelAnalysis\(currentKey, "user_loading_retry"\);/.test(resultsSource) &&
    /clearPendingResultUpdate\(\);[\s\S]{0,120}setNeedsLabel\(null\);[\s\S]{0,120}setNeedsPetType\(null\);[\s\S]{0,120}setResult\(null\);[\s\S]{0,120}setError\(null\);[\s\S]{0,120}setStreaming\(false\);[\s\S]{0,120}setIsSlowLoading\(false\);[\s\S]{0,120}setDone\(false\);[\s\S]{0,120}handleRetry\(\);/.test(resultsSource) &&
    /<LoadingSkeleton[\s\S]{0,260}onRetry=\{handleLoadingRetry\}/.test(resultsSource),
  "slow-loading Results skeleton must expose an explicit retry that releases/cancels the owned running analysis and restarts through the normal retry path"
);

assert(
  resultsSource.includes("const RESULTS_STREAMING_WATCHDOG_MS = 76000") &&
    /if \(!streaming \|\| done \|\| error \|\| needsLabel \|\| needsPetType\) return;[\s\S]{0,220}const watchdog = setTimeout\(\(\) => \{[\s\S]{0,140}const currentKey = serviceKeyRef\.current;[\s\S]{0,160}analysisService\.getAnalysis\(currentKey\)[\s\S]{0,180}current\.status !== "running"[\s\S]{0,120}applyExistingAnalysisState\(current, mode\)/.test(resultsSource) &&
    /if \(currentKey && current\?\.status === "running"\) \{[\s\S]{0,120}analysisService\.releaseAnalysis\(currentKey\);[\s\S]{0,120}analysisService\.cancelAnalysis\(currentKey, "results_watchdog_timeout"\);[\s\S]{0,80}\}/.test(resultsSource) &&
    /clearPendingResultUpdate\(\);[\s\S]{0,120}setNeedsLabel\(null\);[\s\S]{0,120}setNeedsPetType\(null\);[\s\S]{0,120}setResult\(null\);[\s\S]{0,120}setStreaming\(false\);[\s\S]{0,120}setIsSlowLoading\(false\);[\s\S]{0,120}setError\("Analysis is taking too long\. Please try again\."\);[\s\S]{0,120}setDone\(true\);/.test(resultsSource) &&
    resultsSource.includes("return () => clearTimeout(watchdog);"),
  "Results must have a post-service-timeout watchdog that cancels stuck background work and recovers missed terminal events into a retryable error instead of leaving partial loading state"
);

assert(
  resultsSource.includes("const isPausedForInput = Boolean(needsPetType || needsLabel)") &&
    resultsSource.includes("const hasRenderableResult = Boolean(result && (") &&
    resultsSource.includes("? (result.foodName || result.summary || result.safetyLevel)") &&
    resultsSource.includes(": (result.productName || result.scorePending === true || result.overallScore != null)") &&
    resultsSource.includes("const isLoading = !hasRenderableResult && !error && !done && !isPausedForInput") &&
    !resultsSource.includes("const isLoading = result === null") &&
    resultsSource.indexOf("if (isLoading)") < resultsSource.indexOf("if (needsPetType)") &&
    resultsSource.indexOf("if (needsPetType)") < resultsSource.indexOf("if (needsLabel)"),
  "empty startup objects must stay in the loading skeleton while paused needs_pet_type and needs_ingredient_photo states render recovery cards"
);

assert(
  /const \{ mode, base64, uri, barcode, cacheKey/.test(resultsSource) &&
    /analysisService\.startAnalysis\(\{ mode, base64, barcode, uri/.test(resultsSource),
  "Results must pass barcode route params into analysisService.startAnalysis"
);

assert(
  resultsSource.includes('event.type === "barcode_not_found"') &&
    resultsSource.includes("Barcode not found. Try scanning the front of the package instead.") &&
    /event\.type === "barcode_not_found"[\s\S]{0,260}setStreaming\(false\)[\s\S]{0,120}setDone\(true\)/.test(resultsSource),
  "Results must turn barcode-not-found events into a terminal error state"
);

assert(
  errorsSource.includes("/barcode not found/i"),
  "barcode-not-found messages must classify as product_not_found for recovery UI"
);

console.log("analysis completion guard passed");
