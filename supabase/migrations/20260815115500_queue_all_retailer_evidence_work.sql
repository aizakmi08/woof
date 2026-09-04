-- Make every current non-serving retailer row auditable. Exact identity/image
-- gaps keep their existing queue entries; fetch failures and validation blocks
-- now receive their own durable, source-backed work items as well.

CREATE OR REPLACE FUNCTION public.queue_all_retailer_evidence_work(
  p_import_run_id UUID
)
RETURNS TABLE(
  unmatched_queue_items INTEGER,
  image_queue_items INTEGER,
  fetch_queue_items INTEGER,
  validation_queue_items INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_unmatched INTEGER := 0;
  v_images INTEGER := 0;
  v_fetch INTEGER := 0;
  v_validation INTEGER := 0;
BEGIN
  SELECT gaps.unmatched_queue_items, gaps.image_queue_items
  INTO v_unmatched, v_images
  FROM public.queue_retailer_ingredient_gaps(p_import_run_id) gaps;

  UPDATE public.catalog_acquisition_queue queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'superseded_retailer_snapshot',
    last_refreshed_at = now(),
    updated_at = now()
  WHERE queue.sample_metadata->>'import_run_id' = p_import_run_id::TEXT
    AND (
      queue.gap_key LIKE 'retailer-evidence-fetch:%'
      OR queue.gap_key LIKE 'retailer-evidence-validation:%'
    );

  WITH grouped AS (
    SELECT
      source_slug,
      pet_type,
      public.catalog_normalize_retailer_title(
        COALESCE(NULLIF(formula_title, ''), product_name)
      ) AS identity_title,
      min(product_name) AS product_name,
      count(*)::INTEGER AS affected_count,
      (array_agg(source_external_id ORDER BY source_external_id))[1:10]
        AS sample_skus,
      (array_agg(source_url ORDER BY source_external_id))[1:5]
        AS sample_urls,
      (array_agg(fetch_status ORDER BY source_external_id))[1:5]
        AS sample_fetch_statuses,
      (array_agg(fetch_error ORDER BY source_external_id))[1:5]
        AS sample_fetch_errors
    FROM public.catalog_retailer_ingredient_evidence
    WHERE import_run_id = p_import_run_id
      AND evidence_status = 'fetch_unresolved'
      AND is_current
    GROUP BY source_slug, pet_type,
      public.catalog_normalize_retailer_title(
        COALESCE(NULLIF(formula_title, ''), product_name)
      )
  ), inserted AS (
    INSERT INTO public.catalog_acquisition_queue (
      gap_key, gap_type, status, priority_score, product_name,
      normalized_query, pet_type, product_source, source_quality, source_url,
      needs_product_record, needs_verified_ingredients, needs_verified_image,
      needs_pet_type, ready_rows, affected_product_count, sample_metadata,
      acquisition_notes, last_refreshed_at, updated_at
    )
    SELECT
      'retailer-evidence-fetch:' || source_slug || ':' ||
        encode(extensions.digest(identity_title || '|' || pet_type, 'sha256'), 'hex'),
      'product', 'open', 85, product_name, identity_title, pet_type,
      source_slug || '-retailer-web', 'retailer_listing', sample_urls[1],
      true, true, true, pet_type = 'unknown', 0, affected_count,
      jsonb_build_object(
        'source', source_slug,
        'sample_retailer_skus', to_jsonb(sample_skus),
        'sample_source_urls', to_jsonb(sample_urls),
        'sample_fetch_statuses', to_jsonb(sample_fetch_statuses),
        'sample_fetch_errors', to_jsonb(sample_fetch_errors),
        'ingredient_evidence_available', false,
        'import_run_id', p_import_run_id
      ),
      'Retailer row has no usable full ingredient evidence. Retry the source or acquire an exact manufacturer/package-label statement and image.',
      now(), now()
    FROM grouped
    WHERE identity_title <> ''
    ON CONFLICT (gap_key) DO UPDATE SET
      status = 'open',
      priority_score = EXCLUDED.priority_score,
      product_name = EXCLUDED.product_name,
      normalized_query = EXCLUDED.normalized_query,
      pet_type = EXCLUDED.pet_type,
      product_source = EXCLUDED.product_source,
      source_quality = EXCLUDED.source_quality,
      source_url = EXCLUDED.source_url,
      needs_product_record = EXCLUDED.needs_product_record,
      needs_verified_ingredients = EXCLUDED.needs_verified_ingredients,
      needs_verified_image = EXCLUDED.needs_verified_image,
      needs_pet_type = EXCLUDED.needs_pet_type,
      affected_product_count = EXCLUDED.affected_product_count,
      sample_metadata = EXCLUDED.sample_metadata,
      acquisition_notes = EXCLUDED.acquisition_notes,
      resolved_at = NULL,
      resolution_reason = NULL,
      last_refreshed_at = now(),
      updated_at = now()
    RETURNING gap_key
  )
  SELECT count(*)::INTEGER INTO v_fetch FROM inserted;

  WITH grouped AS (
    SELECT
      source_slug,
      pet_type,
      public.catalog_normalize_retailer_title(
        COALESCE(NULLIF(formula_title, ''), product_name)
      ) AS identity_title,
      validation_reasons,
      min(product_name) AS product_name,
      count(*)::INTEGER AS affected_count,
      (array_agg(source_external_id ORDER BY source_external_id))[1:10]
        AS sample_skus,
      (array_agg(source_url ORDER BY source_external_id))[1:5]
        AS sample_urls
    FROM public.catalog_retailer_ingredient_evidence
    WHERE import_run_id = p_import_run_id
      AND evidence_status = 'quarantined_validation'
      AND is_current
    GROUP BY source_slug, pet_type, validation_reasons,
      public.catalog_normalize_retailer_title(
        COALESCE(NULLIF(formula_title, ''), product_name)
      )
  ), inserted AS (
    INSERT INTO public.catalog_acquisition_queue (
      gap_key, gap_type, status, priority_score, product_name,
      normalized_query, pet_type, product_source, source_quality, source_url,
      needs_product_record, needs_verified_ingredients, needs_verified_image,
      needs_pet_type, ready_rows, affected_product_count, sample_metadata,
      acquisition_notes, last_refreshed_at, updated_at
    )
    SELECT
      'retailer-evidence-validation:' || source_slug || ':' ||
        encode(extensions.digest(
          identity_title || '|' || pet_type || '|' || array_to_string(validation_reasons, ','),
          'sha256'
        ), 'hex'),
      'product', 'open',
      CASE
        WHEN validation_reasons && ARRAY[
          'analysis_or_page_copy_in_ingredients',
          'placeholder_ingredient_text',
          'truncated_ingredient_text'
        ]::TEXT[] THEN 82
        WHEN validation_reasons && ARRAY[
          'unbalanced_ingredient_delimiters',
          'variant_ingredient_mismatch'
        ]::TEXT[] THEN 76
        WHEN validation_reasons && ARRAY[
          'unknown_or_ambiguous_pet_type',
          'no_complete_food_identity_signal'
        ]::TEXT[] THEN 65
        ELSE 35
      END,
      product_name, identity_title, pet_type, source_slug || '-retailer-web',
      'retailer_verified', sample_urls[1],
      validation_reasons && ARRAY[
        'variant_ingredient_mismatch',
        'unknown_or_ambiguous_pet_type',
        'non_dog_cat_product',
        'non_complete_or_non_food_identity',
        'no_complete_food_identity_signal'
      ]::TEXT[],
      validation_reasons && ARRAY[
        'missing_ingredient_text',
        'placeholder_ingredient_text',
        'ingredient_text_too_short',
        'too_few_ingredients',
        'unbalanced_ingredient_delimiters',
        'analysis_or_page_copy_in_ingredients',
        'truncated_ingredient_text'
      ]::TEXT[],
      true,
      'unknown_or_ambiguous_pet_type' = ANY(validation_reasons),
      0, affected_count,
      jsonb_build_object(
        'source', source_slug,
        'validation_reasons', to_jsonb(validation_reasons),
        'sample_retailer_skus', to_jsonb(sample_skus),
        'sample_source_urls', to_jsonb(sample_urls),
        'ingredient_evidence_available', true,
        'import_run_id', p_import_run_id
      ),
      'Retailer evidence failed one or more identity, completeness, or ingredient-quality gates. Review the exact package; never fuzzy-promote or inherit a sibling formula.',
      now(), now()
    FROM grouped
    WHERE identity_title <> ''
    ON CONFLICT (gap_key) DO UPDATE SET
      status = 'open',
      priority_score = EXCLUDED.priority_score,
      product_name = EXCLUDED.product_name,
      normalized_query = EXCLUDED.normalized_query,
      pet_type = EXCLUDED.pet_type,
      product_source = EXCLUDED.product_source,
      source_quality = EXCLUDED.source_quality,
      source_url = EXCLUDED.source_url,
      needs_product_record = EXCLUDED.needs_product_record,
      needs_verified_ingredients = EXCLUDED.needs_verified_ingredients,
      needs_verified_image = EXCLUDED.needs_verified_image,
      needs_pet_type = EXCLUDED.needs_pet_type,
      affected_product_count = EXCLUDED.affected_product_count,
      sample_metadata = EXCLUDED.sample_metadata,
      acquisition_notes = EXCLUDED.acquisition_notes,
      resolved_at = NULL,
      resolution_reason = NULL,
      last_refreshed_at = now(),
      updated_at = now()
    RETURNING gap_key
  )
  SELECT count(*)::INTEGER INTO v_validation FROM inserted;

  RETURN QUERY SELECT v_unmatched, v_images, v_fetch, v_validation;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_all_retailer_evidence_work(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_all_retailer_evidence_work(UUID)
  TO service_role;
