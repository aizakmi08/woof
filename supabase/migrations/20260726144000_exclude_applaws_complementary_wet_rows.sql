-- Applaws' current US manufacturer pages explicitly classify these two
-- serving-table rows as complementary wet foods. They must never be scored as
-- complete foods. This does not delete ingredients or images; it only applies
-- the manufacturer-backed complete-food boundary.

DO $$
DECLARE
  v_expected_keys CONSTANT TEXT[] := ARRAY[
    'applaws chicken breast with cheese',
    'applaws senior natural wet in mousse limited and natural ingredients high protein with no artificial additives variety selection 12 x'
  ];
BEGIN
  IF (
    SELECT count(*)
    FROM public.product_data product
    WHERE product.cache_key = ANY(v_expected_keys)
      AND product.is_complete_food
      AND product.catalog_exclusion_reason IS NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'Expected Applaws complementary wet serving rows are missing or already changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data product
    WHERE product.cache_key = 'applaws chicken breast with cheese'
      AND lower(product.product_name) NOT LIKE '%chicken breast with cheese%'
  ) OR EXISTS (
    SELECT 1
    FROM public.product_data product
    WHERE product.cache_key =
      'applaws senior natural wet in mousse limited and natural ingredients high protein with no artificial additives variety selection 12 x'
      AND lower(product.product_name) NOT LIKE '%senior%variety%'
  ) THEN
    RAISE EXCEPTION 'Applaws complementary product identity boundary changed';
  END IF;

  UPDATE public.product_data
  SET is_complete_food = FALSE,
      catalog_exclusion_reason = 'non_complete_food',
      updated_at = now()
  WHERE cache_key = ANY(v_expected_keys);

  IF (
    SELECT count(*)
    FROM public.product_data product
    WHERE product.cache_key = ANY(v_expected_keys)
      AND NOT product.is_complete_food
      AND product.catalog_exclusion_reason = 'non_complete_food'
  ) <> 2 THEN
    RAISE EXCEPTION 'Applaws complementary wet serving exclusion failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.search_verified_products('Chicken Breast with Cheese', 10) result
    WHERE result.cache_key = 'applaws chicken breast with cheese'
  ) OR EXISTS (
    SELECT 1
    FROM public.search_verified_products('Applaws Senior Variety Selection Mousse', 10) result
    WHERE result.cache_key =
      'applaws senior natural wet in mousse limited and natural ingredients high protein with no artificial additives variety selection 12 x'
  ) THEN
    RAISE EXCEPTION 'Applaws complementary wet food remains in verified complete-food search';
  END IF;
END
$$;
