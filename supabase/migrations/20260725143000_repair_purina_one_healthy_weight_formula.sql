-- Repair Purina ONE Healthy Weight as one canonical Turkey/adult formula.
-- Package sizes and retailer barcodes remain SKU children. A Walmart Healthy
-- Puppy URL that had contaminated the Healthy Weight formula is quarantined.

DO $$
DECLARE
  official_ready_count INTEGER;
  canonical_formula_count INTEGER;
  legacy_formula_count INTEGER;
BEGIN
  SELECT count(*)
  INTO official_ready_count
  FROM public.product_data
  WHERE cache_key = 'nestle-purina-one:017800570534'
    AND brand = 'Purina ONE'
    AND pet_type = 'dog'
    AND life_stage = 'adult'
    AND food_form = 'dry'
    AND flavor = 'Turkey'
    AND ingredient_text ILIKE 'Turkey,%'
    AND source_url =
      'https://www.purina.com/dogs/shop/purina-one-healthy-weight-dry-dog-food'
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
  INTO canonical_formula_count
  FROM public.catalog_skus
  WHERE source_external_id = 'petsmart-retail-catalog:017800149211';

  SELECT count(DISTINCT formula_id)
  INTO legacy_formula_count
  FROM public.catalog_skus
  WHERE source_external_id = 'nestle-purina-one:017800570534';

  IF official_ready_count <> 1
      OR canonical_formula_count <> 1
      OR legacy_formula_count <> 1 THEN
    RAISE EXCEPTION
      'Purina ONE repair prerequisites failed: official %, canonical %, legacy %',
      official_ready_count, canonical_formula_count, legacy_formula_count;
  END IF;
END $$;

CREATE TEMP TABLE purina_one_formula_merge (
  canonical_formula_id BIGINT PRIMARY KEY,
  legacy_formula_id BIGINT NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO purina_one_formula_merge (
  canonical_formula_id,
  legacy_formula_id
)
SELECT
  (
    SELECT min(formula_id)
    FROM public.catalog_skus
    WHERE source_external_id = 'petsmart-retail-catalog:017800149211'
  ),
  (
    SELECT min(formula_id)
    FROM public.catalog_skus
    WHERE source_external_id = 'nestle-purina-one:017800570534'
  );

DO $$
DECLARE
  invalid_pair_count INTEGER;
BEGIN
  SELECT count(*)
  INTO invalid_pair_count
  FROM purina_one_formula_merge merge
  JOIN public.catalog_formulas canonical
    ON canonical.id = merge.canonical_formula_id
  JOIN public.catalog_formulas legacy
    ON legacy.id = merge.legacy_formula_id
  WHERE merge.canonical_formula_id = merge.legacy_formula_id
     OR canonical.brand <> 'purina one'
     OR legacy.brand <> 'purina one'
     OR canonical.pet_type <> 'dog'
     OR legacy.pet_type <> 'dog'
     OR canonical.food_form <> 'dry'
     OR legacy.food_form <> 'dry'
     OR canonical.flavor <> 'turkey'
     OR canonical.life_stage <> 'adult'
     OR legacy.source_url <>
       'https://www.purina.com/dogs/shop/purina-one-healthy-weight-dry-dog-food';

  IF invalid_pair_count <> 0 THEN
    RAISE EXCEPTION 'Purina ONE merge identity assertion failed';
  END IF;
END $$;

-- Remove the one cross-formula retailer mapping before consolidation.
UPDATE public.catalog_observations observation
SET
  formula_id = NULL,
  validation_status = 'quarantined',
  validation_reasons = ARRAY(
    SELECT DISTINCT reason
    FROM unnest(
      COALESCE(observation.validation_reasons, ARRAY[]::TEXT[])
        || ARRAY['cross_formula_url_healthy_puppy']
    ) reason
  ),
  raw_payload = COALESCE(observation.raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'quarantined_at', now(),
      'quarantined_by',
        '20260725143000_repair_purina_one_healthy_weight_formula',
      'reason',
        'Healthy Puppy retailer URL cannot belong to Healthy Weight formula'
    )
FROM purina_one_formula_merge merge
WHERE observation.formula_id = merge.legacy_formula_id
  AND observation.source_url ILIKE '%healthy-puppy%';

UPDATE public.catalog_skus sku
SET
  active = FALSE,
  updated_at = now()
FROM purina_one_formula_merge merge
WHERE sku.formula_id = merge.legacy_formula_id
  AND sku.source_url ILIKE '%healthy-puppy%';

-- Move all exact Healthy Weight observations and SKU variants to the canonical
-- Turkey/adult formula.
UPDATE public.catalog_observations observation
SET formula_id = merge.canonical_formula_id
FROM purina_one_formula_merge merge
WHERE observation.formula_id = merge.legacy_formula_id
  AND observation.source_url NOT ILIKE '%healthy-puppy%';

UPDATE public.catalog_skus sku
SET
  formula_id = merge.canonical_formula_id,
  updated_at = now()
FROM purina_one_formula_merge merge
WHERE sku.formula_id = merge.legacy_formula_id
  AND sku.active;

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
FROM purina_one_formula_merge merge
JOIN public.catalog_field_evidence evidence
  ON evidence.formula_id = merge.legacy_formula_id
LEFT JOIN public.catalog_observations observation
  ON observation.id = evidence.observation_id
WHERE observation.id IS NULL
   OR observation.validation_status <> 'quarantined'
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted;

UPDATE public.catalog_manual_evidence_reviews review
SET
  formula_id = merge.canonical_formula_id,
  updated_at = now()
FROM purina_one_formula_merge merge
WHERE review.formula_id = merge.legacy_formula_id;

UPDATE public.catalog_census_formula_members member
SET formula_id = merge.canonical_formula_id
FROM purina_one_formula_merge merge
WHERE member.formula_id = merge.legacy_formula_id;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
)
SELECT
  legacy.formula_key,
  merge.canonical_formula_id,
  legacy.identity_hash,
  'manual_review',
  legacy.source_url,
  jsonb_build_object(
    'consolidated_formula_id', merge.legacy_formula_id,
    'migration', '20260725143000_repair_purina_one_healthy_weight_formula',
    'identity_evidence',
      'current official Turkey ingredients/image plus exact PetSmart Turkey SKU'
  )
