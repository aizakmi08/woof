-- Keep the two newly promoted Tiki Cat Baby formulas reachable by their exact
-- current manufacturer titles. "Tiki Cat" is both a consumer-brand phrase and
-- contains a species token, so the generic species-filtered search path removes
-- part of the brand before ranking. The private unique alias lane resolves only
-- the exact, source-backed formula and does not broaden sibling matching.

DO $$
DECLARE
  v_whole_foods_cache_key CONSTANT TEXT :=
    'census:a36bd0c535f18dccd76f12abbea54d29';
  v_mousse_cache_key CONSTANT TEXT :=
    'census:aca607c7c5542e55ec73ddd4e3bee972';
  v_whole_foods_alias CONSTANT TEXT :=
    'Tiki Cat Baby Whole Foods Chicken, Duck & Duck Liver Recipe';
  v_mousse_alias CONSTANT TEXT :=
    'Tiki Cat Baby Mousse Chicken, Tuna & Chicken Liver Recipe';
  v_ready_count INTEGER;
  v_conflict_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_ready_count
  FROM public.product_data product
  WHERE product.cache_key IN (
      v_whole_foods_cache_key,
      v_mousse_cache_key
    )
    AND product.pet_type = 'cat'
    AND product.life_stage = 'kitten'
    AND product.food_form = 'wet'
    AND product.is_complete_food
    AND product.catalog_exclusion_reason IS NULL
    AND product.expires_at > now()
    AND product.source_quality = 'manufacturer'
    AND product.ingredient_verification_status = 'manufacturer'
    AND product.image_verification_status = 'manufacturer'
    AND product.ingredient_count >= 5
    AND NULLIF(btrim(product.source_url), '') IS NOT NULL
    AND product.source_url LIKE 'https://tikipets.com/product/tiki-cat/%'
    AND NULLIF(btrim(product.image_url), '') IS NOT NULL;

  IF v_ready_count <> 2 THEN
    RAISE EXCEPTION
      'Tiki Cat Baby exact aliases require two current manufacturer-verified serving rows; found %',
      v_ready_count;
  END IF;

  SELECT count(*)
  INTO v_conflict_count
  FROM (
    VALUES
      (
        v_whole_foods_cache_key,
        public.normalize_verified_product_search_query(v_whole_foods_alias)
      ),
      (
        v_mousse_cache_key,
        public.normalize_verified_product_search_query(v_mousse_alias)
      )
  ) expected(cache_key, normalized_alias)
  JOIN public.catalog_verified_product_search_aliases alias
    ON alias.active
   AND alias.normalized_alias = expected.normalized_alias
   AND alias.cache_key <> expected.cache_key;

  IF v_conflict_count <> 0 THEN
    RAISE EXCEPTION
      'Tiki Cat Baby exact alias conflicts with % active sibling aliases',
      v_conflict_count;
  END IF;

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
  SELECT
    product.cache_key,
    expected.alias_text,
    public.normalize_verified_product_search_query(expected.alias_text),
    product.source_url,
    'manufacturer',
    COALESCE(product.verified_at, now()),
    jsonb_build_object(
      'exact_current_manufacturer_title', TRUE,
      'source_run_key',
        'manufacturer-exact-review:official-gap-wave-v97:20260726',
      'species_boundary', product.pet_type,
      'life_stage_boundary', product.life_stage,
      'food_form_boundary', product.food_form,
      'recipe_boundary', product.flavor,
      'formula_version_boundary', TRUE,
      'reviewed_at', '2026-07-26'
    ),
    TRUE,
    now()
  FROM (
    VALUES
      (v_whole_foods_cache_key, v_whole_foods_alias),
      (v_mousse_cache_key, v_mousse_alias)
  ) expected(cache_key, alias_text)
  JOIN public.product_data product
    ON product.cache_key = expected.cache_key
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET
    cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = EXCLUDED.provenance,
    updated_at = now();
END
$$;

DO $$
DECLARE
  v_whole_foods_top TEXT;
  v_mousse_top TEXT;
  v_cross_species_count INTEGER;
BEGIN
  SELECT result.cache_key
  INTO v_whole_foods_top
  FROM public.search_verified_products(
    'Tiki Cat Baby Whole Foods Chicken, Duck & Duck Liver Recipe',
    5
  ) result
  ORDER BY result.rank DESC
  LIMIT 1;

  SELECT result.cache_key
  INTO v_mousse_top
  FROM public.search_verified_products(
    'Tiki Cat Baby Mousse Chicken, Tuna & Chicken Liver Recipe',
    5
  ) result
  ORDER BY result.rank DESC
  LIMIT 1;

  SELECT count(*)
  INTO v_cross_species_count
  FROM public.search_verified_products(
    'Tiki Cat Baby Mousse Chicken Tuna Chicken Liver dog food',
    5
  );

  IF v_whole_foods_top <>
      'census:a36bd0c535f18dccd76f12abbea54d29'
     OR v_mousse_top <>
      'census:aca607c7c5542e55ec73ddd4e3bee972'
     OR v_cross_species_count <> 0 THEN
    RAISE EXCEPTION
      'Tiki Cat Baby exact-search gate failed: Whole Foods %, Mousse %, cross-species %',
      v_whole_foods_top,
      v_mousse_top,
      v_cross_species_count;
  END IF;
END
$$;
