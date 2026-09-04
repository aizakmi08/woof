-- Privileged scan accounting must never inherit PostgreSQL's default
-- PUBLIC execute privilege. Authenticated users may consume their own scan;
-- only service-role Edge Functions may reverse a failed scan.

REVOKE ALL ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.reverse_scan(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_scan(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_scan(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_scan(UUID, TEXT, TEXT) TO service_role;
