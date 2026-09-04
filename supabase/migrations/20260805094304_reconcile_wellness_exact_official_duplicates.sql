-- Consolidate four exact Wellness manufacturer-current duplicates that were
-- created when the independent census normalized the same official PDP a
-- second time. The canonical rows below retain the richer dry-food identity.
-- The redundant serving caches are excluded only after exact URL, title,
-- ingredients, image, species, life stage, flavor, and evidence-tier checks.
-- No ingredient or image is copied and historical census membership remains
-- immutable.

CREATE TEMP TABLE wellness_exact_official_duplicate_payload (
  canonical_formula_id BIGINT PRIMARY KEY,
  duplicate_formula_id BIGINT UNIQUE NOT NULL,
  canonical_formula_key TEXT UNIQUE NOT NULL,
  duplicate_formula_key TEXT UNIQUE NOT NULL,
  canonical_cache_key TEXT UNIQUE NOT NULL,
  duplicate_cache_key TEXT UNIQUE NOT NULL,
  normalized_source_url TEXT UNIQUE NOT NULL,
  expected_product_name TEXT NOT NULL,
  expected_pet_type TEXT NOT NULL,
  expected_life_stage TEXT NOT NULL,
  expected_food_form TEXT NOT NULL,
  expected_flavor TEXT NOT NULL,
  expected_ingredient_count INTEGER NOT NULL,
  expected_ingredient_md5 TEXT NOT NULL,
  expected_front_image_url TEXT NOT NULL,
  expected_duplicate_observations INTEGER NOT NULL,
  expected_duplicate_skus INTEGER NOT NULL,
  expected_duplicate_field_evidence INTEGER NOT NULL,
  expected_duplicate_gap_extractions INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO wellness_exact_official_duplicate_payload VALUES
(
  39171,
  33367,
  'wellness pet company|wellness|wellness complete health natural grain free deboned chicken and chicken meal dry kitten food|cat|kitten|dry||',
  'wellness pet company|wellness|wellness complete health kitten deboned chicken and chicken meal grain free|cat|kitten|unknown|chicken and chicken meal grain free|',
  'census:8c5faaee03b9d32f86387869b67e755e',
  'wellness-pet-company:wellness wellness complete health kitten deboned chicken chicken meal grain free',
  'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grain-free-kitten-deboned-chicken-chicken-meal',
  'Wellness Complete Health Kitten Deboned Chicken & Chicken Meal Grain Free',
  'cat',
  'kitten',
  'dry',
  'Chicken & Chicken Meal Grain Free',
  47,
  'f1ac3a376ad4ffb52b89f509de4ab76c',
  'https://images.salsify.com/image/upload/s--WPU2H7DR--/w_500/t6ast7zvag10tqxjeqmg.jpg',
  6,
  6,
  4,
  1
),
(
  39172,
  33366,
  'wellness pet company|wellness|wellness complete health natural grain free salmon herring indoor dry cat food 11|cat|unknown|dry||',
  'wellness pet company|wellness|wellness complete health indoor salmon and herring grain free|cat|unknown|unknown|salmon and herring grain free|',
  'census:284f5c5af681a64fd3d4cef2b8ffb358',
  'wellness-pet-company:wellness wellness complete health indoor salmon herring grain free',
  'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grain-free-salmon-herring-indoor',
  'Wellness Complete Health Indoor Salmon & Herring Grain Free',
  'cat',
  'unknown',
  'dry',
  'Salmon & Herring Grain Free',
  50,
  '3b985743527748de2a64fb13edaa2367',
  'https://images.salsify.com/image/upload/s--MUA3WCCu--/w_500/zcouckxvlu2c6bbjtg2e.jpg',
  5,
  5,
  4,
  1
),
(
  39174,
  33403,
  'wellness pet company|wellness|wellness complete health natural puppy dry dog food chicken salmon oatmeal|dog|puppy|dry||',
  'wellness pet company|wellness|wellness complete health puppy chicken salmon and oatmeal|dog|puppy|unknown|chicken|',
  'census:234df1643dabd5b1cb2b09868794fd04',
  'wellness-pet-company:wellness wellness complete health puppy chicken salmon oatmeal',
  'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grained-puppy-chicken-salmon-oatmeal',
  'Wellness Complete Health Puppy Chicken, Salmon & Oatmeal',
  'dog',
  'puppy',
  'dry',
  'Chicken',
  55,
  'aee7beb11bea62a39863c8780f8da906',
  'https://images.salsify.com/image/upload/s--4eovKusD--/w_500/px5zewjbcn3diwyyvq58.png',
  1,
  1,
  2,
  0
),
(
  10369,
  33361,
  'wellness|wellness|complete health healthy indulgence shreds with skipjack|cat|unknown|wet|tuna and shrimp in light sauce|',
  'wellness pet company|wellness|wellness complete health healthy indulgence shreds with skipjack tuna and shrimp in light sauce|cat|unknown|wet|tuna and shrimp in light sauce|',
  'census:94d8d3d0d55d37f4fbb3a095697486ce',
  'wellness-pet-company:wellness wellness complete health healthy indulgence shreds with skipjack tuna shrimp in light sauce',
  'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-healthy-indulgence-shreds-tuna-shrimp',
  'Wellness Complete Health Healthy Indulgence Shreds with Skipjack Tuna & Shrimp in Light Sauce',
  'cat',
  'unknown',
  'wet',
  'Tuna & Shrimp in Light Sauce',
  38,
  '8231240eb87e85497d045daa138e30c2',
  'https://images.salsify.com/image/upload/s--hyXQ8x3K--/w_500/l3azjw4mokqu9obx3ib5.jpg',
  1,
  1,
  2,
  0
);

CREATE TEMP TABLE wellness_exact_official_duplicate_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  canonical.identity_hash AS canonical_identity_hash,
  duplicate.identity_hash AS duplicate_identity_hash
FROM wellness_exact_official_duplicate_payload payload
JOIN public.catalog_formulas canonical
  ON canonical.id = payload.canonical_formula_id
 AND canonical.formula_key = payload.canonical_formula_key
 AND canonical.promoted_cache_key = payload.canonical_cache_key
 AND canonical.active
 AND canonical.verification_status = 'verified'
 AND canonical.formula_evidence_tier = 'manufacturer_current_exact'
 AND canonical.source_authority = 'manufacturer'
 AND canonical.ingredient_verification_status = 'manufacturer'
 AND canonical.image_verification_status = 'manufacturer'
 AND canonical.is_complete_food
 AND lower(btrim(canonical.brand)) = 'wellness'
 AND lower(btrim(canonical.pet_type)) = payload.expected_pet_type
 AND coalesce(lower(btrim(canonical.life_stage)), 'unknown') =
     payload.expected_life_stage
 AND lower(btrim(canonical.food_form)) = payload.expected_food_form
 AND regexp_replace(lower(btrim(canonical.flavor)), '\s*&\s*', ' and ', 'g') =
     regexp_replace(lower(btrim(payload.expected_flavor)), '\s*&\s*', ' and ', 'g')
 AND lower(btrim(canonical.product_name)) =
     lower(payload.expected_product_name)
 AND lower(regexp_replace(canonical.source_url, '/+$', '')) =
     payload.normalized_source_url
 AND cardinality(canonical.ingredients) = payload.expected_ingredient_count
 AND md5(coalesce(canonical.ingredient_text, '')) =
     payload.expected_ingredient_md5
 AND canonical.front_image_url = payload.expected_front_image_url
JOIN public.catalog_formulas duplicate
  ON duplicate.id = payload.duplicate_formula_id
 AND duplicate.formula_key = payload.duplicate_formula_key
 AND duplicate.promoted_cache_key = payload.duplicate_cache_key
 AND duplicate.active
 AND duplicate.verification_status = 'verified'
 AND duplicate.formula_evidence_tier = 'manufacturer_current_exact'
 AND duplicate.source_authority = 'manufacturer'
 AND duplicate.ingredient_verification_status = 'manufacturer'
 AND duplicate.image_verification_status = 'manufacturer'
 AND duplicate.is_complete_food
 AND lower(btrim(duplicate.brand)) = 'wellness'
 AND lower(btrim(duplicate.pet_type)) = payload.expected_pet_type
 AND coalesce(lower(btrim(duplicate.life_stage)), 'unknown') =
     payload.expected_life_stage
 AND coalesce(lower(btrim(duplicate.food_form)), 'unknown') IN
     ('unknown', payload.expected_food_form)
 AND regexp_replace(lower(btrim(duplicate.flavor)), '\s*&\s*', ' and ', 'g') =
     regexp_replace(lower(btrim(payload.expected_flavor)), '\s*&\s*', ' and ', 'g')
 AND lower(btrim(duplicate.product_name)) =
     lower(payload.expected_product_name)
 AND lower(regexp_replace(duplicate.source_url, '/+$', '')) =
     payload.normalized_source_url
 AND cardinality(duplicate.ingredients) = payload.expected_ingredient_count
 AND md5(coalesce(duplicate.ingredient_text, '')) =
     payload.expected_ingredient_md5
 AND duplicate.front_image_url = payload.expected_front_image_url;

DO $preconditions$
DECLARE
  pair wellness_exact_official_duplicate_resolved%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM wellness_exact_official_duplicate_resolved) <> 4 THEN
    RAISE EXCEPTION
      'Wellness exact official duplicate audit no longer resolves four pairs';
  END IF;

  FOR pair IN SELECT * FROM wellness_exact_official_duplicate_resolved
  LOOP
    IF (SELECT count(*) FROM public.product_data
        WHERE cache_key = pair.canonical_cache_key
          AND lower(btrim(product_name)) = lower(pair.expected_product_name)
          AND lower(btrim(brand)) = 'wellness'
          AND lower(btrim(pet_type)) = pair.expected_pet_type
          AND coalesce(lower(btrim(life_stage)), 'unknown') =
              pair.expected_life_stage
          AND lower(btrim(food_form)) = pair.expected_food_form
          AND regexp_replace(lower(btrim(flavor)), '\s*&\s*', ' and ', 'g') =
              regexp_replace(lower(btrim(pair.expected_flavor)), '\s*&\s*', ' and ', 'g')
          AND lower(regexp_replace(source_url, '/+$', '')) =
              pair.normalized_source_url
          AND ingredient_count = pair.expected_ingredient_count
          AND md5(coalesce(ingredient_text, '')) = pair.expected_ingredient_md5
          AND image_url = pair.expected_front_image_url
          AND source_quality = 'manufacturer'
          AND ingredient_verification_status = 'manufacturer'
          AND image_verification_status = 'manufacturer'
          AND formula_evidence_tier = 'manufacturer_current_exact'
          AND is_complete_food
          AND catalog_exclusion_reason IS NULL) <> 1 THEN
      RAISE EXCEPTION
        'Canonical Wellness serving row changed: %', pair.canonical_cache_key;
    END IF;

    IF (SELECT count(*) FROM public.product_data
        WHERE cache_key = pair.duplicate_cache_key
          AND lower(btrim(product_name)) = lower(pair.expected_product_name)
          AND lower(btrim(brand)) = 'wellness'
          AND lower(btrim(pet_type)) = pair.expected_pet_type
          AND coalesce(lower(btrim(life_stage)), 'unknown') =
              pair.expected_life_stage
          AND coalesce(lower(btrim(food_form)), 'unknown') IN
              ('unknown', pair.expected_food_form)
          AND regexp_replace(lower(btrim(flavor)), '\s*&\s*', ' and ', 'g') =
              regexp_replace(lower(btrim(pair.expected_flavor)), '\s*&\s*', ' and ', 'g')
          AND lower(regexp_replace(source_url, '/+$', '')) =
              pair.normalized_source_url
          AND ingredient_count = pair.expected_ingredient_count
          AND md5(coalesce(ingredient_text, '')) = pair.expected_ingredient_md5
          AND image_url = pair.expected_front_image_url
          AND source_quality = 'manufacturer'
          AND ingredient_verification_status = 'manufacturer'
          AND image_verification_status = 'manufacturer'
          AND formula_evidence_tier = 'manufacturer_current_exact'
          AND is_complete_food
          AND catalog_exclusion_reason IS NULL) <> 1 THEN
      RAISE EXCEPTION
        'Duplicate Wellness serving row changed: %', pair.duplicate_cache_key;
    END IF;

    IF (SELECT count(*) FROM public.catalog_observations
        WHERE formula_id = pair.duplicate_formula_id) <>
        pair.expected_duplicate_observations
       OR (SELECT count(*) FROM public.catalog_skus
           WHERE formula_id = pair.duplicate_formula_id) <>
          pair.expected_duplicate_skus
       OR (SELECT count(*) FROM public.catalog_field_evidence
           WHERE formula_id = pair.duplicate_formula_id) <>
          pair.expected_duplicate_field_evidence
       OR (SELECT count(*) FROM public.catalog_gap_evidence_extractions
           WHERE promoted_formula_id = pair.duplicate_formula_id) <>
          pair.expected_duplicate_gap_extractions THEN
      RAISE EXCEPTION
        'Mutable Wellness duplicate references changed: %',
        pair.duplicate_formula_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.catalog_census_formula_members
      WHERE formula_id = pair.duplicate_formula_id
    ) OR EXISTS (
      SELECT 1 FROM public.catalog_census_members
      WHERE formula_id = pair.duplicate_formula_id
    ) OR EXISTS (
      SELECT 1 FROM public.catalog_formula_identity_conflicts
      WHERE canonical_formula_id = pair.duplicate_formula_id
         OR conflicting_formula_id = pair.duplicate_formula_id
    ) OR EXISTS (
      SELECT 1 FROM public.catalog_verified_product_search_aliases
      WHERE cache_key = pair.duplicate_cache_key
    ) THEN
      RAISE EXCEPTION
        'Wellness duplicate acquired immutable/conflicting references: %',
        pair.duplicate_formula_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_formula_aliases alias
      WHERE alias.alias_formula_key = pair.duplicate_formula_key
        AND alias.formula_id NOT IN (
          pair.canonical_formula_id,
          pair.duplicate_formula_id
        )
    ) THEN
      RAISE EXCEPTION
        'Wellness duplicate formula key already aliases another formula: %',
        pair.duplicate_formula_key;
    END IF;
  END LOOP;
