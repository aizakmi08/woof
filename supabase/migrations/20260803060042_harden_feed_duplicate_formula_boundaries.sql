-- The feed duplicate guard previously compared title, source, species, GTIN,
-- and package size, but not life stage, food form, or ingredient version. An
-- official Blue Buffalo Mature Indoor cat formula therefore collided with an
-- adult formula whose manufacturer page reused the same display title.

DO $migration$
DECLARE
  function_sql TEXT;
  old_guard TEXT := $old$   AND (
      NULLIF(btrim(existing.pet_type), '') IS NULL
      OR NULLIF(btrim(incoming.pet_type), '') IS NULL
      OR lower(existing.pet_type) = lower(incoming.pet_type)
   )
  WHERE existing.is_complete_food IS TRUE$old$;
  new_guard TEXT := $new$   AND (
      NULLIF(btrim(existing.pet_type), '') IS NULL
      OR NULLIF(btrim(incoming.pet_type), '') IS NULL
      OR lower(existing.pet_type) = lower(incoming.pet_type)
   )
   AND lower(COALESCE(NULLIF(btrim(existing.life_stage), ''), 'unknown'))
       = lower(COALESCE(NULLIF(btrim(incoming.life_stage), ''), 'unknown'))
   AND lower(COALESCE(NULLIF(btrim(existing.food_form), ''), 'unknown'))
       = lower(COALESCE(NULLIF(btrim(incoming.food_form), ''), 'unknown'))
   AND public.catalog_normalize_ingredient_evidence(existing.ingredient_text)
       = public.catalog_normalize_ingredient_evidence(incoming.ingredient_text)
  -- formula-boundary duplicate guard
  WHERE existing.is_complete_food IS TRUE$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.upsert_catalog_product_feed(jsonb)'::regprocedure
  ) INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed not found';
  END IF;

  IF function_sql NOT LIKE '%formula-boundary duplicate guard%' THEN
    IF function_sql NOT LIKE '%' || old_guard || '%' THEN
      RAISE EXCEPTION 'feed duplicate guard insertion point not found';
    END IF;
    function_sql := replace(function_sql, old_guard, new_guard);
  END IF;

  IF function_sql NOT LIKE '%formula-boundary duplicate guard%'
     OR function_sql NOT LIKE '%existing.life_stage%'
     OR function_sql NOT LIKE '%existing.food_form%'
     OR function_sql NOT LIKE '%catalog_normalize_ingredient_evidence(existing.ingredient_text)%' THEN
    RAISE EXCEPTION 'feed formula-boundary duplicate guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_feed(JSONB)
  TO service_role;

DO $$
DECLARE
  fn TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.upsert_catalog_product_feed(jsonb)'::regprocedure
  ) INTO fn;

  IF fn NOT LIKE '%formula-boundary duplicate guard%' THEN
    RAISE EXCEPTION 'feed formula-boundary guard is not installed';
  END IF;

  IF has_function_privilege(
      'anon',
      'public.upsert_catalog_product_feed(jsonb)',
      'EXECUTE'
    ) OR has_function_privilege(
      'authenticated',
      'public.upsert_catalog_product_feed(jsonb)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'feed import RPC must remain service-role-only';
  END IF;
END;
$$;
