-- Repair missing serving/canonical food-form metadata for 135 exact current
-- Weruva formulas. The August 4 official Shopify extraction proved the exact
-- cache key, GTIN, manufacturer PDP, full ingredients, and matching front
-- image before these targets were selected. Three unsafe rows were excluded:
-- two lack one unique canonical formula, and one collides across the visible
-- Pumpkin/Veggies recipe boundary.
--
-- Evidence artifacts:
--   outputs/catalog-source-imports/weruva-window-0-250/sql/manifest.json
--     sha256 2d8bd03153ac7ccbad04bf7c6449059b5ce7e44f54b147b1672467445fde0bfd
--   outputs/catalog-exact-official-metadata-repair/weruva-20260804/repair-plan.json
--     sha256 1395c382357e452f992e75de4480ac74b3ad7aeb296edf005f276aae36d8c2d3
--   outputs/catalog-exact-official-metadata-repair/weruva-20260804/migration-payload.json
--     sha256 d1afbe3c1003b4f6131e0565712a539392321df334c204b3b4a7c18d2a1950a6
--
-- This migration does not alter ingredients, images, GTINs, names, flavor,
-- species, life stage, or evidence tiers. It fails closed unless every target
-- still has one exact canonical formula, one exact accepted observation, and
-- an active exact-GTIN SKU with identical ingredient/image/source evidence.

