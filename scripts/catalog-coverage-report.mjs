import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const EVENT_NAMES = [
  "catalog_lookup_completed",
  "catalog_lookup_miss",
  "catalog_lookup_failed",
  "catalog_verification_gap",
];
const PAGE_SIZE = 1000;
const MAX_EVENTS = 20000;
const VERIFIED_INGREDIENT_STATUSES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
]);
const VERIFIED_IMAGE_STATUSES = new Set([
  "official",
  "manufacturer",
  "retailer_verified",
]);

function numberFromArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function fallbackSql(days) {
  return `
-- Run in Supabase SQL Editor with a privileged role.
WITH coverage AS (
  SELECT
    created_at,
    event_name,
    metadata->>'normalized_query' AS normalized_query,
    metadata->>'miss_reason' AS miss_reason,
    COALESCE((metadata->>'result_count')::int, 0) AS result_count,
    COALESCE((metadata->>'catalog_result_count')::int, 0) AS catalog_result_count,
    COALESCE((metadata->>'opff_result_count')::int, 0) AS opff_result_count,
    COALESCE((metadata->>'image_result_count')::int, 0) AS image_result_count,
    COALESCE((metadata->>'product_gap_count')::int, 0) AS product_gap_count,
    COALESCE((metadata->>'needs_verified_ingredient_count')::int, 0) AS needs_verified_ingredient_count,
    COALESCE((metadata->>'needs_verified_image_count')::int, 0) AS needs_verified_image_count,
    COALESCE((metadata->>'unknown_pet_type_count')::int, 0) AS unknown_pet_type_count,
    COALESCE(metadata->>'verification_gap_reasons', metadata->>'miss_reason') AS gap_reason
  FROM public.product_events
  WHERE created_at >= now() - interval '${days} days'
    AND event_name IN ('catalog_lookup_completed', 'catalog_lookup_miss', 'catalog_lookup_failed', 'catalog_verification_gap')
)
SELECT
  normalized_query,
  gap_reason,
  COUNT(*) AS events,
  MAX(created_at) AS last_seen_at,
  MAX(result_count) AS max_results,
  MAX(catalog_result_count) AS max_catalog_results,
  MAX(opff_result_count) AS max_opff_results,
  MAX(image_result_count) AS max_image_results,
  MAX(product_gap_count) AS max_product_gaps,
  MAX(needs_verified_ingredient_count) AS max_needs_verified_ingredients,
  MAX(needs_verified_image_count) AS max_needs_verified_images,
  MAX(unknown_pet_type_count) AS max_unknown_pet_type
FROM coverage
WHERE event_name <> 'catalog_lookup_completed'
   OR catalog_result_count = 0
   OR image_result_count = 0
   OR product_gap_count > 0
GROUP BY normalized_query, gap_reason
ORDER BY events DESC, last_seen_at DESC
LIMIT 50;`.trim();
}

