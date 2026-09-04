-- Keep Health Extension discovery aligned with the verified catalog scope:
-- complete dog/cat food formulas only, not broths, samples, bundles, or
-- other non-single-formula rows.

UPDATE public.product_data
SET
  is_complete_food = FALSE,
  catalog_exclusion_reason = COALESCE(NULLIF(trim(catalog_exclusion_reason), ''), 'non_single_formula_or_non_complete'),
  updated_at = NOW()
WHERE source = 'health-extension'
  AND (
    source_url ILIKE '%/products/broth-licious-%'
    OR source_url ILIKE '%/products/air-dried-complete-samples%'
    OR product_name ILIKE 'Broth-Licious%'
    OR product_name ILIKE '% Sample'
  );

DO $$
DECLARE
  remaining_ready_rows INTEGER;
BEGIN
  SELECT count(*)
  INTO remaining_ready_rows
  FROM public.product_data
  WHERE source = 'health-extension'
    AND (
      source_url ILIKE '%/products/broth-licious-%'
      OR source_url ILIKE '%/products/air-dried-complete-samples%'
      OR product_name ILIKE 'Broth-Licious%'
      OR product_name ILIKE '% Sample'
    )
    AND public.catalog_quality_state(
      pet_type,
      is_complete_food,
      catalog_exclusion_reason,
      ingredient_text,
      COALESCE(ingredient_count, 0),
      ingredient_verification_status,
      image_url,
      image_verification_status,
      source_url,
      expires_at
    ) = 'verified_ready';

  IF remaining_ready_rows > 0 THEN
    RAISE EXCEPTION 'Health Extension non-single-formula rows must not remain verified_ready';
  END IF;
END $$;
