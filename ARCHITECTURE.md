# Woof — Architecture & Audit

Last updated: 2026-04-03

## App Overview

React Native + Expo pet food scanning app. Users photograph pet food packaging or scan barcodes to get AI-powered ingredient analysis, safety scores, and recommendations. Also supports human food safety checks for dogs/cats.

## Service Map

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT (Expo)                       │
│                                                          │
│  ScannerScreen ──→ ResultsScreen                         │
│       │                  │                               │
│       ▼                  ▼                               │
│  analysisService.js (singleton orchestrator)             │
│       │         │         │                              │
│       ▼         ▼         ▼                              │
│  claude.js   opff.js   cache.js   history.js   auth.js  │
└───────┬─────────┬─────────┬──────────┬──────────┬───────┘
        │         │         │          │          │
        ▼         ▼         ▼          ▼          ▼
   ┌─────────┐  ┌────┐  ┌────────┐  ┌────────┐ ┌────────┐
   │ Edge Fn │  │OPFF│  │Supabase│  │Supabase│ │Supabase│
   │ analyze │  │API │  │analysis│  │  scan  │ │  auth  │
   │         │  └────┘  │ _cache │  │_history│ │profiles│
   │ product │          └────────┘  └────────┘ └────────┘
   │ -lookup │
   └─────────┘
```

## Analysis Flows

### 1. Barcode Scan
```
Barcode detected → OPFF lookup by barcode → Claude analyzeWithData (verified) → cache + history
```
- Cache key: barcode string (exact, no normalization)
- Data source: "verified" (real ingredients from OPFF)
- Reliability: HIGH (barcode = exact product match)

### 2. Photo Scan (two-pass flow)
```
PASS 1: Photo → identifyProduct (fast, non-streaming, ~2s)
        → Reads ONLY the text on the packaging: brand, product name, flavor
        → Returns: productName, brand, petType, searchTerms
        → If can't read: error "Make sure front of package is visible"

PASS 1.5: productName → lookupProduct (ScrapingBee, ~3-8s)
          → Searches: DFA, CFA, OPFF, Google scrape
          → Returns real ingredient list from verified source

PASS 2A (verified path): If lookup found 5+ ingredients:
          → analyzeWithData (VERIFIED_DATA_PROMPT) using REAL ingredients
          → Accurate scores + real ingredient ratings
          → ingredientSource: "verified"

PASS 2B (fallback): If lookup found nothing:
          → analyzeIngredients (PHOTO_SYSTEM_PROMPT) using the photo
          → BUT productName is overridden with the name from Pass 1 (correct name)
          → ingredientSource: "knowledge" (subtle notice shown)
