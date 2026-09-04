-- Promotion must update an already-serving verified product when the catalog
-- formula resolves to it. Otherwise the feed's duplicate guard may correctly
-- skip a second row while the formula still tries to reference a nonexistent
-- newly generated cache key.

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
  v_gtin TEXT;
  v_cache_key TEXT;
  v_payload JSONB;
BEGIN
  SELECT *
  INTO v_formula
  FROM public.catalog_formulas
  WHERE id = p_formula_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog formula % does not exist', p_formula_id;
  END IF;
  IF NOT v_formula.active OR v_formula.verification_status <> 'verified' THEN
    RAISE EXCEPTION 'Catalog formula % is not active and verified', p_formula_id;
  END IF;
  IF v_formula.pet_type NOT IN ('dog', 'cat')
     OR NOT v_formula.is_complete_food
     OR cardinality(v_formula.ingredients) < 5
     OR btrim(v_formula.ingredient_text) = ''
     OR btrim(v_formula.front_image_url) = ''
     OR btrim(v_formula.source_url) = ''
     OR v_formula.source_authority NOT IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
     OR v_formula.ingredient_verification_status NOT IN (
       'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
     )
     OR v_formula.image_verification_status NOT IN (
       'official', 'manufacturer', 'retailer_verified'
     ) THEN
    RAISE EXCEPTION 'Catalog formula % does not satisfy serving evidence requirements', p_formula_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_field_evidence evidence
    WHERE evidence.formula_id = p_formula_id
      AND evidence.accepted
      AND evidence.field_name = 'ingredient_text'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_field_evidence evidence
    WHERE evidence.formula_id = p_formula_id
      AND evidence.accepted
      AND evidence.field_name = 'front_image_url'
  ) THEN
    RAISE EXCEPTION 'Catalog formula % lacks accepted field-level evidence', p_formula_id;
  END IF;

  SELECT sku.gtin
  INTO v_gtin
  FROM public.catalog_skus sku
  WHERE sku.formula_id = p_formula_id
    AND sku.active
    AND sku.gtin IS NOT NULL
    AND sku.gtin <> ''
  ORDER BY sku.last_observed_at DESC, sku.id
  LIMIT 1;

  v_cache_key := v_formula.promoted_cache_key;
  IF v_cache_key IS NULL THEN
    SELECT existing.cache_key
    INTO v_cache_key
    FROM public.product_data existing
    WHERE lower(COALESCE(existing.brand, '')) = lower(v_formula.brand)
      AND (
        NULLIF(btrim(existing.pet_type), '') IS NULL
        OR lower(existing.pet_type) = lower(v_formula.pet_type)
      )
      AND (
        (
          NULLIF(btrim(v_gtin), '') IS NOT NULL
          AND existing.gtin = v_gtin
        )
        OR (
          existing.source_url = v_formula.source_url
          AND public.catalog_product_feed_identity_key(existing.brand, existing.product_name)
              = public.catalog_product_feed_identity_key(v_formula.brand, v_formula.product_name)
        )
      )
    ORDER BY
      CASE WHEN NULLIF(btrim(v_gtin), '') IS NOT NULL AND existing.gtin = v_gtin
        THEN 0 ELSE 1 END,
      CASE WHEN existing.is_complete_food IS TRUE
        AND COALESCE(existing.catalog_exclusion_reason, '') = ''
        THEN 0 ELSE 1 END,
      existing.updated_at DESC NULLS LAST,
      existing.cache_key
    LIMIT 1;
  END IF;

  v_cache_key := COALESCE(
    v_cache_key,
    'census:' || md5(v_formula.formula_key || ':' || COALESCE(v_gtin, ''))
  );
  v_payload := jsonb_build_array(jsonb_build_object(
    'cache_key', v_cache_key,
    'product_name', v_formula.product_name,
    'brand', v_formula.brand,
    'gtin', v_gtin,
    'product_line', v_formula.product_line,
    'flavor', v_formula.flavor,
    'life_stage', v_formula.life_stage,
    'food_form', v_formula.food_form,
    'package_size', COALESCE((
      SELECT sku.package_size
      FROM public.catalog_skus sku
      WHERE sku.formula_id = p_formula_id AND sku.active
      ORDER BY sku.last_observed_at DESC, sku.id
      LIMIT 1
    ), ''),
    'pet_type', v_formula.pet_type,
    'ingredients', to_jsonb(v_formula.ingredients),
    'ingredient_text', v_formula.ingredient_text,
    'source', 'independent-census',
    'source_quality', v_formula.source_authority,
    'ingredient_verification_status', v_formula.ingredient_verification_status,
    'image_verification_status', v_formula.image_verification_status,
    'verified_at', NOW(),
    'source_url', v_formula.source_url,
    'scraped_at', NOW(),
    'expires_at', NOW() + INTERVAL '90 days',
    'image_url', v_formula.front_image_url,
    'is_complete_food', TRUE,
    'catalog_exclusion_reason', NULL,
    'updated_at', NOW()
  ));

  RETURN QUERY
  SELECT imported.cache_key, imported.product_name, imported.brand, imported.source_url
  FROM public.upsert_catalog_product_feed(v_payload) imported;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data serving WHERE serving.cache_key = v_cache_key
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % did not create or update serving cache key %',
      p_formula_id,
      v_cache_key;
  END IF;

  UPDATE public.catalog_formulas
  SET promoted_cache_key = v_cache_key,
      promoted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_formula_id;
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
