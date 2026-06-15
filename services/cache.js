import { supabase } from "./supabase";
import { reportNetworkError, reportNetworkSuccess } from "./network";

// Must match supabase/functions/analyze/index.ts#ANALYSIS_SCHEMA_VERSION.
// Client-side gate: any cached analysis without this version was scored under
// an older rubric and must be treated as a miss so the Edge Function re-runs
// scoring with the current rubric.
const ANALYSIS_SCHEMA_VERSION = 2;
const PET_CATEGORY_NAMES_V2 = [
  "Protein Quality",
  "Processing Method",
  "Ingredient Safety",
  "Nutritional Balance",
  "Filler Content",
  "Manufacturer Track Record",
  "Additives & Preservatives",
];
const PRODUCT_DATA_QUERY_TIMEOUT_MS = 8000;
const PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS = 350;
const ANALYSIS_CACHE_QUERY_TIMEOUT_MS = 8000;
const ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS = 350;
const CACHE_HIT_RPC_TIMEOUT_MS = 1_500;
const CACHE_HIT_RPC_MAX_INFLIGHT = 2;
const CACHE_HIT_RPC_SCHEMA_RETRY_MS = 60_000;
const WARM_TTL_MS = 5 * 60 * 1000; // 5 min — long enough for a search→tap
let cacheHitRpcInflight = 0;
let cacheHitRpcRetryAt = 0;

function _abortError() {
  return new DOMException("Aborted", "AbortError");
}

function _startQueryDeadline(label, { signal, timeoutMs } = {}) {
  const controller = new AbortController();
  let didTimeout = false;
  let abortFromParent = null;
  const timeout = setTimeout(() => {
    didTimeout = true;
    console.log(`[CACHE] ${label} timeout (${Math.round((timeoutMs || PRODUCT_DATA_QUERY_TIMEOUT_MS) / 1000)}s) — aborting`);
    controller.abort();
  }, timeoutMs || PRODUCT_DATA_QUERY_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw _abortError();
    }
    abortFromParent = () => controller.abort();
    signal.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      clearTimeout(timeout);
      if (abortFromParent) signal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function _remainingQueryBudget(startedAt, totalMs) {
  return Math.max(0, totalMs - (Date.now() - startedAt));
}

function _hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function _isUsableCachedAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object" || analysis.error) return false;
  const version = Number(analysis.schemaVersion || 0);
  if (version < ANALYSIS_SCHEMA_VERSION) return false;

  const score = Number(analysis.overallScore);
  if (typeof analysis.productName !== "string" || analysis.productName.trim().length === 0) return false;
  if (!["dog", "cat"].includes(analysis.petType)) return false;
  if (!Number.isFinite(score) || score < 1 || score > 100) return false;
  if (!_hasText(analysis.summary) || !_hasText(analysis.verdict)) return false;

  if (!Array.isArray(analysis.ingredients) || analysis.ingredients.length < 3) return false;
  for (const ingredient of analysis.ingredients) {
    if (
      !ingredient ||
      typeof ingredient !== "object" ||
      !_hasText(ingredient.name) ||
      !_hasText(ingredient.category) ||
      !["good", "bad", "neutral"].includes(ingredient.rating) ||
      !_hasText(ingredient.reason)
    ) {
      return false;
    }
  }

  if (!Array.isArray(analysis.categories) || analysis.categories.length !== PET_CATEGORY_NAMES_V2.length) return false;
  const categoryNames = new Set(
    analysis.categories
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
  if (!PET_CATEGORY_NAMES_V2.every((name) => categoryNames.has(name))) return false;

  const nutrition = analysis.nutritionAnalysis;
  if (
    !nutrition ||
    typeof nutrition !== "object" ||
    !_hasText(nutrition.proteinLevel) ||
    !_hasText(nutrition.fatLevel) ||
    !_hasText(nutrition.primaryProteinSource)
  ) {
    return false;
  }

  return (
    _hasText(analysis.processingMethod) &&
    _hasText(analysis.processingDetail) &&
    _hasText(analysis.aafcoStatement) &&
    _hasText(analysis.nutrientDataCompleteness) &&
    _hasText(analysis.recallSeverity) &&
    _hasText(analysis.recallHistory) &&
    _hasText(analysis.testingTransparency)
  );
}

/**
 * Deterministic normalization for cache key matching.
 * Lowercase, strip trademark symbols, remove generic food terms,
 * remove non-alphanumeric (except spaces), collapse whitespace.
 */
export function normalizeCacheKey(productName) {
  if (!productName || typeof productName !== "string") return "";
  return productName
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    // Hyphens, slashes, ampersands → space (NOT deleted) so "multi-protein" stays as 2 tokens
    // matching how Chewy / DFA / Amazon scrapers stored them.
    .replace(/[-/&]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function _normalizeProductDataAliasKeys(...values) {
  const normalized = values.map((value) => normalizeCacheKey(value)).filter(Boolean);
  const variants = normalized.flatMap((key) => [key, ..._cacheKeySpellingVariants(key)]);
  return [...new Set(variants)];
}

// Generic words that don't help distinguish two pet food products from each other.
// They get stripped before scoring so "Adult Dog Food" doesn't artificially inflate match scores.
const FILLER_WORDS = new Set([
  "the", "for", "with", "and", "of", "in",
  "adult", "puppy", "kitten", "senior", "junior", "all",
  "dry", "wet", "canned", "kibble", "food", "diet",
  "dog", "cat", "pet", "feline", "canine",
  "natural", "premium", "complete", "balanced", "nutrition",
  "formula", "recipe", "blend", "stages", "stage",
  "lb", "lbs", "kg", "oz", "g", "ml",
]);

// "Variant" tokens — flavors, proteins, life-stage modifiers — that DO distinguish products.
// We require at least one of these to overlap before we trust a match.
const VARIANT_HINTS = new Set([
  "chicken", "beef", "lamb", "turkey", "salmon", "tuna", "fish", "duck", "pork",
  "venison", "rabbit", "bison", "buffalo", "trout", "whitefish", "ocean",
  "rice", "barley", "oat", "potato", "pea", "vegetable", "veggie",
  "grain-free", "grainfree", "limited", "high-protein", "highprotein",
  "weight", "indoor", "outdoor", "sensitive", "skin", "stomach", "joint",
  "small", "large", "medium", "toy", "breed",
  "kitten", "senior", "puppy",
  "multiprotein", "multi-protein", "multi", "protein",
]);

function _tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/-/g, ""))
    .filter((w) => w.length > 1);
}

function _significantTokens(text) {
  return _tokenize(text).filter((w) => !FILLER_WORDS.has(w));
}

function _variantTokens(text) {
  return _tokenize(text).filter((w) => VARIANT_HINTS.has(w));
}

function _candidateText(row) {
  return `${row?.brand || ""} ${row?.product_name || ""}`;
}

function _scoreProductRow(row, querySig, queryVariants) {
  const candSig = _significantTokens(_candidateText(row));
  const candVariants = new Set(_variantTokens(row?.product_name || ""));
  const sigOverlap = querySig.filter((t) => candSig.includes(t)).length;
  const variantOverlap = [...queryVariants].filter((t) => candVariants.has(t)).length;
  const sigScore = querySig.length ? sigOverlap / querySig.length : 0;
  const variantBonus = queryVariants.size > 0 && variantOverlap > 0 ? 0.15 : 0;
  const wrongVariantPenalty =
    queryVariants.size > 0 && candVariants.size > 0 && variantOverlap === 0 ? -0.5 : 0;

  return {
    score: sigScore + variantBonus + wrongVariantPenalty,
    sigOverlap,
    variantOverlap,
  };
}

