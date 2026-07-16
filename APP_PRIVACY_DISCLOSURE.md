# Woof App Privacy Disclosure

Last updated: 2026-06-29.

This is the working App Store Connect privacy-label inventory for Woof. It is based on the current worktree, not legal advice. Before publishing, the Account Holder, Admin, or App Manager should confirm these answers in App Store Connect and with counsel.

## Source Guidance

- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple App Store Connect app privacy management: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Apple support explanation of privacy labels: https://support.apple.com/en-us/102399
- Apple WWDC22 "Create your Privacy Nutrition Label": https://developer.apple.com/videos/play/wwdc2022/10167/
- RevenueCat Apple App Privacy guidance: https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy

Apple says App Store Connect responses must include data collected by the app and by third-party partners whose code or services are integrated into the app. RevenueCat says apps using RevenueCat must disclose Purchase History, and if a custom app user ID can be tied back to a user's account or contact data, Purchase History should be marked linked to identity.

## Current Data Flow Summary

Woof creates a Supabase user for guest or signed-in use, sends pet-food and human-food scan requests through Supabase Edge Functions, processes images and product data with Anthropic Claude and Open Pet Food Facts where applicable, stores account/history/analytics/subscription state in Supabase, manages purchases through RevenueCat, and requests Apple Search Ads attribution collection through RevenueCat on iOS.

Current first-party data stores and evidence:

- `public.profiles`: Supabase user id, display name, avatar URL, email, provider, Pro state, RevenueCat app user id/product/store/environment/entitlement metadata.
- `public.scan_history`: per-user product or food name, score or safety level, pet type, scan date, scan mode, data source, cache key, local `photo_uri` reference.
- `public.analytics_events`: user id, session id, event name, redacted event properties, app version/build/runtime/platform/execution context from `services/analytics.js`.
- `public.scan_usage_events` and `public.rate_limits`: scan usage, scan mode, free-scan enforcement, abuse throttling, reversal state.
- `public.revenuecat_events`: RevenueCat webhook event ids, app user ids, aliases, transaction/product/entitlement fields, raw webhook payload, subscriber sync status. Apple Search Ads campaign/ad group/keyword attribution is handled in RevenueCat charts and downstream RevenueCat attribution integrations, not copied into Woof's Supabase tables.
- `public.analysis_cache`: shared cache key, analysis JSON, OPFF data, hit counts, and expiry. It has no `user_id`, but scan history and analytics can still link user activity to specific scans.
- Local AsyncStorage: scan history/result replay cache, analytics queue/session id, scoped scan-count cache. `delete_own_account` and the client delete flow clear linkable server and local stores.

Current third-party processors:

- Supabase: authentication, database, Edge Functions, operational storage.
- Anthropic Claude: AI analysis of label photos and food-safety images sent through the `analyze` Edge Function.
- RevenueCat: subscription purchase validation, entitlements, subscriber profile sync, webhook events, customer history/charts, and Apple Search Ads attribution measurement.
- Apple App Store and Google Play: app-store purchase processing and subscription management.
- Apple Ads / AdServices: iOS install attribution token source for Apple Search Ads measurement through RevenueCat. No IDFA is used.
- Apple Sign In and Google Sign In: optional account linking/sign-in.
- Open Pet Food Facts: pet food barcode/name lookup and product enrichment.
- Sentry: native crash and error reporting through `@sentry/react-native`; Woof initializes Sentry with `sendDefaultPii: false`, tracing disabled by default, and an event scrubber for emails, URLs, file paths, JWT-like values, secret-looking tokens, and long opaque strings.

## Recommended App Store Connect Answers

Initial question: Yes, we collect data from this app.

Data Used to Track You: No.

Rationale: the current worktree does not use IDFA, retargeting SDKs, data brokers, or cross-app advertising measurement. It does collect Apple Search Ads attribution through Apple's AdServices framework and RevenueCat for first-party campaign analytics. Keep `Tracking` as No only while this remains limited to Apple Search Ads attribution without IDFA or data sharing for third-party tracking.

### Data Linked to You

