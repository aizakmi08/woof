-- Repair catalog identity fields that can make an otherwise correct label
-- resolve to the wrong life stage or food form.
--
-- Open Farm's importer previously inferred "senior" from broad page copy and
-- navigation rather than the product identity. Preserve explicit Senior
-- formulas and the two official all-life-stage corrections from migration 302;
-- safely return every other contaminated row to unknown.
UPDATE public.product_data
SET
  life_stage = NULL,
  updated_at = NOW()
WHERE lower(COALESCE(brand, '')) = 'open farm'
  AND lower(COALESCE(life_stage, '')) = 'senior'
  AND public.normalize_product_catalog_name(COALESCE(product_name, ''))
      !~ '(^| )(senior|mature)( |$)';

-- Moist & Meaty Burger with Cheddar is a semi-moist dog food. Retail source
-- spelling and dry/wet classifications must not become hard-gate conflicts.
UPDATE public.product_data
SET
  flavor = 'Burger with Cheddar Cheese',
  food_form = 'semi-moist',
  updated_at = NOW()
WHERE cache_key IN (
  'petsmart-retail-catalog:038100330222',
  'petsmart-retail-catalog:038100330482',
  'nestle-purina-moist-meaty:038100330772'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE lower(COALESCE(brand, '')) = 'open farm'
      AND lower(COALESCE(life_stage, '')) = 'senior'
      AND public.normalize_product_catalog_name(COALESCE(product_name, ''))
          !~ '(^| )(senior|mature)( |$)'
  ) THEN
    RAISE EXCEPTION 'Open Farm life-stage contamination remains';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key IN (
      'petsmart-retail-catalog:038100330222',
      'petsmart-retail-catalog:038100330482',
      'nestle-purina-moist-meaty:038100330772'
    )
      AND (
        lower(COALESCE(flavor, '')) <> 'burger with cheddar cheese'
        OR lower(COALESCE(food_form, '')) <> 'semi-moist'
      )
  ) THEN
    RAISE EXCEPTION 'Moist & Meaty identity repair did not apply';
  END IF;
END
$$;
