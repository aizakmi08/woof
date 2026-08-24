DO $$
BEGIN
  PERFORM public.close_stale_catalog_acquisition_queue_gaps(now());

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'Exact official Health Extension formula promoted; typed search and both package GTINs resolve to one canonical formula.',
    acquisition_notes = 'Official PDP plus reviewed front/side/back package images verify identity, complete-food status, all-life-stages adequacy, ingredients, image, single-can GTIN 810120990026, and case GTIN 810120990057. One missing vitamin-group closing parenthesis was restored as a logged one-character correction.',
    updated_at = now(),
    last_refreshed_at = now()
  WHERE gap_key = 'product:health-extension:810120990057';

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'No remaining open Health Extension product-level verified-evidence gaps.',
    acquisition_notes = 'Exact official package evidence closed the last actionable product gap; deferred historical/non-ready rows remain excluded from serving.',
    updated_at = now(),
    last_refreshed_at = now()
  WHERE gap_key = 'brand:03e0db11271aec782d0993a80993186c'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_acquisition_queue q
      WHERE lower(q.brand) = 'health extension'
        AND q.gap_type = 'product'
        AND q.status IN ('open', 'in_progress', 'blocked', 'imported')
    );

  IF EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE lower(brand) = 'health extension'
      AND status IN ('open', 'in_progress', 'blocked', 'imported')
  ) THEN
    RAISE EXCEPTION 'Health Extension actionable queue gaps remain';
  END IF;
END
$$;
