-- Repair the exact Tiki Cat Born Carnivore Baby Chicken & Egg dry formula.
--
-- Tiki's current manufacturer PDP is incorrectly nested under a legacy
-- `/tiki-cat-wet-food/` URL. The exact product wrapper, 2.8/5.6 lb bag image,
-- guaranteed analysis, and package identity all prove that the formula is dry.
-- Earlier imports trusted the URL path and left two manufacturer formula rows
-- at food_form=unknown, while exact PetSmart and Chewy identities remained as
-- separate formula rows. The ingredient statement on the exact PetSmart package
-- normalizes byte-for-byte to the current manufacturer statement.
--
-- This migration changes identity and reconciliation metadata only. It does not
-- rewrite ingredients or images. The exact PetSmart GTIN remains a retailer SKU
-- child/source version, and the Chewy sitemap title remains identity-only.

DO $migration$
DECLARE
  v_canonical_id BIGINT;
  v_legacy_official_id BIGINT;
  v_petsmart_id BIGINT;
  v_chewy_id BIGINT;

  v_old_canonical_key CONSTANT TEXT :=
    'whitebridge pet brands|tiki cat|kitten health deboned chicken and egg recipe tiki cat wet food mousse shreds kitten kittens chicken egg luau|cat|kitten|unknown|chicken and egg recipe|';
  v_old_official_key CONSTANT TEXT :=
    'tiki cat|tiki cat|health deboned|cat|kitten|unknown|chicken and egg recipe|';
  v_petsmart_key CONSTANT TEXT :=
    'tiki cat|tiki cat|tiki cat born carnivore baby kitten health food chicken and egg non gmo|cat|kitten|dry||';
  v_chewy_key CONSTANT TEXT :=
    'tiki cat|tiki cat|tiki cat born carnivore baby chicken and egg recipe grain free kitten dry cat food|cat|kitten|dry||';
  v_canonical_key CONSTANT TEXT :=
    'whitebridge pet brands|tiki cat|born carnivore baby|cat|kitten|dry|chicken and egg recipe|';

  v_official_url CONSTANT TEXT :=
    'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/kittens-chicken-egg-luau/';
  v_petsmart_url CONSTANT TEXT :=
    'https://www.petsmart.com/cat/food-and-treats/dry-food/tiki-cat-born-carnivore-baby-kitten-health-food-chicken-and-egg-non-gmo-57654.html';
  v_chewy_url CONSTANT TEXT :=
    'https://www.chewy.com/tiki-cat-born-carnivore-deboned/dp/285541';
  v_official_image CONSTANT TEXT :=
    'https://tikipets.com/wp-content/uploads/2023/02/TCBCBaby_Dry_2.8F.webp';
  v_petsmart_image CONSTANT TEXT :=
    'https://s7d2.scene7.com/is/image/PetSmart/5338423';

  v_official_cache CONSTANT TEXT :=
    'tiki-pets:tiki cat kitten health deboned chicken egg recipe kitten kittens-chicken-egg-luau';
  v_petsmart_cache CONSTANT TEXT :=
    'petsmart-retail-catalog:693804805805';
  v_gtin CONSTANT TEXT := '693804805805';
  v_official_ingredient_md5 CONSTANT TEXT :=
    '6d566f2569ad690fc53ee510ca59f079';
  v_petsmart_ingredient_md5 CONSTANT TEXT :=
    'ad9367523654b0bb650905a111709307';
  v_page_sha256 CONSTANT TEXT :=
    '3b6bb359ab25013f4d1829e8eb16629407f127f23da73a46cfb884b475427ad5';
  v_captured_at CONSTANT TIMESTAMPTZ :=
    '2026-08-05T00:29:09.697Z'::TIMESTAMPTZ;
  v_canonical_identity_hash TEXT :=
    encode(digest(v_canonical_key, 'sha256'), 'hex');

  v_latest_chewy_observation BIGINT;
  v_petsmart_observation BIGINT;
  v_top TEXT;
  v_resolved RECORD;
