# Woof Market-Leader Catalog Scraping Runbook

Last updated: 2026-07-10

## Current Verified Import State

- Live catalog rows: 17,694
- Live dog/cat rows: 13,123
- Live verified-ready rows: 8,297
- Live dog verified-ready rows: 4,947
- Live cat verified-ready rows: 3,350
- Live verified-ready ingredient artifact rows: 0
- Live verified-ready HTML product-name rows: 0
- Live Purina Pro Plan manufacturer rows: 186 strict verified-ready rows with manufacturer ingredients and manufacturer images
- Live PetSmart broad retail rows: 2,300 strict verified-ready rows with retailer-verified ingredients and front image URLs
- Live PetSmart private-label rows: Authority has 67 strict verified-ready rows from 69 source rows; Simply Nourish has 61 strict verified-ready rows from 67 source rows
- Live Merrick manufacturer rows: 112 strict verified-ready rows with manufacturer ingredients and manufacturer images
- Live Weruva manufacturer rows: 282 strict verified-ready rows from 283 source rows with manufacturer ingredients and manufacturer images
- Live Dog Chow rows: 12 strict verified-ready rows with manufacturer ingredients and manufacturer images
- Live JustFoodForDogs rows: 23 verified-ready rows with manufacturer ingredients and manufacturer images
- Live Open Farm manufacturer rows: 141 strict verified-ready rows from the current 141-row official import manifest; one older live bundle row remains excluded as `non_single_product_bundle`
- Open acquisition queue: 4,787 rows after the latest bounded reconciliation work; 3,817 product rows and 970 brand rows cover 3,773 distinct open product names across 1,018 brands, with 3,273 explicit dog/cat rows and 1,514 species-ambiguous rows. The queue affects 7,865 products; all 4,787 rows still need verified ingredients, 4,770 need a verified image, and 849 need pet type.
- Live completeness audit, 2026-07-10: 12,188 rows meet the broad complete-food/ingredient-count gate, but only 8,297 pass the strict `catalog_quality_state(...)=verified_ready` contract. A transaction-rolled-back strict reconciliation probe across the ten highest-demand brands resolved `0` rows, so these gaps are not stale exact duplicates and must remain open for source acquisition or reviewed identity evidence.
- Current aggregate pending import delta: 0 importable SQL rows; 40 import-rejected rows requiring repair, manual review, duplicate/demotion cleanup, or explicit exclusion; regenerated at `2026-07-02T04:43:54.810Z` after scanning `390` source manifests and `22,029` manifest rows
- Live artifact guard update, `2026-07-02`: `catalog_has_ingredient_ocr_artifacts` now delegates to ordered-parentheses and ordered-square-bracket validators, rejects Mars OCR substitutions, rejects missing-leading-`L` `L-Ascorbyl-2-Polyphosphate` artifacts, and rejects sentence-split preservative artifacts such as `Vitamin E Supplement. preserved with Mixed Tocopherols`
- Current retailer controlled-source state: 12 restricted retail targets tracked for Chewy, Petco, Walmart, and their private-label food lines; request pack regenerated at `2026-07-02T04:53:04.824Z`, readiness regenerated at `2026-07-02T04:54:28.032Z`
- Retail controlled-source readiness: 11 targets are waiting for authorized feed files, 1 Petco WholeHearted target has a rendered snapshot batch ready for guarded snapshot import review, 3 broad retail catalog requirements remain for Chewy, Petco, and Walmart, 0 authorized feed files are present, 0 authorized-feed SQL rows are generated
- Live retail restricted-source demand from Supabase: 38 open acquisition rows affecting 66 products; all 38 need verified ingredients and verified images. Current nonzero feed priorities are Pure Balance 17 open / 32 affected, Ol' Roy 11 / 18, Special Kitty 6 / 10, and American Journey 4 / 6. Broad Chewy/Petco/Walmart retail catalog targets currently have 0 queue rows by host/source matching, but they remain full coverage requirements because the product goal is entire retailer shelf coverage, not only known demand gaps.
- Authorized feed intake folders are generated under `inputs/catalog-authorized-feeds/<source-slug>/` with `README.md`, `.gitkeep`, and ignored `feed.csv.template` files. The standard market-leader restricted-pack command now passes `--write-input-dropzone`, and the request-pack generator clears stale generated docs/templates/sql before writing a new pack.

## What Can Run Now

Use official/manufacturer sources first. These can produce verified candidates when the source page contains exact ingredients, front image, pet type, complete-food evidence, and source URL.

For Chewy, Petco, Walmart, and private-label retail coverage, generate the authorized-feed request/drop workflow first:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode restricted-pack \
  --only-restricted \
  --output-dir outputs/catalog-market-leaders/current \
  --continue-on-error \
  --json
```

Then place licensed or explicitly authorized files at `inputs/catalog-authorized-feeds/<source-slug>/feed.csv` and run:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-authorized-feed-drop-import.mjs \
  --input-dir inputs/catalog-authorized-feeds \
  --output-dir outputs/catalog-authorized-feed-imports \
  --json
```

The drop importer emits guarded SQL chunks only. Templates named `feed.csv.template` are intentionally ignored.

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --url-limit 20 \
  --source-timeout-minutes 15 \
  --child-timeout-minutes 18 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/window-0-20
```

Run additional windows by increasing `--url-offset`:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --url-offset 20 \
  --url-limit 20 \
  --source-timeout-minutes 15 \
  --child-timeout-minutes 18 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/window-20-20
```

For Open Farm specifically, the current official discovery found 196 product URLs. The official extract accepted 141 strict complete-food SQL rows from those pages, and the source-specific pending delta at `outputs/catalog-pending-import-delta/open-farm-current/` is clear: `0` pending import rows, `0` rejected rows, and `141` manifest rows scanned. A later offset `200`, limit `20` tail check at `outputs/catalog-source-imports/open-farm-window-200-20/` produced zero filtered product URLs; the batch script records zero URLs as an error, but this is the current official Open Farm dog/cat collection exhaustion signal.

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-scrape-all.mjs \
  --mode extract \
  --source open-farm \
  --limit 1 \
  --url-offset 20 \
  --url-limit 20 \
  --source-timeout-minutes 15 \
  --continue-on-error
```

For Purina Pro Plan specifically, the latest full official refresh completed successfully at `2026-07-02T03:14:04.728Z` after extending the child extraction window:

- Official source: `https://www.purina.com/pro-plan/products`
- Discovered official product URLs: `130`
- Feed rows with ingredients: `130`
- Feed rows with front images: `130`
- Complete-food source rows: `128`
- Strict SQL manifest rows: `125`
- Validation accepted candidates: `126`
- Validation rejected candidates: `4` (`2` incomplete ingredient statements, `2` not complete food)
- Pre-import source-specific pending delta found `2` rows and `0` import-rejected rows
- Current source-specific pending delta at `outputs/catalog-pending-import-delta/nestle-purina-pro-plan-current/`: regenerated at `2026-07-02T03:25:56.100Z`; `125` manifest rows scanned, `0` pending rows, `0` import-rejected rows
- Live import applied `2` manufacturer-backed rows through `public.upsert_catalog_product_feed(jsonb)` and inserted `2` audit/evidence rows in `catalog_import_runs` / `catalog_product_evidence`
- Imported cache keys: `nestle-purina-pro-plan:038100181657` and `nestle-purina-pro-plan:038100190703`
- Post-import verification: `2` imported rows, `2` strict-ready rows, `0` ingredient artifact rows
- Queue cleanup after import: brand-scoped strict search resolved `3` Pro Plan gaps; direct verified duplicate closer resolved `1` legacy duplicate gap and excluded `1` stale legacy product row
- Live Pro Plan queue status after cleanup: `158` open, `57` deferred, `43` resolved

For Pedigree specifically, the latest full official run timed out after processing `50` of `99` official product URLs, so the source was exhausted with bounded windowed runs:

