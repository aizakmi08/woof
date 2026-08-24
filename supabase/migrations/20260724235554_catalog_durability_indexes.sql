-- Cover the new catalog foreign keys for predictable cleanup and review joins.
CREATE INDEX IF NOT EXISTS catalog_census_formula_members_formula_fk_idx
  ON public.catalog_census_formula_members (formula_id)
  WHERE formula_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalog_formula_identity_conflicts_canonical_idx
  ON public.catalog_formula_identity_conflicts (canonical_formula_id)
  WHERE canonical_formula_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalog_formula_identity_conflicts_conflicting_idx
  ON public.catalog_formula_identity_conflicts (conflicting_formula_id)
  WHERE conflicting_formula_id IS NOT NULL;
