-- Close a high-demand runtime miss for the exact Purina Pro Plan Adult
-- Sensitive Skin & Stomach Salmon & Rice dry cat formula. The official PDP
-- proves three package-size GTINs; all resolve one formula while senior,
-- kitten, alternate-recipe, LiveClear, and wet siblings remain separate.

DO $$
DECLARE
  v_formula BIGINT := 6255;
  v_duplicate BIGINT := 8899;
  v_cache TEXT := 'nestle-purina-pro-plan:038100103871';
  v_retailer_cache TEXT := 'petsmart-retail-catalog:038100103895';
  v_source TEXT := 'https://www.purina.com/cats/shop/pro-plan-sensitive-skin-stomach-adult-dry-cat-food';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2025-05/pro-plan-sensitive-skin-stomach-salmon-adult-dry-cat-food.png';
  v_run BIGINT;
  v_top TEXT;
  v_senior_top TEXT;
  v_kitten_top TEXT;
  v_lamb_top TEXT;
  v_gtin TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='038100103871'
      AND lower(brand)='purina pro plan'
      AND pet_type='cat' AND life_stage='adult' AND food_form='dry'
      AND lower(flavor)='salmon & rice'
      AND ingredient_count=40
      AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
      AND source_url=v_source AND image_url=v_front
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula
      AND formula_key='purina pro plan|purina pro plan|adult sensitive skin and stomach|cat|adult|dry|salmon and rice|'
      AND cardinality(ingredients)=40
      AND source_url=v_source
      AND source_authority='manufacturer'
  ) THEN
    RAISE EXCEPTION 'Pro Plan Adult Sensitive Salmon & Rice cat prerequisites failed';
  END IF;

  UPDATE public.product_data SET
    product_name='Purina Pro Plan Adult Sensitive Skin & Stomach Salmon & Rice Dry Cat Food',
    brand='Purina Pro Plan',
    product_line='Adult Sensitive Skin & Stomach',
    flavor='Salmon & Rice',pet_type='cat',life_stage='adult',
    food_form='dry',package_size='3.5 lb',gtin='038100103871',
    is_complete_food=true,source='nestle-purina-pro-plan',
    source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    image_url=v_front,verified_at=COALESCE(verified_at,now()),
    catalog_exclusion_reason=NULL,updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',
    updated_at=now()
  WHERE cache_key=v_retailer_cache;

  UPDATE public.catalog_formulas SET
    product_name='Purina Pro Plan Adult Sensitive Skin & Stomach Salmon & Rice Dry Cat Food',
    product_line='adult sensitive skin and stomach',pet_type='cat',
    life_stage='adult',food_form='dry',flavor='salmon and rice',
    diet_condition='',is_complete_food=true,
    complete_food_evidence='The current official Purina product page identifies this exact adult dry cat recipe as complete food and publishes three package-size GTIN options.',
    front_image_url=v_front,source_url=v_source,
    source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'purina pro plan','pro plan','adult','sensitive skin & stomach',
      'sensitive skin and stomach','salmon','rice','cat','dry'
    ]::TEXT[],
    verification_status='verified',active=true,absent_since=NULL,
    is_popular_brand=true,promoted_cache_key=v_cache,
    promoted_at=COALESCE(promoted_at,now()),last_observed_at=now(),
    updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET
    formula_id=v_formula,manufacturer='nestle purina petcare company',
    brand='purina pro plan',
    product_name='Purina Pro Plan Adult Sensitive Skin & Stomach Salmon & Rice Dry Cat Food',
    product_line='adult sensitive skin and stomach',pet_type='cat',
    life_stage='adult',food_form='dry',flavor='salmon and rice',
    diet_condition='',is_complete_food=true,validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_official_size_variant',
        'canonical_formula_id',v_formula,'species_boundary','cat',
        'life_stage_boundary','adult','recipe_boundary','salmon and rice',
        'food_form_boundary','dry',
        'official_variant_gtins',jsonb_build_array(
          '038100103871','038100103895','038100103918'
        )
      )
    )
  WHERE formula_id=v_duplicate
     OR gtin IN ('038100103871','038100103895','038100103918')
     OR (
       source_slug='chewy-public-sitemap'
       AND source_external_id='2027774'
     );

  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE formula_id=v_duplicate
     OR gtin IN ('038100103871','038100103895','038100103918');

  INSERT INTO public.catalog_skus(
    formula_id,gtin,package_size,package_count,source_slug,
    source_external_id,source_url,active,first_observed_at,last_observed_at,
    updated_at
  ) VALUES
    (
      v_formula,'038100103871','3.5 lb',1,
      'purina-manufacturer-manual','038100103871',v_source,
      true,now(),now(),now()
    ),
    (
      v_formula,'038100103895','7 lb',1,
      'purina-manufacturer-manual','038100103895',v_source,
      true,now(),now(),now()
    ),
    (
      v_formula,'038100103918','16 lb',1,
      'purina-manufacturer-manual','038100103918',v_source,
      true,now(),now(),now()
    )
  ON CONFLICT(source_slug,source_external_id,gtin,package_size) DO UPDATE SET
    formula_id=excluded.formula_id,source_url=excluded.source_url,
    active=true,last_observed_at=now(),updated_at=now();

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,
    metadata,updated_at
  )
  SELECT f.formula_key,v_formula,canonical.identity_hash,'manual_review',
    COALESCE(NULLIF(f.source_url,''),v_source),
    jsonb_build_object(
      'exact_formula_identity',true,'species_boundary','cat',
      'life_stage_boundary','adult','recipe_boundary','salmon and rice',
      'food_form_boundary','dry',
      'official_variant_gtins',jsonb_build_array(
        '038100103871','038100103895','038100103918'
      ),
      'reconciled_at',now()
    ),now()
  FROM public.catalog_formulas f
  CROSS JOIN public.catalog_formulas canonical
  WHERE f.id=v_duplicate AND canonical.id=v_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded exact PetSmart title alias. The current official Purina PDP proves this 7 lb GTIN is a package child of canonical formula 6255.',
    updated_at=now()
  WHERE id=v_duplicate;

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,
      'Purina Pro Plan Adult Sensitive Skin and Stomach Salmon and Rice Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan Adult Sensitive Skin and Stomach Salmon and Rice Dry Cat Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'runtime_miss_regression',true,'species_boundary','cat',
        'life_stage_boundary','adult','recipe_boundary','salmon and rice',
        'food_form_boundary','dry'
      )
    ),
    (
      v_cache,
      'Purina Pro Plan Sensitive Skin Stomach Adult Dry Cat Food Salmon Rice',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan Sensitive Skin Stomach Adult Dry Cat Food Salmon Rice'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'source','runtime_lookup_identity','species_boundary','cat',
        'life_stage_boundary','adult','recipe_boundary','salmon and rice',
        'food_form_boundary','dry'
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
    'manual-exact-evidence:purina-pro-plan:adult-sensitive-salmon-rice-cat:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),3,3,3,0,true,
    '744fd91cb18def282f23700ed856773b526f6f7d17a3c8f11627a0acafdfde17',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,'runtime_miss_regression',true,
      'cached_official_page_sha256','744fd91cb18def282f23700ed856773b526f6f7d17a3c8f11627a0acafdfde17',
      'official_variant_gtins',jsonb_build_array(
        '038100103871','038100103895','038100103918'
      ),
      'official_variant_sizes',jsonb_build_array('3.5 lb','7 lb','16 lb'),
      'ingredient_count',40,'canonical_formula_id',v_formula
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),expected_count=3,observed_count=3,
    accepted_count=3,rejected_count=0,pagination_complete=true,
    source_content_hash=excluded.source_content_hash,error_summary=NULL,
    metadata=excluded.metadata,updated_at=now()
  RETURNING id INTO v_run;

  INSERT INTO public.catalog_observations(
    run_id,formula_id,source_slug,source_external_id,source_url,source_authority,
    gtin,manufacturer,brand,product_name,product_line,pet_type,life_stage,
    food_form,flavor,diet_condition,package_size,ingredient_text,front_image_url,
    is_complete_food,available_in_us,observed_at,content_hash,validation_status,
    validation_reasons,raw_payload
  )
  SELECT
    v_run,v_formula,'purina-manufacturer-manual',variant.gtin,v_source,
    'manufacturer',variant.gtin,'Nestlé Purina PetCare Company',
    'Purina Pro Plan',p.product_name,'Adult Sensitive Skin & Stomach',
    'cat','adult','dry','Salmon & Rice','',variant.package_size,
    p.ingredient_text,v_front,true,true,now(),
    encode(digest(variant.gtin||'|'||p.ingredient_text||'|'||v_front,'sha256'),'hex'),
    'accepted',ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_page',v_source,'official_front_image',v_front,
      'official_gtin',variant.gtin,'official_package_size',variant.package_size,
      'ingredient_count',40,'species_boundary','cat',
      'life_stage_boundary','adult','recipe_boundary','salmon and rice',
      'food_form_boundary','dry'
    )
  FROM public.product_data p
  CROSS JOIN (
    VALUES
      ('038100103871','3.5 lb'),
      ('038100103895','7 lb'),
      ('038100103918','16 lb')
  ) variant(gtin,package_size)
  WHERE p.cache_key=v_cache
  ON CONFLICT(run_id,source_slug,source_external_id,content_hash) DO UPDATE SET
    formula_id=excluded.formula_id,validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[],raw_payload=excluded.raw_payload,
    observed_at=now();

  INSERT INTO public.catalog_field_evidence(
    formula_id,observation_id,field_name,field_value,source_url,
    source_authority,accepted,observed_at,content_hash
  )
  SELECT v_formula,NULL,field_name,to_jsonb(field_value),v_source,
    'manufacturer',true,now(),
    encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||v_source,'sha256'),'hex')
  FROM (
    VALUES
      ('species','cat'),('life_stage','adult'),('food_form','dry'),
      ('product_line','Adult Sensitive Skin & Stomach'),
      ('recipe','Salmon & Rice'),('ingredient_count','40'),
      ('official_gtin_3_5_lb','038100103871'),
      ('official_gtin_7_lb','038100103895'),
      ('official_gtin_16_lb','038100103918'),
      ('official_variant_sizes','3.5 lb; 7 lb; 16 lb')
  ) evidence(field_name,field_value)
  ON CONFLICT(formula_id,field_name,source_url,content_hash) DO UPDATE SET
    accepted=true,observed_at=excluded.observed_at;

  INSERT INTO public.catalog_manual_evidence_reviews(
    review_key,target_formula_key,corrected_formula_key,brand,product_name,
    search_query,discovery_urls,authoritative_source_url,
    authoritative_source_type,expected_identity,resolved_identity,
    evidence_status,quarantine_reason,authoritative_content_hash,
    ingredient_text_hash,front_image_url_hash,observed_at,formula_id,
    promoted_cache_key,attempt_count,review_notes,updated_at
  )
  SELECT
    'manual-search:purina-pro-plan:adult-sensitive-salmon-rice-cat:20260725',
    formula_key,formula_key,'Purina Pro Plan',product_name,
    'Purina Pro Plan Adult Sensitive Skin Stomach Salmon Rice Dry Cat Food ingredients',
    jsonb_build_array(v_source),v_source,'manufacturer_page',
    jsonb_build_object(
      'brand','Purina Pro Plan','pet_type','cat','life_stage','adult',
      'food_form','dry','product_line','Adult Sensitive Skin & Stomach',
      'flavor','Salmon & Rice'
    ),
    jsonb_build_object(
      'formula_id',id,'official_variant_gtins',jsonb_build_array(
        '038100103871','038100103895','038100103918'
      ),
      'official_variant_sizes',jsonb_build_array('3.5 lb','7 lb','16 lb')
    ),
    'promoted',NULL,
    '744fd91cb18def282f23700ed856773b526f6f7d17a3c8f11627a0acafdfde17',
    encode(digest(ingredient_text,'sha256'),'hex'),
    encode(digest(front_image_url,'sha256'),'hex'),
    now(),id,v_cache,1,
    'The cached current official Purina PDP proves the exact adult cat formula, 40 ingredients, matching front image, and three package-size GTINs. The duplicate PetSmart formula is an alias; senior, kitten, lamb, turkey, LiveClear, and wet siblings remain separate.',
    now()
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(review_key) DO UPDATE SET
    corrected_formula_key=excluded.corrected_formula_key,
    authoritative_source_url=excluded.authoritative_source_url,
    expected_identity=excluded.expected_identity,
    resolved_identity=excluded.resolved_identity,evidence_status='promoted',
    quarantine_reason=NULL,
    authoritative_content_hash=excluded.authoritative_content_hash,
    ingredient_text_hash=excluded.ingredient_text_hash,
    front_image_url_hash=excluded.front_image_url_hash,
    observed_at=excluded.observed_at,formula_id=excluded.formula_id,
    promoted_cache_key=excluded.promoted_cache_key,
    attempt_count=public.catalog_manual_evidence_reviews.attempt_count+1,
    review_notes=excluded.review_notes,updated_at=now();

  UPDATE public.catalog_acquisition_queue SET
    status='resolved',resolved_at=now(),
    resolution_reason='Exact Purina Pro Plan Adult Sensitive Skin & Stomach Salmon & Rice dry cat formula is now connected to its canonical serving row and all official package GTINs.',
    acquisition_notes='The current official Purina PDP proves GTINs 038100103871 / 3.5 lb, 038100103895 / 7 lb, and 038100103918 / 16 lb under one exact 40-ingredient adult dry cat formula. Exact runtime aliases now clear the client confidence floor. Senior, kitten, lamb, turkey, LiveClear, and wet siblings remain hard-separated.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    sample_metadata=COALESCE(sample_metadata,'{}'::JSONB)||jsonb_build_object(
      'matched_formula_id',v_formula,'matched_cache_key',v_cache,
      'official_variant_gtins',jsonb_build_array(
        '038100103871','038100103895','038100103918'
      ),
      'runtime_miss_regression',true,'reconciled_at',now()
    ),
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='lookup:2d47a330ddaf37d439d9ce3f99cdb83e';

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Purina Pro Plan Adult Sensitive Skin and Stomach Salmon and Rice Dry Cat Food',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_senior_top
  FROM public.search_verified_products(
    'Purina Pro Plan Adult 7 Plus Sensitive Skin and Stomach Salmon Rice Dry Cat Food',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_kitten_top
  FROM public.search_verified_products(
    'Purina Pro Plan Kitten Sensitive Skin and Stomach Salmon Rice Dry Cat Food',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_lamb_top
  FROM public.search_verified_products(
    'Purina Pro Plan Adult Sensitive Skin and Stomach Lamb Rice Dry Cat Food',8
  ) ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache
     OR v_senior_top IS NOT DISTINCT FROM v_cache
     OR v_kitten_top IS NOT DISTINCT FROM v_cache
     OR v_lamb_top IS NOT DISTINCT FROM v_cache
  THEN
    RAISE EXCEPTION 'Pro Plan Sensitive cat sibling regression: adult %, senior %, kitten %, lamb %',
      v_top,v_senior_top,v_kitten_top,v_lamb_top;
  END IF;

  FOREACH v_gtin IN ARRAY ARRAY[
    '038100103871','038100103895','038100103918'
  ]::TEXT[] LOOP
    IF (
      SELECT cache_key FROM public.resolve_verified_product_by_gtin(v_gtin,8)
      ORDER BY rank DESC LIMIT 1
    ) IS DISTINCT FROM v_cache THEN
      RAISE EXCEPTION 'Pro Plan Adult Sensitive Salmon cat GTIN regression: %',v_gtin;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_duplicate AND (active OR verification_status<>'quarantined')
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND pet_type='cat'
      AND life_stage='adult' AND food_form='dry'
      AND flavor='salmon and rice' AND cardinality(ingredients)=40
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE formula_id=v_formula AND active
    GROUP BY formula_id
    HAVING array_agg(gtin ORDER BY gtin) @> ARRAY[
      '038100103871','038100103895','038100103918'
    ]::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Pro Plan Adult Sensitive Salmon cat formula graph regression';
  END IF;
END
$$;
