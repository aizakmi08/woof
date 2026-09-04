DO $$
DECLARE
  v_formula_id BIGINT;
  v_ingredients TEXT := 'Turkey, Chicken, Turkey Broth, Water Sufficient For Processing, Sweet Potato, Tapioca Starch, Canola Oil (Preserved With Mixed Tocopherols), Dried Egg Product, Rice Flour, Tricalcium Phosphate, Salt, Natural Flavor, Inulin, Minerals (Zinc Oxide, Reduced Iron, Sodium Selenite, Manganese Sulfate, Copper Amino Acid Complex, Potassium Iodide), Sodium Tripolyphosphate, Vitamins (Vitamin E Supplement, Vitamin A Supplement, Niacin Supplement, D-Calcium Pantothenate, Thiamine Mononitrate, Beta-Carotene, Biotin, Vitamin D3 Supplement, Riboflavin Supplement, Vitamin B12 Supplement, Pyridoxine Hydrochloride, Folic Acid, Potassium Chloride, Magnesium Sulfate), Choline Chloride, Fish Oil, Celery Powder, Turmeric Powder, Ginger Powder, Coconut Oil.';
  v_source_url TEXT := 'https://www.healthextension.com/products/digestive-support-turkey-sweet-potato-entree';
  v_front_image TEXT := 'https://cdn.shopify.com/s/files/1/0085/8898/4416/files/1_fa4da632-73b3-493d-a207-8a06f20d9ca3.png?v=1702488434';
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'health extension|health extension|health extension digestive support turkey and sweet potato entree in gravy dog food|dog|unknown|wet||';

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key = 'health extension|health extension|digestive support|dog|all life stages|wet|turkey and sweet potato entree|'
      AND id <> v_formula_id
  ) THEN
    RAISE EXCEPTION 'Health Extension target formula identity already belongs to a sibling';
  END IF;

  UPDATE public.product_data
  SET
    product_name = 'Health Extension Digestive Support Turkey & Sweet Potato Entrée in Gravy Wet Dog Food',
    brand = 'Health Extension',
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    ingredient_text = v_ingredients,
    ingredient_count = cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    source = 'health-extension-manufacturer-manual',
    source_url = v_source_url,
    image_url = v_front_image,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = 'dog',
    source_quality = 'manufacturer',
    ingredient_verification_status = 'label_ocr_verified',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    gtin = '810120990057',
    product_line = 'Digestive Support',
    flavor = 'Turkey & Sweet Potato Entrée',
    life_stage = 'all life stages',
    food_form = 'wet',
    package_size = '9 oz case of 12',
    updated_at = now()
  WHERE cache_key = 'health-extension:810120990057';

  UPDATE public.catalog_formulas
  SET
    formula_key = 'health extension|health extension|digestive support|dog|all life stages|wet|turkey and sweet potato entree|',
    manufacturer = 'health extension',
    brand = 'health extension',
    product_name = 'Health Extension Digestive Support Turkey & Sweet Potato Entrée in Gravy Wet Dog Food',
    product_line = 'digestive support',
    pet_type = 'dog',
    life_stage = 'all life stages',
    food_form = 'wet',
    flavor = 'turkey and sweet potato entree',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence = 'Official package label: complete & balanced; AAFCO all life stages including growth of large size dogs.',
    ingredient_text = v_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    front_image_url = v_front_image,
    source_url = v_source_url,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'label_ocr_verified',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'health extension', 'digestive support', 'turkey', 'sweet potato',
      'entree', 'gravy', 'all life stages', 'dog', 'wet'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    promoted_cache_key = 'health-extension:810120990057',
    promoted_at = now(),
    updated_at = now()
  WHERE id = v_formula_id;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  )
  VALUES
    (
      v_formula_id, '810120990026', '9 oz', 1,
      'health-extension-manufacturer-manual', 'official-label:810120990026',
      v_source_url, true, now(), now(), now()
    ),
    (
      v_formula_id, '810120990057', '9 oz case of 12', 12,
      'health-extension-manufacturer-manual', 'shopify-variant:43991322394862',
      v_source_url, true, now(), now(), now()
    )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    package_count = excluded.package_count,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = now(),
    updated_at = now();

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key = 'health-extension:810120990057'
      AND catalog_exclusion_reason IS NULL
      AND ingredient_verification_status = 'label_ocr_verified'
      AND image_verification_status = 'manufacturer'
      AND life_stage = 'all life stages'
  ) <> 1 THEN
    RAISE EXCEPTION 'Health Extension serving row promotion failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND gtin IN ('810120990026', '810120990057')
  ) <> 2 THEN
    RAISE EXCEPTION 'Health Extension single-can and case GTIN preservation failed';
  END IF;
END
$$;
