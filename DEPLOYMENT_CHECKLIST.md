# Woof Production Deployment Checklist

Last updated: 2026-07-10.

Use this checklist before shipping the current audit work to TestFlight or production. It is intentionally operational: every item should produce visible evidence in Supabase, RevenueCat, App Store Connect, EAS, or the app.

## 1. Preflight

- Confirm the working branch and diff are intentional.
- Use `GITHUB_RELEASE_AUDIT.md` before publishing. The June 17 read-only check found PR #1 open/draft on `codex/push-woof-app`, with 0 statuses/check runs, no remote smoke CI workflow, and a stale/different diff from the current local audit worktree. It also found a migration-number collision: PR #1 carries `supabase/migrations/007`-`049` files while production already has `007`-`057` migration history. Reconcile or supersede that PR before merging anything to `main`.
- Confirm `app.json`, `package.json`, and `package-lock.json` are aligned to the release line.
- Use `EAS_RELEASE_VERSIONING.md` before building or submitting. Because `eas.json` uses `"appVersionSource": "remote"`, run `npx eas-cli@latest build:version:get -p ios`, save the output, and verify the next iOS build number is greater than `31` and not attached to build version `1.1.1`.
- Confirm the App Store Connect listing does not claim DogFoodAdvisor or CatFoodAdvisor support unless those integrations are actually deployed and licensed.
- Confirm App Store copy, App Review Notes, screenshots, and in-app paywall/result screens do not claim customer reviews, review summaries, recall alerts, or recall history unless those sources are actually deployed and licensed.
- Confirm camera permission copy remains accurate for both pet-food label scans and human-food safety scans.
- Use `APP_STORE_CONNECT_AUDIT.md` for the latest 90-day App Store Connect KPI baseline, Distribution record risks, RevenueCat offering snapshot, and pre-growth operating recommendations.
- Use `APP_STORE_LISTING.md` for the replacement App Store metadata and screenshot plan. `npm run check:listing` validates its recommended fields against current App Store limits: name 22/30 chars, subtitle 23/30 chars, promotional text 130/170 chars, keywords 83/100 bytes, and description 1289/4000 chars.
- Use `APP_PRIVACY_DISCLOSURE.md` for the App Store Connect App Privacy answers. `npm run check:privacy` validates the source-backed inventory, third-party processors, linked-data categories including Apple Search Ads attribution as Advertising Data, hosted privacy policy alignment, Sentry Crash Data status, `Data Used to Track You: No`, and No IDFA/no tracking-sdk assumptions.
- Use `REVENUECAT_EXPERIMENT_PLAN.md` for the baseline and first paywall experiment after purchase, restore, entitlement sync, and Apple Search Ads attribution collection are validated. Use `REVENUECAT_TESTFLIGHT_RUNBOOK.md` for the sandbox/TestFlight proof path before marking RevenueCat evidence ready. `npm run check:revenuecat` validates the app-side Offering Metadata allowlist, expected weekly/monthly/annual package telemetry, RevenueCat Apple Ads AdServices token collection, purchase/restore entitlement refresh events, immediate `revenuecat-sync` diagnostics, and KPI/runbook stop conditions before release.
- Use `PRODUCT_UX_REVENUE_AUDIT.md` for the scan-first funnel, empty-state CTA, guest account-save timing, human-food copy, source-specific paywall, and retention recommendations before changing onboarding or scaling paid acquisition.
- Use `WEEKLY_REVIEW_RUNBOOK.md` for the first post-deploy operating review before scaling acquisition.
- Use `GROWTH_CREATIVE_PLAN.md` for acquisition tests only after the release gates are satisfied. Do not scale paid traffic while App Store trust cleanup, guest scanning, analytics, entitlement sync, crashes/errors, or Supabase egress remain unresolved.
- Use `SUPABASE_LIVE_RECONCILIATION.md` before database deploys; it records the live project's `057` migration baseline, missing audit objects, active functions, advisor findings, and migration-history drift caveat.
- Resolve or upgrade the Supabase egress overage before the July 15, 2026 grace-period end. Live usage observed on June 16, 2026 for the May 27-June 27 billing cycle was `7.519 / 5 GB (150%)`, `7.52 GB` used, `2.52 GB` overage, `568` Edge Function invocations, and `8` monthly active users.
- Confirm no local `.env`, private key, service-role key, or dashboard secret is staged. The repo should only track `.env.example` placeholders and config code.
- Confirm `npm run check:syntax` passes; it guards that development builds use the same server-backed scan entitlement rules as TestFlight and production.
- Before merge, confirm `.github/workflows/ci.yml` and `.github/pull_request_template.md` exist on the release branch in GitHub, the PR body validation commands match `package.json`, the release PR does not contain stale `supabase/migrations/007`-`057` files from PR #1, and GitHub check runs are green for the pushed branch.
- Confirm the GitHub workflow runs the same pre-dependency Edge release evidence as local preflight: `npm run edge:fingerprint` and `npm run edge:verify-live -- --dry-run`.

Local checks to run from this repo when package tooling is available:

```sh
npm run check:preflight
```

`check:preflight` runs the non-live release gates below in order and stops at the first failure. Keep the expanded list here for debugging individual gates:

```sh
git diff --check
npm run check:secrets
npm run check:syntax
npm run check:catalog
npm run check:ci
npm run check:analytics
npm run check:privacy
npm run check:accessibility
npm run check:claims
npm run check:listing
npm run check:eas-versioning
npm run check:revenuecat
npm run check:sql
npm run check:kpi
npm run check:deployment
npm run check:evidence
npm run check:crash-reporting
npm run check:edge
npm run check:edge-types
npm run edge:fingerprint
npm run edge:deploy-analyze -- --dry-run
npm run edge:verify-live -- --dry-run
npm ci
npm run check:audit
npm run catalog:verification-gaps
npm run catalog:acquisition-queue
npm run check:catalog-completeness
npm run check:expo-versions
npm run check:expo-config
npm run check:bundle
npm run check:prebuild
npm run check:release
npm run start
```

**July 10 superseding status:** bundled Node/npm and temporary Deno tooling are available; native iOS Simulator QA, the compiled Apple Vision fixture audit, an Xcode build, live Edge verification, and the `110/110` Supabase post-deploy audit were completed. The remaining environment gaps are physical-camera/TestFlight/VoiceOver proof plus Java and Android SDK tooling. The current dependency audit is `13` moderate and `0` high/critical advisories. The older local-limitation paragraph below is retained as historical context.

Current local limitation: this machine still does not have `npm`, `pnpm`, `yarn`, `bun`, `npx`, `deno`, `psql`, or the Supabase CLI on `PATH`. A temporary npm CLI plus bundled Node was used to run `npm ci`, `check:audit`, `check:expo-versions`, `check:expo-config`, `check:bundle`, `check:prebuild`, and the full `check:preflight` locally; a temporary Deno install was used to run `check:edge-types`. Local browser QA was performed through Expo web with the development-only paywall preview route, and `check:bundle` now runs an explicit web export in addition to native Hermes export. Full native device/simulator runtime validation and Supabase migration dry-runs still need a better-equipped local or CI environment. `catalog:verification-gaps` and `catalog:acquisition-queue` require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` when run outside the SQL Editor; use them before purchasing/importing feeds to prioritize brands needing official/manufacturer ingredients and verified product images, refresh the service-role-only acquisition backlog, and verify the meaningful queue rows have owners or feed imports. Run `npm run catalog:acquisition-queue -- --csv` to produce the source-acquisition worklist with priority, missing proof, current sources, image gaps, pet-type gaps, source owners from `scripts/catalog-source-targets.json`, and the recommended official/manufacturer/GDSN/retailer source target. Use `--reconcile-batches` and `--reconcile-limit` when you want the CLI to run multiple bounded reconcile batches after refresh. For source pages that expose usable product data, prepare a reviewed source import with `npm run catalog:source-import-batch -- --brand "Blue Buffalo" --source blue-buffalo-general-mills --target-url https://www.bluebuffalo.com/sitemap.en.xml --output-dir outputs/catalog-source-imports/blue-buffalo-general-mills --max-urls 250 --sql-chunk-size 25`. This one command writes `urls.txt`, `feed.csv`, `sql/` chunks, and `report.json`; discovery excludes non-US locale prefixes such as `/en-ca/` by default, page extraction marks treats/toppers/purees/supplements as `is_complete_food = false`, and `--allow-non-us-locales` is only for deliberate diagnostics outside the US release catalog. The underlying manual steps remain available for debugging: `catalog:source-url-discovery`, `catalog:page-feed-extract -- --strict`, then `catalog:official-feed-import`. For reviewed live bulk application, prefer `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run catalog:official-feed-import-all -- --execute`; this revalidates every reviewed staged feed from disk, skips probe/test and zero-row source-gap directories by default, calls `public.upsert_catalog_product_feed(jsonb)` through the service-role client, and refreshes/reconciles `catalog_acquisition_queue` in bounded batches after all feeds. For a single source, use `catalog:official-feed-import` with its `--file`, `--source`, verification, and `--expected-brand` flags. When a service-role key is unavailable in the shell but Supabase SQL/MCP access is available, review the generated RPC chunks and `manifest.json`, apply chunks in order with a privileged role, then apply `9999-refresh-catalog-acquisition-queue.sql`; for exact disk imports through temporary SQL/MCP access, use `--rpc-name`, `--import-key`, and `--use-anon-key` only with a source-scoped one-time RPC that is revoked and dropped immediately after import. Use direct `--emit-sql-rpc --sql-offset 0 --sql-limit 25` for a single reviewable window; reserve inline `--emit-sql` for diagnostics. Feed import scripts refresh and reconcile `catalog_acquisition_queue` by default after successful service-role RPC imports; use `--skip-acquisition-refresh` or `--skip-acquisition-reconcile` only for controlled diagnostics. Official/manufacturer/GDSN/retailer feeds must include GTIN plus structured product identity where available: `product_line`, `flavor`, `life_stage`, `food_form`, and `package_size`. Package size is useful context but does not count by itself as exact recipe identity. `check:catalog-source-targets -- --strict-live --min-affected-products 20` requires service-role credentials and must fail if any meaningful live acquisition-queue brand lacks a source owner/target URL or an explicit non-US/generic/non-complete-food classification. `check:catalog-completeness` requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` so it can verify the live `product_data` catalog before release; it must fail if the catalog is below the ready-product, image-rate, ready-brand, dog/cat minimums, unknown-pet-type threshold, verified ingredient rate, verified image rate, structured-identity rate, or if any open/in-progress/imported acquisition queue rows remain. The verified ingredient gate requires source evidence and non-empty ingredient text, not just a status flag. The current production dependency audit is at `13` moderate advisories and `0` high/critical advisories after aligning the SDK 55 patch set and deduping React Native for Metro export, with remaining fixes requiring a tested Expo/React Native dependency-remediation pass. `RELEASE_EVIDENCE.md` tracks the external proofs that cannot be produced by local preflight, and `RELEASE_EVIDENCE_RUNBOOK.md` defines how to collect each proof without storing secrets.

