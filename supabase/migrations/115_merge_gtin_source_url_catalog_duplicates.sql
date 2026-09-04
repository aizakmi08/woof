-- Merge source-URL duplicates created when an official feed later discovers GTINs.
-- The visible search result should not show both the old no-GTIN row and the
-- newer GTIN-backed row for the same official source/product URL.

WITH deleted AS (
  DELETE FROM public.product_data old
  USING public.product_data newer
  WHERE old.gtin IS NULL
    AND newer.gtin IS NOT NULL
    AND old.source_url IS NOT NULL
    AND newer.source_url IS NOT NULL
    AND old.id <> newer.id
    AND old.source = newer.source
    AND old.source_url = newer.source_url
    AND lower(old.product_name) = lower(newer.product_name)
    AND lower(COALESCE(old.brand, '')) = lower(COALESCE(newer.brand, ''))
  RETURNING old.id
)
SELECT count(*) AS deleted_source_url_duplicate_rows
FROM deleted;

CREATE OR REPLACE FUNCTION public.upsert_catalog_product_feed(payload JSONB)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  source_url TEXT
)
LANGUAGE SQL
SECURITY INVOKER
SET search_path = public
AS $$
WITH feed AS (
  SELECT *
  FROM jsonb_to_recordset(COALESCE(payload, '[]'::jsonb)) AS product(
    cache_key TEXT,
    product_name TEXT,
    brand TEXT,
    gtin TEXT,
    product_line TEXT,
    flavor TEXT,
    life_stage TEXT,
    food_form TEXT,
    package_size TEXT,
    pet_type TEXT,
    ingredients JSONB,
    ingredient_text TEXT,
    nutritional_info JSONB,
    nutrient_panel JSONB,
    has_published_nutrients BOOLEAN,
    source TEXT,
    source_quality TEXT,
    ingredient_verification_status TEXT,
    image_verification_status TEXT,
    verified_at TIMESTAMPTZ,
    source_url TEXT,
    scraped_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    image_url TEXT,
    is_complete_food BOOLEAN,
    catalog_exclusion_reason TEXT,
    updated_at TIMESTAMPTZ
  )
),
normalized AS (
  SELECT
    cache_key,
    product_name,
    brand,
    gtin,
    product_line,
    flavor,
    life_stage,
    food_form,
    package_size,
    pet_type,
    COALESCE((
      SELECT array_agg(value ORDER BY ordinal)
      FROM jsonb_array_elements_text(COALESCE(ingredients, '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinal)
    ), regexp_split_to_array(NULLIF(ingredient_text, ''), '\s*,\s*'), ARRAY[]::TEXT[]) AS ingredients,
    ingredient_text,
    nutritional_info,
    nutrient_panel,
    COALESCE(has_published_nutrients, FALSE) AS has_published_nutrients,
    source,
    source_quality,
    ingredient_verification_status,
    image_verification_status,
    verified_at,
    source_url,
    scraped_at,
    expires_at,
    image_url,
    COALESCE(is_complete_food, TRUE) AS is_complete_food,
    catalog_exclusion_reason,
    updated_at
  FROM feed
),
removed_source_url_duplicates AS (
  DELETE FROM public.product_data existing
  USING normalized incoming
  WHERE incoming.gtin IS NOT NULL
    AND incoming.source_url IS NOT NULL
    AND existing.cache_key <> incoming.cache_key
    AND existing.gtin IS NULL
    AND existing.source = incoming.source
    AND existing.source_url = incoming.source_url
    AND lower(existing.product_name) = lower(incoming.product_name)
    AND lower(COALESCE(existing.brand, '')) = lower(COALESCE(incoming.brand, ''))
  RETURNING existing.cache_key
),
upserted AS (
  INSERT INTO public.product_data (
    cache_key,
    product_name,
    brand,
    gtin,
    product_line,
    flavor,
    life_stage,
    food_form,
    package_size,
    pet_type,
    ingredients,
    ingredient_text,
    ingredient_count,
    nutritional_info,
    nutrient_panel,
    has_published_nutrients,
    source,
    source_quality,
    ingredient_verification_status,
    image_verification_status,
    verified_at,
    source_url,
    scraped_at,
    expires_at,
    image_url,
    is_complete_food,
    catalog_exclusion_reason,
    updated_at
  )
  SELECT
    cache_key,
    product_name,
    brand,
    gtin,
    product_line,
    flavor,
    life_stage,
    food_form,
    package_size,
    pet_type,
    ingredients,
    COALESCE(NULLIF(ingredient_text, ''), array_to_string(ingredients, ', ')) AS ingredient_text,
    COALESCE(array_length(ingredients, 1), 0) AS ingredient_count,
    nutritional_info,
    nutrient_panel,
    has_published_nutrients,
    source,
    source_quality,
    ingredient_verification_status,
    image_verification_status,
    verified_at,
    source_url,
    scraped_at,
    expires_at,
    image_url,
    is_complete_food,
    catalog_exclusion_reason,
    updated_at
  FROM normalized
  ON CONFLICT (cache_key) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    brand = EXCLUDED.brand,
    gtin = EXCLUDED.gtin,
    product_line = EXCLUDED.product_line,
    flavor = EXCLUDED.flavor,
    life_stage = EXCLUDED.life_stage,
    food_form = EXCLUDED.food_form,
    package_size = EXCLUDED.package_size,
    pet_type = EXCLUDED.pet_type,
    ingredients = EXCLUDED.ingredients,
    ingredient_text = EXCLUDED.ingredient_text,
    ingredient_count = EXCLUDED.ingredient_count,
    nutritional_info = EXCLUDED.nutritional_info,
    nutrient_panel = EXCLUDED.nutrient_panel,
    has_published_nutrients = EXCLUDED.has_published_nutrients,
    source = EXCLUDED.source,
    source_quality = EXCLUDED.source_quality,
    ingredient_verification_status = EXCLUDED.ingredient_verification_status,
    image_verification_status = EXCLUDED.image_verification_status,
    verified_at = EXCLUDED.verified_at,
    source_url = EXCLUDED.source_url,
    scraped_at = EXCLUDED.scraped_at,
    expires_at = EXCLUDED.expires_at,
    image_url = EXCLUDED.image_url,
    is_complete_food = EXCLUDED.is_complete_food,
    catalog_exclusion_reason = EXCLUDED.catalog_exclusion_reason,
    updated_at = EXCLUDED.updated_at
  RETURNING
    product_data.cache_key,
    product_data.product_name,
    product_data.brand,
    product_data.source_url
)
SELECT
  upserted.cache_key,
  upserted.product_name,
  upserted.brand,
  upserted.source_url
FROM upserted;
$$;

REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_feed(JSONB) TO service_role;
