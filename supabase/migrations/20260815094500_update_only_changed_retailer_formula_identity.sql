-- Avoid rewriting every retailer-created formula and product_data row during
-- identity sync. Only rows whose exact package identity changed need repair.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.sync_retailer_web_formula_identity(uuid)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $old$    WHERE formula.id = representative.linked_formula_id
    RETURNING formula.id$old$,
    $new$    WHERE formula.id = representative.linked_formula_id
      AND ROW(
        formula.manufacturer,
        formula.brand,
        formula.product_name,
        formula.product_line,
        formula.life_stage,
        formula.food_form,
        formula.flavor,
        formula.diet_condition,
        formula.front_image_url,
        formula.source_url
      ) IS DISTINCT FROM ROW(
        representative.retailer_brand,
        representative.retailer_brand,
        representative.formula_title,
        representative.formula_title,
        representative.life_stage,
        representative.food_form,
        representative.flavor,
        representative.diet_condition,
        representative.front_image_url,
        representative.source_url
      )
    RETURNING formula.id$new$
  );

  v_fixed_definition := replace(
    v_fixed_definition,
    $old$    WHERE serving.cache_key = formula.promoted_cache_key
    RETURNING serving.id$old$,
    $new$    WHERE serving.cache_key = formula.promoted_cache_key
      AND ROW(
        serving.brand,
        serving.product_name,
        serving.product_line,
        serving.life_stage,
        serving.food_form,
        serving.flavor,
        serving.image_url,
        serving.source_url
      ) IS DISTINCT FROM ROW(
        representative.retailer_brand,
        representative.formula_title,
        representative.formula_title,
        representative.life_stage,
        representative.food_form,
        representative.flavor,
        representative.front_image_url,
        representative.source_url
      )
    RETURNING serving.id$new$
  );

  IF v_fixed_definition = v_definition
    OR position('IS DISTINCT FROM ROW' IN v_fixed_definition) = 0
  THEN
    RAISE EXCEPTION 'retailer identity changed-row markers not found';
  END IF;
  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.sync_retailer_web_formula_identity(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_retailer_web_formula_identity(UUID)
  TO service_role;