async function fetchCoverageEvents(client, sinceIso) {
  const rows = [];

  for (let offset = 0; offset < MAX_EVENTS; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("product_events")
      .select("created_at,event_name,metadata")
      .in("event_name", EVENT_NAMES)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchCatalogRows(client) {
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("product_data")
      .select("source,source_quality,brand,pet_type,ingredient_text,ingredient_count,ingredient_verification_status,image_url,image_verification_status,source_url,verified_at,expires_at,is_complete_food,catalog_exclusion_reason")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasVerifiedIngredients(row = {}) {
  const ingredientCount = Number(row.ingredient_count || 0);
  const hasIngredients = Boolean(compact(row.ingredient_text)) || ingredientCount >= 5;
  return (
    hasIngredients &&
    Boolean(compact(row.source_url)) &&
    VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status).toLowerCase())
  );
}

function hasVerifiedImage(row = {}) {
  const imageUrl = compact(row.image_url);
  return (
    Boolean(imageUrl) &&
    !/^data:/i.test(imageUrl) &&
    Boolean(compact(row.source_url)) &&
    VERIFIED_IMAGE_STATUSES.has(compact(row.image_verification_status).toLowerCase())
  );
}

function isCurrentDogCatFood(row = {}) {
  if (row.pet_type !== "dog" && row.pet_type !== "cat") return false;
  if (row.is_complete_food === false) return false;
  if (compact(row.catalog_exclusion_reason)) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return false;
  return true;
}

function isInstantReady(row = {}) {
  return isCurrentDogCatFood(row) && hasVerifiedIngredients(row) && hasVerifiedImage(row);
}

function catalogReadiness(rows = []) {
  const sourceMap = new Map();
  const summary = {
    totalRows: rows.length,
    dogCatRows: rows.filter((row) => row.pet_type === "dog" || row.pet_type === "cat").length,
    dogRows: rows.filter((row) => row.pet_type === "dog").length,
    catRows: rows.filter((row) => row.pet_type === "cat").length,
    instantReadyRows: rows.filter(isInstantReady).length,
    verifiedIngredientRows: rows.filter(hasVerifiedIngredients).length,
    verifiedImageRows: rows.filter(hasVerifiedImage).length,
    missingIngredientRows: rows.filter((row) => isCurrentDogCatFood(row) && !hasVerifiedIngredients(row)).length,
    missingImageRows: rows.filter((row) => isCurrentDogCatFood(row) && !hasVerifiedImage(row)).length,
    staleRows: rows.filter((row) => row.expires_at && Date.parse(row.expires_at) <= Date.now()).length,
    excludedRows: rows.filter((row) => row.is_complete_food === false || compact(row.catalog_exclusion_reason)).length,
  };

  for (const row of rows) {
    const source = compact(row.source) || "unknown";
    const stats = sourceMap.get(source) || {
      source,
      rows: 0,
      instantReadyRows: 0,
      missingIngredientRows: 0,
      missingImageRows: 0,
      brands: new Set(),
    };
    stats.rows += 1;
    if (isInstantReady(row)) stats.instantReadyRows += 1;
    if (isCurrentDogCatFood(row) && !hasVerifiedIngredients(row)) stats.missingIngredientRows += 1;
    if (isCurrentDogCatFood(row) && !hasVerifiedImage(row)) stats.missingImageRows += 1;
    if (compact(row.brand)) stats.brands.add(compact(row.brand));
    sourceMap.set(source, stats);
  }

  const sourceBreakdown = [...sourceMap.values()]
    .map((stats) => ({
      ...stats,
      brands: stats.brands.size,
    }))
    .sort((left, right) => right.instantReadyRows - left.instantReadyRows || right.rows - left.rows)
    .slice(0, 20);

  return { summary, sourceBreakdown };
}

function emptyStats() {
  return {
    events: 0,
    missEvents: 0,
    failedEvents: 0,
    catalogGaps: 0,
    noImageEvents: 0,
    verificationGapEvents: 0,
    needsVerifiedIngredientProducts: 0,
    needsVerifiedImageProducts: 0,
    unknownPetTypeProducts: 0,
    lastSeenAt: null,
    missReasons: new Map(),
  };
}

function addReason(map, reason) {
  const key = reason || "none";
  map.set(key, (map.get(key) || 0) + 1);
}

function summarize(events) {
  const totals = emptyStats();
  const byQuery = new Map();

  for (const event of events) {
    const metadata = event.metadata || {};
    const query = metadata.normalized_query || "[blank]";
    const stats = byQuery.get(query) || emptyStats();
    const missReason = metadata.miss_reason || null;
    const catalogResultCount = Number(metadata.catalog_result_count || 0);
    const opffResultCount = Number(metadata.opff_result_count || 0);
    const imageResultCount = Number(metadata.image_result_count || 0);
    const productGapCount = Number(metadata.product_gap_count || 0);
    const needsVerifiedIngredientCount = Number(metadata.needs_verified_ingredient_count || 0);
    const needsVerifiedImageCount = Number(metadata.needs_verified_image_count || 0);
    const unknownPetTypeCount = Number(metadata.unknown_pet_type_count || 0);
    const gapReason = Array.isArray(metadata.verification_gap_reasons)
      ? metadata.verification_gap_reasons.join(", ")
      : missReason;

    for (const bucket of [totals, stats]) {
      bucket.events += 1;
      if (event.event_name === "catalog_lookup_miss") bucket.missEvents += 1;
      if (event.event_name === "catalog_lookup_failed") bucket.failedEvents += 1;
      if (event.event_name === "catalog_verification_gap") bucket.verificationGapEvents += 1;
      if (catalogResultCount === 0 && opffResultCount > 0) bucket.catalogGaps += 1;
      if (imageResultCount === 0) bucket.noImageEvents += 1;
      bucket.needsVerifiedIngredientProducts += needsVerifiedIngredientCount;
      bucket.needsVerifiedImageProducts += needsVerifiedImageCount;
      bucket.unknownPetTypeProducts += unknownPetTypeCount;
      if (productGapCount > 0) addReason(bucket.missReasons, gapReason);
      else addReason(bucket.missReasons, missReason);
      if (!bucket.lastSeenAt || event.created_at > bucket.lastSeenAt) {
        bucket.lastSeenAt = event.created_at;
      }
    }

    byQuery.set(query, stats);
  }

  return { totals, byQuery };
}

function topRows(byQuery, limit = 25) {
  return [...byQuery.entries()]
    .map(([query, stats]) => ({
      query,
      events: stats.events,
      missEvents: stats.missEvents,
      failedEvents: stats.failedEvents,
      catalogGaps: stats.catalogGaps,
      noImageEvents: stats.noImageEvents,
      verificationGapEvents: stats.verificationGapEvents,
      needsVerifiedIngredientProducts: stats.needsVerifiedIngredientProducts,
      needsVerifiedImageProducts: stats.needsVerifiedImageProducts,
      unknownPetTypeProducts: stats.unknownPetTypeProducts,
      lastSeenAt: stats.lastSeenAt,
      topReason: [...stats.missReasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "none",
    }))
    .filter((row) => (
      row.missEvents > 0 ||
      row.failedEvents > 0 ||
      row.catalogGaps > 0 ||
      row.noImageEvents > 0 ||
      row.verificationGapEvents > 0
    ))
    .sort((left, right) => {
      const leftScore = left.missEvents * 4 + left.catalogGaps * 3 + left.verificationGapEvents * 3 + left.failedEvents * 2 + left.noImageEvents;
      const rightScore = right.missEvents * 4 + right.catalogGaps * 3 + right.verificationGapEvents * 3 + right.failedEvents * 2 + right.noImageEvents;
      return rightScore - leftScore || right.events - left.events || String(right.lastSeenAt).localeCompare(String(left.lastSeenAt));
    })
    .slice(0, limit);
}

function printCatalogReadiness({ summary, sourceBreakdown }) {
  console.log("Catalog readiness dashboard");
  console.log(`Total product rows: ${summary.totalRows}`);
  console.log(`Dog/cat rows: ${summary.dogCatRows} (${summary.dogRows} dog, ${summary.catRows} cat)`);
  console.log(`Instant-ready rows: ${summary.instantReadyRows}`);
  console.log(`Verified ingredient rows: ${summary.verifiedIngredientRows}`);
  console.log(`Verified image rows: ${summary.verifiedImageRows}`);
  console.log(`Current dog/cat rows missing verified ingredients: ${summary.missingIngredientRows}`);
  console.log(`Current dog/cat rows missing verified images: ${summary.missingImageRows}`);
  console.log(`Stale rows: ${summary.staleRows}`);
  console.log(`Excluded/non-complete rows: ${summary.excludedRows}`);
  console.log("\nTop catalog sources:");
  console.table(sourceBreakdown);
  console.log("");
}

function printReport({ days, events, totals, rows }) {
  console.log(`Catalog coverage report (${days} days)`);
  console.log(`Events: ${events.length}`);
  console.log(`Misses: ${totals.missEvents}`);
  console.log(`Failures: ${totals.failedEvents}`);
  console.log(`OPFF catalog gaps: ${totals.catalogGaps}`);
  console.log(`No-image events: ${totals.noImageEvents}`);
  console.log(`Verification-gap events: ${totals.verificationGapEvents}`);
  console.log(`Products needing verified ingredients: ${totals.needsVerifiedIngredientProducts}`);
  console.log(`Products needing verified images: ${totals.needsVerifiedImageProducts}`);
  console.log(`Products needing pet type: ${totals.unknownPetTypeProducts}`);

  if (rows.length === 0) {
    console.log("\nNo unresolved coverage rows yet.");
    return;
  }

  console.log("\nTop unresolved coverage rows:");
  console.table(rows);
}

async function main() {
  const days = numberFromArg(process.argv[2], 14);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = serviceRoleKey();

  if (!supabaseUrl || !key) {
    const missing = [
      !supabaseUrl ? "SUPABASE_URL" : null,
      !key ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    ].filter(Boolean);
    console.log(`Missing ${missing.join(" and ")}.`);
    console.log("Use this SQL instead:\n");
    console.log(fallbackSql(days));
    return;
  }

  const client = createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [events, catalogRows] = await Promise.all([
    fetchCoverageEvents(client, sinceIso),
    fetchCatalogRows(client),
  ]);
  printCatalogReadiness(catalogReadiness(catalogRows));
  const { totals, byQuery } = summarize(events);
  printReport({ days, events, totals, rows: topRows(byQuery) });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
