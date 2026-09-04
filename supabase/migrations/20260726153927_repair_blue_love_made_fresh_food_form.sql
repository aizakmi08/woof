-- Target taxonomy calls refrigerated Blue Buffalo products "wet food", while
-- the exact package identity says Love Made Fresh / refrigerated. Preserve the
-- fresh-vs-wet formula boundary in serving, formula, and evidence records.

DO $$
DECLARE v_count INTEGER;
BEGIN
  CREATE TEMP TABLE pg_temp.blue_love_made_fresh_formulas
  ON COMMIT DROP AS
  SELECT DISTINCT
    observation.formula_id,
    formula.promoted_cache_key
  FROM public.catalog_observations observation
  JOIN public.catalog_source_runs source_run
    ON source_run.id = observation.run_id
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  WHERE source_run.run_key =
    'target-blue-buffalo-reviewed-source-versions-v134d:20260726'
    AND observation.source_external_id IN ('94636198', '94897295');

  SELECT count(*) INTO v_count
  FROM pg_temp.blue_love_made_fresh_formulas;
  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'Blue Love Made Fresh correction target changed: %',
      v_count;
  END IF;

  UPDATE public.catalog_observations observation
  SET
    food_form = 'fresh',
    raw_payload = COALESCE(observation.raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'food_form_evidence',
          'exact package says Love Made Fresh / refrigerated',
        'retailer_taxonomy_food_form', 'wet',
        'canonical_food_form', 'fresh'
      ),
    formula_version_provenance =
      COALESCE(observation.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'food_form_correction', 'fresh_refrigerated_package_identity'
      )
  FROM pg_temp.blue_love_made_fresh_formulas target
  WHERE observation.formula_id = target.formula_id;

  UPDATE public.catalog_formulas formula
  SET
    food_form = 'fresh',
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'food_form_evidence',
          'exact package says Love Made Fresh / refrigerated',
        'retailer_taxonomy_food_form', 'wet',
        'canonical_food_form', 'fresh'
      ),
    updated_at = now()
  FROM pg_temp.blue_love_made_fresh_formulas target
  WHERE formula.id = target.formula_id;

  UPDATE public.catalog_formulas formula
  SET
    identity_hash = encode(
      digest(
        lower(concat_ws(
          '|', formula.manufacturer, formula.brand, formula.product_line,
          formula.pet_type, formula.life_stage, formula.food_form,
          formula.flavor, formula.diet_condition,
          public.catalog_normalize_ingredient_evidence(
            formula.ingredient_text
          )
        )),
        'sha256'
      ),
      'hex'
    ),
    formula_key = 'retailer-package-version:' || encode(
      digest(
        lower(concat_ws(
          '|', formula.manufacturer, formula.brand, formula.product_line,
          formula.pet_type, formula.life_stage, formula.food_form,
          formula.flavor, formula.diet_condition,
          public.catalog_normalize_ingredient_evidence(
            formula.ingredient_text
          )
        )),
        'sha256'
      ),
      'hex'
    ),
    updated_at = now()
  FROM pg_temp.blue_love_made_fresh_formulas target
  WHERE formula.id = target.formula_id;

  UPDATE public.product_data serving
  SET
    food_form = 'fresh',
    nutritional_info =
      COALESCE(serving.nutritional_info, '{}'::JSONB) ||
      jsonb_build_object('food_form', 'fresh'),
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'food_form_evidence',
          'exact package says Love Made Fresh / refrigerated',
        'retailer_taxonomy_food_form', 'wet',
        'canonical_food_form', 'fresh'
      ),
    updated_at = now()
  FROM pg_temp.blue_love_made_fresh_formulas target
  WHERE serving.cache_key = target.promoted_cache_key;

  IF (
    SELECT count(*)
    FROM pg_temp.blue_love_made_fresh_formulas target
    JOIN public.catalog_formulas formula
      ON formula.id = target.formula_id
     AND formula.food_form = 'fresh'
    JOIN public.product_data serving
      ON serving.cache_key = target.promoted_cache_key
     AND serving.food_form = 'fresh'
  ) <> 2 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh food-form correction failed';
  END IF;
END
$$;
