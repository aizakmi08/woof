-- Preserve exact, form-specific shelf/search wording for the reviewed SKOKI
-- cans. Do not alias the generic "SKOKI Coastal" or "SKOKI Ranch" identities:
-- those names also identify current dry formulas and must remain ambiguous.

DO $$
DECLARE
  v_alias RECORD;
  v_existing_cache_key TEXT;
  v_search_cache_key TEXT;
  v_inserted_count INTEGER := 0;
BEGIN
  FOR v_alias IN
    SELECT *
    FROM (
      VALUES
        (
          'firstmate:072318123566'::TEXT,
          'SKOKI Can: Coastal 12.2oz – 12 Cans'::TEXT,
          'https://firstmate.com/product/skoki-can-coastal-12-2oz-12-cans/'::TEXT,
          '072318123566'::TEXT,
          'Coastal'::TEXT,
          'Coastal Formula'::TEXT,
          'exact_current_manufacturer_package_title'::TEXT
        ),
        (
          'firstmate:072318123566'::TEXT,
          'SKOKI Coastal Canned Dog Food'::TEXT,
          'https://firstmate.com/product/skoki-can-coastal-12-2oz-12-cans/'::TEXT,
          '072318123566'::TEXT,
          'Coastal'::TEXT,
          'Coastal Formula'::TEXT,
          'form_specific_shelf_search'::TEXT
        ),
        (
          'firstmate:072318123566'::TEXT,
          'SKOKI Coastal Wet Dog Food'::TEXT,
          'https://firstmate.com/product/skoki-can-coastal-12-2oz-12-cans/'::TEXT,
          '072318123566'::TEXT,
          'Coastal'::TEXT,
          'Coastal Formula'::TEXT,
          'form_specific_shelf_search'::TEXT
        ),
        (
          'firstmate:072318123573'::TEXT,
          'SKOKI Can: Ranch 12.2oz – 12 Cans'::TEXT,
          'https://firstmate.com/product/skoki-can-ranch-12-2oz-12-cans/'::TEXT,
          '072318123573'::TEXT,
          'Ranch'::TEXT,
          'Ranch Formula'::TEXT,
          'exact_current_manufacturer_package_title'::TEXT
        ),
        (
          'firstmate:072318123573'::TEXT,
          'SKOKI Ranch Canned Dog Food'::TEXT,
          'https://firstmate.com/product/skoki-can-ranch-12-2oz-12-cans/'::TEXT,
          '072318123573'::TEXT,
          'Ranch'::TEXT,
          'Ranch Formula'::TEXT,
          'form_specific_shelf_search'::TEXT
        ),
        (
          'firstmate:072318123573'::TEXT,
          'SKOKI Ranch Wet Dog Food'::TEXT,
          'https://firstmate.com/product/skoki-can-ranch-12-2oz-12-cans/'::TEXT,
          '072318123573'::TEXT,
          'Ranch'::TEXT,
          'Ranch Formula'::TEXT,
          'form_specific_shelf_search'::TEXT
        )
    ) AS alias(
      cache_key,
      alias_text,
      source_url,
      gtin,
      product_line,
      flavor,
      alias_kind
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.product_data serving
      WHERE serving.cache_key = v_alias.cache_key
        AND serving.brand = 'SKOKI'
        AND serving.gtin = v_alias.gtin
        AND serving.product_line = v_alias.product_line
        AND serving.flavor = v_alias.flavor
        AND serving.pet_type = 'dog'
        AND serving.life_stage = 'all life stages'
        AND serving.food_form = 'wet'
        AND serving.source_url = v_alias.source_url
        AND serving.is_complete_food
        AND COALESCE(serving.catalog_exclusion_reason, '') = ''
        AND serving.source_quality = 'manufacturer'
        AND serving.ingredient_verification_status = 'manufacturer'
        AND serving.image_verification_status = 'manufacturer'
        AND serving.formula_evidence_tier = 'manufacturer_current_exact'
    ) THEN
      RAISE EXCEPTION
        'SKOKI alias % lacks an exact verified wet serving formula',
        v_alias.alias_text;
    END IF;

    IF public.normalize_verified_product_search_query(v_alias.alias_text)
        IN ('skoki coastal', 'skoki ranch') THEN
      RAISE EXCEPTION
        'SKOKI alias % collapses into an ambiguous dry/wet identity',
        v_alias.alias_text;
    END IF;

    SELECT alias.cache_key
    INTO v_existing_cache_key
    FROM public.catalog_verified_product_search_aliases alias
    WHERE alias.active
      AND alias.normalized_alias =
        public.normalize_verified_product_search_query(v_alias.alias_text);

    IF v_existing_cache_key IS NOT NULL
        AND v_existing_cache_key <> v_alias.cache_key THEN
      RAISE EXCEPTION
        'SKOKI alias % is already assigned to sibling cache key %',
        v_alias.alias_text,
        v_existing_cache_key;
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
    )
    VALUES (
      v_alias.cache_key,
      v_alias.alias_text,
      public.normalize_verified_product_search_query(v_alias.alias_text),
      v_alias.source_url,
      'manufacturer',
      NOW(),
      jsonb_build_object(
        'alias_kind', v_alias.alias_kind,
        'consumer_brand', 'SKOKI',
        'species_boundary', 'dog',
        'life_stage_boundary', 'all life stages',
        'food_form_boundary', 'wet',
        'recipe_boundary', v_alias.flavor,
        'gtin', v_alias.gtin,
        'generic_line_alias_intentionally_omitted', TRUE
      ),
      TRUE,
      NOW()
    )
    ON CONFLICT (normalized_alias) WHERE active
    DO UPDATE SET
      cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance = EXCLUDED.provenance,
      updated_at = NOW();

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  IF v_inserted_count <> 6 THEN
    RAISE EXCEPTION
      'Expected six form-specific SKOKI aliases, processed %',
      v_inserted_count;
  END IF;

  FOR v_alias IN
    SELECT *
    FROM (
      VALUES
        (
          'firstmate:072318123566'::TEXT,
          'SKOKI Can: Coastal 12.2oz – 12 Cans'::TEXT
        ),
        (
          'firstmate:072318123566'::TEXT,
          'SKOKI Coastal Canned Dog Food'::TEXT
        ),
        (
          'firstmate:072318123566'::TEXT,
          'SKOKI Coastal Wet Dog Food'::TEXT
        ),
        (
          'firstmate:072318123573'::TEXT,
          'SKOKI Can: Ranch 12.2oz – 12 Cans'::TEXT
        ),
        (
          'firstmate:072318123573'::TEXT,
          'SKOKI Ranch Canned Dog Food'::TEXT
        ),
        (
          'firstmate:072318123573'::TEXT,
          'SKOKI Ranch Wet Dog Food'::TEXT
        )
    ) AS expected(cache_key, query_text)
  LOOP
    SELECT result.cache_key
    INTO STRICT v_search_cache_key
    FROM public.search_verified_products(v_alias.query_text, 5) result
    LIMIT 1;

    IF v_search_cache_key <> v_alias.cache_key THEN
      RAISE EXCEPTION
        'SKOKI exact search % resolved to %, expected %',
        v_alias.query_text,
        v_search_cache_key,
        v_alias.cache_key;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases alias
    WHERE alias.active
      AND alias.normalized_alias IN ('skoki coastal', 'skoki ranch')
      AND alias.cache_key IN (
        'firstmate:072318123566',
        'firstmate:072318123573'
      )
  ) THEN
    RAISE EXCEPTION
      'A generic SKOKI line alias would cross the wet/dry boundary';
  END IF;
END;
$$;
