-- A verified product must expose every source-statement ingredient without a
-- rejected or guessed token. Rows that cannot satisfy that deterministic
-- contract return to manual review instead of remaining instant-ready.

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
    AND ingredients IS DISTINCT FROM public.catalog_split_ingredient_statement(ingredient_text)
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
)
UPDATE public.catalog_product_evidence evidence
SET review_state = 'manual_review'
FROM demoted
WHERE evidence.cache_key = demoted.cache_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
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
      AND ingredients IS DISTINCT FROM public.catalog_split_ingredient_statement(ingredient_text)
  ) THEN
    RAISE EXCEPTION 'verified catalog rows still disagree with their exact ingredient statements';
  END IF;
END;
$$;
