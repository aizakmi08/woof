import AsyncStorage from "@react-native-async-storage/async-storage";
import { analyzeIngredients, analyzeWithData, analyzeHumanFood, identifyProduct, ocrIngredients, lookupIngredients, augmentIngredients } from "./claude";
import { lookupBarcode } from "./opff";
import { getCachedAnalyses, normalizeCacheKey, getProductData, getProductDataByCacheKey, prefetchAnalyses } from "./cache";
import { addHistoryEntry } from "./history";

const LOCAL_RESULT_PREFIX = "@woof_result_";
const LOCAL_RESULT_KEYS = "@woof_result_keys";
// This is key-count based, not product-count based. Catalog-backed scores are
// intentionally saved under canonical and route alias keys so repeat scans can
// hit AsyncStorage before Supabase; keep enough entries for that fanout.
const MAX_LOCAL_RESULTS = 240;
const LOCAL_RESULT_MEMORY_TTL_MS = 10 * 60 * 1000;

// Must match supabase/functions/analyze/index.ts#ANALYSIS_SCHEMA_VERSION.
// Local-cache entries older than this were scored with a pre-v2 rubric and
// must be re-scored rather than displayed.
const ANALYSIS_SCHEMA_VERSION = 2;
const INCOMPLETE_ANALYSIS_ERROR = "Analysis was interrupted before it finished. Please try again.";

/**
 * Background analysis service — singleton.
 *
 * Manages running analyses so they survive component unmounts.
 * Components subscribe/unsubscribe to receive partial updates,
 * but the analysis itself keeps going even with zero subscribers.
 */

// Slightly above the longest Claude client request deadline (60s) so Results
// does not sit in loading for another minute after the network request timed out.
const ANALYSIS_TIMEOUT_MS = 70000;
const ANALYSIS_CLEANUP_MS = 5 * 60 * 1000;
const BARCODE_ANALYSIS_CACHE_TIMEOUT_MS = 1800;
const BARCODE_CATALOG_CACHE_TIMEOUT_MS = 1800;
const CATALOG_ANALYSIS_CACHE_TIMEOUT_MS = 2500;
const SEARCH_SELECTED_PRODUCT_DATA_TIMEOUT_MS = 2_500;
const SEARCH_FALLBACK_PRODUCT_DATA_TIMEOUT_MS = 4_000;
const PHOTO_PRODUCT_DATA_TIMEOUT_MS = 4_500;
const INGREDIENT_ESTIMATE_LOOKUP_TIMEOUT_MS = 4_500;
const LOCAL_RESULT_READ_TIMEOUT_MS = 700;
const REPLAY_MISS_FALLTHROUGH_MS = 450;
const PET_TYPES = new Set(["dog", "cat"]);
const ANALYSIS_START_MODES = new Set(["barcode", "search", "photo", "photo_with_ingredients", "human_food"]);
const PET_CATEGORY_NAMES_V2 = [
  "Protein Quality",
  "Processing Method",
  "Ingredient Safety",
  "Nutritional Balance",
  "Filler Content",
  "Manufacturer Track Record",
  "Additives & Preservatives",
];

// Map<cacheKey, { status, result, error, dataSource, opffData, uri, mode, controller }>
const analyses = new Map();

// Set<(event) => void>
const subscribers = new Set();

// Temp-ID → real cacheKey mapping (for photo mode before productName arrives)
const keyAliases = new Map();

// Track scheduled cleanups to avoid duplicates
const scheduledCleanups = new Map();
const activeAnalysisOwners = new Map();
const localResultMemoryCache = new Map();

function _knownPetType(value) {
  return PET_TYPES.has(value) ? value : null;
}

function _usableSelectedProductData(snapshot, exactCacheKey) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const expectedKey = normalizeCacheKey(exactCacheKey);
  const rawSnapshotKey = typeof snapshot.productCacheKey === "string"
    ? snapshot.productCacheKey.trim()
    : "";
  const snapshotKey = normalizeCacheKey(rawSnapshotKey);
  if (!expectedKey || snapshotKey !== expectedKey) return null;

  const ingredients = Array.isArray(snapshot.ingredients)
    ? snapshot.ingredients.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
  if (ingredients.length < 5) return null;

  return {
    found: true,
    productCacheKey: snapshotKey,
    productName: typeof snapshot.productName === "string" && snapshot.productName.trim() ? snapshot.productName.trim() : null,
    brand: typeof snapshot.brand === "string" && snapshot.brand.trim() ? snapshot.brand.trim() : null,
    ingredients,
    ingredientText: typeof snapshot.ingredientText === "string" && snapshot.ingredientText.trim()
      ? snapshot.ingredientText.trim()
      : ingredients.join(", "),
    ingredientCount: Number(snapshot.ingredientCount) || ingredients.length,
    nutritionalInfo: snapshot.nutritionalInfo || {},
    nutrientPanel: snapshot.nutrientPanel || null,
    hasPublishedNutrients: !!snapshot.hasPublishedNutrients,
    source: snapshot.source || "product_data",
    sourceUrl: snapshot.sourceUrl || null,
    imageUrl: snapshot.imageUrl || null,
  };
}

function _analysisCacheKey(cacheKey, petType) {
  const resolvedPetType = _knownPetType(petType);
  if (!cacheKey || !resolvedPetType) return null;
  return `${cacheKey}__${resolvedPetType}`;
}

