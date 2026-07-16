# Woof Release Evidence Runbook

Last updated: 2026-06-17.

Purpose: define the exact non-sensitive proof needed to move each row in `RELEASE_EVIDENCE.md` from `Pending` or `Blocked` to `Ready`. This file is the operator playbook for external checks that local preflight cannot prove by itself.

Global rules:

- Do not store secrets, private keys, service-role tokens, RevenueCat API keys, raw customer identifiers, private App Store Connect account fields, or customer PII.
- Every evidence note should include a date, source, and short result, for example `2026-06-17 App Store Connect Product Page Preview saved; unsupported claims removed`.
- Use screenshot links, dashboard URLs, sanitized command output, run IDs, commit SHAs, and short SQL summaries.
- Keep `Waived` rare. A waiver needs owner, date, and rationale.
- Run `npm run check:evidence` after editing `RELEASE_EVIDENCE.md`; run `npm run check:evidence -- --strict` before production submission or paid-growth launch.

## github_current_branch_ci

Evidence source: GitHub PR page, GitHub Actions run page, local branch diff.

Capture steps:

1. Reconcile or supersede stale PR #1 before publishing the current audit work.
2. Push the current worktree to a release branch with `.github/workflows/ci.yml` and `.github/pull_request_template.md`.
3. Open a PR that uses the release template and confirms no stale `supabase/migrations/007`-`057` files are included.
4. Wait for the smoke CI workflow to complete.

Minimum proof: PR URL, branch name, commit SHA, green Actions run URL, and a note that PR #1 was superseded or reconciled.

Ready when: the current audit work is reviewable in GitHub and CI is green for that branch.

## supabase_migration_history

Evidence source: Supabase CLI migration list output and `SUPABASE_LIVE_RECONCILIATION.md`.

Capture steps:

1. Link the CLI to project `rhlgvrywjralxrjcdtrw`.
2. Run `supabase migration list`.
3. Confirm production history includes existing migrations through `057`.
4. Confirm local audit migrations start at `058` and no stale `007`-`057` local files are part of the release branch.
5. If the CLI reports drift, use Supabase's documented repair workflow only after verifying actual schema state.

Minimum proof: sanitized migration list timestamp plus a short note that `058+` audit migrations are intentionally reconciled with production history.

Ready when: migration history is understood and the next `supabase db push` will not collide with production migration versions.

## supabase_migrations_applied

Evidence source: Supabase migration output and post-deploy validation SQL output.

Capture steps:

1. Apply migrations `058` through `070` in numeric order.
2. Run `psql "$SUPABASE_DB_URL" -f supabase/validation/post_deploy_audit_validation.sql`.
3. Confirm every returned validation row has `pass = true`.
4. Save a sanitized summary of row counts and any warnings.

Minimum proof: migration application timestamp and post-deploy validation summary showing only passing rows.

Ready when: production has the audit tables, RPCs, grants, KPI views, scan reversal, RevenueCat sync schema, and advisor hardening that the app release depends on.

## supabase_edge_functions_live

Evidence source: Supabase Edge Function deploy output, Supabase dashboard function list, and live verifier output.

Capture steps:

1. Deploy `analyze`, `product-lookup`, `revenuecat-sync`, and `revenuecat-webhook`.
2. Run `npm run edge:fingerprint` and save the local fingerprints.
3. Run `SUPABASE_URL=https://<project-ref>.supabase.co npm run edge:verify-live`.
4. Confirm each live function returns the expected `X-Woof-Function-Name` and `X-Woof-Function-Audit-Version`.

Minimum proof: deploy timestamps, fingerprint output, and passing live verifier output.

Ready when: all four tracked Edge Functions are live and match the audited build markers.

## supabase_auth_dashboard

Evidence source: Supabase Auth dashboard screenshots or sanitized settings notes.

Capture steps:

1. Enable Anonymous Sign-Ins.
2. Confirm manual identity linking/provider settings needed for Apple and Google account saving.
3. Run `npm run auth:verify-live` and save the sanitized pass output; the verifier must report signups, anonymous users, Apple, and Google enabled without printing credentials.
4. Confirm Apple and Google redirect URLs include `woof://auth/callback`.
5. Record the anonymous-user RLS decision, including that anonymous users use the `authenticated` Postgres role and policies may need `is_anonymous`.
6. Record abuse-control and anonymous-user cleanup-retention decisions.
7. Enable Leaked Password Protection or record a dated waiver.

