-- Preserve exact source-backed ingredient names while still rejecting obvious
-- JSON/config artifacts, and prevent official feed reimports from duplicating
-- the same source/product URL under a changed cache key.

CREATE OR REPLACE FUNCTION public.is_plausible_product_ingredient(value TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT
    value IS NOT NULL
    AND length(trim(value)) BETWEEN 2 AND 200
    AND trim(value) !~ $re$[\[\]]$re$
    AND trim(value) !~ $re$^[\["']$re$
    AND trim(value) !~ $re$:\s*["']$re$
    AND trim(value) !~ $re$["']\s*:$re$
    AND trim(value) !~ '^\s*[{}]'
    AND trim(value) !~ '[{}]\s*$'
    AND trim(value) !~* $re$\m(mailto:|https?://)$re$
    AND trim(value) !~* $re$\m(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName)$re$
    AND length(regexp_replace(trim(value), '[^A-Za-z]', '', 'g')) >= 2;
$$;

DO $$
BEGIN
  IF NOT public.is_plausible_product_ingredient('Calcium Pantothenate {Vitamin B5)') THEN
    RAISE EXCEPTION 'ingredient validator must preserve source-backed ingredient names with internal braces';
  END IF;

  IF public.is_plausible_product_ingredient('"sourceId": "abc"') THEN
    RAISE EXCEPTION 'ingredient validator must reject JSON object fragments';
  END IF;

  IF public.is_plausible_product_ingredient('{"name":"Chicken"}') THEN
    RAISE EXCEPTION 'ingredient validator must reject JSON object payloads';
  END IF;
END;
$$;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        source,
        source_url,
        lower(product_name),
        lower(COALESCE(brand, ''))
      ORDER BY
        CASE
          WHEN ingredient_verification_status IN (
            'gdsn',
            'official',
            'manufacturer',
            'retailer_verified',
            'label_ocr_verified'
          ) THEN 0
          ELSE 1
        END,
        CASE
          WHEN image_verification_status IN (
            'official',
            'manufacturer',
            'retailer_verified'
          ) THEN 0
          ELSE 1
        END,
        updated_at DESC NULLS LAST,
        verified_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.product_data
  WHERE source IS NOT NULL
    AND source_url IS NOT NULL
)
DELETE FROM public.product_data product
USING ranked
WHERE product.id = ranked.id
  AND ranked.rn > 1;

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
WITH feed_with_ordinality AS (
  SELECT product.payload_row, product.ordinality
  FROM jsonb_array_elements(COALESCE(payload, '[]'::jsonb)) WITH ORDINALITY AS product(payload_row, ordinality)
),
feed AS (
  SELECT
    parsed.*,
    feed_with_ordinality.ordinality
  FROM feed_with_ordinality
  CROSS JOIN LATERAL jsonb_to_record(feed_with_ordinality.payload_row) AS parsed(
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
  WHERE NULLIF(btrim(parsed.cache_key), '') IS NOT NULL
),
deduped_feed AS (
  SELECT DISTINCT ON (cache_key)
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
  FROM feed
  ORDER BY
    cache_key,
    CASE WHEN ingredient_verification_status = 'manufacturer' THEN 0 ELSE 1 END,
    CASE WHEN image_verification_status = 'manufacturer' THEN 0 ELSE 1 END,
    CASE WHEN COALESCE(is_complete_food, TRUE) THEN 0 ELSE 1 END,
    ordinality DESC
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
  FROM deduped_feed
),
removed_source_url_duplicates AS (
  DELETE FROM public.product_data existing
  USING normalized incoming
  WHERE NULLIF(btrim(incoming.source), '') IS NOT NULL
    AND NULLIF(btrim(incoming.source_url), '') IS NOT NULL
    AND existing.cache_key <> incoming.cache_key
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
