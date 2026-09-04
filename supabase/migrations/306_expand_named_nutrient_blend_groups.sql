-- Named manufacturer nutrient blends are balanced ingredient groups, not one
-- overlong ingredient. Expand their contents so the exact source statement and
-- derived ingredient array remain deterministic.

CREATE OR REPLACE FUNCTION public.catalog_split_ingredient_statement(value TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  source_value TEXT := public.catalog_strip_trailing_formula_code(value);
  tokens TEXT[] := ARRAY[]::TEXT[];
  output_values TEXT[] := ARRAY[]::TEXT[];
  seen_keys TEXT[] := ARRAY[]::TEXT[];
  current_value TEXT := '';
  character_value TEXT;
  token_value TEXT;
  ingredient_value TEXT;
  ingredient_key TEXT;
  group_contents TEXT;
  nested_value TEXT;
  parentheses_depth INTEGER := 0;
  square_depth INTEGER := 0;
  curly_depth INTEGER := 0;
  index_value INTEGER;
BEGIN
  IF source_value = '' THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  FOR index_value IN 1..char_length(source_value) LOOP
    character_value := substr(source_value, index_value, 1);

    IF character_value = '(' THEN
      parentheses_depth := parentheses_depth + 1;
    ELSIF character_value = ')' THEN
      parentheses_depth := greatest(0, parentheses_depth - 1);
    ELSIF character_value = '[' THEN
      square_depth := square_depth + 1;
    ELSIF character_value = ']' THEN
      square_depth := greatest(0, square_depth - 1);
    ELSIF character_value = '{' THEN
      curly_depth := curly_depth + 1;
    ELSIF character_value = '}' THEN
      curly_depth := greatest(0, curly_depth - 1);
    END IF;

    IF character_value IN (',', ';', E'\n', E'\r')
      AND parentheses_depth = 0
      AND square_depth = 0
      AND curly_depth = 0
    THEN
      IF btrim(current_value) <> '' THEN
        tokens := array_append(tokens, btrim(current_value));
      END IF;
      current_value := '';
    ELSE
      current_value := current_value || character_value;
    END IF;
  END LOOP;

  IF btrim(current_value) <> '' THEN
    tokens := array_append(tokens, btrim(current_value));
  END IF;

  FOREACH token_value IN ARRAY tokens LOOP
    token_value := btrim(regexp_replace(token_value, '[[:space:]]+', ' ', 'g'));
    group_contents := NULL;

    IF token_value ~* '^(trace[[:space:]]+)?(vitamins?|minerals?|amino[[:space:]]+acids?)[[:space:]]*:?[[:space:]]*\['
      AND token_value ~ '\]\.?$'
      AND NOT public.catalog_has_unbalanced_square_brackets(token_value)
    THEN
      group_contents := substring(token_value FROM '\[(.*)\]\.?$');
    ELSIF token_value ~* '^((trace[[:space:]]+)?(vitamins?|minerals?|amino[[:space:]]+acids?)|justfoodfordogs[[:space:]]+nutrient[[:space:]]+blend)[[:space:]]*:?[[:space:]]*\('
      AND token_value ~ '\)\.?$'
      AND NOT public.catalog_has_unbalanced_parentheses(token_value)
    THEN
      group_contents := substring(token_value FROM '\((.*)\)\.?$');
    ELSIF token_value ~* '^(trace[[:space:]]+)?(vitamins?|minerals?|amino[[:space:]]+acids?)[[:space:]]*:?[[:space:]]*\{'
      AND token_value ~ '\}\.?$'
      AND length(token_value) - length(replace(token_value, '{', ''))
        = length(token_value) - length(replace(token_value, '}', ''))
    THEN
      group_contents := substring(token_value FROM '\{(.*)\}\.?$');
    END IF;

    IF group_contents IS NOT NULL THEN
      FOREACH nested_value IN ARRAY public.catalog_split_ingredient_statement(group_contents) LOOP
        ingredient_key := lower(nested_value);
        IF array_position(seen_keys, ingredient_key) IS NULL THEN
          output_values := array_append(output_values, nested_value);
          seen_keys := array_append(seen_keys, ingredient_key);
        END IF;
      END LOOP;
      CONTINUE;
    END IF;

    ingredient_value := btrim(regexp_replace(token_value, '\.$', ''));
    ingredient_key := lower(ingredient_value);
    IF ingredient_value <> '' AND array_position(seen_keys, ingredient_key) IS NULL THEN
      output_values := array_append(output_values, ingredient_value);
      seen_keys := array_append(seen_keys, ingredient_key);
    END IF;
  END LOOP;

  RETURN output_values;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_split_ingredient_statement(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_split_ingredient_statement(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_split_ingredient_statement(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_split_ingredient_statement(TEXT) TO service_role;

DO $$
DECLARE
  parsed_values TEXT[];
BEGIN
  parsed_values := public.catalog_split_ingredient_statement(
    'Chicken, Rice, JustFoodForDogs Nutrient Blend (Dicalcium Phosphate, Potassium Chloride, Calcium Carbonate)'
  );
  IF parsed_values IS DISTINCT FROM ARRAY[
    'Chicken',
    'Rice',
    'Dicalcium Phosphate',
    'Potassium Chloride',
    'Calcium Carbonate'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'named nutrient blend must expand into exact nested ingredients';
  END IF;
END;
$$;

WITH reparsed AS (
  SELECT
    id,
    public.catalog_split_ingredient_statement(ingredient_text) AS parsed_ingredients
  FROM public.product_data
  WHERE source = 'justfoodfordogs'
    AND ingredient_text ~* '\mJustFoodForDogs[[:space:]]+Nutrient[[:space:]]+Blend[[:space:]]*\('
),
updated AS (
  UPDATE public.product_data product
  SET
    ingredients = reparsed.parsed_ingredients,
    ingredient_count = cardinality(reparsed.parsed_ingredients),
    updated_at = NOW()
  FROM reparsed
  WHERE product.id = reparsed.id
  RETURNING product.cache_key
),
latest_evidence AS (
  SELECT DISTINCT ON (evidence.cache_key)
    evidence.cache_key,
    evidence.ingredient_verification_status
  FROM public.catalog_product_evidence evidence
  JOIN updated ON updated.cache_key = evidence.cache_key
  WHERE evidence.source = 'justfoodfordogs'
    AND evidence.source_quality IN ('manufacturer', 'official')
    AND evidence.ingredient_verification_status IN ('manufacturer', 'official')
    AND evidence.image_verification_status IN ('manufacturer', 'official')
    AND evidence.rejection_reason IS NULL
  ORDER BY evidence.cache_key, evidence.updated_at DESC
),
promoted AS (
  UPDATE public.product_data product
  SET
    ingredient_verification_status = latest_evidence.ingredient_verification_status,
    verified_at = NOW(),
    updated_at = NOW()
  FROM latest_evidence
  WHERE product.cache_key = latest_evidence.cache_key
    AND product.source = 'justfoodfordogs'
    AND product.source_quality IN ('manufacturer', 'official')
    AND product.image_verification_status IN ('manufacturer', 'official')
    AND product.is_complete_food IS TRUE
    AND product.catalog_exclusion_reason IS NULL
    AND product.source_url ~* '^https://(www\.)?justfoodfordogs\.com/'
    AND product.image_url IS NOT NULL
    AND product.image_url !~* '^data:'
    AND product.ingredient_count >= 5
    AND NOT public.catalog_has_ingredient_ocr_artifacts(product.ingredient_text)
    AND product.ingredients IS NOT DISTINCT FROM public.catalog_split_ingredient_statement(product.ingredient_text)
  RETURNING product.cache_key
)
UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'promoted',
  rejection_reason = NULL,
  updated_at = NOW()
FROM promoted
WHERE evidence.cache_key = promoted.cache_key
  AND evidence.source = 'justfoodfordogs';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE source = 'justfoodfordogs'
      AND ingredient_verification_status IN ('manufacturer', 'official')
      AND ingredients IS DISTINCT FROM public.catalog_split_ingredient_statement(ingredient_text)
  ) THEN
    RAISE EXCEPTION 'verified JustFoodForDogs rows must match their exact ingredient statements';
  END IF;
END;
$$;
