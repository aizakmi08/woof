-- Reporting views for weekly growth, activation, monetization, and cost reviews.
-- These views are intentionally not exposed to app clients.

CREATE OR REPLACE VIEW public.kpi_event_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', created_at)::date AS metric_date,
  name AS event_name,
  COUNT(*)::integer AS event_count,
  COUNT(DISTINCT user_id)::integer AS unique_users,
  COUNT(DISTINCT session_id)::integer AS unique_sessions
FROM public.analytics_events
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.kpi_daily_funnel
WITH (security_invoker = true)
AS
WITH events AS (
  SELECT
    *,
    date_trunc('day', created_at)::date AS metric_date,
    NULLIF(properties->>'scan_id', '') AS scan_id
  FROM public.analytics_events
),
daily AS (
  SELECT
    metric_date,
    COUNT(DISTINCT session_id)::integer AS sessions,
    COUNT(DISTINCT user_id)::integer AS users,
    COUNT(*) FILTER (WHERE name = 'onboarding_started')::integer AS onboarding_starts,
    COUNT(*) FILTER (WHERE name = 'onboarding_scan_now_tapped')::integer AS onboarding_scan_now_taps,
    COUNT(*) FILTER (WHERE name = 'onboarding_completed')::integer AS onboarding_completions,
    COUNT(*) FILTER (WHERE name = 'auth_viewed')::integer AS auth_screen_views,
    COUNT(*) FILTER (WHERE name = 'analytics_queue_flushed')::integer AS analytics_queue_flushes,
    COUNT(*) FILTER (WHERE name = 'analytics_queue_dropped')::integer AS analytics_queue_drops,
    COALESCE(SUM(
      CASE
        WHEN name = 'analytics_queue_flushed'
          AND properties->>'queued_event_count' ~ '^[0-9]+$'
        THEN (properties->>'queued_event_count')::integer
        ELSE 0
      END
    ), 0)::integer AS analytics_queued_events_flushed,
    COALESCE(SUM(
      CASE
        WHEN name = 'analytics_queue_dropped'
          AND properties->>'dropped_event_count' ~ '^[0-9]+$'
        THEN (properties->>'dropped_event_count')::integer
        ELSE 0
      END
    ), 0)::integer AS analytics_queued_events_dropped,
    COUNT(*) FILTER (WHERE name = 'anonymous_sign_in_started')::integer AS anonymous_sign_in_starts,
    COUNT(*) FILTER (WHERE name = 'anonymous_sign_in_started' AND properties->>'automatic' = 'true')::integer AS automatic_guest_session_starts,
    COUNT(*) FILTER (WHERE name = 'anonymous_sign_in_started' AND properties->>'automatic' = 'false')::integer AS manual_guest_session_starts,
    COUNT(*) FILTER (WHERE name = 'anonymous_signed_in')::integer AS anonymous_sign_in_completions,
    COUNT(*) FILTER (WHERE name = 'anonymous_signed_in' AND properties->>'automatic' = 'true')::integer AS automatic_guest_session_completions,
    COUNT(*) FILTER (WHERE name = 'anonymous_signed_in' AND properties->>'automatic' = 'false')::integer AS manual_guest_session_completions,
    COUNT(*) FILTER (WHERE name = 'anonymous_sign_in_failed')::integer AS anonymous_sign_in_failures,
    COUNT(*) FILTER (WHERE name = 'anonymous_sign_in_failed' AND properties->>'automatic' = 'true')::integer AS automatic_guest_session_failures,
    COUNT(*) FILTER (WHERE name = 'anonymous_sign_in_failed' AND properties->>'automatic' = 'false')::integer AS manual_guest_session_failures,
    COUNT(*) FILTER (WHERE name = 'guest_continue_started')::integer AS manual_guest_continue_starts,
    COUNT(*) FILTER (WHERE name = 'guest_continue_completed')::integer AS manual_guest_continue_completions,
    COUNT(*) FILTER (WHERE name = 'guest_continue_failed')::integer AS manual_guest_continue_failures,
    COUNT(*) FILTER (WHERE name = 'auth_sign_in_started')::integer AS provider_sign_in_starts,
    COUNT(*) FILTER (WHERE name = 'auth_sign_in_completed_client')::integer AS provider_sign_in_completions,
    COUNT(*) FILTER (WHERE name = 'auth_sign_in_failed')::integer AS provider_sign_in_failures,
    COUNT(*) FILTER (WHERE name = 'auth_sign_in_cancelled')::integer AS provider_sign_in_cancellations,
    COUNT(*) FILTER (WHERE name = 'auth_signed_in')::integer AS auth_completions,
    COUNT(*) FILTER (WHERE name = 'scan_cta_tapped')::integer AS scan_cta_taps,
    COUNT(*) FILTER (WHERE name = 'free_scan_status_tapped')::integer AS free_scan_status_taps,
    COUNT(*) FILTER (WHERE name = 'scanner_help_opened')::integer AS scanner_help_opens,
    COUNT(*) FILTER (WHERE name = 'scan_cta_tapped' AND properties->>'source_surface' = 'home_empty_state')::integer AS empty_state_scan_cta_taps,
    COUNT(*) FILTER (
      WHERE name = 'scan_cta_tapped'
        AND properties->>'source_surface' = 'home_empty_state'
        AND properties->>'scan_mode' = 'pet_food'
    )::integer AS empty_state_pet_food_scan_cta_taps,
    COUNT(*) FILTER (
      WHERE name = 'scan_cta_tapped'
        AND properties->>'source_surface' = 'home_empty_state'
        AND properties->>'scan_mode' = 'human_food'
    )::integer AS empty_state_human_food_scan_cta_taps,
    COUNT(*) FILTER (WHERE name = 'scan_analysis_started')::integer AS scan_starts,
    COUNT(*) FILTER (WHERE name = 'scan_analysis_completed')::integer AS scan_completions,
    COUNT(*) FILTER (WHERE name = 'scan_analysis_completed' AND properties->>'from_cache' = 'true')::integer AS cached_scan_completions,
    COUNT(*) FILTER (
      WHERE name = 'scan_analysis_completed'
        AND COALESCE(properties->>'from_cache', 'false') <> 'true'
    )::integer AS fresh_scan_completions,
    COUNT(*) FILTER (WHERE name IN ('scan_analysis_failed', 'scan_analysis_timeout', 'barcode_not_found'))::integer AS scan_failures,
    COUNT(*) FILTER (WHERE name = 'paywall_requested')::integer AS paywall_requests,
    COUNT(*) FILTER (WHERE name = 'paywall_requested' AND properties->>'source' = 'scan_limit')::integer AS scan_limit_paywall_requests,
    COUNT(*) FILTER (WHERE name = 'paywall_viewed')::integer AS paywall_views,
    COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded')::integer AS paywall_offering_load_attempts,
    COUNT(*) FILTER (
      WHERE name = 'paywall_offerings_loaded'
        AND properties->>'success' = 'true'
        AND CASE
          WHEN properties->>'package_count' ~ '^[0-9]+$'
          THEN (properties->>'package_count')::integer > 0
          ELSE false
        END
    )::integer AS paywall_package_loads,
    COUNT(*) FILTER (
      WHERE name = 'paywall_offerings_loaded'
        AND (
          properties->>'success' <> 'true'
          OR CASE
            WHEN properties->>'package_count' ~ '^[0-9]+$'
            THEN (properties->>'package_count')::integer <= 0
            ELSE true
          END
        )
    )::integer AS paywall_package_load_failures,
    COUNT(*) FILTER (
      WHERE name = 'paywall_offerings_loaded'
        AND COALESCE(
          properties->>'success' = 'true'
          AND CASE
            WHEN properties->>'missing_plan_count' ~ '^[0-9]+$'
            THEN (properties->>'missing_plan_count')::integer = 0
            WHEN properties->>'package_count' ~ '^[0-9]+$'
            THEN (properties->>'package_count')::integer >= 3
            ELSE false
          END,
          false
        )
    )::integer AS paywall_expected_package_loads,
    COUNT(*) FILTER (
      WHERE name = 'paywall_offerings_loaded'
        AND NOT COALESCE(
          properties->>'success' = 'true'
          AND CASE
            WHEN properties->>'missing_plan_count' ~ '^[0-9]+$'
            THEN (properties->>'missing_plan_count')::integer = 0
            WHEN properties->>'package_count' ~ '^[0-9]+$'
            THEN (properties->>'package_count')::integer >= 3
            ELSE false
          END,
          false
        )
    )::integer AS paywall_expected_package_load_failures,
    COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'weekly_package_available' = 'false')::integer AS paywall_weekly_package_missing,
    COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'monthly_package_available' = 'false')::integer AS paywall_monthly_package_missing,
    COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'annual_package_available' = 'false')::integer AS paywall_annual_package_missing,
    COUNT(*) FILTER (WHERE name = 'paywall_plan_selected')::integer AS plan_selections,
    COUNT(*) FILTER (WHERE name = 'paywall_dismissed')::integer AS paywall_dismissals,
    COALESCE(ROUND(AVG(
      CASE
        WHEN name = 'paywall_dismissed'
          AND properties->>'duration_ms' ~ '^[0-9]+$'
        THEN (properties->>'duration_ms')::numeric
        ELSE NULL
      END
    )), 0)::bigint AS avg_paywall_dismiss_duration_ms,
    COUNT(*) FILTER (WHERE name = 'purchase_started')::integer AS purchase_starts,
    COUNT(*) FILTER (WHERE name = 'purchase_completed')::integer AS purchase_completions,
    COUNT(*) FILTER (WHERE name = 'purchase_cancelled')::integer AS purchase_cancellations,
    COUNT(*) FILTER (WHERE name = 'purchase_pending')::integer AS purchase_pending,
    COUNT(*) FILTER (WHERE name = 'purchase_failed')::integer AS purchase_failures,
    COUNT(*) FILTER (WHERE name = 'purchase_no_entitlement')::integer AS purchase_no_entitlement,
    COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed')::integer AS purchase_entitlement_refreshes,
    COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed' AND properties->>'is_pro' = 'true')::integer AS purchase_entitlement_refresh_pro,
    COUNT(*) FILTER (WHERE name = 'restore_completed')::integer AS restore_completions,
    COUNT(*) FILTER (WHERE name = 'restore_failed')::integer AS restore_failures,
    COUNT(*) FILTER (WHERE name = 'restore_no_purchases')::integer AS restore_no_purchases,
    COUNT(*) FILTER (WHERE name = 'restore_no_entitlement')::integer AS restore_no_entitlement,
    COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed')::integer AS restore_entitlement_refreshes,
    COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed' AND properties->>'is_pro' = 'true')::integer AS restore_entitlement_refresh_pro,
    COUNT(*) FILTER (WHERE name = 'revenuecat_status_mismatch')::integer AS revenuecat_status_mismatches,
    COUNT(*) FILTER (WHERE name = 'guest_save_prompt_viewed')::integer AS guest_save_prompt_views,
    COUNT(*) FILTER (WHERE name = 'guest_save_prompt_provider_tapped')::integer AS guest_save_prompt_provider_taps,
    COUNT(*) FILTER (WHERE name = 'guest_save_prompt_completed')::integer AS guest_save_prompt_completions,
    COUNT(*) FILTER (WHERE name = 'guest_save_prompt_cancelled')::integer AS guest_save_prompt_cancellations,
    COUNT(*) FILTER (WHERE name = 'guest_save_prompt_dismissed')::integer AS guest_save_prompt_dismissals,
    COUNT(*) FILTER (WHERE name = 'guest_save_prompt_failed')::integer AS guest_save_prompt_failures,
    COUNT(*) FILTER (WHERE name = 'history_item_opened')::integer AS history_item_opens,
    COUNT(*) FILTER (WHERE name = 'history_compare_opened')::integer AS history_compare_opens,
    COUNT(*) FILTER (WHERE name = 'history_compare_closed')::integer AS history_compare_closes,
    COUNT(*) FILTER (WHERE name = 'history_compare_result_opened')::integer AS history_compare_result_opens,
    COUNT(*) FILTER (WHERE name = 'history_search_started')::integer AS history_search_starts,
    COUNT(*) FILTER (WHERE name = 'history_search_submitted')::integer AS history_search_submissions,
    COUNT(*) FILTER (WHERE name = 'history_search_cleared')::integer AS history_search_clears,
    COUNT(*) FILTER (WHERE name = 'history_filter_changed')::integer AS history_filter_changes,
    COUNT(*) FILTER (WHERE name = 'history_filters_cleared')::integer AS history_filters_cleared,
    COUNT(*) FILTER (WHERE name = 'history_list_expanded')::integer AS history_list_expands,
    COUNT(*) FILTER (WHERE name = 'history_list_collapsed')::integer AS history_list_collapses,
    COUNT(*) FILTER (
      WHERE name = 'history_item_opened'
        AND properties->>'source_surface' IN ('home_history_search', 'home_history_filter')
    )::integer AS history_tool_result_opens,
    COUNT(*) FILTER (WHERE name = 'share_started')::integer AS share_starts,
    COUNT(*) FILTER (WHERE name = 'share_started' AND properties->>'share_url_attached' = 'true')::integer AS share_starts_with_link,
    COUNT(*) FILTER (WHERE name = 'share_completed')::integer AS share_completions,
    COUNT(*) FILTER (WHERE name = 'share_completed' AND properties->>'share_url_attached' = 'true')::integer AS share_completions_with_link,
    COUNT(*) FILTER (WHERE name = 'share_dismissed')::integer AS share_dismissals,
    COUNT(*) FILTER (WHERE name = 'app_review_prompt_viewed')::integer AS app_review_prompt_views,
    COUNT(*) FILTER (WHERE name = 'app_review_requested')::integer AS app_review_requests,
    COUNT(*) FILTER (WHERE name = 'app_review_opened')::integer AS app_review_opens,
    COUNT(*) FILTER (WHERE name = 'app_review_open_failed')::integer AS app_review_open_failures,
    COUNT(*) FILTER (WHERE name = 'app_review_prompt_dismissed')::integer AS app_review_prompt_dismissals,
    COUNT(*) FILTER (WHERE name = 'support_contact_tapped')::integer AS support_contact_taps,
    COUNT(*) FILTER (WHERE name = 'support_contact_opened')::integer AS support_contact_opens,
    COUNT(*) FILTER (WHERE name = 'support_contact_failed')::integer AS support_contact_failures,
    COUNT(*) FILTER (WHERE name = 'app_error_captured')::integer AS app_errors,
    COUNT(*) FILTER (WHERE name = 'app_error_captured' AND properties->>'fatal' = 'true')::integer AS fatal_app_errors,
    COUNT(DISTINCT session_id) FILTER (WHERE name = 'app_error_captured')::integer AS app_error_sessions,
    COUNT(*) FILTER (WHERE name = 'analysis_upload_started')::integer AS analysis_upload_attempts,
    COUNT(*) FILTER (WHERE name = 'analysis_upload_started' AND properties->>'has_image' = 'true')::integer AS image_upload_attempts,
    COUNT(*) FILTER (WHERE name = 'analysis_image_retry_suppressed')::integer AS analysis_image_retry_suppressions,
    COALESCE(SUM(
      CASE
        WHEN name = 'analysis_upload_started'
          AND properties->>'estimated_request_bytes' ~ '^[0-9]+$'
        THEN (properties->>'estimated_request_bytes')::bigint
        ELSE 0
      END
    ), 0)::bigint AS analysis_upload_estimated_bytes,
    COALESCE(ROUND(AVG(
      CASE
        WHEN name = 'analysis_upload_started'
          AND properties->>'estimated_request_bytes' ~ '^[0-9]+$'
        THEN (properties->>'estimated_request_bytes')::numeric
        ELSE NULL
      END
    )), 0)::bigint AS avg_analysis_upload_estimated_bytes,
    COUNT(*) FILTER (WHERE name = 'photo_capture_completed')::integer AS photo_capture_completions,
    COALESCE(ROUND(AVG(
      CASE
        WHEN name = 'photo_capture_completed'
          AND properties->>'base64_length' ~ '^[0-9]+$'
        THEN (properties->>'base64_length')::numeric
        ELSE NULL
      END
    )), 0)::bigint AS avg_photo_capture_base64_length,
    COALESCE(ROUND(AVG(
      CASE
        WHEN name = 'photo_capture_completed'
          AND properties->>'estimated_decoded_bytes' ~ '^[0-9]+$'
        THEN (properties->>'estimated_decoded_bytes')::numeric
        ELSE NULL
      END
    )), 0)::bigint AS avg_photo_capture_estimated_decoded_bytes,
    COALESCE(ROUND(AVG(
      CASE
        WHEN name = 'photo_capture_completed'
          AND properties->>'optimization_step' ~ '^[0-9]+$'
        THEN (properties->>'optimization_step')::numeric
        ELSE NULL
      END
    ), 4), 0)::numeric AS avg_photo_capture_optimization_step,
    COALESCE(ROUND(AVG(
      CASE
        WHEN name = 'photo_capture_completed'
          AND properties->>'target_width' ~ '^[0-9]+$'
        THEN (properties->>'target_width')::numeric
        ELSE NULL
      END
    )), 0)::bigint AS avg_photo_capture_target_width,
    COUNT(*) FILTER (WHERE name = 'camera_permission_requested')::integer AS camera_permission_requests,
    COUNT(*) FILTER (WHERE name = 'camera_permission_result' AND properties->>'granted' = 'true')::integer AS camera_permission_grants,
    COUNT(*) FILTER (WHERE name = 'camera_permission_result' AND properties->>'granted' = 'false')::integer AS camera_permission_denials,
    COUNT(*) FILTER (WHERE name = 'photo_capture_failed')::integer AS photo_capture_failures,
    COUNT(*) FILTER (
      WHERE name = 'photo_capture_failed'
        AND properties->>'capture_stage' IN ('camera_capture', 'missing_photo_uri')
    )::integer AS camera_capture_failures,
    COUNT(*) FILTER (
      WHERE name = 'photo_capture_failed'
        AND properties->>'capture_stage' IN ('image_optimization', 'optimization_missing_base64')
    )::integer AS image_optimization_failures,
    COUNT(*) FILTER (WHERE name = 'photo_capture_cancelled')::integer AS photo_capture_cancellations,
    COUNT(*) FILTER (WHERE name = 'photo_capture_too_large')::integer AS oversized_photo_blocks
  FROM events
  GROUP BY 1
),
completed_scans AS (
  SELECT DISTINCT ON (user_id, scan_id)
    metric_date,
    user_id,
    scan_id,
    CASE WHEN properties->>'from_cache' = 'true' THEN true ELSE false END AS from_cache
  FROM events
  WHERE name = 'scan_analysis_completed'
    AND user_id IS NOT NULL
    AND scan_id IS NOT NULL
  ORDER BY user_id, scan_id, created_at
),
completed_scan_uploads AS (
  SELECT
    c.metric_date,
    COUNT(DISTINCT c.user_id::text || ':' || c.scan_id) FILTER (
      WHERE u.name = 'analysis_upload_started'
    )::integer AS scan_completions_with_upload,
    COUNT(u.name) FILTER (
      WHERE u.name = 'analysis_upload_started'
    )::integer AS completed_scan_upload_attempts,
    COUNT(u.name) FILTER (
      WHERE u.name = 'analysis_upload_started'
        AND u.properties->>'has_image' = 'true'
    )::integer AS completed_image_upload_attempts,
    COALESCE(SUM(
      CASE
        WHEN u.name = 'analysis_upload_started'
          AND u.properties->>'estimated_request_bytes' ~ '^[0-9]+$'
        THEN (u.properties->>'estimated_request_bytes')::bigint
        ELSE 0
      END
    ), 0)::bigint AS completed_scan_upload_estimated_bytes,
    COALESCE(ROUND(AVG(
      CASE
        WHEN u.name = 'analysis_upload_started'
          AND u.properties->>'estimated_request_bytes' ~ '^[0-9]+$'
        THEN (u.properties->>'estimated_request_bytes')::numeric
        ELSE NULL
      END
    )), 0)::bigint AS avg_completed_scan_upload_estimated_bytes,
    COUNT(DISTINCT c.user_id::text || ':' || c.scan_id) FILTER (
      WHERE u.name = 'analysis_upload_started'
        AND NOT c.from_cache
    )::integer AS fresh_scan_completions_with_upload,
    COUNT(u.name) FILTER (
      WHERE u.name = 'analysis_upload_started'
        AND NOT c.from_cache
    )::integer AS fresh_completed_scan_upload_attempts,
    COUNT(u.name) FILTER (
      WHERE u.name = 'analysis_upload_started'
        AND u.properties->>'has_image' = 'true'
        AND NOT c.from_cache
    )::integer AS fresh_completed_image_upload_attempts,
    COALESCE(SUM(
      CASE
        WHEN u.name = 'analysis_upload_started'
          AND NOT c.from_cache
          AND u.properties->>'estimated_request_bytes' ~ '^[0-9]+$'
        THEN (u.properties->>'estimated_request_bytes')::bigint
        ELSE 0
      END
    ), 0)::bigint AS fresh_completed_scan_upload_estimated_bytes,
    COALESCE(ROUND(AVG(
      CASE
        WHEN u.name = 'analysis_upload_started'
          AND NOT c.from_cache
          AND u.properties->>'estimated_request_bytes' ~ '^[0-9]+$'
        THEN (u.properties->>'estimated_request_bytes')::numeric
        ELSE NULL
      END
    )), 0)::bigint AS avg_fresh_completed_scan_upload_estimated_bytes
  FROM completed_scans c
  LEFT JOIN events u
    ON u.user_id = c.user_id
   AND u.scan_id = c.scan_id
   AND u.name = 'analysis_upload_started'
  GROUP BY 1
)
SELECT
  daily.*,
  COALESCE(completed_scan_uploads.scan_completions_with_upload, 0)::integer AS scan_completions_with_upload,
  COALESCE(completed_scan_uploads.completed_scan_upload_attempts, 0)::integer AS completed_scan_upload_attempts,
  COALESCE(completed_scan_uploads.completed_image_upload_attempts, 0)::integer AS completed_image_upload_attempts,
  COALESCE(completed_scan_uploads.completed_scan_upload_estimated_bytes, 0)::bigint AS completed_scan_upload_estimated_bytes,
  COALESCE(completed_scan_uploads.avg_completed_scan_upload_estimated_bytes, 0)::bigint AS avg_completed_scan_upload_estimated_bytes,
  COALESCE(completed_scan_uploads.fresh_scan_completions_with_upload, 0)::integer AS fresh_scan_completions_with_upload,
  COALESCE(completed_scan_uploads.fresh_completed_scan_upload_attempts, 0)::integer AS fresh_completed_scan_upload_attempts,
  COALESCE(completed_scan_uploads.fresh_completed_image_upload_attempts, 0)::integer AS fresh_completed_image_upload_attempts,
  COALESCE(completed_scan_uploads.fresh_completed_scan_upload_estimated_bytes, 0)::bigint AS fresh_completed_scan_upload_estimated_bytes,
  COALESCE(completed_scan_uploads.avg_fresh_completed_scan_upload_estimated_bytes, 0)::bigint AS avg_fresh_completed_scan_upload_estimated_bytes,
  ROUND(onboarding_scan_now_taps::numeric / NULLIF(onboarding_starts, 0), 4) AS onboarding_scan_now_rate,
  ROUND(onboarding_completions::numeric / NULLIF(onboarding_starts, 0), 4) AS onboarding_completion_rate,
  ROUND(auth_screen_views::numeric / NULLIF(sessions, 0), 4) AS auth_screen_view_rate,
  ROUND(automatic_guest_session_completions::numeric / NULLIF(automatic_guest_session_starts, 0), 4) AS automatic_guest_session_success_rate,
  ROUND(manual_guest_continue_completions::numeric / NULLIF(manual_guest_continue_starts, 0), 4) AS manual_guest_continue_success_rate,
  ROUND(provider_sign_in_completions::numeric / NULLIF(provider_sign_in_starts, 0), 4) AS provider_sign_in_completion_rate,
  ROUND(scan_completions::numeric / NULLIF(scan_starts, 0), 4) AS scan_success_rate,
  ROUND(empty_state_scan_cta_taps::numeric / NULLIF(scan_cta_taps, 0), 4) AS empty_state_scan_cta_share,
  ROUND(cached_scan_completions::numeric / NULLIF(scan_completions, 0), 4) AS scan_cache_completion_rate,
  ROUND(image_upload_attempts::numeric / NULLIF(fresh_scan_completions, 0), 4) AS image_uploads_per_fresh_scan,
  ROUND(analysis_upload_estimated_bytes::numeric / NULLIF(fresh_scan_completions, 0), 4) AS estimated_upload_bytes_per_fresh_scan,
  ROUND(COALESCE(completed_scan_uploads.completed_image_upload_attempts, 0)::numeric / NULLIF(scan_completions, 0), 4) AS matched_image_uploads_per_completed_scan,
  ROUND(COALESCE(completed_scan_uploads.completed_scan_upload_estimated_bytes, 0)::numeric / NULLIF(scan_completions, 0), 4) AS matched_upload_bytes_per_completed_scan,
  ROUND(COALESCE(completed_scan_uploads.fresh_completed_image_upload_attempts, 0)::numeric / NULLIF(fresh_scan_completions, 0), 4) AS matched_image_uploads_per_fresh_scan,
  ROUND(COALESCE(completed_scan_uploads.fresh_completed_scan_upload_estimated_bytes, 0)::numeric / NULLIF(fresh_scan_completions, 0), 4) AS matched_upload_bytes_per_fresh_scan,
  ROUND(scan_failures::numeric / NULLIF(scan_starts, 0), 4) AS scan_failure_rate,
  ROUND(paywall_views::numeric / NULLIF(paywall_requests, 0), 4) AS paywall_request_to_view_rate,
  ROUND(paywall_package_loads::numeric / NULLIF(paywall_requests, 0), 4) AS paywall_request_to_package_load_rate,
  ROUND(paywall_package_loads::numeric / NULLIF(paywall_views, 0), 4) AS paywall_view_to_package_load_rate,
  ROUND(paywall_expected_package_loads::numeric / NULLIF(paywall_requests, 0), 4) AS paywall_request_to_expected_package_load_rate,
  ROUND(paywall_expected_package_loads::numeric / NULLIF(paywall_views, 0), 4) AS paywall_view_to_expected_package_load_rate,
  ROUND(paywall_views::numeric / NULLIF(scan_completions, 0), 4) AS result_to_paywall_rate,
  ROUND(plan_selections::numeric / NULLIF(paywall_views, 0), 4) AS paywall_plan_selection_rate,
  ROUND(paywall_dismissals::numeric / NULLIF(paywall_views, 0), 4) AS paywall_view_dismissal_rate,
  ROUND(purchase_starts::numeric / NULLIF(paywall_views, 0), 4) AS paywall_purchase_start_rate,
  ROUND(purchase_completions::numeric / NULLIF(paywall_views, 0), 4) AS paywall_purchase_completion_rate,
  ROUND(purchase_completions::numeric / NULLIF(purchase_starts, 0), 4) AS purchase_start_completion_rate,
  ROUND(purchase_entitlement_refresh_pro::numeric / NULLIF(purchase_entitlement_refreshes, 0), 4) AS purchase_entitlement_refresh_pro_rate,
  ROUND(restore_entitlement_refresh_pro::numeric / NULLIF(restore_entitlement_refreshes, 0), 4) AS restore_entitlement_refresh_pro_rate,
  ROUND(guest_save_prompt_completions::numeric / NULLIF(guest_save_prompt_views, 0), 4) AS guest_save_prompt_completion_rate,
  ROUND(guest_save_prompt_dismissals::numeric / NULLIF(guest_save_prompt_views, 0), 4) AS guest_save_prompt_dismissal_rate,
  ROUND(history_compare_opens::numeric / NULLIF(users, 0), 4) AS history_compare_opens_per_user,
  ROUND(history_compare_result_opens::numeric / NULLIF(history_compare_opens, 0), 4) AS history_compare_result_open_rate,
  ROUND(history_search_submissions::numeric / NULLIF(history_search_starts, 0), 4) AS history_search_submit_rate,
  ROUND(history_tool_result_opens::numeric / NULLIF(history_search_submissions + history_filter_changes, 0), 4) AS history_tool_result_open_rate,
  ROUND(share_completions::numeric / NULLIF(scan_completions, 0), 4) AS result_share_rate,
  ROUND(share_dismissals::numeric / NULLIF(share_starts, 0), 4) AS share_dismissal_rate,
  ROUND(app_review_requests::numeric / NULLIF(app_review_prompt_views, 0), 4) AS app_review_prompt_request_rate,
  ROUND(app_review_opens::numeric / NULLIF(app_review_requests, 0), 4) AS app_review_open_success_rate,
  ROUND(support_contact_opens::numeric / NULLIF(support_contact_taps, 0), 4) AS support_contact_open_rate,
  ROUND(app_error_sessions::numeric / NULLIF(sessions, 0), 4) AS app_error_session_rate
