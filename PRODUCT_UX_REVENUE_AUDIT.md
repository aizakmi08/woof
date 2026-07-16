# Product UX And Revenue Audit

Last updated: 2026-06-17.

This audit reviews the current in-app product journey from the local worktree, with a narrow goal: find the highest-impact UX changes that can increase first completed scans, Pro conversion, account saving, sharing, ratings, and retention without adding unsupported health or source claims.

## Source Evidence

- `App.js`: first launch now mounts `AuthProvider` while onboarding is visible, so automatic anonymous auth can warm before the user scans.
- `screens/OnboardingScreen.js`: the first onboarding page has a primary `Scan Product` path, reinforces no-account scanning, 3 free scans, pet-food and human-food use cases, and keeps the three-page education flow available through `How Woof works`.
- `services/auth.js`: cold start attempts an automatic anonymous Supabase session; `AuthScreen` remains as fallback when no user exists.
- `screens/AuthScreen.js`: Apple, Google, and "Continue as Guest" options remain available.
- `screens/HomeScreen.js`: primary scan CTA, human-food CTA, upgrade banner, inline empty-state scan actions, recent-history list capped at 10 rows, and a two-product compare card for scored pet-food history.
- `screens/ScannerScreen.js`: mode-aware permission, instruction, help, and capture-processing copy for pet-food versus human-food scans.
- `screens/ResultsScreen/index.js` and `screens/ResultsScreen/components.js`: first-scan toast, scan-limit banner, free result preview, Pro gate, post-scan prompt, guest-save prompt, review prompt, and share card.
- `screens/PaywallScreen.js`: source-specific paywall copy, monthly-default plan selection, RevenueCat-backed package prices, trial disclosure, restore, legal links, and dismissal analytics.
- `screens/ProfileScreen.js`: guest account saving, subscription management, restore purchases, rating, support, legal, sign-out, and delete controls.
- Supporting artifacts: `APP_STORE_CONNECT_AUDIT.md`, `REVENUECAT_EXPERIMENT_PLAN.md`, `GROWTH_CREATIVE_PLAN.md`, `KPI_FRAMEWORK.md`, and `WEEKLY_REVIEW_RUNBOOK.md`.
- `supabase/migrations/065_kpi_reporting_views.sql`: daily funnel metrics now connect scan completion, cache rate, optimized capture size, image upload attempts, and matched upload bytes so scan-cost work can be reviewed before growth spend.

## Executive Readout

Woof now has much stronger revenue plumbing than the live-store baseline: anonymous sessions, server-side free-scan enforcement, RevenueCat sync, source-specific paywall analytics, share links, review prompts, and support loops. The product problem is now less about missing mechanics and more about sequencing.

The current worktree now supports a faster first-run path: `install -> onboarding Scan Product -> automatic guest session -> scanner -> first result -> result gate`. The longer education path still exists for users who tap `How Woof works`, but the default first-screen action is now scan intent.

Most important opportunity now shifts from wiring scan-first mechanics to validating whether `onboarding_scan_now_tapped` improves first scan starts and completed results without hurting camera permission, scan quality, or Pro conversion.

## Journey Map

### Fresh Install

Current flow:

1. App checks `@woof_onboarding_complete`.
2. `AuthProvider` mounts while onboarding is visible and starts automatic anonymous sign-in in the background.
3. The first onboarding screen offers `Scan Product` as the primary action, reinforces no-account scanning, 3 free scans, pet-food and human-food use cases, and keeps `How Woof works` as the education path.
4. `Scan Product` marks onboarding complete and opens `Scanner` as the initial app route once auth is ready.
5. If automatic anonymous auth fails, `AuthScreen` still asks for Apple, Google, or guest continuation before the pending scanner route can mount.

Growth implication: the app now has a real scan-first path while preserving the existing education and fallback auth paths.

### First Scan

Current flow:

1. Home scan CTA checks `canScan()`.
2. Scanner captures photo or barcode.
3. Results show score, quick stats, verdict, and first ingredients for free users.
4. Free users see `ScanLimitBanner`, `FirstScanToast`, and `ProGateOverlay`.
5. Anonymous users can see a contextual guest-save prompt after scan value is delivered.
6. After 2 or more scans, free users may see `PostScanPrompt`.

Growth implication: this is a good base. It gives some value before asking for money, and the worktree now has a better account-saving moment immediately after useful scan history exists.

