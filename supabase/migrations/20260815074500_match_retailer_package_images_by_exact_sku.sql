-- Retailer slugs can change while the numeric SKU remains stable. Match image
-- evidence by the exact retailer host/path SKU instead of requiring the old
-- and new display slugs to be byte-identical.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.enrich_retailer_package_evidence(uuid,jsonb)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    '      AND evidence.source_url = valid.source_url',
    $replacement$      AND (
        (
          valid.source_slug = 'chewy'
          AND valid.source_url ~ (
            '^https://(www[.])?chewy[.]com/.*/dp/'
            || valid.source_external_id
            || '$'
          )
        )
        OR
        (
          valid.source_slug = 'walmart'
          AND valid.source_url ~ (
            '^https://(www[.])?walmart[.]com/ip/.*/'
            || valid.source_external_id
            || '$'
          )
        )
      )$replacement$
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'retailer source URL equality marker not found';
  END IF;
  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.enrich_retailer_package_evidence(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enrich_retailer_package_evidence(UUID, JSONB)
  TO service_role;