function _fingerprintString(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  const length = value.length;
  const sampleSize = 160;
  const middle = Math.max(0, Math.floor(length / 2) - Math.floor(sampleSize / 2));
  const sample = length <= sampleSize * 3
    ? value
    : `${value.slice(0, sampleSize)}|${value.slice(middle, middle + sampleSize)}|${value.slice(-sampleSize)}`;
  let hash = 2166136261;
  for (let i = 0; i < sample.length; i++) {
    hash ^= sample.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${length.toString(36)}_${(hash >>> 0).toString(36)}`;
}

function _pendingInputKey(prefix, parts) {
  const keyParts = (parts || [])
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  if (!prefix || keyParts.length === 0) return null;
  return `_pending_${prefix}_${keyParts.join("_")}`;
}

function _analysisMatchesPetType(analysis, petType) {
  return _knownPetType(petType) && analysis?.petType === petType;
}

function _matchesRequestedPetType(analysis, petType) {
  const resolvedPetType = _knownPetType(petType);
  return !resolvedPetType || analysis?.petType === resolvedPetType;
}

function _cacheBaseKeyCandidates(primaryKey, fallbackKey) {
  const fallbackKeys = Array.isArray(fallbackKey) ? fallbackKey : [fallbackKey];
  return [...new Set([primaryKey, ...fallbackKeys].filter(Boolean))];
}

function _cacheKeySpellingVariants(cacheKey) {
  const key = typeof cacheKey === "string" ? cacheKey.trim() : "";
  if (!key) return [];
  const variants = new Set([key]);
  const replacements = [
    [/grain free/g, "grainfree"],
    [/grainfree/g, "grain free"],
    [/high protein/g, "highprotein"],
    [/highprotein/g, "high protein"],
    [/multi protein/g, "multiprotein"],
    [/multiprotein/g, "multi protein"],
    [/raw mix/g, "rawmix"],
    [/rawmix/g, "raw mix"],
    [/freeze dried/g, "freezedried"],
    [/freezedried/g, "freeze dried"],
    [/air dried/g, "airdried"],
    [/airdried/g, "air dried"],
  ];
  for (const [pattern, replacement] of replacements) {
    for (const existing of [...variants]) {
      if (variants.size >= 32) break;
      const variant = existing.replace(pattern, replacement).replace(/\s+/g, " ").trim();
      if (variant) variants.add(variant);
    }
  }
  variants.delete(key);
  return [...variants];
}

function _normalizeCacheKeyVariants(...values) {
  const normalized = values.map((value) => normalizeCacheKey(value)).filter(Boolean);
  const variants = normalized.flatMap((key) => [key, ..._cacheKeySpellingVariants(key)]);
  return [...new Set(variants)];
}

function _catalogNameFallbackKeys({ catalogProductName, catalogBrand, routeProductName, routeBrand, excludeKey }) {
  return [...new Set([
    ..._normalizeCacheKeyVariants(catalogProductName),
    ...(catalogBrand && catalogProductName ? _normalizeCacheKeyVariants(`${catalogBrand} ${catalogProductName}`) : []),
    ..._normalizeCacheKeyVariants(routeProductName),
    ...(routeBrand && routeProductName ? _normalizeCacheKeyVariants(`${routeBrand} ${routeProductName}`) : []),
  ].filter((key) => key && key !== excludeKey))];
}

function _identifiedProductFallbackKeys({ productName, brand, variant, excludeKey }) {
  return [...new Set([
    ...(brand && productName ? _normalizeCacheKeyVariants(`${brand} ${productName}`) : []),
    ...(variant && productName ? _normalizeCacheKeyVariants(`${productName} ${variant}`) : []),
    ...(brand && variant ? _normalizeCacheKeyVariants(`${brand} ${variant}`) : []),
  ].filter((key) => key && key !== excludeKey))];
}

async function _getSpeciesCachedAnalysis(primaryKey, fallbackKey, petType, options = {}) {
  const baseKeys = _cacheBaseKeyCandidates(primaryKey, fallbackKey);
  const speciesKeys = baseKeys.map((key) => _analysisCacheKey(key, petType)).filter(Boolean);
  // Legacy speciesless cache keys are accepted only if the result itself is
  // explicitly stamped for the selected species. Query all ordered candidates
  // at once, then preserve priority by reading the result map in key order.
  const keys = [...new Set([...speciesKeys, ...baseKeys])];
  const hits = await getCachedAnalyses(keys, options);
  for (const key of keys) {
    const cached = hits.get(key);
    if (cached?.hit && _analysisMatchesPetType(cached.analysis, petType)) {
      return { ...cached, cacheKey: key };
    }
  }

  return { hit: false };
}

async function _getSpeciesLocalResult(primaryKey, fallbackKey, petType) {
  const baseKeys = _cacheBaseKeyCandidates(primaryKey, fallbackKey);
  const speciesKeys = baseKeys.map((key) => _analysisCacheKey(key, petType)).filter(Boolean);
  const keys = [...new Set([...speciesKeys, ...baseKeys])];
  const now = Date.now();

  for (const key of keys) {
    const local = _getLocalResultMemory(key, now);
    if (local?.analysis && _analysisMatchesPetType(local.analysis, petType)) {
      return { ...local, cacheKey: key };
    }
  }

  const localHits = await _getLocalResults(keys);

  for (const key of keys) {
    const local = localHits.get(key);
    if (local?.analysis && _analysisMatchesPetType(local.analysis, petType)) {
      return { ...local, cacheKey: key };
    }
  }

  return null;
}

function _validReplayResult(source, result, mode) {
  const analysis = result?.analysis;
  if (!analysis?.overallScore || _validateCompletedResult(analysis, mode) !== null) return false;
  return source === "local" || result?.hit === true;
}

async function _firstCompletedReplayResult(localPromise, sharedPromise, mode, signal = null, maxWaitMs = 0) {
  const pending = [
    Promise.resolve(localPromise).then((result) => ({ source: "local", result }), () => ({ source: "local", result: null })),
    Promise.resolve(sharedPromise).then((result) => ({ source: "shared", result }), () => ({ source: "shared", result: null })),
  ];
  let timeoutId = null;
  const deadlinePromise = maxWaitMs > 0
    ? new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve({ timedOut: true, index: -1 }), maxWaitMs);
      })
    : null;

  try {
    while (pending.length > 0) {
      const raced = pending.map((promise, index) => promise.then((value) => ({ ...value, index })));
      const settled = await Promise.race(deadlinePromise ? [...raced, deadlinePromise] : raced);
      if (settled.timedOut) return null;
      pending.splice(settled.index, 1);
      if (signal?.aborted) return null;
      if (_validReplayResult(settled.source, settled.result, mode)) {
        return { source: settled.source, result: settled.result };
      }
    }
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function _abortFinishedParallelWork(state, reason = "analysis completed from replay") {
  if (!state?.controller || state.controller.signal?.aborted) return;
  const err = new Error(reason);
  err.name = "AbortError";
  state.controller.abort(err);
}

function _getSpeciesMemoryResult(primaryKey, fallbackKey, petType) {
  const baseKeys = _cacheBaseKeyCandidates(primaryKey, fallbackKey);
  const speciesKeys = baseKeys.map((key) => _analysisCacheKey(key, petType)).filter(Boolean);
  const keys = [...new Set([...speciesKeys, ...baseKeys])];
  const now = Date.now();

  for (const key of keys) {
    const local = _getLocalResultMemory(key, now);
    if (local?.analysis && _analysisMatchesPetType(local.analysis, petType)) {
      return { ...local, cacheKey: key };
    }
  }

  return null;
}

function _searchRouteFallbackKeys({ realCacheKey, productName, brand }) {
  return [...new Set([
    ..._catalogNameFallbackKeys({
      catalogProductName: productName,
      catalogBrand: brand,
      routeProductName: productName,
      routeBrand: brand,
      excludeKey: realCacheKey,
    }),
  ].filter((key) => key && key !== realCacheKey))];
}

function _completeSearchFromLocalReplay({
  localResult,
  state,
  notifyKey,
  searchAnalysisKeys,
  resolvedPetType,
  historyKey,
  productName,
  sourceLabel,
  fromFallback = false,
}) {
  if (!localResult?.analysis || _validateCompletedResult(localResult.analysis, "search") !== null) {
    return false;
  }

  const replayed = {
    ...localResult.analysis,
    ingredients: Array.isArray(localResult.analysis.ingredients)
      ? localResult.analysis.ingredients.map((ingredient) => (
        ingredient && typeof ingredient === "object" ? { ...ingredient } : ingredient
      ))
      : localResult.analysis.ingredients,
    categories: Array.isArray(localResult.analysis.categories)
      ? localResult.analysis.categories.map((category) => (
        category && typeof category === "object" ? { ...category } : category
      ))
      : localResult.analysis.categories,
    petType: resolvedPetType,
  };

  state.result = replayed;
  state.dataSource = localResult.dataSource || "verified";
  state.opffData = localResult.opffData || null;
  state.status = "complete";
  _abortFinishedParallelWork(state, "search replay completed");
  _saveLocalResultCopies([localResult.cacheKey, ...searchAnalysisKeys], replayed, state.dataSource, state.opffData);
  _saveHistory(state, historyKey || localResult.cacheKey);
  _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
  _scheduleCleanup(notifyKey);
  console.log(`[ANALYSIS] Search INSTANT (${sourceLabel}):`, productName, "| score:", replayed.overallScore, fromFallback ? "| db fallback" : "");
  return true;
}

function _completeBarcodeNameReplay({
  replayResult,
  lookupProduct,
  resolvedPetType,
  state,
  notifyKey,
  analysisKey,
  barcode,
  opffNameAnalysisKeys,
  sourceLabel,
}) {
  if (!replayResult?.analysis || _validateCompletedResult(replayResult.analysis, "barcode") !== null) {
    return false;
  }

  const replayed = lookupProduct.ingredientsText
    ? augmentIngredients(replayResult.analysis, lookupProduct.ingredientsText)
    : {
      ...replayResult.analysis,
      ingredients: Array.isArray(replayResult.analysis.ingredients)
        ? replayResult.analysis.ingredients.map((ingredient) => (
          ingredient && typeof ingredient === "object" ? { ...ingredient } : ingredient
        ))
        : replayResult.analysis.ingredients,
    };
  _stampIngredientProvenance(replayed, lookupProduct.ingredientsText ? "opff" : replayResult.dataSource);
  replayed.petType = resolvedPetType;
  if (lookupProduct?.imageUrl) replayed.productImageUrl = lookupProduct.imageUrl;
  state.result = replayed;
  state.dataSource = lookupProduct.ingredientsText ? "opff" : (replayResult.dataSource || "verified");
  state.opffData = lookupProduct;
  state.status = "complete";
  _abortFinishedParallelWork(state, "barcode replay completed");
  _saveLocalResultCopies([analysisKey || barcode, ...opffNameAnalysisKeys], replayed, state.dataSource, state.opffData);
  _saveHistory(state, analysisKey || barcode);
  _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
  _scheduleCleanup(notifyKey);
  console.log(`[ANALYSIS] Barcode reused ${sourceLabel} name cache:`, lookupProduct.productName, "| score:", replayed.overallScore);
  return true;
}

async function _getSingleSpeciesOrLegacyLocalResult(baseKey, mode) {
  const speciesKeys = ["dog", "cat"]
    .map((petType) => _analysisCacheKey(baseKey, petType))
    .filter(Boolean);
  const keys = [...new Set([...speciesKeys, baseKey].filter(Boolean))];
  const now = Date.now();
  const memorySpeciesHits = [];

  for (const petType of ["dog", "cat"]) {
    const key = _analysisCacheKey(baseKey, petType);
    const local = key ? _getLocalResultMemory(key, now) : null;
    if (
      local?.analysis &&
      _analysisMatchesPetType(local.analysis, petType) &&
      _validateCompletedResult(local.analysis, mode) === null
    ) {
      memorySpeciesHits.push({ ...local, cacheKey: key });
    }
  }

  if (memorySpeciesHits.length === 1) return memorySpeciesHits[0];
  if (memorySpeciesHits.length > 1) return null;

  const memoryLegacy = _getLocalResultMemory(baseKey, now);
  if (memoryLegacy?.analysis && _validateCompletedResult(memoryLegacy.analysis, mode) === null) {
    return { ...memoryLegacy, cacheKey: baseKey };
  }

  const localHits = await _getLocalResults(keys);
  const speciesHits = [];

  for (const petType of ["dog", "cat"]) {
    const key = _analysisCacheKey(baseKey, petType);
    const local = key ? localHits.get(key) : null;
    if (
      local?.analysis &&
      _analysisMatchesPetType(local.analysis, petType) &&
      _validateCompletedResult(local.analysis, mode) === null
    ) {
      speciesHits.push({ ...local, cacheKey: key });
    }
  }

  if (speciesHits.length === 1) return speciesHits[0];
  if (speciesHits.length > 1) return null;

  const legacy = localHits.get(baseKey);
  if (legacy?.analysis && _validateCompletedResult(legacy.analysis, mode) === null) {
    return { ...legacy, cacheKey: baseKey };
  }

  return null;
}

async function _getSingleSpeciesOrLegacyCachedAnalysis(baseKey, mode, options = {}) {
  const speciesKeys = ["dog", "cat"]
    .map((petType) => _analysisCacheKey(baseKey, petType))
    .filter(Boolean);
  const keys = [...new Set([...speciesKeys, baseKey].filter(Boolean))];
  const hits = await getCachedAnalyses(keys, options);
  const speciesHits = [];

  for (const petType of ["dog", "cat"]) {
    const key = _analysisCacheKey(baseKey, petType);
    const cached = key ? hits.get(key) : null;
    if (
      cached?.hit &&
      _analysisMatchesPetType(cached.analysis, petType) &&
      _validateCompletedResult(cached.analysis, mode) === null
    ) {
      speciesHits.push({ ...cached, cacheKey: key });
    }
  }

  if (speciesHits.length === 1) return speciesHits[0];
  if (speciesHits.length > 1) return { hit: false };

  const legacy = hits.get(baseKey);
  if (legacy?.hit && _validateCompletedResult(legacy.analysis, mode) === null) {
    return { ...legacy, cacheKey: baseKey };
  }

  return { hit: false };
}

function _hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function _validatePetFoodResult(result) {
  const score = Number(result.overallScore);
  if (typeof result.productName !== "string" || result.productName.trim().length === 0) {
    return "missing productName";
  }
  if (!PET_TYPES.has(result.petType)) {
    return "missing petType";
  }
  if (!Number.isFinite(score) || score < 1 || score > 100) {
    return "missing overallScore";
  }
  if (!_hasText(result.summary)) return "missing summary";
  if (!_hasText(result.verdict)) return "missing verdict";

  if (!Array.isArray(result.ingredients) || result.ingredients.length < 3) {
    return "missing ingredients";
  }
  for (const ingredient of result.ingredients) {
    if (
      !ingredient ||
      typeof ingredient !== "object" ||
      !_hasText(ingredient.name) ||
      !_hasText(ingredient.category) ||
      !["good", "bad", "neutral"].includes(ingredient.rating) ||
      !_hasText(ingredient.reason)
    ) {
      return "invalid ingredient";
    }
  }

  if (!Array.isArray(result.categories) || result.categories.length !== PET_CATEGORY_NAMES_V2.length) {
    return "missing categories";
  }
  const categoryNames = new Set(
    result.categories
      .filter((category) =>
        category &&
        typeof category === "object" &&
        _hasText(category.name) &&
        Number.isFinite(Number(category.score)) &&
        Number(category.score) >= 1 &&
        Number(category.score) <= 100 &&
        _hasText(category.detail)
      )
      .map((category) => category.name)
  );
  if (!PET_CATEGORY_NAMES_V2.every((name) => categoryNames.has(name))) {
    return "invalid categories";
  }

  const nutrition = result.nutritionAnalysis;
  if (
    !nutrition ||
    typeof nutrition !== "object" ||
    !_hasText(nutrition.proteinLevel) ||
    !_hasText(nutrition.fatLevel) ||
    !_hasText(nutrition.primaryProteinSource)
  ) {
    return "missing nutritionAnalysis";
  }

  if (!_hasText(result.processingMethod)) return "missing processingMethod";
  if (!_hasText(result.processingDetail)) return "missing processingDetail";
  if (!_hasText(result.aafcoStatement)) return "missing aafcoStatement";
  if (!_hasText(result.nutrientDataCompleteness)) return "missing nutrientDataCompleteness";
  if (!_hasText(result.recallSeverity)) return "missing recallSeverity";
  if (!_hasText(result.recallHistory)) return "missing recallHistory";
  if (!_hasText(result.testingTransparency)) return "missing testingTransparency";

  return null;
}

function _validateCompletedResult(result, mode) {
  if (!result || typeof result !== "object" || result.error) {
    return "missing analysis object";
  }

  if (mode === "human_food") {
    const age = result.ageGuidance;
    if (typeof result.foodName !== "string" || result.foodName.trim().length === 0) {
      return "missing foodName";
    }
    if (!["dog", "cat"].includes(result.petType)) {
      return "missing petType";
    }
    if (!["safe", "caution", "dangerous"].includes(result.safetyLevel)) {
      return "missing safetyLevel";
    }
    if (!_hasText(result.summary)) return "missing summary";
    if (!_hasText(result.explanation)) return "missing explanation";
    if (!_hasText(result.symptoms)) return "missing symptoms";
    if (!_hasText(result.portions)) return "missing portions";
    if (!_hasText(result.preparation)) return "missing preparation";
    if (!_hasText(result.disclaimer)) return "missing disclaimer";
    if (
      !age ||
      typeof age !== "object" ||
      !["safe", "caution", "avoid"].includes(age.puppiesOrKittens) ||
      !["safe", "caution", "avoid"].includes(age.adults) ||
      !["safe", "caution", "avoid"].includes(age.seniors) ||
      !_hasText(age.note)
    ) {
      return "missing ageGuidance";
    }
    return null;
  }

  return _validatePetFoodResult(result);
}

function _validateAnyCompletedResult(result) {
  return (
    _validateCompletedResult(result, "photo") === null ||
    _validateCompletedResult(result, "human_food") === null
  );
}

const AUTHORITATIVE_INGREDIENT_SOURCES = new Set(["opff", "brand", "manufacturer", "verified"]);
const REVIEWED_LISTING_SOURCES = new Set(["web_verified", "dfa", "cfa", "cats"]);
const SCRAPED_INGREDIENT_SOURCES = new Set(["amazon", "chewy", "web"]);

function _ingredientSourceMeta(source) {
  if (AUTHORITATIVE_INGREDIENT_SOURCES.has(source)) {
    return {
      source: source || "verified",
      trustLevel: "authoritative",
      ingredientSource: "verified",
      label: "Verified ingredient data",
      progressLabel: "verified ingredients",
    };
  }
  if (REVIEWED_LISTING_SOURCES.has(source)) {
    return {
      source,
      trustLevel: "listing",
      ingredientSource: "listing",
      label: "Product-listing ingredient data",
      progressLabel: "product-listing ingredients",
    };
  }
  if (source === "user_ocr") {
    return {
      source,
      trustLevel: "community_ocr",
      ingredientSource: "user_ocr",
      label: "Label-photo ingredient data",
      progressLabel: "label-photo ingredients",
    };
  }
  if (SCRAPED_INGREDIENT_SOURCES.has(source)) {
    return {
      source,
      trustLevel: "scraped",
      ingredientSource: "scraped",
      label: "Retailer/listing ingredient data",
      progressLabel: "listing-derived ingredients",
    };
  }
  if (source === "gpt") {
    return {
      source,
      trustLevel: "knowledge_estimate",
      ingredientSource: "knowledge",
      label: "AI ingredient estimate",
      progressLabel: "estimated ingredients",
    };
  }
  return {
    source: source || "unknown",
    trustLevel: "unknown",
    ingredientSource: "catalog",
    label: "Catalog ingredient data",
    progressLabel: "catalog ingredients",
  };
}

function _stampIngredientProvenance(target, source) {
  if (!target || typeof target !== "object") return target;
  const meta = _ingredientSourceMeta(source);
  target.ingredientSource = meta.ingredientSource;
  target.ingredientSourceTrustLevel = meta.trustLevel;
  target.ingredientSourceLabel = meta.label;
  return target;
}

function _ingredientNamesFromProduct(product) {
  if (Array.isArray(product?.ingredients)) {
    return product.ingredients
      .map((ingredient) => {
        if (typeof ingredient === "string") return ingredient.trim();
        if (ingredient && typeof ingredient === "object" && typeof ingredient.name === "string") {
          return ingredient.name.trim();
        }
        return "";
      })
      .filter(Boolean);
  }

  if (typeof product?.ingredientsText === "string") {
    return product.ingredientsText
      .split(",")
      .map((ingredient) => ingredient.trim())
      .filter(Boolean);
  }

  return [];
}

function _catalogPreviewIngredient(name) {
  return {
    name,
    category: "Pending score",
    rating: "neutral",
    reason: "Verified ingredient; scoring is still in progress.",
  };
}

function _createCatalogPreview(product, source) {
  const ingredientNames = _ingredientNamesFromProduct(product);
  if (ingredientNames.length < 3) return null;
  const preview = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    productName: product.productName || product.name || "Product",
    brand: product.brand || "",
    petType: _knownPetType(product.petType),
    productImageUrl: product.imageUrl || product.productImageUrl || null,
    ingredients: ingredientNames.map(_catalogPreviewIngredient),
    scorePending: true,
  };
  return _stampIngredientProvenance(preview, source || product.source);
}

function _mergeCatalogPreview(partial, preview, source) {
  if (!preview) return partial;
  const candidate = partial && typeof partial === "object" ? partial : {};
  const partialIngredients = Array.isArray(candidate.ingredients) ? candidate.ingredients : [];
  const hasCompleteIngredientList = partialIngredients.length >= preview.ingredients.length;
  const merged = {
    ...preview,
    ...candidate,
    productName: candidate.productName || preview.productName,
    brand: candidate.brand || preview.brand,
    petType: _knownPetType(candidate.petType) || preview.petType,
    productImageUrl: candidate.productImageUrl || preview.productImageUrl,
    ingredients: hasCompleteIngredientList ? partialIngredients : preview.ingredients,
    scorePending: candidate.overallScore == null,
  };
  return _stampIngredientProvenance(merged, source);
}

function _publishCatalogPreview({ state, notifyKey, product, source }) {
  const preview = _createCatalogPreview(product, source);
  if (!preview) return null;
  state.result = preview;
  _notify({ type: "update", cacheKey: notifyKey, result: preview, opffData: product });
  return preview;
}

function _failInvalidCompletion(state, cacheKey, reason) {
  state.result = null;
  state.error = INCOMPLETE_ANALYSIS_ERROR;
  state.status = "error";
  _notify({ type: "error", cacheKey, error: state.error });
  _scheduleCleanup(cacheKey);
  console.log("[ANALYSIS] Rejected incomplete analysis for:", cacheKey, "|", reason);
}

function _guardCompletedAnalysis(state, cacheKey, analysis, mode = state.mode) {
  const reason = _validateCompletedResult(analysis, mode);
  if (!reason) return true;
  _failInvalidCompletion(state, cacheKey, reason);
  return false;
}

function _notify(event) {
  for (const cb of subscribers) {
    try {
      cb(_analysisEventSnapshot(event));
    } catch (err) {
      console.log("[ANALYSIS] Subscriber error:", err.message);
    }
  }
}

function _cloneJsonish(value) {
  if (!value || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? [...value] : { ...value };
  }
}

function _analysisStateSnapshot(entry) {
  if (!entry) return null;
  return {
    status: entry.status,
    result: entry.result ? _cloneJsonish(entry.result) : entry.result,
    error: entry.error,
    dataSource: entry.dataSource,
    opffData: entry.opffData ? _cloneJsonish(entry.opffData) : entry.opffData,
    uri: entry.uri,
    mode: entry.mode,
    recovery: entry.recovery ? _cloneJsonish(entry.recovery) : entry.recovery,
  };
}

function _analysisEventSnapshot(event) {
  if (!event || typeof event !== "object") return event;
  return {
    ...event,
    result: event.result ? _cloneJsonish(event.result) : event.result,
    opffData: event.opffData ? _cloneJsonish(event.opffData) : event.opffData,
    recovery: event.recovery ? _cloneJsonish(event.recovery) : event.recovery,
  };
}

function _getEntry(key) {
  const resolvedKey = resolveKey(key);
  if (analyses.has(resolvedKey)) return { entry: analyses.get(resolvedKey), resolvedKey };
  return { entry: null, resolvedKey };
}

function _analysisOwnerCount(key) {
  const resolvedKey = resolveKey(key);
  return activeAnalysisOwners.get(resolvedKey) || activeAnalysisOwners.get(key) || 0;
}

export function retainAnalysis(key) {
  if (!key) return null;
  const resolvedKey = resolveKey(key);
  activeAnalysisOwners.set(resolvedKey, (activeAnalysisOwners.get(resolvedKey) || 0) + 1);
  return resolvedKey;
}

export function releaseAnalysis(key) {
  if (!key) return;
  const resolvedKey = resolveKey(key);
  const count = activeAnalysisOwners.get(resolvedKey) || activeAnalysisOwners.get(key) || 0;
  if (count <= 1) {
    activeAnalysisOwners.delete(resolvedKey);
    activeAnalysisOwners.delete(key);
    return;
  }
  activeAnalysisOwners.set(resolvedKey, count - 1);
  if (resolvedKey !== key) activeAnalysisOwners.delete(key);
}

/**
 * Schedule cleanup of a completed analysis entry after 5 minutes.
 * Timers are bound to the state that scheduled them so an old error/cancelled
 * analysis cannot delete a fresh retry that reused the same key.
 */
function _clearScheduledCleanup(key) {
  if (!key) return;
  const keys = new Set([key, resolveKey(key)]);
  for (const cleanupKey of keys) {
    const timeoutId = scheduledCleanups.get(cleanupKey);
    if (!timeoutId) continue;
    clearTimeout(timeoutId);
    scheduledCleanups.delete(cleanupKey);
  }
}

function _scheduleCleanup(key) {
  const cleanupKey = resolveKey(key);
  _clearScheduledCleanup(cleanupKey);
  const targetEntry = analyses.get(cleanupKey);
  if (!targetEntry) return;
  const timeoutId = setTimeout(() => {
    scheduledCleanups.delete(cleanupKey);
    const entry = analyses.get(cleanupKey);
    if (entry && entry === targetEntry && _analysisOwnerCount(cleanupKey) > 0) {
      _scheduleCleanup(cleanupKey);
      return;
    }
    if (entry && entry === targetEntry && entry.status !== "running") {
      analyses.delete(cleanupKey);
    }
    // Clean up any aliases pointing to this key
    if (!entry || entry === targetEntry) {
      for (const [alias, target] of keyAliases) {
        if (target === cleanupKey) keyAliases.delete(alias);
      }
    }
  }, ANALYSIS_CLEANUP_MS);
  scheduledCleanups.set(cleanupKey, timeoutId);
}

/**
 * Register state under a new realCacheKey, cleaning up the old key/tempId.
 */
function _rekey(oldKey, newKey, state) {
  if (oldKey === newKey) return;
  _clearScheduledCleanup(oldKey);
  _clearScheduledCleanup(newKey);
  const ownerCount = activeAnalysisOwners.get(oldKey);
  if (ownerCount) {
    activeAnalysisOwners.set(newKey, (activeAnalysisOwners.get(newKey) || 0) + ownerCount);
    activeAnalysisOwners.delete(oldKey);
  }
  if (analyses.has(oldKey) && analyses.get(oldKey) === state) {
    analyses.delete(oldKey);
  }
  for (const [alias, target] of keyAliases) {
    if (target === oldKey) keyAliases.set(alias, newKey);
  }
  keyAliases.set(oldKey, newKey);
  analyses.set(newKey, state);
}

/**
 * Race an analysis promise against a hard timeout.
 * If the analysis completes or errors on its own, the timeout is cleared.
 * If the timeout fires first, it aborts the stream and emits an error.
 */
async function _withTimeout(analysisPromise, state, cacheKey) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("ANALYSIS_TIMEOUT")), ANALYSIS_TIMEOUT_MS);
  });

  try {
    await Promise.race([analysisPromise, timeoutPromise]);
    if (state.status === "running" && !state.controller?.signal?.aborted) {
      const notifyKey = resolveKey(cacheKey);
      state.result = null;
      state.error = INCOMPLETE_ANALYSIS_ERROR;
      state.status = "error";
      _notify({ type: "error", cacheKey: notifyKey, error: state.error });
      _scheduleCleanup(notifyKey);
      console.log("[ANALYSIS] Analysis resolved without a terminal state:", notifyKey);
    }
  } catch (err) {
    const notifyKey = resolveKey(cacheKey);
    if (err.message === "ANALYSIS_TIMEOUT" && state.status === "running") {
      state.controller?.abort();
      state.error = "Analysis is taking too long. Please try again.";
      state.status = "error";
      _notify({ type: "error", cacheKey: notifyKey, error: state.error });
      _scheduleCleanup(notifyKey);
      console.log("[ANALYSIS] Hard timeout reached for:", notifyKey);
    } else if (state.status === "running" && !state.controller?.signal?.aborted) {
      state.result = null;
      state.error = err?.message || INCOMPLETE_ANALYSIS_ERROR;
      state.status = "error";
      _notify({ type: "error", cacheKey: notifyKey, error: state.error });
      _scheduleCleanup(notifyKey);
      console.log("[ANALYSIS] Analysis rejected without a terminal state:", notifyKey, "|", state.error);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Subscribe to analysis events.
 * callback receives { type: "update"|"complete"|"error", cacheKey, ...data }
 * Returns an unsubscribe function.
 */
export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * Get the current state of an active (or recently completed) analysis.
 * Returns { status, result, error, dataSource, opffData } or null.
 */
export function getAnalysis(key) {
  const { entry } = _getEntry(key);
  return _analysisStateSnapshot(entry);
}

/**
 * Resolve a temp ID or cacheKey to its canonical key.
 * Follows the alias chain to the final target (handles multi-stage rekeying).
 */
export function resolveKey(key) {
  let resolved = key;
  let depth = 0;
  while (keyAliases.has(resolved) && depth < 5) {
    resolved = keyAliases.get(resolved);
    depth++;
  }
  return resolved;
}

/**
 * Cancel a running analysis that no mounted Results screen owns anymore.
 * This prevents abandoned scans from continuing paid AI work and later saving
 * history without the UI-owned quota path ever running.
 */
export function cancelAnalysis(key, reason = "abandoned") {
  if (!key) return false;
  const { entry, resolvedKey } = _getEntry(key);
  if (!entry || entry.status !== "running") return false;
  if (_analysisOwnerCount(resolvedKey) > 0) return false;

  entry.controller?.abort();
  entry.error = "Analysis cancelled.";
  entry.status = "cancelled";
  _scheduleCleanup(resolvedKey);
  console.log("[ANALYSIS] Cancelled running analysis:", resolvedKey, "|", reason);
  return true;
}

export function clearAnalysisSessionData() {
  for (const entry of analyses.values()) {
    entry.controller?.abort?.();
  }
  analyses.clear();
  keyAliases.clear();
  localResultMemoryCache.clear();
  for (const timeoutId of scheduledCleanups.values()) {
    clearTimeout(timeoutId);
  }
  scheduledCleanups.clear();
  activeAnalysisOwners.clear();
}

/**
 * Start (or attach to) a background analysis.
 * Returns the cacheKey used to track it.
 *
 * If an analysis for this key is already running, returns the existing key
 * so the caller can subscribe without duplicating API calls.
 */
export function startAnalysis({ mode, base64, barcode, uri, petType, isPro = true, ingredientBase64, productName: preIdentifiedName, brand: preIdentifiedBrand, foodName, selectedCacheKey, selectedProductData }) {
  if (!ANALYSIS_START_MODES.has(mode)) {
    console.log("[ANALYSIS] startAnalysis called with unsupported mode:", mode);
    return null;
  }
  if (mode === "barcode" && !barcode) {
    console.log("[ANALYSIS] startAnalysis called with barcode mode but no barcode");
    return null;
  }
  if ((mode === "photo" || mode === "photo_with_ingredients") && !base64) {
    console.log("[ANALYSIS] startAnalysis called with photo mode but no base64:", mode);
    return null;
  }
  if (mode === "photo_with_ingredients" && !preIdentifiedName) {
    console.log("[ANALYSIS] startAnalysis called with photo_with_ingredients mode but no productName");
    return null;
  }
  if (mode === "human_food" && !petType) {
    console.log("[ANALYSIS] startAnalysis called with human_food mode but missing petType");
    return null;
  }
  if (mode === "human_food" && !base64 && !foodName) {
    console.log("[ANALYSIS] startAnalysis called with human_food mode but missing both base64 and foodName");
    return null;
  }
  if (mode === "search" && !preIdentifiedName) {
    console.log("[ANALYSIS] startAnalysis called with search mode but no productName");
    return null;
  }

  const selectedSearchCacheKey = normalizeCacheKey(selectedCacheKey);
  const searchBaseKey = mode === "search"
    ? (selectedSearchCacheKey || normalizeCacheKey(preIdentifiedName))
    : null;
  const identifiedProductBaseKey = mode === "photo_with_ingredients"
    ? normalizeCacheKey(preIdentifiedBrand ? `${preIdentifiedBrand} ${preIdentifiedName}` : preIdentifiedName)
    : null;
  const identifiedEstimateBaseKey = mode === "photo_with_ingredients" && !ingredientBase64
    ? (() => {
        return identifiedProductBaseKey ? `${identifiedProductBaseKey}__estimate` : null;
      })()
    : null;
  const photoPendingKey = mode === "photo"
    ? _pendingInputKey("photo", [_knownPetType(petType) || "species_pending", _fingerprintString(base64)])
    : null;
  const labelPhotoPendingKey = mode === "photo_with_ingredients" && ingredientBase64
    ? _pendingInputKey("label", [
        _analysisCacheKey(identifiedProductBaseKey, petType) || identifiedProductBaseKey,
        _fingerprintString(ingredientBase64),
      ])
    : null;
  const humanFoodPendingKey = mode === "human_food"
    ? _pendingInputKey("human_food", [
        _knownPetType(petType) || "species_pending",
        foodName ? normalizeCacheKey(foodName) : _fingerprintString(base64),
      ])
    : null;
  let cacheKey = mode === "barcode"
    ? (_analysisCacheKey(barcode, petType) || barcode)
    : (
        mode === "search"
          ? (_analysisCacheKey(searchBaseKey, petType) || searchBaseKey)
          : (
              mode === "human_food"
                ? humanFoodPendingKey
                : (
                    identifiedEstimateBaseKey
                      ? (_analysisCacheKey(identifiedEstimateBaseKey, petType) || identifiedEstimateBaseKey)
                      : (labelPhotoPendingKey || photoPendingKey)
                  )
            )
      );
  const tempId = cacheKey || `_temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Already running, complete, or paused for user input for this key? Reuse it.
  // Paused recovery states must survive route/auth re-renders; otherwise a
  // Results remount can overwrite the prompt and restart the same scan.
  if (cacheKey) {
    const { entry } = _getEntry(cacheKey);
    if (entry && (
      entry.status === "running" ||
      entry.status === "complete" ||
      entry.status === "needs_pet_type" ||
      entry.status === "needs_ingredient_photo"
    )) {
      console.log("[ANALYSIS] Reusing existing analysis for key:", cacheKey);
      return cacheKey;
    }
  }

  const controller = new AbortController();
  const signal = controller.signal;

  const state = {
    status: "running",
    result: null,
    error: null,
    dataSource: "ai",
    opffData: null,
    uri: uri || null,
    mode,
    controller,
    isPro,
  };

  _clearScheduledCleanup(tempId);
  analyses.set(tempId, state);

  if (mode === "barcode") {
    _withTimeout(
      _runBarcode({ cacheKey: tempId, barcode, petType, signal, state, isPro }),
      state, tempId
    );
  } else if (mode === "search") {
    // Search mode: product name already known, skip identification, go straight to DB + analysis
    _withTimeout(
      _runSearch({ tempId, productName: preIdentifiedName, brand: preIdentifiedBrand, selectedCacheKey: selectedSearchCacheKey, selectedProductData, petType, signal, state, isPro }),
      state, tempId
    );
  } else if (mode === "human_food") {
    _withTimeout(
      _runHumanFood({ tempId, base64, foodName, petType, uri, signal, state, isPro }),
      state, tempId
    );
  } else if (mode === "photo_with_ingredients") {
    _withTimeout(
      _runPhotoWithIngredients({ tempId, base64, ingredientBase64, productName: preIdentifiedName, brand: preIdentifiedBrand, petType, uri, signal, state, isPro }),
      state, tempId
    );
  } else {
    _withTimeout(
      _runPhoto({ tempId, base64, uri, petType, signal, state, isPro }),
      state, tempId
    );
  }

  return tempId;
}

// ── Barcode flow ──────────────────────────────────────────────

async function _runBarcode({ cacheKey, barcode, petType, signal, state, isPro }) {
  let notifyKey = cacheKey;
  let localCacheAliases = [];
  try {
    const requestedPetType = _knownPetType(petType);
    const localPromise = (requestedPetType
      ? _getSpeciesLocalResult(barcode, null, requestedPetType)
      : _getSingleSpeciesOrLegacyLocalResult(barcode, "barcode")
    ).catch((err) => {
      console.log("[ANALYSIS] Barcode local cache read failed:", err.message);
      return null;
    });
    const cachedPromise = (requestedPetType
      ? _getSpeciesCachedAnalysis(barcode, null, requestedPetType, { signal, timeoutMs: BARCODE_ANALYSIS_CACHE_TIMEOUT_MS })
      : _getSingleSpeciesOrLegacyCachedAnalysis(barcode, "barcode", { signal, timeoutMs: BARCODE_ANALYSIS_CACHE_TIMEOUT_MS })
    ).catch((err) => {
      console.log("[ANALYSIS] Barcode shared cache read failed:", err.message);
      return { hit: false };
    });
    // Start the product lookup while cache reads are in flight. Cache hits still
    // render first, but cache misses no longer delay first-time barcode scans.
    const lookupPromise = lookupBarcode(barcode, { signal }).catch((err) => {
      if (!signal.aborted) console.log("[ANALYSIS] Barcode lookup failed:", barcode, "|", err.message);
      return { found: false, reason: "lookup_error" };
    });

    // 1. Render the first validated barcode replay, local or shared. The
    // product lookup is already running, so cache misses still fall through.
    const barcodeReplay = await _firstCompletedReplayResult(
      localPromise,
      cachedPromise,
      "barcode",
      signal,
      REPLAY_MISS_FALLTHROUGH_MS
    );
    if (signal.aborted) return;

    if (barcodeReplay?.source === "local") {
      const local = barcodeReplay.result;
      state.result = local.analysis;
      state.dataSource = local.dataSource || "verified";
      state.opffData = local.opffData || null;
      state.status = "complete";
      _abortFinishedParallelWork(state, "barcode replay completed");
      _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
      _scheduleCleanup(notifyKey);
      return;
    }

    if (barcodeReplay?.source === "shared") {
      const cached = barcodeReplay.result;
      state.result = cached.analysis;
      state.dataSource = cached.dataSource || "verified";
      state.opffData = cached.opffData || null;
      state.status = "complete";
      _abortFinishedParallelWork(state, "barcode replay completed");
      _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
      _scheduleCleanup(notifyKey);
      return;
    }

    // 2. OPFF lookup
    const lookup = await lookupPromise;
    if (signal.aborted) return;

    if (!lookup.found) {
      if (lookup.reason && lookup.reason !== "not_found") {
        state.error = lookup.reason === "timeout"
          ? "Barcode lookup timed out. Check your connection and try again."
          : "Could not check the barcode database. Check your connection and try again.";
        state.status = "error";
        _notify({ type: "error", cacheKey: notifyKey, error: state.error });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] Barcode lookup failed:", barcode, "|", lookup.reason);
        return;
      }
      state.status = "not_found";
      _notify({ type: "barcode_not_found", cacheKey: notifyKey });
      _scheduleCleanup(notifyKey);
      console.log("[ANALYSIS] Barcode not found in OPFF:", barcode);
      return;
    }

    state.opffData = lookup.product;
    const resolvedPetType = requestedPetType || _knownPetType(lookup.product?.petType);
	    if (!resolvedPetType) {
	      state.status = "needs_pet_type";
	      state.recovery = {
        mode: "barcode",
        barcode,
        productName: lookup.product?.productName,
        brand: lookup.product?.brand,
      };
      _notify({
        type: "need_pet_type",
        cacheKey: notifyKey,
        mode: "barcode",
        barcode,
        productName: lookup.product?.productName,
        brand: lookup.product?.brand,
      });
      _scheduleCleanup(notifyKey);
      return;
    }
    lookup.product.petType = resolvedPetType;
    const analysisKey = _analysisCacheKey(barcode, resolvedPetType);
    if (analysisKey && analysisKey !== notifyKey) {
      _rekey(notifyKey, analysisKey, state);
      notifyKey = analysisKey;
    }

    const opffProductNameForKey = lookup.product.productName || "";
    const opffBrandForKey = lookup.product.brand || "";
    const opffNameBaseKey = normalizeCacheKey(
      opffBrandForKey ? `${opffBrandForKey} ${opffProductNameForKey}` : opffProductNameForKey
    ) || normalizeCacheKey(opffProductNameForKey);
    const opffNameFallbackKeys = _catalogNameFallbackKeys({
      catalogProductName: opffProductNameForKey,
      catalogBrand: opffBrandForKey,
      routeProductName: opffProductNameForKey,
      routeBrand: opffBrandForKey,
      excludeKey: opffNameBaseKey,
    });
    const opffNameAnalysisKeys = [opffNameBaseKey, ...opffNameFallbackKeys]
      .map((key) => _analysisCacheKey(key, resolvedPetType))
      .filter(Boolean);
    const opffNameMemoryResult = _getSpeciesMemoryResult(opffNameBaseKey, opffNameFallbackKeys, resolvedPetType);
    if (_completeBarcodeNameReplay({
      replayResult: opffNameMemoryResult,
      lookupProduct: lookup.product,
      resolvedPetType,
      state,
      notifyKey,
      analysisKey,
      barcode,
      opffNameAnalysisKeys,
      sourceLabel: "in-memory",
    })) {
      return;
    }

    const opffNameReplayPromise = opffNameBaseKey
      ? _firstCompletedReplayResult(
          _getSpeciesLocalResult(opffNameBaseKey, opffNameFallbackKeys, resolvedPetType).catch((err) => {
            console.log("[ANALYSIS] Barcode OPFF-name local cache read failed:", err.message);
            return null;
          }),
          _getSpeciesCachedAnalysis(opffNameBaseKey, opffNameFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {
            console.log("[ANALYSIS] Barcode OPFF-name shared cache read failed:", err.message);
            return { hit: false };
          }),
          "barcode",
          signal,
          REPLAY_MISS_FALLTHROUGH_MS
        )
      : null;

    // 3. If OPFF identified the product, try the cleaner catalog/name cache
    // before spending AI/quota on a barcode-specific first score. Name-score
    // replay runs in parallel so a known product can render before product_data.
    const catalogMatchPromise = getProductData({
      productName: lookup.product.productName,
      brand: lookup.product.brand,
    }, undefined, { signal, timeoutMs: BARCODE_CATALOG_CACHE_TIMEOUT_MS });
    let catalogMatch;
    if (opffNameReplayPromise) {
      const nameRace = await Promise.race([
        catalogMatchPromise.then((result) => ({ type: "product_data", result })),
        opffNameReplayPromise.then((result) => ({ type: "replay", result })),
      ]);
      if (signal.aborted) return;

      if (
        nameRace.type === "replay" &&
        _completeBarcodeNameReplay({
          replayResult: nameRace.result?.result,
          lookupProduct: lookup.product,
          resolvedPetType,
          state,
          notifyKey,
          analysisKey,
          barcode,
          opffNameAnalysisKeys,
          sourceLabel: nameRace.result?.source === "shared" ? "shared" : "local",
        })
      ) {
        return;
      }

      catalogMatch = nameRace.type === "product_data"
        ? nameRace.result
        : await catalogMatchPromise;
    } else {
      catalogMatch = await catalogMatchPromise;
    }
    if (signal.aborted) return;

    let catalogProductForScoring = null;
    let catalogPreview = null;
    if (catalogMatch.found && catalogMatch.ingredients?.length >= 5) {
      const catalogSourceMeta = _ingredientSourceMeta(catalogMatch.source);
      const catalogBaseKey = catalogMatch.productCacheKey || normalizeCacheKey(catalogMatch.brand ? `${catalogMatch.brand} ${catalogMatch.productName}` : catalogMatch.productName);
      const catalogProductNameForKey = catalogMatch.productName || lookup.product.productName;
      const catalogBrandForKey = catalogMatch.brand || lookup.product.brand;
      const catalogFallbackKeys = _catalogNameFallbackKeys({
        catalogProductName: catalogProductNameForKey,
        catalogBrand: catalogBrandForKey,
        routeProductName: lookup.product.productName,
        routeBrand: lookup.product.brand,
        excludeKey: catalogBaseKey,
      });
      const catalogAnalysisKeys = [catalogBaseKey, ...catalogFallbackKeys]
        .map((key) => _analysisCacheKey(key, resolvedPetType))
        .filter(Boolean);
      const catalogAnalysisKey = catalogAnalysisKeys[0] || null;
      localCacheAliases = catalogAnalysisKeys;
      catalogProductForScoring = {
        ...lookup.product,
        productName: catalogMatch.productName || lookup.product.productName,
        brand: catalogMatch.brand || lookup.product.brand || "",
        petType: resolvedPetType,
        ingredientsText: catalogMatch.ingredientText,
        ingredients: catalogMatch.ingredients,
        nutriments: catalogMatch.nutritionalInfo || lookup.product.nutriments || {},
        nutrientPanel: catalogMatch.nutrientPanel || null,
        hasPublishedNutrients: !!catalogMatch.hasPublishedNutrients,
        source: catalogSourceMeta.source,
        sourceTrustLevel: catalogSourceMeta.trustLevel,
        sourceLabel: catalogSourceMeta.label,
        sourceUrl: catalogMatch.sourceUrl || null,
        imageUrl: catalogMatch.imageUrl || lookup.product.imageUrl || null,
      };
      state.opffData = catalogProductForScoring;
      catalogPreview = _publishCatalogPreview({
        state,
        notifyKey,
        product: catalogProductForScoring,
        source: catalogProductForScoring.source,
      });
      const localCatalogPromise = _getSpeciesLocalResult(catalogBaseKey, catalogFallbackKeys, resolvedPetType).catch((err) => {
        console.log("[ANALYSIS] Barcode catalog local cache read failed:", err.message);
        return null;
      });
      const cachedCatalogPromise = _getSpeciesCachedAnalysis(catalogBaseKey, catalogFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {
        console.log("[ANALYSIS] Barcode catalog shared cache read failed:", err.message);
        return { hit: false };
      });

      const catalogReplayResult = await _firstCompletedReplayResult(
        localCatalogPromise,
        cachedCatalogPromise,
        "barcode",
        signal,
        REPLAY_MISS_FALLTHROUGH_MS
      );
      if (signal.aborted) return;

      if (catalogReplayResult?.source === "local") {
        const localCatalogResult = catalogReplayResult.result;
        const augmented = augmentIngredients(localCatalogResult.analysis, catalogMatch.ingredientText);
        _stampIngredientProvenance(augmented, catalogMatch.source || localCatalogResult.dataSource);
        augmented.petType = resolvedPetType;
        if (catalogMatch.imageUrl || lookup.product?.imageUrl) {
          augmented.productImageUrl = catalogMatch.imageUrl || lookup.product.imageUrl;
        }
        state.result = augmented;
        state.dataSource = catalogMatch.source || localCatalogResult.dataSource || "verified";
        state.opffData = catalogProductForScoring;
        state.status = "complete";
        _abortFinishedParallelWork(state, "barcode catalog replay completed");
        _saveLocalResultCopies([analysisKey || barcode, ...localCacheAliases], augmented, state.dataSource, state.opffData);
        _saveHistory(state, analysisKey || barcode);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] Barcode reused local catalog cache:", lookup.product.productName, "| score:", augmented.overallScore);
        return;
      }

      if (catalogReplayResult?.source === "shared") {
        const cachedCatalogAnalysis = catalogReplayResult.result;
        const augmented = augmentIngredients(cachedCatalogAnalysis.analysis, catalogMatch.ingredientText);
        _stampIngredientProvenance(augmented, catalogMatch.source || cachedCatalogAnalysis.dataSource);
        augmented.petType = resolvedPetType;
        if (catalogMatch.imageUrl || lookup.product?.imageUrl) {
          augmented.productImageUrl = catalogMatch.imageUrl || lookup.product.imageUrl;
        }
        state.result = augmented;
        state.dataSource = catalogMatch.source || cachedCatalogAnalysis.dataSource || "verified";
        state.opffData = catalogProductForScoring;
        state.status = "complete";
        _abortFinishedParallelWork(state, "barcode catalog replay completed");
        _saveLocalResultCopies([analysisKey || barcode, ...localCacheAliases], augmented, state.dataSource, state.opffData);
        _saveHistory(state, analysisKey || barcode);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] Barcode reused catalog cache:", lookup.product.productName, "| score:", augmented.overallScore);
        return;
      }

      if (catalogAnalysisKeys.length > 0) {
        prefetchAnalyses(catalogAnalysisKeys).catch((err) => console.log("[ANALYSIS] Barcode catalog prewarm failed:", err.message));
      }
    }

    // 4. Stream analysis
    const scoringProduct = catalogProductForScoring || lookup.product;
    const cacheAliases = catalogProductForScoring && catalogMatch?.found && catalogMatch.ingredients?.length >= 5
      ? localCacheAliases
      : [];
    state.opffData = scoringProduct;
    if (!catalogPreview) {
      catalogPreview = _publishCatalogPreview({
        state,
        notifyKey,
        product: scoringProduct,
        source: scoringProduct?.source || (catalogProductForScoring ? catalogMatch?.source : "opff"),
      });
    }
    const onUpdate = (partial) => {
      const merged = _mergeCatalogPreview(partial, catalogPreview, scoringProduct?.source || (catalogProductForScoring ? catalogMatch?.source : "opff"));
      state.result = merged;
      _notify({ type: "update", cacheKey: notifyKey, result: merged, opffData: state.opffData });
    };
    const analysis = await analyzeWithData(scoringProduct, undefined, { onUpdate, signal, cacheKey: analysisKey || barcode, lookupType: "barcode", cacheAliases, clientProStatus: isPro === true });
    if (signal.aborted) return;

    if (analysis.error) {
      // Clear stale partial result from onUpdate so UI renders error, not broken view.
      state.result = null;
      state.error = analysis.error;
      state.status = "error";
      _notify({ type: "error", cacheKey: notifyKey, error: analysis.error });
      _scheduleCleanup(notifyKey);
      return;
    }

    analysis.petType = resolvedPetType;
    if (!_guardCompletedAnalysis(state, notifyKey, analysis, "barcode")) return;

    // OPFF returns imageUrl; propagate so hero + history + recent-scans see it.
    if (scoringProduct?.imageUrl) analysis.productImageUrl = scoringProduct.imageUrl;
    state.result = analysis;
    state.dataSource = catalogProductForScoring?.source || "verified";
    state.status = "complete";

    // Cache write happens server-side in the Edge Function
    _saveLocalResultCopies([analysisKey || barcode, ...localCacheAliases], analysis, state.dataSource, scoringProduct);
    _saveHistory(state, analysisKey || barcode);
    _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: false });
    _scheduleCleanup(notifyKey);
    console.log("[ANALYSIS] Barcode analysis complete:", analysis.productName);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    state.error = err.message || "Something went wrong.";
    state.status = "error";
    _notify({ type: "error", cacheKey: notifyKey, error: state.error });
    _scheduleCleanup(notifyKey);
    console.log("[ANALYSIS] Barcode analysis error:", err.message);
  }
}

