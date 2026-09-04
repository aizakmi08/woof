DO $$
BEGIN
  PERFORM public.close_stale_catalog_acquisition_queue_gaps(now());

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'Exact current Nature''s Select New Zealand Lamb & Rice formula promoted and exact typed search resolves to one canonical adult dry-dog formula.',
    acquisition_notes = 'Official current PDP and 2026 package assets verify Select New Zealand Lamb & Rice Recipe, adult-maintenance AAFCO adequacy, dry form, exact ingredient order, current 28 lb front package, and no published GTIN. One omitted Minerals-group closing parenthesis was restored as a logged token-preserving correction; no GTIN or ingredient was inferred.',
    updated_at = now(),
    last_refreshed_at = now(),
    needs_verified_ingredients = false,
    needs_verified_image = false,
    needs_pet_type = false,
    ready_rows = 1
  WHERE gap_key = 'product:nature-s-select:nature s select nature s select premium pet products select new zealand lamb rice recipe mdash nature s select premium pet products dryfood selectnewzealandrecipe';

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'No remaining open Nature''s Select product-level verified-evidence gaps.',
    acquisition_notes = 'The final actionable Nature''s Select manufacturer row was promoted from current exact official evidence. Low-authority duplicate aliases remain excluded from serving.',
    updated_at = now(),
    last_refreshed_at = now(),
    needs_verified_ingredients = false,
    needs_verified_image = false
  WHERE gap_key = 'brand:298023c277c588e14bae7677432116f8'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_acquisition_queue q
      WHERE regexp_replace(lower(q.brand), '[^a-z0-9]+', '', 'g') = 'naturesselect'
        AND q.gap_type = 'product'
        AND q.status IN ('open', 'in_progress', 'blocked', 'imported')
    );

  IF EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE regexp_replace(lower(brand), '[^a-z0-9]+', '', 'g') = 'naturesselect'
      AND status IN ('open', 'in_progress', 'blocked', 'imported')
  ) THEN
    RAISE EXCEPTION 'Nature''s Select actionable queue gaps remain';
  END IF;
END
$$;
