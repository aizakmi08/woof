-- FirstMate's official PDPs expose SKOKI as the shelf-facing consumer brand.
-- Earlier extraction stored these exact packages under the umbrella FirstMate
-- brand and used the package title as the line. The bounded official refresh
-- was correctly quarantined by the cross-brand GTIN guard. Resolve only these
-- two reviewed packages after proving exact GTIN, URL, title, image, species,
-- form, and normalized full-ingredient equality across the old ledger row,
-- current serving row, and new official observation.

DO $$
DECLARE
  v_run_id BIGINT;
  v_target RECORD;
  v_incoming public.catalog_observations%ROWTYPE;
  v_formula public.catalog_formulas%ROWTYPE;
  v_serving public.product_data%ROWTYPE;
  v_formula_id BIGINT;
  v_promoted_cache_key TEXT;
  v_resolved_count INTEGER := 0;
  v_result_count INTEGER;
BEGIN
  SELECT run.id
  INTO STRICT v_run_id
  FROM public.catalog_source_runs run
  WHERE run.run_key =
      'firstmate:bounded-exact-evidence:ee2fc550ec1ac5acff8e0110'
    AND run.status = 'quarantined'
    AND run.error_summary = 'run_not_proven_complete'
    AND run.metadata->>'bounded_exact_evidence' = 'true'
    AND run.metadata->>'exact_formula_evidence' = 'true'
    AND run.expected_count = 2
    AND run.observed_count = 2
    AND run.accepted_count = 0
    AND run.rejected_count = 2;

  FOR v_target IN
    SELECT *
    FROM (
      VALUES
        (
          '072318123566'::TEXT,
          'firstmate:072318123566'::TEXT,
          'firstmate|firstmate|skoki can coastal 12 2oz 12 cans|dog|unknown|wet||'::TEXT,
          'firstmate pet foods|skoki|coastal|dog|all life stages|wet|coastal formula|'::TEXT,
          '97f114208a0c346885e405f3c7ae8e167007baf2fa30b42fcdb7ea17f8f4f3e4'::TEXT,
          'SKOKI Can: Coastal 12.2oz – 12 Cans'::TEXT,
          'Coastal'::TEXT,
          'Coastal Formula'::TEXT,
          'https://firstmate.com/product/skoki-can-coastal-12-2oz-12-cans/'::TEXT,
          'https://firstmate.com/wp-content/uploads/2026/01/Skoki_Can_Coastal.png'::TEXT
        ),
        (
          '072318123573'::TEXT,
          'firstmate:072318123573'::TEXT,
          'firstmate|firstmate|skoki can ranch 12 2oz 12 cans|dog|unknown|wet||'::TEXT,
          'firstmate pet foods|skoki|ranch|dog|all life stages|wet|ranch formula|'::TEXT,
          '40a1b3318edba31b8eb50721bc375a9d7784a25e1bb6e43e150115f222630215'::TEXT,
          'SKOKI Can: Ranch 12.2oz – 12 Cans'::TEXT,
          'Ranch'::TEXT,
          'Ranch Formula'::TEXT,
          'https://firstmate.com/product/skoki-can-ranch-12-2oz-12-cans/'::TEXT,
          'https://firstmate.com/wp-content/uploads/2026/01/Skoki_Can_Ranch.png'::TEXT
        )
    ) AS target(
      gtin,
      serving_cache_key,
      old_formula_key,
      new_formula_key,
      new_identity_hash,
      product_name,
      product_line,
      flavor,
      source_url,
      front_image_url
    )
  LOOP
    SELECT observation.*
    INTO STRICT v_incoming
    FROM public.catalog_observations observation
    WHERE observation.run_id = v_run_id
      AND observation.formula_id IS NULL
      AND observation.source_slug = 'firstmate'
      AND observation.source_external_id = 'firstmate:' || v_target.gtin
      AND observation.gtin = v_target.gtin
      AND observation.source_url = v_target.source_url
      AND observation.front_image_url = v_target.front_image_url
      AND observation.product_name = v_target.product_name
      AND observation.brand = 'SKOKI'
      AND observation.product_line = v_target.product_line
      AND observation.flavor = v_target.flavor
      AND observation.pet_type = 'dog'
      AND observation.life_stage = 'all life stages'
      AND observation.food_form = 'wet'
      AND observation.is_complete_food
      AND observation.source_authority = 'manufacturer'
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['gtin_formula_identity_conflict']::TEXT[]
      AND observation.raw_payload->>'cache_key' =
        v_target.serving_cache_key
      AND observation.raw_payload->>'exact_formula_evidence' = 'true'
      AND observation.raw_payload->>'package_size_is_sku_only' = 'true'
      AND NULLIF(btrim(observation.ingredient_text), '') IS NOT NULL;

    SELECT formula.*
    INTO STRICT v_formula
    FROM public.catalog_skus sku
    JOIN public.catalog_formulas formula
      ON formula.id = sku.formula_id
    WHERE sku.gtin = v_target.gtin
      AND sku.source_slug = 'firstmate'
      AND sku.source_external_id = 'firstmate:' || v_target.gtin
      AND sku.source_url = v_target.source_url
      AND sku.active
      AND formula.active
      AND formula.verification_status = 'verified'
      AND formula.formula_key = v_target.old_formula_key
      AND formula.source_url = v_target.source_url
      AND formula.front_image_url = v_target.front_image_url
      AND formula.product_name = v_target.product_name
      AND formula.pet_type = 'dog'
      AND formula.food_form = 'wet'
      AND regexp_replace(
        lower(COALESCE(formula.ingredient_text, '')),
        '[^a-z0-9]+',
        '',
        'g'
      ) = regexp_replace(
        lower(v_incoming.ingredient_text),
        '[^a-z0-9]+',
        '',
        'g'
      );

    SELECT serving.*
    INTO STRICT v_serving
    FROM public.product_data serving
    WHERE serving.cache_key = v_target.serving_cache_key
      AND serving.gtin = v_target.gtin
      AND serving.source = 'firstmate'
      AND serving.source_url = v_target.source_url
      AND serving.image_url = v_target.front_image_url
      AND serving.product_name = v_target.product_name
      AND serving.pet_type = 'dog'
      AND serving.food_form = 'wet'
      AND serving.is_complete_food
      AND COALESCE(serving.catalog_exclusion_reason, '') = ''
      AND serving.source_quality IN (
        'gdsn', 'official', 'manufacturer', 'retailer_verified'
      )
      AND serving.ingredient_verification_status IN (
        'gdsn', 'official', 'manufacturer',
        'retailer_verified', 'label_ocr_verified'
      )
      AND serving.image_verification_status IN (
        'official', 'manufacturer', 'retailer_verified'
      )
      AND cardinality(serving.ingredients) >= 5
      AND regexp_replace(
        lower(COALESCE(serving.ingredient_text, '')),
        '[^a-z0-9]+',
        '',
        'g'
      ) = regexp_replace(
        lower(v_incoming.ingredient_text),
        '[^a-z0-9]+',
        '',
        'g'
      );

    IF EXISTS (
      SELECT 1
      FROM public.catalog_formulas collision
      WHERE collision.id <> v_formula.id
        AND (
          collision.formula_key = v_target.new_formula_key
          OR (
            collision.active
            AND collision.identity_hash = v_target.new_identity_hash
          )
        )
    ) THEN
      RAISE EXCEPTION
        'SKOKI target identity already belongs to another formula for GTIN %',
        v_target.gtin;
    END IF;

    IF (
      SELECT count(DISTINCT sku.formula_id)
      FROM public.catalog_skus sku
      WHERE sku.gtin = v_target.gtin
        AND sku.active
    ) <> 1 THEN
      RAISE EXCEPTION
        'SKOKI GTIN % does not have exactly one active ledger formula',
        v_target.gtin;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.catalog_field_evidence evidence
      WHERE evidence.formula_id = v_formula.id
        AND evidence.field_name = 'ingredient_text'
        AND evidence.source_url = v_target.source_url
        AND evidence.source_authority = 'manufacturer'
        AND evidence.accepted
        AND regexp_replace(
          lower(COALESCE(evidence.field_value #>> '{}', '')),
          '[^a-z0-9]+',
          '',
          'g'
        ) = regexp_replace(
          lower(v_incoming.ingredient_text),
          '[^a-z0-9]+',
          '',
          'g'
        )
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.catalog_field_evidence evidence
      WHERE evidence.formula_id = v_formula.id
        AND evidence.field_name = 'front_image_url'
        AND evidence.source_url = v_target.source_url
        AND evidence.source_authority = 'manufacturer'
        AND evidence.accepted
        AND evidence.field_value #>> '{}' = v_target.front_image_url
    ) THEN
      RAISE EXCEPTION
        'SKOKI GTIN % lacks matching accepted official field evidence',
        v_target.gtin;
    END IF;

    UPDATE public.catalog_formulas formula
    SET
      formula_key = v_target.new_formula_key,
      identity_hash = v_target.new_identity_hash,
      manufacturer = 'FirstMate Pet Foods',
      brand = 'SKOKI',
      product_name = v_target.product_name,
      product_line = v_target.product_line,
      pet_type = 'dog',
      life_stage = 'all life stages',
      food_form = 'wet',
      flavor = v_target.flavor,
      diet_condition = '',
      is_complete_food = TRUE,
      ingredient_text = v_incoming.ingredient_text,
      ingredients = v_serving.ingredients,
      front_image_url = v_target.front_image_url,
      source_url = v_target.source_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      protected_terms = ARRAY(
        SELECT DISTINCT term
        FROM unnest(
          COALESCE(formula.protected_terms, ARRAY[]::TEXT[])
          || ARRAY[
            'SKOKI',
            v_target.product_line,
            v_target.flavor,
            'dog',
            'all life stages',
            'wet'
          ]::TEXT[]
        ) term
        WHERE NULLIF(btrim(term), '') IS NOT NULL
      ),
      verification_status = 'verified',
      active = TRUE,
      absent_since = NULL,
      last_observed_at = GREATEST(
        formula.last_observed_at,
        v_incoming.observed_at
      ),
      promoted_cache_key = v_target.serving_cache_key,
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(formula.formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'evidence_tier', 'manufacturer_current_exact',
          'source_url', v_target.source_url,
          'observed_at', v_incoming.observed_at,
          'gtin', v_target.gtin,
          'package_size', v_incoming.package_size,
          'consumer_brand', 'SKOKI',
          'previous_consumer_brand', v_formula.brand,
          'previous_formula_key', v_target.old_formula_key,
          'identity_resolution',
            'reviewed_exact_gtin_url_image_ingredient_equivalence',
          'resolution_run_id', v_run_id
        ),
      updated_at = NOW()
    WHERE formula.id = v_formula.id;

    UPDATE public.catalog_observations observation
    SET
      manufacturer = 'FirstMate Pet Foods',
      brand = 'SKOKI',
      product_name = v_target.product_name,
      product_line = v_target.product_line,
      pet_type = 'dog',
      life_stage = 'all life stages',
      food_form = 'wet',
      flavor = v_target.flavor,
      diet_condition = '',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(observation.formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'evidence_tier', 'manufacturer_current_exact',
          'source_url', v_target.source_url,
          'gtin', v_target.gtin,
          'consumer_brand', 'SKOKI',
          'identity_resolution',
            'reviewed_exact_gtin_url_image_ingredient_equivalence',
          'resolution_run_id', v_run_id
        )
    WHERE observation.formula_id = v_formula.id
      AND observation.gtin = v_target.gtin
      AND observation.source_url = v_target.source_url;

    UPDATE public.catalog_observations observation
    SET
      formula_id = v_formula.id,
      validation_status = 'accepted',
      validation_reasons = ARRAY[]::TEXT[],
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'evidence_tier', 'manufacturer_current_exact',
        'source_url', v_target.source_url,
        'observed_at', v_incoming.observed_at,
        'gtin', v_target.gtin,
        'package_size', v_incoming.package_size,
        'consumer_brand', 'SKOKI',
        'identity_resolution',
          'reviewed_exact_gtin_url_image_ingredient_equivalence',
        'resolution_run_id', v_run_id
      )
    WHERE observation.id = v_incoming.id
      AND observation.formula_id IS NULL
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['gtin_formula_identity_conflict']::TEXT[];

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'SKOKI GTIN % quarantine observation was not resolved',
        v_target.gtin;
    END IF;

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
      v_formula.id,
      v_incoming.id,
      evidence.field_name,
      to_jsonb(evidence.field_value),
      v_target.source_url,
      'manufacturer',
      TRUE,
      v_incoming.observed_at,
      encode(
        digest(
          concat_ws(
            '|',
            v_formula.id::TEXT,
            v_incoming.id::TEXT,
            evidence.field_name,
            evidence.field_value,
            v_target.source_url
          ),
          'sha256'
        ),
        'hex'
      )
    FROM (
      VALUES
        ('ingredient_text'::TEXT, v_incoming.ingredient_text),
        ('front_image_url'::TEXT, v_target.front_image_url),
        ('consumer_brand'::TEXT, 'SKOKI'::TEXT),
        ('product_line'::TEXT, v_target.product_line),
        ('flavor'::TEXT, v_target.flavor),
        ('life_stage'::TEXT, 'all life stages'::TEXT),
        ('food_form'::TEXT, 'wet'::TEXT),
        ('species'::TEXT, 'dog'::TEXT),
        ('gtin'::TEXT, v_target.gtin)
    ) evidence(field_name, field_value)
    ON CONFLICT (
      formula_id,
      field_name,
      source_url,
      content_hash
    ) DO UPDATE SET
      observation_id = EXCLUDED.observation_id,
      accepted = TRUE,
      observed_at = EXCLUDED.observed_at;

    v_resolved_count := v_resolved_count + 1;
  END LOOP;

  IF v_resolved_count <> 2 THEN
    RAISE EXCEPTION
      'Expected two reviewed SKOKI package repairs, resolved %',
      v_resolved_count;
  END IF;

  UPDATE public.catalog_source_runs run
  SET
    accepted_count = 2,
    rejected_count = 0,
    metadata = run.metadata || jsonb_build_object(
      'resolved_gtin_identity_conflicts', 2,
      'resolved_consumer_brand', 'SKOKI',
      'resolution',
        'reviewed_exact_gtin_url_image_ingredient_equivalence'
    ),
    updated_at = NOW()
  WHERE run.id = v_run_id
    AND run.expected_count = 2
    AND run.observed_count = 2
    AND run.accepted_count = 0
    AND run.rejected_count = 2;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKOKI bounded source-run counts were not updated';
  END IF;

  FOR v_formula_id IN
    SELECT formula.id
    FROM public.catalog_formulas formula
    WHERE formula.formula_key IN (
      'firstmate pet foods|skoki|coastal|dog|all life stages|wet|coastal formula|',
      'firstmate pet foods|skoki|ranch|dog|all life stages|wet|ranch formula|'
    )
    ORDER BY formula.id
  LOOP
    PERFORM * FROM public.promote_catalog_formula(v_formula_id);
  END LOOP;

  SELECT count(*)
  INTO v_result_count
  FROM public.catalog_formulas formula
  JOIN public.product_data serving
    ON serving.cache_key = formula.promoted_cache_key
  JOIN public.catalog_skus sku
    ON sku.formula_id = formula.id
   AND sku.active
  WHERE formula.formula_key IN (
      'firstmate pet foods|skoki|coastal|dog|all life stages|wet|coastal formula|',
      'firstmate pet foods|skoki|ranch|dog|all life stages|wet|ranch formula|'
    )
    AND formula.brand = 'SKOKI'
    AND formula.pet_type = 'dog'
    AND formula.life_stage = 'all life stages'
    AND formula.food_form = 'wet'
    AND formula.flavor IN ('Coastal Formula', 'Ranch Formula')
    AND formula.verification_status = 'verified'
    AND formula.formula_evidence_tier = 'manufacturer_current_exact'
    AND formula.active
    AND serving.brand = 'SKOKI'
    AND serving.pet_type = 'dog'
    AND serving.life_stage = 'all life stages'
    AND serving.food_form = 'wet'
    AND serving.flavor = formula.flavor
    AND serving.product_line = formula.product_line
    AND serving.source_url = formula.source_url
    AND serving.image_url = formula.front_image_url
    AND serving.ingredient_text = formula.ingredient_text
    AND serving.ingredient_count = cardinality(formula.ingredients)
    AND serving.ingredient_verification_status = 'manufacturer'
    AND serving.image_verification_status = 'manufacturer'
    AND serving.formula_evidence_tier = 'manufacturer_current_exact'
    AND serving.is_complete_food
    AND COALESCE(serving.catalog_exclusion_reason, '') = ''
    AND sku.gtin = serving.gtin
    AND sku.gtin IN ('072318123566', '072318123573');

  IF v_result_count <> 2 THEN
    RAISE EXCEPTION
      'Expected two exact promoted SKOKI canned formulas, found %',
      v_result_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.formula_key IN (
      'firstmate|firstmate|skoki can coastal 12 2oz 12 cans|dog|unknown|wet||',
      'firstmate|firstmate|skoki can ranch 12 2oz 12 cans|dog|unknown|wet||'
    )
  ) THEN
    RAISE EXCEPTION 'Legacy umbrella-brand SKOKI formula keys remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    WHERE observation.run_id = v_run_id
      AND (
        observation.validation_status <> 'accepted'
        OR observation.formula_id IS NULL
        OR observation.formula_evidence_tier <>
          'manufacturer_current_exact'
      )
  ) THEN
    RAISE EXCEPTION 'SKOKI bounded observations remain unresolved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data serving
    WHERE serving.cache_key IN (
      'firstmate:072318123566',
      'firstmate:072318123573'
    )
      AND serving.brand <> 'SKOKI'
  ) THEN
    RAISE EXCEPTION 'SKOKI serving rows retain the umbrella FirstMate brand';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE sku.gtin IN ('072318123566', '072318123573')
      AND sku.active
    GROUP BY sku.gtin
    HAVING count(DISTINCT sku.formula_id) <> 1
  ) THEN
    RAISE EXCEPTION 'A repaired SKOKI GTIN maps to multiple active formulas';
  END IF;
END;
$$;
