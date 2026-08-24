-- Reconcile thirteen exact Tiki Cat retailer identities to twelve already
-- verified manufacturer-current formulas. Retailer observations are identity
-- evidence only: this migration does not update product_data, ingredients,
-- images, formula versions, scoring, evidence tiers, or resolver thresholds.
-- Eleven Chewy fronts were visually compared with the official package front.
-- Two Walmart Born Carnivore dry listings are exact protected-title identities
-- with no retailer image or ingredient claim. Fifty-three ambiguous, legacy,
-- conflicted, or insufficiently identified listings remain unresolved.

CREATE TEMP TABLE tiki_alias_payload ON COMMIT DROP AS
SELECT
  review.expected_identity ->> 'alias_formula_key' AS alias_formula_key,
  review.expected_identity ->> 'retailer_title' AS retailer_title,
  review.expected_identity ->> 'retailer_source_url' AS retailer_source_url,
  review.expected_identity ->> 'retailer_product_id' AS retailer_product_id,
  review.expected_identity ->> 'retailer_content_hash' AS retailer_content_hash,
  review.expected_identity ->> 'retailer_front_image_url'
    AS retailer_front_image_url,
  review.expected_identity ->> 'retailer_front_image_sha256'
    AS retailer_front_image_sha256,
  (review.expected_identity ->> 'retailer_observed_at')::TIMESTAMPTZ
    AS retailer_observed_at,
  review.expected_identity ->> 'retailer_source_slug' AS retailer_source_slug,
  (review.expected_identity ->> 'manual_package_image_match')::BOOLEAN
    AS manual_package_image_match,
  review.expected_identity ->> 'target_cache_key' AS target_cache_key,
  review.expected_identity -> 'identity_signature' AS alias_signature,
  public.normalize_verified_product_search_query(
    review.expected_identity ->> 'retailer_title'
  ) AS normalized_alias
FROM public.catalog_manual_evidence_reviews review
WHERE review.review_key LIKE 'tiki-cat-retailer-identity-20260804:%'
  AND review.evidence_status = 'staged'
  AND review.brand = 'Tiki Cat'
  AND review.formula_id IS NULL
  AND review.ingredient_text_hash IS NULL
  AND review.front_image_url_hash IS NULL
  AND review.review_notes LIKE 'Exact retailer identity alias only.%';

CREATE TEMP TABLE tiki_target_payload ON COMMIT DROP AS
SELECT DISTINCT
  review.resolved_identity ->> 'cache_key' AS cache_key,
  review.resolved_identity ->> 'brand' AS brand,
  review.resolved_identity ->> 'product_name' AS product_name,
  review.resolved_identity ->> 'product_line' AS product_line,
  review.resolved_identity ->> 'flavor' AS flavor,
  review.resolved_identity ->> 'pet_type' AS pet_type,
  review.resolved_identity ->> 'life_stage' AS life_stage,
  review.resolved_identity ->> 'food_form' AS food_form,
  review.resolved_identity ->> 'source_url' AS source_url,
  review.resolved_identity ->> 'image_url' AS image_url,
  review.resolved_identity ->> 'image_sha256' AS image_sha256,
  (review.resolved_identity ->> 'ingredient_count')::INTEGER
    AS ingredient_count,
  review.resolved_identity ->> 'database_ingredient_hash'
    AS database_ingredient_hash,
  review.resolved_identity ->> 'canonical_ingredient_hash'
    AS canonical_ingredient_hash,
  review.resolved_identity ->> 'raw_ingredient_hash' AS raw_ingredient_hash,
  review.resolved_identity ->> 'formula_key' AS formula_key,
  review.resolved_identity ->> 'identity_hash' AS identity_hash,
  review.resolved_identity -> 'signature' AS signature
FROM public.catalog_manual_evidence_reviews review
WHERE review.review_key LIKE 'tiki-cat-retailer-identity-20260804:%'
  AND review.evidence_status = 'staged'
  AND review.brand = 'Tiki Cat';

