-- Promote the bounded repair set after the identity relationships have been
-- rebuilt. This is intentionally separate from the repair migration so the
-- database gateway does not hold one large transaction during alias refresh.

DO $promotion$
DECLARE
  v_result RECORD;
BEGIN
  LOOP
    SELECT * INTO v_result
    FROM public.promote_repaired_retailer_hard_identities(50);
    EXIT WHEN v_result.selected_rows = 0 OR v_result.remaining_rows = 0;
  END LOOP;
END;
$promotion$;

DO $assertion$
DECLARE
  v_unfinished INTEGER;
  v_still_mismatched INTEGER;
BEGIN
  SELECT count(*) INTO v_unfinished
  FROM public.catalog_retailer_identity_repairs
  WHERE new_formula_id IS NULL OR new_cache_key IS NULL;

  SELECT count(*) INTO v_still_mismatched
  FROM public.catalog_retailer_identity_repairs repair
  JOIN public.catalog_retailer_ingredient_evidence evidence
    ON evidence.id = repair.evidence_id
  JOIN public.product_data serving
    ON serving.cache_key = evidence.promoted_cache_key
  WHERE NOT public.catalog_retailer_formula_hard_boundaries_match(
    evidence.retailer_brand,
    evidence.pet_type,
    evidence.life_stage,
    evidence.food_form,
    evidence.flavor,
    evidence.diet_condition,
    serving.brand,
    serving.pet_type,
    serving.life_stage,
    serving.food_form,
    serving.flavor,
    ''
  );

  IF v_unfinished > 0 OR v_still_mismatched > 0 THEN
    RAISE EXCEPTION
      'retailer hard-identity repair incomplete: unfinished %, mismatched %',
      v_unfinished,
      v_still_mismatched;
  END IF;
END;
$assertion$;
