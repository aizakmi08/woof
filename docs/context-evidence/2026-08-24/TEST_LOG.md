# Woof 1.2.2 release-candidate test log — 2026-08-24

## Scope and evidence rules

- **Candidate:** `codex/release-cut-1.2.2-20260824`, code commit `7b9178e5` plus this evidence-only commit.
- **Simulator:** iPhone 17 Pro, iOS 26.5, native bundle `io.woof.app`, dark appearance.
- **Evidence:** screenshots are in [`screenshots/`](./screenshots/). Development-only QA fixtures were used for camera, entitlement, and result branches that cannot be driven deterministically with Simulator hardware.
- **Status rule:** `PASS` means the complete simulator-testable acceptance path worked. `SIMULATOR-LIMITED` means physical camera, StoreKit/TestFlight, VoiceOver, or real-device evidence is still required. Simulator-limited work is not counted as passing.
- **Production-data rule:** fixtures ran with the dry-result guard. The Hill's exact-result exercise left the guest profile scan count at `2 -> 2` and `scan_history` at `2 -> 2`. No fixture catalog contribution was submitted. The test guest was deleted with both in-app confirmations; the former auth user returns HTTP 404 and both its profile and scan-history counts are zero.

## Release fixes and validation ownership

| Item | Commit | Validation |
|---|---|---|
| A1.1–A1.5: Terms, privacy, App Store/Pro copy, privacy inventory, and copy contracts | `d9f5a8ae` | Claims, privacy, release, deployment, and live-listing checks passed. |
| A2.6: preserve mode-specific first loading message and retain the intended slow-loading threshold | `c79b3d14` | Syntax and resolver-contract checks passed; simulator result branches rendered correctly. |
| A2.7: typed-search misses fall through to summary telemetry; add zero/nonzero behavioral cases | `c79b3d14` | `check:catalog-miss` passed. |
| A2.8: restore ingredient provenance/status catalog gate | `c79b3d14` | `check:catalog` passed. |
| A2.9: restore the real persisted OAuth session when a late anonymous sign-in is discarded | `c79b3d14` | Entitlement/auth resilience and edge checks passed. |
| A2.10: purge false `ambiguous_same_line` telemetry | no code change | Dry run found 0 matching rows; confirmed purge was a 0-row no-op. Before 0, after 0. Invariants: ambiguous rows 0, purgeable 0, legitimate resolved rows 0. |
| A3.11: align the live title expectation with the current listing | `8f77b124` | Live listing passed in 0.80 s: Woof Pet Food Scanner 1.2.1, one rating; no DogFoodAdvisor, CatFoodAdvisor, or recall-alert claims. |
| Restore missing clean-tree resolver fixtures and current Deno lock | `2fe474bc` | Resolver-contract and edge-types checks passed. |
| Repair release validation gates exposed by the complete run | `7b9178e5` | Catalog, SQL, and deployment checks passed. |

## Automated test tiers

The requested cheapest-first order was followed. A failed suite was repaired and only that suite was rerun before continuing. The single final `npm run verify` gate ran against evidence commit `52461a2e`; the commit after it changes this log only.

| Tier | Check | Final status | Final time | Earlier attempt, when applicable |
|---|---|---:|---:|---|
| Static | `check:syntax` | PASS | 7.18 s | — |
| Static | `check:claims` | PASS | 0.057 s | — |
| Static | `check:privacy` | PASS | 0.040 s | — |
| Static | `check:pet-safety` | PASS | 0.052 s | — |
| Static | `check:release` | PASS | 0.054 s | — |
| Behavioral | `check:resolver-contract` | PASS | 0.103 s | Failed first because the committed release tree lacked the expected regression fixtures/audit/loading assertions; repaired in `2fe474bc` and `7b9178e5`. |
| Behavioral | `check:catalog-miss` | PASS | 0.038 s | — |
| Behavioral | `check:revenuecat` | PASS | 0.041 s | — |
| Behavioral | `check:edge` | PASS | 0.039 s | — |
| Behavioral | `check:edge-types` | PASS | 0.495 s | First attempt failed in 0.700 s on a stale Deno lock; lock restored in `2fe474bc`. |
| Contract | `check:catalog` | PASS | 9.185 s | Earlier attempts exposed stale gates and then a variable typo; both were repaired before the final pass. |
| Contract | `check:catalog-scraper` | PASS | 3.852 s | — |
| Contract | `check:sql` | PASS | 0.601 s | — |
| Contract | `check:deployment` | PASS | 0.052 s | — |
| Contract | `check:accessibility` | PASS | 0.083 s | — |
| Contract | `check:analytics` | PASS | 0.034 s | — |
| Network | `check:live-listing` | PASS | 0.80 s | Initial run failed in 0.58 s because the gate expected the previous title; the live content itself was clean. |
| Clean checkout | fresh `npm ci` + `expo export --platform ios` | PASS | not retained | Detached clean worktree at `7b9178e5`; iOS export completed and produced `dist`, then the worktree was removed. |
| Final gate | `npm run verify` | PASS | 0.13 s | Run exactly once; project verification passed with 812 migrations. |

## Native build record

The disposable iOS project was generated in 2.19 s and CocoaPods completed in 49.03 s. The app was built once successfully and then reused for the full simulator session. The unsuccessful attempts are retained here because they were environment/release-script findings, not hidden:

| Attempt | Status | Time | Result |
|---:|---|---:|---|
| 1 | FAIL | 264.4 s | Native compilation completed, but the final Sentry upload step lacked a local organization setting. |
| 2 | FAIL | 25.7 s | Launch environment did not propagate to the Xcode script phase. |
| 3 | FAIL | 88.5 s | The Sentry script requires the literal value `true`, not `YES`. |
| 4 | PASS | 96.0 s | Built and launched with the local-only Xcode argument `SENTRY_DISABLE_AUTO_UPLOAD=true`; no production configuration was changed. |

