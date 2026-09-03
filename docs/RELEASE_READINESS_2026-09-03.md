# Woof public-release readiness report

Date: 2026-09-03 (America/Los_Angeles)

Release branch: `codex/production-release-20260716`

Requested local marketing version: `1.2.2`
Decision: **BLOCKED — do not build or submit yet**

This report records what was actually tested. It does not claim that the app has no bugs. No production database mutation, EAS production build, App Store submission, phased-release change, or automatic-release change was performed.

## Executive decision

The release line is consolidated and the most important nutrition-scoring path is proved against a real production row. The quota boundary, deletion durability, GTIN index, and first-day KPI view are implemented and pass a disposable PostgreSQL test suite, but they are not deployed. Four independent release blockers remain:

1. Apple reports live version `1.2.4`; every local release file intentionally remains `1.2.2`. Apple will not accept a lower marketing version. The owner must authorize a new version greater than `1.2.4`; no version was changed here.
2. The four production boundary migrations and two changed Edge Functions are not deployed. The current live grants still permit the catalog quota bypass, the deletion tombstone is absent, and the normalized GTIN index and release KPI view do not exist.
3. The live catalog fails the existing completeness contract: 395 ready brands versus 750 required, 16,294 of 16,299 ready rows have verified ingredients, and 10,445 open queue rows affect 14,127 products. No assertion or threshold was weakened.
4. The full simulator matrix and real-iPhone checklist are incomplete. Shipping without them would make public users the first people to test physical packages, purchases, offline entitlement persistence, and VoiceOver in this build.

## 1. Branch consolidation

The release branch was fast-forwarded from the quality regimen and then merged with the three release-cut commits. Generated lockfiles were kept from the newer quality line; the release-cut UI/resolver safeguards were retained. One release-cut reference to an undefined `labelCandidate` was corrected while resolving the combined code.

| Branch | Tip | Status in release line | What it held |
| --- | --- | --- | --- |
| `codex/quality-regimen-20260902` | `a1658651` | CONTAINED | Executable quality regimen, resolver/mapper adversaries, quota and deletion hardening, camera timing fix, OCR line preservation, release-bundle fixture exclusion, final evidence. |
| `codex/nutrition-scoring-release` | `84861e4a` | CONTAINED | Build 54 nutrition-scoring and verified-catalog release baseline. |
| `codex/release-cut-1.2.2-20260824` | `7389fec4` | CONTAINED via merge `d46d013c` | False-positive label safeguards, Home hierarchy, and build-55 release instructions. |
| `codex/production-release-20260716` | release candidate | ACTIVE | Single consolidated release line. |

The unrelated dirty checkout was preserved on `codex/preserve-dirty-production-release-20260903`. Its Bowlproof work and catalog-script sprawl were not staged or committed.

## 2. Nutrition scoring: landed and reachable

Status: **PASS**

- `catalogProductToVerifiedProduct` now carries `hasPublishedNutrients` and the scorer's ingredient, nutrient, source, food-form, life-stage, and formula-evidence inputs.
- The three production-applied enrichment migrations were recovered into Git with byte-identical SQL:
  - `20260825235303_enrich_natures_logic_distinction_pork_actual_analysis.sql`
  - `20260826000824_enrich_published_typical_analysis_wave_1.sql`
  - `20260826001927_enrich_published_typical_analysis_wave_2.sql`
- `npm run test:live-scoring` queried the real `product_data` row for Nature's Logic Distinction Canine Pork and passed it through raw PostgREST normalization, `catalogProductToVerifiedProduct`, and `buildVerifiedPetFoodAnalysis`. It did not call the scorer with a hand-built polished fixture.
- Observed production inputs: published typical analysis, dry-matter calcium `3.52%`, dry-matter phosphorus `1.96%`, all life stages, and `has_published_nutrients=true`.
- Observed assertions: analysis type `typical`; basis `dry_matter`; concern `calcium_above_profile_maximum`; Nutritional Balance at most 25; overall score at most 35.