// ── Search flow (user typed/selected a product name) ────────

async function _runSearch({ tempId, productName, brand, selectedCacheKey, selectedProductData, petType, signal, state, isPro }) {
  let notifyKey = tempId;
  try {
    console.log("[ANALYSIS] Search mode:", productName, "| brand:", brand);

    const exactSelectedCacheKey = normalizeCacheKey(selectedCacheKey);
    const realCacheKey = exactSelectedCacheKey || normalizeCacheKey(productName);
    const resolvedPetType = _knownPetType(petType);
    const serviceCacheKey = _analysisCacheKey(realCacheKey, resolvedPetType) || realCacheKey;
    if (serviceCacheKey) _rekey(tempId, serviceCacheKey, state);
    notifyKey = serviceCacheKey || tempId;

    if (!resolvedPetType) {
      state.status = "needs_pet_type";
      state.recovery = {
        mode: "search",
        productName,
        brand,
        selectedCacheKey: exactSelectedCacheKey,
        catalogSnapshot: selectedProductData || null,
      };
      _notify({
        type: "need_pet_type",
        cacheKey: notifyKey,
        mode: "search",
        productName,
        brand,
        selectedCacheKey: exactSelectedCacheKey,
        catalogSnapshot: selectedProductData || null,
      });
      _scheduleCleanup(notifyKey);
      return;
    }

    _notify({ type: "phase", cacheKey: notifyKey, phase: "looking_up", message: "Looking up " + productName + "..." });
    const routeSearchFallbackKeys = _searchRouteFallbackKeys({ realCacheKey, productName, brand });
    const routeSearchAnalysisKeys = [realCacheKey, ...routeSearchFallbackKeys]
      .map((key) => _analysisCacheKey(key, resolvedPetType))
      .filter(Boolean);
    const routeSearchHistoryKey = routeSearchAnalysisKeys[0] || serviceCacheKey || realCacheKey;
    const routeMemoryResult = _getSpeciesMemoryResult(realCacheKey, routeSearchFallbackKeys, resolvedPetType);
    if (_completeSearchFromLocalReplay({
      localResult: routeMemoryResult,
      state,
      notifyKey,
      searchAnalysisKeys: routeSearchAnalysisKeys,
      resolvedPetType,
      historyKey: routeSearchHistoryKey,
      productName,
      sourceLabel: "memory",
    })) {
      return;
    }

    // Check DB for catalog ingredients. If Home supplied a search row key,
    // trust that exact row before falling back to fuzzy name matching.
    const selectedSnapshot = _usableSelectedProductData(selectedProductData, exactSelectedCacheKey);
    const routeReplayPromise = exactSelectedCacheKey && !selectedSnapshot
      ? _firstCompletedReplayResult(
          _getSpeciesLocalResult(realCacheKey, routeSearchFallbackKeys, resolvedPetType).catch((err) => {
            console.log("[ANALYSIS] Search selected local replay failed:", err.message);
            return null;
          }),
          _getSpeciesCachedAnalysis(realCacheKey, routeSearchFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {
            console.log("[ANALYSIS] Search selected shared replay failed:", err.message);
            return { hit: false };
          }),
          "search",
          signal,
          REPLAY_MISS_FALLTHROUGH_MS
        )
      : null;
    const exactProductDataPromise = exactSelectedCacheKey && !selectedSnapshot
      ? getProductDataByCacheKey(exactSelectedCacheKey, { signal, timeoutMs: SEARCH_SELECTED_PRODUCT_DATA_TIMEOUT_MS })
      : null;

    let dbResult = selectedSnapshot || { found: false };
    if (exactProductDataPromise) {
      const selectedRace = await Promise.race([
        exactProductDataPromise.then((result) => ({ type: "product_data", result })),
        routeReplayPromise.then((result) => ({ type: "replay", result })),
      ]);
      if (signal.aborted) return;

      if (
        selectedRace.type === "replay" &&
        _completeSearchFromLocalReplay({
          localResult: selectedRace.result?.result,
          state,
          notifyKey,
          searchAnalysisKeys: routeSearchAnalysisKeys,
          resolvedPetType,
          historyKey: routeSearchHistoryKey,
          productName,
          sourceLabel: selectedRace.result?.source === "shared" ? "shared" : "local",
        })
      ) {
        return;
      }

      dbResult = selectedRace.type === "product_data"
        ? selectedRace.result
        : await exactProductDataPromise;
      if (signal.aborted) return;
    }
    if (exactSelectedCacheKey && dbResult.reason === "lookup_error") {
      const selectedReplayResult = routeReplayPromise ? await routeReplayPromise : null;
      if (signal.aborted) return;
      if (_completeSearchFromLocalReplay({
        localResult: selectedReplayResult?.result,
        state,
        notifyKey,
        searchAnalysisKeys: routeSearchAnalysisKeys,
        resolvedPetType,
        historyKey: routeSearchHistoryKey,
        productName,
        sourceLabel: selectedReplayResult?.source === "shared" ? "shared" : "local",
        fromFallback: true,
      })) {
        return;
      }
      state.error = "Could not verify this product in the database. Check your connection and try again.";
      state.status = "error";
      _notify({ type: "error", cacheKey: notifyKey, error: state.error });
      _scheduleCleanup(notifyKey);
      return;
    }
    const shouldFallbackToName = !dbResult.found && (!exactSelectedCacheKey || dbResult.reason === "not_found");
    if (shouldFallbackToName) {
      dbResult = await getProductData(productName, brand, { signal, timeoutMs: SEARCH_FALLBACK_PRODUCT_DATA_TIMEOUT_MS });
    }
    if (signal.aborted) return;

    if (dbResult.found && dbResult.ingredients?.length >= 5) {
      console.log("[ANALYSIS] Search DB hit:", dbResult.source, "|", dbResult.ingredientCount, "ingredients");
      const sourceMeta = _ingredientSourceMeta(dbResult.source);

      // Use the product_data row's own cache_key as the base analysis cache key.
      // Scoring is species-specific, so analysis/history keys include dog/cat.
      const sharedCacheKey = dbResult.productCacheKey || realCacheKey;
      const searchFallbackKeys = [...new Set([
        realCacheKey,
        ..._catalogNameFallbackKeys({
          catalogProductName: dbResult.productName || productName,
          catalogBrand: dbResult.brand || brand,
          routeProductName: productName,
          routeBrand: brand,
          excludeKey: sharedCacheKey,
        }),
      ].filter((key) => key && key !== sharedCacheKey))];
      const searchAnalysisKeys = [sharedCacheKey, ...searchFallbackKeys]
        .map((key) => _analysisCacheKey(key, resolvedPetType))
        .filter(Boolean);
      const sharedAnalysisKey = searchAnalysisKeys[0] || null;
      const realAnalysisKey = _analysisCacheKey(realCacheKey, resolvedPetType);
      if (sharedAnalysisKey && sharedAnalysisKey !== notifyKey) {
        _rekey(notifyKey, sharedAnalysisKey, state);
        notifyKey = sharedAnalysisKey;
      }

      const opffProduct = {
        productName: dbResult.productName || productName,
        brand: dbResult.brand || brand || "",
        petType: resolvedPetType,
        ingredientsText: dbResult.ingredientText,
        nutriments: dbResult.nutritionalInfo || {},
        // Full published nutrient panel (from brand-page scrape). When present,
        // the EF scores Nutritional Balance against real DM-basis numbers
        // instead of the guaranteed-analysis min/max.
        nutrientPanel: dbResult.nutrientPanel || null,
        hasPublishedNutrients: !!dbResult.hasPublishedNutrients,
        source: sourceMeta.source,
        sourceTrustLevel: sourceMeta.trustLevel,
        sourceLabel: sourceMeta.label,
        sourceUrl: dbResult.sourceUrl || null,
        imageUrl: dbResult.imageUrl || null,
      };
      state.opffData = opffProduct;
      const catalogPreview = _publishCatalogPreview({
        state,
        notifyKey,
        product: opffProduct,
        source: sourceMeta.source,
      });

      const localResultPromise = _getSpeciesLocalResult(sharedCacheKey, searchFallbackKeys, resolvedPetType).catch((err) => {
        console.log("[ANALYSIS] Search local catalog cache read failed:", err.message);
        return null;
      });
      const cachedAnalysisPromise = _getSpeciesCachedAnalysis(sharedCacheKey, searchFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {
        console.log("[ANALYSIS] Search shared catalog cache read failed:", err.message);
        return { hit: false };
      });

      const replayResult = await _firstCompletedReplayResult(
        localResultPromise,
        cachedAnalysisPromise,
        "search",
        signal,
        REPLAY_MISS_FALLTHROUGH_MS
      );
      if (signal.aborted) return;

      if (replayResult?.source === "local") {
        const localResult = replayResult.result;
        const augmented = augmentIngredients(localResult.analysis, dbResult.ingredientText);
        _stampIngredientProvenance(augmented, dbResult.source || localResult.dataSource);
        augmented.petType = resolvedPetType;
        if (dbResult.imageUrl) augmented.productImageUrl = dbResult.imageUrl;
        state.result = augmented;
        state.dataSource = dbResult.source || localResult.dataSource || "verified";
        state.opffData = localResult.opffData || null;
        state.status = "complete";
        _abortFinishedParallelWork(state, "search catalog replay completed");
        _saveLocalResultCopies([localResult.cacheKey, ...searchAnalysisKeys], augmented, state.dataSource, state.opffData);
        _saveHistory(state, localResult.cacheKey || realAnalysisKey || realCacheKey);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] Search INSTANT (local):", productName, "| ingredients:", augmented.ingredients?.length);
        return;
      }

      if (replayResult?.source === "shared") {
        const cachedAnalysis = replayResult.result;
        const augmented = augmentIngredients(cachedAnalysis.analysis, dbResult.ingredientText);
        _stampIngredientProvenance(augmented, dbResult.source || cachedAnalysis.dataSource);
        augmented.petType = resolvedPetType;
        // DB image always wins over whatever the cached analysis had (or didn't have).
        if (dbResult.imageUrl) augmented.productImageUrl = dbResult.imageUrl;
        state.result = augmented;
        state.dataSource = dbResult.source || cachedAnalysis.dataSource || "verified";
        state.opffData = cachedAnalysis.opffData || null;
        state.status = "complete";
        _abortFinishedParallelWork(state, "search catalog replay completed");
        _saveLocalResultCopies([cachedAnalysis.cacheKey, ...searchAnalysisKeys], augmented, state.dataSource, state.opffData);
        _saveHistory(state, cachedAnalysis.cacheKey || realAnalysisKey || realCacheKey);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] Search INSTANT (cached):", productName, "| ingredients:", augmented.ingredients?.length);
        return;
      }

      // Run Claude analysis with source-labeled catalog ingredients.
      _notify({
        type: "phase",
        cacheKey: notifyKey,
        phase: "analyzing",
        message: `Analyzing ${dbResult.ingredientCount} ${sourceMeta.progressLabel}...`,
        dataSource: sourceMeta.source,
        ingredientCount: dbResult.ingredientCount,
      });

      const onUpdate = (partial) => {
        const merged = _mergeCatalogPreview(partial, catalogPreview, sourceMeta.source);
        state.result = merged;
        _notify({ type: "update", cacheKey: notifyKey, result: merged, opffData: opffProduct });
      };

      // Tell the EF to write to the species-specific shared cache key.
      const analysis = await analyzeWithData(opffProduct, undefined, { onUpdate, signal, cacheKey: sharedAnalysisKey, lookupType: "name", cacheAliases: searchAnalysisKeys, clientProStatus: isPro === true });
      if (signal.aborted) return;

      if (!analysis.error) {
        analysis.petType = resolvedPetType;
        if (!_guardCompletedAnalysis(state, notifyKey, analysis, "search")) return;
        _stampIngredientProvenance(analysis, dbResult.source);
        if (dbResult.imageUrl) analysis.productImageUrl = dbResult.imageUrl;
        state.result = analysis;
        state.dataSource = dbResult.source || "verified";
        state.status = "complete";
        _saveLocalResultCopies(searchAnalysisKeys, analysis, state.dataSource, opffProduct);
        _saveHistory(state, sharedAnalysisKey || realAnalysisKey || realCacheKey);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: false });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] Search complete:", productName, "| score:", analysis.overallScore);
        return;
      }

      // Claude analysis errored. onUpdate left a partial result on state.result
      // (ingredients-only, no score) — clear it so the UI renders the error state
      // instead of the broken "Standard supplement / additive" placeholder view.
      state.result = null;
      state.error = analysis.error || "Analysis failed. Please try again.";
      state.status = "error";
      _notify({ type: "error", cacheKey: notifyKey, error: state.error });
      _scheduleCleanup(notifyKey);
      console.log("[ANALYSIS] Search Claude error:", productName, "|", state.error);
      return;
    }

    // Product is absent from the catalog, or present but not analysis-ready.
    state.error = dbResult.reason === "unusable"
      ? "Product is not analysis-ready because ingredient data is incomplete. Try scanning the product instead."
      : "Product not found in database. Try scanning the product instead.";
    state.status = "error";
    _notify({ type: "error", cacheKey: notifyKey, error: state.error });
    _scheduleCleanup(notifyKey);
    console.log("[ANALYSIS] Search: product not in DB:", productName);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    state.error = err.message || "Something went wrong.";
    state.status = "error";
    _notify({ type: "error", cacheKey: notifyKey, error: state.error });
    _scheduleCleanup(notifyKey);
    console.log("[ANALYSIS] Search error:", err.message);
  }
}

