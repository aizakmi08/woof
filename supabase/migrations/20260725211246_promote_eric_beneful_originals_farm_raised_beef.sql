DO $$
DECLARE
  v_formula BIGINT;
  v_conflicting_formula BIGINT;
  v_alias_formula_ids BIGINT[] := ARRAY[11968,14188,15328,16218,16519,17298,22902]::BIGINT[];
  v_old_formula_key TEXT := 'beneful|beneful|originals farm raised|dog|unknown|dry|beef|';
  v_formula_key TEXT := 'beneful|beneful|originals|dog|adult|dry|farm raised beef|';
  v_cache TEXT := 'nestle-purina-beneful:017800134835';
  v_same_gtin_retailer_cache TEXT := 'petsmart-retail-catalog:017800134835';
  v_conflicting_cache TEXT := 'petsmart-retail-catalog:017800100632';
  v_source TEXT := 'https://www.purina.com/dogs/shop/beneful-originals-beef-dry-dog-food';
  v_pdf TEXT := 'https://www.purina.com/sites/default/files/product-label-deck-file/2025-05/4090_u409024_beneful_originals_w_farm-raised_beef_natural_dry_dog_food_su5_1.pdf';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2025-05/bf_og_beef_3_5lb_00017800134835_vanity.jpg';
  v_conflicting_retailer TEXT := 'https://www.petsmart.com/dog/food/dry-food/purina-beneful-originals-adult-dog-dry-food-farm-raised-beef-79332.html';
  v_ingredient_text TEXT := 'Beef, whole grain corn, barley, rice, whole grain wheat, soybean meal, corn protein meal, chicken by-product meal, beef fat preserved with mixed-tocopherols, egg and chicken flavor, oat meal, natural flavor, calcium carbonate, salt, mono and dicalcium phosphate, glycerin, soybean oil, dried carrots, dried peas, dried spinach, annatto color, vegetable juice (color), MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate, calcium iodate, sodium selenite], VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), Vitamin A supplement, calcium pantothenate (Vitamin B-5), thiamine mononitrate (Vitamin B-1), pyridoxine hydrochloride (Vitamin B-6), riboflavin supplement (Vitamin B-2), Vitamin B-12 supplement, folic acid (Vitamin B-9), menadione sodium bisulfite complex (Vitamin K), biotin (Vitamin B-7), Vitamin D-3 supplement], potassium chloride, choline chloride, carmine, L-Lysine monohydrochloride.';
  v_ingredients TEXT[] := ARRAY[
    'Beef','whole grain corn','barley','rice','whole grain wheat',
    'soybean meal','corn protein meal','chicken by-product meal',
    'beef fat preserved with mixed-tocopherols','egg and chicken flavor',
    'oat meal','natural flavor','calcium carbonate','salt',
    'mono and dicalcium phosphate','glycerin','soybean oil','dried carrots',
    'dried peas','dried spinach','annatto color','vegetable juice (color)',
    'zinc sulfate','ferrous sulfate','manganese sulfate','copper sulfate',
    'calcium iodate','sodium selenite','Vitamin E supplement',
    'niacin (Vitamin B-3)','Vitamin A supplement',
    'calcium pantothenate (Vitamin B-5)',
    'thiamine mononitrate (Vitamin B-1)',
    'pyridoxine hydrochloride (Vitamin B-6)',
    'riboflavin supplement (Vitamin B-2)','Vitamin B-12 supplement',
    'folic acid (Vitamin B-9)',
    'menadione sodium bisulfite complex (Vitamin K)',
    'biotin (Vitamin B-7)','Vitamin D-3 supplement','potassium chloride',
    'choline chloride','carmine','L-Lysine monohydrochloride'
  ]::TEXT[];
  v_run BIGINT;
  v_top TEXT;
  v_ocr_top TEXT;
  v_barcode_official TEXT;
  v_conflicting_barcode_count INTEGER;
