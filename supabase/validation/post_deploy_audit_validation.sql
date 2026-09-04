-- Woof audit post-deploy validation.
-- Run this after applying migrations 058-070 and 265 to the linked Supabase project.
-- Every row should return pass = true before TestFlight or production release.

with expected_migrations(migration_key) as (
  values
    ('058'),
    ('059'),
    ('060'),
    ('061'),
    ('062'),
    ('063'),
    ('064'),
    ('065'),
    ('066'),
    ('067'),
    ('068'),
    ('069'),
    ('070'),
    ('265'),
    ('290'),
    ('291'),
    ('292'),
    ('293'),
    ('294')
),
expected_tables(table_name) as (
  values
    ('analytics_events'),
    ('scan_usage_events'),
    ('revenuecat_events')
),
expected_columns(table_name, column_name) as (
  values
    ('scan_history', 'safety_level'),
    ('profiles', 'revenuecat_app_user_id'),
    ('profiles', 'revenuecat_product_id'),
    ('profiles', 'revenuecat_store'),
    ('profiles', 'revenuecat_environment'),
    ('profiles', 'revenuecat_entitlement_ids'),
    ('profiles', 'revenuecat_last_event_id'),
    ('profiles', 'revenuecat_last_event_type'),
    ('profiles', 'revenuecat_last_event_at'),
    ('profiles', 'revenuecat_subscriber_synced_at'),
    ('profiles', 'revenuecat_management_url'),
    ('revenuecat_events', 'subscriber_sync_status'),
    ('revenuecat_events', 'subscriber_sync_error'),
    ('revenuecat_events', 'subscriber_synced_at'),
    ('revenuecat_events', 'subscriber_app_user_id'),
    ('scan_usage_events', 'reversed'),
    ('scan_usage_events', 'reversed_at'),
    ('scan_usage_events', 'reversal_reason')
),
expected_functions(signature) as (
  values
    ('public.check_rate_limit(uuid,integer,integer)'),
    ('public.consume_scan(uuid,text,text,integer)'),
    ('public.reverse_scan(uuid,text,text)'),
    ('public.increment_cache_hit(text)'),
    ('public.delete_own_account()'),
    ('public.cleanup_expired_cache()'),
    ('public.cleanup_stale_rate_limits()'),
    ('public.catalog_strip_trailing_formula_code(text)'),
    ('public.catalog_split_ingredient_statement(text)')
),
expected_views(view_name) as (
  values
    ('kpi_event_daily'),
    ('kpi_daily_funnel'),
    ('kpi_user_lifecycle'),
    ('kpi_activation_cohorts'),
    ('kpi_share_daily'),
    ('kpi_app_review_daily'),
    ('kpi_support_daily'),
    ('kpi_retention_daily'),
    ('kpi_scan_usage_daily'),
    ('kpi_analysis_cache_health'),
    ('kpi_scan_failures_daily'),
    ('kpi_paywall_source_daily'),
    ('kpi_paywall_daily'),
    ('kpi_paywall_pitch_daily'),
    ('kpi_revenuecat_daily'),
    ('kpi_apple_search_ads_attribution_daily'),
    ('kpi_paid_acquisition_readiness_daily'),
    ('kpi_app_errors_daily'),
    ('kpi_app_release_daily')
),
expected_view_columns(view_name, column_name) as (
  values
    ('kpi_daily_funnel', 'scan_completions_with_upload'),
    ('kpi_daily_funnel', 'analysis_image_retry_suppressions'),
    ('kpi_daily_funnel', 'completed_scan_upload_attempts'),
    ('kpi_daily_funnel', 'completed_image_upload_attempts'),
    ('kpi_daily_funnel', 'completed_scan_upload_estimated_bytes'),
    ('kpi_daily_funnel', 'avg_completed_scan_upload_estimated_bytes'),
    ('kpi_daily_funnel', 'fresh_scan_completions_with_upload'),
    ('kpi_daily_funnel', 'fresh_completed_scan_upload_attempts'),
    ('kpi_daily_funnel', 'fresh_completed_image_upload_attempts'),
    ('kpi_daily_funnel', 'fresh_completed_scan_upload_estimated_bytes'),
    ('kpi_daily_funnel', 'avg_fresh_completed_scan_upload_estimated_bytes'),
    ('kpi_daily_funnel', 'matched_image_uploads_per_completed_scan'),
    ('kpi_daily_funnel', 'matched_upload_bytes_per_completed_scan'),
    ('kpi_daily_funnel', 'matched_image_uploads_per_fresh_scan'),
    ('kpi_daily_funnel', 'matched_upload_bytes_per_fresh_scan'),
    ('kpi_daily_funnel', 'photo_capture_completions'),
    ('kpi_daily_funnel', 'avg_photo_capture_base64_length'),
    ('kpi_daily_funnel', 'avg_photo_capture_estimated_decoded_bytes'),
    ('kpi_daily_funnel', 'avg_photo_capture_optimization_step'),
    ('kpi_daily_funnel', 'avg_photo_capture_target_width'),
    ('kpi_daily_funnel', 'history_compare_opens'),
    ('kpi_daily_funnel', 'history_compare_result_opens'),
    ('kpi_daily_funnel', 'history_compare_result_open_rate'),
    ('kpi_retention_daily', 'history_compare_opens'),
    ('kpi_retention_daily', 'history_compare_result_opens'),
    ('kpi_retention_daily', 'compare_result_open_rate'),
    ('kpi_apple_search_ads_attribution_daily', 'collection_requests'),
    ('kpi_apple_search_ads_attribution_daily', 'collection_failures'),
    ('kpi_apple_search_ads_attribution_daily', 'collection_failure_rate'),
    ('kpi_paid_acquisition_readiness_daily', 'apple_search_ads_collection_requests'),
    ('kpi_paid_acquisition_readiness_daily', 'apple_search_ads_collection_failures'),
    ('kpi_paid_acquisition_readiness_daily', 'paywall_view_to_expected_package_load_rate'),
    ('kpi_paid_acquisition_readiness_daily', 'app_error_session_rate')
),
expected_no_anon_execute(signature) as (
  values
    ('public.increment_cache_hit(text)'),
    ('public.log_product_event(text,text,jsonb)'),
    ('public.search_products(text,integer)'),
    ('public.delete_own_account()'),
    ('public.get_human_food_count_today(uuid)'),
    ('public.increment_human_food_count(uuid)'),
    ('public.increment_scan_count(uuid)'),
    ('public.consume_scan(uuid,text,text,integer)'),
    ('public.reverse_scan(uuid,text,text)'),
    ('public.catalog_strip_trailing_formula_code(text)'),
    ('public.catalog_split_ingredient_statement(text)')
),
checks as (
  select
    'migration' as section,
    migration_key as check_name,
    'applied' as expected,
    case when exists (
      select 1
      from supabase_migrations.schema_migrations sm
      where sm.version = expected_migrations.migration_key
        or sm.name like ('%_' || expected_migrations.migration_key || '_%')
        or (
          expected_migrations.migration_key = '290'
          and sm.name = 'secure_scan_entitlement_rpcs'
        )
        or (
          expected_migrations.migration_key = '291'
          and sm.name = 'optimize_user_rls_policies'
        )
        or (
          expected_migrations.migration_key = '292'
          and sm.name = 'normalize_catalog_ingredient_groups'
        )
        or (
          expected_migrations.migration_key = '293'
          and sm.name = 'remove_embedded_catalog_formula_codes'
        )
        or (
          expected_migrations.migration_key = '294'
          and sm.name = 'demote_verified_statement_array_mismatches'
        )
    ) then 'applied' else 'missing' end as actual,
    exists (
      select 1
      from supabase_migrations.schema_migrations sm
      where sm.version = expected_migrations.migration_key
        or sm.name like ('%_' || expected_migrations.migration_key || '_%')
        or (
          expected_migrations.migration_key = '290'
          and sm.name = 'secure_scan_entitlement_rpcs'
        )
        or (
          expected_migrations.migration_key = '291'
          and sm.name = 'optimize_user_rls_policies'
        )
        or (
          expected_migrations.migration_key = '292'
          and sm.name = 'normalize_catalog_ingredient_groups'
        )
        or (
          expected_migrations.migration_key = '293'
          and sm.name = 'remove_embedded_catalog_formula_codes'
        )
        or (
          expected_migrations.migration_key = '294'
          and sm.name = 'demote_verified_statement_array_mismatches'
        )
    ) as pass
  from expected_migrations

  union all

  select
    'table',
    table_name,
    'exists',
    case when to_regclass('public.' || table_name) is not null then 'exists' else 'missing' end,
    to_regclass('public.' || table_name) is not null
  from expected_tables

  union all

  select
    'column',
    table_name || '.' || column_name,
    'exists',
    case when exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = expected_columns.table_name
        and c.column_name = expected_columns.column_name
    ) then 'exists' else 'missing' end,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = expected_columns.table_name
        and c.column_name = expected_columns.column_name
    )
  from expected_columns

  union all

  select
    'function',
    signature,
    'exists',
    case when to_regprocedure(signature) is not null then 'exists' else 'missing' end,
    to_regprocedure(signature) is not null
  from expected_functions

  union all

  select
    'view',
    view_name,
    'exists',
    case when exists (
      select 1
      from information_schema.views v
      where v.table_schema = 'public'
        and v.table_name = expected_views.view_name
    ) then 'exists' else 'missing' end,
    exists (
      select 1
      from information_schema.views v
      where v.table_schema = 'public'
        and v.table_name = expected_views.view_name
    )
  from expected_views

  union all

  select
    'view_column',
    view_name || '.' || column_name,
    'exists',
    case when exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = expected_view_columns.view_name
        and c.column_name = expected_view_columns.column_name
    ) then 'exists' else 'missing' end,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = expected_view_columns.view_name
        and c.column_name = expected_view_columns.column_name
    )
  from expected_view_columns

  union all

  select
    'profile_privilege',
    'authenticated cannot mutate entitlement columns',
    'zero risky grants',
    count(*)::text,
    count(*) = 0
  from information_schema.column_privileges cp
  where cp.table_schema = 'public'
    and cp.table_name = 'profiles'
    and cp.grantee = 'authenticated'
    and cp.privilege_type in ('INSERT', 'UPDATE')
    and (
      cp.column_name in ('scan_count', 'is_pro', 'pro_expires_at')
      or cp.column_name like 'revenuecat_%'
    )

  union all

  select
    'profile_privilege',
    'authenticated can update user-owned pet profile columns',
    '2 required grants',
    count(distinct cp.column_name)::text,
    count(distinct cp.column_name) = 2
  from information_schema.column_privileges cp
  where cp.table_schema = 'public'
    and cp.table_name = 'profiles'
    and cp.grantee = 'authenticated'
    and cp.privilege_type = 'UPDATE'
    and cp.column_name in ('pet_profile', 'updated_at')

  union all

  select
    'profile_privilege',
    'anon cannot update user-owned pet profile columns',
    'zero grants',
    count(*)::text,
    count(*) = 0
  from information_schema.column_privileges cp
  where cp.table_schema = 'public'
    and cp.table_name = 'profiles'
    and cp.grantee = 'anon'
    and cp.privilege_type = 'UPDATE'
    and cp.column_name in ('pet_profile', 'updated_at')

  union all

  select
    'function_privilege',
    signature || ' anon execute',
    'false',
    coalesce(has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), false)::text,
    coalesce(has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), false) = false
  from expected_no_anon_execute

  union all

  select
    'function_privilege',
    signature || ' authenticated execute',
    'true',
    coalesce(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), false)::text,
    coalesce(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), false) = true
  from (
    values
      ('public.consume_scan(uuid,text,text,integer)'),
      ('public.delete_own_account()'),
      ('public.increment_cache_hit(text)')
  ) as expected_authenticated_execute(signature)

  union all

  select
    'catalog_contract',
    'verified ingredient arrays match exact statements',
    '0',
    count(*)::text,
    count(*) = 0
  from public.product_data
  where public.catalog_quality_state(
    pet_type,
    is_complete_food,
    catalog_exclusion_reason,
    ingredient_text,
    ingredient_count,
    ingredient_verification_status,
    image_url,
    image_verification_status,
    source_url,
    expires_at
  ) = 'verified_ready'
    and ingredients is distinct from public.catalog_split_ingredient_statement(ingredient_text)

  union all

  select
    'advisor_hardening',
    'is_likely_non_product_catalog_row search_path',
    'search_path=public',
    coalesce(array_to_string(p.proconfig, ','), 'missing'),
    p.oid is not null
      and exists (
        select 1
        from unnest(p.proconfig) as config(value)
        where config.value in ('search_path=public', 'search_path=public')
          or config.value like 'search_path=%public%'
      )
  from (select to_regprocedure('public.is_likely_non_product_catalog_row(text,text)') as oid) target
  left join pg_proc p on p.oid = target.oid
)
select section, check_name, expected, actual, pass
from checks
order by pass, section, check_name;