CREATE TEMP TABLE tmp_weruva_food_form_targets (
  cache_key TEXT PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO tmp_weruva_food_form_targets (cache_key)
SELECT jsonb_array_elements_text(
  convert_from(
    decode(
      'WyJ3ZXJ1dmE6ODc4NDA4MDAwMzQ4Iiwid2VydXZhOjg3ODQwODAwNjE0MiIsIndlcnV2YTo4MTAwMjgyNDM0NTMiLCJ3ZXJ1dmE6ODc4NDA4MDAwMTMzIiwid2VydXZhOjgxMDE5MjgxMTA2OSIsIndlcnV2YTo4Nzg0MDgwMDYyMjciLCJ3ZXJ1dmE6ODEwMDI4MjQzNDIyIiwid2VydXZhOjgxMzc3ODAxNDA3NiIsIndlcnV2YTo4MTM3NzgwMTU2NjAiLCJ3ZXJ1dmE6ODEwMDA2NDcxMDY5Iiwid2VydXZhOjgxMDAwNjQ3MTA4MyIsIndlcnV2YTo4MTAwMDY0NzEwNzYiLCJ3ZXJ1dmE6ODEwMDA2NDcxMDQ1Iiwid2VydXZhOjgxMDAwNjQ3MTA5MCIsIndlcnV2YTo4MTAwMjgyNDUxODEiLCJ3ZXJ1dmE6ODEzNzc4MDE0MTIwIiwid2VydXZhOjgxMzc3ODAxNDExMyIsIndlcnV2YTo4MTM3NzgwMTY1OTkiLCJ3ZXJ1dmE6ODEzNzc4MDE1Njg0Iiwid2VydXZhOjgxMzc3ODAxNDEwNiIsIndlcnV2YTo4MTM3NzgwMTQ2NTYiLCJ3ZXJ1dmE6ODEwMDI4MjQyNzc3Iiwid2VydXZhOjgxMzc3ODAxNDY3MCIsIndlcnV2YTo4MTM3NzgwMTY2MDUiLCJ3ZXJ1dmE6ODEzNzc4MDE0NjI1Iiwid2VydXZhOjgxMDAyODI0MjczOSIsIndlcnV2YTo4Nzg0MDgwMDkwMjAiLCJ3ZXJ1dmE6ODc4NDA4MDA2MTA0Iiwid2VydXZhOjgxMDAyODI0NTEyOSIsIndlcnV2YTo4MTAwMjgyNDUyMTEiLCJ3ZXJ1dmE6ODEzNzc4MDE0MDgzIiwid2VydXZhOjgxMzc3ODAxNTY1MyIsIndlcnV2YTo4MTM3NzgwMTg4NDUiLCJ3ZXJ1dmE6ODc4NDA4MDA4NDc0Iiwid2VydXZhOjg3ODQwODAwNDgxMCIsIndlcnV2YTo4Nzg0MDgwMDAzMzEiLCJ3ZXJ1dmE6ODc4NDA4MDA2MTM1Iiwid2VydXZhOjgxMDAyODI0MzMwOSIsIndlcnV2YTo4Nzg0MDgwMDQyODUiLCJ3ZXJ1dmE6ODc4NDA4MDA4Mzk5Iiwid2VydXZhOjg3ODQwODAwNDgyNyIsIndlcnV2YTo4Nzg0MDgwMDAzMjQiLCJ3ZXJ1dmE6ODc4NDA4MDA0NTEzIiwid2VydXZhOjgxMDAyODI0MzM5MiIsIndlcnV2YTo4Nzg0MDgwMDAzNTUiLCJ3ZXJ1dmE6ODc4NDA4MDA0NTIwIiwid2VydXZhOjg3ODQwODAwNDI0NyIsIndlcnV2YTo4Nzg0MDgwMDQ1NTEiLCJ3ZXJ1dmE6ODc4NDA4MDA2MTk3Iiwid2VydXZhOjgxMDAyODI0MzM2MSIsIndlcnV2YTo4MTM3NzgwMTg0NDkiLCJ3ZXJ1dmE6ODc4NDA4MDA0Mjc4Iiwid2VydXZhOjgxMDAyODI0NDE4NCIsIndlcnV2YTo4MTAwMjgyNDQyNzYiLCJ3ZXJ1dmE6ODc4NDA4MDA4NDA1Iiwid2VydXZhOjg3ODQwODAwODM4MiIsIndlcnV2YTo4MTM3NzgwMTU2MzkiLCJ3ZXJ1dmE6ODc4NDA4MDA4NTA0Iiwid2VydXZhOjgxMDAyODI0NDIxNCIsIndlcnV2YTo4Nzg0MDgwMDQ4MzQiLCJ3ZXJ1dmE6ODEzNzc4MDE4ODkwIiwid2VydXZhOjg3ODQwODAwNDc5NyIsIndlcnV2YTo4Nzg0MDgwMDAxNDAiLCJ3ZXJ1dmE6ODc4NDA4MDAwMTI2Iiwid2VydXZhOjg3ODQwODAwNjIxMCIsIndlcnV2YTo4MTM3NzgwMTg4NzYiLCJ3ZXJ1dmE6ODEzNzc4MDE4NDMyIiwid2VydXZhOjg3ODQwODAwNDI2MSIsIndlcnV2YTo4Nzg0MDgwMDAxNjQiLCJ3ZXJ1dmE6ODc4NDA4MDA0MjU0Iiwid2VydXZhOjgxMzc3ODAxODQ1NiIsIndlcnV2YTo4Nzg0MDgwMDAxNzEiLCJ3ZXJ1dmE6ODc4NDA4MDA0MjA5Iiwid2VydXZhOjg3ODQwODAwMDExOSIsIndlcnV2YTo4MTAwMjgyNDcxNDciLCJ3ZXJ1dmE6ODEwMDI4MjQ3MTIzIiwid2VydXZhOjgxMDAyODI0NzEzMCIsIndlcnV2YTo4MTAwMjgyNDcxNTQiLCJ3ZXJ1dmE6ODc4NDA4MDAwMzE3Iiwid2VydXZhOjg3ODQwODAwNjExMSIsIndlcnV2YTo4MTAwMjgyNDMyODYiLCJ3ZXJ1dmE6ODEwMDI4MjQ1MTUwIiwid2VydXZhOjg3ODQwODAwNDE5MyIsIndlcnV2YTo4Nzg0MDgwMDQ1MzciLCJ3ZXJ1dmE6ODc4NDA4MDAwMTg4Iiwid2VydXZhOjgxMzc3ODAxODQ2MyIsIndlcnV2YTo4Nzg0MDgwMDQyMzAiLCJ3ZXJ1dmE6ODc4NDA4MDA0MjIzIiwid2VydXZhOjgxMzc3ODAxNTY3NyIsIndlcnV2YTo4MTAwMjgyNDYzNTUiLCJ3ZXJ1dmE6ODEwMDI4MjQxMzUwIiwid2VydXZhOjgxMDAyODI0MTMxMiIsIndlcnV2YTo4MTAwMjgyNDEzNDMiLCJ3ZXJ1dmE6ODEzNzc4MDExMDgyIiwid2VydXZhOjgxMzc3ODAxMTAyMCIsIndlcnV2YTo4MTM3NzgwMTEwOTkiLCJ3ZXJ1dmE6ODEzNzc4MDExMTA1Iiwid2VydXZhOjgxMzc3ODAxMTA1MSIsIndlcnV2YTo4MTM3NzgwMTEwMTMiLCJ3ZXJ1dmE6ODEzNzc4MDExMjI4Iiwid2VydXZhOjgxMzc3ODAxMTA3NSIsIndlcnV2YTo4MTM3NzgwMTExMjkiLCJ3ZXJ1dmE6ODEzNzc4MDE5NzI5Iiwid2VydXZhOjgxMzc3ODAxOTczNiIsIndlcnV2YTo4MTM3NzgwMTk3NTAiLCJ3ZXJ1dmE6ODc4NDA4MDA4NDk4Iiwid2VydXZhOjg3ODQwODAwNDIxNiIsIndlcnV2YTo4Nzg0MDgwMDYxODAiLCJ3ZXJ1dmE6ODEwMDI4MjQzMzMwIiwid2VydXZhOjgxMzc3ODAxODE3MyIsIndlcnV2YTo4MTM3NzgwMTgxNjYiLCJ3ZXJ1dmE6ODEzNzc4MDE4MTQyIiwid2VydXZhOjgxMzc3ODAxODEzNSIsIndlcnV2YTo4Nzg0MDgwMDQ1NDQiLCJ3ZXJ1dmE6ODc4NDA4MDA5MDM3Iiwid2VydXZhOjg3ODQwODAwNDg0MSIsIndlcnV2YTo4MTM3NzgwMTg0MTgiLCJ3ZXJ1dmE6ODEzNzc4MDE3MTgzIiwid2VydXZhOjgxMzc3ODAxNjEyNCIsIndlcnV2YTo4Nzg0MDgwMDExOTIiLCJ3ZXJ1dmE6ODc4NDA4MDAxMjIyIiwid2VydXZhOjgxMzc3ODAxNzIwNiIsIndlcnV2YTo4MTM3NzgwMTYxNDgiLCJ3ZXJ1dmE6ODc4NDA4MDAxMjM5Iiwid2VydXZhOjgxMzc3ODAxNzIyMCIsIndlcnV2YTo4MTM3NzgwMTYxMTciLCJ3ZXJ1dmE6ODEzNzc4MDE3MTc2Iiwid2VydXZhOjgxMzc3ODAxNjA5NCIsIndlcnV2YTo4Nzg0MDgwMDEyMTUiLCJ3ZXJ1dmE6ODEwMDI4MjQyNzYwIiwid2VydXZhOjgxMzc3ODAxNjEzMSIsIndlcnV2YTo4Nzg0MDgwMDA5OTciLCJ3ZXJ1dmE6ODEzNzc4MDE3MjEzIiwid2VydXZhOjg3ODQwODAwMDk4MCIsIndlcnV2YTo4Nzg0MDgwMDEyMDgiXQ==',
      'base64'
    ),
    'UTF8'
  )::JSONB
);

DO $preconditions$
DECLARE
  v_bad_count INTEGER;
BEGIN
  IF (SELECT count(*) FROM tmp_weruva_food_form_targets) <> 135 THEN
    RAISE EXCEPTION 'Weruva repair target count changed';
  END IF;

  SELECT count(*) INTO v_bad_count
  FROM tmp_weruva_food_form_targets target
  LEFT JOIN public.product_data serving
    ON serving.cache_key = target.cache_key
  WHERE serving.cache_key IS NULL
     OR lower(serving.brand) <> 'weruva'
     OR serving.pet_type NOT IN ('dog', 'cat')
     OR COALESCE(NULLIF(btrim(lower(serving.food_form)), ''), 'unknown') <> 'unknown'
     OR serving.formula_evidence_tier <> 'manufacturer_current_exact'
     OR serving.source_quality <> 'manufacturer'
     OR serving.ingredient_verification_status <> 'manufacturer'
     OR serving.image_verification_status <> 'manufacturer'
     OR NOT serving.is_complete_food
     OR serving.catalog_exclusion_reason IS NOT NULL
     OR NULLIF(btrim(serving.gtin), '') IS NULL
     OR NULLIF(btrim(serving.source_url), '') IS NULL
     OR NULLIF(btrim(serving.image_url), '') IS NULL
     OR COALESCE(
          serving.formula_version_provenance->>'ingredient_text_hash',
          ''
        ) <> encode(
          digest(
            public.catalog_normalize_ingredient_evidence(serving.ingredient_text),
            'sha256'
          ),
          'hex'
        );
  IF v_bad_count <> 0 THEN
    RAISE EXCEPTION 'Weruva serving preconditions failed for % targets', v_bad_count;
  END IF;
END
$preconditions$;

CREATE TEMP TABLE tmp_weruva_formula_candidates ON COMMIT DROP AS
SELECT
  target.cache_key,
  serving.gtin,
  serving.source_url,
  serving.image_url,
  serving.ingredient_text,
  serving.pet_type,
  serving.life_stage,
  formula.id AS formula_id,
  formula.formula_key AS old_formula_key,
  formula.food_form AS old_formula_form,
  CASE
    WHEN lower(formula.food_form) = 'wet' THEN formula.formula_key
    ELSE concat_ws(
      '|',
      split_part(formula.formula_key, '|', 1),
      split_part(formula.formula_key, '|', 2),
      split_part(formula.formula_key, '|', 3),
      split_part(formula.formula_key, '|', 4),
      split_part(formula.formula_key, '|', 5),
      'wet',
      split_part(formula.formula_key, '|', 7),
      split_part(formula.formula_key, '|', 8)
    )
  END AS new_formula_key
FROM tmp_weruva_food_form_targets target
JOIN public.product_data serving
  ON serving.cache_key = target.cache_key
JOIN public.catalog_formulas formula
  ON formula.source_url = serving.source_url
 AND lower(formula.brand) = lower(serving.brand)
 AND formula.pet_type = serving.pet_type
 AND formula.front_image_url = serving.image_url
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_evidence_tier = 'manufacturer_current_exact'
 AND public.catalog_normalize_ingredient_evidence(formula.ingredient_text) =
     public.catalog_normalize_ingredient_evidence(serving.ingredient_text);

DO $formula_guards$
BEGIN
  IF EXISTS (
    SELECT target.cache_key
    FROM tmp_weruva_food_form_targets target
    LEFT JOIN tmp_weruva_formula_candidates candidate USING (cache_key)
    GROUP BY target.cache_key
    HAVING count(candidate.formula_id) <> 1
  ) THEN
    RAISE EXCEPTION 'Weruva target lost its one unique exact canonical formula';
  END IF;

  IF (SELECT count(*) FROM tmp_weruva_formula_candidates) <> 135
     OR (SELECT count(DISTINCT formula_id) FROM tmp_weruva_formula_candidates) <> 135 THEN
    RAISE EXCEPTION 'Weruva formula target cardinality changed';
  END IF;

  IF (SELECT count(*) FROM tmp_weruva_formula_candidates WHERE old_formula_form IN ('', 'unknown')) <> 45
     OR (SELECT count(*) FROM tmp_weruva_formula_candidates WHERE lower(old_formula_form) = 'wet') <> 90 THEN
    RAISE EXCEPTION 'Weruva formula food-form baseline changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_formula_candidates candidate
    WHERE candidate.old_formula_form NOT IN ('', 'unknown', 'wet')
       OR array_length(string_to_array(candidate.old_formula_key, '|'), 1) <> 8
       OR EXISTS (
         SELECT 1
         FROM public.catalog_formulas other
         WHERE other.formula_key = candidate.new_formula_key
           AND other.id <> candidate.formula_id
       )
       OR EXISTS (
         SELECT 1
         FROM public.catalog_formula_aliases alias
         WHERE alias.alias_formula_key = candidate.old_formula_key
           AND alias.formula_id <> candidate.formula_id
       )
       OR (
         (SELECT promoted_cache_key FROM public.catalog_formulas WHERE id = candidate.formula_id)
         IS NOT NULL
         AND (SELECT promoted_cache_key FROM public.catalog_formulas WHERE id = candidate.formula_id)
             <> candidate.cache_key
       )
  ) THEN
    RAISE EXCEPTION 'Weruva formula collision or incompatible identity detected';
  END IF;
