-- Refine verified formula identities when later first-party evidence fills a
-- previously unknown form or a blank/generic visible recipe. The GTIN and all
-- hard identity fields stay attached to the same formula row.

CREATE TEMP TABLE catalog_identity_refinements (
  gtin TEXT PRIMARY KEY,
  old_formula_key TEXT NOT NULL UNIQUE,
  new_formula_key TEXT NOT NULL UNIQUE,
  new_identity_hash TEXT NOT NULL,
  new_food_form TEXT NOT NULL,
  new_flavor TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO catalog_identity_refinements (
  gtin,
  old_formula_key,
  new_formula_key,
  new_identity_hash,
  new_food_form,
  new_flavor
)
VALUES
  (
    '810120991719',
    'health extension|health extension|little bites|dog|puppy|unknown||',
    'health extension|health extension|little bites|dog|puppy|dry||',
    '1e8afdafaa78257162f703ef9b13d9554ddb4a91dc3d0776f58535b38c451f4f',
    'dry',
    ''
  ),
  (
    '784672108058',
    'health extension|health extension|lamb and brown rice recipe|dog|all life stages|unknown|lamb and brown rice recipe|',
    'health extension|health extension|lamb and brown rice recipe|dog|all life stages|dry|lamb and brown rice recipe|',
    'daf383879a344be26203598f8351635a3feb54f528a3ad97d440328d09706933',
    'dry',
    'lamb and brown rice recipe'
  ),
  (
    '784672108034',
    'health extension|health extension|lite|dog|senior|unknown|chicken and brown rice recipe|',
    'health extension|health extension|lite|dog|senior|dry|chicken and brown rice recipe|',
    '5ff0c42aa74c2c5fad60c999b3b30a20e6784a6db5e3213cfa9fb8bafd0ac2aa',
    'dry',
    'chicken and brown rice recipe'
  ),
  (
    '784672108041',
    'health extension|health extension|little bites|dog|all life stages|unknown|chicken and brown rice recipe|',
    'health extension|health extension|little bites|dog|all life stages|dry|chicken and brown rice recipe|',
    'bb3db8f48273b217b7cd684ef1c8011a7e790b76e1972ba02bf9594a322adaa5',
    'dry',
    'chicken and brown rice recipe'
  ),
  (
    '784672108072',
    'health extension|health extension|little bites lite|dog|senior|unknown|chicken and brown rice recipe|',
    'health extension|health extension|little bites lite|dog|senior|dry|chicken and brown rice recipe|',
    'a5d3a986d8780293e20e490fb3c6803dec27475a974fcad6d4e5b20e54bd969b',
    'dry',
    'chicken and brown rice recipe'
  ),
  (
    '784672108027',
    'health extension|health extension|original|dog|all life stages|unknown|chicken and brown rice recipe|',
    'health extension|health extension|original|dog|all life stages|dry|chicken and brown rice recipe|',
    'e34f10a2d98a488bd7c50d15699be7d65a726b5bafeafcbba38637bc67f623ed',
    'dry',
    'chicken and brown rice recipe'
  ),
  (
    '784672109307',
    'health extension|health extension|large bites|dog|adult|unknown|chicken and brown rice|',
    'health extension|health extension|large bites|dog|adult|dry|chicken and brown rice|',
    '766fc01a891933780b270ae9a5cedbc084bb82f591b2c19e7f62a8f26dfaece3',
    'dry',
    'chicken and brown rice'
  ),
  (
    '723633007412',
    'natural balance|natural balance|natural balance health protection large breed adult dry dog food salmon|dog|adult|dry||',
    'natural balance|natural balance|natural balance health protection large breed adult dry dog food salmon|dog|adult|dry|salmon|',
    '2a7565581ea465a342aaa1f8d1a24db0140a29691d713db3e2f7972fb46f37b7',
    'dry',
    'salmon'
  ),
  (
    '850012112969',
    'jinx|jinx|jinx all life stages grain free dry dog food lamb sweet potato and carrot|dog|all life stages|dry||',
    'jinx|jinx|jinx all life stages grain free dry dog food lamb sweet potato and carrot|dog|all life stages|dry|lamb sweet potato and carrot|',
    'fc617ceb8620b1d46d38cb5a663f8c820bd3dc9e4807feff5eccc992deaee898',
    'dry',
    'lamb sweet potato and carrot'
  ),
  (
    '859610006014',
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult cat sensitive stomach dry food natural chicken and brown rice|cat|adult|dry|other|',
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult cat sensitive stomach dry food natural chicken and brown rice|cat|adult|dry|chicken and brown rice|',
    '4643c36d668bd58443ee1fa567fe4443ab2ea13d582ea33bf48ee85f217fe61e',
    'dry',
    'chicken and brown rice'
  ),
  (
    '840243160976',
    'blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food chicken grain free|dog|adult|dry||',
    'blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food chicken grain free|dog|adult|dry|chicken|',
    '88f4db9655680f72d33255ff0fccab72a855d1b7d3652f489d88e421348722fa',
    'dry',
    'chicken'
  ),
  (
    '840243160426',
    'blue buffalo|blue buffalo|blue buffalo wilderness high protein large breed adult dry dog food grain free salmon|dog|adult|dry||',
    'blue buffalo|blue buffalo|blue buffalo wilderness high protein large breed adult dry dog food grain free salmon|dog|adult|dry|salmon|',
    '89d4609bf23eda3293085efa00057d4d527d124068c3424ae36c73bbc302b8b7',
    'dry',
    'salmon'
  ),
  (
    '810118121258',
    'jinx|jinx|jinx senior dry dog food cage free chicken brown rice and sweet potato|dog|senior|dry||',
    'jinx|jinx|jinx senior dry dog food cage free chicken brown rice and sweet potato|dog|senior|dry|chicken brown rice and sweet potato|',
    'b12fa55a7a97e3555ffa5295fdf841a4523882996bbe61c9191ae3addf87f724',
    'dry',
    'chicken brown rice and sweet potato'
  );

DO $$
DECLARE
  v_expected_count INTEGER;
  v_matched_count INTEGER;
  v_updated_count INTEGER;
BEGIN
  SELECT count(*) INTO v_expected_count FROM catalog_identity_refinements;

  IF EXISTS (
    SELECT 1
    FROM catalog_identity_refinements correction
    JOIN public.catalog_formulas target
      ON target.formula_key = correction.new_formula_key
    WHERE target.formula_key <> correction.old_formula_key
  ) THEN
    RAISE EXCEPTION 'A refined catalog formula identity already exists';
  END IF;

  SELECT count(*)
  INTO v_matched_count
  FROM catalog_identity_refinements correction
  JOIN public.catalog_skus sku
    ON sku.gtin = correction.gtin
   AND sku.active
  JOIN public.catalog_formulas formula
    ON formula.id = sku.formula_id
   AND formula.active
   AND formula.formula_key = correction.old_formula_key;

  IF v_matched_count <> v_expected_count THEN
    RAISE EXCEPTION
      'Expected % exact GTIN/formula refinements but matched %',
      v_expected_count,
      v_matched_count;
  END IF;

  UPDATE public.catalog_formulas formula
  SET
    formula_key = correction.new_formula_key,
    identity_hash = correction.new_identity_hash,
    food_form = correction.new_food_form,
    flavor = correction.new_flavor,
    updated_at = NOW()
  FROM catalog_identity_refinements correction
  WHERE formula.formula_key = correction.old_formula_key;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> v_expected_count THEN
    RAISE EXCEPTION
      'Expected to refine % formulas but updated %',
      v_expected_count,
      v_updated_count;
  END IF;
END;
$$;