Minimum proof: timestamped settings notes covering every dashboard decision above.

Ready when: the no-account App Store promise can be safely tested in TestFlight without hidden Auth dashboard gaps.

## supabase_egress_plan

Evidence source: Supabase billing dashboard and post-deploy KPI queries.

Capture steps:

1. Resolve the egress overage or upgrade the plan before the July 15, 2026 grace-period risk.
2. After deployment, review upload-byte and cache-efficiency fields in `public.kpi_daily_funnel` and `public.kpi_analysis_cache_health`.
3. Compare egress per scan against the pre-audit baseline in `PROJECT_CONTEXT.md`.

Minimum proof: billing screenshot/link or plan note plus KPI query timestamp and short egress-per-scan summary.

Ready when: egress risk is no longer an immediate release/business blocker and scan upload pressure is measurable.

## revenuecat_offering_packages

Evidence source: RevenueCat dashboard, TestFlight paywall, and RevenueCat Debug panel notes.

Capture steps:

1. Use `REVENUECAT_TESTFLIGHT_RUNBOOK.md`.
2. Confirm the `default` offering returns `$rc_weekly`, `$rc_monthly`, and `$rc_annual`.
3. Confirm TestFlight price strings and trial eligibility match App Store sandbox product configuration.
4. Confirm `paywall_offerings_loaded` records `expected_package_count=3` and `missing_plan_count=0`.

Minimum proof: sanitized TestFlight screenshot or notes showing all packages, price/trial state, and matching analytics fields.

Ready when: package loading is proven before any paywall copy or price experiment is judged.

## revenuecat_webhook_sync

Evidence source: RevenueCat webhook test, Supabase Edge logs, `public.revenuecat_events`, and analytics rows.

Capture steps:

1. Confirm `REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_REST_API_KEY` are configured as Edge Function secrets.
2. Send a RevenueCat webhook test event.
3. Complete at least one sandbox purchase or restore in TestFlight.
4. Confirm `revenuecat_events.subscriber_sync_status = 'synced'` and no repeated `subscriber_sync_error`.
5. Confirm `revenuecat_profile_sync_completed` appears after immediate sync.

Minimum proof: non-sensitive event ids or timestamps, sync status summary, and no repeated sync-error note.

Ready when: webhook and immediate subscriber sync agree for real sandbox purchase or restore behavior.

## revenuecat_purchase_restore

Evidence source: TestFlight run notes, RevenueCat subscriber page, Supabase profile state, and KPI/event queries.

Capture steps:

1. Use fresh and reused iOS sandbox accounts from `REVENUECAT_TESTFLIGHT_RUNBOOK.md`.
2. Complete purchase, restore from Paywall, restore from Profile, cancellation, and expiration scenarios.
3. Confirm `purchase_entitlement_refreshed` and `restore_entitlement_refreshed` resolve to `is_pro=true`.
4. Confirm `purchase_no_entitlement`, `restore_no_entitlement`, and repeated `revenuecat_status_mismatch` are absent in normal flows.
5. Confirm `profiles.is_pro` and `pro_expires_at` match RevenueCat state after each scenario.

Minimum proof: TestFlight run timestamp, device/build notes, relevant event counts, and profile/subscriber agreement summary.

Ready when: paid users can buy, restore, expire, and scan without entitlement drift.

## app_store_privacy

Evidence source: App Store Connect App Privacy page and `APP_PRIVACY_DISCLOSURE.md`.

Capture steps:

1. Apply or intentionally supersede the disclosure answers in `APP_PRIVACY_DISCLOSURE.md`.
2. Confirm Data Used to Track You is `No`.
3. Confirm no IDFA/tracking SDKs are present.
4. Confirm linked-data categories match the current Supabase, RevenueCat, Sentry, analytics, scan-history, and support data flows.

Minimum proof: App Store Connect timestamp or screenshot link plus a short note that the current disclosure doc was applied or superseded.

Ready when: privacy answers match code and third-party processor reality.

## app_store_metadata

Evidence source: App Store Connect Product Page Preview and `APP_STORE_LISTING.md`.

Capture steps:

1. Replace the live description, keywords, promotional text, and review notes with safe copy from `APP_STORE_LISTING.md` or a documented successor.
2. Remove unsupported DogFoodAdvisor, CatFoodAdvisor, recall, customer-review, guaranteed-safety, and overbroad medical claims.
3. Confirm screenshots follow the product-proof-first order and do not claim unvalidated capabilities.
4. Save Product Page Preview evidence.

