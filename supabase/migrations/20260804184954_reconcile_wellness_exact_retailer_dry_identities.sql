-- Consolidate one exact duplicate Wellness manufacturer formula, then
-- reconcile four exact retailer dry-food identities to four already verified
-- manufacturer-current formulas.
--
-- Retailer sitemap titles remain identity evidence only. This migration does
-- not update product_data, ingredients, images, formula versions, scoring, or
-- verification tiers. The duplicate consolidation is limited to two active
-- rows with the same official PDP, promoted serving cache, exact ingredient
-- text, image, species, life stage, form, flavor, and current evidence tier.

CREATE TEMP TABLE wellness_exact_formula_merge
ON COMMIT DROP
AS
SELECT
  canonical.id AS canonical_formula_id,
  duplicate.id AS duplicate_formula_id,
  canonical.formula_key AS canonical_formula_key,
  duplicate.formula_key AS duplicate_formula_key,
  canonical.identity_hash AS canonical_identity_hash,
  duplicate.identity_hash AS duplicate_identity_hash,
  canonical.promoted_cache_key,
  canonical.source_url AS canonical_source_url,
  duplicate.source_url AS duplicate_source_url
FROM public.catalog_formulas canonical
JOIN public.catalog_formulas duplicate
  ON duplicate.id <> canonical.id
 AND duplicate.promoted_cache_key = canonical.promoted_cache_key
WHERE canonical.formula_key =
      'wellness pet company|wellness|wellness complete health deboned chicken and chicken meal grain free|cat|unknown|dry|chicken and chicken meal grain free|'
  AND duplicate.formula_key =
      'wellness pet company|wellness|wellness complete health natural grain free deboned chicken and chicken meal dry cat food|cat|unknown|dry||'
  AND canonical.active
  AND duplicate.active
  AND canonical.verification_status = 'verified'
  AND duplicate.verification_status = 'verified'
  AND canonical.formula_evidence_tier = 'manufacturer_current_exact'
  AND duplicate.formula_evidence_tier = 'manufacturer_current_exact'
  AND canonical.source_authority = 'manufacturer'
  AND duplicate.source_authority = 'manufacturer'
  AND canonical.ingredient_verification_status = 'manufacturer'
  AND duplicate.ingredient_verification_status = 'manufacturer'
  AND canonical.image_verification_status = 'manufacturer'
  AND duplicate.image_verification_status = 'manufacturer'
  AND canonical.is_complete_food
  AND duplicate.is_complete_food
  AND lower(regexp_replace(canonical.source_url, '/+$', '')) =
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grain-free-deboned-chicken-chicken-meal-2'
  AND lower(regexp_replace(duplicate.source_url, '/+$', '')) =
      lower(regexp_replace(canonical.source_url, '/+$', ''))
  AND lower(btrim(canonical.brand)) = 'wellness'
  AND lower(btrim(duplicate.brand)) = 'wellness'
  AND lower(btrim(canonical.product_name)) =
      lower(btrim(duplicate.product_name))
  AND canonical.pet_type = duplicate.pet_type
  AND coalesce(lower(btrim(canonical.life_stage)), 'unknown') =
      coalesce(lower(btrim(duplicate.life_stage)), 'unknown')
  AND canonical.food_form = duplicate.food_form
  AND coalesce(lower(btrim(canonical.flavor)), '') =
      coalesce(lower(btrim(duplicate.flavor)), '')
  AND coalesce(lower(btrim(canonical.diet_condition)), '') =
      coalesce(lower(btrim(duplicate.diet_condition)), '')
  AND canonical.front_image_url = duplicate.front_image_url
  AND btrim(regexp_replace(canonical.ingredient_text, '\s+', ' ', 'g')) =
      btrim(regexp_replace(duplicate.ingredient_text, '\s+', ' ', 'g'))
  AND canonical.promoted_cache_key =
      'wellness-pet-company:wellness wellness complete health deboned chicken chicken meal grain free product-catalog wellness-complete-health-grain-free-deboned-chicken-chicken-meal-2';

