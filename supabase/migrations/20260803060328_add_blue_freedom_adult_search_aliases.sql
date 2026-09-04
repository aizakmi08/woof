-- Blue Buffalo's official Adult and Mature Freedom Indoor pages currently use
-- the same generic display title. Preserve the visible life-stage boundary in
-- exact search without merging the two ingredient formulas.

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
    'blue-buffalo-general-mills:blue buffalo blue freedom dry cat food grain-free indoor chicken recipe freedom indoor-chicken',
    'Blue Buffalo Freedom Adult Indoor Chicken Dry Cat Food',
    public.normalize_verified_product_search_query(
      'Blue Buffalo Freedom Adult Indoor Chicken Dry Cat Food'
    ),
    'https://www.bluebuffalo.com/dry-cat-food/freedom/indoor-chicken/',
    'manufacturer',
    '2026-08-03T05:56:09Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'life_stage_boundary', 'adult',
      'source_field', 'official_product_url_and_page_metadata'
    ),
    TRUE,
    NOW()
  ),
  (
    'blue-buffalo-general-mills:blue buffalo blue freedom dry cat food grain-free indoor chicken recipe freedom indoor-chicken',
    'Blue Buffalo Freedom Grain-Free Adult Indoor Chicken Recipe Dry Cat Food',
    public.normalize_verified_product_search_query(
      'Blue Buffalo Freedom Grain-Free Adult Indoor Chicken Recipe Dry Cat Food'
    ),
    'https://www.bluebuffalo.com/dry-cat-food/freedom/indoor-chicken/',
    'manufacturer',
    '2026-08-03T05:56:09Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'life_stage_boundary', 'adult',
      'source_field', 'official_product_url_and_page_metadata'
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
  v_adult TEXT;
  v_mature TEXT;
  v_expected_adult CONSTANT TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue freedom dry cat food grain-free indoor chicken recipe freedom indoor-chicken';
  v_expected_mature CONSTANT TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue freedom dry cat food grain-free indoor chicken recipe freedom mature-indoor-chicken';
BEGIN
  SELECT cache_key INTO v_adult
  FROM public.search_verified_products(
    'Blue Buffalo Freedom Adult Indoor Chicken Dry Cat Food',
    1
  );

  SELECT cache_key INTO v_mature
  FROM public.search_verified_products(
    'Blue Buffalo Freedom Mature Indoor Chicken Dry Cat Food',
    1
  );

  IF v_adult IS DISTINCT FROM v_expected_adult THEN
    RAISE EXCEPTION 'Freedom Adult exact search selected %, expected %',
      v_adult, v_expected_adult;
  END IF;

  IF v_mature IS DISTINCT FROM v_expected_mature THEN
    RAISE EXCEPTION 'Freedom Mature exact search selected %, expected %',
      v_mature, v_expected_mature;
  END IF;

  IF v_adult = v_mature THEN
    RAISE EXCEPTION 'Freedom Adult and Mature exact searches crossed life-stage boundary';
  END IF;
END;
$$;
