-- Reconcile seven exact Walmart Love Made Fresh tub/roll listings to already
-- verified manufacturer formulas. This also repairs historical Walmart
-- observation identity contamination (including two rows linked to Wellness).
-- Retailer evidence remains identity-only: no ingredients, images, serving
-- content, formula versions, SKUs, or scores are promoted or rewritten.

CREATE TEMP TABLE blue_lmf_tub_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh adult dog food beef stew|dog|adult|wet||",
    "retailer_title":"Blue Buffalo Love Made Fresh Adult Dog Food Beef Stew",
    "retailer_source_url":"https://www.walmart.com/ip/Blue-Buffalo-Love-Made-Fresh-Adult-Dog-Food-Beef-Stew-2-lb-Tub/17173156112",
    "retailer_product_id":"17173156112",
    "retailer_observed_at":"2026-08-05T02:29:58.933Z",
    "target_formula_id":31692,
    "target_formula_key":"general mills|blue buffalo|love made fresh refrigerated stew tub|dog|adult|fresh|beef stew|",
    "target_identity_hash":"e232a8a165b6841a89815ffc543db5940fb40bbbc08b474ea35509d07bc342f6",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh beef stew tub adult dog food love-made-fresh beef-stew-adult-dog-tub",
    "target_product_name":"Love Made Fresh Beef Stew Tub | Adult Dog Food",
    "target_product_line":"Love Made Fresh Refrigerated Stew Tub",
    "target_flavor":"Beef Stew",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/beef-stew-adult-dog-tub/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_tub_beef.png",
    "target_ingredient_count":44,
    "target_database_ingredient_hash":"997efaefb1ab0b4a4e70339f1f0d3ea1fd61ed25f0927b4a68b0427a5b081493",
    "target_raw_ingredient_hash":"a7d0649913b2abe894ea1255702edcbeea07a3239fb1c7a20be327e57d820715",
    "breed_size":"standard",
    "recipe_term":"beef"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh adult dog food chicken stew|dog|adult|wet||",
    "retailer_title":"Blue Buffalo Love Made Fresh Adult Dog Food Chicken Stew",
    "retailer_source_url":"https://www.walmart.com/ip/Blue-Buffalo-Love-Made-Fresh-Adult-Dog-Food-Chicken-Stew-1-lb-Tub/17152353124",
    "retailer_product_id":"17152353124",
    "retailer_observed_at":"2026-08-05T02:30:33.692Z",
    "target_formula_id":33094,
    "target_formula_key":"general mills|blue buffalo|love made fresh chicken stew tub adult dog food|dog|adult|fresh|chicken|",
    "target_identity_hash":"efbcfb8f7df45e0f76e59172599898c2142ac19fbb216a24a221c8ec1a031167",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh chicken stew tub adult dog food love-made-fresh chicken-stew-adult-dog-tub",
    "target_product_name":"Love Made Fresh Chicken Stew Tub | Adult Dog Food",
    "target_product_line":"Love Made Fresh",
    "target_flavor":"Chicken",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-adult-dog-tub/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_tub_chicken.png",
    "target_ingredient_count":44,
    "target_database_ingredient_hash":"f9f6100617059c87d4bc958a3a714e9ec6c7157b5d653844418c4cfa9fa7ec91",
    "target_raw_ingredient_hash":"7e15f274c8b4927269d63552829c7b62f77f634f983a152256079068c58dc02e",
    "breed_size":"standard",
    "recipe_term":"chicken"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh small breed adult dog food chicken stew|dog|adult|wet||",
    "retailer_title":"Blue Buffalo Love Made Fresh Small Breed Adult Dog Food Chicken Stew",
    "retailer_source_url":"https://www.walmart.com/ip/Blue-Buffalo-Love-Made-Fresh-Small-Breed-Adult-Dog-Food-Chicken-Stew-1-lb-Tub/17148062509",
    "retailer_product_id":"17148062509",
    "retailer_observed_at":"2026-08-05T02:30:47.947Z",
    "target_formula_id":33095,
    "target_formula_key":"general mills|blue buffalo|love made fresh chicken stew tub small adult dog food|dog|adult|fresh|chicken|",
    "target_identity_hash":"afac8dcdc4c8843f7cc4ce164c3907c6ac37d4fcd8c221bcf20f6c2ad8d786d0",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh chicken stew tub small adult dog food love-made-fresh chicken-stew-small-breed-dogs-tub",
    "target_product_name":"Love Made Fresh Chicken Stew Tub | Small Adult Dog Food",
    "target_product_line":"Love Made Fresh",
    "target_flavor":"Chicken",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-small-breed-dogs-tub/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_tub_sb_chicken.png",
    "target_ingredient_count":44,
    "target_database_ingredient_hash":"51222501e7a61658c3b32279aeec95142f343c740a854f13ef5a244074d1d4a8",
    "target_raw_ingredient_hash":"e612b7adfcfc3a10ef3af35053eee5428927af4b297aa5a0d8e64ebecdf3f014",
    "breed_size":"small breed",
    "recipe_term":"chicken"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh small breed adult dog food beef stew|dog|adult|wet||",
    "retailer_title":"Blue Buffalo Love Made Fresh Small Breed Adult Dog Food Beef Stew",
    "retailer_source_url":"https://www.walmart.com/ip/Blue-Buffalo-Love-Made-Fresh-Small-Breed-Adult-Dog-Food-Beef-Stew-1-lb-Tub/17152353753",
    "retailer_product_id":"17152353753",
    "retailer_observed_at":"2026-08-05T02:30:52.903Z",
    "target_formula_id":33089,
    "target_formula_key":"general mills|blue buffalo|love made fresh beef stew tub small adult dog food|dog|adult|fresh|beef|",
    "target_identity_hash":"e7c41c5365c583ae7b12481ee9cfe8df730c69e188bdd7c19cbcd5839a2f74c4",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh beef stew tub small adult dog food love-made-fresh beef-stew-small-breed-dogs-tub",
    "target_product_name":"Love Made Fresh Beef Stew Tub | Small Adult Dog Food",
    "target_product_line":"Love Made Fresh",
    "target_flavor":"Beef",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/beef-stew-small-breed-dogs-tub/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_tub_sb_beef.png",
    "target_ingredient_count":45,
    "target_database_ingredient_hash":"0126366dabb66e012e461f01fa824491e019ce4d3fd91104f38bc179f61a466d",
    "target_raw_ingredient_hash":"530ea07a0c0ce2ee63b7f579fc5bb887509ff7dd225cb8dfbee579cefa3f867c",
    "breed_size":"small breed",
    "recipe_term":"beef"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh adult dog food chicken recipe with carrots and peas chub|dog|adult|unknown||",
    "retailer_title":"Blue Buffalo Love Made Fresh Adult Dog Food Chicken Recipe with Carrots and Peas Chub",
    "retailer_source_url":"https://www.walmart.com/ip/Blue-Buffalo-Love-Made-Fresh-Adult-Dog-Food-Chicken-Recipe-with-Carrots-and-Peas-1-lb-Chub/17150054378",
    "retailer_product_id":"17150054378",
    "retailer_observed_at":"2026-08-05T02:29:08.923Z",
    "target_formula_id":33092,
    "target_formula_key":"general mills|blue buffalo|love made fresh chicken recipe roll adult dog food|dog|adult|fresh|chicken recipe|",
    "target_identity_hash":"7db78e1a78feeffdb991b38c38a37c09a31eac44a132dd10a601fa89193e8e64",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh chicken recipe roll adult dog food love-made-fresh chicken-stew-adult-dog-meat-roll",
    "target_product_name":"Love Made Fresh Chicken Recipe Roll | Adult Dog Food",
    "target_product_line":"Love Made Fresh",
    "target_flavor":"Chicken Recipe",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-adult-dog-meat-roll/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_roll_chicken.png",
    "target_ingredient_count":55,
    "target_database_ingredient_hash":"3646979f420ad391a01765cc5d22bfaada2d830041416bb0d3ee5541d9398fde",
    "target_raw_ingredient_hash":"e1914b82351148cb660b1e6f763ab9cc7be876a1d55ae0fe930455146935d5b9",
    "breed_size":"standard",
    "recipe_term":"chicken"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh small breed adult dog food beef recipe with carrots and peas chub|dog|adult|unknown||",
    "retailer_title":"Blue Buffalo Love Made Fresh Small Breed Adult Dog Food Beef Recipe with Carrots and Peas Chub",
    "retailer_source_url":"https://www.walmart.com/ip/Blue-Buffalo-Love-Made-Fresh-Small-Breed-Adult-Dog-Food-Beef-Recipe-with-Carrots-and-Peas-1-lb-Chub/17112409473",
    "retailer_product_id":"17112409473",
    "retailer_observed_at":"2026-08-05T02:29:17.158Z",
    "target_formula_id":33087,
    "target_formula_key":"general mills|blue buffalo|love made fresh beef recipe roll small adult dog food|dog|adult|fresh|beef recipe|",
    "target_identity_hash":"0a9e64b767d97f29f6c45686718b8da302f4f6eb8403fb5c8d709d035cbaec37",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh beef recipe roll small adult dog food love-made-fresh beef-stew-small-breed-dog-meat-roll",
    "target_product_name":"Love Made Fresh Beef Recipe Roll | Small Adult Dog Food",
    "target_product_line":"Love Made Fresh",
    "target_flavor":"Beef Recipe",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/beef-stew-small-breed-dog-meat-roll/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_roll_sb_beef.png",
    "target_ingredient_count":56,
    "target_database_ingredient_hash":"dd34cab1fe2a937fdbd9fc7692735ec1dc70bf55c21d26434e8a6d7cdb69e513",
    "target_raw_ingredient_hash":"002adc9ac3f9c5cdd15a6b7a092b7644b1893e5259f06cc46461ffd9c6d83ff2",
    "breed_size":"small breed",
    "recipe_term":"beef"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh small breed adult dog food chicken recipe with carrots and peas chub|dog|adult|unknown||",
    "retailer_title":"Blue Buffalo Love Made Fresh Small Breed Adult Dog Food Chicken Recipe with Carrots and Peas Chub",
    "retailer_source_url":"https://www.walmart.com/ip/Blue-Buffalo-Love-Made-Fresh-Small-Breed-Adult-Dog-Food-Chicken-Recipe-with-Carrots-and-Peas-1-lb-Chub/17141467174",
    "retailer_product_id":"17141467174",
    "retailer_observed_at":"2026-08-05T02:31:07.913Z",
    "target_formula_id":33093,
    "target_formula_key":"general mills|blue buffalo|love made fresh chicken roll small adult dog food|dog|adult|fresh|chicken|",
    "target_identity_hash":"144477d4d3978922ba7451b426f2bf1063c701abeec0fe558614c9f3a51ea0e5",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh chicken roll small adult dog food love-made-fresh chicken-stew-small-breed-dog-meat-roll",
    "target_product_name":"Love Made Fresh Chicken Roll | Small Adult Dog Food",
    "target_product_line":"Love Made Fresh",
    "target_flavor":"Chicken",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-small-breed-dog-meat-roll/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_roll_sb_chicken.png",
    "target_ingredient_count":56,
    "target_database_ingredient_hash":"090772fee824aa6d4e729ea9c51fbcadd27633f352a46531dfb0dfcf2397211c",
    "target_raw_ingredient_hash":"ff85cc749c8f02be65b5ea1bc261c832471aa4031cbbcee89078609ce010909e",
    "breed_size":"small breed",
    "recipe_term":"chicken"
  }
]
$json$::JSONB) AS raw(
  alias_formula_key TEXT,
  retailer_title TEXT,
  retailer_source_url TEXT,
  retailer_product_id TEXT,
  retailer_observed_at TIMESTAMPTZ,
  target_formula_id BIGINT,
  target_formula_key TEXT,
  target_identity_hash TEXT,
  target_cache_key TEXT,
  target_product_name TEXT,
  target_product_line TEXT,
  target_flavor TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  breed_size TEXT,
  recipe_term TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_lmf_tub_payload) <> 7
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_lmf_tub_payload) <> 7
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_lmf_tub_payload) <> 7
     OR (SELECT count(DISTINCT retailer_product_id) FROM blue_lmf_tub_payload) <> 7
     OR (SELECT count(DISTINCT target_formula_id) FROM blue_lmf_tub_payload) <> 7
     OR EXISTS (
       SELECT 1 FROM blue_lmf_tub_payload payload
       WHERE payload.normalized_alias IS NULL
          OR payload.alias_formula_key NOT LIKE '%|wet||'
          OR payload.target_formula_key NOT LIKE '%|fresh|%'
          OR payload.target_identity_hash !~ '^[a-f0-9]{64}$'
          OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_source_url NOT LIKE 'https://www.walmart.com/ip/%'
          OR payload.target_source_url NOT LIKE
             'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/%'
          OR payload.target_image_url NOT LIKE
             'https://www.bluebuffalo.com/%/dog-fresh-food/love-made-fresh/%'
          OR payload.target_ingredient_count < 5
          OR payload.breed_size NOT IN ('standard', 'small breed')
          OR payload.recipe_term NOT IN ('beef', 'chicken')
     ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh package payload changed';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_lmf_tub_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id
FROM blue_lmf_tub_payload payload
JOIN public.catalog_formulas formula
  ON formula.id = payload.target_formula_id
 AND formula.formula_key = payload.target_formula_key
 AND formula.identity_hash = payload.target_identity_hash
 AND formula.promoted_cache_key = payload.target_cache_key
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_evidence_tier = 'manufacturer_current_exact'
 AND formula.is_complete_food
 AND lower(btrim(formula.brand)) = 'blue buffalo'
 AND formula.product_name = payload.target_product_name
 AND lower(btrim(formula.product_line)) = lower(btrim(payload.target_product_line))
 AND lower(btrim(formula.flavor)) = lower(btrim(payload.target_flavor))
 AND formula.pet_type = 'dog'
 AND formula.life_stage = 'adult'
 AND formula.food_form = 'fresh'
 AND formula.source_url = payload.target_source_url
 AND formula.front_image_url = payload.target_image_url
 AND formula.source_authority = 'manufacturer'
 AND formula.ingredient_verification_status = 'manufacturer'
 AND formula.image_verification_status = 'manufacturer'
 AND cardinality(formula.ingredients) = payload.target_ingredient_count
 AND coalesce(
       nullif(formula.formula_version_provenance ->> 'ingredient_text_hash', ''),
       encode(digest(
         public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
         'sha256'
       ), 'hex')
     ) = payload.target_database_ingredient_hash
 AND encode(digest(
       btrim(regexp_replace(formula.ingredient_text, '\\s+', ' ', 'g')),
       'sha256'
     ), 'hex') = payload.target_raw_ingredient_hash
JOIN public.product_data serving
  ON serving.cache_key = payload.target_cache_key
 AND serving.product_name = payload.target_product_name
 AND lower(btrim(serving.product_line)) = lower(btrim(payload.target_product_line))
 AND lower(btrim(serving.flavor)) = lower(btrim(payload.target_flavor))
 AND serving.pet_type = 'dog'
 AND serving.life_stage = 'adult'
 AND serving.food_form = 'fresh'
 AND serving.source_url = payload.target_source_url
 AND serving.image_url = payload.target_image_url
 AND serving.ingredient_count = payload.target_ingredient_count
 AND serving.formula_evidence_tier = 'manufacturer_current_exact'
 AND serving.source_quality = 'manufacturer'
 AND serving.ingredient_verification_status = 'manufacturer'
 AND serving.image_verification_status = 'manufacturer'
 AND serving.is_complete_food
 AND serving.catalog_exclusion_reason IS NULL
 AND serving.expires_at > now()
LEFT JOIN LATERAL (
  SELECT exact.id
  FROM public.catalog_observations exact
  WHERE exact.source_slug = 'walmart-public-sitemap'
    AND exact.source_external_id = payload.retailer_product_id
    AND lower(regexp_replace(exact.source_url, '/+$', '')) =
        lower(regexp_replace(payload.retailer_source_url, '/+$', ''))
    AND nullif(public.catalog_normalize_ingredient_evidence(exact.ingredient_text), '') IS NULL
    AND coalesce(exact.front_image_url, '') = ''
  ORDER BY exact.observed_at DESC, exact.created_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_lmf_tub_resolved) <> 7 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh packages did not resolve to seven exact manufacturer formulas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_lmf_tub_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh package formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_lmf_tub_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh package search alias collision';
  END IF;
END
$resolution_guard$;

-- Correct only identity metadata on exact Walmart observation URLs. These rows
-- contain no ingredients or images, so they never become formula evidence.
UPDATE public.catalog_observations observation
SET formula_id = resolved.formula_id,
    manufacturer = 'general mills',
    brand = 'blue buffalo',
    product_name = resolved.retailer_title,
    product_line = resolved.target_product_line,
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'fresh',
    flavor = resolved.target_flavor,
    raw_payload = coalesce(observation.raw_payload, '{}'::JSONB)
      || jsonb_build_object(
        'identity_correction', 'blue_lmf_walmart_package_identity_20260805',
        'previous_formula_id', observation.formula_id,
        'canonical_food_form', 'fresh',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'official_cache_key', resolved.target_cache_key,
        'corrected_at', now()
      ),
    formula_version_provenance =
      coalesce(observation.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'identity_correction', 'blue_lmf_walmart_package_identity_20260805',
        'retailer_identity_only', TRUE,
        'ingredient_or_image_rewrite', FALSE
      )
FROM blue_lmf_tub_resolved resolved
WHERE observation.source_slug = 'walmart-public-sitemap'
  AND observation.source_external_id = resolved.retailer_product_id
  AND lower(regexp_replace(observation.source_url, '/+$', '')) =
      lower(regexp_replace(resolved.retailer_source_url, '/+$', ''))
  AND nullif(public.catalog_normalize_ingredient_evidence(observation.ingredient_text), '') IS NULL
  AND coalesce(observation.front_image_url, '') = '';

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, updated_at
)
SELECT
  resolved.alias_formula_key,
  resolved.formula_id,
  resolved.canonical_identity_hash,
  'manual_review',
  resolved.retailer_source_url,
  jsonb_build_object(
    'source', 'blue_lmf_walmart_package_identity_20260805',
    'review_method', 'exact_retailer_fresh_package_identity_only',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_image_present', FALSE,
    'retailer_source_slug', 'walmart-public-sitemap',
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_title', resolved.retailer_title,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_observed_at', resolved.retailer_observed_at,
    'official_source_url', resolved.target_source_url,
    'official_database_image_url', resolved.target_image_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.target_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'package_size_is_sku_only', TRUE,
    'source_food_form_was_corrected', 'retailer_form_to_fresh',
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_lmf_tub_resolved resolved
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now()
WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key, alias_text, normalized_alias, source_url, source_authority,
  evidence_observed_at, provenance, active, updated_at
)
SELECT
  resolved.target_cache_key,
  resolved.retailer_title,
  resolved.normalized_alias,
  resolved.retailer_source_url,
  'retailer_identity',
  resolved.retailer_observed_at,
  jsonb_build_object(
    'source', 'blue_lmf_walmart_package_identity_20260805',
    'review_method', 'exact_retailer_fresh_package_identity_only',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_source_slug', 'walmart-public-sitemap',
    'retailer_product_id', resolved.retailer_product_id,
    'official_source_url', resolved.target_source_url,
    'formula_id', resolved.formula_id,
    'canonical_formula_key', resolved.target_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'source_food_form_was_corrected', 'retailer_form_to_fresh',
    'ingredient_or_image_rewrite', FALSE
  ),
  TRUE,
  now()
