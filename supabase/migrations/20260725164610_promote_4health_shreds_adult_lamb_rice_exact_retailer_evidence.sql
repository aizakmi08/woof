DO $$
DECLARE
  v_formula_id BIGINT;
  v_key TEXT := 'tractor supply company|4health|shreds|dog|adult|dry|lamb and rice|';
  v_source TEXT := 'https://www.tractorsupply.com/tsc/product/4health-shreds-adult-lamb-and-rice-formula-dry-dog-food-35-lb-bag-2457731';
  v_front TEXT := 'https://media.tractorsupply.com/is/image/TractorSupplyCompany/2457731?fmt=png&wid=1500&hei=1500';
  v_ingredients TEXT := 'Lamb, lamb meal (source of chondroitin sulfate and glucosamine), brown rice, oatmeal, pearled barley, white rice, chicken fat (preserved with mixed tocopherols), millet, soy flour, dried yeast, egg product, dried plain beet pulp, natural flavor, vegetable glycerin, flaxseed, ocean fish meal, salt, potassium chloride, minerals zinc amino acid complex, zinc sulfate, iron proteinate, ferrous sulfate, copper proteinate, copper sulfate, manganese proteinate, manganese sulfate, calcium iodate, sodium selenite, vitamins vitamin E supplement, vitamin B3 (niacin), vitamin A supplement, vitamin B12 supplement, vitamin B1(thiamine mononitrate), vitamin B5 (d-calcium pantothenate), vitamin B7 (biotin), vitamin B6 (pyridoxine hydrochloride), vitamin B2 (riboflavin supplement), vitamin D3 supplement, vitamin B9 (folic acid), choline chloride, DL-Methionine, inulin, taurine, calcium carbonate, dried cultured whey, dried Bacillus coagulans fermentation product, yucca schidigera extract, citric acid (a preservative), rosemary extract.';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    JOIN public.catalog_formulas f ON f.id = sku.formula_id
    WHERE ltrim(regexp_replace(coalesce(sku.gtin, ''), '[^0-9]', '', 'g'), '0')
      IN ('749394379469', '749394379483')
      AND f.formula_key <> v_key
  ) THEN
    RAISE EXCEPTION '4health package GTIN already belongs to another formula';
  END IF;

  UPDATE public.product_data
  SET
    product_name = '4health Shreds Adult Lamb and Rice Formula Dry Dog Food',
    brand = '4health',
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    ingredient_text = v_ingredients,
    ingredient_count = cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    source = 'tractor-supply-private-label-manual',
    source_url = v_source,
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    image_url = v_front,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = 'dog',
    source_quality = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    verified_at = now(),
    gtin = '749394379469',
    product_line = 'Shreds',
    flavor = 'Lamb and Rice',
    life_stage = 'adult',
    food_form = 'dry',
    package_size = '35 lb',
    updated_at = now()
  WHERE cache_key = '4health 4health shreds lamb rice';

  IF NOT FOUND THEN
    RAISE EXCEPTION '4health target serving row missing';
  END IF;

  INSERT INTO public.catalog_formulas (
    formula_key, manufacturer, brand, product_name, product_line, pet_type,
    life_stage, food_form, flavor, diet_condition, is_complete_food,
    complete_food_evidence, ingredient_text, ingredients, front_image_url,
    source_url, source_authority, ingredient_verification_status,
    image_verification_status, protected_terms, verification_status, active,
    is_popular_brand, first_observed_at, last_observed_at, promoted_cache_key,
    promoted_at, identity_hash, created_at, updated_at
  ) VALUES (
    v_key, 'tractor supply company', '4health',
    '4health Shreds Adult Lamb and Rice Formula Dry Dog Food', 'shreds',
    'dog', 'adult', 'dry', 'lamb and rice', '', true,
    'Exact Tractor Supply private-label PDP and package label: formulated to meet AAFCO Dog Food Nutrient Profiles for maintenance.',
    v_ingredients, public.catalog_split_ingredient_statement(v_ingredients),
    v_front, v_source, 'retailer_verified', 'retailer_verified',
    'retailer_verified',
    ARRAY['4health','shreds','adult','lamb','rice','dog','dry','maintenance']::TEXT[],
    'verified', true, false, now(), now(),
    '4health 4health shreds lamb rice', now(),
    encode(digest(v_key, 'sha256'), 'hex'), now(), now()
  )
  ON CONFLICT (formula_key) DO UPDATE SET
    manufacturer = excluded.manufacturer,
    brand = excluded.brand,
    product_name = excluded.product_name,
    product_line = excluded.product_line,
    pet_type = excluded.pet_type,
    life_stage = excluded.life_stage,
    food_form = excluded.food_form,
    flavor = excluded.flavor,
    diet_condition = excluded.diet_condition,
    is_complete_food = excluded.is_complete_food,
    complete_food_evidence = excluded.complete_food_evidence,
    ingredient_text = excluded.ingredient_text,
    ingredients = excluded.ingredients,
    front_image_url = excluded.front_image_url,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    ingredient_verification_status = excluded.ingredient_verification_status,
    image_verification_status = excluded.image_verification_status,
    protected_terms = excluded.protected_terms,
    verification_status = 'verified',
    active = true,
    promoted_cache_key = excluded.promoted_cache_key,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  RETURNING id INTO v_formula_id;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (
      v_formula_id, '749394379469', '35 lb', 1,
      'tractor-supply-private-label-manual', 'item:2457731', v_source,
      true, now(), now(), now()
    ),
    (
      v_formula_id, '749394379483', '5 lb', 1,
      'tractor-supply-private-label-manual', 'item:2457734',
      'https://www.tractorsupply.com/tsc/product/4health-shreds-adult-lamb-and-rice-formula-dry-dog-food-5-lb-bag-2457734',
      true, now(), now(), now()
    )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = now(),
    updated_at = now();

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND gtin IN ('749394379469', '749394379483')
  ) <> 2 THEN
    RAISE EXCEPTION '4health verified SKU preservation failed';
  END IF;
END
$$;
