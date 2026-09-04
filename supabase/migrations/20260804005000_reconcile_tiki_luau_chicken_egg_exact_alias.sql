-- Reconcile the exact Chewy/Walmart shelf title for Tiki Cat Luau Chicken &
-- Egg Pate to the current manufacturer formula. Tiki's official page and the
-- exact Chewy PDP publish the same 30-item ingredient statement and matching
-- Chicken & Egg Pate package. No retailer ingredients are copied and no
-- sibling (including Velvet Mousse) is eligible for this alias.

DO $$
DECLARE
  v_canonical BIGINT;
  v_duplicate BIGINT;
  v_cache CONSTANT TEXT :=
    'tiki-pets:tiki cat chicken egg pate luau chicken-egg-pate';
  v_official_url CONSTANT TEXT :=
    'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/luau/chicken-egg-pate/';
  v_retailer_url CONSTANT TEXT :=
    'https://www.chewy.com/tiki-cat-luau-chicken-egg-pate-wet/dp/526206';
  v_retailer_key CONSTANT TEXT :=
    'tiki cat|tiki cat|tiki cat luau chicken with egg pate wet cat food|cat|unknown|wet||';
  v_expected_hash CONSTANT TEXT :=
    'e764f7fbdb3ddb10734e886387dcd3fe13405f03bbb89fe92837332acf7b24be';