Latest source-import note from June 21-22, 2026: the source target manifest now includes stable `sourceSlug` and discovery defaults for Blue Buffalo, Purina Pro Plan, Fancy Feast, Wellness, Friskies, Purina ONE, Beneful, Purina Cat Chow, Open Farm, Royal Canin, Nulo, Nutro, Pedigree, IAMS, Cesar, Sheba, Crave, Eukanuba, Stella & Chewy's, Tiki Pets, Weruva, Nutrish, Instinct, I AND LOVE AND YOU, Bully Max, Merrick, Orijen, ACANA, VICTOR, Taste of the Wild, Freshpet, Fromm, The Honest Kitchen, Natural Balance, Nature's Recipe, Nature's Logic, Diamond Pet Foods, Earthborn Holistic, Solid Gold, CANIDAE, Bil-Jac, Meow Mix, 9Lives, Fussie Cat, Annamaet, FirstMate, KOHA, Jinx, RAWZ, Health Extension, NutriSource, Primal, PetSmart Authority, PetSmart Simply Nourish, Go! Solutions, and Now Fresh, plus the Hill's aliases used by official product pages.

The page extractor now rejects marketing prose and page/navigation copy as ingredient evidence; reads heading/tab ingredient paragraphs, slash-sensitive WordPress product pages, Petcurean expanded-text blocks without `span.dots` ellipses, Tiki Pets/WooCommerce `ingredients-pane` tab statements, FirstMate/WooCommerce displayed `product-ingredients-list` statements, RAWZ Elementor/WooCommerce `ingredient-item` lists, Jinx Shopify `ingredient-description` tabs, Elementor `aria-controls` tab panels, The Plus/Elementor data-tab ingredient and analysis panels, guaranteed-analysis tabs and tables, responsive HTTPS product thumbnails, product carousel images, Freshpet Next/Builder structured product data, Fromm inline ingredient lists, Wellness/Salsify modal image `alt` ingredient evidence, Open Farm complete-ingredients modal item lists, Hill's AEM Ingredients accordions, Nulo JSON-LD `ingredientsAnalysis`, Nutrish ingredient class/tab blocks with slash-sensitive canonical URLs, Diamond URL-derived shelf-brand metadata, Earthborn product-page ingredient/image evidence, Purina Gatsby `page-data.json` ingredient relationships plus variety-pack `bundle_formulas`, PetSmart escaped Next.js product payloads for retailer-owned Authority and Simply Nourish rows, Shopify product JSON for clean product identity/GTIN/package-size/image fields, absolute source URL normalization for relative Shopify product evidence, source-brand and source-site suffix cleanup for page titles, WooCommerce taxonomy pet type, Shopify tags, source URL/category life-stage inference, and AAFCO dog/cat nutrient-profile statements.

On June 22, the later PetSmart Authority, Simply Nourish, Bil-Jac, Meow Mix, Purina Cat Chow, 9Lives, FirstMate, KOHA, Jinx, RAWZ, Health Extension, Nature's Recipe, NutriSource, Primal, Nature's Logic, Fussie Cat, Annamaet, Go! Solutions, and Now Fresh batches were applied live through reviewed source-scoped paths. The temporary RPC wrappers used for source imports were revoked, dropped, and verified absent. Petcurean added 72 manufacturer rows: 43 Go! Solutions and 29 Now Fresh, with zero suspicious ingredient matches. A scoped live identity update filled 20 Petcurean URL-derived life-stage values, and exact searches for `go solutions salmon cod grain free dry cat food` and `now fresh turkey salmon duck kitten` now rank manufacturer rows first with verified ingredients and product images.

The refreshed 2026-07-16 live catalog audit has 17,719 `product_data` rows, 13,148 dog/cat rows, 17,092 rows with product images, and 11,441 rows that meet the broad complete-food/ingredient-count gate. The strict source-backed contract has 8,336 `verified_ready` rows: 4,975 dog and 3,361 cat. The current quality states are 1,034 `needs_ingredients`, 909 `identity_only`, 7,440 `excluded`, and 8,336 `verified_ready`. `catalog_acquisition_queue` has 2,683 open/in-progress rows affecting 3,855 products after the reviewed 39-row production delta and bounded reconciliation. Do not claim complete US dog/cat food coverage yet; the remaining work is source-backed acquisition and review, not blind row insertion.

The same production refresh deployed `label-lookup` version 16 and `analyze` version 73. The compiled Apple Vision label fixture audit passes 12/12 exact products with a 2,070 ms p95 OCR-to-ranked-result pipeline, below the 3,000 ms target. The analysis Edge path now bounds provider work at 45 seconds, bounds streamed cache work at 50 seconds, and the app applies a 60-second watchdog, preventing the previous 160-second request from running until a platform 503.

The current local bulk feed dry-run validates 59 candidate feed directories and 3,802 normalized manufacturer/retailer rows after excluding multi-formula packs and allowing valid ingredient parentheticals such as `source of Omega 3 Fatty Acids`. Run it again before live bulk import because generated source outputs change as source sites and local guards change.

Future catalog expansion needs additional official/manufacturer/GDSN/retailer sources beyond this reviewed feed set and continued batched acquisition-queue reconciliation with the safer 100-row default. Eukanuba, Purina Beyond, Whiskas, Applaws, Grandma Lucy's, and Blackwood from this environment, plus five older Solid Gold products, remain explicit ingredient/source gaps; Nature's Recipe is now partially live, but several 403 and no-full-ingredient variety/stew pages remain gaps. Some Tiki Pets and 9Lives variety packs/bundles plus seven Bully Max food candidates remain skipped because the official page does not expose one exact formula-level ingredient statement or guaranteed analysis. Do not hand-transfer large generated payloads through MCP/chat; use service-role execution from disk, or a SQL editor path that preserves generated text exactly.

Latest scan/search note from June 22, 2026: label scan search now uses the full parsed label identity, including brand, product line, product name, flavor, life stage, food form, package size, and the model search query. Auto-open is deliberately conservative: it requires high label confidence, at least two unique non-generic identity tokens, a source-backed ingredient-verified catalog product, a verified product image, and a stricter brand/identity match among the top five catalog candidates. It also refuses auto-open when important visible recipe/variant terms such as turkey, giblets, senior, hydrolyzed, salmon, oatmeal, or prime rib are missing from the verified candidate. Typed-search result taps use the same important-term guard, so a verified sibling can be displayed for discovery but cannot be scored as the exact product when visible recipe terms are missing. Barcode-to-catalog lookup also searches with the full product identity instead of only brand plus product name. The search screen requests a 12-result window because live timing checks show that window keeps representative catalog queries around 0.5s inside Postgres while still returning the top candidate set. Live search now boosts exact package-size matches as a tie-breaker, source-backed distinctive token overlap when the official row exists, explicit dog/cat species matches, exact brand-phrase matches, and visible Baby BLUE / Brown Rice line terms, while also withholding the generic source-backed base bonus when important query terms are missing from a verified sibling. It also treats numeric formula ratios like `30/20` and wet-food texture terms like gravy, ground, pate, shreds, chunks, and morsels as important terms, so verified-but-wrong sibling formulas no longer get lifted above exact discovery rows. It returns zero scorable rows for treat/bundle/variety-pack/generic-line queries such as Blue Bits and Blue Buffalo variety packs, and filters scorable search results to known dog/cat pet types. Live probes now rank Baby BLUE Chicken & Brown Rice Puppy/Kitten manufacturer rows first for puppy, kitten, dog-food, and cat-food variants instead of adult sibling formulas. The acquisition reconciler now passes brand plus product identity through strict matching, canonicalizes `Blue Buffalo`/`Blue's` legacy queue identities to manufacturer `BLUE` naming, blocks unsafe unknown-species cross-species overlaps for multi-species brands, and blocks unmatched extra line/diet terms such as Friskies Indoor/Garden Greens; reviewed ambiguous Nutrish, Blue Basics, and Friskies rows were reopened rather than counted as exact formulas. Verification still marks `Blue Buffalo Wilderness Beef and Chicken Grill` as matchable to its manufacturer-backed `BLUE Wilderness Wet Dog Food - Beef & Chicken Grill` row. That means sibling variants like 30-pound versus 40-pound bags, verified Blue Buffalo formula matches, same-species pet queries, Natural Balance-style exact brand queries, and Pro Plan `30/20` gap handling rank correctly, while gaps such as Fancy Feast Turkey Giblets and Pro Plan HA Hydrolyzed Vegetarian remain exact-source acquisition gaps instead of being scored from a wrong verified sibling. This improves instant exact matches for currently verified products without pretending the whole US shelf catalog is already verified.

