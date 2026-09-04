-- Two public-panel "gaps" already have exact current manufacturer formulas.
-- Reconcile the retailer-facing identities as aliases instead of importing
-- duplicate products.

DO $$
DECLARE
  v_blue_formula_id BIGINT;
  v_pro_plan_formula_id BIGINT;
  v_blue_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo life protection formula adult dog grain-free chicken recipe life-protection-formula adult-grain-free-chicken-potato-recipe';
  v_pro_plan_cache TEXT := 'nestle-purina-pro-plan:038100105806';
  v_blue_source TEXT :=
    'https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/adult-grain-free-chicken-potato-recipe/';
  v_pro_plan_source TEXT :=
    'https://www.purina.com/cats/shop/pro-plan-kitten-chicken-rice-dry-cat-food';
BEGIN
  SELECT formula.id
  INTO STRICT v_blue_formula_id
  FROM public.catalog_formulas formula
  JOIN public.product_data serving
    ON serving.cache_key = formula.promoted_cache_key
  WHERE formula.promoted_cache_key = v_blue_cache
    AND formula.verification_status = 'verified'
    AND formula.active
    AND formula.pet_type = 'dog'
    AND formula.life_stage = 'adult'
    AND formula.food_form = 'dry'
    AND formula.source_url = v_blue_source
    AND cardinality(formula.ingredients) = 61
    AND serving.source_quality = 'manufacturer'
    AND serving.ingredient_verification_status = 'manufacturer'
    AND serving.image_verification_status = 'manufacturer'
    AND serving.is_complete_food
    AND serving.catalog_exclusion_reason IS NULL
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
        );

  SELECT formula.id
  INTO STRICT v_pro_plan_formula_id
  FROM public.catalog_formulas formula
  JOIN public.product_data serving
    ON serving.cache_key = formula.promoted_cache_key
  WHERE formula.promoted_cache_key = v_pro_plan_cache
    AND formula.verification_status = 'verified'
    AND formula.active
    AND formula.pet_type = 'cat'
    AND formula.life_stage = 'kitten'
    AND formula.food_form = 'dry'
    AND formula.source_url = v_pro_plan_source
    AND cardinality(formula.ingredients) = 43
    AND serving.gtin = '038100105806'
    AND serving.source_quality = 'manufacturer'
    AND serving.ingredient_verification_status = 'manufacturer'
    AND serving.image_verification_status = 'manufacturer'
    AND serving.is_complete_food
    AND serving.catalog_exclusion_reason IS NULL
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
        );

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
    target.alias_formula_key,
    target.formula_id,
    formula.identity_hash,
    'manual_review',
    target.source_url,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'species_boundary', target.pet_type,
      'life_stage_boundary', target.life_stage,
      'food_form_boundary', 'dry',
      'recipe_boundary', target.recipe,
      'retailer_title_is_alias', TRUE,
      'reviewed_at', '2026-07-26'
    ),
    NOW()
  FROM (
    VALUES
      (
        'blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food grain free chicken|dog|adult|dry||',
        v_blue_formula_id,
        v_blue_source,
        'dog',
        'adult',
        'grain free chicken and potato recipe'
      ),
      (
        'purina pro plan|purina pro plan|purina pro plan complete essentials kitten chicken and rice formula dry cat food|cat|kitten|dry||',
        v_pro_plan_formula_id,
        v_pro_plan_source,
        'cat',
        'kitten',
        'chicken and rice formula'
      )
  ) target(
    alias_formula_key,
    formula_id,
    source_url,
    pet_type,
    life_stage,
    recipe
  )
  JOIN public.catalog_formulas formula
    ON formula.id = target.formula_id
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET
    formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

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
      'life_stage_boundary', target.life_stage,
      'food_form_boundary', 'dry',
      'recipe_boundary', target.recipe,
      'retailer_title_is_alias', TRUE,
      'reviewed_at', '2026-07-26'
    )
  FROM (
    VALUES
      (
        v_blue_cache,
        'Blue Buffalo Life Protection Formula Adult Dry Dog Food Grain Free Chicken',
        v_blue_source,
        'dog',
        'adult',
        'grain free chicken and potato recipe'
      ),
      (
        v_pro_plan_cache,
        'Purina Pro Plan Complete Essentials Kitten Chicken & Rice Formula Dry Cat Food',
        v_pro_plan_source,
        'cat',
        'kitten',
        'chicken and rice formula'
      )
  ) target(
    cache_key,
    alias_text,
    source_url,
    pet_type,
    life_stage,
    recipe
  )
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET
    cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = EXCLUDED.provenance,
    updated_at = NOW();
END;
$$;