BEGIN
  SELECT id INTO STRICT v_formula
  FROM public.catalog_formulas
  WHERE formula_key=v_old_formula_key;

  SELECT id INTO STRICT v_conflicting_formula
  FROM public.catalog_formulas
  WHERE formula_key='beneful|beneful|purina beneful originals adult dog dry food farm raised beef|dog|adult|dry|beef|';

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE formula_key=v_formula_key AND id<>v_formula
  ) THEN
    RAISE EXCEPTION 'Canonical Beneful Originals Farm-Raised Beef identity already occupied';
  END IF;

  IF cardinality(v_ingredients)<>44
     OR v_ingredients[7]<>'corn protein meal'
     OR v_ingredients[17]<>'soybean oil'
     OR v_ingredients[44]<>'L-Lysine monohydrochloride'
  THEN
    RAISE EXCEPTION 'Exact Beneful U409024 label vector unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='017800134835'
      AND brand='Beneful' AND pet_type='dog' AND food_form='dry'
      AND source_quality='manufacturer' AND source_url=v_source
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_same_gtin_retailer_cache AND gtin='017800134835'
      AND brand='Beneful' AND pet_type='dog' AND food_form='dry'
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_conflicting_cache AND gtin='017800100632'
      AND ingredient_count=43
      AND ingredients[7]='Corn Gluten Meal'
      AND ingredients[21]='Annatto Color'
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Beneful exact and conflicting retailer preconditions failed';
  END IF;

  UPDATE public.product_data SET
    ingredients=v_ingredients,ingredient_text=v_ingredient_text,
    ingredient_count=44,
    product_name='Beneful Originals With Farm-Raised Beef Natural Dry Dog Food',
    product_line='Beneful Originals',pet_type='dog',life_stage='adult',
    food_form='dry',flavor='Farm-Raised Beef',
    package_size='3.5 lb bag',is_complete_food=true,
    image_url=v_front,source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    scraped_at=now(),expires_at=now()+interval '365 days',
    verified_at=now(),updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',
    updated_at=now()
  WHERE cache_key=v_same_gtin_retailer_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='conflicting_retailer_formula_version_requires_official_gtin_evidence',
    ingredient_verification_status='unverified',
    image_verification_status='retailer_verified',
    updated_at=now()
  WHERE cache_key=v_conflicting_cache;

  UPDATE public.catalog_formulas SET
    formula_key=v_formula_key,
    identity_hash=encode(digest(v_formula_key,'sha256'),'hex'),
    product_name='Beneful Originals With Farm-Raised Beef Natural Dry Dog Food',
    product_line='originals',pet_type='dog',life_stage='adult',
    food_form='dry',flavor='farm-raised beef',diet_condition='',
    ingredient_text=v_ingredient_text,ingredients=v_ingredients,
    is_complete_food=true,
    complete_food_evidence='Beneful Originals With Farm-Raised Beef is formulated to meet the nutritional levels established by the AAFCO Dog Food Nutrient Profiles for maintenance of adult dogs.',
    front_image_url=v_front,source_url=v_source,source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'beneful','beneful originals','originals','farm-raised beef',
      'farm raised beef','adult','dog','dry'
    ]::TEXT[],
    verification_status='verified',active=true,absent_since=NULL,
    promoted_cache_key=v_cache,promoted_at=now(),last_observed_at=now(),
    updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET
    formula_id=v_formula,brand='beneful',product_line='originals',
    pet_type='dog',life_stage='adult',food_form='dry',
    flavor='farm-raised beef',
    ingredient_text=CASE
      WHEN source_slug='nestle-purina-beneful' THEN v_ingredient_text
      ELSE ingredient_text
    END,
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_current_formula',
        'canonical_formula_id',v_formula,
        'consumer_brand_boundary','beneful',
        'product_line_boundary','originals',
        'recipe_boundary','farm-raised beef'
      )
    )
  WHERE formula_id=v_formula
     OR gtin='017800134835'
     OR formula_id=ANY(v_alias_formula_ids)
     OR (
       formula_id=v_conflicting_formula
       AND gtin IS NULL
       AND lower(product_name) LIKE '%beneful%'
       AND lower(product_name) LIKE '%originals%'
       AND lower(product_name) LIKE '%beef%'
     );

  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE gtin='017800134835'
     OR formula_id=ANY(v_alias_formula_ids)
     OR (
       formula_id=v_conflicting_formula
       AND gtin IS NULL
     );

  UPDATE public.catalog_observations SET
    validation_status='rejected',
    validation_reasons=ARRAY[
      'conflicting_retailer_formula_version',
      'ingredients_do_not_match_current_official_label',
      'official_gtin_evidence_required'
    ]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','quarantined_formula_conflict',
        'official_formula_id',v_formula,
        'conflicting_gtin','017800100632'
      )
    )
  WHERE gtin='017800100632';

  UPDATE public.catalog_skus SET active=false,updated_at=now()
  WHERE gtin='017800100632';

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT f.formula_key,v_formula,c.identity_hash,'manual_review',f.source_url,
    jsonb_build_object(
      'exact_formula_identity',true,'consumer_brand_boundary','beneful',
      'product_line_boundary','originals',
      'recipe_boundary','farm-raised beef',
      'ingredient_pdf',v_pdf,'reconciled_at',now()
    ),now()
  FROM public.catalog_formulas f
  JOIN public.catalog_formulas c ON c.id=v_formula
  WHERE f.id=v_conflicting_formula OR f.id=ANY(v_alias_formula_ids)
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT v_old_formula_key,v_formula,identity_hash,'manual_review',v_source,
    jsonb_build_object(
      'exact_formula_identity',true,'ingredient_pdf',v_pdf,
      'reconciled_at',now()
    ),now()
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded retailer-title duplicate of the verified Beneful Originals Farm-Raised Beef formula. Exact title observations remain aliases of the canonical manufacturer formula.',
    updated_at=now()
  WHERE id=ANY(v_alias_formula_ids);

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Quarantined formula-version conflict. PetSmart GTIN 017800100632 has an older/different 43-ingredient retailer formula and cannot inherit current official label U409024.',
    updated_at=now()
  WHERE id=v_conflicting_formula;

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,'Beneful Originals Farm-Raised Beef Natural Dry Dog Food',
      public.normalize_verified_product_search_query(
        'Beneful Originals Farm-Raised Beef Natural Dry Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'eric_regression',true,'consumer_brand_boundary','beneful',
        'product_line_boundary','originals','recipe_boundary','farm-raised beef',
        'species_boundary','dog','life_stage_boundary','adult',
        'food_form_boundary','dry'
      )
    ),
    (
      v_cache,'Purina Beneful Originals Farm Raised Beef Dog Food',
      public.normalize_verified_product_search_query(
        'Purina Beneful Originals Farm Raised Beef Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'eric_regression',true,'consumer_brand_boundary','beneful',
        'product_line_boundary','originals','recipe_boundary','farm-raised beef'
      )
    ),
    (
      v_cache,'Purina Beneful Originals With Real Beef Adult Dry Dog Food',
      public.normalize_verified_product_search_query(
        'Purina Beneful Originals With Real Beef Adult Dry Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'consumer_brand_boundary','beneful','product_line_boundary','originals',
        'recipe_boundary','farm-raised beef','retailer_title_alias',true
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
    'manual-exact-evidence:beneful:originals-farm-raised-beef-eric:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),2,2,1,1,true,
    '4ecd5e8bb398be81b2de473dcf83a7f9138d62a42755ef5792b8815956b95224',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,'eric_regression',true,
      'official_page_captured_at','2026-07-24T08:22:03.839Z',
      'official_pdf_captured_at','2026-06-29T21:22:22.279Z',
      'official_pdf_sha256','4ecd5e8bb398be81b2de473dcf83a7f9138d62a42755ef5792b8815956b95224',
      'official_label_code','U409024','official_gtin','017800134835',
      'quarantined_conflicting_gtin','017800100632',
      'ingredient_count',44,
      'formula_conflict','GTIN 017800100632 has corn gluten meal and a materially different 43-ingredient retailer formula'
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),observed_count=2,accepted_count=1,
    rejected_count=1,pagination_complete=true,
    source_content_hash=excluded.source_content_hash,error_summary=NULL,
    metadata=excluded.metadata,updated_at=now()
  RETURNING id INTO v_run;

  INSERT INTO public.catalog_field_evidence(
    formula_id,observation_id,field_name,field_value,source_url,
    source_authority,accepted,observed_at,content_hash
  )
  SELECT v_formula,NULL,field_name,to_jsonb(field_value),evidence_url,authority,
    accepted,now(),
    encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||evidence_url,'sha256'),'hex')
  FROM (
    VALUES
      ('ingredient_text',v_ingredient_text,v_pdf,'manufacturer',true),
      ('ingredient_pdf_url',v_pdf,v_pdf,'manufacturer',true),
      ('front_image_url',v_front,v_source,'manufacturer',true),
      ('official_gtin','017800134835',v_source,'manufacturer',true),
      ('conflicting_retailer_gtin','017800100632',v_conflicting_retailer,'retailer_verified',false),
      ('consumer_brand','Beneful',v_source,'manufacturer',true),
      ('product_line','Originals',v_source,'manufacturer',true),
      ('recipe','Farm-Raised Beef',v_source,'manufacturer',true),
      ('pet_type','dog',v_source,'manufacturer',true),
      ('life_stage','adult',v_pdf,'manufacturer',true),
      ('food_form','dry',v_source,'manufacturer',true),
      ('complete_food_evidence','Maintenance of adult dogs',v_pdf,'manufacturer',true)
  ) evidence(field_name,field_value,evidence_url,authority,accepted)
  ON CONFLICT(formula_id,field_name,source_url,content_hash) DO UPDATE SET
    accepted=excluded.accepted,observed_at=excluded.observed_at;

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
    'manual-search:beneful:originals-farm-raised-beef-eric:20260725',
    v_old_formula_key,v_formula_key,'Beneful',product_name,
    'Beneful Originals Farm-Raised Beef official ingredients',
    jsonb_build_array(v_source,v_pdf,v_conflicting_retailer),
    v_source,'manufacturer_pdf',
    jsonb_build_object(
      'brand','Beneful','line','Originals','recipe','Farm-Raised Beef',
      'pet_type','dog','life_stage','adult','food_form','dry'
    ),
    jsonb_build_object(
      'brand','Beneful','product_line','Originals',
      'recipe','Farm-Raised Beef','pet_type','dog',
      'life_stage','adult','food_form','dry',
      'verified_gtins',jsonb_build_array('017800134835'),
      'quarantined_gtins',jsonb_build_array('017800100632'),
      'ingredient_count',44
    ),
    'promoted',NULL,
    '4ecd5e8bb398be81b2de473dcf83a7f9138d62a42755ef5792b8815956b95224',
    encode(digest(v_ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Eric-critical Beneful correction: official label U409024 verifies the current 44-component adult dry Originals Farm-Raised Beef formula, matching front image, adequacy, and GTIN 017800134835. The former serving row had stale ingredients. PetSmart GTIN 017800100632 is excluded and safely abstains because its 43-ingredient retailer formula materially differs and has no exact current official GTIN proof.',
    v_pdf,'source_text_exact',encode(digest(v_ingredient_text,'sha256'),'hex'),
    jsonb_build_array(
      jsonb_build_object(
        'type','stale_formula_repair',
        'replaced','corn gluten meal',
        'restored','corn protein meal and soybean oil',
        'basis','current official label U409024'
      ),
      jsonb_build_object(
        'type','formula_conflict_quarantine',
        'gtin','017800100632',
        'differences',jsonb_build_array('corn gluten meal','missing soybean oil','different ingredient order'),
        'basis','not exact-equal to current official label'
      )
    ),
    now()
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(review_key) DO UPDATE SET
    corrected_formula_key=excluded.corrected_formula_key,
    authoritative_source_url=excluded.authoritative_source_url,
    authoritative_source_type=excluded.authoritative_source_type,
    expected_identity=excluded.expected_identity,
    resolved_identity=excluded.resolved_identity,
    evidence_status='promoted',quarantine_reason=NULL,
    authoritative_content_hash=excluded.authoritative_content_hash,
    ingredient_text_hash=excluded.ingredient_text_hash,
    front_image_url_hash=excluded.front_image_url_hash,
    observed_at=excluded.observed_at,formula_id=excluded.formula_id,
    promoted_cache_key=excluded.promoted_cache_key,
    attempt_count=public.catalog_manual_evidence_reviews.attempt_count+1,
    review_notes=excluded.review_notes,
    ingredient_evidence_url=excluded.ingredient_evidence_url,
    ingredient_evidence_mode=excluded.ingredient_evidence_mode,
    ingredient_original_text_hash=excluded.ingredient_original_text_hash,
    ingredient_corrections=excluded.ingredient_corrections,updated_at=now();

  UPDATE public.catalog_acquisition_queue SET
    status='resolved',resolved_at=now(),
    resolution_reason='Exact current Beneful Originals Farm-Raised Beef formula promoted from official label U409024.',
    acquisition_notes='Official Purina label U409024 verifies the current 44-component dog/adult/dry/Beneful Originals/Farm-Raised Beef identity, matching front image, adequacy, and GTIN 017800134835. Retailer-title aliases now point only to this canonical formula.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    sample_metadata=COALESCE(sample_metadata,'{}'::JSONB)||jsonb_build_object(
      'matched_cache_key',v_cache,'matched_formula_id',v_formula,
      'reconciled_by','manual_exact_official_evidence',
      'reconciled_at',now()
    ),
    last_refreshed_at=now(),updated_at=now()
  WHERE lower(coalesce(product_name,'')) LIKE '%beneful%'
    AND lower(coalesce(product_name,'')) LIKE '%originals%'
    AND lower(coalesce(product_name,'')) LIKE '%beef%';

  INSERT INTO public.catalog_acquisition_queue(
    gap_key,gap_type,status,priority_score,brand,product_name,cache_key,
    normalized_query,pet_type,product_source,source_quality,source_url,
    needs_product_record,needs_verified_ingredients,needs_verified_image,
    needs_pet_type,ready_rows,affected_product_count,demand_events,
    sample_metadata,acquisition_notes,last_refreshed_at,updated_at
  ) VALUES(
    'manual-evidence:beneful:gtin-017800100632-formula-version',
    'product','open',95,'Beneful',
    'Beneful Originals Farm-Raised Beef — GTIN 017800100632',
    v_conflicting_cache,
    public.normalize_verified_product_search_query(
      'Beneful Originals Farm-Raised Beef GTIN 017800100632'
    ),
    'dog','petsmart-retail-catalog','retailer_verified',
    v_conflicting_retailer,true,true,true,false,0,1,1,
    jsonb_build_object(
      'conflicting_gtin','017800100632',
      'official_current_gtin','017800134835',
      'official_formula_id',v_formula,
      'conflicting_formula_id',v_conflicting_formula,
      'eric_regression',true
    ),
    'PetSmart GTIN 017800100632 has a materially different 43-ingredient formula containing corn gluten meal. It is excluded and its barcode safely abstains until an exact current manufacturer label or official GTIN mapping is obtained.',
    now(),now()
  )
  ON CONFLICT(gap_key) DO UPDATE SET
    status='open',priority_score=95,resolved_at=NULL,resolution_reason=NULL,
    source_url=excluded.source_url,needs_product_record=true,
    needs_verified_ingredients=true,needs_verified_image=true,
    ready_rows=0,affected_product_count=1,
    sample_metadata=excluded.sample_metadata,
    acquisition_notes=excluded.acquisition_notes,
    last_refreshed_at=now(),updated_at=now();

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Beneful Originals Farm-Raised Beef Natural Dry Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_ocr_top
  FROM public.search_verified_products(
    'Purina Beneful Originals Farm Raised Beef Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_barcode_official
  FROM public.resolve_verified_product_by_gtin('017800134835',8)
  ORDER BY rank DESC LIMIT 1;

  SELECT count(*) INTO v_conflicting_barcode_count
  FROM public.resolve_verified_product_by_gtin('017800100632',8);

  IF v_top IS DISTINCT FROM v_cache
     OR v_ocr_top IS DISTINCT FROM v_cache
     OR v_barcode_official IS DISTINCT FROM v_cache
     OR v_conflicting_barcode_count<>0
  THEN
    RAISE EXCEPTION 'Beneful Eric regression: search %, OCR %, official barcode %, conflict count %',
      v_top,v_ocr_top,v_barcode_official,v_conflicting_barcode_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.search_verified_products(
      'Purina Beneful Originals Farm Raised Beef Dog Food',8
    )
    WHERE lower(brand)<>'beneful'
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE (id=v_conflicting_formula OR id=ANY(v_alias_formula_ids))
      AND (active OR verification_status<>'quarantined')
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE gtin='017800100632' AND active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND formula_key=v_formula_key AND promoted_cache_key=v_cache
      AND life_stage='adult' AND food_form='dry'
      AND cardinality(ingredients)=44
      AND ingredients[7]='corn protein meal'
      AND ingredients[17]='soybean oil'
  ) THEN
    RAISE EXCEPTION 'Beneful canonical formula, brand boundary, or conflicting variant regression';
  END IF;
END
$$;
