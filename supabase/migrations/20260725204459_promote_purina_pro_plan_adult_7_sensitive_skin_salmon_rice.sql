DO $$
DECLARE
  v_senior BIGINT;
  v_puppy BIGINT;
  v_adult BIGINT;
  v_petsmart_duplicate BIGINT;
  v_chewy_senior_duplicate BIGINT;
  v_walmart_senior_duplicate BIGINT;
  v_walmart_adult_duplicate BIGINT;
  v_cache TEXT := 'nestle-purina-pro-plan:038100189646';
  v_petsmart_cache TEXT := 'petsmart-retail-catalog:038100189684';
  v_source TEXT := 'https://www.purina.com/dogs/shop/pro-plan-senior-salmon-and-rice-dry-dog-food';
  v_pdf TEXT := 'https://www.purina.com/sites/default/files/product-label-deck-file/2024-01/4427-b442722-pro-plan-adult-7-sensitive-skin-stomach-salmon-rice-dog-food-dry-h28-.pdf';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2024-01/ppdog_snr_a7_sss_slmnrc_hero_f_23.png';
  v_petsmart TEXT := 'https://www.petsmart.com/dog/food/dry-food/purina-pro-plan-sensitive-skin-and-stomach-senior-7-dry-dog-food-salmon-and-rice-70862.html';
  v_ingredient_text TEXT := 'Salmon, rice, barley, canola meal, fish meal, oat meal, pea protein, beef fat preserved with mixed-tocopherols, salmon meal, dried yeast, natural flavor, sunflower oil, dried chicory root, calcium carbonate, fish oil, L-Lysine monohydrochloride, salt, potassium chloride, MINERALS [zinc proteinate, manganese proteinate, ferrous sulfate, copper proteinate, calcium iodate, sodium selenite], VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), Vitamin A supplement, calcium pantothenate (Vitamin B-5), thiamine mononitrate (Vitamin B-1), Vitamin B-12 supplement, riboflavin supplement (Vitamin B-2), pyridoxine hydrochloride (Vitamin B-6), folic acid (Vitamin B-9), menadione sodium bisulfite complex (Vitamin K), biotin (Vitamin B-7), Vitamin D-3 supplement], DL-Methionine, choline chloride, glucosamine hydrochloride, L-ascorbyl-2-polyphosphate (Vitamin C).';
  v_ingredients TEXT[] := ARRAY[
    'Salmon','rice','barley','canola meal','fish meal','oat meal','pea protein',
    'beef fat preserved with mixed-tocopherols','salmon meal','dried yeast',
    'natural flavor','sunflower oil','dried chicory root','calcium carbonate',
    'fish oil','L-Lysine monohydrochloride','salt','potassium chloride',
    'zinc proteinate','manganese proteinate','ferrous sulfate','copper proteinate',
    'calcium iodate','sodium selenite','Vitamin E supplement',
    'niacin (Vitamin B-3)','Vitamin A supplement',
    'calcium pantothenate (Vitamin B-5)','thiamine mononitrate (Vitamin B-1)',
    'Vitamin B-12 supplement','riboflavin supplement (Vitamin B-2)',
    'pyridoxine hydrochloride (Vitamin B-6)','folic acid (Vitamin B-9)',
    'menadione sodium bisulfite complex (Vitamin K)','biotin (Vitamin B-7)',
    'Vitamin D-3 supplement','DL-Methionine','choline chloride',
    'glucosamine hydrochloride','L-ascorbyl-2-polyphosphate (Vitamin C)'
  ]::TEXT[];
  v_run BIGINT;
  v_top TEXT;
  v_top_chewy TEXT;
  v_barcode_official TEXT;
  v_barcode_petsmart TEXT;
