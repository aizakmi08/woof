-- Promote four current Tiki Cat After Dark Velvet Mousse formulas as their
-- own exact texture/version identities. Tiki's official PDPs reuse the same
-- recipe H1 for the pâté siblings, but the product-local range heading, PDP
-- path, package image, ingredient statement, and guaranteed analysis prove
-- that Velvet Mousse is a separate formula version.

DO $$
DECLARE
  v_run_id BIGINT;
  v_formula RECORD;
  v_formula_count INTEGER;
BEGIN
  SELECT id
  INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = 'tiki-pets:bounded-exact-evidence:135145894924065cb7944dc5'
    AND status = 'quarantined'
    AND error_summary = 'run_not_proven_complete'
    AND metadata->>'bounded_exact_evidence' = 'true'
    AND metadata->>'exact_formula_evidence' = 'true'
    AND expected_count = 4
    AND observed_count = 4
    AND accepted_count = 4
    AND rejected_count = 0;

  SELECT count(DISTINCT formula.id)::INTEGER
  INTO v_formula_count
  FROM public.catalog_observations observation
  JOIN public.catalog_formulas formula ON formula.id = observation.formula_id
  WHERE observation.run_id = v_run_id
    AND observation.validation_status = 'accepted'
    AND formula.brand = 'Tiki Cat'
    AND formula.pet_type = 'cat'
    AND formula.food_form = 'wet'
    AND formula.product_line = 'After Dark Velvet Mousse'
    AND formula.flavor IN (
      'Chicken & Beef Recipe',
      'Chicken & Duck Recipe',
      'Chicken & Quail Egg Recipe',
      'Chicken Recipe'
    )
    AND formula.source_url LIKE
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/after-dark/velvet-mousse-%'
    AND NULLIF(btrim(formula.ingredient_text), '') IS NOT NULL
    AND cardinality(formula.ingredients) >= 5
    AND NULLIF(btrim(formula.front_image_url), '') IS NOT NULL
    AND formula.front_image_url LIKE 'https://tikipets.com/wp-content/uploads/%';

  IF v_formula_count <> 4 THEN
    RAISE EXCEPTION
      'Tiki Velvet Mousse batch expected four exact formula versions, found %',
      v_formula_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_formulas formula ON formula.id = observation.formula_id
    WHERE observation.run_id = v_run_id
      AND observation.validation_status = 'accepted'
    GROUP BY formula.product_name
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'Tiki Velvet Mousse batch contains duplicate exact recipe identities';
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
      AND serving.source_url = formula.source_url
      AND serving.product_name = formula.product_name
      AND serving.product_line = formula.product_line
      AND serving.flavor = formula.flavor
      AND serving.pet_type = formula.pet_type
      AND COALESCE(serving.life_stage, 'unknown') = formula.life_stage
      AND serving.food_form = formula.food_form
      AND lower(regexp_replace(btrim(serving.ingredient_text), '\s+', ' ', 'g'))
          = lower(regexp_replace(btrim(formula.ingredient_text), '\s+', ' ', 'g'))
      AND serving.image_url = formula.front_image_url
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.is_complete_food = TRUE
      AND COALESCE(serving.catalog_exclusion_reason, '') = ''
  ) <> 4 THEN
    RAISE EXCEPTION 'Tiki Velvet Mousse exact serving-row postconditions failed';
  END IF;
END;
$$;