DO $payload_guard$
DECLARE v_key TEXT;
BEGIN
  IF (SELECT count(*) FROM tiki_alias_payload) <> 13
     OR (SELECT count(DISTINCT alias_formula_key) FROM tiki_alias_payload) <> 13
     OR (SELECT count(DISTINCT retailer_source_url) FROM tiki_alias_payload) <> 13
     OR (SELECT count(DISTINCT retailer_content_hash) FROM tiki_alias_payload) <> 13
     OR (SELECT count(DISTINCT normalized_alias) FROM tiki_alias_payload) <> 13
     OR (SELECT count(*) FROM tiki_target_payload) <> 12
     OR (SELECT count(DISTINCT cache_key) FROM tiki_target_payload) <> 12
     OR (SELECT count(DISTINCT formula_key) FROM tiki_target_payload) <> 12 THEN
    RAISE EXCEPTION 'Tiki Cat payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tiki_alias_payload
    GROUP BY normalized_alias
    HAVING count(DISTINCT target_cache_key) <> 1
  ) THEN
    RAISE EXCEPTION 'Tiki Cat normalized search alias crosses formulas';
  END IF;

  SELECT alias_formula_key INTO v_key
  FROM tiki_alias_payload
  WHERE NULLIF(btrim(alias_formula_key), '') IS NULL
     OR NULLIF(btrim(retailer_title), '') IS NULL
     OR NULLIF(btrim(retailer_source_url), '') IS NULL
     OR NULLIF(btrim(retailer_product_id), '') IS NULL
     OR retailer_content_hash !~ '^[a-f0-9]{64}$'
     OR NULLIF(btrim(target_cache_key), '') IS NULL
     OR normalized_alias IS NULL OR length(normalized_alias) < 2
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Tiki Cat alias payload incomplete: %', v_key;
  END IF;

  SELECT alias_formula_key INTO v_key
  FROM tiki_alias_payload
  WHERE alias_signature ->> 'brand' <> 'tiki cat'
     OR NULLIF(alias_signature ->> 'line', '') IS NULL
     OR alias_signature ->> 'pet_type' <> 'cat'
     OR NULLIF(alias_signature ->> 'life_stage', '') IS NULL
     OR alias_signature ->> 'food_form' NOT IN ('dry', 'wet')
     OR NULLIF(alias_signature ->> 'presentation', '') IS NULL
     OR jsonb_typeof(alias_signature -> 'recipe_terms') <> 'array'
     OR jsonb_array_length(alias_signature -> 'recipe_terms') = 0
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Tiki Cat reviewed alias signature unsafe: %', v_key;
  END IF;

  IF (SELECT count(*) FROM tiki_alias_payload
      WHERE retailer_source_slug = 'chewy-public-sitemap'
        AND manual_package_image_match
        AND retailer_front_image_url LIKE 'https://image.chewy.com/%'
        AND retailer_front_image_sha256 ~ '^[a-f0-9]{64}$') <> 11
     OR (SELECT count(*) FROM tiki_alias_payload
         WHERE retailer_source_slug = 'walmart-public-sitemap'
           AND NOT manual_package_image_match
           AND coalesce(retailer_front_image_url, '') = ''
           AND coalesce(retailer_front_image_sha256, '') = ''
           AND alias_signature ->> 'line' = 'born carnivore'
           AND alias_signature ->> 'food_form' = 'dry'
           AND jsonb_array_length(alias_signature -> 'recipe_terms') >= 3) <> 2 THEN
    RAISE EXCEPTION 'Tiki Cat retailer image/source partition changed';
  END IF;

  SELECT cache_key INTO v_key
  FROM tiki_target_payload
  WHERE lower(btrim(brand)) <> 'tiki cat'
     OR NULLIF(btrim(product_name), '') IS NULL
     OR NULLIF(btrim(product_line), '') IS NULL
     OR pet_type <> 'cat'
     OR life_stage <> 'unknown'
     OR food_form NOT IN ('dry', 'wet')
     OR source_url NOT LIKE 'https://tikipets.com/product/%'
     OR image_url NOT LIKE 'https://tikipets.com/%'
     OR image_sha256 !~ '^[a-f0-9]{64}$'
     OR database_ingredient_hash !~ '^[a-f0-9]{64}$'
     OR canonical_ingredient_hash !~ '^[a-f0-9]{64}$'
     OR raw_ingredient_hash !~ '^[a-f0-9]{64}$'
     OR identity_hash !~ '^[a-f0-9]{64}$'
     OR formula_key NOT LIKE 'whitebridge pet brands|tiki cat|%'
     OR ingredient_count < 5
     OR signature ->> 'brand' <> 'tiki cat'
     OR NULLIF(signature ->> 'line', '') IS NULL
     OR signature ->> 'pet_type' <> 'cat'
     OR signature ->> 'life_stage' <> 'unknown'
     OR signature ->> 'food_form' <> food_form
     OR NULLIF(signature ->> 'presentation', '') IS NULL
     OR jsonb_typeof(signature -> 'recipe_terms') <> 'array'
     OR jsonb_array_length(signature -> 'recipe_terms') = 0
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Tiki Cat target boundary unsafe: %', v_key;
  END IF;

  SELECT target.cache_key INTO v_key
  FROM tiki_target_payload target
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_data product
    WHERE product.cache_key = target.cache_key
      AND lower(btrim(product.brand)) = 'tiki cat'
      AND lower(btrim(product.product_name)) = lower(btrim(target.product_name))
      AND lower(btrim(product.product_line)) = lower(btrim(target.product_line))
      AND coalesce(lower(btrim(product.flavor)), '') =
          coalesce(lower(btrim(target.flavor)), '')
      AND product.pet_type = 'cat'
      AND coalesce(nullif(lower(btrim(product.life_stage)), 'unknown'), '') = ''
      AND product.food_form = target.food_form
      AND product.source_url = target.source_url
      AND product.image_url = target.image_url
      AND product.ingredient_count = target.ingredient_count
      AND coalesce(
            nullif(product.formula_version_provenance ->> 'ingredient_text_hash', ''),
            encode(digest(public.catalog_normalize_ingredient_evidence(
              product.ingredient_text), 'sha256'), 'hex')
          ) = target.database_ingredient_hash
      AND encode(digest(btrim(regexp_replace(product.ingredient_text,
            '\s+', ' ', 'g')), 'sha256'), 'hex') = target.raw_ingredient_hash
      AND product.formula_evidence_tier = 'manufacturer_current_exact'
      AND product.source_quality = 'manufacturer'
      AND product.ingredient_verification_status = 'manufacturer'
      AND product.image_verification_status = 'manufacturer'
      AND product.is_complete_food
      AND product.catalog_exclusion_reason IS NULL
      AND product.expires_at > now()
      AND product.verified_at IS NOT NULL
  ) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Tiki Cat serving precondition changed: %', v_key;
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE tiki_alias_resolved ON COMMIT DROP AS
SELECT alias.*, target.*, formula.id AS resolved_formula_id,
       formula.formula_key AS canonical_formula_key,
       formula.identity_hash AS canonical_identity_hash,
       observation.id AS observation_id
