DO $$
BEGIN
  PERFORM public.close_stale_catalog_acquisition_queue_gaps(now());

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'Exact current Redbarn formula promoted; typed search and all three official package GTINs resolve to one canonical formula.',
    acquisition_notes = 'Official PDP and exact package label verify Powerfood Fusion Whole Grain Land Mix dry dog food, adult-maintenance AAFCO adequacy, exact ingredient order, front image, 3.5 lb UPC 785184120828, 20 lb UPC 785184120729, and case UPC 785184920824. One missing comma and one missing vitamin-group closing parenthesis were restored as logged token-preserving corrections.',
    updated_at = now(),
    last_refreshed_at = now(),
    needs_verified_ingredients = false,
    needs_verified_image = false,
    needs_pet_type = false,
    ready_rows = 1
  WHERE gap_key = 'product:redbarn-pet-products:785184120828';

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'No remaining open Redbarn product-level verified-evidence gaps.',
    acquisition_notes = 'The final actionable Redbarn serving-row gap was promoted from exact official package evidence; no sibling formula or unverified retailer ingredient copy was used.',
    updated_at = now(),
    last_refreshed_at = now(),
    needs_verified_ingredients = false,
    needs_verified_image = false
  WHERE gap_key = 'brand:b5783ef8caaf04b5fdb94aab98444341'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_acquisition_queue q
      WHERE lower(q.brand) = 'redbarn'
        AND q.gap_type = 'product'
        AND q.status IN ('open', 'in_progress', 'blocked', 'imported')
    );

  IF EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE lower(brand) = 'redbarn'
      AND status IN ('open', 'in_progress', 'blocked', 'imported')
  ) THEN
    RAISE EXCEPTION 'Redbarn actionable queue gaps remain';
  END IF;
END
$$;
