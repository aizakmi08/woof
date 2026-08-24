-- Close the exact PetSmart private-label evidence wave after all eight
-- formulas passed strict identity, ingredient, image, search, and GTIN gates.

DO $$
DECLARE
  v_ready_count INTEGER;
  v_formula_count INTEGER;
  v_review_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_ready_count
  FROM public.product_data product
  WHERE product.cache_key IN (
      'petsmart-simply-nourish:0196481057012',
      'petsmart-simply-nourish:0196481058811',
      'petsmart-simply-nourish:0196481058804',
      'petsmart-simply-nourish:0737257829930',
      'petsmart-simply-nourish:0737257826724',
      'petsmart-simply-nourish:0737257827387',
      'petsmart-authority:0737257935839',
      'petsmart-authority:0196481057760'
    )
    AND product.source_quality = 'retailer_verified'
    AND product.ingredient_verification_status IN (
      'retailer_verified',
      'label_ocr_verified'
    )
    AND product.image_verification_status = 'retailer_verified'
    AND public.catalog_quality_state(
      product.pet_type,
      product.is_complete_food,
      product.catalog_exclusion_reason,
      product.ingredient_text,
      COALESCE(array_length(product.ingredients, 1), 0),
      product.ingredient_verification_status,
      product.image_url,
      product.image_verification_status,
      product.source_url,
      product.expires_at
    ) = 'verified_ready';

  SELECT count(*)
  INTO v_formula_count
  FROM public.catalog_formulas formula
  WHERE formula.promoted_cache_key IN (
      'petsmart-simply-nourish:0196481057012',
      'petsmart-simply-nourish:0196481058811',
      'petsmart-simply-nourish:0196481058804',
      'petsmart-simply-nourish:0737257829930',
      'petsmart-simply-nourish:0737257826724',
      'petsmart-simply-nourish:0737257827387',
      'petsmart-authority:0737257935839',
      'petsmart-authority:0196481057760'
    )
    AND formula.active
    AND formula.verification_status = 'verified'
    AND formula.source_authority = 'retailer_verified'
    AND NULLIF(formula.promoted_cache_key, '') IS NOT NULL;

  SELECT count(*)
  INTO v_review_count
  FROM public.catalog_manual_evidence_reviews review
  WHERE review.review_key IN (
      'manual-retailer:petsmart:simply-nourish-hip-joint-chicken-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-large-breed-salmon-sweet-potato-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-limited-small-breed-salmon-sweet-potato-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-original-lamb-oatmeal-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-source-chicken-turkey-cat:20260725',
      'manual-retailer:petsmart:simply-nourish-source-indoor-salmon-cat:20260725',
      'manual-retailer:petsmart:authority-sensitive-turkey-rice-cat:20260725',
      'manual-retailer:petsmart:authority-large-breed-puppy-salmon-rice-dog:20260725'
    )
    AND review.evidence_status = 'candidate_verified'
    AND review.ingredient_evidence_url LIKE
      'https://s7d2.scene7.com/is/image/PetSmart/%'
    AND review.ingredient_original_text_hash IS NOT NULL
    AND review.ingredient_text_hash IS NOT NULL;

  IF v_ready_count <> 8 OR v_formula_count <> 8 OR v_review_count <> 8 THEN
    RAISE EXCEPTION
      'PetSmart private-label prerequisites failed: ready %, formulas %, reviews %',
      v_ready_count,
      v_formula_count,
      v_review_count;
  END IF;
END $$;

UPDATE public.catalog_manual_evidence_reviews review
SET
  evidence_status = 'promoted',
  formula_id = formula.id,
  promoted_cache_key = formula.promoted_cache_key,
  review_notes = concat_ws(
    ' | ',
    NULLIF(review.review_notes, ''),
    'Promoted after exact PetSmart private-label identity, package-label ingredient, front-image, top-1 search, and GTIN review.'
  ),
  updated_at = now()
FROM public.catalog_formulas formula
WHERE review.corrected_formula_key = formula.formula_key
  AND review.review_key IN (
    'manual-retailer:petsmart:simply-nourish-hip-joint-chicken-dog:20260725',
    'manual-retailer:petsmart:simply-nourish-large-breed-salmon-sweet-potato-dog:20260725',
    'manual-retailer:petsmart:simply-nourish-limited-small-breed-salmon-sweet-potato-dog:20260725',
    'manual-retailer:petsmart:simply-nourish-original-lamb-oatmeal-dog:20260725',
    'manual-retailer:petsmart:simply-nourish-source-chicken-turkey-cat:20260725',
    'manual-retailer:petsmart:simply-nourish-source-indoor-salmon-cat:20260725',
    'manual-retailer:petsmart:authority-sensitive-turkey-rice-cat:20260725',
    'manual-retailer:petsmart:authority-large-breed-puppy-salmon-rice-dog:20260725'
  )
  AND formula.active
  AND formula.verification_status = 'verified';

