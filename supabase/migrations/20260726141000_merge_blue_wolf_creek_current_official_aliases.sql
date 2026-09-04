-- The current official Blue Buffalo feed identifies these four exact PDPs as
-- Wolf Creek Stew Beef/Chicken/Duck/Salmon. Older canonical rows use longer
-- merchandising titles for the same PDP, ingredient array, image, species and
-- food form. Merge those historical aliases into the current official formula.

CREATE TEMP TABLE blue_wolf_creek_merges (
  keep_id bigint PRIMARY KEY,
  drop_id bigint UNIQUE NOT NULL
) ON COMMIT DROP;

INSERT INTO blue_wolf_creek_merges (keep_id, drop_id)
VALUES
  (33057, 4129),
  (33038, 4130),
  (33039, 4131),
  (33040, 4132);

DO $$
DECLARE
  v_valid_pairs integer;
BEGIN
  SELECT count(*)
  INTO v_valid_pairs
  FROM blue_wolf_creek_merges AS merge
  JOIN public.catalog_formulas AS current_formula
    ON current_formula.id = merge.keep_id
  JOIN public.catalog_formulas AS historical_alias
    ON historical_alias.id = merge.drop_id
  WHERE current_formula.active
    AND current_formula.verification_status = 'verified'
    AND historical_alias.active
    AND historical_alias.verification_status = 'verified'
    AND current_formula.source_url = historical_alias.source_url
    AND current_formula.source_url LIKE
      'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-%'
    AND current_formula.ingredient_text = historical_alias.ingredient_text
    AND current_formula.ingredients = historical_alias.ingredients
    AND current_formula.front_image_url = historical_alias.front_image_url
    AND current_formula.pet_type = historical_alias.pet_type
    AND current_formula.food_form = historical_alias.food_form;

  IF v_valid_pairs <> 4 THEN
    RAISE EXCEPTION
      'Blue Wolf Creek exact-alias preflight changed: expected 4, found %',
      v_valid_pairs;
  END IF;
END
$$;

INSERT INTO public.catalog_field_evidence (
  formula_id,
  observation_id,
  field_name,
  field_value,
  source_url,
  source_authority,
  accepted,
  observed_at,
  content_hash,
  created_at
)
SELECT
  merge.keep_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash,
  evidence.created_at
FROM public.catalog_field_evidence AS evidence
JOIN blue_wolf_creek_merges AS merge
  ON merge.drop_id = evidence.formula_id
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR excluded.accepted,
  observed_at = greatest(public.catalog_field_evidence.observed_at, excluded.observed_at);

DELETE FROM public.catalog_field_evidence AS evidence
USING blue_wolf_creek_merges AS merge
WHERE evidence.formula_id = merge.drop_id;

UPDATE public.catalog_observations AS observation
SET formula_id = merge.keep_id
FROM blue_wolf_creek_merges AS merge
WHERE observation.formula_id = merge.drop_id;

UPDATE public.catalog_skus AS sku
SET
  formula_id = merge.keep_id,
  updated_at = now()
FROM blue_wolf_creek_merges AS merge
WHERE sku.formula_id = merge.drop_id;

UPDATE public.catalog_manual_evidence_reviews AS review
SET
  formula_id = merge.keep_id,
  updated_at = now()
FROM blue_wolf_creek_merges AS merge
WHERE review.formula_id = merge.drop_id;

UPDATE public.catalog_formulas AS historical_alias
SET
  active = false,
  verification_status = 'quarantined',
  absent_since = now(),
  promoted_cache_key = NULL,
  updated_at = now()
FROM blue_wolf_creek_merges AS merge
WHERE historical_alias.id = merge.drop_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE lower(brand) = 'blue buffalo'
      AND active
      AND verification_status = 'verified'
      AND source_url IS NOT NULL
    GROUP BY source_url
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo still has active exact-source formula duplicates';
  END IF;
END
$$;
