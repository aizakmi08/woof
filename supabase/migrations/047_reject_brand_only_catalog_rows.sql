-- Remove generic brand-only catalog rows and keep oversized inline images out
-- of search payloads. Rows like product_name="blue Buffalo", brand="Blue
-- Buffalo" can have scraped ingredients but are not tappable products; inline
-- data:image URLs also make search_products responses unnecessarily large.

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
        brand IS NOT NULL
        AND brand <> ''
        AND product_name IN (brand, brand || ' ' || brand)
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

  IF NEW.image_url ILIKE 'data:%' THEN
    NEW.image_url := NULL;
  END IF;

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

UPDATE public.product_data
SET image_url = NULL
WHERE image_url ILIKE 'data:%';

DROP TRIGGER IF EXISTS trg_product_data_ingredient_contract
  ON public.product_data;

CREATE TRIGGER trg_product_data_ingredient_contract
  BEFORE INSERT OR UPDATE
  ON public.product_data
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_product_data_ingredient_contract();

DROP FUNCTION IF EXISTS public.search_products(TEXT, INT);

CREATE OR REPLACE FUNCTION public.search_products(q TEXT, max_results INT DEFAULT 10)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  ingredient_count INT,
  source TEXT,
  image_url TEXT,
  ingredients TEXT[],
  ingredient_text TEXT,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN,
  source_url TEXT,
  rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle TEXT := lower(trim(q));
  safe_limit INT := LEAST(GREATEST(COALESCE(max_results, 10), 1), 25);
BEGIN
  IF needle IS NULL OR length(needle) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
      pd.source,
      CASE WHEN pd.image_url ILIKE 'data:%' THEN NULL ELSE pd.image_url END AS image_url,
      pd.nutritional_info,
      pd.nutrient_panel,
      pd.has_published_nutrients,
      pd.source_url,
      ARRAY(
        SELECT trim(ingredient.value)
        FROM unnest(COALESCE(pd.ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
        WHERE public.is_plausible_product_ingredient(ingredient.value)
      ) AS clean_ingredients
    FROM public.product_data pd
    WHERE pd.expires_at > NOW()
      AND NOT public.is_likely_non_product_catalog_row(pd.product_name, pd.brand)
      AND COALESCE(pd.ingredient_text, '') !~ '\\"'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%mailto:%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%legalLinks%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%reportAbuseLink%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%siteSettings%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%powered by%'
      AND COALESCE(pd.ingredient_text, '') !~ 'https?://'
      AND COALESCE(pd.ingredient_text, '') !~ '\{[^}]{3,}":'
      AND COALESCE(pd.ingredient_text, '') !~ '\}[\,\}]'
      AND LENGTH(COALESCE(pd.ingredient_text, '')) <= 5000
  ),
  ranked AS (
    SELECT
      c.cache_key,
      c.product_name,
      c.brand,
      c.source,
      c.image_url,
      c.nutritional_info,
      c.nutrient_panel,
      c.has_published_nutrients,
      c.source_url,
      c.clean_ingredients,
      COALESCE(array_length(c.clean_ingredients, 1), 0)::INT AS clean_ingredient_count,
      GREATEST(
        CASE WHEN lower(c.product_name) LIKE '%' || needle || '%' THEN 1.0 ELSE 0.0 END,
        CASE WHEN lower(COALESCE(c.brand, '')) LIKE '%' || needle || '%' THEN 0.9 ELSE 0.0 END,
        similarity(lower(c.product_name), needle),
        similarity(lower(COALESCE(c.brand, '')), needle) * 0.8
      )::REAL AS rank
    FROM candidates c
    WHERE COALESCE(array_length(c.clean_ingredients, 1), 0) >= 5
      AND (
        lower(c.product_name) LIKE '%' || needle || '%'
        OR lower(COALESCE(c.brand, '')) LIKE '%' || needle || '%'
        OR similarity(lower(c.product_name), needle) > 0.15
        OR similarity(lower(COALESCE(c.brand, '')), needle) > 0.15
      )
  )
  SELECT
    r.cache_key,
    r.product_name,
    r.brand,
    r.clean_ingredient_count AS ingredient_count,
    r.source,
    r.image_url,
    r.clean_ingredients AS ingredients,
    array_to_string(r.clean_ingredients, ', ') AS ingredient_text,
    r.nutritional_info,
    r.nutrient_panel,
    COALESCE(r.has_published_nutrients, FALSE) AS has_published_nutrients,
    r.source_url,
    r.rank
  FROM ranked r
  ORDER BY r.rank DESC, r.clean_ingredient_count DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_products(TEXT, INT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INT)
  TO anon, authenticated;

ANALYZE public.product_data;

NOTIFY pgrst, 'reload schema';
