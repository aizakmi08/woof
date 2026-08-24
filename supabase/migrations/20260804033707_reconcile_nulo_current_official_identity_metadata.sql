-- Repair four current official Nulo formulas whose ingredient/image evidence
-- is already exact, but whose older serving/canonical identity metadata was
-- parsed from legacy package wording. The August 3 official-page cache proves
-- the current line, complete visible recipe, life stage, and food form.
--
-- This migration does not copy ingredients between products, invent GTINs,
-- or merge the legacy FreeStyle stews into the current MedalSeries packages.
-- The two lines have identical ingredient statements but distinct official
-- URLs and front images, so they remain separate source/package identities.

DO $$
DECLARE
  v_target RECORD;
  v_identity_hash TEXT;
  v_top TEXT;
BEGIN
  FOR v_target IN
    SELECT *
    FROM (
      VALUES
        (
          6558::BIGINT,
          6996::BIGINT,
          6456::BIGINT,
          'nulo|nulo|medalseries and mackerel|cat|kitten|wet||',
          'nulo|nulo|medalseries signature stews mackerel|cat|all life stages|wet|shrimp and mussels recipe|',
          'nulo|nulo|medalseries signature stews|cat|all life stages|wet|mackerel shrimp and mussels recipe|',
          'nulo:nulo medalseries cat kitten mackerel shrimp mussel stew',
          'https://nulo.com/products/medalseries-signature-stews-mackerel-shrimp-mussels-recipe-for-cats',
          'MedalSeries Signature Stews Mackerel, Shrimp & Mussels Recipe for Cats',
          'MedalSeries Signature Stews',
          'cat',
          'all life stages',
          'wet',
          'Mackerel, Shrimp & Mussels Recipe',
          'medalseries and mackerel',
          'kitten',
          'wet',
          '',
          35,
          '7c01d91d6a3279b23a1cd08fbdc976f20f3592cb88dc13f7fd15ef1b63a01bf7',
          'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/h6bxpxqhl33ebe0qzpgm.png?v=1776774846&width=1200&height=630&quality=60',
          '0bbf7292d1e8ca5146a1230f38df4b034ba96ecf3b7f72376312fecc7d8fa910',
          '2026-08-03 06:43:26.665+00'::TIMESTAMPTZ,
          ARRAY[]::TEXT[]
        ),
        (
          6559::BIGINT,
          6997::BIGINT,
          6457::BIGINT,
          'nulo|nulo|medalseries and yellowfin|cat|kitten|wet|tuna and crab stew|',
          'nulo|nulo|medalseries signature stews yellowfin|cat|all life stages|wet|tuna and crab recipe|',
          'nulo|nulo|medalseries signature stews|cat|all life stages|wet|yellowfin tuna and crab recipe|',
          'nulo:nulo medalseries cat kitten yellowfin tuna crab stew',
          'https://nulo.com/products/medalseries-signature-stews-yellowfin-tuna-crab-recipe-for-cats',
          'MedalSeries Signature Stews Yellowfin Tuna & Crab Recipe for Cats',
          'MedalSeries Signature Stews',
          'cat',
          'all life stages',
          'wet',
          'Yellowfin Tuna & Crab Recipe',
          'medalseries and yellowfin',
          'kitten',
          'wet',
          'tuna and crab stew',
          35,
          '16a1225ec28472c6d73a51633523518ea852b615030c5d7ee8a6ec3bf8587ec3',
          'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/isao3tvfcmabch6hvspi.png?v=1776774832&width=1200&height=630&quality=60',
          '39d86f8db336c7420ee75e16ee7eca84a0eec28ec75e97fc2f9465d15bf82126',
          '2026-08-03 06:43:27.035+00'::TIMESTAMPTZ,
          ARRAY[]::TEXT[]
        ),
        (
          6598::BIGINT,
          7026::BIGINT,
          NULL::BIGINT,
          'nulo|nulo|small breed pate for and adult|dog|puppy|wet|salmon and pumpkin recipe|',
          'nulo|nulo|pate small breed|dog|all life stages|wet|salmon and pumpkin recipe|',
          'nulo|nulo|pate small breed|dog|all life stages|wet|chicken salmon and pumpkin recipe|',
          'nulo:nulo nulo small breed pate for puppy adult chicken salmon pumpkin recipe',
          'https://nulo.com/products/pate-small-breed-chicken-salmon-pumpkin-recipe-for-dogs',
          'Paté Small Breed Chicken, Salmon & Pumpkin Recipe for Dogs',
          'Paté Small Breed',
          'dog',
          'all life stages',
          'wet',
          'Chicken, Salmon & Pumpkin Recipe',
          'small breed pate for and adult',
          'puppy',
          'wet',
          'salmon and pumpkin recipe',
          40,
          'e753529fa8dfa9e6e4a54d1b90db8de13739fb24956386d57722dd93affb32e2',
          'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/vv1wc0mjia5zijm5wehu.png?v=1776774827&width=1200&height=630&quality=60',
          '8f02186078c04a7bccd4f96630b4ce63bd7bae01f1a20dc89f37e3eb046c84a4',
          '2026-08-03 06:43:38.808+00'::TIMESTAMPTZ,
          ARRAY[]::TEXT[]
        ),
        (
          6591::BIGINT,
          7037::BIGINT,
          NULL::BIGINT,
          'nulo|nulo|prowess all in one essentials for adult cats and kittens|cat|kitten|unknown||',
          'nulo|nulo|prowess all in one essentials recipe with|cat|all life stages|unknown|chicken|',
          'nulo|nulo|prowess all in one essentials|cat|all life stages|dry|chicken|',
          'nulo:nulo nulo prowess all-in-one essentials for adult cats kittens',
          'https://nulo.com/products/prowess-all-in-one-essentials-recipe-chicken-for-cats',
          'Prowess All-in-One Essentials Recipe with Chicken for Cats',
          'Prowess All-in-One Essentials',
          'cat',
          'all life stages',
          'dry',
          'Chicken',
          'prowess all in one essentials for adult cats and kittens',
          'kitten',
          'unknown',
          '',
          46,
          '65764db208ef8f78b80e715f54c360186fa7a2fcabd87b7168f6f94475151818',
          'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/cxobvjxv26vfb8vocuc8.png?v=1776774888&width=1200&height=630&quality=60',
          'a5fb9251c67e4b7bfaa4f0b1456a8af14d08fbd32e1a88c71d63b2941ac9f122',
          '2026-08-03 06:43:47.433+00'::TIMESTAMPTZ,
          ARRAY[
            'Adult', 'Cat', 'Chicken', 'Crunchy', 'Functional',
            'Grain Inclusive', 'Kibble', 'Kitten', 'Prowess'
          ]::TEXT[]
        )
    ) AS target(
      formula_id,
      observation_id,
      legacy_formula_id,
      old_formula_key,
      parser_alias_key,
      new_formula_key,
      cache_key,
      source_url,
      official_product_name,
      new_product_line,
      pet_type,
      new_life_stage,
      new_food_form,
      new_flavor,
      old_product_line,
      old_life_stage,
      old_food_form,
      old_flavor,
      ingredient_count,
      ingredient_hash,
      front_image_url,
      page_hash,
      captured_at,
      structured_tags
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.catalog_formulas
      WHERE id = v_target.formula_id
        AND formula_key = v_target.old_formula_key
        AND source_url = v_target.source_url
        AND active
        AND verification_status = 'verified'
        AND formula_evidence_tier = 'manufacturer_current_exact'
        AND promoted_cache_key IS NULL
        AND lower(product_line) = v_target.old_product_line
        AND lower(life_stage) = v_target.old_life_stage
        AND lower(food_form) = v_target.old_food_form
        AND lower(COALESCE(flavor, '')) = v_target.old_flavor
        AND pet_type = v_target.pet_type
        AND cardinality(ingredients) = v_target.ingredient_count
        AND front_image_url = v_target.front_image_url
        AND encode(digest(ingredient_text, 'sha256'), 'hex') =
            v_target.ingredient_hash
    ) THEN
      RAISE EXCEPTION
        'Nulo formula % exact precondition changed', v_target.formula_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_formulas
      WHERE formula_key = v_target.new_formula_key
        AND id <> v_target.formula_id
    ) THEN
      RAISE EXCEPTION
        'Nulo corrected formula key already belongs to another formula: %',
        v_target.new_formula_key;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.product_data
      WHERE cache_key = v_target.cache_key
        AND lower(brand) = 'nulo'
        AND source_url = v_target.source_url
        AND source_quality = 'manufacturer'
        AND ingredient_verification_status = 'manufacturer'
        AND image_verification_status = 'manufacturer'
        AND formula_evidence_tier = 'manufacturer_current_exact'
        AND is_complete_food
        AND catalog_exclusion_reason IS NULL
        AND pet_type = v_target.pet_type
        AND public.normalize_verified_product_search_query(product_line) =
            public.normalize_verified_product_search_query(
              v_target.old_product_line
            )
        AND lower(life_stage) = v_target.old_life_stage
        AND COALESCE(lower(food_form), 'unknown') = v_target.old_food_form
        AND public.normalize_verified_product_search_query(
              COALESCE(flavor, '')
            ) IS NOT DISTINCT FROM
            public.normalize_verified_product_search_query(
              v_target.old_flavor
            )
        AND ingredient_count = v_target.ingredient_count
        AND image_url = v_target.front_image_url
        AND encode(digest(ingredient_text, 'sha256'), 'hex') =
            v_target.ingredient_hash
    ) THEN
      RAISE EXCEPTION
        'Nulo serving row exact precondition changed: %', v_target.cache_key;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.catalog_observations
      WHERE id = v_target.observation_id
        AND formula_id = v_target.formula_id
        AND source_url = v_target.source_url
        AND validation_status = 'accepted'
        AND formula_evidence_tier = 'manufacturer_current_exact'
        AND pet_type = v_target.pet_type
        AND lower(product_line) = v_target.old_product_line
        AND lower(life_stage) = v_target.old_life_stage
        AND lower(food_form) = v_target.old_food_form
        AND lower(COALESCE(flavor, '')) = v_target.old_flavor
        AND front_image_url = v_target.front_image_url
        AND encode(digest(ingredient_text, 'sha256'), 'hex') =
            v_target.ingredient_hash
    ) THEN
      RAISE EXCEPTION
        'Nulo observation exact precondition changed: %',
        v_target.observation_id;
    END IF;

    IF v_target.legacy_formula_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_formulas
      WHERE id = v_target.legacy_formula_id
        AND active
        AND verification_status = 'verified'
        AND formula_evidence_tier = 'manufacturer_current_exact'
        AND product_line = 'freestyle signature stews'
        AND pet_type = 'cat'
        AND life_stage = 'all life stages'
        AND food_form = 'wet'
        AND promoted_cache_key IS NOT NULL
        AND source_url <> v_target.source_url
        AND front_image_url <> v_target.front_image_url
        AND encode(digest(ingredient_text, 'sha256'), 'hex') =
            v_target.ingredient_hash
    ) THEN
      RAISE EXCEPTION
        'Nulo distinct FreeStyle package evidence changed for formula %',
        v_target.formula_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_formula_aliases
      WHERE alias_formula_key IN (
        v_target.old_formula_key,
        v_target.parser_alias_key
      )
        AND formula_id <> v_target.formula_id
    ) THEN
      RAISE EXCEPTION
        'Nulo identity alias already maps to another formula: %',
        v_target.new_formula_key;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_verified_product_search_aliases
      WHERE active
        AND normalized_alias IN (
          public.normalize_verified_product_search_query(
            v_target.official_product_name
          ),
          public.normalize_verified_product_search_query(
            'Nulo ' || v_target.official_product_name
          )
        )
        AND cache_key <> v_target.cache_key
    ) THEN
      RAISE EXCEPTION
        'Nulo exact search alias already belongs to another serving row: %',
        v_target.official_product_name;
    END IF;

    UPDATE public.product_data
    SET product_name = v_target.official_product_name,
        brand = 'Nulo',
        product_line = v_target.new_product_line,
        pet_type = v_target.pet_type,
        life_stage = v_target.new_life_stage,
        food_form = v_target.new_food_form,
        flavor = v_target.new_flavor,
        scraped_at = v_target.captured_at,
        expires_at = v_target.captured_at + INTERVAL '365 days',
        verified_at = now(),
        formula_version_provenance =
          COALESCE(formula_version_provenance, '{}'::JSONB)
          || jsonb_build_object(
            'identity_reconciliation', jsonb_build_object(
              'status', 'exact_current_official_identity_repaired',
              'source_url', v_target.source_url,
              'source_page_sha256', v_target.page_hash,
              'source_captured_at', v_target.captured_at,
              'old_formula_key', v_target.old_formula_key,
              'canonical_formula_key', v_target.new_formula_key,
              'structured_product_tags', to_jsonb(v_target.structured_tags),
              'reconciled_at', now()
            )
          ),
        updated_at = now()
    WHERE cache_key = v_target.cache_key;

    UPDATE public.catalog_formulas
    SET formula_key = v_target.new_formula_key,
        product_name = v_target.official_product_name,
        product_line = v_target.new_product_line,
        pet_type = v_target.pet_type,
        life_stage = v_target.new_life_stage,
        food_form = v_target.new_food_form,
        flavor = v_target.new_flavor,
        protected_terms = ARRAY(
          SELECT DISTINCT lower(term)
          FROM unnest(
            COALESCE(protected_terms, ARRAY[]::TEXT[])
            || ARRAY[
              'nulo', v_target.new_product_line, v_target.new_flavor,
              v_target.pet_type, v_target.new_life_stage,
              v_target.new_food_form
            ]::TEXT[]
          ) AS term
          WHERE trim(term) <> ''
        ),
        promoted_cache_key = v_target.cache_key,
        promoted_at = now(),
        identity_hash = encode(
          digest(v_target.new_formula_key, 'sha256'),
          'hex'
        ),
        last_observed_at = v_target.captured_at,
        formula_version_provenance =
          COALESCE(formula_version_provenance, '{}'::JSONB)
          || jsonb_build_object(
            'identity_reconciliation', jsonb_build_object(
              'status', 'exact_current_official_identity_repaired',
              'source_url', v_target.source_url,
              'source_page_sha256', v_target.page_hash,
              'source_captured_at', v_target.captured_at,
              'old_formula_key', v_target.old_formula_key,
              'parser_alias_key', v_target.parser_alias_key,
              'canonical_formula_key', v_target.new_formula_key,
              'structured_product_tags', to_jsonb(v_target.structured_tags),
              'reconciled_at', now()
            )
          ),
        updated_at = now()
    WHERE id = v_target.formula_id;

    SELECT identity_hash
    INTO STRICT v_identity_hash
    FROM public.catalog_formulas
    WHERE id = v_target.formula_id
      AND formula_key = v_target.new_formula_key
      AND promoted_cache_key = v_target.cache_key;

    UPDATE public.catalog_observations
    SET product_name = v_target.official_product_name,
        product_line = v_target.new_product_line,
        pet_type = v_target.pet_type,
        life_stage = v_target.new_life_stage,
        food_form = v_target.new_food_form,
        flavor = v_target.new_flavor,
        observed_at = v_target.captured_at,
        content_hash = encode(
          digest(
            v_target.new_formula_key || '|' || ingredient_text || '|'
            || front_image_url || '|' || v_target.page_hash,
            'sha256'
          ),
          'hex'
        ),
        validation_status = 'accepted',
        validation_reasons = ARRAY[]::TEXT[],
        raw_payload = COALESCE(raw_payload, '{}'::JSONB)
          || jsonb_build_object(
            'identity_reconciliation', jsonb_build_object(
              'status', 'exact_current_official_identity_repaired',
              'old_formula_key', v_target.old_formula_key,
              'canonical_formula_key', v_target.new_formula_key,
              'source_page_sha256', v_target.page_hash,
              'source_captured_at', v_target.captured_at,
              'structured_product_tags', to_jsonb(v_target.structured_tags)
            )
          ),
        formula_version_provenance =
          COALESCE(formula_version_provenance, '{}'::JSONB)
          || jsonb_build_object(
            'identity_reconciled', TRUE,
            'canonical_formula_key', v_target.new_formula_key,
            'source_page_sha256', v_target.page_hash
          )
    WHERE id = v_target.observation_id;

    INSERT INTO public.catalog_formula_aliases (
      alias_formula_key,
      formula_id,
      identity_hash,
      match_reason,
      source_url,
      metadata,
      updated_at
    )
    SELECT
      alias_key,
      v_target.formula_id,
      v_identity_hash,
      'manual_review',
      v_target.source_url,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'canonical_formula_key', v_target.new_formula_key,
        'consumer_brand_boundary', 'nulo',
        'species_boundary', v_target.pet_type,
        'life_stage_boundary', v_target.new_life_stage,
        'food_form_boundary', v_target.new_food_form,
        'recipe_boundary', v_target.new_flavor,
        'ingredient_text_hash', v_target.ingredient_hash,
        'front_image_url', v_target.front_image_url,
        'source_page_sha256', v_target.page_hash,
        'reviewed_at', now()
      ),
      now()
    FROM unnest(ARRAY[
      v_target.old_formula_key,
      v_target.parser_alias_key
    ]::TEXT[]) AS alias_key
    ON CONFLICT (alias_formula_key) DO UPDATE
    SET formula_id = excluded.formula_id,
        identity_hash = excluded.identity_hash,
        match_reason = excluded.match_reason,
        source_url = excluded.source_url,
        metadata = excluded.metadata,
        updated_at = now();

    INSERT INTO public.catalog_verified_product_search_aliases (
      cache_key,
      alias_text,
      normalized_alias,
      source_url,
      source_authority,
      evidence_observed_at,
      provenance,
      updated_at
    )
    SELECT
      v_target.cache_key,
      alias_text,
      public.normalize_verified_product_search_query(alias_text),
      v_target.source_url,
      'manufacturer',
      v_target.captured_at,
      jsonb_build_object(
        'source', 'nulo_current_official_identity_reconciliation',
        'formula_id', v_target.formula_id,
        'canonical_formula_key', v_target.new_formula_key,
        'ingredient_text_hash', v_target.ingredient_hash,
        'source_page_sha256', v_target.page_hash,
        'species_boundary', v_target.pet_type,
        'life_stage_boundary', v_target.new_life_stage,
        'food_form_boundary', v_target.new_food_form,
        'recipe_boundary', v_target.new_flavor
      ),
      now()
    FROM (
      VALUES
        (v_target.official_product_name),
        ('Nulo ' || v_target.official_product_name)
    ) AS aliases(alias_text)
    ON CONFLICT (normalized_alias) WHERE active DO UPDATE
    SET cache_key = excluded.cache_key,
        alias_text = excluded.alias_text,
        source_url = excluded.source_url,
        source_authority = excluded.source_authority,
        evidence_observed_at = excluded.evidence_observed_at,
        provenance = excluded.provenance,
        updated_at = now();

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
    ) VALUES (
      v_target.formula_id,
      v_target.observation_id,
      'canonical_identity_reconciliation',
      jsonb_build_object(
        'old_formula_key', v_target.old_formula_key,
        'parser_alias_key', v_target.parser_alias_key,
        'canonical_formula_key', v_target.new_formula_key,
        'product_name', v_target.official_product_name,
        'product_line', v_target.new_product_line,
        'pet_type', v_target.pet_type,
        'life_stage', v_target.new_life_stage,
        'food_form', v_target.new_food_form,
        'flavor', v_target.new_flavor,
        'ingredient_text_hash', v_target.ingredient_hash,
        'front_image_url', v_target.front_image_url,
        'source_page_sha256', v_target.page_hash,
        'structured_product_tags', to_jsonb(v_target.structured_tags)
      ),
      v_target.source_url,
      'manufacturer',
      TRUE,
      v_target.captured_at,
      encode(
        digest(
          v_target.formula_id::TEXT || '|canonical_identity_reconciliation|'
          || v_target.new_formula_key || '|' || v_target.page_hash,
          'sha256'
        ),
        'hex'
      )
    )
    ON CONFLICT (
      formula_id,
      field_name,
      source_url,
      content_hash
    ) DO UPDATE
    SET observation_id = excluded.observation_id,
        field_value = excluded.field_value,
        source_authority = excluded.source_authority,
        accepted = TRUE,
        observed_at = excluded.observed_at;

    IF v_target.legacy_formula_id IS NOT NULL THEN
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
        v_target.formula_id,
        v_target.observation_id,
        'distinct_product_line_same_ingredient_version',
        jsonb_build_object(
          'not_merged', TRUE,
          'current_formula_id', v_target.formula_id,
          'current_product_line', v_target.new_product_line,
          'current_source_url', v_target.source_url,
          'current_front_image_url', v_target.front_image_url,
          'legacy_formula_id', legacy.id,
          'legacy_product_line', legacy.product_line,
          'legacy_source_url', legacy.source_url,
          'legacy_front_image_url', legacy.front_image_url,
          'shared_ingredient_text_hash', v_target.ingredient_hash,
          'reason',
            'Distinct official product lines and front packages remain separate identities despite identical ingredient text.'
        ),
        v_target.source_url,
        'manufacturer',
        TRUE,
        v_target.captured_at,
        encode(
          digest(
            v_target.formula_id::TEXT || '|distinct_product_line|'
            || legacy.id::TEXT || '|' || v_target.ingredient_hash,
            'sha256'
          ),
          'hex'
        )
      FROM public.catalog_formulas legacy
      WHERE legacy.id = v_target.legacy_formula_id
      ON CONFLICT (
        formula_id,
        field_name,
        source_url,
        content_hash
      ) DO UPDATE
      SET observation_id = excluded.observation_id,
          field_value = excluded.field_value,
          source_authority = excluded.source_authority,
          accepted = TRUE,
          observed_at = excluded.observed_at;
    END IF;

    SELECT cache_key
    INTO v_top
    FROM public.search_verified_products(
      v_target.official_product_name,
      8
    )
    ORDER BY rank DESC
    LIMIT 1;

    IF v_top IS DISTINCT FROM v_target.cache_key THEN
      RAISE EXCEPTION
        'Nulo exact official-name search regression for %: %',
        v_target.official_product_name,
        v_top;
    END IF;

    SELECT cache_key
    INTO v_top
    FROM public.search_verified_products(
      'Nulo ' || v_target.official_product_name,
      8
    )
    ORDER BY rank DESC
    LIMIT 1;

    IF v_top IS DISTINCT FROM v_target.cache_key THEN
      RAISE EXCEPTION
        'Nulo brand-qualified exact search regression for %: %',
        v_target.official_product_name,
        v_top;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.catalog_formulas
      WHERE id = v_target.formula_id
        AND formula_key = v_target.new_formula_key
        AND promoted_cache_key = v_target.cache_key
        AND active
        AND verification_status = 'verified'
        AND product_line = v_target.new_product_line
        AND life_stage = v_target.new_life_stage
        AND food_form = v_target.new_food_form
        AND flavor = v_target.new_flavor
        AND cardinality(ingredients) = v_target.ingredient_count
        AND encode(digest(ingredient_text, 'sha256'), 'hex') =
            v_target.ingredient_hash
    ) THEN
      RAISE EXCEPTION
        'Nulo corrected formula postcondition failed: %',
        v_target.formula_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.product_data
      WHERE cache_key = v_target.cache_key
        AND product_line = v_target.new_product_line
        AND life_stage = v_target.new_life_stage
        AND food_form = v_target.new_food_form
        AND flavor = v_target.new_flavor
        AND ingredient_count = v_target.ingredient_count
        AND image_url = v_target.front_image_url
        AND encode(digest(ingredient_text, 'sha256'), 'hex') =
            v_target.ingredient_hash
        AND catalog_exclusion_reason IS NULL
    ) THEN
      RAISE EXCEPTION
        'Nulo corrected serving-row postcondition failed: %',
        v_target.cache_key;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE id IN (6558, 6559, 6591, 6598)
      AND active
      AND verification_status = 'verified'
      AND promoted_cache_key IS NOT NULL
  ) <> 4 THEN
    RAISE EXCEPTION 'Nulo current official identity wave did not link four formulas';
  END IF;
END
$$;
