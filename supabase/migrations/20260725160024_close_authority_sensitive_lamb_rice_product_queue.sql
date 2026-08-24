-- The OCR-only row has no authoritative formula version. Keep it deferred
-- while the current exact package family remains searchable.
SELECT public.close_stale_catalog_acquisition_queue_gaps(now());

UPDATE public.catalog_acquisition_queue
SET
  status = 'deferred',
  resolved_at = now(),
  resolution_reason =
    'older OCR-only formula version quarantined; current exact Authority Lamb & Rice formula is verified and searchable',
  acquisition_notes = concat_ws(
    ' | ',
    NULLIF(acquisition_notes, ''),
    'Do not copy the current formula into the original OCR record. Reopen only if authoritative evidence identifies that older formula version.'
  ),
  sample_metadata = COALESCE(sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'closed_by',
        'close_authority_sensitive_lamb_rice_product_queue',
      'closed_at', now(),
      'stale_formula_version_conflict', TRUE,
      'current_canonical_cache_key', 'petsmart-authority:196481089488',
      'current_canonical_formula_key',
        'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin',
      'package_variant_count', 4
    ),
  updated_at = now()
WHERE gap_key =
  'product:authority authority adult sensitive stomach skin lamb rice';

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.catalog_acquisition_queue
  WHERE gap_key =
      'product:authority authority adult sensitive stomach skin lamb rice'
    AND status = 'deferred'
    AND resolution_reason LIKE
      'older OCR-only formula version quarantined%';

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Authority product queue closure failed: %',
      v_count;
  END IF;
END $$;
