-- Barcode resolution normalizes punctuation and leading zeroes before matching.
-- Keep that exact expression indexed so a catalog-sized lookup never scans the
-- full product or SKU table.

CREATE INDEX IF NOT EXISTS idx_product_data_normalized_gtin
  ON public.product_data (
    ltrim(
      regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g'),
      '0'
    )
  );

DO $migration$
BEGIN
  IF to_regclass('public.catalog_skus') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_catalog_skus_normalized_gtin
        ON public.catalog_skus (
          ltrim(
            regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g'),
            '0'
          )
        )
    $sql$;
  END IF;
END;
$migration$;
