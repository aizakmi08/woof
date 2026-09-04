-- Target currently publishes a structurally incomplete ingredient statement
-- for this exact package, and its visible ingredient order differs from the
-- manufacturer-current serving row. Preserve both records but do not let the
-- reused package UPC select either formula until exact complete evidence
-- resolves the version.

UPDATE public.catalog_skus
SET
  active = false,
  updated_at = now()
WHERE gtin = '017800184304'
  AND active;

UPDATE public.product_data
SET
  formula_version_provenance =
    COALESCE(formula_version_provenance, '{}'::JSONB) ||
    jsonb_build_object(
      'barcode_resolution_policy',
        'abstain_incomplete_retailer_version_conflict',
      'conflicting_package_gtin', '017800184304',
      'conflicting_source_url',
        'https://www.target.com/p/-/A-80847603',
      'conflict_observed_at', '2026-07-27T01:23:08.711Z',
      'conflict_reason',
        'Target exact package statement has an unclosed vitamin bracket and '
        || 'a differing ingredient order.'
    ),
  updated_at = now()
WHERE cache_key = 'nestle-purina-one:017800184304';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('017800184304', 8)
  ) THEN
    RAISE EXCEPTION
      'Structurally conflicted Purina ONE package GTIN still resolves';
  END IF;
END
$$;
