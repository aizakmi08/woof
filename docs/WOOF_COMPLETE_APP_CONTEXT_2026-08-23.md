# Woof — Complete App Context

**Snapshot date:** August 23, 2026  
**Repository:** `/Users/admin/Documents/woof`  
**Purpose:** single source of truth for the product, implementation, live database, catalog, user experience, design, scoring, expert feedback, operations, and known gaps.

This document describes the application as it exists in the current local working tree and in the live Supabase and EAS/App Store Connect surfaces on the snapshot date. It supersedes the older context/handoff files and incorporates the August 23 speed/flow/design overhaul plus its simulator evidence.

## 1. How to read this document

### Truth labels

- **Live:** directly inspected in the deployed Supabase project or distribution service on August 23, 2026.
- **Implemented:** present in the current local code. The working tree is heavily modified and includes many uncommitted files, so “implemented” does not mean “merged to `main`.”
- **Tested:** backed by an automated check, simulator/browser evidence, or a completed live verification explicitly named here.
- **Historical:** a measured result from an earlier dated artifact. Historical numbers must not be presented as current live facts.
- **Open:** not yet proven on the physical/TestFlight path or not yet at the stated release gate.
- **Intent:** a product or operational rule expressed by the code/docs, not proof that every production state satisfies it.

Every factual claim inherits a truth label. Section defaults are: **Implemented** for §§2, 4–12, 16–20, 27 and Appendix A; **Live** for the backend/EAS facts in §§3, 13–15 and 21; **Tested** only where a Part-B evidence link or named gate is present; **Historical** for explicitly dated artifacts/timeline entries; **Open** for unresolved risks and blocked tests; and **Intent** for contracts/maintenance rules. Inline labels override these defaults. A code claim is never upgraded from Implemented to Tested merely because it compiles.

### Source precedence

When sources disagree, use this order:

1. Current live backend state for deployed schema, row counts, Edge Function versions, and policies.
2. Current executable code for client behavior and deterministic scoring.
3. Latest dated audit or generated evidence for measurements that cannot be inferred from live row counts.
4. Release/runbook documents for operational intent.
5. Older handoff documents only for history.

Do not use `PROJECT_CONTEXT.md` or the older Claude handoffs as current truth without checking this file and the code. Several of those documents preserve superseded catalog and release numbers.

### Security boundary

This file names public identifiers, table names, RPCs, configuration variable names, and operational services. It intentionally omits secret values, API keys, service-role credentials, signing material, personal tester addresses, and the App Store submission account email.

## 2. Product definition

Woof is a dog-and-cat food decision app. A pet parent scans the front of a pet-food package, scans a barcode, searches by product name, or photographs an ingredient panel. Woof attempts to identify the **exact formula and package version**, then returns a source-backed ingredient report and a strict 1–100 quality score. It also has a separate human-food safety checker for asking whether a photographed food is safe for a dog or cat.

The product promise is not “recognize a brand and return something similar.” Its core trust contract is:

> Match the exact formula or abstain. Never silently substitute a sibling product, another species, another life stage, another diet condition, another food form, or another recipe.

The customer-facing identity is:

- Product name: **Woof**
- Paid tier: **Woof Pro**
- Tagline: **Know what's in the bowl.**
- App Store title: **Woof Pet Food Scanner**
- App Store subtitle: **Dog & Cat Food Checker**
- Support: the support mailbox configured in `config/brand.js`/Profile (address intentionally omitted here).
- iOS App Store ID: `6760733899`
- iOS bundle identifier: `io.woof.app`
- Android package: `com.app.woof`

The unfinished Bowlproof identity and associated concept assets are not the runtime brand. Some design/audit artifacts remain in the repository for history, but runtime configuration and components use Woof and its paw-with-green-check mark.

## 3. Current release and operating state

### App build

- **Implemented:** Expo/React Native app version `1.2.2`; this overhaul did not bump the version.
- Expo SDK `55.0.29`, React Native `0.83.10`, React `19.2.0`.
- EAS project ID: `ea14f3ad-9dbe-4341-bfba-51eb5c6ead8f`.
- Runtime version policy: `appVersion`.
- Production channel: `production`; native build number auto-increments remotely.
- iOS supports iPhone and iPad and uses Apple Sign In.
- Android production output is an app bundle; internal/preview builds use APKs.

### TestFlight snapshot

- **Live:** the App Store production version is `1.2.1` build `43`, state `READY_FOR_DISTRIBUTION`.
- **Live:** the newest TestFlight binary is `1.2.2` build `52`, EAS build `55f0945f-7660-4b36-b2f0-b275979a68f2`, submission `ecaf673f-5e73-405a-b7a6-7221e32c2a59`.
- **Live:** build 52 is `VALID`, `IN_BETA_TESTING` for internal testers, `READY_FOR_BETA_SUBMISSION` for external testing, and not expired. Uploaded/accepted/available is therefore proven; physical testing is not.
- **Live:** build 51 is also valid/in internal beta; build 52 supersedes it as the newest binary.
- **Open:** build 52 was created from Git commit `8cb3c8f0`. The overhaul commits (`ffd3612d`, `cd14e105`, `0e7da335`, `c18bd5f2`) are newer and have been simulator-tested locally but are **not in TestFlight**. No upload was performed as part of this documentation pass.
- **Open:** the exact shelf products, glare/blur/crop, VoiceOver, live packages, purchase/restore, crash reporting, and account-linking still require the correct later binary on a physical device.

### Live Supabase

- Project ref: `rhlgvrywjralxrjcdtrw`.
- Project name: `woof`.
- Region: `us-east-1`.
- Status: `ACTIVE_HEALTHY`.
- PostgreSQL: `17.6.1.084`, engine major 17, generally available.
- Project created March 14, 2026.
- **Live:** 49 public tables, all with RLS enabled; 6 active Edge Functions; 813 applied migrations.

### Important release conclusion

Woof has valid TestFlight binaries and a healthy live backend, but the locally tested overhaul is newer than build 52. **It is not valid to claim the original scan problem is closed until the affected products pass on a physical build containing the overhaul.** Fixtures, source-backed rows, simulator evidence, and a successful older upload do not replace that shelf test.

## 4. Product principles and non-negotiable contracts

1. **Exact identity over forced success.** A correct abstention is better than a confident sibling substitution.
2. **Formula evidence and package evidence are separate.** Ingredients belong to a formula/version; GTIN, count, and size belong to a SKU/package.
3. **Verified data before scoring.** Deterministic catalog scoring requires source-backed ingredients and a verified product image.
4. **No fabricated claims.** Do not invent ingredients, nutrition, calories, reviews, ratings, recalls, recall history, veterinary approval, or medical conclusions.
5. **Nutrition matters more than cosmetic ingredient heuristics.** Nutritional Balance is 30% of the score and is the largest category.
6. **Typical/actual analysis outranks Guaranteed Analysis for transparency.** Guaranteed values are label minimums/maximums, not a complete measured nutrient profile.
7. **Compare minerals on a dry-matter basis only when the basis is known or convertible.** Do not apply calcium or Ca:P caps to unsupported values.
8. **Human-food safety is a separate flow and schema.** It is not pet-food scoring.
9. **Guest-first use.** A new user should be able to start without creating a conventional account; Supabase anonymous auth still creates a protected user identity behind the scenes.
10. **Server-side entitlements are authoritative.** The client never grants Pro or free scans by trusting a local claim alone.
11. **Be honest about uncertainty and source quality.** The Results screen exposes ingredient, image, source, formula-version, and verification-date evidence.
12. **Catalog coverage must use an independent denominator.** `product_data` cannot be both the numerator and the universe being measured.

## 5. System architecture

```text
Customer
  │
  ├─ onboarding / home / profile / history / paywall
  │
  └─ scan or search
       │
       ├─ front-label photo
       │    ├─ native crop inside visible frame
       │    ├─ on-device OCR
       │    ├─ cloud label recognizer
       │    └─ exact catalog reconciliation / abstention
       │
       ├─ typed catalog search ───────────────┐
       ├─ barcode → catalog → OPFF hint ─────┤
       ├─ ingredient-panel capture ──────────┤
       └─ human-food photo ──────────────────┤
                                              ▼
                                   background analysis service
                                      │              │
                                      │              ├─ deterministic verified scoring
                                      │              └─ AI-assisted image/safety analysis
                                      ▼
                            result + history + analytics
                                      │
                         Supabase Postgres / Edge Functions
                                      │
                         RevenueCat / App Store / Sentry
```

### Client

- Expo Router is not used; the app uses React Navigation's native stack from `App.js`.
- `AuthProvider` stays mounted around the navigation tree and creates/recovers an anonymous session automatically.
- `analysisService.js` is a singleton pub/sub background service so an analysis can survive a Results component unmount.
- AsyncStorage provides user-scoped local state, offline-ish result/history fallback, prompt cadence, runtime-config cache, and search cache.
- Sentry wraps the root and a visible error boundary provides recovery.

### Backend

- Supabase Auth provides anonymous, Apple, and Google identities.
- Postgres stores profiles, history, scan usage, analytics, cache, the serving catalog, the private catalog evidence ledger, and KPI views.
- Supabase Edge Functions provide AI analysis, barcode/product lookup, label lookup, RevenueCat webhook handling, and RevenueCat subscriber sync.
- Anthropic Claude is the image-analysis provider named in the privacy policy and server prompts.
- Open Pet Food Facts is an identity hint/fallback for barcodes; community data alone is not accepted as verified scoring evidence.
- RevenueCat manages offerings, purchases, entitlement state, subscriber sync, and webhooks.
- Sentry handles native error/crash reporting with PII disabled and client-side redaction.

### Main runtime dependencies

- Navigation: `@react-navigation/native`, `@react-navigation/native-stack`.
- State/storage: React hooks/context and `@react-native-async-storage/async-storage`.
- Backend: `@supabase/supabase-js`.
- Camera/image: `expo-camera`, `expo-image-manipulator`, custom `woof-label-ocr` native module.
- Native auth: `expo-apple-authentication`, `expo-auth-session`, `expo-web-browser`.
- Purchases: `react-native-purchases`.
- Animation/UI: `react-native-reanimated`, `react-native-svg`, `expo-linear-gradient`, `expo-blur`, `lucide-react-native`.
- Sharing: `react-native-view-shot`, `expo-sharing`.
- Error monitoring: `@sentry/react-native`.
- Streaming JSON: `partial-json`.

### Environment variables

The client/config surface expects variable names for:

- Supabase URL and anon/publishable client key.
- Google OAuth web client ID.
- RevenueCat iOS and Android public SDK keys.
- Public Woof share URL.
- Sentry DSN.

Server-only functions additionally require service-role, Anthropic, RevenueCat REST/webhook, and authorized-feed credentials as appropriate. Their values must never enter this document or client bundles.

## 6. Navigation and route graph

### Stack routes

- `Home`
- `ProductSearch`
- `Scanner`
- `Results`
- `Profile`
- `Paywall` as a modal
- `WebView` for embedded legal content
- `DevQA` in development builds only

Before the stack appears, `App.js` checks AsyncStorage key `@woof_onboarding_complete` and shows `OnboardingScreen` if needed.

### Primary route transitions

- Home → Scanner with `mode=label_lookup` for front-label scanning.
- Home → ProductSearch for typed catalog search.
- Home → Scanner with `mode=ingredient_capture` for an ingredient-panel contribution.
- Home → dog/cat chooser → Scanner with `mode=human_food`.
- Home history item → Results with `mode=history`.
- Scanner front-label result → ProductSearch for exact candidate confirmation.
- Scanner barcode/catalog/photo/ingredient/human-food analysis → Results.
- ProductSearch exact product → Results with `mode=catalog`.
- ProductSearch no exact match → Scanner ingredient capture or retry.
- Results → Paywall, Profile/pet editor, ingredient sheet, share flow, or reset to Scanner/Home.
- Profile → Paywall, external subscription management, embedded Privacy/Terms, support email, rating, sign-out, or deletion.

### Development-only route

`DevQA` exposes deterministic Home, search, label, Results, human-food, prompt, paywall, performance, and ErrorBoundary fixtures. The route and Home entry are guarded by `__DEV__`; they are absent from TestFlight/production. Web paywall previews remain available for `results_gate`, `scan_limit`, `post_scan_prompt`, `home_banner`, and `profile`.

## 7. Complete user flows

### 7.1 First launch and onboarding

Onboarding contains two education pages:

1. **Scan the front label** — explains the preferred recognition path and offers an immediate scan action.
2. **Made for your pet** — explains the verified answer and optional pet-profile fit check without inventing a score or ingredient list.

The scan action is available on both pages, persists completion immediately, and opens Scanner with `initialMode=label_lookup` rather than falling into barcode mode. The user can also finish to Home. Events record onboarding start, step views, continue taps, scan-now taps, and completion. **Tested:** [`01-onboarding-scan-first.png`](context-evidence/2026-08-23/screenshots/01-onboarding-scan-first.png), [`02-onboarding-personal-fit.png`](context-evidence/2026-08-23/screenshots/02-onboarding-personal-fit.png).

### 7.2 Anonymous-first session

1. `AuthProvider` restores and paints an existing local Supabase session immediately; profile and RevenueCat setup continue in the background.
2. If none exists, it attempts `signInAnonymously` automatically without leaving the branded surface blank.
3. If setup fails or times out, the Auth screen exposes a manual **Continue as Guest** recovery.
4. The anonymous user receives normal RLS-protected profile/history/scan rows under a real Supabase user ID.
5. Apple or Google can later link the guest identity. If the user ID changes, local history migrates and RevenueCat is reidentified/synchronized.

The auth setup watchdog is five seconds. A transient anonymous-sign-in failure never removes the Continue as Guest retry. Before a scan, a session within five minutes of expiry is refreshed. Anonymous users occupy the Postgres `authenticated` role, so ownership checks still rely on `auth.uid()`; anonymity is an identity attribute, not the database `anon` role. **Tested:** deletion ended at the guest-capable auth screen in [`31-final-guest-deletion-complete.png`](context-evidence/2026-08-23/screenshots/31-final-guest-deletion-complete.png); deterministic network-off recovery remains **Open**.

### 7.3 Front-label scan — preferred pet-food flow

1. User taps **Scan a pet food label**.
2. Home enforces the server-backed free-scan eligibility surface before opening the camera.
3. Scanner requests camera permission and explains that only the framed label is used for recognition.
4. The customer centers the front package within the white guide and captures.
5. The visible progress moves through capture, frame crop, image optimization/OCR, and exact-match lookup/upload rather than showing silent work.
6. On iOS, the custom native module maps the visible guide into the correctly oriented source photo and crops before OCR/recognition.
7. On-device OCR and the cloud label recognizer run in parallel.
8. OCR is cleaned of browser chrome, retailer thumbnails, benefit copy, and other noise.
9. Both recognizer outputs search the verified catalog under a bounded time budget.
10. The reconciliation layer checks protected identity fields and one of the following happens:
   - exact formula confirmed and opened;
   - multiple same-line candidates shown for user confirmation;
   - recognizers disagree and candidates are shown;
   - no exact version exists and the app abstains;
   - non-complete food/treat/topper evidence is shown appropriately;
   - label unreadable or timed out, with retry/typed-search/ingredient-capture recovery.
11. Selecting an exact verified candidate starts deterministic catalog analysis and opens Results.

After 8/12 seconds, label progress copy changes again; a long-running state exposes Cancel and **Search by Name**. “None of these” promotes **Scan Ingredients**. **Tested:** exact, multiple candidates, unreadable, timeout, and long-running states in [`05-exact-match-free-result.png`](context-evidence/2026-08-23/screenshots/05-exact-match-free-result.png) through [`09-label-long-running-cancel-search.png`](context-evidence/2026-08-23/screenshots/09-label-long-running-cancel-search.png).

### 7.4 Typed catalog search

1. User enters at least two characters.
2. Query correction handles known misspellings and normalization.
3. The client paints a user-independent verified-search cache immediately, prefetches verified images, then merges the live refresh by stable product key without replacing the list under the user's finger.
4. Live Supabase RPC search runs with an eight-second UI timeout; timeout is distinct from a completed empty result and exposes Retry.
5. Results are filtered to current complete dog/cat food with source-backed verified ingredients and image.
6. Required query terms and protected variants must still match.
7. Duplicate source rows collapse only when formula identity is equivalent; conflicting versions remain distinct.
8. Product cards show real package imagery, complete identity fields, and verification/evidence status.
9. Exact selection starts deterministic scoring.
10. No match offers front-label retry and ingredient-panel contribution rather than a wrong product.

The UI returns up to 12 products. Cached search entries retain up to 25 products, at most 50 query entries, with a seven-day TTL and minimum rank 3. **Tested:** typo and timeout/Retry evidence in [`10-typed-search-typo-correction.png`](context-evidence/2026-08-23/screenshots/10-typed-search-typo-correction.png) and [`11-search-timeout-retry.png`](context-evidence/2026-08-23/screenshots/11-search-timeout-retry.png).

### 7.5 Barcode scan

1. Scanner accepts UPC-A, UPC-E, EAN-8, and EAN-13.
2. A 700 ms preview guard plus a session set of failed barcode values prevents the same still-in-frame code from reopening the same failed path.
3. Analysis checks a verified cached result first.
4. It checks Woof's verified catalog by normalized GTIN.
5. If absent, Open Pet Food Facts may supply identity/image hints.
6. Woof tries to reconcile those hints to an exact verified catalog formula.
7. Only a source-backed exact catalog match is scored.
8. If a barcode identifies a known but unverified product, honest “identity known, evidence not verified” copy keeps the name/brand as `candidateProduct` and routes to ingredient capture; it does not claim “not found” or score community data.
9. A truly absent barcode offers photo/ingredient/search recovery and does not re-enable that same failed value during the scanner session.

**Open:** route contracts pass, but real barcode recognition remains a physical-device test; the simulator cannot prove a shelf code.

### 7.6 Ingredient-panel capture

1. User reaches this from Home, barcode verification recovery, or a label/catalog miss.
2. Every entry point asks plain-language evidence consent with **Scan Privately**, **Share for Review**, and **Cancel**. The remembered choice can be cleared with account data.
3. Scanner asks for the full ingredient panel, flat, close, well lit, and in focus.
4. The AI-assisted photo path parses the exact visible statement.
5. If a usable analysis is produced, Results says either **Submitted for catalog review** (server accepted) or **Scanned ingredients** (private/failed), never a false saved claim.
6. With explicit share consent, `submit_catalog_ingredient_capture` records the contribution and metadata for private catalog review; a private scan never calls it as if consent existed.
7. A failed parse uses the specific message: “Could not find a readable ingredients list…” and reopens the camera for a new photo. After repeated failure, search/ingredient recovery becomes primary rather than resubmitting the cached image.

An ingredient capture is an evidence lead, not automatic production truth. It cannot bypass the catalog promotion gates.

### 7.7 Human-food safety

1. User chooses dog or cat; a saved matching pet profile can supply pet name/context.
2. Scanner captures the food or package label.
3. Claude returns a distinct safety schema: food name, pet type, safe/caution/dangerous, short summary, explanation, toxic compounds, symptoms, portion, benefits, alternatives, age guidance, preparation, and disclaimer.
4. Known toxic foods are hard-coded in the server prompt as dangerous.
5. An uncertain identity must become **Unidentified food / caution**, not a guessed food.
6. Results presents safety, portions, preparation, age suitability, explanation, symptoms, alternatives, and veterinary disclaimer.

