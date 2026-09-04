-- Current official Wellness Complete Health+ and CORE+ package labels expose
-- three exact adult dry-dog formula versions and three 4 lb UPCs. The current
-- manufacturer formulas already exist, but two have an unknown food form,
-- CORE+ has an unknown life stage, current UPCs are absent, and exact current
-- names rank older retailer formula versions. Reconcile only the exact current
-- package versions. Older retailer UPCs keep their own ingredient formulas.

CREATE TEMP TABLE wellness_plus_current_targets (
  formula_id BIGINT PRIMARY KEY,
  cache_key TEXT NOT NULL,
  old_formula_key TEXT NOT NULL,
  canonical_formula_key TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_line TEXT NOT NULL,
  flavor TEXT NOT NULL,
  source_url TEXT NOT NULL,
  front_image_url TEXT NOT NULL,
  back_label_url TEXT NOT NULL,
  gtin TEXT NOT NULL,
  package_size TEXT NOT NULL,
  ingredient_hash TEXT NOT NULL,
  complete_food_evidence TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO wellness_plus_current_targets (
  formula_id,
  cache_key,
  old_formula_key,
  canonical_formula_key,
  product_name,
  product_line,
  flavor,
  source_url,
  front_image_url,
  back_label_url,
  gtin,
  package_size,
  ingredient_hash,
  complete_food_evidence
)
SELECT
  formula.id,
  exact.cache_key,
  formula.formula_key,
  exact.canonical_formula_key,
  exact.product_name,
  exact.product_line,
  exact.flavor,
  exact.source_url,
  exact.front_image_url,
  exact.back_label_url,
  exact.gtin,
  '4 lb',
  exact.ingredient_hash,
  exact.complete_food_evidence
FROM (
  VALUES
    (
      'wellness-pet-company:wellness wellness complete health chicken oatmeal',
      'wellness pet company|wellness|complete health plus|dog|adult|dry|chicken and oatmeal|',
      'Wellness Complete Health+ Adult Chicken & Oatmeal Recipe Dry Dog Food',
      'Complete Health+',
      'Chicken & Oatmeal',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-plus-chicken-oatmeal/',
      'https://images.salsify.com/image/upload/s--Q2tN5aZp--/w_500/bdyma0tsykpv17g2slgq.jpg',
      'https://images.salsify.com/image/upload/s--emblGc_R--/w_500/szt9dm5kerc0iufwssai.jpg',
      '076344210000',
      'e223662dfd4e62187951d0f118f7bdde3cc5c0a46bca4539cdf4649bd9942eeb',
      'Wellness Complete Health+ Chicken & Oatmeal Recipe is formulated to meet the nutritional levels established by the AAFCO Dog Food Nutrient Profiles for maintenance.'
    ),
    (
      'wellness-pet-company:wellness wellness complete health whitefish sweet potato',
      'wellness pet company|wellness|complete health plus|dog|adult|dry|whitefish and sweet potato|',
      'Wellness Complete Health+ Adult Whitefish & Sweet Potato Recipe Dry Dog Food',
      'Complete Health+',
      'Whitefish & Sweet Potato',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-plus-whitefish-sweet-potato/',
      'https://images.salsify.com/image/upload/s--Hj1Sgu1J--/w_500/iuc9r9cva863ly3u5w1n.jpg',
      'https://images.salsify.com/image/upload/s--421qLMTT--/w_500/pu4pgevgri1ssobpb7kj.jpg',
      '076344210017',
      '7e10e4ca026b11da61ba409210480e3782a23977583a80a7bd3bded4b9804ffe',
      'Wellness Complete Health+ Whitefish & Sweet Potato Recipe is formulated to meet the nutritional levels established by the AAFCO Dog Food Nutrient Profiles for maintenance.'
    ),
    (
      'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe',
      'wellness pet company|wellness|core plus sensitive skin and stomach|dog|adult|dry|salmon and rice recipe|',
      'Wellness CORE+ Sensitive Skin & Stomach Adult Salmon & Rice Recipe Dry Dog Food',
      'CORE+ Sensitive Skin & Stomach',
      'Salmon & Rice Recipe',
      'https://www.wellnesspetfood.com/product-catalog/wellness-core-plus-dog-wholesome-grains-sensitive-skin-stomach-salmon-rice/',
      'https://images.salsify.com/image/upload/s--Nmrpz56Q--/w_500/cj9zhl72kkbq3mfcpokd.jpg',
      'https://images.salsify.com/image/upload/s--eE7vWTOx--/w_500/dxgrgic0xhaznfib5h6s.png',
      '076344182177',
      'b7bcf2243133d93aceda8bb829c20b80cf2e447a5630eb4aaaa182dc2c914563',
      'Wellness CORE+ Sensitive Skin & Stomach Salmon & Rice Recipe is formulated to meet the nutritional levels established by the AAFCO Dog Food Nutrient Profiles for maintenance.'
    )
) exact(
  cache_key,
  canonical_formula_key,
  product_name,
  product_line,
  flavor,
  source_url,
  front_image_url,
  back_label_url,
  gtin,
  ingredient_hash,
  complete_food_evidence
)
JOIN public.catalog_formulas formula
  ON formula.promoted_cache_key = exact.cache_key
 AND formula.source_url = exact.source_url
 AND formula.source_authority = 'manufacturer'
 AND formula.ingredient_verification_status = 'manufacturer'
 AND formula.image_verification_status = 'manufacturer'
 AND formula.verification_status = 'verified'
 AND formula.active
 AND formula.pet_type = 'dog'
 AND formula.is_complete_food
 AND formula.front_image_url = exact.front_image_url
 AND encode(
       digest(
         public.catalog_normalize_ingredient_evidence(
           formula.ingredient_text
         ),
         'sha256'
       ),
       'hex'
     ) = exact.ingredient_hash;

DO $$
DECLARE
  v_target_count INTEGER;
  v_formula_key_collision_count INTEGER;
  v_gtin_collision_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_target_count
  FROM wellness_plus_current_targets;

  SELECT count(*)
  INTO v_formula_key_collision_count
  FROM wellness_plus_current_targets target
  JOIN public.catalog_formulas formula
    ON formula.formula_key = target.canonical_formula_key
   AND formula.id <> target.formula_id;

  SELECT count(*)
  INTO v_gtin_collision_count
  FROM wellness_plus_current_targets target
  LEFT JOIN public.catalog_skus sku
    ON sku.gtin = target.gtin
   AND sku.active
  LEFT JOIN public.product_data product
    ON product.gtin = target.gtin
   AND product.cache_key <> target.cache_key
  WHERE sku.id IS NOT NULL
     OR product.id IS NOT NULL;

  IF v_target_count <> 3
      OR v_formula_key_collision_count <> 0
      OR v_gtin_collision_count <> 0 THEN
    RAISE EXCEPTION
      'Wellness current package precondition failed: targets %, formula key collisions %, GTIN collisions %',
      v_target_count,
      v_formula_key_collision_count,
      v_gtin_collision_count;
  END IF;
END;
$$;

CREATE TEMP TABLE wellness_plus_exact_duplicate_formulas (
  canonical_formula_id BIGINT NOT NULL,
  duplicate_formula_id BIGINT PRIMARY KEY,
  duplicate_formula_key TEXT NOT NULL,
  source_url TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO wellness_plus_exact_duplicate_formulas (
  canonical_formula_id,
  duplicate_formula_id,
  duplicate_formula_key,
  source_url
)
SELECT
  target.formula_id,
  duplicate.id,
  duplicate.formula_key,
  target.source_url
FROM wellness_plus_current_targets target
JOIN public.catalog_formulas canonical
  ON canonical.id = target.formula_id
JOIN public.catalog_formulas duplicate
  ON duplicate.source_url = target.source_url
 AND duplicate.id <> target.formula_id
 AND duplicate.active
 AND duplicate.source_authority = 'manufacturer'
 AND duplicate.verification_status = 'verified'
 AND duplicate.front_image_url = target.front_image_url
 AND duplicate.pet_type = 'dog'
 AND public.catalog_normalize_ingredient_evidence(
       duplicate.ingredient_text
     ) =
     public.catalog_normalize_ingredient_evidence(
       canonical.ingredient_text
     );

DO $$
DECLARE
  v_duplicate_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_duplicate_count
  FROM wellness_plus_exact_duplicate_formulas;

  IF v_duplicate_count <> 3 THEN
    RAISE EXCEPTION
      'Wellness exact official duplicate precondition failed: expected 3, found %',
      v_duplicate_count;
  END IF;
END;
$$;

-- Preserve every previous canonical key before changing the current identity.
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
  alias.alias_formula_key,
  alias.formula_id,
  encode(digest(alias.alias_formula_key, 'sha256'), 'hex'),
  'manual_review',
  alias.source_url,
  jsonb_build_object(
    'exact_formula_identity', TRUE,
    'formula_version', 'current_plus_package',
    'reviewed_at', '2026-07-26',
    'migration',
      '20260726153500_reconcile_wellness_plus_current_package_versions'
  ),
  now()
FROM (
  SELECT
    target.old_formula_key AS alias_formula_key,
    target.formula_id,
    target.source_url
  FROM wellness_plus_current_targets target

  UNION ALL

  SELECT
    duplicate.duplicate_formula_key,
    duplicate.canonical_formula_id,
    duplicate.source_url
  FROM wellness_plus_exact_duplicate_formulas duplicate
) alias
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Move exact official duplicate evidence to the promoted canonical formulas.
UPDATE public.catalog_observations observation
SET formula_id = duplicate.canonical_formula_id
FROM wellness_plus_exact_duplicate_formulas duplicate
WHERE observation.formula_id = duplicate.duplicate_formula_id;

UPDATE public.catalog_skus sku
SET
  formula_id = duplicate.canonical_formula_id,
  updated_at = now()
FROM wellness_plus_exact_duplicate_formulas duplicate
WHERE sku.formula_id = duplicate.duplicate_formula_id;

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
  DISTINCT ON (
    duplicate.canonical_formula_id,
    evidence.field_name,
    evidence.source_url,
    evidence.content_hash
  )
  duplicate.canonical_formula_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash
FROM wellness_plus_exact_duplicate_formulas duplicate
JOIN public.catalog_field_evidence evidence
  ON evidence.formula_id = duplicate.duplicate_formula_id
ORDER BY
  duplicate.canonical_formula_id,
  evidence.field_name,
  evidence.source_url,
  evidence.content_hash,
  evidence.observed_at DESC,
  evidence.id DESC
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted
    OR EXCLUDED.accepted;

DELETE FROM public.catalog_field_evidence evidence
USING wellness_plus_exact_duplicate_formulas duplicate
WHERE evidence.formula_id = duplicate.duplicate_formula_id;

UPDATE public.catalog_manual_evidence_reviews review
SET
  formula_id = duplicate.canonical_formula_id,
  corrected_formula_key = target.canonical_formula_key,
  updated_at = now()
FROM wellness_plus_exact_duplicate_formulas duplicate
JOIN wellness_plus_current_targets target
  ON target.formula_id = duplicate.canonical_formula_id
WHERE review.formula_id = duplicate.duplicate_formula_id;

UPDATE public.catalog_formulas duplicate
SET
  active = FALSE,
  absent_since = COALESCE(duplicate.absent_since, now()),
  verification_status = 'quarantined',
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = now()
FROM wellness_plus_exact_duplicate_formulas merge
WHERE duplicate.id = merge.duplicate_formula_id;

-- Correct the current official identities and serving rows.
UPDATE public.catalog_formulas formula
SET
  formula_key = target.canonical_formula_key,
  manufacturer = 'Wellness Pet Company',
  brand = 'Wellness',
  product_name = target.product_name,
  product_line = target.product_line,
  pet_type = 'dog',
  life_stage = 'adult',
  food_form = 'dry',
  flavor = target.flavor,
  complete_food_evidence = target.complete_food_evidence,
  identity_hash = encode(
    digest(target.canonical_formula_key, 'sha256'),
    'hex'
  ),
  updated_at = now()
FROM wellness_plus_current_targets target
WHERE formula.id = target.formula_id;

UPDATE public.product_data product
SET
  product_name = target.product_name,
  brand = 'Wellness',
  product_line = target.product_line,
  pet_type = 'dog',
  life_stage = 'adult',
  food_form = 'dry',
  flavor = target.flavor,
  gtin = target.gtin,
  package_size = target.package_size,
  source = 'wellness-pet-company',
  source_url = target.source_url,
  source_quality = 'manufacturer',
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  image_url = target.front_image_url,
  is_complete_food = TRUE,
  catalog_exclusion_reason = NULL,
  verified_at = now(),
  updated_at = now()
FROM wellness_plus_current_targets target
WHERE product.cache_key = target.cache_key;

UPDATE public.catalog_observations observation
SET
  product_name = target.product_name,
  product_line = target.product_line,
  pet_type = 'dog',
  life_stage = 'adult',
  food_form = 'dry',
  flavor = target.flavor,
  gtin = target.gtin,
  package_size = target.package_size,
  front_image_url = target.front_image_url,
  validation_status = 'accepted',
  validation_reasons = ARRAY[]::TEXT[]
FROM wellness_plus_current_targets target
WHERE observation.formula_id = target.formula_id
  AND observation.source_url = target.source_url
  AND observation.source_authority = 'manufacturer';

INSERT INTO public.catalog_skus (
  formula_id,
  gtin,
  package_size,
  package_count,
  source_slug,
  source_external_id,
  source_url,
  active,
  first_observed_at,
  last_observed_at,
  created_at,
  updated_at
)
SELECT
  target.formula_id,
  target.gtin,
  target.package_size,
  1,
  'wellness-pet-company-official-label',
  target.gtin,
  target.source_url,
  TRUE,
  now(),
  now(),
  now(),
  now()
FROM wellness_plus_current_targets target
ON CONFLICT (
  source_slug,
  source_external_id,
  gtin,
  package_size
)
DO UPDATE SET
  formula_id = EXCLUDED.formula_id,
  active = TRUE,
  source_url = EXCLUDED.source_url,
  last_observed_at = now(),
  updated_at = now();

-- Record exact package-label evidence for the version-specific UPC, adult
-- maintenance statement, food form, ingredients, and matching current image.
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
  target.formula_id,
  observation.id,
  field.field_name,
  to_jsonb(field.field_value),
  field.evidence_url,
  'manufacturer',
  TRUE,
  now(),
  encode(
    digest(
      target.canonical_formula_key || '|' ||
      field.field_name || '|' ||
      field.field_value || '|' ||
      field.evidence_url,
      'sha256'
    ),
    'hex'
  )
FROM wellness_plus_current_targets target
JOIN LATERAL (
  SELECT candidate.id
  FROM public.catalog_observations candidate
  WHERE candidate.formula_id = target.formula_id
    AND candidate.source_url = target.source_url
    AND candidate.source_authority = 'manufacturer'
  ORDER BY candidate.observed_at DESC, candidate.id DESC
  LIMIT 1
) observation
  ON TRUE
CROSS JOIN LATERAL (
  VALUES
    ('gtin', target.gtin, target.back_label_url),
    ('package_size', target.package_size, target.front_image_url),
    ('food_form', 'dry', target.front_image_url),
    ('life_stage', 'adult', target.front_image_url),
    (
      'complete_food_evidence',
      target.complete_food_evidence,
      target.back_label_url
    ),
    (
      'ingredient_text',
      (
        SELECT formula.ingredient_text
        FROM public.catalog_formulas formula
        WHERE formula.id = target.formula_id
      ),
      target.back_label_url
    ),
    ('front_image_url', target.front_image_url, target.source_url)
) field(field_name, field_value, evidence_url)
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = TRUE,
  observed_at = EXCLUDED.observed_at;

-- Reconcile only exact, current retailer product identities. The older
-- retailer package formulas remain separate because their ingredient evidence
-- differs from the current package labels.
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
  alias.alias_formula_key,
  target.formula_id,
  encode(digest(alias.alias_formula_key, 'sha256'), 'hex'),
  'manual_review',
  alias.source_url,
  jsonb_build_object(
    'exact_formula_identity', TRUE,
    'formula_version', 'current_plus_package',
    'species_boundary', 'dog',
    'life_stage_boundary', 'adult',
    'food_form_boundary', 'dry',
    'recipe_boundary', target.flavor,
    'reviewed_at', '2026-07-26',
    'migration',
      '20260726153500_reconcile_wellness_plus_current_package_versions'
  ),
  now()
FROM (
  VALUES
    (
      'wellness pet company|wellness|wellness complete health adult chicken and oatmeal dry dog food|dog|adult|dry||',
      'wellness-pet-company:wellness wellness complete health chicken oatmeal',
      'https://www.chewy.com/wellness-complete-health-adult/dp/4044414'
    ),
    (
      'wellness pet company|wellness|wellness complete health adult whitefish and sweet potato dry dog food|dog|adult|dry||',
      'wellness-pet-company:wellness wellness complete health whitefish sweet potato',
      'https://www.chewy.com/wellness-complete-health-adult/dp/4044430'
    ),
    (
      'wellness pet company|wellness|wellness core sensitive skin stomach salmon rice dry dog food|dog|unknown|dry||',
      'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe',
      'https://www.walmart.com/ip/Wellness-CORE-Sensitive-Skin-Stomach-Salmon-Rice-Dry-Dog-Food-4-lb/19959122083'
    )
) alias(alias_formula_key, cache_key, source_url)
JOIN wellness_plus_current_targets target
  ON target.cache_key = alias.cache_key
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance
)
SELECT
  alias.cache_key,
  alias.alias_text,
  public.normalize_verified_product_search_query(alias.alias_text),
  target.source_url,
  'manufacturer',
  now(),
  jsonb_build_object(
    'exact_formula_identity', TRUE,
    'formula_version', 'current_plus_package',
    'species_boundary', 'dog',
    'life_stage_boundary', 'adult',
    'food_form_boundary', 'dry',
    'recipe_boundary', target.flavor,
    'package_label_gtin', target.gtin,
    'reviewed_at', '2026-07-26'
  )
FROM (
  VALUES
    (
      'wellness-pet-company:wellness wellness complete health chicken oatmeal',
      'Wellness Complete Health+ Adult Chicken & Oatmeal Dry Dog Food'
    ),
    (
      'wellness-pet-company:wellness wellness complete health whitefish sweet potato',
      'Wellness Complete Health+ Adult Whitefish & Sweet Potato Dry Dog Food'
    ),
    (
      'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe',
      'Wellness CORE+ Sensitive Skin & Stomach Adult Dry Dog Food Salmon & Rice'
    )
) alias(cache_key, alias_text)
JOIN wellness_plus_current_targets target
  ON target.cache_key = alias.cache_key
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET
  cache_key = EXCLUDED.cache_key,
  alias_text = EXCLUDED.alias_text,
  source_url = EXCLUDED.source_url,
  source_authority = EXCLUDED.source_authority,
  evidence_observed_at = EXCLUDED.evidence_observed_at,
  provenance = EXCLUDED.provenance,
  updated_at = now();

-- Quarantine two malformed duplicate Chewy identities for the current chicken
-- PDP after their observations are attached to the exact current formula.
UPDATE public.catalog_observations observation
SET formula_id = target.formula_id
FROM wellness_plus_current_targets target
JOIN public.catalog_formulas duplicate
  ON duplicate.source_url =
    'https://www.chewy.com/wellness-complete-health-adult/dp/4044414'
 AND duplicate.id <> target.formula_id
WHERE target.cache_key =
    'wellness-pet-company:wellness wellness complete health chicken oatmeal'
  AND observation.formula_id = duplicate.id;

UPDATE public.catalog_formulas duplicate
SET
  active = FALSE,
  absent_since = COALESCE(duplicate.absent_since, now()),
  verification_status = 'quarantined',
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = now()
WHERE duplicate.source_url =
    'https://www.chewy.com/wellness-complete-health-adult/dp/4044414'
  AND duplicate.source_authority = 'unverified'
  AND duplicate.product_name ILIKE '%Chicken%Oatmeal%';