FROM tiki_alias_payload alias
JOIN tiki_target_payload target ON target.cache_key = alias.target_cache_key
JOIN public.catalog_formulas formula
  ON formula.formula_key = target.formula_key
 AND formula.identity_hash = target.identity_hash
 AND formula.promoted_cache_key = target.cache_key
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_evidence_tier = 'manufacturer_current_exact'
 AND formula.is_complete_food
 AND lower(btrim(formula.brand)) = 'tiki cat'
 AND lower(btrim(formula.product_name)) = lower(btrim(target.product_name))
 AND lower(btrim(formula.product_line)) = lower(btrim(target.product_line))
 AND coalesce(lower(btrim(formula.flavor)), '') =
     coalesce(lower(btrim(target.flavor)), '')
 AND formula.pet_type = 'cat'
 AND coalesce(nullif(lower(btrim(formula.life_stage)), 'unknown'), '') = ''
 AND formula.food_form = target.food_form
 AND formula.source_url = target.source_url
 AND formula.front_image_url = target.image_url
 AND formula.source_authority = 'manufacturer'
 AND formula.ingredient_verification_status = 'manufacturer'
 AND formula.image_verification_status = 'manufacturer'
 AND coalesce(nullif(formula.formula_version_provenance ->>
       'ingredient_text_hash', ''), encode(digest(
       public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
       'sha256'), 'hex')) = target.database_ingredient_hash
 AND encode(digest(btrim(regexp_replace(formula.ingredient_text,
       '\s+', ' ', 'g')), 'sha256'), 'hex') = target.raw_ingredient_hash
