# Woof iOS Simulator UX Test Log — 2026-08-23

## Scope and evidence rules

- **Tested:** 2026-08-23 on iPhone 17 Pro Simulator (`iOS`, Debug development client, bundle `io.woof.app.debug`).
- **Evidence:** screenshots in [`screenshots/`](./screenshots/). Fixtures and development-only QA routes were used for recognition/result branches that a simulator camera cannot produce reliably.
- **Status rule:** `PASS` means the simulator-testable acceptance path worked. `BLOCKED` means the requested proof depends on unavailable hardware, deterministic network controls, or StoreKit products. No blocked item is counted as passing.
- **Production-data rule:** no fixture writes were sent to the live catalog. Each temporary anonymous user was deleted through the in-app two-confirmation deletion flow; the final clean signed-out state after the dark/maximum-text Results pass is [`31-final-guest-deletion-complete.png`](./screenshots/31-final-guest-deletion-complete.png). The first live-resolver proof consumed one guest scan before the new development-only dry-result guard was added; later resolver fixtures do not mutate scan counts or history.

## Performance measurements

| Metric | Before | After | Delta | Scope |
|---|---:|---:|---:|---|
| Development-client launch to usable app | 6,797 ms | 6,483 ms | 314 ms faster (4.6%) | Same simulator and cached Metro bundle; includes native launch/Metro overhead. |
| JS boot to first interactive app surface | Not previously instrumented | 83 ms | New direct measurement | App timer from JS module load to first interactive route. |
| Primary scan tap to camera-ready screen | Not previously instrumented | 24 ms | New direct measurement | Home/QA navigation timestamp to mounted scanner. |
| Blank simulator label capture to terminal recovery | Not previously instrumented | about 3.4 s wall-clock | New recovery measurement | Blank camera frame reached a truthful no-match recovery screen; not a product-recognition success. |
| Live Hill's Adult 7+ label resolver: capture start to exact result | Not trustworthy under the previous double-fire path | 4,040 ms | First reliable end-to-end measurement | Real catalog resolver and exact 15.5 lb product; OCR text was injected because Simulator cannot photograph a physical bag. |

The current performance overlay is captured in [`24-measured-performance.png`](./screenshots/24-measured-performance.png). The app now also records `capture_to_result` at the terminal label-lookup outcome so future device runs can compare real-package scans rather than simulator blanks.

## Scenario matrix

