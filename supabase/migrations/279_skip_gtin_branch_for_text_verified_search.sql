-- Text searches should not pay for the GTIN branch. Keep barcode lookup in
-- the same RPC, but only execute it for barcode-shaped input.

CREATE OR REPLACE FUNCTION public.search_verified_products(q TEXT, max_results INTEGER DEFAULT 10)
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
  WITH input AS MATERIALIZED (
    SELECT
      public.normalize_verified_product_search_query(q) AS normalized,
      LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) AS safe_limit
  ),
  query AS MATERIALIZED (
    SELECT
      normalized,
      safe_limit,
      LEAST(GREATEST(safe_limit * 18, 120), 300) AS candidate_limit,
      normalized ~ '^[0-9]{8,14}$' AS is_gtin_query,
      CASE
        WHEN length(normalized) >= 2 THEN
          to_tsquery('simple', regexp_replace(normalized, '[[:space:]]+', ':* & ', 'g') || ':*')
        ELSE NULL
      END AS ts_query,
      normalized ~ '\m(dogs?|pupp(y|ies)|canine|canines)\M' AS query_has_dog,
      normalized ~ '\m(cats?|kitten|kittens|feline|felines)\M' AS query_has_cat
    FROM input
    WHERE normalized IS NOT NULL
  ),
  query_required_terms AS MATERIALIZED (
    SELECT DISTINCT required_term.term
    FROM query
    CROSS JOIN LATERAL regexp_split_to_table(query.normalized, '\s+') AS required_term(term)
    WHERE required_term.term IN (
      'adult', 'senior', 'puppy', 'kitten', 'small', 'bite', 'bites', 'toy', 'large',
      'weight', 'indoor', 'hairball', 'sensitive', 'digestive', 'urinary',
      'mobility', 'joint', 'skin', 'coat', 'ancient', 'grains', 'grain', 'free',
      '95', 'hydrolyzed', 'vegetarian', 'plant', 'salmon', 'chicken', 'beef',
      'turkey', 'lamb', 'duck', 'fish', 'whitefish', 'ocean', 'tuna', 'trout',
      'venison', 'insect', 'bison', 'broth', 'crab', 'pollock', 'cod', 'liver',
      'mackerel', 'mousse', 'sole', 'shrimp', 'prawn', 'prawns', 'pumpkin',
      'quail', 'rabbit', 'sardine', 'sardines', 'seabass', 'tilapia', 'cluster',
      'clusters', 'dehydrated', 'cuts', 'gravy', 'loaf', 'minced', 'morsels',
      'oatmeal', 'pate', 'pat', 'rice', 'shreds', 'stew', 'stews', 'potato',
      'sweet', 'wholemade', 'prime', 'rib', 'filet', 'mignon', 'giblets',
      'calm', 'satiety', 'moderate', 'aging', 'renal'
    )
  ),
  query_identity_terms AS MATERIALIZED (
    SELECT DISTINCT identity_token.term
    FROM query
    CROSS JOIN LATERAL regexp_split_to_table(query.normalized, '\s+') AS identity_token(term)
    WHERE length(identity_token.term) > 2
      AND identity_token.term NOT IN (
        'and', 'the', 'with', 'for', 'from', 'food', 'foods', 'pet',
        'dog', 'dogs', 'puppy', 'puppies',
        'cat', 'cats', 'kitten', 'kittens'
      )
  ),
  protected_terms(term) AS MATERIALIZED (
    VALUES
      ('adult'), ('senior'), ('puppy'), ('kitten'), ('small'), ('bite'), ('bites'), ('toy'), ('large'),
      ('weight'), ('indoor'), ('hairball'), ('sensitive'), ('digestive'), ('urinary'),
      ('mobility'), ('joint'), ('skin'), ('coat'), ('hydrolyzed'), ('vegetarian'), ('plant'),
      ('salmon'), ('chicken'), ('beef'), ('turkey'), ('lamb'), ('duck'), ('fish'),
      ('whitefish'), ('ocean'), ('tuna'), ('trout'), ('venison'), ('insect'), ('bison'),
      ('broth'), ('crab'), ('pollock'), ('cod'), ('liver'), ('mackerel'), ('mousse'), ('sole'),
      ('shrimp'), ('prawn'), ('prawns'), ('pumpkin'), ('quail'), ('rabbit'), ('sardine'),
      ('sardines'), ('seabass'), ('tilapia'), ('cluster'), ('clusters'), ('dehydrated'),
      ('cuts'), ('gravy'), ('loaf'), ('minced'), ('morsels'), ('oatmeal'), ('pate'),
      ('pat'), ('rice'), ('shreds'), ('stew'), ('stews'), ('potato'), ('sweet'),
      ('wholemade'), ('prime'), ('rib'), ('filet'), ('mignon'), ('giblets'),
      ('ancient'), ('grain'), ('grains'), ('free'), ('calm'), ('satiety'), ('moderate'),
      ('aging'), ('renal')
  ),
  ready_rows AS NOT MATERIALIZED (
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
      lower(COALESCE(pd.product_name, '')) AS product_name_raw_lc,
      lower(COALESCE(pd.brand, '')) AS brand_raw_lc,
      lower(concat_ws(
        ' ',
        pd.brand,
        pd.product_name,
        pd.product_line,
        pd.flavor,
        pd.life_stage,
        pd.food_form,
        pd.package_size,
        pd.gtin
      )) AS indexed_identity_lc,
      lower(concat_ws(
        ' ',
        pd.brand,
        pd.product_name,
        pd.product_line,
        pd.flavor,
        pd.life_stage,
        pd.food_form,
        pd.package_size,
        pd.gtin,
        pd.source_url
      )) AS source_identity_lc
    FROM public.product_data pd
    CROSS JOIN query
    WHERE pd.expires_at > NOW()
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
  full_text_candidates AS MATERIALIZED (
    SELECT
      1 AS channel_priority,
      r.*,
      (
        2.0 + COALESCE(ts_rank_cd(r.search_document, query.ts_query), 0.0) * 1.4
      )::REAL AS candidate_rank
    FROM ready_rows r
    CROSS JOIN query
    WHERE query.ts_query IS NOT NULL
      AND NOT query.is_gtin_query
      AND r.search_document @@ query.ts_query
    ORDER BY candidate_rank DESC, r.ingredient_count DESC, r.verified_at DESC NULLS LAST
    LIMIT (SELECT candidate_limit FROM query)
  ),
  exact_candidates AS MATERIALIZED (
    SELECT
      2 AS channel_priority,
      r.*,
      12.0::REAL AS candidate_rank
    FROM ready_rows r
    CROSS JOIN query
    WHERE query.is_gtin_query
      AND r.gtin = query.normalized
    LIMIT (SELECT candidate_limit FROM query)
  ),
  seed_candidates AS MATERIALIZED (
    SELECT * FROM full_text_candidates
    UNION ALL
    SELECT * FROM exact_candidates
  ),
  identity_candidates AS MATERIALIZED (
    SELECT
      3 AS channel_priority,
      r.*,
      4.0::REAL AS candidate_rank
    FROM ready_rows r
    CROSS JOIN query
    WHERE (SELECT count(*) FROM seed_candidates) < (SELECT safe_limit FROM query)
      AND NOT query.is_gtin_query
      AND (
        r.indexed_identity_lc LIKE '%' || query.normalized || '%'
        OR r.product_name_raw_lc LIKE query.normalized || '%'
      )
    ORDER BY r.ingredient_count DESC, r.verified_at DESC NULLS LAST
    LIMIT (SELECT candidate_limit FROM query)
  ),
  indexed_candidates AS MATERIALIZED (
    SELECT * FROM seed_candidates
    UNION ALL
    SELECT * FROM identity_candidates
  ),
  fuzzy_candidates AS MATERIALIZED (
    SELECT
      4 AS channel_priority,
      r.*,
      (
        1.2 + GREATEST(
          similarity(r.product_name_raw_lc, query.normalized) * 1.15,
          similarity(r.indexed_identity_lc, query.normalized) * 1.05,
          similarity(r.brand_raw_lc, query.normalized) * 0.90,
          word_similarity(query.normalized, r.indexed_identity_lc) * 0.95
        )
      )::REAL AS candidate_rank
    FROM ready_rows r
    CROSS JOIN query
    WHERE (SELECT count(*) FROM indexed_candidates) < (SELECT safe_limit FROM query)
      AND NOT query.is_gtin_query
      AND query.normalized !~ '\m[a-z0-9]{16,}\M'
      AND (
        r.product_name_raw_lc % query.normalized
        OR r.brand_raw_lc % query.normalized
        OR r.indexed_identity_lc % query.normalized
      )
    ORDER BY candidate_rank DESC, r.ingredient_count DESC, r.verified_at DESC NULLS LAST
    LIMIT (SELECT candidate_limit FROM query)
  ),
  candidates AS MATERIALIZED (
    SELECT * FROM indexed_candidates
    UNION ALL
    SELECT * FROM fuzzy_candidates
  ),
  deduped_candidates AS MATERIALIZED (
    SELECT DISTINCT ON (cache_key)
      candidates.*
    FROM candidates
    ORDER BY
      cache_key,
      candidate_rank DESC,
      channel_priority ASC,
      ingredient_count DESC,
      verified_at DESC NULLS LAST
  ),
  normalized_candidates AS MATERIALIZED (
    SELECT
      dc.*,
      NULLIF(trim(regexp_replace(extensions.unaccent(dc.product_name_raw_lc), '[^a-z0-9]+', ' ', 'g')), '') AS product_name_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(dc.brand_raw_lc), '[^a-z0-9]+', ' ', 'g')), '') AS brand_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(dc.source_identity_lc), '[^a-z0-9]+', ' ', 'g')), '') AS identity_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(COALESCE(dc.life_stage, '')), '[^a-z0-9]+', ' ', 'g')), '') AS life_stage_lc
    FROM deduped_candidates dc
  ),
  guarded_candidates AS MATERIALIZED (
    SELECT n.*
    FROM normalized_candidates n
    CROSS JOIN query
    WHERE NOT EXISTS (
      SELECT 1
      FROM query_required_terms qrt
      WHERE n.identity_lc !~ ('\m' || qrt.term || '\M')
        AND NOT (
          qrt.term = 'adult'
          AND query.normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
          AND n.identity_lc !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
        )
        AND NOT (
          qrt.term IN ('grain', 'grains')
          AND n.identity_lc ~ '\mgrained\M'
        )
        AND NOT (
          length(qrt.term) > 3
          AND right(qrt.term, 1) = 's'
          AND n.identity_lc ~ ('\m' || left(qrt.term, length(qrt.term) - 1) || '\M')
        )
    )
  ),
  scored AS MATERIALIZED (
    SELECT
      g.*,
      (
        g.candidate_rank
        + CASE WHEN g.gtin = query.normalized THEN 12.0 ELSE 0.0 END
        + CASE WHEN g.identity_lc = query.normalized THEN 10.0 ELSE 0.0 END
        + CASE WHEN g.product_name_lc = query.normalized THEN 8.0 ELSE 0.0 END
        + CASE WHEN g.identity_lc LIKE '%' || query.normalized || '%' THEN 6.5 ELSE 0.0 END
        + CASE
            WHEN length(COALESCE(g.brand_lc, '')) >= 3
              AND query.normalized LIKE '%' || g.brand_lc || '%'
            THEN 2.0
            ELSE 0.0
          END
        + CASE
            WHEN query.query_has_dog AND g.pet_type = 'dog' THEN 0.8
            WHEN query.query_has_cat AND g.pet_type = 'cat' THEN 0.8
            ELSE 0.0
          END
        + CASE
            WHEN EXISTS (SELECT 1 FROM query_identity_terms)
              AND NOT EXISTS (
                SELECT 1
                FROM query_identity_terms qit
                WHERE g.identity_lc !~ ('\m' || qit.term || '\M')
                  AND NOT (
                    qit.term = 'adult'
                    AND query.normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
                    AND g.identity_lc !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
                  )
                  AND NOT (
                    length(qit.term) > 3
                    AND right(qit.term, 1) = 's'
                    AND g.identity_lc ~ ('\m' || left(qit.term, length(qit.term) - 1) || '\M')
                  )
              )
            THEN 4.8
            ELSE 0.0
          END
        + GREATEST(
            similarity(g.product_name_lc, query.normalized) * 1.15,
            similarity(g.identity_lc, query.normalized) * 1.05,
            word_similarity(query.normalized, g.identity_lc) * 0.95,
            word_similarity(query.normalized, g.brand_lc || ' ' || g.product_name_lc) * 0.90
          )
        - CASE
            WHEN query.normalized !~ '\m(kitten|puppy)\M'
              AND (
                g.product_name_lc ~ '\m(kitten|kittens|puppy|puppies)\M'
                OR g.life_stage_lc ~ '\m(kitten|kittens|puppy|puppies)\M'
              )
            THEN 1.25 ELSE 0.0
          END
        - CASE
            WHEN query.normalized !~ '\m(senior|seniors|mature)\M'
              AND (
                g.product_name_lc ~ '\m(senior|seniors|mature)\M'
                OR g.life_stage_lc ~ '\m(senior|seniors|mature)\M'
              )
            THEN 0.75 ELSE 0.0
          END
        - CASE
            WHEN query.normalized !~ '\m(grain|grains|free|ancient)\M'
              AND g.identity_lc ~ '\m(grain|grains|free|ancient)\M'
            THEN 0.75
            ELSE 0.0
          END
        - (
            2.2 * (
              SELECT count(*)::REAL
              FROM protected_terms pt
              WHERE query.normalized !~ ('\m' || pt.term || '\M')
                AND g.identity_lc ~ ('\m' || pt.term || '\M')
                AND NOT (
                  pt.term = 'adult'
                  AND query.normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
                  AND g.identity_lc !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
                )
            )
          )
      )::REAL AS adjusted_rank
    FROM guarded_candidates g
    CROSS JOIN query
  ),
  final_rows AS MATERIALIZED (
    SELECT
      scored.*,
      row_number() OVER (
        PARTITION BY
          COALESCE(scored.brand_lc, ''),
          COALESCE(scored.product_name_lc, scored.cache_key, ''),
          COALESCE(scored.pet_type, '')
        ORDER BY
          scored.adjusted_rank DESC,
          scored.ingredient_count DESC,
          scored.verified_at DESC NULLS LAST
      ) AS duplicate_rank
    FROM scored
    WHERE scored.adjusted_rank >= 3.0
  )
  SELECT
    final_rows.cache_key,
    final_rows.product_name,
    final_rows.brand,
    final_rows.gtin,
    final_rows.product_line,
    final_rows.flavor,
    final_rows.life_stage,
    final_rows.food_form,
    final_rows.package_size,
    final_rows.pet_type,
    final_rows.ingredient_count,
    final_rows.source,
    final_rows.source_quality,
    final_rows.ingredient_verification_status,
    final_rows.image_verification_status,
    final_rows.verified_at,
    final_rows.image_url,
    final_rows.ingredients,
    final_rows.ingredient_text,
    final_rows.nutritional_info,
    final_rows.nutrient_panel,
    final_rows.has_published_nutrients,
    final_rows.source_url,
    final_rows.adjusted_rank AS rank
  FROM final_rows
  WHERE final_rows.duplicate_rank = 1
  ORDER BY
    final_rows.adjusted_rank DESC,
    final_rows.ingredient_count DESC,
    final_rows.verified_at DESC NULLS LAST
  LIMIT (SELECT safe_limit FROM query);
$$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
