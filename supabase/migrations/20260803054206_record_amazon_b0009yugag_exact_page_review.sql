-- Preserve the paid Amazon detail review without promoting an unsafe formula.
-- The ASIN and selected variant are exact, but the provider omitted structured
-- ingredients and the gallery ingredient graphic differs from the current
-- manufacturer formula. Keep the candidate quarantined until package-version
-- identity can be proven.

DO $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE public.catalog_amazon_evidence_queue
  SET
    asin = 'B0009YUGAG',
    source_url = 'https://www.amazon.com/dp/B0009YUGAG',
    status = 'quarantined',
    conflict_reason = 'amazon_asin_spans_unresolved_formula_version; paid detail result omits structured ingredient text',
    attempt_count = attempt_count + 1,
    last_attempt_at = '2026-08-03T05:38:27Z'::TIMESTAMPTZ,
    captured_at = '2026-08-03T05:38:27Z'::TIMESTAMPTZ,
    evidence = evidence || jsonb_build_object(
      'asin', 'B0009YUGAG',
      'source_url', 'https://www.amazon.com/dp/B0009YUGAG',
      'provider', 'apify/delicious_zebu/amazon-product-details-scraper',
      'provider_run_id', '01KZ322KGTBKH124WY7GFTC39N',
      'provider_cost_usd', 0.00225,
      'selected_size', '15 Pound (Pack of 1)',
      'selected_flavor', 'Chicken & Brown Rice',
      'seller', 'Amazon.com',
      'exact_asin_identity_confirmed', TRUE,
      'structured_ingredients_returned', FALSE,
      'ingredient_gallery_image', 'https://m.media-amazon.com/images/I/516-Dc3TomL.jpg',
      'front_package_image', 'https://m.media-amazon.com/images/I/51DJcqQ2AOL.jpg',
      'formula_version_conflict', TRUE,
      'promotion_allowed', FALSE,
      'review_note', 'Amazon ingredient gallery content differs from the current exact manufacturer formula; ASIN alone cannot identify the package formula version.'
    ),
    updated_at = NOW()
  WHERE candidate_key = '2c77e7f2625512f80f34baace8aa5629d6ebde9dd1fb7064a2c0ced16f6c31df';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Amazon evidence candidate B0009YUGAG was not found';
  END IF;
END;
$$;
