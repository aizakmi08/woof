-- Record accepted GTIN, size, ingredient-label, and front-image evidence for
-- each exact package variant.
WITH canonical AS (
  SELECT id, ingredient_text
  FROM public.catalog_formulas
  WHERE formula_key =
    'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
),
variants(sku_id, gtin, package_size) AS (
  VALUES
    ('5309277', '0737257936355', '6 lb'),
    ('5309278', '0737257936331', '34 lb'),
    ('5348620', '0196481057739', '18 lb'),
    ('5360305', '0196481089488', '45 lb')
),
variant_observations AS (
  SELECT
    canonical.id AS formula_id,
    canonical.ingredient_text,
    variants.sku_id,
    variants.gtin,
    variants.package_size,
    observation.id AS observation_id,
    format(
      'https://s7d2.scene7.com/is/image/PetSmart/%s_alt6?fmt=png&wid=1800&hei=1800',
      variants.sku_id
    ) AS ingredient_label_url,
    format(
      'https://s7d2.scene7.com/is/image/PetSmart/%s',
      variants.sku_id
    ) AS front_image_url
  FROM canonical
  CROSS JOIN variants
  LEFT JOIN public.catalog_observations observation
    ON observation.formula_id = canonical.id
   AND observation.source_slug = 'petsmart-private-label-manual'
   AND observation.source_external_id = variants.sku_id
   AND observation.gtin = variants.gtin
)
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
  formula_id,
  observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  'retailer_verified',
  TRUE,
  now(),
  encode(
    digest(
      concat_ws(
        '|',
        sku_id,
        evidence.field_name,
        evidence.field_value::TEXT,
        evidence.source_url
      ),
      'sha256'
    ),
    'hex'
  )
FROM variant_observations
CROSS JOIN LATERAL (
  VALUES
    ('gtin'::TEXT, to_jsonb(gtin), ingredient_label_url),
    ('package_size'::TEXT, to_jsonb(package_size), front_image_url),
    ('ingredient_text'::TEXT, to_jsonb(ingredient_text), ingredient_label_url),
    ('front_image_url'::TEXT, to_jsonb(front_image_url), front_image_url)
) evidence(field_name, field_value, source_url)
ON CONFLICT (
  formula_id,
  field_name,
  source_url,
  content_hash
)
DO UPDATE SET
  observation_id = EXCLUDED.observation_id,
  field_value = EXCLUDED.field_value,
  accepted = TRUE,
  observed_at = EXCLUDED.observed_at;

DO $$
DECLARE
  v_count INTEGER;
  v_missing_observation INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.catalog_field_evidence evidence
  JOIN public.catalog_formulas formula
    ON formula.id = evidence.formula_id
  WHERE formula.formula_key =
      'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
    AND evidence.accepted
    AND evidence.field_name IN (
      'gtin',
      'package_size',
      'ingredient_text',
      'front_image_url'
    )
    AND (
      evidence.source_url LIKE
        'https://s7d2.scene7.com/is/image/PetSmart/5309277%'
      OR evidence.source_url LIKE
        'https://s7d2.scene7.com/is/image/PetSmart/5309278%'
      OR evidence.source_url LIKE
        'https://s7d2.scene7.com/is/image/PetSmart/5348620%'
      OR evidence.source_url LIKE
        'https://s7d2.scene7.com/is/image/PetSmart/5360305%'
    );

  SELECT count(*) INTO v_missing_observation
  FROM public.catalog_field_evidence evidence
  JOIN public.catalog_formulas formula
    ON formula.id = evidence.formula_id
  WHERE formula.formula_key =
      'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
    AND evidence.source_url LIKE
      'https://s7d2.scene7.com/is/image/PetSmart/%'
    AND evidence.observation_id IS NULL;

  IF v_count < 16 OR v_missing_observation <> 0 THEN
    RAISE EXCEPTION
      'Authority field evidence failed: evidence %, missing observations %',
      v_count,
      v_missing_observation;
  END IF;
END $$;