- Full attempted output: `outputs/catalog-source-imports/pedigree-mars-petcare/`; child extraction timed out at `360000ms`
- Window `0-40`: `40` official pages, `37` rows with OCR ingredients, `34` strict SQL rows; source-specific pending delta had `0` pending rows and `0` import-rejected rows
- Window `40-80`: `40` official pages, `11` strict SQL rows after excluding treats/variety/non-complete rows; source-specific pending delta now has `0` pending rows and `4` import-rejected rows after stricter OCR exactness guards
- Window `80-99`: `19` official pages, `3` strict SQL rows after strict exclusions; source-specific pending delta had `0` pending rows and `0` import-rejected rows
- No Pedigree rows were imported from this pass. The only newly missing candidates failed exact ingredient quality after guard hardening, so they remain out of verified-ready.
- Guard hardening from the Pedigree/Blue Buffalo audit:
  - `scripts/catalog-scraper-contract.mjs`
  - `scripts/catalog-pending-import-delta.mjs`
  - `scripts/catalog-official-feed-import.mjs`
  - `scripts/catalog-generated-sql-missing-import.mjs`
  - `scripts/catalog-nutro-ocr-import-batch.mjs`
  - `scripts/catalog-solid-gold-shopify-ocr-import-batch.mjs`
  - `supabase/migrations/271_reject_unbalanced_ingredient_square_brackets.sql`
- Live SQL functions were updated and verified through Supabase MCP `execute_sql` after `apply_migration` timed out; the local migration file records the intended DDL and demotion logic.
- Quality cleanup demoted `34` previously verified OCR rows and marked `35` evidence rows for manual review. An additional check for missing-leading-`L` and sentence-split preservative artifacts found `0` existing live verified-ready rows to demote.

The latest priority window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source open-farm \
  --source blue-buffalo-general-mills \
  --source nestle-purina-pro-plan \
  --source wellness-pet-company \
  --source petsmart-retail-catalog \
  --url-limit 20 \
  --source-timeout-minutes 15 \
  --child-timeout-minutes 20 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-0-20
```

Current result:

- Blue Buffalo: `20` accepted, `0` rejected
- Purina Pro Plan: `20` accepted, `0` rejected; `1` new manufacturer-backed wet cat food row was imported live and audit evidence was inserted
- Open Farm: `17` accepted, `3` rejected as not complete food
- Wellness: `20` accepted, `0` rejected
- PetSmart retail: `2,311` accepted, `909` rejected by strict gates; no live delta remained after duplicate/live checks

The latest priority `20-40` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source nestle-purina-pro-plan \
  --source open-farm \
  --source wellness-pet-company \
  --source hill-s-pet-nutrition \
  --source royal-canin-mars-petcare \
  --source nulo \
  --source taste-of-the-wild-diamond-pet-foods \
  --url-offset 20 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-20-20
```

Current result:

- Blue Buffalo: `19` accepted, `1` rejected as not complete food
- Hill's Pet Nutrition: `19` accepted, `1` rejected as non-complete/treat; `9` new manufacturer-backed Prescription Diet cat food rows imported live with audit evidence
- Purina Pro Plan: `20` accepted, `0` rejected
- Nulo: `15` accepted, `5` rejected by strict gates
- Open Farm: `18` accepted, `2` rejected as non-complete
- Royal Canin: `562` accepted, `25` rejected by strict gates
- Taste of the Wild: `8` accepted, `0` rejected
- Wellness: `19` accepted, `1` rejected by ingredient completeness gates
- Aggregate pending import delta after live import: `0`

The secondary `20-40` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source nestle-purina-fancy-feast \
  --source nestle-purina-friskies \
  --source nestle-purina-one \
  --source stella-and-chewys \
  --source tiki-pets \
  --source orijen-champion-petfoods \
  --source merrick-pet-care \
  --source pedigree-mars-petcare \
  --url-offset 20 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/secondary-window-20-20
```

Current result:

- Total: `160` candidates, `116` accepted, `44` rejected
- `4` new Fancy Feast rows imported live with audit evidence
- Aggregate pending import delta after live import: `0`

The priority `40-60` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source nestle-purina-pro-plan \
  --source hill-s-pet-nutrition \
  --source nulo \
  --source open-farm \
  --source wellness-pet-company \
  --source nestle-purina-fancy-feast \
  --source nestle-purina-friskies \
  --url-offset 40 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-40-20
```

Current result:

- Total: `160` candidates, `134` accepted, `26` rejected
- `1` new Fancy Feast row imported live with audit evidence after deterministic split-micronutrient cleanup
- Aggregate pending import delta after live import: `0`
- Dashboard full refresh hit a live database statement timeout; the state above was verified directly with Supabase SQL

The priority `60-80` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source hill-s-pet-nutrition \
  --source open-farm \
  --source wellness-pet-company \
  --source nestle-purina-fancy-feast \
  --source nestle-purina-friskies \
  --source tiki-pets \
  --source stella-and-chewys \
  --url-offset 60 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-60-20
```

Current result:

- Total: `145` candidates, `114` accepted, `31` rejected
- Blue Buffalo: `20` accepted, `0` rejected
- Hill's Pet Nutrition: `19` accepted, `1` rejected; `1` new ONC Care cat food row imported live with audit evidence
- Fancy Feast: `19` accepted, `1` rejected
- Friskies: `5` accepted, `0` rejected
- Open Farm: `17` accepted, `3` rejected
- Stella & Chewy's: `0` accepted, `20` rejected as non-complete products
- Tiki Pets: `15` accepted, `5` rejected
- Wellness: `19` accepted, `1` rejected
- Aggregate pending import delta after live import: `0`

The priority `80-100` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source hill-s-pet-nutrition \
  --source open-farm \
  --source wellness-pet-company \
  --source nestle-purina-fancy-feast \
  --source tiki-pets \
  --source earthborn-holistic-midwestern \
  --source victor-pet-food \
  --url-offset 80 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-80-20
```

Current result:

- Total selected by the market-leader runner: `6` runnable manufacturer sources. `earthborn-holistic-midwestern` and `victor-pet-food` were not selected by the runner's current market-leader filter and should be run directly with `catalog-scrape-all.mjs`.
- Total: `113` candidates, `103` accepted, `10` rejected
- Blue Buffalo: `20` accepted, `0` rejected
- Hill's Pet Nutrition: `17` accepted, `3` rejected; `1` new Science Diet cat food row imported live with audit evidence
- Fancy Feast: `12` accepted, `1` rejected; `1` new Fancy Feast wet cat food row imported live with audit evidence
- Open Farm: `19` accepted, `1` rejected
- Tiki Pets: `20` accepted, `0` rejected
- Wellness: `15` accepted, `5` rejected
- Aggregate pending import delta after live import: `0`
- Live verified-ready ingredient artifact rows after import: `0`
- Verification passed: `check-catalog-scraper`, `check-catalog-quality`, `check-product-resolver-contract`, `check-js-syntax`

Direct tier-2 follow-up after the `80-100` run:

- `earthborn-holistic-midwestern --url-offset 25 --url-limit 25`: official sitemap had `0` URLs after filtering, so the current discovered Earthborn window is exhausted
- `victor-pet-food --url-offset 25 --url-limit 25`: `13` candidates, `10` accepted, `3` rejected; aggregate pending import delta remained `0`

The priority `100-120` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source hill-s-pet-nutrition \
  --source nestle-purina-pro-plan \
  --source wellness-pet-company \
  --source nulo \
  --source royal-canin-mars-petcare \
  --source nestle-purina-fancy-feast \
  --source tiki-pets \
  --url-offset 100 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-100-20
