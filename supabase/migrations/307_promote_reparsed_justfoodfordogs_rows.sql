-- Promotion is intentionally separate from the reparsing statement so every
-- guard evaluates the committed, trigger-normalized ingredient array.

WITH latest_evidence AS (
  SELECT DISTINCT ON (evidence.cache_key)
    evidence.cache_key,
    evidence.ingredient_verification_status
  FROM public.catalog_product_evidence evidence
  WHERE evidence.source = 'justfoodfordogs'
    AND evidence.source_quality IN ('manufacturer', 'official')
    AND evidence.ingredient_verification_status IN ('manufacturer', 'official')
    AND evidence.image_verification_status IN ('manufacturer', 'official')
    AND evidence.rejection_reason IS NULL
  ORDER BY evidence.cache_key, evidence.updated_at DESC
),
promoted AS (
  UPDATE public.product_data product
  SET
    ingredient_verification_status = latest_evidence.ingredient_verification_status,
    verified_at = NOW(),
    updated_at = NOW()
  FROM latest_evidence
  WHERE product.cache_key = latest_evidence.cache_key
    AND product.source = 'justfoodfordogs'
    AND product.source_quality IN ('manufacturer', 'official')
    AND product.image_verification_status IN ('manufacturer', 'official')
    AND product.is_complete_food IS TRUE
    AND product.catalog_exclusion_reason IS NULL
    AND product.source_url ~* '^https://(www\.)?justfoodfordogs\.com/'
    AND product.image_url IS NOT NULL
    AND product.image_url !~* '^data:'
    AND product.ingredient_count >= 5
    AND NOT public.catalog_has_ingredient_ocr_artifacts(product.ingredient_text)
    AND product.ingredients IS NOT DISTINCT FROM public.catalog_split_ingredient_statement(product.ingredient_text)
  RETURNING product.cache_key
)
UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'promoted',
  rejection_reason = NULL,
  updated_at = NOW()
FROM promoted
WHERE evidence.cache_key = promoted.cache_key
  AND evidence.source = 'justfoodfordogs';

DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM public.product_data
  WHERE source = 'justfoodfordogs'
    AND ingredient_verification_status IN ('manufacturer', 'official')
    AND (
      public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
      OR ingredients IS DISTINCT FROM public.catalog_split_ingredient_statement(ingredient_text)
    );

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'promoted JustFoodForDogs rows failed ingredient verification guards';
  END IF;
END;
$$;
