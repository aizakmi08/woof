-- Keep the source-backed ingredient statement as the truth while deriving a
-- complete display/scoring array from balanced label groups.

CREATE OR REPLACE FUNCTION public.catalog_strip_trailing_formula_code(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT btrim(replace(replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(value, '[[:space:]]+', ' ', 'g'),
        '(\.)[[:space:]]+[A-Z][0-9]{6}([,;.]|$)',
        '\1\2',
        'g'
      ),
      '[[:space:]]+[A-Z][0-9]{6}([,;.]|$)',
      '\1',
      'g'
    ),
    '.;',
    ';'
  ), '.,', ','));
$$;

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
    ELSIF token_value ~* '^(trace[[:space:]]+)?(vitamins?|minerals?|amino[[:space:]]+acids?)[[:space:]]*:?[[:space:]]*\('
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

REVOKE ALL ON FUNCTION public.catalog_strip_trailing_formula_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_strip_trailing_formula_code(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_strip_trailing_formula_code(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_strip_trailing_formula_code(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.catalog_split_ingredient_statement(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_split_ingredient_statement(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_split_ingredient_statement(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_split_ingredient_statement(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.is_plausible_product_ingredient(value TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    value IS NOT NULL
    AND length(trim(value)) BETWEEN 2 AND 200
    AND NOT public.catalog_has_unbalanced_square_brackets(trim(value))
    AND trim(value) !~ $re$^[\["']$re$
    AND trim(value) !~ $re$:\s*["']$re$
    AND trim(value) !~ $re$["']\s*:$re$
    AND trim(value) !~ '^\s*[{}]'
    AND trim(value) !~ '[{}]\s*$'
    AND trim(value) !~* $re$\m(mailto:|https?://)$re$
    AND trim(value) !~* $re$\m(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName)$re$
    AND length(regexp_replace(trim(value), '[^A-Za-z]', '', 'g')) >= 2;
$$;

CREATE OR REPLACE FUNCTION public.enforce_product_data_ingredient_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  clean_ingredients TEXT[];
  clean_ingredient_count INT;
  clean_ingredient_text TEXT;
  exact_ingredient_text TEXT;
  nutrient_evidence TEXT;
  has_complete_food_ingredient_evidence BOOLEAN;
  explicit_exclusion_reason TEXT;
BEGIN
  NEW.product_name := COALESCE(public.clean_product_display_text(NEW.product_name), NEW.product_name);
  NEW.brand := public.clean_product_display_text(NEW.brand);
  explicit_exclusion_reason := NULLIF(btrim(COALESCE(NEW.catalog_exclusion_reason, '')), '');
  exact_ingredient_text := NULLIF(
    public.catalog_strip_trailing_formula_code(COALESCE(NEW.ingredient_text, '')),
    ''
  );

  IF NEW.image_url ILIKE 'data:%' THEN
    NEW.image_url := NULL;
  END IF;

  IF explicit_exclusion_reason IS NOT NULL THEN
    NEW.is_complete_food := FALSE;
    NEW.catalog_exclusion_reason := explicit_exclusion_reason;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF public.is_likely_non_product_catalog_row(NEW.product_name, NEW.brand) THEN
    NEW.is_complete_food := FALSE;
    NEW.catalog_exclusion_reason := 'non_complete_food';
    RAISE EXCEPTION 'Invalid product_data non-product payload'
      USING ERRCODE = '22023';
  END IF;

  IF exact_ingredient_text IS NOT NULL THEN
    NEW.ingredients := public.catalog_split_ingredient_statement(exact_ingredient_text);
  END IF;

  clean_ingredients := ARRAY(
    SELECT trim(ingredient.value)
    FROM unnest(COALESCE(NEW.ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
    WHERE public.is_plausible_product_ingredient(ingredient.value)
  );
  clean_ingredient_count := COALESCE(array_length(clean_ingredients, 1), 0);
  clean_ingredient_text := array_to_string(clean_ingredients, ', ');
  nutrient_evidence := concat_ws(' ', NEW.nutrient_panel::TEXT, NEW.nutritional_info::TEXT);

  IF clean_ingredient_count < 5 THEN
    RAISE EXCEPTION 'Invalid product_data ingredient payload'
      USING ERRCODE = '22023';
  END IF;

  has_complete_food_ingredient_evidence :=
    clean_ingredient_count >= 20
    OR COALESCE(exact_ingredient_text, clean_ingredient_text) ~* '\m(taurine|vitamin|zinc|ferrous|iron\s+sulfate|manganese|copper|potassium\s+iodide|calcium\s+iodate|choline\s+chloride|biotin|folic\s+acid|riboflavin|niacin|thiamine|pyridoxine|menadione)\M'
    OR (
      clean_ingredient_count >= 15
      AND nutrient_evidence ~* '\m(aafco|complete|balanced|formulated\s+to\s+meet|maintenance|growth)\M'
    )
    OR (
      clean_ingredient_count BETWEEN 10 AND 19
      AND lower(COALESCE(NEW.source, '')) = 'freshpet'
      AND lower(COALESCE(NEW.brand, '')) = 'freshpet'
      AND NEW.source_quality = 'manufacturer'
      AND NEW.ingredient_verification_status = 'manufacturer'
      AND COALESCE(NEW.source_url, '') ~* '^https://(www\.)?freshpet\.com/products/[A-Za-z0-9-]+/?$'
      AND nutrient_evidence ~* '\mcrude\s+protein\M.*[0-9]'
      AND nutrient_evidence ~* '\mcrude\s+fat\M.*[0-9]'
      AND nutrient_evidence ~* '\mcrude\s+fiber\M.*[0-9]'
      AND nutrient_evidence ~* '\mmoisture\M.*[0-9]'
      AND nutrient_evidence ~* 'formulated\s+to\s+meet.*AAFCO'
    )
    OR (
      clean_ingredient_count BETWEEN 10 AND 19
      AND lower(COALESCE(NEW.source, '')) = 'lotus-pet-foods'
      AND lower(COALESCE(NEW.brand, '')) = 'lotus'
      AND NEW.source_quality = 'manufacturer'
      AND NEW.ingredient_verification_status = 'manufacturer'
      AND (
        (NEW.pet_type = 'cat' AND COALESCE(NEW.source_url, '') ~* '^https://(www\.)?lotuspetfoods\.com/product-view/cat/raw-food/[A-Za-z0-9-]+/?$')
        OR (NEW.pet_type = 'dog' AND COALESCE(NEW.source_url, '') ~* '^https://(www\.)?lotuspetfoods\.com/product-view/dog/raw-food/[A-Za-z0-9-]+/?$')
      )
      AND COALESCE(exact_ingredient_text, clean_ingredient_text) ~* '\m(tricalcium\s+phos\s*phate|vita\s+min\s+e|vi\s+tamin\s+e|vitamin\s+e|manganese amino acid chelate|maganese amino acid chelate|dried egg shell|organic dried dulse)\M'
      AND nutrient_evidence ~* '"(protein|fat|fiber|moisture)"\s*:'
      AND nutrient_evidence ~* '\mtaurine\M'
      AND nutrient_evidence ~* '\mall\s+life\s+stage\M'
    );

  NEW.ingredients := clean_ingredients;
  NEW.ingredient_text := COALESCE(exact_ingredient_text, clean_ingredient_text);
  NEW.ingredient_count := clean_ingredient_count;

  IF NEW.is_complete_food IS FALSE THEN
    NEW.is_complete_food := FALSE;
    NEW.catalog_exclusion_reason := 'not_complete_food';
  ELSE
    NEW.is_complete_food := TRUE;
    NEW.catalog_exclusion_reason := NULL;
  END IF;

  IF (
    NEW.ingredient_verification_status IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )
    OR NEW.source_quality IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified'
    )
  )
  AND NOT has_complete_food_ingredient_evidence THEN
    NEW.ingredient_verification_status := 'unverified';
    NEW.verified_at := NULL;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  parsed_values TEXT[];
BEGIN
  parsed_values := public.catalog_split_ingredient_statement(
    'Chicken, Minerals [Zinc Proteinate, Ferrous Sulfate, Sodium Selenite], Vitamins [Vitamin E Supplement, Vitamin D-3 Supplement], Natural Flavor, Garlic Oil. A445523'
  );

  IF parsed_values <> ARRAY[
    'Chicken',
    'Zinc Proteinate',
    'Ferrous Sulfate',
    'Sodium Selenite',
    'Vitamin E Supplement',
    'Vitamin D-3 Supplement',
    'Natural Flavor',
    'Garlic Oil'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'catalog ingredient group parser fixture failed: %', parsed_values;
  END IF;

  parsed_values := public.catalog_split_ingredient_statement(
    'Chicken, Natural Flavor (from chicken, pork and beef), Salt, Pyridoxine [Vitamin B6], Taurine'
  );

  IF parsed_values <> ARRAY[
    'Chicken',
    'Natural Flavor (from chicken, pork and beef)',
    'Salt',
    'Pyridoxine [Vitamin B6]',
    'Taurine'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'catalog ingredient nesting fixture failed: %', parsed_values;
  END IF;

  parsed_values := public.catalog_split_ingredient_statement(
    'Chicken, Minerals {Zinc Sulfate, Copper Sulfate}, Vitamins {Vitamin E Supplement, Niacin}, Taurine'
  );

  IF parsed_values <> ARRAY[
    'Chicken',
    'Zinc Sulfate',
    'Copper Sulfate',
    'Vitamin E Supplement',
    'Niacin',
    'Taurine'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'catalog ingredient curly-group fixture failed: %', parsed_values;
  END IF;

  IF NOT public.is_plausible_product_ingredient('Pyridoxine [Vitamin B6]') THEN
    RAISE EXCEPTION 'balanced square-bracket ingredient must remain valid';
  END IF;

  IF public.is_plausible_product_ingredient('Pyridoxine [Vitamin B6') THEN
    RAISE EXCEPTION 'unbalanced square-bracket ingredient must remain invalid';
  END IF;
END;
$$;

WITH affected AS (
  SELECT
    id,
    public.catalog_strip_trailing_formula_code(ingredient_text) AS exact_ingredient_text
  FROM public.product_data
  WHERE ingredient_text IS NOT NULL
    AND NOT public.is_likely_non_product_catalog_row(product_name, brand)
    AND ingredient_text ~ '[[:space:]]+[A-Z][0-9]{6}[[:space:]]*$'
),
reparsed AS (
  SELECT
    id,
    exact_ingredient_text,
    public.catalog_split_ingredient_statement(exact_ingredient_text) AS ingredients
  FROM affected
)
UPDATE public.product_data product
SET
  ingredient_text = reparsed.exact_ingredient_text,
  ingredients = reparsed.ingredients,
  ingredient_count = COALESCE(array_length(reparsed.ingredients, 1), 0),
  updated_at = NOW()
FROM reparsed
WHERE product.id = reparsed.id;

DO $$
DECLARE
  target_row public.product_data%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'petsmart-retail-catalog:038100130594'
  ) THEN
    SELECT * INTO target_row
    FROM public.product_data
    WHERE cache_key = 'petsmart-retail-catalog:038100130594';

    IF target_row.ingredient_text ~ '[A-Z][0-9]{6}[[:space:]]*$' THEN
      RAISE EXCEPTION 'PetSmart formula code remains in source ingredient statement';
    END IF;

    IF NOT ARRAY['Zinc Proteinate', 'Sodium Selenite', 'Vitamin E Supplement']::TEXT[] <@ target_row.ingredients THEN
      RAISE EXCEPTION 'PetSmart grouped ingredient members are incomplete: %', target_row.ingredients;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM unnest(target_row.ingredients) AS ingredient(value)
      WHERE value ~* '^Vitamin D.{0,1}3 Supplement$'
    ) THEN
      RAISE EXCEPTION 'PetSmart vitamin D ingredient is missing: %', target_row.ingredients;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE ingredient_text ~ '[[:space:]]+[A-Z][0-9]{6}[[:space:]]*$'
      AND NOT public.is_likely_non_product_catalog_row(product_name, brand)
  ) THEN
    RAISE EXCEPTION 'catalog formula codes remain on product rows after ingredient normalization';
  END IF;
END;
$$;
