-- Stage and promote the exact current Tiki Cat Koolina Luau Chicken & Egg
-- shredded formula. The source row comes from the official Tiki PDP and is a
-- bounded one-formula evidence batch, not a claim that the full catalog crawl
-- completed.

SELECT public.stage_catalog_census_batch(
  convert_from(decode('eyJydW5fa2V5IjoidGlraS1wZXRzOmJvdW5kZWQtZXhhY3QtZXZpZGVuY2U6ZmJjOTc4OGU3OGU3Mzc3YWNjZTA5NmE5Iiwic291cmNlX3NsdWciOiJ0aWtpLXBldHMiLCJzb3VyY2VfdHlwZSI6Im1hbnVmYWN0dXJlciIsImNvdmVyYWdlX3JvbGUiOiJ2ZXJpZmljYXRpb24iLCJzdGF0dXMiOiJjb21wbGV0ZWQiLCJzdGFydGVkX2F0IjoiMjAyNi0wOC0wNFQwMToyODoyMS4xOTlaIiwiZXhwZWN0ZWRfY291bnQiOjEsInBhZ2luYXRpb25fY29tcGxldGUiOmZhbHNlLCJ0cnVuY2F0ZWQiOmZhbHNlLCJjYXBfcmVhY2hlZCI6ZmFsc2UsInNvdXJjZV9jb250ZW50X2hhc2giOiJmYmM5Nzg4ZTc4ZTczNzdhY2NlMDk2YTlkMDJmNDJhM2JiYjhiZjU3MzFlNTlkYWQ1OThiZWM3MTczZTRkZDJjIiwiY2hlY2twb2ludCI6eyJmZWVkX3Jvd19jb3VudCI6MSwiYWNjZXB0ZWRfb2JzZXJ2YXRpb25fY291bnQiOjEsImNhbm9uaWNhbF9mb3JtdWxhX2NvdW50IjoxfSwibWV0YWRhdGEiOnsiYnJhbmQiOiJUaWtpIENhdCIsIm1hbnVmYWN0dXJlciI6IlRpa2kgUGV0cyIsInNvdXJjZV9hdXRob3JpdHkiOiJtYW51ZmFjdHVyZXIiLCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlLCJwYWNrYWdlX3NpemVfaXNfc2t1X29ubHkiOnRydWUsInF1YXJhbnRpbmVkX2NvdW50IjowLCJzY29wZV9leGNsdWRlZF9ub25fY29tcGxldGVfY291bnQiOjAsInNvdXJjZV9mZWVkX3Jvd19jb3VudCI6MSwiYnJhbmRfc2NvcGVkX2ZlZWRfcm93X2NvdW50IjoxLCJzb3VyY2VfZmVlZF9vdXRfb2Zfc2NvcGVfY291bnQiOjAsInNvdXJjZV9mZWVkX291dF9vZl9zY29wZV9icmFuZHMiOltdLCJzZXJ2aW5nX2V2aWRlbmNlX2luY2x1ZGVfY291bnQiOjAsInNlcnZpbmdfZXZpZGVuY2VfcHJlZmxpZ2h0X2V4Y2x1ZGVkX2NvdW50IjowLCJzZXJ2aW5nX2V2aWRlbmNlX3ByZWZsaWdodF9leGNsdWRlZF9jYWNoZV9rZXlzIjpbXSwic2t1X29ubHlfb2JzZXJ2YXRpb25fY291bnQiOjAsInNrdV9vbmx5X29ic2VydmF0aW9uX2NhY2hlX2tleXMiOltdLCJyZXZpZXdlZF9zZXJ2aW5nX2lkZW50aXR5X2NvdW50IjowLCJyZXZpZXdlZF9zZXJ2aW5nX2lkZW50aXR5X2NhY2hlX2tleXMiOltdLCJzZXJ2aW5nX2NhY2hlX2tleV9tYXBwaW5nX2NvdW50IjowLCJzZXJ2aW5nX2NhY2hlX2tleV9tb2RlIjoiYnJhbmQtdGl0bGUtdXJsIiwib2ZmaWNpYWxfaW52ZW50b3J5X2Z1bGwiOmZhbHNlLCJib3VuZGVkX2V4YWN0X2V2aWRlbmNlIjp0cnVlLCJjdXJyZW50X29mZmljaWFsX3NrdV9jYWNoZV9rZXlzIjpbInRpa2ktcGV0czp0aWtpIGNhdCBjaGlja2VuIGVnZyBsdWF1IGNoaWNrZW4td2l0aC1lZ2ciXSwiY3VycmVudF9zZXJ2aW5nX2NhY2hlX2tleXMiOlsidGlraS1wZXRzOnRpa2kgY2F0IGNoaWNrZW4gZWdnIGx1YXUgY2hpY2tlbi13aXRoLWVnZyJdfX0=', 'base64'), 'UTF8')::jsonb,
  convert_from(decode('W3siZm9ybXVsYV9rZXkiOiJ0aWtpIHBldHN8dGlraSBjYXR8Y2hpY2tlbiBhbmQgZWdnIHRpa2kgY2F0IHdldCBmb29kIHNocmVkZGVkIGNhdCBsdWF1IGNoaWNrZW4gd2l0aCBlZ2d8Y2F0fHVua25vd258d2V0fGNoaWNrZW4gYW5kIGVnZ3wiLCJpZGVudGl0eV9oYXNoIjoiMTRhNjQ5OTRmYjYzYTZmOGEwYTczY2FiZGU0M2VkYTE2MjcxMTI3ZDIzN2Q1MDkxNzY4MjY0MzQ1ODU0YjdjMCIsIm1hbnVmYWN0dXJlciI6IlRpa2kgUGV0cyIsImJyYW5kIjoiVGlraSBDYXQiLCJwcm9kdWN0X25hbWUiOiJDaGlja2VuICYgRWdnIiwicHJvZHVjdF9saW5lIjoiS29vbGluYSBMdWF1IiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoidW5rbm93biIsImZvb2RfZm9ybSI6IndldCIsImZsYXZvciI6IkNoaWNrZW4gJiBFZ2ciLCJkaWV0X2NvbmRpdGlvbiI6IiIsInNvdXJjZV9zbHVnIjoidGlraS1wZXRzIiwic291cmNlX2V4dGVybmFsX2lkIjoidGlraS1wZXRzOnRpa2kgY2F0IGNoaWNrZW4gZWdnIGx1YXUgY2hpY2tlbi13aXRoLWVnZyIsInNvdXJjZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS9wcm9kdWN0L3Rpa2ktY2F0L3Rpa2ktY2F0LXdldC1mb29kL3NocmVkZGVkLWNhdC9sdWF1L2NoaWNrZW4td2l0aC1lZ2cvIiwic291cmNlX2F1dGhvcml0eSI6Im1hbnVmYWN0dXJlciIsImd0aW4iOiIiLCJwYWNrYWdlX3NpemUiOiIiLCJpbmdyZWRpZW50X3RleHQiOiJDaGlja2VuLCBjaGlja2VuIGJyb3RoLCBkcmllZCBlZ2csIHN1bmZsb3dlciBzZWVkIG9pbCwgY2FsY2l1bSBsYWN0YXRlLCBkaWNhbGNpdW0gcGhvc3BoYXRlLCBwb3Rhc3NpdW0gY2hsb3JpZGUsIHRhdXJpbmUsIGNob2xpbmUgY2hsb3JpZGUsIHNhbHQsIG1hZ25lc2l1bSBzdWxmYXRlLCBmZXJyb3VzIHN1bGZhdGUsIHRoaWFtaW5lIG1vbm9uaXRyYXRlICh2aXRhbWluIEIxKSwgdml0YW1pbiBFIHN1cHBsZW1lbnQsIG5pYWNpbiAodml0YW1pbiBCMyksIHppbmMgb3hpZGUsIHZpdGFtaW4gQSBzdXBwbGVtZW50LCBiaW90aW4sIHZpdGFtaW4gQjEyIHN1cHBsZW1lbnQsIG1hbmdhbm91cyBveGlkZSwgY2FsY2l1bSBwYW50b3RoZW5hdGUsIGNvcHBlciBhbWlubyBhY2lkIGNoZWxhdGUsIHJpYm9mbGF2aW4gc3VwcGxlbWVudCAodml0YW1pbiBCMiksIHNvZGl1bSBzZWxlbml0ZSwgcHlyaWRveGluZSBoeWRyb2NobG9yaWRlICh2aXRhbWluIEI2KSwgZm9saWMgYWNpZCwgcG90YXNzaXVtIGlvZGlkZSwgdml0YW1pbiBEMyBzdXBwbGVtZW50LiIsImluZ3JlZGllbnRzIjpbIkNoaWNrZW4iLCJjaGlja2VuIGJyb3RoIiwiZHJpZWQgZWdnIiwic3VuZmxvd2VyIHNlZWQgb2lsIiwiY2FsY2l1bSBsYWN0YXRlIiwiZGljYWxjaXVtIHBob3NwaGF0ZSIsInBvdGFzc2l1bSBjaGxvcmlkZSIsInRhdXJpbmUiLCJjaG9saW5lIGNobG9yaWRlIiwic2FsdCIsIm1hZ25lc2l1bSBzdWxmYXRlIiwiZmVycm91cyBzdWxmYXRlIiwidGhpYW1pbmUgbW9ub25pdHJhdGUgKHZpdGFtaW4gQjEpIiwidml0YW1pbiBFIHN1cHBsZW1lbnQiLCJuaWFjaW4gKHZpdGFtaW4gQjMpIiwiemluYyBveGlkZSIsInZpdGFtaW4gQSBzdXBwbGVtZW50IiwiYmlvdGluIiwidml0YW1pbiBCMTIgc3VwcGxlbWVudCIsIm1hbmdhbm91cyBveGlkZSIsImNhbGNpdW0gcGFudG90aGVuYXRlIiwiY29wcGVyIGFtaW5vIGFjaWQgY2hlbGF0ZSIsInJpYm9mbGF2aW4gc3VwcGxlbWVudCAodml0YW1pbiBCMikiLCJzb2RpdW0gc2VsZW5pdGUiLCJweXJpZG94aW5lIGh5ZHJvY2hsb3JpZGUgKHZpdGFtaW4gQjYpIiwiZm9saWMgYWNpZCIsInBvdGFzc2l1bSBpb2RpZGUiLCJ2aXRhbWluIEQzIHN1cHBsZW1lbnQiXSwiZnJvbnRfaW1hZ2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vd3AtY29udGVudC91cGxvYWRzLzIwMTgvMDEvY2hpY2tlbi1lZ2ctMi44b3oucG5nIiwiaXNfY29tcGxldGVfZm9vZCI6dHJ1ZSwiYXZhaWxhYmxlX2luX3VzIjp0cnVlLCJwcm90ZWN0ZWRfdGVybXMiOlsiVGlraSBDYXQiLCJLb29saW5hIEx1YXUiLCJDaGlja2VuICYgRWdnIiwiY2F0Iiwid2V0Il0sIm9ic2VydmVkX2F0IjoiMjAyNi0wOC0wNFQwMToyODoyMS4xOTlaIiwiY29udGVudF9oYXNoIjoiYjYxMTIzNTFjNDc2ZTg4OWM2ZDkyYjZiNWVmMTVjNzJhMmQ2NTZmMDYzOGI0ZGVmNGNhODczYjA4MDAzN2JlYiIsInZhbGlkYXRpb25fc3RhdHVzIjoiYWNjZXB0ZWQiLCJ2YWxpZGF0aW9uX3JlYXNvbnMiOltdLCJpbmdyZWRpZW50X3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJtYW51ZmFjdHVyZXIiLCJpbWFnZV92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiY292ZXJhZ2VfdGllciI6InRpZXJfMV91c19yZXRhaWwiLCJyYXdfcGF5bG9hZCI6eyJjYWNoZV9rZXkiOiJ0aWtpLXBldHM6dGlraSBjYXQgY2hpY2tlbiBlZ2cgbHVhdSBjaGlja2VuLXdpdGgtZWdnIiwiaW5ncmVkaWVudF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vcHJvZHVjdC90aWtpLWNhdC90aWtpLWNhdC13ZXQtZm9vZC9zaHJlZGRlZC1jYXQvbHVhdS9jaGlja2VuLXdpdGgtZWdnLyIsImltYWdlX3NvdXJjZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS9wcm9kdWN0L3Rpa2ktY2F0L3Rpa2ktY2F0LXdldC1mb29kL3NocmVkZGVkLWNhdC9sdWF1L2NoaWNrZW4td2l0aC1lZ2cvIiwiY2Fub25pY2FsX2Zvcm11bGFfaWRlbnRpdHkiOnsibWFudWZhY3R1cmVyIjoidGlraSBwZXRzIiwiYnJhbmQiOiJ0aWtpIGNhdCIsInByb2R1Y3RfbGluZSI6ImNoaWNrZW4gYW5kIGVnZyB0aWtpIGNhdCB3ZXQgZm9vZCBzaHJlZGRlZCBjYXQgbHVhdSBjaGlja2VuIHdpdGggZWdnIiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoidW5rbm93biIsImZvb2RfZm9ybSI6IndldCIsImZsYXZvciI6ImNoaWNrZW4gYW5kIGVnZyIsImRpZXRfY29uZGl0aW9uIjoiIn0sImV4YWN0X2Zvcm11bGFfZXZpZGVuY2UiOnRydWUsInBhY2thZ2Vfc2l6ZV9pc19za3Vfb25seSI6dHJ1ZX19XQ==', 'base64'), 'UTF8')::jsonb
) AS stage_result;
-- The legacy full-feed run grouped this Luau shredded product with the Velvet
-- Mousse sibling because both official pages use the short title "Chicken &
-- Egg". Reassign only the exact Luau PDP/package/ingredient observation and
-- its SKU child before promoting the separately staged canonical formula.
DO $$
DECLARE
  v_run_id BIGINT;
  v_formula_id BIGINT;
  v_mousse_formula_id BIGINT;
  v_promoted_cache_key TEXT;
  v_relinked_observations INTEGER;
  v_relinked_skus INTEGER;
