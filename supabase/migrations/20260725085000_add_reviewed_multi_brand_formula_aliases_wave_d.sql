WITH reviewed_alias (
  alias_formula_key,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    ('purina pro plan|purina pro plan|purina pro plan bright mind adult 7 chicken and rice formula dry dog food|dog|adult|dry||', 'https://www.chewy.com/purina-pro-plan-bright-mind-adult-7/dp/113974', 'https://www.purina.com/dogs/shop/pro-plan-bright-mind-senior-chicken-rice-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan complete essentials adult shredded blend beef and rice high protein formula with probiotics dry dog food|dog|adult|dry||', 'https://www.chewy.com/purina-pro-plan-adult-shredded-blend/dp/178264', 'https://www.purina.com/dogs/shop/pro-plan-complete-essentials-shredded-blend-beef-rice-probiotics-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge senior support plus adult 7 chicken and rice formula dry cat food|cat|senior|dry||', 'https://www.chewy.com/purina-pro-plan-advantedge-senior/dp/3529398', 'https://www.purina.com/cats/shop/pro-plan-advantedge-senior-support-chicken-rice-dry-cat-food'),
    ('purina pro plan|purina pro plan|purina pro plan sport performance all life stages high protein 30 20 beef and bison formula dry dog food|dog|all life stages|dry||', 'https://www.chewy.com/purina-pro-plan-sport-performance-all/dp/358045', 'https://www.purina.com/dogs/shop/pro-plan-sport-performance-30-20-beef-bison-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan specialized shredded blend beef and rice formula high protein small breed dry dog food|dog|unknown|dry||', 'https://www.chewy.com/purina-pro-plan-specialized-shredded/dp/298038', 'https://www.purina.com/dogs/shop/pro-plan-small-breed-beef-and-rice-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan sport active all life stages high protein 27 17 chicken and rice formula dry dog food|dog|all life stages|dry||', 'https://www.chewy.com/purina-pro-plan-sport-active-all-life/dp/289857', 'https://www.purina.com/dogs/shop/pro-plan-sport-active-27-17-high-protein-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge digestive support plus large breed salmon and oat meal formula adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/purina-pro-plan-advantedge-digestive/dp/3583895', 'https://www.purina.com/dogs/shop/pro-plan-advantedge-digestive-support-large-breed-salmon-oatmeal-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge digestive support plus small breed salmon and oat meal formula adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/purina-pro-plan-advantedge-digestive/dp/3583863', 'https://www.purina.com/dogs/shop/pro-plan-advantedge-digestive-support-small-breed-salmon-oatmeal-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan focus urinary tract health formula beef and chicken entree pate canned cat food|cat|unknown|wet||', 'https://www.chewy.com/purina-pro-plan-focus-urinary-tract/dp/244280', 'https://www.purina.com/cats/shop/pro-plan-urinary-tract-health-formula-beef-chicken-wet-cat-food'),
    ('purina pro plan|purina pro plan|purina pro plan prime plus adult 7 chicken and beef entree classic canned cat food|cat|adult|wet||', 'https://www.chewy.com/purina-pro-plan-prime-plus-adult-7/dp/138453', 'https://www.purina.com/cats/shop/pro-plan-prime-plus-senior-chicken-beef-wet-cat-food'),
    ('purina pro plan|purina pro plan|purina pro plan adult weight management formula dry dog food|dog|adult|dry||', 'https://www.chewy.com/purina-pro-plan-adult-weight/dp/52403', 'https://www.purina.com/dogs/shop/pro-plan-specialized-nutrition-weight-management-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan focus adult urinary tract health formula with salmon classic canned cat food|cat|adult|wet||', 'https://www.chewy.com/purina-pro-plan-focus-adult-urinary/dp/129813', 'https://www.purina.com/cats/shop/pro-plan-urinary-tract-health-formula-salmon-wet-cat-food'),
    ('purina pro plan|purina pro plan|purina pro plan focus adult classic urinary tract health formula ocean whitefish entree canned cat food|cat|adult|wet||', 'https://www.chewy.com/purina-pro-plan-focus-adult-classic/dp/3999094', 'https://www.purina.com/cats/shop/pro-plan-urinary-tract-health-formula-ocean-whitefish-wet-cat-food'),
    ('purina pro plan|purina pro plan|purina pro plan complete essentials adult shredded blend turkey and rice high protein formula with probiotics dry dog food|dog|adult|dry||', 'https://www.chewy.com/purina-pro-plan-complete-essentials/dp/918926', 'https://www.purina.com/dogs/shop/pro-plan-complete-essentials-shredded-blend-turkey-rice-probiotics-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan indoor grilled ocean whitefish and tuna entree wet cat food|cat|unknown|wet||', 'https://www.chewy.com/purina-pro-plan-indoor-grilled-ocean/dp/362549', 'https://www.purina.com/cats/shop/purina-pro-plan-indoor-ocean-whitefish-tuna-wet-cat-food'),
    ('purina pro plan|purina pro plan|purina pro plan complete essentials adult shredded blend salmon and rice high protein formula with probiotics dry dog food|dog|adult|dry||', 'https://www.chewy.com/purina-pro-plan-adult-shredded-blend/dp/114028', 'https://www.purina.com/dogs/shop/pro-plan-complete-essentials-shredded-blend-salmon-rice-probiotics-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan sensitive systems turkey and oat meal in gravy wet dog food|dog|unknown|wet||', 'https://www.chewy.com/purina-pro-plan-sensitive-systems/dp/2183238', 'https://www.purina.com/dogs/shop/pro-plan-sensitive-skin-stomach-turkey-gravy-wet-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan kitten flaked ocean whitefish and tuna entree canned cat food|cat|kitten|wet||', 'https://www.chewy.com/purina-pro-plan-kitten-flaked-ocean/dp/52858', 'https://www.purina.com/cats/shop/pro-plan-development-kitten-ocean-whitefish-tuna-flaked-wet-cat-food'),
    ('purina pro plan|purina pro plan|purina pro plan complete essentials adult shredded blend chicken and rice high protein formula with probiotics dry dog food|dog|adult|dry||', 'https://www.chewy.com/purina-pro-plan-high-protein-shredded/dp/1500678', 'https://www.purina.com/dogs/shop/pro-plan-complete-essentials-shredded-blend-chicken-rice-probiotics-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge senior support plus shredded blend chicken and rice formula dry dog food|dog|senior|dry||', 'https://www.chewy.com/purina-pro-plan-advantedge-senior/dp/3583759', 'https://www.purina.com/dogs/shop/pro-plan-advantedge-senior-support-shredded-blend-chicken-rice-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge senior support plus large breed shredded blend chicken and rice formula senior dry dog food|dog|senior|dry||', 'https://www.chewy.com/purina-pro-plan-advantedge-senior/dp/3583807', 'https://www.purina.com/dogs/shop/pro-plan-advantedge-senior-support-large-breed-shredded-blend-chicken-rice-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge senior support plus small breed shredded blend chicken and rice formula senior dry dog food|dog|senior|dry||', 'https://www.chewy.com/purina-pro-plan-advantedge-senior/dp/3583783', 'https://www.purina.com/dogs/shop/pro-plan-advantedge-senior-support-small-breed-shredded-blend-chicken-rice-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan bright mind dry dog food for adult dogs 7 high protein chicken rice|dog|adult|dry||', 'https://www.walmart.com/ip/Purina-Pro-Plan-Bright-Mind-Dry-Dog-Food-for-Adult-Dogs-7-High-Protein-Chicken-Rice-5-lb-Bag/111996879', 'https://www.purina.com/dogs/shop/pro-plan-bright-mind-senior-chicken-rice-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan development puppy dry dog food for large breeds 30 18 chicken rice|dog|puppy|dry||', 'https://www.walmart.com/ip/Purina-Pro-Plan-Development-Puppy-Dry-Dog-Food-for-Large-Breeds-30-18-Chicken-Rice-18-lb-Bag/569294334', 'https://www.purina.com/dogs/shop/pro-plan-large-breed-puppy-30-18-chicken-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan performance dry dog food high protein 30 20 salmon rice formula|dog|unknown|dry||', 'https://www.walmart.com/ip/Purina-Pro-Plan-Performance-Dry-Dog-Food-High-Protein-30-20-Salmon-Rice-Formula-6-lb-Bag/355349905', 'https://www.purina.com/dogs/shop/pro-plan-sport-performance-30-20-high-protein-salmon-rice-dry-dog-food'),
    ('purina pro plan|purina pro plan|purina pro plan urinary tract health pate wet cat food focus urinary tract health formula turkey giblets entree pull top|cat|unknown|wet||', 'https://www.walmart.com/ip/Purina-Pro-Plan-Urinary-Tract-Health-Pate-Wet-Cat-Food-FOCUS-Urinary-Tract-Health-Formula-Turkey-Giblets-Entree-3-oz-Pull-Top-Can/163072415', 'https://www.purina.com/cats/shop/pro-plan-urinary-tract-health-formula-turkey-giblets-wet-cat-food'),
    ('purina pro plan|purina pro plan|purina pro plan complete essentials lamb and vegetables entree in wet dog food gravy|dog|unknown|wet||', 'https://www.walmart.com/ip/Purina-Pro-Plan-Complete-Essentials-Lamb-and-Vegetables-Entree-in-Wet-Dog-Food-Gravy-13-oz-Cans-12-Pack/22070606', 'https://www.purina.com/dogs/shop/pro-plan-complete-essentials-lamb-vegetables-slices-gravy-wet-dog-food'),
    ('royal canin|royal canin|royal canin feline health nutrition aging 11 senior dry cat food|cat|senior|dry||', 'https://www.chewy.com/royal-canin-feline-health-nutrition/dp/3861638', 'https://www.royalcanin.com/us/cats/products/retail-products/aging-11+-2561'),
    ('royal canin|royal canin|royal canin maine coon adult thin slices in gravy wet cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-feline-breed-nutrition/dp/1589390', 'https://www.royalcanin.com/us/cats/products/retail-products/maine-coon-2031'),
    ('royal canin|royal canin|royal canin fresh health nutrition adult dog food pouch|dog|adult|wet||', 'https://www.chewy.com/royal-canin-fresh-health-nutrition/dp/1840726', 'https://www.royalcanin.com/us/dogs/products/retail-products/fresh-health-nutrition-adult-8100'),
    ('royal canin|royal canin|royal canin fresh health nutrition puppy dog food pouch|dog|puppy|wet||', 'https://www.chewy.com/royal-canin-fresh-health-nutrition/dp/1840686', 'https://www.royalcanin.com/us/dogs/products/retail-products/fresh-health-nutrition-puppy-8099'),
    ('royal canin|royal canin|royal canin fresh health nutrition senior dog food pouch|dog|senior|wet||', 'https://www.chewy.com/royal-canin-fresh-health-nutrition/dp/1840694', 'https://www.royalcanin.com/us/dogs/products/retail-products/fresh-health-nutrition-senior-8101'),
    ('royal canin|royal canin|royal canin aging 12 thin slices in gravy wet cat food|cat|senior|wet||', 'https://www.chewy.com/royal-canin-aging-12-thin-slices-in/dp/39455', 'https://www.royalcanin.com/us/cats/products/retail-products/aging-12+-thin-slices-in-gravy-4082/1'),
    ('nulo|nulo|nulo freestyle salmon and turkey recipe large breed puppy grain free dry dog food|dog|puppy|dry||', 'https://www.chewy.com/nulo-freestyle-salmon-turkey-recipe/dp/279389', 'https://nulo.com/products/freestyle-large-breed-puppy-salmon-turkey-recipe-for-dogs'),
    ('nulo|nulo|nulo frontrunner ancient grains beef barley and lamb recipe high protein adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/nulo-frontrunner-ancient-grain-beef/dp/234287', 'https://nulo.com/products/frontrunner-ancient-grains-beef-barley-lamb-recipe-for-dogs'),
    ('nulo|nulo|nulo freestyle large breed puppy grain free salmon turkey dry dog food 4|dog|puppy|dry||', 'https://www.walmart.com/ip/Nulo-Freestyle-Large-Breed-Puppy-Grain-Free-Salmon-Turkey-Dry-Dog-Food-4-5-lb/765729870', 'https://nulo.com/products/freestyle-large-breed-puppy-salmon-turkey-recipe-for-dogs'),
    ('nulo|nulo|nulo freestyle large breed puppy grain free salmon turkey dry dog food|dog|puppy|dry||', 'https://www.walmart.com/ip/Nulo-Freestyle-Large-Breed-Puppy-Grain-Free-Salmon-Turkey-Dry-Dog-Food-24-lb/442004827', 'https://nulo.com/products/freestyle-large-breed-puppy-salmon-turkey-recipe-for-dogs')
)
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
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
    'evidence', 'exact official manufacturer PDP identity, ingredients, front image, life stage, recipe, and form'
  )
FROM reviewed_alias
JOIN public.catalog_formulas AS formula
  ON lower(regexp_replace(formula.source_url, '/+$', '')) =
     lower(regexp_replace(reviewed_alias.official_source_url, '/+$', ''))
  AND formula.active
  AND formula.verification_status = 'verified'
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now();
