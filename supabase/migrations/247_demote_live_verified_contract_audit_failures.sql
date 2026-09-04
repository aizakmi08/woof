WITH demotions(id, exclusion_reason) AS (
  VALUES
    ('42da9d18-6bdd-4ea3-ad07-b93522a06a2b'::UUID, 'multi_formula_or_variety_pack'),
    ('2d24c8da-c156-4731-a305-84717eca9f72'::UUID, 'variant_nutrient_mismatch'),
    ('d3333096-ce95-40e6-9a84-0c3981d3a0ee'::UUID, 'analysis_copy_in_ingredients'),
    ('f6c6abd4-45e3-467b-9ac7-96be20d73f0b'::UUID, 'variant_source_url_mismatch'),
    ('8e3567e6-7101-41d5-9774-be7db37eae18'::UUID, 'non_single_product_bundle'),
    ('b1d848cb-b779-4bbf-98fc-e87cba86d940'::UUID, 'multi_formula_or_variety_pack'),
    ('76b1ab9b-725e-443a-ac71-af60a863ac3e'::UUID, 'multi_formula_or_variety_pack')
)
UPDATE public.product_data AS pd
SET
  is_complete_food = FALSE,
  catalog_exclusion_reason = demotions.exclusion_reason,
  ingredient_verification_status = 'unverified',
  updated_at = now()
FROM demotions
WHERE pd.id = demotions.id
  AND pd.is_complete_food = TRUE
  AND pd.catalog_exclusion_reason IS NULL;
