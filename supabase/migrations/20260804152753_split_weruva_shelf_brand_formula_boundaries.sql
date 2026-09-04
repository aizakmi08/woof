-- Split six exact Weruva-hosted formulas along their shelf-facing brand and
-- visible recipe boundaries. The current official observations, ingredient
-- statements, package images, and GTIN SKUs already exist. This migration
-- repairs only canonical identity/ownership and serving metadata; it never
-- copies a sibling ingredient statement or promotes a retailer-title-only row.

SET lock_timeout = '10s';
SET statement_timeout = '120s';

CREATE TEMP TABLE tmp_weruva_boundary_targets (
  slug TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  gtin TEXT NOT NULL UNIQUE,
  package_size TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  front_image_url TEXT NOT NULL UNIQUE,
  ingredient_hash TEXT NOT NULL UNIQUE,
  ingredient_count INTEGER NOT NULL,
  formula_brand TEXT NOT NULL,
  display_brand TEXT NOT NULL,
  product_name TEXT NOT NULL,
  formula_product_line TEXT NOT NULL,
  display_product_line TEXT NOT NULL,
  pet_type TEXT NOT NULL,
  life_stage TEXT NOT NULL,
  food_form TEXT NOT NULL,
  formula_flavor TEXT NOT NULL,
  display_flavor TEXT NOT NULL,
  new_formula_key TEXT NOT NULL UNIQUE,
  old_formula_key TEXT NOT NULL,
  source_formula_hash TEXT NOT NULL,
  reuse_source_formula BOOLEAN NOT NULL,
  primary_search_alias TEXT NOT NULL UNIQUE,
  protected_terms TEXT[] NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_weruva_boundary_targets (
  slug,
  cache_key,
  gtin,
  package_size,
  source_url,
  front_image_url,
  ingredient_hash,
  ingredient_count,
  formula_brand,
  display_brand,
  product_name,
  formula_product_line,
  display_product_line,
  pet_type,
  life_stage,
  food_form,
  formula_flavor,
  display_flavor,
  new_formula_key,
  old_formula_key,
  source_formula_hash,
  reuse_source_formula,
  primary_search_alias,
  protected_terms
) VALUES
  (
    'awesome_beef_veggies',
    'weruva:810192811069',
    '810192811069',
    '14oz Can / 10pk',
    'https://www.weruva.com/products/awesome-everything-beef-red-rice-recipe-dog-can',
    'https://cdn.shopify.com/s/files/1/0668/0051/7394/files/1069_810192811038_20Awesome_20Everything_20Beef_20_20Red_20Rice_20with_20Veggies_2014oz_702a68e9-c901-4fe4-afc6-9ae6fd2ec23f.png?v=1765493103',
    'ee90826b6df35bd1abdf676576dbed9e22e56d1b972061b7b3944a28b5977d55',
    36,
    'awesome functions',
    'Awesome Functions',
    'Awesome Everything Beef & Red Rice Recipe with Veggies',
    'awesome everything',
    'Awesome Everything',
    'dog',
    'adult',
    'wet',
    'beef and red rice recipe with veggies',
    'Beef & Red Rice Recipe with Veggies',
    'weruva|awesome functions|awesome everything|dog|adult|wet|beef and red rice recipe with veggies|',
    'weruva|weruva|awesome everything|dog|unknown|wet|beef and red rice recipe|',
    'ee90826b6df35bd1abdf676576dbed9e22e56d1b972061b7b3944a28b5977d55',
    TRUE,
    'Awesome Functions Awesome Everything Beef & Red Rice Recipe with Veggies',
    ARRAY[
      'awesome functions', 'awesome everything', 'beef', 'red rice',
      'with veggies', 'dog', 'adult', 'wet'
    ]
  ),
  (
    'awesome_chicken_pumpkin',
    'weruva:810192811014',
    '810192811014',
    '14oz Can / 10pk',
    'https://www.weruva.com/products/awesome-everything-chicken-red-rice-pumpkin-dog-can',
    'https://cdn.shopify.com/s/files/1/0668/0051/7394/files/1014_810192810987_20Awesome_20Everything_20Chicken_20_20Red_20Rice_20with_20Pumpkin_2014oz_cbfba6fa-ece0-4615-9a45-d446065e75dd.png?v=1765493103',
    '769a2dec619e8f89caa6c83097ae43bd3617cd15855c50bbd1e5b2bfbec955b6',
    35,
    'awesome functions',
    'Awesome Functions',
    'Awesome Everything Chicken Breast & Red Rice Recipe with Pumpkin',
    'awesome everything',
    'Awesome Everything',
    'dog',
    'adult',
    'wet',
    'chicken breast and red rice recipe with pumpkin',
    'Chicken Breast & Red Rice Recipe with Pumpkin',
    'weruva|awesome functions|awesome everything|dog|adult|wet|chicken breast and red rice recipe with pumpkin|',
    'weruva|weruva|awesome everything|dog|unknown|unknown|chicken breast and red rice recipe|',
    'ec1cba1f7613b2279f0abd32000321ecdafef4097572669202a5f7431c7dcddb',
    FALSE,
    'Awesome Functions Awesome Everything Chicken Breast & Red Rice Recipe with Pumpkin',
    ARRAY[
      'awesome functions', 'awesome everything', 'chicken breast',
      'red rice', 'with pumpkin', 'dog', 'adult', 'wet'
    ]
  ),
  (
    'awesome_chicken_veggies',
    'weruva:810192811113',
    '810192811113',
    '14oz Can / 10pk',
    'https://www.weruva.com/products/awesome-everything-chicken-red-rice-veggies-dog-can',
    'https://cdn.shopify.com/s/files/1/0668/0051/7394/files/1113_810192811083_20Awesome_20Everything_20Chicken_20_20Red_20Rice_20with_20Veggies_2014oz_126d86e9-32ef-4f16-8d7a-3faddf1cc544.png?v=1765493103',
    'ec1cba1f7613b2279f0abd32000321ecdafef4097572669202a5f7431c7dcddb',
    38,
    'awesome functions',
    'Awesome Functions',
    'Awesome Everything Chicken Breast & Red Rice Recipe with Veggies',
    'awesome everything',
    'Awesome Everything',
    'dog',
    'adult',
    'wet',
    'chicken breast and red rice recipe with veggies',
    'Chicken Breast & Red Rice Recipe with Veggies',
    'weruva|awesome functions|awesome everything|dog|adult|wet|chicken breast and red rice recipe with veggies|',
    'weruva|weruva|awesome everything|dog|unknown|unknown|chicken breast and red rice recipe|',
    'ec1cba1f7613b2279f0abd32000321ecdafef4097572669202a5f7431c7dcddb',
    TRUE,
    'Awesome Functions Awesome Everything Chicken Breast & Red Rice Recipe with Veggies',
    ARRAY[
      'awesome functions', 'awesome everything', 'chicken breast',
      'red rice', 'with veggies', 'dog', 'adult', 'wet'
    ]
  ),
  (
    'pamper_tuna_salmon',
    'weruva:810028247154',
    '810028247154',
    '2.47oz Can / 12pk',
    'https://www.weruva.com/products/pamper-like-paris-tuna-salmon-pate-cat-can',
    'https://cdn.shopify.com/s/files/1/0668/0051/7394/files/810028247079-Pamper-Like-Paris-Tuna-Salmon-Pate-2-47oz_78b6ee4f-1a26-4126-93b9-006fb4e044f8.jpg?v=1737386289',
    '772847e85f3055500c6cc4c57341499227badefe75fa92ce0ef44731975bcc62',
    28,
    'weruva',
    'Weruva',
    'Pamper Like Paris Tuna & Salmon Dinner in a Hydrating Purée',
    'pamper like paris',
    'Pamper Like Paris',
    'cat',
    'adult',
    'wet',
    'tuna and salmon dinner in a hydrating puree',
    'Tuna & Salmon Dinner in a Hydrating Purée',
    'weruva|weruva|pamper like paris|cat|adult|wet|tuna and salmon dinner in a hydrating puree|',
    'weruva|weruva|tuna and salmon dinner in a hydrating puree|cat|unknown|wet|tuna and salmon dinner|',
    '772847e85f3055500c6cc4c57341499227badefe75fa92ce0ef44731975bcc62',
    TRUE,
    'Weruva Pamper Like Paris Tuna & Salmon Dinner in a Hydrating Puree',
    ARRAY[
      'weruva', 'pamper like paris', 'tuna', 'salmon',
      'hydrating puree', 'cat', 'adult', 'wet'
    ]
  ),
  (
    'soulistic_tuna_salmon',
    'weruva:813778019767',
    '813778019767',
    '2.8oz Can / 12pk',
    'https://www.weruva.com/products/soulistic-pate-tuna-salmon-cat-can',
    'https://cdn.shopify.com/s/files/1/0668/0051/7394/files/S0074_813778019828_20Soulistic_20Pat_20Tuna_20_20Salmon_2028oz_20Can_ee1610b7-4fbb-4d13-898f-b6328671cd7f.png?v=1756162001',
    'ded622bef8d00152264d909518deb09e8a10baa5e9ee2888e197017d4adba658',
    28,
    'soulistic',
    'Soulistic',
    'Soulistic Paté Tuna & Salmon Dinner in a Hydrating Purée',
    'soulistic pate',
    'Soulistic Paté',
    'cat',
    'adult',
    'wet',
    'tuna and salmon dinner in a hydrating puree',
    'Tuna & Salmon Dinner in a Hydrating Purée',
    'weruva|soulistic|soulistic pate|cat|adult|wet|tuna and salmon dinner in a hydrating puree|',
    'weruva|weruva|tuna and salmon dinner in a hydrating puree|cat|unknown|wet|tuna and salmon dinner|',
    '772847e85f3055500c6cc4c57341499227badefe75fa92ce0ef44731975bcc62',
    FALSE,
    'Soulistic Pate Tuna & Salmon Dinner in a Hydrating Puree',
    ARRAY[
      'soulistic', 'soulistic pate', 'tuna', 'salmon',
      'hydrating puree', 'cat', 'adult', 'wet'
    ]
  ),
  (
    'press_your_dinner',
    'weruva:weruva weruva cat pat press your dinner chicken breast wet canned food',
    '810028241435',
    '3oz Can / 12pk',
    'https://www.weruva.com/products/press-your-dinner-cat-can',
    'https://cdn.shopify.com/s/files/1/0668/0051/7394/files/1428_810028241442_20Press_20Your_20Dinner_2030oz_20Can_e0137d53-aea4-4017-8f9b-7d0e33442412.png?v=1757263798',
    '2122953bc4fb18f3cf7ea2e35323575b91d83ddc86e974588edb82d1b49a98e3',
    25,
    'weruva',
    'Weruva',
    'Weruva Cat Paté Press Your Dinner Chicken',
    'weruva cat pate',
    'Weruva Cat Paté',
    'cat',
    'adult',
    'wet',
    'press your dinner chicken',
    'Press Your Dinner Chicken',
    'weruva|weruva|weruva cat pate|cat|adult|wet|press your dinner chicken|',
    'weruva|weruva|press your dinner|cat|adult|unknown|press your dinner|',
    '2122953bc4fb18f3cf7ea2e35323575b91d83ddc86e974588edb82d1b49a98e3',
    TRUE,
    'Weruva Cat Pate Press Your Dinner Chicken',
    ARRAY[
      'weruva', 'weruva cat pate', 'press your dinner', 'chicken',
      'cat', 'adult', 'wet'
    ]
  );

DO $target_contract$
BEGIN
  IF (SELECT count(*) FROM tmp_weruva_boundary_targets) <> 6
     OR (SELECT count(DISTINCT ingredient_hash) FROM tmp_weruva_boundary_targets) <> 6
     OR (SELECT count(*) FROM tmp_weruva_boundary_targets WHERE reuse_source_formula) <> 4
  THEN
    RAISE EXCEPTION 'Weruva shelf-brand target contract changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_boundary_targets
    WHERE pet_type NOT IN ('dog', 'cat')
       OR life_stage <> 'adult'
       OR food_form <> 'wet'
       OR formula_brand = ''
       OR new_formula_key NOT LIKE 'weruva|%'
       OR array_length(string_to_array(new_formula_key, '|'), 1) <> 8
  ) THEN
    RAISE EXCEPTION 'Weruva target contains an invalid canonical identity';
  END IF;
