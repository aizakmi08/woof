# Woof Weekly Review Runbook

Last updated: 2026-06-17.

Purpose: run the same operating review every week after the audit build is deployed. Use this to decide whether Woof is ready for more traffic, which funnel leak to fix next, and whether revenue growth is healthy enough to scale.

## Inputs To Refresh

- App Store Connect: installs, product page views, conversion rate, crashes, crash-free sessions when available, proceeds, trials, paid subscriptions.
- RevenueCat: MRR, revenue, active subscriptions, active trials, churn/cancellations, products/offering status, webhook delivery.
- Supabase: egress, Edge Function errors, database errors, `analytics_events`, `scan_usage_events`, `revenuecat_events`, and the KPI views below.
- Anthropic or AI provider billing: weekly spend and request errors, if available.
- App release state: app version, native build number, runtime version, TestFlight or production cohort.

## Weekly Scorecard

Paste this first. It should be enough to spot the biggest issue before drilling down.

```sql
select
  metric_date,
  sessions,
  users,
  analytics_queue_flushes,
  analytics_queue_drops,
  analytics_queued_events_flushed,
  analytics_queued_events_dropped,
  onboarding_scan_now_taps,
  onboarding_scan_now_rate,
  onboarding_completion_rate,
  auth_screen_views,
  auth_screen_view_rate,
  automatic_guest_session_success_rate,
  manual_guest_continue_success_rate,
  scan_cta_taps,
  free_scan_status_taps,
  scanner_help_opens,
  empty_state_scan_cta_taps,
  empty_state_scan_cta_share,
  camera_permission_requests,
  camera_permission_grants,
  camera_permission_denials,
  photo_capture_failures,
  camera_capture_failures,
  image_optimization_failures,
  scan_starts,
  scan_completions,
  cached_scan_completions,
  fresh_scan_completions,
  scan_success_rate,
  scan_cache_completion_rate,
  scan_failure_rate,
  paywall_requests,
  scan_limit_paywall_requests,
  paywall_request_to_view_rate,
  paywall_package_loads,
  paywall_package_load_failures,
  paywall_expected_package_loads,
  paywall_expected_package_load_failures,
  paywall_weekly_package_missing,
  paywall_monthly_package_missing,
  paywall_annual_package_missing,
  placement_offering_requests,
  placement_offering_returns,
  placement_current_fallbacks,
  placement_offering_errors,
  placement_offering_return_rate,
  placement_current_fallback_rate,
  paywall_request_to_package_load_rate,
  paywall_view_to_package_load_rate,
  paywall_request_to_expected_package_load_rate,
  paywall_view_to_expected_package_load_rate,
  paywall_dismissals,
  paywall_view_dismissal_rate,
  avg_paywall_dismiss_duration_ms,
  result_to_paywall_rate,
  paywall_purchase_completion_rate,
  purchase_entitlement_refresh_pro_rate,
  restore_entitlement_refresh_pro_rate,
  guest_save_prompt_views,
  guest_save_prompt_completions,
  guest_save_prompt_completion_rate,
  guest_save_prompt_dismissals,
  guest_save_prompt_dismissal_rate,
  history_item_opens,
  history_search_starts,
  history_search_submissions,
  history_filter_changes,
  history_tool_result_opens,
  history_tool_result_open_rate,
  history_compare_opens,
  history_compare_result_opens,
  history_compare_result_open_rate,
  result_share_rate,
  share_starts,
  share_starts_with_link,
  share_completions_with_link,
  share_dismissals,
  share_dismissal_rate,
  app_review_prompt_views,
  app_review_requests,
  app_review_opens,
  app_review_open_success_rate,
  support_contact_taps,
  support_contact_opens,
  support_contact_open_rate,
  app_error_session_rate,
  analysis_upload_estimated_bytes,
  avg_analysis_upload_estimated_bytes,
  analysis_image_retry_suppressions,
  photo_capture_completions,
  avg_photo_capture_base64_length,
  avg_photo_capture_estimated_decoded_bytes,
  avg_photo_capture_optimization_step,
  avg_photo_capture_target_width,
  image_uploads_per_fresh_scan,
  estimated_upload_bytes_per_fresh_scan,
  scan_completions_with_upload,
  completed_scan_upload_estimated_bytes,
  fresh_completed_scan_upload_estimated_bytes,
  matched_upload_bytes_per_completed_scan,
  matched_upload_bytes_per_fresh_scan
from public.kpi_daily_funnel
order by metric_date desc
limit 14;
```