```

Current result:

- Total selected by the market-leader runner: `8` runnable manufacturer sources
- Blue Buffalo: `20` candidates, `19` accepted, `1` rejected as not complete food
- Hill's Pet Nutrition: `20` candidates, `18` accepted, `2` rejected; `4` new Science Diet cat food rows imported live with audit evidence
- Fancy Feast: exhausted after offset `100`; `0` product URLs after filtering
- Pro Plan: `20` candidates, `20` accepted, `0` rejected; `4` new Pro Plan dog food rows imported live with audit evidence
- Nulo: `20` candidates, `13` accepted, `7` rejected as treats/broths/non-complete or ambiguous pet type
- Royal Canin: extraction artifact contains `587` candidates, `562` accepted, `25` rejected; no live delta remained after duplicate/live checks
- Tiki Pets: `20` candidates, `20` accepted, `0` rejected
- Wellness: `20` candidates, `20` accepted, `0` rejected
- Aggregate pending import delta after live import: `0`
- Live verified-ready ingredient artifact rows after import: `0`
- Verification passed: `check-catalog-scraper`, `check-catalog-quality`, `check-product-resolver-contract`, `check-js-syntax`

The priority `120-140` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source hill-s-pet-nutrition \
  --source nestle-purina-pro-plan \
  --source blue-buffalo-general-mills \
  --source open-farm \
  --source wellness-pet-company \
  --source tiki-pets \
  --source nestle-purina-friskies \
  --source nestle-purina-one \
  --url-offset 120 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-120-20
```

Current result:

- Total selected by the market-leader runner: `8` runnable manufacturer sources
- Total with candidate summaries: `118` candidates, `90` accepted, `28` rejected
- Blue Buffalo: `20` candidates, `20` accepted, `0` rejected
- Hill's Pet Nutrition: `20` candidates, `15` accepted, `5` rejected as non-complete/variety-pack rows; `4` new Science Diet cat food rows imported live with audit evidence
- Friskies: exhausted after offset `120`; `0` product URLs after filtering
- Purina ONE: exhausted after offset `120`; `0` product URLs after filtering
- Pro Plan: `18` candidates, `16` accepted, `2` rejected as not complete food; `1` new Pro Plan dog food row imported live with audit evidence
- Open Farm: `20` candidates, `7` accepted, `13` rejected as non-complete or missing complete ingredient evidence
- Tiki Pets: `20` candidates, `20` accepted, `0` rejected
- Wellness: `20` candidates, `12` accepted, `8` rejected as not complete food
- Aggregate pending import delta after live import: `0`
- Live verified-ready ingredient artifact rows after import: `0`
- Verification passed: `check-catalog-scraper`, `check-catalog-quality`, `check-product-resolver-contract`, `check-js-syntax`

The priority `140-160` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source hill-s-pet-nutrition \
  --source nestle-purina-pro-plan \
  --source open-farm \
  --source wellness-pet-company \
  --source tiki-pets \
  --source nulo \
  --source taste-of-the-wild-diamond-pet-foods \
  --url-offset 140 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-140-20
```

Current result:

- Total selected by the market-leader runner: `8` runnable manufacturer sources
- Total with candidate summaries: `120` candidates, `81` accepted, `39` rejected
- Blue Buffalo: `20` candidates, `12` accepted, `8` rejected as not complete food
- Hill's Pet Nutrition: `20` candidates, `17` accepted, `3` rejected as non-complete/variety-pack rows; `2` new Science Diet cat food rows imported live with audit evidence
- Pro Plan: exhausted after offset `140`; `0` product URLs after filtering
- Nulo: `20` candidates, `8` accepted, `12` rejected as non-complete or missing complete ingredient evidence
- Open Farm: `20` candidates, `5` accepted, `15` rejected as non-complete or missing complete ingredient evidence
- Taste of the Wild: exhausted after offset `140`; `0` products from the official API importer
- Tiki Pets: `20` candidates, `19` accepted, `1` rejected as non-complete/topper
- Wellness: `20` candidates, `20` accepted, `0` rejected
- Aggregate pending import delta after live import: `0`
- Live verified-ready ingredient artifact rows after import: `0`
- Verification passed: `check-catalog-scraper`, `check-catalog-quality`, `check-product-resolver-contract`, `check-js-syntax`

The priority `160-180` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source hill-s-pet-nutrition \
  --source open-farm \
  --source wellness-pet-company \
  --source tiki-pets \
  --source nulo \
  --url-offset 160 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-160-20
```

Current result:

- Total selected by the market-leader runner: `6` runnable manufacturer sources
- Total with candidate summaries: `120` candidates, `98` accepted, `22` rejected
- Blue Buffalo: `20` candidates, `20` accepted, `0` rejected
- Hill's Pet Nutrition: `20` candidates, `20` accepted, `0` rejected; `5` new Science Diet cat food rows imported live with audit evidence
- Nulo: `20` candidates, `19` accepted, `1` rejected for missing/incomplete ingredient evidence
- Open Farm: `20` candidates, `2` accepted, `18` rejected as non-complete or missing complete ingredient evidence
- Tiki Pets: `20` candidates, `17` accepted, `3` rejected as non-complete or missing complete ingredient evidence
- Wellness: `20` candidates, `20` accepted, `0` rejected
- Import sanitation: `scripts/catalog-scraper-contract.mjs` and `scripts/catalog-pending-import-delta.mjs` now strip HTML tags from product identity fields before validation/import payload generation; ingredient text remains unsanitized exact source evidence
- Aggregate pending import delta after live import: `0`
- Live verified-ready ingredient artifact rows after import: `0`
- Live verified-ready HTML product-name rows after import: `0`
- Verification passed: `check-catalog-scraper`, `check-catalog-quality`, `check-product-resolver-contract`, `check-js-syntax`

The priority `180-200` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source hill-s-pet-nutrition \
  --source open-farm \
  --source wellness-pet-company \
  --source tiki-pets \
  --source nulo \
  --url-offset 180 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-180-20
```

Current result:

- Total selected by the market-leader runner: `6` runnable manufacturer sources
- Total with candidate summaries: `96` candidates, `57` accepted, `39` rejected
- Blue Buffalo: `20` candidates, `11` accepted, `9` rejected as non-complete
- Hill's Pet Nutrition: `20` candidates, `0` accepted, `20` rejected, primarily brand/source mismatch and non-complete identity
- Nulo: `20` candidates, `20` accepted, `0` rejected
- Open Farm: `16` candidates, `7` accepted, `9` rejected as non-complete
- Tiki Pets: official source run completed but emitted no candidate summary at this offset
- Wellness: `20` candidates, `19` accepted, `1` rejected for missing/incomplete ingredient evidence
- Aggregate pending import delta after live diff: `0`
- Verification passed after later import batch: `check-catalog-scraper`, `check-catalog-quality`, `check-product-resolver-contract`, `check-js-syntax`

The priority `200-220` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source hill-s-pet-nutrition \
  --source wellness-pet-company \
  --source tiki-pets \
  --source nulo \
  --url-offset 200 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-200-20
```

Current result:

- Total selected by the market-leader runner: `5` runnable manufacturer sources
- Total with candidate summaries: `80` candidates, `73` accepted, `7` rejected
- Blue Buffalo: `20` candidates, `18` accepted, `2` rejected as non-complete
- Hill's Pet Nutrition: `20` candidates, `19` accepted, `1` rejected; `4` new Prescription Diet dog food rows imported live with audit evidence
- Nulo: `20` candidates, `18` accepted, `2` rejected as non-complete
- Tiki Pets: official source run completed but emitted no candidate summary at this offset
- Wellness: `20` candidates, `18` accepted, `2` rejected as non-complete/missing complete ingredient evidence
- Aggregate pending import delta after live import: `0`
- Live verified-ready ingredient artifact rows after import: `0`
- Live verified-ready HTML product-name rows after import: `0`
- Verification passed: `check-catalog-scraper`, `check-catalog-quality`, `check-product-resolver-contract`, `check-js-syntax`

The priority `220-240` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source hill-s-pet-nutrition \
  --source wellness-pet-company \
  --source nulo \
  --url-offset 220 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-220-20
