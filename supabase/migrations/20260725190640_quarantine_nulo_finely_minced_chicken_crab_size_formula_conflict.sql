
DO $$
DECLARE
  v_formula BIGINT;
  v_discovery BIGINT;
  v_run BIGINT;
  v_old_key TEXT;
  v_key TEXT := 'nulo|nulo|finely minced 2.8 oz formula|cat|all life stages|wet|chicken and crab recipe|';
  v_cache TEXT := 'nulo:nulo nulo cat kitten finely minced chicken crab recipe';
  v_source_28 TEXT := 'https://nulo.com/products/finely-minced-chicken-crab-recipe-for-cats';
  v_source_6 TEXT := 'https://nulo.com/products/finely-minced-chicken-crab-recipe-for-cats-6-oz';
  v_front_28 TEXT := 'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/awgibip4cbrkxbvrdkdg.png?v=1776774908';
  v_back_28 TEXT := 'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/gqlvgut7yrnjhctyumyv.png?v=1776774908';
  v_front_6 TEXT := 'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/sw6e86glschhe1emof00.png?v=1776774891';
  v_back_6 TEXT := 'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/hrl3tqq03tzijpth9lty.png?v=1776774891';
  v_pdf TEXT := 'https://images.salsify.com/image/upload/s--C_Hvd3vS--/i6c6dvt5unjw63001f2m.pdf';
  v_six_text TEXT := 'Chicken, Chicken Broth, Tuna, Coconut Oil, Dried Egg, Tricalcium Phosphate, Potassium Chloride, Guar Gum, Xanthan Gum, Salmon Oil, Flaxseed, Dried Kelp, Inulin, Taurine, Choline Chloride, Salt, Magnesium Sulfate, Parsley, Iron Amino Acid Chelate, Zinc Amino Acid Chelate, Vitamin E Supplement, L-Ascorbyl-2-Polyphosphate (source of Vitamin C), Thiamine Mononitrate (source of Vitamin B1), Vitamin A Supplement, Nicotinic Acid (Vitamin B3), Manganese Amino Acid Chelate, Calcium Iodate, Copper Amino Acid Chelate, Calcium d-Pantothenate (source of Vitamin B5), Riboflavin Supplement (Vitamin B2), Sodium Selenite, Vitamin B12 Supplement, Pyridoxine Hydrochloride (source of Vitamin B6), Folic Acid, Cholecalciferol (source of Vitamin D3), Biotin, Menadione Sodium Bisulfite Complex (source off Vitamin K activity).';
