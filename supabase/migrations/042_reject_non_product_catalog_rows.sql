-- Reject obvious content/help/article pages from product_data. These rows can
-- have enough scraped ingredient-like text to pass ingredient-count checks, but
-- they are not purchasable dog/cat food products and should not count toward
-- analysis-ready catalog coverage.

CREATE OR REPLACE FUNCTION public.normalize_product_catalog_name(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            LOWER(COALESCE(value, '')),
            '&amp;|&', ' amp ', 'gi'
          ),
          '&#x?[0-9a-f]+;', ' ', 'gi'
        ),
        '[^[:alnum:]]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.is_likely_non_product_catalog_row(
  p_product_name TEXT,
  p_brand TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT
      public.normalize_product_catalog_name(p_product_name) AS product_name,
      public.normalize_product_catalog_name(p_brand) AS brand
  )
  SELECT COALESCE(
    product_name ~ '^ingredients? (amp |and )?nutritional value$'
      OR product_name ~ '^ingredients? guide( ingredients? guide)?( |$)'
      OR product_name ~ '(^| )(dog|cat|pet) (food|treat) trends?( |$)'
      OR (
        product_name ~ '(^| )trends?( |$)'
        AND product_name ~ '(^| )the rise of( |$)'
      )
      OR (
        brand IN ('ingredients guide', 'dog treat')
        AND (
          product_name ~ '^ingredients? guide( ingredients? guide)?( |$)'
          OR product_name ~ '(^| )(dog|cat|pet) (food|treat) trends?( |$)'
        )
      ),
    FALSE
  )
  FROM normalized;
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

  IF public.is_likely_non_product_catalog_row(NEW.product_name, NEW.brand) THEN
    RAISE EXCEPTION 'Invalid product_data non-product payload'
      USING ERRCODE = '22023';
  END IF;

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
WHERE public.is_likely_non_product_catalog_row(product_name, brand);

DROP TRIGGER IF EXISTS trg_product_data_ingredient_contract
  ON public.product_data;

CREATE TRIGGER trg_product_data_ingredient_contract
  BEFORE INSERT OR UPDATE
  ON public.product_data
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_product_data_ingredient_contract();

ANALYZE public.product_data;