DO $merge_guard$
DECLARE
  v_merge wellness_exact_formula_merge%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM wellness_exact_formula_merge) <> 1 THEN
    RAISE EXCEPTION
      'Wellness exact formula consolidation must resolve one pair';
  END IF;

  SELECT * INTO STRICT v_merge FROM wellness_exact_formula_merge;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases alias
    WHERE alias.alias_formula_key = v_merge.duplicate_formula_key
      AND alias.formula_id <> v_merge.canonical_formula_id
  ) THEN
    RAISE EXCEPTION 'Wellness duplicate formula alias collides with another formula';
  END IF;

  IF (SELECT count(*) FROM public.catalog_observations
      WHERE formula_id = v_merge.duplicate_formula_id) <> 1
     OR (SELECT count(*) FROM public.catalog_skus
         WHERE formula_id = v_merge.duplicate_formula_id) <> 1
     OR (SELECT count(*) FROM public.catalog_field_evidence
         WHERE formula_id = v_merge.duplicate_formula_id) <> 2
     OR (SELECT count(*) FROM public.catalog_gap_evidence_extractions
         WHERE promoted_formula_id = v_merge.duplicate_formula_id) <> 1 THEN
    RAISE EXCEPTION
      'Wellness duplicate formula reference set changed before consolidation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_census_formula_members
    WHERE formula_id = v_merge.duplicate_formula_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_census_members
    WHERE formula_id = v_merge.duplicate_formula_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_formula_identity_conflicts
    WHERE canonical_formula_id = v_merge.duplicate_formula_id
       OR conflicting_formula_id = v_merge.duplicate_formula_id
  ) THEN
    RAISE EXCEPTION
      'Wellness duplicate acquired historical census/conflict references';
  END IF;
END
$merge_guard$;

UPDATE public.catalog_formula_aliases alias
SET formula_id = merge.canonical_formula_id,
    updated_at = now()
FROM wellness_exact_formula_merge merge
WHERE alias.formula_id = merge.duplicate_formula_id;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata,
  updated_at
)
SELECT
  merge.duplicate_formula_key,
  merge.canonical_formula_id,
  merge.duplicate_identity_hash,
  'manual_review',
  merge.duplicate_source_url,
  jsonb_build_object(
    'source', 'wellness_exact_formula_duplicate_consolidation_20260804',
    'duplicate_formula_id', merge.duplicate_formula_id,
    'canonical_formula_id', merge.canonical_formula_id,
    'identity_evidence',
      'same exact official PDP, serving cache, title, ingredients, image, species, life stage, form, flavor, and manufacturer-current evidence',
    'ingredient_or_image_rewrite', FALSE,
    'package_size_is_sku_only', TRUE,
    'reviewed_at', now()
  ),
  now()
FROM wellness_exact_formula_merge merge
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now()
WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

UPDATE public.catalog_observations observation
SET formula_id = merge.canonical_formula_id
FROM wellness_exact_formula_merge merge
WHERE observation.formula_id = merge.duplicate_formula_id;

UPDATE public.catalog_skus sku
SET formula_id = merge.canonical_formula_id,
    updated_at = now()
FROM wellness_exact_formula_merge merge
WHERE sku.formula_id = merge.duplicate_formula_id;

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
)
SELECT
  merge.canonical_formula_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash
FROM wellness_exact_formula_merge merge
JOIN public.catalog_field_evidence evidence
  ON evidence.formula_id = merge.duplicate_formula_id
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted,
  observed_at = greatest(
    public.catalog_field_evidence.observed_at,
    EXCLUDED.observed_at
  );

DELETE FROM public.catalog_field_evidence evidence
USING wellness_exact_formula_merge merge
WHERE evidence.formula_id = merge.duplicate_formula_id;

UPDATE public.catalog_gap_evidence_extractions extraction
SET promoted_formula_id = merge.canonical_formula_id,
    updated_at = now()
FROM wellness_exact_formula_merge merge
WHERE extraction.promoted_formula_id = merge.duplicate_formula_id;

UPDATE public.catalog_manual_evidence_reviews review
SET formula_id = merge.canonical_formula_id,
    corrected_formula_key = merge.canonical_formula_key,
    updated_at = now()
FROM wellness_exact_formula_merge merge
WHERE review.formula_id = merge.duplicate_formula_id;

UPDATE public.catalog_formulas duplicate
SET active = FALSE,
    absent_since = coalesce(duplicate.absent_since, now()),
    verification_status = 'quarantined',
    promoted_cache_key = NULL,
    promoted_at = NULL,
    updated_at = now()
FROM wellness_exact_formula_merge merge
WHERE duplicate.id = merge.duplicate_formula_id;

