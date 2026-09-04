-- Keep the reviewed exact-identity FirstMate/SKOKI rows from Wave U and retire
-- the shorter June aliases that point to the same official PDPs. Also quarantine
-- the Duck & Pumpkin Small Bites row: its current official PDP primary image is
-- a Kasiks Free Range Lamb bag, so it cannot satisfy the exact-image gate.

DO $$
DECLARE
  ready_count INTEGER;
BEGIN
  WITH pairs(legacy_cache_key, canonical_cache_key, source_url) AS (
    VALUES
      (
        'firstmate:firstmate australian lamb meal formula small bites',
        'firstmate-reviewed-wave-u-20260725:firstmate australian lamb meal formula small bites 12 lb 5 44 kg bag product australian-lamb-meal-formula-small-bites',
        'https://firstmate.com/product/australian-lamb-meal-formula-small-bites/'
      ),
      (
        'firstmate:firstmate cage free chicken meal oats formula',
        'firstmate-reviewed-wave-u-20260725:firstmate cage free chicken meal oats formula 25 lb 11 4 kg bag product cage-free-chicken-meal-oats-formula',
        'https://firstmate.com/product/cage-free-chicken-meal-oats-formula/'
      ),
      (
        'firstmate:firstmate cage free duck meal blueberries formula for cats',
        'firstmate-reviewed-wave-u-20260725:firstmate cage free duck meal blueberries formula for cats 4 lb 1 8 kg bag product cage-free-duck-blueberries',
        'https://firstmate.com/product/cage-free-duck-blueberries/'
      ),
      (
        'firstmate:firstmate cage free duck meal pumpkin formula',
        'firstmate-reviewed-wave-u-20260725:firstmate cage free duck meal pumpkin formula 25 lb 11 4 kg bag product cage-free-duck-meal-pumpkin-formula',
        'https://firstmate.com/product/cage-free-duck-meal-pumpkin-formula/'
      ),
      (
        'firstmate:firstmate cage free duck oats formula',
        'firstmate-reviewed-wave-u-20260725:firstmate cage free duck oats formula 25 lb 11 4 kg bag product cage-free-duck-oats-formula',
        'https://firstmate.com/product/cage-free-duck-oats-formula/'
      ),
      (
        'firstmate:firstmate free range lamb oats formula',
        'firstmate-reviewed-wave-u-20260725:firstmate free range lamb oats formula 25 lb 11 4 kg bag product free-range-lamb-oats-formula',
        'https://firstmate.com/product/free-range-lamb-oats-formula/'
      ),
      (
        'firstmate:firstmate high performance for active dogs and puppies',
        'firstmate-reviewed-wave-u-20260725:firstmate high performance for active dogs and puppies 25 lb 11 4 kg bag product high-performance-active-dogs-puppies',
        'https://firstmate.com/product/high-performance-active-dogs-puppies/'
      ),
      (
        'firstmate:firstmate skoki coastal dog food',
        'firstmate-reviewed-wave-u-20260725:skoki skoki coastal dog food 40 lb 18 14 kg bag product skoki-coastal-dog-food',
        'https://firstmate.com/product/skoki-coastal-dog-food/'
      ),
      (
        'firstmate:firstmate skoki ranch dog food',
        'firstmate-reviewed-wave-u-20260725:skoki skoki ranch dog food 40 lb 18 14 kg bag product skoki-ranch-dog-food',
        'https://firstmate.com/product/skoki-ranch-dog-food/'
      )
  )
  SELECT count(*)
  INTO ready_count
  FROM pairs
  JOIN public.product_data canonical
    ON canonical.cache_key = pairs.canonical_cache_key
   AND canonical.source_url = pairs.source_url
  WHERE canonical.catalog_exclusion_reason IS NULL
    AND canonical.is_complete_food = TRUE
    AND canonical.pet_type IN ('dog', 'cat')
    AND canonical.food_form = 'dry'
    AND canonical.life_stage = 'all life stages'
    AND canonical.source_quality = 'manufacturer'
    AND canonical.ingredient_verification_status = 'manufacturer'
    AND canonical.image_verification_status = 'manufacturer'
    AND canonical.ingredient_text IS NOT NULL
    AND canonical.image_url IS NOT NULL
    AND (
      (canonical.source_url LIKE '%/skoki-%' AND canonical.brand = 'SKOKI')
      OR
      (canonical.source_url NOT LIKE '%/skoki-%' AND canonical.brand = 'FirstMate')
    );

  IF ready_count <> 9 THEN
    RAISE EXCEPTION 'expected 9 reviewed FirstMate/SKOKI Wave U rows, found %', ready_count;
  END IF;
END $$;

