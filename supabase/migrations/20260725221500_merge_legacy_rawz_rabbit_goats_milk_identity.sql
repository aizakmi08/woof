DO $$
DECLARE
  v_legacy_formula_id BIGINT;
  v_canonical_formula_id BIGINT;
  v_legacy_cache_key TEXT := 'rawz:rawz with goat s milk 96 rabbit canned cat food';
  v_canonical_cache_key TEXT := 'rawz:rawz 96 rabbit with goat s milk canned cat food product 96-rabbit-with-goats-milk-canned-cat-food';
BEGIN
  SELECT id
  INTO STRICT v_legacy_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'rawz|rawz|with goat s milk 96|cat|unknown|wet|rabbit|';

  SELECT id
  INTO STRICT v_canonical_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'rawz|rawz|96%|cat|adult|wet|rabbit with goat''s milk|';

  IF v_legacy_formula_id = v_canonical_formula_id THEN
    RAISE EXCEPTION 'RAWZ legacy and canonical formula ids unexpectedly match';
  END IF;

  IF (
    SELECT ingredients
    FROM public.catalog_formulas
    WHERE id = v_legacy_formula_id
  ) IS DISTINCT FROM (
    SELECT ingredients
    FROM public.catalog_formulas
    WHERE id = v_canonical_formula_id
  ) THEN
    RAISE EXCEPTION 'RAWZ legacy identity has a different ingredient formula';
  END IF;

  UPDATE public.product_data
  SET
    is_complete_food = false,
    catalog_exclusion_reason = 'duplicate_canonical_formula_identity_repaired',
    updated_at = now()
  WHERE cache_key = v_legacy_cache_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RAWZ legacy serving row is missing';
  END IF;

  UPDATE public.catalog_skus
  SET
    formula_id = v_canonical_formula_id,
    package_size = '5.5 oz can',
    active = false,
    last_observed_at = now(),
    updated_at = now()
  WHERE formula_id = v_legacy_formula_id;

  UPDATE public.catalog_formulas
  SET
    active = false,
    absent_since = now(),
    verification_status = 'quarantined',
    promoted_cache_key = NULL,
    updated_at = now()
  WHERE id = v_legacy_formula_id;

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    needs_product_record = false,
    needs_verified_ingredients = false,
    needs_verified_image = false,
    needs_pet_type = false,
    resolved_at = now(),
    resolution_reason = 'merged_into_current_rawz_rabbit_goats_milk_canonical_formula',
    acquisition_notes = concat_ws(
      E'\n',
      nullif(acquisition_notes, ''),
      'Legacy line/flavor/life-stage identity retired; current official PDP is served by ' || v_canonical_cache_key || '.'
    ),
    updated_at = now(),
    last_refreshed_at = now()
  WHERE cache_key = v_legacy_cache_key
     OR gap_key LIKE '%' || v_legacy_cache_key || '%';

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE lower(brand) = 'rawz'
      AND lower(product_name) LIKE '%rabbit%'
      AND (
        lower(product_name) LIKE '%goat%'
        OR lower(coalesce(product_line, '')) LIKE '%goat%'
      )
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'RAWZ Rabbit with Goat''s Milk must have exactly one active serving identity';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE lower(brand) = 'rawz'
      AND lower(product_name) LIKE '%rabbit%'
      AND (
        lower(product_name) LIKE '%goat%'
        OR lower(product_line) LIKE '%goat%'
      )
      AND active
      AND verification_status = 'verified'
  ) <> 1 THEN
    RAISE EXCEPTION 'RAWZ Rabbit with Goat''s Milk must have exactly one active canonical formula';
  END IF;
END
$$;
