-- Smart fuzzy search for product_data
--
-- Uses pg_trgm (Postgres trigram) for typo-tolerant matching on product_name
-- and brand. Replaces the previous client-side ILIKE pattern, which required
-- exact substring order and no typos.
--
-- Exposes a single RPC: search_products(q, max_results).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes make trigram similarity queries fast even on 10k+ rows.
CREATE INDEX IF NOT EXISTS idx_product_data_name_trgm
  ON product_data USING gin (product_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_product_data_brand_trgm
  ON product_data USING gin (brand gin_trgm_ops);

-- Smart search: ranks results by the best available match signal.
--
-- Signals (highest to lowest):
--   1.0 — query is a substring of product_name or brand (exact match)
--   0.0–1.0 — trigram similarity of product_name to query
--   0.0–0.8 — trigram similarity of brand to query (weighted lower so a
--             matching brand alone doesn't beat a full-name match)
--
-- A trigram similarity floor of 0.15 keeps mild typos ("kbbles" → "kibbles")
-- without flooding results with unrelated products.
CREATE OR REPLACE FUNCTION search_products(q TEXT, max_results INT DEFAULT 10)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  ingredient_count INT,
  source TEXT,
  image_url TEXT,
  rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle TEXT := lower(trim(q));
BEGIN
  IF needle IS NULL OR length(needle) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pd.cache_key,
    pd.product_name,
    pd.brand,
    pd.ingredient_count,
    pd.source,
    pd.image_url,
    GREATEST(
      CASE WHEN lower(pd.product_name) LIKE '%' || needle || '%' THEN 1.0 ELSE 0.0 END,
      CASE WHEN lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%' THEN 0.9 ELSE 0.0 END,
      similarity(lower(pd.product_name), needle),
      similarity(lower(COALESCE(pd.brand, '')), needle) * 0.8
    )::real AS rank
  FROM product_data pd
  WHERE pd.ingredient_count >= 3
    AND (
      lower(pd.product_name) LIKE '%' || needle || '%'
      OR lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%'
      OR similarity(lower(pd.product_name), needle) > 0.15
      OR similarity(lower(COALESCE(pd.brand, '')), needle) > 0.15
    )
  ORDER BY rank DESC, pd.ingredient_count DESC
  LIMIT max_results;
END;
$$;

GRANT EXECUTE ON FUNCTION search_products(TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION search_products(TEXT, INT) TO authenticated;
