-- Reconcile the final strict Nulo source gap after a fresh exact manufacturer
-- review. The older source extraction has the same current identity and list
-- except for the official page's "Cooper Sulfate" typo; the new reviewed
-- manufacturer feed corrects it to "Copper Sulfate".

DO $$
DECLARE
  v_current_ready INTEGER;
  v_legacy_unverified INTEGER;
  v_formula_count INTEGER;
  v_typo_only_match INTEGER;
BEGIN
  SELECT count(*)
  INTO v_current_ready
  FROM public.product_data
  WHERE cache_key =
      'nulo:nulo freestyle puppy salmon peas recipe for dogs products freestyle-puppy-salmon-peas-recipe-for-dogs'
    AND product_name = 'FreeStyle Puppy Salmon & Peas Recipe for Dogs'
    AND pet_type = 'dog'
    AND life_stage = 'puppy'
    AND food_form = 'dry'
    AND source_url =
      'https://nulo.com/products/freestyle-puppy-salmon-peas-recipe-for-dogs'
    AND public.catalog_quality_state(
      pet_type,
      is_complete_food,
      catalog_exclusion_reason,
      ingredient_text,
      COALESCE(array_length(ingredients, 1), 0),
      ingredient_verification_status,
      image_url,
      image_verification_status,
      source_url,
      expires_at
    ) = 'verified_ready';

  SELECT count(*)
  INTO v_legacy_unverified
  FROM public.product_data
  WHERE cache_key =
      'nulo:nulo freestyle high-protein kibble salmon peas recipe products freestyle-puppy-salmon-peas-recipe-for-dogs'
    AND ingredient_verification_status = 'unverified'
    AND catalog_exclusion_reason IS NULL
    AND source_url =
      'https://nulo.com/products/freestyle-puppy-salmon-peas-recipe-for-dogs';

  SELECT count(*)
  INTO v_formula_count
  FROM public.catalog_formulas
  WHERE promoted_cache_key =
      'nulo:nulo freestyle puppy salmon peas recipe for dogs products freestyle-puppy-salmon-peas-recipe-for-dogs'
    AND active
    AND verification_status = 'verified'
    AND source_authority = 'manufacturer';

  SELECT count(*)
  INTO v_typo_only_match
  FROM public.product_data legacy
  JOIN public.product_data current
    ON current.cache_key =
      'nulo:nulo freestyle puppy salmon peas recipe for dogs products freestyle-puppy-salmon-peas-recipe-for-dogs'
  WHERE legacy.cache_key =
      'nulo:nulo freestyle high-protein kibble salmon peas recipe products freestyle-puppy-salmon-peas-recipe-for-dogs'
    AND regexp_replace(
      lower(replace(legacy.ingredient_text, 'Cooper Sulfate', 'Copper Sulfate')),
      '[^a-z0-9]+',
      '',
      'g'
    ) = regexp_replace(
      lower(current.ingredient_text),
      '[^a-z0-9]+',
      '',
      'g'
    );

  IF v_current_ready <> 1
      OR v_legacy_unverified <> 1
      OR v_formula_count <> 1
      OR v_typo_only_match <> 1 THEN
    RAISE EXCEPTION
      'Nulo Puppy Salmon & Peas reconciliation prerequisites failed: current %, legacy %, formula %, typo match %',
      v_current_ready,
      v_legacy_unverified,
      v_formula_count,
      v_typo_only_match;
  END IF;
END $$;

UPDATE public.product_data
SET
  catalog_exclusion_reason =
    'superseded_unverified_official_extract_typo',
  updated_at = now()
WHERE cache_key =
  'nulo:nulo freestyle high-protein kibble salmon peas recipe products freestyle-puppy-salmon-peas-recipe-for-dogs';

UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(
    NULLIF(evidence.rejection_reason, ''),
    'superseded_unverified_official_extract_typo'
  ),
  evidence = COALESCE(evidence.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'reconciled_at', now(),
      'reconciled_by',
        '20260725158000_reconcile_nulo_puppy_salmon_peas_evidence',
      'canonical_cache_key',
        'nulo:nulo freestyle puppy salmon peas recipe for dogs products freestyle-puppy-salmon-peas-recipe-for-dogs',
      'reason',
        'fresh exact manufacturer review replaced the typo-bearing unverified extract'
    ),
  updated_at = now()
WHERE evidence.cache_key =
  'nulo:nulo freestyle high-protein kibble salmon peas recipe products freestyle-puppy-salmon-peas-recipe-for-dogs';

UPDATE public.catalog_manual_evidence_reviews review
SET
  evidence_status = 'promoted',
  formula_id = formula.id,
  promoted_cache_key = formula.promoted_cache_key,
  review_notes = concat_ws(
    ' | ',
    NULLIF(review.review_notes, ''),
    'Promoted after exact current Nulo manufacturer identity, ingredient, image, and AAFCO review.'
  ),
  updated_at = now()
FROM public.catalog_formulas formula
WHERE review.review_key =
    'manual-search:nulo:freestyle-puppy-salmon-peas-dog:20260725'
  AND formula.promoted_cache_key =
    'nulo:nulo freestyle puppy salmon peas recipe for dogs products freestyle-puppy-salmon-peas-recipe-for-dogs'
  AND formula.active
  AND formula.verification_status = 'verified';

SELECT public.close_stale_catalog_acquisition_queue_gaps(now())
  AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  v_search_count INTEGER;
  v_legacy_serving INTEGER;
  v_review_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_search_count
  FROM (
    SELECT cache_key
    FROM public.search_verified_products(
      'Nulo FreeStyle Puppy Salmon & Peas Recipe for Dogs',
      8
    )
    ORDER BY rank DESC, cache_key
    LIMIT 1
  ) top_result
  WHERE cache_key =
    'nulo:nulo freestyle puppy salmon peas recipe for dogs products freestyle-puppy-salmon-peas-recipe-for-dogs';

  SELECT count(*)
  INTO v_legacy_serving
  FROM public.product_data
  WHERE cache_key =
      'nulo:nulo freestyle high-protein kibble salmon peas recipe products freestyle-puppy-salmon-peas-recipe-for-dogs'
    AND catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO v_review_count
  FROM public.catalog_manual_evidence_reviews
  WHERE review_key =
      'manual-search:nulo:freestyle-puppy-salmon-peas-dog:20260725'
    AND evidence_status = 'promoted'
    AND formula_id IS NOT NULL
    AND promoted_cache_key =
      'nulo:nulo freestyle puppy salmon peas recipe for dogs products freestyle-puppy-salmon-peas-recipe-for-dogs';

  IF v_search_count <> 1
      OR v_legacy_serving <> 0
      OR v_review_count <> 1 THEN
    RAISE EXCEPTION
      'Nulo Puppy Salmon & Peas reconciliation failed: search %, legacy %, review %',
      v_search_count,
      v_legacy_serving,
      v_review_count;
  END IF;
END $$;