END
$target_contract$;

CREATE TEMP TABLE tmp_weruva_boundary_evidence ON COMMIT DROP AS
SELECT
  target.*,
  serving.id AS serving_id,
  serving.ingredients AS serving_ingredients,
  serving.ingredient_text AS serving_ingredient_text,
  serving.verified_at AS serving_verified_at,
  serving.scraped_at AS serving_scraped_at,
  serving.formula_version_provenance AS serving_provenance,
  observation.id AS official_observation_id,
  observation.formula_id AS source_formula_id,
  observation.observed_at AS official_observed_at,
  sku.id AS official_sku_id
FROM tmp_weruva_boundary_targets target
JOIN public.product_data serving
  ON serving.cache_key = target.cache_key
JOIN public.catalog_observations observation
  ON observation.source_url = target.source_url
 AND regexp_replace(COALESCE(observation.gtin, ''), '\D', '', 'g') = target.gtin
 AND observation.validation_status = 'accepted'
 AND observation.source_authority = 'manufacturer'
 AND observation.formula_evidence_tier = 'manufacturer_current_exact'
 AND public.catalog_normalize_ingredient_evidence(observation.ingredient_text) =
     public.catalog_normalize_ingredient_evidence(serving.ingredient_text)
 AND regexp_replace(split_part(observation.front_image_url, '?', 1), '^.*/', '') =
     regexp_replace(split_part(target.front_image_url, '?', 1), '^.*/', '')
