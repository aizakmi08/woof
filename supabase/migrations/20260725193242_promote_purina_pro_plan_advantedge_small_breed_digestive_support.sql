DO $$
DECLARE
  v_formula BIGINT := 6292;
  v_retailer_formula BIGINT := 8095;
  v_discovery_formula BIGINT := 18410;
  v_cache TEXT := 'nestle-purina-pro-plan:038100106841';
  v_retailer_cache TEXT := 'petsmart-retail-catalog:038100106865';
  v_source TEXT := 'https://www.purina.com/dogs/shop/pro-plan-advantedge-digestive-support-small-breed-salmon-oatmeal-dry-dog-food';
  v_pdf TEXT := 'https://www.purina.com/sites/default/files/product-label-deck-file/2025-12/3207_a320725_pro_plan_advantedge_digestive_support_sm_breed_salmon_oat_meal_dry_dog_food_1pk.pdf';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2025-12/pro-plan-advantedge-digestive-support-small-breed-dry-dog-food.png';
  v_ingredient_text TEXT := 'Salmon, oat meal, rice, barley, fish meal, beef fat preserved with mixed tocopherols, dried yeast, salmon meal, canola meal, natural flavor, pea protein, sunflower oil, fish oil, dried chicory root, L-Lysine monohydrochloride, calcium carbonate, salt, potassium chloride, VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), Vitamin A supplement, thiamine mononitrate (Vitamin B-1), calcium pantothenate (Vitamin B-5), riboflavin supplement (Vitamin B-2), Vitamin B-12 supplement, pyridoxine hydrochloride (Vitamin B-6), menadione sodium bisulfite complex (Vitamin K), folic acid (Vitamin B-9), biotin (Vitamin B-7), Vitamin D-3 supplement], MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate, calcium iodate, sodium selenite], choline chloride, DL-Methionine, L-ascorbyl-2-polyphosphate (Vitamin C), dried Bacillus coagulans fermentation product, dried Lactobacillus fermentum fermentation product, dried Lactobacillus delbrueckii fermentation product.';
  v_ingredients TEXT[];
  v_run BIGINT;
  v_top TEXT;
  v_barcode_35 TEXT;
  v_barcode_12 TEXT;
