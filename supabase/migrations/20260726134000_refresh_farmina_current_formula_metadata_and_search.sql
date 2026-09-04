-- Refresh each current Farmina canonical formula from the exact serving row
-- selected by its promoted cache key, then add a provenance-backed exact-title
-- search alias. This prevents a stale package-size sibling from supplying the
-- title/image for another current formula while keeping package sizes as SKU
-- children.

CREATE TEMP TABLE farmina_current_representatives ON COMMIT DROP AS
WITH source_run AS (
  SELECT id
  FROM public.catalog_source_runs
  WHERE run_key =
    'farmina-pet-foods:official-formula-inventory:12f8b4c817fbc0c32c839434'
    AND status = 'completed'
    AND pagination_complete = TRUE
    AND observed_count = 323
    AND accepted_count = 323
    AND rejected_count = 0
),
ranked AS (
  SELECT
    observation.formula_id,
    observation.product_name,
    observation.product_line,
    observation.pet_type,
    observation.life_stage,
    observation.food_form,
    observation.flavor,
    observation.diet_condition,
    observation.ingredient_text,
    observation.front_image_url,
    observation.source_url,
    observation.source_authority,
    observation.observed_at,
    observation.raw_payload->>'cache_key' AS cache_key,
    row_number() OVER (
      PARTITION BY observation.formula_id
      ORDER BY observation.observed_at DESC, observation.id DESC
    ) AS row_number
  FROM public.catalog_observations observation
  JOIN source_run ON source_run.id = observation.run_id
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
   AND formula.promoted_cache_key =
     observation.raw_payload->>'cache_key'
  JOIN public.product_data serving
    ON serving.cache_key = formula.promoted_cache_key
   AND serving.source_url = observation.source_url
   AND serving.ingredient_text = observation.ingredient_text
   AND serving.image_url = observation.front_image_url
   AND serving.is_complete_food = TRUE
   AND COALESCE(serving.catalog_exclusion_reason, '') = ''
   AND serving.source_quality IN (
     'gdsn', 'official', 'manufacturer', 'retailer_verified'
   )
   AND serving.ingredient_verification_status IN (
     'gdsn', 'official', 'manufacturer',
     'retailer_verified', 'label_ocr_verified'
   )
   AND serving.image_verification_status IN (
     'official', 'manufacturer', 'retailer_verified'
   )
  WHERE observation.validation_status = 'accepted'
)
SELECT *
FROM ranked
WHERE row_number = 1;

DO $$
DECLARE
  v_representatives INTEGER;
  v_unique_titles INTEGER;
BEGIN
  SELECT
    count(*),
    count(DISTINCT public.normalize_verified_product_search_query(product_name))
  INTO v_representatives, v_unique_titles
  FROM farmina_current_representatives;

  IF v_representatives <> 217
     OR v_unique_titles <> 217 THEN
    RAISE EXCEPTION
      'Farmina representative preflight failed: representatives %, unique exact titles %',
      v_representatives,
      v_unique_titles;
  END IF;
END $$;

UPDATE public.catalog_formulas formula
SET
  brand = 'Farmina',
  product_name = representative.product_name,
  product_line = representative.product_line,
  pet_type = representative.pet_type,
  life_stage = COALESCE(
    NULLIF(btrim(representative.life_stage), ''),
    'unknown'
  ),
  food_form = representative.food_form,
  flavor = COALESCE(representative.flavor, ''),
  diet_condition = COALESCE(representative.diet_condition, ''),
  is_complete_food = TRUE,
  ingredient_text = representative.ingredient_text,
  ingredients =
    public.catalog_split_ingredient_statement(representative.ingredient_text),
  front_image_url = representative.front_image_url,
  source_url = representative.source_url,
  source_authority = representative.source_authority,
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  verification_status = 'verified',
  active = TRUE,
  absent_since = NULL,
  last_observed_at = GREATEST(
    formula.last_observed_at,
    representative.observed_at
  ),
  updated_at = NOW()
FROM farmina_current_representatives representative
WHERE formula.id = representative.formula_id;

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance,
  active
)
SELECT
  representative.cache_key,
  representative.product_name,
  public.normalize_verified_product_search_query(
    representative.product_name
  ),
  representative.source_url,
  'manufacturer',
  representative.observed_at,
  jsonb_build_object(
    'source_run',
    'farmina-pet-foods:official-formula-inventory:12f8b4c817fbc0c32c839434',
    'exact_promoted_serving_row',
    TRUE,
    'formula_id',
    representative.formula_id
  ),
  TRUE
FROM farmina_current_representatives representative
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_verified_product_search_aliases alias
  WHERE alias.active
    AND alias.normalized_alias =
      public.normalize_verified_product_search_query(
        representative.product_name
      )
);

DO $$
DECLARE
  v_verified INTEGER;
  v_aliases INTEGER;
BEGIN
  SELECT count(*) INTO v_verified
  FROM farmina_current_representatives representative
  JOIN public.catalog_formulas formula
    ON formula.id = representative.formula_id
  WHERE formula.active
    AND formula.verification_status = 'verified'
    AND formula.product_name = representative.product_name
    AND formula.ingredient_text = representative.ingredient_text
    AND formula.front_image_url = representative.front_image_url
    AND formula.source_url = representative.source_url
    AND formula.promoted_cache_key = representative.cache_key;

  SELECT count(*) INTO v_aliases
  FROM farmina_current_representatives representative
  JOIN public.catalog_verified_product_search_aliases alias
    ON alias.active
   AND alias.cache_key = representative.cache_key
   AND alias.normalized_alias =
     public.normalize_verified_product_search_query(
       representative.product_name
     );

  IF v_verified <> 217 OR v_aliases <> 217 THEN
    RAISE EXCEPTION
      'Farmina current metadata/search postcondition failed: verified %, aliases %',
      v_verified,
      v_aliases;
  END IF;
END $$;
