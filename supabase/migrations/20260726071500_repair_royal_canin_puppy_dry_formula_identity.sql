-- Two PetSmart-derived Royal Canin puppy formulas were classified as "fresh"
-- even though the exact product titles, GTIN-linked official serving rows, and
-- official Royal Canin pages all identify dry food. Repair only those exact
-- identities so the authoritative GTIN rekey can proceed without weakening the
-- cross-food-form safety gate.

DO $$
DECLARE
  v_expected_formula_count INTEGER := 2;
  v_matched_formula_count INTEGER;
  v_official_evidence_count INTEGER;
  v_updated_formula_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_official_evidence_count
  FROM public.product_data p
  WHERE (
      p.cache_key = 'royal-canin-mars-petcare:1046456:030111447142'
      AND p.gtin = '030111447142'
      AND p.source_url =
        'https://www.royalcanin.com/us/dogs/products/retail-products/small-puppy-3000'
    )
    OR (
      p.cache_key = 'royal-canin-mars-petcare:210760:030111111098'
      AND p.gtin = '030111111098'
      AND p.source_url =
        'https://www.royalcanin.com/us/dogs/products/retail-products/french-bulldog-puppy-3990'
    );

  IF v_official_evidence_count <> v_expected_formula_count THEN
    RAISE EXCEPTION
      'Expected % exact Royal Canin official serving rows, found %',
      v_expected_formula_count,
      v_official_evidence_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data p
    WHERE p.cache_key IN (
        'royal-canin-mars-petcare:1046456:030111447142',
        'royal-canin-mars-petcare:210760:030111111098'
      )
      AND (
        lower(btrim(p.brand)) <> 'royal canin'
        OR lower(btrim(p.pet_type)) <> 'dog'
        OR lower(btrim(p.food_form)) <> 'dry'
        OR p.source_quality <> 'manufacturer'
        OR p.ingredient_verification_status <> 'manufacturer'
        OR p.image_verification_status <> 'manufacturer'
        OR p.is_complete_food IS NOT TRUE
        OR NULLIF(btrim(p.ingredient_text), '') IS NULL
        OR NULLIF(btrim(p.image_url), '') IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'Royal Canin official serving evidence failed the exact dry-food gate';
  END IF;

  SELECT count(*)
  INTO v_matched_formula_count
  FROM public.catalog_formulas f
  WHERE (
      f.id = 7513
      AND f.formula_key =
        'royal canin|royal canin|royal canin small puppy dry dog food size health nutrition|dog|puppy|fresh|chicken|'
      AND f.source_url =
        'https://www.petsmart.com/dog/food/dry-food/royal-canin-small-puppy-dry-dog-food-size-health-nutrition-2637.html'
    )
    OR (
      f.id = 7582
      AND f.formula_key =
        'royal canin|royal canin|royal canin breed health nutrition french bulldog puppy dry dog food|dog|puppy|fresh|chicken|'
      AND f.source_url =
        'https://www.petsmart.com/dog/food/dry-food/royal-canin-breed-health-nutrition-french-bulldog-puppy-dry-dog-food-47747.html'
    );

  IF v_matched_formula_count <> v_expected_formula_count THEN
    RAISE EXCEPTION
      'Expected % exact stale Royal Canin formulas, found %',
      v_expected_formula_count,
      v_matched_formula_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas f
    WHERE f.formula_key IN (
      'royal canin|royal canin|royal canin small puppy dry dog food size health nutrition|dog|puppy|dry|chicken|',
      'royal canin|royal canin|royal canin breed health nutrition french bulldog puppy dry dog food|dog|puppy|dry|chicken|'
    )
  ) THEN
    RAISE EXCEPTION
      'A corrected Royal Canin retailer formula identity already exists';
  END IF;

  UPDATE public.product_data
  SET
    food_form = 'dry',
    updated_at = NOW()
  WHERE cache_key IN (
    'petsmart-retail-catalog:030111447142',
    'petsmart-retail-catalog:030111111098'
  )
    AND lower(btrim(brand)) = 'royal canin'
    AND lower(btrim(pet_type)) = 'dog'
    AND lower(btrim(food_form)) = 'fresh';

  UPDATE public.catalog_observations
  SET food_form = 'dry'
  WHERE formula_id IN (7513, 7582)
    AND lower(btrim(food_form)) = 'fresh';

  UPDATE public.catalog_formulas f
  SET
    formula_key = CASE f.id
      WHEN 7513 THEN
        'royal canin|royal canin|royal canin small puppy dry dog food size health nutrition|dog|puppy|dry|chicken|'
      WHEN 7582 THEN
        'royal canin|royal canin|royal canin breed health nutrition french bulldog puppy dry dog food|dog|puppy|dry|chicken|'
    END,
    food_form = 'dry',
    identity_hash = encode(
      extensions.digest(
        CASE f.id
          WHEN 7513 THEN
            'royal canin|royal canin|royal canin small puppy dry dog food size health nutrition|dog|puppy|dry|chicken|'
          WHEN 7582 THEN
            'royal canin|royal canin|royal canin breed health nutrition french bulldog puppy dry dog food|dog|puppy|dry|chicken|'
        END,
        'sha256'
      ),
      'hex'
    ),
    updated_at = NOW()
  WHERE f.id IN (7513, 7582);

  GET DIAGNOSTICS v_updated_formula_count = ROW_COUNT;
  IF v_updated_formula_count <> v_expected_formula_count THEN
    RAISE EXCEPTION
      'Expected to repair % Royal Canin formulas, updated %',
      v_expected_formula_count,
      v_updated_formula_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas f
    JOIN public.catalog_skus sku ON sku.formula_id = f.id
    WHERE f.id = 7513
      AND f.food_form = 'dry'
      AND sku.gtin = '030111447142'
      AND sku.active
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas f
    JOIN public.catalog_skus sku ON sku.formula_id = f.id
    WHERE f.id = 7582
      AND f.food_form = 'dry'
      AND sku.gtin = '030111111098'
      AND sku.active
  ) THEN
    RAISE EXCEPTION
      'Royal Canin dry-food repair failed the exact active-GTIN postcondition';
  END IF;
END
$$;
