-- Keep source-created retailer web formulas and their serving rows aligned
-- with the latest exact package evidence. Manufacturer/official formulas are
-- intentionally excluded from this repair path.

CREATE OR REPLACE FUNCTION public.sync_retailer_web_formula_identity(
  p_import_run_id UUID
)
RETURNS TABLE(updated_formulas INTEGER, updated_serving_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_formulas INTEGER := 0;
  v_serving INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.catalog_import_runs WHERE id = p_import_run_id) THEN
    RAISE EXCEPTION 'Unknown catalog import run %', p_import_run_id;
  END IF;

  WITH representative AS (
    SELECT DISTINCT ON (evidence.linked_formula_id)
      evidence.linked_formula_id,
      evidence.retailer_brand,
      evidence.formula_title,
      evidence.life_stage,
      evidence.food_form,
      evidence.flavor,
      evidence.diet_condition,
      evidence.front_image_url,
      evidence.source_url,
      evidence.fetched_at
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula ON formula.id = evidence.linked_formula_id
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'promoted'
      AND evidence.image_validation_status = 'exact_retailer_sku'
      AND NULLIF(btrim(evidence.retailer_brand), '') IS NOT NULL
      AND formula.formula_key LIKE 'retailer-web:' || evidence.source_slug || ':%'
    ORDER BY evidence.linked_formula_id,
      evidence.fetched_at DESC NULLS LAST,
      evidence.id DESC
  ), changed AS (
    UPDATE public.catalog_formulas formula
    SET
      manufacturer = representative.retailer_brand,
      brand = representative.retailer_brand,
      product_name = representative.formula_title,
      product_line = representative.formula_title,
      life_stage = representative.life_stage,
      food_form = representative.food_form,
      flavor = representative.flavor,
      diet_condition = representative.diet_condition,
      front_image_url = representative.front_image_url,
      source_url = representative.source_url,
      last_observed_at = GREATEST(
        formula.last_observed_at,
        COALESCE(representative.fetched_at, now())
      ),
      updated_at = now()
    FROM representative
    WHERE formula.id = representative.linked_formula_id
    RETURNING formula.id
  )
  SELECT count(*) INTO v_formulas FROM changed;

  WITH representative AS (
    SELECT DISTINCT ON (evidence.linked_formula_id)
      evidence.linked_formula_id,
      evidence.retailer_brand,
      evidence.formula_title,
      evidence.life_stage,
      evidence.food_form,
      evidence.flavor,
      evidence.front_image_url,
      evidence.source_url
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula ON formula.id = evidence.linked_formula_id
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'promoted'
      AND evidence.image_validation_status = 'exact_retailer_sku'
      AND NULLIF(btrim(evidence.retailer_brand), '') IS NOT NULL
      AND formula.formula_key LIKE 'retailer-web:' || evidence.source_slug || ':%'
    ORDER BY evidence.linked_formula_id,
      evidence.fetched_at DESC NULLS LAST,
      evidence.id DESC
  ), changed AS (
    UPDATE public.product_data serving
    SET
      brand = representative.retailer_brand,
      product_name = representative.formula_title,
      product_line = representative.formula_title,
      life_stage = representative.life_stage,
      food_form = representative.food_form,
      flavor = representative.flavor,
      image_url = representative.front_image_url,
      source_url = representative.source_url,
      updated_at = now()
    FROM representative
    JOIN public.catalog_formulas formula
      ON formula.id = representative.linked_formula_id
    WHERE serving.cache_key = formula.promoted_cache_key
    RETURNING serving.id
  )
  SELECT count(*) INTO v_serving FROM changed;

  RETURN QUERY SELECT v_formulas, v_serving;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_retailer_web_formula_identity(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_retailer_web_formula_identity(UUID)
  TO service_role;
