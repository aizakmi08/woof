-- Reconcile eight visually reviewed Chewy package identities to exact current
-- Blue Buffalo manufacturer formulas. Retailer evidence is identity-only.
-- Ingredients, formula versions, and scores stay intact. One exact Baby BLUE
-- canonical/serving image is repaired from the manufacturer's incorrect OG image
-- to the product-local PDP front image.

CREATE TEMP TABLE blue_exact_package_wave_e_payload
ON COMMIT DROP
AS
SELECT raw.*,
       public.normalize_verified_product_search_query(raw.retailer_title)
         AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo basics skin and stomach care grain free lamb and potato small breed adult wet dog food|dog|adult|wet||",
    "retailer_title": "Blue Buffalo Basics Skin & Stomach Care Grain-Free Lamb & Potato Small Breed Adult Wet Dog Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-basics-skin-stomach-care/dp/115929",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "115929",
    "retailer_observed_at": "2026-08-05T02:25:30.393Z",
    "retailer_content_hash": "b93415a0866629f303f26f975888fc2f18f592590f1ada6da878a5670e1afd33",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-basics-skin-stomach-care-grain-free-lamb-potato-small-breed-adult-wet-dog-food-3-5oz-case-of-12/img-572265._V1_.jpg",
    "retailer_front_image_sha256": "15fc2325845e331a8984dc51c0613a1a537aac9d1435b2acd39038457020677c",
    "retailer_front_visible_identity": "BLUE basics skin & stomach care ADULT DOG lamb & potato recipe NET WT. 3.5 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue basics grain-free adult small breed lamb potato recipe basics grain-free-small-breed-lamb-potato-recipe",
    "target_product_name": "BLUE Basics Grain-Free Adult Small Breed Lamb & Potato Recipe",
    "target_product_line": "BLUE Basics Grain-Free Adult Small Breed",
    "target_flavor": "Lamb & Potato Recipe",
    "target_pet_type": "dog",
    "target_life_stage": "adult",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-dog-food/basics/grain-free-small-breed-lamb-potato-recipe/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/basics/share-product-image/dog_basics_smallbreed_lamb_wetcup_share.png",
    "official_review_image_sha256": "7ce5bb8e0028d346d644e0e0038f6f23486e3ce82c85d468b7db16c3085c02e5",
    "target_ingredient_count": 36,
    "target_database_ingredient_hash": "2f2f01aecb076bd8f18429e25d31317f2030b52025b073a8c24ac80f10fca7b3",
    "target_raw_ingredient_hash": "4d71f6017f94de5b392459c324b10760781a476705085bf9ab5262f34524186f",
    "family": "basics",
    "condition_boundary": "small breed grain free",
    "recipe": "lamb and potato",
    "package_size": "3.5 oz",
    "requires_serving_image_repair": false,
    "current_image_url": null,
    "current_image_sha256": null
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls savory singles chicken entree cuts in gravy adult cat food|cat|adult|wet||",
    "retailer_title": "Blue Buffalo Tastefuls Savory Singles Chicken Entrée Cuts in Gravy Adult Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-tastefuls-savory-singles/dp/380651",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "380651",
    "retailer_observed_at": "2026-08-05T02:25:11.307Z",
    "retailer_content_hash": "eaeec1c9e00bb37de5f3718591340153cb5d7a0617eea078db4f3d5781e9d195",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-tastefuls-savory-singles-chicken-entre-cuts-in-gravy-adult-cat-food-2-6oz-cup-case-of-24/img-423230._V1_.jpg",
    "retailer_front_image_sha256": "3818d6600c2e2027a5f09877dcbefc0aa2666f01d187b1a35ab3e844b7f7c2b3",
    "retailer_front_visible_identity": "BLUE Tastefuls Savory Singles Chicken Entree CUTS IN GRAVY NET WT. 1.3 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue tastefuls spoonless singles adult wet cat food - chicken cuts in gravy tastefuls chicken-cuts-in-gravy-savory-singles",
    "target_product_name": "BLUE Tastefuls Spoonless Singles Adult Wet Cat Food - Chicken Cuts in Gravy",
    "target_product_line": "BLUE Tastefuls Spoonless Singles Adult Wet",
    "target_flavor": "Chicken",
    "target_pet_type": "cat",
    "target_life_stage": "adult",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-cat-food/tastefuls/chicken-cuts-in-gravy-savory-singles/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_single_adult_chicken_cutsingravy_share.png",
    "official_review_image_sha256": "565447d04bb3284fe299926d940d67a1f476e262b728dd8947d739502ba3a695",
    "target_ingredient_count": 38,
    "target_database_ingredient_hash": "798f2428b9aa1b6617d1e4ca74a3b83310c5734f2ddeaa5f2a4d8f5022eb38a9",
    "target_raw_ingredient_hash": "33a53eec9e52a243c422a91661a40def5040d19f0bfef13d3bf6a89f7b26cd53",
    "family": "tastefuls",
    "condition_boundary": "cuts in gravy",
    "recipe": "chicken cuts in gravy",
    "package_size": "1.3 oz",
    "requires_serving_image_repair": false,
    "current_image_url": null,
    "current_image_sha256": null
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls spoonless singles beef entree pate adult cat food|cat|adult|wet||",
    "retailer_title": "Blue Buffalo Tastefuls Spoonless Singles Beef Entrée Pate Adult Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-tastefuls-spoonless/dp/380649",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "380649",
    "retailer_observed_at": "2026-08-05T02:25:15.123Z",
    "retailer_content_hash": "54e83824bb76ed642de5b074a441bcd2a36bccd2f5abb252506b254df106e726",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-tastefuls-spoonless-singles-beef-entre-pate-adult-cat-food-2-6oz-cup-case-of-24/img-529823._V1_.jpg",
    "retailer_front_image_sha256": "3e878d98dab747ffb1aa606db8949c0b3d5699c56468a3bd5aa929c6baf0d72a",
    "retailer_front_visible_identity": "BLUE Tastefuls Spoonless Singles Beef Entree SAVORY PATE NET WT. 1.3 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue tastefuls spoonless singles adult wet cat food - beef pat tastefuls beef-pate-spoonless-singles",
    "target_product_name": "BLUE Tastefuls Spoonless Singles Adult Wet Cat Food - Beef Paté",
    "target_product_line": "BLUE Tastefuls Spoonless Singles Adult Wet",
    "target_flavor": "Beef",
    "target_pet_type": "cat",
    "target_life_stage": "adult",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-cat-food/tastefuls/beef-pate-spoonless-singles/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_single_adult_beef_pate_share.png",
    "official_review_image_sha256": "41247b8ede5aa1296761905d0eed20521087a6a0265e8f86c6e9cf53c5fb0d63",
    "target_ingredient_count": 38,
    "target_database_ingredient_hash": "3a2bf43bc416d45ffc240d1ec0ddbd2d256f2eb1aa16fe93c19d4c1ce6d0e908",
    "target_raw_ingredient_hash": "88634e11ead568e55386a5b5f9f58834abecd33eaafb52090559935d93430fe1",
    "family": "tastefuls",
    "condition_boundary": "pate",
    "recipe": "beef pate",
    "package_size": "1.3 oz",
    "requires_serving_image_repair": false,
    "current_image_url": null,
    "current_image_sha256": null
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo freedom indoor mature chicken recipe grain free canned cat food|cat|senior|wet||",
    "retailer_title": "Blue Buffalo Freedom Indoor Mature Chicken Recipe Grain-Free Canned Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-freedom-indoor-mature/dp/111983",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "111983",
    "retailer_observed_at": "2026-08-05T02:25:41.477Z",
    "retailer_content_hash": "b9f2db98aadbb722973a4d6c411ee1f72c9dc3170d388f67e4497f61eba22a52",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-freedom-indoor-mature-chicken-recipe-grain-free-canned-cat-food-5-5oz-case-of-24/img-317572._V1_.jpg",
    "retailer_front_image_sha256": "8d7016ef5264936d67eb818d78dcdd1c2439a356b4e46d7d43bd50017d137383",
    "retailer_front_visible_identity": "BLUE Freedom GRAIN-FREE INDOOR MATURE CAT Chicken Recipe NET WT. 5.5 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue freedom wet senior cat food grain-free indoor - chicken freedom grain-free-indoor-mature-chicken",
    "target_product_name": "BLUE Freedom Wet Senior Cat Food Grain-Free (Indoor) - Chicken",
    "target_product_line": "BLUE Freedom Wet Senior Grain-Free (Indoor)",
    "target_flavor": "Chicken",
    "target_pet_type": "cat",
    "target_life_stage": "senior",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-cat-food/freedom/grain-free-indoor-mature-chicken/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/freedom/share-product-image/cat_freedom_indoor_mature_ckn_wet_share.png",
    "official_review_image_sha256": "359571c35ce1dc2ba8bcfd7631cde75569274e13ce97a99d2058ace96632cd0d",
    "target_ingredient_count": 34,
    "target_database_ingredient_hash": "f9dc85a58fbd8bfecaf6f8a4f8ca14e267bee86938ee5f222effb693aa5bda4b",
    "target_raw_ingredient_hash": "27703d586cb8b8008bc2f7b52b7d09cb40d666f6888e77d92d9d35480100515a",
    "family": "freedom",
    "condition_boundary": "indoor mature grain free",
    "recipe": "chicken",
    "package_size": "5.5 oz",
    "requires_serving_image_repair": false,
    "current_image_url": null,
    "current_image_sha256": null
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo basics skin and stomach care adult grain free duck and potato recipe wet dog food|dog|adult|wet||",
    "retailer_title": "Blue Buffalo Basics Skin & Stomach Care Adult Grain-Free Duck & Potato Recipe Wet Dog Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-basics-skin-stomach-care/dp/115910",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "115910",
    "retailer_observed_at": "2026-08-05T02:25:30.359Z",
    "retailer_content_hash": "84a44dfb18d4c68e98259a9adaebee0536fc53b5b767d99f99506dad3dc3a8f4",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-basics-skin-stomach-care-adult-grain-free-duck-potato-recipe-wet-dog-food-12-5oz-can-12-count/img-646714._V1_.jpg",
    "retailer_front_image_sha256": "ef63db1d33d106a7e155c18e60b988af4643b6501a2d9ab18eb13b302e58f90f",
    "retailer_front_visible_identity": "BLUE basics skin & stomach care ADULT DOG duck & potato recipe NET WT. 12.5 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue basics sup sup grain-free wet dog food - duck potato basics grain-free-adult-duck-potato-recipe",
    "target_product_name": "BLUE Basics Grain-Free Wet Dog Food - Duck & Potato",
    "target_product_line": "BLUE Basics Grain-Free Wet",
    "target_flavor": "Duck & Potato",
    "target_pet_type": "dog",
    "target_life_stage": "adult",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-dog-food/basics/grain-free-adult-duck-potato-recipe/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/basics/share-product-image/dog_basics_adult_gfduck_wet_share.png",
    "official_review_image_sha256": "6b0487fdcc18fd7209fc9dca0d5d01634ec6030642dcba4cf25484dec144fd00",
    "target_ingredient_count": 35,
    "target_database_ingredient_hash": "85517e80045e4213257eab57614d06981167323190772d0e108505401031ec57",
    "target_raw_ingredient_hash": "4d7a63b35247fce8b8c6b38fbc8cda025ce6d743168515bd305985562d065f75",
    "family": "basics",
    "condition_boundary": "adult grain free",
    "recipe": "duck and potato",
    "package_size": "12.5 oz",
    "requires_serving_image_repair": false,
    "current_image_url": null,
    "current_image_sha256": null
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo baby blue healthy growth formula grain free high protein salmon recipe kitten wet food|cat|kitten|wet||",
    "retailer_title": "Blue Buffalo Baby Blue Healthy Growth Formula Grain-Free High Protein Salmon Recipe Kitten Wet Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-baby-blue-healthy-growth/dp/502278",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "502278",
    "retailer_observed_at": "2026-08-05T02:25:11.426Z",
    "retailer_content_hash": "f2e560efc174adec65418bb625393b43f4ae5ae7f0fd8cc324c9d184163c67c2",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/moe/06827282-ef91-71ff-8000-f2854d07c2e8._V1_.jpg",
    "retailer_front_image_sha256": "a35483f68122c38b48203a0b91c8786b4d92bca0f050ac462e9c8494006f0992",
    "retailer_front_visible_identity": "BLUE baby BLUE HEALTHY GROWTH FORMULA FOR KITTENS SALMON RECIPE NET WT. 3 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo baby blue grain-free high-protein salmon wet kitten food baby-blue kitten-high-protein-salmon",
    "target_product_name": "Baby BLUE Grain-Free, High-Protein Salmon Wet Kitten Food",
    "target_product_line": "Baby BLUE Grain-Free",
    "target_flavor": "Salmon",
    "target_pet_type": "cat",
    "target_life_stage": "kitten",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-cat-food/baby-blue/kitten-high-protein-salmon/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/baby-blue/large-product-image/babyblue_cat_wet_hpsalmon.png",
    "official_review_image_sha256": "9e83040fa14a4963173b707cc2acb77731d2a13d88a3b5760e9d14e15040262a",
    "target_ingredient_count": 37,
    "target_database_ingredient_hash": "fa99218679b5147e976b5683cfbe5eda5478a6b7fb6db432dd48e0c4631970eb",
    "target_raw_ingredient_hash": "af80e510bd059743a2c668033d096e81541559b5dbc6c97fd3fa9aedb67518c5",
    "family": "baby blue",
    "condition_boundary": "kitten grain free high protein",
    "recipe": "salmon",
    "package_size": "3 oz",
    "requires_serving_image_repair": true,
    "current_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/wilderness/share-product-image/wild-cat-wet-kitten-salmon-share.png",
    "current_image_sha256": "b361d7296056ccafc2d1f0056818f9f5356b459a1fef347476a019b11defb79c"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo baby blue healthy growth formula grain free high protein chicken and pea recipe kitten dry food|cat|kitten|dry||",
    "retailer_title": "Blue Buffalo Baby Blue Healthy Growth Formula Grain-Free High Protein Chicken & Pea Recipe Kitten Dry Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-baby-blue-healthy-growth/dp/380388",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "380388",
    "retailer_observed_at": "2026-08-05T02:25:30.409Z",
    "retailer_content_hash": "0a56d18a2ad5319d81d09ad4ec33fa33ae541deaed61131624bedc09c2cf800a",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-baby-blue-healthy-growth-formula-grain-free-high-protein-chicken-pea-recipe-kitten-dry-food-4-5lb-bag/img-683713._V1_.jpg",
    "retailer_front_image_sha256": "2c2c3d5c05a378bf56c9a54eeb238071aa98a2a8d3e3a0dde6c622ac4763e048",
    "retailer_front_visible_identity": "BLUE baby BLUE HEALTHY GROWTH FORMULA KITTEN HIGH-PROTEIN GRAIN-FREE CHICKEN & PEA RECIPE 4.5 LBS.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo baby blue grain-free high protein chicken kitten food baby-blue kitten-high-protein-chicken-pea-recipe",
    "target_product_name": "Baby BLUE Grain-Free, High Protein Chicken Kitten Food",
    "target_product_line": "Baby BLUE Grain-Free",
    "target_flavor": "Chicken",
    "target_pet_type": "cat",
    "target_life_stage": "kitten",
    "target_food_form": "dry",
    "target_source_url": "https://www.bluebuffalo.com/dry-cat-food/baby-blue/kitten-high-protein-chicken-pea-recipe/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/baby-blue/share-product-image/baby-blue-kitten-dry-gf-chicken-share.png",
    "official_review_image_sha256": "8f1b6c74c10e5dd7432889515e2a24f02bf94e386c59320c5bfe0c4ebc0f0c85",
    "target_ingredient_count": 65,
    "target_database_ingredient_hash": "65e55edd69fe852b7d669a28f234b44f3d7c4994530ab1ec93667fee3fdf98dd",
    "target_raw_ingredient_hash": "e8f1c447a3358676475245235207b0c6f490229a3be6fb76c8ef9c9a60235864",
    "family": "baby blue",
    "condition_boundary": "kitten grain free high protein",
    "recipe": "chicken and pea",
    "package_size": "4.5 lb",
    "requires_serving_image_repair": false,
    "current_image_url": null,
    "current_image_sha256": null
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo wilderness rocky mountain recipe adult red meat feast chicken free grain free pate wet cat food|cat|adult|wet||",
    "retailer_title": "Blue Buffalo Wilderness Rocky Mountain Recipe Adult Red Meat Feast Chicken-Free Grain-Free Pate Wet Cat Food",
    "retailer_source_url": "https://www.chewy.com/blue-buffalo-wilderness-rocky/dp/112008",
    "retailer_source_slug": "chewy-public-sitemap",
    "retailer_product_id": "112008",
    "retailer_observed_at": "2026-08-05T02:25:18.643Z",
    "retailer_content_hash": "78d9d94f1c738d1152d7dc204aa91f86ebb579da12a469d6c2aef227268cee8c",
    "retailer_front_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-rocky-mountain-recipe-adult-red-meat-feast-chicken-free-grain-free-pate-wet-cat-food-5-5oz-can-24-count/img-466141._V1_.jpg",
    "retailer_front_image_sha256": "9997162c30932b8e8a0f76fba47d791005ea4853780ead7960a4beab97b9c6e2",
    "retailer_front_visible_identity": "BLUE WILDERNESS ROCKY MOUNTAIN RECIPE Red Meat Feast NET WT. 5.5 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue wilderness adult cat food - red meat rocky mountain recipe wilderness red-meat",
    "target_product_name": "BLUE Wilderness Adult Cat Food - Red Meat (Rocky Mountain Recipe)",
    "target_product_line": "BLUE Wilderness Adult - Red Meat (Rocky Mountain Recipe)",
    "target_flavor": "BLUE Wilderness - Red Meat (Rocky Mountain Recipe",
    "target_pet_type": "cat",
    "target_life_stage": "adult",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-cat-food/wilderness/red-meat/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/wilderness/share-product-image/cat_wild_rmr_red_meat_wet_share.png",
    "official_review_image_sha256": "cf227f52fa499aca7bb254ae415c24b81bb234db23125ba07f907a816e2f30a5",
    "target_ingredient_count": 33,
    "target_database_ingredient_hash": "2f83c3d0242b499f84f4d0978677ae939fb4b93843c57ffd00f97b8af598cd34",
    "target_raw_ingredient_hash": "b444aeb9a1eacf60efcae70cfd84fc5f577dc1957e7f2e9306d90c70036cf289",
    "family": "wilderness",
    "condition_boundary": "rocky mountain grain free pate",
    "recipe": "red meat feast",
    "package_size": "5.5 oz",
    "requires_serving_image_repair": false,
    "current_image_url": null,
    "current_image_sha256": null
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
  package_size TEXT,
  requires_serving_image_repair BOOLEAN,
  current_image_url TEXT,
  current_image_sha256 TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_e_payload) <> 8
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_exact_package_wave_e_payload) <> 8
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_exact_package_wave_e_payload) <> 8
     OR (SELECT count(DISTINCT retailer_product_id) FROM blue_exact_package_wave_e_payload) <> 8
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_exact_package_wave_e_payload) <> 8 THEN
    RAISE EXCEPTION 'Blue Buffalo package wave E payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_e_payload payload
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
       OR payload.requires_serving_image_repair IS NULL
       OR (payload.requires_serving_image_repair AND (
            payload.current_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
            OR payload.current_image_sha256 !~ '^[a-f0-9]{64}$'
            OR payload.current_image_url = payload.target_image_url
          ))
       OR (NOT payload.requires_serving_image_repair AND (
            payload.current_image_url IS NOT NULL
            OR payload.current_image_sha256 IS NOT NULL
          ))
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave E evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

