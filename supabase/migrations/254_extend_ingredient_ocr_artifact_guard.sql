-- Extend the OCR artifact detector with additional Vision misreads observed
-- during the IAMS official label import.

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
  IF public.catalog_has_ingredient_ocr_artifacts('Chicken, L-Ascorbyl-2-Polyphosphate, Vitamin B12 Supplement, Bacillus subtilis, Copper Sulfate') THEN
    RAISE EXCEPTION 'valid ingredient micronutrients must not be flagged as OCR artifacts';
  END IF;

  IF NOT public.catalog_has_ingredient_ocr_artifacts('Chicken, Bacillus subtillis, Cooper Sulfate, Mixed Tocopherols') THEN
    RAISE EXCEPTION 'new OCR artifact misspellings must be flagged';
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
