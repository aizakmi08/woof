-- A stale formula-ledger row for the Beef can was overwritten with the newer
-- Filet Mignon pouch evidence because both products share a brand line and have
-- similar ingredient structures. Restore it only from the exact promoted
-- serving cache key and current official Beef URL.
DO $$
DECLARE
  updated_rows INTEGER := 0;
BEGIN
  UPDATE public.catalog_formulas AS formula
  SET
    product_name = serving.product_name,
    source_url = serving.source_url,
    ingredient_text = serving.ingredient_text,
    ingredients = serving.ingredients,
    front_image_url = serving.image_url,
    source_authority = serving.source_quality,
    ingredient_verification_status = serving.ingredient_verification_status,
    image_verification_status = serving.image_verification_status,
    last_observed_at = now(),
    updated_at = now()
  FROM public.product_data AS serving
  WHERE formula.id = 7050
    AND formula.formula_key = 'pedigree|pedigree|choice cuts in gravy|dog|adult|wet|beef|'
    AND formula.promoted_cache_key = 'pedigree-mars-petcare:023100015279'
    AND serving.cache_key = formula.promoted_cache_key
    AND serving.source_url = 'https://www.pedigree.com/products/wet/choice-cuts-gravy-adult-wet-dog-food-can-beef'
    AND md5(serving.ingredient_text) = 'fe8e1e1e9bcfac4c8f1e13e4c4e7d6ee'
    AND serving.pet_type = 'dog'
    AND serving.food_form = 'wet'
    AND serving.flavor = 'Beef'
    AND serving.is_complete_food IS TRUE
    AND serving.catalog_exclusion_reason IS NULL;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  IF updated_rows = 0 AND NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 7050
      AND promoted_cache_key = 'pedigree-mars-petcare:023100015279'
      AND source_url = 'https://www.pedigree.com/products/wet/choice-cuts-gravy-adult-wet-dog-food-can-beef'
      AND md5(ingredient_text) = 'fe8e1e1e9bcfac4c8f1e13e4c4e7d6ee'
  ) THEN
    RAISE EXCEPTION 'Exact Pedigree Beef serving evidence was not found; refusing broad ledger repair';
  END IF;
END
$$;
