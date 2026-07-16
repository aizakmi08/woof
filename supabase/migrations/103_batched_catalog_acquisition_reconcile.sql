-- Reconcile catalog acquisition rows in bounded chunks. The full reconciler
-- became too expensive once the reviewed source-backed catalog grew, because
-- it compared every open product queue row against every verified row for the
-- same brand in one transaction.

CREATE INDEX IF NOT EXISTS idx_catalog_acquisition_queue_product_open_priority
  ON public.catalog_acquisition_queue (priority_score DESC, updated_at DESC)
  WHERE gap_type = 'product'
    AND status IN ('open', 'in_progress', 'imported');

CREATE INDEX IF NOT EXISTS idx_catalog_acquisition_queue_brand_open_priority
  ON public.catalog_acquisition_queue (priority_score DESC, updated_at DESC)
  WHERE gap_type = 'brand'
    AND status IN ('open', 'in_progress', 'imported');

CREATE OR REPLACE FUNCTION public.reconcile_catalog_acquisition_queue_batch(
  p_max_rows INTEGER DEFAULT 250
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_max_rows, 250), 1), 1000);
  v_brand_limit INTEGER := LEAST(100, LEAST(GREATEST(COALESCE(p_max_rows, 250), 1), 1000));
  v_product_rows INTEGER := 0;
  v_product_identity_rows INTEGER := 0;
  v_brand_rows INTEGER := 0;
  v_remaining_open_rows INTEGER := 0;
