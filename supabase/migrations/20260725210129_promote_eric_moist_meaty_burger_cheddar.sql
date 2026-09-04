DO $$
DECLARE
  v_formula BIGINT;
  v_exact_retailer_formula BIGINT;
  v_conflicting_formula BIGINT;
  v_old_formula_key TEXT := 'moist and meaty|moist and meaty|purina moist and meaty burger with cheddar cheese soft|dog|adult|wet||';
  v_formula_key TEXT := 'moist and meaty|moist and meaty|burger with cheddar cheese|dog|adult|semi-moist|burger with cheddar cheese flavor|';
  v_cache TEXT := 'nestle-purina-moist-meaty:038100330772';
  v_exact_retailer_cache TEXT := 'petsmart-retail-catalog:038100330482';
  v_conflicting_cache TEXT := 'petsmart-retail-catalog:038100330222';
  v_source TEXT := 'https://www.purina.com/dogs/shop/moist-meaty-burger-with-cheddar-cheese-dog-food';
  v_pdf TEXT := 'https://www.purina.com/sites/default/files/product-label-deck-file/2023-06/4104-e410422-moist-meaty-burger-w-cheddar-cheese-flavor-dog-food-d45.pdf';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2023-06/dc_moistmeaty_burger-cheese_pack_1000x1000.png';
  v_exact_retailer TEXT := 'https://www.petsmart.com/dog/food/dry-food/purina-moist-and-meaty-adult-dog-dry-food-2390.html';
  v_conflicting_retailer TEXT := 'https://www.petsmart.com/dog/food/canned-food/moist-and-meaty-burger-cheddar-cheese-adult-semi-moist-dog-food-72-oz-84315.html';
  v_ingredient_text TEXT := 'Meat by-product, soy flour, soy grits, high fructose corn syrup, wheat flour, water, corn syrup, beef, phosphoric acid, calcium carbonate, animal fat preserved with mixed-tocopherols, salt, vegetable oil, sorbic acid (a preservative), cheese powder (source of cheddar cheese flavor), calcium propionate (a preservative), MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate, calcium iodate, sodium selenite], DL-Methionine, VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), Vitamin A supplement, calcium pantothenate (Vitamin B-5), thiamine mononitrate (Vitamin B-1), Vitamin B-12 supplement, riboflavin supplement (Vitamin B-2), pyridoxine hydrochloride (Vitamin B-6), folic acid (Vitamin B-9), menadione sodium bisulfite complex (Vitamin K), Vitamin D-3 supplement, biotin (Vitamin B-7)], choline chloride, ethoxyquin (a preservative), Yellow 6, Red 40, Yellow 5.';
  v_ingredients TEXT[] := ARRAY[
    'Meat by-product','soy flour','soy grits','high fructose corn syrup',
    'wheat flour','water','corn syrup','beef','phosphoric acid',
    'calcium carbonate','animal fat preserved with mixed-tocopherols','salt',
    'vegetable oil','sorbic acid (a preservative)',
    'cheese powder (source of cheddar cheese flavor)',
    'calcium propionate (a preservative)','zinc sulfate','ferrous sulfate',
    'manganese sulfate','copper sulfate','calcium iodate','sodium selenite',
    'DL-Methionine','Vitamin E supplement','niacin (Vitamin B-3)',
    'Vitamin A supplement','calcium pantothenate (Vitamin B-5)',
    'thiamine mononitrate (Vitamin B-1)','Vitamin B-12 supplement',
    'riboflavin supplement (Vitamin B-2)',
    'pyridoxine hydrochloride (Vitamin B-6)','folic acid (Vitamin B-9)',
    'menadione sodium bisulfite complex (Vitamin K)',
    'Vitamin D-3 supplement','biotin (Vitamin B-7)','choline chloride',
    'ethoxyquin (a preservative)','Yellow 6','Red 40','Yellow 5'
  ]::TEXT[];
  v_run BIGINT;
  v_top TEXT;
  v_barcode_official TEXT;
  v_barcode_exact_retailer TEXT;
  v_conflicting_barcode_count INTEGER;
