-- The package-evidence table now carries inferred identity fields. Qualify the
-- canonical formula fields selected by the serving promotion function so the
-- new columns cannot make the projection ambiguous.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $marker$      formula.product_line,
      formula.flavor,
      formula.life_stage,
      formula.food_form,$marker$,
    $replacement$      formula.product_line,
      formula.flavor AS canonical_flavor,
      formula.life_stage AS canonical_life_stage,
      formula.food_form AS canonical_food_form,$replacement$
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    $marker$    brand,
    NULL,
    product_line,
    flavor,
    life_stage,
    food_form,
    NULL,$marker$,
    $replacement$    brand,
    NULL,
    product_line,
    canonical_flavor,
    canonical_life_stage,
    canonical_food_form,
    NULL,$replacement$
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'retailer promotion formula field markers not found';
  END IF;
  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
