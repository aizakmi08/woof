DO $$
DECLARE
  v_formula BIGINT;
  v_retailer_formula BIGINT;
  v_legacy_formula BIGINT;
  v_cache TEXT := 'open-farm:683547129320';
  v_retailer_cache TEXT := 'petsmart-retail-catalog:683547129429';
  v_source TEXT := 'https://openfarmpet.com/products/wild-ocean-recipe-for-dogs';
  v_front TEXT := 'https://openfarmpet.com/cdn/shop/products/PDP-Images-DryDog-RawMix-GF-2023-WildOcean-FOP.png?v=1677736014&width=1024';
  v_formula_key TEXT := 'open farm|open farm|rawmix wild ocean grain free|dog|all life stages|dry|wild ocean|excludes large breed growth';
  v_retailer_formula_key TEXT := 'open farm|open farm|open farm rawmix wild ocean recipe grain free adult dry dog food with salmon whitefish and rockfish|dog|adult|dry|salmon whitefish and rockfish|';
  v_legacy_formula_key TEXT := 'open farm|open farm|rawmix wild ocean grain free kibble|dog|unknown|dry||';
  v_top TEXT;
  v_ocr_top TEXT;
  v_small_barcode TEXT;
  v_large_barcode TEXT;
  v_cat_top TEXT;
  v_ancient_top TEXT;
  v_run BIGINT;
