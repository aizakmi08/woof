-- "Main Ingredients:" source text is a partial marketing summary, not a
-- complete package ingredient statement. Keep the evidence row, but remove it
-- from ready catalog search/scoring until a full verified statement exists.

UPDATE public.product_data
SET
  ingredient_verification_status = 'unverified',
  catalog_exclusion_reason = 'incomplete_ingredient_statement',
  verified_at = NULL,
  updated_at = NOW()
WHERE catalog_exclusion_reason IS NULL
  AND coalesce(ingredient_text, array_to_string(ingredients, ', ')) ~* '^[[:space:]]*main[[:space:]]+ingredients[[:space:]]*:';