FROM purina_one_formula_merge merge
JOIN public.catalog_formulas legacy
  ON legacy.id = merge.legacy_formula_id
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Upgrade the canonical formula with current manufacturer evidence and a
-- formula-grain identity that excludes package size.
UPDATE public.catalog_formulas canonical
SET
  formula_key =
    'purina one|purina one|plus healthy weight high protein formula|dog|adult|dry|turkey|',
  identity_hash =
    '015522dca0d47931749071cf3ee3b0614e2a4d0f92dfc3be1b1b9eea016c9280',
  manufacturer = 'purina one',
  brand = 'purina one',
  product_name =
    'Purina ONE +Plus Healthy Weight High-Protein Formula Dry Dog Food',
  product_line = 'plus healthy weight high protein formula',
  pet_type = 'dog',
  life_stage = 'adult',
  food_form = 'dry',
  flavor = 'turkey',
  diet_condition = '',
  source_authority = 'manufacturer',
  source_url = official.source_url,
  ingredient_text = official.ingredient_text,
  ingredients = official.ingredients,
  front_image_url = official.image_url,
  is_complete_food = TRUE,
  complete_food_evidence =
    'Official Purina adult-maintenance complete-and-balanced statement',
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  protected_terms = ARRAY[
    'purina one',
    'plus',
    'healthy weight',
    'high protein',
    'turkey',
    'adult',
    'dry'
  ]::TEXT[],
  verification_status = 'verified',
  promoted_cache_key = official.cache_key,
  promoted_at = now(),
  active = TRUE,
  absent_since = NULL,
  updated_at = now()
FROM purina_one_formula_merge merge
JOIN public.product_data official
  ON official.cache_key = 'nestle-purina-one:017800570534'
WHERE canonical.id = merge.canonical_formula_id;

UPDATE public.catalog_formulas legacy
SET
  active = FALSE,
  absent_since = COALESCE(legacy.absent_since, now()),
  verification_status = 'quarantined',
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = now()
FROM purina_one_formula_merge merge
WHERE legacy.id = merge.legacy_formula_id;

