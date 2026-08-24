-- Repair the existing canonical serving row from current exact manufacturer
-- evidence. The ingredient hash and official source URL are hard guards so this
-- cannot update a sibling or a later formula version.
DO $$
DECLARE
  updated_rows INTEGER := 0;
BEGIN
  UPDATE public.product_data
  SET
    product_name = 'Nulo Gently-Cooked Meals Duck, Chicken & Quinoa Recipe For Dogs',
    product_line = 'Gently-Cooked Meals',
    flavor = 'Duck, Chicken & Quinoa Recipe',
    life_stage = 'adult',
    food_form = 'fresh',
    package_size = '9 oz',
    image_url = 'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/mz8xl47jyq7yfw2upygt.png?v=1776774864',
    image_verification_status = 'manufacturer',
    verified_at = '2026-07-25T09:42:21.416Z'::timestamptz,
    updated_at = now()
  WHERE cache_key = 'nulo:nulo nulo gently-cooked meals duck chicken quinoa recipe for dogs'
    AND source_url = 'https://nulo.com/products/gently-cooked-meals-duck-chicken-quinoa-recipe-for-dogs'
    AND md5(ingredient_text) = '15167ea03e06bac8883358ce15dff0a6'
    AND pet_type = 'dog'
    AND is_complete_food IS TRUE
    AND catalog_exclusion_reason IS NULL;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  IF updated_rows = 0 AND NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'nulo:nulo nulo gently-cooked meals duck chicken quinoa recipe for dogs'
      AND source_url = 'https://nulo.com/products/gently-cooked-meals-duck-chicken-quinoa-recipe-for-dogs'
      AND md5(ingredient_text) = '15167ea03e06bac8883358ce15dff0a6'
      AND product_line = 'Gently-Cooked Meals'
      AND flavor = 'Duck, Chicken & Quinoa Recipe'
      AND life_stage = 'adult'
      AND food_form = 'fresh'
      AND package_size = '9 oz'
  ) THEN
    RAISE EXCEPTION 'Exact Nulo Gently-Cooked canonical row was not found; refusing broad repair';
  END IF;
END
$$;