FROM daily
LEFT JOIN completed_scan_uploads USING (metric_date);

CREATE OR REPLACE VIEW public.kpi_onboarding_path_daily
WITH (security_invoker = true)
AS
WITH onboarding_sessions AS (
  SELECT
    session_id,
    MAX(user_id::text) AS user_id_text,
    MIN(created_at) FILTER (WHERE name = 'onboarding_started') AS onboarding_started_at,
    MIN(created_at) FILTER (
      WHERE name = 'onboarding_continue_tapped'
        AND properties->>'step_index' = '0'
    ) AS education_path_started_at,
    MIN(created_at) FILTER (WHERE name = 'onboarding_scan_now_tapped') AS scan_now_tapped_at,
    MIN(created_at) FILTER (WHERE name = 'onboarding_completed') AS onboarding_completed_at,
    COALESCE(
      NULLIF(MAX(properties->>'completion_method') FILTER (WHERE name = 'onboarding_completed'), ''),
      NULLIF(MAX(properties->>'completion_method'), '')
    ) AS completion_method,
    MIN(created_at) FILTER (WHERE name IN ('anonymous_signed_in', 'guest_continue_completed', 'auth_signed_in')) AS auth_completed_at,
    MIN(created_at) FILTER (WHERE name = 'auth_viewed') AS auth_viewed_at,
    MIN(created_at) FILTER (WHERE name = 'scan_analysis_started') AS scan_started_at,
    MIN(created_at) FILTER (WHERE name = 'scan_analysis_completed') AS scan_completed_at,
    MIN(created_at) FILTER (WHERE name IN ('scan_analysis_failed', 'scan_analysis_timeout', 'barcode_not_found')) AS scan_failed_at,
    MIN(created_at) FILTER (WHERE name = 'paywall_viewed') AS paywall_viewed_at,
    MIN(created_at) FILTER (WHERE name = 'purchase_completed') AS purchase_completed_at
  FROM public.analytics_events
  WHERE session_id IS NOT NULL
    AND name IN (
      'onboarding_started',
      'onboarding_continue_tapped',
      'onboarding_scan_now_tapped',
      'onboarding_completed',
      'anonymous_signed_in',
      'guest_continue_completed',
      'auth_signed_in',
      'auth_viewed',
      'scan_analysis_started',
      'scan_analysis_completed',
      'scan_analysis_failed',
      'scan_analysis_timeout',
      'barcode_not_found',
      'paywall_viewed',
      'purchase_completed'
    )
  GROUP BY session_id
  HAVING MIN(created_at) FILTER (WHERE name = 'onboarding_started') IS NOT NULL
),
session_paths AS (
  SELECT
    date_trunc('day', onboarding_started_at)::date AS metric_date,
    session_id,
    user_id_text,
    CASE
      WHEN completion_method = 'scan_now' THEN 'scan_now'
      WHEN completion_method = 'completed_flow' THEN 'completed_flow'
      WHEN scan_now_tapped_at IS NOT NULL THEN 'scan_now_incomplete'
      WHEN education_path_started_at IS NOT NULL THEN 'education_incomplete'
      ELSE 'started_only'
    END AS onboarding_path,
    onboarding_started_at,
    education_path_started_at,
    scan_now_tapped_at,
    onboarding_completed_at,
    auth_completed_at,
    auth_viewed_at,
    scan_started_at,
    scan_completed_at,
    scan_failed_at,
    paywall_viewed_at,
    purchase_completed_at
  FROM onboarding_sessions
)
SELECT
  metric_date,
  onboarding_path,
  COUNT(*)::integer AS onboarding_sessions,
  COUNT(DISTINCT user_id_text) FILTER (WHERE user_id_text IS NOT NULL)::integer AS onboarding_users,
  COUNT(*) FILTER (WHERE education_path_started_at IS NOT NULL)::integer AS education_path_starts,
  COUNT(*) FILTER (WHERE scan_now_tapped_at IS NOT NULL)::integer AS scan_now_taps,
  COUNT(*) FILTER (WHERE onboarding_completed_at IS NOT NULL)::integer AS onboarding_completions,
  COUNT(*) FILTER (WHERE auth_viewed_at IS NOT NULL)::integer AS auth_screen_views,
  COUNT(*) FILTER (WHERE auth_completed_at IS NOT NULL)::integer AS auth_completions,
  COUNT(*) FILTER (WHERE scan_started_at IS NOT NULL)::integer AS scan_starts,
  COUNT(*) FILTER (WHERE scan_completed_at IS NOT NULL)::integer AS scan_completions,
  COUNT(*) FILTER (WHERE scan_failed_at IS NOT NULL)::integer AS scan_failures,
  COUNT(*) FILTER (WHERE paywall_viewed_at IS NOT NULL)::integer AS paywall_views,
  COUNT(*) FILTER (WHERE purchase_completed_at IS NOT NULL)::integer AS purchase_completions,
  ROUND(COUNT(*) FILTER (WHERE onboarding_completed_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0), 4) AS onboarding_completion_rate,
  ROUND(COUNT(*) FILTER (WHERE auth_completed_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0), 4) AS auth_completion_rate,
  ROUND(COUNT(*) FILTER (WHERE scan_started_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0), 4) AS onboarding_to_scan_start_rate,
  ROUND(COUNT(*) FILTER (WHERE scan_completed_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0), 4) AS onboarding_to_scan_completion_rate,
  ROUND(COUNT(*) FILTER (WHERE scan_completed_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE scan_started_at IS NOT NULL), 0), 4) AS scan_start_completion_rate,
  ROUND(COUNT(*) FILTER (WHERE paywall_viewed_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE scan_completed_at IS NOT NULL), 0), 4) AS completed_scan_to_paywall_rate,
  ROUND(COUNT(*) FILTER (WHERE purchase_completed_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE paywall_viewed_at IS NOT NULL), 0), 4) AS paywall_to_purchase_rate
