-- Historical lookup misses must not remain open after the exact verified
-- catalog can answer them. Canonical SKU children and current verified search
-- results are both valid closure evidence; neither path relaxes promotion.

CREATE OR REPLACE FUNCTION public.close_resolved_catalog_lookup_gaps(
  p_resolved_at TIMESTAMPTZ DEFAULT now(),
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_safe_limit INTEGER :=
    LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
  v_closed_rows INTEGER := 0;
BEGIN
  WITH candidate_queue_rows AS MATERIALIZED (
    SELECT queue.id
    FROM public.catalog_acquisition_queue queue
    WHERE queue.status IN ('open', 'in_progress')
      AND queue.gap_type = 'lookup'
      AND (
        (
          NULLIF(trim(queue.cache_key), '') IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.catalog_skus sku
            JOIN public.catalog_formulas formula
              ON formula.id = sku.formula_id
             AND formula.active
             AND formula.verification_status = 'verified'
             AND formula.promoted_cache_key IS NOT NULL
            JOIN public.product_data product
              ON product.cache_key = formula.promoted_cache_key
            WHERE sku.active
              AND sku.source_external_id = queue.cache_key
              AND public.catalog_quality_state(
                product.pet_type,
                product.is_complete_food,
                product.catalog_exclusion_reason,
                product.ingredient_text,
                COALESCE(array_length(product.ingredients, 1), 0),
                product.ingredient_verification_status,
                product.image_url,
                product.image_verification_status,
                product.source_url,
                product.expires_at
              ) = 'verified_ready'
          )
        )
        OR (
          NULLIF(trim(queue.normalized_query), '') IS NOT NULL
          AND queue.normalized_query <> '[blank]'
          AND EXISTS (
            SELECT 1
            FROM public.search_verified_products(
              queue.normalized_query,
              1
            )
          )
        )
      )
    ORDER BY queue.priority_score DESC, queue.last_event_at DESC NULLS LAST
    LIMIT v_safe_limit
  ),
  updated AS (
    UPDATE public.catalog_acquisition_queue queue
    SET
      status = 'resolved',
      resolved_at = p_resolved_at,
      resolution_reason =
        'current strict verified lookup now returns a safe catalog result',
      sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'closed_by', 'close_resolved_catalog_lookup_gaps',
          'closed_at', p_resolved_at,
          'closure_basis',
            'canonical verified SKU or current strict verified search'
        ),
      updated_at = p_resolved_at
    FROM candidate_queue_rows candidate
    WHERE queue.id = candidate.id
    RETURNING queue.id
  )
  SELECT count(*)::INTEGER
  INTO v_closed_rows
  FROM updated;

  RETURN jsonb_build_object(
    'closed_lookup_rows', v_closed_rows,
    'closed_at', p_resolved_at,
    'limit', v_safe_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.close_resolved_catalog_lookup_gaps(TIMESTAMPTZ, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.close_resolved_catalog_lookup_gaps(TIMESTAMPTZ, INTEGER)
  FROM anon;
REVOKE ALL ON FUNCTION
  public.close_resolved_catalog_lookup_gaps(TIMESTAMPTZ, INTEGER)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION
  public.close_resolved_catalog_lookup_gaps(TIMESTAMPTZ, INTEGER)
  TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.refresh_catalog_acquisition_queue(integer, integer)'::regprocedure
  )
  INTO function_sql;

  IF function_sql LIKE '%close_resolved_catalog_lookup_gaps%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    'PERFORM public.close_stale_catalog_acquisition_queue_gaps(v_started_at);',
    'PERFORM public.close_stale_catalog_acquisition_queue_gaps(v_started_at);
  PERFORM public.close_resolved_catalog_lookup_gaps(v_started_at, v_limit);'
  );

  IF function_sql NOT LIKE '%close_resolved_catalog_lookup_gaps%' THEN
    RAISE EXCEPTION
      'refresh_catalog_acquisition_queue resolved lookup closer patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

SELECT public.close_resolved_catalog_lookup_gaps(now(), 500);

DO $$
DECLARE
  remaining_regression_gap_count INTEGER;
BEGIN
  SELECT count(*)
  INTO remaining_regression_gap_count
  FROM public.catalog_acquisition_queue queue
  WHERE queue.status IN ('open', 'in_progress')
    AND queue.cache_key =
      'petsmart-retail-catalog:038100105776'
    AND queue.normalized_query = 'purina pro paln chicken';

  IF remaining_regression_gap_count <> 0 THEN
    RAISE EXCEPTION
      'resolved Pro Plan typo lookup remained open after verified lookup repair';
  END IF;
END $$;
