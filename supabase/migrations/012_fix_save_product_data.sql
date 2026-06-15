-- Fix function overload issue — drop the old version without p_image_url
-- and keep only the new version that accepts all parameters

-- Drop old 7-param version
DROP FUNCTION IF EXISTS save_product_data(TEXT, TEXT, TEXT, TEXT[], TEXT, INTEGER, TEXT);

-- Recreate single version with p_image_url (DEFAULT NULL so it's backward compatible)
CREATE OR REPLACE FUNCTION save_product_data(
  p_cache_key TEXT,
  p_product_name TEXT,
  p_brand TEXT,
  p_ingredients TEXT[],
  p_ingredient_text TEXT,
  p_ingredient_count INTEGER,
  p_source TEXT DEFAULT 'user_ocr',
  p_image_url TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO product_data (cache_key, product_name, brand, ingredients, ingredient_text, ingredient_count, source, image_url, scraped_at, expires_at)
  VALUES (p_cache_key, p_product_name, p_brand, p_ingredients, p_ingredient_text, p_ingredient_count, p_source, p_image_url, NOW(), NOW() + INTERVAL '90 days')
  ON CONFLICT (cache_key) DO UPDATE SET
    ingredients = EXCLUDED.ingredients,
    ingredient_text = EXCLUDED.ingredient_text,
    ingredient_count = EXCLUDED.ingredient_count,
    source = EXCLUDED.source,
    image_url = COALESCE(EXCLUDED.image_url, product_data.image_url),
    scraped_at = NOW(),
    expires_at = NOW() + INTERVAL '90 days';
END;
$$;