function _rowMatchesBrand(row, brandName) {
  const brandTokens = _significantTokens(brandName);
  if (brandTokens.length === 0) return true;
  const candidate = normalizeCacheKey(_candidateText(row));
  return brandTokens.some((token) => candidate.includes(token));
}

function _rowPassesMatch(row, brandName, querySig, queryVariants) {
  if (!_rowMatchesBrand(row, brandName)) {
    return { ok: false, reason: "brand_mismatch", ..._scoreProductRow(row, querySig, queryVariants) };
  }

  const score = _scoreProductRow(row, querySig, queryVariants);
  if (score.score < 0.6) {
    return { ok: false, reason: "low_score", ...score };
  }
  if (queryVariants.size > 0 && score.variantOverlap === 0) {
    return { ok: false, reason: "variant_mismatch", ...score };
  }

  return { ok: true, reason: "match", ...score };
}

// Defense in depth: filter individual ingredient strings that look like JSON,
// URLs, or scraped page chrome — even if poisoned data slips into product_data.
function _isPlausibleIngredient(s) {
  if (!s || typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 2 || t.length > 200) return false;
  if (/[\\{}]/.test(t)) return false;
  if (/^[\["']/.test(t)) return false;
  if (/:\s*"/.test(t)) return false;
  if (/\bmailto:|https?:\/\//i.test(t)) return false;
  if (/\b(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName)\b/i.test(t)) return false;
  if ((t.match(/[a-zA-Z]/g) || []).length < 2) return false;
  return true;
}

function _sanitizeIngredients(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(_isPlausibleIngredient);
}

function _normalizeRow(data) {
  // Strip any junk ingredients before handing the row to the rest of the app.
  const cleanedIngredients = _sanitizeIngredients(data.ingredients);
  const cleanedText = cleanedIngredients.join(", ");
  return {
    found: true,
    // The row's own cache_key — used as the SHARED analysis_cache key so all users
    // who hit this product_data row see the same cached Claude score.
    productCacheKey: data.cache_key,
    productName: data.product_name,
    brand: data.brand,
    ingredients: cleanedIngredients,
    ingredientText: cleanedText,
    ingredientCount: cleanedIngredients.length,
    nutritionalInfo: data.nutritional_info,
    // Full published nutrient panel (from brand page scrape) — used by the EF
    // for dry-matter-basis scoring when present. Falls back to nutritional_info
    // or guaranteed analysis when null.
    nutrientPanel: data.nutrient_panel || null,
    hasPublishedNutrients: !!data.has_published_nutrients,
    source: data.source,
    sourceUrl: data.source_url,
    imageUrl: data.image_url || null,
  };
}

function _normalizeUsableRow(data) {
  const normalized = _normalizeRow(data);
  return (normalized.ingredients?.length || 0) >= 5 ? normalized : null;
}

function _productDataRowFromSnapshot(row) {
  if (!row || typeof row !== "object") return null;
  const cacheKey = typeof row.cache_key === "string"
    ? row.cache_key.trim()
    : (typeof row.productCacheKey === "string" ? row.productCacheKey.trim() : "");
  const productName = typeof row.product_name === "string"
    ? row.product_name.trim()
    : (typeof row.productName === "string" ? row.productName.trim() : "");
  if (!cacheKey || !productName) return null;

  return {
    cache_key: cacheKey,
    product_name: productName,
    brand: row.brand || "",
    ingredients: row.ingredients,
    nutritional_info: row.nutritional_info || row.nutritionalInfo || {},
    nutrient_panel: row.nutrient_panel || row.nutrientPanel || null,
    has_published_nutrients: row.has_published_nutrients || row.hasPublishedNutrients || false,
    source: row.source || "product_data",
    source_url: row.source_url || row.sourceUrl || null,
    image_url: row.image_url || row.imageUrl || null,
  };
}

const _productDataWarmCache = new Map();
const _productDataExactInflight = new Map();
const _productDataPrewarmInflightKeys = new Set();
const _productDataPrewarmInflightResults = new Map();
const _productDataKeyInflightResults = new Map();

function _cloneProductDataResult(result) {
  if (!result || result.found !== true) return result;
  return {
    ...result,
    ingredients: [...(result.ingredients || [])],
  };
}

function _rememberWarmProductData(cacheKey, result, warmedAt = Date.now()) {
  const key = normalizeCacheKey(cacheKey);
  if (!key || result?.found !== true || (result.ingredients?.length || 0) < 5) return;
  _productDataWarmCache.set(key, {
    warmedAt,
    result: _cloneProductDataResult(result),
  });
}

function _warmProductDataAliasKeys(result) {
  if (!result || result.found !== true) return [];
  return _normalizeProductDataAliasKeys(
    result.productCacheKey,
    result.productName,
    result.brand && result.productName ? `${result.brand} ${result.productName}` : null
  );
}

function _rememberWarmProductDataAliases(result, warmedAt = Date.now()) {
  for (const key of _warmProductDataAliasKeys(result)) {
    _rememberWarmProductData(key, result, warmedAt);
  }
}

function _getWarmProductData(cacheKey) {
  const key = normalizeCacheKey(cacheKey);
  if (!key) return null;

  const entry = _productDataWarmCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.warmedAt < WARM_TTL_MS && entry.result?.found === true) {
    return _cloneProductDataResult(entry.result);
  }

  _productDataWarmCache.delete(key);
  return null;
}

export function rememberProductDataSnapshots(rows) {
  const warmedAt = Date.now();
  let remembered = 0;
  for (const row of rows || []) {
    const normalized = _normalizeUsableRow(_productDataRowFromSnapshot(row));
    if (!normalized) continue;
    _rememberWarmProductData(row.cache_key || normalized.productCacheKey, normalized, warmedAt);
    _rememberWarmProductData(normalized.productCacheKey, normalized, warmedAt);
    _rememberWarmProductDataAliases(normalized, warmedAt);
    remembered++;
  }
  return remembered;
}

async function _awaitInflightProductDataPrewarm(cacheKey, options = {}, timeoutMs = PRODUCT_DATA_QUERY_TIMEOUT_MS) {
  const key = normalizeCacheKey(cacheKey);
  const inflight = key ? _productDataPrewarmInflightResults.get(key) : null;
  if (!inflight || timeoutMs <= 0) return null;
  if (options.signal?.aborted) return null;

  let timeoutId = null;
  let abortHandler = null;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });
  const abortPromise = options.signal
    ? new Promise((resolve) => {
        abortHandler = () => resolve(null);
        options.signal.addEventListener("abort", abortHandler, { once: true });
      })
    : null;

  try {
    const result = await Promise.race([
      inflight,
      timeoutPromise,
      ...(abortPromise ? [abortPromise] : []),
    ]);
    return result?.found === true ? _cloneProductDataResult(result) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    if (abortHandler) options.signal?.removeEventListener("abort", abortHandler);
  }
}

async function _awaitInflightProductDataResult(cacheKey, options = {}, timeoutMs = PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS) {
  const key = normalizeCacheKey(cacheKey);
  const inflight = key ? _productDataKeyInflightResults.get(key) : null;
  if (!inflight || timeoutMs <= 0) return null;
  if (options.signal?.aborted) return null;

  let timeoutId = null;
  let abortHandler = null;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });
  const abortPromise = options.signal
    ? new Promise((resolve) => {
        abortHandler = () => resolve(null);
        options.signal.addEventListener("abort", abortHandler, { once: true });
      })
    : null;

  try {
    const result = await Promise.race([
      inflight,
      timeoutPromise,
      ...(abortPromise ? [abortPromise] : []),
    ]);
    if (result?.found !== true) return null;
    _rememberWarmProductData(key, result);
    _rememberWarmProductData(result.productCacheKey, result);
    _rememberWarmProductDataAliases(result);
    return _cloneProductDataResult(result);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    if (abortHandler) options.signal?.removeEventListener("abort", abortHandler);
  }
}