BEGIN
  SELECT id INTO STRICT v_formula
  FROM public.catalog_formulas
  WHERE formula_key=v_formula_key;

  SELECT id INTO STRICT v_retailer_formula
  FROM public.catalog_formulas
  WHERE formula_key=v_retailer_formula_key;

  SELECT id INTO STRICT v_legacy_formula
  FROM public.catalog_formulas
  WHERE formula_key=v_legacy_formula_key;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='683547129320'
      AND lower(brand)='open farm' AND pet_type='dog'
      AND life_stage='all life stages' AND food_form='dry'
      AND source_url=v_source AND source_quality='manufacturer'
      AND ingredient_count=52
      AND ingredients[1]='Ocean Whitefish'
      AND ingredients[4]='Wild-caught Pacific Salmon'
      AND ingredients[12]='Natural Flavor (yeast)'
      AND ingredients[52]='Rosemary Extract'
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_retailer_cache AND gtin='683547129429'
      AND lower(brand)='open farm' AND pet_type='dog'
      AND life_stage='adult' AND food_form='dry'
      AND ingredient_count=52
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Open Farm Wild Ocean serving-row preconditions failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE formula_id=v_formula AND gtin='683547129320'
      AND package_size='3.5 lb' AND active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE formula_id=v_retailer_formula AND gtin='683547129429'
      AND package_size='20 Lb' AND active
  ) THEN
    RAISE EXCEPTION 'Open Farm Wild Ocean official size/GTIN preconditions failed';
  END IF;

  UPDATE public.product_data SET
    brand='Open Farm',
    product_name='Open Farm RawMix Wild Ocean Grain-Free Dog Kibble',
    product_line='RawMix Wild Ocean Grain-Free',
    flavor='Wild Ocean — Salmon, Whitefish & Rockfish',
    pet_type='dog',life_stage='all life stages',food_form='dry',
    package_size='3.5 lb',is_complete_food=true,
    image_url=v_front,source='open-farm',source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    verified_at=COALESCE(verified_at,now()),updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',
    updated_at=now()
  WHERE cache_key=v_retailer_cache;

  UPDATE public.catalog_formulas SET
    product_name='Open Farm RawMix Wild Ocean Grain-Free Dog Kibble',
    product_line='rawmix wild ocean grain-free',
    pet_type='dog',life_stage='all life stages',food_form='dry',
    flavor='wild ocean',diet_condition='excludes large breed growth',
    is_complete_food=true,
    complete_food_evidence='Open Farm RawMix Wild Ocean Recipe Dog Food is formulated to meet the nutritional levels established by the AAFCO Dog Food Nutrient Profiles for All Life Stages except for growth of large size dogs (70 lb. or more as an adult).',
    front_image_url=v_front,source_url=v_source,source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'open farm','rawmix','wild ocean','wild ocean recipe',
      'grain-free','grain free','grain & legume free','grain and legume free',
      'raw + broth + raw chunks','raw chunks','bone broth coated',
      'salmon','whitefish','rockfish','dog','dry'
    ]::TEXT[],
    verification_status='verified',active=true,absent_since=NULL,
    promoted_cache_key=v_cache,promoted_at=COALESCE(promoted_at,now()),
    last_observed_at=now(),updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET
    formula_id=v_formula,manufacturer='open farm',brand='open farm',
    product_name='RawMix Wild Ocean Grain-Free Dog Kibble',
    product_line='rawmix wild ocean grain-free',pet_type='dog',
    life_stage='all life stages',food_form='dry',flavor='wild ocean',
    diet_condition='excludes large breed growth',is_complete_food=true,
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_official_size_variant',
        'canonical_formula_id',v_formula,
        'official_product_handle','wild-ocean-recipe-for-dogs',
        'official_variant_gtins',jsonb_build_array(
          '683547129320','683547129429'
        ),
        'species_boundary','dog',
        'grain_boundary','grain-free'
      )
    )
  WHERE formula_id IN (v_formula,v_retailer_formula)
     OR gtin IN ('683547129320','683547129429');

  UPDATE public.catalog_skus SET
    formula_id=v_formula,
    package_size=CASE gtin
      WHEN '683547129320' THEN '3.5 lb'
      WHEN '683547129429' THEN '20 lb'
      ELSE package_size
    END,
    active=true,updated_at=now()
  WHERE formula_id IN (v_formula,v_retailer_formula)
     OR gtin IN ('683547129320','683547129429');

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,
    metadata,updated_at
  )
  SELECT alias_key,v_formula,f.identity_hash,'manual_review',alias_url,
    jsonb_build_object(
      'exact_formula_identity',true,
      'official_product_handle','wild-ocean-recipe-for-dogs',
      'official_variant_gtins',jsonb_build_array(
        '683547129320','683547129429'
      ),
      'grain_boundary','grain-free','species_boundary','dog',
      'reconciled_at',now()
    ),now()
  FROM (
    VALUES
      (v_legacy_formula_key,v_source),
      (
        v_retailer_formula_key,
        'https://www.petsmart.com/dog/food/dry-food/open-farm-rawmix-wild-ocean-recipe-grain-free-adult-dry-dog-food-with-salmon-whitefish-and-rockfish-99573.html'
      )
  ) x(alias_key,alias_url)
  JOIN public.catalog_formulas f ON f.id=v_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded by the exact current manufacturer formula. Official Open Farm product variants prove GTIN 683547129429 is the 20 lb size child of the same RawMix Wild Ocean Grain-Free dog formula.',
    updated_at=now()
  WHERE id=v_retailer_formula;

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded incomplete identity duplicate of the exact current Open Farm RawMix Wild Ocean Grain-Free dog formula.',
    updated_at=now()
  WHERE id=v_legacy_formula;

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,'Open Farm RawMix Wild Ocean Grain-Free Dog Kibble',
      public.normalize_verified_product_search_query(
        'Open Farm RawMix Wild Ocean Grain-Free Dog Kibble'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'eric_regression',true,'species_boundary','dog',
        'grain_boundary','grain-free','product_line_boundary','rawmix',
        'recipe_boundary','wild ocean'
      )
    ),
    (
      v_cache,
      'Open Farm RawMix Wild Ocean Recipe Grain and Legume Free Salmon Whitefish Rockfish Food for Dogs',
      public.normalize_verified_product_search_query(
        'Open Farm RawMix Wild Ocean Recipe Grain and Legume Free Salmon Whitefish Rockfish Food for Dogs'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'eric_regression',true,'source','eric_store_photo_ocr',
        'species_boundary','dog','grain_boundary','grain-free',
        'protein_terms',jsonb_build_array('salmon','whitefish','rockfish')
      )
    ),
    (
      v_cache,
      'Open Farm RawMix Raw Broth Raw Chunks Wild Ocean Recipe Grain Legume Free Food for Dogs',
      public.normalize_verified_product_search_query(
        'Open Farm RawMix Raw Broth Raw Chunks Wild Ocean Recipe Grain Legume Free Food for Dogs'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'eric_regression',true,'source','eric_store_photo_ocr',
        'visible_package_terms',jsonb_build_array(
          'rawmix','raw','broth','raw chunks','wild ocean','grain legume free'
        )
      )
    )
  ON CONFLICT(normalized_alias) WHERE active DO UPDATE SET
    cache_key=excluded.cache_key,alias_text=excluded.alias_text,
    source_url=excluded.source_url,source_authority=excluded.source_authority,
    evidence_observed_at=excluded.evidence_observed_at,
    provenance=excluded.provenance,updated_at=now();

  INSERT INTO public.catalog_source_runs(
    run_key,source_slug,source_type,coverage_role,status,started_at,finished_at,
    expected_count,observed_count,accepted_count,rejected_count,
    pagination_complete,source_content_hash,checkpoint,error_summary,
    metadata,updated_at
  ) VALUES(
    'manual-exact-evidence:open-farm:rawmix-wild-ocean-eric:20260725',
    'open-farm-manual-search','manufacturer','verification','completed',
    now(),now(),2,2,2,0,true,
    'a696248cd1b5f080a302141b119f426021cf3eea430860655abd99f32c53981d',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,'eric_regression',true,
      'official_page_captured_at','2026-07-25T05:36:18.276Z',
      'cached_official_page_sha256','3cb46ad4f2fee95a996e6bc0258c9c576a8ac5258f0461e8ebfc8c61391e15f2',
      'official_variant_skus',jsonb_build_array('12932','12942'),
      'official_variant_gtins',jsonb_build_array(
        '683547129320','683547129429'
      ),
      'official_variant_sizes',jsonb_build_array('3.5 lb','20 lb'),
      'ingredient_count',52
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),observed_count=2,
    accepted_count=2,rejected_count=0,pagination_complete=true,
    source_content_hash=excluded.source_content_hash,error_summary=NULL,
    metadata=excluded.metadata,updated_at=now()
  RETURNING id INTO v_run;

  INSERT INTO public.catalog_field_evidence(
    formula_id,observation_id,field_name,field_value,source_url,
    source_authority,accepted,observed_at,content_hash
  )
  SELECT v_formula,NULL,field_name,to_jsonb(field_value),v_source,
    'manufacturer',true,now(),
    encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||v_source,'sha256'),'hex')
  FROM (
    VALUES
      ('official_product_handle','wild-ocean-recipe-for-dogs'),
      ('official_sku_3_5_lb','12932'),
      ('official_gtin_3_5_lb','683547129320'),
      ('official_sku_20_lb','12942'),
      ('official_gtin_20_lb','683547129429'),
      ('official_variant_sizes','3.5 lb; 20 lb'),
      ('consumer_brand','Open Farm'),
      ('product_line','RawMix'),
      ('recipe','Wild Ocean'),
      ('grain_boundary','Grain & Legume Free'),
      ('protein_identity','Salmon, Whitefish & Rockfish'),
      ('complete_food_evidence','All Life Stages except growth of large size dogs')
  ) evidence(field_name,field_value)
  ON CONFLICT(formula_id,field_name,source_url,content_hash) DO UPDATE SET
    accepted=true,observed_at=excluded.observed_at;

  UPDATE public.catalog_manual_evidence_reviews SET
    evidence_status='promoted',quarantine_reason=NULL,
    resolved_identity=jsonb_build_object(
      'manufacturer','open farm','brand','open farm',
      'product_line','rawmix wild ocean grain free',
      'pet_type','dog','life_stage','all life stages',
      'food_form','dry','flavor','wild ocean',
      'diet_condition','excludes large breed growth',
      'official_variant_gtins',jsonb_build_array(
        '683547129320','683547129429'
      ),
      'official_variant_sizes',jsonb_build_array('3.5 lb','20 lb')
    ),
    formula_id=v_formula,promoted_cache_key=v_cache,
    attempt_count=attempt_count+1,
    review_notes='Eric-critical completion: official Open Farm product JSON-LD and Shopify variant data prove the 3.5 lb GTIN 683547129320 and 20 lb GTIN 683547129429 are size children of the same RawMix Wild Ocean Grain-Free dog formula. Exact store-photo OCR aliases now resolve the canonical product. Cat and Ancient Grains siblings remain separate hard boundaries.',
    updated_at=now()
  WHERE review_key='manual-search:open-farm:rawmix-wild-ocean-dog:20260725';

  UPDATE public.catalog_acquisition_queue SET
    status='resolved',resolved_at=now(),
    resolution_reason='Exact Open Farm RawMix Wild Ocean Grain-Free dog formula and both official size GTINs are verified from the current manufacturer product page.',
    acquisition_notes='Official Open Farm variant data maps SKU 12932 / GTIN 683547129320 / 3.5 lb and SKU 12942 / GTIN 683547129429 / 20 lb to the same current 52-ingredient Wild Ocean Grain-Free dog formula. Eric store-photo OCR terms are protected aliases; cat and Ancient Grains remain separate.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    sample_metadata=COALESCE(sample_metadata,'{}'::JSONB)||jsonb_build_object(
      'matched_formula_id',v_formula,'matched_cache_key',v_cache,
      'official_variant_gtins',jsonb_build_array(
        '683547129320','683547129429'
      ),
      'eric_regression',true,'reconciled_at',now()
    ),
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:dcf6f0f695a5afef9124a78c32388c24'
     OR (
       lower(coalesce(product_name,'')) LIKE '%open farm%'
       AND lower(coalesce(product_name,'')) LIKE '%rawmix%'
       AND lower(coalesce(product_name,'')) LIKE '%wild ocean%'
       AND lower(coalesce(product_name,'')) NOT LIKE '%ancient%'
       AND lower(coalesce(product_name,'')) NOT LIKE '%cat%'
     );

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Open Farm RawMix Wild Ocean Grain-Free Dog Kibble',8
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_ocr_top
  FROM public.search_verified_products(
    'Open Farm RawMix Wild Ocean Recipe Grain and Legume Free Salmon Whitefish Rockfish Food for Dogs',8
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_small_barcode
  FROM public.resolve_verified_product_by_gtin('683547129320',8)
  ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_large_barcode
  FROM public.resolve_verified_product_by_gtin('683547129429',8)
  ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_cat_top
  FROM public.search_verified_products(
    'Open Farm RawMix Wild Ocean Grain Free Cat Kibble',8
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_ancient_top
  FROM public.search_verified_products(
    'Open Farm RawMix Wild Ocean Ancient Grains Dog Kibble',8
  ) ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache
     OR v_ocr_top IS DISTINCT FROM v_cache
     OR v_small_barcode IS DISTINCT FROM v_cache
     OR v_large_barcode IS DISTINCT FROM v_cache
     OR v_cat_top IS DISTINCT FROM 'open-farm:683547129818'
     OR v_ancient_top IS DISTINCT FROM 'open-farm:683547129351'
  THEN
    RAISE EXCEPTION 'Open Farm Eric regression: exact %, OCR %, small %, large %, cat %, ancient %',
      v_top,v_ocr_top,v_small_barcode,v_large_barcode,v_cat_top,v_ancient_top;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (v_retailer_formula,v_legacy_formula)
      AND (active OR verification_status<>'quarantined')
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE formula_id=v_formula AND active
    GROUP BY formula_id
    HAVING array_agg(gtin ORDER BY gtin) @> ARRAY[
      '683547129320','683547129429'
    ]::TEXT[]
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND pet_type='dog'
      AND life_stage='all life stages' AND food_form='dry'
      AND diet_condition='excludes large breed growth'
      AND cardinality(ingredients)=52
  ) THEN
    RAISE EXCEPTION 'Open Farm Wild Ocean canonical formula or size graph regression';
  END IF;
END
$$;
