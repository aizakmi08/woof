-- 026: Clean scraped product display text.
--
-- Some imported product rows contain HTML entities such as "&amp;" and scraped
-- prefixes such as "Brand:". These values show directly in search/results and
-- weaken user trust even when the ingredient data is otherwise usable.

WITH cleaned AS (
  SELECT
    cache_key,
    NULLIF(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(
                        REPLACE(
                          REPLACE(
                            REPLACE(product_name, '&amp;', '&'),
                            '&quot;', '"'
                          ),
                          '&#39;', ''''
                        ),
                        '&#039;', ''''
                      ),
                      '&apos;', ''''
                    ),
                    '&ndash;', '-'
                  ),
                  '&mdash;', '-'
                ),
                '&reg;', ''
              ),
              '&trade;', ''
            ),
            '^\s*(brand|product)\s*:\s*',
            '',
            'i'
          ),
          '\s+',
          ' ',
          'g'
        )
      ),
      ''
    ) AS product_name_clean,
    NULLIF(
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(
                        REPLACE(
                          REPLACE(
                            REPLACE(COALESCE(brand, ''), '&amp;', '&'),
                            '&quot;', '"'
                          ),
                          '&#39;', ''''
                        ),
                        '&#039;', ''''
                      ),
                      '&apos;', ''''
                    ),
                    '&ndash;', '-'
                  ),
                  '&mdash;', '-'
                ),
                '&reg;', ''
              ),
              '&trade;', ''
            ),
            '^\s*brand\s*:\s*',
            '',
            'i'
          ),
          '\s+',
          ' ',
          'g'
        )
      ),
      ''
    ) AS brand_clean
  FROM public.product_data
)
UPDATE public.product_data pd
   SET product_name = COALESCE(c.product_name_clean, pd.product_name),
       brand = c.brand_clean
  FROM cleaned c
 WHERE pd.cache_key = c.cache_key
   AND (
     pd.product_name IS DISTINCT FROM COALESCE(c.product_name_clean, pd.product_name)
     OR pd.brand IS DISTINCT FROM c.brand_clean
   );
