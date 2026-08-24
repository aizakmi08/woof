-- Reconcile two exact Chewy wet-food identities to current manufacturer
-- formulas. Retailer rows remain identity evidence only; no retailer
-- ingredients/images, serving rows, formula versions, or scores are changed.

CREATE TEMP TABLE blue_wet_identity_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls savory singles tuna entree cuts in gravy adult cat food|cat|adult|wet||",
    "retailer_title": "Blue Buffalo Tastefuls Savory Singles Tuna Entrée Cuts in Gravy Adult Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-tastefuls-savory-singles/dp/380657",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "380657",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-tastefuls-savory-singles-tuna-entre-cuts-in-gravy-adult-cat-food-2-6oz-cup-case-of-24/img-555504._V1_.jpg",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue tastefuls spoonless singles adult wet cat food - tuna cuts in gravy tastefuls tuna-cuts-in-gravy-savory-singles",
    "target_product_name": "BLUE Tastefuls Spoonless Singles Adult Wet Cat Food - Tuna Cuts in Gravy",
    "target_product_line": "BLUE Tastefuls Spoonless Singles Adult Wet",
    "target_flavor": "Tuna",
    "target_pet_type": "cat",
    "target_life_stage": "adult",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-cat-food/tastefuls/tuna-cuts-in-gravy-savory-singles/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_single_adult_tuna_cutsingravy_share.png",
    "target_ingredient_count": 39,
    "target_database_ingredient_hash": "5e27a77e4019a194194466680d0b73e83dd67131c4bc0b4b7b974d61a84f2a59",
    "target_raw_ingredient_hash": "da78ad7f8537e383418475825ffb2db3511603afc7115d49fba027dfbdd6a552",
    "identity_signature": {"brand":"blue buffalo","family":"tastefuls","sublines":[],"pet_type":"cat","life_stage":"adult","food_form":"wet","breed_size":"standard","grain_boundary":"unspecified","conditions":[],"presentations":["cuts in gravy"],"recipe_terms":["tuna"]}
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo freedom indoor flaked chicken recipe grain free canned cat food|cat|unknown|wet||",
    "retailer_title": "Blue Buffalo Freedom Indoor Flaked Chicken Recipe Grain-Free Canned Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-freedom-indoor-flaked/dp/111977",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "111977",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-freedom-indoor-flaked-chicken-recipe-grain-free-canned-cat-food-5-5oz-case-of-24/img-519464._V1_.jpg",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue freedom wet cat food grain-free - flaked chicken freedom gain-free-indoor-flaked-chicken",
    "target_product_name": "BLUE Freedom Wet Cat Food Grain-Free - Flaked Chicken",
    "target_product_line": "BLUE Freedom Wet Grain-Free - Flaked",
    "target_flavor": "Chicken",
    "target_pet_type": "cat",
    "target_life_stage": "unknown",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-cat-food/freedom/gain-free-indoor-flaked-chicken/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/freedom/share-product-image/cat_freedom_indoor_flaked_ckn_wet_share.png",
    "target_ingredient_count": 40,
    "target_database_ingredient_hash": "410224ce35673dc947cc2daea29423d6f90282844f4fbb6ced4f19430f435d03",
    "target_raw_ingredient_hash": "146e735335431e009cafd6016daac399a5af6542341cc90c5e20cb6e0ddcac97",
    "identity_signature": {"brand":"blue buffalo","family":"freedom","sublines":[],"pet_type":"cat","life_stage":"unknown","food_form":"wet","breed_size":"standard","grain_boundary":"grain free","conditions":["indoor"],"presentations":["flaked"],"recipe_terms":["chicken"]}
  }
]
$json$::JSONB) AS raw(
  alias_formula_key TEXT,
  retailer_title TEXT,
  retailer_source_url TEXT,
  retailer_source_slug TEXT,
  retailer_product_id TEXT,
  retailer_front_image_url TEXT,
  target_cache_key TEXT,
  target_product_name TEXT,
  target_product_line TEXT,
  target_flavor TEXT,
  target_pet_type TEXT,
  target_life_stage TEXT,
  target_food_form TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  identity_signature JSONB
);

