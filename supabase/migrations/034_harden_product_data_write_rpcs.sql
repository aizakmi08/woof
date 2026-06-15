-- Future product_data writes must preserve the same sanitized ingredient/count
-- contract that search_products() and the client readers enforce.
-- Keep the existing RPC signatures for Edge/scripts, but derive the persisted
-- ingredient_text and ingredient_count from plausible ingredients in Postgres.

CREATE OR REPLACE FUNCTION public.save_product_data(
  p_cache_key TEXT,
  p_product_name TEXT,
  p_brand TEXT,
  p_ingredients TEXT[],
  p_ingredient_text TEXT,
  p_ingredient_count INTEGER,
  p_source TEXT DEFAULT 'user_ocr',
  p_image_url TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_ingredients TEXT[];
  clean_ingredient_text TEXT;
  clean_ingredient_count INT;
BEGIN
  -- Compatibility parameters retained for existing callers; persistence derives
  -- both values from clean_ingredients below.
  PERFORM p_ingredient_text;
  PERFORM p_ingredient_count;

  clean_ingredients := ARRAY(
    SELECT trim(ingredient.value)
    FROM unnest(COALESCE(p_ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
    WHERE public.is_plausible_product_ingredient(ingredient.value)
  );
  clean_ingredient_text := array_to_string(clean_ingredients, ', ');
  clean_ingredient_count := COALESCE(array_length(clean_ingredients, 1), 0);

  IF p_cache_key IS NULL
     OR LENGTH(TRIM(p_cache_key)) < 3
     OR clean_ingredient_count < 5 THEN
    RAISE EXCEPTION 'Invalid product data payload'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, image_url, scraped_at, expires_at
  )
  VALUES (
    p_cache_key,
    p_product_name,
    p_brand,
    clean_ingredients,
    clean_ingredient_text,
    clean_ingredient_count,
    p_source,
    p_image_url,
    NOW(),
    NOW() + INTERVAL '90 days'
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    product_name = COALESCE(EXCLUDED.product_name, public.product_data.product_name),
    brand = COALESCE(EXCLUDED.brand, public.product_data.brand),
    ingredients = CASE
      WHEN public.product_data.source IN ('opff', 'dfa', 'cfa', 'cats', 'chewy', 'amazon', 'brand_site')
           AND EXCLUDED.source = 'user_ocr'
        THEN public.product_data.ingredients
      WHEN EXCLUDED.ingredient_count >= COALESCE(array_length(public.product_data.ingredients, 1), 0)
        THEN EXCLUDED.ingredients
      ELSE public.product_data.ingredients
    END,
    ingredient_text = CASE
      WHEN public.product_data.source IN ('opff', 'dfa', 'cfa', 'cats', 'chewy', 'amazon', 'brand_site')
           AND EXCLUDED.source = 'user_ocr'
        THEN public.product_data.ingredient_text
      WHEN EXCLUDED.ingredient_count >= COALESCE(array_length(public.product_data.ingredients, 1), 0)
        THEN EXCLUDED.ingredient_text
      ELSE public.product_data.ingredient_text
    END,
    ingredient_count = CASE
      WHEN public.product_data.source IN ('opff', 'dfa', 'cfa', 'cats', 'chewy', 'amazon', 'brand_site')
           AND EXCLUDED.source = 'user_ocr'
        THEN COALESCE(array_length(public.product_data.ingredients, 1), 0)
      WHEN EXCLUDED.ingredient_count >= COALESCE(array_length(public.product_data.ingredients, 1), 0)
        THEN EXCLUDED.ingredient_count
      ELSE COALESCE(array_length(public.product_data.ingredients, 1), 0)
    END,
    source = CASE
      WHEN public.product_data.source IN ('opff', 'dfa', 'cfa', 'cats', 'chewy', 'amazon', 'brand_site')
           AND EXCLUDED.source = 'user_ocr'
        THEN public.product_data.source
      ELSE COALESCE(EXCLUDED.source, public.product_data.source)
    END,
    image_url = COALESCE(EXCLUDED.image_url, public.product_data.image_url),
    scraped_at = NOW(),
    expires_at = NOW() + INTERVAL '90 days',
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.save_product_data_with_nutrients(
  p_cache_key TEXT,
  p_product_name TEXT,
  p_brand TEXT,
  p_ingredients TEXT[],
  p_ingredient_text TEXT,
  p_ingredient_count INT,
  p_source TEXT,
  p_image_url TEXT DEFAULT NULL,
  p_nutrient_panel JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_ingredients TEXT[];
  clean_ingredient_text TEXT;
  clean_ingredient_count INT;
BEGIN
  -- Compatibility parameters retained for existing callers; persistence derives
  -- both values from clean_ingredients below.
  PERFORM p_ingredient_text;
  PERFORM p_ingredient_count;

  clean_ingredients := ARRAY(
    SELECT trim(ingredient.value)
    FROM unnest(COALESCE(p_ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
    WHERE public.is_plausible_product_ingredient(ingredient.value)
  );
  clean_ingredient_text := array_to_string(clean_ingredients, ', ');
  clean_ingredient_count := COALESCE(array_length(clean_ingredients, 1), 0);

  IF p_cache_key IS NULL
     OR LENGTH(TRIM(p_cache_key)) < 3
     OR clean_ingredient_count < 5 THEN
    RAISE EXCEPTION 'Invalid product data payload'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, nutritional_info, source, image_url, scraped_at,
    expires_at, nutrient_panel, has_published_nutrients
  ) VALUES (
    p_cache_key,
    p_product_name,
    p_brand,
    clean_ingredients,
    clean_ingredient_text,
    clean_ingredient_count,
    NULL,
    p_source,
    p_image_url,
    NOW(),
    NOW() + INTERVAL '365 days',
    p_nutrient_panel,
    p_nutrient_panel IS NOT NULL
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    product_name = COALESCE(EXCLUDED.product_name, public.product_data.product_name),
    brand = COALESCE(EXCLUDED.brand, public.product_data.brand),
    ingredients = CASE
      WHEN EXCLUDED.ingredient_count >= COALESCE(array_length(public.product_data.ingredients, 1), 0)
        THEN EXCLUDED.ingredients
      ELSE public.product_data.ingredients
    END,
    ingredient_text = CASE
      WHEN EXCLUDED.ingredient_count >= COALESCE(array_length(public.product_data.ingredients, 1), 0)
        THEN EXCLUDED.ingredient_text
      ELSE public.product_data.ingredient_text
    END,
    ingredient_count = CASE
      WHEN EXCLUDED.ingredient_count >= COALESCE(array_length(public.product_data.ingredients, 1), 0)
        THEN EXCLUDED.ingredient_count
      ELSE COALESCE(array_length(public.product_data.ingredients, 1), 0)
    END,
    source = COALESCE(EXCLUDED.source, public.product_data.source),
    image_url = COALESCE(EXCLUDED.image_url, public.product_data.image_url),
    nutrient_panel = COALESCE(EXCLUDED.nutrient_panel, public.product_data.nutrient_panel),
    has_published_nutrients = public.product_data.has_published_nutrients OR EXCLUDED.has_published_nutrients,
    scraped_at = NOW(),
    expires_at = NOW() + INTERVAL '365 days',
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.save_product_data(TEXT, TEXT, TEXT, TEXT[], TEXT, INTEGER, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_data(TEXT, TEXT, TEXT, TEXT[], TEXT, INTEGER, TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.save_product_data_with_nutrients(TEXT, TEXT, TEXT, TEXT[], TEXT, INT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_data_with_nutrients(TEXT, TEXT, TEXT, TEXT[], TEXT, INT, TEXT, TEXT, JSONB)
  TO service_role;
