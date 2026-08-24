-- Two official Wellness Healthy Indulgence PDPs are cat foods. An older
-- extractor picked up a site-wide dog navigation token and wrote `dog` into
-- both serving and canonical rows. Repair identity only; the guarded official
-- ingredient statements and front images are intentionally left unchanged.

DO $repair$
DECLARE
  chicken_cache CONSTANT TEXT :=
    'wellness-pet-company:wellness wellness complete health healthy indulgence morsels with chicken turkey in savory sauce';
  turkey_cache CONSTANT TEXT :=
    'wellness-pet-company:wellness wellness complete health healthy indulgence morsels with turkey duck in savory sauce';
  chicken_url CONSTANT TEXT :=
    'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-healthy-indulgence-morsels-chicken-turkey/';
  turkey_url CONSTANT TEXT :=
    'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-healthy-indulgence-morsels-turkey-duck/';
  chicken_old_key CONSTANT TEXT :=
    'wellness|wellness|wellness complete health healthy indulgence morsels with|dog|unknown|wet|chicken and turkey in savory sauce|';
  turkey_old_key CONSTANT TEXT :=
    'wellness pet company|wellness|wellness complete health healthy indulgence morsels with turkey and duck in savory sauce|dog|unknown|wet|turkey and duck in savory sauce|';
  turkey_duplicate_key CONSTANT TEXT :=
    'wellness|wellness|complete health healthy indulgence morsels with|dog|unknown|wet|turkey and duck in savory sauce|';
  chicken_new_key CONSTANT TEXT :=
    'wellness pet company|wellness|complete health healthy indulgence morsels with|cat|unknown|wet|chicken and turkey in savory sauce|';
  turkey_new_key CONSTANT TEXT :=
    'wellness pet company|wellness|complete health healthy indulgence morsels with|cat|unknown|wet|turkey and duck in savory sauce|';
  chicken_hash CONSTANT TEXT :=
    'c2b5548ee0dad4745961d39f6e2375ea97fc9001c1bcf5dc4e26beccb6738e09';
  turkey_hash CONSTANT TEXT :=
    '44d4bc5aa19ccf13d9798e0be008ed1f9fe859f924c01624cd53ad6b2eb5e78b';
  chicken_image CONSTANT TEXT :=
    'https://images.salsify.com/image/upload/s--2Bt21tBO--/w_500/q7wfn5pkxjwk906jcv5d.jpg';
  turkey_image CONSTANT TEXT :=
    'https://images.salsify.com/image/upload/s--GAd7qQEL--/w_500/netjdym0hlviynitxewy.jpg';
  chicken_formula_id BIGINT;
  turkey_formula_id BIGINT;
  turkey_duplicate_id BIGINT;
  chicken_serving_id UUID;
  turkey_serving_id UUID;
  top_key TEXT;