DO $merge_postconditions$
DECLARE
  v_merge wellness_exact_formula_merge%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_merge FROM wellness_exact_formula_merge;

  IF (SELECT count(*) FROM public.catalog_formulas formula
      WHERE formula.promoted_cache_key = v_merge.promoted_cache_key
        AND formula.active
        AND formula.verification_status = 'verified') <> 1 THEN
    RAISE EXCEPTION
      'Wellness duplicate consolidation did not leave one active verified formula';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE formula_id = v_merge.duplicate_formula_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE formula_id = v_merge.duplicate_formula_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_field_evidence
    WHERE formula_id = v_merge.duplicate_formula_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_gap_evidence_extractions
    WHERE promoted_formula_id = v_merge.duplicate_formula_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_manual_evidence_reviews
    WHERE formula_id = v_merge.duplicate_formula_id
  ) THEN
    RAISE EXCEPTION
      'Wellness duplicate consolidation left mutable references behind';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases alias
    WHERE alias.alias_formula_key = v_merge.duplicate_formula_key
      AND alias.formula_id = v_merge.canonical_formula_id
      AND alias.metadata ->> 'source' =
          'wellness_exact_formula_duplicate_consolidation_20260804'
  ) THEN
    RAISE EXCEPTION 'Wellness duplicate formula alias was not preserved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas duplicate
    WHERE duplicate.id = v_merge.duplicate_formula_id
      AND (
        duplicate.active
        OR duplicate.verification_status <> 'quarantined'
        OR duplicate.promoted_cache_key IS NOT NULL
        OR duplicate.promoted_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Wellness duplicate formula was not safely quarantined';
  END IF;
END
$merge_postconditions$;

CREATE TEMP TABLE wellness_retailer_dry_alias_payload (
  alias_formula_key TEXT NOT NULL,
  retailer_title TEXT NOT NULL,
  retailer_source_url TEXT NOT NULL,
  retailer_product_id TEXT NOT NULL,
  retailer_front_image_url TEXT NOT NULL,
  retailer_observed_at TIMESTAMPTZ NOT NULL,
  retailer_source_slug TEXT NOT NULL,
  target_cache_key TEXT NOT NULL,
  target_brand TEXT NOT NULL,
  target_product_name TEXT NOT NULL,
  target_serving_product_line TEXT NOT NULL,
  target_formula_product_line TEXT NOT NULL,
  target_flavor TEXT NOT NULL,
  target_pet_type TEXT NOT NULL,
  target_life_stage TEXT NOT NULL,
  target_food_form TEXT NOT NULL,
  target_source_url TEXT NOT NULL,
  target_artifact_image_url TEXT NOT NULL,
  target_database_image_url TEXT NOT NULL,
  target_ingredient_count INTEGER NOT NULL,
  target_database_ingredient_hash TEXT NOT NULL,
  target_canonical_ingredient_hash TEXT NOT NULL,
  target_raw_ingredient_hash TEXT NOT NULL,
  identity_signature JSONB NOT NULL,
  formula_id_hint BIGINT NOT NULL,
  normalized_alias TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO wellness_retailer_dry_alias_payload VALUES
(
  'wellness pet company|wellness|wellness core puppy grain free high protein natural chicken and turkey dry dog food|dog|puppy|dry||',
  'Wellness CORE Puppy Grain-Free High-Protein Natural Chicken & Turkey Dry Dog Food',
  'https://www.chewy.com/wellness-core-grain-free-puppy/dp/37164',
  '37164',
  'https://image.chewy.com/catalog/general/images/moe/06827901-a478-7456-8000-c3a6423810eb._V1_.jpg',
  '2026-07-24T21:12:29.287Z',
  'chewy-public-sitemap',
  'wellness-pet-company:wellness wellness core puppy chicken turkey recipe product-catalog wellness-core-grain-free-puppy-chicken-recipe',
  'Wellness',
  'Wellness CORE Puppy Chicken & Turkey Recipe',
  'Wellness CORE Puppy Chicken & Turkey Recipe Grain Free',
  'Wellness CORE Puppy Chicken & Turkey Recipe Grain Free',
  'Chicken & Turkey Recipe',
  'dog',
  'puppy',
  'dry',
  'https://www.wellnesspetfood.com/product-catalog/wellness-core-grain-free-puppy-chicken-recipe/',
  'https://images.salsify.com/image/upload/s--VdZFDnUs--/w_500/avpd7pgrqoxerbs5pb2c.jpg',
  'https://images.salsify.com/image/upload/s--VdZFDnUs--/w_500/avpd7pgrqoxerbs5pb2c.jpg',
  53,
  '5702144975b6c5bfffd4ae8dd0298ce7c08d5956b15d79b942b63c2e86c6fc86',
  '30d038be2e13c83444b22d9bc6132b72d0c69ba7912a5415ee9489f7c1a28306',
  '2e5ab409f5f2bb6d35da366ddd556a7ca8c1f0937ab4edc124c17f54d9b1b591',
  '{"brand":"wellness","family":"core","core_plus":false,"sublines":[],"pet_type":"dog","life_stage":"puppy","food_form":"dry","breed_size":"standard","grain_boundary":"grain free","conditions":[],"recipe_terms":["chicken","turkey"]}',
  33571,
  public.normalize_verified_product_search_query(
    'Wellness CORE Puppy Grain-Free High-Protein Natural Chicken & Turkey Dry Dog Food'
  )
),
(
  'wellness pet company|wellness|wellness core adult grain free high protein natural turkey and chicken dry dog food|dog|adult|dry||',
  'Wellness CORE Adult Grain-Free High-Protein Natural Turkey & Chicken Dry Dog Food',
  'https://www.chewy.com/wellness-core-grain-free-original/dp/3532854',
  '3532854',
  'https://image.chewy.com/catalog/general/images/moe/069669f5-9390-7783-8000-41c50d839f5a._V1_.jpg',
  '2026-07-24T21:12:19.889Z',
  'chewy-public-sitemap',
  'wellness-pet-company:wellness wellness core original turkey chicken recipe product-catalog wellness-core-grain-free-original-turkey-chicken',
  'Wellness',
  'Wellness CORE Original Turkey & Chicken Recipe',
  'Wellness CORE Original Turkey & Chicken Recipe Grain Free',
  'Wellness CORE Original Turkey & Chicken Recipe Grain Free',
  'Turkey & Chicken Recipe',
  'dog',
  'adult',
  'dry',
  'https://www.wellnesspetfood.com/product-catalog/wellness-core-grain-free-original-turkey-chicken/',
  'https://images.salsify.com/image/upload/s--ScrBodE_--/w_500/qpjhe3iukrduyseoetlx.jpg',
  'https://images.salsify.com/image/upload/s--ScrBodE_--/w_500/qpjhe3iukrduyseoetlx.jpg',
  52,
  '9ce5f85764fc2e78c0425f23d92c688f5ed58d34b261ba39f0c18cc8dba58f3c',
  '8d3bfd3fe480c5143adb0275a5d6c9cdf2aba34ebbba8988dceaefe0e2ca2be2',
  '76aa37345b8235097d62e07f1cbf064c035c7462492d47817ed977cee435feb4',
  '{"brand":"wellness","family":"core","core_plus":false,"sublines":["original"],"pet_type":"dog","life_stage":"adult","food_form":"dry","breed_size":"standard","grain_boundary":"grain free","conditions":[],"recipe_terms":["chicken","turkey"]}',
  33570,
  public.normalize_verified_product_search_query(
    'Wellness CORE Adult Grain-Free High-Protein Natural Turkey & Chicken Dry Dog Food'
  )
),
(
  'wellness pet company|wellness|wellness complete health grain free indoor deboned chicken recipe dry cat food 5|cat|unknown|dry||',
  'Wellness Complete Health Grain Free Indoor Deboned Chicken Recipe Dry Cat Food 5',
  'https://www.walmart.com/ip/Wellness-Complete-Health-Grain-Free-Indoor-Deboned-Chicken-Recipe-Dry-Cat-Food-5-5-Pound-Bag/387396023',
  '387396023',
  '',
  '2026-07-24T21:12:20.454Z',
  'walmart-public-sitemap',
  'wellness-pet-company:wellness wellness complete health indoor deboned chicken chicken meal grain free product-catalog wellness-complete-health-grain-free-indoor-deboned-chicken',
  'Wellness',
  'Wellness Complete Health Indoor Deboned Chicken & Chicken Meal Grain Free',
  'Wellness Complete Health Indoor Deboned Chicken & Chicken Meal Grain Free',
  'Wellness Complete Health Indoor Deboned Chicken & Chicken Meal Grain Free',
  'Chicken & Chicken Meal Grain Free',
  'cat',
  'unknown',
  'dry',
  'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grain-free-indoor-deboned-chicken/',
  'https://images.salsify.com/image/upload/s--RGykBVof--/w_500/skcic6glg4fp8heyvp7c.jpg',
  'https://images.salsify.com/image/upload/s--RGykBVof--/w_500/skcic6glg4fp8heyvp7c.jpg',
  49,
  '45b1301f531050fc98ad9e990d98439b9d6be60a94f4c9e3771246f21470ca38',
  '264807424adb82399376908796eeffbdb7653e6ab65e6b23f7177d665c758f07',
  '5ed7ca7b989219fbb310d07e57ffb377809286a0bb5fba52e6c86e689ef1699a',
  '{"brand":"wellness","family":"complete health","core_plus":false,"sublines":[],"pet_type":"cat","life_stage":"unknown","food_form":"dry","breed_size":"standard","grain_boundary":"grain free","conditions":["indoor"],"recipe_terms":["chicken"]}',
  33363,
  public.normalize_verified_product_search_query(
    'Wellness Complete Health Grain Free Indoor Deboned Chicken Recipe Dry Cat Food 5'
  )
),
(
  'wellness pet company|wellness|wellness complete health natural grain free deboned chicken chicken meal dry cat food 11|cat|unknown|dry||',
  'Wellness Complete Health Natural Grain Free Deboned Chicken Chicken Meal Dry Cat Food 11',
  'https://www.walmart.com/ip/Wellness-Complete-Health-Natural-Grain-Free-Deboned-Chicken-Chicken-Meal-Dry-Cat-Food-11-5-Pound-Bag/285846407',
  '285846407',
  '',
  '2026-07-24T21:13:58.694Z',
  'walmart-public-sitemap',
  'wellness-pet-company:wellness wellness complete health deboned chicken chicken meal grain free product-catalog wellness-complete-health-grain-free-deboned-chicken-chicken-meal-2',
  'Wellness',
  'Wellness Complete Health Deboned Chicken & Chicken Meal Grain Free',
  'Complete Health Deboned',
  'Wellness Complete Health Deboned Chicken & Chicken Meal Grain Free',
  'Chicken & Chicken Meal Grain Free',
  'cat',
  'unknown',
  'dry',
  'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grain-free-deboned-chicken-chicken-meal-2/',
  'https://images.salsify.com/image/upload/s--6fWiT0S2--/w_500/bxa1sucys4ilex8s88tf.jpg',
  'https://images.salsify.com/image/upload/s--6fWiT0S2--/w_500/bxa1sucys4ilex8s88tf.jpg',
  47,
  'afe459d37a0fe46e4a32c416d7cbe9851a9c2f6ec83089071d8c528c10e43718',
  '472a585778d686060419f6dda755ab0eeae877b3cc9d795e88c16d9e983bdc5f',
  '9d6aa40ca648491cb9b22cc6f5360b50b2543f8a9df0111ce8a7f18ebcce6029',
  '{"brand":"wellness","family":"complete health","core_plus":false,"sublines":[],"pet_type":"cat","life_stage":"unknown","food_form":"dry","breed_size":"standard","grain_boundary":"grain free","conditions":[],"recipe_terms":["chicken"]}',
  33346,
  public.normalize_verified_product_search_query(
    'Wellness Complete Health Natural Grain Free Deboned Chicken Chicken Meal Dry Cat Food 11'
  )
);

DO $payload_guard$
DECLARE
  v_key TEXT;
BEGIN
  IF (SELECT count(*) FROM wellness_retailer_dry_alias_payload) <> 4
     OR (SELECT count(DISTINCT alias_formula_key)
         FROM wellness_retailer_dry_alias_payload) <> 4
     OR (SELECT count(DISTINCT retailer_source_url)
         FROM wellness_retailer_dry_alias_payload) <> 4
     OR (SELECT count(DISTINCT normalized_alias)
         FROM wellness_retailer_dry_alias_payload) <> 4 THEN
    RAISE EXCEPTION 'Wellness retailer dry payload count or uniqueness changed';
  END IF;

  IF (SELECT count(*) FROM wellness_retailer_dry_alias_payload
      WHERE retailer_source_slug = 'chewy-public-sitemap') <> 2
     OR (SELECT count(*) FROM wellness_retailer_dry_alias_payload
         WHERE retailer_source_slug = 'walmart-public-sitemap') <> 2 THEN
    RAISE EXCEPTION 'Wellness retailer dry source partition changed';
  END IF;

  SELECT alias_formula_key INTO v_key
  FROM wellness_retailer_dry_alias_payload
  WHERE lower(btrim(target_brand)) <> 'wellness'
     OR target_pet_type NOT IN ('dog', 'cat')
     OR target_food_form <> 'dry'
     OR target_source_url NOT LIKE
        'https://www.wellnesspetfood.com/product-catalog/%'
     OR target_artifact_image_url NOT LIKE 'https://images.salsify.com/%'
     OR target_database_image_url NOT LIKE 'https://images.salsify.com/%'
     OR target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
     OR target_canonical_ingredient_hash !~ '^[a-f0-9]{64}$'
     OR target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
     OR target_ingredient_count < 5
     OR identity_signature ->> 'brand' <> 'wellness'
     OR NULLIF(identity_signature ->> 'family', '') IS NULL
     OR jsonb_typeof(identity_signature -> 'core_plus') <> 'boolean'
     OR identity_signature ->> 'pet_type' <> target_pet_type
     OR identity_signature ->> 'life_stage' <> target_life_stage
     OR identity_signature ->> 'food_form' <> 'dry'
     OR NULLIF(identity_signature ->> 'breed_size', '') IS NULL
     OR NULLIF(identity_signature ->> 'grain_boundary', '') IS NULL
     OR jsonb_typeof(identity_signature -> 'recipe_terms') <> 'array'
     OR jsonb_array_length(identity_signature -> 'recipe_terms') = 0
     OR normalized_alias IS NULL
     OR length(normalized_alias) < 2
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Wellness retailer dry identity boundary is unsafe: %', v_key;
  END IF;

  SELECT payload.alias_formula_key INTO v_key
  FROM wellness_retailer_dry_alias_payload payload
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_data product
    WHERE product.cache_key = payload.target_cache_key
      AND lower(btrim(product.brand)) = 'wellness'
      AND lower(btrim(product.product_name)) =
          lower(btrim(payload.target_product_name))
      AND lower(btrim(product.product_line)) =
          lower(btrim(payload.target_serving_product_line))
      AND coalesce(lower(btrim(product.flavor)), '') =
          coalesce(lower(btrim(payload.target_flavor)), '')
      AND product.pet_type = payload.target_pet_type
      AND coalesce(nullif(lower(btrim(product.life_stage)), 'unknown'), '') =
          coalesce(nullif(lower(btrim(payload.target_life_stage)), 'unknown'), '')
      AND product.food_form = 'dry'
      AND lower(regexp_replace(product.source_url, '/+$', '')) =
          lower(regexp_replace(payload.target_source_url, '/+$', ''))
      AND product.image_url = payload.target_database_image_url
      AND product.ingredient_count = payload.target_ingredient_count
      AND coalesce(
            nullif(
              product.formula_version_provenance ->> 'ingredient_text_hash',
              ''
            ),
            encode(
              digest(
                public.catalog_normalize_ingredient_evidence(product.ingredient_text),
                'sha256'
              ),
              'hex'
            )
          ) = payload.target_database_ingredient_hash
      AND encode(
            digest(
              btrim(regexp_replace(product.ingredient_text, '\s+', ' ', 'g')),
              'sha256'
            ),
            'hex'
          ) = payload.target_raw_ingredient_hash
      AND product.formula_evidence_tier = 'manufacturer_current_exact'
      AND product.source_quality = 'manufacturer'
      AND product.ingredient_verification_status = 'manufacturer'
      AND product.image_verification_status = 'manufacturer'
      AND product.is_complete_food
      AND product.catalog_exclusion_reason IS NULL
      AND product.expires_at > now()
      AND product.verified_at IS NOT NULL
  )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Wellness retailer dry serving precondition changed: %', v_key;
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE wellness_retailer_dry_alias_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.formula_key AS canonical_formula_key,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id,
  observation.observed_at AS catalog_observation_observed_at
FROM wellness_retailer_dry_alias_payload payload
JOIN public.catalog_formulas formula
  ON formula.promoted_cache_key = payload.target_cache_key
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_evidence_tier = 'manufacturer_current_exact'
 AND formula.is_complete_food
 AND lower(btrim(formula.brand)) = 'wellness'
 AND lower(btrim(formula.product_name)) =
     lower(btrim(payload.target_product_name))
 AND lower(btrim(formula.product_line)) =
     lower(btrim(payload.target_formula_product_line))
 AND coalesce(lower(btrim(formula.flavor)), '') =
     coalesce(lower(btrim(payload.target_flavor)), '')
 AND formula.pet_type = payload.target_pet_type
 AND coalesce(nullif(lower(btrim(formula.life_stage)), 'unknown'), '') =
     coalesce(nullif(lower(btrim(payload.target_life_stage)), 'unknown'), '')
 AND formula.food_form = 'dry'
 AND lower(regexp_replace(formula.source_url, '/+$', '')) =
     lower(regexp_replace(payload.target_source_url, '/+$', ''))
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
         btrim(regexp_replace(formula.ingredient_text, '\s+', ' ', 'g')),
         'sha256'
       ),
       'hex'
     ) = payload.target_raw_ingredient_hash
