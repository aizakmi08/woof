import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { reportNetworkError, reportNetworkSuccess } from "./network";

const STORAGE_KEY_PREFIX = "@woof/scan_history_";
const LEGACY_STORAGE_KEY = "@woof/scan_history"; // For migration
const MIGRATION_PREFIX = "@woof/history_migrated_";
const MAX_ENTRIES = 80;
const OPTIONAL_REMOTE_HISTORY_COLUMNS = ["product_image_url", "safety_level", "analysis_payload"];
const RICH_REMOTE_HISTORY_COLUMNS = ["analysis_payload"];
const HISTORY_SCHEMA_RETRY_MS = 60_000;
const HISTORY_REMOTE_READ_TIMEOUT_MS = 5_000;
const HISTORY_IMAGE_ENRICH_TIMEOUT_MS = 2_500;
const HISTORY_REMOTE_UPSERT_TIMEOUT_MS = 5_000;
const HISTORY_REMOTE_UPSERT_MAX_INFLIGHT = 2;
const HISTORY_USER_ID_CACHE_TTL_MS = 5_000;
const HISTORY_SCHEMA_MAX_RETRY_MS = 15 * 60_000;
let optionalHistoryColumnsRetryAt = 0;
let optionalHistorySchemaRetryMs = HISTORY_SCHEMA_RETRY_MS;
let optionalHistoryColumnsNoticeAt = 0;
let disabledOptionalHistoryColumns = new Set();
let historyRemoteUpsertInflight = 0;
const completedHistoryMigrationUsers = new Set();
let currentUserIdCache = { value: null, ts: 0 };

// --- Helpers ---

function abortError(label = "Operation aborted") {
  const err = new Error(label);
  err.name = "AbortError";
  return err;
}

async function getCurrentUserId({ signal = null } = {}) {
  if (!signal && currentUserIdCache.value && Date.now() - currentUserIdCache.ts < HISTORY_USER_ID_CACHE_TTL_MS) {
    return currentUserIdCache.value;
  }
  let timeoutId;
  let abortCleanup = null;
  try {
    // Add timeout to prevent hanging on slow auth checks
    const timeoutMs = 3000;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("AUTH_SESSION_TIMEOUT")), timeoutMs);
    });

    const race = [
      supabase.auth.getSession(),
      timeout,
    ];
    if (signal) {
      if (signal.aborted) throw signal.reason || abortError("AUTH_SESSION_ABORTED");
      const abortPromise = new Promise((_, reject) => {
        const onAbort = () => reject(signal.reason || abortError("AUTH_SESSION_ABORTED"));
        signal.addEventListener("abort", onAbort, { once: true });
        abortCleanup = () => signal.removeEventListener?.("abort", onAbort);
      });
      race.push(abortPromise);
    }

    const { data: { session } } = await Promise.race(race);
    const userId = session?.user?.id ?? null;
    if (userId) {
      currentUserIdCache = { value: userId, ts: Date.now() };
    } else {
      currentUserIdCache = { value: null, ts: 0 };
    }
    return userId;
  } catch (err) {
    if (err?.name === "AbortError") {
      return null;
    }
    if (err.message !== "AUTH_SESSION_TIMEOUT") {
      console.log("[HISTORY] getCurrentUserId error:", err.message);
    }
    reportNetworkError(err);
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    abortCleanup?.();
  }
}

function getStorageKey(userId) {
  // User-specific key for authenticated users, legacy key for anonymous
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : LEGACY_STORAGE_KEY;
}

function productDataCacheKeyForHistory(cacheKey) {
  const key = typeof cacheKey === "string" ? cacheKey.trim() : "";
  return key.replace(/__(dog|cat)$/i, "");
}