Human-food results are not assigned the pet-food 1–100 score and do not count as a successful result for app-review prompting. History uses labeled safety pills; unknown does not masquerade as dangerous. **Tested:** [`15-human-food-safe.png`](context-evidence/2026-08-23/screenshots/15-human-food-safe.png), [`16-human-food-dangerous.png`](context-evidence/2026-08-23/screenshots/16-human-food-dangerous.png), and the populated history in [`04-home-populated-history.png`](context-evidence/2026-08-23/screenshots/04-home-populated-history.png).

### 7.8 Pet-food Results

The report order is:

1. Navigation/share header.
2. Exact product identity and verified package image.
3. Formula evidence line and provenance.
4. Personalized verdict banner (safe/caution/avoid) adjacent to the score ring; the sticky badge and share card use the same semantic verdict.
5. Free-plan scan status when applicable.
6. Quick nutrition stats.
7. Verification and personalized pet-safety card.
8. Verdict.
9. Exact source-backed ingredient list.
10. Woof Pro continuation: quality breakdown and detailed nutrition.
11. Scan another, contextual upgrade, review, and guest-save prompts when eligible.
12. Source/AI/veterinary disclosure.

Free users currently see the overall score, quick facts, verification card, verdict, and the exact ingredient list. The free card does not promise a breakdown that is hidden. Detailed ingredient-sheet explanation, category breakdown, and Nutrition Facts are Pro surfaces. This is important because the June 16 Terms still say the free result shows only the first three ingredients; that wording is now stale and is listed as an open documentation mismatch below. Streaming partial data fills reserved skeleton slots while the status changes every 1.8 seconds. **Tested:** free, avoid, Pro, and partial states in [`05-exact-match-free-result.png`](context-evidence/2026-08-23/screenshots/05-exact-match-free-result.png), [`12-personalized-avoid-result.png`](context-evidence/2026-08-23/screenshots/12-personalized-avoid-result.png), [`13-pro-full-result.png`](context-evidence/2026-08-23/screenshots/13-pro-full-result.png), and [`14-partial-streaming-result.png`](context-evidence/2026-08-23/screenshots/14-partial-streaming-result.png). The AVOID route was also traversed from hero to final action at the simulator's maximum content size in dark mode: [`29-dark-max-text-results.png`](context-evidence/2026-08-23/screenshots/29-dark-max-text-results.png) and [`30-dark-max-text-results-bottom.png`](context-evidence/2026-08-23/screenshots/30-dark-max-text-results-bottom.png).

### 7.9 History, search, and comparison

- History is stored locally and in Supabase, with a maximum of 50 entries.
- Home can filter **All / Pet Food / Human Food**, search history, clear filters, expand the list, clear history, and open a prior result.
- Two distinct recent scored pet foods can be selected for a side-by-side score comparison.
- Historical product images are hydrated only from source-backed verified `product_data` rows.
- Human-food history keeps a bounded result snapshot because those results cannot be deterministically reconstructed from a catalog key.
- If a historical full result is unavailable, the user is sent to Product Search prefilled with the known product name; owning the old package is not required.

### 7.10 Pet profile and personalization

The user can save:

- Name, maximum 40 characters.
- Species: dog or cat.
- Life stage: young, adult, or senior.
- Up to 20 avoided ingredients, with a visible `n of 20` counter instead of silently dropping extras.
- Presets: Chicken, Beef, Dairy, Egg, Fish, Wheat, Corn, Soy.

Aliases expand dairy, egg, common fish species, and poultry. On a verified pet-food result:

1. Species mismatch → **avoid**.
2. Verified ingredient matches avoid list → **avoid**.
3. Life-stage conflict → **caution**.
4. Otherwise retain the generic ingredient/nutrient safety level.

Personalization never rewrites the base score. It adds a pet-specific safety layer.

### 7.11 Upgrade, purchase, restore, and entitlement sync

1. Paywall is entered from result gate, scan limit, post-scan prompt, Home banner, or Profile.
2. The source maps to a RevenueCat placement of the same name.
3. Placement-specific offering is requested; if unavailable, the current/default offering is used.
4. Weekly, monthly, and annual packages are expected. Monthly is the local default; annual is visually “Best Value.”
5. Prices and trial eligibility come from the store/RevenueCat product, never hard-coded production prices.
6. User selects a plan and purchases through the native store.
7. RevenueCat SDK result is refreshed locally and `revenuecat-sync` reconciles the server profile.
8. Webhook events independently grant/revoke server state.
9. A mismatch schedules three bounded reconciliation attempts after approximately 1.2 s, 3.2 s, and 7 s.
10. The client never writes `profiles.is_pro=true` based only on a UI success.
11. Restore exists on both Paywall and Profile and distinguishes no purchase, purchase-without-Pro, pending sync, and failure.
12. Offerings failure retains an enabled Retry; purchase-without-activation shows an activating/reconciliation state; a RevenueCat customer-info listener unlocks pending/Ask-to-Buy purchases when the authoritative entitlement arrives; the worst restore state offers Contact Support.

The entitlement ID is `pro`. `getLifetimePackage` exists as a service helper, but the current paywall UI presents weekly, monthly, and annual only. “Best Value”/“Popular” badges do not disappear when selected, and disclosure says **Trial end** without promising an app-generated billing reminder. **Tested:** offerings error and Retry in [`19-paywall-offerings-retry.png`](context-evidence/2026-08-23/screenshots/19-paywall-offerings-retry.png); a real purchase/restore is **Open** because no local StoreKit products loaded.

### 7.12 App review request

The review system is designed to ask early but not stack with onboarding, guest-save, or upgrade asks:

- Eligible result: pet-food result with score ≥ 70; human food excluded.
- First prompt: after two eligible successful results.
- Display delay: 4.8 seconds after a settled result.
- The second result can prompt while one free scan remains.
- The post-scan Pro card waits until the third free scan, so it does not compete with the early review ask.
- Reminder requires at least four additional eligible successes.
- Cooldowns: 21 days, then 60 days, then 120 days for later reminders.
- A free user with zero scans remaining is not shown the review prompt on that result; the scan-limit/upgrade need owns that state.
- **I already reviewed** permanently suppresses prompts for the current user/device scope.
- The store APIs cannot verify submission, so only explicit completion suppresses reminders permanently.
- The eligibility timer does not burn the prompt cooldown. `markReviewPromptVisible` records the prompt only when the card actually enters the visible scroll viewport.
- Profile always includes **Rate Woof**.
- iOS opens the App Store review composer for app ID `6760733899`, with web fallback; Android uses package `com.app.woof` with Play web fallback.

**Tested:** the review card was visible and dismissible in [`18-review-prompt-visible.png`](context-evidence/2026-08-23/screenshots/18-review-prompt-visible.png).

### 7.13 Account linking, sign-out, and deletion

- Apple native sign-in is used for a conventional iOS login; guest Apple linking uses the OAuth path needed to attach identities.
- Google uses OAuth with PKCE code exchange and supports implicit token callback fallback.
- Guest → permanent account preserves/migrates history and reidentifies RevenueCat.
- Sign-out resets local purchase/auth state and returns to a guest-capable state.
- Account deletion calls `delete_own_account`, then clears history, local results, prompts, review state, analytics queue/session, scan counters, and RevenueCat state.
- Store billing records can remain with Apple/Google for legal and billing requirements.
- **Tested:** Profile controls in [`25-profile-top.png`](context-evidence/2026-08-23/screenshots/25-profile-top.png) and [`26-profile-support-legal-delete.png`](context-evidence/2026-08-23/screenshots/26-profile-support-legal-delete.png); terminal deletion states in [`28-guest-deletion-complete.jpg`](context-evidence/2026-08-23/screenshots/28-guest-deletion-complete.jpg) and, after the final accessibility run, [`31-final-guest-deletion-complete.png`](context-evidence/2026-08-23/screenshots/31-final-guest-deletion-complete.png).

## 8. Screen-by-screen implementation inventory

### `App.js` — 386 lines

- Initializes Sentry and global error handlers.
- Redacts emails, URLs, local file paths, JWTs, common secret formats, and long base64 strings from telemetry.
- Uses `sendDefaultPii=false` and zero tracing sample rate.
- Shows a visible fatal-error recovery boundary.
- Loads onboarding completion.
- Mounts `AuthProvider` and the native-stack routes.
- Marks JS boot-to-interactive and wires navigation timing parameters.
- Registers the development-only QA route.
- Supports guarded development paywall previews on web.

### `OnboardingScreen.js` — 500 lines

- Two-page education flow described above.
- A direct label-scanner action on every page plus education-complete path.
- Animated illustrations, page indicators, accessibility labels, and theme support.
- Persists `@woof_onboarding_complete`.

### `AuthScreen.js` — 491 lines

- Automatic guest-session recovery state.
- Manual Continue as Guest.
- Sign in/save with Apple and Google.
- Error/cancellation handling.
- Embedded Terms and Privacy links.
- Does not require a conventional account before product use when anonymous auth is available.

### `HomeScreen.js` — 2,439 lines

- Single primary front-label scan action.
- Exact-formula trust statement.
- Typed catalog search entry.
- Quiet ingredient-panel contribution recovery.
- Human-food safety entry with dog/cat selection.
- User/profile entry and pet summary.
- Free scan/Pro status surface.
- Recent history, query, filtering, expansion, clearing, and empty states.
- Two-product comparison flow.
- Scan-limit enforcement and paywall routing.
- Development-only deterministic empty/populated/history/QA states; stable adaptive history rows and labeled human-food safety pills.

### `ScannerScreen.js` — 1,354 lines

- Modes: front-label lookup, barcode, direct photo analysis, ingredient capture, and human food.
- Camera permission request, denial, Settings recovery, and privacy explanation.
- White scan-frame overlay and capture help.
- Dynamic square/4:3 frame geometry, remaining-scan copy, immediate pressed/haptic response, and staged capture/crop/optimize/upload progress.
- Native crop/OCR integration.
- Image optimization with size guard and retry steps.
- Parallel local OCR/cloud label lookup.
- Barcode detection formats and duplicate guard.
- Session memory for failed barcode values and server-backed gating on retry entries.
- Mode-specific copy, tips, failures, and route transitions.

### `ProductSearchScreen.js` — 2,364 lines

- Typed and label-derived queries.
- Immediate search-cache paint, stable-key live merge, verified-image prefetch, and live catalog requests.
- Typo/query correction.
- Candidate ranking, evidence display, exact package identity, and deduplication.
- Auto-recovery for a label-derived exact candidate under strict thresholds.
- Size-chip candidate differentiation; “None of these” → ingredient capture; timeout Retry; 8/12-second label statuses; Cancel/Search recovery.
- Catalog miss/acquisition logging.

### `ResultsScreen/index.js` — 2,381 lines

- Subscribes to or resumes background analysis.
- Handles streaming, completed, history, missing-result, limit, timeout, and error states.
- Keeps `result=null` during true loading so the staged skeleton mounts; rotates status at 1.8-second intervals and accepts partial service results.
- Prevents the former empty-result white screen with explicit guards/recovery.
- Synchronizes server scan consumption/reversal with local count.
- Renders human-food and pet-food layouts.
- Personalizes pet safety.
- Saves/shares results and opens ingredient details.
- Coordinates first-scan, guest-save, review, and Pro prompts so they do not stack.
- Records a review prompt only on viewport entry and preserves a reserved prompt/banner slot.

### `ResultsScreen/components.js` — 2,546 lines

- Score ring, product identity, personalized verdict hero, quick facts, tinted safe/avoid cards, category bars, nutrition facts, ingredient rows/sheet, Pro gates, post-scan card, review card, guest-save prompt, human-food safety widgets, skeleton/streaming states, error/retry states, and verdict-aware share card.

### `ResultsScreen/styles.js` — 925 lines

- Results-specific layout, animation surfaces, light/dark styling, score/evidence hierarchy, responsive details, and share-card styling.

### `PaywallScreen.js` — 1,858 lines

- Source-specific headline, positioning, context strip, and benefits.
- RevenueCat placement offering with default-offering fallback.
- Weekly/monthly/annual product cards.
- Store-localized prices, annual monthly equivalent/savings, and trial disclosure.
- Purchase, restore, cancellation, pending, unavailable, sync, and failure states.
- Offerings Retry, automatic activation reconciliation, customer-info update listener, visible selected badges, and support recovery.
- Sanitized allowlist for remote offering metadata. Remote copy containing unsupported competitor, review, recall, veterinary-approval, guaranteed-safety, or medical claims is ignored.
- Development RevenueCat diagnostics.
- Terms, Privacy, close, and Not Now.

### `ProfileScreen.js` — 1,315 lines

- Guest/account identity and save-account path.
- Pet-profile editor.
- Presets and explicit avoided-ingredient `n of 20` counter.
- Free/Pro status, upgrade, restore, and subscription management.
- Rate Woof.
- Support email with bounded diagnostics.
- Privacy and Terms.
- Sign out and destructive account deletion confirmation.

### `WebViewScreen.js` — 126 lines

- Theme-aware embedded legal HTML with loading/error/navigation handling.

### Shared components

- `AppText.js`: shared `Text`/`TextInput` wrappers; Dynamic Type multiplier capped at 1.4.
- `BrandLogo.js`: live paw/check geometry, theme-aware text, fixed Woof brand colors.
- `DevQAScreen.js` — 230 lines: development-only deterministic fixtures and the measured-performance/ErrorBoundary proof surface.

## 9. Scanner and label-resolution system

### 9.1 Why label scanning is difficult

A retail photo can include rotation, perspective, glare, blur, cropped words, shelf labels, adjacent bags, retailer thumbnails, browser chrome, and marketing copy. Pet-food families also reuse nearly identical packaging across species, life stage, breed size, diet conditions, protein recipes, textures, and package sizes. A fuzzy title match alone is unsafe.

### 9.2 Capture and crop

The original white rectangle was only visual decoration; OCR received the entire photo. That allowed unrelated visible text such as browser content (“YC application”), shelf neighbors, or other packages to dominate recognition.

The current implementation:

- Projects the visible guide rectangle into captured photo coordinates.
- Accounts for the native photo orientation and camera preview/content-mode mismatch.
- Uses the custom native `woof-label-ocr` module to crop with UIKit on iOS before text recognition.
- Sends only the framed pixels into the label-recognition path.
- Keeps a JavaScript projection helper for testability/platform support.
- Performs on-device Vision text recognition on iOS and the paired native Android implementation where available.

Historical build lineage:

- Build 48 introduced cropping but exposed an iOS orientation-coordinate mismatch.
- Build 49 moved the critical crop into native UIKit so the actual oriented image matches the visible frame.
- Builds 51 and 52 contain the pre-overhaul resolver/search/scoring/review line; build 52 is the newest valid TestFlight binary. The dynamic frame/progress overhaul is local and not uploaded.

### 9.3 OCR cleaning and query construction

`labelOcrMatching.js`:

- Normalizes case, diacritics, punctuation, whitespace, repeated phrases, and retailer/browser text.
- Chooses primary package text from OCR lines.
- Removes common product-page chrome, ratings, delivery language, marketing benefits, and unrelated terms.
- Rejects strings composed of browser/TestFlight chrome instead of package identity.
- Builds at most eight bounded catalog queries.
- Identifies recipe, line, life-stage, form, condition, package, and species terms.
- Scores/ranks exact catalog candidates and requires explicit protected-term compatibility.

### 9.4 Parallel recognizers

The front-label path deliberately uses two independent signals:

- **On-device OCR:** exact visible words with low network latency.
- **Cloud label recognizer:** structured extraction of brand, product, line, flavor, life stage, food form, size, pet type, confidence, visible text, and query.

The resolver does not simply take whichever returns first. It reconciles identity evidence and can abstain when paths disagree.

### 9.5 Protected identity fields

The following are hard boundaries when visible or source-backed:

- Consumer/shelf brand and Purina sub-brand.
- Dog vs cat.
- Product line.
- Life stage: puppy, kitten, adult, senior, growth, all life stages.
- Food form/texture: dry, wet, pâté, mousse, stew, shredded, raw, freeze-dried, fresh, topper, treat, etc.
- Recipe/flavor/protein.
- Breed-size claim.
- Presentation/package count when it implies a distinct version.
- Grain/free-from variant.
- Diet or veterinary condition: weight, urinary, kidney, sensitive skin/stomach, prescription, etc.

French or generic text must not manufacture a brand variant. A concrete historical example was the word “plus” incorrectly turning an unrelated Purina label into Purina ONE +Plus; the protected consumer-brand logic now prevents that class of match.

### 9.6 Resolution decisions

`labelResolution.js` exposes these decision states:

- `exact_confirmed`
- `ambiguous_same_line`
- `recognizers_disagree`
- `no_exact_variant`
- `non_complete_confirmed`
- `not_readable`
- `timed_out`

The result includes reason codes so UI and analytics can distinguish an unreadable label, missing catalog formula, non-complete food, ambiguity, and recognizer conflict.

### 9.7 Formula and package equivalence

Package size does not automatically define a new formula. Multiple sizes can be grouped when all protected fields and exact ingredient evidence establish the same formula. They must remain separate when recipe/version evidence differs.

This distinction fixed the Nutro failure where a visible package size led to duplicate candidates for the same food. It also prevents the opposite error: collapsing two packages that look similar but contain different formulas.

### 9.8 Automatic-open thresholds

- On-device OCR exact-candidate score threshold: 0.68.
- Required margin over the next candidate: 0.09.
- Minimum candidate floor: 0.34.
- Cloud structured-identification auto-selection additionally requires confidence ≥ 0.78 and all deterministic identity gates.
- A label-derived search auto-recovery uses a 6.5-second bounded window.
- General product search UI timeout: 8 seconds.

Thresholds and policy can be supplied by `app_runtime_config` key `label_resolution`, cached for 15 minutes under `@woof_label_resolution_config_v2`. The config fetch times out after two seconds. Reconciliation defaults to 9.5 seconds and is clamped to 6–12 seconds. **Live:** the one runtime-config row currently sets strict matching, auto-open, visual confirmation, and a 9,500 ms reconciliation budget—the same behavior as the safe defaults.

### 9.9 Camera and upload constants

- Frame width: `min(260, max(220, screenWidth - 64))`, centered horizontally. Label mode uses a 4:3 portrait frame at 20% of screen height; other modes use a square at 28%. Crop inset is five points.
- General image target: ≤1,200,000 base64 characters.
- Label image target: ≤480,000 base64 characters.
- Hard client/server maximum: 2,400,000 base64 characters.
- General JPEG ladder: width/compression `1024/.68`, `900/.62`, `768/.56`, `640/.52`.
- Label JPEG ladder after crop: `768/.64`, `680/.59`, `600/.54`.
- Initial camera quality: 0.72 for label lookup, 0.8 for other photos.
- Barcode preview quality: 0.55 with a 700 ms timeout.
- On-device OCR is usable after at least six characters.
- Client label HTTP timeout: 8.5 seconds; catalog identity RPC timeout: 4.5 seconds; general catalog RPC timeout: 6 seconds.
- Typed-search UI timeout: 8 seconds; automatic label search recovery: 6.5 seconds; full analysis watchdog: 60 seconds (client request budget 55 seconds).