UPDATE public.catalog_acquisition_queue queue
SET
  status = 'resolved',
  resolved_at = now(),
  resolution_reason =
    'exact current PetSmart private-label page and package-label evidence promoted',
  sample_metadata = COALESCE(queue.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'resolved_by',
        '20260725160000_promote_petsmart_private_label_exact_evidence',
      'identity_basis',
        'exact retailer product ID, consumer brand, line, species, life stage, form, recipe, package label, image, and GTIN'
    ),
  updated_at = now()
WHERE queue.cache_key IN (
    'petsmart-simply-nourish:0196481057012',
    'petsmart-simply-nourish:0196481058811',
    'petsmart-simply-nourish:0196481058804',
    'petsmart-simply-nourish:0737257829930',
    'petsmart-simply-nourish:0737257826724',
    'petsmart-simply-nourish:0737257827387',
    'petsmart-authority:0737257935839',
    'petsmart-authority:0196481057760'
  )
  AND queue.status IN ('open', 'in_progress');

SELECT public.close_stale_catalog_acquisition_queue_gaps(now())
  AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  v_search_count INTEGER;
  v_barcode_count INTEGER;
  v_review_count INTEGER;
  v_open_target_count INTEGER;
  v_open_simply_nourish_brand_count INTEGER;
  v_authority_remaining_affected INTEGER;
  v_label_transcription_count INTEGER;
  v_bounded_correction_count INTEGER;
