DO $$
DECLARE
  v_beef BIGINT;
  v_chicken BIGINT;
  v_duck BIGINT;
  v_salmon BIGINT;
  v_mixed BIGINT;
  v_target_beef BIGINT;
  v_walmart_beef BIGINT;
  v_walmart_duck BIGINT;
  v_walmart_salmon BIGINT;
  v_chewy_salmon BIGINT;
  v_beef_old_key TEXT;
  v_chicken_old_key TEXT;
  v_duck_old_key TEXT;
  v_salmon_old_key TEXT;
  v_beef_key TEXT := 'blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty beef stew|';
  v_chicken_key TEXT := 'blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|chunky chicken stew|';
  v_duck_key TEXT := 'blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty duck stew|';
  v_salmon_key TEXT := 'blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|savory salmon stew|';
  v_beef_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue wilderness sup sup wet dog food grain-free - beef wolf creek stew wilderness wolf-creek-stew-beef';
  v_chicken_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - chicken wolf creek stew wilderness wolf-creek-stew-chicken';
  v_duck_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - duck wolf creek stew wilderness wolf-creek-stew-duck';
  v_salmon_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - salmon wolf creek stew wilderness wolf-creek-stew-salmon';
  v_beef_source TEXT := 'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-beef/';
  v_chicken_source TEXT := 'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-chicken/';
  v_duck_source TEXT := 'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-duck/';
  v_salmon_source TEXT := 'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-salmon/';
  v_beef_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-beef-share.png';
  v_chicken_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-chicken-share.png';
  v_duck_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-duck-share.png';
  v_salmon_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-salmon-share.png';