| # | Scenario | Status | Result and evidence |
|---:|---|---|---|
| 1 | Cold start, splash, onboarding, scan-now routing | PASS | Branded UI painted immediately; two onboarding pages only; scan action is present from both pages and passes `initialMode: label`. Evidence: [`01-onboarding-scan-first.png`](./screenshots/01-onboarding-scan-first.png), [`02-onboarding-personal-fit.png`](./screenshots/02-onboarding-personal-fit.png), [`20-dark-mode-home.png`](./screenshots/20-dark-mode-home.png), [`24-measured-performance.png`](./screenshots/24-measured-performance.png). |
| 2 | Guest auto sign-in; network-off failure and retry | BLOCKED | Normal guest creation/retry and retained guest button were verified, but this environment did not expose deterministic per-app network loss. The failure branch was code-reviewed; a true network-off → recovery transition still requires a device/network-link-conditioner run. |
| 3 | Home states, filters/search/expand/compare/free status | PASS | Empty and populated fixture history render without overlap; filters, search, expand, comparison entry, and free-scan status were exercised. Evidence: [`03-home-empty-free.png`](./screenshots/03-home-empty-free.png), [`04-home-populated-history.png`](./screenshots/04-home-populated-history.png), [`20-dark-mode-home.png`](./screenshots/20-dark-mode-home.png), [`21-max-text-home.png`](./screenshots/21-max-text-home.png). |
| 4 | Scanner permission, denial recovery, modes and framing | PASS | Permission denial exposes Open Settings; label mode opens directly and each scanner mode has distinct guidance. Evidence: [`22-camera-permission-denied.png`](./screenshots/22-camera-permission-denied.png), [`23-front-label-scanner.png`](./screenshots/23-front-label-scanner.png). **Device-only physical shelf recognition and haptic feel remain BLOCKED.** |
| 5 | Label fixtures: exact, candidates, none, unreadable, timeout, stages | PASS | Exact fixture auto-opened; candidate rows showed package-size chips; None of These promoted ingredient capture with consent; unreadable and timeout states had next actions; the long-running state exposed Cancel and Search by Name. Evidence: [`05-exact-match-free-result.png`](./screenshots/05-exact-match-free-result.png), [`06-multiple-package-candidates.png`](./screenshots/06-multiple-package-candidates.png), [`07-label-not-readable-fallback.png`](./screenshots/07-label-not-readable-fallback.png), [`08-label-timeout-search-recovery.png`](./screenshots/08-label-timeout-search-recovery.png), [`09-label-long-running-cancel-search.png`](./screenshots/09-label-long-running-cancel-search.png). Real-package camera recognition remains device-only. |
| 6 | Typed search states | PASS | Verified results, typo correction, species filtering, completed empty result, timeout, and Retry were exercised with deterministic fixtures. Evidence: [`10-typed-search-typo-correction.png`](./screenshots/10-typed-search-typo-correction.png), [`11-search-timeout-retry.png`](./screenshots/11-search-timeout-retry.png). |
| 7 | Barcode verified/unverified/not-found paths | BLOCKED | Route contracts and fixture-backed recovery were code-verified: verified opens a result, known-unverified keeps candidate identity and routes to ingredient capture, failed values are remembered to prevent re-trigger loops. The simulator camera cannot prove real barcode recognition; physical-device evidence is still required. |
| 8 | Ingredient consent, submission outcome, failed parse | PASS | None-of-these reaches ingredient capture; consent offers Scan Privately, Share for Review, and Cancel; private mode proceeds without implying catalog submission. The capture failure returned a truthful retry/search recovery rather than a false saved claim. Related evidence: [`06-multiple-package-candidates.png`](./screenshots/06-multiple-package-candidates.png), [`07-label-not-readable-fallback.png`](./screenshots/07-label-not-readable-fallback.png), [`23-front-label-scanner.png`](./screenshots/23-front-label-scanner.png). |
| 9 | Human-food pet selection, safety states, history labeling | PASS | Saved-pet context and safe/dangerous fixtures were opened; history uses labeled safety pills and no longer maps unknown to danger. Evidence: [`04-home-populated-history.png`](./screenshots/04-home-populated-history.png), [`15-human-food-safe.png`](./screenshots/15-human-food-safe.png), [`16-human-food-dangerous.png`](./screenshots/16-human-food-dangerous.png). Caution/unidentified behavior was inspected in the fixture mapping and history UI; a physical-camera capture remains device-only. |
| 10 | Results streaming, free, avoid, Pro, share/sheet, dark/max text | PASS | Partial state reserves the score slot and advances messages; free result avoids a gated “breakdown below” promise; personalized avoid verdict sits beside the score; Pro fixture renders the full breakdown. A complete AVOID Results traversal was performed from hero through the final action at `accessibility-extra-extra-extra-large` in dark mode with no overlap or unreachable control. Evidence: [`05-exact-match-free-result.png`](./screenshots/05-exact-match-free-result.png), [`12-personalized-avoid-result.png`](./screenshots/12-personalized-avoid-result.png), [`13-pro-full-result.png`](./screenshots/13-pro-full-result.png), [`14-partial-streaming-result.png`](./screenshots/14-partial-streaming-result.png), [`29-dark-max-text-results.png`](./screenshots/29-dark-max-text-results.png), [`30-dark-max-text-results-bottom.png`](./screenshots/30-dark-max-text-results-bottom.png). |
| 11 | Scan accounting and limit recovery | PASS | Fixture scans do not consume production quotas; code paths gate retries through server-backed `canScan`, reverse eligible failures, surface “not counted,” and offer saved results before a repeated barcode consumes another scan. The server-authority resolver contract and pet-safety checks passed after the changes. |
| 12 | Paywall, badges, disclosure, offerings retry, restore/purchase | BLOCKED | Entry points, persistent badges, trial-end disclosure, and offerings-failure Retry were tested: [`19-paywall-offerings-retry.png`](./screenshots/19-paywall-offerings-retry.png). The local RevenueCat/StoreKit configuration returned no purchasable products, so the real purchase sheet, activation, and restore outcomes remain BLOCKED. |
| 13 | Profile, pet editor, avoid counter, rate/legal/auth/deletion | PASS | Profile top and support/legal/delete controls were exercised; guest deletion required two confirmations and returned to auth. This was repeated after the final accessibility run so no QA guest or its history remained. Evidence: [`25-profile-top.png`](./screenshots/25-profile-top.png), [`26-profile-support-legal-delete.png`](./screenshots/26-profile-support-legal-delete.png), [`28-guest-deletion-complete.jpg`](./screenshots/28-guest-deletion-complete.jpg), [`31-final-guest-deletion-complete.png`](./screenshots/31-final-guest-deletion-complete.png). A VoiceOver pass remains device/Appium work. |
| 14 | First-result, guest-save, review and post-scan prompts | PASS | Prompt sequencing was exercised without stacked overlays; review request becomes eligible only when its card enters the viewport and can be dismissed. Evidence: [`18-review-prompt-visible.png`](./screenshots/18-review-prompt-visible.png). |
| 15 | Offline/analysis/history/ErrorBoundary recovery | BLOCKED | Analysis error and one-shot ErrorBoundary recovery worked: [`17-analysis-error-recovery.png`](./screenshots/17-analysis-error-recovery.png), [`27-error-boundary-recovery.png`](./screenshots/27-error-boundary-recovery.png). Unrestorable history routes to prefilled search in code. A deterministic airplane-mode scan was not available, so the complete scenario remains BLOCKED. |

