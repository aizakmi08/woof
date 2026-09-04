DO $$
BEGIN
  PERFORM public.close_stale_catalog_acquisition_queue_gaps(now());

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'Exact official Applaws formula promoted; canonical serving row passes typed-search and barcode top-1 regression.',
    acquisition_notes = CASE cache_key
      WHEN 'applaws applaws whitefish adult cat'
        THEN 'Resolved to canonical petsmart-retail-catalog:886817005267 using exact official Applaws 4 lb Whitefish PDP evidence. OCR-only row remains quarantined.'
      WHEN 'applaws applaws vitality indoor turkey cod adult cat'
        THEN 'Resolved to canonical petsmart-retail-catalog:886817014375 using exact official Applaws 5 lb Vitality Turkey and Cod PDP evidence. OCR-only row remains quarantined.'
    END,
    updated_at = now(),
    last_refreshed_at = now()
  WHERE gap_key IN (
    'product:applaws applaws whitefish adult cat',
    'product:applaws applaws vitality indoor turkey cod adult cat'
  );

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'No remaining open Applaws product-level verified-evidence gaps after exact official promotions.',
    acquisition_notes = 'Earlier batch-fetch 403 did not block manual lawful official-PDP evidence acquisition. Remaining deferred rows are non-ready/non-complete/no-longer-actionable items.',
    updated_at = now(),
    last_refreshed_at = now()
  WHERE gap_key = 'brand:d26d5b22796ad01b9a04d1d99405206a'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_acquisition_queue q
      WHERE lower(q.brand) = 'applaws'
        AND q.gap_type = 'product'
        AND q.status IN ('open', 'in_progress', 'blocked', 'imported')
    );

  IF EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE lower(brand) = 'applaws'
      AND status IN ('open', 'in_progress', 'blocked', 'imported')
  ) THEN
    RAISE EXCEPTION 'Applaws actionable queue gaps remain open';
  END IF;
END
$$;
