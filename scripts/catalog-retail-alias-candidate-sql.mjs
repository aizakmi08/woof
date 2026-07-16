import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_LIMIT = 25;
const DEFAULT_MAX_RESULTS = 12;
const DEFAULT_SAMPLE_LIMIT = 25;

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sqlString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function loadSourceTargets() {
  if (!fs.existsSync(SOURCE_TARGETS_PATH)) return new Map();
  const targets = JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"));
  const byBrand = new Map();
  for (const target of targets) {
    for (const value of [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])]) {
      const key = normalizeKey(value);
      if (key) byBrand.set(key, target);
    }
  }
  return byBrand;
}

function targetComment(brand) {
  const target = loadSourceTargets().get(normalizeKey(brand));
  if (!target) return "-- Source target: unassigned";
  return [
    `-- Source target: ${target.sourceSlug || normalizeKey(target.sourceOwner || target.brand)}`,
    `-- Source priority: ${target.sourcePriority || "official"}`,
    `-- Access status: ${target.accessStatus || (target.discovery ? "runnable" : "requires_authorized_feed")}`,
    `-- Target URL: ${target.targetUrl || ""}`,
  ].join("\n");
}

export function buildSql({ brand, limit, maxResults, sampleLimit }) {
  const brandFilter = brand
    ? `\n    AND lower(trim(q.brand)) = lower(${sqlString(brand)})`
    : "";

  return `${brand ? targetComment(brand) : "-- All brands"}
-- Dry-run retail/community alias candidate audit. This query does not update rows.
-- A formula_alias_review_candidate is review-only: it proves a same-brand,
-- verified-ready match with exact source-backed ingredient statement, verified
-- front image, source URL, species guard, formula-token guard, and variant guards.
WITH queue_scope AS (
  SELECT
    q.id,
    q.brand,
    q.product_name,
    q.pet_type,
    q.priority_score,
    q.affected_product_count,
    q.cache_key,
    q.product_source,
    q.source_url AS queue_source_url,
    pd.source_url AS legacy_source_url,
    pd.ingredient_verification_status AS legacy_ingredient_verification_status,
    pd.image_verification_status AS legacy_image_verification_status,
    pd.catalog_exclusion_reason AS legacy_catalog_exclusion_reason,
    concat_ws(' ', q.brand, q.product_name) AS search_query
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data pd
    ON pd.cache_key = q.cache_key
  WHERE q.gap_type = 'product'
    AND q.status IN ('open', 'in_progress')
    AND q.brand IS NOT NULL
    AND q.product_name IS NOT NULL
    AND q.product_source IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr', 'brand')
    AND pd.catalog_exclusion_reason IS NULL
    AND COALESCE(NULLIF(q.source_url, ''), NULLIF(pd.source_url, '')) IS NULL
    AND COALESCE(pd.ingredient_verification_status, 'unverified') NOT IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )${brandFilter}
  ORDER BY
    public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
    q.priority_score DESC,
    q.updated_at DESC
  LIMIT ${limit}
),
raw_matches AS (
  SELECT
    qs.*,
    matched.cache_key AS matched_cache_key,
    matched.product_name AS matched_product_name,
    matched.brand AS matched_brand,
    matched.pet_type AS matched_pet_type,
    matched.source AS matched_source,
    matched.source_quality AS matched_source_quality,
    matched.source_url AS matched_source_url,
    matched.rank AS matched_rank,
    concat_ws(
      ' ',
      matched.product_name,
      matched.product_line,
      matched.flavor,
      matched.life_stage,
      matched.food_form,
      matched.package_size,
      matched.gtin,
      matched.source_url
    ) AS matched_identity,
    public.catalog_quality_state(
      matched_pd.pet_type,
      matched_pd.is_complete_food,
      matched_pd.catalog_exclusion_reason,
      matched_pd.ingredient_text,
      matched_pd.ingredient_count,
      matched_pd.ingredient_verification_status,
      matched_pd.image_url,
      matched_pd.image_verification_status,
      matched_pd.source_url,
      matched_pd.expires_at
    ) AS matched_quality_state,
    public.catalog_acquisition_verified_brand_alias_match(qs.brand, matched.brand, matched.source) AS brand_alias_guard_pass
  FROM queue_scope qs
  LEFT JOIN LATERAL public.search_verified_products(qs.search_query, ${maxResults}) AS matched
    ON TRUE
  LEFT JOIN public.product_data matched_pd
    ON matched_pd.cache_key = matched.cache_key
),
species_summary AS (
  SELECT
    id,
    count(DISTINCT matched_pet_type) FILTER (
      WHERE brand_alias_guard_pass
        AND matched_pet_type IN ('dog', 'cat')
    )::INTEGER AS same_brand_species_count
  FROM raw_matches
  GROUP BY id
),
guarded AS (
  SELECT
    rm.*,
    COALESCE(ss.same_brand_species_count, 0) AS same_brand_species_count,
    rm.matched_quality_state = 'verified_ready' AS quality_guard_pass,
    rm.matched_rank >= 5.5 AS rank_guard_pass,
    rm.matched_pet_type IN ('dog', 'cat') AS matched_species_ready,
    rm.matched_source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND rm.matched_source NOT IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr')
      AND COALESCE(NULLIF(rm.matched_source_url, ''), '') <> '' AS source_guard_pass,
    CASE
      WHEN lower(COALESCE(rm.pet_type, '')) IN ('dog', 'cat') THEN rm.pet_type = rm.matched_pet_type
      ELSE COALESCE(ss.same_brand_species_count, 0) = 1
    END AS species_guard_pass,
    public.catalog_acquisition_life_stage_terms_match(rm.product_name, rm.matched_identity) AS life_stage_guard_pass,
    public.catalog_acquisition_protected_line_terms_match(rm.product_name, rm.matched_identity) AS protected_line_guard_pass,
    public.catalog_acquisition_food_form_terms_match(rm.product_name, rm.matched_identity) AS food_form_guard_pass,
    public.catalog_acquisition_size_terms_match(rm.product_name, rm.matched_identity) AS size_guard_pass,
    public.catalog_acquisition_package_count_match(rm.product_name, rm.matched_identity) AS package_count_guard_pass,
    public.catalog_acquisition_alias_formula_terms_match(rm.product_name, rm.matched_identity) AS formula_terms_guard_pass,
    public.catalog_acquisition_identity_match(
      concat_ws(' ', rm.brand, rm.product_name),
      rm.pet_type,
      concat_ws(' ', rm.matched_brand, rm.matched_identity),
      rm.matched_pet_type
    ) AS identity_guard_pass,
    public.catalog_acquisition_strict_search_high_confidence(
      rm.matched_brand,
      rm.product_name,
      CASE
        WHEN lower(COALESCE(rm.pet_type, '')) IN ('dog', 'cat') THEN lower(rm.pet_type)
        ELSE rm.matched_pet_type
      END,
      rm.matched_brand,
      rm.matched_identity,
      rm.matched_pet_type,
      GREATEST(COALESCE(rm.matched_rank, 0), 8.0)
    ) AS strict_search_guard_pass
  FROM raw_matches rm
  LEFT JOIN species_summary ss
    ON ss.id = rm.id
),
eligible AS (
  SELECT
    guarded.*,
    (
      quality_guard_pass
      AND source_guard_pass
      AND brand_alias_guard_pass
      AND rank_guard_pass
      AND matched_species_ready
      AND species_guard_pass
      AND life_stage_guard_pass
      AND protected_line_guard_pass
      AND food_form_guard_pass
      AND size_guard_pass
      AND package_count_guard_pass
    ) AS base_guard_pass,
    (
      quality_guard_pass
      AND source_guard_pass
      AND brand_alias_guard_pass
      AND rank_guard_pass
      AND matched_species_ready
      AND species_guard_pass
      AND life_stage_guard_pass
      AND protected_line_guard_pass
      AND food_form_guard_pass
      AND size_guard_pass
      AND package_count_guard_pass
      AND formula_terms_guard_pass
    ) AS formula_alias_review_eligible,
    (
      quality_guard_pass
      AND source_guard_pass
      AND brand_alias_guard_pass
      AND rank_guard_pass
      AND matched_species_ready
      AND species_guard_pass
      AND life_stage_guard_pass
      AND protected_line_guard_pass
      AND food_form_guard_pass
      AND size_guard_pass
      AND package_count_guard_pass
      AND (identity_guard_pass OR strict_search_guard_pass)
    ) AS existing_reconcile_eligible
  FROM guarded
),
formula_summary AS (
  SELECT
    id,
    count(*) FILTER (WHERE formula_alias_review_eligible)::INTEGER AS formula_candidate_count,
    count(DISTINCT public.catalog_acquisition_identity_normalize(matched_product_name))
      FILTER (WHERE formula_alias_review_eligible)::INTEGER AS formula_candidate_identity_count,
    max(matched_rank) FILTER (WHERE formula_alias_review_eligible) AS top_formula_rank
  FROM eligible
  GROUP BY id
),
ranked AS (
  SELECT
    e.*,
    fs.formula_candidate_count,
    fs.formula_candidate_identity_count,
    fs.top_formula_rank,
    row_number() OVER (
      PARTITION BY e.id
      ORDER BY
        e.existing_reconcile_eligible DESC,
        e.formula_alias_review_eligible DESC,
        e.base_guard_pass DESC,
        e.matched_rank DESC NULLS LAST,
        e.matched_product_name
    ) AS report_rank
  FROM eligible e
  LEFT JOIN formula_summary fs
    ON fs.id = e.id
),
classified AS (
  SELECT
    ranked.*,
    CASE
      WHEN matched_cache_key IS NULL THEN 'no_verified_search_result'
      WHEN existing_reconcile_eligible THEN 'already_safe_by_existing_reconcile'
      WHEN formula_alias_review_eligible
        AND COALESCE(formula_candidate_count, 0) = 1
        THEN 'formula_alias_review_candidate'
      WHEN formula_alias_review_eligible
        AND COALESCE(formula_candidate_count, 0) > 1
        THEN 'ambiguous_formula_alias_review'
      WHEN NOT quality_guard_pass THEN 'matched_row_not_verified_ready'
      WHEN NOT source_guard_pass THEN 'matched_row_lacks_source_evidence'
      WHEN NOT brand_alias_guard_pass THEN 'brand_alias_guard_failed'
      WHEN NOT species_guard_pass THEN 'species_guard_failed'
      WHEN NOT food_form_guard_pass THEN 'food_form_guard_failed'
      WHEN NOT (life_stage_guard_pass AND protected_line_guard_pass AND size_guard_pass AND package_count_guard_pass)
        THEN 'variant_guard_failed'
      WHEN NOT formula_terms_guard_pass THEN 'formula_terms_guard_failed'
      ELSE 'needs_manual_source_review'
    END AS alias_candidate_status
  FROM ranked
  WHERE report_rank = 1
),
summary AS (
  SELECT
    alias_candidate_status,
    count(*) AS rows,
    coalesce(sum(affected_product_count), 0) AS affected_products,
    round(avg(priority_score)::numeric, 2) AS avg_priority
  FROM classified
  GROUP BY alias_candidate_status
),
samples AS (
  SELECT *
  FROM classified
  ORDER BY
    CASE alias_candidate_status
      WHEN 'already_safe_by_existing_reconcile' THEN 1
      WHEN 'formula_alias_review_candidate' THEN 2
      WHEN 'ambiguous_formula_alias_review' THEN 3
      WHEN 'food_form_guard_failed' THEN 4
      WHEN 'variant_guard_failed' THEN 5
      WHEN 'formula_terms_guard_failed' THEN 6
      WHEN 'no_verified_search_result' THEN 7
      ELSE 8
    END,
    priority_score DESC,
    affected_product_count DESC,
    product_name
  LIMIT ${sampleLimit}
)
SELECT jsonb_build_object(
  'scope', jsonb_build_object(
    'brand', ${brand ? sqlString(brand) : "null"},
    'limit', ${limit},
    'max_results', ${maxResults},
    'sample_limit', ${sampleLimit}
  ),
  'summary', COALESCE((SELECT jsonb_agg(to_jsonb(summary.*) ORDER BY rows DESC, alias_candidate_status) FROM summary), '[]'::jsonb),
  'samples', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'alias_candidate_status', alias_candidate_status,
      'brand', brand,
      'product_name', product_name,
      'pet_type', pet_type,
      'cache_key', cache_key,
      'product_source', product_source,
      'legacy_ingredient_verification_status', legacy_ingredient_verification_status,
      'legacy_image_verification_status', legacy_image_verification_status,
      'priority_score', priority_score,
      'affected_product_count', affected_product_count,
      'matched_cache_key', matched_cache_key,
      'matched_product_name', matched_product_name,
      'matched_pet_type', matched_pet_type,
      'matched_source', matched_source,
      'matched_source_quality', matched_source_quality,
      'matched_source_url', matched_source_url,
      'matched_quality_state', matched_quality_state,
      'matched_rank', matched_rank,
      'same_brand_species_count', same_brand_species_count,
      'formula_candidate_count', formula_candidate_count,
      'formula_candidate_identity_count', formula_candidate_identity_count,
      'quality_guard_pass', quality_guard_pass,
      'source_guard_pass', source_guard_pass,
      'brand_alias_guard_pass', brand_alias_guard_pass,
      'rank_guard_pass', rank_guard_pass,
      'species_guard_pass', species_guard_pass,
      'life_stage_guard_pass', life_stage_guard_pass,
      'protected_line_guard_pass', protected_line_guard_pass,
      'food_form_guard_pass', food_form_guard_pass,
      'size_guard_pass', size_guard_pass,
      'package_count_guard_pass', package_count_guard_pass,
      'formula_terms_guard_pass', formula_terms_guard_pass,
      'identity_guard_pass', identity_guard_pass,
      'strict_search_guard_pass', strict_search_guard_pass,
      'base_guard_pass', base_guard_pass,
      'formula_alias_review_eligible', formula_alias_review_eligible,
      'existing_reconcile_eligible', existing_reconcile_eligible,
      'proof_required', 'exact source-backed ingredient statement, verified front image, source URL, verified-ready matched catalog row, same-brand/alias proof, non-ambiguous species, food-form match, formula-token match, and variant guards'
    ))
    FROM samples
  ), '[]'::jsonb)
) AS retail_alias_candidate_audit;`;
}

