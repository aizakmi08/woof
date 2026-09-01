# Food-form boundary verification — 2026-08-31

## Production diagnosis

- The reported wet result was **not auto-opened**. Production analytics recorded `label_lookup_completed` with `auto_opened=false`, decision `no_exact_variant`, and reason `recognizer_timed_out`; a `catalog_product_opened` event followed about two seconds later. The can was selected from the candidate surface.
- The exact dry product is present and verified in production: cache key `census:6d34f8eedef1ed8299581434f850338d`, GTIN `017800475686`, Purina ONE SmartBlend Natural Dry Dog Food with Chicken & Rice, `food_form=dry`, `package_size=8lbs`. Retailer item `17800173803` is not stored as a catalog identifier. A manufacturer-backed matching dry formula also exists in a 3 lb serving row.

## Resolver changes

- Food form is a hard compatibility boundary in every label path. Candidate-only form now reports `candidate_food_form_not_visible` when strict visible-variant matching is enabled.
- Package evidence feeds the same form comparison: physical bags are non-wet/dry-package evidence; plural can/pouch/tray/tub packs and weight-labeled cans are wet-package evidence; and weight scale is used only when explicit form/container evidence is absent. Opposing evidence reports `package_size_form_conflict` and excludes the candidate before ranking.
- Wet vocabulary covers unambiguous wet forms and containers (`entree`, `entrée`, `classic ground`, `chunks in gravy`, `chunks in sauce`, `can`, `tray`, `tub`, `cup/cups`). Dry vocabulary covers `clusters` and `minichunks`. Bare `ground`, `chunks`, `morsels`, `bites`, and `crunchy` remain non-evidence; `bag` is considered only as physical package evidence so an ounce-denominated bag cannot be mistaken for a can.
- Explicit form and physical-container evidence take precedence over weight scale. This keeps a 9.75 lb case of 12 cans wet, a 13 oz dry trial bag dry, and real dry identities containing “meaty morsels,” grain text containing “ground,” or feeding directions containing “cups” dry-compatible.
- Candidate filtering, OCR compatibility, verified catalog lookup, and auto-open reconciliation all use strict identity comparison on label paths. Cross-form candidates are removed rather than merely down-ranked.
- The recipe-variant bypass came from comparing a candidate-enriched recognition identity against the same candidate. Reconciliation now compares raw OCR-visible identity independently for each recognizer, so candidate-only `brown rice` correctly reports `candidate_formula_variant_not_visible`.
- Product-line candidate-only variants now have an asymmetric guard. Diet condition, breed size, and grain-free candidate-only terms were already protected. Species already rejects explicit dog/cat conflicts and ambiguous auto-open sets; a missing-side species guard was not added because many safe front labels omit the word dog/cat and existing real fixtures depend on that behavior.
- Result telemetry now records resolution decision, auto-open attempt/outcome, manual candidate selection surface, raw recognized identities, and recognized-vs-chosen brand/product/form/package evidence.

## 2026-09-01 systemic hardening

- The same bag/can boundary now applies even when OCR does not read the words `dry` or `wet`: a visible bag cannot resolve to a same-weight can.
- Final OCR auto-open compares known package weights after converting pounds, kilograms, ounces, and grams. A known 8 lb label cannot auto-open a known 13 lb candidate, while 8 lb and 3.63 kg remain equivalent within a 3.5% tolerance.
- Wet multipacks compare all visible measurements, so `9.75 lb (12 x 13 oz cans)` remains compatible with `12 x 13 oz cans` rather than being classified from total pounds.
- Freeze-dried/dehydrated/air-dried remains a separate form group from conventional dry kibble.
- The cloud recognizer prompt now encodes the same physical-package rules and explicitly says that “meaty morsels in every bite” is marketing copy, not wet-form evidence. Conflicting evidence must abstain with an empty `foodForm`.
- These are generic invariants in the resolver contract, not brand-specific exceptions. New cases cover bag-only versus can, wet pound-total multipacks, ounce-size dry bags, exact package mismatch, imperial/metric equivalence, freeze-dried versus dry, and the existing feeding-cup false-positive guard.

The full release gate passed after the hardening: `check:syntax`, `check:resolver-contract`, `check:catalog`, `check:sql`, `check:deployment`, `check:pet-safety`, `check:claims`, and `verify`. Production is unchanged: the cloud prompt requires an edge-function deployment and the client gates require a replacement TestFlight build.

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
