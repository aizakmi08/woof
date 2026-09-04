-- Reconcile two structurally complete Target BLUE Basics packages. Salmon
-- 4 lb differs from manufacturer current and remains a retailer_web_version;
-- Large Breed Lamb 22 lb is ingredient-equivalent to manufacturer current and
-- becomes a SKU child. Malformed/reused-GTIN siblings stay quarantined.

DO $$
DECLARE
  v_row RECORD;
  v_observation public.catalog_observations%ROWTYPE;
  v_formula_id BIGINT;
  v_current_id BIGINT;
  v_observed_at TIMESTAMPTZ := '2026-07-27T03:25:00Z';
  v_hash TEXT;
  v_current_hash TEXT;
BEGIN
  FOR v_row IN
    SELECT *
    FROM (VALUES
      (
        '76342809',
        '840243105427',
        '4 lb',
        'blue buffalo|blue buffalo|blue buffalo basics limited ingredient diet grain free salmon potato recipe adult dry dog food|dog|adult|dry||',
        'target-retail-catalog:840243105427',
        'blue-buffalo-general-mills:blue buffalo blue basics dry dog food grain-free - salmon potato basics grain-free-salmon-potato-recipe',
        'BLUE Basics Skin & Stomach Care Grain-Free Adult Dry',
        'Salmon & Potato',
        '66218f144a355ade5440d506377a66ff82d863ff2e2e990d0bd7f5d721dab725',
        'Blue Buffalo Basics Limited Ingredient Diet Grain Free Salmon Potato Recipe Adult Dry Dog Food'
      )
    ) AS x(
      tcin, gtin, package_size, gap_formula_key, retailer_cache_key,
      current_cache_key, product_line, flavor, expected_hash,
      generic_search_name
    )
  LOOP
    SELECT * INTO STRICT v_observation
    FROM public.catalog_observations
    WHERE source_slug = 'target-blue-buffalo-review'
      AND source_external_id = v_row.tcin
      AND gtin = v_row.gtin
      AND validation_status = 'quarantined';

    v_hash := encode(digest(
      public.catalog_normalize_ingredient_evidence(v_observation.ingredient_text),
      'sha256'
    ), 'hex');
    IF v_hash <> v_row.expected_hash THEN
      RAISE EXCEPTION 'Target BLUE Basics evidence hash changed for %', v_row.tcin;
    END IF;

    SELECT id, encode(digest(
      public.catalog_normalize_ingredient_evidence(COALESCE(ingredient_text,'')),
      'sha256'
    ), 'hex')
    INTO STRICT v_current_id, v_current_hash
    FROM public.catalog_formulas
    WHERE promoted_cache_key = v_row.current_cache_key
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND verification_status = 'verified' AND active;

    IF v_current_hash = v_hash THEN
      RAISE EXCEPTION 'Target package unexpectedly equals manufacturer current for %', v_row.tcin;
    END IF;

    SELECT id INTO STRICT v_formula_id
    FROM public.catalog_formulas
    WHERE formula_key = v_row.gap_formula_key
      AND verification_status <> 'verified';

    IF EXISTS (
      SELECT 1 FROM public.catalog_skus
      WHERE gtin = v_row.gtin AND active AND formula_id <> v_formula_id
    ) THEN
      RAISE EXCEPTION 'Target BLUE Basics UPC already belongs to another formula: %', v_row.gtin;
    END IF;

    INSERT INTO public.product_data (
      cache_key, product_name, brand, ingredients, ingredient_text,
      ingredient_count, source, source_url, scraped_at, expires_at, image_url,
      nutrient_panel, nutritional_info, has_published_nutrients,
      is_complete_food, catalog_exclusion_reason, pet_type, source_quality,
      ingredient_verification_status, image_verification_status, verified_at,
      gtin, product_line, flavor, life_stage, food_form, package_size,
      formula_evidence_tier, formula_version_provenance, updated_at
    ) VALUES (
      v_row.retailer_cache_key, v_observation.product_name, 'Blue Buffalo',
      public.catalog_split_ingredient_statement(v_observation.ingredient_text),
      v_observation.ingredient_text,
      cardinality(public.catalog_split_ingredient_statement(v_observation.ingredient_text)),
      'target-retail-label-review', v_observation.source_url, v_observed_at,
      now() + INTERVAL '180 days', v_observation.front_image_url,
      '{}'::JSONB,
      jsonb_build_object('formula_evidence_tier','retailer_web_version'),
      false, true, NULL, 'dog', 'retailer_verified', 'retailer_verified',
      'retailer_verified', v_observed_at, v_row.gtin, v_row.product_line,
      v_row.flavor, 'adult', 'dry', v_row.package_size,
      'retailer_web_version',
      jsonb_build_object(
        'version_status','source_versioned',
        'manufacturer_current_equivalence',false,
        'source_url',v_observation.source_url,
        'captured_at',v_observed_at,
        'package_gtin',v_row.gtin,
        'product_code','TCIN '||v_row.tcin,
        'package_size',v_row.package_size,
        'front_image_url',v_observation.front_image_url,
        'ingredient_text_hash',v_hash,
        'different_from_manufacturer_current_hash',v_current_hash
      ),
      now()
    )
    ON CONFLICT (cache_key) DO UPDATE SET
      product_name=excluded.product_name, brand=excluded.brand,
      ingredients=excluded.ingredients, ingredient_text=excluded.ingredient_text,
      ingredient_count=excluded.ingredient_count, source=excluded.source,
      source_url=excluded.source_url, scraped_at=excluded.scraped_at,
      expires_at=excluded.expires_at, image_url=excluded.image_url,
      nutritional_info=excluded.nutritional_info, is_complete_food=true,
      catalog_exclusion_reason=NULL, pet_type='dog',
      source_quality='retailer_verified',
      ingredient_verification_status='retailer_verified',
      image_verification_status='retailer_verified',
      verified_at=excluded.verified_at, gtin=excluded.gtin,
      product_line=excluded.product_line, flavor=excluded.flavor,
      life_stage='adult', food_form='dry', package_size=excluded.package_size,
      formula_evidence_tier='retailer_web_version',
      formula_version_provenance=excluded.formula_version_provenance,
      updated_at=now();

    UPDATE public.catalog_formulas SET
      manufacturer='blue buffalo', brand='blue buffalo',
      product_name=v_observation.product_name,
      product_line=v_row.product_line, pet_type='dog', life_stage='adult',
      food_form='dry', flavor=lower(v_row.flavor), diet_condition='',
      is_complete_food=true,
      complete_food_evidence=
        'Exact Target dry dog-food PDP package identity, full structured ingredient statement, and matching front image.',
      ingredient_text=v_observation.ingredient_text,
      ingredients=public.catalog_split_ingredient_statement(v_observation.ingredient_text),
      front_image_url=v_observation.front_image_url,
      source_url=v_observation.source_url,
      source_authority='retailer_verified',
      protected_terms=ARRAY[
        'blue buffalo','basics','skin stomach care','dog','adult','dry',
        lower(v_row.flavor)
      ]::TEXT[],
      verification_status='verified', active=true, absent_since=NULL,
      promoted_cache_key=v_row.retailer_cache_key, promoted_at=v_observed_at,
      formula_evidence_tier='retailer_web_version',
      formula_version_provenance=jsonb_build_object(
        'version_status','source_versioned',
        'manufacturer_current_equivalence',false,
        'source_url',v_observation.source_url,
        'captured_at',v_observed_at,
        'package_gtin',v_row.gtin,
        'product_code','TCIN '||v_row.tcin,
        'package_size',v_row.package_size,
        'front_image_url',v_observation.front_image_url,
        'ingredient_text_hash',v_hash,
        'different_from_manufacturer_current_hash',v_current_hash
      ),
      last_observed_at=v_observed_at, updated_at=now()
    WHERE id=v_formula_id;

    UPDATE public.catalog_observations SET
      formula_id=v_formula_id, manufacturer='blue buffalo',
      brand='blue buffalo', product_line=v_row.product_line,
      pet_type='dog', life_stage='adult', food_form='dry',
      flavor=lower(v_row.flavor), package_size=v_row.package_size,
      validation_status='accepted', validation_reasons=ARRAY[]::TEXT[],
      formula_evidence_tier='retailer_web_version',
      formula_version_provenance=jsonb_build_object(
        'version_status','source_versioned',
        'manufacturer_current_equivalence',false,
        'package_gtin',v_row.gtin,'product_code','TCIN '||v_row.tcin,
        'captured_at',v_observed_at,'ingredient_text_hash',v_hash
      ),
      observed_at=v_observed_at
    WHERE id=v_observation.id;

    INSERT INTO public.catalog_skus (
      formula_id,gtin,package_size,package_count,source_slug,
      source_external_id,source_url,active,first_observed_at,
      last_observed_at,updated_at
    ) VALUES (
      v_formula_id,v_row.gtin,v_row.package_size,1,
      'target-retail-label-review','TCIN:'||v_row.tcin,
      v_observation.source_url,true,v_observed_at,v_observed_at,now()
    )
    ON CONFLICT (source_slug,source_external_id,gtin,package_size)
    DO UPDATE SET formula_id=excluded.formula_id,source_url=excluded.source_url,
      active=true,last_observed_at=excluded.last_observed_at,updated_at=now();

    INSERT INTO public.catalog_verified_product_search_aliases (
      cache_key,alias_text,normalized_alias,source_url,source_authority,
      evidence_observed_at,provenance,active,created_at,updated_at
    ) VALUES
      (
        v_row.current_cache_key,v_row.generic_search_name,
        public.normalize_verified_product_search_query(v_row.generic_search_name),
        (SELECT source_url FROM public.product_data WHERE cache_key=v_row.current_cache_key),
        'manufacturer',v_observed_at,
        jsonb_build_object('generic_name_prefers_manufacturer_current',true),
        true,now(),now()
      ),
      (
        v_row.retailer_cache_key,
        'Target TCIN '||v_row.tcin||' '||v_observation.product_name||' '||v_row.package_size,
        public.normalize_verified_product_search_query(
          'Target TCIN '||v_row.tcin||' '||v_observation.product_name||' '||v_row.package_size
        ),
        v_observation.source_url,'retailer_verified',v_observed_at,
        jsonb_build_object(
          'formula_evidence_tier','retailer_web_version',
          'package_gtin',v_row.gtin,'product_code','TCIN '||v_row.tcin,
          'manufacturer_current_equivalence',false
        ),
        true,now(),now()
      )
    ON CONFLICT (normalized_alias) WHERE active DO UPDATE SET
      cache_key=excluded.cache_key,alias_text=excluded.alias_text,
      source_url=excluded.source_url,source_authority=excluded.source_authority,
      evidence_observed_at=excluded.evidence_observed_at,
      provenance=excluded.provenance,updated_at=now();
  END LOOP;

  -- The exact Target Large Breed Lamb package normalizes ingredient-identical
  -- to manufacturer current, so it is a SKU child rather than a new version.
  SELECT * INTO STRICT v_observation
  FROM public.catalog_observations
  WHERE source_slug='target-blue-buffalo-review'
    AND source_external_id='76341630'
    AND gtin='840243100064'
    AND validation_status='quarantined';

  SELECT id, encode(digest(
    public.catalog_normalize_ingredient_evidence(COALESCE(ingredient_text,'')),
    'sha256'
  ), 'hex')
  INTO STRICT v_current_id, v_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key =
    'blue-buffalo-general-mills:blue buffalo blue basics large breed adult dry dog food - grain-free lamb potato basics large-breed-grain-free-lamb-potato-recipe'
    AND formula_evidence_tier='manufacturer_current_exact'
    AND verification_status='verified' AND active;

  v_hash := encode(digest(
    public.catalog_normalize_ingredient_evidence(v_observation.ingredient_text),
    'sha256'
  ), 'hex');
  IF v_hash <> 'dfade0479b177d5d1ef39cf6e45a113ad22d6c683c57c70c19cf190a1f3da5e0'
     OR v_hash <> v_current_hash
  THEN
    RAISE EXCEPTION 'Target Large Breed Lamb package no longer equals current';
  END IF;

  SELECT id INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo basics skin 38 stomach care grain free natural lamb 38 potato recipe large breed dry dog food|dog|unknown|dry||'
    AND verification_status <> 'verified';

  IF EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE gtin='840243100064' AND active AND formula_id <> v_current_id
  ) THEN
    RAISE EXCEPTION 'Large Breed Lamb UPC already belongs to another formula';
  END IF;

  INSERT INTO public.catalog_skus (
    formula_id,gtin,package_size,package_count,source_slug,
    source_external_id,source_url,active,first_observed_at,
    last_observed_at,updated_at
  ) VALUES (
    v_current_id,'840243100064','22 lb',1,'target-retail-label-review',
    'TCIN:76341630',v_observation.source_url,true,v_observed_at,
    v_observed_at,now()
  )
  ON CONFLICT (source_slug,source_external_id,gtin,package_size)
  DO UPDATE SET formula_id=excluded.formula_id,source_url=excluded.source_url,
    active=true,last_observed_at=excluded.last_observed_at,updated_at=now();

  UPDATE public.catalog_observations SET
    formula_id=v_current_id,manufacturer='general mills',brand='blue buffalo',
    product_line='BLUE Basics Large Breed Adult Dry',
    pet_type='dog',life_stage='adult',food_form='dry',
    flavor='lamb and potato',package_size='22 lb',
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    formula_evidence_tier='manufacturer_current_exact',
    formula_version_provenance=jsonb_build_object(
      'version_status','manufacturer_current_equivalent_package',
      'manufacturer_current_equivalence',true,
      'package_gtin','840243100064','product_code','TCIN 76341630',
      'captured_at',v_observed_at,'ingredient_text_hash',v_hash
    ),
    observed_at=v_observed_at
  WHERE id=v_observation.id;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,
    metadata,updated_at
  ) VALUES (
    'blue buffalo|blue buffalo|blue buffalo basics skin 38 stomach care grain free natural lamb 38 potato recipe large breed dry dog food|dog|unknown|dry||',
    v_current_id,
    encode(digest(
      'general mills|blue buffalo|blue basics large breed adult dry dog food grain free lamb and potato|dog|adult|dry|lamb and potato|',
      'sha256'
    ),'hex'),
    'manual_review',v_observation.source_url,
    jsonb_build_object(
      'ingredient_hash_equality_verified',true,
      'package_sizes_are_sku_children',true,
      'reviewed_at','2026-07-26'
    ),now()
  )
  ON CONFLICT (alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence=
      'Exact Target package is ingredient-equivalent to the manufacturer-current canonical formula.',
    updated_at=now()
  WHERE id=v_formula_id;

  IF (
    SELECT cache_key FROM public.resolve_verified_product_by_gtin(
      '840243105427',8
    ) LIMIT 1
  ) IS DISTINCT FROM 'target-retail-catalog:840243105427'
     OR (
       SELECT cache_key FROM public.resolve_verified_product_by_gtin(
         '840243100064',8
       ) LIMIT 1
     ) IS DISTINCT FROM
       'blue-buffalo-general-mills:blue buffalo blue basics large breed adult dry dog food - grain-free lamb potato basics large-breed-grain-free-lamb-potato-recipe'
  THEN
    RAISE EXCEPTION 'Target BLUE Basics package barcode resolution failed';
  END IF;
END
$$;
