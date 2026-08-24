DO $$
DECLARE
  v_stale_cache_key TEXT := 'victor-pet-food:victor grain free shredded chicken dinner in gravy victor pet food';
  v_current_cache_key TEXT := 'victor-pet-food:victor grain free cuts gravy chicken and vegetables stew victor pet food';
  v_old_url TEXT := 'https://victorpetfood.com/products/grain-free-shredded-chicken-dinner-in-gravy';
  v_redirect_url TEXT := 'https://victorpetfood.com/products/grain-free-cuts-in-gravy-with-chicken-and-vegetables-stew';
BEGIN
  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key = v_stale_cache_key
      AND pet_type = 'cat'
      AND lower(product_name) LIKE '%shredded chicken dinner%'
      AND source_url = v_old_url
  ) <> 1 THEN
    RAISE EXCEPTION 'VICTOR stale cat precondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key = v_current_cache_key
      AND pet_type = 'dog'
      AND lower(product_name) LIKE '%chicken%vegetable%'
      AND source_url = v_redirect_url
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
  ) <> 1 THEN
    RAISE EXCEPTION 'VICTOR current redirected dog formula precondition failed';
  END IF;

  UPDATE public.product_data
  SET
    catalog_exclusion_reason = 'official_source_redirects_to_incompatible_current_formula',
    ingredient_verification_status = 'unverified',
    expires_at = now(),
    updated_at = now()
  WHERE cache_key = v_stale_cache_key;

  UPDATE public.catalog_product_evidence
  SET
    review_state = 'rejected',
    rejection_reason = 'Official historical cat-product URL redirects to an incompatible current dog formula; exact current cat ingredients and package evidence are unavailable.',
    extractor_version = '2026-07-25-official-redirect-identity-guard-v1',
    evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
      'checked_at', now(),
      'historical_url', v_old_url,
      'redirect_target', v_redirect_url,
      'historical_identity', jsonb_build_object(
        'brand', 'VICTOR',
        'pet_type', 'cat',
        'product_line', 'Grain Free Shredded',
        'flavor', 'Chicken Dinner',
        'food_form', 'wet'
      ),
      'redirect_identity', jsonb_build_object(
        'brand', 'VICTOR',
        'pet_type', 'dog',
        'product_name', 'Grain Free Formula Chicken and Vegetables Cuts in Gravy',
        'food_form', 'wet'
      ),
      'no_sibling_promotion', true
    ),
    updated_at = now()
  WHERE cache_key = v_stale_cache_key;

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'deferred',
    resolved_at = now(),
    resolution_reason = 'Official source URL now redirects across species to a different current formula; stale cat row quarantined instead of inheriting dog ingredients.',
    acquisition_notes = 'Historical target: VICTOR Grain Free Shredded Chicken Dinner in Gravy for cats. Current official redirect: VICTOR Grain Free Formula Chicken and Vegetables Cuts in Gravy for dogs. Exact identity boundaries prohibit promotion or ingredient reuse. Reopen only when exact current cat package/manufacturer evidence is available.',
    sample_metadata = coalesce(sample_metadata, '{}'::jsonb) || jsonb_build_object(
      'closed_by', 'official_redirect_identity_guard',
      'closed_at', now(),
      'historical_url', v_old_url,
      'redirect_target', v_redirect_url,
      'redirect_cross_species', true
    ),
    updated_at = now(),
    last_refreshed_at = now()
  WHERE gap_key = 'product:victor-pet-food:victor grain free shredded chicken dinner in gravy victor pet food';

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'No remaining open VICTOR product-level verified-evidence gaps.',
    acquisition_notes = 'The last apparent VICTOR product gap was a stale cat URL redirecting to an incompatible dog formula; it was quarantined without sibling ingredient reuse.',
    updated_at = now(),
    last_refreshed_at = now()
  WHERE gap_key = 'brand:ffc150a160d37e92012c196b6af4160d'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_acquisition_queue q
      WHERE lower(q.brand) = 'victor'
        AND q.gap_type = 'product'
        AND q.status IN ('open', 'in_progress', 'blocked', 'imported')
    );

  IF EXISTS (
    SELECT 1
    FROM public.search_verified_products('VICTOR Grain Free Shredded Chicken Dinner in Gravy cat', 10) x
    WHERE x.cache_key = v_stale_cache_key
  ) THEN
    RAISE EXCEPTION 'VICTOR stale cat row remains searchable';
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key = v_current_cache_key
      AND pet_type = 'dog'
      AND ingredient_verification_status = 'manufacturer'
  ) <> 1 THEN
    RAISE EXCEPTION 'VICTOR current dog formula was altered';
  END IF;
END
$$;
