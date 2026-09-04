-- BLUE Wilderness is the brand's high-protein line, but the official
-- manufacturer product titles often say "Nature's Evolutionary Diet" instead
-- of spelling out "High-Protein". Allow that exact line equivalence while
-- keeping high-protein guarded for other brands and Blue non-Wilderness lines.

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
    c_norm ~ '(^| )blue( |$)' AND c_norm ~ '(^| )wilderness( |$)' AS c_blue_wilderness
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
FROM flags;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Blue Buffalo Wilderness Natural High-Protein Dry Food for Adult Dogs, Chicken Recipe',
    'BLUE Wilderness Nature''s Evolutionary Diet with Chicken for Adult Dogs Dry Food'
  ) THEN
    RAISE EXCEPTION 'Blue Wilderness high-protein marketplace titles should match official Wilderness line titles';
  END IF;

  IF public.catalog_acquisition_protected_line_terms_match(
    'Blue Buffalo High Protein Chicken Recipe',
    'BLUE Life Protection Formula Chicken and Brown Rice Recipe'
  ) THEN
    RAISE EXCEPTION 'Blue non-Wilderness high-protein title must not match non-high-protein Blue line';
  END IF;

  IF public.catalog_acquisition_protected_line_terms_match(
    'Nulo FreeStyle Turkey and Sweet Potato',
    'FreeStyle High-Protein Kibble Turkey & Sweet Potato Recipe'
  ) THEN
    RAISE EXCEPTION 'Nulo missing high-protein term must remain protected';
  END IF;

  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Nulo FreeStyle High-Protein Turkey and Sweet Potato',
    'FreeStyle High-Protein Kibble Turkey & Sweet Potato Recipe'
  ) THEN
    RAISE EXCEPTION 'matching high-protein terms should still pass';
  END IF;
END $$;
