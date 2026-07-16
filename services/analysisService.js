import AsyncStorage from "@react-native-async-storage/async-storage";
import { analyzeIngredients, analyzeHumanFood } from "./claude";
import { lookupBarcode, searchByName } from "./opff";
import {
  catalogProductToVerifiedProduct,
  findVerifiedCatalogProductByBarcode,
  findVerifiedCatalogProductForLookup,
} from "./productCatalog";
import {
  buildVerifiedPetFoodAnalysis,
  hasVerifiedIngredientData,
  hasVerifiedProductImageData,
} from "./verifiedScoring";
import { getCachedAnalysis, normalizeCacheKey } from "./cache";
import { addHistoryEntry } from "./history";
import { consumeScan } from "./entitlements";
import { createLogger } from "./logger";

const LOCAL_RESULT_PREFIX = "@woof_result_";
const LOCAL_RESULT_KEYS = "@woof_result_keys";
const MAX_LOCAL_RESULTS = 30;
const logger = createLogger("ANALYSIS");

/**
 * Background analysis service — singleton.
 *
 * Manages running analyses so they survive component unmounts.
 * Components subscribe/unsubscribe to receive partial updates. Analyses keep
 * going across unmounts unless a user action explicitly cancels them.
 */

// Keep the client watchdog longer than the Edge Function's Claude timeout so
// server-side scan reversal can come back before the app gives up locally.
const ANALYSIS_TIMEOUT_MS = 60000;

// Map<cacheKey, { status, result, error, dataSource, opffData, uri, mode, controller }>
const analyses = new Map();

// Set<(event) => void>
const subscribers = new Set();

// Temp-ID → real cacheKey mapping (for photo mode before productName arrives)
const keyAliases = new Map();

// Prevent duplicate history saves within a short window
const recentHistorySaves = new Map(); // cacheKey → timestamp

// Track scheduled cleanups to avoid duplicates
const scheduledCleanups = new Set();

function _errorCode(err, fallback = null) {
  return err?.code || fallback;
}

function _errorStatus(err) {
  return Number.isFinite(err?.status) ? err.status : null;
}

function _notify(event) {
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch (err) {
      logger.debug("[ANALYSIS] Subscriber error:", err.message);
    }
  }
}