async function _awaitAnyInflightProductDataPrewarm(
  options = {},
  timeoutMs = PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS,
  cacheKeys = null
) {
  const targetKeys = Array.isArray(cacheKeys) ? cacheKeys.map(normalizeCacheKey).filter(Boolean) : null;
  const inflight = targetKeys
    ? targetKeys.map((key) => _productDataPrewarmInflightResults.get(key)).filter(Boolean)
    : [..._productDataPrewarmInflightResults.values()];

  if (inflight.length === 0 || timeoutMs <= 0) return;
  if (options.signal?.aborted) return;

  let timeoutId = null;
  let abortHandler = null;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(resolve, timeoutMs);
  });
  const abortPromise = options.signal
    ? new Promise((resolve) => {
        abortHandler = () => resolve();
        options.signal.addEventListener("abort", abortHandler, { once: true });
      })
    : null;

  try {
    await Promise.race([
      Promise.allSettled(inflight),
      timeoutPromise,
      ...(abortPromise ? [abortPromise] : []),
    ]);
  } finally {
    clearTimeout(timeoutId);
    if (abortHandler) options.signal?.removeEventListener("abort", abortHandler);
  }
}

function _bestWarmProductDataCandidate(keys, candidateKeys, brandName, querySig, queryVariants) {
  const warmedCandidates = keys
    .map((key) => {
      const normalized = _getWarmProductData(key);
      if (!normalized) return null;
      const row = {
        brand: normalized.brand,
        product_name: normalized.productName,
        cache_key: normalized.productCacheKey || key,
      };
      return {
        row,
        normalized,
        ...candidateKeys.get(key),
        ..._rowPassesMatch(row, brandName, querySig, queryVariants),
      };
    })
    .filter(Boolean);

  for (const rejected of warmedCandidates.filter((entry) => !entry.ok)) {
    console.log(
      "[CACHE] Product data warm candidate rejected:",
      rejected.row.cache_key,
      `| ${rejected.reason} | score ${rejected.score.toFixed(2)}`,
    );
  }

  return warmedCandidates
    .filter((entry) => entry.ok)
    .sort((a, b) =>
      a.priority - b.priority ||
      b.score - a.score ||
      (b.normalized.ingredientCount || 0) - (a.normalized.ingredientCount || 0)
    )[0] || null;
}

