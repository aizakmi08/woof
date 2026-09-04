-- Correct one exact PetSmart Nutro package whose title, URL, image evidence,
-- and complete ingredient statement all identify dry dog food, while legacy
-- ingestion metadata incorrectly stored the form as fresh. Keep this retailer
-- package/ingredient version separate from the manufacturer-current formula.

DO $$
DECLARE
  v_source_url CONSTANT TEXT :=
    'https://www.petsmart.com/dog/food/dry-food/nutro-natural-choice-small-bites-adult-dog-dry-food-chicken-and-brown-rice-74578.html';
  v_cache_key CONSTANT TEXT := 'petsmart-retail-catalog:079105130981';
  v_old_formula_key CONSTANT TEXT :=
    'nutro|nutro|nutro natural choice small bites adult dog dry food chicken and brown rice|dog|adult|fresh||';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_cache_key
      AND brand = 'Nutro'
      AND pet_type = 'dog'
      AND life_stage = 'adult'
      AND food_form = 'fresh'
      AND gtin = '079105130981'
      AND product_name =
        'Nutro Natural Choice Small Bites Adult Dog Dry Food - Chicken & Brown Rice'
      AND source_url = v_source_url
      AND formula_evidence_tier = 'retailer_web_version'
      AND ingredient_verification_status = 'retailer_verified'
      AND image_verification_status = 'retailer_verified'
      AND md5(ingredient_text) = '7aa0f94f9216ed831ead63d582a746ff'
  ) THEN
    RAISE EXCEPTION 'Nutro exact serving precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 8087
      AND active
      AND verification_status = 'verified'
      AND formula_key = v_old_formula_key
      AND identity_hash =
        '7b3e8553393f6a7f4744f884923b15a816e857b08c8d9f0bab4ed1485215faac'
      AND food_form = 'fresh'
      AND source_url = v_source_url
      AND md5(ingredient_text) = '7aa0f94f9216ed831ead63d582a746ff'
  ) THEN
    RAISE EXCEPTION 'Nutro exact formula precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE id = 8608
      AND formula_id = 8087
      AND gtin = '079105130981'
      AND food_form = 'fresh'
      AND source_url = v_source_url
      AND validation_status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Nutro exact observation precondition changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE active
      AND id <> 8087
      AND formula_key =
        'nutro|nutro|nutro natural choice small bites adult dog dry food chicken and brown rice|dog|adult|dry||'
  ) THEN
    RAISE EXCEPTION 'Nutro corrected formula identity already exists';
  END IF;
END;
$$;

UPDATE public.product_data
SET food_form = 'dry',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'identity_correction', 'fresh_to_dry_from_exact_package_title_and_url',
        'identity_corrected_at', NOW(),
        'identity_evidence', ARRAY[
          'product_title',
          'source_url_dry_food_path',
          'retailer_front_image',
          'complete_ingredient_statement'
        ]::TEXT[],
        'source_version_preserved', TRUE
      ),
    updated_at = NOW()
WHERE cache_key = 'petsmart-retail-catalog:079105130981';

UPDATE public.catalog_formulas
SET formula_key =
      'nutro|nutro|nutro natural choice small bites adult dog dry food chicken and brown rice|dog|adult|dry||',
    food_form = 'dry',
    identity_hash = encode(
      digest(
        'nutro|nutro|nutro natural choice small bites adult dog dry food chicken and brown rice|dog|adult|dry||',
        'sha256'
      ),
      'hex'
    ),
    protected_terms = ARRAY(
      SELECT DISTINCT term
      FROM unnest(
        COALESCE(protected_terms, ARRAY[]::TEXT[]) ||
        ARRAY[
          'Nutro',
          'Natural Choice',
          'Small Bites',
          'Adult',
          'Dog',
          'Dry',
          'Chicken',
          'Brown Rice'
        ]::TEXT[]
      ) term
      ORDER BY term
    ),
    promoted_cache_key = 'petsmart-retail-catalog:079105130981',
    promoted_at = COALESCE(promoted_at, NOW()),
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'identity_correction', 'fresh_to_dry_from_exact_package_title_and_url',
        'identity_corrected_at', NOW(),
        'source_version_preserved', TRUE
      ),
    updated_at = NOW()
WHERE id = 8087;

UPDATE public.catalog_observations
SET food_form = 'dry'
WHERE id = 8608
  AND formula_id = 8087;

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
VALUES (
  8087,
  8608,
  'food_form',
  to_jsonb('dry'::TEXT),
  'https://www.petsmart.com/dog/food/dry-food/nutro-natural-choice-small-bites-adult-dog-dry-food-chicken-and-brown-rice-74578.html',
  'retailer_verified',
  TRUE,
  '2026-07-16 21:07:41.456+00'::TIMESTAMPTZ,
  encode(digest('dry', 'sha256'), 'hex')
)
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = excluded.observation_id,
    field_value = excluded.field_value,
    accepted = TRUE,
    observed_at = excluded.observed_at;

DO $$
DECLARE
  v_top RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'petsmart-retail-catalog:079105130981'
      AND food_form = 'dry'
      AND formula_evidence_tier = 'retailer_web_version'
      AND public.catalog_quality_state(
        pet_type,
        is_complete_food,
        catalog_exclusion_reason,
        ingredient_text,
        ingredient_count,
        ingredient_verification_status,
        image_url,
        image_verification_status,
        source_url,
        expires_at
      ) = 'verified_ready'
  ) THEN
    RAISE EXCEPTION 'Nutro corrected serving is not verified-ready';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 8087
      AND active
      AND verification_status = 'verified'
      AND food_form = 'dry'
      AND formula_key =
        'nutro|nutro|nutro natural choice small bites adult dog dry food chicken and brown rice|dog|adult|dry||'
      AND identity_hash =
        '899c299700f7cbabe3b77c70295a66398776c1dcc2f85da4f65828e43d3f64b2'
      AND promoted_cache_key = 'petsmart-retail-catalog:079105130981'
  ) THEN
    RAISE EXCEPTION 'Nutro corrected formula identity failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE id = 8608
      AND formula_id = 8087
      AND food_form = 'dry'
  ) THEN
    RAISE EXCEPTION 'Nutro corrected observation identity failed';
  END IF;

  SELECT *
  INTO v_top
  FROM public.search_verified_products(
    'Nutro Natural Choice Small Bites Adult Dog Dry Food Chicken Brown Rice',
    5
  )
  LIMIT 1;

  IF v_top.cache_key IS DISTINCT FROM
     'petsmart-retail-catalog:079105130981'
     OR v_top.food_form IS DISTINCT FROM 'dry' THEN
    RAISE EXCEPTION 'Nutro corrected exact search failed';
  END IF;
END;
$$;
