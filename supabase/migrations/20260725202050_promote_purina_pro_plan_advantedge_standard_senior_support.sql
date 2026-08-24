DO $$
DECLARE
  v_formula BIGINT;
  v_retailer_formula BIGINT;
  v_discovery_formula BIGINT;
  v_cache TEXT := 'nestle-purina-pro-plan:038100106766';
  v_retailer_cache TEXT := 'petsmart-retail-catalog:038100106797';
  v_formula_key TEXT := 'purina pro plan|purina pro plan|pro plan advantedge adult 7 senior support shredded blend|dog|senior|dry|chicken and rice formula|';
  v_retailer_formula_key TEXT := 'purina pro plan|purina pro plan|purina pro plan advantedge senior dry dog food chicken and rice|dog|senior|dry||';
  v_discovery_formula_key TEXT := 'purina pro plan|purina pro plan|purina pro plan advantedge senior support plus shredded blend chicken and rice formula dry dog food|dog|senior|dry||';
  v_source TEXT := 'https://www.purina.com/dogs/shop/pro-plan-advantedge-senior-support-shredded-blend-chicken-rice-dry-dog-food';
  v_pdf TEXT := 'https://www.purina.com/sites/default/files/product-label-deck-file/2025-12/4388_a438825_pro_plan_advantedge_sr_support_shred_blend_chicken_rice_dry_dog_food_t49.pdf';
  v_petsmart TEXT := 'https://www.petsmart.com/dog/food/dry-food/purina-pro-plan-advantedge-senior-dry-dog-food-chicken-and-rice-96296.html';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2025-12/pro-plan-advantedge-senior-support-adult-dry-dog-food.png';
  v_ingredient_text TEXT := 'Chicken, poultry by-product meal, rice, soybean meal, whole grain corn, corn protein meal, whole grain wheat, corn germ meal, vegetable oil (source of medium-chain triglycerides), natural flavor, barley, fish meal, dried egg product, fish oil, glycerin, calcium carbonate, L-Arginine, soybean oil, dried whey protein concentrate, mono and dicalcium phosphate, salt, VITAMINS [Vitamin E supplement, thiamine mononitrate (Vitamin B-1), niacin (Vitamin B-3), Vitamin A supplement, calcium pantothenate (Vitamin B-5), riboflavin supplement (Vitamin B-2), Vitamin B-12 supplement, pyridoxine hydrochloride (Vitamin B-6), folic acid (Vitamin B-9), menadione sodium bisulfite complex (Vitamin K), biotin (Vitamin B-7), Vitamin D-3 supplement], potassium chloride, DL-Methionine, choline chloride, MINERALS [zinc sulfate, ferrous sulfate, zinc proteinate, manganese sulfate, manganese proteinate, copper sulfate, copper proteinate, calcium iodate, sodium selenite], glycine, L-Cysteine, L-ascorbyl-2-polyphosphate (Vitamin C), dried Bacillus coagulans fermentation product, garlic oil, dried Lactobacillus fermentum fermentation product, dried Lactobacillus delbrueckii fermentation product.';
  v_ingredients TEXT[] := ARRAY[
    'Chicken','poultry by-product meal','rice','soybean meal','whole grain corn',
    'corn protein meal','whole grain wheat','corn germ meal',
    'vegetable oil (source of medium-chain triglycerides)','natural flavor',
    'barley','fish meal','dried egg product','fish oil','glycerin',
    'calcium carbonate','L-Arginine','soybean oil','dried whey protein concentrate',
    'mono and dicalcium phosphate','salt','Vitamin E supplement',
    'thiamine mononitrate (Vitamin B-1)','niacin (Vitamin B-3)',
    'Vitamin A supplement','calcium pantothenate (Vitamin B-5)',
    'riboflavin supplement (Vitamin B-2)','Vitamin B-12 supplement',
    'pyridoxine hydrochloride (Vitamin B-6)','folic acid (Vitamin B-9)',
    'menadione sodium bisulfite complex (Vitamin K)','biotin (Vitamin B-7)',
    'Vitamin D-3 supplement','potassium chloride','DL-Methionine','choline chloride',
    'zinc sulfate','ferrous sulfate','zinc proteinate','manganese sulfate',
    'manganese proteinate','copper sulfate','copper proteinate','calcium iodate',
    'sodium selenite','glycine','L-Cysteine',
    'L-ascorbyl-2-polyphosphate (Vitamin C)',
    'dried Bacillus coagulans fermentation product','garlic oil',
    'dried Lactobacillus fermentum fermentation product',
    'dried Lactobacillus delbrueckii fermentation product'
  ]::TEXT[];
  v_run BIGINT;
  v_top TEXT;
  v_barcode_3_5 TEXT;
  v_barcode_22 TEXT;
