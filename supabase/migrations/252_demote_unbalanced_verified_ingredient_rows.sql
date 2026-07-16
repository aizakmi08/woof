-- Move existing rows with unbalanced ingredient parentheses out of
-- verified-ready status. These rows need reviewed ingredient evidence before
-- they can safely serve instant product results.

WITH flagged AS (
  SELECT id, cache_key
  FROM public.product_data
  WHERE public.catalog_quality_state(
    pet_type,
    is_complete_food,
    catalog_exclusion_reason,
    ingredient_text,
    ingredient_count,
    ingredient_verification_status,
    image_url,
    image_verification_status,
    source_url,
    expires_at
  ) = 'verified_ready'
    AND public.catalog_has_unbalanced_parentheses(ingredient_text)
),
demoted AS (
  UPDATE public.product_data product
  SET
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  FROM flagged
  WHERE product.id = flagged.id
  RETURNING product.cache_key
),
evidence_review AS (
  UPDATE public.catalog_product_evidence evidence
  SET review_state = 'manual_review'
  FROM demoted
  WHERE evidence.cache_key = demoted.cache_key
  RETURNING evidence.id
)
SELECT
  (SELECT count(*) FROM demoted) AS demoted_unbalanced_ingredient_rows,
  (SELECT count(*) FROM evidence_review) AS evidence_rows_marked_manual_review;

DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT count(*) INTO remaining_count
  FROM public.product_data
  WHERE public.catalog_quality_state(
    pet_type,
    is_complete_food,
    catalog_exclusion_reason,
    ingredient_text,
    ingredient_count,
    ingredient_verification_status,
    image_url,
    image_verification_status,
    source_url,
    expires_at
  ) = 'verified_ready'
    AND public.catalog_has_unbalanced_parentheses(ingredient_text);

  IF remaining_count <> 0 THEN
    RAISE EXCEPTION 'verified-ready unbalanced ingredient rows remain: %', remaining_count;
  END IF;
END;
$$;
