const DEFAULT_ACQUISITION_DAYS = 30;
const DEFAULT_ACQUISITION_LIMIT = 500;
const DEFAULT_RECONCILE_BATCHES = 12;
const DEFAULT_RECONCILE_LIMIT = 100;

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function acquisitionQueueOptions({ getArg, hasArg } = {}) {
  return {
    refresh: !hasArg?.("--skip-acquisition-refresh"),
    reconcile: !hasArg?.("--skip-acquisition-reconcile"),
    days: positiveNumber(getArg?.("--acquisition-days"), DEFAULT_ACQUISITION_DAYS),
    limit: positiveNumber(getArg?.("--acquisition-limit"), DEFAULT_ACQUISITION_LIMIT),
    reconcileBatches: positiveNumber(getArg?.("--acquisition-reconcile-batches"), DEFAULT_RECONCILE_BATCHES),
    reconcileLimit: positiveNumber(getArg?.("--acquisition-reconcile-limit"), DEFAULT_RECONCILE_LIMIT),
  };
}

function resolvedRows(value) {
  return Number(value?.resolved_total_rows || 0);
}

function summarizeReconcileResults(results) {
  if (results.length <= 1) return results[0] || null;

  return {
    mode: "batched_client_loop",
    batches: results.length,
    resolved_product_rows: results.reduce((sum, row) => sum + Number(row?.resolved_product_rows || 0), 0),
    resolved_product_identity_rows: results.reduce((sum, row) => sum + Number(row?.resolved_product_identity_rows || 0), 0),
    resolved_brand_rows: results.reduce((sum, row) => sum + Number(row?.resolved_brand_rows || 0), 0),
    resolved_lookup_rows: results.reduce((sum, row) => sum + Number(row?.resolved_lookup_rows || 0), 0),
    resolved_total_rows: results.reduce((sum, row) => sum + resolvedRows(row), 0),
    last_result: results[results.length - 1],
  };
}

async function reconcileQueue(client, { batches, limit, label }) {
  const safeBatches = Math.min(Math.max(Math.round(batches || DEFAULT_RECONCILE_BATCHES), 1), 50);
  const safeLimit = Math.min(Math.max(Math.round(limit || DEFAULT_RECONCILE_LIMIT), 1), 1000);
  const results = [];

  for (let index = 0; index < safeBatches; index += 1) {
    const { data, error } = await client.rpc("reconcile_catalog_acquisition_queue_batch", {
      p_max_rows: safeLimit,
    });

    if (error) {
      if (index === 0 && /function .*reconcile_catalog_acquisition_queue_batch|schema cache|Could not find/i.test(error.message || "")) {
        const fallback = await client.rpc("reconcile_catalog_acquisition_queue");
        if (fallback.error) throw new Error(`${label} acquisition reconcile failed: ${fallback.error.message}`);
        return fallback.data;
      }
      throw new Error(`${label} acquisition reconcile failed: ${error.message}`);
    }

    results.push(data);

    if (!data?.has_more_open_rows || resolvedRows(data) === 0) break;
  }

  return summarizeReconcileResults(results);
}

export async function updateCatalogAcquisitionQueue(client, {
  refresh = true,
  reconcile = true,
  days = DEFAULT_ACQUISITION_DAYS,
  limit = DEFAULT_ACQUISITION_LIMIT,
  reconcileBatches = DEFAULT_RECONCILE_BATCHES,
  reconcileLimit = DEFAULT_RECONCILE_LIMIT,
  label = "catalog import",
} = {}) {
  if (!client || (!refresh && !reconcile)) {
    return {
      refreshResult: null,
      reconcileResult: null,
    };
  }

  const results = {
    refreshResult: null,
    reconcileResult: null,
  };

  if (refresh) {
    const { data, error } = await client.rpc("refresh_catalog_acquisition_queue", {
      p_days: days,
      p_limit: limit,
    });
    if (error) throw new Error(`${label} acquisition refresh failed: ${error.message}`);
    results.refreshResult = data;
  }

  if (reconcile) {
    results.reconcileResult = await reconcileQueue(client, {
      batches: reconcileBatches,
      limit: reconcileLimit,
      label,
    });
  }

  return results;
}

export function printAcquisitionQueueUpdate({ refreshResult, reconcileResult } = {}) {
  if (refreshResult) {
    console.log(`Acquisition refresh: ${JSON.stringify(refreshResult)}`);
  }

  if (reconcileResult) {
    console.log(`Acquisition reconcile: ${JSON.stringify(reconcileResult)}`);
  }
}

export function acquisitionQueueHelp() {
  return [
    "--skip-acquisition-refresh",
    "--skip-acquisition-reconcile",
    "--acquisition-days <days>",
    "--acquisition-limit <rows>",
    "--acquisition-reconcile-batches <batches>",
    "--acquisition-reconcile-limit <rows>",
  ].map(compact).join(", ");
}