FROM session_paths
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.kpi_user_lifecycle
WITH (security_invoker = true)
AS
SELECT
  user_id,
  MIN(created_at) AS first_seen_at,
  MIN(created_at) FILTER (WHERE name = 'onboarding_started') AS first_onboarding_started_at,
  MIN(created_at) FILTER (WHERE name = 'onboarding_completed') AS first_onboarding_completed_at,
  MIN(created_at) FILTER (WHERE name IN ('anonymous_signed_in', 'guest_continue_completed', 'auth_signed_in')) AS first_auth_completed_at,
  MIN(created_at) FILTER (WHERE name = 'scan_analysis_started') AS first_scan_started_at,
  MIN(created_at) FILTER (WHERE name = 'scan_analysis_completed') AS first_scan_completed_at,
  MIN(created_at) FILTER (WHERE name = 'paywall_viewed') AS first_paywall_viewed_at,
  MIN(created_at) FILTER (WHERE name = 'purchase_started') AS first_purchase_started_at,
  MIN(created_at) FILTER (WHERE name = 'purchase_completed') AS first_purchase_completed_at,
  MIN(created_at) FILTER (WHERE name = 'history_compare_opened') AS first_history_compare_opened_at,
  MIN(created_at) FILTER (WHERE name = 'share_completed') AS first_share_completed_at,
  COUNT(*) FILTER (WHERE name = 'scan_analysis_started')::integer AS scan_starts,
  COUNT(*) FILTER (WHERE name = 'scan_analysis_completed')::integer AS scan_completions,
  COUNT(*) FILTER (WHERE name IN ('scan_analysis_failed', 'scan_analysis_timeout', 'barcode_not_found'))::integer AS scan_failures,
  COUNT(*) FILTER (WHERE name = 'history_item_opened')::integer AS history_item_opens,
  COUNT(*) FILTER (WHERE name = 'history_compare_opened')::integer AS history_compare_opens,
  COUNT(*) FILTER (WHERE name = 'history_compare_result_opened')::integer AS history_compare_result_opens,
  COUNT(*) FILTER (WHERE name = 'paywall_viewed')::integer AS paywall_views,
  COUNT(*) FILTER (WHERE name = 'purchase_completed')::integer AS purchase_completions,
  COUNT(*) FILTER (WHERE name = 'share_completed')::integer AS share_completions
