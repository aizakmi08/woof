DO $$
DECLARE
  v_liveclear_adult BIGINT;
  v_liveclear_kitten BIGINT;
  v_liveclear_duplicate BIGINT;
  v_sensitive_puppy BIGINT;
  v_sensitive_senior BIGINT;
  v_sensitive_duplicate BIGINT;
BEGIN
  SELECT id INTO STRICT v_liveclear_adult FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|pro plan liveclear adult|cat|adult|dry|chicken and rice formula|';
  SELECT id INTO STRICT v_liveclear_kitten FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|pro plan liveclear|cat|kitten|dry|chicken and rice formula|';
  SELECT id INTO STRICT v_liveclear_duplicate FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan liveclear kitten chicken and rice formula dry cat food|cat|kitten|dry||';
  SELECT id INTO STRICT v_sensitive_puppy FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|pro plan sensitive skin and stomach|dog|puppy|dry|pro plan sensitive skin and stomach salmon and rice formula|';
  SELECT id INTO STRICT v_sensitive_senior FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|pro plan adult 7 sensitive skin and stomach|dog|senior|dry|salmon and rice|';
  SELECT id INTO STRICT v_sensitive_duplicate FROM public.catalog_formulas
  WHERE formula_key='purina pro plan|purina pro plan|purina pro plan sensitive skin and stomach 7 salmon and rice formula dry dog food|dog|unknown|dry||';

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='chewy-public-sitemap' AND source_external_id='354879'
      AND formula_id=v_liveclear_adult AND life_stage='kitten'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_liveclear_kitten AND active AND verification_status='verified'
      AND source_authority='manufacturer' AND pet_type='cat'
      AND life_stage='kitten' AND food_form='dry'
  ) THEN
    RAISE EXCEPTION 'LiveClear kitten cross-life-stage preconditions failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='chewy-public-sitemap' AND source_external_id='379218'
      AND formula_id=v_sensitive_puppy AND product_name ILIKE '%7+%'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id=v_sensitive_senior AND active AND verification_status='verified'
      AND source_authority='manufacturer' AND pet_type='dog'
      AND life_stage='senior' AND food_form='dry'
  ) THEN
    RAISE EXCEPTION 'Sensitive Skin Adult 7+ cross-life-stage preconditions failed';
  END IF;

  UPDATE public.catalog_observations SET
    formula_id=v_liveclear_kitten,life_stage='kitten',
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','corrected_cross_life_stage_mapping',
        'from_formula_id',v_liveclear_adult,'to_formula_id',v_liveclear_kitten,
        'hard_boundary','kitten'
      )
    )
  WHERE source_slug='chewy-public-sitemap' AND source_external_id='354879';

  UPDATE public.catalog_skus SET formula_id=v_liveclear_kitten,updated_at=now()
  WHERE source_slug='chewy-public-sitemap' AND source_external_id='354879';

  UPDATE public.catalog_observations SET
    formula_id=v_sensitive_senior,life_stage='senior',
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
      'identity_reconciliation',jsonb_build_object(
        'status','corrected_cross_life_stage_mapping',
        'from_formula_id',v_sensitive_puppy,'to_formula_id',v_sensitive_senior,
        'hard_boundary','adult 7+ senior'
      )
    )
  WHERE source_slug='chewy-public-sitemap' AND source_external_id='379218';

  UPDATE public.catalog_skus SET formula_id=v_sensitive_senior,updated_at=now()
  WHERE source_slug='chewy-public-sitemap' AND source_external_id='379218';

  INSERT INTO public.catalog_formula_aliases(
    alias_formula_key,formula_id,identity_hash,match_reason,source_url,metadata,updated_at
  )
  SELECT alias_key,canonical_id,f.identity_hash,'manual_review',official_url,
    jsonb_build_object(
      'exact_formula_identity',true,'hard_life_stage_boundary',boundary,
      'reconciled_at',now()
    ),now()
  FROM (
    VALUES
      (
        'purina pro plan|purina pro plan|purina pro plan liveclear kitten chicken and rice formula dry cat food|cat|kitten|dry||',
        v_liveclear_kitten,
        'https://www.purina.com/cats/shop/pro-plan-liveclear-allergen-reducing-kitten-food-dry-cat-food',
        'kitten'
      ),
      (
        'purina pro plan|purina pro plan|purina pro plan sensitive skin and stomach 7 salmon and rice formula dry dog food|dog|unknown|dry||',
        v_sensitive_senior,
        'https://www.purina.com/dogs/shop/pro-plan-senior-salmon-and-rice-dry-dog-food',
        'adult 7+ senior'
      )
  ) x(alias_key,canonical_id,official_url,boundary)
  JOIN public.catalog_formulas f ON f.id=canonical_id
  ON CONFLICT(alias_formula_key) DO UPDATE SET
    formula_id=excluded.formula_id,identity_hash=excluded.identity_hash,
    match_reason=excluded.match_reason,source_url=excluded.source_url,
    metadata=excluded.metadata,updated_at=now();

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded exact Chewy kitten discovery duplicate. Listing 354879 is attached only to the canonical LiveClear kitten formula; it must never map to LiveClear adult.',
    updated_at=now()
  WHERE id=v_liveclear_duplicate;

  UPDATE public.catalog_formulas SET
    verification_status='quarantined',active=false,
    absent_since=COALESCE(absent_since,now()),promoted_cache_key=NULL,promoted_at=NULL,
    complete_food_evidence='Superseded exact Chewy Adult 7+ discovery duplicate. Listing 379218 is attached only to the canonical senior formula; it must never map to the puppy formula.',
    updated_at=now()
  WHERE id=v_sensitive_duplicate;

  UPDATE public.catalog_acquisition_queue SET
    acquisition_notes='Cross-life-stage mapping repaired: Chewy 354879 is LiveClear Kitten Chicken & Rice and is attached only to the verified kitten canonical formula, never LiveClear Adult. Exact official promotion remains required before this deferred gap closes.',
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:376c019ad079429908b820f97aeb264c' AND status='deferred';

  UPDATE public.catalog_acquisition_queue SET
    acquisition_notes='Cross-life-stage mapping repaired: Chewy 379218 is Adult 7+ Senior Sensitive Skin & Stomach Salmon & Rice and is attached only to the verified senior canonical formula, never the puppy formula. Exact official promotion remains required before this deferred gap closes.',
    last_refreshed_at=now(),updated_at=now()
  WHERE gap_key='census:41e5acc53660d1879ae50d40543a65f1' AND status='deferred';

  INSERT INTO public.catalog_source_runs(
    run_key,source_slug,source_type,coverage_role,status,started_at,finished_at,
    expected_count,observed_count,accepted_count,rejected_count,pagination_complete,
    source_content_hash,checkpoint,error_summary,metadata,updated_at
  ) VALUES(
    'identity-repair:purina-pro-plan:cross-life-stage-chewy:20260725',
    'catalog-identity-repair','gap_discovery','gap_discovery','completed',
    now(),now(),2,2,2,0,true,
    encode(digest('354879|liveclear-kitten|379218|adult-7-sensitive-skin|20260725','sha256'),'hex'),
    '{}'::JSONB,NULL,
    jsonb_build_object(
      'exact_identity_repair',true,
      'repairs',jsonb_build_array(
        jsonb_build_object(
          'source_external_id','354879','wrong_formula_id',v_liveclear_adult,
          'correct_formula_id',v_liveclear_kitten,'hard_boundary','kitten'
        ),
        jsonb_build_object(
          'source_external_id','379218','wrong_formula_id',v_sensitive_puppy,
          'correct_formula_id',v_sensitive_senior,'hard_boundary','adult 7+ senior'
        )
      )
    ),now()
  )
  ON CONFLICT(run_key) DO UPDATE SET
    status='completed',finished_at=now(),observed_count=2,accepted_count=2,
    rejected_count=0,pagination_complete=true,error_summary=NULL,
    metadata=excluded.metadata,updated_at=now();

  IF EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE source_slug='chewy-public-sitemap'
      AND (
        (source_external_id='354879' AND formula_id<>v_liveclear_kitten)
        OR (source_external_id='379218' AND formula_id<>v_sensitive_senior)
      )
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE source_slug='chewy-public-sitemap'
      AND (
        (source_external_id='354879' AND formula_id<>v_liveclear_kitten)
        OR (source_external_id='379218' AND formula_id<>v_sensitive_senior)
      )
  ) THEN
    RAISE EXCEPTION 'Cross-life-stage mappings remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id IN (v_liveclear_duplicate,v_sensitive_duplicate)
      AND (active OR verification_status<>'quarantined')
  ) THEN
    RAISE EXCEPTION 'Cross-life-stage discovery duplicates remain active';
  END IF;
END
$$;
