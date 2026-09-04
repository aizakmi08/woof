# Woof RevenueCat Experiment Plan

Last updated: 2026-06-29.

Purpose: turn Woof's early subscription revenue into a repeatable paywall testing loop without breaking entitlement handling. RevenueCat remains the source for products, purchases, restores, and entitlement status; Woof's custom paywall remains the app UI for now.

## Current State

- RevenueCat dashboard observed in this audit: one active `default` offering with `$rc_weekly`, `$rc_monthly`, and `$rc_annual`.
- No RevenueCat hosted paywalls configured.
- No RevenueCat experiments configured.
- App paywall variant in the worktree: `monthly_default_v1`.
- App now records `source`, `source_intent`, `paywall_variant`, `pitch_key`, `default_plan`, selected `plan`, package/product identifiers, price, purchase outcome, restore outcome, paywall close/dismiss outcome, dismissal duration, offering load status, expected weekly/monthly/annual package availability, and whether safe RevenueCat Offering Metadata was applied.
- iOS builds now request RevenueCat Apple Search Ads AdServices attribution token collection after `Purchases.configure` / `Purchases.logIn`, and emit `apple_search_ads_attribution_collection_requested` or `apple_search_ads_attribution_collection_failed`.
- KPI view `public.kpi_paywall_pitch_daily` groups overall paywall conversion by `metric_date`, `source`, `source_intent`, `paywall_variant`, and `pitch_key`.
- KPI view `public.kpi_paywall_daily` keeps plan-level diagnostics by `metric_date`, `source`, `source_intent`, `paywall_variant`, `pitch_key`, and `plan`.
- KPI views `public.kpi_apple_search_ads_attribution_daily` and `public.kpi_paid_acquisition_readiness_daily` verify the app-side attribution path and paid-spend guardrails.

RevenueCat docs reviewed:

