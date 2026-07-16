-- Extend the ingredient OCR artifact guard for split micronutrient words
-- observed in official label/PDF extraction, for example "pyr idoxine".

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
  (
    value ~ '[{}]'
    AND (
      open_curly_count <> close_curly_count
      OR value_without_allowed_curly_groups ~ '[{}]'
    )
  )
  OR value ~* '\m[0-9][a-z]{1,20}\M'
  OR value ~* '\m[A-Za-z]{2,}[0-9][A-Za-z]+\M'
  OR value ~ '\(\s*\)'
  OR (
    length(value) - length(replace(value, '(', ''))
  ) <> (
    length(value) - length(replace(value, ')', ''))
  )
  OR value ~* '\mI(Vitamin|min|max|preservative|Ferrous)\M'
  OR value ~* '\m(pyr\s+idoxine|pantot\s+henate|ribo\s+flavin|thia\s+mine|bio\s+tin)\M'
  OR value ~* '\m(Fructooli[0-9]osaccharides|Manganese[0-9]e|preserNative|subtillis|cooper\s+sulfate|sufate|ch[io]ride|niain|nacin|nutri\*nt|r[0-9]cogniz[0-9]d|[0-9]ssential|potss+sium|vitss?min|d\.calcium)\M'
  OR value ~* '\mMi\s+nerals\M'
FROM curly_review;
$$;

REVOKE ALL ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) TO service_role;

DO $$
BEGIN
  IF public.catalog_has_ingredient_ocr_artifacts(
    'Chicken, Vitamin E Supplement, Pyridoxine Hydrochloride, Riboflavin Supplement, Biotin, Folic Acid.'
  ) THEN
    RAISE EXCEPTION 'valid micronutrient ingredient text must not be flagged';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts(
    'Chicken, Vitamin E Supplement, pyr idoxine hydrochloride, ribo flavin supplement, bio tin, Folic Acid.'
  ) THEN
    RAISE EXCEPTION 'split micronutrient ingredient artifacts must be flagged';
  END IF;

  IF public.catalog_has_ingredient_ocr_artifacts(
    'Sweet Potatoes, Butternut Squash, Water Sufficient for Processing, Vitamins {Vitamin E Supplement, Niacin Supplement, L-Ascorbyl-2 Polyphosphate (Source of Vitamin C), Biotin, Vitamin D2 Supplement}, Minerals {Zinc Sulfate, Ferrous Sulfate, Copper Sulfate, Manganese Sulfate, Selenium Yeast, Potassium Iodide}.'
  ) THEN
    RAISE EXCEPTION 'balanced official vitamin/mineral curly groups must not be flagged as OCR artifacts';
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
