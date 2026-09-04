-- Target's Sunday Chicken ingredient copy contains "potassium lodide" and a
-- doubled comma. Preserve it as quarantined evidence, never as a verified
-- formula, and teach the shared artifact guard to reject these patterns.

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
  OR value ~ ',\s*,'
  OR value ~* '(^|[^A-Za-z])-\s*Ascorbyl-2-Polyphosphate\M'
  OR value ~* '\mSupplement\.\s+preserved\s+with\M'
  OR value ~* '\mI(Vitamin|min|max|preservative|Ferrous)\M'
  OR value ~* '\m(pyr\s+idoxine|pantot\s+henate|ribo\s+flavin|thia\s+mine|bio\s+tin)\M'
  OR value ~* '\m(Fructooli[0-9]osaccharides|Manganese[0-9]e|preserNative|subtillis|cooper\s+sulfate|sufate|sultate|ch[io]ride|calcium\s+lodate|potassium\s+lodide|lodide|lodate|pyridoxine\s+vitamin\s+b-?6|niain|nacin|nutri\*nt|r[0-9]cogniz[0-9]d|[0-9]ssential|potss+sium|vitss?min|d\.calcium)\M'
  OR value ~* '\mMi\s+nerals\M'
FROM curly_review;
$$;

REVOKE ALL ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_has_ingredient_ocr_artifacts(TEXT) TO service_role;

DO $$
DECLARE
  v_cache CONSTANT TEXT := 'census:c7b3fe91e2ab051b4c2075349e4e6986';
  v_formula_id BIGINT;
BEGIN
  SELECT id INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_cache
    AND source_url = 'https://www.target.com/p/-/A-52619691'
    AND formula_evidence_tier = 'retailer_web_version';

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key = v_cache
      AND ingredient_text ~* '\mpotassium\s+lodide\M'
      AND ingredient_text ~ ',\s*,'
      AND public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
  ) THEN
    RAISE EXCEPTION 'Sunday Chicken Target transcription precondition changed';
  END IF;

  UPDATE public.product_data
  SET
    is_complete_food = false,
    catalog_exclusion_reason =
      'ingredient_text_artifact_requires_exact_label_review',
    ingredient_verification_status = 'unverified',
    image_verification_status = 'unverified',
    verified_at = NULL,
    formula_evidence_tier = 'unverified',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'version_status', 'quarantined_retailer_transcription',
        'blocker', 'potassium_lodide_and_repeated_delimiter',
        'promotion_allowed', false
      ),
    updated_at = now()
  WHERE cache_key = v_cache;

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    formula_evidence_tier = 'unverified',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'version_status', 'quarantined_retailer_transcription',
        'blocker', 'potassium_lodide_and_repeated_delimiter',
        'promotion_allowed', false
      ),
    updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.catalog_observations
  SET
    validation_status = 'quarantined',
    validation_reasons = ARRAY[
      'ingredient_text_artifact_requires_exact_label_review',
      'potassium_lodide_transcription',
      'repeated_ingredient_delimiter'
    ]::TEXT[],
    formula_evidence_tier = 'unverified',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'version_status', 'quarantined_retailer_transcription',
        'blocker', 'potassium_lodide_and_repeated_delimiter',
        'promotion_allowed', false
      )
  WHERE formula_id = v_formula_id
    OR (
      source_url = 'https://www.target.com/p/-/A-52619691'
      AND source_external_id = '52619691'
    );

  UPDATE public.catalog_product_evidence
  SET review_state = 'manual_review'
  WHERE cache_key = v_cache;

  IF EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key = v_cache
      AND public.catalog_quality_state(
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
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id = v_formula_id
      AND (active OR verification_status = 'verified')
  ) THEN
    RAISE EXCEPTION 'Sunday Chicken Target artifact remained serveable';
  END IF;
END
$$;
