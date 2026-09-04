-- Acquisition gaps should close when the same verified-search contract used by
-- the app returns a high-confidence same-brand product. Keep the older strict
-- identity guard, but add a narrower fallback for legacy queue rows whose title
-- repeats the brand or omits generic catalog words such as "dry dog food".

CREATE OR REPLACE FUNCTION public.catalog_acquisition_strict_search_high_confidence(
  p_queue_brand TEXT,
  p_queue_product_name TEXT,
  p_queue_pet_type TEXT,
  p_matched_brand TEXT,
  p_matched_identity TEXT,
  p_matched_pet_type TEXT,
  p_rank REAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q_norm TEXT := public.catalog_acquisition_identity_normalize(concat_ws(' ', p_queue_brand, p_queue_product_name));
  c_norm TEXT := public.catalog_acquisition_identity_normalize(concat_ws(' ', p_matched_brand, p_matched_identity));
  q_brand_norm TEXT := public.catalog_acquisition_identity_normalize(p_queue_brand);
  c_brand_norm TEXT := public.catalog_acquisition_identity_normalize(p_matched_brand);
  q_terms TEXT[];
  c_terms TEXT[];
  q_key_terms TEXT[];
  c_key_terms TEXT[];
BEGIN
  IF COALESCE(p_rank, 0) < 6.0 THEN
    RETURN FALSE;
  END IF;

  IF q_norm IS NULL OR c_norm IS NULL OR length(q_norm) < 12 OR length(c_norm) < 12 THEN
    RETURN FALSE;
  END IF;

  IF q_brand_norm IS NULL OR c_brand_norm IS NULL OR q_brand_norm <> c_brand_norm THEN
    RETURN FALSE;
  END IF;

  IF p_queue_pet_type IN ('dog', 'cat')
     AND p_matched_pet_type IN ('dog', 'cat')
     AND p_queue_pet_type <> p_matched_pet_type THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(dog|puppy|canine)\M' AND p_matched_pet_type = 'cat' THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(cat|kitten|feline)\M' AND p_matched_pet_type = 'dog' THEN
    RETURN FALSE;
  END IF;

  IF (q_norm ~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M')
     <> (c_norm ~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M') THEN
    RETURN FALSE;
  END IF;

  q_terms := public.catalog_acquisition_identity_tokens(q_norm, ARRAY[
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
    'whitefish',
    'barley',
    'bone',
    'brain',
    'brown',
    'carrot',
    'cheddar',
    'cheese',
    'heart',
    'joint',
    'oat',
    'oatmeal',
    'pea',
    'potato',
    'rice',
    'spinach',
    'sweet',
    'tomato',
    'vegetable',
    'wild'
  ]);
  c_terms := public.catalog_acquisition_identity_tokens(c_norm, ARRAY[
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
    'whitefish',
    'barley',
    'bone',
    'brain',
    'brown',
    'carrot',
    'cheddar',
    'cheese',
    'heart',
    'joint',
    'oat',
    'oatmeal',
    'pea',
    'potato',
    'rice',
    'spinach',
    'sweet',
    'tomato',
    'vegetable',
    'wild'
  ]);

  IF cardinality(q_terms) = 0 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(q_terms) AS q_required(term)
    WHERE NOT q_required.term = ANY(c_terms)
  ) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'digestive',
      'hairball',
      'hydrolyzed',
      'indoor',
      'joint',
      'kitten',
      'large',
      'mobility',
      'puppy',
      'renal',
      'senior',
      'sensitive',
      'small',
      'skin',
      'toy',
      'urinary',
      'weight'
    ]) AS extra_guard(term)
    WHERE c_norm ~ ('\m' || extra_guard.term || '\M')
      AND q_norm !~ ('\m' || extra_guard.term || '\M')
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token), ARRAY[]::TEXT[])
  INTO q_key_terms
  FROM regexp_split_to_table(q_norm, '\s+') AS tokens(token)
  WHERE length(token) >= 3
    AND token !~ '^[0-9]+$'
    AND token NOT IN (
      'and',
      'blue',
      'buffalo',
      'canin',
      'cat',
      'cats',
      'complete',
      'diet',
      'dog',
      'dogs',
      'dry',
      'flavor',
      'flavour',
      'food',
      'foods',
      'for',
      'formula',
      'free',
      'grain',
      'healthy',
      'health',
      'hill',
      'hills',
      'natural',
      'premium',
      'recipe',
      'royal',
      'science',
      'the',
      'wet',
      'with'
    );

  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token), ARRAY[]::TEXT[])
  INTO c_key_terms
  FROM regexp_split_to_table(c_norm, '\s+') AS tokens(token)
  WHERE length(token) >= 3
    AND token !~ '^[0-9]+$'
    AND token NOT IN (
      'and',
      'blue',
      'buffalo',
      'canin',
      'cat',
      'cats',
      'complete',
      'diet',
      'dog',
      'dogs',
      'dry',
      'flavor',
      'flavour',
      'food',
      'foods',
      'for',
      'formula',
      'free',
      'grain',
      'healthy',
      'health',
      'hill',
      'hills',
      'natural',
      'premium',
      'recipe',
      'royal',
      'science',
      'the',
      'wet',
      'with'
    );

  IF cardinality(q_key_terms) < 3 THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM unnest(q_key_terms) AS q_key(term)
    WHERE NOT q_key.term = ANY(c_key_terms)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(
  p_max_rows INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_max_rows, 100), 1), 1000);
  v_product_strict_search_rows INTEGER := 0;
