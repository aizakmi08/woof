# Woof Audit - 2026-06-17

## Executive Summary

- **Woof has real demand, but the funnel is leaky.** Public store data shows the app is live as version 1.2 with a small base of ratings and downloads, while App Store Connect and RevenueCat show early paid traction. The biggest growth issue is not the idea. It is trust and conversion friction before the user gets value.
- **The no-account product path is now live in Supabase and proven in a clean simulator install.** The App Store listing says users get 3 free scans with no account required. Production Anonymous Sign-Ins and manual identity linking are enabled, and an iPhone 17e clean-install test created an anonymous user, completed verified search and scoring, persisted guest-owned data under RLS, and opened the account-linking handoff. TestFlight remains the final distribution-build proof.
- **App Store trust now has an operating artifact, not just notes.** This audit added a source-backed App Privacy disclosure pack so App Store Connect answers can be kept aligned with Supabase, RevenueCat, Anthropic, Open Pet Food Facts, analytics, scan history, support, and Sentry/crash-reporting state.
- **Revenue exists, but monetization still needs a measurement loop.** App Store Connect's 90-day view shows `$43` proceeds, 19 in-app purchases, 4 active subscription plans, 3 paid plans, `$11` MRR, and Day 35 download-to-paid at 1.92%. RevenueCat also showed 118 new customers, 3 active subscriptions, 1 active trial, `$21` MRR, and `$18` revenue in the last 28 days earlier in the audit. This audit added a lightweight Supabase event layer, but RevenueCat experiments, dashboards, and production validation are still missing.
- **Operations risk is immediate.** The Supabase dashboard shows egress at `7.519 / 5 GB (150%)` for the current billing cycle, with a grace period ending July 15, 2026. If this is not resolved, Supabase warns that requests may return `402` after the grace period.
- **The GitHub release path needs reconciliation before merge.** The remote repo has one open draft PR, but it is a different branch than the current local audit work and has no statuses or check runs. The smoke CI workflow added in this worktree has not been pushed to GitHub yet, so it has not protected any remote PR.
- **The codebase is workable but still needs deeper production discipline.** This audit added smoke CI, release metadata and Expo config checks, claim-safety checks, moved app-side diagnostics behind a dev-only logger, added first-party sanitized app error telemetry, added Sentry native crash reporting configuration, recreated tracked sources for the deployed `product-lookup` and `revenuecat-webhook` functions, and added server-side free-scan consumption. Lint, typecheck, deployment comparison, and live validation are still missing.

## Evidence Reviewed

