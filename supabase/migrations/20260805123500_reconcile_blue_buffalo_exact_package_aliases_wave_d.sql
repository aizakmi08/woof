-- Reconcile nine visually reviewed Chewy package identities to exact current
-- Blue Buffalo manufacturer formulas. Retailer evidence is identity-only;
-- product_data, ingredients, images, formula versions, and scores stay intact.

CREATE TEMP TABLE blue_exact_package_wave_d_payload
ON COMMIT DROP
AS
SELECT raw.*,
       public.normalize_verified_product_search_query(raw.retailer_title)
         AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo wilderness turkey and chicken grill grain free puppy canned dog food|dog|puppy|wet||",
    "retailer_title": "Blue Buffalo Wilderness Turkey & Chicken Grill Grain-Free Puppy Canned Dog Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-wilderness-turkey/dp/103631",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "103631",
    "retailer_observed_at": "2026-08-05T02:25:21.999Z",
    "retailer_content_hash": "098cef44d80abf2996b35ef1beafba0dd0cc77b9bab2ea94353e95fac9e25aeb",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-turkey-chicken-grill-grain-free-puppy-canned-dog-food-12-5oz-case-of-12/img-575045._V1_.jpg",
    "retailer_front_image_sha256": "e1c41744cc058b867565838d06ea70ce515c3ab34af7d9d8cc2f9b721194c322",
    "retailer_front_visible_identity": "BLUE WILDERNESS HIGH-PROTEIN FOOD FOR DOGS TURKEY & CHICKEN GRILL Natural Food for Dogs NET WT. 12.5 oz (354 g)",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue wilderness wet puppy food - turkey chicken grill wilderness puppy-turkey-chicken-grill",
    "target_product_name": "BLUE Wilderness Wet Puppy Food - Turkey & Chicken Grill",
    "target_product_line": "BLUE Wilderness Wet",
    "target_flavor": "Turkey & Chicken Grill",
    "target_pet_type": "dog",
    "target_life_stage": "puppy",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-dog-food/wilderness/puppy-turkey-chicken-grill/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-puppy-turkey-chicken-grill-share.png",
    "official_review_image_sha256": "2ba03a59affd23e6cf692076892f4a7927af5b6a6e51ddedc37e15c00ceb1e5d",
    "target_ingredient_count": 34,
    "target_database_ingredient_hash": "cf6a3354754685970f65b9f25a946f6006c2d33c925749830335d37425a750b2",
    "target_raw_ingredient_hash": "48c8bdc2a57a720f6fee0a222eb3d1f5bbe7d0706d92f54cd9763d9684b0375a",
    "family": "wilderness",
    "condition_boundary": "grain free",
    "recipe": "turkey and chicken grill",
    "package_size": "12.5 oz"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls chicken and brown rice recipe kitten dry cat food|cat|kitten|dry||",
    "retailer_title": "Blue Buffalo Tastefuls Chicken & Brown Rice Recipe Kitten Dry Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-tastefuls-natural/dp/32029",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "32029",
    "retailer_observed_at": "2026-08-05T02:25:46.473Z",
    "retailer_content_hash": "9dcf257c429824913074d68eaf80d4fd435d5881af947d536d13138a42002bcd",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-tastefuls-chicken-brown-rice-recipe-kitten-dry-cat-food-7lb-bag/img-225208._V1_.jpg",
    "retailer_front_image_sha256": "0215123b18758ce7b4488fdb13fe981fa4bddad3a8b07f57ea43780f33d4d63b",
    "retailer_front_visible_identity": "BLUE BUFFALO Tastefuls Kitten Chicken & Brown Rice Recipe NATURAL FOOD FOR CATS 7 LBS.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue tastefuls kitten chicken brown rice recipe blue tastefuls-kitten-chicken-brown-rice",
    "target_product_name": "BLUE Tastefuls Kitten Chicken & Brown Rice Recipe",
    "target_product_line": "BLUE Tastefuls",
    "target_flavor": "Chicken & Brown Rice Recipe",
    "target_pet_type": "cat",
    "target_life_stage": "kitten",
    "target_food_form": "dry",
    "target_source_url": "https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-kitten-chicken-brown-rice/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/tastefuls/share-product-image/share_tastefuls_dry_kitten.png",
    "official_review_image_sha256": "464b1241d2ec31f82b043683874293cca4c427213dbee49d11a0826b27be4bb0",
    "target_ingredient_count": 68,
    "target_database_ingredient_hash": "622930d3bd211419d746f657ba1e69c3228f19739281b2680f2c11d0b559db67",
    "target_raw_ingredient_hash": "dd7b099de4f022bff4d16080c9c57279479900f4a241c91afe09e06988387537",
    "family": "tastefuls",
    "condition_boundary": "kitten",
    "recipe": "chicken and brown rice",
    "package_size": "7 lb"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls chicken and brown rice recipe adult indoor dry cat food|cat|adult|dry||",
    "retailer_title": "Blue Buffalo Tastefuls Chicken & Brown Rice Recipe Adult Indoor Dry Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-tastefuls-chicken-indoor/dp/32093",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "32093",
    "retailer_observed_at": "2026-08-05T02:25:41.802Z",
    "retailer_content_hash": "30eed0c22ad744b8639247dd0be0db538f842de884b6072a686371a9358d8721",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/moe/069cad99-49fe-7e0e-8000-3acf9fbb9882._V1_.jpg",
    "retailer_front_image_sha256": "d894e4faa0ad9ed89c807e626ec3e2baa1070b7ee2f1f00ad1dbcf13c3dd653b",
    "retailer_front_visible_identity": "BLUE BUFFALO Tastefuls Adult Indoor Cat Chicken & Brown Rice Recipe 15 LBS.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue tastefuls adult indoor cat chicken brown rice recipe blue tastefuls-indoor-chicken-brown-rice",
    "target_product_name": "BLUE Tastefuls Adult Indoor Cat Chicken & Brown Rice Recipe",
    "target_product_line": "BLUE Tastefuls Adult Indoor",
    "target_flavor": "Chicken & Brown Rice Recipe",
    "target_pet_type": "cat",
    "target_life_stage": "adult",
    "target_food_form": "dry",
    "target_source_url": "https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-chicken-brown-rice/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/tastefuls/share-product-image/share_tastefuls_dry_indoor.png",
    "official_review_image_sha256": "00de1098ff7de47c52d50765cbae3e2997e6bf6639ddd32f44601aa028ccbcd4",
    "target_ingredient_count": 65,
    "target_database_ingredient_hash": "faf1d6f40cf47685c03be74f9f9e5d4cd7ceccc1f0e64b9f4fbb5c43d9636cd4",
    "target_raw_ingredient_hash": "69866e255083e89690a415cce17fc2146fdeb0c730e3670f514bbaa85c8ca3d8",
    "family": "tastefuls",
    "condition_boundary": "indoor",
    "recipe": "chicken and brown rice",
    "package_size": "15 lb"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls chicken and brown rice recipe adult 7 dry cat food|cat|adult|dry||",
    "retailer_title": "Blue Buffalo Tastefuls Chicken & Brown Rice Recipe Adult 7+ Dry Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-tastefuls-natural/dp/1022134",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "1022134",
    "retailer_observed_at": "2026-08-05T02:25:46.039Z",
    "retailer_content_hash": "e82f2fef3aadf5adaeabacd13262f766a36cdb7ead164712c49bfb714efff8b0",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-tastefuls-chicken-brown-rice-recipe-adult-7-dry-cat-food-10lb-bag/img-533768._V1_.jpg",
    "retailer_front_image_sha256": "7612310c847edbbd51f9dccc2324397e87374a75d53e5c9d73c1f86180b4247d",
    "retailer_front_visible_identity": "BLUE BUFFALO Tastefuls Adult Cat 7+ Chicken & Brown Rice Recipe 10 LBS.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue tastefuls adult cat 7 chicken brown rice blue tastefuls-mature-chicken-brown-rice",
    "target_product_name": "BLUE Tastefuls Adult Cat 7+ Chicken & Brown Rice",
    "target_product_line": "BLUE Tastefuls Adult 7+",
    "target_flavor": "Chicken & Brown Rice",
    "target_pet_type": "cat",
    "target_life_stage": "senior",
    "target_food_form": "dry",
    "target_source_url": "https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-mature-chicken-brown-rice/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/tastefuls/share-product-image/share_tastefuls_dry_mature.png",
    "official_review_image_sha256": "5e20e6d7a79c46b6a201a361e6b98c25f5ca8ead56cc667796280a9f33fcced8",
    "target_ingredient_count": 67,
    "target_database_ingredient_hash": "aa45ad1f257b59e7a9c69cc7616c8f31edc47888a0ff37527b384a11ce966654",
    "target_raw_ingredient_hash": "37cde7dde0c7158e6f86ccdc6a324af3fe328b217f96a0c93671104f43c14080",
    "family": "tastefuls",
    "condition_boundary": "adult 7 plus",
    "recipe": "chicken and brown rice",
    "package_size": "10 lb"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo true solutions urinary care chicken flavored dry cat food|cat|unknown|dry||",
    "retailer_title": "Blue Buffalo True Solutions Urinary Care Chicken Flavored Dry Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-true-solutions-chicken/dp/3748758",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "3748758",
    "retailer_observed_at": "2026-08-05T02:25:38.183Z",
    "retailer_content_hash": "b43ec68ab65a3651d3d6b324199f568f2b1294478050abff0b4b10809e30d47a",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/moe/069499fa-6088-7e7c-8000-4cb5f9f818c8._V1_.jpg",
    "retailer_front_image_sha256": "e55b4a2868bfeef858a84ecaa9d52d737ebe8e240b75412e16a5abc7859d55ee",
    "retailer_front_visible_identity": "BLUE BUFFALO True Solutions URINARY CARE with Chicken 11 LBS.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue true solutions urinary care formula with chicken true-solutions urinary-care",
    "target_product_name": "BLUE True Solutions Urinary Care Formula with Chicken",
    "target_product_line": "BLUE True Solutions Urinary Care Formula with",
    "target_flavor": "Chicken",
    "target_pet_type": "cat",
    "target_life_stage": "unknown",
    "target_food_form": "dry",
    "target_source_url": "https://www.bluebuffalo.com/dry-cat-food/true-solutions/urinary-care/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/share-product-image/share_truesolutions_dry_cat_urine.png",
    "official_review_image_sha256": "c4f31ed60f7aa7858e56b903cf46345494a5dac7dcccdca2cabb82c7f49eb52b",
    "target_ingredient_count": 64,
    "target_database_ingredient_hash": "573d14a3afba29dc3fbd2ae114ec746e47fbf7e89e22f40543d5a722d956164d",
    "target_raw_ingredient_hash": "923d5048cac58fe0821b2002f55455190b970acec4bd817e0c3f43e639895cba",
    "family": "true solutions",
    "condition_boundary": "urinary care",
    "recipe": "chicken",
    "package_size": "11 lb"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo true solutions skin and coat care natural salmon adult dry cat food|cat|adult|dry||",
    "retailer_title": "Blue Buffalo True Solutions Skin & Coat Care Natural Salmon Adult Dry Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-true-solutions-perfect/dp/244852",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "244852",
    "retailer_observed_at": "2026-08-05T02:25:32.503Z",
    "retailer_content_hash": "cc333219e5d6d7f27e95c8970d78674a70250c43fe59e34d4c4f8bf4b075360f",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/moe/067ebfe6-be83-79db-8000-7950ff8d4665._V1_.jpg",
    "retailer_front_image_sha256": "2387a4923a564e254e73d0844b8e20ef96d85866d602f1a2ba4661617436afae",
    "retailer_front_visible_identity": "BLUE BUFFALO True Solutions SKIN & COAT CARE Salmon & Brown Rice Recipe 11 LBS.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue true solutions skin coat care salmon brown rice recipe for adult cats true-solutions skin-coat-care",
    "target_product_name": "BLUE True Solutions Skin & Coat Care Salmon & Brown Rice Recipe for Adult Cats",
    "target_product_line": "BLUE True Solutions Skin & Coat Care",
    "target_flavor": "Salmon & Brown Rice Recipe",
    "target_pet_type": "cat",
    "target_life_stage": "adult",
    "target_food_form": "dry",
    "target_source_url": "https://www.bluebuffalo.com/dry-cat-food/true-solutions/skin-coat-care/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/share-product-image/share_truesolutions_dry_cat_perfectcoat.png",
    "official_review_image_sha256": "88e4b8a95145a84a4bea6d580d1312ff9121b4813fcde6b4a0f33a6e3ea813c5",
    "target_ingredient_count": 70,
    "target_database_ingredient_hash": "1d59ecf494261212280d8b651cb60a0d7e5fb1a712316659719e21478d43ff4e",
    "target_raw_ingredient_hash": "7c2448391a9e3caf70f6ad191510ea78804a1e3f2b09548be33ff0487ea22aa1",
    "family": "true solutions",
    "condition_boundary": "skin and coat care",
    "recipe": "salmon and brown rice",
    "package_size": "11 lb"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo true solutions total support natural indoor cat formula adult dry cat food|cat|adult|dry||",
    "retailer_title": "Blue Buffalo True Solutions Total Support Natural Indoor Cat Formula Adult Dry Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-true-solutions-fab/dp/291004",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "291004",
    "retailer_observed_at": "2026-08-05T02:25:13.446Z",
    "retailer_content_hash": "d90a45d31f8a777d419906fd8fa9d42b037e9e500ca81d34a4301ed39a98a19d",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/moe/067ebfe3-f121-7da3-8000-eeb596e57ac7._V1_.jpg",
    "retailer_front_image_sha256": "e7ba3de76d47466636904adc760d9041e625f1085ed8a5609d15e19822d6551d",
    "retailer_front_visible_identity": "BLUE BUFFALO True Solutions TOTAL SUPPORT Chicken & Oatmeal Recipe 3.5 LBS.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue true solutions total support chicken oatmeal recipe for adult cats true-solutions indoor-cat",
    "target_product_name": "BLUE True Solutions Total Support Chicken & Oatmeal Recipe for Adult Cats",
    "target_product_line": "BLUE True Solutions Total Support",
    "target_flavor": "Chicken & Oatmeal Recipe",
    "target_pet_type": "cat",
    "target_life_stage": "adult",
    "target_food_form": "dry",
    "target_source_url": "https://www.bluebuffalo.com/dry-cat-food/true-solutions/indoor-cat/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/share-product-image/share_truesolutions_dry_cat_fabfeline.png",
    "official_review_image_sha256": "26691ee82efb31dc1948149a134dda4aa23e0c6fccee8301afa1f38e349fe9a1",
    "target_ingredient_count": 71,
    "target_database_ingredient_hash": "63b46282eb37122d989b3b4a9f4ddff6bf14c627ac51da88dac55de21648af2a",
    "target_raw_ingredient_hash": "9a886f5d2c3b3b0c5888f236723d1abc54978db96a102c9335d17d40a9286cfb",
    "family": "true solutions",
    "condition_boundary": "total support",
    "recipe": "chicken and oatmeal",
    "package_size": "3.5 lb"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo freedom senior grain free chicken and potatoes dry dog food|dog|senior|dry||",
    "retailer_title": "Blue Buffalo Freedom Senior Grain-Free Chicken & Potatoes Dry Dog Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-freedom-senior-chicken/dp/103612",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "103612",
    "retailer_observed_at": "2026-08-05T02:25:19.318Z",
    "retailer_content_hash": "a5d443eb9c3c1672886f8d12094b065358e0d59eab51ed5b6e4f8323ec236976",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-freedom-senior-grain-free-chicken-potatoes-dry-dog-food-4lb-bag/img-733790._V1_.jpg",
    "retailer_front_image_sha256": "e85a29109dc37d430a761105e10fb9b705df2815c8a159126d7f9b810c26eb51",
    "retailer_front_visible_identity": "BLUE BUFFALO Freedom Grain-Free Senior Recipe 7+ YEARS with Chicken and Potatoes 4 LBS.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue freedom senior dry dog food - grain-free chicken freedom senior-chicken-recipe",
    "target_product_name": "BLUE Freedom Senior Dry Dog Food - Grain-Free Chicken",
    "target_product_line": "BLUE Freedom Senior Dry - Grain-Free",
    "target_flavor": "Chicken",
    "target_pet_type": "dog",
    "target_life_stage": "senior",
    "target_food_form": "dry",
    "target_source_url": "https://www.bluebuffalo.com/dry-dog-food/freedom/senior-chicken-recipe/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/freedom/share-product-image/freedom-dog-senior-chicken-share.png",
    "official_review_image_sha256": "9fe42659056afdc6a4e8f9881dabdfebd1a8ddcb894c26d2b2549f4a6ba9fc36",
    "target_ingredient_count": 64,
    "target_database_ingredient_hash": "2c5f3beb2c1352aec0ec313a971fb29e9fe94ac97df1b742309adc83bf3d19a7",
    "target_raw_ingredient_hash": "79285e48a1302da6d1d74743e6bbf0b3cb14b16e617fd93ddd7ef286eeb59605",
    "family": "freedom",
    "condition_boundary": "grain free senior",
    "recipe": "chicken and potatoes",
    "package_size": "4 lb"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo freedom puppy grain free chicken and potatoes dry dog food|dog|puppy|dry||",
    "retailer_title": "Blue Buffalo Freedom Puppy Grain-Free Chicken & Potatoes Dry Dog Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-freedom-puppy-chicken/dp/49528",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "49528",
    "retailer_observed_at": "2026-08-05T02:25:41.272Z",
    "retailer_content_hash": "c115772bae756cdb66ce3ca18861f3734954857d7d65bafdba54838e6e42f36d",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-freedom-puppy-grain-free-chicken-potatoes-dry-dog-food-4lb-bag/img-531857._V1_.jpg",
    "retailer_front_image_sha256": "ed040445487eb64052abb8a26f858838341cc15350e0eb68c0aebed7904ca843",
    "retailer_front_visible_identity": "BLUE BUFFALO Freedom Grain-Free Puppy Recipe 2-12 MONTHS with Chicken and Potatoes 4 LBS.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue freedom dry puppy food grain-free chicken recipe freedom puppy-chicken-recipe",
    "target_product_name": "BLUE Freedom Dry Puppy Food Grain-Free Chicken Recipe",
    "target_product_line": "BLUE Freedom Dry Grain-Free",
    "target_flavor": "BLUE Freedom Grain-Free Chicken Recipe",
    "target_pet_type": "dog",
    "target_life_stage": "puppy",
    "target_food_form": "dry",
    "target_source_url": "https://www.bluebuffalo.com/dry-dog-food/freedom/puppy-chicken-recipe/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/freedom/share-product-image/freedom-dog-puppy-chicken-share.png",
    "official_review_image_sha256": "6c4efed6ac4aaeba94d77415ff8bf51aa41ba341b827ace454c05a26d6277c90",
    "target_ingredient_count": 61,
    "target_database_ingredient_hash": "6c30173ab065dc6a38aaf744d8399dbe29c8d64be58abe0198ef78f3427c0e86",
    "target_raw_ingredient_hash": "b69f82cb69df44e5d32cc2f27361d4b250af650793dad88fbb896c8280497504",
    "family": "freedom",
    "condition_boundary": "grain free puppy",
    "recipe": "chicken and potatoes",
    "package_size": "4 lb"
  }
]
$json$::JSONB) AS raw(
  alias_formula_key TEXT,
  retailer_title TEXT,
  retailer_source_url TEXT,
  retailer_source_slug TEXT,
  retailer_product_id TEXT,
  retailer_observed_at TIMESTAMPTZ,
  retailer_content_hash TEXT,
  retailer_front_image_url TEXT,
  retailer_front_image_sha256 TEXT,
  retailer_front_visible_identity TEXT,
  target_cache_key TEXT,
  target_product_name TEXT,
  target_product_line TEXT,
  target_flavor TEXT,
  target_pet_type TEXT,
  target_life_stage TEXT,
  target_food_form TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  official_review_image_sha256 TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  family TEXT,
  condition_boundary TEXT,
  recipe TEXT,
  package_size TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_d_payload) <> 9
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_exact_package_wave_d_payload) <> 9
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_exact_package_wave_d_payload) <> 9
     OR (SELECT count(DISTINCT retailer_product_id) FROM blue_exact_package_wave_d_payload) <> 9
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_exact_package_wave_d_payload) <> 9 THEN
    RAISE EXCEPTION 'Blue Buffalo package wave D payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_d_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'chewy-public-sitemap'
       OR payload.retailer_source_url NOT LIKE 'https://www.chewy.com/%'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_pet_type NOT IN ('dog', 'cat')
       OR payload.target_life_stage NOT IN ('puppy', 'kitten', 'adult', 'senior', 'unknown')
       OR payload.target_food_form NOT IN ('wet', 'dry')
       OR payload.target_ingredient_count < 30
       OR payload.retailer_observed_at IS NULL
       OR payload.retailer_content_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.official_review_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_visible_identity NOT ILIKE '%BLUE BUFFALO%'
       OR public.normalize_verified_product_search_query(
            payload.retailer_front_visible_identity
          ) NOT LIKE '%' || public.normalize_verified_product_search_query(
            payload.recipe
          ) || '%'
       OR payload.retailer_front_visible_identity NOT ILIKE '%' || payload.package_size || '%'
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave D evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_exact_package_wave_d_targets
ON COMMIT DROP
AS
SELECT payload.*,
       formula.id AS formula_id,
       formula.formula_key AS canonical_formula_key,
       formula.identity_hash AS canonical_identity_hash
