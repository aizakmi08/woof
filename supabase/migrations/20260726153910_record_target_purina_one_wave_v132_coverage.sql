-- Record independent coverage after the fourth reviewed Target Purina ONE
-- package wave. The denominator grew because the reviewed variants exposed
-- twelve previously unrepresented formula identities; seven are now
-- searchable exact web versions and five remain explicit evidence gaps.

INSERT INTO public.catalog_coverage_snapshots (
  snapshot_key, census_started_at, census_completed_at, source_panel,
  required_source_panel, completed_source_panel, denominator_formula_count,
  verified_formula_count, verified_formula_percent, popular_brand_count,
  complete_popular_brand_count, popular_formula_gap_count,
  ingredient_verified_percent, image_verified_percent,
  independent_denominator, passes_source_panel, passes_total_coverage,
  passes_popular_brands, passes_release_gate, details
) VALUES (
  'public-reviewed-major95-target-purina-one-v132:20260726',
  '2026-07-27T01:44:00Z',
  '2026-07-27T02:11:46.793Z',
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
  9750, 6803, 69.77, 86, 38, 2947, 69.77, 69.77,
  true, false, false, false, false,
  jsonb_build_object(
    'searchable_web_evidenced_count', 6803,
    'manufacturer_current_exact_count', 4941,
    'retailer_web_version_count', 1724,
    'web_label_version_count', 138,
    'unresolved_formula_count', 2947,
    'promoted_exact_source_version_formula_count', 14,
    'new_searchable_denominator_formula_count', 7,
    'newly_exposed_denominator_formula_count', 12,
    'net_unresolved_formula_change', 5,
    'exact_or_version_safe_barcode_count', 11,
    'reused_gtin_safe_abstention_count', 8,
    'formula_correct_size_mismatched_image_count', 5,
    'safe_size_variant_barcode_count', 4,
    'purina_one_formula_count', 258,
    'purina_one_searchable_formula_count', 130,
    'purina_one_formula_gap_count', 128,
    'major95_formula_count', 9169,
    'major95_searchable_formula_count', 6222,
    'major95_formula_gap_count', 2947,
    'major95_release_complete_brand_count', 17,
    'major95_inventory_continuity_failure_count', 0,
    'missing_source_panel', jsonb_build_array(
      'petco-retail-catalog', 'amazon-retail-catalog'
    ),
    'census_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-purina-one-v132-20260726',
    'sprint_artifact',
      'outputs/catalog-market-leaders/'
      || 'brand-coverage-sprint-current-major95-target-purina-one-v132-20260726-sprint',
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
