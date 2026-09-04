-- Prefer source-backed manufacturer/official rows over legacy retailer rows
-- when the brand, species, and meaningful recipe identity are compatible.
-- This keeps exact unverified duplicates visible, but makes verified catalog
-- rows the first result for ordinary label/search queries.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO function_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'search_products'
    AND pg_get_function_identity_arguments(p.oid) = 'q text, max_results integer';

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_products(q text, max_results integer) not found';
  END IF;

  IF function_sql LIKE '%verified_source_rank_bonus%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    'END AS ts_query',
    'END AS ts_query,
      normalized ~ ''\m(dogs?|pupp(y|ies)|canine|canines)\M'' AS query_has_dog,
      normalized ~ ''\m(cats?|kitten|kittens|feline|felines)\M'' AS query_has_cat'
  );

  function_sql := replace(
    function_sql,
    'END AS verified_rank_bonus',
    'END AS verified_rank_bonus,
      CASE
        WHEN pd.ingredient_verification_status IN (''gdsn'', ''official'', ''manufacturer'', ''retailer_verified'', ''label_ocr_verified'')
          AND pd.image_verification_status IN (''official'', ''manufacturer'', ''retailer_verified'')
          AND COALESCE(NULLIF(trim(pd.source_url), ''''), '''') <> ''''
          AND pd.image_url IS NOT NULL
          AND pd.image_url !~* ''^data:''
        THEN 1.85
        ELSE 0.0
      END AS verified_source_rank_bonus'
  );

  function_sql := replace(
    function_sql,
    'END)::REAL AS rank',
    'END + CASE
        WHEN r.verified_source_rank_bonus > 0
          AND r.brand_lc IS NOT NULL
          AND query.normalized LIKE ''%'' || r.brand_lc || ''%''
          AND NOT (query.query_has_dog AND r.pet_type = ''cat'')
          AND NOT (query.query_has_cat AND r.pet_type = ''dog'')
          AND (
            r.identity_lc LIKE ''%'' || query.normalized || ''%''
            OR word_similarity(query.normalized, r.identity_lc) > 0.62
            OR word_similarity(query.normalized, r.brand_lc || '' '' || r.product_name_lc) > 0.62
          )
        THEN r.verified_source_rank_bonus
        ELSE 0.0
      END)::REAL AS rank'
  );

  IF regexp_count(function_sql, 'verified_source_rank_bonus') <> 5 THEN
    RAISE EXCEPTION 'search_products verified source rank bonus patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