JOIN LATERAL (
  SELECT candidate.id
  FROM public.catalog_observations candidate
  WHERE candidate.source_slug = alias.retailer_source_slug
    AND candidate.source_external_id = alias.retailer_product_id
    AND lower(regexp_replace(candidate.source_url, '/+$', '')) =
        lower(regexp_replace(alias.retailer_source_url, '/+$', ''))
    AND lower(btrim(candidate.product_name)) = lower(btrim(alias.retailer_title))
    AND lower(btrim(candidate.brand)) = 'tiki cat'
    AND candidate.pet_type = 'cat'
    AND candidate.food_form = target.food_form
    AND candidate.formula_evidence_tier = 'unverified'
    AND candidate.validation_status = 'accepted'
    AND candidate.content_hash = alias.retailer_content_hash
    AND coalesce(candidate.front_image_url, '') =
        coalesce(alias.retailer_front_image_url, '')
  ORDER BY candidate.observed_at DESC NULLS LAST, candidate.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
DECLARE v_key TEXT;
BEGIN
  IF (SELECT count(*) FROM tiki_alias_resolved) <> 13
     OR (SELECT count(DISTINCT alias_formula_key) FROM tiki_alias_resolved) <> 13
     OR (SELECT count(DISTINCT observation_id) FROM tiki_alias_resolved) <> 13
     OR (SELECT count(DISTINCT resolved_formula_id) FROM tiki_alias_resolved) <> 12 THEN
    RAISE EXCEPTION 'Tiki Cat formulas/observations did not resolve exactly';
  END IF;

  SELECT resolved.alias_formula_key INTO v_key
  FROM tiki_alias_resolved resolved
  JOIN public.catalog_formula_aliases existing USING (alias_formula_key)
  WHERE existing.formula_id <> resolved.resolved_formula_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Tiki Cat formula alias collision: %', v_key;
  END IF;

  SELECT resolved.alias_formula_key INTO v_key
  FROM tiki_alias_resolved resolved
  JOIN public.catalog_verified_product_search_aliases existing
    ON existing.active AND existing.normalized_alias = resolved.normalized_alias
  WHERE existing.cache_key <> resolved.cache_key LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Tiki Cat search alias collision: %', v_key;
  END IF;
END
$resolution_guard$;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason,
  source_url, metadata, updated_at
)
SELECT alias_formula_key, resolved_formula_id, canonical_identity_hash,
       'manual_review', retailer_source_url,
       jsonb_build_object(
         'source', 'tiki_cat_exact_retailer_identity_reconciliation_20260804',
         'review_method', 'exact_tiki_cat_retailer_identity_only',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'manual_package_image_match', manual_package_image_match,
         'retailer_source_slug', retailer_source_slug,
         'retailer_product_id', retailer_product_id,
         'retailer_content_hash', retailer_content_hash,
         'retailer_title', retailer_title,
         'retailer_front_image_url', retailer_front_image_url,
         'retailer_front_image_sha256', retailer_front_image_sha256,
         'retailer_identity_signature', alias_signature,
         'official_source_url', source_url,
         'official_image_url', image_url,
         'official_image_sha256', image_sha256,
         'official_cache_key', cache_key,
         'canonical_formula_key', canonical_formula_key,
         'database_ingredient_text_hash', database_ingredient_hash,
         'canonical_artifact_ingredient_hash', canonical_ingredient_hash,
         'raw_current_ingredient_hash', raw_ingredient_hash,
         'identity_signature', signature,
         'ingredient_or_image_rewrite', FALSE,
         'reviewed_at', now()
       ), now()
