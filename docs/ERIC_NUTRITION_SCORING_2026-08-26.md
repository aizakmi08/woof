# Eric nutrition scoring release report — 2026-08-26

## Outcome

The shipped-path plumbing defect is fixed on `codex/nutrition-scoring-release`: a raw `product_data` row now keeps its published nutrient flag, values, type, basis, and source provenance through row normalization, verified-product conversion, deterministic scoring, search caching, barcode lookup, and result rendering.

The release is **not approved for production migration or TestFlight yet**. Manufacturer-page re-verification cannot be completed in this restricted-network session, and the Deno binary required for Edge typechecking is unavailable. No production data was mutated.

## Eric products

| Product | Before | After | Published values used | Rule | Manufacturer source | Verification status |
|---|---:|---:|---|---|---|---|
| Nature's Logic Canine Pork Meal Feast | 75 in the reproduced broken mapper path | 35 maximum; Nutritional Balance 25 maximum | Calcium 5.34% DM; phosphorus 2.84% DM; Actual Analysis; all life stages | Calcium exceeds the 1.8% AAFCO profile maximum | https://natureslogic.com/dog-products/canine-dry-kibble-pork/ | Values are exact in the source-backed migration and regression; live page re-fetch is still required before migration approval |
| Nature's Logic Distinction Canine Pork Recipe | Prior production score not captured; nutrient category was hard-wired to the no-data path | 35 maximum; Nutritional Balance 25 maximum | Calcium 3.52% DM; phosphorus 1.96% DM; Actual Analysis; all life stages | Calcium exceeds the 1.8% AAFCO profile maximum | https://natureslogic.com/dog-products/distinction-canine-pork-recipe/ | Values are exact in the source-backed migration and regression; live page re-fetch is still required before migration approval |

The end-to-end regression also proves that a comparable Typical Analysis scores 19 Nutritional Balance points above the same values presented only as Guaranteed Analysis. A Guaranteed Analysis is never promoted to Typical/Actual, and ingredient text is never used to infer nutrient levels.

## Newly capped-product review

The Hill's and Fromm migration payloads contain no dog calcium value above the applicable threshold based on their encoded product/life-stage identities. The two Nature's Logic products above are the only known newly capped formulas in this change set. Because source pages could not be independently re-fetched in this session, both remain `pending_live_source_confirmation`; production application is blocked.

## Coverage

- Before enrichment: 2 numeric published-analysis rows, both versions of the same Nature's Logic formula (~0.008% of the catalog, per the release audit).
- Prepared enrichment: approximately 304 exact cache-key rows: Hill's 192, Fromm 109, Nature's Logic 3.
- The Fromm payload preserves image/PDF-only profiles as `requires_verified_extraction` rather than promoting them.
- Exact live counts for Guaranteed-Analysis-only and no-numeric-data rows require a read-only production query and are intentionally not guessed here.
- Open Farm and Weruva image-only profiles and Royal Canin kcal-basis profiles remain pending. OCR should require two-person/value-range verification; kcal-basis normalization should retain the published kcal denominator and convert only when a source-backed energy density permits it.

## Dropped-field audit

- Fixed: `catalogProductToVerifiedProduct` dropped `hasPublishedNutrients`, `nutritionalInfo`, `nutrientPanel`, analysis type/basis, formula provenance, complete-food/exclusion state, and cache identity.
- Fixed: the client `opff` lookup mapper dropped moisture, calcium, phosphorus, ash, analysis type, and basis returned by the Edge lookup.
- Fixed: catalog search-cache serialization dropped type/basis, complete-food/exclusion state, and expiry.
- Safe as implemented: local result cache preserves the full analysis/product objects; it is now scoring-version gated.
- Safe as implemented: server `analysis_cache` stores the full verified product; old unversioned scores are rejected client-side.
- History: saved list scores are now visibly labeled `SAVED`; opening a pet-food history row rebuilds against the current verified catalog instead of presenting the snapshot as current.

## Read-time and AI hardening

- A bare `dry_matter` block no longer earns Typical Analysis credit.
- `has_published_nutrients` alone no longer invents an as-fed basis.
- Text-only or malformed GA payloads produce no numeric facts and no `0%` display.
- The verified AI prompt now receives moisture, calcium, phosphorus, analysis type, basis, and life stage.
- Server validation recomputes the 20/20/30/15/15 weighted score, corrects disagreements beyond two points, and enforces calcium, Ca:P, BHA/BHT/ethoxyquin, propylene-glycol, and primary-by-product caps.
- The server emits the validated final analysis into the stream, so the client cannot finish on the model's uncorrected score.
- AI nutrient percentages and calories-per-cup remain `N/A` without published-source context.

## Cache invalidation

- Local result cache: bumped from unversioned keys to `@woof_result_v2_*`; legacy keys are purged on access.
- Catalog search cache: bumped from v7 to v8.
- Server cache: all pet-food scores without `2026-08-26-eric-v2` are ignored by the client.
- The exact Nature's Logic repair migration deletes `analysis_cache` rows for the two manufacturer URLs when, and only when, that migration is approved and applied.

## Verification completed

- `check:syntax`, `check:claims`, `check:privacy`, `check:pet-safety`, `check:release`
- `check:resolver-contract`, `check:nutrition-scoring` (9 real-path cases), `check:published-analysis`
- `check:catalog-miss`, `check:revenuecat`, `check:edge`, `check:catalog`, `check:catalog-scraper`
- `check:sql` (817 migrations), `check:deployment`, `check:accessibility`, `check:analytics`, `npm run verify`

Blocked/not run: `check:edge-types` (no Deno binary); live manufacturer re-fetch; production coverage query; clean `npm ci`/iOS export; simulator screenshots; physical-device scans; TestFlight build and submission.

## Eric decision: GA plus moisture transparency credit

Current approved rubric gives the 5-point dry-matter comparability bonus only to Typical/Actual Analysis. A GA plus source-backed moisture can be converted for safety screening but receives no bonus. Recommendation for Eric's review: consider a smaller 2-point comparability credit for GA plus moisture, while keeping the 12-point Typical-vs-GA base gap and 2-point mineral-disclosure gap. This would reward useful disclosure without treating minimums/maximums as actual values. This proposal is **not implemented**.

## Production gate and exact next commands

After both Nature's Logic values and a sample from each Hill's/Fromm extraction format are confirmed against the linked manufacturer pages, review the pending SQL and run:

```sh
npx supabase db push
```

Then deploy the updated `product-lookup` and `analyze` functions using the repository deployment scripts, rerun the full suite including Deno typecheck, capture the required simulator/device evidence, and only then run:

```sh
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production
```

No command in this section was executed in this session.
