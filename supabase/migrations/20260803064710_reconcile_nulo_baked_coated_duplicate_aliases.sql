-- Collapse older Nulo Baked & Coated serving identities onto the exact
-- current manufacturer formulas. The legacy rows have the same ingredient
-- formula and package image, but truncate protected recipe terms and/or omit
-- life-stage and dry-kibble boundaries.

DO $$
DECLARE
  v_expected CONSTANT INTEGER := 10;
  v_valid INTEGER;
  v_updated INTEGER;
  v_aliases INTEGER;
  v_search_failures INTEGER;
BEGIN
  CREATE TEMP TABLE nulo_baked_coated_alias_map (
    canonical_key TEXT PRIMARY KEY,
    legacy_key TEXT UNIQUE NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO nulo_baked_coated_alias_map (canonical_key, legacy_key)
  VALUES
    (
      'nulo:nulo medalseries baked coated beef pork lamb recipe for dogs products medalseries-baked-and-coated-beef-pork-lamb-recipe-for-dogs',
      'nulo:nulo medalseries baked coated adult beef pork lamb recipe'
    ),
    (
      'nulo:nulo medalseries baked coated chicken duck turkey recipe for dogs products medalseries-baked-and-coated-chicken-duck-turkey-recipe-for-dogs',
      'nulo:nulo medalseries baked coated adult chicken duck turkey recipe'
    ),
    (
      'nulo:nulo medalseries baked coated salmon chicken recipe for cats products medalseries-baked-and-coated-salmon-chicken-recipe-for-cats',
      'nulo:nulo medalseries baked coated adult salmon chicken recipe'
    ),
    (
      'nulo:nulo medalseries baked coated salmon chicken turkey recipe for dogs products medalseries-baked-and-coated-salmon-chicken-turkey-recipe-for-dogs',
      'nulo:nulo medalseries baked coated adult salmon chicken turkey recipe'
    ),
    (
      'nulo:nulo medalseries kitten baked coated chicken turkey duck recipe for cats products medalseries-kitten-baked-and-coated-chicken-turkey-duck-recipe-for-cats',
      'nulo:nulo medalseries baked coated kitten chicken turkey duck recipe'
    ),
    (
      'nulo:nulo medalseries large breed puppy baked coated chicken duck turkey recipe for dogs products medalseries-large-breed-puppy-baked-and-coated-chicken-duck-turkey-recipe-for-dogs',
      'nulo:nulo medalseries baked coated large breed chicken duck turkey'
    ),
    (
      'nulo:nulo medalseries large breed puppy baked coated whitefish chicken turkey recipe for dogs products medalseries-large-breed-puppy-baked-and-coated-whitefish-chicken-turkey-recipe-for-dogs',
      'nulo:nulo medalseries baked coated large breed whitefish chicken turkey'
    ),
    (
      'nulo:nulo medalseries puppy baked coated turkey chicken duck recipe for dogs products medalseries-puppy-baked-and-coated-turkey-chicken-duck-recipe-for-dogs',
      'nulo:nulo medalseries baked coated puppy turkey chicken duck recipe'
    ),
    (
      'nulo:nulo medalseries small breed baked coated chicken duck turkey recipe for dogs products medalseries-small-breed-baked-and-coated-chicken-duck-turkey-recipe-for-dogs',
      'nulo:nulo medalseries baked coated small breed chicken duck turkey recipe'
    ),
    (
      'nulo:nulo medalseries small breed baked coated salmon chicken duck recipe for dogs products medalseries-small-breed-baked-and-coated-salmon-chicken-duck-recipe-for-dogs',
      'nulo:nulo medalseries baked coated small breed salmon chicken duck recipe'
    );

  SELECT count(*) INTO v_valid
  FROM nulo_baked_coated_alias_map m
  JOIN public.product_data canonical ON canonical.cache_key = m.canonical_key
  JOIN public.product_data legacy ON legacy.cache_key = m.legacy_key
  WHERE canonical.brand = 'Nulo'
    AND legacy.brand = 'Nulo'
    AND canonical.pet_type = legacy.pet_type
    AND canonical.food_form = 'dry'
    AND canonical.ingredient_verification_status = 'manufacturer'
    AND canonical.image_verification_status = 'manufacturer'
    AND canonical.source_url = legacy.source_url
    AND regexp_replace(lower(canonical.ingredient_text), '[^a-z0-9]+', '', 'g') =
        regexp_replace(lower(legacy.ingredient_text), '[^a-z0-9]+', '', 'g')
    AND split_part(canonical.image_url, '?', 1) =
        split_part(legacy.image_url, '?', 1);

  IF v_valid <> v_expected THEN
    RAISE EXCEPTION 'Expected % exact Nulo duplicate pairs, validated %',
      v_expected, v_valid;
  END IF;

  UPDATE public.product_data legacy
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'duplicate_exact_verified_formula_alias',
    ingredient_verification_status = 'unverified',
    image_verification_status = 'unverified',
    updated_at = NOW()
  FROM nulo_baked_coated_alias_map m
  WHERE legacy.cache_key = m.legacy_key;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'Expected to exclude % Nulo aliases, updated %',
      v_expected, v_updated;
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
    m.canonical_key,
    legacy.product_name,
    public.normalize_verified_product_search_query(legacy.product_name),
    canonical.source_url,
    'manufacturer',
    '2026-08-03T06:44:30.222Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'legacy_truncated_identity_repaired', TRUE,
      'food_form_boundary', 'dry',
      'protected_recipe', canonical.flavor
    ),
    TRUE,
    NOW()
  FROM nulo_baked_coated_alias_map m
  JOIN public.product_data canonical ON canonical.cache_key = m.canonical_key
  JOIN public.product_data legacy ON legacy.cache_key = m.legacy_key
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET
    cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = EXCLUDED.provenance,
    updated_at = NOW();
  GET DIAGNOSTICS v_aliases = ROW_COUNT;

  IF v_aliases <> v_expected THEN
    RAISE EXCEPTION 'Expected to reconcile % Nulo search aliases, wrote %',
      v_expected, v_aliases;
  END IF;

  SELECT count(*) INTO v_search_failures
  FROM nulo_baked_coated_alias_map m
  JOIN public.product_data canonical ON canonical.cache_key = m.canonical_key
  WHERE (
    SELECT cache_key
    FROM public.search_verified_products(canonical.product_name, 1)
  ) IS DISTINCT FROM m.canonical_key
    OR EXISTS (
      SELECT 1
      FROM public.search_verified_products(canonical.product_name, 10)
      WHERE cache_key = m.legacy_key
    );

  IF v_search_failures <> 0 THEN
    RAISE EXCEPTION '% Nulo Baked & Coated exact-search regressions remain',
      v_search_failures;
  END IF;
END;
$$;
