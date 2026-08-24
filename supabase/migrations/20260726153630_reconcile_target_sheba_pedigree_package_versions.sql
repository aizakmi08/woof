-- Reconcile two exact Target package pages without crossing ingredient
-- versions:
--   * Sheba Kitten Chicken is ingredient-identical to manufacturer current.
--   * Pedigree Choice Cuts Beef 22 oz is ingredient-identical to the existing
--     PetSmart retailer version and differs from manufacturer current.

DO $$
DECLARE
  v_sheba_formula_id BIGINT;
  v_sheba_gap_id BIGINT;
  v_pedigree_formula_id BIGINT;
  v_pedigree_gap_id BIGINT;
  v_sheba_run_id BIGINT;
  v_pedigree_run_id BIGINT;
  v_sheba_cache TEXT := 'sheba-mars-petcare:023100144153';
  v_pedigree_cache TEXT := 'petsmart-retail-catalog:023100015309';
  v_sheba_gap_key TEXT :=
    'sheba|sheba|sheba kitten soft pate perfect portions wet cat food with chicken flavor 2|cat|kitten|wet||';
  v_pedigree_gap_key TEXT :=
    'pedigree|pedigree|pedigree choice cuts in gravy with beef adult wet dog food|dog|adult|wet||';
  v_sheba_url TEXT :=
    'https://www.target.com/p/sheba-kitten-soft-pate-perfect-portions-wet-cat-food-with-chicken-flavor-2-64oz/-/A-87406025';
  v_pedigree_url TEXT :=
    'https://www.target.com/p/pedigree-choice-cuts-in-gravy-with-beef-adult-wet-dog-food-22oz/-/A-14972529';
  v_sheba_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_a4b485c0-a5dc-4f3d-85c7-1e9cb776bd02';
  v_pedigree_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_22694441-90bc-4021-a24c-83b1f7bf4360';
  v_observed_at TIMESTAMPTZ := '2026-07-26T23:58:00Z';
  v_sheba_ingredients TEXT :=
    'chicken, water, poultry by-product, pork broth, dried egg product, potassium chloride, guar gum, sodium tripolyphosphate, fish oil, calcium carbonate, choline chloride, magnesium sulfate, tapioca starch, taurine, salt, thiamine mononitrate, vitamin e supplement, zinc sulfate, ferrous sulfate, iron oxide color, vitamin d3 supplement, manganese sulfate, copper sulfate, pyridoxine hydrochloride, potassium iodide, folic acid, menadione sodium bisulfite complex';
  v_pedigree_ingredients TEXT :=
    'water, chicken, meat by-products, wheat flour, wheat gluten, beef, added color, salt, minerals (potassium chloride, magnesium sulfate, zinc sulfate, copper proteinate, potassium iodide, manganese sulfate, sodium selenite, copper sulfate), guar gum, sodium tripolyphosphate, natural hickory smoke flavor, vitamins (choline chloride, vitamin e supplement, thiamine mononitrate, calcium pantothenate, biotin, riboflavin, vitamin a supplement, vitamin d3 supplement, vitamin b12 supplement), xanthan gum';
  v_sheba_hash TEXT;
  v_pedigree_hash TEXT;
  v_pedigree_current_hash TEXT;
