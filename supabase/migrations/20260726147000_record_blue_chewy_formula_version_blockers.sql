-- Preserve exact reasons for two high-demand Blue Buffalo Chewy observations
-- that must not be merged into a current manufacturer sibling.

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.catalog_acquisition_queue
  SET
    acquisition_notes = CASE gap_key
      WHEN 'census:12746e3f1063a863b0cc11539c17dc13' THEN
        'Do not alias to the current BLUE Wilderness Chicken Recipe for Adult Cats. The current Chewy statement contains Menhaden Fish Meal, Sweet Potatoes, L-Carnitine, Dried Yeast, and probiotic fermentation products and differs materially in ingredient order/content from the retained current manufacturer statement. Requires exact package-version evidence or a current manufacturer formula-version record.'
      WHEN 'census:40d53e5f38ed92eeff140014913bbfd0' THEN
        'Do not alias to BLUE Wilderness Small Breed Healthy Weight Turkey & Chicken Grill. The Chewy discovery title says Healthy Weight adult wet dog food but does not establish the protected small-breed boundary. Requires a readable exact package front/label or an authoritative product identifier that proves the breed-size variant.'
    END,
    sample_metadata = COALESCE(sample_metadata, '{}'::jsonb) || CASE gap_key
      WHEN 'census:12746e3f1063a863b0cc11539c17dc13' THEN jsonb_build_object(
        'evidence_blocker', 'current_formula_version_conflict',
        'reviewed_at', '2026-07-26',
        'official_candidate_url', 'https://www.bluebuffalo.com/dry-cat-food/wilderness/chicken/',
        'no_guess_boundary', 'ingredient_formula_version'
      )
      WHEN 'census:40d53e5f38ed92eeff140014913bbfd0' THEN jsonb_build_object(
        'evidence_blocker', 'protected_breed_size_not_proven',
        'reviewed_at', '2026-07-26',
        'official_candidate_url', 'https://www.bluebuffalo.com/wet-dog-food/wilderness/small-breed-healthy-weight-turkey-chicken-grill/',
        'no_guess_boundary', 'breed_size'
      )
    END,
    needs_product_record = true,
    needs_verified_ingredients = true,
    needs_verified_image = true,
    updated_at = now(),
    last_refreshed_at = now()
  WHERE gap_key IN (
    'census:12746e3f1063a863b0cc11539c17dc13',
    'census:40d53e5f38ed92eeff140014913bbfd0'
  );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 2 THEN
    RAISE EXCEPTION
      'Expected two Blue Chewy evidence blockers, updated %',
      v_updated;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE gap_key IN (
      'census:12746e3f1063a863b0cc11539c17dc13',
      'census:40d53e5f38ed92eeff140014913bbfd0'
    )
      AND (
        NULLIF(btrim(COALESCE(acquisition_notes, '')), '') IS NULL
        OR NULLIF(sample_metadata->>'evidence_blocker', '') IS NULL
        OR status = 'resolved'
      )
  ) THEN
    RAISE EXCEPTION
      'Blue Chewy evidence blocker rows are not preserved as unresolved';
  END IF;
END
$$;