BEGIN
  SELECT id, formula_key INTO STRICT v_beef, v_beef_old_key
  FROM public.catalog_formulas WHERE source_url = v_beef_source;
  SELECT id, formula_key INTO STRICT v_chicken, v_chicken_old_key
  FROM public.catalog_formulas WHERE source_url = v_chicken_source;
  SELECT id, formula_key INTO STRICT v_duck, v_duck_old_key
  FROM public.catalog_formulas WHERE source_url = v_duck_source;
  SELECT id, formula_key INTO STRICT v_salmon, v_salmon_old_key
  FROM public.catalog_formulas WHERE source_url = v_salmon_source;

  SELECT id INTO STRICT v_mixed FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew high protein adult wet dog food grain free|dog|all life stages|wet|beef|';
  SELECT id INTO STRICT v_target_beef FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew high protein natural wet dog food with hearty beef stew in gravy 12|dog|unknown|wet||';
  SELECT id INTO STRICT v_walmart_beef FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue buffalo wilderness wolf creek beef stew in gravy wet dog food|dog|unknown|wet||';
  SELECT id INTO STRICT v_walmart_duck FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew high protein grain free natural wet dog food hearty duck stew in gravy pack of 12|dog|unknown|wet||';
  SELECT id INTO STRICT v_walmart_salmon FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew high protein grain free natural wet dog food savory salmon stew in gravy pack of 12|dog|unknown|wet||';
  SELECT id INTO STRICT v_chewy_salmon FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew adult high protein grain free natural hearty savory salmon stew wet dog food|dog|adult|wet||';

  IF (
    SELECT count(*) FROM public.product_data
    WHERE cache_key IN (v_beef_cache, v_chicken_cache, v_duck_cache, v_salmon_cache)
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND catalog_exclusion_reason IS NULL
  ) <> 4 THEN
    RAISE EXCEPTION 'Wolf Creek current manufacturer rows missing';
  END IF;

  IF (
    SELECT array_agg(cardinality(ingredients) ORDER BY cache_key)
    FROM public.product_data
    WHERE cache_key IN (v_beef_cache, v_chicken_cache, v_duck_cache, v_salmon_cache)
  ) IS DISTINCT FROM ARRAY[38,36,37,35]::INTEGER[] THEN
    RAISE EXCEPTION 'Wolf Creek current ingredient-count precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data current_row
    JOIN public.product_data historical_row
      ON historical_row.cache_key = 'petsmart-retail-catalog:840243101283'
    WHERE current_row.cache_key = v_beef_cache
      AND regexp_replace(lower(array_to_string(current_row.ingredients, '')), '[^a-z0-9]+', '', 'g')
        = regexp_replace(lower(array_to_string(historical_row.ingredients, '')), '[^a-z0-9]+', '', 'g')
  ) THEN
    RAISE EXCEPTION 'Wolf Creek Beef historical GTIN ingredient equality failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE formula_key IN (v_beef_key, v_chicken_key, v_duck_key, v_salmon_key)
      AND id NOT IN (v_beef, v_chicken, v_duck, v_salmon)
  ) THEN
    RAISE EXCEPTION 'Wolf Creek exact canonical key belongs to a sibling';
  END IF;

  UPDATE public.product_data
  SET
    product_name = CASE cache_key
      WHEN v_beef_cache THEN 'BLUE Wilderness Wolf Creek Hearty Beef Stew for Dogs'
      WHEN v_chicken_cache THEN 'BLUE Wilderness Wolf Creek Chunky Chicken Stew for Dogs'
      WHEN v_duck_cache THEN 'BLUE Wilderness Wolf Creek Hearty Duck Stew for Dogs'
      ELSE 'BLUE Wilderness Wolf Creek Savory Salmon Stew for Dogs'
    END,
    brand = 'Blue Buffalo',
    product_line = 'BLUE Wilderness Wolf Creek Stew',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = CASE cache_key
      WHEN v_beef_cache THEN 'Hearty Beef Stew'
      WHEN v_chicken_cache THEN 'Chunky Chicken Stew'
      WHEN v_duck_cache THEN 'Hearty Duck Stew'
      ELSE 'Savory Salmon Stew'
    END,
    package_size = '12.5 oz can',
    source_quality = 'manufacturer',
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    verified_at = now(),
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    updated_at = now()
  WHERE cache_key IN (v_beef_cache, v_chicken_cache, v_duck_cache, v_salmon_cache);

  UPDATE public.catalog_formulas formula
  SET
    formula_key = exact.formula_key,
    product_name = exact.product_name,
    product_line = 'blue wilderness wolf creek stew',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = exact.flavor,
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Official Blue Buffalo: formulated to meet AAFCO Dog Food Nutrient Profiles for maintenance.',
    front_image_url = exact.front_image,
    source_url = exact.source_url,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'blue buffalo', 'blue wilderness', 'wolf creek stew',
      exact.flavor, 'adult', 'dog', 'wet', 'stew'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = exact.cache_key,
    promoted_at = now(),
    identity_hash = encode(digest(exact.formula_key, 'sha256'), 'hex'),
    last_observed_at = now(),
    updated_at = now()
  FROM (
    VALUES
      (v_beef, v_beef_key, 'BLUE Wilderness Wolf Creek Hearty Beef Stew for Dogs', 'hearty beef stew', v_beef_cache, v_beef_source, v_beef_front),
      (v_chicken, v_chicken_key, 'BLUE Wilderness Wolf Creek Chunky Chicken Stew for Dogs', 'chunky chicken stew', v_chicken_cache, v_chicken_source, v_chicken_front),
      (v_duck, v_duck_key, 'BLUE Wilderness Wolf Creek Hearty Duck Stew for Dogs', 'hearty duck stew', v_duck_cache, v_duck_source, v_duck_front),
      (v_salmon, v_salmon_key, 'BLUE Wilderness Wolf Creek Savory Salmon Stew for Dogs', 'savory salmon stew', v_salmon_cache, v_salmon_source, v_salmon_front)
  ) AS exact(formula_id, formula_key, product_name, flavor, cache_key, source_url, front_image)
  WHERE formula.id = exact.formula_id;

  UPDATE public.catalog_observations observation
  SET formula_id = CASE
    WHEN observation.source_slug = 'petsmart-retail-catalog'
      AND observation.source_external_id = 'petsmart-retail-catalog:840243101283' THEN v_beef
    WHEN observation.source_slug = 'chewy-public-sitemap'
      AND observation.source_external_id = '2955454' THEN v_beef
    WHEN observation.source_slug = 'target-public-sitemap'
      AND observation.source_external_id = 'A-75878629' THEN v_beef
    WHEN observation.source_slug = 'walmart-public-sitemap'
      AND observation.source_external_id = '43710153' THEN v_beef
    WHEN observation.source_slug = 'walmart-public-sitemap'
      AND observation.source_external_id IN ('138424639', '43728305') THEN v_duck
    WHEN observation.source_slug = 'chewy-public-sitemap'
      AND observation.source_external_id = '103667' THEN v_salmon
    WHEN observation.source_slug = 'walmart-public-sitemap'
      AND observation.source_external_id = '43732230' THEN v_salmon
    ELSE observation.formula_id
  END
  WHERE (
    observation.source_slug = 'petsmart-retail-catalog'
      AND observation.source_external_id = 'petsmart-retail-catalog:840243101283'
  ) OR (
    observation.source_slug = 'chewy-public-sitemap'
      AND observation.source_external_id IN ('2955454', '103667')
  ) OR (
    observation.source_slug = 'target-public-sitemap'
      AND observation.source_external_id = 'A-75878629'
  ) OR (
    observation.source_slug = 'walmart-public-sitemap'
      AND observation.source_external_id IN ('43710153', '138424639', '43728305', '43732230')
  );

  UPDATE public.catalog_skus sku
  SET
    formula_id = CASE
      WHEN sku.source_slug = 'petsmart-retail-catalog'
        AND sku.source_external_id = 'petsmart-retail-catalog:840243101283' THEN v_beef
      WHEN sku.source_slug = 'chewy-public-sitemap'
        AND sku.source_external_id = '2955454' THEN v_beef
      WHEN sku.source_slug = 'target-public-sitemap'
        AND sku.source_external_id = 'A-75878629' THEN v_beef
      WHEN sku.source_slug = 'walmart-public-sitemap'
        AND sku.source_external_id = '43710153' THEN v_beef
      WHEN sku.source_slug = 'walmart-public-sitemap'
        AND sku.source_external_id IN ('138424639', '43728305') THEN v_duck
      WHEN sku.source_slug = 'chewy-public-sitemap'
        AND sku.source_external_id = '103667' THEN v_salmon
      WHEN sku.source_slug = 'walmart-public-sitemap'
        AND sku.source_external_id = '43732230' THEN v_salmon
      ELSE sku.formula_id
    END,
    active = true,
    updated_at = now()
  WHERE (
    sku.source_slug = 'petsmart-retail-catalog'
      AND sku.source_external_id = 'petsmart-retail-catalog:840243101283'
  ) OR (
    sku.source_slug = 'chewy-public-sitemap'
      AND sku.source_external_id IN ('2955454', '103667')
  ) OR (
    sku.source_slug = 'target-public-sitemap'
      AND sku.source_external_id = 'A-75878629'
  ) OR (
    sku.source_slug = 'walmart-public-sitemap'
      AND sku.source_external_id IN ('43710153', '138424639', '43728305', '43732230')
  );

  UPDATE public.catalog_observations SET formula_id = v_beef
  WHERE formula_id IN (v_target_beef, v_walmart_beef);
  UPDATE public.catalog_skus SET formula_id = v_beef, active = true, updated_at = now()
  WHERE formula_id IN (v_target_beef, v_walmart_beef);

  UPDATE public.catalog_observations SET formula_id = v_duck
  WHERE formula_id = v_walmart_duck;
  UPDATE public.catalog_skus SET formula_id = v_duck, active = true, updated_at = now()
  WHERE formula_id = v_walmart_duck;

  UPDATE public.catalog_observations SET formula_id = v_salmon
  WHERE formula_id IN (v_walmart_salmon, v_chewy_salmon);
  UPDATE public.catalog_skus SET formula_id = v_salmon, active = true, updated_at = now()
  WHERE formula_id IN (v_walmart_salmon, v_chewy_salmon);

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  )
  SELECT alias.formula_key, alias.formula_id, formula.identity_hash,
    'manual_review', formula.source_url,
    jsonb_build_object(
      'exact_recipe_identity', true,
      'ingredient_version_verified', true,
      'reconciled_at', now()
    ), now()
  FROM (
    VALUES
      (v_beef_old_key, v_beef),
      (v_chicken_old_key, v_chicken),
      (v_duck_old_key, v_duck),
      (v_salmon_old_key, v_salmon),
      ('blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew high protein natural wet dog food with hearty beef stew in gravy 12|dog|unknown|wet||', v_beef),
      ('blue buffalo|blue buffalo|blue buffalo wilderness wolf creek beef stew in gravy wet dog food|dog|unknown|wet||', v_beef),
      ('blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew high protein grain free natural wet dog food hearty duck stew in gravy pack of 12|dog|unknown|wet||', v_duck),
      ('blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew high protein grain free natural wet dog food savory salmon stew in gravy pack of 12|dog|unknown|wet||', v_salmon),
      ('blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew adult high protein grain free natural hearty savory salmon stew wet dog food|dog|adult|wet||', v_salmon)
  ) AS alias(formula_key, formula_id)
  JOIN public.catalog_formulas formula ON formula.id = alias.formula_id
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = excluded.formula_id,
      identity_hash = excluded.identity_hash,
      match_reason = excluded.match_reason,
      source_url = excluded.source_url,
      metadata = excluded.metadata,
      updated_at = now();

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence = CASE
      WHEN id = v_mixed THEN
        'Quarantined cross-recipe retailer identity. Beef, Duck, and Salmon observations were separated into exact current manufacturer formulas; this mixed node must never resolve.'
      ELSE
        'Superseded exact retailer-title duplicate linked to its current official recipe through reviewed canonical alias.'
    END,
    updated_at = now()
  WHERE id IN (
    v_mixed, v_target_beef, v_walmart_beef, v_walmart_duck,
    v_walmart_salmon, v_chewy_salmon
  );

  UPDATE public.catalog_skus SET active = false, updated_at = now()
  WHERE formula_id IN (
    v_mixed, v_target_beef, v_walmart_beef, v_walmart_duck,
    v_walmart_salmon, v_chewy_salmon
  );

  UPDATE public.catalog_skus
  SET active = false, updated_at = now()
  WHERE formula_id IN (v_beef, v_chicken, v_duck, v_salmon)
    AND source_slug = 'blue-buffalo-general-mills'
    AND package_size = ''
    AND gtin IS NULL;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (v_beef, NULL, '12.5 oz can', 1, 'blue-buffalo-general-mills', '111210292:12.5oz', v_beef_source, true, now(), now(), now()),
    (v_chicken, NULL, '12.5 oz can', 1, 'blue-buffalo-general-mills', '111210293:12.5oz', v_chicken_source, true, now(), now(), now()),
    (v_duck, NULL, '12.5 oz can', 1, 'blue-buffalo-general-mills', '111210294:12.5oz', v_duck_source, true, now(), now(), now()),
    (v_salmon, NULL, '12.5 oz can', 1, 'blue-buffalo-general-mills', '111210295:12.5oz', v_salmon_source, true, now(), now(), now())
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
  SET formula_id = excluded.formula_id, source_url = excluded.source_url,
      active = true, last_observed_at = now(), updated_at = now();

  UPDATE public.catalog_skus
  SET formula_id = v_beef, active = true, updated_at = now()
  WHERE regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') = '840243101283';

  UPDATE public.product_data
  SET
    is_complete_food = false,
    catalog_exclusion_reason = 'duplicate_alias_of_verified_formula',
    ingredient_verification_status = 'unverified',
    image_verification_status = 'unverified',
    expires_at = now(),
    updated_at = now()
  WHERE cache_key IN (
    'petsmart-retail-catalog:840243101283',
    'blue buffalo wilderness wolf creek stew wet highprotein amp grainfree made with natural ingredients hearty beef in gravy 125oz cans',
    'blue buffalo blue buffalo wilderness wolf creek stew wet highprotein amp grainfreemade with natural ingredientshearty beef in gravy125oz canspack of 24'
  );

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance
  )
  SELECT alias.cache_key, alias.alias_text,
    public.normalize_verified_product_search_query(alias.alias_text),
    alias.source_url, 'manufacturer', now(),
    jsonb_build_object(
      'source', 'current_official_product_page',
      'recipe_boundary', alias.recipe,
      'food_form_boundary', 'wet',
      'species_boundary', 'dog'
    )
  FROM (
    VALUES
      (v_beef_cache, 'Blue Buffalo Wilderness Wolf Creek Stew Hearty Beef Wet Dog Food', v_beef_source, 'hearty beef stew'),
      (v_chicken_cache, 'Blue Buffalo Wilderness Wolf Creek Stew Chunky Chicken Wet Dog Food', v_chicken_source, 'chunky chicken stew'),
      (v_duck_cache, 'Blue Buffalo Wilderness Wolf Creek Stew Hearty Duck Wet Dog Food', v_duck_source, 'hearty duck stew'),
      (v_salmon_cache, 'Blue Buffalo Wilderness Wolf Creek Stew Savory Salmon Wet Dog Food', v_salmon_source, 'savory salmon stew')
  ) AS alias(cache_key, alias_text, source_url, recipe)
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = excluded.cache_key, alias_text = excluded.alias_text,
      source_url = excluded.source_url, source_authority = excluded.source_authority,
      evidence_observed_at = excluded.evidence_observed_at,
      provenance = excluded.provenance, updated_at = now();

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE formula_id = v_mixed
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus WHERE formula_id = v_mixed AND active
  ) THEN
    RAISE EXCEPTION 'Wolf Creek mixed retailer identity still owns observations or active SKUs';
  END IF;

  IF (
    SELECT count(*) FROM public.catalog_formulas
    WHERE id IN (v_beef, v_chicken, v_duck, v_salmon)
      AND active AND verification_status = 'verified'
      AND promoted_cache_key IS NOT NULL
      AND life_stage = 'adult' AND food_form = 'wet'
  ) <> 4 THEN
    RAISE EXCEPTION 'Wolf Creek current recipe formulas were not promoted';
  END IF;

  IF (
    SELECT count(*) FROM public.catalog_skus
    WHERE formula_id = v_beef AND active
      AND regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') = '840243101283'
  ) <> 1 THEN
    RAISE EXCEPTION 'Wolf Creek exact Beef GTIN was not linked once';
  END IF;
END
$$;
