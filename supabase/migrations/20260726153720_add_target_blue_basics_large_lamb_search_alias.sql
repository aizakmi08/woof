-- Keep the Target merchandising title searchable while returning the
-- ingredient-equivalent manufacturer-current formula.

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,alias_text,normalized_alias,source_url,source_authority,
  evidence_observed_at,provenance,active,created_at,updated_at
) VALUES (
  'blue-buffalo-general-mills:blue buffalo blue basics large breed adult dry dog food - grain-free lamb potato basics large-breed-grain-free-lamb-potato-recipe',
  'Blue Buffalo Basics Skin Stomach Care Grain Free Lamb Potato Recipe Large Breed Dry Dog Food',
  public.normalize_verified_product_search_query(
    'Blue Buffalo Basics Skin Stomach Care Grain Free Lamb Potato Recipe Large Breed Dry Dog Food'
  ),
  'https://www.bluebuffalo.com/dry-dog-food/basics/large-breed-grain-free-lamb-potato-recipe/',
  'manufacturer',
  '2026-07-27T03:25:00Z',
  jsonb_build_object(
    'formula_evidence_tier','manufacturer_current_exact',
    'generic_name_prefers_manufacturer_current',true,
    'target_package_gtin','840243100064',
    'target_product_code','TCIN 76341630',
    'ingredient_hash_equality_verified',true
  ),
  true,now(),now()
)
ON CONFLICT (normalized_alias) WHERE active DO UPDATE SET
  cache_key=excluded.cache_key,alias_text=excluded.alias_text,
  source_url=excluded.source_url,source_authority=excluded.source_authority,
  evidence_observed_at=excluded.evidence_observed_at,
  provenance=excluded.provenance,updated_at=now();

DO $$
BEGIN
  IF (
    SELECT cache_key FROM public.search_verified_products(
      'Blue Buffalo Basics Skin Stomach Care Grain Free Lamb Potato Recipe Large Breed Dry Dog Food',
      1
    ) LIMIT 1
  ) IS DISTINCT FROM
    'blue-buffalo-general-mills:blue buffalo blue basics large breed adult dry dog food - grain-free lamb potato basics large-breed-grain-free-lamb-potato-recipe'
  THEN
    RAISE EXCEPTION 'Large Breed Lamb exact Target title search failed';
  END IF;
END
$$;
