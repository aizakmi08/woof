-- Some official source titles intentionally omit flavor/package tokens that
-- appear in the official URL. Allow that source-backed identity only for
-- protected special food forms after the food-form guard passes.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_special_food_form_source_identity_match(
  p_legacy_identity TEXT,
  p_legacy_pet_type TEXT,
  p_candidate_source_identity TEXT,
  p_candidate_pet_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    regexp_replace(lower(COALESCE(p_legacy_identity, '')), '[^a-z0-9]+', ' ', 'g') AS legacy_norm,
    regexp_replace(lower(COALESCE(p_candidate_source_identity, '')), '[^a-z0-9]+', ' ', 'g') AS candidate_norm
),
flags AS (
  SELECT
    (
      legacy_norm ~ '(^| )(fresh food|fresh dog food|fresh cat food|fresh frozen|fresh refrigerated|frozen|refrigerated)( |$)'
      OR legacy_norm ~ '(^| )(freeze dried|freezedried|freeze dry)( |$)'
      OR legacy_norm ~ '(^| )(dehydrated)( |$)'
      OR legacy_norm ~ '(^| )(air dried|airdried)( |$)'
      OR legacy_norm ~ '(^| )(raw food|raw frozen|frozen raw)( |$)'
    ) AS legacy_has_special_form,
    (
      candidate_norm ~ '(^| )(fresh food|fresh dog food|fresh cat food|fresh frozen|fresh refrigerated|frozen|refrigerated)( |$)'
      OR candidate_norm ~ '(^| )(freeze dried|freezedried|freeze dry)( |$)'
      OR candidate_norm ~ '(^| )(dehydrated)( |$)'
      OR candidate_norm ~ '(^| )(air dried|airdried)( |$)'
      OR candidate_norm ~ '(^| )(raw food|raw frozen|frozen raw)( |$)'
    ) AS candidate_has_special_form
  FROM normalized
)
SELECT
  legacy_has_special_form
  AND candidate_has_special_form
  AND public.catalog_acquisition_food_form_terms_match(
    p_legacy_identity,
    p_candidate_source_identity
  )
  AND public.catalog_acquisition_legacy_token_subset_duplicate_match(
    p_legacy_identity,
    p_legacy_pet_type,
    p_candidate_source_identity,
    p_candidate_pet_type
  )
FROM flags;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_special_food_form_source_identity_match(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_special_food_form_source_identity_match(TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_special_food_form_source_identity_match(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_special_food_form_source_identity_match(TEXT, TEXT, TEXT, TEXT) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand not found';
  END IF;

  IF function_sql NOT LIKE '%source-backed special food-form duplicate match%' THEN
    function_sql := replace(
      function_sql,
      $$        + CASE
          WHEN public.catalog_acquisition_legacy_token_subset_duplicate_match(
            concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
            bc.legacy_pet_type,
            bc.matched_identity,
            bc.matched_pet_type
          ) THEN 2.0
          ELSE 0.0
        END
        -- legacy token subset duplicate match
        -- direct duplicate exact identity priority$$,
      $$        + CASE
          WHEN public.catalog_acquisition_legacy_token_subset_duplicate_match(
            concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
            bc.legacy_pet_type,
            bc.matched_identity,
            bc.matched_pet_type
          ) THEN 2.0
          ELSE 0.0
        END
        + CASE
          WHEN public.catalog_acquisition_special_food_form_source_identity_match(
            concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
            bc.legacy_pet_type,
            bc.matched_food_form_identity,
            bc.matched_pet_type
          ) THEN 1.5
          ELSE 0.0
        END
        -- legacy token subset duplicate match
        -- source-backed special food-form duplicate match
        -- direct duplicate exact identity priority$$
    );

    function_sql := replace(
      function_sql,
      $$        OR public.catalog_acquisition_legacy_token_subset_duplicate_match(
          concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
          bc.legacy_pet_type,
          bc.matched_identity,
          bc.matched_pet_type
        )
      )$$,
      $$        OR public.catalog_acquisition_legacy_token_subset_duplicate_match(
          concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
          bc.legacy_pet_type,
          bc.matched_identity,
          bc.matched_pet_type
        )
        OR public.catalog_acquisition_special_food_form_source_identity_match(
          concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
          bc.legacy_pet_type,
          bc.matched_food_form_identity,
          bc.matched_pet_type
        )
      )$$
    );
  END IF;

  IF function_sql NOT LIKE '%source-backed special food-form duplicate match%' THEN
    RAISE EXCEPTION 'source-backed special food-form duplicate marker missing';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_special_food_form_source_identity_match%' THEN
    RAISE EXCEPTION 'source-backed special food-form helper missing from patched function';
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

  IF NOT public.catalog_acquisition_special_food_form_source_identity_match(
    'Nature''s Recipe Freeze Dried Blend Chicken, Barley & Brown Rice Dry Dog Food',
    'dog',
    'Nature''s Recipe Freeze Dried Blend Dry Dog Food dry https://www.naturesrecipe.com/product/natures-recipe-freeze-dried-blend-chicken-barley-brown-rice-recipe-dry-dog-food/',
    'dog'
  ) THEN
    RAISE EXCEPTION 'special source identity should match Nature''s Recipe freeze-dried blend official URL';
  END IF;

  IF public.catalog_acquisition_special_food_form_source_identity_match(
    'Nature''s Recipe Freeze Dried Blend Chicken, Barley & Brown Rice Dry Dog Food',
    'dog',
    'Nature''s Recipe Chicken, Barley & Brown Rice Dry Dog Food dry https://www.naturesrecipe.com/product/natures-recipe-chicken-barley-brown-rice-recipe-dry-dog-food/',
    'dog'
  ) THEN
    RAISE EXCEPTION 'special source identity must reject freeze-dried blend matched to normal dry source URL';
  END IF;

  IF public.catalog_acquisition_special_food_form_source_identity_match(
    'Nature''s Recipe Chicken, Barley & Brown Rice Dry Dog Food',
    'dog',
    'Nature''s Recipe Freeze Dried Blend Dry Dog Food dry https://www.naturesrecipe.com/product/natures-recipe-freeze-dried-blend-chicken-barley-brown-rice-recipe-dry-dog-food/',
    'dog'
  ) THEN
    RAISE EXCEPTION 'special source identity must reject normal dry title matched to freeze-dried source URL';
  END IF;

  IF function_sql NOT LIKE '%source-backed special food-form duplicate match%' THEN
    RAISE EXCEPTION 'source-backed special food-form duplicate marker missing after patch';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_special_food_form_source_identity_match%' THEN
    RAISE EXCEPTION 'source-backed special food-form helper missing after patch';
  END IF;
END;
$$;
