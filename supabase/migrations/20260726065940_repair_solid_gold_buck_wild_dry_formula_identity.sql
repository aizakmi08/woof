-- The exact official Solid Gold package and serving row identify this as a
-- dry adult dog formula. Repair the stale canonical "fresh" classification
-- before the current official inventory is linked.

DO $$
DECLARE
  v_old_formula_id BIGINT;
  v_target_formula_id BIGINT;
  v_serving_evidence_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_serving_evidence_count
  FROM public.product_data p
  WHERE p.cache_key = 'solid-gold:093766002869'
    AND p.gtin = '093766002869'
    AND lower(btrim(p.brand)) = 'solid gold'
    AND lower(btrim(p.pet_type)) = 'dog'
    AND lower(btrim(p.food_form)) = 'dry'
    AND lower(btrim(p.flavor)) = 'venison'
    AND p.source = 'solid-gold'
    AND p.source_quality = 'manufacturer'
    AND p.ingredient_verification_status = 'label_ocr_verified'
    AND p.image_verification_status = 'manufacturer'
    AND p.is_complete_food IS TRUE
    AND COALESCE(p.catalog_exclusion_reason, '') = ''
    AND NULLIF(btrim(p.ingredient_text), '') IS NOT NULL
    AND NULLIF(btrim(p.image_url), '') IS NOT NULL;

  IF v_serving_evidence_count <> 1 THEN
    RAISE EXCEPTION
      'Buck Wild exact official serving evidence missing or ambiguous: % rows',
      v_serving_evidence_count;
  END IF;

  SELECT id
  INTO v_target_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'solid gold pet|solid gold|nutrientboost buck wild sensitive stomach dry food for adult dogs|dog|adult|dry|venison|';

  IF v_target_formula_id IS NULL THEN
    SELECT DISTINCT f.id
    INTO v_old_formula_id
    FROM public.catalog_skus sku
    JOIN public.catalog_formulas f ON f.id = sku.formula_id
    WHERE sku.gtin = '093766002869'
      AND sku.active
      AND f.formula_key =
        'solid gold|solid gold|solid gold nutrient boost buck wild adult dog food sensitive stomach venison|dog|adult|fresh|venison|'
      AND lower(btrim(f.brand)) = 'solid gold'
      AND lower(btrim(f.pet_type)) = 'dog'
      AND lower(btrim(f.food_form)) = 'fresh';

    IF v_old_formula_id IS NULL THEN
      RAISE EXCEPTION 'Expected stale Buck Wild fresh formula was not found';
    END IF;

    UPDATE public.catalog_formulas
    SET
      formula_key =
        'solid gold pet|solid gold|nutrientboost buck wild sensitive stomach dry food for adult dogs|dog|adult|dry|venison|',
      manufacturer = 'Solid Gold Pet',
      product_name = 'Nutrientboost Buck Wild Sensitive Stomach Dry Food for Adult Dogs',
      product_line = 'Dry Food',
      life_stage = 'adult',
      food_form = 'dry',
      flavor = 'Venison',
      source_url =
        'https://solidgoldpet.com/products/buck-wild-dry-dog-food-nutrientboost?variant=42197873197265',
      source_authority = 'manufacturer',
      identity_hash =
        '37518e2951b9643810e0a145234d33433ab8f7345c0892d578608e2cb60a71bf',
      active = TRUE,
      absent_since = NULL,
      updated_at = NOW()
    WHERE id = v_old_formula_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas f
    JOIN public.catalog_skus sku ON sku.formula_id = f.id
    WHERE f.formula_key =
      'solid gold pet|solid gold|nutrientboost buck wild sensitive stomach dry food for adult dogs|dog|adult|dry|venison|'
      AND f.food_form = 'dry'
      AND f.pet_type = 'dog'
      AND f.active
      AND sku.gtin = '093766002869'
      AND sku.active
  ) THEN
    RAISE EXCEPTION 'Buck Wild canonical dry formula repair did not satisfy the exact GTIN gate';
  END IF;
END
$$;