export async function getProductDataByCacheKey(cacheKey, options = {}) {
  if (!cacheKey || typeof cacheKey !== "string") return { found: false, reason: "not_found" };
  const exactCacheKey = normalizeCacheKey(cacheKey);
  if (!exactCacheKey) return { found: false, reason: "not_found" };

  const lookupTimeoutMs = options.timeoutMs || PRODUCT_DATA_QUERY_TIMEOUT_MS;
  const prewarmAwaitTimeoutMs = Number.isFinite(options.prewarmWaitMs)
    ? Math.max(0, options.prewarmWaitMs)
    : PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS;
  const lookupStartedAt = Date.now();

  const warmed = _getWarmProductData(cacheKey);
  if (warmed && normalizeCacheKey(warmed.productCacheKey) === exactCacheKey) {
    console.log("[CACHE] Product data WARM HIT (selected key):", cacheKey, "| ingredients:", warmed.ingredients.length);
    return warmed;
  }
  if (warmed) {
    console.log("[CACHE] Product data warm alias ignored for selected key:", cacheKey, "| row key:", warmed.productCacheKey);
  }

  const prewarmResult = await _awaitInflightProductDataPrewarm(
    cacheKey,
    options,
    Math.min(
      _remainingQueryBudget(lookupStartedAt, lookupTimeoutMs),
      prewarmAwaitTimeoutMs,
    )
  );
  if (prewarmResult?.found === true) {
    console.log("[CACHE] Product data PREWARM IN-FLIGHT HIT (selected key):", cacheKey, "| ingredients:", prewarmResult.ingredients.length);
    return prewarmResult;
  }
  const inflightResult = await _awaitInflightProductDataResult(
    exactCacheKey,
    options,
    Math.min(
      _remainingQueryBudget(lookupStartedAt, lookupTimeoutMs),
      prewarmAwaitTimeoutMs,
    )
  );
  if (inflightResult?.found === true && normalizeCacheKey(inflightResult.productCacheKey) === exactCacheKey) {
    console.log("[CACHE] Product data IN-FLIGHT KEY HIT (selected key):", cacheKey, "| ingredients:", inflightResult.ingredients.length);
    return inflightResult;
  }
  if (inflightResult?.found === true) {
    console.log("[CACHE] Product data in-flight alias ignored for selected key:", cacheKey, "| row key:", inflightResult.productCacheKey);
  }
  if (_remainingQueryBudget(lookupStartedAt, lookupTimeoutMs) <= 0) {
    return { found: false, reason: "lookup_error" };
  }

  const inflightKey = exactCacheKey;
  if (!options.signal && _productDataExactInflight.has(inflightKey)) {
    console.log("[CACHE] Product data IN-FLIGHT HIT (selected key):", cacheKey);
    return _cloneProductDataResult(await _productDataExactInflight.get(inflightKey));
  }

  const lookupPromise = (async () => {
    let request;
    try {
      request = _startQueryDeadline("Exact product_data lookup", {
        signal: options.signal,
        timeoutMs: _remainingQueryBudget(lookupStartedAt, lookupTimeoutMs),
      });
      const { data: rows, error } = await supabase
        .from("product_data")
        .select("*")
        .eq("cache_key", exactCacheKey)
        .gt("expires_at", new Date().toISOString())
        .order("ingredient_count", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(5)
        .abortSignal(request.signal);

      if (error) {
        reportNetworkError(error);
        console.log("[CACHE] Exact selected row lookup error:", error.message);
        return { found: false, reason: "lookup_error" };
      }
      reportNetworkSuccess();
      if (!rows || rows.length === 0) return { found: false, reason: "not_found" };

      for (const row of rows) {
        const normalized = _normalizeUsableRow(row);
        if (!normalized) {
          console.log("[CACHE] Selected key candidate rejected:", row.cache_key, "| unusable ingredients after sanitization");
          continue;
        }
        console.log("[CACHE] Product data HIT (selected key):", cacheKey, "| ingredients:", normalized.ingredients.length);
        _rememberWarmProductData(cacheKey, normalized);
        _rememberWarmProductData(exactCacheKey, normalized);
        _rememberWarmProductData(normalized.productCacheKey, normalized);
        _rememberWarmProductDataAliases(normalized);
        return normalized;
      }
      return { found: false, reason: "unusable" };
    } catch (err) {
      console.log("[CACHE] Exact selected row lookup error:", request?.didTimeout?.() ? "request timed out" : err.message);
      reportNetworkError(err);
      return { found: false, reason: "lookup_error" };
    } finally {
      request?.cleanup?.();
    }
  })();

  let keyedPromise = null;
  if (!options.signal) {
    _productDataExactInflight.set(inflightKey, lookupPromise);
    keyedPromise = lookupPromise.then((result) => (result?.found === true ? result : null));
    _productDataKeyInflightResults.set(inflightKey, keyedPromise);
  }

  try {
    return _cloneProductDataResult(await lookupPromise);
  } finally {
    if (!options.signal && _productDataExactInflight.get(inflightKey) === lookupPromise) {
      _productDataExactInflight.delete(inflightKey);
    }
    if (!options.signal && _productDataKeyInflightResults.get(inflightKey) === keyedPromise) {
      _productDataKeyInflightResults.delete(inflightKey);
    }
  }
}

/**
 * Pre-warm exact product_data rows for visible search results. This keeps the
 * search RPC lightweight while letting the tap validation path reuse memory
 * instead of waiting on another Supabase round trip.
 */
export async function prefetchProductDataByCacheKeys(cacheKeys) {
  const keys = [...new Set(
    (cacheKeys || [])
      .filter((k) => k && typeof k === "string")
      .map((k) => normalizeCacheKey(k))
      .filter(Boolean)
  )];
  if (keys.length === 0) return;

  const now = Date.now();
  const fresh = keys.filter((key) => {
    const entry = _productDataWarmCache.get(key);
    return (
      !_productDataPrewarmInflightKeys.has(key) &&
      (!entry || now - entry.warmedAt > WARM_TTL_MS || entry.result?.found !== true)
    );
  });
  if (fresh.length === 0) return;
  fresh.forEach((key) => _productDataPrewarmInflightKeys.add(key));

  let request;
  const prewarmPromise = (async () => {
    const warmedResults = new Map();
    try {
      request = _startQueryDeadline("Product data prewarm", {
        timeoutMs: PRODUCT_DATA_QUERY_TIMEOUT_MS,
      });
      const { data: rows, error } = await supabase
        .from("product_data")
        .select("*")
        .in("cache_key", fresh)
        .gt("expires_at", new Date().toISOString())
        .order("ingredient_count", { ascending: false })
        .order("updated_at", { ascending: false })
        .abortSignal(request.signal);

      if (error || !rows) {
        if (error) reportNetworkError(error);
        return warmedResults;
      }
      reportNetworkSuccess();

      let warmed = 0;
      let skipped = 0;
      const seen = new Set();
      for (const row of rows) {
        if (!row?.cache_key || seen.has(row.cache_key)) continue;
        const normalized = _normalizeUsableRow(row);
        if (!normalized) {
          skipped++;
          continue;
        }
        _rememberWarmProductData(row.cache_key, normalized, now);
        _rememberWarmProductData(normalized.productCacheKey, normalized, now);
        _rememberWarmProductDataAliases(normalized, now);
        warmedResults.set(normalizeCacheKey(row.cache_key), normalized);
        warmedResults.set(normalizeCacheKey(normalized.productCacheKey), normalized);
        seen.add(row.cache_key);
        warmed++;
      }
      console.log(`[CACHE] Pre-warmed ${warmed}/${fresh.length} product rows${skipped ? ` (${skipped} skipped)` : ""}`);
      return warmedResults;
    } catch (err) {
      console.log("[CACHE] Product data pre-warm error:", request?.didTimeout?.() ? "request timed out" : err.message);
      reportNetworkError(err);
      return warmedResults;
    } finally {
      fresh.forEach((key) => _productDataPrewarmInflightKeys.delete(key));
      request?.cleanup?.();
    }
  })();

  const keyedPrewarmPromises = new Map();
  fresh.forEach((key) => {
    const keyedPromise = prewarmPromise.then((results) => results.get(key) || null);
    keyedPrewarmPromises.set(key, keyedPromise);
    _productDataPrewarmInflightResults.set(key, keyedPromise);
    _productDataKeyInflightResults.set(key, keyedPromise);
  });

  try {
    await prewarmPromise;
  } finally {
    for (const [key, promise] of keyedPrewarmPromises.entries()) {
      if (_productDataPrewarmInflightResults.get(key) === promise) {
        _productDataPrewarmInflightResults.delete(key);
      }
      if (_productDataKeyInflightResults.get(key) === promise) {
        _productDataKeyInflightResults.delete(key);
      }
    }
  }
}

/**
 * Look up product data with source provenance.
 *
 * Strategy (each step bails early on hit):
 *   1. Try exact cache_key candidates, ranked by key confidence and validated
 *      against the same brand/title/variant agreement used by fuzzy search.
 *   2. ILIKE search constrained by brand (if known) — score candidates and require:
 *        a. at least 60% of significant tokens from the query overlap with the candidate, AND
 *        b. at least 1 variant token (chicken, salmon, etc.) overlaps when the query has one.
 *      The variant guard is what stops "Canidae Salmon" matching "Canidae Multi-Protein".
 *   3. Return the highest-scoring candidate above threshold; otherwise miss.
 *
 * Accepts either the legacy 2-arg form (productName, brand) OR an identification
 * object: { productName, brand, variant, searchTerms[] }.
 */
export async function getProductData(productNameOrId, brand, options = {}) {
  const id = typeof productNameOrId === "object" && productNameOrId
    ? productNameOrId
    : { productName: productNameOrId, brand };

  const productName = id.productName;
  const brandName = id.brand || brand || null;
  const variant = id.variant || null;
  const searchTerms = Array.isArray(id.searchTerms) ? id.searchTerms : [];

  if (!productName) return { found: false, reason: "not_found" };

  // Treat timeoutMs as the total product-data lookup budget. This keeps short
  // callers like the barcode catalog bridge bounded across exact + scored
  // fallback queries instead of applying the timeout once per query step.
  const lookupStartedAt = Date.now();
  const lookupTimeoutMs = options.timeoutMs || PRODUCT_DATA_QUERY_TIMEOUT_MS;
  const remainingLookupBudget = () => _remainingQueryBudget(lookupStartedAt, lookupTimeoutMs);

  // ── Step 1: exact cache_key candidates ──
  const querySig = _significantTokens(`${brandName || ""} ${productName} ${variant || ""}`);
  const queryVariants = new Set(_variantTokens(`${productName} ${variant || ""}`));
  const candidateKeys = new Map();
  const addCandidateKey = (key, priority, kind) => {
    for (const normalized of _normalizeProductDataAliasKeys(key)) {
      const existing = candidateKeys.get(normalized);
      if (!existing || priority < existing.priority) {
        candidateKeys.set(normalized, { key: normalized, priority, kind });
      }
    }
  };

  addCandidateKey(productName, 0, "product");
  if (brandName) addCandidateKey(`${brandName} ${productName}`, 1, "brand_product");
  if (brandName && variant) addCandidateKey(`${brandName} ${variant}`, 2, "brand_variant");
  if (variant) addCandidateKey(`${productName} ${variant}`, 3, "product_variant");
  for (const term of searchTerms) addCandidateKey(term, 4, "search_term");

  const keys = [...candidateKeys.keys()].filter(Boolean);
  if (keys.length > 0) {
    let bestWarm = _bestWarmProductDataCandidate(keys, candidateKeys, brandName, querySig, queryVariants);
    const overlappingPrewarmKeys = keys.filter((key) => _productDataPrewarmInflightResults.has(key));
    if (!bestWarm && overlappingPrewarmKeys.length > 0) {
      await _awaitAnyInflightProductDataPrewarm(
        options,
        Math.min(remainingLookupBudget(), PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS),
        overlappingPrewarmKeys
      );
      bestWarm = _bestWarmProductDataCandidate(keys, candidateKeys, brandName, querySig, queryVariants);
    }
    const overlappingInflightKeys = keys.filter((key) => _productDataKeyInflightResults.has(key));
    if (!bestWarm && overlappingInflightKeys.length > 0) {
      await Promise.allSettled(
        overlappingInflightKeys.map((key) =>
          _awaitInflightProductDataResult(
            key,
            options,
            Math.min(remainingLookupBudget(), PRODUCT_DATA_PREWARM_AWAIT_TIMEOUT_MS)
          )
        )
      );
      bestWarm = _bestWarmProductDataCandidate(keys, candidateKeys, brandName, querySig, queryVariants);
    }
    if (bestWarm) {
      console.log(
        "[CACHE] Product data WARM HIT (exact key):",
        bestWarm.row.cache_key,
        `| kind: ${bestWarm.kind} | score: ${bestWarm.score.toFixed(2)} | ingredients:`,
        bestWarm.normalized.ingredients.length,
      );
      return bestWarm.normalized;
    }

    let request;
    const exactLookupPromise = (async () => {
      const keyedResults = new Map();
      try {
        const exactBudgetMs = remainingLookupBudget();
        if (exactBudgetMs <= 0) {
          console.log("[CACHE] Product data lookup budget exhausted before exact candidates");
          return { result: { found: false, reason: "lookup_error" }, keyedResults };
        }
        request = _startQueryDeadline("Exact product_data candidates", {
          signal: options.signal,
          timeoutMs: exactBudgetMs,
        });
        const { data: rows, error } = await supabase
          .from("product_data")
          .select("*")
          .in("cache_key", keys)
          .gt("expires_at", new Date().toISOString())
          .abortSignal(request.signal);

        if (error) {
          reportNetworkError(error);
        } else {
          reportNetworkSuccess();
        }

        if (!error && rows && rows.length > 0) {
          const scored = rows
            .map((row) => {
              const normalized = _normalizeUsableRow(row);
              if (!normalized) {
                console.log("[CACHE] Exact key rejected:", row.cache_key, "| unusable ingredients after sanitization");
                return null;
              }
              keyedResults.set(normalizeCacheKey(row.cache_key), normalized);
              keyedResults.set(normalizeCacheKey(normalized.productCacheKey), normalized);
              const meta = candidateKeys.get(row.cache_key) || {
                priority: 99,
                kind: "unknown",
              };
              const match = _rowPassesMatch(row, brandName, querySig, queryVariants);
              return { row, normalized, ...meta, ...match };
            })
            .filter(Boolean);

          for (const rejected of scored.filter((entry) => !entry.ok)) {
            console.log(
              "[CACHE] Exact key rejected:",
              rejected.row.cache_key,
              `| ${rejected.reason} | score ${rejected.score.toFixed(2)}`,
            );
          }

          const best = scored
            .filter((entry) => entry.ok)
            .sort((a, b) =>
              a.priority - b.priority ||
              b.score - a.score ||
              (b.normalized.ingredientCount || 0) - (a.normalized.ingredientCount || 0)
            )[0];
          if (best) {
            console.log(
              "[CACHE] Product data HIT (exact key):",
              best.row.cache_key,
              `| kind: ${best.kind} | score: ${best.score.toFixed(2)} | ingredients:`,
              best.normalized.ingredients.length,
            );
            _rememberWarmProductData(best.row.cache_key, best.normalized);
            _rememberWarmProductData(best.normalized.productCacheKey, best.normalized);
            _rememberWarmProductDataAliases(best.normalized);
            return { result: best.normalized, keyedResults };
          }
        }
        return { result: null, keyedResults };
      } catch (err) {
        console.log("[CACHE] Exact key lookup error:", request?.didTimeout?.() ? "request timed out" : err.message);
        reportNetworkError(err);
        return { result: { found: false, reason: "lookup_error" }, keyedResults };
      } finally {
        request?.cleanup?.();
      }
    })();

    const keyInflightPromises = new Map();
    if (!options.signal) {
      for (const key of keys) {
        const keyPromise = exactLookupPromise.then(({ keyedResults }) => keyedResults.get(key) || null);
        keyInflightPromises.set(key, keyPromise);
        _productDataKeyInflightResults.set(key, keyPromise);
      }
    }

    try {
      const { result } = await exactLookupPromise;
      if (result?.found === true) return result;
      if (result?.reason === "lookup_error") return result;
    } finally {
      if (!options.signal) {
        for (const [key, keyPromise] of keyInflightPromises.entries()) {
          if (_productDataKeyInflightResults.get(key) === keyPromise) {
            _productDataKeyInflightResults.delete(key);
          }
        }
      }
    }
  }

  // ── Step 2: brand-constrained ILIKE search with scoring ──
  let request;
  try {
    if (querySig.length < 2) return { found: false, reason: "not_found" };

    const scoredBudgetMs = remainingLookupBudget();
    if (scoredBudgetMs <= 0) {
      console.log("[CACHE] Product data lookup budget exhausted before scored fallback");
      return { found: false, reason: "lookup_error" };
    }

    request = _startQueryDeadline("Scored product_data lookup", {
      signal: options.signal,
      timeoutMs: scoredBudgetMs,
    });
    let q = supabase
      .from("product_data")
      .select("*")
      .gt("expires_at", new Date().toISOString());

    // If we know the brand, mandate that it appears in either brand or product_name.
    if (brandName) {
      const brandPattern = `%${brandName.toLowerCase().split(" ")[0]}%`;
      q = q.or(`brand.ilike.${brandPattern},product_name.ilike.${brandPattern}`);
    }

    // Top-3 most distinctive query tokens must each appear (variant tokens prioritized).
    const distinctive = [...queryVariants, ...querySig.filter((t) => !queryVariants.has(t))].slice(0, 3);
    for (const w of distinctive) {
      q = q.ilike("product_name", `%${w}%`);
    }

    const { data: results, error } = await q
      .order("ingredient_count", { ascending: false })
      .limit(8)
      .abortSignal(request.signal);

    if (error) {
      reportNetworkError(error);
      return { found: false, reason: "lookup_error" };
    }
    reportNetworkSuccess();
    if (!results || results.length === 0) return { found: false, reason: "not_found" };

    const scored = results
      .map((row) => {
        const normalized = _normalizeUsableRow(row);
        if (!normalized) {
          console.log("[CACHE] Scored search rejected:", row.cache_key, "| unusable ingredients after sanitization");
          return null;
        }
        return {
          row,
          normalized,
          ..._scoreProductRow(row, querySig, queryVariants),
        };
      })
      .filter(Boolean);
    if (scored.length === 0) return { found: false, reason: "unusable" };

    scored.sort((a, b) =>
      b.score - a.score ||
      (b.normalized.ingredientCount || 0) - (a.normalized.ingredientCount || 0)
    );
    const best = scored[0];

    // Threshold: must hit at least 60% significant overlap to be trusted.
    if (best.score < 0.6) {
      console.log(
        "[CACHE] No confident match — best:",
        best.row.product_name,
        `(score ${best.score.toFixed(2)}, ${best.sigOverlap}/${querySig.length} tokens)`,
      );
      return { found: false, reason: "not_found" };
    }

    // Variant safeguard: if the query specified a variant, the chosen row must agree.
    if (queryVariants.size > 0 && best.variantOverlap === 0) {
      console.log(
        "[CACHE] Variant mismatch — query wants",
        [...queryVariants].join("/"),
        "but best candidate has none. Aborting.",
      );
      return { found: false, reason: "not_found" };
    }

    console.log(
      "[CACHE] Product data HIT (scored):",
      best.row.product_name,
      `| ingredients: ${best.normalized.ingredientCount} | score: ${best.score.toFixed(2)}`,
    );
    _rememberWarmProductData(best.row.cache_key, best.normalized);
    _rememberWarmProductData(best.normalized.productCacheKey, best.normalized);
    _rememberWarmProductDataAliases(best.normalized);
    return best.normalized;
  } catch (err) {
    console.log("[CACHE] Scored search error:", request?.didTimeout?.() ? "request timed out" : err.message);
    reportNetworkError(err);
    return { found: false, reason: "lookup_error" };
  } finally {
    request?.cleanup?.();
  }

  return { found: false, reason: "not_found" };
}

/**
 * Save product data to the database (growth engine).
 * Every successful ingredient OCR enriches the DB for future users.
 */
export async function saveProductData(productName, brand, ingredients, ingredientText, source = "user_ocr") {
  const cacheKey = normalizeCacheKey(brand ? `${brand} ${productName}` : productName);
  if (!cacheKey || !ingredients?.length) return;

  if (source === "user_ocr") {
    console.log("[CACHE] Skipped direct user OCR catalog write:", cacheKey);
    return;
  }

  try {
    const { error } = await supabase.rpc("save_product_data", {
      p_cache_key: cacheKey,
      p_product_name: productName,
      p_brand: brand || "",
      p_ingredients: ingredients,
      p_ingredient_text: ingredientText,
      p_ingredient_count: ingredients.length,
      p_source: source,
    });
    if (error) {
      reportNetworkError(error);
      console.log("[CACHE] Save product data error:", error.message);
      return;
    }
    reportNetworkSuccess();
    console.log("[CACHE] Saved product data:", cacheKey, "| ingredients:", ingredients.length);
  } catch (err) {
    console.log("[CACHE] Save product data error:", err.message);
    reportNetworkError(err);
  }
}

// In-memory analysis warm cache populated by prefetchAnalyses().
// Saves a Supabase round-trip when the user taps a result they just searched for.
const _warmCache = new Map();
const _analysisPrewarmInflightKeys = new Set();
const _analysisPrewarmInflightResults = new Map();
const _analysisCacheBatchInflight = new Map();
const _analysisCacheSingleInflight = new Map();
const _analysisCacheKeyInflightResults = new Map();

export function clearWarmAnalysisCache() {
  _warmCache.clear();
  _analysisPrewarmInflightKeys.clear();
  _analysisPrewarmInflightResults.clear();
  _analysisCacheBatchInflight.clear();
  _analysisCacheSingleInflight.clear();
  _analysisCacheKeyInflightResults.clear();
  _productDataWarmCache.clear();
  _productDataExactInflight.clear();
  _productDataPrewarmInflightKeys.clear();
  _productDataPrewarmInflightResults.clear();
  _productDataKeyInflightResults.clear();
}

function _incrementCacheHit(cacheKey) {
  if (
    !cacheKey ||
    cacheHitRpcInflight >= CACHE_HIT_RPC_MAX_INFLIGHT ||
    Date.now() < cacheHitRpcRetryAt
  ) {
    return;
  }
  const request = _startQueryDeadline("Cache hit telemetry", {
    timeoutMs: CACHE_HIT_RPC_TIMEOUT_MS,
  });
  cacheHitRpcInflight += 1;
  Promise.resolve(
    supabase
      .rpc("increment_cache_hit", { p_key: cacheKey })
      .abortSignal(request.signal)
  )
    .then(({ error }) => {
      if (error) {
        if (_isCacheHitRpcUnavailable(error)) {
          cacheHitRpcRetryAt = Date.now() + CACHE_HIT_RPC_SCHEMA_RETRY_MS;
        }
        return;
      }
      reportNetworkSuccess();
      cacheHitRpcRetryAt = 0;
    })
    .catch(() => {})
    .finally(() => {
      request.cleanup();
      cacheHitRpcInflight = Math.max(0, cacheHitRpcInflight - 1);
    });
}

function _isCacheHitRpcUnavailable(err) {
  const message = err?.message || String(err || "");
  return err?.code === "PGRST202" ||
    (/increment_cache_hit/i.test(message) &&
      /schema cache|could not find the function|function .*not found|not found in the schema cache/i.test(message));
}

function _cloneJsonish(value) {
  if (!value || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? [...value] : { ...value };
  }
}

function _cacheResultFromRow(row) {
  return {
    hit: true,
    analysis: _cloneJsonish(row.analysis),
    dataSource: row.data_source || "ai",
    opffData: row.opff_data ? _cloneJsonish(row.opff_data) : null,
  };
}

function _rememberWarmAnalysis(cacheKey, result, warmedAt = Date.now()) {
  if (!cacheKey || result?.hit !== true) return;
  _warmCache.set(cacheKey, {
    warmedAt,
    result: _cloneAnalysisCacheResult(result),
  });
}

function _normalizeAnalysisInflightKeys(cacheKeys) {
  return [...new Set(
    (cacheKeys || [])
      .filter((key) => key && typeof key === "string")
      .map((key) => key.trim())
      .filter(Boolean)
  )].sort();
}

function _analysisBatchInflightKey(cacheKeys, timeoutMs = ANALYSIS_CACHE_QUERY_TIMEOUT_MS) {
  return `${timeoutMs}\u001f${_normalizeAnalysisInflightKeys(cacheKeys).join("\u001f")}`;
}

function _analysisSingleInflightKey(cacheKey, timeoutMs = ANALYSIS_CACHE_QUERY_TIMEOUT_MS) {
  const key = typeof cacheKey === "string" ? cacheKey.trim() : "";
  return `${timeoutMs}\u001f${key}`;
}

function _normalizeAnalysisCacheKey(cacheKey) {
  return typeof cacheKey === "string" ? cacheKey.trim() : "";
}

function _cloneAnalysisCacheResult(result) {
  if (!result || result.hit !== true) return result;
  return {
    ...result,
    analysis: _cloneJsonish(result.analysis),
    opffData: result.opffData ? _cloneJsonish(result.opffData) : null,
  };
}

async function _awaitInflightAnalysisCacheResult(cacheKey, options = {}, timeoutMs = ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS) {
  const key = _normalizeAnalysisCacheKey(cacheKey);
  const inflight = key ? _analysisCacheKeyInflightResults.get(key) : null;
  if (!inflight || timeoutMs <= 0) return null;
  if (options.signal?.aborted) return null;

  let timeoutId = null;
  let abortHandler = null;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });
  const abortPromise = options.signal
    ? new Promise((resolve) => {
        abortHandler = () => resolve(null);
        options.signal.addEventListener("abort", abortHandler, { once: true });
      })
    : null;

  try {
    const result = await Promise.race([
      inflight,
      timeoutPromise,
      ...(abortPromise ? [abortPromise] : []),
    ]);
    return result?.hit === true ? _cloneAnalysisCacheResult(result) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    if (abortHandler) options.signal?.removeEventListener("abort", abortHandler);
  }
}

