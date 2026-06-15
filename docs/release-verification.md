# Release Verification Runbook

Last updated: June 12, 2026

This runbook covers checks that require production logs, real devices, App Store Connect, RevenueCat, or deployed Edge Function configuration. Run `npm run test:guards`, `npm run check:config`, `npm run check:edge`, `npm audit --audit-level=moderate`, `npm ci --dry-run`, `supabase db lint --local`, and `npx expo-doctor --verbose` before starting manual release verification.

## Runtime Schema Contract

After deploying migrations, confirm migration `043_refresh_runtime_schema_contract.sql` ran and sent `NOTIFY pgrst, 'reload schema'`.

1. Confirm `scan_history.analysis_payload` and `scan_history.safety_level` are visible to PostgREST by signing in, completing one human-food history entry, and verifying the app no longer logs `analysis_payload` schema-cache errors.
2. Confirm the `log_product_event` RPC is visible in both supported argument orders by triggering one scan or search event and verifying the app no longer logs `Could not find the function public.log_product_event`.
3. Confirm analytics failures remain non-blocking by temporarily disabling the event call in a test build or watching a denied RPC path; scans and score rendering must still complete.

## User OCR Catalog Ingestion

Use a production or release-candidate build pointed at the deployed Supabase project.

1. Scan at least five real pet-food packages that require ingredient-label recovery.
2. Include both dog and cat products, a clear ingredient panel, and one intentionally low-quality label photo.
3. Confirm Supabase Edge logs include `[ANALYZE_AUDIT]` events with `event: "user_ocr_catalog_ingestion"`.
4. Confirm successful label-photo scans produce `outcome: "saved"` only after a completed analysis, and poor inputs produce `outcome: "skipped"` with a reason such as `few_ingredients` or `short_ingredient_text`.
5. Confirm audit logs do not contain product names, cache keys, image data, raw ingredient text, or user identifiers.
6. In `product_data`, spot-check saved rows have `source = 'user_ocr'`, at least five ingredients, a sane ingredient count, and did not overwrite higher-trust OPFF or scraped rows.

## RevenueCat And App Store Sandbox

Use a real iOS device with a sandbox Apple ID and the release-candidate build configured with the production iOS RevenueCat key.

1. Open Paywall while signed out and signed in; confirm offerings load with real localized prices and unavailable plans remain disabled.
2. Start a purchase and cancel from the App Store sheet; confirm the UI returns to an idle state and `product_events` records `purchase_started` then `purchase_cancelled`.
3. Complete a sandbox purchase; confirm Pro unlocks, `checkProStatus()` remains true after app restart, RevenueCat shows the expected App User ID, and `product_events` records `purchase_completed`.
4. Sign out, sign in as a different account, and confirm RevenueCat identity changes rather than leaking the previous entitlement.
5. Restore purchases on the original account; confirm Pro unlocks and `product_events` records `restore_started` then `restore_completed`.
6. If RevenueCat returns a purchase or restore without the `pro` entitlement, confirm the app shows support guidance and records `purchase_no_entitlement` or `restore_no_entitlement`.
7. Configure the RevenueCat webhook URL to the deployed `revenuecat-webhook` Edge Function with the `Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH_TOKEN>` header.
8. Send a RevenueCat dashboard test event and confirm the function returns success without changing `profiles.is_pro`.
9. Complete and restore a sandbox purchase, then confirm the webhook syncs `profiles.is_pro = true` and `pro_expires_at` for the Supabase user id shown as the RevenueCat App User ID.
10. Let a sandbox subscription expire or replay an expiration event, then confirm the webhook syncs `profiles.is_pro = false` before the next analyze quota check.

## Completed Quota Accounting

Use a fresh non-Pro account and deployed Edge Function logs.

1. Confirm every primary analysis request from the new build sends `serverQuotaAccounting: true`; helper requests for identify, OCR, and ingredient lookup must not.
2. Complete one streaming pet-food scan and confirm `[ANALYZE_AUDIT]` logs `event: "completed_quota_accounting"`, `outcome: "committed"`, and `rpcName: "increment_scan_count"`.
3. Force or observe a non-streaming fallback success and confirm the same single quota commit occurs after schema validation.
4. Repeat a scan that is served from a schema-valid Edge pre-call cache hit and confirm quota still commits before the cached result is returned.
5. Complete one human-food check and confirm `rpcName: "increment_human_food_count"`.
6. Confirm Pro users, guests, and old clients without `serverQuotaAccounting` produce skipped audit events with `reason: "pro"`, `reason: "guest"`, or `reason: "client_opt_out"` rather than duplicate commits.

## Edge CORS Configuration

Native app calls do not send an `Origin` header and should continue to work without browser CORS configuration. Any production browser or web client that calls `analyze` or `product-lookup` must set `ALLOWED_CORS_ORIGINS` to the exact HTTPS origins, comma-separated, before release.

## App Store Listing

Before submission, review App Store Connect metadata and screenshots against the current app behavior:

1. Front-package scan is the primary flow; ingredient-label capture is a fallback.
2. Human-food language describes AI safety estimates, not veterinary advice.
3. Legal and privacy claims match the June 8, 2026 Terms and Privacy copy.
4. Subscription copy does not hardcode stale prices or imply every plan has a trial.
5. Screenshots do not show unsupported tablet layouts, saved scan photos, or obsolete "live scan" language.
