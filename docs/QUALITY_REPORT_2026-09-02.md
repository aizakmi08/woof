# Woof quality regimen report — 2026-09-02

## Executive result

This audit does not establish that Woof has no bugs and it does not authorize an App Store submission. It establishes executable coverage for the regressions named in the audit, exercises the trust and quota contracts locally, and identifies the remaining release blockers and unknowns.

Current status:

| Area | Status | Observed evidence |
| --- | --- | --- |
| Jest production-path suite | PASS | 11 suites, 64 tests |
| Coverage run | PASS | 44.47% statements, 37.89% branches, 49.58% functions, 47.46% lines over the selected production paths |
| Postgres integration | PASS | PostgreSQL 17.11, 43 assertions |
| Edge request boundaries | PASS | 19 assertions across five functions |
| Edge TypeScript checks | PASS | Five functions checked by Deno 2.9.6 |
| Clean checkout | PASS | New local clone, `npm ci`, iOS/Android/web Expo export |
| Release fixture isolation | PASS | Release bundle assertion proves QA fixture markers are absent |
| Production licenses | PASS | 661 packages, 16 license expressions |
| Dependency audit gate | FAIL | 18 moderate production findings exceed the committed ceiling of 13; 0 high and 0 critical |
| EAS/Expo version contract | FAIL | app/package is 1.2.2 while two gates still require the 1.2.1 line |
| Simulator/device E2E | NOT-RUN | No simulator was booted by the operator; Maestro is not installed |
| Physical-device performance, camera, purchases, memory, and VoiceOver | NOT-RUN | No physical device or purchase sandbox was available |
| Live Supabase, advisors, and live Edge/Auth | NOT-RUN | Production credentials were intentionally not used |

## Test infrastructure

Jest with `jest-expo`, React Native Testing Library, and `fast-check` was selected because it follows Expo's supported unit-test path, can render React Native screens, and can generate adversarial properties. The former `new Function(source.replace(...))` loader is gone; the resolver contract now imports real production modules and therefore executes the real verification state.

Behavioral tests follow `tests/README.md`: they start at a real boundary such as a snake_case PostgREST row, raw OCR, route parameters, an HTTP request, or a database role. Internal policy functions are not mocked. External services and native APIs may be mocked when a deterministic local test cannot own them.

Commits are intentionally split between tests and behavior:

- `d3c3ec62` — executable Jest/Postgres/CI regimen
- `e8daf2f6` — mapper, screen tap, protected boundaries, scoring, analytics, and human-food fixes
- `b262d723` — quota concurrency, latent RPC grants, and account-deletion SQL
- `f943d148` / `842d44e8` — timing regression first, then its fix
- `0958692e` / `604c5da1` — generalized resolver/OCR tests first, then line-preservation fix
- `fbf54962` — Edge request, dependency/license, Expo alignment, and Maestro gates
- `bda1008c` — release-build QA fixture isolation
- `936b2c2d` — deterministic auth pre-fix evidence

## Pre-fix fails, post-fix passes

Each result below was observed. Historical files were restored only in disposable detached worktrees.

| Regression | Pre-fix evidence | Post-fix evidence |
| --- | --- | --- |
| Mapper drops nutrient evidence | At `d3c3ec62`, `catalog-mapper.test.js` failed because `nutritionalInfo` was missing before it could reach the scorer. | PASS; the raw row reaches the mapper and the calcium-limited score. |
| Candidate-only food form accepted | Current tests with `services/labelResolution.js` restored from `0be6cdcf^` failed: candidate-only food form was compatible (`true`) instead of rejected. | PASS for all four presence combinations and conflict cases. |
| Apostrophe query emits one-character prefix | The unsafe pre-migration expression was reintroduced in a disposable database; the test failed on `Nature's Logic` with `'nature':* & 's':* & 'logic':*`. | PASS; ten-brand corpus completed in 3.9 ms under the 500 ms local budget. |
| Clean checkout imports an untracked file | Expo iOS export at `a7f1ff2e^` failed because `screens/ScannerScreen.js` imported absent `services/cameraCrop.js`. | PASS from a new clone after `npm ci`; iOS, Android, and web exported. |
| Network refresh failure signs user out | With `services/claude.js` restored from `ad4104fd^`, the production request test returned “Session expired” and called sign-out for a network failure. | PASS; retryable failures preserve the session, genuine refresh-token revocation signs out. |
| Label effect aborts itself on species change | With `ProductSearchScreen.js` restored from `1b429d52`, the screen remained on “Matching exact product...” and the test timed out after the saved species changed. | PASS; the run restarts and clears loading. |
| Search row cannot be opened | At `d3c3ec62`, pressing the Nature's Logic row threw `Cannot read properties of null (reading 'brand')`; navigation received zero calls. | PASS for both free and Pro state because opening a catalog row is not subscription-gated. |
| Camera timing double-fires | At `f943d148`, the second identical navigation start returned 250 ms instead of `null`. | PASS; each start records once. |
| Retailer chrome erases the package label | At `0958692e`, a normal retailer line caused the retained OCR text to be empty instead of containing “rabbit.” | PASS; line boundaries are retained and rules work on an invented brand. |

