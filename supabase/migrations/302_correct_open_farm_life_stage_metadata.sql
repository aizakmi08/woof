-- Open Farm's official product pages identify these formulas as all-life-stage
-- foods. Incorrect "senior" metadata caused the conservative label resolver
-- to reject otherwise exact front-label matches.
UPDATE public.product_data
SET
  life_stage = 'all life stages',
  updated_at = NOW()
WHERE cache_key IN (
  'open-farm:683547120129',
  'open-farm:683547129801'
)
  AND lower(COALESCE(life_stage, '')) = 'senior';