### Upgrade Moment

Current flow:

1. Upgrade can be requested from result gate, scan limit, post-scan prompt, home banner, or profile.
2. Paywall headline and feature rows adapt by source.
3. RevenueCat packages drive price, period, savings, and trial disclosure.
4. Dismissal, package-load, plan-selection, purchase, restore, and entitlement-refresh events are tracked.

Growth implication: this is ready for controlled testing after deployment. The biggest remaining paywall issue is not the purchase code; it is the product moment and copy context that send users there.

### Retention

Current flow:

1. Home keeps the recent scan list fast, but users can now search saved scans, filter pet-food versus human-food results, and expand beyond the first 10 rows.
2. History rows are useful, and the first repeat-shopping surface now includes both search/filter recovery and a two-product comparison card.
3. There is still no heavier saved product, pet profile, alert, or "next best scan" loop.
4. Profile has save-account, restore, rating, support, and legal paths.

Growth implication: Woof answers urgent questions well, but it does not yet create a repeat shopping workflow. Retention should focus on pet profiles, saved products, compare mode, and reminders only after the first-scan path is stable.

## Priority Findings

### Fixed In Worktree - First-run now has a scan-first path

Evidence:

- `App.js` now wraps onboarding and the main navigator in `AuthProvider`.
- `OnboardingScreen.js` primary first-page action is `Scan Product`; it tracks `onboarding_scan_now_tapped`, marks onboarding complete, and requests `Scanner` as the next route.
- The longer education path remains available through `How Woof works`.

Impact:

- App Store traffic can now move from first-run intent to camera faster without bypassing anonymous auth, scan limits, history, or analytics.
- This should improve install-to-first-scan-start rate if camera permission and scan-quality copy are clear enough.

Validation:

- Confirm clean install starts anonymous auth while onboarding is visible.
- Tap `Scan Product` and confirm Scanner is the first mounted app route after auth readiness.
- Confirm `onboarding_scan_now_tapped`, `onboarding_completed` with `completion_method=scan_now`, and the first scan events all carry release/build context.

Success metric:

- Increase install-to-first-scan-start rate and install-to-first-completed-result rate without increasing analysis failures, camera denial, or support contacts.

### Fixed In Worktree - App Store value props are now reinforced in onboarding

Evidence:

- Onboarding first-page copy now says `Scan first, no account required`.
- The first-page body now promises `3 free scans` for pet food labels and human-food questions, then saving results when the user is ready.
- The first page includes compact supporting cues for `3 free scans`, `Pet food labels`, `Human-food checks`, and `Save results later`.
- App Store and growth artifacts lean heavily on no-account/free-scan and human-food use cases, so the first-run screen now matches the acquisition promise more closely.

Impact:

- Users see the strongest differentiators before making the first scan decision.
- Human-food checks and deferred account saving are introduced without adding another onboarding step.

Validation:

- Confirm the first screen keeps `Scan Product` as the primary CTA and `How Woof works` as the education path.
- Confirm the value cues fit on small iPhone widths without crowding the primary CTA.
- Keep medical and safety caveats visible in result surfaces, not as scary onboarding friction.

Success metric:

- Improve onboarding completion rate and first scan rate. Watch camera permission acceptance and scan cancellation rate to make sure faster onboarding does not create confusion.

### Fixed In Worktree - Home empty state now has inline scan actions

Evidence:

- `HomeScreen` renders primary scan and human-food CTAs above the history section.
- `EmptyState` now includes inline `Scan Product` and `Check Human Food` actions plus a `3 free scans included` note for free users.
- Empty-state taps reuse the same `canScan()` and `paywall_requested` paths as the top CTAs and record `source_surface: "home_empty_state"`.
- Home now shows free users a compact remaining-scan status nudge after the scan CTAs; taps are tracked as `free_scan_status_tapped` with `source_surface: "home_free_scan_status"` and route to the existing `home_banner` paywall source.
- `FlatList` data is `history.slice(0, 10)`.

Impact:

- Empty history now has a direct action path, which should reduce friction for first scan starts.
- The remaining retention gap is the limited history surface, not the empty-state activation CTA.

Validation:

- Confirm empty-state pet-food and human-food taps emit `scan_cta_tapped` with `source_surface: "home_empty_state"`.
- Confirm scan-limit blocks from the empty state route to the paywall with the same source surface.

Success metric:

