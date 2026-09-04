-- Merge PetSmart 7 lb package records into the current exact Purina
-- manufacturer formulas for two Pro Plan Adult 7+ dry cat foods. Package size
-- and GTIN remain SKU children; Indoor and Complete Essentials remain separate
-- protected formulas.

CREATE TEMP TABLE pro_plan_senior_cat_merge (
  formula_name TEXT PRIMARY KEY,
  canonical_cache_key TEXT NOT NULL UNIQUE,
  legacy_cache_key TEXT NOT NULL UNIQUE,
  canonical_formula_id BIGINT,
  legacy_formula_id BIGINT,
  protected_terms TEXT[] NOT NULL
) ON COMMIT DROP;

INSERT INTO pro_plan_senior_cat_merge (
  formula_name,
  canonical_cache_key,
  legacy_cache_key,
  canonical_formula_id,
  legacy_formula_id,
  protected_terms
)
VALUES
  (
    'adult_7_indoor_chicken_rice',
    'nestle-purina-pro-plan:038100104014',
    'petsmart-retail-catalog:038100104038',
    (
      SELECT min(sku.formula_id)
      FROM public.catalog_skus sku
      WHERE sku.source_external_id =
        'nestle-purina-pro-plan:038100104014'
    ),
    (
      SELECT min(sku.formula_id)
      FROM public.catalog_skus sku
      WHERE sku.source_external_id =
        'petsmart-retail-catalog:038100104038'
    ),
    ARRAY[
      'purina pro plan',
      'adult 7+',
      'senior',
      'indoor',
      'chicken',
      'rice',
      'dry',
      'cat'
    ]::TEXT[]
  ),
  (
    'adult_7_complete_essentials_chicken_rice',
    'nestle-purina-pro-plan:038100105752',
    'petsmart-retail-catalog:038100105776',
    (
      SELECT min(sku.formula_id)
      FROM public.catalog_skus sku
      WHERE sku.source_external_id =
        'nestle-purina-pro-plan:038100105752'
    ),
    (
      SELECT min(sku.formula_id)
      FROM public.catalog_skus sku
      WHERE sku.source_external_id =
        'petsmart-retail-catalog:038100105776'
    ),
    ARRAY[
      'purina pro plan',
      'adult 7+',
      'senior',
      'complete essentials',
      'chicken',
      'rice',
      'dry',
      'cat'
    ]::TEXT[]
  );

DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT count(*)
  INTO invalid_count
  FROM pro_plan_senior_cat_merge merge
  LEFT JOIN public.product_data official
    ON official.cache_key = merge.canonical_cache_key
  LEFT JOIN public.product_data retailer
    ON retailer.cache_key = merge.legacy_cache_key
  LEFT JOIN public.catalog_formulas canonical
    ON canonical.id = merge.canonical_formula_id
  LEFT JOIN public.catalog_formulas legacy
    ON legacy.id = merge.legacy_formula_id
  WHERE official.cache_key IS NULL
     OR retailer.cache_key IS NULL
     OR canonical.id IS NULL
     OR legacy.id IS NULL
     OR merge.canonical_formula_id = merge.legacy_formula_id
     OR official.brand <> 'Purina Pro Plan'
     OR retailer.brand <> 'Purina Pro Plan'
     OR official.pet_type <> 'cat'
     OR retailer.pet_type <> 'cat'
     OR official.food_form <> 'dry'
     OR retailer.food_form <> 'dry'
     OR official.product_name NOT ILIKE '%Adult 7+%'
     OR official.product_name NOT ILIKE '%Chicken%'
     OR official.product_name NOT ILIKE '%Rice%'
     OR retailer.product_name NOT ILIKE '%Chicken%'
     OR official.source_quality <> 'manufacturer'
     OR official.ingredient_verification_status <> 'manufacturer'
     OR official.image_verification_status <> 'manufacturer'
     OR public.catalog_quality_state(
       official.pet_type,
       official.is_complete_food,
       official.catalog_exclusion_reason,
       official.ingredient_text,
       COALESCE(array_length(official.ingredients, 1), 0),
       official.ingredient_verification_status,
       official.image_url,
       official.image_verification_status,
       official.source_url,
       official.expires_at
     ) <> 'verified_ready'
     OR regexp_replace(
       lower(official.ingredient_text),
       '[^a-z0-9]',
       '',
       'g'
     ) <> regexp_replace(
       lower(retailer.ingredient_text),
       '[^a-z0-9]',
       '',
       'g'
     )
     OR (
       merge.formula_name = 'adult_7_indoor_chicken_rice'
       AND (
         official.product_name NOT ILIKE '%Indoor%'
         OR legacy.formula_key NOT ILIKE '%adult%7%indoor%'
         OR official.product_name ILIKE '%Complete Essentials%'
       )
     )
     OR (
       merge.formula_name =
         'adult_7_complete_essentials_chicken_rice'
       AND (
         official.product_name NOT ILIKE '%Complete Essentials%'
         OR legacy.formula_key NOT ILIKE '%complete%essentials%'
         OR official.product_name ILIKE '%Indoor%'
       )
     );

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION
      'Pro Plan senior cat merge identity assertion failed for % rows',
      invalid_count;
  END IF;
