# Woof App Store Listing Pack

Last updated: 2026-06-30.

Purpose: replace unsupported App Store claims with accurate, conversion-focused copy after the anonymous-first build and backend migrations are deployed and validated in TestFlight.

## Live Listing Issues To Fix

Evidence from the live US App Store product page on 2026-06-16 and App Store Connect Distribution record on 2026-06-17:

- Current name: `Woof - Pet Food Scanner`.
- Current subtitle: `Dog & Cat Ingredient Checker`.
- Current listing promises `3 free scans. No account required.`
- Current listing claims `Verified data from DogFoodAdvisor, CatFoodAdvisor, and Open Pet Food Facts.`
- Current public description over-promises certainty with phrases such as `actually safe`, `exactly what's safe`, and `what's harmful`.
- Current App Store Connect Promotional Text is blank.
- Current App Review Notes still say Pro unlocks `recall alerts`.
- Current iOS version `1.2` is `Ready for Distribution`, but the attached build row shows build `31` with build version `1.1.1`; verify EAS/App Store remote versioning before the next submission.
- `EAS_RELEASE_VERSIONING.md` contains the required remote-versioning commands and evidence checklist for the next build.
- Current public page shows one rating at 5.0 and in-app purchases for Weekly, Monthly, and Annual.

`APP_STORE_CONNECT_AUDIT.md` contains the latest 90-day App Store Connect KPI baseline and read-only RevenueCat offering snapshot.

The no-account promise should remain only after the anonymous Supabase session flow is enabled, deployed, and verified. The DogFoodAdvisor/CatFoodAdvisor claim should be removed unless those integrations and data rights exist outside this repo.

After the replacement metadata is approved and visible publicly, run:

```sh
npm run check:live-listing -- --guest-validated
```

Until the current live metadata is fixed, this command should detect the known public-page risks:

```sh
npm run check:live-listing -- --expect-current-risk
```

## Metadata Limits

- App name: max 30 characters.
- Subtitle: max 30 characters.
- Promotional text: max 170 characters.
- Description: max 4000 characters.
- Keywords: max 100 bytes, do not include other app names or company names.

Sources:

- Apple App Information reference: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/
- Apple Platform Version Information reference: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/

## Recommended Default Metadata

### App Name

`Woof Pet Food Scanner`

Why: keeps the brand and puts the highest-intent phrase `pet food scanner` in the most important indexed field.

### Subtitle

`Dog & Cat Food Checker`

Why: uses natural dog food and cat food search language without claiming reviews, recalls, or third-party ratings.

### Promotional Text

`Scan a front label or search by name to find verified dog and cat food ingredients in seconds. Barcode pickup is optional.`

Use only after TestFlight confirms guest scanning works end to end.

### Keywords

`kibble,treats,ingredients,label,nutrition,toxic,safety,allergy,puppy,kitten,petfood,raw,wet,dry,scan`

Notes:

- Do not use `DogFoodAdvisor`, `CatFoodAdvisor`, competitor app names, or protected brand names.
- Do not waste keyword bytes repeating exact words already in the app name/subtitle unless App Store Connect query data proves it helps.
- Revisit after Apple Search Ads / App Analytics exposes real query data.

## ASO Search Targets

Primary indexed phrase:

- `pet food scanner`
- `petfood scanner`

Secondary phrase clusters:

- `dog food checker`, `cat food checker`, `food label scanner`
- `pet food ingredients`, `dog food ingredients`, `cat food ingredients`
- `pet nutrition`, `kibble`, `treats`, `puppy`, `kitten`
- `toxic foods for dogs`, `can my dog eat this`, `human food for dogs`

Ranking cannot be guaranteed from metadata alone. The launch goal is to improve relevance and conversion for these phrases, then use Product Page Optimization, Apple Search Ads search-term data, ratings, and retention metrics to keep tuning the name/subtitle/keywords/screenshots.

## Ranking Loop

Goal: increase relevance and conversion for `pet food scanner`, `petfood scanner`, dog food checker, cat food checker, pet food ingredients, and human-food safety searches.

Execution:

- Ship the updated name, subtitle, keywords, description, and screenshot pack together so search relevance and conversion improve at the same time.
- Run Apple Search Ads discovery campaigns for broad match, search match, exact category terms, and tightly capped competitor/adjacent terms in separate ad groups.
- Check App Store Connect source, search term, impression, product-page-view, conversion, download, rating, and retention data weekly.
- Keep the first three screenshots product-proof-first unless Product Page Optimization shows a statistically better order.
- Refresh keyword tokens only after search-term data shows missed relevant impressions or weak conversion.