BEGIN
  WITH expected(query, expected_cache_key) AS (
    VALUES
      (
        'Simply Nourish Hip & Joint Recipe Wet Dog Food Shreds Chicken',
        'petsmart-simply-nourish:0196481057012'
      ),
      (
        'Simply Nourish Large Breed Adult Dog Food Salmon Sweet Potato Recipe',
        'petsmart-simply-nourish:0196481058811'
      ),
      (
        'Simply Nourish Limited Ingredient Small Breed Adult Dog Food Salmon Sweet Potato',
        'petsmart-simply-nourish:0196481058804'
      ),
      (
        'Simply Nourish Original Adult Dry Dog Food Lamb Oatmeal',
        'petsmart-simply-nourish:0737257829930'
      ),
      (
        'Simply Nourish Source Cat Dry Food Chicken Turkey Grain Free',
        'petsmart-simply-nourish:0737257826724'
      ),
      (
        'Simply Nourish Source Indoor Cat Dry Food Salmon Grain Free',
        'petsmart-simply-nourish:0737257827387'
      ),
      (
        'Authority Sensitive Stomach Skin Cat Dry Food Turkey Rice With Grain',
        'petsmart-authority:0737257935839'
      ),
      (
        'Authority Sensitive Stomach Skin Large Breed Puppy Dry Dog Food Salmon Rice',
        'petsmart-authority:0196481057760'
      )
  ),
  ranked AS (
    SELECT
      expected.query,
      expected.expected_cache_key,
      result.cache_key,
      row_number() OVER (
        PARTITION BY expected.query
        ORDER BY result.rank DESC, result.cache_key
      ) AS position
    FROM expected
    CROSS JOIN LATERAL public.search_verified_products(
      expected.query,
      8
    ) result
  )
  SELECT count(*)
  INTO v_search_count
  FROM ranked
  WHERE position = 1
    AND cache_key = expected_cache_key;

  WITH expected(gtin, expected_cache_key) AS (
    VALUES
      ('0196481057012', 'petsmart-simply-nourish:0196481057012'),
      ('0196481058811', 'petsmart-simply-nourish:0196481058811'),
      ('0196481058804', 'petsmart-simply-nourish:0196481058804'),
      ('0737257829930', 'petsmart-simply-nourish:0737257829930'),
      ('0737257826724', 'petsmart-simply-nourish:0737257826724'),
      ('0737257827387', 'petsmart-simply-nourish:0737257827387'),
      ('0737257935839', 'petsmart-authority:0737257935839'),
      ('0196481057760', 'petsmart-authority:0196481057760')
  )
  SELECT count(*)
  INTO v_barcode_count
  FROM expected
  JOIN LATERAL public.resolve_verified_product_by_gtin(
    expected.gtin,
    8
  ) result
    ON result.cache_key = expected.expected_cache_key;

  SELECT count(*)
  INTO v_review_count
  FROM public.catalog_manual_evidence_reviews review
  WHERE review.review_key IN (
      'manual-retailer:petsmart:simply-nourish-hip-joint-chicken-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-large-breed-salmon-sweet-potato-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-limited-small-breed-salmon-sweet-potato-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-original-lamb-oatmeal-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-source-chicken-turkey-cat:20260725',
      'manual-retailer:petsmart:simply-nourish-source-indoor-salmon-cat:20260725',
      'manual-retailer:petsmart:authority-sensitive-turkey-rice-cat:20260725',
      'manual-retailer:petsmart:authority-large-breed-puppy-salmon-rice-dog:20260725'
    )
    AND review.evidence_status = 'promoted'
    AND review.promoted_cache_key IS NOT NULL;

  SELECT count(*)
  INTO v_open_target_count
  FROM public.catalog_acquisition_queue queue
  WHERE queue.cache_key IN (
      'petsmart-simply-nourish:0196481057012',
      'petsmart-simply-nourish:0196481058811',
      'petsmart-simply-nourish:0196481058804',
      'petsmart-simply-nourish:0737257829930',
      'petsmart-simply-nourish:0737257826724',
      'petsmart-simply-nourish:0737257827387',
      'petsmart-authority:0737257935839',
      'petsmart-authority:0196481057760'
    )
    AND queue.status IN ('open', 'in_progress');

  SELECT count(*)
  INTO v_open_simply_nourish_brand_count
  FROM public.catalog_acquisition_queue queue
  WHERE lower(queue.brand) = 'simply nourish'
    AND queue.gap_type = 'brand'
    AND queue.status IN ('open', 'in_progress');

  SELECT COALESCE(sum(queue.affected_product_count), 0)
  INTO v_authority_remaining_affected
  FROM public.catalog_acquisition_queue queue
  WHERE lower(queue.brand) = 'authority'
    AND queue.gap_type = 'brand'
    AND queue.status IN ('open', 'in_progress');

  SELECT count(*)
  INTO v_label_transcription_count
  FROM public.catalog_manual_evidence_reviews review
  WHERE review.review_key IN (
      'manual-retailer:petsmart:simply-nourish-hip-joint-chicken-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-large-breed-salmon-sweet-potato-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-limited-small-breed-salmon-sweet-potato-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-original-lamb-oatmeal-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-source-chicken-turkey-cat:20260725',
      'manual-retailer:petsmart:simply-nourish-source-indoor-salmon-cat:20260725',
      'manual-retailer:petsmart:authority-sensitive-turkey-rice-cat:20260725',
      'manual-retailer:petsmart:authority-large-breed-puppy-salmon-rice-dog:20260725'
    )
    AND review.ingredient_evidence_mode =
      'authoritative_label_transcription';

  SELECT count(*)
  INTO v_bounded_correction_count
  FROM public.catalog_manual_evidence_reviews review
  WHERE review.review_key IN (
      'manual-retailer:petsmart:simply-nourish-hip-joint-chicken-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-large-breed-salmon-sweet-potato-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-limited-small-breed-salmon-sweet-potato-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-original-lamb-oatmeal-dog:20260725',
      'manual-retailer:petsmart:simply-nourish-source-chicken-turkey-cat:20260725',
      'manual-retailer:petsmart:simply-nourish-source-indoor-salmon-cat:20260725',
      'manual-retailer:petsmart:authority-sensitive-turkey-rice-cat:20260725',
      'manual-retailer:petsmart:authority-large-breed-puppy-salmon-rice-dog:20260725'
    )
    AND review.ingredient_evidence_mode =
      'bounded_source_text_correction'
    AND jsonb_array_length(review.ingredient_corrections) > 0;

  IF v_search_count <> 8
      OR v_barcode_count <> 8
      OR v_review_count <> 8
      OR v_open_target_count <> 0
      OR v_open_simply_nourish_brand_count <> 0
      OR v_authority_remaining_affected <> 1
      OR v_label_transcription_count <> 1
      OR v_bounded_correction_count <> 7 THEN
    RAISE EXCEPTION
      'PetSmart private-label reconciliation failed: search %, barcode %, reviews %, open targets %, Simply Nourish brand gaps %, Authority affected %, label transcription %, bounded corrections %',
      v_search_count,
      v_barcode_count,
      v_review_count,
      v_open_target_count,
      v_open_simply_nourish_brand_count,
      v_authority_remaining_affected,
      v_label_transcription_count,
      v_bounded_correction_count;
  END IF;
END $$;