BEGIN
  SELECT id INTO STRICT v_senior FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|pro plan adult 7 sensitive skin and stomach|dog|senior|dry|salmon and rice|';
  SELECT id INTO STRICT v_puppy FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|pro plan sensitive skin and stomach|dog|puppy|dry|pro plan sensitive skin and stomach salmon and rice formula|';
  SELECT id INTO STRICT v_adult FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|pro plan adult sensitive skin and stomach|dog|adult|dry|salmon and rice formula|';
  SELECT id INTO STRICT v_petsmart_duplicate FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan sensitive skin and stomach senior 7 dry dog food salmon and rice|dog|senior|dry|salmon|';
  SELECT id INTO STRICT v_chewy_senior_duplicate FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan sensitive skin and stomach 7 salmon and rice formula dry dog food|dog|unknown|dry||';
  SELECT id INTO STRICT v_walmart_senior_duplicate FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan sensitive skin stomach dry dog food for seniors salmon rice|dog|unknown|dry||';
  SELECT id INTO STRICT v_walmart_adult_duplicate FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan sensitive skin stomach dry dog food for adults salmon rice|dog|unknown|dry||';

  IF cardinality(v_ingredients)<>40
     OR v_ingredients[11]<>'natural flavor'
     OR v_ingredients[40]<>'L-ascorbyl-2-polyphosphate (Vitamin C)'
  THEN
    RAISE EXCEPTION 'Exact Adult 7+ Sensitive Skin & Stomach official ingredient vector unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='038100189646'
      AND brand='Purina Pro Plan' AND pet_type='dog'
      AND life_stage='senior' AND food_form='dry'
      AND flavor='Salmon & Rice' AND package_size='4 lb'
      AND source_quality='manufacturer' AND source_url=v_source
      AND image_url=v_front AND ingredient_count=40
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_petsmart_cache AND gtin='038100189684'
      AND brand='Purina Pro Plan' AND pet_type='dog'
      AND life_stage='senior' AND food_form='dry'
      AND package_size='24 Lb' AND ingredient_count=40
      AND source_quality='retailer_verified' AND source_url=v_petsmart
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Adult 7+ Sensitive Skin & Stomach manufacturer or PetSmart preconditions failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_senior AND active AND verification_status='verified'
      AND source_authority='manufacturer' AND pet_type='dog'
      AND life_stage='senior' AND food_form='dry'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_adult AND active AND verification_status='verified'
      AND source_authority='manufacturer' AND life_stage='adult'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_puppy AND active AND verification_status='verified'
      AND source_authority='manufacturer' AND life_stage='puppy'
  ) THEN
    RAISE EXCEPTION 'Sensitive Skin & Stomach hard life-stage formula boundaries unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='chewy-public-sitemap' AND source_external_id='379218'
      AND product_name ILIKE '%7+%'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='walmart-public-sitemap' AND source_external_id='320791032'
      AND source_url ILIKE '%for-Seniors%'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='chewy-public-sitemap' AND source_external_id='128666'
      AND life_stage='adult'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='walmart-public-sitemap' AND source_external_id='998905097'
      AND source_url ILIKE '%for-Adults%'
  ) THEN
    RAISE EXCEPTION 'Retail life-stage alias evidence unavailable';
  END IF;

  UPDATE public.product_data SET
    ingredients=v_ingredients,ingredient_text=v_ingredient_text,ingredient_count=40,
    product_name='Pro Plan Adult 7+ Sensitive Skin & Stomach Salmon & Rice Senior Dry Dog Food',
    product_line='Pro Plan Adult 7+ Sensitive Skin & Stomach',
    pet_type='dog',life_stage='senior',food_form='dry',flavor='Salmon & Rice',
    is_complete_food=true,source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    scraped_at=now(),expires_at=now()+interval '365 days',verified_at=now(),
    updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',updated_at=now()
  WHERE cache_key=v_petsmart_cache;

  UPDATE public.catalog_formulas SET
    product_name='Pro Plan Adult 7+ Sensitive Skin & Stomach Salmon & Rice Senior Dry Dog Food',
    product_line='pro plan adult 7 sensitive skin and stomach',
    pet_type='dog',life_stage='senior',food_form='dry',
    flavor='salmon and rice',diet_condition='',
    ingredient_text=v_ingredient_text,ingredients=v_ingredients,
    is_complete_food=true,
    complete_food_evidence='Animal feeding tests using AAFCO procedures substantiate that this exact Pro Plan Adult 7+ Sensitive Skin & Stomach Salmon & Rice Formula provides complete and balanced nutrition for maintenance of adult dogs.',
    front_image_url=v_front,source_url=v_source,source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'purina pro plan','pro plan','adult 7+','senior','sensitive skin',
      'sensitive stomach','salmon','rice','dog','dry'
    ]::TEXT[],
    verification_status='verified',active=true,absent_since=NULL,
    promoted_cache_key=v_cache,promoted_at=now(),last_observed_at=now(),updated_at=now()
  WHERE id=v_senior;

  UPDATE public.catalog_observations SET
    formula_id=v_senior,life_stage='senior',food_form='dry',
    flavor=CASE WHEN source_slug='nestle-purina-pro-plan' THEN 'salmon and rice' ELSE flavor END,
    ingredient_text=CASE
      WHEN source_slug IN ('nestle-purina-pro-plan','purina-manufacturer-manual')
      THEN v_ingredient_text ELSE ingredient_text END,
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_adult_7_senior_formula',
        'canonical_formula_id',v_senior,
        'hard_boundary','adult 7+ senior'
      )
    )
  WHERE formula_id IN (
      v_senior,v_petsmart_duplicate,v_chewy_senior_duplicate,v_walmart_senior_duplicate
    )
     OR gtin IN ('038100189646','038100189684')
     OR (source_slug='chewy-public-sitemap' AND source_external_id='379218')
     OR (source_slug='walmart-public-sitemap' AND source_external_id='320791032');

  UPDATE public.catalog_skus SET formula_id=v_senior,updated_at=now()
  WHERE formula_id IN (
      v_petsmart_duplicate,v_chewy_senior_duplicate,v_walmart_senior_duplicate
    )
     OR gtin IN ('038100189646','038100189684')
     OR (source_slug='chewy-public-sitemap' AND source_external_id='379218')
     OR (source_slug='walmart-public-sitemap' AND source_external_id='320791032');

  UPDATE public.catalog_observations SET
    formula_id=v_adult,life_stage='adult',food_form='dry',
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_adult_formula',
        'canonical_formula_id',v_adult,
        'hard_boundary','adult, not puppy or senior'
      )
    )
  WHERE formula_id=v_walmart_adult_duplicate
     OR (source_slug='chewy-public-sitemap' AND source_external_id='128666')
     OR (source_slug='walmart-public-sitemap' AND source_external_id='998905097');

  UPDATE public.catalog_skus SET formula_id=v_adult,updated_at=now()
  WHERE formula_id=v_walmart_adult_duplicate
     OR (source_slug='chewy-public-sitemap' AND source_external_id='128666')
     OR (source_slug='walmart-public-sitemap' AND source_external_id='998905097');

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT alias_key,canonical_id,f.identity_hash,'manual_review',alias_url,
    jsonb_build_object(
      'exact_formula_identity',true,
      'hard_life_stage_boundary',boundary,
      'ingredient_pdf',CASE WHEN canonical_id=v_senior THEN v_pdf ELSE NULL END,
      'reconciled_at',now()
    ),now()
  FROM (
    VALUES
      (
        'purina pro plan|purina pro plan|purina pro plan sensitive skin and stomach senior 7 dry dog food salmon and rice|dog|senior|dry|salmon|',
        v_senior,v_petsmart,'adult 7+ senior'
      ),
      (
        'purina pro plan|purina pro plan|purina pro plan sensitive skin and stomach 7 salmon and rice formula dry dog food|dog|unknown|dry||',
        v_senior,'https://www.chewy.com/purina-pro-plan-sensitive-skin/dp/379218','adult 7+ senior'
      ),
      (
        'purina pro plan|purina pro plan|purina pro plan sensitive skin stomach dry dog food for seniors salmon rice|dog|unknown|dry||',
        v_senior,'https://www.walmart.com/ip/Purina-Pro-Plan-Sensitive-Skin-Stomach-Dry-Dog-Food-for-Seniors-Salmon-Rice-16-lb-Bag/320791032','senior'
      ),
      (
        'purina pro plan|purina pro plan|purina pro plan sensitive skin stomach dry dog food for adults salmon rice|dog|unknown|dry||',
        v_adult,'https://www.walmart.com/ip/Purina-Pro-Plan-Sensitive-Skin-Stomach-Dry-Dog-Food-for-Adults-Salmon-Rice-16-lb-Bag/998905097','adult'
      )
  ) x(alias_key,canonical_id,alias_url,boundary)
  JOIN public.catalog_formulas f ON f.id=canonical_id
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence=CASE id
      WHEN v_petsmart_duplicate THEN
        'Superseded exact PetSmart size/title duplicate. GTIN 038100189684 remains a child of the canonical manufacturer Adult 7+ senior formula.'
      WHEN v_chewy_senior_duplicate THEN
        'Superseded exact Chewy Adult 7+ discovery duplicate. Listing 379218 remains attached only to the canonical Adult 7+ senior formula.'
      WHEN v_walmart_senior_duplicate THEN
        'Superseded exact Walmart senior discovery duplicate. Listing 320791032 remains attached only to the canonical Adult 7+ senior formula.'
      WHEN v_walmart_adult_duplicate THEN
        'Superseded exact Walmart adult discovery duplicate. Listing 998905097 remains attached only to the canonical adult formula and never the puppy or senior formula.'
    END,
    updated_at=now()
  WHERE id IN (
    v_petsmart_duplicate,v_chewy_senior_duplicate,
    v_walmart_senior_duplicate,v_walmart_adult_duplicate
  );

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,
      'Purina Pro Plan Adult 7+ Sensitive Skin & Stomach Salmon & Rice Senior Dry Dog Food',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan Adult 7+ Sensitive Skin & Stomach Salmon & Rice Senior Dry Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'species_boundary','dog','life_stage_boundary','adult 7+ senior',
        'food_form_boundary','dry','line_boundary','Sensitive Skin & Stomach',
        'recipe_boundary','salmon and rice'
      )
    ),
    (
      v_cache,
      'Purina Pro Plan Sensitive Skin & Stomach 7+ Salmon & Rice Formula Dry Dog Food',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan Sensitive Skin & Stomach 7+ Salmon & Rice Formula Dry Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'chewy_listing_id','379218','species_boundary','dog',
        'life_stage_boundary','adult 7+ senior','food_form_boundary','dry',
        'recipe_boundary','salmon and rice'
      )
    ),
    (
      v_cache,
      'Purina Pro Plan Sensitive Skin & Stomach Senior 7+ Dry Dog Food Salmon & Rice',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan Sensitive Skin & Stomach Senior 7+ Dry Dog Food Salmon & Rice'
      ),
      v_petsmart,'retailer_verified',now(),
      jsonb_build_object(
        'petsmart_gtin','038100189684','species_boundary','dog',
        'life_stage_boundary','senior','food_form_boundary','dry',
        'recipe_boundary','salmon and rice'
      )
    ),
    (
      v_cache,
      'Purina Pro Plan Sensitive Skin Stomach Dry Dog Food for Seniors Salmon Rice',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan Sensitive Skin Stomach Dry Dog Food for Seniors Salmon Rice'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'walmart_listing_id','320791032','species_boundary','dog',
        'life_stage_boundary','senior','food_form_boundary','dry',
        'recipe_boundary','salmon and rice'
      )
    )
  ON CONFLICT(normalized_alias) WHERE active DO UPDATE SET
    cache_key=excluded.cache_key,alias_text=excluded.alias_text,
    source_url=excluded.source_url,source_authority=excluded.source_authority,
    evidence_observed_at=excluded.evidence_observed_at,
    provenance=excluded.provenance,updated_at=now();

  INSERT INTO public.catalog_source_runs(
    run_key,source_slug,source_type,coverage_role,status,started_at,finished_at,
    expected_count,observed_count,accepted_count,rejected_count,pagination_complete,
    source_content_hash,checkpoint,error_summary,metadata,updated_at
  ) VALUES(
    'manual-exact-evidence:purina-pro-plan:adult-7-sensitive-skin-salmon-rice:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),4,4,4,0,true,
    '0ae70bbc5a96328c6adaf526e53675fb043809c92a3a7b51b059e98178e57e8e',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,
      'official_page_captured_at','2026-07-24T06:27:00.837Z',
      'official_page_sha256','8afef5fc9ef2dfc7092f88ad36debbbb1ac6419a4504e091556ee21751c40d03',
      'official_pdf_captured_at','2026-06-30T04:29:39.507Z',
      'official_pdf_sha256','0ae70bbc5a96328c6adaf526e53675fb043809c92a3a7b51b059e98178e57e8e',
      'official_gtin','038100189646','retailer_verified_gtin','038100189684',
      'package_sizes',jsonb_build_array('4 lb','24 lb'),
      'ingredient_count',40,'chewy_listing_id','379218',
      'walmart_senior_listing_id','320791032',
      'life_stage_alias_repairs',jsonb_build_array(
        jsonb_build_object('source','chewy','external_id','128666','canonical_life_stage','adult'),
        jsonb_build_object('source','walmart','external_id','998905097','canonical_life_stage','adult'),
        jsonb_build_object('source','chewy','external_id','379218','canonical_life_stage','senior'),
        jsonb_build_object('source','walmart','external_id','320791032','canonical_life_stage','senior')
      )
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),observed_count=4,accepted_count=4,
    rejected_count=0,pagination_complete=true,
    source_content_hash=excluded.source_content_hash,error_summary=NULL,
    metadata=excluded.metadata,updated_at=now()
  RETURNING id INTO v_run;

  INSERT INTO public.catalog_field_evidence(
    formula_id,observation_id,field_name,field_value,source_url,
    source_authority,accepted,observed_at,content_hash
  )
  SELECT v_senior,NULL,field_name,to_jsonb(field_value),evidence_url,authority,
    true,now(),
    encode(digest(v_senior::TEXT||'|'||field_name||'|'||field_value||'|'||evidence_url,'sha256'),'hex')
  FROM (
    VALUES
      ('ingredient_text',v_ingredient_text,v_pdf,'manufacturer'),
      ('ingredient_pdf_url',v_pdf,v_pdf,'manufacturer'),
      ('front_image_url',v_front,v_source,'manufacturer'),
      ('official_gtin','038100189646',v_source,'manufacturer'),
      ('retailer_verified_gtin','038100189684',v_petsmart,'retailer_verified'),
      ('pet_type','dog',v_source,'manufacturer'),
      ('life_stage','senior',v_source,'manufacturer'),
      ('food_form','dry',v_source,'manufacturer'),
      ('complete_food_evidence','Maintenance of adult dogs',v_pdf,'manufacturer')
  ) evidence(field_name,field_value,evidence_url,authority)
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
    'manual-search:purina-pro-plan:adult-7-sensitive-skin-salmon-rice:20260725',
    formula_key,formula_key,'Purina Pro Plan',product_name,
    'Purina Pro Plan Adult 7+ Sensitive Skin Stomach Salmon Rice official ingredients',
    jsonb_build_array(
      v_source,v_pdf,v_petsmart,
      'https://www.chewy.com/purina-pro-plan-sensitive-skin/dp/379218',
      'https://www.walmart.com/ip/Purina-Pro-Plan-Sensitive-Skin-Stomach-Dry-Dog-Food-for-Seniors-Salmon-Rice-16-lb-Bag/320791032'
    ),
    v_source,'manufacturer_pdf',
    jsonb_build_object(
      'brand','Purina Pro Plan','line','Adult 7+ Sensitive Skin & Stomach',
      'pet_type','dog','life_stage','senior','food_form','dry',
      'flavor','Salmon & Rice'
    ),
    jsonb_build_object(
      'brand','Purina Pro Plan',
      'product_line','Adult 7+ Sensitive Skin & Stomach',
      'pet_type','dog','life_stage','senior','food_form','dry',
      'flavor','Salmon & Rice',
      'gtins',jsonb_build_array('038100189646','038100189684'),
      'ingredient_count',40
    ),
    'promoted',NULL,
    '0ae70bbc5a96328c6adaf526e53675fb043809c92a3a7b51b059e98178e57e8e',
    encode(digest(v_ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Official Purina label B442722 verifies the exact Adult 7+ Sensitive Skin & Stomach Salmon & Rice senior formula, 40 ingredients, adult-dog maintenance adequacy, official GTIN, and matching front image. PetSmart GTIN 038100189684, Chewy 379218, and Walmart 320791032 are exact senior aliases. Chewy 128666 and Walmart 998905097 were repaired to the separate adult formula; no adult or senior listing remains attached to the puppy formula.',
    v_pdf,'source_text_exact',encode(digest(v_ingredient_text,'sha256'),'hex'),
    jsonb_build_array(
      jsonb_build_object(
        'type','label_text_repair','removed','Natural Flavors',
        'restored','natural flavor',
        'basis','official Purina label PDF B442722'
      ),
      jsonb_build_object(
        'type','cross_life_stage_repair',
        'repaired_listings',jsonb_build_array('128666','998905097','379218','320791032'),
        'basis','explicit adult, Adult 7+, and senior retailer titles reconciled to official canonical formulas'
      )
    ),
    now()
  FROM public.catalog_formulas WHERE id=v_senior
  ON CONFLICT(review_key) DO UPDATE SET
    authoritative_source_url=excluded.authoritative_source_url,
    authoritative_source_type=excluded.authoritative_source_type,
    expected_identity=excluded.expected_identity,resolved_identity=excluded.resolved_identity,
    evidence_status='promoted',quarantine_reason=NULL,
    authoritative_content_hash=excluded.authoritative_content_hash,
    ingredient_text_hash=excluded.ingredient_text_hash,
    front_image_url_hash=excluded.front_image_url_hash,
    observed_at=excluded.observed_at,formula_id=excluded.formula_id,
    promoted_cache_key=excluded.promoted_cache_key,
    attempt_count=public.catalog_manual_evidence_reviews.attempt_count+1,
    review_notes=excluded.review_notes,ingredient_evidence_url=excluded.ingredient_evidence_url,
    ingredient_evidence_mode=excluded.ingredient_evidence_mode,
    ingredient_original_text_hash=excluded.ingredient_original_text_hash,
    ingredient_corrections=excluded.ingredient_corrections,updated_at=now();

  UPDATE public.catalog_acquisition_queue SET
    status='resolved',resolved_at=now(),
    resolution_reason='Exact current Purina Pro Plan Adult 7+ Sensitive Skin & Stomach Salmon & Rice formula promoted from official label evidence.',
    acquisition_notes='Official Purina label B442722 verifies 40 exact ingredients, dog/Adult 7+/senior/dry/Salmon & Rice identity, GTIN 038100189646, matching front image, and adult-dog maintenance adequacy. PetSmart GTIN 038100189684, Chewy 379218, and Walmart 320791032 are exact canonical children. Adult listings 128666 and 998905097 are attached only to the separate verified adult formula.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:41e5acc53660d1879ae50d40543a65f1';

  SELECT cache_key INTO v_top FROM public.search_verified_products(
    'Purina Pro Plan Adult 7+ Sensitive Skin & Stomach Salmon & Rice Senior Dry Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_top_chewy FROM public.search_verified_products(
    'Purina Pro Plan Sensitive Skin & Stomach 7+ Salmon & Rice Formula Dry Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_barcode_official
  FROM public.resolve_verified_product_by_gtin('038100189646',8)
  ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_barcode_petsmart
  FROM public.resolve_verified_product_by_gtin('038100189684',8)
  ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache
     OR v_top_chewy IS DISTINCT FROM v_cache
     OR v_barcode_official IS DISTINCT FROM v_cache
     OR v_barcode_petsmart IS DISTINCT FROM v_cache
  THEN
    RAISE EXCEPTION 'Adult 7+ Sensitive Skin regression: official %, Chewy %, official barcode %, PetSmart barcode %',
      v_top,v_top_chewy,v_barcode_official,v_barcode_petsmart;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE (
      source_slug='chewy-public-sitemap' AND source_external_id='379218'
      OR source_slug='walmart-public-sitemap' AND source_external_id='320791032'
    ) AND formula_id<>v_senior
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE (
      source_slug='chewy-public-sitemap' AND source_external_id='379218'
      OR source_slug='walmart-public-sitemap' AND source_external_id='320791032'
    ) AND formula_id<>v_senior
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE (
      source_slug='chewy-public-sitemap' AND source_external_id='128666'
      OR source_slug='walmart-public-sitemap' AND source_external_id='998905097'
    ) AND formula_id<>v_adult
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE (
      source_slug='chewy-public-sitemap' AND source_external_id='128666'
      OR source_slug='walmart-public-sitemap' AND source_external_id='998905097'
    ) AND formula_id<>v_adult
  ) THEN
    RAISE EXCEPTION 'Sensitive Skin & Stomach adult/senior life-stage aliases remain crossed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (
      v_petsmart_duplicate,v_chewy_senior_duplicate,
      v_walmart_senior_duplicate,v_walmart_adult_duplicate
    ) AND (active OR verification_status<>'quarantined')
  ) THEN
    RAISE EXCEPTION 'Sensitive Skin & Stomach exact discovery duplicates remain active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_senior AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND cardinality(ingredients)=40
      AND ingredients[11]='natural flavor'
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE formula_id=v_puppy AND (
      (source_slug='chewy-public-sitemap' AND source_external_id IN ('128666','379218'))
      OR (source_slug='walmart-public-sitemap' AND source_external_id IN ('998905097','320791032'))
    )
  ) THEN
    RAISE EXCEPTION 'Adult 7+ Sensitive Skin canonical formula not promoted or puppy crossing remains';
  END IF;
END
$$;
