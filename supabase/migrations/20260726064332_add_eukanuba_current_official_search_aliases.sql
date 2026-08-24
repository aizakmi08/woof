-- Current Eukanuba manufacturer pages use numeric performance ratios and
-- refreshed product titles that the generic full-text path does not always
-- resolve. Bind only the exact official, verified serving identities. These
-- aliases improve typed/label lookup without merging formula versions or SKU
-- children.

BEGIN;

WITH reviewed(alias_text, cache_key) AS (
  VALUES
    ('Eukanuba Premium Performance 26/16 EXERCISE Small Bites', 'eukanuba:030111569288'),
    ('Eukanuba Adult Large Breed Dog Food Dry', 'eukanuba:030111635150'),
    ('Eukanuba Senior Large Breed Dry Dog Food, 33 lb', 'eukanuba:030111637338'),
    ('Eukanuba Senior Small Breed Dry Dog Food', 'eukanuba:030111640147'),
    ('Eukanuba Senior Medium Breed Dry Dog Food', 'eukanuba:030111641144'),
    ('Eukanuba Adult Small Bites Dry Dog Food', 'eukanuba:030111642158'),
    ('Eukanuba Adult LP Small & Medium Breed Dry', 'eukanuba:030111730145'),
    ('Eukanuba Premium Performance Puppy Pro Dry Dog Food, 28 lb Bag', 'eukanuba:030111828002'),
    ('Eukanuba Premium Performance 30/20 Sport Dry Dog Food', 'eukanuba:030111861412')
)
INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance,
  active,
  created_at,
  updated_at
)
SELECT
  reviewed.cache_key,
  reviewed.alias_text,
  public.normalize_verified_product_search_query(reviewed.alias_text),
  product.source_url,
  'manufacturer',
  product.verified_at,
  jsonb_build_object(
    'review_kind', 'current_official_product_title',
    'brand', 'Eukanuba',
    'identity_boundaries', jsonb_build_array(
      'brand',
      'product_line',
      'life_stage',
      'food_form',
      'recipe',
      'formula_version'
    ),
    'gtin', product.gtin,
    'ingredient_md5', md5(product.ingredient_text),
    'migration', '20260726064332_add_eukanuba_current_official_search_aliases'
  ),
  TRUE,
  now(),
  now()
FROM reviewed
JOIN public.product_data product
  ON product.cache_key = reviewed.cache_key
WHERE product.brand = 'Eukanuba'
  AND product.source = 'eukanuba'
  AND product.source_quality = 'manufacturer'
  AND product.ingredient_verification_status = 'label_ocr_verified'
  AND product.image_verification_status = 'manufacturer'
  AND product.is_complete_food = TRUE
  AND product.catalog_exclusion_reason IS NULL
  AND product.ingredient_count >= 5
  AND COALESCE(NULLIF(btrim(product.source_url), ''), '') LIKE 'https://www.eukanuba.com/products/%'
  AND COALESCE(NULLIF(btrim(product.image_url), ''), '') LIKE 'https://www.eukanuba.com/%'
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_alias_count INTEGER;
  v_failed_queries INTEGER;
BEGIN
  WITH reviewed(alias_text, cache_key) AS (
    VALUES
      ('Eukanuba Premium Performance 26/16 EXERCISE Small Bites', 'eukanuba:030111569288'),
      ('Eukanuba Adult Large Breed Dog Food Dry', 'eukanuba:030111635150'),
      ('Eukanuba Senior Large Breed Dry Dog Food, 33 lb', 'eukanuba:030111637338'),
      ('Eukanuba Senior Small Breed Dry Dog Food', 'eukanuba:030111640147'),
      ('Eukanuba Senior Medium Breed Dry Dog Food', 'eukanuba:030111641144'),
      ('Eukanuba Adult Small Bites Dry Dog Food', 'eukanuba:030111642158'),
      ('Eukanuba Adult LP Small & Medium Breed Dry', 'eukanuba:030111730145'),
      ('Eukanuba Premium Performance Puppy Pro Dry Dog Food, 28 lb Bag', 'eukanuba:030111828002'),
      ('Eukanuba Premium Performance 30/20 Sport Dry Dog Food', 'eukanuba:030111861412')
  )
  SELECT count(*)
  INTO v_alias_count
  FROM reviewed
  JOIN public.catalog_verified_product_search_aliases alias
    ON alias.normalized_alias =
      public.normalize_verified_product_search_query(reviewed.alias_text)
   AND alias.cache_key = reviewed.cache_key
   AND alias.active;

  IF v_alias_count <> 9 THEN
    RAISE EXCEPTION
      'Expected 9 exact active Eukanuba aliases; found %',
      v_alias_count;
  END IF;

  WITH reviewed(query_text, expected_cache_key) AS (
    VALUES
      ('Eukanuba Premium Performance 26/16 EXERCISE Small Bites', 'eukanuba:030111569288'),
      ('Eukanuba Adult Large Breed Dog Food Dry', 'eukanuba:030111635150'),
      ('Eukanuba Senior Large Breed Dry Dog Food, 33 lb', 'eukanuba:030111637338'),
      ('Eukanuba Senior Small Breed Dry Dog Food', 'eukanuba:030111640147'),
      ('Eukanuba Senior Medium Breed Dry Dog Food', 'eukanuba:030111641144'),
      ('Eukanuba Adult Small Bites Dry Dog Food', 'eukanuba:030111642158'),
      ('Eukanuba Adult LP Small & Medium Breed Dry', 'eukanuba:030111730145'),
      ('Eukanuba Premium Performance Puppy Pro Dry Dog Food, 28 lb Bag', 'eukanuba:030111828002'),
      ('Eukanuba Premium Performance 30/20 Sport Dry Dog Food', 'eukanuba:030111861412')
  )
  SELECT count(*)
  INTO v_failed_queries
  FROM reviewed
  LEFT JOIN LATERAL (
    SELECT result.cache_key
    FROM public.search_verified_products(reviewed.query_text, 1) result
    ORDER BY result.rank DESC
    LIMIT 1
  ) top_result ON TRUE
  WHERE top_result.cache_key IS DISTINCT FROM reviewed.expected_cache_key;

  IF v_failed_queries <> 0 THEN
    RAISE EXCEPTION
      'Eukanuba exact-title search audit has % failed cases',
      v_failed_queries;
  END IF;
END
$$;

COMMIT;
