-- Promote twelve exact PetSmart package versions as source-versioned evidence.
-- These packages either differ from a manufacturer-current ingredient version,
-- have an independently identifiable retailer formulation, or previously
-- collided with a stale identity alias. They remain separate formulas and
-- never overwrite a manufacturer-current ingredient statement.

-- A GTIN can be reused after a formula change. Permit a second active SKU only
-- for an explicitly reviewed source-version formula whose serving row proves
-- the same exact package version and whose barcode policy is abstention.
CREATE OR REPLACE FUNCTION
  public.guard_catalog_sku_formula_ingredient_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_formula_ingredients text;
  v_formula_tier text;
  v_formula_provenance jsonb;
  v_promoted_cache_key text;
BEGIN
  IF NOT coalesce(NEW.active, false)
     OR nullif(
       regexp_replace(coalesce(NEW.gtin, ''), '\D', '', 'g'),
       ''
     ) IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT
    ingredient_text,
    formula_evidence_tier,
    formula_version_provenance,
    promoted_cache_key
  INTO
    v_formula_ingredients,
    v_formula_tier,
    v_formula_provenance,
    v_promoted_cache_key
  FROM public.catalog_formulas
  WHERE id = NEW.formula_id;

  IF nullif(btrim(coalesce(v_formula_ingredients, '')), '') IS NULL THEN
    RAISE EXCEPTION
      'catalog_sku_gtin_formula_missing_ingredients: GTIN % formula %',
      NEW.gtin,
      NEW.formula_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data serving
    WHERE regexp_replace(coalesce(serving.gtin, ''), '\D', '', 'g') =
      regexp_replace(NEW.gtin, '\D', '', 'g')
      AND nullif(
        btrim(coalesce(serving.ingredient_text, '')),
        ''
      ) IS NOT NULL
      AND serving.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      AND public.catalog_normalize_ingredient_evidence(
        serving.ingredient_text
      ) <> public.catalog_normalize_ingredient_evidence(
        v_formula_ingredients
      )
  ) THEN
    IF (
      v_formula_tier IN ('retailer_web_version', 'web_label_version')
      AND coalesce(
        v_formula_provenance->>'allow_reused_gtin_version',
        'false'
      ) = 'true'
      AND v_formula_provenance->>'gtin_resolution_policy' =
        'abstain_on_version_conflict'
      AND EXISTS (
        SELECT 1
        FROM public.product_data exact_version
        WHERE exact_version.cache_key = v_promoted_cache_key
          AND regexp_replace(
            coalesce(exact_version.gtin, ''),
            '\D',
            '',
            'g'
          ) = regexp_replace(NEW.gtin, '\D', '', 'g')
          AND exact_version.formula_evidence_tier = v_formula_tier
          AND exact_version.ingredient_verification_status IN (
            'retailer_verified',
            'label_ocr_verified'
          )
          AND exact_version.image_verification_status IN (
            'retailer_verified',
            'manufacturer',
            'official'
          )
          AND exact_version.formula_version_provenance
            ->>'gtin_resolution_policy' =
              'abstain_on_version_conflict'
          AND public.catalog_normalize_ingredient_evidence(
            exact_version.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(
            v_formula_ingredients
          )
      )
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'catalog_sku_gtin_formula_ingredient_conflict: GTIN % cannot link to formula %',
      NEW.gtin,
      NEW.formula_id;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  public.enforce_catalog_sku_gtin_formula_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_provenance jsonb;
BEGIN
  IF NEW.active
    AND nullif(btrim(NEW.gtin), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.catalog_skus existing
      WHERE existing.active
        AND existing.gtin = NEW.gtin
        AND existing.formula_id <> NEW.formula_id
        AND existing.id <> coalesce(NEW.id, -1)
    )
  THEN
    SELECT formula_evidence_tier, formula_version_provenance
    INTO v_tier, v_provenance
    FROM public.catalog_formulas
    WHERE id = NEW.formula_id;

    IF (
      v_tier IN ('retailer_web_version', 'web_label_version')
      AND coalesce(
        v_provenance->>'allow_reused_gtin_version',
        'false'
      ) = 'true'
      AND v_provenance->>'gtin_resolution_policy' =
        'abstain_on_version_conflict'
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'GTIN % is already attached to a different active catalog formula',
      NEW.gtin
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

CREATE TEMP TABLE reviewed_petsmart_source_versions_v180 ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset($reviewed$
[
  {
    "gtin":"840243135424",
    "source_external_id":"petsmart-retail-catalog:840243135424",
    "serving_cache_key":"petsmart-retail-version:840243135424:b8e972955c81",
    "source_url":"https://www.petsmart.com/dog/food/dry-food/blue-buffalo-true-solutions-and-trade-blissful-belly-digestive-care-all-life-stages-dry-dog-food-56813.html",
    "legacy_alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care all life stages dry dog food|dog|all life stages|dry|chicken|",
    "manufacturer":"blue buffalo",
    "brand":"blue buffalo",
    "brand_display":"Blue Buffalo",
    "product_line":"blue buffalo true solutions blissful belly digestive care all life stages dry dog food",
    "pet_type":"dog",
    "life_stage":"all life stages",
    "food_form":"dry",
    "flavor":"chicken",
    "diet_condition":"",
    "ingredient_hash":"b8e972955c81c9e60ce62133002f5ff1aefc622fb37dceeb2db656d2c1cfb8c7"
  },
  {
    "gtin":"030111177315",
    "source_external_id":"petsmart-retail-catalog:030111177315",
    "serving_cache_key":"petsmart-retail-catalog:030111177315",
    "source_url":"https://www.petsmart.com/dog/food/dry-food/royal-canin-size-health-nutrition-medium-breed-senior-7-dry-dog-food-30-lb-88333.html",
    "product_name_override":"Royal Canin Size Health Nutrition Medium Breed Senior 7+ Dry Dog Food",
    "legacy_alias_formula_key":"royal canin|royal canin|medium adult 7|dog|senior|dry||",
    "manufacturer":"royal canin",
    "brand":"royal canin",
    "brand_display":"Royal Canin",
    "product_line":"medium adult 7",
    "pet_type":"dog",
    "life_stage":"senior",
    "food_form":"dry",
    "flavor":"",
    "review_flavor":"unknown",
    "diet_condition":"",
    "ingredient_hash":"a37cb92329ec8583aabd8c56bee3b1ee51ea9a0b9e2367978fd37c32aaa80c57"
  },
  {
    "gtin":"030111512628",
    "source_external_id":"petsmart-retail-catalog:030111512628",
    "serving_cache_key":"petsmart-retail-catalog:030111512628",
    "source_url":"https://www.petsmart.com/dog/food/dry-food/royal-canin-small-breed-adult-8-senior-dry-dog-food-78537.html",
    "legacy_alias_formula_key":"royal canin|royal canin|small adult 8 dry|dog|senior|dry||",
    "manufacturer":"royal canin",
    "brand":"royal canin",
    "brand_display":"Royal Canin",
    "product_line":"small adult 8 dry",
    "pet_type":"dog",
    "life_stage":"senior",
    "food_form":"dry",
    "flavor":"",
    "review_flavor":"unknown",
    "diet_condition":"",
    "ingredient_hash":"572fc35981789df3fdbe90d425723af66578a584cfe7902bce0bf43747943c89"
  },
  {
    "gtin":"038100330482",
    "source_external_id":"petsmart-retail-catalog:038100330482",
    "serving_cache_key":"petsmart-retail-catalog:038100330482",
    "source_url":"https://www.petsmart.com/dog/food/dry-food/purina-moist-and-meaty-adult-dog-dry-food-2390.html",
    "legacy_alias_formula_key":"moist and meaty|moist and meaty|purina moist and meaty adult dog dry food|dog|adult|dry|burger with chedder cheese|",
    "manufacturer":"nestle purina",
    "brand":"moist and meaty",
    "brand_display":"Moist & Meaty",
    "product_line":"purina moist and meaty adult dog dry food",
    "pet_type":"dog",
    "life_stage":"adult",
    "food_form":"dry",
    "flavor":"burger with cheddar cheese",
    "diet_condition":"",
    "ingredient_hash":"dfe01a2507337cb91f276ab247ce99645073427bf39a54e1968d7a41a5689f32"
  },
  {
    "gtin":"640461012138",
    "source_external_id":"petsmart-retail-catalog:640461012138",
    "serving_cache_key":"petsmart-retail-catalog:640461012138",
    "source_url":"https://www.petsmart.com/dog/food/canned-food/canidae-all-life-stage-wet-dog-food-pate-13-oz-52934.html",
    "legacy_alias_formula_key":"canidae|canidae|all life stages|dog|all life stages|wet|lamb|",
    "manufacturer":"canidae",
    "brand":"canidae",
    "brand_display":"CANIDAE",
    "product_line":"all life stages",
    "pet_type":"dog",
    "life_stage":"all life stages",
    "food_form":"wet",
    "flavor":"lamb and rice",
    "diet_condition":"",
    "ingredient_hash":"edd1472bb03b17224e4b4ce225f975fe3f0fe7b2fc983a3f71dd1f3b89947af8"
  },
  {
    "gtin":"038100330222",
    "source_external_id":"petsmart-retail-catalog:038100330222",
    "serving_cache_key":"petsmart-retail-catalog:038100330222",
    "source_url":"https://www.petsmart.com/dog/food/canned-food/moist-and-meaty-burger-cheddar-cheese-adult-semi-moist-dog-food-72-oz-84315.html",
    "legacy_alias_formula_key":"moist and meaty|moist and meaty|moist and meaty burger cheddar cheese adult semi moist dog food|dog|adult|semi moist|burger with chedder cheese|",
    "manufacturer":"nestle purina",
    "brand":"moist and meaty",
    "brand_display":"Moist & Meaty",
    "product_line":"moist and meaty burger cheddar cheese adult semi moist dog food",
    "pet_type":"dog",
    "life_stage":"adult",
    "food_form":"semi moist",
    "flavor":"burger with cheddar cheese",
    "diet_condition":"",
    "ingredient_hash":"51a1b4f6c409d262d4b9862bee66713c5c74d5b0e0f73db15df141242d0e9664"
  },
  {
    "gtin":"840243135219",
    "source_external_id":"petsmart-retail-catalog:840243135219",
    "serving_cache_key":"petsmart-retail-catalog:840243135219",
    "source_url":"https://www.petsmart.com/cat/food-and-treats/dry-food/blue-buffalo-true-solutions-blissful-belly-digestive-care-dry-cat-food-natural-chicken-56234.html",
    "legacy_alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care dry cat food natural chicken|cat|adult|dry|chicken|",
    "manufacturer":"blue buffalo",
    "brand":"blue buffalo",
    "brand_display":"Blue Buffalo",
    "product_line":"blue buffalo true solutions blissful belly digestive care dry cat food natural chicken",
    "pet_type":"cat",
    "life_stage":"adult",
    "food_form":"dry",
    "flavor":"chicken",
    "diet_condition":"",
    "ingredient_hash":"1ccabb6ae5dc713cb799b1c208a613d39b88364d5862ba8dadfdc239b8ff59c5"
  },
  {
    "gtin":"017800194808",
    "source_external_id":"petsmart-retail-catalog:017800194808",
    "serving_cache_key":"petsmart-retail-catalog:017800194808",
    "source_url":"https://www.petsmart.com/cat/food-and-treats/dry-food/purina-cat-chow-complete-dry-cat-food-high-protein-salmon-formula-3-15lb-75321.html",
    "legacy_alias_formula_key":"cat chow|cat chow|purina cat chow complete dry cat food high protein salmon formula|cat|adult|dry||",
    "manufacturer":"nestle purina",
    "brand":"cat chow",
    "brand_display":"Cat Chow",
    "product_line":"purina cat chow complete dry cat food high protein salmon formula",
    "pet_type":"cat",
    "life_stage":"adult",
    "food_form":"dry",
    "flavor":"salmon",
    "diet_condition":"",
    "ingredient_hash":"927817b8671699eaa322b3b9e8234ea410d41e477b86c681fdc9f97c651b7f51"
  },
  {
    "gtin":"050000550302",
    "source_external_id":"petsmart-retail-catalog:050000550302",
    "serving_cache_key":"petsmart-retail-catalog:050000550302",
    "source_url":"https://www.petsmart.com/cat/food-and-treats/canned-food/friskies-meaty-bits-adult-wet-cat-food-chicken-dinner-in-gravy-13-5-oz-95893.html",
    "legacy_alias_formula_key":"friskies|friskies|friskies meaty bits chicken dinner in gravy wet cat food|cat|unknown|wet|13 5oz|",
    "manufacturer":"nestle purina",
    "brand":"friskies",
    "brand_display":"Friskies",
    "product_line":"friskies meaty bits chicken dinner in gravy wet cat food",
    "pet_type":"cat",
    "life_stage":"adult",
    "food_form":"wet",
    "flavor":"chicken dinner in gravy",
    "diet_condition":"",
    "ingredient_hash":"82b00b195066479d362270cdccf47d110c0cc0cb5672a24ad8ccb38e3b1d5e7b"
  },
  {
    "gtin":"052742038346",
    "source_external_id":"petsmart-retail-catalog:052742038346",
    "serving_cache_key":"petsmart-retail-catalog:052742038346",
    "source_url":"https://www.petsmart.com/cat/food-and-treats/dry-food/hill-s-science-diet-perfect-digestion-adult-dry-cat-food-chicken-60050.html",
    "legacy_alias_formula_key":"hill s science diet|hill s science diet|adult perfect digestion|cat|adult|dry|chicken and barley recipe|",
    "manufacturer":"hill s science diet",
    "brand":"hill s science diet",
    "brand_display":"Hill's Science Diet",
    "product_line":"adult perfect digestion",
    "pet_type":"cat",
    "life_stage":"adult",
    "food_form":"dry",
    "flavor":"chicken and barley recipe",
    "diet_condition":"",
    "ingredient_hash":"bb87bf8d54c152ef1c743a8dc43dcfc93918eac6e39b7c9fa258ea5475df07d1"
  },
  {
    "gtin":"030111866868",
    "source_external_id":"petsmart-retail-catalog:030111866868",
    "serving_cache_key":"petsmart-retail-catalog:030111866868",
    "source_url":"https://www.petsmart.com/cat/food-and-treats/veterinary-diets/royal-canin-veterinary-diet-multifunction-dry-aging-7-cat-food-urinary-so-and-calm-92270.html",
    "legacy_alias_formula_key":"royal canin|royal canin|feline urinary so aging 7 calm|cat|senior|dry||",
    "manufacturer":"royal canin",
    "brand":"royal canin",
    "brand_display":"Royal Canin",
    "product_line":"feline urinary so aging 7 calm",
    "pet_type":"cat",
    "life_stage":"senior",
    "food_form":"dry",
    "flavor":"",
    "review_flavor":"urinary so and calm",
    "diet_condition":"urinary so and calm",
    "ingredient_hash":"2c037e3692bb7e182edda2fa70fe49c52a38cab6b3e81b46bc9869c8f3a5285e"
  },
  {
    "gtin":"076344060543",
    "source_external_id":"petsmart-retail-catalog:076344060543",
    "serving_cache_key":"petsmart-retail-catalog:076344060543",
    "source_url":"https://www.petsmart.com/cat/food-and-treats/canned-food/wellness-signature-selects-adult-cat-wet-food-grain-free-flaked-5-3-oz-20971.html",
    "legacy_alias_formula_key":"wellness pet company|wellness|signature selects flaked|cat|adult|wet|tuna and salmon|",
    "manufacturer":"wellness pet company",
    "brand":"wellness",
    "brand_display":"Wellness",
    "product_line":"signature selects flaked",
    "pet_type":"cat",
    "life_stage":"adult",
    "food_form":"wet",
    "flavor":"tuna and salmon",
    "diet_condition":"",
    "ingredient_hash":"4b7b7aeb1c0e64a1398d3bc06d1797cd418645b2e59c813742176e64108aa88e",
    "ingredient_override":"Tuna, Tuna Broth, Water Sufficient for Processing, Mackerel, Salmon, Tapioca Starch, Sunflower Oil, Natural Flavor, Guar Gum, Tricalcium Phosphate, Taurine, Magnesium Sulfate, Vitamins [Vitamin E Supplement, Thiamine Hydrochloride, Niacin, Vitamin A Supplement, Pyridoxine Hydrochloride, d-Calcium Pantothenate, Riboflavin Supplement, Folic Acid, Vitamin D3 Supplement, Biotin, Vitamin B12 Supplement], Potassium Chloride, Choline Chloride, Minerals [Zinc Amino Acid Chelate, Iron Amino Acid Chelate, Manganese Amino Acid Chelate, Copper Amino Acid Chelate, Potassium Iodide, Sodium Selenite], Menadione Sodium Bisulfite Complex (Vitamin K).",
    "official_corroboration_url":"https://www.wellnesspetfood.com/product-catalog/wellness-core-signature-selects-seafood-variety-pack/"
  }
]
$reviewed$::jsonb)
AS row(
  gtin text,
  source_external_id text,
  serving_cache_key text,
  source_url text,
  product_name_override text,
  legacy_alias_formula_key text,
  manufacturer text,
  brand text,
  brand_display text,
  product_line text,
  pet_type text,
  life_stage text,
  food_form text,
  flavor text,
  review_flavor text,
  diet_condition text,
  ingredient_hash text,
  ingredient_override text,
  official_corroboration_url text
);

ALTER TABLE reviewed_petsmart_source_versions_v180
ADD COLUMN formula_key text;

UPDATE reviewed_petsmart_source_versions_v180
SET formula_key =
  'retailer-package-version:'
  || encode(
    digest(
      gtin || '|' || ingredient_hash || '|' || source_url,
      'sha256'
    ),
    'hex'
  );

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)
  INTO v_count
  FROM reviewed_petsmart_source_versions_v180 reviewed
  JOIN public.catalog_observations observation
    ON observation.source_slug = 'petsmart-retail-catalog'
   AND observation.source_external_id = reviewed.source_external_id
   AND observation.gtin = reviewed.gtin
   AND observation.source_url = reviewed.source_url
   AND observation.source_authority = 'retailer_verified'
   AND observation.is_complete_food
   AND btrim(observation.front_image_url) <> ''
   AND length(
     coalesce(reviewed.ingredient_override, observation.ingredient_text)
   ) >= 500
   AND encode(
     digest(
       public.catalog_normalize_ingredient_evidence(
         coalesce(
           reviewed.ingredient_override,
           observation.ingredient_text
         )
       ),
       'sha256'
     ),
     'hex'
   ) = reviewed.ingredient_hash
   AND (
     observation.validation_status = 'accepted'
     OR (
       observation.validation_status = 'quarantined'
       AND observation.validation_reasons IN (
         ARRAY['gtin_hard_identity_conflict']::text[],
         ARRAY['ingredient_artifact_gate_failed']::text[]
       )
     )
     OR (
       observation.validation_status = 'rejected'
       AND observation.validation_reasons = ARRAY[
         'official_manufacturer_formula_version_conflict',
         'current_page_and_linked_label_pdf_disagree',
         'exact_current_gtin_formula_evidence_required'
       ]::text[]
       AND reviewed.brand = 'moist and meaty'
     )
   )
   AND NOT public.catalog_has_unbalanced_parentheses(
     coalesce(reviewed.ingredient_override, observation.ingredient_text)
   )
   AND NOT public.catalog_has_ingredient_ocr_artifacts(
     coalesce(reviewed.ingredient_override, observation.ingredient_text)
   );

  IF v_count <> 12 THEN
    RAISE EXCEPTION
      'Expected twelve exact PetSmart source versions, found %',
      v_count;
  END IF;

END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM reviewed_petsmart_source_versions_v180 reviewed
    JOIN public.product_data product
      ON product.cache_key = reviewed.serving_cache_key
    WHERE product.source_url <> reviewed.source_url
      OR encode(
        digest(
          public.catalog_normalize_ingredient_evidence(
            product.ingredient_text
          ),
          'sha256'
        ),
        'hex'
      ) <> reviewed.ingredient_hash
  ) THEN
    RAISE EXCEPTION
      'A selected serving cache key contains a different source version';
  END IF;
END
$$;

INSERT INTO public.product_data (
  cache_key, product_name, brand, ingredients, ingredient_text,
  ingredient_count, source, source_url, scraped_at, expires_at, image_url,
  nutrient_panel, has_published_nutrients, is_complete_food,
  catalog_exclusion_reason, pet_type, source_quality,
  ingredient_verification_status, image_verification_status, verified_at,
  gtin, product_line, flavor, life_stage, food_form, package_size,
  formula_evidence_tier, formula_version_provenance, updated_at
)
SELECT
  reviewed.serving_cache_key,
  coalesce(
    nullif(reviewed.product_name_override, ''),
    nullif(observation.raw_payload->>'product_name', ''),
    observation.product_name
  ),
  reviewed.brand_display,
  public.catalog_split_ingredient_statement(
    coalesce(reviewed.ingredient_override, observation.ingredient_text)
  ),
  coalesce(reviewed.ingredient_override, observation.ingredient_text),
  cardinality(
    public.catalog_split_ingredient_statement(
      coalesce(reviewed.ingredient_override, observation.ingredient_text)
    )
  ),
  'petsmart-exact-source-version-v180',
  reviewed.source_url,
  observation.observed_at,
  observation.observed_at + interval '365 days',
  observation.front_image_url,
  CASE
    WHEN nullif(observation.raw_payload->>'nutrient_panel', '') IS NULL
      THEN '{}'::jsonb
    ELSE jsonb_build_object(
      'verbatim', observation.raw_payload->>'nutrient_panel',
      'source_url', reviewed.source_url
    )
  END,
  nullif(observation.raw_payload->>'nutrient_panel', '') IS NOT NULL,
  true,
  NULL,
  reviewed.pet_type,
  'retailer_verified',
  'retailer_verified',
  'retailer_verified',
  observation.observed_at,
  reviewed.gtin,
  reviewed.product_line,
  nullif(reviewed.flavor, ''),
  reviewed.life_stage,
  reviewed.food_form,
  observation.package_size,
  'retailer_web_version',
  jsonb_build_object(
    'version_status', 'source_versioned',
    'manufacturer_current_equivalence', false,
    'source', 'petsmart-retail-catalog',
    'source_url', reviewed.source_url,
    'captured_at', observation.observed_at,
    'package_gtin', reviewed.gtin,
    'package_size', observation.package_size,
    'front_image_url', observation.front_image_url,
    'ingredient_text_hash', reviewed.ingredient_hash,
    'census_formula_version_key', reviewed.formula_key,
    'source_observation_id', observation.id,
    'reviewed_at', '2026-07-27',
    'review_wave', 'v180',
    'allow_reused_gtin_version', true,
    'gtin_resolution_policy', 'abstain_on_version_conflict',
    'prior_validation_status', observation.validation_status,
    'prior_validation_reasons', observation.validation_reasons,
    'manufacturer_version_conflict',
      observation.validation_reasons
        @> ARRAY['official_manufacturer_formula_version_conflict']::text[],
    'official_corroboration_url',
      reviewed.official_corroboration_url,
    'ingredient_transcription_repaired',
      reviewed.ingredient_override IS NOT NULL
  ),
  now()
FROM reviewed_petsmart_source_versions_v180 reviewed
JOIN public.catalog_observations observation
  ON observation.source_slug = 'petsmart-retail-catalog'
 AND observation.source_external_id = reviewed.source_external_id
 AND observation.gtin = reviewed.gtin
 AND observation.source_url = reviewed.source_url
ON CONFLICT (cache_key) DO UPDATE
SET
  product_name = excluded.product_name,
  brand = excluded.brand,
  ingredients = excluded.ingredients,
  ingredient_text = excluded.ingredient_text,
  ingredient_count = excluded.ingredient_count,
  source = excluded.source,
  source_url = excluded.source_url,
  scraped_at = excluded.scraped_at,
  expires_at = excluded.expires_at,
  image_url = excluded.image_url,
  nutrient_panel = excluded.nutrient_panel,
  has_published_nutrients = excluded.has_published_nutrients,
  is_complete_food = true,
  catalog_exclusion_reason = NULL,
  pet_type = excluded.pet_type,
  source_quality = 'retailer_verified',
  ingredient_verification_status = 'retailer_verified',
  image_verification_status = 'retailer_verified',
  verified_at = excluded.verified_at,
  gtin = excluded.gtin,
  product_line = excluded.product_line,
  flavor = excluded.flavor,
  life_stage = excluded.life_stage,
  food_form = excluded.food_form,
  package_size = excluded.package_size,
  formula_evidence_tier = 'retailer_web_version',
  formula_version_provenance = excluded.formula_version_provenance,
  updated_at = now();

CREATE TEMP TABLE promoted_petsmart_source_versions_v180 (
  gtin text PRIMARY KEY,
  formula_id bigint NOT NULL,
  formula_key text NOT NULL
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.catalog_formulas (
    formula_key, manufacturer, brand, product_name, product_line, pet_type,
    life_stage, food_form, flavor, diet_condition, is_complete_food,
    complete_food_evidence, ingredient_text, ingredients, front_image_url,
    source_url, source_authority, ingredient_verification_status,
    image_verification_status, protected_terms, verification_status, active,
    is_popular_brand, first_observed_at, last_observed_at,
    promoted_cache_key, promoted_at, identity_hash, formula_evidence_tier,
    formula_version_provenance, created_at, updated_at
  )
  SELECT
    reviewed.formula_key,
    reviewed.manufacturer,
    reviewed.brand,
    product.product_name,
    reviewed.product_line,
    reviewed.pet_type,
    reviewed.life_stage,
    reviewed.food_form,
    reviewed.flavor,
    reviewed.diet_condition,
    true,
    'Exact PetSmart product/package page publishes a complete full ingredient statement, exact GTIN, matching front image, species, recipe, form, and package identity. This source version is retained separately from any different manufacturer-current formula.',
    product.ingredient_text,
    product.ingredients,
    product.image_url,
    product.source_url,
    'retailer_verified',
    'retailer_verified',
    'retailer_verified',
    array_remove(ARRAY[
      reviewed.brand,
      reviewed.product_line,
      reviewed.pet_type,
      reviewed.life_stage,
      reviewed.food_form,
      nullif(reviewed.flavor, ''),
      nullif(reviewed.diet_condition, '')
    ]::text[], NULL),
    'verified',
    true,
    true,
    product.scraped_at,
    product.scraped_at,
    product.cache_key,
    now(),
    encode(digest(reviewed.formula_key, 'sha256'), 'hex'),
    'retailer_web_version',
    product.formula_version_provenance,
    now(),
    now()
  FROM reviewed_petsmart_source_versions_v180 reviewed
  JOIN public.product_data product
    ON product.cache_key = reviewed.serving_cache_key
  ON CONFLICT (formula_key) DO UPDATE
  SET
    manufacturer = excluded.manufacturer,
    brand = excluded.brand,
    product_name = excluded.product_name,
    product_line = excluded.product_line,
    pet_type = excluded.pet_type,
    life_stage = excluded.life_stage,
    food_form = excluded.food_form,
    flavor = excluded.flavor,
    diet_condition = excluded.diet_condition,
    is_complete_food = true,
    complete_food_evidence = excluded.complete_food_evidence,
    ingredient_text = excluded.ingredient_text,
    ingredients = excluded.ingredients,
    front_image_url = excluded.front_image_url,
    source_url = excluded.source_url,
    source_authority = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    protected_terms = excluded.protected_terms,
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    last_observed_at = excluded.last_observed_at,
    promoted_cache_key = excluded.promoted_cache_key,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = excluded.formula_version_provenance,
    updated_at = now()
  RETURNING id, formula_key
)
INSERT INTO promoted_petsmart_source_versions_v180 (
  gtin, formula_id, formula_key
)
SELECT reviewed.gtin, inserted.id, inserted.formula_key
FROM inserted
JOIN reviewed_petsmart_source_versions_v180 reviewed
  ON reviewed.formula_key = inserted.formula_key;

INSERT INTO public.catalog_skus (
  formula_id, gtin, package_size, package_count, source_slug,
  source_external_id, source_url, active, first_observed_at,
  last_observed_at, updated_at
)
SELECT
  promoted.formula_id,
  reviewed.gtin,
  observation.package_size,
  1,
  'petsmart-retail-catalog-version-v180',
  reviewed.source_external_id,
  reviewed.source_url,
  true,
  observation.observed_at,
  observation.observed_at,
  now()
FROM reviewed_petsmart_source_versions_v180 reviewed
JOIN promoted_petsmart_source_versions_v180 promoted
  ON promoted.gtin = reviewed.gtin
JOIN public.catalog_observations observation
  ON observation.source_external_id = reviewed.source_external_id
 AND observation.gtin = reviewed.gtin
 AND observation.source_url = reviewed.source_url
ON CONFLICT (source_slug, source_external_id, gtin, package_size)
DO UPDATE SET
  formula_id = excluded.formula_id,
  source_url = excluded.source_url,
  active = true,
  last_observed_at = excluded.last_observed_at,
  updated_at = now();

UPDATE public.catalog_observations observation
SET
  formula_id = promoted.formula_id,
  manufacturer = reviewed.manufacturer,
  brand = reviewed.brand,
  product_line = reviewed.product_line,
  pet_type = reviewed.pet_type,
  life_stage = reviewed.life_stage,
  food_form = reviewed.food_form,
  flavor = reviewed.flavor,
  diet_condition = reviewed.diet_condition,
  ingredient_text =
    coalesce(reviewed.ingredient_override, observation.ingredient_text),
  validation_status = 'accepted',
  validation_reasons = ARRAY[]::text[],
  formula_evidence_tier = 'retailer_web_version',
  formula_version_provenance =
    coalesce(observation.formula_version_provenance, '{}'::jsonb)
    || jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', reviewed.gtin,
      'ingredient_text_hash', reviewed.ingredient_hash,
      'census_formula_version_key', reviewed.formula_key,
      'serving_cache_key', reviewed.serving_cache_key,
      'reviewed_at', '2026-07-27',
      'review_wave', 'v180',
      'allow_reused_gtin_version', true,
      'gtin_resolution_policy', 'abstain_on_version_conflict',
      'official_corroboration_url',
        reviewed.official_corroboration_url
    )
