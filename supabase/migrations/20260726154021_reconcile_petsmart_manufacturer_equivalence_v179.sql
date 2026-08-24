-- Reconcile five exact PetSmart packages with their current manufacturer
-- formula. Each pair has one exact GTIN, identical normalized full ingredients,
-- compatible species/recipe identity, and accepted PetSmart package evidence.
-- PetSmart remains SKU/provenance evidence; the manufacturer serving row owns
-- deterministic barcode lookup. No ingredient statement is overwritten.

CREATE TEMP TABLE reviewed_petsmart_manufacturer_equivalence_v179 (
  gtin text PRIMARY KEY,
  retailer_cache_key text NOT NULL,
  manufacturer_cache_key text NOT NULL,
  source_url text NOT NULL,
  old_alias_formula_key text NOT NULL,
  formula_key text NOT NULL,
  manufacturer text NOT NULL,
  brand text NOT NULL,
  product_line text NOT NULL,
  pet_type text NOT NULL,
  life_stage text NOT NULL,
  food_form text NOT NULL,
  flavor text NOT NULL,
  diet_condition text NOT NULL,
  ingredient_hash text NOT NULL
) ON COMMIT DROP;

INSERT INTO reviewed_petsmart_manufacturer_equivalence_v179 VALUES
(
  '030111519658',
  'petsmart-retail-catalog:030111519658',
  'royal-canin-mars-petcare:343883:030111519658',
  'https://www.petsmart.com/dog/food/dry-food/royal-canin-breed-health-nutrition-chihuahua-breed-specific-aging-8-senior-dog-dry-food-2-5-lb-78534.html',
  'royal canin|royal canin|chihuahua adult 8 dry dog food|dog|senior|dry||',
  'royal canin|royal canin|chihuahua adult 8 dry dog food|dog|senior|dry||',
  'royal canin',
  'royal canin',
  'chihuahua adult 8 dry dog food',
  'dog',
  'senior',
  'dry',
  '',
  '',
  'fc3d07db7c17da4aa249025afbe4f057a1ff1a15a43c31b4d8e20412292c23d0'
),
(
  '052742078298',
  'petsmart-retail-catalog:052742078298',
  'hill-s-pet-nutrition:052742078298',
  'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/hill-s-prescription-diet-i-d-digestive-care-kitten-dry-cat-food-4-lb-90518.html',
  'hill s prescription diet|hill s prescription diet|i d with|cat|kitten|dry|chicken|',
  'hill s prescription diet|hill s prescription diet|i d with|cat|kitten|dry|chicken|',
  'hill s prescription diet',
  'hill s prescription diet',
  'i d with',
  'cat',
  'kitten',
  'dry',
  'chicken',
  '',
  'c9fdb922420c5a930580faf9bdec93087d6e66d647aa8a87c8119b459c72c6de'
),
(
  '052742068398',
  'petsmart-retail-catalog:052742068398',
  'hill-s-pet-nutrition:052742068398',
  'https://www.petsmart.com/cat/food-and-treats/canned-food/hill-s-science-diet-indoor-adult-wet-cat-food-medley-5-5-oz-81523.html',
  'hill s science diet|hill s science diet|adult indoor|cat|adult|unknown|salmon and vegetable medley|',
  'hill s science diet|hill s science diet|adult indoor|cat|adult|wet|salmon and vegetable medley|',
  'hill s science diet',
  'hill s science diet',
  'adult indoor',
  'cat',
  'adult',
  'wet',
  'salmon and vegetable medley',
  '',
  '9b01e0ce55c07445cf15f92f9279c101f90296abec01905d6d9b61e904944787'
),
(
  '052742661209',
  'petsmart-retail-catalog:052742661209',
  'hill-s-pet-nutrition:052742661209',
  'https://www.petsmart.com/cat/food-and-treats/canned-food/hill-s-science-diet-cat-wet-food-adult-ocean-fish-5-5-oz-81769.html',
  'hill s science diet|hill s science diet|adult ocean fish entree|cat|adult|unknown||',
  'hill s science diet|hill s science diet|adult ocean fish entree|cat|adult|wet||',
  'hill s science diet',
  'hill s science diet',
  'adult ocean fish entree',
  'cat',
  'adult',
  'wet',
  '',
  '',
  '03e9c98fdd9b838a84342e5ae3106602435421a6e7ed59dec8682fdfa55b9225'
),
(
  '052742046341',
  'petsmart-retail-catalog:052742046341',
  'hill-s-pet-nutrition:052742046341',
  'https://www.petsmart.com/cat/food-and-treats/canned-food/hill-s-science-diet-adult-wet-cat-food-sensitve-stomach-and-skin-dinner-2-8-oz-74801.html',
  'hill s science diet|hill s science diet|adult sensitive stomach and skin|cat|adult|unknown|salmon and tuna dinner|',
  'hill s science diet|hill s science diet|adult sensitive stomach and skin|cat|adult|wet|salmon and tuna dinner|',
  'hill s science diet',
  'hill s science diet',
  'adult sensitive stomach and skin',
  'cat',
  'adult',
  'wet',
  'salmon and tuna dinner',
  '',
  '993d63086846ee56bc19795cbd342a509113b9eb48859e9f4289f6255de04a93'
);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)
  INTO v_count
  FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
  JOIN public.catalog_observations observation
    ON observation.source_external_id = reviewed.retailer_cache_key
   AND observation.gtin = reviewed.gtin
   AND observation.source_url = reviewed.source_url
   AND observation.source_authority = 'retailer_verified'
   AND (
     observation.validation_status = 'accepted'
     OR (
       observation.validation_status = 'quarantined'
       AND observation.validation_reasons =
         ARRAY['gtin_hard_identity_conflict']::text[]
     )
   )
   AND observation.is_complete_food
   AND btrim(observation.front_image_url) <> ''
   AND length(observation.ingredient_text) >= 500
   AND NOT public.catalog_has_unbalanced_parentheses(
     observation.ingredient_text
   )
   AND NOT public.catalog_has_ingredient_ocr_artifacts(
     observation.ingredient_text
   )
   AND encode(
     digest(
       public.catalog_normalize_ingredient_evidence(
         observation.ingredient_text
       ),
       'sha256'
     ),
     'hex'
   ) = reviewed.ingredient_hash
  JOIN public.product_data manufacturer_product
    ON manufacturer_product.cache_key = reviewed.manufacturer_cache_key
   AND manufacturer_product.pet_type = reviewed.pet_type
   AND manufacturer_product.ingredient_verification_status = 'manufacturer'
   AND manufacturer_product.image_verification_status = 'manufacturer'
   AND manufacturer_product.formula_evidence_tier =
     'manufacturer_current_exact'
   AND encode(
     digest(
       public.catalog_normalize_ingredient_evidence(
         manufacturer_product.ingredient_text
       ),
       'sha256'
     ),
     'hex'
   ) = reviewed.ingredient_hash;

  IF v_count <> 5 THEN
    RAISE EXCEPTION
      'Expected five exact manufacturer-equivalent PetSmart packages, found %',
      v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
    JOIN public.catalog_formulas formula
      ON formula.formula_key = reviewed.formula_key
    WHERE NULLIF(btrim(formula.ingredient_text), '') IS NOT NULL
      AND encode(
        digest(
          public.catalog_normalize_ingredient_evidence(
            formula.ingredient_text
          ),
          'sha256'
        ),
        'hex'
      ) <> reviewed.ingredient_hash
  ) THEN
    RAISE EXCEPTION
      'An existing formula key contains a different ingredient version';
  END IF;
