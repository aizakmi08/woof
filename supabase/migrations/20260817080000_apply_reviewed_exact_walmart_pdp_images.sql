-- Close image-only retailer evidence gaps from a small, explicitly reviewed
-- Walmart PDP batch. Every row is pinned to the exact evidence content hash,
-- full-ingredient hash, linked canonical formula identity hash, source URL,
-- and exact Walmart hero asset. This lane cannot relink formulas or overwrite
-- a verified formula; it only makes the dated retailer package version
-- eligible for the existing strict serving-row promotion contract.

CREATE OR REPLACE FUNCTION public.catalog_reviewed_pdp_title_token_recall(
  p_expected TEXT,
  p_observed TEXT
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  WITH expected_tokens AS (
    SELECT DISTINCT token
    FROM unnest(regexp_split_to_array(
      public.catalog_normalize_retailer_title(p_expected),
      '[[:space:]]+'
    )) AS token
    WHERE length(token) > 1
      AND token !~ '^[0-9]+$'
      AND token <> ALL(ARRAY[
        'and','bag','can','cans','cat','count','dog','food','for','formula',
        'lb','lbs','natural','of','oz','pack','pound','recipe','the','with'
      ])
  ), observed_tokens AS (
    SELECT DISTINCT token
    FROM unnest(regexp_split_to_array(
      public.catalog_normalize_retailer_title(p_observed),
      '[[:space:]]+'
    )) AS token
    WHERE length(token) > 1
  )
  SELECT CASE
    WHEN count(*) = 0 THEN 0::NUMERIC
    ELSE count(*) FILTER (
      WHERE expected.token IN (SELECT token FROM observed_tokens)
    )::NUMERIC / count(*)::NUMERIC
  END
  FROM expected_tokens expected;
$function$;

CREATE OR REPLACE FUNCTION public.apply_reviewed_exact_walmart_pdp_images(
  p_import_run_id UUID,
  p_payload JSONB
)
RETURNS TABLE(updated_rows INTEGER, rejected_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_input INTEGER := 0;
  v_updated INTEGER := 0;
BEGIN
  IF p_import_run_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.catalog_import_runs WHERE id = p_import_run_id
  ) THEN
    RAISE EXCEPTION 'Unknown catalog import run %', p_import_run_id;
  END IF;
  IF jsonb_typeof(COALESCE(p_payload, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Reviewed Walmart PDP image payload must be an array';
  END IF;

  SELECT jsonb_array_length(COALESCE(p_payload, '[]'::JSONB)) INTO v_input;
  IF v_input < 1 OR v_input > 50 THEN
    RAISE EXCEPTION 'Reviewed Walmart PDP image batch must contain 1-50 rows';
  END IF;
  IF (
    SELECT count(*)
    FROM (
      SELECT DISTINCT row.source_external_id
      FROM jsonb_to_recordset(p_payload) AS row(source_external_id TEXT)
    ) unique_rows
  ) <> v_input THEN
    RAISE EXCEPTION 'Reviewed Walmart PDP image payload contains duplicate ids';
  END IF;

  WITH parsed AS (
    SELECT row.*
    FROM jsonb_to_recordset(p_payload) AS row(
      source_external_id TEXT,
      source_url TEXT,
      content_hash TEXT,
      ingredient_hash TEXT,
      linked_formula_hash TEXT,
      front_image_url TEXT,
      image_title TEXT,
      image_content_hash TEXT,
      image_observed_at TIMESTAMPTZ,
      evidence_method TEXT
    )
  ), valid AS (
    SELECT parsed.*, evidence.id AS evidence_id, evidence.linked_observation_id,
      formula.id AS formula_id, formula.brand, formula.life_stage,
      formula.food_form, formula.flavor, formula.diet_condition,
      formula.identity_hash
    FROM parsed
    JOIN public.catalog_retailer_ingredient_evidence evidence
      ON evidence.import_run_id = p_import_run_id
     AND evidence.is_current
     AND evidence.source_slug = 'walmart'
     AND evidence.source_external_id = parsed.source_external_id
     AND evidence.source_url = parsed.source_url
     AND evidence.content_hash = parsed.content_hash
     AND evidence.ingredient_hash = parsed.ingredient_hash
     AND evidence.evidence_status = 'linked_missing_exact_image'
     AND evidence.linked_formula_id IS NOT NULL
     AND evidence.linked_observation_id IS NOT NULL
    JOIN public.catalog_formulas formula
      ON formula.id = evidence.linked_formula_id
     AND formula.identity_hash = parsed.linked_formula_hash
     AND formula.active
     AND formula.is_complete_food
     AND formula.verification_status = 'discovered'
     AND formula.ingredient_verification_status = 'unverified'
     AND formula.image_verification_status = 'unverified'
     AND formula.pet_type = evidence.pet_type
    WHERE parsed.source_external_id ~ '^[0-9]{5,20}$'
      AND parsed.source_url ~ (
        '^https://www[.]walmart[.]com/ip/.+/' || parsed.source_external_id || '$'
      )
      AND parsed.content_hash ~ '^[0-9a-f]{64}$'
      AND parsed.ingredient_hash ~ '^[0-9a-f]{64}$'
      AND parsed.linked_formula_hash ~ '^[0-9a-f]{64}$'
      AND parsed.image_content_hash ~ '^[0-9a-f]{64}$'
      AND parsed.front_image_url ~ '^https://i5[.]walmartimages[.]com/seo/'
      AND NULLIF(btrim(parsed.image_title), '') IS NOT NULL
      AND parsed.image_observed_at IS NOT NULL
      AND parsed.image_observed_at <= now() + interval '5 minutes'
      AND parsed.image_observed_at >= now() - interval '14 days'
      AND parsed.evidence_method = 'reviewed_exact_walmart_pdp_hero_v1'
      AND evidence.pet_type IN ('dog', 'cat')
      AND public.catalog_retailer_ingredient_is_serving_safe(
        COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
      )
      AND length(COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)) >= 30
      AND public.catalog_retailer_serving_ingredient_count(
        COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
      ) >= 5
      AND evidence.ingredient_text !~ '(\.\.\.|…)'
      AND NOT public.catalog_has_unbalanced_parentheses(
        COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
      )
      AND NOT public.catalog_has_ingredient_ocr_artifacts(
        COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
      )
      AND public.catalog_reviewed_pdp_title_token_recall(
        formula.product_name, evidence.formula_title
      ) >= 0.72
      AND public.catalog_reviewed_pdp_title_token_recall(
        evidence.formula_title, parsed.image_title
      ) >= 0.72
      AND public.catalog_retailer_formula_hard_boundaries_match(
        formula.brand,
        evidence.pet_type,
        formula.life_stage,
        formula.food_form,
        formula.flavor,
        formula.diet_condition,
        formula.brand,
        formula.pet_type,
        formula.life_stage,
        formula.food_form,
        formula.flavor,
        formula.diet_condition
      )
      AND public.catalog_normalize_retailer_title(evidence.formula_title)
        LIKE '%' || public.catalog_normalize_retailer_title(evidence.pet_type) || '%'
      AND (
        public.catalog_normalize_retailer_title(formula.life_stage) IN ('', 'unknown')
        OR public.catalog_normalize_retailer_title(evidence.formula_title)
          LIKE '%' || public.catalog_normalize_retailer_title(formula.life_stage) || '%'
      )
      AND (
        public.catalog_normalize_retailer_title(formula.food_form) IN ('', 'unknown', 'other')
        OR public.catalog_normalize_retailer_title(evidence.formula_title)
          LIKE '%' || public.catalog_normalize_retailer_title(formula.food_form) || '%'
      )
  ), changed AS (
    UPDATE public.catalog_retailer_ingredient_evidence evidence
    SET
      retailer_brand = valid.brand,
      life_stage = valid.life_stage,
      food_form = valid.food_form,
      flavor = valid.flavor,
      diet_condition = valid.diet_condition,
      formula_identity_hash = valid.identity_hash,
      front_image_url = valid.front_image_url,
      image_title = valid.image_title,
      image_source_url = valid.source_url,
      image_observed_at = valid.image_observed_at,
      image_content_hash = valid.image_content_hash,
      image_validation_status = 'exact_retailer_sku',
      evidence_status = 'promotable_exact_package',
      validation_reasons = array_remove(
        evidence.validation_reasons,
        'exact_formula_missing_front_image'
      ),
      raw_payload = evidence.raw_payload || jsonb_build_object(
        'package_evidence_method', valid.evidence_method,
        'package_image_source_url', valid.source_url,
        'package_image_observed_at', valid.image_observed_at,
        'package_image_content_hash', valid.image_content_hash,
        'reviewed_linked_formula_hash', valid.linked_formula_hash,
        'review_policy', 'exact PDP title and hero image manually matched; content, ingredients, and canonical formula identity hash pinned',
        'formula_version_policy', 'dated retailer web version; no manufacturer-current equivalence asserted'
      ),
      updated_at = now()
    FROM valid
    WHERE evidence.id = valid.evidence_id
    RETURNING evidence.linked_observation_id, evidence.front_image_url,
      evidence.image_content_hash
  ), observation_update AS (
    UPDATE public.catalog_observations observation
    SET
      front_image_url = changed.front_image_url,
      validation_status = 'accepted',
      raw_payload = observation.raw_payload || jsonb_build_object(
        'reviewed_exact_walmart_pdp_image_hash', changed.image_content_hash,
        'reviewed_exact_walmart_pdp_image_at', now()
      )
    FROM changed
    WHERE observation.id = changed.linked_observation_id
    RETURNING observation.id
  )
  SELECT count(*) INTO v_updated FROM changed;

  RETURN QUERY SELECT v_updated, GREATEST(v_input - v_updated, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.catalog_reviewed_pdp_title_token_recall(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_reviewed_pdp_title_token_recall(TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.apply_reviewed_exact_walmart_pdp_images(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reviewed_exact_walmart_pdp_images(UUID, JSONB)
  TO service_role;