FROM public.analytics_events
WHERE user_id IS NOT NULL
GROUP BY user_id;

CREATE OR REPLACE VIEW public.kpi_activation_cohorts
WITH (security_invoker = true)
AS
SELECT
  first_seen_at::date AS cohort_date,
  COUNT(*)::integer AS users,
  COUNT(*) FILTER (WHERE first_onboarding_completed_at IS NOT NULL)::integer AS users_completed_onboarding,
  COUNT(*) FILTER (WHERE first_auth_completed_at IS NOT NULL)::integer AS users_authenticated,
  COUNT(*) FILTER (WHERE first_scan_started_at IS NOT NULL)::integer AS users_started_scan,
  COUNT(*) FILTER (WHERE first_scan_completed_at IS NOT NULL)::integer AS users_completed_scan,
  COUNT(*) FILTER (WHERE first_history_compare_opened_at IS NOT NULL)::integer AS users_compared_history,
  COUNT(*) FILTER (WHERE first_paywall_viewed_at IS NOT NULL)::integer AS users_saw_paywall,
  COUNT(*) FILTER (WHERE first_purchase_completed_at IS NOT NULL)::integer AS users_purchased,
  COUNT(*) FILTER (WHERE first_share_completed_at IS NOT NULL)::integer AS users_shared,
  ROUND(COUNT(*) FILTER (WHERE first_scan_completed_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0), 4) AS activation_rate,
  ROUND(COUNT(*) FILTER (WHERE first_history_compare_opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE first_scan_completed_at IS NOT NULL), 0), 4) AS activated_to_history_compare_rate,
  ROUND(COUNT(*) FILTER (WHERE first_paywall_viewed_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE first_scan_completed_at IS NOT NULL), 0), 4) AS activated_to_paywall_rate,
  ROUND(COUNT(*) FILTER (WHERE first_purchase_completed_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE first_paywall_viewed_at IS NOT NULL), 0), 4) AS paywall_to_purchase_user_rate,
  ROUND(COUNT(*) FILTER (WHERE first_share_completed_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE first_scan_completed_at IS NOT NULL), 0), 4) AS activated_to_share_rate
