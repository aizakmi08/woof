-- Preserve the legacy manufacturer-census normalization of the exact Tiki Cat
-- Baby Pâté page as an alias of the reviewed current Pâté formula. The URL,
-- front image, 32-item ingredient statement, species, life stage, form, and
-- recipe are identical. The distinct Mousse & Shreds page/formula is excluded.

DO $migration$
DECLARE
  v_alias_key CONSTANT TEXT :=
    'tiki cat|tiki cat|chicken salmon and chicken liver recipe tiki cat wet food mousse shreds kitten chicken salmon chicken liver|cat|kitten|wet|salmon and chicken liver recipe|';
  v_canonical_key CONSTANT TEXT :=
    'whitebridge pet brands|tiki cat|tiki cat baby pate chicken salmon and chicken liver recipe tiki cat wet food mousse shreds kitten chicken salmon chicken liver|cat|kitten|wet|chicken salmon and chicken liver recipe|';
  v_official_url CONSTANT TEXT :=
    'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/chicken-salmon-chicken-liver/';
  v_image_url CONSTANT TEXT :=
    'https://tikipets.com/wp-content/uploads/2024/03/Babypatesalmongroupimage.png';
  v_cache_key CONSTANT TEXT :=
    'tiki-pets:tiki cat chicken salmon chicken liver recipe kitten chicken-salmon-chicken-liver';
  v_ingredient_hash CONSTANT TEXT :=
    '81e5c1d751a966c53203b2aaa693d4ff';
  v_canonical_id BIGINT;
  v_top TEXT;
BEGIN
  SELECT id INTO STRICT v_canonical_id
  FROM public.catalog_formulas
  WHERE formula_key = v_canonical_key
    AND source_url = v_official_url
    AND front_image_url = v_image_url
    AND product_line = 'Tiki Cat Baby Pâté'
    AND flavor = 'Chicken, Salmon & Chicken Liver Recipe'
    AND pet_type = 'cat'
    AND life_stage = 'kitten'
    AND food_form = 'wet'
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active
    AND promoted_cache_key = v_cache_key
    AND md5(ingredient_text) = v_ingredient_hash
    AND cardinality(ingredients) = 32;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key = v_alias_key
      AND formula_id <> v_canonical_id
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Pâté census identity aliases an incompatible formula';
  END IF;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key,
    formula_id,
    identity_hash,
    match_reason,
    source_url,
    metadata,
    updated_at
  ) VALUES (
    v_alias_key,
    v_canonical_id,
    encode(digest(v_alias_key, 'sha256'), 'hex'),
    'manual_review',
    v_official_url,
    jsonb_build_object(
      'reason', 'legacy manufacturer-census normalization of the exact current Tiki Cat Baby Pâté formula',
      'exact_product_url_match', TRUE,
      'exact_front_image_match', TRUE,
      'ingredient_hash', v_ingredient_hash,
      'ingredient_count', 32,
      'texture_boundary', 'pâté',
      'excluded_texture_sibling', 'mousse & shreds',
      'species_boundary', 'cat',
      'life_stage_boundary', 'kitten',
      'food_form_boundary', 'wet',
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key = v_alias_key
      AND formula_id = v_canonical_id
      AND source_url = v_official_url
      AND metadata->>'ingredient_hash' = v_ingredient_hash
      AND metadata->>'texture_boundary' = 'pâté'
      AND metadata->>'excluded_texture_sibling' = 'mousse & shreds'
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Pâté census alias postcondition failed';
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Tiki Cat Baby Pate Chicken Salmon Chicken Liver Recipe Wet Kitten Food',
    5
  )
  ORDER BY rank DESC
  LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION 'Tiki Baby Pâté exact search returned %', v_top;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.search_verified_products(
      'Tiki Cat Baby Chicken Salmon Chicken Liver Recipe',
      8
    )
    WHERE cache_key IN (
      v_cache_key,
      'tiki-pets:tiki-cat-baby-mousse-shreds-chicken-salmon-chicken-liver'
    )
  ) THEN
    RAISE EXCEPTION 'Tiki Baby generic recipe search no longer abstains across textures';
  END IF;
END
$migration$;
