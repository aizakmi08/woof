-- Repair six exact current Blue Buffalo Love Made Fresh manufacturer formulas
-- whose official /fresh-dog-food/ identity was imported as wet because their
-- recipe titles contain "stew" or "roll". Ingredients, images, formula
-- versions, SKU links, and scoring evidence remain unchanged.

CREATE TEMP TABLE blue_lmf_form_repair (
  formula_id BIGINT PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  old_formula_key TEXT UNIQUE NOT NULL,
  new_formula_key TEXT UNIQUE NOT NULL,
  new_identity_hash TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  product_line TEXT NOT NULL,
  flavor TEXT NOT NULL,
  source_url TEXT UNIQUE NOT NULL,
  image_url TEXT NOT NULL,
  ingredient_count INTEGER NOT NULL,
  database_ingredient_hash TEXT NOT NULL,
  raw_ingredient_hash TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO blue_lmf_form_repair VALUES
(
  33087,
  'blue-buffalo-general-mills:blue buffalo love made fresh beef recipe roll small adult dog food love-made-fresh beef-stew-small-breed-dog-meat-roll',
  'general mills|blue buffalo|love made fresh beef recipe roll small adult dog food|dog|adult|wet|beef recipe|',
  'general mills|blue buffalo|love made fresh beef recipe roll small adult dog food|dog|adult|fresh|beef recipe|',
  '0a9e64b767d97f29f6c45686718b8da302f4f6eb8403fb5c8d709d035cbaec37',
  'Love Made Fresh Beef Recipe Roll | Small Adult Dog Food',
  'Love Made Fresh', 'Beef Recipe',
  'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/beef-stew-small-breed-dog-meat-roll/',
  'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_roll_sb_beef.png',
  56,
  'dd34cab1fe2a937fdbd9fc7692735ec1dc70bf55c21d26434e8a6d7cdb69e513',
  '002adc9ac3f9c5cdd15a6b7a092b7644b1893e5259f06cc46461ffd9c6d83ff2'
),
(
  33089,
  'blue-buffalo-general-mills:blue buffalo love made fresh beef stew tub small adult dog food love-made-fresh beef-stew-small-breed-dogs-tub',
  'general mills|blue buffalo|love made fresh beef stew tub small adult dog food|dog|adult|wet|beef|',
  'general mills|blue buffalo|love made fresh beef stew tub small adult dog food|dog|adult|fresh|beef|',
  'e7c41c5365c583ae7b12481ee9cfe8df730c69e188bdd7c19cbcd5839a2f74c4',
  'Love Made Fresh Beef Stew Tub | Small Adult Dog Food',
  'Love Made Fresh', 'Beef',
  'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/beef-stew-small-breed-dogs-tub/',
  'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_tub_sb_beef.png',
  45,
  '0126366dabb66e012e461f01fa824491e019ce4d3fd91104f38bc179f61a466d',
  '530ea07a0c0ce2ee63b7f579fc5bb887509ff7dd225cb8dfbee579cefa3f867c'
),
(
  33092,
  'blue-buffalo-general-mills:blue buffalo love made fresh chicken recipe roll adult dog food love-made-fresh chicken-stew-adult-dog-meat-roll',
  'general mills|blue buffalo|love made fresh chicken recipe roll adult dog food|dog|adult|wet|chicken recipe|',
  'general mills|blue buffalo|love made fresh chicken recipe roll adult dog food|dog|adult|fresh|chicken recipe|',
  '7db78e1a78feeffdb991b38c38a37c09a31eac44a132dd10a601fa89193e8e64',
  'Love Made Fresh Chicken Recipe Roll | Adult Dog Food',
  'Love Made Fresh', 'Chicken Recipe',
  'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-adult-dog-meat-roll/',
  'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_roll_chicken.png',
  55,
  '3646979f420ad391a01765cc5d22bfaada2d830041416bb0d3ee5541d9398fde',
  'e1914b82351148cb660b1e6f763ab9cc7be876a1d55ae0fe930455146935d5b9'
),
(
  33094,
  'blue-buffalo-general-mills:blue buffalo love made fresh chicken stew tub adult dog food love-made-fresh chicken-stew-adult-dog-tub',
  'general mills|blue buffalo|love made fresh chicken stew tub adult dog food|dog|adult|wet|chicken|',
  'general mills|blue buffalo|love made fresh chicken stew tub adult dog food|dog|adult|fresh|chicken|',
  'efbcfb8f7df45e0f76e59172599898c2142ac19fbb216a24a221c8ec1a031167',
  'Love Made Fresh Chicken Stew Tub | Adult Dog Food',
  'Love Made Fresh', 'Chicken',
  'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-adult-dog-tub/',
  'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_tub_chicken.png',
  44,
  'f9f6100617059c87d4bc958a3a714e9ec6c7157b5d653844418c4cfa9fa7ec91',
  '7e15f274c8b4927269d63552829c7b62f77f634f983a152256079068c58dc02e'
),
(
  33093,
  'blue-buffalo-general-mills:blue buffalo love made fresh chicken roll small adult dog food love-made-fresh chicken-stew-small-breed-dog-meat-roll',
  'general mills|blue buffalo|love made fresh chicken roll small adult dog food|dog|adult|wet|chicken|',
  'general mills|blue buffalo|love made fresh chicken roll small adult dog food|dog|adult|fresh|chicken|',
  '144477d4d3978922ba7451b426f2bf1063c701abeec0fe558614c9f3a51ea0e5',
  'Love Made Fresh Chicken Roll | Small Adult Dog Food',
  'Love Made Fresh', 'Chicken',
  'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-small-breed-dog-meat-roll/',
  'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_roll_sb_chicken.png',
  56,
  '090772fee824aa6d4e729ea9c51fbcadd27633f352a46531dfb0dfcf2397211c',
  'ff85cc749c8f02be65b5ea1bc261c832471aa4031cbbcee89078609ce010909e'
),
(
  33095,
  'blue-buffalo-general-mills:blue buffalo love made fresh chicken stew tub small adult dog food love-made-fresh chicken-stew-small-breed-dogs-tub',
  'general mills|blue buffalo|love made fresh chicken stew tub small adult dog food|dog|adult|wet|chicken|',
  'general mills|blue buffalo|love made fresh chicken stew tub small adult dog food|dog|adult|fresh|chicken|',
  'afac8dcdc4c8843f7cc4ce164c3907c6ac37d4fcd8c221bcf20f6c2ad8d786d0',
  'Love Made Fresh Chicken Stew Tub | Small Adult Dog Food',
  'Love Made Fresh', 'Chicken',
  'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-small-breed-dogs-tub/',
  'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_tub_sb_chicken.png',
  44,
  '51222501e7a61658c3b32279aeec95142f343c740a854f13ef5a244074d1d4a8',
  'e612b7adfcfc3a10ef3af35053eee5428927af4b297aa5a0d8e64ebecdf3f014'
);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM blue_lmf_form_repair) <> 6
     OR EXISTS (
       SELECT 1 FROM blue_lmf_form_repair target
       WHERE target.old_formula_key NOT LIKE '%|wet|%'
          OR target.new_formula_key NOT LIKE '%|fresh|%'
          OR target.source_url NOT LIKE
             'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/%'
          OR target.image_url NOT LIKE 'https://www.bluebuffalo.com/%/dog-fresh-food/%'
          OR target.new_identity_hash <> encode(digest(target.new_formula_key, 'sha256'), 'hex')
          OR target.database_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR target.raw_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR target.ingredient_count < 5
     ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh repair payload changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_lmf_form_repair target
    JOIN public.catalog_formulas collision
      ON collision.active
     AND collision.id <> target.formula_id
     AND (
       collision.formula_key = target.new_formula_key
       OR collision.identity_hash = target.new_identity_hash
     )
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh corrected identity collision';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_form_repair target
    JOIN public.catalog_formulas formula ON formula.id = target.formula_id
    JOIN public.product_data serving
      ON serving.cache_key = target.cache_key
     AND serving.cache_key = formula.promoted_cache_key
    WHERE formula.active
      AND formula.verification_status = 'verified'
      AND formula.formula_evidence_tier = 'manufacturer_current_exact'
      AND formula.source_authority = 'manufacturer'
      AND formula.ingredient_verification_status = 'manufacturer'
      AND formula.image_verification_status = 'manufacturer'
      AND formula.is_complete_food
      AND formula.formula_key = target.old_formula_key
      AND formula.product_name = target.product_name
      AND formula.product_line = target.product_line
      AND formula.flavor = target.flavor
      AND formula.pet_type = 'dog'
      AND formula.life_stage = 'adult'
      AND formula.food_form = 'wet'
      AND formula.source_url = target.source_url
      AND formula.front_image_url = target.image_url
      AND cardinality(formula.ingredients) = target.ingredient_count
      AND coalesce(
        nullif(formula.formula_version_provenance ->> 'ingredient_text_hash', ''),
        encode(digest(public.catalog_normalize_ingredient_evidence(formula.ingredient_text), 'sha256'), 'hex')
      ) = target.database_ingredient_hash
      AND encode(digest(btrim(regexp_replace(formula.ingredient_text, '\\s+', ' ', 'g')), 'sha256'), 'hex') =
          target.raw_ingredient_hash
      AND serving.product_name = target.product_name
      AND serving.product_line = target.product_line
      AND serving.flavor = target.flavor
      AND serving.pet_type = 'dog'
      AND serving.life_stage = 'adult'
      AND serving.food_form = 'wet'
      AND serving.source_url = target.source_url
      AND serving.image_url = target.image_url
      AND serving.ingredient_count = target.ingredient_count
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
      AND serving.source_quality = 'manufacturer'
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.is_complete_food
      AND serving.catalog_exclusion_reason IS NULL
      AND serving.expires_at > now()
      AND coalesce(
        nullif(serving.formula_version_provenance ->> 'ingredient_text_hash', ''),
        encode(digest(public.catalog_normalize_ingredient_evidence(serving.ingredient_text), 'sha256'), 'hex')
      ) = target.database_ingredient_hash
      AND encode(digest(btrim(regexp_replace(serving.ingredient_text, '\\s+', ' ', 'g')), 'sha256'), 'hex') =
          target.raw_ingredient_hash
  ) <> 6 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh exact current preconditions changed';
  END IF;
