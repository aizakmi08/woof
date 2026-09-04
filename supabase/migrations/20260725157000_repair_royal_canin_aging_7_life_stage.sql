-- Keep the serving row aligned with the exact canonical formula. The current
-- Royal Canin PDP explicitly says Aging 7+, so this product is senior rather
-- than unknown. Barcode resolution returns product_data fields.

DO $$
DECLARE
  v_formula_count INTEGER;
  v_serving_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_formula_count
  FROM public.catalog_formulas
  WHERE promoted_cache_key =
    'royal-canin-mars-petcare:312018:030111443144'
    AND active
    AND verification_status = 'verified'
    AND life_stage = 'senior'
    AND product_name =
      'Feline Urinary SO® Aging 7+ + Calm loaf in sauce';

  SELECT count(*)
  INTO v_serving_count
  FROM public.product_data
  WHERE cache_key =
    'royal-canin-mars-petcare:312018:030111443144'
    AND product_name =
      'Feline Urinary SO® Aging 7+ + Calm loaf in sauce'
    AND source_quality = 'manufacturer'
    AND public.catalog_quality_state(
      pet_type,
      is_complete_food,
      catalog_exclusion_reason,
      ingredient_text,
      COALESCE(array_length(ingredients, 1), 0),
      ingredient_verification_status,
      image_url,
      image_verification_status,
      source_url,
      expires_at
    ) = 'verified_ready';

  IF v_formula_count <> 1 OR v_serving_count <> 1 THEN
    RAISE EXCEPTION
      'Royal Canin Aging 7+ life-stage prerequisites failed: formula %, serving %',
      v_formula_count,
      v_serving_count;
  END IF;
END $$;

UPDATE public.product_data
SET
  life_stage = 'senior',
  updated_at = now()
WHERE cache_key =
  'royal-canin-mars-petcare:312018:030111443144';

DO $$
DECLARE
  v_barcode_count INTEGER;
BEGIN
  SELECT count(DISTINCT cache_key)
  INTO v_barcode_count
  FROM public.resolve_verified_product_by_gtin('030111443144', 8)
  WHERE cache_key =
      'royal-canin-mars-petcare:312018:030111443144'
    AND product_name =
      'Feline Urinary SO® Aging 7+ + Calm loaf in sauce'
    AND life_stage = 'senior';

  IF v_barcode_count <> 1 THEN
    RAISE EXCEPTION
      'Royal Canin Aging 7+ barcode did not preserve senior life stage: %',
      v_barcode_count;
  END IF;
END $$;