BEGIN
  SELECT formula.id
  INTO STRICT v_canonical
  FROM public.catalog_formulas formula
  WHERE formula.promoted_cache_key = v_cache
    AND formula.active
    AND formula.verification_status = 'verified';

  SELECT formula.id
  INTO STRICT v_duplicate
  FROM public.catalog_formulas formula
  WHERE formula.formula_key =
      'tiki cat|tiki cat|chicken and egg pate|cat|unknown|wet|chicken and egg pate|'
    AND formula.id <> v_canonical;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas canonical
    JOIN public.catalog_formulas duplicate
      ON duplicate.id = v_duplicate
    JOIN public.product_data serving
      ON serving.cache_key = v_cache
    WHERE canonical.id = v_canonical
      AND lower(regexp_replace(canonical.source_url, '/+$', '')) =
        lower(regexp_replace(v_official_url, '/+$', ''))
      AND lower(regexp_replace(duplicate.source_url, '/+$', '')) =
        lower(regexp_replace(v_official_url, '/+$', ''))
      AND canonical.pet_type = 'cat'
      AND duplicate.pet_type = 'cat'
      AND canonical.food_form = 'wet'
      AND duplicate.food_form = 'wet'
      AND canonical.ingredient_verification_status = 'manufacturer'
      AND canonical.image_verification_status = 'manufacturer'
      AND canonical.front_image_url = duplicate.front_image_url
      AND public.catalog_normalize_ingredient_evidence(
        canonical.ingredient_text
      ) = public.catalog_normalize_ingredient_evidence(
        duplicate.ingredient_text
      )
      AND public.catalog_normalize_ingredient_evidence(
        canonical.ingredient_text
      ) = public.catalog_normalize_ingredient_evidence(
        serving.ingredient_text
      )
      AND encode(
        digest(
          public.catalog_normalize_ingredient_evidence(
            canonical.ingredient_text
          ),
          'sha256'
        ),
        'hex'
      ) = v_expected_hash
      AND cardinality(canonical.ingredients) = 30
      AND serving.ingredient_count = 30
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
      AND serving.catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION
      'Tiki Luau Chicken & Egg exact manufacturer evidence changed';
  END IF;

  UPDATE public.catalog_observations
  SET formula_id = v_canonical
  WHERE formula_id = v_duplicate;

  UPDATE public.catalog_field_evidence
  SET formula_id = v_canonical
  WHERE formula_id = v_duplicate;

  UPDATE public.catalog_skus
  SET formula_id = v_canonical,
      updated_at = NOW()
  WHERE formula_id = v_duplicate;

  DELETE FROM public.catalog_census_members duplicate_member
  USING public.catalog_census_members canonical_member
  WHERE duplicate_member.formula_id = v_duplicate
    AND canonical_member.formula_id = v_canonical
    AND canonical_member.snapshot_id = duplicate_member.snapshot_id;

  UPDATE public.catalog_census_members
  SET formula_id = v_canonical
  WHERE formula_id = v_duplicate;

  DELETE FROM public.catalog_census_formula_members duplicate_member
  USING public.catalog_census_formula_members canonical_member
  WHERE duplicate_member.formula_id = v_duplicate
    AND canonical_member.formula_id = v_canonical
    AND canonical_member.snapshot_id = duplicate_member.snapshot_id;

  UPDATE public.catalog_census_formula_members
  SET formula_id = v_canonical
  WHERE formula_id = v_duplicate;

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
    alias.alias_formula_key,
    v_canonical,
    encode(digest(alias.alias_formula_key, 'sha256'), 'hex'),
    'manual_review',
    alias.source_url,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'official_source_url', v_official_url,
      'official_ingredient_hash', v_expected_hash,
      'retailer_listing_id', '526206',
      'species_boundary', 'cat',
      'food_form_boundary', 'wet',
      'texture_boundary', 'pate',
      'recipe_boundary', 'chicken and egg',
      'explicitly_excluded_sibling_texture', 'velvet mousse',
      'reviewed_at', '2026-08-03T17:35:00-07:00'::TIMESTAMPTZ
    ),
    NOW()
  FROM (
    VALUES
      (
        'tiki cat|tiki cat|chicken and egg pate|cat|unknown|wet|chicken and egg pate|',
        v_official_url
      ),
      (v_retailer_key, v_retailer_url)
  ) AS alias(alias_formula_key, source_url)
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET
    formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = NOW();

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = FALSE,
    absent_since = COALESCE(absent_since, NOW()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Superseded exact duplicate of the active Tiki Cat Luau Chicken & Egg Pate manufacturer formula.',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'duplicate_of_formula_id', v_canonical,
        'duplicate_evidence',
          'same official URL, front image, 30-item ingredient hash, species, and wet pate identity',
        'reconciled_at', NOW()
      ),
    updated_at = NOW()
  WHERE id = v_duplicate;

  UPDATE public.catalog_formulas
  SET
    product_name = 'Tiki Cat Luau Chicken & Egg Pate Wet Cat Food',
    product_line = 'luau pate',
    flavor = 'chicken and egg pate',
    pet_type = 'cat',
    life_stage = 'unknown',
    food_form = 'wet',
    protected_terms = ARRAY[
      'tiki cat', 'luau', 'pate', 'chicken', 'egg', 'cat', 'wet'
    ]::TEXT[],
    complete_food_evidence =
      'Current official Tiki Cat Chicken & Egg Pate page publishes the exact complete formula, 30 ingredients, guaranteed analysis, feeding guidance, and matching front package for 2.8 oz and 5.5 oz cans.',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source_url', v_official_url,
        'ingredient_text_hash', v_expected_hash,
        'retailer_alias_url', v_retailer_url,
        'retailer_listing_id', '526206',
        'reconciled_at', NOW()
      ),
    updated_at = NOW()
  WHERE id = v_canonical;

  UPDATE public.product_data
  SET
    product_name = 'Tiki Cat Luau Chicken & Egg Pate Wet Cat Food',
    product_line = 'Luau Pate',
    flavor = 'Chicken & Egg Pate',
    pet_type = 'cat',
    life_stage = 'unknown',
    food_form = 'wet',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source_url', v_official_url,
        'ingredient_text_hash', v_expected_hash,
        'retailer_alias_url', v_retailer_url,
        'retailer_listing_id', '526206'
      ),
    updated_at = NOW()
  WHERE cache_key = v_cache;

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
  ) VALUES (
    v_cache,
    'Tiki Cat Luau Chicken with Egg Pate Wet Cat Food',
    public.normalize_verified_product_search_query(
      'Tiki Cat Luau Chicken with Egg Pate Wet Cat Food'
    ),
    v_official_url,
    'manufacturer',
    '2026-08-03T17:35:00-07:00'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'retailer_alias_url', v_retailer_url,
      'retailer_listing_id', '526206',
      'species_boundary', 'cat',
      'food_form_boundary', 'wet',
      'texture_boundary', 'pate',
      'recipe_boundary', 'chicken and egg',
      'ingredient_text_hash', v_expected_hash
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
    SELECT count(*)
    FROM public.catalog_formulas formula
    WHERE formula.active
      AND lower(regexp_replace(formula.source_url, '/+$', '')) =
        lower(regexp_replace(v_official_url, '/+$', ''))
  ) <> 1 THEN
    RAISE EXCEPTION 'Tiki Chicken & Egg Pate duplicate formula remains active';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE sku.source_slug IN ('chewy-public-sitemap', 'walmart-public-sitemap')
      AND sku.source_external_id IN ('526206', '19217355823')
      AND sku.formula_id <> v_canonical
  ) THEN
    RAISE EXCEPTION 'Tiki Chicken & Egg Pate retailer SKU alias was not consolidated';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Tiki Cat Luau Chicken with Egg Pate Wet Cat Food',
      1
    )
  ) IS DISTINCT FROM v_cache THEN
    RAISE EXCEPTION 'Tiki Chicken & Egg Pate exact search is not rank one';
  END IF;
END;
$$;
