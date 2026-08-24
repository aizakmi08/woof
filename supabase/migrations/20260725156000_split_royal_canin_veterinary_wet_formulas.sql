-- Repair a critical Royal Canin veterinary identity collapse.
--
-- Seventeen exact current manufacturer wet-cat formulas and eleven PetSmart
-- observations had been attached to one broad "Renal Support E" formula. This
-- could make a barcode inherit ingredients from an unrelated prescription
-- diet. Split by exact manufacturer product identity, retain package variants
-- as SKU children only when ingredient evidence agrees, and quarantine the one
-- retailer formula-version conflict.
--
-- Protected exact families include Gastrointestinal Loaf, Gastrointestinal
-- Moderate Calorie, Glycoadvanced, Renal Support D, Renal Support E, Renal
-- Support Early Consult, Satiety Support Weight Management loaf and thin
-- slices, Selected Protein PD, Selected Protein PR, Urinary SO + Calm, Urinary
-- SO + Satiety + Calm, Urinary SO Aging 7+ + Calm, Urinary SO loaf, Urinary SO
-- morsels, Urinary SO Moderate Calorie, and Weight Control loaf.

DO $$
DECLARE
  v_broad_formula_id BIGINT;
  v_active_skus INTEGER;
  v_observations INTEGER;
  v_official_ready INTEGER;
  v_distinct_official_gtins INTEGER;
  v_field_evidence INTEGER;
  v_glyco_legacy_formula_count INTEGER;
BEGIN
  SELECT min(formula_id)
  INTO v_broad_formula_id
  FROM public.catalog_skus
  WHERE source_external_id =
    'royal-canin-mars-petcare:1151551:030111446855'
    AND active;

  IF v_broad_formula_id IS NULL THEN
    RAISE EXCEPTION 'Royal Canin veterinary broad formula not found';
  END IF;

  SELECT count(*)
  INTO v_active_skus
  FROM public.catalog_skus
  WHERE formula_id = v_broad_formula_id
    AND active;

  SELECT count(*)
  INTO v_observations
  FROM public.catalog_observations
  WHERE formula_id = v_broad_formula_id;

  SELECT
    count(*),
    count(DISTINCT regexp_replace(product.gtin, '[^0-9]', '', 'g'))
  INTO v_official_ready, v_distinct_official_gtins
  FROM public.catalog_skus sku
  JOIN public.product_data product
    ON product.cache_key = sku.source_external_id
  WHERE sku.formula_id = v_broad_formula_id
    AND sku.active
    AND sku.source_slug = 'royal-canin-mars-petcare'
    AND product.source_quality = 'manufacturer'
    AND product.pet_type = 'cat'
    AND product.food_form = 'wet'
    AND public.catalog_quality_state(
      product.pet_type,
      product.is_complete_food,
      product.catalog_exclusion_reason,
      product.ingredient_text,
      COALESCE(array_length(product.ingredients, 1), 0),
      product.ingredient_verification_status,
      product.image_url,
      product.image_verification_status,
      product.source_url,
      product.expires_at
    ) = 'verified_ready';

  SELECT count(*)
  INTO v_field_evidence
  FROM public.catalog_field_evidence
  WHERE formula_id = v_broad_formula_id;

  SELECT count(DISTINCT formula_id)
  INTO v_glyco_legacy_formula_count
  FROM public.catalog_skus
  WHERE source_external_id = 'petsmart-retail-catalog:030111482273'
    AND active;

  IF v_active_skus <> 28
      OR v_observations <> 28
      OR v_official_ready <> 17
      OR v_distinct_official_gtins <> 17
      OR v_field_evidence <> 56
      OR v_glyco_legacy_formula_count <> 1 THEN
    RAISE EXCEPTION
      'Royal Canin veterinary split prerequisites failed: formula %, SKUs %, observations %, official %, GTINs %, evidence %, Glyco legacy %',
      v_broad_formula_id,
      v_active_skus,
      v_observations,
      v_official_ready,
      v_distinct_official_gtins,
      v_field_evidence,
      v_glyco_legacy_formula_count;
  END IF;
END $$;