// ── Human food flow ──────────────────────────────────────────

async function _runHumanFood({ tempId, base64, foodName, petType, uri, signal, state, isPro }) {
  const onUpdate = (partial) => {
    if (signal.aborted) return;
    state.result = partial;
    _notify({ type: "update", cacheKey: tempId, result: partial });
  };

  try {
    // Text path or photo path — whichever input was provided.
    const input = foodName ? { foodName } : base64;
    const analysis = await analyzeHumanFood(input, petType, { onUpdate, signal, clientProStatus: isPro === true });
    if (signal.aborted) return;

    if (analysis.error) {
      state.error = analysis.error;
      state.status = "error";
      _notify({ type: "error", cacheKey: tempId, error: analysis.error });
      _scheduleCleanup(tempId);
      return;
    }

    analysis.petType = petType;
    if (!_guardCompletedAnalysis(state, tempId, analysis, "human_food")) return;

    state.result = analysis;
    state.dataSource = "ai";
    state.status = "complete";

    // Save locally for history playback
    _saveLocalResult(tempId, analysis, "ai", null);

    _saveHistory(state, tempId);
    _notify({ type: "complete", cacheKey: tempId, result: analysis, dataSource: "ai", opffData: null, fromCache: false });
    _scheduleCleanup(tempId);
    console.log("[ANALYSIS] Human food check complete:", analysis.foodName, "| safety:", analysis.safetyLevel);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    state.error = err.message || "Something went wrong.";
    state.status = "error";
    _notify({ type: "error", cacheKey: tempId, error: state.error });
    _scheduleCleanup(tempId);
    console.log("[ANALYSIS] Human food check error:", err.message);
  }
}