## Proposed Description

```text
Woof helps dog and cat parents identify pet food from the front of the package and review source-backed product information in seconds.

Scan the front label or search by product name, brand, recipe, flavor, life stage, or food type. When Woof finds a verified catalog match, the result includes:
- The exact source-backed ingredient statement
- A clear 0-100 food score
- Ingredient notes and flags to review
- Protein, fat, fiber, and calorie details when published
- Filler, additive, and preservative context
- Product image, source, and verification details
- Pet-profile ingredient checks
- Scan history and shareable result cards

Woof reads the product name from the package. A barcode is optional and is not required for front-label scanning. If a product is not verified yet, Woof can guide you to photograph the full ingredients panel for review instead of guessing the recipe.

Start with 3 free scans. No account is needed to try Woof, and you can save your account later with Apple or Google if you want scan history across devices.

Woof also includes AI-assisted guidance for common human-food questions such as whether a fruit, vegetable, meat, dairy item, or snack may be appropriate for a dog or cat.

Woof Pro unlocks unlimited scans, deeper ingredient details, quality breakdowns, nutrition details, saved history, and shareable result cards.

Woof is informational only and is not veterinary advice. Product formulas can change, so confirm the current package label and consult your veterinarian about allergies, medical diets, symptoms, or major diet changes.
```

## Short Description Variants

Use these as first-screenshot copy, Search Ads concepts, or Product Page Optimization positioning tests. `GROWTH_CREATIVE_PLAN.md` expands these into audience segments, channel sequencing, Ads Explorer prompt artifacts, and KPI decision rules.

### Route A: Store Aisle Decision

Promise: `Scan before you buy.`

Best for: shoppers choosing between two bags in store.

Proof to show: camera pointed at a label, then a clear score and ingredient flags.

Watch-out: do not imply guaranteed safety.

### Route B: Ingredient Concern

Promise: `Spot ingredients that deserve a closer look.`

Best for: owners worried about additives, fillers, by-products, or allergies.

Proof to show: ingredient breakdown with green/neutral/red rows.

Watch-out: avoid medical claims and avoid calling all flagged ingredients dangerous.

### Route C: Human Food Moment

Promise: `Can my dog eat this?`

Best for: urgent household questions around snacks, leftovers, fruit, vegetables, and meat.

Proof to show: human food result with safety badge, portions, and symptoms to watch.

Watch-out: make veterinary disclaimer visible in the flow.

## Screenshot Set

Apple says the first one to three screenshots can appear in search results when no app preview is available, so lead with the clearest value moments.

Current creative pack:

- Generator: `scripts/generate-app-store-screenshots.py`
- Validator: `scripts/check-app-store-screenshots.mjs`
- Review board: `outputs/app-store/screenshots/2026-06-30-premium/review-board.html`
- Contact sheet: `outputs/app-store/screenshots/2026-06-30-premium/offer-contact-sheet.png`
- Creative Production widget payload: `outputs/app-store/screenshots/2026-06-30-premium/moodboard-widget-payload.json`
- Manifest: `outputs/app-store/screenshots/2026-06-30-premium/manifest.json`
- Export families: iPhone 6.9-inch portrait, iPhone 6.7-inch portrait, iPad 13-inch portrait.

1. **Scan Any Label**
   - Caption: `Scan before you buy`
   - Visual: camera view pointed at a real-looking dog/cat food ingredient panel.
   - Purpose: immediately explains what the app does.

2. **Score Food Fast**
   - Caption: `Score food in seconds`
   - Visual: result screen with product name, score ring, quick stats, and summary.
   - Purpose: proves the value after the scan.

3. **Spot Ingredient Flags**
   - Caption: `Spot ingredient flags`
   - Visual: ingredient list with colored quality markers and short explanations.
   - Purpose: owns the trust and comparison use case.

4. **Human Food Check**
   - Caption: `Can my dog eat this?`
   - Visual: human food safety result with safe/caution/danger state and portions.
   - Purpose: differentiates from barcode-only pet food apps.

5. **Try Free As Guest**
   - Caption: `Try 3 scans free`
   - Visual: onboarding or first scan path, not a sign-in wall.
   - Purpose: reinforces low-friction activation.
   - Gate: use only after anonymous-first scanning is enabled and validated.