DO $guard$
BEGIN
  IF (SELECT count(*) FROM blue_wet_identity_payload) <> 2
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_wet_identity_payload) <> 2
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_wet_identity_payload) <> 2
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_wet_identity_payload) <> 2 THEN
    RAISE EXCEPTION 'Blue wet identity payload count/uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_wet_identity_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_pet_type <> 'cat'
       OR payload.target_food_form <> 'wet'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_ingredient_count < 5
       OR payload.identity_signature ->> 'brand' <> 'blue buffalo'
       OR payload.identity_signature ->> 'pet_type' <> 'cat'
       OR payload.identity_signature ->> 'food_form' <> 'wet'
       OR payload.identity_signature ->> 'life_stage' <> payload.target_life_stage
       OR jsonb_array_length(payload.identity_signature -> 'presentations') = 0
       OR jsonb_array_length(payload.identity_signature -> 'recipe_terms') = 0
  ) THEN
    RAISE EXCEPTION 'Blue wet identity payload crossed a protected boundary';
  END IF;
END
$guard$;

CREATE TEMP TABLE blue_wet_identity_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.formula_key AS canonical_formula_key,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id,
  observation.observed_at AS retailer_observed_at
FROM blue_wet_identity_payload payload
JOIN public.catalog_formulas formula
  ON formula.promoted_cache_key = payload.target_cache_key
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_evidence_tier = 'manufacturer_current_exact'
 AND formula.is_complete_food
 AND lower(btrim(formula.brand)) = 'blue buffalo'
 AND formula.product_name = payload.target_product_name
 AND formula.product_line = payload.target_product_line
 AND coalesce(formula.flavor, '') = payload.target_flavor
 AND formula.pet_type = payload.target_pet_type
 AND coalesce(nullif(lower(btrim(formula.life_stage)), 'unknown'), '') =
     coalesce(nullif(payload.target_life_stage, 'unknown'), '')
 AND formula.food_form = payload.target_food_form
 AND formula.source_url = payload.target_source_url
 AND formula.front_image_url = payload.target_image_url
 AND formula.source_authority = 'manufacturer'
 AND formula.ingredient_verification_status = 'manufacturer'
 AND formula.image_verification_status = 'manufacturer'
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
JOIN LATERAL (
  SELECT exact.id, exact.observed_at
  FROM public.catalog_observations exact
  WHERE exact.source_slug = payload.retailer_source_slug
    AND exact.source_external_id = payload.retailer_product_id
    AND lower(regexp_replace(exact.source_url, '/+$', '')) =
        lower(regexp_replace(payload.retailer_source_url, '/+$', ''))
    AND lower(btrim(exact.brand)) = 'blue buffalo'
    AND exact.pet_type = payload.target_pet_type
    AND coalesce(nullif(lower(btrim(exact.life_stage)), 'unknown'), '') =
        coalesce(nullif(payload.target_life_stage, 'unknown'), '')
    AND exact.food_form = payload.target_food_form
    AND exact.formula_evidence_tier = 'unverified'
    AND exact.front_image_url = payload.retailer_front_image_url
    AND nullif(
          public.catalog_normalize_ingredient_evidence(exact.ingredient_text),
          ''
        ) IS NULL
    AND coalesce(exact.formula_version_provenance ->> 'version_status', '') <>
        'source_versioned'
  ORDER BY exact.observed_at DESC, exact.created_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_wet_identity_resolved) <> 2 THEN
    RAISE EXCEPTION 'Blue wet identities did not resolve uniquely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_wet_identity_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue wet formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_wet_identity_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue wet search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_wet_identity_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_data product
      WHERE product.cache_key = resolved.target_cache_key
        AND product.product_name = resolved.target_product_name
        AND product.product_line = resolved.target_product_line
        AND coalesce(product.flavor, '') = resolved.target_flavor
        AND product.pet_type = resolved.target_pet_type
        AND coalesce(nullif(lower(btrim(product.life_stage)), 'unknown'), '') =
            coalesce(nullif(resolved.target_life_stage, 'unknown'), '')
        AND product.food_form = resolved.target_food_form
        AND product.source_url = resolved.target_source_url
        AND product.image_url = resolved.target_image_url
        AND product.ingredient_count = resolved.target_ingredient_count
        AND coalesce(
              nullif(product.formula_version_provenance ->> 'ingredient_text_hash', ''),
              encode(digest(
                public.catalog_normalize_ingredient_evidence(product.ingredient_text),
                'sha256'
              ), 'hex')
            ) = resolved.target_database_ingredient_hash
        AND encode(digest(
              btrim(regexp_replace(product.ingredient_text, '\\s+', ' ', 'g')),
              'sha256'
            ), 'hex') = resolved.target_raw_ingredient_hash
        AND product.formula_evidence_tier = 'manufacturer_current_exact'
        AND product.source_quality = 'manufacturer'
        AND product.ingredient_verification_status = 'manufacturer'
        AND product.image_verification_status = 'manufacturer'
        AND product.is_complete_food
        AND product.catalog_exclusion_reason IS NULL
        AND product.expires_at > now()
    )
  ) THEN
    RAISE EXCEPTION 'Blue wet serving precondition changed';
  END IF;
