DO $$
BEGIN
  PERFORM public.close_stale_catalog_acquisition_queue_gaps(now());

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'Exact current Nature''s Logic PURE NATURALS formula promoted; typed search and the official 24 lb GTIN resolve to one canonical formula.',
    acquisition_notes = 'Official current PDP and exact front/back package images verify PURE NATURALS Grain-Free Chicken Recipe dry dog food, all-life-stages complete-food adequacy, exact ingredient order, front image, and GTIN 850013992768. The prior Distinction/PURE NATURALS title collision, wet-form error, and malformed ingredient text were repaired from exact package evidence.',
    updated_at = now(),
    last_refreshed_at = now(),
    needs_verified_ingredients = false,
    needs_verified_image = false,
    needs_pet_type = false,
    ready_rows = 1
  WHERE gap_key = 'product:natures-logic:nature s logic distinction canine fowl recipe grain free chicken dog foodpure naturals grain-free chicken recipe';

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'No remaining open Nature''s Logic product-level verified-evidence gaps.',
    acquisition_notes = 'The final actionable Nature''s Logic serving-row gap was repaired from exact official package evidence. Deferred retailer/community aliases remain excluded and were not promoted.',
    updated_at = now(),
    last_refreshed_at = now(),
    needs_verified_ingredients = false,
    needs_verified_image = false
  WHERE gap_key = 'brand:1550b3c2e83a26e53b4cebf51ff68688'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_acquisition_queue q
      WHERE regexp_replace(lower(q.brand), '[^a-z0-9]+', '', 'g') = 'natureslogic'
        AND q.gap_type = 'product'
        AND q.status IN ('open', 'in_progress', 'blocked', 'imported')
    );

  IF EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE regexp_replace(lower(brand), '[^a-z0-9]+', '', 'g') = 'natureslogic'
      AND status IN ('open', 'in_progress', 'blocked', 'imported')
  ) THEN
    RAISE EXCEPTION 'Nature''s Logic actionable queue gaps remain';
  END IF;
END
$$;
