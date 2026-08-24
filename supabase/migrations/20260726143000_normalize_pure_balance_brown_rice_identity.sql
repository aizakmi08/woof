-- Walmart's structured PDP encoded the visible space in "Brown Rice" as
-- `&nbsp;`. The first bounded label-evidence import preserved that markup in
-- the serving flavor and canonical formula key. Repair the exact formula in
-- place without changing its ingredients, image, GTIN, or formula/SKU
-- relationship. The extractor now decodes HTML entities before identity
-- normalization, so subsequent imports cannot reproduce this key.

DO $$
DECLARE
  v_cache_key CONSTANT TEXT := 'walmart-reviewed-label:593877490';
  v_gtin CONSTANT TEXT := '681131319300';
  v_old_formula_key CONSTANT TEXT :=
    'walmart stores inc|pure balance|pure balance wet food for dogs chicken vegetables and brown rice stew|dog|all life stages|wet|chicken vegetable brown and nbsp rice|';
  v_new_formula_key CONSTANT TEXT :=
    'walmart stores inc|pure balance|pure balance wet food for dogs chicken vegetables and brown rice stew|dog|all life stages|wet|chicken vegetable brown rice|';
  v_formula_id BIGINT;
BEGIN
  SELECT formula.id
  INTO v_formula_id
  FROM public.catalog_formulas formula
  JOIN public.catalog_skus sku
    ON sku.formula_id = formula.id
  WHERE sku.gtin = v_gtin
    AND formula.promoted_cache_key = v_cache_key
    AND formula.formula_key = v_old_formula_key
    AND formula.active
    AND sku.active;

  IF v_formula_id IS NULL THEN
    RAISE EXCEPTION 'Pure Balance Brown Rice exact formula/SKU identity is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.formula_key = v_new_formula_key
      AND formula.id <> v_formula_id
  ) THEN
    RAISE EXCEPTION 'Corrected Pure Balance Brown Rice formula key already belongs to another formula';
  END IF;

  UPDATE public.product_data
  SET flavor = 'Chicken, Vegetable, Brown Rice',
      updated_at = now()
  WHERE cache_key = v_cache_key
    AND gtin = v_gtin
    AND flavor = 'Chicken, Vegetable, Brown&nbsp;Rice';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pure Balance Brown Rice serving identity was not repaired';
  END IF;

  UPDATE public.catalog_formulas
  SET formula_key = v_new_formula_key,
      flavor = 'Chicken, Vegetable, Brown Rice',
      identity_hash =
        '389f7fccb1d7882c298ba54dd0d113d24bad295b465294767548373a7bacc213',
      updated_at = now()
  WHERE id = v_formula_id
    AND formula_key = v_old_formula_key
    AND flavor = 'Chicken, Vegetable, Brown&nbsp;Rice';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pure Balance Brown Rice canonical formula was not repaired';
  END IF;

  UPDATE public.catalog_observations
  SET flavor = 'Chicken, Vegetable, Brown Rice',
      content_hash =
        'f51e055dc5ad29ee5d01502326bfe36ffabd56db690531021576bbeb0c6d8cd7',
      raw_payload =
        jsonb_set(
          jsonb_set(
            raw_payload,
            '{canonical_formula_identity,flavor}',
            to_jsonb('chicken vegetable brown rice'::TEXT),
            TRUE
          ),
          '{html_entity_normalization}',
          jsonb_build_object(
            'original_flavor', 'Chicken, Vegetable, Brown&nbsp;Rice',
            'corrected_flavor', 'Chicken, Vegetable, Brown Rice',
            'reason', 'decoded_product_local_html_entity'
          ),
          TRUE
        )
  WHERE formula_id = v_formula_id
    AND source_external_id = v_cache_key
    AND flavor = 'Chicken, Vegetable, Brown&nbsp;Rice';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pure Balance Brown Rice canonical observation was not repaired';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data product
    WHERE product.cache_key = v_cache_key
      AND (
        product.flavor <> 'Chicken, Vegetable, Brown Rice'
        OR product.ingredient_text IS NULL
        OR product.image_url IS NULL
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.id = v_formula_id
      AND (
        formula.formula_key <> v_new_formula_key
        OR formula.flavor <> 'Chicken, Vegetable, Brown Rice'
        OR formula.promoted_cache_key <> v_cache_key
      )
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(v_gtin) resolved
    WHERE resolved.cache_key = v_cache_key
  ) THEN
    RAISE EXCEPTION 'Pure Balance Brown Rice post-repair safety gate failed';
  END IF;
END
$$;
