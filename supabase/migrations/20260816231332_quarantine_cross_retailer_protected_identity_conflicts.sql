-- Retrospective hard-boundary audit of the first cross-retailer image wave.
-- These Walmart evidence rows do not preserve an exact protected boundary
-- (recipe, life stage, texture, carrier, breed size, diet condition, or grain
-- status) between the immutable Walmart URL/title and the Chewy package image.
-- Remove only the affected source versions; formulas backed by another exact
-- promoted package stay active.

DO $migration$
DECLARE
  v_import UUID := '615c043f-c3da-4784-842e-0c766af51ab3'::UUID;
  v_external_ids TEXT[] := string_to_array(
    '10295625,10536157,12166751,1225434750,12425654760,14115655864,142425213,1464639605,1495260591,153301434,15559660786,15610649,15610650,1586763917,1671152693,16874463073,16956613701,16972914555,17093104992,17252359,17396000907,18826866173,18852451081,18885453472,189873925,19150116933,19163173086,19163173091,19163173739,19168151489,19168201389,19173521030,19195512790,19198767939,19198817410,19198817412,19198867276,19207558267,19207558270,19207658050,19207708824,19207708825,19209163594,19212352988,19213315338,19217255998,19217305888,19217305890,19218804575,19218854490,19218954030,19218954035,19218954873,19221418689,19221468843,19221468844,19231902110,19238910224,19238910228,19238960019,19238960985,20097914339,20412052266,20425773505,20466000594,20466000597,20472764254,20478757247,20478757299,20483005895,20597566392,20597566535,20612101207,20630412471,20657200352,20657250111,20663163706,20663913619,20665164943,20667853141,20676717853,20677267061,20691106783,20897539,21721885,21722063,21746501,23370233,23370283,253685534,2615637856,2985758244,316748613,34197514,34399803,34399806,36128415,37297922,405428607,412044314,43395250,43412580,43711033,49651185,497987828,5000131132,511500124,514034038,5281465351,540122467,5436587598,5461759920,55284012,5549088115,5553635263,568609803,5729256167,593344725,608085243,666605664,691911317,808564553,813252855,894692823,900339252,932950457,939143627,941739050,961563264',
    ','
  );
  v_formula_ids BIGINT[];
BEGIN
  SELECT array_agg(DISTINCT evidence.linked_formula_id)
  INTO v_formula_ids
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = v_import
    AND evidence.source_slug = 'walmart'
    AND evidence.source_external_id = ANY(v_external_ids)
    AND evidence.linked_formula_id IS NOT NULL;

  DELETE FROM public.product_data serving
  USING public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = v_import
    AND evidence.source_slug = 'walmart'
    AND evidence.source_external_id = ANY(v_external_ids)
    AND serving.cache_key = evidence.promoted_cache_key;

  UPDATE public.catalog_observations observation
  SET
    validation_status = 'quarantined',
    validation_reasons = CASE
      WHEN 'cross_retailer_protected_identity_conflict'
        = ANY(observation.validation_reasons)
        THEN observation.validation_reasons
      ELSE array_append(
        observation.validation_reasons,
        'cross_retailer_protected_identity_conflict'
      )
    END
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = v_import
    AND evidence.source_slug = 'walmart'
    AND evidence.source_external_id = ANY(v_external_ids)
    AND observation.id = evidence.linked_observation_id;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    promoted_cache_key = NULL,
    validation_reasons = CASE
      WHEN 'cross_retailer_protected_identity_conflict'
        = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(
        evidence.validation_reasons,
        'cross_retailer_protected_identity_conflict'
      )
    END,
    updated_at = now()
  WHERE evidence.import_run_id = v_import
    AND evidence.source_slug = 'walmart'
    AND evidence.source_external_id = ANY(v_external_ids);

  UPDATE public.catalog_formulas formula
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(formula.absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    updated_at = now()
  WHERE formula.id = ANY(COALESCE(v_formula_ids, ARRAY[]::BIGINT[]))
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_retailer_ingredient_evidence evidence
      WHERE evidence.linked_formula_id = formula.id
        AND evidence.is_current
        AND evidence.evidence_status = 'promoted'
    );

  IF (
    SELECT count(*)
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = v_import
      AND evidence.source_slug = 'walmart'
      AND evidence.source_external_id = ANY(v_external_ids)
      AND evidence.evidence_status <> 'quarantined_validation'
  ) <> 0 THEN
    RAISE EXCEPTION 'protected-identity quarantine postcondition failed';
  END IF;
END;
$migration$;
