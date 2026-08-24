-- Record independent coverage after the exact package-version and canonical
-- size-family Blue Buffalo v143 promotion wave.
INSERT INTO public.catalog_coverage_snapshots (
  snapshot_key, census_started_at, census_completed_at, source_panel,
  required_source_panel, completed_source_panel, denominator_formula_count,
  verified_formula_count, verified_formula_percent, popular_brand_count,
  complete_popular_brand_count, popular_formula_gap_count,
  ingredient_verified_percent, image_verified_percent,
  independent_denominator, passes_source_panel, passes_total_coverage,
  passes_popular_brands, passes_release_gate, details
) VALUES (
  'public-reviewed-major95-target-blue-buffalo-v146:20260726',
  '2026-07-27T06:31:35Z',
  '2026-07-27T06:33:55.484Z',
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
  9748, 6824, 70.00, 86, 38, 2924, 70.00, 70.00,
  true, false, false, false, false,
  jsonb_build_object(
    'searchable_web_evidenced_count', 6824,
    'manufacturer_current_exact_count', 4941,
    'retailer_web_version_count', 1745,
    'web_label_version_count', 138,
    'unresolved_formula_count', 2924,
    'promoted_exact_source_version_formula_count', 6,
    'exact_equivalent_existing_package_count', 6,
    'reviewed_exact_package_sku_count', 15,
    'version_conflicting_gtin_abstention_count', 1,
    'runtime_exact_gtin_resolution_count', 14,
    'excluded_incomplete_or_transcription_defect_listing_count', 14,
    'reviewed_package_identity_override_count', 15,
    'evidence_backed_existing_identity_repair_count', 3,
    'net_searchable_formula_gain_since_v142', 4,
    'net_gap_reduction_since_v142', 4,
    'target_formula_count', 511,
    'target_searchable_formula_count', 219,
    'target_formula_gap_count', 292,
    'target_searchable_gain_since_v142', 2,
    'target_gap_reduction_since_v142', 3,
    'blue_buffalo_formula_count', 896,
    'blue_buffalo_searchable_formula_count', 503,
    'blue_buffalo_formula_gap_count', 393,
    'blue_buffalo_searchable_gain_since_v142', 4,
    'major95_formula_count', 9167,
    'major95_searchable_formula_count', 6243,
    'major95_formula_gap_count', 2924,
    'major95_release_complete_brand_count', 17,
    'major95_inventory_continuity_failure_count', 0,
    'missing_source_panel', jsonb_build_array(
      'petco-retail-catalog', 'amazon-retail-catalog'
    ),
    'census_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-blue-v146-20260726',
    'sprint_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-blue-v146-20260726-sprint',
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
