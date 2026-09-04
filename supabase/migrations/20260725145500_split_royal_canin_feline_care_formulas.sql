-- Split five Royal Canin Feline Care Nutrition formulas that were incorrectly
-- collapsed under one broad product_line. Royal Canin identity is product-local:
-- Appetite Control, Digestive Care, Hair & Skin Care, Hairball Care, and
-- Urinary Care are hard formula boundaries.

DO $$
DECLARE
  official_ready_count INTEGER;
  broad_formula_count INTEGER;
BEGIN
  SELECT count(*)
  INTO official_ready_count
  FROM public.product_data
  WHERE cache_key IN (
    'royal-canin-mars-petcare:1047678:030111541567',
    'royal-canin-mars-petcare:1047678:030111553140',
    'royal-canin-mars-petcare:1053762:030111444202',
    'royal-canin-mars-petcare:1053774:030111524034',
    'royal-canin-mars-petcare:1053804:030111630216',
    'royal-canin-mars-petcare:1053810:030111546449'
  )
    AND brand = 'Royal Canin'
    AND pet_type = 'cat'
    AND food_form = 'dry'
    AND source_quality = 'manufacturer'
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND public.catalog_quality_state(
      pet_type,
      is_complete_food,
      catalog_exclusion_reason,
      ingredient_text,
      COALESCE(array_length(ingredients, 1), 0),
      ingredient_verification_status,
      image_url,
      image_verification_status,
      source_url,
      expires_at
    ) = 'verified_ready';

  SELECT count(DISTINCT formula_id)
  INTO broad_formula_count
  FROM public.catalog_skus
  WHERE source_external_id IN (
    'royal-canin-mars-petcare:1047678:030111541567',
    'royal-canin-mars-petcare:1053762:030111444202',
    'royal-canin-mars-petcare:1053774:030111524034',
    'royal-canin-mars-petcare:1053804:030111630216',
    'royal-canin-mars-petcare:1053810:030111546449'
  );

  IF official_ready_count <> 6 OR broad_formula_count <> 1 THEN
    RAISE EXCEPTION
      'Royal Canin split prerequisites failed: official rows %, broad formulas %',
      official_ready_count, broad_formula_count;
  END IF;
END $$;

CREATE TEMP TABLE royal_canin_split_context (
  broad_formula_id BIGINT PRIMARY KEY,
  appetite_formula_id BIGINT NOT NULL
) ON COMMIT DROP;

INSERT INTO royal_canin_split_context (
  broad_formula_id,
  appetite_formula_id
)
SELECT
  (
    SELECT min(formula_id)
    FROM public.catalog_skus
    WHERE source_external_id =
      'royal-canin-mars-petcare:1047678:030111541567'
  ),
  (
    SELECT min(formula_id)
    FROM public.catalog_skus
    WHERE source_external_id =
      'petsmart-retail-catalog:030111553140'
  );

DO $$
DECLARE
  invalid_context_count INTEGER;
BEGIN
  SELECT count(*)
  INTO invalid_context_count
  FROM royal_canin_split_context context
  JOIN public.catalog_formulas broad
    ON broad.id = context.broad_formula_id
  JOIN public.catalog_formulas appetite
    ON appetite.id = context.appetite_formula_id
  WHERE context.broad_formula_id = context.appetite_formula_id
     OR broad.brand <> 'royal canin'
     OR appetite.brand <> 'royal canin'
     OR broad.pet_type <> 'cat'
     OR appetite.pet_type <> 'cat'
     OR broad.food_form <> 'dry'
     OR appetite.food_form <> 'dry';

  IF invalid_context_count <> 0 THEN
    RAISE EXCEPTION 'Royal Canin split context identity assertion failed';
  END IF;
END $$;