// ── Photo flow (two-stage: identify → lookup → catalog-backed analysis) ──

// ── New: Photo with OCR'd ingredient label ────────────────────
async function _runPhotoWithIngredients({ tempId, base64, ingredientBase64, productName, brand, petType, uri, signal, state, isPro }) {
  let notifyKey = tempId;
  try {
    const realCacheKey = normalizeCacheKey(brand ? `${brand} ${productName}` : productName);
    const targetBaseKey = !ingredientBase64 && realCacheKey
      ? `${realCacheKey}__estimate`
      : realCacheKey;
    const resolvedPetType = _knownPetType(petType);
    const analysisKey = _analysisCacheKey(targetBaseKey, resolvedPetType);
    const targetKey = analysisKey || targetBaseKey;
    if (targetKey) _rekey(tempId, targetKey, state);
    notifyKey = targetKey || tempId;
    const productFallbackKeys = _catalogNameFallbackKeys({
      catalogProductName: productName,
      catalogBrand: brand,
      routeProductName: productName,
      routeBrand: brand,
      excludeKey: realCacheKey,
    });
    const estimateFallbackKeys = targetBaseKey !== realCacheKey
      ? productFallbackKeys.map((key) => `${key}__estimate`)
      : [];
    const replayFallbackKeys = targetBaseKey !== realCacheKey
      ? [...productFallbackKeys, targetBaseKey, ...estimateFallbackKeys]
      : productFallbackKeys;
    const productAnalysisKeys = [realCacheKey, ...productFallbackKeys]
      .map((key) => _analysisCacheKey(key, resolvedPetType))
      .filter(Boolean);
    const targetAnalysisKeys = targetBaseKey !== realCacheKey
      ? [targetBaseKey, ...estimateFallbackKeys]
          .map((key) => _analysisCacheKey(key, resolvedPetType))
          .filter(Boolean)
      : productAnalysisKeys;

	    if (!resolvedPetType) {
	      state.status = "needs_pet_type";
	      state.recovery = {
	        mode: "photo_with_ingredients",
	        productName,
	        brand,
	      };
	      _notify({
	        type: "need_pet_type",
	        cacheKey: notifyKey,
	        mode: "photo_with_ingredients",
	        productName,
	        brand,
	      });
	      _scheduleCleanup(notifyKey);
	      return;
	    }

    let skippedLabelIngredientLookupPromise = null;
    if (!ingredientBase64) {
      const lookupName = brand && !productName.toLowerCase().includes(String(brand).toLowerCase())
        ? `${brand} ${productName}`
        : productName;
      const skippedLabelLocalPromise = _getSpeciesLocalResult(realCacheKey, replayFallbackKeys, resolvedPetType).catch((err) => {
        console.log("[ANALYSIS] Skip-label local cache read failed:", err.message);
        return null;
      });
      const skippedLabelCachedPromise = _getSpeciesCachedAnalysis(realCacheKey, replayFallbackKeys, resolvedPetType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {
        console.log("[ANALYSIS] Skip-label shared cache read failed:", err.message);
        return { hit: false };
      });
      // Start the estimate lookup while replay caches are checked. Cache hits
      // still render first; first-time skip-label scans begin lookup immediately.
      skippedLabelIngredientLookupPromise = lookupIngredients(lookupName, { signal, timeoutMs: INGREDIENT_ESTIMATE_LOOKUP_TIMEOUT_MS }).catch((err) => {
        if (!signal.aborted) console.log("[ANALYSIS] Ingredient estimate lookup failed:", err.message);
        return { found: false, reason: "lookup_error" };
      });

      const skippedLabelReplay = await _firstCompletedReplayResult(
        skippedLabelLocalPromise,
        skippedLabelCachedPromise,
        "photo_with_ingredients",
        signal,
        REPLAY_MISS_FALLTHROUGH_MS
      );
      if (signal.aborted) return;

      if (skippedLabelReplay?.source === "local") {
        const skippedLabelLocalResult = skippedLabelReplay.result;
        const replayed = { ...skippedLabelLocalResult.analysis, petType: resolvedPetType };
        state.result = replayed;
        state.dataSource = skippedLabelLocalResult.dataSource || "verified";
        state.opffData = skippedLabelLocalResult.opffData || null;
        state.status = "complete";
        _abortFinishedParallelWork(state, "skip-label replay completed");
        _saveHistory(state, skippedLabelLocalResult.cacheKey || analysisKey || targetKey || realCacheKey);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] Skip-label INSTANT (local cache):", productName, "| score:", replayed.overallScore, "| ingredients:", replayed.ingredients?.length);
        return;
      }

      if (skippedLabelReplay?.source === "shared") {
        const skippedLabelCachedResult = skippedLabelReplay.result;
        const replayed = { ...skippedLabelCachedResult.analysis, petType: resolvedPetType };
        state.result = replayed;
        state.dataSource = skippedLabelCachedResult.dataSource || "verified";
        state.opffData = skippedLabelCachedResult.opffData || null;
        state.status = "complete";
        _abortFinishedParallelWork(state, "skip-label replay completed");
        const replayCopyKeys = skippedLabelCachedResult.cacheKey?.includes("__estimate")
          ? [skippedLabelCachedResult.cacheKey, ...targetAnalysisKeys]
          : [skippedLabelCachedResult.cacheKey, ...productAnalysisKeys];
        _saveLocalResultCopies(replayCopyKeys, replayed, state.dataSource, state.opffData);
        _saveHistory(state, skippedLabelCachedResult.cacheKey || analysisKey || targetKey || realCacheKey);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] Skip-label INSTANT (shared cache):", productName, "| score:", replayed.overallScore, "| ingredients:", replayed.ingredients?.length);
        return;
      }
    }

	    // Step 1: OCR the ingredient label photo
	    _notify({ type: "phase", cacheKey: notifyKey, phase: "reading_ingredients", message: "Reading ingredient label..." });

    const ocr = ingredientBase64
      ? await ocrIngredients(ingredientBase64, productName, { signal })
      : { success: false, reason: "no_ingredient_photo" };

    if (signal.aborted) return;

    if (!ocr?.success || !ocr.ingredientText) {
      if (!ingredientBase64) {
        _notify({
          type: "phase",
          cacheKey: notifyKey,
          phase: "looking_up_ingredients",
          message: "Checking ingredient database...",
        });

        const ingredientLookup = await skippedLabelIngredientLookupPromise;
	        if (signal.aborted) return;

        if (ingredientLookup?.found && ingredientLookup.ingredients?.length >= 5) {
          console.log("[ANALYSIS] Ingredient estimate lookup hit:", ingredientLookup.ingredientCount, "ingredients");
          const sourceMeta = _ingredientSourceMeta("gpt");
          _notify({
            type: "phase",
            cacheKey: notifyKey,
            phase: "analyzing",
            message: `Analyzing ${ingredientLookup.ingredientCount} ${sourceMeta.progressLabel}...`,
            dataSource: sourceMeta.source,
            ingredientCount: ingredientLookup.ingredientCount,
          });

          const opffProduct = {
            productName,
            brand: brand || "",
            petType: resolvedPetType,
            ingredientsText: ingredientLookup.ingredientText,
            ingredients: ingredientLookup.ingredients,
            source: sourceMeta.source,
            sourceTrustLevel: sourceMeta.trustLevel,
            sourceLabel: sourceMeta.label,
            nutriments: {},
          };
          state.opffData = opffProduct;
          const catalogPreview = _publishCatalogPreview({
            state,
            notifyKey,
            product: opffProduct,
            source: sourceMeta.source,
          });
          const onUpdate = (partial) => {
            const merged = _mergeCatalogPreview(partial, catalogPreview, sourceMeta.source);
            state.result = merged;
            _notify({ type: "update", cacheKey: notifyKey, result: merged, opffData: opffProduct });
          };

	          const analysis = await analyzeWithData(opffProduct, undefined, { onUpdate, signal, cacheKey: analysisKey, lookupType: "name", cacheAliases: targetAnalysisKeys, clientProStatus: isPro === true });
          if (signal.aborted) return;

          if (!analysis.error) {
            if (!analysis.productName && productName) analysis.productName = productName;
            analysis.petType = resolvedPetType;
            if (!_guardCompletedAnalysis(state, notifyKey, analysis, "photo_with_ingredients")) return;
            _stampIngredientProvenance(analysis, "gpt");
            state.result = analysis;
            state.dataSource = "gpt";
            state.status = "complete";
	            _saveLocalResultCopies(targetAnalysisKeys, analysis, "gpt", opffProduct);
            _saveHistory(state, analysisKey || targetKey || realCacheKey);
            _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: false });
            _scheduleCleanup(notifyKey);
            console.log("[ANALYSIS] Complete (ingredient estimate-derived):", productName, "| score:", analysis.overallScore);
            return;
          }

          state.result = null;
          state.error = analysis.error || "Analysis failed. Please try again.";
          state.status = "error";
          _notify({ type: "error", cacheKey: notifyKey, error: state.error });
          _scheduleCleanup(notifyKey);
          return;
        }

        console.log("[ANALYSIS] Ingredient estimate lookup missed — falling back to photo analysis");
      }

      // OCR failed — fall back to photo analysis
      console.log("[ANALYSIS] OCR failed:", ocr?.reason, "— falling back to photo analysis");
      _notify({ type: "phase", cacheKey: notifyKey, phase: "analyzing_photo", message: "Analyzing from photo..." });
      const onUpdate = (partial) => { state.result = partial; _notify({ type: "update", cacheKey: notifyKey, result: partial }); };
      const analysis = await analyzeIngredients(base64, { onUpdate, signal, clientProStatus: isPro === true });
      if (signal.aborted) return;

      if (!analysis || analysis.error) {
        state.result = null;
        state.error = analysis?.error || "Analysis failed. Please try again.";
        state.status = "error";
        _notify({ type: "error", cacheKey: notifyKey, error: state.error });
        _scheduleCleanup(notifyKey);
        return;
      }

      analysis.productName = productName;
      analysis.petType = resolvedPetType;
      if (!_guardCompletedAnalysis(state, notifyKey, analysis, "photo_with_ingredients")) return;
      state.result = analysis;
      state.dataSource = "ai";
      state.status = "complete";
	      _saveLocalResultCopies(productAnalysisKeys, analysis, "ai", null);
      _saveHistory(state, analysisKey || realCacheKey);
      _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: false });
      _scheduleCleanup(notifyKey);
      return;
    }

    console.log("[ANALYSIS] OCR success:", ocr.ingredientCount, "ingredients");

    const ingredientArray = ocr.ingredientText.split(",").map(i => i.trim()).filter(i => i.length > 0);

    const sourceMeta = _ingredientSourceMeta("user_ocr");

    // Step 2: Analyze with OCR'd label ingredients. The Edge Function saves
    // trusted user OCR product data only after the completed analysis validates.
    _notify({
      type: "phase",
      cacheKey: notifyKey,
      phase: "analyzing",
      message: `Analyzing ${ocr.ingredientCount} ${sourceMeta.progressLabel}...`,
      dataSource: sourceMeta.source,
      ingredientCount: ocr.ingredientCount,
    });

    const opffProduct = {
      productName,
      brand: brand || "",
      petType: resolvedPetType,
      ingredientsText: ocr.ingredientText,
      ingredients: ingredientArray,
      source: sourceMeta.source,
      sourceTrustLevel: sourceMeta.trustLevel,
      sourceLabel: sourceMeta.label,
      nutriments: {},
    };
    state.opffData = opffProduct;
    const catalogPreview = _publishCatalogPreview({
      state,
      notifyKey,
      product: opffProduct,
      source: sourceMeta.source,
    });
    const onUpdate = (partial) => {
      const merged = _mergeCatalogPreview(partial, catalogPreview, sourceMeta.source);
      state.result = merged;
      _notify({ type: "update", cacheKey: notifyKey, result: merged, opffData: opffProduct });
    };

	    const analysis = await analyzeWithData(opffProduct, undefined, { onUpdate, signal, cacheKey: analysisKey, lookupType: "name", cacheAliases: productAnalysisKeys, clientProStatus: isPro === true });
    if (signal.aborted) return;

    if (!analysis.error) {
      if (!analysis.productName && productName) analysis.productName = productName;
      analysis.petType = resolvedPetType;
      if (!_guardCompletedAnalysis(state, notifyKey, analysis, "photo_with_ingredients")) return;
      _stampIngredientProvenance(analysis, "user_ocr");
      state.result = analysis;
      state.dataSource = "user_ocr";
      state.status = "complete";
	      _saveLocalResultCopies(productAnalysisKeys, analysis, "user_ocr", opffProduct);
      _saveHistory(state, analysisKey || realCacheKey);
      _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: false });
      _scheduleCleanup(notifyKey);
      console.log("[ANALYSIS] Complete (OCR label-derived):", productName, "| score:", analysis.overallScore);
    } else {
      // Clear stale partial result so UI shows error, not the broken placeholder view.
      state.result = null;
      state.error = analysis.error;
      state.status = "error";
      _notify({ type: "error", cacheKey: notifyKey, error: analysis.error });
      _scheduleCleanup(notifyKey);
    }
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    state.error = err.message || "Something went wrong.";
    state.status = "error";
    _notify({ type: "error", cacheKey: notifyKey, error: state.error });
    _scheduleCleanup(notifyKey);
  }
}

