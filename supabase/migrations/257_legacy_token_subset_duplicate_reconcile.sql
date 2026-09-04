-- Close conservative legacy no-source duplicates when the verified official
-- row contains all meaningful legacy title tokens and existing variant guards
-- have already passed. This targets retailer-shortened titles such as
-- "Blue Buffalo Senior Homestyle Recipe - Chicken -" that map to a single
-- source-backed official product with extra label terms.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_legacy_token_subset_duplicate_match(
  p_legacy_identity TEXT,
  p_legacy_pet_type TEXT,
  p_catalog_identity TEXT,
  p_catalog_pet_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      public.catalog_acquisition_identity_normalize(p_legacy_identity) AS legacy_norm,
      public.catalog_acquisition_identity_normalize(p_catalog_identity) AS catalog_norm,
      lower(COALESCE(NULLIF(trim(p_legacy_pet_type), ''), 'unknown')) AS legacy_pet_type,
      lower(COALESCE(NULLIF(trim(p_catalog_pet_type), ''), 'unknown')) AS catalog_pet_type
  ),
  legacy_terms AS (
    SELECT DISTINCT term
    FROM normalized n
    CROSS JOIN LATERAL regexp_split_to_table(n.legacy_norm, '[[:space:]]+') AS term
    WHERE length(term) >= 4
      AND term NOT IN (
        'buffalo',
        'food',
        'foods',
        'with',
        'and',
        'for',
        'the'
      )
  ),
  summary AS (
    SELECT
      n.legacy_norm,
      n.catalog_norm,
      n.legacy_pet_type,
      n.catalog_pet_type,
      count(lt.term)::INTEGER AS legacy_term_count,
      bool_and((' ' || n.catalog_norm || ' ') LIKE '% ' || lt.term || ' %') AS all_terms_present,
      word_similarity(n.legacy_norm, n.catalog_norm) AS word_sim,
      similarity(n.legacy_norm, n.catalog_norm) AS trigram_sim
    FROM normalized n
    LEFT JOIN legacy_terms lt ON TRUE
    GROUP BY n.legacy_norm, n.catalog_norm, n.legacy_pet_type, n.catalog_pet_type
  )
  SELECT
    legacy_norm IS NOT NULL
    AND catalog_norm IS NOT NULL
    AND legacy_term_count >= 4
    AND all_terms_present
    AND word_sim >= 0.64
    AND trigram_sim >= 0.42
    AND (
      legacy_pet_type NOT IN ('dog', 'cat')
      OR legacy_pet_type = catalog_pet_type
    )
  FROM summary;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_legacy_token_subset_duplicate_match(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_legacy_token_subset_duplicate_match(TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_legacy_token_subset_duplicate_match(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_legacy_token_subset_duplicate_match(TEXT, TEXT, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_legacy_token_subset_duplicate_match(
    'Blue Buffalo Senior Homestyle Recipe - Chicken -',
    'unknown',
    'Blue Buffalo BLUE Homestyle Recipe Grain-Free Senior Wet Dog Food - Chicken & Garden Vegetables BLUE Homestyle Recipe Grain-Free Senior Wet Chicken Garden Vegetables senior wet',
    'dog'
  ) THEN
    RAISE EXCEPTION 'legacy token subset duplicate helper should match Blue Senior Homestyle Chicken';
  END IF;

  IF public.catalog_acquisition_legacy_token_subset_duplicate_match(
    'Blue Buffalo Wilderness Adult Chicken',
    'dog',
    'Blue Buffalo BLUE Wilderness Adult Wet Cat Food - Chicken',
    'cat'
  ) THEN
    RAISE EXCEPTION 'legacy token subset duplicate helper must reject explicit species mismatch';
  END IF;
END;
$$;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand not found';
  END IF;

  IF function_sql NOT LIKE '%legacy token subset duplicate match%' THEN
    function_sql := replace(
      function_sql,
      $$        + CASE
          WHEN public.catalog_acquisition_strict_search_high_confidence(
            bc.legacy_brand,
            bc.legacy_product_name,
            bc.legacy_pet_type,
            bc.matched_brand,
            bc.matched_identity,
            bc.matched_pet_type,
            8.0
          ) THEN 1.0
          ELSE 0.0
        END
        -- direct duplicate exact identity priority
        + bc.prefilter_score$$,
      $$        + CASE
          WHEN public.catalog_acquisition_strict_search_high_confidence(
            bc.legacy_brand,
            bc.legacy_product_name,
            bc.legacy_pet_type,
            bc.matched_brand,
            bc.matched_identity,
            bc.matched_pet_type,
            8.0
          ) THEN 1.0
          ELSE 0.0
        END
        + CASE
          WHEN public.catalog_acquisition_legacy_token_subset_duplicate_match(
            concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
            bc.legacy_pet_type,
            bc.matched_identity,
            bc.matched_pet_type
          ) THEN 2.0
          ELSE 0.0
        END
        -- legacy token subset duplicate match
        -- direct duplicate exact identity priority
        + bc.prefilter_score$$
    );

    function_sql := replace(
      function_sql,
      $$        OR public.catalog_acquisition_strict_search_high_confidence(
          bc.legacy_brand,
          bc.legacy_product_name,
          bc.legacy_pet_type,
          bc.matched_brand,
          bc.matched_identity,
          bc.matched_pet_type,
          8.0
        )
      )$$,
      $$        OR public.catalog_acquisition_strict_search_high_confidence(
          bc.legacy_brand,
          bc.legacy_product_name,
          bc.legacy_pet_type,
          bc.matched_brand,
          bc.matched_identity,
          bc.matched_pet_type,
          8.0
        )
        OR public.catalog_acquisition_legacy_token_subset_duplicate_match(
          concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
          bc.legacy_pet_type,
          bc.matched_identity,
          bc.matched_pet_type
        )
      )$$
    );
  END IF;

  IF function_sql NOT LIKE '%legacy token subset duplicate match%' THEN
    RAISE EXCEPTION 'legacy token subset duplicate patch marker missing';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_legacy_token_subset_duplicate_match%' THEN
    RAISE EXCEPTION 'legacy token subset duplicate helper missing from patched function';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%legacy token subset duplicate match%' THEN
    RAISE EXCEPTION 'legacy token subset duplicate marker missing after patch';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_legacy_token_subset_duplicate_match%' THEN
    RAISE EXCEPTION 'legacy token subset duplicate helper missing after patch';
  END IF;
END;
$$;
