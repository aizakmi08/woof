-- Keep product_data display fields clean for every writer, not only one-time
-- cleanup migrations. Dirty names such as "&amp;" or scraped "Brand:" prefixes
-- show directly in search/results and make otherwise usable catalog rows feel
-- low quality.

CREATE OR REPLACE FUNCTION public.clean_product_display_text(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        REGEXP_REPLACE(
                          COALESCE(value, ''),
                          '&amp;', '&', 'gi'
                        ),
                        '&quot;', '"', 'gi'
                      ),
                      '&#39;|&#039;|&apos;', '''', 'gi'
                    ),
                    '&ndash;|&mdash;', '-', 'gi'
                  ),
                  '&reg;|&trade;', '', 'gi'
                ),
                '<[^>]+>', '', 'gi'
              ),
              '^\s*(brand|product)\s*:\s*', '', 'i'
            ),
            '\s+', ' ', 'g'
          ),
          '\s*,\s*$', '', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_product_data_ingredient_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  clean_ingredients TEXT[];
  clean_ingredient_count INT;
BEGIN
  NEW.product_name := COALESCE(public.clean_product_display_text(NEW.product_name), NEW.product_name);
  NEW.brand := public.clean_product_display_text(NEW.brand);

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

DELETE FROM public.product_data
WHERE COALESCE(array_length(ingredients, 1), 0) < 5;

UPDATE public.product_data
SET
  product_name = COALESCE(public.clean_product_display_text(product_name), product_name),
  brand = public.clean_product_display_text(brand)
WHERE
  product_name IS DISTINCT FROM COALESCE(public.clean_product_display_text(product_name), product_name)
  OR brand IS DISTINCT FROM public.clean_product_display_text(brand);

DROP TRIGGER IF EXISTS trg_product_data_ingredient_contract
  ON public.product_data;

CREATE TRIGGER trg_product_data_ingredient_contract
  BEFORE INSERT OR UPDATE
  ON public.product_data
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_product_data_ingredient_contract();

ANALYZE public.product_data;