The original first baseline at `d3c3ec62` produced 25 passes and 21 intended failures. The final suite produces 64 passes and zero failures.

## Findings and fixes

| Severity | Finding and user impact | Location | Status and covering test |
| --- | --- | --- | --- |
| Critical | Mapper discarded nutrient evidence, giving products a false neutral balance score and bypassing calcium caps. | `services/productCatalog.js:2686` | FIXED `e8daf2f6`; `catalog-mapper.test.js` |
| Critical | Protected dimensions did not consistently reject a candidate value absent from the visible label, allowing sibling-formula substitution. | `services/labelResolution.js:379` | FIXED `e8daf2f6`; table-driven ten-boundary property test plus 160 generated catalogs |
| High | Product rows crashed on a null identification object, making the list appear non-clickable. | `screens/ProductSearchScreen.js:301` | FIXED `e8daf2f6`; rendered screen press test |
| High | Concurrent retries of one scan id could race instead of converging. | `supabase/migrations/327_quality_regimen_security_hardening.sql:20` | CODED `b262d723`, local PASS; production migration pending owner approval |
| High | Three unused argument-trusting counter RPCs were executable by authenticated clients. | `supabase/migrations/327_quality_regimen_security_hardening.sql:59` | CODED `b262d723`, local privilege tests PASS; production migration pending |
| High | Account deletion omitted product event text and RevenueCat event rows. | `supabase/migrations/327_quality_regimen_security_hardening.sql:87` | PARTIAL: local deletion PASS. Durable prevention of future RevenueCat webhook reinsertion and RevenueCat subscriber deletion remain open. |
| High | Full verified `product_data` rows remain directly readable by authenticated clients, so a patched client can bypass UI quota. | Database authorization contract | OPEN: move full rows behind a quota-consuming RPC or expose teaser columns directly. This is an architecture/product decision. |
| High | QA fixtures were hidden but still shipped in release bundles. | `metro.config.js:10` | FIXED `bda1008c`; production resolver uses inert stubs and the real export asserts markers are absent. |
| High | Temporary auth/network errors could sign out subscribers and make Pro appear free. | `services/claude.js:74` | FIXED upstream and protected by the seven-case auth matrix. |
| High | Label lookup could remain permanently loading after a dependency change aborted its own run. | `screens/ProductSearchScreen.js:1360` and effect cleanup | FIXED upstream and protected by input-change and saved-species-change screen tests. Other aborting effects are not yet covered to the same depth. |
| Medium | `null` numeric values could become zero. | `services/verifiedScoring.js:250` | FIXED `e8daf2f6`; adversarial numeric property tests |
| Medium | Unidentified human food could remain `unknown` instead of caution; a development fixture repeated the bad state. | `services/claude.js:337`, `services/devQaFixtures.js:66` | FIXED `e8daf2f6` and `bda1008c`; human-food tests |
| Medium | Analytics could retain absolute paths and share one stored session id across accounts. | `services/analytics.js:14`, `services/analytics.js:31` | FIXED `e8daf2f6`; executed redaction/account tests. Dev events now include `app_environment`. |
| Medium | OCR marketing cleanup collapsed line boundaries, allowing one chrome line to erase valid label text. | `services/labelOcrMatching.js` | FIXED `604c5da1`; invented-brand and retailer-chrome tests |
| Medium | Performance timing could emit duplicate events on rerender. | `services/performanceTimings.js:7` | FIXED `842d44e8`; idempotency tests |
| Medium | Dependency audit baseline is red after safe Expo/React Native patch alignment. | `scripts/check-dependency-audit.mjs:4` | OPEN; no assertion was weakened. There are 18 moderate, 0 high, 0 critical production findings. |
| Medium | Release gates disagree about version 1.2.2 versus 1.2.1. | `scripts/check-eas-versioning.mjs`, `scripts/check-expo-config.mjs` | OPEN; App Store/EAS release owner must choose the intended release line. |

