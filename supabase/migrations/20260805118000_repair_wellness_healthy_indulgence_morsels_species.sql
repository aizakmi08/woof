-- Repair two Wellness Healthy Indulgence cat formulas that an older extractor
-- classified as dog products after reading a site-wide Dog Food navigation
-- link. The 2026-08-05 official recrawl resolves both product-local
-- breadcrumbs to `For Cats`. Ingredients and images are immutable guards in
-- this migration: only identity metadata is corrected.
--
-- Turkey & Duck also has two ledger rows for the same official PDP, package,
-- ingredients, and image. Preserve the promoted/history-linked row as the
-- survivor, move only mutable child evidence from the unreferenced legacy row,
-- and quarantine that legacy row reversibly.

CREATE TEMP TABLE wellness_healthy_indulgence_species_payload (
  source_url TEXT PRIMARY KEY,
  serving_cache_key TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  flavor TEXT NOT NULL,
  expected_ingredient_count INTEGER NOT NULL,
  expected_ingredient_md5 TEXT NOT NULL,
  expected_ingredient_hash TEXT NOT NULL,
  expected_front_image_url TEXT NOT NULL,
  official_fetched_at TIMESTAMPTZ NOT NULL,
  survivor_old_formula_key TEXT UNIQUE NOT NULL,
  target_formula_key TEXT UNIQUE NOT NULL,
  target_identity_hash TEXT UNIQUE NOT NULL,
  duplicate_old_formula_key TEXT UNIQUE,
  expected_survivor_observations INTEGER NOT NULL,
  expected_survivor_skus INTEGER NOT NULL,
  expected_survivor_field_evidence INTEGER NOT NULL,
  expected_duplicate_observations INTEGER NOT NULL,
  expected_duplicate_skus INTEGER NOT NULL,
  expected_duplicate_field_evidence INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO wellness_healthy_indulgence_species_payload VALUES
(
  'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-healthy-indulgence-morsels-chicken-turkey/',
  'wellness-pet-company:wellness wellness complete health healthy indulgence morsels with chicken turkey in savory sauce',
  'Wellness Complete Health Healthy Indulgence Morsels with Chicken & Turkey in Savory Sauce',
  'Chicken & Turkey in Savory Sauce',
  37,
  '19cfdc2538bb83a9b2a12afd00c65aaf',
  '9fe043dd2b019241015c2ef6a634f54d3067be1951518445eada5f9519300200',
  'https://images.salsify.com/image/upload/s--2Bt21tBO--/w_500/q7wfn5pkxjwk906jcv5d.jpg',
  '2026-08-05T13:00:00.741Z',
  'wellness|wellness|wellness complete health healthy indulgence morsels with|dog|unknown|wet|chicken and turkey in savory sauce|',
  'wellness pet company|wellness|complete health healthy indulgence morsels with|cat|unknown|wet|chicken and turkey in savory sauce|',
  'c2b5548ee0dad4745961d39f6e2375ea97fc9001c1bcf5dc4e26beccb6738e09',
  NULL,
  1,
  1,
  2,
  0,
  0,
  0
),
(
  'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-healthy-indulgence-morsels-turkey-duck/',
  'wellness-pet-company:wellness wellness complete health healthy indulgence morsels with turkey duck in savory sauce',
  'Wellness Complete Health Healthy Indulgence Morsels with Turkey & Duck in Savory Sauce',
  'Turkey & Duck in Savory Sauce',
  38,
  '9f9ad1f9516d1aff8a98a4c38633bc1f',
  '9db563ece5894ea0be47c3a4f281f6d42d1c0bf48a67ae745fd7410e497a71f6',
  'https://images.salsify.com/image/upload/s--GAd7qQEL--/w_500/netjdym0hlviynitxewy.jpg',
  '2026-08-05T13:00:00.948Z',
  'wellness pet company|wellness|wellness complete health healthy indulgence morsels with turkey and duck in savory sauce|dog|unknown|wet|turkey and duck in savory sauce|',
  'wellness pet company|wellness|complete health healthy indulgence morsels with|cat|unknown|wet|turkey and duck in savory sauce|',
  '44d4bc5aa19ccf13d9798e0be008ed1f9fe859f924c01624cd53ad6b2eb5e78b',
  'wellness|wellness|complete health healthy indulgence morsels with|dog|unknown|wet|turkey and duck in savory sauce|',
  1,
  1,
  2,
  1,
  1,
  2
);

CREATE TEMP TABLE wellness_healthy_indulgence_species_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  serving.id AS serving_id,
  survivor.id AS survivor_formula_id,
  survivor.identity_hash AS survivor_old_identity_hash,
  duplicate.id AS duplicate_formula_id,
  duplicate.identity_hash AS duplicate_old_identity_hash
FROM wellness_healthy_indulgence_species_payload payload
JOIN public.product_data serving
  ON serving.cache_key = payload.serving_cache_key
 AND lower(btrim(serving.product_name)) = lower(payload.product_name)
 AND lower(btrim(serving.brand)) = 'wellness'
 AND lower(btrim(serving.pet_type)) = 'dog'
 AND coalesce(lower(btrim(serving.life_stage)), 'unknown') = 'unknown'
 AND lower(btrim(serving.food_form)) = 'wet'
 AND regexp_replace(lower(btrim(serving.flavor)), '\s*&\s*', ' and ', 'g') =
     regexp_replace(lower(btrim(payload.flavor)), '\s*&\s*', ' and ', 'g')
 AND lower(regexp_replace(serving.source_url, '/+$', '')) =
     lower(regexp_replace(payload.source_url, '/+$', ''))
 AND serving.ingredient_count = payload.expected_ingredient_count
 AND md5(coalesce(serving.ingredient_text, '')) = payload.expected_ingredient_md5
 AND serving.formula_version_provenance ->> 'ingredient_text_hash' =
     payload.expected_ingredient_hash
 AND serving.image_url = payload.expected_front_image_url
 AND serving.source_quality = 'manufacturer'
 AND serving.ingredient_verification_status = 'manufacturer'
 AND serving.image_verification_status = 'manufacturer'
 AND serving.formula_evidence_tier = 'manufacturer_current_exact'
 AND serving.is_complete_food
 AND serving.catalog_exclusion_reason IS NULL
JOIN public.catalog_formulas survivor
  ON survivor.formula_key = payload.survivor_old_formula_key
 AND survivor.active
 AND survivor.verification_status = 'verified'
 AND survivor.formula_evidence_tier = 'manufacturer_current_exact'
 AND survivor.source_authority = 'manufacturer'
 AND survivor.ingredient_verification_status = 'manufacturer'
 AND survivor.image_verification_status = 'manufacturer'
 AND survivor.is_complete_food
 AND lower(btrim(survivor.brand)) = 'wellness'
 AND lower(btrim(survivor.pet_type)) = 'dog'
 AND coalesce(lower(btrim(survivor.life_stage)), 'unknown') = 'unknown'
 AND lower(btrim(survivor.food_form)) = 'wet'
 AND regexp_replace(lower(btrim(survivor.flavor)), '\s*&\s*', ' and ', 'g') =
     regexp_replace(lower(btrim(payload.flavor)), '\s*&\s*', ' and ', 'g')
 AND lower(btrim(survivor.product_name)) = lower(payload.product_name)
 AND lower(regexp_replace(survivor.source_url, '/+$', '')) =
     lower(regexp_replace(payload.source_url, '/+$', ''))
 AND cardinality(survivor.ingredients) = payload.expected_ingredient_count
 AND md5(coalesce(survivor.ingredient_text, '')) = payload.expected_ingredient_md5
 AND survivor.front_image_url = payload.expected_front_image_url
LEFT JOIN public.catalog_formulas duplicate
  ON duplicate.formula_key = payload.duplicate_old_formula_key
 AND duplicate.active
 AND duplicate.verification_status = 'verified'
 AND duplicate.formula_evidence_tier = 'manufacturer_current_exact'
 AND duplicate.source_authority = 'manufacturer'
 AND duplicate.ingredient_verification_status = 'manufacturer'
 AND duplicate.image_verification_status = 'manufacturer'
 AND duplicate.is_complete_food
 AND lower(btrim(duplicate.brand)) = 'wellness'
 AND lower(btrim(duplicate.pet_type)) = 'dog'
 AND coalesce(lower(btrim(duplicate.life_stage)), 'unknown') = 'unknown'
 AND lower(btrim(duplicate.food_form)) = 'wet'
 AND regexp_replace(lower(btrim(duplicate.flavor)), '\s*&\s*', ' and ', 'g') =
     regexp_replace(lower(btrim(payload.flavor)), '\s*&\s*', ' and ', 'g')
 AND lower(btrim(duplicate.product_name)) = lower(payload.product_name)
 AND lower(regexp_replace(duplicate.source_url, '/+$', '')) =
     lower(regexp_replace(payload.source_url, '/+$', ''))
 AND cardinality(duplicate.ingredients) = payload.expected_ingredient_count
 AND md5(coalesce(duplicate.ingredient_text, '')) = payload.expected_ingredient_md5
 AND duplicate.front_image_url = payload.expected_front_image_url;

DO $preconditions$
DECLARE
  target wellness_healthy_indulgence_species_resolved%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM wellness_healthy_indulgence_species_resolved) <> 2 THEN
    RAISE EXCEPTION
      'Wellness Healthy Indulgence species repair no longer resolves exactly two products';
  END IF;

  FOR target IN SELECT * FROM wellness_healthy_indulgence_species_resolved
  LOOP
    IF target.target_identity_hash <>
       encode(extensions.digest(target.target_formula_key, 'sha256'), 'hex') THEN
      RAISE EXCEPTION
        'Wellness target identity hash is invalid: %', target.target_formula_key;
    END IF;

    IF (target.duplicate_old_formula_key IS NULL AND
        target.duplicate_formula_id IS NOT NULL) OR
       (target.duplicate_old_formula_key IS NOT NULL AND
        target.duplicate_formula_id IS NULL) THEN
      RAISE EXCEPTION
        'Wellness exact duplicate resolution changed: %', target.source_url;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_formulas collision
      WHERE collision.id <> target.survivor_formula_id
        AND collision.id IS DISTINCT FROM target.duplicate_formula_id
        AND (
          collision.formula_key = target.target_formula_key
          OR (collision.active AND
              collision.identity_hash = target.target_identity_hash)
        )
    ) THEN
      RAISE EXCEPTION
        'Wellness corrected identity belongs to another formula: %',
        target.target_formula_key;
    END IF;

    IF (SELECT count(*) FROM public.catalog_observations
        WHERE formula_id = target.survivor_formula_id) <>
       target.expected_survivor_observations OR
       (SELECT count(*) FROM public.catalog_skus
        WHERE formula_id = target.survivor_formula_id) <>
       target.expected_survivor_skus OR
       (SELECT count(*) FROM public.catalog_field_evidence
        WHERE formula_id = target.survivor_formula_id) <>
       target.expected_survivor_field_evidence THEN
      RAISE EXCEPTION
        'Wellness survivor mutable evidence changed: %', target.source_url;
    END IF;

    IF target.duplicate_formula_id IS NOT NULL THEN
      IF (SELECT count(*) FROM public.catalog_observations
          WHERE formula_id = target.duplicate_formula_id) <>
         target.expected_duplicate_observations OR
         (SELECT count(*) FROM public.catalog_skus
          WHERE formula_id = target.duplicate_formula_id) <>
         target.expected_duplicate_skus OR
         (SELECT count(*) FROM public.catalog_field_evidence
          WHERE formula_id = target.duplicate_formula_id) <>
         target.expected_duplicate_field_evidence THEN
        RAISE EXCEPTION
          'Wellness duplicate mutable evidence changed: %', target.source_url;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.catalog_census_members
        WHERE formula_id = target.duplicate_formula_id
      ) OR EXISTS (
        SELECT 1 FROM public.catalog_census_formula_members
        WHERE formula_id = target.duplicate_formula_id
      ) OR EXISTS (
        SELECT 1 FROM public.catalog_formula_identity_conflicts
        WHERE canonical_formula_id = target.duplicate_formula_id
           OR conflicting_formula_id = target.duplicate_formula_id
      ) OR EXISTS (
        SELECT 1 FROM public.catalog_gap_evidence_extractions
        WHERE promoted_formula_id = target.duplicate_formula_id
      ) OR EXISTS (
        SELECT 1 FROM public.catalog_manual_evidence_reviews
        WHERE formula_id = target.duplicate_formula_id
      ) OR EXISTS (
        SELECT 1 FROM public.catalog_formula_aliases
        WHERE formula_id = target.duplicate_formula_id
      ) THEN
        RAISE EXCEPTION
          'Wellness duplicate acquired historical/conflicting references: %',
          target.duplicate_formula_id;
      END IF;
    END IF;

    IF (SELECT count(*)
        FROM public.catalog_field_evidence evidence
        WHERE evidence.formula_id IN (
          target.survivor_formula_id,
          target.duplicate_formula_id
        )
          AND evidence.field_name = 'ingredient_text'
          AND evidence.source_url = target.source_url
          AND evidence.source_authority = 'manufacturer'
          AND evidence.accepted
          AND evidence.field_value #>> '{}' = (
            SELECT ingredient_text
            FROM public.product_data
            WHERE id = target.serving_id
          )) <>
       CASE WHEN target.duplicate_formula_id IS NULL THEN 1 ELSE 2 END THEN
      RAISE EXCEPTION
        'Wellness exact ingredient evidence changed: %', target.source_url;
    END IF;

    IF (SELECT count(*)
        FROM public.catalog_field_evidence evidence
        WHERE evidence.formula_id IN (
          target.survivor_formula_id,
          target.duplicate_formula_id
        )
          AND evidence.field_name = 'front_image_url'
          AND evidence.source_url = target.source_url
          AND evidence.source_authority = 'manufacturer'
          AND evidence.accepted
          AND evidence.field_value #>> '{}' = target.expected_front_image_url) <>
       CASE WHEN target.duplicate_formula_id IS NULL THEN 1 ELSE 2 END THEN
      RAISE EXCEPTION
        'Wellness exact image evidence changed: %', target.source_url;
    END IF;
  END LOOP;
END;
$preconditions$;

-- Preserve the legacy Turkey & Duck identity as a reviewed alias to the
-- history-linked survivor before quarantining the duplicate ledger row.
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
  target.duplicate_old_formula_key,
  target.survivor_formula_id,
  target.duplicate_old_identity_hash,
  'manual_review',
  target.source_url,
  jsonb_build_object(
    'source', 'wellness_healthy_indulgence_species_repair_20260805',
    'identity_evidence',
      'same exact official PDP, title, ingredients, image, flavor, and wet cat package breadcrumb',
    'duplicate_formula_id', target.duplicate_formula_id,
    'survivor_formula_id', target.survivor_formula_id,
    'species_correction', 'dog_to_cat',
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM wellness_healthy_indulgence_species_resolved target
WHERE target.duplicate_formula_id IS NOT NULL
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now()
WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

UPDATE public.catalog_observations observation
SET formula_id = target.survivor_formula_id
FROM wellness_healthy_indulgence_species_resolved target
WHERE target.duplicate_formula_id IS NOT NULL
  AND observation.formula_id = target.duplicate_formula_id;

UPDATE public.catalog_skus sku
SET formula_id = target.survivor_formula_id,
    updated_at = now()
FROM wellness_healthy_indulgence_species_resolved target
WHERE target.duplicate_formula_id IS NOT NULL
  AND sku.formula_id = target.duplicate_formula_id;

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
  target.survivor_formula_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash
FROM wellness_healthy_indulgence_species_resolved target
JOIN public.catalog_field_evidence evidence
  ON evidence.formula_id = target.duplicate_formula_id
WHERE target.duplicate_formula_id IS NOT NULL
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted,
  observed_at = greatest(
    public.catalog_field_evidence.observed_at,
    EXCLUDED.observed_at
  );

DELETE FROM public.catalog_field_evidence evidence
USING wellness_healthy_indulgence_species_resolved target
WHERE target.duplicate_formula_id IS NOT NULL
  AND evidence.formula_id = target.duplicate_formula_id;

UPDATE public.catalog_formulas duplicate
SET active = FALSE,
    absent_since = coalesce(duplicate.absent_since, now()),
    verification_status = 'quarantined',
    promoted_cache_key = NULL,
    promoted_at = NULL,
    formula_version_provenance =
      coalesce(duplicate.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'superseded_by_formula_id', target.survivor_formula_id,
        'superseded_by_cache_key', target.serving_cache_key,
        'supersession_reason',
          'exact_duplicate_official_formula_after_species_correction',
        'superseded_at', now()
      ),
    updated_at = now()
FROM wellness_healthy_indulgence_species_resolved target
WHERE target.duplicate_formula_id IS NOT NULL
  AND duplicate.id = target.duplicate_formula_id;

UPDATE public.product_data serving
SET pet_type = 'cat',
    product_line = 'Complete Health Healthy Indulgence Morsels with',
    scraped_at = greatest(
      coalesce(serving.scraped_at, target.official_fetched_at),
      target.official_fetched_at
    ),
    verified_at = greatest(
      coalesce(serving.verified_at, target.official_fetched_at),
      target.official_fetched_at
    ),
    expires_at = greatest(
      serving.expires_at,
      target.official_fetched_at + interval '90 days'
    ),
    formula_version_provenance =
      coalesce(serving.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'identity_correction', 'official_product_breadcrumb_dog_to_cat',
        'identity_corrected_at', now(),
        'identity_evidence_url', target.source_url,
        'identity_evidence_fetched_at', target.official_fetched_at,
        'previous_pet_type', 'dog',
        'pet_type', 'cat',
        'product_line', 'Complete Health Healthy Indulgence Morsels with',
        'ingredient_or_image_rewrite', FALSE
      ),
    updated_at = now()
FROM wellness_healthy_indulgence_species_resolved target
WHERE serving.id = target.serving_id;

UPDATE public.catalog_formulas survivor
SET formula_key = target.target_formula_key,
    identity_hash = target.target_identity_hash,
    manufacturer = 'Wellness Pet Company',
    brand = 'Wellness',
    product_line = 'Complete Health Healthy Indulgence Morsels with',
    pet_type = 'cat',
    life_stage = 'unknown',
    food_form = 'wet',
    flavor = target.flavor,
    protected_terms = ARRAY(
      SELECT DISTINCT term
      FROM unnest(
        ARRAY[
          'Wellness',
          'Complete Health',
          'Healthy Indulgence',
          'Morsels',
          target.flavor,
          'cat',
          'wet'
        ]::TEXT[]
      ) term
      WHERE NULLIF(btrim(term), '') IS NOT NULL
    ),
    last_observed_at = greatest(
      survivor.last_observed_at,
      target.official_fetched_at
    ),
    promoted_cache_key = target.serving_cache_key,
    promoted_at = coalesce(survivor.promoted_at, now()),
    formula_version_provenance =
      coalesce(survivor.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'identity_correction', 'official_product_breadcrumb_dog_to_cat',
        'identity_corrected_at', now(),
        'identity_evidence_url', target.source_url,
        'identity_evidence_fetched_at', target.official_fetched_at,
        'previous_formula_key', target.survivor_old_formula_key,
        'previous_pet_type', 'dog',
        'pet_type', 'cat',
        'product_line', 'Complete Health Healthy Indulgence Morsels with',
        'ingredient_or_image_rewrite', FALSE
      ),
    updated_at = now()
FROM wellness_healthy_indulgence_species_resolved target
WHERE survivor.id = target.survivor_formula_id;

UPDATE public.catalog_observations observation
SET manufacturer = 'Wellness Pet Company',
    brand = 'Wellness',
    product_line = 'Complete Health Healthy Indulgence Morsels with',
    pet_type = 'cat',
    life_stage = 'unknown',
    food_form = 'wet',
    flavor = target.flavor,
    formula_version_provenance =
      coalesce(observation.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'identity_correction', 'official_product_breadcrumb_dog_to_cat',
        'identity_corrected_at', now(),
        'identity_evidence_url', target.source_url,
        'identity_evidence_fetched_at', target.official_fetched_at,
        'previous_pet_type', 'dog',
        'pet_type', 'cat',
        'product_line', 'Complete Health Healthy Indulgence Morsels with',
        'ingredient_or_image_rewrite', FALSE
      )
FROM wellness_healthy_indulgence_species_resolved target
WHERE observation.formula_id = target.survivor_formula_id
  AND lower(regexp_replace(observation.source_url, '/+$', '')) =
      lower(regexp_replace(target.source_url, '/+$', ''));

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
  target.survivor_formula_id,
  NULL,
  field.field_name,
  to_jsonb(field.field_value),
  target.source_url,
  'manufacturer',
  TRUE,
  target.official_fetched_at,
  encode(
    extensions.digest(
      concat_ws(
        '|',
        target.survivor_formula_id::TEXT,
        'wellness_healthy_indulgence_species_repair_20260805',
        field.field_name,
        field.field_value,
        target.source_url,
        target.official_fetched_at::TEXT
      ),
      'sha256'
    ),
    'hex'
  )
FROM wellness_healthy_indulgence_species_resolved target
CROSS JOIN LATERAL (
  VALUES
    ('pet_type'::TEXT, 'cat'::TEXT),
    ('product_line'::TEXT,
     'Complete Health Healthy Indulgence Morsels with'::TEXT)
) field(field_name, field_value)
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = TRUE,
  observed_at = EXCLUDED.observed_at;

DO $postconditions$
DECLARE
  target wellness_healthy_indulgence_species_resolved%ROWTYPE;
  top_cache_key TEXT;
BEGIN
  FOR target IN SELECT * FROM wellness_healthy_indulgence_species_resolved
  LOOP
    IF (SELECT count(*)
        FROM public.product_data serving
        WHERE serving.id = target.serving_id
          AND serving.cache_key = target.serving_cache_key
          AND serving.pet_type = 'cat'
          AND serving.product_line =
              'Complete Health Healthy Indulgence Morsels with'
          AND serving.food_form = 'wet'
          AND serving.ingredient_count = target.expected_ingredient_count
          AND md5(coalesce(serving.ingredient_text, '')) =
              target.expected_ingredient_md5
          AND serving.formula_version_provenance ->> 'ingredient_text_hash' =
              target.expected_ingredient_hash
          AND serving.image_url = target.expected_front_image_url
          AND serving.source_url = target.source_url
          AND serving.catalog_exclusion_reason IS NULL) <> 1 THEN
      RAISE EXCEPTION
        'Wellness serving identity repair failed or changed evidence: %',
        target.serving_cache_key;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.product_data serving
      WHERE lower(regexp_replace(serving.source_url, '/+$', '')) =
            lower(regexp_replace(target.source_url, '/+$', ''))
        AND lower(btrim(serving.pet_type)) = 'dog'
        AND serving.catalog_exclusion_reason IS NULL
        AND (serving.expires_at IS NULL OR serving.expires_at > now())
    ) THEN
      RAISE EXCEPTION
        'Wellness source still exposes an eligible dog serving row: %',
        target.source_url;
    END IF;

    IF (SELECT count(*)
        FROM public.catalog_formulas formula
        WHERE formula.formula_key = target.target_formula_key
          AND formula.identity_hash = target.target_identity_hash
          AND formula.active
          AND formula.verification_status = 'verified'
          AND formula.pet_type = 'cat'
          AND formula.product_line =
              'Complete Health Healthy Indulgence Morsels with'
          AND formula.food_form = 'wet'
          AND formula.promoted_cache_key = target.serving_cache_key
          AND cardinality(formula.ingredients) =
              target.expected_ingredient_count
          AND md5(coalesce(formula.ingredient_text, '')) =
              target.expected_ingredient_md5
          AND formula.front_image_url = target.expected_front_image_url) <> 1 THEN
      RAISE EXCEPTION
        'Wellness corrected canonical formula is invalid: %',
        target.target_formula_key;
    END IF;

    IF (SELECT count(*)
        FROM public.catalog_formulas formula
        WHERE lower(regexp_replace(formula.source_url, '/+$', '')) =
              lower(regexp_replace(target.source_url, '/+$', ''))
          AND formula.active
          AND formula.verification_status = 'verified') <> 1 THEN
      RAISE EXCEPTION
        'Wellness source does not have exactly one active formula: %',
        target.source_url;
    END IF;

    IF (SELECT count(*)
        FROM public.catalog_field_evidence evidence
        WHERE evidence.formula_id = target.survivor_formula_id
          AND evidence.source_url = target.source_url
          AND evidence.source_authority = 'manufacturer'
          AND evidence.accepted
          AND evidence.field_name IN ('pet_type', 'product_line')
          AND (
            (evidence.field_name = 'pet_type' AND
             evidence.field_value #>> '{}' = 'cat')
            OR
            (evidence.field_name = 'product_line' AND
             evidence.field_value #>> '{}' =
             'Complete Health Healthy Indulgence Morsels with')
          )) <> 2 THEN
      RAISE EXCEPTION
        'Wellness corrected identity evidence is incomplete: %',
        target.source_url;
    END IF;

    SELECT result.cache_key
    INTO top_cache_key
    FROM public.search_verified_products(target.product_name, 5) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF top_cache_key IS DISTINCT FROM target.serving_cache_key THEN
      RAISE EXCEPTION
        'Wellness exact search regression for %, expected %, found %',
        target.product_name,
        target.serving_cache_key,
        coalesce(top_cache_key, '<none>');
    END IF;

    IF target.duplicate_formula_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.catalog_observations
        WHERE formula_id = target.duplicate_formula_id
      ) OR EXISTS (
        SELECT 1 FROM public.catalog_skus
        WHERE formula_id = target.duplicate_formula_id
      ) OR EXISTS (
        SELECT 1 FROM public.catalog_field_evidence
        WHERE formula_id = target.duplicate_formula_id
      ) THEN
        RAISE EXCEPTION
          'Wellness duplicate retained mutable child evidence: %',
          target.duplicate_formula_id;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.catalog_formulas duplicate
        WHERE duplicate.id = target.duplicate_formula_id
          AND NOT duplicate.active
          AND duplicate.verification_status = 'quarantined'
          AND duplicate.promoted_cache_key IS NULL
          AND duplicate.formula_version_provenance ->>
              'superseded_by_formula_id' = target.survivor_formula_id::TEXT
      ) OR NOT EXISTS (
        SELECT 1
        FROM public.catalog_formula_aliases alias
        WHERE alias.alias_formula_key = target.duplicate_old_formula_key
          AND alias.formula_id = target.survivor_formula_id
          AND alias.metadata ->> 'species_correction' = 'dog_to_cat'
      ) THEN
        RAISE EXCEPTION
          'Wellness exact duplicate was not safely consolidated: %',
          target.duplicate_formula_id;
      END IF;
    END IF;
  END LOOP;
END;
$postconditions$;
