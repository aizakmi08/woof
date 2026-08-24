-- Reconcile two exact Chewy package/listing identities to the already verified
-- current Nulo manufacturer formulas. Both retailer PDPs expose the exact
-- selected recipe and the same complete ingredient statement as the linked
-- official product page. No retailer ingredient text is promoted, no formula
-- is copied, and package size/count remain SKU-level evidence only.

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
          6598::BIGINT,
          7026::BIGINT,
          'nulo|nulo|pate small breed|dog|all life stages|wet|chicken salmon and pumpkin recipe|',
          'nulo:nulo nulo small breed pate for puppy adult chicken salmon pumpkin recipe',
          'https://nulo.com/products/pate-small-breed-chicken-salmon-pumpkin-recipe-for-dogs',
          'https://www.chewy.com/nulo-puppy-adult-chicken-salmon/dp/1297814',
          '1297814',
          'Nulo Small Breed Puppy & Adult Chicken Grain-Free Salmon, & Pumpkin Grain-Free Pate Wet Dog Food',
          'nulo|nulo|nulo small breed puppy and adult chicken grain free salmon and pumpkin grain free pate wet dog food|dog|puppy|wet||',
          'https://image.chewy.com/catalog/general/images/nulo-small-breed-puppy-adult-chicken-grain-free-salmon-pumpkin-grain-free-pate-wet-dog-food-2-8oz-can-12-count/img-137873._V1_.jpg',
          'Paté Small Breed',
          'dog',
          'all life stages',
          'wet',
          'Chicken, Salmon & Pumpkin Recipe',
          40,
          'e753529fa8dfa9e6e4a54d1b90db8de13739fb24956386d57722dd93affb32e2',
          'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/vv1wc0mjia5zijm5wehu.png?v=1776774827&width=1200&height=630&quality=60',
          '2026-07-24 21:12:09.835+00'::TIMESTAMPTZ
        ),
        (
          6591::BIGINT,
          7037::BIGINT,
          'nulo|nulo|prowess all in one essentials|cat|all life stages|dry|chicken|',
          'nulo:nulo nulo prowess all-in-one essentials for adult cats kittens',
          'https://nulo.com/products/prowess-all-in-one-essentials-recipe-chicken-for-cats',
          'https://www.chewy.com/nulo-prowess-all-in-one-essentials/dp/2254822',
          '2254822',
          'Nulo Prowess All-in-One Essentials Adult & Kitten Dry Cat Food',
          'nulo|nulo|nulo prowess all in one essentials adult and kitten dry cat food|cat|kitten|dry||',
          'https://image.chewy.com/catalog/general/images/moe/0688cd92-1f14-712c-8000-bd60b2a12b5f._V1_.jpg',
          'Prowess All-in-One Essentials',
          'cat',
          'all life stages',
          'dry',
          'Chicken',
          46,
          '65764db208ef8f78b80e715f54c360186fa7a2fcabd87b7168f6f94475151818',
          'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/cxobvjxv26vfb8vocuc8.png?v=1776774888&width=1200&height=630&quality=60',
          '2026-07-24 21:12:13.101+00'::TIMESTAMPTZ
        )
    ) AS target(
      formula_id,
      observation_id,
      formula_key,
      cache_key,
      official_source_url,
      retailer_source_url,
      retailer_product_id,
      retailer_title,
      retailer_formula_key,
      retailer_front_image_url,
      product_line,
      pet_type,
      life_stage,
      food_form,
      flavor,
      ingredient_count,
      ingredient_hash,
      official_front_image_url,
      observed_at
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.catalog_formulas
      WHERE id = v_target.formula_id
        AND formula_key = v_target.formula_key
        AND promoted_cache_key = v_target.cache_key
        AND source_url = v_target.official_source_url
        AND active
        AND verification_status = 'verified'
        AND formula_evidence_tier = 'manufacturer_current_exact'
        AND product_line = v_target.product_line
        AND pet_type = v_target.pet_type
        AND life_stage = v_target.life_stage
        AND food_form = v_target.food_form
        AND flavor = v_target.flavor
        AND cardinality(ingredients) = v_target.ingredient_count
        AND front_image_url = v_target.official_front_image_url
        AND encode(digest(ingredient_text, 'sha256'), 'hex') =
            v_target.ingredient_hash
    ) THEN
      RAISE EXCEPTION
        'Nulo Chewy formula precondition changed: %', v_target.formula_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.product_data
      WHERE cache_key = v_target.cache_key
        AND source_url = v_target.official_source_url
        AND source_quality = 'manufacturer'
        AND ingredient_verification_status = 'manufacturer'
        AND image_verification_status = 'manufacturer'
        AND formula_evidence_tier = 'manufacturer_current_exact'
        AND is_complete_food
        AND catalog_exclusion_reason IS NULL
        AND product_line = v_target.product_line
        AND pet_type = v_target.pet_type
        AND life_stage = v_target.life_stage
        AND food_form = v_target.food_form
        AND flavor = v_target.flavor
        AND ingredient_count = v_target.ingredient_count
        AND image_url = v_target.official_front_image_url
        AND encode(digest(ingredient_text, 'sha256'), 'hex') =
            v_target.ingredient_hash
    ) THEN
      RAISE EXCEPTION
        'Nulo Chewy serving precondition changed: %', v_target.cache_key;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_formula_aliases
      WHERE alias_formula_key = v_target.retailer_formula_key
        AND formula_id <> v_target.formula_id
    ) THEN
      RAISE EXCEPTION
        'Nulo Chewy formula alias belongs to another formula: %',
        v_target.retailer_formula_key;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_verified_product_search_aliases
      WHERE active
        AND normalized_alias =
            public.normalize_verified_product_search_query(
              v_target.retailer_title
            )
        AND cache_key <> v_target.cache_key
    ) THEN
      RAISE EXCEPTION
        'Nulo Chewy search alias belongs to another product: %',
        v_target.retailer_title;
    END IF;

    SELECT identity_hash
    INTO STRICT v_identity_hash
    FROM public.catalog_formulas
    WHERE id = v_target.formula_id;

    INSERT INTO public.catalog_formula_aliases (
      alias_formula_key,
      formula_id,
      identity_hash,
      match_reason,
      source_url,
      metadata,
      updated_at
    ) VALUES (
      v_target.retailer_formula_key,
      v_target.formula_id,
      v_identity_hash,
      'manual_review',
      v_target.retailer_source_url,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'retailer', 'Chewy',
        'retailer_product_id', v_target.retailer_product_id,
        'retailer_title', v_target.retailer_title,
        'retailer_front_image_url', v_target.retailer_front_image_url,
        'official_source_url', v_target.official_source_url,
        'canonical_formula_key', v_target.formula_key,
        'ingredient_statement_match', TRUE,
        'ingredient_count', v_target.ingredient_count,
        'ingredient_text_hash', v_target.ingredient_hash,
        'species_boundary', v_target.pet_type,
        'life_stage_boundary', v_target.life_stage,
        'food_form_boundary', v_target.food_form,
        'recipe_boundary', v_target.flavor,
        'package_size_is_sku_only', TRUE,
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

    INSERT INTO public.catalog_verified_product_search_aliases (
      cache_key,
      alias_text,
      normalized_alias,
      source_url,
      source_authority,
      evidence_observed_at,
      provenance,
      updated_at
    ) VALUES (
      v_target.cache_key,
      v_target.retailer_title,
      public.normalize_verified_product_search_query(v_target.retailer_title),
      v_target.retailer_source_url,
      'retailer_verified',
      v_target.observed_at,
      jsonb_build_object(
        'source', 'nulo_chewy_exact_package_equivalence',
        'retailer', 'Chewy',
        'retailer_product_id', v_target.retailer_product_id,
        'retailer_front_image_url', v_target.retailer_front_image_url,
        'official_source_url', v_target.official_source_url,
        'formula_id', v_target.formula_id,
        'canonical_formula_key', v_target.formula_key,
        'ingredient_statement_match', TRUE,
        'ingredient_text_hash', v_target.ingredient_hash,
        'species_boundary', v_target.pet_type,
        'life_stage_boundary', v_target.life_stage,
        'food_form_boundary', v_target.food_form,
        'recipe_boundary', v_target.flavor
      ),
      now()
    )
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
      'retailer_exact_formula_equivalence',
      jsonb_build_object(
        'retailer', 'Chewy',
        'retailer_product_id', v_target.retailer_product_id,
        'retailer_title', v_target.retailer_title,
        'retailer_front_image_url', v_target.retailer_front_image_url,
        'retailer_source_url', v_target.retailer_source_url,
        'official_source_url', v_target.official_source_url,
        'canonical_formula_key', v_target.formula_key,
        'ingredient_statement_match', TRUE,
        'ingredient_count', v_target.ingredient_count,
        'ingredient_text_hash', v_target.ingredient_hash,
        'package_size_is_sku_only', TRUE,
        'not_a_sibling_merge', TRUE
      ),
      v_target.retailer_source_url,
      'retailer_verified',
      TRUE,
      v_target.observed_at,
      encode(
        digest(
          v_target.formula_id::TEXT || '|chewy_exact_equivalence|'
          || v_target.retailer_product_id || '|' || v_target.ingredient_hash,
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

    SELECT cache_key
    INTO v_top
    FROM public.search_verified_products(v_target.retailer_title, 8)
    ORDER BY rank DESC
    LIMIT 1;

    IF v_top IS DISTINCT FROM v_target.cache_key THEN
      RAISE EXCEPTION
        'Nulo Chewy exact-title search regression for %: %',
        v_target.retailer_product_id,
        v_top;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key IN (
      'nulo|nulo|nulo small breed puppy and adult chicken grain free salmon and pumpkin grain free pate wet dog food|dog|puppy|wet||',
      'nulo|nulo|nulo prowess all in one essentials adult and kitten dry cat food|cat|kitten|dry||'
    )
      AND formula_id IN (6591, 6598)
  ) <> 2 THEN
    RAISE EXCEPTION 'Nulo Chewy alias wave did not reconcile two formulas';
  END IF;
END
$$;