## 10. Analysis, caching, scan accounting, and failure recovery

### 10.1 Analysis modes

`analysisService.startAnalysis` accepts:

- `catalog`: exact verified catalog product; deterministic score.
- `barcode`: verified cache/catalog/GTIN, then OPFF identity hint, then exact reconciliation.
- `photo`: AI-assisted pet-food image analysis, with verified-catalog reconciliation when identity becomes available.
- `ingredient_capture`: AI-assisted visible ingredient-panel parse and contribution path.
- `human_food`: AI-assisted human-food safety schema.
- `history` is a Results presentation mode and does not consume a new scan.

### 10.2 Singleton state machine

- Analyses live in a module-level map keyed by barcode, catalog key, normalized name, or temporary photo ID.
- Components subscribe to `update`, `complete`, `error`, `cancelled`, and barcode-not-found events.
- Temporary photo keys can be re-keyed once a product identity appears.
- A second subscriber attaches to a running job rather than duplicating a request.
- Completed/error entries remain for five minutes before cleanup.
- Duplicate history saves for the same key are suppressed for 60 seconds.

### 10.3 Timeouts and streaming

- Client analysis watchdog: 60 seconds.
- Analyze Edge Function Claude request timeout: 45 seconds.
- Stream cache/proxy timeout: 50 seconds.
- The client timeout is intentionally longer so the server can reverse a consumed scan and return the reversal before the app gives up.
- Streaming partial JSON can update the Results skeleton/state, but only a validated final object becomes a complete result.

### 10.4 Scan accounting

- Free scan limit: 3.
- Every attempt receives a unique `scan_id`.
- `consume_scan` atomically returns allowed/counted/reason/count/free-limit/Pro state and stores `scan_usage_events`.
- Pro attempts are allowed without incrementing a free count.
- A counted scan is reversed by `reverse_scan` for server configuration error, Claude timeout/fetch/API error, empty/invalid response, stream proxy failure, client stream cancellation, and other non-result failures.
- `scan_id` makes consumption idempotent.
- The client synchronizes its local display count from the server response, including reversal.
- History replay does not consume a scan.

### 10.5 Caches

1. **Server analysis cache** — `analysis_cache`, seven-day result expiry, lookup by name/barcode; verified cache hits require verified ingredients and image provenance before deterministic reuse.
2. **Local result cache** — `@woof_result_<key>`, most recent 30 keys; stores analysis/data source/evidence.
3. **Catalog search cache** — versioned cache, most recent 50 queries, up to 25 products per query, seven-day TTL; only verified current products can be stored.
4. **Runtime config cache** — label-resolution configuration.
5. **History cache** — user-scoped local copy merged with Supabase.

### 10.6 Error behavior

- Barcode not found → camera/front-label recovery.
- Product known but evidence unverified → verification-required; do not score.
- Ingredient panel unreadable → specific retake message.
- Human food unidentified → specific clearer-photo message or caution object.
- Network/server/timeout → retry and scan reversal where appropriate.
- Missing historical analysis → rescan/recovery.
- Results with no result object → explicit error/recovery guard; never a silent white screen.
- Intentional navigation can abort; the server reverses an incomplete counted scan.

## 11. Deterministic verified scoring

### 11.1 Eligibility

A product can enter deterministic scoring only if:

- Ingredient list parses to at least three items, or source text is at least 30 characters.
- A source URL exists.
- Ingredient status is one of `gdsn`, `official`, `manufacturer`, `retailer_verified`, `label_ocr_verified`.
- A non-data verified image URL exists with source URL.
- Image status is one of `official`, `manufacturer`, `retailer_verified`.

The source catalog quality gate separately requires current/non-expired complete dog/cat food, no exclusion reason, known species, query compatibility, and non-conflicting version identity.

### 11.2 Weighted categories

| Category | Weight | Meaning |
|---|---:|---|
| Protein Quality | 20% | Named source, form, transparency, and position of animal/plant proteins |
| Ingredient Safety | 20% | Strong synthetic preservative and ingredient safety flags |
| Nutritional Balance | 30% | Published nutrient profile, transparency, basis, and life-stage mineral screens |
| Low-Nutrient Binders | 15% | Reliance on top-listed corn/wheat/soy, generic grains, legumes, and starches |
| Additives & Preservatives | 15% | Artificial colors/flavors, sweeteners, and preservative quality |

Raw overall score is the rounded weighted sum, clamped to 1–100, then subject to evidence-based safety caps.

### 11.3 Score tiers

| Score | Label | Color token |
|---:|---|---|
| 85–100 | Excellent | green |
| 70–84 | Good | green |
| 50–69 | Average | amber |
| 30–49 | Below Average | orange |
| 1–29 | Poor | red |

### 11.4 Protein Quality algorithm

- Default: 58.
- First ingredient is named whole animal protein: 82.
- First ingredient is named meat meal: 66.
- First ingredient is a by-product: 42.
- First ingredient is plant protein concentrate: 38.
- At least three named whole/meat-meal animal ingredients: +6.
- Any by-product in top five: category capped at 50.
- Plant protein concentrate in top five: −8.

Recognized animal terms include common meats, fish, egg, liver, and heart. Plant concentrates include gluten meal, pea protein, soy protein, and potato protein.

### 11.5 Ingredient Safety algorithm

- Default: 84.
- BHA/BHT/ethoxyquin: 30.
- Propylene glycol: 35.
- Menadione: 62.
- Any by-product: 70 when no stronger flag applies.

### 11.6 Nutritional Balance algorithm

Default is 52 with the explanation that full nutrient analysis is not published.

When protein, fat, or fiber exists:

- Published typical/actual/laboratory analysis starts at 80.
- Guaranteed Analysis starts at 68.
- Typical analysis on dry matter, or as-fed with moisture available for conversion: +5.
- Cat protein below 8% in the published basis: −12.
- Non-cat/dog protein below 18%: −8.
- Protein at least 25%: +6.
- Fat 8–22%: +5.
- Fiber above 8%: −7.
- Published calcium or phosphorus: +4 for typical, +2 otherwise.

Mineral comparison:

- A value is dry-matter comparable only when its basis is explicitly dry matter, or explicitly as-fed with moisture between 0 and 100 so conversion is possible.
- For dog growth/reproduction/all-life-stages, calcium above 1.8% dry matter → Nutritional Balance capped at 25, overall capped at 35, safety **avoid**.
- For dog adult maintenance, calcium above 2.5% dry matter → same cap/avoid behavior.
- Calcium:phosphorus outside 1:1–2:1 → category capped at 30, overall capped at 45, safety **caution** unless a stronger avoid exists.
- Unknown basis/provenance never triggers these caps.

Transparency labels:

- Typical/actual and dry-matter comparable → `fuller`.
- Guaranteed Analysis → `limited`.
- Otherwise → `unknown`.

### 11.7 Low-Nutrient Binders algorithm

- Default: 78.
- Corn, wheat, or soy in the top three: 40.
- At least two generic `grain`/`cereal` ingredients: 35.
- At least four legume/starch ingredients: 55.
- Two or three legume/starch ingredients: 66.

This category was renamed from “Filler Quality” to **Low-Nutrient Binders** after Eric's feedback. The code treats these as formulation/quality signals, not blanket poison claims.

### 11.8 Additives & Preservatives algorithm

- Default: 82.
- Artificial color: 30.
- Artificial flavor: 40.
- Mixed tocopherols/rosemary/citric acid: 88 when no stronger issue applies.
- Sugar or corn syrup caps the category at 55.

### 11.9 Global overall caps

- BHA/BHT/ethoxyquin → maximum overall 35.
- Propylene glycol → maximum overall 40.
- Primary protein is a by-product → maximum overall 50.
- Dry-matter calcium avoid concern → maximum overall 35.
- Ca:P caution concern → maximum overall 45.

### 11.10 Ingredient output

Every ingredient receives:

- Name.
- Category: protein, fat, fiber, vitamin, mineral, preservative, carb, or other.
- Rating: good, neutral, or bad.
- Plain-language description.
- Reason tied to the rubric.
- Better-alternative suggestions for neutral/bad ingredients.

The output also includes up to four pros and four cons, a primary protein source, grain-free inference, life-stage inference, published nutrition values, analysis/basis labels, nutrient concern, pet safety, verdict, and ingredient/image/source provenance.

`caloriesPerCup` is `N/A` unless an exact serving-basis value is actually published. The deterministic builder does not invent it.

### 11.11 Nature's Logic example from Eric

The live catalog migrations add the manufacturer-published **Typical Analysis** for Nature's Logic Canine Pork Meal Feast:

- Protein 41.5%.
- Fat 15%.
- Fiber 2.96%.
- Calcium 5.34%.
- Phosphorus 2.84%.
- Basis: dry matter.

Those values propagate only to an ingredient-identical verified serving version. The calcium is over the applicable dog profile maximum, so the score is capped at 35 and the result must state the concern. This is the canonical example of Eric's requirement that a beautiful ingredient list cannot override an off-balance nutrient profile.

### 11.12 AI scoring path

The Analyze Edge Function contains the same five weights, tier labels, strong ingredient caps, typical-vs-guaranteed preference, dry-matter rules, calcium/Ca:P caps, and no-invention rules for photo or verified-data AI modes. Exact verified catalog products prefer the local deterministic builder, reducing model variance.

## 12. Catalog architecture

### 12.1 Three different catalog concepts

Do not collapse these concepts into one count:

1. **Serving catalog (`product_data`)** — rows the app can search/hydrate. There can be multiple package/source rows per formula.
2. **Canonical evidence ledger (`catalog_formulas`, `catalog_skus`, observations/evidence)** — private formula, SKU, source, and field provenance.
3. **Independent market census** — the external formula universe used to measure coverage. It must not use `product_data` as its denominator.

The live `product_data` row count of 26,205 does **not** mean 26,205 unique formulas and cannot be divided into an external formula count to claim coverage.

### 12.2 Canonical formula grain

A formula identity is built from:

- Manufacturer.
- Customer-visible/consumer brand.
- Product line.
- Species.
- Life stage.
- Food form/texture.
- Recipe/flavor.
- Diet/veterinary condition.
- Completeness status.
- Formula-version provenance.

Package size and count usually belong to `catalog_skus`, not the formula. A GTIN is SKU-level evidence. Exact evidence can group package sizes under a formula; identity conflicts must split formulas or remain quarantined.

### 12.3 Evidence tiers

- `manufacturer_current_exact` — current exact manufacturer formula evidence.
- `retailer_web_version` — exact retailer-owned product/version evidence.
- `web_label_version` — exact package-label evidence captured from a trustworthy web image/source.
- Conflicted/unresolved — not eligible for a verified claim until the conflict is resolved.

Search snippets, search titles, sitemaps, and discovery images can identify work to do; they are not ingredient proof. Retailer SKU IDs are not treated as GTINs. Source URLs, content hashes, observed timestamps, ingredient hashes, and image provenance are recorded separately.

### 12.4 Serving-readiness gate

A product is visible/scorable only when it is:

- Current and not expired.
- Complete food, not a treat/topper/supplement unless the flow explicitly describes it as non-complete.
- Dog or cat.
- Not assigned an exclusion reason.
- Backed by a source URL.
- Backed by a sufficiently complete ingredient statement.
- In an accepted ingredient verification status.
- Backed by an accepted verified image.
- Compatible with the user's query and protected identity terms.
- Free of a known formula-version conflict.

Database triggers enforce ingredient contracts, formula-version synchronization, SKU/GTIN-to-formula consistency, field-evidence version consistency, retailer hard boundaries, and lookup-miss acquisition queueing.

### 12.5 Source acquisition model

Preferred evidence order is exact current manufacturer, exact authorized/retailer product page, and exact visible package label. The repository includes manufacturer adapters, retailer snapshots, OCR/source-page extraction, authorized-feed import formats, exact-evidence review queues, alias review, conflict review, and independent census tooling.

Lawful source boundaries are explicit:

- Do not bypass CAPTCHA, HTTP 429, rate limits, bot protection, or access controls.
- Amazon's approved Creators/API credentials are not configured.
- Petco authorized feed/API is not configured.
- Walmart developer/affiliate credentials or feed are not configured.
- Chewy partner feed is not configured.
- A licensed GDSN feed is not present.
- Publicly accessible sitemaps/images can support discovery/version evidence only within their defined role.

### 12.6 Catalog pipeline phases

1. Discover source targets and lawful access state.
2. Run manufacturer/retailer census and source health checks.
3. Extract structured product observations.
4. Normalize brand, species, line, form, life stage, recipe, package, GTIN, and ingredients.
5. Validate exact identity and ingredient completeness.
6. Quarantine artifacts, non-products, ambiguous matches, and version conflicts.
7. Link observation → formula → SKU.
8. Record field-level evidence and formula-version provenance.
9. Promote only source-backed complete rows to `product_data`.
10. Generate exact search/source aliases without weakening protected boundaries.
11. Run duplicate/conflict/contract audits.
12. Run independent census and release gates.

The repository contains 369 top-level scripts, 812 migration files, 336 input files, more than 126,000 generated output/evidence files, and 20 audit files at this snapshot. Generated outputs are evidence/history, not all authoritative current state.

## 13. Catalog state and coverage

### 13.1 Live serving/evidence counts — August 23, 2026

- `product_data`: 26,205 serving/search rows.
- `catalog_formulas`: 19,798 canonical formula rows.
- `catalog_skus`: 28,991 package/SKU rows.
- `catalog_observations`: 40,076 source observations.
- `catalog_field_evidence`: 34,807 field-evidence rows.
- `catalog_retailer_ingredient_evidence`: 22,053 retailer ingredient evidence rows.
- `catalog_product_evidence`: 10,061 product-evidence rows.
- `catalog_verified_product_source_aliases`: 11,580 exact source aliases.
- `catalog_verified_product_search_aliases`: 8,940 exact search aliases.
- `catalog_retailer_identity_repairs`: 204 repairs.
- `catalog_formula_aliases`: 950 reviewed formula aliases.
- `catalog_acquisition_queue`: 23,537 catalog work/gap rows.
- `catalog_source_runs`: 1,027 source-run records.
- `catalog_import_runs`: 1,413 import-run records.
- `product_events`: 552 lookup/catalog events.

These are exact `count(*)` results from the live project, not planner estimates. They establish database volume and architecture, not a coverage percentage.

### 13.2 Latest live materialized coverage snapshot — August 10, 2026

**Live database row; the measurement itself is Historical by run date:** snapshot 109 completed August 10 with an independent denominator of 9,282 formulas, 6,983 verified formulas, and 75.23% verified formula/ingredient/image coverage. It records 95 popular brands, 51 complete popular brands, and 2,299 popular formula gaps. The completed source panel omitted Petco and Amazon. `passes_source_panel`, `passes_total_coverage`, `passes_popular_brands`, and `passes_release_gate` are all false.

The live materialized snapshot is older than the August 18 filesystem artifact below. The latter must not silently replace the database's current view without a new persisted census run.

### 13.3 Latest broad independent census artifact — historical, August 18, 2026

The latest broad public-source census artifact in the repository reports:

- Denominator: 10,176 independently observed formula identities.
- Verified/searchable formulas: 9,366.
- Verified formula coverage: 92.04%.
- Manufacturer-current exact: 4,725 (46.43%).
- Retailer web version: 4,508 (44.30%).
- Web label version: 133 (1.31%).
- Conflicted formulas: 171.
- Unresolved formulas: 639.
- Formula gaps: 810.
- Popular brands: 94.
- Complete popular brands: 50.
- Completed panel: manufacturers, PetSmart, Chewy public sitemap, Target public sitemap, Walmart public sitemap.
- Missing required panel: Petco and Amazon.
- Two qualifying censuses at least seven days apart: false.
- Total-coverage threshold: passed.
- Source-panel gate: failed.
- Popular-brand gate: failed.
- Overall release gate: failed.

This 92.04% is the most recent broad filesystem evidence artifact found, but it is **historical and not the live materialized metric**. It must be rerun and persisted against the current backend before describing it as today's live coverage.

### 13.4 Historical retailer breakdown from that census

| Retailer segment | Formula identities | Verified | Gap | Coverage | Source run complete? |
|---|---:|---:|---:|---:|---|
| PetSmart | 2,234 | 2,230 | 4 | 99.82% | Yes |
| Chewy | 3,355 | 3,211 | 144 | 95.71% | Yes |
| Target | 499 | 367 | 132 | 73.55% | Yes |
| Walmart | 1,504 | 975 | 529 | 64.83% | Yes |
| Petco | 12 | 12 | 0 | 100% | No; sample is not a complete panel |
| Amazon | 1 | 1 | 0 | 100% | No; sample is not a complete panel |

The apparent 100% for Petco/Amazon is not evidence of market completeness; each lacks the required complete source panel.

### 13.5 Why other historical percentages differ

The repository also preserves older licensed-panel/current-folder artifacts (for example 99.98% over 6,659 rows) and earlier 72–74% handoff snapshots. They used different denominator definitions, source panels, or dates. They cannot be compared as a simple time series without holding methodology constant. Use the denominator definition embedded in every artifact.

### 13.6 Current catalog gaps and release blockers

- No fresh independent census has been materialized after August 10; the later August 18 artifact is not persisted in the live snapshot view.
- Petco and Amazon complete authorized source panels are absent.
- No qualifying second census seven days apart.
- Live coverage/ranking/source-health/release-stage tables are populated; their current values still fail production gates.
- Physical shelf validation remains open.
- Historical pipeline artifacts include a July 23 contract audit that failed 8 of 8,336 then-scanned rows; later migrations may have changed these rows, so the old failure must not be described as current without a rerun.
- Exact formula conflicts and unresolved identities must not be closed with loose aliases just to increase the percentage.

## 14. Live database: complete table inventory

All 49 public tables had RLS enabled at introspection time. Twenty-four policies exist across 12 tables; 37 RLS-enabled tables have no policy and therefore deny direct Data API access by default. That deny-by-default state does not prove every `SECURITY DEFINER` RPC is safe; grants and function bodies remain a separate audit surface.

### 14.1 Customer, runtime, and operational tables

| Table | Live rows | Purpose and important fields |
|---|---:|---|
| `profiles` | 196 | User identity/profile, `scan_count`, `is_pro`, expiry, human-food counters, `pet_profile`, RevenueCat user/product/store/environment/entitlement/event/sync/management fields |
| `scan_history` | 369 | Composite `id,user_id`; name, score, species, date, cache key, mode, source, local photo reference, verified product image, safety, optional payload/snapshot |
| `scan_usage_events` | 334 | Idempotent `user_id,scan_id`; mode, allowed/counted/reason, count after, limit, Pro-at-time, reversal fields |
| `analytics_events` | 8,010 | User/session event name, bounded JSON properties, server timestamp |
| `analysis_cache` | 4 | Cache key/type, analysis JSON, data source, verified OPFF/catalog payload, expiry, hit count/time |
| `product_cache` | 17 | Legacy/general product cache; not the active verified serving catalog |
| `rate_limits` | 4 | User request count/window |
| `ip_rate_limits` | 0 | IP request count/window |
| `revenuecat_events` | 0 | Idempotent webhook event/transaction/product/entitlement payload, processed users, sync status/error |
| `app_runtime_config` | 1 | JSON configuration by key; client may read only `label_resolution` |
| `brand_recalls` | 22 | Optional sourced recall records; public read, service write |
| `brand_metadata` | 95 | Optional sourced brand processing/testing/certification metadata; public read, service write |
| `product_events` | 552 | Product/lookup events and metadata; feeds acquisition demand |
| `product_data` | 26,205 | Public serving catalog; exact fields described below |

