# Woof KPI Framework

Last updated: 2026-06-17.

Purpose: give Woof a weekly operating rhythm for improving activation, revenue, trust, and cost. The current app has early revenue, but the biggest open question is where users drop before the first valuable result and where paid intent breaks.

Use `WEEKLY_REVIEW_RUNBOOK.md` as the paste-ready weekly operating review. This framework defines the metrics; the runbook turns them into dashboard inputs, SQL drilldowns, decision rules, and a weekly narrative template.

## Primary KPIs

1. **Activation rate**
   - Definition: users with at least one `scan_analysis_completed` event divided by users first seen in the same cohort.
   - Source: `public.kpi_activation_cohorts.activation_rate`.
   - Why it matters: Woof sells confidence after the first result. If users do not reach a completed scan, App Store conversion and paywall tests will underperform.
   - Provisional target: 60%+ of fresh installs/users complete one scan within the first day after anonymous-first scanning is live.

2. **Paywall-to-purchase user rate**
   - Definition: users with `purchase_completed` divided by users with `paywall_viewed`.
   - Source: `public.kpi_activation_cohorts.paywall_to_purchase_user_rate`, daily diagnostic `public.kpi_daily_funnel.paywall_purchase_completion_rate`, source diagnostic `public.kpi_paywall_source_daily`, source/pitch view `public.kpi_paywall_pitch_daily`, and plan/source/variant view `public.kpi_paywall_daily`.
   - Entitlement-quality companion metric: `purchase_entitlement_refresh_pro_rate` in `public.kpi_daily_funnel`, `public.kpi_paywall_pitch_daily`, and `public.kpi_paywall_daily` should stay at 100% in sandbox/prod validation.
   - Why it matters: RevenueCat shows early paid traction, but annual trials appear to create cancellations while monthly appears to carry active revenue.
   - Provisional target: 3% to 5% of paywall viewers complete a purchase in the first 30 days after the new funnel ships.

3. **Net successful scan cost**
   - Definition: Supabase egress and Claude/API spend divided by `scan_analysis_completed`.
   - Source: `public.kpi_daily_funnel.scan_completions`, `cached_scan_completions`, `fresh_scan_completions`, `scan_cache_completion_rate`, `photo_capture_completions`, `avg_photo_capture_base64_length`, `avg_photo_capture_estimated_decoded_bytes`, `avg_photo_capture_optimization_step`, `image_upload_attempts`, `analysis_image_retry_suppressions`, `image_uploads_per_fresh_scan`, `analysis_upload_estimated_bytes`, `estimated_upload_bytes_per_fresh_scan`, scan-id-matched `completed_scan_upload_estimated_bytes`, `fresh_completed_scan_upload_estimated_bytes`, `matched_upload_bytes_per_completed_scan`, `matched_upload_bytes_per_fresh_scan`, Supabase usage, Anthropic usage, and RevenueCat revenue.
   - Why it matters: Supabase egress is already over free-plan quota, so growth can break margin or availability if scan payloads and cache hit rate are not controlled.
   - Provisional target: egress per successful scan and average estimated upload bytes trend down after adaptive image compression, retry reduction, and cache cleanup deployment.

## Driver Metrics

- **Scan success rate**: `scan_completions / scan_starts`.
  Source: `public.kpi_daily_funnel.scan_success_rate`.

- **Scan failure rate**: `scan_failures / scan_starts`.
  Source: `public.kpi_daily_funnel.scan_failure_rate`.

- **Free scan reversal rate**: reversed free scans divided by allowed free scan attempts.
  Source: `public.kpi_scan_usage_daily.free_scan_reversal_rate`.

- **Scan-limit block rate**: scan-limit blocks divided by scan gate attempts.
  Source: `public.kpi_scan_usage_daily.scan_limit_block_rate`.

- **Scan-limit paywall request rate**: free-limit moments that request the paywall, especially `scan_limit_paywall_requests` from local and server-gated scan-limit paths.
  Source: `public.kpi_daily_funnel.scan_limit_paywall_requests` and source rows in `public.kpi_paywall_source_daily`.