JOIN LATERAL (
  SELECT exact_observation.id, exact_observation.observed_at
  FROM public.catalog_observations exact_observation
  WHERE exact_observation.source_slug = payload.retailer_source_slug
    AND exact_observation.source_external_id = payload.retailer_product_id
    AND lower(regexp_replace(exact_observation.source_url, '/+$', '')) =
        lower(regexp_replace(payload.retailer_source_url, '/+$', ''))
    AND public.normalize_verified_product_search_query(
          exact_observation.product_name
        ) = payload.normalized_alias
    AND lower(btrim(exact_observation.brand)) = 'wellness'
    AND exact_observation.pet_type = payload.target_pet_type
    AND coalesce(
          nullif(lower(btrim(exact_observation.life_stage)), 'unknown'),
          ''
        ) = coalesce(
          nullif(lower(btrim(payload.target_life_stage)), 'unknown'),
          ''
        )
    AND exact_observation.food_form = 'dry'
    AND exact_observation.formula_evidence_tier = 'unverified'
    AND coalesce(exact_observation.front_image_url, '') =
        coalesce(payload.retailer_front_image_url, '')
  ORDER BY
    exact_observation.observed_at DESC,
    exact_observation.created_at DESC,
    exact_observation.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
DECLARE
  v_key TEXT;
BEGIN
  SELECT payload.alias_formula_key INTO v_key
  FROM wellness_retailer_dry_alias_payload payload
  LEFT JOIN (
    SELECT alias_formula_key, count(*) AS candidate_count
    FROM wellness_retailer_dry_alias_resolved
    GROUP BY alias_formula_key
  ) resolved USING (alias_formula_key)
  WHERE coalesce(resolved.candidate_count, 0) <> 1
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Wellness retailer dry formula/observation did not resolve uniquely: %',
      v_key;
  END IF;

  SELECT alias_formula_key INTO v_key
  FROM wellness_retailer_dry_alias_resolved
  WHERE formula_id_hint <> formula_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Wellness retailer dry formula hint disagrees with stable resolution: %',
      v_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM wellness_retailer_dry_alias_resolved resolved
    JOIN public.catalog_formula_aliases existing USING (alias_formula_key)
    WHERE existing.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Wellness retailer dry formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM wellness_retailer_dry_alias_resolved resolved
    JOIN public.catalog_verified_product_search_aliases existing
      ON existing.active
     AND existing.normalized_alias = resolved.normalized_alias
    WHERE existing.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Wellness retailer dry search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM wellness_retailer_dry_alias_resolved resolved
    WHERE (SELECT count(*)
           FROM public.catalog_formulas formula
           WHERE formula.promoted_cache_key = resolved.target_cache_key
             AND formula.active
             AND formula.verification_status = 'verified') <> 1
  ) THEN
    RAISE EXCEPTION
      'Wellness retailer dry target does not have one canonical active formula';
  END IF;
