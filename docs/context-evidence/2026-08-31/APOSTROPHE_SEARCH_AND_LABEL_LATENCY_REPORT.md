# Apostrophe catalog search and label-scan latency report

Date: 2026-08-31  
Branch: `codex/production-release-20260716`  
Production database status: **not changed; owner approval is still required**

## Outcome

- Prepared a bounded-prefix SQL migration that removes one-character prefix lexemes, makes degenerate input return `NULL`, and preserves both apostrophe and plain brand forms.
- Changed the two catalog fallback lookups from sequential to bounded parallel execution while preserving the existing product-verification, pet-type, visible-variant, rank, and abort gates.
- Started catalog hydration as a bounded prefetch during final resolution and reused the same promise before opening Results.
- Added one-per-capture telemetry for camera, crop, optimize/OCR wall time, recognition paths, reconciliation, identity RPC, gates, fallback lookups, hydration, and first result.
- Passed the required fail-fast suite in the requested order.

## Installed SQL audit

The live RPC chain is:

`search_verified_products` → `search_verified_products_unfiltered_gtin_v1` → `search_verified_products_unprotected_age_v1` → `search_verified_products_species_filter_v2` → `search_verified_products_species_embedded_v1` → `search_verified_products_base_v2`

Currently installed prefix-query sites:

| Function | Status in migration |
| --- | --- |
| `public.search_products(text,integer)` | Unsafe builder replaced |
| `public.search_verified_products_base_v2(text,integer)` | Unsafe live root replaced; existing `pate` normalization retained |
| `public.search_verified_products_ranked_v1(text,integer)` | Unsafe dormant definition replaced defensively |
| `public.search_verified_products_for_label_ocr_text(text,integer)` | Audited and left unchanged: already filters tokens to length ≥3 and returns on empty input |
| Other label-search RPCs | Audited and left unchanged: use `plainto_tsquery` with bounded-token filters |

Historical migrations contain overwritten copies of the old builder. They are not active definitions and are intentionally not rewritten.

The new `public.catalog_bounded_prefix_tsquery(text)`:

- normalizes punctuation and apostrophes;
- drops tokens shorter than two characters;
- returns `NULL` if nothing usable remains;
- adds a bounded singular alternative to a trailing `s` token, so `Nature's` and `natures` match the same brand without emitting `s:*`;
- is reused by all three unsafe installed functions.

### Production baseline before migration

Read-only `EXPLAIN (ANALYZE, BUFFERS)` measurements:

| Query | Elapsed | Result |
| --- | ---: | --- |
| `Nature's Logic` | 9519.3 ms | 10 rows; 76,543 buffer hits + 52,069 reads |
| `natures logic` | 41.5 ms | 0 rows |
| `Hill's Science Diet` | 2961.2 ms | 10 rows; 93,973 hits + 61,927 reads |
| `hills science diet` | 60.9 ms | 1 row |
| `Newman's Own` | 48.5 ms | 0 rows |
| `newmans own` | 30.5 ms | 0 rows |

The migration-local assertions verify query shape and apostrophe/plain equivalence. The separate post-apply audit runs all six public RPC probes under an 18 s total watchdog, requires the expected brand when eligible catalog evidence exists, rejects a one-character prefix, and independently requires each probe to complete within 2.5 s. The timeout is intentionally a total watchdog because PostgreSQL applies `statement_timeout` to the entire `DO` statement, not each loop iteration.

No permanent `statement_timeout` change is included. After the fixed production p95 is measured below 2.5 s, a follow-up function-level 4 s timeout is reasonable; applying it before verifying the query plan would hide the underlying regression.

## Label-scan latency

### Before: production telemetry, app 1.2.3, prior 48 hours

| Segment | Samples | p50 | Average |
| --- | ---: | ---: | ---: |
| Capture → handoff | 15 | 1181 ms | 1540 ms |
| On-device OCR | 15 | 213 ms | 260 ms |
| Clean exact resolver | 1 | 2833 ms | 2833 ms |
| Fallback recovery resolver | 2 | 9466 ms | 9466 ms |
| Other resolver paths | 9 | 5085 ms | 5325 ms |
| Catalog hydration | 5 | 485 ms | 762 ms |
| Capture → result | 12 | 7066 ms | 7321 ms |