FROM public.kpi_user_lifecycle
GROUP BY 1;

CREATE OR REPLACE VIEW public.kpi_share_daily
WITH (security_invoker = true)
AS
WITH share_events AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    CASE
      WHEN properties->>'is_pro' = 'true' THEN 'pro'
      WHEN properties->>'is_pro' = 'false' THEN 'free'
      ELSE 'unknown'
    END AS user_plan,
    COALESCE(NULLIF(properties->>'scan_mode', ''), 'unknown') AS scan_mode,
    COALESCE(NULLIF(properties->>'data_source', ''), 'unknown') AS data_source,
    CASE WHEN properties->>'share_url_attached' = 'true' THEN true ELSE false END AS share_url_attached,
    name
  FROM public.analytics_events
  WHERE name IN (
    'share_started',
    'share_completed',
    'share_dismissed',
    'share_image_failed',
    'share_failed'
  )
)
SELECT
  metric_date,
  user_plan,
  scan_mode,
  data_source,
  share_url_attached,
  COUNT(*) FILTER (WHERE name = 'share_started')::integer AS share_starts,
  COUNT(*) FILTER (WHERE name = 'share_completed')::integer AS share_completions,
  COUNT(*) FILTER (WHERE name = 'share_dismissed')::integer AS share_dismissals,
  COUNT(*) FILTER (WHERE name = 'share_image_failed')::integer AS image_share_failures,
  COUNT(*) FILTER (WHERE name = 'share_failed')::integer AS total_share_failures,
  ROUND(COUNT(*) FILTER (WHERE name = 'share_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'share_started'), 0), 4) AS share_completion_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'share_dismissed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'share_started'), 0), 4) AS share_dismissal_rate
FROM share_events
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW public.kpi_app_review_daily
WITH (security_invoker = true)
AS
WITH review_events AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    COALESCE(NULLIF(properties->>'source', ''), 'unknown') AS source,
    CASE
      WHEN properties->>'is_pro' = 'true' THEN 'pro'
      WHEN properties->>'is_pro' = 'false' THEN 'free'
      ELSE 'unknown'
    END AS user_plan,
    COALESCE(NULLIF(properties->>'store', ''), 'unknown') AS store,
    COALESCE(NULLIF(properties->>'scan_mode', ''), 'unknown') AS scan_mode,
    name
  FROM public.analytics_events
  WHERE name IN (
    'app_review_prompt_viewed',
    'app_review_prompt_dismissed',
    'app_review_requested',
    'app_review_opened',
    'app_review_open_failed'
  )
)
SELECT
  metric_date,
  source,
  user_plan,
  store,
  scan_mode,
  COUNT(*) FILTER (WHERE name = 'app_review_prompt_viewed')::integer AS prompt_views,
  COUNT(*) FILTER (WHERE name = 'app_review_prompt_dismissed')::integer AS prompt_dismissals,
  COUNT(*) FILTER (WHERE name = 'app_review_requested')::integer AS review_requests,
  COUNT(*) FILTER (WHERE name = 'app_review_opened')::integer AS review_opens,
  COUNT(*) FILTER (WHERE name = 'app_review_open_failed')::integer AS review_open_failures,
  ROUND(COUNT(*) FILTER (WHERE name = 'app_review_requested')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'app_review_prompt_viewed'), 0), 4) AS prompt_request_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'app_review_opened')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'app_review_requested'), 0), 4) AS review_open_success_rate
FROM review_events
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW public.kpi_support_daily
WITH (security_invoker = true)
AS
WITH support_events AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    COALESCE(NULLIF(properties->>'source', ''), 'unknown') AS source,
    CASE
      WHEN properties->>'is_pro' = 'true' THEN 'pro'
      WHEN properties->>'is_pro' = 'false' THEN 'free'
      ELSE 'unknown'
    END AS user_plan,
    COALESCE(NULLIF(properties->>'account_type', ''), 'unknown') AS account_type,
    COALESCE(NULLIF(properties->>'platform', ''), 'unknown') AS platform,
    name
  FROM public.analytics_events
  WHERE name IN (
    'support_contact_tapped',
    'support_contact_opened',
    'support_contact_failed'
  )
)
SELECT
  metric_date,
  source,
  user_plan,
  account_type,
  platform,
  COUNT(*) FILTER (WHERE name = 'support_contact_tapped')::integer AS support_contact_taps,
  COUNT(*) FILTER (WHERE name = 'support_contact_opened')::integer AS support_contact_opens,
  COUNT(*) FILTER (WHERE name = 'support_contact_failed')::integer AS support_contact_failures,
  ROUND(COUNT(*) FILTER (WHERE name = 'support_contact_opened')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'support_contact_tapped'), 0), 4) AS support_contact_open_rate
FROM support_events
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW public.kpi_retention_daily
WITH (security_invoker = true)
AS
WITH retention_events AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    CASE
      WHEN properties->>'is_pro' = 'true' THEN 'pro'
      WHEN properties->>'is_pro' = 'false' THEN 'free'
      ELSE 'unknown'
    END AS user_plan,
    COALESCE(NULLIF(properties->>'source_surface', ''), 'unknown') AS source_surface,
    name,
    properties
  FROM public.analytics_events
  WHERE name IN (
    'history_item_opened',
    'history_search_started',
    'history_search_submitted',
    'history_search_cleared',
    'history_filter_changed',
    'history_filters_cleared',
    'history_list_expanded',
    'history_list_collapsed',
    'history_compare_opened',
    'history_compare_closed',
    'history_compare_result_opened'
  )
)
SELECT
  metric_date,
  user_plan,
  source_surface,
  COUNT(*) FILTER (WHERE name = 'history_item_opened')::integer AS history_item_opens,
  COUNT(*) FILTER (
    WHERE name = 'history_item_opened'
      AND source_surface IN ('home_history_search', 'home_history_filter')
  )::integer AS history_tool_result_opens,
  COUNT(*) FILTER (WHERE name = 'history_search_started')::integer AS history_search_starts,
  COUNT(*) FILTER (WHERE name = 'history_search_submitted')::integer AS history_search_submissions,
  COUNT(*) FILTER (WHERE name = 'history_search_cleared')::integer AS history_search_clears,
  COUNT(*) FILTER (WHERE name = 'history_filter_changed')::integer AS history_filter_changes,
  COUNT(*) FILTER (WHERE name = 'history_filters_cleared')::integer AS history_filters_cleared,
  COUNT(*) FILTER (WHERE name = 'history_list_expanded')::integer AS history_list_expands,
  COUNT(*) FILTER (WHERE name = 'history_list_collapsed')::integer AS history_list_collapses,
  COUNT(*) FILTER (WHERE name = 'history_compare_opened')::integer AS history_compare_opens,
  COUNT(*) FILTER (WHERE name = 'history_compare_closed')::integer AS history_compare_closes,
  COUNT(*) FILTER (WHERE name = 'history_compare_result_opened')::integer AS history_compare_result_opens,
  COALESCE(ROUND(AVG(
    CASE
      WHEN name = 'history_compare_opened'
        AND properties->>'score_delta' ~ '^[0-9]+$'
      THEN (properties->>'score_delta')::numeric
      ELSE NULL
    END
  )), 0)::bigint AS avg_compare_score_delta,
  ROUND(COUNT(*) FILTER (WHERE name = 'history_compare_result_opened')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'history_compare_opened'), 0), 4) AS compare_result_open_rate,
  ROUND(COUNT(*) FILTER (
    WHERE name = 'history_item_opened'
      AND source_surface IN ('home_history_search', 'home_history_filter')
  )::numeric / NULLIF(COUNT(*) FILTER (WHERE name IN ('history_search_submitted', 'history_filter_changed')), 0), 4) AS history_tool_result_open_rate