END
$formula_guards$;

CREATE TEMP TABLE tmp_weruva_repair_map ON COMMIT DROP AS
SELECT
  candidate.*,
  observation.id AS observation_id
FROM tmp_weruva_formula_candidates candidate
JOIN public.catalog_observations observation
  ON observation.formula_id = candidate.formula_id
 AND observation.source_url = candidate.source_url
 AND observation.front_image_url = candidate.image_url
 AND regexp_replace(COALESCE(observation.gtin, ''), '\D', '', 'g') =
     regexp_replace(COALESCE(candidate.gtin, ''), '\D', '', 'g')
 AND observation.validation_status = 'accepted'
 AND observation.formula_evidence_tier = 'manufacturer_current_exact'
 AND public.catalog_normalize_ingredient_evidence(observation.ingredient_text) =
     public.catalog_normalize_ingredient_evidence(candidate.ingredient_text);

DO $observation_guards$
BEGIN
  IF EXISTS (
    SELECT candidate.cache_key
    FROM tmp_weruva_formula_candidates candidate
    LEFT JOIN tmp_weruva_repair_map repair USING (cache_key)
    GROUP BY candidate.cache_key
    HAVING count(repair.observation_id) <> 1
  ) OR (SELECT count(*) FROM tmp_weruva_repair_map) <> 135 THEN
    RAISE EXCEPTION 'Weruva target lost its one unique accepted observation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_weruva_repair_map repair
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.catalog_skus sku
      WHERE sku.formula_id = repair.formula_id
        AND sku.active
        AND regexp_replace(COALESCE(sku.gtin, ''), '\D', '', 'g') =
            regexp_replace(COALESCE(repair.gtin, ''), '\D', '', 'g')
    )
  ) THEN
    RAISE EXCEPTION 'Weruva target lost its exact active GTIN SKU';
  END IF;
