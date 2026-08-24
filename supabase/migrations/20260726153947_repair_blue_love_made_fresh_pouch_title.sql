-- Target's merchandising title calls this refrigerated pouch "wet dog food".
-- The reviewed package front instead says Love Made Fresh, Chicken Recipe with
-- Carrots & Peas, and Refrigerated Food for Adult Dogs. Preserve that exact
-- shelf identity so downstream refinement cannot collapse fresh into wet.
DO $$
DECLARE v_formula_id BIGINT;
DECLARE v_cache_key TEXT;
DECLARE v_exact_title TEXT :=
  'Blue Buffalo Love Made Fresh Chicken Recipe with Carrots & Peas '
  || 'Refrigerated Fresh Adult Dog Food Pouch';
BEGIN
  SELECT observation.formula_id, formula.promoted_cache_key
  INTO STRICT v_formula_id, v_cache_key
  FROM public.catalog_observations observation
  JOIN public.catalog_source_runs source_run
    ON source_run.id = observation.run_id
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  WHERE source_run.run_key =
    'target-blue-buffalo-reviewed-source-versions-v137d:20260726'
    AND observation.source_external_id = '94897297';

  UPDATE public.catalog_observations
  SET
    product_name = v_exact_title,
    product_line = v_exact_title,
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'visible_title_evidence',
          'package front: Love Made Fresh Chicken Recipe with Carrots & Peas; Refrigerated Food for Adult Dogs',
        'retailer_merchandising_title_preserved',
          'Blue Buffalo Love Made Fresh Chicken Stand-Up Resealable Pouch Wet Dog Food'
      )
  WHERE formula_id = v_formula_id;

  UPDATE public.catalog_formulas
  SET
    product_name = v_exact_title,
    product_line = v_exact_title,
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'visible_title_evidence',
          'exact reviewed package front',
        'canonical_visible_title', v_exact_title
      ),
    updated_at = now()
  WHERE id = v_formula_id;

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
  WHERE formula.id = v_formula_id;

  UPDATE public.product_data
  SET
    product_name = v_exact_title,
    product_line = v_exact_title,
    nutritional_info =
      COALESCE(nutritional_info, '{}'::JSONB) ||
      jsonb_build_object(
        'product_line', v_exact_title,
        'food_form', 'fresh',
        'flavor', 'Chicken'
      ),
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'visible_title_evidence', 'exact reviewed package front',
        'canonical_visible_title', v_exact_title
      ),
    updated_at = now()
  WHERE cache_key = v_cache_key;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id = v_formula_id
      AND formula.product_name = v_exact_title
      AND formula.food_form = 'fresh'
      AND formula.flavor = 'Chicken'
      AND serving.product_name = v_exact_title
      AND serving.food_form = 'fresh'
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh pouch title repair failed';
  END IF;
END
$$;