June 21-22 catalog addendum: IAMS, Cesar, Sheba, Crave, Stella & Chewy's, Tiki Pets, Weruva, Nutrish, Eukanuba, Instinct, I AND LOVE AND YOU, Bully Max, Merrick, Orijen, ACANA, VICTOR, Taste of the Wild, Freshpet, Fromm, The Honest Kitchen, Natural Balance, Nature's Recipe, Nature's Logic, Diamond Pet Foods, Earthborn Holistic, Solid Gold, CANIDAE, Bil-Jac, Meow Mix, Purina Cat Chow, 9Lives, Fussie Cat, Annamaet, FirstMate, KOHA, Jinx, RAWZ, Health Extension, NutriSource, Primal, PetSmart Authority, PetSmart Simply Nourish, Go! Solutions, and Now Fresh are now first-class source targets with stable discovery defaults and reusable batch scripts where the source shape supports them. Eukanuba, Purina Beyond, Whiskas, Applaws, Grandma Lucy's, and Blackwood from this environment, plus five older Solid Gold products, remain ingredient-source gaps; Nature's Recipe is partially live but still has several 403 and no-full-ingredient variety/stew page gaps. Some Tiki Pets and 9Lives variety packs/bundles plus seven Bully Max food candidates remain skipped because the official page does not expose one exact formula-level ingredient statement or guaranteed analysis. The current reviewed local feed dry-run validates 3,802 strict importer rows across 59 reviewed non-probe feed directories, including the 827 later PetSmart/Bil-Jac/Meow-Mix/Cat-Chow/9Lives/FirstMate/KOHA/Jinx/RAWZ/Health-Extension/Nature's-Recipe/NutriSource/Primal/Nature's-Logic/Fussie-Cat/Annamaet/Go-Solutions/Now-Fresh verified rows that are now live; the app still needs additional source acquisition and a fully drained acquisition queue before it can claim broad instant US coverage.

Before production submission or paid-growth launch, replace the pending entries in `RELEASE_EVIDENCE.md` and run:

```sh
npm run check:evidence -- --strict
```

Use `RELEASE_EVIDENCE_RUNBOOK.md` while filling the matrix; `npm run check:evidence` verifies every evidence key has a capture recipe.

## 2. Required Configuration

App/EAS environment:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `REVENUECAT_API_KEY_IOS`
- `REVENUECAT_API_KEY_ANDROID`

Non-development EAS builds now fail during app config resolution if any of those public app environment variables are missing. Keep them configured in the EAS environment for preview and production before requesting a build.

Required Sentry app/EAS environment:

- `SENTRY_DSN` for native crash reporting in the app bundle.
- `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` for Sentry source-map/debug-symbol upload in EAS builds. Keep the auth token in EAS secrets, not tracked files.

Optional app/EAS environment:

- `WOOF_SHARE_URL`; defaults to the live App Store URL `https://apps.apple.com/app/id6760733899` and can be overridden later for a landing page, attribution link, or platform-aware redirect.

Supabase Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `REVENUECAT_WEBHOOK_AUTH`
- `REVENUECAT_REST_API_KEY` for server-side `GET /subscribers` entitlement sync
- `WOOF_ALLOWED_ORIGINS` optional comma-separated browser origins for Edge Function CORS, for example `https://yourdomain.example,https://preview.example`. Native mobile/no-Origin requests are still allowed without this value, and localhost dev origins are allowed by default.

Supabase dashboard toggles:

- Enable Anonymous Sign-Ins.
- Enable the identity-linking/provider settings needed for Apple and Google account saving. Supabase manual linking is required for converting an anonymous user into a saved Apple/Google account.
- Run `npm run auth:verify-live`; do not ship while it reports that signups, anonymous users, Apple, or Google are disabled. Manual linking remains a dashboard-only check.
- Confirm Apple and Google provider redirect URLs include `woof://auth/callback`, matching the app's PKCE callback exchange path.
- Review anonymous-user RLS behavior before enabling the no-account App Store promise. Supabase anonymous users use the `authenticated` Postgres role, so policies must use the `is_anonymous` JWT claim when a path should differ between guest users and saved accounts.
- Review anonymous sign-in abuse controls. Supabase docs recommend invisible CAPTCHA or Cloudflare Turnstile for anonymous sign-ins; if CAPTCHA is not wired into the mobile app, record the decision, keep Auth rate limits conservative, and monitor `anonymous_sign_in_failed` / `automatic_guest_session_*` after release.
- Record an anonymous-user cleanup retention decision. Supabase does not automatically clean up anonymous users, so decide whether old anonymous users should be deleted later by a service-role maintenance job after guest scan/account-saving behavior is validated.
- Enable Leaked Password Protection or record why the current OAuth/anonymous-only login surface intentionally waives the advisor warning.
- 2026-07-10 production decision: Anonymous Sign-Ins and manual linking are enabled. Keep Supabase's conservative anonymous Auth rate limit and Woof's 20/hour free-user scan throttle; monitor `anonymous_sign_in_failed`, `automatic_guest_session_*`, and anonymous-user growth before adding an interactive CAPTCHA/Turnstile challenge to the mobile cold-start path.
- 2026-07-10 retention decision: dormant anonymous accounts have a 30-day target retention period. Do not schedule destructive anonymous-user cleanup until a service-role job proves it excludes linked identities and active Pro entitlements and preserves required product submissions, while cascade deletion and guest-to-account linking are covered by production-like tests.
- 2026-07-10 password-protection decision: Leaked Password Protection is waived while Woof exposes only Apple/Google OAuth and anonymous auth and has no password sign-in surface. Revisit this immediately if email/password auth is introduced.
- Enable Supabase Cron / `pg_cron` before applying `064_schedule_cleanup_jobs.sql` if the project does not already have it enabled.

RevenueCat dashboard:

- Keep offering `default` with packages `$rc_weekly`, `$rc_monthly`, and `$rc_annual`.
- Configure the webhook URL for `supabase/functions/v1/revenuecat-webhook`.
- Set the webhook authorization header to match `REVENUECAT_WEBHOOK_AUTH`.
- Create or confirm a RevenueCat REST API key and store it only as the Supabase Edge Function secret `REVENUECAT_REST_API_KEY`.

## 3. Database Migration Order

Live Supabase project `rhlgvrywjralxrjcdtrw` already has historical remote migration history through `057_tighten_supplemental_catalog_exclusions`, plus newer timestamped catalog migrations applied during the catalog rebuild. Keep audit migrations numbered `058+`; do not reuse `007`-`057` locally because those versions belong to production history.

Before applying, run `supabase migration list` after linking the project. Supabase compares local files with `supabase_migrations.schema_migrations`; if the CLI reports remote migrations that are missing locally, use the documented `supabase db pull` / `supabase migration repair` workflow intentionally before `supabase db push`. Do not mark migrations repaired unless the actual schema state has been verified.

Apply migrations in numeric order. The key audit migrations are:

