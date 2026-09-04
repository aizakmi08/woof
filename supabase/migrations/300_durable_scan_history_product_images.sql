-- Keep source-backed front-package images durable across devices and cache expiry.
ALTER TABLE public.scan_history
  ADD COLUMN IF NOT EXISTS product_image_url TEXT;

COMMENT ON COLUMN public.scan_history.product_image_url IS
  'Source-backed catalog front image saved separately from the user capture URI.';
