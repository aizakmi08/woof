-- Repair the verified PetSmart Tastefuls Fish & Shrimp formula that already
-- owns the exact Target UPC and normalized ingredient version but never
-- received a serving-table link.
DO $$
DECLARE
  v_formula_id BIGINT;
  v_promoted_cache_key TEXT;
BEGIN
  SELECT formula.id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas formula
  JOIN public.catalog_skus sku
    ON sku.formula_id = formula.id
   AND sku.active
   AND sku.gtin = '840243140664'
  JOIN public.catalog_observations target_observation
    ON target_observation.gtin = sku.gtin
  JOIN public.catalog_source_runs target_run
    ON target_run.id = target_observation.run_id
   AND target_run.run_key =
      'target-blue-buffalo-review-v157:f5337a2d2943d8aec40d6203'
  WHERE formula.active
    AND formula.verification_status = 'verified'
    AND formula.promoted_cache_key IS NULL
    AND formula.source_url =
      'https://www.petsmart.com/cat/food-and-treats/canned-food/'
      || 'blue-buffalo-tastefuls-adult-cat-wet-food-natural-flaked-'
      || '3-oz-63247.html'
    AND target_observation.source_external_id = '80778971'
    AND lower(btrim(formula.brand)) =
      lower(btrim(target_observation.brand))
    AND lower(btrim(formula.pet_type)) =
      lower(btrim(target_observation.pet_type))
    AND lower(btrim(formula.life_stage)) =
      lower(btrim(target_observation.life_stage))
    AND lower(btrim(formula.food_form)) =
      lower(btrim(target_observation.food_form))
    AND public.catalog_normalize_ingredient_evidence(
      formula.ingredient_text
    ) = public.catalog_normalize_ingredient_evidence(
      target_observation.ingredient_text
    );

  SELECT promoted.cache_key
  INTO STRICT v_promoted_cache_key
  FROM public.promote_catalog_formula(v_formula_id) promoted;

  IF NULLIF(btrim(v_promoted_cache_key), '') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.catalog_formulas formula
      JOIN public.product_data serving
        ON serving.cache_key = formula.promoted_cache_key
      WHERE formula.id = v_formula_id
        AND serving.cache_key = v_promoted_cache_key
        AND public.catalog_normalize_ingredient_evidence(
          serving.ingredient_text
        ) = public.catalog_normalize_ingredient_evidence(
          formula.ingredient_text
        )
    )
  THEN
    RAISE EXCEPTION
      'Tastefuls Fish & Shrimp exact serving-link repair failed';
  END IF;
END
$$;
