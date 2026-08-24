-- Barcode resolution normalizes leading zeroes and non-digit separators. The
-- plain GTIN indexes cannot serve that expression, causing full scans as the
-- catalog grows. Keep both serving and canonical SKU lookups index-backed.

CREATE INDEX IF NOT EXISTS product_data_normalized_gtin_idx
  ON public.product_data ((
    ltrim(
      regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g'),
      '0'
    )
  ));

CREATE INDEX IF NOT EXISTS catalog_skus_active_normalized_gtin_idx
  ON public.catalog_skus ((
    ltrim(
      regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g'),
      '0'
    )
  ))
  WHERE active;