FROM retention_events
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.kpi_scan_usage_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', created_at)::date AS metric_date,
  COUNT(*)::integer AS scan_gate_attempts,
  COUNT(DISTINCT user_id)::integer AS users_with_scan_gate_attempts,
  COUNT(*) FILTER (WHERE allowed)::integer AS allowed_attempts,
  COUNT(*) FILTER (WHERE allowed AND is_pro_at_time)::integer AS pro_allowed_attempts,
  COUNT(*) FILTER (WHERE allowed AND NOT is_pro_at_time)::integer AS free_allowed_attempts,
  COUNT(*) FILTER (WHERE counted)::integer AS net_free_scans_counted,
  COUNT(*) FILTER (WHERE reversed)::integer AS reversed_free_scans,
  COUNT(*) FILTER (WHERE NOT allowed AND reason = 'free_limit_reached')::integer AS scan_limit_blocks,
  ROUND(COUNT(*) FILTER (WHERE reversed)::numeric / NULLIF(COUNT(*) FILTER (WHERE allowed AND NOT is_pro_at_time), 0), 4) AS free_scan_reversal_rate,
  ROUND(COUNT(*) FILTER (WHERE NOT allowed AND reason = 'free_limit_reached')::numeric / NULLIF(COUNT(*), 0), 4) AS scan_limit_block_rate
FROM public.scan_usage_events
GROUP BY 1;

CREATE OR REPLACE VIEW public.kpi_analysis_cache_health
WITH (security_invoker = true)
AS
SELECT
  NOW() AS snapshot_at,
  COUNT(*)::integer AS total_cache_rows,
  COUNT(*) FILTER (WHERE expires_at >= NOW())::integer AS active_cache_rows,
  COUNT(*) FILTER (WHERE expires_at < NOW())::integer AS expired_cache_rows,
  COUNT(*) FILTER (WHERE COALESCE(hit_count, 0) > 0)::integer AS cache_rows_with_hits,
  COALESCE(SUM(COALESCE(hit_count, 0)), 0)::bigint AS total_cache_hits,
  COALESCE(SUM(COALESCE(hit_count, 0)) FILTER (WHERE expires_at >= NOW()), 0)::bigint AS active_cache_hits,
  COALESCE(SUM(pg_column_size(analysis) + COALESCE(pg_column_size(opff_data), 0)), 0)::bigint AS total_cache_payload_bytes,
  COALESCE(SUM(pg_column_size(analysis) + COALESCE(pg_column_size(opff_data), 0)) FILTER (WHERE expires_at >= NOW()), 0)::bigint AS active_cache_payload_bytes,
  COALESCE(ROUND(AVG(pg_column_size(analysis) + COALESCE(pg_column_size(opff_data), 0)) FILTER (WHERE expires_at >= NOW())), 0)::bigint AS avg_active_cache_payload_bytes,
  COALESCE(MAX(pg_column_size(analysis) + COALESCE(pg_column_size(opff_data), 0)) FILTER (WHERE expires_at >= NOW()), 0)::bigint AS max_active_cache_payload_bytes,
  ROUND(COUNT(*) FILTER (WHERE COALESCE(hit_count, 0) > 0)::numeric / NULLIF(COUNT(*), 0), 4) AS cache_rows_with_hits_rate,
  ROUND(COALESCE(SUM(COALESCE(hit_count, 0)) FILTER (WHERE expires_at >= NOW()), 0)::numeric / NULLIF(COUNT(*) FILTER (WHERE expires_at >= NOW()), 0), 4) AS active_hits_per_cache_row
FROM public.analysis_cache;

CREATE OR REPLACE VIEW public.kpi_scan_failures_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', created_at)::date AS metric_date,
  COALESCE(NULLIF(properties->>'scan_mode', ''), 'unknown') AS scan_mode,
  COALESCE(NULLIF(properties->>'failure_category', ''), 'unknown') AS failure_category,
  COALESCE(NULLIF(properties->>'error_code', ''), 'none') AS error_code,
  COALESCE(NULLIF(properties->>'http_status', ''), 'none') AS http_status,
  COALESCE(NULLIF(properties->>'app_version', ''), 'unknown') AS app_version,
  COUNT(*)::integer AS failure_events,
  COUNT(DISTINCT user_id)::integer AS users_impacted,
  COUNT(DISTINCT session_id)::integer AS sessions_impacted,
  COUNT(*) FILTER (WHERE properties->>'scan_usage_reversed' = 'true')::integer AS reversed_scan_failures,
  COUNT(*) FILTER (WHERE properties->>'entitlement_recovery_attempted' = 'true')::integer AS entitlement_recovery_attempts
FROM public.analytics_events
WHERE name IN (
  'scan_analysis_failed',
  'scan_analysis_timeout',
  'barcode_not_found'
)
GROUP BY 1, 2, 3, 4, 5, 6;

CREATE OR REPLACE VIEW public.kpi_paywall_source_daily
WITH (security_invoker = true)
AS
WITH paywall_events AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    COALESCE(NULLIF(properties->>'source', ''), 'unknown') AS source,
    COALESCE(NULLIF(properties->>'source_intent', ''), 'unknown') AS source_intent,
    properties,
    name
  FROM public.analytics_events
  WHERE name IN (
    'paywall_requested',
    'paywall_viewed',
    'paywall_offerings_loaded',
    'paywall_plan_selected',
    'paywall_dismissed',
    'purchase_started',
    'purchase_completed',
    'purchase_entitlement_refreshed',
    'purchase_cancelled',
    'purchase_pending',
    'purchase_failed',
    'purchase_no_entitlement',
    'purchase_unavailable',
    'restore_started',
    'restore_completed',
    'restore_entitlement_refreshed',
    'restore_failed',
    'restore_no_purchases',
    'restore_no_entitlement'
  )
)
SELECT
  metric_date,
  source,
  source_intent,
  COUNT(*) FILTER (WHERE name = 'paywall_requested')::integer AS paywall_requests,
  COUNT(*) FILTER (WHERE name = 'paywall_viewed')::integer AS paywall_views,
  COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded')::integer AS offering_load_attempts,
  COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND properties->>'success' = 'true'
      AND CASE
        WHEN properties->>'package_count' ~ '^[0-9]+$'
        THEN (properties->>'package_count')::integer > 0
        ELSE false
      END
  )::integer AS package_loads,
  COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND (
        properties->>'success' <> 'true'
        OR CASE
          WHEN properties->>'package_count' ~ '^[0-9]+$'
          THEN (properties->>'package_count')::integer <= 0
          ELSE true
        END
      )
  )::integer AS package_load_failures,
  COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND COALESCE(
        properties->>'success' = 'true'
        AND CASE
          WHEN properties->>'missing_plan_count' ~ '^[0-9]+$'
          THEN (properties->>'missing_plan_count')::integer = 0
          WHEN properties->>'package_count' ~ '^[0-9]+$'
          THEN (properties->>'package_count')::integer >= 3
          ELSE false
        END,
        false
      )
  )::integer AS expected_package_loads,
  COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND NOT COALESCE(
        properties->>'success' = 'true'
        AND CASE
          WHEN properties->>'missing_plan_count' ~ '^[0-9]+$'
          THEN (properties->>'missing_plan_count')::integer = 0
          WHEN properties->>'package_count' ~ '^[0-9]+$'
          THEN (properties->>'package_count')::integer >= 3
          ELSE false
        END,
        false
      )
  )::integer AS expected_package_load_failures,
  COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'weekly_package_available' = 'false')::integer AS weekly_package_missing,
  COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'monthly_package_available' = 'false')::integer AS monthly_package_missing,
  COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'annual_package_available' = 'false')::integer AS annual_package_missing,
  COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'placement_requested' = 'true')::integer AS placement_offering_requests,
  COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'placement_offering_returned' = 'true')::integer AS placement_offering_returns,
  COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'placement_fallback_used' = 'true')::integer AS placement_current_fallbacks,
  COUNT(*) FILTER (WHERE name = 'paywall_offerings_loaded' AND properties->>'offering_fetch_mode' = 'error')::integer AS placement_offering_errors,
  COUNT(*) FILTER (WHERE name = 'paywall_plan_selected')::integer AS plan_selections,
  COUNT(*) FILTER (WHERE name = 'paywall_dismissed')::integer AS paywall_dismissals,
  COALESCE(ROUND(AVG(
    CASE
      WHEN name = 'paywall_dismissed'
        AND properties->>'duration_ms' ~ '^[0-9]+$'
      THEN (properties->>'duration_ms')::numeric
      ELSE NULL
    END
  )), 0)::bigint AS avg_paywall_dismiss_duration_ms,
  COUNT(*) FILTER (WHERE name = 'purchase_started')::integer AS purchase_starts,
  COUNT(*) FILTER (WHERE name = 'purchase_completed')::integer AS purchase_completions,
  COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed')::integer AS purchase_entitlement_refreshes,
  COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed' AND properties->>'is_pro' = 'true')::integer AS purchase_entitlement_refresh_pro,
  COUNT(*) FILTER (WHERE name = 'purchase_cancelled')::integer AS purchase_cancellations,
  COUNT(*) FILTER (WHERE name = 'purchase_pending')::integer AS purchase_pending,
  COUNT(*) FILTER (WHERE name = 'purchase_failed')::integer AS purchase_failures,
  COUNT(*) FILTER (WHERE name = 'purchase_no_entitlement')::integer AS purchase_no_entitlement,
  COUNT(*) FILTER (WHERE name = 'purchase_unavailable')::integer AS purchase_unavailable,
  COUNT(*) FILTER (WHERE name = 'restore_started')::integer AS restore_starts,
  COUNT(*) FILTER (WHERE name = 'restore_completed')::integer AS restore_completions,
  COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed')::integer AS restore_entitlement_refreshes,
  COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed' AND properties->>'is_pro' = 'true')::integer AS restore_entitlement_refresh_pro,
  COUNT(*) FILTER (WHERE name = 'restore_failed')::integer AS restore_failures,
  COUNT(*) FILTER (WHERE name = 'restore_no_purchases')::integer AS restore_no_purchases,
  COUNT(*) FILTER (WHERE name = 'restore_no_entitlement')::integer AS restore_no_entitlement,
  ROUND(COUNT(*) FILTER (WHERE name = 'paywall_viewed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_requested'), 0), 4) AS paywall_request_to_view_rate,
  ROUND(COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND properties->>'success' = 'true'
      AND CASE
        WHEN properties->>'package_count' ~ '^[0-9]+$'
        THEN (properties->>'package_count')::integer > 0
        ELSE false
      END
  )::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_requested'), 0), 4) AS paywall_request_to_package_load_rate,
  ROUND(COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND properties->>'success' = 'true'
      AND CASE
        WHEN properties->>'package_count' ~ '^[0-9]+$'
        THEN (properties->>'package_count')::integer > 0
        ELSE false
      END
  )::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_to_package_load_rate,
  ROUND(COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND COALESCE(
        properties->>'success' = 'true'
        AND CASE
          WHEN properties->>'missing_plan_count' ~ '^[0-9]+$'
          THEN (properties->>'missing_plan_count')::integer = 0
          WHEN properties->>'package_count' ~ '^[0-9]+$'
          THEN (properties->>'package_count')::integer >= 3
          ELSE false
        END,
        false
      )
  )::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_requested'), 0), 4) AS paywall_request_to_expected_package_load_rate,
  ROUND(COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND COALESCE(
        properties->>'success' = 'true'
        AND CASE
          WHEN properties->>'missing_plan_count' ~ '^[0-9]+$'
          THEN (properties->>'missing_plan_count')::integer = 0
          WHEN properties->>'package_count' ~ '^[0-9]+$'
          THEN (properties->>'package_count')::integer >= 3
          ELSE false
        END,
        false
      )
  )::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_to_expected_package_load_rate,
  ROUND(COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND properties->>'placement_offering_returned' = 'true'
  )::numeric / NULLIF(COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND properties->>'placement_requested' = 'true'
  ), 0), 4) AS placement_offering_return_rate,
  ROUND(COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND properties->>'placement_fallback_used' = 'true'
  )::numeric / NULLIF(COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND properties->>'placement_requested' = 'true'
  ), 0), 4) AS placement_current_fallback_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_started')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_purchase_start_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'paywall_dismissed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_dismissal_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_purchase_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'purchase_started'), 0), 4) AS purchase_start_completion_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed' AND properties->>'is_pro' = 'true')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed'), 0), 4) AS purchase_entitlement_refresh_pro_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed' AND properties->>'is_pro' = 'true')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed'), 0), 4) AS restore_entitlement_refresh_pro_rate
