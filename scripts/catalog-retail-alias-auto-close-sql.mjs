import fs from "node:fs";
import path from "node:path";
import { buildClassifiedSql } from "./catalog-retail-alias-candidate-sql.mjs";

const DEFAULT_OUTPUT_DIR = "outputs/catalog-retail-alias-auto-close/current";
const DEFAULT_LIMIT = 25;
const DEFAULT_MAX_RESULTS = 12;
const DEFAULT_MIN_RANK = 8.5;

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

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function slug(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "all-brands";
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function buildAutoCloseSql({ brand, limit, maxResults, minRank, apply }) {
  const classifiedSql = buildClassifiedSql({
    brand,
    limit,
    maxResults,
  }).trim().replace(/;$/, "");
  const updateSql = apply ? `
, excluded_legacy_rows AS (
  UPDATE public.product_data legacy
  SET
    catalog_exclusion_reason = COALESCE(NULLIF(legacy.catalog_exclusion_reason, ''), 'duplicate_verified_official_catalog_row'),
    updated_at = now()
  FROM validated_auto_aliases va
  WHERE legacy.cache_key = va.legacy_cache_key
    AND legacy.catalog_exclusion_reason IS NULL
  RETURNING legacy.cache_key
),
resolved_queue_rows AS (
  UPDATE public.catalog_acquisition_queue q
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'auto-closed strict formula alias to verified source-backed catalog row',
    updated_at = now(),
    sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'retail_alias_auto_closed_at', now(),
        'retail_alias_auto_closed_by', 'catalog-retail-alias-auto-close-sql',
        'matched_cache_key', va.matched_cache_key,
        'matched_product_name', va.matched_product_name,
        'matched_brand', va.matched_brand,
        'matched_pet_type', va.matched_pet_type,
        'matched_source', va.matched_source,
        'matched_source_quality', va.matched_source_quality,
        'matched_source_url', va.matched_source_url,
        'matched_rank', va.matched_rank,
        'auto_close_min_rank', va.min_rank,
        'auto_close_guard', 'single_formula_alias_candidate_verified_ready_source_backed'
      )
  FROM validated_auto_aliases va
  WHERE q.id = va.queue_id
  RETURNING q.id
)` : "";
  const applyCounts = apply ? `,
  'excluded_legacy_rows', (SELECT count(*) FROM excluded_legacy_rows),
  'resolved_queue_rows', (SELECT count(*) FROM resolved_queue_rows)` : "";

  return `${apply ? "BEGIN;\n\n" : ""}-- ${apply ? "Apply" : "Dry-run"} strict retail/community formula alias closures.
-- This SQL never imports ingredients from retail/community rows.
-- It only closes no-source queue gaps when exactly one same-brand verified-ready
-- source-backed catalog row survives species, food-form, formula-token, size,
-- package-count, source, and rank guards.
${classifiedSql}
,
strict_auto_candidates AS (
  SELECT
    id AS queue_id,
    brand AS queue_brand,
    product_name AS queue_product_name,
    pet_type AS queue_pet_type,
    product_source AS queue_product_source,
    cache_key AS legacy_cache_key,
    matched_cache_key,
    matched_rank,
    ${minRank}::numeric AS min_rank
  FROM classified
  WHERE alias_candidate_status = 'formula_alias_review_candidate'
    AND COALESCE(formula_alias_review_eligible, false) IS TRUE
    AND COALESCE(quality_guard_pass, false) IS TRUE
    AND COALESCE(source_guard_pass, false) IS TRUE
    AND COALESCE(brand_alias_guard_pass, false) IS TRUE
    AND COALESCE(rank_guard_pass, false) IS TRUE
    AND COALESCE(species_guard_pass, false) IS TRUE
    AND COALESCE(life_stage_guard_pass, false) IS TRUE
    AND COALESCE(protected_line_guard_pass, false) IS TRUE
    AND COALESCE(food_form_guard_pass, false) IS TRUE
    AND COALESCE(size_guard_pass, false) IS TRUE
    AND COALESCE(package_count_guard_pass, false) IS TRUE
    AND COALESCE(formula_terms_guard_pass, false) IS TRUE
    AND COALESCE(formula_candidate_count, 0) = 1
    AND COALESCE(formula_candidate_identity_count, 0) = 1
    AND matched_rank >= ${minRank}
),
validated_auto_aliases AS (
  SELECT DISTINCT
    q.id AS queue_id,
    q.cache_key AS legacy_cache_key,
    q.brand AS queue_brand,
    q.product_name AS queue_product_name,
    q.pet_type AS queue_pet_type,
    q.product_source AS queue_product_source,
    sac.matched_rank,
    sac.min_rank,
    matched.cache_key AS matched_cache_key,
    matched.product_name AS matched_product_name,
    matched.brand AS matched_brand,
    matched.pet_type AS matched_pet_type,
    matched.source AS matched_source,
    matched.source_quality AS matched_source_quality,
    matched.source_url AS matched_source_url
  FROM strict_auto_candidates sac
  JOIN public.catalog_acquisition_queue q
    ON q.id = sac.queue_id
   AND q.cache_key = sac.legacy_cache_key
   AND lower(trim(q.brand)) = lower(trim(sac.queue_brand))
   AND lower(trim(q.product_name)) = lower(trim(sac.queue_product_name))
  JOIN public.product_data legacy
    ON legacy.cache_key = q.cache_key
  JOIN public.product_data matched
    ON matched.cache_key = sac.matched_cache_key
  WHERE q.gap_type = 'product'
    AND q.status IN ('open', 'in_progress')
    AND q.product_source IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr', 'brand')
    AND legacy.catalog_exclusion_reason IS NULL
    AND COALESCE(NULLIF(q.source_url, ''), NULLIF(legacy.source_url, '')) IS NULL
    AND COALESCE(legacy.ingredient_verification_status, 'unverified') NOT IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )
    AND public.catalog_quality_state(
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
    ) = 'verified_ready'
    AND matched.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
    AND matched.source NOT IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr')
    AND COALESCE(NULLIF(matched.source_url, ''), '') <> ''
    AND public.catalog_acquisition_verified_brand_alias_match(q.brand, matched.brand, matched.source)
    AND (
      lower(COALESCE(q.pet_type, '')) NOT IN ('dog', 'cat')
      OR lower(q.pet_type) = lower(matched.pet_type)
    )
)${updateSql}
SELECT jsonb_build_object(
  'mode', ${sqlString(apply ? "apply" : "dry_run")},
  'brand', ${brand ? sqlString(brand) : "null"},
  'limit', ${limit},
  'max_results', ${maxResults},
  'min_rank', ${minRank},
  'candidate_rows', (SELECT count(*) FROM strict_auto_candidates),
  'validated_rows', (SELECT count(*) FROM validated_auto_aliases),
  'invalid_or_stale_rows', (SELECT count(*) FROM strict_auto_candidates) - (SELECT count(*) FROM validated_auto_aliases)${applyCounts},
  'sample_validated_rows', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'queue_brand', queue_brand,
      'queue_product_name', queue_product_name,
      'queue_pet_type', queue_pet_type,
      'queue_product_source', queue_product_source,
      'matched_cache_key', matched_cache_key,
      'matched_product_name', matched_product_name,
      'matched_pet_type', matched_pet_type,
      'matched_source', matched_source,
      'matched_source_url', matched_source_url,
      'matched_rank', matched_rank
    ) ORDER BY matched_rank DESC, queue_product_name)
    FROM (
      SELECT *
      FROM validated_auto_aliases
      ORDER BY matched_rank DESC, queue_product_name
      LIMIT 25
    ) sample_rows
  ), '[]'::jsonb)
) AS retail_alias_auto_close_result;
${apply ? "\nCOMMIT;\n" : ""}`;
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-retail-alias-auto-close-sql.mjs [--brand <brand>] [--apply]",
      "",
      "Builds guarded SQL for strict retail/community alias queue closures.",
      "Default mode is dry-run. It never imports retail/community ingredients.",
      "",
      "Options:",
      "  --brand <brand>        Optional brand filter.",
      "  --limit <n>            Queue rows to inspect per batch. Default: 25.",
      "  --max-results <n>      search_verified_products result count. Default: 12.",
      "  --min-rank <n>         Required verified search rank. Default: 8.5.",
      "  --apply                Emit applying SQL instead of dry-run SQL.",
      "  --output-dir <dir>     Default: outputs/catalog-retail-alias-auto-close/current.",
      "  --output <path>        Write SQL to an explicit file.",
      "  --stdout               Print SQL instead of writing a file.",
    ].join("\n"));
    return;
  }

  const brand = compact(getArg("--brand"));
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  const maxResults = positiveInteger(getArg("--max-results"), DEFAULT_MAX_RESULTS);
  const minRank = positiveNumber(getArg("--min-rank"), DEFAULT_MIN_RANK);
  const apply = hasArg("--apply");
  const sql = buildAutoCloseSql({ brand, limit, maxResults, minRank, apply });

  if (hasArg("--stdout")) {
    console.log(sql);
    return;
  }

  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const outputPath = compact(getArg("--output")) || path.join(
    outputDir,
    `${slug(brand)}-retail-alias-auto-close-${apply ? "apply" : "dry-run"}.sql`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${sql.trim()}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    output_path: outputPath,
    mode: apply ? "apply" : "dry_run",
    brand: brand || null,
    limit,
    max_results: maxResults,
    min_rank: minRank,
  }, null, 2));
}

main();