END
$$;

-- Repair product-local identity fields that were previously unknown or
-- category-derived. Product title, official page, exact GTIN, and PetSmart
-- package evidence agree on these fields.
UPDATE public.product_data product
SET
  product_line = reviewed.product_line,
  pet_type = reviewed.pet_type,
  life_stage = reviewed.life_stage,
  food_form = reviewed.food_form,
  flavor = NULLIF(reviewed.flavor, ''),
  formula_version_provenance =
    coalesce(product.formula_version_provenance, '{}'::jsonb)
    || jsonb_build_object(
      'identity_repair', jsonb_build_object(
        'reviewed_at', '2026-07-27',
        'wave', 'v179',
        'gtin', reviewed.gtin,
        'pet_type', reviewed.pet_type,
        'life_stage', reviewed.life_stage,
        'food_form', reviewed.food_form,
        'flavor', reviewed.flavor,
        'ingredients_changed', false,
        'image_changed', false
      )
    ),
  updated_at = now()
FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
WHERE product.cache_key = reviewed.manufacturer_cache_key
  AND encode(
    digest(
      public.catalog_normalize_ingredient_evidence(product.ingredient_text),
      'sha256'
    ),
    'hex'
  ) = reviewed.ingredient_hash;

CREATE TEMP TABLE promoted_petsmart_manufacturer_equivalence_v179 (
  gtin text PRIMARY KEY,
  formula_id bigint NOT NULL
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.catalog_formulas (
    formula_key, manufacturer, brand, product_name, product_line, pet_type,
    life_stage, food_form, flavor, diet_condition, is_complete_food,
    complete_food_evidence, ingredient_text, ingredients, front_image_url,
    source_url, source_authority, ingredient_verification_status,
    image_verification_status, protected_terms, verification_status, active,
    is_popular_brand, first_observed_at, last_observed_at,
    promoted_cache_key, promoted_at, identity_hash, formula_evidence_tier,
    formula_version_provenance, created_at, updated_at
  )
  SELECT
    reviewed.formula_key,
    reviewed.manufacturer,
    reviewed.brand,
    product.product_name,
    reviewed.product_line,
    reviewed.pet_type,
    reviewed.life_stage,
    reviewed.food_form,
    reviewed.flavor,
    reviewed.diet_condition,
    true,
    'Exact current manufacturer product page and accepted PetSmart package evidence agree on GTIN, complete ordered ingredients, species, recipe, and package identity.',
    product.ingredient_text,
    product.ingredients,
    product.image_url,
    product.source_url,
    'manufacturer',
    'manufacturer',
    'manufacturer',
    array_remove(ARRAY[
      reviewed.brand,
      reviewed.product_line,
      reviewed.pet_type,
      reviewed.life_stage,
      reviewed.food_form,
      NULLIF(reviewed.flavor, ''),
      NULLIF(reviewed.diet_condition, '')
    ]::text[], NULL),
    'verified',
    true,
    true,
    coalesce(product.scraped_at, now()),
    now(),
    reviewed.manufacturer_cache_key,
    now(),
    encode(digest(reviewed.formula_key, 'sha256'), 'hex'),
    'manufacturer_current_exact',
    coalesce(product.formula_version_provenance, '{}'::jsonb)
      || jsonb_build_object(
        'version_status', 'manufacturer_current',
        'manufacturer_current_equivalence', true,
        'source_url', product.source_url,
        'captured_at', coalesce(product.scraped_at, now()),
        'package_gtin', reviewed.gtin,
        'ingredient_text_hash', reviewed.ingredient_hash,
        'petsmart_package_url', reviewed.source_url,
        'petsmart_review_wave', 'v179'
      ),
    now(),
    now()
  FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
  JOIN public.product_data product
    ON product.cache_key = reviewed.manufacturer_cache_key
  ON CONFLICT (formula_key) DO UPDATE
  SET
    manufacturer = excluded.manufacturer,
    brand = excluded.brand,
    product_name = excluded.product_name,
    product_line = excluded.product_line,
    pet_type = excluded.pet_type,
    life_stage = excluded.life_stage,
    food_form = excluded.food_form,
    flavor = excluded.flavor,
    diet_condition = excluded.diet_condition,
    is_complete_food = true,
    complete_food_evidence = excluded.complete_food_evidence,
    ingredient_text = excluded.ingredient_text,
    ingredients = excluded.ingredients,
    front_image_url = excluded.front_image_url,
    source_url = excluded.source_url,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = excluded.protected_terms,
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    last_observed_at = now(),
    promoted_cache_key = excluded.promoted_cache_key,
    promoted_at = now(),
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance = excluded.formula_version_provenance,
    updated_at = now()
  RETURNING id, formula_key
)
INSERT INTO promoted_petsmart_manufacturer_equivalence_v179 (
  gtin, formula_id
)
SELECT reviewed.gtin, inserted.id
FROM inserted
JOIN reviewed_petsmart_manufacturer_equivalence_v179 reviewed
  ON reviewed.formula_key = inserted.formula_key;

