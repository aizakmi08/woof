-- Reconcile two exact current Hill's Science Diet formulas against their
-- official manufacturer evidence. Package sizes and GTINs remain SKU children;
-- retailer title differences are aliases, not new formulas.

DO $$
DECLARE
  v_cat_formula_id BIGINT;
  v_dog_formula_id BIGINT;
  v_cat_old_key TEXT :=
    'hill s science diet|hill s science diet|adult sensitive stomach and skin pollock meal and barley recipe|cat|adult|dry||';
  v_cat_key TEXT :=
    'hill s pet nutrition|hill s science diet|adult sensitive stomach and skin|cat|adult|dry|pollock meal and barley recipe|';
  v_dog_key TEXT :=
    'hill s pet nutrition|hill s science diet|adult stomach and skin|dog|adult|dry|salmon and brown rice recipe|';
  v_cat_cache TEXT := 'hill-s-pet-nutrition:052742059150';
  v_dog_cache TEXT := 'hill-s-pet-nutrition:052742086453';
  v_cat_source TEXT :=
    'https://www.hillspet.com/cat-food/science-diet-adult-sensitive-stomach-skin-pollock-barley-dry';
  v_dog_source TEXT :=
    'https://www.hillspet.com/dog-food/science-diet-canine-adult-sensitive-stomach-skin-salmon-dry';
  v_top_cache_key TEXT;
  v_gtin TEXT;