function _createScanId(mode) {
  return `${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function _consumeScanForState(state, scanMode) {
  const usage = await consumeScan({
    scanId: state.scanId,
    scanMode,
  });
  state.scanUsage = usage;
  return usage;
}

function _syncScanUsageFromAnalysis(state, analysis) {
  if (analysis?.__scanUsage) {
    state.scanUsage = analysis.__scanUsage;
  }
}

function _userFacingAnalysisError(message, mode) {
  const text = String(message || "").trim();
  if (mode === "ingredient_capture" && (
    /incomplete pet-food analysis/i.test(text) ||
    /analysis stream ended/i.test(text) ||
    /connection ended before completion/i.test(text) ||
    /failed to parse/i.test(text) ||
    /invalid response format/i.test(text) ||
    /no response from claude/i.test(text)
  )) {
    return "Could not find a readable ingredients list. Retake the photo with the full ingredients panel flat, close, and in focus.";
  }
  if (mode === "human_food" && (
    /incomplete human-food safety/i.test(text) ||
    /analysis stream ended/i.test(text) ||
    /connection ended before completion/i.test(text) ||
    /failed to parse/i.test(text) ||
    /invalid response format/i.test(text) ||
    /no response from claude/i.test(text)
  )) {
    return "Could not identify the food clearly. Retake the photo with the food or package label close, well lit, and in focus.";
  }
  return text || "Something went wrong.";
}

function _hasVerifiedResultProvenance(product = {}) {
  return hasVerifiedIngredientData(product) && hasVerifiedProductImageData(product);
}

function _completeWithResult(state, cacheKey, result, dataSource, opffData) {
  state.result = result;
  state.dataSource = dataSource;
  state.opffData = opffData || null;
  state.status = "complete";

  if (cacheKey && result) {
    _saveLocalResult(cacheKey, result, state.dataSource, state.opffData);
    _saveHistory(state, cacheKey);
  }
}

function _completeWithCachedResult(state, cacheKey, cached, fallbackDataSource) {
  _completeWithResult(
    state,
    cacheKey,
    cached.analysis,
    cached.dataSource || fallbackDataSource,
    cached.opffData || null
  );
}

function _getEntry(key) {
  if (analyses.has(key)) return { entry: analyses.get(key), resolvedKey: key };
  const aliased = keyAliases.get(key);
  if (aliased && analyses.has(aliased)) return { entry: analyses.get(aliased), resolvedKey: aliased };
  return { entry: null, resolvedKey: key };
}

/**
 * Schedule cleanup of a completed analysis entry after 5 minutes.
 * Deduplicates: only one cleanup per key.
 */
function _scheduleCleanup(key) {
  if (scheduledCleanups.has(key)) return;
  scheduledCleanups.add(key);

  setTimeout(() => {
    scheduledCleanups.delete(key);
    const entry = analyses.get(key);
    if (entry && entry.status !== "running") {
      analyses.delete(key);
    }
    // Clean up any aliases pointing to this key
    for (const [alias, target] of keyAliases) {
      if (target === key) keyAliases.delete(alias);
    }
    // Clean up stale history save records
    recentHistorySaves.delete(key);
  }, 5 * 60 * 1000);
}

/**
 * Register state under a new realCacheKey, cleaning up the old key/tempId.
 */
function _rekey(oldKey, newKey, state) {
  if (oldKey === newKey) return;
  if (analyses.has(oldKey) && analyses.get(oldKey) === state) {
    analyses.delete(oldKey);
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
  } catch (err) {
    if (err.message === "ANALYSIS_TIMEOUT" && state.status === "running") {
      state.controller?.abort();
      state.error = "Analysis is taking too long. Please try again.";
      state.status = "error";
      _notify({
        type: "error",
        cacheKey,
        scanId: state.scanId,
        error: state.error,
        errorCode: "ANALYSIS_TIMEOUT",
        errorStatus: null,
      });
      _scheduleCleanup(cacheKey);
      logger.debug("[ANALYSIS] Hard timeout reached for:", cacheKey);
    }
    // Other errors are already handled inside _runBarcode/_runPhoto
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
  return entry || null;
}

/**
 * Resolve a temp ID or cacheKey to its canonical key.
 */
export function resolveKey(key) {
  return keyAliases.get(key) || key;
}

/**
 * Abort a running analysis when the user intentionally leaves the loading flow.
 * The Edge Function reverses any counted free scan when the stream is cancelled
 * before a valid result is delivered.
 */
export function cancelAnalysis(key, reason = "user_cancelled") {
  if (!key) return false;
  const { entry, resolvedKey } = _getEntry(key);
  if (!entry || entry.status !== "running") return false;

  entry.status = "cancelled";
  entry.error = "Analysis cancelled.";
  entry.cancelReason = reason;
  entry.controller?.abort();
  _notify({ type: "cancelled", cacheKey: resolvedKey, scanId: entry.scanId, reason });
  _scheduleCleanup(resolvedKey);
  logger.debug("[ANALYSIS] Cancelled analysis:", resolvedKey, reason);
  return true;
}

/**
 * Start (or attach to) a background analysis.
 * Returns the cacheKey used to track it.
 *
 * If an analysis for this key is already running, returns the existing key
 * so the caller can subscribe without duplicating API calls.
 * Completed entries are not reused for new scan attempts because that would bypass scan accounting.
 */
export function startAnalysis({ mode, base64, barcode, uri, petType, catalogProduct }) {
  if (mode === "barcode" && !barcode) {
    logger.debug("[ANALYSIS] startAnalysis called with barcode mode but no barcode");
    return null;
  }
  if (mode === "photo" && !base64) {
    logger.debug("[ANALYSIS] startAnalysis called with photo mode but no base64");
    return null;
  }
  if (mode === "ingredient_capture" && !base64) {
    logger.debug("[ANALYSIS] startAnalysis called with ingredient_capture mode but no base64");
    return null;
  }
  if (mode === "catalog" && !catalogProduct) {
    logger.debug("[ANALYSIS] startAnalysis called with catalog mode but no product");
    return null;
  }
  if (mode === "human_food" && (!base64 || !petType)) {
    logger.debug("[ANALYSIS] startAnalysis called with human_food mode but missing base64 or petType");
    return null;
  }

  let cacheKey = barcode || catalogProduct?.cacheKey || null;
  const tempId = cacheKey || `_temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Already running for this key? Reuse it.
  if (cacheKey) {
    const { entry } = _getEntry(cacheKey);
    if (entry && entry.status === "running") {
      logger.debug("[ANALYSIS] Reusing existing analysis for key:", cacheKey);
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
    // Catalog results should keep the verified front-pack image in history,
    // not a temporary camera-cache file that can disappear after a restart.
    uri: mode === "catalog"
      ? catalogProduct?.imageUrl || uri || null
      : uri || catalogProduct?.imageUrl || null,
    mode,
    scanId: _createScanId(mode),
    scanUsage: null,
    controller,
  };

  analyses.set(tempId, state);

  if (mode === "barcode") {
    _withTimeout(
      _runBarcode({ cacheKey: tempId, barcode, signal, state }),
      state, tempId
    );
  } else if (mode === "catalog") {
    _withTimeout(
      _runCatalog({ cacheKey: tempId, catalogProduct, signal, state }),
      state, tempId
    );
  } else if (mode === "human_food") {
    _withTimeout(
      _runHumanFood({ tempId, base64, petType, uri, signal, state }),
      state, tempId
    );
  } else {
    _withTimeout(
      _runPhoto({ tempId, base64, uri, signal, state }),
      state, tempId
    );
  }

  return tempId;
}

// ── Barcode flow ──────────────────────────────────────────────

async function _completeBarcodeWithVerifiedCatalog({
  cacheKey,
  barcode,
  catalogMatch,
  lookupProduct = null,
  signal,
  state,
}) {
  const verifiedProduct = catalogProductToVerifiedProduct({
    ...catalogMatch,
    barcode: catalogMatch.barcode || barcode,
  });

  if (!hasVerifiedIngredientData(verifiedProduct) || !hasVerifiedProductImageData(verifiedProduct)) return false;

  await _consumeScanForState(state, "barcode");
  if (signal.aborted) return true;

  const analysis = buildVerifiedPetFoodAnalysis(verifiedProduct);
  if (analysis.error) {
    state.error = analysis.error;
    state.status = "error";
    _notify({
      type: "error",
      cacheKey,
      scanId: state.scanId,
      error: analysis.error,
      errorCode: "ANALYSIS_RESULT_ERROR",
      errorStatus: null,
      scanUsage: state.scanUsage,
    });
    _scheduleCleanup(cacheKey);
    return true;
  }

  state.result = analysis;
  state.dataSource = "verified";
  state.status = "complete";
  state.uri = catalogMatch.imageUrl || lookupProduct?.imageUrl || state.uri;
  state.opffData = {
    ...verifiedProduct,
    imageUrl: verifiedProduct.imageUrl || lookupProduct?.imageUrl || null,
    sourceUrl: verifiedProduct.sourceUrl || lookupProduct?.sourceUrl || null,
  };

  _saveLocalResult(barcode, analysis, "verified", state.opffData);
  _saveHistory(state, barcode);
  _notify({ type: "complete", cacheKey, ...state, fromCache: false, catalogMatched: true });
  _scheduleCleanup(cacheKey);
  logger.debug("[ANALYSIS] Barcode matched verified catalog:", analysis.productName);
  return true;
}

async function _runBarcode({ cacheKey, barcode, signal, state }) {
  try {
    // 1. Check cache
    const cached = await getCachedAnalysis(barcode);
    if (signal.aborted) return;

    if (cached.hit && _hasVerifiedResultProvenance(cached.opffData || {})) {
      await _consumeScanForState(state, "barcode");
      if (signal.aborted) return;

      _completeWithCachedResult(state, cacheKey, cached, "verified");
      _notify({ type: "complete", cacheKey, ...state, fromCache: true });
      _scheduleCleanup(cacheKey);
      return;
    } else if (cached.hit) {
      logger.debug("[ANALYSIS] Ignoring barcode cache without verified ingredient/image provenance:", barcode);
    }

    // 2. Check the verified Woof catalog by GTIN before external lookup.
    const directCatalogMatch = await findVerifiedCatalogProductByBarcode(barcode, { signal });
    if (signal.aborted) return;
    if (directCatalogMatch) {
      const completed = await _completeBarcodeWithVerifiedCatalog({
        cacheKey,
        barcode,
        catalogMatch: directCatalogMatch,
        signal,
        state,
      });
      if (completed) return;
    }

    // 3. OPFF lookup for identity hints when the local barcode is not verified yet.
    const lookup = await lookupBarcode(barcode);
    if (signal.aborted) return;

    if (!lookup.found) {
      state.status = "not_found";
      _notify({ type: "barcode_not_found", cacheKey, scanId: state.scanId });
      _scheduleCleanup(cacheKey);
      logger.debug("[ANALYSIS] Barcode not found in OPFF or verified catalog:", barcode);
      return;
    }

    state.opffData = lookup.product;

    if (
      lookup.product?.sourceKind === "catalog" &&
      hasVerifiedIngredientData(lookup.product) &&
      hasVerifiedProductImageData(lookup.product)
    ) {
      const completed = await _completeBarcodeWithVerifiedCatalog({
        cacheKey,
        barcode,
        catalogMatch: lookup.product,
        signal,
        state,
      });
      if (completed) return;
    }

    // Prefer the local verified catalog when a barcode lookup identifies a
    // product we already have exact ingredients for. OPFF is useful for
    // identity/image hints, but community data is not enough to score.
    const catalogMatch = await findVerifiedCatalogProductForLookup(lookup.product, { signal });
    if (signal.aborted) return;

    if (catalogMatch) {
      const completed = await _completeBarcodeWithVerifiedCatalog({
        cacheKey,
        barcode,
        catalogMatch,
        lookupProduct: lookup.product,
        signal,
        state,
      });
      if (completed) return;
    }

    state.status = "verification_required";
    _notify({
      type: "barcode_not_found",
      cacheKey,
      scanId: state.scanId,
      reason: "verification_required",
      productName: lookup.product?.productName || "",
      brand: lookup.product?.brand || "",
      barcode,
    });
    _scheduleCleanup(cacheKey);
    logger.debug("[ANALYSIS] Barcode product needs verified catalog ingredients:", lookup.product?.productName || barcode);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    const errorScanUsage = err.scanUsage || null;
    if (errorScanUsage) state.scanUsage = errorScanUsage;
    state.error = err.message || "Something went wrong.";
    state.status = "error";
    _notify({
      type: "error",
      cacheKey,
      scanId: state.scanId,
      error: state.error,
      errorCode: _errorCode(err),
      errorStatus: _errorStatus(err),
      scanUsage: errorScanUsage,
    });
    _scheduleCleanup(cacheKey);
    logger.debug("[ANALYSIS] Barcode analysis error:", err.message);
  }
}

// ── Catalog product flow ──────────────────────────────────────

async function _runCatalog({ cacheKey, catalogProduct, signal, state }) {
  try {
    const verifiedProduct = catalogProductToVerifiedProduct(catalogProduct);
    const productName = verifiedProduct.productName || catalogProduct?.productName || "";
    const normalizedKey = cacheKey || catalogProduct?.cacheKey || normalizeCacheKey(productName);

    state.opffData = verifiedProduct;

    if (!hasVerifiedIngredientData(verifiedProduct) || !hasVerifiedProductImageData(verifiedProduct)) {
      state.error = "Verified ingredients and product image are required before Woof can score this product.";
      state.status = "error";
      _notify({
        type: "error",
        cacheKey: normalizedKey,
        scanId: state.scanId,
        error: state.error,
        errorCode: "CATALOG_VERIFICATION_REQUIRED",
        errorStatus: null,
        scanUsage: state.scanUsage,
      });
      _scheduleCleanup(normalizedKey);
      return;
    }

    await _consumeScanForState(state, "catalog");
    if (signal.aborted) return;

    const analysis = buildVerifiedPetFoodAnalysis(verifiedProduct);

    if (analysis.error) {
      state.error = _userFacingAnalysisError(analysis.error, state.mode);
      state.status = "error";
      _notify({
        type: "error",
        cacheKey: normalizedKey,
        scanId: state.scanId,
        error: analysis.error,
        errorCode: "ANALYSIS_RESULT_ERROR",
        errorStatus: null,
        scanUsage: state.scanUsage,
      });
      _scheduleCleanup(normalizedKey);
      return;
    }

    state.result = analysis;
    state.dataSource = "verified";
    state.status = "complete";

    _saveLocalResult(normalizedKey, analysis, "verified", verifiedProduct);
    _saveHistory(state, normalizedKey);
    _notify({ type: "complete", cacheKey: normalizedKey, ...state, fromCache: false });
    _scheduleCleanup(normalizedKey);
    logger.debug("[ANALYSIS] Catalog analysis complete:", analysis.productName);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    const errorScanUsage = err.scanUsage || state.scanUsage || null;
    if (errorScanUsage) state.scanUsage = errorScanUsage;
    state.error = err.message || "Something went wrong.";
    state.status = "error";
    _notify({
      type: "error",
      cacheKey,
      scanId: state.scanId,
      error: state.error,
      errorCode: _errorCode(err),
      errorStatus: _errorStatus(err),
      scanUsage: errorScanUsage,
    });
    _scheduleCleanup(cacheKey);
    logger.debug("[ANALYSIS] Catalog analysis error:", err.message);
  }
}

// ── Human food flow ──────────────────────────────────────────

async function _runHumanFood({ tempId, base64, petType, uri, signal, state }) {
  const onUpdate = (partial) => {
    if (signal.aborted) return;
    state.result = partial;
    _notify({ type: "update", cacheKey: tempId, result: partial });
  };

  try {
    const analysis = await analyzeHumanFood(base64, petType, { onUpdate, signal, scanId: state.scanId });
    if (signal.aborted) return;
    _syncScanUsageFromAnalysis(state, analysis);

    if (analysis.error) {
      state.error = analysis.error;
      state.status = "error";
      _notify({
        type: "error",
        cacheKey: tempId,
        scanId: state.scanId,
        error: analysis.error,
        errorCode: "ANALYSIS_RESULT_ERROR",
        errorStatus: null,
        scanUsage: state.scanUsage,
      });
      _scheduleCleanup(tempId);
      return;
    }

    state.result = analysis;
    state.dataSource = "ai";
    state.status = "complete";

    // Save locally for history playback
    _saveLocalResult(tempId, analysis, "ai", null);

    _saveHistory(state, tempId);
    _notify({ type: "complete", cacheKey: tempId, ...state, result: analysis, dataSource: "ai", opffData: null, fromCache: false });
    _scheduleCleanup(tempId);
    logger.debug("[ANALYSIS] Human food check complete:", analysis.foodName, "| safety:", analysis.safetyLevel);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    const errorScanUsage = err.scanUsage || null;
    if (errorScanUsage) state.scanUsage = errorScanUsage;
    state.error = _userFacingAnalysisError(err.message, state.mode);
    state.status = "error";
    _notify({
      type: "error",
      cacheKey: tempId,
      scanId: state.scanId,
      error: state.error,
      errorCode: _errorCode(err),
      errorStatus: _errorStatus(err),
      scanUsage: errorScanUsage,
    });
    _scheduleCleanup(tempId);
    logger.debug("[ANALYSIS] Human food check error:", err.message);
  }
}

// ── Photo flow ────────────────────────────────────────────────

async function _runPhoto({ tempId, base64, uri, signal, state }) {
  let realCacheKey = null;
  let opffPromise = null;
  let cachePromise = null;
  let opffTriggered = false;
  let cacheTriggered = false;

  const onUpdate = (partial) => {
    if (signal.aborted) return;
    state.result = partial;

    // 1. Start OPFF search early with partial name (for enrichment)
    if (!opffTriggered && partial.productName && partial.productName.length > 3) {
      opffTriggered = true;
      opffPromise = searchByName(partial.productName);
    }

    // 2. Cache check: only when productName is COMPLETE
    //    petType appearing means Claude has moved past the productName field
    if (!cacheTriggered && partial.productName && partial.petType) {
      cacheTriggered = true;
      const normalizedName = normalizeCacheKey(partial.productName);

      if (normalizedName) {
        realCacheKey = normalizedName;

        // Dedup: another analysis already owns this key?
        const existing = analyses.get(normalizedName);
        if (existing && existing !== state) {
          // If old analysis errored, discard it and let this one take over
          if (existing.status === "error") {
            analyses.delete(normalizedName);
            logger.debug("[ANALYSIS] Replacing errored entry for:", normalizedName);
          } else if (existing.status === "complete") {
            // Replace completed entries for a new scan attempt so the Edge
            // entitlement path still confirms scan usage before completion.
            logger.debug("[ANALYSIS] Replacing completed entry for new scan:", normalizedName);
            _rekey(tempId, normalizedName, state);
          } else {
            // Existing is still running — DON'T abort current stream, let both complete
            // The first to finish wins, the second will become a no-op
            logger.debug("[ANALYSIS] Concurrent analysis detected for:", normalizedName, "— letting both complete");
            // Still rekey so both point to the same final key
            _rekey(tempId, normalizedName, state);
            // Don't return — continue with cache check
          }
        } else {
          // Register under real key
          _rekey(tempId, normalizedName, state);
        }

        // Photo cache hits wait for Edge scan usage before completing. Aborting
        // the stream here would trigger server-side scan reversal and make a
        // successful cached result bypass the free-scan gate.
        cachePromise = getCachedAnalysis(normalizedName);
      }
    }

    const notifyKey = realCacheKey || tempId;
    _notify({ type: "update", cacheKey: notifyKey, result: partial, opffData: state.opffData });
  };

  try {
    let analysis;
    try {
      analysis = await analyzeIngredients(base64, { onUpdate, signal, scanId: state.scanId });
    } catch (err) {
      if (err.name === "AbortError" || signal.aborted) {
        return;
      }
      if (err.scanUsage) state.scanUsage = err.scanUsage;
      throw err;
    }

    if (signal.aborted) return;
    _syncScanUsageFromAnalysis(state, analysis);

    if (analysis.error) {
      const notifyKey = realCacheKey || tempId;
      state.error = analysis.error;
      state.status = "error";
      _notify({
        type: "error",
        cacheKey: notifyKey,
        scanId: state.scanId,
        error: analysis.error,
        errorCode: "ANALYSIS_RESULT_ERROR",
        errorStatus: null,
        scanUsage: state.scanUsage,
      });
      _scheduleCleanup(notifyKey);
      return;
    }

    // Always correct realCacheKey with the FULL product name from final result.
    // Streaming may have set it from a partial name, or it may not have been set
    // at all (if stream failed before petType arrived and fell back to non-streaming).
    if (analysis.productName) {
      const fullNormalized = normalizeCacheKey(analysis.productName);
      if (fullNormalized && fullNormalized !== realCacheKey) {
        const oldKey = realCacheKey || tempId;
        // Dedup: check if another analysis completed under the full key
        const existing = analyses.get(fullNormalized);
        if (existing && existing !== state) {
          if (existing.status === "complete") {
            // Another analysis already completed — use it
            _completeWithResult(
              state,
              fullNormalized,
              existing.result,
              existing.dataSource || "ai",
              existing.opffData
            );
            keyAliases.set(tempId, fullNormalized);
            if (oldKey !== tempId) keyAliases.set(oldKey, fullNormalized);
            analyses.delete(oldKey);
            analyses.delete(tempId);
            logger.debug("[ANALYSIS] Using existing completed analysis for:", fullNormalized);
            _notify({ type: "complete", cacheKey: fullNormalized, ...state, fromCache: true });
            return;
          } else if (existing.status === "running") {
            // Another is still running — mark this one as duplicate and bail
            logger.debug("[ANALYSIS] Concurrent completion detected, discarding duplicate for:", fullNormalized);
            keyAliases.set(tempId, fullNormalized);
            if (oldKey !== tempId) keyAliases.set(oldKey, fullNormalized);
            analyses.delete(oldKey);
            analyses.delete(tempId);
            return;
          }
        }
        _rekey(oldKey, fullNormalized, state);
        if (tempId !== oldKey) keyAliases.set(tempId, fullNormalized);
        realCacheKey = fullNormalized;
      }
    }

    // If cache wasn't checked during streaming (stream failed before petType),
    // check now with the full product name.
    if (!cacheTriggered && realCacheKey) {
      cacheTriggered = true;
      cachePromise = getCachedAnalysis(realCacheKey);
    }

    // Await cache result
    if (cachePromise) {
      const cached = await cachePromise;
      if (signal.aborted) return;
      if (cached.hit) {
        const notifyKey = realCacheKey || tempId;
        _completeWithCachedResult(state, notifyKey, cached, "ai");
        _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: true });
        _scheduleCleanup(notifyKey);
        return;
      }
    }

    state.result = analysis;

    // Resolve OPFF data
    let finalDataSource = "ai";
    let finalOpffData = null;

    if (opffPromise) {
      const search = await opffPromise;
      if (signal.aborted) return;
      if (search.found) {
        state.opffData = search.product;
        finalDataSource = "enriched";
        finalOpffData = search.product;
      } else if (analysis.productName) {
        // Partial-name search found nothing — retry with full name
        const retrySearch = await searchByName(analysis.productName);
        if (signal.aborted) return;
        if (retrySearch.found) {
          state.opffData = retrySearch.product;
          finalDataSource = "enriched";
          finalOpffData = retrySearch.product;
        }
      }
    } else if (analysis.productName) {
      const search = await searchByName(analysis.productName);
      if (signal.aborted) return;
      if (search.found) {
        state.opffData = search.product;
        finalDataSource = "enriched";
        finalOpffData = search.product;
      }
    }

    state.dataSource = finalDataSource;
    const notifyKey = realCacheKey || tempId;

    // Cache write happens server-side in the Edge Function
    if (realCacheKey) {
      _saveLocalResult(realCacheKey, analysis, finalDataSource, finalOpffData);
    }

    state.status = "complete";
    _saveHistory(state, realCacheKey);
    _notify({ type: "complete", cacheKey: notifyKey, ...state, fromCache: false });
    _scheduleCleanup(notifyKey);
    logger.debug("[ANALYSIS] Photo analysis complete:", analysis.productName);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    const notifyKey = realCacheKey || tempId;
    const errorScanUsage = err.scanUsage || null;
    if (errorScanUsage) state.scanUsage = errorScanUsage;
    state.error = _userFacingAnalysisError(err.message, state.mode);
    state.status = "error";
    _notify({
      type: "error",
      cacheKey: notifyKey,
      scanId: state.scanId,
      error: state.error,
      errorCode: _errorCode(err),
      errorStatus: _errorStatus(err),
      scanUsage: errorScanUsage,
    });
    _scheduleCleanup(notifyKey);
    logger.debug("[ANALYSIS] Photo analysis error:", err.message);
  }
}