```text
058_human_food_history.sql
059_cache_hit_rpc_security.sql
060_analytics_events.sql
061_scan_entitlements.sql
062_revenuecat_webhook.sql
063_scan_reversal.sql
064_schedule_cleanup_jobs.sql
065_kpi_reporting_views.sql
066_profile_write_security.sql
067_delete_account_privacy.sql
068_tiered_rate_limits.sql
069_consume_scan_reversed_retry.sql
070_security_advisor_hardening.sql
071_fast_catalog_search.sql
072_simplify_catalog_search_hot_path.sql
073_sql_catalog_search_hot_path.sql
074_catalog_coverage_product_events.sql
075_dedupe_product_event_indexes.sql
076_product_data_pet_type.sql
077_fix_search_products_spacing.sql
078_fuzzy_catalog_search.sql
079_prioritize_strict_catalog_search.sql
080_catalog_source_provenance.sql
081_catalog_verification_gap_event.sql
082_catalog_acquisition_queue.sql
083_dedupe_catalog_acquisition_refresh.sql
084_reconcile_catalog_acquisition_queue.sql
085_expire_unverified_verified_analysis_cache.sql
086_backfill_catalog_pet_type.sql
087_require_source_evidence_for_verified_catalog.sql
088_catalog_product_identity.sql
089_catalog_product_feed_import_rpc.sql
090_prioritize_verified_catalog_search.sql
091_demote_suspicious_catalog_ingredients.sql
092_verified_search_bonus_identity_guard.sql
093_accent_normalized_catalog_search.sql
094_reconcile_catalog_acquisition_identity_matches.sql
095_stricter_catalog_acquisition_identity_guard.sql
096_exact_recipe_terms_for_acquisition_identity.sql
097_package_size_catalog_search_tiebreaker.sql
098_verified_source_search_rank_bonus.sql
099_verified_source_candidate_widening.sql
100_verified_source_bonus_weight.sql
101_verified_source_exact_product_terms.sql
102_verified_source_variant_term_precision.sql
103_batched_catalog_acquisition_reconcile.sql
104_sweep_catalog_acquisition_reconcile_batches.sql
105_prefilter_catalog_acquisition_identity_reconcile.sql
106_safer_catalog_acquisition_reconcile_batch_default.sql
107_purina_gatsby_page_data_import.sql
108_dedupe_catalog_feed_payload.sql
109_verified_source_token_overlap_rank.sql
110_count_delights_as_verified_source_identity.sql
111_guard_verified_source_bonus_missing_query_terms.sql
112_canonicalize_source_brand_aliases.sql
113_preserve_explicit_non_complete_catalog_rows.sql
114_harden_non_product_catalog_row_search_path.sql
115_merge_gtin_source_url_catalog_duplicates.sql
116_refine_non_product_broth_guard.sql
117_search_products_species_rank_alignment.sql
118_search_products_brand_rank_alignment.sql
119_non_product_guard_accented_pate_kittens.sql
120_non_single_formula_catalog_guard.sql
121_search_products_non_food_query_guard.sql
122_search_products_non_food_query_guard_null_fix.sql
123_search_products_known_pet_type_guard.sql
124_search_products_baby_line_term_guard.sql
125_search_products_baby_brown_rice_tiebreaker.sql
126_canonicalize_blue_buffalo_acquisition_identity.sql
127_search_products_formula_texture_term_guard.sql
128_catalog_acquisition_identity_key_terms.sql
129_catalog_acquisition_species_ambiguity_guard.sql
130_tighten_acquisition_species_and_line_terms.sql
131_brand_aware_acquisition_identity_match.sql
132_fix_acquisition_unknown_species_null_guard.sql
133_tighten_acquisition_unknown_species_catalog_pet_type.sql
134_bound_acquisition_identity_candidate_scan.sql
135_canonicalize_acquisition_size_line_terms.sql
136_close_stale_acquisition_queue_gaps.sql
137_tighten_non_single_formula_catalog_guard.sql
138_cleanup_verified_non_single_formula_catalog_rows.sql
139_reject_multipack_catalog_rows.sql
140_import_missing_nutro_kitten_formula.sql
141_exclude_honest_kitchen_partial_ingredients.sql
142_exclude_partial_main_ingredients.sql
143_exclude_unverified_wholehearted_rows.sql
144_allow_verified_dental_food_catalog_rows.sql
145_exclude_discontinued_purina_beyond_rows.sql
146_exclude_localized_purina_beyond_brand_rows.sql
147_search_verified_products_app_rpc.sql
148_import_petco_wholehearted_verified_seed.sql
149_search_verified_products_required_terms.sql
150_import_dr_harveys_verified_seed.sql
151_refine_dr_harveys_search_identity.sql
152_search_verified_products_identity_token_boost.sql
153_clean_purina_one_invalid_package_size.sql
154_canonicalize_stella_chewys_source_brand.sql
155_canonicalize_stella_chewys_alias_brands.sql
156_search_verified_products_tiki_pets_alias.sql
157_cleanup_tiki_pets_queue_aliases.sql
158_exclude_non_us_community_catalog_rows.sql
159_canonicalize_nutro_source_brand.sql
160_acquisition_reconcile_strict_verified_search.sql
161_allow_valid_in_broth_product_names.sql
162_search_verified_products_extra_recipe_term_penalty.sql
163_search_verified_products_species_metadata_candidate.sql
164_search_verified_products_partial_identity_boost.sql
165_catalog_quality_state_function.sql
166_catalog_scraper_audit.sql
167_catalog_scraper_audit_advisor_fix.sql
168_harden_catalog_feed_source_url_and_ingredient_braces.sql
169_preserve_source_backed_ingredient_text.sql
170_allow_named_wet_gravy_sauce_catalog_rows.sql
171_reconcile_high_confidence_verified_search_matches.sql
172_brand_scoped_acquisition_strict_search_reconcile.sql
173_tighten_high_confidence_reconcile_species_guard.sql
174_freshpet_official_short_ingredient_evidence.sql
175_preserve_catalog_pack_variants.sql
176_demote_stale_royal_canin_verified_rows.sql
177_lotus_raw_food_short_ingredient_evidence.sql
178_reject_generic_verified_catalog_sources.sql
179_refine_bone_broth_non_product_guard.sql
180_exclude_jinx_kibble_sauce_and_starter_pack.sql
181_exclude_healthy_dogma_k9_mobility_ultra.sql
182_fix_dr_harveys_non_dog_cat_pet_type.sql
183_normalize_verified_product_search_retail_noise.sql
184_normalize_verified_product_search_species_plurals.sql
185_search_verified_products_toy_breed_variant_guard.sql
186_search_verified_products_abbreviated_label_boost.sql
187_search_verified_products_insect_recipe_guard.sql
188_search_verified_products_plant_recipe_guard.sql
189_search_verified_products_grain_free_variant_guard.sql
190_search_verified_products_ancient_grains_variant_guard.sql
191_brand_scoped_reconcile_marks_unresolved_checked.sql
192_search_verified_products_percentage_variant_guard.sql
193_royal_canin_breed_reconcile_guard.sql
194_search_verified_products_label_synonyms.sql
195_search_verified_products_default_adult_term.sql
196_acquisition_reconcile_default_adult_species_inference.sql
197_normalize_verified_product_search_retailer_suffixes.sql
198_royal_canin_size_and_breed_reconcile_guard.sql
199_brand_scoped_reconcile_ambiguous_variant_guard.sql
200_open_farm_line_reconcile_guard.sql
201_acquisition_reconcile_catalog_formula_term_guard.sql
202_acquisition_reconcile_green_bean_formula_terms.sql
203_acquisition_reconcile_expanded_formula_terms.sql
204_acquisition_reconcile_veal_formula_guard.sql
205_acquisition_reconcile_cooking_formula_terms.sql
206_catalog_feed_import_identity_duplicate_guard.sql
207_prioritize_species_explicit_brand_reconcile.sql
208_blue_family_favorites_reconcile_alias.sql
209_blue_family_favorites_retail_title_reconcile.sql
210_purina_pro_plan_bright_mind_reconcile_alias.sql
211_wellness_retail_title_search_reconcile.sql
212_reconcile_wet_texture_variant_guard.sql
213_blue_true_solutions_side_grain_reconcile.sql
214_brand_reconcile_source_url_identity_guard.sql
215_brand_reconcile_matched_identity_source_url.sql
216_brand_reconcile_package_count_guard.sql
217_exclude_editorial_tools_and_treat_queue_noise.sql
218_exclude_duplicate_meow_mix_web_row.sql
219_exclude_verified_duplicate_legacy_catalog_rows.sql
220_catalog_product_evidence_gap_summary.sql
221_exclude_health_extension_broth_sample_rows.sql
222_exclude_stale_health_extension_404_rows.sql
223_exclude_unknown_species_legacy_duplicate_rows.sql
224_unknown_species_duplicate_life_stage_guard.sql
225_fix_royal_canin_medium_adult_duplicate.sql
226_unknown_species_duplicate_line_term_guard.sql
227_alias_verified_duplicate_acquisition_reconcile.sql
228_bil_jac_dry_title_normalizer.sql
229_search_verified_products_small_bite_guard.sql
230_fast_verified_identity_duplicate_reconcile.sql
231_optimize_direct_verified_identity_duplicate_reconcile.sql
232_direct_identity_size_variant_guard.sql
233_alias_duplicate_size_variant_guard.sql
234_duplicate_food_form_variant_guard.sql
235_food_form_guard_missing_side_refinement.sql
236_strict_search_food_form_guard.sql
237_strict_search_reopen_metadata_cleanup.sql
238_direct_duplicate_exact_identity_priority.sql
239_direct_duplicate_source_url_provenance_only.sql
240_blue_wilderness_high_protein_line_equivalence.sql
241_strict_search_life_stage_guard.sql
242_infer_dfa_pet_type.sql
243_direct_duplicate_food_form_source_url_identity.sql
244_harden_search_duplicate_closures.sql
245_direct_duplicate_variant_source_url_guards.sql
246_duplicate_closure_audit_rpc.sql
247_demote_live_verified_contract_audit_failures.sql
248_harden_strict_reconcile_audit.sql
249_catalog_feed_source_url_title_correction_guard.sql
250_correct_verified_food_form_source_conflicts.sql
251_reject_unbalanced_catalog_ingredient_parentheses.sql
252_demote_unbalanced_verified_ingredient_rows.sql
253_reject_ingredient_ocr_artifact_catalog_rows.sql
254_extend_ingredient_ocr_artifact_guard.sql
255_extend_solid_gold_ingredient_ocr_artifact_guard.sql
256_extend_petsmart_ingredient_ocr_artifact_guard.sql
257_legacy_token_subset_duplicate_reconcile.sql
258_relax_non_conflicting_duplicate_variant_terms.sql
259_protect_condition_variant_duplicate_closures.sql
260_protect_recipe_family_duplicate_closures.sql
261_protect_liquid_food_form_duplicate_closures.sql
262_extend_mars_ocr_artifact_guard.sql
263_allow_source_backed_curly_ingredient_groups.sql
264_demote_current_live_verified_audit_failures.sql
265_apple_search_ads_attribution_reporting.sql
266_allow_single_formula_count_case_packs.sql
267_extend_split_micronutrient_artifact_guard.sql
268_include_parenthesis_order_in_artifact_guard.sql
269_require_special_food_form_duplicate_match.sql
270_allow_special_food_form_source_identity_duplicates.sql
271_reject_unbalanced_ingredient_square_brackets.sql
272_reopen_blue_buffalo_unverified_duplicate_gap.sql
273_user_ingredient_capture_submission.sql
274_search_verified_products_variant_tiebreaker.sql
275_search_verified_products_typo_and_variant_rank.sql
276_fast_app_verified_product_search.sql
277_skip_verified_search_fuzzy_when_indexed_matches_exist.sql
278_skip_verified_search_identity_when_full_text_satisfies.sql
279_skip_gtin_branch_for_text_verified_search.sql
280_verified_search_early_return_hot_path.sql
281_verified_search_no_slow_fallback_and_life_stage_rank.sql
282_verified_search_pate_prefix_query.sql
283_exclude_exact_verified_gtin_duplicates.sql
284_smart_search_adjacent_transposition.sql
285_exclude_canonical_gtin_verified_duplicates.sql
286_pet_profile_personalized_safety.sql
287_verified_label_ocr_batch_search.sql
288_label_ocr_batch_candidate_diversity.sql
289_verified_label_ocr_text_search.sql
290_secure_scan_entitlement_rpcs.sql
291_optimize_user_rls_policies.sql
292_normalize_catalog_ingredient_groups.sql
293_remove_embedded_catalog_formula_codes.sql
294_demote_verified_statement_array_mismatches.sql
295_restore_pet_profile_write_grant.sql
296_durable_human_food_history_results.sql
297_smart_verified_search_brand_typos.sql
298_reconcile_purina_one_skin_coat_variants.sql
299_expand_verified_catalog_search_identity.sql
300_durable_scan_history_product_images.sql
301_normalize_wellness_stew_identity.sql
302_correct_open_farm_life_stage_metadata.sql
```

