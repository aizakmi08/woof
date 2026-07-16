import fs from "node:fs";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_LIMIT = 40;

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedBrand(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlBool(value) {
  return value ? "TRUE" : "FALSE";
}

function sourceAccessStatus(target) {
  if (target.accessStatus) return compact(target.accessStatus);
  if (target.discovery) return "runnable";
  return "authorized_feed_or_shared_target_required";
}

function targetRows() {
  const raw = JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"));
  const byBrand = new Map();

  for (const target of raw) {
    const names = [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])];
    for (const name of names) {
      const brandKey = normalizedBrand(name);
      if (!brandKey || byBrand.has(brandKey)) continue;
      byBrand.set(brandKey, {
        brandKey,
        matchedAlias: compact(name),
        manifestBrand: compact(target.brand),
        sourceOwner: compact(target.sourceOwner || target.brand),
        sourceSlug: compact(target.sourceSlug),
        sourcePriority: compact(target.sourcePriority),
        accessStatus: sourceAccessStatus(target),
        coverageTier: compact(target.coverageTier),
        targetUrl: compact(target.targetUrl),
        hasDiscovery: Boolean(target.discovery),
      });
    }
  }

  return [...byBrand.values()].sort((left, right) => left.brandKey.localeCompare(right.brandKey));
}

function sourceTargetsValues(rows) {
  if (rows.length === 0) {
    throw new Error(`${SOURCE_TARGETS_PATH} did not produce any source target rows.`);
  }

  return rows.map((row) => `    (${[
    sqlString(row.brandKey),
    sqlString(row.matchedAlias),
    sqlString(row.manifestBrand),
    sqlString(row.sourceOwner),
    sqlString(row.sourceSlug),
    sqlString(row.sourcePriority),
    sqlString(row.accessStatus),
    sqlString(row.coverageTier),
    sqlString(row.targetUrl),
    sqlBool(row.hasDiscovery),
  ].join(", ")})`).join(",\n");
}

