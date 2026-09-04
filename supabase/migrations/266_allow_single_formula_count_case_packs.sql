-- Count/case packs are valid catalog products when they clearly identify one
-- complete formula. Keep variety, mixed, sampler, bundle, and multipack rows
-- rejected because one exact ingredient statement cannot safely represent them.

CREATE OR REPLACE FUNCTION public.is_likely_non_product_catalog_row(
  p_product_name TEXT,
  p_brand TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
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
    product_name ~ '(^| )(chicken|beef|steak|turkey|salmon|lamb|duck|tuna|whitefish|venison|pork|rabbit|cod|trout|bison|crab|prawns?|shrimp|mackerel|sardines?|seabass|tilapia|quail|liver|egg|eggs)( |$)' AS has_named_protein,
    (
      product_name ~ '(^| )(chicken|beef|steak|turkey|salmon|lamb|duck|tuna|whitefish|venison|pork|rabbit|cod|trout|bison|crab|prawns?|shrimp|mackerel|sardines?|seabass|tilapia|quail|liver|egg|eggs)( |$)'
      AND product_name ~ '(^| )(minced|morsels?|shreds?|chunks?|cuts?|filets?|flakes?|stews?|loaf|pate|pat.?|in ([a-z0-9]+ )*broths?|broth gravy|in gravy|in sauce)( |$)'
    ) AS named_wet_formula
  FROM normalized
),
food_signals AS (
  SELECT
    product_name,
    brand,
    has_named_protein,
    named_wet_formula,
    (
      product_name ~ '(^| )(food|foods|dry|wet|kibble|pate|pat.?|entrees?|stews?|loaf|canned|cans?|formula|recipe|meal|dinner|raw|fresh|freezedried|freeze dried|airdried|air dried|dehydrated|pupp(y|ies)|kitten|kittens|adult|senior|complete|balanced)( |$)'
      OR product_name ~ '(^| )all life stages( |$)'
      OR named_wet_formula
    ) AS core_food_signal,
    (
      has_named_protein
      AND product_name ~ '(^| )in ([a-z0-9]+ )*broths?( |$)'
    ) AS named_broth_formula
  FROM signals
),
formula_pack_signals AS (
  SELECT
    product_name,
    brand,
    core_food_signal,
    named_broth_formula,
    named_wet_formula,
    product_name ~ '(^| )(treats?|treaties?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|topping|mixers?|kibble sauces?|purees?|supplements?|catnip|litter|lickables?|delectables|rawhide|bully sticks?|pizzle|pill pockets?|munchy|dumbbells?|party mix)( |$)' AS generic_non_product,
    product_name ~ '(^| )(variety|varieties|variety packs?|bundles?|samplers?|sample packs?|starter packs?|starter kits?|multipacks?|multi packs?)( |$)' AS non_single_formula,
    (
      product_name ~ '(^| )[0-9]+[ ]*(ct|count)( |$)'
      AND core_food_signal
      AND product_name !~ '(^| )(variety|varieties|variety packs?|bundles?|samplers?|sample packs?|starter packs?|starter kits?|multipacks?|multi packs?)( |$)'
      AND product_name ~ '(^| )(care|nutrition|mousse|sauce|wet|dry|adult|kitten|puppy|senior|formula|recipe|diet|food|foods)( |$)'
    ) AS single_formula_count_case,
    (
      product_name ~ '(^| )(review|reviews|ratings?|launches|petsplusmag com|ingredient finder|finder|cookbook|book|bible|guide|feeding calculator|quiz|where to buy|store locator|recalls?)( |$)'
      AND (
        product_name ~ '(^| )(food|foods|diet|diets|ingredient|ingredients|recipe|recipes|nutrition|nutritional|feeding|pet|dog|cat)( |$)'
        OR product_name ~ '(^| )petsplusmag com( |$)'
        OR brand ~ '(^| )(dog diets|homemade dog|the authentic)( |$)'
      )
    ) AS editorial_or_tool,
    (
      (
        product_name ~ '(^| )(bone broth|broth toppers?|broth topping|broth mixers?|broth supplements?)( |$)'
        AND NOT core_food_signal
        AND NOT named_broth_formula
      )
      OR (
        product_name ~ '(^| )broths?( |$)'
        AND NOT core_food_signal
        AND NOT named_broth_formula
      )
    ) AS broth_non_product
  FROM food_signals
),
flags AS (
  SELECT
    *,
    (
      product_name ~ '(^| )[0-9]+[ ]*(ct|count)( |$)'
      AND product_name !~ '(^| )(chicken|beef|steak|turkey|salmon|lamb|duck|tuna|whitefish|venison|pork|rabbit|cod|trout|bison|filet|mignon|prime rib|bacon|cheese|rice|vegetable|veggie|noodle)( |$)'
      AND NOT single_formula_count_case
    ) AS ambiguous_count_pack
  FROM formula_pack_signals
)
SELECT
  product_name ~ '^ingredients? (amp |and )?nutritional value$'
  OR product_name ~ '^ingredients? guide( ingredients? guide)?( |$)'
  OR product_name ~ '(^| )(dog|cat|pet) (food|treat) trends?( |$)'
  OR (
    product_name ~ '(^| )trends?( |$)'
    AND product_name ~ '(^| )the rise of( |$)'
  )
  OR editorial_or_tool
  OR generic_non_product
  OR non_single_formula
  OR ambiguous_count_pack
  OR product_name ~ '(^| )blue bits( |$)'
  OR product_name ~ '(^| )k9 mobility ultra( |$)'
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
      OR editorial_or_tool
      OR generic_non_product
      OR non_single_formula
      OR ambiguous_count_pack
      OR broth_non_product
      OR product_name ~ '(dog|cat)treats?'
    )
  )
FROM flags;
$$;

DO $$
BEGIN
  IF public.is_likely_non_product_catalog_row('Royal Canin Feline Care Nutrition Digestive Care Adult Cat Wet Food, 12-ct', 'Royal Canin') THEN
    RAISE EXCEPTION 'single-formula digestive care case should not be rejected';
  END IF;

  IF public.is_likely_non_product_catalog_row('Royal Canin Feline Health Nutrition Mother & Babycat Mousse in Sauce Wet Cat Food - 3 oz 12-count', 'Royal Canin') THEN
    RAISE EXCEPTION 'single-formula mother and babycat case should not be rejected';
  END IF;

  IF public.is_likely_non_product_catalog_row('Royal Canin Feline Care Nutrition Urinary Care Adult Cat Wet Food, 12-ct', 'Royal Canin') THEN
    RAISE EXCEPTION 'single-formula urinary care case should not be rejected';
  END IF;

  IF NOT public.is_likely_non_product_catalog_row('Seafood Variety Pack 24 ct.', 'Example Brand') THEN
    RAISE EXCEPTION 'variety packs must still be rejected';
  END IF;

  IF NOT public.is_likely_non_product_catalog_row('Puppy Essentials Starter Pack', 'Jinx') THEN
    RAISE EXCEPTION 'starter packs must still be rejected';
  END IF;

  IF public.is_likely_non_product_catalog_row('Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice Recipe Dry Dog Food', 'Blue Buffalo') THEN
    RAISE EXCEPTION 'valid dry dog food formula should not be rejected';
  END IF;
END $$;
