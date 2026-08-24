-- Turn every safe-but-unlinked retailer ingredient record and every linked
-- missing-image record into a durable acquisition item. Formula titles are
-- normalized so package-size siblings share one queue item.

CREATE OR REPLACE FUNCTION public.queue_retailer_ingredient_gaps(
  p_import_run_id UUID
)
RETURNS TABLE(unmatched_queue_items INTEGER, image_queue_items INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
  WITH stale_closed AS (
    UPDATE public.catalog_acquisition_queue queue
    SET
      status = 'resolved',
      resolved_at = now(),
      resolution_reason = 'superseded_retailer_snapshot',
      last_refreshed_at = now(),
      updated_at = now()
    WHERE queue.sample_metadata->>'import_run_id' = p_import_run_id::TEXT
      AND (
        queue.gap_key LIKE 'retailer-evidence-unmatched:%'
        OR queue.gap_key LIKE 'retailer-evidence-image:%'
      )
    RETURNING queue.gap_key
  ), grouped AS (
    SELECT
      source_slug,
      pet_type,
      public.catalog_normalize_retailer_title(formula_title) AS identity_title,
      min(formula_title) AS product_name,
      count(*)::INTEGER AS affected_count,
      (array_agg(source_external_id ORDER BY source_external_id))[1:10] AS sample_skus,
      (array_agg(source_url ORDER BY source_external_id))[1:5] AS sample_urls
    FROM public.catalog_retailer_ingredient_evidence
    WHERE import_run_id = p_import_run_id
      AND evidence_status = 'unmatched_catalog_sku'
      AND is_current
    GROUP BY
      source_slug,
      pet_type,
      public.catalog_normalize_retailer_title(formula_title)
  ), inserted_unmatched AS (
    INSERT INTO public.catalog_acquisition_queue (
      gap_key,
      gap_type,
      status,
      priority_score,
      product_name,
      normalized_query,
      pet_type,
      product_source,
      source_quality,
      source_url,
      needs_product_record,
      needs_verified_ingredients,
      needs_verified_image,
      ready_rows,
      affected_product_count,
      sample_metadata,
      acquisition_notes,
      last_refreshed_at,
      updated_at
    )
    SELECT
      'retailer-evidence-unmatched:' || source_slug || ':' ||
        encode(extensions.digest(identity_title || '|' || pet_type, 'sha256'), 'hex'),
      'product',
      'open',
      CASE WHEN source_slug = 'chewy' THEN 70 ELSE 65 END,
      product_name,
      identity_title,
      pet_type,
      source_slug || '-retailer-web',
      'retailer_verified',
      sample_urls[1],
      true,
      false,
      true,
      0,
      affected_count,
      jsonb_build_object(
        'source', source_slug,
        'sample_retailer_skus', to_jsonb(sample_skus),
        'sample_source_urls', to_jsonb(sample_urls),
        'ingredient_evidence_available', true,
        'import_run_id', p_import_run_id
      ),
      'Exact retailer ingredient evidence exists, but no unique canonical catalog SKU identity is linked. Acquire exact identity/front image; do not fuzzy-promote.',
      now(),
      now()
    FROM grouped
    WHERE identity_title <> ''
    ON CONFLICT (gap_key) DO UPDATE SET
      status = CASE
        WHEN public.catalog_acquisition_queue.status = 'resolved' THEN 'open'
        ELSE public.catalog_acquisition_queue.status
      END,
      priority_score = greatest(
        public.catalog_acquisition_queue.priority_score,
        EXCLUDED.priority_score
      ),
      product_name = EXCLUDED.product_name,
      normalized_query = EXCLUDED.normalized_query,
      pet_type = EXCLUDED.pet_type,
      product_source = EXCLUDED.product_source,
      source_quality = EXCLUDED.source_quality,
      source_url = EXCLUDED.source_url,
      needs_product_record = true,
      needs_verified_ingredients = false,
      needs_verified_image = true,
      affected_product_count = EXCLUDED.affected_product_count,
      sample_metadata = EXCLUDED.sample_metadata,
      acquisition_notes = EXCLUDED.acquisition_notes,
      resolved_at = NULL,
      resolution_reason = NULL,
      last_refreshed_at = now(),
      updated_at = now()
    RETURNING gap_key
  ), image_grouped AS (
    SELECT
      linked_formula_id,
      min(product_name) AS product_name,
      min(formula_title) AS formula_title,
      min(pet_type) AS pet_type,
      count(*)::INTEGER AS affected_count,
      (array_agg(source_external_id ORDER BY source_external_id))[1:10] AS sample_skus,
      (array_agg(source_url ORDER BY source_external_id))[1:5] AS sample_urls
    FROM public.catalog_retailer_ingredient_evidence
    WHERE import_run_id = p_import_run_id
      AND evidence_status = 'linked_missing_exact_image'
      AND is_current
    GROUP BY linked_formula_id
  ), inserted_images AS (
    INSERT INTO public.catalog_acquisition_queue (
      gap_key,
      gap_type,
      status,
      priority_score,
      product_name,
      normalized_query,
      pet_type,
      product_source,
      source_quality,
      source_url,
      needs_product_record,
      needs_verified_ingredients,
      needs_verified_image,
      ready_rows,
      affected_product_count,
      sample_metadata,
      acquisition_notes,
      last_refreshed_at,
      updated_at
    )
    SELECT
      'retailer-evidence-image:walmart:formula:' || linked_formula_id,
      'product',
      'open',
      75,
      product_name,
      public.catalog_normalize_retailer_title(formula_title),
      pet_type,
      'walmart-retailer-web',
      'retailer_verified',
      sample_urls[1],
      false,
      false,
      true,
      0,
      affected_count,
      jsonb_build_object(
        'source', 'walmart',
        'linked_formula_id', linked_formula_id,
        'sample_retailer_skus', to_jsonb(sample_skus),
        'sample_source_urls', to_jsonb(sample_urls),
        'ingredient_evidence_available', true,
        'import_run_id', p_import_run_id
      ),
      'Exact Walmart SKU/formula and ingredients are linked; acquire the exact package image before customer-serving promotion.',
      now(),
      now()
    FROM image_grouped
    ON CONFLICT (gap_key) DO UPDATE SET
      status = CASE
        WHEN public.catalog_acquisition_queue.status = 'resolved' THEN 'open'
        ELSE public.catalog_acquisition_queue.status
      END,
      priority_score = greatest(
        public.catalog_acquisition_queue.priority_score,
        EXCLUDED.priority_score
      ),
      product_name = EXCLUDED.product_name,
      normalized_query = EXCLUDED.normalized_query,
      pet_type = EXCLUDED.pet_type,
      source_url = EXCLUDED.source_url,
      needs_product_record = false,
      needs_verified_ingredients = false,
      needs_verified_image = true,
      affected_product_count = EXCLUDED.affected_product_count,
      sample_metadata = EXCLUDED.sample_metadata,
      acquisition_notes = EXCLUDED.acquisition_notes,
      resolved_at = NULL,
      resolution_reason = NULL,
      last_refreshed_at = now(),
      updated_at = now()
    RETURNING gap_key
  )
  SELECT
    (SELECT count(*)::INTEGER FROM inserted_unmatched),
    (SELECT count(*)::INTEGER FROM inserted_images);
$function$;

REVOKE ALL ON FUNCTION public.queue_retailer_ingredient_gaps(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_retailer_ingredient_gaps(UUID)
  TO service_role;
