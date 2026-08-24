-- Keep the currently released client safe while the cancellable one-call
-- resolver rolls through review. The old app already calls this RPC after its
-- OCR-text attempt, so delegate it to the same bounded indexed implementation.

CREATE OR REPLACE FUNCTION public.search_verified_products_for_label_ocr(
  queries TEXT[],
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '2500ms'
AS $function$
  SELECT *
  FROM public.search_verified_products_for_label_fast(
    $1,
    LEAST(GREATEST(COALESCE($2, 48), 1), 48)
  );
$function$;

REVOKE ALL ON FUNCTION
  public.search_verified_products_for_label_ocr(TEXT[], INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.search_verified_products_for_label_ocr(TEXT[], INTEGER)
  TO authenticated, service_role;

-- The released client treats an OCR-text error as a signal to continue to the
-- batch RPC. Fail this legacy broad similarity path quickly instead of letting
-- it consume the whole authenticated-role statement budget.
ALTER FUNCTION public.search_verified_products_for_label_ocr_text(TEXT, INTEGER)
  SET statement_timeout = '1200ms';
ALTER FUNCTION public.search_verified_products_for_label_ocr_text(TEXT, INTEGER)
  SET search_path = public, extensions;
