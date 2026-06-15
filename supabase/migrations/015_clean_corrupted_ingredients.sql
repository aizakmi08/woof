-- 015: One-time cleanup of product_data rows where the scraper saved page chrome
-- (footer JSON, mailto links, URLs, etc.) instead of real ingredient text.
--
-- Going forward the scraper sanitizes before saving (see product-lookup EF), so
-- this only removes the historical bad data.

DELETE FROM public.product_data
WHERE
  ingredient_text ~ '\\"'                  -- escaped quote — JSON leakage
  OR ingredient_text ILIKE '%mailto:%'
  OR ingredient_text ILIKE '%legalLinks%'
  OR ingredient_text ILIKE '%reportAbuseLink%'
  OR ingredient_text ILIKE '%siteSettings%'
  OR ingredient_text ILIKE '%powered by%'
  OR ingredient_text ~ 'https?://'         -- URLs in ingredient text
  OR ingredient_text ~ '\{[^}]{3,}":'      -- {"key": pattern
  OR ingredient_text ~ '\}[\,\}]'          -- }} or },
  OR LENGTH(ingredient_text) > 5000;       -- real ingredient lists are <2500 chars

ANALYZE public.product_data;