END
$preconditions$;

UPDATE public.catalog_formula_aliases alias
SET formula_id = pair.canonical_formula_id,
    updated_at = now()
FROM wellness_exact_official_duplicate_resolved pair
WHERE alias.formula_id = pair.duplicate_formula_id;

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
  pair.duplicate_formula_key,
  pair.canonical_formula_id,
  pair.duplicate_identity_hash,
  'manual_review',
  pair.normalized_source_url,
  jsonb_build_object(
    'source', 'wellness_exact_official_duplicate_consolidation_20260805',
    'duplicate_formula_id', pair.duplicate_formula_id,
    'canonical_formula_id', pair.canonical_formula_id,
    'duplicate_cache_key', pair.duplicate_cache_key,
    'canonical_cache_key', pair.canonical_cache_key,
    'identity_evidence',
      'same exact official PDP, title, ingredients, image, species, life stage, recipe, and manufacturer-current evidence',
    'ingredient_or_image_rewrite', FALSE,
    'package_size_is_sku_only', TRUE,
    'reviewed_at', now()
  ),
  now()
FROM wellness_exact_official_duplicate_resolved pair
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now()
WHERE public.catalog_formula_aliases.formula_id IN (
  EXCLUDED.formula_id,
  (EXCLUDED.metadata ->> 'duplicate_formula_id')::BIGINT
);

