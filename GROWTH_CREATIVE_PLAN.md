# Woof Growth And Creative Test Plan

Last updated: 2026-06-29.

Purpose: give Woof a safe, measurable acquisition plan after the trust, analytics, paywall, and backend deployment work is validated. The plan is intentionally cautious because the app is health-adjacent and the live listing currently has unsupported source claims that must be removed before scaling traffic.

## Launch Gates Before Paid Spend

Do not scale paid acquisition until these are true:

- Supabase egress overage is resolved or upgraded before the July 15, 2026 grace-period deadline, and `scan_cache_completion_rate`, `image_uploads_per_fresh_scan`, and `estimated_upload_bytes_per_fresh_scan` are stable after deployment.
- Anonymous guest scanning works in TestFlight: open app, scan, receive result, then save with Apple/Google and confirm the scan remains in history.
- App Store Connect metadata no longer claims DogFoodAdvisor or CatFoodAdvisor support.
- App screens, screenshots, website, and paywall do not claim customer reviews, recall alerts, recall history, veterinary approval, guaranteed safety, or medical diagnosis.
- Analytics migrations and KPI views are deployed.
- RevenueCat purchase, restore, cancellation/expiration webhook, and Supabase entitlement sync are verified.
- RevenueCat Apple Ads Services is connected, and the current iOS build emits `apple_search_ads_attribution_collection_requested` with no collection failures.
- `paywall_offerings_loaded.success = true` appears in analytics events for TestFlight.
- The Profile "Rate Woof" row and post-result app-review prompt are validated, and review prompt/open metrics are visible in `public.kpi_app_review_daily`.
- `public.kpi_app_errors_daily` and App Store Connect crash count are stable after the build.

## Positioning

Primary positioning:

> Scan before you buy, score food in seconds, and start with 3 free scans.

Use only after guest scanning is live.

Secondary hooks:

- Store aisle decision: `Scan before you buy.`
- Ingredient concern: `Spot ingredients to review.`
- Human food moment: `Can my dog eat this?`
- Low-friction trial: `Try 3 scans free.`
- Monetization/retargeting: `Unlimited label checks.`

Never use:

- DogFoodAdvisor or CatFoodAdvisor claims.
- Customer reviews, review summaries, or fake ratings.
- Recall alerts or recall history.
- Veterinarian approved.
- Guaranteed safe.
- Allergy diagnosis or medical advice.
- Real customer names, pet names, private data, or fake testimonials.
- App Store badges unless final deterministic layouts use official badge assets correctly.

## Audience Segments

1. **Store Aisle Comparers**
   - Situation: choosing between two bags of dog or cat food.
   - Best proof: camera scan, result score, ingredient flags.
   - Landing: App Store screenshot order led by scanner and score result.

2. **Ingredient Worriers**
   - Situation: worried about fillers, artificial colors, by-products, preservatives, or allergies.
   - Best proof: ingredient list with green/neutral/red explanations.
   - Landing: ingredient flags screenshot and trust-safe disclaimer.

3. **Human Food Checkers**
   - Situation: pet owner is holding a snack, leftover, fruit, meat, or dairy item.
   - Best proof: human-food safety result with safe/caution/danger state, portions, and symptoms to watch.
   - Landing: human food screenshot in position 2 or 3.

4. **Power Shoppers**
   - Situation: frequent scanner who hit the free scan limit.
   - Best proof: unlimited scans, history, comparison workflow.
   - Landing: paywall source `scan_limit`, pitch key `scan_limit`.

## Ads Explorer Output

Generated prompt-only Ads Explorer run:

- Pack: `digital-product-core-ad-prompts`
- Subject: `Woof`
- Output folder: `outputs/imagegen/woof-digital-product-ads/`
- Prompt manifest: `outputs/imagegen/woof-digital-product-ads/prompts-manifest.json`
- Review fallback: `outputs/imagegen/woof-digital-product-ads/review-board.html`
- Images generated: `0`

Use this as the visual prompt library when ready to generate image ads. The current App Store screenshot pack lives at `outputs/app-store/screenshots/2026-06-29/` and should be used as the first deterministic product-proof source for store and paid creative.

## Strongest First Ad Directions

### 1. Product Proof Crop

Best for:

- App Store Search Ads custom product pages.
- Paid social static image.
- First website/product-page hero test.

Use with:

- Headline: `Scan before you buy.`
- CTA: `Start free`
- Visual: large phone UI showing scan result score and ingredient flags.

Why first:

- It proves the product quickly and avoids vague lifestyle creative.

### 2. Product In Context Moment

Best for:

- Meta/TikTok static or UGC-style thumbnail.
- Store aisle shopping scenario.

Use with:

- Headline: `Spot ingredients to review.`
- CTA: `Start free`
- Visual: hand holding phone near a pet food label, with the Woof screen large and readable.

Why first:

- It connects the app to the buying moment without inventing proof.

### 3. Feature Mechanic Spotlight

Best for:

- Retargeting after store page view.
- Carousel card about the score/ingredient mechanic.

Use with:

- Headline: `Spot ingredients to review.`
- CTA: `Start free`
- Visual: result screen with restrained highlight around score ring or ingredient flags.

Why first:

- It teaches the value prop without needing many words.

### 4. Gallery Swipe System

Best for:

- Carousel cover.
- App Store screenshot concepting.
- Vertical social.

Use with:

- Headline: `Try 3 scans free.`
- CTA: `Start free`
- Visual: stacked screens: scan camera, score result, ingredient flags, human-food safety.

Why first:

- It shows product depth while keeping UI central.

### 5. Human Food Moment Variant

Use one of the screen-first directions above, but swap the main UI proof to the human-food safety result.

Use with:

- Headline: `Can my dog eat this?`
- CTA: `Start free`
- Visual: common household snack or food item plus phone result. Keep the UI readable and include the informational-only posture in deterministic final layouts.

Why first:

- It differentiates Woof from barcode-only pet food scanners.

## Channel Plan

### App Store Search Ads

Start only after listing cleanup.

Campaigns:

- Brand: `woof pet food scanner`.
- Category intent: `pet food scanner`, `dog food scanner`, `cat food scanner`, `ingredient checker`.
- Problem intent: `can my dog eat`, `pet food ingredients`, `dog food additives`.
- Competitor/category discovery: use tightly capped exact-match competitor and adjacent-app terms only when App Store copy and screenshots clearly explain the Woof alternative. Keep separate campaigns/ad groups so RevenueCat can compare campaign, ad group, and keyword revenue instead of mixing them with category traffic.
- Search Match discovery: use a small budget in its own ad group, then graduate converting search terms into exact-match ad groups. Do not scale broad/search-match traffic from installs alone.

Creative:

- Use Product Page Optimization or custom product pages aligned to:
  - Store aisle decision.
  - Ingredient concern.
  - Human food moment.

Primary metric:

- App Store product page conversion rate.

Secondary metrics:

- `activation_rate`.
- `scan_success_rate`.
- `paywall_view_purchase_rate`.
- RevenueCat Apple Search Ads campaign/ad group/keyword revenue.
- `public.kpi_apple_search_ads_attribution_daily.collection_failure_rate`.
- `public.kpi_paid_acquisition_readiness_daily`.

### Meta/TikTok Static And Short Motion

Start with small-budget creative validation after TestFlight and production telemetry are stable.

Creative directions:

- Product Proof Crop.
- Product In Context Moment.
- Feature Mechanic Spotlight.
- Human Food Moment.

Primary metric:

- Cost per first completed scan, not cost per install.

Secondary metrics:

- Install to first scan.
- First scan to paywall view.
- Paywall view to purchase.
- Result-card share rate.
- Supabase egress per successful scan.

### Organic Short-Form

Use free branded result-card content and simple shopping scenarios. The goal is to turn each useful scan into a visible proof point without putting sharing behind the paywall.

Formats:

- `I scanned this label before buying.`
- `Ingredients I always check on dog food labels.`
- `Can my dog eat this?`
- `Barcode scanners miss this when the label is visible.`

Guardrail:

- Do not present AI output as veterinary advice. Keep the app as a label-reading and ingredient-review assistant.
- Measure free/pro share starts, completions, dismissals, failures, and whether the configured Woof share URL was attached in `public.kpi_share_daily`.

## Measurement Loop

Use `WEEKLY_REVIEW_RUNBOOK.md` for the full weekly operating review before scaling spend. Lightweight growth query set:

```sql
select *
from public.kpi_activation_cohorts
order by cohort_date desc
limit 14;

select *
from public.kpi_daily_funnel
order by metric_date desc
limit 14;

select *
from public.kpi_paywall_pitch_daily
order by metric_date desc, source, pitch_key
limit 50;

select *
from public.kpi_scan_usage_daily
order by metric_date desc
limit 14;

select *
from public.kpi_app_errors_daily
order by metric_date desc, sessions_impacted desc
limit 50;
```

Decision rules:

- Scale a creative direction only if activation improves or holds steady.
- Pause if scan failures, app error sessions, crash rate, or Supabase egress per scan rise materially.
- Treat install volume as weak evidence unless first completed scan improves.
- Treat trial starts as weak evidence unless paid conversion and active subscriptions improve.

## First 30-Day Growth Roadmap

### Week 1: Trust Cleanup And Baseline

- Ship anonymous-first scanning, guest account-saving, and analytics.
- Replace App Store copy using `APP_STORE_LISTING.md`.
- Establish first-scan, paywall, purchase, scan-cost, and error baselines.

### Week 2: Store Page Tests

- Run Product Page Optimization test:
  - Control: scanner -> score -> ingredient flags.
  - Treatment A: score -> scanner -> ingredient flags.
  - Treatment B: ingredient flags -> score -> human food.

### Week 3: Small Paid Creative Test

- Generate 4 to 6 static assets from the Ads Explorer prompt directions.
- Spend lightly across Store Aisle, Ingredient Concern, and Human Food Moment.
- Optimize for first completed scan.

### Week 4: Revenue Quality Test

- Use `REVENUECAT_EXPERIMENT_PLAN.md`.
- Compare monthly-default and annual-default only after purchase/restore/webhook sync is stable; trial claims should remain store/eligibility-aware.
- Review conversion by `source`, `pitch_key`, and selected `plan`.

## Production Notes

- Generated text in image ads is directional. Final publish assets should use deterministic text layout with exact approved copy.
- Use real screenshots from the validated build or the deterministic screenshot pack in `outputs/app-store/screenshots/2026-06-29/` for final App Store and paid ads.
- Keep AI/veterinary caveats visible in store description, support/legal pages, and health-sensitive final layouts.
