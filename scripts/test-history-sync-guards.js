#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const historySource = fs.readFileSync(path.join(root, "services/history.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`history sync guard failed: ${message}`);
    process.exit(1);
  }
}

const addStart = historySource.indexOf("export async function addHistoryEntry");
const clearStart = historySource.indexOf("export async function clearHistory");
const migrateStart = historySource.indexOf("export async function migrateLocalHistoryToSupabase");
const enrichStart = historySource.indexOf("async function _enrichMissingImages");
const getHistoryStart = historySource.indexOf("export async function getHistory");
const addBlock = historySource.slice(addStart, clearStart);
const clearBlock = historySource.slice(clearStart, migrateStart);
const enrichBlock = historySource.slice(enrichStart, getHistoryStart);
const getHistoryBlock = historySource.slice(getHistoryStart, addStart);

assert(
  addStart !== -1 && clearStart !== -1 && migrateStart !== -1 && enrichStart !== -1 && getHistoryStart !== -1,
  "history functions must exist"
);

assert(
    addBlock.includes("catch (localErr)") &&
    addBlock.includes("Local history save failed") &&
    addBlock.includes("if (userId)") &&
    addBlock.includes("upsertScanHistoryRows(toSupabaseRow(newEntry, userId), { onConflict: \"id,user_id\" }, request.signal)"),
  "signed-in history upsert must still run after local history save failure"
);

assert(
  addBlock.indexOf("catch (localErr)") < addBlock.indexOf("if (userId)") &&
    addBlock.indexOf("if (userId)") < addBlock.indexOf("upsertScanHistoryRows(toSupabaseRow(newEntry, userId), { onConflict: \"id,user_id\" }, request.signal)"),
  "Supabase history upsert must be outside the local save try/catch"
);

assert(
	  historySource.includes("const HISTORY_REMOTE_UPSERT_TIMEOUT_MS = 5_000") &&
	    historySource.includes("const HISTORY_REMOTE_READ_TIMEOUT_MS = 5_000") &&
	    historySource.includes("const HISTORY_IMAGE_ENRICH_TIMEOUT_MS = 2_500") &&
	    historySource.includes("const HISTORY_REMOTE_UPSERT_MAX_INFLIGHT = 2") &&
	    historySource.includes("const HISTORY_USER_ID_CACHE_TTL_MS = 5_000") &&
	    historySource.includes("let currentUserIdCache = { value: null, ts: 0 }") &&
	    historySource.includes("let historyRemoteUpsertInflight = 0") &&
    historySource.includes("function startHistoryRemoteDeadline(label, timeoutMs = HISTORY_REMOTE_UPSERT_TIMEOUT_MS, parentSignal = null)") &&
    historySource.includes("parentSignal.addEventListener(\"abort\", parentAbortHandler, { once: true })") &&
    historySource.includes('parentSignal?.removeEventListener?.("abort", parentAbortHandler)') &&
    historySource.includes("function applyAbortSignal(query, signal)") &&
    historySource.includes("async function upsertScanHistoryRows(rows, options, signal = null)") &&
    historySource.includes(".upsert(payload, options), signal)") &&
    historySource.includes(".upsert(stripOptionalHistoryRows(rows, columnsToStrip), options), signal)") &&
    addBlock.includes("historyRemoteUpsertInflight >= HISTORY_REMOTE_UPSERT_MAX_INFLIGHT") &&
    addBlock.includes('const request = startHistoryRemoteDeadline("History upsert")') &&
    addBlock.includes('console.log("[HISTORY] Supabase upsert timed out")') &&
    addBlock.includes("request.cleanup()") &&
    addBlock.includes("historyRemoteUpsertInflight = Math.max(0, historyRemoteUpsertInflight - 1)"),
  "fire-and-forget remote history upserts must be bounded by a deadline and inflight cap"
);

