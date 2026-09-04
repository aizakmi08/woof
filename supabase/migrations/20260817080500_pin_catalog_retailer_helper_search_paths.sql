-- Pin lookup paths for catalog identity helpers used by privileged ingestion RPCs.
-- These functions are SECURITY INVOKER, but an explicit path prevents callers
-- from influencing name resolution and keeps the database advisor clean.

ALTER FUNCTION public.catalog_normalize_retailer_boundary(text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.catalog_canonical_retailer_brand_boundary(text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.catalog_retailer_formula_hard_boundaries_match(
  text, text, text, text, text, text,
  text, text, text, text, text, text
)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.catalog_reviewed_pdp_title_token_recall(text, text)
  SET search_path = pg_catalog, public;
