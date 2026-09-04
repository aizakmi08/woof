const DEFAULT_LIMIT = 100;
const VERIFIED_INGREDIENT_STATUSES = [
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
];

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

function candidateCte({ limit }) {
  const verifiedList = VERIFIED_INGREDIENT_STATUSES.map((status) => `'${status}'`).join(", ");
  return `candidate_rows AS (
  SELECT
    q.id AS queue_id,
    q.cache_key,
    q.brand,
    q.product_name,
    q.pet_type,
    q.product_source,
    q.priority_score,
    pd.source AS product_source_table,
    pd.source_url AS product_source_url,
    pd.ingredient_verification_status,
    pd.image_verification_status,
    CASE
      WHEN lower(concat_ws(' ', q.brand, q.product_name)) ~ '\\m(dinde|poulet|bœuf|boeuf|volaille|saumon|agneau|lapin|haricots|émincés|mincés|hypoallergénique|hypoallergnique|croquettes|chien|avec|jambon|mijoté|mijot|perruches|perroquets|pollo|tacchino|ricco|pferd|süsskartoffel|ssskartoffel|pastinake|kylling|våtfôr|vtfr)\\M'
        THEN 'non_english_or_non_us_title'
      WHEN lower(concat_ws(' ', q.brand, q.product_name)) ~ '\\m(unknown|unable to determine|not clearly|brand logo|visible)\\M'
        THEN 'ocr_unclear_identity'
      ELSE 'review'
    END AS cleanup_class
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data pd ON pd.cache_key = q.cache_key
  WHERE q.status = 'open'
    AND q.gap_type = 'product'
    AND COALESCE(q.product_source, pd.source) IN ('opff', 'community', 'user_ocr')
    AND pd.catalog_exclusion_reason IS NULL
    AND COALESCE(pd.ingredient_verification_status, 'unverified') NOT IN (${verifiedList})
    AND COALESCE(NULLIF(q.source_url, ''), NULLIF(pd.source_url, '')) IS NULL
  ORDER BY q.priority_score DESC, q.updated_at DESC, q.brand, q.product_name
  LIMIT ${limit}
),
safe_candidates AS (
  SELECT *
  FROM candidate_rows
  WHERE cleanup_class IN ('non_english_or_non_us_title', 'ocr_unclear_identity')
)`;
}

function auditSql({ limit }) {
  return `-- Read-only audit for community/OPFF queue rows that should not drive US catalog coverage.
-- This intentionally does not close valid US private-label rows that merely lack source-backed evidence.
WITH ${candidateCte({ limit })},
summary AS (
  SELECT cleanup_class, count(*) AS rows
  FROM candidate_rows
  GROUP BY cleanup_class
),
safe_summary AS (
  SELECT cleanup_class, count(*) AS rows
  FROM safe_candidates
  GROUP BY cleanup_class
)
SELECT jsonb_build_object(
  'candidate_limit', ${limit},
  'summary', COALESCE((SELECT jsonb_agg(to_jsonb(summary.*) ORDER BY rows DESC, cleanup_class) FROM summary), '[]'::jsonb),
  'safe_summary', COALESCE((SELECT jsonb_agg(to_jsonb(safe_summary.*) ORDER BY rows DESC, cleanup_class) FROM safe_summary), '[]'::jsonb),
  'safe_samples', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'cleanup_class', cleanup_class,
      'brand', brand,
      'product_name', product_name,
      'pet_type', pet_type,
      'cache_key', cache_key,
      'ingredient_status', ingredient_verification_status,
      'image_status', image_verification_status
    ) ORDER BY cleanup_class, priority_score DESC, brand, product_name)
    FROM safe_candidates
  ), '[]'::jsonb)
) AS community_noise_cleanup_audit;`;
}

function cleanupSql({ limit }) {
  return `-- Bounded cleanup for non-US or unclear community rows.
-- Only excludes rows with no source URL and no verified ingredient status.
WITH ${candidateCte({ limit })},
excluded_products AS (
  UPDATE public.product_data pd
  SET
    catalog_exclusion_reason = COALESCE(NULLIF(pd.catalog_exclusion_reason, ''), 'non_us_or_unclear_community_catalog_row'),
    updated_at = now()
  FROM safe_candidates sc
  WHERE pd.cache_key = sc.cache_key
    AND pd.catalog_exclusion_reason IS NULL
  RETURNING
    pd.cache_key,
    sc.queue_id,
    sc.cleanup_class,
    sc.brand,
    sc.product_name
),
resolved_queue AS (
  UPDATE public.catalog_acquisition_queue q
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'excluded non-US or unclear community catalog row from US verified catalog coverage',
    updated_at = now(),
    sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'closed_by', 'catalog-community-noise-cleanup-sql',
        'cleanup_class', ep.cleanup_class,
        'closed_at', now()
      )
  FROM excluded_products ep
  WHERE q.id = ep.queue_id
  RETURNING q.id
),
rejected_evidence AS (
  UPDATE public.catalog_product_evidence e
  SET
    review_state = 'rejected',
    rejection_reason = COALESCE(NULLIF(e.rejection_reason, ''), 'non_us_or_unclear_community_catalog_row'),
    evidence = COALESCE(e.evidence, '{}'::jsonb)
      || jsonb_build_object(
        'rejected_by', 'catalog-community-noise-cleanup-sql',
        'rejected_at', now()
      ),
    updated_at = now()
  FROM excluded_products ep
  WHERE e.cache_key = ep.cache_key
  RETURNING e.id
)
SELECT jsonb_build_object(
  'candidate_limit', ${limit},
  'excluded_product_rows', (SELECT count(*) FROM excluded_products),
  'resolved_queue_rows', (SELECT count(*) FROM resolved_queue),
  'rejected_evidence_rows', (SELECT count(*) FROM rejected_evidence),
  'by_cleanup_class', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('cleanup_class', cleanup_class, 'rows', rows) ORDER BY rows DESC, cleanup_class)
    FROM (
      SELECT cleanup_class, count(*) AS rows
      FROM excluded_products
      GROUP BY cleanup_class
    ) s
  ), '[]'::jsonb),
  'samples', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'cleanup_class', cleanup_class,
      'brand', brand,
      'product_name', product_name,
      'cache_key', cache_key
    ) ORDER BY cleanup_class, brand, product_name)
    FROM excluded_products
  ), '[]'::jsonb)
) AS community_noise_cleanup_result;`;
}

async function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-community-noise-cleanup-sql.mjs [--mode audit|cleanup] [--limit 100]",
      "",
      "Audits or closes non-US/unclear community catalog rows so they do not count as US pet-food coverage gaps.",
      "The cleanup path excludes only no-source community rows classified as non-English/non-US titles or unclear OCR identities.",
    ].join("\n"));
    return;
  }

  const mode = compact(getArg("--mode", "audit"));
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  if (!["audit", "cleanup"].includes(mode)) {
    throw new Error("Unsupported --mode. Use audit or cleanup.");
  }
  const sql = mode === "cleanup" ? cleanupSql({ limit }) : auditSql({ limit });

  console.log(sql);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
