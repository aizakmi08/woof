-- Quarantine Purina ONE barcode claims that the manufacturer crawl assigned to
-- multiple distinct formulas. Keep the exact formula/ingredient/image evidence
-- searchable, but do not let an unproven GTIN resolve to either sibling.

DO $$
DECLARE
  repaired_serving_rows INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'nestle-purina-one:purina one purina one plus high protein ideal weight and healthy metabolism with chicken dry cat food formula 3 5 lb shop purina-one-ideal-weight-high-protein-chicken-dry-cat-food'
      AND gtin = '017800151337'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-chicken-dry-cat-food'
      AND brand = 'Purina ONE'
      AND pet_type = 'cat'
      AND food_form = 'dry'
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Expected exact Purina ONE Chicken Ideal Weight GTIN claim is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'nestle-purina-one:017800151337'
      AND gtin = '017800151337'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-turkey-dry-cat-food'
      AND brand = 'Purina ONE'
      AND pet_type = 'cat'
      AND food_form = 'dry'
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Expected exact Purina ONE Turkey Ideal Weight GTIN claim is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'nestle-purina-one:017800018852'
      AND gtin = '017800018852'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-senior-indoor-cat-food-dry-cat-food'
      AND brand = 'Purina ONE'
      AND pet_type = 'cat'
      AND life_stage = 'senior'
      AND food_form = 'dry'
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Expected exact Purina ONE Indoor Senior GTIN claim is missing';
  END IF;

  UPDATE public.product_data
  SET
    gtin = NULL,
    updated_at = now()
  WHERE (
      cache_key = 'nestle-purina-one:purina one purina one plus high protein ideal weight and healthy metabolism with chicken dry cat food formula 3 5 lb shop purina-one-ideal-weight-high-protein-chicken-dry-cat-food'
      AND gtin = '017800151337'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-chicken-dry-cat-food'
    )
    OR (
      cache_key = 'nestle-purina-one:017800151337'
      AND gtin = '017800151337'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-turkey-dry-cat-food'
    )
    OR (
      cache_key = 'nestle-purina-one:017800018852'
      AND gtin = '017800018852'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-senior-indoor-cat-food-dry-cat-food'
    );

  GET DIAGNOSTICS repaired_serving_rows = ROW_COUNT;
  IF repaired_serving_rows <> 3 THEN
    RAISE EXCEPTION 'Expected to quarantine 3 Purina ONE serving GTIN claims, updated %', repaired_serving_rows;
  END IF;

  UPDATE public.catalog_product_evidence
  SET
    gtin = NULL,
    evidence = COALESCE(evidence, '{}'::jsonb) || jsonb_build_object(
      'gtin_quarantined_at', now(),
      'gtin_quarantine_reason', 'duplicate_or_unproven_formula_gtin',
      'quarantined_gtin', gtin
    ),
    updated_at = now()
  WHERE (
      cache_key = 'nestle-purina-one:purina one purina one plus high protein ideal weight and healthy metabolism with chicken dry cat food formula 3 5 lb shop purina-one-ideal-weight-high-protein-chicken-dry-cat-food'
      AND gtin = '017800151337'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-chicken-dry-cat-food'
    )
    OR (
      cache_key IN (
        'nestle-purina-one:017800151337',
        'nestle-purina-one:purina one purina one ideal weight high protein dry cat food 3 5 lb shop purina-one-ideal-weight-high-protein-turkey-dry-cat-food'
      )
      AND gtin = '017800151337'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-turkey-dry-cat-food'
    )
    OR (
      cache_key IN (
        'nestle-purina-one:017800018852',
        'nestle-purina-one:purina one purina one plus indoor advantage senior 7 dry cat food 3 5 lb bag shop purina-one-senior-indoor-cat-food-dry-cat-food'
      )
      AND gtin = '017800018852'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-senior-indoor-cat-food-dry-cat-food'
    );

  UPDATE public.catalog_observations
  SET
    gtin = NULL,
    raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object(
      'gtin_quarantined_at', now(),
      'gtin_quarantine_reason', 'duplicate_or_unproven_formula_gtin',
      'quarantined_gtin', gtin
    )
  WHERE (
      gtin = '017800151337'
      AND source_url IN (
        'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-chicken-dry-cat-food',
        'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-turkey-dry-cat-food'
      )
    )
    OR (
      gtin = '017800018852'
      AND source_url = 'https://www.purina.com/cats/shop/purina-one-senior-indoor-cat-food-dry-cat-food'
    );

  UPDATE public.catalog_skus
  SET
    active = FALSE,
    updated_at = now()
  WHERE active IS TRUE
    AND (
      (
        gtin = '017800151337'
        AND source_url IN (
          'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-chicken-dry-cat-food',
          'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-turkey-dry-cat-food'
        )
      )
      OR (
        gtin = '017800018852'
        AND source_url = 'https://www.purina.com/cats/shop/purina-one-senior-indoor-cat-food-dry-cat-food'
      )
    );

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE catalog_exclusion_reason IS NULL
      AND (
        (
          gtin = '017800151337'
          AND source_url IN (
            'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-chicken-dry-cat-food',
            'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-turkey-dry-cat-food'
          )
        )
        OR (
          gtin = '017800018852'
          AND source_url = 'https://www.purina.com/cats/shop/purina-one-senior-indoor-cat-food-dry-cat-food'
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE active IS TRUE
      AND (
        (
          gtin = '017800151337'
          AND source_url IN (
            'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-chicken-dry-cat-food',
            'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-turkey-dry-cat-food'
          )
        )
        OR (
          gtin = '017800018852'
          AND source_url = 'https://www.purina.com/cats/shop/purina-one-senior-indoor-cat-food-dry-cat-food'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Purina ONE conflicting formula GTIN claims remain active';
  END IF;
END
$$;