END
$resolution_guard$;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata,
  updated_at
)
SELECT
  resolved.alias_formula_key,
  resolved.formula_id,
  resolved.canonical_identity_hash,
  'manual_review',
  resolved.retailer_source_url,
  jsonb_build_object(
    'source', 'wellness_retailer_dry_identity_reconciliation_20260804',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_image_present',
      NULLIF(btrim(resolved.retailer_front_image_url), '') IS NOT NULL,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_title', resolved.retailer_title,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_front_image_url', resolved.retailer_front_image_url,
    'retailer_census_observed_at', resolved.retailer_observed_at,
    'catalog_observation_observed_at',
      resolved.catalog_observation_observed_at,
    'official_source_url', resolved.target_source_url,
    'official_artifact_image_url', resolved.target_artifact_image_url,
    'official_database_image_url', resolved.target_database_image_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash',
      resolved.target_database_ingredient_hash,
    'canonical_artifact_ingredient_hash',
      resolved.target_canonical_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'ingredient_count', resolved.target_ingredient_count,
    'identity_signature', resolved.identity_signature,
    'shelf_brand_boundary', resolved.target_brand,
    'species_boundary', resolved.target_pet_type,
    'life_stage_boundary', resolved.target_life_stage,
    'food_form_boundary', resolved.target_food_form,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM wellness_retailer_dry_alias_resolved resolved
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now()
WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance,
  active,
  updated_at
)
SELECT
  resolved.target_cache_key,
  resolved.retailer_title,
  resolved.normalized_alias,
  resolved.retailer_source_url,
  'retailer_identity',
  resolved.retailer_observed_at,
  jsonb_build_object(
    'source', 'wellness_retailer_dry_identity_reconciliation_20260804',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_census_observed_at', resolved.retailer_observed_at,
    'catalog_observation_observed_at',
      resolved.catalog_observation_observed_at,
    'official_source_url', resolved.target_source_url,
    'official_artifact_image_url', resolved.target_artifact_image_url,
    'official_database_image_url', resolved.target_database_image_url,
    'formula_id', resolved.formula_id,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash',
      resolved.target_database_ingredient_hash,
    'canonical_artifact_ingredient_hash',
      resolved.target_canonical_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'identity_signature', resolved.identity_signature,
    'ingredient_or_image_rewrite', FALSE
  ),
  TRUE,
  now()
