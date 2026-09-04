-- Ingredient statements with OCR artifacts are not exact source-backed text.
-- Keep them out of verified-ready serving rows until reviewed evidence can
-- replace the malformed ingredient list.

CREATE OR REPLACE FUNCTION public.catalog_has_ingredient_ocr_artifacts(value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(value, '') ~ '[{}]'
    OR COALESCE(value, '') ~* '\m[A-Za-z]{2,}[0-9][A-Za-z]+\M'
    OR COALESCE(value, '') ~* '\mI(Vitamin|min|max|preservative|Ferrous)\M'
    OR COALESCE(value, '') ~* '\m(Fructooli[0-9]osaccharides|Manganese[0-9]e|preserNative|subtillis|cooper\s+sulfate|sufate|ch[io]ride|niain|nacin|nutri\*nt|r[0-9]cogniz[0-9]d|[0-9]ssential)\M'
    OR COALESCE(value, '') ~* '\mMi\s+nerals\M';
$$;

REVOKE ALL ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) TO service_role;

DO $$
BEGIN
  IF public.catalog_has_ingredient_ocr_artifacts('Chicken, L-Ascorbyl-2-Polyphosphate, Vitamin B12 Supplement, Rosemary Extract') THEN
    RAISE EXCEPTION 'valid ingredient micronutrients must not be flagged as OCR artifacts';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts('Chicken, Fructooli9osaccharides, Vitamins {Vitamin E Supplement, L-Ascorbyl-2-Polyphosphate IVitamin Cl, Bacillus subtillis, Cooper Sulfate, Minerals IFerrous Sulfate, Manganese5e Sulfate, Mixed Tocopherols {preserNative)') THEN
    RAISE EXCEPTION 'malformed OCR ingredient text must be flagged';
  END IF;
END;
$$;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.upsert_catalog_product_feed(jsonb)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed not found';
  END IF;

  IF function_sql NOT LIKE '%ingredient OCR artifact import guard%' THEN
    IF function_sql LIKE '%ingredient parenthesis balance import guard%' THEN
      function_sql := replace(
        function_sql,
        $$  WHERE NOT public.catalog_has_unbalanced_parentheses(ingredient_text)
  -- ingredient parenthesis balance import guard$$,
        $$  WHERE NOT public.catalog_has_unbalanced_parentheses(ingredient_text)
    AND NOT public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
  -- ingredient OCR artifact import guard
  -- ingredient parenthesis balance import guard$$
      );
    ELSE
      function_sql := replace(
        function_sql,
        $$  FROM deduped_feed
),$$,
        $$  FROM deduped_feed
  WHERE NOT public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
  -- ingredient OCR artifact import guard
),$$
      );
    END IF;
  END IF;

  IF function_sql NOT LIKE '%ingredient OCR artifact import guard%'
     OR function_sql NOT LIKE '%public.catalog_has_ingredient_ocr_artifacts(ingredient_text)%' THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed OCR artifact guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_feed(JSONB) TO service_role;

WITH flagged AS (
  SELECT id, cache_key
  FROM public.product_data
  WHERE public.catalog_quality_state(
    pet_type,
    is_complete_food,
    catalog_exclusion_reason,
    ingredient_text,
    ingredient_count,
    ingredient_verification_status,
    image_url,
    image_verification_status,
    source_url,
    expires_at
  ) = 'verified_ready'
    AND public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
),
demoted AS (
  UPDATE public.product_data product
  SET
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  FROM flagged
  WHERE product.id = flagged.id
  RETURNING product.cache_key
),
evidence_review AS (
  UPDATE public.catalog_product_evidence evidence
  SET review_state = 'manual_review'
  FROM demoted
  WHERE evidence.cache_key = demoted.cache_key
  RETURNING evidence.id
)
SELECT
  (SELECT count(*) FROM demoted) AS demoted_ingredient_ocr_artifact_rows,
  (SELECT count(*) FROM evidence_review) AS evidence_rows_marked_manual_review;

DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT count(*) INTO remaining_count
  FROM public.product_data
  WHERE public.catalog_quality_state(
    pet_type,
    is_complete_food,
    catalog_exclusion_reason,
    ingredient_text,
    ingredient_count,
    ingredient_verification_status,
    image_url,
    image_verification_status,
    source_url,
    expires_at
  ) = 'verified_ready'
    AND public.catalog_has_ingredient_ocr_artifacts(ingredient_text);

  IF remaining_count <> 0 THEN
    RAISE EXCEPTION 'verified-ready ingredient OCR artifact rows remain: %', remaining_count;
  END IF;
END;
$$;
