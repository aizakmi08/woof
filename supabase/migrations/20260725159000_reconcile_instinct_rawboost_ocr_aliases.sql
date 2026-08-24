-- Replace six unverified OCR-only Instinct RawBoost records with three current,
-- exact manufacturer formulas. The OCR rows are not promoted or merged: four
-- omit a reliable size/breed boundary and two contain OCR ingredient artifacts.
-- They remain durable rejected evidence while verified search resolves the
-- shelf-facing label wording to the appropriate current official formula.

DO $$
DECLARE
  v_verified_formulas INTEGER;
  v_ready_serving_rows INTEGER;
  v_legacy_ocr_rows INTEGER;
BEGIN
  SELECT count(*)
  INTO v_verified_formulas
  FROM public.catalog_formulas
  WHERE formula_key IN (
      'instinct|instinct|rawboost|dog|adult|dry|real chicken|',
      'instinct|instinct|rawboost|dog|adult|dry|small breed real chicken|small breed',
      'instinct|instinct|rawboost|dog|adult|dry|small breed real beef|small breed'
    )
    AND active
    AND verification_status = 'verified'
    AND source_authority = 'manufacturer'
    AND promoted_cache_key IS NOT NULL;

  SELECT count(*)
  INTO v_ready_serving_rows
  FROM public.catalog_formulas formula
  JOIN public.product_data product
    ON product.cache_key = formula.promoted_cache_key
  WHERE formula.formula_key IN (
      'instinct|instinct|rawboost|dog|adult|dry|real chicken|',
      'instinct|instinct|rawboost|dog|adult|dry|small breed real chicken|small breed',
      'instinct|instinct|rawboost|dog|adult|dry|small breed real beef|small breed'
    )
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
  INTO v_legacy_ocr_rows
  FROM public.product_data
  WHERE cache_key IN (
      'instinct instinct rawboost grain free with real chicken',
      'instinct instinct rawboost high protein kibble raw grain free with real chicken',
      'instinct instinct rawboost high protein kibble raw small breed grain free with real chicken',
      'instinct instinct rawboost kibble raw grain free with real chicken',
      'instinct instinct rawboost kibble raw small breed grain free with real chicken',
      'instinct instinct rawboost small breed high protein with real beef'
    )
    AND source = 'user_ocr'
    AND ingredient_verification_status = 'ai_extracted'
    AND image_verification_status = 'unverified'
    AND catalog_exclusion_reason IS NULL;

  IF v_verified_formulas <> 3
      OR v_ready_serving_rows <> 3
      OR v_legacy_ocr_rows <> 6 THEN
    RAISE EXCEPTION
      'Instinct RawBoost reconciliation prerequisites failed: formulas %, serving %, OCR %',
      v_verified_formulas,
      v_ready_serving_rows,
      v_legacy_ocr_rows;
  END IF;
END $$;

-- Correct the obvious dropped-letter manufacturer HTML transcription. No
-- ingredient identity is changed.
UPDATE public.product_data product
SET
  ingredient_text = CASE
    WHEN formula.formula_key =
        'instinct|instinct|rawboost|dog|adult|dry|real chicken|'
      THEN replace(
        product.ingredient_text,
        'Chicken Fat (preserved wit Mixed Tocopherols)',
        'Chicken Fat (preserved with Mixed Tocopherols)'
      )
    ELSE product.ingredient_text
  END,
  ingredients = CASE
    WHEN formula.formula_key =
        'instinct|instinct|rawboost|dog|adult|dry|real chicken|'
      THEN array_replace(
        product.ingredients,
        'Chicken Fat (preserved wit Mixed Tocopherols)',
        'Chicken Fat (preserved with Mixed Tocopherols)'
      )
    ELSE product.ingredients
  END,
  ingredient_count = CASE
    WHEN formula.formula_key =
        'instinct|instinct|rawboost|dog|adult|dry|real chicken|'
      THEN cardinality(array_replace(
        product.ingredients,
        'Chicken Fat (preserved wit Mixed Tocopherols)',
        'Chicken Fat (preserved with Mixed Tocopherols)'
      ))
    ELSE product.ingredient_count
  END,
  updated_at = now()
FROM public.catalog_formulas formula
WHERE product.cache_key = formula.promoted_cache_key
  AND formula.formula_key IN (
    'instinct|instinct|rawboost|dog|adult|dry|real chicken|',
    'instinct|instinct|rawboost|dog|adult|dry|small breed real chicken|small breed',
    'instinct|instinct|rawboost|dog|adult|dry|small breed real beef|small breed'
  );

UPDATE public.catalog_formulas
SET
  ingredient_text = replace(
    ingredient_text,
    'Chicken Fat (preserved wit Mixed Tocopherols)',
    'Chicken Fat (preserved with Mixed Tocopherols)'
  ),
  ingredients = array_replace(
    ingredients,
    'Chicken Fat (preserved wit Mixed Tocopherols)',
    'Chicken Fat (preserved with Mixed Tocopherols)'
  ),
  updated_at = now()
WHERE formula_key =
  'instinct|instinct|rawboost|dog|adult|dry|real chicken|';