- Increase empty-state CTA tap rate and first scan starts, while keeping scan-limit paywall requests attributable by source.

### Fixed In Worktree - Results now has a contextual guest-save prompt

Evidence:

- `ProfileScreen` shows guest users "Save Your Scans" and Apple/Google save buttons.
- `ResultsScreen` now shows `GuestSavePrompt` after a successful anonymous scan when the first-scan toast, post-scan prompt, and review prompt are not active; the prompt's seen state is scoped to the current guest/account.
- The prompt tracks `guest_save_prompt_viewed`, provider taps, completion, cancellation, dismissal, and failure from the result context.

Impact:

- A guest user now sees account saving at the moment scan history has value instead of only inside Profile.
- This should improve guest-to-linked-account rate while keeping Profile as the durable account-management location.

Validation:

- Confirm the guest-save prompt appears after successful anonymous pet-food and human-food scans for the current guest/account, but not for history results, signed-in users, errors, or active loading states.
- Confirm it does not stack with the first-scan toast, post-scan Pro prompt, or app-review prompt.

Success metric:

- Increase guest-to-linked-account rate and reduce lost-history support contacts without reducing paywall conversion.

### Fixed In Worktree - Human-food mode copy is now mode-specific

Evidence:

- `ScannerScreen` instruction text changes to "Point at the food item" for human-food mode.
- The scanner instruction pill now includes a second capture-tip line such as `Good light • fill the frame • hold steady` or `Good light • label readable • hold steady`.
- Tapping scanner help emits `scanner_help_opened` with `scan_mode`, `fallback_to_photo`, `pet_type`, and the shown `capture_tip`.
- The capture processing card now says `Checking food safety...` for human-food mode and `Analyzing ingredients...` for pet-food mode.
- The scanner help sheet now uses human-food-specific steps when the user is in human-food mode.
- Results streaming footer correctly says `Checking...` for human-food mode.

Impact:

- Human-food safety now feels more precise at the waiting moment and no longer borrows barcode/product-package instructions from pet-food scanning.

Validation:

- Confirm human-food capture, help, permission, and result-loading copy all match the selected scan mode.
- Confirm scanner help opens are recorded in `public.kpi_daily_funnel.scanner_help_opens`.
- Confirm the scanner cancel button remains tappable while the processing overlay is visible.

Success metric:

- Lower human-food capture cancellation and retry rates; improve human-food result completion while scanner help opens decline or correlate with higher completion.

### P1 - Paywall testing is ready, but the source mix must be controlled

Evidence:

- `PaywallScreen` supports source-specific pitch copy and a visible source-intent strip that emits `source_intent` / `source_context_label`.
- `ResultsScreen`, `HomeScreen`, and `ProfileScreen` emit `paywall_requested` before navigation.
- `REVENUECAT_EXPERIMENT_PLAN.md` defines baseline and experiment sequencing.

Impact:

- Mixing scan-limit, result-gate, home-banner, and profile paywalls into one headline test will blur which moment actually converts.
- Future RevenueCat placement or copy tests need both source and intent segmentation so a renamed source or fallback placement does not blur why the user saw the paywall.

Recommendation:

- Establish a baseline by source before headline or plan-order experiments.
- Treat scan-limit users differently from result-gate users:
  - Scan limit: urgency and continuity.
  - Result gate: unlock the explanation behind the score.
  - Profile: manage/restore/save-account reassurance.
- Do not run paid acquisition until `paywall_offerings_loaded` failure rate is stable and low.

Success metric:

- Paywall request-to-view rate, package-load success, paywall view-to-purchase, trial-start rate, paid conversion, and paywall dismissal duration by source.

### Fixed In Worktree - History now has a first retention surface

Evidence:

- Home displays recent scan rows, keeps the default view capped to 10, and now lets users search saved scans, filter pet-food versus human-food results, and expand to all saved history rows.
- Home now shows a `Compare recent scans` shopping-helper card when the user has at least two scored pet-food history items.
- The comparison modal shows the two recent products side by side, highlights the score gap, and lets users reopen either saved result.
- The feature tracks `history_search_started`, `history_search_submitted`, `history_search_cleared`, `history_filter_changed`, `history_filters_cleared`, `history_list_expanded`, `history_list_collapsed`, `history_compare_opened`, `history_compare_closed`, `history_compare_result_opened`, and source-attributed `history_item_opened` events.
- `065_kpi_reporting_views.sql` exposes search/filter and compare usage in `public.kpi_daily_funnel`, `public.kpi_activation_cohorts`, and `public.kpi_retention_daily`.

