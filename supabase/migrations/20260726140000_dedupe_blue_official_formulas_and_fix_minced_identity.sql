-- Collapse only exact Blue Buffalo official-PDP duplicates and repair the
-- Minced Chicken & Turkey package identity/image. Similar names, shared
-- flavors, and parent-manufacturer relationships are deliberately insufficient.

CREATE TEMP TABLE blue_exact_formula_merges (
  keep_id bigint PRIMARY KEY,
  drop_id bigint UNIQUE NOT NULL
) ON COMMIT DROP;

INSERT INTO blue_exact_formula_merges (keep_id, drop_id)
SELECT
  general_mills.id,
  legacy_blue.id
FROM public.catalog_formulas AS legacy_blue
JOIN public.catalog_formulas AS general_mills
  ON general_mills.source_url = legacy_blue.source_url
WHERE lower(legacy_blue.brand) = 'blue buffalo'
  AND split_part(legacy_blue.formula_key, '|', 1) = 'blue buffalo'
  AND legacy_blue.active
  AND legacy_blue.verification_status = 'verified'
  AND lower(general_mills.brand) = 'blue buffalo'
  AND split_part(general_mills.formula_key, '|', 1) = 'general mills'
  AND general_mills.active
  AND general_mills.verification_status = 'verified'
  AND legacy_blue.product_name = general_mills.product_name
  AND legacy_blue.ingredient_text = general_mills.ingredient_text
  AND legacy_blue.ingredients = general_mills.ingredients
  AND lower(legacy_blue.pet_type) = lower(general_mills.pet_type)
  AND (
    lower(legacy_blue.food_form) = lower(general_mills.food_form)
    OR lower(legacy_blue.food_form) = 'unknown'
    OR lower(general_mills.food_form) = 'unknown'
  )
  AND legacy_blue.front_image_url = general_mills.front_image_url;

-- These two current official pages live under /fresh-dog-food/. The older
-- canonical formulas correctly preserve fresh as the form; the later
-- duplicates contain the same name, ingredients, image, species, and PDP but
-- were incorrectly classified as wet.
INSERT INTO blue_exact_formula_merges (keep_id, drop_id)
SELECT current_fresh.id, incorrect_wet.id
FROM public.catalog_formulas AS current_fresh
JOIN public.catalog_formulas AS incorrect_wet
  ON incorrect_wet.source_url = current_fresh.source_url
WHERE current_fresh.id IN (31691, 31692)
  AND incorrect_wet.id IN (33086, 33088)
  AND current_fresh.product_name = incorrect_wet.product_name
  AND current_fresh.ingredient_text = incorrect_wet.ingredient_text
  AND current_fresh.ingredients = incorrect_wet.ingredients
  AND current_fresh.front_image_url = incorrect_wet.front_image_url
  AND current_fresh.pet_type = incorrect_wet.pet_type
  AND current_fresh.life_stage = incorrect_wet.life_stage
  AND current_fresh.food_form = 'fresh'
  AND incorrect_wet.food_form = 'wet';

DO $$
BEGIN
  IF (SELECT count(*) FROM blue_exact_formula_merges) <> 263 THEN
    RAISE EXCEPTION
      'Blue Buffalo exact duplicate preflight changed: expected 263 merge pairs, found %',
      (SELECT count(*) FROM blue_exact_formula_merges);
  END IF;
END
$$;

-- Copy field evidence before moving/deactivating the duplicate formula.
INSERT INTO public.catalog_field_evidence (
  formula_id,
  observation_id,
  field_name,
  field_value,
  source_url,
  source_authority,
  accepted,
  observed_at,
  content_hash,
  created_at
)
SELECT
  merge.keep_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash,
  evidence.created_at
FROM public.catalog_field_evidence AS evidence
JOIN blue_exact_formula_merges AS merge
  ON merge.drop_id = evidence.formula_id
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR excluded.accepted,
  observed_at = greatest(public.catalog_field_evidence.observed_at, excluded.observed_at);