END $$;

-- Adult 7+ is explicit senior-stage evidence on both current manufacturer
-- pages. Normalize the official serving identity before promotion.
UPDATE public.product_data official
SET
  life_stage = 'senior',
  updated_at = now()
FROM pro_plan_senior_cat_merge merge
WHERE official.cache_key = merge.canonical_cache_key
  AND official.life_stage IS DISTINCT FROM 'senior';

UPDATE public.catalog_observations observation
SET formula_id = merge.canonical_formula_id
FROM pro_plan_senior_cat_merge merge
WHERE observation.formula_id = merge.legacy_formula_id;

UPDATE public.catalog_skus sku
SET
  formula_id = merge.canonical_formula_id,
  updated_at = now()
FROM pro_plan_senior_cat_merge merge
WHERE sku.formula_id = merge.legacy_formula_id;

-- The current official PDP size selectors explicitly publish the 7 lb GTINs
-- represented by the PetSmart package rows. Persist that manufacturer-level
-- package evidence on the canonical formula.
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
  NULL,
  'package_gtin',
  to_jsonb(retailer.gtin),
  official.source_url,
  'manufacturer',
  TRUE,
  COALESCE(official.scraped_at, official.updated_at, now()),
  md5(concat_ws(
    '|',
    merge.canonical_cache_key,
    retailer.gtin,
    official.source_url,
    'official_pdp_size_selector'
  ))
FROM pro_plan_senior_cat_merge merge
JOIN public.product_data official
  ON official.cache_key = merge.canonical_cache_key
JOIN public.product_data retailer
  ON retailer.cache_key = merge.legacy_cache_key
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET accepted = TRUE;

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
FROM pro_plan_senior_cat_merge merge
JOIN public.catalog_field_evidence evidence
  ON evidence.formula_id = merge.legacy_formula_id
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted;

UPDATE public.catalog_manual_evidence_reviews review
SET
  formula_id = merge.canonical_formula_id,
  updated_at = now()
FROM pro_plan_senior_cat_merge merge
WHERE review.formula_id = merge.legacy_formula_id;

UPDATE public.catalog_census_formula_members member
SET formula_id = merge.canonical_formula_id
FROM pro_plan_senior_cat_merge merge
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
    'migration',
      '20260725152000_merge_pro_plan_senior_cat_size_variants',
    'identity_evidence',
      'official PDP size-selector GTIN plus normalized exact ingredients across official and retailer packages',
    'formula_name', merge.formula_name
  )
FROM pro_plan_senior_cat_merge merge
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

UPDATE public.catalog_formulas canonical
SET
  manufacturer = 'purina pro plan',
  brand = 'purina pro plan',
  product_name = official.product_name,
  pet_type = 'cat',
  life_stage = 'senior',
  food_form = 'dry',
  is_complete_food = TRUE,
  complete_food_evidence =
    'Current exact Purina manufacturer complete-and-balanced product evidence',
  ingredient_text = official.ingredient_text,
  ingredients = official.ingredients,
  front_image_url = official.image_url,
  source_url = official.source_url,
  source_authority = 'manufacturer',
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  protected_terms = merge.protected_terms,
  verification_status = 'verified',
  active = TRUE,
  absent_since = NULL,
  promoted_cache_key = official.cache_key,
  promoted_at = now(),
  last_observed_at = GREATEST(
    canonical.last_observed_at,
    COALESCE(official.scraped_at, official.updated_at)
  ),
  updated_at = now()
FROM pro_plan_senior_cat_merge merge
JOIN public.product_data official
  ON official.cache_key = merge.canonical_cache_key