-- Hairball Care had no exact formula record because it was swallowed by the
-- broad group. Create it only from the exact current manufacturer serving row.
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
  promoted_cache_key,
  promoted_at,
  identity_hash,
  created_at,
  updated_at
)
SELECT
  'royal canin|royal canin|hairball care dry cat food|cat|adult|dry||',
  'royal canin',
  'royal canin',
  official.product_name,
  'hairball care dry cat food',
  'cat',
  'adult',
  'dry',
  '',
  '',
  TRUE,
  'Current exact Royal Canin manufacturer complete-food evidence',
  official.ingredient_text,
  official.ingredients,
  official.image_url,
  official.source_url,
  'manufacturer',
  'manufacturer',
  'manufacturer',
  ARRAY[
    'royal canin',
    'hairball care',
    'cat',
    'adult',
    'dry'
  ]::TEXT[],
  'verified',
  TRUE,
  TRUE,
  COALESCE(official.scraped_at, now()),
  COALESCE(official.scraped_at, now()),
  official.cache_key,
  now(),
  '143dbdd6070cbc71ed80dd1f56132ca5326454c322157ff56a24c7e6b1ced18e',
  now(),
  now()
FROM public.product_data official
WHERE official.cache_key =
  'royal-canin-mars-petcare:1053804:030111630216'
  AND NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE identity_hash =
      '143dbdd6070cbc71ed80dd1f56132ca5326454c322157ff56a24c7e6b1ced18e'
      AND active
  );

CREATE TEMP TABLE royal_canin_exact_formulas (
  formula_name TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL UNIQUE,
  promoted_cache_key TEXT NOT NULL UNIQUE,
  formula_id BIGINT
) ON COMMIT DROP;

INSERT INTO royal_canin_exact_formulas (
  formula_name,
  identity_hash,
  promoted_cache_key
)
VALUES
  (
    'appetite_control',
    '0f60c4e38e7ca64e66de6cdd893e5d88924c238161ce881013b9098ced7faabc',
    'royal-canin-mars-petcare:1047678:030111541567'
  ),
  (
    'digestive_care',
    'd00d90302b866bf34b8b4e6d12df071cd0e8c2846400df33ec4709561fafd89e',
    'royal-canin-mars-petcare:1053762:030111444202'
  ),
  (
    'hair_skin_care',
    '55558248ad1c71a7bcb8130e3cdc900f3b7c6823c0f382d19d1111db23f8cc16',
    'royal-canin-mars-petcare:1053774:030111524034'
  ),
  (
    'hairball_care',
    '143dbdd6070cbc71ed80dd1f56132ca5326454c322157ff56a24c7e6b1ced18e',
    'royal-canin-mars-petcare:1053804:030111630216'
  ),
  (
    'urinary_care',
    'd8e735dce0ee1fadd962296c947976e747413b0d57a98f87881e8be27fbb0b4d',
    'royal-canin-mars-petcare:1053810:030111546449'
  );

UPDATE royal_canin_exact_formulas exact
SET formula_id = CASE exact.formula_name
  WHEN 'appetite_control' THEN context.appetite_formula_id
  WHEN 'hair_skin_care' THEN context.broad_formula_id
  ELSE (
    SELECT min(formula.id)
    FROM public.catalog_formulas formula
    WHERE formula.identity_hash = exact.identity_hash
      AND formula.active
  )
END
FROM royal_canin_split_context context;

DO $$
DECLARE
  resolved_formula_count INTEGER;
  distinct_formula_count INTEGER;
BEGIN
  SELECT count(*), count(DISTINCT formula_id)
  INTO resolved_formula_count, distinct_formula_count
  FROM royal_canin_exact_formulas
  WHERE formula_id IS NOT NULL;

  IF resolved_formula_count <> 5 OR distinct_formula_count <> 5 THEN
    RAISE EXCEPTION
      'Royal Canin exact-formula resolution failed: resolved %, distinct %',
      resolved_formula_count, distinct_formula_count;
  END IF;
END $$;