The old production events did not expose identity/gate/fallback stages, so the exact fallback frequency is unknowable from historical telemetry. That observability gap is now fixed.

### After: authenticated device/simulator audit

Five label fixtures exercised the real authenticated catalog path:

| Fixture | Path | OCR | Search | Total | Parallel fallback evidence |
| --- | --- | ---: | ---: | ---: | --- |
| Beneful Originals | Fast identity | 431 ms | 1114 ms | 1561 ms | Not triggered |
| Moist & Meaty | Fast identity | 375 ms | 198 ms | 579 ms | Not triggered |
| Open Farm RawMix | Rank-floor fallback | 323 ms | 623 ms | 960 ms | 304 ms wall vs 531 ms serial-equivalent; 228 ms saved |
| Open Farm GoodGut | Rank-floor fallback | 366 ms | 519 ms | 899 ms | 245 ms wall vs 354 ms serial-equivalent; 109 ms saved |
| Hill's kitten | Fast identity | 394 ms | 294 ms | 703 ms | Not triggered |

The bounded fallback was triggered in 2/5 fixtures because the fast RPC returned 15–17 raw candidates but the existing visible-candidate/rank floor rejected every one. This quantifies the rank-floor side effect without weakening it. Both fallback fixtures correctly abstained instead of opening a wrong product; 3/5 fixtures matched and auto-opened the expected product.

A clean Hill's simulator run recorded:

| Stage | After |
| --- | ---: |
| Recognition wall | 1807 ms |
| Identity RPC | 1704 ms |
| Candidate gate | 11 ms |
| Reconciliation | 10 ms |
| Hydration total | 423 ms |
| Hydration blocking wait | 407 ms |
| Hydration overlap | 16 ms |
| Capture fixture → first result | 2513 ms |

The fixture enters at the label resolver, so its 25 ms capture-to-resolver value is not comparable to a real camera capture. The new stage event will provide an apples-to-apples production baseline after build 54 ships.

### Dominant suspect and accepted residuals

The dominant clean-path suspect is remote recognition/identity lookup, not local gating: identity took 1704 ms while the final gate and reconciliation took 21 ms combined. On fallback paths, serial network lookup was the largest avoidable cost and is now parallelized. Hydration remains the main blocking tail after selection; prefetch is correct and bounded, but the measured clean run only found 16 ms of overlap and still waited 407 ms.

Accepted correctness costs:

- strict product, pet-type, visible-variant, and confidence gates remain unchanged;
- rank-floor fallbacks may still end in no candidate;
- abort signals are shared by both bounded fallback requests and by hydration prefetch;
- hydration still completes before Results receives an incomplete catalog product.

## Build 54 impact

Issue 1 is server-side. The pending migration will fix apostrophe/plain-form search for the already-installed TestFlight build 54 as soon as the owner approves it; no new binary is required.

Issue 2 is client-side. The currently installed build 54 remains on the sequential-fallback/serialized-hydration behavior. The following changes require a replacement TestFlight binary built from this commit (normally build 55, or a rebuilt 54 only if Apple has not locked that build number):

- stage-level production telemetry;
- at most two parallel fallback lookups instead of two sequential lookups;
- bounded, deduplicated hydration prefetch and reuse;
- resolver regression coverage.

Not available before the database approval step:

- post-migration Nature's Logic and Hill's Science Diet screenshots;
- post-apply correctness and timing assertions.

## Evidence

- `label-scan-after-stage-timings.jpg`: clean simulator stage metrics after the client change.
- `hills-science-diet-before-migration-timeout.jpg`: honest pre-migration timeout evidence.
- `natures-logic-pre-migration-warm-result.jpg`: honest pre-migration warmed-result evidence; it is not an after screenshot.
- `scripts/catalog-possessive-search-audit.sql`: post-apply six-query correctness/timing audit.
- `supabase/migrations/20260831234813_fix_catalog_possessive_prefix_search.sql`: pending production migration.

An after screenshot for both requested brands cannot be captured before the migration is approved. Labeling either current-production screenshot as “after” would be false evidence.

## Verification

Passed, fail-fast, in this exact order:

1. `npm run check:syntax`
2. `npm run check:resolver-contract`
3. `npm run check:catalog`
4. `npm run check:sql`
5. `npm run check:deployment`
6. `npm run check:pet-safety`
7. `npm run check:claims`
8. `npm run verify`