END
$resolution_guard$;

INSERT INTO public.catalog_manual_evidence_reviews (
  review_key, target_formula_key, corrected_formula_key, brand, product_name,
  search_query, discovery_urls, authoritative_source_url,
  authoritative_source_type, expected_identity, resolved_identity,
  evidence_status, quarantine_reason, authoritative_content_hash,
  ingredient_text_hash, front_image_url_hash, observed_at, formula_id,
  promoted_cache_key, attempt_count, review_notes, ingredient_evidence_url,
  ingredient_evidence_mode, ingredient_original_text_hash,
  ingredient_corrections, updated_at
)
SELECT
  'blue-buffalo-wet-identity-20260805:' || resolved.retailer_source_slug
    || ':' || resolved.retailer_product_id,
  resolved.alias_formula_key,
  resolved.canonical_formula_key,
  'Blue Buffalo',
  resolved.retailer_title,
  resolved.retailer_title,
  jsonb_build_array(resolved.retailer_source_url,
    resolved.retailer_front_image_url, resolved.target_source_url,
    resolved.target_image_url),
  resolved.target_source_url,
  'manufacturer_page',
  jsonb_build_object(
    'alias_formula_key', resolved.alias_formula_key,
    'retailer_title', resolved.retailer_title,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_front_image_url', resolved.retailer_front_image_url,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'identity_signature', resolved.identity_signature,
    'target_cache_key', resolved.target_cache_key,
    'source_version_equivalence_required', TRUE
  ),
  jsonb_build_object(
    'formula_id', resolved.formula_id,
    'formula_key', resolved.canonical_formula_key,
    'cache_key', resolved.target_cache_key,
    'official_source_url', resolved.target_source_url,
    'official_image_url', resolved.target_image_url,
    'official_ingredient_count', resolved.target_ingredient_count,
    'official_database_ingredient_hash',
      resolved.target_database_ingredient_hash,
    'official_raw_ingredient_hash', resolved.target_raw_ingredient_hash
  ),
  'staged',
  NULL,
  encode(digest(resolved.alias_formula_key || '|' ||
    resolved.retailer_source_url || '|' || resolved.target_source_url || '|' ||
    resolved.target_database_ingredient_hash, 'sha256'), 'hex'),
  resolved.target_database_ingredient_hash,
  encode(digest(resolved.target_image_url, 'sha256'), 'hex'),
  resolved.retailer_observed_at,
  NULL,
  resolved.target_cache_key,
  1,
  'Exact Chewy wet identity staged for reconciliation to one manufacturer-current formula. Retailer image is identity-only; retailer ingredients are absent and are not promoted.',
  resolved.target_source_url,
  'source_text_exact',
  resolved.target_database_ingredient_hash,
  '[]'::JSONB,
  now()