FROM blue_exact_package_wave_d_payload payload
JOIN public.catalog_formulas formula
  ON formula.promoted_cache_key = payload.target_cache_key
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_evidence_tier = 'manufacturer_current_exact'
 AND formula.is_complete_food
 AND lower(btrim(formula.brand)) = 'blue buffalo'
 AND formula.product_name = payload.target_product_name
 AND formula.product_line = payload.target_product_line
 AND coalesce(formula.flavor, '') = payload.target_flavor
 AND formula.pet_type = payload.target_pet_type
 AND coalesce(nullif(lower(btrim(formula.life_stage)), ''), 'unknown') = payload.target_life_stage
 AND formula.food_form = payload.target_food_form
 AND formula.source_url = payload.target_source_url
 AND formula.front_image_url = payload.target_image_url
 AND formula.source_authority = 'manufacturer'
 AND formula.ingredient_verification_status = 'manufacturer'
 AND formula.image_verification_status = 'manufacturer'
 AND coalesce(
       nullif(formula.formula_version_provenance ->> 'ingredient_text_hash', ''),
       encode(digest(
         public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
         'sha256'
       ), 'hex')
     ) = payload.target_database_ingredient_hash
 AND encode(digest(
       btrim(regexp_replace(formula.ingredient_text, '\\s+', ' ', 'g')),
       'sha256'
     ), 'hex') = payload.target_raw_ingredient_hash;