-- Upgrade the two existing exact discovered formulas.
UPDATE public.catalog_formulas formula
SET
  product_name = official.product_name,
  product_line = CASE exact.formula_name
    WHEN 'digestive_care' THEN 'digestive care dry cat food'
    WHEN 'urinary_care' THEN 'urinary care dry cat food'
  END,
  pet_type = 'cat',
  life_stage = 'unknown',
  food_form = 'dry',
  flavor = '',
  source_authority = 'manufacturer',
  source_url = official.source_url,
  is_complete_food = TRUE,
  complete_food_evidence =
    'Current exact Royal Canin manufacturer complete-food evidence',
  ingredient_text = official.ingredient_text,
  ingredients = official.ingredients,
  front_image_url = official.image_url,
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  protected_terms = CASE exact.formula_name
    WHEN 'digestive_care'
      THEN ARRAY['royal canin', 'digestive care', 'cat', 'dry']::TEXT[]
    WHEN 'urinary_care'
      THEN ARRAY['royal canin', 'urinary care', 'cat', 'dry']::TEXT[]
  END,
  verification_status = 'verified',
  promoted_cache_key = official.cache_key,
  promoted_at = now(),
  active = TRUE,
  absent_since = NULL,
  updated_at = now()
FROM royal_canin_exact_formulas exact
JOIN public.product_data official
  ON official.cache_key = exact.promoted_cache_key
WHERE formula.id = exact.formula_id
  AND exact.formula_name IN ('digestive_care', 'urinary_care');

-- Convert the former broad formula into exact Hair & Skin Care.
UPDATE public.catalog_formulas formula
SET
  formula_key =
    'royal canin|royal canin|hair and skin care dry cat food|cat|adult|dry||',
  identity_hash =
    '55558248ad1c71a7bcb8130e3cdc900f3b7c6823c0f382d19d1111db23f8cc16',
  manufacturer = 'royal canin',
  brand = 'royal canin',
  product_name = official.product_name,
  product_line = 'hair and skin care dry cat food',
  pet_type = 'cat',
  life_stage = 'adult',
  food_form = 'dry',
  flavor = '',
  diet_condition = '',
  source_authority = 'manufacturer',
  source_url = official.source_url,
  is_complete_food = TRUE,
  complete_food_evidence =
    'Current exact Royal Canin manufacturer complete-food evidence',
  ingredient_text = official.ingredient_text,
  ingredients = official.ingredients,
  front_image_url = official.image_url,
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  protected_terms = ARRAY[
    'royal canin',
    'hair and skin care',
    'cat',
    'adult',
    'dry'
  ]::TEXT[],
  verification_status = 'verified',
  promoted_cache_key = official.cache_key,
  promoted_at = now(),
  active = TRUE,
  absent_since = NULL,
  updated_at = now()
FROM royal_canin_exact_formulas exact
JOIN public.product_data official
  ON official.cache_key = exact.promoted_cache_key
WHERE exact.formula_name = 'hair_skin_care'
  AND formula.id = exact.formula_id;

-- Upgrade Appetite Control from retailer evidence to the current exact official
-- row while preserving adult/chicken terms established by its exact PetSmart
-- listing.
UPDATE public.catalog_formulas formula
SET
  formula_key =
    'royal canin|royal canin|appetite control care dry cat food|cat|adult|dry|chicken|',
  identity_hash =
    '0f60c4e38e7ca64e66de6cdd893e5d88924c238161ce881013b9098ced7faabc',
  manufacturer = 'royal canin',
  brand = 'royal canin',
  product_name = official.product_name,
  product_line = 'appetite control care dry cat food',
  pet_type = 'cat',
  life_stage = 'adult',
  food_form = 'dry',
  flavor = 'chicken',
  diet_condition = '',
  source_authority = 'manufacturer',
  source_url = official.source_url,
  is_complete_food = TRUE,
  complete_food_evidence =
    'Current exact Royal Canin manufacturer complete-food evidence',
  ingredient_text = official.ingredient_text,
  ingredients = official.ingredients,
  front_image_url = official.image_url,
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  protected_terms = ARRAY[
    'royal canin',
    'appetite control care',
    'cat',
    'adult',
    'dry',
    'chicken'
  ]::TEXT[],
  verification_status = 'verified',
  promoted_cache_key = official.cache_key,
  promoted_at = now(),
  active = TRUE,
  absent_since = NULL,
  updated_at = now()