**Scenario totals:** 11 PASS, 0 FAIL, 4 BLOCKED. The four blocked scenarios are 2, 7, 12, and 15.

## Defects found during the simulator pass and fixed

1. Scanner startup crashed on a stale `SCAN_Y` layout constant. Replaced it with dynamic geometry and reran the camera flow.
2. The development QA entry overlapped the Expo development control. Moved it below the header content.
3. Label fixtures were replaced by the live search debounce. Development fixtures now bypass that refresh path.
4. Candidate fixtures did not prove package differentiation. Added visible 5 lb/15 lb evidence and a stable size chip.
5. Development fixtures consumed free scans. Fixture routes now opt out of scan accounting.
6. The partial-result fixture rendered a completed result. It now holds the loading model open and proves the staged skeleton.
7. Human-food fixture Back navigation left the QA harness. Added an explicit development return path.
8. ErrorBoundary retry immediately threw again. The development trigger is now armed once, so Try Again recovers.
9. The native development build forced `UIUserInterfaceStyle=Light` despite automatic appearance configuration. Removed the native override and rebuilt; dark Home now renders correctly.
10. Capture-to-result timing stopped at Results only, so terminal label no-match/candidate screens were unmeasured. Product Search now closes the timing at its terminal outcome.
11. Typed search used the lightweight identity RPC and lost package-aware ranking. It now uses the full verified catalog search; “science diet small” keeps Small & Mini names and 15.5 lb variants visible.
12. Label candidates inherited the typed-search rank floor, which discarded exact low-ranked identity-RPC results. Label resolution now applies readiness verification without that unrelated rank cutoff.
13. Adult 7+ and Adult 11+ collapsed into one generic senior identity. Formula keys and OCR compatibility now preserve the visible adult age band and reject the sibling formula.

## Clean-checkout release proof

- A detached clean worktree installed dependencies, generated the iOS project, completed CocoaPods, built the `woof` Debug app for iPhone 17 Pro Simulator, and launched bundle `io.woof.app`. Sentry source-map upload was disabled for the local build because clean-checkout release secrets are intentionally absent.
- Clean cold launch reached the interactive app in 1,912 ms with no visible light flash in dark appearance: [`38-clean-dark-cold-launch.jpg`](./screenshots/38-clean-dark-cold-launch.jpg).
- Exact and ambiguous label behavior is recorded in [`32-clean-exact-match-auto-open.jpg`](./screenshots/32-clean-exact-match-auto-open.jpg), [`33-clean-label-candidates-size-chips.jpg`](./screenshots/33-clean-label-candidates-size-chips.jpg), [`35-clean-hills-adult-7-15-5-live-resolver.jpg`](./screenshots/35-clean-hills-adult-7-15-5-live-resolver.jpg), and [`36-clean-hills-adult-7-exact-label-match.jpg`](./screenshots/36-clean-hills-adult-7-exact-label-match.jpg).
- Typed package-aware search is recorded in [`34-clean-typed-science-diet-small-sizes.jpg`](./screenshots/34-clean-typed-science-diet-small-sizes.jpg). The reliable capture-to-result measurement is recorded in [`37-clean-measured-performance-after.jpg`](./screenshots/37-clean-measured-performance-after.jpg).
- Entitlement recovery QA passed for token-refresh network failure, cached Pro with profile fetch failure, and out-of-order RevenueCat webhook delivery: [`39-clean-entitlement-network-failure-pass.jpg`](./screenshots/39-clean-entitlement-network-failure-pass.jpg), [`40-clean-entitlement-cached-pro-pass.jpg`](./screenshots/40-clean-entitlement-cached-pro-pass.jpg), and [`41-clean-entitlement-webhook-order-pass.jpg`](./screenshots/41-clean-entitlement-webhook-order-pass.jpg).

## Required follow-up outside the simulator

- Scan the reported Hill's, Nutrish, and IAMS shelf packages on a physical iPhone; record exact/abstain outcomes and confirm no sibling substitution.
- Exercise a real RevenueCat sandbox purchase, pending/Ask-to-Buy activation, restore, and support fallback with products available.
- Run network-link-conditioner cases for cold guest creation, in-flight label scan, cached search, and retry recovery.
- Verify VoiceOver order/labels and physical haptics on a device.
- Retest shared pet-food and human-food cards through the system share sheet on a signed release build.