Impact:

- Users now have a small repeat shopping workflow after multiple scans instead of only a chronological, capped history list.
- This is still intentionally lighter than pet profiles, saved lists, allergen preferences, watchlists, or reminders.

Validation:

- Confirm history search and pet-food/human-food filters return the expected saved scans, show a no-results state, and clear cleanly.
- Confirm `Show all` exposes older saved scans without changing the default fast recent-history view.
- Confirm the compare card appears only after two scored pet-food scans and does not appear for human-food-only history.
- Confirm comparison result taps reopen the correct saved result and emit both `history_compare_result_opened` and `history_item_opened`.
- Watch `history_search_submissions`, `history_filter_changes`, `history_tool_result_open_rate`, `history_compare_opens`, `history_compare_result_open_rate`, and `activated_to_history_compare_rate` before adding heavier saved-product infrastructure.

Success metric:

- Week-1 repeat scan rate, scans per active user, history opens per active user, history search/filter result-open rate, compare opens per activated user, comparison result-open rate, saved products per active user, and repeat paywall requests from returning users.

## Experiment Backlog

1. Scan-first onboarding validation:
   - Baseline the new `Scan Product` first-screen path against the `How Woof works` education path.
   - Use `public.kpi_onboarding_path_daily` to compare `scan_now`, `completed_flow`, `scan_now_incomplete`, and `education_incomplete` on onboarding completion, auth exposure, scan start, completed result, scan failure, paywall view, and purchase completion.
   - Watch `onboarding_scan_now_rate`, first scan start rate, first completed result rate, camera denial, scan failure rate, and whether the no-account / 3-free-scan promise changes completion quality.

2. Empty-state CTA validation:
   - Validate inline scan and human-food buttons inside `EmptyState`.
   - Compare `source_surface: "home_empty_state"` starts and completions against the top Home CTAs.

3. Result-save prompt validation:
   - Guest users see save-account prompt after first successful result.
   - Confirm suppression when `showFirstScanToast`, `showPostScanPrompt`, or `showReviewPrompt` is active.

4. Paywall source copy:
   - Results gate headline emphasizes "Unlock why this score happened."
   - Scan-limit headline emphasizes "Keep scanning without losing momentum."
   - Home/profile remain broader.

5. Human-food capture copy validation:
   - Verify the mode-specific processing card and help sheet on device.

6. Retention surface validation:
   - Validate the new two-product compare mode before building heavier saved-product infrastructure.

## Release Checklist Additions

- Validate first launch on a clean install: onboarding first screen, automatic anonymous auth, `Scan Product` to Scanner, camera permission, first scan, first result, and result gate.
- Validate fallback launch when anonymous auth is unavailable: `AuthScreen` still offers manual Guest, Apple, and Google.
- Confirm `onboarding_*`, `onboarding_scan_now_tapped`, `automatic_guest_session_*`, `scan_cta_tapped`, `photo_capture_*`, `scan_analysis_*`, `paywall_requested`, `paywall_viewed`, `paywall_offerings_loaded`, `purchase_*`, `guest_upgrade_*`, `share_*`, and `app_review_*` events populate with release/build context.
- Confirm human-food mode copy does not say pet-food ingredient analysis while capture is processing.
- Confirm free users see useful result value before the Pro gate and do not see stacked paywall/review/save prompts; first-scan toast, post-scan upgrade prompt, guest-save prompt, and review prompt timing should be scoped to the current guest/account.
- Confirm the recent-scan compare card appears after two scored pet-food scans, hides for human-food-only history, and opens the correct saved result from each side of the modal.
- Confirm any App Store screenshots used for paid creative reflect the actually shipped first-run path.

## Next Best Product Moves

1. Ship and validate the current audit infrastructure first: anonymous auth, scan limits, RevenueCat sync, analytics, App Store trust cleanup, Sentry, and Supabase egress handling.
2. Validate the scan-first onboarding path before scaling paid traffic.
3. Validate empty-state CTAs and the post-result guest-save prompt in TestFlight.
4. Run RevenueCat source-specific paywall experiments only after package-load reliability and baseline source conversion are proven.
5. Validate the new compare-recent-scans retention surface, then choose the next retention layer: saved products, pet profile, or reminders.