UPDATE public.catalog_observations observation
SET formula_id = pair.canonical_formula_id
FROM wellness_exact_official_duplicate_resolved pair
WHERE observation.formula_id = pair.duplicate_formula_id;

UPDATE public.catalog_skus sku
SET formula_id = pair.canonical_formula_id,
    updated_at = now()
FROM wellness_exact_official_duplicate_resolved pair
WHERE sku.formula_id = pair.duplicate_formula_id;

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
  pair.canonical_formula_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash
FROM wellness_exact_official_duplicate_resolved pair
JOIN public.catalog_field_evidence evidence
  ON evidence.formula_id = pair.duplicate_formula_id
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted,
  observed_at = greatest(
    public.catalog_field_evidence.observed_at,
    EXCLUDED.observed_at
  );

DELETE FROM public.catalog_field_evidence evidence
USING wellness_exact_official_duplicate_resolved pair
WHERE evidence.formula_id = pair.duplicate_formula_id;

UPDATE public.catalog_gap_evidence_extractions extraction
SET promoted_formula_id = pair.canonical_formula_id,
    updated_at = now()
FROM wellness_exact_official_duplicate_resolved pair
WHERE extraction.promoted_formula_id = pair.duplicate_formula_id;

UPDATE public.catalog_manual_evidence_reviews review
SET formula_id = pair.canonical_formula_id,
    corrected_formula_key = pair.canonical_formula_key,
    updated_at = now()