```
- Pass 1 is a dedicated OCR-style text reader, NOT a full analysis
- This prevents Claude from hallucinating a wrong product name during analysis
- The scraper uses the correct name from Pass 1, so ingredients are accurate
- ~85-90% of products get verified ingredients via scraping

### 3. Human Food Check
```
Photo captured → Claude analyzeHumanFood → local cache + history
```
- Cache key: `hf:{foodName}:{petType}`
- Data source: "ai"
- Reliability: HIGH (food identification is simpler than full product analysis)

## Known Vulnerabilities (Priority Order)

### CRITICAL
1. ~~**Cache key normalization strips flavor**~~ FIXED 2026-04-02: Photo scans never use cache to substitute results. Each photo scan runs a fresh Claude analysis. Cache is only used for: (a) barcode scans (exact match), (b) history playback, (c) writing results after completion.
2. **No server-side error tracking** — crashes are silent in production

### HIGH
3. ~~**Scan count sync**~~ FIXED 2026-04-03: Server-side atomic increment via `increment_scan_count` RPC. Server is source of truth, synced to local on profile fetch.
4. ~~**Token refresh race**~~ FIXED 2026-04-03: Deduplicated with `_refreshPromise` — concurrent calls reuse the same in-flight refresh.

### MEDIUM
5. ~~**Image compression**~~ FIXED 2026-04-02: Increased from 1024px/0.7 to 1536px/0.8 for better ingredient label readability
6. **ScrapingBee costs unmanaged** — no budget tracking or circuit breaker (needs business decision on limits)
7. ~~**Share temp files not cleaned up**~~ FIXED 2026-04-03: Both tmpUri and cleanUri deleted after share completes

## Design Decisions

### Why photo scans don't use cache
Each photo scan always runs a fresh Claude analysis because:
- Claude's vision can misidentify similar products (e.g. same brand, different flavor)
- A wrong product name → wrong cache key → returns someone else's analysis
- The only reliable cache is barcode-based (exact UPC match)
- Photo results are still WRITTEN to cache after completion for history playback

### Why product lookup uses its own signal (not the analysis signal)
The analysis controller's signal gets aborted by:
- Free user early stop (when overallScore + primaryProteinSource arrive)
- Analysis timeout (120s)
If the product lookup shared this signal, it would be killed immediately for free users.
The lookup now runs independently with no signal — it has its own 12s timeout via AbortController inside `lookupProduct`.
The re-analysis also uses a fresh AbortController with a 60s timeout.

### Why we removed the identify→lookup two-stage flow
The old flow: identify product → lookup verified data → analyze with verified data
- The identify step used a separate lightweight Claude call
- It consistently confused product variants (e.g. "Gems Mousse Paté with Salmon" → "Classic Paté")
- Wrong identification cascaded through lookup and cache, compounding the error
- New flow: single Claude call reads packaging + analyzes in one pass, then product-lookup runs in parallel for verified ingredient enrichment

## Cache Architecture

| Layer | Store | TTL | Key Format |
|-------|-------|-----|------------|
| In-memory | analysisService Map | 5 min | normalized name or barcode |
| Local | AsyncStorage | Session | `@woof_result_{key}` |
| Server | Supabase analysis_cache | 30 days | normalized name or barcode |
| Product data | Supabase product_data | 90 days | normalized `brand + name` |

## File Responsibilities

| File | Purpose |
|------|---------|
| `services/analysisService.js` | Singleton orchestrator — manages analysis lifecycle, dedup, streaming, caching |
| `services/claude.js` | API client — auth headers, streaming SSE, retry, timeouts |
| `services/cache.js` | Supabase analysis_cache read + normalizeCacheKey |
| `services/history.js` | Dual-store history (AsyncStorage + Supabase) |
| `services/opff.js` | Open Pet Food Facts API client (barcode + name search) |
| `services/auth.js` | AuthProvider context — session, profile, purchases, scan limits |
| `services/purchases.js` | RevenueCat wrapper — offerings, purchase, restore |
| `services/supabase.js` | Supabase client singleton |
| `supabase/functions/analyze/` | Edge Function — Claude API proxy, system prompts, caching |
| `supabase/functions/product-lookup/` | Edge Function — multi-source ingredient scraping (OPFF, DFA, CFA, Google) |
| `theme.js` | Design tokens + ThemeProvider (system/light/dark) |

## Variety Pack Handling

When Claude detects a variety pack (multiple flavors in one box), it returns a different JSON format:
- `isVarietyPack: true`
- `flavors[]` — each with name, score, primaryProtein, keyIngredients, concern
- `bestFlavor` / `worstFlavor` — highlights for the user
- `overallScore` — average across all recipes
- `categories` — averaged across recipes

The UI shows a "Recipes in This Pack" card listing each flavor with its score and key ingredients, plus best/worst callouts. No individual ingredient list is shown (would be too long for 3-4 recipes).

## Edge Function Prompts

| Prompt | Used When | Model | Max Tokens |
|--------|-----------|-------|------------|
| PHOTO_SYSTEM_PROMPT | Photo scan (no barcode) | claude-sonnet-4-5 | 16384 |
| VERIFIED_DATA_PROMPT | Re-analysis with verified ingredients | claude-sonnet-4-5 | 16384 |
| HUMAN_FOOD_PROMPT | Human food safety check | claude-sonnet-4-5 | 4096 |
| IDENTIFY_PROMPT | Product identification (currently unused) | claude-sonnet-4-5 | 512 |
