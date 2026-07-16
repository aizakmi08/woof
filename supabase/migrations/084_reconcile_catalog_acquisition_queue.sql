-- Close acquisition queue rows when imported catalog data now satisfies the
-- verification requirements that originally created the row.

ALTER TABLE public.catalog_acquisition_queue
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_reason TEXT;

CREATE OR REPLACE FUNCTION public.reconcile_catalog_acquisition_queue()
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_product_rows INTEGER := 0;
  v_brand_rows INTEGER := 0;
  v_lookup_rows INTEGER := 0;
BEGIN
  WITH product_state AS (
    SELECT
      q.id,
      pd.cache_key IS NOT NULL AS has_record,
      pd.cache_key IS NOT NULL
        AND pd.expires_at > v_now
        AND pd.ingredient_count >= 5
        AND pd.is_complete_food = TRUE
        AND pd.catalog_exclusion_reason IS NULL AS is_ready,
      COALESCE(pd.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      ), FALSE) AS has_verified_ingredients,
      COALESCE(pd.image_url IS NOT NULL
        AND pd.image_url !~* '^data:'
        AND pd.image_verification_status IN (
          'official',
          'manufacturer',
          'retailer_verified',
          'scan_preview'
        ), FALSE) AS has_verified_image,
      CASE
        WHEN COALESCE(pd.pet_type, 'unknown') IN ('dog', 'cat') THEN TRUE
        WHEN lower(concat_ws(' ', pd.product_name, pd.brand)) ~ '\m(dog|puppy|canine)\M' THEN TRUE
        WHEN lower(concat_ws(' ', pd.product_name, pd.brand)) ~ '\m(cat|kitten|feline)\M' THEN TRUE
        ELSE FALSE
      END AS has_pet_type
    FROM public.catalog_acquisition_queue q
    LEFT JOIN public.product_data pd
      ON pd.cache_key = q.cache_key
    WHERE q.gap_type = 'product'
      AND q.status IN ('open', 'in_progress', 'imported')
  ),
  resolved_products AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'catalog product now satisfies queued verification needs',
      updated_at = v_now,
      sample_metadata = q.sample_metadata || jsonb_build_object(
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue'
      )
    FROM product_state ps
    WHERE q.id = ps.id
      AND (NOT q.needs_product_record OR (ps.has_record AND ps.is_ready))
      AND (NOT q.needs_verified_ingredients OR ps.has_verified_ingredients)
      AND (NOT q.needs_verified_image OR ps.has_verified_image)
      AND (NOT q.needs_pet_type OR ps.has_pet_type)
    RETURNING 1
  )
  SELECT count(*) INTO v_product_rows
  FROM resolved_products;

  WITH ready AS (
    SELECT
      product_name,
      COALESCE(NULLIF(trim(brand), ''), '[unknown brand]') AS brand,
      COALESCE(pet_type, 'unknown') AS pet_type,
      image_url,
      ingredient_verification_status,
      image_verification_status
    FROM public.product_data
    WHERE expires_at > v_now
      AND ingredient_count >= 5
      AND is_complete_food = TRUE
      AND catalog_exclusion_reason IS NULL
  ),
  classified AS (
    SELECT
      *,
      COALESCE(ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      ), FALSE) AS has_verified_ingredients,
      COALESCE(image_url IS NOT NULL
        AND image_url !~* '^data:'
        AND image_verification_status IN (
          'official',
          'manufacturer',
          'retailer_verified',
          'scan_preview'
        ), FALSE) AS has_verified_image,
      CASE
        WHEN pet_type IN ('dog', 'cat') THEN TRUE
        WHEN lower(concat_ws(' ', product_name, brand)) ~ '\m(dog|puppy|canine)\M' THEN TRUE
        WHEN lower(concat_ws(' ', product_name, brand)) ~ '\m(cat|kitten|feline)\M' THEN TRUE
        ELSE FALSE
      END AS has_pet_type
    FROM ready
  ),
  brand_state AS (
    SELECT
      q.id,
      count(c.*)::INTEGER AS ready_rows,
      count(*) FILTER (
        WHERE (q.needs_verified_ingredients AND NOT c.has_verified_ingredients)
           OR (q.needs_verified_image AND NOT c.has_verified_image)
           OR (q.needs_pet_type AND NOT c.has_pet_type)
      )::INTEGER AS remaining_gap_rows
    FROM public.catalog_acquisition_queue q
    LEFT JOIN classified c
      ON lower(c.brand) = lower(q.brand)
    WHERE q.gap_type = 'brand'
      AND q.status IN ('open', 'in_progress', 'imported')
    GROUP BY q.id
  ),
  resolved_brands AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'brand catalog rows now satisfy queued verification needs',
      updated_at = v_now,
      sample_metadata = q.sample_metadata || jsonb_build_object(
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue'
      )
    FROM brand_state bs
    WHERE q.id = bs.id
      AND bs.ready_rows > 0
      AND bs.remaining_gap_rows = 0
    RETURNING 1
  )
  SELECT count(*) INTO v_brand_rows
  FROM resolved_brands;

  WITH lookup_state AS (
    SELECT
      q.id,
      count(sp.*)::INTEGER AS result_count,
      bool_or(sp.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )) AS has_verified_ingredients,
      bool_or(sp.image_url IS NOT NULL
        AND sp.image_url !~* '^data:'
        AND sp.image_verification_status IN (
          'official',
          'manufacturer',
          'retailer_verified',
          'scan_preview'
        )) AS has_verified_image,
      bool_or(sp.pet_type IN ('dog', 'cat')) AS has_pet_type
    FROM public.catalog_acquisition_queue q
    LEFT JOIN LATERAL public.search_products(q.normalized_query, 5) sp
      ON q.normalized_query IS NOT NULL
      AND q.normalized_query <> '[blank]'
    WHERE q.gap_type = 'lookup'
      AND q.status IN ('open', 'in_progress', 'imported')
    GROUP BY q.id
  ),
  resolved_lookups AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'lookup now returns catalog results satisfying queued verification needs',
      updated_at = v_now,
      sample_metadata = q.sample_metadata || jsonb_build_object(
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue'
      )
    FROM lookup_state ls
    WHERE q.id = ls.id
      AND (NOT q.needs_product_record OR ls.result_count > 0)
      AND (NOT q.needs_verified_ingredients OR COALESCE(ls.has_verified_ingredients, FALSE))
      AND (NOT q.needs_verified_image OR COALESCE(ls.has_verified_image, FALSE))
      AND (NOT q.needs_pet_type OR COALESCE(ls.has_pet_type, FALSE))
    RETURNING 1
  )
  SELECT count(*) INTO v_lookup_rows
  FROM resolved_lookups;

  RETURN jsonb_build_object(
    'resolved_product_rows', v_product_rows,
    'resolved_brand_rows', v_brand_rows,
    'resolved_lookup_rows', v_lookup_rows,
    'resolved_total_rows', v_product_rows + v_brand_rows + v_lookup_rows,
    'reconciled_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue() TO service_role;
