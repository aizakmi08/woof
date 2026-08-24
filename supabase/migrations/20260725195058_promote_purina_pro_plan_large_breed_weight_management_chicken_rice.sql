DO $$
DECLARE
  v_formula BIGINT := 6329;
  v_cache TEXT := 'nestle-purina-pro-plan:038100132505';
  v_source TEXT := 'https://www.purina.com/dogs/shop/pro-plan-specialized-nutrition-weight-management-large-breed-dry-dog-food';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2024-06/pro-plan-dry-dog-wm-cknrc-lrg-breed_1_1000x1000.jpg';
  v_run BIGINT;
  v_top TEXT;
  v_barcode TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='038100132505'
      AND pet_type='dog' AND life_stage='adult' AND food_form='dry'
      AND package_size='34 lb' AND ingredient_count=43
      AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
      AND source_url=v_source AND image_url=v_front
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Large Breed Weight Management canonical manufacturer row missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula
      AND formula_key='purina pro plan|purina pro plan|pro plan adult large breed weight management|dog|adult|dry|chicken and rice formula|'
      AND cardinality(ingredients)=43
      AND source_url=v_source
      AND source_authority='manufacturer'
  ) THEN
    RAISE EXCEPTION 'Large Breed Weight Management canonical formula missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE formula_id=v_formula
      AND source_slug='walmart-public-sitemap'
      AND source_external_id='34200465'
      AND product_name='Purina Pro Plan Weight Management Dry Dog Food for Large Breed Adults Chicken Rice'
      AND pet_type='dog' AND food_form='dry'
  ) THEN
    RAISE EXCEPTION 'Exact Walmart discovery identity missing';
  END IF;

  UPDATE public.product_data SET
    product_name='Pro Plan Adult Large Breed Weight Management Chicken & Rice Formula Dry Dog Food',
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
    gtin='038100132505',
    product_line='Pro Plan Adult Large Breed Weight Management',
    flavor='Chicken & Rice Formula',
    life_stage='adult',
    food_form='dry',
    package_size='34 lb'
  WHERE cache_key=v_cache;

  UPDATE public.catalog_formulas SET
    product_name='Pro Plan Adult Large Breed Weight Management Chicken & Rice Formula Dry Dog Food',
    product_line='pro plan adult large breed weight management',
    pet_type='dog',
    life_stage='adult',
    food_form='dry',
    flavor='chicken and rice formula',
    diet_condition='weight management',
    is_complete_food=true,
    complete_food_evidence='Current official Purina evidence states this exact formula provides 100 percent complete and balanced nutrition for overweight or less active adult dogs over 50 pounds.',
    front_image_url=v_front,
    source_url=v_source,
    source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'purina pro plan','pro plan','weight management','large breed',
      'adult','chicken','rice','dog','dry'
    ]::TEXT[],
    verification_status='verified',
    active=true,
    absent_since=NULL,
    promoted_cache_key=v_cache,
    promoted_at=now(),
    last_observed_at=now(),
    updated_at=now()
  WHERE id=v_formula;

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES(
    v_cache,
    'Purina Pro Plan Weight Management Dry Dog Food for Large Breed Adults Chicken Rice',
    public.normalize_verified_product_search_query(
      'Purina Pro Plan Weight Management Dry Dog Food for Large Breed Adults Chicken Rice'
    ),
    v_source,'manufacturer',now(),
    jsonb_build_object(
      'walmart_listing_id','34200465',
      'species_boundary','dog','life_stage_boundary','adult',
      'breed_size_boundary','large breed','food_form_boundary','dry',
      'diet_boundary','weight management','recipe_boundary','chicken and rice'
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
    'manual-exact-evidence:purina-pro-plan:large-breed-weight-management-chicken-rice:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),1,1,1,0,true,
    '5b565f1d3475480143b2c14807026f785d1236264591f5bf83802d86a1e8dc06',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,
      'official_page_captured_at','2026-07-01T20:00:58.098Z',
      'official_page_sha256','5b565f1d3475480143b2c14807026f785d1236264591f5bf83802d86a1e8dc06',
      'official_gtin','038100132505','official_package_size','34 lb',
      'ingredient_count',43,'walmart_listing_id','34200465',
      'chewy_listing_id','52407','petsmart_gtin','038100132505'
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),expected_count=1,observed_count=1,
    accepted_count=1,rejected_count=0,pagination_complete=true,
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
    v_run,v_formula,'purina-manufacturer-manual','038100132505',v_source,'manufacturer',
    '038100132505','Nestlé Purina PetCare Company','Purina Pro Plan',
    product_name,'Pro Plan Adult Large Breed Weight Management','dog','adult','dry',
    'Chicken & Rice Formula','weight management','34 lb',ingredient_text,v_front,
    true,true,now(),
    encode(digest(v_source||'|'||ingredient_text||'|'||v_front,'sha256'),'hex'),
    'accepted',ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_page',v_source,'official_front_image',v_front,
      'official_gtin','038100132505','official_package_size','34 lb',
      'ingredient_count',43,'walmart_listing_id','34200465',
      'complete_food_statement','100 percent complete and balanced nutrition for overweight or less active dogs weighing over 50 pounds'
    )
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(run_id,source_slug,source_external_id,content_hash) DO UPDATE SET
    formula_id=excluded.formula_id,validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[],raw_payload=excluded.raw_payload,
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
      ('front_image_url',v_front),('official_gtin','038100132505'),
      ('package_size','34 lb'),('life_stage','adult'),('food_form','dry'),
      ('breed_size','large breed'),('diet_condition','weight management'),
      ('recipe','chicken and rice'),
      ('complete_food_evidence','100 percent complete and balanced nutrition for overweight or less active dogs weighing over 50 pounds')
  ) evidence(field_name,field_value)
  ON CONFLICT(formula_id,field_name,source_url,content_hash) DO UPDATE SET
    accepted=true,observed_at=excluded.observed_at;

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
    'manual-search:purina-pro-plan:large-breed-weight-management-chicken-rice:20260725',
    formula_key,formula_key,'Purina Pro Plan',product_name,
    'Purina Pro Plan Weight Management Large Breed Adult Chicken Rice Dry Dog Food ingredients',
    jsonb_build_array(
      v_source,
      'https://www.walmart.com/ip/Purina-Pro-Plan-Weight-Management-Dry-Dog-Food-for-Large-Breed-Adults-Chicken-Rice-34-lb-Bag/34200465',
      'https://www.chewy.com/purina-pro-plan-adult-large-breed/dp/52407'
    ),
    v_source,'manufacturer_page',
    jsonb_build_object(
      'brand','Purina Pro Plan','line','Large Breed Weight Management',
      'pet_type','dog','life_stage','adult','breed_size','large breed',
      'food_form','dry','flavor','Chicken & Rice','diet','weight management'
    ),
    jsonb_build_object(
      'brand','Purina Pro Plan','product_line','Adult Large Breed Weight Management',
      'pet_type','dog','life_stage','adult','food_form','dry',
      'flavor','Chicken & Rice Formula','gtin','038100132505','package_size','34 lb'
    ),
    'promoted',NULL,
    '5b565f1d3475480143b2c14807026f785d1236264591f5bf83802d86a1e8dc06',
    encode(digest(ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Current official Purina page verifies the exact adult large-breed Weight Management Chicken & Rice dry dog formula, 43 ingredients, official 34 lb GTIN, matching front image, and complete-food statement. Walmart 34200465, Chewy 52407, and PetSmart evidence already map to this same formula.',
    v_source,'source_text_exact',encode(digest(ingredient_text,'sha256'),'hex'),
    '[]'::JSONB,now()
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(review_key) DO UPDATE SET
    authoritative_source_url=excluded.authoritative_source_url,
    expected_identity=excluded.expected_identity,
    resolved_identity=excluded.resolved_identity,evidence_status='promoted',
    quarantine_reason=NULL,observed_at=excluded.observed_at,
    formula_id=excluded.formula_id,promoted_cache_key=excluded.promoted_cache_key,
    attempt_count=public.catalog_manual_evidence_reviews.attempt_count+1,
    review_notes=excluded.review_notes,updated_at=now();

  UPDATE public.catalog_acquisition_queue SET
    status='resolved',resolved_at=now(),
    resolution_reason='Exact current Purina Pro Plan Adult Large Breed Weight Management Chicken & Rice formula promoted from official manufacturer evidence.',
    acquisition_notes='Official Purina page verifies 43 exact ingredients, adult/large-breed/weight-management/dry/Chicken & Rice identity, GTIN 038100132505, 34 lb package, matching front image, and complete-food evidence. Walmart 34200465 maps to the same canonical formula.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:f909bc8541dcf9b5c2287685a16b7cd1';

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Purina Pro Plan Weight Management Dry Dog Food for Large Breed Adults Chicken Rice',8
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_barcode
  FROM public.resolve_verified_product_by_gtin('038100132505',8)
  ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache OR v_barcode IS DISTINCT FROM v_cache THEN
    RAISE EXCEPTION 'Large Breed Weight Management search/barcode regression: search %, barcode %',
      v_top,v_barcode;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND cardinality(ingredients)=43
      AND life_stage='adult' AND diet_condition='weight management'
  ) THEN
    RAISE EXCEPTION 'Large Breed Weight Management canonical formula not promoted';
  END IF;
END
$$;