INSERT INTO public.catalog_skus (
  formula_id, gtin, package_size, package_count, source_slug,
  source_external_id, source_url, active, first_observed_at,
  last_observed_at, updated_at
)
SELECT
  promoted.formula_id,
  observation.gtin,
  observation.package_size,
  1,
  'petsmart-retail-catalog-current-v179',
  observation.source_external_id,
  observation.source_url,
  true,
  observation.observed_at,
  observation.observed_at,
  now()
FROM promoted_petsmart_manufacturer_equivalence_v179 promoted
JOIN reviewed_petsmart_manufacturer_equivalence_v179 reviewed
  ON reviewed.gtin = promoted.gtin
JOIN public.catalog_observations observation
  ON observation.source_external_id = reviewed.retailer_cache_key
 AND observation.gtin = reviewed.gtin
 AND observation.source_url = reviewed.source_url
 AND (
   observation.validation_status = 'accepted'
   OR (
     observation.validation_status = 'quarantined'
     AND observation.validation_reasons =
       ARRAY['gtin_hard_identity_conflict']::text[]
   )
 )
ON CONFLICT (source_slug, source_external_id, gtin, package_size)
DO UPDATE SET
  formula_id = excluded.formula_id,
  source_url = excluded.source_url,
  active = true,
  last_observed_at = excluded.last_observed_at,
  updated_at = now();