// ── Photo flow (DB-first, ask for ingredient label if needed) ──
async function _runPhoto({ tempId, base64, uri, petType: routePetType, signal, state, isPro }) {
  let notifyKey = tempId;
  try {
    // ══════════════════════════════════════════════════════════════
    // PASS 1: Read the product name from the photo
    // ══════════════════════════════════════════════════════════════
    _notify({ type: "phase", cacheKey: tempId, phase: "identifying", message: "Reading product name..." });

    let identification = null;
    try {
      identification = await identifyProduct(base64, { signal });
      console.log("[ANALYSIS] Pass 1 result:", identification?.identified ? identification.productName : "NOT identified", "| confidence:", identification?.confidence);
      if (identification?.textReadFromPackage) {
        console.log("[ANALYSIS] Text read from package:", identification.textReadFromPackage.join(", "));
      }
    } catch (err) {
      if (err.name === "AbortError" || signal.aborted) return;
      console.log("[ANALYSIS] Pass 1 error:", err.message);
      // Thrown identification failures are transport/auth/server failures from
      // the identify request. A model result of { identified: false } is the
      // only path that should become "could not read the product name".
      state.error = err.message || "Could not identify the product. Check your connection and try again.";
      state.status = "error";
      _notify({ type: "error", cacheKey: tempId, error: state.error });
      _scheduleCleanup(tempId);
      return;
    }

    if (!identification?.identified || !identification?.productName) {
      const reason = identification?.reason || "Could not read the product name from the photo.";
      console.log("[ANALYSIS] Identification failed:", reason);
      state.error = "Could not read the product name. Please make sure the front of the package with the brand name is clearly visible.";
      state.status = "error";
      _notify({ type: "error", cacheKey: tempId, error: state.error });
      _scheduleCleanup(tempId);
      return;
    }

    const productName = identification.productName;
    const brand = identification.brand || productName.split(/\s*[-–—]\s*/)[0] || null;
    const variant = identification.variant || identification.subBrand || null;
    const petType = _knownPetType(routePetType) || _knownPetType(identification.petType);
    const searchTerms = Array.isArray(identification.searchTerms) ? identification.searchTerms : [];

    console.log("[ANALYSIS] Identified:", productName, "| brand:", brand, "| variant:", variant, "| confidence:", identification.confidence);

    // Assign cache key
    const realCacheKey = normalizeCacheKey(productName);
    const identifiedFallbackKeys = _identifiedProductFallbackKeys({
      productName,
      brand,
      variant,
      excludeKey: realCacheKey,
    });
    if (realCacheKey) _rekey(tempId, realCacheKey, state);
    notifyKey = realCacheKey || tempId;

    if (!petType) {
      state.status = "needs_pet_type";
      state.recovery = {
        mode: "photo",
        productName,
        brand,
        variant,
        confidence: identification.confidence,
      };
      _notify({
        type: "need_pet_type",
        cacheKey: notifyKey,
        mode: "photo",
        productName,
        brand,
        variant,
        confidence: identification.confidence,
      });
      _scheduleCleanup(notifyKey);
      return;
    }

    const serviceAnalysisKey = _analysisCacheKey(realCacheKey, petType);
    const identifiedFallbackAnalysisKeys = identifiedFallbackKeys
      .map((key) => _analysisCacheKey(key, petType))
      .filter(Boolean);
    if (serviceAnalysisKey) {
      _rekey(notifyKey, serviceAnalysisKey, state);
      notifyKey = serviceAnalysisKey;
    }

    // Show identification to user (progressive UX — user sees the product card immediately)
    _notify({
      type: "phase",
      cacheKey: notifyKey,
      phase: "identified",
      productName,
      brand,
      variant,
      petType,
      confidence: identification.confidence,
      message: `Found: ${productName}`,
    });

    const idObj = { productName, brand, variant, searchTerms };
    const identifiedLocalPromise = _getSpeciesLocalResult(realCacheKey, identifiedFallbackKeys, petType).catch((err) => {
      console.log("[ANALYSIS] Photo identified local cache read failed:", err.message);
      return null;
    });
    const identifiedCachedPromise = _getSpeciesCachedAnalysis(realCacheKey, identifiedFallbackKeys, petType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {
      console.log("[ANALYSIS] Photo identified shared cache read failed:", err.message);
      return { hit: false };
    });
    // Start product_data while identified score caches are checked. Replays still
    // render first, but first-time photo scans no longer wait on cache misses.
    const dbResultPromise = getProductData(idObj, undefined, { signal, timeoutMs: PHOTO_PRODUCT_DATA_TIMEOUT_MS }).catch((err) => {
      if (!signal.aborted) console.log("[ANALYSIS] Photo product lookup failed:", err.message);
      return { found: false, reason: "lookup_error" };
    });

    // Repeat photo scans can render from either local replay or shared cache
    // before waiting on product_data. Slow local storage should not block a
    // valid shared score that is already available.
    const identifiedReplay = await _firstCompletedReplayResult(
      identifiedLocalPromise,
      identifiedCachedPromise,
      "photo",
      signal,
      REPLAY_MISS_FALLTHROUGH_MS
    );
    if (signal.aborted) return;

    if (identifiedReplay?.source === "local") {
      const identifiedLocalResult = identifiedReplay.result;
      const replayed = { ...identifiedLocalResult.analysis, petType };
      if (identification.imageUrl && !replayed.productImageUrl) {
        replayed.productImageUrl = identification.imageUrl;
      }
      state.result = replayed;
      state.dataSource = identifiedLocalResult.dataSource || "verified";
      state.opffData = identifiedLocalResult.opffData || null;
      state.status = "complete";
      _abortFinishedParallelWork(state, "photo identified replay completed");
      _saveLocalResultCopies([identifiedLocalResult.cacheKey, serviceAnalysisKey, ...identifiedFallbackAnalysisKeys], replayed, state.dataSource, state.opffData);
      _saveHistory(state, identifiedLocalResult.cacheKey || serviceAnalysisKey || realCacheKey);
      _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
      _scheduleCleanup(notifyKey);
      console.log("[ANALYSIS] Photo INSTANT (identified local cache):", productName, "| score:", replayed.overallScore, "| ingredients:", replayed.ingredients?.length);
      return;
    }

    if (identifiedReplay?.source === "shared") {
      const identifiedCachedResult = identifiedReplay.result;
      const replayed = { ...identifiedCachedResult.analysis, petType };
      if (identification.imageUrl && !replayed.productImageUrl) {
        replayed.productImageUrl = identification.imageUrl;
      }
      state.result = replayed;
      state.dataSource = identifiedCachedResult.dataSource || "verified";
      state.opffData = identifiedCachedResult.opffData || null;
      state.status = "complete";
      _abortFinishedParallelWork(state, "photo identified replay completed");
      _saveLocalResultCopies([identifiedCachedResult.cacheKey, serviceAnalysisKey, ...identifiedFallbackAnalysisKeys], replayed, state.dataSource, state.opffData);
      _saveHistory(state, identifiedCachedResult.cacheKey || serviceAnalysisKey || realCacheKey);
      _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
      _scheduleCleanup(notifyKey);
      console.log("[ANALYSIS] Photo INSTANT (identified shared cache):", productName, "| score:", replayed.overallScore, "| ingredients:", replayed.ingredients?.length);
      return;
    }

    // ══════════════════════════════════════════════════════════════
    // PASS 2: DB lookup only — web scraping (ScrapingBee) is disabled to avoid
    // ongoing third-party costs. Catalog grows organically via user-submitted
    // ingredient label photos in the photo_with_ingredients flow.
    // ══════════════════════════════════════════════════════════════
    _notify({ type: "phase", cacheKey: notifyKey, phase: "looking_up", message: "Checking database..." });

    let dbResult = await dbResultPromise;

    if (signal.aborted) return;

    if (dbResult.found && dbResult.ingredients?.length >= 5) {
      console.log("[ANALYSIS] Catalog data hit:", dbResult.source, "|", dbResult.ingredientCount, "ingredients");
      const sourceMeta = _ingredientSourceMeta(dbResult.source);

      // SHARED cache key: every user landing on this product_data row sees the same
      // cached score for the same species. Falls back to legacy entries only
      // when the cached result itself is stamped with the same pet type.
      const sharedCacheKey = dbResult.productCacheKey || realCacheKey;
      const photoFallbackKeys = [...new Set([
        realCacheKey,
        ..._catalogNameFallbackKeys({
          catalogProductName: dbResult.productName || productName,
          catalogBrand: dbResult.brand || brand,
          routeProductName: productName,
          routeBrand: brand,
          excludeKey: sharedCacheKey,
        }),
      ].filter((key) => key && key !== sharedCacheKey))];
      const photoAnalysisKeys = [sharedCacheKey, ...photoFallbackKeys]
        .map((key) => _analysisCacheKey(key, petType))
        .filter(Boolean);
      const sharedAnalysisKey = photoAnalysisKeys[0] || null;
      const realAnalysisKey = _analysisCacheKey(realCacheKey, petType);
      if (sharedAnalysisKey && sharedAnalysisKey !== notifyKey) {
        _rekey(notifyKey, sharedAnalysisKey, state);
        notifyKey = sharedAnalysisKey;
      }

      const opffProduct = {
        productName: dbResult.productName || productName,
        brand: dbResult.brand || brand || "",
        petType,
        ingredientsText: dbResult.ingredientText,
        nutriments: dbResult.nutritionalInfo || {},
        // Full published nutrient panel — same as search-mode flow above.
        nutrientPanel: dbResult.nutrientPanel || null,
        hasPublishedNutrients: !!dbResult.hasPublishedNutrients,
        source: sourceMeta.source,
        sourceTrustLevel: sourceMeta.trustLevel,
        sourceLabel: sourceMeta.label,
        sourceUrl: dbResult.sourceUrl || null,
        imageUrl: dbResult.imageUrl || identification.imageUrl || null,
      };
      state.opffData = opffProduct;
      const catalogPreview = _publishCatalogPreview({
        state,
        notifyKey,
        product: opffProduct,
        source: sourceMeta.source,
      });

      const localResultPromise = _getSpeciesLocalResult(sharedCacheKey, photoFallbackKeys, petType).catch((err) => {
        console.log("[ANALYSIS] Photo local catalog cache read failed:", err.message);
        return null;
      });
      const cachedAnalysisPromise = _getSpeciesCachedAnalysis(sharedCacheKey, photoFallbackKeys, petType, { signal, timeoutMs: CATALOG_ANALYSIS_CACHE_TIMEOUT_MS }).catch((err) => {
        console.log("[ANALYSIS] Photo shared catalog cache read failed:", err.message);
        return { hit: false };
      });

      const photoReplayResult = await _firstCompletedReplayResult(
        localResultPromise,
        cachedAnalysisPromise,
        "photo",
        signal,
        REPLAY_MISS_FALLTHROUGH_MS
      );
      if (signal.aborted) return;

      if (photoReplayResult?.source === "local") {
        const localResult = photoReplayResult.result;
        const augmented = augmentIngredients(localResult.analysis, dbResult.ingredientText);
        _stampIngredientProvenance(augmented, dbResult.source || localResult.dataSource);
        augmented.petType = petType;
        if (dbResult.imageUrl) augmented.productImageUrl = dbResult.imageUrl;
        state.result = augmented;
        state.dataSource = dbResult.source || localResult.dataSource || "verified";
        state.opffData = localResult.opffData || null;
        state.status = "complete";
        _abortFinishedParallelWork(state, "photo catalog replay completed");
        _saveLocalResultCopies([localResult.cacheKey, ...photoAnalysisKeys], augmented, state.dataSource, state.opffData);
        _saveHistory(state, localResult.cacheKey || realAnalysisKey || realCacheKey);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] INSTANT (local cache):", productName, "| score:", augmented.overallScore, "| ingredients:", augmented.ingredients?.length);
        return;
      }

      if (photoReplayResult?.source === "shared") {
        const cachedAnalysis = photoReplayResult.result;
        const augmented = augmentIngredients(cachedAnalysis.analysis, dbResult.ingredientText);
        _stampIngredientProvenance(augmented, dbResult.source || cachedAnalysis.dataSource);
        augmented.petType = petType;
        // DB image always wins over whatever the cached analysis had (or didn't have).
        if (dbResult.imageUrl) augmented.productImageUrl = dbResult.imageUrl;
        state.result = augmented;
        state.dataSource = dbResult.source || cachedAnalysis.dataSource || "verified";
        state.opffData = cachedAnalysis.opffData || null;
        state.status = "complete";
        _abortFinishedParallelWork(state, "photo catalog replay completed");
        _saveLocalResultCopies([cachedAnalysis.cacheKey, ...photoAnalysisKeys], augmented, state.dataSource, state.opffData);
        _saveHistory(state, cachedAnalysis.cacheKey || realAnalysisKey || realCacheKey);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] INSTANT (cached):", productName, "| score:", augmented.overallScore, "| ingredients:", augmented.ingredients?.length);
        return;
      }

      // No cached analysis — run Claude analysis with source-labeled catalog ingredients.
      _notify({
        type: "phase",
        cacheKey: notifyKey,
        phase: "analyzing",
        message: `Analyzing ${dbResult.ingredientCount} ${sourceMeta.progressLabel}...`,
        dataSource: sourceMeta.source,
        ingredientCount: dbResult.ingredientCount,
      });

      const onUpdate = (partial) => {
        const merged = _mergeCatalogPreview(partial, catalogPreview, sourceMeta.source);
        state.result = merged;
        _notify({ type: "update", cacheKey: notifyKey, result: merged, opffData: opffProduct });
      };

      // Write to the species-specific shared key so subsequent same-species
      // scans get the cached score without cross-species reuse.
      const analysis = await analyzeWithData(opffProduct, undefined, { onUpdate, signal, cacheKey: sharedAnalysisKey, lookupType: "name", cacheAliases: photoAnalysisKeys, clientProStatus: isPro === true });
      if (signal.aborted) return;

      if (!analysis.error) {
        analysis.petType = petType;
        if (!_guardCompletedAnalysis(state, notifyKey, analysis, "photo")) return;
        _stampIngredientProvenance(analysis, dbResult.source);
        if (dbResult.imageUrl) analysis.productImageUrl = dbResult.imageUrl;
        state.result = analysis;
        state.dataSource = dbResult.source || "verified";
        state.status = "complete";
        _saveLocalResultCopies(photoAnalysisKeys, analysis, state.dataSource, opffProduct);
        _saveHistory(state, sharedAnalysisKey || realAnalysisKey || realCacheKey);
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: false });
        _scheduleCleanup(notifyKey);
        console.log("[ANALYSIS] Complete (catalog-backed, first analysis):", productName, "| score:", analysis.overallScore);
        return;
      }

      // Claude analysis errored — clear stale partial so UI renders error state.
      state.result = null;
      state.error = analysis.error || "Analysis failed. Please try again.";
      state.status = "error";
      _notify({ type: "error", cacheKey: notifyKey, error: state.error });
      _scheduleCleanup(notifyKey);
      return;
    }

    // ── DATABASE MISSED OR WAS UNAVAILABLE: Ask user to photograph ingredient label ──
    const labelRecoveryReason = dbResult.reason === "unusable"
      ? "catalog_unusable"
      : dbResult.reason === "lookup_error"
        ? "catalog_lookup_error"
        : "no_verified_data";
    console.log("[ANALYSIS] Catalog data unavailable — requesting ingredient photo for:", productName, "| reason:", labelRecoveryReason);
    state.status = "needs_ingredient_photo";
    state.recovery = {
      productName,
      brand,
      variant,
      petType,
      confidence: identification.confidence,
      reason: labelRecoveryReason,
    };
    _notify({
      type: "need_ingredient_photo",
      cacheKey: notifyKey,
      productName,
      brand,
      variant,
      petType,
      confidence: identification.confidence,
      // Hint to the UI: show what we identified and why label capture is needed.
      reason: labelRecoveryReason,
    });
    // Flow pauses here — IngredientCaptureScreen will start a new analysis with mode "photo_with_ingredients"
    _scheduleCleanup(notifyKey);

  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    state.error = err.message || "Something went wrong.";
    state.status = "error";
    _notify({ type: "error", cacheKey: notifyKey, error: state.error });
    _scheduleCleanup(notifyKey);
    console.log("[ANALYSIS] Photo flow error:", err.message);
  }
}