WITH aliases(alias_text, formula_key, source_url, evidence_note) AS (
  VALUES
    (
      'Instinct rawboost grain free with real chicken',
      'instinct|instinct|rawboost|dog|adult|dry|real chicken|',
      'https://www.instinctpetfood.com/products/rawboost-kibble-chicken',
      'Historical shelf label omits no protected breed boundary.'
    ),
    (
      'Instinct rawBOOST High-Protein Kibble + Raw Grain-Free Recipe with Real Chicken',
      'instinct|instinct|rawboost|dog|adult|dry|real chicken|',
      'https://www.instinctpetfood.com/products/rawboost-kibble-chicken',
      'Manufacturer current description confirms high-protein, grain-free kibble plus raw.'
    ),
    (
      'Instinct rawBOOST High-Protein Kibble + Raw Small Breed Grain-Free Recipe with Real Chicken',
      'instinct|instinct|rawboost|dog|adult|dry|small breed real chicken|small breed',
      'https://www.instinctpetfood.com/products/rawboost-kibble-for-small-breed-dogs-chicken',
      'Manufacturer current identity confirms protected small-breed chicken formula.'
    ),
    (
      'Instinct rawBOOST Kibble + Raw Grain-Free Recipe with Real Chicken',
      'instinct|instinct|rawboost|dog|adult|dry|real chicken|',
      'https://www.instinctpetfood.com/products/rawboost-kibble-chicken',
      'Historical shelf wording maps to the current non-small-breed chicken formula.'
    ),
    (
      'Instinct rawboost Kibble + Raw Small Breed Grain-Free Recipe With Real Chicken',
      'instinct|instinct|rawboost|dog|adult|dry|small breed real chicken|small breed',
      'https://www.instinctpetfood.com/products/rawboost-kibble-for-small-breed-dogs-chicken',
      'Manufacturer current identity confirms protected small-breed chicken formula.'
    ),
    (
      'Instinct RawBoost+ Small Breed High-Protein Recipe with Real Beef',
      'instinct|instinct|rawboost|dog|adult|dry|small breed real beef|small breed',
      'https://www.instinctpetfood.com/products/rawboost-kibble-for-small-breed-dogs-beef',
      'Manufacturer current identity confirms protected small-breed beef formula.'
    )
)
INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance
)
SELECT
  formula.promoted_cache_key,
  aliases.alias_text,
  public.normalize_verified_product_search_query(aliases.alias_text),
  aliases.source_url,
  'manufacturer',
  now(),
  jsonb_build_object(
    'source',
    'manual_exact_evidence',
    'migration',
    '20260725159000_reconcile_instinct_rawboost_ocr_aliases',
    'evidence_note',
    aliases.evidence_note,
    'ocr_record_is_not_ingredient_proof',
    true
  )
FROM aliases
JOIN public.catalog_formulas formula
  ON formula.formula_key = aliases.formula_key
WHERE formula.active
  AND formula.verification_status = 'verified'
  AND formula.source_authority = 'manufacturer'
  AND formula.promoted_cache_key IS NOT NULL
ON CONFLICT (normalized_alias) WHERE active
DO UPDATE SET
  cache_key = EXCLUDED.cache_key,
  alias_text = EXCLUDED.alias_text,
  source_url = EXCLUDED.source_url,
  source_authority = EXCLUDED.source_authority,
  evidence_observed_at = EXCLUDED.evidence_observed_at,
  provenance = EXCLUDED.provenance,
  updated_at = now();

UPDATE public.product_data
SET
  catalog_exclusion_reason = CASE
    WHEN cache_key IN (
      'instinct instinct rawboost high protein kibble raw small breed grain free with real chicken',
      'instinct instinct rawboost kibble raw small breed grain free with real chicken',
      'instinct instinct rawboost small breed high protein with real beef'
    )
      THEN 'superseded_unverified_ocr_exact_identity'
    ELSE 'unverified_ocr_variant_identity_quarantined'
  END,
  updated_at = now()
WHERE cache_key IN (
    'instinct instinct rawboost grain free with real chicken',
    'instinct instinct rawboost high protein kibble raw grain free with real chicken',
    'instinct instinct rawboost high protein kibble raw small breed grain free with real chicken',
    'instinct instinct rawboost kibble raw grain free with real chicken',
    'instinct instinct rawboost kibble raw small breed grain free with real chicken',
    'instinct instinct rawboost small breed high protein with real beef'
  )
  AND source = 'user_ocr';

UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(
    NULLIF(evidence.rejection_reason, ''),
    product.catalog_exclusion_reason
  ),
  evidence = COALESCE(evidence.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'reconciled_at', now(),
      'reconciled_by',
        '20260725159000_reconcile_instinct_rawboost_ocr_aliases',
      'reason',
        'unverified OCR record replaced by exact current manufacturer evidence; no ingredient inheritance'
    ),
  updated_at = now()
FROM public.product_data product
WHERE evidence.cache_key = product.cache_key
  AND product.catalog_exclusion_reason IN (
    'superseded_unverified_ocr_exact_identity',
    'unverified_ocr_variant_identity_quarantined'
  );