JOIN public.catalog_skus sku
  ON sku.source_slug = 'weruva'
 AND sku.source_external_id = concat('weruva:', target.gtin)
 AND sku.source_url = target.source_url
 AND regexp_replace(COALESCE(sku.gtin, ''), '\D', '', 'g') = target.gtin
 AND sku.package_size = target.package_size
 AND sku.active;

DO $evidence_guards$
DECLARE
  v_bad_count INTEGER;
BEGIN
  IF (SELECT count(*) FROM tmp_weruva_boundary_evidence) <> 6
     OR (SELECT count(DISTINCT official_observation_id) FROM tmp_weruva_boundary_evidence) <> 6
     OR (SELECT count(DISTINCT official_sku_id) FROM tmp_weruva_boundary_evidence) <> 6
  THEN
    RAISE EXCEPTION 'Weruva exact official observation/SKU cardinality changed';
  END IF;

  SELECT count(*) INTO v_bad_count
  FROM tmp_weruva_boundary_evidence evidence
  JOIN public.product_data serving ON serving.id = evidence.serving_id
  WHERE serving.source <> 'weruva'
     OR lower(serving.brand) <> 'weruva'
     OR serving.pet_type <> evidence.pet_type
     OR serving.source_url <> evidence.source_url
     OR serving.source_quality <> 'manufacturer'
     OR serving.ingredient_verification_status <> 'manufacturer'
     OR serving.image_verification_status <> 'manufacturer'
     OR serving.formula_evidence_tier <> 'manufacturer_current_exact'
     OR NOT serving.is_complete_food
     OR serving.catalog_exclusion_reason IS NOT NULL
     OR serving.ingredient_count <> evidence.ingredient_count
     OR cardinality(serving.ingredients) <> evidence.ingredient_count
     OR encode(digest(
          public.catalog_normalize_ingredient_evidence(serving.ingredient_text),
          'sha256'
        ), 'hex') <> evidence.ingredient_hash
     OR COALESCE(serving.formula_version_provenance->>'ingredient_text_hash', '') <>
        evidence.ingredient_hash
     OR regexp_replace(split_part(serving.image_url, '?', 1), '^.*/', '') <>
        regexp_replace(split_part(evidence.front_image_url, '?', 1), '^.*/', '')
     OR (
       evidence.slug = 'press_your_dinner'
       AND NULLIF(regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g'), '')
           IS NOT NULL
     )
     OR (
       evidence.slug <> 'press_your_dinner'
       AND regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g') <>
           evidence.gtin
     );
  IF v_bad_count <> 0 THEN
    RAISE EXCEPTION 'Weruva serving evidence preconditions failed for % targets', v_bad_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_boundary_evidence evidence
    JOIN public.catalog_formulas source_formula
      ON source_formula.id = evidence.source_formula_id
    WHERE source_formula.formula_key <> evidence.old_formula_key
       OR NOT source_formula.active
       OR source_formula.verification_status <> 'verified'
       OR source_formula.formula_evidence_tier <> 'manufacturer_current_exact'
       OR source_formula.source_authority <> 'manufacturer'
       OR source_formula.pet_type <> evidence.pet_type
       OR encode(digest(
            public.catalog_normalize_ingredient_evidence(
              source_formula.ingredient_text
            ),
            'sha256'
          ), 'hex') <> evidence.source_formula_hash
       OR (
         evidence.reuse_source_formula
         AND evidence.source_formula_hash <> evidence.ingredient_hash
       )
       OR (
         NOT evidence.reuse_source_formula
         AND evidence.source_formula_hash = evidence.ingredient_hash
       )
  ) THEN
    RAISE EXCEPTION 'Weruva source-formula boundary changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_boundary_evidence evidence
    JOIN public.catalog_skus sku ON sku.id = evidence.official_sku_id
    WHERE sku.formula_id <> evidence.source_formula_id
       OR EXISTS (
         SELECT 1
         FROM public.catalog_skus other
         WHERE other.active
           AND other.id <> sku.id
           AND regexp_replace(COALESCE(other.gtin, ''), '\D', '', 'g') =
               evidence.gtin
           AND other.formula_id <> evidence.source_formula_id
       )
  ) THEN
    RAISE EXCEPTION 'Weruva target GTIN already belongs to an incompatible formula';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_boundary_targets target
    JOIN public.catalog_formulas formula
      ON formula.formula_key = target.new_formula_key
      OR formula.identity_hash = encode(digest(target.new_formula_key, 'sha256'), 'hex')
    WHERE NOT target.reuse_source_formula
       OR formula.formula_key <> target.old_formula_key
  ) THEN
    RAISE EXCEPTION 'Weruva canonical target key already exists or collides';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_boundary_targets target
    JOIN public.catalog_formula_aliases alias
      ON alias.alias_formula_key = target.new_formula_key
  ) THEN
    RAISE EXCEPTION 'Weruva canonical target key is already an alias';
  END IF;
