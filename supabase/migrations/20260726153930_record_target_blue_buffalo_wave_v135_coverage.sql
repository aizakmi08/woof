-- Record independent coverage after the reviewed Target Blue Buffalo wave.
INSERT INTO public.catalog_coverage_snapshots (
  snapshot_key, census_started_at, census_completed_at, source_panel,
  required_source_panel, completed_source_panel, denominator_formula_count,
  verified_formula_count, verified_formula_percent, popular_brand_count,
  complete_popular_brand_count, popular_formula_gap_count,
  ingredient_verified_percent, image_verified_percent,
  independent_denominator, passes_source_panel, passes_total_coverage,
  passes_popular_brands, passes_release_gate, details
) VALUES (
  'public-reviewed-major95-target-blue-buffalo-v135:20260726',
  '2026-07-27T02:16:18.909Z',
  '2026-07-27T02:38:55.597Z',
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
  9748, 6809, 69.85, 86, 38, 2939, 69.85, 69.85,
  true, false, false, false, false,
  jsonb_build_object(
    'searchable_web_evidenced_count', 6809,
    'manufacturer_current_exact_count', 4941,
    'retailer_web_version_count', 1730,
    'web_label_version_count', 138,
    'unresolved_formula_count', 2939,
    'promoted_exact_source_version_formula_count', 8,
    'promoted_exact_package_sku_count', 9,
    'net_searchable_formula_gain_since_v132', 6,
    'net_gap_reduction_since_v132', 8,
    'non_complete_visible_topper_exclusion_count', 2,
    'canonical_trial_size_sku_merge_count', 1,
    'fresh_refrigerated_food_form_repairs', 2,
    'blue_buffalo_formula_count', 896,
    'blue_buffalo_searchable_formula_count', 488,
    'blue_buffalo_formula_gap_count', 408,
    'major95_formula_count', 9167,
    'major95_searchable_formula_count', 6228,
    'major95_formula_gap_count', 2939,
    'major95_release_complete_brand_count', 17,
    'major95_inventory_continuity_failure_count', 0,
    'missing_source_panel', jsonb_build_array(
      'petco-retail-catalog', 'amazon-retail-catalog'
    ),
    'census_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-blue-v135-20260726',
    'sprint_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-blue-v135-20260726-sprint',
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