FROM tiki_alias_resolved
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
SELECT cache_key, retailer_title, normalized_alias, retailer_source_url,
       'retailer_identity', retailer_observed_at,
       jsonb_build_object(
         'source', 'tiki_cat_exact_retailer_identity_reconciliation_20260804',
         'review_method', 'exact_tiki_cat_retailer_identity_only',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'manual_package_image_match', manual_package_image_match,
         'retailer_source_slug', retailer_source_slug,
         'retailer_product_id', retailer_product_id,
         'retailer_content_hash', retailer_content_hash,
         'retailer_front_image_url', retailer_front_image_url,
         'retailer_front_image_sha256', retailer_front_image_sha256,
         'retailer_identity_signature', alias_signature,
         'official_source_url', source_url,
         'official_image_url', image_url,
         'official_image_sha256', image_sha256,
         'formula_id', resolved_formula_id,
         'canonical_formula_key', canonical_formula_key,
         'database_ingredient_text_hash', database_ingredient_hash,
         'canonical_artifact_ingredient_hash', canonical_ingredient_hash,
         'raw_current_ingredient_hash', raw_ingredient_hash,
         'identity_signature', signature,
         'ingredient_or_image_rewrite', FALSE
       ), TRUE, now()
FROM tiki_alias_resolved
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
SELECT resolved_formula_id, observation_id, 'retailer_exact_identity_alias',
       jsonb_build_object(
         'source', 'tiki_cat_exact_retailer_identity_reconciliation_20260804',
         'review_method', 'exact_tiki_cat_retailer_identity_only',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'manual_package_image_match', manual_package_image_match,
         'retailer_title', retailer_title,
         'retailer_product_id', retailer_product_id,
         'retailer_source_slug', retailer_source_slug,
         'retailer_content_hash', retailer_content_hash,
         'retailer_front_image_url', retailer_front_image_url,
         'retailer_front_image_sha256', retailer_front_image_sha256,
         'retailer_identity_signature', alias_signature,
         'official_source_url', source_url,
         'official_image_url', image_url,
         'official_image_sha256', image_sha256,
         'official_cache_key', cache_key,
         'canonical_formula_key', canonical_formula_key,
         'database_ingredient_text_hash', database_ingredient_hash,
         'canonical_artifact_ingredient_hash', canonical_ingredient_hash,
         'raw_current_ingredient_hash', raw_ingredient_hash,
         'identity_signature', signature,
         'ingredient_or_image_rewrite', FALSE
       ), retailer_source_url, 'retailer_identity', TRUE,
       retailer_observed_at,
       encode(digest(resolved_formula_id::TEXT || '|tiki_cat_retailer_identity|'
         || alias_formula_key || '|' || retailer_source_url || '|'
         || database_ingredient_hash || '|' || raw_ingredient_hash,
         'sha256'), 'hex')
FROM tiki_alias_resolved
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = TRUE,
    observed_at = EXCLUDED.observed_at;

UPDATE public.catalog_manual_evidence_reviews review
SET evidence_status = 'promoted',
    formula_id = resolved.resolved_formula_id,
    corrected_formula_key = resolved.canonical_formula_key,
    review_notes = review.review_notes
      || ' Exact identity/search alias reconciliation applied; serving evidence unchanged.',
    updated_at = now()
FROM tiki_alias_resolved resolved
WHERE review.review_key = 'tiki-cat-retailer-identity-20260804:'
      || resolved.retailer_source_slug || ':' || resolved.retailer_product_id
  AND review.evidence_status = 'staged'
  AND review.target_formula_key = resolved.alias_formula_key
  AND review.promoted_cache_key = resolved.cache_key;

