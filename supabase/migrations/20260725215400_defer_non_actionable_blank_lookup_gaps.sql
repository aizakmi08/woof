-- Blank label/provider failures are operational reliability signals, not
-- actionable product-acquisition identities. Keep their demand telemetry, but
-- prevent them from outranking named formula gaps after every queue refresh.

CREATE OR REPLACE FUNCTION public.classify_catalog_acquisition_queue_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.gap_type = 'lookup'
     AND COALESCE(NULLIF(trim(NEW.normalized_query), ''), '[blank]') = '[blank]' THEN
    NEW.status := 'deferred';
    NEW.priority_score := 0;
    NEW.needs_product_record := FALSE;
    NEW.needs_verified_ingredients := FALSE;
    NEW.needs_verified_image := FALSE;
    NEW.needs_pet_type := FALSE;
    NEW.acquisition_notes := 'Operational scan/provider failure without a recognized product identity; excluded from formula acquisition priority.';
    NEW.sample_metadata := COALESCE(NEW.sample_metadata, '{}'::jsonb) || jsonb_build_object(
      'actionability', 'operational_only',
      'deferred_reason', 'blank_product_identity',
      'retains_demand_telemetry', TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS classify_catalog_acquisition_queue_row
  ON public.catalog_acquisition_queue;

CREATE TRIGGER classify_catalog_acquisition_queue_row
BEFORE INSERT OR UPDATE ON public.catalog_acquisition_queue
FOR EACH ROW
EXECUTE FUNCTION public.classify_catalog_acquisition_queue_row();

UPDATE public.catalog_acquisition_queue
SET
  status = 'deferred',
  priority_score = 0,
  needs_product_record = FALSE,
  needs_verified_ingredients = FALSE,
  needs_verified_image = FALSE,
  needs_pet_type = FALSE,
  acquisition_notes = 'Operational scan/provider failure without a recognized product identity; excluded from formula acquisition priority.',
  sample_metadata = COALESCE(sample_metadata, '{}'::jsonb) || jsonb_build_object(
    'actionability', 'operational_only',
    'deferred_reason', 'blank_product_identity',
    'retains_demand_telemetry', TRUE
  ),
  updated_at = now()
WHERE gap_type = 'lookup'
  AND COALESCE(NULLIF(trim(normalized_query), ''), '[blank]') = '[blank]';

REVOKE ALL ON FUNCTION public.classify_catalog_acquisition_queue_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classify_catalog_acquisition_queue_row() FROM anon;
REVOKE ALL ON FUNCTION public.classify_catalog_acquisition_queue_row() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.classify_catalog_acquisition_queue_row() TO service_role;

DO $$
DECLARE
  blank_row public.catalog_acquisition_queue%ROWTYPE;
BEGIN
  SELECT *
  INTO blank_row
  FROM public.catalog_acquisition_queue
  WHERE gap_type = 'lookup'
    AND COALESCE(NULLIF(trim(normalized_query), ''), '[blank]') = '[blank]'
  LIMIT 1;

  IF FOUND AND (
    blank_row.status <> 'deferred'
    OR blank_row.priority_score <> 0
    OR blank_row.needs_product_record
    OR blank_row.sample_metadata->>'actionability' <> 'operational_only'
  ) THEN
    RAISE EXCEPTION 'Blank lookup gap was not safely deferred';
  END IF;
END;
$$;
