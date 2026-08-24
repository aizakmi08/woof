-- Record the compact, independently deduplicated coverage result after the
-- Target Blue source-version wave. The 100 MB observation payload remains in
-- local census artifacts; this snapshot is the durable release-gate record.

INSERT INTO public.catalog_coverage_snapshots (
  snapshot_key,
  census_started_at,
  census_completed_at,
  source_panel,
  required_source_panel,
  completed_source_panel,
  denominator_formula_count,
  verified_formula_count,
  verified_formula_percent,
  popular_brand_count,
  complete_popular_brand_count,
  popular_formula_gap_count,
  ingredient_verified_percent,
  image_verified_percent,
  independent_denominator,
  passes_source_panel,
  passes_total_coverage,
  passes_popular_brands,
  passes_release_gate,
  details
) VALUES (
  'public-reviewed-major95-target-blue-source-versions-v115:20260726',
  '2026-07-27T00:08:00Z',
  '2026-07-27T00:11:12.312Z',
  ARRAY[
    'manufacturer-catalogs',
    'petsmart-retail-catalog',
    'chewy-public-sitemap',
    'target-public-sitemap',
    'walmart-public-sitemap'
  ],
  ARRAY[
    'manufacturer-catalogs',
    'petsmart-retail-catalog',
    'chewy-public-sitemap',
    'target-public-sitemap',
    'walmart-public-sitemap',
    'petco-retail-catalog',
    'amazon-retail-catalog'
  ],
  ARRAY[
    'manufacturer-catalogs',
    'petsmart-retail-catalog',
    'chewy-public-sitemap',
    'target-public-sitemap',
    'walmart-public-sitemap'
  ],
  9743,
  6775,
  69.54,
  86,
  38,
  2968,
  69.54,
  69.54,
  true,
  false,
  false,
  false,
  false,
  jsonb_build_object(
    'searchable_web_evidenced_count', 6775,
    'manufacturer_current_exact_count', 4941,
    'retailer_web_version_count', 1696,
    'web_label_version_count', 138,
    'unresolved_formula_count', 2968,
    'new_exact_source_versions', 6,
    'new_current_package_aliases', 7,
    'missing_source_panel', jsonb_build_array(
      'petco-retail-catalog',
      'amazon-retail-catalog'
    ),
    'census_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-variants-v115-20260726',
    'sprint_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-variants-v115-20260726-sprint',
    'second_census_seven_days_apart', false,
    'eric_physical_device_validation', false
  )
)
ON CONFLICT (snapshot_key) DO UPDATE
SET
  census_completed_at = excluded.census_completed_at,
  source_panel = excluded.source_panel,
  completed_source_panel = excluded.completed_source_panel,
  denominator_formula_count = excluded.denominator_formula_count,
  verified_formula_count = excluded.verified_formula_count,
  verified_formula_percent = excluded.verified_formula_percent,
  complete_popular_brand_count = excluded.complete_popular_brand_count,
  popular_formula_gap_count = excluded.popular_formula_gap_count,
  ingredient_verified_percent = excluded.ingredient_verified_percent,
  image_verified_percent = excluded.image_verified_percent,
  passes_source_panel = excluded.passes_source_panel,
  passes_total_coverage = excluded.passes_total_coverage,
  passes_popular_brands = excluded.passes_popular_brands,
  passes_release_gate = excluded.passes_release_gate,
  details = excluded.details;
