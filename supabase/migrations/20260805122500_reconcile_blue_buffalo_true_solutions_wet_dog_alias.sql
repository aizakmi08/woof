-- Reconcile one exact Chewy alias to the current BLUE True Solutions Total
-- Support Chicken Recipe adult wet-dog formula. Retailer evidence is identity-
-- only; product_data, ingredients, images, formula versions, and scores remain
-- untouched.

CREATE TEMP TABLE blue_true_solutions_wet_dog_payload
ON COMMIT DROP
AS
SELECT raw.*,
       public.normalize_verified_product_search_query(raw.retailer_title)
         AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions adult chicken wet dog food|dog|adult|wet||",
    "retailer_title":"Blue Buffalo True Solutions Adult Chicken Wet Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-true-solutions-best-life/dp/299405",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"299405",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-true-solutions-adult-chicken-wet-dog-food-12-5oz-can-12-count/img-594677._V1_.jpg",
    "retailer_front_image_sha256":"ee71e7360ad59460b34500a80510d4436337e7c486a6488d791df6a846ec801a",
    "retailer_front_visible_identity":"BLUE BUFFALO True Solutions TOTAL SUPPORT Chicken Recipe Natural Food for Dogs NET WT. 12.5 oz.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue true solutions total support chicken recipe for adult dogs true-solutions everyday-needs",
    "target_product_name":"BLUE True Solutions Total Support Chicken Recipe for Adult Dogs",
    "target_product_line":"BLUE True Solutions Total Support",
    "target_flavor":"Chicken Recipe",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/true-solutions/everyday-needs/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/true-solutions/share-product-image/share_truesolutions_wet_dog_bestlife.png",
    "official_review_image_sha256":"a094b86055785454d9212653edf7d9899de85b1558ae2da998640da301abdb7f",
    "target_ingredient_count":47,
    "target_database_ingredient_hash":"b588860eed1bcfc1236507a352c2245bac025ce0efbca7111bb1d45034894bd4",
    "target_raw_ingredient_hash":"3cf05d2a70c0666afd5caba73b6eae4e18c22f3de2873477921c70c0a42ce32a"
  }
]
$json$::JSONB) AS raw(
  alias_formula_key TEXT,
  retailer_title TEXT,
  retailer_source_url TEXT,
  retailer_source_slug TEXT,
  retailer_product_id TEXT,
  retailer_front_image_url TEXT,
  retailer_front_image_sha256 TEXT,
  retailer_front_visible_identity TEXT,
  target_cache_key TEXT,
  target_product_name TEXT,
  target_product_line TEXT,
  target_flavor TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  official_review_image_sha256 TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_true_solutions_wet_dog_payload) <> 1
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_true_solutions_wet_dog_payload) <> 1
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_true_solutions_wet_dog_payload) <> 1
     OR (SELECT count(DISTINCT retailer_product_id) FROM blue_true_solutions_wet_dog_payload) <> 1
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_true_solutions_wet_dog_payload) <> 1 THEN
    RAISE EXCEPTION 'BLUE True Solutions wet-dog payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_true_solutions_wet_dog_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'chewy-public-sitemap'
       OR payload.retailer_source_url <> 'https://www.chewy.com/blue-buffalo-true-solutions-best-life/dp/299405'
       OR payload.target_source_url <> 'https://www.bluebuffalo.com/wet-dog-food/true-solutions/everyday-needs/'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_ingredient_count <> 47
       OR payload.retailer_front_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.official_review_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_visible_identity NOT ILIKE '%BLUE BUFFALO%'
       OR payload.retailer_front_visible_identity NOT ILIKE '%True Solutions%'
       OR payload.retailer_front_visible_identity NOT ILIKE '%TOTAL SUPPORT%'
       OR payload.retailer_front_visible_identity NOT ILIKE '%Chicken Recipe%'
       OR payload.retailer_front_visible_identity NOT ILIKE '%Food for Dogs%'
       OR payload.retailer_front_visible_identity NOT ILIKE '%12.5 oz%'
  ) THEN
    RAISE EXCEPTION 'BLUE True Solutions wet-dog evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_true_solutions_wet_dog_resolved
