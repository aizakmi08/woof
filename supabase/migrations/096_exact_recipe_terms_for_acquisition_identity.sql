-- Prefer under-resolving over overclaiming catalog coverage. Source-backed
-- queue reconciliation now requires the same notable recipe terms in both
-- the queued product text and the matched catalog identity.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_identity_match(
  p_queue_identity TEXT,
  p_queue_pet_type TEXT,
  p_catalog_identity TEXT,
  p_catalog_pet_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q_norm TEXT := public.catalog_acquisition_identity_normalize(p_queue_identity);
  c_norm TEXT := public.catalog_acquisition_identity_normalize(p_catalog_identity);
  q_proteins TEXT[];
  c_proteins TEXT[];
  q_recipe_terms TEXT[];
  c_recipe_terms TEXT[];
  required_term TEXT;
  identity_similarity REAL;
  identity_word_similarity REAL;
BEGIN
  IF q_norm IS NULL OR c_norm IS NULL OR length(q_norm) < 12 OR length(c_norm) < 12 THEN
    RETURN FALSE;
  END IF;

  IF p_queue_pet_type IN ('dog', 'cat')
     AND p_catalog_pet_type IN ('dog', 'cat')
     AND p_queue_pet_type <> p_catalog_pet_type THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(dog|puppy|canine)\M' AND p_catalog_pet_type = 'cat' THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(cat|kitten|feline)\M' AND p_catalog_pet_type = 'dog' THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M'
     AND c_norm !~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M' THEN
    RETURN FALSE;
  END IF;

  q_proteins := public.catalog_acquisition_identity_tokens(q_norm, ARRAY[
    'beef',
    'bison',
    'chicken',
    'cod',
    'crab',
    'duck',
    'fish',
    'herring',
    'lamb',
    'liver',
    'mackerel',
    'oceanfish',
    'pork',
    'quail',
    'rabbit',
    'salmon',
    'sardine',
    'shrimp',
    'trout',
    'tuna',
    'turkey',
    'venison',
    'whitefish'
  ]);
  c_proteins := public.catalog_acquisition_identity_tokens(c_norm, ARRAY[
    'beef',
    'bison',
    'chicken',
    'cod',
    'crab',
    'duck',
    'fish',
    'herring',
    'lamb',
    'liver',
    'mackerel',
    'oceanfish',
    'pork',
    'quail',
    'rabbit',
    'salmon',
    'sardine',
    'shrimp',
    'trout',
    'tuna',
    'turkey',
    'venison',
    'whitefish'
  ]);

  IF cardinality(q_proteins) = 0 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(q_proteins) AS q_tokens(q_token)
    WHERE NOT q_token = ANY(c_proteins)
  ) OR EXISTS (
    SELECT 1
    FROM unnest(c_proteins) AS c_tokens(c_token)
    WHERE NOT c_token = ANY(q_proteins)
  ) THEN
    RETURN FALSE;
  END IF;

  q_recipe_terms := public.catalog_acquisition_identity_tokens(q_norm, ARRAY[
    'barley',
    'bone',
    'brain',
    'brown',
    'carrot',
    'carrots',
    'cheddar',
    'cheese',
    'heart',
    'joint',
    'oat',
    'oatmeal',
    'pea',
    'peas',
    'potato',
    'potatoes',
    'rice',
    'spinach',
    'sweet',
    'tomato',
    'tomatoes',
    'wild'
  ]);
  c_recipe_terms := public.catalog_acquisition_identity_tokens(c_norm, ARRAY[
    'barley',
    'bone',
    'brain',
    'brown',
    'carrot',
    'carrots',
    'cheddar',
    'cheese',
    'heart',
    'joint',
    'oat',
    'oatmeal',
    'pea',
    'peas',
    'potato',
    'potatoes',
    'rice',
    'spinach',
    'sweet',
    'tomato',
    'tomatoes',
    'wild'
  ]);

  IF EXISTS (
    SELECT 1
    FROM unnest(q_recipe_terms) AS q_terms(q_term)
    WHERE NOT q_term = ANY(c_recipe_terms)
  ) OR EXISTS (
    SELECT 1
    FROM unnest(c_recipe_terms) AS c_terms(c_term)
    WHERE NOT c_term = ANY(q_recipe_terms)
  ) THEN
    RETURN FALSE;
  END IF;

  FOREACH required_term IN ARRAY ARRAY[
    'adult 7',
    'classic ground',
    'digestive',
    'dry',
    'grain free',
    'grilled',
    'hairball',
    'healthy weight',
    'high protein',
    'hydrolyzed',
    'indoor',
    'kitten',
    'large breed',
    'mousse',
    'pate',
    'puppy',
    'renal',
    'senior',
    'sensitive',
    'shreds',
    'skin',
    'small breed',
    'stomach',
    'tender',
    'urinary',
    'weight',
    'wet'
  ] LOOP
    IF position(required_term IN q_norm) > 0
       AND position(required_term IN c_norm) = 0 THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  identity_similarity := similarity(q_norm, c_norm);
  identity_word_similarity := word_similarity(q_norm, c_norm);

  IF q_norm = c_norm THEN
    RETURN TRUE;
  END IF;

  IF q_norm LIKE '%' || c_norm || '%' AND length(c_norm) >= 20 THEN
    RETURN TRUE;
  END IF;

  IF c_norm LIKE '%' || q_norm || '%'
     AND length(q_norm)::NUMERIC / GREATEST(length(c_norm), 1) >= 0.82 THEN
    RETURN TRUE;
  END IF;

  IF identity_similarity >= 0.62 OR identity_word_similarity >= 0.78 THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

WITH stale_identity_resolutions AS (
  SELECT q.id
  FROM public.catalog_acquisition_queue q
  LEFT JOIN public.product_data pd
    ON pd.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.resolution_reason = 'source-backed catalog product matched queued product identity'
    AND NOT (
      pd.cache_key IS NOT NULL
      AND pd.expires_at > now()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND pd.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      AND pd.image_url IS NOT NULL
      AND pd.image_url !~* '^data:'
      AND pd.image_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      AND pd.pet_type IN ('dog', 'cat')
      AND public.catalog_acquisition_identity_match(
        q.product_name,
        q.pet_type,
        concat_ws(
          ' ',
          pd.product_name,
          pd.product_line,
          pd.flavor,
          pd.life_stage,
          pd.food_form,
          pd.package_size
        ),
        pd.pet_type
      )
    )
)
UPDATE public.catalog_acquisition_queue q
SET
  status = 'open',
  resolved_at = NULL,
  resolution_reason = 'reopened after exact recipe-term identity guard',
  updated_at = now(),
  sample_metadata = q.sample_metadata || jsonb_build_object(
    'reopened_at', now(),
    'reopened_by', '096_exact_recipe_terms_for_acquisition_identity',
    'previous_resolution_reason', 'source-backed catalog product matched queued product identity'
  )
FROM stale_identity_resolutions stale
WHERE q.id = stale.id;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) TO service_role;