### 14.2 Catalog evidence and acquisition tables

| Table | Live rows | Purpose |
|---|---:|---|
| `catalog_acquisition_queue` | 23,537 | Prioritized, deduplicated product/ingredient/image/species gaps from customer demand and audits |
| `catalog_import_runs` | 1,413 | Import mode/source/quality/target/extractor, candidate counts, report, duration, error |
| `catalog_product_evidence` | 10,061 | General product evidence/review/quarantine ledger |
| `catalog_source_runs` | 1,027 | Census/source run completeness, counts, checkpoint, hash, previous run, errors |
| `catalog_formulas` | 19,798 | Canonical formula identities, ingredients/image/source, completeness, verification, active/popular status, hashes, evidence tier/version provenance |
| `catalog_skus` | 28,991 | Formula-linked GTIN, size/count, source external ID/URL, active and observation dates |
| `catalog_observations` | 40,076 | Raw structured source observations with identity, package, ingredient/image, completeness, hashes, validation, raw payload, evidence tier |
| `catalog_field_evidence` | 34,807 | Formula/observation field name/value with source authority/URL, acceptance, time, content hash |
| `catalog_formula_aliases` | 950 | Reviewed alias formula key → canonical formula with reason/source/identity hash |
| `catalog_formula_identity_conflicts` | 4 | Canonical vs incoming identity conflict ledger |
| `catalog_verified_product_search_aliases` | 8,940 | Exact evidence-backed alias text for a serving cache key |
| `catalog_verified_product_source_aliases` | 11,580 | Exact evidence-backed source URL → serving cache key/version |
| `catalog_retailer_ingredient_evidence` | 22,053 | Versioned exact retailer ingredients/image/identity, fetch/validation/quarantine, formula links, current/superseded state |
| `catalog_retailer_identity_repairs` | 204 | Before/after formula/observation/cache identity repair audit |
| `catalog_amazon_evidence_queue` | 2,508 | Authorized Amazon evidence candidates and review state |
| `catalog_manual_evidence_reviews` | 560 | Human exact-evidence acquisition/review/correction ledger |
| `catalog_gap_search_runs` | 1 | Private search-discovery runs; never proof |
| `catalog_gap_search_jobs` | 2,771 | Resumable formula-gap discovery jobs |
| `catalog_gap_search_candidates` | 24,446 | Unverified search candidates/snippets/URLs |
| `catalog_gap_evidence_extraction_runs` | 2 | Exact-source extraction run summaries |
| `catalog_gap_evidence_extractions` | 2,810 | Quarantined/promotion-ready extracted source-version evidence; not serving state |

### 14.3 Coverage, ranking, and release-control tables

| Table | Rows | Purpose |
|---|---:|---|
| `catalog_coverage_snapshots` | 84 | Independent census metrics and pass/fail gates |
| `catalog_census_members` | 294,742 | Formula members for snapshots |
| `catalog_census_formula_members` | 441,370 | Formula-key denominator ledger with sources/GTINs/gap reasons |
| `catalog_census_unresolved_members` | 155,213 | Unresolved formula-key members |
| `catalog_coverage_dimensions` | 9,201 | Brand/retailer/etc. coverage breakdown |
| `catalog_brand_ranking_snapshots` | 2 | Methodology/source-panel ranking snapshots |
| `catalog_brand_rankings` | 100 | Brand rank, sales/distribution/demand, coverage/blockers |
| `catalog_brand_batch_status` | 20 | Ranked batch processing state |
| `catalog_major_brand_registry_snapshots` | 2 | Major-brand registry methodology and release gate |
| `catalog_major_brands` | 260 | Major-brand inclusion, presence, coverage, priority, blockers |
| `catalog_major_brand_acquisition_waves` | 106 | Prioritized work waves |
| `catalog_source_health` | 124 | Source access/health/freshness/evidence roles |
| `catalog_brand_source_routes` | 524 | Brand → preferred source routing |
| `catalog_release_stage_targets` | 3 | Coverage/safety stage thresholds and external-production permission |

Total exact rows across the 49 public tables at this introspection point: 1,174,099. This aggregate is operational volume, not users, products, or coverage.

### 14.4 Core table columns

#### `product_data`

`id`, `cache_key`, `product_name`, `brand`, `ingredients[]`, `ingredient_text`, `ingredient_count`, `nutritional_info`, `source`, `source_url`, `scraped_at`, `expires_at`, timestamps, `image_url`, `nutrient_panel`, `has_published_nutrients`, `is_complete_food`, `catalog_exclusion_reason`, `pet_type`, `source_quality`, ingredient/image verification statuses, `verified_at`, `gtin`, `product_line`, `flavor`, `life_stage`, `food_form`, `package_size`, generated `search_document`, `formula_evidence_tier`, and `formula_version_provenance`.

#### `catalog_formulas`

`id`, `formula_key`, manufacturer, brand, name, line, species, life stage, food form, flavor, diet condition, completeness/evidence, exact ingredient text/array, front image, source URL/authority, verification statuses, protected terms, active/popular flags, first/last observed, absent date, promoted cache key/time, identity hash, evidence tier, and formula-version provenance.

#### `catalog_retailer_ingredient_evidence`

Import/source IDs, source URL, product/formula title, species/package, ingredient text/hash/count, fetch status/HTTP/attempt/error/time, evidence status/reasons/hash, linked observation/formula, promoted cache key, raw payload, current/superseded state, retailer brand/GTIN, life stage/form/flavor/diet, image URL/title/source/time/hash/validation, formula identity hash, serving-normalized ingredient text, and normalization codes.

#### `profiles`

Own user ID; name/avatar/email/provider; timestamps; scan and human-food counters; Pro flag/expiry; `pet_profile`; RevenueCat app user, product, store, environment, entitlement IDs, last event, sync time, and management URL.

#### `scan_history`

`id`, `user_id`, name, overall score, species, scan time, cache key, mode, source, local photo URI, created time, verified product image URL, safety level, optional analysis payload, and bounded result snapshot.

#### `scan_usage_events`

`user_id`, `scan_id`, mode, allowed, counted, reason, count after, free limit, Pro-at-time, creation time, reversed flag/time/reason.

### 14.5 Row-level access policies

**Live:** all 24 policies are enumerated below. Empty expressions mean that clause is not applicable.

| Table | Policy | Roles | Command | USING | WITH CHECK |
|---|---|---|---|---|---|
| `analysis_cache` | Anyone can read pet analysis cache | `{anon,authenticated}` | SELECT | `((lookup_type = ANY (ARRAY['name'::text, 'barcode'::text])) AND (expires_at > now()))` | `—` |
| `analysis_cache` | Service role can delete cache | `{service_role}` | DELETE | `true` | `—` |
| `analysis_cache` | Service role can insert cache | `{service_role}` | INSERT | `—` | `true` |
| `analysis_cache` | Service role can update cache | `{service_role}` | UPDATE | `true` | `true` |
| `analytics_events` | Users can insert own analytics events | `{authenticated}` | INSERT | `—` | `(( SELECT auth.uid() AS uid) = user_id)` |
| `app_runtime_config` | Authenticated users can read runtime configuration | `{authenticated}` | SELECT | `(config_key = 'label_resolution'::text)` | `—` |
| `brand_metadata` | Anyone can read brand metadata | `{anon,authenticated}` | SELECT | `true` | `—` |
| `brand_metadata` | Service role manages brand metadata | `{service_role}` | ALL | `true` | `true` |
| `brand_recalls` | Anyone can read brand recalls | `{anon,authenticated}` | SELECT | `true` | `—` |
| `brand_recalls` | Service role manages brand recalls | `{service_role}` | ALL | `true` | `true` |
| `catalog_import_runs` | Service role manages catalog import runs | `{service_role}` | ALL | `true` | `true` |
| `catalog_product_evidence` | Service role manages catalog product evidence | `{service_role}` | ALL | `true` | `true` |
| `product_cache` | Public read product cache | `{anon,authenticated}` | SELECT | `true` | `—` |
| `product_cache` | Service role manages product cache | `{service_role}` | ALL | `true` | `true` |
| `product_data` | Anyone can read product data | `{anon,authenticated}` | SELECT | `true` | `—` |
| `product_data` | Service role can manage product data | `{service_role}` | ALL | `true` | `true` |
| `profiles` | Users insert own profile | `{authenticated}` | INSERT | `—` | `(( SELECT auth.uid() AS uid) = id)` |
| `profiles` | Users read own profile | `{authenticated}` | SELECT | `(( SELECT auth.uid() AS uid) = id)` | `—` |
| `profiles` | Users update own profile | `{authenticated}` | UPDATE | `(( SELECT auth.uid() AS uid) = id)` | `(( SELECT auth.uid() AS uid) = id)` |
| `scan_history` | Users delete own history | `{authenticated}` | DELETE | `(( SELECT auth.uid() AS uid) = user_id)` | `—` |
| `scan_history` | Users insert own history | `{authenticated}` | INSERT | `—` | `(( SELECT auth.uid() AS uid) = user_id)` |
| `scan_history` | Users read own history | `{authenticated}` | SELECT | `(( SELECT auth.uid() AS uid) = user_id)` | `—` |
| `scan_history` | Users update own history | `{authenticated}` | UPDATE | `(( SELECT auth.uid() AS uid) = user_id)` | `(( SELECT auth.uid() AS uid) = user_id)` |
| `scan_usage_events` | Users read own scan usage | `{authenticated}` | SELECT | `(( SELECT auth.uid() AS uid) = user_id)` | `—` |

The remaining 37 tables are RLS-enabled with no policy and therefore deny direct access to ordinary Data API roles. Service/owner jobs and explicitly granted functions are evaluated separately.

### 14.6 Important RPC surface

Customer/runtime RPCs include:

- `consume_scan` and `reverse_scan`.
- `delete_own_account`.
- `get_label_resolution_config`.
- `increment_cache_hit`.
- `log_product_event`.
- `submit_catalog_ingredient_capture` with explicit consent.
- `search_verified_products` and ranked/base variants.
- Fast/OCR label search RPCs.
- GTIN resolution RPCs.

Private/maintenance RPC families include catalog staging, normalization, quality-state calculation, exact image application, retailer evidence staging/promotion, alias synchronization, conflict audit, census staging, backfills, cache cleanup, and rate limiting.

#### Full live public routine inventory

**Live:** PostgreSQL exposed 215 public function/procedure signatures; 78 are `SECURITY DEFINER`. “Client role” means the ACL names `anon` and/or `authenticated`; it does not mean the app calls the routine or that the routine is safe. The inventory includes pg_trgm extension support functions because that extension is installed in `public`.

