import AsyncStorage from "@react-native-async-storage/async-storage";
import { analyzeIngredients, analyzeWithData, analyzeHumanFood } from "./claude";
import { lookupBarcode, searchByName } from "./opff";
import { getCachedAnalysis, normalizeCacheKey } from "./cache";
import { addHistoryEntry } from "./history";

const LOCAL_RESULT_PREFIX = "@woof_result_";
const LOCAL_RESULT_KEYS = "@woof_result_keys";
const MAX_LOCAL_RESULTS = 30;

/**
 * Background analysis service — singleton.
 *
 * Manages running analyses so they survive component unmounts.
 * Components subscribe/unsubscribe to receive partial updates,
 * but the analysis itself keeps going even with zero subscribers.
 */

const ANALYSIS_TIMEOUT_MS = 120000;

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

function _notify(event) {
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch (err) {
      console.log("[ANALYSIS] Subscriber error:", err.message);
    }
  }
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
      _notify({ type: "error", cacheKey, error: state.error });
      _scheduleCleanup(cacheKey);
      console.log("[ANALYSIS] Hard timeout reached for:", cacheKey);
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
 * Start (or attach to) a background analysis.
 * Returns the cacheKey used to track it.
 *
 * If an analysis for this key is already running, returns the existing key
 * so the caller can subscribe without duplicating API calls.
 */