END
$observation_guards$;

UPDATE public.product_data serving
SET food_form = 'wet',
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'weruva_food_form_repair_20260804',
        jsonb_build_object(
          'status', 'exact_current_official_metadata_repaired',
          'field', 'food_form',
          'value', 'wet',
          'source_url', repair.source_url,
          'source_captured_at', '2026-08-04T14:29:38.621Z',
          'manifest_sha256',
            '2d8bd03153ac7ccbad04bf7c6449059b5ce7e44f54b147b1672467445fde0bfd',
          'repair_plan_sha256',
            '1395c382357e452f992e75de4480ac74b3ad7aeb296edf005f276aae36d8c2d3',
          'reconciled_at', now()
        )
      ),
    updated_at = now()
FROM tmp_weruva_repair_map repair
WHERE serving.cache_key = repair.cache_key;

UPDATE public.catalog_formulas formula
SET formula_key = repair.new_formula_key,
    food_form = 'wet',
    promoted_cache_key = repair.cache_key,
    promoted_at = COALESCE(formula.promoted_at, now()),
    identity_hash = encode(digest(repair.new_formula_key, 'sha256'), 'hex'),
    protected_terms = ARRAY(
      SELECT DISTINCT lower(term)
      FROM unnest(COALESCE(formula.protected_terms, ARRAY[]::TEXT[]) || ARRAY['wet']) term
      WHERE NULLIF(btrim(term), '') IS NOT NULL
      ORDER BY lower(term)
    ),
    last_observed_at = GREATEST(
      formula.last_observed_at,
      '2026-08-04T14:29:38.621Z'::TIMESTAMPTZ
    ),
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'weruva_food_form_repair_20260804',
        jsonb_build_object(
          'status', 'exact_current_official_metadata_repaired',
          'old_formula_key', repair.old_formula_key,
          'canonical_formula_key', repair.new_formula_key,
          'source_url', repair.source_url,
          'source_captured_at', '2026-08-04T14:29:38.621Z',
          'repair_plan_sha256',
            '1395c382357e452f992e75de4480ac74b3ad7aeb296edf005f276aae36d8c2d3',
          'reconciled_at', now()
        )
      ),
    updated_at = now()
