-- Reconcile one exact Walmart shelf title to an already verified current
-- manufacturer formula. Walmart remains identity evidence only: this does not
-- promote retailer ingredients/images or change product_data/scoring.

CREATE TEMP TABLE blue_walmart_large_breed_chicken_alias
ON COMMIT DROP
AS
SELECT
  'blue buffalo|blue buffalo|blue buffalo wilderness large breed dry dog food plus wholesome grains chicken|dog|unknown|dry||'::TEXT AS alias_formula_key,
  'Blue Buffalo Wilderness Large Breed Dry Dog Food Plus Wholesome Grains Chicken'::TEXT AS retailer_title,
  'https://www.walmart.com/ip/Blue-Buffalo-Wilderness-Large-Breed-Dry-Dog-Food-Plus-Wholesome-Grains-Chicken-24-lbs/1059417221'::TEXT AS retailer_source_url,
  'walmart-public-sitemap'::TEXT AS retailer_source_slug,
  '1059417221'::TEXT AS retailer_product_id,
  'blue-buffalo-general-mills:blue buffalo blue wilderness nature s evolutionary diet with chicken for large breed dogs dry food wilderness large-breed-chicken-wholesome-grain-recipe'::TEXT AS target_cache_key,
  'BLUE Wilderness Nature''s Evolutionary Diet with Chicken for Large Breed Dogs Dry Food'::TEXT AS target_product_name,
  'BLUE Wilderness Nature''s Evolutionary Diet with'::TEXT AS target_product_line,
  'Chicken'::TEXT AS target_flavor,
  'dog'::TEXT AS target_pet_type,
  'unknown'::TEXT AS target_life_stage,
  'dry'::TEXT AS target_food_form,
  'https://www.bluebuffalo.com/dry-dog-food/wilderness/large-breed-chicken-wholesome-grain-recipe/'::TEXT AS target_source_url,
  'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/wilderness/share-product-image/share_wild_adult_lb_ckn.png'::TEXT AS target_database_image_url,
  67::INTEGER AS target_ingredient_count,
  '5084f11063c641a73ed5d27abd193b923cb544f61d233c5dac8e168e6e7f3311'::TEXT AS target_database_ingredient_hash,
  '2ef4d557e802cfd90234ae613ec4a24fdd2ce48d06332eed6c6f19fc99be5835'::TEXT AS target_raw_ingredient_hash,
  jsonb_build_object(
    'brand', 'blue buffalo',
    'family', 'wilderness',
    'sublines', '[]'::JSONB,
    'pet_type', 'dog',
    'life_stage', 'unknown',
    'food_form', 'dry',
    'breed_size', 'large breed',
    'grain_boundary', 'with grain',
    'conditions', '[]'::JSONB,
    'dry_presentations', '[]'::JSONB,
    'recipe_terms', '["chicken"]'::JSONB
  ) AS identity_signature,
  public.normalize_verified_product_search_query(
    'Blue Buffalo Wilderness Large Breed Dry Dog Food Plus Wholesome Grains Chicken'
  ) AS normalized_alias;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM blue_walmart_large_breed_chicken_alias) <> 1 THEN
    RAISE EXCEPTION 'Blue Walmart identity payload must contain one row';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_walmart_large_breed_chicken_alias payload
    WHERE payload.normalized_alias IS NULL
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_pet_type <> 'dog'
       OR payload.target_life_stage <> 'unknown'
       OR payload.target_food_form <> 'dry'
       OR payload.identity_signature ->> 'brand' <> 'blue buffalo'
       OR payload.identity_signature ->> 'family' <> 'wilderness'
       OR payload.identity_signature ->> 'breed_size' <> 'large breed'
       OR payload.identity_signature ->> 'grain_boundary' <> 'with grain'
       OR payload.identity_signature -> 'recipe_terms' <> '["chicken"]'::JSONB
  ) THEN
    RAISE EXCEPTION 'Blue Walmart identity payload crossed a protected boundary';
  END IF;
END
$guard$;

CREATE TEMP TABLE blue_walmart_large_breed_chicken_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.formula_key AS canonical_formula_key,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id,
  observation.observed_at AS retailer_observed_at