Command reminder:

```sh
supabase db push
```

After applying migrations, run the read-only validation artifact:

```sh
psql "$SUPABASE_DB_URL" -f supabase/validation/post_deploy_audit_validation.sql
```

Every row returned by `supabase/validation/post_deploy_audit_validation.sql` should have `pass = true`.

After applying, validate:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'scan_history'
  and column_name = 'safety_level';

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'check_rate_limit',
    'consume_scan',
    'reverse_scan',
    'increment_cache_hit',
    'cleanup_expired_cache',
    'cleanup_stale_rate_limits'
  );

select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'analytics_events',
    'scan_usage_events',
    'revenuecat_events',
    'analysis_cache'
  );

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'revenuecat_events' and column_name in (
      'subscriber_sync_status',
      'subscriber_sync_error',
      'subscriber_synced_at',
      'subscriber_app_user_id'
    ))
    or
    (table_name = 'profiles' and column_name in (
      'revenuecat_subscriber_synced_at',
      'revenuecat_management_url'
    ))
  )
order by table_name, column_name;

-- Should return zero rows. Clients must not be able to mutate entitlement,
-- scan count, or RevenueCat profile fields with the public anon key.
select column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE')
  and (
    column_name in ('scan_count', 'is_pro', 'pro_expires_at')
    or column_name like 'revenuecat_%'
  );

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'scan_history'
  and cmd = 'UPDATE';

select proname
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
  and proname = 'delete_own_account';

-- Should return authenticated EXECUTE only. PUBLIC and anon must not have
-- delete-account execution privileges.
select grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'delete_own_account'
order by grantee, privilege_type;

-- After a controlled delete-account test, replace the UUID below with the
-- deleted user's id. All counts should be zero.
with deleted_user as (
  select '00000000-0000-0000-0000-000000000000'::uuid as id
)
select 'profiles' as source, count(*) from public.profiles, deleted_user where profiles.id = deleted_user.id
union all
select 'scan_history', count(*) from public.scan_history, deleted_user where scan_history.user_id = deleted_user.id
union all
select 'scan_usage_events', count(*) from public.scan_usage_events, deleted_user where scan_usage_events.user_id = deleted_user.id
union all
select 'analytics_events', count(*) from public.analytics_events, deleted_user where analytics_events.user_id = deleted_user.id
union all
select 'rate_limits', count(*) from public.rate_limits, deleted_user where rate_limits.user_id = deleted_user.id
union all
select 'revenuecat_events', count(*) from public.revenuecat_events, deleted_user
where app_user_id = deleted_user.id::text
  or original_app_user_id = deleted_user.id::text
  or subscriber_app_user_id = deleted_user.id::text
  or deleted_user.id = any(processed_user_ids)
  or deleted_user.id::text = any(aliases)
  or payload::text like ('%' || deleted_user.id::text || '%');

select table_name
from information_schema.views
where table_schema = 'public'
  and table_name in (
    'kpi_event_daily',
    'kpi_daily_funnel',
    'kpi_onboarding_path_daily',
    'kpi_user_lifecycle',
    'kpi_activation_cohorts',
    'kpi_share_daily',
    'kpi_scan_usage_daily',
    'kpi_paywall_daily',
    'kpi_paywall_source_daily',
    'kpi_paywall_pitch_daily',
    'kpi_revenuecat_daily',
    'kpi_app_errors_daily'
  );
```

Cron validation after `064_schedule_cleanup_jobs.sql`:

```sql
select jobid, jobname, schedule, command, active
from cron.job
where jobname in ('cleanup-expired-cache', 'cleanup-stale-rate-limits');

