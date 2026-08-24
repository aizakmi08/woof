-- Keep the indexed catalog identity in the same accent-insensitive form used
-- by app, OCR, and resolver queries. Without this, exact names containing
-- terms such as "Entrée" or "Pâté" disappear at the GIN candidate stage after
-- the query is normalized to "entree" or "pate".

CREATE OR REPLACE FUNCTION public.catalog_search_unaccent(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = public, extensions
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, value);
$$;

REVOKE ALL ON FUNCTION public.catalog_search_unaccent(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_search_unaccent(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_search_unaccent(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_search_unaccent(TEXT) TO service_role;

DROP INDEX IF EXISTS public.idx_product_data_search_document;

ALTER TABLE public.product_data
  DROP COLUMN IF EXISTS search_document;

ALTER TABLE public.product_data
  ADD COLUMN search_document tsvector
  GENERATED ALWAYS AS (
    setweight(
      to_tsvector(
        'simple',
        public.catalog_search_unaccent(
          coalesce(product_name, '') || ' ' ||
          coalesce(product_line, '') || ' ' ||
          coalesce(flavor, '') || ' ' ||
          coalesce(life_stage, '') || ' ' ||
          coalesce(food_form, '') || ' ' ||
          coalesce(package_size, '') || ' ' ||
          coalesce(gtin, '')
        )
      ),
      'A'
    ) ||
    setweight(
      to_tsvector('simple', public.catalog_search_unaccent(coalesce(brand, ''))),
      'B'
    ) ||
    setweight(
      to_tsvector('simple', public.catalog_search_unaccent(coalesce(ingredient_text, ''))),
      'D'
    )
  ) STORED;

CREATE INDEX idx_product_data_search_document
  ON public.product_data
  USING gin (search_document);

DO $$
BEGIN
  IF NOT (
    to_tsvector('simple', public.catalog_search_unaccent('Entrée Pâté'))
    @@ to_tsquery('simple', 'entree & pate')
  ) THEN
    RAISE EXCEPTION 'accent-insensitive verified search document regression';
  END IF;
END;
$$;
