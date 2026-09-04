-- Reconcile exact identity defects exposed by the first search-led evidence pass.
-- Both repairs are bounded to authoritative source URLs / exact formula keys.

DO $$
DECLARE
  v_pollock_id BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key =
      'open farm|open farm|air dried|dog|all life stages|air dried|pollock and lamb|'
  ) THEN
    RAISE EXCEPTION
      'Refusing Pollock & Lamb repair because the corrected formula identity already exists';
  END IF;

  SELECT id
  INTO v_pollock_id
  FROM public.catalog_formulas
  WHERE formula_key =
      'open farm|open farm|pollock and|dog|all life stages|dry|pollock and lamb air dried recipe|'
    AND source_url =
      'https://openfarmpet.com/products/air-dried-pollock-lamb-dog-food'
    AND product_name = 'Pollock & Lamb Air Dried Recipe for Dogs'
    AND brand = 'open farm'
    AND pet_type = 'dog'
  FOR UPDATE;

  IF v_pollock_id IS NULL THEN
    RAISE EXCEPTION 'Expected exact Open Farm Pollock & Lamb formula was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = v_pollock_id
      AND gtin = '683547129719'
      AND active
  ) THEN
    RAISE EXCEPTION 'Expected exact Open Farm Pollock & Lamb GTIN was not found';
  END IF;

  UPDATE public.catalog_formulas
  SET
    formula_key =
      'open farm|open farm|air dried|dog|all life stages|air dried|pollock and lamb|',
    product_line = 'air dried',
    life_stage = 'all life stages',
    food_form = 'air dried',
    flavor = 'pollock and lamb',
    identity_hash =
      'e3293fe200b41bac4541b8035488b1ac094626a01c4ed8616590dac9697e6f66',
    updated_at = NOW()
  WHERE id = v_pollock_id;

  UPDATE public.product_data
  SET
    product_line = 'Air Dried',
    life_stage = 'all life stages',
    food_form = 'air-dried',
    flavor = 'Pollock & Lamb',
    updated_at = NOW()
  WHERE cache_key = 'open-farm:683547129719'
    AND product_name = 'Pollock & Lamb Air Dried Recipe for Dogs'
    AND lower(brand) = 'open farm'
    AND pet_type = 'dog';
END
$$;

DO $$
DECLARE
  v_canonical_id BIGINT;
BEGIN
  SELECT id
  INTO v_canonical_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'wellness pet company|wellness|complete health small breed|dog|adult|dry|turkey and oatmeal|'
  FOR UPDATE;

  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'Expected canonical Wellness formula was not found';
  END IF;

  -- The older row differs only by the known owner alias "Wellness". Keep its
  -- historical evidence, but remove it from the active denominator so it
  -- cannot count as a second formula. New censuses canonicalize this alias.
  UPDATE public.catalog_formulas
  SET
    active = FALSE,
    verification_status = 'quarantined',
    absent_since = COALESCE(absent_since, NOW()),
    updated_at = NOW()
  WHERE formula_key =
      'wellness|wellness|complete health small breed|dog|adult|dry|turkey and oatmeal|'
    AND brand = 'wellness'
    AND product_line = 'complete health small breed'
    AND pet_type = 'dog'
    AND life_stage = 'adult'
    AND food_form = 'dry'
    AND flavor = 'turkey and oatmeal'
    AND source_url =
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grained-small-breed-turkey-oatmeal/';
END
$$;
