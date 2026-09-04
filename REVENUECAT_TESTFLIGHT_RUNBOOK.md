# Woof RevenueCat TestFlight Runbook

Last updated: 2026-07-10.

Purpose: prove Woof's subscription path before production submission, App Store metadata cleanup, or paid-growth tests. This is a sandbox/TestFlight operating checklist, not a place for private keys, customer PII, RevenueCat API keys, App Store Connect private account fields, or Supabase service-role secrets.

Use this after:

- Supabase migrations `058`-`070` are applied.
- Supabase migration `265_apple_search_ads_attribution_reporting.sql` is applied before paid acquisition validation.
- `revenuecat-webhook` and `revenuecat-sync` are deployed with `REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_REST_API_KEY`.
- `npm run edge:verify-live` passes against the live Supabase functions host.
- RevenueCat `default` offering has `$rc_weekly`, `$rc_monthly`, and `$rc_annual`.
- A TestFlight build includes the current audit work.

## Local Simulator Preflight

Use this before TestFlight to exercise the success path without charging a real account:

1. Open `ios/woof.xcworkspace` in Xcode.
2. Select the shared `woof StoreKit` scheme and an iOS Simulator.
3. Run with Xcode's Run button or `Cmd+R`. Do not launch this scenario with `xcodebuild`; the StoreKit configuration is attached to Xcode's scheme launch action.
4. Open the paywall and confirm weekly `$4.99`, monthly `$7.99`, and annual `$29.99` packages load with the three-day introductory offer.
5. Buy the monthly local product and confirm the paywall closes, Woof shows Pro access, and a server-gated scan is allowed.
6. Stop the app, use Xcode's StoreKit transaction manager to inspect or remove the local transaction, relaunch, and test Restore Purchases.
7. Confirm the ordinary `woof` scheme does not use `Woof.storekit`; archive and TestFlight builds must continue to use App Store Connect products.

Before the manual purchase, select the ordinary `woof` scheme and run its tests. `WoofConfigurationTests.testStoreKitProductsMatchRevenueCatCatalog` must pass; it verifies the USA storefront, all three product identifiers, exact local prices, billing periods, and three-day introductory offers after a clean Expo prebuild.

If an Apple Account sign-in sheet appears, the app was not launched through Xcode with the `woof StoreKit` scheme. Cancel the sheet and relaunch from Xcode. Local StoreKit success is a fast integration check, not a replacement for the sandbox/TestFlight scenarios below.

## Required Test Accounts

- Fresh iOS sandbox account eligible for introductory offers.
- Existing or reused sandbox account that is ineligible or unknown for introductory offers.
- Anonymous guest user that later saves with Apple or Google.
- Paid sandbox user used for restore, cancellation, and expiration checks.

## Preflight Evidence

Record non-sensitive links or screenshots in `RELEASE_EVIDENCE.md`:

- `revenuecat_offering_packages`: RevenueCat Debug panel or TestFlight notes proving weekly, monthly, and annual packages loaded with current price strings.
- `revenuecat_webhook_sync`: webhook test event plus sandbox purchase/restore event rows with `subscriber_sync_status = 'synced'`.
- `revenuecat_purchase_restore`: purchase, restore, cancellation, and expiration notes proving RevenueCat, Supabase profile state, app entitlement state, and analytics agree.
- `testflight_guest_scan`: guest scan and guest-to-account-save evidence if the purchase user starts as a guest.
- `kpi_event_ingestion`: KPI query output proving the expected paywall/purchase/restore events arrived.
- `apple_search_ads_attribution`: RevenueCat Apple Ads Services is connected and the iOS TestFlight build emits `apple_search_ads_attribution_collection_requested`.

## Scenario 1: Offering And Paywall Load

1. Fresh install the TestFlight build.
2. Start as a guest and navigate to the paywall from `scan_limit`.
3. Confirm the paywall does not show plan-unavailable fallback states.
4. Confirm weekly, monthly, and annual packages are visible.
5. Confirm monthly is selected by default for `monthly_default_v1`.
6. Confirm `paywall_trial_eligibility_loaded` appears with configured, eligibility status, trial label, and claim fields.
7. Confirm `paywall_offerings_loaded` includes:
   - `success=true`
   - `expected_package_count=3`
   - `missing_plan_count=0`
   - `weekly_package_available=true`
   - `monthly_package_available=true`
   - `annual_package_available=true`
   - `placement_identifier=scan_limit`
   - `placement_requested=true`
   - `offering_fetch_mode`
   - `placement_offering_returned`
   - `placement_fallback_used`
8. In the development RevenueCat Debug panel or analytics, confirm iOS shows Apple Ads attribution status `requested` after RevenueCat initializes.

Stop if any expected package is missing, `purchase_unavailable` appears, or current prices/trial labels do not match RevenueCat/App Store Connect sandbox products.

## Scenario 2: Purchase Success

1. Use the fresh eligible sandbox account.
2. Start purchase from the monthly plan unless testing another plan intentionally.
3. Complete the sandbox purchase.
4. Confirm app events:
   - `purchase_started`
   - `purchase_completed`
   - `purchase_entitlement_refreshed` with `is_pro=true`
   - no `purchase_no_entitlement`
   - no repeated `revenuecat_status_mismatch`
