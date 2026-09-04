-- Keep nine reviewed exact manufacturer rows from Wave Y and retire older
-- incomplete aliases sharing those PDPs. Preserve shelf-facing brands such as
-- Ancestry rather than flattening them into the parent manufacturer.

DO $$
DECLARE
  ready_count INTEGER;
  brand_count INTEGER;
  unknown_life_stage_count INTEGER;
BEGIN
  SELECT
    count(*),
    count(DISTINCT brand),
    count(*) FILTER (WHERE life_stage IS NULL)
  INTO ready_count, brand_count, unknown_life_stage_count
  FROM public.product_data
  WHERE cache_key LIKE 'multibrand-reviewed-wave-y-20260725:%'
    AND brand IN ('Bil-Jac', 'Blackwood', 'Ancestry', 'Health Extension', 'Jinx', 'Nutrish')
    AND pet_type IN ('dog', 'cat')
    AND food_form IN ('dry', 'wet', 'fresh')
    AND package_size IS NOT NULL
    AND catalog_exclusion_reason IS NULL
    AND public.catalog_quality_state(
      pet_type,
      is_complete_food,
      catalog_exclusion_reason,
      ingredient_text,
      COALESCE(array_length(ingredients, 1), 0),
      ingredient_verification_status,
      image_url,
      image_verification_status,
      source_url,
      expires_at
    ) = 'verified_ready';

  IF ready_count <> 9 OR brand_count <> 6 OR unknown_life_stage_count <> 1 THEN
    RAISE EXCEPTION 'expected 9 Wave Y rows across 6 brands with 1 explicit unknown life stage, found % / % / %',
      ready_count, brand_count, unknown_life_stage_count;
  END IF;
END $$;

WITH canonical AS (
  SELECT cache_key, source_url
  FROM public.product_data
  WHERE cache_key LIKE 'multibrand-reviewed-wave-y-20260725:%'
    AND catalog_exclusion_reason IS NULL
),
pairs AS (
  SELECT
    legacy.cache_key AS legacy_cache_key,
    canonical.cache_key AS canonical_cache_key
  FROM public.product_data legacy
  JOIN canonical USING (source_url)
  WHERE legacy.cache_key NOT LIKE 'multibrand-reviewed-wave-y-20260725:%'
    AND legacy.catalog_exclusion_reason IS NULL
),
excluded AS (
  UPDATE public.product_data legacy
  SET
    catalog_exclusion_reason = 'duplicate_verified_official_catalog_row',
    updated_at = now()
  FROM pairs
  WHERE legacy.cache_key = pairs.legacy_cache_key
  RETURNING legacy.cache_key
)
UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(NULLIF(evidence.rejection_reason, ''), 'duplicate_verified_official_catalog_row'),
  evidence = COALESCE(evidence.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by', '20260725140000_reconcile_multibrand_wave_y_aliases',
      'canonical_cache_key', pairs.canonical_cache_key
    ),
  updated_at = now()
FROM pairs
WHERE evidence.cache_key = pairs.legacy_cache_key
  AND evidence.cache_key IN (SELECT cache_key FROM excluded);

WITH canonical AS (
  SELECT cache_key, source_url
  FROM public.product_data
  WHERE cache_key LIKE 'multibrand-reviewed-wave-y-20260725:%'
    AND catalog_exclusion_reason IS NULL
),
pairs AS (
  SELECT
    legacy.cache_key AS legacy_cache_key,
    canonical.cache_key AS canonical_cache_key
  FROM public.product_data legacy
  JOIN canonical USING (source_url)
  WHERE legacy.cache_key NOT LIKE 'multibrand-reviewed-wave-y-20260725:%'
)
UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason = 'duplicate official-source alias excluded in favor of reviewed exact-identity row',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by', '20260725140000_reconcile_multibrand_wave_y_aliases',
      'canonical_cache_key', pairs.canonical_cache_key
    ),
  updated_at = now()
FROM pairs
WHERE queue.cache_key = pairs.legacy_cache_key
  AND queue.status IN ('open', 'in_progress');

SELECT public.close_stale_catalog_acquisition_queue_gaps(now()) AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;

DO $$
DECLARE
  active_legacy_count INTEGER;
  ready_canonical_count INTEGER;
  duplicate_url_count INTEGER;
BEGIN
  WITH canonical AS (
    SELECT source_url
    FROM public.product_data
    WHERE cache_key LIKE 'multibrand-reviewed-wave-y-20260725:%'
      AND catalog_exclusion_reason IS NULL
  )
  SELECT count(*)
  INTO active_legacy_count
  FROM public.product_data legacy
  JOIN canonical USING (source_url)
  WHERE legacy.cache_key NOT LIKE 'multibrand-reviewed-wave-y-20260725:%'
    AND legacy.catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO ready_canonical_count
  FROM public.product_data
  WHERE cache_key LIKE 'multibrand-reviewed-wave-y-20260725:%'
    AND public.catalog_quality_state(
      pet_type,
      is_complete_food,
      catalog_exclusion_reason,
      ingredient_text,
      COALESCE(array_length(ingredients, 1), 0),
      ingredient_verification_status,
      image_url,
      image_verification_status,
      source_url,
      expires_at
    ) = 'verified_ready';

  WITH canonical AS (
    SELECT source_url
    FROM public.product_data
    WHERE cache_key LIKE 'multibrand-reviewed-wave-y-20260725:%'
      AND catalog_exclusion_reason IS NULL
  )
  SELECT count(*)
  INTO duplicate_url_count
  FROM (
    SELECT source_url
    FROM public.product_data
    WHERE source_url IN (SELECT source_url FROM canonical)
      AND catalog_exclusion_reason IS NULL
    GROUP BY source_url
    HAVING count(*) <> 1
  ) duplicated;

  IF active_legacy_count <> 0 OR ready_canonical_count <> 9 OR duplicate_url_count <> 0 THEN
    RAISE EXCEPTION 'Wave Y reconciliation failed: active legacy %, ready canonical %, duplicate URLs %',
      active_legacy_count, ready_canonical_count, duplicate_url_count;
  END IF;
END $$;