FROM wellness_exact_official_duplicate_resolved pair
WHERE review.formula_id = pair.duplicate_formula_id;

UPDATE public.catalog_formulas canonical
SET formula_version_provenance =
      coalesce(canonical.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'exact_duplicate_consolidated_at', now(),
        'exact_duplicate_consolidated_formula_id', pair.duplicate_formula_id,
        'exact_duplicate_consolidated_cache_key', pair.duplicate_cache_key,
        'exact_duplicate_identity_evidence',
          'same official PDP, package, ingredients, image, and protected identity fields'
      ),
    updated_at = now()
FROM wellness_exact_official_duplicate_resolved pair
WHERE canonical.id = pair.canonical_formula_id;

UPDATE public.catalog_formulas duplicate
SET active = FALSE,
    absent_since = coalesce(duplicate.absent_since, now()),
    verification_status = 'quarantined',
    promoted_cache_key = NULL,
    promoted_at = NULL,
    formula_version_provenance =
      coalesce(duplicate.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'superseded_by_formula_id', pair.canonical_formula_id,
        'superseded_by_cache_key', pair.canonical_cache_key,
        'supersession_reason', 'exact_duplicate_official_formula',
        'superseded_at', now()
      ),
    updated_at = now()
FROM wellness_exact_official_duplicate_resolved pair
WHERE duplicate.id = pair.duplicate_formula_id;

