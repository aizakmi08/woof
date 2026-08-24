-- Blue Buffalo reuses a generic display title for the distinct Mature Indoor
-- formula. Add evidence-backed aliases with the visible life-stage boundary,
-- and prefer the current official Wilderness Indoor formula over stale
-- retailer copies for the exact current-product query.

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
VALUES
  (
    'blue-buffalo-general-mills:blue buffalo blue freedom dry cat food grain-free indoor chicken recipe freedom mature-indoor-chicken',
    'Blue Buffalo Freedom Mature Indoor Chicken Dry Cat Food',
    public.normalize_verified_product_search_query(
      'Blue Buffalo Freedom Mature Indoor Chicken Dry Cat Food'
    ),
    'https://www.bluebuffalo.com/dry-cat-food/freedom/mature-indoor-chicken/',
    'manufacturer',
    '2026-08-03T05:56:09Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'life_stage_boundary', 'senior/mature',
      'source_field', 'official_product_url_and_page_metadata'
    ),
    TRUE,
    NOW()
  ),
  (
    'blue-buffalo-general-mills:blue buffalo blue freedom dry cat food grain-free indoor chicken recipe freedom mature-indoor-chicken',
    'Blue Buffalo Freedom Grain-Free Mature Indoor Chicken Recipe Dry Cat Food',
    public.normalize_verified_product_search_query(
      'Blue Buffalo Freedom Grain-Free Mature Indoor Chicken Recipe Dry Cat Food'
    ),
    'https://www.bluebuffalo.com/dry-cat-food/freedom/mature-indoor-chicken/',
    'manufacturer',
    '2026-08-03T05:56:09Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'life_stage_boundary', 'senior/mature',
      'source_field', 'official_product_url_and_page_metadata'
    ),
    TRUE,
    NOW()
  ),
  (
    'blue-buffalo-general-mills:blue buffalo blue wilderness adult dry cat food - indoor chicken wilderness indoor-chicken',
    'Blue Buffalo Wilderness Adult Indoor Chicken Dry Cat Food',
    public.normalize_verified_product_search_query(
      'Blue Buffalo Wilderness Adult Indoor Chicken Dry Cat Food'
    ),
    'https://www.bluebuffalo.com/dry-cat-food/wilderness/indoor-chicken/',
    'manufacturer',
    '2026-08-03T05:56:09Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'life_stage_boundary', 'adult',
      'source_field', 'official_product_page'
    ),
    TRUE,
    NOW()
  )
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET
  cache_key = EXCLUDED.cache_key,
  alias_text = EXCLUDED.alias_text,
  source_url = EXCLUDED.source_url,
  source_authority = EXCLUDED.source_authority,
  evidence_observed_at = EXCLUDED.evidence_observed_at,
  provenance = EXCLUDED.provenance,
  updated_at = NOW();

DO $$
DECLARE
  v_mature TEXT;
  v_adult TEXT;
BEGIN
  SELECT cache_key INTO v_mature
  FROM public.search_verified_products(
    'Blue Buffalo Freedom Mature Indoor Chicken Dry Cat Food',
    1
  );

  SELECT cache_key INTO v_adult
  FROM public.search_verified_products(
    'Blue Buffalo Wilderness Adult Indoor Chicken Dry Cat Food',
    1
  );

  IF v_mature <> 'blue-buffalo-general-mills:blue buffalo blue freedom dry cat food grain-free indoor chicken recipe freedom mature-indoor-chicken' THEN
    RAISE EXCEPTION 'Mature Indoor exact search did not select the current formula';
  END IF;

  IF v_adult <> 'blue-buffalo-general-mills:blue buffalo blue wilderness adult dry cat food - indoor chicken wilderness indoor-chicken' THEN
    RAISE EXCEPTION 'Wilderness Adult Indoor exact search did not select the current formula';
  END IF;
END;
$$;