```

Current result:

- Total selected by the market-leader runner: `4` runnable manufacturer sources
- Total with candidate summaries: `80` candidates, `71` accepted, `9` rejected
- Blue Buffalo: `20` candidates, `18` accepted, `2` rejected as non-complete
- Hill's Pet Nutrition: `20` candidates, `19` accepted, `1` rejected; `10` new Prescription Diet dog food rows imported live with audit evidence
- Nulo: `20` candidates, `15` accepted, `5` rejected as non-complete or missing/mismatched ingredient evidence
- Wellness: `20` candidates, `19` accepted, `1` rejected for missing/incomplete ingredient evidence
- Aggregate pending import delta after live import: `0`
- Live verified-ready ingredient artifact rows after import: `0`
- Live verified-ready HTML product-name rows after import: `0`
- Verification passed: `check-catalog-scraper`, `check-catalog-quality`, `check-product-resolver-contract`, `check-js-syntax`

The priority `240-260` window run is:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-market-leader-run.mjs \
  --mode scrape \
  --only-runnable \
  --source blue-buffalo-general-mills \
  --source hill-s-pet-nutrition \
  --source wellness-pet-company \
  --source nulo \
  --url-offset 240 \
  --url-limit 20 \
  --source-timeout-minutes 18 \
  --child-timeout-minutes 24 \
  --continue-on-error \
  --json \
  --output-dir outputs/catalog-market-leaders/priority-window-240-20
```

Current result:

- Total selected by the market-leader runner: `4` runnable manufacturer sources
- Total with candidate summaries: `66` candidates, `55` accepted, `11` rejected
- Blue Buffalo: `20` candidates, `16` accepted, `4` rejected as not complete food
- Hill's Pet Nutrition: `20` candidates, `18` accepted, `2` rejected as non-complete, form mismatch, or missing ingredient evidence
- Nulo: `20` candidates, `15` accepted, `5` rejected as non-complete or missing ingredient evidence
- Wellness: `6` candidates, `6` accepted, `0` rejected
- Aggregate pending import delta after live diff: `0`
- Verification passed: `check-catalog-scraper`, `check-catalog-quality`, `check-product-resolver-contract`, `check-js-syntax`

Ingredient exactness guard added July 1, 2026:

- `scripts/catalog-page-feed-extract.mjs` normalizes observed safe split micronutrient terms such as `pyr idoxine`, `ribo flavin`, and `bio tin`
- `scripts/catalog-scraper-contract.mjs` rejects any split micronutrient artifact that leaks into candidate validation
- `scripts/catalog-pending-import-delta.mjs` rejects split micronutrient artifacts before live import payload generation
- `supabase/migrations/267_extend_split_micronutrient_artifact_guard.sql` applies the same live database guard and demotion audit

For PetSmart broad dog/cat food coverage, the runnable extractor uses PetSmart first-party PLP/search payloads and writes retailer-verified evidence candidates:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-scrape-all.mjs \
  --mode extract \
  --source petsmart-retail-catalog \
  --limit 1 \
  --source-timeout-minutes 8
```

The current expanded PetSmart run wrote:

- Latest refresh generated at `2026-07-02T03:03:29.580Z`
- `3,220` unique retailer candidates
- `3,168` candidates with ingredient statements
- `3,220` candidates with front image URLs
- `2,420` complete-food candidates
- `2,311` strict accepted candidates
- `2,302` generated SQL rows
- Source-specific pending delta at `outputs/catalog-pending-import-delta/petsmart-retail-catalog-current/`: `2,302` manifest rows scanned, `0` importable rows, `3` rejected rows
- The rejected rows remain strict guard cases that are not promoted into verified-ready catalog rows
- Live source total remains `2,300` strict PetSmart rows with verified ingredients/images; the refresh did not add a new live import delta

The aggregate importer now detects the PetSmart SQL manifest correctly. Current dry-run:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-official-feed-import-all.mjs \
  --source petsmart-retail-catalog \
  --max-sources 1 \
  --batch-size 500
```

Current result:

- `1` PetSmart candidate detected
- `2,302` expected rows from `outputs/catalog-source-imports/petsmart-retail-catalog/sql/manifest.json`
- Aggregate pending delta after live/guard comparison remains `0`

PetSmart private-label refresh, `2026-07-01`:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-scrape-all.mjs \
  --mode extract \
  --source petsmart-simply-nourish \
  --source petsmart-authority \
  --limit 2 \
  --source-timeout-minutes 12 \
  --continue-on-error
```

Current result:

- `scripts/catalog-petsmart-plp-import-batch.mjs` now supports `--expected-brand` and filters PLP hits before validation/import
- `scripts/catalog-scrape-all.mjs` now maps `petsmart-authority` and `petsmart-simply-nourish` to the PetSmart PLP importer with brand filters
- Authority: `102` PLP hits, `101` rows after brand filtering, `91` rows with ingredients, `101` rows with images, `71` accepted candidates, `30` rejected by strict gates
- Simply Nourish: `115` PLP hits, `115` rows after brand filtering, `115` rows with ingredients, `115` rows with images, `71` accepted candidates, `44` rejected by strict gates
- Aggregate pending delta before live import: `58` rows (`32` Authority, `26` Simply Nourish)
- Live import applied `58` product rows and `58` evidence rows through the Supabase dashboard database query endpoint
- Aggregate pending delta after live import: `0`
- Live source totals after import: Authority `69` rows / `67` strict verified-ready; Simply Nourish `67` rows / `61` strict verified-ready

## Retail Leader Access Probe

Run the transparent access probe before attempting broad retailer extraction:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-retail-source-access-probe.mjs \
  --output-dir outputs/catalog-retail-source-access/current \
  --timeout-ms 20000
```

Current result:

- Chewy broad catalog: HTTP `429`, `requires_authorized_feed`
- Petco broad catalog: HTTP `403` with Cloudflare/human-check signals, `requires_authorized_feed`
- PetSmart broad catalog: HTTP `200` with first-party catalog payload, `runnable`
- Walmart broad catalog: HTTP `200` with Next.js payload signals, `identity_only_requires_authorized_feed`; verified ingredients and reusable front images still require authorized feed/API

Report: `outputs/catalog-retail-source-access/current/report.md`

Current retail restricted-source readiness, `2026-07-02T04:54:28.032Z`:

- `12` restricted retail targets checked: Chewy, Petco, Walmart broad catalogs plus Chewy/Walmart/Petco private-label food lines
- `3` broad retailer catalog targets still require authorized feeds: Chewy, Petco, Walmart
- `11` targets are waiting for authorized feed files
- `1` Petco WholeHearted rendered snapshot batch is available for narrow snapshot import review
- `0` authorized feed files are currently present under `inputs/catalog-authorized-feeds`
- `0` authorized-feed generated SQL rows are ready to import
- Live restricted retail demand is `38` open rows affecting `66` products; current nonzero source priorities are Pure Balance, Ol' Roy, Special Kitty, and American Journey
- Failure-only browser snapshot JSON files are not counted as importable snapshot evidence

## Petco Snapshot Path

For narrow Petco-owned brand evidence where rendered browser snapshots are already available:

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-retailer-snapshot-import-batch.mjs \
  --brand "WholeHearted" \
  --source petco-wholehearted \
  --snapshot-dir inputs/catalog-browser-snapshots/petco-wholehearted \
  --retailer petco \
  --output-dir outputs/catalog-source-imports/petco-wholehearted-snapshot-rerun-20260701 \
  --sql-chunk-size 25 \
  --allow-partial-pages
```

Current result:

- `14` rendered Petco snapshots processed
- `13` rows with ingredient statements
- `14` rows with front image URLs
- Latest direct run output: `outputs/catalog-source-imports/petco-wholehearted-snapshots/`
- `12` strict complete-food SQL rows emitted with `--sql-chunk-size 1`
- Those `12` cache keys are already present live and strict verified-ready
- Live `petco-wholehearted` source total is `26` dog/cat rows, all strict verified-ready, with no missing ingredients or images
- The aggregate pending delta is still `0`, so this rerun did not add a new import delta

## Live Import Requirement

The live import RPCs are intentionally restricted to `service_role`:

- `public.upsert_catalog_product_feed(jsonb)`
- `public.refresh_catalog_acquisition_queue(integer, integer)`
- `public.reconcile_catalog_acquisition_queue_batch(integer)`

To automate live imports from local scripts, set:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
```