## Drilldowns

Activation cohorts:

```sql
select
  cohort_date,
  users,
  users_completed_onboarding,
  users_authenticated,
  users_started_scan,
  users_completed_scan,
  users_compared_history,
  users_saw_paywall,
  users_purchased,
  users_shared,
  activation_rate,
  activated_to_history_compare_rate,
  activated_to_paywall_rate,
  paywall_to_purchase_user_rate,
  activated_to_share_rate
from public.kpi_activation_cohorts
order by cohort_date desc
limit 21;
```

Onboarding path split:

```sql
select
  metric_date,
  onboarding_path,
  onboarding_sessions,
  onboarding_users,
  education_path_starts,
  scan_now_taps,
  onboarding_completions,
  auth_screen_views,
  auth_completions,
  scan_starts,
  scan_completions,
  scan_failures,
  paywall_views,
  purchase_completions,
  onboarding_completion_rate,
  auth_completion_rate,
  onboarding_to_scan_start_rate,
  onboarding_to_scan_completion_rate,
  scan_start_completion_rate,
  completed_scan_to_paywall_rate,
  paywall_to_purchase_rate
from public.kpi_onboarding_path_daily
order by metric_date desc, onboarding_path
limit 50;
```

First-run auth and capture friction:

```sql
select
  metric_date,
  onboarding_starts,
  onboarding_scan_now_taps,
  onboarding_scan_now_rate,
  onboarding_completions,
  automatic_guest_session_starts,
  automatic_guest_session_completions,
  automatic_guest_session_failures,
  auth_screen_views,
  auth_screen_view_rate,
  manual_guest_continue_starts,
  manual_guest_continue_completions,
  manual_guest_continue_failures,
  provider_sign_in_starts,
  provider_sign_in_completions,
  provider_sign_in_failures,
  scan_cta_taps,
  empty_state_scan_cta_taps,
  empty_state_pet_food_scan_cta_taps,
  empty_state_human_food_scan_cta_taps,
  empty_state_scan_cta_share,
  scanner_help_opens,
  guest_save_prompt_views,
  guest_save_prompt_provider_taps,
  guest_save_prompt_completions,
  guest_save_prompt_cancellations,
  guest_save_prompt_dismissals,
  guest_save_prompt_failures,
  guest_save_prompt_completion_rate,
  guest_save_prompt_dismissal_rate,
  history_item_opens,
  history_search_starts,
  history_search_submissions,
  history_search_clears,
  history_filter_changes,
  history_filters_cleared,
  history_list_expands,
  history_list_collapses,
  history_tool_result_opens,
  history_tool_result_open_rate,
  history_compare_opens,
  history_compare_result_opens,
  history_compare_result_open_rate,
  camera_permission_requests,
  camera_permission_grants,
  camera_permission_denials,
  photo_capture_completions,
  avg_photo_capture_base64_length,
  avg_photo_capture_estimated_decoded_bytes,
  avg_photo_capture_optimization_step,
  avg_photo_capture_target_width,
  photo_capture_failures,
  camera_capture_failures,
  image_optimization_failures,
  photo_capture_cancellations,
  oversized_photo_blocks,
  analysis_image_retry_suppressions,
  scan_completions_with_upload,
  completed_scan_upload_attempts,
  completed_image_upload_attempts,
  completed_scan_upload_estimated_bytes,
  avg_completed_scan_upload_estimated_bytes,
  fresh_scan_completions_with_upload,
  fresh_completed_scan_upload_attempts,
  fresh_completed_image_upload_attempts,
  fresh_completed_scan_upload_estimated_bytes,
  avg_fresh_completed_scan_upload_estimated_bytes,
  matched_image_uploads_per_completed_scan,
  matched_upload_bytes_per_completed_scan,
  matched_image_uploads_per_fresh_scan,
  matched_upload_bytes_per_fresh_scan
from public.kpi_daily_funnel
order by metric_date desc
limit 14;
```

Scan failure diagnostics:

```sql
select *
from public.kpi_scan_failures_daily
order by metric_date desc, failure_events desc, sessions_impacted desc
limit 50;
```

Scan gate and reversal health:

```sql
select *
from public.kpi_scan_usage_daily
order by metric_date desc
limit 21;
```