UPDATE public.catalog_manual_evidence_reviews review
SET
  evidence_status = 'promoted',
  formula_id = formula.id,
  promoted_cache_key = formula.promoted_cache_key,
  review_notes = concat_ws(
    ' | ',
    NULLIF(review.review_notes, ''),
    'Promoted after exact current Instinct manufacturer identity, ingredient, image, and adult-dog review.'
  ),
  updated_at = now()
FROM public.catalog_formulas formula
WHERE (
    review.review_key =
      'manual-search:instinct:rawboost-real-chicken-dog:20260725'
    AND formula.formula_key =
      'instinct|instinct|rawboost|dog|adult|dry|real chicken|'
  )
  OR (
    review.review_key =
      'manual-search:instinct:rawboost-small-breed-real-chicken-dog:20260725'
    AND formula.formula_key =
      'instinct|instinct|rawboost|dog|adult|dry|small breed real chicken|small breed'
  )
  OR (
    review.review_key =
      'manual-search:instinct:rawboost-small-breed-real-beef-dog:20260725'
    AND formula.formula_key =
      'instinct|instinct|rawboost|dog|adult|dry|small breed real beef|small breed'
  );

SELECT public.close_stale_catalog_acquisition_queue_gaps(now())
  AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  v_wrong_searches INTEGER;
  v_wrong_query_names TEXT;
  v_active_ocr INTEGER;
  v_promoted_reviews INTEGER;
BEGIN
  WITH expected(query_text, formula_key) AS (
    VALUES
      (
        'Instinct rawboost grain free with real chicken',
        'instinct|instinct|rawboost|dog|adult|dry|real chicken|'
      ),
      (
        'Instinct rawBOOST High-Protein Kibble + Raw Grain-Free Recipe with Real Chicken',
        'instinct|instinct|rawboost|dog|adult|dry|real chicken|'
      ),
      (
        'Instinct rawBOOST High-Protein Kibble + Raw Small Breed Grain-Free Recipe with Real Chicken',
        'instinct|instinct|rawboost|dog|adult|dry|small breed real chicken|small breed'
      ),
      (
        'Instinct rawBOOST Kibble + Raw Grain-Free Recipe with Real Chicken',
        'instinct|instinct|rawboost|dog|adult|dry|real chicken|'
      ),
      (
        'Instinct rawboost Kibble + Raw Small Breed Grain-Free Recipe With Real Chicken',
        'instinct|instinct|rawboost|dog|adult|dry|small breed real chicken|small breed'
      ),
      (
        'Instinct RawBoost+ Small Breed High-Protein Recipe with Real Beef',
        'instinct|instinct|rawboost|dog|adult|dry|small breed real beef|small breed'
      )
  ),
  top_results AS (
    SELECT
      expected.query_text,
      expected.formula_key,
      search.cache_key
    FROM expected
    LEFT JOIN LATERAL (
      SELECT result.cache_key
      FROM public.search_verified_products(expected.query_text, 8) result
      ORDER BY result.rank DESC, result.cache_key
      LIMIT 1
    ) search ON true
  )
  SELECT
    count(*),
    string_agg(
      concat_ws(' => ', top_results.query_text, top_results.cache_key),
      ' | '
      ORDER BY top_results.query_text
    )
  INTO v_wrong_searches, v_wrong_query_names
  FROM top_results
  LEFT JOIN public.catalog_formulas formula
    ON formula.formula_key = top_results.formula_key
  WHERE top_results.cache_key IS DISTINCT FROM formula.promoted_cache_key;

  SELECT count(*)
  INTO v_active_ocr
  FROM public.product_data
  WHERE cache_key IN (
      'instinct instinct rawboost grain free with real chicken',
      'instinct instinct rawboost high protein kibble raw grain free with real chicken',
      'instinct instinct rawboost high protein kibble raw small breed grain free with real chicken',
      'instinct instinct rawboost kibble raw grain free with real chicken',
      'instinct instinct rawboost kibble raw small breed grain free with real chicken',
      'instinct instinct rawboost small breed high protein with real beef'
    )
    AND catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO v_promoted_reviews
  FROM public.catalog_manual_evidence_reviews
  WHERE review_key IN (
      'manual-search:instinct:rawboost-real-chicken-dog:20260725',
      'manual-search:instinct:rawboost-small-breed-real-chicken-dog:20260725',
      'manual-search:instinct:rawboost-small-breed-real-beef-dog:20260725'
    )
    AND evidence_status = 'promoted'
    AND formula_id IS NOT NULL
    AND promoted_cache_key IS NOT NULL;

  IF v_wrong_searches <> 0
      OR v_active_ocr <> 0
      OR v_promoted_reviews <> 3 THEN
    RAISE EXCEPTION
      'Instinct RawBoost reconciliation failed: wrong searches % (%), active OCR %, reviews %',
      v_wrong_searches,
      COALESCE(v_wrong_query_names, ''),
      v_active_ocr,
      v_promoted_reviews;
  END IF;
END $$;
