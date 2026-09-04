DO $$
DECLARE
  v_formula BIGINT;
  v_petsmart_formula BIGINT;
  v_walmart_formula BIGINT;
  v_chewy_formula BIGINT;
  v_cache TEXT := 'nestle-purina-pro-plan:038100189844';
  v_petsmart_cache TEXT := 'petsmart-retail-catalog:038100189868';
  v_source TEXT := 'https://www.purina.com/dogs/shop/pro-plan-sport-performance-30-20-beef-bison-dry-dog-food';
  v_pdf TEXT := 'https://www.purina.com/sites/default/files/product-label-deck-file/2025-04/4366_b436624_pro_plan_sport_performance_3020_beef_bison_dry_dog_food_d62.pdf';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2025-04/pro-plan-sport-30-20-beef-bison-dry-dog-food-33-lb-bag.png';
  v_petsmart TEXT := 'https://www.petsmart.com/dog/food/dry-food/purina-pro-plan-sport-performance-30-20-all-life-stages-dry-dog-food-beef-and-bison-66400.html';
  v_ingredient_text TEXT := 'Beef, rice, poultry by-product meal, corn protein meal, whole grain corn, beef fat preserved with mixed-tocopherols, dried egg product, corn germ meal, bison, fish meal, natural flavor, fish oil, soybean oil, potassium chloride, mono and dicalcium phosphate, salt, calcium carbonate, VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), thiamine mononitrate (Vitamin B-1), calcium pantothenate (Vitamin B-5), Vitamin A supplement, riboflavin supplement (Vitamin B-2), Vitamin B-12 supplement, pyridoxine hydrochloride (Vitamin B-6), folic acid (Vitamin B-9), menadione sodium bisulfite complex (Vitamin K), biotin (Vitamin B-7), Vitamin D-3 supplement], MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate, calcium iodate, sodium selenite], choline chloride, magnesium sulfate, DL-Methionine, L-Lysine monohydrochloride, taurine, L-ascorbyl-2-polyphosphate (Vitamin C), dried Bacillus coagulans fermentation product, garlic oil.';
  v_ingredients TEXT[] := ARRAY[
    'Beef','rice','poultry by-product meal','corn protein meal',
    'whole grain corn','beef fat preserved with mixed-tocopherols',
    'dried egg product','corn germ meal','bison','fish meal','natural flavor',
    'fish oil','soybean oil','potassium chloride','mono and dicalcium phosphate',
    'salt','calcium carbonate','Vitamin E supplement','niacin (Vitamin B-3)',
    'thiamine mononitrate (Vitamin B-1)','calcium pantothenate (Vitamin B-5)',
    'Vitamin A supplement','riboflavin supplement (Vitamin B-2)',
    'Vitamin B-12 supplement','pyridoxine hydrochloride (Vitamin B-6)',
    'folic acid (Vitamin B-9)','menadione sodium bisulfite complex (Vitamin K)',
    'biotin (Vitamin B-7)','Vitamin D-3 supplement','zinc sulfate',
    'ferrous sulfate','manganese sulfate','copper sulfate','calcium iodate',
    'sodium selenite','choline chloride','magnesium sulfate','DL-Methionine',
    'L-Lysine monohydrochloride','taurine',
    'L-ascorbyl-2-polyphosphate (Vitamin C)',
    'dried Bacillus coagulans fermentation product','garlic oil'
  ]::TEXT[];
  v_run BIGINT;
  v_top TEXT;
  v_top_chewy TEXT;
  v_barcode_official TEXT;
  v_barcode_petsmart TEXT;
