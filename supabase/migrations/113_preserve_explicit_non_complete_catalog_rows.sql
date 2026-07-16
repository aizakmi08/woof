-- Preserve explicit non-complete-food exclusions after ingredient cleanup.
-- The trigger still rejects malformed/non-product payloads, but source-backed
-- treat/supplement diagnostics must not be flipped back into the ready catalog.

CREATE OR REPLACE FUNCTION public.enforce_product_data_ingredient_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  clean_ingredients TEXT[];
  clean_ingredient_count INT;
  clean_ingredient_text TEXT;
  nutrient_evidence TEXT;
  has_complete_food_ingredient_evidence BOOLEAN;
  explicit_exclusion_reason TEXT;
BEGIN
  NEW.product_name := COALESCE(public.clean_product_display_text(NEW.product_name), NEW.product_name);
  NEW.brand := public.clean_product_display_text(NEW.brand);
  explicit_exclusion_reason := NULLIF(btrim(COALESCE(NEW.catalog_exclusion_reason, '')), '');

  IF NEW.image_url ILIKE 'data:%' THEN
    NEW.image_url := NULL;
  END IF;

  IF public.is_likely_non_product_catalog_row(NEW.product_name, NEW.brand) THEN
    NEW.is_complete_food := FALSE;
    NEW.catalog_exclusion_reason := 'non_complete_food';
    RAISE EXCEPTION 'Invalid product_data non-product payload'
      USING ERRCODE = '22023';
  END IF;

  clean_ingredients := ARRAY(
    SELECT trim(ingredient.value)
    FROM unnest(COALESCE(NEW.ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
    WHERE public.is_plausible_product_ingredient(ingredient.value)
  );
  clean_ingredient_count := COALESCE(array_length(clean_ingredients, 1), 0);
  clean_ingredient_text := array_to_string(clean_ingredients, ', ');
  nutrient_evidence := COALESCE(NEW.nutrient_panel::TEXT, NEW.nutritional_info::TEXT, '');

  IF clean_ingredient_count < 5 THEN
    RAISE EXCEPTION 'Invalid product_data ingredient payload'
      USING ERRCODE = '22023';
  END IF;

  has_complete_food_ingredient_evidence :=
    clean_ingredient_count >= 20
    OR clean_ingredient_text ~* '\m(taurine|vitamin|zinc|ferrous|iron\s+sulfate|manganese|copper|potassium\s+iodide|calcium\s+iodate|choline\s+chloride|biotin|folic\s+acid|riboflavin|niacin|thiamine|pyridoxine|menadione)\M'
    OR (
      clean_ingredient_count >= 15
      AND nutrient_evidence ~* '\m(aafco|complete|balanced|formulated\s+to\s+meet|maintenance|growth)\M'
    );

  NEW.ingredients := clean_ingredients;
  NEW.ingredient_text := clean_ingredient_text;
  NEW.ingredient_count := clean_ingredient_count;

  IF NEW.is_complete_food IS FALSE OR explicit_exclusion_reason IS NOT NULL THEN
    NEW.is_complete_food := FALSE;
    NEW.catalog_exclusion_reason := COALESCE(explicit_exclusion_reason, 'not_complete_food');
  ELSE
    NEW.is_complete_food := TRUE;
    NEW.catalog_exclusion_reason := NULL;
  END IF;

  IF (
    NEW.ingredient_verification_status IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )
    OR NEW.source_quality IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified'
    )
  )
  AND NOT has_complete_food_ingredient_evidence THEN
    NEW.ingredient_verification_status := 'unverified';
    NEW.verified_at := NULL;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

UPDATE public.product_data
SET
  is_complete_food = FALSE,
  catalog_exclusion_reason = 'not_complete_food',
  updated_at = now()
WHERE source = 'wellness-pet-company'
  AND brand IN ('Old Mother Hubbard', 'WHIMZEES');

DO $$
BEGIN
  PERFORM public.refresh_catalog_acquisition_queue(30, 10000);
  PERFORM public.reconcile_catalog_acquisition_queue_batch(100);
END $$;
