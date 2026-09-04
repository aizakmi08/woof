
DO $$
DECLARE
  v_formula BIGINT;
  v_duplicate BIGINT;
  v_discovery BIGINT;
  v_run BIGINT;
  v_old_key TEXT;
  v_key TEXT := 'nulo|nulo|challenger northern catch small breed|dog|all life stages|dry|haddock salmon and acadian redfish recipe|';
  v_cache TEXT := 'nulo:nulo challenger high-protein kibble for small breed northern catch haddock salmon redfish';
  v_duplicate_cache TEXT := 'census:506b45d6629793c4f3794d1d5538dee8';
  v_source TEXT := 'https://nulo.com/products/challenger-small-breed-organic-ancient-grains-haddock-salmon-acadian-redfish-recipe-for-dogs';
  v_front TEXT := 'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/pqswlyb5kcyn3luwlzgj.png?v=1776774880';
  v_back TEXT := 'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/usz1pvs1jnwrcwkhfgnr.png?v=1776774880';
  v_pdf TEXT := 'https://images.salsify.com/image/upload/s--mJWmh1Tx--/cuapetxu90r1kkr4l2wa.pdf';
  v_top TEXT;
BEGIN
  SELECT id,formula_key INTO STRICT v_formula,v_old_key
  FROM public.catalog_formulas
  WHERE formula_key='nulo|nulo|challenger high protein kibble for small breed northern catch haddock|dog|unknown|dry|salmon and redfish|';
  SELECT id INTO STRICT v_duplicate
  FROM public.catalog_formulas
  WHERE formula_key='nulo|nulo|challenger small breed organic ancient grains haddock|dog|unknown|dry|salmon and acadian redfish recipe|';
  SELECT id INTO STRICT v_discovery
  FROM public.catalog_formulas
  WHERE formula_key='nulo|nulo|nulo challenger puppy and adult small breed northern catch haddock salmon and acadian redfish dry dog food|dog|puppy|dry||';

  IF EXISTS (SELECT 1 FROM public.catalog_formulas WHERE formula_key=v_key AND id<>v_formula) THEN
    RAISE EXCEPTION 'Nulo Challenger Northern Catch exact key belongs to sibling';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_cache AND source_quality='manufacturer'
      AND ingredient_verification_status='manufacturer'
      AND image_verification_status='manufacturer'
      AND cardinality(ingredients)=47
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Nulo Challenger Northern Catch manufacturer serving row missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data canonical
    JOIN public.product_data duplicate ON duplicate.cache_key=v_duplicate_cache
    WHERE canonical.cache_key=v_cache
      AND canonical.ingredients=duplicate.ingredients
      AND canonical.ingredient_text=duplicate.ingredient_text
  ) THEN
    RAISE EXCEPTION 'Nulo Challenger duplicate rows do not carry identical exact ingredients';
  END IF;

  UPDATE public.product_data SET
    product_name='Nulo Challenger Northern Catch Small Breed Haddock, Salmon & Acadian Redfish Recipe Dry Dog Food',
    brand='Nulo', product_line='Challenger Northern Catch Small Breed',
    pet_type='dog', life_stage='all life stages', food_form='dry',
    flavor='Haddock, Salmon & Acadian Redfish Recipe', package_size='4.5 lb / 11 lb bags',
    source='nulo', source_quality='manufacturer', source_url=v_source,
    image_url=v_front, is_complete_food=true, catalog_exclusion_reason=NULL,
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    verified_at=now(), scraped_at=now(), expires_at=now()+interval '365 days',
    updated_at=now()
  WHERE cache_key=v_cache;

  UPDATE public.product_data SET
    catalog_exclusion_reason='duplicate_alias_of_verified_formula',
    updated_at=now()
  WHERE cache_key=v_duplicate_cache;

  UPDATE public.catalog_formulas SET
    formula_key=v_key,
    product_name='Nulo Challenger Northern Catch Small Breed Haddock, Salmon & Acadian Redfish Recipe Dry Dog Food',
    product_line='challenger northern catch small breed', pet_type='dog',
    life_stage='all life stages', food_form='dry',
    flavor='haddock salmon and acadian redfish recipe', diet_condition='',
    is_complete_food=true,
    complete_food_evidence='Official Nulo: formulated to meet AAFCO Dog Food Nutrient Profiles for all life stages, except growth of large size dogs (70 lb. or more as an adult).',
    front_image_url=v_front, source_url=v_source, source_authority='manufacturer',
    ingredient_verification_status='manufacturer',
    image_verification_status='manufacturer',
    protected_terms=ARRAY['nulo','challenger','northern catch','small breed','haddock','salmon','acadian redfish','dog','dry','all life stages']::TEXT[],
    verification_status='verified', active=true, absent_since=NULL,
    promoted_cache_key=v_cache, promoted_at=now(),
    identity_hash=encode(digest(v_key,'sha256'),'hex'),
    last_observed_at=now(), updated_at=now()
  WHERE id=v_formula;

  UPDATE public.catalog_observations SET formula_id=v_formula
  WHERE formula_id IN (v_duplicate,v_discovery)
     OR (source_slug='chewy-public-sitemap' AND source_external_id IN ('1375606','1375614'));
  UPDATE public.catalog_skus SET formula_id=v_formula,updated_at=now()
  WHERE formula_id IN (v_duplicate,v_discovery)
     OR (source_slug='chewy-public-sitemap' AND source_external_id IN ('1375606','1375614'));

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT alias_key,v_formula,formula.identity_hash,'manual_review',v_source,
    jsonb_build_object(
      'exact_formula_identity',true,'official_sku','91SH04',
      'current_formula_key',v_key,'reconciled_at',now()
    ),now()
  FROM unnest(ARRAY[
    v_old_key,
    'nulo|nulo|challenger small breed organic ancient grains haddock|dog|unknown|dry|salmon and acadian redfish recipe|',
    'nulo|nulo|nulo challenger puppy and adult small breed northern catch haddock salmon and acadian redfish dry dog food|dog|puppy|dry||'
  ]::TEXT[]) alias_key
  JOIN public.catalog_formulas formula ON formula.id=v_formula
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,
    promoted_at=NULL,
    complete_food_evidence='Superseded duplicate current Nulo manufacturer identity; exact formula retained under canonical Challenger Northern Catch Small Breed identity.',
    updated_at=now()
  WHERE id=v_duplicate;

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,
    promoted_at=NULL,
    complete_food_evidence='Superseded exact Chewy discovery identity linked to the current official Nulo Challenger Northern Catch Small Breed formula.',
    updated_at=now()
  WHERE id=v_discovery;

  UPDATE public.catalog_skus SET active=false,updated_at=now()
  WHERE formula_id=v_formula AND source_slug IN ('nulo','nulo-manufacturer-manual')
    AND package_size='' AND gtin IS NULL;

  INSERT INTO public.catalog_skus(
    formula_id,gtin,package_size,package_count,source_slug,
    source_external_id,source_url,active,first_observed_at,last_observed_at,updated_at
  ) VALUES
    (v_formula,NULL,'4.5 lb bag',1,'nulo-manufacturer-manual','91SH04:4.5lb',v_source,true,now(),now(),now()),
    (v_formula,NULL,'11 lb bag',1,'nulo-manufacturer-manual','91SH04:11lb',v_source,true,now(),now(),now())
  ON CONFLICT(source_slug,source_external_id,gtin,package_size) DO UPDATE SET
    formula_id=excluded.formula_id,source_url=excluded.source_url,active=true,
    last_observed_at=now(),updated_at=now();

  INSERT INTO public.catalog_verified_product_search_aliases(
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance
  ) VALUES(
    v_cache,
    'Nulo Challenger Northern Catch Haddock Salmon Acadian Redfish Small Breed Dry Dog Food',
    public.normalize_verified_product_search_query('Nulo Challenger Northern Catch Haddock Salmon Acadian Redfish Small Breed Dry Dog Food'),
    v_source,'manufacturer',now(),
    jsonb_build_object(
      'source','current_official_product_page','official_sku','91SH04',
      'food_form_boundary','dry','species_boundary','dog',
      'life_stage_boundary','all life stages','breed_size_boundary','small breed',
      'recipe_boundary','haddock salmon acadian redfish'
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
    'manual-exact-evidence:nulo:challenger-alpine-ranch-small-breed:20260725',
    'nulo-manufacturer-manual','manufacturer','verification','completed',
    now(),now(),1,1,1,0,true,
    encode(digest(v_source||'|91SH04|'||v_front||'|'||v_pdf,'sha256'),'hex'),
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'manual_exact_evidence',true,'search_results_are_discovery_only',true,
      'official_sku','91SH04','official_package_sizes',jsonb_build_array('4.5 lb','11 lb'),
      'official_back_image',v_back,'official_ingredient_pdf',v_pdf,
      'published_gtin',NULL,'gtin_not_inferred',true,
      'duplicate_serving_cache_key_quarantined',v_duplicate_cache
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
  SELECT v_run,v_formula,'nulo-manufacturer-manual','91SH04',v_source,'manufacturer',
    NULL,manufacturer,brand,product_name,product_line,pet_type,life_stage,
    food_form,flavor,diet_condition,'4.5 lb / 11 lb bags',ingredient_text,v_front,true,true,
    now(),encode(digest(formula_key||'|'||ingredient_text||'|'||v_front,'sha256'),'hex'),
    'accepted',ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_sku','91SH04','official_front_image',v_front,
      'official_back_image',v_back,'official_ingredient_pdf',v_pdf,
      'official_package_sizes',jsonb_build_array('4.5 lb','11 lb'),
      'official_aafco_statement','All life stages, except growth of large size dogs.',
      'published_gtin',NULL,'gtin_not_inferred',true
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
    true,now(),encode(digest(v_formula::TEXT||'|'||field_name||'|'||field_value||'|'||v_source,'sha256'),'hex')
  FROM (
    VALUES
      ('ingredient_text',(SELECT ingredient_text FROM public.catalog_formulas WHERE id=v_formula)),
      ('front_image_url',v_front),('back_image_url',v_back),
      ('ingredient_pdf_url',v_pdf),('official_sku','91SH04'),
      ('package_sizes','4.5 lb; 11 lb'),
      ('complete_food_evidence','All life stages, except growth of large size dogs.'),
      ('food_form','dry'),('life_stage','all life stages'),('breed_size','small breed')
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
    'manual-search:nulo:challenger-alpine-ranch-small-breed:20260725',
    formula_key,formula_key,'Nulo',product_name,
    'Nulo Challenger Northern Catch Haddock Salmon Acadian Redfish Small Breed ingredients',
    jsonb_build_array(v_source,v_front,v_back,v_pdf),v_source,
    'manufacturer_page',
    jsonb_build_object(
      'brand','Nulo','line','Challenger Northern Catch',
      'pet_type','dog','life_stage','all life stages','breed_size','small breed',
      'food_form','dry','flavor','Haddock, Salmon & Acadian Redfish Recipe'
    ),
    jsonb_build_object(
      'manufacturer',manufacturer,'brand',brand,'product_line',product_line,
      'pet_type',pet_type,'life_stage',life_stage,'food_form',food_form,
      'flavor',flavor,'official_sku','91SH04',
      'package_sizes',jsonb_build_array('4.5 lb','11 lb')
    ),
    'promoted',NULL,
    encode(digest(v_source||'|'||v_front||'|'||v_back||'|'||v_pdf,'sha256'),'hex'),
    encode(digest(ingredient_text,'sha256'),'hex'),
    encode(digest(v_front,'sha256'),'hex'),now(),id,promoted_cache_key,1,
    'Official current Nulo page and package assets verify exact Challenger Northern Catch small-breed Haddock, Salmon & Acadian Redfish identity, 47 ingredients, 4.5 lb and 11 lb sizes, adequacy excluding large-breed growth, dry form, and matching front/back images. Two verified duplicate manufacturer identities and one retailer-discovery identity were reconciled. No GTIN was published, so none was inferred.',
    v_source,'source_text_exact',encode(digest(ingredient_text,'sha256'),'hex'),
    '[]'::JSONB,now()
  FROM public.catalog_formulas WHERE id=v_formula
  ON CONFLICT(review_key) DO UPDATE SET
    target_formula_key=excluded.target_formula_key,
    corrected_formula_key=excluded.corrected_formula_key,
    product_name=excluded.product_name,
    authoritative_source_url=excluded.authoritative_source_url,
    expected_identity=excluded.expected_identity,
    resolved_identity=excluded.resolved_identity,evidence_status='promoted',
    quarantine_reason=NULL,authoritative_content_hash=excluded.authoritative_content_hash,
    ingredient_text_hash=excluded.ingredient_text_hash,
    front_image_url_hash=excluded.front_image_url_hash,observed_at=excluded.observed_at,
    formula_id=excluded.formula_id,promoted_cache_key=excluded.promoted_cache_key,
    attempt_count=public.catalog_manual_evidence_reviews.attempt_count+1,
    review_notes=excluded.review_notes,
    ingredient_evidence_url=excluded.ingredient_evidence_url,
    ingredient_evidence_mode='source_text_exact',
    ingredient_original_text_hash=excluded.ingredient_original_text_hash,
    ingredient_corrections='[]'::JSONB,updated_at=now();

  UPDATE public.catalog_acquisition_queue SET
    status='resolved',resolved_at=now(),
    resolution_reason='Exact current Nulo Challenger Northern Catch Small Breed Haddock, Salmon & Acadian Redfish formula promoted from official manufacturer evidence.',
    acquisition_notes='Official SKU 91SH04 verifies 47 exact ingredients, 4.5 lb and 11 lb sizes, all-life-stages small-breed boundary, dry form, matching front/back images, and AAFCO adequacy. No GTIN was inferred.',
    needs_product_record=false,needs_verified_ingredients=false,
    needs_verified_image=false,needs_pet_type=false,ready_rows=1,
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:7ab2c3230baca75c7c09b63ef589a2e2';

  SELECT cache_key INTO v_top FROM public.search_verified_products(
    'Nulo Challenger Northern Catch Haddock Salmon Acadian Redfish Small Breed Dry Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  IF v_top IS DISTINCT FROM v_cache THEN
    RAISE EXCEPTION 'Nulo Challenger Northern Catch exact search regression: %',v_top;
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (v_duplicate,v_discovery) AND (active OR verification_status<>'quarantined')
  ) THEN RAISE EXCEPTION 'Nulo Challenger duplicate formulas remain active'; END IF;

  IF (SELECT count(*) FROM public.catalog_formulas
      WHERE source_url=v_source AND active AND verification_status='verified') <> 1
  THEN RAISE EXCEPTION 'Nulo Challenger canonical active formula is not unique'; END IF;

  IF (SELECT count(*) FROM public.catalog_skus
      WHERE formula_id=v_formula AND active AND package_size IN ('4.5 lb bag','11 lb bag')) <> 2
  THEN RAISE EXCEPTION 'Nulo Challenger official package sizes missing'; END IF;

  IF EXISTS(SELECT 1 FROM public.catalog_skus WHERE formula_id=v_formula AND active AND gtin IS NOT NULL)
  THEN RAISE EXCEPTION 'Nulo Challenger GTIN was inferred without official evidence'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.product_data
    WHERE cache_key=v_duplicate_cache
      AND catalog_exclusion_reason='duplicate_alias_of_verified_formula'
  ) THEN RAISE EXCEPTION 'Nulo Challenger duplicate serving row not excluded'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.catalog_acquisition_queue
    WHERE gap_key='census:7ab2c3230baca75c7c09b63ef589a2e2' AND status='resolved'
  ) THEN RAISE EXCEPTION 'Nulo Challenger queue gap did not close'; END IF;
END
$$;