DO $target_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_d_targets) <> 9 THEN
    RAISE EXCEPTION 'Blue Buffalo package wave D manufacturer targets did not resolve exactly';
  END IF;
END
$target_guard$;

INSERT INTO public.catalog_source_runs (
  run_key, source_slug, source_type, coverage_role, status, started_at,
  finished_at, expected_count, observed_count, accepted_count,
  rejected_count, pagination_complete, source_content_hash, checkpoint,
  metadata, updated_at
)
SELECT
  'chewy-public-sitemap:blue-exact-package-wave-d:20260805',
  'chewy-public-sitemap', 'retailer', 'verification', 'completed',
  min(retailer_observed_at), max(retailer_observed_at),
  count(*)::INTEGER, count(*)::INTEGER, count(*)::INTEGER, 0, TRUE,
  encode(digest(string_agg(retailer_content_hash, '|' ORDER BY retailer_product_id), 'sha256'), 'hex'),
  jsonb_build_object('last_product_id', max(retailer_product_id)),
  jsonb_build_object(
    'review_method', 'exact_retailer_front_package_to_current_manufacturer_package',
    'formula_version_conflict_checked', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'formula_evidence_tier', 'unverified',
    'package_size_is_sku_only', TRUE,
    'quarantined_package_version_candidates', 1,
    'ingredient_or_image_rewrite', FALSE
  ),
  now()
