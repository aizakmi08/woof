-- Serving rows may retain display punctuation, a leading brand in product_line,
-- or NULL where the census stores explicit "unknown". Normalize those harmless
-- differences while retaining exact name, ingredient, image, pet, and form gates.

CREATE OR REPLACE FUNCTION public.promote_catalog_formula_without_completed_run_gate(
  p_formula_id BIGINT
)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  source_url TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_formula public.catalog_formulas%ROWTYPE;
  v_existing_cache_key TEXT;
BEGIN
  SELECT *
  INTO v_formula
  FROM public.catalog_formulas
  WHERE id = p_formula_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog formula % does not exist', p_formula_id;
  END IF;

  IF v_formula.promoted_cache_key IS NULL THEN
    SELECT existing.cache_key
    INTO v_existing_cache_key
    FROM public.product_data existing
    WHERE lower(btrim(COALESCE(existing.brand, '')))
            = lower(btrim(COALESCE(v_formula.brand, '')))
      AND lower(btrim(COALESCE(existing.pet_type, '')))
            = lower(btrim(COALESCE(v_formula.pet_type, '')))
      AND public.catalog_product_feed_identity_key(existing.brand, existing.product_name)
            = public.catalog_product_feed_identity_key(v_formula.brand, v_formula.product_name)
      AND public.catalog_product_feed_identity_key(existing.brand, COALESCE(existing.product_line, ''))
            = public.catalog_product_feed_identity_key(v_formula.brand, COALESCE(v_formula.product_line, ''))
      AND public.catalog_product_feed_identity_key('', COALESCE(existing.flavor, ''))
            = public.catalog_product_feed_identity_key('', COALESCE(v_formula.flavor, ''))
      AND lower(btrim(COALESCE(NULLIF(existing.life_stage, ''), 'unknown')))
            = lower(btrim(COALESCE(NULLIF(v_formula.life_stage, ''), 'unknown')))
      AND lower(btrim(COALESCE(existing.food_form, '')))
            = lower(btrim(COALESCE(v_formula.food_form, '')))
      AND regexp_replace(lower(COALESCE(existing.ingredient_text, '')), '[^a-z0-9]+', '', 'g')
            = regexp_replace(lower(COALESCE(v_formula.ingredient_text, '')), '[^a-z0-9]+', '', 'g')
      AND btrim(COALESCE(existing.image_url, ''))
            = btrim(COALESCE(v_formula.front_image_url, ''))
      AND existing.is_complete_food IS TRUE
      AND COALESCE(existing.catalog_exclusion_reason, '') = ''
    ORDER BY existing.updated_at DESC NULLS LAST, existing.cache_key
    LIMIT 1;

    IF v_existing_cache_key IS NOT NULL THEN
      UPDATE public.catalog_formulas
      SET promoted_cache_key = v_existing_cache_key,
          updated_at = NOW()
      WHERE id = p_formula_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT promoted.cache_key, promoted.product_name, promoted.brand, promoted.source_url
  FROM public.promote_catalog_formula_without_exact_evidence_reuse(p_formula_id) promoted;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_catalog_formula_without_completed_run_gate(BIGINT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_catalog_formula_without_completed_run_gate(BIGINT)
  FROM anon;
REVOKE ALL ON FUNCTION public.promote_catalog_formula_without_completed_run_gate(BIGINT)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.promote_catalog_formula_without_completed_run_gate(BIGINT)
  FROM service_role;
