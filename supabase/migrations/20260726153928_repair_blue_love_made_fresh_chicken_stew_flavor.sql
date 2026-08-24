-- Preserve the visible Chicken Stew recipe identity for the refrigerated
-- small-breed tub. Target's flavor field is empty, but the exact package/PDP
-- title supplies the protected recipe term.

DO $$
DECLARE v_formula_id BIGINT;
DECLARE v_cache_key TEXT;
BEGIN
  SELECT observation.formula_id, formula.promoted_cache_key
  INTO STRICT v_formula_id, v_cache_key
  FROM public.catalog_observations observation
  JOIN public.catalog_source_runs source_run
    ON source_run.id = observation.run_id
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  WHERE source_run.run_key =
    'target-blue-buffalo-reviewed-source-versions-v134d:20260726'
    AND observation.source_external_id = '94636198';

  UPDATE public.catalog_observations
  SET
    flavor = 'Chicken Stew',
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'flavor_evidence', 'exact package/PDP title: Chicken Stew'
      )
  WHERE formula_id = v_formula_id;

  UPDATE public.catalog_formulas
  SET
    flavor = 'Chicken Stew',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'flavor_evidence', 'exact package/PDP title: Chicken Stew'
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
    flavor = 'Chicken Stew',
    nutritional_info =
      COALESCE(nutritional_info, '{}'::JSONB) ||
      jsonb_build_object('flavor', 'Chicken Stew'),
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'flavor_evidence', 'exact package/PDP title: Chicken Stew'
      ),
    updated_at = now()
  WHERE cache_key = v_cache_key;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id = v_formula_id
      AND formula.food_form = 'fresh'
      AND formula.flavor = 'Chicken Stew'
      AND serving.food_form = 'fresh'
      AND serving.flavor = 'Chicken Stew'
  ) THEN
    RAISE EXCEPTION 'Blue Chicken Stew identity repair failed';
  END IF;
END
$$;
