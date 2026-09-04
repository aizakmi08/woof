-- Purina's official product page currently publishes one ingredient statement
-- for both 16.5 lb and 31.1 lb bags. Replace the stale retailer statement on
-- the 31.1 lb GTIN without removing either sellable package SKU.
WITH official_formula AS (
  SELECT *
  FROM public.product_data
  WHERE gtin = '017800149266'
    AND source = 'nestle-purina-one'
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND source_url = 'https://www.purina.com/dogs/shop/purina-one-skin-and-coat-dry-dog-food'
  LIMIT 1
),
canonical_metadata AS (
  UPDATE public.product_data
  SET
    flavor = 'Salmon',
    life_stage = 'adult',
    updated_at = now()
  WHERE gtin = '017800149266'
    AND source = 'nestle-purina-one'
  RETURNING id
)
UPDATE public.product_data AS target
SET
  cache_key = 'nestle-purina-one:017800149273',
  product_name = official_formula.product_name,
  brand = official_formula.brand,
  ingredients = official_formula.ingredients,
  ingredient_text = official_formula.ingredient_text,
  ingredient_count = official_formula.ingredient_count,
  nutritional_info = official_formula.nutritional_info,
  nutrient_panel = official_formula.nutrient_panel,
  has_published_nutrients = official_formula.has_published_nutrients,
  source = 'nestle-purina-one',
  source_url = official_formula.source_url,
  image_url = official_formula.image_url,
  pet_type = official_formula.pet_type,
  source_quality = 'manufacturer',
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  verified_at = now(),
  product_line = official_formula.product_line,
  flavor = 'Salmon',
  life_stage = 'adult',
  food_form = official_formula.food_form,
  package_size = '31.1 lb',
  catalog_exclusion_reason = NULL,
  scraped_at = now(),
  updated_at = now()
FROM official_formula
WHERE target.gtin = '017800149273'
  AND NOT EXISTS (
    SELECT 1
    FROM public.product_data AS conflicting_key
    WHERE conflicting_key.cache_key = 'nestle-purina-one:017800149273'
      AND conflicting_key.id <> target.id
  );

INSERT INTO public.catalog_product_evidence (
  cache_key,
  gtin,
  product_name,
  brand,
  pet_type,
  source,
  source_quality,
  source_url,
  ingredient_source_url,
  image_source_url,
  ingredient_verification_status,
  image_verification_status,
  content_hash,
  extractor_version,
  review_state,
  evidence
)
SELECT
  'nestle-purina-one:017800149273',
  '017800149273',
  source.product_name,
  source.brand,
  source.pet_type,
  'nestle-purina-one',
  'manufacturer',
  source.source_url,
  source.source_url,
  source.source_url,
  'manufacturer',
  'manufacturer',
  md5(coalesce(source.ingredient_text, '') || '|' || coalesce(source.image_url, '') || '|017800149273'),
  'manual-official-variant-reconciliation-2026-07-14',
  'promoted',
  jsonb_build_object(
    'canonical_gtin', '017800149266',
    'official_sizes', jsonb_build_array('16.5 lb', '31.1 lb'),
    'review_reason', 'Retailer ingredient statement conflicted with the current Purina product page, which lists both bag sizes with this official formula.',
    'verified_at', now()
  )
FROM public.product_data AS source
WHERE source.gtin = '017800149266'
  AND source.source = 'nestle-purina-one'
  AND source.ingredient_verification_status = 'manufacturer'
ON CONFLICT (cache_key, source, content_hash)
WHERE content_hash IS NOT NULL
DO UPDATE SET
  updated_at = now(),
  review_state = 'promoted',
  evidence = EXCLUDED.evidence;
