DO $$
DECLARE
  v_formula BIGINT;
  v_cache TEXT := 'nestle-purina-pro-plan:038100106711';
  v_formula_key TEXT := 'purina pro plan|purina pro plan|pro plan advantedge small breed adult 7 senior support shredded blend|dog|senior|dry|chicken and rice formula|';
  v_source TEXT := 'https://www.purina.com/dogs/shop/pro-plan-advantedge-senior-support-small-breed-shredded-blend-chicken-rice-dry-dog-food';
  v_front TEXT := 'https://www.purina.com/sites/default/files/products/2025-12/pro-plan-advantedge-senior-support-small-breed-dry-dog-food.png';
  v_run BIGINT;
  v_top TEXT;
  v_barcode TEXT;
BEGIN
  SELECT id INTO STRICT v_formula
  FROM public.catalog_formulas
  WHERE formula_key=v_formula_key;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND gtin='038100106711'
      AND pet_type='dog' AND life_stage='senior' AND food_form='dry'
      AND package_size='3.5 lb' AND ingredient_count=51
      AND product_line='Pro Plan AdvantEDGE Small Breed Adult 7+ Senior Support+ Shredded Blend'
      AND flavor='Chicken & Rice Formula'
      AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
      AND source_url=v_source AND image_url=v_front
      AND is_complete_food=true
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Small Breed Senior Support canonical manufacturer row missing or changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas f
    JOIN public.product_data p ON p.cache_key=v_cache
    WHERE f.id=v_formula
      AND cardinality(f.ingredients)=51
      AND f.ingredient_text=p.ingredient_text
      AND f.source_url=v_source
      AND f.front_image_url=v_front
      AND f.source_authority='manufacturer'
      AND f.pet_type='dog' AND f.life_stage='senior' AND f.food_form='dry'
      AND f.flavor='chicken and rice formula'
  ) THEN
    RAISE EXCEPTION 'Small Breed Senior Support canonical formula evidence missing or disagrees';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE formula_id=v_formula
      AND source_slug='chewy-public-sitemap'
      AND source_external_id='3583783'
      AND product_name='Purina Pro Plan AdvantEDGE Senior Support Plus Small Breed Shredded Blend Chicken & Rice Formula Senior Dry Dog Food,'
      AND pet_type='dog' AND life_stage='senior' AND food_form='dry'
  ) THEN
    RAISE EXCEPTION 'Exact Chewy discovery identity missing';
  END IF;

  UPDATE public.product_data SET
    product_name='Pro Plan AdvantEDGE Small Breed Adult 7+ Senior Support+ Shredded Blend Chicken & Rice Formula Dry Dog Food',
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
    gtin='038100106711',
    product_line='Pro Plan AdvantEDGE Small Breed Adult 7+ Senior Support+ Shredded Blend',
    flavor='Chicken & Rice Formula',
    life_stage='senior',
    food_form='dry',
    package_size='3.5 lb'
  WHERE cache_key=v_cache;

  UPDATE public.catalog_formulas SET
    product_name='Pro Plan AdvantEDGE Small Breed Adult 7+ Senior Support+ Shredded Blend Chicken & Rice Formula Dry Dog Food',
    product_line='pro plan advantedge small breed adult 7 senior support shredded blend',
    pet_type='dog',
    life_stage='senior',
    food_form='dry',
    flavor='chicken and rice formula',
    diet_condition='',
    is_complete_food=true,
    complete_food_evidence='Animal feeding tests using AAFCO procedures substantiate that this exact Pro Plan AdvantEDGE Senior Support+ Small Breed Shredded Blend Chicken & Rice Formula provides complete and balanced nutrition for maintenance of adult dogs.',
    front_image_url=v_front,
    source_url=v_source,
    source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY[
      'purina pro plan','pro plan','advantedge','senior support',
      'small breed','adult 7+','senior','shredded blend',
      'chicken','rice','dog','dry'
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
    'Purina Pro Plan AdvantEDGE Senior Support Plus Small Breed Shredded Blend Chicken & Rice Formula Senior Dry Dog Food',
    public.normalize_verified_product_search_query(
      'Purina Pro Plan AdvantEDGE Senior Support Plus Small Breed Shredded Blend Chicken & Rice Formula Senior Dry Dog Food'
    ),
    v_source,'manufacturer',now(),
    jsonb_build_object(
      'chewy_listing_id','3583783',
      'species_boundary','dog','life_stage_boundary','senior',
      'breed_size_boundary','small breed','food_form_boundary','dry',
      'line_boundary','AdvantEDGE Senior Support+',
      'texture_boundary','shredded blend','recipe_boundary','chicken and rice'
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
    'manual-exact-evidence:purina-pro-plan:advantedge-small-breed-senior-support:20260725',
    'purina-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),1,1,1,0,true,
    'f6ba6feb642b43dd688869ffdf62d94adfe80d10e1b24182cacbc31a65dc1e9f',
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,
      'official_page_captured_at','2026-07-24T06:26:41.663Z',
      'official_page_sha256','f6ba6feb642b43dd688869ffdf62d94adfe80d10e1b24182cacbc31a65dc1e9f',
      'official_gtin','038100106711','official_package_size','3.5 lb',
      'ingredient_count',51,'chewy_listing_id','3583783'
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
    v_run,v_formula,'purina-manufacturer-manual','038100106711',v_source,'manufacturer',
    '038100106711','Nestlé Purina PetCare Company','Purina Pro Plan',
    product_name,'Pro Plan AdvantEDGE Small Breed Adult 7+ Senior Support+ Shredded Blend',
    'dog','senior','dry','Chicken & Rice Formula','','3.5 lb',ingredient_text,v_front,
    true,true,now(),
    encode(digest(v_source||'|'||ingredient_text||'|'||v_front,'sha256'),'hex'),
    'accepted',ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_page',v_source,'official_front_image',v_front,
      'official_gtin','038100106711','official_package_size','3.5 lb',
      'ingredient_count',51,'chewy_listing_id','3583783',
      'complete_food_statement','Animal feeding tests using AAFCO procedures substantiate complete and balanced nutrition for maintenance of adult dogs'
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
      ('front_image_url',v_front),('official_gtin','038100106711'),
      ('package_size','3.5 lb'),('pet_type','dog'),('life_stage','senior'),
      ('food_form','dry'),('breed_size','small breed'),
      ('line','AdvantEDGE Senior Support+'),('texture','shredded blend'),
      ('recipe','chicken and rice'),
      ('complete_food_evidence','Animal feeding tests using AAFCO procedures substantiate complete and balanced nutrition for maintenance of adult dogs')
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
    'manual-search:purina-pro-plan:advantedge-small-breed-senior-support:20260725',
    formula_key,formula_key,'Purina Pro Plan',product_name,
    'Purina Pro Plan AdvantEDGE Senior Support Plus Small Breed Shredded Blend Chicken Rice ingredients',
    jsonb_build_array(
      v_source,
      'https://www.chewy.com/purina-pro-plan-advantedge-senior/dp/3583783'
    ),
    v_source,'manufacturer_page',
    jsonb_build_object(
      'brand','Purina Pro Plan','line','AdvantEDGE Senior Support+',
      'pet_type','dog','life_stage','senior','breed_size','small breed',
      'food_form','dry','texture','shredded blend','flavor','Chicken & Rice'
    ),
    jsonb_build_object(
      'brand','Purina Pro Plan',
      'product_line','AdvantEDGE Small Breed Adult 7+ Senior Support+ Shredded Blend',
      'pet_type','dog','life_stage','senior','food_form','dry',
      'flavor','Chicken & Rice Formula','gtin','038100106711','package_size','3.5 lb'
    ),
    'promoted',NULL,
    'f6ba6feb642b43dd688869ffdf62d94adfe80d10e1b24182cacbc31a65dc1e9f',
    encode(digest(ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),
    now(),id,promoted_cache_key,1,
    'Current official Purina page verifies the exact dog/senior/small-breed/AdvantEDGE Senior Support+/shredded-blend/Chicken & Rice dry formula, 51 exact ingredients, official 3.5 lb GTIN, matching front image, and AAFCO feeding-test complete-food statement. Chewy listing 3583783 maps to the same canonical formula.',
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
    resolution_reason='Exact current Purina Pro Plan AdvantEDGE Small Breed Senior Support+ Chicken & Rice formula promoted from official manufacturer evidence.',
    acquisition_notes='Official Purina page verifies 51 exact ingredients, dog/senior/small-breed/AdvantEDGE Senior Support+/shredded-blend/dry/Chicken & Rice identity, GTIN 038100106711, 3.5 lb package, matching front image, and AAFCO feeding-test complete-food evidence. Chewy 3583783 maps to the same canonical formula.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:4c1b50798a320d95e9f9a59335627e60';

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Purina Pro Plan AdvantEDGE Senior Support Plus Small Breed Shredded Blend Chicken & Rice Formula Senior Dry Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_barcode
  FROM public.resolve_verified_product_by_gtin('038100106711',8)
  ORDER BY rank DESC LIMIT 1;

  IF v_top IS DISTINCT FROM v_cache OR v_barcode IS DISTINCT FROM v_cache THEN
    RAISE EXCEPTION 'Small Breed Senior Support search/barcode regression: search %, barcode %',
      v_top,v_barcode;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_formula AND active AND verification_status='verified'
      AND promoted_cache_key=v_cache AND cardinality(ingredients)=51
      AND pet_type='dog' AND life_stage='senior' AND food_form='dry'
      AND product_line='pro plan advantedge small breed adult 7 senior support shredded blend'
  ) THEN
    RAISE EXCEPTION 'Small Breed Senior Support canonical formula not promoted';
  END IF;
END
$$;
