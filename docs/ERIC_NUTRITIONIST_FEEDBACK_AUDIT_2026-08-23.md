# Eric nutritionist feedback audit — 2026-08-23

## Scope

The complete Messages thread with **Eric Pet Food Nutritionist** was reviewed from its first June 18, 2026 message through the latest Nature's Logic Pork Meal Feast/calcium example. This document maps every actionable point to the current app behavior or to the implementation completed in this change.

## Feedback coverage

| Eric feedback | App status | Evidence / implementation |
|---|---|---|
| App became smoother, snappier, and generally better | Positive observation; retain as a regression expectation | Existing deployment and scan-latency checks remain in place. |
| Customer said barcode scanning “doesn’t work at all” | Covered and promoted to a named regression gate | The scanner accepts UPC-A/UPC-E/EAN-8/EAN-13 automatically, sends the barcode into the verified exact-version resolver, and falls back to an ingredient-panel capture when the barcode is absent, unknown, unverified, or version-conflicted. `check-product-resolver-contract.mjs` now locks this wiring. |
| Customer sometimes reached a white screen after analysis | Covered and promoted to a named regression gate | Empty/invalid completed payloads are converted into a visible `ErrorState` with retry/rescan actions. Unexpected render crashes are caught by the app-level recovery screen and reported without PII. The resolver contract now fails if these guards disappear. |
| Beneful Originals was returned as Purina Pro Plan cat food | Covered | Exact brand-family and species gates prevent a Purina parent-brand collision; named Eric regression fixtures are in the resolver/catalog checks. |
| Moist & Meaty was returned as Purina ONE puppy food | Covered | Same hard brand-family/species/variant protections; unsafe cross-line matches abstain. |
| Several Royal Canin scans timed out | Covered | Bounded lookup, retry/recovery, and extensive Royal Canin exact-product coverage/regressions are present. |
| Scan showed several same-brand products instead of the exact package | Covered | The resolver requires exact species/line/variant evidence before auto-opening; ambiguous results remain choices and can safely abstain. |
| Hill's Science Diet was absent or classified as a treat/topper | Covered | Complete-food classification requires corroborating local evidence; official Hill's shelf-brand aliases and exact records are guarded. |
| Open Farm RawMix Wild Ocean exact flavor was missing | Covered | Exact Wild Ocean identity, package aliases, GTINs, dog/cat boundary, and sibling-recipe regressions are present. |
| Replace “filler” with “Low nutrient binders” | Completed in this change | User-facing deterministic scoring and server analysis prompts now use **Low-Nutrient Binders**. |
| Nutritional balance is one of the most important criteria | Completed in this change | Nutritional Balance now carries 30% of deterministic and server-prompt scoring weight, the largest single category. |
| Guaranteed Analysis does not tell the full story | Completed in this change | Guaranteed minimum/maximum data is explicitly labeled limited and no longer receives the same transparency credit as typical/actual analysis. |
| Typical Analysis on a dry-matter basis is more accurate for comparison | Completed in this change | Catalog normalization accepts typical/actual and dry-matter data, converts as-fed values when moisture is available, displays basis, and awards fuller-disclosure credit. |
| Reward companies that disclose full nutrient information | Completed in this change | Typical dry-matter disclosure earns more balance credit and a positive transparency note; missing fuller data is scored conservatively. |
| Penalize formulas with off nutrient levels | Completed in this change | Source-backed dog calcium above the applicable AAFCO profile maximum and Ca:P outside 1:1–2:1 cap balance and overall scores and surface a veterinarian-oriented caution. |
| Nature's Logic can look strong by ingredients while actual calcium is too high | Completed for the exact example | The official Pork Meal Feast Actual Analysis (41.5% protein, 15% fat, 2.96% fiber, 5.34% calcium, 2.84% phosphorus, dry matter) is preserved by `20260823214634_enrich_natures_logic_pork_actual_analysis.sql` and propagated only to the ingredient-identical verified serving row by `20260823214758_propagate_natures_logic_pork_actual_analysis_to_exact_version.sql`. A regression proves the result is capped at 35 and cannot be rated highly from ingredients alone. |
| App name should be distinctive in App Store search | Already being addressed in the existing rebrand work | Current dirty worktree contains the shared brand configuration and replacement of hard-coded legacy-name strings. This change did not overwrite that work. |
| Competitor “Snout: Dog Food Scanner” was shared for comparison | Product input recorded | No competitor claims or copied behavior were introduced. Eric's concrete correctness and nutrition points were implemented directly. |

## Review-request behavior

The app now asks early, but not after the very first impression:

- First request: after **2 successful pet-food results scoring 70+**.
- Timing: the existing 4.8-second delay remains, and the card does not stack with first-scan, guest-save, or upgrade prompts.
- Free-plan sequencing: the second successful result remains eligible when one scan is left; the upgrade card waits until the third free scan so the asks do not stack.
- Repeat eligibility: at least **4 additional successful results** must occur after the previous request.
- Cooldowns: **21 days**, then **60 days**, then **120 days** for later requests.
- Paywall protection: an exhausted free-plan result is reserved for the upgrade moment instead of also showing a review request.
- User control: **I already reviewed** permanently suppresses future requests for that account/device scope.
- The Profile screen retains a permanent, user-initiated **Rate app** entry.

App Store and Play Store APIs do not reveal whether a specific user actually submitted a review. The app therefore does not pretend it can verify submission; it uses respectful reminders until the user explicitly marks the review complete.

The rating CTA is an explicit user action and opens the store's write-review page. Apple documents this deep-link pattern for a user-initiated review action and recommends requesting feedback after a satisfying completed task without interrupting the task itself.

## Nutrient-screening guardrails

- Mineral comparisons are made only when values are already dry matter or can be converted from as-fed values using published moisture.
- Ingredient names never generate invented calcium or phosphorus values.
- The result explains the source basis and avoids diagnosing disease.
- High/out-of-range findings recommend confirming suitability with a veterinarian.
- Foods substantiated by feeding trials can differ from profile-formulated foods; the app presents a profile-screen conflict, not a regulatory violation claim.

Primary references used:

- AAFCO, Revised Dog and Cat Food Nutrient Profiles (dry-matter profiles and moisture conversion): https://www.aafco.org/wp-content/uploads/2023/01/Pet_Food_Report_Annual_2014-Appendix_A-Revised_AAFCO_Nutrient_Profiles-Final_092214.pdf
- AAFCO, Reading Labels (Guaranteed Analysis meaning and limitations): https://www.aafco.org/consumers/understanding-pet-food/reading-labels/
- FEDIAF Nutritional Guidelines 2025 (dry-matter comparison and Ca:P guidance): https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf
- Nature's Logic, Canine Pork Meal Feast official Actual Analysis: https://natureslogic.com/dog-products/canine-dry-kibble-pork/
- Apple, Requesting App Store reviews: https://developer.apple.com/documentation/StoreKit/requesting-app-store-reviews

## Verification gates

- `npm run check:resolver-contract`
- `npm run check:syntax`
- `npm run check:sql`
- `npm run check:edge`
- Deno frozen-lock type-check for all five Edge Functions
- `npm run check:catalog`
- `npm run check:accessibility`
- `npm run check:privacy`
- `npm run check:claims`
- `npm run check:analytics`
- `npm run check:crash-reporting`

Live production verification on 2026-08-23 confirmed that exact-title search for Nature's Logic Canine Pork Meal Feast returns the verified dog/all-life-stages serving row with the official Actual Analysis. The `analyze` Edge Function is active at version 74 with audit marker `2026-08-23-edge-eric-nutrient-balance-v1`.
