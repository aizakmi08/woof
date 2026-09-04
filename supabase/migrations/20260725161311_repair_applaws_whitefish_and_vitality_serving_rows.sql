DO $$
DECLARE
  whitefish_ingredients TEXT := 'Whitefish, Whitefish Meal, Peas, Lentils, Chicken Fat (Preserved with Mixed Tocopherols), Chickpeas, Natural Flavor, Flaxseed (Source of Omega-3 Fatty Acids), Potassium Chloride, Taurine, Salt, Vitamins (Vitamin E Supplement, Niacin Supplement, Thiamine Mononitrate, Vitamin A Supplement, Pyridoxine Hydrochloride, Calcium Pantothenate, Riboflavin Supplement, Biotin Supplement, Vitamin B12 Supplement, Vitamin D3, Folic Acid), Minerals (Zinc Proteinate, Iron Proteinate, Copper Proteinate, Manganese Proteinate, Sodium Selenite, Calcium Iodate), Choline Chloride, Rosemary Extract.';
  vitality_ingredients TEXT := 'Turkey, Turkey Meal, Lentils, Peas, Chicken Meal, Chicken Fat (Preserved with Mixed Tocopherols), Cod, Natural Flavor, Miscanthus Grass, Flaxseed, Salmon Oil, Calcium Carbonate, Yeast Culture, Vitamins (Vitamin E Supplement, Vitamin B3 (Niacin Supplement), Vitamin B1 (Thiamine Mononitrate), Vitamin A Supplement, Vitamin B6 (Pyridoxine Hydrochloride), Vitamin B5 (Calcium Pantothenate), Vitamin B2 (Riboflavin Supplement), Vitamin B7 (Biotin Supplement), Vitamin B12 Supplement, Vitamin D3, Vitamin B9 (Folic Acid)), Taurine, Inulin, Choline (Choline Chloride), Minerals (Zinc Proteinate, Iron Proteinate, Potassium Chloride, Copper Proteinate, Manganese Proteinate, Sodium Selenite, Calcium Iodate), Salt, Mixed Tocopherols, Rosemary Extract.';
BEGIN
  UPDATE public.product_data
  SET
    product_name = 'Adult Dry Food Whitefish Recipe',
    brand = 'Applaws',
    ingredients = public.catalog_split_ingredient_statement(whitefish_ingredients),
    ingredient_text = whitefish_ingredients,
    ingredient_count = cardinality(public.catalog_split_ingredient_statement(whitefish_ingredients)),
    source = 'applaws-manufacturer-manual',
    source_url = 'https://applaws.com/us/products/natural-grain-free-adult-dry-cat-food-whitefish-recipe-4lb-bag/',
    image_url = 'https://applaws.com/us/wp-content/uploads/sites/2/2024/05/4703US-A_FOP_3000px.png',
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    pet_type = 'cat',
    product_line = 'Adult Dry Food',
    flavor = 'Whitefish',
    life_stage = 'Adult',
    food_form = 'Dry',
    package_size = '4 Lb',
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    updated_at = now()
  WHERE cache_key = 'petsmart-retail-catalog:886817005267';

  UPDATE public.product_data
  SET
    product_name = 'Vitality Indoor Complete & Balanced Adult Dry Food Turkey and Cod Recipe',
    brand = 'Applaws',
    ingredients = public.catalog_split_ingredient_statement(vitality_ingredients),
    ingredient_text = vitality_ingredients,
    ingredient_count = cardinality(public.catalog_split_ingredient_statement(vitality_ingredients)),
    source = 'applaws-manufacturer-manual',
    source_url = 'https://applaws.com/us/products/vitality-indoor-complete-balanced-adult-dry-food-turkey-and-cod-recipe-3/',
    image_url = 'https://applaws.com/us/wp-content/uploads/sites/2/2026/02/4050US-A-Product-Image.png',
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    pet_type = 'cat',
    product_line = 'Vitality Indoor',
    flavor = 'Turkey and Cod',
    life_stage = 'Adult',
    food_form = 'Dry',
    package_size = '5 Lb',
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    updated_at = now()
  WHERE cache_key = 'petsmart-retail-catalog:886817014375';

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key IN (
      'petsmart-retail-catalog:886817005267',
      'petsmart-retail-catalog:886817014375'
    )
      AND catalog_exclusion_reason IS NULL
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
  ) <> 2 THEN
    RAISE EXCEPTION 'Applaws serving-row repair failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'petsmart-retail-catalog:886817005267'
      AND ingredient_text ~* '\mVtamin\M'
  ) THEN
    RAISE EXCEPTION 'Applaws Whitefish OCR artifact remains';
  END IF;
END
$$;