FROM blue_walmart_large_breed_chicken_alias payload
JOIN public.catalog_formulas formula
  ON formula.promoted_cache_key = payload.target_cache_key
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_evidence_tier = 'manufacturer_current_exact'
 AND formula.is_complete_food
 AND lower(btrim(formula.brand)) = 'blue buffalo'
 AND formula.product_name = payload.target_product_name
 AND formula.product_line = payload.target_product_line
 AND formula.flavor = payload.target_flavor
 AND formula.pet_type = payload.target_pet_type
 AND coalesce(nullif(lower(btrim(formula.life_stage)), 'unknown'), '') = ''
 AND formula.food_form = payload.target_food_form
 AND formula.source_url = payload.target_source_url
 AND formula.front_image_url = payload.target_database_image_url
 AND formula.source_authority = 'manufacturer'
 AND formula.ingredient_verification_status = 'manufacturer'
 AND formula.image_verification_status = 'manufacturer'
 AND coalesce(
       nullif(formula.formula_version_provenance ->> 'ingredient_text_hash', ''),
       encode(
         digest(
           public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
           'sha256'
         ),
         'hex'
       )
     ) = payload.target_database_ingredient_hash
 AND encode(
       digest(
         btrim(regexp_replace(formula.ingredient_text, '\\s+', ' ', 'g')),
         'sha256'
       ),
       'hex'
     ) = payload.target_raw_ingredient_hash
