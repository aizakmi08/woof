-- Cover the exact-observation foreign key used by reconciliation and deletes.
CREATE INDEX IF NOT EXISTS catalog_retailer_ingredient_observation_idx
  ON public.catalog_retailer_ingredient_evidence (linked_observation_id)
  WHERE linked_observation_id IS NOT NULL;