END
$evidence_guards$;

CREATE TEMP TABLE tmp_weruva_duplicate_formulas (
  target_slug TEXT NOT NULL,
  duplicate_formula_key TEXT PRIMARY KEY,
  safe_alias BOOLEAN NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_weruva_duplicate_formulas (
  target_slug,
  duplicate_formula_key,
  safe_alias
) VALUES
  (
    'awesome_beef_veggies',
    'weruva|weruva|awesome everything|dog|unknown|unknown|beef and red rice recipe|',
    TRUE
  ),
  (
    'awesome_chicken_pumpkin',
    'weruva|weruva|awesome everything|dog|unknown|wet|chicken breast and red rice recipe|',
    FALSE
  ),
  (
    'awesome_chicken_veggies',
    'weruva|weruva|weruva awesome everything chicken breast and red rice recipe with veggies wet dog food|dog|unknown|wet||',
    TRUE
  ),
  (
    'press_your_dinner',
    'weruva|weruva|weruva classic press your dinner chicken pate grain free wet cat food|cat|unknown|wet||',
    TRUE
  );

CREATE TEMP TABLE tmp_weruva_duplicate_map ON COMMIT DROP AS
SELECT
  duplicate.target_slug,
  duplicate.duplicate_formula_key,
  duplicate.safe_alias,
  formula.id AS duplicate_formula_id
FROM tmp_weruva_duplicate_formulas duplicate
JOIN public.catalog_formulas formula
  ON formula.formula_key = duplicate.duplicate_formula_key
 AND formula.active
 AND formula.verification_status = 'discovered'
 AND formula.formula_evidence_tier = 'unverified'
 AND formula.promoted_cache_key IS NULL
 AND NULLIF(btrim(formula.ingredient_text), '') IS NULL;

DO $duplicate_guards$
BEGIN
  IF (SELECT count(*) FROM tmp_weruva_duplicate_map) <> 4
     OR (SELECT count(DISTINCT duplicate_formula_id) FROM tmp_weruva_duplicate_map) <> 4
  THEN
    RAISE EXCEPTION 'Weruva discovered duplicate formula baseline changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_duplicate_map duplicate
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = duplicate.duplicate_formula_id
  ) THEN
    RAISE EXCEPTION 'Weruva discovered duplicate unexpectedly owns field evidence';
  END IF;
END
$duplicate_guards$;

-- The Pumpkin and Soulistic package versions have exact serving rows and
-- accepted official observations, but no unique canonical formula. Create
-- only those two formula records from their already-staged exact evidence.
INSERT INTO public.catalog_formulas (
  formula_key,
  manufacturer,
  brand,
  product_name,
  product_line,
  pet_type,
  life_stage,
  food_form,
  flavor,
  diet_condition,
  is_complete_food,
  complete_food_evidence,
  ingredient_text,
  ingredients,
  front_image_url,
  source_url,
  source_authority,
  ingredient_verification_status,
  image_verification_status,
  protected_terms,
  verification_status,
  active,
  is_popular_brand,
  first_observed_at,
  last_observed_at,
  absent_since,
  promoted_cache_key,
  promoted_at,
  identity_hash,
  formula_evidence_tier,
  formula_version_provenance,
  updated_at
)
SELECT
  evidence.new_formula_key,
  'weruva',
  evidence.formula_brand,
  evidence.product_name,
  evidence.formula_product_line,
  evidence.pet_type,
  evidence.life_stage,
  evidence.food_form,
  evidence.formula_flavor,
  '',
  TRUE,
  source_formula.complete_food_evidence,
  evidence.serving_ingredient_text,
  evidence.serving_ingredients,
  evidence.front_image_url,
  evidence.source_url,
  'manufacturer',
  'manufacturer',
  'manufacturer',
  evidence.protected_terms,
  'verified',
  TRUE,
  source_formula.is_popular_brand,
  evidence.official_observed_at,
  evidence.official_observed_at,
  NULL,
  evidence.cache_key,
  COALESCE(evidence.serving_verified_at, evidence.official_observed_at),
  encode(digest(evidence.new_formula_key, 'sha256'), 'hex'),
  'manufacturer_current_exact',
  COALESCE(evidence.serving_provenance, '{}'::JSONB)
    || jsonb_build_object(
      'canonical_formula_key', evidence.new_formula_key,
      'weruva_shelf_brand_split_20260804',
      jsonb_build_object(
        'status', 'exact_current_official_formula_created_from_staging',
        'source_formula_id', evidence.source_formula_id,
        'official_observation_id', evidence.official_observation_id,
        'official_sku_id', evidence.official_sku_id,
        'shelf_brand', evidence.display_brand,
        'ingredient_text_hash', evidence.ingredient_hash,
        'source_url', evidence.source_url,
        'reconciled_at', now()
      )
    ),
  now()