Analysis cache health:

```sql
select
  snapshot_at,
  total_cache_rows,
  active_cache_rows,
  expired_cache_rows,
  cache_rows_with_hits,
  total_cache_hits,
  active_cache_payload_bytes,
  avg_active_cache_payload_bytes,
  max_active_cache_payload_bytes,
  cache_rows_with_hits_rate,
  active_hits_per_cache_row
from public.kpi_analysis_cache_health;
```

Paywall source, pitch, and plan:

```sql
select *
from public.kpi_paywall_source_daily
order by metric_date desc, source, source_intent
limit 50;

select *
from public.kpi_paywall_pitch_daily
order by metric_date desc, source, source_intent, paywall_variant, pitch_key
limit 50;

select *
from public.kpi_paywall_daily
order by metric_date desc, source, source_intent, paywall_variant, pitch_key, plan
limit 75;
```

RevenueCat sync and subscriber health:

```sql
select *
from public.kpi_revenuecat_daily
order by metric_date desc
limit 21;
```

Apple Search Ads attribution and paid acquisition readiness:

```sql
select *
from public.kpi_apple_search_ads_attribution_daily
order by metric_date desc, platform, app_version, native_build_version, runtime_version
limit 21;

select *
from public.kpi_paid_acquisition_readiness_daily
order by metric_date desc, platform, app_version, native_build_version, runtime_version
limit 50;
```

Review `collection_requests`, `collection_failures`, `collection_failure_rate`, `apple_search_ads_collection_requests`, `apple_search_ads_collection_failures`, `scan_success_rate`, `paywall_view_to_expected_package_load_rate`, `purchase_start_completion_rate`, and `app_error_session_rate` before buying or scaling traffic.

Release/build health:

```sql
select *
from public.kpi_app_release_daily
order by metric_date desc, platform, app_version, native_build_version, runtime_version
limit 75;
```

App error groups:

```sql
select
  metric_date,
  source,
  error_category,
  error_name,
  error_fingerprint,
  fatal,
  error_events,
  error_groups,
  users_impacted,
  sessions_impacted
from public.kpi_app_errors_daily
order by metric_date desc, fatal desc, sessions_impacted desc, error_events desc, error_category, error_fingerprint
limit 75;
```

Organic share loop:

```sql
select *
from public.kpi_share_daily
order by metric_date desc, share_url_attached desc, user_plan, scan_mode, data_source
limit 75;
```

History search, filter, and comparison loop:

```sql
select *
from public.kpi_retention_daily
order by metric_date desc, source_surface, user_plan
limit 75;
```

App review loop:

```sql
select *
from public.kpi_app_review_daily
order by metric_date desc, source, user_plan, store, scan_mode
limit 75;
```

Support contact loop:

```sql
select *
from public.kpi_support_daily
order by metric_date desc, source, user_plan, account_type, platform
limit 75;
```

## Decision Rules

Use these as provisional rules until Woof has enough volume for stronger thresholds.

