-- Correct regex literals in the first deterministic recovery deployment.
-- This migration is intentionally small so already-deployed databases are
-- repaired without replaying any recovery or promotion work.

CREATE OR REPLACE FUNCTION public.catalog_normalize_retailer_serving_ingredient_text(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      COALESCE(p_value, ''),
                      'Calcium[[:space:]]+Lodate', 'Calcium Iodate', 'gi'
                    ),
                    'Potassium[[:space:]]+Lodide', 'Potassium Iodide', 'gi'
                  ),
                  'Cooper[[:space:]]+Sulfate', 'Copper Sulfate', 'gi'
                ),
                'Choride', 'Chloride', 'gi'
              ),
              'Subtillis', 'Subtilis', 'gi'
            ),
            '\{Vitamin[[:space:]]+B1\}', '(Vitamin B1)', 'gi'
          ),
          '\)[[:space:]]+Vitamins[[:space:]]*:', '), Vitamins:', 'gi'
        ),
        '\)[[:space:]]+Minerals[[:space:]]*:', '), Minerals:', 'gi'
      ),
      '\.[[:space:]]*Vitamin E Supplement\.[[:space:]]*Preserved With Mixed Tocopherols,',
      ', Vitamin E Supplement (Preserved With Mixed Tocopherols),',
      'gi'
    ),
    '[[:space:]]+', ' ', 'g'
  ));
$function$;

CREATE OR REPLACE FUNCTION public.catalog_retailer_ingredient_normalization_codes(
  p_value TEXT
)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT array_remove(ARRAY[
    CASE WHEN COALESCE(p_value, '') ~* 'Calcium[[:space:]]+Lodate'
      THEN 'calcium_iodate_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* 'Potassium[[:space:]]+Lodide'
      THEN 'potassium_iodide_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* 'Cooper[[:space:]]+Sulfate'
      THEN 'copper_sulfate_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* 'Choride'
      THEN 'chloride_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* 'Subtillis'
      THEN 'bacillus_subtilis_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* '\{Vitamin[[:space:]]+B1\}'
      THEN 'vitamin_b1_group_delimiter' END,
    CASE WHEN COALESCE(p_value, '') ~* '\)[[:space:]]+(Vitamins|Minerals)[[:space:]]*:'
      THEN 'group_separator_punctuation' END,
    CASE WHEN COALESCE(p_value, '') ~*
      '\.[[:space:]]*Vitamin E Supplement\.[[:space:]]*Preserved With Mixed Tocopherols,'
      THEN 'vitamin_e_preservative_punctuation' END
  ]::TEXT[], NULL);
$function$;

REVOKE ALL ON FUNCTION public.catalog_normalize_retailer_serving_ingredient_text(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_retailer_ingredient_normalization_codes(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_normalize_retailer_serving_ingredient_text(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_retailer_ingredient_normalization_codes(TEXT)
  TO service_role;
