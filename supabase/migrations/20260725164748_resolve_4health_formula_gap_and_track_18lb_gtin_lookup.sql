DO $$
BEGIN
  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason =
      'Exact current Tractor Supply private-label formula promoted; typed search and two reviewed package UPCs resolve to one canonical formula.',
    acquisition_notes =
      'PDP plus front/back package images verify 4health Shreds Adult Lamb and Rice adult dry dog food, exact ingredients, AAFCO maintenance, 35 lb UPC 749394379469, and 5 lb UPC 749394379483. The separately advertised 18 lb package GTIN remains unresolved and is tracked as a lookup gap.',
    updated_at = now(),
    last_refreshed_at = now(),
    needs_verified_ingredients = false,
    needs_verified_image = false,
    needs_pet_type = false,
    ready_rows = 1
  WHERE gap_key = 'product:4health 4health shreds lamb rice';

  INSERT INTO public.catalog_acquisition_queue (
    gap_key, gap_type, status, priority_score, brand, product_name, cache_key,
    normalized_query, pet_type, product_source, source_quality, source_url,
    needs_product_record, needs_verified_ingredients, needs_verified_image,
    needs_pet_type, ready_rows, affected_product_count, demand_events,
    sample_metadata, acquisition_notes, last_refreshed_at, last_event_at,
    updated_at
  ) VALUES (
    'lookup:gtin:4health-shreds-adult-lamb-rice:18lb',
    'lookup',
    'open',
    4,
    '4health',
    '4health Shreds Adult Lamb and Rice Formula Dry Dog Food',
    '4health 4health shreds lamb rice',
    '4health shreds adult lamb rice 18 lb gtin',
    'dog',
    'tractor-supply-private-label-manual',
    'retailer_verified',
    'https://www.tractorsupply.com/tsc/product/4health-shreds-adult-lamb-and-rice-formula-dry-dog-food-35-lb-bag-2457731',
    false,
    false,
    false,
    false,
    1,
    1,
    0,
    jsonb_build_object(
      'package_size', '18 lb',
      'verified_formula_key',
        'tractor supply company|4health|shreds|dog|adult|dry|lamb and rice|',
      'do_not_infer_gtin', true,
      'verified_sibling_gtins',
        jsonb_build_array('749394379469', '749394379483')
    ),
    'Official PDP confirms the 18 lb package exists, but reviewed official evidence did not publish or legibly show its exact GTIN. Obtain exact official package/feed evidence before adding the SKU.',
    now(),
    now(),
    now()
  )
  ON CONFLICT (gap_key) DO UPDATE
  SET
    status = 'open',
    priority_score = excluded.priority_score,
    source_url = excluded.source_url,
    sample_metadata = excluded.sample_metadata,
    acquisition_notes = excluded.acquisition_notes,
    resolved_at = NULL,
    resolution_reason = NULL,
    last_refreshed_at = now(),
    updated_at = now();

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'open',
    resolved_at = NULL,
    resolution_reason = NULL,
    acquisition_notes =
      'The only actionable 4health formula gap is promoted with exact evidence. Brand remains open solely because the published 18 lb package GTIN is not yet proven; no GTIN was inferred from adjacent package numbers or third-party listings.',
    updated_at = now(),
    last_refreshed_at = now()
  WHERE gap_key = 'brand:1e948e4f26a4e57221d50b266f8832b3';

  IF EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE lower(brand) = '4health'
      AND gap_type = 'product'
      AND status IN ('open', 'in_progress', 'blocked', 'imported')
  ) THEN
    RAISE EXCEPTION '4health formula-level acquisition gap remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE gap_key = 'lookup:gtin:4health-shreds-adult-lamb-rice:18lb'
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION '4health 18 lb GTIN lookup was not retained';
  END IF;
END
$$;
