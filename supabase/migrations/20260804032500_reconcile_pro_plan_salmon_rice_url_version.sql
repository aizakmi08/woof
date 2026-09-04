-- Reconcile Purina Pro Plan Complete Essentials Salmon & Rice Entree in
-- Sauce across an official PDP URL/package refresh.
--
-- Both official observations identify GTIN 038100026972 and the same exact
-- cat wet formula. The newer PDP expands the mineral/vitamin grouping and
-- uses "Water Sufficient for Processing" / plural "Natural Flavors"; it
-- does not add or remove a formula-defining protein, recipe, form, species,
-- or life-stage boundary. Preserve both fixed evidence hashes, keep the
-- current manufacturer statement canonical, and record the older URL as a
-- reviewed superseded identity rather than a second active formula.

DO $$
DECLARE
  v_formula BIGINT;
  v_identity_hash TEXT;
  v_old_key CONSTANT TEXT :=
    'purina pro plan|purina pro plan|pro plan complete essentials|cat|unknown|wet|salmon and rice entree|';
  v_new_key CONSTANT TEXT :=
    'purina pro plan|purina pro plan|pro plan complete essentials|cat|adult|wet|salmon and rice entree|';
  v_observation_alias CONSTANT TEXT :=
    'purina pro plan|purina pro plan|pro plan complete essentials salmon and rice entree in sauce wet cat food|cat|unknown|wet|salmon and rice entree|';
  v_cache CONSTANT TEXT :=
    'manufacturer-reviewed-wave-z-20260725:038100026972';
  v_duplicate_cache CONSTANT TEXT :=
    'nestle-purina-pro-plan:038100026972';
  v_gtin CONSTANT TEXT := '038100026972';
  v_old_url CONSTANT TEXT :=
    'https://www.purina.com/cats/shop/pro-plan-complete-essentials-salmon-rice-sauce-entree-wet-cat-food';
  v_current_url CONSTANT TEXT :=
    'https://www.purina.com/cats/shop/pro-plan-complete-essentials-salmon-rice-sauce-wet-cat-food';
  v_old_ingredient_hash CONSTANT TEXT :=
    'ae4100ad97412622cfd9c3cb6339473789c6250521fa1b29aa291f984e8a72cb';
  v_current_ingredient_hash CONSTANT TEXT :=
    'abb5803e488e56eb8f9b65dc1df50e71d48855ff6c1f486e5b701a162122ed79';
