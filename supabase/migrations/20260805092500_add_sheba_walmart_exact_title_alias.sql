-- Deterministic retailer identity aliases, wave sheba-walmart-title.
-- Generated from outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-walmart-title/aliases.json after exact official/live evidence validation.
-- Retailer rows remain identity-only; this migration never copies retailer
-- ingredients or images into product_data and never changes scoring.

DO $migration$
DECLARE
  v_payload JSONB := convert_from(
    decode('W3siYWxpYXNfZm9ybXVsYV9rZXkiOiJzaGViYXxzaGViYXxzaGViYSBwZXJmZWN0IHBvcnRpb25zIGdyaWxsZWQgcHJlbWl1bSBiaXRlcyBpbiBzYXZvcnkgc2F1Y2Ugd2l0aCBmbGFreSBzYWxtb24gaW4gZ3JhdnkgY2F0IGZvb2QgMiBlYWNofGNhdHx1bmtub3dufHVua25vd258fCIsInNvdXJjZV91cmwiOiJodHRwczovL3d3dy53YWxtYXJ0LmNvbS9pcC9TaGViYS1QZXJmZWN0LVBvcnRpb25zLUdyaWxsZWQtUHJlbWl1bS1CaXRlcy1pbi1TYXZvcnktU2F1Y2Utd2l0aC1GbGFreS1TYWxtb24taW4tR3JhdnktQ2F0LUZvb2QtMi0xLTMyLW96LUVhY2gvMTc4NDA0MDI4NDYiLCJvZmZpY2lhbF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuc2hlYmEuY29tL3Byb2R1Y3RzL3dldC9zaGViYS1ncmlsbGVkLXNhdWNlLWFkdWx0LXdldC1jYXQtZm9vZC1mbGFreS1zYWxtb24tZ3JhdnktMjQtMjY0LW96LXR3aW4tcGFjay10cmF5cyIsImNhY2hlX2tleSI6InNoZWJhLW1hcnMtcGV0Y2FyZTowMjMxMDAxNTIzMDEiLCJyZXZpZXdfbWV0aG9kIjoiZXhhY3RfZXhpc3RpbmdfZm9ybXVsYV9pZGVudGl0eV9vbmx5IiwicmV2aWV3ZWRfYXQiOiIyMDI2LTA4LTA1VDA5OjI1OjAwLjAwMFoiLCJyZXZpZXdfcmVhc29uIjoiVGhlIGZyb3plbiBXYWxtYXJ0IHRpdGxlIGZ1bGx5IGlkZW50aWZpZXMgU0hFQkEgUEVSRkVDVCBQT1JUSU9OUyBHcmlsbGVkIEJpdGVzIGluIFNhdm9yeSBTYXVjZSB3aXRoIEZsYWt5IFNhbG1vbiBpbiBHcmF2eSwgbWF0Y2hpbmcgdGhlIGN1cnJlbnQgZXhhY3QgbWFudWZhY3R1cmVyIGZvcm11bGEuIFRoZSB0d28tY291bnQgcGFja2FnZSBpcyBhIFNLVSBjaGlsZDsgbm8gV2FsbWFydCBpbmdyZWRpZW50cyBvciBpbWFnZSBhcmUgdXNlZC4iLCJyZXZpZXdlZF9vcmlnaW5hbF9ldmlkZW5jZV90aWVyIjoidW52ZXJpZmllZCIsInJldGFpbGVyX2lkZW50aXR5X29ubHkiOnRydWUsInJldGFpbGVyX2luZ3JlZGllbnRfdmVyaWZpY2F0aW9uIjpmYWxzZSwicmV0YWlsZXJfc291cmNlX3NsdWciOiJ3YWxtYXJ0LXB1YmxpYy1zaXRlbWFwIiwicmV0YWlsZXJfcHJvZHVjdF9pZCI6IjE3ODQwNDAyODQ2IiwicmV0YWlsZXJfdGl0bGUiOiJTaGViYSBQZXJmZWN0IFBvcnRpb25zIEdyaWxsZWQgUHJlbWl1bSBCaXRlcyBpbiBTYXZvcnkgU2F1Y2Ugd2l0aCBGbGFreSBTYWxtb24gaW4gR3JhdnkgQ2F0IEZvb2QgMiBFYWNoIiwicmV0YWlsZXJfY29udGVudF9oYXNoIjoiNGM0ODgxY2M2MzdmZjY3NDBmNjFlZWVmNjQ4ZjE1MzE4M2QzMTA5NDk0ZWQ0ZGQxZGNhYzI4MGIzNGY0YmE2MyIsInJldGFpbGVyX29ic2VydmVkX2F0IjoiMjAyNi0wOC0wNVQwMjozMToyMy4xODRaIiwicmV0YWlsZXJfZnJvbnRfaW1hZ2VfdXJsIjoiIiwicmVxdWlyZWRfdGl0bGVfdGVybXMiOlsic2hlYmEiLCJwZXJmZWN0IHBvcnRpb25zIiwiZ3JpbGxlZCIsImJpdGVzIGluIHNhdm9yeSBzYXVjZSIsImZsYWt5IHNhbG1vbiIsImdyYXZ5IiwiY2F0IGZvb2QiXSwib2JzZXJ2ZWRfaWRlbnRpdHkiOnsiYnJhbmQiOiJTaGViYSIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6InVua25vd24iLCJmb29kX2Zvcm0iOiJ1bmtub3duIn0sInRhcmdldF9mb3JtdWxhX2tleSI6InNoZWJhfHNoZWJhfHNoZWJhIGdyaWxsZWR8Y2F0fGFkdWx0fHdldHxzYWxtb258IiwidGFyZ2V0X3NlcnZpbmdfZm9ybXVsYV9rZXkiOiJzaGViYXxzaGViYXxzaGViYSBncmlsbGVkfGNhdHxhZHVsdHx3ZXR8c2FsbW9ufCIsInRhcmdldF9pZGVudGl0eSI6eyJicmFuZCI6IlNoZWJhIiwicHJvZHVjdF9uYW1lIjoiU2hlYmEgR3JpbGxlZCBpbiBTYXVjZSBBZHVsdCBXZXQgQ2F0IEZvb2Qgd2l0aCBGbGFreSBTYWxtb24gaW4gR3JhdnksICgyNCkgMi42NCBvei4gVHdpbi1QYWNrIFRyYXlzIiwicHJvZHVjdF9saW5lIjoiU2hlYmEgR3JpbGxlZCIsImZsYXZvciI6IlNhbG1vbiIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6ImFkdWx0IiwiZm9vZF9mb3JtIjoid2V0In0sIm9mZmljaWFsX2ltYWdlX3VybCI6Imh0dHBzOi8vd3d3LnNoZWJhLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjE4MjYvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy9waWs1Z25vbHE2bXBvbThtbm54aS5wbmciLCJvZmZpY2lhbF9kYXRhYmFzZV9pbWFnZV91cmwiOiJodHRwczovL3d3dy5zaGViYS5jb20vc2l0ZXMvZy9maWxlcy9mbm16ZGYxODI2L2ZpbGVzL21pZ3JhdGUtcHJvZHVjdC1maWxlcy9pbWFnZXMvcGlrNWdub2xxNm1wb204bW5ueGkucG5nIiwib2ZmaWNpYWxfaW5ncmVkaWVudF9jb3VudCI6MzIsIm9mZmljaWFsX2RhdGFiYXNlX2luZ3JlZGllbnRfaGFzaCI6IjVjZjJiNTcwM2M4ODBmN2I3ZjM2OThmNmEyNzZiMjZjMTZiNTZjNzNjNTY3MzNlZWFjNzRjMjE2NjJmODViMWUiLCJvZmZpY2lhbF9jYW5vbmljYWxfaW5ncmVkaWVudF9oYXNoIjoiMzIxYTYyOGQwMTkxMDVjNzgyODRkODM3N2RlYTE1YTIwYWU4ZGM5MmZhOTU0YmIyMjNjMTFlOWZmMGRiMmI0NCJ9XQ==', 'base64'),
    'utf8'
  )::jsonb;
  v_alias JSONB;
  v_formula public.catalog_formulas%ROWTYPE;
  v_serving public.product_data%ROWTYPE;
  v_target_brand TEXT;
  v_target_pet_type TEXT;
  v_target_life_stage TEXT;
  v_target_food_form TEXT;
  v_normalized_alias TEXT;
  v_review_key TEXT;
  v_observation_id BIGINT;
  v_top_cache TEXT;