## Simulator scenario matrix

| # | Scenario | Status | Result and evidence |
|---:|---|---|---|
| 1 | Dark cold start and launch timing | PASS | Dark splash had no white/black logo tile; first measured cold start to interactive Home was 950 ms. Evidence: [`01-dark-splash.jpg`](./screenshots/01-dark-splash.jpg), [`02-cold-start-timing.jpg`](./screenshots/02-cold-start-timing.jpg). |
| 2 | Onboarding to Scan Now | PASS | Dark onboarding rendered and Scan Now opened the front-label scanner with camera permission granted. Evidence: [`03-onboarding-dark.jpg`](./screenshots/03-onboarding-dark.jpg), [`04-onboarding-scan-front-label.jpg`](./screenshots/04-onboarding-scan-front-label.jpg). |
| 3 | Hill's Adult 7+ Small & Mini 15.5 lb exact result | PASS | OCR-backed live resolver auto-confirmed the exact verified package, rendered the correct photo/name/size and score 65, and abstained from writing because the dry-result guard was on. Server counts remained scan count `2 -> 2`, history `2 -> 2`. Evidence: [`05-hills-adult-7-exact-result.jpg`](./screenshots/05-hills-adult-7-exact-result.jpg). Physical bag recognition remains scenario 4. |
| 4 | Real shelf-label camera recognition | SIMULATOR-LIMITED | Simulator cannot photograph the real Hill's bag or Eric product set, so no physical-recognition PASS is claimed. Exact/sibling-abstention resolver contracts passed. |
| 5 | Typed search, package sizes, and one status | PASS | Real Product Search for `science diet small` returned verified Small & Mini candidates including 15.5 lb; package-aware candidates showed distinct 5 lb/15 lb chips and one status header. Evidence: [`06-size-chips-single-status.jpg`](./screenshots/06-size-chips-single-status.jpg), [`08-typed-search-science-diet-small.jpg`](./screenshots/08-typed-search-science-diet-small.jpg). |
| 6 | None of These to ingredient capture | PASS | None of These reached ingredient capture; Scan Privately was selected so no catalog contribution was written. Evidence: [`07-none-of-these-ingredient-capture.jpg`](./screenshots/07-none-of-these-ingredient-capture.jpg). |
| 7 | Barcode verified/unverified routing | SIMULATOR-LIMITED | Fixture and route-contract paths worked, and known-unverified routed truthfully to ingredient capture. Simulator camera cannot prove recognition of a physical verified barcode. Evidence: [`09-barcode-unverified-fallback.jpg`](./screenshots/09-barcode-unverified-fallback.jpg). |
| 8 | Human-food safe and dangerous results | PASS | Both deterministic safety branches rendered. Evidence: [`10-human-food-safe.jpg`](./screenshots/10-human-food-safe.jpg), [`11-human-food-dangerous.jpg`](./screenshots/11-human-food-dangerous.jpg). |
| 9 | Results free, personalized AVOID, and Pro | PASS | Free layout, conflicting-profile AVOID banner, and complete Pro result layout rendered without stacked or contradictory states. Evidence: [`12-results-free.jpg`](./screenshots/12-results-free.jpg), [`13-results-avoid-profile.jpg`](./screenshots/13-results-avoid-profile.jpg), [`14-results-pro.jpg`](./screenshots/14-results-pro.jpg). |
| 10 | Paywall offerings failure and Retry | PASS | Offerings-failure state exposed a working Retry path. Evidence: [`15-paywall-offerings-retry.jpg`](./screenshots/15-paywall-offerings-retry.jpg). |
| 11 | Real purchase, restore, cancellation, offline Pro persistence | SIMULATOR-LIMITED | The UI and sandbox failure states are exercised, but the required TestFlight purchase/restore/cancel and airplane-mode restart must run on a physical device. |
| 12 | Entitlement recovery fixtures | PASS | Refresh-network failure retained session, cached-Pro cold-start behavior retained Pro despite failed profile fetch, and out-of-order webhook handling passed. Evidence: [`16-entitlement-refresh-network-pass.jpg`](./screenshots/16-entitlement-refresh-network-pass.jpg), [`17-entitlement-cached-pro-pass.jpg`](./screenshots/17-entitlement-cached-pro-pass.jpg), [`18-entitlement-webhook-order-pass.jpg`](./screenshots/18-entitlement-webhook-order-pass.jpg). |
| 13 | Test guest deletion | PASS | Both destructive confirmations completed. Former user `7ba4ba5f-f372-402f-9312-540dd1a86aa4` returns 404; profile and history counts are zero. Relaunch created a clean new guest surface. Evidence: [`19-final-account-deletion.jpg`](./screenshots/19-final-account-deletion.jpg). The deleted account and rows are not recoverable through the app. |

**Scenario totals:** 10 PASS, 0 FAIL, 3 SIMULATOR-LIMITED.

## Required physical-device checklist

- Scan the real Hill's Adult 7+ Small & Mini 15.5 lb bag plus Eric's set: Beneful, Moist & Meaty, Royal Canin, Nutrish, IAMS, Hill's, Open Farm, and Nutro. Exercise glare, blur, and tall-bag angles and verify exact-match-or-abstain.
- In TestFlight, complete a real purchase, restore, and cancellation; confirm Pro survives airplane mode and an app restart.
- Have Eric confirm the build on his own device.
- Run VoiceOver over Home, Scanner, Results, and Paywall.
- Before App Review submission, confirm the live App Store page contains no DogFoodAdvisor, CatFoodAdvisor, or recall-alert claims.