BEGIN
  SELECT ingredients INTO STRICT v_ingredients
  FROM public.product_data
  WHERE cache_key=v_retailer_cache
    AND gtin='038100106865'
    AND pet_type='dog'
    AND food_form='dry'
    AND life_stage='adult'
    AND lower(product_name) LIKE '%small breed%'
    AND lower(product_name) LIKE '%salmon%'
    AND lower(product_name) LIKE '%oatmeal%';

  IF cardinality(v_ingredients)<>42
     OR array_to_string(v_ingredients,' ') NOT ILIKE '%Lactobacillus Fermentum%'
     OR array_to_string(v_ingredients,' ') NOT ILIKE '%Lactobacillus Delbrueckii%'
  THEN
    RAISE EXCEPTION 'Exact 42-item ingredient vector unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula
      AND formula_key='purina pro plan|purina pro plan|pro plan advantedge small breed adult digestive support|dog|adult|dry|pro plan advantedge small breed digestive support salmon and oat meal formula|'
      AND source_url=v_source
      AND source_authority='manufacturer'
  ) THEN
    RAISE EXCEPTION 'Canonical manufacturer formula missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='038100106841'
      AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
  ) THEN
    RAISE EXCEPTION 'Canonical manufacturer serving row missing';
  END IF;

  UPDATE public.product_data SET
    product_name='Pro Plan AdvantEDGE Small Breed Adult Digestive Support+ Salmon & Oat Meal Formula Dry Dog Food',
    brand='Purina Pro Plan',
    ingredients=v_ingredients,
    ingredient_text=v_ingredient_text,
    ingredient_count=42,
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
    gtin='038100106841',
    product_line='Pro Plan AdvantEDGE Small Breed Adult Digestive Support+',
    flavor='Salmon & Oat Meal Formula',
    life_stage='adult',
    food_form='dry',
    package_size='3.5 lb'
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',
    updated_at=now()
  WHERE cache_key IN (
    v_retailer_cache,
    'purina pro plan advantedge digestive support plus small breed salmon and oat meal adult dry'
  );

  UPDATE public.catalog_formulas SET
    product_name='Pro Plan AdvantEDGE Small Breed Adult Digestive Support+ Salmon & Oat Meal Formula Dry Dog Food',
    product_line='pro plan advantedge small breed adult digestive support',
    pet_type='dog',
    life_stage='adult',
    food_form='dry',
    flavor='pro plan advantedge small breed digestive support salmon and oat meal formula',
    diet_condition='',
    is_complete_food=true,
    complete_food_evidence='Animal feeding tests using AAFCO procedures substantiate that this exact formula provides complete and balanced nutrition for maintenance of adult dogs.',
    ingredient_text=v_ingredient_text,
    ingredients=v_ingredients,
    front_image_url=v_front,
    source_url=v_source,
    source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'purina pro plan','pro plan','advantedge','digestive support',
      'small breed','adult','salmon','oat meal','dog','dry'
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
    ingredient_text=CASE WHEN source_slug='nestle-purina-pro-plan'
      THEN v_ingredient_text ELSE ingredient_text END,
    validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[]
  WHERE formula_id IN (v_formula,v_retailer_formula,v_discovery_formula)
     OR (source_slug='chewy-public-sitemap' AND source_external_id IN ('3583863','3583871'))
     OR gtin IN ('038100106841','038100106865');

  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE formula_id IN (v_retailer_formula,v_discovery_formula)
     OR (source_slug='chewy-public-sitemap' AND source_external_id IN ('3583863','3583871'))
     OR gtin IN ('038100106841','038100106865');

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT alias_key,v_formula,f.identity_hash,'manual_review',v_source,
    jsonb_build_object(
      'exact_formula_identity',true,
      'canonical_formula_id',v_formula,
      'ingredient_pdf',v_pdf,
      'reconciled_at',now()
    ),now()
  FROM unnest(ARRAY[
    'purina pro plan|purina pro plan|purina pro plan advantedge digestive support small breed adult dry dog food salmon and oatmeal|dog|adult|dry||',
    'purina pro plan|purina pro plan|purina pro plan advantedge digestive support plus small breed salmon and oat meal formula adult dry dog food|dog|adult|dry||'
  ]::TEXT[]) alias_key
  JOIN public.catalog_formulas f ON f.id=v_formula
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
    complete_food_evidence='Superseded exact size/title duplicate; GTIN 038100106865 and retailer evidence are retained as children of canonical manufacturer formula 6292.',
    updated_at=now()
  WHERE id=v_retailer_formula;

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',
    active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,
    promoted_at=NULL,
    complete_food_evidence='Superseded exact Chewy discovery duplicate; listing identifiers 3583863 and 3583871 are retained as children of canonical manufacturer formula 6292.',
    updated_at=now()
  WHERE id=v_discovery_formula;

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,
      'Purina Pro Plan AdvantEDGE Digestive Support Plus Small Breed Salmon and Oat Meal Adult Dry Dog Food',
      public.normalize_verified_product_search_query('Purina Pro Plan AdvantEDGE Digestive Support Plus Small Breed Salmon and Oat Meal Adult Dry Dog Food'),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'species_boundary','dog','life_stage_boundary','adult',
        'breed_size_boundary','small breed','food_form_boundary','dry',
        'recipe_boundary','salmon and oat meal','line_boundary','advantedge digestive support'
      )
    ),
    (
      v_cache,
      'Purina Pro Plan AdvantEDGE Digestive Support Small Breed Adult Dry Dog Food Salmon and Oatmeal',
      public.normalize_verified_product_search_query('Purina Pro Plan AdvantEDGE Digestive Support Small Breed Adult Dry Dog Food Salmon and Oatmeal'),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'retailer_title_alias',true,
        'species_boundary','dog','life_stage_boundary','adult',
        'breed_size_boundary','small breed','food_form_boundary','dry',
        'recipe_boundary','salmon and oatmeal','line_boundary','advantedge digestive support'
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
    'manual-exact-evidence:purina-pro-plan:advantedge-small-breed-digestive-support:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),1,1,1,0,true,
    '7aea006469d7db22d20e5b23e085695d979310e16a76e4230b807cb3a07beb59',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,
      'official_page_captured_at','2026-07-24T06:26:39.356Z',
      'official_pdf_captured_at','2026-06-29T21:30:59.593Z',
      'official_pdf_sha256','7aea006469d7db22d20e5b23e085695d979310e16a76e4230b807cb3a07beb59',
      'official_gtin','038100106841',
      'retailer_verified_gtin','038100106865',
      'package_sizes',jsonb_build_array('3.5 lb','12 lb'),
      'ingredient_parser_repair','restored Lactobacillus fermentum and removed duplicated Lactobacillus delbrueckii',
      'duplicate_formula_ids',jsonb_build_array(v_retailer_formula,v_discovery_formula)
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
  ) VALUES(
    v_run,v_formula,'purina-manufacturer-manual','038100106841',v_source,'manufacturer',
    '038100106841','Nestlé Purina PetCare Company','Purina Pro Plan',
    'Pro Plan AdvantEDGE Small Breed Adult Digestive Support+ Salmon & Oat Meal Formula Dry Dog Food',
    'Pro Plan AdvantEDGE Small Breed Adult Digestive Support+','dog','adult','dry',
    'Salmon & Oat Meal Formula','','3.5 lb',v_ingredient_text,v_front,true,true,now(),
    encode(digest(v_source||'|'||v_pdf||'|'||v_ingredient_text||'|'||v_front,'sha256'),'hex'),
    'accepted',ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_page',v_source,
      'official_ingredient_pdf',v_pdf,
      'official_front_image',v_front,
      'official_gtin','038100106841',
      'retailer_verified_gtin','038100106865',
      'official_package_size','3.5 lb',
      'retailer_verified_package_size','12 lb',
      'complete_food_statement','Animal feeding tests using AAFCO procedures substantiate complete and balanced nutrition for maintenance of adult dogs.',
      'official_pdf_sha256','7aea006469d7db22d20e5b23e085695d979310e16a76e4230b807cb3a07beb59'
    )
  )
  ON CONFLICT(run_id,source_slug,source_external_id,content_hash) DO UPDATE SET
    formula_id=excluded.formula_id,
    ingredient_text=excluded.ingredient_text,
    front_image_url=excluded.front_image_url,
    validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[],
    raw_payload=excluded.raw_payload,
    observed_at=now();

  INSERT INTO public.catalog_field_evidence(
    formula_id,observation_id,field_name,field_value,source_url,
    source_authority,accepted,observed_at,content_hash
  )
  SELECT v_formula,NULL,field_name,to_jsonb(field_value),evidence_url,'manufacturer',
    true,now(),
    encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||evidence_url,'sha256'),'hex')
  FROM (
    VALUES
      ('ingredient_text',v_ingredient_text,v_pdf),
      ('front_image_url',v_front,v_source),
      ('ingredient_pdf_url',v_pdf,v_pdf),
      ('official_gtin','038100106841',v_pdf),
      ('retailer_verified_gtin','038100106865','https://www.petsmart.com/dog/food/dry-food/purina-pro-plan-advantedge-digestive-support-small-breed-adult-dry-dog-food-salmon-and-oatmeal-96295.html'),
      ('package_sizes','3.5 lb; 12 lb',v_source),
      ('complete_food_evidence','Maintenance of adult dogs',v_source),
      ('food_form','dry',v_source),
      ('life_stage','adult',v_source),
      ('breed_size','small breed',v_source),
      ('recipe','salmon and oat meal',v_source)
  ) evidence(field_name,field_value,evidence_url)
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
    'manual-search:purina-pro-plan:advantedge-small-breed-digestive-support:20260725',
    formula_key,formula_key,'Purina Pro Plan',product_name,
    'Purina Pro Plan AdvantEDGE Digestive Support Small Breed Salmon Oat Meal ingredients',
    jsonb_build_array(
      v_source,v_pdf,
      'https://www.chewy.com/purina-pro-plan-advantedge-digestive/dp/3583863',
      'https://www.chewy.com/purina-pro-plan-advantedge-digestive/dp/3583871'
    ),
    v_source,'manufacturer_pdf',
    jsonb_build_object(
      'brand','Purina Pro Plan','line','AdvantEDGE Digestive Support',
      'pet_type','dog','life_stage','adult','breed_size','small breed',
      'food_form','dry','flavor','Salmon & Oat Meal'
    ),
    jsonb_build_object(
      'manufacturer','Nestlé Purina PetCare Company','brand','Purina Pro Plan',
      'product_line','AdvantEDGE Small Breed Adult Digestive Support+',
      'pet_type','dog','life_stage','adult','food_form','dry',
      'flavor','Salmon & Oat Meal Formula',
      'gtins',jsonb_build_array('038100106841','038100106865'),
      'package_sizes',jsonb_build_array('3.5 lb','12 lb')
    ),
    'promoted',NULL,
    encode(digest(v_source||'|'||v_pdf||'|'||v_front,'sha256'),'hex'),
    encode(digest(v_ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Official Purina page and label PDF verify exact small-breed adult dry Salmon & Oat Meal identity, 42 ingredients, official 3.5 lb GTIN, front image, and adult-maintenance adequacy. Exact 12 lb PetSmart GTIN and both Chewy aliases were consolidated. Import corruption that dropped Lactobacillus fermentum and duplicated Lactobacillus delbrueckii was repaired.',
    v_pdf,'source_text_exact',
    encode(digest(v_ingredient_text,'sha256'),'hex'),
    jsonb_build_array(jsonb_build_object(
      'type','parser_repair',
      'removed','duplicate Dried Lactobacillus delbrueckii fermentation product',
      'restored','Dried Lactobacillus fermentum fermentation product',
      'basis','official Purina label statement'
    )),
    now()
  FROM public.catalog_formulas
  WHERE id=v_formula
  ON CONFLICT(review_key) DO UPDATE SET
    target_formula_key=excluded.target_formula_key,
    corrected_formula_key=excluded.corrected_formula_key,
    product_name=excluded.product_name,
    authoritative_source_url=excluded.authoritative_source_url,
    authoritative_source_type=excluded.authoritative_source_type,
    expected_identity=excluded.expected_identity,
    resolved_identity=excluded.resolved_identity,
    evidence_status='promoted',
    quarantine_reason=NULL,
    authoritative_content_hash=excluded.authoritative_content_hash,
    ingredient_text_hash=excluded.ingredient_text_hash,
    front_image_url_hash=excluded.front_image_url_hash,
    observed_at=excluded.observed_at,
    formula_id=excluded.formula_id,
    promoted_cache_key=excluded.promoted_cache_key,
    attempt_count=public.catalog_manual_evidence_reviews.attempt_count+1,
    review_notes=excluded.review_notes,
    ingredient_evidence_url=excluded.ingredient_evidence_url,
    ingredient_evidence_mode=excluded.ingredient_evidence_mode,
    ingredient_original_text_hash=excluded.ingredient_original_text_hash,
    ingredient_corrections=excluded.ingredient_corrections,
    updated_at=now();

  UPDATE public.catalog_acquisition_queue SET
    status='resolved',
    resolved_at=now(),
    resolution_reason='Exact current Purina Pro Plan AdvantEDGE Small Breed Adult Digestive Support+ Salmon & Oat Meal formula promoted from official manufacturer evidence.',
    acquisition_notes='Official Purina page and label PDF verify 42 ingredients, exact dog/adult/small-breed/dry/Salmon & Oat Meal identity, GTIN 038100106841, front image, and complete-food adequacy. Exact 12 lb GTIN 038100106865 and Chewy listing IDs 3583863/3583871 were linked as formula children.',
    needs_product_record=false,
    needs_verified_ingredients=false,
    needs_verified_image=false,
    needs_pet_type=false,
    ready_rows=1,
    last_refreshed_at=now(),
    updated_at=now()
  WHERE gap_key='census:612fc079ec27062a606e67e62ada766f';

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Purina Pro Plan AdvantEDGE Digestive Support Small Breed Salmon Oat Meal Adult Dry Dog Food',8
  )
  ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_barcode_35
  FROM public.resolve_verified_product_by_gtin('038100106841',8)
  ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_barcode_12
  FROM public.resolve_verified_product_by_gtin('038100106865',8)
  ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache
     OR v_barcode_35 IS DISTINCT FROM v_cache
     OR v_barcode_12 IS DISTINCT FROM v_cache
  THEN
    RAISE EXCEPTION 'Search/barcode regression: search %, 3.5 lb %, 12 lb %',
      v_top,v_barcode_35,v_barcode_12;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (v_retailer_formula,v_discovery_formula)
      AND (active OR verification_status<>'quarantined')
  ) THEN
    RAISE EXCEPTION 'Duplicate formulas remain active';
  END IF;

  IF (SELECT count(*) FROM public.catalog_formulas
      WHERE id=v_formula AND active AND verification_status='verified'
        AND promoted_cache_key=v_cache AND cardinality(ingredients)=42)<>1
  THEN
    RAISE EXCEPTION 'Canonical formula not uniquely promoted';
  END IF;

  IF (SELECT count(*) FROM public.catalog_skus
      WHERE formula_id=v_formula AND active
        AND gtin IN ('038100106841','038100106865'))<>2
  THEN
    RAISE EXCEPTION 'Exact GTIN children missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache
      AND (
        cardinality(ingredients)<>42
        OR ingredient_text NOT ILIKE '%Lactobacillus fermentum%'
        OR ingredient_text ~* 'delbrueckii fermentation product,\s*dried lactobacillus delbrueckii'
      )
  ) THEN
    RAISE EXCEPTION 'Ingredient repair failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_acquisition_queue
    WHERE gap_key='census:612fc079ec27062a606e67e62ada766f'
      AND status='resolved'
      AND needs_product_record=false
      AND needs_verified_ingredients=false
      AND needs_verified_image=false
  ) THEN
    RAISE EXCEPTION 'Acquisition gap did not close';
  END IF;
END
$$;