DO $image_repair$
DECLARE
  formula_rows INTEGER;
  serving_rows INTEGER;
BEGIN
  UPDATE public.catalog_formulas formula
  SET front_image_url = payload.target_image_url,
      formula_version_provenance =
        coalesce(formula.formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
             'image_source_url', payload.target_source_url,
             'image_url', payload.target_image_url,
             'image_sha256', payload.official_review_image_sha256,
             'image_evidence_kind', 'manufacturer_product_local_pdp',
             'image_repaired_at', now()
           ),
      updated_at = now()
  FROM blue_exact_package_wave_e_payload payload
  WHERE payload.requires_serving_image_repair
    AND formula.promoted_cache_key = payload.target_cache_key
    AND formula.active
    AND formula.verification_status = 'verified'
    AND formula.formula_evidence_tier = 'manufacturer_current_exact'
    AND formula.source_url = payload.target_source_url
    AND formula.product_name = payload.target_product_name
    AND formula.product_line = payload.target_product_line
    AND coalesce(formula.flavor, '') = payload.target_flavor
    AND formula.pet_type = payload.target_pet_type
    AND coalesce(nullif(lower(btrim(formula.life_stage)), ''), 'unknown') =
        payload.target_life_stage
    AND formula.food_form = payload.target_food_form
    AND formula.front_image_url IN (payload.current_image_url, payload.target_image_url)
    AND formula.ingredient_verification_status = 'manufacturer'
    AND formula.image_verification_status = 'manufacturer'
    AND coalesce(
          nullif(formula.formula_version_provenance ->> 'ingredient_text_hash', ''),
          encode(digest(
            public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
            'sha256'
          ), 'hex')
        ) = payload.target_database_ingredient_hash;
  GET DIAGNOSTICS formula_rows = ROW_COUNT;

  UPDATE public.product_data product
  SET image_url = payload.target_image_url,
      image_verification_status = 'manufacturer',
      formula_version_provenance =
        coalesce(product.formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
             'image_source_url', payload.target_source_url,
             'image_url', payload.target_image_url,
             'image_sha256', payload.official_review_image_sha256,
             'image_evidence_kind', 'manufacturer_product_local_pdp',
             'image_repaired_at', now()
           ),
      updated_at = now()
  FROM blue_exact_package_wave_e_payload payload
  WHERE payload.requires_serving_image_repair
    AND product.cache_key = payload.target_cache_key
    AND product.product_name = payload.target_product_name
    AND product.product_line = payload.target_product_line
    AND coalesce(product.flavor, '') = payload.target_flavor
    AND product.pet_type = payload.target_pet_type
    AND coalesce(nullif(lower(btrim(product.life_stage)), ''), 'unknown') =
        payload.target_life_stage
    AND product.food_form = payload.target_food_form
    AND product.source_url = payload.target_source_url
    AND product.image_url IN (payload.current_image_url, payload.target_image_url)
    AND product.ingredient_count = payload.target_ingredient_count
    AND product.formula_evidence_tier = 'manufacturer_current_exact'
    AND product.source_quality = 'manufacturer'
    AND product.ingredient_verification_status = 'manufacturer'
    AND product.image_verification_status = 'manufacturer'
    AND product.is_complete_food
    AND product.catalog_exclusion_reason IS NULL
    AND coalesce(
          nullif(product.formula_version_provenance ->> 'ingredient_text_hash', ''),
          encode(digest(
            public.catalog_normalize_ingredient_evidence(product.ingredient_text),
            'sha256'
          ), 'hex')
        ) = payload.target_database_ingredient_hash
    AND encode(digest(
          btrim(regexp_replace(product.ingredient_text, '\s+', ' ', 'g')),
          'sha256'
        ), 'hex') = payload.target_raw_ingredient_hash;
  GET DIAGNOSTICS serving_rows = ROW_COUNT;

  IF formula_rows <> 1 OR serving_rows <> 1 THEN
    RAISE EXCEPTION
      'Baby BLUE product-local image repair did not affect exactly one canonical and one serving row';
  END IF;
