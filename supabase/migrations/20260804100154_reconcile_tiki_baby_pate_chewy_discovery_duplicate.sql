-- Canonicalize a second Chewy sitemap discovery of the exact Tiki Cat Baby
-- Pâté package. This discovered row has no ingredients or SKU evidence and
-- points to the same exact Chewy PDP/image already reviewed against the
-- current manufacturer Pâté formula. It is a duplicate discovery identity,
-- not another ingredient formula.

DO $migration$
DECLARE
  v_duplicate_key CONSTANT TEXT :=
    'tiki cat|tiki cat|chicken salmon and chicken liver recipe|cat|kitten|unknown|salmon and chicken liver recipe|';
  v_canonical_key CONSTANT TEXT :=
    'whitebridge pet brands|tiki cat|tiki cat baby pate chicken salmon and chicken liver recipe tiki cat wet food mousse shreds kitten chicken salmon chicken liver|cat|kitten|wet|chicken salmon and chicken liver recipe|';
  v_official_url CONSTANT TEXT :=
    'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/chicken-salmon-chicken-liver/';
  v_chewy_url CONSTANT TEXT :=
    'https://www.chewy.com/tiki-cat-baby-chicken-salmon-chicken/dp/1043318';
  v_canonical_cache CONSTANT TEXT :=
    'tiki-pets:tiki cat chicken salmon chicken liver recipe kitten chicken-salmon-chicken-liver';
  v_ingredient_hash CONSTANT TEXT :=
    '81e5c1d751a966c53203b2aaa693d4ff';
  v_canonical_id BIGINT;
  v_duplicate_id BIGINT;
  v_observation_id BIGINT;
  v_top TEXT;
BEGIN
  SELECT id INTO STRICT v_canonical_id
  FROM public.catalog_formulas
  WHERE formula_key = v_canonical_key
    AND source_url = v_official_url
    AND product_line = 'Tiki Cat Baby Pâté'
    AND pet_type = 'cat'
    AND life_stage = 'kitten'
    AND food_form = 'wet'
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active
    AND promoted_cache_key = v_canonical_cache
    AND md5(ingredient_text) = v_ingredient_hash;

  SELECT id INTO STRICT v_duplicate_id
  FROM public.catalog_formulas
  WHERE formula_key = v_duplicate_key
    AND source_url = v_chewy_url
    AND brand = 'tiki cat'
    AND pet_type = 'cat'
    AND life_stage = 'kitten'
    AND food_form = 'unknown'
    AND active
    AND verification_status = 'discovered'
    AND formula_evidence_tier = 'unverified'
    AND promoted_cache_key IS NULL
    AND ingredient_text = ''
    AND cardinality(ingredients) = 0;

  IF v_duplicate_id = v_canonical_id THEN
    RAISE EXCEPTION 'Tiki Baby Pâté duplicate resolved to the canonical formula';
  END IF;

  SELECT id INTO STRICT v_observation_id
  FROM public.catalog_observations
  WHERE formula_id = v_duplicate_id
    AND source_slug = 'chewy-public-sitemap'
    AND source_external_id = '1043318'
    AND source_url = v_chewy_url
    AND pet_type = 'cat'
    AND life_stage = 'kitten'
    AND validation_status = 'accepted'
    AND formula_evidence_tier = 'unverified'
    AND ingredient_text = '';

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE formula_id = v_duplicate_id
      AND id <> v_observation_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus WHERE formula_id = v_duplicate_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_field_evidence WHERE formula_id = v_duplicate_id
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Pâté discovery duplicate accumulated unexpected evidence';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key = v_duplicate_key
      AND formula_id <> v_canonical_id
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Pâté duplicate key already aliases an incompatible formula';
  END IF;

  UPDATE public.catalog_observations
  SET formula_id = v_canonical_id
  WHERE id = v_observation_id;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key,
    formula_id,
    identity_hash,
    match_reason,
    source_url,
    metadata,
    updated_at
  ) VALUES (
    v_duplicate_key,
    v_canonical_id,
    encode(digest(v_duplicate_key, 'sha256'), 'hex'),
    'manual_review',
    v_chewy_url,
    jsonb_build_object(
      'reason', 'exact Chewy Pâté discovery URL and front image match the reviewed current manufacturer Pâté formula',
      'exact_product_url_match', TRUE,
      'texture_boundary', 'pâté',
      'species_boundary', 'cat',
      'life_stage_boundary', 'kitten',
      'ingredient_source_url', v_official_url,
      'ingredient_hash', v_ingredient_hash,
      'package_size_is_sku_only', TRUE,
      'reviewed_at', NOW()
    ),
    NOW()
  )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = EXCLUDED.formula_id,
      identity_hash = EXCLUDED.identity_hash,
      match_reason = EXCLUDED.match_reason,
      source_url = EXCLUDED.source_url,
      metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
      updated_at = NOW()
  WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

  UPDATE public.catalog_formulas
  SET verification_status = 'quarantined',
      active = FALSE,
      absent_since = COALESCE(absent_since, NOW()),
      promoted_cache_key = NULL,
      promoted_at = NULL,
      complete_food_evidence =
        'Reviewed duplicate Chewy discovery of the canonical Tiki Cat Baby Pâté Chicken, Salmon & Chicken Liver formula.',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'duplicate_of_formula_id', v_canonical_id,
          'duplicate_evidence',
            'same exact Chewy PDP and Pâté package image; current ingredients remain sourced from the exact manufacturer formula',
          'canonical_source_url', v_official_url,
          'retailer_source_url', v_chewy_url,
          'reconciled_at', NOW()
        ),
      updated_at = NOW()
  WHERE id = v_duplicate_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_duplicate_id
      AND NOT active
      AND verification_status = 'quarantined'
      AND promoted_cache_key IS NULL
      AND formula_version_provenance->>'duplicate_of_formula_id' = v_canonical_id::TEXT
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_observations WHERE formula_id = v_duplicate_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus WHERE formula_id = v_duplicate_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_field_evidence WHERE formula_id = v_duplicate_id
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Pâté discovery duplicate was not fully canonicalized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE id = v_observation_id
      AND formula_id = v_canonical_id
      AND source_url = v_chewy_url
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key = v_duplicate_key
      AND formula_id = v_canonical_id
      AND source_url = v_chewy_url
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Pâté canonical observation/alias postcondition failed';
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Tiki Cat Baby Pate Chicken Salmon Chicken Liver Recipe Wet Kitten Food',
    5
  )
  ORDER BY rank DESC
  LIMIT 1;

  IF v_top IS DISTINCT FROM v_canonical_cache THEN
    RAISE EXCEPTION 'Tiki Baby Pâté exact search returned %', v_top;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.search_verified_products(
      'Tiki Cat Baby Chicken Salmon Chicken Liver Recipe',
      8
    )
    WHERE cache_key IN (
      v_canonical_cache,
      'tiki-pets:tiki-cat-baby-mousse-shreds-chicken-salmon-chicken-liver'
    )
  ) THEN
    RAISE EXCEPTION 'Tiki Baby generic recipe search no longer abstains across textures';
  END IF;
END
$migration$;
