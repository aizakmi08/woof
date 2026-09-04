-- A GTIN can be observed by multiple sources, but it must never identify
-- different formulas. Source-specific listings remain distinct SKU evidence.

DROP INDEX public.catalog_skus_active_gtin_idx;

CREATE INDEX catalog_skus_active_gtin_idx
  ON public.catalog_skus (gtin)
  WHERE active AND gtin IS NOT NULL AND gtin <> '';

CREATE OR REPLACE FUNCTION public.enforce_catalog_sku_gtin_formula_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.active AND NULLIF(btrim(NEW.gtin), '') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.catalog_skus existing
    WHERE existing.active
      AND existing.gtin = NEW.gtin
      AND existing.formula_id <> NEW.formula_id
      AND existing.id <> COALESCE(NEW.id, -1)
  ) THEN
    RAISE EXCEPTION
      'GTIN % is already attached to a different active catalog formula',
      NEW.gtin
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER enforce_catalog_sku_gtin_formula_consistency
AFTER INSERT OR UPDATE OF formula_id, gtin, active
ON public.catalog_skus
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_catalog_sku_gtin_formula_consistency();

REVOKE ALL ON FUNCTION public.enforce_catalog_sku_gtin_formula_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_catalog_sku_gtin_formula_consistency() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_catalog_sku_gtin_formula_consistency() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_catalog_sku_gtin_formula_consistency() TO service_role;
