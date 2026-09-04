-- Close the live Wellness Complete Health Stews Chicken lookup miss from the
-- current official manufacturer PDP. The official page publishes exact
-- ingredients, image, complete-food evidence, SKU, GTIN, and package size.

DO $$
DECLARE
  v_formula BIGINT := 10403;
  v_duplicates BIGINT[] := ARRAY[13628,16015,23148]::BIGINT[];
  v_cache TEXT := 'wellness-pet-company:wellness wellness complete health chicken';
  v_source TEXT := 'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-stews-chicken/';
  v_front TEXT := 'https://images.salsify.com/image/upload/s--PnrQnzU3--/w_500/n5o6ttn4fwhajjfdpxfa.jpg';
  v_pdf TEXT := 'https://images.salsify.com/image/upload/s--2qee1FoZ--/w_500/fy4xgdit5i3ex5ldjnho.pdf';
  v_gtin TEXT := '076344017059';
  v_run BIGINT;
  v_top TEXT;
  v_barcode TEXT;
  v_beef_top TEXT;
  v_turkey_top TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache
      AND lower(brand)='wellness' AND pet_type='dog' AND food_form='wet'
      AND lower(product_line)='complete health stews'
      AND lower(flavor)='chicken' AND ingredient_count=40
      AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
      AND source_url=v_source AND image_url=v_front
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula
      AND formula_key='wellness|wellness|complete health stews|dog|unknown|wet|chicken|'
      AND cardinality(ingredients)=40
      AND source_url=v_source AND source_authority='manufacturer'
  ) THEN
    RAISE EXCEPTION 'Wellness Complete Health Stews Chicken prerequisites failed';
  END IF;

  UPDATE public.product_data SET
    product_name='Wellness Complete Health Stews Chicken Wet Dog Food',
    brand='Wellness',product_line='Complete Health Stews',
    flavor='Chicken',pet_type='dog',food_form='wet',
    package_size='12.5 oz can',gtin=v_gtin,is_complete_food=true,
    source='wellness-pet-company',source_quality='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',image_url=v_front,
    verified_at=COALESCE(verified_at,now()),
    catalog_exclusion_reason=NULL,updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.catalog_formulas SET
    product_name='Wellness Complete Health Stews Chicken Wet Dog Food',
    product_line='complete health stews',pet_type='dog',
    life_stage='unknown',food_form='wet',flavor='chicken',
    diet_condition='',is_complete_food=true,
    complete_food_evidence='The current official Wellness page states this exact Chicken stew is complete and balanced for everyday feeding.',
    front_image_url=v_front,source_url=v_source,
    source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'wellness','complete health','complete health stews','stews',
      'chicken','peas','carrots','chunky','dog','wet'
    ]::TEXT[],
    verification_status='verified',active=true,absent_since=NULL,
    is_popular_brand=true,promoted_cache_key=v_cache,
    promoted_at=COALESCE(promoted_at,now()),last_observed_at=now(),
    updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET
    formula_id=v_formula,manufacturer='wellness pet company',
    brand='wellness',
    product_name='Wellness Complete Health Stews Chicken Wet Dog Food',
    product_line='complete health stews',pet_type='dog',
    life_stage='unknown',food_form='wet',flavor='chicken',
    diet_condition='',is_complete_food=true,validation_status='accepted',
    validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','exact_official_formula',
        'canonical_formula_id',v_formula,'species_boundary','dog',
        'food_form_boundary','wet','recipe_boundary','chicken',
        'texture_boundary','stew','official_sku','1700',
        'official_gtin',v_gtin,'official_package_size','12.5 oz can'
      )
    )
  WHERE formula_id=ANY(v_duplicates)
     OR formula_id=v_formula
     OR (
       source_slug IN ('chewy-public-sitemap','walmart-public-sitemap')
       AND lower(product_name) LIKE '%chicken%stew%'
       AND pet_type='dog'
     );

  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE formula_id=ANY(v_duplicates);

  INSERT INTO public.catalog_skus(
    formula_id,gtin,package_size,package_count,source_slug,
    source_external_id,source_url,active,first_observed_at,last_observed_at,
    updated_at
  ) VALUES(
    v_formula,v_gtin,'12.5 oz can',1,'wellness-manufacturer-manual',
    '1700:076344017059',v_source,true,now(),now(),now()
  )
  ON CONFLICT(source_slug,source_external_id,gtin,package_size) DO UPDATE SET
    formula_id=excluded.formula_id,source_url=excluded.source_url,
    active=true,last_observed_at=now(),updated_at=now();

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,
    metadata,updated_at
  )
  SELECT f.formula_key,v_formula,canonical.identity_hash,'manual_review',
    COALESCE(NULLIF(f.source_url,''),v_source),
    jsonb_build_object(
      'exact_formula_identity',true,'species_boundary','dog',
      'food_form_boundary','wet','recipe_boundary','chicken',
      'texture_boundary','stew','official_sku','1700',
      'official_gtin',v_gtin,'reconciled_at',now()
    ),now()
  FROM public.catalog_formulas f
  CROSS JOIN public.catalog_formulas canonical
  WHERE f.id=ANY(v_duplicates) AND canonical.id=v_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded exact Chewy/Walmart title alias of the current official Wellness Complete Health Stews Chicken formula.',
    updated_at=now()
  WHERE id=ANY(v_duplicates);

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES
    (
      v_cache,'Wellness Complete Health Stews Chicken',
      public.normalize_verified_product_search_query(
        'Wellness Complete Health Stews Chicken'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'runtime_miss_regression',true,'species_boundary','dog',
        'food_form_boundary','wet','recipe_boundary','chicken',
        'texture_boundary','stew'
      )
    ),
    (
      v_cache,
      'Wellness Complete Health Chicken Stew with Peas and Carrots Wet Dog Food',
      public.normalize_verified_product_search_query(
        'Wellness Complete Health Chicken Stew with Peas and Carrots Wet Dog Food'
      ),
      v_source,'manufacturer',now(),
      jsonb_build_object(
        'source','retailer_shelf_title','species_boundary','dog',
        'food_form_boundary','wet','recipe_boundary','chicken',
        'visible_vegetables',jsonb_build_array('peas','carrots')
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
    'manual-exact-evidence:wellness:complete-health-stews-chicken:20260725',
    'wellness-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),1,1,1,0,true,
    'ce01c62706c75efb618d8fdc72bda3fddd997bf1334a22fdb2c0ef45010e7111',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,'runtime_miss_regression',true,
      'cached_official_page_sha256','ce01c62706c75efb618d8fdc72bda3fddd997bf1334a22fdb2c0ef45010e7111',
      'official_sku','1700','official_gtin',v_gtin,
      'official_package_size','12.5 oz can','ingredient_count',40,
      'nutrient_profile_pdf',v_pdf,'canonical_formula_id',v_formula
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
    v_run,v_formula,'wellness-manufacturer-manual','1700',v_source,
    'manufacturer',v_gtin,'Wellness Pet Company','Wellness',
    product_name,'Complete Health Stews','dog','unknown','wet','Chicken','',
    '12.5 oz can',ingredient_text,v_front,true,true,now(),
    encode(digest(v_source||'|'||ingredient_text||'|'||v_front||'|'||v_gtin,'sha256'),'hex'),
    'accepted',ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_page',v_source,'official_front_image',v_front,
      'official_sku','1700','official_gtin',v_gtin,
      'official_package_size','12.5 oz can',
      'ingredient_count',40,'nutrient_profile_pdf',v_pdf,
      'complete_food_evidence','Complete and balanced for everyday feeding.',
      'species_boundary','dog','food_form_boundary','wet',
      'recipe_boundary','chicken','texture_boundary','stew'
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
  SELECT v_formula,NULL,field_name,to_jsonb(field_value),v_source,
    'manufacturer',true,now(),
    encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||v_source,'sha256'),'hex')
  FROM (
    VALUES
      ('species','dog'),('food_form','wet'),('texture','stew'),
      ('product_line','Complete Health Stews'),('recipe','Chicken'),
      ('ingredient_count','40'),('official_sku','1700'),
      ('official_gtin',v_gtin),('official_package_size','12.5 oz can'),
      ('nutrient_profile_pdf',v_pdf),
      ('complete_food_evidence','Complete and balanced for everyday feeding.')
  ) evidence(field_name,field_value)
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
    'manual-search:wellness:complete-health-stews-chicken:20260725',
    formula_key,formula_key,'Wellness',product_name,
    'Wellness Complete Health Stews Chicken ingredients',
    jsonb_build_array(v_source,v_pdf,v_front),v_source,'manufacturer_page',
    jsonb_build_object(
      'brand','Wellness','product_line','Complete Health Stews',
      'pet_type','dog','food_form','wet','flavor','Chicken',
      'texture','stew'
    ),
    jsonb_build_object(
      'formula_id',id,'official_sku','1700','official_gtin',v_gtin,
      'official_package_size','12.5 oz can'
    ),
    'promoted',NULL,
    'ce01c62706c75efb618d8fdc72bda3fddd997bf1334a22fdb2c0ef45010e7111',
    encode(digest(ingredient_text,'sha256'),'hex'),
    encode(digest(front_image_url,'sha256'),'hex'),
    now(),id,v_cache,1,
    'The cached current official Wellness page verifies the exact 40-ingredient Chicken stew, dog/wet/stew identity, matching front image, complete-food statement, SKU 1700, GTIN 076344017059, 12.5 oz can, and nutrient-profile PDF. Beef, turkey, lamb, venison, and mixed-protein siblings remain separate.',
    now()
  FROM public.catalog_formulas WHERE id=v_formula
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
    resolution_reason='Exact Wellness Complete Health Stews Chicken wet dog formula is now connected to its verified serving row and official package GTIN.',
    acquisition_notes='The current official Wellness PDP verifies 40 ingredients, matching front image, complete-and-balanced evidence, dog/wet/stew identity, SKU 1700, GTIN 076344017059, 12.5 oz can, and nutrient-profile PDF. Exact search aliases clear the client confidence floor; non-Chicken sibling recipes remain separate.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    sample_metadata=COALESCE(sample_metadata,'{}'::JSONB)||jsonb_build_object(
      'matched_formula_id',v_formula,'matched_cache_key',v_cache,
      'official_sku','1700','official_gtin',v_gtin,
      'runtime_miss_regression',true,'reconciled_at',now()
    ),
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='lookup:483e5afc7abf2ef95ea99c52580c7867';

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Wellness Complete Health Stews Chicken',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_barcode
  FROM public.resolve_verified_product_by_gtin(v_gtin,8)
  ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_beef_top
  FROM public.search_verified_products(
    'Wellness Complete Health Stews Beef',8
  ) ORDER BY rank DESC LIMIT 1;
  SELECT cache_key INTO v_turkey_top
  FROM public.search_verified_products(
    'Wellness Complete Health Stews Turkey',8
  ) ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache OR v_barcode IS DISTINCT FROM v_cache
     OR v_beef_top IS NOT DISTINCT FROM v_cache
     OR v_turkey_top IS NOT DISTINCT FROM v_cache
  THEN
    RAISE EXCEPTION 'Wellness Chicken stew regression: exact %, barcode %, beef %, turkey %',
      v_top,v_barcode,v_beef_top,v_turkey_top;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=ANY(v_duplicates)
      AND (active OR verification_status<>'quarantined')
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND pet_type='dog'
      AND food_form='wet' AND flavor='chicken'
      AND cardinality(ingredients)=40
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE formula_id=v_formula AND gtin=v_gtin
      AND package_size='12.5 oz can' AND active
  ) THEN
    RAISE EXCEPTION 'Wellness Chicken stew canonical formula graph regression';
  END IF;
END
$$;
