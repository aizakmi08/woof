-- Keep the database non-product guard aligned with valid wet-food label
-- wording. PostgreSQL normalization preserves accented "paté", and some
-- source titles use plural species/life-stage terms such as "kittens".

CREATE OR REPLACE FUNCTION public.is_likely_non_product_catalog_row(
  p_product_name TEXT,
  p_brand TEXT DEFAULT NULL::TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    public.normalize_product_catalog_name(p_product_name) AS product_name,
    public.normalize_product_catalog_name(p_brand) AS brand
),
signals AS (
  SELECT
    product_name,
    brand,
    (
      product_name ~ '(^| )(food|foods|dry|wet|kibble|pate|paté|pat|entrees?|stews?|loaf|canned|cans?|formula|recipe|meal|dinner|raw|fresh|freezedried|freeze dried|airdried|air dried|dehydrated|pupp(y|ies)|kitten|kittens|adult|senior|complete|balanced)( |$)'
      OR product_name ~ '(^| )all life stages( |$)'
    ) AS core_food_signal
  FROM normalized
),
flags AS (
  SELECT
    product_name,
    brand,
    core_food_signal,
    product_name ~ '(^| )(treats?|treaties?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|topping|mixers?|purees?|supplements?|catnip|litter|lickables?|delectables|rawhide|bully sticks?|pizzle|pill pockets?|munchy|dumbbells?)( |$)' AS generic_non_product,
    (
      product_name ~ '(^| )(bone broth|broth toppers?|broth topping|broth mixers?|broth supplements?)( |$)'
      OR (
        product_name ~ '(^| )broths?( |$)'
        AND NOT core_food_signal
      )
    ) AS broth_non_product
  FROM signals
)
SELECT
  product_name ~ '^ingredients? (amp |and )?nutritional value$'
  OR product_name ~ '^ingredients? guide( ingredients? guide)?( |$)'
  OR product_name ~ '(^| )(dog|cat|pet) (food|treat) trends?( |$)'
  OR (
    product_name ~ '(^| )trends?( |$)'
    AND product_name ~ '(^| )the rise of( |$)'
  )
  OR generic_non_product
  OR broth_non_product
  OR product_name ~ '(^| )(nutri cal|nutrical|nutritional gel|high calorie gel|highcalorie gel)( |$)'
  OR product_name ~ '(dog|cat)treats?'
  OR (
    product_name ~ '(^| )(dental|training|sausage|sausages)( |$)'
    AND NOT core_food_signal
  )
  OR (
    brand ~ '(^| )(treats?|chews?|snacks?|rawhide)( |$)'
    AND NOT core_food_signal
  )
  OR (
    product_name ~ '(^| )samples?( |$)'
    AND product_name ~ '(^| )(pack|variety|bundle)( |$)'
  )
  OR (
    brand <> ''
    AND (
      product_name = brand
      OR product_name = brand || ' ' || brand
    )
  )
  OR (
    brand IN ('ingredients guide', 'dog treat')
    AND (
      product_name ~ '^ingredients? guide( ingredients? guide)?( |$)'
      OR product_name ~ '(^| )(dog|cat|pet) (food|treat) trends?( |$)'
      OR generic_non_product
      OR broth_non_product
      OR product_name ~ '(dog|cat)treats?'
    )
  )
FROM flags;
$$;