This proves that the old hard-wired balance score of 52 is no longer the production mapper outcome for the audited row.

## 3. Security disposition

| Item | Code/test status | Production status | Disposition |
| --- | --- | --- | --- |
| Parameter-trust counter RPCs | PASS | OPEN until migration | Live bodies derive identity from `auth.uid()`, so the UUID parameter is not currently a cross-user escalation. The client calls none of the three. The pending boundary migration revokes `authenticated` execution on all three and leaves service-role access only. |
| Full-catalog quota bypass | PASS | OPEN until migration + new binary | Teaser RPCs expose identity fields only. `consume_verified_catalog_product` atomically binds the scan ID to the product hash, consumes quota, and returns full ingredients/nutrients only on allowance. Direct ingredient/nutrient column grants and seven full-row RPC grants are revoked. |
| CI service-role secret scope | PASS | Applies when CI runs | The key is no longer job-scoped. A Boolean-only detection step selects the catalog check; the service key is injected only into that step. |
| Account deletion | PASS | OPEN until migration + webhook deploy | Deletion removes `analytics_events`, typed-query/submitted-ingredient `product_events`, scan/rate state, auth state, and every RevenueCat identifier location. A private SHA-256 tombstone rejects delayed RevenueCat inserts at both the webhook and database-trigger boundaries. |
| Repo/build hygiene | PASS | N/A | `.gitignore` covers `inputs/`, `output/`, `outputs/`, `tmp/`, `audit/`, and `.agent-preflight/`. `.easignore` excludes local data, docs, scripts, Supabase sources, secrets, and generated native folders. No tracked contract PDF, key, token capture, signing file, or provisioning profile was found. Secret scan passed 1,280 tracked/source files. |

Live read-only verification on 2026-09-03 showed `authenticated` still has full `product_data` and ingredient-column SELECT, all three dead counter RPCs remain executable, and none of the new atomic consumer, deletion-tombstone table, normalized-GTIN index, or release-monitoring view exists. This is why deployment is mandatory before a public binary.

### Approval-gated production migration set

These files are the exact SQL proposed for production. The SHA-256 values bind the approval to specific bytes:

| Order | Migration | SHA-256 | Change |
| --- | --- | --- | --- |
| 1 | `supabase/migrations/20260903204346_public_catalog_quota_boundary.sql` | `96e34858ffda74f66fb7a4eed9b47984e36cc8523ba3d0c4635065bd4ed38e24` | Revoke dead counters and full-row catalog access; add teaser reads and atomic quota consumption. |
| 2 | `supabase/migrations/20260903204347_durable_revenuecat_deletion_tombstones.sql` | `2c6e741ef745313ecd68c905d56eb266462f077e1b02979706355379143a37c3` | Add private deletion hashes, trigger rejection, and complete account cleanup. |
| 3 | `supabase/migrations/20260903204348_catalog_gtin_lookup_indexes.sql` | `b276d03eb8976f282a1d664dc5d336d51800eeec231bd2cb56d9ea749912278a` | Add normalized GTIN expression indexes. |
| 4 | `supabase/migrations/20260903204349_release_monitoring_kpis.sql` | `85ab1f476ebd27c3a02c51a67c4a03144159bcfdc7e266e80f01910abbaf7ca9` | Add service-role daily scan/resolver/catalog/paywall/restore health view. |

Because local and remote migration history are substantially divergent, **do not run `supabase db push --include-all`**. After explicit owner approval, apply the four files in order with the Supabase `apply_migration` operation against project `rhlgvrywjralxrjcdtrw`, using names `public_catalog_quota_boundary`, `durable_revenuecat_deletion_tombstones`, `catalog_gtin_lookup_indexes`, and `release_monitoring_kpis`, and the exact file contents above. That operation records each migration without replaying hundreds of unrelated local-only migrations.

Then deploy the two changed functions:

