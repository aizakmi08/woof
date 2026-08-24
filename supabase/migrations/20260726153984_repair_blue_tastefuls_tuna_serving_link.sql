-- Repair a legacy verified Tastefuls Tuna formula that had an exact serving
-- row and SKU but no promoted_cache_key link.
DO $$
DECLARE
  v_formula_id BIGINT;
  v_cache_key TEXT;
BEGIN
  SELECT formula.id, serving.cache_key
  INTO STRICT v_formula_id, v_cache_key
  FROM public.catalog_formulas formula
  JOIN public.catalog_skus sku
    ON sku.formula_id = formula.id
   AND sku.active
   AND sku.gtin = '840243140657'
  JOIN public.product_data serving
    ON regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g') =
      sku.gtin
  WHERE formula.active
    AND formula.verification_status = 'verified'
    AND formula.promoted_cache_key IS NULL
    AND lower(btrim(formula.brand)) = lower(btrim(serving.brand))
    AND lower(btrim(formula.pet_type)) = lower(btrim(serving.pet_type))
    AND lower(btrim(formula.life_stage)) =
      lower(btrim(serving.life_stage))
    AND lower(btrim(formula.food_form)) =
      lower(btrim(serving.food_form))
    AND lower(btrim(formula.flavor)) = lower(btrim(serving.flavor))
    AND public.catalog_normalize_ingredient_evidence(
      formula.ingredient_text
    ) = public.catalog_normalize_ingredient_evidence(
      serving.ingredient_text
    );

  UPDATE public.catalog_formulas
  SET
    promoted_cache_key = v_cache_key,
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'serving_link_repaired_at', now(),
        'serving_link_repair_basis',
          'exact_gtin_identity_and_normalized_ingredient_equality'
      ),
    updated_at = now()
  WHERE id = v_formula_id
    AND promoted_cache_key IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tastefuls Tuna serving link repair failed';
  END IF;
END
$$;