FROM tmp_weruva_boundary_evidence evidence
JOIN public.catalog_formulas source_formula
  ON source_formula.id = evidence.source_formula_id
WHERE NOT evidence.reuse_source_formula;

CREATE TEMP TABLE tmp_weruva_boundary_map ON COMMIT DROP AS
SELECT
  evidence.*,
  target_formula.id AS target_formula_id,
  source_formula.formula_key AS source_formula_key_before
FROM tmp_weruva_boundary_evidence evidence
JOIN public.catalog_formulas source_formula
  ON source_formula.id = evidence.source_formula_id
JOIN public.catalog_formulas target_formula
  ON target_formula.formula_key = CASE
       WHEN evidence.reuse_source_formula
         THEN evidence.old_formula_key
       ELSE evidence.new_formula_key
     END
 AND (
   NOT evidence.reuse_source_formula
   OR target_formula.id = evidence.source_formula_id
 );

DO $map_guards$
BEGIN
  IF (SELECT count(*) FROM tmp_weruva_boundary_map) <> 6
     OR (SELECT count(DISTINCT target_formula_id) FROM tmp_weruva_boundary_map) <> 6
  THEN
    RAISE EXCEPTION 'Weruva target formula mapping is not one-to-one';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_boundary_map map
    WHERE (map.reuse_source_formula AND map.target_formula_id <> map.source_formula_id)
       OR (NOT map.reuse_source_formula AND map.target_formula_id = map.source_formula_id)
  ) THEN
    RAISE EXCEPTION 'Weruva split reused or created the wrong formula';
  END IF;
END
$map_guards$;

-- Normalize serving identity. Ingredient arrays and ingredient_text remain
-- byte-for-byte unchanged; the preconditions bind their normalized hashes.
UPDATE public.product_data serving
SET brand = map.display_brand,
    product_name = map.product_name,
    product_line = map.display_product_line,
    flavor = map.display_flavor,
    life_stage = map.life_stage,
    food_form = map.food_form,
    gtin = map.gtin,
    package_size = map.package_size,
    image_url = map.front_image_url,
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'canonical_formula_key', map.new_formula_key,
        'weruva_shelf_brand_split_20260804',
        jsonb_build_object(
          'status', 'exact_current_official_identity_reconciled',
          'formula_id', map.target_formula_id,
          'shelf_brand', map.display_brand,
          'product_line', map.display_product_line,
          'recipe', map.display_flavor,
          'life_stage', map.life_stage,
          'food_form', map.food_form,
          'package_gtin', map.gtin,
          'package_size', map.package_size,
          'ingredient_text_hash', map.ingredient_hash,
          'source_url', map.source_url,
          'reconciled_at', now()
        )
      ),
    updated_at = now()
FROM tmp_weruva_boundary_map map
WHERE serving.id = map.serving_id;

UPDATE public.catalog_formulas formula
SET formula_key = map.new_formula_key,
    manufacturer = 'weruva',
    brand = map.formula_brand,
    product_name = map.product_name,
    product_line = map.formula_product_line,
    pet_type = map.pet_type,
    life_stage = map.life_stage,
    food_form = map.food_form,
    flavor = map.formula_flavor,
    diet_condition = '',
    is_complete_food = TRUE,
    ingredient_text = map.serving_ingredient_text,
    ingredients = map.serving_ingredients,
    front_image_url = map.front_image_url,
    source_url = map.source_url,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = map.protected_terms,
    verification_status = 'verified',
    active = TRUE,
    absent_since = NULL,
    last_observed_at = GREATEST(formula.last_observed_at, map.official_observed_at),
    promoted_cache_key = map.cache_key,
    promoted_at = COALESCE(
      formula.promoted_at,
      map.serving_verified_at,
      map.official_observed_at
    ),
    identity_hash = encode(digest(map.new_formula_key, 'sha256'), 'hex'),
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'canonical_formula_key', map.new_formula_key,
        'weruva_shelf_brand_split_20260804',
        jsonb_build_object(
          'status', 'exact_current_official_identity_reconciled',
          'old_formula_key', map.source_formula_key_before,
          'official_observation_id', map.official_observation_id,
          'official_sku_id', map.official_sku_id,
          'shelf_brand', map.display_brand,
          'ingredient_text_hash', map.ingredient_hash,
          'source_url', map.source_url,
          'reconciled_at', now()
        )
      ),
    updated_at = now()
FROM tmp_weruva_boundary_map map
WHERE formula.id = map.target_formula_id;

CREATE TEMP TABLE tmp_weruva_observation_assignments (
  observation_id BIGINT PRIMARY KEY,
  target_slug TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_weruva_observation_assignments (observation_id, target_slug)
SELECT official_observation_id, slug
FROM tmp_weruva_boundary_map;

INSERT INTO tmp_weruva_observation_assignments (observation_id, target_slug)
SELECT observation.id, exact_listing.target_slug
FROM (VALUES
  ('3782102', 'awesome_chicken_pumpkin', 'pumpkin'),
  ('3782110', 'awesome_chicken_pumpkin', 'pumpkin'),
  ('3782118', 'awesome_chicken_pumpkin', 'pumpkin'),
  ('3782126', 'awesome_chicken_veggies', 'veggies'),
  ('3782158', 'awesome_beef_veggies', 'beef'),
  ('1031062', 'press_your_dinner', 'press'),
  ('342011', 'press_your_dinner', 'press')
) exact_listing(source_external_id, target_slug, identity_kind)
JOIN public.catalog_observations observation
  ON observation.source_slug = 'chewy-public-sitemap'
 AND observation.source_external_id = exact_listing.source_external_id
 AND observation.validation_status = 'accepted'
 AND observation.formula_evidence_tier = 'unverified'
WHERE CASE exact_listing.identity_kind
  WHEN 'pumpkin' THEN
    lower(observation.product_name) LIKE '%chicken%red rice%pumpkin%'
  WHEN 'veggies' THEN
    lower(observation.product_name) LIKE '%chicken%red rice%veggies%'
  WHEN 'beef' THEN
    lower(observation.product_name) LIKE '%beef%red rice%veggies%'
  WHEN 'press' THEN
    lower(observation.product_name) LIKE '%press your dinner%chicken%pate%'
  ELSE FALSE
END
ON CONFLICT (observation_id) DO UPDATE
SET target_slug = EXCLUDED.target_slug;

DO $observation_assignment_guards$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('3782102'), ('3782110'), ('3782118'), ('3782126'),
      ('3782158'), ('1031062'), ('342011')
    ) required(source_external_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.catalog_observations observation
      JOIN tmp_weruva_observation_assignments assignment
        ON assignment.observation_id = observation.id
      WHERE observation.source_slug = 'chewy-public-sitemap'
        AND observation.source_external_id = required.source_external_id
    )
  ) THEN
    RAISE EXCEPTION 'Weruva exact retailer observation assignment changed';
  END IF;

  IF (SELECT count(*) FROM tmp_weruva_observation_assignments) <> 20 THEN
    RAISE EXCEPTION 'Weruva exact observation assignment count changed';
  END IF;
