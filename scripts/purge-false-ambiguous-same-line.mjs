import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLY_CONFIRMATION = "purge-false-ambiguous-same-line";
const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes(`--confirm=${APPLY_CONFIRMATION}`);
const MAX_ROWS = 5000;

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isFalseAmbiguousEvent(row) {
  return row?.metadata?.miss_reason === "ambiguous_same_line"
    && !compact(row?.metadata?.resolution_decision);
}

function priorityForEvent(row) {
  const metadata = row?.metadata || {};
  return 30
    + (compact(metadata.source).startsWith("label_scan") ? 10 : 0)
    + (["recognizers_disagree", "no_exact_variant", "ambiguous_same_line"]
      .includes(compact(metadata.resolution_decision)) ? 10 : 0);
}

function queuePatch(events) {
  const ordered = [...events].sort((left, right) => (
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  ));
  const latest = ordered.at(-1);
  const metadata = latest.metadata || {};
  const priority = ordered.reduce((current, event, index) => (
    index === 0
      ? priorityForEvent(event)
      : Math.max(current, priorityForEvent(event)) + 10
  ), 0);

  return {
    priority_score: priority,
    brand: compact(metadata.top_brand) || null,
    product_name: compact(metadata.top_product_name) || null,
    cache_key: compact(metadata.top_cache_key) || null,
    pet_type: compact(metadata.label_pet_type || metadata.top_pet_type) || null,
    product_source: "runtime_lookup_miss",
    source_quality: compact(metadata.top_source_quality) || null,
    needs_product_record: Number(metadata.result_count || 0) === 0
      || ["recognizers_disagree", "no_exact_variant", "ambiguous_same_line"]
        .includes(compact(metadata.resolution_decision)),
    needs_verified_ingredients: Number(metadata.needs_verified_ingredient_count || 0) > 0,
    needs_verified_image: Number(metadata.needs_verified_image_count || 0) > 0,
    needs_pet_type: Number(metadata.unknown_pet_type_count || 0) > 0,
    ready_rows: 0,
    affected_product_count: Math.max(Number(metadata.product_gap_count || 0), 1),
    demand_events: ordered.length,
    last_event_at: latest.created_at,
    sample_metadata: {
      event_id: latest.id,
      miss_reason: metadata.miss_reason || null,
      resolution_decision: metadata.resolution_decision || null,
      resolver_status: metadata.resolver_status || null,
      recognition_path: metadata.recognition_path || null,
      reason_codes: Array.isArray(metadata.reason_codes) ? metadata.reason_codes : [],
      verification_gaps: Array.isArray(metadata.verification_gaps) ? metadata.verification_gaps : [],
      last_runtime_miss_at: latest.created_at,
    },
    updated_at: new Date().toISOString(),
  };
}

function clientFromEnv() {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchMissEvents(client) {
  const { data, error } = await client
    .from("product_events")
    .select("id,created_at,event_name,metadata")
    .eq("event_name", "catalog_lookup_miss")
    .eq("metadata->>miss_reason", "ambiguous_same_line")
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);
  if (error) throw error;
  return (data || []).filter(isFalseAmbiguousEvent);
}

async function fetchLegitimateEvents(client, normalizedQuery) {
  const { data, error } = await client
    .from("product_events")
    .select("id,created_at,event_name,metadata")
    .in("event_name", ["catalog_lookup_miss", "catalog_lookup_failed"])
    .eq("metadata->>normalized_query", normalizedQuery)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);
  if (error) throw error;
  return (data || []).filter((row) => !isFalseAmbiguousEvent(row));
}

async function deleteIds(client, table, ids) {
  for (let index = 0; index < ids.length; index += 100) {
    const { error } = await client.from(table).delete().in("id", ids.slice(index, index + 100));
    if (error) throw error;
  }
}

async function main() {
  if (APPLY && !CONFIRMED) {
    throw new Error(`Refusing to mutate live data without --confirm=${APPLY_CONFIRMATION}`);
  }

  const client = clientFromEnv();
  const falseEvents = await fetchMissEvents(client);
  if (falseEvents.length >= MAX_ROWS) {
    throw new Error(`Safety stop: query reached the ${MAX_ROWS}-row limit.`);
  }

  const queries = [...new Set(falseEvents
    .map((row) => compact(row.metadata?.normalized_query))
    .filter(Boolean))];
  const legitimateByQuery = new Map();
  for (const query of queries) {
    legitimateByQuery.set(query, await fetchLegitimateEvents(client, query));
  }

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry_run",
    false_event_rows: falseEvents.length,
    affected_queries: queries.map((query) => ({
      normalized_query: query,
      legitimate_miss_events: legitimateByQuery.get(query).length,
      queue_action: legitimateByQuery.get(query).length ? "repair" : "delete",
    })),
  }, null, 2));

  if (!APPLY || falseEvents.length === 0) {
    if (!APPLY) console.log(`Dry run only. Add --apply --confirm=${APPLY_CONFIRMATION} to purge.`);
    return;
  }

  await deleteIds(client, "product_events", falseEvents.map((row) => row.id));

  for (const query of queries) {
    const legitimate = legitimateByQuery.get(query);
    if (legitimate.length === 0) {
      const { error } = await client
        .from("catalog_acquisition_queue")
        .delete()
        .eq("gap_type", "lookup")
        .eq("normalized_query", query);
      if (error) throw error;
      continue;
    }

    const { error } = await client
      .from("catalog_acquisition_queue")
      .update(queuePatch(legitimate))
      .eq("gap_type", "lookup")
      .eq("normalized_query", query);
    if (error) throw error;
  }

  const remaining = await fetchMissEvents(client);
  if (remaining.length !== 0) {
    throw new Error(`Verification failed: ${remaining.length} false events remain.`);
  }
  console.log(`Purged ${falseEvents.length} false event rows and repaired ${queries.length} queue keys.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