## Trust-contract and scoring coverage

The protected-boundary table covers species, brand family, product line, life stage, age band, food form, diet condition, breed size, grain-free status, and package form. Every dimension tests all four visible/candidate presence combinations plus a conflict case. Adding a boundary requires adding a table row.

The generated resolver test runs 160 synthetic sibling catalogs with altered OCR. It asserts exact match or abstention, never a sibling. Fuzz includes dropped and transposed text, gaps, retailer chrome, duplicate lines, multilingual fragments, slogans, partial words, and invented brands. QA-specific “testflight” and “yc application audit” chrome entries and a product-specific slogan were removed from production preprocessing.

Scoring properties cover weighted-sum agreement, cap ordering, unknown basis, Guaranteed Analysis labeling, ingredient quality after a cap, absent calorie data, null/zero/negative/large/string values, calcium at 1.8%, 2.5%, and Ca:P at 1:1 and 2:1 boundaries. Human-food output cannot receive a pet-food score or qualify for the app-review prompt; unidentified output becomes caution.

## Database integration

The repository uses a committed test-schema bootstrap because migrations 007–057 and the original catalog table creation are absent. Tests ran against a disposable PostgreSQL 17.11 cluster and the cluster was stopped and moved to Trash after execution. No linked or production database was mutated.

The 43 assertions cover:

- caller-derived user identity and fixed free limit;
- third versus fourth free scan;
- idempotency and concurrent same-id consumption;
- reversal then re-consumption and Pro bypass;
- profile, history, analytics, scan-usage, and product-event cross-user RLS;
- direct entitlement/count writes;
- catalog read/write separation and private evidence denial;
- removal of authenticated grants on latent counter RPCs;
- deletion of product events and all six stored RevenueCat identifier shapes while preserving unrelated events;
- bounded query shape and a 3.9 ms / 500 ms local query-corpus budget.

Limitation: role and `request.jwt.claim.*` values were set in Postgres transactions. This executes the actual RLS policies but does not exercise GoTrue signature verification with issued JWTs. The catalog has only bootstrap-scale rows, so the 3.9 ms result is not a realistically sized query benchmark and does not prove index use at production cardinality.

The hardening migration has not been applied to production. Owner-approved commands, after confirming the linked project and migration list, are:

```sh
npx supabase migration list --linked
npx supabase db push --linked --dry-run --skip-vault
# After the owner confirms the dry run contains only intended migrations:
npx supabase db push --linked --skip-vault
```

## Edge Functions

Deno type checks pass for `analyze`, `label-lookup`, `product-lookup`, `revenuecat-sync`, and `revenuecat-webhook`. A request-level local harness starts the real Deno entry points and passes 19 assertions for method handling, CORS, missing authorization, webhook secret rejection, malformed webhook JSON, and missing event data.

NOT-RUN: authenticated valid/invalid/expired/other-user JWT paths, oversized real images, stream cancellation with quota reversal, webhook replay, out-of-order timestamps, cancellation under packet loss, and live third-party service responses. Those need an isolated Supabase/Auth environment plus Claude and RevenueCat test credentials.

## Security and privacy

- CI service-role scope is limited to the catalog-completeness step. `npm ci` and PR-modifiable checks do not receive the value.
- The tracked secret scan passed 1,264 files.
- The original untracked `inputs/` tree contains a captured third-party JWT in a retailer snapshot. It was not printed or committed. `inputs/`, `output/`, `tmp/`, and coverage/audit outputs are now ignored.
- The personal legal PDF was moved from the repository tree to `/Users/admin/Documents/private-legal-documents/062426_Service_Agreement_Ulugbek_Karimov.pdf` as explicitly requested by the task.
- `.easignore` continues to exclude local evidence/data directories from archives.
- Runtime analytics redaction was executed against an email, URL, macOS and Android paths, JWT, API key, and base64-like blob. Account A and B receive different stored session ids.
- The production license gate passes. Two install-script packages were reviewed: `@sentry/cli@2.58.4` downloads/installs Sentry's native CLI; optional `fsevents@2.3.3` builds the macOS watcher. Neither receives the service-role secret in CI.
- `npm audit --omit=dev` reports two root moderate advisories propagated across 18 packages: `decode-uri-component` denial of service and an old `uuid` buffer-bound issue via Expo/Xcode tooling. npm proposes an invalid Expo 46 downgrade, so the ceiling remains unchanged and the gate stays FAIL.