- [Getting Started with Experiments](https://www.revenuecat.com/docs/tools/experiments-v1/experiments-overview-v1): Experiments can A/B test 2-4 paywall configurations and are based on Offerings.
- [Getting Started with Experiments](https://www.revenuecat.com/docs/tools/experiments-v1/experiments-overview-v1): Experiments can test price, trial length/presence, subscription duration, product grouping, paywall design, copy, layout, Paywalls, or Offering Metadata.
- [Configuring Experiments](https://www.revenuecat.com/docs/tools/experiments-v1/configuring-experiments-v1): create and test Offerings before starting an experiment.
- [Configuring Experiments](https://www.revenuecat.com/docs/tools/experiments-v1/configuring-experiments-v1): Placements can serve different Offerings by paywall location, such as onboarding, settings, or a gated feature.
- [Running custom built paywalls alongside RevenueCat Paywalls](https://www.revenuecat.com/blog/engineering/running-custom-paywalls-alongside-revenuecat-paywalls/): custom paywalls can still use RevenueCat for product fetching, purchases, and entitlements while the app controls presentation.
- [Apple Search Ads & RevenueCat Integration](https://www.revenuecat.com/docs/integrations/attribution/apple-search-ads): RevenueCat can collect Apple Search Ads attribution after the app sends the AdServices token; Standard attribution does not require App Tracking Transparency consent and supports campaign, ad group, keyword, claim type, and organic/Search Ads segmentation in RevenueCat charts.

## Phase 0: Instrumented Baseline

Run this before changing dashboard experiments.

Duration: 7 days after the TestFlight/production build has the analytics migrations deployed.

Success metric:

- `paywall_view_purchase_rate` in `public.kpi_paywall_pitch_daily`.
- `paywall_view_dismissal_rate` and `avg_paywall_dismiss_duration_ms` in `public.kpi_paywall_pitch_daily`, `public.kpi_paywall_daily`, and `public.kpi_paywall_source_daily`.

Diagnostics:

- `paywall_views`
- `paywall_dismissals`
- `plan_selections`
- `purchase_starts`
- `purchase_completions`
- `purchase_cancellations`
- `purchase_failures`
- `purchase_unavailable`
- `purchase_start_completion_rate`
- `plan_selection_purchase_rate`
- `purchase_entitlement_refresh_pro_rate`
- `apple_search_ads_attribution_collection_requested`
- `apple_search_ads_attribution_collection_failed`
- `public.kpi_apple_search_ads_attribution_daily.collection_failure_rate`
- `public.kpi_paid_acquisition_readiness_daily`

Guardrails:

- `purchase_unavailable` should be near zero.
- `purchase_no_entitlement` should be zero; if it appears, the purchase completed without activating the expected RevenueCat `pro` entitlement.
- `purchase_entitlement_refreshed` and `restore_entitlement_refreshed` should resolve to `is_pro=true` in sandbox purchase/restore tests.
- `revenuecat_status_mismatch` should be zero in normal flows; any occurrence means SDK entitlement and server subscriber sync disagree.
- RevenueCat webhook processed events and subscriber sync statuses should stay aligned with purchases/restores.
- `profiles.is_pro` should update after sandbox purchase, restore, cancellation, and expiration tests.
- iOS TestFlight builds should emit `apple_search_ads_attribution_collection_requested` after RevenueCat initializes; failures should be zero before running Apple Search Ads spend.
- App Store Connect crash count and `public.kpi_app_errors_daily` should not spike.

Review query:

```sql
select *
from public.kpi_paywall_pitch_daily
order by metric_date desc, source, source_intent, pitch_key
limit 100;
```

## Phase 1: Source-Specific Pitch Test

Hypothesis: users convert better when the paywall explains the exact job they were trying to complete.

Current app support:

- `results_gate`: unlock the details behind this scan.
- `scan_limit`: keep checking labels without waiting.
- `post_scan_prompt`: keep comparing after the user has scanned multiple products.
- `home_banner`: make every pet food aisle easier to judge.
- `profile`: upgrade the account you already use.
- The paywall also shows a compact source-intent strip and sends `source_intent` / `source_context_label` on view, offering, plan, purchase, restore, and dismissal events so these jobs stay measurable if future placements or source names change.

Run as:

- Woof custom paywall code test using `pitch_key` and Supabase KPI views.
- If moving to RevenueCat Paywalls later, mirror these as separate paywall designs or Offering Metadata values.

Supported safe Offering Metadata keys in the app:

- `paywall_variant` or `woof_paywall_variant`: lowercase id for analytics, such as `annual_default_v1`.
- `default_plan` or `woof_default_plan`: one of `weekly`, `monthly`, or `annual`.
- Source headline overrides: `woof_<source>_headline`, `<source>_headline`, `woof_headline_<source>`, or `headline_<source>`.
- Source positioning overrides: `woof_<source>_positioning`, `<source>_positioning`, `woof_positioning_<source>`, or `positioning_<source>`.
- Supported sources: `default`, `results_gate`, `scan_limit`, `post_scan_prompt`, `home_banner`, and `profile`.

Safety limits:

- Headline overrides are ignored over 64 characters.
- Positioning overrides are ignored over 96 characters.
- Remote copy is ignored if it contains unsupported claim classes such as DogFoodAdvisor, CatFoodAdvisor, customer reviews, recall alerts/history, veterinary approval, guaranteed safety, or medical diagnosis.
- Feature lists, legal language, product entitlements, prices, and purchase behavior remain app-controlled. Secondary upgrade gates should use price-neutral copy; exact prices appear only after current RevenueCat package data is loaded.

Decision:

- Keep source-specific pitch if `paywall_view_purchase_rate` improves without increasing `paywall_view_dismissal_rate`, `purchase_cancelled`, or `app_error_session_rate`.
- If one source underperforms, revise that source's pitch before changing prices.

## Phase 2: Monthly Default Versus Annual Trial

Hypothesis: monthly default produces more paid subscribers than annual default because current RevenueCat evidence suggests annual trials create trial starts but monthly carries active paid revenue. Trial copy must remain driven by the loaded store product and eligibility result.

Control:

- `monthly_default_v1`: monthly selected by default; any trial CTA appears only when the RevenueCat package has a free trial and the user is eligible.

Candidate:

- `annual_default_v1`: annual selected by default, monthly still visible, and trial copy remains store/eligibility-aware.

Recommended setup:

- Create a second Offering only if product mix or ordering must differ remotely.
- Otherwise keep the app custom paywall variants and track `paywall_variant`.
- If using RevenueCat Experiments, create at least two Offerings and assign them to an experiment after testing both offerings on iOS.
- For iOS QA, test a fresh eligible sandbox account and an ineligible or unknown-status account; unknown status should show non-trial pricing copy.

Primary decision metric:

- Paid subscription starts per paywall view, not trial starts alone.

Guardrails:

- Trial cancellation/expiration rate.
- `purchase_start_completion_rate`.
- Net active subscriptions after 7 and 30 days.

## Phase 3: Placement/Source Offers

Hypothesis: scan-limit users may value unlimited access more than profile/home users and could support a different package emphasis.

Candidate placements:

- `scan_limit`
- `results_gate`
- `post_scan_prompt`
- `profile`
- `home_banner`

Use RevenueCat Placements when available:

- Serve unique Offerings by paywall location.
- Keep all purchase and entitlement logic in RevenueCat.
- Keep the app fallback on `offerings.current` so the paywall still works if placement targeting is not configured.
- The worktree now requests source-specific placements through `getCurrentOfferingForPlacement` for `scan_limit`, `results_gate`, `post_scan_prompt`, `profile`, and `home_banner`, then falls back to the current offering when the placement returns no offering or the dashboard has no matching rule.
- `paywall_offerings_loaded`, `paywall_viewed`, `paywall_metadata_applied`, `paywall_trial_eligibility_loaded`, purchase, restore, and dismissal events include `source_intent`, `source_context_label`, `placement_identifier`, `placement_requested`, `placement_supported`, `offering_fetch_mode`, `placement_offering_returned`, and `placement_fallback_used`.
- Use `public.kpi_paywall_source_daily.placement_offering_return_rate`, `placement_current_fallback_rate`, `placement_offering_errors`, and the placement request/return/fallback counts to validate RevenueCat dashboard setup before judging placement-specific conversion.
- Development builds include an expandable RevenueCat Debug panel on the paywall that shows configured key status, platform, source, placement id, fetch mode, placement support/return/fallback state, offering id, selected variant/default plan/pitch, missing plan count, package/product ids, price strings, and accepted/ignored metadata signals. Keep this panel behind the direct `__DEV__` render guard.
- Local web QA can open the debug paywall directly with `?woof_paywall_preview=<source>` in development builds. Supported sources are `results_gate`, `scan_limit`, `post_scan_prompt`, `home_banner`, and `profile`; invalid values fall back to `profile`. This path is guarded by `__DEV__` and does not authenticate, purchase, or ship in production.

Test ideas:

- `scan_limit`: monthly default, unlimited-scan copy.
- `results_gate`: annual value badge, full analysis copy.
- `post_scan_prompt`: monthly default, comparison/history copy.
- `profile`: annual value or account-level upgrade copy.

Share cards should remain free and branded so they can act as an acquisition loop; measure them through `public.kpi_share_daily` instead of treating share as a paywall placement.

## Dashboard Checklist

Before starting an experiment:

- Complete `REVENUECAT_TESTFLIGHT_RUNBOOK.md`, then copy non-sensitive proof into `RELEASE_EVIDENCE.md` rows `revenuecat_offering_packages`, `revenuecat_webhook_sync`, `revenuecat_purchase_restore`, `testflight_guest_scan`, and `kpi_event_ingestion`.
- Paid Apps agreement active in App Store Connect.
- Products are approved/available in App Store Connect sandbox.
- RevenueCat `default` offering returns all three packages in TestFlight.
- RevenueCat webhook has `REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_REST_API_KEY` configured, and a test event processed.
- RevenueCat Apple Ads Services integration is connected to the same Apple Ads product mode used for campaigns: Basic for Basic, Advanced for Advanced.
- Supabase `revenuecat-sync` function is deployed with `REVENUECAT_REST_API_KEY`, and a sandbox purchase/restore produces `revenuecat_profile_sync_completed`.
- Supabase audit migrations `058` through `070` deployed, including `065_kpi_reporting_views.sql`; deploy `265_apple_search_ads_attribution_reporting.sql` before paid acquisition readouts.
- `paywall_offerings_loaded.success = true` appears in `analytics_events`.
- `apple_search_ads_attribution_collection_requested` appears on iOS TestFlight after RevenueCat initializes; `public.kpi_apple_search_ads_attribution_daily.collection_failures=0`.
- `paywall_offerings_loaded` shows `missing_plan_count=0`, `source_intent`, and weekly/monthly/annual availability before interpreting a weak paywall conversion result as copy, price, or package-ordering feedback.
- If RevenueCat placement rules are configured, `placement_offering_return_rate` is high, `placement_current_fallback_rate` is low for the configured sources, and `placement_offering_errors=0`.
- `paywall_trial_eligibility_loaded` appears with the expected configured, status, label, and claim fields.
- Sandbox purchase, restore, cancel, and expiration paths update RevenueCat, `profiles.is_pro`, immediate profile-sync analytics, entitlement-refresh analytics, and `revenuecat_events.subscriber_sync_status`.

## Stop Conditions

Pause a paywall experiment if:

- `purchase_unavailable` rises materially.
- `apple_search_ads_attribution_collection_failed` appears in current iOS builds, or the RevenueCat Debug panel does not show `Apple Ads attribution=requested` after initialization.
- `paywall_expected_package_load_failures` or any weekly/monthly/annual missing-package count appears in normal sandbox or production flows.
- `placement_offering_errors` appears, or `placement_current_fallback_rate` stays high after the matching RevenueCat placement rules are live.
- `paywall_view_dismissal_rate` or very short average dismiss duration spikes for the tested source/pitch.
- `purchase_failed` clusters around StoreKit/product-not-available errors.
- RevenueCat purchases do not update Supabase entitlement state, `revenuecat_profile_sync_failed` repeats, or repeated `subscriber_sync_error` rows appear.
- App Store Connect crash count increases after the build.
- `public.kpi_app_errors_daily` shows repeated fatal paywall or purchase errors.
- Refund/support complaints mention misleading trial, billing, or missing entitlement.

## Next Implementation Ideas

1. After enough data, remove the weakest package if it distracts from the highest-value plan.
2. Add post-purchase survey or support tag for "why did/did not upgrade" once analytics volume is reliable.