FROM blue_exact_package_wave_d_targets
ON CONFLICT (run_key) DO UPDATE
SET status = 'completed',
    started_at = EXCLUDED.started_at,
    finished_at = EXCLUDED.finished_at,
    expected_count = EXCLUDED.expected_count,
    observed_count = EXCLUDED.observed_count,
    accepted_count = EXCLUDED.accepted_count,
    rejected_count = 0,
    pagination_complete = TRUE,
    source_content_hash = EXCLUDED.source_content_hash,
    checkpoint = EXCLUDED.checkpoint,
    metadata = EXCLUDED.metadata,
    updated_at = now();

INSERT INTO public.catalog_observations (
  run_id, formula_id, source_slug, source_external_id, source_url,
  source_authority, gtin, manufacturer, brand, product_name, product_line,
  pet_type, life_stage, food_form, flavor, diet_condition, package_size,
  ingredient_text, front_image_url, is_complete_food, available_in_us,
  observed_at, content_hash, validation_status, validation_reasons,
  raw_payload, formula_evidence_tier, formula_version_provenance
)
SELECT
  source_run.id, target.formula_id, target.retailer_source_slug,
  target.retailer_product_id, target.retailer_source_url,
  'retailer_verified', NULL, 'general mills', 'blue buffalo',
  target.retailer_title, target.target_product_line,
  target.target_pet_type, target.target_life_stage, target.target_food_form,
  target.target_flavor, '', target.package_size, NULL,
  target.retailer_front_image_url, TRUE, TRUE,
  target.retailer_observed_at, target.retailer_content_hash,
  'accepted', ARRAY[]::TEXT[],
  jsonb_build_object(
    'retailer_product_id', target.retailer_product_id,
    'retailer_title', target.retailer_title,
    'front_image_sha256', target.retailer_front_image_sha256,
    'front_package_visual_label_text', target.retailer_front_visible_identity,
    'review_method', 'exact_retailer_front_package_to_current_manufacturer_package',
    'formula_version_conflict_checked', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'complete_food_status_from_official_target', TRUE,
    'official_source_url', target.target_source_url,
    'official_cache_key', target.target_cache_key,
    'official_review_image_sha256', target.official_review_image_sha256,
    'database_ingredient_text_hash', target.target_database_ingredient_hash,
    'raw_current_ingredient_hash', target.target_raw_ingredient_hash,
    'package_size_is_sku_only', TRUE,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  'unverified',
  jsonb_build_object(
    'version_status', 'identity_only',
    'captured_at', target.retailer_observed_at,
    'retailer_source_url', target.retailer_source_url,
    'retailer_product_id', target.retailer_product_id,
    'front_image_sha256', target.retailer_front_image_sha256,
    'manufacturer_current_equivalence', TRUE,
    'ingredient_evidence_from_retailer', FALSE
  )
FROM blue_exact_package_wave_d_targets target
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'chewy-public-sitemap:blue-exact-package-wave-d:20260805'
ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    manufacturer = EXCLUDED.manufacturer,
    brand = EXCLUDED.brand,
    product_name = EXCLUDED.product_name,
    product_line = EXCLUDED.product_line,
    pet_type = EXCLUDED.pet_type,
    life_stage = EXCLUDED.life_stage,
    food_form = EXCLUDED.food_form,
    flavor = EXCLUDED.flavor,
    package_size = EXCLUDED.package_size,
    ingredient_text = NULL,
    front_image_url = EXCLUDED.front_image_url,
    is_complete_food = TRUE,
    available_in_us = TRUE,
    observed_at = EXCLUDED.observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    raw_payload = EXCLUDED.raw_payload,
    formula_evidence_tier = 'unverified',
    formula_version_provenance = EXCLUDED.formula_version_provenance;

INSERT INTO public.catalog_skus (
  formula_id, gtin, package_size, package_count, source_slug,
  source_external_id, source_url, active, first_observed_at,
  last_observed_at, updated_at
)
SELECT
  target.formula_id, NULL, target.package_size, 1,
  target.retailer_source_slug, target.retailer_product_id,
  target.retailer_source_url, TRUE, target.retailer_observed_at,
  target.retailer_observed_at, now()
FROM blue_exact_package_wave_d_targets target
ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = now();

CREATE TEMP TABLE blue_exact_package_wave_d_resolved
ON COMMIT DROP
AS
SELECT target.*,
       observation.id AS observation_id
FROM blue_exact_package_wave_d_targets target
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'chewy-public-sitemap:blue-exact-package-wave-d:20260805'
JOIN public.catalog_observations observation
  ON observation.run_id = source_run.id
 AND observation.formula_id = target.formula_id
 AND observation.source_slug = target.retailer_source_slug
 AND observation.source_external_id = target.retailer_product_id
 AND observation.source_url = target.retailer_source_url
 AND observation.product_name = target.retailer_title
 AND observation.pet_type = target.target_pet_type
 AND observation.life_stage = target.target_life_stage
 AND observation.food_form = target.target_food_form
 AND observation.formula_evidence_tier IN ('unverified', 'conflicted')
 AND observation.front_image_url = target.retailer_front_image_url
 AND observation.content_hash = target.retailer_content_hash
 AND nullif(public.catalog_normalize_ingredient_evidence(observation.ingredient_text), '') IS NULL
 AND observation.formula_version_provenance ->> 'version_status' = 'identity_only';

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_d_resolved) <> 9 THEN
    RAISE EXCEPTION 'Blue Buffalo package wave D identities did not resolve exactly';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_exact_package_wave_d_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave D formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_exact_package_wave_d_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave D search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_d_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_data product
      WHERE product.cache_key = resolved.target_cache_key
        AND product.product_name = resolved.target_product_name
        AND product.product_line = resolved.target_product_line
        AND coalesce(product.flavor, '') = resolved.target_flavor
        AND product.pet_type = resolved.target_pet_type
        AND coalesce(nullif(lower(btrim(product.life_stage)), ''), 'unknown') = resolved.target_life_stage
        AND product.food_form = resolved.target_food_form
        AND product.source_url = resolved.target_source_url
        AND product.image_url = resolved.target_image_url
        AND product.ingredient_count = resolved.target_ingredient_count
        AND coalesce(
              nullif(product.formula_version_provenance ->> 'ingredient_text_hash', ''),
              encode(digest(
                public.catalog_normalize_ingredient_evidence(product.ingredient_text),
                'sha256'
              ), 'hex')
            ) = resolved.target_database_ingredient_hash
        AND encode(digest(
              btrim(regexp_replace(product.ingredient_text, '\\s+', ' ', 'g')),
              'sha256'
            ), 'hex') = resolved.target_raw_ingredient_hash
        AND product.formula_evidence_tier = 'manufacturer_current_exact'
        AND product.source_quality = 'manufacturer'
        AND product.ingredient_verification_status = 'manufacturer'
        AND product.image_verification_status = 'manufacturer'
        AND product.is_complete_food
        AND product.catalog_exclusion_reason IS NULL
        AND product.expires_at > now()
    )
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave D serving precondition changed';
  END IF;