WITH pairs(legacy_cache_key, canonical_cache_key) AS (
  VALUES
    ('firstmate:firstmate australian lamb meal formula small bites', 'firstmate-reviewed-wave-u-20260725:firstmate australian lamb meal formula small bites 12 lb 5 44 kg bag product australian-lamb-meal-formula-small-bites'),
    ('firstmate:firstmate cage free chicken meal oats formula', 'firstmate-reviewed-wave-u-20260725:firstmate cage free chicken meal oats formula 25 lb 11 4 kg bag product cage-free-chicken-meal-oats-formula'),
    ('firstmate:firstmate cage free duck meal blueberries formula for cats', 'firstmate-reviewed-wave-u-20260725:firstmate cage free duck meal blueberries formula for cats 4 lb 1 8 kg bag product cage-free-duck-blueberries'),
    ('firstmate:firstmate cage free duck meal pumpkin formula', 'firstmate-reviewed-wave-u-20260725:firstmate cage free duck meal pumpkin formula 25 lb 11 4 kg bag product cage-free-duck-meal-pumpkin-formula'),
    ('firstmate:firstmate cage free duck oats formula', 'firstmate-reviewed-wave-u-20260725:firstmate cage free duck oats formula 25 lb 11 4 kg bag product cage-free-duck-oats-formula'),
    ('firstmate:firstmate free range lamb oats formula', 'firstmate-reviewed-wave-u-20260725:firstmate free range lamb oats formula 25 lb 11 4 kg bag product free-range-lamb-oats-formula'),
    ('firstmate:firstmate high performance for active dogs and puppies', 'firstmate-reviewed-wave-u-20260725:firstmate high performance for active dogs and puppies 25 lb 11 4 kg bag product high-performance-active-dogs-puppies'),
    ('firstmate:firstmate skoki coastal dog food', 'firstmate-reviewed-wave-u-20260725:skoki skoki coastal dog food 40 lb 18 14 kg bag product skoki-coastal-dog-food'),
    ('firstmate:firstmate skoki ranch dog food', 'firstmate-reviewed-wave-u-20260725:skoki skoki ranch dog food 40 lb 18 14 kg bag product skoki-ranch-dog-food')
),
excluded AS (
  UPDATE public.product_data legacy
  SET
    catalog_exclusion_reason = 'duplicate_verified_official_catalog_row',
    updated_at = now()
  FROM pairs
  WHERE legacy.cache_key = pairs.legacy_cache_key
    AND legacy.catalog_exclusion_reason IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.product_data canonical
      WHERE canonical.cache_key = pairs.canonical_cache_key
        AND canonical.catalog_exclusion_reason IS NULL
        AND canonical.source_quality = 'manufacturer'
        AND canonical.ingredient_verification_status = 'manufacturer'
        AND canonical.image_verification_status = 'manufacturer'
    )
  RETURNING legacy.cache_key
)
UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(NULLIF(evidence.rejection_reason, ''), 'duplicate_verified_official_catalog_row'),
  evidence = COALESCE(evidence.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by', '20260725131500_reconcile_firstmate_skoki_wave_u_aliases',
      'canonical_cache_key', pairs.canonical_cache_key
    ),
  updated_at = now()
FROM pairs
WHERE evidence.cache_key = pairs.legacy_cache_key
  AND evidence.cache_key IN (SELECT cache_key FROM excluded);

WITH pairs(legacy_cache_key, canonical_cache_key) AS (
  VALUES
    ('firstmate:firstmate australian lamb meal formula small bites', 'firstmate-reviewed-wave-u-20260725:firstmate australian lamb meal formula small bites 12 lb 5 44 kg bag product australian-lamb-meal-formula-small-bites'),
    ('firstmate:firstmate cage free chicken meal oats formula', 'firstmate-reviewed-wave-u-20260725:firstmate cage free chicken meal oats formula 25 lb 11 4 kg bag product cage-free-chicken-meal-oats-formula'),
    ('firstmate:firstmate cage free duck meal blueberries formula for cats', 'firstmate-reviewed-wave-u-20260725:firstmate cage free duck meal blueberries formula for cats 4 lb 1 8 kg bag product cage-free-duck-blueberries'),
    ('firstmate:firstmate cage free duck meal pumpkin formula', 'firstmate-reviewed-wave-u-20260725:firstmate cage free duck meal pumpkin formula 25 lb 11 4 kg bag product cage-free-duck-meal-pumpkin-formula'),
    ('firstmate:firstmate cage free duck oats formula', 'firstmate-reviewed-wave-u-20260725:firstmate cage free duck oats formula 25 lb 11 4 kg bag product cage-free-duck-oats-formula'),
    ('firstmate:firstmate free range lamb oats formula', 'firstmate-reviewed-wave-u-20260725:firstmate free range lamb oats formula 25 lb 11 4 kg bag product free-range-lamb-oats-formula'),
    ('firstmate:firstmate high performance for active dogs and puppies', 'firstmate-reviewed-wave-u-20260725:firstmate high performance for active dogs and puppies 25 lb 11 4 kg bag product high-performance-active-dogs-puppies'),
    ('firstmate:firstmate skoki coastal dog food', 'firstmate-reviewed-wave-u-20260725:skoki skoki coastal dog food 40 lb 18 14 kg bag product skoki-coastal-dog-food'),
    ('firstmate:firstmate skoki ranch dog food', 'firstmate-reviewed-wave-u-20260725:skoki skoki ranch dog food 40 lb 18 14 kg bag product skoki-ranch-dog-food')
)
UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason = 'duplicate FirstMate/SKOKI official-source alias excluded in favor of reviewed exact-identity row',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by', '20260725131500_reconcile_firstmate_skoki_wave_u_aliases',
      'canonical_cache_key', pairs.canonical_cache_key
    ),
  updated_at = now()
