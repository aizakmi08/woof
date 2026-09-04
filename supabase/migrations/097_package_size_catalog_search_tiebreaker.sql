-- Rank exact package-size matches ahead of sibling package variants when the
-- typed or parsed label query includes a size such as "30 pounds" or "10 bags".
-- Package size is still only a search/display tie-breaker; recipe identity and
-- ingredient verification remain the primary safety gates.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.search_products(q TEXT, max_results INTEGER DEFAULT 10)
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
      LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) AS safe_limit,
      LEAST(LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) * 8, 160) AS candidate_limit
  ),
  query AS (
    SELECT
      normalized,
      safe_limit,
      candidate_limit,
      NULLIF(trim(regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  COALESCE((regexp_match(normalized, '([0-9]+([.][0-9]+)?[[:space:]]*(pounds?|lbs?|ounces?|oz|bags?|cans?|count|ct))'))[1], ''),
                  '([0-9])([a-z])',
                  '\1 \2',
                  'g'
                ),
                '\m(lbs?|pounds?)\M',
                'pound',
                'g'
              ),
              '\m(ounces?|oz)\M',
              'ounce',
              'g'
            ),
            '\m(bags?)\M',
            'bag',
            'g'
          ),
          '\m(cans?)\M',
          'can',
          'g'
        ),
        '\m(count|ct)\M',
        'count',
        'g'
      )), '') AS package_query_key,
      CASE
        WHEN length(normalized) >= 2 THEN
          to_tsquery('simple', regexp_replace(normalized, '[[:space:]]+', ':* & ', 'g') || ':*')
        ELSE NULL
      END AS ts_query
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
      ))), '[^a-z0-9]+', ' ', 'g')), '') AS identity_lc,
      NULLIF(trim(regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(extensions.unaccent(lower(COALESCE(pd.package_size, ''))), '[^a-z0-9]+', ' ', 'g'),
                  '([0-9])([a-z])',
                  '\1 \2',
                  'g'
                ),
                '\m(lbs?|pounds?)\M',
                'pound',
                'g'
              ),
              '\m(ounces?|oz)\M',
              'ounce',
              'g'
            ),
            '\m(bags?)\M',
            'bag',
            'g'
          ),
          '\m(cans?)\M',
          'can',
          'g'
        ),
        '\m(count|ct)\M',
        'count',
        'g'
      )), '') AS package_size_key,
      CASE
        WHEN pd.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified') THEN 1.25
        WHEN pd.ingredient_verification_status = 'community' THEN 0.20
        ELSE 0.0
      END AS verified_rank_bonus
    FROM public.product_data pd
    WHERE pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
  ),
  strict_matched AS (
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
      (1.0 + GREATEST(
        CASE WHEN r.gtin = query.normalized THEN 3.0 ELSE 0.0 END,
        CASE WHEN r.product_name_lc = query.normalized THEN 2.0 ELSE 0.0 END,
        CASE WHEN r.brand_lc = query.normalized THEN 1.6 ELSE 0.0 END,
        CASE WHEN r.product_name_lc LIKE query.normalized || '%' THEN 1.4 ELSE 0.0 END,
        CASE WHEN r.identity_lc LIKE '%' || query.normalized || '%' THEN 1.35 ELSE 0.0 END,
        CASE WHEN r.brand_lc LIKE query.normalized || '%' THEN 1.2 ELSE 0.0 END,
        ts_rank_cd(r.search_document, query.ts_query) * 1.4
      ) + CASE
        WHEN query.package_query_key IS NOT NULL
          AND r.package_size_key = query.package_query_key
        THEN 0.45
        WHEN query.package_query_key IS NOT NULL
          AND r.package_size_key LIKE '%' || query.package_query_key || '%'
        THEN 0.25
        ELSE 0.0
      END + CASE
        WHEN r.identity_lc LIKE '%' || query.normalized || '%'
          OR word_similarity(query.normalized, r.identity_lc) > 0.72
        THEN r.verified_rank_bonus
        ELSE r.verified_rank_bonus * 0.25
      END)::REAL AS rank
    FROM ready r
    CROSS JOIN query
    WHERE query.ts_query IS NOT NULL
      AND (
        r.search_document @@ query.ts_query
        OR r.identity_lc LIKE '%' || query.normalized || '%'
        OR r.gtin = query.normalized
      )
    ORDER BY rank DESC, r.ingredient_count DESC
    LIMIT (SELECT candidate_limit FROM query)
  ),
  fuzzy_matched AS (
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
      (GREATEST(
        CASE WHEN r.product_name_lc LIKE '%' || query.normalized || '%' THEN 0.9 ELSE 0.0 END,
        CASE WHEN r.identity_lc LIKE '%' || query.normalized || '%' THEN 0.88 ELSE 0.0 END,
        CASE WHEN r.brand_lc LIKE query.normalized || '%' THEN 0.82 ELSE 0.0 END,
        similarity(r.product_name_lc, query.normalized) * 0.95,
        similarity(r.identity_lc, query.normalized) * 0.9,
        similarity(r.brand_lc, query.normalized) * 0.8,
        word_similarity(query.normalized, r.identity_lc) * 0.78,
        word_similarity(query.normalized, r.brand_lc || ' ' || r.product_name_lc) * 0.72
      ) + CASE
        WHEN query.package_query_key IS NOT NULL
          AND r.package_size_key = query.package_query_key
        THEN 0.45
        WHEN query.package_query_key IS NOT NULL
          AND r.package_size_key LIKE '%' || query.package_query_key || '%'
        THEN 0.25
        ELSE 0.0
      END + CASE
        WHEN r.identity_lc LIKE '%' || query.normalized || '%'
          OR word_similarity(query.normalized, r.identity_lc) > 0.72
        THEN r.verified_rank_bonus
        ELSE r.verified_rank_bonus * 0.25
      END)::REAL AS rank
    FROM ready r
    CROSS JOIN query
    WHERE query.normalized IS NOT NULL
      AND (SELECT count(*) FROM strict_matched) < query.safe_limit
      AND (
        r.product_name_lc LIKE '%' || query.normalized || '%'
        OR r.identity_lc LIKE '%' || query.normalized || '%'
        OR r.brand_lc LIKE query.normalized || '%'
        OR similarity(r.product_name_lc, query.normalized) > 0.24
        OR similarity(r.identity_lc, query.normalized) > 0.24
        OR similarity(r.brand_lc, query.normalized) > 0.28
        OR word_similarity(query.normalized, r.identity_lc) > 0.54
        OR word_similarity(query.normalized, r.brand_lc || ' ' || r.product_name_lc) > 0.54
      )
    ORDER BY rank DESC, r.ingredient_count DESC
    LIMIT (SELECT candidate_limit FROM query)
  ),
  matched AS (
    SELECT DISTINCT ON (cache_key) *
    FROM (
      SELECT * FROM strict_matched
      UNION ALL
      SELECT * FROM fuzzy_matched
    ) combined
    ORDER BY cache_key, rank DESC, ingredient_count DESC
  )
  SELECT
    m.cache_key,
    m.product_name,
    m.brand,
    m.gtin,
    m.product_line,
    m.flavor,
    m.life_stage,
    m.food_form,
    m.package_size,
    m.pet_type,
    m.ingredient_count,
    m.source,
    m.source_quality,
    m.ingredient_verification_status,
    m.image_verification_status,
    m.verified_at,
    m.image_url,
    m.ingredients,
    m.ingredient_text,
    m.nutritional_info,
    m.nutrient_panel,
    m.has_published_nutrients,
    m.source_url,
    m.rank
  FROM matched m
  ORDER BY m.rank DESC, m.ingredient_count DESC
  LIMIT (SELECT safe_limit FROM query);
$$;

REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO service_role;