Do not grant these import RPCs to `anon` or `authenticated`. They write verified catalog data.

To execute the PetSmart import after setting the service key:

```bash
SUPABASE_SERVICE_ROLE_KEY=... /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/catalog-official-feed-import-all.mjs \
  --source petsmart-retail-catalog \
  --max-sources 1 \
  --batch-size 500 \
  --execute
```

Without `SUPABASE_SERVICE_ROLE_KEY`, use the generated guarded SQL chunks under each source output directory and apply them through Supabase MCP or the Supabase SQL editor. For large MCP-only imports, use `catalog:stage-rpc-manifest` with a short-lived source-scoped staging RPC, process staged rows with a privileged SQL function, then revoke/drop the temporary RPCs and staging table immediately after verification.

## Current Generated SQL Artifacts

The aggregate pending import delta is currently clear:

- `outputs/catalog-pending-import-delta/current/manifest.json`
  - Generated at `2026-07-02T04:43:54.810Z`
  - `390` source manifests scanned
  - `22,029` manifest rows scanned
  - `0` importable pending rows
  - `40` import-rejected rows
  - `0` SQL chunks

Latest Pro Plan official refresh/import, `2026-07-02`:

- Source output: `outputs/catalog-source-imports/nestle-purina-pro-plan/`
- Pending delta output: `outputs/catalog-pending-import-delta/nestle-purina-pro-plan-current/`
- Official Purina source extraction succeeded after the previous child extractor timeout: `130` discovered product URLs, `125` strict SQL manifest rows, `126` accepted validation candidates, `4` rejected candidates
- Pre-import pending delta found and imported `2` manufacturer-backed rows with exact source-backed ingredients and manufacturer images
- Current post-import source-specific pending delta is clear: `125` manifest rows scanned, `0` pending rows, `0` import-rejected rows
- Audit evidence inserted for both imported rows with source URLs and content hashes
- Brand cleanup resolved `4` Pro Plan acquisition gaps after import (`3` strict-search matches and `1` direct verified duplicate)
- Current Pro Plan live verified-ready count: `186`

Latest bounded direct-identity acquisition-queue sweep, `2026-07-02`:

- Touched brands in small audited batches: Blue Buffalo, Purina Pro Plan, Wellness, Nulo, Fancy Feast, Friskies, Royal Canin, Stella & Chewy's, Tiki Cat, Taste of the Wild, Merrick, Orijen, Open Farm, Earthborn Holistic, and Purina ONE
- Newly closed verified duplicate queue rows: `4` (`1` Wellness, `1` Nulo, `1` Friskies, `1` Purina ONE)
- Reopened stale unsafe queue row: `1` Blue Buffalo Amazon legacy row previously marked as a duplicate of a manufacturer row that is now `needs_ingredients`, not `verified_ready`
- Repair migration: `supabase/migrations/272_reopen_blue_buffalo_unverified_duplicate_gap.sql`
- Post-repair direct duplicate closure audits: `0` failure rows across the three touched brand groups; no line, life-stage, food-form, size, package-count, or wrongly promoted legacy failures
- Current live queue totals after the pass: `5,130` open rows, `4,109` distinct open product names, `8,208` affected products, and `2,593` retailer-origin open rows
- This did not import retailer/community ingredients. It only closed direct verified duplicates that matched strict verified-ready rows and reopened one stale closure that no longer had verified ingredient coverage.

Previous bounded acquisition-queue hygiene, `2026-07-02`:

- Touched brand: Purina Pro Plan
- Newly imported official manufacturer rows: `2`
- Newly resolved acquisition gaps: `4`
- Excluded stale legacy duplicate product rows: `1`
- Current live queue totals after the pass: `5,133` open rows, `4,089` distinct open product names, `8,177` affected products, and `2,595` retailer-origin open rows
- This did not import retailer/community ingredients. It only promoted two official source-backed manufacturer rows and resolved duplicate/gap rows that passed strict guards.

Previous bounded acquisition-queue hygiene, `2026-07-02`:

- Touched brands: Farmina, ACANA, Diamond Naturals, Nature's Recipe, Nutrish, Freshpet, Purina Cat Chow, Meow Mix, Fromm
- Newly closed legacy duplicate gap rows in this pass: `30` (`9` Diamond Naturals, `3` Freshpet, `5` Meow Mix, `11` Nature's Recipe, `2` Purina Cat Chow)
- Special food-form duplicate guard added: `supabase/migrations/269_require_special_food_form_duplicate_match.sql` now rejects dry-only duplicate closures against protected formats such as freeze-dried, dehydrated, air-dried, fresh, and raw
- Source-backed special-format identity guard added: `supabase/migrations/270_allow_special_food_form_source_identity_duplicates.sql` lets official URL identity help only after protected food-form and legacy-token guards pass
- Stale-gap closer ran after the guard update and closed `4` product-gap rows that were no longer active complete-food acquisition gaps
- Post-closure audit: `112` active direct duplicate closures across the touched brands, `0` failure rows, `0` life-stage mismatches, `0` line mismatches, `0` food-form mismatches, `0` size mismatches, `0` package-count mismatches, and `0` wrongly promoted legacy rows
- Current live queue totals after the pass: `5,137` open rows, `4,167` actionable open product rows, `8,213` affected products, and `2,599` retailer-origin open rows
- This did not import retailer/community ingredients. It only strengthened duplicate-closure safety and resolved legacy/no-source gap rows when verified source-backed catalog rows already existed.

Previous bounded acquisition-queue hygiene, `2026-07-02`:

- Touched brands: Blue Buffalo, Purina Pro Plan, Wellness, Nulo, Royal Canin, Fancy Feast, Friskies
- Newly closed legacy duplicate gap rows in this pass: `8` (`2` Blue Buffalo, `1` Wellness, `5` Royal Canin)
- Brands checked with no new direct-identity closures in this pass: Purina Pro Plan, Nulo, Fancy Feast, Friskies
- Post-closure audit: `245` direct duplicate closures across the touched brands, `0` failure rows, `0` life-stage mismatches, `0` line mismatches, `0` food-form mismatches, `0` size mismatches, `0` package-count mismatches, and `0` wrongly promoted legacy rows
- Current live queue totals after the pass: `5,167` open rows, `4,197` actionable open product rows, `8,243` affected products, and `2,619` retailer-origin open rows
- This did not import retailer/community ingredients. It only resolved legacy/no-source gap rows when a verified-ready source-backed catalog row already existed and survived the direct identity guards.

Recent official-source windows:

- Tail check: URL offset `120`, limit `40`, output `outputs/catalog-source-imports/nestle-purina-fancy-feast-window-120-40/`
- Fancy Feast: official discovery produced `0` product URLs after filtering beyond offset `120`, so the currently discoverable official Fancy Feast tail is exhausted.
- Window: URL offset `40`, limit `40`, output `outputs/catalog-source-imports/nestle-purina-one-window-40-40/`
- Purina ONE: `31` candidates, `31` accepted, `0` rejected
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Tail check: URL offset `80`, limit `40`, output `outputs/catalog-source-imports/nestle-purina-one-window-80-40/`
- Purina ONE: official discovery produced `0` product URLs after filtering beyond offset `80`, so the currently discoverable official Purina ONE tail is exhausted.
- Window: URL offset `0`, limit `40`, output `outputs/catalog-source-imports/weruva-window-0-40/`
- Weruva: `34` candidates, `23` accepted, `11` rejected (`ingredient_ocr_artifact`, `ingredient_text_too_short`, `missing_ingredient_text`, `multi_formula_or_variety_pack`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`)
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `40`, limit `40`, output `outputs/catalog-source-imports/weruva-window-40-40/`
- Weruva: `40` candidates, `26` accepted, `14` rejected (`ingredient_text_too_short`, `missing_ingredient_text`, `multi_formula_or_variety_pack`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`)
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `80`, limit `40`, output `outputs/catalog-source-imports/weruva-window-80-40/`
- Weruva: `40` candidates, `28` accepted, `12` rejected (`ingredient_text_too_short`, `missing_ingredient_text`, `multi_formula_or_variety_pack`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`)
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `40`, limit `40`, output `outputs/catalog-source-imports/merrick-pet-care-window-40-40/`
- Merrick Pet Care: `40` candidates, `34` accepted, `6` rejected (`ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`, `unknown_pet_type`)
- Aggregate pending delta after live duplicate/demotion guards: `5` Merrick Kitchen Comforts dry dog food rows, imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Imported rows: Kitchen Comforts Real Beef & Brown Rice, Real Chicken & Brown Rice, Real Lamb & Brown Rice, Real Salmon & Brown Rice, and Small Breed Real Chicken & Brown Rice dry dog food
- Window: URL offset `80`, limit `40`, output `outputs/catalog-source-imports/merrick-pet-care-window-80-40/`
- Merrick Pet Care: `40` candidates, `36` accepted, `4` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `too_few_ingredients`)
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `120`, limit `40`, output `outputs/catalog-source-imports/merrick-pet-care-window-120-40/`
- Merrick Pet Care: `30` candidates, `6` accepted, `24` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`)
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Merrick PDF repair, `2026-07-02`, output `outputs/catalog-source-imports/merrick-pet-care-pdf-repair-20260702/`
- Extractor update: same-host official PDF links with anchor text such as `Download the full ingredient list` are now parsed as manufacturer ingredient evidence; complete-food inference now treats explicit product identity words like `treats`, `toppers`, and `variety pack` as hard exclusions, while form/category words such as `puree` or noisy category `supplements` cannot override formal complete-and-balanced / AAFCO evidence
- Repair result: `30` official tail rows, `7` complete-food rows, `23` non-complete rows, `29` rows with ingredients, `30` rows with front images, and `7` strict SQL rows
- Source-specific pending delta before import: `1` pending row, `0` import-rejected rows; after import: `0` pending rows and `0` import-rejected rows at `outputs/catalog-pending-import-delta/merrick-pet-care-pdf-repair-20260702/`
- Imported row: `Merrick Purrfect Bistro Grain Free Wild-Caught Ocean Whitefish and Spinach Natural High Protein Dry Cat Food`, `35` parsed ingredients, manufacturer ingredient PDF `https://www.merrickpetcare.com/sites/default/files/2026-02/2762%20-%20A276225%20Merrick%20Purrfect%20Bistro%20GF%20OWF%20Spinach%20Dry%20Cat%20Food%20P4B.pdf`, manufacturer front image, quality state `verified_ready`, and `0` ingredient artifact flags
- Audit/evidence run id: `f8a6a0f1-290c-4f76-b914-36500b68d015`; post-import queue refresh/reconcile left open acquisition queue at `5,133` rows
- Full Earthborn Holistic official sitemap run, `2026-07-02`, output `outputs/catalog-source-imports/earthborn-holistic-midwestern-20260702/`
- Earthborn Holistic: `25` official product pages discovered, `22` complete-food rows, `3` non-complete rows, `25` rows with ingredients, `25` rows with front images, and `21` strict SQL rows after rejecting `1` ingredient OCR/artifact candidate
- Earthborn source-specific pending delta at `outputs/catalog-pending-import-delta/earthborn-holistic-midwestern-20260702/`: `21` manifest rows scanned, `0` pending import rows, `0` import-rejected rows, so no live import was needed from this pass
- Window: URL offset `40`, limit `40`, output `outputs/catalog-source-imports/orijen-champion-petfoods-window-40-40/`
- Orijen / Champion Petfoods: `36` candidates, `28` accepted, `8` rejected (`incomplete_ingredient_statement`, `not_complete_food`, `unbalanced_ingredient_parentheses`)
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Full Orijen rerun, `2026-07-02`, output `outputs/catalog-source-imports/orijen-champion-petfoods/`
- Orijen / Champion Petfoods: `76` rows discovered; `64` complete-food rows; `12` non-complete rows after classifying official `ds-ori-fdt` and Epic Bites freeze-dried products out of complete-food scope
- Orijen normalized SQL rows: `62`; skipped rows: `12` not complete food, `1` incomplete ingredient statement, `1` unbalanced ingredient parentheses
- Orijen source-specific pending delta at `outputs/catalog-pending-import-delta/orijen-champion-petfoods-current/`: `62` manifest rows scanned, `0` pending import rows, `0` import-rejected rows
- Remaining Orijen evidence blockers: `Duck Recipe` has too-short official ingredients for complete-food promotion, and `Puppy Poultry & Fish Pâté Recipe` official HTML truncates the vitamin group at `pyridox`; the official package image OCR is not clean enough for automatic promotion, so this row requires authorized feed or manual verified label evidence
- Full ACANA rerun, `2026-07-02`, output `outputs/catalog-source-imports/acana-champion-petfoods/`
- ACANA / Champion Petfoods: `72` rows discovered; `63` accepted complete-food candidates; `9` rejected as `not_complete_food`
- ACANA source-specific pending delta at `outputs/catalog-pending-import-delta/acana-champion-petfoods-current/`: `63` manifest rows scanned, `0` pending import rows, `0` import-rejected rows
- Tail check: URL offset `80`, limit `40`, output `outputs/catalog-source-imports/orijen-champion-petfoods-window-80-40/`
- Orijen / Champion Petfoods: official discovery produced `0` product URLs after filtering beyond offset `80`, so the currently discoverable official Orijen tail is exhausted.
- Window: URL offset `80`, limit `40`, output `outputs/catalog-source-imports/stella-and-chewys-window-80-40/`
- Stella & Chewy's: `35` candidates, `9` accepted, `26` rejected (`non_complete_identity`, `not_complete_food`)
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `120`, limit `40`, output `outputs/catalog-source-imports/stella-and-chewys-window-120-40/`
- Stella & Chewy's: `40` candidates, `1` accepted, `39` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`, `unknown_pet_type`)
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `160`, limit `40`, output `outputs/catalog-source-imports/stella-and-chewys-window-160-40/`
- Stella & Chewy's: `40` candidates, `3` accepted, `37` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`, `unknown_pet_type`)
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `200`, limit `40`, output `outputs/catalog-source-imports/stella-and-chewys-window-200-40/`
- Stella & Chewy's: `4` candidates, `0` accepted, `4` rejected (`ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`, `unknown_pet_type`)
- Tail check: URL offset `240`, limit `40`, output `outputs/catalog-source-imports/stella-and-chewys-window-240-40/`
- Stella & Chewy's: official discovery produced `0` product URLs after filtering beyond offset `240`; the batch script records zero URLs as an error, but this is the current official Shopify feed exhaustion signal.
- Window: URL offset `260`, limit `20`, output `outputs/catalog-market-leaders/priority-window-260-20/`
- Blue Buffalo / General Mills: `20` candidates, `20` accepted, `0` rejected
- Hill's Pet Nutrition: `20` candidates, `16` accepted, `4` rejected (`non_complete_identity`, `not_complete_food`)
- Nulo: `20` candidates, `18` accepted, `2` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `too_few_ingredients`, `variant_source_url_mismatch`)
- Wellness Pet Company: no candidate summary emitted for this offset window
- Aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `280`, limit `20`, output `outputs/catalog-market-leaders/priority-window-280-20/`
- Blue Buffalo / General Mills: `20` candidates, `20` accepted, `0` rejected
- Hill's Pet Nutrition: `20` candidates, `18` accepted, `2` rejected (`ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`)
- Nulo: `20` candidates, `20` accepted, `0` rejected
- Wellness Pet Company: no candidate summary emitted for this offset window
- Aggregate pending delta after live duplicate/demotion guards: `1` row, imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Imported row: Hill's Science Diet `Adult 7+ Senior Vitality Chicken Recipe Dog Food`, GTIN `052742012087`, source URL `https://www.hillspet.com/dog-food/science-diet-adult-7-senior-vitality-chicken-rice-dry`
- Window: URL offset `300`, limit `20`, output `outputs/catalog-market-leaders/priority-window-300-20/`
- Blue Buffalo / General Mills: `7` candidates, `7` accepted, `0` rejected
- Hill's Pet Nutrition: `20` candidates, `18` accepted, `2` rejected (`ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`)
- Nulo: `20` candidates, `10` accepted, `10` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`, `unknown_pet_type`)
- Wellness Pet Company: no candidate summary emitted for this offset window
- Aggregate pending delta after live duplicate/demotion guards: `9` Hill's rows, imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Imported rows: Hill's Science Diet GTINs `052742007236`, `052742007250`, `052742088051`, `052742088075`, `052742088099`, `052742143002`, `052742143101`, `052742203706`, `052742703701`
- Window: URL offset `320`, limit `20`, output `outputs/catalog-market-leaders/priority-window-320-20/`
- Blue Buffalo / General Mills: no candidate summary emitted for this offset window
- Hill's Pet Nutrition: `20` candidates, `20` accepted, `0` rejected
- Nulo: `20` candidates, `0` accepted, `20` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`)
- Wellness Pet Company: no candidate summary emitted for this offset window
- Aggregate pending delta after live duplicate/demotion guards: `2` Hill's rows, imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Imported rows: Hill's Science Diet GTINs `052742041339`, `052742041421`
- Window: URL offset `340`, limit `20`, output `outputs/catalog-market-leaders/priority-window-340-20/`
- Blue Buffalo / General Mills: no candidate summary emitted for this offset window
- Hill's Pet Nutrition: `20` candidates, `18` accepted, `2` rejected (`not_complete_food`)
- Nulo: `7` candidates, `0` accepted, `7` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`, `unknown_pet_type`, `variant_source_url_mismatch`)
- Wellness Pet Company: no candidate summary emitted for this offset window
- Aggregate pending delta after live duplicate/demotion guards: `4` Hill's rows, imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Imported rows: Hill's Science Diet GTINs `052742002019`, `052742060552`, `052742068374`, `052742069814`
- Window: URL offset `360`, limit `20`, output `outputs/catalog-market-leaders/priority-window-hills-360-20/`
- Hill's Pet Nutrition: `20` candidates, `14` accepted, `6` rejected (`ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`)
- Aggregate pending delta after live duplicate/demotion guards: `2` Hill's rows, imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Imported rows: Hill's Science Diet GTINs `052742041377`, `052742705606`
- Window: URL offset `380`, limit `20`, output `outputs/catalog-market-leaders/priority-window-hills-380-20/`
- Hill's Pet Nutrition: `20` candidates, `16` accepted, `4` rejected (`not_complete_food`)
- Aggregate pending delta after live duplicate/demotion guards: `6` Hill's rows, imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Imported rows: Hill's Science Diet GTINs `052742007212`, `052742007274`, `052742060217`, `052742060705`, `052742703602`, `052742705705`
- Source refresh: `outputs/catalog-market-leaders/priority-taste-of-the-wild-current/`
- Taste of the Wild / Diamond Pet Foods: `28` candidates, `28` accepted, `0` rejected; aggregate pending delta after live duplicate/demotion guards: `0` rows
- Source config fix: `nestle-purina-pro-plan` now has `extractTimeoutMs: 600000` because the full current run timed out at the default `180000ms` page extraction limit.
- Window: URL offset `0`, limit `50`, output `outputs/catalog-market-leaders/priority-purina-pro-plan-window-0-50/`
- Purina Pro Plan: `50` candidates, `50` accepted, `0` rejected; aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `125`, limit `75`, output `outputs/catalog-market-leaders/priority-purina-pro-plan-window-125-75/`
- Purina Pro Plan: `5` candidates, `5` accepted, `0` rejected; aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `5`, limit `40`, output `outputs/catalog-source-imports/nestle-purina-beneful-window-5-40/`
- Beneful: `40` candidates, `25` accepted, `15` rejected (`incomplete_ingredient_statement`, `not_complete_food`); aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `45`, limit `40`, output `outputs/catalog-source-imports/nestle-purina-beneful-window-45-40/`
- Beneful: `3` candidates, `0` accepted, `3` rejected (`not_complete_food`)
- Tail check: `outputs/catalog-source-imports/nestle-purina-beneful-window-48-40/`
- Beneful: official source produced `0` product URLs after filtering beyond offset `48`, so the currently discovered official Beneful tail is exhausted.
- Window: URL offset `5`, limit `40`, output `outputs/catalog-source-imports/nestle-purina-dog-chow-window-5-40/`
- Purina Dog Chow: `4` candidates, `4` accepted, `0` rejected; aggregate pending delta after live duplicate/demotion guards: `1` row, imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Imported row: Purina Dog Chow `Little Bites With Real Chicken And Beef Small Breed Dry Dog Food`, GTIN `017800110303`
- Tail check: `outputs/catalog-source-imports/nestle-purina-dog-chow-window-9-40/`
- Purina Dog Chow: official source produced `0` product URLs after filtering beyond offset `9`, so the currently discovered official Dog Chow tail is exhausted.
- Tail check: `outputs/catalog-source-imports/nestle-purina-moist-meaty-window-5-40/`
- Moist & Meaty: official source produced `0` product URLs after filtering beyond offset `5`, so the currently discovered official Moist & Meaty tail is exhausted.
- Tail check: `outputs/catalog-source-imports/nestle-purina-puppy-chow-window-3-40/`
- Purina Puppy Chow: official source produced `0` product URLs after filtering beyond offset `3`, so the currently discovered official Puppy Chow tail is exhausted.
- Tail check: `outputs/catalog-source-imports/nestle-purina-alpo-window-2-40/`
- ALPO: official source produced `0` product URLs after filtering beyond offset `2`, so the currently discovered official ALPO tail is exhausted.
- Window: URL offset `0`, limit `40`, output `outputs/catalog-source-imports/nutro-window-0-40/`
- Nutro: `40` candidates, `35` accepted, `5` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `too_few_ingredients`, `variant_nutrient_mismatch`); aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `40`, limit `40`, output `outputs/catalog-source-imports/nutro-window-40-40/`
- Nutro: `40` candidates, `33` accepted, `7` rejected (`non_complete_identity`, `not_complete_food`); aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `80`, limit `40`, output `outputs/catalog-source-imports/nutro-window-80-40/`
- Nutro: `33` candidates, `23` accepted, `10` rejected (`incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`); aggregate pending delta after live duplicate/demotion guards: `0` rows
- Tail check: `outputs/catalog-source-imports/nutro-window-113-40/`
- Nutro: official source produced `0` product URLs after filtering beyond offset `113`, so the currently discovered official Nutro tail is exhausted.
- Window: URL offset `0`, limit `40`, output `outputs/catalog-source-imports/iams-window-0-40/`
- IAMS: `40` candidates, `39` accepted, `1` rejected (`non_complete_identity`); aggregate pending delta after live duplicate/demotion guards: `0` rows
- Window: URL offset `40`, limit `40`, output `outputs/catalog-source-imports/iams-window-40-40/`
- IAMS: `26` candidates, `22` accepted, `4` rejected (`non_complete_identity`); aggregate pending delta after live duplicate/demotion guards: `0` rows
- Tail check: `outputs/catalog-source-imports/iams-window-66-40/`
- IAMS: official source produced `0` product URLs after filtering beyond offset `66`, so the currently discovered official IAMS tail is exhausted.
- Window: URL offset `65`, limit `100`, output `outputs/catalog-market-leaders/priority-friskies-window-65-100/`
- Friskies: official source produced `0` product URLs after filtering beyond offset `65`, so the currently discovered official Friskies tail is exhausted.
- Tail check: `outputs/catalog-source-imports/blue-buffalo-general-mills-window-320-40/`
- Blue Buffalo / General Mills: official sitemap produced `0` product URLs after filtering beyond offset `320`, so the currently discovered Blue Buffalo official tail is exhausted.
- Tail check: `outputs/catalog-source-imports/nulo-window-360-40/`
- Nulo: official sitemap produced `0` product URLs after filtering beyond offset `360`, so the currently discovered Nulo official tail is exhausted.
- Tail check: `outputs/catalog-source-imports/wellness-pet-company-window-260-40/`
- Wellness Pet Company: official sitemap produced `0` product URLs after filtering beyond offset `260`, so the currently discovered Wellness official tail is exhausted.
- Window: URL offset `400`, limit `40`, output `outputs/catalog-source-imports/hill-s-pet-nutrition-window-400-40/`
- Hill's Pet Nutrition: `15` candidates, `7` accepted, `8` rejected by strict validation (`brand_source_mismatch`, `incomplete_ingredient_statement`, `ingredient_text_too_short`, `missing_ingredient_text`, `non_complete_identity`, `not_complete_food`, `too_few_ingredients`)
- Aggregate pending delta after live duplicate/demotion guards: `3` Hill's rows, imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Imported rows: Hill's Science Diet GTINs `052742060347`, `052742068695`, `052742069487`
- Tier-2 official-source refresh: Instinct `126` accepted / `53` rejected; Bil-Jac `24` accepted / `7` rejected; Bully Max `21` accepted / `0` rejected; Farmina `323` accepted / `42` rejected; I AND LOVE AND YOU `57` accepted / `0` rejected; ZIWI Peak `27` accepted / `22` rejected
- Aggregate pending delta after the Hill's import and tier-2 refresh: `0` importable rows; `4` rejected rows remain for repair or explicit exclusion
- Crave parser repair, `2026-07-02`: official OCR now accepts the source-backed no-colon micronutrient pattern `Pyridoxine Hydrochloride (Vitamin B6)` for `Wet Dog Beef Recipe`, GTIN `023100123967`
- Crave rerun output: `outputs/catalog-source-imports/crave-mars-petcare/`; `10` candidates, `10` accepted, `0` rejected
- Crave pending delta output: `outputs/catalog-pending-import-delta/crave-mars-petcare-20260702/`; `1` pending row imported through `public.upsert_catalog_product_feed(jsonb)` and audited in `catalog_import_runs` / `catalog_product_evidence`
- Aggregate pending delta after Crave repair: `0` importable rows; `4` rejected rows remain for repair or explicit exclusion
- PetSmart private-label validation repair, `2026-07-02`: the Simply Nourish/Authority rows with malformed ingredient parentheses remain `needs_ingredients`; `verified_ready` artifact count is `0`, and the scraper fixture suite now covers equal-count bad-order parentheses

The source SQL folders below are retained as audit/regeneration artifacts. Do not apply them blindly; run `catalog:pending-import-delta` first and only import rows that remain pending after live and guard checks.

- `outputs/catalog-source-imports/open-farm-window-0-20/sql/`
  - 20 accepted Open Farm rows
- `outputs/catalog-source-imports/nestle-purina-beneful-window-0-5/sql/`
  - 2 accepted Beneful rows
- `outputs/catalog-source-imports/nestle-purina-dog-chow-window-0-5/sql/`
  - 5 accepted Dog Chow rows; the 3 rows that were still missing live have now been imported and audited
- `outputs/catalog-source-imports/nestle-purina-dog-chow-window-5-40/sql/`
  - 4 accepted Dog Chow rows; 1 row was still missing live and has now been imported and audited
- `outputs/catalog-source-imports/nestle-purina-fancy-feast-window-0-5/sql/`
  - 5 accepted Fancy Feast rows
- `outputs/catalog-source-imports/nestle-purina-friskies-window-0-5/sql/`
  - 5 accepted Friskies rows
- `outputs/catalog-source-imports/nestle-purina-moist-meaty-window-0-5/sql/`
  - 5 accepted Moist & Meaty rows
- `outputs/catalog-source-imports/nestle-purina-one-window-0-5/sql/`
  - 5 accepted Purina ONE rows
- `outputs/catalog-source-imports/nestle-purina-pro-plan-window-0-5/sql/`
  - 5 accepted Pro Plan rows
- `outputs/catalog-source-imports/nestle-purina-puppy-chow-window-0-5/sql/`
  - 3 accepted Puppy Chow rows
- `outputs/catalog-source-imports/nulo-window-0-5/sql/`
  - 5 accepted Nulo rows
- `outputs/catalog-source-imports/nutrish-window-0-5/sql/`
  - 1 accepted Nutrish row

Each SQL directory includes:

- `0001-...sql` feed upsert chunk
- `9998-import-audit-and-evidence.sql` provenance/evidence insert
- `9999-refresh-catalog-acquisition-queue.sql` queue refresh/reconcile

## Restricted Retailer Catalogs

These targets cannot honestly become verified-ready through blind public scraping alone:

- Chewy broad retail catalog and Chewy-owned brands
- Petco broad retail catalog
- Walmart broad retail catalog and Walmart-owned brands
- Amazon/BJ's/Costco/Target/Kroger/Tractor Supply private-label targets where authorized reuse is not available

PetSmart is the exception currently implemented as a safe retailer-verified extractor because its first-party PLP/search payloads expose product evidence without anti-bot bypass. Authorized feed/API rights are still preferred before treating those rows as the commercial system of record.

Required input for those targets:

- Authorized retailer export/API/feed or licensed content feed
- Exact ingredient statements
- Front package image URLs or image files with reuse rights
- GTIN/SKU/product URL
- Current US availability
- Source timestamp

Current authoritative-feed direction:

- Use licensed/authorized product content first: Syndigo/1WorldSync/GDSN-style feeds for GTINs, exact ingredients, images, and source timestamps
- Use official manufacturer catalogs for current top-brand gaps
- Use retailer feeds/APIs only where the license permits reuse in Woof
- Do not promote public Chewy/Petco/Walmart page content as the reusable verification system of record without authorized rights

Generated request/readiness files live under:

```text
outputs/catalog-market-leaders/current/authorized-feed-requests/
```

## Verification Commands

```bash
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-catalog-quality.mjs
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-catalog-scraper.mjs
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-product-resolver-contract.mjs
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-js-syntax.mjs
```

Latest verification, `2026-07-02`:

- `check-catalog-scraper`: passed (`28` fixture cases)
- `check-catalog-quality`: passed
- `check-product-resolver-contract`: passed
- `check-js-syntax`: passed (`145` files checked)
- Retail restricted-pack generation: passed at `2026-07-02T04:53:04.824Z`; manifest has `12` targets, `11` `requires_authorized_feed`, and `1` `requires_browser_snapshot`
- Retail restricted-source readiness with live Supabase gap export: passed at `2026-07-02T04:54:28.032Z`; `38` open rows, `66` affected products, `0` authorized feed files, `1` snapshot file, `0` generated SQL rows
- Authorized feed drop dry-run: passed at `2026-07-02T04:54:27.990Z`; `0` feed files processed because only ignored `feed.csv.template` files are present

Latest live Supabase counts after Merrick PDF repair, Earthborn official sitemap run, direct-identity queue sweep, and aggregate delta regeneration:

- Total `product_data` rows: `17,694`
- Dog/cat rows: `13,123`
- Verified-ready rows: `8,448` (`5,072` dog, `3,376` cat)
- Verified-ready ingredient artifact rows: `0`
- Verified-ready HTML product-name rows: `0`
- Open acquisition queue rows: `5,130`
- Open distinct product names: `4,109`
- Open distinct brands: `1,018`
- Open species-explicit rows: `3,612`
- Open species-ambiguous rows: `1,518`
- Open affected products: `8,208`
- Open retailer-origin rows: `2,593`
- Aggregate pending import delta regenerated at `2026-07-02T04:43:54.810Z`: `0` pending rows, `40` import-rejected rows, `0` SQL chunks across `390` source manifests and `22,029` scanned manifest rows