FROM reviewed_petsmart_source_versions_v180 reviewed
JOIN promoted_petsmart_source_versions_v180 promoted
  ON promoted.gtin = reviewed.gtin
WHERE observation.source_external_id = reviewed.source_external_id
  AND observation.gtin = reviewed.gtin
  AND observation.source_url = reviewed.source_url;

DO $$
DECLARE
  v_products integer;
  v_formulas integer;
  v_observations integer;
BEGIN
  SELECT count(*)
  INTO v_products
  FROM reviewed_petsmart_source_versions_v180 reviewed
  JOIN public.product_data product
    ON product.cache_key = reviewed.serving_cache_key
   AND product.gtin = reviewed.gtin
   AND product.formula_evidence_tier = 'retailer_web_version'
   AND encode(
     digest(
       public.catalog_normalize_ingredient_evidence(product.ingredient_text),
       'sha256'
     ),
     'hex'
   ) = reviewed.ingredient_hash
   AND public.catalog_quality_state(
     product.pet_type, product.is_complete_food,
     product.catalog_exclusion_reason, product.ingredient_text,
     coalesce(array_length(product.ingredients, 1), 0),
     product.ingredient_verification_status, product.image_url,
     product.image_verification_status, product.source_url,
     product.expires_at
   ) = 'verified_ready';

  SELECT count(*)
  INTO v_formulas
  FROM reviewed_petsmart_source_versions_v180 reviewed
  JOIN public.catalog_formulas formula
    ON formula.formula_key = reviewed.formula_key
   AND formula.active
   AND formula.verification_status = 'verified'
   AND formula.formula_evidence_tier = 'retailer_web_version'
   AND formula.promoted_cache_key = reviewed.serving_cache_key
   AND encode(
     digest(
       public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
       'sha256'
     ),
     'hex'
   ) = reviewed.ingredient_hash;

  SELECT count(*)
  INTO v_observations
  FROM reviewed_petsmart_source_versions_v180 reviewed
  JOIN public.catalog_observations observation
    ON observation.source_external_id = reviewed.source_external_id
   AND observation.gtin = reviewed.gtin
   AND observation.validation_status = 'accepted'
   AND observation.formula_evidence_tier = 'retailer_web_version'
   AND observation.formula_id IS NOT NULL;

  IF v_products <> 12 OR v_formulas <> 12 OR v_observations <> 12 THEN
    RAISE EXCEPTION
      'v180 source-version promotion failed: products %, formulas %, observations %',
      v_products,
      v_formulas,
      v_observations;
  END IF;