FROM paywall_events
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.kpi_paywall_daily
WITH (security_invoker = true)
AS
WITH paywall_events AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    COALESCE(NULLIF(properties->>'source', ''), 'unknown') AS source,
    COALESCE(NULLIF(properties->>'source_intent', ''), 'unknown') AS source_intent,
    COALESCE(NULLIF(properties->>'paywall_variant', ''), 'unknown') AS paywall_variant,
    COALESCE(NULLIF(properties->>'pitch_key', ''), 'unknown') AS pitch_key,
    COALESCE(NULLIF(properties->>'plan', ''), NULLIF(properties->>'default_plan', ''), 'unknown') AS plan,
    properties,
    name
  FROM public.analytics_events
  WHERE name IN (
    'paywall_viewed',
    'paywall_plan_selected',
    'paywall_dismissed',
    'purchase_started',
    'purchase_completed',
    'purchase_entitlement_refreshed',
    'purchase_cancelled',
    'purchase_pending',
    'purchase_failed',
    'purchase_no_entitlement',
    'purchase_unavailable',
    'restore_started',
    'restore_completed',
    'restore_entitlement_refreshed',
    'restore_failed',
    'restore_no_purchases',
    'restore_no_entitlement'
  )
)
SELECT
  metric_date,
  source,
  source_intent,
  paywall_variant,
  pitch_key,
  plan,
  COUNT(*) FILTER (WHERE name = 'paywall_viewed')::integer AS paywall_views,
  COUNT(*) FILTER (WHERE name = 'paywall_plan_selected')::integer AS plan_selections,
  COUNT(*) FILTER (WHERE name = 'paywall_dismissed')::integer AS paywall_dismissals,
  COALESCE(ROUND(AVG(
    CASE
      WHEN name = 'paywall_dismissed'
        AND properties->>'duration_ms' ~ '^[0-9]+$'
      THEN (properties->>'duration_ms')::numeric
      ELSE NULL
    END
  )), 0)::bigint AS avg_paywall_dismiss_duration_ms,
  COUNT(*) FILTER (WHERE name = 'purchase_started')::integer AS purchase_starts,
  COUNT(*) FILTER (WHERE name = 'purchase_completed')::integer AS purchase_completions,
  COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed')::integer AS purchase_entitlement_refreshes,
  COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed' AND properties->>'is_pro' = 'true')::integer AS purchase_entitlement_refresh_pro,
  COUNT(*) FILTER (WHERE name = 'purchase_cancelled')::integer AS purchase_cancellations,
  COUNT(*) FILTER (WHERE name = 'purchase_pending')::integer AS purchase_pending,
  COUNT(*) FILTER (WHERE name = 'purchase_failed')::integer AS purchase_failures,
  COUNT(*) FILTER (WHERE name = 'purchase_no_entitlement')::integer AS purchase_no_entitlement,
  COUNT(*) FILTER (WHERE name = 'purchase_unavailable')::integer AS purchase_unavailable,
  COUNT(*) FILTER (WHERE name = 'restore_started')::integer AS restore_starts,
  COUNT(*) FILTER (WHERE name = 'restore_completed')::integer AS restore_completions,
  COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed')::integer AS restore_entitlement_refreshes,
  COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed' AND properties->>'is_pro' = 'true')::integer AS restore_entitlement_refresh_pro,
  COUNT(*) FILTER (WHERE name = 'restore_failed')::integer AS restore_failures,
  COUNT(*) FILTER (WHERE name = 'restore_no_purchases')::integer AS restore_no_purchases,
  COUNT(*) FILTER (WHERE name = 'restore_no_entitlement')::integer AS restore_no_entitlement,
  ROUND(COUNT(*) FILTER (WHERE name = 'paywall_dismissed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_dismissal_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'purchase_started'), 0), 4) AS purchase_start_completion_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_plan_selected'), 0), 4) AS plan_selection_purchase_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed' AND properties->>'is_pro' = 'true')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed'), 0), 4) AS purchase_entitlement_refresh_pro_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed' AND properties->>'is_pro' = 'true')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed'), 0), 4) AS restore_entitlement_refresh_pro_rate
FROM paywall_events
GROUP BY 1, 2, 3, 4, 5, 6;

