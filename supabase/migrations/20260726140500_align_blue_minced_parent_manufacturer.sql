-- Blue Buffalo is the shelf brand; General Mills is the canonical parent
-- manufacturer used by the current full official inventory. Align the newly
-- repaired Minced formula without changing its shelf identity.

DO $$
DECLARE
  v_old_key text :=
    'blue buffalo|blue buffalo|blue wilderness wild delights wet cat food minced chicken and turkey|cat|unknown|wet|chicken and turkey|';
  v_new_key text :=
    'general mills|blue buffalo|blue wilderness wild delights wet cat food minced chicken and turkey|cat|unknown|wet|chicken and turkey|';
  v_formula_id bigint;
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_old_key
    AND active
    AND verification_status = 'verified'
    AND source_url =
      'https://www.bluebuffalo.com/wet-cat-food/wilderness/minced-chicken-turkey/';

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key = v_new_key
      AND id <> v_formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Minced parent-manufacturer identity already exists';
  END IF;

  UPDATE public.catalog_formulas
  SET
    formula_key = v_new_key,
    manufacturer = 'General Mills',
    updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.catalog_manual_evidence_reviews
  SET
    corrected_formula_key = v_new_key,
    target_formula_key = v_new_key,
    updated_at = now()
  WHERE review_key =
    'blue-buffalo-general-mills:unresolved-image:minced-chicken-turkey-cat'
    AND formula_id = v_formula_id
    AND evidence_status = 'promoted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blue Minced promoted evidence review was not aligned';
  END IF;
END
$$;