- **First-run auth entry health**: scan-now versus education-path onboarding, onboarding completion, auth-screen exposure, automatic guest session success, manual guest fallback success, and Apple/Google provider completion.
  Source: `public.kpi_daily_funnel.onboarding_scan_now_rate`, `onboarding_completion_rate`, `auth_screen_view_rate`, `automatic_guest_session_success_rate`, `manual_guest_continue_success_rate`, `provider_sign_in_completion_rate`, and `public.kpi_onboarding_path_daily` split by `onboarding_path` (`scan_now`, `completed_flow`, `scan_now_incomplete`, `education_incomplete`, and `started_only`).

- **Empty-state activation**: empty-history scan CTA taps divided by all scan CTA taps, with pet-food versus human-food split.
  Source: `public.kpi_daily_funnel.empty_state_scan_cta_taps`, `empty_state_pet_food_scan_cta_taps`, `empty_state_human_food_scan_cta_taps`, and `empty_state_scan_cta_share`.

- **Free-scan quota clarity**: taps on the Home free-scan status nudge, reviewed with scan-limit paywall requests and remaining-scan context on Home scan CTA events.
  Source: `public.kpi_daily_funnel.free_scan_status_taps`, `scan_limit_paywall_requests`, and `scan_cta_tapped` event properties `remaining_scans` / `source_surface`.

- **Scanner guidance demand**: scanner help opens should fall or scan completion should improve after capture-tip copy changes; high help opens plus weak completion indicates first-scan guidance is still unclear.
  Source: `public.kpi_daily_funnel.scanner_help_opens`, `photo_capture_completions`, `scan_success_rate`, and `photo_capture_failures`.

- **Guest account-save prompt**: post-result guest-save views, provider taps, completions, cancellations, dismissals, failures, and completion/dismissal rates.
  Source: `public.kpi_daily_funnel.guest_save_prompt_views`, `guest_save_prompt_provider_taps`, `guest_save_prompt_completions`, `guest_save_prompt_cancellations`, `guest_save_prompt_dismissals`, `guest_save_prompt_failures`, `guest_save_prompt_completion_rate`, and `guest_save_prompt_dismissal_rate`.

- **History reuse loop**: recent-history opens, history search/filter use, search/filter result opens, compare card opens, comparison result opens, result-open rates, and activated-user comparison rate.
  Source: `public.kpi_daily_funnel.history_item_opens`, `history_search_starts`, `history_search_submissions`, `history_filter_changes`, `history_tool_result_opens`, `history_tool_result_open_rate`, `history_compare_opens`, `history_compare_result_opens`, `history_compare_result_open_rate`, `public.kpi_activation_cohorts.activated_to_history_compare_rate`, and `public.kpi_retention_daily`.

- **Analytics transport health**: queued analytics flushes, recovered event volume, and user-mismatch/legacy queue drops after auth startup.
  Source: `public.kpi_daily_funnel.analytics_queue_flushes`, `analytics_queue_drops`, `analytics_queued_events_flushed`, and `analytics_queued_events_dropped`.

- **Scan cache and upload pressure**: cached vs fresh scan completions, optimized client-photo size/step, image upload attempts per fresh scan, suppressed duplicate image-upload retries, scan-id-matched upload bytes for completed scans, pre-upload guidance demand, capture failures/cancellations, and oversized-photo blocks per day.
  Source: `public.kpi_daily_funnel.cached_scan_completions`, `fresh_scan_completions`, `scan_cache_completion_rate`, `scanner_help_opens`, `photo_capture_completions`, `avg_photo_capture_base64_length`, `avg_photo_capture_estimated_decoded_bytes`, `avg_photo_capture_optimization_step`, `avg_photo_capture_target_width`, `image_upload_attempts`, `analysis_image_retry_suppressions`, `image_uploads_per_fresh_scan`, `analysis_upload_estimated_bytes`, `avg_analysis_upload_estimated_bytes`, `estimated_upload_bytes_per_fresh_scan`, `completed_scan_upload_estimated_bytes`, `fresh_completed_scan_upload_estimated_bytes`, `matched_upload_bytes_per_completed_scan`, `matched_upload_bytes_per_fresh_scan`, `photo_capture_failures`, `camera_capture_failures`, `image_optimization_failures`, `photo_capture_cancellations`, and `oversized_photo_blocks`.

