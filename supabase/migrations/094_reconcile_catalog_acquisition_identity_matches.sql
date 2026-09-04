-- Resolve legacy product-gap rows when a newly imported source-backed catalog
-- row clearly covers the same recipe under a different cache key.

CREATE INDEX IF NOT EXISTS idx_product_data_ready_brand_lower
  ON public.product_data (lower(brand))
  WHERE ingredient_count >= 5
    AND is_complete_food = TRUE
    AND catalog_exclusion_reason IS NULL;

CREATE OR REPLACE FUNCTION public.catalog_acquisition_identity_normalize(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    trim(regexp_replace(extensions.unaccent(lower(COALESCE(p_value, ''))), '[^a-z0-9]+', ' ', 'g')),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.catalog_acquisition_identity_tokens(
  p_value TEXT,
  p_tokens TEXT[]
)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(token ORDER BY token), ARRAY[]::TEXT[])
  FROM unnest(p_tokens) AS tokens(token)
  WHERE public.catalog_acquisition_identity_normalize(p_value) ~ ('\m' || token || '\M');
$$;

CREATE OR REPLACE FUNCTION public.catalog_acquisition_identity_match(
  p_queue_identity TEXT,
  p_queue_pet_type TEXT,
  p_catalog_identity TEXT,
  p_catalog_pet_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q_norm TEXT := public.catalog_acquisition_identity_normalize(p_queue_identity);
  c_norm TEXT := public.catalog_acquisition_identity_normalize(p_catalog_identity);
  q_proteins TEXT[];
  c_proteins TEXT[];
  required_term TEXT;
  q_has_recipe_protein BOOLEAN;
  identity_similarity REAL;
  identity_word_similarity REAL;
BEGIN
  IF q_norm IS NULL OR c_norm IS NULL OR length(q_norm) < 12 OR length(c_norm) < 12 THEN
    RETURN FALSE;
  END IF;

  IF p_queue_pet_type IN ('dog', 'cat')
     AND p_catalog_pet_type IN ('dog', 'cat')
     AND p_queue_pet_type <> p_catalog_pet_type THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(dog|puppy|canine)\M' AND p_catalog_pet_type = 'cat' THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(cat|kitten|feline)\M' AND p_catalog_pet_type = 'dog' THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M'
     AND c_norm !~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M' THEN
    RETURN FALSE;
  END IF;

  q_proteins := public.catalog_acquisition_identity_tokens(q_norm, ARRAY[
    'beef',
    'bison',
    'chicken',
    'cod',
    'crab',
    'duck',
    'fish',
    'herring',
    'lamb',
    'liver',
    'mackerel',
    'oceanfish',
    'pork',
    'quail',
    'rabbit',
    'salmon',
    'sardine',
    'shrimp',
    'trout',
    'tuna',
    'turkey',
    'venison',
    'whitefish'
  ]);
  c_proteins := public.catalog_acquisition_identity_tokens(c_norm, ARRAY[
    'beef',
    'bison',
    'chicken',
    'cod',
    'crab',
    'duck',
    'fish',
    'herring',
    'lamb',
    'liver',
    'mackerel',
    'oceanfish',
    'pork',
    'quail',
    'rabbit',
    'salmon',
    'sardine',
    'shrimp',
    'trout',
    'tuna',
    'turkey',
    'venison',
    'whitefish'
  ]);
  q_has_recipe_protein := cardinality(q_proteins) > 0;

  IF EXISTS (
    SELECT 1
    FROM unnest(q_proteins) AS q_tokens(q_token)
    WHERE NOT q_token = ANY(c_proteins)
  ) THEN
    RETURN FALSE;
  END IF;

  FOREACH required_term IN ARRAY ARRAY[
    'adult 7',
    'classic ground',
    'digestive',
    'dry',
    'grain free',
    'grilled',
    'hairball',
    'healthy weight',
    'hydrolyzed',
    'indoor',
    'kitten',
    'large breed',
    'mousse',
    'pate',
    'puppy',
    'renal',
    'senior',
    'sensitive',
    'shreds',
    'skin',
    'small breed',
    'stomach',
    'tender',
    'urinary',
    'weight',
    'wet'
  ] LOOP
    IF position(required_term IN q_norm) > 0
       AND position(required_term IN c_norm) = 0 THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  identity_similarity := similarity(q_norm, c_norm);
  identity_word_similarity := word_similarity(q_norm, c_norm);

  IF q_norm = c_norm THEN
    RETURN TRUE;
  END IF;

  IF q_norm LIKE '%' || c_norm || '%' AND length(c_norm) >= 20 THEN
    RETURN TRUE;
  END IF;

  IF c_norm LIKE '%' || q_norm || '%'
     AND length(q_norm)::NUMERIC / GREATEST(length(c_norm), 1) >= 0.82 THEN
    RETURN TRUE;
  END IF;

  IF q_has_recipe_protein
     AND (identity_similarity >= 0.62 OR identity_word_similarity >= 0.78) THEN
    RETURN TRUE;
  END IF;

  IF identity_similarity >= 0.84 AND identity_word_similarity >= 0.84 THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_catalog_acquisition_queue()
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_product_rows INTEGER := 0;
  v_product_identity_rows INTEGER := 0;
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
          'gdsn',
          'official',
          'manufacturer',
          'retailer_verified',
          'label_ocr_verified'
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

  WITH verified_products AS (
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
    JOIN verified_products vp
      ON lower(trim(vp.brand)) = lower(trim(q.brand))
    WHERE q.gap_type = 'product'
      AND q.status IN ('open', 'in_progress', 'imported')
      AND q.product_name IS NOT NULL
      AND public.catalog_acquisition_identity_match(
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
      sample_metadata = q.sample_metadata || jsonb_build_object(
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue',
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
          'gdsn',
          'official',
          'manufacturer',
          'retailer_verified',
          'label_ocr_verified'
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
          'gdsn',
          'official',
          'manufacturer',
          'retailer_verified',
          'label_ocr_verified'
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
    'resolved_product_identity_rows', v_product_identity_rows,
    'resolved_brand_rows', v_brand_rows,
    'resolved_lookup_rows', v_lookup_rows,
    'resolved_total_rows', v_product_rows + v_product_identity_rows + v_brand_rows + v_lookup_rows,
    'reconciled_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_tokens(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_tokens(TEXT, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_tokens(TEXT, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_tokens(TEXT, TEXT[]) TO service_role;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue() TO service_role;