ON COMMIT DROP
AS
SELECT payload.*,
       formula.id AS formula_id,
       formula.formula_key AS canonical_formula_key,
       formula.identity_hash AS canonical_identity_hash,
       observation.id AS observation_id,
       observation.observed_at AS retailer_observed_at
FROM blue_true_solutions_wet_dog_payload payload
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
 AND formula.pet_type = 'dog'
 AND coalesce(nullif(lower(btrim(formula.life_stage)), ''), 'unknown') = 'adult'
 AND formula.food_form = 'wet'
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
    AND exact.product_name = payload.retailer_title
    AND lower(btrim(exact.brand)) = 'blue buffalo'
    AND exact.pet_type = 'dog'
    AND coalesce(nullif(lower(btrim(exact.life_stage)), ''), 'unknown') = 'adult'
    AND exact.food_form = 'wet'
    AND exact.formula_evidence_tier = 'unverified'
    AND exact.front_image_url = payload.retailer_front_image_url
    AND nullif(public.catalog_normalize_ingredient_evidence(exact.ingredient_text), '') IS NULL
    AND coalesce(exact.formula_version_provenance ->> 'version_status', '') <> 'source_versioned'
  ORDER BY exact.observed_at DESC, exact.created_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_true_solutions_wet_dog_resolved) <> 1 THEN
    RAISE EXCEPTION 'BLUE True Solutions wet-dog identity did not resolve exactly';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_true_solutions_wet_dog_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'BLUE True Solutions wet-dog formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_true_solutions_wet_dog_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'BLUE True Solutions wet-dog search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_true_solutions_wet_dog_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_data product
      WHERE product.cache_key = resolved.target_cache_key
        AND product.product_name = resolved.target_product_name
        AND product.product_line = resolved.target_product_line
        AND coalesce(product.flavor, '') = resolved.target_flavor
        AND product.pet_type = 'dog'
        AND coalesce(nullif(lower(btrim(product.life_stage)), ''), 'unknown') = 'adult'
        AND product.food_form = 'wet'
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
    RAISE EXCEPTION 'BLUE True Solutions wet-dog serving precondition changed';
  END IF;
END
$resolution_guard$;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, updated_at
)
SELECT resolved.alias_formula_key,
       resolved.formula_id,
       resolved.canonical_identity_hash,
       'manual_review',
       resolved.retailer_source_url,
       jsonb_build_object(
         'source', 'blue_buffalo_true_solutions_wet_dog_reconciliation_20260805',
         'review_method', 'exact_retailer_front_package_to_current_manufacturer_package',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'retailer_image_identity_only', TRUE,
         'retailer_source_slug', resolved.retailer_source_slug,
         'retailer_product_id', resolved.retailer_product_id,
         'retailer_title', resolved.retailer_title,
         'retailer_front_image_url', resolved.retailer_front_image_url,
         'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
         'retailer_front_visible_identity', resolved.retailer_front_visible_identity,
         'official_source_url', resolved.target_source_url,
         'official_review_image_url', resolved.target_image_url,
         'official_review_image_sha256', resolved.official_review_image_sha256,
         'official_cache_key', resolved.target_cache_key,
         'canonical_formula_key', resolved.canonical_formula_key,
         'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
         'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
         'target_pet_type', 'dog',
         'target_life_stage', 'adult',
         'family', 'true solutions',
         'condition_boundary', 'total support',
         'recipe', 'chicken',
         'package_size_is_sku_only', TRUE,
         'source_version_equivalence_required', TRUE,
         'ingredient_or_image_rewrite', FALSE,
         'reviewed_at', now()
       ),
       now()
FROM blue_true_solutions_wet_dog_resolved resolved
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
SELECT resolved.target_cache_key,
       resolved.retailer_title,
       resolved.normalized_alias,
       resolved.retailer_source_url,
       'retailer_identity',
       resolved.retailer_observed_at,
       jsonb_build_object(
         'source', 'blue_buffalo_true_solutions_wet_dog_reconciliation_20260805',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'retailer_source_slug', resolved.retailer_source_slug,
         'retailer_product_id', resolved.retailer_product_id,
         'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
         'retailer_front_visible_identity', resolved.retailer_front_visible_identity,
         'official_source_url', resolved.target_source_url,
         'formula_id', resolved.formula_id,
         'canonical_formula_key', resolved.canonical_formula_key,
         'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
         'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
         'target_pet_type', 'dog',
         'target_life_stage', 'adult',
         'source_version_equivalence_required', TRUE,
         'ingredient_or_image_rewrite', FALSE
       ),
       TRUE,
       now()
