-- Do not let short, likely-truncated ingredient statements count as verified
-- complete-food catalog evidence. The client/importer also rejects these rows,
-- but this trigger guard protects live imports from stale SQL chunks.

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
BEGIN
  NEW.product_name := COALESCE(public.clean_product_display_text(NEW.product_name), NEW.product_name);
  NEW.brand := public.clean_product_display_text(NEW.brand);

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
  NEW.is_complete_food := TRUE;
  NEW.catalog_exclusion_reason := NULL;

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
  ingredient_verification_status = 'unverified',
  verified_at = NULL,
  updated_at = NOW()
WHERE is_complete_food = TRUE
  AND catalog_exclusion_reason IS NULL
  AND (
    ingredient_verification_status IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )
    OR source_quality IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified'
    )
  )
  AND ingredient_count < 20
  AND COALESCE(ingredient_text, '') !~* '\m(taurine|vitamin|zinc|ferrous|iron\s+sulfate|manganese|copper|potassium\s+iodide|calcium\s+iodate|choline\s+chloride|biotin|folic\s+acid|riboflavin|niacin|thiamine|pyridoxine|menadione)\M'
  AND NOT (
    ingredient_count >= 15
    AND COALESCE(nutrient_panel::TEXT, nutritional_info::TEXT, '') ~* '\m(aafco|complete|balanced|formulated\s+to\s+meet|maintenance|growth)\M'
  );