END
$guard$;

UPDATE public.catalog_formulas formula
SET formula_key = target.new_formula_key,
    identity_hash = target.new_identity_hash,
    food_form = 'fresh',
    protected_terms = ARRAY(
      SELECT DISTINCT term
      FROM unnest(
        coalesce(formula.protected_terms, ARRAY[]::TEXT[])
        || ARRAY['Blue Buffalo', 'Love Made Fresh', 'refrigerated', 'fresh', 'dog']::TEXT[]
      ) term
      ORDER BY term
    ),
    formula_version_provenance =
      coalesce(formula.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'food_form_evidence', 'exact official /fresh-dog-food/ taxonomy and Love Made Fresh refrigerated line',
        'previous_food_form', 'wet',
        'canonical_food_form', 'fresh',
        'identity_correction', 'blue_love_made_fresh_wet_to_fresh_20260805',
        'identity_corrected_at', now()
      ),
    updated_at = now()
FROM blue_lmf_form_repair target
WHERE formula.id = target.formula_id;

UPDATE public.product_data serving
SET food_form = 'fresh',
    nutritional_info = coalesce(serving.nutritional_info, '{}'::JSONB)
      || jsonb_build_object('food_form', 'fresh'),
    formula_version_provenance =
      coalesce(serving.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'food_form_evidence', 'exact official /fresh-dog-food/ taxonomy and Love Made Fresh refrigerated line',
        'previous_food_form', 'wet',
        'canonical_food_form', 'fresh',
        'identity_correction', 'blue_love_made_fresh_wet_to_fresh_20260805',
        'identity_corrected_at', now()
      ),
    updated_at = now()
