-- Acquisition queue rows for reviews, books, ingredient-finder tools, and
-- treat lines are not missing complete-food products. Exclude them so source
-- acquisition remains focused on exact dog/cat food formulas.

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
      AND product_name ~ '(^| )(minced|morsels?|shreds?|chunks?|cuts?|filets?|flakes?|stews?|loaf|pate|paté|pat|in ([a-z0-9]+ )*broths?|broth gravy|in gravy|in sauce)( |$)'
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
      product_name ~ '(^| )(food|foods|dry|wet|kibble|pate|paté|pat|entrees?|stews?|loaf|canned|cans?|formula|recipe|meal|dinner|raw|fresh|freezedried|freeze dried|airdried|air dried|dehydrated|pupp(y|ies)|kitten|kittens|adult|senior|complete|balanced)( |$)'
      OR product_name ~ '(^| )all life stages( |$)'
      OR named_wet_formula
    ) AS core_food_signal,
    (
      has_named_protein
      AND product_name ~ '(^| )in ([a-z0-9]+ )*broths?( |$)'
    ) AS named_broth_formula
  FROM signals
),
flags AS (
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
      AND product_name !~ '(^| )(chicken|beef|steak|turkey|salmon|lamb|duck|tuna|whitefish|venison|pork|rabbit|cod|trout|bison|filet|mignon|prime rib|bacon|cheese|rice|vegetable|veggie|noodle)( |$)'
    ) AS ambiguous_count_pack,
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

WITH rejected AS (
  UPDATE public.product_data
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason = COALESCE(NULLIF(catalog_exclusion_reason, ''), 'not_product_or_not_complete_food'),
    updated_at = now()
  WHERE catalog_exclusion_reason IS NULL
    AND public.is_likely_non_product_catalog_row(product_name, brand)
    AND (
      public.normalize_product_catalog_name(product_name) ~ '(^| )(review|reviews|ratings?|launches|petsplusmag com|ingredient finder|finder|cookbook|book|bible|guide|feeding calculator|quiz|where to buy|store locator|recalls?)( |$)'
      OR public.normalize_product_catalog_name(product_name) ~ '(^| )party mix( |$)'
    )
  RETURNING cache_key
)
UPDATE public.catalog_product_evidence e
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(NULLIF(e.rejection_reason, ''), 'not_product_or_not_complete_food'),
  evidence = COALESCE(e.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'rejected_after_backfill', true,
      'rejection_reason', 'not_product_or_not_complete_food'
    ),
  updated_at = now()
FROM rejected
WHERE e.cache_key = rejected.cache_key;

SELECT public.close_stale_catalog_acquisition_queue_gaps(now()) AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;

DO $$
DECLARE
  remaining_false_gaps INTEGER;
BEGIN
  IF NOT public.is_likely_non_product_catalog_row('Blue Buffalo Life Protection Dog Food Review (Dry)', 'Blue Buffalo') THEN
    RAISE EXCEPTION 'dog food review rows should be rejected';
  END IF;

  IF NOT public.is_likely_non_product_catalog_row('Taste of the Wild Ingredient Finder', 'Taste of the Wild') THEN
    RAISE EXCEPTION 'ingredient finder rows should be rejected';
  END IF;

  IF NOT public.is_likely_non_product_catalog_row('The Honest Kitchen Launches Essential Clusters - PETSPLUSMAG.COM', 'The Honest Kitchen') THEN
    RAISE EXCEPTION 'editorial launch rows should be rejected';
  END IF;

  IF NOT public.is_likely_non_product_catalog_row('Purina Friskies Party Mix Beachside Crunch', 'Friskies') THEN
    RAISE EXCEPTION 'Friskies Party Mix treat rows should be rejected';
  END IF;

  IF public.is_likely_non_product_catalog_row('Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice Recipe Dry Dog Food', 'Blue Buffalo') THEN
    RAISE EXCEPTION 'valid dry dog food formula should not be rejected';
  END IF;

  IF public.is_likely_non_product_catalog_row('The Honest Kitchen Whole Food Clusters Chicken & Oat Recipe', 'The Honest Kitchen') THEN
    RAISE EXCEPTION 'valid Honest Kitchen formula should not be rejected';
  END IF;

  SELECT count(*)::INTEGER
  INTO remaining_false_gaps
  FROM public.catalog_acquisition_queue
  WHERE status = 'open'
    AND gap_type = 'product'
    AND product_name IS NOT NULL
    AND public.is_likely_non_product_catalog_row(product_name, brand)
    AND (
      public.normalize_product_catalog_name(product_name) ~ '(^| )(review|reviews|ratings?|launches|petsplusmag com|ingredient finder|finder|cookbook|book|bible|guide|feeding calculator|quiz|where to buy|store locator|recalls?)( |$)'
      OR public.normalize_product_catalog_name(product_name) ~ '(^| )party mix( |$)'
    );

  IF remaining_false_gaps <> 0 THEN
    RAISE EXCEPTION 'editorial/tool/treat acquisition gaps remain open: %', remaining_false_gaps;
  END IF;
END $$;
