# App Store Connect Analytics Audit - June 8, 2026

Source: App Store Connect Analytics overview visible in Chromium for `Woof - Pet Food Scanner`, 90-day window ending June 7, 2026.

## Executive Summary

The App Store funnel shows early demand, but the business is not ready for scaled paid acquisition. The product page appears to convert reasonably well once people reach it, but the downstream app experience is not retaining or monetizing enough users. This matches the code audit: scan/search trust, quota/paywall edge cases, onboarding state, and purchase reliability need to be fixed before spending meaningfully on marketing.

## Visible Metrics

Acquisition:
- First-time downloads: 202
- Redownloads: 5
- Impressions: 4.13K
- Product page views: 455
- Conversion rate: 6.4% daily average
- Updates: 34

Sales:
- Proceeds: $43
- In-app purchases: 16
- Day 1 download to paid: not enough data
- Day 7 download to paid: 1.74%
- Day 35 download to paid: 1.27%

Subscriptions:
- Active plans: 3
- Paid plans: 3
- Monthly recurring revenue: $11
- Net paid plans: 3
- Churned: 1

App Usage:
- Average retention is opt-in only and appears very low: about 4% on Day 1, near zero by Day 7/14/28.
- Crashes by app version: iOS 1.2 shows 1 crash, opt-in only.

## Derived Funnel

- Product page view rate from impressions: about 11.0% (`455 / 4,130`).
- First-time download rate from product page views: about 44.4% (`202 / 455`).
- First-time download rate from impressions: about 4.9% (`202 / 4,130`).
- Proceeds per first-time download: about $0.21 (`$43 / 202`).
- In-app purchases per first-time download: about 7.9% (`16 / 202`), but this does not translate into strong active paid plan count.
- Active paid plans per first-time download: about 1.5% (`3 / 202`).
- Churn signal: 1 churned plan against 3 active paid plans is meaningful at this sample size and needs cohort review before acquisition spend.

## Audit Findings

### A1. Acquisition Is Not The Primary Bottleneck

The visible App Store funnel suggests the listing can turn product page visitors into downloads. A roughly 44% download rate from product page views is enough to justify improving the app/product funnel before redesigning the whole listing. The weaker signals are after install: low paid conversion, only 3 active paid plans, and very low opt-in retention.

Action:
- Do not prioritize top-of-funnel ad spend yet.
- First improve first-session success: onboarding, first scan, first result, search recovery, paywall timing, and entitlement reliability.
- Then revisit screenshots, keywords, and campaigns with clean retention/purchase data.

### A2. Monetization Is Too Weak For Paid Marketing

The app generated $43 proceeds and $11 MRR over the visible 90-day window, with 202 first-time downloads. That is about $0.21 proceeds per first-time download and only 3 active paid plans. Unless acquisition costs are extremely low, paid marketing will likely be unprofitable in the current state.

Action:
- Treat purchase and subscription reliability findings in `AUDIT_2026-06-05.md` as revenue blockers.
- Verify RevenueCat offerings, trial metadata, entitlement mapping, restore, and Android/iOS purchase flows on real devices.
- Instrument paywall view -> package selected -> purchase started -> purchase completed -> entitlement active.

### A3. Retention Looks Like The Largest Product Risk

Average retention appears to be about 4% on Day 1 and near zero by Day 7/14/28, with the caveat that App Store Connect retention is opt-in only. Even with that caveat, the shape is bad: users are not forming a habit or returning after the first use.

Likely causes based on the code audit:
- Scan/search flows can fail or loop on stale product data.
- Users may hit low-quality catalog rows, missing species context, or slow multi-step analysis.
- First-scan quota education and post-scan conversion timing are unreliable.
- History replay can fail when retained rows outlive cached payloads.

Action:
- Make "first successful answer" the core metric, not just install.
- Add product analytics for first scan started, first scan completed, first useful result, product-not-found, ingredient-label requested, ingredient-label completed, search opened, search result tapped, paywall viewed, and purchase completed.
- Fix the audit blockers that directly affect first-session trust before testing new store creative.

### A4. In-App Purchase Count Does Not Match Active Paid Health

There are 16 in-app purchases visible, but only 3 active paid plans and $11 MRR. This can be normal if purchases include renewals, short plans, trial conversions, cancellations, or refunded/expired subscriptions, but the discrepancy needs a subscription cohort review. It may also be amplified by the RevenueCat identity, restore, entitlement, and no-entitlement edge cases already found in the code audit.

Action:
- Open App Store Connect Subscriptions and Sales detail to separate initial purchases, renewals, cancellations, refunds, billing retry, and free trials.
- Cross-check RevenueCat customer timelines for guest -> sign-in -> purchase -> restore -> sign-out flows.
- Verify that App Store Connect active subscription counts, RevenueCat active entitlement counts, and app-side `isPro` state reconcile.

### A5. Crash Data Is Too Thin To Trust

The visible crash count is only 1 crash for iOS 1.2, but App Store Connect app usage/crash data is opt-in only. That is not enough observability for a scan/paywall app with many edge-function, camera, auth, and purchase paths.

Action:
- Add production crash/error monitoring before marketing.
- Track JS fatal errors, native crashes, edge-function failures, RevenueCat errors, OAuth failures, and scan timeouts with redacted event payloads.
- Keep App Store Connect crashes as a secondary signal, not the primary release gate.

## Recommended Next Steps

1. Pause broad paid acquisition until the code audit's scan/search/paywall/privacy blockers are fixed.
2. Add a basic product analytics event map for the install -> first useful result -> paywall -> purchase funnel.
3. Use App Store Connect "Sources" to identify whether downloads are mostly search, browse, web referrer, or campaigns.
4. Use Subscription cohort detail to explain the gap between 16 in-app purchases and 3 active paid plans.
5. Run a real-device QA pass for first scan, search result tap, missing-product recovery, paywall, purchase, restore, sign-in, and history replay.
6. After fixes, run a controlled campaign with tagged links or custom product pages and judge success by first useful result rate, D1 retention, and paid conversion, not installs alone.