END
$image_repair$;

CREATE TEMP TABLE blue_exact_package_wave_e_targets
ON COMMIT DROP
AS
SELECT payload.*,
       formula.id AS formula_id,
       formula.formula_key AS canonical_formula_key,
       formula.identity_hash AS canonical_identity_hash
FROM blue_exact_package_wave_e_payload payload
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
  IF (SELECT count(*) FROM blue_exact_package_wave_e_targets) <> 8 THEN
    RAISE EXCEPTION 'Blue Buffalo package wave E manufacturer targets did not resolve exactly';
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
    'quarantined_package_version_candidates', 2,
    'guarded_product_local_image_repairs', 1,
    'ingredient_or_image_rewrite', TRUE
  ),
  now()
FROM blue_exact_package_wave_e_targets
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
    'ingredient_or_image_rewrite', target.requires_serving_image_repair
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
FROM blue_exact_package_wave_e_targets target
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
FROM blue_exact_package_wave_e_targets target
ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = now();

CREATE TEMP TABLE blue_exact_package_wave_e_resolved
ON COMMIT DROP
AS
SELECT target.*,
       observation.id AS observation_id
FROM blue_exact_package_wave_e_targets target
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
  IF (SELECT count(*) FROM blue_exact_package_wave_e_resolved) <> 8 THEN
    RAISE EXCEPTION 'Blue Buffalo package wave E identities did not resolve exactly';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_exact_package_wave_e_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave E formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_exact_package_wave_e_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave E search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_e_resolved resolved
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
    RAISE EXCEPTION 'Blue Buffalo package wave E serving precondition changed';
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
         'source', 'blue_buffalo_exact_package_wave_e_20260805',
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
         'ingredient_or_image_rewrite', resolved.requires_serving_image_repair,
         'reviewed_at', now()
       ),
       now()
