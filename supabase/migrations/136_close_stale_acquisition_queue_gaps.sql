-- Keep catalog acquisition backlog aligned with the current ready catalog.
-- Earlier refreshes could leave product/brand rows open after their source
-- product was later excluded, demoted from complete food, or fully verified.

CREATE OR REPLACE FUNCTION public.close_stale_catalog_acquisition_queue_gaps(
  p_resolved_at TIMESTAMPTZ DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_rows INTEGER := 0;
  v_brand_rows INTEGER := 0;
BEGIN
  WITH classified AS (
    SELECT
      cache_key,
      COALESCE(NULLIF(trim(brand), ''), '[unknown brand]') AS brand,
      ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      ) AS has_verified_ingredients,
      image_url IS NOT NULL
        AND image_url !~* '^data:'
        AND image_verification_status IN (
          'official',
          'manufacturer',
          'retailer_verified',
          'scan_preview'
        ) AS has_verified_image,
      CASE
        WHEN pet_type IN ('dog', 'cat') THEN pet_type
        WHEN lower(concat_ws(' ', product_name, brand)) ~ '\m(dog|puppy|canine)\M' THEN 'dog'
        WHEN lower(concat_ws(' ', product_name, brand)) ~ '\m(cat|kitten|feline)\M' THEN 'cat'
        ELSE 'unknown'
      END AS inferred_pet_type
    FROM public.product_data
    WHERE expires_at > p_resolved_at
      AND ingredient_count >= 5
      AND is_complete_food = TRUE
      AND catalog_exclusion_reason IS NULL
  ),
  stale_product_rows AS (
    SELECT
      q.id,
      c.cache_key IS NOT NULL
        AND c.has_verified_ingredients
        AND c.has_verified_image
        AND c.inferred_pet_type <> 'unknown' AS is_fully_verified
    FROM public.catalog_acquisition_queue q
    LEFT JOIN classified c
      ON q.gap_key = 'product:' || c.cache_key
    WHERE q.status IN ('open', 'in_progress')
      AND q.gap_type = 'product'
      AND (
        c.cache_key IS NULL
        OR (
          c.has_verified_ingredients
          AND c.has_verified_image
          AND c.inferred_pet_type <> 'unknown'
        )
      )
  ),
  updated_product_rows AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = CASE
        WHEN stale_product_rows.is_fully_verified THEN 'resolved'
        ELSE 'deferred'
      END,
      resolved_at = p_resolved_at,
      resolution_reason = CASE
        WHEN stale_product_rows.is_fully_verified THEN 'ready catalog product now has verified ingredients, verified image, and pet type'
        ELSE 'catalog product is no longer a ready complete-food acquisition gap'
      END,
      sample_metadata = q.sample_metadata
        || jsonb_build_object(
          'closed_by', 'close_stale_catalog_acquisition_queue_gaps',
          'closed_at', p_resolved_at,
          'stale_reason', CASE
            WHEN stale_product_rows.is_fully_verified THEN 'fully_verified'
            ELSE 'not_ready_complete_food'
          END
        ),
      updated_at = p_resolved_at
    FROM stale_product_rows
    WHERE q.id = stale_product_rows.id
    RETURNING q.id
  )
  SELECT count(*)::INTEGER
    INTO v_product_rows
  FROM updated_product_rows;

  WITH classified AS (
    SELECT
      COALESCE(NULLIF(trim(brand), ''), '[unknown brand]') AS brand,
      ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      ) AS has_verified_ingredients,
      image_url IS NOT NULL
        AND image_url !~* '^data:'
        AND image_verification_status IN (
          'official',
          'manufacturer',
          'retailer_verified',
          'scan_preview'
        ) AS has_verified_image,
      CASE
        WHEN pet_type IN ('dog', 'cat') THEN pet_type
        WHEN lower(concat_ws(' ', product_name, brand)) ~ '\m(dog|puppy|canine)\M' THEN 'dog'
        WHEN lower(concat_ws(' ', product_name, brand)) ~ '\m(cat|kitten|feline)\M' THEN 'cat'
        ELSE 'unknown'
      END AS inferred_pet_type
    FROM public.product_data
    WHERE expires_at > p_resolved_at
      AND ingredient_count >= 5
      AND is_complete_food = TRUE
      AND catalog_exclusion_reason IS NULL
  ),
  stale_brand_rows AS (
    SELECT q.id
    FROM public.catalog_acquisition_queue q
    WHERE q.status IN ('open', 'in_progress')
      AND q.gap_type = 'brand'
      AND NOT EXISTS (
        SELECT 1
        FROM classified c
        WHERE lower(c.brand) = lower(COALESCE(q.brand, ''))
          AND (
            NOT c.has_verified_ingredients
            OR NOT c.has_verified_image
            OR c.inferred_pet_type = 'unknown'
          )
      )
  ),
  updated_brand_rows AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = p_resolved_at,
      resolution_reason = 'brand no longer has ready complete-food acquisition gaps',
      sample_metadata = q.sample_metadata
        || jsonb_build_object(
          'closed_by', 'close_stale_catalog_acquisition_queue_gaps',
          'closed_at', p_resolved_at,
          'stale_reason', 'brand_has_no_ready_gaps'
        ),
      updated_at = p_resolved_at
    FROM stale_brand_rows
    WHERE q.id = stale_brand_rows.id
    RETURNING q.id
  )
  SELECT count(*)::INTEGER
    INTO v_brand_rows
  FROM updated_brand_rows;

  RETURN jsonb_build_object(
    'closed_product_rows', v_product_rows,
    'closed_brand_rows', v_brand_rows,
    'closed_total_rows', v_product_rows + v_brand_rows,
    'closed_at', p_resolved_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_stale_catalog_acquisition_queue_gaps(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_stale_catalog_acquisition_queue_gaps(TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.close_stale_catalog_acquisition_queue_gaps(TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_catalog_acquisition_queue_gaps(TIMESTAMPTZ) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.refresh_catalog_acquisition_queue(integer, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql LIKE '%close_stale_catalog_acquisition_queue_gaps%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    'GET DIAGNOSTICS v_upserted_rows = ROW_COUNT;

  RETURN jsonb_build_object(',
    'GET DIAGNOSTICS v_upserted_rows = ROW_COUNT;

  PERFORM public.close_stale_catalog_acquisition_queue_gaps(v_started_at);

  RETURN jsonb_build_object('
  );

  IF function_sql NOT LIKE '%close_stale_catalog_acquisition_queue_gaps%' THEN
    RAISE EXCEPTION 'refresh_catalog_acquisition_queue stale closer patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

SELECT public.close_stale_catalog_acquisition_queue_gaps(now());
