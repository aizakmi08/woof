UPDATE public.product_data
SET
  source_quality = 'unknown',
  ingredient_verification_status = 'unverified',
  image_verification_status = 'unverified',
  verified_at = NULL,
  catalog_exclusion_reason = COALESCE(NULLIF(catalog_exclusion_reason, ''), 'generic_verified_source'),
  updated_at = now()
WHERE lower(COALESCE(source, '')) IN ('manufacturer', 'official', 'retailer', 'gdsn', 'unknown')
  AND lower(COALESCE(source_quality, '')) IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
  AND lower(COALESCE(ingredient_verification_status, '')) IN (
    'gdsn',
    'official',
    'manufacturer',
    'retailer_verified',
    'label_ocr_verified'
  )
  AND lower(COALESCE(image_verification_status, '')) IN (
    'official',
    'manufacturer',
    'retailer_verified',
    'label_ocr_verified'
  );

UPDATE public.catalog_product_evidence e
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(NULLIF(e.rejection_reason, ''), 'generic_verified_source'),
  evidence = COALESCE(e.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'rejected_after_backfill', true,
      'rejection_reason', 'generic_verified_source'
    ),
  updated_at = now()
WHERE lower(COALESCE(e.source, '')) IN ('manufacturer', 'official', 'retailer', 'gdsn', 'unknown')
  AND e.review_state = 'promoted';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.product_data'::regclass
      AND conname = 'product_data_verified_source_not_generic'
  ) THEN
    ALTER TABLE public.product_data
      ADD CONSTRAINT product_data_verified_source_not_generic
      CHECK (
        NOT (
          lower(COALESCE(source, '')) IN ('manufacturer', 'official', 'retailer', 'gdsn', 'unknown')
          AND lower(COALESCE(source_quality, '')) IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
          AND lower(COALESCE(ingredient_verification_status, '')) IN (
            'gdsn',
            'official',
            'manufacturer',
            'retailer_verified',
            'label_ocr_verified'
          )
          AND lower(COALESCE(image_verification_status, '')) IN (
            'official',
            'manufacturer',
            'retailer_verified',
            'label_ocr_verified'
          )
        )
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.product_data
  VALIDATE CONSTRAINT product_data_verified_source_not_generic;
