-- A June source import created shorter cache-key aliases for seven FirstMate
-- serving rows. The July reviewed rows use the same exact official PDPs but
-- carry complete line, life-stage, form, and package identity. Keep the reviewed
-- rows as serving records and exclude the older aliases from search/resolution.

DO $$
DECLARE
  ready_count INTEGER;
BEGIN
  WITH pairs(legacy_cache_key, canonical_cache_key, source_url) AS (
    VALUES
      (
        'firstmate:firstmate limited ingredient cage free turkey formula for cats 3 2oz - 24 cans',
        'firstmate:firstmate limited ingredient cage free turkey formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-cage-free-turkey-formula-cats-3-2oz-24-cans',
        'https://firstmate.com/product/limited-ingredient-cage-free-turkey-formula-cats-3-2oz-24-cans/'
      ),
      (
        'firstmate:firstmate limited ingredient - cage-free chicken formula for cats 3 2oz - 24 cans',
        'firstmate:firstmate limited ingredient - cage-free chicken formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-free-run-chicken-formula-cats-3-2oz-24-cans',
        'https://firstmate.com/product/limited-ingredient-free-run-chicken-formula-cats-3-2oz-24-cans/'
      ),
      (
        'firstmate:firstmate limited ingredient pork apple formula for cats 3 2oz 24 cans',
        'firstmate:firstmate limited ingredient pork apple formula for cats 3 2oz 24 cans 3 2oz product limited-ingredient-pork-apple-formula-for-cats-3-2oz-24-cans-copy',
        'https://firstmate.com/product/limited-ingredient-pork-apple-formula-for-cats-3-2oz-24-cans-copy/'
      ),
      (
        'firstmate:firstmate limited ingredient pork apple formula for cats 5 5oz 24 cans',
        'firstmate:firstmate limited ingredient pork apple formula for cats 5 5oz 24 cans 5 5oz product limited-ingredient-pork-apple-formula-for-cats-5-5oz-24-cans',
        'https://firstmate.com/product/limited-ingredient-pork-apple-formula-for-cats-5-5oz-24-cans/'
      ),
      (
        'firstmate:firstmate limited ingredient wild salmon formula for cats 3 2oz 24 cans',
        'firstmate:firstmate limited ingredient wild salmon formula for cats 3 2oz 24 cans 3 2oz product limited-ingredient-wild-salmon-formula-for-cats-3oz-24-cans',
        'https://firstmate.com/product/limited-ingredient-wild-salmon-formula-for-cats-3oz-24-cans/'
      ),
      (
        'firstmate:firstmate limited ingredient - wild tuna formula for cats 3 2oz - 24 cans',
        'firstmate:firstmate limited ingredient - wild tuna formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-wild-tuna-formula-cats-3-2oz-24-cans',
        'https://firstmate.com/product/limited-ingredient-wild-tuna-formula-cats-3-2oz-24-cans/'
      ),
      (
        'firstmate:firstmate limited ingredient pork apple formula for dogs 12 2oz 12 cans',
        'firstmate:firstmate limited ingredient pork apple formula for dogs 12 2oz 12 cans 12 2oz product pork-apple-formula-for-dogs-12-2oz-12-cans',
        'https://firstmate.com/product/pork-apple-formula-for-dogs-12-2oz-12-cans/'
      )
  )
  SELECT count(*)
  INTO ready_count
  FROM pairs
  JOIN public.product_data canonical
    ON canonical.cache_key = pairs.canonical_cache_key
   AND canonical.source_url = pairs.source_url
  WHERE canonical.brand = 'FirstMate'
    AND canonical.catalog_exclusion_reason IS NULL
    AND canonical.is_complete_food = TRUE
    AND canonical.pet_type IN ('dog', 'cat')
    AND canonical.food_form IN ('dry', 'wet')
    AND canonical.life_stage IS NOT NULL
    AND canonical.source_quality = 'manufacturer'
    AND canonical.ingredient_verification_status = 'manufacturer'
    AND canonical.image_verification_status = 'manufacturer'
    AND canonical.ingredient_text IS NOT NULL
    AND canonical.image_url IS NOT NULL;

  IF ready_count <> 7 THEN
    RAISE EXCEPTION 'expected 7 reviewed FirstMate canonical rows, found %', ready_count;
  END IF;
END $$;

WITH pairs(legacy_cache_key, canonical_cache_key) AS (
  VALUES
    (
      'firstmate:firstmate limited ingredient cage free turkey formula for cats 3 2oz - 24 cans',
      'firstmate:firstmate limited ingredient cage free turkey formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-cage-free-turkey-formula-cats-3-2oz-24-cans'
    ),
    (
      'firstmate:firstmate limited ingredient - cage-free chicken formula for cats 3 2oz - 24 cans',
      'firstmate:firstmate limited ingredient - cage-free chicken formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-free-run-chicken-formula-cats-3-2oz-24-cans'
    ),
    (
      'firstmate:firstmate limited ingredient pork apple formula for cats 3 2oz 24 cans',
      'firstmate:firstmate limited ingredient pork apple formula for cats 3 2oz 24 cans 3 2oz product limited-ingredient-pork-apple-formula-for-cats-3-2oz-24-cans-copy'
    ),
    (
      'firstmate:firstmate limited ingredient pork apple formula for cats 5 5oz 24 cans',
      'firstmate:firstmate limited ingredient pork apple formula for cats 5 5oz 24 cans 5 5oz product limited-ingredient-pork-apple-formula-for-cats-5-5oz-24-cans'
    ),
    (
      'firstmate:firstmate limited ingredient wild salmon formula for cats 3 2oz 24 cans',
      'firstmate:firstmate limited ingredient wild salmon formula for cats 3 2oz 24 cans 3 2oz product limited-ingredient-wild-salmon-formula-for-cats-3oz-24-cans'
    ),
    (
      'firstmate:firstmate limited ingredient - wild tuna formula for cats 3 2oz - 24 cans',
      'firstmate:firstmate limited ingredient - wild tuna formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-wild-tuna-formula-cats-3-2oz-24-cans'
    ),
    (
      'firstmate:firstmate limited ingredient pork apple formula for dogs 12 2oz 12 cans',
      'firstmate:firstmate limited ingredient pork apple formula for dogs 12 2oz 12 cans 12 2oz product pork-apple-formula-for-dogs-12-2oz-12-cans'
    )
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
      'duplicate_closed_by', '20260725125000_exclude_duplicate_firstmate_source_aliases',
      'canonical_cache_key', pairs.canonical_cache_key
    ),
  updated_at = now()