async function _awaitInflightPrewarm(cacheKey, options = {}, timeoutMs = ANALYSIS_CACHE_QUERY_TIMEOUT_MS) {
  const inflight = _analysisPrewarmInflightResults.get(cacheKey);
  if (!inflight || timeoutMs <= 0) return null;
  if (options.signal?.aborted) return null;

  let timeoutId = null;
  let abortHandler = null;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });
  const abortPromise = options.signal
    ? new Promise((resolve) => {
        abortHandler = () => resolve(null);
        options.signal.addEventListener("abort", abortHandler, { once: true });
      })
    : null;

  try {
    const result = await Promise.race([
      inflight,
      timeoutPromise,
      ...(abortPromise ? [abortPromise] : []),
    ]);
    return result?.hit === true ? _cloneAnalysisCacheResult(result) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    if (abortHandler) options.signal?.removeEventListener("abort", abortHandler);
  }
}

/**
 * Pre-warm the analysis cache for a set of cache keys (e.g. visible search results).
 * Fires a single Supabase IN() query and stores results in memory so the next
 * getCachedAnalysis() call for any of these keys returns instantly.
 */
export async function prefetchAnalyses(cacheKeys) {
  const keys = [...new Set(
    (cacheKeys || [])
      .filter((k) => k && typeof k === "string")
      .map((k) => k.trim())
      .filter(Boolean)
  )];
  if (keys.length === 0) return;
  // Skip keys we already have warm or already warming — minimizes redundant
  // work on re-renders while search results are still visible.
  const now = Date.now();
  const fresh = keys.filter((k) => {
    const entry = _warmCache.get(k);
    return !_analysisPrewarmInflightKeys.has(k) && (!entry || now - entry.warmedAt > WARM_TTL_MS);
  });
  if (fresh.length === 0) return;
  fresh.forEach((key) => _analysisPrewarmInflightKeys.add(key));

  let request;
  const prewarmPromise = (async () => {
    const warmedResults = new Map();
    try {
      request = _startQueryDeadline("Analysis cache prewarm", {
        timeoutMs: ANALYSIS_CACHE_QUERY_TIMEOUT_MS,
      });
      const { data, error } = await supabase
        .from("analysis_cache")
        .select("cache_key, analysis, data_source, opff_data")
        .in("cache_key", fresh)
        .gt("expires_at", new Date().toISOString())
        .abortSignal(request.signal);

      if (error || !data) {
        if (error) reportNetworkError(error);
        return warmedResults;
      }
      reportNetworkSuccess();

      // Cache positive, schema-valid hits only. Negative prewarm entries can hide
      // fresh shared cache rows created by another device/user moments later.
      let skipped = 0;
      for (const row of data) {
        if (!_isUsableCachedAnalysis(row.analysis)) {
          skipped++;
          continue;
        }
        const result = _cacheResultFromRow(row);
        _rememberWarmAnalysis(row.cache_key, result, now);
        warmedResults.set(row.cache_key, result);
      }
      console.log(`[CACHE] Pre-warmed ${data.length - skipped}/${fresh.length} analyses${skipped ? ` (${skipped} skipped)` : ""}`);
      return warmedResults;
    } catch (err) {
      console.log("[CACHE] Pre-warm error:", request?.didTimeout?.() ? "request timed out" : err.message);
      reportNetworkError(err);
      return warmedResults;
    } finally {
      fresh.forEach((key) => _analysisPrewarmInflightKeys.delete(key));
      request?.cleanup?.();
    }
  })();

  const keyedPrewarmPromises = new Map();
  fresh.forEach((key) => {
    const keyedPromise = prewarmPromise.then((results) => results.get(key) || null);
    keyedPrewarmPromises.set(key, keyedPromise);
    _analysisPrewarmInflightResults.set(key, keyedPromise);
  });

  try {
    await prewarmPromise;
  } finally {
    fresh.forEach((key) => {
      if (_analysisPrewarmInflightResults.get(key) === keyedPrewarmPromises.get(key)) {
        _analysisPrewarmInflightResults.delete(key);
      }
    });
  }
}

