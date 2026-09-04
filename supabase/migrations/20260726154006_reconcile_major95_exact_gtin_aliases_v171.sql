-- Reconcile independently observed major-brand packages to exact verified
-- formula versions only when a globally unique active GTIN already owns the
-- verified formula. This repairs census identity drift without merging formula
-- versions or treating package size as a formula.

WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  source_url,
  gtin,
  expected_formula_key,
  brand,
  pet_type,
  life_stage,
  food_form,
  observed_product_name
) AS (
  VALUES
    ('hill s science diet|hill s science diet|adult stomach and skin|dog|adult|dry|salmon and brown rice recipe|', '13c834bdb3ee19c5703c216cb03353eea9beb2fa6e7038a803718f957ba57de1', 'https://www.hillspet.com/dog-food/science-diet-canine-adult-sensitive-stomach-skin-salmon-dry', '052742088532', 'hill s pet nutrition|hill s science diet|adult stomach and skin|dog|adult|dry|salmon and brown rice recipe|', 'hill s science diet', 'dog', 'adult', 'dry', 'Adult Stomach & Skin Salmon & Brown Rice Recipe Dog Food'),
    ('blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food chicken and brown rice|dog|adult|dry|chicken and brown rice|', '253954bc87b2dc8ee140e0e4f62729d1e789122ade3acf1b84177cf90bc2e3d6', 'https://www.petsmart.com/dog/food/dry-food/blue-buffalo-life-protection-formulaandtrade-adult-dry-dog-food---chicken-and-brown-rice-41846.html', '859610000111', 'retailer-package-version:a80dbafcf02444c18ecdace87487a3535647878679d780d60e463c6748786f78', 'blue buffalo', 'dog', 'adult', 'dry', 'Blue Buffalo® Life Protection Formula™ Adult Dry Dog Food - Chicken & Brown Rice'),
    ('purina pro plan|purina pro plan|pro plan complete essentials adult chicken and rice entree classic wet dog food|dog|adult|wet||', '70d1946669dcce153e33839b8280c982edb1f33333fb5c9871054f3191b6c384', 'https://www.petsmart.com/dog/food/canned-food/purina-pro-plan-complete-essentials-adult-wet-dog-food---classic-pate-chicken-and-rice-13-oz-90186.html', '038100026743', 'purina pro plan|purina pro plan|pro plan complete essentials adult|dog|adult|wet|chicken and rice entree|', 'purina pro plan', 'dog', 'adult', 'wet', 'Pro Plan Complete Essentials Adult Chicken & Rice Entrée Classic Wet Dog Food'),
    ('purina pro plan|purina pro plan|pro plan complete essentials adult chicken and vegetables entree slices in gravy wet dog food|dog|adult|wet||', 'de9688da57a9ad03f14e957517194597ad3a00ad6a94dd512bf59e1c68d19c16', 'https://www.petsmart.com/dog/food/canned-food/purina-pro-plan-complete-essentials-adult-wet-dog-food-in-gravy-chicken-and-vegetables-13-oz-90190.html', '038100107978', 'purina pro plan|purina pro plan|pro plan complete essentials adult|dog|adult|wet|chicken and vegetables entree|', 'purina pro plan', 'dog', 'adult', 'wet', 'Purina® Pro Plan Complete Essentials Adult Wet Dog Food - In Gravy, Chicken & Vegetables, 13 Oz'),
    ('purina pro plan|purina pro plan|pro plan adult complete essentials grain free turkey and sweet potato entree classic wet dog food|dog|adult|wet||', '91a71b6386cdf36d02db97d9b43c26ddb45521866ae01b9ee459e189bc891288', 'https://www.petsmart.com/dog/food/canned-food/purina-pro-plan-complete-essentials-adult-wet-dog-food-grain-free-turkey-and-sweet-potato-13-oz-47255.html', '038100153388', 'purina pro plan|purina pro plan|pro plan adult complete essentials grain free|dog|adult|wet|turkey and sweet potato entree|', 'purina pro plan', 'dog', 'adult', 'wet', 'Purina® Pro Plan Complete Essentials Adult Wet Dog Food - Grain Free, Turkey & Sweet Potato, 13 oz'),
    ('purina pro plan|purina pro plan|pro plan complete essentials adult beef and rice entree classic wet dog food|dog|adult|wet||', 'ff2d56d9de933c4ac89d9baac80e6f5a40c8562de06969e5e92c759a4c0a9f20', 'https://www.petsmart.com/dog/food/canned-food/purina-pro-plan-complete-essentials-adult-wet-dog-food-classic-pate-beef-and-rice-13-oz-2945.html', '038100026736', 'purina pro plan|purina pro plan|pro plan complete essentials adult|dog|adult|wet|beef and rice entree|', 'purina pro plan', 'dog', 'adult', 'wet', 'Purina® Pro Plan Complete Essentials Adult Wet Dog Food - Classic Pate, Beef & Rice, 13 Oz'),
    ('purina pro plan|purina pro plan|pro plan complete essentials adult turkey and vegetables entree slices in gravy wet dog food|dog|adult|wet||', '9916ff0e33d915dd1c0cb8fccc3d261c99c34fb818b7baf2ee153a6471599914', 'https://www.petsmart.com/dog/food/canned-food/purina-pro-plan-complete-essentials-adult-wet-dog-food-turkey-and-vegetables-13-oz-90188.html', '038100026767', 'purina pro plan|purina pro plan|pro plan complete essentials adult|dog|adult|wet|turkey and vegetables entree|', 'purina pro plan', 'dog', 'adult', 'wet', 'Purina Pro Plan Complete Essentials Adult Wet Dog Food - Turkey & Vegetables, 13 oz'),
    ('blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food lamb and brown rice|dog|adult|dry|lamb and brown rice|', 'b31485c8807f9df503517d40496552aebbead1b9686034366eb5793d529e1528', 'https://www.petsmart.com/dog/food/dry-food/blue-buffalo-life-protection-formula-adult-dry-dog-food-lamb-and-brown-rice-46640.html', '859610000371', 'general mills|blue buffalo|life protection formula adult dry dog food lamb and brown rice|dog|adult|dry|lamb and brown rice|', 'blue buffalo', 'dog', 'adult', 'dry', 'Blue Buffalo Life Protection Formula Adult Dry Dog Food - Lamb & Brown Rice'),
    ('blue buffalo|blue buffalo|blue buffalo life protection formula small breed adult dry dog food chicken and brown rice|dog|adult|dry|chicken and brown rice|', '47169b136ced82b9bb03b86cb761a0eef1f616cf0e8d2711ce80a8cad87596cd', 'https://www.petsmart.com/dog/food/dry-food/blue-buffalo-life-protection-formula-and-trade-small-breed-adult-dry-dog-food-chicken-and-brown-rice-3314.html', '840243104888', 'retailer-package-version:e8d0a8f487ec7167bd28911caa6bc55938858e39895840bb65c53a494d24f7cf', 'blue buffalo', 'dog', 'adult', 'dry', 'Blue Buffalo® Life Protection Formula™ Small Breed Adult Dry Dog Food - Chicken & Brown Rice'),
    ('royal canin|royal canin|royal canin veterinary diet gastrointestinal small dog adult dog dry food low fat|dog|adult|dry|low fat 7 7 lb|', '5fdf2837b429ab2cb19820049f2ed92a66d89877e5e726c6861ee75851e5c66a', 'https://www.petsmart.com/dog/food/veterinary-diets/royal-canin-veterinary-diet-gastrointestinal-small-dog-adult-dog-dry-food-low-fat-7-7-lb-81531.html', '030111370815', 'royal canin mars petcare|royal canin|canine gastrointestinal low fat small dog|dog|adult mature senior|dry||', 'royal canin', 'dog', 'adult', 'dry', 'Royal Canin Veterinary Diet Gastrointestinal Small Dog Adult Dog Dry Food - Low Fat, 7.7 lb'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge senior dry dog food chicken and rice|dog|senior|dry|chicken and rice|', '6191c119466d428be7cfce0c99d892c6bd54af7ea1f986156e3d60fd17ed952d', 'https://www.petsmart.com/dog/food/dry-food/purina-pro-plan-advantedge-senior-dry-dog-food-chicken-and-rice-96296.html', '038100106797', 'purina pro plan|purina pro plan|pro plan advantedge adult 7 senior support shredded blend|dog|senior|dry|chicken and rice formula|', 'purina pro plan', 'dog', 'senior', 'dry', 'Purina Pro Plan AdvantEDGE Senior Dry Dog Food - Chicken & Rice'),
    ('purina one|purina one|purina one smartblend small bites dry dog food natural beef and rice|dog|adult|dry|beef and rice|', '2af91a9e983468a08a3a8cfd91d3f0c519efaafadd50fa653c9d6871f9c98182', 'https://www.petsmart.com/dog/food/dry-food/purina-one-smartblend-small-bites-dry-dog-food-natural-beef-and-rice-84290.html', '017800149297', 'retailer-package-version:bdea04ecd1ff02e34a75165333e485e002d1f466839c4a2c190e2d9ef432ebc4', 'purina one', 'dog', 'adult', 'dry', 'Purina ONE SmartBlend Small Bites Dry Dog Food - Natural, Beef & Rice'),
    ('purina pro plan|purina pro plan|pro plan adult 7 senior complete essentials beef and rice entree in gravy wet dog food|dog|senior|wet||', 'f6e0c2418dff38ad4d69ddd572c700f2ef2df550f4000c21f853a64cc6f6cacd', 'https://www.petsmart.com/dog/food/canned-food/purina-pro-plan-complete-essentials-senior-wet-dog-food-high-protein-13-oz-2900.html', '038100026859', 'purina pro plan|purina pro plan|pro plan adult 7 senior complete essentials|dog|senior|wet|beef and rice entree|', 'purina pro plan', 'dog', 'senior', 'wet', 'Purina Pro Plan Complete Essentials Senior Wet Dog Food - High Protein, 13 Oz'),
    ('blue buffalo|blue buffalo|blue buffalo homestyle recipe healthy weight adult wet dog food chicken dinner|dog|adult|wet|chicken and vegetable|', '34d36165b76b1c1569fc19472fc40081991d7b1e36ce2623f151bf8aa5c91e45', 'https://www.petsmart.com/dog/food/canned-food/blue-buffalo-homestyle-recipe-healthy-weight-adult-wet-dog-food-chicken-dinner-12-5-oz-24417.html', '840243100170', 'retailer-package-version:3322a9aa553413f4b3e5ea7b9d61b24c241a4e972c4313767d48696e0e8b22df', 'blue buffalo', 'dog', 'adult', 'wet', 'Blue Buffalo® Homestyle Recipe Healthy Weight Adult Wet Dog Food - Chicken Dinner, 12.5 oz'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge digestive support large breed adult dry dog food salmon and oatmeal|dog|adult|dry|salmon and oatmeal|', '26025844d0884865da26dbb3673cbdaec20a22f02ae4698e61adbc831188dbb8', 'https://www.petsmart.com/dog/food/dry-food/purina-pro-plan-advantedge-digestive-support-large-breed-adult-dry-dog-food-salmon-and-oatmeal-96294.html', '038100106889', 'purina pro plan|purina pro plan|pro plan advantedge large breed adult digestive support|dog|adult|dry|pro plan advantedge large breed digestive support salmon and oat meal formula|', 'purina pro plan', 'dog', 'adult', 'dry', 'Purina Pro Plan AdvantEDGE Digestive Support Large Breed Adult Dry Dog Food - Salmon & Oatmeal'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge large breed senior dry dog food chicken and rice|dog|senior|dry|chicken and rice|', '819d66558199f90d0b689fe1ae333da85873efca7be420347ad766c9c2e5d4e6', 'https://www.petsmart.com/dog/food/dry-food/purina-pro-plan-advantedge-large-breed-senior-dry-dog-food-chicken-and-rice-96297.html', '038100106759', 'purina pro plan|purina pro plan|pro plan advantedge large breed adult 7 senior support shredded blend|dog|senior|dry|chicken and rice formula|', 'purina pro plan', 'dog', 'senior', 'dry', 'Purina Pro Plan AdvantEDGE Large Breed Senior Dry Dog Food - Chicken & Rice'),
    ('blue buffalo|blue buffalo|blue buffalo life protection formula puppy dry dog food lamb and oatmeal|dog|puppy|dry|lamb and oatmeal|', '1ac14e78eeb575260de86791a56ea225ab46aaab3ba89ea1a12410ae3ddb9612', 'https://www.petsmart.com/dog/food/dry-food/blue-buffalo-life-protection-formula-and-trade-puppy-dry-dog-food-lamb-and-oatmeal-46536.html', '840243105526', 'retailer-package-version:e544b0be709b2266178a13d6ee9e40aa727206e272d6b73684ff22114fef16f0', 'blue buffalo', 'dog', 'puppy', 'dry', 'Blue Buffalo® Life Protection Formula™ Puppy Dry Dog Food - Lamb & Oatmeal'),
    ('purina pro plan|purina pro plan|purina pro plan advantedge small breed senior dry dog food chicken and rice|dog|senior|dry|chicken and rice|', 'd17d3a914de79aca3650c38bc9b4827a94704d1aea1c34b387c6753111f34535', 'https://www.petsmart.com/dog/food/dry-food/purina-pro-plan-advantedge-small-breed-senior-dry-dog-food-chicken-and-rice-96298.html', '038100106735', 'purina pro plan|purina pro plan|pro plan advantedge small breed adult 7 senior support shredded blend|dog|senior|dry|chicken and rice formula|', 'purina pro plan', 'dog', 'senior', 'dry', 'Purina Pro Plan AdvantEDGE Small Breed Senior Dry Dog Food - Chicken & Rice'),
    ('royal canin|royal canin|west highland white terrier adult dry dog food|dog|adult|dry||', 'b3872a6218d87cd63e04a1636cb87856b1bea085a549ae41881d91b97b5da455', 'https://www.petsmart.com/dog/food/dry-food/royal-canin-breed-health-nutrition-west-highland-white-terrier-adult-dry-dog-food-97308.html', '030111513601', 'royal canin mars petcare|royal canin|west highland white terrier adult dry dog food|dog|adult mature|dry||', 'royal canin', 'dog', 'adult', 'dry', 'West Highland White Terrier Adult Dry Dog Food'),
    ('pedigree|pedigree|weight management chopped ground dinner adult wet dog food chicken and rice dinner|dog|adult|wet|chicken and rice dinner|', 'f5aa22f022156b0d333b290f0e6e0e9728d7ee4269b399e73470ab4ddb863935', 'https://www.petsmart.com/dog/food/canned-food/pedigree-chopped-ground-dinner-weight-management-adult-wet-dog-food-chicken-and-rice-13-2-oz-can-82220.html', '023100230450', 'mars petcare|pedigree|weight management chopped ground dinner adult wet dog food chicken and rice dinner|dog|adult senior|wet|chicken and rice dinner|', 'pedigree', 'dog', 'adult', 'wet', 'Pedigree Chopped Ground Dinner Weight Management Adult Wet Dog Food, Chicken & Rice, 13.2 oz. Can'),
    ('purina pro plan|purina pro plan|pro plan adult large breed chicken and rice entree in gravy wet dog food|dog|adult|wet||', 'cbc664e207da9b3e96dd1de9912bbecd0e3e0b7e1eb8a5258d6cd092b76b26e4', 'https://www.petsmart.com/dog/food/canned-food/purina-pro-plan-specialized-large-breed-adult-wet-dog-food-chicken-and-rice-13-oz-90191.html', '038100026781', 'purina pro plan|purina pro plan|pro plan adult large breed|dog|adult|wet|chicken and rice entree|', 'purina pro plan', 'dog', 'adult', 'wet', 'Purina Pro Plan Specialized Large Breed Adult Wet Dog Food - Chicken & Rice, 13 oz'),
    ('purina pro plan|purina pro plan|pro plan adult large breed beef and rice entree in gravy wet dog food|dog|adult|wet||', 'cd13165acbd17e86a38f89b088253ffeda43ee58f4387f4700756266961a793b', 'https://www.petsmart.com/dog/food/canned-food/purina-pro-plan-specialized-large-breed-adult-wet-dog-food-beef-and-rice-13-oz-2904.html', '038100026774', 'purina pro plan|purina pro plan|pro plan adult large breed|dog|adult|wet|beef and rice entree|', 'purina pro plan', 'dog', 'adult', 'wet', 'Purina Pro Plan Specialized Large Breed Adult Wet Dog Food - Beef & Rice, 13 oz'),
    ('hill s prescription diet|hill s prescription diet|hill s prescription diet urinary care c d multicare stress dry cat food chicken|cat|adult|dry|chicken|', '9b6faae278902784e1cf88d74d1b392471526ac5e74ac585e2c10335f905cc57', 'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/hill-s-prescription-diet-urinary-care-c-d-multicare-stress-dry-cat-food-chicken-55807.html', '052742022161', 'hill s prescription diet|hill s prescription diet|hill s prescription diet urinary care c d multicare stress dry cat food chicken|cat|adult|dry|chicken|', 'hill s prescription diet', 'cat', 'adult', 'dry', 'Hill''s® Prescription Diet® Urinary Care c/d Multicare Stress Dry Cat Food - Chicken'),
    ('cat chow|cat chow|purina cat chow complete dry cat food high protein salmon formula|cat|adult|dry||', '01982af4c600db6b84a06f49062ec2b94b5604f204bad2b2329d1e240f308170', 'https://www.petsmart.com/cat/food-and-treats/dry-food/purina-cat-chow-complete-dry-cat-food-high-protein-salmon-formula-3-15lb-75321.html', '017800194808', 'cat chow|cat chow|purina cat chow complete dry cat food high protein salmon formula|cat|adult|dry||', 'cat chow', 'cat', 'adult', 'dry', 'Purina Cat Chow Complete Dry Cat Food High-Protein Salmon Formula 3.15LB'),
    ('friskies|friskies|friskies meaty bits chicken dinner in gravy wet cat food|cat|unknown|wet|13 5oz|', '7b4948c90c0b0e94cdc0d459e2590451066c2e3bf40f15c1200aa62241d85617', 'https://www.petsmart.com/cat/food-and-treats/canned-food/friskies-meaty-bits-adult-wet-cat-food-chicken-dinner-in-gravy-13-5-oz-95893.html', '050000550302', 'friskies|friskies|meaty bits|cat|unknown|wet|chicken dinner|', 'friskies', 'cat', 'unknown', 'wet', 'Friskies® Meaty Bits Adult Wet Cat Food - Chicken Dinner in Gravy, 13.5 Oz'),
    ('purina pro plan|purina pro plan|purina pro plan all life stages chicken classic entree wet cat food|cat|all life stages|wet|chicken classic entree|', '3be6cffecf1a9e3079a60dbc5725a1088b9d989593d895e678fcc3103e2c8b4a', 'https://www.petsmart.com/cat/food-and-treats/canned-food/purina-pro-plan-all-life-stages-wet-cat-food-classic-3-oz-92430.html', '038100104618', 'nestle purina petcare|purina pro plan|purina pro plan all life stages chicken classic entree wet cat food|cat|unknown|wet|chicken classic entree|', 'purina pro plan', 'cat', 'all life stages', 'wet', 'Purina Pro Plan All Life Stages Wet Cat Food - Classic, 3 Oz'),
    ('purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets nf kidney function advanced care wet cat food|cat|adult|wet||', 'da9c28a43c68a26a3b5eb713202d12ce8be14f0c629b0f6841c87d4ee9de0333', 'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/purina-pro-plan-veterinary-diets-nf-kidney-function-advanced-care-wet-cat-food-58775.html', '038100179029', 'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets nf kidney function advanced care wet cat food|cat|adult|wet||nf kidney function advanced care', 'purina pro plan veterinary diets', 'cat', 'adult', 'wet', 'Purina® Pro Plan® Veterinary Diets NF Kidney Function Advanced Care Wet Cat Food'),
    ('friskies|friskies|friskies meaty bits with ocean fish in sauce wet cat food|cat|unknown|wet|13 5oz|', '647337ea9af045ad360b4d0ccf19ec4598094002f67111361a0d43d995b057b8', 'https://www.petsmart.com/cat/food-and-treats/canned-food/friskies-meaty-bits-adult-wet-cat-food-ocean-fish-in-sauce-13-5-oz-95891.html', '050000549078', 'friskies|friskies|meaty bits with ocean fish in sauce wet 13 5oz|cat|unknown|wet||', 'friskies', 'cat', 'unknown', 'wet', 'Friskies® Meaty Bits Adult Wet Cat Food - Ocean Fish in Sauce, 13.5 Oz'),
    ('hill s science diet|hill s science diet|adult perfect digestion|cat|adult|dry|chicken and barley recipe|', '80ed05e7d8cc58e524218d383363706d8441b8c9bc29f7d7460f3553e01d1a9c', 'https://www.petsmart.com/cat/food-and-treats/dry-food/hill-s-science-diet-perfect-digestion-adult-dry-cat-food-chicken-60050.html', '052742038346', 'hill s science diet|hill s science diet|adult perfect digestion|cat|adult|dry|chicken and barley recipe|', 'hill s science diet', 'cat', 'adult', 'dry', 'Hill''s® Science Diet® Perfect Digestion Adult Dry Cat Food - Chicken'),
    ('purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets dm dietetic management wet cat food|cat|adult|wet||', 'a319aa0a23c2f41211b658738dd211dec69670878b5cf83e4caf53590176427c', 'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/purina-pro-plan-veterinary-diets-dm-dietetic-management-wet-cat-food-38711.html', '038100137999', 'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets dm dietetic management wet cat food|cat|adult|wet||dm dietetic management', 'purina pro plan veterinary diets', 'cat', 'adult', 'wet', 'Purina® Pro Plan® Veterinary Diets DM Dietetic Management Wet Cat Food'),
    ('royal canin|royal canin|feline gastrointestinal kitten ultra soft mousse in sauce|cat|kitten|wet||', '98faf56ce1f72b8226a75e1f6a21b6c9c3c81d99741f4821568412e68f237ec7', 'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/royal-canin-feline-gastrointestinal-kitten-ultra-soft-mousse-in-sauce-wet-cat-food-5-1-oz-can-63312.html', '030111474797', 'royal canin mars petcare|royal canin|feline gastrointestinal kitten ultra soft mousse in sauce|cat|adult kitten|wet||', 'royal canin', 'cat', 'kitten', 'wet', 'Feline Gastrointestinal Kitten Ultra Soft Mousse in Sauce'),
    ('royal canin|royal canin|royal canin veterinary diet glycoadvanced adult wet cat food|cat|adult|wet||', '929203435a787f5aa1cb891335969cd18b81dbd9e60353926e624c2d3453af6a', 'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/royal-canin-veterinary-diet-glycoadvanced-adult-wet-cat-food-98899.html', '030111482273', 'royal canin|royal canin|feline glycoadvanced loaf in sauce|cat|unknown|wet||feline glycoadvanced loaf in sauce', 'royal canin', 'cat', 'adult', 'wet', 'Royal Canin Veterinary Diet Glycoadvanced Adult Wet Cat Food'),
    ('royal canin|royal canin|royal canin veterinary diet multifunction adult dry cat food gastrointestinal hydrolyzed protein|cat|adult|dry|gastrointestinal hydrolyzed protein|', 'd67aa4a509f20b855bf3fc7ab4a0c379636a933aa54886f464ec2f0c6a502dd8', 'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/royal-canin-veterinary-diet-multifunction-adult-dry-cat-food-gastrointestinal-hydrolyzed-protein-92269.html', '030111440716', 'royal canin mars petcare|royal canin|feline gastrointestinal hydrolyzed protein|cat|adult mature senior|dry||', 'royal canin', 'cat', 'adult', 'dry', 'Royal Canin Veterinary Diet Multifunction Adult Dry Cat Food - Gastrointestinal + Hydrolyzed Protein'),
    ('purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets kidney function advanced care nf dry cat food|cat|adult|dry||', 'dd6fff5380c75dddab516bca7daf6944df376c78737360e24439bdd1119f601e', 'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/purina-pro-plan-veterinary-diets-kidney-function-advanced-care-nf-dry-cat-food-58774.html', '038100178886', 'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets kidney function advanced care nf dry cat food|cat|adult|dry||nf kidney function advanced care', 'purina pro plan veterinary diets', 'cat', 'adult', 'dry', 'Purina® Pro Plan® Veterinary Diets Kidney Function Advanced Care NF Dry Cat Food'),
    ('royal canin|royal canin|feline urinary so aging 7 calm|cat|senior|dry||', '3b77a2ce8726a2f04826c279c3b9d20d3c9a93073850c35f48437a138b52e3ce', 'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/royal-canin-veterinary-diet-multifunction-dry-aging-7-cat-food-urinary-so-and-calm-92270.html', '030111866868', 'royal canin|royal canin|veterinary health nutrition|cat|unknown|dry||', 'royal canin', 'cat', 'senior', 'dry', 'Royal Canin Veterinary Diet Multifunction Dry Aging 7+ Cat Food - Urinary SO & Calm'),
    ('hill s prescription diet|hill s prescription diet|i d with|cat|kitten|dry|chicken|', '530deb866a277e34ad2420667badd1c70a1ab378cb0c857a686e378a7d18b565', 'https://www.petsmart.com/cat/food-and-treats/veterinary-diets/hill-s-prescription-diet-i-d-digestive-care-kitten-dry-cat-food-4-lb-90518.html', '052742078298', 'hill s prescription diet|hill s prescription diet|i d with|cat|kitten|dry|chicken|', 'hill s prescription diet', 'cat', 'kitten', 'dry', 'Hill''s Prescription Diet i/d Digestive Care Kitten Dry Cat Food - 4 lb'),
    ('wellness pet company|wellness|signature selects flaked|cat|adult|wet|tuna and salmon|', 'dace8f0308ad4e62997fcfdab82d93abd26a0250653ff43d2a0a67a092de4d42', 'https://www.petsmart.com/cat/food-and-treats/canned-food/wellness-signature-selects-adult-cat-wet-food-grain-free-flaked-2-8-oz-12914.html', '076344060048', 'wellness|wellness|signature selects flaked|cat|adult|wet|tuna and salmon|', 'wellness', 'cat', 'adult', 'wet', 'Wellness® Signature Selects Adult Cat Wet Food - Grain Free, Flaked, 2.8 Oz'),
    ('simply nourish|simply nourish|simply nourish cat wet food natural shreds in a light cream sauce with grain|cat|adult|wet|36 oz natural shreds in a light cream sauce with grain|', '32646a81b53a4a6eb8fb426fae78d63bb987b0554dca206051695e92814c6e5e', 'https://www.petsmart.com/cat/food-and-treats/canned-food/simply-nourish-cat-wet-food-36-oz-natural-shreds-in-a-light-cream-sauce-with-grain-67669.html', '737257967069', 'simply nourish|simply nourish|simply nourish cat wet food natural shreds in a light cream sauce with grain|cat|adult|wet||', 'simply nourish', 'cat', 'adult', 'wet', 'Simply Nourish® Cat Wet Food - 36 Oz, Natural, Shreds in a Light Cream Sauce, With-Grain'),
    ('authority|authority|authority sensitive stomach and skin adult dry dog food chicken and rice|dog|adult|dry|chicken and rice|', 'c7223575f57319579570bead8323a3f8ba349109cbe896fcc1d37c05088828b0', 'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dry-dog-food---chicken-and-rice-87318.html', '196481089525', 'authority|authority|authority sensitive stomach and skin adult dry dog food chicken and rice|dog|adult|dry||', 'authority', 'dog', 'adult', 'dry', 'Authority Sensitive Stomach & Skin Adult Dry Dog Food - Chicken & Rice'),
    ('authority|authority|authority everyday health all life stages dry dog food chicken and rice|dog|all life stages|dry|chicken and rice|', '7278dfdddfbf4f28a20c45ce8527dac15421984ea81748bcd2bb9dcefbab6010', 'https://www.petsmart.com/dog/food/dry-food/authority-everyday-health-all-life-stages-dry-dog-food---chicken-and-rice-49288.html', '737257782532', 'authority|authority|authority everyday health all life stages dry dog food chicken and rice|dog|all life stages|dry||', 'authority', 'dog', 'all life stages', 'dry', 'Authority® Everyday Health All Life Stages Dry Dog Food - Chicken & Rice'),
    ('authority|authority|authority sensitive stomach and skin turkey entree adult wet dog food|dog|adult|wet|13 oz|', '97fb62cf59435efcad54d0de4a5c727ea1fccb811f15c0daedc834937d03b378', 'https://www.petsmart.com/dog/food/canned-food/authority-sensitive-stomach-and-skin-turkey-entree-adult-wet-dog-food---13-oz-80289.html', '196481056602', 'authority|authority|authority sensitive stomach and skin turkey entree adult wet dog food|dog|adult|wet||', 'authority', 'dog', 'adult', 'wet', 'Authority Sensitive Stomach & Skin Turkey Entree Adult Wet Dog Food - 13 oz'),
    ('authority|authority|authority everyday health tender blends adult dry dog food beef and rice|dog|adult|dry|beef and rice|', 'e3c7f6789e4e2fe6e6d45c075d6f3130de93bc3184075b3ea72d2a712bc7df12', 'https://www.petsmart.com/dog/food/dry-food/authority-everyday-health-tender-blends-adult-dry-dog-food---beef-and-rice-87323.html', '196481089464', 'authority|authority|authority everyday health tender blends adult dry dog food beef and rice|dog|adult|dry||', 'authority', 'dog', 'adult', 'dry', 'Authority Everyday Health Tender Blends Adult Dry Dog Food - Beef & Rice'),
    ('authority|authority|authority sensitive stomach and skin whitefish and salmon entree adult wet dog food|dog|adult|wet|13 oz|', '096e56557b717bb3299d75d537a1e84063a539ff2dc3012a44d718cb767e5c72', 'https://www.petsmart.com/dog/food/canned-food/authority-sensitive-stomach-and-skin-whitefish-and-salmon-entree-adult-wet-dog-food---13-oz-80291.html', '196481056640', 'authority|authority|authority sensitive stomach and skin whitefish and salmon entree adult wet dog food|dog|adult|wet||', 'authority', 'dog', 'adult', 'wet', 'Authority Sensitive Stomach & Skin Whitefish & Salmon Entree Adult Wet Dog Food - 13 oz'),
    ('authority|authority|authority sensitive stomach and skin large breed adult dog dry food lamb and rice|dog|adult|dry|lamb and rice 34 lb|', 'be9e8175a7b9a5dff3815eafa9b970b7e4b06f3fb071a2518ba9c6ec11f1942f', 'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-large-breed-adult-dog-dry-food---lamb-and-rice-34-lb-80305.html', '196481057753', 'authority|authority|authority sensitive stomach and skin large breed adult dog dry food lamb and rice|dog|adult|dry||', 'authority', 'dog', 'adult', 'dry', 'Authority Sensitive Stomach & Skin Large Breed Adult Dog Dry Food - Lamb & Rice, 34 lb'),
    ('authority|authority|authority everyday health tender blends adult dry dog food salmon and rice|dog|adult|dry|salmon and rice|', 'ba8196e38d5f89277d56572e183bf9c6398fcf32d64c53f94fcd6a48a56a5402', 'https://www.petsmart.com/dog/food/dry-food/authority-everyday-health-tender-blends-adult-dry-dog-food---salmon-and-rice-87325.html', '196481089495', 'authority|authority|authority everyday health tender blends adult dry dog food salmon and rice|dog|adult|dry||', 'authority', 'dog', 'adult', 'dry', 'Authority Everyday Health Tender Blends Adult Dry Dog Food - Salmon & Rice'),
    ('authority|authority|authority digestive support adult dog dry food chicken and rice|dog|adult|dry|chicken and rice|', 'ddbc1acf48233a35bf9d42165a10722bb5e399a6ab02b4db99f8ec0cf6adda77', 'https://www.petsmart.com/dog/food/dry-food/authority-digestive-support-adult-dog-dry-food---chicken-and-rice-80313.html', '196481057968', 'authority|authority|authority digestive support adult dog dry food chicken and rice|dog|adult|dry||', 'authority', 'dog', 'adult', 'dry', 'Authority Digestive Support Adult Dog Dry Food - Chicken & Rice'),
    ('authority|authority|authority healthy weight large breed adult dog dry food chicken and rice|dog|adult|dry|chicken and rice 34 lb|', 'c507c58d854e9ecd279e8376b79442fbf55cb342d2e97cbbd88eec8c2aa0c19c', 'https://www.petsmart.com/dog/food/dry-food/authority-healthy-weight-large-breed-adult-dog-dry-food---chicken-and-rice-34-lb-80302.html', '196481057791', 'authority|authority|authority healthy weight large breed adult dog dry food chicken and rice|dog|adult|dry||', 'authority', 'dog', 'adult', 'dry', 'Authority Healthy Weight Large Breed Adult Dog Dry Food - Chicken & Rice, 34 lb'),
    ('authority|authority|authority everyday health tender blends adult dry dog food chicken and rice|dog|adult|dry|chicken and rice|', '0fd2c5f696ea50faecc713e1e7f7c5a677b215880da33099197ae686a3c07475', 'https://www.petsmart.com/dog/food/dry-food/authority-everyday-health-tender-blends-adult-dry-dog-food---chicken-and-rice-87324.html', '196481089457', 'authority|authority|authority everyday health tender blends adult dry dog food chicken and rice|dog|adult|dry||', 'authority', 'dog', 'adult', 'dry', 'Authority Everyday Health Tender Blends Adult Dry Dog Food - Chicken & Rice'),
    ('authority|authority|authority healthy weight chicken entree adult dog wet food|dog|adult|wet|13 oz|', 'db1da00a9850126edaea983d963dd1805ed87a195fdc2d5a885a17e5aa64d959', 'https://www.petsmart.com/dog/food/canned-food/authority-healthy-weight-chicken-entree-adult-dog-wet-food---13-oz-80288.html', '196481056619', 'authority|authority|authority healthy weight chicken entree adult dog wet food|dog|adult|wet||', 'authority', 'dog', 'adult', 'wet', 'Authority Healthy Weight Chicken Entree Adult Dog Wet Food - 13 oz'),
    ('authority|authority|authority cat adult wet food sensitive stomach skin chicken turkey|cat|adult|wet|adult wet food sensitive stomach skin chicken turkey 5 5 oz|', '27808523599406feebd5bb5602e2a148a3a74e01e06bba47df9030e470346623', 'https://www.petsmart.com/cat/food-and-treats/canned-food/authority-cat-adult-wet-food-sensitive-stomach-skin-chicken-turkey-5-5-oz-90091.html', '196481093133', 'authority|authority|authority cat adult wet food sensitive stomach skin chicken turkey|cat|adult|wet||', 'authority', 'cat', 'adult', 'wet', 'Authority Cat - Adult, Wet Food, Sensitive Stomach + Skin, Chicken, Turkey, 5.5 OZ'),
    ('authority|authority|authority everyday health indoor kitten cat wet food pate with grain|cat|kitten|wet|5 5 oz pate with grain|', 'f7264a99c2d0c28dbbe788c6f884414aa0d25bf2850a545226541eb4bb15196c', 'https://www.petsmart.com/cat/food-and-treats/dry-food/authority-everyday-health-indoor-kitten-cat-wet-food-5-5-oz-pate-with-grain-57087.html', '737257872820', 'authority|authority|authority everyday health indoor kitten cat wet food pate with grain|cat|kitten|wet||', 'authority', 'cat', 'kitten', 'wet', 'Authority® Everyday Health Indoor Kitten Cat Wet Food - 5.5 Oz, Pate, With-Grain'),
    ('authority|authority|authority cat adult wet food pate salmon|cat|adult|wet|adult wet food pate salmon 3 oz|', '8b37c26a484b8faaf3f497f9f93ea5a5483adbcfc74fa0a49e1a718aa00a69ca', 'https://www.petsmart.com/cat/food-and-treats/canned-food/authority-cat-adult-wet-food-pate-salmon-3-oz-90094.html', '196481093140', 'authority|authority|authority cat adult wet food pate salmon|cat|adult|wet||', 'authority', 'cat', 'adult', 'wet', 'Authority Cat - Adult, Wet Food, Pate, Salmon, 3 OZ'),
    ('authority|authority|authority cat adult wet food pate chicken|cat|adult|wet|adult wet food pate chicken 3 oz|', '9d5b138f11db70fc1de86842f279aeb07136d3d09b2e973d7a31b53a77599fcb', 'https://www.petsmart.com/cat/food-and-treats/canned-food/authority-cat-adult-wet-food-pate-chicken-3-oz-92923.html', '196481093102', 'authority|authority|authority cat adult wet food pate chicken|cat|adult|wet||', 'authority', 'cat', 'adult', 'wet', 'Authority Cat - Adult, Wet Food, Pate, Chicken, 3 OZ')
), resolved AS (
  SELECT DISTINCT
    reviewed_alias.*,
    formula.id AS formula_id
  FROM reviewed_alias
  JOIN public.catalog_skus sku
    ON sku.active
   AND regexp_replace(sku.gtin, '[^0-9]', '', 'g') = reviewed_alias.gtin
  JOIN public.catalog_formulas formula
    ON formula.id = sku.formula_id
   AND formula.active
   AND formula.verification_status = 'verified'
   AND formula.formula_key = reviewed_alias.expected_formula_key
  WHERE lower(btrim(formula.brand)) = lower(btrim(reviewed_alias.brand))
    AND lower(btrim(formula.pet_type)) = lower(btrim(reviewed_alias.pet_type))
    AND (
      lower(btrim(reviewed_alias.food_form)) IN ('', 'unknown')
      OR lower(btrim(formula.food_form)) = lower(btrim(reviewed_alias.food_form))
    )
    AND (
      SELECT count(DISTINCT conflicting_formula.id)
      FROM public.catalog_skus conflicting_sku
      JOIN public.catalog_formulas conflicting_formula
        ON conflicting_formula.id = conflicting_sku.formula_id
       AND conflicting_formula.active
       AND conflicting_formula.verification_status = 'verified'
      WHERE conflicting_sku.active
        AND regexp_replace(conflicting_sku.gtin, '[^0-9]', '', 'g') = reviewed_alias.gtin
    ) = 1
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
  resolved.alias_formula_key,
  resolved.formula_id,
  resolved.identity_hash,
  'exact_gtin',
  resolved.source_url,
  jsonb_build_object(
    'reviewed_at', '2026-07-27',
    'evidence', 'exact package GTIN maps to one active verified formula version; brand, species, life-stage, and food-form boundaries reviewed',
    'gtin', resolved.gtin,
    'expected_formula_key', resolved.expected_formula_key,
    'observed_product_name', resolved.observed_product_name,
    'source_version_policy', 'preserve exact manufacturer-current or retailer-web formula version; never overwrite ingredients',
    'wave', 'major95_exact_gtin_alias_v171'
  )
FROM resolved
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now()
WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

DO $$
DECLARE
  v_expected INTEGER := 53;
  v_resolved INTEGER;
  v_aliases INTEGER;
BEGIN
  WITH reviewed_alias (alias_formula_key, gtin, expected_formula_key) AS (
    VALUES
      ('hill s science diet|hill s science diet|adult stomach and skin|dog|adult|dry|salmon and brown rice recipe|', '052742088532', 'hill s pet nutrition|hill s science diet|adult stomach and skin|dog|adult|dry|salmon and brown rice recipe|'),
      ('blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food chicken and brown rice|dog|adult|dry|chicken and brown rice|', '859610000111', 'retailer-package-version:a80dbafcf02444c18ecdace87487a3535647878679d780d60e463c6748786f78'),
      ('purina pro plan|purina pro plan|pro plan complete essentials adult chicken and rice entree classic wet dog food|dog|adult|wet||', '038100026743', 'purina pro plan|purina pro plan|pro plan complete essentials adult|dog|adult|wet|chicken and rice entree|'),
      ('purina pro plan|purina pro plan|pro plan complete essentials adult chicken and vegetables entree slices in gravy wet dog food|dog|adult|wet||', '038100107978', 'purina pro plan|purina pro plan|pro plan complete essentials adult|dog|adult|wet|chicken and vegetables entree|'),
      ('purina pro plan|purina pro plan|pro plan adult complete essentials grain free turkey and sweet potato entree classic wet dog food|dog|adult|wet||', '038100153388', 'purina pro plan|purina pro plan|pro plan adult complete essentials grain free|dog|adult|wet|turkey and sweet potato entree|'),
      ('purina pro plan|purina pro plan|pro plan complete essentials adult beef and rice entree classic wet dog food|dog|adult|wet||', '038100026736', 'purina pro plan|purina pro plan|pro plan complete essentials adult|dog|adult|wet|beef and rice entree|'),
      ('purina pro plan|purina pro plan|pro plan complete essentials adult turkey and vegetables entree slices in gravy wet dog food|dog|adult|wet||', '038100026767', 'purina pro plan|purina pro plan|pro plan complete essentials adult|dog|adult|wet|turkey and vegetables entree|'),
      ('blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food lamb and brown rice|dog|adult|dry|lamb and brown rice|', '859610000371', 'general mills|blue buffalo|life protection formula adult dry dog food lamb and brown rice|dog|adult|dry|lamb and brown rice|'),
      ('blue buffalo|blue buffalo|blue buffalo life protection formula small breed adult dry dog food chicken and brown rice|dog|adult|dry|chicken and brown rice|', '840243104888', 'retailer-package-version:e8d0a8f487ec7167bd28911caa6bc55938858e39895840bb65c53a494d24f7cf'),
      ('royal canin|royal canin|royal canin veterinary diet gastrointestinal small dog adult dog dry food low fat|dog|adult|dry|low fat 7 7 lb|', '030111370815', 'royal canin mars petcare|royal canin|canine gastrointestinal low fat small dog|dog|adult mature senior|dry||'),
      ('purina pro plan|purina pro plan|purina pro plan advantedge senior dry dog food chicken and rice|dog|senior|dry|chicken and rice|', '038100106797', 'purina pro plan|purina pro plan|pro plan advantedge adult 7 senior support shredded blend|dog|senior|dry|chicken and rice formula|'),
      ('purina one|purina one|purina one smartblend small bites dry dog food natural beef and rice|dog|adult|dry|beef and rice|', '017800149297', 'retailer-package-version:bdea04ecd1ff02e34a75165333e485e002d1f466839c4a2c190e2d9ef432ebc4'),
      ('purina pro plan|purina pro plan|pro plan adult 7 senior complete essentials beef and rice entree in gravy wet dog food|dog|senior|wet||', '038100026859', 'purina pro plan|purina pro plan|pro plan adult 7 senior complete essentials|dog|senior|wet|beef and rice entree|'),
      ('blue buffalo|blue buffalo|blue buffalo homestyle recipe healthy weight adult wet dog food chicken dinner|dog|adult|wet|chicken and vegetable|', '840243100170', 'retailer-package-version:3322a9aa553413f4b3e5ea7b9d61b24c241a4e972c4313767d48696e0e8b22df'),
      ('purina pro plan|purina pro plan|purina pro plan advantedge digestive support large breed adult dry dog food salmon and oatmeal|dog|adult|dry|salmon and oatmeal|', '038100106889', 'purina pro plan|purina pro plan|pro plan advantedge large breed adult digestive support|dog|adult|dry|pro plan advantedge large breed digestive support salmon and oat meal formula|'),
      ('purina pro plan|purina pro plan|purina pro plan advantedge large breed senior dry dog food chicken and rice|dog|senior|dry|chicken and rice|', '038100106759', 'purina pro plan|purina pro plan|pro plan advantedge large breed adult 7 senior support shredded blend|dog|senior|dry|chicken and rice formula|'),
      ('blue buffalo|blue buffalo|blue buffalo life protection formula puppy dry dog food lamb and oatmeal|dog|puppy|dry|lamb and oatmeal|', '840243105526', 'retailer-package-version:e544b0be709b2266178a13d6ee9e40aa727206e272d6b73684ff22114fef16f0'),
      ('purina pro plan|purina pro plan|purina pro plan advantedge small breed senior dry dog food chicken and rice|dog|senior|dry|chicken and rice|', '038100106735', 'purina pro plan|purina pro plan|pro plan advantedge small breed adult 7 senior support shredded blend|dog|senior|dry|chicken and rice formula|'),
      ('royal canin|royal canin|west highland white terrier adult dry dog food|dog|adult|dry||', '030111513601', 'royal canin mars petcare|royal canin|west highland white terrier adult dry dog food|dog|adult mature|dry||'),
      ('pedigree|pedigree|weight management chopped ground dinner adult wet dog food chicken and rice dinner|dog|adult|wet|chicken and rice dinner|', '023100230450', 'mars petcare|pedigree|weight management chopped ground dinner adult wet dog food chicken and rice dinner|dog|adult senior|wet|chicken and rice dinner|'),
      ('purina pro plan|purina pro plan|pro plan adult large breed chicken and rice entree in gravy wet dog food|dog|adult|wet||', '038100026781', 'purina pro plan|purina pro plan|pro plan adult large breed|dog|adult|wet|chicken and rice entree|'),
      ('purina pro plan|purina pro plan|pro plan adult large breed beef and rice entree in gravy wet dog food|dog|adult|wet||', '038100026774', 'purina pro plan|purina pro plan|pro plan adult large breed|dog|adult|wet|beef and rice entree|'),
      ('hill s prescription diet|hill s prescription diet|hill s prescription diet urinary care c d multicare stress dry cat food chicken|cat|adult|dry|chicken|', '052742022161', 'hill s prescription diet|hill s prescription diet|hill s prescription diet urinary care c d multicare stress dry cat food chicken|cat|adult|dry|chicken|'),
      ('cat chow|cat chow|purina cat chow complete dry cat food high protein salmon formula|cat|adult|dry||', '017800194808', 'cat chow|cat chow|purina cat chow complete dry cat food high protein salmon formula|cat|adult|dry||'),
      ('friskies|friskies|friskies meaty bits chicken dinner in gravy wet cat food|cat|unknown|wet|13 5oz|', '050000550302', 'friskies|friskies|meaty bits|cat|unknown|wet|chicken dinner|'),
      ('purina pro plan|purina pro plan|purina pro plan all life stages chicken classic entree wet cat food|cat|all life stages|wet|chicken classic entree|', '038100104618', 'nestle purina petcare|purina pro plan|purina pro plan all life stages chicken classic entree wet cat food|cat|unknown|wet|chicken classic entree|'),
      ('purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets nf kidney function advanced care wet cat food|cat|adult|wet||', '038100179029', 'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets nf kidney function advanced care wet cat food|cat|adult|wet||nf kidney function advanced care'),
      ('friskies|friskies|friskies meaty bits with ocean fish in sauce wet cat food|cat|unknown|wet|13 5oz|', '050000549078', 'friskies|friskies|meaty bits with ocean fish in sauce wet 13 5oz|cat|unknown|wet||'),
      ('hill s science diet|hill s science diet|adult perfect digestion|cat|adult|dry|chicken and barley recipe|', '052742038346', 'hill s science diet|hill s science diet|adult perfect digestion|cat|adult|dry|chicken and barley recipe|'),
      ('purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets dm dietetic management wet cat food|cat|adult|wet||', '038100137999', 'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets dm dietetic management wet cat food|cat|adult|wet||dm dietetic management'),
      ('royal canin|royal canin|feline gastrointestinal kitten ultra soft mousse in sauce|cat|kitten|wet||', '030111474797', 'royal canin mars petcare|royal canin|feline gastrointestinal kitten ultra soft mousse in sauce|cat|adult kitten|wet||'),
      ('royal canin|royal canin|royal canin veterinary diet glycoadvanced adult wet cat food|cat|adult|wet||', '030111482273', 'royal canin|royal canin|feline glycoadvanced loaf in sauce|cat|unknown|wet||feline glycoadvanced loaf in sauce'),
      ('royal canin|royal canin|royal canin veterinary diet multifunction adult dry cat food gastrointestinal hydrolyzed protein|cat|adult|dry|gastrointestinal hydrolyzed protein|', '030111440716', 'royal canin mars petcare|royal canin|feline gastrointestinal hydrolyzed protein|cat|adult mature senior|dry||'),
      ('purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets kidney function advanced care nf dry cat food|cat|adult|dry||', '038100178886', 'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets kidney function advanced care nf dry cat food|cat|adult|dry||nf kidney function advanced care'),
      ('royal canin|royal canin|feline urinary so aging 7 calm|cat|senior|dry||', '030111866868', 'royal canin|royal canin|veterinary health nutrition|cat|unknown|dry||'),
      ('hill s prescription diet|hill s prescription diet|i d with|cat|kitten|dry|chicken|', '052742078298', 'hill s prescription diet|hill s prescription diet|i d with|cat|kitten|dry|chicken|'),
      ('wellness pet company|wellness|signature selects flaked|cat|adult|wet|tuna and salmon|', '076344060048', 'wellness|wellness|signature selects flaked|cat|adult|wet|tuna and salmon|'),
      ('simply nourish|simply nourish|simply nourish cat wet food natural shreds in a light cream sauce with grain|cat|adult|wet|36 oz natural shreds in a light cream sauce with grain|', '737257967069', 'simply nourish|simply nourish|simply nourish cat wet food natural shreds in a light cream sauce with grain|cat|adult|wet||'),
      ('authority|authority|authority sensitive stomach and skin adult dry dog food chicken and rice|dog|adult|dry|chicken and rice|', '196481089525', 'authority|authority|authority sensitive stomach and skin adult dry dog food chicken and rice|dog|adult|dry||'),
      ('authority|authority|authority everyday health all life stages dry dog food chicken and rice|dog|all life stages|dry|chicken and rice|', '737257782532', 'authority|authority|authority everyday health all life stages dry dog food chicken and rice|dog|all life stages|dry||'),
      ('authority|authority|authority sensitive stomach and skin turkey entree adult wet dog food|dog|adult|wet|13 oz|', '196481056602', 'authority|authority|authority sensitive stomach and skin turkey entree adult wet dog food|dog|adult|wet||'),
      ('authority|authority|authority everyday health tender blends adult dry dog food beef and rice|dog|adult|dry|beef and rice|', '196481089464', 'authority|authority|authority everyday health tender blends adult dry dog food beef and rice|dog|adult|dry||'),
      ('authority|authority|authority sensitive stomach and skin whitefish and salmon entree adult wet dog food|dog|adult|wet|13 oz|', '196481056640', 'authority|authority|authority sensitive stomach and skin whitefish and salmon entree adult wet dog food|dog|adult|wet||'),
      ('authority|authority|authority sensitive stomach and skin large breed adult dog dry food lamb and rice|dog|adult|dry|lamb and rice 34 lb|', '196481057753', 'authority|authority|authority sensitive stomach and skin large breed adult dog dry food lamb and rice|dog|adult|dry||'),
      ('authority|authority|authority everyday health tender blends adult dry dog food salmon and rice|dog|adult|dry|salmon and rice|', '196481089495', 'authority|authority|authority everyday health tender blends adult dry dog food salmon and rice|dog|adult|dry||'),
      ('authority|authority|authority digestive support adult dog dry food chicken and rice|dog|adult|dry|chicken and rice|', '196481057968', 'authority|authority|authority digestive support adult dog dry food chicken and rice|dog|adult|dry||'),
      ('authority|authority|authority healthy weight large breed adult dog dry food chicken and rice|dog|adult|dry|chicken and rice 34 lb|', '196481057791', 'authority|authority|authority healthy weight large breed adult dog dry food chicken and rice|dog|adult|dry||'),
      ('authority|authority|authority everyday health tender blends adult dry dog food chicken and rice|dog|adult|dry|chicken and rice|', '196481089457', 'authority|authority|authority everyday health tender blends adult dry dog food chicken and rice|dog|adult|dry||'),
      ('authority|authority|authority healthy weight chicken entree adult dog wet food|dog|adult|wet|13 oz|', '196481056619', 'authority|authority|authority healthy weight chicken entree adult dog wet food|dog|adult|wet||'),
      ('authority|authority|authority cat adult wet food sensitive stomach skin chicken turkey|cat|adult|wet|adult wet food sensitive stomach skin chicken turkey 5 5 oz|', '196481093133', 'authority|authority|authority cat adult wet food sensitive stomach skin chicken turkey|cat|adult|wet||'),
      ('authority|authority|authority everyday health indoor kitten cat wet food pate with grain|cat|kitten|wet|5 5 oz pate with grain|', '737257872820', 'authority|authority|authority everyday health indoor kitten cat wet food pate with grain|cat|kitten|wet||'),
      ('authority|authority|authority cat adult wet food pate salmon|cat|adult|wet|adult wet food pate salmon 3 oz|', '196481093140', 'authority|authority|authority cat adult wet food pate salmon|cat|adult|wet||'),
      ('authority|authority|authority cat adult wet food pate chicken|cat|adult|wet|adult wet food pate chicken 3 oz|', '196481093102', 'authority|authority|authority cat adult wet food pate chicken|cat|adult|wet||')
  )
  SELECT count(DISTINCT reviewed_alias.alias_formula_key)
  INTO v_resolved
  FROM reviewed_alias
  JOIN public.catalog_skus sku
    ON sku.active
   AND regexp_replace(sku.gtin, '[^0-9]', '', 'g') = reviewed_alias.gtin
  JOIN public.catalog_formulas formula
    ON formula.id = sku.formula_id
   AND formula.active
   AND formula.verification_status = 'verified'
   AND formula.formula_key = reviewed_alias.expected_formula_key
  WHERE (
    SELECT count(DISTINCT conflicting_formula.id)
    FROM public.catalog_skus conflicting_sku
    JOIN public.catalog_formulas conflicting_formula
      ON conflicting_formula.id = conflicting_sku.formula_id
     AND conflicting_formula.active
     AND conflicting_formula.verification_status = 'verified'
    WHERE conflicting_sku.active
      AND regexp_replace(conflicting_sku.gtin, '[^0-9]', '', 'g') = reviewed_alias.gtin
  ) = 1;

  SELECT count(*)
  INTO v_aliases
  FROM public.catalog_formula_aliases alias
  WHERE alias.alias_formula_key IN (
    'hill s science diet|hill s science diet|adult stomach and skin|dog|adult|dry|salmon and brown rice recipe|',
    'blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food chicken and brown rice|dog|adult|dry|chicken and brown rice|',
    'purina pro plan|purina pro plan|pro plan complete essentials adult chicken and rice entree classic wet dog food|dog|adult|wet||',
    'purina pro plan|purina pro plan|pro plan complete essentials adult chicken and vegetables entree slices in gravy wet dog food|dog|adult|wet||',
    'purina pro plan|purina pro plan|pro plan adult complete essentials grain free turkey and sweet potato entree classic wet dog food|dog|adult|wet||',
    'purina pro plan|purina pro plan|pro plan complete essentials adult beef and rice entree classic wet dog food|dog|adult|wet||',
    'purina pro plan|purina pro plan|pro plan complete essentials adult turkey and vegetables entree slices in gravy wet dog food|dog|adult|wet||',
    'blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food lamb and brown rice|dog|adult|dry|lamb and brown rice|',
    'blue buffalo|blue buffalo|blue buffalo life protection formula small breed adult dry dog food chicken and brown rice|dog|adult|dry|chicken and brown rice|',
    'royal canin|royal canin|royal canin veterinary diet gastrointestinal small dog adult dog dry food low fat|dog|adult|dry|low fat 7 7 lb|',
    'purina pro plan|purina pro plan|purina pro plan advantedge senior dry dog food chicken and rice|dog|senior|dry|chicken and rice|',
    'purina one|purina one|purina one smartblend small bites dry dog food natural beef and rice|dog|adult|dry|beef and rice|',
    'purina pro plan|purina pro plan|pro plan adult 7 senior complete essentials beef and rice entree in gravy wet dog food|dog|senior|wet||',
    'blue buffalo|blue buffalo|blue buffalo homestyle recipe healthy weight adult wet dog food chicken dinner|dog|adult|wet|chicken and vegetable|',
    'purina pro plan|purina pro plan|purina pro plan advantedge digestive support large breed adult dry dog food salmon and oatmeal|dog|adult|dry|salmon and oatmeal|',
    'purina pro plan|purina pro plan|purina pro plan advantedge large breed senior dry dog food chicken and rice|dog|senior|dry|chicken and rice|',
    'blue buffalo|blue buffalo|blue buffalo life protection formula puppy dry dog food lamb and oatmeal|dog|puppy|dry|lamb and oatmeal|',
    'purina pro plan|purina pro plan|purina pro plan advantedge small breed senior dry dog food chicken and rice|dog|senior|dry|chicken and rice|',
    'royal canin|royal canin|west highland white terrier adult dry dog food|dog|adult|dry||',
    'pedigree|pedigree|weight management chopped ground dinner adult wet dog food chicken and rice dinner|dog|adult|wet|chicken and rice dinner|',
    'purina pro plan|purina pro plan|pro plan adult large breed chicken and rice entree in gravy wet dog food|dog|adult|wet||',
    'purina pro plan|purina pro plan|pro plan adult large breed beef and rice entree in gravy wet dog food|dog|adult|wet||',
    'hill s prescription diet|hill s prescription diet|hill s prescription diet urinary care c d multicare stress dry cat food chicken|cat|adult|dry|chicken|',
    'cat chow|cat chow|purina cat chow complete dry cat food high protein salmon formula|cat|adult|dry||',
    'friskies|friskies|friskies meaty bits chicken dinner in gravy wet cat food|cat|unknown|wet|13 5oz|',
    'purina pro plan|purina pro plan|purina pro plan all life stages chicken classic entree wet cat food|cat|all life stages|wet|chicken classic entree|',
    'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets nf kidney function advanced care wet cat food|cat|adult|wet||',
    'friskies|friskies|friskies meaty bits with ocean fish in sauce wet cat food|cat|unknown|wet|13 5oz|',
    'hill s science diet|hill s science diet|adult perfect digestion|cat|adult|dry|chicken and barley recipe|',
    'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets dm dietetic management wet cat food|cat|adult|wet||',
    'royal canin|royal canin|feline gastrointestinal kitten ultra soft mousse in sauce|cat|kitten|wet||',
    'royal canin|royal canin|royal canin veterinary diet glycoadvanced adult wet cat food|cat|adult|wet||',
    'royal canin|royal canin|royal canin veterinary diet multifunction adult dry cat food gastrointestinal hydrolyzed protein|cat|adult|dry|gastrointestinal hydrolyzed protein|',
    'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets kidney function advanced care nf dry cat food|cat|adult|dry||',
    'royal canin|royal canin|feline urinary so aging 7 calm|cat|senior|dry||',
    'hill s prescription diet|hill s prescription diet|i d with|cat|kitten|dry|chicken|',
    'wellness pet company|wellness|signature selects flaked|cat|adult|wet|tuna and salmon|',
    'simply nourish|simply nourish|simply nourish cat wet food natural shreds in a light cream sauce with grain|cat|adult|wet|36 oz natural shreds in a light cream sauce with grain|',
    'authority|authority|authority sensitive stomach and skin adult dry dog food chicken and rice|dog|adult|dry|chicken and rice|',
    'authority|authority|authority everyday health all life stages dry dog food chicken and rice|dog|all life stages|dry|chicken and rice|',
    'authority|authority|authority sensitive stomach and skin turkey entree adult wet dog food|dog|adult|wet|13 oz|',
    'authority|authority|authority everyday health tender blends adult dry dog food beef and rice|dog|adult|dry|beef and rice|',
    'authority|authority|authority sensitive stomach and skin whitefish and salmon entree adult wet dog food|dog|adult|wet|13 oz|',
    'authority|authority|authority sensitive stomach and skin large breed adult dog dry food lamb and rice|dog|adult|dry|lamb and rice 34 lb|',
    'authority|authority|authority everyday health tender blends adult dry dog food salmon and rice|dog|adult|dry|salmon and rice|',
    'authority|authority|authority digestive support adult dog dry food chicken and rice|dog|adult|dry|chicken and rice|',
    'authority|authority|authority healthy weight large breed adult dog dry food chicken and rice|dog|adult|dry|chicken and rice 34 lb|',
    'authority|authority|authority everyday health tender blends adult dry dog food chicken and rice|dog|adult|dry|chicken and rice|',
    'authority|authority|authority healthy weight chicken entree adult dog wet food|dog|adult|wet|13 oz|',
    'authority|authority|authority cat adult wet food sensitive stomach skin chicken turkey|cat|adult|wet|adult wet food sensitive stomach skin chicken turkey 5 5 oz|',
    'authority|authority|authority everyday health indoor kitten cat wet food pate with grain|cat|kitten|wet|5 5 oz pate with grain|',
    'authority|authority|authority cat adult wet food pate salmon|cat|adult|wet|adult wet food pate salmon 3 oz|',
    'authority|authority|authority cat adult wet food pate chicken|cat|adult|wet|adult wet food pate chicken 3 oz|'
  )
    AND alias.match_reason = 'exact_gtin'
    AND alias.metadata ->> 'wave' = 'major95_exact_gtin_alias_v171';

  IF v_resolved <> v_expected OR v_aliases <> v_expected THEN
    RAISE EXCEPTION
      'Major95 exact-GTIN alias wave incomplete: expected %, resolved %, aliases %',
      v_expected,
      v_resolved,
      v_aliases;
  END IF;
END
$$;