END
$resolution_guard$;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, updated_at
)
SELECT resolved.alias_formula_key,
       resolved.formula_id,
       resolved.canonical_identity_hash,
       'manual_review',
       resolved.retailer_source_url,
       jsonb_build_object(
         'source', 'blue_buffalo_exact_package_wave_d_20260805',
         'review_method', 'exact_retailer_front_package_to_current_manufacturer_package',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'retailer_image_identity_only', TRUE,
         'retailer_source_slug', resolved.retailer_source_slug,
         'retailer_product_id', resolved.retailer_product_id,
         'retailer_title', resolved.retailer_title,
         'retailer_front_image_url', resolved.retailer_front_image_url,
         'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
         'retailer_front_visible_identity', resolved.retailer_front_visible_identity,
         'official_source_url', resolved.target_source_url,
         'official_review_image_url', resolved.target_image_url,
         'official_review_image_sha256', resolved.official_review_image_sha256,
         'official_cache_key', resolved.target_cache_key,
         'canonical_formula_key', resolved.canonical_formula_key,
         'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
         'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
         'target_pet_type', resolved.target_pet_type,
         'target_life_stage', resolved.target_life_stage,
         'target_food_form', resolved.target_food_form,
         'family', resolved.family,
         'condition_boundary', resolved.condition_boundary,
         'recipe', resolved.recipe,
         'package_size', resolved.package_size,
         'package_size_is_sku_only', TRUE,
         'source_version_equivalence_required', TRUE,
         'ingredient_or_image_rewrite', FALSE,
         'reviewed_at', now()
       ),
       now()