DO $postconditions$
DECLARE row RECORD; top_cache TEXT; v_key TEXT;
BEGIN
  IF (SELECT count(*) FROM tiki_alias_resolved resolved
      JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
      WHERE alias.formula_id = resolved.resolved_formula_id
        AND alias.metadata ->> 'source' =
            'tiki_cat_exact_retailer_identity_reconciliation_20260804') <> 13
     OR (SELECT count(*) FROM tiki_alias_resolved resolved
         JOIN public.catalog_verified_product_search_aliases alias
           ON alias.active AND alias.normalized_alias = resolved.normalized_alias
         WHERE alias.cache_key = resolved.cache_key
           AND alias.provenance ->> 'source' =
               'tiki_cat_exact_retailer_identity_reconciliation_20260804') <> 13
     OR (SELECT count(*) FROM tiki_alias_resolved resolved
         JOIN public.catalog_field_evidence evidence
           ON evidence.formula_id = resolved.resolved_formula_id
          AND evidence.observation_id = resolved.observation_id
          AND evidence.field_name = 'retailer_exact_identity_alias'
          AND evidence.source_url = resolved.retailer_source_url
         WHERE evidence.accepted
           AND evidence.field_value ->> 'source' =
               'tiki_cat_exact_retailer_identity_reconciliation_20260804') <> 13 THEN
    RAISE EXCEPTION 'Tiki Cat identity evidence postcondition failed';
  END IF;

  IF (SELECT count(*) FROM public.catalog_manual_evidence_reviews review
      WHERE review.review_key LIKE 'tiki-cat-retailer-identity-20260804:%'
        AND review.evidence_status = 'promoted'
        AND review.formula_id IS NOT NULL
        AND review.promoted_cache_key IS NOT NULL) <> 13 THEN
    RAISE EXCEPTION 'Tiki Cat staged review promotion postcondition failed';
  END IF;

  FOR row IN SELECT * FROM tiki_alias_resolved ORDER BY alias_formula_key LOOP
    SELECT result.cache_key INTO top_cache
    FROM public.search_verified_products(row.retailer_title, 8) result
    ORDER BY result.rank DESC LIMIT 1;
    IF top_cache IS DISTINCT FROM row.cache_key THEN
      RAISE EXCEPTION 'Tiki Cat search regression for %: expected %, got %',
        row.retailer_product_id, row.cache_key, top_cache;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.search_verified_products(row.retailer_title, 8) result
      WHERE lower(btrim(result.brand)) <> 'tiki cat'
         OR result.pet_type <> 'cat'
         OR result.food_form <> row.food_form
    ) THEN
      RAISE EXCEPTION 'Tiki Cat exact-title search crossed a hard boundary: %',
        row.retailer_product_id;
    END IF;
  END LOOP;

  SELECT target.cache_key INTO v_key
  FROM tiki_target_payload target
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_data product
    WHERE product.cache_key = target.cache_key
      AND product.source_url = target.source_url
      AND product.image_url = target.image_url
      AND product.ingredient_count = target.ingredient_count
      AND coalesce(nullif(product.formula_version_provenance ->>
            'ingredient_text_hash', ''), encode(digest(
            public.catalog_normalize_ingredient_evidence(product.ingredient_text),
            'sha256'), 'hex')) = target.database_ingredient_hash
      AND encode(digest(btrim(regexp_replace(product.ingredient_text,
            '\s+', ' ', 'g')), 'sha256'), 'hex') = target.raw_ingredient_hash
      AND product.formula_evidence_tier = 'manufacturer_current_exact'
      AND product.source_quality = 'manufacturer'
      AND product.ingredient_verification_status = 'manufacturer'
      AND product.image_verification_status = 'manufacturer'
  ) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Tiki Cat serving evidence changed: %', v_key;
  END IF;

  SELECT target.cache_key INTO v_key
  FROM tiki_target_payload target
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas formula
    WHERE formula.formula_key = target.formula_key
      AND formula.identity_hash = target.identity_hash
      AND formula.promoted_cache_key = target.cache_key
      AND formula.active
      AND formula.verification_status = 'verified'
      AND formula.formula_evidence_tier = 'manufacturer_current_exact'
      AND formula.source_authority = 'manufacturer'
  ) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Tiki Cat locked formula changed: %', v_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_field_evidence evidence
    WHERE evidence.field_value ->> 'source' =
          'tiki_cat_exact_retailer_identity_reconciliation_20260804'
      AND evidence.field_name <> 'retailer_exact_identity_alias'
  ) THEN
    RAISE EXCEPTION 'Tiki Cat migration created non-identity evidence';
  END IF;
END
$postconditions$;