FROM blue_true_solutions_wet_dog_resolved resolved
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = public.catalog_verified_product_search_aliases.provenance || EXCLUDED.provenance,
    updated_at = now()
WHERE public.catalog_verified_product_search_aliases.cache_key = EXCLUDED.cache_key;

INSERT INTO public.catalog_field_evidence (
  formula_id, observation_id, field_name, field_value, source_url,
  source_authority, accepted, observed_at, content_hash
)
SELECT resolved.formula_id,
       resolved.observation_id,
       'retailer_exact_front_package_identity_alias',
       jsonb_build_object(
         'source', 'blue_buffalo_true_solutions_wet_dog_reconciliation_20260805',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'retailer_title', resolved.retailer_title,
         'retailer_product_id', resolved.retailer_product_id,
         'retailer_front_image_url', resolved.retailer_front_image_url,
         'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
         'retailer_front_visible_identity', resolved.retailer_front_visible_identity,
         'official_source_url', resolved.target_source_url,
         'official_review_image_url', resolved.target_image_url,
         'official_review_image_sha256', resolved.official_review_image_sha256,
         'official_cache_key', resolved.target_cache_key,
         'canonical_formula_key', resolved.canonical_formula_key,
         'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
         'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
         'package_size_is_sku_only', TRUE,
         'ingredient_or_image_rewrite', FALSE
       ),
       resolved.retailer_source_url,
       'retailer_identity',
       TRUE,
       resolved.retailer_observed_at,
       encode(digest(
         resolved.formula_id::TEXT || '|blue_buffalo_true_solutions_wet_dog|'
         || resolved.alias_formula_key || '|' || resolved.retailer_source_url
         || '|' || resolved.target_database_ingredient_hash,
         'sha256'
       ), 'hex')
FROM blue_true_solutions_wet_dog_resolved resolved
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = EXCLUDED.accepted,
    observed_at = EXCLUDED.observed_at,
    updated_at = now();

DO $postcondition_guard$
BEGIN
  IF (SELECT count(*) FROM blue_true_solutions_wet_dog_resolved) <> 1
     OR EXISTS (
       SELECT 1 FROM blue_true_solutions_wet_dog_resolved resolved
       WHERE NOT EXISTS (
         SELECT 1 FROM public.catalog_formula_aliases alias
         WHERE alias.alias_formula_key = resolved.alias_formula_key
           AND alias.formula_id = resolved.formula_id
           AND alias.metadata ->> 'retailer_identity_only' = 'true'
           AND alias.metadata ->> 'retailer_ingredient_verification' = 'false'
           AND alias.metadata ->> 'ingredient_or_image_rewrite' = 'false'
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.catalog_verified_product_search_aliases alias
         WHERE alias.active
           AND alias.normalized_alias = resolved.normalized_alias
           AND alias.cache_key = resolved.target_cache_key
           AND alias.provenance ->> 'retailer_identity_only' = 'true'
           AND alias.provenance ->> 'retailer_ingredient_verification' = 'false'
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.catalog_field_evidence evidence
         WHERE evidence.formula_id = resolved.formula_id
           AND evidence.observation_id = resolved.observation_id
           AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
           AND evidence.source_url = resolved.retailer_source_url
           AND evidence.accepted
       )
     ) THEN
    RAISE EXCEPTION 'BLUE True Solutions wet-dog alias postcondition failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.search_verified_products('Blue Buffalo True Solutions Adult Chicken Wet Dog Food', 5)
    WHERE cache_key = (
      SELECT target_cache_key FROM blue_true_solutions_wet_dog_resolved
    )
  ) THEN
    RAISE EXCEPTION 'BLUE True Solutions wet-dog exact alias is not searchable';
  END IF;
END
$postcondition_guard$;
