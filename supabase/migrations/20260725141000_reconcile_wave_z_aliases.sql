-- Keep the seven exact Wave Z rows as canonical formula records and retire only
-- aliases whose identity is proven by an exact GTIN plus matching protected
-- identity fields. The one different-GTIN pair is the same exact puppy formula
-- in an 11 lb package; its active SKU child remains in catalog_skus while the
-- duplicate serving-table formula row is retired. Twelve-digit UPC-A values and
-- their leading-zero GTIN-13 representations are the same package identifier
-- for the other explicit pairs.

DO $$
DECLARE
  ready_count INTEGER;
  manufacturer_count INTEGER;
  retailer_count INTEGER;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (
      WHERE source_quality = 'manufacturer'
        AND ingredient_verification_status = 'manufacturer'
        AND image_verification_status = 'manufacturer'
    ),
    count(*) FILTER (
      WHERE source_quality = 'retailer_verified'
        AND ingredient_verification_status = 'retailer_verified'
        AND image_verification_status = 'retailer_verified'
    )
  INTO ready_count, manufacturer_count, retailer_count
  FROM public.product_data
  WHERE (
      cache_key LIKE 'manufacturer-reviewed-wave-z-20260725:%'
      OR cache_key LIKE 'petsmart-private-reviewed-wave-z-20260725:%'
    )
    AND catalog_exclusion_reason IS NULL
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

  IF ready_count <> 7 OR manufacturer_count <> 2 OR retailer_count <> 5 THEN
    RAISE EXCEPTION
      'expected 7 Wave Z rows (2 manufacturer, 5 retailer), found % / % / %',
      ready_count, manufacturer_count, retailer_count;
  END IF;
END $$;

CREATE TEMP TABLE wave_z_alias_pairs (
  legacy_cache_key TEXT PRIMARY KEY,
  canonical_cache_key TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO wave_z_alias_pairs (legacy_cache_key, canonical_cache_key)
VALUES
  (
    'hill-s-pet-nutrition:052742011936',
    'manufacturer-reviewed-wave-z-20260725:052742011936'
  ),
  (
    'petsmart-retail-catalog:052742011936',
    'manufacturer-reviewed-wave-z-20260725:052742011936'
  ),
  (
    'nestle-purina-pro-plan:038100026972',
    'manufacturer-reviewed-wave-z-20260725:038100026972'
  ),
  (
    'petsmart-authority:196481056596',
    'petsmart-private-reviewed-wave-z-20260725:0196481056596'
  ),
  (
    'petsmart-retail-catalog:196481056596',
    'petsmart-private-reviewed-wave-z-20260725:0196481056596'
  ),
  (
    'petsmart-simply-nourish:0196481058996',
    'petsmart-private-reviewed-wave-z-20260725:0196481058996'
  ),
  (
    'petsmart-retail-catalog:196481058774',
    'petsmart-private-reviewed-wave-z-20260725:0196481058996'
  ),
  (
    'petsmart-simply-nourish:0737257826922',
    'petsmart-private-reviewed-wave-z-20260725:0737257826922'
  ),
  (
    'petsmart-simply-nourish:737257826922',
    'petsmart-private-reviewed-wave-z-20260725:0737257826922'
  ),
  (
    'petsmart-simply-nourish:0737257827462',
    'petsmart-private-reviewed-wave-z-20260725:0737257827462'
  ),
  (
    'petsmart-simply-nourish:737257827462',
    'petsmart-private-reviewed-wave-z-20260725:0737257827462'
  ),
  (
    'petsmart-simply-nourish:0737257829947',
    'petsmart-private-reviewed-wave-z-20260725:0737257829947'
  );

DO $$
DECLARE
  incompatible_count INTEGER;
BEGIN
  SELECT count(*)
  INTO incompatible_count
  FROM wave_z_alias_pairs pairs
  JOIN public.product_data legacy
    ON legacy.cache_key = pairs.legacy_cache_key
  JOIN public.product_data canonical
    ON canonical.cache_key = pairs.canonical_cache_key
  WHERE lower(regexp_replace(legacy.brand, '[^a-z0-9]+', '', 'g'))
          <> lower(regexp_replace(canonical.brand, '[^a-z0-9]+', '', 'g'))
     OR legacy.pet_type IS DISTINCT FROM canonical.pet_type
     OR legacy.food_form IS DISTINCT FROM canonical.food_form
     OR (
       ltrim(regexp_replace(COALESCE(legacy.gtin, ''), '[^0-9]', '', 'g'), '0')
         <> ltrim(regexp_replace(COALESCE(canonical.gtin, ''), '[^0-9]', '', 'g'), '0')
       AND NOT (
         legacy.cache_key = 'petsmart-retail-catalog:196481058774'
         AND legacy.product_name = canonical.product_name
         AND legacy.flavor = canonical.flavor
         AND legacy.life_stage = canonical.life_stage
       )
     );

  IF incompatible_count <> 0 THEN
    RAISE EXCEPTION 'Wave Z alias identity assertion failed for % rows',
      incompatible_count;
  END IF;
END $$;

CREATE TEMP TABLE wave_z_sku_links (
  canonical_cache_key TEXT PRIMARY KEY,
  prior_source_external_id TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO wave_z_sku_links (
  canonical_cache_key,
  prior_source_external_id
)
VALUES
  (
    'petsmart-private-reviewed-wave-z-20260725:0196481056596',
    'petsmart-authority:196481056596'
  ),
  (
    'petsmart-private-reviewed-wave-z-20260725:0196481058996',
    'petsmart-simply-nourish:196481058774'
  ),
  (
    'petsmart-private-reviewed-wave-z-20260725:0737257826922',
    'petsmart-simply-nourish:196481122642'
  ),
  (
    'petsmart-private-reviewed-wave-z-20260725:0737257827462',
    'petsmart-simply-nourish:737257827462'
  ),
  (
    'petsmart-private-reviewed-wave-z-20260725:0737257829947',
    'petsmart-simply-nourish:737257829954'
  );

DO $$
DECLARE
  unresolved_count INTEGER;
BEGIN
  SELECT count(*)
  INTO unresolved_count
  FROM wave_z_sku_links links
  WHERE (
    SELECT count(DISTINCT sku.formula_id)
    FROM public.catalog_skus sku
    WHERE sku.source_external_id = links.prior_source_external_id
  ) <> 1;

  IF unresolved_count <> 0 THEN
    RAISE EXCEPTION
      'Wave Z SKU-child formula resolution failed for % rows',
      unresolved_count;
  END IF;
END $$;

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
  (
    SELECT min(sku.formula_id)
    FROM public.catalog_skus sku
    WHERE sku.source_external_id = links.prior_source_external_id
  ),
  canonical.gtin,
  canonical.package_size,
  NULL,
  'petsmart-private-reviewed-wave-z-20260725',
  canonical.cache_key,
  canonical.source_url,
  TRUE,
  COALESCE(canonical.scraped_at, canonical.created_at, now()),
  COALESCE(canonical.scraped_at, canonical.created_at, now()),
  now(),
  now()
FROM wave_z_sku_links links
JOIN public.product_data canonical
  ON canonical.cache_key = links.canonical_cache_key
ON CONFLICT (source_slug, source_external_id, gtin, package_size)
  DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = now();

UPDATE public.product_data legacy
SET
  catalog_exclusion_reason = 'duplicate_exact_verified_catalog_row',
  updated_at = now()
FROM wave_z_alias_pairs pairs
WHERE legacy.cache_key = pairs.legacy_cache_key;

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
      'duplicate_closed_by', '20260725141000_reconcile_wave_z_aliases',
      'canonical_cache_key', pairs.canonical_cache_key,
      'identity_basis', 'explicit exact GTIN and protected identity review'
    ),
  updated_at = now()
FROM wave_z_alias_pairs pairs
WHERE evidence.cache_key = pairs.legacy_cache_key;

UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason =
    'exact verified alias excluded in favor of canonical Wave Z formula row',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'duplicate_closed_at', now(),
      'duplicate_closed_by', '20260725141000_reconcile_wave_z_aliases',
      'canonical_cache_key', pairs.canonical_cache_key
    ),
  updated_at = now()
