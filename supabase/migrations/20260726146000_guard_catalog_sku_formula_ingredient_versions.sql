-- A GTIN/package may be linked to a canonical formula only when every retained
-- trusted serving row for that GTIN has the same full ingredient statement.
-- This protects formula-version boundaries even when a hand-written migration
-- bypasses the staged census identity guard.

CREATE OR REPLACE FUNCTION public.guard_catalog_sku_formula_ingredient_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_formula_ingredients TEXT;
BEGIN
  IF NOT COALESCE(NEW.active, false)
     OR NULLIF(regexp_replace(COALESCE(NEW.gtin, ''), '\D', '', 'g'), '') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ingredient_text
  INTO v_formula_ingredients
  FROM public.catalog_formulas
  WHERE id = NEW.formula_id;

  IF NULLIF(btrim(COALESCE(v_formula_ingredients, '')), '') IS NULL THEN
    RAISE EXCEPTION
      'catalog_sku_gtin_formula_missing_ingredients: GTIN % formula %',
      NEW.gtin,
      NEW.formula_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data AS serving
    WHERE regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g') =
      regexp_replace(NEW.gtin, '\D', '', 'g')
      AND NULLIF(btrim(COALESCE(serving.ingredient_text, '')), '') IS NOT NULL
      AND serving.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      AND public.catalog_normalize_ingredient_evidence(
        serving.ingredient_text
      ) <> public.catalog_normalize_ingredient_evidence(
        v_formula_ingredients
      )
  ) THEN
    RAISE EXCEPTION
      'catalog_sku_gtin_formula_ingredient_conflict: GTIN % cannot link to formula %',
      NEW.gtin,
      NEW.formula_id;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guard_catalog_sku_formula_ingredient_version
  ON public.catalog_skus;

CREATE TRIGGER guard_catalog_sku_formula_ingredient_version
BEFORE INSERT OR UPDATE OF formula_id, gtin, active
ON public.catalog_skus
FOR EACH ROW
EXECUTE FUNCTION public.guard_catalog_sku_formula_ingredient_version();
