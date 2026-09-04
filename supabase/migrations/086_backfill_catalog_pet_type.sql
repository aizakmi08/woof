-- Backfill explicit pet type for legacy catalog rows when the product text is
-- unambiguous. Ambiguous dog+cat rows stay unknown until an official feed or
-- label-level verification supplies the taxonomy.

WITH inferred AS (
  SELECT
    id,
    CASE
      WHEN lower(concat_ws(' ', product_name, brand, cache_key, source_url)) ~ '\m(dog|dogs|puppy|puppies|canine|canines|pup)\M'
        AND lower(concat_ws(' ', product_name, brand, cache_key, source_url)) !~ '\m(cat|cats|kitten|kittens|feline|felines|kitty)\M'
        THEN 'dog'
      WHEN lower(concat_ws(' ', product_name, brand, cache_key, source_url)) ~ '\m(cat|cats|kitten|kittens|feline|felines|kitty)\M'
        AND lower(concat_ws(' ', product_name, brand, cache_key, source_url)) !~ '\m(dog|dogs|puppy|puppies|canine|canines|pup)\M'
        THEN 'cat'
      ELSE NULL
    END AS inferred_pet_type
  FROM public.product_data
  WHERE COALESCE(pet_type, 'unknown') = 'unknown'
    AND NOT public.is_likely_non_product_catalog_row(product_name, brand)
    AND (
      SELECT count(*)
      FROM unnest(COALESCE(ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
      WHERE public.is_plausible_product_ingredient(ingredient.value)
    ) >= 5
)
UPDATE public.product_data AS product
SET
  pet_type = inferred.inferred_pet_type,
  updated_at = NOW()
FROM inferred
WHERE product.id = inferred.id
  AND inferred.inferred_pet_type IN ('dog', 'cat');

DO $$
DECLARE
  v_refresh_result JSONB;
  v_reconcile_result JSONB;
BEGIN
  IF to_regprocedure('public.refresh_catalog_acquisition_queue(integer,integer)') IS NOT NULL THEN
    SELECT public.refresh_catalog_acquisition_queue(30, 5000) INTO v_refresh_result;
    RAISE NOTICE 'catalog acquisition refresh after pet-type backfill: %', v_refresh_result;
  END IF;

  IF to_regprocedure('public.reconcile_catalog_acquisition_queue()') IS NOT NULL THEN
    SELECT public.reconcile_catalog_acquisition_queue() INTO v_reconcile_result;
    RAISE NOTICE 'catalog acquisition reconcile after pet-type backfill: %', v_reconcile_result;
  END IF;
END;
$$;
