-- Preserve recipe and package terms visible in Eric's original store photos
-- so strict matching can distinguish siblings without weakening hard gates.
UPDATE public.product_data
SET
  product_line = 'RawMix Wild Ocean Grain-Free Kibble',
  flavor = 'Salmon, Whitefish & Rockfish'
WHERE cache_key = 'open-farm:683547129320'
  AND (
    product_line IS DISTINCT FROM 'RawMix Wild Ocean Grain-Free Kibble'
    OR flavor IS DISTINCT FROM 'Salmon, Whitefish & Rockfish'
  );

UPDATE public.product_data
SET
  product_line = 'Purina Moist & Meaty Burger With Cheddar Cheese Soft',
  flavor = 'Burger with Cheddar Cheese, Beef',
  package_size = '72 oz (12 pouches)'
WHERE cache_key = 'nestle-purina-moist-meaty:038100330772'
  AND (
    product_line IS DISTINCT FROM 'Purina Moist & Meaty Burger With Cheddar Cheese Soft'
    OR flavor IS DISTINCT FROM 'Burger with Cheddar Cheese, Beef'
    OR package_size IS DISTINCT FROM '72 oz (12 pouches)'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'open-farm:683547129320'
      AND product_line = 'RawMix Wild Ocean Grain-Free Kibble'
      AND flavor = 'Salmon, Whitefish & Rockfish'
      AND lower(COALESCE(pet_type, '')) = 'dog'
      AND lower(COALESCE(food_form, '')) = 'dry'
  ) THEN
    RAISE EXCEPTION 'Open Farm RawMix Wild Ocean identity repair did not apply';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'nestle-purina-moist-meaty:038100330772'
      AND product_line = 'Purina Moist & Meaty Burger With Cheddar Cheese Soft'
      AND flavor = 'Burger with Cheddar Cheese, Beef'
      AND package_size = '72 oz (12 pouches)'
      AND lower(COALESCE(pet_type, '')) = 'dog'
      AND lower(COALESCE(food_form, '')) IN ('semi-moist', 'semi_moist')
  ) THEN
    RAISE EXCEPTION 'Moist & Meaty visible identity repair did not apply';
  END IF;
END
$$;
