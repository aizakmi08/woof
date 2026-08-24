-- Retire pre-import v2 artifacts. V3 requires every visible recipe/form/life
-- stage marker to be substantiated by structured source identity or its URL.

DO $migration$
DECLARE
  v_definition TEXT;
  v_patched TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_cross_source_formula_images(uuid,jsonb)'::regprocedure
  ) INTO v_definition;
  v_patched := replace(
    v_definition,
    $$identity_boundary_version = 'protected-boundaries-v2'$$,
    $$identity_boundary_version = 'protected-boundaries-v3'$$
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'cross-source v2 identity-boundary marker not found';
  END IF;
  EXECUTE v_patched;
END;
$migration$;
