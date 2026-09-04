-- Ingredient OCR can preserve a literal "[" while dropping the matching "]".
-- Treat unbalanced square brackets as malformed ingredient evidence, while
-- continuing to allow balanced official vitamin/mineral bracket groups.

CREATE OR REPLACE FUNCTION public.catalog_has_unbalanced_square_brackets(value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  depth INTEGER := 0;
  index_value INTEGER;
  char_value TEXT;
  source_value TEXT := COALESCE(value, '');
BEGIN
  FOR index_value IN 1..char_length(source_value) LOOP
    char_value := substr(source_value, index_value, 1);

    IF char_value = '[' THEN
      depth := depth + 1;
    ELSIF char_value = ']' THEN
      depth := depth - 1;
      IF depth < 0 THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;

  RETURN depth <> 0;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_has_unbalanced_square_brackets(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_has_unbalanced_square_brackets(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_has_unbalanced_square_brackets(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_has_ingredient_ocr_artifacts(value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
WITH text_value AS (
  SELECT COALESCE(value, '') AS value
),
curly_review AS (
  SELECT
    value,
    length(value) - length(replace(value, '{', '')) AS open_curly_count,
    length(value) - length(replace(value, '}', '')) AS close_curly_count,
    regexp_replace(
      value,
      '(^|,\s*)(Vitamins?|Minerals?)\s*\{[^{}]+\}',
      '',
      'gi'
    ) AS value_without_allowed_curly_groups
  FROM text_value
)
SELECT
  public.catalog_has_unbalanced_parentheses(value)
  OR public.catalog_has_unbalanced_square_brackets(value)
  OR (
    value ~ '[{}]'
    AND (
      open_curly_count <> close_curly_count
      OR value_without_allowed_curly_groups ~ '[{}]'
    )
  )
  OR value ~* '\m[0-9][a-z]{1,20}\M'
  OR value ~* '\m[A-Za-z]{2,}[0-9][A-Za-z]+\M'
  OR value ~ '\(\s*\)'
  OR value ~* '(^|[^A-Za-z])-\s*Ascorbyl-2-Polyphosphate\M'
  OR value ~* '\mSupplement\.\s+preserved\s+with\M'
  OR value ~* '\mI(Vitamin|min|max|preservative|Ferrous)\M'
  OR value ~* '\m(pyr\s+idoxine|pantot\s+henate|ribo\s+flavin|thia\s+mine|bio\s+tin)\M'
  OR value ~* '\m(Fructooli[0-9]osaccharides|Manganese[0-9]e|preserNative|subtillis|cooper\s+sulfate|sufate|sultate|ch[io]ride|calcium\s+lodate|lodate|pyridoxine\s+vitamin\s+b-?6|niain|nacin|nutri\*nt|r[0-9]cogniz[0-9]d|[0-9]ssential|potss+sium|vitss?min|d\.calcium)\M'
  OR value ~* '\mMi\s+nerals\M'
FROM curly_review;
$$;

REVOKE ALL ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) TO service_role;

DO $$
BEGIN
  IF public.catalog_has_ingredient_ocr_artifacts(
    'Chicken, Vitamins [Vitamin E Supplement, Pyridoxine [Vitamin B6], Vitamin D3 Supplement], Salt'
  ) THEN
    RAISE EXCEPTION 'balanced official square-bracket ingredient groups must not be flagged';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts(
    'Chicken, Vitamins (Vitamin E Supplement, Pyridoxine [Vitamin B6, Vitamin D3 Supplement, Folic Acid).'
  ) THEN
    RAISE EXCEPTION 'unclosed square-bracket ingredient OCR artifact must be flagged';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts(
    'Chicken, Vitamin B6], Vitamin D3 Supplement, Folic Acid.'
  ) THEN
    RAISE EXCEPTION 'negative-depth square-bracket ingredient OCR artifact must be flagged';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts(
    'Chicken, Minerals (Magnesium Oxide, Zinc Oxide, Copper Sultate, Calcium lodate), Vitamins (Vitamin E Supplement, Pyridoxine Vitamin B6).'
  ) THEN
    RAISE EXCEPTION 'Mars OCR substitution artifacts must be flagged';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts(
    'Deboned Chicken, Chicken Meal, Zinc Sulfate, -Ascorbyl-2-Polyphosphate (Vitamin C), Calcium Iodate.'
  ) THEN
    RAISE EXCEPTION 'missing leading L-Ascorbyl ingredient OCR artifact must be flagged';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts(
    'Dried Kelp. Vitamin E Supplement. preserved with Mixed Tocopherols, Dried Sweet Potatoes.'
  ) THEN
    RAISE EXCEPTION 'sentence-split preservative ingredient artifact must be flagged';
  END IF;
END;
$$;

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
  (SELECT count(*) FROM demoted) AS demoted_ingredient_artifact_rows,
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
    RAISE EXCEPTION 'verified-ready ingredient artifact rows remain: %', remaining_count;
  END IF;
END;
$$;