FROM pairs
WHERE evidence.cache_key = pairs.legacy_cache_key
  AND evidence.cache_key IN (SELECT cache_key FROM excluded);

WITH pairs(legacy_cache_key, canonical_cache_key) AS (
  VALUES
    ('firstmate:firstmate limited ingredient cage free turkey formula for cats 3 2oz - 24 cans', 'firstmate:firstmate limited ingredient cage free turkey formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-cage-free-turkey-formula-cats-3-2oz-24-cans'),
    ('firstmate:firstmate limited ingredient - cage-free chicken formula for cats 3 2oz - 24 cans', 'firstmate:firstmate limited ingredient - cage-free chicken formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-free-run-chicken-formula-cats-3-2oz-24-cans'),
    ('firstmate:firstmate limited ingredient pork apple formula for cats 3 2oz 24 cans', 'firstmate:firstmate limited ingredient pork apple formula for cats 3 2oz 24 cans 3 2oz product limited-ingredient-pork-apple-formula-for-cats-3-2oz-24-cans-copy'),
    ('firstmate:firstmate limited ingredient pork apple formula for cats 5 5oz 24 cans', 'firstmate:firstmate limited ingredient pork apple formula for cats 5 5oz 24 cans 5 5oz product limited-ingredient-pork-apple-formula-for-cats-5-5oz-24-cans'),
    ('firstmate:firstmate limited ingredient wild salmon formula for cats 3 2oz 24 cans', 'firstmate:firstmate limited ingredient wild salmon formula for cats 3 2oz 24 cans 3 2oz product limited-ingredient-wild-salmon-formula-for-cats-3oz-24-cans'),
    ('firstmate:firstmate limited ingredient - wild tuna formula for cats 3 2oz - 24 cans', 'firstmate:firstmate limited ingredient - wild tuna formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-wild-tuna-formula-cats-3-2oz-24-cans'),
    ('firstmate:firstmate limited ingredient pork apple formula for dogs 12 2oz 12 cans', 'firstmate:firstmate limited ingredient pork apple formula for dogs 12 2oz 12 cans 12 2oz product pork-apple-formula-for-dogs-12-2oz-12-cans')
)
UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason = 'duplicate FirstMate official-source alias excluded in favor of reviewed exact-identity row',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by', '20260725125000_exclude_duplicate_firstmate_source_aliases',
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
BEGIN
  SELECT count(*)
  INTO active_legacy_count
  FROM public.product_data
  WHERE cache_key IN (
    'firstmate:firstmate limited ingredient cage free turkey formula for cats 3 2oz - 24 cans',
    'firstmate:firstmate limited ingredient - cage-free chicken formula for cats 3 2oz - 24 cans',
    'firstmate:firstmate limited ingredient pork apple formula for cats 3 2oz 24 cans',
    'firstmate:firstmate limited ingredient pork apple formula for cats 5 5oz 24 cans',
    'firstmate:firstmate limited ingredient wild salmon formula for cats 3 2oz 24 cans',
    'firstmate:firstmate limited ingredient - wild tuna formula for cats 3 2oz - 24 cans',
    'firstmate:firstmate limited ingredient pork apple formula for dogs 12 2oz 12 cans'
  )
    AND catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO ready_canonical_count
  FROM public.product_data
  WHERE cache_key IN (
    'firstmate:firstmate limited ingredient cage free turkey formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-cage-free-turkey-formula-cats-3-2oz-24-cans',
    'firstmate:firstmate limited ingredient - cage-free chicken formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-free-run-chicken-formula-cats-3-2oz-24-cans',
    'firstmate:firstmate limited ingredient pork apple formula for cats 3 2oz 24 cans 3 2oz product limited-ingredient-pork-apple-formula-for-cats-3-2oz-24-cans-copy',
    'firstmate:firstmate limited ingredient pork apple formula for cats 5 5oz 24 cans 5 5oz product limited-ingredient-pork-apple-formula-for-cats-5-5oz-24-cans',
    'firstmate:firstmate limited ingredient wild salmon formula for cats 3 2oz 24 cans 3 2oz product limited-ingredient-wild-salmon-formula-for-cats-3oz-24-cans',
    'firstmate:firstmate limited ingredient - wild tuna formula for cats 3 2oz - 24 cans 3 2oz product limited-ingredient-wild-tuna-formula-cats-3-2oz-24-cans',
    'firstmate:firstmate limited ingredient pork apple formula for dogs 12 2oz 12 cans 12 2oz product pork-apple-formula-for-dogs-12-2oz-12-cans'
  )
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

  IF active_legacy_count <> 0 OR ready_canonical_count <> 7 THEN
    RAISE EXCEPTION 'FirstMate duplicate repair failed: active legacy %, ready canonical %',
      active_legacy_count, ready_canonical_count;
  END IF;
END $$;