BEGIN
  FOR v_alias IN
    SELECT value
    FROM jsonb_array_elements(v_payload)
  LOOP
    v_target_brand := COALESCE(
      v_alias->>'target_brand',
      v_alias#>>'{target_identity,brand}'
    );
    v_target_pet_type := COALESCE(
      v_alias->>'target_pet_type',
      v_alias#>>'{target_identity,pet_type}'
    );
    v_target_life_stage := COALESCE(
      v_alias->>'target_life_stage',
      v_alias#>>'{target_identity,life_stage}'
    );
    v_target_food_form := COALESCE(
      v_alias->>'target_food_form',
      v_alias#>>'{target_identity,food_form}'
    );

    SELECT *
    INTO STRICT v_serving
    FROM public.product_data
    WHERE cache_key = v_alias->>'cache_key'
      AND brand = v_target_brand
      AND pet_type = v_target_pet_type
      AND COALESCE(life_stage, 'unknown') = COALESCE(v_target_life_stage, 'unknown')
      AND COALESCE(food_form, 'unknown') = COALESCE(v_target_food_form, 'unknown')
      AND source_url = v_alias->>'official_source_url'
      AND image_url = COALESCE(
        v_alias->>'official_database_image_url',
        v_alias->>'official_image_url'
      )
      AND ingredient_count = (v_alias->>'official_ingredient_count')::INTEGER
      AND encode(
        digest(
          public.catalog_normalize_ingredient_evidence(ingredient_text),
          'sha256'
        ),
        'hex'
      ) = v_alias->>'official_database_ingredient_hash'
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL;

    SELECT *
    INTO STRICT v_formula
    FROM public.catalog_formulas
    WHERE promoted_cache_key = v_serving.cache_key
      AND source_url = v_alias->>'official_source_url'
      AND front_image_url = COALESCE(
        v_alias->>'official_database_image_url',
        v_alias->>'official_image_url'
      )
      AND cardinality(ingredients) = (v_alias->>'official_ingredient_count')::INTEGER
      AND encode(
        digest(
          public.catalog_normalize_ingredient_evidence(ingredient_text),
          'sha256'
        ),
        'hex'
      ) = v_alias->>'official_database_ingredient_hash'
      AND verification_status = 'verified'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND active;

    v_normalized_alias := public.normalize_verified_product_search_query(
      v_alias->>'retailer_title'
    );
    v_review_key := 'deterministic-retailer-identity-wave-sheba-walmart-title:'
      || (v_alias->>'retailer_source_slug')
      || ':' || (v_alias->>'retailer_product_id');

    SELECT observation.id
    INTO v_observation_id
    FROM public.catalog_observations observation
    WHERE observation.source_slug = v_alias->>'retailer_source_slug'
      AND observation.source_external_id = v_alias->>'retailer_product_id'
      AND lower(regexp_replace(observation.source_url, '/+$', '')) =
          lower(regexp_replace(v_alias->>'source_url', '/+$', ''))
      AND lower(btrim(observation.product_name)) =
          lower(btrim(v_alias->>'retailer_title'))
    ORDER BY observation.observed_at DESC NULLS LAST, observation.id DESC
    LIMIT 1;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_formula_aliases
      WHERE alias_formula_key = v_alias->>'alias_formula_key'
        AND formula_id <> v_formula.id
    ) THEN
      RAISE EXCEPTION 'Alias already belongs to another formula: %',
        v_alias->>'alias_formula_key';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_verified_product_search_aliases
      WHERE active
        AND normalized_alias = v_normalized_alias
        AND cache_key <> v_serving.cache_key
    ) THEN
      RAISE EXCEPTION 'Search alias already belongs to another product: %',
        v_alias->>'retailer_title';
    END IF;

    INSERT INTO public.catalog_manual_evidence_reviews (
      review_key,
      target_formula_key,
      corrected_formula_key,
      brand,
      product_name,
      search_query,
      discovery_urls,
      authoritative_source_url,
      authoritative_source_type,
      expected_identity,
      resolved_identity,
      evidence_status,
      quarantine_reason,
      authoritative_content_hash,
      ingredient_text_hash,
      front_image_url_hash,
      observed_at,
      formula_id,
      promoted_cache_key,
      attempt_count,
      review_notes,
      ingredient_evidence_url,
      ingredient_evidence_mode,
      ingredient_original_text_hash,
      ingredient_corrections,
      updated_at
    ) VALUES (
      v_review_key,
      v_alias->>'alias_formula_key',
      v_formula.formula_key,
      v_target_brand,
      v_alias->>'retailer_title',
      v_alias->>'retailer_title',
      jsonb_build_array(
        v_alias->>'source_url',
        v_alias->>'retailer_front_image_url',
        v_alias->>'official_source_url',
        COALESCE(
          v_alias->>'official_database_image_url',
          v_alias->>'official_image_url'
        )
      ),
      v_alias->>'official_source_url',
      'manufacturer_page',
      jsonb_build_object(
        'alias_formula_key', v_alias->>'alias_formula_key',
        'retailer_source_slug', v_alias->>'retailer_source_slug',
        'retailer_product_id', v_alias->>'retailer_product_id',
        'retailer_title', v_alias->>'retailer_title',
        'retailer_source_url', v_alias->>'source_url',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer_front_image_url', v_alias->>'retailer_front_image_url',
        'retailer_front_image_sha256',
          v_alias->>'retailer_front_image_sha256',
        'manual_package_image_match',
          COALESCE((v_alias->>'manual_package_image_match')::BOOLEAN, FALSE),
        'manual_front_label_ocr_match',
          COALESCE((v_alias->>'manual_front_label_ocr_match')::BOOLEAN, FALSE),
        'manual_front_label_visual_match',
          COALESCE((v_alias->>'manual_front_label_visual_match')::BOOLEAN, FALSE),
        'retailer_front_label_ocr', v_alias->>'retailer_front_label_ocr',
        'official_front_label_ocr', v_alias->>'official_front_label_ocr',
        'required_ocr_terms', COALESCE(v_alias->'required_ocr_terms', '[]'::jsonb),
        'required_title_terms',
          COALESCE(v_alias->'required_title_terms', '[]'::jsonb),
        'protected_identity_terms',
          COALESCE(v_alias->'protected_identity_terms', '[]'::jsonb),
        'retailer_package_identifier',
          v_alias->>'retailer_package_identifier',
        'official_package_identifier',
          v_alias->>'official_package_identifier',
        'target_cache_key', v_serving.cache_key,
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-walmart-title/report.json'
      ),
      jsonb_build_object(
        'formula_id', v_formula.id,
        'formula_key', v_formula.formula_key,
        'cache_key', v_serving.cache_key,
        'official_source_url', v_alias->>'official_source_url',
        'official_image_url', COALESCE(
          v_alias->>'official_database_image_url',
          v_alias->>'official_image_url'
        ),
        'official_ingredient_count',
          (v_alias->>'official_ingredient_count')::INTEGER,
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'official_canonical_ingredient_hash',
          v_alias->>'official_canonical_ingredient_hash',
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-walmart-title/report.json'
      ),
      'staged',
      NULL,
      encode(digest(
        (v_alias->>'source_url') || '|' ||
        (v_alias->>'retailer_title') || '|' ||
        (v_alias->>'official_source_url') || '|' ||
        (v_alias->>'official_database_ingredient_hash'),
        'sha256'
      ), 'hex'),
      v_alias->>'official_canonical_ingredient_hash',
      encode(digest(COALESCE(
        v_alias->>'official_database_image_url',
        v_alias->>'official_image_url'
      ), 'sha256'), 'hex'),
      (v_alias->>'retailer_observed_at')::TIMESTAMPTZ,
      NULL,
      v_serving.cache_key,
      1,
      'Exact retailer identity staged for reconciliation to one manufacturer-current formula. Retailer evidence is identity-only and does not verify ingredients or images.',
      v_alias->>'official_source_url',
      'source_text_exact',
      v_alias->>'official_database_ingredient_hash',
      '[]'::jsonb,
      NOW()
    )
    ON CONFLICT (review_key) DO UPDATE
    SET target_formula_key = EXCLUDED.target_formula_key,
        corrected_formula_key = EXCLUDED.corrected_formula_key,
        discovery_urls = EXCLUDED.discovery_urls,
        authoritative_source_url = EXCLUDED.authoritative_source_url,
        expected_identity = EXCLUDED.expected_identity,
        resolved_identity = EXCLUDED.resolved_identity,
        evidence_status = 'staged',
        quarantine_reason = NULL,
        authoritative_content_hash = EXCLUDED.authoritative_content_hash,
        ingredient_text_hash = EXCLUDED.ingredient_text_hash,
        front_image_url_hash = EXCLUDED.front_image_url_hash,
        observed_at = EXCLUDED.observed_at,
        formula_id = NULL,
        promoted_cache_key = EXCLUDED.promoted_cache_key,
        attempt_count = public.catalog_manual_evidence_reviews.attempt_count + 1,
        review_notes = EXCLUDED.review_notes,
        ingredient_evidence_url = EXCLUDED.ingredient_evidence_url,
        ingredient_evidence_mode = EXCLUDED.ingredient_evidence_mode,
        ingredient_original_text_hash = EXCLUDED.ingredient_original_text_hash,
        ingredient_corrections = EXCLUDED.ingredient_corrections,
        updated_at = NOW();

    INSERT INTO public.catalog_formula_aliases (
      alias_formula_key,
      formula_id,
      identity_hash,
      match_reason,
      source_url,
      metadata,
      updated_at
    ) VALUES (
      v_alias->>'alias_formula_key',
      v_formula.id,
      v_formula.identity_hash,
      'manual_review',
      v_alias->>'source_url',
      jsonb_build_object(
        'reason', v_alias->>'review_reason',
        'review_method', v_alias->>'review_method',
        'reviewed_at', v_alias->>'reviewed_at',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer_source_slug', v_alias->>'retailer_source_slug',
        'retailer_product_id', v_alias->>'retailer_product_id',
        'retailer_title', v_alias->>'retailer_title',
        'retailer_observed_at', v_alias->>'retailer_observed_at',
        'retailer_front_image_url', v_alias->>'retailer_front_image_url',
        'retailer_front_image_sha256', v_alias->>'retailer_front_image_sha256',
        'manual_package_image_match',
          COALESCE((v_alias->>'manual_package_image_match')::BOOLEAN, FALSE),
        'manual_front_label_ocr_match',
          COALESCE((v_alias->>'manual_front_label_ocr_match')::BOOLEAN, FALSE),
        'manual_front_label_visual_match',
          COALESCE((v_alias->>'manual_front_label_visual_match')::BOOLEAN, FALSE),
        'required_ocr_terms', COALESCE(v_alias->'required_ocr_terms', '[]'::jsonb),
        'required_title_terms',
          COALESCE(v_alias->'required_title_terms', '[]'::jsonb),
        'protected_identity_terms',
          COALESCE(v_alias->'protected_identity_terms', '[]'::jsonb),
        'retailer_front_label_ocr', v_alias->>'retailer_front_label_ocr',
        'official_front_label_ocr', v_alias->>'official_front_label_ocr',
        'retailer_package_identifier',
          v_alias->>'retailer_package_identifier',
        'official_package_identifier',
          v_alias->>'official_package_identifier',
        'official_artifact_image_sha256',
          v_alias->>'official_artifact_image_sha256',
        'official_source_url', v_alias->>'official_source_url',
        'official_ingredient_hash', v_alias->>'official_canonical_ingredient_hash',
        'official_canonical_ingredient_hash',
          v_alias->>'official_canonical_ingredient_hash',
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'package_size_is_sku_only', TRUE,
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-walmart-title/report.json'
      ),
      NOW()
    )
    ON CONFLICT (alias_formula_key) DO UPDATE
    SET source_url = EXCLUDED.source_url,
        metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
        updated_at = NOW()
    WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

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
    ) VALUES (
      v_serving.cache_key,
      v_alias->>'retailer_title',
      v_normalized_alias,
      v_alias->>'source_url',
      'retailer_identity',
      (v_alias->>'retailer_observed_at')::TIMESTAMPTZ,
      jsonb_build_object(
        'review_key', v_review_key,
        'review_method', v_alias->>'review_method',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer_source_slug', v_alias->>'retailer_source_slug',
        'retailer_product_id', v_alias->>'retailer_product_id',
        'manual_package_image_match',
          COALESCE((v_alias->>'manual_package_image_match')::BOOLEAN, FALSE),
        'manual_front_label_ocr_match',
          COALESCE((v_alias->>'manual_front_label_ocr_match')::BOOLEAN, FALSE),
        'manual_front_label_visual_match',
          COALESCE((v_alias->>'manual_front_label_visual_match')::BOOLEAN, FALSE),
        'formula_id', v_formula.id,
        'official_source_url', v_alias->>'official_source_url',
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-walmart-title/report.json'
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
        provenance = public.catalog_verified_product_search_aliases.provenance
          || EXCLUDED.provenance,
        updated_at = NOW()
    WHERE public.catalog_verified_product_search_aliases.cache_key =
      EXCLUDED.cache_key;

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
      v_formula.id,
      v_observation_id,
      'retailer_exact_identity_alias',
      jsonb_build_object(
        'review_key', v_review_key,
        'alias_formula_key', v_alias->>'alias_formula_key',
        'review_method', v_alias->>'review_method',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer_source_slug', v_alias->>'retailer_source_slug',
        'retailer_product_id', v_alias->>'retailer_product_id',
        'retailer_title', v_alias->>'retailer_title',
        'retailer_front_image_url', v_alias->>'retailer_front_image_url',
        'retailer_front_image_sha256',
          v_alias->>'retailer_front_image_sha256',
        'manual_package_image_match',
          COALESCE((v_alias->>'manual_package_image_match')::BOOLEAN, FALSE),
        'manual_front_label_ocr_match',
          COALESCE((v_alias->>'manual_front_label_ocr_match')::BOOLEAN, FALSE),
        'manual_front_label_visual_match',
          COALESCE((v_alias->>'manual_front_label_visual_match')::BOOLEAN, FALSE),
        'retailer_front_label_ocr', v_alias->>'retailer_front_label_ocr',
        'official_front_label_ocr', v_alias->>'official_front_label_ocr',
        'required_ocr_terms', COALESCE(v_alias->'required_ocr_terms', '[]'::jsonb),
        'required_title_terms',
          COALESCE(v_alias->'required_title_terms', '[]'::jsonb),
        'protected_identity_terms',
          COALESCE(v_alias->'protected_identity_terms', '[]'::jsonb),
        'retailer_package_identifier',
          v_alias->>'retailer_package_identifier',
        'official_package_identifier',
          v_alias->>'official_package_identifier',
        'official_source_url', v_alias->>'official_source_url',
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'official_canonical_ingredient_hash',
          v_alias->>'official_canonical_ingredient_hash',
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-walmart-title/report.json'
      ),
      v_alias->>'source_url',
      'retailer_identity',
      TRUE,
      (v_alias->>'retailer_observed_at')::TIMESTAMPTZ,
      encode(digest(
        v_formula.id::TEXT || '|retailer_exact_identity_alias|' ||
        (v_alias->>'alias_formula_key') || '|' ||
        (v_alias->>'source_url') || '|' ||
        (v_alias->>'official_database_ingredient_hash'),
        'sha256'
      ), 'hex')
    )
    ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
    SET observation_id = EXCLUDED.observation_id,
        field_value = EXCLUDED.field_value,
        source_authority = EXCLUDED.source_authority,
        accepted = TRUE,
        observed_at = EXCLUDED.observed_at;

    UPDATE public.catalog_manual_evidence_reviews
    SET evidence_status = 'promoted',
        formula_id = v_formula.id,
        corrected_formula_key = v_formula.formula_key,
        promoted_cache_key = v_serving.cache_key,
        review_notes = review_notes ||
          ' Reconciliation, field evidence, and exact-title search alias promoted; serving evidence unchanged.',
        updated_at = NOW()
    WHERE review_key = v_review_key
      AND evidence_status = 'staged';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Staged evidence review did not promote: %', v_review_key;
    END IF;

    SELECT result.cache_key
    INTO v_top_cache
    FROM public.search_verified_products(v_alias->>'retailer_title', 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache IS DISTINCT FROM v_serving.cache_key THEN
      RAISE EXCEPTION 'Exact-title search regression for %: expected %, got %',
        v_alias->>'retailer_product_id', v_serving.cache_key, v_top_cache;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.catalog_formula_aliases
      WHERE metadata->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-walmart-title/report.json') <>
      jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_manual_evidence_reviews
         WHERE review_key LIKE
           'deterministic-retailer-identity-wave-sheba-walmart-title:%'
           AND evidence_status = 'promoted'
           AND formula_id IS NOT NULL) <> jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_verified_product_search_aliases
         WHERE active
           AND provenance->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-walmart-title/report.json') <>
           jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_field_evidence
         WHERE accepted
           AND field_name = 'retailer_exact_identity_alias'
           AND field_value->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-walmart-title/report.json') <>
           jsonb_array_length(v_payload) THEN
    RAISE EXCEPTION 'Wave sheba-walmart-title evidence promotion postcondition failed';
  END IF;
END
$migration$;