END
$observation_assignment_guards$;

UPDATE public.catalog_observations observation
SET formula_id = map.target_formula_id,
    manufacturer = 'weruva',
    brand = map.formula_brand,
    product_name = map.product_name,
    product_line = map.formula_product_line,
    pet_type = map.pet_type,
    life_stage = map.life_stage,
    food_form = map.food_form,
    flavor = map.formula_flavor,
    diet_condition = '',
    formula_version_provenance =
      COALESCE(observation.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'canonical_formula_key', map.new_formula_key,
        'weruva_shelf_brand_split_20260804',
        jsonb_build_object(
          'formula_id', map.target_formula_id,
          'identity_only_reconciliation', TRUE,
          'retailer_listing_not_ingredient_proof',
            observation.formula_evidence_tier = 'unverified',
          'reconciled_at', now()
        )
      ),
    raw_payload = COALESCE(observation.raw_payload, '{}'::JSONB)
      || jsonb_build_object(
        'identity_reconciliation',
        jsonb_build_object(
          'canonical_formula_key', map.new_formula_key,
          'shelf_brand', map.display_brand,
          'protected_recipe', map.display_flavor,
          'reconciled_at', now()
        )
      )
FROM tmp_weruva_observation_assignments assignment
JOIN tmp_weruva_boundary_map map
  ON map.slug = assignment.target_slug
WHERE observation.id = assignment.observation_id;

CREATE TEMP TABLE tmp_weruva_sku_assignments (
  sku_id BIGINT PRIMARY KEY,
  target_slug TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_weruva_sku_assignments (sku_id, target_slug)
SELECT official_sku_id, slug
FROM tmp_weruva_boundary_map;

INSERT INTO tmp_weruva_sku_assignments (sku_id, target_slug)
SELECT sku.id, exact_listing.target_slug
FROM (VALUES
  ('3782102', 'awesome_chicken_pumpkin'),
  ('3782110', 'awesome_chicken_pumpkin'),
  ('3782118', 'awesome_chicken_pumpkin'),
  ('3782126', 'awesome_chicken_veggies'),
  ('3782158', 'awesome_beef_veggies'),
  ('1031062', 'press_your_dinner'),
  ('342011', 'press_your_dinner')
) exact_listing(source_external_id, target_slug)
JOIN public.catalog_skus sku
  ON sku.source_slug = 'chewy-public-sitemap'
 AND sku.source_external_id = exact_listing.source_external_id
 AND sku.active
ON CONFLICT (sku_id) DO UPDATE
SET target_slug = EXCLUDED.target_slug;

DO $sku_assignment_guards$
BEGIN
  IF (SELECT count(*) FROM tmp_weruva_sku_assignments) <> 13 THEN
    RAISE EXCEPTION 'Weruva exact SKU assignment count changed';
  END IF;
END
$sku_assignment_guards$;

UPDATE public.catalog_skus sku
SET formula_id = map.target_formula_id,
    updated_at = now()
FROM tmp_weruva_sku_assignments assignment
JOIN tmp_weruva_boundary_map map
  ON map.slug = assignment.target_slug
WHERE sku.id = assignment.sku_id;

-- Move only evidence whose exact official source URL identifies the target.
UPDATE public.catalog_field_evidence evidence
SET formula_id = map.target_formula_id,
    observation_id = COALESCE(evidence.observation_id, map.official_observation_id)
FROM tmp_weruva_boundary_map map
WHERE evidence.source_url = map.source_url
  AND evidence.formula_id <> map.target_formula_id;

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
  map.target_formula_id,
  map.official_observation_id,
  metadata.field_name,
  to_jsonb(metadata.field_value),
  map.source_url,
  'manufacturer',
  TRUE,
  map.official_observed_at,
  encode(digest(
    concat_ws(
      '|',
      map.new_formula_key,
      metadata.field_name,
      metadata.field_value,
      map.source_url,
      map.ingredient_hash
    ),
    'sha256'
  ), 'hex')
FROM tmp_weruva_boundary_map map
CROSS JOIN LATERAL (VALUES
  ('brand', map.formula_brand),
  ('product_name', map.product_name),
  ('product_line', map.formula_product_line),
  ('flavor', map.formula_flavor),
  ('life_stage', map.life_stage),
  ('food_form', map.food_form),
  ('gtin', map.gtin),
  ('package_size', map.package_size)
) metadata(field_name, field_value)
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = TRUE,
    observed_at = EXCLUDED.observed_at;

DO $duplicate_empty_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_duplicate_map duplicate
    WHERE EXISTS (
      SELECT 1 FROM public.catalog_observations observation
      WHERE observation.formula_id = duplicate.duplicate_formula_id
    )
       OR EXISTS (
         SELECT 1 FROM public.catalog_skus sku
         WHERE sku.formula_id = duplicate.duplicate_formula_id
       )
       OR EXISTS (
         SELECT 1 FROM public.catalog_field_evidence evidence
         WHERE evidence.formula_id = duplicate.duplicate_formula_id
       )
  ) THEN
    RAISE EXCEPTION 'Weruva discovered duplicate retained canonical children';
  END IF;
