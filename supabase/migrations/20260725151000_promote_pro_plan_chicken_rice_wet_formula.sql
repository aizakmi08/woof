-- Promote the exact current Purina manufacturer row for the Pro Plan Complete
-- Essentials Adult Chicken & Rice Entrée wet dog formula. The existing
-- PetSmart row is the same GTIN/formula and remains represented as a SKU source,
-- but it must not remain a second serving formula with retailer-normalized
-- ingredient formatting.

DO $$
DECLARE
  ready_count INTEGER;
  formula_count INTEGER;
  incompatible_count INTEGER;
BEGIN
  SELECT count(*)
  INTO ready_count
  FROM public.product_data product
  WHERE product.cache_key = 'nestle-purina-pro-plan:038100026743'
    AND product.gtin = '038100026743'
    AND product.brand = 'Purina Pro Plan'
    AND product.pet_type = 'dog'
    AND product.food_form = 'wet'
    AND product.product_name ILIKE '%Adult%'
    AND product.product_name ILIKE '%Chicken%'
    AND product.product_name ILIKE '%Rice%'
    AND product.source_quality = 'manufacturer'
    AND product.ingredient_verification_status = 'manufacturer'
    AND product.image_verification_status = 'manufacturer'
    AND public.catalog_quality_state(
      product.pet_type,
      product.is_complete_food,
      product.catalog_exclusion_reason,
      product.ingredient_text,
      COALESCE(array_length(product.ingredients, 1), 0),
      product.ingredient_verification_status,
      product.image_url,
      product.image_verification_status,
      product.source_url,
      product.expires_at
    ) = 'verified_ready';

  SELECT count(DISTINCT sku.formula_id)
  INTO formula_count
  FROM public.catalog_skus sku
  JOIN public.catalog_formulas formula
    ON formula.id = sku.formula_id
  WHERE sku.source_external_id IN (
      'nestle-purina-pro-plan:038100026743',
      'petsmart-retail-catalog:038100026743'
    )
    AND formula.active
    AND formula.verification_status = 'verified';

  SELECT count(*)
  INTO incompatible_count
  FROM public.product_data manufacturer
  JOIN public.product_data retailer
    ON retailer.cache_key = 'petsmart-retail-catalog:038100026743'
  WHERE manufacturer.cache_key = 'nestle-purina-pro-plan:038100026743'
    AND (
      ltrim(regexp_replace(manufacturer.gtin, '[^0-9]', '', 'g'), '0')
        <> ltrim(regexp_replace(retailer.gtin, '[^0-9]', '', 'g'), '0')
      OR manufacturer.brand <> retailer.brand
      OR manufacturer.pet_type IS DISTINCT FROM retailer.pet_type
      OR manufacturer.food_form IS DISTINCT FROM retailer.food_form
      OR manufacturer.product_name NOT ILIKE '%Chicken%'
      OR manufacturer.product_name NOT ILIKE '%Rice%'
      OR retailer.product_name NOT ILIKE '%Chicken%'
      OR retailer.product_name NOT ILIKE '%Rice%'
      OR retailer.product_name NOT ILIKE '%Adult%'
    );

  IF ready_count <> 1 OR formula_count <> 1 OR incompatible_count <> 0 THEN
    RAISE EXCEPTION
      'Pro Plan wet promotion prerequisites failed: ready %, formulas %, incompatible %',
      ready_count, formula_count, incompatible_count;
  END IF;
END $$;

UPDATE public.catalog_formulas formula
SET
  manufacturer = 'purina pro plan',
  brand = 'purina pro plan',
  product_name = manufacturer.product_name,
  product_line = 'pro plan complete essentials adult',
  pet_type = 'dog',
  life_stage = 'adult',
  food_form = 'wet',
  flavor = 'chicken and rice entree',
  is_complete_food = TRUE,
  complete_food_evidence =
    'Current exact Purina manufacturer complete-food formula evidence',
  ingredient_text = manufacturer.ingredient_text,
  ingredients = manufacturer.ingredients,
  front_image_url = manufacturer.image_url,
  source_url = manufacturer.source_url,
  source_authority = 'manufacturer',
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  protected_terms = ARRAY[
    'purina pro plan',
    'complete essentials',
    'adult',
    'chicken',
    'rice',
    'entree',
    'classic',
    'wet',
    'dog'
  ]::TEXT[],
  verification_status = 'verified',
  active = TRUE,
  promoted_cache_key = manufacturer.cache_key,
  promoted_at = now(),
  last_observed_at = GREATEST(
    formula.last_observed_at,
    COALESCE(manufacturer.scraped_at, manufacturer.updated_at)
  ),
  updated_at = now()
FROM public.product_data manufacturer
WHERE manufacturer.cache_key = 'nestle-purina-pro-plan:038100026743'
  AND formula.id = (
    SELECT min(sku.formula_id)
    FROM public.catalog_skus sku
    WHERE sku.source_external_id =
      'nestle-purina-pro-plan:038100026743'
  );

UPDATE public.product_data retailer
SET
  catalog_exclusion_reason = 'duplicate_exact_verified_catalog_row',
  updated_at = now()
WHERE retailer.cache_key = 'petsmart-retail-catalog:038100026743';

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
        '20260725151000_promote_pro_plan_chicken_rice_wet_formula',
      'canonical_cache_key', 'nestle-purina-pro-plan:038100026743',
      'identity_basis',
        'exact GTIN, consumer brand, species, life stage, form, and recipe'
    ),
  updated_at = now()
WHERE evidence.cache_key = 'petsmart-retail-catalog:038100026743';

UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason =
    'exact retailer alias resolved to current manufacturer formula',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by',
        '20260725151000_promote_pro_plan_chicken_rice_wet_formula',
      'canonical_cache_key', 'nestle-purina-pro-plan:038100026743'
    ),
  updated_at = now()
WHERE queue.cache_key = 'petsmart-retail-catalog:038100026743'
  AND queue.status IN ('open', 'in_progress');

SELECT public.close_stale_catalog_acquisition_queue_gaps(now())
  AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  promoted_count INTEGER;
  active_alias_count INTEGER;
  sku_resolution_count INTEGER;
BEGIN
  SELECT count(*)
  INTO promoted_count
  FROM public.catalog_formulas formula
  WHERE formula.promoted_cache_key =
      'nestle-purina-pro-plan:038100026743'
    AND formula.verification_status = 'verified'
    AND formula.active
    AND formula.life_stage = 'adult'
    AND formula.pet_type = 'dog'
    AND formula.food_form = 'wet'
    AND formula.flavor = 'chicken and rice entree';

  SELECT count(*)
  INTO active_alias_count
  FROM public.product_data product
  WHERE product.gtin = '038100026743'
    AND product.catalog_exclusion_reason IS NULL
    AND product.cache_key <>
      'nestle-purina-pro-plan:038100026743';

  SELECT count(*)
  INTO sku_resolution_count
  FROM public.resolve_verified_product_by_gtin('038100026743', 8)
  WHERE cache_key = 'nestle-purina-pro-plan:038100026743'
    AND pet_type = 'dog'
    AND food_form = 'wet';

  IF promoted_count <> 1
      OR active_alias_count <> 0
      OR sku_resolution_count <> 1 THEN
    RAISE EXCEPTION
      'Pro Plan wet promotion failed: promoted %, active aliases %, SKU resolutions %',
      promoted_count, active_alias_count, sku_resolution_count;
  END IF;
END $$;