BEGIN
  SELECT id, identity_hash
  INTO STRICT v_formula, v_identity_hash
  FROM public.catalog_formulas
  WHERE formula_key = v_old_key
    AND active
    AND verification_status = 'verified'
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND source_url = v_current_url
    AND pet_type = 'cat'
    AND life_stage = 'unknown'
    AND food_form = 'wet'
    AND flavor = 'Salmon & Rice Entrée'
    AND cardinality(ingredients) = 33
    AND encode(digest(ingredient_text, 'sha256'), 'hex') =
        v_current_ingredient_hash;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key = v_new_key
      AND id <> v_formula
  ) THEN
    RAISE EXCEPTION
      'Pro Plan Salmon & Rice adult canonical identity already occupied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_cache
      AND gtin = v_gtin
      AND lower(brand) = 'purina pro plan'
      AND pet_type = 'cat'
      AND life_stage = 'adult'
      AND food_form = 'wet'
      AND source_url = v_current_url
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND ingredient_count = 33
      AND image_url <> ''
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
          v_current_ingredient_hash
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION
      'Pro Plan Salmon & Rice current manufacturer serving row missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_duplicate_cache
      AND gtin = v_gtin
      AND source_url = v_current_url
      AND ingredient_count = 33
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
          v_current_ingredient_hash
      AND catalog_exclusion_reason = 'duplicate_exact_verified_catalog_row'
  ) THEN
    RAISE EXCEPTION
      'Pro Plan Salmon & Rice duplicate serving-row precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE formula_id = v_formula
      AND source_url = v_old_url
      AND gtin = v_gtin
      AND lower(brand) = 'purina pro plan'
      AND product_line = 'pro plan complete essentials'
      AND pet_type = 'cat'
      AND food_form = 'wet'
      AND flavor = 'salmon and rice entree'
      AND validation_status = 'accepted'
      AND ingredient_text <> ''
      AND front_image_url <> ''
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
          v_old_ingredient_hash
  ) THEN
    RAISE EXCEPTION
      'Pro Plan Salmon & Rice superseded official observation changed';
  END IF;

  IF (
    SELECT count(DISTINCT gtin)
    FROM public.catalog_skus
    WHERE formula_id = v_formula
      AND gtin = v_gtin
      AND active
  ) <> 1 THEN
    RAISE EXCEPTION
      'Pro Plan Salmon & Rice exact GTIN is not attached to canonical formula';
  END IF;

  UPDATE public.catalog_formulas
  SET formula_key = v_new_key,
      life_stage = 'adult',
      promoted_cache_key = v_cache,
      identity_hash = encode(digest(v_new_key, 'sha256'), 'hex'),
      protected_terms = ARRAY(
        SELECT DISTINCT term
        FROM unnest(
          COALESCE(protected_terms, ARRAY[]::text[])
          || ARRAY[
            'purina pro plan', 'pro plan complete essentials',
            'salmon and rice entree', 'in sauce', 'adult', 'cat', 'wet'
          ]::text[]
        ) AS term
        WHERE trim(term) <> ''
      ),
      last_observed_at = now(),
      updated_at = now()
  WHERE id = v_formula;

  SELECT identity_hash
  INTO STRICT v_identity_hash
  FROM public.catalog_formulas
  WHERE id = v_formula
    AND formula_key = v_new_key
    AND life_stage = 'adult'
    AND promoted_cache_key = v_cache;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key,
    formula_id,
    identity_hash,
    match_reason,
    source_url,
    metadata,
    updated_at
  ) VALUES
    (
      v_old_key,
      v_formula,
      v_identity_hash,
      'manual_review',
      v_current_url,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'life_stage_reconciliation', 'adult_from_current_official_feed',
        'canonical_formula_key', v_new_key,
        'reviewed_at', now()
      ),
      now()
    ),
    (
      v_observation_alias,
      v_formula,
      v_identity_hash,
      'manual_review',
      v_old_url,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'official_url_supersession', TRUE,
        'same_formula_gtin', v_gtin,
        'consumer_brand_boundary', 'purina pro plan',
        'species_boundary', 'cat',
        'life_stage_boundary', 'adult',
        'food_form_boundary', 'wet',
        'recipe_boundary', 'salmon and rice entree in sauce',
        'superseded_official_url', v_old_url,
        'current_official_url', v_current_url,
        'superseded_ingredient_text_hash', v_old_ingredient_hash,
        'current_ingredient_text_hash', v_current_ingredient_hash,
        'ingredient_change_classification',
          'formatting_and_group_expansion_same_formula',
        'reviewed_at', now()
      ),
      now()
    )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = excluded.formula_id,
      identity_hash = excluded.identity_hash,
      match_reason = excluded.match_reason,
      source_url = excluded.source_url,
      metadata = excluded.metadata,
      updated_at = now();

  UPDATE public.catalog_observations
  SET formula_id = v_formula,
      life_stage = 'adult',
      validation_status = 'accepted',
      validation_reasons = ARRAY[]::text[],
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::jsonb)
        || jsonb_build_object(
          'official_url_supersession', TRUE,
          'superseded_official_url', v_old_url,
          'current_official_url', v_current_url,
          'same_formula_gtin', v_gtin,
          'superseded_ingredient_text_hash', v_old_ingredient_hash,
          'current_ingredient_text_hash', v_current_ingredient_hash,
          'ingredient_change_classification',
            'formatting_and_group_expansion_same_formula'
        ),
      raw_payload = COALESCE(raw_payload, '{}'::jsonb)
        || jsonb_build_object(
          'identity_reconciliation', jsonb_build_object(
            'status', 'exact_official_url_supersession',
            'canonical_formula_id', v_formula,
            'canonical_formula_key', v_new_key,
            'same_formula_gtin', v_gtin
          )
        )
  WHERE formula_id = v_formula
    AND source_url = v_old_url
    AND gtin = v_gtin;

  INSERT INTO public.catalog_field_evidence (
    formula_id,
    observation_id,
    field_name,
    field_value,
    source_url,
    source_authority,
    accepted,
    observed_at,
    content_hash
  )
  SELECT
    v_formula,
    observation.id,
    'official_url_supersession',
    jsonb_build_object(
      'superseded_official_url', v_old_url,
      'current_official_url', v_current_url,
      'gtin', v_gtin,
      'superseded_ingredient_text_hash', v_old_ingredient_hash,
      'current_ingredient_text_hash', v_current_ingredient_hash,
      'ingredient_change_classification',
        'formatting_and_group_expansion_same_formula',
      'superseded_front_image_url', observation.front_image_url,
      'current_front_image_url', (
        SELECT image_url
        FROM public.product_data
        WHERE cache_key = v_cache
      )
    ),
    v_old_url,
    'manufacturer',
    TRUE,
    observation.observed_at,
    encode(digest(
      v_old_url || '|' || v_current_url || '|' || v_gtin || '|'
      || v_old_ingredient_hash || '|' || v_current_ingredient_hash,
      'sha256'
    ), 'hex')
  FROM public.catalog_observations observation
  WHERE observation.formula_id = v_formula
    AND observation.source_url = v_old_url
    AND observation.gtin = v_gtin
  ORDER BY observation.observed_at DESC, observation.id DESC
  LIMIT 1
  ON CONFLICT (
    formula_id, field_name, source_url, content_hash
  ) DO UPDATE
  SET observation_id = excluded.observation_id,
      field_value = excluded.field_value,
      source_authority = excluded.source_authority,
      accepted = TRUE,
      observed_at = excluded.observed_at;

  INSERT INTO public.catalog_source_runs (
    run_key,
    source_slug,
    source_type,
    coverage_role,
    status,
    started_at,
    finished_at,
    expected_count,
    observed_count,
    accepted_count,
    rejected_count,
    pagination_complete,
    checkpoint,
    error_summary,
    metadata,
    updated_at
  ) VALUES (
    'manual-review:pro-plan-salmon-rice-url-version:20260803',
    'nestle-purina-pro-plan',
    'manufacturer',
    'verification',
    'completed',
    now(),
    now(),
    1,
    1,
    1,
    0,
    TRUE,
    '{}'::jsonb,
    NULL,
    jsonb_build_object(
      'bounded_exact_evidence', TRUE,
      'market_census_complete', FALSE,
      'formula_count', 1,
      'gtin', v_gtin,
      'superseded_official_url', v_old_url,
      'current_official_url', v_current_url,
      'superseded_ingredient_text_hash', v_old_ingredient_hash,
      'current_ingredient_text_hash', v_current_ingredient_hash,
      'ingredient_change_classification',
        'formatting_and_group_expansion_same_formula'
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET status = 'completed',
      finished_at = now(),
      expected_count = 1,
      observed_count = 1,
      accepted_count = 1,
      rejected_count = 0,
      pagination_complete = TRUE,
      error_summary = NULL,
      metadata = excluded.metadata,
      updated_at = now();

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Purina Pro Plan Complete Essentials Salmon Rice Entree in Sauce Wet Cat Food',
      1
    )
  ) IS DISTINCT FROM v_cache THEN
    RAISE EXCEPTION
      'Pro Plan Salmon & Rice exact search did not select current formula';
  END IF;

  IF (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin(v_gtin, 8)
    LIMIT 1
  ) IS DISTINCT FROM v_cache THEN
    RAISE EXCEPTION
      'Pro Plan Salmon & Rice exact GTIN did not select current formula';
  END IF;
END;
$$;
