-- Canonicalize common retailer line terms so acquisition matching does not
-- collapse generic rows onto small/large dog formulas, while still allowing
-- "small dog" and "small breed" wording to match each other.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_identity_normalize(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH cleaned AS (
    SELECT regexp_replace(
      extensions.unaccent(lower(COALESCE(p_value, ''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    ) AS value
  ),
  normalized AS (
    SELECT regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            regexp_replace(
                              regexp_replace(
                                regexp_replace(
                                  value,
                                  '\mblue buffalo\M',
                                  'blue',
                                  'g'
                                ),
                                '\mblue s\M',
                                'blue',
                                'g'
                              ),
                              '\mblue blue\M',
                              'blue',
                              'g'
                            ),
                            '\mfilet mignon\M|\mfillet mignon\M|\mporterhouse steak\M|\mnew york strip\M|\mgrilled steak\M|\msteak\M',
                            'beef',
                            'g'
                          ),
                          '\mslow cooked\M|\mcooked\M',
                          'slow cook',
                          'g'
                        ),
                        '\msmall dogs?\M',
                        'small breed',
                        'g'
                      ),
                      '\mlarge dogs?\M',
                      'large breed',
                      'g'
                    ),
                    '\mpotatoes\M',
                    'potato',
                    'g'
                  ),
                  '\mcarrots\M',
                  'carrot',
                  'g'
                ),
                '\mpeas\M',
                'pea',
                'g'
              ),
              '\mtomatoes\M',
              'tomato',
              'g'
            ),
            '\mvegetables\M|\mveggies\M',
            'vegetable',
            'g'
          ),
          '\mwhite fish\M',
          'whitefish',
          'g'
        ),
        '\mocean fish\M',
        'oceanfish',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    ) AS value
    FROM cleaned
  )
  SELECT NULLIF(trim(value), '')
  FROM normalized;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) TO service_role;

UPDATE public.catalog_acquisition_queue q
SET
  status = 'open',
  resolved_at = NULL,
  resolution_reason = NULL,
  updated_at = now(),
  sample_metadata = (
    COALESCE(q.sample_metadata, '{}'::jsonb)
    - 'matched_cache_key'
    - 'matched_product_name'
    - 'matched_brand'
    - 'identity_similarity'
    - 'identity_word_similarity'
    - 'identity_candidate_limit'
  ) || jsonb_build_object(
    'reopened_at', now(),
    'reopened_by', 'catalog_acquisition_size_line_term_guard',
    'reopen_reason', 'generic identity no longer passes small/large dog line-term guard'
  )
FROM public.product_data p
WHERE q.status = 'resolved'
  AND q.resolution_reason = 'source-backed catalog product matched queued product identity'
  AND q.sample_metadata->>'matched_cache_key' = p.cache_key
  AND NOT public.catalog_acquisition_identity_match(
    concat_ws(' ', q.brand, q.product_name),
    q.pet_type,
    concat_ws(' ', p.brand, p.product_name, p.product_line, p.flavor, p.life_stage, p.food_form),
    p.pet_type
  );
