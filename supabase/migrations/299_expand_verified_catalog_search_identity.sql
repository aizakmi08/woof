-- The verified-search RPC protects recipe terms such as flavor and life
-- stage. Put those identity fields into the generated GIN document so an
-- exact front-label query does not disappear before its guard can evaluate it.
DROP INDEX IF EXISTS public.idx_product_data_search_document;

ALTER TABLE public.product_data
  DROP COLUMN IF EXISTS search_document;

ALTER TABLE public.product_data
  ADD COLUMN search_document tsvector
  GENERATED ALWAYS AS (
    setweight(
      to_tsvector(
        'simple',
        coalesce(product_name, '') || ' ' ||
        coalesce(product_line, '') || ' ' ||
        coalesce(flavor, '') || ' ' ||
        coalesce(life_stage, '') || ' ' ||
        coalesce(food_form, '') || ' ' ||
        coalesce(package_size, '') || ' ' ||
        coalesce(gtin, '')
      ),
      'A'
    ) ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(ingredient_text, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_product_data_search_document
  ON public.product_data
  USING gin (search_document);
