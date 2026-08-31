# Food-form boundary verification — 2026-08-31

## Production diagnosis

- The reported wet result was **not auto-opened**. Production analytics recorded `label_lookup_completed` with `auto_opened=false`, decision `no_exact_variant`, and reason `recognizer_timed_out`; a `catalog_product_opened` event followed about two seconds later. The can was selected from the candidate surface.
- The exact dry product is present and verified in production: cache key `census:6d34f8eedef1ed8299581434f850338d`, GTIN `017800475686`, Purina ONE SmartBlend Natural Dry Dog Food with Chicken & Rice, `food_form=dry`, `package_size=8lbs`. Retailer item `17800173803` is not stored as a catalog identifier. A manufacturer-backed matching dry formula also exists in a 3 lb serving row.

## Resolver changes

- Food form is a hard compatibility boundary in every label path. Candidate-only form now reports `candidate_food_form_not_visible` when strict visible-variant matching is enabled.
- Package evidence feeds the same form comparison: pound/kilogram weights are dry-bag evidence, while ounce/gram weights up to 30 oz are can/pouch-scale evidence. Opposing evidence reports `package_size_form_conflict` and excludes the candidate before ranking.
- Wet vocabulary now covers unambiguous wet forms and containers (`entree`, `entrée`, `classic ground`, `chunks in gravy`, `chunks in sauce`, `can`, `tray`, `tub`, `cup/cups`). Dry vocabulary covers `clusters` and `minichunks`. Ambiguous words such as bare `ground`, `chunks`, `morsels`, `bites`, `bag`, and `crunchy` were intentionally not made form evidence.
- Package-derived evidence takes precedence over an isolated, conflicting surface word. This keeps real dry identities such as “meaty morsels,” grain text containing “ground,” and feeding directions containing “cups” dry-compatible.
- Candidate filtering, OCR compatibility, verified catalog lookup, and auto-open reconciliation all use strict identity comparison on label paths. Cross-form candidates are removed rather than merely down-ranked.
- The recipe-variant bypass came from comparing a candidate-enriched recognition identity against the same candidate. Reconciliation now compares raw OCR-visible identity independently for each recognizer, so candidate-only `brown rice` correctly reports `candidate_formula_variant_not_visible`.
- Product-line candidate-only variants now have an asymmetric guard. Diet condition, breed size, and grain-free candidate-only terms were already protected. Species already rejects explicit dog/cat conflicts and ambiguous auto-open sets; a missing-side species guard was not added because many safe front labels omit the word dog/cat and existing real fixtures depend on that behavior.
- Result telemetry now records resolution decision, auto-open attempt/outcome, manual candidate selection surface, raw recognized identities, and recognized-vs-chosen brand/product/form/package evidence.

## Regression and runtime evidence

- The behavioral resolver contract covers the real Purina 8 lb label, the reverse 13 oz can case, wet-only abstention without a visible form word, an invented brand, “meaty morsels” on a dry bag, package/form reason codes, candidate-derived identity contamination, protected-field guards, and the existing Hill's 15.5 lb / 4.5 lb formula merge.
- iPhone 17 Pro simulator, iOS 26.5, Debug development build: Xcode build/install/launch passed.
- [Dry bag exact match](./dry-bag-exact-match.jpg): the 8 lb fixture shows only Purina ONE SmartBlend Natural Chicken & Rice Formula, tagged `8 lb bag`, `Dry`, `Dog`, and `Exact label match`.
- [Honest abstention and recovery](./label-abstention-recovery.jpg): the actual empty state says “Exact product not confirmed” and offers “Try Photo Again.”

## Required fail-fast verification

All commands passed in order:

1. `npm run check:syntax`
2. `npm run check:resolver-contract`
3. `npm run check:catalog`
4. `npm run check:pet-safety`
5. `npm run check:claims`
6. `npm run check:deployment` — 806 audit migrations, 5 functions
7. `npm run verify` — 812 migrations

## Build 54 impact

Yes, TestFlight build 54 is affected. EAS identifies build 54 as app version 1.2.2, build ID `64261a9e-b400-4c27-84d0-6be1cf52219d`, created from commit `84861e4a9073fa44659435191ad1275548592234`. The food-form boundary fix is newer than that commit and is not in the binary.
