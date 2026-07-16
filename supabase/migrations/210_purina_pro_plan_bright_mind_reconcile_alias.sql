-- Official Purina titles call this dog formula "Adult 7+ Bright Mind" and
-- include senior metadata, while acquisition titles often say "Bright Mind
-- Adult 7+ Chicken and Rice Formula" without dog/senior terms. Keep the
-- allowance scoped to that exact Pro Plan dog line and require recipe terms to
-- pass the existing containment guard.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%purina_pro_plan_bright_mind_adult7_dog_signal%' THEN
    function_sql := replace(
      function_sql,
      '  blue_family_favorites_dog_signal BOOLEAN;',
      '  blue_family_favorites_dog_signal BOOLEAN;
  purina_pro_plan_bright_mind_adult7_dog_signal BOOLEAN;'
    );

    function_sql := replace(
      function_sql,
      $$     ) THEN
    RETURN FALSE;
  END IF;$$,
      $$     )
     AND NOT (
       COALESCE(p_rank, 0) >= 5.0
       AND q_brand_norm = 'purina pro plan'
       AND c_brand_norm = 'purina pro plan'
       AND lower(COALESCE(p_queue_brand, '')) LIKE 'purina pro plan%'
       AND lower(COALESCE(p_matched_brand, '')) LIKE 'purina pro plan%'
       AND p_matched_pet_type = 'dog'
       -- Purina Pro Plan Bright Mind Adult 7+ dog title allowance.
       AND q_norm ~ '\mbright mind\M'
       AND c_norm ~ '\mbright mind\M'
       AND q_norm ~ '\madult 7\M'
       AND c_norm ~ '\m(adult 7|senior)\M'
     ) THEN
    RETURN FALSE;
  END IF;$$
    );

    function_sql := replace(
      function_sql,
      $$  q_has_dog := q_norm ~ '\m(dog|dogs|puppy|puppies|canine)\M'$$,
      $$  purina_pro_plan_bright_mind_adult7_dog_signal := q_brand_norm = 'purina pro plan'
    AND c_brand_norm = 'purina pro plan'
    AND lower(COALESCE(p_queue_brand, '')) LIKE 'purina pro plan%'
    AND lower(COALESCE(p_matched_brand, '')) LIKE 'purina pro plan%'
    AND p_matched_pet_type = 'dog'
    AND q_norm ~ '\mbright mind\M'
    AND c_norm ~ '\mbright mind\M'
    AND q_norm ~ '\madult 7\M'
    AND c_norm ~ '\m(adult 7|senior)\M';

  q_has_dog := q_norm ~ '\m(dog|dogs|puppy|puppies|canine)\M'$$
    );

    function_sql := replace(
      function_sql,
      '    OR blue_family_favorites_dog_signal;',
      '    OR blue_family_favorites_dog_signal
    OR purina_pro_plan_bright_mind_adult7_dog_signal;'
    );

    function_sql := replace(
      function_sql,
      $$      AND q_norm !~ ('\m' || extra_guard.term || '\M')$$,
      $$      AND q_norm !~ ('\m' || extra_guard.term || '\M')
      AND NOT (
        purina_pro_plan_bright_mind_adult7_dog_signal
        AND extra_guard.term = 'senior'
        AND q_norm ~ '\madult 7\M'
      )$$
    );
  END IF;

  IF function_sql NOT LIKE '%Purina Pro Plan Bright Mind Adult 7+ dog title allowance%' THEN
    RAISE EXCEPTION 'Purina Pro Plan Bright Mind rank allowance patch failed';
  END IF;

  IF function_sql NOT LIKE '%purina_pro_plan_bright_mind_adult7_dog_signal := q_brand_norm = ''purina pro plan''%' THEN
    RAISE EXCEPTION 'Purina Pro Plan Bright Mind signal patch failed';
  END IF;

  IF function_sql NOT LIKE '%OR purina_pro_plan_bright_mind_adult7_dog_signal%' THEN
    RAISE EXCEPTION 'Purina Pro Plan Bright Mind species signal patch failed';
  END IF;

  IF function_sql NOT LIKE '%extra_guard.term = ''senior''%' THEN
    RAISE EXCEPTION 'Purina Pro Plan Bright Mind senior equivalence patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Purina Pro Plan',
    'Purina Pro Plan Bright Mind Adult 7+ Chicken and Rice Formula',
    'unknown',
    'Purina Pro Plan',
    'Pro Plan Adult 7+ Bright Mind Chicken & Rice Formula Dry Dog Food Pro Plan Adult 7+ Bright Mind Chicken & Rice Formula senior dry 16 lb. 038100170859',
    'dog',
    5.6
  ) THEN
    RAISE EXCEPTION 'Purina Pro Plan Bright Mind Adult 7+ should reconcile to the verified official dog row';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Purina Pro Plan',
    'Purina Pro Plan Bright Mind Adult 7+ Chicken and Rice Formula',
    'unknown',
    'Purina Pro Plan',
    'Pro Plan LiveClear Adult Chicken & Rice Formula Allergen Reducing Dry Cat Food Pro Plan LiveClear Adult Chicken & Rice Formula adult dry 3.2 lb',
    'cat',
    8.0
  ) THEN
    RAISE EXCEPTION 'Purina Pro Plan Bright Mind Adult 7+ must not reconcile to cat rows';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Purina Pro Plan',
    'Purina Pro Plan Bright Mind Adult 7+ Chicken and Rice Formula',
    'unknown',
    'Purina Pro Plan',
    'Pro Plan Adult 7+ Small Breed Chicken & Brown Rice Entrée Wet Dog Food Pro Plan Adult 7+ Small Breed Chicken & Brown Rice Entrée senior wet 5.5 oz',
    'dog',
    5.6
  ) THEN
    RAISE EXCEPTION 'Purina Pro Plan Bright Mind Adult 7+ must not reconcile to small-breed senior wet rows';
  END IF;
END $$;
