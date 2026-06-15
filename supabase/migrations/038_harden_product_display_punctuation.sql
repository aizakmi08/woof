-- Extend product_data display cleanup to catch scraped punctuation shells that
-- made it through the first HTML-entity/display contract. These artifacts show
-- directly in lookup/search results even when the ingredient payload is usable.

CREATE OR REPLACE FUNCTION public.clean_product_display_text(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        REGEXP_REPLACE(
                          REGEXP_REPLACE(
                            REGEXP_REPLACE(
                              REGEXP_REPLACE(
                                COALESCE(value, ''),
                                '&amp;', '&', 'gi'
                              ),
                              '&quot;', '"', 'gi'
                            ),
                            '&#39;|&#039;|&apos;', '''', 'gi'
                          ),
                          '&#x?[0-9a-f]+;', '', 'gi'
                        ),
                        '&ndash;|&mdash;', '-', 'gi'
                      ),
                      '&reg;|&trade;', '', 'gi'
                    ),
                    '<[^>]+>', '', 'gi'
                  ),
                  '^\s*(brand|product)\s*:\s*', '', 'i'
                ),
                '^\s*\|+\s*', '', 'g'
              ),
              '\s*\|+\s*$', '', 'g'
            ),
            '\s*\(\s*$', '', 'g'
          ),
          '\s*[,;:]\s*$', '', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

UPDATE public.product_data
SET
  product_name = COALESCE(public.clean_product_display_text(product_name), product_name),
  brand = public.clean_product_display_text(brand)
WHERE
  product_name IS DISTINCT FROM COALESCE(public.clean_product_display_text(product_name), product_name)
  OR brand IS DISTINCT FROM public.clean_product_display_text(brand);

ANALYZE public.product_data;
