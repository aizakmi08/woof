-- Attach every reviewed current package GTIN to the exact Hill's formula.
-- The two retailer formula nodes below have ingredient-identical evidence and
-- are retained as aliases only.

DO $$
DECLARE
  v_cat_formula_id BIGINT;
  v_dog_formula_id BIGINT;
  v_dog_duplicate_id BIGINT;
  v_cat_key TEXT :=
    'hill s pet nutrition|hill s science diet|adult sensitive stomach and skin|cat|adult|dry|pollock meal and barley recipe|';
  v_dog_key TEXT :=
    'hill s pet nutrition|hill s science diet|adult stomach and skin|dog|adult|dry|salmon and brown rice recipe|';
  v_dog_duplicate_key TEXT :=
    'hill s science diet|hill s science diet|hill s science diet sensitive stomach and skin adult dry dog food salmon and brown rice|dog|adult|dry||';
  v_cat_source TEXT :=
    'https://www.hillspet.com/cat-food/science-diet-adult-sensitive-stomach-skin-pollock-barley-dry';
  v_dog_source TEXT :=
    'https://www.hillspet.com/dog-food/science-diet-canine-adult-sensitive-stomach-skin-salmon-dry';
BEGIN
  SELECT id
  INTO STRICT v_cat_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_cat_key
    AND promoted_cache_key = 'hill-s-pet-nutrition:052742059150';

  SELECT id
  INTO STRICT v_dog_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_dog_key
    AND promoted_cache_key = 'hill-s-pet-nutrition:052742086453';

  SELECT id
  INTO STRICT v_dog_duplicate_id
  FROM public.catalog_formulas
  WHERE formula_key = v_dog_duplicate_key;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas canonical
    JOIN public.catalog_formulas duplicate
      ON duplicate.id = v_dog_duplicate_id
    WHERE canonical.id = v_dog_formula_id
      AND canonical.pet_type = duplicate.pet_type
      AND canonical.life_stage = duplicate.life_stage
      AND canonical.food_form = duplicate.food_form
      AND cardinality(canonical.ingredients) = 42
      AND cardinality(duplicate.ingredients) = 42
      AND regexp_replace(
            lower(canonical.ingredient_text),
            '[^a-z0-9]+',
            '',
            'g'
          ) =
          regexp_replace(
            lower(duplicate.ingredient_text),
            '[^a-z0-9]+',
            '',
            'g'
          )
  ) THEN
    RAISE EXCEPTION
      'Hill''s Salmon & Brown Rice duplicate formula evidence is not exact';
  END IF;

  INSERT INTO public.catalog_skus (
    formula_id,
    gtin,
    package_size,
    package_count,
    source_slug,
    source_external_id,
    source_url,
    active,
    first_observed_at,
    last_observed_at,
    updated_at
  )
  SELECT
    v_cat_formula_id,
    serving.gtin,
    serving.package_size,
    1,
    'hill-s-pet-nutrition',
    serving.cache_key,
    v_cat_source,
    TRUE,
    COALESCE(serving.scraped_at, NOW()),
    NOW(),
    NOW()
  FROM public.product_data serving
  WHERE serving.cache_key = 'hill-s-pet-nutrition:052742059150'
    AND serving.gtin = '052742059150'
    AND serving.source_quality = 'manufacturer'
    AND serving.ingredient_verification_status = 'manufacturer'
    AND serving.image_verification_status = 'manufacturer'
    AND serving.is_complete_food
    AND serving.catalog_exclusion_reason IS NULL
  ON CONFLICT (
    source_slug,
    source_external_id,
    gtin,
    package_size
  ) DO UPDATE
  SET
    formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = NOW(),
    updated_at = NOW();

  -- The PetSmart copy is token-identical but punctuation-different. Demote it
  -- before reparenting its GTIN so the strict ingredient-version trigger sees
  -- only the exact current manufacturer statement as trusted evidence.
  UPDATE public.product_data
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'duplicate_alias_of_verified_formula',
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  WHERE cache_key = 'petsmart-retail-catalog:052742086453';

  UPDATE public.catalog_skus
  SET
    formula_id = v_dog_formula_id,
    updated_at = NOW()
  WHERE formula_id = v_dog_duplicate_id
    AND gtin = '052742086453';

  UPDATE public.catalog_observations
  SET
    formula_id = v_dog_formula_id,
    manufacturer = 'hill s pet nutrition',
    brand = 'hill s science diet',
    product_name =
      'Hill''s Science Diet Adult Sensitive Stomach & Skin Salmon & Brown Rice Recipe Dry Dog Food',
    product_line = 'adult sensitive stomach and skin',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'salmon and brown rice recipe',
    diet_condition = '',
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[]
  WHERE formula_id = v_dog_duplicate_id
    AND gtin = '052742086453';

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key,
    formula_id,
    identity_hash,
    match_reason,
    source_url,
    metadata,
    updated_at
  )
  VALUES (
    v_dog_duplicate_key,
    v_dog_formula_id,
    encode(digest(v_dog_key, 'sha256'), 'hex'),
    'manual_review',
    v_dog_source,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'species_boundary', 'dog',
      'life_stage_boundary', 'adult',
      'food_form_boundary', 'dry',
      'recipe_boundary', 'salmon and brown rice recipe',
      'ingredient_hash_equality_verified', TRUE,
      'package_sizes_are_sku_children', TRUE,
      'reviewed_at', '2026-07-26'
    ),
    NOW()
  )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET
    formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = FALSE,
    absent_since = COALESCE(absent_since, NOW()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Ingredient-identical PetSmart title alias. Exact current Hill''s formula and all reviewed package GTINs are represented by the canonical manufacturer formula.',
    updated_at = NOW()
  WHERE id = v_dog_duplicate_id;

  UPDATE public.product_data
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'duplicate_alias_of_verified_formula',
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  WHERE cache_key = 'petsmart-retail-catalog:052742086453';

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = v_cat_formula_id
      AND active
      AND gtin IN ('052742059150', '052742059167')
    GROUP BY formula_id
    HAVING count(DISTINCT gtin) = 2
  ) THEN
    RAISE EXCEPTION
      'Hill''s Pollock & Barley current GTIN inventory is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = v_dog_formula_id
      AND active
      AND gtin IN ('052742086453', '052742088532')
    GROUP BY formula_id
    HAVING count(DISTINCT gtin) = 2
  ) THEN
    RAISE EXCEPTION
      'Hill''s Salmon & Brown Rice current GTIN inventory is incomplete';
  END IF;
END;
$$;
