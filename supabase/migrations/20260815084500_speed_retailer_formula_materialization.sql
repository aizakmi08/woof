-- Exact title reconciliation is part of every retailer-web materialization
-- batch. Index the immutable normalized title expressions so this safety
-- check does not scan the full formula ledger for every incoming SKU.

CREATE INDEX IF NOT EXISTS catalog_formulas_exact_retailer_product_name_idx
  ON public.catalog_formulas (
    pet_type,
    public.catalog_normalize_retailer_title(product_name)
  )
  WHERE active AND is_complete_food;

CREATE INDEX IF NOT EXISTS catalog_formulas_exact_retailer_product_line_idx
  ON public.catalog_formulas (
    pet_type,
    public.catalog_normalize_retailer_title(product_line)
  )
  WHERE active AND is_complete_food;