select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid in (
  select jobid
  from cron.job
  where jobname in ('cleanup-expired-cache', 'cleanup-stale-rate-limits')
)
order by start_time desc
limit 20;
```

## 4. Edge Function Deployment

Deploy the tracked source for:

```text
supabase/functions/analyze
supabase/functions/label-lookup
supabase/functions/product-lookup
supabase/functions/revenuecat-sync
supabase/functions/revenuecat-webhook
```

Command reminder:

```sh
npm run edge:fingerprint
SUPABASE_PROJECT_REF=<project-ref> SUPABASE_ACCESS_TOKEN=<token> npm run edge:deploy-analyze
supabase functions deploy label-lookup
supabase functions deploy product-lookup
supabase functions deploy revenuecat-sync
supabase functions deploy revenuecat-webhook
SUPABASE_URL=https://<project-ref>.supabase.co npm run edge:verify-live
```

Expected behavior:

- `analyze` enforces server-side free scans through `consume_scan`.
- `analyze` reverses counted free scans through `reverse_scan` when Claude/network/validation failures prevent a valid result.
- `analyze` rejects image payloads above `2_400_000` base64 characters before forwarding them to Claude, matching the app-side upload cap.
- `analyze` rejects `verified` mode unless the product payload carries an explicit verified ingredient provenance status.
- `analyze` emits `woof_error` for malformed final streamed responses.
- `analyze` returns successful scan usage to the app through `woof_scan_usage` streaming events or non-streaming `scanUsage` JSON, so photo and human-food scans do not pre-consume locally. The app must not complete a streamed result, including a photo cache-hit result, unless the final `woof_scan_usage` confirmation arrives.
- `product-lookup` validates auth and centralizes Open Pet Food Facts lookup.
- `revenuecat-sync` validates the authenticated Supabase user, fetches that user's RevenueCat subscriber record through `REVENUECAT_REST_API_KEY`, and service-upserts `profiles.is_pro`, `pro_expires_at`, and RevenueCat subscriber metadata immediately after purchase/restore.
- `revenuecat-webhook` verifies the authorization header, logs raw events, syncs canonical subscriber status through RevenueCat `GET /subscribers` when `REVENUECAT_REST_API_KEY` is configured, falls back to lifecycle event logic when needed, and records `subscriber_sync_status` / `subscriber_sync_error`.
- All Edge Functions use request-aware CORS: native/no-Origin requests are allowed, localhost development origins are allowed, and production browser origins must be listed in `WOOF_ALLOWED_ORIGINS`.
- All Edge Functions return `X-Woof-Function-Name` and `X-Woof-Function-Audit-Version` headers on OPTIONS, JSON, and streaming responses. Record the `npm run edge:fingerprint` SHA-256 output before deploy, then confirm the live OPTIONS headers after deploy with `npm run edge:verify-live`. The verifier can derive the functions host from `SUPABASE_URL`, or you can set `SUPABASE_FUNCTIONS_BASE_URL` / `WOOF_SUPABASE_FUNCTIONS_BASE_URL`.

```sh
curl -i -X OPTIONS "https://<project-ref>.functions.supabase.co/analyze"
curl -i -X OPTIONS "https://<project-ref>.functions.supabase.co/label-lookup"
curl -i -X OPTIONS "https://<project-ref>.functions.supabase.co/product-lookup"
curl -i -X OPTIONS "https://<project-ref>.functions.supabase.co/revenuecat-sync"
curl -i -X OPTIONS "https://<project-ref>.functions.supabase.co/revenuecat-webhook"
```

After deploy, confirm each function has a recent deployment timestamp in Supabase and inspect logs for startup/runtime errors.

## 5. TestFlight Validation

Run these flows on a fresh install:

Complete `REVENUECAT_TESTFLIGHT_RUNBOOK.md` during the RevenueCat portion of TestFlight validation, then update the `RELEASE_EVIDENCE.md` rows for offering packages, webhook sync, purchase/restore, guest scan, and KPI ingestion with non-sensitive proof.

1. Cold start creates or reuses an anonymous Supabase session while onboarding is visible and emits the automatic guest-session events needed to populate `automatic_guest_session_*` KPI fields.
2. On a clean install, the first onboarding screen's `Scan Product` action emits `onboarding_scan_now_tapped`, marks onboarding complete with `completion_method=scan_now`, and opens Scanner as the initial authenticated route.
3. The `How Woof works` onboarding path still lets users page through education and finish to Home.
4. User can scan without creating an Apple/Google account.
5. Camera permission copy matches the selected scan mode, emits `camera_permission_result` after the permission prompt, and blocked permission opens device settings or emits `camera_permission_settings_failed` with fallback guidance.
6. A fresh anonymous session is not blocked by a previous account's local free-scan count; local scan-count persistence should be user-scoped and corrected by the server profile/scan usage response.
7. First successful photo scan stores history and syncs scan count from Edge-returned scan usage.
8. Human-food scan history preserves `safetyLevel` across app restart.
9. Three free scans are allowed and the fourth routes to paywall.
10. Human-food scans sync scan count from Edge-returned scan usage.
11. A failed Claude/network/invalid-output scan does not permanently consume a free scan, including a controlled timeout case where the Edge Function reverses the counted scan before the client shows failure.
12. Retrying or replaying the same `scan_id` after a reversed failed scan does not create a reusable free entitlement; it must re-consume a free scan, allow Pro without counting, or block at the current free limit.
13. Calling `consume_scan` as an authenticated client with a high `p_free_limit` still enforces the configured free limit; only service-role server calls may override the limit.
14. Tapping Back or otherwise leaving a running results screen before a valid streamed result is delivered aborts the analysis and reverses the counted free scan instead of silently reducing the user's remaining scan allowance.
15. A client-side image upload failure before `analyze` is reached does not increment local scan count.
16. Tapping Cancel while the scanner is capturing/optimizing emits `photo_capture_cancelled` and does not navigate to Results or call `analyze` after cancellation.
17. Barcode cache hits still consume exactly one scan locally and sync the result screen counter.
18. Photo cache hits and immediate repeated new scan attempts do not bypass scan accounting: photo results wait for Edge-returned scan usage before completion, while repeated barcode scan attempts consume through the local `consume_scan` path. Saved history/result replay can still reopen without starting a new scan.
19. A Pro sandbox profile is not blocked by the free-user 20/hour abuse cap; the tier-aware `check_rate_limit` still blocks extreme rapid abuse at the higher Pro safety cap.
20. Product barcode lookup uses the Edge Function path and falls back gracefully if the product is not found.
21. Paywall loads the RevenueCat offering and packages.
22. Paywall still loads RevenueCat offerings after sign-out/sign-in, delete-account/reinstall, and guest-to-Apple/Google account-saving flows; the paywall should retry `initializePurchases(user.id)` instead of showing false plan-unavailable states after transient auth-startup SDK misses.
23. Paywall comparison prices, annual monthly equivalent, savings percent, CTA, accessibility label, and trial disclosure match the current RevenueCat package prices and free-trial eligibility for the loaded sandbox offering; iOS unknown/ineligible intro status must show non-trial copy, missing packages must show loading/unavailable states rather than fallback dollar prices, and secondary upgrade gates must stay price-neutral until the RevenueCat-backed paywall loads current prices. If RevenueCat placement rules are configured for source-specific offerings, the app should request the expected placement identifier and fall back to the current offering only when the placement is intentionally unconfigured or returns no offering.
24. In a development build, expand the paywall RevenueCat Debug panel and verify configured key status, source, placement id, offering fetch mode, offering id, returned packages, variant/default plan/pitch, and accepted/ignored metadata signals. Local web QA may open `?woof_paywall_preview=<source>` for the supported paywall sources. Confirm the preview route and panel are guarded behind `__DEV__` and absent from production/TestFlight builds.
25. If RevenueCat Offering Metadata is configured, only safe `paywall_variant`, `default_plan`, headline, and positioning hints apply; unsupported DogFoodAdvisor/CatFoodAdvisor, customer-review, recall, veterinary-approval, guaranteed-safety, or medical-diagnosis claims must be ignored.
26. App Store Connect App Privacy answers match `APP_PRIVACY_DISCLOSURE.md`: the app collects data, Data Used to Track You: No, no IDFA/tracking SDKs are present, linked data includes Contact Info, User ID, Purchase History, Photos or Videos, Other User Content, Product Interaction, Advertising Data for Apple Search Ads attribution, Other Usage Data, Performance Data, Other Diagnostic Data, Customer Support Data, Other Data Types, and Crash Data for Sentry native crash/error reporting.
27. Closing the paywall through the close button and a native back/gesture path emits one `paywall_dismissed` event with `exit_reason`, `close_outcome`, `duration_ms`, source, variant, pitch, selected plan, package-load state, and trial fields; successful purchase/restore exits emit `paywall_closed` without counting as a dismissal.
28. Purchase and restore call `revenuecat-sync`, emit `purchase_entitlement_refreshed` / `restore_entitlement_refreshed` with `is_pro=true`, and update `profiles.is_pro` before the user performs the next server-gated scan. Validate restore from both the Paywall and Profile "Restore Purchases" row, since the public support page points users to Profile.
29. Profile Manage Subscription opens the correct App Store or Google Play subscription-management page for a Pro user and emits `subscription_manage_opened`; if the link cannot open in a test environment, it should emit `subscription_manage_failed` and show fallback store-settings guidance.
30. If a paid sandbox user receives a stale server `free_limit_reached` response, the result screen performs one `scan_limit_recovery` entitlement refresh and retries the scan before showing the paywall.
31. Cancellation/expiration test webhooks update `profiles.is_pro`; real purchase/restore webhooks should also produce `subscriber_sync_status = 'synced'` when `REVENUECAT_REST_API_KEY` is configured.
32. Apple or Google account saving links the guest user without losing history, including scans saved locally before linking, and emits `account_link_revenuecat_reidentified` before the account-link Pro refresh runs; the refresh should resolve Pro state against the newly linked user id, not the previous guest/null auth state.
33. Delete account removes server records in `profiles`, `scan_history`, `scan_usage_events`, `analytics_events`, `rate_limits`, and linkable `revenuecat_events`, and clears local scan history/result/result-prompt/guest-save prompt/review prompt/analytics caches on the device.
34. Result sharing includes the configured Woof share URL in text shares and the captured share card, and share events include `share_url_attached=true`.
35. Profile "Rate Woof" opens the store rating page or emits `app_review_open_failed` with safe diagnostics in environments where the store URL cannot open.
36. Profile "Contact Support" opens an email draft to `woofapp.help@gmail.com` with safe app/platform diagnostics, or emits `support_contact_failed` and shows the fallback email address when the mail client cannot open.
37. Profile remains scrollable on a compact phone viewport for both guest and signed-in states, so save-account, restore, rating, support, legal, sign-out, delete, and version rows are reachable and row subtitles do not overlap chevrons.
38. The post-result review prompt appears only after repeat successful good-scoring pet-food scans for the current guest/account, does not overlap the first-scan toast or post-scan paywall prompt, and emits `app_review_prompt_viewed` / `app_review_prompt_dismissed` / `app_review_requested`.
39. VoiceOver/TalkBack can navigate guest start, pet-food scan, human-food pet picker, result actions, paywall plan selection, restore/legal/rating/support links, profile save-account, and delete confirmations with understandable labels and states.
40. Product UX smoke testing follows `PRODUCT_UX_REVENUE_AUDIT.md`: document whether first launch follows `install -> onboarding Scan Product -> automatic guest session -> scanner -> first result -> result gate`, and do not refresh App Store screenshots or scale paid traffic until the recorded first-run path matches the shipped build.
41. Human-food capture processing copy is mode-specific and does not say `Analyzing ingredients...` while checking human-food safety.
42. Empty-state CTAs, first-scan toast, post-scan upgrade prompt, and guest-save prompts reuse existing `canScan()`, `paywall_requested`, and account-linking paths, avoid overlapping the Pro gate/review prompt, keep prompt seen state scoped to the current guest/account, and emit source-specific analytics.
43. After two scored pet-food scans, Home shows `Compare recent scans`; the modal compares the two saved products, hides for human-food-only history, and each side opens the correct saved result.

## 6. Analytics Validation

Confirm `analytics_events` receives events for:

- `onboarding_*`, including `onboarding_scan_now_tapped`, `onboarding_continue_tapped` with `step_index=0` for the education path, and `onboarding_completed` with `completion_method=scan_now` or `completion_method=completed_flow`; `public.kpi_onboarding_path_daily` should separate `scan_now`, `completed_flow`, and incomplete onboarding paths.
- `analytics_queue_flushed` after a controlled offline/queued-event or cold-start-with-existing-session test, if feasible; `analytics_queue_dropped` should stay rare and only appear for legacy or user-mismatch queue protection.
- `auth_viewed` with `guest_option_available=true` only when the automatic anonymous session path falls back to the auth screen.
- `auth_*`
- `anonymous_sign_in_started`, `anonymous_signed_in`, and `anonymous_sign_in_failed`
- `guest_continue_started`, `guest_continue_completed`, and `guest_continue_failed` after a manual guest fallback test
- `auth_sign_in_started`, `auth_sign_in_completed_client`, `auth_sign_in_failed`, and `auth_sign_in_cancelled` for Apple/Google entry tests. If Google or provider linking returns through a PKCE `code` callback, the app must complete `exchangeCodeForSession` and leave an active Supabase session.
- `scan_*`
- `scan_cta_tapped` from top Home CTAs and empty-state CTAs, including `source_surface: "home_empty_state"` for the inline empty-state actions.
- `free_scan_status_tapped` after tapping the Home free-scan status nudge, with `source_surface: "home_free_scan_status"` and current `remaining_scans`.
- `scanner_help_opened` after tapping Scanner help in pet-food, human-food, and fallback-photo modes; event properties should include `scan_mode`, `fallback_to_photo`, `pet_type`, and `capture_tip`.
- `scan_analysis_started`, `scan_analysis_completed`, `scan_analysis_failed`, `scan_analysis_timeout`, and `scan_analysis_cancelled` should include a generated `scan_id` when they belong to a background analysis.
- `camera_permission_requested`, `camera_permission_result`, and, for blocked permission tests, `camera_permission_settings_opened` or `camera_permission_settings_failed`
- `analysis_*`
- `analysis_upload_started` should include the same generated `scan_id`, `estimated_request_bytes`, and `estimated_image_decoded_bytes` for upload-cost attribution.
- `analysis_image_retry_suppressed` should appear, not a second automatic `analysis_upload_started`, after a controlled image streaming interruption that would otherwise fall back to non-streaming.
- `photo_capture_completed` should include `base64_length`, `estimated_decoded_bytes`, `optimization_step`, and `target_width` so `public.kpi_daily_funnel` can report average optimized capture size before upload.
- `photo_capture_failed` should include `capture_stage` (`camera_capture`, `missing_photo_uri`, `image_optimization`, or `optimization_missing_base64`) and a safe `error_name` / redacted `message` when applicable.
- `photo_capture_too_large` after a controlled oversized-image/dev test, if feasible, with `capture_stage=client_size_gate`.
- `photo_capture_cancelled` after cancelling during scanner capture/optimization; no `analysis_upload_started` should follow for the cancelled capture.
- `free_scan_count_synced`
- `free_scan_count_synced_after_failure` after a controlled failed-analysis test
- `guest_history_migration_skipped`, `guest_history_migration_completed`, or `guest_history_migration_failed` after Apple/Google guest account-saving
- `guest_save_prompt_viewed`, `guest_save_prompt_provider_tapped`, `guest_save_prompt_completed`, `guest_save_prompt_cancelled`, `guest_save_prompt_dismissed`, and `guest_save_prompt_failed` from the post-result guest-save prompt.
- `history_compare_opened`, `history_compare_closed`, and `history_compare_result_opened` after using the recent-scan comparison card, with `source_surface: "home_compare_card"`.
- `history_item_opened` should include `source_surface: "home_recent_scans"` for normal row opens and `source_surface: "home_compare_modal"` when opened from comparison.
- `history_search_started`, `history_search_submitted`, `history_search_cleared`, `history_filter_changed`, `history_filters_cleared`, `history_list_expanded`, and `history_list_collapsed` after using the Home history search, pet-food/human-food filter, and show-all controls; search/filter result opens should record `source_surface: "home_history_search"` or `source_surface: "home_history_filter"`.
- `scan_limit_recovery_started` and either `scan_limit_recovery_retried` or `scan_limit_recovery_not_pro` after a controlled stale-entitlement test, if feasible
- Failed scan events should include `failure_category`, `error_code`, `http_status`, `scan_usage_reversed`, and `scan_usage_reason` when applicable.
- `paywall_*`
- `paywall_requested` from scan-limit, result-gate, post-scan, home-banner, and profile upgrade paths before the corresponding paywall navigation.
- `paywall_offerings_loaded` includes `purchases_initialized`, `revenuecat_configured`, package count, expected package count, missing plan count, weekly/monthly/annual availability, success state, offering identifier, placement identifier, source_intent, source_context_label, placement support, fetch mode, placement return state, and current-offering fallback state so false unavailable-plan states can be separated from dashboard/package or placement-rule issues. `paywall_package_load_failures`, `paywall_expected_package_load_failures`, and `placement_offering_errors` should be zero in normal sandbox purchase tests.
- `paywall_trial_eligibility_loaded` with configured, eligibility status, trial label, and claim state
- `paywall_metadata_applied` after a controlled RevenueCat Offering Metadata test, if metadata is configured
- `paywall_dismissed` after close/back/gesture exits with `exit_reason`, `close_outcome`, `duration_ms`, source, variant, pitch, selected plan, package-load state, and trial fields; successful purchase/restore exits should emit `paywall_closed` without inflating dismissals.
- `purchase_*`
- `purchase_pending` should appear only for payment-pending sandbox cases, not ordinary successful purchases.
- `purchase_no_entitlement` should be absent in normal sandbox purchase flows; if present, check RevenueCat entitlement id `pro`, product/package mapping, active entitlement/subscription counts, and App Store subscription configuration.
- `restore_no_entitlement` should be absent in normal sandbox restore flows; if present with active subscription ids, check RevenueCat entitlement mapping before shipping.
- `revenuecat_profile_sync_completed` after a successful purchase/restore entitlement refresh
- `revenuecat_profile_sync_failed` after a controlled missing-secret or unavailable-function test, if feasible; it should include `http_status`, `sync_status`, and/or `function_error` so RevenueCat REST API key or subscriber fetch issues are diagnosable.
- `purchase_entitlement_refreshed` and `restore_entitlement_refreshed` with `is_pro=true` after sandbox purchase/restore from Paywall and Profile.
- `revenuecat_status_mismatch` should be absent in normal sandbox flows; if present, compare RevenueCat SDK customer info, `revenuecat-sync` response, and `profiles.is_pro` before shipping.
- `revenuecat_status_fallback_used` after a controlled RevenueCat SDK unavailable test, if feasible
- `subscription_manage_opened` after Profile Manage Subscription on a Pro sandbox account, or `subscription_manage_failed` plus fallback guidance in a simulator/test environment where the store settings link is unavailable.
- `support_contact_tapped` and `support_contact_opened` after Profile Contact Support opens a mail draft; `support_contact_failed` plus the fallback alert in a simulator/test environment where mail is unavailable.
- `account_link_revenuecat_reidentified` after a guest user saves their account with Apple or Google
- `history_*`
- `profile_*`
- `share_*`
- `share_started`, `share_completed`, and `share_dismissed` should include `share_url_attached=true` and a safe `share_url_host`, not the raw full URL. Closing the iOS share sheet without sending should emit `share_dismissed`, not `share_completed`.
- `app_review_prompt_viewed`, `app_review_prompt_dismissed`, `app_review_requested`, `app_review_opened`, and `app_review_open_failed`; failures should include only safe platform/store diagnostics, not raw URLs.
- `app_error_captured` after a controlled local/dev error-reporting test; event properties should include `error_category`, `error_fingerprint`, `error_key`, `fatal`, and redacted `error_message` / `top_frame`.

Before reviewing analytics rows, confirm sensitive strings are redacted in event properties and release context is present. Error messages, auth/store failures, URLs, file paths, JWT-like tokens, API-key-like strings, and long opaque payloads should be stored as placeholders such as `[email]`, `[url]`, `[file]`, `[jwt]`, `[secret]`, or `[redacted]`. Every new event should include `app_version`, `native_build_version`, `runtime_version`, `platform`, and `execution_environment` when available.

Validate KPI views:

Use the paste-ready scorecard and drilldowns in `WEEKLY_REVIEW_RUNBOOK.md` for weekly review. The smoke queries below are enough to confirm the service-role views are deployed and returning rows.

```sql
select
  metric_date,
  analytics_queue_flushes,
  analytics_queue_drops,
  analytics_queued_events_flushed,
  analytics_queued_events_dropped,
  onboarding_completion_rate,
  auth_screen_views,
  auth_screen_view_rate,
  automatic_guest_session_success_rate,
  manual_guest_continue_success_rate,
  provider_sign_in_completion_rate,
  auth_completions,
  scan_success_rate,
  cached_scan_completions,
  fresh_scan_completions,
  scan_cache_completion_rate,
  photo_capture_completions,
  avg_photo_capture_base64_length,
  avg_photo_capture_estimated_decoded_bytes,
  avg_photo_capture_optimization_step,
  avg_photo_capture_target_width,
  analysis_image_retry_suppressions,
  image_uploads_per_fresh_scan,
  estimated_upload_bytes_per_fresh_scan,
  scan_completions_with_upload,
  completed_scan_upload_estimated_bytes,
  fresh_completed_scan_upload_estimated_bytes,
  matched_upload_bytes_per_completed_scan,
  matched_upload_bytes_per_fresh_scan,
  history_item_opens,
  history_compare_opens,
  history_compare_result_opens,
  history_compare_result_open_rate,
  app_review_prompt_views,
  app_review_requests,
  app_review_opens,
  app_review_open_success_rate,
  paywall_requests,
  scan_limit_paywall_requests,
  paywall_request_to_view_rate,
  paywall_package_loads,
  paywall_package_load_failures,
  paywall_expected_package_loads,
  paywall_expected_package_load_failures,
  paywall_weekly_package_missing,
  paywall_monthly_package_missing,
  paywall_annual_package_missing,
  paywall_request_to_package_load_rate,
  paywall_view_to_package_load_rate,
  paywall_request_to_expected_package_load_rate,
  paywall_view_to_expected_package_load_rate,
  paywall_dismissals,
  paywall_view_dismissal_rate,
  avg_paywall_dismiss_duration_ms
