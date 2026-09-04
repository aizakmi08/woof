-- A size-free title is not sufficient to reuse a formula when the retailer
-- publishes a different ingredient statement for another package. Require
-- exact normalized ingredients on title-only reconciliation, and reset any
-- already-promoted retailer-created conflict for safe rematerialization.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
  v_old TEXT := $old$
     AND (
       public.catalog_normalize_retailer_title(formula.product_name)
         = public.catalog_normalize_retailer_title(evidence.formula_title)
       OR public.catalog_normalize_retailer_title(formula.product_line)
         = public.catalog_normalize_retailer_title(evidence.formula_title)
     )
$old$;
  v_new TEXT := $new$
     AND (
       public.catalog_normalize_retailer_title(formula.product_name)
         = public.catalog_normalize_retailer_title(evidence.formula_title)
       OR public.catalog_normalize_retailer_title(formula.product_line)
         = public.catalog_normalize_retailer_title(evidence.formula_title)
     )
     AND regexp_replace(lower(btrim(formula.ingredient_text)), '\s+', ' ', 'g')
       = regexp_replace(lower(btrim(evidence.ingredient_text)), '\s+', ' ', 'g')
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.materialize_retailer_web_formulas(uuid,integer)'::regprocedure
  ) INTO v_definition;
  v_fixed_definition := replace(v_definition, v_old, v_new);
  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'retailer exact-title ingredient marker not found';
  END IF;
  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.materialize_retailer_web_formulas(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_retailer_web_formulas(UUID, INTEGER)
  TO service_role;