/**
 * Batched analysis-cache lookup for ordered fallback keys.
 * Returns a Map keyed by cache_key. The caller keeps priority by reading keys
 * from the returned map in its preferred order.
 */
export async function getCachedAnalyses(cacheKeys, options = {}) {
  const keys = [...new Set(
    (cacheKeys || [])
      .filter((k) => k && typeof k === "string")
      .map((k) => k.trim())
      .filter(Boolean)
  )];
  if (keys.length === 0) return new Map();

  const now = Date.now();
  const hits = new Map();
  let dbKeys = [];

  for (const key of keys) {
    const entry = _warmCache.get(key);
    if (entry?.result?.hit === true && now - entry.warmedAt < WARM_TTL_MS) {
      console.log("[CACHE] WARM HIT for key:", key, "(batch)");
      _incrementCacheHit(key);
      hits.set(key, _cloneAnalysisCacheResult(entry.result));
    } else {
      if (entry) _warmCache.delete(key);
      dbKeys.push(key);
    }
  }

  if (dbKeys.length === 0) return hits;

  const batchTimeoutMs = options.timeoutMs || ANALYSIS_CACHE_QUERY_TIMEOUT_MS;
  const lookupStartedAt = Date.now();
  const prewarmKeys = dbKeys.filter((key) => _analysisPrewarmInflightResults.has(key));
  if (prewarmKeys.length > 0) {
    const prewarmResults = await Promise.all(
      prewarmKeys.map(async (key) => [
        key,
        await _awaitInflightPrewarm(
          key,
          options,
          Math.min(
            _remainingQueryBudget(lookupStartedAt, batchTimeoutMs),
            ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS,
          )
        ),
      ])
    );
    for (const [key, result] of prewarmResults) {
      if (result?.hit === true) {
        console.log("[CACHE] PREWARM IN-FLIGHT HIT for key:", key, "(batch)");
        _incrementCacheHit(key);
        hits.set(key, _cloneAnalysisCacheResult(result));
      }
    }
    dbKeys = dbKeys.filter((key) => !hits.has(key));
    if (dbKeys.length === 0 || _remainingQueryBudget(lookupStartedAt, batchTimeoutMs) <= 0) {
      return hits;
    }
  }

  const overlappingInflightKeys = dbKeys.filter((key) => _analysisCacheKeyInflightResults.has(key));
  if (overlappingInflightKeys.length > 0) {
    const inflightResults = await Promise.all(
      overlappingInflightKeys.map(async (key) => [
        key,
        await _awaitInflightAnalysisCacheResult(
          key,
          options,
          Math.min(
            _remainingQueryBudget(lookupStartedAt, batchTimeoutMs),
            ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS,
          )
        ),
      ])
    );
    for (const [key, result] of inflightResults) {
      if (result?.hit === true) {
        console.log("[CACHE] ANALYSIS IN-FLIGHT KEY HIT for key:", key, "(batch)");
        _incrementCacheHit(key);
        hits.set(key, _cloneAnalysisCacheResult(result));
      }
    }
    dbKeys = dbKeys.filter((key) => !hits.has(key));
    if (dbKeys.length === 0 || _remainingQueryBudget(lookupStartedAt, batchTimeoutMs) <= 0) {
      return hits;
    }
  }

  const inflightKey = _analysisBatchInflightKey(dbKeys, batchTimeoutMs);
  if (!options.signal && _analysisCacheBatchInflight.has(inflightKey)) {
    console.log("[CACHE] Analysis cache IN-FLIGHT HIT (batch):", dbKeys.length);
    const inflightHits = await _analysisCacheBatchInflight.get(inflightKey);
    for (const [key, result] of inflightHits.entries()) {
      hits.set(key, _cloneAnalysisCacheResult(result));
    }
    return hits;
  }

  const lookupPromise = (async () => {
    const dbHits = new Map();
    let request;
    try {
      request = _startQueryDeadline("Analysis cache batch lookup", {
        signal: options.signal,
        timeoutMs: _remainingQueryBudget(lookupStartedAt, batchTimeoutMs),
      });
      const { data, error } = await supabase
        .from("analysis_cache")
        .select("cache_key, analysis, data_source, opff_data")
        .in("cache_key", dbKeys)
        .gt("expires_at", new Date().toISOString())
        .abortSignal(request.signal);

      if (error || !data) {
        if (error) {
          console.log("[CACHE] Batch MISS:", error.message);
          reportNetworkError(error);
        } else {
          reportNetworkSuccess();
        }
        return dbHits;
      }
      reportNetworkSuccess();

      let valid = 0;
      for (const row of data) {
        if (!_isUsableCachedAnalysis(row.analysis)) {
          console.log("[CACHE] STALE or malformed analysis for key:", row.cache_key, "— forcing re-score");
          continue;
        }
        const result = _cacheResultFromRow(row);
        dbHits.set(row.cache_key, result);
        _rememberWarmAnalysis(row.cache_key, result);
        valid++;
        _incrementCacheHit(row.cache_key);
      }
      console.log(`[CACHE] Batch HIT ${valid}/${dbKeys.length}`);
      return dbHits;
    } catch (err) {
      console.log("[CACHE] Batch lookup error:", request?.didTimeout?.() ? "request timed out" : err.message);
      reportNetworkError(err);
      return dbHits;
    } finally {
      request?.cleanup?.();
    }
  })();

  const keyInflightPromises = new Map();
  if (!options.signal) {
    _analysisCacheBatchInflight.set(inflightKey, lookupPromise);
    for (const key of dbKeys) {
      const keyPromise = lookupPromise.then((results) => results.get(key) || null);
      keyInflightPromises.set(key, keyPromise);
      _analysisCacheKeyInflightResults.set(key, keyPromise);
    }
  }

  try {
    const dbHits = await lookupPromise;
    for (const [key, result] of dbHits.entries()) {
      hits.set(key, _cloneAnalysisCacheResult(result));
    }
    return hits;
  } finally {
    if (!options.signal && _analysisCacheBatchInflight.get(inflightKey) === lookupPromise) {
      _analysisCacheBatchInflight.delete(inflightKey);
    }
    if (!options.signal) {
      for (const [key, keyPromise] of keyInflightPromises.entries()) {
        if (_analysisCacheKeyInflightResults.get(key) === keyPromise) {
          _analysisCacheKeyInflightResults.delete(key);
        }
      }
    }
  }
}

