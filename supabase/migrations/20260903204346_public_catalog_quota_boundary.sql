-- Keep catalog discovery public to signed-in users while making ingredients
-- and nutrient data available only through the atomic scan-quota boundary.

-- These pre-audit counters derive identity from auth.uid(), but the current
-- client does not call them. Remove their client attack surface instead of
-- preserving redundant APIs whose UUID parameters invite misuse.
DO $migration$
DECLARE
  v_signature REGPROCEDURE;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    to_regprocedure('public.get_human_food_count_today(uuid)'),
    to_regprocedure('public.increment_human_food_count(uuid)'),
    to_regprocedure('public.increment_scan_count(uuid)')
  ]
  LOOP
    IF v_signature IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_signature);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_signature);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
    END IF;
  END LOOP;
END
$migration$;

CREATE OR REPLACE FUNCTION public.search_verified_product_teasers(
  q TEXT,
  max_results INTEGER DEFAULT 10
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
  source_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    product.cache_key,
    product.product_name,
    product.brand,
    product.gtin,
    product.product_line,
    product.flavor,
    product.life_stage,
    product.food_form,
    product.package_size,
    product.pet_type,
    product.ingredient_count,
    product.source,
    product.source_quality,
    product.ingredient_verification_status,
    product.image_verification_status,
    product.verified_at,
    product.image_url,
    product.source_url,
    product.rank
  FROM public.search_verified_products(q, max_results) AS product;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_verified_product_teaser_by_gtin(
  q TEXT,
  max_results INTEGER DEFAULT 8
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
  source_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    product.cache_key,
    product.product_name,
    product.brand,
    product.gtin,
    product.product_line,
    product.flavor,
    product.life_stage,
    product.food_form,
    product.package_size,
    product.pet_type,
    product.ingredient_count,
    product.source,
    product.source_quality,
    product.ingredient_verification_status,
    product.image_verification_status,
    product.verified_at,
    product.image_url,
    product.source_url,
    product.rank
  FROM public.resolve_verified_product_by_gtin(q, max_results) AS product;
$function$;

CREATE OR REPLACE FUNCTION public.consume_verified_catalog_product(
  p_cache_key TEXT,
  p_scan_id TEXT,
  p_scan_mode TEXT DEFAULT 'catalog'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product public.product_data%ROWTYPE;
  v_bound_scan_id TEXT;
  v_usage JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'scan_usage', NULL,
      'product', NULL
    );
  END IF;

  SELECT product.*
  INTO v_product
  FROM public.product_data AS product
  WHERE product.cache_key = NULLIF(trim(p_cache_key), '')
    AND product.expires_at > now()
    AND product.ingredient_count >= 5
    AND product.is_complete_food = true
    AND product.catalog_exclusion_reason IS NULL
    AND lower(COALESCE(product.pet_type, '')) IN ('dog', 'cat')
    AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
    AND product.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
    AND product.ingredient_verification_status IN (
      'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
    )
    AND product.image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
    AND product.image_url IS NOT NULL
    AND product.image_url !~* '^data:'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'product_not_found',
      'scan_usage', NULL,
      'product', NULL
    );
  END IF;

  -- Bind idempotency to both the client attempt and the selected formula.
  -- A modified client cannot reuse one scan id to retrieve many products.
  v_bound_scan_id := left(
    COALESCE(NULLIF(trim(p_scan_id), ''), extensions.gen_random_uuid()::TEXT),
    96
  ) || ':catalog:' || encode(
    extensions.digest(v_product.cache_key, 'sha256'),
    'hex'
  );

  v_usage := public.consume_scan(
    NULL,
    v_bound_scan_id,
    COALESCE(NULLIF(trim(p_scan_mode), ''), 'catalog'),
    3
  );

  IF COALESCE((v_usage->>'allowed')::BOOLEAN, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', COALESCE(v_usage->>'reason', 'scan_not_allowed'),
      'scan_usage', v_usage,
      'product', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', v_usage->>'reason',
    'scan_usage', v_usage,
    'product', jsonb_build_object(
      'cache_key', v_product.cache_key,
      'product_name', v_product.product_name,
      'brand', v_product.brand,
      'gtin', v_product.gtin,
      'product_line', v_product.product_line,
      'flavor', v_product.flavor,
      'life_stage', v_product.life_stage,
      'food_form', v_product.food_form,
      'package_size', v_product.package_size,
      'pet_type', v_product.pet_type,
      'ingredients', v_product.ingredients,
      'ingredient_text', v_product.ingredient_text,
      'ingredient_count', v_product.ingredient_count,
      'nutritional_info', v_product.nutritional_info,
      'nutrient_panel', v_product.nutrient_panel,
      'has_published_nutrients', v_product.has_published_nutrients,
      'source', v_product.source,
      'source_quality', v_product.source_quality,
      'ingredient_verification_status', v_product.ingredient_verification_status,
      'image_verification_status', v_product.image_verification_status,
      'verified_at', v_product.verified_at,
      'source_url', v_product.source_url,
      'image_url', v_product.image_url,
      'formula_evidence_tier', v_product.formula_evidence_tier,
      'formula_version_provenance', v_product.formula_version_provenance
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.search_verified_product_teasers(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_verified_product_teasers(TEXT, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_verified_product_teaser_by_gtin(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_verified_product_teaser_by_gtin(TEXT, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.consume_verified_catalog_product(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_verified_catalog_product(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- The table remains useful for lightweight identity display, but never grants
-- ingredient or nutrient columns to a client role.
REVOKE ALL ON TABLE public.product_data FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  cache_key,
  product_name,
  brand,
  gtin,
  product_line,
  flavor,
  life_stage,
  food_form,
  package_size,
  pet_type,
  ingredient_count,
  source,
  source_quality,
  ingredient_verification_status,
  image_verification_status,
  verified_at,
  image_url,
  source_url
) ON TABLE public.product_data TO authenticated;

-- These legacy RPCs return full ingredients/nutrients and therefore bypassed
-- the quota when called directly with a user's session token.
DO $migration$
DECLARE
  v_signature REGPROCEDURE;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    to_regprocedure('public.resolve_verified_product_by_gtin(text,integer)'),
    to_regprocedure('public.search_products(text,integer)'),
    to_regprocedure('public.search_verified_products(text,integer)'),
    to_regprocedure('public.search_verified_products_for_label_fast(text[],integer)'),
    to_regprocedure('public.search_verified_products_for_label_ocr(text[],integer)'),
    to_regprocedure('public.search_verified_products_for_label_ocr_text(text,integer)'),
    to_regprocedure('public.search_verified_products_ranked_v1(text,integer)')
  ]
  LOOP
    IF v_signature IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_signature);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_signature);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
    END IF;
  END LOOP;
END
$migration$;