FROM blue_lmf_form_repair target
WHERE serving.cache_key = target.cache_key;

UPDATE public.catalog_observations observation
SET food_form = 'fresh',
    raw_payload = coalesce(observation.raw_payload, '{}'::JSONB)
      || jsonb_build_object(
        'food_form_evidence', 'exact official /fresh-dog-food/ taxonomy and Love Made Fresh refrigerated line',
        'previous_food_form', 'wet',
        'canonical_food_form', 'fresh'
      ),
    formula_version_provenance =
      coalesce(observation.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'identity_correction', 'blue_love_made_fresh_wet_to_fresh_20260805',
        'identity_corrected_at', now()
      )
FROM blue_lmf_form_repair target
WHERE observation.formula_id = target.formula_id
  AND observation.source_url = target.source_url
  AND observation.source_authority = 'manufacturer'
  AND observation.ingredient_verification_status = 'manufacturer'
  AND observation.image_verification_status = 'manufacturer'
  AND observation.food_form = 'wet'
  AND encode(digest(btrim(regexp_replace(observation.ingredient_text, '\\s+', ' ', 'g')), 'sha256'), 'hex') =
      target.raw_ingredient_hash;

INSERT INTO public.catalog_field_evidence (
  formula_id, observation_id, field_name, field_value, source_url,
  source_authority, accepted, observed_at, content_hash
)
SELECT
  target.formula_id,
  observation.id,
  'food_form',
  jsonb_build_object(
    'value', 'fresh',
    'previous_value', 'wet',
    'evidence', 'official URL /fresh-dog-food/ and Love Made Fresh refrigerated line',
    'source', 'blue_love_made_fresh_form_repair_20260805'
  ),
  target.source_url,
  'manufacturer',
  TRUE,
  observation.observed_at,
  encode(digest(target.formula_id::TEXT || '|food_form|fresh|' || target.source_url, 'sha256'), 'hex')