END
$$;

-- Barcode-only lookup must consider catalog SKU/formula versions as well as
-- serving rows. A reused GTIN returns no result until another package signal
-- identifies the exact source version.
CREATE OR REPLACE FUNCTION public.resolve_verified_product_by_gtin(
  q text,
  max_results integer DEFAULT 8
)
RETURNS TABLE(
  cache_key text,
  product_name text,
  brand text,
  gtin text,
  product_line text,
  flavor text,
  life_stage text,
  food_form text,
  package_size text,
  pet_type text,
  ingredient_count integer,
  source text,
  source_quality text,
  ingredient_verification_status text,
  image_verification_status text,
  verified_at timestamptz,
  image_url text,
  ingredients text[],
  ingredient_text text,
  nutritional_info jsonb,
  nutrient_panel jsonb,
  has_published_nutrients boolean,
  source_url text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT candidate.*
  FROM public.resolve_verified_product_by_gtin_unfiltered(
    q,
    max_results
  ) candidate
  WHERE (
    SELECT
      count(DISTINCT public.catalog_normalize_ingredient_evidence(
        evidence.ingredient_text
      )) = 1
      AND bool_or(
        public.catalog_normalize_ingredient_evidence(
          evidence.ingredient_text
        ) = public.catalog_normalize_ingredient_evidence(
          candidate.ingredient_text
        )
      )
    FROM (
      SELECT serving.ingredient_text
      FROM public.product_data serving
      WHERE ltrim(
          regexp_replace(
            coalesce(serving.gtin, ''),
            '[^0-9]',
            '',
            'g'
          ),
          '0'
        ) = ltrim(
          regexp_replace(
            coalesce(candidate.gtin, ''),
            '[^0-9]',
            '',
            'g'
          ),
          '0'
        )
        AND nullif(btrim(serving.ingredient_text), '') IS NOT NULL
        AND serving.ingredient_verification_status IN (
          'gdsn',
          'official',
          'manufacturer',
          'retailer_verified',
          'label_ocr_verified'
        )

      UNION ALL

      SELECT formula.ingredient_text
      FROM public.catalog_skus sku
      JOIN public.catalog_formulas formula
        ON formula.id = sku.formula_id
       AND formula.active
       AND formula.verification_status = 'verified'
      WHERE sku.active
        AND ltrim(
          regexp_replace(coalesce(sku.gtin, ''), '[^0-9]', '', 'g'),
          '0'
        ) = ltrim(
          regexp_replace(
            coalesce(candidate.gtin, ''),
            '[^0-9]',
            '',
            'g'
          ),
          '0'
        )
        AND nullif(btrim(formula.ingredient_text), '') IS NOT NULL
    ) evidence
  );
$$;

REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(
  text,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(
  text,
  integer
) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_verified_product_by_gtin(
  text,
  integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_verified_product_by_gtin(
  text,
  integer
) TO service_role;