- **Analysis cache health**: active/expired shared cache rows, cache payload bytes, hit coverage, and hits per active cache row.
  Source: `public.kpi_analysis_cache_health.active_cache_rows`, `expired_cache_rows`, `active_cache_payload_bytes`, `cache_rows_with_hits_rate`, and `active_hits_per_cache_row`.

- **Result-to-paywall rate**: paywall views divided by completed scans.
  Source: `public.kpi_daily_funnel.result_to_paywall_rate`.

- **Paywall request-to-view rate**: paywall views divided by `paywall_requested`, to catch broken or slow upgrade routing before judging copy or price.
  Source: `public.kpi_daily_funnel.paywall_request_to_view_rate` and `public.kpi_paywall_source_daily.paywall_request_to_view_rate`.

- **Paywall package-load rate**: successful `paywall_offerings_loaded` events with at least one RevenueCat package divided by `paywall_requested` or `paywall_viewed`, plus expected-package coverage for weekly/monthly/annual availability. This catches sellable-package loading failures and missing-plan dashboard issues before judging pitch, plan, or price.
  Source: `public.kpi_daily_funnel.paywall_request_to_package_load_rate`, `public.kpi_daily_funnel.paywall_view_to_package_load_rate`, `paywall_request_to_expected_package_load_rate`, `paywall_view_to_expected_package_load_rate`, `paywall_weekly_package_missing`, `paywall_monthly_package_missing`, `paywall_annual_package_missing`, and `public.kpi_paywall_source_daily`.

- **Placement offering return rate**: source-specific RevenueCat placement offering returns divided by placement offering requests, with current-offering fallbacks and fetch errors tracked separately. This catches targeting-rule or placement-identifier setup problems before treating a source-specific paywall test as product feedback.
  Source: `public.kpi_paywall_source_daily.placement_offering_return_rate`, `placement_current_fallback_rate`, `placement_offering_errors`, `placement_offering_requests`, `placement_offering_returns`, and `placement_current_fallbacks`.

- **Paywall dismissal rate and speed**: `paywall_dismissed` divided by `paywall_viewed`, plus average dismiss duration by source, pitch, variant, and selected plan.
  Source: `public.kpi_daily_funnel.paywall_view_dismissal_rate`, `avg_paywall_dismiss_duration_ms`, `public.kpi_paywall_source_daily`, `public.kpi_paywall_pitch_daily`, and `public.kpi_paywall_daily`.

- **Paywall pitch conversion**: purchase completions by paywall source, variant, and pitch.
  Source: `public.kpi_paywall_pitch_daily`.

- **Paywall plan conversion**: purchase completions by paywall source, variant, pitch, and selected plan.
  Source: `public.kpi_paywall_daily`.

- **Share rate**: completed shares divided by completed scans.
  Source: `public.kpi_daily_funnel.result_share_rate`.

- **Share completion mix**: started/completed/dismissed/failed shares by free vs Pro users, scan mode, data source, and whether the share carried an install link.
  Source: `public.kpi_share_daily`.

- **App review loop**: review prompt views, rating-page requests, successful store opens, and failures by source, user plan, store, and scan mode.
  Source: `public.kpi_daily_funnel.app_review_prompt_views`, `app_review_requests`, `app_review_opens`, `app_review_open_success_rate`, and `public.kpi_app_review_daily`.

- **Support contact loop**: Profile support taps, successful email opens, and failures by source, user plan, account type, and platform.
  Source: `public.kpi_daily_funnel.support_contact_taps`, `support_contact_opens`, `support_contact_open_rate`, and `public.kpi_support_daily`.