from public.kpi_daily_funnel
order by metric_date desc
limit 14;

select *
from public.kpi_daily_funnel
order by metric_date desc
limit 14;

select *
from public.kpi_onboarding_path_daily
order by metric_date desc, onboarding_path
limit 50;

select *
from public.kpi_activation_cohorts
order by cohort_date desc
limit 14;

select *
from public.kpi_share_daily
order by metric_date desc, user_plan, scan_mode
limit 50;

select *
from public.kpi_retention_daily
order by metric_date desc, source_surface, user_plan
limit 50;

select *
from public.kpi_app_review_daily
order by metric_date desc, source, user_plan, store, scan_mode
limit 50;

select *
from public.kpi_scan_usage_daily
order by metric_date desc
limit 14;

select *
from public.kpi_analysis_cache_health;

select *
from public.kpi_scan_failures_daily
order by metric_date desc, failure_events desc
limit 50;

select *
from public.kpi_paywall_source_daily
order by metric_date desc, source, source_intent
limit 50;

select *
from public.kpi_paywall_pitch_daily
order by metric_date desc, source, source_intent, pitch_key
limit 50;

select *
from public.kpi_paywall_daily
order by metric_date desc, source, source_intent, pitch_key, plan
limit 50;

select *
from public.kpi_revenuecat_daily
order by metric_date desc
limit 14;