BEGIN
  WITH queue_scope AS (
    SELECT q.id
    FROM public.catalog_acquisition_queue q
    WHERE q.gap_type = 'product'
      AND q.status IN ('open', 'in_progress', 'imported')
    ORDER BY q.priority_score DESC, q.updated_at DESC
    LIMIT v_limit
  ),
  product_state AS (
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
          'gdsn',
          'official',
          'manufacturer',
          'retailer_verified',
          'label_ocr_verified'
        ), FALSE) AS has_verified_image,
      COALESCE(pd.pet_type IN ('dog', 'cat'), FALSE) AS has_pet_type
    FROM public.catalog_acquisition_queue q
    JOIN queue_scope qs ON qs.id = q.id
    LEFT JOIN public.product_data pd
      ON pd.cache_key = q.cache_key
  ),
  resolved_products AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'catalog product now satisfies queued verification needs',
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue_batch'
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

  WITH queue_scope AS (
    SELECT q.id
    FROM public.catalog_acquisition_queue q
    WHERE q.gap_type = 'product'
      AND q.status IN ('open', 'in_progress', 'imported')
      AND q.product_name IS NOT NULL
    ORDER BY q.priority_score DESC, q.updated_at DESC
    LIMIT v_limit
  ),
  verified_products AS (
    SELECT
      pd.cache_key,
      pd.brand,
      pd.product_name,
      pd.product_line,
      pd.flavor,
      pd.life_stage,
      pd.food_form,
      pd.package_size,
      pd.pet_type,
      pd.ingredient_verification_status,
      pd.image_verification_status,
      pd.image_url,
      public.catalog_acquisition_identity_normalize(concat_ws(
        ' ',
        pd.product_name,
        pd.product_line,
        pd.flavor,
        pd.life_stage,
        pd.food_form,
        pd.package_size,
        pd.gtin
      )) AS identity_norm
    FROM public.product_data pd
    WHERE pd.expires_at > v_now
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND pd.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      AND pd.image_url IS NOT NULL
      AND pd.image_url !~* '^data:'
      AND pd.image_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      AND pd.pet_type IN ('dog', 'cat')
  ),
  product_identity_state AS (
    SELECT DISTINCT ON (q.id)
      q.id,
      vp.cache_key AS matched_cache_key,
      vp.product_name AS matched_product_name,
      vp.brand AS matched_brand,
      similarity(
        public.catalog_acquisition_identity_normalize(q.product_name),
        vp.identity_norm
      ) AS identity_similarity,
      word_similarity(
        public.catalog_acquisition_identity_normalize(q.product_name),
        vp.identity_norm
      ) AS identity_word_similarity
    FROM public.catalog_acquisition_queue q
    JOIN queue_scope qs ON qs.id = q.id
    JOIN verified_products vp
      ON lower(trim(vp.brand)) = lower(trim(q.brand))
    WHERE public.catalog_acquisition_identity_match(
        q.product_name,
        q.pet_type,
        concat_ws(
          ' ',
          vp.product_name,
          vp.product_line,
          vp.flavor,
          vp.life_stage,
          vp.food_form,
          vp.package_size
        ),
        vp.pet_type
      )
      AND (NOT q.needs_verified_ingredients OR vp.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      ))
      AND (NOT q.needs_verified_image OR (
        vp.image_url IS NOT NULL
        AND vp.image_url !~* '^data:'
        AND vp.image_verification_status IN (
          'gdsn',
          'official',
          'manufacturer',
          'retailer_verified',
          'label_ocr_verified'
        )
      ))
      AND (NOT q.needs_pet_type OR vp.pet_type IN ('dog', 'cat'))
    ORDER BY
      q.id,
      similarity(public.catalog_acquisition_identity_normalize(q.product_name), vp.identity_norm) DESC,
      word_similarity(public.catalog_acquisition_identity_normalize(q.product_name), vp.identity_norm) DESC
  ),
  resolved_product_identity AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'source-backed catalog product matched queued product identity',
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue_batch',
        'matched_cache_key', pis.matched_cache_key,
        'matched_product_name', pis.matched_product_name,
        'matched_brand', pis.matched_brand,
        'identity_similarity', pis.identity_similarity,
        'identity_word_similarity', pis.identity_word_similarity
      )
    FROM product_identity_state pis
    WHERE q.id = pis.id
    RETURNING 1
  )
  SELECT count(*) INTO v_product_identity_rows
  FROM resolved_product_identity;

  WITH brand_scope AS (
    SELECT q.id
    FROM public.catalog_acquisition_queue q
    WHERE q.gap_type = 'brand'
      AND q.status IN ('open', 'in_progress', 'imported')
    ORDER BY q.priority_score DESC, q.updated_at DESC
    LIMIT v_brand_limit
  ),
  ready AS (
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
          'gdsn',
          'official',
          'manufacturer',
          'retailer_verified',
          'label_ocr_verified'
        ), FALSE) AS has_verified_image,
      COALESCE(pet_type IN ('dog', 'cat'), FALSE) AS has_pet_type
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
    JOIN brand_scope bs ON bs.id = q.id
    LEFT JOIN classified c
      ON lower(c.brand) = lower(q.brand)
    GROUP BY q.id
  ),
  resolved_brands AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'brand catalog rows now satisfy queued verification needs',
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue_batch'
      )
    FROM brand_state bs
    WHERE q.id = bs.id
      AND bs.ready_rows > 0
      AND bs.remaining_gap_rows = 0
    RETURNING 1
  )
  SELECT count(*) INTO v_brand_rows
  FROM resolved_brands;

  SELECT count(*)::INTEGER INTO v_remaining_open_rows
  FROM public.catalog_acquisition_queue
  WHERE status IN ('open', 'in_progress', 'imported');

  RETURN jsonb_build_object(
    'mode', 'batch',
    'max_rows', v_limit,
    'brand_max_rows', v_brand_limit,
    'resolved_product_rows', v_product_rows,
    'resolved_product_identity_rows', v_product_identity_rows,
    'resolved_brand_rows', v_brand_rows,
    'resolved_lookup_rows', 0,
    'resolved_total_rows', v_product_rows + v_product_identity_rows + v_brand_rows,
    'remaining_open_rows', v_remaining_open_rows,
    'has_more_open_rows', v_remaining_open_rows > 0,
    'reconciled_at', v_now
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_catalog_acquisition_queue()
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT public.reconcile_catalog_acquisition_queue_batch(250) INTO v_result;

  RETURN v_result || jsonb_build_object(
    'compatibility_wrapper', TRUE,
    'note', 'Batched reconciler: call reconcile_catalog_acquisition_queue_batch repeatedly to drain the queue.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue() TO service_role;