FROM blue_exact_package_wave_e_resolved resolved
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
         'source', 'blue_buffalo_exact_package_wave_e_20260805',
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
         'ingredient_or_image_rewrite', resolved.requires_serving_image_repair
       ),
       TRUE,
       now()
FROM blue_exact_package_wave_e_resolved resolved
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
         'source', 'blue_buffalo_exact_package_wave_e_20260805',
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
         'ingredient_or_image_rewrite', resolved.requires_serving_image_repair
       ),
       resolved.retailer_source_url,
       'retailer_identity',
       TRUE,
       resolved.retailer_observed_at,
       encode(digest(
         resolved.formula_id::TEXT || '|blue_buffalo_exact_package_wave_e|'
         || resolved.alias_formula_key || '|' || resolved.retailer_source_url
         || '|' || resolved.target_database_ingredient_hash,
         'sha256'
       ), 'hex')
FROM blue_exact_package_wave_e_resolved resolved
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = EXCLUDED.accepted,
    observed_at = EXCLUDED.observed_at,
    updated_at = now();

INSERT INTO public.catalog_field_evidence (
  formula_id, observation_id, field_name, field_value, source_url,
  source_authority, accepted, observed_at, content_hash
)
SELECT resolved.formula_id,
       NULL,
       'front_image_url',
       jsonb_build_object(
         'source', 'blue_buffalo_exact_package_wave_e_20260805',
         'repair_kind', 'manufacturer_product_local_pdp',
         'previous_image_url', resolved.current_image_url,
         'previous_image_sha256', resolved.current_image_sha256,
         'replacement_image_url', resolved.target_image_url,
         'replacement_image_sha256', resolved.official_review_image_sha256,
         'manufacturer_page_has_incorrect_og_image', TRUE,
         'ingredients_rewritten', FALSE,
         'score_rewritten', FALSE
       ),
       resolved.target_source_url,
       'manufacturer',
       TRUE,
       '2026-08-03T05:54:32.226Z'::TIMESTAMPTZ,
       encode(digest(
         resolved.formula_id::TEXT || '|blue_buffalo_exact_package_wave_e_image|'
         || resolved.current_image_url || '|' || resolved.target_image_url
         || '|' || resolved.official_review_image_sha256,
         'sha256'
       ), 'hex')