| Routine signature | Returns | Security definer | ACL class |
|---|---|---:|---|
| `apply_cross_retailer_formula_images(p_import_run_id uuid, p_payload jsonb)` | `TABLE(updated_rows integer, rejected_rows integer)` | yes | service role |
| `apply_cross_source_formula_images(p_import_run_id uuid, p_payload jsonb)` | `TABLE(updated_rows integer, rejected_rows integer)` | yes | service role |
| `apply_exact_ingredient_formula_images(p_import_run_id uuid, p_payload jsonb)` | `TABLE(updated_rows integer, rejected_rows integer)` | yes | service role |
| `apply_normalized_exact_ingredient_formula_images(p_import_run_id uuid, p_payload jsonb)` | `TABLE(updated_rows integer, rejected_rows integer)` | yes | service role |
| `apply_reviewed_exact_walmart_pdp_images(p_import_run_id uuid, p_payload jsonb)` | `TABLE(updated_rows integer, rejected_rows integer)` | yes | service role |
| `attach_exact_catalog_formula_images(p_import_run_id uuid, p_source_slug text)` | `TABLE(updated_rows integer)` | yes | service role |
| `catalog_acquisition_alias_formula_terms_match(p_query_identity text, p_candidate_identity text)` | `boolean` | no | service role |
| `catalog_acquisition_food_form_terms_match(p_query_identity text, p_candidate_identity text)` | `boolean` | no | service role |
| `catalog_acquisition_identity_match(p_queue_identity text, p_queue_pet_type text, p_catalog_identity text, p_catalog_pet_type text)` | `boolean` | no | service role |
| `catalog_acquisition_identity_normalize(p_value text)` | `text` | no | service role |
| `catalog_acquisition_identity_tokens(p_value text, p_tokens text[])` | `text[]` | no | service role |
| `catalog_acquisition_legacy_token_subset_duplicate_match(p_legacy_identity text, p_legacy_pet_type text, p_catalog_identity text, p_catalog_pet_type text)` | `boolean` | no | service role |
| `catalog_acquisition_life_stage_terms_match(p_query_identity text, p_candidate_identity text)` | `boolean` | no | service role |
| `catalog_acquisition_package_count_match(p_queued_identity text, p_matched_identity text)` | `boolean` | no | service role |
| `catalog_acquisition_package_count_terms(p_text text)` | `integer[]` | no | service role |
| `catalog_acquisition_protected_line_terms_match(p_query_identity text, p_candidate_identity text)` | `boolean` | no | service role |
| `catalog_acquisition_reconcile_checked_at(p_metadata jsonb)` | `timestamp with time zone` | no | service role |
| `catalog_acquisition_size_terms_match(p_query_identity text, p_candidate_identity text)` | `boolean` | no | service role |
| `catalog_acquisition_special_food_form_source_identity_match(p_legacy_identity text, p_legacy_pet_type text, p_candidate_source_identity text, p_candidate_pet_type text)` | `boolean` | no | service role |
| `catalog_acquisition_strict_search_high_confidence(p_queue_brand text, p_queue_product_name text, p_queue_pet_type text, p_matched_brand text, p_matched_identity text, p_matched_pet_type text, p_rank real)` | `boolean` | no | service role |
| `catalog_acquisition_verified_brand_alias_match(p_queue_brand text, p_matched_brand text, p_matched_source text)` | `boolean` | no | service role |
| `catalog_amazon_formula_title(p_title text)` | `text` | no | client role |
| `catalog_backfill_formula_evidence_tiers(p_after_id bigint, p_limit integer)` | `jsonb` | yes | service role |
| `catalog_backfill_observation_evidence_tiers(p_after_id bigint, p_limit integer)` | `jsonb` | yes | service role |
| `catalog_backfill_product_evidence_tiers(p_after_id uuid, p_limit integer)` | `jsonb` | yes | service role |
| `catalog_backfill_product_formula_version_payload(p_after_id uuid, p_limit integer)` | `jsonb` | yes | service role |
| `catalog_canonical_retailer_brand_boundary(p_value text)` | `text` | no | service role |
| `catalog_classify_formula_evidence_tier(p_verification_status text, p_source_authority text, p_ingredient_status text, p_image_status text, p_is_complete_food boolean, p_has_version_conflict boolean)` | `text` | no | client role |
| `catalog_duplicate_closure_audit(p_brands text[], p_closers text[], p_sample_limit integer)` | `jsonb` | no | service role |
| `catalog_has_ingredient_ocr_artifacts(value text)` | `boolean` | no | client role |
| `catalog_has_unbalanced_parentheses(value text)` | `boolean` | no | client role |
| `catalog_has_unbalanced_square_brackets(value text)` | `boolean` | no | client role |
| `catalog_normalize_exact_ingredient_identity(p_value text)` | `text` | no | service role |
| `catalog_normalize_ingredient_evidence(p_value text)` | `text` | no | service role |
| `catalog_normalize_retailer_boundary(p_value text)` | `text` | no | service role |
| `catalog_normalize_retailer_serving_ingredient_text(p_value text)` | `text` | no | service role |
| `catalog_normalize_retailer_title(value text)` | `text` | no | service role |
| `catalog_product_evidence_gap_summary(p_limit integer)` | `jsonb` | no | service role |
| `catalog_product_feed_identity_key(p_brand text, p_product_name text)` | `text` | no | service role |
| `catalog_quality_state(p_pet_type text, p_is_complete_food boolean, p_catalog_exclusion_reason text, p_ingredient_text text, p_ingredient_count integer, p_ingredient_verification_status text, p_image_url text, p_image_verification_status text, p_source_url text, p_expires_at timestamp with time zone)` | `text` | no | client role |
| `catalog_retailer_formula_hard_boundaries_match(p_evidence_brand text, p_evidence_pet_type text, p_evidence_life_stage text, p_evidence_food_form text, p_evidence_flavor text, p_evidence_diet_condition text, p_formula_brand text, p_formula_pet_type text, p_formula_life_stage text, p_formula_food_form text, p_formula_flavor text, p_formula_diet_condition text)` | `boolean` | no | service role |
| `catalog_retailer_ingredient_is_serving_safe(value text)` | `boolean` | no | service role |
| `catalog_retailer_ingredient_normalization_codes(p_value text)` | `text[]` | no | service role |
| `catalog_retailer_ingredient_statement_is_complete(p_statement text)` | `boolean` | no | service role |
| `catalog_retailer_serving_ingredient_count(p_value text)` | `integer` | no | service role |
| `catalog_reviewed_pdp_title_token_recall(p_expected text, p_observed text)` | `numeric` | no | service role |
| `catalog_search_unaccent(value text)` | `text` | no | client role |
| `catalog_source_pet_type_inference(p_existing_pet_type text, p_source text, p_product_name text, p_brand text, p_cache_key text, p_source_url text)` | `text` | no | service role |
| `catalog_split_ingredient_statement(value text)` | `text[]` | no | service role |
| `catalog_strict_reconcile_audit(p_brands text[], p_since timestamp with time zone, p_sample_limit integer)` | `jsonb` | no | service role |
| `catalog_strip_retailer_formula_code(p_value text)` | `text` | no | service role |
| `catalog_strip_trailing_formula_code(value text)` | `text` | no | service role |
| `catalog_sync_formula_version()` | `trigger` | yes | service role |
| `catalog_sync_product_formula_version()` | `trigger` | yes | service role |
| `catalog_verified_search_retailer_identity_covered(p_query_norm text, p_identity_lc text, p_brand_lc text)` | `boolean` | no | client role |
| `check_ip_rate_limit(p_ip_address text, p_max_requests integer, p_window_minutes integer)` | `boolean` | yes | service role |
| `check_rate_limit(p_user_id uuid, p_max_requests integer, p_window_minutes integer)` | `boolean` | yes | service role |
| `classify_catalog_acquisition_queue_row()` | `trigger` | no | service role |
| `clean_product_display_text(value text)` | `text` | no | service role |
| `cleanup_expired_cache()` | `integer` | yes | service role |
| `cleanup_stale_ip_rate_limits()` | `integer` | yes | service role |
| `cleanup_stale_rate_limits()` | `integer` | yes | service role |
| `close_resolved_catalog_lookup_gaps(p_resolved_at timestamp with time zone, p_limit integer)` | `jsonb` | yes | service role |
| `close_stale_catalog_acquisition_queue_gaps(p_resolved_at timestamp with time zone)` | `jsonb` | no | service role |
| `consume_scan(p_user_id uuid, p_scan_id text, p_scan_mode text, p_free_limit integer)` | `jsonb` | yes | client role |
| `delete_own_account()` | `void` | yes | client role |
| `enforce_catalog_sku_gtin_formula_consistency()` | `trigger` | no | service role |
| `enforce_product_data_ingredient_contract()` | `trigger` | no | client role |
| `enqueue_catalog_lookup_miss()` | `trigger` | yes | service role |
| `enrich_retailer_package_evidence(p_import_run_id uuid, p_payload jsonb)` | `TABLE(updated_rows integer, rejected_rows integer)` | yes | service role |
| `exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(p_brand text, p_max_rows integer)` | `jsonb` | no | service role |
| `exclude_direct_verified_identity_duplicate_legacy_catalog_rows_(p_brand text, p_max_rows integer)` | `jsonb` | no | service role |
| `exclude_unknown_species_legacy_duplicate_rows_for_brand(p_brand text, p_max_rows integer)` | `jsonb` | no | service role |
| `exclude_verified_duplicate_legacy_catalog_rows_for_brand(p_brand text, p_max_rows integer)` | `jsonb` | no | service role |
| `get_brand_profile(p_candidates text[])` | `TABLE(primary_processing text, processing_methods text[], testing_transparency text, testing_details text, certifications text[], third_party_tested boolean, country_of_manufacture text, metadata_source text, metadata_confidence numeric, matched_metadata_brand text, recall_severity text, recall_count integer, recall_most_recent_date date, recall_summary text, matched_recall_brand text)` | no | client role |
| `get_brand_recall_summary(p_brand_normalized text)` | `TABLE(severity text, recall_count integer, most_recent_date date, oldest_date date, summary text)` | no | client role |
| `get_brands_needing_metadata(p_min_scans integer, p_limit integer)` | `TABLE(brand text, product_count integer)` | no | service role |
| `get_human_food_count_today(p_user_id uuid)` | `integer` | yes | client role |
| `get_label_resolution_config()` | `jsonb` | no | client role |
| `get_verified_retailer_source_aliases(p_offset integer, p_limit integer)` | `TABLE(source_url text, cache_key text, alias_text text, source_authority text, evidence_observed_at timestamp with time zone)` | yes | service role |
| `get_verified_retailer_source_aliases_keyset(p_after_id bigint, p_limit integer)` | `TABLE(alias_id bigint, source_url text, cache_key text, alias_text text, source_authority text, evidence_observed_at timestamp with time zone)` | yes | service role |
| `gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)` | `internal` | no | client role |
| `gin_extract_value_trgm(text, internal)` | `internal` | no | client role |
| `gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)` | `boolean` | no | client role |
| `gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)` | `"char"` | no | client role |
| `gtrgm_compress(internal)` | `internal` | no | client role |
| `gtrgm_consistent(internal, text, smallint, oid, internal)` | `boolean` | no | client role |
| `gtrgm_decompress(internal)` | `internal` | no | client role |
| `gtrgm_distance(internal, text, smallint, oid, internal)` | `double precision` | no | client role |
| `gtrgm_in(cstring)` | `gtrgm` | no | client role |
| `gtrgm_options(internal)` | `void` | no | client role |
| `gtrgm_out(gtrgm)` | `cstring` | no | client role |
| `gtrgm_penalty(internal, internal, internal)` | `internal` | no | client role |
| `gtrgm_picksplit(internal, internal)` | `internal` | no | client role |
| `gtrgm_same(gtrgm, gtrgm, internal)` | `internal` | no | client role |
| `gtrgm_union(internal, internal)` | `gtrgm` | no | client role |
| `guard_catalog_field_evidence_ingredient_version()` | `trigger` | no | client role |
| `guard_catalog_sku_formula_ingredient_version()` | `trigger` | no | client role |
| `guard_retailer_formula_hard_boundaries()` | `trigger` | yes | service role |
| `handle_new_user()` | `trigger` | yes | service role |
| `import_purina_gatsby_product_feed(p_urls text[], p_source text, p_expected_brand text, p_max_rows integer)` | `TABLE(attempted_rows integer, fetched_rows integer, prepared_rows integer, upserted_rows integer, skipped jsonb)` | no | service role |
| `increment_cache_hit(p_key text)` | `void` | yes | client role |
| `increment_human_food_count(p_user_id uuid)` | `integer` | yes | client role |
| `increment_scan_count(p_user_id uuid)` | `integer` | yes | client role |
| `is_likely_non_product_catalog_row(p_product_name text, p_brand text)` | `boolean` | no | service role |
| `is_plausible_product_ingredient(value text)` | `boolean` | no | service role |
| `link_retailer_ingredient_evidence(p_import_run_id uuid)` | `TABLE(linked_with_image integer, linked_missing_image integer, unmatched_rows integer)` | yes | service role |
| `log_product_event(p_event_name text, p_session_id text, p_metadata jsonb)` | `void` | yes | client role |
| `materialize_cross_retailer_web_formulas(p_import_run_id uuid, p_limit integer)` | `TABLE(selected_rows integer, created_formula_rows integer, promotable_rows integer, remaining_rows integer)` | yes | service role |
| `materialize_retailer_web_formulas(p_import_run_id uuid, p_limit integer)` | `TABLE(selected_rows integer, linked_existing_rows integer, created_formula_rows integer, promotable_rows integer, remaining_rows integer)` | yes | service role |
| `normalize_product_catalog_name(value text)` | `text` | no | service role |
| `normalize_verified_product_search_query(q text)` | `text` | no | client role |
| `normalize_verified_product_search_query_v1(q text)` | `text` | no | client role |
| `promote_catalog_formula(p_formula_id bigint)` | `TABLE(cache_key text, product_name text, brand text, source_url text)` | yes | service role |
| `promote_catalog_formula_without_completed_run_gate(p_formula_id bigint)` | `TABLE(cache_key text, product_name text, brand text, source_url text)` | no | restricted |
| `promote_catalog_formula_without_exact_evidence_reuse(p_formula_id bigint)` | `TABLE(cache_key text, product_name text, brand text, source_url text)` | no | restricted |
| `promote_ready_manufacturer_gap_evidence(p_extraction_run_key text, p_accepted_run_key text, p_expected_ready_count integer, p_expected_new_formula_count integer)` | `jsonb` | yes | service role |
| `promote_repaired_retailer_hard_identities(p_limit integer)` | `TABLE(selected_rows integer, promoted_rows integer, remaining_rows integer)` | yes | service role |
| `promote_retailer_ingredient_versions(p_import_run_id uuid, p_limit integer)` | `TABLE(promoted_evidence_rows integer, promoted_serving_rows integer, remaining_rows integer)` | yes | service role |
| `promote_reviewed_retailer_package_batch(p_review_run_key text, p_accepted_run_key text, p_accepted_source_slug text, p_expected_observation_count integer, p_expected_formula_count integer, p_review_evidence_note text)` | `jsonb` | yes | service role |
| `purina_absolute_url(p_path text)` | `text` | no | service role |
| `purina_compact_text(p_value text)` | `text` | no | service role |
| `purina_fetch_gatsby_node(p_source_url text)` | `jsonb` | no | service role |
| `purina_gatsby_ingredient_names(p_node jsonb)` | `text[]` | no | service role |
| `purina_gatsby_node_gtin(p_node jsonb)` | `text` | no | service role |
| `purina_gatsby_node_image_url(p_node jsonb)` | `text` | no | service role |
| `purina_gatsby_node_package_size(p_node jsonb)` | `text` | no | service role |
| `purina_gatsby_node_title(p_node jsonb)` | `text` | no | service role |
| `purina_gatsby_node_url(p_node jsonb, p_fallback_url text)` | `text` | no | service role |
| `purina_gatsby_page_data_url(p_source_url text)` | `text` | no | service role |
| `purina_has_complete_food_evidence(p_ingredients text[])` | `boolean` | no | service role |
| `purina_infer_food_form(p_title text)` | `text` | no | service role |
| `purina_infer_pet_type(p_title text, p_url text)` | `text` | no | service role |
| `purina_is_complete_food_candidate(p_title text, p_url text)` | `boolean` | no | service role |
| `purina_normalized_key(p_value text)` | `text` | no | service role |
| `purina_unique_text_array(p_values text[])` | `text[]` | no | service role |
| `queue_all_retailer_evidence_work(p_import_run_id uuid)` | `TABLE(unmatched_queue_items integer, image_queue_items integer, fetch_queue_items integer, validation_queue_items integer)` | yes | service role |
| `queue_retailer_ingredient_gaps(p_import_run_id uuid)` | `TABLE(unmatched_queue_items integer, image_queue_items integer)` | yes | service role |
| `reconcile_catalog_acquisition_queue()` | `jsonb` | no | service role |
| `reconcile_catalog_acquisition_queue_batch(p_max_rows integer)` | `jsonb` | no | service role |
| `reconcile_catalog_acquisition_queue_strict_search(p_max_rows integer)` | `jsonb` | no | service role |
| `reconcile_catalog_acquisition_queue_strict_search_for_brand(p_brand text, p_max_rows integer)` | `jsonb` | no | service role |
| `reconcile_catalog_amazon_exact_existing_evidence()` | `jsonb` | yes | service role |
| `reconcile_catalog_amazon_strict_existing_evidence()` | `jsonb` | yes | service role |
| `reconcile_retailer_ingredient_evidence(p_import_run_id uuid, p_limit integer)` | `TABLE(linked_rows integer, promoted_rows integer, missing_image_rows integer, unmatched_rows integer, remaining_rows integer)` | yes | service role |
| `reconcile_retailer_unique_ingredient_formulas(p_import_run_id uuid, p_source_slug text, p_limit integer)` | `TABLE(reconciled_rows integer)` | yes | service role |
| `reconcile_walmart_unique_ingredient_formulas(p_import_run_id uuid, p_limit integer)` | `TABLE(reconciled_rows integer)` | yes | service role |
| `record_catalog_brand_ranking_snapshot(p_snapshot jsonb, p_rankings jsonb)` | `bigint` | no | service role |
| `record_catalog_coverage_breakdown(p_snapshot_key text, p_breakdown jsonb)` | `jsonb` | no | service role |
| `record_catalog_coverage_snapshot(p_report jsonb)` | `bigint` | no | service role |
| `record_catalog_gap_evidence_extraction_batch(p_run jsonb, p_results jsonb)` | `jsonb` | yes | service role |
| `record_catalog_major_brand_registry(p_snapshot jsonb, p_brands jsonb, p_waves jsonb)` | `bigint` | no | service role |
| `recover_normalized_retailer_evidence(p_import_run_id uuid, p_source_slug text, p_limit integer)` | `TABLE(updated_rows integer)` | yes | service role |
| `refresh_catalog_acquisition_queue(p_days integer, p_limit integer)` | `jsonb` | no | service role |
| `refresh_catalog_amazon_evidence_queue()` | `jsonb` | yes | service role |
| `refresh_catalog_brand_batch_status(p_snapshot_id bigint, p_batch_number integer)` | `catalog_brand_batch_status` | no | service role |
| `refresh_current_retailer_ingredient_evidence(p_import_run_id uuid)` | `TABLE(current_rows integer, superseded_rows integer)` | yes | service role |
| `refresh_retailer_import_run_metrics(p_import_run_id uuid)` | `TABLE(imported_rows integer, verified_ready_rows integer, remaining_rows integer)` | yes | service role |
| `rehydrate_exact_manufacturer_source_versions(p_identity_hash text, p_brand text, p_product_name text, p_ingredients text, p_image_url text, p_source_url text)` | `TABLE(selected_rows integer, created_formula_rows integer, upserted_serving_rows integer, recorded_evidence_rows integer)` | no | service role |
| `rehydrate_exact_retailer_source_versions(p_payload jsonb)` | `TABLE(selected_rows integer, created_formula_rows integer, upserted_serving_rows integer, upserted_source_aliases integer)` | yes | service role |
| `resolve_verified_product_by_gtin(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | client role |
| `resolve_verified_product_by_gtin_unfiltered(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | service role |
| `reverse_scan(p_user_id uuid, p_scan_id text, p_reversal_reason text)` | `jsonb` | yes | service role |
| `save_product_data(p_cache_key text, p_product_name text, p_brand text, p_ingredients text[], p_ingredient_text text, p_ingredient_count integer, p_source text, p_image_url text)` | `void` | yes | service role |
| `save_product_data_with_nutrients(p_cache_key text, p_product_name text, p_brand text, p_ingredients text[], p_ingredient_text text, p_ingredient_count integer, p_source text, p_image_url text, p_nutrient_panel jsonb)` | `void` | yes | service role |
| `search_products(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | client role |
| `search_verified_product_identities_for_label(queries text[], max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, source_url text, rank real)` | no | client role |
| `search_verified_products(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | client role |
| `search_verified_products_base_v2(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | restricted |
| `search_verified_products_for_label_fast(queries text[], max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | client role |
| `search_verified_products_for_label_ocr(queries text[], max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | client role |
| `search_verified_products_for_label_ocr_text(ocr_text text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | client role |
| `search_verified_products_ranked_v1(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | client role |
| `search_verified_products_species_embedded_v1(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | restricted |
| `search_verified_products_species_filter_v2(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | restricted |
| `search_verified_products_unfiltered_gtin_v1(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | service role |
| `search_verified_products_unprotected_age_v1(q text, max_results integer)` | `TABLE(cache_key text, product_name text, brand text, gtin text, product_line text, flavor text, life_stage text, food_form text, package_size text, pet_type text, ingredient_count integer, source text, source_quality text, ingredient_verification_status text, image_verification_status text, verified_at timestamp with time zone, image_url text, ingredients text[], ingredient_text text, nutritional_info jsonb, nutrient_panel jsonb, has_published_nutrients boolean, source_url text, rank real)` | yes | service role |
| `set_limit(real)` | `real` | no | client role |
| `show_limit()` | `real` | no | client role |
| `show_trgm(text)` | `text[]` | no | client role |
| `similarity(text, text)` | `real` | no | client role |
| `similarity_dist(text, text)` | `real` | no | client role |
| `similarity_op(text, text)` | `boolean` | no | client role |
| `stage_catalog_census_batch(p_run jsonb, p_observations jsonb)` | `jsonb` | no | service role |
| `stage_catalog_census_batch_unfiltered(p_run jsonb, p_observations jsonb)` | `jsonb` | no | service role |
| `stage_catalog_census_batch_without_exact_gtin_identity_guard(p_run jsonb, p_observations jsonb)` | `jsonb` | no | service role |
| `stage_catalog_census_batch_without_exact_gtin_link(p_run jsonb, p_observations jsonb)` | `jsonb` | no | service role |
| `stage_catalog_census_batch_without_formula_rekey(p_run jsonb, p_observations jsonb)` | `jsonb` | no | service role |
| `stage_catalog_census_batch_without_identity_resolution(p_run jsonb, p_observations jsonb)` | `jsonb` | no | service role |
| `stage_catalog_census_batch_without_ingredient_artifact_gate(p_run jsonb, p_observations jsonb)` | `jsonb` | no | service role |
| `stage_catalog_census_members(p_snapshot_key text, p_members jsonb)` | `jsonb` | no | service role |
| `stage_catalog_census_members_without_formula_ledger(p_snapshot_key text, p_members jsonb)` | `jsonb` | no | service role |
| `stage_retailer_ingredient_evidence(p_import_run_id uuid, p_payload jsonb)` | `TABLE(inserted_rows integer, updated_rows integer)` | yes | service role |
| `strict_word_similarity(text, text)` | `real` | no | client role |
| `strict_word_similarity_commutator_op(text, text)` | `boolean` | no | client role |
| `strict_word_similarity_dist_commutator_op(text, text)` | `real` | no | client role |
| `strict_word_similarity_dist_op(text, text)` | `real` | no | client role |
| `strict_word_similarity_op(text, text)` | `boolean` | no | client role |
| `submit_catalog_ingredient_capture(p_product_name text, p_brand text, p_pet_type text, p_normalized_query text, p_cache_key text, p_gtin text, p_ingredient_text text, p_ingredients jsonb, p_metadata jsonb)` | `jsonb` | no | client role |
| `submit_catalog_ingredient_capture(p_product_name text, p_brand text, p_pet_type text, p_normalized_query text, p_cache_key text, p_gtin text, p_ingredient_text text, p_ingredients jsonb, p_metadata jsonb, p_user_consent boolean)` | `jsonb` | yes | client role |
| `submit_catalog_ingredient_capture_without_explicit_consent(p_product_name text, p_brand text, p_pet_type text, p_normalized_query text, p_cache_key text, p_gtin text, p_ingredient_text text, p_ingredients jsonb, p_metadata jsonb)` | `jsonb` | yes | restricted |
| `sync_retailer_formula_promotions(p_import_run_id uuid)` | `TABLE(updated_formulas integer, upserted_gtins integer)` | yes | service role |
| `sync_retailer_serving_normalization_provenance(p_import_run_id uuid)` | `TABLE(updated_rows integer)` | yes | service role |
| `sync_retailer_verified_search_aliases(p_import_run_id uuid)` | `TABLE(inserted_rows integer)` | yes | service role |
| `sync_retailer_verified_source_aliases(p_import_run_id uuid)` | `TABLE(upserted_rows integer)` | yes | service role |
| `sync_retailer_web_formula_identity(p_import_run_id uuid)` | `TABLE(updated_formulas integer, updated_serving_rows integer)` | yes | service role |
| `sync_strict_exact_retailer_source_aliases(p_limit integer)` | `TABLE(selected_rows integer, upserted_rows integer, remaining_rows integer)` | yes | service role |
| `touch_brand_metadata_updated_at()` | `trigger` | no | service role |
| `update_product_nutrient_panel(p_cache_key text, p_nutrient_panel jsonb)` | `boolean` | yes | service role |
| `upsert_catalog_product_feed(payload jsonb)` | `TABLE(cache_key text, product_name text, brand text, source_url text)` | no | service role |
| `word_similarity(text, text)` | `real` | no | client role |
| `word_similarity_commutator_op(text, text)` | `boolean` | no | client role |
| `word_similarity_dist_commutator_op(text, text)` | `real` | no | client role |
| `word_similarity_dist_op(text, text)` | `real` | no | client role |
| `word_similarity_op(text, text)` | `boolean` | no | client role |

### 14.7 Triggers

**Live:** 18 information-schema trigger event rows represent 10 named triggers.

| Table | Trigger | Event | Function |
|---|---|---|---|
| `brand_metadata` | `trg_brand_metadata_updated_at` | BEFORE UPDATE | `EXECUTE FUNCTION touch_brand_metadata_updated_at()` |
| `catalog_acquisition_queue` | `classify_catalog_acquisition_queue_row` | BEFORE INSERT | `EXECUTE FUNCTION classify_catalog_acquisition_queue_row()` |
| `catalog_acquisition_queue` | `classify_catalog_acquisition_queue_row` | BEFORE UPDATE | `EXECUTE FUNCTION classify_catalog_acquisition_queue_row()` |
| `catalog_field_evidence` | `guard_catalog_field_evidence_ingredient_version` | BEFORE INSERT | `EXECUTE FUNCTION guard_catalog_field_evidence_ingredient_version()` |
| `catalog_field_evidence` | `guard_catalog_field_evidence_ingredient_version` | BEFORE UPDATE | `EXECUTE FUNCTION guard_catalog_field_evidence_ingredient_version()` |
| `catalog_formulas` | `catalog_formulas_sync_formula_version_trigger` | BEFORE INSERT | `EXECUTE FUNCTION catalog_sync_formula_version()` |
| `catalog_formulas` | `catalog_formulas_sync_formula_version_trigger` | BEFORE UPDATE | `EXECUTE FUNCTION catalog_sync_formula_version()` |
| `catalog_retailer_ingredient_evidence` | `guard_retailer_formula_hard_boundaries` | BEFORE INSERT | `EXECUTE FUNCTION guard_retailer_formula_hard_boundaries()` |
| `catalog_retailer_ingredient_evidence` | `guard_retailer_formula_hard_boundaries` | BEFORE UPDATE | `EXECUTE FUNCTION guard_retailer_formula_hard_boundaries()` |
| `catalog_skus` | `enforce_catalog_sku_gtin_formula_consistency` | AFTER INSERT | `EXECUTE FUNCTION enforce_catalog_sku_gtin_formula_consistency()` |
| `catalog_skus` | `enforce_catalog_sku_gtin_formula_consistency` | AFTER UPDATE | `EXECUTE FUNCTION enforce_catalog_sku_gtin_formula_consistency()` |
| `catalog_skus` | `guard_catalog_sku_formula_ingredient_version` | BEFORE INSERT | `EXECUTE FUNCTION guard_catalog_sku_formula_ingredient_version()` |
| `catalog_skus` | `guard_catalog_sku_formula_ingredient_version` | BEFORE UPDATE | `EXECUTE FUNCTION guard_catalog_sku_formula_ingredient_version()` |
| `product_data` | `product_data_sync_formula_version_trigger` | BEFORE INSERT | `EXECUTE FUNCTION catalog_sync_product_formula_version()` |
| `product_data` | `product_data_sync_formula_version_trigger` | BEFORE UPDATE | `EXECUTE FUNCTION catalog_sync_product_formula_version()` |
| `product_data` | `trg_product_data_ingredient_contract` | BEFORE INSERT | `EXECUTE FUNCTION enforce_product_data_ingredient_contract()` |
| `product_data` | `trg_product_data_ingredient_contract` | BEFORE UPDATE | `EXECUTE FUNCTION enforce_product_data_ingredient_contract()` |
| `product_events` | `enqueue_catalog_lookup_miss_trigger` | AFTER INSERT | `EXECUTE FUNCTION enqueue_catalog_lookup_miss()` |

### 14.8 Views

**Live:** 22 public views exist and every one reports `security_invoker=true`; there are no public materialized views.

Catalog views:

- `catalog_current_coverage`
- `catalog_formula_evidence_tier_summary`

KPI views:

- Activation cohorts.
- Analysis cache health.
- App errors by release/day.
- App release health.
- App review performance.
- Apple Search Ads attribution.
- Daily funnel.
- Event daily.
- Onboarding path.
- Paid-acquisition readiness.
- Paywall daily, pitch, and source.
- Retention.
- RevenueCat.
- Scan failures and usage.
- Sharing.
- Support.
- User lifecycle.

## 15. Live Edge Functions

| Function | Live version | JWT setting | Role |
|---|---:|---|---|
| `analyze` | 74 | Gateway JWT disabled; function validates bearer user itself | Claude pet-food/photo/verified-data/human-food/label modes, scan consumption/reversal, stream validation/cache |
| `product-lookup` | 59 | Required | Barcode/product identity lookup and verified catalog resolution |
| `label-lookup` | 19 | Required | Bounded label identification and catalog candidates |
| `revenuecat-webhook` | 9 | Disabled; verifies webhook authorization in function | Idempotent purchase lifecycle webhook and server profile update |
| `revenuecat-sync` | 4 | Required | Authenticated subscriber lookup/reconciliation after purchase/restore/session |
| `catalog-feed-import-temp` | 2 | Required | Temporary historical/admin catalog import function; not a customer flow |

`analyze` live deployment marker is `2026-08-23-edge-eric-nutrient-balance-v1`. Its image base64 limit is 2,400,000 characters (approximately 1.8 MB decoded), general field limit is 10,000 characters, and Claude max tokens vary by mode (label lookup 512, human food 2,048, pet-food analysis up to 8,192).

The temporary feed-import function should be removed or formally documented once no longer needed; a live temporary admin surface is unnecessary attack/maintenance area even with JWT enabled.

## 16. Local storage and offline state

Important AsyncStorage namespaces:

- `@woof_onboarding_complete` — onboarding completion.
- `@woof_scan_count:<userId>` plus legacy `@woof_scan_count` migration — display fallback only; server accounting is authoritative.
- `@woof_analytics_session_id` — analytics session.
- `@woof_analytics_queue` — at most 100 queued events.
- `@woof/scan_history_<userId>` plus legacy migration keys — local history.
- `@woof_result_<cacheKey>` and result-key list — up to 30 local results.
- `@woof_catalog_search_cache_v7:<query>` plus index — up to 50 seven-day verified-search entries, 25 products each.
- `@woof_label_resolution_config_v2` — 15-minute remote resolution-policy cache.
- `@woof_catalog_evidence_consent_v1` — remembered private/share consent.
- `@woof/catalog_contributions` — pending contribution closure records.
- `@woof/last_human_food_pet_type` — last dog/cat choice for the picker.
- User-scoped first-scan and post-scan prompt state.
- User-scoped guest-save prompt state.
- User-scoped review successes, prompts, prompt time/success count, and completion.
- Catalog coverage/event session helpers.

History behavior:

- Save locally even when network sync is unavailable.
- For an authenticated/anonymous session, merge unsynced local entries with server history.
- Guest identity linking migrates source user history to the new user and upserts by `id,user_id`.
- Human-food snapshots remove internal `__scanUsage` and must serialize under 60,000 characters.
- History listing avoids loading large analysis payloads by default.
- Delete/sign-out/account cleanup removes the correct user-scoped keys.
- Cached search/results/history can paint while a network refresh is pending, but new auth, new AI analysis, server scan authority, and a cache miss still require network. “Offline-ish” is recovery behavior, not a promise of full offline scanning.

## 17. Authentication and identity details

### Supabase client configuration

- Uses the public/anon client key.
- Persists sessions to AsyncStorage.
- Auto-refreshes tokens.
- Does not infer sessions from arbitrary browser URLs (`detectSessionInUrl=false`).

### Identity types

- Anonymous Supabase user: default first-run identity.
- Apple account.
- Google account.
- Linked guest: guest data preserved as identity becomes durable.

### Linking safety

- Manual identity linking is required to preserve anonymous data; a separate sign-in can create a different user ID.
- The app compares before/after user IDs and migrates local/server history when necessary.
- RevenueCat logs into/reidentifies the durable ID.
- Analytics queued under a different user is dropped rather than attributed to the new identity.

### Account deletion scope

The app and RPC are intended to delete or unlink:

- Auth identity/account.
- Profile.
- Scan history.
- Scan usage.
- Linkable analytics/operational records.
- Linkable RevenueCat webhook state where applicable.
- Local history/results/scan/prompt/review/analytics state.
- Local RevenueCat SDK state.

## 18. Monetization and Woof Pro

### Free tier

- Three server-enforced scans.
- Overall score, quick facts, verdict, source/verification, and exact ingredient list remain visible in the current implementation.
- Local/server history, history search/filter/compare, and reopening restorable results remain available; history is not sold as a Pro-only capability.
- Full ingredient explanations, category breakdown, Nutrition Facts, continued unlimited scanning, and durable Pro positioning are monetized.
- The server can block a fourth attempt regardless of local storage manipulation.

### Pro tier

- Unlimited pet-food and human-food checks.
- Detailed ingredient explanations.
- Full quality category breakdown.
- Detailed published nutrition section.
- Unlimited checks after the three-scan free limit.

### Paywall sources and copy intent

| Source | Customer context |
|---|---|
| `results_gate` | Unlock details behind this exact scan |
| `scan_limit` | Continue scanning after free limit |
| `post_scan_prompt` | Keep comparing after useful scans |
| `home_banner` | Shopping-mode unlimited checks |
| `profile` | Upgrade/manage the existing account |

Local variant: `monthly_default_v1`. RevenueCat offering metadata can override a safe identifier, default plan, headline, and positioning through a bounded allowlist. The UI rejects remote copy containing competitor names, reviews/ratings, recalls, veterinary approval, guaranteed safety, or medical-diagnosis claims.

### Plan presentation

- Weekly.
- Monthly — local default and “Popular.”
- Annual — “Best Value,” with annual-versus-monthly savings shown only when calculable from actual store prices.
- Trial CTA and timeline appear only when RevenueCat/store eligibility says the selected product can claim a trial.
- Unavailable/missing package has a disabled, explicit state.

**Tested:** free result visibility is shown in [`05-exact-match-free-result.png`](context-evidence/2026-08-23/screenshots/05-exact-match-free-result.png); the full Pro fixture is [`13-pro-full-result.png`](context-evidence/2026-08-23/screenshots/13-pro-full-result.png); offerings failure/Retry is [`19-paywall-offerings-retry.png`](context-evidence/2026-08-23/screenshots/19-paywall-offerings-retry.png). Real store products were unavailable, so purchase/restore remains **Open**.

### RevenueCat authority model

- Public SDK keys initialize on the client; Expo Go cannot use production store keys.
- Entitlement ID: `pro`.
- CustomerInfo active entitlement and active subscription identifiers are recorded only in bounded analytics fields.
- Purchase/restore success is not enough; the app refreshes entitlement state and server profile.
- `revenuecat-webhook` handles initial purchase, renewal, cancellation, expiration, product change, and test events.
- `revenuecat-sync` queries RevenueCat's subscriber API and reconciles the profile.
- Server profile is not promoted when the external subscriber state does not prove Pro.
- Subscription management URL is stored when supplied.
- Apple Search Ads attribution collection is requested through RevenueCat AdServices support on iOS and tracked.

## 19. Analytics and measurement

### 19.1 Collection rules

- Analytics must never block product behavior.
- Event name is normalized to at most 80 characters.
- Properties are limited to 40 keys, arrays to 20 elements, object depth to 3, strings to 500 characters.
- Emails, URLs, local file paths, JWTs, secret-like tokens, and long base64 are redacted.
- Release context is attached: platform/version, app version, native build, runtime version, EAS project, execution environment.
- Signed-out/temporarily sessionless events can queue locally; queue max is 100.
- Queue flush attributes only events captured under the same/null identity; mismatched legacy events are dropped and measured.

### 19.2 Event inventory

#### Onboarding and auth

`onboarding_started`, `onboarding_step_viewed`, `onboarding_continue_tapped`, `onboarding_scan_now_tapped`, `onboarding_completed`, `auth_viewed`, `anonymous_sign_in_started`, `anonymous_signed_in`, `anonymous_sign_in_failed`, `guest_continue_started`, `guest_continue_completed`, `guest_continue_failed`, `auth_sign_in_started`, `auth_sign_in_completed_client`, `auth_sign_in_cancelled`, `auth_sign_in_failed`, `auth_signed_in`, `auth_signed_out`, `guest_upgrade_started`, `guest_upgrade_completed`, `guest_upgrade_cancelled`, `guest_upgrade_failed`, `guest_history_migration_completed`, `guest_history_migration_skipped`, `guest_history_migration_failed`, `account_link_revenuecat_reidentified`.

#### Scan, camera, OCR, label, and analysis

`scan_cta_tapped`, `scanner_viewed`, `scanner_help_opened`, `camera_permission_requested`, `camera_permission_result`, `camera_permission_request_failed`, `camera_permission_settings_opened`, `camera_permission_settings_failed`, `barcode_detected`, `barcode_not_found`, `photo_capture_started`, `photo_capture_completed`, `photo_capture_cancelled`, `photo_capture_failed`, `photo_capture_too_large`, `analysis_upload_started`, `analysis_image_retry_suppressed`, `scan_analysis_started`, `scan_analysis_completed`, `scan_analysis_failed`, `scan_analysis_timeout`, `scan_analysis_cancelled`, `free_scan_count_synced_after_failure`, `scan_blocked_by_limit`, `scan_limit_recovery_started`, `scan_limit_recovery_retried`, `scan_limit_recovery_retry_unavailable`, `scan_limit_recovery_not_pro`, `label_lookup_started`, `label_lookup_parallel_started`, `label_ocr_completed`, `label_lookup_completed`, `label_lookup_failed`, `take_photo_again_tapped`, `scan_retry_tapped`, `scan_another_tapped`, `human_food_pet_selected`.

#### Search and catalog

`catalog_search_submitted`, `catalog_search_completed`, `catalog_search_failed`, `catalog_search_cache_hit`, `catalog_search_cleared`, `catalog_search_home_cleared`, `catalog_product_hydration_completed`, `catalog_label_scan_tapped`, `catalog_label_retry_tapped`, `catalog_label_none_of_these`, `catalog_ingredient_capture_tapped`, `ingredient_capture_tapped`, `catalog_ingredient_capture_submitted`, `catalog_ingredient_capture_submit_failed`.

#### Results, history, prompts, and sharing

`guest_save_prompt_viewed`, `guest_save_prompt_provider_tapped`, `guest_save_prompt_completed`, `guest_save_prompt_cancelled`, `guest_save_prompt_dismissed`, `guest_save_prompt_failed`, `post_scan_prompt_viewed`, `post_scan_prompt_dismissed`, `history_item_opened`, `history_result_requested`, `history_result_loaded`, `history_result_failed`, `history_result_unavailable`, `history_result_rescan_tapped`, `history_search_started`, `history_search_submitted`, `history_search_cleared`, `history_filter_changed`, `history_filters_cleared`, `history_compare_opened`, `history_compare_closed`, `history_compare_result_opened`, `history_cleared`, `share_started`, `share_completed`, `share_dismissed`, `share_failed`, `share_image_failed`.

#### Review, profile, support, legal, and deletion

`app_review_prompt_viewed`, `app_review_prompt_dismissed`, `app_review_requested`, `app_review_opened`, `app_review_open_failed`, `app_review_already_completed`, `profile_tapped`, `profile_upgrade_tapped`, `free_scan_status_tapped`, `support_contact_tapped`, `support_contact_opened`, `support_contact_failed`, `subscription_manage_tapped`, `subscription_manage_opened`, `subscription_manage_failed`, `legal_link_opened`, `profile_sign_out_confirmed`, `account_delete_confirmed`.

#### Paywall, purchase, restore, and RevenueCat

`paywall_requested`, `paywall_viewed`, `paywall_variant_assigned`, `paywall_metadata_applied`, `paywall_offerings_loaded`, `paywall_plan_selected`, `paywall_dismissed`, `paywall_closed`, `paywall_trial_eligibility_loaded`, `purchase_started`, `purchase_completed`, `purchase_cancelled`, `purchase_pending`, `purchase_failed`, `purchase_unavailable`, `purchase_no_entitlement`, `purchase_entitlement_refreshed`, `restore_started`, `restore_completed`, `restore_failed`, `restore_no_purchases`, `restore_no_entitlement`, `restore_entitlement_refreshed`, `revenuecat_profile_sync_completed`, `revenuecat_profile_sync_failed`, `revenuecat_status_mismatch`, `revenuecat_status_fallback_used`, `revenuecat_profile_reconcile_started`, `revenuecat_profile_reconcile_attempt`, `revenuecat_profile_reconcile_completed`, `revenuecat_profile_reconcile_exhausted`, `apple_search_ads_attribution_collection_requested`, `apple_search_ads_attribution_collection_failed`.

#### Reliability

`app_error_captured` plus analytics queue flush/drop events generated by the analytics service.

#### Complete literal event re-grep

**Implemented:** 168 literal `trackEvent` names were re-grepped from current JavaScript/TypeScript on August 23. Dynamic queue diagnostics are additional runtime names and are not falsely presented as literals.

`account_delete_confirmed`, `account_link_revenuecat_reidentified`, `analysis_image_retry_suppressed`, `analysis_upload_started`, `anonymous_sign_in_failed`, `anonymous_sign_in_started`,
`anonymous_signed_in`, `app_error_captured`, `app_review_already_completed`, `app_review_open_failed`, `app_review_opened`, `app_review_prompt_dismissed`,
`app_review_prompt_viewed`, `app_review_requested`, `apple_search_ads_attribution_collection_failed`, `apple_search_ads_attribution_collection_requested`, `auth_sign_in_cancelled`, `auth_sign_in_completed_client`,
`auth_sign_in_failed`, `auth_sign_in_started`, `auth_signed_in`, `auth_signed_out`, `auth_viewed`, `barcode_detected`,
`barcode_ignored_after_failed_lookup`, `barcode_not_found`, `camera_permission_request_failed`, `camera_permission_requested`, `camera_permission_result`, `camera_permission_settings_failed`,
`camera_permission_settings_opened`, `capture_to_result`, `catalog_ingredient_capture_submit_failed`, `catalog_ingredient_capture_submitted`, `catalog_ingredient_capture_tapped`, `catalog_label_lookup_cancelled`,
`catalog_label_none_of_these`, `catalog_label_retry_tapped`, `catalog_label_scan_tapped`, `catalog_product_hydration_completed`, `catalog_search_cache_hit`, `catalog_search_cleared`,
`catalog_search_completed`, `catalog_search_failed`, `catalog_search_home_cleared`, `catalog_search_submitted`, `catalog_species_filter_changed`, `cold_start_interactive`,
`dev_qa_exact_match_auto_opened`, `free_scan_count_synced_after_failure`, `free_scan_status_tapped`, `guest_continue_completed`, `guest_continue_failed`, `guest_continue_started`,
`guest_history_migration_completed`, `guest_history_migration_failed`, `guest_history_migration_skipped`, `guest_save_prompt_cancelled`, `guest_save_prompt_completed`, `guest_save_prompt_dismissed`,
`guest_save_prompt_failed`, `guest_save_prompt_provider_tapped`, `guest_save_prompt_viewed`, `guest_upgrade_cancelled`, `guest_upgrade_completed`, `guest_upgrade_failed`,
`guest_upgrade_started`, `history_cleared`, `history_compare_closed`, `history_compare_opened`, `history_compare_result_opened`, `history_filter_changed`,
`history_filters_cleared`, `history_item_opened`, `history_result_failed`, `history_result_loaded`, `history_result_requested`, `history_result_rescan_tapped`,
`history_result_search_tapped`, `history_result_unavailable`, `history_search_cleared`, `history_search_started`, `history_search_submitted`, `human_food_pet_selected`,
`ingredient_capture_tapped`, `label_lookup_completed`, `label_lookup_failed`, `label_lookup_parallel_started`, `label_lookup_started`, `label_ocr_completed`,
`legal_link_opened`, `onboarding_completed`, `onboarding_continue_tapped`, `onboarding_scan_now_tapped`, `onboarding_started`, `onboarding_step_viewed`,
`paywall_closed`, `paywall_dismissed`, `paywall_metadata_applied`, `paywall_offerings_loaded`, `paywall_plan_selected`, `paywall_requested`,
`paywall_trial_eligibility_loaded`, `paywall_variant_assigned`, `paywall_viewed`, `photo_capture_cancelled`, `photo_capture_completed`, `photo_capture_failed`,
`photo_capture_started`, `photo_capture_too_large`, `post_scan_prompt_dismissed`, `post_scan_prompt_viewed`, `profile_sign_out_confirmed`, `profile_tapped`,
`profile_upgrade_tapped`, `purchase_cancelled`, `purchase_completed`, `purchase_entitlement_refreshed`, `purchase_failed`, `purchase_no_entitlement`,
`purchase_pending`, `purchase_started`, `purchase_unavailable`, `restore_completed`, `restore_entitlement_refreshed`, `restore_failed`,
`restore_no_entitlement`, `restore_no_purchases`, `restore_started`, `revenuecat_customer_info_unlocked`, `revenuecat_profile_reconcile_attempt`, `revenuecat_profile_reconcile_completed`,
`revenuecat_profile_reconcile_exhausted`, `revenuecat_profile_reconcile_started`, `revenuecat_profile_sync_completed`, `revenuecat_profile_sync_failed`, `revenuecat_status_fallback_used`, `revenuecat_status_mismatch`,
`saved_result_viewed_before_rescan`, `scan_analysis_cancelled`, `scan_analysis_completed`, `scan_analysis_failed`, `scan_analysis_started`, `scan_analysis_timeout`,
`scan_another_tapped`, `scan_blocked_by_limit`, `scan_cta_tapped`, `scan_limit_recovery_not_pro`, `scan_limit_recovery_retried`, `scan_limit_recovery_retry_unavailable`,
`scan_limit_recovery_started`, `scan_retry_blocked_by_limit`, `scan_retry_tapped`, `scanner_help_opened`, `scanner_viewed`, `share_completed`,
`share_dismissed`, `share_failed`, `share_image_failed`, `share_started`, `subscription_manage_failed`, `subscription_manage_opened`,
`subscription_manage_tapped`, `support_contact_failed`, `support_contact_opened`, `support_contact_tapped`, `take_photo_again_tapped`, `tap_to_camera_ready`.

### 19.3 KPI framework

The views measure:

- Guest/onboarding activation and path completion.
- Scan starts, completions, failures, cache rate, upload attempts/size, and permission/capture failure.
- Server scan gate, counted/reversed scans, limit blocks.
- Search/catalog recovery.
- Paywall request→view→package load→plan→purchase, segmented by source, pitch, variant, plan, release, and placement fallback.
- Purchase/restore entitlement agreement and RevenueCat mismatch.
- History retention, search, comparison, and result open.
- Sharing.
- App review prompt→request→store open.
- Support contact success.
- Apple Search Ads attribution readiness.
- App errors/fatal errors by release/session.
- User lifecycle first-touch timestamps.

## 20. Design system

### 20.1 Current visual direction

The current runtime direction is restrained black-and-white/neutral UI with semantic color only. The package image, Woof green verification mark, score tiers, and safety warnings carry color; general application chrome stays neutral. It supports system light and dark appearance.

The latest design work intentionally:

- Makes front-label scan the single dominant Home action.
- Places exact product identity and evidence before the score.
- Places the personalized safe/caution/avoid answer beside the score and keeps the same verdict in the sticky badge/share card.
- Keeps critical product variant text readable/wrapping.
- Uses one clear verification hierarchy.
- Reduces card clutter and duplicate upgrade calls.
- Treats ingredient capture as recovery, not a competing primary action.
- Keeps green for verified/positive, amber/orange/red for score/safety semantics.
- Uses reserved skeleton/banner/prompt slots so streaming and late prompts do not shift the completed layout.

### 20.2 Color tokens

Brand/core:

- Black/midnight: `#111111`.
- Secondary neutral (legacy token name `brandApricot`): `#666662`.
- Verification mint: `#64D161`.
- Ivory/background: `#F7F7F4`.

Light:

- Background `#F7F7F4`.
- Card `#FFFFFF`.
- Surface `#EFEFEB`.
- Divider `#DEDED8`.
- Primary text `#111111`.
- Secondary text `#51514D`.
- Tertiary text `#7A7A73`.

Dark:

- Background `#0E0E0D`.
- Card `#171716`.
- Surface `#20201F`.
- Divider `#30302E`.
- Primary text `#F7F7F4`.
- Secondary text `#B7B7B0`.
- Tertiary text `#8A8A83`.

Semantic:

- Excellent/Good `#2F8F5B`.
- Average `#D8941C`.
- Below Average `#D96A32`.
- Poor/concern `#C74A46`.
- System blue `#007AFF`.
- System amber `#FF9500`.
- Danger surface: light `rgba(199,74,70,0.10)`, dark `rgba(199,74,70,0.22)`.
- Caution surface: light `rgba(216,148,28,0.10)`, dark `rgba(216,148,28,0.20)`.
- Success surface: light `rgba(47,143,91,0.10)`, dark `rgba(47,143,91,0.20)`.

### 20.3 Typography

- Screen title: 32, weight 700.
- Section: 20, weight 700.
- Card title: 17, weight 600.
- Body: 15/22, weight 400.
- Caption: 13.
- Label: 12/600.
- Score: 48/700.
- Button: 16/600.
- Uses the platform sans/system font stack; no custom font dependency.

### 20.4 Spacing and shape

- Four-point base grid.
- Screen horizontal padding: 20.
- Section gap: 28.
- Subsection gap: 24.
- Element gap: 12.
- Card padding: 16.
- Card radius: 16.
- Button height: 56.
- Button radius: 14.
- Secondary touch targets target at least 44 points.

### 20.5 Motion and feedback

- Reanimated springs: default, snappy, gentle, and bouncy presets.
- Subtle score/category/streaming transitions.
- Haptics on selection, scan/result actions, purchase, and review actions.
- Animations must not obscure identity/evidence or trap navigation.
- Scanner, onboarding, Results, and paywall call `useReducedMotion`; reduced mode removes or simplifies looping/entrance/press transforms while preserving state feedback.

### 20.6 Accessibility

- Shared text caps extreme multiplier at 1.4 to protect complex cards, while still honoring Dynamic Type within that range.
- Buttons/links expose role, label, hint, disabled/selected/expanded state as applicable.
- Camera permission and retry paths are accessible without gesture-only controls.
- Safe areas are used for native screens/modals.
- Automated accessibility checks pass for labeled code surfaces.
- **Tested:** native forced-light configuration was removed and rebuilt; dark Home evidence is [`20-dark-mode-home.png`](context-evidence/2026-08-23/screenshots/20-dark-mode-home.png). Maximum in-app text on Home is [`21-max-text-home.png`](context-evidence/2026-08-23/screenshots/21-max-text-home.png). A complete AVOID Results route was also traversed top-to-bottom at `accessibility-extra-extra-extra-large` in dark mode, with top and bottom evidence in [`29-dark-max-text-results.png`](context-evidence/2026-08-23/screenshots/29-dark-max-text-results.png) and [`30-dark-max-text-results-bottom.png`](context-evidence/2026-08-23/screenshots/30-dark-max-text-results-bottom.png).
- **Open:** physical VoiceOver/TalkBack focus order, modal trapping, haptic feel, and the complete largest-text Results pass still require device validation.

## 21. Privacy, security, legal, and safety claims

### 21.1 Photo/data flow

The Privacy Policy says:

- Label/food photos are sent to the server/Claude for analysis and are not retained after processing.
- Barcodes are used for product lookup.
- Product name, score, and analysis/history metadata can be stored.
- Device/app/error data can be stored for functionality and troubleshooting.
- Supabase, Anthropic, Open Pet Food Facts, RevenueCat, Sentry, Apple, and Google are named third parties.

The app does store a local photo URI in local/history metadata in some flows and may sync that string to `scan_history`; a device-local URI is not the photo binary and is generally not portable. Verified catalog image URLs are persisted. Any future server image retention would require a policy and App Privacy update.

### 21.2 Safety disclosures

- Scores and ingredient assessments are informational.
- AI can make mistakes.
- Results are not veterinary or medical advice.
- Individual pets may have allergies.
- Important feeding decisions should be confirmed with a veterinarian.
- Verified evidence reduces identity/data uncertainty but does not turn the app into veterinary diagnosis.

### 21.3 Error/crash reporting

- Sentry wraps the root and Expo plugin.
- Default PII collection is disabled.
- Trace sampling is zero.
- Emails, URLs, paths, JWTs, common secret tokens, and long base64 are redacted.
- First-party `app_error_captured` records a bounded category/fingerprint/release context.
- A visible app error boundary allows recovery instead of a permanent white screen.
- **Open:** current TestFlight source-map upload and crash-free release-health proof are not recorded in the context artifact.

### 21.4 Database security posture

- All public tables have RLS enabled.
- Customer data uses `auth.uid()` ownership checks.
- Private catalog tables intentionally have no customer policies.
- Service secrets live only in server/EAS environments.
- Edge Functions authenticate bearer users or verify webhook secrets in function code.
- Rate limits exist at user and IP levels.
- Inputs and analytics properties are bounded/redacted.

### 21.5 Live Supabase advisor snapshot

On August 23 the Supabase advisors reported:

- Security: 60 notices — 37 info and 23 warnings.
- Performance: 76 info notices, no warn/error.

Security warning families:

- [`pg_trgm` installed in `public` schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).
- [Authenticated execution of several `SECURITY DEFINER` RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Anonymous-sign-in awareness notices because anonymous users legitimately receive the `authenticated` role.
- [Leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The 15 advisor-flagged authenticated `SECURITY DEFINER` signatures are `consume_scan`, `delete_own_account`, `get_human_food_count_today`, `increment_cache_hit`, `increment_human_food_count`, `increment_scan_count`, `log_product_event`, `resolve_verified_product_by_gtin`, `search_products`, `search_verified_products`, `search_verified_products_for_label_fast`, `search_verified_products_for_label_ocr`, `search_verified_products_for_label_ocr_text`, `search_verified_products_ranked_v1`, and the consent-bearing `submit_catalog_ingredient_capture` overload.

Interpretation:

- `consume_scan`, self-delete, verified search, label search, event logging, and explicit-consent capture are intentionally client-callable RPCs, but every security-definer body/grant/search path should remain audited so caller-supplied user IDs cannot escape `auth.uid()`.
- Live body inspection confirms `consume_scan` substitutes `auth.uid()` for non-service callers and fixes the free limit at three; human-food/legacy counter routines enforce caller ownership; the nine-argument capture overload always returns `explicit_consent_required`; the ten-argument overload requires both `auth.uid()` and `p_user_consent=true`.
- Anonymous-auth warnings are partly inherent to the guest-first design, not proof of exposure.
- Private catalog RLS-with-no-policy findings are informational and represent deny-by-default.
- Leaked-password protection is lower immediate impact because Woof uses OAuth/anonymous flows rather than a password UI, but enabling it is still sensible if password identities ever exist.
- Performance notices are primarily unindexed foreign keys, unused indexes in newly built catalog infrastructure, and an absolute Auth connection allocation. Do not drop indexes based only on an “unused” snapshot; catalog batch jobs are intermittent.
- **Open:** some live functions still use deprecated `auth.role()` service-role checks. They are not currently using user metadata for authorization, but should migrate to an explicit role/grant pattern during the next database security pass.

### 21.6 Legal content

Embedded Privacy and Terms are effective June 16, 2026. Public static copies also exist under `docs/`.

Known legal/documentation mismatch:

- Terms say a free result includes the first three ingredients. Current code makes the complete source-backed ingredient list visible while detailed ingredient explanations and category/nutrition breakdowns remain gated. Terms/App Store/privacy copy should be reconciled before production review.

## 22. Testing, CI, release, and operations

### 22.1 GitHub CI

On pull requests and `main` pushes, Node 22 and Deno 2 run:

- Whitespace and secret scan.
- JavaScript syntax.
- Dependency install.
- Product resolver and catalog quality contracts.
- Catalog scraper/source contract.
- CI/release alignment and GitHub release audit.
- Analytics privacy and App Privacy disclosure.
- Accessibility and pet-profile safety.
- Claim safety.
- App Store listing and screenshot checks.
- EAS versioning and RevenueCat readiness.
- SQL migration and KPI runbook checks.
- Deployment and release-evidence structure.
- Crash reporting.
- Edge function checks, type checks, fingerprints, and dry-run live verifiers.
- Dependency audit threshold.
- Catalog completeness when live credentials are available.
- Expo package/config/bundle/prebuild.
- Release metadata.

### 22.2 Useful local commands

- `npm run verify`
- `npm run check:syntax`
- `npm run check:preflight`
- `npm run check:release`
- `npm run check:resolver-contract`
- `npm run check:catalog`
- `npm run check:pet-safety`
- `npm run check:privacy`
- `npm run check:claims`
- `npm run check:revenuecat`
- `npm run check:edge-types`
- `npm run check:bundle`
- `npm run check:prebuild`
- `npm run audit:live-label-fixtures`
- `npm run audit:on-device-label-fixtures`
- `npm run audit:store-scan-screenshots`
- `npm run catalog:independent-census`
- `npm run check:catalog-release-gate`

### 22.3 Existing test evidence

- **Tested:** the August 23 iPhone 17 Pro Simulator pass covers onboarding, Home, search, label fixtures, Results, Profile, Paywall failure, camera permission, dark mode, a full maximum-text Results traversal, history, personalization, prompts, repeated guest deletion, and recovery; see the Part-B log.
- Resolver fixtures specifically cover Eric's false matches, browser/TestFlight chrome, exact package/size behavior, and protected identity boundaries.
- The latest native simulator build succeeded; the five required Part-A/Part-B gates passed against 408 JavaScript files, 59 claim files, 8 pet-safety scenarios, privacy, and the resolver contract.
- Native StoreKit purchase/restore/cancel/expiry evidence is historical; the current simulator configuration returned no products, so current transaction proof is blocked.
- Supabase post-deploy validation and Edge checks have historical evidence.
- The latest UX/design audit passed automated JavaScript/product-flow and accessibility checks.

### 22.4 Evidence that remains open

- A later physical build containing the overhaul: front-label test on the five screenshot products and Eric's full shelf set.
- Glare, blur, crop, rotation, neighboring package, small print, and timeout on a real camera.
- TestFlight anonymous first-run → exact result → account link → history preservation.
- Fourth-scan server block and failure reversal on TestFlight.
- Weekly/monthly/annual offering load and correct live price/trial eligibility.
- Purchase, restore, cancellation, expiration, webhook, subscriber sync, and profile agreement on TestFlight.
- Sentry release/source maps and crash-free sessions.
- VoiceOver/TalkBack and Dynamic Type device pass.
- Fresh KPI/event review for the next binary containing the overhaul.
- Fresh independent census and release gate.

### 22.5 Repository state warning

The workspace is extremely dirty: core application, native OCR, services, functions, migrations, docs, generated evidence, and scripts are modified or untracked. Preserve user work. Do not assume a clean branch, do not reset, and do not mix generated catalog evidence into a code release without a deliberate commit/review boundary.

## 23. Eric the pet-food nutritionist — complete feedback ledger

The complete relevant Messages task was reviewed from the first scan failures through the Nature's Logic calcium example. This matrix states the feedback, the implemented response, and what remains unproven.

| Eric feedback / observed failure | Implemented response | Status |
|---|---|---|
| App felt smoother/snappier after earlier work | Retained background analysis, caches, bounded search, fast label RPCs, and UI polish | Positive feedback; continue measuring |
| Barcode did not work | Barcode formats, direct verified GTIN lookup, OPFF identity hint, verification-required recovery | Implemented; physical retest on a later overhaul binary open |
| White screen after analysis | Background state recovery plus explicit empty-result/error guards and one-shot-recoverable root error boundary | Implemented; simulator recovery tested in `17`/`27`; physical retest open |
| Beneful returned Purina Pro Plan cat food | Consumer sub-brand and species are protected hard boundaries; catalog/resolver fixtures/migrations repair Eric variants | Implemented/tested in fixtures; shelf retest open |
| Moist & Meaty returned Purina ONE puppy | Protected brand line/life stage/form and source-version repairs | Implemented/tested in fixtures; shelf retest open |
| Royal Canin repeatedly timed out | Fast label-candidate RPCs, accelerated legacy search, tightened resolver budget, distinct timeout state | Implemented; physical/network retest open |
| Multiple products from the same brand but no exact one | Abstention/candidate UI; exact formula/variant reconciliation; “None of these” and contribution recovery | Implemented |
| Hill's was absent or treated as a treat/topper | Completeness classification and Hill's/product identity repair; non-complete decision is separate | Implemented/tested in catalog fixtures; shelf retest open |
| Open Farm RawMix Wild Ocean missing | Exact Open Farm/RawMix variant metadata and current catalog rows/fixtures | Implemented in catalog/resolver evidence; shelf retest open |
| “Filler” is misleading language | Renamed category to **Low-Nutrient Binders** everywhere in current scoring/result prompt | Implemented |
| Nutritional balance is the most important element | Weight increased/held at 30%, largest category | Implemented |
| Guaranteed Analysis is limited | Explicit analysis type label and lower default than typical/actual; transparency explanation | Implemented |
| Use Typical/Actual Analysis when available | Nutrient panel accepts analysis type and scores typical/actual more informatively | Implemented |
| Compare on dry-matter basis | Explicit basis parsing and as-fed conversion only with moisture | Implemented |
| Reward brands that disclose fuller nutrition | Typical + comparable basis bonus and positive transparency pro | Implemented |
| Penalize off nutrient levels even when ingredients look good | Calcium and Ca:P hard caps/safety concerns | Implemented |
| Nature's Logic Pork publishes unusually high actual calcium | Exact 41.5/15/2.96/5.34/2.84 dry-matter data added and propagated only to ingredient-identical version; score capped 35 | Live analyze v74 + migrations; physical UI verification on a later binary open |
| Ask for App Store reviews early and keep asking without annoyance | Two successful ≥70 results, 4.8s delay, viewport-only recording, 4-success spacing, 21/60/120-day cooldowns, permanent “already reviewed,” Profile link | Implemented; review card simulator-tested in `18`; conversion needs production data |
| App name should be distinct; competitor “Snout” noted | Runtime remains Woof; App Store title/subtitle distinct; no competitor claim/copy injected | Implemented identity; legal trademark review not performed here |

## 24. Bug/fix timeline

### 24.1 Original “none of these products scanned successfully” report

The user's attached Amazon product screenshot contained at least these visible targets:

1. Nutrish Small Breed Dry Dog Food with Chicken, 6 lb.
2. Hill's Science Diet Puppy Small & Mini Dry Dog Food, 12.5 lb.
3. IAMS Proactive Health Adult Minichunks Chicken, 3.3 lb.
4. Nutrish Small Breed Dry Dog Food with Chicken, 5 lb.
5. Hill's Science Diet Adult 1–6 Small & Mini Dry Dog Food, 15.5 lb.

Reported outcome: every attempted scan failed. That is the governing real-world failure, regardless of catalog row volume or automated fixture success.

The fixes intended to address the common root causes are:

- Crop exactly to the visible frame.
- Correct iOS orientation mapping in native code.
- Strip browser/Amazon/page chrome and retailer-thumbnail words.
- Protect consumer brand, species, life stage, form, recipe, breed size, and condition.
- Treat exact package sizes as equivalent only when formula evidence proves equivalence.
- Keep source/package versions distinct when formula differs.
- Prefer current manufacturer candidates.
- Use fast label identity lookup and a tighter time budget.
- Present exact candidates/abstention/recovery instead of an unrelated result.
- Maintain verified search aliases for Nutrish, IAMS, Hill's, Purina, Nutro, and other Eric-visible families.

**Current status:** code/backend work and the local UX overhaul are present. Build 52 is the newest TestFlight candidate but predates the overhaul. **Success is not yet proven** until a later physical binary containing these changes rescans the exact packages and records the outcomes.

### 24.2 Historical build timeline

- **Build 47:** fixed Open Farm false abstention from retailer thumbnail OCR (`fish`, `small`, `cat`), `net weight` falsely implying weight-management diet, and French `plus` falsely manufacturing Purina ONE +Plus.
- **Build 48:** introduced visible-frame crop but retained an iOS orientation mismatch.
- **Build 49:** moved crop into native UIKit to align the source pixels with the visible guide.
- **Build 50:** fixed Nutro same-formula package-size duplicate behavior and continued label/candidate stabilization.
- **Build 51:** 1.2.2 TestFlight candidate with Eric nutrient-balance, review cadence, label resolution, catalog/search, and failure-recovery work.
- **Build 52:** newest valid internal TestFlight binary; same app version, created from `8cb3c8f0`, before the local overhaul commits.

Other high-impact historical fixes:

- Exact consumer-brand handling across Purina families.
- Species/life-stage/form hard boundaries.
- Search typo tolerance without weakening variant terms.
- Current manufacturer preference.
- Source-version collapse only under formula equivalence.
- Empty Results white-screen prevention.
- Scan reversal on failed/invalid/cancelled AI streams.
- Guest-first auth and identity migration.
- Client entitlement mismatch recovery without granting Pro locally.

### 24.3 August 23 speed/flow/design overhaul

- Startup paints branded/auth state immediately while profile and purchase setup continue in the background; new JS performance events measure first interactive surface.
- Onboarding dropped from three pages to two, exposes scan from both, and opens the label scanner correctly.
- Scanner uses adaptive framing, staged capture/crop/optimization/upload copy, remaining-scan status, failed-barcode memory, and gate-aware retries.
- Product Search paints/merges cached results stably, prefetches images, differentiates timeout from empty, advances label messages, exposes cancel/search recovery, and promotes ingredient capture after None of These.
- Results mounts the real streaming skeleton, cycles messages every 1.8 seconds, elevates the personalized verdict beside the score, uses semantic dark-mode surfaces, reserves late layout slots, and sequences first-scan/guest/review/upgrade prompts.
- Paywall gained Retry/activation reconciliation/customer-info unlock/support recovery and stopped marketing free history as a Pro-only benefit.
- Simulator-discovered crashes/fixture races/dark-mode forcing/ErrorBoundary loops were fixed and retested; full defect list is in the Part-B log.
- Code commits: `ffd3612d`, `cd14e105`, `0e7da335`; paywall truth-copy follow-up is part of this final code change.

## 25. Simulator test pass

**Tested:** full log: [`context-evidence/2026-08-23/TEST_LOG.md`](context-evidence/2026-08-23/TEST_LOG.md). Evidence folder: [`context-evidence/2026-08-23/screenshots/`](context-evidence/2026-08-23/screenshots/).

| # | Scenario | Status | Primary evidence/disposition |
|---:|---|---|---|
| 1 | Cold start/onboarding | PASS | `01`, `02`, `20`, `24`; 83 ms JS boot→interactive |
| 2 | Guest + network-off retry | BLOCKED | Normal guest/delete passed; deterministic network loss unavailable |
| 3 | Home states | PASS | `03`, `04`, `20`, `21` |
| 4 | Scanner permission/modes | PASS | `22`, `23`; physical recognition/haptics still device-only |
| 5 | Label decisions | PASS | `05`–`09` fixtures |
| 6 | Typed search | PASS | `10`, `11` |
| 7 | Barcode paths | BLOCKED | Contracts pass; real camera barcode needs device |
| 8 | Ingredient consent/outcomes | PASS | Three consent choices and recovery exercised |
| 9 | Human-food states/history | PASS | `04`, `15`, `16` |
| 10 | Results/free/avoid/Pro/streaming | PASS | `05`, `12`–`14`, `20`, `21` |
| 11 | Scan accounting | PASS | Server-authority/reversal/retry contracts pass |
| 12 | Paywall/purchase/restore | BLOCKED | `19`; no local StoreKit products for real transaction |
| 13 | Profile/legal/deletion | PASS | `25`, `26`, `28` |
| 14 | Prompt sequence/review | PASS | `18` |
| 15 | Error/offline recovery | BLOCKED | `17`, `27` pass; deterministic airplane-mode scan unavailable |

**Totals:** 11 PASS, 0 FAIL, 4 BLOCKED. Development-client launch improved from 6,797 ms to 6,483 ms (314 ms/4.6%); app-side JS boot→interactive measured 83 ms; tap→camera measured 24 ms; blank simulator label capture→truthful no-match recovery was about 3.4 s. That last number is not a product-recognition success.

## 26. Known open issues, risks, and inconsistencies

### Release blockers

1. The exact failed shelf products have not been proven on a physical binary containing the overhaul; build 52 predates it.
2. Independent catalog release gate is not passed because source panel, popular-brand completeness, and second-census requirements are open.
3. TestFlight purchase/restore/webhook/profile proof is not current.
4. TestFlight Sentry/accessibility evidence is not current.

### Product/UX risks

1. Review prompting cannot verify an actual submitted review; only “I already reviewed” can suppress permanently.
2. A score ≥70 is used as the delight proxy. This avoids asking after a bad result but should be monitored for bias and prompt conversion.
3. Dynamic Type cap 1.4 protects layout but can limit users who request very large accessibility text; device QA should decide whether complex screens need responsive reflow instead.
4. Human-food AI identity remains safety-sensitive. Uncertainty must always become caution, and users must see the veterinary disclaimer.
5. Product identity can still fail under real glare/blur; abstention must stay preferable to sibling substitution.

### Data/catalog risks

1. The live materialized snapshot is August 10 at 75.23%; the later 92.04% filesystem artifact is historical and has not been persisted as current live coverage.
2. The backend has far more serving rows than formula rows; careless reporting can inflate perceived coverage.
3. Missing Petco/Amazon authorized panels make market completeness unknowable.
4. Catalog tables are heavily populated, but volume does not prove freshness, correctness, lawful reuse, or release-gate completion; four formula-identity conflicts remain live.
5. `brand_recalls` (22 rows) and `brand_metadata` (95 rows) are populated, but row presence does not prove complete/current recall monitoring, aggregated reviews, veterinary approval, or certification intelligence. The app/paywall must not make those claims.
6. A temporary catalog import Edge Function remains active.
7. Old generated audits can show failures or metrics later changed by migrations; rerun before quoting as current.

### Legal/security/operations risks

1. Terms “first three ingredients” copy is stale versus current free Results behavior.
2. Security-definer RPC grants need periodic manual review, especially any function accepting a user ID.
3. `pg_trgm` remains in `public` and Supabase flags it.
4. Leaked-password protection is disabled.
5. Sentry release proof is open.
6. The very dirty worktree makes release provenance/rollback difficult until changes are deliberately staged and committed.
7. The current overhaul has simulator evidence only until a newer EAS/TestFlight build is created and its provenance recorded.

## 27. File and subsystem ownership map

### Runtime entry/config

- `App.js` — root, Sentry, onboarding, navigation.
- `app.json` — Expo identity, permissions, plugins, runtime/update project.
- `eas.json` — development/preview/production builds and store submission profiles.
- `config/brand.js` — customer-visible identity.
- `config/env.js` — environment variable interface.
- `theme.js` — colors, typography, spacing, score tiers, motion.
- `legal.js` — embedded Privacy and Terms.

### Customer UI

- `screens/OnboardingScreen.js`
- `screens/AuthScreen.js`
- `screens/HomeScreen.js`
- `screens/ScannerScreen.js`
- `screens/ProductSearchScreen.js`
- `screens/ResultsScreen/`
- `screens/PaywallScreen.js`
- `screens/ProfileScreen.js`
- `screens/WebViewScreen.js`
- `screens/DevQAScreen.js` / `services/devQaFixtures.js` — development-only deterministic simulator matrix.
- `components/AppText.js`
- `components/BrandLogo.js`

### Recognition and catalog runtime

- `services/labelOcr.js`
- `services/cameraCrop.js`
- `services/labelOcrMatching.js`
- `services/labelResolution.js`
- `services/runtimeConfig.js`
- `services/productCatalog.js`
- `services/catalogQuality.js`
- `services/catalogSearchCache.js`
- `services/catalogCoverage.js`
- `services/catalogIngredients.js`
- `services/catalogMiss.js`
- `services/catalogEvidenceConsent.js`
- `services/catalogContributions.js`
- `services/opff.js`
- `modules/woof-label-ocr/`

### Analysis, scoring, and user data

- `services/analysisService.js`
- `services/claude.js`
- `services/verifiedScoring.js`
- `services/cache.js`
- `services/entitlements.js`
- `services/history.js`
- `services/petProfile.js`

### Identity, purchases, prompts, measurement

- `services/auth.js`
- `services/supabase.js`
- `services/purchases.js`
- `services/revenuecatSync.js`
- `services/analytics.js`
- `services/errorReporting.js`
- `services/reviewPrompt.js`
- `services/reviewPromptPolicy.js`
- `services/resultPromptState.js`
- `services/guestSavePrompt.js`
- `services/performanceTimings.js`

### Backend

- `supabase/functions/analyze/`
- `supabase/functions/product-lookup/`
- `supabase/functions/label-lookup/`
- `supabase/functions/revenuecat-webhook/`
- `supabase/functions/revenuecat-sync/`
- `supabase/migrations/`
- `supabase/validation/`

### Catalog operations/evidence

- `scripts/catalog-*` — acquisition, normalization, evidence, reconciliation, census, ranking, health, coverage, audits.
- `scripts/check-catalog-*` — invariant/regression checks.
- `inputs/` — authorized/public snapshots, review inputs, manifests.
- `outputs/` — generated reports/evidence; use dated methodology.
- `audit/` — screenshot/visual/product audits.

### Release and business operations

- `.github/workflows/ci.yml`
- `DEPLOYMENT_CHECKLIST.md`
- `RELEASE_EVIDENCE.md`
- `RELEASE_EVIDENCE_RUNBOOK.md`
- `REVENUECAT_TESTFLIGHT_RUNBOOK.md`
- `WEEKLY_REVIEW_RUNBOOK.md`
- `KPI_FRAMEWORK.md`
- `APP_STORE_LISTING.md`
- `APP_PRIVACY_DISCLOSURE.md`
- `TESTFLIGHT_ERIK_HANDOFF.md` — historical 1.2.0 handoff; not the current build number.

## 28. Canonical evidence used to build this file

- Current executable source files listed above.
- Live Supabase project/table/function/policy/row/advisor inspection on August 23, 2026.
- Live EAS/App Store Connect status inspection on August 23: production 1.2.1 (43); TestFlight 1.2.2 (52) valid/internal beta.
- [`context-evidence/2026-08-23/TEST_LOG.md`](context-evidence/2026-08-23/TEST_LOG.md) and 31 cited simulator evidence images. The folder contains 32 files total: one additional pre-fix dark-paywall capture is superseded and is not cited as proof.
- Complete relevant Codex task history, especially **Fix Eric nutrition feedback** and the current scan-failure/TestFlight task.
- `docs/ERIC_NUTRITIONIST_FEEDBACK_AUDIT_2026-08-23.md`.
- `outputs/catalog-coverage-92-execution/catalog-ai-handoff-2026-08-17/WOOF_COMPLETE_CATALOG_PROBLEM_CONTEXT_2026-08-17.md`.
- Latest broad independent census history artifact dated August 18, 2026.
- Current app config, legal, design QA, release evidence/runbooks, catalog scripts/migrations, and audit screenshots.

## 29. Maintenance rules for this context file

Update this file when any of these change:

- App version/build or TestFlight status.
- Live Edge Function version/marker.
- Scoring weights, thresholds, categories, nutrient basis, or caps.
- Free scan limit or Pro entitlements.
- Review cadence.
- Route or major screen flow.
- Product identity protection rules/thresholds.
- Database tables/RPCs/policies or material row counts.
- Independent census methodology or result.
- Eric/expert feedback and resolution state.
- Privacy, legal, third-party provider, or retention behavior.
- Runtime brand/design tokens.
- Release blockers and physical validation results.

Every coverage update must include its denominator definition, source panel, run date, and gate result. Every TestFlight update must distinguish **uploaded/processing/available/tested**. Never mark a feedback item complete solely because code exists; physical failures require physical retest evidence.

## Appendix A — Runtime data contracts

### A.1 Label identification

```json
{
  "found": true,
  "productName": "visible product name",
  "brand": "visible consumer brand",
  "productLine": "visible line/sub-brand",
  "flavor": "visible recipe",
  "lifeStage": "visible life stage",
  "foodForm": "visible form",
  "packageSize": "visible size/count",
  "petType": "dog | cat | unknown",
  "confidence": 0.0,
  "searchQuery": "bounded exact catalog query",
  "visibleText": ["visible phrase"],
  "notes": "uncertainty"
}
```

`found` becomes false when neither product name nor search query is usable. Visible text is capped at 12 items. The validator normalizes species and confidence and builds a query from structured fields only when needed.

### A.2 Pet-food result

```json
{
  "productName": "Brand - exact formula",
  "petType": "dog | cat | unknown",
  "overallScore": 1,
  "summary": "evidence-based assessment",
  "categories": [
    { "name": "Protein Quality", "score": 1, "detail": "reason" },
    { "name": "Ingredient Safety", "score": 1, "detail": "reason" },
    { "name": "Nutritional Balance", "score": 1, "detail": "reason" },
    { "name": "Low-Nutrient Binders", "score": 1, "detail": "reason" },
    { "name": "Additives & Preservatives", "score": 1, "detail": "reason" }
  ],
  "nutritionAnalysis": {
    "proteinLevel": "high | moderate | low | unknown",
    "proteinPercent": "value or N/A",
    "fatLevel": "high | moderate | low | unknown",
    "fatPercent": "value or N/A",
    "fiberPercent": "value or N/A",
    "moisturePercent": "value or N/A",
    "calciumDryMatterPercent": "value or N/A",
    "phosphorusDryMatterPercent": "value or N/A",
    "calciumPhosphorusRatio": "value or N/A",
    "analysisTypeLabel": "Typical Analysis | Guaranteed Analysis | Nutrient Analysis",
    "analysisBasisLabel": "Dry matter | As fed | Basis not stated",
    "primaryProteinSource": "short exact source",
    "grainFree": false,
    "lifestage": "short life stage",
    "caloriesPerCup": "source value or N/A"
  },
  "pros": ["up to four"],
  "cons": ["up to four"],
  "ingredients": [
    {
      "name": "ingredient",
      "category": "protein | carb | fat | fiber | vitamin | mineral | preservative | other",
      "rating": "good | bad | neutral",
      "reason": "why this rating",
      "description": "what it is",
      "alternatives": ["for neutral/bad"]
    }
  ],
  "verdict": "recommendation",
  "petSafety": {
    "level": "safe | caution | avoid",
    "label": "short label",
    "summary": "reason"
  },
  "ingredientVerification": {
    "status": "verification status",
    "imageStatus": "image status",
    "source": "source quality",
    "sourceUrl": "exact source URL",
    "verifiedAt": "timestamp",
    "formulaEvidenceTier": "tier"
  }
}
```

The deterministic result can include additional internal `verificationState` and `nutrientConcern` fields. `__scanUsage` is transport/accounting metadata and is stripped from saved public human-food snapshots.

### A.3 Human-food result

```json
{
  "foodName": "identified food or Unidentified food",
  "petType": "dog | cat",
  "safetyLevel": "safe | caution | dangerous",
  "summary": "short verdict",
  "explanation": "compound/risk explanation",
  "toxicCompounds": [],
  "symptoms": "watch list or N/A",
  "portions": "specific amount or Do not feed",
  "benefits": [],
  "alternatives": [],
  "ageGuidance": {
    "puppiesOrKittens": "safe | caution | avoid",
    "adults": "safe | caution | avoid",
    "seniors": "safe | caution | avoid",
    "note": "age-specific note"
  },
  "preparation": "safe preparation or N/A",
  "disclaimer": "Individual pets may have allergies. Always consult your veterinarian."
}
```

### A.4 Verified search/catalog product

Search and resolution RPCs return a bounded shape containing:

- `cache_key`, product name, brand, GTIN.
- Product line, flavor, life stage, food form, package size, species.
- Ingredient count, ingredient array/text.
- Source and source quality.
- Ingredient and image verification status and time.
- Verified image and source URL.
- Nutritional info/panel and `has_published_nutrients`.
- Search rank.

The client converts snake_case to its camelCase verified-product model and revalidates readiness before display/scoring.

### A.5 History entry

```json
{
  "id": "client-generated id",
  "productName": "product or food name",
  "overallScore": 1,
  "petType": "dog | cat",
  "dateScanned": "ISO timestamp",
  "cacheKey": "catalog/result key",
  "scanMode": "catalog | barcode | photo | ingredient_capture | human_food",
  "dataSource": "verified | ai",
  "safetyLevel": "human-food safety when relevant",
  "photoUri": "local URI when relevant",
  "productImageUrl": "verified catalog image",
  "resultSnapshot": "bounded human-food object only"
}
```

## Appendix B — Validation performed for this snapshot

The Markdown structure was checked for sequential headings, balanced code fences, required subject coverage, secret-like text, whitespace errors, and a clean file-specific `git diff --check`.

The following current code contracts passed after this document was written:

- JavaScript syntax/hook/UI/review/purchase/history/auth/scan contracts: 408 files.
- Product resolver contract.
- Pet-profile safety: 8 scenarios.
- App Privacy disclosure.
- Claim safety: 54 files.
- RevenueCat readiness.
- Edge Function safety: 5 customer/commerce functions.
- EAS versioning/release evidence alignment.

Live Supabase validation included project health/version, exact public table row counts, all public routine signatures, Edge Function versions/auth settings, all policies, views, triggers, runtime config, live materialized coverage, migrations, and security/performance advisor summaries. Live EAS validation distinguished build completion, submission completion, TestFlight processing validity, internal beta state, and whether the current commits are actually present.

## Appendix C — Executive handoff

Woof is a guest-first Expo pet-food scanner backed by a source-evidence catalog and strict exact-formula resolver. Verified catalog results are scored deterministically across Protein Quality 20%, Ingredient Safety 20%, Nutritional Balance 30%, Low-Nutrient Binders 15%, and Additives 15%, with dry-matter calcium and Ca:P safety caps. Eric's nutrition feedback is represented in the current scoring, terminology, exact-match rules, and review cadence. The live backend is healthy, Analyze v74 is deployed, and app version 1.2.2 build 52 is valid/in internal TestFlight beta—but the August 23 overhaul commits are newer than that binary.

The decisive remaining question is not whether the repository contains enough code or catalog rows. It is whether a later TestFlight build containing this overhaul correctly recognizes the exact real packages that failed before, under real camera conditions, without substituting a sibling. That physical pass, fresh release telemetry, purchase/restore proof, VoiceOver, legal-copy correction, and a fresh qualifying independent census are the remaining gates.