BEGIN
  SELECT id,formula_key INTO STRICT v_formula,v_old_key
  FROM public.catalog_formulas
  WHERE formula_key='nulo|nulo|and finely minced|cat|kitten|unknown|and finely minced chicken and crab recipe|';

  SELECT id INTO STRICT v_discovery
  FROM public.catalog_formulas
  WHERE formula_key='nulo|nulo|nulo chicken and crab finely minced canned wet cat food|cat|unknown|wet||';

  IF EXISTS (SELECT 1 FROM public.catalog_formulas WHERE formula_key=v_key AND id<>v_formula) THEN
    RAISE EXCEPTION 'Nulo Finely Minced 2.8 oz exact key belongs to sibling';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
      AND cardinality(ingredients)=37
      AND ingredients[3]='Crab'
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Nulo Finely Minced Chicken Crab 2.8 oz manufacturer row missing';
  END IF;

  IF v_six_text NOT ILIKE 'Chicken, Chicken Broth, Tuna,%'
     OR v_six_text ILIKE 'Chicken, Chicken Broth, Crab,%'
  THEN
    RAISE EXCEPTION 'Nulo Finely Minced 6 oz conflict evidence not encoded exactly';
  END IF;

  UPDATE public.product_data SET
    product_name='Nulo Finely Minced Chicken & Crab Recipe Wet Cat Food — 2.8 oz Formula',
    brand='Nulo',product_line='Finely Minced 2.8 oz Formula',
    pet_type='cat',life_stage='all life stages',food_form='wet',
    flavor='Chicken & Crab Recipe',package_size='2.8 oz cup',
    source='nulo',source_quality='manufacturer',source_url=v_source_28,
    image_url=v_front_28,is_complete_food=true,
    catalog_exclusion_reason='formula_version_conflict_quarantined',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    verified_at=now(),scraped_at=now(),expires_at=now()+interval '365 days',
    updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.catalog_formulas SET
    formula_key=v_key,
    product_name='Nulo Finely Minced Chicken & Crab Recipe Wet Cat Food — 2.8 oz Formula',
    product_line='finely minced 2.8 oz formula',pet_type='cat',
    life_stage='all life stages',food_form='wet',
    flavor='chicken and crab recipe',diet_condition='',
    is_complete_food=true,
    complete_food_evidence='Official Nulo 2.8 oz page says all life stages, but linked 6 oz variant publishes a materially different Tuna ingredient formula under the same Chicken & Crab title. Quarantined until manufacturer clarifies the 6 oz identity/formula.',
    front_image_url=v_front_28,source_url=v_source_28,source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY['nulo','finely minced','chicken','crab','2.8 oz','cat','kitten','wet','all life stages']::TEXT[],
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    identity_hash=encode(digest(v_key,'sha256'),'hex'),
    last_observed_at=now(),updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),
    promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Chewy discovery title has no exact package size and cannot choose between conflicting official 2.8 oz and 6 oz ingredient formulas.',
    updated_at=now()
  WHERE id=v_discovery;

  UPDATE public.catalog_skus SET active=false,updated_at=now()
  WHERE formula_id IN (v_formula,v_discovery);

  INSERT INTO public.catalog_skus(
    formula_id,gtin,package_size,package_count,source_slug,source_external_id,
    source_url,active,first_observed_at,last_observed_at,updated_at
  ) VALUES(
    v_formula,NULL,'2.8 oz cup',1,'nulo-manufacturer-manual','63NA02:2.8oz',
    v_source_28,false,now(),now(),now()
  )
  ON CONFLICT(source_slug,source_external_id,gtin,package_size) DO UPDATE SET
    formula_id=excluded.formula_id,source_url=excluded.source_url,active=false,
    last_observed_at=now(),updated_at=now();

  INSERT INTO public.catalog_source_runs(
    run_key,source_slug,source_type,coverage_role,status,started_at,finished_at,
    expected_count,observed_count,accepted_count,rejected_count,pagination_complete,
    source_content_hash,checkpoint,error_summary,metadata,updated_at
  ) VALUES(
    'manual-exact-evidence:nulo:finely-minced-chicken-crab-size-conflict:20260725',
    'nulo-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),2,2,0,2,true,
    encode(digest(v_source_28||'|63NA02|'||v_source_6||'|63NA06|'||v_six_text,'sha256'),'hex'),
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,'search_results_are_discovery_only',true,
      'official_2_8oz_sku','63NA02','official_6oz_sku','63NA06',
      'official_2_8oz_front_image',v_front_28,'official_2_8oz_back_image',v_back_28,
      'official_6oz_front_image',v_front_6,'official_6oz_back_image',v_back_6,
      'shared_official_ingredient_pdf',v_pdf,
      'formula_conflict','2.8 oz page lists Crab; 6 oz page lists Tuna under the same Chicken & Crab title',
      'do_not_merge_sizes',true,'published_gtin',NULL,'gtin_not_inferred',true
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),expected_count=2,observed_count=2,
    accepted_count=0,rejected_count=2,pagination_complete=true,
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
  SELECT v_run,v_formula,'nulo-manufacturer-manual','63NA02',v_source_28,'manufacturer',
    NULL,manufacturer,brand,product_name,product_line,pet_type,life_stage,
    food_form,flavor,diet_condition,'2.8 oz cup',ingredient_text,v_front_28,true,true,
    now(),encode(digest(v_key||'|'||ingredient_text||'|'||v_front_28,'sha256'),'hex'),
    'rejected',ARRAY['formula_version_conflict_across_size_variants']::TEXT[],
    jsonb_build_object(
      'official_sku','63NA02','official_front_image',v_front_28,
      'official_back_image',v_back_28,'official_ingredient_pdf',v_pdf,
      'official_package_size','2.8 oz cup',
      'official_aafco_statement','All life stages.',
      'conflicting_official_variant_url',v_source_6,
      'do_not_promote_until_conflict_resolved',true,
      'published_gtin',NULL,'gtin_not_inferred',true
    )
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(run_id,source_slug,source_external_id,content_hash) DO UPDATE SET
    formula_id=excluded.formula_id,validation_status='rejected',
    validation_reasons=excluded.validation_reasons,raw_payload=excluded.raw_payload,
    observed_at=now();

  INSERT INTO public.catalog_observations(
    run_id,formula_id,source_slug,source_external_id,source_url,source_authority,
    gtin,manufacturer,brand,product_name,product_line,pet_type,life_stage,
    food_form,flavor,diet_condition,package_size,ingredient_text,front_image_url,
    is_complete_food,available_in_us,observed_at,content_hash,validation_status,
    validation_reasons,raw_payload
  ) VALUES(
    v_run,v_formula,'nulo-manufacturer-manual','63NA06',v_source_6,'manufacturer',
    NULL,'nulo','nulo','Nulo Finely Minced Chicken & Crab Recipe Wet Cat Food — 6 oz Variant',
    'finely minced 6 oz variant','cat','all life stages','wet',
    'chicken and crab title; tuna ingredient formula','','6 oz can',v_six_text,v_front_6,
    true,true,now(),encode(digest(v_source_6||'|'||v_six_text||'|'||v_front_6,'sha256'),'hex'),
    'rejected',ARRAY['title_ingredient_recipe_conflict','formula_version_conflict_across_size_variants']::TEXT[],
    jsonb_build_object(
      'official_sku','63NA06','official_front_image',v_front_6,
      'official_back_image',v_back_6,'shared_official_ingredient_pdf',v_pdf,
      'official_package_size','6 oz can',
      'title_recipe','Chicken & Crab Recipe','ingredient_third_entry','Tuna',
      'do_not_merge_with_2_8oz_formula',true,
      'published_gtin',NULL,'gtin_not_inferred',true
    )
  )
  ON CONFLICT(run_id,source_slug,source_external_id,content_hash) DO UPDATE SET
    formula_id=excluded.formula_id,validation_status='rejected',
    validation_reasons=excluded.validation_reasons,raw_payload=excluded.raw_payload,
    observed_at=now();

  INSERT INTO public.catalog_field_evidence(
    formula_id,observation_id,field_name,field_value,source_url,
    source_authority,accepted,observed_at,content_hash
  )
  SELECT v_formula,NULL,field_name,to_jsonb(field_value),source_url,'manufacturer',
    accepted,now(),encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||source_url,'sha256'),'hex')
  FROM (
    VALUES
      ('ingredient_text_2_8oz',(SELECT ingredient_text FROM public.catalog_formulas WHERE id=v_formula),v_source_28,true),
      ('front_image_url_2_8oz',v_front_28,v_source_28,true),
      ('back_image_url_2_8oz',v_back_28,v_source_28,true),
      ('official_sku_2_8oz','63NA02',v_source_28,true),
      ('ingredient_text_6oz',v_six_text,v_source_6,false),
      ('front_image_url_6oz',v_front_6,v_source_6,false),
      ('back_image_url_6oz',v_back_6,v_source_6,false),
      ('official_sku_6oz','63NA06',v_source_6,false),
      ('formula_conflict','2.8 oz lists Crab while 6 oz lists Tuna under the same Chicken & Crab title',v_source_6,false)
  ) evidence(field_name,field_value,source_url,accepted)
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
    'manual-search:nulo:finely-minced-chicken-crab-size-conflict:20260725',
    formula_key,formula_key,'Nulo',product_name,
    'Nulo Finely Minced Chicken Crab cats ingredients 2.8 oz 6 oz official',
    jsonb_build_array(v_source_28,v_source_6,v_front_28,v_back_28,v_front_6,v_back_6,v_pdf),
    v_source_28,'manufacturer_page',
    jsonb_build_object(
      'brand','Nulo','line','Finely Minced','pet_type','cat',
      'life_stage','all life stages','food_form','wet',
      'flavor','Chicken & Crab Recipe','package_sizes',jsonb_build_array('2.8 oz','6 oz')
    ),
    jsonb_build_object(
      'official_2_8oz_sku','63NA02','official_6oz_sku','63NA06',
      '2_8oz_third_ingredient','Crab','6oz_third_ingredient','Tuna',
      'formula_conflict',true,'do_not_merge_sizes',true
    ),
    'quarantined','Official Nulo size variants publish materially different Crab versus Tuna ingredient formulas under the same Chicken & Crab title.',
    encode(digest(v_source_28||'|'||v_source_6||'|'||v_six_text,'sha256'),'hex'),
    encode(digest(ingredient_text,'sha256'),'hex'),
    encode(digest(v_front_28,'sha256'),'hex'),now(),id,NULL,1,
    'The 2.8 oz page has exact Chicken & Crab evidence, but the linked 6 oz official page lists Tuna as the third ingredient and shares a Chicken & Crab title/PDF. Neither size is searchable or scorable until Nulo supplies package-version clarification. No GTIN was inferred.',
    v_source_28,'source_text_exact',encode(digest(ingredient_text,'sha256'),'hex'),
    '[]'::JSONB,now()
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(review_key) DO UPDATE SET
    target_formula_key=excluded.target_formula_key,corrected_formula_key=excluded.corrected_formula_key,
    product_name=excluded.product_name,authoritative_source_url=excluded.authoritative_source_url,
    expected_identity=excluded.expected_identity,resolved_identity=excluded.resolved_identity,
    evidence_status='quarantined',quarantine_reason=excluded.quarantine_reason,
    authoritative_content_hash=excluded.authoritative_content_hash,
    ingredient_text_hash=excluded.ingredient_text_hash,
    front_image_url_hash=excluded.front_image_url_hash,observed_at=excluded.observed_at,
    formula_id=excluded.formula_id,promoted_cache_key=NULL,
    attempt_count=public.catalog_manual_evidence_reviews.attempt_count+1,
    review_notes=excluded.review_notes,ingredient_evidence_url=excluded.ingredient_evidence_url,
    ingredient_evidence_mode='source_text_exact',
    ingredient_original_text_hash=excluded.ingredient_original_text_hash,
    ingredient_corrections='[]'::JSONB,updated_at=now();

  UPDATE public.catalog_acquisition_queue SET
    status='open',resolved_at=NULL,resolution_reason=NULL,
    acquisition_notes='Official Nulo 2.8 oz page lists Crab while the linked 6 oz variant lists Tuna under the same Chicken & Crab title. Retailer listing has no exact size/formula evidence; do not resolve or promote until manufacturer clarification.',
    needs_product_record=true,needs_verified_ingredients=true,
    needs_verified_image=false,needs_pet_type=false,ready_rows=0,
    sample_metadata=COALESCE(sample_metadata,'{}'::JSONB)||jsonb_build_object(
      'formula_version_conflict',true,'official_2_8oz_sku','63NA02',
      'official_6oz_sku','63NA06','do_not_merge_sizes',true,
      'required_evidence','manufacturer clarification or exact current back-label evidence for each size'
    ),
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:5ad1fc2c81af449929b7e54ad41d9e9b';

  INSERT INTO public.catalog_acquisition_queue(
    gap_key,gap_type,status,priority_score,brand,product_name,cache_key,
    normalized_query,pet_type,product_source,source_quality,source_url,
    needs_product_record,needs_verified_ingredients,needs_verified_image,
    needs_pet_type,ready_rows,affected_product_count,demand_events,
    sample_metadata,acquisition_notes,last_refreshed_at,last_event_at,updated_at
  ) VALUES(
    'lookup:nulo:finely-minced-chicken-crab:6oz-formula-conflict',
    'lookup','open',8,'Nulo',
    'Nulo Finely Minced Chicken & Crab Recipe — 6 oz formula conflict',
    NULL,'nulo finely minced chicken crab 6 oz cat wet','cat',
    'nulo-manufacturer-manual','manufacturer',v_source_6,
    true,true,false,false,0,1,0,
    jsonb_build_object(
      'formula_version_conflict',true,'official_2_8oz_sku','63NA02',
      'official_6oz_sku','63NA06','2_8oz_third_ingredient','Crab',
      '6oz_third_ingredient','Tuna','do_not_merge_sizes',true,
      'required_evidence','manufacturer clarification or exact current 6 oz package ingredient evidence'
    ),
    'Official 6 oz page conflicts with the 2.8 oz formula and its own Chicken & Crab title. Preserve as an unresolved package/formula gap; never inherit 2.8 oz ingredients.',
    now(),now(),now()
  )
  ON CONFLICT(gap_key) DO UPDATE SET
    gap_type='lookup',status='open',priority_score=excluded.priority_score,
    brand=excluded.brand,product_name=excluded.product_name,cache_key=NULL,
    normalized_query=excluded.normalized_query,pet_type=excluded.pet_type,
    product_source=excluded.product_source,source_quality=excluded.source_quality,
    source_url=excluded.source_url,needs_product_record=true,
    needs_verified_ingredients=true,needs_verified_image=false,
    needs_pet_type=false,ready_rows=0,affected_product_count=1,
    sample_metadata=excluded.sample_metadata,
    acquisition_notes=excluded.acquisition_notes,resolved_at=NULL,
    resolution_reason=NULL,last_refreshed_at=now(),updated_at=now();

  IF EXISTS(
    SELECT 1 FROM public.search_verified_products(
      'Nulo Finely Minced Chicken Crab Wet Cat Food',8
    )
  ) OR EXISTS(
    SELECT 1 FROM public.search_verified_products(
      'Nulo Finely Minced Chicken Crab 2.8 oz Wet Cat Food',8
    )
  ) OR EXISTS(
    SELECT 1 FROM public.search_verified_products(
      'Nulo Finely Minced Chicken Crab 6 oz Wet Cat Food',8
    )
  ) THEN RAISE EXCEPTION 'Nulo Finely Minced size-conflict lookup must safely abstain'; END IF;

  IF EXISTS(
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (v_formula,v_discovery)
      AND (active OR verification_status<>'quarantined' OR promoted_cache_key IS NOT NULL)
  ) THEN RAISE EXCEPTION 'Nulo Finely Minced size-conflict formulas remain reachable'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache
      AND catalog_exclusion_reason='formula_version_conflict_quarantined'
  ) THEN RAISE EXCEPTION 'Nulo Finely Minced size-conflict serving row remains reachable'; END IF;

  IF (SELECT count(*) FROM public.catalog_acquisition_queue
      WHERE gap_key IN (
        'census:5ad1fc2c81af449929b7e54ad41d9e9b',
        'lookup:nulo:finely-minced-chicken-crab:6oz-formula-conflict'
      ) AND status='open' AND sample_metadata->>'formula_version_conflict'='true') <> 2
  THEN RAISE EXCEPTION 'Nulo Finely Minced durable size-conflict gaps missing'; END IF;
END
$$;

