-- Extend the protected cross-source package-image lane to exact Chewy PDP
-- ingredient evidence. All existing identity, image, ingredient, score,
-- recall, margin, and service-role gates remain unchanged.

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
    $$WHERE source_slug = 'walmart'
      AND source_external_id ~ '^[0-9]{5,20}$'
      AND source_url ~ ('^https://www[.]walmart[.]com/ip/.+/' || source_external_id || '$')$$,
    $$WHERE source_slug IN ('walmart', 'chewy')
      AND source_external_id ~ '^[0-9]{5,20}$'
      AND (
        (
          source_slug = 'walmart'
          AND source_url ~ ('^https://www[.]walmart[.]com/ip/.+/' || source_external_id || '$')
        )
        OR (
          source_slug = 'chewy'
          AND source_url ~ ('^https://www[.]chewy[.]com/.+/dp/' || source_external_id || '$')
        )
      )$$
  );

  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'cross-source retailer URL validation marker not found';
  END IF;

  EXECUTE v_patched;
END;
$migration$;

REVOKE ALL ON FUNCTION public.apply_cross_source_formula_images(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cross_source_formula_images(UUID, JSONB)
  TO service_role;
