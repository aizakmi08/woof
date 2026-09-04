-- Fix verified rows whose stored food_form conflicts with official source URL
-- and package-image evidence. These rows are complete foods with verified
-- ingredients/images; only the normalized dry/wet form was wrong.

WITH corrected AS (
  UPDATE public.product_data
  SET
    food_form = 'dry',
    verified_at = now(),
    updated_at = now()
  WHERE is_complete_food IS TRUE
    AND catalog_exclusion_reason IS NULL
    AND food_form = 'wet'
    AND (
      (source = 'natures-logic' AND source_url ~ '/(?:dog|cat)-products/[^/]*dry-kibble[^/]*/?$')
      OR (source = 'nestle-purina-friskies' AND source_url = 'https://www.purina.com/cats/shop/friskies-gravy-swirld-chicken-salmon-gravy-dry-cat-food')
      OR (source = 'blue-buffalo-general-mills' AND source_url IN (
        'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-adult-chicken-gravy/',
        'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-adult-salmon-gravy/'
      ))
    )
  RETURNING cache_key
),
blue_wm AS (
  UPDATE public.product_data
  SET
    product_name = 'BLUE Natural Veterinary Diet W+M Weight Management + Mobility Support Wet Dog Food',
    product_line = 'BLUE Natural Veterinary Diet W+M Weight Management + Mobility Support Wet',
    food_form = 'wet',
    verified_at = now(),
    updated_at = now()
  WHERE source = 'blue-buffalo-general-mills'
    AND source_url = 'https://www.bluebuffalo.com/wet-dog-food/natural-veterinary-diet/wm-wet-food-for-dogs/'
    AND (
      food_form IS DISTINCT FROM 'wet'
      OR product_name IS DISTINCT FROM 'BLUE Natural Veterinary Diet W+M Weight Management + Mobility Support Wet Dog Food'
      OR product_line IS DISTINCT FROM 'BLUE Natural Veterinary Diet W+M Weight Management + Mobility Support Wet'
    )
  RETURNING cache_key
)
SELECT
  (SELECT count(*) FROM corrected) AS corrected_dry_rows,
  (SELECT count(*) FROM blue_wm) AS corrected_blue_wm_rows;

DO $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT count(*)
  INTO conflict_count
  FROM public.product_data
  WHERE is_complete_food IS TRUE
    AND catalog_exclusion_reason IS NULL
    AND (
      (source = 'natures-logic' AND source_url ~ '/(?:dog|cat)-products/[^/]*dry-kibble[^/]*/?$' AND food_form = 'wet')
      OR (source = 'nestle-purina-friskies' AND source_url = 'https://www.purina.com/cats/shop/friskies-gravy-swirld-chicken-salmon-gravy-dry-cat-food' AND food_form = 'wet')
      OR (source = 'blue-buffalo-general-mills' AND source_url IN (
        'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-adult-chicken-gravy/',
        'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-adult-salmon-gravy/'
      ) AND food_form = 'wet')
      OR (source = 'blue-buffalo-general-mills'
        AND source_url = 'https://www.bluebuffalo.com/wet-dog-food/natural-veterinary-diet/wm-wet-food-for-dogs/'
        AND (food_form <> 'wet' OR product_name !~ 'W\\+M Weight Management'))
    );

  IF conflict_count <> 0 THEN
    RAISE EXCEPTION 'verified food-form source conflicts remain: %', conflict_count;
  END IF;
END $$;
