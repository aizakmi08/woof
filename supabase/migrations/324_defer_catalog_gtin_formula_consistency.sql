-- Formula identity refinement may move several source-specific SKU rows for
-- the same GTIN in one statement. Check the invariant at transaction end so
-- the complete atomic move is visible, while retaining the same hard failure
-- for any committed cross-formula GTIN.

DROP TRIGGER enforce_catalog_sku_gtin_formula_consistency
ON public.catalog_skus;

CREATE CONSTRAINT TRIGGER enforce_catalog_sku_gtin_formula_consistency
AFTER INSERT OR UPDATE OF formula_id, gtin, active
ON public.catalog_skus
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_catalog_sku_gtin_formula_consistency();
