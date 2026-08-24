-- Record independent coverage after the exact Target Blue Buffalo v147
-- package-version wave and the strict quarantine of two unresolved packages.
INSERT INTO public.catalog_coverage_snapshots (
  snapshot_key, census_started_at, census_completed_at, source_panel,
  required_source_panel, completed_source_panel, denominator_formula_count,
  verified_formula_count, verified_formula_percent, popular_brand_count,
  complete_popular_brand_count, popular_formula_gap_count,
  ingredient_verified_percent, image_verified_percent,
  independent_denominator, passes_source_panel, passes_total_coverage,
  passes_popular_brands, passes_release_gate, details
) VALUES (
  'public-reviewed-major95-target-blue-buffalo-v151:20260726',
  '2026-07-27T06:55:00Z',
  '2026-07-27T06:57:22.688Z',
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
  9745, 6829, 70.08, 86, 38, 2916, 70.08, 70.08,
  true, false, false, false, false,
  jsonb_build_object(
    'searchable_web_evidenced_count', 6829,
    'manufacturer_current_exact_count', 4941,
    'retailer_web_version_count', 1750,
    'web_label_version_count', 138,
    'unresolved_formula_count', 2916,
    'promoted_exact_source_version_formula_count', 6,
    'exact_equivalent_existing_package_count', 1,
    'reviewed_exact_package_sku_count', 7,
    'version_conflicting_gtin_abstention_count', 1,
    'runtime_exact_gtin_resolution_count', 6,
    'actionable_quarantine_count', 2,
    'ingredient_artifact_quarantine_count', 1,
    'life_stage_conflict_quarantine_count', 1,
    'excluded_incomplete_or_transcription_defect_listing_count', 8,
    'reviewed_package_identity_override_count', 9,
    'legacy_exact_serving_link_repair_count', 1,
    'net_searchable_formula_gain_since_v146', 5,
    'net_gap_reduction_since_v146', 8,
    'target_formula_count', 511,
    'target_searchable_formula_count', 224,
    'target_formula_gap_count', 287,
    'target_searchable_gain_since_v146', 5,
    'target_gap_reduction_since_v146', 5,
    'blue_buffalo_formula_count', 893,
    'blue_buffalo_searchable_formula_count', 508,
    'blue_buffalo_formula_gap_count', 385,
    'blue_buffalo_searchable_gain_since_v146', 5,
    'blue_buffalo_gap_reduction_since_v146', 8,
    'major95_formula_count', 9164,
    'major95_searchable_formula_count', 6248,
    'major95_formula_gap_count', 2916,
    'major95_release_complete_brand_count', 17,
    'major95_inventory_continuity_failure_count', 0,
    'missing_source_panel', jsonb_build_array(
      'petco-retail-catalog', 'amazon-retail-catalog'
    ),
    'census_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-blue-v151-20260726',
    'sprint_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-blue-v151-20260726-sprint',
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