assert(
  historySource.includes("async function getCurrentUserId({ signal = null } = {})") &&
    historySource.includes("if (!signal && currentUserIdCache.value && Date.now() - currentUserIdCache.ts < HISTORY_USER_ID_CACHE_TTL_MS)") &&
    historySource.includes("return currentUserIdCache.value;") &&
    historySource.includes("currentUserIdCache = { value: userId, ts: Date.now() };") &&
    historySource.includes("currentUserIdCache = { value: null, ts: 0 };") &&
    historySource.includes("signal.addEventListener(\"abort\", onAbort, { once: true })") &&
    historySource.includes("abortCleanup?.()") &&
    historySource.includes("export async function enrichHistoryImages(entries, { signal = null } = {})") &&
    historySource.includes("export async function getHistory({ signal = null, enrichImages = true } = {})") &&
    getHistoryBlock.includes('request = startHistoryRemoteDeadline("History read", HISTORY_REMOTE_READ_TIMEOUT_MS, signal)') &&
    getHistoryBlock.includes('applyAbortSignal(supabase\n        .from("scan_history")') &&
    getHistoryBlock.includes(".limit(MAX_ENTRIES), request.signal)") &&
    getHistoryBlock.includes("const enriched = enrichImages ? await _enrichMissingImages(result, { signal }) : result;") &&
    getHistoryBlock.includes("const enriched = enrichImages ? await _enrichMissingImages(local, { signal }) : local;") &&
    getHistoryBlock.includes('if (signal?.aborted) throw signal.reason || abortError("History read aborted")') &&
    getHistoryBlock.includes("if (signal?.aborted) throw err;") &&
    !getHistoryBlock.includes('if (err?.name === "AbortError") throw err;') &&
    getHistoryBlock.includes("request?.cleanup?.()") &&
    getHistoryBlock.includes("Supabase read failed, falling back to local") &&
    enrichBlock.includes("async function _enrichMissingImages(entries, { signal = null } = {})") &&
    historySource.includes("function productDataCacheKeyForHistory(cacheKey)") &&
    historySource.includes('return key.replace(/__(dog|cat)$/i, "");') &&
    enrichBlock.includes(".flatMap((e) => [e.cacheKey, productDataCacheKeyForHistory(e.cacheKey)])") &&
    enrichBlock.includes('request = startHistoryRemoteDeadline("History image enrichment", HISTORY_IMAGE_ENRICH_TIMEOUT_MS, signal)') &&
    enrichBlock.includes('applyAbortSignal(supabase\n      .from("product_data")') &&
    enrichBlock.includes(".not(\"image_url\", \"is\", null), request.signal)") &&
    enrichBlock.includes("byKey.has(productDataCacheKeyForHistory(e.cacheKey))") &&
    enrichBlock.includes("byKey.get(e.cacheKey) || byKey.get(productDataCacheKeyForHistory(e.cacheKey))") &&
    enrichBlock.includes('if (err?.name !== "AbortError")') &&
    enrichBlock.includes("request?.cleanup?.()"),
  "history reads and image enrichment must use abortable deadlines and base product keys so recent-scan loading cannot leave slow remote queries running or miss species-key thumbnails"
);

const localHistoryPromiseStart = getHistoryBlock.indexOf("const localHistoryPromise = userId");
const remoteHistoryReadStart = getHistoryBlock.indexOf('request = startHistoryRemoteDeadline("History read", HISTORY_REMOTE_READ_TIMEOUT_MS, signal)');
const remoteMergeLocalAwait = getHistoryBlock.indexOf("const localEntries = await localHistoryPromise;");
const localFallbackAwait = getHistoryBlock.indexOf("const local = userId ? await localHistoryPromise : await getLocalHistory(userId);");

assert(
  localHistoryPromiseStart !== -1 &&
    getHistoryBlock.includes("? getLocalHistory(userId).catch((err) => {") &&
    getHistoryBlock.includes('console.log("[HISTORY] Local history read failed:", err?.message || err);') &&
    getHistoryBlock.includes("return [];") &&
    remoteMergeLocalAwait !== -1 &&
    localFallbackAwait !== -1 &&
    localHistoryPromiseStart < remoteHistoryReadStart &&
    remoteHistoryReadStart < remoteMergeLocalAwait &&
    remoteMergeLocalAwait < localFallbackAwait,
  "signed-in history reads must start local replay before the remote scan_history query and reuse it for unsynced merge/fallback"
);