6. **Unlimited Label Checks**
   - Caption: `Unlimited label checks`
   - Visual: monthly-default paywall or Pro details.
   - Purpose: aligns App Store promise with RevenueCat packages.

### Screenshot Production Rules

- Use real screens from the validated TestFlight build or deterministic UI composites based on that build; do not use invented app states.
- Keep the first three screenshots product-proof-first: scan, score, ingredient flags.
- Keep captions short enough to read in App Store search results; target 32 characters or fewer.
- Do not show DogFoodAdvisor, CatFoodAdvisor, customer reviews, recall alerts, guaranteed safety, veterinary approval, or diagnosis claims anywhere in screenshots.
- Screenshot 5 may say `Try 3 scans free` only after anonymous guest scanning is enabled in Supabase and verified in TestFlight.
- Use the same monthly-default paywall positioning as the app until RevenueCat experiment evidence says otherwise.
- Preserve the AI-assisted informational posture in any screen that shows food safety or ingredient-risk guidance.

## Product Page Optimization Tests

Run only after the next build is live and the listing copy is cleaned up.

Apple Product Page Optimization supports testing alternate screenshots, app previews, and app icons against the current product page. Keep each test focused so the winning reason is easier to understand.

Source: https://developer.apple.com/help/app-store-connect/create-product-page-optimization-tests/overview-of-product-page-optimization/

### Test 1: First Result vs. Ingredient Concern

- Control: current screenshot order after trust cleanup.
- Treatment A: lead with result score, then camera, then ingredient flags.
- Treatment B: lead with ingredient flags, then score, then human food.
- Success metric: product page conversion rate and first-scan rate from `kpi_activation_cohorts`.

### Test 2: Human Food Differentiator

- Control: pet food scanner-first screenshots.
- Treatment: human food safety checker in screenshot 2 or 3.
- Success metric: product page conversion rate, `scan_cta_tapped` with human-food mode, and first scan completion.

### Test 3: Low-Friction Start

- Control: feature-led screenshots.
- Treatment: screenshot 1 or 2 emphasizes `3 free scans` and `no account needed`.
- Success metric: product page conversion rate and guest first-scan completion.
- Gate: only run after TestFlight verifies anonymous scanning.

## Ratings Loop

App-side implementation:

- `services/reviewPrompt.js` gates rating asks by successful pet-food scans, prompt count, and cooldown.
- `screens/ResultsScreen/index.js` shows the post-result prompt only after repeat successful good-scoring scans and avoids overlapping first-scan, guest-save, or paywall prompts.
- `screens/ProfileScreen.js` keeps a manual `Rate Woof` row for users who already want to support the app.

ASO role:

- Better ratings and rating volume can improve conversion from search and ads, but do not ask too early or too often.
- Track `app_review_prompt_viewed`, `app_review_requested`, `app_review_opened`, and `app_review_open_failed` in `public.kpi_app_review_daily`.
- If prompts are dismissed more than they are opened, slow the ask down or move it later in the result flow.

## What Not To Say

Do not use these unless the product and data rights actually support them:

- `Verified data from DogFoodAdvisor`
- `Verified data from CatFoodAdvisor`
- `Customer reviews`
- `Review summaries`
- `Recall alerts`
- `Recall history`
- `Veterinarian approved`
- `Guaranteed safe`
- `Diagnoses allergies`
- `Medical advice`

## App Review Notes

Include these points in review notes for the next binary:

- Woof is AI-assisted and informational, not veterinary advice.
- Pet food scans analyze photos of packaging/labels and may use Open Pet Food Facts when available.
- Human food checks are informational and include safety caveats.
- Users can start with anonymous guest auth and can later save an account with Apple or Google.
- Woof Pro unlocks unlimited scans and deeper report sections.
- RevenueCat products: Weekly, Monthly, Annual.

## Release Checklist

- Deploy anonymous-first auth and validate no-account scanning before using no-account copy.
- Remove DogFoodAdvisor/CatFoodAdvisor claims from App Store Connect.
- Remove customer-review and recall-history claims from App Store copy/screenshots.
- Refresh screenshots after the current trust cleanup and monthly-default paywall are in TestFlight.
- Validate App Privacy entries still match the live data flow after analytics and anonymous auth changes.
- Use `KPI_FRAMEWORK.md` and `065_kpi_reporting_views.sql` to review product page conversion, first scan completion, paywall conversion, and share rate after release.
- Use `GROWTH_CREATIVE_PLAN.md` before running Search Ads or paid social so creative claims, launch gates, and cost-per-first-scan decision rules stay aligned.
