-- Refine duplicate food-form guard: reject explicit form conflicts, but do not
-- treat a missing form term on one side as a mismatch. Retail titles often omit
-- "dry" or "wet"; exact identity and variant guards still decide whether the
-- duplicate can close.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_food_form_terms_match(
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
    q_norm ~ '(^| )(dry|kibble|crunchy|clusters)( |$)' AS q_dry,
    c_norm ~ '(^| )(dry|kibble|crunchy|clusters)( |$)' AS c_dry,
    q_norm ~ '(^| )(wet|can|cans|canned|pouch|pouches|tray|trays|tub|cups|cup|pate|pat|gravy|sauce|stew|morsels|chunks|shreds|filets|loaf|minced|flaked|entree|entr e|broth)( |$)' AS q_wet,
    c_norm ~ '(^| )(wet|can|cans|canned|pouch|pouches|tray|trays|tub|cups|cup|pate|pat|gravy|sauce|stew|morsels|chunks|shreds|filets|loaf|minced|flaked|entree|entr e|broth)( |$)' AS c_wet,
    q_norm ~ '(^| )(fresh food|fresh dog food|fresh cat food|fresh frozen|fresh refrigerated|frozen|refrigerated)( |$)' AS q_fresh,
    c_norm ~ '(^| )(fresh food|fresh dog food|fresh cat food|fresh frozen|fresh refrigerated|frozen|refrigerated)( |$)' AS c_fresh,
    q_norm ~ '(^| )(freeze dried|freezedried|freeze dry)( |$)' AS q_freeze_dried,
    c_norm ~ '(^| )(freeze dried|freezedried|freeze dry)( |$)' AS c_freeze_dried,
    q_norm ~ '(^| )(dehydrated)( |$)' AS q_dehydrated,
    c_norm ~ '(^| )(dehydrated)( |$)' AS c_dehydrated,
    q_norm ~ '(^| )(air dried|airdried)( |$)' AS q_air_dried,
    c_norm ~ '(^| )(air dried|airdried)( |$)' AS c_air_dried,
    q_norm ~ '(^| )(raw food|raw frozen|frozen raw)( |$)' AS q_raw,
    c_norm ~ '(^| )(raw food|raw frozen|frozen raw)( |$)' AS c_raw
  FROM normalized
),
form_sets AS (
  SELECT
    ARRAY_REMOVE(ARRAY[
      CASE WHEN q_dry THEN 'dry' END,
      CASE WHEN q_wet THEN 'wet' END,
      CASE WHEN q_fresh THEN 'fresh' END,
      CASE WHEN q_freeze_dried THEN 'freeze_dried' END,
      CASE WHEN q_dehydrated THEN 'dehydrated' END,
      CASE WHEN q_air_dried THEN 'air_dried' END,
      CASE WHEN q_raw THEN 'raw' END
    ], NULL) AS q_forms,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN c_dry THEN 'dry' END,
      CASE WHEN c_wet THEN 'wet' END,
      CASE WHEN c_fresh THEN 'fresh' END,
      CASE WHEN c_freeze_dried THEN 'freeze_dried' END,
      CASE WHEN c_dehydrated THEN 'dehydrated' END,
      CASE WHEN c_air_dried THEN 'air_dried' END,
      CASE WHEN c_raw THEN 'raw' END
    ], NULL) AS c_forms
  FROM flags
)
SELECT CASE
  WHEN cardinality(q_forms) = 0 OR cardinality(c_forms) = 0 THEN TRUE
  ELSE EXISTS (
    SELECT 1
    FROM unnest(q_forms) AS q_form(form_name)
    JOIN unnest(c_forms) AS c_form(form_name)
      USING (form_name)
  )
END
FROM form_sets;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF public.catalog_acquisition_food_form_terms_match(
    'Blue Buffalo Freedom Grain-Free Small Breed Dry Dog Food Chicken Potatoes',
    'BLUE Freedom Wet Dog Food Grain-Free Small Breed Chicken wet https://www.bluebuffalo.com/wet-dog-food/freedom/small-breed-grain-free-chicken-recipe/'
  ) THEN
    RAISE EXCEPTION 'food-form guard must still reject explicit dry title matched to wet verified row';
  END IF;

  IF public.catalog_acquisition_food_form_terms_match(
    'Blue Buffalo Tastefuls Natural Flaked Wet Cat Food Chicken Entree in Gravy 3 oz cans',
    'BLUE Tastefuls Adult Dry Cat Food Chicken Brown Rice dry https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-adult-chicken/'
  ) THEN
    RAISE EXCEPTION 'food-form guard must still reject explicit wet title matched to dry verified row';
  END IF;

  IF NOT public.catalog_acquisition_food_form_terms_match(
    'Beneful Healthy Weight Chicken',
    'Beneful Healthy Weight Farm-Raised Chicken Natural Dry Dog Food dry https://www.purina.com/dogs/shop/beneful-healthy-weight-chicken-dry-dog-food'
  ) THEN
    RAISE EXCEPTION 'food-form guard should allow missing query form when verified identity is dry';
  END IF;

  IF NOT public.catalog_acquisition_food_form_terms_match(
    'Dave''s 95% Premium Beef and Beef Liver',
    '95% Premium Meats Beef Beef Liver For Dogs wet 12.5 oz cans'
  ) THEN
    RAISE EXCEPTION 'food-form guard should allow missing query form when verified identity is wet';
  END IF;

  IF NOT public.catalog_acquisition_food_form_terms_match(
    'Stella & Chewy''s Wild Red Raw Coated Kibble Dry Dog Food Wholesome Grains Red Meat Recipe',
    'Wild Red Raw Coated Kibble Wholesome Grains Red Meat Recipe dry'
  ) THEN
    RAISE EXCEPTION 'raw coated kibble should be treated as dry kibble, not raw-food form';
  END IF;
END $$;