FROM wellness_retailer_dry_alias_resolved resolved
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance =
      public.catalog_verified_product_search_aliases.provenance
      || EXCLUDED.provenance,
    updated_at = now()
WHERE public.catalog_verified_product_search_aliases.cache_key =
      EXCLUDED.cache_key;

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
)
SELECT
  resolved.formula_id,
  resolved.observation_id,
  'retailer_exact_dry_identity_alias',
  jsonb_build_object(
    'source', 'wellness_retailer_dry_identity_reconciliation_20260804',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_title', resolved.retailer_title,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_front_image_url', resolved.retailer_front_image_url,
    'retailer_census_observed_at', resolved.retailer_observed_at,
    'catalog_observation_observed_at',
      resolved.catalog_observation_observed_at,
    'official_source_url', resolved.target_source_url,
    'official_artifact_image_url', resolved.target_artifact_image_url,
    'official_database_image_url', resolved.target_database_image_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash',
      resolved.target_database_ingredient_hash,
    'canonical_artifact_ingredient_hash',
      resolved.target_canonical_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'identity_signature', resolved.identity_signature,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.catalog_observation_observed_at,
  encode(
    digest(
      resolved.formula_id::TEXT
      || '|wellness_retailer_dry_identity|'
      || resolved.alias_formula_key
      || '|'
      || resolved.retailer_source_url
      || '|'
      || resolved.target_database_ingredient_hash
      || '|'
      || resolved.target_raw_ingredient_hash,
      'sha256'
    ),
    'hex'
  )
FROM wellness_retailer_dry_alias_resolved resolved
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  observation_id = EXCLUDED.observation_id,
  field_value = EXCLUDED.field_value,
  source_authority = EXCLUDED.source_authority,
  accepted = TRUE,
  observed_at = EXCLUDED.observed_at;

DO $postconditions$
DECLARE
  v_resolved RECORD;
  v_top_cache_key TEXT;
  v_key TEXT;
BEGIN
  IF (
    SELECT count(*)
    FROM wellness_retailer_dry_alias_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.match_reason = 'manual_review'
      AND alias.metadata ->> 'source' =
          'wellness_retailer_dry_identity_reconciliation_20260804'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 4 THEN
    RAISE EXCEPTION 'Wellness retailer dry formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM wellness_retailer_dry_alias_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active
     AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'wellness_retailer_dry_identity_reconciliation_20260804'
      AND (alias.provenance ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.provenance ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 4 THEN
    RAISE EXCEPTION 'Wellness retailer dry search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM wellness_retailer_dry_alias_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.observation_id = resolved.observation_id
     AND evidence.field_name = 'retailer_exact_dry_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'wellness_retailer_dry_identity_reconciliation_20260804'
      AND (evidence.field_value ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (
        evidence.field_value ->> 'retailer_ingredient_verification'
      )::BOOLEAN
  ) <> 4 THEN
    RAISE EXCEPTION 'Wellness retailer dry evidence postcondition failed';
  END IF;

  FOR v_resolved IN
    SELECT *
    FROM wellness_retailer_dry_alias_resolved
    ORDER BY alias_formula_key
  LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_resolved.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_resolved.target_cache_key THEN
      RAISE EXCEPTION
        'Wellness retailer exact-title search regression for %: expected %, got %',
        v_resolved.retailer_product_id,
        v_resolved.target_cache_key,
        v_top_cache_key;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.search_verified_products(v_resolved.retailer_title, 8) result
      WHERE lower(btrim(result.brand)) <> 'wellness'
         OR result.pet_type <> v_resolved.target_pet_type
         OR result.food_form <> 'dry'
    ) THEN
      RAISE EXCEPTION
        'Wellness retailer exact-title search crossed an identity boundary: %',
        v_resolved.retailer_product_id;
    END IF;
  END LOOP;

  SELECT resolved.alias_formula_key INTO v_key
  FROM wellness_retailer_dry_alias_resolved resolved
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_data product
    WHERE product.cache_key = resolved.target_cache_key
      AND lower(regexp_replace(product.source_url, '/+$', '')) =
          lower(regexp_replace(resolved.target_source_url, '/+$', ''))
      AND product.image_url = resolved.target_database_image_url
      AND product.ingredient_count = resolved.target_ingredient_count
      AND coalesce(
            nullif(
              product.formula_version_provenance ->> 'ingredient_text_hash',
              ''
            ),
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
              btrim(regexp_replace(product.ingredient_text, '\s+', ' ', 'g')),
              'sha256'
            ),
            'hex'
          ) = resolved.target_raw_ingredient_hash
      AND product.formula_evidence_tier = 'manufacturer_current_exact'
      AND product.ingredient_verification_status = 'manufacturer'
      AND product.image_verification_status = 'manufacturer'
  )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Wellness retailer dry identity changed serving evidence: %', v_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN wellness_retailer_dry_alias_resolved resolved
      ON resolved.target_cache_key = formula.promoted_cache_key
    WHERE formula.active
      AND formula.verification_status = 'verified'
    GROUP BY resolved.target_cache_key
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION
      'Wellness retailer dry identity left a duplicate active formula';
  END IF;
END
$postconditions$;
