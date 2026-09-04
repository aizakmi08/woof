# Woof App Store Connect Audit

Last updated: 2026-06-17.

Source: read-only App Store Connect and RevenueCat dashboard review through the user's existing Chrome session. Private account/contact fields were intentionally omitted from this file.

## Executive Readout

Woof has real demand but the current store and revenue surfaces are not yet clean enough to scale paid acquisition. The 90-day App Store Connect overview shows meaningful top-of-funnel discovery, but paid conversion is still tiny, the live listing still contains unsupported trust claims, and the 1.2 release record still references recall alerts in App Review notes.

Do not increase paid traffic until the next build validates guest scanning, analytics, entitlement sync, crash reporting, and Supabase egress controls. The first growth move is trust cleanup plus screenshot/copy alignment, then a small Search Ads or creative test optimized for first completed scan, not installs.

## App Store Connect Snapshot

Observed page: App Analytics overview for Woof, `dateSpec=d90`, dashboard ending June 15, 2026.

| Metric | Current value |
| --- | ---: |
| First-time downloads | 239 |
| Redownloads | 6 |
| App Store conversion rate | 6.79% daily average |
| Impressions | 4.64K |
| Product page views | 509 |
| Proceeds | $43 |
| In-app purchases | 19 |
| Day 7 download-to-paid | 1.44% |
| Day 35 download-to-paid | 1.92% |
| Active subscription plans | 4 |
| Paid subscription plans | 3 |
| Monthly recurring revenue | $11 |
| Net paid plans | 3 |
| Conversion to paid | 4 |
| Churned plans | 1 |
| Crashes, version 1.2 iOS | 2 |

Interpretation:

- Store visibility exists: 4.64K impressions and 509 product page views in 90 days are enough to learn from metadata, screenshots, and first-run funnel changes.
- Monetization is fragile: 239 first-time downloads led to only 3 paid plans and $11 MRR in App Store Connect's subscription view.
- Paid conversion is not yet a traffic problem: with Day 7 download-to-paid at 1.44% and Day 35 at 1.92%, scaling acquisition before fixing trust, activation, paywall instrumentation, and entitlement reliability would likely buy noisy installs.
- Crash visibility matters before release: App Store Connect already shows 2 crashes for version 1.2 iOS, so Sentry release/source-map setup should be validated before phased release or paid growth.

## Distribution Record Findings

Observed page: App Store Connect Distribution, iOS app version `1.2`, status `Ready for Distribution`.

- The listing has five iPhone screenshots attached.
- Promotional Text is blank, leaving a free conversion surface unused.
- The Description still claims `Verified data from DogFoodAdvisor, CatFoodAdvisor, and Open Pet Food Facts`.
- App Review Notes still say Pro unlocks `recall alerts`.
- Current keywords include broad trust/health terms such as `recall`, `health`, and `vet`; these should stay only if the visible app experience and metadata avoid implying recall coverage or medical/veterinary approval.
- Support URL points to `https://aizakmi08.github.io/woof/support.html`.
- Marketing URL points to `https://aizakmi08.github.io/woof/`.
- The 1.2 version record shows build `31` with build version `1.1.1`, so EAS/App Store remote versioning should be checked before the next submission.
- Use `EAS_RELEASE_VERSIONING.md` and `npm run check:eas-versioning` before the next build; save `npx eas-cli@latest build:version:get -p ios` output and confirm the submitted build row shows marketing version `1.2.1` with a build number greater than `41`.
- Version release is configured for automatic release after review.

Risk:

- The DogFoodAdvisor/CatFoodAdvisor claim is not supported by the repo.
- The recall-alert claim conflicts with the current claim-safety cleanup and should be removed unless a real recall/watchlist feature is shipped and licensed.
- The live public description also over-promises certainty with phrases such as `actually safe`, `exactly what's safe`, and `what's harmful`; replacement copy should use informational language such as `ingredients to review`, `safety flags`, and `not veterinary advice`.
- The no-account promise should remain only after Supabase anonymous sign-in, guest scan, account linking, and TestFlight validation are complete.

## RevenueCat Snapshot

Observed page: RevenueCat product catalog offering `default`.

- Active offering identifier: `default`.
- Display name: `The standard set of packages`.
- Packages attached: Monthly (`$rc_monthly` / `woof_pro_monthly`), Annual (`$rc_annual` / `woof_pro_annual`), Weekly (`$rc_weekly` / `woof_pro_weekly`).
- The offering page shows `Add Paywall`, so no hosted RevenueCat paywall is attached to the default offering.
- The offering page shows `Add Rules`, so no targeting rule is attached to the default offering.

Limitation:

- RevenueCat overview, paywalls, and experiments routes were stuck on a `Loading RevenueCat...` state during this pass, so broader RevenueCat dashboard metrics and experiment status were not reverified here. The offering configuration above was visible and usable.

## Operating Recommendations

1. Fix live App Store metadata before the next release: remove DogFoodAdvisor, CatFoodAdvisor, and recall-alert claims; apply the replacement copy from `APP_STORE_LISTING.md`; add Promotional Text only after guest scanning is validated.
2. Refresh screenshots after the 1.2 audit build is validated. The first three screenshots should prove scan, score, and ingredient flags, because those are what determine search-result conversion.
3. Treat 90-day App Store Connect metrics as the launch baseline: product page conversion, product page views, first-time downloads, download-to-paid, paid plans, proceeds, crashes, and MRR.
4. Use Woof's new first-party funnel analytics to connect App Store downloads to first completed scan, paywall view, purchase attempt, purchase success, restore success, and share/review actions.
5. Keep RevenueCat's current in-app paywall implementation as the control until purchase/restore/server entitlement sync is verified. Configure RevenueCat experiments only after the webhook and `revenuecat-sync` paths are live and observable.
6. Delay paid scale until Supabase egress is below plan or upgraded, Sentry is validated, and App Store Connect/App Privacy metadata no longer conflicts with the app.

## Next Dashboard Checks

- After App Store Connect metadata is updated and visible publicly, run `npm run check:live-listing -- --guest-validated` to verify the live US App Store description no longer contains unsupported source, recall, or overbroad safety claims. Until then, `npm run check:live-listing -- --expect-current-risk` should detect the known live risks.
- Run the EAS remote versioning check from `EAS_RELEASE_VERSIONING.md` before requesting the next TestFlight/App Store build, then refresh this audit if App Store Connect shows a new build/version row.
- Reopen RevenueCat overview, experiments, and paywalls after dashboard loading recovers.
- Check App Store Connect Product Page Optimization once the replacement screenshots are ready.
- Check App Store Connect Ratings and Reviews after the next build prompts repeat satisfied users.
- Compare App Store Connect crash count with Sentry crash-free sessions after the next TestFlight build.