BEGIN
  SELECT id INTO STRICT v_formula FROM public.catalog_formulas
  WHERE formula_key=v_old_formula_key;
  SELECT id INTO STRICT v_exact_retailer_formula FROM public.catalog_formulas
  WHERE formula_key='moist and meaty|moist and meaty|purina moist and meaty adult dog dry food|dog|adult|dry|burger with chedder cheese|';
  SELECT id INTO STRICT v_conflicting_formula FROM public.catalog_formulas
  WHERE formula_key='moist and meaty|moist and meaty|moist and meaty burger cheddar cheese adult semi moist dog food|dog|adult|wet|burger with chedder cheese|';

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE formula_key=v_formula_key AND id<>v_formula
  ) THEN
    RAISE EXCEPTION 'Canonical Moist & Meaty Burger with Cheddar identity already occupied';
  END IF;

  IF cardinality(v_ingredients)<>40
     OR v_ingredients[11]<>'animal fat preserved with mixed-tocopherols'
     OR v_ingredients[40]<>'Yellow 5'
  THEN
    RAISE EXCEPTION 'Exact Moist & Meaty Burger with Cheddar label vector unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='038100330772'
      AND brand='Moist & Meaty' AND pet_type='dog' AND life_stage='adult'
      AND food_form='semi-moist' AND package_size='72 oz (12 pouches)'
      AND source_quality='manufacturer' AND source_url=v_source
      AND image_url=v_front AND ingredient_count=40
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_exact_retailer_cache AND gtin='038100330482'
      AND brand='Moist & Meaty' AND pet_type='dog' AND life_stage='adult'
      AND food_form='semi-moist' AND package_size='13.5 Lb'
      AND source_quality='retailer_verified' AND source_url=v_exact_retailer
      AND ingredient_count=40 AND ingredients[1]='Meat By-Product'
      AND ingredients[11]='Animal Fat Preserved With Mixed-Tocopherols'
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_conflicting_cache AND gtin='038100330222'
      AND ingredient_count=41 AND ingredients[1]='Beef By-Product'
      AND ingredients[11]='Beef Fat Preserved With Mixed-Tocopherols'
      AND ingredients[17]='Added Color'
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Moist & Meaty exact and conflicting retailer preconditions failed';
  END IF;

  UPDATE public.product_data SET
    ingredients=v_ingredients,ingredient_text=v_ingredient_text,ingredient_count=40,
    product_name='Purina Moist & Meaty Burger With Cheddar Cheese Soft Dog Food',
    product_line='Purina Moist & Meaty Burger With Cheddar Cheese Soft',
    pet_type='dog',life_stage='adult',food_form='semi-moist',
    flavor='Burger with Cheddar Cheese, Beef',
    package_size='72 oz (12 pouches)',is_complete_food=true,
    source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    scraped_at=now(),expires_at=now()+interval '365 days',verified_at=now(),
    updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',updated_at=now()
  WHERE cache_key=v_exact_retailer_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='conflicting_retailer_formula_version_requires_official_gtin_evidence',
    ingredient_verification_status='unverified',
    image_verification_status='retailer_verified',
    updated_at=now()
  WHERE cache_key=v_conflicting_cache;

  UPDATE public.catalog_formulas SET
    formula_key=v_formula_key,
    identity_hash=encode(digest(v_formula_key,'sha256'),'hex'),
    product_name='Purina Moist & Meaty Burger With Cheddar Cheese Soft Dog Food',
    product_line='burger with cheddar cheese',
    pet_type='dog',life_stage='adult',food_form='semi-moist',
    flavor='burger with cheddar cheese flavor',diet_condition='',
    ingredient_text=v_ingredient_text,ingredients=v_ingredients,
    is_complete_food=true,
    complete_food_evidence='This exact Moist & Meaty Burger With Cheddar Cheese Flavor formula is formulated to meet the nutritional levels established by the AAFCO Dog Food Nutrient Profiles for maintenance of adult dogs.',
    front_image_url=v_front,source_url=v_source,source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'purina','moist & meaty','moist and meaty','burger with cheddar',
      'cheddar cheese','soft','semi-moist','adult','dog','beef'
    ]::TEXT[],
    verification_status='verified',active=true,absent_since=NULL,
    promoted_cache_key=v_cache,promoted_at=now(),last_observed_at=now(),updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET
    formula_id=v_formula,pet_type='dog',life_stage='adult',
    food_form='semi-moist',flavor='burger with cheddar cheese flavor',
    ingredient_text=CASE
      WHEN source_slug IN ('nestle-purina-moist-meaty','purina-manufacturer-manual')
      THEN v_ingredient_text ELSE ingredient_text END,
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_current_formula',
        'canonical_formula_id',v_formula,
        'food_form_boundary','semi-moist'
      )
    )
  WHERE formula_id IN (v_formula,v_exact_retailer_formula)
     OR gtin IN ('038100330772','038100330482');

  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE formula_id=v_exact_retailer_formula
     OR gtin IN ('038100330772','038100330482');

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
        'conflicting_gtin','038100330222'
      )
    )
  WHERE formula_id=v_conflicting_formula OR gtin='038100330222';

  UPDATE public.catalog_skus SET active=false,updated_at=now()
  WHERE formula_id=v_conflicting_formula OR gtin='038100330222';

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT alias_key,v_formula,f.identity_hash,'manual_review',alias_url,
    jsonb_build_object(
      'exact_formula_identity',true,
      'food_form_boundary','semi-moist',
      'ingredient_pdf',v_pdf,'reconciled_at',now()
    ),now()
  FROM (
    VALUES
      (v_old_formula_key,v_source),
      (
        'moist and meaty|moist and meaty|purina moist and meaty adult dog dry food|dog|adult|dry|burger with chedder cheese|',
        v_exact_retailer
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
    complete_food_evidence='Superseded exact PetSmart title/size duplicate. GTIN 038100330482 remains a child of the canonical current manufacturer formula.',
    updated_at=now()
  WHERE id=v_exact_retailer_formula;

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Quarantined formula-version conflict. PetSmart GTIN 038100330222 has 41 retailer ingredients that materially differ from current official label E410422; it must safely abstain until exact official GTIN/package evidence is obtained.',
    updated_at=now()
  WHERE id=v_conflicting_formula;

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,'Purina Moist & Meaty Burger With Cheddar Cheese Soft Dog Food',
      public.normalize_verified_product_search_query(
        'Purina Moist & Meaty Burger With Cheddar Cheese Soft Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'eric_regression',true,'species_boundary','dog',
        'life_stage_boundary','adult','food_form_boundary','semi-moist',
        'recipe_boundary','burger with cheddar cheese'
      )
    ),
    (
      v_cache,'Moist & Meaty Burger With Cheddar Cheese Flavor Dog Food',
      public.normalize_verified_product_search_query(
        'Moist & Meaty Burger With Cheddar Cheese Flavor Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'eric_regression',true,'species_boundary','dog',
        'life_stage_boundary','adult','food_form_boundary','semi-moist',
        'recipe_boundary','burger with cheddar cheese'
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
    'manual-exact-evidence:moist-and-meaty:burger-cheddar-eric:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),2,2,1,1,true,
    '5bc06203adb6cb6a9721d0ece96737d4377317b5c22a90fc74f980200545d95d',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,'eric_regression',true,
      'official_page_captured_at','2026-07-16T20:38:15.797Z',
      'official_page_sha256','fffc3baed5f96d2f486b99e2c30e297686165de6accfdcd078b0e23ec3be9016',
      'official_pdf_captured_at','2026-06-29T15:08:14.690Z',
      'official_pdf_sha256','5bc06203adb6cb6a9721d0ece96737d4377317b5c22a90fc74f980200545d95d',
      'official_gtin','038100330772','exact_retailer_gtin','038100330482',
      'quarantined_conflicting_gtin','038100330222',
      'ingredient_count',40,
      'formula_conflict','GTIN 038100330222 uses beef by-product/beef fat/soybean oil/added color and cannot inherit current official ingredients'
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
      ('official_gtin','038100330772',v_source,'manufacturer',true),
      ('exact_retailer_gtin','038100330482',v_exact_retailer,'retailer_verified',true),
      ('conflicting_retailer_gtin','038100330222',v_conflicting_retailer,'retailer_verified',false),
      ('pet_type','dog',v_source,'manufacturer',true),
      ('life_stage','adult',v_pdf,'manufacturer',true),
      ('food_form','semi-moist',v_source,'manufacturer',true),
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
    'manual-search:moist-and-meaty:burger-cheddar-eric:20260725',
    v_old_formula_key,v_formula_key,'Moist & Meaty',product_name,
    'Purina Moist Meaty Burger With Cheddar Cheese official ingredients',
    jsonb_build_array(v_source,v_pdf,v_exact_retailer,v_conflicting_retailer),
    v_source,'manufacturer_pdf',
    jsonb_build_object(
      'brand','Moist & Meaty','line','Burger With Cheddar Cheese',
      'pet_type','dog','life_stage','adult','food_form','semi-moist'
    ),
    jsonb_build_object(
      'brand','Moist & Meaty','product_line','Burger With Cheddar Cheese',
      'pet_type','dog','life_stage','adult','food_form','semi-moist',
      'flavor','Burger With Cheddar Cheese Flavor',
      'verified_gtins',jsonb_build_array('038100330772','038100330482'),
      'quarantined_gtins',jsonb_build_array('038100330222'),
      'ingredient_count',40
    ),
    'promoted',NULL,
    '5bc06203adb6cb6a9721d0ece96737d4377317b5c22a90fc74f980200545d95d',
    encode(digest(v_ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Eric-critical formula: official label E410422 verifies the exact 40-ingredient adult semi-moist Burger With Cheddar Cheese formula, matching image, adequacy, and GTIN 038100330772. PetSmart GTIN 038100330482 is an exact ingredient-equal size child. Conflicting GTIN 038100330222 is excluded and safely abstains because its 41-ingredient retailer formula is materially different and has no exact current official GTIN proof.',
    v_pdf,'source_text_exact',encode(digest(v_ingredient_text,'sha256'),'hex'),
    jsonb_build_array(
      jsonb_build_object(
        'type','line_break_repair','removed','mixed- tocopherols',
        'restored','mixed-tocopherols','basis','official label E410422'
      ),
      jsonb_build_object(
        'type','formula_conflict_quarantine',
        'gtin','038100330222',
        'differences',jsonb_build_array('beef by-product','beef fat','soybean oil','added color'),
        'basis','not exact-equal to current official label'
      )
    ),
    now()
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(review_key) DO UPDATE SET
    corrected_formula_key=excluded.corrected_formula_key,
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
    resolution_reason='Exact current Moist & Meaty Burger With Cheddar Cheese formula promoted from official label evidence.',
    acquisition_notes='Official Purina label E410422 verifies 40 exact ingredients, dog/adult/semi-moist/Burger With Cheddar identity, matching front image, adequacy, and GTIN 038100330772. PetSmart GTIN 038100330482 is an exact ingredient-equal size child. Conflicting GTIN 038100330222 is deliberately excluded.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:25aabe67733cd65f11609da7b72530a0';

  UPDATE public.catalog_acquisition_queue SET
    status='open',resolved_at=NULL,resolution_reason=NULL,
    acquisition_notes='Formula-version conflict: PetSmart GTIN 038100330222 lists 41 ingredients (beef by-product, beef fat, soybean oil, added color) that materially differ from current official Purina label E410422. The barcode safely abstains until an exact current official package label or manufacturer GTIN mapping proves this variant.',
    needs_product_record=true,needs_verified_ingredients=true,
    needs_verified_image=true,needs_pet_type=false,ready_rows=0,
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:0a0ee1570641f78eb44870ce19e19cfd';

  SELECT cache_key INTO v_top FROM public.search_verified_products(
    'Purina Moist & Meaty Burger With Cheddar Cheese Soft Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_barcode_official
  FROM public.resolve_verified_product_by_gtin('038100330772',8)
  ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_barcode_exact_retailer
  FROM public.resolve_verified_product_by_gtin('038100330482',8)
  ORDER BY rank DESC LIMIT 1;
  SELECT count(*) INTO v_conflicting_barcode_count
  FROM public.resolve_verified_product_by_gtin('038100330222',8);

  IF v_top IS DISTINCT FROM v_cache
     OR v_barcode_official IS DISTINCT FROM v_cache
     OR v_barcode_exact_retailer IS DISTINCT FROM v_cache
     OR v_conflicting_barcode_count<>0
  THEN
    RAISE EXCEPTION 'Moist & Meaty Eric regression: search %, official %, exact retailer %, conflict count %',
      v_top,v_barcode_official,v_barcode_exact_retailer,v_conflicting_barcode_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (v_exact_retailer_formula,v_conflicting_formula)
      AND (active OR verification_status<>'quarantined')
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE gtin='038100330222' AND active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND formula_key=v_formula_key AND promoted_cache_key=v_cache
      AND food_form='semi-moist' AND cardinality(ingredients)=40
      AND ingredients[11]='animal fat preserved with mixed-tocopherols'
  ) THEN
    RAISE EXCEPTION 'Moist & Meaty canonical formula or conflicting variant regression';
  END IF;
END
$$;
