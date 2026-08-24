-- Upgrade the exact Wellness CORE Signature Selects Flaked Skipjack Tuna &
-- Wild Salmon formula from retailer serving evidence to the current
-- manufacturer row. Both PetSmart package GTINs remain canonical SKU children.

DO $$
DECLARE
  official_ready_count INTEGER;
  formula_count INTEGER;
  exact_ingredient_match_count INTEGER;
BEGIN
  SELECT count(*)
  INTO official_ready_count
  FROM public.product_data official
  WHERE official.cache_key =
      'wellness-pet-company:wellness wellness core signature selects flaked skipjack tuna wild salmon entree in broth product-catalog wellness-core-signature-selects-flaked-skipjack-tuna-wild-salmon-in-broth'
    AND official.brand = 'Wellness'
    AND official.pet_type = 'cat'
    AND official.food_form = 'wet'
    AND official.product_name ILIKE '%Signature Selects%'
    AND official.product_name ILIKE '%Skipjack Tuna%'
    AND official.product_name ILIKE '%Wild Salmon%'
    AND official.source_quality = 'manufacturer'
    AND official.ingredient_verification_status = 'manufacturer'
    AND official.image_verification_status = 'manufacturer'
    AND public.catalog_quality_state(
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
    ) = 'verified_ready';

  SELECT count(DISTINCT sku.formula_id)
  INTO formula_count
  FROM public.catalog_skus sku
  WHERE sku.source_external_id IN (
    'petsmart-retail-catalog:076344060048',
    'petsmart-retail-catalog:076344060543'
  )
    AND sku.active;

  SELECT count(*)
  INTO exact_ingredient_match_count
  FROM public.product_data retailer
  JOIN public.product_data official
    ON official.cache_key =
      'wellness-pet-company:wellness wellness core signature selects flaked skipjack tuna wild salmon entree in broth product-catalog wellness-core-signature-selects-flaked-skipjack-tuna-wild-salmon-in-broth'
  WHERE retailer.cache_key IN (
      'petsmart-retail-catalog:076344060048',
      'petsmart-retail-catalog:076344060543'
    )
    AND retailer.pet_type = official.pet_type
    AND retailer.food_form = official.food_form
    AND retailer.flavor ILIKE '%Tuna%Salmon%'
    AND regexp_replace(
      lower(retailer.ingredient_text),
      '[^a-z0-9]',
      '',
      'g'
    ) = regexp_replace(
      lower(official.ingredient_text),
      '[^a-z0-9]',
      '',
      'g'
    );

  IF official_ready_count <> 1
      OR formula_count <> 1
      OR exact_ingredient_match_count <> 2 THEN
    RAISE EXCEPTION
      'Wellness manufacturer promotion prerequisites failed: official %, formulas %, exact ingredient packages %',
      official_ready_count,
      formula_count,
      exact_ingredient_match_count;
  END IF;
END $$;

UPDATE public.catalog_formulas formula
SET
  manufacturer = 'wellness',
  brand = 'wellness',
  product_name = official.product_name,
  product_line = 'core signature selects flaked',
  pet_type = 'cat',
  life_stage = 'adult',
  food_form = 'wet',
  flavor = 'skipjack tuna and wild salmon entree',
  is_complete_food = TRUE,
  complete_food_evidence =
    'Current exact Wellness manufacturer complete-food product evidence',
  ingredient_text = official.ingredient_text,
  ingredients = official.ingredients,
  front_image_url = official.image_url,
  source_url = official.source_url,
  source_authority = 'manufacturer',
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  protected_terms = ARRAY[
    'wellness',
    'core',
    'signature selects',
    'flaked',
    'skipjack tuna',
    'wild salmon',
    'entree',
    'broth',
    'adult',
    'wet',
    'cat'
  ]::TEXT[],
  verification_status = 'verified',
  active = TRUE,
  absent_since = NULL,
  promoted_cache_key = official.cache_key,
  promoted_at = now(),
  last_observed_at = GREATEST(
    formula.last_observed_at,
    COALESCE(official.scraped_at, official.updated_at)
  ),
  updated_at = now()
