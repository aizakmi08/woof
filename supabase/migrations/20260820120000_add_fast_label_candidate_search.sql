-- Resolve a photographed front label with one bounded, indexed database call.
-- The client performs the final brand/species/form/recipe compatibility gate;
-- this function only returns verified, scorable candidate formulas.

CREATE OR REPLACE FUNCTION public.search_verified_products_for_label_fast(
  queries TEXT[],
  max_results INTEGER DEFAULT 48
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
SET search_path = public, extensions
SET statement_timeout = '2500ms'
AS $function$
  WITH settings AS MATERIALIZED (
    SELECT LEAST(GREATEST(COALESCE($2, 48), 1), 48) AS safe_limit
  ),
  normalized_queries AS MATERIALIZED (
    SELECT DISTINCT ON (public.normalize_verified_product_search_query(candidate.query))
      public.normalize_verified_product_search_query(candidate.query) AS normalized_query,
      candidate.position
    FROM unnest(COALESCE($1, ARRAY[]::TEXT[])) WITH ORDINALITY AS candidate(query, position)
    WHERE candidate.position <= 4
      AND length(trim(COALESCE(candidate.query, ''))) BETWEEN 2 AND 160
    ORDER BY public.normalize_verified_product_search_query(candidate.query), candidate.position
  ),
  clean_queries AS MATERIALIZED (
    SELECT
      normalized.normalized_query,
      normalized.position,
      plainto_tsquery(
        'simple',
        COALESCE(
          NULLIF((
            SELECT string_agg(token, ' ' ORDER BY token_position)
            FROM unnest(regexp_split_to_array(normalized.normalized_query, '\s+'))
              WITH ORDINALITY AS parsed(token, token_position)
            WHERE length(token) >= 2
              AND token NOT IN (
                'bag', 'balanced', 'complete', 'food', 'foods', 'for',
                'label', 'made', 'natural', 'nutrition', 'pound', 'pounds',
                'recommended', 'the', 'veterinarian', 'weight', 'years'
              )
          ), ''),
          normalized.normalized_query
        )
      ) AS text_query
    FROM normalized_queries normalized
    WHERE length(normalized.normalized_query) >= 2
  ),
  alias_keys AS MATERIALIZED (
    SELECT
      alias.cache_key,
      query.position,
      24.0::REAL AS candidate_rank
    FROM clean_queries query
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active
     AND alias.normalized_alias = query.normalized_query
  ),
  document_keys AS MATERIALIZED (
    SELECT
      matched.cache_key,
      query.position,
      matched.candidate_rank
    FROM clean_queries query
    CROSS JOIN LATERAL (
      SELECT
        product.cache_key,
        (
          ts_rank_cd(product.search_document, query.text_query) * 6.0
          + CASE
              WHEN strpos(
                query.normalized_query,
                public.normalize_verified_product_search_query(product.brand)
              ) > 0 THEN 3.0
              ELSE 0.0
            END
        )::REAL AS candidate_rank
      FROM public.product_data product
      WHERE product.search_document @@ query.text_query
        AND product.expires_at > statement_timestamp()
        AND product.ingredient_count >= 5
        AND product.is_complete_food = TRUE
        AND product.catalog_exclusion_reason IS NULL
        AND lower(COALESCE(product.pet_type, '')) IN ('dog', 'cat')
        AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
        AND product.source_quality IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified'
        )
        AND product.ingredient_verification_status IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
        )
        AND product.image_verification_status IN (
          'official', 'manufacturer', 'retailer_verified'
        )
        AND product.image_url IS NOT NULL
        AND product.image_url !~* '^data:'
      ORDER BY candidate_rank DESC, product.verified_at DESC NULLS LAST
      LIMIT 12
    ) matched
  ),
  candidate_keys AS MATERIALIZED (
    SELECT * FROM alias_keys
    UNION ALL
    SELECT * FROM document_keys
  ),
  deduplicated AS MATERIALIZED (
    SELECT
      candidate.cache_key,
      candidate.position,
      candidate.candidate_rank,
      row_number() OVER (
        PARTITION BY candidate.cache_key
        ORDER BY candidate.position, candidate.candidate_rank DESC
      ) AS product_match_number
    FROM candidate_keys candidate
  )
  SELECT
    product.cache_key,
    product.product_name,
    product.brand,
    NULLIF(trim(product.gtin), '') AS gtin,
    NULLIF(trim(product.product_line), '') AS product_line,
    NULLIF(trim(product.flavor), '') AS flavor,
    NULLIF(trim(product.life_stage), '') AS life_stage,
    NULLIF(trim(product.food_form), '') AS food_form,
    NULLIF(trim(product.package_size), '') AS package_size,
    COALESCE(product.pet_type, 'unknown') AS pet_type,
    product.ingredient_count,
    product.source,
    COALESCE(product.source_quality, 'unknown') AS source_quality,
    COALESCE(product.ingredient_verification_status, 'unverified')
      AS ingredient_verification_status,
    COALESCE(product.image_verification_status, 'unverified')
      AS image_verification_status,
    product.verified_at,
    product.image_url,
    product.ingredients,
    COALESCE(
      NULLIF(product.ingredient_text, ''),
      array_to_string(product.ingredients, ', ')
    ) AS ingredient_text,
    product.nutritional_info,
    product.nutrient_panel,
    COALESCE(product.has_published_nutrients, FALSE) AS has_published_nutrients,
    product.source_url,
    deduplicated.candidate_rank AS rank
  FROM deduplicated
  JOIN public.product_data product
    ON product.cache_key = deduplicated.cache_key
  WHERE deduplicated.product_match_number = 1
    AND product.expires_at > statement_timestamp()
    AND product.ingredient_count >= 5
    AND product.is_complete_food = TRUE
    AND product.catalog_exclusion_reason IS NULL
    AND lower(COALESCE(product.pet_type, '')) IN ('dog', 'cat')
    AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
    AND product.source_quality IN (
      'gdsn', 'official', 'manufacturer', 'retailer_verified'
    )
    AND product.ingredient_verification_status IN (
      'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
    )
    AND product.image_verification_status IN (
      'official', 'manufacturer', 'retailer_verified'
    )
    AND product.image_url IS NOT NULL
    AND product.image_url !~* '^data:'
  ORDER BY deduplicated.position, deduplicated.candidate_rank DESC,
    product.ingredient_count DESC, product.verified_at DESC NULLS LAST
  LIMIT (SELECT safe_limit FROM settings);
$function$;

REVOKE ALL ON FUNCTION
  public.search_verified_products_for_label_fast(TEXT[], INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.search_verified_products_for_label_fast(TEXT[], INTEGER)
  TO authenticated, service_role;

-- Five seconds is the total UI budget. Individual catalog calls are already
-- capped at 2.5 seconds, so this still leaves room for OCR/cloud reconciliation.
UPDATE public.app_runtime_config
SET
  config = jsonb_set(config, '{reconciliation_timeout_ms}', '5000'::JSONB, TRUE),
  updated_at = statement_timestamp()
WHERE config_key = 'label_resolution';
