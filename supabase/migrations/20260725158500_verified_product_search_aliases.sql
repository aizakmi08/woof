-- Add a private, provenance-backed exact alias lane for verified products.
-- This keeps historical/front-label wording searchable without putting
-- marketing aliases into canonical formula identity or ingredient evidence.

CREATE TABLE public.catalog_verified_product_search_aliases (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cache_key TEXT NOT NULL
    REFERENCES public.product_data(cache_key)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  alias_text TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_authority TEXT NOT NULL,
  evidence_observed_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catalog_verified_product_search_aliases_text_check
    CHECK (length(trim(alias_text)) >= 3),
  CONSTRAINT catalog_verified_product_search_aliases_normalized_check
    CHECK (length(trim(normalized_alias)) >= 2),
  CONSTRAINT catalog_verified_product_search_aliases_source_check
    CHECK (length(trim(source_url)) >= 8),
  CONSTRAINT catalog_verified_product_search_aliases_authority_check
    CHECK (source_authority IN (
      'manufacturer',
      'official',
      'gdsn',
      'retailer_verified',
      'label_ocr_verified'
    ))
);

CREATE UNIQUE INDEX catalog_verified_product_search_aliases_active_identity_idx
  ON public.catalog_verified_product_search_aliases(normalized_alias)
  WHERE active;

CREATE INDEX catalog_verified_product_search_aliases_cache_key_idx
  ON public.catalog_verified_product_search_aliases(cache_key);

ALTER TABLE public.catalog_verified_product_search_aliases
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_verified_product_search_aliases
  FROM PUBLIC;
REVOKE ALL ON TABLE public.catalog_verified_product_search_aliases
  FROM anon;
REVOKE ALL ON TABLE public.catalog_verified_product_search_aliases
  FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_verified_product_search_aliases
  TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_verified_product_search_aliases_id_seq
  TO service_role;

ALTER FUNCTION public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  RENAME TO search_verified_products_base_v2;

REVOKE ALL ON FUNCTION
  public.search_verified_products_base_v2(TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.search_verified_products_base_v2(TEXT, INTEGER)
  FROM anon;
REVOKE ALL ON FUNCTION
  public.search_verified_products_base_v2(TEXT, INTEGER)
  FROM authenticated;
REVOKE ALL ON FUNCTION
  public.search_verified_products_base_v2(TEXT, INTEGER)
  FROM service_role;

CREATE OR REPLACE FUNCTION public.search_verified_products_unprotected_age_v1(
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
AS $$
DECLARE
  v_normalized TEXT :=
    public.normalize_verified_product_search_query(q);
  v_safe_limit INTEGER :=
    LEAST(GREATEST(COALESCE(max_results, 10), 1), 25);
  v_result_count INTEGER := 0;
BEGIN
  IF v_normalized IS NULL OR length(v_normalized) < 2 THEN
    RETURN;
  END IF;

  -- Exact, unique, source-backed aliases take priority. The unique partial
  -- index prevents the same active alias from ever selecting two siblings.
  RETURN QUERY
  SELECT
    product.cache_key,
    product.product_name,
    product.brand,
    NULLIF(trim(product.gtin), '') AS gtin,
    NULLIF(trim(product.product_line), '') AS product_line,
    NULLIF(trim(product.flavor), '') AS flavor,
    NULLIF(trim(product.life_stage), '') AS life_stage,
    NULLIF(trim(product.food_form), '') AS food_form,
    NULLIF(trim(product.package_size), '') AS package_size,
    COALESCE(product.pet_type, 'unknown') AS pet_type,
    product.ingredient_count,
    product.source,
    COALESCE(product.source_quality, 'unknown') AS source_quality,
    COALESCE(
      product.ingredient_verification_status,
      'unverified'
    ) AS ingredient_verification_status,
    COALESCE(
      product.image_verification_status,
      'unverified'
    ) AS image_verification_status,
    product.verified_at,
    CASE
      WHEN product.image_url ILIKE 'data:%' THEN NULL
      ELSE product.image_url
    END AS image_url,
    product.ingredients,
    COALESCE(
      NULLIF(product.ingredient_text, ''),
      array_to_string(product.ingredients, ', ')
    ) AS ingredient_text,
    product.nutritional_info,
    product.nutrient_panel,
    COALESCE(product.has_published_nutrients, FALSE)
      AS has_published_nutrients,
    product.source_url,
    24.0::REAL AS rank
  FROM public.catalog_verified_product_search_aliases alias
  JOIN public.product_data product
    ON product.cache_key = alias.cache_key
  WHERE alias.active
    AND alias.normalized_alias = v_normalized
    AND product.expires_at > now()
    AND product.ingredient_count >= 5
    AND product.is_complete_food = TRUE
    AND product.catalog_exclusion_reason IS NULL
    AND lower(COALESCE(product.pet_type, '')) IN ('dog', 'cat')
    AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
    AND product.source_quality IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified'
    )
    AND product.ingredient_verification_status IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )
    AND product.image_verification_status IN (
      'official',
      'manufacturer',
      'retailer_verified'
    )
    AND product.image_url IS NOT NULL
    AND product.image_url !~* '^data:'
  ORDER BY
    product.ingredient_count DESC,
    product.verified_at DESC NULLS LAST
  LIMIT 1;

  GET DIAGNOSTICS v_result_count = ROW_COUNT;
  IF v_result_count > 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.search_verified_products_base_v2(q, v_safe_limit)
  LIMIT v_safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION
  public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM anon;
REVOKE ALL ON FUNCTION
  public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM authenticated;
REVOKE ALL ON FUNCTION
  public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM service_role;

