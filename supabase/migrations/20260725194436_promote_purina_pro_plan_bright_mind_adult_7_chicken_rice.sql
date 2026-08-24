DO $$
DECLARE
  v_formula BIGINT := 6282;
  v_discovery BIGINT := 17725;
  v_cache TEXT := 'nestle-purina-pro-plan:038100170859';
  v_source TEXT := 'https://www.purina.com/dogs/shop/pro-plan-bright-mind-senior-chicken-rice-dry-dog-food';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2024-02/ppdog_snr_a7_bm_chknrc_0hero.png';
  v_run BIGINT;
  v_top TEXT;
  v_barcode TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache
      AND gtin='038100170859'
      AND pet_type='dog'
      AND life_stage='senior'
      AND food_form='dry'
      AND ingredient_count=42
      AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
      AND source_url=v_source
      AND image_url=v_front
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Bright Mind Adult 7+ canonical manufacturer row missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula
      AND formula_key='purina pro plan|purina pro plan|pro plan adult 7 bright mind|dog|senior|dry|chicken and rice formula|'
      AND cardinality(ingredients)=42
      AND source_url=v_source
      AND source_authority='manufacturer'
  ) THEN
    RAISE EXCEPTION 'Bright Mind Adult 7+ canonical formula missing';
  END IF;

  UPDATE public.product_data SET
    product_name='Pro Plan Adult 7+ Bright Mind Chicken & Rice Formula Dry Dog Food',
    brand='Purina Pro Plan',
    source='nestle-purina-pro-plan',
    source_url=v_source,
    scraped_at=now(),
    expires_at=now()+interval '365 days',
    updated_at=now(),
    image_url=v_front,
    is_complete_food=true,
    catalog_exclusion_reason=NULL,
    pet_type='dog',
    source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    verified_at=now(),
    gtin='038100170859',
    product_line='Pro Plan Adult 7+ Bright Mind',
    flavor='Chicken & Rice Formula',
    life_stage='senior',
    food_form='dry',
    package_size='16 lb'
  WHERE cache_key=v_cache;

  UPDATE public.catalog_formulas SET
    product_name='Pro Plan Adult 7+ Bright Mind Chicken & Rice Formula Dry Dog Food',
    product_line='pro plan adult 7 bright mind',
    pet_type='dog',
    life_stage='senior',
    food_form='dry',
    flavor='chicken and rice formula',
    diet_condition='',
    is_complete_food=true,
    complete_food_evidence='Current official Purina product evidence identifies this exact Adult 7+ senior dry dog formula as complete food.',
    front_image_url=v_front,
    source_url=v_source,
    source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'purina pro plan','pro plan','bright mind','adult 7+','senior',
      'chicken','rice','dog','dry'
    ]::TEXT[],
    verification_status='verified',
    active=true,
    absent_since=NULL,
    promoted_cache_key=v_cache,
    promoted_at=now(),
    last_observed_at=now(),
    updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET
    formula_id=v_formula,
    validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[]
  WHERE formula_id=v_discovery
     OR (source_slug='chewy-public-sitemap' AND source_external_id IN ('113974','113975'));

  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE formula_id=v_discovery
     OR (source_slug='chewy-public-sitemap' AND source_external_id IN ('113974','113975'));

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT
    'purina pro plan|purina pro plan|purina pro plan bright mind adult 7 chicken and rice formula dry dog food|dog|adult|dry||',
    v_formula,f.identity_hash,'manual_review',v_source,
    jsonb_build_object(
      'exact_formula_identity',true,
      'age_boundary','adult 7+',
      'canonical_life_stage','senior',
      'chewy_listing_ids',jsonb_build_array('113974','113975'),
      'reconciled_at',now()
    ),now()
  FROM public.catalog_formulas f WHERE f.id=v_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,
    identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,
    source_url=excluded.source_url,
    metadata=excluded.metadata,
    updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',
    active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,
    promoted_at=NULL,
    complete_food_evidence='Superseded exact Chewy discovery alias; Adult 7+ is retained as the senior life-stage boundary under canonical manufacturer formula 6282.',
    updated_at=now()
  WHERE id=v_discovery;

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES(
    v_cache,
    'Purina Pro Plan Bright Mind Adult 7 Plus Chicken and Rice Formula Dry Dog Food',
    public.normalize_verified_product_search_query(
      'Purina Pro Plan Bright Mind Adult 7 Plus Chicken and Rice Formula Dry Dog Food'
    ),
    v_source,'manufacturer',now(),
    jsonb_build_object(
      'species_boundary','dog','life_stage_boundary','adult 7+ senior',
      'food_form_boundary','dry','recipe_boundary','chicken and rice',
      'line_boundary','bright mind'
    )
  )
  ON CONFLICT(normalized_alias) WHERE active DO UPDATE SET
    cache_key=excluded.cache_key,
    alias_text=excluded.alias_text,
    source_url=excluded.source_url,
    source_authority=excluded.source_authority,
    evidence_observed_at=excluded.evidence_observed_at,
    provenance=excluded.provenance,
    updated_at=now();

  INSERT INTO public.catalog_source_runs(
    run_key,source_slug,source_type,coverage_role,status,started_at,finished_at,
    expected_count,observed_count,accepted_count,rejected_count,pagination_complete,
    source_content_hash,checkpoint,error_summary,metadata,updated_at
  ) VALUES(
    'manual-exact-evidence:purina-pro-plan:bright-mind-adult-7-chicken-rice:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),1,1,1,0,true,
    '65c7503499bad89a78b4c596fb2c51ab4ccf0688717778887a16d59d22b046e4',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,
      'official_page_captured_at','2026-06-29T22:22:42.324Z',
      'official_page_sha256','65c7503499bad89a78b4c596fb2c51ab4ccf0688717778887a16d59d22b046e4',
      'official_gtin','038100170859',
      'official_package_size','16 lb',
      'ingredient_count',42,
      'chewy_listing_ids',jsonb_build_array('113974','113975'),
      'age_boundary','Adult 7+ / senior'
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',
    finished_at=now(),
    expected_count=1,
    observed_count=1,
    accepted_count=1,
    rejected_count=0,
    pagination_complete=true,
    source_content_hash=excluded.source_content_hash,
    error_summary=NULL,
    metadata=excluded.metadata,
    updated_at=now()
  RETURNING id INTO v_run;

  INSERT INTO public.catalog_observations(
    run_id,formula_id,source_slug,source_external_id,source_url,source_authority,
    gtin,manufacturer,brand,product_name,product_line,pet_type,life_stage,
    food_form,flavor,diet_condition,package_size,ingredient_text,front_image_url,
    is_complete_food,available_in_us,observed_at,content_hash,validation_status,
    validation_reasons,raw_payload
  )
  SELECT
    v_run,v_formula,'purina-manufacturer-manual','038100170859',v_source,'manufacturer',
    '038100170859','Nestlé Purina PetCare Company','Purina Pro Plan',
    product_name,'Pro Plan Adult 7+ Bright Mind','dog','senior','dry',
    'Chicken & Rice Formula','','16 lb',ingredient_text,v_front,true,true,now(),
    encode(digest(v_source||'|'||ingredient_text||'|'||v_front,'sha256'),'hex'),
    'accepted',ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_page',v_source,
      'official_front_image',v_front,
      'official_gtin','038100170859',
      'official_package_size','16 lb',
      'ingredient_count',42,
      'age_boundary','Adult 7+ / senior'
    )
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(run_id,source_slug,source_external_id,content_hash) DO UPDATE SET
    formula_id=excluded.formula_id,
    validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[],
    raw_payload=excluded.raw_payload,
    observed_at=now();

  INSERT INTO public.catalog_field_evidence(
    formula_id,observation_id,field_name,field_value,source_url,
    source_authority,accepted,observed_at,content_hash
  )
  SELECT v_formula,NULL,field_name,to_jsonb(field_value),v_source,'manufacturer',
    true,now(),
    encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||v_source,'sha256'),'hex')
  FROM (
    VALUES
      ('ingredient_text',(SELECT ingredient_text FROM public.catalog_formulas WHERE id=v_formula)),
      ('front_image_url',v_front),
      ('official_gtin','038100170859'),
      ('package_size','16 lb'),
      ('life_stage','senior'),
      ('age_boundary','Adult 7+'),
      ('food_form','dry'),
      ('recipe','chicken and rice')
  ) evidence(field_name,field_value)
  ON CONFLICT(formula_id,field_name,source_url,content_hash) DO UPDATE SET
    accepted=true,
    observed_at=excluded.observed_at;

  INSERT INTO public.catalog_manual_evidence_reviews(
    review_key,target_formula_key,corrected_formula_key,brand,product_name,
    search_query,discovery_urls,authoritative_source_url,
    authoritative_source_type,expected_identity,resolved_identity,
    evidence_status,quarantine_reason,authoritative_content_hash,
    ingredient_text_hash,front_image_url_hash,observed_at,formula_id,
    promoted_cache_key,attempt_count,review_notes,ingredient_evidence_url,
    ingredient_evidence_mode,ingredient_original_text_hash,
    ingredient_corrections,updated_at
  )
  SELECT
    'manual-search:purina-pro-plan:bright-mind-adult-7-chicken-rice:20260725',
    formula_key,formula_key,'Purina Pro Plan',product_name,
    'Purina Pro Plan Bright Mind Adult 7 Chicken Rice Dry Dog Food ingredients',
    jsonb_build_array(
      v_source,
      'https://www.chewy.com/purina-pro-plan-bright-mind-adult-7/dp/113974',
      'https://www.chewy.com/purina-pro-plan-bright-mind-adult-7/dp/113975'
    ),
    v_source,'manufacturer_page',
    jsonb_build_object(
      'brand','Purina Pro Plan','line','Bright Mind','pet_type','dog',
      'life_stage','Adult 7+ senior','food_form','dry','flavor','Chicken & Rice'
    ),
    jsonb_build_object(
      'brand','Purina Pro Plan','product_line','Adult 7+ Bright Mind',
      'pet_type','dog','life_stage','senior','food_form','dry',
      'flavor','Chicken & Rice Formula','gtin','038100170859','package_size','16 lb'
    ),
    'promoted',NULL,
    '65c7503499bad89a78b4c596fb2c51ab4ccf0688717778887a16d59d22b046e4',
    encode(digest(ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Current official Purina page verifies the exact Adult 7+ Bright Mind Chicken & Rice senior dry dog formula, 42 ingredients, official 16 lb GTIN, and matching front image. Chewy listing IDs 113974 and 113975 were consolidated without weakening the Adult 7+ age boundary.',
    v_source,'source_text_exact',
    encode(digest(ingredient_text,'sha256'),'hex'),
    '[]'::JSONB,now()
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(review_key) DO UPDATE SET
    authoritative_source_url=excluded.authoritative_source_url,
    expected_identity=excluded.expected_identity,
    resolved_identity=excluded.resolved_identity,
    evidence_status='promoted',
    quarantine_reason=NULL,
    observed_at=excluded.observed_at,
    formula_id=excluded.formula_id,
    promoted_cache_key=excluded.promoted_cache_key,
    attempt_count=public.catalog_manual_evidence_reviews.attempt_count+1,
    review_notes=excluded.review_notes,
    updated_at=now();

  UPDATE public.catalog_acquisition_queue SET
    status='resolved',
    resolved_at=now(),
    resolution_reason='Exact current Purina Pro Plan Bright Mind Adult 7+ Chicken & Rice dry dog formula promoted from official manufacturer evidence.',
    acquisition_notes='Official Purina page verifies exact dog/senior Adult 7+/dry/Chicken & Rice identity, 42 ingredients, GTIN 038100170859, 16 lb package, and matching front image. Chewy IDs 113974/113975 are linked as formula children.',
    needs_product_record=false,
    needs_verified_ingredients=false,
    needs_verified_image=false,
    needs_pet_type=false,
    ready_rows=1,
    last_refreshed_at=now(),
    updated_at=now()
  WHERE gap_key='census:35cd499b14f9b085660e7cbab966d08f';

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Purina Pro Plan Bright Mind Adult 7 Chicken Rice Dry Dog Food',8
  )
  ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_barcode
  FROM public.resolve_verified_product_by_gtin('038100170859',8)
  ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache OR v_barcode IS DISTINCT FROM v_cache THEN
    RAISE EXCEPTION 'Bright Mind search/barcode regression: search %, barcode %',
      v_top,v_barcode;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_discovery AND (active OR verification_status<>'quarantined')
  ) THEN
    RAISE EXCEPTION 'Bright Mind duplicate formula remains active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND cardinality(ingredients)=42
      AND life_stage='senior'
  ) THEN
    RAISE EXCEPTION 'Bright Mind canonical formula not promoted';
  END IF;
END
$$;