FROM royal_canin_exact_formulas exact
JOIN public.product_data official
  ON official.cache_key = exact.promoted_cache_key
WHERE exact.formula_name = 'appetite_control'
  AND formula.id = exact.formula_id;

CREATE TEMP TABLE royal_canin_source_formula_map (
  source_external_id TEXT PRIMARY KEY,
  formula_name TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO royal_canin_source_formula_map (
  source_external_id,
  formula_name
)
VALUES
  (
    'royal-canin-mars-petcare:1047678:030111541567',
    'appetite_control'
  ),
  (
    'royal-canin-mars-petcare:1053762:030111444202',
    'digestive_care'
  ),
  (
    'royal-canin-mars-petcare:1053774:030111524034',
    'hair_skin_care'
  ),
  (
    'petsmart-retail-catalog:030111524034',
    'hair_skin_care'
  ),
  (
    'royal-canin-mars-petcare:1053804:030111630216',
    'hairball_care'
  ),
  (
    'petsmart-retail-catalog:030111630216',
    'hairball_care'
  ),
  (
    'royal-canin-mars-petcare:1053810:030111546449',
    'urinary_care'
  );

UPDATE public.catalog_observations observation
SET formula_id = exact.formula_id
FROM royal_canin_source_formula_map mapping
JOIN royal_canin_exact_formulas exact
  ON exact.formula_name = mapping.formula_name
WHERE observation.source_external_id = mapping.source_external_id;

UPDATE public.catalog_skus sku
SET
  formula_id = exact.formula_id,
  updated_at = now()
FROM royal_canin_source_formula_map mapping
JOIN royal_canin_exact_formulas exact
  ON exact.formula_name = mapping.formula_name
WHERE sku.source_external_id = mapping.source_external_id;

-- The second official Appetite Control package was in product_data but missing
-- from the canonical SKU ledger.
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
  exact.formula_id,
  official.gtin,
  official.package_size,
  NULL,
  'royal-canin-mars-petcare',
  official.cache_key,
  official.source_url,
  TRUE,
  COALESCE(official.scraped_at, now()),
  COALESCE(official.scraped_at, now()),
  now(),
  now()
FROM royal_canin_exact_formulas exact
JOIN public.product_data official
  ON official.cache_key =
    'royal-canin-mars-petcare:1047678:030111553140'
WHERE exact.formula_name = 'appetite_control'
ON CONFLICT (source_slug, source_external_id, gtin, package_size)
DO UPDATE SET
  formula_id = EXCLUDED.formula_id,
  source_url = EXCLUDED.source_url,
  active = TRUE,
  last_observed_at = EXCLUDED.last_observed_at,
  updated_at = now();

-- Re-home field evidence according to each observation's corrected formula.
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
  observation.formula_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash
FROM royal_canin_split_context context
JOIN public.catalog_field_evidence evidence
  ON evidence.formula_id = context.broad_formula_id
JOIN public.catalog_observations observation
  ON observation.id = evidence.observation_id
WHERE observation.formula_id IS NOT NULL
  AND observation.formula_id <> context.broad_formula_id
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted;

DELETE FROM public.catalog_field_evidence evidence
USING royal_canin_split_context context,
      public.catalog_observations observation
WHERE evidence.formula_id = context.broad_formula_id
  AND observation.id = evidence.observation_id
  AND observation.formula_id IS NOT NULL
  AND observation.formula_id <> context.broad_formula_id;

-- Historical broad-formula census links cannot safely be assigned to one of the
-- five exact formulas.
UPDATE public.catalog_census_formula_members member
SET formula_id = NULL
FROM royal_canin_split_context context
WHERE member.formula_id = context.broad_formula_id
  AND member.formula_key <>
    'royal canin|royal canin|hair and skin care dry cat food|cat|adult|dry||';

-- Package-size and retailer aliases are no longer independent serving formulas.
UPDATE public.product_data duplicate
SET
  catalog_exclusion_reason = 'duplicate_canonical_formula_sku_variant',
  updated_at = now()
WHERE duplicate.cache_key IN (
  'royal-canin-mars-petcare:1047678:030111553140',
  'petsmart-retail-catalog:030111541567',
  'petsmart-retail-catalog:030111524034',
  'petsmart-retail-catalog:030111630216'
);

UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(
    NULLIF(evidence.rejection_reason, ''),
    'duplicate_canonical_formula_sku_variant'
  ),
  evidence = COALESCE(evidence.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'reconciled_at', now(),
      'reconciled_by',
        '20260725145500_split_royal_canin_feline_care_formulas',
      'reason',
        'package/retailer variant retained in catalog_skus'
    ),
  updated_at = now()
WHERE evidence.cache_key IN (
  'royal-canin-mars-petcare:1047678:030111553140',
  'petsmart-retail-catalog:030111541567',
  'petsmart-retail-catalog:030111524034',
  'petsmart-retail-catalog:030111630216'
);

SELECT public.close_stale_catalog_acquisition_queue_gaps(now())
  AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  exact_formula_count INTEGER;
  expected_sku_count INTEGER;
  cross_formula_gtin_count INTEGER;
  appetite_barcode_count INTEGER;
  hair_skin_barcode_count INTEGER;
  hairball_barcode_count INTEGER;
BEGIN
  SELECT count(*)
  INTO exact_formula_count
  FROM royal_canin_exact_formulas exact
  JOIN public.catalog_formulas formula
    ON formula.id = exact.formula_id
  WHERE formula.identity_hash = exact.identity_hash
    AND formula.active
    AND formula.verification_status = 'verified'
    AND formula.source_authority = 'manufacturer'
    AND formula.promoted_cache_key = exact.promoted_cache_key;

  SELECT count(*)
  INTO expected_sku_count
  FROM royal_canin_source_formula_map mapping
  JOIN royal_canin_exact_formulas exact
    ON exact.formula_name = mapping.formula_name
  JOIN public.catalog_skus sku
    ON sku.source_external_id = mapping.source_external_id
   AND sku.formula_id = exact.formula_id
   AND sku.active;

  SELECT count(*)
  INTO cross_formula_gtin_count
  FROM (
    SELECT sku.gtin
    FROM public.catalog_skus sku
    WHERE sku.gtin IN (
      '030111541567',
      '030111444202',
      '030111524034',
      '030111630216',
      '030111546449'
    )
      AND sku.active
    GROUP BY sku.gtin
    HAVING count(DISTINCT sku.formula_id) <> 1
  ) conflicts;

  SELECT count(DISTINCT cache_key)
  INTO appetite_barcode_count
  FROM public.resolve_verified_product_by_gtin('030111553140', 8)
  WHERE product_name = 'Appetite Control Care Dry Cat Food';

  SELECT count(DISTINCT cache_key)
  INTO hair_skin_barcode_count
  FROM public.resolve_verified_product_by_gtin('030111524034', 8)
  WHERE product_name = 'Hair & Skin Care Dry Cat Food';

  SELECT count(DISTINCT cache_key)
  INTO hairball_barcode_count
  FROM public.resolve_verified_product_by_gtin('030111630216', 8)
  WHERE product_name = 'Hairball Care Dry Cat Food';

  IF exact_formula_count <> 5
      OR expected_sku_count <> 7
      OR cross_formula_gtin_count <> 0
      OR appetite_barcode_count <> 1
      OR hair_skin_barcode_count <> 1
      OR hairball_barcode_count <> 1 THEN
    RAISE EXCEPTION
      'Royal Canin split failed: formulas %, SKUs %, conflicts %, barcode A/H/S %/%/%',
      exact_formula_count,
      expected_sku_count,
      cross_formula_gtin_count,
      appetite_barcode_count,
      hair_skin_barcode_count,
      hairball_barcode_count;
  END IF;
END $$;
