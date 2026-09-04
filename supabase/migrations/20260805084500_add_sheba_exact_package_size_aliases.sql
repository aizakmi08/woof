-- Deterministic retailer identity aliases, wave sheba-package.
-- Generated from outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-package-aliases/aliases.json after exact official/live evidence validation.
-- Retailer rows remain identity-only; this migration never copies retailer
-- ingredients or images into product_data and never changes scoring.

DO $migration$
DECLARE
  v_payload JSONB := convert_from(
    decode('W3siYWxpYXNfZm9ybXVsYV9rZXkiOiJzaGViYXxzaGViYXxzaGViYSBwZXJmZWN0IHBvcnRpb25zIGN1dHMgaW4gZ3JhdnkgdHVuYSBhbmQgc2VhZm9vZCBmbGF2b3IgYWR1bHQgd2V0IGNhdCBmb29kIHR3aW4gcGFja3xjYXR8YWR1bHR8d2V0fHwiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cudGFyZ2V0LmNvbS9wL3NoZWJhLXBlcmZlY3QtcG9ydGlvbnMtY3V0cy1pbi1ncmF2eS10dW5hLWFuZC1zZWFmb29kLWZsYXZvci1hZHVsdC13ZXQtY2F0LWZvb2QtdHdpbi1wYWNrLXRyYXktMi02NG96Ly0vQS01MDY5MzU4MiIsIm9mZmljaWFsX3NvdXJjZV91cmwiOiJodHRwczovL3d3dy5zaGViYS5jb20vcHJvZHVjdHMvd2V0L3NoZWJhLXBlcmZlY3QtcG9ydGlvbnMtY3V0cy1ncmF2eS1zdXN0YWluYWJsZS10dW5hLWVudHJlZSIsImNhY2hlX2tleSI6InNoZWJhLW1hcnMtcGV0Y2FyZTowMjMxMDAxMTQxNTYiLCJyZXZpZXdfbWV0aG9kIjoiZXhhY3RfZXhpc3RpbmdfZm9ybXVsYV9pZGVudGl0eV9vbmx5IiwicmV2aWV3ZWRfYXQiOiIyMDI2LTA4LTA1VDA4OjM1OjAwLjAwMFoiLCJyZXZpZXdfcmVhc29uIjoiVGhlIGZyb3plbiBUYXJnZXQgcGFja2FnZSBpbWFnZSBhbmQgY3VycmVudCBTaGViYSBpbWFnZSBzaG93IHRoZSBzYW1lIFBFUkZFQ1QgUE9SVElPTlMgQ3V0cyBpbiBHcmF2eSBTdXN0YWluYWJsZSBUdW5hIEVudHLDqWUgdHJheSwgaW5jbHVkaW5nIHRoZSBzYW1lIHZpc2libGUgcGFja2FnZSBpZGVudGlmaWVyIDE1MDA2NTc1LiBUYXJnZXQncyBicm9hZGVyIHRpdGxlIGlzIHJldGFpbGVyIHRheG9ub215IG9ubHk7IG5vIHJldGFpbGVyIGluZ3JlZGllbnRzIGFyZSB1c2VkLiIsInJldmlld2VkX29yaWdpbmFsX2V2aWRlbmNlX3RpZXIiOiJ1bnZlcmlmaWVkIiwicmV0YWlsZXJfaWRlbnRpdHlfb25seSI6dHJ1ZSwicmV0YWlsZXJfaW5ncmVkaWVudF92ZXJpZmljYXRpb24iOmZhbHNlLCJyZXRhaWxlcl9zb3VyY2Vfc2x1ZyI6InRhcmdldC1wdWJsaWMtc2l0ZW1hcCIsInJldGFpbGVyX3Byb2R1Y3RfaWQiOiJBLTUwNjkzNTgyIiwicmV0YWlsZXJfdGl0bGUiOiJzaGViYSBwZXJmZWN0IHBvcnRpb25zIGN1dHMgaW4gZ3JhdnkgdHVuYSBhbmQgc2VhZm9vZCBmbGF2b3IgYWR1bHQgd2V0IGNhdCBmb29kIHR3aW4gcGFjayIsInJldGFpbGVyX2NvbnRlbnRfaGFzaCI6IjBkNmY1ODk0NDA0MDY4ZmU2ZDE4Mjg1ZWE3MTk4YjQ2NTQ1NjI5Mzc3NjA4YTAxZmU0OGUxNDkyOWY1NTAwNDciLCJyZXRhaWxlcl9vYnNlcnZlZF9hdCI6IjIwMjYtMDgtMDVUMDI6MjY6NDQuMzg2WiIsInJldGFpbGVyX2Zyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vdGFyZ2V0LnNjZW5lNy5jb20vaXMvaW1hZ2UvVGFyZ2V0L0dVRVNUXzhlNTI3ZWM1LTk4YzQtNDkzMS04MmNhLThhODcwNDI0ZjVjNSIsInJldGFpbGVyX2Zyb250X2ltYWdlX3NoYTI1NiI6ImQwN2QwMjk1NWExODhiZjdlZmQ4Mzk4NTExZTM2MzU3YjYzYTQ2OGViYWU0ZWVkNmEwZWQ1YTU1NzNmNjZlYWYiLCJtYW51YWxfcGFja2FnZV9pbWFnZV9tYXRjaCI6dHJ1ZSwicmV0YWlsZXJfcGFja2FnZV9pZGVudGlmaWVyIjoiMTUwMDY1NzUiLCJyZXF1aXJlZF90aXRsZV90ZXJtcyI6WyJzaGViYSIsInBlcmZlY3QgcG9ydGlvbnMiLCJjdXRzIGluIGdyYXZ5IiwidHVuYSIsIndldCBjYXQgZm9vZCIsInR3aW4gcGFjayJdLCJvYnNlcnZlZF9pZGVudGl0eSI6eyJicmFuZCI6IlNoZWJhIiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoiYWR1bHQiLCJmb29kX2Zvcm0iOiJ3ZXQifSwidGFyZ2V0X2Zvcm11bGFfa2V5Ijoic2hlYmF8c2hlYmF8cGVyZmVjdCBwb3J0aW9ucyBjdXRzIGluIGdyYXZ5IHN1c3RhaW5hYmxlfGNhdHxhbGwgc3RhZ2VzfHdldHx0dW5hfCIsInRhcmdldF9pZGVudGl0eSI6eyJicmFuZCI6IlNoZWJhIiwicHJvZHVjdF9uYW1lIjoiU0hFQkEgUEVSRkVDVCBQT1JUSU9OUyBDdXRzIGluIEdyYXZ5IFN1c3RhaW5hYmxlIFR1bmEgRW50csOpZSIsInByb2R1Y3RfbGluZSI6IlBFUkZFQ1QgUE9SVElPTlMgQ3V0cyBpbiBHcmF2eSBTdXN0YWluYWJsZSIsImZsYXZvciI6IlR1bmEiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJhbGwgc3RhZ2VzIiwiZm9vZF9mb3JtIjoid2V0In0sIm9mZmljaWFsX2ltYWdlX3VybCI6Imh0dHBzOi8vd3d3LnNoZWJhLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjE4MjYvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy9ibjRrbGZpdGtlb25lcWZybWZkcy5wbmciLCJvZmZpY2lhbF9hcnRpZmFjdF9pbWFnZV9zaGEyNTYiOiI0Mjg0ZWExYmI0NjgyNWU2NzA0MmQ4N2E3MTg5NjA0M2JjOTY0Mjk4YjEzNzk4YjYyZjc0MGRkMWI1ODlmZjAyIiwib2ZmaWNpYWxfcGFja2FnZV9pZGVudGlmaWVyIjoiMTUwMDY1NzUiLCJvZmZpY2lhbF9pbmdyZWRpZW50X2NvdW50IjozMSwib2ZmaWNpYWxfZGF0YWJhc2VfaW5ncmVkaWVudF9oYXNoIjoiNGIzNjE5MjBjZTgzNTc5YWYzZWEzZjllMGVlYjliZGI4OTM1NTQ3ODk2Njc4ZDc3YTU3MjIwMDM2NDI0MDMyZiIsIm9mZmljaWFsX2Nhbm9uaWNhbF9pbmdyZWRpZW50X2hhc2giOiJhNjAwNWIyYWFjZTYxY2I1MmJiY2EzYjYxODcxN2NjZWJiMDk4YWJlMDEzMGM5MjEzOWNhNjNlNDYzYTFkNjRkIn0seyJhbGlhc19mb3JtdWxhX2tleSI6InNoZWJhfHNoZWJhfHNoZWJhIHBlcmZlY3QgcG9ydGlvbnMgY3V0cyBpbiBncmF2eSB0ZW5kZXIgdHVya2V5IGFkdWx0IHdldCBjYXQgZm9vZCB0d2luIHBhY2t8Y2F0fGFkdWx0fHdldHx8Iiwic291cmNlX3VybCI6Imh0dHBzOi8vd3d3LnRhcmdldC5jb20vcC9zaGViYS1wZXJmZWN0LXBvcnRpb25zLWN1dHMtaW4tZ3JhdnktdGVuZGVyLXR1cmtleS1hZHVsdC13ZXQtY2F0LWZvb2QtdHdpbi1wYWNrLXRyYXktMi02NG96Ly0vQS01MDY5NDE2NSIsIm9mZmljaWFsX3NvdXJjZV91cmwiOiJodHRwczovL3d3dy5zaGViYS5jb20vcHJvZHVjdHMvd2V0L3NoZWJhLXBlcmZlY3QtcG9ydGlvbnMtY3V0cy1ncmF2eS10ZW5kZXItdHVya2V5LWVudHJlZSIsImNhY2hlX2tleSI6InNoZWJhLW1hcnMtcGV0Y2FyZTowMjMxMDAxMTQxNzAiLCJyZXZpZXdfbWV0aG9kIjoiZXhhY3RfZXhpc3RpbmdfZm9ybXVsYV9pZGVudGl0eV9vbmx5IiwicmV2aWV3ZWRfYXQiOiIyMDI2LTA4LTA1VDA4OjM1OjAwLjAwMFoiLCJyZXZpZXdfcmVhc29uIjoiVGhlIGZyb3plbiBUYXJnZXQgcGFja2FnZSBpbWFnZSBhbmQgY3VycmVudCBTaGViYSBpbWFnZSBzaG93IHRoZSBzYW1lIFBFUkZFQ1QgUE9SVElPTlMgQ3V0cyBpbiBHcmF2eSBUZW5kZXIgVHVya2V5IEVudHLDqWUgdHJheSwgaW5jbHVkaW5nIHRoZSBzYW1lIHZpc2libGUgcGFja2FnZSBpZGVudGlmaWVyIDE0MzM0MTQuIFRhcmdldCdzIGFkdWx0IHRheG9ub215IGRvZXMgbm90IHJlcGxhY2UgdGhlIGV4YWN0IGFsbC1zdGFnZXMgbWFudWZhY3R1cmVyIGlkZW50aXR5OyBubyByZXRhaWxlciBpbmdyZWRpZW50cyBhcmUgdXNlZC4iLCJyZXZpZXdlZF9vcmlnaW5hbF9ldmlkZW5jZV90aWVyIjoidW52ZXJpZmllZCIsInJldGFpbGVyX2lkZW50aXR5X29ubHkiOnRydWUsInJldGFpbGVyX2luZ3JlZGllbnRfdmVyaWZpY2F0aW9uIjpmYWxzZSwicmV0YWlsZXJfc291cmNlX3NsdWciOiJ0YXJnZXQtcHVibGljLXNpdGVtYXAiLCJyZXRhaWxlcl9wcm9kdWN0X2lkIjoiQS01MDY5NDE2NSIsInJldGFpbGVyX3RpdGxlIjoic2hlYmEgcGVyZmVjdCBwb3J0aW9ucyBjdXRzIGluIGdyYXZ5IHRlbmRlciB0dXJrZXkgYWR1bHQgd2V0IGNhdCBmb29kIHR3aW4gcGFjayIsInJldGFpbGVyX2NvbnRlbnRfaGFzaCI6ImU5ODJlNzQxMzI2MWQwOTI1ZTZkODYwMTEyZGEzOGRjMTVkNzdmNDA4Mzc4OWRjYmJkODRmMTVlOTg2NGE5ZjIiLCJyZXRhaWxlcl9vYnNlcnZlZF9hdCI6IjIwMjYtMDgtMDVUMDI6Mjc6MTIuMzQ1WiIsInJldGFpbGVyX2Zyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vdGFyZ2V0LnNjZW5lNy5jb20vaXMvaW1hZ2UvVGFyZ2V0L0dVRVNUX2JlYWM2NGJlLTg1MWYtNGNkMy1iNmQ4LTEwMmMxZmJkOWUyYSIsInJldGFpbGVyX2Zyb250X2ltYWdlX3NoYTI1NiI6IjMyYzY2MmU3M2EwYjgwMDRkMWVlYmE3Njk5ZTNlZDIzNmM1MGY5MDU2ZDliNWQxYjU5OTgyZDliZWZiZjA3MzIiLCJtYW51YWxfcGFja2FnZV9pbWFnZV9tYXRjaCI6dHJ1ZSwicmV0YWlsZXJfcGFja2FnZV9pZGVudGlmaWVyIjoiMTQzMzQxNCIsInJlcXVpcmVkX3RpdGxlX3Rlcm1zIjpbInNoZWJhIiwicGVyZmVjdCBwb3J0aW9ucyIsImN1dHMgaW4gZ3JhdnkiLCJ0ZW5kZXIgdHVya2V5Iiwid2V0IGNhdCBmb29kIiwidHdpbiBwYWNrIl0sIm9ic2VydmVkX2lkZW50aXR5Ijp7ImJyYW5kIjoiU2hlYmEiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJhZHVsdCIsImZvb2RfZm9ybSI6IndldCJ9LCJ0YXJnZXRfZm9ybXVsYV9rZXkiOiJzaGViYXxzaGViYXxjdXRzIGluIGdyYXZ5fGNhdHxhbGwgc3RhZ2VzfHdldHx0dXJrZXl8IiwidGFyZ2V0X2lkZW50aXR5Ijp7ImJyYW5kIjoiU2hlYmEiLCJwcm9kdWN0X25hbWUiOiJTSEVCQSBQRVJGRUNUIFBPUlRJT05TIEN1dHMgaW4gR3JhdnkgVGVuZGVyIFR1cmtleSBFbnRyw6llIiwicHJvZHVjdF9saW5lIjoiQ3V0cyBpbiBHcmF2eSIsImZsYXZvciI6IlR1cmtleSIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6ImFsbCBzdGFnZXMiLCJmb29kX2Zvcm0iOiJ3ZXQifSwib2ZmaWNpYWxfaW1hZ2VfdXJsIjoiaHR0cHM6Ly93d3cuc2hlYmEuY29tL3NpdGVzL2cvZmlsZXMvZm5temRmMTgyNi9maWxlcy9taWdyYXRlLXByb2R1Y3QtZmlsZXMvaW1hZ2VzL2NidHdobTE1eWlpbWl1ZTFnbzBpLnBuZyIsIm9mZmljaWFsX2FydGlmYWN0X2ltYWdlX3NoYTI1NiI6IjUzZGMxYzI1NzM1OTk0ODQwMmY3YjkyNzZjMzE2NjUwMjZkMzZlMDU2MzQ0ZThmM2QwZjQyOWYwZjg5NDhkNjUiLCJvZmZpY2lhbF9wYWNrYWdlX2lkZW50aWZpZXIiOiIxNDMzNDE0Iiwib2ZmaWNpYWxfaW5ncmVkaWVudF9jb3VudCI6MzEsIm9mZmljaWFsX2RhdGFiYXNlX2luZ3JlZGllbnRfaGFzaCI6IjIyMDhmMmQwNmJmNGNlYWIyNDA2NWE2MjI3ZWJlYjgxMjUxOWJiZDZlNDc0ZTA4OWU3Nzg3YTlmOTU2ZjMxZTEiLCJvZmZpY2lhbF9jYW5vbmljYWxfaW5ncmVkaWVudF9oYXNoIjoiMzZmNzZlNTY4NjcyZjFiNTU3YWViNzJmNTk1ZTMzYTZkOGU2OTU1ZDZjYTA0OGNhMTg2ZjE5OGFjNWRiZmQzZCJ9XQ==', 'base64'),
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
    v_review_key := 'deterministic-retailer-identity-wave-sheba-package:'
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
        'target_cache_key', v_serving.cache_key,
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-package-aliases/report.json'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-package-aliases/report.json'
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
        'protected_identity_terms',
          COALESCE(v_alias->'protected_identity_terms', '[]'::jsonb),
        'official_artifact_image_sha256',
          v_alias->>'official_artifact_image_sha256',
        'official_source_url', v_alias->>'official_source_url',
        'official_ingredient_hash', v_alias->>'official_canonical_ingredient_hash',
        'official_canonical_ingredient_hash',
          v_alias->>'official_canonical_ingredient_hash',
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'package_size_is_sku_only', TRUE,
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-package-aliases/report.json'
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
        'formula_id', v_formula.id,
        'official_source_url', v_alias->>'official_source_url',
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-package-aliases/report.json'
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
        'official_source_url', v_alias->>'official_source_url',
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'official_canonical_ingredient_hash',
          v_alias->>'official_canonical_ingredient_hash',
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-package-aliases/report.json'
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
      WHERE metadata->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-package-aliases/report.json') <>
      jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_manual_evidence_reviews
         WHERE review_key LIKE
           'deterministic-retailer-identity-wave-sheba-package:%'
           AND evidence_status = 'promoted'
           AND formula_id IS NOT NULL) <> jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_verified_product_search_aliases
         WHERE active
           AND provenance->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-package-aliases/report.json') <>
           jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_field_evidence
         WHERE accepted
           AND field_name = 'retailer_exact_identity_alias'
           AND field_value->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260805-sheba-package-aliases/report.json') <>
           jsonb_array_length(v_payload) THEN
    RAISE EXCEPTION 'Wave sheba-package evidence promotion postcondition failed';
  END IF;
END
$migration$;
