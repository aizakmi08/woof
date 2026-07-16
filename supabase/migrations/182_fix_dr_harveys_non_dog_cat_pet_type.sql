-- Dr. Harvey's bird products were imported by an older pass with pet_type = dog.
-- Keep them excluded, but remove them from dog/cat catalog coverage counts.
WITH corrected AS (
  UPDATE public.product_data
  SET
    pet_type = NULL,
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'non_dog_cat_product',
    updated_at = now()
  WHERE source = 'dr-harvey-s'
    AND catalog_exclusion_reason = 'non_dog_cat_product'
    AND pet_type IN ('dog', 'cat')
    AND (
      source_url ILIKE '%bird%'
      OR source_url ILIKE '%parrot%'
      OR source_url ILIKE '%cockatiel%'
      OR source_url ILIKE '%finch%'
      OR source_url ILIKE '%canary%'
      OR source_url ILIKE '%parakeet%'
      OR public.normalize_product_catalog_name(product_name) ~ '(^| )(parrot|cockatiel|finch|canary|parakeet)( |$)'
    )
  RETURNING cache_key
)
UPDATE public.catalog_product_evidence e
SET
  review_state = 'rejected',
  rejection_reason = 'non_dog_cat_product',
  evidence = COALESCE(e.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'corrected_after_backfill', true,
      'rejection_reason', 'non_dog_cat_product',
      'pet_type_corrected_to_null', true
    ),
  updated_at = now()
FROM corrected
WHERE e.cache_key = corrected.cache_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE source = 'dr-harvey-s'
      AND catalog_exclusion_reason = 'non_dog_cat_product'
      AND pet_type IN ('dog', 'cat')
      AND (
        source_url ILIKE '%bird%'
        OR source_url ILIKE '%parrot%'
        OR source_url ILIKE '%cockatiel%'
        OR source_url ILIKE '%finch%'
        OR source_url ILIKE '%canary%'
        OR source_url ILIKE '%parakeet%'
        OR public.normalize_product_catalog_name(product_name) ~ '(^| )(parrot|cockatiel|finch|canary|parakeet)( |$)'
      )
  ) THEN
    RAISE EXCEPTION 'Dr. Harvey''s bird products still count as dog/cat rows';
  END IF;
END $$;