UPDATE public.catalog_observations observation
SET
  formula_id = promoted.formula_id,
  validation_status = 'accepted',
  validation_reasons = ARRAY[]::text[],
  formula_evidence_tier = 'manufacturer_current_exact',
  formula_version_provenance =
    coalesce(observation.formula_version_provenance, '{}'::jsonb)
    || jsonb_build_object(
      'version_status', 'manufacturer_current_equivalent_package',
      'manufacturer_current_equivalence', true,
      'manufacturer_cache_key', reviewed.manufacturer_cache_key,
      'package_gtin', reviewed.gtin,
      'ingredient_text_hash', reviewed.ingredient_hash,
      'reviewed_at', '2026-07-27',
      'review_wave', 'v179'
    )
FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
JOIN promoted_petsmart_manufacturer_equivalence_v179 promoted
  ON promoted.gtin = reviewed.gtin
WHERE observation.source_external_id = reviewed.retailer_cache_key
  AND observation.gtin = reviewed.gtin
  AND observation.source_url = reviewed.source_url;

-- Keep the exact PetSmart package page as provenance without creating a second
-- deterministic barcode owner for the identical formula version.
UPDATE public.product_data product
SET
  gtin = NULL,
  product_line = reviewed.product_line,
  pet_type = reviewed.pet_type,
  life_stage = reviewed.life_stage,
  food_form = reviewed.food_form,
  flavor = NULLIF(reviewed.flavor, ''),
  formula_evidence_tier = 'retailer_web_version',
  formula_version_provenance =
    coalesce(product.formula_version_provenance, '{}'::jsonb)
    || jsonb_build_object(
      'version_status', 'manufacturer_current_equivalent_package',
      'manufacturer_current_equivalence', true,
      'superseded_gtin', reviewed.gtin,
      'gtin_owner_cache_key', reviewed.manufacturer_cache_key,
      'gtin_resolution_policy', 'prefer_manufacturer_current',
      'ingredient_hash_equality_verified', true,
      'reviewed_at', '2026-07-27',
      'review_wave', 'v179'
    ),
  updated_at = now()
FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
WHERE product.cache_key = reviewed.retailer_cache_key
  AND product.source_url = reviewed.source_url
  AND encode(
    digest(
      public.catalog_normalize_ingredient_evidence(product.ingredient_text),
      'sha256'
    ),
    'hex'
  ) = reviewed.ingredient_hash;

-- Preserve stale census-key continuity while routing to the exact repaired
-- current formula. These aliases never cross an ingredient version.
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, created_at, updated_at
)
SELECT
  reviewed.old_alias_formula_key,
  promoted.formula_id,
  encode(digest(reviewed.old_alias_formula_key, 'sha256'), 'hex'),
  'manual_review',
  reviewed.source_url,
  jsonb_build_object(
    'reviewed_at', '2026-07-27',
    'review_wave', 'v179',
    'review_method', 'exact_manufacturer_retailer_package_equivalence',
    'gtin', reviewed.gtin,
    'manufacturer_cache_key', reviewed.manufacturer_cache_key,
    'formula_key', reviewed.formula_key,
    'ingredient_text_hash', reviewed.ingredient_hash,
    'formula_version_policy',
      'identical current manufacturer version; ingredients never overwritten'
  ),
  now(),
  now()
FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
JOIN promoted_petsmart_manufacturer_equivalence_v179 promoted
  ON promoted.gtin = reviewed.gtin
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = excluded.formula_id,
  identity_hash = excluded.identity_hash,
  match_reason = excluded.match_reason,
  source_url = excluded.source_url,
  metadata = excluded.metadata,
  updated_at = now();

DO $$
DECLARE
  v_formula_count integer;
  v_observation_count integer;
  v_barcode_owner_count integer;
BEGIN
  SELECT count(*)
  INTO v_formula_count
  FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
  JOIN public.catalog_formulas formula
    ON formula.formula_key = reviewed.formula_key
   AND formula.verification_status = 'verified'
   AND formula.active
   AND formula.formula_evidence_tier = 'manufacturer_current_exact'
   AND formula.promoted_cache_key = reviewed.manufacturer_cache_key
   AND encode(
     digest(
       public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
       'sha256'
     ),
     'hex'
   ) = reviewed.ingredient_hash;

  SELECT count(*)
  INTO v_observation_count
  FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
  JOIN public.catalog_observations observation
    ON observation.source_external_id = reviewed.retailer_cache_key
   AND observation.gtin = reviewed.gtin
   AND observation.formula_id IS NOT NULL
   AND observation.validation_status = 'accepted'
   AND observation.formula_evidence_tier =
     'manufacturer_current_exact';

  SELECT count(*)
  INTO v_barcode_owner_count
  FROM reviewed_petsmart_manufacturer_equivalence_v179 reviewed
  WHERE (
    SELECT count(DISTINCT product.cache_key)
    FROM public.product_data product
    WHERE ltrim(
      regexp_replace(coalesce(product.gtin, ''), '[^0-9]', '', 'g'),
      '0'
    ) = ltrim(reviewed.gtin, '0')
      AND public.catalog_quality_state(
        product.pet_type, product.is_complete_food,
        product.catalog_exclusion_reason, product.ingredient_text,
        coalesce(array_length(product.ingredients, 1), 0),
        product.ingredient_verification_status, product.image_url,
        product.image_verification_status, product.source_url,
        product.expires_at
      ) = 'verified_ready'
  ) = 1;

  IF v_formula_count <> 5
    OR v_observation_count <> 5
    OR v_barcode_owner_count <> 5
  THEN
    RAISE EXCEPTION
      'v179 equivalence failed: formulas %, observations %, barcode owners %',
      v_formula_count,
      v_observation_count,
      v_barcode_owner_count;
  END IF;
END
$$;
