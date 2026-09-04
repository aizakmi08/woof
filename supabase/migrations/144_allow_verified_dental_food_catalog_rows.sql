-- Dental treats and chews are still excluded by the generic treat/chew/stick
-- terms, but "dental" alone is not enough to reject a source-backed complete
-- food. Royal Canin veterinary Dental diets use names like "Feline Dental"
-- while the ingredient/nutrient evidence identifies them as complete dry food.
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
    product_name ~ '(^| )(variety|varieties|variety packs?|bundles?|samplers?|sample packs?|starter kits?|multipacks?|multi packs?)( |$)' AS non_single_formula,
    (
      product_name ~ '(^| )[0-9]+[ ]*(ct|count)( |$)'
      AND product_name !~ '(^| )(chicken|beef|steak|turkey|salmon|lamb|duck|tuna|whitefish|venison|pork|rabbit|cod|trout|bison|filet|mignon|prime rib|bacon|cheese|rice|vegetable|veggie|noodle)( |$)'
    ) AS ambiguous_count_pack,
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
  OR non_single_formula
  OR ambiguous_count_pack
  OR product_name ~ '(^| )blue bits( |$)'
  OR product_name IN (
    'blue buffalo wilderness',
    'blue buffalo organics',
    'blue buffalo longevity',
    'blue buffalo earths essentials'
  )
  OR broth_non_product
  OR product_name ~ '(^| )(nutri cal|nutrical|nutritional gel|high calorie gel|highcalorie gel)( |$)'
  OR product_name ~ '(dog|cat)treats?'
  OR (
    product_name ~ '(^| )(training|sausage|sausages)( |$)'
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
      OR non_single_formula
      OR ambiguous_count_pack
      OR broth_non_product
      OR product_name ~ '(dog|cat)treats?'
    )
  )
FROM flags;
$$;