-- This is a transactional reconciliation repair, not a product import. The
-- redundant serving cache is retained for provenance but made ineligible for
-- search/census so only the richer canonical dry identity can resolve.
UPDATE public.product_data duplicate
SET catalog_exclusion_reason = 'duplicate_exact_verified_formula_alias',
    expires_at = least(coalesce(duplicate.expires_at, now()), now()),
    formula_version_provenance =
      coalesce(duplicate.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'superseded_by_cache_key', pair.canonical_cache_key,
        'supersession_reason', 'exact_duplicate_official_formula',
        'superseded_at', now()
      ),
    updated_at = now()
FROM wellness_exact_official_duplicate_resolved pair
WHERE duplicate.cache_key = pair.duplicate_cache_key;

DO $postconditions$
DECLARE
  pair wellness_exact_official_duplicate_resolved%ROWTYPE;
BEGIN
  FOR pair IN SELECT * FROM wellness_exact_official_duplicate_resolved
  LOOP
    IF (SELECT count(*) FROM public.catalog_formulas formula
        WHERE lower(regexp_replace(formula.source_url, '/+$', '')) =
              pair.normalized_source_url
          AND formula.active
          AND formula.verification_status = 'verified'
          AND formula.formula_evidence_tier = 'manufacturer_current_exact'
          AND formula.ingredient_verification_status = 'manufacturer'
          AND formula.image_verification_status = 'manufacturer') <> 1 THEN
      RAISE EXCEPTION
        'Wellness consolidation did not leave one active exact formula: %',
        pair.normalized_source_url;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.catalog_observations
      WHERE formula_id = pair.duplicate_formula_id
    ) OR EXISTS (
      SELECT 1 FROM public.catalog_skus
      WHERE formula_id = pair.duplicate_formula_id
    ) OR EXISTS (
      SELECT 1 FROM public.catalog_field_evidence
      WHERE formula_id = pair.duplicate_formula_id
    ) OR EXISTS (
      SELECT 1 FROM public.catalog_gap_evidence_extractions
      WHERE promoted_formula_id = pair.duplicate_formula_id
    ) OR EXISTS (
      SELECT 1 FROM public.catalog_manual_evidence_reviews
      WHERE formula_id = pair.duplicate_formula_id
    ) THEN
      RAISE EXCEPTION
        'Wellness consolidation left mutable duplicate references: %',
        pair.duplicate_formula_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.catalog_formula_aliases alias
      WHERE alias.alias_formula_key = pair.duplicate_formula_key
        AND alias.formula_id = pair.canonical_formula_id
        AND alias.metadata ->> 'source' =
            'wellness_exact_official_duplicate_consolidation_20260805'
    ) THEN
      RAISE EXCEPTION
        'Wellness duplicate formula alias was not preserved: %',
        pair.duplicate_formula_key;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.catalog_formulas duplicate
      WHERE duplicate.id = pair.duplicate_formula_id
        AND (
          duplicate.active
          OR duplicate.verification_status <> 'quarantined'
          OR duplicate.promoted_cache_key IS NOT NULL
          OR duplicate.promoted_at IS NOT NULL
        )
    ) THEN
      RAISE EXCEPTION
        'Wellness duplicate formula was not safely quarantined: %',
        pair.duplicate_formula_id;
    END IF;

    IF (SELECT count(*) FROM public.product_data serving
        WHERE lower(regexp_replace(serving.source_url, '/+$', '')) =
              pair.normalized_source_url
          AND serving.catalog_exclusion_reason IS NULL
          AND (serving.expires_at IS NULL OR serving.expires_at > now())
          AND serving.source_quality = 'manufacturer'
          AND serving.ingredient_verification_status = 'manufacturer'
          AND serving.image_verification_status = 'manufacturer') <> 1 THEN
      RAISE EXCEPTION
        'Wellness consolidation did not leave one eligible serving row: %',
        pair.normalized_source_url;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.product_data duplicate
      WHERE duplicate.cache_key = pair.duplicate_cache_key
        AND duplicate.catalog_exclusion_reason =
            'duplicate_exact_verified_formula_alias'
        AND duplicate.expires_at <= now()
        AND duplicate.formula_version_provenance ->>
            'superseded_by_cache_key' = pair.canonical_cache_key
    ) THEN
      RAISE EXCEPTION
        'Wellness duplicate serving cache was not safely retired: %',
        pair.duplicate_cache_key;
    END IF;
  END LOOP;
END
$postconditions$;