```sh
supabase functions deploy product-lookup revenuecat-webhook \
  --project-ref rhlgvrywjralxrjcdtrw \
  --use-api
```

Run the exact read-only validation and live proofs:

```sh
supabase db query --linked --project-ref rhlgvrywjralxrjcdtrw \
  --file supabase/validation/20260903_release_hardening_validation.sql
npm run check:live-catalog-performance
npm run test:live-scoring
```

Every validation row must be `pass=true`; live catalog performance must pass all scenarios; production scoring must pass. Any failure stops the release.

### Rollback

The coordinated emergency rollback is `supabase/rollback/20260903_release_hardening_rollback.sql`, SHA-256 `77ab0ceef604eb336843e46138a1cd8ca791d909d6ab960526a27ae87ba049ff`.

```sh
supabase db query --linked --project-ref rhlgvrywjralxrjcdtrw \
  --file supabase/rollback/20260903_release_hardening_rollback.sql
```

Use it only after rolling the mobile client and RevenueCat webhook back together. It drops the new consumer, teaser functions, tombstone protection, GTIN indexes, and release KPI view, and restores legacy authenticated full-catalog access. That deliberately reopens the quota and delayed-webhook risks. The dead counter RPCs remain revoked. Reapply later with a new forward migration; do not falsify migration history.

## 4. Stated blocker resolution

### Version gate

Status: **FAIL**

The gate now distinguishes all three semantic states: local ahead of live is a valid pending release, equality is aligned, and local behind live is a failure. The observed state is not the expected `1.2.2 > 1.2.1` case from the brief. Apple's live lookup returned version `1.2.4`, so the real state is `LOCAL_BEHIND_LIVE (1.2.2 < 1.2.4)`.

No version number was changed. Before building, the owner must authorize a replacement marketing version greater than `1.2.4` and its coordinated update across `app.json`, `package.json`, the lockfile, `store.config.json`, and release evidence.

### Dependency advisories

Status: **PASS — zero production vulnerabilities**

| Advisory | Path/reachability | Resolution |
| --- | --- | --- |
| `GHSA-vcc3-ghjq-m6fr`, `decode-uri-component` | Production transitive through `query-string` and React Navigation; reachable when navigation parses/serializes link query strings. | Override resolves `query-string@9.5.1` to patched `decode-uri-component@0.5.0`. |
| `GHSA-w5hq-g745-h8pq`, `uuid` | Declared production graph but used in Expo/Xcode build tooling; reachable during project generation, not as Woof's shipped runtime UUID path. | Override pins patched `uuid@11.1.1`, retaining CommonJS compatibility required by `xcode@3.0.1`. |

`npm ci`, `npm audit --omit=dev`, and the documented dependency gate report 0 moderate, 0 high, and 0 critical findings. No advisory baseline was raised.

## 5. Automated evidence and timings

The fail-fast preflight stopped at the first failure. Suites after that point were run separately and are labeled accordingly.

