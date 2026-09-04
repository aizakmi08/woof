-- Make official feed imports idempotent across source URL and cache-key drift.
-- Some official importers have changed slug/cache-key normalization over time;
-- inserting the same product again under a new key would inflate verified
-- coverage and create ambiguous search results. Existing strict verified rows
-- with the same source, brand, product identity, species, GTIN/package identity
-- now cause the incoming duplicate to be skipped.

CREATE OR REPLACE FUNCTION public.catalog_product_feed_identity_key(
  p_brand TEXT,
  p_product_name TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    btrim(regexp_replace(lower(regexp_replace(COALESCE(p_brand, ''), '<[^>]+>', ' ', 'g')), '[^a-z0-9]+', ' ', 'g')) AS brand_key,
    btrim(regexp_replace(lower(regexp_replace(COALESCE(p_product_name, ''), '<[^>]+>', ' ', 'g')), '[^a-z0-9]+', ' ', 'g')) AS name_key
),
stripped AS (
  SELECT CASE
    WHEN brand_key <> '' AND name_key LIKE brand_key || ' %'
      THEN btrim(substr(name_key, length(brand_key) + 2))
    ELSE name_key
  END AS value
  FROM normalized
)
SELECT NULLIF(btrim(regexp_replace(value, '\s+', ' ', 'g')), '')
FROM stripped;
$$;