Minimum proof: Product Page Preview timestamp or screenshot link plus note that unsafe claim classes are removed.

Ready when: App Store Connect no longer creates trust, legal, or App Review risk.

## app_store_live_listing

Evidence source: public US App Store listing and live listing checker output.

Capture steps:

1. Wait until updated App Store Connect metadata is publicly visible.
2. Confirm guest scanning has passed TestFlight validation.
3. Run `npm run check:live-listing -- --guest-validated`.
4. Save the command timestamp and result.

Minimum proof: passing live-listing command output timestamp.

Ready when: the public listing is clean and the no-account promise has current TestFlight evidence.

## eas_remote_versioning

Evidence source: EAS CLI output and App Store Connect/TestFlight build row.

Capture steps:

1. Run `npm run check:eas-versioning`.
2. Run `npx eas-cli@latest build:version:get -p ios`.
3. Confirm the next iOS build number is greater than App Store Connect build `31`.
4. After build submission, confirm the App Store Connect/TestFlight row shows marketing version `1.2.1` and the expected new build number.

Minimum proof: sanitized EAS output timestamp plus App Store Connect/TestFlight build-row note.

Ready when: the next submission cannot repeat the previous `1.2` / build `31` versioning mismatch.

## sentry_release_health

Evidence source: EAS build logs, Sentry release page, TestFlight smoke run, and analytics rows.

Capture steps:

1. Configure `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` in the appropriate EAS environments.
2. Build with source-map/debug-symbol upload enabled.
3. Confirm Sentry shows the release and uploaded artifacts.
4. Run TestFlight smoke testing and review crash-free sessions.
5. Confirm `app_error_captured` grouping/fingerprint behavior is not noisy.

Minimum proof: Sentry release URL or safe screenshot link plus TestFlight crash-free and app-error summary.

Ready when: production crash/error visibility is working before rollout.

## testflight_guest_scan

Evidence source: TestFlight device notes, Supabase profile/scan usage rows, and analytics rows.

Capture steps:

1. Install the release candidate fresh.
2. Start as a guest and complete a first scan without Apple/Google account creation.
3. Validate free-scan enforcement, scan reversal/retry, local history preservation, and Apple/Google account saving.
4. Confirm `automatic_guest_session_*`, scan, history, and account-link analytics arrive.

Minimum proof: device/build/run notes plus event/profile/scan usage summary.

Ready when: the public no-account scanning promise is proven on the release candidate.

## testflight_accessibility_smoke

Evidence source: TestFlight VoiceOver/TalkBack run notes.

Capture steps:

1. Run VoiceOver or TalkBack through guest start, scanner, human-food pet picker, result, paywall plan selection, restore/legal links, profile account-save, and delete confirmation.
2. Record device, OS, build, and any focus-order or missing-label issues.
3. Fix blocking issues before marking ready.

Minimum proof: dated accessibility smoke notes with pass/fail summary and any fixed issue references.

Ready when: no blocking accessibility issue prevents the core scan/paywall/account flows.

## kpi_event_ingestion

Evidence source: Supabase SQL editor or psql query output for analytics and KPI views.

Capture steps:

1. Deploy migrations and complete TestFlight smoke flows first.
2. Run the KPI queries in `WEEKLY_REVIEW_RUNBOOK.md` and `REVENUECAT_TESTFLIGHT_RUNBOOK.md`.
3. Confirm events exist for onboarding, scan start/completion/failure, paywall request/view/package load/purchase/restore, support, review, sharing, and app errors.
4. Confirm release context fields are present on new events.

Minimum proof: SQL query timestamp, safe row counts, and a short note on any missing event class.

Ready when: the growth/revenue operating loop has reliable source-backed instrumentation.

## growth_spend_gate

Evidence source: launch decision note, acquisition dashboard screenshots, and `GROWTH_CREATIVE_PLAN.md`.

Capture steps:

1. Keep paid acquisition paused while any blocker in `RELEASE_EVIDENCE.md` is `Pending` or `Blocked`.
2. After strict evidence is ready or explicitly waived, document the first Search Ads/social test plan from `GROWTH_CREATIVE_PLAN.md`.
3. Optimize the first paid tests for first completed scan, not installs.

Minimum proof: dated launch decision note and, when applicable, acquisition dashboard screenshot showing spend paused or the approved small test.

Ready when: paid spend cannot outrun product, trust, entitlement, analytics, and crash evidence.
