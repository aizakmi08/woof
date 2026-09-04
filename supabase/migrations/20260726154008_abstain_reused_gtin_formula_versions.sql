-- A GTIN identifies a package, but brands sometimes reuse it after changing
-- the ingredient formula. Barcode lookup must abstain whenever verified
-- serving evidence contains more than one ingredient version for that GTIN.

ALTER FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  RENAME TO resolve_verified_product_by_gtin_unfiltered;

REVOKE ALL ON FUNCTION
  public.resolve_verified_product_by_gtin_unfiltered(TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.resolve_verified_product_by_gtin_unfiltered(TEXT, INTEGER)
  FROM anon;
REVOKE ALL ON FUNCTION
  public.resolve_verified_product_by_gtin_unfiltered(TEXT, INTEGER)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION
  public.resolve_verified_product_by_gtin_unfiltered(TEXT, INTEGER)
  TO service_role;

CREATE FUNCTION public.resolve_verified_product_by_gtin(
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
  ingredients TEXT[],
  ingredient_text TEXT,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN,
  source_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT candidate.*
  FROM public.resolve_verified_product_by_gtin_unfiltered(
    q,
    max_results
  ) candidate
  WHERE (
    SELECT
      count(DISTINCT public.catalog_normalize_ingredient_evidence(
        evidence.ingredient_text
      )) = 1
      AND bool_or(
        public.catalog_normalize_ingredient_evidence(
          evidence.ingredient_text
        ) = public.catalog_normalize_ingredient_evidence(
          candidate.ingredient_text
        )
      )
    FROM public.product_data evidence
    WHERE ltrim(
        regexp_replace(COALESCE(evidence.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      ) = ltrim(
        regexp_replace(COALESCE(candidate.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      )
      AND NULLIF(btrim(evidence.ingredient_text), '') IS NOT NULL
      AND evidence.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  FROM anon;
GRANT EXECUTE
  ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  TO service_role;

DO $$
DECLARE
  v_conflicting_result_count INTEGER;
  v_safe_result_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_conflicting_result_count
  FROM public.resolve_verified_product_by_gtin('038100026743', 8);

  SELECT count(*)
  INTO v_safe_result_count
  FROM public.resolve_verified_product_by_gtin('076344060048', 8);

  IF v_conflicting_result_count <> 0 OR v_safe_result_count <> 1 THEN
    RAISE EXCEPTION
      'GTIN formula-version abstention failed: conflicting %, safe %',
      v_conflicting_result_count,
      v_safe_result_count;
  END IF;
END
$$;