REVOKE ALL ON FUNCTION public.catalog_product_feed_identity_key(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_product_feed_identity_key(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_product_feed_identity_key(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_product_feed_identity_key(TEXT, TEXT) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.upsert_catalog_product_feed(jsonb)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed not found';
  END IF;

  IF function_sql NOT LIKE '%identity duplicate skip guard%' THEN
    function_sql := replace(
      function_sql,
      $$removed_source_url_duplicates AS (
  DELETE FROM public.product_data existing
  USING normalized incoming
  WHERE NULLIF(btrim(incoming.source), '') IS NOT NULL
    AND NULLIF(btrim(incoming.source_url), '') IS NOT NULL
    AND existing.cache_key <> incoming.cache_key
    AND existing.source = incoming.source
    AND existing.source_url = incoming.source_url
    AND lower(existing.product_name) = lower(incoming.product_name)
    AND lower(COALESCE(existing.brand, '')) = lower(COALESCE(incoming.brand, ''))
    AND (
      NULLIF(btrim(existing.gtin), '') IS NULL
      OR NULLIF(btrim(incoming.gtin), '') IS NULL
      OR existing.gtin = incoming.gtin
    )
    AND (
      NULLIF(btrim(existing.package_size), '') IS NULL
      OR NULLIF(btrim(incoming.package_size), '') IS NULL
      OR lower(existing.package_size) = lower(incoming.package_size)
    )
  RETURNING existing.cache_key
),
upserted AS ($$,
      $$removed_source_url_duplicates AS (
  DELETE FROM public.product_data existing
  USING normalized incoming
  WHERE NULLIF(btrim(incoming.source), '') IS NOT NULL
    AND NULLIF(btrim(incoming.source_url), '') IS NOT NULL
    AND existing.cache_key <> incoming.cache_key
    AND existing.source = incoming.source
    AND existing.source_url = incoming.source_url
    AND lower(existing.product_name) = lower(incoming.product_name)
    AND lower(COALESCE(existing.brand, '')) = lower(COALESCE(incoming.brand, ''))
    AND (
      NULLIF(btrim(existing.gtin), '') IS NULL
      OR NULLIF(btrim(incoming.gtin), '') IS NULL
      OR existing.gtin = incoming.gtin
    )
    AND (
      NULLIF(btrim(existing.package_size), '') IS NULL
      OR NULLIF(btrim(incoming.package_size), '') IS NULL
      OR lower(existing.package_size) = lower(incoming.package_size)
    )
  RETURNING existing.cache_key
),
identity_duplicate_skips AS (
  SELECT incoming.cache_key
  FROM normalized incoming
  JOIN public.product_data existing
    ON NULLIF(btrim(incoming.source), '') IS NOT NULL
   AND existing.cache_key <> incoming.cache_key
   AND existing.source = incoming.source
   AND lower(COALESCE(existing.brand, '')) = lower(COALESCE(incoming.brand, ''))
   AND public.catalog_product_feed_identity_key(existing.brand, existing.product_name)
       = public.catalog_product_feed_identity_key(incoming.brand, incoming.product_name)
   AND public.catalog_product_feed_identity_key(incoming.brand, incoming.product_name) IS NOT NULL
   AND (
      NULLIF(btrim(existing.gtin), '') IS NULL
      OR NULLIF(btrim(incoming.gtin), '') IS NULL
      OR existing.gtin = incoming.gtin
   )
   AND (
      NULLIF(btrim(existing.package_size), '') IS NULL
      OR NULLIF(btrim(incoming.package_size), '') IS NULL
      OR lower(existing.package_size) = lower(incoming.package_size)
   )
   AND (
      NULLIF(btrim(existing.pet_type), '') IS NULL
      OR NULLIF(btrim(incoming.pet_type), '') IS NULL
      OR lower(existing.pet_type) = lower(incoming.pet_type)
   )
  WHERE existing.is_complete_food IS TRUE
    AND COALESCE(existing.catalog_exclusion_reason, '') = ''
    AND (existing.expires_at IS NULL OR existing.expires_at > now())
    AND existing.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
    AND existing.image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
    AND NULLIF(btrim(existing.source_url), '') IS NOT NULL
    AND NULLIF(btrim(existing.image_url), '') IS NOT NULL
    AND existing.image_url !~* '^data:'
    AND NULLIF(btrim(existing.ingredient_text), '') IS NOT NULL
    AND COALESCE(existing.ingredient_count, 0) >= 5
  -- identity duplicate skip guard
),
upserted AS ($$
    );

    function_sql := replace(
      function_sql,
      $$  FROM normalized
  ON CONFLICT (cache_key) DO UPDATE SET$$,
      $$  FROM normalized
  WHERE NOT EXISTS (
    SELECT 1
    FROM identity_duplicate_skips skipped
    WHERE skipped.cache_key = normalized.cache_key
  )
  ON CONFLICT (cache_key) DO UPDATE SET$$
    );
  END IF;

  IF function_sql NOT LIKE '%identity duplicate skip guard%'
     OR function_sql NOT LIKE '%catalog_product_feed_identity_key(existing.brand, existing.product_name)%'
     OR function_sql NOT LIKE '%FROM identity_duplicate_skips skipped%' THEN
    RAISE EXCEPTION 'identity duplicate guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_feed(JSONB) TO service_role;

DO $$
DECLARE
  fn TEXT;
BEGIN
  IF public.catalog_product_feed_identity_key(
    'Blue Buffalo',
    'Blue Buffalo BLUE Life Protection Formula Adult Dog Food - Chicken & Brown Rice'
  ) <> public.catalog_product_feed_identity_key(
    'Blue Buffalo',
    'BLUE Life Protection Formula Adult Dog Food - Chicken & Brown Rice'
  ) THEN
    RAISE EXCEPTION 'identity key should ignore leading brand prefix';
  END IF;

  IF public.catalog_product_feed_identity_key(
    'Blue Buffalo',
    'BLUE Basics <sup></sup> Grain-Free Wet Dog Food - Turkey & Potato'
  ) <> 'blue basics grain free wet dog food turkey potato' THEN
    RAISE EXCEPTION 'identity key should remove html markup and punctuation';
  END IF;

  SELECT pg_get_functiondef('public.upsert_catalog_product_feed(jsonb)'::regprocedure)
  INTO fn;

  IF fn NOT LIKE '%identity duplicate skip guard%' THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed must contain identity duplicate skip guard';
  END IF;
END $$;
