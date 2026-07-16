const DEFAULT_SAMPLE_LIMIT = 50;
const DEFAULT_DUPLICATE_CLOSER = "exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand";
const AUTOMATED_DUPLICATE_CLOSERS = [
  DEFAULT_DUPLICATE_CLOSER,
  "exclude_verified_duplicate_legacy_catalog_rows_for_brand",
  "exclude_unknown_species_legacy_duplicate_rows_for_brand",
  "exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand",
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) {
      values.push(value);
      index += 1;
    }
  }
  return values;
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

function sqlString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function buildBrandFilter(brands) {
  const values = brands.map(compact).filter(Boolean);
  if (values.length === 0) return "";
  return `\n    AND lower(trim(q.brand)) IN (${values.map((brand) => `lower(${sqlString(brand)})`).join(", ")})`;
}

function uniqueValues(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(compact).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function selectedClosers() {
  const explicitClosers = getArgs("--closure");
  let closers = explicitClosers.length > 0
    ? explicitClosers
    : [DEFAULT_DUPLICATE_CLOSER];
  if (hasArg("--all-automated-closures")) {
    closers = AUTOMATED_DUPLICATE_CLOSERS;
  }
  if (hasArg("--include-manual-closures")) {
    closers = [
      ...closers,
      "fix_royal_canin_medium_adult_duplicate",
    ];
  }
  return uniqueValues(closers);
}

function buildCloserFilter(closers) {
  if (closers.length === 0) {
    throw new Error("At least one duplicate closure function is required.");
  }
  return `\n    AND q.sample_metadata->>'duplicate_closed_by' IN (${closers.map(sqlString).join(", ")})`;
}

function buildSql({ brands, closers, sampleLimit }) {
  return `-- Read-only audit for direct verified-identity duplicate closures.
-- It verifies that duplicate cleanup did not promote unverified legacy rows and
-- did not close life-stage, line, food-form, size/breed, or package-count mismatches.
WITH direct_closed AS (
  SELECT
    q.id,
    q.brand,
    q.product_name,
    q.pet_type,
    q.cache_key AS legacy_cache_key,
    q.sample_metadata->>'duplicate_closed_by' AS duplicate_closed_by,
    q.sample_metadata->>'matched_cache_key' AS matched_cache_key,
    q.sample_metadata->>'matched_product_name' AS recorded_matched_product_name,
    q.sample_metadata->>'matched_source_url' AS recorded_matched_source_url,
    q.sample_metadata->>'duplicate_closed_at' AS duplicate_closed_at
  FROM public.catalog_acquisition_queue q
  WHERE q.status = 'resolved'
    AND q.sample_metadata ? 'duplicate_closed_by'${buildCloserFilter(closers)}${buildBrandFilter(brands)}
),
checked AS (
  SELECT
    dc.*,
    legacy.catalog_exclusion_reason AS legacy_exclusion_reason,
    legacy.ingredient_verification_status AS legacy_ingredient_status,
    matched.product_name AS matched_product_name,
    matched.brand AS matched_brand,
    matched.source AS matched_source,
    matched.source_quality AS matched_source_quality,
    matched.source_url AS matched_source_url,
    public.catalog_quality_state(
      matched.pet_type,
      matched.is_complete_food,
      matched.catalog_exclusion_reason,
      matched.ingredient_text,
      matched.ingredient_count,
      matched.ingredient_verification_status,
      matched.image_url,
      matched.image_verification_status,
      matched.source_url,
      matched.expires_at
    ) AS matched_quality_state,
    public.catalog_acquisition_life_stage_terms_match(
      dc.product_name,
      concat_ws(' ', matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS life_stage_ok,
    public.catalog_acquisition_protected_line_terms_match(
      dc.product_name,
      concat_ws(' ', matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS line_ok,
    public.catalog_acquisition_food_form_terms_match(
      dc.product_name,
      concat_ws(' ', matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS food_form_ok,
    public.catalog_acquisition_size_terms_match(
      dc.product_name,
      concat_ws(' ', matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS size_ok,
    public.catalog_acquisition_package_count_match(
      dc.product_name,
      concat_ws(' ', matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS package_count_ok
  FROM direct_closed dc
  LEFT JOIN public.product_data legacy ON legacy.cache_key = dc.legacy_cache_key
  LEFT JOIN public.product_data matched ON matched.cache_key = dc.matched_cache_key
),
all_failures AS (
  SELECT *
  FROM checked
  WHERE legacy_exclusion_reason IS DISTINCT FROM 'duplicate_verified_official_catalog_row'
    OR matched_quality_state IS DISTINCT FROM 'verified_ready'
    OR legacy_ingredient_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
    OR life_stage_ok IS NOT TRUE
    OR line_ok IS NOT TRUE
    OR food_form_ok IS NOT TRUE
    OR size_ok IS NOT TRUE
    OR package_count_ok IS NOT TRUE
),
sample_failures AS (
  SELECT *
  FROM all_failures
  ORDER BY brand, product_name
  LIMIT ${sampleLimit}
),
closure_counts AS (
  SELECT
    duplicate_closed_by,
    count(*) AS rows
  FROM checked
  GROUP BY duplicate_closed_by
)
SELECT jsonb_build_object(
  'scope', jsonb_build_object(
    'brands', ${brands.length > 0 ? `jsonb_build_array(${brands.map(sqlString).join(", ")})` : "to_jsonb('all'::text)"},
    'closures', jsonb_build_array(${closers.map(sqlString).join(", ")}),
    'sample_limit', ${sampleLimit}
  ),
  'summary', jsonb_build_object(
    'active_direct_closed_rows', (SELECT count(*) FROM checked),
    'legacy_excluded_rows', (SELECT count(*) FROM checked WHERE legacy_exclusion_reason = 'duplicate_verified_official_catalog_row'),
    'matched_verified_ready_rows', (SELECT count(*) FROM checked WHERE matched_quality_state = 'verified_ready'),
    'wrongly_promoted_legacy_rows', (
      SELECT count(*) FROM checked
      WHERE legacy_ingredient_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
    ),
    'life_stage_mismatch_rows', (SELECT count(*) FROM checked WHERE life_stage_ok IS NOT TRUE),
    'line_mismatch_rows', (SELECT count(*) FROM checked WHERE line_ok IS NOT TRUE),
    'food_form_mismatch_rows', (SELECT count(*) FROM checked WHERE food_form_ok IS NOT TRUE),
    'size_mismatch_rows', (SELECT count(*) FROM checked WHERE size_ok IS NOT TRUE),
    'package_count_mismatch_rows', (SELECT count(*) FROM checked WHERE package_count_ok IS NOT TRUE),
    'failure_rows', (SELECT count(*) FROM all_failures),
    'sampled_failure_rows', (SELECT count(*) FROM sample_failures)
  ),
  'closure_counts', COALESCE((
    SELECT jsonb_agg(to_jsonb(closure_counts.*) ORDER BY rows DESC, duplicate_closed_by)
    FROM closure_counts
  ), '[]'::jsonb),
  'failures', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'duplicate_closed_by', duplicate_closed_by,
      'brand', brand,
      'legacy_product_name', product_name,
      'legacy_cache_key', legacy_cache_key,
      'legacy_exclusion_reason', legacy_exclusion_reason,
      'legacy_ingredient_status', legacy_ingredient_status,
      'matched_product_name', matched_product_name,
      'matched_source', matched_source,
      'matched_source_url', matched_source_url,
      'matched_quality_state', matched_quality_state,
      'life_stage_ok', life_stage_ok,
      'line_ok', line_ok,
      'food_form_ok', food_form_ok,
      'size_ok', size_ok,
      'package_count_ok', package_count_ok
    ))
    FROM sample_failures
  ), '[]'::jsonb)
) AS direct_duplicate_audit;`;
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-direct-duplicate-audit-sql.mjs [--brand <brand>] [--all-automated-closures] [--sample-limit 50]",
      "",
      "Prints a read-only Supabase SQL audit for direct verified-identity duplicate closures.",
      "Use after catalog:verified-duplicate-sweep identity runs.",
      "",
      "Options:",
      "  --closure <function>          Repeatable. Audit a specific duplicate closer.",
      "  --all-automated-closures     Audit direct, strict-search, unknown-species, and alias duplicate closers.",
      "  --include-manual-closures    Include one-off manual duplicate closure markers.",
    ].join("\n"));
    return;
  }

  const brands = getArgs("--brand");
  const closers = selectedClosers();
  const sampleLimit = positiveInteger(getArg("--sample-limit"), DEFAULT_SAMPLE_LIMIT);
  console.log(buildSql({ brands, closers, sampleLimit }));
}

main();