FROM blue_lmf_form_repair target
JOIN LATERAL (
  SELECT exact.id, exact.observed_at
  FROM public.catalog_observations exact
  WHERE exact.formula_id = target.formula_id
    AND exact.source_url = target.source_url
    AND exact.source_authority = 'manufacturer'
    AND exact.ingredient_verification_status = 'manufacturer'
    AND exact.image_verification_status = 'manufacturer'
    AND exact.food_form = 'fresh'
  ORDER BY exact.observed_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = TRUE,
    observed_at = EXCLUDED.observed_at;

DO $postconditions$
DECLARE
  v_row RECORD;
  v_top RECORD;
BEGIN
  IF (
    SELECT count(*)
    FROM blue_lmf_form_repair target
    JOIN public.catalog_formulas formula ON formula.id = target.formula_id
    JOIN public.product_data serving ON serving.cache_key = target.cache_key
    WHERE formula.formula_key = target.new_formula_key
      AND formula.identity_hash = target.new_identity_hash
      AND formula.food_form = 'fresh'
      AND serving.food_form = 'fresh'
      AND formula.source_url = target.source_url
      AND serving.source_url = target.source_url
      AND formula.front_image_url = target.image_url
      AND serving.image_url = target.image_url
      AND encode(digest(btrim(regexp_replace(formula.ingredient_text, '\\s+', ' ', 'g')), 'sha256'), 'hex') =
          target.raw_ingredient_hash
      AND encode(digest(btrim(regexp_replace(serving.ingredient_text, '\\s+', ' ', 'g')), 'sha256'), 'hex') =
          target.raw_ingredient_hash
      AND formula.formula_version_provenance ->> 'identity_correction' =
          'blue_love_made_fresh_wet_to_fresh_20260805'
      AND serving.formula_version_provenance ->> 'identity_correction' =
          'blue_love_made_fresh_wet_to_fresh_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh form repair postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_form_repair target
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = target.formula_id
     AND evidence.field_name = 'food_form'
     AND evidence.source_url = target.source_url
     AND evidence.content_hash = encode(
       digest(target.formula_id::TEXT || '|food_form|fresh|' || target.source_url, 'sha256'),
       'hex'
     )
    WHERE evidence.accepted
      AND evidence.source_authority = 'manufacturer'
      AND evidence.field_value ->> 'source' =
          'blue_love_made_fresh_form_repair_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh form evidence postcondition failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_lmf_form_repair LOOP
    SELECT result.* INTO v_top
    FROM public.search_verified_products(v_row.product_name, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top.cache_key IS DISTINCT FROM v_row.cache_key
       OR v_top.brand IS DISTINCT FROM 'Blue Buffalo'
       OR v_top.pet_type IS DISTINCT FROM 'dog'
       OR v_top.life_stage IS DISTINCT FROM 'adult'
       OR v_top.food_form IS DISTINCT FROM 'fresh' THEN
      RAISE EXCEPTION 'Blue Love Made Fresh exact search failed for %', v_row.product_name;
    END IF;
  END LOOP;
END
$postconditions$;