// ── Local result cache (AsyncStorage) ─────────────────────────

async function _saveLocalResult(cacheKey, analysis, dataSource, opffData) {
  try {
    const normalizedCacheKey = _normalizeLocalResultCacheKey(cacheKey);
    if (!normalizedCacheKey) return;
    if (!_validateAnyCompletedResult(analysis)) {
      console.log("[ANALYSIS] Skipping local result save — incomplete analysis for:", normalizedCacheKey);
      return;
    }

    const savedAt = Date.now();
    const fingerprint = _localResultFingerprint(analysis, dataSource, opffData);
    const storageFresh = _reusableLocalResultMemory(normalizedCacheKey, fingerprint, savedAt);
    _rememberLocalResultMemory(normalizedCacheKey, { analysis, dataSource, opffData, savedAt }, savedAt, fingerprint);
    if (storageFresh) {
      console.log("[ANALYSIS] Skipped duplicate local result write for:", normalizedCacheKey);
      return;
    }
    await Promise.resolve();
    await AsyncStorage.setItem(
      `${LOCAL_RESULT_PREFIX}${normalizedCacheKey}`,
      JSON.stringify({ analysis, dataSource, opffData, savedAt })
    );

    const keys = await _readLocalResultKeys();
    // Deduplicate then prepend
    const filtered = keys.filter((k) => k !== normalizedCacheKey);
    filtered.unshift(normalizedCacheKey);
    const trimmed = filtered.slice(0, MAX_LOCAL_RESULTS);
    await AsyncStorage.setItem(LOCAL_RESULT_KEYS, JSON.stringify(trimmed));

    // Delete evicted entries
    if (filtered.length > MAX_LOCAL_RESULTS) {
      const toDelete = filtered.slice(MAX_LOCAL_RESULTS);
      await Promise.all(
        toDelete.map((k) => AsyncStorage.removeItem(`${LOCAL_RESULT_PREFIX}${k}`))
      );
      _forgetLocalResultMemory(toDelete);
    }
    console.log("[ANALYSIS] Saved local result for:", normalizedCacheKey);
  } catch (e) {
    console.log("[ANALYSIS] Failed to save local result:", e.message);
  }
}

