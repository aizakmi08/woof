DO $$
DECLARE
  v_formula BIGINT;
  v_retailer_formula BIGINT;
  v_cache TEXT := 'nestle-purina-pro-plan:038100191267';
  v_retailer_cache TEXT := 'petsmart-retail-catalog:038100191298';
  v_source TEXT := 'https://www.purina.com/cats/shop/pro-plan-liveclear-allergen-reducing-kitten-food-dry-cat-food';
  v_pdf TEXT := 'https://www.purina.com/sites/default/files/product-label-deck-file/2025-05/ld_4600_b460024_pro_plan_liveclear_kitten_chicken_rice_dry_cat_food_b2l.pdf';
  v_petsmart TEXT := 'https://www.petsmart.com/cat/food-and-treats/dry-food/purina-pro-plan-liveclear-allergen-reducing-kitten-dry-cat-food-chicken-and-rice-63505.html';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2025-05/pro-plan-liveclear-chicken-rice-dry-kitten-food-5.5-lb-bag.png';
  v_ingredient_text TEXT := 'Chicken, rice, corn protein meal, chicken by-product meal, beef fat preserved with mixed-tocopherols, soybean meal, soy protein isolate, dried egg product, fish meal, poultry by-product meal, liver flavor, wheat flour, sodium caseinate, L-Lysine monohydrochloride, phosphoric acid, fish oil, salt, calcium carbonate, potassium chloride, MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate, calcium iodate, sodium selenite], choline chloride, VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), Vitamin A supplement, calcium pantothenate (Vitamin B-5), thiamine mononitrate (Vitamin B-1), riboflavin supplement (Vitamin B-2), Vitamin B-12 supplement, pyridoxine hydrochloride (Vitamin B-6), folic acid (Vitamin B-9), Vitamin D-3 supplement, biotin (Vitamin B-7), menadione sodium bisulfite complex (Vitamin K)], taurine, DL-Methionine, dried Bacillus coagulans fermentation product.';
  v_ingredients TEXT[] := ARRAY[
    'Chicken','rice','corn protein meal','chicken by-product meal',
    'beef fat preserved with mixed-tocopherols','soybean meal','soy protein isolate',
    'dried egg product','fish meal','poultry by-product meal','liver flavor',
    'wheat flour','sodium caseinate','L-Lysine monohydrochloride','phosphoric acid',
    'fish oil','salt','calcium carbonate','potassium chloride','zinc sulfate',
    'ferrous sulfate','manganese sulfate','copper sulfate','calcium iodate',
    'sodium selenite','choline chloride','Vitamin E supplement',
    'niacin (Vitamin B-3)','Vitamin A supplement',
    'calcium pantothenate (Vitamin B-5)','thiamine mononitrate (Vitamin B-1)',
    'riboflavin supplement (Vitamin B-2)','Vitamin B-12 supplement',
    'pyridoxine hydrochloride (Vitamin B-6)','folic acid (Vitamin B-9)',
    'Vitamin D-3 supplement','biotin (Vitamin B-7)',
    'menadione sodium bisulfite complex (Vitamin K)','taurine','DL-Methionine',
    'dried Bacillus coagulans fermentation product'
  ]::TEXT[];
  v_run BIGINT;
  v_top TEXT;
  v_barcode_official TEXT;
  v_barcode_retailer TEXT;