export function buildClassifiedSql({ brand, limit, maxResults }) {
  const auditSql = buildSql({
    brand,
    limit,
    maxResults,
    sampleLimit: 1,
  });
  const classifiedEndMarker = "\n),\nsummary AS (";
  const classifiedEnd = auditSql.indexOf(classifiedEndMarker);
  if (classifiedEnd === -1) {
    throw new Error("Unable to locate classified CTE in retail alias candidate SQL.");
  }
  return `${auditSql.slice(0, classifiedEnd)}\n)`;
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-retail-alias-candidate-sql.mjs [--brand <brand>] [--limit 25]",
      "",
      "Prints a read-only Supabase SQL audit for no-source retail/community",
      "product gaps that might alias to a verified-ready official catalog row.",
      "The query never promotes ingredients and never updates rows.",
      "",
      "Options:",
      "  --brand <brand>        Restrict audit to one brand.",
      "  --limit <n>            Queue rows to inspect. Default: 25.",
      "  --max-results <n>      search_verified_products result count. Default: 12.",
      "  --sample-limit <n>     Returned sample rows. Default: 25.",
    ].join("\n"));
    return;
  }

  const brand = compact(getArg("--brand"));
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  const maxResults = positiveInteger(getArg("--max-results"), DEFAULT_MAX_RESULTS);
  const sampleLimit = positiveInteger(getArg("--sample-limit"), DEFAULT_SAMPLE_LIMIT);

  console.log(buildSql({ brand, limit, maxResults, sampleLimit }));
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