- **Do not scale paid acquisition** if Supabase egress is over quota, crash count rises, `app_error_session_rate` spikes, scan success weakens materially, or the current iOS build has Apple Search Ads attribution collection failures.
- **Fix activation first** if `activation_rate` is below 60% after anonymous-first scanning ships, if first completed scans do not grow with installs, or if `scan_now` underperforms `completed_flow` on `onboarding_to_scan_completion_rate` without a matching purchase-quality gain.
- **Fix auth/config first** if automatic guest session success is not near 100% in TestFlight or production, if `auth_screen_view_rate` rises unexpectedly in an anonymous-first build, or if `scan_now_incomplete` / `education_incomplete` rows concentrate around auth-screen exposure.
- **Investigate analytics transport** if `analytics_queue_flushes`, `analytics_queued_events_flushed`, or `analytics_queued_events_dropped` spikes unexpectedly; flushes can indicate offline starts, failed inserts, or auth startup timing, while drops usually indicate user-switch protection or legacy queued events that were not safe to attribute.
- **Fix camera/capture first** if camera denials, scanner help opens, capture failures, image optimization failures, capture cancellations, oversized-photo blocks, or upload bytes explain the first-scan leak.
- **Fix scan cost/cache first** if `scan_cache_completion_rate` stays low while `avg_photo_capture_base64_length`, `avg_photo_capture_estimated_decoded_bytes`, `image_uploads_per_fresh_scan`, `analysis_image_retry_suppressions`, `estimated_upload_bytes_per_fresh_scan`, `matched_upload_bytes_per_completed_scan`, `matched_upload_bytes_per_fresh_scan`, or Supabase egress rises; this means growth is still leaning on fresh or heavier image uploads instead of reusable results.
- **Tune cache retention first** if `expired_cache_rows` remains nonzero after the cleanup cron runs, `active_cache_payload_bytes` grows faster than scan completions, or `active_hits_per_cache_row` stays weak; this means the shared cache is carrying storage/egress weight without enough reuse.
- **Fix scan reliability first** if `scan_success_rate` falls below 80%, `scan_failure_rate` rises above 10%, or one `failure_category` dominates the week.
- **Fix entitlement sync before experiments** if `purchase_no_entitlement`, `restore_no_entitlement`, repeated `revenuecat_status_mismatch`, or RevenueCat subscriber sync errors appear in normal purchase/restore flows.
- **Fix Apple Search Ads attribution before spend** if `apple_search_ads_attribution_collection_failed` appears, if `public.kpi_apple_search_ads_attribution_daily.collection_requests` is zero for current iOS TestFlight/prod builds, or if RevenueCat Apple Search Ads charts do not show expected Organic/Search Ads segmentation after test traffic.
- **Fix paywall routing first** if `paywall_request_to_view_rate` is weak; this means users requested an upgrade path but did not reach the paywall screen.
- **Fix RevenueCat/package loading first** if `paywall_request_to_package_load_rate`, `paywall_view_to_package_load_rate`, `paywall_request_to_expected_package_load_rate`, or `paywall_view_to_expected_package_load_rate` is weak; if `paywall_package_load_failures` appears in normal purchase tests; or if `paywall_weekly_package_missing`, `paywall_monthly_package_missing`, or `paywall_annual_package_missing` is nonzero. This means users reached an upgrade path but did not get the expected sellable plans.
- **Fix RevenueCat placement setup first** if `placement_offering_errors` appears, `placement_offering_return_rate` is weak for configured placements, or `placement_current_fallback_rate` stays high after placement rules are live. This means the app requested a source-specific offering but RevenueCat served the current-offering fallback or errored before the experiment could be measured.
- **Fix paywall relevance first** if `paywall_view_dismissal_rate` is high or `avg_paywall_dismiss_duration_ms` is very short for a source/pitch; this means users reached a sellable paywall but rejected the moment, copy, plan default, or price framing before starting purchase.
- **Iterate paywall pitch** if `paywall_view_purchase_rate` is weak but scan success and entitlement health are stable.
- **Iterate share cards** if `share_completions_with_link` grows but App Store product page views or organic installs do not move.
- **Iterate retention/history** if `history_compare_opens` is weak after users have multiple scans, or if `history_compare_result_open_rate` is weak; this means the comparison prompt is not yet helping shoppers revisit saved results.
- **Throttle or remove review asks** if `app_review_prompt_views` grows but `app_review_open_success_rate` is weak, App Store ratings do not improve, or prompt dismissals dominate requests.
- **Fix support routing or purchase/account UX** if `support_contact_failures` appears, `support_contact_open_rate` is weak, or support taps spike after purchase, restore, account-saving, or release changes.

## Weekly Narrative Template

```text
Week of:
Release/build reviewed:

Topline:
- Installs/product-page conversion:
- First completed scans:
- Paywall requests, views, and purchases:
- Active subscriptions/MRR:
- Supabase egress and AI spend:

What improved:
- 

What got worse:
- 

Biggest blocker:
- 

Decision:
- Scale / hold / fix before acquisition:

Next actions:
- Product:
- Revenue:
- Reliability:
- Growth:
```

## Evidence Standards

- Treat App Store Connect and RevenueCat as source of truth for store/revenue outcomes.
- Treat Supabase KPI views as source of truth for app funnel diagnostics after migrations and Edge Functions are deployed.
- Segment every release review by `app_version`, `native_build_version`, `runtime_version`, and platform before concluding a change improved or hurt the funnel.
- Do not interpret purchase conversion until purchase, restore, webhook, and immediate `revenuecat-sync` paths are validated in sandbox.
- Do not interpret acquisition tests by installs alone. Use cost per first completed scan, scan success, paywall conversion, app errors, crashes, and egress per successful scan.
