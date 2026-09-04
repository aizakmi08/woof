-- The current official URL/GTIN resolves to a multi-flavor variety pack. It
-- must never be presented as one exact formula with one ingredient statement.

WITH excluded AS (
  UPDATE public.product_data
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'multi_formula_or_variety_pack',
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  WHERE source = 'pedigree-mars-petcare'
    AND cache_key = 'pedigree-mars-petcare:023100132143'
    AND source_url ~* '^https://(www\.)?pedigree\.com/'
  RETURNING cache_key
)
UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = 'multi_formula_or_variety_pack',
  updated_at = NOW()
FROM excluded
WHERE evidence.cache_key = excluded.cache_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'pedigree-mars-petcare:023100132143'
      AND (
        is_complete_food IS DISTINCT FROM FALSE
        OR catalog_exclusion_reason IS DISTINCT FROM 'multi_formula_or_variety_pack'
        OR ingredient_verification_status <> 'unverified'
      )
  ) THEN
    RAISE EXCEPTION 'Pedigree variety-pack alias must remain excluded';
  END IF;
END;
$$;
