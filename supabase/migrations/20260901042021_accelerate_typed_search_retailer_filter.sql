-- Typed search hides retailer rows that have already been promoted to a
-- manufacturer formula. The search wrapper probes by promoted_cache_key for
-- every retailer candidate, so keep that lookup bounded even on a cold cache.
CREATE INDEX IF NOT EXISTS catalog_retailer_evidence_promoted_cache_formula_idx
  ON public.catalog_retailer_ingredient_evidence (
    promoted_cache_key,
    linked_formula_id
  )
  WHERE is_current
    AND evidence_status = 'promoted'
    AND promoted_cache_key IS NOT NULL;
