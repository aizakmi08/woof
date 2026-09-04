WITH reviewed_alias (alias_formula_key, retailer_source_url, official_source_url) AS (
  VALUES
    ('royal canin|royal canin|royal canin veterinary diet glycoadvanced dry cat food|cat|unknown|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet/dp/3728166', 'https://www.royalcanin.com/us/cats/products/vet-products/glycoadvanced-tmmc-8070'),
    ('royal canin|royal canin|royal canin veterinary diet urinary so loaf pate adult wet cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/325618', 'https://www.royalcanin.com/us/cats/products/vet-products/urinary-so-1254'),
    ('royal canin|royal canin|royal canin veterinary diet adult selected protein potato and duck formula dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35125', 'https://www.royalcanin.com/us/dogs/products/vet-products/selected-protein-pd-1395'),
    ('royal canin|royal canin|royal canin veterinary diet multifunction urinary calm thin slices in gravy wet cat food|cat|unknown|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet/dp/2184838', 'https://www.royalcanin.com/us/cats/products/vet-products/urinary-so-+-calm-thin-slices-in-gravy-6551'),
    ('royal canin|royal canin|royal canin veterinary diet adult calm dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/101609', 'https://www.royalcanin.com/us/cats/products/vet-products/calm-3955'),
    ('royal canin|royal canin|royal canin veterinary diet mature consult large breed adult dry dog food|dog|senior|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/370272', 'https://www.royalcanin.com/us/dogs/products/vet-products/mature-consult-large-dog-3709'),
    ('royal canin|royal canin|royal canin veterinary diet adult mature consult loaf in sauce canned dog food|dog|senior|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/50168', 'https://www.royalcanin.com/us/dogs/products/vet-products/mature-consult-loaf-in-sauce-1316'),
    ('royal canin|royal canin|royal canin veterinary diet adult advanced mobility support canned dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/302420', 'https://www.royalcanin.com/us/dogs/products/vet-products/advanced-mobility-support-loaf-4220'),
    ('royal canin|royal canin|royal canin veterinary diet adult selected protein potato and whitefish formula dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/136522', 'https://www.royalcanin.com/us/dogs/products/vet-products/selected-protein-pw-1047'),
    ('royal canin|royal canin|royal canin veterinary diet adult renal support a dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/3859710', 'https://www.royalcanin.com/us/cats/products/vet-products/renal-support-a-3900'),
    ('royal canin|royal canin|royal canin veterinary diet selected protein potato and whitefish moderate calorie formula adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35377', 'https://www.royalcanin.com/us/dogs/products/vet-products/selected-protein-pw-moderate-calorie-1460'),
    ('royal canin|royal canin|royal canin veterinary diet adult gastrointestinal dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/33933', 'https://www.royalcanin.com/us/cats/products/vet-products/gastrointestinal-3905'),
    ('royal canin|royal canin|royal canin veterinary diet adult selected protein potato and white fish large breed formula dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/34027', 'https://www.royalcanin.com/us/dogs/products/vet-products/selected-protein-pw-large-dog-1461'),
    ('royal canin|royal canin|royal canin veterinary diet adult renal support s dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/118328', 'https://www.royalcanin.com/us/dogs/products/vet-products/renal-support-s-4162'),
    ('royal canin|royal canin|royal canin feline health nutrition aging 11 ultra soft mousse in sauce senior wet cat food|cat|senior|wet||', 'https://www.chewy.com/royal-canin-feline-health-nutrition/dp/3861654', 'https://www.royalcanin.com/us/cats/products/retail-products/aging-11+-ultra-soft-mousse-in-sauce-8074'),
    ('royal canin|royal canin|royal canin veterinary diet selected protein pea and rabbit formula adult dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35154', 'https://www.royalcanin.com/us/cats/products/vet-products/selected-protein-pr-1284'),
    ('royal canin|royal canin|royal canin veterinary diet adult mature consult medium breed dry dog food|dog|senior|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/101612', 'https://www.royalcanin.com/us/dogs/products/vet-products/mature-consult-dog-3706'),
    ('royal canin|royal canin|royal canin veterinary diet adult selected protein pea and duck formula dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35142', 'https://www.royalcanin.com/us/cats/products/vet-products/selected-protein-pd-1280'),
    ('royal canin|royal canin|royal canin veterinary diet adult renal support f dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/3859638', 'https://www.royalcanin.com/us/cats/products/vet-products/renal-support-f-3949'),
    ('royal canin|royal canin|royal canin instinctive 7 thin slices in gravy wet cat food|cat|unknown|wet||', 'https://www.chewy.com/royal-canin-instinctive-7-thin-slices/dp/950382', 'https://www.royalcanin.com/us/cats/products/retail-products/instinctive-7+-thin-slices-in-gravy-4083'),
    ('royal canin|royal canin|royal canin veterinary diet selected protein potato and rabbit formula adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35131', 'https://www.royalcanin.com/us/dogs/products/vet-products/selected-protein-pr-1396'),
    ('royal canin|royal canin|royal canin veterinary diet adult gastrointestinal dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35357', 'https://www.royalcanin.com/us/dogs/products/vet-products/gastrointestinal-3911'),
    ('royal canin|royal canin|royal canin veterinary diet adult urinary so loaf pate wet dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/1108254', 'https://www.royalcanin.com/us/dogs/products/vet-products/urinary-so-4021'),
    ('royal canin|royal canin|royal canin veterinary diet selected protein potato and duck formula loaf adult wet dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35128', 'https://www.royalcanin.com/us/dogs/products/vet-products/selected-protein-pd-1330'),
    ('royal canin|royal canin|royal canin veterinary diet selected protein pea and rabbit formula loaf in sauce adult wet cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/274382', 'https://www.royalcanin.com/us/cats/products/vet-products/selected-protein-pr-1336'),
    ('royal canin|royal canin|royal canin veterinary diet selected protein pea and duck formula adult wet cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/274381', 'https://www.royalcanin.com/us/cats/products/vet-products/selected-protein-pd-1334'),
    ('royal canin|royal canin|royal canin veterinary diet adult selected protein potato and rabbit formula wet dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35132', 'https://www.royalcanin.com/us/dogs/products/vet-products/selected-protein-pr-1332'),
    ('royal canin|royal canin|royal canin veterinary diet adult weight control medium breed dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/101610', 'https://www.royalcanin.com/us/dogs/products/vet-products/weight-control-3714')
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
    'evidence', 'exact official manufacturer PDP identity, ingredients, front image, species, life stage, veterinary condition, recipe, texture, and form'
  )
FROM reviewed_alias
JOIN public.catalog_formulas AS formula
  ON lower(regexp_replace(formula.source_url, '/+$', '')) =
     lower(regexp_replace(reviewed_alias.official_source_url, '/+$', ''))
  AND formula.active
  AND formula.verification_status = 'verified'
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now();