BEGIN
  SELECT id
  INTO STRICT v_canonical_id
  FROM public.catalog_formulas
  WHERE formula_key = v_old_canonical_key
    AND source_url = v_official_url;

  SELECT id
  INTO STRICT v_legacy_official_id
  FROM public.catalog_formulas
  WHERE formula_key = v_old_official_key
    AND source_url = v_official_url;

  SELECT id
  INTO STRICT v_petsmart_id
  FROM public.catalog_formulas
  WHERE formula_key = v_petsmart_key
    AND source_url = v_petsmart_url;

  SELECT id
  INTO STRICT v_chewy_id
  FROM public.catalog_formulas
  WHERE formula_key = v_chewy_key
    AND source_url = v_chewy_url;

  -- Exact live preconditions. A changed formula, image, package, or identity
  -- must stop this migration for a new review rather than silently merge.
  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_canonical_id
      AND formula_key = v_old_canonical_key
      AND brand = 'Tiki Cat'
      AND manufacturer = 'Whitebridge Pet Brands'
      AND pet_type = 'cat'
      AND life_stage = 'kitten'
      AND food_form = 'unknown'
      AND flavor = 'Chicken & Egg Recipe'
      AND source_url = v_official_url
      AND front_image_url = v_official_image
      AND md5(ingredient_text) = v_official_ingredient_md5
      AND cardinality(ingredients) = 43
      AND is_complete_food
      AND active
      AND verification_status = 'verified'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND promoted_cache_key = v_official_cache
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby canonical precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_legacy_official_id
      AND formula_key = v_old_official_key
      AND source_url = v_official_url
      AND food_form = 'unknown'
      AND md5(ingredient_text) = v_official_ingredient_md5
      AND cardinality(ingredients) = 43
      AND active
      AND verification_status = 'verified'
      AND formula_evidence_tier = 'manufacturer_current_exact'
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby legacy official precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_petsmart_id
      AND formula_key = v_petsmart_key
      AND source_url = v_petsmart_url
      AND pet_type = 'cat'
      AND life_stage = 'kitten'
      AND food_form = 'dry'
      AND md5(ingredient_text) = v_petsmart_ingredient_md5
      AND cardinality(ingredients) = 43
      AND front_image_url = v_petsmart_image
      AND active
      AND verification_status = 'verified'
      AND formula_evidence_tier = 'retailer_web_version'
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby PetSmart precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_chewy_id
      AND formula_key = v_chewy_key
      AND source_url = v_chewy_url
      AND pet_type = 'cat'
      AND life_stage = 'kitten'
      AND food_form = 'dry'
      AND front_image_url =
        'https://image.chewy.com/catalog/general/images/tiki-cat-born-carnivore-baby-chicken-egg-recipe-non-gmo-kitten-dry-cat-food-2-8lb-bag/img-666999._V1_.jpg'
      AND ingredient_text = ''
      AND cardinality(ingredients) = 0
      AND active
      AND verification_status = 'discovered'
      AND formula_evidence_tier = 'unverified'
      AND promoted_cache_key IS NULL
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby Chewy precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_official_cache
      AND brand = 'Tiki Cat'
      AND pet_type = 'cat'
      AND life_stage = 'kitten'
      AND food_form IS NULL
      AND source = 'tiki-pets'
      AND source_url = v_official_url
      AND image_url = v_official_image
      AND md5(ingredient_text) = v_official_ingredient_md5
      AND ingredient_count = 43
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND formula_evidence_tier = 'manufacturer_current_exact'
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby official serving precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_petsmart_cache
      AND brand = 'Tiki Cat'
      AND pet_type = 'cat'
      AND life_stage = 'kitten'
      AND food_form = 'dry'
      AND gtin = v_gtin
      AND source = 'petsmart-retail-catalog'
      AND source_url = v_petsmart_url
      AND image_url = v_petsmart_image
      AND md5(ingredient_text) = v_petsmart_ingredient_md5
      AND ingredient_count = 43
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
      AND source_quality = 'retailer_verified'
      AND ingredient_verification_status = 'retailer_verified'
      AND image_verification_status = 'retailer_verified'
      AND formula_evidence_tier = 'retailer_web_version'
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby PetSmart serving precondition changed';
  END IF;

  IF (
    SELECT public.catalog_normalize_ingredient_evidence(official.ingredient_text)
         = public.catalog_normalize_ingredient_evidence(retailer.ingredient_text)
    FROM public.product_data official
    CROSS JOIN public.product_data retailer
    WHERE official.cache_key = v_official_cache
      AND retailer.cache_key = v_petsmart_cache
  ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Tiki official/PetSmart ingredient versions do not match';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key = v_canonical_key
      AND id <> v_canonical_id
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby canonical key already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key IN (
      v_old_canonical_key,
      v_old_official_key,
      v_petsmart_key,
      v_chewy_key
    )
      AND formula_id <> v_canonical_id
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby alias belongs to another formula';
  END IF;

  SELECT id
  INTO STRICT v_latest_chewy_observation
  FROM public.catalog_observations
  WHERE formula_id = v_chewy_id
    AND source_slug = 'chewy-public-sitemap'
    AND source_external_id = '285541'
    AND source_url = v_chewy_url
    AND validation_status = 'accepted'
    AND ingredient_text = ''
  ORDER BY observed_at DESC, id DESC
  LIMIT 1;

  SELECT id
  INTO STRICT v_petsmart_observation
  FROM public.catalog_observations
  WHERE formula_id = v_petsmart_id
    AND source_slug = 'petsmart-retail-catalog'
    AND source_external_id = v_petsmart_cache
    AND source_url = v_petsmart_url
    AND gtin = v_gtin
    AND validation_status = 'accepted'
    AND md5(ingredient_text) = v_petsmart_ingredient_md5;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id IN (
      v_canonical_id,
      v_legacy_official_id,
      v_petsmart_id,
      v_chewy_id
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby SKU precondition changed';
  END IF;

  -- Preserve every observation and package identity under one exact formula.
  UPDATE public.catalog_observations
  SET formula_id = v_canonical_id,
      manufacturer = 'Whitebridge Pet Brands',
      brand = 'Tiki Cat',
      product_line = 'Born Carnivore Baby',
      pet_type = 'cat',
      life_stage = 'kitten',
      food_form = 'dry',
      flavor = 'Chicken & Egg Recipe',
      raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
        'canonical_formula_identity', jsonb_build_object(
          'manufacturer', 'whitebridge pet brands',
          'brand', 'tiki cat',
          'product_line', 'born carnivore baby',
          'pet_type', 'cat',
          'life_stage', 'kitten',
          'food_form', 'dry',
          'flavor', 'chicken and egg recipe',
          'diet_condition', ''
        ),
        'identity_reconciled', TRUE,
        'identity_reconciled_at', v_captured_at,
        'misrouted_official_url_path_ignored', source_slug = 'tiki-pets'
      )
  WHERE formula_id IN (
    v_canonical_id,
    v_legacy_official_id,
    v_petsmart_id,
    v_chewy_id
  );

  UPDATE public.catalog_field_evidence
  SET formula_id = v_canonical_id
  WHERE formula_id IN (v_legacy_official_id, v_petsmart_id, v_chewy_id);

  UPDATE public.catalog_skus
  SET formula_id = v_canonical_id,
      updated_at = NOW()
  WHERE formula_id IN (v_legacy_official_id, v_petsmart_id, v_chewy_id);

  -- Two prior official runs created two empty-size SKU identities for the same
  -- exact PDP. Retain both observations, but keep only the stable serving-key
  -- SKU active so package-size counting cannot double-count the formula.
  UPDATE public.catalog_skus
  SET active = FALSE,
      updated_at = NOW()
  WHERE formula_id = v_canonical_id
    AND source_slug = 'tiki-pets'
    AND source_external_id = 'tiki-pets:b49f31c88eae6047d4051cca'
    AND source_url = v_official_url
    AND gtin IS NULL
    AND package_size = '';

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
      v_old_canonical_key,
      v_canonical_id,
      v_canonical_identity_hash,
      'manual_review',
      v_official_url,
      jsonb_build_object(
        'reason', 'legacy manufacturer identity trusted the misrouted wet URL path and omitted the visible Born Carnivore Baby dry line',
        'official_page_sha256', v_page_sha256,
        'food_form_boundary', 'dry',
        'species_boundary', 'cat',
        'life_stage_boundary', 'kitten',
        'recipe_boundary', 'chicken and egg',
        'ingredient_statement_match', TRUE,
        'reviewed_at', v_captured_at
      ),
      NOW()
    ),
    (
      v_old_official_key,
      v_canonical_id,
      v_canonical_identity_hash,
      'manual_review',
      v_official_url,
      jsonb_build_object(
        'reason', 'duplicate exact manufacturer formula with unknown food form',
        'official_page_sha256', v_page_sha256,
        'food_form_boundary', 'dry',
        'ingredient_statement_match', TRUE,
        'reviewed_at', v_captured_at
      ),
      NOW()
    ),
    (
      v_petsmart_key,
      v_canonical_id,
      v_canonical_identity_hash,
      'manual_review',
      v_petsmart_url,
      jsonb_build_object(
        'reason', 'exact PetSmart Chicken & Egg dry kitten package has the same normalized 43-ingredient formula as the current manufacturer page',
        'retailer_source_version_retained', TRUE,
        'retailer_cache_key', v_petsmart_cache,
        'retailer_gtin', v_gtin,
        'retailer_image_url', v_petsmart_image,
        'ingredient_statement_match', TRUE,
        'package_size_is_sku_only', TRUE,
        'reviewed_at', v_captured_at
      ),
      NOW()
    ),
    (
      v_chewy_key,
      v_canonical_id,
      v_canonical_identity_hash,
      'manual_review',
      v_chewy_url,
      jsonb_build_object(
        'reason', 'exact Chewy Born Carnivore Baby Chicken & Egg dry kitten title and matching 2.8 lb package image identify the current manufacturer formula',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer_product_id', '285541',
        'retailer_image_url', 'https://image.chewy.com/catalog/general/images/tiki-cat-born-carnivore-baby-chicken-egg-recipe-non-gmo-kitten-dry-cat-food-2-8lb-bag/img-666999._V1_.jpg',
        'official_source_url', v_official_url,
        'food_form_boundary', 'dry',
        'species_boundary', 'cat',
        'life_stage_boundary', 'kitten',
        'recipe_boundary', 'chicken and egg',
        'package_size_is_sku_only', TRUE,
        'reviewed_at', v_captured_at
      ),
      NOW()
    )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = EXCLUDED.formula_id,
      identity_hash = EXCLUDED.identity_hash,
      match_reason = EXCLUDED.match_reason,
      source_url = EXCLUDED.source_url,
      metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
      updated_at = NOW()
  WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

  UPDATE public.catalog_formulas
  SET formula_key = v_canonical_key,
      manufacturer = 'Whitebridge Pet Brands',
      brand = 'Tiki Cat',
      product_name =
        'Tiki Cat Born Carnivore Baby Kitten Health Deboned Chicken & Egg Recipe',
      product_line = 'Born Carnivore Baby',
      pet_type = 'cat',
      life_stage = 'kitten',
      food_form = 'dry',
      flavor = 'Chicken & Egg Recipe',
      diet_condition = '',
      complete_food_evidence =
        'Current exact Tiki manufacturer PDP shows the Born Carnivore Baby Chicken & Egg kitten formula in 2.8/5.6 lb dry bags with a full ingredient statement, guaranteed analysis, feeding guidance, and matching dry-package image. The legacy wet URL path is contradicted by product-local dry taxonomy and package evidence.',
      protected_terms = ARRAY[
        'Tiki Cat',
        'Born Carnivore',
        'Baby',
        'Kitten Health',
        'Deboned Chicken',
        'Egg',
        'Chicken & Egg Recipe',
        'kitten',
        'dry'
      ]::TEXT[],
      identity_hash = v_canonical_identity_hash,
      source_url = v_official_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      verification_status = 'verified',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'version_status', 'manufacturer_current',
          'source', 'tiki-pets',
          'source_url', v_official_url,
          'captured_at', v_captured_at,
          'official_page_sha256', v_page_sha256,
          'ingredient_text_hash',
            encode(digest(ingredient_text, 'sha256'), 'hex'),
          'normalized_ingredient_text_hash',
            encode(
              digest(
                public.catalog_normalize_ingredient_evidence(ingredient_text),
                'sha256'
              ),
              'hex'
            ),
          'front_image_url', v_official_image,
          'exact_formula_evidence', TRUE,
          'food_form', 'dry',
          'food_form_evidence',
            'exact product wrapper taxonomy, 2.8/5.6 lb bag sizes, and front bag image',
          'legacy_url_path_misclassified_food_form', TRUE,
          'package_size_is_sku_only', TRUE,
          'petsmart_exact_version_gtin', v_gtin,
          'petsmart_ingredient_statement_match', TRUE,
          'chewy_identity_only_product_id', '285541'
        ),
      active = TRUE,
      is_popular_brand = TRUE,
      last_observed_at = GREATEST(last_observed_at, v_captured_at),
      absent_since = NULL,
      promoted_cache_key = v_official_cache,
      promoted_at = COALESCE(promoted_at, NOW()),
      updated_at = NOW()
  WHERE id = v_canonical_id;

  UPDATE public.catalog_formulas
  SET verification_status = 'quarantined',
      active = FALSE,
      absent_since = COALESCE(absent_since, NOW()),
      promoted_cache_key = NULL,
      promoted_at = NULL,
      complete_food_evidence =
        'Exact duplicate identity reconciled to the canonical Tiki Cat Born Carnivore Baby Chicken & Egg dry kitten formula.',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'duplicate_of_formula_id', v_canonical_id,
          'canonical_formula_key', v_canonical_key,
          'ingredient_or_image_rewrite', FALSE,
          'reconciled_at', v_captured_at
        ),
      updated_at = NOW()
  WHERE id IN (v_legacy_official_id, v_petsmart_id, v_chewy_id);

  -- Correct only structured serving identity; retain the exact ingredient text,
  -- image, evidence tier, and source-specific package version on both rows.
  UPDATE public.product_data
  SET product_name =
        'Tiki Cat Born Carnivore Baby Kitten Health Deboned Chicken & Egg Recipe',
      product_line = 'Born Carnivore Baby',
      flavor = 'Chicken & Egg Recipe',
      pet_type = 'cat',
      life_stage = 'kitten',
      food_form = 'dry',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'version_status', 'manufacturer_current',
          'source_url', v_official_url,
          'captured_at', v_captured_at,
          'official_page_sha256', v_page_sha256,
          'food_form', 'dry',
          'food_form_evidence',
            'exact product wrapper taxonomy, 2.8/5.6 lb bag sizes, and front bag image',
          'legacy_url_path_misclassified_food_form', TRUE,
          'canonical_formula_id', v_canonical_id,
          'canonical_formula_key', v_canonical_key
        ),
      updated_at = NOW()
  WHERE cache_key = v_official_cache;

  UPDATE public.product_data
  SET product_line = 'Born Carnivore Baby',
      flavor = 'Chicken & Egg Recipe',
      pet_type = 'cat',
      life_stage = 'kitten',
      food_form = 'dry',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'canonical_formula_id', v_canonical_id,
          'canonical_formula_key', v_canonical_key,
          'current_manufacturer_source_url', v_official_url,
          'manufacturer_ingredient_statement_match', TRUE,
          'package_gtin', v_gtin,
          'retailer_source_version_retained', TRUE,
          'reconciled_at', v_captured_at
        ),
      updated_at = NOW()
  WHERE cache_key = v_petsmart_cache;

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
  ) VALUES
    (
      v_canonical_id,
      NULL,
      'official_food_form_identity',
      jsonb_build_object(
        'food_form', 'dry',
        'product_line', 'Born Carnivore Baby',
        'recipe', 'Chicken & Egg Recipe',
        'life_stage', 'kitten',
        'official_page_sha256', v_page_sha256,
        'front_image_url', v_official_image,
        'package_sizes', jsonb_build_array('2.8 lb', '5.6 lb'),
        'legacy_url_path_misclassified_food_form', TRUE,
        'ingredient_or_image_rewrite', FALSE
      ),
      v_official_url,
      'manufacturer',
      TRUE,
      v_captured_at,
      encode(
        digest(
          v_canonical_id::TEXT || '|official_food_form_identity|' ||
          v_official_url || '|' || v_page_sha256 || '|dry',
          'sha256'
        ),
        'hex'
      )
    ),
    (
      v_canonical_id,
      v_latest_chewy_observation,
      'retailer_exact_formula_identity_alias',
      jsonb_build_object(
        'retailer', 'Chewy',
        'retailer_product_id', '285541',
        'retailer_title',
          'Tiki Cat Born Carnivore Baby Chicken & Egg Recipe Grain-Free Kitten Dry Cat Food',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'front_image_url',
          'https://image.chewy.com/catalog/general/images/tiki-cat-born-carnivore-baby-chicken-egg-recipe-non-gmo-kitten-dry-cat-food-2-8lb-bag/img-666999._V1_.jpg',
        'official_source_url', v_official_url,
        'canonical_formula_key', v_canonical_key,
        'ingredient_or_image_rewrite', FALSE
      ),
      v_chewy_url,
      'retailer_identity',
      TRUE,
      (
        SELECT observed_at
        FROM public.catalog_observations
        WHERE id = v_latest_chewy_observation
      ),
      encode(
        digest(
          v_canonical_id::TEXT || '|chewy_identity|285541|' || v_chewy_url ||
          '|' || v_official_ingredient_md5,
          'sha256'
        ),
        'hex'
      )
    ),
    (
      v_canonical_id,
      v_petsmart_observation,
      'retailer_exact_formula_version_match',
      jsonb_build_object(
        'retailer', 'PetSmart',
        'retailer_gtin', v_gtin,
        'retailer_cache_key', v_petsmart_cache,
        'retailer_source_version_retained', TRUE,
        'normalized_ingredient_statement_match', TRUE,
        'retailer_front_image_url', v_petsmart_image,
        'official_source_url', v_official_url,
        'canonical_formula_key', v_canonical_key,
        'ingredient_or_image_rewrite', FALSE
      ),
      v_petsmart_url,
      'retailer_verified',
      TRUE,
      '2026-07-16T21:07:41.892Z'::TIMESTAMPTZ,
      encode(
        digest(
          v_canonical_id::TEXT || '|petsmart_version_match|' || v_gtin || '|' ||
          v_petsmart_url || '|' || v_petsmart_ingredient_md5,
          'sha256'
        ),
        'hex'
      )
    )
  ON CONFLICT (formula_id, field_name, source_url, content_hash)
  DO UPDATE SET
    observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = TRUE,
    observed_at = EXCLUDED.observed_at;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases
    WHERE active
      AND normalized_alias IN (
        public.normalize_verified_product_search_query(
          'Tiki Cat Born Carnivore Baby Kitten Health Deboned Chicken & Egg Recipe Dry Cat Food'
        ),
        public.normalize_verified_product_search_query(
          'Tiki Cat Born Carnivore Baby Chicken & Egg Recipe Grain-Free Kitten Dry Cat Food'
        )
      )
      AND cache_key <> v_official_cache
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby search alias belongs to another product';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance,
    active,
    updated_at
  ) VALUES
    (
      v_official_cache,
      'Tiki Cat Born Carnivore Baby Kitten Health Deboned Chicken & Egg Recipe Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Tiki Cat Born Carnivore Baby Kitten Health Deboned Chicken & Egg Recipe Dry Cat Food'
      ),
      v_official_url,
      'manufacturer',
      v_captured_at,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'manufacturer_current', TRUE,
        'canonical_formula_id', v_canonical_id,
        'canonical_formula_key', v_canonical_key,
        'species_boundary', 'cat',
        'life_stage_boundary', 'kitten',
        'food_form_boundary', 'dry',
        'recipe_boundary', 'chicken and egg',
        'official_page_sha256', v_page_sha256
      ),
      TRUE,
      NOW()
    ),
    (
      v_official_cache,
      'Tiki Cat Born Carnivore Baby Chicken & Egg Recipe Grain-Free Kitten Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Tiki Cat Born Carnivore Baby Chicken & Egg Recipe Grain-Free Kitten Dry Cat Food'
      ),
      v_chewy_url,
      'retailer_identity',
      (
        SELECT observed_at
        FROM public.catalog_observations
        WHERE id = v_latest_chewy_observation
      ),
      jsonb_build_object(
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer', 'Chewy',
        'retailer_product_id', '285541',
        'retailer_source_url', v_chewy_url,
        'official_source_url', v_official_url,
        'canonical_formula_id', v_canonical_id,
        'canonical_formula_key', v_canonical_key,
        'species_boundary', 'cat',
        'life_stage_boundary', 'kitten',
        'food_form_boundary', 'dry',
        'recipe_boundary', 'chicken and egg',
        'ingredient_or_image_rewrite', FALSE
      ),
      TRUE,
      NOW()
    )
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance =
        public.catalog_verified_product_search_aliases.provenance ||
        EXCLUDED.provenance,
      updated_at = NOW()
  WHERE public.catalog_verified_product_search_aliases.cache_key =
        EXCLUDED.cache_key;

  -- Keep the earlier official title alias but correct its identity provenance.
  UPDATE public.catalog_verified_product_search_aliases
  SET provenance = COALESCE(provenance, '{}'::JSONB) || jsonb_build_object(
        'canonical_formula_id', v_canonical_id,
        'canonical_formula_key', v_canonical_key,
        'food_form_boundary', 'dry',
        'legacy_url_path_misclassified_food_form', TRUE,
        'official_page_sha256', v_page_sha256
      ),
      evidence_observed_at = GREATEST(evidence_observed_at, v_captured_at),
      updated_at = NOW()
  WHERE cache_key = v_official_cache
    AND normalized_alias = public.normalize_verified_product_search_query(
      'Kitten Health: Deboned Chicken & Egg Recipe'
    )
    AND source_url = v_official_url
    AND active;

  -- Exact postconditions: one canonical formula, all evidence retained, one
  -- active official SKU identity, current serving search, and exact GTIN safety.
  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE id IN (
      v_canonical_id,
      v_legacy_official_id,
      v_petsmart_id,
      v_chewy_id
    )
      AND active
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_canonical_id
      AND formula_key = v_canonical_key
      AND product_line = 'Born Carnivore Baby'
      AND pet_type = 'cat'
      AND life_stage = 'kitten'
      AND food_form = 'dry'
      AND flavor = 'Chicken & Egg Recipe'
      AND md5(ingredient_text) = v_official_ingredient_md5
      AND front_image_url = v_official_image
      AND verification_status = 'verified'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND promoted_cache_key = v_official_cache
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby canonical formula postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE formula_id IN (v_legacy_official_id, v_petsmart_id, v_chewy_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_field_evidence
    WHERE formula_id IN (v_legacy_official_id, v_petsmart_id, v_chewy_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id IN (v_legacy_official_id, v_petsmart_id, v_chewy_id)
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby duplicate evidence was not consolidated';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key IN (
      v_old_canonical_key,
      v_old_official_key,
      v_petsmart_key,
      v_chewy_key
    )
      AND formula_id = v_canonical_id
  ) <> 4 THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby formula aliases incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_canonical_id
      AND active
      AND source_slug = 'tiki-pets'
      AND source_url = v_official_url
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = v_canonical_id
      AND active
      AND source_slug = 'petsmart-retail-catalog'
      AND gtin = v_gtin
      AND package_size = '5.6 lb'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = v_canonical_id
      AND active
      AND source_slug = 'chewy-public-sitemap'
      AND source_external_id = '285541'
      AND source_url = v_chewy_url
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby SKU consolidation failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_official_cache
      AND product_line = 'Born Carnivore Baby'
      AND flavor = 'Chicken & Egg Recipe'
      AND pet_type = 'cat'
      AND life_stage = 'kitten'
      AND food_form = 'dry'
      AND md5(ingredient_text) = v_official_ingredient_md5
      AND image_url = v_official_image
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND catalog_exclusion_reason IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_petsmart_cache
      AND product_line = 'Born Carnivore Baby'
      AND flavor = 'Chicken & Egg Recipe'
      AND gtin = v_gtin
      AND food_form = 'dry'
      AND md5(ingredient_text) = v_petsmart_ingredient_md5
      AND image_url = v_petsmart_image
      AND formula_evidence_tier = 'retailer_web_version'
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Tiki Born Carnivore Baby serving metadata repair failed';
  END IF;

  SELECT cache_key
  INTO v_top
  FROM public.search_verified_products(
    'Tiki Cat Born Carnivore Baby Chicken & Egg Recipe Grain-Free Kitten Dry Cat Food',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;

  IF v_top IS DISTINCT FROM v_official_cache THEN
    RAISE EXCEPTION 'Tiki Chewy exact title search returned %', v_top;
  END IF;

  SELECT cache_key
  INTO v_top
  FROM public.search_verified_products(
    'Tiki Cat Born Carnivore Baby Kitten Health Deboned Chicken & Egg Recipe Dry Cat Food',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;

  IF v_top IS DISTINCT FROM v_official_cache THEN
    RAISE EXCEPTION 'Tiki official exact title search returned %', v_top;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.search_verified_products(
      'Tiki Cat Born Carnivore Baby Chicken & Egg Recipe Grain-Free Kitten Dry Cat Food',
      8
    )
    WHERE cache_key <> v_official_cache
       OR pet_type <> 'cat'
       OR life_stage <> 'kitten'
       OR food_form <> 'dry'
  ) THEN
    RAISE EXCEPTION 'Tiki exact dry kitten title exposed an incompatible sibling';
  END IF;

  SELECT *
  INTO STRICT v_resolved
  FROM public.resolve_verified_product_by_gtin(v_gtin, 8);

  -- At this migration boundary the existing safe resolver follows the
  -- canonical formula's preferred current-manufacturer serving row. The next
  -- migration adds exact-package preference after it proves all ingredient
  -- versions for the GTIN agree.
  IF v_resolved.cache_key IS DISTINCT FROM v_official_cache
     OR v_resolved.pet_type IS DISTINCT FROM 'cat'
     OR v_resolved.life_stage IS DISTINCT FROM 'kitten'
     OR v_resolved.food_form IS DISTINCT FROM 'dry'
  THEN
    RAISE EXCEPTION
      'Tiki Born Carnivore Baby GTIN resolved incompatible row %',
      v_resolved.cache_key;
  END IF;

  IF (
    SELECT public.catalog_normalize_ingredient_evidence(gtin_row.ingredient_text)
         = public.catalog_normalize_ingredient_evidence(official.ingredient_text)
    FROM public.product_data gtin_row
    CROSS JOIN public.product_data official
    WHERE gtin_row.cache_key = v_petsmart_cache
      AND official.cache_key = v_official_cache
  ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Tiki exact GTIN package no longer matches official ingredients';
  END IF;
END
$migration$;
