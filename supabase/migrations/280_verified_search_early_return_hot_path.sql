-- Make the app-facing verified search an early-return function:
-- 1. barcode-shaped input uses the GTIN index
-- 2. normal text uses the GIN full-text index and returns immediately
-- 3. trigram fallback only runs when indexed full-text finds nothing

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT := public.normalize_verified_product_search_query(q);
  v_safe_limit INTEGER := LEAST(GREATEST(COALESCE(max_results, 10), 1), 25);
  v_candidate_limit INTEGER := LEAST(GREATEST(LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) * 18, 120), 300);
  v_ts_query TSQUERY;
  v_is_gtin_query BOOLEAN;
  v_query_has_dog BOOLEAN;
  v_query_has_cat BOOLEAN;
  v_result_count INTEGER := 0;
BEGIN
  IF v_normalized IS NULL OR length(v_normalized) < 2 THEN
    RETURN;
  END IF;

  v_is_gtin_query := v_normalized ~ '^[0-9]{8,14}$';
  v_query_has_dog := v_normalized ~ '\m(dogs?|pupp(y|ies)|canine|canines)\M';
  v_query_has_cat := v_normalized ~ '\m(cats?|kitten|kittens|feline|felines)\M';

  IF v_is_gtin_query THEN
    RETURN QUERY
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
      12.0::REAL AS rank
    FROM public.product_data pd
    WHERE NULLIF(trim(pd.gtin), '') = v_normalized
      AND pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND lower(COALESCE(pd.pet_type, '')) IN ('dog', 'cat')
      AND COALESCE(NULLIF(trim(pd.source_url), ''), '') <> ''
      AND pd.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND pd.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
      AND pd.image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
      AND pd.image_url IS NOT NULL
      AND pd.image_url !~* '^data:'
    ORDER BY pd.ingredient_count DESC, pd.verified_at DESC NULLS LAST
    LIMIT v_safe_limit;

    RETURN;
  END IF;

  v_ts_query := to_tsquery('simple', regexp_replace(v_normalized, '[[:space:]]+', ':* & ', 'g') || ':*');

  RETURN QUERY
  WITH query_required_terms AS MATERIALIZED (
    SELECT DISTINCT required_term.term
    FROM regexp_split_to_table(v_normalized, '\s+') AS required_term(term)
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
    FROM regexp_split_to_table(v_normalized, '\s+') AS identity_token(term)
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
  base AS MATERIALIZED (
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
        pd.gtin,
        pd.source_url
      )) AS source_identity_lc,
      (
        2.0 + COALESCE(ts_rank_cd(pd.search_document, v_ts_query), 0.0) * 1.4
      )::REAL AS candidate_rank
    FROM public.product_data pd
    WHERE pd.search_document @@ v_ts_query
      AND pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND lower(COALESCE(pd.pet_type, '')) IN ('dog', 'cat')
      AND (NOT v_query_has_dog OR pd.pet_type = 'dog')
      AND (NOT v_query_has_cat OR pd.pet_type = 'cat')
      AND COALESCE(NULLIF(trim(pd.source_url), ''), '') <> ''
      AND pd.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND pd.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
      AND pd.image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
      AND pd.image_url IS NOT NULL
      AND pd.image_url !~* '^data:'
    ORDER BY candidate_rank DESC, pd.ingredient_count DESC, pd.verified_at DESC NULLS LAST
    LIMIT v_candidate_limit
  ),
  normalized_candidates AS MATERIALIZED (
    SELECT
      base.*,
      NULLIF(trim(regexp_replace(extensions.unaccent(base.product_name_raw_lc), '[^a-z0-9]+', ' ', 'g')), '') AS product_name_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(base.brand_raw_lc), '[^a-z0-9]+', ' ', 'g')), '') AS brand_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(base.source_identity_lc), '[^a-z0-9]+', ' ', 'g')), '') AS identity_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(COALESCE(base.life_stage, '')), '[^a-z0-9]+', ' ', 'g')), '') AS life_stage_lc
    FROM base
  ),
  guarded_candidates AS MATERIALIZED (
    SELECT n.*
    FROM normalized_candidates n
    WHERE NOT EXISTS (
      SELECT 1
      FROM query_required_terms qrt
      WHERE n.identity_lc !~ ('\m' || qrt.term || '\M')
        AND NOT (
          qrt.term = 'adult'
          AND v_normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
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
        + CASE WHEN g.identity_lc = v_normalized THEN 10.0 ELSE 0.0 END
        + CASE WHEN g.product_name_lc = v_normalized THEN 8.0 ELSE 0.0 END
        + CASE WHEN g.identity_lc LIKE '%' || v_normalized || '%' THEN 6.5 ELSE 0.0 END
        + CASE
            WHEN length(COALESCE(g.brand_lc, '')) >= 3
              AND v_normalized LIKE '%' || g.brand_lc || '%'
            THEN 2.0
            ELSE 0.0
          END
        + CASE
            WHEN v_query_has_dog AND g.pet_type = 'dog' THEN 0.8
            WHEN v_query_has_cat AND g.pet_type = 'cat' THEN 0.8
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
                    AND v_normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
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
            similarity(g.product_name_lc, v_normalized) * 1.15,
            similarity(g.identity_lc, v_normalized) * 1.05,
            word_similarity(v_normalized, g.identity_lc) * 0.95,
            word_similarity(v_normalized, g.brand_lc || ' ' || g.product_name_lc) * 0.90
          )
        - CASE
            WHEN v_normalized !~ '\m(kitten|puppy)\M'
              AND (
                g.product_name_lc ~ '\m(kitten|kittens|puppy|puppies)\M'
                OR g.life_stage_lc ~ '\m(kitten|kittens|puppy|puppies)\M'
              )
            THEN 1.25 ELSE 0.0
          END
        - CASE
            WHEN v_normalized !~ '\m(senior|seniors|mature)\M'
              AND (
                g.product_name_lc ~ '\m(senior|seniors|mature)\M'
                OR g.life_stage_lc ~ '\m(senior|seniors|mature)\M'
              )
            THEN 0.75 ELSE 0.0
          END
        - CASE
            WHEN v_normalized !~ '\m(grain|grains|free|ancient)\M'
              AND g.identity_lc ~ '\m(grain|grains|free|ancient)\M'
            THEN 0.75
            ELSE 0.0
          END
        - (
            2.2 * (
              SELECT count(*)::REAL
              FROM protected_terms pt
              WHERE v_normalized !~ ('\m' || pt.term || '\M')
                AND g.identity_lc ~ ('\m' || pt.term || '\M')
                AND NOT (
                  pt.term = 'adult'
                  AND v_normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
                  AND g.identity_lc !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
                )
            )
          )
      )::REAL AS adjusted_rank
    FROM guarded_candidates g
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
  ORDER BY final_rows.adjusted_rank DESC, final_rows.ingredient_count DESC, final_rows.verified_at DESC NULLS LAST
  LIMIT v_safe_limit;

  GET DIAGNOSTICS v_result_count = ROW_COUNT;
  IF v_result_count > 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.search_verified_products_ranked_v1(v_normalized, v_safe_limit)
  LIMIT v_safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