- Local repo: React Native/Expo app, Supabase migrations, Edge Function source, docs/legal pages, package manifests, and git status.
- Public store pages: [Apple App Store](https://apps.apple.com/us/app/woof-pet-food-scanner/id6760733899) and [AppBrain listing](https://www.appbrain.com/appstore/woof-pet-food-scanner/ios-6760733899).
- App Store Connect in Chrome on June 17, 2026: App Analytics Overview and Distribution record for app `6760733899`. See `APP_STORE_CONNECT_AUDIT.md`.
- RevenueCat dashboard in Chrome: product catalog and default offering details. Overview, paywalls, and experiments routes were visible earlier in the audit, but returned `Loading RevenueCat...` during the June 17 refresh and need another dashboard pass.
- GitHub remote/API on June 17, 2026: remote branches, open draft PR #1, GitHub Actions workflow inventory, PR head statuses/check runs, and branch protection flags. See `GITHUB_RELEASE_AUDIT.md`.
- Supabase dashboard in Chrome: Edge Functions list and organization usage page.
- Supabase connector on June 17, 2026: live project list, migration history, public tables, Edge Functions, advisors, and read-only SQL reconciliation for project `rhlgvrywjralxrjcdtrw`. See `SUPABASE_LIVE_RECONCILIATION.md`.
- Official App Privacy guidance from Apple and RevenueCat for App Store Connect privacy-label answers.
- Product UX and revenue flow code evidence from `App.js`, `screens/OnboardingScreen.js`, `services/auth.js`, `screens/HomeScreen.js`, `screens/ScannerScreen.js`, `screens/ResultsScreen/*`, `screens/PaywallScreen.js`, and `screens/ProfileScreen.js`. See `PRODUCT_UX_REVENUE_AUDIT.md`.

## Current Business Snapshot

### Public Store

- App Store listing: `Woof - Pet Food Scanner`, app id `6760733899`, free with in-app purchases.
- AppBrain mirrors version `1.2`, one visible rating at `5.00`, and no meaningful ranking signal yet.
- Store copy claims: no account required, 3 free scans, human-food safety checks, real-time streaming results, and verified data from DogFoodAdvisor, CatFoodAdvisor, and Open Pet Food Facts.

### App Store Connect Observations

Observed from the App Store Connect analytics dashboard during this audit session:

- 90-day first-time downloads: `239`
- Redownloads: `6`
- Product page views: `509`
- Impressions: `4.64K`
- Daily average conversion rate: `6.79%`
- Proceeds: `$43`
- In-app purchases: `19`
- Day 7 download-to-paid: `1.44%`
- Day 35 download-to-paid: `1.92%`
- Active subscription plans: `4`
- Paid subscription plans: `3`
- Monthly recurring revenue: `$11`
- Net paid plans: `3`
- Conversion to paid: `4`
- Churned plans: `1`
- Crashes: `2` on version `1.2`

Observed from the App Store Connect Distribution record:

- iOS version `1.2` is `Ready for Distribution`.
- Five iPhone screenshots are attached.
- Promotional Text is blank.
- Description still claims DogFoodAdvisor/CatFoodAdvisor verified data.
- App Review Notes still mention `recall alerts`.
- Build row shows build `31` / build version `1.1.1`, so EAS/App Store remote versioning needs verification before submission.

### RevenueCat

- Last 28 days: `118` new customers, `128` active customers, `3` active subscriptions, `1` active trial, `$21` MRR, `$18` revenue.
- Product catalog has one active offering, `default`, with `$rc_monthly`, `$rc_annual`, and `$rc_weekly` packages. These match `services/purchases.js`.
- The default offering page shows `Add Paywall` and `Add Rules`, so no hosted paywall or targeting rule is attached to that offering.
- RevenueCat overview, paywalls, and experiments routes were stuck on `Loading RevenueCat...` during the June 17 refresh, so broader RevenueCat metrics and experiment status still need another dashboard check.
- Recent transactions suggest annual trials are often expiring or being cancelled, while monthly subscriptions are carrying current paid revenue. Treat this as a hypothesis until event-level funnel analytics are added.

### Supabase

- Current billing-cycle egress is already over the free-plan quota: `7.519 / 5 GB (150%)` for May 27-June 27, 2026. The usage page shows `7.52 GB` used, `2.52 GB` overage, `568 / 500,000` Edge Function invocations, and `8 / 50,000` monthly active users.
- Supabase says the organization is in a grace period until July 15, 2026 and may receive restrictions after that if usage stays above quota.
- Deployed Edge Functions visible in the dashboard: `analyze`, `product-lookup`, and `revenuecat-webhook`.
- This repo now contains `analyze`, a recreated/tracked `product-lookup`, a recreated/tracked `revenuecat-webhook`, and a new tracked `revenuecat-sync` function for authenticated post-purchase subscriber refresh. The recreated functions still need to be compared against the deployed dashboard versions and all four tracked functions need intentional deployment.

### GitHub Release Path

- Remote `main` and local `HEAD` are both `f1ecad5c47c644a512470e9515c0ffbe8d45edff`.
- Remote branch `codex/push-woof-app` is `b6626b1296af168ddd6f08c451751ae0a2ada8d2`.
- PR #1 (`[codex] Prepare woof app release update`) is open, draft, and points from `codex/push-woof-app` into `main`.
- PR #1 has 0 commit statuses and 0 check runs.
- GitHub Actions currently reports only the GitHub Pages deployment workflow. The local `.github/workflows/ci.yml` smoke workflow has not been pushed.
- GitHub's public branch API reports `protected: false` for both `main` and `codex/push-woof-app`.
- PR #1 is not the same as this local audit worktree: it has no CI workflow, package version `1.1.1`, and an older March 2026 `AUDIT.md`.

### Security And Secrets

- Current tracked env-related files are `.env.example`, `app.config.js`, and `config/env.js`; `.env` is ignored and is not tracked in the current index.
- `.env.example` contains placeholders only.
- Local filename history review for `.env`, `.env.example`, `app.config.js`, and `config/env.js` only surfaced the initial commit touching the tracked config/example files.
- Fixed in this audit: `scripts/check-secrets.mjs` now scans tracked and unignored files for accidental env files, private keys, Supabase JWTs/project URLs, service-role-style assignments, Anthropic/OpenAI/Stripe keys, Google OAuth client IDs, and RevenueCat SDK keys. CI now runs it before dependency install.
- Fixed in this audit: migration `066_profile_write_security.sql` revokes broad client insert/update privileges on `profiles`, grants authenticated users write access only to safe identity columns, keeps Pro status / scan count / RevenueCat fields service-owned, and adds an own-row `scan_history` update policy for upsert-based sync. `services/auth.js` no longer writes `profiles.is_pro` or `profiles.scan_count` from the client.
- Fixed in this audit: migration `067_delete_account_privacy.sql` replaces `delete_own_account()` so account deletion removes linkable `analytics_events`, `revenuecat_events`, `scan_usage_events`, and `rate_limits` rows before deleting the auth user. The RPC explicitly revokes default `PUBLIC`/`anon` execution and grants only `authenticated`. The client delete flow now also clears local scan history, local result cache, scan count, and analytics queue/session storage.
- Remaining caveat: this does not prove credentials were never exposed outside the current git object set or in external dashboards/logs. Rotate any key that is known to have been shared outside approved secret stores.

### App Privacy Disclosure

- Fixed in this audit: `APP_PRIVACY_DISCLOSURE.md` now maps the current data flow to App Store Connect App Privacy answers. It covers Contact Info, User ID, Purchase History, Photos or Videos, Other User Content, Customer Support Data, Product Interaction, Other Usage Data, Performance Data, Other Diagnostic Data, and Other Data Types, with `Data Used to Track You: No` while no IDFA, ad SDK, data broker sharing, or cross-app advertising measurement is present.
- Fixed in this audit: `scripts/check-app-privacy-disclosure.mjs`, `npm run check:privacy`, CI, and `scripts/check-deployment-readiness.mjs` now keep the disclosure pack, hosted privacy page, deployment checklist, and Sentry crash-data status aligned.
- Recommendation: before the next production submission, publish App Store Connect App Privacy answers from `APP_PRIVACY_DISCLOSURE.md`, save Product Page Preview evidence, and re-run the check after any SDK/data-flow change.

## Highest Priority Findings

### P0 - Fix Before More Paid Acquisition

1. **Store copy promises no account required; anonymous-first is live and simulator-proven, with TestFlight proof still required.**
   - Evidence: `services/auth.js` attempts `signInAnonymously()` on cold start, `AuthScreen` offers "Continue as Guest" as a fallback, and `ProfileScreen` lets guest users save their account with Apple or Google. Production Anonymous Sign-Ins and manual identity linking were enabled on 2026-07-10. A clean-install iPhone 17e test created an anonymous Supabase user, returned three verified Open Farm search matches, opened a source-backed scored result, persisted scan/profile/history/usage/analytics rows under that guest id, showed the save-history prompt, and opened then safely cancelled the Google linking handoff. `npm run auth:verify-live` passes.
   - Business impact: the production backend no longer forces an account wall before value, reducing the largest first-scan conversion mismatch. The remaining risk is distribution-build behavior rather than the live Auth configuration or app logic.
   - Recommendation: verify the same guest scan -> result -> save account path in TestFlight, confirm the guest-auth KPI split is populated, then refresh App Store screenshots around the lower-friction first-run flow.

2. **Supabase quota risk can break the live app.**
   - Evidence: Supabase usage page shows egress over quota and grace period ending July 15, 2026. Current-cycle usage is `7.519 / 5 GB (150%)` with only `568` Edge Function invocations and `8` monthly active users, so payload size or retry behavior is likely a larger issue than raw user volume.
   - Business impact: a `402` failure during scanning or auth would directly block revenue.
   - Recommendation: upgrade plan or reduce egress immediately, then add alerts. This audit reduced target image payload size, capped image streaming retries, and added `analysis_upload_started`, upload-byte, cached/fresh completion, cache-rate, per-fresh-scan upload-pressure KPI metrics, scan-id-matched upload-cost metrics for completed scans, and `public.kpi_analysis_cache_health` for active/expired cache rows, payload bytes, and hit density, but production still needs Supabase usage validation after deployment.

3. **Public listing and App Review notes still contain unsupported trust claims.**
   - Evidence: App Store/AppBrain copy says verified data from DogFoodAdvisor, CatFoodAdvisor, and Open Pet Food Facts. The June 17 App Store Connect Distribution record still has that Description copy and App Review Notes that say Pro unlocks `recall alerts`. Repo search shows Open Pet Food Facts integration only, and the audit work removed unsupported recall/customer-review claims from app and hosted surfaces.
   - Business impact: review risk and user trust risk, especially in a health-adjacent category.
   - Fixed in this audit: `scripts/check-claim-safety.mjs`, `npm run check:claims`, and CI now scan production app surfaces, Edge Functions, hosted docs/legal copy, and release config for unsupported DogFoodAdvisor/CatFoodAdvisor, customer-review, recall, veterinary-approval, guaranteed-safety, and medical-diagnosis claims. Defensive uses, such as Claude instructions not to invent those fields and paywall metadata rejection patterns, are allowed. `scripts/check-app-store-listing.mjs` / `npm run check:listing` now validates the replacement App Store metadata in `APP_STORE_LISTING.md` against Apple field limits, unsupported claims, required AI/veterinary caveats, and guest-scan release gates.
   - Recommendation: use `APP_STORE_CONNECT_AUDIT.md` and `APP_STORE_LISTING.md` to replace unsupported App Store metadata, Promotional Text, keywords, App Review Notes, and screenshot messaging unless those integrations exist outside this repo. If they do exist, bring the source code and data-flow docs into the repo.

4. **Backend production source has been reconstructed but not yet proven live.**
   - Evidence: this audit added tracked `product-lookup` and `revenuecat-webhook` source under `supabase/functions/`, but the recreated files have not been compared against or deployed over the live dashboard versions.
   - Business impact: lookup behavior, entitlement sync, security, and costs are now auditable in git, but production may still differ until deployment is reconciled.
   - Recommendation: compare deployed function bodies where possible, run `npm run edge:fingerprint`, redeploy the tracked functions intentionally, then run `npm run edge:verify-live` to confirm live `X-Woof-Function-Name` / `X-Woof-Function-Audit-Version` headers and document required secrets.

5. **The first analytics layer and KPI reporting model exist now, but they still need deployment and live data.**
   - Evidence: this audit added `services/analytics.js`, migration `060_analytics_events.sql`, migration `065_kpi_reporting_views.sql`, `KPI_FRAMEWORK.md`, and tracking calls across onboarding, auth, scanner, results, paywall, purchases, restore, profile, history, and sharing.
   - Business impact: App Store/RevenueCat show outcomes, and Woof can now collect and query the missing funnel events after the migrations are deployed.
   - Recommendation: deploy the analytics and KPI migrations, validate event inserts plus reporting views in Supabase, then review activation, scan success, paywall conversion, share rate, scan reversal, RevenueCat webhook processing, and egress per successful scan weekly.

6. **The open GitHub draft PR is not the current audit work and has no CI evidence.**
   - Evidence: `GITHUB_RELEASE_AUDIT.md` records the read-only GitHub API and local git findings. PR #1 is open and draft from `codex/push-woof-app`, has 0 statuses/check runs, and differs from the current local worktree. GitHub Actions only reports the Pages workflow; this worktree's smoke CI file has not been pushed.
   - Business impact: merging the wrong branch could ship a stale release package or skip the current audit's Supabase, App Store, RevenueCat, Sentry, analytics, and deployment gates.
   - Recommendation: reconcile or supersede PR #1 before merge. Push the current audit work and `.github/workflows/ci.yml` on a clean release branch, let GitHub run the smoke checks, then require those checks before production release.

## Product And Revenue Recommendations

`PRODUCT_UX_REVENUE_AUDIT.md` now contains the detailed source-backed UX/revenue journey audit for first-run, onboarding, Home empty state, scanner mode copy, Results gates, guest account saving, paywall source mix, and retention experiments.

### 1. Let Users Reach The First Result Faster

Move from `install -> onboarding -> auth -> camera -> result` to `install -> camera -> first result -> auth/paywall`.

Best next variant:

- Keep first scan access in the authenticated navigator through Supabase anonymous auth, not a separate offline mode.
- Ask for Apple/Google sign-in only when the user wants to save history, restore across devices, or after the first result proves value.
- Keep the 3 free scans, but enforce them server-side.

### 2. Reframe The Paywall Around The Moment Of Need

The paywall now uses a measurable `monthly_default_v1` variant in the worktree: Monthly is selected by default, trial copy is shown only when the loaded RevenueCat package has a free trial and the user is eligible, and request/source/package-load/expected-package/variant/pitch/plan/dismissal analytics are included across paywall and purchase events. Paywall copy now adapts to the entry source (`results_gate`, `scan_limit`, `post_scan_prompt`, `home_banner`, or `profile`) while preserving the same purchase plumbing. It also safely reads RevenueCat Offering Metadata for paywall variant, default-plan, headline, and positioning hints while rejecting unsupported health/source claims. RevenueCat data suggests annual creates trials, but monthly appears to be carrying active paid subscriptions, so this still needs live validation after deployment.

Fixed in this audit: paywall comparison prices, annual monthly equivalent, and savings percent are now derived from the live RevenueCat package prices instead of hard-coded `$95.88/yr`, `$2.50/mo`, and `Save 69%` claims. Missing packages now render as loading/unavailable instead of fallback dollar prices, and the purchase CTA is disabled until a real RevenueCat package exists. Trial CTA, accessibility labels, timeline, analytics, and disclosure now use RevenueCat product/eligibility data; unknown or ineligible iOS status shows non-trial pricing copy. Secondary upgrade gates are now price-neutral until the RevenueCat-backed paywall loads current store prices.

Test sequence:

1. Establish a 7-day instrumented baseline for `monthly_default_v1`.
2. Validate source-specific paywall pitches by `pitch_key`.
3. Validate `monthly_default_v1` against annual-default and trial/no-trial variants using real RevenueCat trial eligibility, not hard-coded trial copy.
4. Test placement/source-specific Offerings in RevenueCat after baseline data is stable.

Required instrumentation:

- `paywall_viewed` with source and `pitch_key`.
- `paywall_offerings_loaded` with package count, expected package count, weekly/monthly/annual availability, missing plan count, and success state so request-to-paywall routing can be separated from RevenueCat/package availability.
- `paywall_trial_eligibility_loaded` with configured, eligibility status, trial label, and claim state.
- `paywall_plan_selected`.
- `paywall_dismissed` with source, variant, pitch, selected plan, package-load state, trial fields, exit reason, close outcome, and duration.
- `purchase_started`, `purchase_cancelled`, `purchase_failed`, `purchase_completed`.
- RevenueCat customer id and app user id mapping, without logging personal data.
- `REVENUECAT_EXPERIMENT_PLAN.md` now contains the dashboard checklist, experiment sequence, stop conditions, and official RevenueCat doc links.

### 3. Build The First Acquisition Loop Around Trust

`GROWTH_CREATIVE_PLAN.md` now turns this section into an execution plan: launch gates before paid spend, approved hooks, four core audience segments, first ad directions, channel plan, KPI loop, and 30-day roadmap. The Creative Production Ads Explorer prompt run is saved under `outputs/imagegen/woof-digital-product-ads/`; it generated prompt directions only, not final images, so publish-bound creative should use real screenshots from a validated build.

This audit also added a conservative app-review loop: Profile exposes a measured "Rate Woof" action, Results can show a cooldown-limited rating prompt only after repeat successful good-scoring pet-food scans, and KPI views track review prompt views, rating-page requests, successful store opens, and failures by source.

It also added a measured support path in Profile: "Contact Support" opens a prefilled email to `woofapp.help@gmail.com` with safe app/platform/account diagnostics, shows the email address if the mail client cannot open, and tracks support taps, email opens, failures, and open rate in KPI views. This protects revenue by giving purchase/restore/account issues a lower-friction path than churn or a bad review.

Fixed in this audit: Profile now scrolls instead of relying on a fixed-height layout. That keeps guest account-saving, restore purchases, support, rating, legal, sign-out, delete, and version details reachable on compact devices after the account/subscription rows added during this audit.

Creative angles to test:

- **Store aisle scan:** "Before you buy, scan the label."
- **Ingredient shock:** "Find BHA, artificial colors, by-products, and fillers in seconds."
- **Human food emergency:** "Can my dog eat this? Snap a photo."
- **No barcode needed:** differentiate against barcode-only competitors.
- **Compare two bags:** show 0-100 score as a shopping decision tool.

Landing/store cleanup:

- Fix all unsupported claims.
- Add a screenshot that shows the first scan result clearly.
- Use the phrase "AI-assisted" and "informational, not veterinary advice" near health-sensitive claims.
- Refresh App Store screenshots after anonymous-first-scan is implemented.

### 4. Add A Real Retention Surface

The app has scan history, but there is no obvious recurring reason to return beyond a single question.

Retention ideas:

- Saved pet profiles with age/species/allergies and personalized ingredient warnings.
- Favorite products and "better alternatives."
- Recall watchlist for scanned products.
- Weekly "scan before buying" reminder, only after permission and value.
- Shareable result cards that drive organic installs; fixed in this audit by adding the configured Woof share URL to text shares, share-card imagery, and linked-share KPI fields.

## Technical Findings

### Auth, Entitlements, And Free Scans

- `FREE_SCAN_LIMIT = 3` was previously enforced in the client using local state and `profiles.scan_count`.
- Fixed in this audit: migration `061_scan_entitlements.sql` adds `scan_usage_events` and an idempotent `consume_scan` RPC. The app now consumes scans through Supabase before analysis work, and the `analyze` Edge Function calls the same RPC before Claude so direct API calls cannot bypass the free-scan limit.
- Fixed in this audit: migration `069_consume_scan_reversed_retry.sql` closes a scan-id replay gap after reversals. A previously reversed failed `scan_id` must now pass the current entitlement check and re-consume a free scan when appropriate, instead of reusing an old `allowed=true,counted=false` event indefinitely. Because authenticated clients can execute `consume_scan` for barcode cache-hit accounting, the RPC now ignores client-provided free-limit overrides unless the caller is `service_role`.
- Fixed in this audit: app-side persisted scan counts are now scoped by Supabase user id, and the app no longer loads the legacy global `@woof_scan_count` before the active guest/user is known. This prevents a previous local session's count from falsely sending a new anonymous user to the paywall before the server-side scan gate can check the real profile.
- The result UI now syncs local scan count from the server response instead of blindly incrementing after every `done` state, and scan-limit errors route to the paywall.
- Fixed in this audit: migration `063_scan_reversal.sql` adds an idempotent `reverse_scan` RPC. The `analyze` Edge Function now reverses counted free scans for Claude timeouts, Claude API errors, invalid JSON, empty responses, and invalid final-response validation.
- Fixed in this audit: streamed analyses now also reverse counted free scans when the client disconnects or cancels the stream before a valid result is delivered. `ResultsScreen` now calls `analysisService.cancelAnalysis()` on intentional loading-screen exits, so the user-facing Back/navigation path actually aborts the stream and reaches the Edge reversal path.
- Fixed in this audit: migration `066_profile_write_security.sql` prevents authenticated clients from directly changing `profiles.scan_count`, so scan usage remains owned by `consume_scan` / `reverse_scan`.
- Fixed in this audit: successful photo and human-food scans now sync scan usage from the `analyze` Edge Function response instead of pre-consuming on the client. Streaming responses emit a `woof_scan_usage` SSE event; non-streaming responses include `scanUsage` JSON. Photo cache hits and completed in-memory photo entries no longer complete a new scan attempt before that Edge scan-usage confirmation arrives; barcode cache hits still consume client-side because they bypass the Edge analysis call.
- Fixed in this audit: app-side analysis timeouts now wait longer than the Edge Function's Claude timeout, so the server has time to reverse counted free scans and return corrected `scanUsage` before local watchdogs show a timeout.
- Fixed in this audit: paid-user stale-entitlement recovery now refreshes RevenueCat/Supabase once and retries the same analysis when the server scan gate returns `SCAN_LIMIT_REACHED`, reducing the chance that a newly paid user sees the paywall immediately after purchasing.
- Fixed in this audit: client profile-derived Pro state now treats `pro_expires_at` as authoritative, matching the server scan gate so an expired profile timestamp does not keep the UI in stale Pro mode.
- Fixed in this audit: auth setup and guest account-linking now avoid letting background profile refreshes overwrite fresher RevenueCat entitlement results, Apple/Google account linking triggers a RevenueCat refresh after profile sync, and guest scan history is explicitly migrated if account linking returns a different user id.
- Fixed in this audit: the Supabase OAuth callback handler now supports PKCE `code` callbacks through `exchangeCodeForSession` while keeping the implicit `access_token` / `refresh_token` fallback. Empty callbacks now fail explicitly, and `check:syntax` guards the exchange markers so Apple/Google account-saving flows do not silently lose the session after the browser returns.
- Fixed in this audit: a self-referential `useCallback` dependency in `services/auth.js` was removed so `AuthProvider` does not crash while initializing Pro status, and the syntax guard now checks for self-referential `useCallback` / `useMemo` dependency arrays.
- Fixed in this audit: when the RevenueCat SDK cannot check customer info, auth falls back first to the server-side RevenueCat subscriber sync and then to an active, unexpired Supabase profile entitlement. Successful fallback paths emit `revenuecat_status_fallback_used` so transient SDK/config issues are visible in analytics without immediately locking out paid users.
- Fixed in this audit: `068_tiered_rate_limits.sql` makes the `check_rate_limit` RPC Pro-aware. Free users keep the default 20/hour abuse cap, while active Pro users get a higher operational safety cap so "unlimited scans" is not accidentally constrained by the free-user throttle.

### RevenueCat Integration

- Fixed in this audit: `services/purchases.js` no longer treats placeholder RevenueCat API keys as usable configuration, emits paywall analytics for missing configuration, and uses RevenueCat user switching through `logIn()` after SDK configuration.
- Fixed in this audit: `supabase/functions/revenuecat-webhook/index.ts` and migration `062_revenuecat_webhook.sql` now provide a tracked server-side entitlement sync path. The webhook verifies an authorization header, stores raw events in `revenuecat_events`, updates `profiles.is_pro` / `pro_expires_at`, calls RevenueCat `GET /subscribers` when `REVENUECAT_REST_API_KEY` is configured, records subscriber sync status/error metadata, and handles `TRANSFER` events by revoking source IDs and syncing destination subscriber state.
- Fixed in this audit: `supabase/functions/revenuecat-sync/index.ts` adds an authenticated client-triggered subscriber refresh. After RevenueCat reports an active Pro purchase/restore, `services/auth.js` calls the function so Supabase `profiles.is_pro` is updated by the service role before the next `consume_scan` gate, reducing the webhook-lag window that could otherwise block a newly paid user.
- Fixed in this audit: `services/revenuecatSync.js` now extracts `revenuecat-sync` HTTP error response bodies and tracks `http_status`, `sync_status`, and `function_error` on `revenuecat_profile_sync_failed`, so missing REST API keys, subscriber API failures, or unavailable function deploys are visible during TestFlight validation instead of collapsing into a generic function error.
- Fixed in this audit: local Pro access now preserves RevenueCat SDK-active entitlement when immediate server subscriber sync reports `is_pro=false`, records `revenuecat_status_mismatch`, and launches one deduplicated three-attempt authenticated server reconciliation with bounded backoff. The retry stops on server-confirmed Pro, never promotes a client claim, and emits started/attempt/completed/exhausted diagnostics. The paywall also records `purchase_entitlement_refreshed` and `restore_entitlement_refreshed` with the post-refresh Pro result, handles completed purchases that do not activate the expected `pro` entitlement as `purchase_no_entitlement` instead of leaving the CTA spinner stuck, tracks pending payments separately as `purchase_pending`, and distinguishes restore attempts with active RevenueCat purchase activity but no Pro entitlement as `restore_no_entitlement`. Profile now has a real Restore Purchases row that initializes RevenueCat for the active user, restores transactions, refreshes Pro state, and emits the same restore outcome events. Purchase/restore analytics now include safe RevenueCat result diagnostics, and KPI views expose refresh-to-Pro, pending, and no-entitlement counts so purchase completion can be separated from entitlement activation health.
- Fixed in this audit: SDK-confirmed inactive status now reconciles only when Supabase still carries an active Pro profile. Normal free users avoid an extra RevenueCat server call, while stale post-expiry Pro state is checked against authenticated server truth before access is retained or revoked.
- Fixed in this audit: RevenueCat readiness and clean-prebuild checks now reject any committed or generated StoreKit catalog whose subscription renewal rate is not Real Time, preventing accelerated expiry-test timing from being left behind.
- Fixed in this audit: local post-expiry testing now has a guarded StoreKitTest helper that runs only with `WOOF_STOREKIT_EXPIRE_MONTHLY=1`, accelerates the local renewal clock, expires purchased Woof subscription products, and clears local test transactions; normal CI skips the state-changing test.
- Fixed in this audit: Profile subscription management now awaits the platform subscription-settings link, tracks `subscription_manage_opened` / `subscription_manage_failed`, and gives fallback App Store / Google Play cancellation guidance if the link cannot open. Paywall restore and purchase-error copy now uses App Store / Google Play wording for cross-platform flows, and the public support FAQ now includes both iPhone and Android cancellation instructions.
- Fixed in this audit: `PaywallScreen` now explicitly calls `initializePurchases(user.id)` before fetching RevenueCat offerings. This retries RevenueCat setup at the revenue moment if auth startup had a transient SDK initialization miss or timeout, reducing false "plan unavailable" states. `resetPurchases()` also waits for an in-flight RevenueCat logout/reset before another app user id is logged into the SDK.
- Fixed in this audit: `paywall_offerings_loaded` now records expected weekly/monthly/annual package availability, missing plan count, and product identifiers, and KPI views expose expected-package load rates plus missing-plan counts. That lets RevenueCat/App Store package setup problems be fixed before paywall copy or price tests are judged.
- Fixed in this audit: guest account linking now explicitly re-identifies RevenueCat with `initializePurchases(updatedUser.id)` and tracks `account_link_revenuecat_reidentified` before the account-link Pro refresh, reducing the chance that a linked Apple/Google account keeps using stale anonymous-user RevenueCat state. Account-link and Google sign-in Pro refreshes now pass `updatedUser.id` explicitly, so fallback profile checks do not consult a stale guest/null user if React state has not re-rendered yet.
- Remaining risk: production still needs a real sandbox purchase/restore/cancel/expiration/transfer validation pass. If `REVENUECAT_REST_API_KEY` is missing or the subscriber API fails, the webhook falls back to lifecycle event logic and records the fallback/error, but transfer destination grants are not fully canonical without subscriber sync.
- Recommendation: deploy `revenuecat-sync` and the webhook with `REVENUECAT_WEBHOOK_AUTH` / `REVENUECAT_REST_API_KEY`, configure the same authorization header in RevenueCat, send a test webhook, then validate purchase, renewal, cancellation, expiration, transfer, and restore flows against `profiles.is_pro`, immediate `revenuecat_profile_sync_completed` analytics, and `revenuecat_events.subscriber_sync_status`.

### Analysis And AI Safety

- The Edge Function has image size limits, field length limits, OPFF field allow-listing, and timeouts. That is good production hardening.
- Fixed in this audit: `services/claude.js` now validates final Claude responses before treating them as complete scan results. Pet-food scans must include a product name, pet type, score, summary, verdict, nutrition block, and ingredient list; human-food scans must include food name, pet type, safety level, summary, explanation, portions, preparation, and age guidance. Optional arrays are normalized before the UI saves or renders the result.
- Fixed in this audit: `supabase/functions/analyze/index.ts` now applies matching final-response validation before returning non-streaming Claude responses and before writing streaming results to the shared cache.
- Fixed in this audit: malformed streamed final responses now emit a Woof-owned `woof_error` SSE event after scan reversal; `services/claude.js` recognizes that event and surfaces the reversed `scanUsage` to the normal result error flow.
- Fixed in this audit: successful streamed responses now emit a Woof-owned `woof_scan_usage` SSE event so the UI can sync the free-scan counter after server-side consumption without pre-consuming image scans locally.
- Fixed in this audit: `services/claude.js` now treats a completed stream without `woof_scan_usage` as incomplete and retries/falls back instead of accepting optimistic partial JSON as a finished result.
- Remaining risk: streaming partial JSON is still shown optimistically while Claude is generating, and the stream error/confirmation path still needs live Edge Function deployment and TestFlight validation.
- Fixed in this audit: unsupported customer-review and recall-history output was removed from the prompts, normalized out of validated results, removed from the Pro result UI, and removed from paywall/website/legal copy. Keep these claims out unless a live, licensed source is added.

### History And Data Integrity

- Human-food history previously saved `safetyLevel` locally but did not persist it to Supabase. This made cross-device history lose the safety state and could render dangerous-looking default dots.
- Fixed in this audit: `services/history.js` now maps `safety_level`, and `supabase/migrations/058_human_food_history.sql` adds the column.
- Fixed in this audit: live Supabase reconciliation found production already has migration history through `057_tighten_supplemental_catalog_exclusions`, so the local audit migrations are now deployable as `058`-`070` instead of colliding with production's existing `007`-`057` migration history. See `SUPABASE_LIVE_RECONCILIATION.md`.
- Fixed in this audit: `070_security_advisor_hardening.sql` addresses low-risk Supabase advisor findings by setting a fixed search path on the historical catalog-filter helper and revoking default `PUBLIC`/`anon` execution from historical app RPCs while preserving authenticated/service-role access.
- Fixed in this audit: `supabase/validation/post_deploy_audit_validation.sql` now provides a single read-only post-deploy SQL check for audit migration application, required analytics/entitlement/RevenueCat objects, KPI views, required KPI view columns including scan-id-matched upload-cost fields, profile privilege hardening, anon RPC execution hardening, and the live search-path advisor fix.
- Verified in this audit: the post-deploy validation SQL was run read-only against live Supabase before deployment. It produced actionable failing rows for missing audit migrations/objects and passing rows for already-live objects, proving the validation artifact itself is executable.
- Human-food local result caching previously wrapped the result in a nested `{ result, dataSource, opffData }` object, unlike all other local cached results.
- Fixed in this audit: `services/analysisService.js` now stores the analysis object consistently.
- Cache-hit scans previously completed successfully but did not always write a local replay copy or history row, so a repeated barcode/photo scan could look successful and then disappear from recent history.
- Fixed in this audit: cached barcode results, cached photo results, and post-entitlement completed-result fallbacks now persist local result playback and scan history through the same completion helper. New scan attempts do not reuse completed in-memory entries until their barcode/client or Edge scan-accounting path has run; history display and Supabase sync also fall back to `foodName` / `Scan result` when older local rows do not have `productName`.
- Fixed in this audit: human-food history now stores a bounded user-owned result snapshot so saved results remain available after the shared cache expires. The history list deliberately excludes snapshot payloads, fetching one only when its owner opens that row. Verified pet-food history reconstructs deterministic results from the verified catalog, while legacy unavailable rows offer a mode-aware rescan action instead of a dead end.
- Fixed in this audit: migration `295_restore_pet_profile_write_grant.sql` restores authenticated writes to only `pet_profile` and `updated_at` after the earlier profile hardening migration revoked them. Entitlement, scan-count, and RevenueCat fields remain server-owned.

### Cache And Cost Control

- `analysis_cache` has RLS that blocks authenticated users from writing, but `services/cache.js` calls `increment_cache_hit` from the client.
- Fixed in this audit: `increment_cache_hit` is now a `SECURITY DEFINER` RPC with a narrow `UPDATE` on the cache counter.
- Fixed in this audit: migration `064_schedule_cleanup_jobs.sql` enables Supabase Cron/`pg_cron`, hardens the cleanup functions, and schedules daily cleanup for expired cache rows and stale rate-limit rows.
- Remaining risk: after deployment, confirm `cleanup-expired-cache` and `cleanup-stale-rate-limits` exist in `cron.job` and have successful runs in `cron.job_run_details`.
- Fixed in this audit: `ScannerScreen` now targets smaller analysis images, adds a 640px emergency compression step, blocks unusually large client payloads before upload, and records optimization dimensions/quality in scan analytics.
- Fixed in this audit: scanner capture failures now carry stage-specific telemetry (`camera_capture`, `missing_photo_uri`, `image_optimization`, or `optimization_missing_base64`), and KPI views expose capture failure and image optimization failure counts so first-scan leaks can be diagnosed before scaling acquisition.
- Fixed in this audit: the `analyze` Edge Function image cap now matches the app-side cap at `2_400_000` base64 characters instead of accepting `7_000_000`, preventing older or direct clients from forwarding oversized payloads to Claude and increasing Supabase egress. The Edge Function safety script now checks this app/server cap alignment.
- Fixed in this audit: `public.kpi_analysis_cache_health` now exposes shared cache row counts, expired rows, cache payload bytes, hit coverage, and active hits per row so cache retention can be tuned from evidence instead of guessing whether the cache is saving enough fresh uploads and Claude calls to justify its size.
- Fixed in this audit: `services/claude.js` now avoids a second streaming retry for image payloads, skips retry/fallback when the server has already returned scan-usage reversal state, and suppresses automatic non-streaming fallback after an image streaming upload has already gone out. It emits `analysis_upload_started` with estimated request bytes plus the generated `scan_id`, emits `analysis_image_retry_suppressed` when it prevents a duplicate image upload, and surfaces those failures as `upload_retry_suppressed` so repeated upload pressure is measurable without silently doubling egress.
- Supabase egress overage makes cache hit rate, fresh scan volume, image upload attempts per fresh scan, estimated upload bytes per fresh scan, and stream payload size urgent to monitor.

### Product Lookup

- Fixed in this audit: `supabase/functions/product-lookup/index.ts` now tracks the deployed product lookup surface in git. It validates auth, accepts barcode and name-search requests, normalizes Open Pet Food Facts data, and applies request timeouts.
- `services/opff.js` now tries the Supabase `product-lookup` function first and falls back to direct Open Pet Food Facts calls if the function is not deployed or temporarily unavailable.
- Remaining risk: the function still needs to be deployed and compared against the existing dashboard version. Once deployed, OPFF lookups can be monitored and tuned centrally instead of being entirely device-side.

### Logging, Crashes, And Observability

- Fixed in this audit: `services/logger.js` now gates app-side diagnostic logs behind `__DEV__`, and the noisy auth, scanner, Claude, OPFF, paywall, cache, history, purchase, and analysis logs now use that logger instead of raw `console.log`.
- Remaining raw console calls are intentionally limited to Supabase Edge Functions and the logger implementation. Server logs are still useful for operational debugging, but should be reviewed before high-volume paid acquisition.
- Fixed in this audit: `services/errorReporting.js` captures sanitized JavaScript errors through the root ErrorBoundary, global React Native `ErrorUtils`, and unhandled promise rejection hook, then sends `app_error_captured` events through the existing analytics queue without blocking app flows. Error events now include `error_category` and a normalized `error_fingerprint`, and analytics redaction covers plain local file paths in addition to URLs, file URLs, emails, JWT-like tokens, secrets, and long opaque payloads.
- Fixed in this audit: all analytics events now include centralized release context (`app_version`, `native_build_version`, `runtime_version`, platform, and execution environment), and `065_kpi_reporting_views.sql` adds `public.kpi_app_release_daily` so scan success, paywall, purchase, entitlement-refresh, and JS error signals can be segmented by app build.
- Fixed in this audit: scan failure telemetry now carries structured `failure_category`, `error_code`, `http_status`, scan-usage reversal, and entitlement-recovery fields. `065_kpi_reporting_views.sql` adds `public.kpi_scan_failures_daily` so activation failures can be reviewed by scan mode, failure type, error code/status, and app version instead of relying on raw messages.
- Fixed in this audit: Sentry native crash reporting is now wired into the worktree with `@sentry/react-native`, the Expo config plugin, the Sentry Metro wrapper, production EAS env validation, root `Sentry.init`, `Sentry.wrap(App)`, release/build/update tags, `sendDefaultPii: false`, tracing disabled by default, and a `beforeSend` scrubber for emails, URLs, file paths, JWT-like values, secret-looking tokens, and long opaque strings. First-party `app_error_captured` analytics now uses the same JWT-like token and common secret-prefix redaction before truncating diagnostic text, so app-error grouping can be useful without storing credentials in Supabase analytics rows.
- Fixed in this audit: `scripts/check-crash-reporting.mjs`, `npm run check:crash-reporting`, and CI now enforce package-lock alignment, the Expo config plugin, the Sentry Metro wrapper, Sentry/EAS env contract, privacy-safe app initialization markers, and root app wrapping.
- Remaining gap: Sentry DSN/org/project/auth-token values still need to be configured in EAS/Sentry, and a TestFlight smoke build must prove source-map upload, release creation, crash-free sessions, and `app_error_captured` grouping before production submission.
- Recommendation: configure Sentry EAS secrets, run `npm ci`, `npm run check:expo-config`, and `npm run check:bundle`, make a TestFlight build, verify the release appears in Sentry with source maps, then validate both Sentry crash-free sessions and first-party `app_error_captured` category/fingerprint grouping.

### Product UI And Accessibility

- Fixed in this audit: primary activation and revenue controls now have clearer accessibility roles, labels, hints, and selected/disabled state where relevant. This covers onboarding progression, auth legal links/modal close, home scan and human-food CTAs, the dog/cat picker, scanner permission/help/capture/cancel controls, result back/share/retry/expand/upgrade actions, paywall plan cards/CTA/restore/legal links, profile save-account/subscription/sign-out/delete actions, and legal WebView back navigation. UI `letterSpacing` values are now normalized to `0` in shared typography and screen styles for more predictable text rendering.
- Fixed in this audit: Profile now uses a scroll container with flex-safe subscription/support row copy, so smaller devices and larger text settings can still reach account-saving, restore, support, legal, sign-out, and delete controls without text overlapping the trailing chevrons.
- Business impact: the first-scan and paywall paths are easier to operate with VoiceOver/TalkBack, and paywall plan cards now announce price, period, trial status, and selected state instead of relying only on visual styling.
- Remaining gap: a native accessibility QA pass still needs to run in TestFlight because local syntax checks cannot prove focus order, screen-reader phrasing, hit target behavior, or modal focus trapping on iOS/Android.
- Recommendation: add a TestFlight VoiceOver/TalkBack smoke checklist before release, then prioritize any focus-order or dynamic-type issues that appear on device.

### DevOps And Testing

- A lightweight first-party analytics service now queues pre-auth events locally and flushes them to Supabase after sign-in.
- The new `analytics_events` table intentionally has no client `SELECT` policy; `065_kpi_reporting_views.sql` adds service-role/reporting-only KPI views for dashboarding without exposing raw analytics to app clients.
- Fixed in this audit: `services/analytics.js` now redacts sensitive string values before queueing or inserting event properties, including emails, URLs, file paths, JWT-like tokens, common API-key prefixes, and long opaque payloads. `scripts/check-analytics-privacy.mjs` and `npm run check:analytics` guard this behavior in CI.
- Fixed in this audit: local release metadata now matches the live 1.2 line: `app.json`, `package.json`, and `package-lock.json` use `1.2.0` instead of stale `1.0.0`.
- Remaining release risk: `eas.json` uses `appVersionSource: "remote"` with production `autoIncrement`, so the remote EAS app version/build number must be verified before the next App Store submission.
- Fixed in this audit: release configuration is now guarded more tightly. Camera permission copy covers both pet-food label scans and human-food safety scans, non-development EAS builds fail during app config resolution if required public Supabase/RevenueCat app environment variables are missing, and `check:release` now verifies native IDs, required Expo plugins, camera permissions, EAS update/runtime settings, Android permissions, and the build-time env validation.
- Fixed in this audit: `package.json` now has one-command `check:preflight`, dependency-free `check:secrets`, `check:syntax`, `check:ci`, `check:analytics`, `check:privacy`, `check:accessibility`, `check:claims`, `check:listing`, `check:sql`, `check:kpi`, `check:deployment`, `check:edge`, `check:edge-types`, `check:release`, and `check:crash-reporting` scripts, plus dependency-backed `check:audit`, `check:expo-versions`, `check:expo-config`, `check:bundle`, and `check:prebuild` scripts. `.github/workflows/ci.yml` runs `git diff --check`, secret scanning, JavaScript syntax/hook-dependency checks, CI/preflight/package alignment checks, analytics privacy checks, App Privacy disclosure checks, accessibility label checks, claim-safety checks, App Store listing checks, SQL migration safety checks, KPI runbook checks, deployment-readiness checks, native crash-reporting checks, Edge Function safety checks, Deno Edge Function type checks, Edge Function fingerprinting, live Edge verifier dry-run, `npm ci`, production dependency-audit threshold checks, Expo SDK package-version checks, Expo config resolution/fail-fast validation, Expo bundle export, Expo native prebuild, and release metadata checks on pushes to `main` and pull requests.
- Fixed in this audit: `scripts/check-release-preflight.mjs` and `npm run check:preflight` now use the shared `scripts/release-gates.mjs` manifest to orchestrate local release gates in order, starting with `git diff --check`, then the dependency-free audit checks, CI/preflight/package alignment, Edge Function type-checking, Edge Function fingerprinting, live Edge verifier dry-run, dependency audit, Expo config resolution, Expo bundle export, and release metadata. It supports `--dependency-free` for package/tool-limited environments while still running the deploy-blocking checks that do not need Deno or `node_modules`.
- Fixed in this audit: the package tree now pins transitive `react-native` and `@react-native/virtualized-lists` through npm overrides so Metro does not see a second nested React Native copy. This fixed a production export failure in `VirtualViewExperimentalNativeComponent.js` caused by an auto-installed nested `react-native@0.86.0`.
- Fixed in this audit: Expo-managed packages were aligned to the installed SDK 55 compatibility table, including `react-native@0.83.6`, `react-native-worklets@0.7.4`, `expo-system-ui@55.0.18`, and current SDK 55 patch versions for camera/auth/session/updates/web-browser packages. `scripts/check-expo-versions.mjs` / `npm run check:expo-versions` now runs `expo install --check --json` after dependency install and fails if package versions drift.
- Fixed in this audit: after the SDK 55 patch alignment, React Native dedupe, and `expo-system-ui` fixes, the production dependency audit baseline is `13` moderate advisories and `0` high/critical advisories. `scripts/check-dependency-audit.mjs` and `npm run check:audit` now fail CI if any high/critical production advisory returns, if the moderate count rises above the current tracked baseline, or if `package-lock.json` reintroduces a nested React Native copy under `react-native`.
- Remaining dependency risk: the remaining `npm audit --omit=dev` findings are Expo/React Native transitive advisories whose suggested fixes require semver-major or otherwise risky framework-package moves, so they need a dedicated dependency-upgrade branch with `npm ci`, Expo config resolution, native build, and TestFlight smoke validation rather than a blind `npm audit fix --force`.
- Remaining gap: no app lint, app typecheck, test, native build, or Supabase migration dry-run pipeline is present yet.
- The current machine still has no package-manager command or Deno command on PATH, but a temporary npm CLI plus bundled Node was used to install dependencies, run `check:expo-versions`, run `check:expo-config`, run the Metro/Hermes `check:bundle` export smoke test, run the temp native `check:prebuild` smoke test, and pass the full `check:preflight` locally. A temporary Deno install was used to run `check:edge-types`. Native device/simulator runtime validation was still not run in this pass.
- Recommendation: expand CI with app lint, app typecheck, native/Expo build smoke tests, and migration dry-runs once package/native tooling is available.

## Fixes Applied In This Audit

- Removed tracked `supabase/.temp/*` files and ignored `supabase/.temp/` in `.gitignore`.
- Fixed the hosted website App Store link from the wrong id to `6760733899`.
- Updated hosted `docs/privacy.html` for current app behavior, human-food photos, subscriptions, Open Pet Food Facts, operational logs, and 2026 date.
- Added `safety_level` persistence for human-food scan history.
- Fixed human-food local result cache shape.
- Hardened `increment_cache_hit` RPC for RLS-safe cache hit tracking.
- Added scheduled cleanup for expired analysis cache rows and stale rate-limit rows with Supabase Cron.
- Added a Supabase-backed analytics event table and client-side funnel tracking for onboarding, auth, scanner, results, paywall, purchases, restore, history, profile, and sharing. Events now include release/build context for TestFlight and production segmentation.
- Hardened analytics queue attribution so early/offline events record capture ownership, flush on auth state sign-in and cold start with an existing session only when they are pre-auth or match the active user, and drop legacy/user-mismatch queue entries instead of attaching them to a future account. Queue flushes are single-flight, `analytics_queue_flushed` records recovered event volume, `analytics_queue_dropped` records protected drops, and `auth_signed_out` is not queued for a future user.
- Added `KPI_FRAMEWORK.md`, `WEEKLY_REVIEW_RUNBOOK.md`, and reporting migration `065_kpi_reporting_views.sql` for activation cohorts, daily funnel, weekly operating review, release/build diagnostics, scan-failure diagnostics, share diagnostics, app error telemetry, paywall source/variant/pitch/plan conversion, scan usage, RevenueCat webhook/subscriber-sync health, and event-count scorecards.
- Added `REVENUECAT_EXPERIMENT_PLAN.md` with baseline, pitch, monthly-vs-annual, placement/source, dashboard, and stop-condition guidance.
- Added `APP_STORE_LISTING.md` with paste-ready App Store metadata, ASO keyword guidance, screenshot captions, Product Page Optimization ideas, App Review notes, and unsupported-claim guardrails.
- Added dependency-free App Store listing checking through `scripts/check-app-store-listing.mjs`, `npm run check:listing`, and CI. It validates recommended App Store name/subtitle/promotional text/description/keywords against Apple limits, blocks unsupported claims in the replacement metadata, requires the AI/veterinary disclaimer, and keeps no-account copy gated on validated guest scanning.
- Added `APP_PRIVACY_DISCLOSURE.md` with source-backed App Store Connect App Privacy answers, linked-data categories, third-party processor inventory, tracking/no-IDFA status, Sentry update triggers, and operational publishing checklist.
- Added dependency-free App Privacy disclosure checking through `scripts/check-app-privacy-disclosure.mjs`, `npm run check:privacy`, CI, and deployment-readiness coverage so the privacy-label pack stays aligned with the hosted privacy policy, package state, and release checklist.
- Added `GROWTH_CREATIVE_PLAN.md` and Creative Production Ads Explorer prompt artifacts for Search Ads, paid social, organic short-form, and App Store screenshot/creative testing after launch gates are met.
- Added `PRODUCT_UX_REVENUE_AUDIT.md` with a source-backed product-flow audit and experiment backlog covering scan-first onboarding, empty-state CTAs, post-result guest account saving, human-food copy, source-specific paywall testing, and retention surfaces.
- Implemented the first `PRODUCT_UX_REVENUE_AUDIT.md` product fixes in the worktree: `AuthProvider` now mounts while onboarding is visible, the first onboarding screen has a `Scan Product` path that routes to Scanner after anonymous auth readiness, Home empty history has inline pet-food and human-food scan CTAs with `source_surface: "home_empty_state"`, Results shows a contextual guest-save prompt after anonymous scan value is delivered, and Scanner human-food capture/help copy now says food-safety language instead of pet-food ingredient-analysis language.
- Added an anonymous-first auth path: automatic Supabase guest sessions, a fallback "Continue as Guest" auth button, guest-aware profile UI, Apple/Google account-saving actions, guest-history migration on account linking, and legal copy aligned to guest usage.
- Hardened Supabase OAuth callback completion for Apple/Google browser flows by exchanging PKCE auth codes, preserving implicit-token fallback behavior, and failing explicitly when the callback contains no usable session.
- Split first-run auth diagnostics in `kpi_daily_funnel` so auth-screen fallback exposure, automatic guest session starts/completions/failures, manual guest continuation, and Apple/Google provider sign-in behavior can be reviewed separately during TestFlight and weekly activation reviews.
- Added server-side free-scan enforcement: idempotent scan usage RPC, scan usage event table, client entitlement service, Edge Function entitlement gate before Claude, paywall routing for scan-limit denials, and profile privilege hardening so clients cannot mutate scan count or Pro state directly.
- Added migration `066_profile_write_security.sql` to restrict client profile writes to safe identity fields and add an own-row `scan_history` update policy for upsert-based sync.
- Added migration `067_delete_account_privacy.sql` and local cache cleanup so delete-account removes linkable analytics, scan usage, RevenueCat webhook, rate-limit, profile/history, local history, local result, and analytics queue/session data.
- Added tracked RevenueCat webhook source and event storage for server-side Pro entitlement sync, including optional RevenueCat subscriber API sync and transfer handling.
- Added authenticated `revenuecat-sync` Edge Function plus client calls after purchase/restore/Pro refresh so server-side scan entitlement catches up immediately when RevenueCat already knows the user is Pro.
- Added RevenueCat sync and purchase/restore diagnostics so `revenuecat_profile_sync_failed` carries HTTP/function status details from the Edge Function response, and paywall/Profile purchase/restore events carry safe RevenueCat error/result metadata without logging customer identifiers.
- Added Profile subscription-management and support-contact diagnostics so support/cancellation link failures and support email open failures are visible instead of silently leaving subscribers stuck.
- Added account-link RevenueCat re-identification so guest-to-Apple/Google account saving refreshes the SDK app user id before entitlement sync.
- Hardened account-link and Google sign-in entitlement refreshes so just-completed auth transitions pass the new Supabase user id directly instead of relying on possibly stale React auth state.
- Hardened auth entitlement ordering so profile refreshes no longer clobber fresher RevenueCat Pro state during app start, purchase recovery, or guest account linking.
- Added a RevenueCat SDK-unchecked fallback path that consults server subscriber sync and, if that is unavailable, an active unexpired Supabase profile entitlement before showing a paid user as free.
- Added tier-aware analyze rate limiting so Pro users are protected from the free-user abuse cap while the backend keeps a high safety throttle.
- Hardened RevenueCat client configuration diagnostics and user switching.
- Changed the in-app paywall to the tracked `monthly_default_v1` variant: Monthly default, store/eligibility-aware trial copy, source-specific paywall pitch copy, plan/source/variant/pitch purchase analytics, and no unsupported review/recall feature claim.
- Standardized paywall request analytics so Home scan-limit blocks, the home upgrade banner, Profile upgrade, and Results upgrade gates emit `paywall_requested` before navigation. KPI views now expose total paywall requests, scan-limit paywall requests, request-to-view rate, and source-level paywall request/view/purchase conversion before pitch and plan drilldowns.
- Added richer paywall close/dismiss analytics so close-button and native back/gesture exits emit one `paywall_dismissed` event with source, variant, pitch, selected plan, package-load state, trial fields, exit reason, close outcome, and duration, while purchase/restore success exits emit `paywall_closed` without inflating dismissals. KPI views now expose dismissal counts, dismissal rate, and average dismiss duration by source, pitch, variant, and plan.
- Replaced hard-coded paywall comparison prices and savings claims with values computed from RevenueCat package prices, made missing package prices render as loading/unavailable, made trial CTA/disclosure truthful to the loaded RevenueCat product plus iOS intro-eligibility result, and removed the stale result-gate `From $3.33/month` claim.
- Added safe RevenueCat Offering Metadata support for remote paywall `paywall_variant`, `default_plan`, headline, and positioning hints, with strict length limits and unsupported-claim rejection before copy reaches the UI.
- Changed result sharing into a free branded acquisition loop instead of a Pro-only gate; share analytics now segment free/pro users, scan mode, data source, and completion/dismissal/failure method.
- Added a measurable install path to result sharing: text shares append the configured Woof share URL, image share cards include a compact "Get Woof" link line for image-only share surfaces, and KPI views count share starts/completions/dismissals where the acquisition link was attached. Dismissed share sheets now emit `share_dismissed` instead of inflating `share_completed`.
- Added a conservative measured app-review loop: Profile can open the store rating page, Results can prompt only after repeat successful good-scoring pet-food scans without overlapping first-scan/paywall prompts, and KPI views count review prompt views, requests, opens, failures, and source-level success rates.
- Made Profile scrollable and flex-safe so the added guest, subscription, restore, rating, support, legal, sign-out, and delete rows remain reachable on compact screens.
- Removed unsupported customer-review and recall-history product claims from Claude prompts, result rendering, Pro gate copy, website support/home copy, hosted terms, and in-app legal terms.
- Added tracked product lookup Edge Function source and routed OPFF lookups through it with direct OPFF fallback.
- Added adaptive scan-photo optimization, image retry reduction, upload-attempt analytics, and a lower Edge Function image cap to reduce and monitor Supabase egress before oversized image payloads are forwarded to Claude.
- Added scanner pre-upload cancellation hardening so tapping Cancel during photo capture/optimization invalidates the in-flight capture, records `photo_capture_cancelled`, and prevents a stale capture from navigating to Results or uploading after the user backed out.
- Added camera permission flow hardening so pet-food and human-food scanner permission copy match the selected scan mode, blocked permissions route to settings with fallback messaging, and permission request/result/settings outcomes are tracked for activation diagnostics.
- Aligned local release metadata to the live 1.2 line by updating `app.json`, `package.json`, and `package-lock.json` to `1.2.0`.
- Added a dependency-free release metadata check and GitHub Actions smoke CI for install plus release metadata validation.
- Added a post-install Expo config check in GitHub Actions so `app.config.js`, native identifiers, public EAS env injection, and production missing-env fail-fast behavior are exercised with the actual Expo CLI.
- Added `scripts/check-release-preflight.mjs`, `npm run check:preflight`, and deployment-readiness coverage so local release prep has one ordered command before the expanded per-gate debugging list.
- Added `scripts/check-expo-versions.mjs`, `npm run check:expo-versions`, CI coverage, and release-preflight coverage so Expo-managed package patch drift is caught by `expo install --check --json`.
- Added `scripts/check-expo-export.mjs`, `npm run check:bundle`, CI coverage, and release-preflight coverage so iOS and Android Hermes bundle export catches Metro/import/dependency-tree failures before TestFlight.
- Added `scripts/check-expo-prebuild.mjs`, `npm run check:prebuild`, CI coverage, and release-preflight coverage so Expo native project generation is tested in a temporary directory without mutating the worktree. The check also prevents the Android `userInterfaceStyle` / missing `expo-system-ui` warning from returning.
- Added dependency-free secret scanning through `scripts/check-secrets.mjs`, `npm run check:secrets`, and CI. The scan passed locally across tracked/unignored files.
- Added dependency-free JavaScript syntax and hook-dependency checking through `scripts/check-js-syntax.mjs`, `npm run check:syntax`, and CI. The scan also blocks hard-coded dollar prices in app monetization surfaces, non-zero numeric UI `letterSpacing` values, client scan timeouts that are not longer than the Edge Claude timeout, missing structured scan-failure telemetry, missing RevenueCat sync/account-link markers, Profile scroll-layout regressions, and accidental dev-mode release leakage. It passed locally across tracked/unignored `.js` and `.mjs` files.
- Added dependency-free analytics privacy checking through `scripts/check-analytics-privacy.mjs`, `npm run check:analytics`, and CI. Product analytics now redact sensitive string values before local queueing or Supabase insertion, and the guard covers queued-event ownership checks, boot-time queue flushing, queue drop diagnostics, and signed-out attribution behavior.
- Added dependency-free App Privacy disclosure checking through `scripts/check-app-privacy-disclosure.mjs`, `npm run check:privacy`, and CI. The scan guards the source-backed App Store Connect privacy-label pack, third-party processor inventory, no-tracking/no-IDFA assumptions, Sentry Crash Data state, and hosted privacy policy alignment.
- Added dependency-free accessibility label checking through `scripts/check-accessibility.mjs`, `npm run check:accessibility`, and CI. The scan checks app/screen JSX for interactive `Pressable`, `TouchableOpacity`, and `TouchableHighlight` controls with `onPress` and requires explicit roles and labels.
- Added dependency-free claim-safety checking through `scripts/check-claim-safety.mjs`, `npm run check:claims`, and CI. The scan guards production app surfaces, Edge Functions, hosted docs/legal copy, and release config against unsupported source, customer-review, recall, veterinary-approval, guaranteed-safety, and medical-diagnosis claims while allowing defensive rejection/instruction text.
- Added dependency-free App Store listing checking through `scripts/check-app-store-listing.mjs`, `npm run check:listing`, and CI. The current recommended metadata checks at name 22/30 chars, subtitle 23/30 chars, promotional text 130/170 chars, keywords 83/100 bytes, and description 1289/4000 chars.
- Added dependency-free SQL migration safety checking through `scripts/check-sql-migrations.mjs`, `npm run check:sql`, and CI. The scan now also checks profile write hardening, scan-history upsert policy coverage, delete-account table coverage and RPC execute permissions, tier-aware rate limiting, reversed scan-id retry handling, and authenticated-client free-limit override protection; it passed locally across all 19 migrations.
- Added dependency-free KPI runbook checking through `scripts/check-kpi-runbook.mjs`, `npm run check:kpi`, and CI so the weekly operating review continues to reference required dashboard inputs and KPI reporting views.
- Added dependency-free CI/preflight alignment checking through `scripts/check-ci-release-alignment.mjs`, `npm run check:ci`, CI, and release-preflight coverage so every local release gate, including raw commands such as `git diff --check`, appears in the GitHub workflow in the expected order around `npm ci`, and every scripted gate has a package alias.
- Added dependency-free deployment-readiness checking through `scripts/check-deployment-readiness.mjs`, `npm run check:deployment`, and CI so the deployment checklist stays aligned with tracked audit migrations, Edge Function deploy commands, required dashboard toggles, Supabase/RevenueCat secrets, key TestFlight validation markers, and CI coverage for Edge Function fingerprinting plus live-verifier dry-run.
- Added Sentry native crash reporting configuration through `@sentry/react-native`, the Expo config plugin, the Sentry Metro wrapper, root app initialization/wrapping, production EAS env validation, and privacy-safe event scrubbing. First-party app-error analytics now redacts JWT-like tokens and common secret-key prefixes before truncation.
- Added dependency-free native crash-reporting checking through `scripts/check-crash-reporting.mjs`, `npm run check:crash-reporting`, and CI. It enforces the Sentry package/config/plugin/Metro/init/privacy contract before release.
- Added dependency-backed production dependency-audit threshold checking through `scripts/check-dependency-audit.mjs`, `npm run check:audit`, and CI. It permits the current tracked `13` moderate Expo/React Native advisories for a dedicated upgrade pass, blocks any high/critical advisory or moderate-count regression, and blocks nested React Native lockfile regressions that would break Metro export.
- Added dependency-free Edge Function safety checking through `scripts/check-edge-functions.mjs`, `npm run check:edge`, and CI. The scan now also checks request-aware CORS, deployment marker headers, that the `analyze` stream-cancel path reverses counted scans, and passed locally across `analyze`, `product-lookup`, `revenuecat-webhook`, and `revenuecat-sync`.
- Added Deno Edge Function type-checking through `scripts/check-edge-typecheck.mjs`, `npm run check:edge-types`, CI Deno setup, and release-preflight coverage. The check uses committed `deno.lock` in frozen mode so the remote `esm.sh` Supabase module version cannot drift silently, and it passed locally across `analyze`, `product-lookup`, `revenuecat-webhook`, and `revenuecat-sync`.
- Added `scripts/fingerprint-edge-functions.mjs` and `npm run edge:fingerprint` so release notes can record local SHA-256 fingerprints before Supabase Edge Function deployment and compare them against dashboard source or live response headers.
- Added `scripts/verify-live-edge-functions.mjs` and `npm run edge:verify-live` so post-deploy validation can call live Supabase Edge Function OPTIONS endpoints and verify the tracked deployment marker headers.
- Replaced Edge Function non-null env assertions with explicit `requiredEnv` handling so missing Supabase, Anthropic, or RevenueCat secrets return controlled server configuration errors.
- Removed static wildcard CORS from `analyze`, `product-lookup`, `revenuecat-sync`, and `revenuecat-webhook`. Edge Functions now allow native/no-Origin requests, default localhost development origins, and configured production browser origins through optional `WOOF_ALLOWED_ORIGINS`.
- Hardened older `SECURITY DEFINER` migrations by adding explicit `SET search_path = public` to the profile trigger, rate-limit RPC, and initial cleanup RPCs.
- Added a production-safe app logger and moved app-side diagnostic logging behind `__DEV__`.
- Added dependency-free, sanitized app error telemetry through `services/errorReporting.js`, the root ErrorBoundary, global JavaScript error handling, and KPI reporting view `public.kpi_app_errors_daily`. App error events now include stable `error_category` / `error_fingerprint` grouping and plain local file-path redaction.
- Fixed the root ErrorBoundary fallback UI to use the existing theme background token and expose an accessible retry button.
- Added client-side final-response validation for pet-food and human-food Claude outputs, including safety-critical human-food fields.
- Added Edge Function final-response validation for non-streaming Claude responses and streaming cache writes.
- Added scan reversal support: migration `063_scan_reversal.sql`, Edge Function reversal calls on Claude/network/validation failures, client sync of reversed scan counts on failed analyses, and migration `069_consume_scan_reversed_retry.sql` so reversed scan IDs cannot be replayed as free allowed attempts and authenticated clients cannot inflate their own free-scan limit.
- Added stream-level final error signaling for malformed streamed responses via a `woof_error` SSE event carrying reversed scan usage.
- Added one-shot scan-limit recovery for paid users whose local RevenueCat entitlement is ahead of Supabase profile state.
- Added a product UI accessibility/readability pass across onboarding, auth, home, scanner, results, paywall, profile, and legal WebView screens for primary controls, modal actions, paywall plan state, expandable result details, navigation actions, and Profile scroll reachability.
- Added `DEPLOYMENT_CHECKLIST.md` with production deployment, migration, Edge Function, RevenueCat webhook, analytics, TestFlight, and rollback validation gates for this audit work.

## Roadmap

### Next 48 Hours

1. Resolve Supabase egress overage or upgrade before July 15, 2026.
2. Enable Supabase Anonymous Sign-Ins and manual identity linking, then verify guest scan, local history preservation, and account-saving flows in TestFlight.
3. Use `SUPABASE_LIVE_RECONCILIATION.md` and `DEPLOYMENT_CHECKLIST.md` to resolve Supabase migration-history drift, then deploy migrations `058_human_food_history.sql` through `070_security_advisor_hardening.sql`; deploy updated `analyze`, `product-lookup`, `revenuecat-webhook`, and `revenuecat-sync` functions; validate analytics inserts, KPI views, profile write restrictions, delete-account cleanup, free-scan enforcement, scan reversal/reversed-scan retry hardening, tier-aware rate limiting, cleanup cron runs, product lookup, advisor hardening, webhook entitlement sync, and immediate purchase/restore profile sync.
4. Use `APP_STORE_CONNECT_AUDIT.md`, `APP_PRIVACY_DISCLOSURE.md`, and App Store Connect to publish/update App Privacy answers, remove unsupported DogFoodAdvisor/CatFoodAdvisor and recall-alert claims from the 1.2 Distribution record, verify the build/version row, and save Product Page Preview evidence.
5. Use `APP_STORE_LISTING.md` to add Promotional Text, replace App Store description/keywords/App Review Notes, and refresh screenshots/copy after guest scanning is validated.
6. Use `GITHUB_RELEASE_AUDIT.md` before publishing: reconcile or supersede draft PR #1, push the current audit work with `.github/workflows/ci.yml`, and require the new GitHub smoke checks to pass on the release branch before merge.
7. Run `npm run edge:fingerprint`, deploy the tracked Edge Functions, run `npm run edge:verify-live` against the Supabase functions host, and compare dashboard source only if the live headers or behavior do not match the tracked build.

### Next 7 Days

1. Validate scan reversal and stream-level final error signaling in staging/TestFlight, including Claude timeout, Claude API error, invalid JSON, and invalid final-response cases.
2. Configure Sentry EAS secrets, validate source-map upload and Sentry crash-free sessions in TestFlight, then validate first-party `app_error_captured` category/fingerprint grouping.
3. Use `REVENUECAT_EXPERIMENT_PLAN.md` to configure the RevenueCat baseline and first experiment: monthly default, annual default, eligibility-aware trial/no-trial, source-specific copy, and placements.
4. Use `PRODUCT_UX_REVENUE_AUDIT.md` to validate the scan-first onboarding path, empty-state CTA change, guest-save prompt, and human-food copy cleanup after release gates pass.
5. Use `GROWTH_CREATIVE_PLAN.md` to generate 4 to 6 screenshot-grounded static assets only after guest scanning, analytics, paywall, App Store copy, crash/error, Supabase egress, and the recorded first-run path are stable.
6. Run VoiceOver/TalkBack through first scan, human-food selection, result, paywall plan selection, restore/legal links, profile save-account, and delete confirmations.
7. Expand CI with app lint/typecheck, migration checks, and native build/runtime smoke checks.

### Next 30 Days

1. Validate the first-run funnel around first result before account creation.
2. Validate the empty-state scan CTAs, contextual guest-save prompt, and human-food scanner copy in TestFlight.
3. Add pet profiles and personalized warnings.
4. Build compare mode, saved products, or another retention loop from the `PRODUCT_UX_REVENUE_AUDIT.md` backlog.
5. Refresh App Store screenshots and ASO copy after funnel changes.
6. Run the first small paid creative test from `GROWTH_CREATIVE_PLAN.md`, optimizing for cost per first completed scan and pausing if scan failures, app errors, crashes, or Supabase egress per scan rise materially.
7. Run the weekly metrics review from `WEEKLY_REVIEW_RUNBOOK.md`: installs, first scan rate, scan success rate, image upload attempts/bytes, paywall view rate, trial start rate, paid conversion, churn, share/review loops, app error session rate, crash-free sessions, Supabase egress per scan, and the action decision for product/revenue/reliability/growth.

## Verification

Passed in this pass:

- `git diff --check`
- `PATH="/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /tmp/codex-npm-cli/package/bin/npm-cli.js ci`
- `PATH="/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DENO_BIN=/tmp/woof-deno/bin/deno NPM_CLI_JS=/tmp/codex-npm-cli/package/bin/npm-cli.js /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-release-preflight.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-release-preflight.mjs --dependency-free`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-secrets.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-js-syntax.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-analytics-privacy.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-app-privacy-disclosure.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-accessibility.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-claim-safety.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-app-store-listing.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-sql-migrations.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-kpi-runbook.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-deployment-readiness.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-crash-reporting.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-edge-functions.mjs`
- `DENO_BIN=/tmp/woof-deno/bin/deno /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-edge-typecheck.mjs`
- `NPM_CLI_JS=/tmp/codex-npm-cli/package/bin/npm-cli.js /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-dependency-audit.mjs`
- `PATH="/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-expo-versions.mjs`
- `PATH="/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-expo-config.mjs`
- `PATH="/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-expo-export.mjs`
- `PATH="/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-expo-prebuild.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/fingerprint-edge-functions.mjs`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/verify-live-edge-functions.mjs --dry-run`
- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-release-metadata.mjs`
- `node --check` across every `scripts/*.mjs` file
- `node --check app.config.js`
- `node --check App.js`
- `node --check metro.config.js`
- `node --check config/env.js`
- `node --check services/analytics.js`
- `node --check services/logger.js`
- `node --check services/entitlements.js`
- `node --check services/auth.js`
- `node --check services/claude.js`
- `node --check services/history.js`
- `node --check services/analysisService.js`
- `node --check services/opff.js`
- `node --check services/purchases.js`
- `node --check screens/OnboardingScreen.js`
- `node --check screens/AuthScreen.js`
- `node --check screens/HomeScreen.js`
- `node --check screens/ScannerScreen.js`
- `node --check screens/ResultsScreen/index.js`
- `node --check screens/ResultsScreen/components.js`
- `node --check screens/ResultsScreen/styles.js`
- `node --check screens/PaywallScreen.js`
- `node --check screens/ProfileScreen.js`
- `node --check legal.js`

Dependency audit status:

- `/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /tmp/codex-npm-cli/package/bin/npm-cli.js audit --omit=dev --json` currently reports `13` moderate advisories, `0` high advisories, and `0` critical advisories after aligning the SDK 55 patch set, deduping React Native for Metro export, and adding `expo-system-ui`.
- The remaining advisories route through Expo/React Native transitive packages such as `@expo/config-plugins`, `xcode`/`uuid`, `react-native`, `babel-jest`, and `js-yaml`; npm's suggested fixes require major framework-package movement and need a tested dependency remediation pass.

Could not run in this pass:

- Full native app build, native device/simulator runtime validation, lint, typecheck, or tests. Dependencies are now installed locally through the temporary npm CLI, Metro/Hermes export passed, and Expo prebuild generated native projects in a temp directory, but this repo still has no lint/typecheck/test scripts and the native app was not launched in this pass.
- SQL migration dry-run for the audit migrations through `070_security_advisor_hardening.sql`, because `psql` and the Supabase CLI are not installed in this environment.
- Formal Product Design screenshot audit of the native app flow, because the app was not runnable locally in this environment.
- Native screen-reader QA, focus-order validation, and dynamic-type validation, because the app was not runnable locally in this environment.
- Fresh RevenueCat overview, paywalls, and experiments refresh after those routes stop returning `Loading RevenueCat...`.

## Notes For Follow-Up

- This report intentionally replaces the prior March 2026 audit because that file was stale and contradicted the current repo state.
- If the app store copy is changed instead of the app funnel, treat that as a temporary trust fix, not the ideal product answer. The better growth move is still first scan before auth.