END
$duplicate_empty_guard$;

UPDATE public.catalog_formulas duplicate_formula
SET active = FALSE,
    verification_status = 'quarantined',
    absent_since = COALESCE(duplicate_formula.absent_since, now()),
    promoted_cache_key = NULL,
    formula_version_provenance =
      COALESCE(duplicate_formula.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'weruva_shelf_brand_split_20260804',
        jsonb_build_object(
          'status', 'discovered_duplicate_reconciled',
          'canonical_formula_id', map.target_formula_id,
          'canonical_formula_key', map.new_formula_key,
          'ingredient_or_image_evidence_copied', FALSE,
          'reconciled_at', now()
        )
      ),
    updated_at = now()
FROM tmp_weruva_duplicate_map duplicate
JOIN tmp_weruva_boundary_map map
  ON map.slug = duplicate.target_slug
WHERE duplicate_formula.id = duplicate.duplicate_formula_id;

CREATE TEMP TABLE tmp_weruva_safe_formula_aliases (
  target_slug TEXT NOT NULL,
  alias_formula_key TEXT PRIMARY KEY,
  source_url TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_weruva_safe_formula_aliases (
  target_slug,
  alias_formula_key,
  source_url
)
SELECT slug, old_formula_key, source_url
FROM tmp_weruva_boundary_map
WHERE slug IN ('awesome_beef_veggies', 'press_your_dinner')
UNION ALL
SELECT duplicate.target_slug, duplicate.duplicate_formula_key, map.source_url
FROM tmp_weruva_duplicate_map duplicate
JOIN tmp_weruva_boundary_map map ON map.slug = duplicate.target_slug
WHERE duplicate.safe_alias;

DO $formula_alias_guards$
BEGIN
  IF (SELECT count(*) FROM tmp_weruva_safe_formula_aliases) <> 5 THEN
    RAISE EXCEPTION 'Weruva safe legacy alias set changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_safe_formula_aliases safe
    JOIN public.catalog_formula_aliases existing
      ON existing.alias_formula_key = safe.alias_formula_key
    JOIN tmp_weruva_boundary_map map ON map.slug = safe.target_slug
    WHERE existing.formula_id <> map.target_formula_id
  ) THEN
    RAISE EXCEPTION 'Weruva safe legacy alias belongs to another formula';
  END IF;
END
$formula_alias_guards$;

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
  safe.alias_formula_key,
  map.target_formula_id,
  encode(digest(safe.alias_formula_key, 'sha256'), 'hex'),
  'manual_review',
  safe.source_url,
  jsonb_build_object(
    'reason', 'exact_weruva_shelf_brand_and_recipe_boundary_reconciled',
    'canonical_formula_key', map.new_formula_key,
    'shelf_brand', map.display_brand,
    'protected_recipe', map.display_flavor,
    'ingredient_text_hash', map.ingredient_hash,
    'reviewed_at', now()
  ),
  now()
FROM tmp_weruva_safe_formula_aliases safe
JOIN tmp_weruva_boundary_map map ON map.slug = safe.target_slug
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now();

CREATE TEMP TABLE tmp_weruva_search_aliases (
  target_slug TEXT NOT NULL,
  alias_text TEXT PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO tmp_weruva_search_aliases (target_slug, alias_text)
SELECT slug, primary_search_alias
FROM tmp_weruva_boundary_map
UNION ALL VALUES
  (
    'awesome_beef_veggies',
    'Weruva Awesome Everything Beef & Red Rice Recipe with Veggies'
  ),
  (
    'awesome_chicken_pumpkin',
    'Weruva Awesome Everything Chicken Breast & Red Rice Recipe with Pumpkin'
  ),
  (
    'awesome_chicken_veggies',
    'Weruva Awesome Everything Chicken Breast & Red Rice Recipe with Veggies'
  ),
  (
    'pamper_tuna_salmon',
    'Pamper Like Paris Tuna & Salmon Dinner in a Hydrating Puree'
  ),
  (
    'press_your_dinner',
    'Weruva Classic Press Your Dinner Chicken Pate Grain-Free Wet Cat Food'
  );

DO $search_alias_guards$
BEGIN
  IF (SELECT count(*) FROM tmp_weruva_search_aliases) <> 11
     OR (
       SELECT count(DISTINCT public.normalize_verified_product_search_query(alias_text))
       FROM tmp_weruva_search_aliases
     ) <> 11
  THEN
    RAISE EXCEPTION 'Weruva exact search alias set is not unique';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_search_aliases alias
    JOIN tmp_weruva_boundary_map map ON map.slug = alias.target_slug
    JOIN public.catalog_verified_product_search_aliases existing
      ON existing.normalized_alias =
         public.normalize_verified_product_search_query(alias.alias_text)
     AND existing.active
    WHERE existing.cache_key <> map.cache_key
  ) THEN
    RAISE EXCEPTION 'Weruva exact search alias belongs to a sibling product';
  END IF;
END
$search_alias_guards$;

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
  map.cache_key,
  alias.alias_text,
  public.normalize_verified_product_search_query(alias.alias_text),
  map.source_url,
  'manufacturer',
  map.official_observed_at,
  jsonb_build_object(
    'exact_formula_identity', TRUE,
    'formula_id', map.target_formula_id,
    'canonical_formula_key', map.new_formula_key,
    'shelf_brand_boundary', map.display_brand,
    'species_boundary', map.pet_type,
    'life_stage_boundary', map.life_stage,
    'food_form_boundary', map.food_form,
    'protected_recipe', map.display_flavor,
    'ingredient_text_hash', map.ingredient_hash,
    'captured_at', map.official_observed_at
  ),
  TRUE,
  now()