FROM blue_lmf_tub_resolved resolved
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = public.catalog_verified_product_search_aliases.provenance
      || EXCLUDED.provenance,
    updated_at = now()
WHERE public.catalog_verified_product_search_aliases.cache_key =
      EXCLUDED.cache_key;

INSERT INTO public.catalog_field_evidence (
  formula_id, observation_id, field_name, field_value, source_url,
  source_authority, accepted, observed_at, content_hash
)
SELECT
  resolved.formula_id,
  resolved.observation_id,
  'retailer_exact_fresh_package_identity_alias',
  jsonb_build_object(
    'source', 'blue_lmf_walmart_package_identity_20260805',
    'review_method', 'exact_retailer_fresh_package_identity_only',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_title', resolved.retailer_title,
    'retailer_product_id', resolved.retailer_product_id,
    'official_source_url', resolved.target_source_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.target_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'package_size_is_sku_only', TRUE,
    'source_food_form_was_corrected', 'retailer_form_to_fresh',
    'ingredient_or_image_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_lmf_walmart_package_identity|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.target_database_ingredient_hash,
    'sha256'
  ), 'hex')
FROM blue_lmf_tub_resolved resolved
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = TRUE,
    observed_at = EXCLUDED.observed_at;

DO $postconditions$
DECLARE
  v_row RECORD;
  v_top_cache_key TEXT;
