-- Repair an Eric-adjacent resolver failure caused by grouping Royal Canin
-- Care Nutrition wet-food siblings at the generic line level. Weight Care
-- Loaf in Sauce is two exact formulas (dog and cat); package sizes are SKU
-- children and never separate formulas.

DO $$
DECLARE
  v_dog_formula BIGINT;
  v_cat_formula BIGINT;
  v_dog_cache TEXT := 'royal-canin-mars-petcare:344518:030111425416';
  v_cat_cache TEXT := 'royal-canin-mars-petcare:1053824:030111411082';
  v_dog_source TEXT := 'https://www.royalcanin.com/us/dogs/products/retail-products/weight-care-loaf-in-sauce-1166/2';
  v_cat_source TEXT := 'https://www.royalcanin.com/us/cats/products/retail-products/weight-care-loaf-in-sauce-1478/1';
  v_dog_key TEXT := 'royal canin|royal canin|canine care nutrition weight care|dog|adult|wet|loaf in sauce|weight care';
  v_cat_key TEXT := 'royal canin|royal canin|feline care nutrition weight care|cat|adult|wet|loaf in sauce|weight care';
  v_run BIGINT;
  v_dog_top TEXT;
  v_cat_top TEXT;
  v_gtin TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_dog_cache
      AND gtin='030111425416'
      AND lower(brand)='royal canin'
      AND pet_type='dog' AND food_form='wet'
      AND ingredient_count=42
      AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
      AND source_url=v_dog_source
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cat_cache
      AND gtin='030111411082'
      AND lower(brand)='royal canin'
      AND pet_type='cat' AND food_form='wet'
      AND ingredient_count=39
      AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
      AND source_url=v_cat_source
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Royal Canin Weight Care canonical manufacturer evidence missing';
  END IF;

  IF (
    SELECT count(*) FROM public.product_data
    WHERE cache_key IN (
      'royal-canin-mars-petcare:344518:030111425416',
      'royal-canin-mars-petcare:344518:030111425492',
      'royal-canin-mars-petcare:974771:030111495013',
      'royal-canin-mars-petcare:974771:10030111995015'
    )
      AND pet_type='dog' AND ingredient_count=42
  ) <> 4 OR (
    SELECT count(*) FROM public.product_data
    WHERE cache_key IN (
      'royal-canin-mars-petcare:1053824:030111411082',
      'royal-canin-mars-petcare:1053824:10030111911091',
      'royal-canin-mars-petcare:1053828:030111410412',
      'royal-canin-mars-petcare:1053828:10030111941074'
    )
      AND pet_type='cat' AND ingredient_count=39
  ) <> 4 THEN
    RAISE EXCEPTION 'Royal Canin Weight Care official size evidence incomplete';
  END IF;

  INSERT INTO public.catalog_formulas(
    formula_key,manufacturer,brand,product_name,product_line,pet_type,
    life_stage,food_form,flavor,diet_condition,is_complete_food,
    complete_food_evidence,ingredient_text,ingredients,front_image_url,
    source_url,source_authority,ingredient_verification_status,
    image_verification_status,protected_terms,verification_status,active,
    is_popular_brand,first_observed_at,last_observed_at,promoted_cache_key,
    promoted_at,identity_hash,updated_at
  )
  SELECT
    v_dog_key,'mars petcare','royal canin',
    'Royal Canin Canine Care Nutrition Weight Care Loaf in Sauce Adult Wet Dog Food',
    'canine care nutrition weight care','dog','adult','wet','loaf in sauce',
    'weight care',true,
    'Canine Care Nutrition Weight Care Loaf in Sauce is formulated to meet the AAFCO Dog Food Nutrient Profiles for maintenance.',
    p.ingredient_text,p.ingredients,p.image_url,p.source_url,'manufacturer',
    'manufacturer','manufacturer',
    ARRAY[
      'royal canin','canine care nutrition','weight care','loaf in sauce',
      'adult','mature','dog','canine','wet'
    ]::TEXT[],
    'verified',true,true,now(),now(),v_dog_cache,now(),
    encode(digest(v_dog_key,'sha256'),'hex'),now()
  FROM public.product_data p WHERE p.cache_key=v_dog_cache
  ON CONFLICT(formula_key) DO UPDATE SET
    product_name=excluded.product_name,product_line=excluded.product_line,
    pet_type=excluded.pet_type,life_stage=excluded.life_stage,
    food_form=excluded.food_form,flavor=excluded.flavor,
    diet_condition=excluded.diet_condition,
    is_complete_food=excluded.is_complete_food,
    complete_food_evidence=excluded.complete_food_evidence,
    ingredient_text=excluded.ingredient_text,ingredients=excluded.ingredients,
    front_image_url=excluded.front_image_url,source_url=excluded.source_url,
    source_authority=excluded.source_authority,
    ingredient_verification_status=excluded.ingredient_verification_status,
    image_verification_status=excluded.image_verification_status,
    protected_terms=excluded.protected_terms,verification_status='verified',
    active=true,absent_since=NULL,is_popular_brand=true,
    last_observed_at=now(),promoted_cache_key=v_dog_cache,
    promoted_at=COALESCE(public.catalog_formulas.promoted_at,now()),
    identity_hash=excluded.identity_hash,updated_at=now()
  RETURNING id INTO v_dog_formula;

  INSERT INTO public.catalog_formulas(
    formula_key,manufacturer,brand,product_name,product_line,pet_type,
    life_stage,food_form,flavor,diet_condition,is_complete_food,
    complete_food_evidence,ingredient_text,ingredients,front_image_url,
    source_url,source_authority,ingredient_verification_status,
    image_verification_status,protected_terms,verification_status,active,
    is_popular_brand,first_observed_at,last_observed_at,promoted_cache_key,
    promoted_at,identity_hash,updated_at
  )
  SELECT
    v_cat_key,'mars petcare','royal canin',
    'Royal Canin Feline Care Nutrition Weight Care Loaf in Sauce Adult Wet Cat Food',
    'feline care nutrition weight care','cat','adult','wet','loaf in sauce',
    'weight care',true,
    'Royal Canin Feline Weight Care Loaf in Sauce is formulated to meet the AAFCO Cat Food Nutrient Profiles for maintenance.',
    p.ingredient_text,p.ingredients,p.image_url,p.source_url,'manufacturer',
    'manufacturer','manufacturer',
    ARRAY[
      'royal canin','feline care nutrition','weight care','loaf in sauce',
      'loaf pate','adult','mature','cat','feline','wet'
    ]::TEXT[],
    'verified',true,true,now(),now(),v_cat_cache,now(),
    encode(digest(v_cat_key,'sha256'),'hex'),now()
  FROM public.product_data p WHERE p.cache_key=v_cat_cache
  ON CONFLICT(formula_key) DO UPDATE SET
    product_name=excluded.product_name,product_line=excluded.product_line,
    pet_type=excluded.pet_type,life_stage=excluded.life_stage,
    food_form=excluded.food_form,flavor=excluded.flavor,
    diet_condition=excluded.diet_condition,
    is_complete_food=excluded.is_complete_food,
    complete_food_evidence=excluded.complete_food_evidence,
    ingredient_text=excluded.ingredient_text,ingredients=excluded.ingredients,
    front_image_url=excluded.front_image_url,source_url=excluded.source_url,
    source_authority=excluded.source_authority,
    ingredient_verification_status=excluded.ingredient_verification_status,
    image_verification_status=excluded.image_verification_status,
    protected_terms=excluded.protected_terms,verification_status='verified',
    active=true,absent_since=NULL,is_popular_brand=true,
    last_observed_at=now(),promoted_cache_key=v_cat_cache,
    promoted_at=COALESCE(public.catalog_formulas.promoted_at,now()),
    identity_hash=excluded.identity_hash,updated_at=now()
  RETURNING id INTO v_cat_formula;

  UPDATE public.product_data SET
    brand='Royal Canin',
    product_name='Royal Canin Canine Care Nutrition Weight Care Loaf in Sauce Adult Wet Dog Food',
    product_line='Canine Care Nutrition Weight Care',
    flavor='Loaf in Sauce',pet_type='dog',life_stage='adult',food_form='wet',
    is_complete_food=true,source='royal-canin-mars-petcare',
    source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    verified_at=COALESCE(verified_at,now()),catalog_exclusion_reason=NULL,
    updated_at=now()
  WHERE cache_key=v_dog_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',
    updated_at=now()
  WHERE cache_key IN (
    'royal-canin-mars-petcare:344518:030111425492',
    'royal-canin-mars-petcare:974771:030111495013',
    'royal-canin-mars-petcare:974771:10030111995015'
  );

  UPDATE public.product_data SET
    brand='Royal Canin',
    product_name='Royal Canin Feline Care Nutrition Weight Care Loaf in Sauce Adult Wet Cat Food',
    product_line='Feline Care Nutrition Weight Care',
    flavor='Loaf in Sauce',pet_type='cat',life_stage='adult',food_form='wet',
    is_complete_food=true,source='royal-canin-mars-petcare',
    source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    verified_at=COALESCE(verified_at,now()),catalog_exclusion_reason=NULL,
    updated_at=now()
  WHERE cache_key=v_cat_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',
    updated_at=now()
  WHERE cache_key IN (
    'royal-canin-mars-petcare:1053824:10030111911091',
    'royal-canin-mars-petcare:1053828:030111410412',
    'royal-canin-mars-petcare:1053828:10030111941074'
  );

  UPDATE public.catalog_observations SET
    formula_id=v_dog_formula,manufacturer='mars petcare',brand='royal canin',
    product_line='canine care nutrition weight care',pet_type='dog',
    life_stage='adult',food_form='wet',flavor='loaf in sauce',
    diet_condition='weight care',is_complete_food=true,
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_official_formula',
        'canonical_formula_id',v_dog_formula,
        'species_boundary','dog','texture_boundary','loaf in sauce',
        'condition_boundary','weight care'
      )
    )
  WHERE gtin IN ('030111425416','030111425492','030111495013','10030111995015')
     OR formula_id IN (17062,19758);

  UPDATE public.catalog_observations SET
    formula_id=v_cat_formula,manufacturer='mars petcare',brand='royal canin',
    product_line='feline care nutrition weight care',pet_type='cat',
    life_stage='adult',food_form='wet',flavor='loaf in sauce',
    diet_condition='weight care',is_complete_food=true,
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_official_formula',
        'canonical_formula_id',v_cat_formula,
        'species_boundary','cat','texture_boundary','loaf in sauce',
        'condition_boundary','weight care'
      )
    )
  WHERE gtin IN ('030111410412','030111411082','10030111911091','10030111941074')
     OR formula_id=11931;

  UPDATE public.catalog_skus SET formula_id=v_dog_formula,updated_at=now()
  WHERE gtin IN ('030111425416','030111425492','030111495013','10030111995015')
     OR formula_id IN (17062,19758);

  UPDATE public.catalog_skus SET formula_id=v_cat_formula,updated_at=now()
  WHERE gtin IN ('030111410412','030111411082','10030111911091','10030111941074')
     OR formula_id=11931;

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,
    metadata,updated_at
  )
  SELECT f.formula_key,v_dog_formula,canonical.identity_hash,'manual_review',
    COALESCE(NULLIF(f.source_url,''),v_dog_source),
    jsonb_build_object(
      'exact_formula_identity',true,'species_boundary','dog',
      'texture_boundary','loaf in sauce','condition_boundary','weight care',
      'reconciled_at',now()
    ),now()
  FROM public.catalog_formulas f
  CROSS JOIN public.catalog_formulas canonical
  WHERE f.id IN (17062,19758) AND canonical.id=v_dog_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,
    metadata,updated_at
  )
  SELECT f.formula_key,v_cat_formula,canonical.identity_hash,'manual_review',
    COALESCE(NULLIF(f.source_url,''),v_cat_source),
    jsonb_build_object(
      'exact_formula_identity',true,'species_boundary','cat',
      'texture_boundary','loaf in sauce','condition_boundary','weight care',
      'reconciled_at',now()
    ),now()
  FROM public.catalog_formulas f
  CROSS JOIN public.catalog_formulas canonical
  WHERE f.id=11931 AND canonical.id=v_cat_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded by exact Royal Canin manufacturer formula; this discovery identity is retained only as an alias.',
    updated_at=now()
  WHERE id IN (11931,17062,19758);

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_dog_cache,
      'Royal Canin Canine Care Nutrition Weight Care Loaf in Sauce Adult Wet Dog Food',
      public.normalize_verified_product_search_query(
        'Royal Canin Canine Care Nutrition Weight Care Loaf in Sauce Adult Wet Dog Food'
      ),
      v_dog_source,'manufacturer',now(),
      jsonb_build_object(
        'eric_regression',true,'species_boundary','dog',
        'texture_boundary','loaf in sauce','condition_boundary','weight care'
      )
    ),
    (
      v_cat_cache,
      'Royal Canin Feline Care Nutrition Weight Care Loaf in Sauce Adult Wet Cat Food',
      public.normalize_verified_product_search_query(
        'Royal Canin Feline Care Nutrition Weight Care Loaf in Sauce Adult Wet Cat Food'
      ),
      v_cat_source,'manufacturer',now(),
      jsonb_build_object(
        'eric_regression',true,'species_boundary','cat',
        'texture_boundary','loaf in sauce','condition_boundary','weight care'
      )
    ),
    (
      v_cat_cache,
      'Royal Canin Feline Care Nutrition Weight Care Loaf Pate Wet Cat Food',
      public.normalize_verified_product_search_query(
        'Royal Canin Feline Care Nutrition Weight Care Loaf Pate Wet Cat Food'
      ),
      v_cat_source,'manufacturer',now(),
      jsonb_build_object(
        'species_boundary','cat','retailer_texture_alias','loaf pate',
        'condition_boundary','weight care'
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
    'manual-exact-evidence:royal-canin:weight-care-loaf-dog-cat:20260725',
    'royal-canin-mars-petcare','manufacturer','verification','completed',
    now(),now(),8,8,8,0,true,
    encode(digest(v_dog_source||'|'||v_cat_source,'sha256'),'hex'),
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,'eric_adjacent_regression',true,
      'dog_formula_id',v_dog_formula,'cat_formula_id',v_cat_formula,
      'dog_ingredient_count',42,'cat_ingredient_count',39,
      'dog_gtins',jsonb_build_array(
        '030111425416','030111425492','030111495013','10030111995015'
      ),
      'cat_gtins',jsonb_build_array(
        '030111410412','030111411082','10030111911091','10030111941074'
      ),
      'identity_repair','split generic Care Nutrition wet-food sibling collapse'
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),expected_count=8,observed_count=8,
    accepted_count=8,rejected_count=0,pagination_complete=true,
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
    v_run,
    CASE p.pet_type WHEN 'dog' THEN v_dog_formula ELSE v_cat_formula END,
    'royal-canin-mars-petcare',p.cache_key,p.source_url,'manufacturer',
    p.gtin,'mars petcare','royal canin',p.product_name,
    CASE p.pet_type
      WHEN 'dog' THEN 'canine care nutrition weight care'
      ELSE 'feline care nutrition weight care'
    END,
    p.pet_type,'adult','wet','loaf in sauce','weight care',p.package_size,
    p.ingredient_text,p.image_url,true,true,now(),
    encode(digest(p.cache_key||'|'||p.ingredient_text||'|'||p.image_url,'sha256'),'hex'),
    'accepted',ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_page',p.source_url,'official_front_image',p.image_url,
      'official_gtin',p.gtin,'official_package_size',p.package_size,
      'ingredient_count',p.ingredient_count,
      'species_boundary',p.pet_type,'texture_boundary','loaf in sauce',
      'condition_boundary','weight care'
    )
  FROM public.product_data p
  WHERE p.cache_key IN (
    'royal-canin-mars-petcare:344518:030111425416',
    'royal-canin-mars-petcare:344518:030111425492',
    'royal-canin-mars-petcare:974771:030111495013',
    'royal-canin-mars-petcare:974771:10030111995015',
    'royal-canin-mars-petcare:1053824:030111411082',
    'royal-canin-mars-petcare:1053824:10030111911091',
    'royal-canin-mars-petcare:1053828:030111410412',
    'royal-canin-mars-petcare:1053828:10030111941074'
  )
  ON CONFLICT(run_id,source_slug,source_external_id,content_hash) DO UPDATE SET
    formula_id=excluded.formula_id,validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[],raw_payload=excluded.raw_payload,
    observed_at=now();

  INSERT INTO public.catalog_skus(
    formula_id,gtin,package_size,package_count,source_slug,
    source_external_id,source_url,active,first_observed_at,last_observed_at,
    updated_at
  )
  SELECT
    CASE p.pet_type WHEN 'dog' THEN v_dog_formula ELSE v_cat_formula END,
    p.gtin,p.package_size,
    CASE
      WHEN p.package_size ~ '^[0-9]+ x ' THEN
        (regexp_match(p.package_size,'^([0-9]+) x '))[1]::INTEGER
      ELSE 1
    END,
    'royal-canin-mars-petcare-manual-exact',p.cache_key,p.source_url,true,
    now(),now(),now()
  FROM public.product_data p
  WHERE p.cache_key IN (
    'royal-canin-mars-petcare:344518:030111425416',
    'royal-canin-mars-petcare:344518:030111425492',
    'royal-canin-mars-petcare:974771:030111495013',
    'royal-canin-mars-petcare:974771:10030111995015',
    'royal-canin-mars-petcare:1053824:030111411082',
    'royal-canin-mars-petcare:1053824:10030111911091',
    'royal-canin-mars-petcare:1053828:030111410412',
    'royal-canin-mars-petcare:1053828:10030111941074'
  )
  ON CONFLICT(source_slug,source_external_id,gtin,package_size) DO UPDATE SET
    formula_id=excluded.formula_id,package_count=excluded.package_count,
    source_url=excluded.source_url,active=true,last_observed_at=now(),
    updated_at=now();

  INSERT INTO public.catalog_field_evidence(
    formula_id,observation_id,field_name,field_value,source_url,
    source_authority,accepted,observed_at,content_hash
  )
  SELECT formula_id,NULL,field_name,to_jsonb(field_value),source_url,
    'manufacturer',true,now(),
    encode(digest(formula_id::TEXT||'|'||field_name||'|'||field_value||'|'||source_url,'sha256'),'hex')
  FROM (
    VALUES
      (v_dog_formula,'species','dog',v_dog_source),
      (v_dog_formula,'life_stage','adult',v_dog_source),
      (v_dog_formula,'food_form','wet',v_dog_source),
      (v_dog_formula,'texture','loaf in sauce',v_dog_source),
      (v_dog_formula,'diet_condition','weight care',v_dog_source),
      (v_dog_formula,'ingredient_count','42',v_dog_source),
      (v_cat_formula,'species','cat',v_cat_source),
      (v_cat_formula,'life_stage','adult',v_cat_source),
      (v_cat_formula,'food_form','wet',v_cat_source),
      (v_cat_formula,'texture','loaf in sauce',v_cat_source),
      (v_cat_formula,'diet_condition','weight care',v_cat_source),
      (v_cat_formula,'ingredient_count','39',v_cat_source)
  ) evidence(formula_id,field_name,field_value,source_url)
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
    review_key,target_key,corrected_key,'Royal Canin',product_name,
    search_query,discovery_urls,source_url,'manufacturer_page',
    expected_identity,resolved_identity,'promoted',NULL,
    encode(digest(source_url||'|'||ingredient_text||'|'||front_image_url,'sha256'),'hex'),
    encode(digest(ingredient_text,'sha256'),'hex'),
    encode(digest(front_image_url,'sha256'),'hex'),
    now(),formula_id,cache_key,1,review_notes,now()
  FROM (
    SELECT
      'manual-search:royal-canin:weight-care-loaf-dog:20260725' review_key,
      'royal canin|royal canin|canine care nutrition|dog|unknown|wet||' target_key,
      v_dog_key corrected_key,
      'Royal Canin Weight Care Loaf in Sauce Adult Wet Dog Food' product_name,
      'Royal Canin Weight Care Loaf in Sauce dog ingredients' search_query,
      jsonb_build_array(v_dog_source) discovery_urls,v_dog_source source_url,
      jsonb_build_object(
        'brand','Royal Canin','pet_type','dog','life_stage','adult',
        'food_form','wet','texture','loaf in sauce','condition','weight care'
      ) expected_identity,
      jsonb_build_object(
        'formula_id',v_dog_formula,'gtins',jsonb_build_array(
          '030111425416','030111425492','030111495013','10030111995015'
        )
      ) resolved_identity,
      f.ingredient_text,f.front_image_url,v_dog_formula formula_id,
      v_dog_cache cache_key,
      'Split exact dog formula from generic Canine Care Nutrition sibling collapse. Four official size GTINs now resolve one verified formula; cat remains a hard boundary.'
        review_notes
    FROM public.catalog_formulas f WHERE f.id=v_dog_formula
    UNION ALL
    SELECT
      'manual-search:royal-canin:weight-care-loaf-cat:20260725',
      'royal canin|royal canin|feline care nutrition|cat|unknown|wet||',
      v_cat_key,
      'Royal Canin Weight Care Loaf in Sauce Adult Wet Cat Food',
      'Royal Canin Weight Care Loaf in Sauce cat ingredients',
      jsonb_build_array(v_cat_source),v_cat_source,
      jsonb_build_object(
        'brand','Royal Canin','pet_type','cat','life_stage','adult',
        'food_form','wet','texture','loaf in sauce','condition','weight care'
      ),
      jsonb_build_object(
        'formula_id',v_cat_formula,'gtins',jsonb_build_array(
          '030111410412','030111411082','10030111911091','10030111941074'
        )
      ),
      f.ingredient_text,f.front_image_url,v_cat_formula,v_cat_cache,
      'Split exact cat formula from generic Feline Care Nutrition sibling collapse. Four official size GTINs now resolve one verified formula; dog remains a hard boundary.'
    FROM public.catalog_formulas f WHERE f.id=v_cat_formula
  ) reviews
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
    resolution_reason='Exact Royal Canin Feline Weight Care Loaf in Sauce formula promoted from official manufacturer evidence.',
    acquisition_notes='The generic Feline Care Nutrition sibling merge was split. Exact cat identity, 39 ingredients, matching front images, four size GTINs, adult maintenance adequacy, wet loaf texture, and Weight Care boundary are verified.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    sample_metadata=COALESCE(sample_metadata,'{}'::JSONB)||jsonb_build_object(
      'matched_formula_id',v_cat_formula,'matched_cache_key',v_cat_cache,
      'eric_adjacent_regression',true,'reconciled_at',now()
    ),
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='lookup:cde8ac6b2ded671a2131bec58f21b0ff'
     OR id='152cfc13-8efa-4bc1-8523-f1184c6bcedb'::UUID;

  SELECT cache_key INTO v_dog_top
  FROM public.search_verified_products(
    'Royal Canin Canine Care Nutrition Weight Care Loaf in Sauce Adult Wet Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_cat_top
  FROM public.search_verified_products(
    'Royal Canin Feline Care Nutrition Weight Care Loaf in Sauce Adult Wet Cat Food',8
  ) ORDER BY rank DESC LIMIT 1;

  IF v_dog_top IS DISTINCT FROM v_dog_cache
     OR v_cat_top IS DISTINCT FROM v_cat_cache
  THEN
    RAISE EXCEPTION 'Royal Canin Weight Care exact search regression: dog %, cat %',
      v_dog_top,v_cat_top;
  END IF;

  FOREACH v_gtin IN ARRAY ARRAY[
    '030111425416','030111425492','030111495013','10030111995015'
  ]::TEXT[] LOOP
    IF (
      SELECT cache_key FROM public.resolve_verified_product_by_gtin(v_gtin,8)
      ORDER BY rank DESC LIMIT 1
    ) IS DISTINCT FROM v_dog_cache THEN
      RAISE EXCEPTION 'Royal Canin Weight Care dog GTIN regression: %',v_gtin;
    END IF;
  END LOOP;

  FOREACH v_gtin IN ARRAY ARRAY[
    '030111410412','030111411082','10030111911091','10030111941074'
  ]::TEXT[] LOOP
    IF (
      SELECT cache_key FROM public.resolve_verified_product_by_gtin(v_gtin,8)
      ORDER BY rank DESC LIMIT 1
    ) IS DISTINCT FROM v_cat_cache THEN
      RAISE EXCEPTION 'Royal Canin Weight Care cat GTIN regression: %',v_gtin;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (11931,17062,19758)
      AND (active OR verification_status<>'quarantined')
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_dog_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_dog_cache AND pet_type='dog'
      AND life_stage='adult' AND food_form='wet'
      AND flavor='loaf in sauce' AND diet_condition='weight care'
      AND cardinality(ingredients)=42
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_cat_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cat_cache AND pet_type='cat'
      AND life_stage='adult' AND food_form='wet'
      AND flavor='loaf in sauce' AND diet_condition='weight care'
      AND cardinality(ingredients)=39
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE formula_id IN (7440,8765)
      AND (
        gtin IN (
          '030111425416','030111425492','030111495013','10030111995015',
          '030111410412','030111411082','10030111911091','10030111941074'
        )
        OR lower(product_name) LIKE '%weight care%loaf%'
      )
  ) THEN
    RAISE EXCEPTION 'Royal Canin Weight Care exact formula graph regression';
  END IF;
END
$$;