-- The old serving row had the right Turkey ingredients but a stale Chicken
-- title and older formula revision. Keep it only as a terminal SKU/source alias.
UPDATE public.product_data product
SET
  product_name =
    'Purina ONE+ Plus Healthy Weight Dry Dog Food - High Protein, Turkey',
  product_line = '+Plus Healthy Weight High-Protein Formula',
  flavor = 'Turkey',
  life_stage = 'adult',
  source_url =
    'https://www.petsmart.com/dog/food/dry-food/purina-one-plus-healthy-weight-dry-dog-food-high-protein-turkey-3501.html',
  catalog_exclusion_reason =
    'superseded_formula_version_official_manufacturer_canonical',
  updated_at = now()
WHERE product.cache_key = 'petsmart-retail-catalog:017800149211';

UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(
    NULLIF(evidence.rejection_reason, ''),
    'superseded_formula_version_official_manufacturer_canonical'
  ),
  evidence = COALESCE(evidence.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'superseded_at', now(),
      'superseded_by',
        '20260725143000_repair_purina_one_healthy_weight_formula',
      'canonical_cache_key', 'nestle-purina-one:017800570534',
      'reason',
        'official current Turkey formula replaces stale retailer formula revision'
    ),
  updated_at = now()
WHERE evidence.cache_key = 'petsmart-retail-catalog:017800149211';

UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason =
    'current official Turkey formula promoted; PetSmart package retained as SKU child',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'resolved_by',
        '20260725143000_repair_purina_one_healthy_weight_formula',
      'canonical_cache_key', 'nestle-purina-one:017800570534'
    ),
  updated_at = now()
WHERE queue.cache_key = 'petsmart-retail-catalog:017800149211'
  AND queue.status IN ('open', 'in_progress');

SELECT public.close_stale_catalog_acquisition_queue_gaps(now())
  AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  canonical_ready_count INTEGER;
  canonical_formula_count INTEGER;
  active_legacy_formula_count INTEGER;
  required_sku_count INTEGER;
  wrong_puppy_count INTEGER;
BEGIN
  SELECT count(*)
  INTO canonical_ready_count
  FROM public.product_data
  WHERE cache_key = 'nestle-purina-one:017800570534'
    AND catalog_exclusion_reason IS NULL
    AND flavor = 'Turkey'
    AND life_stage = 'adult'
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

  SELECT count(*)
  INTO canonical_formula_count
  FROM public.catalog_formulas
  WHERE identity_hash =
    '015522dca0d47931749071cf3ee3b0614e2a4d0f92dfc3be1b1b9eea016c9280'
    AND active
    AND verification_status = 'verified'
    AND source_authority = 'manufacturer'
    AND promoted_cache_key = 'nestle-purina-one:017800570534';

  SELECT count(*)
  INTO active_legacy_formula_count
  FROM purina_one_formula_merge merge
  JOIN public.catalog_formulas legacy
    ON legacy.id = merge.legacy_formula_id
  WHERE legacy.active;

  SELECT count(DISTINCT sku.gtin)
  INTO required_sku_count
  FROM purina_one_formula_merge merge
  JOIN public.catalog_skus sku
    ON sku.formula_id = merge.canonical_formula_id
  WHERE sku.gtin IN ('017800149211', '017800570534')
    AND sku.active;

  SELECT count(*)
  INTO wrong_puppy_count
  FROM public.catalog_skus sku
  WHERE sku.source_external_id = '10448981'
    AND sku.source_url ILIKE '%healthy-puppy%'
    AND sku.active;

  IF canonical_ready_count <> 1
      OR canonical_formula_count <> 1
      OR active_legacy_formula_count <> 0
      OR required_sku_count <> 2
      OR wrong_puppy_count <> 0 THEN
    RAISE EXCEPTION
      'Purina ONE repair failed: serving %, formula %, legacy %, SKUs %, puppy contamination %',
      canonical_ready_count, canonical_formula_count,
      active_legacy_formula_count, required_sku_count,
      wrong_puppy_count;
  END IF;
END $$;
