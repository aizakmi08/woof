-- Keep app-facing barcode search on the same ingredient-version-safe resolver
-- used by the dedicated barcode path. Migration 280 added a fast direct-GTIN
-- branch to search_verified_products, but that branch can return two verified
-- serving rows when a manufacturer reuses one GTIN after changing ingredients.
-- Text search keeps the existing indexed implementation unchanged.

DO $precondition$
BEGIN
  IF to_regprocedure(
    'public.search_verified_products_unfiltered_gtin_v1(text,integer)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'search_verified_products_unfiltered_gtin_v1 already exists';
  END IF;

  IF to_regprocedure(
    'public.search_verified_products(text,integer)'
  ) IS NULL OR to_regprocedure(
    'public.resolve_verified_product_by_gtin(text,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required verified search/barcode RPC is missing';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('851893001731', 8)
  ) <> 0 OR (
    SELECT count(*)
    FROM public.search_verified_products('851893001731', 8)
  ) <> 2 THEN
    RAISE EXCEPTION
      'Freshpet reused-GTIN regression precondition changed';
  END IF;
END;
$precondition$;

ALTER FUNCTION public.search_verified_products(TEXT, INTEGER)
  RENAME TO search_verified_products_unfiltered_gtin_v1;

REVOKE ALL ON FUNCTION
  public.search_verified_products_unfiltered_gtin_v1(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.search_verified_products_unfiltered_gtin_v1(TEXT, INTEGER)
  TO service_role;

CREATE FUNCTION public.search_verified_products(
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
AS $function$
DECLARE
  v_normalized TEXT := public.normalize_verified_product_search_query(q);
BEGIN
  IF v_normalized IS NULL OR length(v_normalized) < 2 THEN
    RETURN;
  END IF;

  IF v_normalized ~ '^[0-9]{8,14}$' THEN
    RETURN QUERY
    SELECT resolved.*
    FROM public.resolve_verified_product_by_gtin(
      v_normalized,
      max_results
    ) AS resolved;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT searched.*
  FROM public.search_verified_products_unfiltered_gtin_v1(
    q,
    max_results
  ) AS searched;
END;
$function$;

COMMENT ON FUNCTION public.search_verified_products(TEXT, INTEGER) IS
  'Verified text search plus ingredient-version-safe barcode resolution; reused GTIN conflicts abstain.';

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER)
  TO authenticated, service_role;

DO $postcondition$
DECLARE
  v_freshpet_text_cache TEXT;
  v_kasiks_cat_cache TEXT;
  v_nutrisource_cache TEXT;
BEGIN
  IF (
    SELECT count(*)
    FROM public.search_verified_products('851893001731', 8)
  ) <> 0 OR (
    SELECT count(*)
    FROM public.search_verified_products('038100026743', 8)
  ) <> 0 THEN
    RAISE EXCEPTION
      'Conflicting ingredient-version GTIN did not safely abstain';
  END IF;

  IF (
    SELECT count(*)
    FROM public.search_verified_products('076344060048', 8)
  ) <> 1 OR (
    SELECT count(*)
    FROM public.search_verified_products('627975010348', 8)
  ) <> 1 OR (
    SELECT count(*)
    FROM public.search_verified_products('073893041016', 8)
  ) <> 1 THEN
    RAISE EXCEPTION
      'Unambiguous barcode lookup regressed after safe delegation';
  END IF;

  SELECT result.cache_key
  INTO v_freshpet_text_cache
  FROM public.search_verified_products(
    'Freshpet Vital Grain Free Turkey Recipe with Spinach Cranberries Blueberries',
    1
  ) AS result
  LIMIT 1;

  SELECT result.cache_key
  INTO v_kasiks_cat_cache
  FROM public.search_verified_products(
    'KASIKS Fraser Valley Grub Formula for Cats 5.5oz 24 Cans',
    1
  ) AS result
  LIMIT 1;

  SELECT result.cache_key
  INTO v_nutrisource_cache
  FROM public.search_verified_products(
    'NutriSource Chicken Rice Senior Wet Dog Food',
    1
  ) AS result
  LIMIT 1;

  IF v_freshpet_text_cache IS DISTINCT FROM 'freshpet:851893001731'
    OR v_kasiks_cat_cache IS DISTINCT FROM
      'kasiks-firstmate:product-kasiks-grub-formula-cats-12-cans'
    OR v_nutrisource_cache IS DISTINCT FROM
      'nutrisource:073893041016'
  THEN
    RAISE EXCEPTION
      'Exact text search changed while repairing barcode abstention: %, %, %',
      v_freshpet_text_cache,
      v_kasiks_cat_cache,
      v_nutrisource_cache;
  END IF;
END;
$postcondition$;
