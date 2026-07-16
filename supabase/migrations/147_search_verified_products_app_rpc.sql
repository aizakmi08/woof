CREATE OR REPLACE FUNCTION public.search_verified_products(q TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE (
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
  ingredient_count INTEGER,
  source TEXT,
  source_quality TEXT,
  ingredient_verification_status TEXT,
  image_verification_status TEXT,
  verified_at TIMESTAMPTZ,
  image_url TEXT,
  ingredients TEXT[],
  ingredient_text TEXT,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN,
  source_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(trim(q))), '[^a-z0-9]+', ' ', 'g')), '') AS normalized,
      LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) AS safe_limit
  ),
  query AS (
    SELECT
      normalized,
      safe_limit,
      CASE
        WHEN length(normalized) >= 2 THEN
          to_tsquery('simple', regexp_replace(normalized, '[[:space:]]+', ':* & ', 'g') || ':*')
        ELSE NULL
      END AS ts_query,
      normalized ~ '\m(dogs?|pupp(y|ies)|canine|canines)\M' AS query_has_dog,
      normalized ~ '\m(cats?|kitten|kittens|feline|felines)\M' AS query_has_cat
    FROM input
  ),
  ready AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
      NULLIF(trim(pd.gtin), '') AS gtin,
      NULLIF(trim(pd.product_line), '') AS product_line,
      NULLIF(trim(pd.flavor), '') AS flavor,
      NULLIF(trim(pd.life_stage), '') AS life_stage,
      NULLIF(trim(pd.food_form), '') AS food_form,
      NULLIF(trim(pd.package_size), '') AS package_size,
      COALESCE(pd.pet_type, 'unknown') AS pet_type,
      pd.ingredient_count,
      pd.source,
      COALESCE(pd.source_quality, 'unknown') AS source_quality,
      COALESCE(pd.ingredient_verification_status, 'unverified') AS ingredient_verification_status,
      COALESCE(pd.image_verification_status, 'unverified') AS image_verification_status,
      pd.verified_at,
      CASE WHEN pd.image_url ILIKE 'data:%' THEN NULL ELSE pd.image_url END AS image_url,
      pd.ingredients,
      COALESCE(NULLIF(pd.ingredient_text, ''), array_to_string(pd.ingredients, ', ')) AS ingredient_text,
      pd.nutritional_info,
      pd.nutrient_panel,
      COALESCE(pd.has_published_nutrients, FALSE) AS has_published_nutrients,
      pd.source_url,
      pd.search_document,
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(COALESCE(pd.product_name, ''))), '[^a-z0-9]+', ' ', 'g')), '') AS product_name_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(COALESCE(pd.brand, ''))), '[^a-z0-9]+', ' ', 'g')), '') AS brand_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(concat_ws(
        ' ',
        pd.brand,
        pd.product_name,
        pd.product_line,
        pd.flavor,
        pd.life_stage,
        pd.food_form,
        pd.package_size,
        pd.gtin
      ))), '[^a-z0-9]+', ' ', 'g')), '') AS identity_lc
    FROM public.product_data pd
    CROSS JOIN query
    WHERE query.normalized IS NOT NULL
      AND pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND lower(COALESCE(pd.pet_type, '')) IN ('dog', 'cat')
      AND (NOT query.query_has_dog OR pd.pet_type = 'dog')
      AND (NOT query.query_has_cat OR pd.pet_type = 'cat')
      AND COALESCE(NULLIF(trim(pd.source_url), ''), '') <> ''
      AND pd.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND pd.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
      AND pd.image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
      AND pd.image_url IS NOT NULL
      AND pd.image_url !~* '^data:'
  ),
  scored AS (
    SELECT
      r.cache_key,
      r.product_name,
      r.brand,
      r.gtin,
      r.product_line,
      r.flavor,
      r.life_stage,
      r.food_form,
      r.package_size,
      r.pet_type,
      r.ingredient_count,
      r.source,
      r.source_quality,
      r.ingredient_verification_status,
      r.image_verification_status,
      r.verified_at,
      r.image_url,
      r.ingredients,
      r.ingredient_text,
      r.nutritional_info,
      r.nutrient_panel,
      r.has_published_nutrients,
      r.source_url,
      (
        CASE WHEN r.gtin = query.normalized THEN 12.0 ELSE 0.0 END +
        CASE WHEN r.identity_lc = query.normalized THEN 10.0 ELSE 0.0 END +
        CASE WHEN r.product_name_lc = query.normalized THEN 8.0 ELSE 0.0 END +
        CASE WHEN r.identity_lc LIKE '%' || query.normalized || '%' THEN 6.5 ELSE 0.0 END +
        CASE
          WHEN r.brand_lc IS NOT NULL
            AND query.normalized LIKE '%' || r.brand_lc || '%'
          THEN 2.0
          ELSE 0.0
        END +
        CASE
          WHEN query.query_has_dog AND r.pet_type = 'dog' THEN 0.8
          WHEN query.query_has_cat AND r.pet_type = 'cat' THEN 0.8
          ELSE 0.0
        END +
        COALESCE(ts_rank_cd(r.search_document, query.ts_query), 0.0) * 1.4 +
        GREATEST(
          similarity(r.product_name_lc, query.normalized) * 1.15,
          similarity(r.identity_lc, query.normalized) * 1.05,
          word_similarity(query.normalized, r.identity_lc) * 0.95,
          word_similarity(query.normalized, r.brand_lc || ' ' || r.product_name_lc) * 0.90
        )
      )::REAL AS rank
    FROM ready r
    CROSS JOIN query
    WHERE query.ts_query IS NOT NULL
      AND (
        r.search_document @@ query.ts_query
        OR r.gtin = query.normalized
        OR r.identity_lc LIKE '%' || query.normalized || '%'
        OR (
          r.brand_lc IS NOT NULL
          AND query.normalized LIKE '%' || r.brand_lc || '%'
          AND (
            word_similarity(query.normalized, r.identity_lc) > 0.42
            OR similarity(r.identity_lc, query.normalized) > 0.18
          )
        )
        OR (
          query.normalized !~ '\m[a-z0-9]{9,}\M'
          AND word_similarity(query.normalized, r.identity_lc) > 0.70
        )
      )
  )
  SELECT
    scored.cache_key,
    scored.product_name,
    scored.brand,
    scored.gtin,
    scored.product_line,
    scored.flavor,
    scored.life_stage,
    scored.food_form,
    scored.package_size,
    scored.pet_type,
    scored.ingredient_count,
    scored.source,
    scored.source_quality,
    scored.ingredient_verification_status,
    scored.image_verification_status,
    scored.verified_at,
    scored.image_url,
    scored.ingredients,
    scored.ingredient_text,
    scored.nutritional_info,
    scored.nutrient_panel,
    scored.has_published_nutrients,
    scored.source_url,
    scored.rank
  FROM scored
  WHERE scored.rank >= 3.0
  ORDER BY scored.rank DESC, scored.ingredient_count DESC
  LIMIT (SELECT safe_limit FROM query);
$$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