## Approval boundary

Do not apply the migration until the database owner explicitly approves it. The safest connected action is to apply the exact migration as one tracked Supabase migration, then immediately run the post-apply audit. A dry-run `supabase db push` was intentionally rejected because the remote migration history contains versions absent from this checkout; no migration-repair command should be used for this release.

Exact review/print command:

```sh
sed -n '1,240p' '/Users/admin/Documents/woof/tmp/codex-food-form-boundary/supabase/migrations/20260831234813_fix_catalog_possessive_prefix_search.sql'
```

Exact connected apply action after approval:

```text
supabase_apply_migration(
  project_id = "rhlgvrywjralxrjcdtrw",
  name = "fix_catalog_possessive_prefix_search",
  query = <exact contents of 20260831234813_fix_catalog_possessive_prefix_search.sql>
)
```

Exact connected post-apply verification action:

```text
supabase_execute_sql(
  project_id = "rhlgvrywjralxrjcdtrw",
  query = <exact contents of scripts/catalog-possessive-search-audit.sql>
)
```

These connected actions avoid the known local/remote CLI history drift and keep the DDL recorded as a Supabase migration.

## 2026-09-01 live recheck

Production now contains `20260901042021_accelerate_typed_search_retailer_filter`, a separate index migration that bounds the promoted-retailer exclusion lookup. A fresh read-only `EXPLAIN (ANALYZE, BUFFERS)` measured Eric's exact `Nature's Logic` query at **649.9 ms**, returning ten Nature's Logic rows. This fixes Eric's observed timeout through a downstream index improvement.

It does not repair the root prefix-query shape. The bounded-prefix helper is still absent and none of the three unsafe search functions uses it. Current correctness results are:

| Query | Live result |
| --- | --- |
| `Nature's Logic` | 10 Nature's Logic rows |
| `natures logic` | 0 rows |
| `Hill's Science Diet` | 10 rows |
| `hills science diet` | 1 row |
| `Newman's Own` | 0 rows |
| `newmans own` | 0 rows |

Therefore the index migration is preserved in this branch, but it is not a substitute for the pending bounded-prefix migration or its six-query post-apply audit.

## 2026-09-01 systemic hardening

The production index fixed Eric's exact observed timeout, but the root query-shape defect still exists until the pending migration is approved. The migration and its permanent regression gate now protect the whole class rather than only the three reported brands:

- input is truncated to 512 characters before normalization;
- at most 12 tokens are accepted, and each token must be 2–64 alphanumeric characters;
- a singular alternative is generated only for bounded alphabetic words ending in `s`;
- curly apostrophes, straight apostrophes, hyphens, and ampersands share the same normalized path;
- malformed punctuation-only, one-character, and oversized-token inputs resolve to `NULL`;
- the install-time assertion scans every regular function in `public`, not a fixed function-name allowlist, for the unsafe whitespace-to-`:* &` builder;
- the repository check rejects any later timestamped migration that reintroduces that builder.

The post-apply audit also distinguishes search correctness from catalog eligibility. It requires a brand result when an eligible, current, verified complete-food row exists. When no such row exists—as is currently true for Newman's Own—it records a `verified catalog gap` instead of weakening ingredient, image, source, or complete-food verification gates to manufacture a result.

The clean label identity RPC is not server-CPU bound: a fresh read-only warm `EXPLAIN (ANALYZE, BUFFERS)` for four representative Hill's queries completed in **246.6 ms** and returned 19 rows. The simulator's 1704 ms RPC stage is therefore predominantly cold/network time. No risky SQL rewrite was made under a false bottleneck assumption. Instead, successful full-product hydration now uses a ten-minute, 24-entry LRU cache, while preserving cancellation and never caching failures. Its behavioral contract proves repeated keys use one request, aborted work performs no request/cache mutation, and the least-recently-used entry is evicted at the bound.

The full release gate passed again after these changes, in the documented fail-fast order: 173 syntax-scanned files, the behavioral resolver contract, catalog quality, 814 SQL migrations, 808 deployable audit migrations and five functions, eight pet-safety scenarios, 61 claim-safety files, and final verification with 814 migrations.
