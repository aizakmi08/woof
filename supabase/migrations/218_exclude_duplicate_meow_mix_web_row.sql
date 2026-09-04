-- This third-party retail row duplicates the official verified Meow Mix
-- Seafood Medley catalog product. Keep the official manufacturer row as the
-- verified serving record and exclude the duplicate from acquisition worklists.

WITH official_verified AS (
  SELECT cache_key
  FROM public.product_data
  WHERE cache_key = 'meow-mix:00829274512329'
    AND source = 'meow-mix'
    AND is_complete_food = TRUE
    AND catalog_exclusion_reason IS NULL
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND image_url IS NOT NULL
    AND ingredient_text IS NOT NULL
    AND source_url = 'https://www.meowmix.com/cat-food/dry/seafood-medley'
),
rejected AS (
  UPDATE public.product_data
  SET
    catalog_exclusion_reason = COALESCE(NULLIF(catalog_exclusion_reason, ''), 'duplicate_verified_official_catalog_row'),
    updated_at = now()
  WHERE cache_key = 'meow mix meow mix medley flavor'
    AND source = 'web'
    AND source_url = 'https://thepotsdamagway.com/products/meow-mix-seafood-medley-dry-cat-food'
    AND catalog_exclusion_reason IS NULL
    AND EXISTS (SELECT 1 FROM official_verified)
  RETURNING cache_key
)
UPDATE public.catalog_product_evidence e
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(NULLIF(e.rejection_reason, ''), 'duplicate_verified_official_catalog_row'),
  evidence = COALESCE(e.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'rejected_after_backfill', true,
      'rejection_reason', 'duplicate_verified_official_catalog_row',
      'official_cache_key', 'meow-mix:00829274512329'
    ),
  updated_at = now()
FROM rejected
WHERE e.cache_key = rejected.cache_key;

SELECT public.close_stale_catalog_acquisition_queue_gaps(now()) AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;

DO $$
DECLARE
  duplicate_state TEXT;
BEGIN
  SELECT public.catalog_quality_state(
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
  )
  INTO duplicate_state
  FROM public.product_data
  WHERE cache_key = 'meow mix meow mix medley flavor';

  IF duplicate_state IS DISTINCT FROM 'excluded' THEN
    RAISE EXCEPTION 'duplicate Meow Mix web row should be excluded, got %', duplicate_state;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'meow-mix:00829274512329'
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
      ) = 'verified_ready'
  ) THEN
    RAISE EXCEPTION 'official Meow Mix row must remain verified_ready';
  END IF;
END $$;