BEGIN
  SELECT id
  INTO STRICT v_cat_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_cat_old_key
    AND source_url = v_cat_source
    AND cardinality(ingredients) = 42;

  SELECT id
  INTO STRICT v_dog_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_dog_key
    AND source_url = v_dog_source
    AND cardinality(ingredients) = 42;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data serving
    JOIN public.catalog_formulas formula
      ON formula.id = v_cat_formula_id
    WHERE serving.cache_key = v_cat_cache
      AND serving.gtin = '052742059150'
      AND serving.source_url = v_cat_source
      AND serving.source_quality = 'manufacturer'
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.is_complete_food
      AND serving.catalog_exclusion_reason IS NULL
      AND serving.pet_type = 'cat'
      AND serving.life_stage = 'adult'
      AND cardinality(serving.ingredients) = 42
      AND regexp_replace(
            lower(serving.ingredient_text),
            '[^a-z0-9]+',
            '',
            'g'
          ) =
          regexp_replace(
            lower(formula.ingredient_text),
            '[^a-z0-9]+',
            '',
            'g'
          )
  ) THEN
    RAISE EXCEPTION
      'Hill''s Pollock & Barley exact official serving evidence changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data serving
    JOIN public.catalog_formulas formula
      ON formula.id = v_dog_formula_id
    WHERE serving.cache_key = v_dog_cache
      AND serving.gtin = '052742086453'
      AND serving.source_url = v_dog_source
      AND serving.source_quality = 'manufacturer'
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.is_complete_food
      AND serving.catalog_exclusion_reason IS NULL
      AND serving.pet_type = 'dog'
      AND serving.life_stage = 'adult'
      AND cardinality(serving.ingredients) = 42
      AND regexp_replace(
            lower(serving.ingredient_text),
            '[^a-z0-9]+',
            '',
            'g'
          ) =
          regexp_replace(
            lower(formula.ingredient_text),
            '[^a-z0-9]+',
            '',
            'g'
          )
  ) THEN
    RAISE EXCEPTION
      'Hill''s Salmon & Brown Rice exact official serving evidence changed';
  END IF;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key,
    formula_id,
    identity_hash,
    match_reason,
    source_url,
    metadata,
    updated_at
  )
  SELECT
    alias_formula_key,
    target.formula_id,
    target.identity_hash,
    'manual_review',
    target.source_url,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'species_boundary', target.pet_type,
      'life_stage_boundary', 'adult',
      'food_form_boundary', 'dry',
      'recipe_boundary', target.recipe,
      'package_sizes_are_sku_children', TRUE,
      'reviewed_at', '2026-07-26'
    ),
    NOW()
  FROM (
    VALUES
      (
        v_cat_old_key,
        v_cat_formula_id,
        encode(digest(v_cat_key, 'sha256'), 'hex'),
        v_cat_source,
        'cat',
        'pollock meal and barley recipe'
      ),
      (
        'hill s science diet|hill s science diet|hill s science diet sensitive stomach and sensitive skin pollock meal and barley recipe adult dry cat food|cat|adult|dry||',
        v_cat_formula_id,
        encode(digest(v_cat_key, 'sha256'), 'hex'),
        v_cat_source,
        'cat',
        'pollock meal and barley recipe'
      ),
      (
        'hill s science diet|hill s science diet|hill s science diet adult sensitive stomach and skin salmon and brown rice recipe dry dog food|dog|adult|dry||',
        v_dog_formula_id,
        encode(digest(v_dog_key, 'sha256'), 'hex'),
        v_dog_source,
        'dog',
        'salmon and brown rice recipe'
      ),
      (
        'hill s science diet|hill s science diet|hill s science diet sensitive stomach and sensitive skin salmon and brown rice recipe adult dry dog food|dog|adult|dry||',
        v_dog_formula_id,
        encode(digest(v_dog_key, 'sha256'), 'hex'),
        v_dog_source,
        'dog',
        'salmon and brown rice recipe'
      )
  ) target(
    alias_formula_key,
    formula_id,
    identity_hash,
    source_url,
    pet_type,
    recipe
  )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET
    formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

  UPDATE public.product_data
  SET
    product_name =
      'Hill''s Science Diet Adult Sensitive Stomach & Skin Pollock Meal & Barley Recipe Dry Cat Food',
    brand = 'Hill''s Science Diet',
    product_line = 'Adult Sensitive Stomach & Skin',
    flavor = 'Pollock Meal & Barley Recipe',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    is_complete_food = TRUE,
    catalog_exclusion_reason = NULL,
    updated_at = NOW()
  WHERE cache_key = v_cat_cache;

  UPDATE public.product_data
  SET
    product_name =
      'Hill''s Science Diet Adult Sensitive Stomach & Skin Salmon & Brown Rice Recipe Dry Dog Food',
    brand = 'Hill''s Science Diet',
    product_line = 'Adult Sensitive Stomach & Skin',
    flavor = 'Salmon & Brown Rice Recipe',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    is_complete_food = TRUE,
    catalog_exclusion_reason = NULL,
    updated_at = NOW()
  WHERE cache_key = v_dog_cache;

  UPDATE public.product_data
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'duplicate_alias_of_verified_formula',
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  WHERE cache_key IN (
    'petsmart-retail-catalog:052742059167',
    'census:e750b01f21752293a1978a89b37dc402'
  );

  UPDATE public.catalog_formulas formula
  SET
    formula_key = v_cat_key,
    identity_hash = encode(digest(v_cat_key, 'sha256'), 'hex'),
    manufacturer = 'hill s pet nutrition',
    brand = 'hill s science diet',
    product_name =
      'Hill''s Science Diet Adult Sensitive Stomach & Skin Pollock Meal & Barley Recipe Dry Cat Food',
    product_line = 'adult sensitive stomach and skin',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'pollock meal and barley recipe',
    diet_condition = '',
    is_complete_food = TRUE,
    complete_food_evidence =
      'Current official Hill''s US PDP publishes the exact ingredients and states that AAFCO feeding tests substantiate complete and balanced nutrition for maintenance of adult cats.',
    front_image_url = serving.image_url,
    source_url = v_cat_source,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'Hill''s Science Diet',
      'Sensitive Stomach & Skin',
      'Pollock Meal',
      'Barley',
      'Adult',
      'Cat',
      'Dry'
    ]::TEXT[],
    verification_status = 'verified',
    active = TRUE,
    absent_since = NULL,
    promoted_cache_key = v_cat_cache,
    promoted_at = COALESCE(formula.promoted_at, NOW()),
    last_observed_at = NOW(),
    updated_at = NOW()
  FROM public.product_data serving
  WHERE formula.id = v_cat_formula_id
    AND serving.cache_key = v_cat_cache;

  UPDATE public.catalog_formulas formula
  SET
    product_name =
      'Hill''s Science Diet Adult Sensitive Stomach & Skin Salmon & Brown Rice Recipe Dry Dog Food',
    product_line = 'adult sensitive stomach and skin',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'salmon and brown rice recipe',
    diet_condition = '',
    is_complete_food = TRUE,
    complete_food_evidence =
      'Current official Hill''s US PDP publishes the exact ingredients and states that AAFCO feeding tests substantiate complete and balanced nutrition for maintenance of adult dogs.',
    front_image_url = serving.image_url,
    source_url = v_dog_source,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'Hill''s Science Diet',
      'Sensitive Stomach & Skin',
      'Salmon',
      'Brown Rice',
      'Adult',
      'Dog',
      'Dry'
    ]::TEXT[],
    verification_status = 'verified',
    active = TRUE,
    absent_since = NULL,
    promoted_cache_key = v_dog_cache,
    promoted_at = COALESCE(formula.promoted_at, NOW()),
    last_observed_at = NOW(),
    updated_at = NOW()
  FROM public.product_data serving
  WHERE formula.id = v_dog_formula_id
    AND serving.cache_key = v_dog_cache;

  UPDATE public.catalog_observations
  SET
    formula_id = v_cat_formula_id,
    manufacturer = 'hill s pet nutrition',
    brand = 'hill s science diet',
    product_name =
      'Hill''s Science Diet Adult Sensitive Stomach & Skin Pollock Meal & Barley Recipe Dry Cat Food',
    product_line = 'adult sensitive stomach and skin',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'pollock meal and barley recipe',
    diet_condition = '',
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[]
  WHERE formula_id = v_cat_formula_id
     OR gtin IN ('052742059150', '052742059167');

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
  WHERE formula_id = v_dog_formula_id
     OR gtin IN ('052742086453', '052742088532');

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance
  )
  SELECT
    target.cache_key,
    target.alias_text,
    public.normalize_verified_product_search_query(target.alias_text),
    target.source_url,
    'manufacturer',
    NOW(),
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'species_boundary', target.pet_type,
      'life_stage_boundary', 'adult',
      'food_form_boundary', 'dry',
      'recipe_boundary', target.recipe,
      'reviewed_at', '2026-07-26'
    )
  FROM (
    VALUES
      (
        v_cat_cache,
        'Hill''s Science Diet Sensitive Stomach & Sensitive Skin Pollock Meal & Barley Recipe Adult Dry Cat Food',
        v_cat_source,
        'cat',
        'pollock meal and barley recipe'
      ),
      (
        v_cat_cache,
        'Hill''s Science Diet Adult Sensitive Stomach & Skin Pollock Meal & Barley Recipe Dry Cat Food',
        v_cat_source,
        'cat',
        'pollock meal and barley recipe'
      ),
      (
        v_dog_cache,
        'Hill''s Science Diet Adult Sensitive Stomach & Skin Salmon & Brown Rice Recipe Dry Dog Food',
        v_dog_source,
        'dog',
        'salmon and brown rice recipe'
      ),
      (
        v_dog_cache,
        'Hill''s Science Diet Sensitive Stomach & Sensitive Skin Salmon & Brown Rice Recipe Adult Dry Dog Food',
        v_dog_source,
        'dog',
        'salmon and brown rice recipe'
      )
  ) target(cache_key, alias_text, source_url, pet_type, recipe)
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET
    cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = EXCLUDED.provenance,
    updated_at = NOW();

  INSERT INTO public.catalog_field_evidence (
    formula_id,
    observation_id,
    field_name,
    field_value,
    source_url,
    source_authority,
    accepted,
    observed_at,
    content_hash
  )
  SELECT
    target.formula_id,
    NULL,
    evidence.field_name,
    to_jsonb(evidence.field_value),
    target.source_url,
    'manufacturer',
    TRUE,
    NOW(),
    encode(
      digest(
        target.formula_id::TEXT || '|' ||
        evidence.field_name || '|' ||
        evidence.field_value || '|' ||
        target.source_url,
        'sha256'
      ),
      'hex'
    )
  FROM (
    VALUES
      (
        v_cat_formula_id,
        v_cat_source,
        'cat',
        'pollock meal and barley recipe'
      ),
      (
        v_dog_formula_id,
        v_dog_source,
        'dog',
        'salmon and brown rice recipe'
      )
  ) target(formula_id, source_url, pet_type, recipe)
  CROSS JOIN LATERAL (
    VALUES
      ('species', target.pet_type),
      ('life_stage', 'adult'),
      ('food_form', 'dry'),
      ('recipe', target.recipe),
      ('ingredient_count', '42'),
      ('formula_version', 'current_official_2026-07-26'),
      ('complete_food', 'complete_and_balanced_maintenance')
  ) evidence(field_name, field_value)
  ON CONFLICT (
    formula_id,
    field_name,
    source_url,
    content_hash
  ) DO UPDATE
  SET
    accepted = TRUE,
    observed_at = EXCLUDED.observed_at;

  UPDATE public.catalog_manual_evidence_reviews review
  SET
    corrected_formula_key = target.formula_key,
    resolved_identity = jsonb_build_object(
      'formula_id', target.formula_id,
      'species', target.pet_type,
      'life_stage', 'adult',
      'food_form', 'dry',
      'recipe', target.recipe,
      'ingredient_count', 42
    ),
    evidence_status = 'promoted',
    quarantine_reason = NULL,
    formula_id = target.formula_id,
    promoted_cache_key = target.cache_key,
    review_notes =
      'Exact current official formula reconciled. Package sizes and GTINs remain SKU children; retailer titles are aliases.',
    updated_at = NOW()
  FROM (
    VALUES
      (
        'manual-search:hills-science-diet:adult-cat-sensitive-pollock-barley:v100:20260726',
        v_cat_formula_id,
        v_cat_key,
        v_cat_cache,
        'cat',
        'pollock meal and barley recipe'
      ),
      (
        'manual-search:hills-science-diet:adult-dog-stomach-skin-salmon-brown-rice:v100:20260726',
        v_dog_formula_id,
        v_dog_key,
        v_dog_cache,
        'dog',
        'salmon and brown rice recipe'
      )
  ) target(
    review_key,
    formula_id,
    formula_key,
    cache_key,
    pet_type,
    recipe
  )
  WHERE review.review_key = target.review_key;

END;
$$;