FROM blue_wet_identity_resolved resolved
ON CONFLICT (review_key) DO UPDATE
SET target_formula_key = EXCLUDED.target_formula_key,
    corrected_formula_key = EXCLUDED.corrected_formula_key,
    discovery_urls = EXCLUDED.discovery_urls,
    authoritative_source_url = EXCLUDED.authoritative_source_url,
    expected_identity = EXCLUDED.expected_identity,
    resolved_identity = EXCLUDED.resolved_identity,
    evidence_status = 'staged',
    quarantine_reason = NULL,
    authoritative_content_hash = EXCLUDED.authoritative_content_hash,
    ingredient_text_hash = EXCLUDED.ingredient_text_hash,
    front_image_url_hash = EXCLUDED.front_image_url_hash,
    observed_at = EXCLUDED.observed_at,
    formula_id = NULL,
    promoted_cache_key = EXCLUDED.promoted_cache_key,
    attempt_count = public.catalog_manual_evidence_reviews.attempt_count + 1,
    review_notes = EXCLUDED.review_notes,
    ingredient_evidence_url = EXCLUDED.ingredient_evidence_url,
    ingredient_evidence_mode = EXCLUDED.ingredient_evidence_mode,
    ingredient_original_text_hash = EXCLUDED.ingredient_original_text_hash,
    ingredient_corrections = EXCLUDED.ingredient_corrections,
    updated_at = now();

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
    'source', 'blue_buffalo_wet_identity_reconciliation_20260805',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_image_identity_only', TRUE,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_title', resolved.retailer_title,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_front_image_url', resolved.retailer_front_image_url,
    'retailer_observed_at', resolved.retailer_observed_at,
    'official_source_url', resolved.target_source_url,
    'official_database_image_url', resolved.target_image_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'identity_signature', resolved.identity_signature,
    'package_size_is_sku_only', TRUE,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_wet_identity_resolved resolved
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
    'source', 'blue_buffalo_wet_identity_reconciliation_20260805',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_product_id', resolved.retailer_product_id,
    'official_source_url', resolved.target_source_url,
    'formula_id', resolved.formula_id,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'identity_signature', resolved.identity_signature,
    'ingredient_or_image_rewrite', FALSE
  ),
  TRUE,
  now()
FROM blue_wet_identity_resolved resolved
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
  'retailer_exact_wet_identity_alias',
  jsonb_build_object(
    'source', 'blue_buffalo_wet_identity_reconciliation_20260805',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_title', resolved.retailer_title,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_front_image_url', resolved.retailer_front_image_url,
    'official_source_url', resolved.target_source_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'identity_signature', resolved.identity_signature,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_buffalo_wet_identity|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.target_database_ingredient_hash,
    'sha256'
  ), 'hex')
FROM blue_wet_identity_resolved resolved
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = TRUE,
    observed_at = EXCLUDED.observed_at;

UPDATE public.catalog_manual_evidence_reviews review
SET evidence_status = 'promoted',
    formula_id = resolved.formula_id,
    corrected_formula_key = resolved.canonical_formula_key,
    promoted_cache_key = resolved.target_cache_key,
    review_notes = review.review_notes
      || ' Formula alias, field evidence, and exact-title search alias promoted; serving evidence unchanged.',
    updated_at = now()
FROM blue_wet_identity_resolved resolved
WHERE review.review_key = 'blue-buffalo-wet-identity-20260805:'
      || resolved.retailer_source_slug || ':' || resolved.retailer_product_id
  AND review.evidence_status = 'staged';

DO $postconditions$
DECLARE
  v_row RECORD;
  v_top_cache_key TEXT;
BEGIN
  IF (
    SELECT count(*)
    FROM blue_wet_identity_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_buffalo_wet_identity_reconciliation_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 2 THEN
    RAISE EXCEPTION 'Blue wet formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_wet_identity_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_buffalo_wet_identity_reconciliation_20260805'
  ) <> 2 THEN
    RAISE EXCEPTION 'Blue wet search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_wet_identity_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.observation_id = resolved.observation_id
     AND evidence.field_name = 'retailer_exact_wet_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_buffalo_wet_identity_reconciliation_20260805'
  ) <> 2 THEN
    RAISE EXCEPTION 'Blue wet evidence postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_wet_identity_resolved resolved
    JOIN public.catalog_manual_evidence_reviews review
      ON review.review_key = 'blue-buffalo-wet-identity-20260805:'
         || resolved.retailer_source_slug || ':' || resolved.retailer_product_id
    WHERE review.evidence_status = 'promoted'
      AND review.formula_id = resolved.formula_id
      AND review.promoted_cache_key = resolved.target_cache_key
  ) <> 2 THEN
    RAISE EXCEPTION 'Blue wet staged review promotion failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_wet_identity_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'Blue wet exact-title search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.search_verified_products(v_row.retailer_title, 8) result
      WHERE lower(btrim(result.brand)) <> 'blue buffalo'
         OR result.pet_type <> 'cat'
         OR result.food_form <> 'wet'
    ) THEN
      RAISE EXCEPTION 'Blue wet exact-title search crossed an identity boundary';
    END IF;
  END LOOP;
END
$postconditions$;
