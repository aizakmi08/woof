-- 040: Service-role-only nutrient panel updates.
--
-- Nutrient panel ingestion should not have to rewrite ingredients. The
-- save_product_data_with_nutrients RPC is useful for full product imports, but
-- a nutrient-only backfill needs a narrower path that preserves the existing
-- ingredient contract and only marks a row nutrient-complete after validation.

CREATE OR REPLACE FUNCTION public.update_product_nutrient_panel(
  p_cache_key TEXT,
  p_nutrient_panel JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_cache_key TEXT;
  basis TEXT;
  nutrient_count INT := 0;
  field_name TEXT;
  field_value NUMERIC;
  percent_fields CONSTANT TEXT[] := ARRAY[
    'protein_pct',
    'fat_pct',
    'fiber_pct',
    'moisture_pct',
    'ash_pct',
    'calcium_pct',
    'phosphorus_pct',
    'omega_3_pct',
    'omega_6_pct'
  ];
  calorie_fields CONSTANT TEXT[] := ARRAY[
    'calories_per_cup',
    'calories_per_kg'
  ];
BEGIN
  clean_cache_key := trim(coalesce(p_cache_key, ''));
  IF length(clean_cache_key) < 3 THEN
    RAISE EXCEPTION 'Invalid nutrient panel cache key'
      USING ERRCODE = '22023';
  END IF;

  IF p_nutrient_panel IS NULL OR jsonb_typeof(p_nutrient_panel) <> 'object' THEN
    RAISE EXCEPTION 'Invalid nutrient panel payload'
      USING ERRCODE = '22023';
  END IF;

  basis := p_nutrient_panel->>'basis';
  IF basis NOT IN ('as-fed', 'dry-matter') THEN
    RAISE EXCEPTION 'Invalid nutrient panel basis'
      USING ERRCODE = '22023';
  END IF;

  FOREACH field_name IN ARRAY percent_fields LOOP
    IF p_nutrient_panel ? field_name THEN
      field_value := (p_nutrient_panel->>field_name)::NUMERIC;
      IF field_value < 0 OR field_value > 100 THEN
        RAISE EXCEPTION 'Invalid nutrient percentage field %', field_name
          USING ERRCODE = '22023';
      END IF;
      nutrient_count := nutrient_count + 1;
    END IF;
  END LOOP;

  FOREACH field_name IN ARRAY calorie_fields LOOP
    IF p_nutrient_panel ? field_name THEN
      field_value := (p_nutrient_panel->>field_name)::NUMERIC;
      IF field_value < 0 OR field_value > 10000 THEN
        RAISE EXCEPTION 'Invalid nutrient calorie field %', field_name
          USING ERRCODE = '22023';
      END IF;
      nutrient_count := nutrient_count + 1;
    END IF;
  END LOOP;

  IF nutrient_count < 2 THEN
    RAISE EXCEPTION 'Nutrient panel must include at least two numeric nutrient fields'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.product_data
     SET nutrient_panel = p_nutrient_panel,
         has_published_nutrients = TRUE,
         updated_at = NOW()
   WHERE cache_key = clean_cache_key
     AND ingredient_count >= 5
     AND expires_at > NOW();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_product_nutrient_panel(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_nutrient_panel(TEXT, JSONB)
  TO service_role;