FROM blue_exact_package_wave_d_resolved resolved
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now()
WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key, alias_text, normalized_alias, source_url, source_authority,
  evidence_observed_at, provenance, active, updated_at
)
SELECT resolved.target_cache_key,
       resolved.retailer_title,
       resolved.normalized_alias,
       resolved.retailer_source_url,
       'retailer_identity',
       resolved.retailer_observed_at,
       jsonb_build_object(
         'source', 'blue_buffalo_exact_package_wave_d_20260805',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'retailer_source_slug', resolved.retailer_source_slug,
         'retailer_product_id', resolved.retailer_product_id,
         'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
         'retailer_front_visible_identity', resolved.retailer_front_visible_identity,
         'official_source_url', resolved.target_source_url,
         'formula_id', resolved.formula_id,
         'canonical_formula_key', resolved.canonical_formula_key,
         'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
         'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
         'target_pet_type', resolved.target_pet_type,
         'target_life_stage', resolved.target_life_stage,
         'target_food_form', resolved.target_food_form,
         'source_version_equivalence_required', TRUE,
         'ingredient_or_image_rewrite', FALSE
       ),
       TRUE,
       now()
FROM blue_exact_package_wave_d_resolved resolved
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = public.catalog_verified_product_search_aliases.provenance || EXCLUDED.provenance,
    updated_at = now()
