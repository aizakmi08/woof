WITH reviewed_alias (alias_formula_key, retailer_source_url, official_source_url, serving_cache_key) AS (
  VALUES
    ('purina one|purina one|purina one healthy weight plus ideal weight with chicken dry cat food high protein weight control formula|cat|unknown|dry||', 'https://www.walmart.com/ip/Purina-ONE-Healthy-Weight-Plus-Ideal-Weight-With-Chicken-Dry-Cat-Food-High-Protein-Weight-Control-Formula-7-lb-Bag/24190989', 'https://www.purina.com/cats/shop/purina-one-ideal-weight-high-protein-chicken-dry-cat-food', 'nestle-purina-one:purina one purina one plus high protein ideal weight and healthy metabolism with chicken dry cat food formula 3 5 lb shop purina-one-ideal-weight-high-protein-chicken-dry-cat-food'),
    ('pedigree|pedigree|pedigree chopped ground dinner chicken rice dinner adult soft wet dog food 13 single|dog|adult|wet||', 'https://www.walmart.com/ip/Pedigree-Chopped-Ground-Dinner-Chicken-Rice-Dinner-Adult-Soft-Wet-Dog-Food-13-2-Oz-Single-Can/17247631', 'https://www.pedigree.com/products/wet/chopped-ground-dinner-adult-wet-dog-food-can-chicken-and-rice-dinner', 'pedigree-mars-petcare:023100019079'),
    ('pedigree|pedigree|pedigree choice cuts in gravy with beef in filet mignon flavor wet dog food 3|dog|unknown|wet||', 'https://www.target.com/p/pedigree-choice-cuts-in-gravy-with-beef-in-filet-mignon-flavor-wet-dog-food-3-5oz/-/A-51658314', 'https://www.pedigree.com/products/wet/choice-cuts-gravy-adult-wet-dog-food-pouch-filet-mignon', 'pedigree-mars-petcare:023100119007')
)
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url, metadata
)
SELECT
  reviewed_alias.alias_formula_key,
  formula.id,
  encode(extensions.digest(reviewed_alias.alias_formula_key, 'sha256'), 'hex'),
  'manual_review',
  reviewed_alias.retailer_source_url,
  jsonb_build_object(
    'official_source_url', reviewed_alias.official_source_url,
    'reviewed_at', '2026-07-25',
    'evidence', 'exact current manufacturer identity, full validated ingredients, front image, species, food form and texture, product line, flavor, package form and published GTIN where available'
  )
FROM reviewed_alias
JOIN LATERAL (
  SELECT candidate.id
  FROM public.catalog_formulas AS candidate
  WHERE lower(regexp_replace(candidate.source_url, '/+$', '')) =
        lower(regexp_replace(reviewed_alias.official_source_url, '/+$', ''))
    AND candidate.active
    AND candidate.verification_status = 'verified'
  ORDER BY
    (candidate.promoted_cache_key = reviewed_alias.serving_cache_key) DESC,
    candidate.updated_at DESC,
    candidate.id DESC
  LIMIT 1
) AS formula ON TRUE
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now();
