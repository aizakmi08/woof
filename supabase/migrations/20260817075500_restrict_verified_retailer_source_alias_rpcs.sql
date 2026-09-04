-- The retailer source-alias ledger is private catalog-verification metadata.
-- Keep its export RPCs available to server-side census jobs only.

REVOKE ALL ON FUNCTION public.get_verified_retailer_source_aliases(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_verified_retailer_source_aliases(INTEGER, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_verified_retailer_source_aliases_keyset(BIGINT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_verified_retailer_source_aliases_keyset(BIGINT, INTEGER)
  TO service_role;