FROM blue_exact_package_wave_e_resolved resolved
WHERE resolved.requires_serving_image_repair
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = EXCLUDED.accepted,
    observed_at = EXCLUDED.observed_at,
    updated_at = now();

DO $postcondition_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_e_resolved) <> 8
     OR EXISTS (
       SELECT 1 FROM blue_exact_package_wave_e_resolved resolved
       WHERE NOT EXISTS (
         SELECT 1 FROM public.catalog_formula_aliases alias
         WHERE alias.alias_formula_key = resolved.alias_formula_key
           AND alias.formula_id = resolved.formula_id
           AND alias.metadata ->> 'retailer_identity_only' = 'true'
           AND alias.metadata ->> 'retailer_ingredient_verification' = 'false'
           AND alias.metadata ->> 'ingredient_or_image_rewrite' =
               CASE WHEN resolved.requires_serving_image_repair THEN 'true' ELSE 'false' END
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
    RAISE EXCEPTION 'Blue Buffalo package wave E alias postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_e_resolved resolved
    WHERE resolved.requires_serving_image_repair
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.product_data product
          WHERE product.cache_key = resolved.target_cache_key
            AND product.image_url = resolved.target_image_url
            AND product.formula_version_provenance ->> 'image_evidence_kind' =
                'manufacturer_product_local_pdp'
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.catalog_formulas formula
          WHERE formula.id = resolved.formula_id
            AND formula.front_image_url = resolved.target_image_url
            AND formula.formula_version_provenance ->> 'image_evidence_kind' =
                'manufacturer_product_local_pdp'
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.catalog_field_evidence evidence
          WHERE evidence.formula_id = resolved.formula_id
            AND evidence.field_name = 'front_image_url'
            AND evidence.source_url = resolved.target_source_url
            AND evidence.accepted
            AND evidence.field_value ->> 'repair_kind' =
                'manufacturer_product_local_pdp'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Baby BLUE product-local image repair postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_e_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.search_verified_products(resolved.retailer_title, 5) result
      WHERE result.cache_key = resolved.target_cache_key
    )
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave E exact alias is not searchable';
  END IF;
END
$postcondition_guard$;

