-- Relax duplicate reconciliation only for non-conflicting official label terms
-- that commonly appear in source-backed titles but are absent from shortened
-- retailer/legacy titles. This does not change product serving or verified
-- ingredient rules; it only lets stale no-source duplicate queue rows close
-- when the remaining direct duplicate guards still pass.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_life_stage_terms_match(
  p_query_identity TEXT,
  p_candidate_identity TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    regexp_replace(lower(COALESCE(p_query_identity, '')), '[^a-z0-9+]+', ' ', 'g') AS q_norm,
    regexp_replace(lower(COALESCE(p_candidate_identity, '')), '[^a-z0-9+]+', ' ', 'g') AS c_norm
),
flags AS (
  SELECT
    (
      q_norm ~ '(^| )(puppy|puppies)( |$)'
      OR q_norm ~ '(^| )growth formula( |$)'
    ) AS q_puppy,
    (
      c_norm ~ '(^| )(puppy|puppies)( |$)'
      OR c_norm ~ '(^| )growth formula( |$)'
    ) AS c_puppy,
    q_norm ~ '(^| )(kitten|kittens)( |$)' AS q_kitten,
    c_norm ~ '(^| )(kitten|kittens)( |$)' AS c_kitten,
    (
      q_norm ~ '(^| )(senior|seniors|mature|aging|ageing)( |$)'
      OR q_norm ~ '(^| )adult (7|8|9|10|11|12)( plus|\+)?( |$)'
      OR q_norm ~ '(^| )(7|8|9|10|11|12)( plus|\+)( |$)'
    ) AS q_senior,
    (
      c_norm ~ '(^| )(senior|seniors|mature|aging|ageing)( |$)'
      OR c_norm ~ '(^| )adult (7|8|9|10|11|12)( plus|\+)?( |$)'
      OR c_norm ~ '(^| )(7|8|9|10|11|12)( plus|\+)( |$)'
    ) AS c_senior,
    (
      q_norm ~ '(^| )all life stages( |$)'
      OR q_norm ~ '(^| )all ages( |$)'
    ) AS q_all_life,
    (
      c_norm ~ '(^| )all life stages( |$)'
      OR c_norm ~ '(^| )all ages( |$)'
    ) AS c_all_life
  FROM normalized
)
SELECT
  q_puppy = c_puppy
  AND q_kitten = c_kitten
  AND q_senior = c_senior
  AND (
    q_all_life = c_all_life
    OR (
      c_all_life
      AND NOT q_all_life
      AND NOT q_puppy
      AND NOT q_kitten
      AND NOT q_senior
    )
  )
FROM flags;
$$;

CREATE OR REPLACE FUNCTION public.catalog_acquisition_protected_line_terms_match(
  p_query_identity TEXT,
  p_candidate_identity TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    regexp_replace(lower(COALESCE(p_query_identity, '')), '[^a-z0-9]+', ' ', 'g') AS q_norm,
    regexp_replace(lower(COALESCE(p_candidate_identity, '')), '[^a-z0-9]+', ' ', 'g') AS c_norm
),
flags AS (
  SELECT
    q_norm ~ '(^| )high protein( |$)' AS q_high_protein,
    c_norm ~ '(^| )high protein( |$)' AS c_high_protein,
    q_norm ~ '(^| )blue( |$)' AND q_norm ~ '(^| )wilderness( |$)' AS q_blue_wilderness,
    c_norm ~ '(^| )blue( |$)' AND c_norm ~ '(^| )wilderness( |$)' AS c_blue_wilderness,
    q_norm ~ '(^| )challenger( |$)' AS q_nulo_challenger,
    c_norm ~ '(^| )challenger( |$)' AS c_nulo_challenger,
    (
      q_norm ~ '(^| )sport( |$)'
      AND q_norm ~ '(^| )performance( |$)'
    ) OR q_norm ~ '(^| )30 20( |$)' AS q_pro_plan_sport,
    (
      c_norm ~ '(^| )sport( |$)'
      AND c_norm ~ '(^| )performance( |$)'
    ) OR c_norm ~ '(^| )30 20( |$)' AS c_pro_plan_sport
  FROM normalized
)
SELECT
  q_high_protein = c_high_protein
  OR (
    -- Blue Wilderness high-protein line equivalence.
    q_high_protein
    AND NOT c_high_protein
    AND q_blue_wilderness
    AND c_blue_wilderness
  )
  OR (
    -- Nulo Challenger products use "High-Protein Kibble" in official titles.
    c_high_protein
    AND NOT q_high_protein
    AND q_nulo_challenger
    AND c_nulo_challenger
  )
  OR (
    -- Pro Plan Sport 30/20 titles are the high-protein Sport line.
    c_high_protein
    AND NOT q_high_protein
    AND q_pro_plan_sport
    AND c_pro_plan_sport
  )
FROM flags;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_life_stage_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_life_stage_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_life_stage_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_life_stage_terms_match(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_life_stage_terms_match(
    'Purina Pro Plan Sport Performance 30/20 Chicken and Rice',
    'Pro Plan All Ages Sport Performance 30/20 Chicken & Rice Formula'
  ) THEN
    RAISE EXCEPTION 'all ages should be allowed when queue title has no conflicting life-stage term';
  END IF;

  IF public.catalog_acquisition_life_stage_terms_match(
    'Purina Pro Plan Senior 7 Plus Chicken Rice',
    'Pro Plan All Ages Sport Performance 30/20 Chicken & Rice Formula'
  ) THEN
    RAISE EXCEPTION 'senior queue title must not match all-ages non-senior product';
  END IF;

  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Nulo challenger Small Breed Northern Catch Haddock Salmon Redfish',
    'Nulo Challenger High-Protein Kibble For Small Breed Northern Catch Haddock Salmon Redfish'
  ) THEN
    RAISE EXCEPTION 'Nulo Challenger should allow official high-protein wording';
  END IF;

  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Purina Pro Plan Sport Performance 30/20 Chicken and Rice',
    'Pro Plan All Ages Sport Performance 30/20 High Protein Chicken Rice Formula'
  ) THEN
    RAISE EXCEPTION 'Pro Plan Sport 30/20 should allow official high-protein wording';
  END IF;

  IF public.catalog_acquisition_protected_line_terms_match(
    'Purina Pro Plan Small Breed Adult Chicken Rice',
    'Pro Plan High Protein Sensitive Skin Chicken Rice Formula'
  ) THEN
    RAISE EXCEPTION 'unrelated high-protein protected-line mismatch must still reject';
  END IF;
END;
$$;