WHERE public.catalog_verified_product_search_aliases.cache_key = EXCLUDED.cache_key;

INSERT INTO public.catalog_field_evidence (
  formula_id, observation_id, field_name, field_value, source_url,
  source_authority, accepted, observed_at, content_hash
)
SELECT resolved.formula_id,
       resolved.observation_id,
       'retailer_exact_front_package_identity_alias',
       jsonb_build_object(
         'source', 'blue_buffalo_exact_package_wave_d_20260805',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'retailer_title', resolved.retailer_title,
         'retailer_product_id', resolved.retailer_product_id,
         'retailer_front_image_url', resolved.retailer_front_image_url,
         'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
         'retailer_front_visible_identity', resolved.retailer_front_visible_identity,
         'official_source_url', resolved.target_source_url,
         'official_review_image_url', resolved.target_image_url,
         'official_review_image_sha256', resolved.official_review_image_sha256,
         'official_cache_key', resolved.target_cache_key,
         'canonical_formula_key', resolved.canonical_formula_key,
         'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
         'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
         'package_size_is_sku_only', TRUE,
         'ingredient_or_image_rewrite', FALSE
       ),
       resolved.retailer_source_url,
       'retailer_identity',
       TRUE,
       resolved.retailer_observed_at,
       encode(digest(
         resolved.formula_id::TEXT || '|blue_buffalo_exact_package_wave_d|'
         || resolved.alias_formula_key || '|' || resolved.retailer_source_url
         || '|' || resolved.target_database_ingredient_hash,
         'sha256'
       ), 'hex')
