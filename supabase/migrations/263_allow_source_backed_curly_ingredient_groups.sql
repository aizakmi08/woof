-- Some official manufacturer product pages use curly braces as ingredient
-- group punctuation, for example "Vitamins {...}, Minerals {...}". Keep
-- those exact source-backed groups importable while still rejecting JSON,
-- unbalanced braces, and observed OCR/parser artifacts.

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
    'Sweet Potatoes, Butternut Squash, Water Sufficient for Processing, Vitamins {Vitamin E Supplement, Niacin Supplement, L-Ascorbyl-2 Polyphosphate (Source of Vitamin C), Biotin, Vitamin D2 Supplement}, Minerals {Zinc Sulfate, Ferrous Sulfate, Copper Sulfate, Manganese Sulfate, Selenium Yeast, Potassium Iodide}.'
  ) THEN
    RAISE EXCEPTION 'balanced official vitamin/mineral curly groups must not be flagged as OCR artifacts';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts('{"name":"Chicken"}') THEN
    RAISE EXCEPTION 'JSON object fragments with braces must still be flagged';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts('Chicken, Calcium Pantothenate {Vitamin B5)') THEN
    RAISE EXCEPTION 'unbalanced internal ingredient braces must still be flagged';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts(
    'Chicken, Fructooli9osaccharides, Vitamins {Vitamin E Supplement, L-Ascorbyl-2-Polyphosphate IVitamin Cl, Bacillus subtillis, Cooper Sulfate, Minerals IFerrous Sulfate, Manganese5e Sulfate, Mixed Tocopherols {preserNative)'
  ) THEN
    RAISE EXCEPTION 'malformed OCR ingredient text must still be flagged';
  END IF;
END;
$$;