WHERE canonical.id = merge.canonical_formula_id;

UPDATE public.catalog_formulas legacy
SET
  active = FALSE,
  absent_since = COALESCE(legacy.absent_since, now()),
  verification_status = 'quarantined',
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = now()
FROM pro_plan_senior_cat_merge merge
WHERE legacy.id = merge.legacy_formula_id;

UPDATE public.product_data retailer
SET
  catalog_exclusion_reason = 'duplicate_exact_verified_catalog_row',
  updated_at = now()
FROM pro_plan_senior_cat_merge merge
WHERE retailer.cache_key = merge.legacy_cache_key;

UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(
    NULLIF(evidence.rejection_reason, ''),
    'duplicate_exact_verified_catalog_row'
  ),
  evidence = COALESCE(evidence.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by',
        '20260725152000_merge_pro_plan_senior_cat_size_variants',
      'canonical_cache_key', merge.canonical_cache_key,
      'identity_basis',
        'exact protected identity and normalized exact ingredient statement'
    ),
  updated_at = now()
FROM pro_plan_senior_cat_merge merge
WHERE evidence.cache_key = merge.legacy_cache_key;

UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason =
    'exact 7 lb retailer package attached to current manufacturer formula',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'resolved_by',
        '20260725152000_merge_pro_plan_senior_cat_size_variants',
      'canonical_cache_key', merge.canonical_cache_key
    ),
  updated_at = now()
FROM pro_plan_senior_cat_merge merge
WHERE queue.cache_key = merge.legacy_cache_key
  AND queue.status IN ('open', 'in_progress');

SELECT public.close_stale_catalog_acquisition_queue_gaps(now())
  AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  promoted_count INTEGER;
  active_legacy_formula_count INTEGER;
  active_retailer_alias_count INTEGER;
  official_sku_resolution_count INTEGER;
  retailer_sku_resolution_count INTEGER;
BEGIN
  SELECT count(*)
  INTO promoted_count
  FROM pro_plan_senior_cat_merge merge
  JOIN public.catalog_formulas formula
    ON formula.id = merge.canonical_formula_id
  WHERE formula.promoted_cache_key = merge.canonical_cache_key
    AND formula.verification_status = 'verified'
    AND formula.active
    AND formula.life_stage = 'senior'
    AND formula.pet_type = 'cat'
    AND formula.food_form = 'dry';

  SELECT count(*)
  INTO active_legacy_formula_count
  FROM pro_plan_senior_cat_merge merge
  JOIN public.catalog_formulas legacy
    ON legacy.id = merge.legacy_formula_id
  WHERE legacy.active;

  SELECT count(*)
  INTO active_retailer_alias_count
  FROM pro_plan_senior_cat_merge merge
  JOIN public.product_data retailer
    ON retailer.cache_key = merge.legacy_cache_key
  WHERE retailer.catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO official_sku_resolution_count
  FROM (
    SELECT *
    FROM public.resolve_verified_product_by_gtin('038100104014', 8)
    UNION ALL
    SELECT *
    FROM public.resolve_verified_product_by_gtin('038100105752', 8)
  ) resolved
  WHERE resolved.ingredient_verification_status = 'manufacturer'
    AND resolved.image_verification_status = 'manufacturer';

  SELECT count(*)
  INTO retailer_sku_resolution_count
  FROM (
    SELECT *
    FROM public.resolve_verified_product_by_gtin('038100104038', 8)
    UNION ALL
    SELECT *
    FROM public.resolve_verified_product_by_gtin('038100105776', 8)
  ) resolved
  WHERE resolved.ingredient_verification_status = 'manufacturer'
    AND resolved.image_verification_status = 'manufacturer'
    AND resolved.package_size = '7 Lb';

  IF promoted_count <> 2
      OR active_legacy_formula_count <> 0
      OR active_retailer_alias_count <> 0
      OR official_sku_resolution_count <> 2
      OR retailer_sku_resolution_count <> 2 THEN
    RAISE EXCEPTION
      'Pro Plan senior cat merge failed: promoted %, active legacy formulas %, active aliases %, official SKU resolutions %, retailer SKU resolutions %',
      promoted_count,
      active_legacy_formula_count,
      active_retailer_alias_count,
      official_sku_resolution_count,
      retailer_sku_resolution_count;
  END IF;
END $$;