function auditSql({ limit, minAffectedProducts }) {
  const minAffectedFilter = minAffectedProducts > 0
    ? `\n    AND COALESCE(q.affected_product_count, 0) >= ${minAffectedProducts}`
    : "";

  return `
-- Catalog queue source-target audit SQL
-- Purpose: classify live acquisition queue gaps by source-target readiness.
-- Run in Supabase SQL Editor or with MCP execute_sql. This query is read-only.
WITH source_targets(
  brand_key,
  matched_alias,
  manifest_brand,
  source_owner,
  source_slug,
  source_priority,
  access_status,
  coverage_tier,
  target_url,
  has_discovery
) AS (
  VALUES
${sourceTargetsValues(targetRows())}
),
open_queue AS (
  SELECT
    q.*,
    btrim(regexp_replace(regexp_replace(lower(COALESCE(q.brand, '')), '[^a-z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')) AS brand_key
  FROM public.catalog_acquisition_queue q
  WHERE q.status = 'open'${minAffectedFilter}
),
classified AS (
  SELECT
    q.brand_key,
    q.gap_type,
    q.brand,
    q.product_name,
    q.pet_type,
    q.priority_score,
    COALESCE(q.affected_product_count, 0) AS affected_product_count,
    CASE WHEN q.gap_type <> 'brand' THEN COALESCE(q.affected_product_count, 0) ELSE 0 END AS actionable_affected_product_count,
    COALESCE(q.demand_events, 0) AS demand_events,
    q.needs_product_record,
    q.needs_verified_ingredients,
    q.needs_verified_image,
    q.needs_pet_type,
    q.source_url,
    st.matched_alias,
    st.manifest_brand,
    st.source_owner,
    st.source_slug,
    st.source_priority,
    st.access_status,
    st.coverage_tier,
    st.target_url,
    st.has_discovery,
    CASE
      WHEN st.brand_key IS NULL THEN 'unmapped_source_target'
      WHEN st.access_status = 'requires_authorized_feed' THEN 'authorized_feed_required'
      WHEN st.access_status = 'requires_browser_snapshot' THEN 'browser_snapshot_or_feed_required'
      WHEN st.access_status = 'blocked_by_source' THEN 'source_permission_required'
      WHEN st.access_status = 'discontinued' THEN 'discontinued_or_excluded'
      WHEN st.access_status = 'shared_catalog_source' THEN 'shared_catalog_source_mapping'
      WHEN st.source_priority = 'retailer' THEN 'authorized_retailer_feed_required'
      WHEN st.has_discovery IS TRUE THEN 'runnable_official_source'
      ELSE 'authorized_feed_or_discovery_required'
    END AS operational_bucket,
    CASE
      WHEN st.brand_key IS NULL THEN 'add_source_target_or_authorized_feed'
      WHEN st.access_status = 'requires_authorized_feed' THEN 'request_or_load_authorized_feed'
      WHEN st.access_status = 'requires_browser_snapshot' THEN 'capture_allowed_browser_snapshot_or_feed'
      WHEN st.access_status = 'blocked_by_source' THEN 'seek_source_permission_or_alternate_official_feed'
      WHEN st.access_status = 'discontinued' THEN 'keep_excluded_or_mark_discontinued'
      WHEN st.access_status = 'shared_catalog_source' THEN 'map_to_shared_catalog_source'
      WHEN st.source_priority = 'retailer' THEN 'authorized_retailer_feed_required'
      WHEN st.has_discovery IS TRUE THEN 'run_official_source_extraction'
      ELSE 'define_discovery_or_authorized_feed'
    END AS recommended_next_action
  FROM open_queue q
  LEFT JOIN source_targets st ON st.brand_key = q.brand_key
),
bucket_summary AS (
  SELECT
    operational_bucket,
    recommended_next_action,
    COALESCE(NULLIF(source_priority, ''), '[unassigned]') AS source_priority,
    COALESCE(NULLIF(coverage_tier, ''), '[unassigned]') AS coverage_tier,
    COUNT(*) AS open_rows,
    COUNT(*) FILTER (WHERE gap_type <> 'brand') AS actionable_rows,
    COUNT(DISTINCT COALESCE(NULLIF(brand, ''), brand_key)) AS brands,
    SUM(affected_product_count) AS affected_products,
    SUM(actionable_affected_product_count) AS actionable_affected_products,
    SUM(demand_events) AS demand_events
  FROM classified
  GROUP BY 1, 2, 3, 4
),
source_owner_summary AS (
  SELECT
    COALESCE(NULLIF(source_owner, ''), '[unassigned]') AS source_owner,
    COALESCE(NULLIF(source_slug, ''), '[unassigned]') AS source_slug,
    operational_bucket,
    recommended_next_action,
    COALESCE(NULLIF(source_priority, ''), '[unassigned]') AS source_priority,
    COALESCE(NULLIF(coverage_tier, ''), '[unassigned]') AS coverage_tier,
    COALESCE(NULLIF(target_url, ''), '') AS target_url,
    COUNT(*) AS open_rows,
    COUNT(*) FILTER (WHERE gap_type <> 'brand') AS actionable_rows,
    COUNT(DISTINCT COALESCE(NULLIF(brand, ''), brand_key)) AS brands,
    SUM(affected_product_count) AS affected_products,
    SUM(actionable_affected_product_count) AS actionable_affected_products,
    SUM(demand_events) AS demand_events,
    left(string_agg(DISTINCT COALESCE(NULLIF(brand, ''), brand_key), '; ' ORDER BY COALESCE(NULLIF(brand, ''), brand_key)), 500) AS sample_brands
  FROM classified
  GROUP BY 1, 2, 3, 4, 5, 6, 7
),
unmapped_brand_summary AS (
  SELECT
    COALESCE(NULLIF(brand, ''), brand_key) AS brand,
    COUNT(*) AS open_rows,
    COUNT(*) FILTER (WHERE gap_type <> 'brand') AS actionable_rows,
    SUM(affected_product_count) AS affected_products,
    SUM(actionable_affected_product_count) AS actionable_affected_products,
    SUM(demand_events) AS demand_events,
    left(string_agg(DISTINCT COALESCE(NULLIF(product_name, ''), '[brand rollup]'), '; '), 500) AS sample_products
  FROM classified
  WHERE operational_bucket = 'unmapped_source_target'
  GROUP BY 1
),
runnable_source_summary AS (
  SELECT *
  FROM source_owner_summary
  WHERE operational_bucket = 'runnable_official_source'
),
authorized_source_summary AS (
  SELECT *
  FROM source_owner_summary
  WHERE operational_bucket IN (
    'authorized_feed_required',
    'authorized_feed_or_discovery_required',
    'authorized_retailer_feed_required',
    'browser_snapshot_or_feed_required',
    'shared_catalog_source_mapping',
    'source_permission_required'
  )
),
report AS (
  SELECT
    1 AS section_order,
    'summary_by_bucket' AS report_section,
    ROW_NUMBER() OVER (ORDER BY affected_products DESC, open_rows DESC, operational_bucket) AS rank,
    jsonb_build_object(
      'operational_bucket', operational_bucket,
      'recommended_next_action', recommended_next_action,
      'source_priority', source_priority,
      'coverage_tier', coverage_tier,
      'open_rows', open_rows,
      'actionable_rows', actionable_rows,
      'brands', brands,
      'affected_products', affected_products,
      'actionable_affected_products', actionable_affected_products,
      'demand_events', demand_events
    ) AS details
  FROM bucket_summary

  UNION ALL

  SELECT
    2 AS section_order,
    'top_source_owners' AS report_section,
    ROW_NUMBER() OVER (ORDER BY actionable_affected_products DESC, affected_products DESC, open_rows DESC, source_owner) AS rank,
    jsonb_build_object(
      'source_owner', source_owner,
      'source_slug', source_slug,
      'operational_bucket', operational_bucket,
      'recommended_next_action', recommended_next_action,
      'source_priority', source_priority,
      'coverage_tier', coverage_tier,
      'open_rows', open_rows,
      'actionable_rows', actionable_rows,
      'brands', brands,
      'affected_products', affected_products,
      'actionable_affected_products', actionable_affected_products,
      'demand_events', demand_events,
      'sample_brands', sample_brands,
      'target_url', target_url
    ) AS details
  FROM source_owner_summary
),
bounded_report AS (
  SELECT * FROM report

  UNION ALL

  SELECT
    3 AS section_order,
    'top_runnable_official_sources' AS report_section,
    ROW_NUMBER() OVER (ORDER BY actionable_affected_products DESC, affected_products DESC, open_rows DESC, source_owner) AS rank,
    jsonb_build_object(
      'source_owner', source_owner,
      'source_slug', source_slug,
      'recommended_next_action', recommended_next_action,
      'open_rows', open_rows,
      'actionable_rows', actionable_rows,
      'affected_products', affected_products,
      'actionable_affected_products', actionable_affected_products,
      'sample_brands', sample_brands,
      'target_url', target_url
    ) AS details
  FROM runnable_source_summary

  UNION ALL

  SELECT
    4 AS section_order,
    'top_authorized_feed_sources' AS report_section,
    ROW_NUMBER() OVER (ORDER BY actionable_affected_products DESC, affected_products DESC, open_rows DESC, source_owner) AS rank,
    jsonb_build_object(
      'source_owner', source_owner,
      'source_slug', source_slug,
      'operational_bucket', operational_bucket,
      'recommended_next_action', recommended_next_action,
      'open_rows', open_rows,
      'actionable_rows', actionable_rows,
      'affected_products', affected_products,
      'actionable_affected_products', actionable_affected_products,
      'sample_brands', sample_brands,
      'target_url', target_url
    ) AS details
  FROM authorized_source_summary

  UNION ALL

  SELECT
    5 AS section_order,
    'top_unmapped_brands' AS report_section,
    ROW_NUMBER() OVER (ORDER BY actionable_affected_products DESC, affected_products DESC, open_rows DESC, brand) AS rank,
    jsonb_build_object(
      'brand', brand,
      'recommended_next_action', 'add_source_target_or_authorized_feed',
      'open_rows', open_rows,
      'actionable_rows', actionable_rows,
      'affected_products', affected_products,
      'actionable_affected_products', actionable_affected_products,
      'demand_events', demand_events,
      'sample_products', sample_products
    ) AS details
  FROM unmapped_brand_summary
)
SELECT report_section, rank, details
FROM bounded_report
WHERE rank <= ${limit}
ORDER BY section_order, rank;`.trim();
}

function main() {
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  const minAffectedProducts = positiveInteger(getArg("--min-affected-products"), 0);
  console.log(auditSql({ limit, minAffectedProducts }));
}

main();