export function startAnalysis({ mode, base64, barcode, uri, petType }) {
  if (mode === "barcode" && !barcode) {
    console.log("[ANALYSIS] startAnalysis called with barcode mode but no barcode");
    return null;
  }
  if (mode === "photo" && !base64) {
    console.log("[ANALYSIS] startAnalysis called with photo mode but no base64");
    return null;
  }
  if (mode === "human_food" && (!base64 || !petType)) {
    console.log("[ANALYSIS] startAnalysis called with human_food mode but missing base64 or petType");
    return null;
  }

  let cacheKey = barcode || null;
  const tempId = cacheKey || `_temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Already running/complete for this key? Reuse it.
  if (cacheKey) {
    const { entry } = _getEntry(cacheKey);
    if (entry && (entry.status === "running" || entry.status === "complete")) {
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
  };

  analyses.set(tempId, state);

  if (mode === "barcode") {
    _withTimeout(
      _runBarcode({ cacheKey: tempId, barcode, signal, state }),
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

async function _runBarcode({ cacheKey, barcode, signal, state }) {
  try {
    // 1. Check cache
    const cached = await getCachedAnalysis(barcode);
    if (signal.aborted) return;

    if (cached.hit) {
      state.result = cached.analysis;
      state.dataSource = cached.dataSource || "verified";
      state.opffData = cached.opffData || null;
      state.status = "complete";
      _notify({ type: "complete", cacheKey, ...state, fromCache: true });
      _scheduleCleanup(cacheKey);
      return;
    }

    // 2. OPFF lookup
    const lookup = await lookupBarcode(barcode);
    if (signal.aborted) return;

    if (!lookup.found) {
      state.status = "not_found";
      _notify({ type: "barcode_not_found", cacheKey });
      _scheduleCleanup(cacheKey);
      console.log("[ANALYSIS] Barcode not found in OPFF:", barcode);
      return;
    }

    state.opffData = lookup.product;

    // 3. Stream analysis
    const onUpdate = (partial) => {
      state.result = partial;
      _notify({ type: "update", cacheKey, result: partial, opffData: state.opffData });
    };

    const analysis = await analyzeWithData(lookup.product, undefined, { onUpdate, signal, cacheKey: barcode });
    if (signal.aborted) return;

    if (analysis.error) {
      state.error = analysis.error;
      state.status = "error";
      _notify({ type: "error", cacheKey, error: analysis.error });
      _scheduleCleanup(cacheKey);
      return;
    }

    state.result = analysis;
    state.dataSource = "verified";
    state.status = "complete";

    // Cache write happens server-side in the Edge Function
    _saveLocalResult(barcode, analysis, "verified", lookup.product);
    _saveHistory(state, barcode);
    _notify({ type: "complete", cacheKey, ...state, fromCache: false });
    _scheduleCleanup(cacheKey);
    console.log("[ANALYSIS] Barcode analysis complete:", analysis.productName);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    state.error = err.message || "Something went wrong.";
    state.status = "error";
    _notify({ type: "error", cacheKey, error: state.error });
    _scheduleCleanup(cacheKey);
    console.log("[ANALYSIS] Barcode analysis error:", err.message);
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
    const analysis = await analyzeHumanFood(base64, petType, { onUpdate, signal });
    if (signal.aborted) return;

    if (analysis.error) {
      state.error = analysis.error;
      state.status = "error";
      _notify({ type: "error", cacheKey: tempId, error: analysis.error });
      _scheduleCleanup(tempId);
      return;
    }

    state.result = analysis;
    state.dataSource = "ai";
    state.status = "complete";

    // Save locally for history playback
    _saveLocalResult(tempId, { result: analysis, dataSource: "ai", opffData: null });

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

// ── Photo flow ────────────────────────────────────────────────

async function _runPhoto({ tempId, base64, uri, signal, state }) {
  let realCacheKey = null;
  let opffPromise = null;
  let cachePromise = null;
  let opffTriggered = false;
  let cacheTriggered = false;
  let cacheShortCircuited = false;

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
            console.log("[ANALYSIS] Replacing errored entry for:", normalizedName);
          } else if (existing.status === "complete") {
            // Existing analysis is complete — use it immediately
            cacheShortCircuited = true;
            state.controller.abort();
            keyAliases.set(tempId, normalizedName);
            analyses.delete(tempId);
            state.result = existing.result;
            state.dataSource = existing.dataSource;
            state.opffData = existing.opffData;
            state.status = "complete";
            _notify({ type: "complete", cacheKey: normalizedName, ...state, fromCache: true });
            console.log("[ANALYSIS] Reusing completed analysis for:", normalizedName);
            return;
          } else {
            // Existing is still running — DON'T abort current stream, let both complete
            // The first to finish wins, the second will become a no-op
            console.log("[ANALYSIS] Concurrent analysis detected for:", normalizedName, "— letting both complete");
            // Still rekey so both point to the same final key
            _rekey(tempId, normalizedName, state);
            // Don't return — continue with cache check
          }
        } else {
          // Register under real key
          _rekey(tempId, normalizedName, state);
        }

        // Check Supabase cache (only abort if cache is fresh and complete)
        cachePromise = getCachedAnalysis(normalizedName);
        cachePromise.then((cached) => {
          if (cached.hit && !signal.aborted) {
            // Only abort if we haven't progressed too far (< 10 ingredients parsed)
            const ingredientCount = partial.ingredients?.length || 0;
            if (ingredientCount < 10) {
              cacheShortCircuited = true;
              state.result = cached.analysis;
              state.dataSource = cached.dataSource || "ai";
              state.opffData = cached.opffData || null;
              state.status = "complete";
              state.controller.abort();
              console.log("[ANALYSIS] Cache hit early — aborting stream for:", normalizedName);
              _notify({ type: "complete", cacheKey: normalizedName, ...state, fromCache: true });
              _scheduleCleanup(normalizedName);
            } else {
              console.log("[ANALYSIS] Cache hit but stream too advanced — letting stream complete");
            }
          }
        }).catch(() => {});
      }
    }

    const notifyKey = realCacheKey || tempId;
    _notify({ type: "update", cacheKey: notifyKey, result: partial, opffData: state.opffData });
  };

  try {
    let analysis;
    try {
      analysis = await analyzeIngredients(base64, { onUpdate, signal });
    } catch (err) {
      if (err.name === "AbortError" || signal.aborted) {
        if (cacheShortCircuited) return;
        return;
      }
      throw err;
    }

    if (signal.aborted) return;

    if (analysis.error) {
      const notifyKey = realCacheKey || tempId;
      state.error = analysis.error;
      state.status = "error";
      _notify({ type: "error", cacheKey: notifyKey, error: analysis.error });
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
            state.result = existing.result;
            state.dataSource = existing.dataSource;
            state.opffData = existing.opffData;
            state.status = "complete";
            keyAliases.set(tempId, fullNormalized);
            if (oldKey !== tempId) keyAliases.set(oldKey, fullNormalized);
            analyses.delete(oldKey);
            analyses.delete(tempId);
            console.log("[ANALYSIS] Using existing completed analysis for:", fullNormalized);
            _notify({ type: "complete", cacheKey: fullNormalized, ...state, fromCache: true });
            return;
          } else if (existing.status === "running") {
            // Another is still running — mark this one as duplicate and bail
            console.log("[ANALYSIS] Concurrent completion detected, discarding duplicate for:", fullNormalized);
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
        state.result = cached.analysis;
        state.dataSource = cached.dataSource || "ai";
        state.opffData = cached.opffData || null;
        state.status = "complete";
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
    console.log("[ANALYSIS] Photo analysis complete:", analysis.productName);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) return;
    const notifyKey = realCacheKey || tempId;
    state.error = err.message || "Something went wrong.";
    state.status = "error";
    _notify({ type: "error", cacheKey: notifyKey, error: state.error });
    _scheduleCleanup(notifyKey);
    console.log("[ANALYSIS] Photo analysis error:", err.message);
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
    console.log("[ANALYSIS] Saved local result for:", cacheKey);
  } catch (e) {
    console.log("[ANALYSIS] Failed to save local result:", e.message);
  }
}

/**
 * Retrieve a locally cached result. Returns { analysis, dataSource, opffData } or null.
 */
export async function getLocalResult(cacheKey) {
  try {
    const json = await AsyncStorage.getItem(`${LOCAL_RESULT_PREFIX}${cacheKey}`);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ── History helper ────────────────────────────────────────────

function _saveHistory(state, cacheKey) {
  const name = state.result?.productName || state.result?.foodName;
  if (!name) {
    console.log("[ANALYSIS] Skipping history save — no product/food name");
    return;
  }
  if (!cacheKey) {
    console.log("[ANALYSIS] Skipping history save — no cacheKey for:", state.result.productName);
    return;
  }

  // Prevent duplicate saves within 60 seconds (handles concurrent analyses for same product)
  const lastSave = recentHistorySaves.get(cacheKey);
  if (lastSave && Date.now() - lastSave < 60000) {
    console.log("[ANALYSIS] Skipping duplicate history save for:", cacheKey);
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
      ...(isHumanFood && { safetyLevel: state.result.safetyLevel }),
    });
  } catch (err) {
    console.log("[ANALYSIS] Error saving history:", err.message);
  }
}
