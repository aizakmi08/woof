-- 018: Add full nutrient panel support to product_data.
--
-- Directly addresses Eric Schwartz's scoring feedback point #4: "Nutrient
-- levels should be taken into account, though this would be a challenge as
-- most dog foods don't disclose their complete nutrient panels on a dry-matter
-- basis. A few have it on their website but not many."
--
-- When populated, nutrient_panel lets the analyze Edge Function score
-- Nutritional Balance against real dry-matter-basis figures instead of the
-- guaranteed-analysis min/max. When NULL, we fall back to the guaranteed
-- analysis from nutritional_info (which is what most OPFF-sourced rows have)
-- and flag nutrientDataCompleteness as "incomplete" in the scoring.
--
-- Populated by scripts/scrape-nutrient-panels.js (brand-site ScrapingBee) and
-- by the existing product_data scrapers when the panel is visible on the
-- source page.

-- Full nutrient panel as published on the brand / retailer page.
-- Shape (all fields optional except `basis`):
--   {
--     "basis": "as-fed" | "dry-matter",
--     "protein_pct": 32.5,
--     "fat_pct": 15,
--     "fiber_pct": 4,
--     "moisture_pct": 10,
--     "ash_pct": 8,
--     "calcium_pct": 1.2,
--     "phosphorus_pct": 0.9,
--     "omega_3_pct": 0.5,
--     "omega_6_pct": 2.8,
--     "calories_per_cup": 380,
--     "calories_per_kg": 3800,
--     "source_url": "https://brand.com/product-nutrients"
--   }
ALTER TABLE product_data
  ADD COLUMN IF NOT EXISTS nutrient_panel JSONB,
  ADD COLUMN IF NOT EXISTS has_published_nutrients BOOLEAN DEFAULT FALSE;

-- Index for the "brands that publish vs hide" leaderboard query. Partial index
-- keeps it tiny — only rows with nutrients are indexed.
CREATE INDEX IF NOT EXISTS idx_product_data_has_nutrients
  ON product_data (brand) WHERE has_published_nutrients = TRUE;

-- Extend save_product_data RPC so the existing scrapers can populate nutrients
-- in one call without a separate UPDATE. Matches the signature ordering in
-- migration 012 (p_cache_key, p_product_name, p_brand, p_ingredients,
-- p_ingredient_text, p_ingredient_count, p_source, p_image_url).
CREATE OR REPLACE FUNCTION save_product_data_with_nutrients(
  p_cache_key TEXT,
  p_product_name TEXT,
  p_brand TEXT,
  p_ingredients TEXT[],
  p_ingredient_text TEXT,
  p_ingredient_count INT,
  p_source TEXT,
  p_image_url TEXT DEFAULT NULL,
  p_nutrient_panel JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, nutritional_info, source, image_url, scraped_at,
    expires_at, nutrient_panel, has_published_nutrients
  ) VALUES (
    p_cache_key,
    p_product_name,
    p_brand,
    p_ingredients,
    p_ingredient_text,
    p_ingredient_count,
    NULL,
    p_source,
    p_image_url,
    NOW(),
    NOW() + INTERVAL '365 days',
    p_nutrient_panel,
    p_nutrient_panel IS NOT NULL
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    product_name = COALESCE(EXCLUDED.product_name, product_data.product_name),
    brand = COALESCE(EXCLUDED.brand, product_data.brand),
    ingredients = CASE
      WHEN array_length(EXCLUDED.ingredients, 1) >= array_length(product_data.ingredients, 1)
        THEN EXCLUDED.ingredients
      ELSE product_data.ingredients
    END,
    ingredient_text = CASE
      WHEN LENGTH(EXCLUDED.ingredient_text) > LENGTH(COALESCE(product_data.ingredient_text, ''))
        THEN EXCLUDED.ingredient_text
      ELSE product_data.ingredient_text
    END,
    ingredient_count = GREATEST(EXCLUDED.ingredient_count, product_data.ingredient_count),
    source = COALESCE(EXCLUDED.source, product_data.source),
    image_url = COALESCE(EXCLUDED.image_url, product_data.image_url),
    -- Merge nutrient_panel: new data wins only when it's non-null.
    nutrient_panel = COALESCE(EXCLUDED.nutrient_panel, product_data.nutrient_panel),
    has_published_nutrients = product_data.has_published_nutrients OR EXCLUDED.has_published_nutrients,
    scraped_at = NOW(),
    expires_at = NOW() + INTERVAL '365 days',
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION save_product_data_with_nutrients(TEXT, TEXT, TEXT, TEXT[], TEXT, INT, TEXT, TEXT, JSONB)
  TO service_role, authenticated;