CREATE OR REPLACE VIEW public.kpi_paywall_pitch_daily
WITH (security_invoker = true)
AS
WITH paywall_events AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    COALESCE(NULLIF(properties->>'source', ''), 'unknown') AS source,
    COALESCE(NULLIF(properties->>'source_intent', ''), 'unknown') AS source_intent,
    COALESCE(NULLIF(properties->>'paywall_variant', ''), 'unknown') AS paywall_variant,
    COALESCE(NULLIF(properties->>'pitch_key', ''), 'unknown') AS pitch_key,
    properties,
    name
  FROM public.analytics_events
  WHERE name IN (
    'paywall_viewed',
    'paywall_dismissed',
    'purchase_started',
    'purchase_completed',
    'purchase_entitlement_refreshed',
    'purchase_cancelled',
    'purchase_pending',
    'purchase_failed',
    'purchase_no_entitlement',
    'purchase_unavailable',
    'restore_started',
    'restore_completed',
    'restore_entitlement_refreshed',
    'restore_failed',
    'restore_no_purchases',
    'restore_no_entitlement'
  )
)
SELECT
  metric_date,
  source,
  source_intent,
  paywall_variant,
  pitch_key,
  COUNT(*) FILTER (WHERE name = 'paywall_viewed')::integer AS paywall_views,
  COUNT(*) FILTER (WHERE name = 'paywall_dismissed')::integer AS paywall_dismissals,
  COALESCE(ROUND(AVG(
    CASE
      WHEN name = 'paywall_dismissed'
        AND properties->>'duration_ms' ~ '^[0-9]+$'
      THEN (properties->>'duration_ms')::numeric
      ELSE NULL
    END
  )), 0)::bigint AS avg_paywall_dismiss_duration_ms,
  COUNT(*) FILTER (WHERE name = 'purchase_started')::integer AS purchase_starts,
  COUNT(*) FILTER (WHERE name = 'purchase_completed')::integer AS purchase_completions,
  COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed')::integer AS purchase_entitlement_refreshes,
  COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed' AND properties->>'is_pro' = 'true')::integer AS purchase_entitlement_refresh_pro,
  COUNT(*) FILTER (WHERE name = 'purchase_cancelled')::integer AS purchase_cancellations,
  COUNT(*) FILTER (WHERE name = 'purchase_pending')::integer AS purchase_pending,
  COUNT(*) FILTER (WHERE name = 'purchase_failed')::integer AS purchase_failures,
  COUNT(*) FILTER (WHERE name = 'purchase_no_entitlement')::integer AS purchase_no_entitlement,
  COUNT(*) FILTER (WHERE name = 'purchase_unavailable')::integer AS purchase_unavailable,
  COUNT(*) FILTER (WHERE name = 'restore_started')::integer AS restore_starts,
  COUNT(*) FILTER (WHERE name = 'restore_completed')::integer AS restore_completions,
  COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed')::integer AS restore_entitlement_refreshes,
  COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed' AND properties->>'is_pro' = 'true')::integer AS restore_entitlement_refresh_pro,
  COUNT(*) FILTER (WHERE name = 'restore_failed')::integer AS restore_failures,
  COUNT(*) FILTER (WHERE name = 'restore_no_purchases')::integer AS restore_no_purchases,
  COUNT(*) FILTER (WHERE name = 'restore_no_entitlement')::integer AS restore_no_entitlement,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_started')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_purchase_start_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'paywall_dismissed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_dismissal_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_purchase_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'purchase_started'), 0), 4) AS purchase_start_completion_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed' AND properties->>'is_pro' = 'true')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed'), 0), 4) AS purchase_entitlement_refresh_pro_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed' AND properties->>'is_pro' = 'true')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'restore_entitlement_refreshed'), 0), 4) AS restore_entitlement_refresh_pro_rate
FROM paywall_events
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW public.kpi_revenuecat_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', COALESCE(event_timestamp, received_at))::date AS metric_date,
  COUNT(*)::integer AS webhook_events,
  COUNT(*) FILTER (WHERE event_type = 'INITIAL_PURCHASE')::integer AS initial_purchases,
  COUNT(*) FILTER (WHERE event_type = 'RENEWAL')::integer AS renewals,
  COUNT(*) FILTER (WHERE event_type = 'CANCELLATION')::integer AS cancellations,
  COUNT(*) FILTER (WHERE event_type = 'EXPIRATION')::integer AS expirations,
  COUNT(*) FILTER (WHERE event_type = 'PRODUCT_CHANGE')::integer AS product_changes,
  COUNT(*) FILTER (WHERE event_type = 'TEST')::integer AS test_events,
  COUNT(*) FILTER (WHERE array_length(processed_user_ids, 1) > 0)::integer AS processed_events,
  COUNT(*) FILTER (WHERE ignored_reason IS NOT NULL)::integer AS ignored_events,
  COUNT(*) FILTER (WHERE subscriber_sync_status = 'synced')::integer AS subscriber_syncs,
  COUNT(*) FILTER (WHERE subscriber_sync_status = 'error')::integer AS subscriber_sync_errors,
  COUNT(*) FILTER (WHERE subscriber_sync_status = 'not_configured')::integer AS subscriber_sync_not_configured,
  COUNT(*) FILTER (WHERE subscriber_sync_status = 'no_app_user_id')::integer AS subscriber_sync_no_app_user_id,
  COUNT(DISTINCT app_user_id) FILTER (WHERE app_user_id IS NOT NULL)::integer AS revenuecat_users
FROM public.revenuecat_events
GROUP BY 1;

CREATE OR REPLACE VIEW public.kpi_app_errors_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', created_at)::date AS metric_date,
  COALESCE(NULLIF(properties->>'source', ''), 'unknown') AS source,
  COALESCE(NULLIF(properties->>'error_category', ''), 'app_runtime') AS error_category,
  COALESCE(NULLIF(properties->>'error_name', ''), 'Error') AS error_name,
  COALESCE(NULLIF(properties->>'error_fingerprint', ''), NULLIF(properties->>'error_key', ''), 'unknown') AS error_fingerprint,
  CASE WHEN properties->>'fatal' = 'true' THEN true ELSE false END AS fatal,
  COUNT(*)::integer AS error_events,
  COUNT(DISTINCT COALESCE(NULLIF(properties->>'error_fingerprint', ''), NULLIF(properties->>'error_key', ''), 'unknown'))::integer AS error_groups,
  COUNT(DISTINCT user_id)::integer AS users_impacted,
  COUNT(DISTINCT session_id)::integer AS sessions_impacted
FROM public.analytics_events
WHERE name = 'app_error_captured'
GROUP BY 1, 2, 3, 4, 5, 6;

CREATE OR REPLACE VIEW public.kpi_app_release_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', created_at)::date AS metric_date,
  COALESCE(NULLIF(properties->>'platform', ''), 'unknown') AS platform,
  COALESCE(NULLIF(properties->>'app_version', ''), 'unknown') AS app_version,
  COALESCE(NULLIF(properties->>'native_build_version', ''), 'unknown') AS native_build_version,
  COALESCE(NULLIF(properties->>'runtime_version', ''), 'unknown') AS runtime_version,
  COUNT(*)::integer AS events,
  COUNT(DISTINCT user_id)::integer AS users,
  COUNT(DISTINCT session_id)::integer AS sessions,
  COUNT(*) FILTER (WHERE name = 'scan_analysis_started')::integer AS scan_starts,
  COUNT(*) FILTER (WHERE name = 'scan_analysis_completed')::integer AS scan_completions,
  COUNT(*) FILTER (WHERE name IN ('scan_analysis_failed', 'scan_analysis_timeout', 'barcode_not_found'))::integer AS scan_failures,
  COUNT(*) FILTER (WHERE name = 'paywall_viewed')::integer AS paywall_views,
  COUNT(*) FILTER (WHERE name = 'purchase_completed')::integer AS purchase_completions,
  COUNT(*) FILTER (WHERE name = 'purchase_entitlement_refreshed' AND properties->>'is_pro' = 'true')::integer AS purchase_entitlement_refresh_pro,
  COUNT(*) FILTER (WHERE name = 'app_error_captured')::integer AS app_errors,
  COUNT(*) FILTER (WHERE name = 'app_error_captured' AND properties->>'fatal' = 'true')::integer AS fatal_app_errors,
  ROUND(COUNT(*) FILTER (WHERE name = 'scan_analysis_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'scan_analysis_started'), 0), 4) AS scan_success_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'app_error_captured')::numeric / NULLIF(COUNT(DISTINCT session_id), 0), 4) AS app_errors_per_session
FROM public.analytics_events
GROUP BY 1, 2, 3, 4, 5;

REVOKE ALL ON TABLE public.kpi_event_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_daily_funnel FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_onboarding_path_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_user_lifecycle FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_activation_cohorts FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_share_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_app_review_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_support_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_retention_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_scan_usage_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_analysis_cache_health FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_scan_failures_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_paywall_source_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_paywall_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_paywall_pitch_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_revenuecat_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_app_errors_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_app_release_daily FROM PUBLIC;

REVOKE ALL ON TABLE public.kpi_event_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_daily_funnel FROM anon;
REVOKE ALL ON TABLE public.kpi_onboarding_path_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_user_lifecycle FROM anon;
REVOKE ALL ON TABLE public.kpi_activation_cohorts FROM anon;
REVOKE ALL ON TABLE public.kpi_share_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_app_review_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_support_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_retention_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_scan_usage_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_analysis_cache_health FROM anon;
REVOKE ALL ON TABLE public.kpi_scan_failures_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_paywall_source_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_paywall_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_paywall_pitch_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_revenuecat_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_app_errors_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_app_release_daily FROM anon;

REVOKE ALL ON TABLE public.kpi_event_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_daily_funnel FROM authenticated;
REVOKE ALL ON TABLE public.kpi_onboarding_path_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_user_lifecycle FROM authenticated;
REVOKE ALL ON TABLE public.kpi_activation_cohorts FROM authenticated;
REVOKE ALL ON TABLE public.kpi_share_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_app_review_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_support_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_retention_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_scan_usage_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_analysis_cache_health FROM authenticated;
REVOKE ALL ON TABLE public.kpi_scan_failures_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_paywall_source_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_paywall_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_paywall_pitch_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_revenuecat_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_app_errors_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_app_release_daily FROM authenticated;

GRANT SELECT ON TABLE public.kpi_event_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_daily_funnel TO service_role;
GRANT SELECT ON TABLE public.kpi_onboarding_path_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_user_lifecycle TO service_role;
GRANT SELECT ON TABLE public.kpi_activation_cohorts TO service_role;
GRANT SELECT ON TABLE public.kpi_share_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_app_review_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_support_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_retention_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_scan_usage_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_analysis_cache_health TO service_role;
GRANT SELECT ON TABLE public.kpi_scan_failures_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_paywall_source_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_paywall_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_paywall_pitch_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_revenuecat_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_app_errors_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_app_release_daily TO service_role;