FROM pairs
WHERE queue.cache_key = pairs.legacy_cache_key
  AND queue.status IN ('open', 'in_progress');

UPDATE public.product_data
SET
  catalog_exclusion_reason = 'official_primary_image_mismatch',
  updated_at = now()
WHERE cache_key = 'firstmate:firstmate cage free duck meal pumpkin formula small bites'
  AND source_url = 'https://firstmate.com/product/cage-free-duck-meal-pumpkin-formula-small-bites/'
  AND image_url = 'https://firstmate.com/wp-content/uploads/2022/09/kasiks-free-range-lamb-meal-formula-2.3kg-600x600-Recovered.png'
  AND catalog_exclusion_reason IS NULL;

UPDATE public.catalog_product_evidence
SET
  review_state = 'rejected',
  rejection_reason = 'official_primary_image_mismatch',
  evidence = COALESCE(evidence, '{}'::jsonb)
    || jsonb_build_object(
      'image_mismatch_reviewed_at', now(),
      'image_mismatch_reviewed_by', '20260725131500_reconcile_firstmate_skoki_wave_u_aliases',
      'observed_wrong_image_url', 'https://firstmate.com/wp-content/uploads/2022/09/kasiks-free-range-lamb-meal-formula-2.3kg-600x600-Recovered.png',
      'required_identity', 'FirstMate Cage Free Duck Meal & Pumpkin Formula Small Bites'
    ),
  updated_at = now()
WHERE cache_key IN (
  'firstmate:firstmate cage free duck meal pumpkin formula small bites',
  'firstmate:firstmate cage free duck meal pumpkin formula small bites product cage-free-duck-meal-pumpkin-formula-small-bites'
);

SELECT public.close_stale_catalog_acquisition_queue_gaps(now()) AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;

DO $$
DECLARE
  active_legacy_count INTEGER;
  ready_canonical_count INTEGER;
  active_bad_image_count INTEGER;
BEGIN
  SELECT count(*)
  INTO active_legacy_count
  FROM public.product_data
  WHERE cache_key IN (
    'firstmate:firstmate australian lamb meal formula small bites',
    'firstmate:firstmate cage free chicken meal oats formula',
    'firstmate:firstmate cage free duck meal blueberries formula for cats',
    'firstmate:firstmate cage free duck meal pumpkin formula',
    'firstmate:firstmate cage free duck oats formula',
    'firstmate:firstmate free range lamb oats formula',
    'firstmate:firstmate high performance for active dogs and puppies',
    'firstmate:firstmate skoki coastal dog food',
    'firstmate:firstmate skoki ranch dog food'
  )
    AND catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO ready_canonical_count
  FROM public.product_data
  WHERE cache_key LIKE 'firstmate-reviewed-wave-u-20260725:%'
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

  SELECT count(*)
  INTO active_bad_image_count
  FROM public.product_data
  WHERE source_url = 'https://firstmate.com/product/cage-free-duck-meal-pumpkin-formula-small-bites/'
    AND image_url = 'https://firstmate.com/wp-content/uploads/2022/09/kasiks-free-range-lamb-meal-formula-2.3kg-600x600-Recovered.png'
    AND catalog_exclusion_reason IS NULL;

  IF active_legacy_count <> 0 OR ready_canonical_count <> 9 OR active_bad_image_count <> 0 THEN
    RAISE EXCEPTION 'Wave U reconciliation failed: active legacy %, ready canonical %, active bad image %',
      active_legacy_count, ready_canonical_count, active_bad_image_count;
  END IF;
END $$;
