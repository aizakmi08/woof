-- Keep six visually reviewed 5.5 oz FirstMate cat rows and retire older aliases
-- sharing those exact official PDPs. The legacy CDN filenames name sibling
-- proteins, but the currently served image bytes were reviewed and show the exact
-- product on each PDP; identity follows reviewed image content, not the filename.

DO $$
DECLARE
  ready_count INTEGER;
  adult_count INTEGER;
  all_life_stages_count INTEGER;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE life_stage = 'adult'),
    count(*) FILTER (WHERE life_stage = 'all life stages')
  INTO ready_count, adult_count, all_life_stages_count
  FROM public.product_data
  WHERE cache_key LIKE 'firstmate-reviewed-wave-x-20260725:%'
    AND brand = 'FirstMate'
    AND pet_type = 'cat'
    AND food_form = 'wet'
    AND package_size = '24 x 5.5 oz cans'
    AND source_url LIKE 'https://firstmate.com/product/%'
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

  IF ready_count <> 6 OR adult_count <> 1 OR all_life_stages_count <> 5 THEN
    RAISE EXCEPTION 'expected 6 Wave X rows (1 adult, 5 all-life-stages), found % (% adult, % all-life-stages)',
      ready_count, adult_count, all_life_stages_count;
  END IF;
END $$;

WITH canonical AS (
  SELECT cache_key, source_url
  FROM public.product_data
  WHERE cache_key LIKE 'firstmate-reviewed-wave-x-20260725:%'
    AND catalog_exclusion_reason IS NULL
),
pairs AS (
  SELECT
    legacy.cache_key AS legacy_cache_key,
    canonical.cache_key AS canonical_cache_key
  FROM public.product_data legacy
  JOIN canonical USING (source_url)
  WHERE legacy.cache_key NOT LIKE 'firstmate-reviewed-wave-x-20260725:%'
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
      'duplicate_closed_by', '20260725134500_reconcile_firstmate_wave_x_aliases',
      'canonical_cache_key', pairs.canonical_cache_key,
      'image_content_visually_reviewed', TRUE
    ),
  updated_at = now()
FROM pairs
WHERE evidence.cache_key = pairs.legacy_cache_key
  AND evidence.cache_key IN (SELECT cache_key FROM excluded);

WITH canonical AS (
  SELECT cache_key, source_url
  FROM public.product_data
  WHERE cache_key LIKE 'firstmate-reviewed-wave-x-20260725:%'
    AND catalog_exclusion_reason IS NULL
),
pairs AS (
  SELECT
    legacy.cache_key AS legacy_cache_key,
    canonical.cache_key AS canonical_cache_key
  FROM public.product_data legacy
  JOIN canonical USING (source_url)
  WHERE legacy.cache_key NOT LIKE 'firstmate-reviewed-wave-x-20260725:%'
)
UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason = 'duplicate FirstMate official-source alias excluded in favor of visually reviewed exact-identity row',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by', '20260725134500_reconcile_firstmate_wave_x_aliases',
      'canonical_cache_key', pairs.canonical_cache_key,
      'image_content_visually_reviewed', TRUE
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
    WHERE cache_key LIKE 'firstmate-reviewed-wave-x-20260725:%'
      AND catalog_exclusion_reason IS NULL
  )
  SELECT count(*)
  INTO active_legacy_count
  FROM public.product_data legacy
  JOIN canonical USING (source_url)
  WHERE legacy.cache_key NOT LIKE 'firstmate-reviewed-wave-x-20260725:%'
    AND legacy.catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO ready_canonical_count
  FROM public.product_data
  WHERE cache_key LIKE 'firstmate-reviewed-wave-x-20260725:%'
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
    WHERE cache_key LIKE 'firstmate-reviewed-wave-x-20260725:%'
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

  IF active_legacy_count <> 0 OR ready_canonical_count <> 6 OR duplicate_url_count <> 0 THEN
    RAISE EXCEPTION 'Wave X reconciliation failed: active legacy %, ready canonical %, duplicate URLs %',
      active_legacy_count, ready_canonical_count, duplicate_url_count;
  END IF;
END $$;