BEGIN
  SELECT id INTO STRICT v_formula FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|pro plan liveclear|cat|kitten|dry|chicken and rice formula|';
  SELECT id INTO STRICT v_retailer_formula FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan liveclear allergen reducing kitten dry cat food chicken and rice|cat|kitten|dry|chicken|';

  IF cardinality(v_ingredients)<>41
     OR v_ingredients[3]<>'corn protein meal'
     OR array_to_string(v_ingredients,' ') NOT ILIKE '%dried Bacillus coagulans%'
  THEN
    RAISE EXCEPTION 'Exact LiveClear kitten official ingredient vector unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='038100191267'
      AND pet_type='cat' AND life_stage='kitten' AND food_form='dry'
      AND source_quality='manufacturer' AND source_url=v_source
      AND image_url=v_front AND ingredient_count=41
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_retailer_cache AND gtin='038100191298'
      AND pet_type='cat' AND life_stage='kitten' AND food_form='dry'
      AND package_size='5.5 Lb' AND ingredient_count=41
      AND ingredient_text ILIKE '%Corn Protein Meal%'
      AND source_url=v_petsmart AND source_quality='retailer_verified'
  ) THEN
    RAISE EXCEPTION 'LiveClear kitten manufacturer or retailer preconditions failed';
  END IF;

  UPDATE public.product_data SET
    ingredients=v_ingredients,ingredient_text=v_ingredient_text,ingredient_count=41,
    scraped_at=now(),expires_at=now()+interval '365 days',verified_at=now(),
    updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',updated_at=now()
  WHERE cache_key=v_retailer_cache;

  UPDATE public.catalog_formulas SET
    ingredient_text=v_ingredient_text,ingredients=v_ingredients,
    is_complete_food=true,
    complete_food_evidence='Animal feeding tests using AAFCO procedures substantiate that this exact Pro Plan LiveClear Kitten Chicken & Rice Formula provides complete and balanced nutrition for growth of kittens and gestation/lactation of cats.',
    protected_terms=ARRAY[
      'purina pro plan','pro plan','liveclear','kitten','chicken','rice','cat','dry'
    ]::TEXT[],
    source_url=v_source,source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    verification_status='verified',active=true,absent_since=NULL,
    promoted_cache_key=v_cache,promoted_at=now(),last_observed_at=now(),updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET
    formula_id=v_formula,
    ingredient_text=CASE
      WHEN source_slug IN ('nestle-purina-pro-plan','purina-manufacturer-manual')
      THEN v_ingredient_text ELSE ingredient_text END,
    life_stage='kitten',validation_status='accepted',validation_reasons=ARRAY[]::TEXT[]
  WHERE formula_id IN (v_formula,v_retailer_formula)
     OR (source_slug='chewy-public-sitemap' AND source_external_id='354879')
     OR gtin IN ('038100191267','038100191298');

  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE formula_id=v_retailer_formula
     OR (source_slug='chewy-public-sitemap' AND source_external_id='354879')
     OR gtin IN ('038100191267','038100191298');

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT
    'purina pro plan|purina pro plan|purina pro plan liveclear allergen reducing kitten dry cat food chicken and rice|cat|kitten|dry|chicken|',
    v_formula,identity_hash,'manual_review',v_source,
    jsonb_build_object(
      'exact_formula_identity',true,'hard_life_stage_boundary','kitten',
      'ingredient_pdf',v_pdf,'reconciled_at',now()
    ),now()
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded exact size/title duplicate; PetSmart GTIN 038100191298 remains a child of the canonical manufacturer LiveClear Kitten formula.',
    updated_at=now()
  WHERE id=v_retailer_formula;

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,'Purina Pro Plan LiveClear Kitten Chicken & Rice Formula Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan LiveClear Kitten Chicken & Rice Formula Dry Cat Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'chewy_listing_id','354879','species_boundary','cat',
        'life_stage_boundary','kitten','food_form_boundary','dry',
        'line_boundary','LiveClear','recipe_boundary','chicken and rice'
      )
    ),
    (
      v_cache,'Purina Pro Plan LiveClear Allergen Reducing Kitten Dry Cat Food Chicken & Rice',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan LiveClear Allergen Reducing Kitten Dry Cat Food Chicken & Rice'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'petsmart_gtin','038100191298','species_boundary','cat',
        'life_stage_boundary','kitten','food_form_boundary','dry',
        'line_boundary','LiveClear','recipe_boundary','chicken and rice'
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
    'manual-exact-evidence:purina-pro-plan:liveclear-kitten-chicken-rice:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),1,1,1,0,true,
    'fb59426ed44c12381951c4a71ab599446abe23a9d385c9417ed9e161027253df',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,
      'official_page_captured_at','2026-07-24T06:26:18.137Z',
      'official_page_sha256','0c5c9f78d72d2a19d8d5e439ed25cdec52863040fd9e8f6be1c708bc9819c414',
      'official_pdf_captured_at','2026-06-29T21:29:59.440Z',
      'official_pdf_sha256','fb59426ed44c12381951c4a71ab599446abe23a9d385c9417ed9e161027253df',
      'official_gtin','038100191267','retailer_verified_gtin','038100191298',
      'package_sizes',jsonb_build_array('3.2 lb bag','5.5 lb'),
      'ingredient_count',41,'chewy_listing_id','354879',
      'ingredient_parser_repair','replaced stale corn gluten meal and ordering with exact B460024 label text',
      'duplicate_formula_id',v_retailer_formula
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),accepted_count=1,rejected_count=0,
    pagination_complete=true,source_content_hash=excluded.source_content_hash,
    error_summary=NULL,metadata=excluded.metadata,updated_at=now()
  RETURNING id INTO v_run;

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
      ('front_image_url',v_front,v_source),('official_gtin','038100191267',v_source),
      ('retailer_verified_gtin','038100191298',v_petsmart),
      ('life_stage','kitten',v_source),('food_form','dry',v_source),
      ('complete_food_evidence','Growth of kittens and gestation/lactation of cats',v_pdf)
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
    'manual-search:purina-pro-plan:liveclear-kitten-chicken-rice:20260725',
    formula_key,formula_key,'Purina Pro Plan',product_name,
    'Purina Pro Plan LiveClear Kitten Chicken Rice official ingredients',
    jsonb_build_array(v_source,v_pdf,v_petsmart),
    v_source,'manufacturer_pdf',
    jsonb_build_object(
      'brand','Purina Pro Plan','line','LiveClear','pet_type','cat',
      'life_stage','kitten','food_form','dry','flavor','Chicken & Rice'
    ),
    jsonb_build_object(
      'brand','Purina Pro Plan','product_line','LiveClear',
      'pet_type','cat','life_stage','kitten','food_form','dry',
      'flavor','Chicken & Rice Formula',
      'gtins',jsonb_build_array('038100191267','038100191298'),
      'ingredient_count',41
    ),
    'promoted',NULL,
    'fb59426ed44c12381951c4a71ab599446abe23a9d385c9417ed9e161027253df',
    encode(digest(v_ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Official Purina label B460024 verifies the exact LiveClear Kitten Chicken & Rice formula, 41 ingredients, kitten growth/gestation-lactation adequacy, official GTIN, and matching front image. PetSmart 5.5 lb GTIN and Chewy 354879 are exact kitten aliases; no adult LiveClear mapping remains.',
    v_pdf,'source_text_exact',encode(digest(v_ingredient_text,'sha256'),'hex'),
    jsonb_build_array(jsonb_build_object(
      'type','parser_repair','removed','stale corn gluten meal wording/order',
      'restored','corn protein meal and exact B460024 label sequence',
      'basis','official Purina label PDF B460024'
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
    resolution_reason='Exact current Purina Pro Plan LiveClear Kitten Chicken & Rice formula promoted from official label evidence.',
    acquisition_notes='Official Purina label B460024 verifies 41 exact ingredients, cat/kitten/LiveClear/dry/Chicken & Rice identity, GTIN 038100191267, matching front image, and growth/gestation-lactation adequacy. PetSmart GTIN 038100191298 and Chewy 354879 are exact canonical children.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:376c019ad079429908b820f97aeb264c';

  SELECT cache_key INTO v_top FROM public.search_verified_products(
    'Purina Pro Plan LiveClear Kitten Chicken & Rice Formula Dry Cat Food',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_barcode_official
  FROM public.resolve_verified_product_by_gtin('038100191267',8)
  ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_barcode_retailer
  FROM public.resolve_verified_product_by_gtin('038100191298',8)
  ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache
     OR v_barcode_official IS DISTINCT FROM v_cache
     OR v_barcode_retailer IS DISTINCT FROM v_cache
  THEN
    RAISE EXCEPTION 'LiveClear kitten regression: search %, official %, retailer %',
      v_top,v_barcode_official,v_barcode_retailer;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='chewy-public-sitemap' AND source_external_id='354879'
      AND formula_id<>v_formula
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_retailer_formula AND (active OR verification_status<>'quarantined')
  ) THEN
    RAISE EXCEPTION 'LiveClear kitten identity or duplicate regression';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND cardinality(ingredients)=41
      AND ingredients[3]='corn protein meal'
  ) THEN
    RAISE EXCEPTION 'LiveClear kitten canonical formula not repaired and promoted';
  END IF;
END
$$;