NOT-RUN: Supabase database advisors, leaked-password protection, extension placement, production foreign-key indexes, and every deployed security-definer `search_path`. No production credentials were available and the task forbids unapproved production mutation.

## Performance

`services/performanceTimings.js` records JS boot-to-interactive, tap-to-camera, capture-to-result, and detailed label stages. Duplicate timing events are now rejected by start id. The database query-shape corpus passed at 3.9 ms against the bootstrap database.

NOT-RUN and therefore not budget-enforced: cold start, camera ready, front-label/barcode/catalog capture-to-result, typed-search p50/p95, Results first paint, streaming render cost, 50-row scrolling, 20-scan memory/leak checks, temp crop cleanup, AsyncStorage orphan growth, or request fan-out under rapid scans. CI cannot honestly enforce device metrics without a repeatable device runner and stable hardware class. No before/after device numbers are claimed.

## E2E, resilience, and accessibility

`tests/e2e/maestro/dev-qa-product-open.yaml` is the first repeatable device flow and specifically opens a typed-search fixture row into Results. It was not run because no simulator was booted and Maestro is unavailable. The required matrix—light/dark, default/maximum Dynamic Type, SE/large iPhone, and shipped localizations—remains NOT-RUN, with no screenshots claimed.

Automated accessibility source checks pass across 13 files. They check current labels and roles but do not substitute for contrast measurement, focus order, modal focus trapping, 44-point rendered hit areas, reduced-motion behavior, or VoiceOver. Home's pet-picker accessible dismiss and the manual Home/Scanner/Results/Paywall/Profile VoiceOver script remain open.

The full offline/slow/packet-loss/server/truncated-stream matrix, app interruption/background/kill/rotation/call/memory/disk/permission/clock chaos, corrupt storage, history 50+, and every purchase/restore outcome remain NOT-RUN. These require simulator/device control, service fault injection, and StoreKit/RevenueCat test accounts.

## Coverage by selected subsystem

| Production path | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| All collected files | 44.47% | 37.89% | 49.58% | 47.46% |
| `ProductSearchScreen.js` | 52.17% | 45.78% | 54.83% | 53.99% |
| `catalogQuality.js` | 61.11% | 42.74% | 88.88% | 72.97% |
| `catalogSearchCache.js` | 51.48% | 39.61% | 54.16% | 57.95% |
| `entitlementResilience.js` | 17.54% | 18.42% | 18.18% | 20.00% |
| `labelOcrMatching.js` | 63.33% | 43.47% | 71.76% | 69.66% |
| `labelResolution.js` | 69.88% | 56.82% | 74.71% | 71.65% |
| `productCatalog.js` | 6.07% | 13.11% | 5.17% | 7.10% |
| `reviewPromptPolicy.js` | 73.68% | 65.62% | 100.00% | 73.68% |
| `verifiedScoring.js` | 77.07% | 65.49% | 95.83% | 84.29% |

The selected coverage set emphasizes the trust paths. It is not app-wide coverage. The low `productCatalog.js` result is the clearest unit/integration gap: its network, cache, fan-out, timeout, hydration, and malformed-response branches need more executable tests.

## Release decision

The product-row issue in the supplied screenshot is a code defect, not a Pro-subscription restriction, and its regression test now passes for free and Pro state. The named regression classes, local trust properties, disposable database tests, Edge request boundaries, clean checkout, and release fixture isolation pass.

The release is not a clean all-green candidate yet. Dependency-audit and version-contract gates fail; the SQL hardening is unapplied; client-side catalog quota bypass, durable RevenueCat deletion, live advisors, authenticated Edge cases, realistic query performance, full E2E, purchase behavior, physical camera packages, accessibility, and device performance remain open or unknown.