/**
 * Look up a cached analysis by cache key.
 * Returns { hit: true, analysis, dataSource, opffData } on hit,
 * or { hit: false } on miss or any error.
 */
export async function getCachedAnalysis(cacheKey, options = {}) {
  const lookupTimeoutMs = options.timeoutMs || ANALYSIS_CACHE_QUERY_TIMEOUT_MS;
  const lookupStartedAt = Date.now();
  // Warm cache short-circuit (filled by prefetchAnalyses on search-results render)
  if (cacheKey && _warmCache.has(cacheKey)) {
    const entry = _warmCache.get(cacheKey);
    if (entry.result?.hit === true && Date.now() - entry.warmedAt < WARM_TTL_MS) {
      console.log("[CACHE] WARM HIT for key:", cacheKey, "(hit)");
      _incrementCacheHit(cacheKey);
      return _cloneAnalysisCacheResult(entry.result);
    }
    _warmCache.delete(cacheKey);
  }
  const prewarmResult = await _awaitInflightPrewarm(
    cacheKey,
    options,
    Math.min(
      _remainingQueryBudget(lookupStartedAt, lookupTimeoutMs),
      ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS,
    )
  );
  if (prewarmResult?.hit === true) {
    console.log("[CACHE] PREWARM IN-FLIGHT HIT for key:", cacheKey);
    _incrementCacheHit(cacheKey);
    return prewarmResult;
  }
  const inflightResult = await _awaitInflightAnalysisCacheResult(
    cacheKey,
    options,
    Math.min(
      _remainingQueryBudget(lookupStartedAt, lookupTimeoutMs),
      ANALYSIS_PREWARM_AWAIT_TIMEOUT_MS,
    )
  );
  if (inflightResult?.hit === true) {
    console.log("[CACHE] ANALYSIS IN-FLIGHT KEY HIT for key:", cacheKey);
    _incrementCacheHit(cacheKey);
    return inflightResult;
  }
  if (_remainingQueryBudget(lookupStartedAt, lookupTimeoutMs) <= 0) return { hit: false };
  return _getCachedAnalysisFromDb(cacheKey, {
    ...options,
    timeoutMs: _remainingQueryBudget(lookupStartedAt, lookupTimeoutMs),
  });
}

