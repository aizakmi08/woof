import fs from "node:fs";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_LIMIT = 25;
const DEFAULT_MAX_RESULTS = 8;
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

function buildSql({ brand, limit, maxResults, sampleLimit }) {
  const brandFilter = brand
    ? `\n    AND lower(trim(q.brand)) = lower(${sqlString(brand)})`
    : "";

  return `${brand ? targetComment(brand) : "-- All brands"}
-- Dry-run acquisition audit. This query does not update rows.
WITH queue_scope AS (
  SELECT
    q.id,
    q.brand,
    q.product_name,
    q.pet_type,
    q.priority_score,
    q.affected_product_count,
    q.needs_verified_ingredients,
    q.needs_verified_image,
    q.needs_pet_type,
    q.cache_key,
    q.product_source,
    q.source_url AS queue_source_url,
    pd.source_url AS legacy_source_url,
    pd.ingredient_verification_status AS legacy_ingredient_verification_status,
    pd.image_verification_status AS legacy_image_verification_status,
    pd.catalog_exclusion_reason AS legacy_catalog_exclusion_reason,
    concat_ws(' ', q.brand, q.product_name) AS search_query
  FROM public.catalog_acquisition_queue q
  LEFT JOIN public.product_data pd
    ON pd.cache_key = q.cache_key
  WHERE q.gap_type = 'product'
    AND q.status IN ('open', 'in_progress', 'imported')
    AND q.brand IS NOT NULL
    AND q.product_name IS NOT NULL${brandFilter}
  ORDER BY
    q.priority_score DESC,
    public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
    q.updated_at DESC
  LIMIT ${limit}
),
verified_matches AS (
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
    lower(trim(matched.brand)) = lower(trim(qs.brand)) AS brand_match,
    public.catalog_acquisition_identity_match(
      concat_ws(' ', qs.brand, qs.product_name),
      qs.pet_type,
      concat_ws(
        ' ',
        matched.brand,
        matched.product_name,
        matched.product_line,
        matched.flavor,
        matched.life_stage,
        matched.food_form,
        matched.package_size,
        matched.gtin
      ),
      matched.pet_type
    ) AS identity_match,
    public.catalog_acquisition_strict_search_high_confidence(
      qs.brand,
      qs.product_name,
      qs.pet_type,
      matched.brand,
      concat_ws(
        ' ',
        matched.product_name,
        matched.product_line,
        matched.flavor,
        matched.life_stage,
        matched.food_form,
        matched.package_size,
        matched.gtin
      ),
      matched.pet_type,
      matched.rank
    ) AS high_confidence_match,
    public.catalog_acquisition_food_form_terms_match(
      qs.product_name,
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
      )
    ) AS food_form_match,
    row_number() OVER (PARTITION BY qs.id ORDER BY matched.rank DESC NULLS LAST) AS match_rank
  FROM queue_scope qs
  LEFT JOIN LATERAL public.search_verified_products(qs.search_query, ${maxResults}) AS matched ON TRUE
  LEFT JOIN public.product_data matched_pd
    ON matched_pd.cache_key = matched.cache_key
),
per_queue AS (
  SELECT
    qs.id,
    qs.brand,
    qs.product_name,
    qs.pet_type,
    qs.priority_score,
    qs.affected_product_count,
    qs.needs_verified_ingredients,
    qs.needs_verified_image,
    qs.needs_pet_type,
    qs.cache_key,
    qs.product_source,
    qs.queue_source_url,
    qs.legacy_source_url,
    qs.legacy_ingredient_verification_status,
    qs.legacy_image_verification_status,
    qs.legacy_catalog_exclusion_reason,
    qs.search_query,
    lower(qs.search_query) ~ '\\m(dog|dogs|puppy|puppies|canine|cat|cats|kitten|kittens|feline)\\M' AS query_has_species,
    count(vm.matched_cache_key) AS match_count,
    count(vm.matched_cache_key) FILTER (WHERE vm.brand_match) AS same_brand_match_count,
    count(vm.matched_cache_key) FILTER (
      WHERE vm.brand_match
        AND vm.matched_quality_state = 'verified_ready'
        AND vm.matched_source_url IS NOT NULL
        AND vm.food_form_match
        AND (vm.identity_match OR vm.high_confidence_match)
    ) AS safe_match_count,
    count(DISTINCT vm.matched_pet_type) FILTER (
      WHERE vm.brand_match
        AND vm.matched_quality_state = 'verified_ready'
        AND vm.matched_source_url IS NOT NULL
        AND vm.food_form_match
        AND (vm.identity_match OR vm.high_confidence_match)
    ) AS safe_match_species_count,
    count(DISTINCT vm.matched_pet_type) FILTER (WHERE vm.brand_match) AS same_brand_species_count
  FROM queue_scope qs
  LEFT JOIN verified_matches vm ON vm.id = qs.id
  GROUP BY
    qs.id,
    qs.brand,
    qs.product_name,
    qs.pet_type,
    qs.priority_score,
    qs.affected_product_count,
    qs.needs_verified_ingredients,
    qs.needs_verified_image,
    qs.needs_pet_type,
    qs.cache_key,
    qs.product_source,
    qs.queue_source_url,
    qs.legacy_source_url,
    qs.legacy_ingredient_verification_status,
    qs.legacy_image_verification_status,
    qs.legacy_catalog_exclusion_reason,
    qs.search_query
),
top_match AS (
  SELECT *
  FROM verified_matches
  WHERE match_rank = 1
),
classified AS (
  SELECT
    pq.*,
    tm.matched_cache_key,
    tm.matched_product_name,
    tm.matched_brand,
    tm.matched_pet_type,
    tm.matched_source,
    tm.matched_source_quality,
    tm.matched_source_url,
    tm.matched_quality_state,
    tm.matched_rank,
    tm.identity_match,
    tm.high_confidence_match,
    tm.food_form_match,
    CASE
      WHEN pq.safe_match_count > 0
        AND pq.safe_match_species_count > 1
        AND NOT pq.query_has_species
        THEN 'ambiguous_species_safe_matches'
      WHEN pq.safe_match_count > 0
        THEN 'safe_reconcile_candidate'
      WHEN COALESCE(NULLIF(pq.queue_source_url, ''), NULLIF(pq.legacy_source_url, '')) IS NULL
        AND pq.product_source IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr', 'brand')
        AND pq.same_brand_match_count > 0
        THEN 'retail_or_community_alias_review'
      WHEN pq.match_count = 0
        THEN 'no_verified_search_result'
      WHEN pq.same_brand_match_count > 0
        AND pq.same_brand_species_count > 1
        AND NOT pq.query_has_species
        THEN 'ambiguous_species'
      WHEN pq.same_brand_match_count > 0
        THEN 'needs_alias_rule_or_source_data'
      ELSE 'no_same_brand_verified_match'
    END AS audit_status
  FROM per_queue pq
  LEFT JOIN top_match tm ON tm.id = pq.id
),
summary AS (
  SELECT
    audit_status,
    count(*) AS rows,
    coalesce(sum(affected_product_count), 0) AS affected_products,
    round(avg(priority_score)::numeric, 2) AS avg_priority
  FROM classified
  GROUP BY audit_status
),
samples AS (
  SELECT *
  FROM classified
  ORDER BY
    CASE audit_status
      WHEN 'safe_reconcile_candidate' THEN 1
      WHEN 'ambiguous_species_safe_matches' THEN 2
      WHEN 'needs_alias_rule_or_source_data' THEN 3
      WHEN 'ambiguous_species' THEN 4
      WHEN 'no_verified_search_result' THEN 5
      ELSE 6
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
  'summary', COALESCE((SELECT jsonb_agg(to_jsonb(summary.*) ORDER BY rows DESC, audit_status) FROM summary), '[]'::jsonb),
  'samples', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'audit_status', audit_status,
      'brand', brand,
      'product_name', product_name,
      'pet_type', pet_type,
      'query_has_species', query_has_species,
      'cache_key', cache_key,
      'product_source', product_source,
      'queue_source_url', queue_source_url,
      'legacy_source_url', legacy_source_url,
      'legacy_ingredient_verification_status', legacy_ingredient_verification_status,
      'legacy_image_verification_status', legacy_image_verification_status,
      'legacy_catalog_exclusion_reason', legacy_catalog_exclusion_reason,
      'priority_score', priority_score,
      'affected_product_count', affected_product_count,
      'match_count', match_count,
      'same_brand_match_count', same_brand_match_count,
      'safe_match_count', safe_match_count,
      'matched_product_name', matched_product_name,
      'matched_pet_type', matched_pet_type,
      'matched_source', matched_source,
      'matched_source_quality', matched_source_quality,
      'matched_source_url', matched_source_url,
      'matched_quality_state', matched_quality_state,
      'matched_rank', matched_rank,
      'identity_match', identity_match,
      'high_confidence_match', high_confidence_match,
      'food_form_match', food_form_match,
      'proof_required', 'exact source-backed ingredient statement, verified front image, source URL, verified-ready matched catalog row, non-ambiguous species, food-form match, and variant'
    ))
    FROM samples
  ), '[]'::jsonb)
) AS acquisition_match_audit;`;
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-acquisition-match-audit-sql.mjs [--brand <brand>] [--limit 25]",
      "",
      "Prints a read-only Supabase SQL audit for open acquisition product gaps.",
      "The query classifies rows as safe reconcile candidates, ambiguous species,",
      "alias/source-data candidates, or true missing verified-search results.",
      "",
      "Options:",
      "  --brand <brand>        Restrict audit to one brand.",
      "  --limit <n>            Queue rows to inspect. Default: 25.",
      "  --max-results <n>      search_verified_products result count. Default: 8.",
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

main();