FROM tmp_weruva_search_aliases alias
JOIN tmp_weruva_boundary_map map ON map.slug = alias.target_slug
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = EXCLUDED.provenance,
    updated_at = now();

SET CONSTRAINTS enforce_catalog_sku_gtin_formula_consistency IMMEDIATE;

DO $postconditions$
DECLARE
  target RECORD;
  v_top_cache TEXT;
  v_barcode_count INTEGER;
  v_barcode_cache TEXT;
BEGIN
  IF (
    SELECT count(*)
    FROM tmp_weruva_boundary_map map
    JOIN public.catalog_formulas formula
      ON formula.id = map.target_formula_id
     AND formula.formula_key = map.new_formula_key
     AND formula.identity_hash = encode(digest(map.new_formula_key, 'sha256'), 'hex')
     AND formula.manufacturer = 'weruva'
     AND formula.brand = map.formula_brand
     AND formula.product_name = map.product_name
     AND formula.product_line = map.formula_product_line
     AND formula.pet_type = map.pet_type
     AND formula.life_stage = map.life_stage
     AND formula.food_form = map.food_form
     AND formula.flavor = map.formula_flavor
     AND formula.verification_status = 'verified'
     AND formula.active
     AND formula.promoted_cache_key = map.cache_key
     AND formula.formula_evidence_tier = 'manufacturer_current_exact'
     AND formula.source_url = map.source_url
     AND formula.front_image_url = map.front_image_url
     AND encode(digest(
          public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
          'sha256'
        ), 'hex') = map.ingredient_hash
  ) <> 6 THEN
    RAISE EXCEPTION 'Weruva canonical formula postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM tmp_weruva_boundary_map map
    JOIN public.product_data serving
      ON serving.cache_key = map.cache_key
     AND serving.brand = map.display_brand
     AND serving.product_name = map.product_name
     AND serving.product_line = map.display_product_line
     AND serving.flavor = map.display_flavor
     AND serving.pet_type = map.pet_type
     AND serving.life_stage = map.life_stage
     AND serving.food_form = map.food_form
     AND regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g') = map.gtin
     AND serving.package_size = map.package_size
     AND serving.source_url = map.source_url
     AND serving.image_url = map.front_image_url
     AND serving.ingredient_count = map.ingredient_count
     AND serving.is_complete_food
     AND serving.catalog_exclusion_reason IS NULL
     AND encode(digest(
          public.catalog_normalize_ingredient_evidence(serving.ingredient_text),
          'sha256'
        ), 'hex') = map.ingredient_hash
  ) <> 6 THEN
    RAISE EXCEPTION 'Weruva serving identity postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_boundary_map map
    WHERE (
      SELECT count(DISTINCT sku.formula_id)
      FROM public.catalog_skus sku
      WHERE sku.active
        AND regexp_replace(COALESCE(sku.gtin, ''), '\D', '', 'g') = map.gtin
    ) <> 1
       OR NOT EXISTS (
         SELECT 1
         FROM public.catalog_skus sku
         WHERE sku.active
           AND sku.formula_id = map.target_formula_id
           AND regexp_replace(COALESCE(sku.gtin, ''), '\D', '', 'g') = map.gtin
       )
  ) THEN
    RAISE EXCEPTION 'Weruva active GTIN ownership postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_duplicate_map duplicate
    JOIN public.catalog_formulas formula
      ON formula.id = duplicate.duplicate_formula_id
    WHERE formula.active
       OR formula.verification_status <> 'quarantined'
       OR formula.absent_since IS NULL
       OR formula.promoted_cache_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Weruva duplicate formula quarantine postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases alias
    WHERE alias.alias_formula_key IN (
      'weruva|weruva|awesome everything|dog|unknown|unknown|chicken breast and red rice recipe|',
      'weruva|weruva|awesome everything|dog|unknown|wet|chicken breast and red rice recipe|',
      'weruva|weruva|tuna and salmon dinner in a hydrating puree|cat|unknown|wet|tuna and salmon dinner|'
    )
  ) THEN
    RAISE EXCEPTION 'Weruva ambiguous legacy identity became an unsafe alias';
  END IF;

  FOR target IN
    SELECT * FROM tmp_weruva_boundary_map ORDER BY slug
  LOOP
    SELECT searched.cache_key INTO v_top_cache
    FROM public.search_verified_products(target.primary_search_alias, 5) searched
    ORDER BY searched.rank DESC, searched.cache_key
    LIMIT 1;

    IF v_top_cache IS DISTINCT FROM target.cache_key THEN
      RAISE EXCEPTION
        'Weruva exact search failed for %, got %',
        target.slug,
        v_top_cache;
    END IF;

    SELECT count(*), min(resolved.cache_key)
    INTO v_barcode_count, v_barcode_cache
    FROM public.resolve_verified_product_by_gtin(target.gtin, 8) resolved;

    IF v_barcode_count <> 1 OR v_barcode_cache IS DISTINCT FROM target.cache_key THEN
      RAISE EXCEPTION
        'Weruva exact GTIN failed for %, count %, cache %',
        target.slug,
        v_barcode_count,
        v_barcode_cache;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM public.catalog_verified_product_search_aliases alias
    JOIN tmp_weruva_search_aliases expected
      ON alias.normalized_alias =
         public.normalize_verified_product_search_query(expected.alias_text)
     AND alias.active
    JOIN tmp_weruva_boundary_map map
      ON map.slug = expected.target_slug
     AND alias.cache_key = map.cache_key
  ) <> 11 THEN
    RAISE EXCEPTION 'Weruva exact search alias postcondition failed';
  END IF;
END
$postconditions$;