FROM blue_exact_package_wave_d_resolved resolved
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = EXCLUDED.accepted,
    observed_at = EXCLUDED.observed_at,
    updated_at = now();

DO $postcondition_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_d_resolved) <> 9
     OR EXISTS (
       SELECT 1 FROM blue_exact_package_wave_d_resolved resolved
       WHERE NOT EXISTS (
         SELECT 1 FROM public.catalog_formula_aliases alias
         WHERE alias.alias_formula_key = resolved.alias_formula_key
           AND alias.formula_id = resolved.formula_id
           AND alias.metadata ->> 'retailer_identity_only' = 'true'
           AND alias.metadata ->> 'retailer_ingredient_verification' = 'false'
           AND alias.metadata ->> 'ingredient_or_image_rewrite' = 'false'
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.catalog_verified_product_search_aliases alias
         WHERE alias.active
           AND alias.normalized_alias = resolved.normalized_alias
           AND alias.cache_key = resolved.target_cache_key
           AND alias.provenance ->> 'retailer_identity_only' = 'true'
           AND alias.provenance ->> 'retailer_ingredient_verification' = 'false'
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.catalog_field_evidence evidence
         WHERE evidence.formula_id = resolved.formula_id
           AND evidence.observation_id = resolved.observation_id
           AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
           AND evidence.source_url = resolved.retailer_source_url
           AND evidence.accepted
       )
     ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave D alias postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_d_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.search_verified_products(resolved.retailer_title, 5) result
      WHERE result.cache_key = resolved.target_cache_key
    )
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave D exact alias is not searchable';
  END IF;
END
$postcondition_guard$;
