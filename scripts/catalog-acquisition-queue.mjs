import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_DAYS = 30;
const DEFAULT_LIMIT = 100;
const DEFAULT_REFRESH_LIMIT = 500;
const DEFAULT_RECONCILE_BATCHES = 12;
const DEFAULT_RECONCILE_LIMIT = 100;
const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedBrand(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function loadSourceTargets() {
  const raw = JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"));
  const targets = new Map();

  for (const target of raw) {
    for (const value of [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])]) {
      const key = normalizedBrand(value);
      if (key) targets.set(key, target);
    }
  }

  return targets;
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function clientFromEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = serviceRoleKey();
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function fallbackSql({
  days,
  limit,
  refreshLimit,
  status,
  type,
  reconcile,
  reconcileLimit,
}) {
  const statusFilter = status === "all" ? "" : `\n  AND status = '${status.replace(/'/g, "''")}'`;
  const typeFilter = type ? `\n  AND gap_type = '${type.replace(/'/g, "''")}'` : "";

  return `
-- Run in Supabase SQL Editor with a privileged role.
SELECT public.refresh_catalog_acquisition_queue(${days}, ${refreshLimit}) AS refresh_result;
${reconcile ? `\nSELECT public.reconcile_catalog_acquisition_queue_batch(${reconcileLimit}) AS reconcile_result;\n` : ""}

SELECT
  gap_type,
  status,
  priority_score,
  brand,
  product_name,
  normalized_query,
  needs_product_record,
  needs_verified_ingredients,
  needs_verified_image,
  needs_pet_type,
  ready_rows,
  affected_product_count,
  demand_events,
  last_event_at,
  source_url
FROM public.catalog_acquisition_queue
WHERE TRUE${statusFilter}${typeFilter}
ORDER BY priority_score DESC, demand_events DESC, updated_at DESC
LIMIT ${limit};`.trim();
}

async function refreshQueue(client, { days, refreshLimit }) {
  const { data, error } = await client.rpc("refresh_catalog_acquisition_queue", {
    p_days: days,
    p_limit: refreshLimit,
  });

  if (error) throw error;
  return data;
}

function resolvedRows(value) {
  return Number(value?.resolved_total_rows || 0);
}

async function reconcileQueue(client, { batches, limit }) {
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
        if (fallback.error) throw fallback.error;
        return fallback.data;
      }
      throw error;
    }

    results.push(data);
    if (!data?.has_more_open_rows || resolvedRows(data) === 0) break;
  }

  if (results.length <= 1) return results[0] || null;

  return {
    mode: "batched_client_loop",
    batches: results.length,
    resolved_total_rows: results.reduce((sum, row) => sum + resolvedRows(row), 0),
    last_result: results[results.length - 1],
  };
}

