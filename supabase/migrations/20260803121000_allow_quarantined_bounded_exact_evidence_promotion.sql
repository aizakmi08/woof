-- stage_catalog_census_batch deliberately quarantines non-paginated runs with
-- run_not_proven_complete. A bounded exact-evidence run is expected to have
-- that state because it proves only its requested formulas, not the full source
-- inventory. Admit that one quarantine reason without weakening any downstream
-- evidence or identity postcondition.

CREATE OR REPLACE FUNCTION public.promote_catalog_formula(p_formula_id BIGINT)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  source_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE observation.formula_id = p_formula_id
      AND observation.validation_status = 'accepted'
      AND (
        (
          source_run.status = 'completed'
          AND source_run.pagination_complete
        )
        OR (
          source_run.status IN ('completed', 'quarantined')
          AND (
            source_run.status <> 'quarantined'
            OR source_run.error_summary = 'run_not_proven_complete'
          )
          AND source_run.metadata->>'bounded_exact_evidence' = 'true'
          AND source_run.metadata->>'exact_formula_evidence' = 'true'
          AND COALESCE(source_run.expected_count, -1) = source_run.observed_count
          AND source_run.observed_count = source_run.accepted_count
          AND source_run.rejected_count = 0
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % lacks an accepted observation from a complete source run or a complete bounded exact-evidence run',
      p_formula_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.id = p_formula_id
      AND (
        public.catalog_has_unbalanced_parentheses(formula.ingredient_text)
        OR public.catalog_has_ingredient_ocr_artifacts(formula.ingredient_text)
      )
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % fails the ingredient artifact gate',
      p_formula_id;
  END IF;

  RETURN QUERY
  SELECT promoted.cache_key, promoted.product_name, promoted.brand, promoted.source_url
  FROM public.promote_catalog_formula_without_completed_run_gate(p_formula_id) promoted;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id = p_formula_id
      AND serving.is_complete_food
      AND COALESCE(serving.catalog_exclusion_reason, '') = ''
      AND serving.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND serving.ingredient_verification_status IN (
        'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
      )
      AND serving.image_verification_status IN (
        'official', 'manufacturer', 'retailer_verified'
      )
      AND serving.ingredient_count >= 5
      AND btrim(serving.ingredient_text) <> ''
      AND btrim(serving.image_url) <> ''
      AND lower(COALESCE(serving.pet_type, '')) = lower(formula.pet_type)
      AND lower(COALESCE(serving.product_line, '')) = lower(formula.product_line)
      AND lower(COALESCE(serving.life_stage, 'unknown')) = lower(formula.life_stage)
      AND lower(COALESCE(serving.food_form, 'unknown')) = lower(formula.food_form)
      AND lower(COALESCE(serving.flavor, '')) = lower(formula.flavor)
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % did not produce an exact verified serving row',
      p_formula_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM anon;
REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_catalog_formula(BIGINT) TO service_role;