async function _saveLocalResultCopies(cacheKeys, analysis, dataSource, opffData) {
  try {
    const uniqueKeys = _normalizeLocalResultCacheKeys(cacheKeys);
    if (uniqueKeys.length === 0) return;
    if (!_validateAnyCompletedResult(analysis)) {
      console.log("[ANALYSIS] Skipping local result copy save — incomplete analysis");
      return;
    }

    const savedAt = Date.now();
    const fingerprint = _localResultFingerprint(analysis, dataSource, opffData);
    const keysToWrite = uniqueKeys.filter((key) => !_reusableLocalResultMemory(key, fingerprint, savedAt));
    const value = JSON.stringify({ analysis, dataSource, opffData, savedAt });
    for (const key of uniqueKeys) {
      _rememberLocalResultMemory(key, { analysis, dataSource, opffData, savedAt }, savedAt, fingerprint);
    }
    if (keysToWrite.length === 0) {
      console.log("[ANALYSIS] Skipped duplicate local result copy writes for:", uniqueKeys.join(", "));
      return;
    }
    await Promise.resolve();
    await AsyncStorage.multiSet(
      keysToWrite.map((key) => [`${LOCAL_RESULT_PREFIX}${key}`, value])
    );

    const keys = await _readLocalResultKeys();
    const filtered = keys.filter((key) => !uniqueKeys.includes(key));
    const nextKeys = [...uniqueKeys, ...filtered];
    const trimmed = nextKeys.slice(0, MAX_LOCAL_RESULTS);
    await AsyncStorage.setItem(LOCAL_RESULT_KEYS, JSON.stringify(trimmed));

    if (nextKeys.length > MAX_LOCAL_RESULTS) {
      const toDelete = nextKeys.slice(MAX_LOCAL_RESULTS);
      await AsyncStorage.multiRemove(
        toDelete.map((key) => `${LOCAL_RESULT_PREFIX}${key}`)
      );
      _forgetLocalResultMemory(toDelete);
    }
    console.log("[ANALYSIS] Saved local result copies for:", uniqueKeys.join(", "));
  } catch (e) {
    console.log("[ANALYSIS] Failed to save local result copies:", e.message);
  }
}

function _normalizeLocalResultCacheKey(cacheKey) {
  return typeof cacheKey === "string" ? cacheKey.trim() : "";
}

function _normalizeLocalResultCacheKeys(cacheKeys) {
  const seen = new Set();
  return (cacheKeys || [])
    .map(_normalizeLocalResultCacheKey)
    .filter((key) => {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function _localResultFingerprint(analysis, dataSource, opffData) {
  if (!analysis || typeof analysis !== "object") return "";
  try {
    return JSON.stringify({
      schemaVersion: analysis.schemaVersion || 0,
      productName: analysis.productName || analysis.foodName || "",
      petType: analysis.petType || "",
      overallScore: analysis.overallScore ?? null,
      safetyLevel: analysis.safetyLevel || null,
      dataSource: dataSource || "",
      ingredients: Array.isArray(analysis.ingredients)
        ? analysis.ingredients.map((ingredient) => ingredient?.name || ingredient).filter(Boolean)
        : [],
      categories: Array.isArray(analysis.categories)
        ? analysis.categories.map((category) => [category?.name || "", category?.score ?? null])
        : [],
      imageUrl: analysis.productImageUrl || opffData?.imageUrl || null,
    });
  } catch {
    return "";
  }
}

function _reusableLocalResultMemory(cacheKey, fingerprint, now = Date.now()) {
  if (!fingerprint) return false;
  const normalizedCacheKey = _normalizeLocalResultCacheKey(cacheKey);
  if (!normalizedCacheKey) return false;
  const entry = localResultMemoryCache.get(normalizedCacheKey);
  if (!entry) return false;
  if (now - entry.rememberedAt > LOCAL_RESULT_MEMORY_TTL_MS) {
    localResultMemoryCache.delete(normalizedCacheKey);
    return false;
  }
  if (!entry.result?.analysis || !_validateAnyCompletedResult(entry.result.analysis)) {
    localResultMemoryCache.delete(normalizedCacheKey);
    return false;
  }
  return entry.fingerprint === fingerprint;
}

function _parseLocalResultKeys(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return _normalizeLocalResultCacheKeys(parsed);
  } catch {
    return [];
  }
}

async function _readLocalResultKeys() {
  const keysJson = await AsyncStorage.getItem(LOCAL_RESULT_KEYS);
  return _parseLocalResultKeys(keysJson);
}

async function _removeLocalResultKeysFromIndex(cacheKeys) {
  const removeSet = new Set(_normalizeLocalResultCacheKeys(cacheKeys));
  if (removeSet.size === 0) return;
  const keys = await _readLocalResultKeys();
  const next = keys.filter((key) => !removeSet.has(key));
  if (next.length !== keys.length) {
    await AsyncStorage.setItem(LOCAL_RESULT_KEYS, JSON.stringify(next));
  }
}

function _parseStoredLocalResult(cacheKey, json) {
  if (!json) return { result: null, shouldRemove: false };
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { result: null, shouldRemove: true };
  }
  const version = Number(parsed?.analysis?.schemaVersion || 0);
  if (version < ANALYSIS_SCHEMA_VERSION) {
    return { result: null, shouldRemove: true };
  }
  if (!_validateAnyCompletedResult(parsed?.analysis)) {
    return { result: null, shouldRemove: true };
  }
  return { result: parsed, shouldRemove: false };
}

function _rememberLocalResultMemory(cacheKey, result, rememberedAt = Date.now(), fingerprint = null) {
  const normalizedCacheKey = _normalizeLocalResultCacheKey(cacheKey);
  if (!normalizedCacheKey || !result?.analysis || !_validateAnyCompletedResult(result.analysis)) return;
  if (localResultMemoryCache.has(normalizedCacheKey)) {
    localResultMemoryCache.delete(normalizedCacheKey);
  }
  localResultMemoryCache.set(normalizedCacheKey, {
    result,
    rememberedAt,
    fingerprint: fingerprint || _localResultFingerprint(result.analysis, result.dataSource, result.opffData),
  });
  while (localResultMemoryCache.size > MAX_LOCAL_RESULTS) {
    const oldestKey = localResultMemoryCache.keys().next().value;
    if (!oldestKey) break;
    localResultMemoryCache.delete(oldestKey);
  }
}

function _getLocalResultMemory(cacheKey, now = Date.now()) {
  const normalizedCacheKey = _normalizeLocalResultCacheKey(cacheKey);
  if (!normalizedCacheKey) return null;
  const entry = localResultMemoryCache.get(normalizedCacheKey);
  if (!entry) return null;
  if (now - entry.rememberedAt > LOCAL_RESULT_MEMORY_TTL_MS) {
    localResultMemoryCache.delete(normalizedCacheKey);
    return null;
  }
  if (!entry.result?.analysis || !_validateAnyCompletedResult(entry.result.analysis)) {
    localResultMemoryCache.delete(normalizedCacheKey);
    return null;
  }
  // Refresh recency so hot replay aliases survive within the bounded map.
  localResultMemoryCache.delete(normalizedCacheKey);
  localResultMemoryCache.set(normalizedCacheKey, entry);
  return entry.result;
}

function _forgetLocalResultMemory(cacheKeys) {
  for (const key of _normalizeLocalResultCacheKeys(cacheKeys)) {
    localResultMemoryCache.delete(key);
  }
}

async function _withLocalResultReadTimeout(promise, label, timeoutMs = LOCAL_RESULT_READ_TIMEOUT_MS) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const err = new Error(`${label} timed out`);
          err.code = "LOCAL_RESULT_TIMEOUT";
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function _getLocalResults(cacheKeys) {
  const keys = _normalizeLocalResultCacheKeys(cacheKeys);
  if (keys.length === 0) return new Map();

  const hits = new Map();
  const storageKeys = [];
  const storageCacheKeys = [];
  const staleStorageKeys = [];
  const staleCacheKeys = [];
  const now = Date.now();

  for (const key of keys) {
    const memoryHit = _getLocalResultMemory(key, now);
    if (memoryHit) {
      hits.set(key, memoryHit);
      continue;
    }
    storageCacheKeys.push(key);
    storageKeys.push(`${LOCAL_RESULT_PREFIX}${key}`);
  }

  if (storageKeys.length === 0) return hits;

  try {
    const rows = await _withLocalResultReadTimeout(
      AsyncStorage.multiGet(storageKeys),
      "Local result batch read",
    );
    for (let i = 0; i < rows.length; i++) {
      const [, json] = rows[i];
      const cacheKey = storageCacheKeys[i];
      const { result, shouldRemove } = _parseStoredLocalResult(cacheKey, json);
      if (result) {
        hits.set(cacheKey, result);
        _rememberLocalResultMemory(cacheKey, result);
      }
      if (shouldRemove) {
        staleStorageKeys.push(storageKeys[i]);
        staleCacheKeys.push(cacheKey);
      }
    }
  } catch (err) {
    console.log("[ANALYSIS] Failed to batch-read local results:", err.message);
  }

  if (staleStorageKeys.length > 0) {
    AsyncStorage.multiRemove(staleStorageKeys).catch(() => {});
    _removeLocalResultKeysFromIndex(staleCacheKeys).catch(() => {});
    _forgetLocalResultMemory(staleCacheKeys);
  }
  return hits;
}

export async function getLocalResults(cacheKeys) {
  return _getLocalResults(cacheKeys);
}

/**
 * Retrieve a locally cached result. Returns { analysis, dataSource, opffData } or null.
 * Returns null for stale-rubric entries so the caller falls through to a fresh analysis.
 */
export async function getLocalResult(cacheKey) {
  try {
    const normalizedCacheKey = _normalizeLocalResultCacheKey(cacheKey);
    if (!normalizedCacheKey) return null;
    const memoryHit = _getLocalResultMemory(normalizedCacheKey);
    if (memoryHit) return memoryHit;
    const json = await _withLocalResultReadTimeout(
      AsyncStorage.getItem(`${LOCAL_RESULT_PREFIX}${normalizedCacheKey}`),
      "Local result read",
    );
    const { result, shouldRemove } = _parseStoredLocalResult(normalizedCacheKey, json);
    if (shouldRemove) {
      // Drop stale entries as they're read — prevents slow accumulation of old data.
      AsyncStorage.removeItem(`${LOCAL_RESULT_PREFIX}${normalizedCacheKey}`).catch(() => {});
      _removeLocalResultKeysFromIndex([normalizedCacheKey]).catch(() => {});
      _forgetLocalResultMemory([normalizedCacheKey]);
    }
    if (result) _rememberLocalResultMemory(normalizedCacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// ── History helper ────────────────────────────────────────────

function _saveHistory(state, cacheKey) {
  try {
    const invalidReason = _validateCompletedResult(state.result, state.mode);
    if (invalidReason) {
      console.log("[ANALYSIS] Skipping history save — incomplete analysis:", invalidReason);
      return;
    }

    const name = state.result?.productName || state.result?.foodName;
    if (!name) {
      console.log("[ANALYSIS] Skipping history save — no product/food name");
      return;
    }
    if (!cacheKey) {
      console.log("[ANALYSIS] Skipping history save — no cacheKey for:", state.result.productName);
      return;
    }

    if (state.historySaved || state.historySaveQueued) {
      console.log("[ANALYSIS] Skipping duplicate history save for analysis:", cacheKey);
      return;
    }

    const isHumanFood = state.mode === "human_food";
    const humanFoodHistoryPayload = isHumanFood ? {
      foodName: state.result.foodName,
      petType: state.result.petType,
      safetyLevel: state.result.safetyLevel,
      summary: state.result.summary,
      explanation: state.result.explanation,
      symptoms: state.result.symptoms,
      portions: state.result.portions,
      preparation: state.result.preparation,
      disclaimer: state.result.disclaimer,
      toxicCompounds: Array.isArray(state.result.toxicCompounds) ? state.result.toxicCompounds : [],
      alternatives: Array.isArray(state.result.alternatives) ? state.result.alternatives : [],
      ageGuidance: state.result.ageGuidance,
    } : null;
    const entry = {
      productName: name,
      overallScore: isHumanFood ? null : state.result.overallScore,
      petType: state.result.petType,
      dateScanned: new Date().toISOString(),
      cacheKey,
      scanMode: state.mode,
      dataSource: state.dataSource,
      photoUri: null,
      productImageUrl: state.result?.productImageUrl || state.productImageUrl || null,
      ...(isHumanFood && { safetyLevel: state.result.safetyLevel }),
      ...(humanFoodHistoryPayload && { analysisPayload: humanFoodHistoryPayload }),
    };

    state.historySaveQueued = true;
    Promise.resolve()
      .then(() => addHistoryEntry(entry))
      .then(() => {
        state.historySaved = true;
      })
      .catch((err) => {
        state.historySaveQueued = false;
        console.log("[ANALYSIS] Error saving history:", err.message);
      });
  } catch (err) {
    state.historySaveQueued = false;
    console.log("[ANALYSIS] Error saving history:", err.message);
  }
}