BEGIN
  SELECT id INTO STRICT v_formula
  FROM public.catalog_formulas WHERE formula_key=v_formula_key;
  SELECT id INTO STRICT v_retailer_formula
  FROM public.catalog_formulas WHERE formula_key=v_retailer_formula_key;
  SELECT id INTO STRICT v_discovery_formula
  FROM public.catalog_formulas WHERE formula_key=v_discovery_formula_key;

  IF cardinality(v_ingredients)<>52
     OR array_to_string(v_ingredients,' ') NOT ILIKE '%glycine%'
     OR array_to_string(v_ingredients,' ') NOT ILIKE '%Lactobacillus fermentum%'
     OR array_to_string(v_ingredients,' ') NOT ILIKE '%Lactobacillus delbrueckii%'
  THEN
    RAISE EXCEPTION 'Exact 52-item official standard senior ingredient vector unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='038100106766'
      AND pet_type='dog' AND life_stage='senior' AND food_form='dry'
      AND package_size='3.5 lb'
      AND product_line='Pro Plan AdvantEDGE Adult 7+ Senior Support+ Shredded Blend'
      AND flavor='Chicken & Rice Formula'
      AND source_quality='manufacturer' AND source_url=v_source
      AND image_url=v_front AND is_complete_food=true
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Standard Senior Support canonical manufacturer row missing or changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_retailer_cache AND gtin='038100106797'
      AND pet_type='dog' AND life_stage='senior' AND food_form='dry'
      AND package_size='22 lb' AND ingredient_count=52
      AND ingredient_text ILIKE '%glycine%'
      AND ingredient_text ILIKE '%Lactobacillus fermentum%'
      AND source_url=v_petsmart AND source_quality='retailer_verified'
  ) THEN
    RAISE EXCEPTION 'Exact PetSmart 22 lb standard senior evidence missing or changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='chewy-public-sitemap' AND source_external_id='3583759'
      AND product_name ILIKE '%Senior Support Plus Shredded Blend Chicken & Rice%'
      AND pet_type='dog' AND life_stage='senior' AND food_form='dry'
  ) THEN
    RAISE EXCEPTION 'Exact Chewy standard senior identity missing';
  END IF;

  UPDATE public.product_data SET
    ingredients=v_ingredients,ingredient_text=v_ingredient_text,ingredient_count=52,
    scraped_at=now(),expires_at=now()+interval '365 days',verified_at=now(),
    updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',updated_at=now()
  WHERE cache_key=v_retailer_cache;

  UPDATE public.catalog_formulas SET
    complete_food_evidence='Animal feeding tests using AAFCO procedures substantiate that this exact Pro Plan AdvantEDGE Senior Support+ Shredded Blend Chicken & Rice Formula provides complete and balanced nutrition for maintenance of adult dogs.',
    ingredient_text=v_ingredient_text,ingredients=v_ingredients,
    protected_terms=ARRAY[
      'purina pro plan','pro plan','advantedge','senior support',
      'adult 7+','senior','shredded blend','chicken','rice','dog','dry'
    ]::TEXT[],
    verification_status='verified',active=true,absent_since=NULL,
    promoted_cache_key=v_cache,promoted_at=now(),last_observed_at=now(),updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET
    formula_id=v_formula,
    ingredient_text=CASE
      WHEN source_slug IN ('nestle-purina-pro-plan','purina-manufacturer-manual')
      THEN v_ingredient_text ELSE ingredient_text END,
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[]
  WHERE formula_id IN (v_formula,v_retailer_formula,v_discovery_formula)
     OR (source_slug='chewy-public-sitemap' AND source_external_id='3583759')
     OR gtin IN ('038100106766','038100106797');

  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE formula_id IN (v_retailer_formula,v_discovery_formula)
     OR (source_slug='chewy-public-sitemap' AND source_external_id='3583759')
     OR gtin IN ('038100106766','038100106797');

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT alias_key,v_formula,f.identity_hash,'manual_review',v_source,
    jsonb_build_object(
      'exact_formula_identity',true,'canonical_formula_id',v_formula,
      'ingredient_pdf',v_pdf,'reconciled_at',now()
    ),now()
  FROM unnest(ARRAY[v_retailer_formula_key,v_discovery_formula_key]::TEXT[]) alias_key
  JOIN public.catalog_formulas f ON f.id=v_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded exact size/title duplicate; PetSmart GTIN 038100106797 and retailer evidence remain children of the canonical manufacturer formula.',
    updated_at=now()
  WHERE id=v_retailer_formula;

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded exact Chewy discovery duplicate; listing 3583759 remains attached to the canonical manufacturer formula.',
    updated_at=now()
  WHERE id=v_discovery_formula;

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,
      'Purina Pro Plan AdvantEDGE Senior Support Plus Shredded Blend Chicken & Rice Formula Dry Dog Food',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan AdvantEDGE Senior Support Plus Shredded Blend Chicken & Rice Formula Dry Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'chewy_listing_id','3583759','species_boundary','dog',
        'life_stage_boundary','senior','food_form_boundary','dry',
        'line_boundary','AdvantEDGE Senior Support+',
        'texture_boundary','shredded blend','recipe_boundary','chicken and rice'
      )
    ),
    (
      v_cache,
      'Purina Pro Plan AdvantEDGE Senior Dry Dog Food Chicken & Rice',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan AdvantEDGE Senior Dry Dog Food Chicken & Rice'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'petsmart_gtin','038100106797','species_boundary','dog',
        'life_stage_boundary','senior','food_form_boundary','dry',
        'line_boundary','AdvantEDGE Senior Support+',
        'recipe_boundary','chicken and rice'
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
    'manual-exact-evidence:purina-pro-plan:advantedge-standard-senior-support:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),1,1,1,0,true,
    '9a8f4a7b474eb93e25c30100eafd7dfcf509ef6df318824b0b6e1cdc80e45b18',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,
      'official_page_captured_at','2026-07-24T06:26:41.096Z',
      'official_page_sha256','3169c1cdbc7bae366cf872ad0a81cd860195c21658837fca90b78736cf71c8a5',
      'official_pdf_captured_at','2026-06-29T22:22:40.157Z',
      'official_pdf_sha256','9a8f4a7b474eb93e25c30100eafd7dfcf509ef6df318824b0b6e1cdc80e45b18',
      'official_gtin','038100106766','retailer_verified_gtin','038100106797',
      'package_sizes',jsonb_build_array('3.5 lb','22 lb'),
      'ingredient_count',52,'chewy_listing_id','3583759',
      'ingredient_parser_repair','restored exact source names, glycine, and Lactobacillus fermentum; removed duplicate glycerin and L-Cysteine',
      'duplicate_formula_ids',jsonb_build_array(v_retailer_formula,v_discovery_formula)
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),accepted_count=1,rejected_count=0,
    pagination_complete=true,source_content_hash=excluded.source_content_hash,
    error_summary=NULL,metadata=excluded.metadata,updated_at=now()
  RETURNING id INTO v_run;

  INSERT INTO public.catalog_observations(
    run_id,formula_id,source_slug,source_external_id,source_url,source_authority,
    gtin,manufacturer,brand,product_name,product_line,pet_type,life_stage,
    food_form,flavor,diet_condition,package_size,ingredient_text,front_image_url,
    is_complete_food,available_in_us,observed_at,content_hash,validation_status,
    validation_reasons,raw_payload
  ) VALUES(
    v_run,v_formula,'purina-manufacturer-manual','038100106766',v_source,'manufacturer',
    '038100106766','Nestlé Purina PetCare Company','Purina Pro Plan',
    'Pro Plan AdvantEDGE Adult 7+ Senior Support+ Shredded Blend Chicken & Rice Formula Dry Dog Food',
    'Pro Plan AdvantEDGE Adult 7+ Senior Support+ Shredded Blend',
    'dog','senior','dry','Chicken & Rice Formula','','3.5 lb',
    v_ingredient_text,v_front,true,true,now(),
    encode(digest(v_source||'|'||v_pdf||'|'||v_ingredient_text||'|'||v_front,'sha256'),'hex'),
    'accepted',ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_page',v_source,'official_ingredient_pdf',v_pdf,
      'official_front_image',v_front,'official_gtin','038100106766',
      'retailer_verified_gtin','038100106797',
      'official_package_size','3.5 lb','retailer_verified_package_size','22 lb',
      'ingredient_count',52,'chewy_listing_id','3583759',
      'complete_food_statement','Animal feeding tests using AAFCO procedures substantiate complete and balanced nutrition for maintenance of adult dogs',
      'official_pdf_sha256','9a8f4a7b474eb93e25c30100eafd7dfcf509ef6df318824b0b6e1cdc80e45b18'
    )
  )
  ON CONFLICT(run_id,source_slug,source_external_id,content_hash) DO UPDATE SET
    formula_id=excluded.formula_id,ingredient_text=excluded.ingredient_text,
    raw_payload=excluded.raw_payload,validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[],observed_at=now();

  INSERT INTO public.catalog_field_evidence(
    formula_id,observation_id,field_name,field_value,source_url,
    source_authority,accepted,observed_at,content_hash
  )
  SELECT v_formula,NULL,field_name,to_jsonb(field_value),evidence_url,'manufacturer',
    true,now(),
    encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||evidence_url,'sha256'),'hex')
  FROM (
    VALUES
      ('ingredient_text',v_ingredient_text,v_pdf),('ingredient_pdf_url',v_pdf,v_pdf),
      ('front_image_url',v_front,v_source),('official_gtin','038100106766',v_source),
      ('retailer_verified_gtin','038100106797',v_petsmart),
      ('package_sizes','3.5 lb; 22 lb',v_source),('ingredient_count','52',v_pdf),
      ('life_stage','senior',v_source),('food_form','dry',v_source),
      ('line','AdvantEDGE Senior Support+',v_source),('texture','shredded blend',v_source),
      ('recipe','chicken and rice',v_source),
      ('complete_food_evidence','Animal feeding tests using AAFCO procedures substantiate complete and balanced nutrition for maintenance of adult dogs',v_pdf)
  ) evidence(field_name,field_value,evidence_url)
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
    'manual-search:purina-pro-plan:advantedge-standard-senior-support:20260725',
    formula_key,formula_key,'Purina Pro Plan',product_name,
    'Purina Pro Plan AdvantEDGE Senior Support Plus Shredded Blend Chicken Rice official label',
    jsonb_build_array(
      v_source,v_pdf,v_petsmart,
      'https://www.chewy.com/purina-pro-plan-advantedge-senior/dp/3583759'
    ),
    v_source,'manufacturer_pdf',
    jsonb_build_object(
      'brand','Purina Pro Plan','line','AdvantEDGE Senior Support+',
      'pet_type','dog','life_stage','senior','food_form','dry',
      'texture','shredded blend','flavor','Chicken & Rice'
    ),
    jsonb_build_object(
      'brand','Purina Pro Plan',
      'product_line','AdvantEDGE Adult 7+ Senior Support+ Shredded Blend',
      'pet_type','dog','life_stage','senior','food_form','dry',
      'flavor','Chicken & Rice Formula',
      'gtins',jsonb_build_array('038100106766','038100106797'),
      'package_sizes',jsonb_build_array('3.5 lb','22 lb'),
      'ingredient_count',52
    ),
    'promoted',NULL,
    '9a8f4a7b474eb93e25c30100eafd7dfcf509ef6df318824b0b6e1cdc80e45b18',
    encode(digest(v_ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Official Purina label A438825 verifies 52 exact ingredients including glycine and Lactobacillus fermentum, official 3.5 lb GTIN, matching front image, and adult-dog AAFCO feeding-test statement. PetSmart 22 lb GTIN and Chewy 3583759 are exact aliases. Stale importer duplicate glycerin and L-Cysteine entries were removed.',
    v_pdf,'source_text_exact',encode(digest(v_ingredient_text,'sha256'),'hex'),
    jsonb_build_array(jsonb_build_object(
      'type','parser_repair',
      'removed',jsonb_build_array('duplicate glycerin','duplicate L-Cysteine'),
      'restored',jsonb_build_array(
        'vegetable oil (source of medium-chain triglycerides)',
        'natural flavor','dried egg product','dried whey protein concentrate',
        'glycine','dried Lactobacillus fermentum fermentation product'
      ),
      'basis','official Purina label PDF A438825'
    )),
    now()
  FROM public.catalog_formulas WHERE id=v_formula
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
    resolution_reason='Exact current Purina Pro Plan AdvantEDGE Adult 7+ Senior Support+ Chicken & Rice formula promoted from official label evidence.',
    acquisition_notes='Official Purina label A438825 verifies 52 exact ingredients, dog/senior/AdvantEDGE Senior Support+/shredded-blend/dry/Chicken & Rice identity, GTIN 038100106766, matching front image, and AAFCO feeding-test complete-food evidence. PetSmart 22 lb GTIN 038100106797 and Chewy 3583759 are linked as formula children.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:463cfc910cadfd793ed66f9777c8d187';

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Purina Pro Plan AdvantEDGE Senior Support Plus Shredded Blend Chicken & Rice Formula Dry Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_barcode_3_5
  FROM public.resolve_verified_product_by_gtin('038100106766',8)
  ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_barcode_22
  FROM public.resolve_verified_product_by_gtin('038100106797',8)
  ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache
     OR v_barcode_3_5 IS DISTINCT FROM v_cache
     OR v_barcode_22 IS DISTINCT FROM v_cache
  THEN
    RAISE EXCEPTION 'Standard Senior Support regression: search %, 3.5 lb %, 22 lb %',
      v_top,v_barcode_3_5,v_barcode_22;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (v_retailer_formula,v_discovery_formula)
      AND (active OR verification_status<>'quarantined')
  ) THEN
    RAISE EXCEPTION 'Standard Senior Support duplicate formulas remain active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND cardinality(ingredients)=52
      AND ingredients @> ARRAY[
        'glycine','dried Lactobacillus fermentum fermentation product',
        'dried Lactobacillus delbrueckii fermentation product'
      ]::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Standard Senior Support canonical formula not repaired and promoted';
  END IF;

  IF (SELECT count(*) FROM public.catalog_skus
      WHERE formula_id=v_formula AND active
        AND gtin IN ('038100106766','038100106797'))<>2
  THEN
    RAISE EXCEPTION 'Standard Senior Support exact GTIN children missing';
  END IF;
END
$$;
