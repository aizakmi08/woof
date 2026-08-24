-- Promote only the corrected, current Nulo official-evidence batch. The prior
-- bounded run truncated three comma-separated recipe identities; quarantine
-- those observations and formulas before making the corrected formulas live.

DO $$
DECLARE
  v_run_id BIGINT;
  v_old_run_id BIGINT;
  v_formula RECORD;
  v_formula_count INTEGER;
BEGIN
  SELECT id
  INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = 'nulo:bounded-exact-evidence:11ba8cb711e0dac839f17243'
    AND status = 'quarantined'
    AND error_summary = 'run_not_proven_complete'
    AND metadata->>'bounded_exact_evidence' = 'true'
    AND metadata->>'exact_formula_evidence' = 'true'
    AND expected_count = 11
    AND observed_count = 11
    AND accepted_count = 11
    AND rejected_count = 0;

  SELECT count(DISTINCT observation.formula_id)::INTEGER
  INTO v_formula_count
  FROM public.catalog_observations observation
  WHERE observation.run_id = v_run_id
    AND observation.validation_status = 'accepted';

  IF v_formula_count <> 11 THEN
    RAISE EXCEPTION 'Corrected Nulo batch expected 11 exact formulas, found %', v_formula_count;
  END IF;

  SELECT id
  INTO v_old_run_id
  FROM public.catalog_source_runs
  WHERE run_key = 'nulo:bounded-exact-evidence:3ada479d06e777e8aeb2d0bc';

  IF v_old_run_id IS NOT NULL THEN
    WITH flawed AS (
      SELECT DISTINCT formula.id
      FROM public.catalog_observations observation
      JOIN public.catalog_formulas formula ON formula.id = observation.formula_id
      WHERE observation.run_id = v_old_run_id
        AND (
          (formula.product_name = 'Minced with Whole Proteins Chicken, Crab & Prawn Recipe for Cats'
            AND formula.flavor = 'Crab & Prawn Recipe')
          OR (formula.product_name = 'Minced with Whole Proteins Tuna, Chicken & Pumpkin Recipe for Cats'
            AND formula.flavor = 'Chicken & Pumpkin Recipe')
          OR (formula.product_name = 'Signature Stews Beef, Beef Liver & Kale Recipe for Dogs'
            AND formula.flavor = 'Beef Liver & Kale Recipe')
        )
    )
    UPDATE public.catalog_observations observation
    SET
      validation_status = 'quarantined',
      validation_reasons = ARRAY(
        SELECT DISTINCT reason
        FROM unnest(
          COALESCE(observation.validation_reasons, ARRAY[]::TEXT[])
          || ARRAY['truncated_visible_recipe_identity']::TEXT[]
        ) reason
      )
    FROM flawed
    WHERE observation.run_id = v_old_run_id
      AND observation.formula_id = flawed.id;

    WITH flawed AS (
      SELECT DISTINCT formula.id
      FROM public.catalog_observations observation
      JOIN public.catalog_formulas formula ON formula.id = observation.formula_id
      WHERE observation.run_id = v_old_run_id
        AND observation.validation_reasons @> ARRAY['truncated_visible_recipe_identity']::TEXT[]
    )
    UPDATE public.catalog_formulas formula
    SET
      verification_status = 'quarantined',
      promoted_cache_key = NULL,
      promoted_at = NULL,
      updated_at = NOW()
    FROM flawed
    WHERE formula.id = flawed.id;

    WITH flawed AS (
      SELECT DISTINCT observation.formula_id
      FROM public.catalog_observations observation
      WHERE observation.run_id = v_old_run_id
        AND observation.validation_reasons @> ARRAY['truncated_visible_recipe_identity']::TEXT[]
    )
    UPDATE public.catalog_field_evidence evidence
    SET accepted = FALSE
    FROM flawed
    WHERE evidence.formula_id = flawed.formula_id;

    UPDATE public.catalog_source_runs source_run
    SET
      accepted_count = (
        SELECT count(*)::INTEGER
        FROM public.catalog_observations observation
        WHERE observation.run_id = v_old_run_id
          AND observation.validation_status = 'accepted'
      ),
      rejected_count = (
        SELECT count(*)::INTEGER
        FROM public.catalog_observations observation
        WHERE observation.run_id = v_old_run_id
          AND observation.validation_status <> 'accepted'
      ),
      updated_at = NOW()
    WHERE source_run.id = v_old_run_id;
  END IF;

  FOR v_formula IN
    SELECT DISTINCT formula.id
    FROM public.catalog_observations observation
    JOIN public.catalog_formulas formula ON formula.id = observation.formula_id
    WHERE observation.run_id = v_run_id
      AND observation.validation_status = 'accepted'
    ORDER BY formula.id
  LOOP
    PERFORM * FROM public.promote_catalog_formula(v_formula.id);
  END LOOP;

  IF (
    SELECT count(DISTINCT formula.id)
    FROM public.catalog_observations observation
    JOIN public.catalog_formulas formula ON formula.id = observation.formula_id
    JOIN public.product_data serving ON serving.cache_key = formula.promoted_cache_key
    WHERE observation.run_id = v_run_id
      AND observation.validation_status = 'accepted'
      AND formula.verification_status = 'verified'
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND lower(serving.product_line) = lower(formula.product_line)
      AND lower(serving.pet_type) = lower(formula.pet_type)
      AND lower(serving.life_stage) = lower(formula.life_stage)
      AND lower(serving.food_form) = lower(formula.food_form)
      AND lower(serving.flavor) = lower(formula.flavor)
  ) <> 11 THEN
    RAISE EXCEPTION 'Corrected Nulo batch failed exact serving-row postconditions';
  END IF;
END;
$$;
