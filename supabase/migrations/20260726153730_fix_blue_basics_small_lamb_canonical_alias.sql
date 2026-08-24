-- Correct the canonical identity hash for the ingredient-identical PetSmart
-- Small Breed Lamb alias closed in 20260726153700. The prior row pointed to
-- the correct formula but hashed the alias key, so the independent census
-- could not count the closure.

DO $$
DECLARE
  v_alias_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo basics skin and stomach care small breed adult dry dog food grain free lamb|dog|adult|dry|lamb and potato|';
  v_current_key TEXT :=
    'general mills|blue buffalo|blue basics dry dog food small breed grain free lamb and potato|dog|adult|dry|lamb and potato|';
  v_cache_key TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue basics dry dog food small breed grain-free - lamb potato basics small-breed-grain-free-lamb-potato-recipe';
  v_formula_id BIGINT;
BEGIN
  SELECT id INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key=v_current_key
    AND promoted_cache_key=v_cache_key
    AND verification_status='verified' AND active;

  UPDATE public.catalog_formula_aliases
  SET formula_id=v_formula_id,
      identity_hash=encode(digest(v_current_key,'sha256'),'hex'),
      metadata=COALESCE(metadata,'{}'::JSONB)||jsonb_build_object(
        'canonical_identity_hash_repaired',true,
        'reviewed_at','2026-07-26'
      ),
      updated_at=now()
  WHERE alias_formula_key=v_alias_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Small Breed Lamb formula alias is missing';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance,active,created_at,updated_at
  ) VALUES (
    v_cache_key,
    'Blue Buffalo Basics Skin and Stomach Care Small Breed Adult Dry Dog Food Grain Free Lamb and Potato',
    public.normalize_verified_product_search_query(
      'Blue Buffalo Basics Skin and Stomach Care Small Breed Adult Dry Dog Food Grain Free Lamb and Potato'
    ),
    'https://www.bluebuffalo.com/dry-dog-food/basics/small-breed-grain-free-lamb-potato-recipe/',
    'manufacturer','2026-07-27T03:05:00Z',
    jsonb_build_object(
      'formula_evidence_tier','manufacturer_current_exact',
      'generic_name_prefers_manufacturer_current',true,
      'package_gtin','840243100088',
      'ingredient_hash_equality_verified',true
    ),
    true,now(),now()
  )
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE SET
    cache_key=excluded.cache_key,alias_text=excluded.alias_text,
    source_url=excluded.source_url,source_authority=excluded.source_authority,
    evidence_observed_at=excluded.evidence_observed_at,
    provenance=excluded.provenance,updated_at=now();

  IF (
    SELECT cache_key FROM public.search_verified_products(
      'Blue Buffalo Basics Skin and Stomach Care Small Breed Adult Dry Dog Food Grain Free Lamb and Potato',
      1
    ) LIMIT 1
  ) IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION 'Small Breed Lamb exact title search failed';
  END IF;
END
$$;
