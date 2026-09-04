-- Mirror the serving-table trigger's retailer-safe subset before selecting a
-- promotion batch. Unsafe rows become durable quarantines instead of rolling
-- back an otherwise valid batch or being retried forever.

CREATE OR REPLACE FUNCTION public.catalog_retailer_ingredient_is_serving_safe(
  value TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  WITH parsed AS (
    SELECT ingredient
    FROM unnest(public.catalog_split_ingredient_statement(COALESCE(value, '')))
      AS ingredient
    WHERE public.is_plausible_product_ingredient(ingredient)
  ), counted AS (
    SELECT count(*)::INTEGER AS ingredient_count FROM parsed
  )
  SELECT ingredient_count >= 5
    AND (
      ingredient_count >= 20
      OR COALESCE(value, '') ~* '\m(taurine|vitamin|zinc|ferrous|iron\s+sulfate|manganese|copper|potassium\s+iodide|calcium\s+iodate|choline\s+chloride|biotin|folic\s+acid|riboflavin|niacin|thiamine|pyridoxine|menadione)\M'
    )
  FROM counted;
$function$;

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
  v_marker TEXT := $marker$
  END IF;

  SELECT COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::BIGINT[])
$marker$;
  v_replacement TEXT := $replacement$
  END IF;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'product_data_ingredient_contract' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(
        evidence.validation_reasons,
        'product_data_ingredient_contract'
      )
    END,
    updated_at = now()
  WHERE evidence.import_run_id = p_import_run_id
    AND evidence.evidence_status = 'promotable_exact_package'
    AND NOT public.catalog_retailer_ingredient_is_serving_safe(
      evidence.ingredient_text
    );

  SELECT COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::BIGINT[])
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  )
  INTO v_definition;

  v_fixed_definition := replace(v_definition, v_marker, v_replacement);
  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'retailer serving-safe pre-promotion marker not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.catalog_retailer_ingredient_is_serving_safe(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_retailer_ingredient_is_serving_safe(TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