BEGIN
  SELECT id INTO STRICT v_formula FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|pro plan sport performance 30 20|dog|all life stages|dry|beef and bison|';
  SELECT id INTO STRICT v_petsmart_formula FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan sport performance 30 20 all life stages dry dog food beef and bison|dog|all life stages|dry|beef and bison|';
  SELECT id INTO STRICT v_walmart_formula FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan performance dry dog food high protein 30 20 beef bison formula|dog|unknown|dry||';
  SELECT id INTO STRICT v_chewy_formula FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan sport performance all life stages high protein 30 20 beef and bison formula dry dog food|dog|all life stages|dry||';

  IF cardinality(v_ingredients)<>43
     OR v_ingredients[4]<>'corn protein meal'
     OR v_ingredients[7]<>'dried egg product'
     OR v_ingredients[43]<>'garlic oil'
  THEN
    RAISE EXCEPTION 'Exact Sport Performance 30/20 Beef & Bison label vector unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='038100189844'
      AND brand='Purina Pro Plan' AND pet_type='dog'
      AND life_stage='all life stages' AND food_form='dry'
      AND flavor='Beef & Bison' AND package_size='6 lb bag'
      AND source_quality='manufacturer' AND source_url=v_source
      AND image_url=v_front AND ingredient_count=43
      AND ingredients[4]='Corn Gluten Meal'
      AND ingredients[43]='Dried Bacillus coagulans fermentation product'
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_petsmart_cache AND gtin='038100189868'
      AND brand='Purina Pro Plan' AND pet_type='dog'
      AND life_stage='all life stages' AND food_form='dry'
      AND flavor='Beef & Bison' AND package_size='33 Lb'
      AND source_quality='retailer_verified' AND source_url=v_petsmart
      AND ingredient_count=43 AND ingredients[4]='Corn Protein Meal'
      AND ingredients[43]='Garlic Oil'
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Sport Performance 30/20 manufacturer or PetSmart preconditions failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='chewy-public-sitemap'
      AND source_external_id IN ('358044','358045')
      AND product_name ILIKE '%30/20%Beef%Bison%'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='walmart-public-sitemap' AND source_external_id='572341129'
      AND source_url ILIKE '%30-20-Beef-Bison%'
  ) THEN
    RAISE EXCEPTION 'Sport Performance 30/20 retailer identity evidence unavailable';
  END IF;

  UPDATE public.product_data SET
    ingredients=v_ingredients,ingredient_text=v_ingredient_text,ingredient_count=43,
    product_name='Pro Plan Sport Performance 30/20 Beef & Bison Dry Dog Food',
    product_line='Pro Plan Sport Performance 30/20',
    pet_type='dog',life_stage='all life stages',food_form='dry',
    flavor='Beef & Bison',is_complete_food=true,
    source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    scraped_at=now(),expires_at=now()+interval '365 days',verified_at=now(),
    updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',updated_at=now()
  WHERE cache_key=v_petsmart_cache;

  UPDATE public.catalog_formulas SET
    product_name='Pro Plan Sport Performance 30/20 Beef & Bison Dry Dog Food',
    product_line='pro plan sport performance 30 20',
    pet_type='dog',life_stage='all life stages',food_form='dry',
    flavor='beef and bison',diet_condition='',
    ingredient_text=v_ingredient_text,ingredients=v_ingredients,
    is_complete_food=true,
    complete_food_evidence='Animal feeding tests using AAFCO procedures substantiate that this exact Pro Plan Sport Performance 30/20 Beef & Bison Formula provides complete and balanced nutrition for all life stages, including growth of large sized dogs (70 lb or more as an adult).',
    front_image_url=v_front,source_url=v_source,source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'purina pro plan','pro plan','sport','performance','30/20',
      'all life stages','beef','bison','dog','dry'
    ]::TEXT[],
    verification_status='verified',active=true,absent_since=NULL,
    promoted_cache_key=v_cache,promoted_at=now(),last_observed_at=now(),updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET
    formula_id=v_formula,pet_type='dog',life_stage='all life stages',
    food_form='dry',flavor='beef and bison',
    ingredient_text=CASE
      WHEN source_slug IN ('nestle-purina-pro-plan','purina-manufacturer-manual')
      THEN v_ingredient_text ELSE ingredient_text END,
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_current_formula',
        'canonical_formula_id',v_formula,
        'hard_life_stage_boundary','all life stages, including large-breed growth'
      )
    )
  WHERE formula_id IN (v_formula,v_petsmart_formula,v_walmart_formula,v_chewy_formula)
     OR gtin IN ('038100189844','038100189868')
     OR (source_slug='chewy-public-sitemap' AND source_external_id IN ('358044','358045'))
     OR (source_slug='walmart-public-sitemap' AND source_external_id='572341129');

  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE formula_id IN (v_petsmart_formula,v_walmart_formula,v_chewy_formula)
     OR gtin IN ('038100189844','038100189868')
     OR (source_slug='chewy-public-sitemap' AND source_external_id IN ('358044','358045'))
     OR (source_slug='walmart-public-sitemap' AND source_external_id='572341129');

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT alias_key,v_formula,f.identity_hash,'manual_review',alias_url,
    jsonb_build_object(
      'exact_formula_identity',true,
      'hard_life_stage_boundary','all life stages',
      'ingredient_pdf',v_pdf,'reconciled_at',now()
    ),now()
  FROM (
    VALUES
      (
        'purina pro plan|purina pro plan|purina pro plan sport performance 30 20 all life stages dry dog food beef and bison|dog|all life stages|dry|beef and bison|',
        v_petsmart
      ),
      (
        'purina pro plan|purina pro plan|purina pro plan performance dry dog food high protein 30 20 beef bison formula|dog|unknown|dry||',
        'https://www.walmart.com/ip/Purina-Pro-Plan-Performance-Dry-Dog-Food-High-Protein-30-20-Beef-Bison-Formula-33-lb-Bag/572341129'
      ),
      (
        'purina pro plan|purina pro plan|purina pro plan sport performance all life stages high protein 30 20 beef and bison formula dry dog food|dog|all life stages|dry||',
        'https://www.chewy.com/purina-pro-plan-sport-performance-all/dp/358045'
      )
  ) x(alias_key,alias_url)
  JOIN public.catalog_formulas f ON f.id=v_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence=CASE id
      WHEN v_petsmart_formula THEN
        'Superseded exact PetSmart size/title duplicate. GTIN 038100189868 remains a child of the current canonical manufacturer formula.'
      WHEN v_walmart_formula THEN
        'Superseded exact Walmart discovery duplicate. Listing 572341129 remains attached only to the current canonical manufacturer formula.'
      WHEN v_chewy_formula THEN
        'Superseded exact Chewy discovery duplicate. Listings 358044 and 358045 remain attached only to the current canonical manufacturer formula.'
    END,
    updated_at=now()
  WHERE id IN (v_petsmart_formula,v_walmart_formula,v_chewy_formula);

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,'Purina Pro Plan Sport Performance 30/20 Beef & Bison Dry Dog Food',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan Sport Performance 30/20 Beef & Bison Dry Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'species_boundary','dog','life_stage_boundary','all life stages',
        'line_boundary','Sport Performance 30/20',
        'recipe_boundary','beef and bison','food_form_boundary','dry'
      )
    ),
    (
      v_cache,'Purina Pro Plan Sport Performance All Life Stages High-Protein 30/20 Beef & Bison Formula Dry Dog Food',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan Sport Performance All Life Stages High-Protein 30/20 Beef & Bison Formula Dry Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'chewy_listing_ids',jsonb_build_array('358044','358045'),
        'species_boundary','dog','life_stage_boundary','all life stages',
        'line_boundary','Sport Performance 30/20',
        'recipe_boundary','beef and bison','food_form_boundary','dry'
      )
    ),
    (
      v_cache,'Purina Pro Plan Performance Dry Dog Food High Protein 30/20 Beef Bison Formula',
      public.normalize_verified_product_search_query(
        'Purina Pro Plan Performance Dry Dog Food High Protein 30/20 Beef Bison Formula'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'walmart_listing_id','572341129','species_boundary','dog',
        'life_stage_boundary','all life stages',
        'line_boundary','Sport Performance 30/20',
        'recipe_boundary','beef and bison','food_form_boundary','dry'
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
    'manual-exact-evidence:purina-pro-plan:sport-30-20-beef-bison:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),1,1,1,0,true,
    '038fdeafce88e0160b88b9d58f3d2bc91d9a69dabdc5aa0e80102f3c92233fac',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,
      'official_page_captured_at','2026-07-24T06:27:26.947Z',
      'official_page_sha256','2cf04dfa818edf33f975947f46c7fbeeaa49d9babb723e0d4aa6e46a5847950f',
      'official_pdf_captured_at','2026-06-30T04:30:16.554Z',
      'official_pdf_sha256','038fdeafce88e0160b88b9d58f3d2bc91d9a69dabdc5aa0e80102f3c92233fac',
      'official_gtin','038100189844','retailer_verified_gtin','038100189868',
      'package_sizes',jsonb_build_array('6 lb bag','33 lb'),
      'ingredient_count',43,
      'chewy_listing_ids',jsonb_build_array('358044','358045'),
      'walmart_listing_id','572341129',
      'formula_version_repair','replaced stale corn gluten meal/old sequence with exact current B436624 label text'
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
  SELECT v_formula,NULL,field_name,to_jsonb(field_value),evidence_url,authority,
    true,now(),
    encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||evidence_url,'sha256'),'hex')
  FROM (
    VALUES
      ('ingredient_text',v_ingredient_text,v_pdf,'manufacturer'),
      ('ingredient_pdf_url',v_pdf,v_pdf,'manufacturer'),
      ('front_image_url',v_front,v_source,'manufacturer'),
      ('official_gtin','038100189844',v_source,'manufacturer'),
      ('retailer_verified_gtin','038100189868',v_petsmart,'retailer_verified'),
      ('pet_type','dog',v_source,'manufacturer'),
      ('life_stage','all life stages',v_pdf,'manufacturer'),
      ('food_form','dry',v_source,'manufacturer'),
      ('complete_food_evidence','All life stages, including growth of large sized dogs',v_pdf,'manufacturer')
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
    'manual-search:purina-pro-plan:sport-30-20-beef-bison:20260725',
    formula_key,formula_key,'Purina Pro Plan',product_name,
    'Purina Pro Plan Sport Performance 30/20 Beef Bison official ingredients',
    jsonb_build_array(
      v_source,v_pdf,v_petsmart,
      'https://www.chewy.com/purina-pro-plan-sport-performance-all/dp/358044',
      'https://www.chewy.com/purina-pro-plan-sport-performance-all/dp/358045',
      'https://www.walmart.com/ip/Purina-Pro-Plan-Performance-Dry-Dog-Food-High-Protein-30-20-Beef-Bison-Formula-33-lb-Bag/572341129'
    ),
    v_source,'manufacturer_pdf',
    jsonb_build_object(
      'brand','Purina Pro Plan','line','Sport Performance 30/20',
      'pet_type','dog','life_stage','all life stages','food_form','dry',
      'flavor','Beef & Bison'
    ),
    jsonb_build_object(
      'brand','Purina Pro Plan','product_line','Sport Performance 30/20',
      'pet_type','dog','life_stage','all life stages','food_form','dry',
      'flavor','Beef & Bison',
      'gtins',jsonb_build_array('038100189844','038100189868'),
      'ingredient_count',43
    ),
    'promoted',NULL,
    '038fdeafce88e0160b88b9d58f3d2bc91d9a69dabdc5aa0e80102f3c92233fac',
    encode(digest(v_ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Official Purina label B436624 verifies the current Sport Performance 30/20 Beef & Bison formula, 43 exact ingredients, all-life-stages adequacy including large-breed growth, official GTIN, and matching front image. PetSmart GTIN 038100189868, Chewy 358044/358045, and Walmart 572341129 are exact aliases. The stale manufacturer ingredient sequence was replaced; no puppy-only classification remains.',
    v_pdf,'source_text_exact',encode(digest(v_ingredient_text,'sha256'),'hex'),
    jsonb_build_array(jsonb_build_object(
      'type','formula_version_repair',
      'removed','corn gluten meal, egg product (dried), old vitamin/mineral sequence',
      'restored','corn protein meal, dried egg product, exact B436624 sequence ending in dried Bacillus coagulans fermentation product and garlic oil',
      'basis','official Purina label PDF B436624'
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
    resolution_reason='Exact current Purina Pro Plan Sport Performance 30/20 Beef & Bison formula promoted from official label evidence.',
    acquisition_notes='Official Purina label B436624 verifies 43 exact current ingredients, dog/all-life-stages/dry/Sport Performance 30/20/Beef & Bison identity, GTIN 038100189844, matching front image, and adequacy including large-breed growth. PetSmart GTIN 038100189868, Chewy 358044/358045, and Walmart 572341129 are exact canonical children. The stale puppy census key was superseded by label-proven all-life-stages identity.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:7c2f6bda1332f98757fda43940cc5870';

  SELECT cache_key INTO v_top FROM public.search_verified_products(
    'Purina Pro Plan Sport Performance 30/20 Beef & Bison Dry Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_top_chewy FROM public.search_verified_products(
    'Purina Pro Plan Sport Performance All Life Stages High-Protein 30/20 Beef & Bison Formula Dry Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_barcode_official
  FROM public.resolve_verified_product_by_gtin('038100189844',8)
  ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_barcode_petsmart
  FROM public.resolve_verified_product_by_gtin('038100189868',8)
  ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache
     OR v_top_chewy IS DISTINCT FROM v_cache
     OR v_barcode_official IS DISTINCT FROM v_cache
     OR v_barcode_petsmart IS DISTINCT FROM v_cache
  THEN
    RAISE EXCEPTION 'Sport Performance 30/20 regression: official %, Chewy %, official barcode %, PetSmart barcode %',
      v_top,v_top_chewy,v_barcode_official,v_barcode_petsmart;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE (
      source_slug='chewy-public-sitemap' AND source_external_id IN ('358044','358045')
      OR source_slug='walmart-public-sitemap' AND source_external_id='572341129'
    ) AND formula_id<>v_formula
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE (
      source_slug='chewy-public-sitemap' AND source_external_id IN ('358044','358045')
      OR source_slug='walmart-public-sitemap' AND source_external_id='572341129'
    ) AND formula_id<>v_formula
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (v_petsmart_formula,v_walmart_formula,v_chewy_formula)
      AND (active OR verification_status<>'quarantined')
  ) THEN
    RAISE EXCEPTION 'Sport Performance 30/20 aliases or duplicate formulas remain unresolved';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND life_stage='all life stages'
      AND cardinality(ingredients)=43
      AND ingredients[4]='corn protein meal'
      AND ingredients[43]='garlic oil'
  ) THEN
    RAISE EXCEPTION 'Sport Performance 30/20 canonical formula not repaired and promoted';
  END IF;
END
$$;