DELETE FROM public.catalog_field_evidence AS evidence
USING blue_exact_formula_merges AS merge
WHERE evidence.formula_id = merge.drop_id;

UPDATE public.catalog_observations AS observation
SET formula_id = merge.keep_id
FROM blue_exact_formula_merges AS merge
WHERE observation.formula_id = merge.drop_id;

UPDATE public.catalog_skus AS sku
SET
  formula_id = merge.keep_id,
  updated_at = now()
FROM blue_exact_formula_merges AS merge
WHERE sku.formula_id = merge.drop_id;

UPDATE public.catalog_manual_evidence_reviews AS review
SET
  formula_id = merge.keep_id,
  updated_at = now()
FROM blue_exact_formula_merges AS merge
WHERE review.formula_id = merge.drop_id;

UPDATE public.catalog_formulas AS duplicate
SET
  active = false,
  verification_status = 'quarantined',
  absent_since = now(),
  promoted_cache_key = NULL,
  updated_at = now()
FROM blue_exact_formula_merges AS merge
WHERE duplicate.id = merge.drop_id;

DO $$
DECLARE
  v_formula_id bigint;
  v_cache_key text :=
    'blue-buffalo-general-mills:blue buffalo blue wildernesswild delights wet cat food - chicken turkey wilderness minced-chicken-turkey';
  v_source_url text :=
    'https://www.bluebuffalo.com/wet-cat-food/wilderness/minced-chicken-turkey/';
  v_front_image text :=
    'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/wilderness/large-product-image/wilddelights_cat_wet_adult_minced_chickenturkey.png';
  v_formula_key text :=
    'blue buffalo|blue buffalo|blue wilderness wild delights wet cat food minced chicken and turkey|cat|unknown|wet|chicken and turkey|';
  v_search_cache_key text;
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE source_url = v_source_url
    AND active
    AND verification_status = 'verified';

  IF (
    SELECT cardinality(ingredients)
    FROM public.catalog_formulas
    WHERE id = v_formula_id
  ) <> 33 THEN
    RAISE EXCEPTION 'Blue Minced Chicken & Turkey expected 33 official ingredients';
  END IF;

  IF (
    SELECT ingredients[1:5]
    FROM public.catalog_formulas
    WHERE id = v_formula_id
  ) IS DISTINCT FROM ARRAY[
    'Chicken',
    'Chicken Broth',
    'Water',
    'Turkey',
    'Chicken Liver'
  ]::text[] THEN
    RAISE EXCEPTION 'Blue Minced Chicken & Turkey leading ingredients changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key = v_formula_key
      AND id <> v_formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Minced Chicken & Turkey corrected identity already belongs to another formula';
  END IF;

  UPDATE public.product_data
  SET
    product_name = 'BLUE Wilderness Wild Delights Wet Cat Food - Minced Chicken & Turkey',
    product_line = 'BLUE Wilderness Wild Delights Wet - Minced',
    flavor = 'Chicken & Turkey',
    pet_type = 'cat',
    food_form = 'wet',
    image_url = v_front_image,
    source = 'blue-buffalo-general-mills',
    source_url = v_source_url,
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    updated_at = now()
  WHERE cache_key = v_cache_key
    AND source_url = v_source_url;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blue Minced Chicken & Turkey serving row is missing';
  END IF;

  UPDATE public.catalog_formulas
  SET
    formula_key = v_formula_key,
    manufacturer = 'Blue Buffalo',
    product_name = 'BLUE Wilderness Wild Delights Wet Cat Food - Minced Chicken & Turkey',
    product_line = 'blue wilderness wild delights wet minced',
    flavor = 'chicken and turkey',
    front_image_url = v_front_image,
    source_url = v_source_url,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'blue buffalo',
      'blue wilderness',
      'wild delights',
      'minced',
      'chicken',
      'turkey',
      'cat',
      'wet'
    ]::text[],
    promoted_cache_key = v_cache_key,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  WHERE id = v_formula_id;

  INSERT INTO public.catalog_field_evidence (
    formula_id,
    observation_id,
    field_name,
    field_value,
    source_url,
    source_authority,
    accepted,
    observed_at,
    content_hash
  ) VALUES (
    v_formula_id,
    NULL,
    'front_image_url',
    to_jsonb(v_front_image),
    v_source_url,
    'manufacturer',
    true,
    now(),
    encode(digest(v_front_image, 'sha256'), 'hex')
  )
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE SET
    accepted = true,
    observed_at = excluded.observed_at;

  UPDATE public.catalog_field_evidence
  SET accepted = false
  WHERE formula_id = v_formula_id
    AND field_name = 'front_image_url'
    AND source_url = v_source_url
    AND field_value <> to_jsonb(v_front_image);

  UPDATE public.catalog_manual_evidence_reviews
  SET
    corrected_formula_key = v_formula_key,
    evidence_status = 'promoted',
    quarantine_reason = NULL,
    authoritative_source_type = 'manufacturer_page',
    resolved_identity = jsonb_build_object(
      'brand', 'Blue Buffalo',
      'product_line', 'BLUE Wilderness Wild Delights Wet - Minced',
      'pet_type', 'cat',
      'life_stage', 'unknown',
      'food_form', 'wet',
      'texture', 'minced',
      'flavor', 'Chicken & Turkey'
    ),
    authoritative_content_hash = encode(
      digest(v_source_url || '|' || v_front_image || '|' || (
        SELECT ingredient_text FROM public.catalog_formulas WHERE id = v_formula_id
      ), 'sha256'),
      'hex'
    ),
    ingredient_text_hash = encode(digest((
      SELECT ingredient_text FROM public.catalog_formulas WHERE id = v_formula_id
    ), 'sha256'), 'hex'),
    front_image_url_hash = encode(digest(v_front_image, 'sha256'), 'hex'),
    observed_at = now(),
    formula_id = v_formula_id,
    promoted_cache_key = v_cache_key,
    attempt_count = attempt_count + 1,
    review_notes =
      'Resolved from the current official product-local hero package image. '
      'The stale social image was a trout sibling and is no longer accepted.',
    updated_at = now()
  WHERE review_key =
    'blue-buffalo-general-mills:unresolved-image:minced-chicken-turkey-cat';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blue Minced Chicken & Turkey quarantine review is missing';
  END IF;

  SELECT cache_key
  INTO v_search_cache_key
  FROM public.search_verified_products(
    'Blue Wilderness Wild Delights Minced Chicken Turkey Wet Cat Food',
    5
  )
  LIMIT 1;

  IF v_search_cache_key IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION
      'Blue Minced Chicken & Turkey exact search regression: expected %, found %',
      v_cache_key,
      v_search_cache_key;
  END IF;
END
$$;

DO $$
DECLARE
  v_duplicate_groups integer;
BEGIN
  SELECT count(*)
  INTO v_duplicate_groups
  FROM (
    SELECT source_url
    FROM public.catalog_formulas
    WHERE lower(brand) = 'blue buffalo'
      AND active
      AND verification_status = 'verified'
      AND source_url IS NOT NULL
    GROUP BY source_url
    HAVING count(*) > 1
  ) AS duplicate_sources;

  IF v_duplicate_groups <> 4 THEN
    RAISE EXCEPTION
      'Blue Buffalo exact-source duplicates changed: expected only 4 reviewed Wolf Creek conflicts, found %',
      v_duplicate_groups;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT source_url
      FROM public.catalog_formulas
      WHERE lower(brand) = 'blue buffalo'
        AND active
        AND verification_status = 'verified'
        AND source_url IS NOT NULL
      GROUP BY source_url
      HAVING count(*) > 1
    ) AS remaining
    WHERE remaining.source_url NOT LIKE
      'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-%'
  ) THEN
    RAISE EXCEPTION 'An unreviewed Blue Buffalo exact-source duplicate remains';
  END IF;
END
$$;