| App Store data type | Collected? | Linked to user? | Used for tracking? | Purposes | Woof evidence |
| --- | --- | --- | --- | --- | --- |
| Name | Yes, if the user saves an account with Apple or Google | Yes | No | App Functionality | `profiles.display_name`, Apple/Google auth metadata |
| Email Address | Yes, if the user saves an account with Apple or Google or sends support email | Yes | No | App Functionality, Customer Support | `profiles.email`, support mail flow |
| User ID | Yes | Yes | No | App Functionality, Analytics | Supabase `auth.users.id`, `analytics_events.user_id`, RevenueCat app user id |
| Purchase History | Yes | Yes | No | App Functionality, Analytics | RevenueCat SDK, `revenuecat_events`, `profiles.revenuecat_*` |
| Photos or Videos | Yes, for pet-food label and human-food scans | Yes, conservatively | No | App Functionality | `services/claude.js`, `supabase/functions/analyze/index.ts`; images are transmitted for analysis and not permanently stored by Woof |
| Other User Content | Yes | Yes | No | App Functionality, Analytics | Scan results/history: product or food name, pet type, scores, safety level, ingredients, analysis |
| Customer Support Data | Yes, only when the user chooses Contact Support or emails support | Yes | No | App Functionality, Customer Support | Profile support mailto with app/platform/account diagnostics |
| Product Interaction | Yes | Yes | No | Analytics, App Functionality | `analytics_events` funnel, paywall, purchase, share, review, support, scan events |
| Advertising Data | Yes, for Apple Search Ads attribution on iOS | Yes, through RevenueCat subscriber/customer analytics | No | Analytics | RevenueCat Apple Ads Services integration, Apple AdServices attribution token, campaign/ad group/keyword attribution in RevenueCat |
| Other Usage Data | Yes | Yes | No | Analytics, App Functionality | scan usage, scan limits, cache-hit/fresh-scan signals, rate-limit usage |
| Performance Data | Yes | Yes, when recorded through account-linked analytics | No | Analytics, App Functionality | upload byte estimates, request timing/status, package-load diagnostics |
| Other Diagnostic Data | Yes | Yes, when recorded through account-linked analytics or Sentry release/session context | No | Analytics, App Functionality | `app_error_captured` category/fingerprint, Edge/function error diagnostics, RevenueCat sync failures, Sentry native crash/error reports |
| Other Data Types | Yes | Yes, where tied to user/account | No | App Functionality, Analytics | barcode/product lookup terms, cache keys, entitlement/rate-limit operational data |

### Data Not Linked to You

The shared `analysis_cache` table is intended as product-level cache data and does not store `user_id`. Do not rely on this as a separate "Data Not Linked to You" label entry without legal review, because the same product/food scan can also appear in user-linked `scan_history` and `analytics_events`.

### Additional Collected Diagnostics

- Crash Data: Yes. Sentry native crash/error reporting is installed through `@sentry/react-native`; crash reports should be disclosed as Diagnostics and are used for App Functionality and Analytics, not tracking.

### Currently Not Collected

- Location: No.
- Contacts: No.
- Browsing History: No.
- Device ID: No IDFA or advertising identifier collection is added. Apple AdServices attribution token collection is disclosed above as Advertising Data; re-check third-party SDK privacy manifests before submission.
- Payment Info: No. App Store / Google Play payment details are entered outside Woof; Woof receives purchase/subscription status, not payment card data.
- Credit Info: No.
- Other Financial Info: No.
- Health & Fitness: No. Woof analyzes pet food and pet safety, not human health/fitness records. Revisit this if users can enter human health, medical, allergy, or biometric information.
- Sensitive Info: No.
- Audio Data: No.
- Emails or Text Messages: No in-app private messaging. User-initiated support email content is Customer Support Data.
- Search History: No typed/open search feature today. Barcode/name lookup data is covered above as Other Data Types or Other User Content; if App Store review treats product lookups as searches performed in the app, disclose Search History as linked to the user.

## Privacy Policy Alignment

The hosted privacy policy should continue to say:

- Camera images are sent for analysis and are not stored permanently by Woof.
- Scan history is associated with the guest profile or signed-in account.
- Guest/account identifiers, optional name/email, subscription state, operational logs, and support diagnostics are collected for app functionality, reliability, support, and analytics.
- The app does not track users across other apps or websites and does not sell/share personal data with advertisers. Apple Search Ads attribution is used for Woof campaign analytics through RevenueCat.
- Users can delete account data from Profile; server-side cleanup includes `profiles`, `scan_history`, `analytics_events`, `scan_usage_events`, `rate_limits`, and linkable `revenuecat_events`.

## App Store Connect Entry Checklist

1. Open App Store Connect > Woof > App Privacy.
2. Select "Yes, we collect data from this app."
3. Add the linked data types above and mark purposes exactly as App Functionality and Analytics unless counsel confirms a narrower answer.
4. For tracking, answer No while there is no IDFA, ad SDK, retargeting, data broker sharing, or cross-app advertising measurement.
5. Confirm the privacy policy URL points to the current hosted privacy page.
6. Publish the App Privacy responses before submitting the next production build.
7. Save a screenshot or export of the final Product Page Preview with the release evidence.

## Update Triggers

Update this file, App Store Connect, hosted privacy policy, and `npm run check:privacy` expectations before shipping any of these changes:

- Changing Sentry behavior, enabling tracing/session replay/log capture, or adding another crash/performance SDK.
- Adding ad attribution beyond Apple Search Ads standard attribution, retargeting, IDFA, SKAdNetwork-only ad partners with extra SDK data, or marketing analytics.
- Adding RevenueCat customer attributes that include email, name, phone, or custom identifiers beyond the Supabase user id.
- Adding pet profiles, allergies, reminders, favorites, watchlists, recall alerts, or personalization that changes retained user content.
- Storing original uploaded images in Supabase Storage or another durable store.
- Adding location, contacts, photo library access, audio, free-form notes, or notifications with user-specific content.
- Adding new third-party SDKs or changing Supabase/Anthropic/RevenueCat/Open Pet Food Facts data handling.