BEGIN
  v_sheba_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_sheba_ingredients),
      'sha256'
    ),
    'hex'
  );
  v_pedigree_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_pedigree_ingredients),
      'sha256'
    ),
    'hex'
  );

  SELECT id
  INTO STRICT v_sheba_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_sheba_cache
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active
    AND encode(
      digest(
        public.catalog_normalize_ingredient_evidence(
          COALESCE(ingredient_text, '')
        ),
        'sha256'
      ),
      'hex'
    ) = v_sheba_hash;

  SELECT id
  INTO STRICT v_sheba_gap_id
  FROM public.catalog_formulas
  WHERE formula_key = v_sheba_gap_key;

  SELECT id
  INTO STRICT v_pedigree_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'pedigree|pedigree|pedigree choice cuts in gravy adult soft wet dog food with beef|dog|adult|wet|beef|'
    AND formula_evidence_tier = 'retailer_web_version'
    AND verification_status = 'verified'
    AND active
    AND encode(
      digest(
        public.catalog_normalize_ingredient_evidence(
          COALESCE(ingredient_text, '')
        ),
        'sha256'
      ),
      'hex'
    ) = v_pedigree_hash;

  SELECT id
  INTO STRICT v_pedigree_gap_id
  FROM public.catalog_formulas
  WHERE formula_key = v_pedigree_gap_key;

  SELECT encode(
    digest(
      public.catalog_normalize_ingredient_evidence(
        COALESCE(ingredient_text, '')
      ),
      'sha256'
    ),
    'hex'
  )
  INTO STRICT v_pedigree_current_hash
  FROM public.product_data
  WHERE cache_key = 'pedigree-mars-petcare:023100015279'
    AND formula_evidence_tier = 'manufacturer_current_exact';

  IF v_pedigree_hash = v_pedigree_current_hash THEN
    RAISE EXCEPTION
      'Pedigree retailer version unexpectedly equals manufacturer current';
  END IF;

  -- Keep generic typed search on manufacturer current. Exact UPC lookup may
  -- now resolve the package-specific retailer version.
  UPDATE public.catalog_formulas
  SET
    promoted_cache_key = v_pedigree_cache,
    promoted_at = now(),
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source', 'PetSmart and Target exact package pages',
        'captured_at', v_observed_at,
        'package_gtin', '023100015309',
        'ingredient_text_hash', v_pedigree_hash,
        'different_from_manufacturer_current_hash',
          v_pedigree_current_hash
      ),
    updated_at = now()
  WHERE id = v_pedigree_formula_id;

  UPDATE public.product_data
  SET
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'equivalent_exact_source_urls', jsonb_build_array(
          source_url,
          v_pedigree_url
        ),
        'target_product_code', 'TCIN 14972529',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_pedigree_hash,
        'different_from_manufacturer_current_hash',
          v_pedigree_current_hash
      ),
    updated_at = now()
  WHERE cache_key = v_pedigree_cache;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (
      v_sheba_formula_id, '023100144153', '2.64 oz', 2,
      'target-retail-label-manual', 'TCIN:87406025', v_sheba_url,
      true, v_observed_at, v_observed_at, now()
    ),
    (
      v_pedigree_formula_id, '023100015309', '22 oz', 1,
      'target-retail-label-manual', 'TCIN:14972529', v_pedigree_url,
      true, v_observed_at, v_observed_at, now()
    )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = excluded.last_observed_at,
    updated_at = now();

  UPDATE public.catalog_observations
  SET
    formula_id = v_sheba_formula_id,
    gtin = '023100144153',
    manufacturer = 'mars petcare',
    brand = 'sheba',
    product_name = 'Sheba Perfect Portions Kitten Chicken Soft Paté Wet Cat Food',
    product_line = 'perfect portions kitten pate',
    pet_type = 'cat',
    life_stage = 'kitten',
    food_form = 'wet',
    flavor = 'chicken',
    diet_condition = '',
    package_size = '2.64 oz twin pack',
    ingredient_text = v_sheba_ingredients,
    front_image_url = v_sheba_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'manufacturer_current_equivalent_package',
      'manufacturer_current_equivalence', true,
      'package_gtin', '023100144153',
      'product_code', 'TCIN 87406025',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_sheba_hash
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
      'target_tcin', '87406025',
      'target_upc', '023100144153',
      'front_image_url', v_sheba_image,
      'ingredients_verbatim_from_exact_pdp', true,
      'exact_official_ingredient_hash_match', true
    )
  WHERE formula_id = v_sheba_gap_id
    AND source_slug = 'target-public-sitemap';

  UPDATE public.catalog_observations
  SET
    formula_id = v_pedigree_formula_id,
    gtin = '023100015309',
    manufacturer = 'mars petcare',
    brand = 'pedigree',
    product_name =
      'Pedigree Choice Cuts In Gravy Adult Wet Dog Food With Beef',
    product_line = 'choice cuts in gravy',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'beef',
    diet_condition = '',
    package_size = '22 oz',
    ingredient_text = v_pedigree_ingredients,
    front_image_url = v_pedigree_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '023100015309',
      'product_code', 'TCIN 14972529',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_pedigree_hash,
      'different_from_manufacturer_current_hash',
        v_pedigree_current_hash
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
      'target_tcin', '14972529',
      'target_upc', '023100015309',
      'front_image_url', v_pedigree_image,
      'ingredients_verbatim_from_exact_pdp', true
    )
  WHERE formula_id = v_pedigree_gap_id
    AND source_slug = 'target-public-sitemap';

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  ) VALUES
    (
      v_sheba_gap_key,
      v_sheba_formula_id,
      encode(
        digest(
          'mars petcare|sheba|pate|cat|kitten|wet|chicken|',
          'sha256'
        ),
        'hex'
      ),
      'manual_review',
      v_sheba_url,
      jsonb_build_object(
        'exact_formula_identity', true,
        'ingredient_hash_equality_verified', true,
        'package_sizes_are_sku_children', true,
        'reviewed_at', '2026-07-26'
      ),
      now()
    ),
    (
      v_pedigree_gap_key,
      v_pedigree_formula_id,
      encode(
        digest(
          'pedigree|pedigree|pedigree choice cuts in gravy adult soft wet dog food with beef|dog|adult|wet|beef|',
          'sha256'
        ),
        'hex'
      ),
      'manual_review',
      v_pedigree_url,
      jsonb_build_object(
        'exact_formula_identity', true,
        'ingredient_hash_equality_verified', true,
        'formula_evidence_tier', 'retailer_web_version',
        'manufacturer_current_equivalence', false,
        'reviewed_at', '2026-07-26'
      ),
      now()
    )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = excluded.match_reason,
    source_url = excluded.source_url,
    metadata = excluded.metadata,
    updated_at = now();

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Exact Target title/package alias of the reviewed canonical formula version.',
    updated_at = now()
  WHERE id IN (v_sheba_gap_id, v_pedigree_gap_id);

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:target:sheba-kitten-chicken:87406025:20260726',
    'target-retail-label-manual', 'retailer', 'verification', 'completed',
    v_observed_at, v_observed_at, 1, 1, 1, 0, true,
    encode(
      digest(v_sheba_url || '|023100144153|' || v_sheba_ingredients, 'sha256'),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'manufacturer_current_exact',
      'tcin', '87406025',
      'upc', '023100144153',
      'package_size', '2.64 oz twin pack',
      'manufacturer_current_equivalence', true
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = excluded.finished_at,
    observed_count = 1,
    accepted_count = 1,
    rejected_count = 0,
    pagination_complete = true,
    source_content_hash = excluded.source_content_hash,
    metadata = excluded.metadata,
    updated_at = now()
  RETURNING id INTO v_sheba_run_id;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:target:pedigree-choice-cuts-beef:14972529:20260726',
    'target-retail-label-manual', 'retailer', 'verification', 'completed',
    v_observed_at, v_observed_at, 1, 1, 1, 0, true,
    encode(
      digest(
        v_pedigree_url || '|023100015309|' || v_pedigree_ingredients,
        'sha256'
      ),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'retailer_web_version',
      'tcin', '14972529',
      'upc', '023100015309',
      'package_size', '22 oz',
      'manufacturer_current_equivalence', false,
      'ingredient_hash_matches_petsmart_22_oz', true
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = excluded.finished_at,
    observed_count = 1,
    accepted_count = 1,
    rejected_count = 0,
    pagination_complete = true,
    source_content_hash = excluded.source_content_hash,
    metadata = excluded.metadata,
    updated_at = now()
  RETURNING id INTO v_pedigree_run_id;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    formula_evidence_tier, formula_version_provenance, raw_payload
  ) VALUES
    (
      v_sheba_run_id, v_sheba_formula_id, 'target-retail-label-manual',
      'TCIN:87406025', v_sheba_url, 'retailer_verified', '023100144153',
      'mars petcare', 'sheba',
      'Sheba Perfect Portions Kitten Chicken Soft Paté Wet Cat Food',
      'perfect portions kitten pate', 'cat', 'kitten', 'wet', 'chicken', '',
      '2.64 oz twin pack', v_sheba_ingredients, v_sheba_image,
      true, true, v_observed_at,
      encode(
        digest(
          v_sheba_gap_key || '|023100144153|' || v_sheba_hash,
          'sha256'
        ),
        'hex'
      ),
      'accepted', ARRAY[]::TEXT[], 'manufacturer_current_exact',
      jsonb_build_object(
        'version_status', 'manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence', true,
        'package_gtin', '023100144153',
        'product_code', 'TCIN 87406025',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_sheba_hash
      ),
      jsonb_build_object(
        'target_tcin', '87406025',
        'target_upc', '023100144153',
        'front_image_url', v_sheba_image,
        'ingredients_verbatim_from_exact_pdp', true,
        'complete_and_balanced_growth_statement', true
      )
    ),
    (
      v_pedigree_run_id, v_pedigree_formula_id,
      'target-retail-label-manual', 'TCIN:14972529', v_pedigree_url,
      'retailer_verified', '023100015309', 'mars petcare', 'pedigree',
      'Pedigree Choice Cuts In Gravy Adult Wet Dog Food With Beef',
      'choice cuts in gravy', 'dog', 'adult', 'wet', 'beef', '', '22 oz',
      v_pedigree_ingredients, v_pedigree_image, true, true, v_observed_at,
      encode(
        digest(
          v_pedigree_gap_key || '|023100015309|' || v_pedigree_hash,
          'sha256'
        ),
        'hex'
      ),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '023100015309',
        'product_code', 'TCIN 14972529',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_pedigree_hash,
        'different_from_manufacturer_current_hash',
          v_pedigree_current_hash
      ),
      jsonb_build_object(
        'target_tcin', '14972529',
        'target_upc', '023100015309',
        'front_image_url', v_pedigree_image,
        'ingredients_verbatim_from_exact_pdp', true,
        'complete_and_balanced_adult_statement', true,
        'same_ordered_ingredient_hash_as_petsmart_22_oz', true
      )
    )
  ON CONFLICT (
    run_id, source_slug, source_external_id, content_hash
  ) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = excluded.formula_evidence_tier,
    formula_version_provenance =
      excluded.formula_version_provenance,
    raw_payload = excluded.raw_payload,
    observed_at = excluded.observed_at;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, created_at, updated_at
  ) VALUES (
    v_sheba_cache,
    'Sheba Perfect Portions Chicken Flavor Soft Pate Kitten Wet Cat Food',
    public.normalize_verified_product_search_query(
      'Sheba Perfect Portions Chicken Flavor Soft Pate Kitten Wet Cat Food'
    ),
    v_sheba_url,
    'retailer_verified',
    v_observed_at,
    jsonb_build_object(
      'evidence_tier', 'manufacturer_current_exact',
      'package_gtin', '023100144153',
      'product_code', 'TCIN 87406025',
      'manufacturer_current_equivalence', true
    ),
    true, now(), now()
  )
  ON CONFLICT (normalized_alias)
    WHERE active
  DO UPDATE
  SET
    cache_key = excluded.cache_key,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    evidence_observed_at = excluded.evidence_observed_at,
    provenance = excluded.provenance,
    active = true,
    updated_at = now();

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('023100144153', 8)
    WHERE cache_key = v_sheba_cache
      AND nutritional_info->>'formula_evidence_tier' =
        'manufacturer_current_exact'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Sheba Target UPC did not resolve manufacturer current';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('023100015309', 8)
    WHERE cache_key = v_pedigree_cache
      AND nutritional_info->>'formula_evidence_tier' =
        'retailer_web_version'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Pedigree Target UPC did not resolve its retailer source version';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Pedigree Choice Cuts in Gravy Adult Wet Dog Food Beef',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM 'pedigree-mars-petcare:023100015279' THEN
    RAISE EXCEPTION
      'Generic Pedigree search no longer prefers manufacturer current';
  END IF;
END;
$$;