| # | Suite | Result | Observed time | Evidence |
| ---: | --- | --- | ---: | --- |
| 1 | Git whitespace | PASS | 0.05s | `git diff --check` |
| 2 | Secret scan | PASS | 0.22s | 1,280 files |
| 3 | JS syntax/product guards | PASS | 7.11s | 197 files |
| 4 | Nullable default-parameter safety | PASS | 0.59s | 52 app files; bad fixture detected |
| 5 | Product resolver contract | PASS | 1.14s | 6 tests |
| 6 | Behavioral coverage | PASS | 3.07s | 12 suites, 69 passed, 1 intentionally skipped; 51.01% statements / 41.81% branches / 57% functions / 54.66% lines |
| 7 | Catalog quality | PASS | 15.37s | Production contract checks |
| 8 | Catalog scraper contract | PASS | 3.35s | 28 fixtures |
| 9 | CI release alignment | PASS | 0.04s | 38 commands |
| 10 | GitHub release audit | PASS | 1.41s | Branch/PR/workflow contract |
| 11 | Analytics privacy | PASS | 0.06s | Redaction and event contract |
| 12 | App Privacy disclosure | PASS | 0.04s | Embedded/hosted disclosure alignment |
| 13 | Accessibility static gate | PASS | 0.08s | 13 files |
| 14 | Pet-profile safety | PASS | 0.04s | 8 scenarios |
| 15 | Claim safety and runtime Woof brand | PASS | 0.06s | 61 files at preflight; final dependency-free preflight also passed after the logger correction |
| 16 | App Store listing package | PASS | 0.04s | Length/claim rules |
| 17 | App Store screenshots | PASS | 0.05s | 18 assets structurally checked |
| 18 | EAS versioning contract | PASS | 0.04s | Local metadata consistency only |
| 19 | RevenueCat readiness | PASS | 0.04s | Static/native/CI contract |
| 20 | SQL migrations | PASS | 0.59s | 822 migrations at preflight; final count may increase only with this report's validation assets |
| 21 | KPI runbook | PASS | 0.04s | Includes first-day release view |
| 22 | Deployment readiness | PASS | 0.04s | 816 audit migrations, 5 functions |
| 23 | Release-evidence structure | PASS | 0.04s | 6 ready, 12 pending; not strict release evidence |
| 24 | Native crash-reporting contract | PASS | 0.04s | Sentry integration/config contract |
| 25 | Edge Function safety | PASS | 0.04s | 5 functions |
| 26 | Edge Function typecheck | PASS | 0.55s | 5 functions |
| 27 | Edge request boundaries | PASS | 2.77s | 19 assertions |
| 28 | Edge fingerprints | PASS | 0.06s | 5 fingerprints generated |
| 29 | Live Edge verifier dry run | PASS | 0.04s | Configuration only; not deployment |
| 30 | Live Auth verifier dry run | PASS | 0.04s | Configuration only; three dashboard checks remain manual |
| 31 | Production dependency audit | PASS | 0.64s | 0 moderate/high/critical |
| 32 | Production license audit | PASS | 1.69s | 660 packages, 16 expressions |
| 33 | Live catalog completeness | FAIL | 40.87s | 395/750 brands; 16,294/16,299 verified ingredients; 10,445 queue rows affecting 14,127 products |
| 34 | Expo SDK package versions | PASS (separate) | 0.83s | Reached after fail-fast stop manually |
| 35 | Expo config resolution | PASS (separate) | 1.74s | Reached after fail-fast stop manually |
| 36 | Expo iOS/Android/web exports | PASS (separate) | 58.5s | 46 native and 16 web files; QA fixture markers absent |
| 37 | Expo native prebuild | PASS (separate) | 6.85s | Clean temporary iOS/Android generation |
| 38 | Release metadata | PASS (separate) | 0.31s | Local version 1.2.2; remote number still must be read before build |
| — | Disposable PostgreSQL 17 integration | PASS | 0.5s | 75 assertions, including grants, deletion race, quota idempotency, KPI view, validation, rollback |
| — | Live production-path scoring | PASS | 7.46s | Real Nature's Logic row |
| — | Live App Store listing | FAIL | 0.40s | Local 1.2.2 behind live 1.2.4 |
| — | Live catalog RPC performance | BLOCKED(migrations not deployed) | 11.29s | Refused to grade missing teaser/index boundary |
| — | Hosted StoreKit app/test compilation | PASS | local cold build | Generated app host and test bundle compiled under Xcode 26.6 before test execution |
| — | Local StoreKit transaction execution | BLOCKED(Apple iOS 26.5 CLI defect) | 41.47s full test operation; strengthened Ask to Buy test interrupted after 90s | Product-catalog assertion passed in the full run; the strengthened test compiled, then the local StoreKit daemon returned `SKInternalErrorDomain Code=3` while resetting the session and hung while loading products |
| — | CI StoreKit execution on pinned iOS 26.1 | FAIL | 21m49s job; 5.95s tests | Run `33811262298`: 3 passed, 1 skipped by explicit expiry opt-in, and Ask to Buy failed because the deprecated out-of-app purchase helper returned a purchased rather than pending transaction. The replacement exercises `Product.purchase()`, retains both pending-state assertions, fixes dialog-reset ordering, and awaits a new CI run. |
| — | Maestro matrix | BLOCKED(Maestro absent; no simulator booted) | — | Only the product-row regression flow exists; the full matrix was not executed |
| — | Clean checkout: clone → `npm ci` → Expo export | PASS | final verification | Run from the committed release candidate with no untracked source dependency |

