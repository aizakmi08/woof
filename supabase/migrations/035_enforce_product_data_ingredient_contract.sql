-- Defense in depth for every product_data writer, including direct service-role
-- inserts/upserts that bypass the save_product_data RPCs.

CREATE OR REPLACE FUNCTION public.enforce_product_data_ingredient_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  clean_ingredients TEXT[];
  clean_ingredient_count INT;
BEGIN
  clean_ingredients := ARRAY(
    SELECT trim(ingredient.value)
    FROM unnest(COALESCE(NEW.ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
    WHERE public.is_plausible_product_ingredient(ingredient.value)
  );
  clean_ingredient_count := COALESCE(array_length(clean_ingredients, 1), 0);

  IF clean_ingredient_count < 5 THEN
    RAISE EXCEPTION 'Invalid product_data ingredient payload'
      USING ERRCODE = '22023';
  END IF;

  NEW.ingredients := clean_ingredients;
  NEW.ingredient_text := array_to_string(clean_ingredients, ', ');
  NEW.ingredient_count := clean_ingredient_count;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_data_ingredient_contract
  ON public.product_data;

CREATE TRIGGER trg_product_data_ingredient_contract
  BEFORE INSERT OR UPDATE OF ingredients, ingredient_text, ingredient_count
  ON public.product_data
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_product_data_ingredient_contract();