// ── Local result cache (AsyncStorage) ─────────────────────────

async function _saveLocalResult(cacheKey, analysis, dataSource, opffData) {
  try {
    await AsyncStorage.setItem(
      `${LOCAL_RESULT_PREFIX}${cacheKey}`,
      JSON.stringify({ analysis, dataSource, opffData, savedAt: Date.now() })
    );

    const keysJson = await AsyncStorage.getItem(LOCAL_RESULT_KEYS) || "[]";
    const keys = JSON.parse(keysJson);
    // Deduplicate then prepend
    const filtered = keys.filter((k) => k !== cacheKey);
    filtered.unshift(cacheKey);
    const trimmed = filtered.slice(0, MAX_LOCAL_RESULTS);
    await AsyncStorage.setItem(LOCAL_RESULT_KEYS, JSON.stringify(trimmed));

    // Delete evicted entries
    if (filtered.length > MAX_LOCAL_RESULTS) {
      const toDelete = filtered.slice(MAX_LOCAL_RESULTS);
      await Promise.all(
        toDelete.map((k) => AsyncStorage.removeItem(`${LOCAL_RESULT_PREFIX}${k}`))
      );
    }
    logger.debug("[ANALYSIS] Saved local result for:", cacheKey);
  } catch (e) {
    logger.debug("[ANALYSIS] Failed to save local result:", e.message);
  }
}