async function fetchRows(client, { limit, status, type }) {
  let query = client
    .from("catalog_acquisition_queue")
    .select([
      "gap_type",
      "status",
      "priority_score",
      "brand",
      "product_name",
      "normalized_query",
      "needs_product_record",
      "needs_verified_ingredients",
      "needs_verified_image",
      "needs_pet_type",
      "ready_rows",
      "affected_product_count",
      "demand_events",
      "last_event_at",
      "source_url",
      "sample_metadata",
    ].join(","))
    .order("priority_score", { ascending: false })
    .order("demand_events", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status !== "all") query = query.eq("status", status);
  if (type) query = query.eq("gap_type", type);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function reason(row) {
  const needs = [];
  if (row.needs_product_record) needs.push("missing product record");
  if (row.needs_verified_ingredients) needs.push("official/manufacturer ingredients");
  if (row.needs_verified_image) needs.push("verified product image");
  if (row.needs_pet_type) needs.push("pet-type taxonomy");
  return needs.join(" + ");
}

function sampleArray(row, key) {
  const value = row.sample_metadata?.[key];
  return Array.isArray(value) ? value.map(compact).filter(Boolean) : [];
}

function sampleNumber(row, key) {
  const value = Number(row.sample_metadata?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function sourceRecommendation(row) {
  if (row.needs_verified_ingredients && row.needs_verified_image) {
    return "official/manufacturer/GDSN feed with ingredient statement and product image";
  }
  if (row.needs_verified_ingredients) {
    return "official/manufacturer/GDSN ingredient feed";
  }
  if (row.needs_product_record) {
    return "official/manufacturer/GDSN product listing";
  }
  if (row.needs_verified_image) {
    return "manufacturer or retailer-verified image feed";
  }
  if (row.needs_pet_type) {
    return "pet-type taxonomy cleanup";
  }
  return "review";
}

function displayRows(rows, sourceTargets = new Map()) {
  return rows.map((row) => ({
    sourceOwner: sourceTargets.get(normalizedBrand(row.brand))?.sourceOwner || "",
    sourcePriority: sourceTargets.get(normalizedBrand(row.brand))?.sourcePriority || "",
    sourceTargetUrl: sourceTargets.get(normalizedBrand(row.brand))?.targetUrl || "",
    coverageTier: sourceTargets.get(normalizedBrand(row.brand))?.coverageTier || "",
    type: row.gap_type,
    status: row.status,
    priority: row.priority_score,
    brand: row.brand || "",
    product: row.product_name || "",
    query: row.normalized_query || "",
    need: reason(row),
    sourceTarget: sourceRecommendation(row),
    currentSources: sampleArray(row, "sources").join(", "),
    missingImages: sampleNumber(row, "missing_image_count"),
    unknownPetType: sampleNumber(row, "unknown_pet_type_count"),
    readyRows: row.ready_rows,
    affectedProducts: row.affected_product_count,
    demandEvents: row.demand_events,
    lastEventAt: row.last_event_at || "",
    sourceUrl: row.source_url || "",
  }));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function printCsv(rows, sourceTargets) {
  const formatted = displayRows(rows, sourceTargets);
  const columns = [
    "priority",
    "coverageTier",
    "type",
    "status",
    "brand",
    "sourceOwner",
    "sourcePriority",
    "sourceTargetUrl",
    "product",
    "query",
    "need",
    "sourceTarget",
    "currentSources",
    "missingImages",
    "unknownPetType",
    "readyRows",
    "affectedProducts",
    "demandEvents",
    "lastEventAt",
    "sourceUrl",
  ];

  console.log(columns.join(","));
  for (const row of formatted) {
    console.log(columns.map((column) => csvEscape(row[column])).join(","));
  }
}

function printReport({ refreshResult, reconcileResult, rows, days, status, type, sourceTargets }) {
  console.log("Catalog acquisition queue");
  console.log(`Window: ${days} day(s)`);
  console.log(`Status: ${status}`);
  if (type) console.log(`Type: ${type}`);
  if (refreshResult) console.log(`Refresh: ${JSON.stringify(refreshResult)}`);
  if (reconcileResult) console.log(`Reconcile: ${JSON.stringify(reconcileResult)}`);

  if (rows.length === 0) {
    console.log("\nNo acquisition rows matched this filter.");
    return;
  }

  console.log("\nTop acquisition rows:");
  console.table(displayRows(rows, sourceTargets));
}

async function main() {
  const days = positiveNumber(getArg("--days"), DEFAULT_DAYS);
  const limit = positiveNumber(getArg("--limit"), DEFAULT_LIMIT);
  const refreshLimit = positiveNumber(getArg("--refresh-limit"), DEFAULT_REFRESH_LIMIT);
  const reconcileBatches = positiveNumber(getArg("--reconcile-batches"), DEFAULT_RECONCILE_BATCHES);
  const reconcileLimit = positiveNumber(getArg("--reconcile-limit"), DEFAULT_RECONCILE_LIMIT);
  const status = compact(getArg("--status", "open")).toLowerCase() || "open";
  const type = compact(getArg("--type")) || null;
  const json = hasArg("--json");
  const csv = hasArg("--csv");
  const skipRefresh = hasArg("--no-refresh");
  const reconcile = !hasArg("--no-reconcile");
  const client = clientFromEnv();
  const sourceTargets = loadSourceTargets();

  if (!client) {
    console.log("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    console.log("Use this SQL instead:\n");
    console.log(fallbackSql({ days, limit, refreshLimit, status, type, reconcile, reconcileLimit }));
    return;
  }

  const refreshResult = skipRefresh ? null : await refreshQueue(client, { days, refreshLimit });
  const reconcileResult = reconcile ? await reconcileQueue(client, {
    batches: reconcileBatches,
    limit: reconcileLimit,
  }) : null;
  const rows = await fetchRows(client, { limit, status, type });

  if (csv) {
    printCsv(rows, sourceTargets);
  } else if (json) {
    console.log(JSON.stringify({ refreshResult, reconcileResult, rows, days, status, type }, null, 2));
  } else {
    printReport({ refreshResult, reconcileResult, rows, days, status, type, sourceTargets });
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