5. Confirm `revenuecat_profile_sync_completed` appears after purchase.
6. Confirm `profiles.is_pro=true`, `pro_expires_at` is current/future when applicable, and RevenueCat subscriber metadata is present.
7. Start a server-gated scan and confirm the user is treated as Pro.

Stop if purchase completes but the next scan is blocked by the free limit, `purchase_no_entitlement` appears, or `revenuecat_profile_sync_failed` repeats.

## Scenario 3: Restore From Paywall And Profile

1. Delete/reinstall or sign out/in to a fresh app state with the paid sandbox user.
2. Restore from the paywall.
3. Restore from Profile's "Restore Purchases" row.
4. Confirm both paths emit:
   - `restore_started`
   - `restore_completed`
   - `restore_entitlement_refreshed` with `is_pro=true`
   - no `restore_no_entitlement`
5. Confirm `revenuecat_profile_sync_completed` appears after restore.
6. Confirm server-side scan gates treat the user as Pro.

Stop if restore succeeds in RevenueCat but Supabase `profiles.is_pro` stays false.

## Scenario 4: Cancellation And Expiration

1. Cancel the sandbox subscription through the sandbox subscription manager.
2. Wait for the sandbox renewal/expiration event.
3. Confirm RevenueCat sends cancellation/expiration events to `revenuecat-webhook`.
4. Confirm `revenuecat_events.subscriber_sync_status = 'synced'` for the relevant event when `REVENUECAT_REST_API_KEY` is configured.
5. Confirm `profiles.is_pro` and `pro_expires_at` reflect the current RevenueCat subscriber state.
6. Confirm the app refreshes Pro state and does not keep stale Pro access after expiration.

Stop if `subscriber_sync_error` repeats or the app and server disagree after a refresh.

## Scenario 5: Guest Account Save With Purchase State

1. Start as an anonymous guest.
2. Complete at least one scan and open the paywall.
3. If purchasing before account save, complete purchase and confirm Pro state.
4. Save the guest account with Apple or Google.
5. Confirm `account_link_revenuecat_reidentified` fires before account-link Pro refresh.
6. Confirm the saved account keeps scan history and Pro state.
7. Confirm a server-gated scan after account save uses the saved user id and does not fall back to stale guest/null RevenueCat state.

Stop if history disappears, Pro state is lost, or `revenuecat_status_mismatch` repeats after account saving.

## Required SQL Review

Run after the sandbox tests:

```sql
select *
from public.kpi_paywall_source_daily
order by metric_date desc, source
limit 50;

select *
from public.kpi_paywall_daily
order by metric_date desc, source, paywall_variant, pitch_key, plan
limit 50;

select *
from public.kpi_revenuecat_daily
order by metric_date desc
limit 14;

select *
from public.kpi_apple_search_ads_attribution_daily
order by metric_date desc, platform, app_version, native_build_version
limit 21;

select *
from public.kpi_paid_acquisition_readiness_daily
order by metric_date desc, platform, app_version, native_build_version
limit 21;

select name, properties, created_at
from public.analytics_events
where name in (
  'apple_search_ads_attribution_collection_requested',
  'apple_search_ads_attribution_collection_failed',
  'paywall_offerings_loaded',
  'paywall_trial_eligibility_loaded',
  'purchase_started',
  'purchase_completed',
  'purchase_entitlement_refreshed',
  'purchase_no_entitlement',
  'restore_completed',
  'restore_entitlement_refreshed',
  'restore_no_entitlement',
  'revenuecat_profile_sync_completed',
  'revenuecat_profile_sync_failed',
  'revenuecat_status_mismatch'
)
order by created_at desc
limit 100;

select event_type, app_user_id, product_id, subscriber_sync_status, subscriber_sync_error, received_at
from public.revenuecat_events
order by received_at desc
limit 50;
```

Expected result:

- `missing_plan_count=0` for normal paywall loads.
- `paywall_expected_package_load_failures=0`.
- `placement_offering_errors=0`.
- `purchase_no_entitlement=0`.
- `restore_no_entitlement=0`.
- `purchase_entitlement_refresh_pro_rate=1.0000` for completed sandbox purchase tests.
- `restore_entitlement_refresh_pro_rate=1.0000` for completed sandbox restore tests.
- RevenueCat webhook rows have `subscriber_sync_status='synced'` when subscriber sync is configured.
- iOS rows in `public.kpi_apple_search_ads_attribution_daily` have `collection_requests > 0` and `collection_failures=0`.
- `public.kpi_paid_acquisition_readiness_daily` shows stable scan, paywall, purchase, entitlement, and app-error guardrails before starting Apple Search Ads spend.

## Evidence Handoff

After all scenarios pass:

1. Update `RELEASE_EVIDENCE.md` rows for `revenuecat_offering_packages`, `revenuecat_webhook_sync`, `revenuecat_purchase_restore`, `testflight_guest_scan`, and `kpi_event_ingestion`.
2. Run `npm run check:evidence`.
3. Keep `npm run check:evidence -- --strict` failing until every non-RevenueCat release blocker has evidence too.
4. Do not start RevenueCat experiments, Product Page Optimization, Search Ads, or paid social until `RELEASE_EVIDENCE.md` is strict-clean or explicitly waived with owner/date/rationale.