JOIN LATERAL (
  SELECT exact.id, exact.observed_at
  FROM public.catalog_observations exact
  WHERE exact.source_slug = payload.retailer_source_slug
    AND exact.source_external_id = payload.retailer_product_id
    AND lower(regexp_replace(exact.source_url, '/+$', '')) =
        lower(regexp_replace(payload.retailer_source_url, '/+$', ''))
    AND lower(btrim(exact.brand)) = 'blue buffalo'
    AND exact.product_name = payload.retailer_title
    AND exact.pet_type = payload.target_pet_type
    AND coalesce(nullif(lower(btrim(exact.life_stage)), 'unknown'), '') = ''
    AND exact.food_form = payload.target_food_form
    AND exact.formula_evidence_tier = 'unverified'
    AND coalesce(exact.front_image_url, '') = ''
  ORDER BY exact.observed_at DESC, exact.created_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_walmart_large_breed_chicken_resolved) <> 1 THEN
    RAISE EXCEPTION 'Blue Walmart identity did not resolve uniquely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_walmart_large_breed_chicken_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Walmart formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_walmart_large_breed_chicken_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue Walmart search alias collision';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM blue_walmart_large_breed_chicken_resolved resolved
    JOIN public.product_data product
      ON product.cache_key = resolved.target_cache_key
     AND product.product_name = resolved.target_product_name
     AND product.product_line = resolved.target_product_line
     AND product.flavor = resolved.target_flavor
     AND product.pet_type = resolved.target_pet_type
     AND coalesce(nullif(lower(btrim(product.life_stage)), 'unknown'), '') = ''
     AND product.food_form = resolved.target_food_form
     AND product.source_url = resolved.target_source_url
     AND product.image_url = resolved.target_database_image_url
     AND product.ingredient_count = resolved.target_ingredient_count
     AND coalesce(
           nullif(product.formula_version_provenance ->> 'ingredient_text_hash', ''),
           encode(
             digest(
               public.catalog_normalize_ingredient_evidence(product.ingredient_text),
               'sha256'
             ),
             'hex'
           )
         ) = resolved.target_database_ingredient_hash
     AND encode(
           digest(
             btrim(regexp_replace(product.ingredient_text, '\\s+', ' ', 'g')),
             'sha256'
           ),
           'hex'
         ) = resolved.target_raw_ingredient_hash
     AND product.formula_evidence_tier = 'manufacturer_current_exact'
     AND product.source_quality = 'manufacturer'
     AND product.ingredient_verification_status = 'manufacturer'
     AND product.image_verification_status = 'manufacturer'
     AND product.is_complete_food
     AND product.catalog_exclusion_reason IS NULL
     AND product.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Blue Walmart serving precondition changed';
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
  'blue-buffalo-walmart-large-breed-chicken-20260805:'
    || resolved.retailer_source_slug || ':' || resolved.retailer_product_id,
  resolved.alias_formula_key,
  resolved.canonical_formula_key,
  'Blue Buffalo',
  resolved.retailer_title,
  resolved.retailer_title,
  jsonb_build_array(resolved.retailer_source_url,
    resolved.target_source_url, resolved.target_database_image_url),
  resolved.target_source_url,
  'manufacturer_page',
  jsonb_build_object(
    'alias_formula_key', resolved.alias_formula_key,
    'retailer_title', resolved.retailer_title,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'identity_signature', resolved.identity_signature,
    'target_cache_key', resolved.target_cache_key
  ),
  jsonb_build_object(
    'formula_id', resolved.formula_id,
    'formula_key', resolved.canonical_formula_key,
    'cache_key', resolved.target_cache_key,
    'official_source_url', resolved.target_source_url,
    'official_image_url', resolved.target_database_image_url,
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
  encode(digest(resolved.target_database_image_url, 'sha256'), 'hex'),
  resolved.retailer_observed_at,
  NULL,
  resolved.target_cache_key,
  1,
  'Exact protected Walmart title staged for identity-only reconciliation to one manufacturer-current formula; no retailer ingredient or image evidence is promoted.',
  resolved.target_source_url,
  'source_text_exact',
  resolved.target_database_ingredient_hash,
  '[]'::JSONB,
  now()
FROM blue_walmart_large_breed_chicken_resolved resolved
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
    'source', 'blue_buffalo_walmart_large_breed_chicken_20260805',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_image_present', FALSE,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_title', resolved.retailer_title,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_observed_at', resolved.retailer_observed_at,
    'official_source_url', resolved.target_source_url,
    'official_database_image_url', resolved.target_database_image_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'ingredient_count', resolved.target_ingredient_count,
    'identity_signature', resolved.identity_signature,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_walmart_large_breed_chicken_resolved resolved
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
    'source', 'blue_buffalo_walmart_large_breed_chicken_20260805',
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
FROM blue_walmart_large_breed_chicken_resolved resolved
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
  'retailer_exact_dry_identity_alias',
  jsonb_build_object(
    'source', 'blue_buffalo_walmart_large_breed_chicken_20260805',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_title', resolved.retailer_title,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_source_slug', resolved.retailer_source_slug,
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
  encode(
    digest(
      resolved.formula_id::TEXT || '|blue_buffalo_walmart_large_breed_chicken|'
      || resolved.alias_formula_key || '|' || resolved.retailer_source_url
      || '|' || resolved.target_database_ingredient_hash,
      'sha256'
    ),
    'hex'
  )
FROM blue_walmart_large_breed_chicken_resolved resolved
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
FROM blue_walmart_large_breed_chicken_resolved resolved
WHERE review.review_key =
      'blue-buffalo-walmart-large-breed-chicken-20260805:'
      || resolved.retailer_source_slug || ':' || resolved.retailer_product_id
  AND review.evidence_status = 'staged';

DO $postconditions$
DECLARE
  v_expected_cache_key TEXT;
  v_actual_cache_key TEXT;
BEGIN
  SELECT target_cache_key INTO v_expected_cache_key
  FROM blue_walmart_large_breed_chicken_resolved;

  IF (
    SELECT count(*)
    FROM blue_walmart_large_breed_chicken_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_buffalo_walmart_large_breed_chicken_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Walmart formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_walmart_large_breed_chicken_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_buffalo_walmart_large_breed_chicken_20260805'
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Walmart search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_walmart_large_breed_chicken_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.observation_id = resolved.observation_id
     AND evidence.field_name = 'retailer_exact_dry_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_buffalo_walmart_large_breed_chicken_20260805'
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Walmart identity evidence postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_walmart_large_breed_chicken_resolved resolved
    JOIN public.catalog_manual_evidence_reviews review
      ON review.review_key =
         'blue-buffalo-walmart-large-breed-chicken-20260805:'
         || resolved.retailer_source_slug || ':' || resolved.retailer_product_id
    WHERE review.evidence_status = 'promoted'
      AND review.formula_id = resolved.formula_id
      AND review.promoted_cache_key = resolved.target_cache_key
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Walmart staged review promotion failed';
  END IF;

  SELECT result.cache_key INTO v_actual_cache_key
  FROM public.search_verified_products(
    'Blue Buffalo Wilderness Large Breed Dry Dog Food Plus Wholesome Grains Chicken',
    8
  ) result
  ORDER BY result.rank DESC
  LIMIT 1;

  IF v_actual_cache_key IS DISTINCT FROM v_expected_cache_key THEN
    RAISE EXCEPTION
      'Blue Walmart exact-title search expected %, got %',
      v_expected_cache_key,
      v_actual_cache_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.search_verified_products(
      'Blue Buffalo Wilderness Large Breed Dry Dog Food Plus Wholesome Grains Chicken',
      8
    ) result
    WHERE lower(btrim(result.brand)) <> 'blue buffalo'
       OR result.pet_type <> 'dog'
       OR result.food_form <> 'dry'
  ) THEN
    RAISE EXCEPTION 'Blue Walmart exact-title search crossed an identity boundary';
  END IF;
END
$postconditions$;