assert(
    historySource.includes("OPTIONAL_REMOTE_HISTORY_COLUMNS") &&
    historySource.includes('"product_image_url"') &&
    historySource.includes("RICH_REMOTE_HISTORY_COLUMNS") &&
    historySource.includes('const RICH_REMOTE_HISTORY_COLUMNS = ["analysis_payload"]') &&
    historySource.includes("function historyErrorText(err)") &&
    historySource.includes("err?.details") &&
    historySource.includes("err?.hint") &&
    historySource.includes(".join(\" \").toLowerCase()") &&
    historySource.includes("isMissingOptionalHistoryColumnError") &&
    historySource.includes("missingOptionalHistoryColumnsFromError") &&
    historySource.includes("disabledOptionalHistoryColumns") &&
    historySource.includes("const HISTORY_SCHEMA_MAX_RETRY_MS = 15 * 60_000") &&
    historySource.includes("let optionalHistorySchemaRetryMs = HISTORY_SCHEMA_RETRY_MS") &&
    historySource.includes("optionalHistoryColumnsRetryAt = Date.now() + optionalHistorySchemaRetryMs") &&
    historySource.includes("optionalHistorySchemaRetryMs = Math.min(optionalHistorySchemaRetryMs * 2, HISTORY_SCHEMA_MAX_RETRY_MS)") &&
    historySource.includes("function noteOptionalHistorySchemaSuccess()") &&
    historySource.includes("optionalHistorySchemaRetryMs = HISTORY_SCHEMA_RETRY_MS") &&
    historySource.includes("disabledOptionalHistoryColumns = new Set()") &&
    historySource.includes("if (!useReducedRows) noteOptionalHistorySchemaSuccess()") &&
    historySource.includes('err?.code === "PGRST204"') &&
	    historySource.includes("message.includes(column.toLowerCase())") &&
	    historySource.includes("stripOptionalHistoryRows") &&
	    historySource.includes("canStripOptionalHistoryColumns") &&
	    historySource.includes("function splitOptionalHistoryRows(rows, columns = OPTIONAL_REMOTE_HISTORY_COLUMNS)") &&
	    historySource.includes("function deferredOptionalHistorySchemaResult(columns, richRowsDeferred = 0)") &&
	    historySource.includes("const retryingReducedSchema = Date.now() < optionalHistoryColumnsRetryAt") &&
	    historySource.includes("if (retryingReducedSchema && disabledColumns.length > 0)") &&
	    historySource.includes("if (richRows.length > 0)") &&
	    historySource.includes("return deferredOptionalHistorySchemaResult(disabledColumns, richRows.length)") &&
	    historySource.includes("columnsToStrip") &&
	    historySource.includes("stripSafeRows") &&
	    historySource.includes("richRows") &&
	    historySource.includes("partialHistorySync") &&
	    historySource.includes("reducedRowsSynced: stripSafeRows.length") &&
	    historySource.includes("richRowsDeferred") &&
	    historySource.includes("deferredUntilSchemaRefresh") &&
	    historySource.includes("const additionalMissingColumns = missingOptionalHistoryColumnsFromError(retryResult.error)") &&
	    historySource.includes("const combinedColumnsToStrip = [") &&
	    historySource.includes("...columnsToStrip") &&
	    historySource.includes("...new Set([") &&
	    historySource.includes("combinedColumnsToStrip.length > columnsToStrip.length") &&
	    historySource.includes("canStripOptionalHistoryColumns(rows, combinedColumnsToStrip)") &&
	    historySource.includes("stripOptionalHistoryRows(rows, combinedColumnsToStrip)") &&
	    historySource.includes("usedReducedColumns") &&
	    historySource.includes("upsertScanHistoryRows") &&
	    historySource.includes("Supabase upsert deferred until schema cache refresh") &&
    historySource.includes("Migration deferred until schema cache refresh"),
  "history sync must tolerate stale Supabase schema cache without dropping rich history payloads or blocking legacy-compatible rows in mixed batches"
);

assert(
  clearBlock.includes("catch (localErr)") &&
    clearBlock.includes("Local history clear failed") &&
    clearBlock.includes("if (userId)") &&
    clearBlock.includes(".delete()") &&
    clearBlock.includes('.eq("user_id", userId)'),
  "signed-in history delete must still run after local history clear failure"
);

assert(
  clearBlock.indexOf("catch (localErr)") < clearBlock.indexOf("if (userId)") &&
    clearBlock.indexOf("if (userId)") < clearBlock.indexOf(".delete()"),
  "Supabase history delete must be outside the local clear try/catch"
);

assert(
  packageJson.includes('"test:history-sync": "node scripts/test-history-sync-guards.js"') &&
    packageJson.includes("npm run test:history-sync"),
  "history sync guard must be wired into package scripts"
);

console.log("history sync guard passed");