BEGIN
  SELECT run.id
  INTO STRICT v_run_id
  FROM public.catalog_source_runs run
  WHERE run.run_key = 'tiki-pets:bounded-exact-evidence:fbc9788e78e7377acce096a9'
    AND run.status = 'quarantined'
    AND run.error_summary = 'run_not_proven_complete'
    AND run.metadata->>'bounded_exact_evidence' = 'true'
    AND run.metadata->>'exact_formula_evidence' = 'true'
    AND run.expected_count = 1
    AND run.observed_count = 1
    AND run.accepted_count = 1
    AND run.rejected_count = 0;

  SELECT formula.id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas formula
  JOIN public.catalog_observations observation
    ON observation.formula_id = formula.id
  WHERE observation.run_id = v_run_id
    AND observation.validation_status = 'accepted'
    AND formula.brand = 'Tiki Cat'
    AND formula.product_name = 'Chicken & Egg'
    AND formula.product_line = 'Koolina Luau'
    AND formula.flavor = 'Chicken & Egg'
    AND formula.pet_type = 'cat'
    AND formula.life_stage = 'unknown'
    AND formula.food_form = 'wet'
    AND formula.source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/luau/chicken-with-egg/'
    AND formula.front_image_url =
      'https://tikipets.com/wp-content/uploads/2018/01/chicken-egg-2.8oz.png'
    AND cardinality(formula.ingredients) = 28
    AND formula.ingredient_verification_status = 'manufacturer'
    AND formula.image_verification_status = 'manufacturer'
    AND formula.formula_evidence_tier = 'manufacturer_current_exact';

  SELECT formula.id
  INTO STRICT v_mousse_formula_id
  FROM public.catalog_formulas formula
  WHERE formula.source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-cat/velvet-mousse/chicken-with-egg-2/'
    AND formula.front_image_url =
      'https://tikipets.com/wp-content/uploads/2018/01/velvetmoussechxegggroupimage.png'
    AND formula.brand = 'Tiki Cat'
    AND formula.pet_type = 'cat'
    AND formula.food_form = 'wet';

  IF v_formula_id = v_mousse_formula_id THEN
    RAISE EXCEPTION 'Tiki Luau shredded and Velvet Mousse formulas were not split';
  END IF;

  UPDATE public.catalog_observations observation
  SET formula_id = v_formula_id,
      product_line = 'Koolina Luau',
      flavor = 'Chicken & Egg',
      pet_type = 'cat',
      life_stage = 'unknown',
      food_form = 'wet',
      formula_evidence_tier = 'manufacturer_current_exact'
  FROM public.catalog_formulas formula
  WHERE formula.id = v_formula_id
    AND observation.source_slug = 'tiki-pets'
    AND observation.source_external_id =
      'tiki-pets:tiki cat chicken egg luau chicken-with-egg'
    AND observation.source_url = formula.source_url
    AND observation.front_image_url = formula.front_image_url
    AND lower(regexp_replace(btrim(observation.ingredient_text), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(formula.ingredient_text), '\s+', ' ', 'g'));

  GET DIAGNOSTICS v_relinked_observations = ROW_COUNT;
  IF v_relinked_observations < 1 THEN
    RAISE EXCEPTION 'No exact Tiki Luau Chicken & Egg observation was relinked';
  END IF;

  UPDATE public.catalog_skus sku
  SET formula_id = v_formula_id,
      updated_at = NOW()
  WHERE sku.source_slug = 'tiki-pets'
    AND sku.source_external_id =
      'tiki-pets:tiki cat chicken egg luau chicken-with-egg'
    AND sku.source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/luau/chicken-with-egg/';

  GET DIAGNOSTICS v_relinked_skus = ROW_COUNT;
  IF v_relinked_skus <> 1 THEN
    RAISE EXCEPTION
      'Expected one Tiki Luau Chicken & Egg SKU child, relinked %',
      v_relinked_skus;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    WHERE observation.formula_id = v_mousse_formula_id
      AND observation.source_url =
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/luau/chicken-with-egg/'
  ) THEN
    RAISE EXCEPTION 'Luau shredded evidence remains attached to Velvet Mousse';
  END IF;

  PERFORM * FROM public.promote_catalog_formula(v_formula_id);

  SELECT formula.promoted_cache_key
  INTO STRICT v_promoted_cache_key
  FROM public.catalog_formulas formula
  WHERE formula.id = v_formula_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data serving
    WHERE serving.cache_key = v_promoted_cache_key
      AND serving.product_name = 'Chicken & Egg'
      AND serving.product_line = 'Koolina Luau'
      AND serving.flavor = 'Chicken & Egg'
      AND serving.pet_type = 'cat'
      AND COALESCE(serving.life_stage, 'unknown') = 'unknown'
      AND serving.food_form = 'wet'
      AND serving.source_url =
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/luau/chicken-with-egg/'
      AND serving.image_url =
        'https://tikipets.com/wp-content/uploads/2018/01/chicken-egg-2.8oz.png'
      AND serving.ingredient_count = 28
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
      AND serving.is_complete_food = TRUE
      AND COALESCE(serving.catalog_exclusion_reason, '') = ''
  ) THEN
    RAISE EXCEPTION 'Tiki Luau Chicken & Egg exact serving-row postconditions failed';
  END IF;
END;
$$;

