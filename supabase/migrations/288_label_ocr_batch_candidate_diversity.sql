-- Return a small candidate set per OCR query so generic brand matches cannot
-- crowd out a precise recipe query before the device performs final ranking.
CREATE OR REPLACE FUNCTION public.search_verified_products_for_label_ocr(
  queries TEXT[],
  max_results INTEGER DEFAULT 96
)
RETURNS TABLE(
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
  WITH settings AS MATERIALIZED (
    SELECT LEAST(GREATEST(COALESCE($2, 96), 1), 96) AS safe_limit
  ),
  clean_queries AS MATERIALIZED (
    SELECT DISTINCT ON (public.normalize_verified_product_search_query(candidate.query))
      trim(candidate.query) AS query,
      candidate.position
    FROM unnest(COALESCE($1, ARRAY[]::TEXT[])) WITH ORDINALITY AS candidate(query, position)
    WHERE candidate.position <= 8
      AND length(trim(COALESCE(candidate.query, ''))) >= 2
      AND length(trim(candidate.query)) <= 160
    ORDER BY public.normalize_verified_product_search_query(candidate.query), candidate.position
  ),
  matches AS MATERIALIZED (
    SELECT
      matched.*,
      clean_queries.position,
      row_number() OVER (
        PARTITION BY clean_queries.position
        ORDER BY matched.rank DESC, matched.ingredient_count DESC
      ) AS query_match_number
    FROM clean_queries
    CROSS JOIN LATERAL public.search_verified_products(clean_queries.query, 8) AS matched
  ),
  deduplicated AS MATERIALIZED (
    SELECT
      matches.*,
      row_number() OVER (
        PARTITION BY matches.cache_key
        ORDER BY matches.position ASC, matches.rank DESC
      ) AS product_match_number
    FROM matches
    WHERE matches.query_match_number <= 8
  )
  SELECT
    deduplicated.cache_key,
    deduplicated.product_name,
    deduplicated.brand,
    deduplicated.gtin,
    deduplicated.product_line,
    deduplicated.flavor,
    deduplicated.life_stage,
    deduplicated.food_form,
    deduplicated.package_size,
    deduplicated.pet_type,
    deduplicated.ingredient_count,
    deduplicated.source,
    deduplicated.source_quality,
    deduplicated.ingredient_verification_status,
    deduplicated.image_verification_status,
    deduplicated.verified_at,
    deduplicated.image_url,
    deduplicated.ingredients,
    deduplicated.ingredient_text,
    deduplicated.nutritional_info,
    deduplicated.nutrient_panel,
    deduplicated.has_published_nutrients,
    deduplicated.source_url,
    deduplicated.rank
  FROM deduplicated
  WHERE deduplicated.product_match_number = 1
  ORDER BY deduplicated.position ASC, deduplicated.rank DESC
  LIMIT (SELECT safe_limit FROM settings);
$$;

REVOKE ALL ON FUNCTION public.search_verified_products_for_label_ocr(TEXT[], INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products_for_label_ocr(TEXT[], INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products_for_label_ocr(TEXT[], INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products_for_label_ocr(TEXT[], INTEGER) TO service_role;