FROM tmp_weruva_repair_map repair
WHERE formula.id = repair.formula_id;

UPDATE public.catalog_observations observation
SET food_form = 'wet',
    observed_at = GREATEST(
      observation.observed_at,
      '2026-08-04T14:29:38.621Z'::TIMESTAMPTZ
    ),
    raw_payload = COALESCE(observation.raw_payload, '{}'::JSONB)
      || jsonb_build_object(
        'identity_metadata_repair',
        jsonb_build_object(
          'field', 'food_form',
          'value', 'wet',
          'repair_plan_sha256',
            '1395c382357e452f992e75de4480ac74b3ad7aeb296edf005f276aae36d8c2d3',
          'reconciled_at', now()
        )
      )
FROM tmp_weruva_repair_map repair
WHERE observation.id = repair.observation_id;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
)
SELECT
  repair.old_formula_key,
  repair.formula_id,
  encode(digest(repair.old_formula_key, 'sha256'), 'hex'),
  'same_source_identity',
  repair.source_url,
  jsonb_build_object(
    'reason', 'missing_food_form_repaired_from_exact_current_official_page',
    'canonical_formula_key', repair.new_formula_key,
    'repair_plan_sha256',
      '1395c382357e452f992e75de4480ac74b3ad7aeb296edf005f276aae36d8c2d3',
    'reviewed_at', now()
  )
