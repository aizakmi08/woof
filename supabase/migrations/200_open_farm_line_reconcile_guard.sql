-- Open Farm line names such as RawMix Front Range are distinctive formula
-- identities even when the queue title has no protected protein token. Keep the
-- fallback narrow so vague titles like "Senior dog food" stay unresolved.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%open_farm_distinct_line_signal%' THEN
    function_sql := replace(
      function_sql,
      '  royal_canin_dog_size_signal BOOLEAN;',
      '  royal_canin_dog_size_signal BOOLEAN;
  open_farm_distinct_line_signal BOOLEAN;'
    );
  END IF;

  IF function_sql NOT LIKE '%Open Farm distinct line-name signal%' THEN
    function_sql := replace(
      function_sql,
      $$  q_has_dog := q_norm ~ '\m(dog|dogs|puppy|puppies|canine)\M'$$,
      $$  open_farm_distinct_line_signal := q_brand_norm = 'open farm'
    -- Open Farm distinct line-name signal
    AND q_norm ~ '\m(rawmix|front range|open prairie|tide terrain|great plains|goodbowl|goodgut|wild caught|homestead|pasture raised|grass fed|small breed|surf turf|surf and turf)\M';

  q_has_dog := q_norm ~ '\m(dog|dogs|puppy|puppies|canine)\M'$$
    );
  END IF;

  function_sql := replace(
    function_sql,
    $$AND q_norm ~ '\m(rawmix|front range|open prairie|tide terrain|great plains|goodbowl|goodgut|wild caught|homestead|pasture raised|grass fed)\M';$$,
    $$AND q_norm ~ '\m(rawmix|front range|open prairie|tide terrain|great plains|goodbowl|goodgut|wild caught|homestead|pasture raised|grass fed|small breed|surf turf|surf and turf)\M';$$
  );

  function_sql := replace(
    function_sql,
    '  IF cardinality(q_terms) = 0 AND NOT royal_canin_dog_breed_signal AND NOT royal_canin_dog_size_signal THEN',
    '  IF cardinality(q_terms) = 0 AND NOT royal_canin_dog_breed_signal AND NOT royal_canin_dog_size_signal AND NOT open_farm_distinct_line_signal THEN'
  );

  IF function_sql NOT LIKE '%Open Farm distinct line-name signal%' THEN
    RAISE EXCEPTION 'Open Farm distinct line-name signal patch failed';
  END IF;

  IF function_sql NOT LIKE '%AND NOT open_farm_distinct_line_signal THEN%' THEN
    RAISE EXCEPTION 'Open Farm no-protein-term guard patch failed';
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
    'Open Farm',
    'Open Farm RawMix Grain-Free Front Range Dry Dog Food',
    'dog',
    'Open Farm',
    'RawMix Front Range Grain-Free Dog Kibble RawMix Front Range Grain-Free Kibble dry 3.5 lb',
    'dog',
    8.8
  ) THEN
    RAISE EXCEPTION 'Open Farm RawMix Front Range exact line title should reconcile';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Open Farm',
    'Open Farm Senior dog food',
    'dog',
    'Open Farm',
    'Senior Grain-Free Dog Kibble Senior Grain-Free Kibble dry 4 lb',
    'dog',
    8.1
  ) THEN
    RAISE EXCEPTION 'Open Farm vague senior dog title must stay unresolved';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Open Farm',
    'Open Farm Small Breed Grain-Free Dog Kibble',
    'dog',
    'Open Farm',
    'Small Breed Grain-Free Dog Kibble Small Breed Grain-Free Kibble dry 4 lb',
    'dog',
    9.0
  ) THEN
    RAISE EXCEPTION 'Open Farm exact Small Breed line title should reconcile';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Open Farm',
    'Open Farm Surf Turf Pate for Dogs',
    'dog',
    'Open Farm',
    'Surf & Turf Pâté for Dogs Surf & Turf Pâté wet 12 oz',
    'dog',
    8.0
  ) THEN
    RAISE EXCEPTION 'Open Farm exact Surf Turf Pate title should reconcile';
  END IF;
END $$;
