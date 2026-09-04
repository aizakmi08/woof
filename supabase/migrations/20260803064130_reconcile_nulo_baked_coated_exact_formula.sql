-- Reconcile a legacy Nulo serving row whose source URL points at the sibling
-- Chicken/Turkey/Duck page even though its ingredients and image are the
-- Chicken/Turkey/Whitefish formula. Keep the current official page as the one
-- searchable serving identity and retain the old title only as an alias.

DO $$
DECLARE
  v_current CONSTANT TEXT :=
    'nulo:nulo medalseries baked coated chicken turkey whitefish recipe for cats products medalseries-baked-and-coated-chicken-turkey-whitefish-recipe-for-cats';
  v_legacy CONSTANT TEXT :=
    'nulo:nulo medalseries baked coated adult chicken turkey whitefish recipe';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data current_row
    JOIN public.product_data legacy_row ON legacy_row.cache_key = v_legacy
    WHERE current_row.cache_key = v_current
      AND current_row.pet_type = 'cat'
      AND current_row.life_stage = 'adult'
      AND current_row.food_form = 'dry'
      AND current_row.flavor = 'Chicken, Turkey & Whitefish Recipe'
      AND current_row.ingredient_verification_status = 'manufacturer'
      AND current_row.image_verification_status = 'manufacturer'
      AND regexp_replace(lower(current_row.ingredient_text), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(legacy_row.ingredient_text), '[^a-z0-9]+', '', 'g')
      AND split_part(current_row.image_url, '?', 1) =
          split_part(legacy_row.image_url, '?', 1)
      AND legacy_row.source_url =
          'https://nulo.com/products/medalseries-baked-and-coated-chicken-turkey-duck-recipe-for-cats'
  ) THEN
    RAISE EXCEPTION 'Nulo Baked & Coated exact-formula reconciliation precondition failed';
  END IF;

  UPDATE public.product_data
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'duplicate_exact_verified_formula_alias',
    ingredient_verification_status = 'unverified',
    image_verification_status = 'unverified',
    updated_at = NOW()
  WHERE cache_key = v_legacy;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance,
    active,
    updated_at
  )
  VALUES (
    v_current,
    'Nulo MedalSeries Baked & Coated Adult Chicken, Turkey & Whitefish Recipe',
    public.normalize_verified_product_search_query(
      'Nulo MedalSeries Baked & Coated Adult Chicken, Turkey & Whitefish Recipe'
    ),
    'https://nulo.com/products/medalseries-baked-and-coated-chicken-turkey-whitefish-recipe-for-cats',
    'manufacturer',
    '2026-08-03T06:39:44.160Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'legacy_source_identity_contamination_repaired', TRUE,
      'food_form_boundary', 'dry',
      'protected_recipe', 'Chicken, Turkey & Whitefish Recipe'
    ),
    TRUE,
    NOW()
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

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Nulo MedalSeries Baked Coated Chicken Turkey Whitefish Recipe for Cats',
      1
    )
  ) IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'Current Nulo Baked & Coated exact search did not select the official formula';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.search_verified_products(
      'Nulo MedalSeries Baked Coated Chicken Turkey Whitefish Recipe for Cats',
      10
    )
    WHERE cache_key = v_legacy
  ) THEN
    RAISE EXCEPTION 'Excluded contaminated Nulo alias remains searchable';
  END IF;
END;
$$;