BEGIN
  IF (
    SELECT count(*)
    FROM blue_lmf_tub_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_lmf_walmart_package_identity_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 7 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh package formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_tub_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_lmf_walmart_package_identity_20260805'
  ) <> 7 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh package search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_tub_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.field_name = 'retailer_exact_fresh_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_lmf_walmart_package_identity_20260805'
  ) <> 7 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh package evidence postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN blue_lmf_tub_resolved resolved
      ON observation.source_slug = 'walmart-public-sitemap'
     AND observation.source_external_id = resolved.retailer_product_id
     AND lower(regexp_replace(observation.source_url, '/+$', '')) =
         lower(regexp_replace(resolved.retailer_source_url, '/+$', ''))
    WHERE observation.formula_id <> resolved.formula_id
       OR lower(btrim(observation.brand)) <> 'blue buffalo'
       OR observation.product_name <> resolved.retailer_title
       OR lower(btrim(observation.product_line)) <>
          lower(btrim(resolved.target_product_line))
       OR observation.pet_type <> 'dog'
       OR observation.life_stage <> 'adult'
       OR observation.food_form <> 'fresh'
       OR lower(btrim(observation.flavor)) <>
          lower(btrim(resolved.target_flavor))
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Walmart observation contamination remains';
  END IF;

  FOR v_row IN SELECT * FROM blue_lmf_tub_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'Blue Love Made Fresh exact-title search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;
  END LOOP;
END
$postconditions$;