- **RevenueCat subscriber sync quality**: processed RevenueCat events, subscriber syncs, and subscriber sync errors divided by webhook events.
  Source: `public.kpi_revenuecat_daily.processed_events`, `subscriber_syncs`, `subscriber_sync_errors`, and `webhook_events`.

- **App error session rate**: sessions with `app_error_captured` divided by all tracked sessions.
  Source: `public.kpi_daily_funnel.app_error_session_rate`.

## Guardrails

- **Crash-free sessions**: App Store Connect or native crash reporting once Sentry/equivalent is added.
- **JavaScript app error sessions**: first-party `app_error_captured` events should stay low and should be reviewed by source, category, and stable error fingerprint.
  Source: `public.kpi_app_errors_daily`.
- **Release/build health**: scan success, paywall views, purchases, entitlement refreshes, and JS errors should be reviewed by `app_version`, `native_build_version`, `runtime_version`, and platform after every TestFlight or production release.
  Source: `public.kpi_app_release_daily`.
- **Unsupported claims**: App Store copy must not claim DogFoodAdvisor/CatFoodAdvisor data unless that support is live and licensed.
- **Subscription sync quality**: RevenueCat purchases, restores, cancellations, expirations, and transfers should match `profiles.is_pro`, with repeated `subscriber_sync_errors`, `purchase_pending` outside expected payment-pending tests, `purchase_no_entitlement`, `restore_no_entitlement`, `revenuecat_status_mismatch`, or purchase/restore entitlement refreshes that do not resolve to Pro treated as release risks.
- **Supabase availability and quota**: monitor egress, image upload attempts/bytes, Edge Function errors, and `402` risks through the July 15, 2026 grace-period deadline.
- **Scan quality**: invalid AI outputs and reversals should decline after Edge validation and prompt hardening; scan failures should be reviewed by `failure_category`, `error_code`, `http_status`, scan mode, and app version.
  Source: `public.kpi_scan_failures_daily`.

## Growth Experiment Readout

Use this frame for App Store Search Ads, Product Page Optimization, static paid social, and organic creative tests from `GROWTH_CREATIVE_PLAN.md`.

- **Apple Search Ads attribution readiness**: iOS builds should request RevenueCat AdServices token collection after RevenueCat initialization, with zero collection failures before paid spend.
  Source: `public.kpi_apple_search_ads_attribution_daily`, `supabase/migrations/265_apple_search_ads_attribution_reporting.sql`, and RevenueCat Apple Search Ads charts.

- **Paid acquisition readiness**: activation, scan success, paywall package load, purchase completion, entitlement sync, and app-error guardrails should hold by build before scaling spend.
  Source: `public.kpi_paid_acquisition_readiness_daily`, `public.kpi_daily_funnel`, `public.kpi_paywall_source_daily`, `public.kpi_revenuecat_daily`, and App Store Connect.

- **Primary paid-creative success metric**: cost per first completed scan.
  Source: ad-platform spend/export plus `public.kpi_daily_funnel.scan_completions`.

- **First diagnostic**: install to first scan / activation rate.
  Source: App Store Connect installs plus `public.kpi_activation_cohorts.activation_rate`.

- **Scan failure diagnostic**: identify whether activation leaks are from product-not-found, auth, payload size, rate limits, backend errors, AI validation, network, timeout, or entitlement gates.
  Source: `public.kpi_scan_failures_daily`.

- **Revenue diagnostic**: paywall request to package load, then paywall view to purchase by source, source intent, pitch, variant, plan, and Apple Search Ads campaign/ad group/keyword in RevenueCat.
  Source: `public.kpi_paywall_pitch_daily`, `public.kpi_paywall_daily`, `public.kpi_paid_acquisition_readiness_daily`, and RevenueCat.

- **Release diagnostic**: compare scan success rate, purchase completions, entitlement-refresh success, and app errors by build before scaling spend to a new version.
  Source: `public.kpi_app_release_daily`.