FROM wave_z_alias_pairs pairs
WHERE queue.cache_key = pairs.legacy_cache_key
  AND queue.status IN ('open', 'in_progress');

SELECT public.close_stale_catalog_acquisition_queue_gaps(now())
  AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  ready_count INTEGER;
  active_alias_count INTEGER;
  duplicate_formula_count INTEGER;
  attached_sku_count INTEGER;
BEGIN
  SELECT count(*)
  INTO ready_count
  FROM public.product_data
  WHERE (
      cache_key LIKE 'manufacturer-reviewed-wave-z-20260725:%'
      OR cache_key LIKE 'petsmart-private-reviewed-wave-z-20260725:%'
    )
    AND catalog_exclusion_reason IS NULL
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
  INTO active_alias_count
  FROM wave_z_alias_pairs pairs
  JOIN public.product_data legacy
    ON legacy.cache_key = pairs.legacy_cache_key
  WHERE legacy.catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO attached_sku_count
  FROM wave_z_sku_links links
  JOIN public.product_data canonical
    ON canonical.cache_key = links.canonical_cache_key
  JOIN public.catalog_skus sku
    ON sku.source_external_id = canonical.cache_key
   AND sku.gtin = canonical.gtin
   AND sku.package_size IS NOT DISTINCT FROM canonical.package_size
   AND sku.active;

  WITH target_gtins AS (
    SELECT DISTINCT
      ltrim(
        regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g'),
        '0'
      ) AS normalized_gtin
    FROM public.product_data
    WHERE (
        cache_key LIKE 'manufacturer-reviewed-wave-z-20260725:%'
        OR cache_key LIKE 'petsmart-private-reviewed-wave-z-20260725:%'
      )
      AND catalog_exclusion_reason IS NULL
  )
  SELECT count(*)
  INTO duplicate_formula_count
  FROM (
    SELECT
      ltrim(
        regexp_replace(COALESCE(product.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      ) AS normalized_gtin
    FROM public.product_data product
    JOIN target_gtins target
      ON target.normalized_gtin = ltrim(
        regexp_replace(COALESCE(product.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      )
    WHERE product.catalog_exclusion_reason IS NULL
    GROUP BY 1
    HAVING count(*) <> 1
  ) duplicated;

  IF ready_count <> 7
      OR active_alias_count <> 0
      OR attached_sku_count <> 5
      OR duplicate_formula_count <> 0 THEN
    RAISE EXCEPTION
      'Wave Z reconciliation failed: ready %, active aliases %, attached SKUs %, duplicate GTINs %',
      ready_count, active_alias_count, attached_sku_count,
      duplicate_formula_count;
  END IF;
END $$;
