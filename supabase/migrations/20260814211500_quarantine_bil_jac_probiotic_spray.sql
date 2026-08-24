-- Bil-Jac BreakThru Biotics is a probiotic spray, not a complete food. A
-- legacy retailer census formula incorrectly marked it complete. Remove the
-- source-version serving row and quarantine the canonical formula/observation.

DELETE FROM public.product_data
WHERE cache_key =
  'retailer-web:chewy:103de631fbdedbea5f3bc68fcf71823a1ddc0d53b9cef401bdeb8547fbe773ab:e1c61dd44c79e246';

UPDATE public.catalog_retailer_ingredient_evidence
SET
  evidence_status = 'quarantined_validation',
  promoted_cache_key = NULL,
  validation_reasons = CASE
    WHEN 'non_complete_probiotic_spray' = ANY(validation_reasons)
      THEN validation_reasons
    ELSE array_append(validation_reasons, 'non_complete_probiotic_spray')
  END,
  updated_at = now()
WHERE import_run_id = '615c043f-c3da-4784-842e-0c766af51ab3'::UUID
  AND linked_formula_id = 11082;

DELETE FROM public.catalog_skus
WHERE formula_id = 11082
  AND source_slug = 'chewy-retailer-web';

UPDATE public.catalog_observations
SET
  validation_status = 'quarantined',
  validation_reasons = CASE
    WHEN 'non_complete_probiotic_spray' = ANY(validation_reasons)
      THEN validation_reasons
    ELSE array_append(validation_reasons, 'non_complete_probiotic_spray')
  END
WHERE formula_id = 11082;

UPDATE public.catalog_formulas
SET
  is_complete_food = false,
  verification_status = 'quarantined',
  active = false,
  absent_since = COALESCE(absent_since, now()),
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = now()
WHERE id = 11082;
