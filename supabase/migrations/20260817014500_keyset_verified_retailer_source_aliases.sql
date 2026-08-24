-- Keyset pagination keeps the read-only coverage export below the hosted
-- statement timeout even as verified package aliases grow. The original
-- offset function remains available for compatibility.

CREATE OR REPLACE FUNCTION public.get_verified_retailer_source_aliases_keyset(
  p_after_id BIGINT DEFAULT 0,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE(
  alias_id BIGINT,
  source_url TEXT,
  cache_key TEXT,
  alias_text TEXT,
  source_authority TEXT,
  evidence_observed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    alias.id AS alias_id,
    alias.source_url,
    alias.cache_key,
    alias.alias_text,
    alias.source_authority,
    alias.evidence_observed_at
  FROM public.catalog_verified_product_search_aliases alias
  JOIN public.product_data product
    ON product.cache_key = alias.cache_key
  WHERE alias.id > GREATEST(COALESCE(p_after_id, 0), 0)
    AND alias.active
    AND NULLIF(btrim(alias.source_url), '') IS NOT NULL
    AND alias.source_url ~ '^https://'
    AND alias.source_authority IN (
      'manufacturer', 'official', 'retailer_verified', 'retailer_identity',
      'label_ocr_verified', 'gdsn'
    )
    AND product.pet_type IN ('dog', 'cat')
    AND product.is_complete_food IS NOT FALSE
    AND NULLIF(btrim(product.ingredient_text), '') IS NOT NULL
    AND product.ingredient_count >= 5
    AND NULLIF(btrim(product.image_url), '') IS NOT NULL
    AND NULLIF(btrim(product.source_url), '') IS NOT NULL
    AND product.source_quality IN (
      'manufacturer', 'official', 'retailer_verified', 'gdsn'
    )
    AND product.ingredient_verification_status IN (
      'manufacturer', 'official', 'retailer_verified', 'gdsn',
      'label_ocr_verified'
    )
    AND product.image_verification_status IN (
      'manufacturer', 'official', 'retailer_verified'
    )
    AND product.catalog_exclusion_reason IS NULL
    AND (product.expires_at IS NULL OR product.expires_at > now())
  ORDER BY alias.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);
$function$;

REVOKE ALL ON FUNCTION public.get_verified_retailer_source_aliases_keyset(BIGINT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_verified_retailer_source_aliases_keyset(BIGINT, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.get_verified_retailer_source_aliases_keyset(BIGINT, INTEGER)
IS 'Read-only keyset-paginated exact package URL aliases for verified serving formulas; ingredient text is never exposed.';