BEGIN
  IF chicken_hash <> encode(extensions.digest(chicken_new_key, 'sha256'), 'hex')
     OR turkey_hash <> encode(extensions.digest(turkey_new_key, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'Wellness target identity hashes are invalid';
  END IF;

  SELECT id INTO STRICT chicken_serving_id
  FROM public.product_data
  WHERE cache_key = chicken_cache
    AND product_name = 'Wellness Complete Health Healthy Indulgence Morsels with Chicken & Turkey in Savory Sauce'
    AND lower(brand) = 'wellness'
    AND lower(pet_type) = 'dog'
    AND lower(food_form) = 'wet'
    AND source_url = chicken_url
    AND ingredient_count = 37
    AND md5(coalesce(ingredient_text, '')) = '19cfdc2538bb83a9b2a12afd00c65aaf'
    AND formula_version_provenance ->> 'ingredient_text_hash' =
        '9fe043dd2b019241015c2ef6a634f54d3067be1951518445eada5f9519300200'
    AND image_url = chicken_image
    AND source_quality = 'manufacturer'
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND is_complete_food
    AND catalog_exclusion_reason IS NULL;

  SELECT id INTO STRICT turkey_serving_id
  FROM public.product_data
  WHERE cache_key = turkey_cache
    AND product_name = 'Wellness Complete Health Healthy Indulgence Morsels with Turkey & Duck in Savory Sauce'
    AND lower(brand) = 'wellness'
    AND lower(pet_type) = 'dog'
    AND lower(food_form) = 'wet'
    AND source_url = turkey_url
    AND ingredient_count = 38
    AND md5(coalesce(ingredient_text, '')) = '9f9ad1f9516d1aff8a98a4c38633bc1f'
    AND formula_version_provenance ->> 'ingredient_text_hash' =
        '9db563ece5894ea0be47c3a4f281f6d42d1c0bf48a67ae745fd7410e497a71f6'
    AND image_url = turkey_image
    AND source_quality = 'manufacturer'
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND is_complete_food
    AND catalog_exclusion_reason IS NULL;

  SELECT id INTO STRICT chicken_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = chicken_old_key AND active
    AND source_url = chicken_url AND pet_type = 'dog'
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND cardinality(ingredients) = 37
    AND md5(coalesce(ingredient_text, '')) = '19cfdc2538bb83a9b2a12afd00c65aaf'
    AND front_image_url = chicken_image;

  SELECT id INTO STRICT turkey_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = turkey_old_key AND active
    AND source_url = turkey_url AND pet_type = 'dog'
    AND promoted_cache_key = turkey_cache
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND cardinality(ingredients) = 38
    AND md5(coalesce(ingredient_text, '')) = '9f9ad1f9516d1aff8a98a4c38633bc1f'
    AND front_image_url = turkey_image;

  SELECT id INTO STRICT turkey_duplicate_id
  FROM public.catalog_formulas
  WHERE formula_key = turkey_duplicate_key AND active
    AND source_url = turkey_url AND pet_type = 'dog'
    AND promoted_cache_key IS NULL
    AND cardinality(ingredients) = 38
    AND md5(coalesce(ingredient_text, '')) = '9f9ad1f9516d1aff8a98a4c38633bc1f'
    AND front_image_url = turkey_image;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id NOT IN (chicken_formula_id, turkey_formula_id, turkey_duplicate_id)
      AND (formula_key IN (chicken_new_key, turkey_new_key)
           OR identity_hash IN (chicken_hash, turkey_hash))
  ) THEN
    RAISE EXCEPTION 'Wellness corrected identity collides with another formula';
  END IF;

  IF EXISTS (SELECT 1 FROM public.catalog_census_members WHERE formula_id = turkey_duplicate_id)
     OR EXISTS (SELECT 1 FROM public.catalog_census_formula_members WHERE formula_id = turkey_duplicate_id)
     OR EXISTS (SELECT 1 FROM public.catalog_formula_identity_conflicts
                WHERE canonical_formula_id = turkey_duplicate_id
                   OR conflicting_formula_id = turkey_duplicate_id)
     OR EXISTS (SELECT 1 FROM public.catalog_gap_evidence_extractions
                WHERE promoted_formula_id = turkey_duplicate_id)
     OR EXISTS (SELECT 1 FROM public.catalog_manual_evidence_reviews
                WHERE formula_id = turkey_duplicate_id)
     OR EXISTS (SELECT 1 FROM public.catalog_formula_aliases
                WHERE formula_id = turkey_duplicate_id) THEN
    RAISE EXCEPTION 'Wellness duplicate has acquired immutable references';
  END IF;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason,
    source_url, metadata, updated_at
  ) VALUES (
    turkey_duplicate_key, turkey_formula_id,
    (SELECT identity_hash FROM public.catalog_formulas WHERE id = turkey_duplicate_id),
    'manual_review', turkey_url,
    jsonb_build_object(
      'source', 'wellness_healthy_indulgence_cat_species_20260817',
      'identity_evidence', 'same exact official PDP, title, ingredients, image, and cat breadcrumb',
      'species_correction', 'dog_to_cat',
      'ingredient_or_image_rewrite', false,
      'duplicate_formula_id', turkey_duplicate_id,
      'reviewed_at', now()
    ), now()
  )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = EXCLUDED.formula_id,
      identity_hash = EXCLUDED.identity_hash,
      match_reason = EXCLUDED.match_reason,
      source_url = EXCLUDED.source_url,
      metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
      updated_at = now()
  WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

  UPDATE public.catalog_observations
  SET formula_id = turkey_formula_id
  WHERE formula_id = turkey_duplicate_id;

  UPDATE public.catalog_skus
  SET formula_id = turkey_formula_id, updated_at = now()
  WHERE formula_id = turkey_duplicate_id;

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT turkey_formula_id, observation_id, field_name, field_value, source_url,
         source_authority, accepted, observed_at, content_hash
  FROM public.catalog_field_evidence
  WHERE formula_id = turkey_duplicate_id
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted,
      observed_at = greatest(public.catalog_field_evidence.observed_at, EXCLUDED.observed_at);

  DELETE FROM public.catalog_field_evidence WHERE formula_id = turkey_duplicate_id;

  UPDATE public.catalog_formulas
  SET active = false,
      absent_since = coalesce(absent_since, now()),
      verification_status = 'quarantined',
      promoted_cache_key = NULL,
      promoted_at = NULL,
      formula_version_provenance = coalesce(formula_version_provenance, '{}'::jsonb)
        || jsonb_build_object(
          'superseded_by_formula_id', turkey_formula_id,
          'superseded_by_cache_key', turkey_cache,
          'supersession_reason', 'exact_duplicate_after_official_cat_species_correction',
          'superseded_at', now()
        ),
      updated_at = now()
  WHERE id = turkey_duplicate_id;

  UPDATE public.product_data
  SET pet_type = 'cat',
      product_line = 'Complete Health Healthy Indulgence Morsels with',
      formula_version_provenance = coalesce(formula_version_provenance, '{}'::jsonb)
        || jsonb_build_object(
          'identity_correction', 'official_product_breadcrumb_dog_to_cat',
          'identity_corrected_at', now(),
          'previous_pet_type', 'dog',
          'pet_type', 'cat',
          'ingredient_or_image_rewrite', false
        ),
      updated_at = now()
  WHERE id IN (chicken_serving_id, turkey_serving_id);

  UPDATE public.catalog_formulas
  SET formula_key = chicken_new_key,
      identity_hash = chicken_hash,
      manufacturer = 'Wellness Pet Company', brand = 'Wellness',
      product_line = 'Complete Health Healthy Indulgence Morsels with',
      pet_type = 'cat', life_stage = 'unknown', food_form = 'wet',
      flavor = 'Chicken & Turkey in Savory Sauce',
      promoted_cache_key = chicken_cache,
      promoted_at = coalesce(promoted_at, now()),
      protected_terms = ARRAY['Wellness','Complete Health','Healthy Indulgence','Morsels','Chicken & Turkey in Savory Sauce','cat','wet'],
      formula_version_provenance = coalesce(formula_version_provenance, '{}'::jsonb)
        || jsonb_build_object(
          'identity_correction', 'official_product_breadcrumb_dog_to_cat',
          'identity_corrected_at', now(), 'previous_formula_key', chicken_old_key,
          'previous_pet_type', 'dog', 'pet_type', 'cat',
          'ingredient_or_image_rewrite', false
        ),
      updated_at = now()
  WHERE id = chicken_formula_id;

  UPDATE public.catalog_formulas
  SET formula_key = turkey_new_key,
      identity_hash = turkey_hash,
      manufacturer = 'Wellness Pet Company', brand = 'Wellness',
      product_line = 'Complete Health Healthy Indulgence Morsels with',
      pet_type = 'cat', life_stage = 'unknown', food_form = 'wet',
      flavor = 'Turkey & Duck in Savory Sauce',
      promoted_cache_key = turkey_cache,
      promoted_at = coalesce(promoted_at, now()),
      protected_terms = ARRAY['Wellness','Complete Health','Healthy Indulgence','Morsels','Turkey & Duck in Savory Sauce','cat','wet'],
      formula_version_provenance = coalesce(formula_version_provenance, '{}'::jsonb)
        || jsonb_build_object(
          'identity_correction', 'official_product_breadcrumb_dog_to_cat',
          'identity_corrected_at', now(), 'previous_formula_key', turkey_old_key,
          'previous_pet_type', 'dog', 'pet_type', 'cat',
          'ingredient_or_image_rewrite', false
        ),
      updated_at = now()
  WHERE id = turkey_formula_id;

  UPDATE public.catalog_observations observation
  SET manufacturer = 'Wellness Pet Company', brand = 'Wellness',
      product_line = 'Complete Health Healthy Indulgence Morsels with',
      pet_type = 'cat', life_stage = 'unknown', food_form = 'wet',
      flavor = CASE WHEN observation.formula_id = chicken_formula_id
                    THEN 'Chicken & Turkey in Savory Sauce'
                    ELSE 'Turkey & Duck in Savory Sauce' END,
      formula_version_provenance = coalesce(observation.formula_version_provenance, '{}'::jsonb)
        || jsonb_build_object(
          'identity_correction', 'official_product_breadcrumb_dog_to_cat',
          'identity_corrected_at', now(), 'previous_pet_type', 'dog',
          'pet_type', 'cat', 'ingredient_or_image_rewrite', false
        )
  WHERE observation.formula_id IN (chicken_formula_id, turkey_formula_id)
    AND observation.source_url IN (chicken_url, turkey_url);

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT v.formula_id, NULL, v.field_name, to_jsonb(v.field_value), v.source_url,
         'manufacturer', true, now(),
         encode(extensions.digest(concat_ws('|', v.formula_id::text,
           'wellness_healthy_indulgence_cat_species_20260817',
           v.field_name, v.field_value, v.source_url), 'sha256'), 'hex')
  FROM (VALUES
    (chicken_formula_id, 'pet_type'::text, 'cat'::text, chicken_url),
    (chicken_formula_id, 'product_line'::text, 'Complete Health Healthy Indulgence Morsels with'::text, chicken_url),
    (turkey_formula_id, 'pet_type'::text, 'cat'::text, turkey_url),
    (turkey_formula_id, 'product_line'::text, 'Complete Health Healthy Indulgence Morsels with'::text, turkey_url)
  ) AS v(formula_id, field_name, field_value, source_url)
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET accepted = true, observed_at = EXCLUDED.observed_at;

  IF (SELECT count(*) FROM public.product_data
      WHERE id IN (chicken_serving_id, turkey_serving_id)
        AND pet_type = 'cat'
        AND product_line = 'Complete Health Healthy Indulgence Morsels with') <> 2
     OR (SELECT count(*) FROM public.catalog_formulas
         WHERE id IN (chicken_formula_id, turkey_formula_id)
           AND active AND pet_type = 'cat'
           AND promoted_cache_key IN (chicken_cache, turkey_cache)) <> 2
     OR EXISTS (SELECT 1 FROM public.catalog_observations WHERE formula_id = turkey_duplicate_id)
     OR EXISTS (SELECT 1 FROM public.catalog_skus WHERE formula_id = turkey_duplicate_id)
     OR EXISTS (SELECT 1 FROM public.catalog_field_evidence WHERE formula_id = turkey_duplicate_id) THEN
    RAISE EXCEPTION 'Wellness cat species repair postcondition failed';
  END IF;

  SELECT cache_key INTO top_key
  FROM public.search_verified_products(
    'Wellness Complete Health Healthy Indulgence Morsels with Chicken & Turkey in Savory Sauce', 5
  ) ORDER BY rank DESC LIMIT 1;
  IF top_key IS DISTINCT FROM chicken_cache THEN
    RAISE EXCEPTION 'Wellness Chicken & Turkey exact search regression: %', coalesce(top_key, '<none>');
  END IF;

  SELECT cache_key INTO top_key
  FROM public.search_verified_products(
    'Wellness Complete Health Healthy Indulgence Morsels with Turkey & Duck in Savory Sauce', 5
  ) ORDER BY rank DESC LIMIT 1;
  IF top_key IS DISTINCT FROM turkey_cache THEN
    RAISE EXCEPTION 'Wellness Turkey & Duck exact search regression: %', coalesce(top_key, '<none>');
  END IF;
END;
$repair$;
