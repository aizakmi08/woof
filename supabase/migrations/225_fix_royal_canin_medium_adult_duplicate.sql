-- Correct the one Royal Canin row reopened by the life-stage guard. It is a
-- legacy no-source duplicate of the exact official Medium Adult Dry formula,
-- not of the senior Adult 7+ variant.

WITH exact_match AS (
  SELECT
    cache_key,
    product_name,
    brand,
    pet_type,
    source,
    source_quality,
    source_url
  FROM public.product_data
  WHERE brand = 'Royal Canin'
    AND source = 'royal-canin-mars-petcare'
    AND product_name = 'Medium Adult Dry'
    AND source_url = 'https://www.royalcanin.com/us/dogs/products/retail-products/medium-adult-3004'
    AND pet_type = 'dog'
    AND source_quality IN ('manufacturer', 'official', 'gdsn', 'retailer_verified')
    AND ingredient_verification_status IN ('manufacturer', 'official', 'gdsn', 'retailer_verified')
    AND image_verification_status IN ('manufacturer', 'official', 'retailer_verified')
    AND catalog_exclusion_reason IS NULL
  ORDER BY cache_key
  LIMIT 1
),
excluded_product AS (
  UPDATE public.product_data pd
  SET
    catalog_exclusion_reason = 'duplicate_verified_official_catalog_row',
    updated_at = now()
  FROM exact_match
  WHERE pd.cache_key = 'royal canin royal canin size health nutrition medium adult'
    AND pd.source_url IS NULL
  RETURNING pd.cache_key
)
UPDATE public.catalog_acquisition_queue q
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason = 'legacy no-source row excluded because exact Royal Canin Medium Adult official source-backed product exists',
  updated_at = now(),
  sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by', 'fix_royal_canin_medium_adult_duplicate',
      'matched_cache_key', em.cache_key,
      'matched_product_name', em.product_name,
      'matched_brand', em.brand,
      'matched_pet_type', em.pet_type,
      'matched_source', em.source,
      'matched_source_quality', em.source_quality,
      'matched_source_url', em.source_url,
      'matched_after_life_stage_guard', true
    )
FROM exact_match em, excluded_product ep
WHERE q.cache_key = ep.cache_key;

DO $$
DECLARE
  current_reason TEXT;
  matched_url TEXT;
BEGIN
  SELECT catalog_exclusion_reason
  INTO current_reason
  FROM public.product_data
  WHERE cache_key = 'royal canin royal canin size health nutrition medium adult';

  IF current_reason IS DISTINCT FROM 'duplicate_verified_official_catalog_row' THEN
    RAISE EXCEPTION 'Royal Canin Medium Adult legacy row should be marked as duplicate, got %', current_reason;
  END IF;

  SELECT sample_metadata->>'matched_source_url'
  INTO matched_url
  FROM public.catalog_acquisition_queue
  WHERE cache_key = 'royal canin royal canin size health nutrition medium adult';

  IF matched_url IS DISTINCT FROM 'https://www.royalcanin.com/us/dogs/products/retail-products/medium-adult-3004' THEN
    RAISE EXCEPTION 'Royal Canin Medium Adult should resolve to exact adult source URL, got %', matched_url;
  END IF;
END $$;
