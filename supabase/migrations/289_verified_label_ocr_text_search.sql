-- Search verified product identities with an OR-prefix query built from
-- canonical on-device OCR text. Final conservative ranking stays on device.
CREATE OR REPLACE FUNCTION public.search_verified_products_for_label_ocr_text(
  ocr_text TEXT,
  max_results INTEGER DEFAULT 96
)
RETURNS TABLE(
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  gtin TEXT,
  product_line TEXT,
  flavor TEXT,
  life_stage TEXT,
  food_form TEXT,
  package_size TEXT,
  pet_type TEXT,
  ingredient_count INTEGER,
  source TEXT,
  source_quality TEXT,
  ingredient_verification_status TEXT,
  image_verification_status TEXT,
  verified_at TIMESTAMPTZ,
  image_url TEXT,
  ingredients TEXT[],
  ingredient_text TEXT,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN,
  source_url TEXT,
  rank REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT := trim(regexp_replace(extensions.unaccent(lower(COALESCE(ocr_text, ''))), '[^a-z0-9]+', ' ', 'g'));
  v_safe_limit INTEGER := LEAST(GREATEST(COALESCE(max_results, 96), 1), 96);
  v_ts_query TSQUERY;
BEGIN
  IF length(v_normalized) < 3 THEN
    RETURN;
  END IF;

  SELECT to_tsquery('simple', string_agg(token || ':*', ' | ' ORDER BY first_position))
  INTO v_ts_query
  FROM (
    SELECT token, min(position) AS first_position
    FROM unnest(regexp_split_to_array(v_normalized, '\s+')) WITH ORDINALITY AS parsed(token, position)
    WHERE length(token) >= 3
      AND token NOT IN (
        'all', 'and', 'balanced', 'breeds', 'cat', 'cats', 'complete', 'crafted',
        'crunchy', 'dha', 'dog', 'dogs', 'dry', 'essential', 'essentials', 'every',
        'food', 'foods', 'for', 'formula', 'fresh', 'from', 'high', 'kibble', 'made',
        'natural', 'net', 'new', 'nutrition', 'nutritious', 'ounces', 'pound', 'pounds',
        'real', 'recommended', 'serving', 'shreds', 'since', 'support', 'taste', 'the',
        'veterinarian', 'weight', 'wet', 'with'
      )
    GROUP BY token
    ORDER BY min(position)
    LIMIT 40
  ) AS useful_tokens;

  IF v_ts_query IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS MATERIALIZED (
    SELECT
      pd.*,
      trim(regexp_replace(extensions.unaccent(lower(concat_ws(
        ' ', pd.brand, pd.product_name, pd.product_line, pd.flavor,
        pd.life_stage, pd.food_form, pd.package_size
      ))), '[^a-z0-9]+', ' ', 'g')) AS identity_lc,
      ts_rank_cd(pd.search_document, v_ts_query) AS text_rank
    FROM public.product_data pd
    WHERE pd.search_document @@ v_ts_query
      AND pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND lower(COALESCE(pd.pet_type, '')) IN ('dog', 'cat')
      AND COALESCE(NULLIF(trim(pd.source_url), ''), '') <> ''
      AND pd.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND pd.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
      AND pd.image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
      AND pd.image_url IS NOT NULL
      AND pd.image_url !~* '^data:'
    ORDER BY ts_rank_cd(pd.search_document, v_ts_query) DESC, pd.verified_at DESC NULLS LAST
    LIMIT 500
  ),
  scored AS MATERIALIZED (
    SELECT
      base.*,
      (
        3.0
        + base.text_rank * 4.0
        + word_similarity(v_normalized, base.identity_lc) * 1.2
        + similarity(v_normalized, base.identity_lc) * 0.8
      )::REAL AS adjusted_rank
    FROM base
  )
  SELECT
    scored.cache_key,
    scored.product_name,
    scored.brand,
    NULLIF(trim(scored.gtin), '') AS gtin,
    NULLIF(trim(scored.product_line), '') AS product_line,
    NULLIF(trim(scored.flavor), '') AS flavor,
    NULLIF(trim(scored.life_stage), '') AS life_stage,
    NULLIF(trim(scored.food_form), '') AS food_form,
    NULLIF(trim(scored.package_size), '') AS package_size,
    COALESCE(scored.pet_type, 'unknown') AS pet_type,
    scored.ingredient_count,
    scored.source,
    COALESCE(scored.source_quality, 'unknown') AS source_quality,
    COALESCE(scored.ingredient_verification_status, 'unverified') AS ingredient_verification_status,
    COALESCE(scored.image_verification_status, 'unverified') AS image_verification_status,
    scored.verified_at,
    scored.image_url,
    scored.ingredients,
    COALESCE(NULLIF(scored.ingredient_text, ''), array_to_string(scored.ingredients, ', ')) AS ingredient_text,
    scored.nutritional_info,
    scored.nutrient_panel,
    COALESCE(scored.has_published_nutrients, FALSE) AS has_published_nutrients,
    scored.source_url,
    scored.adjusted_rank AS rank
  FROM scored
  ORDER BY scored.adjusted_rank DESC, scored.ingredient_count DESC, scored.verified_at DESC NULLS LAST
  LIMIT v_safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_verified_products_for_label_ocr_text(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products_for_label_ocr_text(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products_for_label_ocr_text(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products_for_label_ocr_text(TEXT, INTEGER) TO service_role;