async function _getCachedAnalysisFromDb(cacheKey, options = {}) {
  if (!cacheKey || typeof cacheKey !== "string") return { hit: false };

  const normalizedCacheKey = _normalizeAnalysisCacheKey(cacheKey);
  if (!normalizedCacheKey) return { hit: false };
  const lookupTimeoutMs = options.timeoutMs || ANALYSIS_CACHE_QUERY_TIMEOUT_MS;
  const inflightKey = _analysisSingleInflightKey(normalizedCacheKey, lookupTimeoutMs);
  if (!options.signal && _analysisCacheSingleInflight.has(inflightKey)) {
    console.log("[CACHE] Analysis cache IN-FLIGHT HIT for key:", normalizedCacheKey);
    return _cloneAnalysisCacheResult(await _analysisCacheSingleInflight.get(inflightKey));
  }

  const lookupPromise = (async () => {
    let request;
    try {
      request = _startQueryDeadline("Analysis cache lookup", {
        signal: options.signal,
        timeoutMs: lookupTimeoutMs,
      });
      const { data, error } = await supabase
        .from("analysis_cache")
        .select("analysis, data_source, opff_data")
        .eq("cache_key", normalizedCacheKey)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single()
        .abortSignal(request.signal);

      if (error || !data) {
        if (error && error.code !== "PGRST116") {
          console.log("[CACHE] MISS for key:", normalizedCacheKey, error.message);
          reportNetworkError(error);
        } else {
          console.log("[CACHE] MISS for key:", normalizedCacheKey);
          reportNetworkSuccess();
        }
        return { hit: false };
      }
      reportNetworkSuccess();

      if (!_isUsableCachedAnalysis(data.analysis)) {
        console.log("[CACHE] STALE or malformed analysis for key:", normalizedCacheKey, "— forcing re-score");
        return { hit: false };
      }

      console.log("[CACHE] HIT for key:", normalizedCacheKey);

      // Increment hit count (fire-and-forget)
      _incrementCacheHit(normalizedCacheKey);

      const result = _cacheResultFromRow({ cache_key: normalizedCacheKey, ...data });
      _rememberWarmAnalysis(normalizedCacheKey, result);
      return result;
    } catch (err) {
      console.log("[CACHE] Error during lookup:", request?.didTimeout?.() ? "request timed out" : err.message);
      reportNetworkError(err);
      return { hit: false };
    } finally {
      request?.cleanup?.();
    }
  })();

  if (!options.signal) {
    _analysisCacheSingleInflight.set(inflightKey, lookupPromise);
    _analysisCacheKeyInflightResults.set(normalizedCacheKey, lookupPromise);
  }

  try {
    return _cloneAnalysisCacheResult(await lookupPromise);
  } finally {
    if (!options.signal && _analysisCacheSingleInflight.get(inflightKey) === lookupPromise) {
      _analysisCacheSingleInflight.delete(inflightKey);
    }
    if (!options.signal && _analysisCacheKeyInflightResults.get(normalizedCacheKey) === lookupPromise) {
      _analysisCacheKeyInflightResults.delete(normalizedCacheKey);
    }
  }
}