`npm run verify` was not used as a coverage claim; it remains a thin existence/configuration check.

The local StoreKit mutation failure matches the current [Apple Developer Forums report for headless `xcodebuild` on iOS 26.5](https://developer.apple.com/forums/thread/808030). The CI job is pinned to Xcode 26.1.1 and its matching iOS 26.1 runtime rather than converting that platform failure into a skipped/pass result. StoreKit tests are also forced to execute serially because Apple documents one shared test environment across all `SKTestSession` instances.

## 6. Performance evidence and budgets

| Path | Before | Current measured result | Budget/status |
| --- | ---: | ---: | --- |
| Typed Nature's Logic search | 9,519ms | Device fixtures after apostrophe fix: 579–1,561ms | p95 <=2,000ms in release contract; fixture PASS |
| Typed Hill's search | 2,961ms | Apostrophe/index path covered by tests | p95 <=2,000ms; physical/release run NOT-RUN |
| Clean exact label capture → result | p50 7,066ms; avg 7,321ms | 2,513ms in clean exact fixture | Product budget <=8,000ms; fixture PASS |
| Direct FTS query | — | 24.556ms, `idx_product_data_search_document` used | PASS |
| Direct normalized GTIN | — | 5,801.916ms, sequential scan | FAIL in live schema; pending expression index fixes root cause |
| Legacy full search RPC | — | 13,584ms in latest read-only sample | Obsolete client access is revoked by pending boundary migration |
| Verified full search RPC | — | 101ms in latest read-only sample | Legacy service-only path after migration |
| Ranked full search RPC | — | 13,146ms in latest read-only sample | Obsolete client path; investigate service callers if retained |
| Label fast | — | 74ms | PASS |
| Label OCR tokens | — | 85ms | PASS |
| Label OCR text | — | 12,357ms | Legacy slow fallback; pending boundary/performance rerun required |
| Label identity | — | 59ms | PASS |
| Barcode resolver | — | 88ms RPC sample, but underlying normalized direct query exposed a 5.8s sequential scan | BLOCKED until index deploy and explain verification |

Enforced code budgets are cold start <=2,500ms, tap-to-camera <=1,000ms, typed search p50 <=750ms and p95 <=2,000ms, Results first paint <=750ms, barcode/catalog capture-to-result <=4,000ms, label <=8,000ms, and AI <=15,000ms. Instrumentation and regression contracts are present. Cold start, camera latency, and Results paint were not measured on the final release binary, so they are **NOT-RUN**, not passes.

After migration, `npm run check:live-catalog-performance` samples each new RPC three times against at least 10,000 rows, asserts index presence and use, fails on product-table sequential scans, requires text/label p95 <=2s, and barcode p95 <=500ms.

## 7. Accessibility and nullable-flow regression

Static accessibility status: **PASS**. The Home pet picker is a modal with focus/dismiss semantics, a labeled 44x44 dismiss target, and reduced-motion handling. Contrast checks cover light and dark palettes; light tertiary text was corrected to `#6B6B65`.

Device accessibility status: **NOT-RUN**. VoiceOver reading order, rotor behavior, maximum Dynamic Type clipping, and actual touch interaction still require the real-iPhone checklist.

The product-row null regression is fixed at the callee boundary. `labelSummaryTitle` defensively accepts nullable input instead of relying on a `= {}` default, which only handles `undefined`. The Babel-based checker scans app files for nullable values flowing into functions guarded only by object default parameters and self-tests against both a bad and fixed fixture. It passed 52 app files. The free and Pro row-open regression test also passed.

## 8. Full E2E matrix status

Required device cells are 2 appearances × 2 Dynamic Type sizes × 2 device classes = 8 cells: light/dark; default/maximum text; SE-class/large iPhone. Each cell must cover onboarding, guest auth success/failures, every scan mode, every resolver decision, apostrophe/typo/timeout search, candidate confirmation and “None of these,” ingredient capture with both consent choices, all Results states, quota/reversal copy, all paywall entries/failures, four restore outcomes, review-prompt cadence, pet profile/AVOID banner, history search/filter/compare/recovery, and per-screen offline behavior.

Status for all eight cells: **BLOCKED(Maestro is not installed and no iOS Simulator was booted)**. The repository contains one repeatable development-only product-row flow, but that is not the requested matrix. Camera packages, memory/low-storage pressure, real StoreKit/RevenueCat state, and VoiceOver would remain physical-device work even if the simulator matrix ran.

## 9. One-page real-iPhone owner checklist

Release version/build: __________  Device/iOS: __________  Date/operator: __________

Rule: a sibling substitution, crash/blank screen, stuck loading state, incorrect free-scan count, lost Pro entitlement, or inaccessible critical control is a **FAIL**. Safe abstention is acceptable when exact identity is not provable.

| Test | Required outcome | Result / notes |
| --- | --- | --- |
| Purina ONE Chicken & Rice dry 8 lb, normal angle | Must not return the 13 oz can; exact dry package or honest abstention | __________ |
| Same Purina bag: glare, blur, tall-bag angle, poor light | Never substitute a sibling/form/species | __________ |
| Hill's Adult 7+ Small & Mini 15.5 lb | Exact product/package | __________ |
| Beneful real package | Exact or abstain; never Pro Plan/cat sibling | __________ |
| Moist & Meaty real package | Exact or abstain; never Purina ONE puppy sibling | __________ |
| Royal Canin real package | Exact/abstain, no stuck timeout | __________ |
| Nutrish real package | Exact/abstain, no sibling | __________ |
| IAMS real package | Exact/abstain, no sibling | __________ |
| Open Farm real package | Exact RawMix/recipe/package or abstain | __________ |
| Nutro real package | Exact/abstain, no sibling | __________ |
| Search `Nature's Logic` | Results quickly, rows open, no timeout | latency: ____ result: ____ |
| Search `Hill's Science Diet` | Results quickly, rows open, no timeout | latency: ____ result: ____ |
| Scan a real barcode | Exact product or clear not-found recovery; correct scan count | __________ |
| Purchase Pro | Store sheet succeeds; app, RevenueCat, and profile show Pro | __________ |
| Restore purchase | Restores Pro and emits successful sync | __________ |
| Cancel/expire | Entitlement changes correctly; no false Pro | __________ |
| Airplane mode + force quit + restart after valid purchase | Pro remains available from durable receipt/cache; token refresh failure does not sign out or erase Pro | __________ |
| VoiceOver: Home | Logical order; pet picker modal focus/dismiss works | __________ |
| VoiceOver: Scanner | Mode, help, shutter, and permission/recovery controls are clear | __________ |
| VoiceOver: Results | Score, status, ingredients, warnings, and actions are understandable | __________ |
| VoiceOver: Paywall | Plans, price/trial state, close, purchase, restore, and legal links are clear | __________ |
| Maximum Dynamic Type + light/dark on critical screens | No clipped/hidden critical action; contrast remains readable | __________ |
| Live App Store listing | No DogFoodAdvisor, CatFoodAdvisor, customer-review, recall-alert/history, guaranteed-safety, or medical claims | __________ |

Owner sign-off: **PASS / FAIL**  Name: __________  Time: __________

## 10. Brand, legal, privacy, and submission package

Runtime brand status: **PASS after correction**. `config/brand.js`, Expo app identity, bundle IDs/scheme, icons/splash references, embedded legal copy, hosted pages, and store metadata use Woof. A leftover default logger prefix `[BOWLPROOF]` was found and changed to `[WOOF]`; the claim gate now scans runtime files for reintroduction. The sole remaining text occurrence is a historical document explicitly saying Bowlproof is not the runtime brand.

Legal/free-Pro status: **PASS locally**. Embedded and hosted terms/support now agree: scan history and the full ingredient list remain free; Pro provides unlimited scans, ingredient explanations, quality breakdown, and nutrition details. No legal page hard-codes prices.

Privacy status: **PASS locally / NOT-VERIFIED in App Store Connect**. Embedded and hosted privacy text and `APP_PRIVACY_DISCLOSURE.md` disclose typed product searches, pet-profile content, typed-query `product_events`, RevenueCat processing, Sentry diagnostics, and the one-way deletion tombstone. The owner must reconcile and publish the actual App Privacy form.

| Submission item | Status | Note |
| --- | --- | --- |
| Local app name/subtitle/description/keywords/promo | PASS | Limits and blocked-claim checks pass. |
| What's New | PASS | Describes faster matching, recoverable timeouts, source-backed ingredients, variant matching, images/nutrition/accessibility/stability. |
| Screenshots | STRUCTURAL PASS / FRESHNESS NOT-VERIFIED | 18 assets pass dimensions/copy/order checks, but they have not been compared with the final release binary on a real device. |
| App Privacy answers | LOCAL PASS / ASC NOT-VERIFIED | Use `APP_PRIVACY_DISCLOSURE.md`; save final App Store Connect evidence. |
| Export compliance | PASS locally | `ITSAppUsesNonExemptEncryption=false`. |
| App Review notes | PREPARED | State informational/not veterinary advice; front-label/source-backed behavior; human-food caveats; guest-first access; no demo account required; Pro scope; weekly/monthly/annual products. Existing private reviewer contact details stay only in App Store Connect. |
| Dev/QA surface | PASS in release bundle contract | Development QA routes are behind `__DEV__`; release export asserts fixture markers are absent. |
| Build ID | NOT CREATED | Production build correctly withheld. |
| Submission ID/state | NOT SUBMITTED | No App Store state changed. |
| Automatic release | NOT ENABLED | Local config remains `automaticRelease=false` until final approval. |
| Phased release | NOT ENABLED | Must be enabled in App Store Connect before release. |

## 11. Phased-release and monitoring plan

After the blockers and owner checklist pass, select **automatic release after approval** and enable Apple's **7-day phased release for automatic updates**. Record screenshots of both settings. Public manual downloads can still receive the version during a phase, so this is a risk limiter, not a beta.

Check Sentry and `public.kpi_release_monitoring_daily` at release, +1 hour, +4 hours, and +24 hours, then daily through day 7. The new view gives scan success, resolver abstention, catalog miss, paywall purchase conversion, and restore failure rates in one service-role-only row.

Pause the rollout immediately for any privacy/billing/data-loss issue, wrong-product sibling substitution, reproducible launch/camera/result crash, or loss of a valid Pro entitlement. Also pause when there are at least 100 release sessions and crash-free sessions fall below 99.5%, or when scan success falls 10 percentage points below the prior seven-day baseline. Investigate a twofold increase in resolver abstention or catalog-miss rate without weakening exact-match safety. Pause if restore failures exceed 5% with at least 20 attempts or if paywall purchase conversion drops 50% while package loading is healthy.

Sentry code/config and source-map upload wiring pass static checks, but receipt of an event and uploaded source maps from the final release build is **NOT-VERIFIED**. That must be checked before increasing the phase.

## 12. One-page hotfix runbook

**Owner/on-call:** the App Store Connect Account Holder or App Manager watches Sentry, App Store Connect, RevenueCat, Supabase logs, and `kpi_release_monitoring_daily`. The named operator and backup must be written into the launch record: primary __________ backup __________.

1. **Detect and classify within 15 minutes.** Capture version/build, UTC time, affected flow, user impact, Sentry issue, KPI delta, RevenueCat/Supabase evidence, and a reproduction. Do not include customer PII in tickets.
2. **Pause within 15 minutes for a stop signal.** In App Store Connect, pause the phased release. If the fault is backend-controlled, disable or roll back only the implicated function/migration after confirming old-client compatibility. Do not relax identity or scoring assertions as a recovery.
3. **Contain.** For wrong-product matches, force safe abstention through server configuration only if an existing reviewed control supports it. For purchase/restore faults, preserve local entitlement and receipts and avoid destructive account changes. For privacy/billing/data loss, halt rollout immediately and notify the owner.
4. **Cut the fix.** Branch from the exact submitted tag/commit, add a failing regression first, implement the root fix, run the complete release preflight, database/edge tests, live scoring/performance proofs, and the affected real-device checklist. Target a tested binary within four hours for a code-only critical fix; App Review timing is external.
5. **Submit expedited review when eligible.** Record the new marketing/build version, EAS build URL/ID, App Store submission ID, incident reference, reviewer notes, and exact state. Never reuse a rejected/lower marketing version.
6. **Backend rollback.** Only for a coordinated old-client rollback, deploy the prior `product-lookup` and `revenuecat-webhook` versions, then run `supabase/rollback/20260903_release_hardening_rollback.sql`. This reopens catalog quota and delayed-webhook risks, so prefer a forward fix.
7. **Resume cautiously.** Require regression PASS, Sentry source maps/event receipt, healthy scan/restore/catalog KPIs for at least one hour, owner approval, and documented rollback readiness. Resume the phase; do not jump directly to 100%.
8. **Close.** Write the timeline/root cause, affected cohort, data/privacy/billing impact, corrective tests, and structural prevention. Keep the incident evidence with the release record.

## 13. Exact build/submission sequence after all gates

Do not execute this sequence until: the owner approves a marketing version greater than `1.2.4`; the database migrations/functions validate; catalog completeness passes without weakened thresholds; the real-iPhone checklist passes; Sentry receives a symbolicated release-build event; screenshots/privacy/review notes are confirmed; and the owner gives final submission approval.

```sh
npm run check:preflight
npm run test:db
npm run test:live-scoring
npm run check:live-catalog-performance
npm run check:live-listing -- --guest-validated
npm run check:evidence -- --strict
npx eas-cli@latest build:version:get -p ios
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

After upload, use App Store Connect to attach the build to the owner-approved version, reconcile privacy/review metadata, select automatic release after approval, enable phased release, submit for review, and record the EAS build ID, Apple build number, submission ID, timestamp, and exact state. Those actions are interactive/external and require a separate explicit approval.

## 14. Remaining unknowns and consequence

- All eight appearance/text/device E2E cells are unrun.
- Physical recognition for the named packages and adverse camera conditions is unrun on this candidate.
- Real barcode, purchase, restore, cancellation/expiry, pending/Ask-to-Buy, airplane-mode restart, and RevenueCat/profile agreement are unrun on this candidate.
- VoiceOver, maximum Dynamic Type, cold start, tap-to-camera, and Results-paint budgets are unrun on the final binary.
- Sentry release-event receipt and source-map symbolication are unverified.
- App Store Connect privacy answers, screenshot freshness, automatic release, and phased-release settings are unverified.
- The four database migrations and two Edge Function versions are not live.
- Catalog completeness and marketing-version gates currently fail.

If the app ships in this state, real users—not the owner—will perform the first complete test of the highest-risk physical, purchase, offline, and accessibility paths. The correct current action is to keep the release unsubmitted.
