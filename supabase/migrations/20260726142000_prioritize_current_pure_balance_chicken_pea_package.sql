-- Walmart currently exposes two exact Chicken & Pea package/formula versions.
-- Keep both GTIN-bound records for exact barcode/image resolution, but make the
-- current black-bag package the unique typed-search result. The older white-bag
-- record has a materially different ingredient statement and must never be
-- merged into or used as evidence for the current formula.

DO $$
DECLARE
  v_current public.product_data%ROWTYPE;
  v_prior public.product_data%ROWTYPE;
BEGIN
  SELECT *
  INTO v_current
  FROM public.product_data
  WHERE cache_key = 'walmart-reviewed-label:246701400';

  SELECT *
  INTO v_prior
  FROM public.product_data
  WHERE cache_key = 'walmart-reviewed-label:890711252';

  IF v_current.cache_key IS NULL OR v_prior.cache_key IS NULL THEN
    RAISE EXCEPTION 'Pure Balance Chicken & Pea formula-version rows are missing';
  END IF;

  IF v_current.gtin <> '681131318341'
     OR v_prior.gtin <> '681131107266'
     OR v_current.pet_type <> 'dog'
     OR v_prior.pet_type <> 'dog'
     OR v_current.food_form <> 'dry'
     OR v_prior.food_form <> 'dry'
     OR v_current.ingredient_text = v_prior.ingredient_text
     OR v_current.image_url = v_prior.image_url THEN
    RAISE EXCEPTION 'Pure Balance Chicken & Pea formula-version boundary changed';
  END IF;
END
$$;

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance,
  active,
  updated_at
)
SELECT
  product.cache_key,
  'Pure Balance Grain-Free Chicken and Pea Recipe Dry Dog Food',
  public.normalize_verified_product_search_query(
    'Pure Balance Grain-Free Chicken and Pea Recipe Dry Dog Food'
  ),
  product.source_url,
  'retailer_verified',
  product.verified_at,
  jsonb_build_object(
    'formula_version_boundary', TRUE,
    'current_front_package', 'black_bag',
    'current_gtin', product.gtin,
    'prior_gtin', '681131107266',
    'identity_evidence', product.source_url,
    'ingredient_evidence', product.source_url,
    'image_evidence', product.image_url,
    'review_method',
      'walmart_pdp_bound_package_deck_plus_vision_ocr_concordance',
    'reviewed_at', now()
  ),
  TRUE,
  now()
FROM public.product_data product
WHERE product.cache_key = 'walmart-reviewed-label:246701400'
  AND product.gtin = '681131318341'
  AND product.is_complete_food
  AND product.catalog_exclusion_reason IS NULL
  AND product.source_quality = 'retailer_verified'
  AND product.ingredient_verification_status = 'retailer_verified'
  AND product.image_verification_status = 'retailer_verified'
ON CONFLICT (normalized_alias) WHERE active
DO UPDATE SET
  cache_key = EXCLUDED.cache_key,
  alias_text = EXCLUDED.alias_text,
  source_url = EXCLUDED.source_url,
  source_authority = EXCLUDED.source_authority,
  evidence_observed_at = EXCLUDED.evidence_observed_at,
  provenance = EXCLUDED.provenance,
  updated_at = now();

DO $$
DECLARE
  v_top_cache_key TEXT;
BEGIN
  SELECT result.cache_key
  INTO v_top_cache_key
  FROM public.search_verified_products(
    'Pure Balance Grain-Free Chicken and Pea Recipe Dry Dog Food',
    1
  ) result
  LIMIT 1;

  IF v_top_cache_key <> 'walmart-reviewed-label:246701400' THEN
    RAISE EXCEPTION
      'Current Pure Balance Chicken & Pea package is not exact-search rank 1: %',
      v_top_cache_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases alias
    WHERE alias.active
      AND alias.normalized_alias =
          public.normalize_verified_product_search_query(
            'Pure Balance Grain-Free Chicken and Pea Recipe Dry Dog Food'
          )
      AND alias.cache_key = 'walmart-reviewed-label:890711252'
  ) THEN
    RAISE EXCEPTION 'Prior Pure Balance formula owns the current typed-search alias';
  END IF;
END
$$;
