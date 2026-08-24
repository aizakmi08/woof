-- Record independently measured coverage after the third reviewed Target
-- Purina ONE package wave.

INSERT INTO public.catalog_coverage_snapshots (
  snapshot_key, census_started_at, census_completed_at, source_panel,
  required_source_panel, completed_source_panel, denominator_formula_count,
  verified_formula_count, verified_formula_percent, popular_brand_count,
  complete_popular_brand_count, popular_formula_gap_count,
  ingredient_verified_percent, image_verified_percent,
  independent_denominator, passes_source_panel, passes_total_coverage,
  passes_popular_brands, passes_release_gate, details
) VALUES (
  'public-reviewed-major95-target-purina-one-v129:20260726',
  '2026-07-27T01:23:08.711Z',
  '2026-07-27T01:38:48.389Z',
  ARRAY[
    'manufacturer-catalogs', 'petsmart-retail-catalog',
    'chewy-public-sitemap', 'target-public-sitemap',
    'walmart-public-sitemap'
  ],
  ARRAY[
    'manufacturer-catalogs', 'petsmart-retail-catalog',
    'chewy-public-sitemap', 'target-public-sitemap',
    'walmart-public-sitemap', 'petco-retail-catalog',
    'amazon-retail-catalog'
  ],
  ARRAY[
    'manufacturer-catalogs', 'petsmart-retail-catalog',
    'chewy-public-sitemap', 'target-public-sitemap',
    'walmart-public-sitemap'
  ],
  9738, 6796, 69.79, 86, 38, 2942, 69.79, 69.79,
  true, false, false, false, false,
  jsonb_build_object(
    'searchable_web_evidenced_count', 6796,
    'manufacturer_current_exact_count', 4941,
    'retailer_web_version_count', 1717,
    'web_label_version_count', 138,
    'unresolved_formula_count', 2942,
    'new_exact_source_version_formulas', 13,
    'new_exact_source_package_observations', 14,
    'safe_exact_version_barcode_count', 4,
    'reused_gtin_safe_abstention_count', 10,
    'structurally_invalid_source_statement_count', 1,
    'purina_one_formula_count', 246,
    'purina_one_searchable_formula_count', 123,
    'purina_one_formula_gap_count', 123,
    'purina_one_searchable_gain_since_v124', 8,
    'net_searchable_formula_gain_since_v124', 8,
    'net_gap_reduction_since_v124', 2,
    'missing_source_panel', jsonb_build_array(
      'petco-retail-catalog', 'amazon-retail-catalog'
    ),
    'census_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-purina-one-v129-20260726',
    'sprint_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-purina-one-v129-20260726-sprint',
    'second_census_seven_days_apart', false,
    'eric_physical_device_validation', false
  )
)
ON CONFLICT (snapshot_key) DO UPDATE
SET
  census_completed_at = excluded.census_completed_at,
  denominator_formula_count = excluded.denominator_formula_count,
  verified_formula_count = excluded.verified_formula_count,
  verified_formula_percent = excluded.verified_formula_percent,
  popular_formula_gap_count = excluded.popular_formula_gap_count,
  ingredient_verified_percent = excluded.ingredient_verified_percent,
  image_verified_percent = excluded.image_verified_percent,
  passes_source_panel = excluded.passes_source_panel,
  passes_total_coverage = excluded.passes_total_coverage,
  passes_popular_brands = excluded.passes_popular_brands,
  passes_release_gate = excluded.passes_release_gate,
  details = excluded.details;