async function getLocalHistory(userId = null) {
  try {
    const key = getStorageKey(userId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.log("[HISTORY] Error reading local history:", err.message);
    return [];
  }
}

async function saveLocalHistory(entries, userId = null) {
  const key = getStorageKey(userId);
  await AsyncStorage.setItem(key, JSON.stringify(entries));
}

function toSupabaseRow(entry, userId) {
  return {
    id: entry.id,
    user_id: userId,
    product_name: entry.productName,
    overall_score: entry.overallScore,
    pet_type: entry.petType ?? null,
    date_scanned: entry.dateScanned,
    cache_key: entry.cacheKey ?? null,
    scan_mode: entry.scanMode ?? null,
    data_source: entry.dataSource ?? null,
    photo_uri: null,
    product_image_url: entry.productImageUrl ?? null,
    safety_level: entry.safetyLevel ?? entry.analysisPayload?.safetyLevel ?? null,
    analysis_payload: entry.scanMode === "human_food" ? entry.analysisPayload ?? null : null,
  };
}

function fromSupabaseRow(row) {
  const analysisPayload = row.analysis_payload && typeof row.analysis_payload === "object"
    ? row.analysis_payload
    : null;
  return {
    id: row.id,
    productName: row.product_name,
    overallScore: row.overall_score,
    petType: row.pet_type,
    dateScanned: row.date_scanned,
    cacheKey: row.cache_key,
    scanMode: row.scan_mode,
    dataSource: row.data_source,
    photoUri: null,
    productImageUrl: row.product_image_url,
    safetyLevel: row.safety_level ?? analysisPayload?.safetyLevel ?? null,
    analysisPayload,
  };
}

function historyErrorText(err) {
  return [
    err?.message,
    err?.details,
    err?.hint,
    err?.code,
  ].filter(Boolean).join(" ").toLowerCase() || String(err || "").toLowerCase();
}

function isMissingOptionalHistoryColumnError(err) {
  const message = historyErrorText(err);
  return (err?.code === "PGRST204" || /schema cache|could not find|column/.test(message)) &&
    OPTIONAL_REMOTE_HISTORY_COLUMNS.some((column) => message.includes(column.toLowerCase()));
}

function missingOptionalHistoryColumnsFromError(err) {
  const message = historyErrorText(err);
  return OPTIONAL_REMOTE_HISTORY_COLUMNS.filter((column) => message.includes(column.toLowerCase()));
}

function historyRowHasRichOptionalValue(row, columns = RICH_REMOTE_HISTORY_COLUMNS) {
  return columns.some((column) => row?.[column] != null);
}

function stripOptionalHistoryColumns(row, columns = OPTIONAL_REMOTE_HISTORY_COLUMNS) {
  const next = { ...row };
  for (const column of columns) {
    delete next[column];
  }
  return next;
}

function stripOptionalHistoryRows(rows, columns = OPTIONAL_REMOTE_HISTORY_COLUMNS) {
  return Array.isArray(rows)
    ? rows.map((row) => stripOptionalHistoryColumns(row, columns))
    : stripOptionalHistoryColumns(rows, columns);
}

function canStripOptionalHistoryColumns(rows, columns = OPTIONAL_REMOTE_HISTORY_COLUMNS) {
  const list = Array.isArray(rows) ? rows : [rows];
  const richColumns = columns.filter((column) => RICH_REMOTE_HISTORY_COLUMNS.includes(column));
  return list.every((row) => !historyRowHasRichOptionalValue(row, richColumns));
}

function splitOptionalHistoryRows(rows, columns = OPTIONAL_REMOTE_HISTORY_COLUMNS) {
  const list = Array.isArray(rows) ? rows : [rows];
  const stripSafeRows = [];
  const richRows = [];
  for (const row of list) {
    if (canStripOptionalHistoryColumns(row, columns)) {
      stripSafeRows.push(row);
    } else {
      richRows.push(row);
    }
  }
  return { stripSafeRows, richRows };
}

function deferredOptionalHistorySchemaResult(columns, richRowsDeferred = 0) {
  const error = new Error(`Optional history columns unavailable until schema cache refresh: ${columns.join(", ")}`);
  error.code = "PGRST204";
  return {
    data: null,
    error,
    usedReducedColumns: true,
    usedLegacyColumns: true,
    deferredUntilSchemaRefresh: true,
    richRowsDeferred,
  };
}

function noteOptionalHistorySchemaUnavailable(err) {
  const missingColumns = missingOptionalHistoryColumnsFromError(err);
  if (missingColumns.length > 0) {
    disabledOptionalHistoryColumns = new Set([...disabledOptionalHistoryColumns, ...missingColumns]);
  }
  optionalHistoryColumnsRetryAt = Date.now() + optionalHistorySchemaRetryMs;
  optionalHistorySchemaRetryMs = Math.min(optionalHistorySchemaRetryMs * 2, HISTORY_SCHEMA_MAX_RETRY_MS);
  if (Date.now() - optionalHistoryColumnsNoticeAt > HISTORY_SCHEMA_RETRY_MS) {
    optionalHistoryColumnsNoticeAt = Date.now();
    console.log("[HISTORY] Optional history columns unavailable; using reduced history sync until schema cache refresh:", err.message);
  }
}

function noteOptionalHistorySchemaSuccess() {
  optionalHistoryColumnsRetryAt = 0;
  optionalHistorySchemaRetryMs = HISTORY_SCHEMA_RETRY_MS;
  disabledOptionalHistoryColumns = new Set();
}

function startHistoryRemoteDeadline(label, timeoutMs = HISTORY_REMOTE_UPSERT_TIMEOUT_MS, parentSignal = null) {
  if (typeof AbortController === "undefined") {
    return { signal: null, cleanup: () => {} };
  }
  const controller = new AbortController();
  let parentAbortHandler = null;
  const timeout = setTimeout(() => {
    const err = new Error(`${label} timed out`);
    err.name = "AbortError";
    controller.abort(err);
  }, timeoutMs);
  if (parentSignal) {
    parentAbortHandler = () => {
      controller.abort(parentSignal.reason || abortError(`${label} aborted`));
    };
    if (parentSignal.aborted) {
      parentAbortHandler();
    } else {
      parentSignal.addEventListener("abort", parentAbortHandler, { once: true });
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      if (parentAbortHandler) parentSignal?.removeEventListener?.("abort", parentAbortHandler);
    },
  };
}

function applyAbortSignal(query, signal) {
  return signal && typeof query.abortSignal === "function"
    ? query.abortSignal(signal)
    : query;
}

async function upsertScanHistoryRows(rows, options, signal = null) {
  const disabledColumns = [...disabledOptionalHistoryColumns];
  const retryingReducedSchema = Date.now() < optionalHistoryColumnsRetryAt;

  if (retryingReducedSchema && disabledColumns.length > 0) {
    const { stripSafeRows, richRows } = splitOptionalHistoryRows(rows, disabledColumns);
    if (richRows.length > 0) {
      if (stripSafeRows.length === 0) {
        return deferredOptionalHistorySchemaResult(disabledColumns, richRows.length);
      }
      const partialRetryResult = await applyAbortSignal(supabase
        .from("scan_history")
        .upsert(stripOptionalHistoryRows(stripSafeRows, disabledColumns), options), signal);
      if (partialRetryResult.error) {
        return {
          ...partialRetryResult,
          usedReducedColumns: true,
          usedLegacyColumns: true,
          partialHistorySync: true,
          richRowsDeferred: richRows.length,
        };
      }
      return {
        ...deferredOptionalHistorySchemaResult(disabledColumns, richRows.length),
        data: partialRetryResult.data ?? null,
        partialHistorySync: true,
        reducedRowsSynced: stripSafeRows.length,
      };
    }
  }

  const useReducedRows = retryingReducedSchema && disabledColumns.length > 0;
  const payload = useReducedRows ? stripOptionalHistoryRows(rows, disabledColumns) : rows;
  const result = await applyAbortSignal(supabase
    .from("scan_history")
    .upsert(payload, options), signal);

  if (!result.error) {
    if (!useReducedRows) noteOptionalHistorySchemaSuccess();
    return { ...result, usedReducedColumns: useReducedRows, usedLegacyColumns: useReducedRows };
  }

  if (!isMissingOptionalHistoryColumnError(result.error)) {
    return { ...result, usedReducedColumns: useReducedRows, usedLegacyColumns: useReducedRows };
  }

  noteOptionalHistorySchemaUnavailable(result.error);
  const missingColumns = missingOptionalHistoryColumnsFromError(result.error);
  const columnsToStrip = missingColumns.length > 0 ? missingColumns : OPTIONAL_REMOTE_HISTORY_COLUMNS;
  if (!canStripOptionalHistoryColumns(rows, columnsToStrip)) {
    const { stripSafeRows, richRows } = splitOptionalHistoryRows(rows, columnsToStrip);
    if (stripSafeRows.length === 0) {
      return result;
    }
    const partialRetryResult = await applyAbortSignal(supabase
      .from("scan_history")
      .upsert(stripOptionalHistoryRows(stripSafeRows, columnsToStrip), options), signal);
    if (partialRetryResult.error) {
      return {
        ...partialRetryResult,
        usedReducedColumns: true,
        usedLegacyColumns: true,
        partialHistorySync: true,
        richRowsDeferred: richRows.length,
      };
    }
    return {
      ...result,
      data: partialRetryResult.data ?? result.data,
      usedReducedColumns: true,
      usedLegacyColumns: true,
      partialHistorySync: true,
      reducedRowsSynced: stripSafeRows.length,
      richRowsDeferred: richRows.length,
    };
  }

  const retryResult = await applyAbortSignal(supabase
    .from("scan_history")
    .upsert(stripOptionalHistoryRows(rows, columnsToStrip), options), signal);

  if (retryResult.error && isMissingOptionalHistoryColumnError(retryResult.error)) {
    noteOptionalHistorySchemaUnavailable(retryResult.error);
    const additionalMissingColumns = missingOptionalHistoryColumnsFromError(retryResult.error);
    const combinedColumnsToStrip = [
      ...new Set([
        ...columnsToStrip,
        ...(additionalMissingColumns.length > 0 ? additionalMissingColumns : OPTIONAL_REMOTE_HISTORY_COLUMNS),
      ]),
    ];
    if (
      combinedColumnsToStrip.length > columnsToStrip.length &&
      canStripOptionalHistoryColumns(rows, combinedColumnsToStrip)
    ) {
      const fullRetryResult = await applyAbortSignal(supabase
        .from("scan_history")
        .upsert(stripOptionalHistoryRows(rows, combinedColumnsToStrip), options), signal);
      return { ...fullRetryResult, usedReducedColumns: true, usedLegacyColumns: true };
    }
  }
  return { ...retryResult, usedReducedColumns: true, usedLegacyColumns: true };
}

// --- Public API ---

// 5-second in-memory cache so back-nav to Home doesn't refetch from Supabase
// every time. Invalidated by addHistoryEntry / clearHistory.
let _memCache = { value: null, ts: 0, userId: null };
const HISTORY_MEM_TTL_MS = 5000;

function _invalidateMemCache() {
  _memCache = { value: null, ts: 0, userId: null };
}

export function clearHistoryMemoryCache() {
  _invalidateMemCache();
  currentUserIdCache = { value: null, ts: 0 };
}

export function clearHistoryMigrationSessionCache() {
  completedHistoryMigrationUsers.clear();
}

/**
 * Read scan history.
 * If authenticated, try Supabase first; fall back to local on failure.
 */
// Back-fills productImageUrl on history entries that have a cache_key but no image,
// by batch-looking up product_data.image_url. One query per getHistory call.
async function _enrichMissingImages(entries, { signal = null } = {}) {
  const needLookup = entries.filter(e => !e.productImageUrl && e.cacheKey);
  if (needLookup.length === 0) return entries;
  let request;
  try {
    const keys = [...new Set(needLookup
      .flatMap((e) => [e.cacheKey, productDataCacheKeyForHistory(e.cacheKey)])
      .filter(Boolean))];
    request = startHistoryRemoteDeadline("History image enrichment", HISTORY_IMAGE_ENRICH_TIMEOUT_MS, signal);
    const { data, error } = await applyAbortSignal(supabase
      .from("product_data")
      .select("cache_key, image_url")
      .in("cache_key", keys)
      .not("image_url", "is", null), request.signal);
    if (error || !data || data.length === 0) {
      if (error) reportNetworkError(error);
      else reportNetworkSuccess();
      return entries;
    }
    reportNetworkSuccess();
    const byKey = new Map(data.map(r => [r.cache_key, r.image_url]));
    return entries.map(e => (
      !e.productImageUrl && e.cacheKey && (byKey.has(e.cacheKey) || byKey.has(productDataCacheKeyForHistory(e.cacheKey)))
        ? { ...e, productImageUrl: byKey.get(e.cacheKey) || byKey.get(productDataCacheKeyForHistory(e.cacheKey)) }
        : e
    ));
  } catch (err) {
    if (err?.name !== "AbortError") {
      reportNetworkError(err);
    }
    return entries;
  } finally {
    request?.cleanup?.();
  }
}

export async function enrichHistoryImages(entries, { signal = null } = {}) {
  return _enrichMissingImages(entries, { signal });
}

export async function getHistory({ signal = null, enrichImages = true } = {}) {
  const userId = await getCurrentUserId({ signal });
  if (signal?.aborted) throw signal.reason || abortError("History read aborted");

  // Memory short-circuit — same user, fresh enough.
  if (_memCache.value && _memCache.userId === userId && Date.now() - _memCache.ts < HISTORY_MEM_TTL_MS) {
    return _memCache.value;
  }

  const localHistoryPromise = userId
    ? getLocalHistory(userId).catch((err) => {
      console.log("[HISTORY] Local history read failed:", err?.message || err);
      return [];
    })
    : null;

  if (userId) {
    let request;
    try {
      request = startHistoryRemoteDeadline("History read", HISTORY_REMOTE_READ_TIMEOUT_MS, signal);
      const { data, error } = await applyAbortSignal(supabase
        .from("scan_history")
        .select("*")
        .eq("user_id", userId)
        .order("date_scanned", { ascending: false })
        .limit(MAX_ENTRIES), request.signal);

      if (error) {
        reportNetworkError(error);
      }

      if (!error && data) {
        reportNetworkSuccess();
        const supabaseEntries = data.map(fromSupabaseRow);
        // Merge local entries for THIS USER that may not have been synced yet
        let result = supabaseEntries;
        const localEntries = await localHistoryPromise;
        const supabaseIds = new Set(supabaseEntries.map((e) => e.id));
        const unsynced = localEntries.filter((e) => !supabaseIds.has(e.id));
        if (unsynced.length > 0) {
          console.log("[HISTORY] Merging", unsynced.length, "unsynced local entries");
          result = [...unsynced, ...supabaseEntries]
            .sort((a, b) => new Date(b.dateScanned) - new Date(a.dateScanned))
            .slice(0, MAX_ENTRIES);
        }
        const enriched = enrichImages ? await _enrichMissingImages(result, { signal }) : result;
        _memCache = { value: enriched, ts: Date.now(), userId };
        return enriched;
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      console.log("[HISTORY] Supabase read failed, falling back to local:", err.message);
      reportNetworkError(err);
    } finally {
      request?.cleanup?.();
    }
  }

  const local = userId ? await localHistoryPromise : await getLocalHistory(userId);
  if (signal?.aborted) throw signal.reason || abortError("History read aborted");
  const enriched = enrichImages ? await _enrichMissingImages(local, { signal }) : local;
  _memCache = { value: enriched, ts: Date.now(), userId };
  return enriched;
}

/**
 * Add a new scan history entry.
 * Writes to AsyncStorage for offline replay. If authenticated, also upserts to
 * Supabase even when local storage is unavailable.
 */
export async function addHistoryEntry(entry) {
  try {
    const userId = await getCurrentUserId();
    const newEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ...entry,
    };

    try {
      const localHistory = await getLocalHistory(userId);
      const updated = [newEntry, ...localHistory].slice(0, MAX_ENTRIES);
      await saveLocalHistory(updated, userId);
      console.log("[HISTORY] Saved entry locally:", newEntry.productName);
    } catch (localErr) {
      console.log("[HISTORY] Local history save failed:", localErr.message);
    }

    _invalidateMemCache();

    // Fire-and-forget Supabase upsert
    if (userId) {
      if (historyRemoteUpsertInflight >= HISTORY_REMOTE_UPSERT_MAX_INFLIGHT) {
        console.log("[HISTORY] Supabase upsert skipped: remote history sync saturated");
        return;
      }
      const request = startHistoryRemoteDeadline("History upsert");
      historyRemoteUpsertInflight += 1;
      upsertScanHistoryRows(toSupabaseRow(newEntry, userId), { onConflict: "id,user_id" }, request.signal)
        .then(({ error }) => {
          if (error) {
            if (isMissingOptionalHistoryColumnError(error)) {
              noteOptionalHistorySchemaUnavailable(error);
              console.log("[HISTORY] Supabase upsert deferred until schema cache refresh:", error.message);
            } else {
              reportNetworkError(error);
              console.log("[HISTORY] Supabase upsert error:", error.message);
            }
          } else {
            reportNetworkSuccess();
            console.log("[HISTORY] Synced to Supabase:", newEntry.productName);
          }
        })
        .catch((err) => {
          if (err?.name === "AbortError") {
            console.log("[HISTORY] Supabase upsert timed out");
            return;
          }
          reportNetworkError(err);
          console.log("[HISTORY] Supabase upsert error:", err.message);
        })
        .finally(() => {
          request.cleanup();
          historyRemoteUpsertInflight = Math.max(0, historyRemoteUpsertInflight - 1);
        });
    }
  } catch (err) {
    console.log("[HISTORY] Error saving entry:", err.message);
  }
}

/**
 * Clear all scan history from both stores.
 */
export async function clearHistory() {
  const failures = [];

  try {
    const userId = await getCurrentUserId();
    const key = getStorageKey(userId);

    try {
      await AsyncStorage.removeItem(key);
      console.log("[HISTORY] Cleared local history");
    } catch (localErr) {
      failures.push(localErr);
      console.log("[HISTORY] Local history clear failed:", localErr.message);
    }

    if (userId) {
      try {
        const { error } = await supabase
          .from("scan_history")
          .delete()
          .eq("user_id", userId);

        if (error) {
          failures.push(error);
          reportNetworkError(error);
          console.log("[HISTORY] Supabase clear error:", error.message);
        } else {
          reportNetworkSuccess();
          console.log("[HISTORY] Cleared Supabase history");
        }
      } catch (remoteErr) {
        failures.push(remoteErr);
        reportNetworkError(remoteErr);
        console.log("[HISTORY] Supabase clear error:", remoteErr.message);
      }
    }

    _invalidateMemCache();

    if (failures.length > 0) {
      const err = new Error("Failed to clear all scan history. Please try again.");
      err.cause = failures[0];
      throw err;
    }
  } catch (err) {
    console.log("[HISTORY] Error clearing history:", err.message);
    throw err;
  }
}

/**
 * Migrate local AsyncStorage history to Supabase on first sign-in.
 * Also migrates from legacy shared key to user-specific key.
 * Idempotent — keyed by user ID.
 */
export async function migrateLocalHistoryToSupabase(userId) {
  if (!userId || completedHistoryMigrationUsers.has(userId)) return;

  const migrationKey = MIGRATION_PREFIX + userId;

  try {
    const alreadyMigrated = (await AsyncStorage.getItem(migrationKey)) === "true";

    // Always check the anonymous legacy key. A user can sign out, scan as a
    // guest, then sign back into an account whose migration flag is already set.
    let legacyHistory = [];
    const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      try {
        const legacyData = JSON.parse(legacyRaw);
        if (Array.isArray(legacyData) && legacyData.length > 0) {
          legacyHistory = legacyData;
          console.log("[HISTORY] Found", legacyHistory.length, "entries in legacy storage");
        }
      } catch (parseErr) {
        console.log("[HISTORY] Failed to parse legacy data:", parseErr.message);
      }
    }

    if (alreadyMigrated && legacyHistory.length === 0) {
      console.log("[HISTORY] Migration already completed for user:", userId);
      completedHistoryMigrationUsers.add(userId);
      return;
    }

    const userHistory = await getLocalHistory(userId);
    const sourceHistory = alreadyMigrated
      ? legacyHistory
      : [...legacyHistory, ...userHistory];
    const byId = new Map();
    for (const entry of sourceHistory) {
      if (entry?.id && !byId.has(entry.id)) byId.set(entry.id, entry);
    }
    const localHistory = [...byId.values()]
      .sort((a, b) => new Date(b.dateScanned || 0) - new Date(a.dateScanned || 0))
      .slice(0, MAX_ENTRIES);

    if (localHistory.length === 0) {
      await AsyncStorage.setItem(migrationKey, "true");
      completedHistoryMigrationUsers.add(userId);
      return;
    }

    const rows = localHistory.map((entry) => toSupabaseRow(entry, userId));
    const { error } = await upsertScanHistoryRows(rows, { onConflict: "id,user_id" });

    if (error) {
      if (isMissingOptionalHistoryColumnError(error)) {
        noteOptionalHistorySchemaUnavailable(error);
        console.log("[HISTORY] Migration deferred until schema cache refresh:", error.message);
      } else {
        reportNetworkError(error);
        console.log("[HISTORY] Migration upsert error:", error.message);
      }
      // Don't mark as complete so it retries next time
      return;
    }
    reportNetworkSuccess();

    try {
      if (legacyHistory.length > 0) {
        const mergedLocal = [...new Map([...legacyHistory, ...userHistory]
          .filter((entry) => entry?.id)
          .map((entry) => [entry.id, entry])).values()]
          .sort((a, b) => new Date(b.dateScanned || 0) - new Date(a.dateScanned || 0))
          .slice(0, MAX_ENTRIES);
        await saveLocalHistory(mergedLocal, userId);
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
        console.log("[HISTORY] Migrated legacy data to user-specific storage");
      }
      await AsyncStorage.setItem(migrationKey, "true");
      completedHistoryMigrationUsers.add(userId);
      console.log("[HISTORY] Migrated", localHistory.length, "entries to Supabase");
    } catch (storageErr) {
      console.log("[HISTORY] Failed to save migration flag:", storageErr.message);
    }
  } catch (err) {
    console.log("[HISTORY] Migration error:", err.message);
    reportNetworkError(err);
  }
}
