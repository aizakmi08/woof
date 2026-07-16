-- Store user ingredient captures as reviewable catalog evidence.
-- This intentionally does not promote user OCR/AI output to verified_ready.

CREATE OR REPLACE FUNCTION public.submit_catalog_ingredient_capture(
  p_product_name TEXT,
  p_brand TEXT DEFAULT NULL,
  p_pet_type TEXT DEFAULT NULL,
  p_normalized_query TEXT DEFAULT NULL,
  p_cache_key TEXT DEFAULT NULL,
  p_gtin TEXT DEFAULT NULL,
  p_ingredient_text TEXT DEFAULT NULL,
  p_ingredients JSONB DEFAULT '[]'::jsonb,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_product_name TEXT := left(regexp_replace(coalesce(p_product_name, ''), '\s+', ' ', 'g'), 240);
  v_brand TEXT := nullif(left(regexp_replace(coalesce(p_brand, ''), '\s+', ' ', 'g'), 120), '');
  v_pet_type TEXT := lower(nullif(regexp_replace(coalesce(p_pet_type, ''), '\s+', ' ', 'g'), ''));
  v_query TEXT := left(regexp_replace(coalesce(p_normalized_query, p_product_name, ''), '\s+', ' ', 'g'), 160);
  v_cache_key TEXT := nullif(left(regexp_replace(coalesce(p_cache_key, ''), '\s+', ' ', 'g'), 180), '');
  v_gtin TEXT := nullif(left(regexp_replace(coalesce(p_gtin, ''), '[^0-9]', '', 'g'), 32), '');
  v_ingredient_text TEXT := left(regexp_replace(coalesce(p_ingredient_text, ''), '\s+', ' ', 'g'), 10000);
  v_ingredients JSONB := CASE
    WHEN jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) = 'array' THEN coalesce(p_ingredients, '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
  v_ingredient_count INTEGER := 0;
  v_metadata JSONB := CASE
    WHEN jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object'
      AND pg_column_size(coalesce(p_metadata, '{}'::jsonb)) <= 4096
    THEN coalesce(p_metadata, '{}'::jsonb)
    ELSE '{}'::jsonb
  END;
  v_content_hash TEXT;
  v_gap_key TEXT;
  v_evidence_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF v_pet_type NOT IN ('dog', 'cat') THEN
    v_pet_type := NULL;
  END IF;

  SELECT count(*)::INTEGER
  INTO v_ingredient_count
  FROM jsonb_array_elements_text(v_ingredients) AS ingredient
  WHERE length(trim(ingredient)) > 0;

  IF length(trim(v_product_name)) < 2 AND length(coalesce(v_query, '')) < 2 THEN
    RAISE EXCEPTION 'Product identity is required'
      USING ERRCODE = '22023';
  END IF;

  IF length(trim(v_ingredient_text)) < 8 AND v_ingredient_count = 0 THEN
    RAISE EXCEPTION 'Ingredient evidence is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_cache_key IS NULL THEN
    v_cache_key := left(
      regexp_replace(
        lower(concat_ws(' ', coalesce(v_brand, ''), coalesce(v_product_name, v_query), coalesce(v_pet_type, ''))),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      180
    );
  END IF;

  v_content_hash := md5(concat_ws('|', v_cache_key, coalesce(v_brand, ''), v_product_name, v_ingredient_text, v_ingredients::TEXT));
  v_gap_key := 'user_capture:' || md5(lower(coalesce(v_query, concat_ws(' ', v_brand, v_product_name, v_pet_type))));

  INSERT INTO public.product_events (
    user_id,
    event_name,
    session_id,
    platform,
    metadata
  )
  VALUES (
    v_user_id,
    'catalog_verification_gap',
    left('ingredient_capture_' || md5(random()::TEXT), 80),
    left(coalesce(v_metadata->>'platform', 'unknown'), 24),
    jsonb_build_object(
      'source', 'ingredient_capture',
      'trigger', 'user_submitted_ingredients',
      'normalized_query', lower(coalesce(v_query, concat_ws(' ', v_brand, v_product_name))),
      'query_length', length(coalesce(v_query, v_product_name)),
      'query_token_count', cardinality(regexp_split_to_array(trim(coalesce(v_query, v_product_name)), '\s+')),
      'resolver_status', 'user_ingredient_capture',
      'verification_state', 'needs_ingredients',
      'verification_gaps', jsonb_build_array('user_submitted_ingredient_evidence'),
      'result_count', 1,
      'catalog_result_count', CASE WHEN p_cache_key IS NULL THEN 0 ELSE 1 END,
      'ready_result_count', 0,
      'image_result_count', 0,
      'product_gap_count', 1,
      'needs_verified_ingredient_count', 1,
      'needs_verified_image_count', 1,
      'known_pet_type_result_count', CASE WHEN v_pet_type IS NULL THEN 0 ELSE 1 END,
      'top_cache_key', v_cache_key,
      'top_source_kind', 'user_capture',
      'top_source', 'user_ingredient_capture',
      'top_source_quality', 'user_ocr',
      'top_brand', v_brand,
      'top_product_name', v_product_name,
      'top_pet_type', v_pet_type,
      'ingredient_count', v_ingredient_count
    ) || (v_metadata - 'platform')
  );

  INSERT INTO public.catalog_acquisition_queue (
    gap_key,
    gap_type,
    brand,
    product_name,
    cache_key,
    normalized_query,
    pet_type,
    product_source,
    source_quality,
    needs_product_record,
    needs_verified_ingredients,
    needs_verified_image,
    needs_pet_type,
    ready_rows,
    affected_product_count,
    demand_events,
    last_event_at,
    priority_score,
    sample_metadata,
    updated_at,
    last_refreshed_at
  )
  VALUES (
    v_gap_key,
    'product',
    v_brand,
    v_product_name,
    v_cache_key,
    lower(coalesce(v_query, concat_ws(' ', v_brand, v_product_name))),
    v_pet_type,
    'user_ingredient_capture',
    'user_ocr',
    p_cache_key IS NULL,
    TRUE,
    TRUE,
    v_pet_type IS NULL,
    0,
    1,
    1,
    now(),
    35,
    jsonb_build_object(
      'sample_reason', 'user_submitted_ingredient_capture',
      'ingredient_count', v_ingredient_count,
      'content_hash', v_content_hash
    ),
    now(),
    now()
  )
  ON CONFLICT (gap_key) DO UPDATE
    SET updated_at = now(),
        last_event_at = now(),
        demand_events = public.catalog_acquisition_queue.demand_events + 1,
        priority_score = greatest(public.catalog_acquisition_queue.priority_score, 35),
        needs_verified_ingredients = TRUE,
        needs_verified_image = TRUE,
        sample_metadata = public.catalog_acquisition_queue.sample_metadata || jsonb_build_object(
          'last_user_ingredient_capture_at', now(),
          'last_content_hash', v_content_hash,
          'ingredient_count', v_ingredient_count
        );

  INSERT INTO public.catalog_product_evidence (
    cache_key,
    gtin,
    product_name,
    brand,
    pet_type,
    source,
    source_quality,
    ingredient_verification_status,
    image_verification_status,
    raw_source_hash,
    content_hash,
    extractor_version,
    review_state,
    evidence
  )
  VALUES (
    v_cache_key,
    v_gtin,
    v_product_name,
    v_brand,
    coalesce(v_pet_type, 'unknown'),
    'user_ingredient_capture',
    'user_ocr',
    'label_ocr_candidate',
    'unverified',
    v_content_hash,
    v_content_hash,
    'woof-app-ingredient-capture-v1',
    'manual_review',
    jsonb_build_object(
      'submitted_by_user_id', v_user_id,
      'submitted_at', now(),
      'normalized_query', lower(coalesce(v_query, concat_ws(' ', v_brand, v_product_name))),
      'ingredient_text_candidate', v_ingredient_text,
      'ingredients_candidate', v_ingredients,
      'ingredient_count', v_ingredient_count,
      'metadata', v_metadata,
      'submission_count', 1
    )
  )
  ON CONFLICT (cache_key, source, content_hash) WHERE content_hash IS NOT NULL
  DO UPDATE
    SET updated_at = now(),
        review_state = CASE
          WHEN public.catalog_product_evidence.review_state = 'promoted' THEN 'promoted'
          ELSE 'manual_review'
        END,
        evidence = public.catalog_product_evidence.evidence || jsonb_build_object(
          'last_submitted_at', now(),
          'submission_count',
          CASE
            WHEN coalesce(public.catalog_product_evidence.evidence->>'submission_count', '') ~ '^[0-9]+$'
              THEN (public.catalog_product_evidence.evidence->>'submission_count')::INTEGER + 1
            ELSE 2
          END
        )
  RETURNING id INTO v_evidence_id;

  RETURN jsonb_build_object(
    'submitted', TRUE,
    'evidence_id', v_evidence_id,
    'gap_key', v_gap_key,
    'review_state', 'manual_review',
    'verification_status', 'label_ocr_candidate'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_catalog_ingredient_capture(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_catalog_ingredient_capture(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_catalog_ingredient_capture(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  JSONB
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_catalog_ingredient_capture(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  JSONB
) TO service_role;