select *
from public.kpi_app_errors_daily
order by metric_date desc, sessions_impacted desc
limit 50;

select *
from public.kpi_app_release_daily
order by metric_date desc, platform, app_version, native_build_version
limit 50;
```

Minimum weekly dashboard metrics:

- installs
- first scan rate
- scan success rate
- scan failure rate by error category
- scan failure category/error-code mix by app version
- cached vs fresh scan completions
- scan cache completion rate
- active/expired analysis cache rows
- active analysis cache payload bytes
- active hits per cache row
- image upload attempts
- image upload attempts per fresh scan
- average estimated image/request upload bytes
- estimated upload bytes per fresh scan
- scan-id-matched upload bytes per completed scan
- scan-id-matched upload bytes per fresh scan
- oversized photo blocks
- paywall view rate
- paywall dismissal rate and average dismiss duration
- plan selection mix
- trial-claim rate
- trial start rate
- paid conversion rate
- churn/cancellation rate
- RevenueCat subscriber sync error count
- share rate
- free/pro share completion rate
- app review prompt views, rating-page requests, successful store opens, and open success rate
- support contact taps, email opens, failures, and open rate
- app error session rate
- app version/build scan success, purchase, entitlement-refresh, and error trends
- Supabase egress per successful scan
- crash-free sessions
- cost per first completed scan once paid creative tests begin

## 7. Release Gates

Do not submit the next production build until:

- The current audit work has been pushed through a reconciled PR, not the stale draft PR #1 as-is, the release PR uses `.github/pull_request_template.md`, has no stale `supabase/migrations/007`-`057` files from the old branch, and GitHub check runs for the smoke CI workflow are green.
- Guest scan works in TestFlight.
- Supabase Auth dashboard validation is complete: Anonymous Sign-Ins, manual identity linking, Apple/Google redirect URLs, anonymous-user `authenticated` role/RLS implications, abuse controls/rate limits, anonymous-user cleanup retention, and Leaked Password Protection or waiver are all recorded.
- Server-side free-scan enforcement works in TestFlight.
- Profile privilege validation shows authenticated clients cannot insert/update `is_pro`, `scan_count`, `pro_expires_at`, or `revenuecat_%` columns.
- Delete-account validation confirms no rows remain for the deleted user in `analytics_events`, `scan_usage_events`, `rate_limits`, `profiles`, `scan_history`, or linkable `revenuecat_events`.
- Scan reversal works for at least one forced downstream failure.
- RevenueCat webhook entitlement sync is verified with a test event and a real sandbox purchase/restore, with no repeated `subscriber_sync_error` rows.
- Supabase cron jobs exist in `cron.job`.
- No unsupported source claims remain in App Store copy/screenshots. The first three screenshots remain product-proof-first: scan, score, ingredient flags.
- No unsupported customer-review or recall-history claims remain in app screens, hosted legal/support pages, or App Store copy/screenshots.
- `npm run check:live-listing -- --guest-validated` passes after App Store Connect metadata is updated and publicly visible, proving the live US App Store description no longer contains unsupported source, recall, or overbroad safety claims.
- `APP_STORE_LISTING.md` replacement metadata has been applied or intentionally superseded in App Store Connect.
- `APP_PRIVACY_DISCLOSURE.md` has been applied or intentionally superseded in App Store Connect, including `Data Used to Track You: No`, No IDFA/no tracking SDKs, linked-data categories, third-party processors, and Sentry Crash Data status.
- `npm run check:eas-versioning` passes, `npx eas-cli@latest build:version:get -p ios` output is saved, and the submitted App Store Connect/TestFlight build row shows marketing version `1.2.1` with a build number greater than `41`.
- `npm run edge:verify-live` passes against the live Supabase functions host, proving OPTIONS responses expose the expected `X-Woof-Function-Name` and `X-Woof-Function-Audit-Version` values for the tracked build.
- `npm run check:edge-types` passes with Deno, proving the tracked Edge Functions type-check in the Deno runtime before deployment.
- `npm run check:audit` passes after `npm ci`, proving production dependency advisories have no high/critical findings and have not regressed above the tracked moderate baseline.
- `npm run catalog:verification-gaps` has been reviewed, including `catalog_verification_gap` events from real searches/scans, and the highest-priority brands/products either have official/manufacturer/GDSN feeds imported or are recorded as a known launch blocker.
- `npm run catalog:acquisition-queue` has refreshed and reconciled `catalog_acquisition_queue`; `npm run catalog:acquisition-queue -- --csv` has produced the source-acquisition worklist joined to `scripts/catalog-source-targets.json`; the highest-priority open rows have assigned source owners, official/manufacturer/GDSN feeds imported, or launch-blocker notes.
- `npm run catalog:source-feed-worklist -- --csv` has produced the owner-level official-feed worklist, and `npm run catalog:source-feed-worklist -- --template-dir outputs/catalog-feed-templates` has generated import templates requiring `product_url` evidence, exact ingredient statements, verified product images, dog/cat `pet_type`, and complete-food flags before rows may be imported as verified.
- `npm run check:catalog-source-targets -- --strict-live --min-affected-products 20` passes with `SUPABASE_SERVICE_ROLE_KEY`, proving meaningful live acquisition-queue US retail brands have source owners, official/manufacturer/GDSN/retailer target URLs, alias coverage for shelf sub-lines, or explicit non-US/generic/non-complete-food classification before claiming full product coverage.
- `npm run check:catalog-completeness` passes against the live Supabase catalog, proving the release has at least 12,000 ready complete-food products, at least 90% image coverage, at least 750 ready brands, dog/cat minimums, no more than 5% unknown pet-type rows, 100% verified ingredient coverage with non-empty source-backed ingredient text, at least 95% verified product-image coverage, at least 95% structured recipe identity coverage that does not count package size alone, and zero open/in-progress acquisition queue rows or affected products.
- `npm run check:expo-versions` prints `Expo package version check passed` after `npm ci`, proving installed Expo SDK package versions match the SDK 55 compatibility table.
- `npm run check:expo-config` prints `Expo config check passed` after `npm ci`, proving Expo can resolve preview config with public env and fails fast for production builds missing required public env.
- `npm run check:bundle` passes after `npm ci`, proving Expo can export iOS and Android Hermes bundles plus a web JavaScript bundle without duplicate React Native / Metro resolution failures or missing Expo web runtime packages.
- `npm run check:prebuild` passes after `npm ci`, proving Expo can generate iOS and Android native project files in a temporary directory without the `expo-system-ui` native config warning.
- `npm run check:evidence -- --strict` passes after `RELEASE_EVIDENCE.md` is filled with non-sensitive proof for GitHub CI, Supabase deploy/validation, RevenueCat purchase/restore sync, App Store metadata/live listing, EAS build numbering, Sentry release health, TestFlight smoke, KPI ingestion, and growth-spend gating.
- App Store Connect crash count is checked after the new build is live.
- Sentry native crash reporting is installed with `@sentry/react-native`, the Expo config plugin and Metro wrapper are present, EAS Sentry environment is configured, source-map upload succeeds, and a TestFlight smoke build produces crash-free session/release-health evidence before production submission.
- `app_error_captured` does not spike during TestFlight smoke testing.
- Profile support contact succeeds in TestFlight or the support fallback is verified, with no unexpected `support_contact_failed` spike.
- VoiceOver/TalkBack smoke testing does not reveal blocking focus-order, missing-label, modal-dismissal, or paywall-plan selection issues.
- Paid creative spend remains paused until the `GROWTH_CREATIVE_PLAN.md` launch gates are met.

## 8. Rollback Signals

Pause rollout or revert the backend deploy if:

- `analyze` returns widespread `402`, `500`, or malformed stream errors.
- `scan_usage_events` increments without corresponding successful scans and reversal does not correct it.
- Purchases succeed in RevenueCat but `profiles.is_pro` does not update, or `public.kpi_revenuecat_daily.subscriber_sync_errors` repeats after deploy.
- Egress per scan, `scan_cache_completion_rate`, `active_hits_per_cache_row`, `active_cache_payload_bytes`, `avg_photo_capture_base64_length`, `avg_photo_capture_estimated_decoded_bytes`, `image_uploads_per_fresh_scan`, `analysis_image_retry_suppressions`, `analysis_upload_estimated_bytes`, `avg_analysis_upload_estimated_bytes`, or `estimated_upload_bytes_per_fresh_scan` worsens materially after the deploy.
- `anonymous_sign_in_failed`, `automatic_guest_session_failures`, Auth rate-limit errors, or anonymous user growth spike after enabling anonymous-first scanning.
- Anonymous users cannot save accounts through Apple or Google.
- App Store Connect crash rate increases after TestFlight or phased release.
- `public.kpi_app_errors_daily` shows repeated fatal errors from the new build.
- `public.kpi_app_errors_daily` shows repeated `error_fingerprint` rows or one `error_category` dominating the new build.
