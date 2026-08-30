# Eric nutrition scoring release report — 2026-08-26

## Outcome

The shipped-path plumbing defect is fixed on `codex/nutrition-scoring-release`: a raw `product_data` row now keeps its published nutrient flag, values, type, basis, and source provenance through row normalization, verified-product conversion, deterministic scoring, search caching, barcode lookup, and result rendering.

Manufacturer source verification and the scoped production backend deployment are complete. The exact Nature's Logic repair is applied, and the updated `analyze` and `product-lookup` Edge Functions are live and fingerprint-verified. Apple already distributes `1.2.2` build `55`, so the signed App Store candidate is version `1.2.3` build `56` from commit `11865439`. EAS build `45185b70-01b7-4bb3-9c0f-3b0279052dd9` finished successfully, Apple processed the upload, and build `56` is `Ready to Submit` in the existing internal TestFlight group.

The App Store Connect version `1.2.3` is submitted with build `56`, nutrition-specific release notes, verified review contact details, and automatic release to all users after approval. App Store Connect reported `Waiting for Review` on August 30, 2026. The submission proceeded at the user's explicit direction while strict evidence still had pending TestFlight/device, privacy, RevenueCat, Sentry, KPI, and listing checks, and while the production catalog missed the existing 750-brand and zero-open-acquisition-queue completeness targets.

## Eric products

| Product | Before | After | Published values used | Rule | Manufacturer source | Verification status |
|---|---:|---:|---|---|---|---|
| Nature's Logic Canine Pork Meal Feast | 75 in the reproduced broken mapper path | 35 maximum; Nutritional Balance 25 maximum | Calcium 5.34% DM; phosphorus 2.84% DM; Actual Analysis; all life stages | Calcium exceeds the 1.8% AAFCO profile maximum | https://natureslogic.com/dog-products/canine-dry-kibble-pork/ | Verified on the live manufacturer page and in production |
| Nature's Logic Distinction Canine Pork Recipe | Prior production score not captured; nutrient category was hard-wired to the no-data path | 35 maximum; Nutritional Balance 25 maximum | Calcium 3.52% DM; phosphorus 1.96% DM; Actual Analysis; all life stages | Calcium exceeds the 1.8% AAFCO profile maximum | https://natureslogic.com/dog-products/distinction-canine-pork-recipe/ | Verified on the live manufacturer page and in production; food form corrected from wet to dry |

The end-to-end regression also proves that a comparable Typical Analysis scores 19 Nutritional Balance points above the same values presented only as Guaranteed Analysis. A Guaranteed Analysis is never promoted to Typical/Actual, and ingredient text is never used to infer nutrient levels.

## Newly capped-product review

The Hill's and Fromm migration payloads contain no dog calcium value above the applicable threshold based on their encoded product/life-stage identities. The two Nature's Logic products above are the only known newly capped formulas in this change set. Representative Hill's HTML and Fromm PDF extraction formats were independently confirmed against their official manufacturer sources.

## Coverage

- Before enrichment: 2 numeric published-analysis rows, both versions of the same Nature's Logic formula (~0.008% of the catalog, per the release audit).
- Production after enrichment: 304 exact rows with numeric Typical/Actual Analysis, 0 rows with numeric Guaranteed Analysis in the normalized GA object, and 25,901 rows without normalized numeric analysis, across 26,205 total rows.
- Production catalog readiness: 16,300 ready rows, 99.96% verified ingredient/image coverage, 396 ready brands, 9,376 dog rows, and 6,919 cat rows.
- The Fromm payload preserves image/PDF-only profiles as `requires_verified_extraction` rather than promoting them.
- The existing acquisition backlog is 10,386 open/in-progress rows affecting 14,068 products; this fails the repository's zero-backlog completeness target and is not modified by this scoring release.
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
- The exact Nature's Logic repair migration deleted `analysis_cache` rows for the two manufacturer URLs; the post-deployment count is zero.

## Verification completed

- `check:syntax`, `check:claims`, `check:privacy`, `check:pet-safety`, `check:release`
- `check:resolver-contract`, `check:nutrition-scoring` (9 real-path cases), `check:published-analysis`
- `check:catalog-miss`, `check:revenuecat`, `check:edge`, `check:catalog`, `check:catalog-scraper`
- `check:sql` (817 migrations), `check:deployment`, `check:accessibility`, `check:analytics`, `npm run verify`
- Clean `npm ci`; Deno typecheck for all 5 Edge Functions; live Edge audit-version verification
- Manufacturer verification for both Nature's Logic pages plus representative Hill's HTML and Fromm PDF sources
- Production correction migration, cache invalidation, production coverage query, and live Edge deployment
- Dependency gate: 0 high/critical production advisories; 12 moderate Expo-toolchain advisories remain tracked
- Signed EAS production build for iOS `1.2.3` build `56`; successful App Store Connect upload and Apple processing; internal TestFlight status `Ready to Submit`
- App Store Connect `1.2.3` preparation with build `56`, release notes, review contact, immediate all-user release, and automatic release after approval

Blocked/not run before submission: TestFlight device scans; accessibility smoke; App Store privacy/listing live evidence; RevenueCat purchase/restore evidence; Sentry/KPI evidence. App Review submission is complete and Apple reports `Waiting for Review`. The full preflight passes through dependency auditing but the catalog completeness gate fails on the existing brand/backlog targets.

## Eric decision: GA plus moisture transparency credit

Current approved rubric gives the 5-point dry-matter comparability bonus only to Typical/Actual Analysis. A GA plus source-backed moisture can be converted for safety screening but receives no bonus. Recommendation for Eric's review: consider a smaller 2-point comparability credit for GA plus moisture, while keeping the 12-point Typical-vs-GA base gap and 2-point mineral-disclosure gap. This would reward useful disclosure without treating minimums/maximums as actual values. This proposal is **not implemented**.

## Remaining release gate

The reviewed production migration and both changed Edge Functions are deployed and verified. The signed `1.2.3` build `56` is submitted to Apple and is `Waiting for Review`. App Store Connect is configured to release the update automatically to all users immediately after approval. The open real-device, purchase/restore, privacy/listing, Sentry/KPI, and catalog-completeness evidence remains a post-submission operational risk record.
