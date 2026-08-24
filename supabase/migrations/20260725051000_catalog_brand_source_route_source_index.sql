-- Cover the source-health foreign key used when replacing or retiring a route.
CREATE INDEX IF NOT EXISTS catalog_brand_source_routes_source_key_idx
  ON public.catalog_brand_source_routes (source_key);
