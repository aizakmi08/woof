-- catalog_observations.package_size is non-null. Preserve an honest unknown
-- value when the exact retailer page did not publish a parseable size.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.rehydrate_exact_retailer_source_versions(jsonb)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $before$      NULLIF(versioned.package_size, ''),
      versioned.exact_ingredient_text,$before$,
    $after$      COALESCE(NULLIF(versioned.package_size, ''), 'unknown'),
      versioned.exact_ingredient_text,$after$
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'Exact source-version package-size guard not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.rehydrate_exact_retailer_source_versions(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rehydrate_exact_retailer_source_versions(JSONB)
  TO service_role;