FROM public.product_data official
WHERE official.cache_key =
    'wellness-pet-company:wellness wellness core signature selects flaked skipjack tuna wild salmon entree in broth product-catalog wellness-core-signature-selects-flaked-skipjack-tuna-wild-salmon-in-broth'
  AND formula.id = (
    SELECT min(sku.formula_id)
    FROM public.catalog_skus sku
    WHERE sku.source_external_id =
      'petsmart-retail-catalog:076344060048'
  );

UPDATE public.product_data retailer
SET
  catalog_exclusion_reason = 'duplicate_exact_verified_catalog_row',
  updated_at = now()
WHERE retailer.cache_key IN (
  'petsmart-retail-catalog:076344060048',
  'petsmart-retail-catalog:076344060543'
);

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
        '20260725155000_promote_wellness_signature_selects_manufacturer_formula',
      'canonical_cache_key',
        'wellness-pet-company:wellness wellness core signature selects flaked skipjack tuna wild salmon entree in broth product-catalog wellness-core-signature-selects-flaked-skipjack-tuna-wild-salmon-in-broth',
      'identity_basis',
        'exact line, species, form, recipe proteins, and normalized ingredient statement'
    ),
  updated_at = now()
WHERE evidence.cache_key IN (
  'petsmart-retail-catalog:076344060048',
  'petsmart-retail-catalog:076344060543'
);

UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason =
    'exact retailer package attached to current manufacturer formula',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'resolved_by',
        '20260725155000_promote_wellness_signature_selects_manufacturer_formula',
      'canonical_cache_key',
        'wellness-pet-company:wellness wellness core signature selects flaked skipjack tuna wild salmon entree in broth product-catalog wellness-core-signature-selects-flaked-skipjack-tuna-wild-salmon-in-broth'
    ),
  updated_at = now()
WHERE queue.cache_key IN (
    'petsmart-retail-catalog:076344060048',
    'petsmart-retail-catalog:076344060543'
  )
  AND queue.status IN ('open', 'in_progress');

SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  promoted_count INTEGER;
  active_retailer_alias_count INTEGER;
  barcode_resolution_count INTEGER;
  open_direct_gap_count INTEGER;
BEGIN
  SELECT count(*)
  INTO promoted_count
  FROM public.catalog_formulas formula
  WHERE formula.promoted_cache_key =
      'wellness-pet-company:wellness wellness core signature selects flaked skipjack tuna wild salmon entree in broth product-catalog wellness-core-signature-selects-flaked-skipjack-tuna-wild-salmon-in-broth'
    AND formula.active
    AND formula.verification_status = 'verified'
    AND formula.pet_type = 'cat'
    AND formula.food_form = 'wet';

  SELECT count(*)
  INTO active_retailer_alias_count
  FROM public.product_data retailer
  WHERE retailer.cache_key IN (
      'petsmart-retail-catalog:076344060048',
      'petsmart-retail-catalog:076344060543'
    )
    AND retailer.catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO barcode_resolution_count
  FROM (
    SELECT *
    FROM public.resolve_verified_product_by_gtin('076344060048', 8)
    UNION ALL
    SELECT *
    FROM public.resolve_verified_product_by_gtin('076344060543', 8)
  ) resolved
  WHERE resolved.ingredient_verification_status = 'manufacturer'
    AND resolved.image_verification_status = 'manufacturer';

  SELECT count(*)
  INTO open_direct_gap_count
  FROM public.catalog_acquisition_queue queue
  WHERE queue.status IN ('open', 'in_progress')
    AND queue.cache_key IN (
      'petsmart-retail-catalog:076344060048',
      'petsmart-retail-catalog:076344060543'
    );

  IF promoted_count <> 1
      OR active_retailer_alias_count <> 0
      OR barcode_resolution_count <> 2
      OR open_direct_gap_count <> 0 THEN
    RAISE EXCEPTION
      'Wellness manufacturer promotion failed: promoted %, aliases %, barcodes %, open gaps %',
      promoted_count,
      active_retailer_alias_count,
      barcode_resolution_count,
      open_direct_gap_count;
  END IF;
END $$;