FROM tmp_weruva_repair_map repair
WHERE repair.old_formula_key <> repair.new_formula_key
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = excluded.match_reason,
    source_url = excluded.source_url,
    metadata = public.catalog_formula_aliases.metadata || excluded.metadata,
    updated_at = now();

INSERT INTO public.catalog_field_evidence (
  formula_id,
  observation_id,
  field_name,
  field_value,
  source_url,
  source_authority,
  accepted,
  observed_at,
  content_hash
)
SELECT
  repair.formula_id,
  repair.observation_id,
  'food_form',
  to_jsonb('wet'::TEXT),
  repair.source_url,
  'manufacturer',
  TRUE,
  '2026-08-04T14:29:38.621Z'::TIMESTAMPTZ,
  encode(
    digest(
      repair.cache_key || '|food_form|wet|'
      || '1395c382357e452f992e75de4480ac74b3ad7aeb296edf005f276aae36d8c2d3',
      'sha256'
    ),
    'hex'
  )
FROM tmp_weruva_repair_map repair
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = excluded.observation_id,
    field_value = excluded.field_value,
    source_authority = excluded.source_authority,
    accepted = TRUE,
    observed_at = excluded.observed_at;

DO $postconditions$
BEGIN
  IF (SELECT count(*) FROM public.product_data serving
      JOIN tmp_weruva_repair_map repair USING (cache_key)
      WHERE serving.food_form = 'wet'
        AND serving.formula_version_provenance ? 'weruva_food_form_repair_20260804') <> 135 THEN
    RAISE EXCEPTION 'Weruva serving postcondition failed';
  END IF;

  IF (SELECT count(*) FROM public.catalog_formulas formula
      JOIN tmp_weruva_repair_map repair ON repair.formula_id = formula.id
      WHERE formula.food_form = 'wet'
        AND formula.formula_key = repair.new_formula_key
        AND formula.identity_hash = encode(digest(repair.new_formula_key, 'sha256'), 'hex')
        AND formula.promoted_cache_key = repair.cache_key
        AND formula.formula_version_provenance ? 'weruva_food_form_repair_20260804') <> 135 THEN
    RAISE EXCEPTION 'Weruva canonical formula postcondition failed';
  END IF;

  IF (SELECT count(*) FROM public.catalog_observations observation
      JOIN tmp_weruva_repair_map repair ON repair.observation_id = observation.id
      WHERE observation.food_form = 'wet') <> 135 THEN
    RAISE EXCEPTION 'Weruva observation postcondition failed';
  END IF;

  IF (SELECT count(*) FROM public.catalog_formula_aliases alias
      JOIN tmp_weruva_repair_map repair
        ON repair.old_formula_key = alias.alias_formula_key
       AND repair.formula_id = alias.formula_id
      WHERE repair.old_formula_key <> repair.new_formula_key) <> 45 THEN
    RAISE EXCEPTION 'Weruva legacy formula alias postcondition failed';
  END IF;

  IF (SELECT count(*) FROM public.catalog_field_evidence evidence
      JOIN tmp_weruva_repair_map repair
        ON repair.formula_id = evidence.formula_id
       AND repair.observation_id = evidence.observation_id
       AND repair.source_url = evidence.source_url
      WHERE evidence.field_name = 'food_form'
        AND evidence.field_value = to_jsonb('wet'::TEXT)
        AND evidence.source_authority = 'manufacturer'
        AND evidence.accepted
        AND evidence.content_hash = encode(
          digest(
            repair.cache_key || '|food_form|wet|'
            || '1395c382357e452f992e75de4480ac74b3ad7aeb296edf005f276aae36d8c2d3',
            'sha256'
          ),
          'hex'
        )) <> 135 THEN
    RAISE EXCEPTION 'Weruva field-evidence postcondition failed';
  END IF;
END
$postconditions$;