CREATE TEMP TABLE royal_canin_vet_split_context (
  broad_formula_id BIGINT PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO royal_canin_vet_split_context (broad_formula_id)
SELECT min(formula_id)
FROM public.catalog_skus
WHERE source_external_id =
  'royal-canin-mars-petcare:1151551:030111446855'
  AND active;

CREATE TEMP TABLE royal_canin_vet_exact (
  promoted_cache_key TEXT PRIMARY KEY,
  canonical_gtin TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  exact_life_stage TEXT NOT NULL,
  formula_key TEXT NOT NULL UNIQUE,
  identity_hash TEXT NOT NULL UNIQUE,
  formula_id BIGINT
) ON COMMIT DROP;

INSERT INTO royal_canin_vet_exact (
  promoted_cache_key,
  canonical_gtin,
  normalized_name,
  exact_life_stage,
  formula_key,
  identity_hash
)
SELECT
  product.cache_key,
  regexp_replace(product.gtin, '[^0-9]', '', 'g'),
  trim(
    regexp_replace(
      lower(extensions.unaccent(product.product_name)),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  ),
  CASE
    WHEN product.product_name ~* '(aging|adult)[[:space:]]*7[+]'
      THEN 'senior'
    ELSE 'unknown'
  END,
  concat_ws(
    '|',
    'royal canin',
    'royal canin',
    trim(
      regexp_replace(
        lower(extensions.unaccent(product.product_name)),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ),
    'cat',
    CASE
      WHEN product.product_name ~* '(aging|adult)[[:space:]]*7[+]'
        THEN 'senior'
      ELSE 'unknown'
    END,
    'wet',
    '',
    trim(
      regexp_replace(
        lower(extensions.unaccent(product.product_name)),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    )
  ),
  encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          'royal canin',
          'royal canin',
          trim(
            regexp_replace(
              lower(extensions.unaccent(product.product_name)),
              '[^a-z0-9]+',
              ' ',
              'g'
            )
          ),
          'cat',
          CASE
            WHEN product.product_name ~* '(aging|adult)[[:space:]]*7[+]'
              THEN 'senior'
            ELSE 'unknown'
          END,
          'wet',
          '',
          trim(
            regexp_replace(
              lower(extensions.unaccent(product.product_name)),
              '[^a-z0-9]+',
              ' ',
              'g'
            )
          )
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
FROM royal_canin_vet_split_context context
JOIN public.catalog_skus sku
  ON sku.formula_id = context.broad_formula_id
 AND sku.active
 AND sku.source_slug = 'royal-canin-mars-petcare'
JOIN public.product_data product
  ON product.cache_key = sku.source_external_id
WHERE product.source_quality = 'manufacturer'
  AND product.pet_type = 'cat'
  AND product.food_form = 'wet'
  AND public.catalog_quality_state(
    product.pet_type,
    product.is_complete_food,
    product.catalog_exclusion_reason,
    product.ingredient_text,
    COALESCE(array_length(product.ingredients, 1), 0),
    product.ingredient_verification_status,
    product.image_url,
    product.image_verification_status,
    product.source_url,
    product.expires_at
  ) = 'verified_ready';

DO $$
DECLARE
  v_exact_count INTEGER;
  v_senior_count INTEGER;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE exact_life_stage = 'senior')
  INTO v_exact_count, v_senior_count
  FROM royal_canin_vet_exact;

  IF v_exact_count <> 17 OR v_senior_count <> 1 THEN
    RAISE EXCEPTION
      'Royal Canin exact identity extraction failed: exact %, senior %',
      v_exact_count,
      v_senior_count;
  END IF;
END $$;

INSERT INTO public.catalog_formulas (
  formula_key,
  manufacturer,
  brand,
  product_name,
  product_line,
  pet_type,
  life_stage,
  food_form,
  flavor,
  diet_condition,
  is_complete_food,
  complete_food_evidence,
  ingredient_text,
  ingredients,
  front_image_url,
  source_url,
  source_authority,
  ingredient_verification_status,
  image_verification_status,
  protected_terms,
  verification_status,
  active,
  is_popular_brand,
  first_observed_at,
  last_observed_at,
  absent_since,
  promoted_cache_key,
  promoted_at,
  identity_hash,
  created_at,
  updated_at
)
SELECT
  exact.formula_key,
  'royal canin',
  'royal canin',
  official.product_name,
  exact.normalized_name,
  'cat',
  exact.exact_life_stage,
  'wet',
  '',
  exact.normalized_name,
  TRUE,
  'Current exact Royal Canin manufacturer veterinary product evidence',
  official.ingredient_text,
  official.ingredients,
  official.image_url,
  official.source_url,
  'manufacturer',
  'manufacturer',
  'manufacturer',
  ARRAY[
    'royal canin',
    official.product_name,
    'veterinary',
    'cat',
    'wet'
  ]::TEXT[],
  'verified',
  TRUE,
  TRUE,
  COALESCE(official.scraped_at, now()),
  COALESCE(official.scraped_at, now()),
  NULL,
  official.cache_key,
  now(),
  exact.identity_hash,
  now(),
  now()
FROM royal_canin_vet_exact exact
JOIN public.product_data official
  ON official.cache_key = exact.promoted_cache_key
WHERE exact.canonical_gtin <> '030111482274'
ON CONFLICT (formula_key) DO NOTHING;

UPDATE royal_canin_vet_exact exact
SET formula_id = CASE
  WHEN exact.canonical_gtin = '030111482274' THEN (
    SELECT min(sku.formula_id)
    FROM public.catalog_skus sku
    WHERE sku.source_external_id =
      'petsmart-retail-catalog:030111482273'
      AND sku.active
  )
  ELSE (
    SELECT min(formula.id)
    FROM public.catalog_formulas formula
    WHERE formula.formula_key = exact.formula_key
  )
END;

DO $$
DECLARE
  v_resolved INTEGER;
  v_distinct INTEGER;
BEGIN
  SELECT count(*), count(DISTINCT formula_id)
  INTO v_resolved, v_distinct
  FROM royal_canin_vet_exact
  WHERE formula_id IS NOT NULL;

  IF v_resolved <> 17 OR v_distinct <> 17 THEN
    RAISE EXCEPTION
      'Royal Canin exact formula IDs failed: resolved %, distinct %',
      v_resolved,
      v_distinct;
  END IF;
END $$;

-- Existing exact keys are upgraded only with their matching current official
-- row. This keeps the migration safe if a prior partial run created a formula.
UPDATE public.catalog_formulas formula
SET
  formula_key = exact.formula_key,
  manufacturer = 'royal canin',
  brand = 'royal canin',
  product_name = official.product_name,
  product_line = exact.normalized_name,
  pet_type = 'cat',
  life_stage = exact.exact_life_stage,
  food_form = 'wet',
  flavor = '',
  diet_condition = exact.normalized_name,
  is_complete_food = TRUE,
  complete_food_evidence =
    'Current exact Royal Canin manufacturer veterinary product evidence',
  ingredient_text = official.ingredient_text,
  ingredients = official.ingredients,
  front_image_url = official.image_url,
  source_url = official.source_url,
  source_authority = 'manufacturer',
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  protected_terms = ARRAY[
    'royal canin',
    official.product_name,
    'veterinary',
    'cat',
    'wet'
  ]::TEXT[],
  verification_status = 'verified',
  active = TRUE,
  is_popular_brand = TRUE,
  absent_since = NULL,
  last_observed_at = GREATEST(
    formula.last_observed_at,
    COALESCE(official.scraped_at, now())
  ),
  promoted_cache_key = official.cache_key,
  promoted_at = now(),
  identity_hash = exact.identity_hash,
  updated_at = now()
FROM royal_canin_vet_exact exact
JOIN public.product_data official
  ON official.cache_key = exact.promoted_cache_key
WHERE formula.id = exact.formula_id;

-- Manufacturer observations/SKUs map by exact source row.
UPDATE public.catalog_observations observation
SET
  formula_id = exact.formula_id,
  validation_status = 'accepted',
  validation_reasons = array_remove(
    observation.validation_reasons,
    'broad_formula_identity'
  )
FROM royal_canin_vet_exact exact
WHERE observation.source_external_id = exact.promoted_cache_key;

UPDATE public.catalog_skus sku
SET
  formula_id = exact.formula_id,
  active = TRUE,
  updated_at = now()
FROM royal_canin_vet_exact exact
WHERE sku.source_external_id = exact.promoted_cache_key;

-- Glycoadvanced already had a separate retailer formula, but its retailer
-- ingredient text conflicts with the current manufacturer formula. Reuse that
-- durable formula ID after upgrading it above, while quarantining the stale
-- retailer evidence before attaching the exact current official package.
UPDATE public.catalog_observations observation
SET
  formula_id = NULL,
  validation_status = 'quarantined',
  validation_reasons = ARRAY(
    SELECT DISTINCT reason
    FROM unnest(
      COALESCE(observation.validation_reasons, ARRAY[]::TEXT[])
        || ARRAY['current_official_ingredient_formula_conflict']
    ) reason
  ),
  raw_payload = COALESCE(observation.raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'quarantined_at', now(),
      'quarantined_by',
        '20260725156000_split_royal_canin_veterinary_wet_formulas',
      'reason',
        'Glycoadvanced retailer ingredient text conflicts with current official formula'
    )
WHERE observation.source_external_id =
  'petsmart-retail-catalog:030111482273';

UPDATE public.catalog_skus sku
SET
  active = FALSE,
  updated_at = now()
WHERE sku.source_external_id =
  'petsmart-retail-catalog:030111482273';

DELETE FROM public.catalog_field_evidence evidence
USING royal_canin_vet_exact exact
WHERE exact.canonical_gtin = '030111482274'
  AND evidence.formula_id = exact.formula_id
  AND evidence.source_url ILIKE '%petsmart.com%glycoadvanced%';

-- Ten retailer records share exact GTIN identity and exact normalized
-- ingredients with the current official formula. These are safe SKU children.
CREATE TEMP TABLE royal_canin_vet_retailer_matches (
  source_external_id TEXT PRIMARY KEY,
  formula_id BIGINT NOT NULL,
  exact_ingredients BOOLEAN NOT NULL
) ON COMMIT DROP;

INSERT INTO royal_canin_vet_retailer_matches (
  source_external_id,
  formula_id,
  exact_ingredients
)
SELECT
  retailer.cache_key,
  exact.formula_id,
  regexp_replace(
    lower(retailer.ingredient_text),
    '[^a-z0-9]+',
    '',
    'g'
  ) = regexp_replace(
    lower(official.ingredient_text),
    '[^a-z0-9]+',
    '',
    'g'
  )
FROM royal_canin_vet_split_context context
JOIN public.catalog_skus sku
  ON sku.formula_id = context.broad_formula_id
 AND sku.active
 AND sku.source_slug = 'petsmart-retail-catalog'
JOIN public.product_data retailer
  ON retailer.cache_key = sku.source_external_id
JOIN royal_canin_vet_exact exact
  ON exact.canonical_gtin =
    regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g')
JOIN public.product_data official
  ON official.cache_key = exact.promoted_cache_key;

DO $$
DECLARE
  v_retailer_rows INTEGER;
  v_exact_rows INTEGER;
  v_conflicts INTEGER;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE exact_ingredients),
    count(*) FILTER (WHERE NOT exact_ingredients)
  INTO v_retailer_rows, v_exact_rows, v_conflicts
  FROM royal_canin_vet_retailer_matches;

  IF v_retailer_rows <> 11 OR v_exact_rows <> 10 OR v_conflicts <> 1 THEN
    RAISE EXCEPTION
      'Royal Canin retailer evidence changed: rows %, exact %, conflicts %',
      v_retailer_rows,
      v_exact_rows,
      v_conflicts;
  END IF;
END $$;

UPDATE public.catalog_observations observation
SET
  formula_id = match.formula_id,
  validation_status = 'accepted'
FROM royal_canin_vet_retailer_matches match
WHERE observation.source_external_id = match.source_external_id
  AND match.exact_ingredients;

UPDATE public.catalog_skus sku
SET
  formula_id = match.formula_id,
  active = TRUE,
  updated_at = now()
FROM royal_canin_vet_retailer_matches match
WHERE sku.source_external_id = match.source_external_id
  AND match.exact_ingredients;

-- The Aging 7+ retailer text conflicts with current official ingredients.
-- Same GTIN is not enough to cross a formula-version boundary.
UPDATE public.catalog_observations observation
SET
  formula_id = NULL,
  validation_status = 'quarantined',
  validation_reasons = ARRAY(
    SELECT DISTINCT reason
    FROM unnest(
      COALESCE(observation.validation_reasons, ARRAY[]::TEXT[])
        || ARRAY['current_official_ingredient_formula_conflict']
    ) reason
  ),
  raw_payload = COALESCE(observation.raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'quarantined_at', now(),
      'quarantined_by',
        '20260725156000_split_royal_canin_veterinary_wet_formulas',
      'reason',
        'retailer ingredient text conflicts with current official formula'
    )
FROM royal_canin_vet_retailer_matches match
WHERE observation.source_external_id = match.source_external_id
  AND NOT match.exact_ingredients;

UPDATE public.catalog_skus sku
SET
  active = FALSE,
  updated_at = now()
FROM royal_canin_vet_retailer_matches match
WHERE sku.source_external_id = match.source_external_id
  AND NOT match.exact_ingredients;

-- Add all verified package variants published on the same exact official PDP.
-- URL, normalized identity, and ingredient statement must all agree.
INSERT INTO public.catalog_skus (
  formula_id,
  gtin,
  package_size,
  package_count,
  source_slug,
  source_external_id,
  source_url,
  active,
  first_observed_at,
  last_observed_at,
  created_at,
  updated_at
)
SELECT
  exact.formula_id,
  package.gtin,
  COALESCE(package.package_size, ''),
  NULL,
  'royal-canin-mars-petcare',
  package.cache_key,
  package.source_url,
  TRUE,
  COALESCE(package.scraped_at, now()),
  COALESCE(package.scraped_at, now()),
  now(),
  now()
FROM royal_canin_vet_exact exact
JOIN public.product_data official
  ON official.cache_key = exact.promoted_cache_key
JOIN public.product_data package
  ON package.source = 'royal-canin-mars-petcare'
 AND package.source_url = official.source_url
 AND trim(
   regexp_replace(
     lower(extensions.unaccent(package.product_name)),
     '[^a-z0-9]+',
     ' ',
     'g'
   )
 ) = exact.normalized_name
 AND regexp_replace(
   lower(package.ingredient_text),
   '[^a-z0-9]+',
   '',
   'g'
 ) = regexp_replace(
   lower(official.ingredient_text),
   '[^a-z0-9]+',
   '',
   'g'
 )
WHERE public.catalog_quality_state(
    package.pet_type,
    package.is_complete_food,
    package.catalog_exclusion_reason,
    package.ingredient_text,
    COALESCE(array_length(package.ingredients, 1), 0),
    package.ingredient_verification_status,
    package.image_url,
    package.image_verification_status,
    package.source_url,
    package.expires_at
  ) = 'verified_ready'
ON CONFLICT (source_slug, source_external_id, gtin, package_size)
DO UPDATE SET
  formula_id = EXCLUDED.formula_id,
  source_url = EXCLUDED.source_url,
  active = TRUE,
  last_observed_at = EXCLUDED.last_observed_at,
  updated_at = now();

-- Re-home accepted field evidence using the now-exact source URL graph.
UPDATE public.catalog_field_evidence evidence
SET formula_id = source_map.formula_id
FROM (
  SELECT sku.source_url, min(sku.formula_id) AS formula_id
  FROM public.catalog_skus sku
  JOIN royal_canin_vet_exact exact
    ON exact.formula_id = sku.formula_id
  WHERE sku.active
  GROUP BY sku.source_url
  HAVING count(DISTINCT sku.formula_id) = 1
) source_map,
royal_canin_vet_split_context context
WHERE evidence.formula_id = context.broad_formula_id
  AND evidence.source_url = source_map.source_url;

-- Evidence remaining on the broad row belongs to the quarantined retailer
-- formula-version conflict and must not be accepted by any exact formula.
DELETE FROM public.catalog_field_evidence evidence
USING royal_canin_vet_split_context context
WHERE evidence.formula_id = context.broad_formula_id;

-- Historical broad review/census links are unsafe to assign to one prescription
-- formula. The next census will create exact members.
UPDATE public.catalog_manual_evidence_reviews review
SET
  formula_id = NULL,
  updated_at = now()
FROM royal_canin_vet_split_context context
WHERE review.formula_id = context.broad_formula_id;

UPDATE public.catalog_census_formula_members member
SET formula_id = NULL
FROM royal_canin_vet_split_context context
WHERE member.formula_id = context.broad_formula_id;

DELETE FROM public.catalog_formula_aliases alias
USING royal_canin_vet_split_context context
WHERE alias.formula_id = context.broad_formula_id;

UPDATE public.catalog_formulas broad
SET
  active = FALSE,
  verification_status = 'discovered',
  promoted_cache_key = NULL,
  promoted_at = NULL,
  absent_since = now(),
  updated_at = now()
FROM royal_canin_vet_split_context context
WHERE broad.id = context.broad_formula_id;

-- Manufacturer package variants and exact retailer aliases remain in the SKU
-- ledger but not as independent serving rows.
UPDATE public.product_data duplicate
SET
  catalog_exclusion_reason = 'duplicate_canonical_formula_sku_variant',
  updated_at = now()
FROM royal_canin_vet_exact exact
JOIN public.product_data official
  ON official.cache_key = exact.promoted_cache_key
WHERE (
    duplicate.source = 'royal-canin-mars-petcare'
    AND duplicate.source_url = official.source_url
    AND duplicate.cache_key <> official.cache_key
    AND trim(
      regexp_replace(
        lower(extensions.unaccent(duplicate.product_name)),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ) = exact.normalized_name
    AND regexp_replace(
      lower(duplicate.ingredient_text),
      '[^a-z0-9]+',
      '',
      'g'
    ) = regexp_replace(
      lower(official.ingredient_text),
      '[^a-z0-9]+',
      '',
      'g'
    )
  )
  OR duplicate.cache_key IN (
    SELECT match.source_external_id
    FROM royal_canin_vet_retailer_matches match
    WHERE match.exact_ingredients
  );

UPDATE public.product_data conflict
SET
  catalog_exclusion_reason = 'formula_version_conflict_quarantined',
  updated_at = now()
WHERE conflict.cache_key IN (
  SELECT match.source_external_id
  FROM royal_canin_vet_retailer_matches match
  WHERE NOT match.exact_ingredients
)
OR conflict.cache_key = 'petsmart-retail-catalog:030111482273';

-- A stale older manufacturer route shares the current barcode but has
-- unverified, differing ingredients. Preserve it as evidence history only.
UPDATE public.product_data stale
SET
  catalog_exclusion_reason =
    'superseded_formula_version_official_manufacturer_canonical',
  updated_at = now()
WHERE stale.cache_key =
  'royal-canin-mars-petcare:324590:030111446855'
  AND stale.ingredient_verification_status = 'unverified';

UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = COALESCE(
    NULLIF(evidence.rejection_reason, ''),
    product.catalog_exclusion_reason
  ),
  evidence = COALESCE(evidence.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'reconciled_at', now(),
      'reconciled_by',
        '20260725156000_split_royal_canin_veterinary_wet_formulas',
      'reason',
        product.catalog_exclusion_reason
    ),
  updated_at = now()
FROM public.product_data product
WHERE evidence.cache_key = product.cache_key
  AND product.catalog_exclusion_reason IN (
    'duplicate_canonical_formula_sku_variant',
    'formula_version_conflict_quarantined',
    'superseded_formula_version_official_manufacturer_canonical'
  )
  AND product.cache_key IN (
    SELECT sku.source_external_id
    FROM public.catalog_skus sku
    JOIN royal_canin_vet_exact exact
      ON exact.formula_id = sku.formula_id
    UNION
    SELECT match.source_external_id
    FROM royal_canin_vet_retailer_matches match
    UNION
    SELECT 'petsmart-retail-catalog:030111482273'
    UNION
    SELECT 'royal-canin-mars-petcare:324590:030111446855'
  );

SELECT public.close_stale_catalog_acquisition_queue_gaps(now())
  AS stale_close_result;
SELECT public.refresh_catalog_acquisition_queue(30, 5000)
  AS refresh_result;

DO $$
DECLARE
  v_exact_formulas INTEGER;
  v_original_active_mapped INTEGER;
  v_original_quarantined INTEGER;
  v_manufacturer_skus INTEGER;
  v_broad_skus INTEGER;
  v_broad_observations INTEGER;
  v_broad_evidence INTEGER;
  v_gtin_conflicts INTEGER;
  v_calm_resolution INTEGER;
  v_calm_wrong_resolution INTEGER;
  v_aging_resolution INTEGER;
  v_glyco_resolution INTEGER;
BEGIN
  SELECT count(*)
  INTO v_exact_formulas
  FROM royal_canin_vet_exact exact
  JOIN public.catalog_formulas formula
    ON formula.id = exact.formula_id
  WHERE formula.active
    AND formula.verification_status = 'verified'
    AND formula.source_authority = 'manufacturer'
    AND formula.promoted_cache_key = exact.promoted_cache_key
    AND formula.identity_hash = exact.identity_hash;

  SELECT count(*)
  INTO v_original_active_mapped
  FROM public.catalog_skus sku
  JOIN royal_canin_vet_exact exact
    ON exact.formula_id = sku.formula_id
  WHERE sku.active
    AND (
      sku.source_external_id = exact.promoted_cache_key
      OR sku.source_external_id IN (
        SELECT match.source_external_id
        FROM royal_canin_vet_retailer_matches match
        WHERE match.exact_ingredients
      )
    );

  SELECT count(*)
  INTO v_original_quarantined
  FROM public.catalog_skus sku
  JOIN royal_canin_vet_retailer_matches match
    ON match.source_external_id = sku.source_external_id
   AND NOT match.exact_ingredients
  WHERE NOT sku.active;

  SELECT count(*)
  INTO v_manufacturer_skus
  FROM public.catalog_skus sku
  JOIN royal_canin_vet_exact exact
    ON exact.formula_id = sku.formula_id
  WHERE sku.active
    AND sku.source_slug = 'royal-canin-mars-petcare';

  SELECT count(*)
  INTO v_broad_skus
  FROM royal_canin_vet_split_context context
  JOIN public.catalog_skus sku
    ON sku.formula_id = context.broad_formula_id
   AND sku.active;

  SELECT count(*)
  INTO v_broad_observations
  FROM royal_canin_vet_split_context context
  JOIN public.catalog_observations observation
    ON observation.formula_id = context.broad_formula_id;

  SELECT count(*)
  INTO v_broad_evidence
  FROM royal_canin_vet_split_context context
  JOIN public.catalog_field_evidence evidence
    ON evidence.formula_id = context.broad_formula_id;

  SELECT count(*)
  INTO v_gtin_conflicts
  FROM (
    SELECT regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g')
    FROM public.catalog_skus sku
    JOIN royal_canin_vet_exact exact
      ON exact.formula_id = sku.formula_id
    WHERE sku.active
    GROUP BY regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g')
    HAVING count(DISTINCT sku.formula_id) <> 1
  ) conflict;

  SELECT count(DISTINCT cache_key)
  INTO v_calm_resolution
  FROM public.resolve_verified_product_by_gtin('030111446855', 8)
  WHERE product_name = 'Feline URINARY SO + CALM thin slices in gravy'
    AND cache_key =
      'royal-canin-mars-petcare:1151551:030111446855';

  SELECT count(*)
  INTO v_calm_wrong_resolution
  FROM public.resolve_verified_product_by_gtin('030111446855', 8)
  WHERE product_name ILIKE '%Renal Support E%';

  SELECT count(DISTINCT cache_key)
  INTO v_aging_resolution
  FROM public.resolve_verified_product_by_gtin('030111443144', 8)
  WHERE product_name =
    'Feline Urinary SO® Aging 7+ + Calm loaf in sauce'
    AND cache_key =
      'royal-canin-mars-petcare:312018:030111443144';

  SELECT count(DISTINCT cache_key)
  INTO v_glyco_resolution
  FROM public.resolve_verified_product_by_gtin('030111482273', 8)
  WHERE product_name = 'Feline Glycoadvanced Loaf in Sauce'
    AND cache_key =
      'royal-canin-mars-petcare:1336396:030111482274';

  IF v_exact_formulas <> 17
      OR v_original_active_mapped <> 27
      OR v_original_quarantined <> 1
      OR v_manufacturer_skus < 17
      OR v_broad_skus <> 0
      OR v_broad_observations <> 0
      OR v_broad_evidence <> 0
      OR v_gtin_conflicts <> 0
      OR v_calm_resolution <> 1
      OR v_calm_wrong_resolution <> 0
      OR v_aging_resolution <> 1
      OR v_glyco_resolution <> 1 THEN
    RAISE EXCEPTION
      'Royal Canin veterinary split failed: formulas %, mapped %, quarantined %, manufacturer SKUs %, broad S/O/E %/%/%, GTIN conflicts %, calm right/wrong %/%, aging %, Glyco %',
      v_exact_formulas,
      v_original_active_mapped,
      v_original_quarantined,
      v_manufacturer_skus,
      v_broad_skus,
      v_broad_observations,
      v_broad_evidence,
      v_gtin_conflicts,
      v_calm_resolution,
      v_calm_wrong_resolution,
      v_aging_resolution,
      v_glyco_resolution;
  END IF;
END $$;
