-- Add product_image_url to scan_history so recent-scans rows show the DB image
-- when a user's device syncs from Supabase (new device / app reinstall).
ALTER TABLE scan_history
  ADD COLUMN IF NOT EXISTS product_image_url TEXT;

-- Back-fill existing rows from product_data (best-effort — skips rows whose
-- cache_key doesn't match any product_data row, or where product_data.image_url is null).
UPDATE scan_history h
SET product_image_url = p.image_url
FROM product_data p
WHERE h.cache_key = p.cache_key
  AND h.product_image_url IS NULL
  AND p.image_url IS NOT NULL;
