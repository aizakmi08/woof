-- Verified catalog provenance must have a source/evidence URL. Legacy imports
-- sometimes marked manufacturer/retailer data as verified without preserving the
-- product page or feed evidence, which is not strong enough for ingredient-
-- accurate scoring.

WITH evidence_gap AS (
  SELECT id
  FROM public.product_data
  WHERE COALESCE(NULLIF(trim(source_url), ''), '') = ''
    AND NOT public.is_likely_non_product_catalog_row(product_name, brand)
    AND (
      SELECT count(*)
      FROM unnest(COALESCE(ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
      WHERE public.is_plausible_product_ingredient(ingredient.value)
    ) >= 5
    AND (
      ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      OR image_verification_status IN (
        'official',
        'manufacturer',
        'retailer_verified'
      )
      OR source_quality IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified'
      )
    )
)
UPDATE public.product_data AS product
SET
  ingredient_verification_status = CASE
    WHEN product.ingredient_verification_status IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    ) THEN 'unverified'
    ELSE product.ingredient_verification_status
  END,
  image_verification_status = CASE
    WHEN product.image_verification_status IN (
      'official',
      'manufacturer',
      'retailer_verified'
    ) THEN 'unverified'
    ELSE product.image_verification_status
  END,
  source_quality = CASE
    WHEN product.source_quality IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified'
    ) THEN 'unknown'
    ELSE product.source_quality
  END,
  verified_at = NULL,
  updated_at = NOW()
FROM evidence_gap
WHERE product.id = evidence_gap.id;

ALTER TABLE public.product_data
  DROP CONSTRAINT IF EXISTS product_data_verified_source_evidence_check;

ALTER TABLE public.product_data
  ADD CONSTRAINT product_data_verified_source_evidence_check
  CHECK (
    COALESCE(NULLIF(trim(source_url), ''), '') <> ''
    OR (
      ingredient_verification_status NOT IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      AND image_verification_status NOT IN (
        'official',
        'manufacturer',
        'retailer_verified'
      )
      AND source_quality NOT IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified'
      )
    )
  );

DO $$
DECLARE
  v_refresh_result JSONB;
  v_reconcile_result JSONB;
BEGIN
  IF to_regprocedure('public.refresh_catalog_acquisition_queue(integer,integer)') IS NOT NULL THEN
    SELECT public.refresh_catalog_acquisition_queue(30, 5000) INTO v_refresh_result;
    RAISE NOTICE 'catalog acquisition refresh after evidence cleanup: %', v_refresh_result;
  END IF;

  IF to_regprocedure('public.reconcile_catalog_acquisition_queue()') IS NOT NULL THEN
    SELECT public.reconcile_catalog_acquisition_queue() INTO v_reconcile_result;
    RAISE NOTICE 'catalog acquisition reconcile after evidence cleanup: %', v_reconcile_result;
  END IF;
END;
$$;