BEGIN
  WITH queue_scope AS (
    SELECT
      q.id,
      q.brand,
      q.product_name,
      q.pet_type,
      concat_ws(' ', q.brand, q.product_name) AS search_query
    FROM public.catalog_acquisition_queue q
    WHERE q.gap_type = 'product'
      AND q.status IN ('open', 'in_progress', 'imported')
      AND q.brand IS NOT NULL
      AND q.product_name IS NOT NULL
    ORDER BY
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.priority_score DESC,
      q.updated_at DESC
    LIMIT v_limit
  ),
  strict_matches AS (
    SELECT DISTINCT ON (qs.id)
      qs.id,
      matched.cache_key AS matched_cache_key,
      matched.product_name AS matched_product_name,
      matched.brand AS matched_brand,
      matched.pet_type AS matched_pet_type,
      matched.source AS matched_source,
      matched.source_url AS matched_source_url,
      matched.rank AS matched_rank,
      CASE
        WHEN public.catalog_acquisition_identity_match(
          concat_ws(' ', qs.brand, qs.product_name),
          qs.pet_type,
          concat_ws(
            ' ',
            matched.brand,
            matched.product_name,
            matched.product_line,
            matched.flavor,
            matched.life_stage,
            matched.food_form,
            matched.package_size,
            matched.gtin
          ),
          matched.pet_type
        )
        THEN 'identity_guard'
        ELSE 'high_confidence_strict_search'
      END AS match_strategy
    FROM queue_scope qs
    JOIN LATERAL public.search_verified_products(qs.search_query, 8) AS matched ON TRUE
    WHERE matched.rank >= 3.0
      AND lower(trim(matched.brand)) = lower(trim(qs.brand))
      AND (
        public.catalog_acquisition_identity_match(
          concat_ws(' ', qs.brand, qs.product_name),
          qs.pet_type,
          concat_ws(
            ' ',
            matched.brand,
            matched.product_name,
            matched.product_line,
            matched.flavor,
            matched.life_stage,
            matched.food_form,
            matched.package_size,
            matched.gtin
          ),
          matched.pet_type
        )
        OR public.catalog_acquisition_strict_search_high_confidence(
          qs.brand,
          qs.product_name,
          qs.pet_type,
          matched.brand,
          concat_ws(
            ' ',
            matched.product_name,
            matched.product_line,
            matched.flavor,
            matched.life_stage,
            matched.food_form,
            matched.package_size,
            matched.gtin
          ),
          matched.pet_type,
          matched.rank
        )
      )
    ORDER BY qs.id, matched.rank DESC
  ),
  resolved_product_strict_search AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'strict verified catalog search matched queued product identity',
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue_strict_search',
        'matched_cache_key', sm.matched_cache_key,
        'matched_product_name', sm.matched_product_name,
        'matched_brand', sm.matched_brand,
        'matched_pet_type', sm.matched_pet_type,
        'matched_source', sm.matched_source,
        'matched_source_url', sm.matched_source_url,
        'matched_rank', sm.matched_rank,
        'match_strategy', sm.match_strategy
      )
    FROM strict_matches sm
    WHERE q.id = sm.id
    RETURNING 1
  )
  SELECT count(*) INTO v_product_strict_search_rows
  FROM resolved_product_strict_search;

  RETURN jsonb_build_object(
    'mode', 'strict_verified_search',
    'max_rows', v_limit,
    'resolved_product_strict_search_rows', v_product_strict_search_rows,
    'reconciled_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice',
    'unknown',
    'Blue Buffalo',
    'Life Protection Formula Adult Dry Dog Food - Chicken & Brown Rice',
    'dog',
    8.06301
  ) THEN
    RAISE EXCEPTION 'high-confidence Blue Buffalo queue match should resolve';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice',
    'unknown',
    'Blue Buffalo',
    'Life Protection Formula Toy Breed Adult Dry Dog Food - Chicken & Brown Rice',
    'dog',
    8.0
  ) THEN
    RAISE EXCEPTION 'extra toy-breed formula should not resolve generic adult queue match';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo Life Protection Formula Adult Salmon and Brown Rice',
    'unknown',
    'Blue Buffalo',
    'Life Protection Formula Adult Dry Dog Food - Chicken & Brown Rice',
    'dog',
    8.0
  ) THEN
    RAISE EXCEPTION 'wrong protected protein should not resolve';
  END IF;
END;
$$;