/**
 * Retrieve a locally cached result. Returns { analysis, dataSource, opffData } or null.
 */
export async function getLocalResult(cacheKey) {
  try {
    const json = await AsyncStorage.getItem(`${LOCAL_RESULT_PREFIX}${cacheKey}`);
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (parsed?.dataSource === "verified" && !_hasVerifiedResultProvenance(parsed.opffData || {})) {
      logger.debug("[ANALYSIS] Ignoring local verified result without ingredient/image provenance:", cacheKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearLocalResults() {
  try {
    const keysJson = await AsyncStorage.getItem(LOCAL_RESULT_KEYS) || "[]";
    const keys = JSON.parse(keysJson);
    const resultKeys = Array.isArray(keys)
      ? keys.map((key) => `${LOCAL_RESULT_PREFIX}${key}`)
      : [];

    await AsyncStorage.multiRemove([LOCAL_RESULT_KEYS, ...resultKeys]);
  } catch (err) {
    logger.debug("[ANALYSIS] Failed to clear local results:", err.message);
  }
}

// ── History helper ────────────────────────────────────────────

function _saveHistory(state, cacheKey) {
  const name = state.result?.productName || state.result?.foodName;
  if (!name) {
    logger.debug("[ANALYSIS] Skipping history save — no product/food name");
    return;
  }
  if (!cacheKey) {
    logger.debug("[ANALYSIS] Skipping history save — no cacheKey for:", state.result.productName);
    return;
  }

  // Prevent duplicate saves within 60 seconds (handles concurrent analyses for same product)
  const lastSave = recentHistorySaves.get(cacheKey);
  if (lastSave && Date.now() - lastSave < 60000) {
    logger.debug("[ANALYSIS] Skipping duplicate history save for:", cacheKey);
    return;
  }
  recentHistorySaves.set(cacheKey, Date.now());

  const isHumanFood = state.mode === "human_food";
  try {
    addHistoryEntry({
      productName: name,
      overallScore: isHumanFood ? null : state.result.overallScore,
      petType: state.result.petType,
      dateScanned: new Date().toISOString(),
      cacheKey,
      scanMode: state.mode,
      dataSource: state.dataSource,
      photoUri: state.uri || null,
      productImageUrl: state.dataSource === "verified"
        ? state.opffData?.imageUrl || state.result?.imageUrl || null
        : null,
      ...(isHumanFood && {
        safetyLevel: state.result.safetyLevel,
        resultSnapshot: state.result,
      }),
    });
  } catch (err) {
    logger.debug("[ANALYSIS] Error saving history:", err.message);
  }
}
