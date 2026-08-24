-- Resolve the remaining exact official-source gaps that can be proven from
-- current manufacturer pages, split legacy formula collisions by protected
-- breed/texture identity, and prevent future field evidence from crossing an
-- ingredient-formula boundary.

DO $$
DECLARE
  v_eukanuba_small_formula_id BIGINT;
  v_eukanuba_large_formula_id BIGINT;
  v_hills_formula_id BIGINT;
  v_tiki_mineral_formula_id BIGINT;
  v_tiki_duck_whole_foods_formula_id BIGINT;
  v_tiki_tuna_mousse_formula_id BIGINT;
  v_tiki_duck_pate_formula_id BIGINT;
  v_tiki_duck_mousse_shreds_formula_id BIGINT;
  v_tiki_tuna_pate_formula_id BIGINT;
  v_tiki_tuna_mousse_shreds_formula_id BIGINT;
  v_run_id BIGINT;
  v_manual_observation_count INTEGER;
BEGIN
  SELECT id
  INTO STRICT v_eukanuba_small_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'eukanuba|eukanuba|fit body|dog|adult|dry|chicken|'
    AND promoted_cache_key IS NULL;

  SELECT id
  INTO STRICT v_eukanuba_large_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key = 'eukanuba:030111301055';

  SELECT id
  INTO STRICT v_hills_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'hill s science diet|hill s science diet|adult 7 senior vitality small and mini|dog|senior|wet|chicken and vegetable stew|';

  SELECT id
  INTO STRICT v_tiki_mineral_formula_id
  FROM public.catalog_formulas
  WHERE source_url =
    'https://tikipets.com/product/tiki-cat/tiki-cat-dry-food/solutions-dry/tiki-cat-solutions-dry-cat-food-mineral-balance-chicken-2-8-lb/'
    AND promoted_cache_key IS NULL;

  SELECT id
  INTO STRICT v_tiki_duck_whole_foods_formula_id
  FROM public.catalog_formulas
  WHERE source_url =
    'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/kitten-whole-foods-with-chicken-duck-duck-liver/'
    AND promoted_cache_key IS NULL;

  SELECT id
  INTO STRICT v_tiki_tuna_mousse_formula_id
  FROM public.catalog_formulas
  WHERE source_url =
    'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/tiki-cat-baby-mousse-chicken-tuna-chicken-liver/'
    AND promoted_cache_key IS NULL;

  SELECT id
  INTO STRICT v_tiki_duck_pate_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key =
    'tiki-pets:tiki cat chicken duck duck liver recipe kitten chicken-duck-duck-liver-2';

  SELECT id
  INTO STRICT v_tiki_duck_mousse_shreds_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key =
    'tiki-pets:tiki cat chicken duck duck liver recipe kitten kitten-mousse-shreds-with-chicken-duck-duck-liver';

  SELECT id
  INTO STRICT v_tiki_tuna_pate_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key =
    'tiki-pets:tiki cat chicken tuna chicken liver recipe kitten chicken-tuna-chicken-liver';

  SELECT id
  INTO STRICT v_tiki_tuna_mousse_shreds_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key =
    'tiki-pets:tiki cat chicken tuna chicken liver recipe kitten kitten-mousse-shreds-with-chicken-tuna-chicken-liver';

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'eukanuba:030111151025'
      AND source_url =
        'https://www.eukanuba.com/products/adult-dog-food/fit-body-weight-control-small-breed-dry-dog-food'
      AND gtin = '030111151025'
      AND ingredient_verification_status = 'label_ocr_verified'
      AND image_verification_status = 'manufacturer'
      AND ingredient_count = 40
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION
      'Exact current Eukanuba Small Breed serving evidence is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key =
      'manufacturer-reviewed-wave-z-20260725:052742011936'
      AND source_url =
        'https://www.hillspet.com/dog-food/science-diet-adult-7-senior-vitality-small-paws-chicken-vegetables-stew-canned'
      AND gtin = '052742011936'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND ingredient_count = 50
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION
      'Exact Hill''s Senior Vitality serving evidence is missing';
  END IF;

  -- The legacy Eukanuba row combined Large, Medium, and Small Breed evidence
  -- under one generic FIT BODY identity. Its retained GTIN and official PDP
  -- prove that this row is the Small Breed formula. Large Breed already has a
  -- separate exact canonical formula.
  UPDATE public.catalog_observations
  SET
    formula_id = v_eukanuba_large_formula_id,
    validation_reasons =
      array_append(
        COALESCE(validation_reasons, ARRAY[]::TEXT[]),
        'reassigned_from_legacy_cross_breed_formula'
      )
  WHERE formula_id = v_eukanuba_small_formula_id
    AND source_url =
      'https://www.chewy.com/eukanuba-fit-body-weight-control/dp/533166';

  UPDATE public.catalog_skus
  SET
    formula_id = v_eukanuba_large_formula_id,
    updated_at = NOW()
  WHERE formula_id = v_eukanuba_small_formula_id
    AND source_url =
      'https://www.chewy.com/eukanuba-fit-body-weight-control/dp/533166';

  UPDATE public.catalog_observations
  SET
    validation_status = 'rejected',
    validation_reasons =
      array_append(
        COALESCE(validation_reasons, ARRAY[]::TEXT[]),
        'retailer_ingredient_statement_differs_from_current_manufacturer_gtin_evidence'
      )
  WHERE formula_id = v_eukanuba_small_formula_id
    AND source_url =
      'https://www.petsmart.com/dog/food/dry-food/eukanuba-and-trade-fit-body-weight-control-small-breed-adult-dry-dog-food-chicken-53515.html';

  UPDATE public.catalog_field_evidence
  SET accepted = FALSE
  WHERE formula_id = v_eukanuba_small_formula_id
    AND field_name = 'ingredient_text'
    AND source_url <>
      'https://www.eukanuba.com/products/adult-dog-food/fit-body-weight-control-small-breed-dry-dog-food';

  UPDATE public.product_data
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason =
      'duplicate_formula_version_conflicts_with_current_manufacturer_gtin_evidence',
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  WHERE cache_key = 'petsmart-retail-catalog:030111151025';

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
    'eukanuba|eukanuba|fit body|dog|adult|dry|chicken|',
    v_eukanuba_small_formula_id,
    encode(
      digest(
        'eukanuba|eukanuba|fit body weight control small breed|dog|adult|dry|chicken|',
        'sha256'
      ),
      'hex'
    ),
    'manual_review',
    'https://www.eukanuba.com/products/adult-dog-food/fit-body-weight-control-small-breed-dry-dog-food',
    jsonb_build_object(
      'reviewed_at', '2026-07-26',
      'review_reason',
        'legacy_formula_split_by_exact_official_breed_size_and_gtin',
      'protected_boundary', 'small_breed',
      'gtin', '030111151025'
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

  UPDATE public.catalog_formulas AS formula
  SET
    formula_key =
      'eukanuba|eukanuba|fit body weight control small breed|dog|adult|dry|chicken|',
    identity_hash = encode(
      digest(
        'eukanuba|eukanuba|fit body weight control small breed|dog|adult|dry|chicken|',
        'sha256'
      ),
      'hex'
    ),
    manufacturer = 'mars petcare',
    brand = 'eukanuba',
    product_name = serving.product_name,
    product_line = 'fit body weight control small breed',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken',
    diet_condition = '',
    is_complete_food = TRUE,
    complete_food_evidence =
      'Current official Eukanuba Small Breed PDP, exact GTIN 030111151025, full ingredient statement, and matching manufacturer package image.',
    ingredient_text = serving.ingredient_text,
    ingredients = serving.ingredients,
    front_image_url = serving.image_url,
    source_url = serving.source_url,
    source_authority = 'manufacturer',
    ingredient_verification_status = serving.ingredient_verification_status,
    image_verification_status = serving.image_verification_status,
    verification_status = 'verified',
    active = TRUE,
    promoted_cache_key = serving.cache_key,
    protected_terms = ARRAY[
      'Fit Body',
      'Weight Control',
      'Small Breed',
      'Chicken'
    ],
    last_observed_at = NOW(),
    updated_at = NOW()
  FROM public.product_data AS serving
  WHERE formula.id = v_eukanuba_small_formula_id
    AND serving.cache_key = 'eukanuba:030111151025';

  -- Split the old Tiki formula families by their visible texture/line. The
  -- already-promoted pâté and mousse-and-shreds formulas retain their exact
  -- observations; the two remaining exact current formulas stay on the legacy
  -- rows after those collisions are removed.
  UPDATE public.catalog_observations
  SET formula_id = v_tiki_duck_pate_formula_id
  WHERE formula_id = v_tiki_duck_whole_foods_formula_id
    AND source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/chicken-duck-duck-liver-2/';

  UPDATE public.catalog_skus
  SET formula_id = v_tiki_duck_pate_formula_id, updated_at = NOW()
  WHERE formula_id = v_tiki_duck_whole_foods_formula_id
    AND source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/chicken-duck-duck-liver-2/';

  UPDATE public.catalog_observations
  SET formula_id = v_tiki_duck_mousse_shreds_formula_id
  WHERE formula_id = v_tiki_duck_whole_foods_formula_id
    AND source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/kitten-mousse-shreds-with-chicken-duck-duck-liver/';

  UPDATE public.catalog_skus
  SET formula_id = v_tiki_duck_mousse_shreds_formula_id, updated_at = NOW()
  WHERE formula_id = v_tiki_duck_whole_foods_formula_id
    AND source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/kitten-mousse-shreds-with-chicken-duck-duck-liver/';

  UPDATE public.catalog_field_evidence
  SET accepted = FALSE
  WHERE formula_id = v_tiki_duck_whole_foods_formula_id
    AND source_url <>
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/kitten-whole-foods-with-chicken-duck-duck-liver/';

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
    formula_key,
    id,
    encode(
      digest(
        'whitebridge pet brands|tiki cat|baby whole foods|cat|kitten|wet|chicken duck and duck liver recipe|',
        'sha256'
      ),
      'hex'
    ),
    'manual_review',
    source_url,
    jsonb_build_object(
      'reviewed_at', '2026-07-26',
      'review_reason',
        'legacy_tiki_texture_collision_split_to_exact_whole_foods_formula',
      'protected_boundary', 'baby_whole_foods'
    ),
    NOW()
  FROM public.catalog_formulas
  WHERE id = v_tiki_duck_whole_foods_formula_id
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
    formula_key =
      'whitebridge pet brands|tiki cat|baby whole foods|cat|kitten|wet|chicken duck and duck liver recipe|',
    identity_hash = encode(
      digest(
        'whitebridge pet brands|tiki cat|baby whole foods|cat|kitten|wet|chicken duck and duck liver recipe|',
        'sha256'
      ),
      'hex'
    ),
    manufacturer = 'whitebridge pet brands',
    product_name =
      'Tiki Cat Baby Whole Foods Chicken, Duck & Duck Liver Recipe',
    product_line = 'baby whole foods',
    flavor = 'chicken duck and duck liver recipe',
    complete_food_evidence =
      'Current official Tiki Cat Baby Whole Foods PDP states the kitten formula, exact 2.4 oz can form, full ingredients, and feeding directions.',
    protected_terms = ARRAY[
      'Baby',
      'Whole Foods',
      'Chicken',
      'Duck',
      'Duck Liver'
    ],
    updated_at = NOW()
  WHERE id = v_tiki_duck_whole_foods_formula_id;

  UPDATE public.catalog_observations
  SET formula_id = v_tiki_tuna_pate_formula_id
  WHERE formula_id = v_tiki_tuna_mousse_formula_id
    AND source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/chicken-tuna-chicken-liver/';

  UPDATE public.catalog_skus
  SET formula_id = v_tiki_tuna_pate_formula_id, updated_at = NOW()
  WHERE formula_id = v_tiki_tuna_mousse_formula_id
    AND source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/chicken-tuna-chicken-liver/';

  UPDATE public.catalog_observations
  SET formula_id = v_tiki_tuna_mousse_shreds_formula_id
  WHERE formula_id = v_tiki_tuna_mousse_formula_id
    AND source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/kitten-mousse-shreds-with-chicken-tuna-chicken-liver/';

  UPDATE public.catalog_skus
  SET formula_id = v_tiki_tuna_mousse_shreds_formula_id, updated_at = NOW()
  WHERE formula_id = v_tiki_tuna_mousse_formula_id
    AND source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/kitten-mousse-shreds-with-chicken-tuna-chicken-liver/';

  UPDATE public.catalog_field_evidence
  SET accepted = FALSE
  WHERE formula_id = v_tiki_tuna_mousse_formula_id
    AND source_url <>
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/tiki-cat-baby-mousse-chicken-tuna-chicken-liver/';

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
    formula_key,
    id,
    encode(
      digest(
        'whitebridge pet brands|tiki cat|baby mousse|cat|kitten|wet|chicken tuna and chicken liver recipe|',
        'sha256'
      ),
      'hex'
    ),
    'manual_review',
    source_url,
    jsonb_build_object(
      'reviewed_at', '2026-07-26',
      'review_reason',
        'legacy_tiki_texture_collision_split_to_exact_baby_mousse_formula',
      'protected_boundary', 'baby_mousse'
    ),
    NOW()
  FROM public.catalog_formulas
  WHERE id = v_tiki_tuna_mousse_formula_id
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
    formula_key =
      'whitebridge pet brands|tiki cat|baby mousse|cat|kitten|wet|chicken tuna and chicken liver recipe|',
    identity_hash = encode(
      digest(
        'whitebridge pet brands|tiki cat|baby mousse|cat|kitten|wet|chicken tuna and chicken liver recipe|',
        'sha256'
      ),
      'hex'
    ),
    manufacturer = 'whitebridge pet brands',
    product_name =
      'Tiki Cat Baby Mousse Chicken, Tuna & Chicken Liver Recipe',
    product_line = 'baby mousse',
    flavor = 'chicken tuna and chicken liver recipe',
    complete_food_evidence =
      'Current official Tiki Cat Baby Mousse PDP states the kitten formula, exact pouch form, full ingredients, and feeding directions.',
    protected_terms = ARRAY[
      'Baby',
      'Mousse',
      'Chicken',
      'Tuna',
      'Chicken Liver'
    ],
    updated_at = NOW()
  WHERE id = v_tiki_tuna_mousse_formula_id;

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
    formula_key,
    id,
    encode(
      digest(
        'whitebridge pet brands|tiki cat|solutions mineral balance|cat|adult|dry|chicken recipe|',
        'sha256'
      ),
      'hex'
    ),
    'manual_review',
    source_url,
    jsonb_build_object(
      'reviewed_at', '2026-07-26',
      'review_reason',
        'legacy_tiki_line_identity_repaired_from_exact_current_official_pdp',
      'protected_boundary', 'solutions_mineral_balance'
    ),
    NOW()
  FROM public.catalog_formulas
  WHERE id = v_tiki_mineral_formula_id
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
    formula_key =
      'whitebridge pet brands|tiki cat|solutions mineral balance|cat|adult|dry|chicken recipe|',
    identity_hash = encode(
      digest(
        'whitebridge pet brands|tiki cat|solutions mineral balance|cat|adult|dry|chicken recipe|',
        'sha256'
      ),
      'hex'
    ),
    manufacturer = 'whitebridge pet brands',
    product_name =
      'Tiki Cat Solutions Mineral Balance Baked Kibble Chicken Recipe',
    product_line = 'solutions mineral balance',
    flavor = 'chicken recipe',
    complete_food_evidence =
      'Current official Tiki Cat Solutions Mineral Balance PDP provides the adult-cat feeding guide, full ingredient statement, nutrient analysis, and matching package image.',
    protected_terms = ARRAY[
      'Solutions',
      'Mineral Balance',
      'Baked Kibble',
      'Chicken Recipe'
    ],
    updated_at = NOW()
  WHERE id = v_tiki_mineral_formula_id;

  -- The historical Pedigree 30-count URL now resolves to a three-flavor Beef
  -- Variety Pack. It is not one ingredient formula and must not inherit the
  -- single Beef-can serving row.
  UPDATE public.catalog_observations
  SET
    formula_id = NULL,
    validation_status = 'rejected',
    validation_reasons =
      array_append(
        COALESCE(validation_reasons, ARRAY[]::TEXT[]),
        'multi_formula_or_variety_pack'
      )
  WHERE source_url =
    'https://www.pedigree.com/products/wet/pedigree-choice-cuts-gravy-adult-wet-dog-food-30ct';

  UPDATE public.catalog_field_evidence AS evidence
  SET accepted = FALSE
  FROM public.catalog_formulas AS formula
  WHERE evidence.formula_id = formula.id
    AND formula.id IN (
      SELECT id
      FROM public.catalog_formulas
      WHERE formula_key =
        'pedigree|pedigree|choice cuts in gravy|dog|adult|wet|beef|'
    )
    AND evidence.field_name = 'ingredient_text'
    AND regexp_replace(
          lower(COALESCE(evidence.field_value #>> '{}', '')),
          '[^a-z0-9]+',
          '',
          'g'
        ) <>
        regexp_replace(
          lower(COALESCE(formula.ingredient_text, '')),
          '[^a-z0-9]+',
          '',
          'g'
        );

  INSERT INTO public.product_data (
    cache_key,
    product_name,
    brand,
    ingredients,
    ingredient_text,
    ingredient_count,
    source,
    source_url,
    scraped_at,
    expires_at,
    image_url,
    is_complete_food,
    catalog_exclusion_reason,
    pet_type,
    source_quality,
    ingredient_verification_status,
    image_verification_status,
    verified_at,
    product_line,
    flavor,
    life_stage,
    food_form,
    package_size,
    updated_at
  )
  SELECT
    'pedigree-mars-petcare:choice-cuts-beef-variety-pack-30ct',
    'CHOICE CUTS IN GRAVY Adult Wet Dog Food Pouches, Beef Variety Pack',
    'Pedigree',
    ARRAY[]::TEXT[],
    NULL,
    0,
    'pedigree-mars-petcare',
    'https://www.pedigree.com/products/wet/pedigree-choice-cuts-gravy-adult-wet-dog-food-30ct',
    NOW(),
    NOW() + INTERVAL '90 days',
    observation.front_image_url,
    FALSE,
    'multi_formula_or_variety_pack',
    'dog',
    'manufacturer',
    'unverified',
    CASE
      WHEN NULLIF(btrim(observation.front_image_url), '') IS NULL
        THEN 'unverified'
      ELSE 'manufacturer'
    END,
    NULL,
    'choice cuts in gravy',
    'beef variety pack',
    'adult',
    'wet',
    '30 count',
    NOW()
  FROM public.catalog_observations AS observation
  WHERE observation.source_url =
    'https://www.pedigree.com/products/wet/pedigree-choice-cuts-gravy-adult-wet-dog-food-30ct'
  ORDER BY observation.observed_at DESC, observation.id DESC
  LIMIT 1
  ON CONFLICT (cache_key) DO UPDATE
  SET
    product_name = EXCLUDED.product_name,
    brand = EXCLUDED.brand,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    scraped_at = EXCLUDED.scraped_at,
    expires_at = EXCLUDED.expires_at,
    image_url = EXCLUDED.image_url,
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'multi_formula_or_variety_pack',
    source_quality = EXCLUDED.source_quality,
    ingredient_verification_status = 'unverified',
    image_verification_status = EXCLUDED.image_verification_status,
    verified_at = NULL,
    updated_at = NOW();

  -- Link Hill's to the exact serving row whose normalized 50-item statement
  -- matches the current official observation.
  UPDATE public.catalog_formulas
  SET
    promoted_cache_key =
      'manufacturer-reviewed-wave-z-20260725:052742011936',
    complete_food_evidence =
      'Current official Hill''s Senior Vitality Small & Mini PDP, exact GTIN 052742011936, 50-item ingredient statement, and matching manufacturer package image.',
    updated_at = NOW()
  WHERE id = v_hills_formula_id;

  INSERT INTO public.catalog_source_runs (
    run_key,
    source_slug,
    source_type,
    coverage_role,
    status,
    started_at,
    finished_at,
    expected_count,
    observed_count,
    accepted_count,
    rejected_count,
    pagination_complete,
    source_content_hash,
    checkpoint,
    metadata,
    updated_at
  )
  VALUES (
    'manufacturer-exact-review:official-gap-wave-v97:20260726',
    'manufacturer-exact-review',
    'manufacturer',
    'verification',
    'completed',
    NOW(),
    NOW(),
    5,
    5,
    5,
    0,
    TRUE,
    encode(
      digest(
        'eukanuba-small|hills-senior-vitality|tiki-mineral|tiki-duck-whole-foods|tiki-tuna-mousse',
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_object('completed', TRUE, 'reviewed_at', '2026-07-26'),
    jsonb_build_object(
      'evidence_policy', 'exact_current_official_manufacturer_only',
      'formula_count', 5,
      'no_guess', TRUE
    ),
    NOW()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = NOW(),
    expected_count = 5,
    observed_count = 5,
    accepted_count = 5,
    rejected_count = 0,
    pagination_complete = TRUE,
    checkpoint = EXCLUDED.checkpoint,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO v_run_id;

  INSERT INTO public.catalog_observations (
    run_id,
    formula_id,
    source_slug,
    source_external_id,
    source_url,
    source_authority,
    gtin,
    manufacturer,
    brand,
    product_name,
    product_line,
    pet_type,
    life_stage,
    food_form,
    flavor,
    diet_condition,
    package_size,
    ingredient_text,
    front_image_url,
    is_complete_food,
    available_in_us,
    observed_at,
    content_hash,
    validation_status,
    validation_reasons,
    raw_payload
  )
  SELECT
    v_run_id,
    target.formula_id,
    'manufacturer-exact-review',
    target.source_url,
    target.source_url,
    'manufacturer',
    observation.gtin,
    formula.manufacturer,
    formula.brand,
    formula.product_name,
    formula.product_line,
    formula.pet_type,
    formula.life_stage,
    formula.food_form,
    formula.flavor,
    formula.diet_condition,
    observation.package_size,
    formula.ingredient_text,
    formula.front_image_url,
    TRUE,
    TRUE,
    NOW(),
    encode(
      digest(
        target.source_url || ':' ||
        regexp_replace(
          lower(formula.ingredient_text),
          '[^a-z0-9]+',
          '',
          'g'
        ),
        'sha256'
      ),
      'hex'
    ),
    'accepted',
    ARRAY['manual_exact_official_evidence_review']::TEXT[],
    jsonb_build_object(
      'copied_from_observation_id', observation.id,
      'reviewed_at', '2026-07-26',
      'identity_review', 'exact',
      'ingredient_review', 'exact_current_official',
      'image_review', 'exact_current_official'
    )
  FROM (
    VALUES
      (
        v_eukanuba_small_formula_id,
        'https://www.eukanuba.com/products/adult-dog-food/fit-body-weight-control-small-breed-dry-dog-food'
      ),
      (
        v_hills_formula_id,
        'https://www.hillspet.com/dog-food/science-diet-adult-7-senior-vitality-small-mini-chicken-vegetables-stew-canned'
      ),
      (
        v_tiki_mineral_formula_id,
        'https://tikipets.com/product/tiki-cat/tiki-cat-dry-food/solutions-dry/tiki-cat-solutions-dry-cat-food-mineral-balance-chicken-2-8-lb/'
      ),
      (
        v_tiki_duck_whole_foods_formula_id,
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/kitten-whole-foods-with-chicken-duck-duck-liver/'
      ),
      (
        v_tiki_tuna_mousse_formula_id,
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/tiki-cat-baby-mousse-chicken-tuna-chicken-liver/'
      )
  ) AS target(formula_id, source_url)
  JOIN public.catalog_formulas AS formula
    ON formula.id = target.formula_id
  JOIN LATERAL (
    SELECT candidate.*
    FROM public.catalog_observations AS candidate
    WHERE candidate.source_url = target.source_url
      AND candidate.validation_status = 'accepted'
    ORDER BY candidate.observed_at DESC, candidate.id DESC
    LIMIT 1
  ) AS observation ON TRUE
  ON CONFLICT (
    run_id,
    source_slug,
    source_external_id,
    content_hash
  ) DO UPDATE
  SET
    formula_id = EXCLUDED.formula_id,
    validation_status = 'accepted',
    validation_reasons = EXCLUDED.validation_reasons,
    raw_payload = EXCLUDED.raw_payload;

  SELECT count(*)
  INTO v_manual_observation_count
  FROM public.catalog_observations
  WHERE run_id = v_run_id
    AND source_slug = 'manufacturer-exact-review'
    AND validation_status = 'accepted';

  IF v_manual_observation_count <> 5 THEN
    RAISE EXCEPTION
      'Expected five exact official observations in v97 run, found %',
      v_manual_observation_count;
  END IF;

  PERFORM *
  FROM public.promote_catalog_formula(v_eukanuba_small_formula_id);

  PERFORM *
  FROM public.promote_catalog_formula(v_hills_formula_id);

  PERFORM *
  FROM public.promote_catalog_formula(v_tiki_mineral_formula_id);

  PERFORM *
  FROM public.promote_catalog_formula(v_tiki_duck_whole_foods_formula_id);

  PERFORM *
  FROM public.promote_catalog_formula(v_tiki_tuna_mousse_formula_id);

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas AS formula
    LEFT JOIN public.product_data AS serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id IN (
      v_eukanuba_small_formula_id,
      v_hills_formula_id,
      v_tiki_mineral_formula_id,
      v_tiki_duck_whole_foods_formula_id,
      v_tiki_tuna_mousse_formula_id
    )
      AND (
        serving.cache_key IS NULL
        OR NOT serving.is_complete_food
        OR serving.catalog_exclusion_reason IS NOT NULL
        OR serving.ingredient_verification_status NOT IN (
          'manufacturer',
          'label_ocr_verified'
        )
        OR serving.image_verification_status <> 'manufacturer'
        OR lower(serving.pet_type) <> lower(formula.pet_type)
        OR lower(serving.life_stage) <> lower(formula.life_stage)
        OR lower(serving.food_form) <> lower(formula.food_form)
        OR lower(serving.product_line) <> lower(formula.product_line)
        OR lower(serving.flavor) <> lower(formula.flavor)
        OR regexp_replace(
             lower(serving.ingredient_text),
             '[^a-z0-9]+',
             '',
             'g'
           ) <>
           regexp_replace(
             lower(formula.ingredient_text),
             '[^a-z0-9]+',
             '',
             'g'
           )
      )
  ) THEN
    RAISE EXCEPTION
      'One or more v97 official formulas failed exact serving promotion';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE source_url =
      'https://www.pedigree.com/products/wet/pedigree-choice-cuts-gravy-adult-wet-dog-food-30ct'
      AND (
        formula_id IS NOT NULL
        OR validation_status <> 'rejected'
        OR NOT (
          'multi_formula_or_variety_pack' =
          ANY(COALESCE(validation_reasons, ARRAY[]::TEXT[]))
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Pedigree 30-count variety pack remains attached to a single formula';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.catalog_normalize_ingredient_evidence(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    lower(
      regexp_replace(
        btrim(COALESCE(p_value, '')),
        '^[[:space:]]*ingredients?[[:space:]]*:[[:space:]]*',
        '',
        'i'
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  )
$$;

CREATE OR REPLACE FUNCTION public.guard_catalog_field_evidence_ingredient_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_formula_ingredient_text TEXT;
  v_evidence_ingredient_text TEXT;
BEGIN
  IF NOT COALESCE(NEW.accepted, FALSE)
     OR NEW.field_name <> 'ingredient_text' THEN
    RETURN NEW;
  END IF;

  SELECT ingredient_text
  INTO v_formula_ingredient_text
  FROM public.catalog_formulas
  WHERE id = NEW.formula_id;

  v_evidence_ingredient_text := NEW.field_value #>> '{}';

  IF NULLIF(
       public.catalog_normalize_ingredient_evidence(v_formula_ingredient_text),
       ''
     ) IS NULL
     OR NULLIF(
       public.catalog_normalize_ingredient_evidence(v_evidence_ingredient_text),
       ''
     ) IS NULL THEN
    RAISE EXCEPTION
      'catalog_field_evidence_missing_ingredient_statement: formula % source %',
      NEW.formula_id,
      NEW.source_url;
  END IF;

  IF public.catalog_normalize_ingredient_evidence(
       v_formula_ingredient_text
     ) <>
     public.catalog_normalize_ingredient_evidence(
       v_evidence_ingredient_text
     ) THEN
    RAISE EXCEPTION
      'catalog_field_evidence_formula_version_conflict: formula % source %',
      NEW.formula_id,
      NEW.source_url;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guard_catalog_field_evidence_ingredient_version
  ON public.catalog_field_evidence;

CREATE TRIGGER guard_catalog_field_evidence_ingredient_version
BEFORE INSERT OR UPDATE OF
  formula_id,
  field_name,
  field_value,
  accepted
ON public.catalog_field_evidence
FOR EACH ROW
EXECUTE FUNCTION public.guard_catalog_field_evidence_ingredient_version();
