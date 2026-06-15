-- 041: Accept PostgREST's observed log_product_event argument order.
--
-- Some clients/schema-cache states resolve RPC payload keys as
-- (p_event_name, p_metadata, p_session_id) even though the original function is
-- declared as (p_event_name, p_session_id, p_metadata). This compatibility
-- overload keeps analytics non-blocking and avoids repeated schema-cache RPC
-- failures while delegating validation/storage to the canonical function.

CREATE OR REPLACE FUNCTION public.log_product_event(
  p_event_name TEXT,
  p_metadata JSONB,
  p_session_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_product_event(p_event_name, p_session_id, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.log_product_event(TEXT, JSONB, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_product_event(TEXT, JSONB, TEXT)
  TO anon, authenticated;
