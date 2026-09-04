-- Hill's a/d Urgent Care is one formula explicitly marketed for both dogs and
-- cats. A retailer-backed cat alias carried a conflicting ingredient version
-- even though the current official manufacturer PDP and package identify the
-- same Dog/Cat formula and GTIN. Rebuild that exact alias from the current
-- manufacturer row so cat lookup cannot return stale sibling ingredients.
WITH official AS (
  SELECT *
  FROM public.product_data
  WHERE cache_key = 'hill-s-pet-nutrition:052742567006'
    AND gtin = '052742567006'
    AND source_url = 'https://www.hillspet.com/dog-food/prescription-diet-ad-urgent-care-canned'
    AND source_quality = 'manufacturer'
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND product_name ~* 'dog\s*/\s*cat'
    AND catalog_exclusion_reason IS NULL
)
UPDATE public.product_data AS cat_alias
SET
  product_name = official.product_name,
  brand = official.brand,
  ingredients = official.ingredients,
  ingredient_text = official.ingredient_text,
  ingredient_count = official.ingredient_count,
  nutrient_panel = official.nutrient_panel,
  has_published_nutrients = official.has_published_nutrients,
  is_complete_food = official.is_complete_food,
  catalog_exclusion_reason = NULL,
  source = official.source,
  source_url = official.source_url,
  source_quality = official.source_quality,
  ingredient_verification_status = official.ingredient_verification_status,
  image_verification_status = official.image_verification_status,
  verified_at = official.verified_at,
  image_url = official.image_url,
  gtin = official.gtin,
  product_line = official.product_line,
  flavor = official.flavor,
  life_stage = official.life_stage,
  food_form = official.food_form,
  package_size = official.package_size,
  expires_at = official.expires_at,
  updated_at = now()
FROM official
WHERE cat_alias.cache_key = 'petsmart-retail-catalog:052742567006'
  AND cat_alias.pet_type = 'cat'
  AND cat_alias.gtin = official.gtin
  AND cat_alias.product_name ~* 'dog\s*(?:&|and)\s*cat';