- **Quality guardrails**: scan success rate, scan failure rate, app error session rate, crash-free sessions, and Supabase egress per successful scan.
  Source: `public.kpi_daily_funnel`, `public.kpi_app_errors_daily`, App Store Connect, Supabase usage, and Anthropic usage.

Scale a creative direction only when activation improves or holds steady and revenue diagnostics do not weaken. Pause spend if scan failures, app error sessions, crash rate, or egress per scan rise materially. Treat install volume as weak evidence unless first completed scans improve.

## Weekly Review

Use the views from `supabase/migrations/065_kpi_reporting_views.sql` after deploying audit migrations `058` through `070`:

```sql
select *
from public.kpi_daily_funnel
order by metric_date desc
limit 14;

select *
from public.kpi_onboarding_path_daily
order by metric_date desc, onboarding_path
limit 50;

select *
from public.kpi_activation_cohorts
order by cohort_date desc
limit 14;

select *
from public.kpi_scan_usage_daily
order by metric_date desc
limit 14;

select *
from public.kpi_analysis_cache_health;

select *
from public.kpi_paywall_pitch_daily
order by metric_date desc, source, source_intent, pitch_key
limit 50;

select *
from public.kpi_paywall_daily
order by metric_date desc, source, source_intent, pitch_key, plan
limit 50;

select *
from public.kpi_revenuecat_daily
order by metric_date desc
limit 14;

select *
from public.kpi_app_errors_daily
order by metric_date desc, sessions_impacted desc
limit 50;

select *
from public.kpi_retention_daily
order by metric_date desc, source_surface, user_plan
limit 50;

select *
from public.kpi_app_review_daily
order by metric_date desc, source, user_plan, store, scan_mode
limit 50;

select *
from public.kpi_support_daily
order by metric_date desc, source, user_plan, account_type, platform
limit 50;
```

Weekly decision questions:

- Did activation improve after anonymous-first scanning?
- Does the `scan_now` path beat the `completed_flow` education path on onboarding completion, scan start, completed result, paywall view, and purchase completion?
- Are first-run losses coming from onboarding path choice, unexpected auth-screen exposure, automatic guest session failures, manual guest fallback, Apple/Google sign-in, camera permission, or scan completion?
- Are users failing before scan completion, paywall request, paywall view, or purchase completion?
- Which paywall source and plan selection create real paid conversion, not only trials?
- Are free-scan reversals and scan failures low enough to keep trust high?
- Are app error sessions or fatal JavaScript errors concentrated in one source, `error_category`, `error_fingerprint`, or release path?
- Are image upload attempts, average estimated upload bytes, and Supabase egress per successful scan declining enough to support paid acquisition?
- Is the shared analysis cache earning its keep through active hits, or are payload bytes/expired rows growing without reuse?
- Do shares produce enough organic loop signal to justify improving result cards?
- Do recent-scan compares suggest users are turning history into a repeat shopping workflow?
- Are support contacts or support open failures clustering around purchase, restore, account-saving, or release changes?
- Which creative hook or App Store product-page route produces the lowest cost per first completed scan without weakening paywall conversion or quality guardrails?

## Evidence Base

- App Store Connect snapshot in `AUDIT.md`: 239 first-time downloads, 6.79% daily average conversion rate, 1.44% day-7 download-to-paid, 1.92% day-35 download-to-paid, 2 crashes on version 1.2.
- RevenueCat snapshot in `AUDIT.md`: 118 new customers, 3 active subscriptions, 1 active trial, `$21` MRR, `$18` last-28-day revenue.
- Supabase snapshot in `AUDIT.md`: egress `7.519 / 5 GB (150%)`, grace period ending July 15, 2026.
- Instrumentation added in this audit: `analytics_events`, app error telemetry, scan usage/reversal, RevenueCat webhook events, and funnel tracking across onboarding, auth, scanner, results, paywall, purchase, restore, profile, history, and sharing.
- Growth planning added in this audit: `GROWTH_CREATIVE_PLAN.md` plus Ads Explorer prompt artifacts under `outputs/imagegen/woof-digital-product-ads/`.
