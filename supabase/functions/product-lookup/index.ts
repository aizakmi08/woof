import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.0";

const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
  "Vary": "Origin",
};

// ── Constants ──────────────────────────────────────────────────────

const SCRAPINGBEE_API_URL = "https://app.scrapingbee.com/api/v1/";
const SCRAPINGBEE_GOOGLE_URL = "https://app.scrapingbee.com/api/v1/store/google";
const OPFF_TIMEOUT_MS = 5000;
const MAX_REQUEST_BYTES = 64_000;
const MAX_PRODUCT_LOOKUP_NAME_LENGTH = 200;
const MAX_LOOKUP_BRAND_LENGTH = 100;
const MAX_LOOKUP_SEARCH_TERMS = 8;
const MAX_LOOKUP_SEARCH_TERM_LENGTH = 220;
const PRODUCT_LOOKUP_DB_TIMEOUT_MS = 8_000;
const PRODUCT_LOOKUP_CACHE_READ_TIMEOUT_MS = 5_000;
const PRODUCT_LOOKUP_CACHE_WRITE_TIMEOUT_MS = 5_000;
const AUTH_PRODUCT_LOOKUP_RATE_LIMIT_PER_HOUR = 30;

// Cat-only brands for pet type detection
const CAT_BRANDS = [
  "fancy feast", "friskies", "sheba", "tiki cat", "kit & kaboodle",
  "9 lives", "temptations", "meow mix", "whiskas",
];
const DOG_BRANDS = [
  "pedigree", "kibbles n bits", "cesar", "beneful", "ol' roy",
];

// ── Helpers ────────────────────────────────────────────────────────

function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("Origin");
  if (!origin) {
    return BASE_CORS_HEADERS;
  }

  const allowedOrigins = (Deno.env.get("ALLOWED_CORS_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const isDevelopmentOrigin =
    Deno.env.get("ENVIRONMENT") !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin);

  if (!allowedOrigins.includes(origin) && !isDevelopmentOrigin) {
    return null;
  }

  return {
    ...BASE_CORS_HEADERS,
    "Access-Control-Allow-Origin": origin,
  };
}

function makeJsonResponse(
  body: Record<string, unknown>,
  status = 200,
  corsHeaders: Record<string, string> = BASE_CORS_HEADERS,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function startLinkedTimedRequest(label: string, timeoutMs: number, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    console.log(`[LOOKUP] ${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    controller.abort();
  }, timeoutMs);
  const abortFromParent = () => {
    console.log(`[LOOKUP] ${label} aborted because client request closed`);
    controller.abort();
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function fetchJsonWithLinkedTimeout(
  label: string,
  input: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<{ response: Response; data: any | null }> {
  const request = startLinkedTimedRequest(label, timeoutMs, parentSignal);
  try {
    const response = await fetch(input, { ...init, signal: request.signal });
    const data = response.ok ? await response.json() : null;
    return { response, data };
  } finally {
    request.cleanup();
  }
}

async function fetchTextWithLinkedTimeout(
  label: string,
  input: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<{ response: Response; text: string | null }> {
  const request = startLinkedTimedRequest(label, timeoutMs, parentSignal);
  try {
    const response = await fetch(input, { ...init, signal: request.signal });
    const text = response.ok ? await response.text() : null;
    return { response, text };
  } finally {
    request.cleanup();
  }
}

async function runSupabaseQuery(
  label: string,
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  buildQuery: (signal: AbortSignal) => PromiseLike<any>,
): Promise<any> {
  const request = startLinkedTimedRequest(label, timeoutMs, parentSignal);
  let abortFromDeadline: (() => void) | null = null;
  const abortPromise = new Promise((_, reject) => {
    abortFromDeadline = () => reject(new DOMException("Aborted", "AbortError"));
    request.signal.addEventListener("abort", abortFromDeadline, { once: true });
  });
  try {
    return await Promise.race([buildQuery(request.signal), abortPromise]);
  } finally {
    if (abortFromDeadline) request.signal.removeEventListener("abort", abortFromDeadline);
    request.cleanup();
  }
}

function normalizeForCache(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    // Must match services/cache.js#normalizeCacheKey — hyphens become spaces.
    .replace(/[-/&]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBarcode(value: unknown): string {
  const barcode = typeof value === "string" || typeof value === "number"
    ? String(value).trim().replace(/[\s-]/g, "")
    : "";
  return /^[a-z0-9]{6,40}$/i.test(barcode) ? barcode : "";
}

function collectLookupCacheKeys(
  productName: string,
  brand: string | null,
  searchTerms: unknown,
): string[] {
  const rawTerms = [
    brand ? `${brand} ${productName}` : productName,
    productName,
  ];

  if (Array.isArray(searchTerms)) {
    for (const term of searchTerms.slice(0, MAX_LOOKUP_SEARCH_TERMS)) {
      if (typeof term !== "string") continue;
      const trimmed = term.trim();
      if (!trimmed || trimmed.length > MAX_LOOKUP_SEARCH_TERM_LENGTH) continue;
      rawTerms.push(trimmed);
      if (brand && !trimmed.toLowerCase().includes(brand.toLowerCase())) {
        rawTerms.push(`${brand} ${trimmed}`);
      }
    }
  }

  return [...new Set(rawTerms.map(normalizeForCache).filter(Boolean))];
}

// Heuristics for "this looks like a real ingredient, not scraped page chrome".
// Real ingredients: short food words. Page chrome: JSON tokens, URLs, mailto links.
function isPlausibleIngredient(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 2 || t.length > 200) return false;
  // JSON / code leakage signals
  if (/[\\{}]/.test(t)) return false;             // backslash, curly braces
  if (/^[\["']/.test(t)) return false;            // starts with quote/bracket
  if (/:\s*"/.test(t)) return false;              // "key": "value" pattern
  if (/\bmailto:|https?:\/\//i.test(t)) return false;
  // Specific page-chrome terms we've seen leak
  if (/\b(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName|powered\s*by)\b/i.test(t)) return false;
  // Must contain at least 2 letters (numeric-only or punctuation-only is junk)
  if ((t.match(/[a-zA-Z]/g) || []).length < 2) return false;
  return true;
}

function sanitizeIngredientList(items: unknown[]): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(isPlausibleIngredient)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1));
}

// Sanity check on a whole ingredient list. If too few plausible items remain
// or junk dominates, treat the entire list as untrustworthy so we don't save it.
function isPlausibleIngredientList(items: string[]): boolean {
  if (!Array.isArray(items) || items.length < 3) return false;
  const good = sanitizeIngredientList(items).length;
  // At least 80% of items must look real, and at least 5 plausible items overall.
  return good >= Math.max(5, Math.floor(items.length * 0.8));
}

function parseIngredientText(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  // Reject the whole text if it's clearly JSON/code/page chrome before splitting.
  if (/\\"|legalLinks|reportAbuseLink|siteSettings/i.test(text)) {
    console.log("[INGREDIENTS] Rejected text — looks like scraped page chrome");
    return [];
  }

  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of text.replace(/\.$/, "").replace(/\s+/g, " ")) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const cleaned = sanitizeIngredientList(parts);

  return cleaned;
}

function detectPetType(
  productName: string,
  brand: string | null,
  providedPetType: string | null,
): "dog" | "cat" {
  if (providedPetType === "cat" || providedPetType === "dog") return providedPetType;

  const text = `${brand || ""} ${productName}`.toLowerCase();

  const catScore =
    (text.includes("cat") ? 2 : 0) +
    (text.includes("kitten") ? 2 : 0) +
    (text.includes("feline") ? 2 : 0) +
    CAT_BRANDS.filter((b) => text.includes(b)).length * 3;

  const dogScore =
    (text.includes("dog") ? 2 : 0) +
    (text.includes("puppy") ? 2 : 0) +
    (text.includes("canine") ? 2 : 0) +
    DOG_BRANDS.filter((b) => text.includes(b)).length * 3;

  return catScore > dogScore ? "cat" : "dog";
}

const PRODUCT_MATCH_STOP_WORDS = new Set([
  "food", "foods", "with", "recipe", "formula", "adult", "puppy", "kitten",
  "senior", "from", "that", "the", "and", "for", "dry", "wet", "canned",
  "grain", "free", "pate", "feast", "mix", "real", "natural", "high",
  "protein", "dog", "dogs", "cat", "cats", "canine", "feline",
]);

const PRODUCT_MATCH_FLAVORS = [
  "chicken", "beef", "salmon", "turkey", "lamb", "duck", "venison",
  "rabbit", "fish", "whitefish", "shrimp", "pork", "bison", "buffalo",
  "tuna", "herring", "mackerel", "trout", "anchovy", "sardine", "pollock",
  "cod",
];

function normalizeMatchText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDisplayText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&reg;|&trade;/gi, "")
    .replace(/^\s*(?:brand|product)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCatalogNameForQuality(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;|&/gi, " amp ")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyNonProductCatalogRow(productName: string | null | undefined, brand?: string | null): boolean {
  const name = normalizeCatalogNameForQuality(productName);
  const brandName = normalizeCatalogNameForQuality(brand);
  if (!name) return false;
  return (
    /^ingredients? (?:amp |and )?nutritional value$/.test(name) ||
    /^ingredients? guide(?: ingredients? guide)?(?: |$)/.test(name) ||
    /(?:^| )(?:dog|cat|pet) (?:food|treat) trends?(?: |$)/.test(name) ||
    (/(?:^| )trends?(?: |$)/.test(name) && /(?:^| )the rise of(?: |$)/.test(name)) ||
    (
      (brandName === "ingredients guide" || brandName === "dog treat") &&
      (
        /^ingredients? guide(?: ingredients? guide)?(?: |$)/.test(name) ||
        /(?:^| )(?:dog|cat|pet) (?:food|treat) trends?(?: |$)/.test(name)
      )
    )
  );
}

function significantProductTokens(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  return normalizeMatchText(value)
    .split(" ")
    .filter((token) =>
      token.length > 2 &&
      !PRODUCT_MATCH_STOP_WORDS.has(token) &&
      !seen.has(token) &&
      (seen.add(token), true)
    );
}

function hasPetTypeConflict(searchable: string, petType: "dog" | "cat"): boolean {
  const catSignals = /\b(cat|cats|kitten|kittens|feline)\b/.test(searchable);
  const dogSignals = /\b(dog|dogs|puppy|puppies|canine)\b/.test(searchable);
  return petType === "dog"
    ? catSignals && !dogSignals
    : dogSignals && !catSignals;
}

function validateProductMatch(
  result: ProductResult,
  requestedName: string,
  requestedBrand: string | null,
  petType: "dog" | "cat",
): boolean {
  const searchable = normalizeMatchText(
    `${result.productName || ""} ${result.brand || ""} ${result.sourceUrl || ""} ${result.matchText || ""}`,
  );
  const topIngredients = normalizeMatchText((result.ingredients || []).slice(0, 5).join(" "));

  if (hasPetTypeConflict(searchable, petType)) {
    console.log(
      `[LOOKUP] ${result.source} — rejected pet-type mismatch: "${requestedName}" → "${result.productName || ""}" (${petType})`,
    );
    return false;
  }

  const brandTokens = significantProductTokens(requestedBrand);
  if (brandTokens.length > 0) {
    const brandHits = brandTokens.filter((token) => searchable.includes(token)).length;
    const brandRatio = brandHits / brandTokens.length;
    if (brandHits === 0 || brandRatio < 0.5) {
      console.log(
        `[LOOKUP] ${result.source} — rejected brand mismatch: "${requestedBrand}" → "${result.productName || ""}" (${brandRatio.toFixed(2)})`,
      );
      return false;
    }
  }

  const requestTokens = significantProductTokens(requestedName)
    .filter((token) => !brandTokens.includes(token));
  const tokenHits = requestTokens.filter((token) => searchable.includes(token)).length;
  const tokenRatio = requestTokens.length > 0 ? tokenHits / requestTokens.length : 1;
  const minHits = requestTokens.length <= 2 ? 1 : 2;
  if (requestTokens.length > 0 && (tokenHits < minHits || tokenRatio < 0.35)) {
    console.log(
      `[LOOKUP] ${result.source} — rejected title mismatch: "${requestedName}" → "${result.productName || ""}" (${tokenRatio.toFixed(2)})`,
    );
    return false;
  }

  const requestedFlavors = PRODUCT_MATCH_FLAVORS.filter((flavor) =>
    normalizeMatchText(requestedName).includes(flavor)
  );
  if (requestedFlavors.length > 0) {
    const flavorMatch = requestedFlavors.some((flavor) =>
      searchable.includes(flavor) || topIngredients.includes(flavor)
    );
    if (!flavorMatch) {
      console.log(
        `[LOOKUP] ${result.source} — rejected flavor mismatch: "${requestedName}" → "${result.productName || ""}"`,
      );
      return false;
    }
  }

  return true;
}

// ── Product result interface ───────────────────────────────────────

interface ProductResult {
  found: boolean;
  source: string;
  productName?: string;
  brand?: string | null;
  ingredients?: string[];
  ingredientText?: string;
  ingredientCount?: number;
  nutritionalInfo?: Record<string, any>;
  barcode?: string;
  sourceUrl?: string;
  matchText?: string;
  imageUrl?: string | null;
  rating?: { score: number; outOf: number } | null;
  servedFromCache?: boolean;
}

// ── Generic Google Search → Page Scrape ────────────────────────────
//
// Reusable for any review site. 2 ScrapingBee credits per lookup:
//   1. Google Search API (1 credit) → find the review page URL
//   2. Page scrape (1 credit, no JS) → extract ingredient list

interface SiteConfig {
  domain: string;
  /** Google search query filter (e.g. "site:dogfoodadvisor.com/dog-food-reviews") */
  siteFilter: string;
  /** Source name used in results */
  sourceName: string;
  /** URL substrings to accept from Google results */
  urlFilters: string[];
}

const SITE_CONFIGS: Record<string, SiteConfig[]> = {
  dog: [
    {
      domain: "dogfoodadvisor.com",
      siteFilter: "site:dogfoodadvisor.com/dog-food-reviews",
      sourceName: "dfa",
      urlFilters: ["dogfoodadvisor.com/dog-food-reviews/"],
    },
  ],
  cat: [
    {
      domain: "catfoodadvisor.com",
      siteFilter: "site:catfoodadvisor.com/reviews",
      sourceName: "cfa",
      urlFilters: ["catfoodadvisor.com/reviews/"],
    },
    {
      domain: "cats.com",
      siteFilter: "site:cats.com",
      sourceName: "cats",
      urlFilters: ["cats.com/"],
    },
    {
      domain: "dogfoodadvisor.com",
      siteFilter: "site:dogfoodadvisor.com/cat-food-reviews",
      sourceName: "dfa",
      urlFilters: ["dogfoodadvisor.com/cat-food-reviews/"],
    },
  ],
};

async function scrapeViaGoogle(
  config: SiteConfig,
  productName: string,
  brand: string | null,
  apiKey: string,
  parentSignal?: AbortSignal,
): Promise<ProductResult> {
  const t0 = Date.now();
  const { domain, siteFilter, sourceName, urlFilters } = config;

  try {
    // Step 1: Google search for review page (1 credit)
    const nameHasBrand = brand && productName.toLowerCase().includes(brand.toLowerCase());
    const searchQuery = `${nameHasBrand ? "" : (brand || "")} ${productName} ${siteFilter}`.trim();
    console.log(`[LOOKUP] ${sourceName} Google search:`, searchQuery);

    const searchParams = new URLSearchParams({
      api_key: apiKey,
      search: searchQuery,
      nb_results: "5",
    });

    const { response: searchResponse, data: searchData } = await fetchJsonWithLinkedTimeout(
      `${sourceName} Google search`,
      `${SCRAPINGBEE_GOOGLE_URL}?${searchParams}`,
      {},
      12000,
      parentSignal,
    );

    if (!searchResponse.ok) {
      console.error(`[LOOKUP] ${sourceName} Google search failed:`, searchResponse.status);
      return { found: false, source: sourceName };
    }

    const results = searchData?.organic_results || [];

    // Filter to matching URLs
    const matchedUrls = results
      .filter((r: any) =>
        r.url && urlFilters.some((f) => r.url.includes(f)),
      )
      .map((r: any) => ({
        url: r.url.split("?")[0],
        title: r.title || "",
      }));

    if (matchedUrls.length === 0) {
      console.log(`[LOOKUP] No ${sourceName} pages found via Google`);
      return { found: false, source: sourceName };
    }

    // Pick best URL (prefer ones with brand name in slug)
    const brandSlug = (brand || "").toLowerCase().replace(/[^a-z]/g, "");
    let bestUrl = matchedUrls[0];
    for (const candidate of matchedUrls) {
      if (brandSlug && candidate.url.toLowerCase().includes(brandSlug)) {
        bestUrl = candidate;
        break;
      }
    }

    console.log(`[LOOKUP] ${sourceName} page:`, bestUrl.url);

    // Step 2: Scrape the page (1 credit, no JS rendering needed)
    const pageParams = new URLSearchParams({
      api_key: apiKey,
      url: bestUrl.url,
      render_js: "false",
    });

    const { response: pageResponse, text: pageHtml } = await fetchTextWithLinkedTimeout(
      `${sourceName} page scrape`,
      `${SCRAPINGBEE_API_URL}?${pageParams}`,
      {},
      10000,
      parentSignal,
    );

    if (!pageResponse.ok) {
      console.error(`[LOOKUP] ${sourceName} page scrape failed:`, pageResponse.status);
      return { found: false, source: sourceName };
    }

    let html = pageHtml || "";
    console.log(`[LOOKUP] ${sourceName} page loaded (${html.length} chars)`);

    // Step 3: Extract ingredients
    let ingredients = extractIngredientsFromHtml(html, productName);

    // If static scrape found nothing or garbage, retry WITH JS rendering for DFA/CFA
    const jsRetryDomains = ["dogfoodadvisor.com", "catfoodadvisor.com"];
    if ((!ingredients || ingredients.list.length < 5) && jsRetryDomains.some((d) => bestUrl.url.includes(d))) {
      console.log(`[LOOKUP] ${sourceName} — retrying with JS rendering`);
      try {
        const jsParams = new URLSearchParams({
          api_key: apiKey,
          url: bestUrl.url,
          render_js: "true",
          wait: "4000",
        });
        const { response: jsResponse, text: jsHtml } = await fetchTextWithLinkedTimeout(
          `${sourceName} JS retry`,
          `${SCRAPINGBEE_API_URL}?${jsParams}`,
          {},
          15000,
          parentSignal,
        );
        if (jsResponse.ok) {
          const rawJsHtml = jsHtml || "";
          const safeJsHtml = rawJsHtml.length > 500000 ? rawJsHtml.slice(0, 500000) : rawJsHtml;
          console.log(`[LOOKUP] ${sourceName} JS page: ${rawJsHtml.length} chars`);
          ingredients = extractIngredientsFromHtml(safeJsHtml, productName);
        }
      } catch (e) {
        console.log(`[LOOKUP] ${sourceName} JS retry failed:`, (e as Error).message);
      }
    }

    if (!ingredients || ingredients.list.length < 5) {
      console.log(`[LOOKUP] ${sourceName} — no ingredients extracted`);
      return { found: false, source: sourceName };
    }

    const elapsed = Date.now() - t0;
    console.log(
      `[LOOKUP] ${sourceName} complete (${elapsed}ms):`,
      ingredients.list.length, "ingredients |",
      bestUrl.title,
    );

    // Clean up product name from page title
    let cleanName = bestUrl.title
      .replace(/\s*(?:Dog|Cat)\s*Food Review.*$/i, "")
      .replace(/\s*Review.*$/i, "")
      .replace(/\s*\([^)]*\)\s*$/i, "")
      .trim();
    if (!cleanName) cleanName = productName;

    // Validate: scraped page matches the requested product.
    // Review sites (DFA/CFA) cover entire product lines, so skip flavor check for those.
    // Only check that brand and product line name overlap.
    const stopWords = new Set(["food", "with", "recipe", "formula", "adult", "puppy", "kitten", "senior", "from", "that", "the", "and", "for", "dry", "wet", "canned", "grain", "free", "pate", "feast", "mix", "real", "natural", "high", "protein"]);
    const requestWords = productName.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const titleLower = (bestUrl.title + " " + bestUrl.url + " " + cleanName).toLowerCase();
    const matchCount = requestWords.filter(w => titleLower.includes(w)).length;
    const matchRatio = requestWords.length > 0 ? matchCount / requestWords.length : 0;

    const brandMatch = brand ? titleLower.includes(brand.toLowerCase()) : true;

    if (!brandMatch || matchRatio < 0.25) {
      console.log(`[LOOKUP] ${sourceName} — mismatch! Requested "${productName}" → "${cleanName}" (match: ${matchRatio.toFixed(2)}, brand: ${brandMatch})`);
      return { found: false, source: sourceName };
    }

    const imageUrl = extractProductImage(html);
    const rating = extractRating(html);

    return {
      found: true,
      source: sourceName,
      productName: cleanName,
      brand: brand || null,
      ingredients: ingredients.list,
      ingredientText: ingredients.text,
      ingredientCount: ingredients.list.length,
      sourceUrl: bestUrl.url,
      imageUrl: imageUrl || null,
      rating: rating || null,
    };
  } catch (e) {
    const elapsed = Date.now() - t0;
    console.error(`[LOOKUP] ${sourceName} error (${elapsed}ms):`, (e as Error).message);
    return { found: false, source: sourceName };
  }
}

// ── Image & Rating Extraction ─────────────────────────────────────

function extractProductImage(html: string): string | null {
  // Try JSON-LD structured data image first
  const jsonLdImage = html.match(/"image"\s*:\s*"(https?:[^"]+)"/i);
  if (jsonLdImage?.[1]) {
    return jsonLdImage[1].replace(/\\\//g, "/");
  }

  // Try og:image
  const ogMatch = html.match(/og:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/content=["']([^"']+)["'][^>]*og:image/i);
  if (ogMatch?.[1] && !ogMatch[1].includes("logo") && !ogMatch[1].includes("icon")) {
    return ogMatch[1];
  }

  return null;
}

function extractRating(html: string): { score: number; outOf: number } | null {
  // Try JSON-LD ratingValue
  const ratingMatch = html.match(/"ratingValue"\s*:\s*"?(\d+(?:\.\d+)?)"?/);
  const bestMatch = html.match(/"bestRating"\s*:\s*"?(\d+)"?/);
  if (ratingMatch?.[1]) {
    return {
      score: parseFloat(ratingMatch[1]),
      outOf: bestMatch?.[1] ? parseInt(bestMatch[1]) : 5,
    };
  }

  // Try aria-label star rating (DFA pattern)
  const ariaMatch = html.match(/star rating:\s*(\d+(?:\.\d+)?)\s*star/i);
  if (ariaMatch?.[1]) {
    return { score: parseFloat(ariaMatch[1]), outOf: 5 };
  }

  return null;
}

// ── Ingredient Extraction (works across multiple sites) ────────────

function extractIngredientsFromHtml(
  html: string,
  productName: string,
): { list: string[]; text: string } | null {
  // Limit HTML size to prevent regex timeouts
  const safeHtml = html.length > 500000 ? html.slice(0, 500000) : html;

  // Collect all candidate ingredient lists from the page
  const candidates: Array<{ text: string; list: string[]; context: string }> = [];

  // Strategy 1: Find <p> tags with 6+ comma-separated items
  const paragraphs = safeHtml.match(/<p[^>]*>([^<]{80,5000})<\/p>/g) || [];
  for (const p of paragraphs) {
    const inner = p.replace(/<\/?p[^>]*>/g, "").trim();
    const parts = inner.split(",");
    if (parts.length >= 6) {
      // Quick validation: not code/JSON, has food words
      const lower = inner.toLowerCase();
      if (lower.includes("function") || lower.includes("=>") || lower.includes("@context") || lower.includes("{\"")) continue;
      const pIdx = safeHtml.indexOf(inner);
      // Capture more context — grab all text within 2000 chars before the ingredient list
      const before = safeHtml.slice(Math.max(0, pIdx - 2000), pIdx);
      // Get all headings in the context window
      const headings = before.match(/<h[23456][^>]*>([^<]+)<\/h[23456]>/g) || [];
      const allHeadingsText = headings
        .map((h) => h.replace(/<\/?h[23456][^>]*>/g, "").trim())
        .join(" ");
      // Also grab any bold/strong text which might be recipe names
      const boldTexts = before.match(/<(?:strong|b)[^>]*>([^<]+)<\/(?:strong|b)>/g) || [];
      const boldContext = boldTexts
        .map((b) => b.replace(/<\/?(?:strong|b)[^>]*>/g, "").trim())
        .join(" ");

      candidates.push({
        text: inner,
        list: parseIngredientText(inner),
        context: allHeadingsText + " " + boldContext,
      });
    }
  }

  // Strategy 2: Find any text block (not just <p>) with ingredient-like content
  if (candidates.length === 0) {
    const blocks = safeHtml.match(/>([^<]{100,5000})</g) || [];
    for (const b of blocks) {
      const inner = b.slice(1).trim();
      const parts = inner.split(",");
      if (parts.length >= 6) {
        const lower = inner.toLowerCase();
        if (lower.includes("function") || lower.includes("=>") || lower.includes("@context") || lower.includes("{\"")) continue;
        const foodWords = ["chicken", "fish", "beef", "rice", "meal", "vitamin", "turkey", "salmon", "lamb", "peas", "salt", "fat", "oil"];
        const hasFood = foodWords.some((w) => lower.includes(w));
        if (hasFood) {
          candidates.push({ text: inner, list: parseIngredientText(inner), context: "" });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  if (candidates.length === 1) {
    return { list: candidates[0].list, text: candidates[0].text };
  }

  // Multiple ingredient lists on the page — pick the one matching the requested flavor.
  // DFA/CFA review pages list multiple recipes. We need the right one.
  const nameLower = productName.toLowerCase();

  // Extract flavor/protein keywords from the product name
  const flavorKeywords = ["chicken", "beef", "salmon", "turkey", "lamb", "duck", "venison",
    "rabbit", "fish", "whitefish", "shrimp", "pork", "bison", "buffalo", "tuna",
    "herring", "mackerel", "trout", "anchovy", "sardine", "pollock", "cod"];
  const requestedFlavors = flavorKeywords.filter((f) => nameLower.includes(f));

  // Also extract non-flavor product words for general matching
  const stopWords = new Set(["food", "with", "recipe", "formula", "for", "the", "and", "grain", "free", "dry", "wet", "adult", "puppy", "kitten", "senior", "dog", "cat", "dogs", "cats"]);
  const queryWords = nameLower.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));

  let best = candidates[0];
  let bestScore = -1;

  for (const c of candidates) {
    // Check heading/context + first 5 ingredients for flavor match
    const contextLower = c.context.toLowerCase();
    const topIngredientsLower = c.list.slice(0, 5).join(" ").toLowerCase();
    const fullSearchable = contextLower + " " + topIngredientsLower;

    let score = 0;

    // Heavy weight for flavor match in heading (e.g., "Chicken Recipe" in heading)
    for (const flavor of requestedFlavors) {
      if (contextLower.includes(flavor)) score += 10;
    }

    // Medium weight for flavor in top ingredients (chicken recipe should have "chicken" early)
    for (const flavor of requestedFlavors) {
      if (topIngredientsLower.includes(flavor)) score += 5;
    }

    // Light weight for other product name words
    for (const word of queryWords) {
      if (fullSearchable.includes(word)) score += 1;
    }

    // Penalty if a DIFFERENT flavor is prominent in the heading
    for (const flavor of flavorKeywords) {
      if (!requestedFlavors.includes(flavor) && contextLower.includes(flavor)) {
        score -= 8; // Strong penalty for wrong flavor in heading
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  console.log(`[LOOKUP] Selected ingredient list: context="${best.context.slice(0, 60)}" | score=${bestScore} | ${best.list.length} items | from ${candidates.length} candidates`);

  return { list: best.list, text: best.text };
}

// ── Universal Google Ingredient Search ─────────────────────────────
//
// Last-resort scrape: searches Google for "{product} ingredients" and
// extracts the ingredient list from whatever page comes up (Amazon,
// Walmart, manufacturer site, review blog, etc.).
//
// Cost: 2 credits (1 Google search + 1 page scrape, no JS rendering).
// If the page needs JS (Amazon/Chewy/Walmart), costs 6 credits.

const JS_HEAVY_SITES = [
  "amazon.com", "chewy.com", "walmart.com",
  "target.com", "petsmart.com", "petco.com",
];

const BLOCKED_DOMAINS = [
  "google.com", "youtube.com", "facebook.com", "instagram.com",
  "tiktok.com", "pinterest.com", "reddit.com", "twitter.com",
  "x.com",
];

const PREFERRED_DOMAINS = [
  "dogfoodadvisor.com", "catfoodadvisor.com", "catfooddb.com",
  "amazon.com", "chewy.com", "petco.com", "petsmart.com",
  "walmart.com", "target.com", "petfoodreviewer.com",
  "allaboutcatfood.co.uk", "cats.com",
  "purina.com", "hillspet.com", "royalcanin.com",
  "bluebuffalo.com", "iams.com", "nutro.com",
  "merrickpetcare.com", "wellnesspetfood.com",
  "tasteofthewildpetfood.com", "canidae.com",
  "orijen.ca", "acana.com", "instinctpetfood.com",
  "fromm.com", "victorpetfood.com", "diamondpet.com",
];

async function universalIngredientSearch(
  productName: string,
  brand: string | null,
  petType: string,
  apiKey: string,
  parentSignal?: AbortSignal,
): Promise<ProductResult> {
  const t0 = Date.now();

  try {
    // Step 1: Google search for ingredient list (1 credit, no JS)
    // Remove brand from query if it's already in the product name to avoid duplication
    const nameLower = productName.toLowerCase();
    const brandInName = brand && nameLower.includes(brand.toLowerCase());
    const query = `${brandInName ? "" : (brand || "")} ${productName} ingredients`.trim();
    console.log("[LOOKUP] Universal search:", query);

    // Use ScrapingBee Google Search API (1 credit) instead of scraping google.com
    const searchParams = new URLSearchParams({
      api_key: apiKey,
      search: query,
      nb_results: "8",
    });

    const { response: searchResponse, data: searchData } = await fetchJsonWithLinkedTimeout(
      "Universal Google search",
      `${SCRAPINGBEE_GOOGLE_URL}?${searchParams}`,
      {},
      12000,
      parentSignal,
    );

    if (!searchResponse.ok) {
      console.error("[LOOKUP] Universal Google search failed:", searchResponse.status);
      return { found: false, source: "web" };
    }

    const results = searchData?.organic_results || [];

    // Extract URLs, filtering out blocked domains
    const rawUrls: string[] = results
      .filter((r: any) => r.url && !BLOCKED_DOMAINS.some((d) => r.url.includes(d)))
      .map((r: any) => r.url.split("?")[0]);

    if (rawUrls.length === 0) {
      console.log("[LOOKUP] Universal search: no usable URLs found");
      return { found: false, source: "web" };
    }

    // Pick best URL: prefer trusted pet food domains, then first result
    let bestUrl = rawUrls[0];
    for (const domain of PREFERRED_DOMAINS) {
      const preferred = rawUrls.find((u) => u.includes(domain));
      if (preferred) {
        bestUrl = preferred;
        break;
      }
    }

    console.log(`[LOOKUP] Universal scraping: ${bestUrl}`);

    // Step 2: Scrape the page (1 credit static, 5 credits if JS needed)
    const needsJs = JS_HEAVY_SITES.some((s) => bestUrl.includes(s));
    const pageParams = new URLSearchParams({
      api_key: apiKey,
      url: bestUrl,
      render_js: needsJs ? "true" : "false",
      ...(needsJs && { wait: "3000" }),
    });

    const { response: pageResponse, text: html } = await fetchTextWithLinkedTimeout(
      "Universal page scrape",
      `${SCRAPINGBEE_API_URL}?${pageParams}`,
      {},
      needsJs ? 15000 : 10000,
      parentSignal,
    );

    if (!pageResponse.ok) {
      console.error("[LOOKUP] Universal page scrape failed:", pageResponse.status);
      return { found: false, source: "web" };
    }

    const pageHtml = html || "";
    console.log(`[LOOKUP] Universal page loaded (${pageHtml.length} chars)`);

    // Step 3: Extract ingredients using existing extraction logic
    const ingredients = extractIngredientsFromHtml(pageHtml, productName);

    if (!ingredients || ingredients.list.length < 5) {
      console.log("[LOOKUP] Universal: too few ingredients extracted");
      return { found: false, source: "web" };
    }

    // Extract product title from page
    const titleMatch = pageHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    let pageTitle = titleMatch
      ? titleMatch[1]
          .replace(/\s*[-|–—].*$/, "")
          .replace(/\s*:\s*Amazon\.com.*$/i, "")
          .trim()
      : productName;

    // Validate product match (same logic as site-specific scraping)
    const uStopWords = new Set(["food", "with", "recipe", "formula", "adult", "puppy", "kitten", "senior", "from", "that", "the", "and", "for", "dry", "wet", "canned", "grain", "free", "pate", "feast", "mix"]);
    const uFlavorWords = new Set(["chicken", "beef", "salmon", "turkey", "tuna", "lamb", "duck", "venison", "rabbit", "fish", "whitefish", "shrimp", "pork", "bison", "buffalo"]);
    const reqWords = productName.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !uStopWords.has(w));
    const pageLower = ((pageTitle || "") + " " + bestUrl).toLowerCase();
    const uMatchCount = reqWords.filter(w => pageLower.includes(w)).length;
    const uMatchRatio = reqWords.length > 0 ? uMatchCount / reqWords.length : 0;
    const uBrandMatch = brand ? pageLower.includes(brand.toLowerCase()) : true;
    const uReqFlavors = reqWords.filter(w => uFlavorWords.has(w));
    const uFlavorMatch = uReqFlavors.length === 0 || uReqFlavors.some(f => pageLower.includes(f));

    if (!uBrandMatch || !uFlavorMatch || uMatchRatio < 0.4) {
      console.log(`[LOOKUP] Universal — mismatch! "${productName}" → "${pageTitle}" (match: ${uMatchRatio.toFixed(2)}, brand: ${uBrandMatch}, flavor: ${uFlavorMatch})`);
      return { found: false, source: "web" };
    }

    const elapsed = Date.now() - t0;
    console.log(
      `[LOOKUP] Universal complete (${elapsed}ms):`,
      ingredients.list.length, "ingredients from", bestUrl,
    );

    const webImageUrl = extractProductImage(pageHtml);
    const webRating = extractRating(pageHtml);

    return {
      found: true,
      source: "web",
      productName: pageTitle || productName,
      brand: brand || null,
      ingredients: ingredients.list,
      ingredientText: ingredients.text,
      ingredientCount: ingredients.list.length,
      sourceUrl: bestUrl,
      imageUrl: webImageUrl || null,
      rating: webRating || null,
    };
  } catch (e) {
    const elapsed = Date.now() - t0;
    console.error(`[LOOKUP] Universal error (${elapsed}ms):`, (e as Error).message);
    return { found: false, source: "web" };
  }
}

// ── Chewy/Amazon Direct Search (JS rendering, 5-6 credits) ──────────
//
// Dedicated scraper for Chewy — has every product with flavor-specific ingredients.
// Only called if DFA/CFA/universal don't find the right flavor.

async function searchChewy(
  productName: string,
  brand: string | null,
  petType: "dog" | "cat",
  apiKey: string,
  parentSignal?: AbortSignal,
): Promise<ProductResult> {
  const t0 = Date.now();
  try {
    // Step 1: Google search for Chewy product page (1 credit)
    const query = `${brand || ""} ${productName} ingredients site:chewy.com`.trim();
    console.log("[LOOKUP] Chewy search:", query);

    const searchParams = new URLSearchParams({
      api_key: apiKey,
      search: query,
      nb_results: "3",
    });

    const { response: searchResponse, data: searchData } = await fetchJsonWithLinkedTimeout(
      "Chewy Google search",
      `${SCRAPINGBEE_GOOGLE_URL}?${searchParams}`,
      {},
      10000,
      parentSignal,
    );

    if (!searchResponse.ok) {
      console.log("[LOOKUP] Chewy Google search failed:", searchResponse.status);
      return { found: false, source: "chewy" };
    }

    const results = searchData?.organic_results || [];

    const chewyUrl = results.find((r: any) => r.url?.includes("chewy.com/") && r.url?.includes("/dp/"))?.url;
    if (!chewyUrl) {
      console.log("[LOOKUP] No Chewy product page found");
      return { found: false, source: "chewy" };
    }

    console.log("[LOOKUP] Chewy page:", chewyUrl);

    // Step 2: Scrape Chewy page WITH JS rendering (5 credits)
    const pageParams = new URLSearchParams({
      api_key: apiKey,
      url: chewyUrl.split("?")[0],
      render_js: "true",
      wait: "3000",
    });

    const { response: pageResponse, text: html } = await fetchTextWithLinkedTimeout(
      "Chewy page scrape",
      `${SCRAPINGBEE_API_URL}?${pageParams}`,
      {},
      20000,
      parentSignal,
    );

    if (!pageResponse.ok) {
      console.log("[LOOKUP] Chewy page scrape failed:", pageResponse.status);
      return { found: false, source: "chewy" };
    }

    const pageHtml = html || "";
    console.log(`[LOOKUP] Chewy page loaded (${pageHtml.length} chars)`);

    // Extract ingredients
    const ingredients = extractIngredientsFromHtml(pageHtml, productName);
    if (!ingredients || ingredients.list.length < 5) {
      console.log("[LOOKUP] Chewy: no ingredients extracted");
      return { found: false, source: "chewy" };
    }

    // Extract image and rating
    const imageUrl = extractProductImage(pageHtml);
    const rating = extractRating(pageHtml);

    // Extract title
    const titleMatch = pageHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const pageTitle = titleMatch?.[1]?.trim() || productName;

    const elapsed = Date.now() - t0;
    console.log(`[LOOKUP] Chewy complete (${elapsed}ms):`, ingredients.list.length, "ingredients");

    const result: ProductResult = {
      found: true,
      source: "chewy",
      productName: pageTitle,
      brand: brand || null,
      ingredients: ingredients.list,
      ingredientText: ingredients.text,
      ingredientCount: ingredients.list.length,
      sourceUrl: chewyUrl,
      imageUrl: imageUrl || null,
      rating: rating || null,
    };

    if (!validateProductMatch(result, productName, brand, petType)) {
      return { found: false, source: "chewy" };
    }

    return result;
  } catch (e) {
    const elapsed = Date.now() - t0;
    console.error(`[LOOKUP] Chewy error (${elapsed}ms):`, (e as Error).message);
    return { found: false, source: "chewy" };
  }
}

// ── Amazon Search (most accurate, 10 credits: search + product page) ─

async function searchAmazon(
  productName: string,
  brand: string | null,
  petType: "dog" | "cat",
  apiKey: string,
  parentSignal?: AbortSignal,
): Promise<ProductResult> {
  const t0 = Date.now();
  try {
    // Step 1: Search Amazon for product (5 credits — JS rendering required)
    const query = `${brand || ""} ${productName} ${petType} food`.trim();
    console.log("[LOOKUP] Amazon search:", query);

    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
    const searchParams = new URLSearchParams({
      api_key: apiKey,
      url: searchUrl,
      render_js: "true",
      wait: "2000",
    });

    const { response: searchResponse, text: searchHtmlRaw } = await fetchTextWithLinkedTimeout(
      "Amazon search",
      `${SCRAPINGBEE_API_URL}?${searchParams}`,
      {},
      15000,
      parentSignal,
    );

    if (!searchResponse.ok) {
      console.log("[LOOKUP] Amazon search failed:", searchResponse.status);
      return { found: false, source: "amazon" };
    }

    const searchHtml = searchHtmlRaw || "";

    // Extract first product ASIN from search results
    const asinMatch = searchHtml.match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch) {
      console.log("[LOOKUP] Amazon: no product ASIN found");
      return { found: false, source: "amazon" };
    }

    const asin = asinMatch[1];
    console.log("[LOOKUP] Amazon ASIN:", asin);

    // Step 2: Scrape product page (5 credits — JS rendering)
    const productParams = new URLSearchParams({
      api_key: apiKey,
      url: `https://www.amazon.com/dp/${asin}`,
      render_js: "true",
      wait: "3000",
    });

    const { response: productResponse, text: productHtml } = await fetchTextWithLinkedTimeout(
      "Amazon product page",
      `${SCRAPINGBEE_API_URL}?${productParams}`,
      {},
      18000,
      parentSignal,
    );

    if (!productResponse.ok) {
      console.log("[LOOKUP] Amazon product page failed:", productResponse.status);
      return { found: false, source: "amazon" };
    }

    const html = productHtml || "";
    const safeHtml = html.length > 500000 ? html.slice(0, 500000) : html;
    console.log(`[LOOKUP] Amazon product page: ${html.length} chars`);

    // Extract ingredients
    const ingredients = extractIngredientsFromHtml(safeHtml, productName);
    if (!ingredients || ingredients.list.length < 5) {
      console.log("[LOOKUP] Amazon: no ingredients extracted");
      return { found: false, source: "amazon" };
    }

    // Extract image
    const imageUrl = extractProductImage(safeHtml);
    // Extract rating
    const rating = extractRating(safeHtml);
    // Extract title
    const titleMatch = safeHtml.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i);
    const pageTitle = titleMatch?.[1]?.trim() || productName;

    const elapsed = Date.now() - t0;
    console.log(`[LOOKUP] Amazon complete (${elapsed}ms):`, ingredients.list.length, "ingredients");

    const result: ProductResult = {
      found: true,
      source: "amazon",
      productName: pageTitle,
      brand: brand || null,
      ingredients: ingredients.list,
      ingredientText: ingredients.text,
      ingredientCount: ingredients.list.length,
      sourceUrl: `https://www.amazon.com/dp/${asin}`,
      imageUrl: imageUrl || null,
      rating: rating || null,
    };

    if (!validateProductMatch(result, productName, brand, petType)) {
      return { found: false, source: "amazon" };
    }

    return result;
  } catch (e) {
    const elapsed = Date.now() - t0;
    console.error(`[LOOKUP] Amazon error (${elapsed}ms):`, (e as Error).message);
    return { found: false, source: "amazon" };
  }
}

// ── OPFF Search ────────────────────────────────────────────────────

async function searchOPFF(
  productName: string,
  brand: string | null,
  petType: "dog" | "cat",
  parentSignal?: AbortSignal,
): Promise<ProductResult> {
  try {
    const query = encodeURIComponent(
      brand ? `${brand} ${productName}` : productName,
    );
    const { response, data } = await fetchJsonWithLinkedTimeout(
      "OPFF search",
      `https://world.openpetfoodfacts.org/cgi/search.pl?search_terms=${query}&json=true&page_size=5`,
      {
        headers: { "User-Agent": "Woof App - pet food scanner" },
      },
      OPFF_TIMEOUT_MS,
      parentSignal,
    );

    if (!response.ok) {
      console.log("[LOOKUP] OPFF search failed — HTTP", response.status);
      return { found: false, source: "opff" };
    }

    if (!data.products?.length) {
      console.log("[LOOKUP] OPFF search — no results");
      return { found: false, source: "opff" };
    }

    const candidates: ProductResult[] = data.products
      .map((product: any) => {
        const ingredientText =
          product.ingredients_text || product.ingredients_text_en || "";
        if (!ingredientText || ingredientText.length < 10) return null;

        const ingredients = parseIngredientText(ingredientText);
        if (ingredients.length < 3) return null;

        const nutriments = product.nutriments || {};
        const matchText = [
          product.product_name,
          product.product_name_en,
          product.generic_name,
          product.generic_name_en,
          product.brands,
          product.categories,
          Array.isArray(product.categories_tags) ? product.categories_tags.join(" ") : null,
          Array.isArray(product.labels_tags) ? product.labels_tags.join(" ") : null,
          Array.isArray(product._keywords) ? product._keywords.join(" ") : null,
        ].filter(Boolean).join(" ");

        return {
          found: true,
          source: "opff",
          productName: product.product_name || product.product_name_en || productName,
          brand: product.brands || brand || "",
          ingredients,
          ingredientText,
          ingredientCount: ingredients.length,
          nutritionalInfo: {
            protein: nutriments.proteins_100g ?? nutriments.proteins ?? null,
            fat: nutriments.fat_100g ?? nutriments.fat ?? null,
            fiber: nutriments.fiber_100g ?? nutriments["crude-fiber_100g"] ?? null,
            energy: nutriments["energy-kcal_100g"] ?? nutriments.energy_100g ?? null,
          },
          barcode: product.code || null,
          sourceUrl: product.code
            ? `https://world.openpetfoodfacts.org/product/${product.code}`
            : undefined,
          matchText,
        } as ProductResult;
      })
      .filter((candidate: ProductResult | null): candidate is ProductResult => Boolean(candidate))
      .sort((a: ProductResult, b: ProductResult) => (b.ingredientCount || 0) - (a.ingredientCount || 0));

    for (const result of candidates) {
      console.log("[LOOKUP] OPFF candidate:", result.productName, "| ingredients:", result.ingredients?.length || 0);
      if (!validateProductMatch(result, productName, brand, petType)) {
        continue;
      }

      console.log("[LOOKUP] OPFF match:", result.productName, "| ingredients:", result.ingredients?.length || 0);
      return result;
    }

    console.log("[LOOKUP] OPFF search — no validated match");
    return { found: false, source: "opff" };
  } catch (e) {
    console.error("[LOOKUP] OPFF search error:", (e as Error).message);
    return { found: false, source: "opff" };
  }
}

async function searchOPFFBarcode(
  barcode: string,
  productName: string,
  brand: string | null,
  petType: "dog" | "cat",
  parentSignal?: AbortSignal,
): Promise<ProductResult> {
  if (!barcode) return { found: false, source: "opff_barcode" };
  try {
    const { response, data } = await fetchJsonWithLinkedTimeout(
      "OPFF barcode lookup",
      `https://world.openpetfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      {
        headers: { "User-Agent": "Woof App - pet food scanner" },
      },
      OPFF_TIMEOUT_MS,
      parentSignal,
    );

    if (!response.ok || data?.status === 0 || !data?.product) {
      console.log("[LOOKUP] OPFF barcode — no result:", barcode);
      return { found: false, source: "opff_barcode" };
    }

    const product = data.product;
    const ingredientText = product.ingredients_text || product.ingredients_text_en || "";
    if (!ingredientText || ingredientText.length < 10) {
      console.log("[LOOKUP] OPFF barcode — no ingredient text:", barcode);
      return { found: false, source: "opff_barcode" };
    }

    const ingredients = parseIngredientText(ingredientText);
    if (ingredients.length < 3) {
      console.log("[LOOKUP] OPFF barcode — sparse ingredients:", barcode);
      return { found: false, source: "opff_barcode" };
    }

    const nutriments = product.nutriments || {};
    const matchText = [
      product.product_name,
      product.product_name_en,
      product.generic_name,
      product.generic_name_en,
      product.brands,
      product.categories,
      Array.isArray(product.categories_tags) ? product.categories_tags.join(" ") : null,
      Array.isArray(product.labels_tags) ? product.labels_tags.join(" ") : null,
      Array.isArray(product._keywords) ? product._keywords.join(" ") : null,
    ].filter(Boolean).join(" ");

    const result: ProductResult = {
      found: true,
      source: "opff_barcode",
      productName: product.product_name || product.product_name_en || productName,
      brand: product.brands || brand || "",
      ingredients,
      ingredientText,
      ingredientCount: ingredients.length,
      nutritionalInfo: {
        protein: nutriments.proteins_100g ?? nutriments.proteins ?? null,
        fat: nutriments.fat_100g ?? nutriments.fat ?? null,
        fiber: nutriments.fiber_100g ?? nutriments["crude-fiber_100g"] ?? null,
        energy: nutriments["energy-kcal_100g"] ?? nutriments.energy_100g ?? null,
      },
      barcode,
      sourceUrl: `https://world.openpetfoodfacts.org/product/${encodeURIComponent(barcode)}`,
      matchText,
    };

    if (!validateProductMatch(result, productName, brand, petType)) {
      console.log("[LOOKUP] OPFF barcode — rejected product mismatch:", barcode);
      return { found: false, source: "opff_barcode" };
    }

    console.log("[LOOKUP] OPFF barcode match:", result.productName, "| ingredients:", ingredients.length);
    return result;
  } catch (e) {
    console.error("[LOOKUP] OPFF barcode error:", (e as Error).message);
    return { found: false, source: "opff_barcode" };
  }
}

// ── Pick Best Result ───────────────────────────────────────────────

function pickBestResult(results: ProductResult[], productName: string): ProductResult | null {
  const valid = results.filter(
    (r) => r.found && r.ingredients && r.ingredients.length >= 5,
  );
  if (valid.length === 0) return null;

  // Extract flavor keywords from product name
  const nameLower = productName.toLowerCase();
  const flavorWords = ["chicken", "beef", "salmon", "turkey", "lamb", "duck", "venison",
    "rabbit", "fish", "whitefish", "pork", "bison", "buffalo", "tuna"];
  const requestedFlavors = flavorWords.filter((f) => nameLower.includes(f));

  // Score each result: flavor match in top ingredients is critical
  const scored = valid.map((r) => {
    const topIngLower = (r.ingredients || []).slice(0, 5).join(" ").toLowerCase();
    let score = 0;

    // Flavor match in top 5 ingredients (most important)
    for (const flavor of requestedFlavors) {
      if (topIngLower.includes(flavor)) score += 20;
    }

    // Hard penalty: if a DIFFERENT protein is the FIRST real ingredient (skip water/broth)
    // This catches cases like requesting chicken but getting beef
    const realFirstIng = (r.ingredients || []).find((ing) => {
      const l = ing.toLowerCase();
      return !l.includes("water") && !l.includes("broth") && !l.includes("stock");
    })?.toLowerCase() || "";
    for (const flavor of flavorWords) {
      if (!requestedFlavors.includes(flavor) && realFirstIng.startsWith(flavor)) {
        score -= 100; // Wrong protein variant
      }
    }

    // Source priority bonus
    const sourcePriority: Record<string, number> = { amazon: 8, chewy: 7, dfa: 5, cfa: 5, cats: 4, web: 3, opff: 1 };
    score += sourcePriority[r.source] || 0;

    // Ingredient count bonus (more complete = better)
    score += Math.min(r.ingredientCount || 0, 50) / 10;

    return { result: r, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  console.log(`[LOOKUP] pickBestResult: ${scored.length} candidates, best: ${best?.result.source} (score: ${best?.score.toFixed(1)}), flavors: [${requestedFlavors.join(",")}]`);

  // Only reject if the best candidate is definitively wrong (hard penalty applied)
  if (!best || best.score < -50) {
    console.log(`[LOOKUP] All candidates rejected (best score: ${best?.score.toFixed(1)}) — wrong flavor/variant`);
    return null;
  }

  return best.result;
}

// ── Concurrent-request dedup ───────────────────────────────────────
// Two clients hitting the same product within seconds shouldn't both spend
// ScrapingBee credits — the second waits for the first's payload.
// Per-instance only (Deno isolates), but cuts the worst case meaningfully.
const _inflight = new Map<string, Promise<Record<string, unknown>>>();
const INFLIGHT_TTL_MS = 60_000;

// ── Main Handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (body: Record<string, unknown>, status = 200): Response =>
    makeJsonResponse(body, status, corsHeaders || BASE_CORS_HEADERS);

  if (!corsHeaders) {
    return jsonResponse({ error: "Origin not allowed" }, 403);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: "Request body too large" }, 413);
  }

  // ── Auth + rate limiting ─────────────────────────────────────────

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const scrapingBeeKey = Deno.env.get("SCRAPINGBEE_API_KEY") || "";

  let isServiceRole = false;
  let isAuthenticated = false;
  let authenticatedUserId: string | null = null;

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token) {
      if (token === supabaseServiceKey) {
        isServiceRole = true;
      } else {
        try {
          const { data: { user }, error: authError } = await runSupabaseQuery(
            "Auth user lookup",
            PRODUCT_LOOKUP_DB_TIMEOUT_MS,
            req.signal,
            () => supabase.auth.getUser(token),
          );
          if (!authError && user) {
            isAuthenticated = true;
            authenticatedUserId = user.id;
          } else {
            console.log("[LOOKUP] Auth failed (non-blocking):", authError?.message);
          }
        } catch (err) {
          console.log("[LOOKUP] Auth parsing failed (non-blocking):", (err as Error).message);
        }
      }
    }
  }

  // Rate limit anonymous requests (not authenticated, not service role)
  // Protects ScrapingBee credits from abuse
  if (!isServiceRole && isAuthenticated && authenticatedUserId) {
    const { data: allowed, error: rlError } = await runSupabaseQuery(
      "Authenticated product lookup rate limit",
      PRODUCT_LOOKUP_DB_TIMEOUT_MS,
      req.signal,
      (signal) => supabase.rpc(
        "check_ip_rate_limit",
        {
          p_ip_address: `user-product-lookup:${authenticatedUserId}`,
          p_max_requests: AUTH_PRODUCT_LOOKUP_RATE_LIMIT_PER_HOUR,
          p_window_minutes: 60,
        },
      ).abortSignal(signal),
    );

    if (rlError) {
      console.error("[LOOKUP] Authenticated rate limit check failed:", rlError.message);
      return jsonResponse({ error: "Rate limit unavailable. Please try again." }, 503);
    } else if (allowed === false) {
      console.log("[LOOKUP] Authenticated rate limited:", authenticatedUserId);
      return jsonResponse(
        { error: "Product lookup rate limit exceeded. Please try again later." },
        429,
      );
    }
  } else if (!isServiceRole && !isAuthenticated) {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (clientIp === "unknown") {
      return jsonResponse({ error: "Unable to verify request origin" }, 403);
    }

    const { data: allowed, error: rlError } = await runSupabaseQuery(
      "Anonymous product lookup rate limit",
      PRODUCT_LOOKUP_DB_TIMEOUT_MS,
      req.signal,
      (signal) => supabase.rpc(
        "check_ip_rate_limit",
        { p_ip_address: clientIp, p_max_requests: 10, p_window_minutes: 60 },
      ).abortSignal(signal),
    );

    if (rlError) {
      console.error("[LOOKUP] IP rate limit check failed:", rlError.message);
      return jsonResponse({ error: "Rate limit unavailable. Please try again." }, 503);
    } else if (allowed === false) {
      console.log("[LOOKUP] IP rate limited:", clientIp);
      return jsonResponse(
        { error: "Rate limit exceeded. Please try again later." },
        429,
      );
    }
  }

  // ── Parse request ──────────────────────────────────────────────

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  const brand =
    typeof body.brand === "string" && body.brand.trim()
      ? body.brand.trim()
      : null;
  const { searchTerms, petType: rawPetType } = body;
  const barcode = normalizeBarcode(body.barcode);

  if (!productName || productName.length < 3) {
    return jsonResponse({ error: "productName is required (min 3 chars)" }, 400);
  }
  if (productName.length > MAX_PRODUCT_LOOKUP_NAME_LENGTH) {
    return jsonResponse({ error: "productName too long (max 200 chars)" }, 400);
  }
  if (brand && brand.length > MAX_LOOKUP_BRAND_LENGTH) {
    return jsonResponse({ error: "brand too long (max 100 chars)" }, 400);
  }

  const petType = detectPetType(productName, brand, rawPetType);
  console.log("[LOOKUP] Request:", productName, "| brand:", brand, "| petType:", petType, barcode ? `| barcode: ${barcode}` : "");

  // ── Layer 1: Check product_data cache ──────────────────────────

  const lookupCacheKeys = collectLookupCacheKeys(productName, brand, searchTerms);
  const cacheKey = lookupCacheKeys[0] || normalizeForCache(
    brand ? `${brand} ${productName}` : productName,
  );

  try {
    const { data: cachedRows, error: cacheError } = await runSupabaseQuery(
      "Product data cache lookup",
      PRODUCT_LOOKUP_CACHE_READ_TIMEOUT_MS,
      req.signal,
      (signal) => supabase
        .from("product_data")
        .select("*")
        .in("cache_key", lookupCacheKeys)
        .gt("expires_at", new Date().toISOString())
        .order("ingredient_count", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(Math.min(lookupCacheKeys.length * 5, 25))
        .abortSignal(signal),
    );

    if (cacheError) {
      console.log("[LOOKUP] Cache check error:", cacheError.message);
    } else {
      for (const cached of cachedRows || []) {
        const cachedIngredients = Array.isArray(cached?.ingredients) ? cached.ingredients : [];
        const cleanCachedIngredients = sanitizeIngredientList(cachedIngredients);
        const cleanCachedIngredientText = cleanCachedIngredients.join(", ");
        if (cleanCachedIngredients.length >= 5 && isPlausibleIngredientList(cachedIngredients)) {
          const cachedResult: ProductResult = {
            found: true,
            source: cached.source || "cache",
            productName: cached.product_name,
            brand: cached.brand,
            ingredients: cleanCachedIngredients,
            ingredientText: cleanCachedIngredientText,
            ingredientCount: cleanCachedIngredients.length,
            nutritionalInfo: cached.nutritional_info,
            sourceUrl: cached.source_url,
            imageUrl: cached.image_url || null,
            rating: null,
            servedFromCache: true,
          };
          if (!validateProductMatch(cachedResult, productName, brand, petType)) {
            console.log("[LOOKUP] Rejecting cached row — product match failed:", cacheKey, cached.product_name);
            continue;
          }
          if (isLikelyNonProductCatalogRow(cachedResult.productName, cachedResult.brand)) {
            console.log("[LOOKUP] Rejecting cached row — non-product catalog page:", cacheKey, cached.product_name);
            continue;
          }

          const hitCacheKey = cached.cache_key || cacheKey;
          console.log("[LOOKUP] Cache HIT:", hitCacheKey, "| ingredients:", cleanCachedIngredients.length);
          return jsonResponse({
            found: true,
            source: cachedResult.source,
            servedFromCache: true,
            cacheKey: hitCacheKey,
            productName: cachedResult.productName,
            brand: cachedResult.brand,
            ingredients: cachedResult.ingredients,
            ingredientText: cachedResult.ingredientText,
            ingredientCount: cachedResult.ingredientCount,
            nutritionalInfo: cachedResult.nutritionalInfo,
            sourceUrl: cachedResult.sourceUrl,
            imageUrl: cachedResult.imageUrl,
            rating: cachedResult.rating,
          });
        }

        console.log("[LOOKUP] Rejecting cached row — ingredient list failed plausibility check:", cacheKey, cachedIngredients.length);
        continue;
      }
    }
  } catch (e) {
    console.log("[LOOKUP] Cache check error:", (e as Error).message);
  }

  // ── Concurrent dedup: if another request for this exact cacheKey is mid-flight,
  // await its payload so we don't burn duplicate ScrapingBee credits.
  const inflight = _inflight.get(cacheKey);
  if (inflight) {
    console.log("[LOOKUP] Reusing in-flight request for:", cacheKey);
    try {
      const payload = await inflight;
      return jsonResponse(payload);
    } catch {
      // Fall through to fresh lookup if the in-flight request errored.
    }
  }

  const lookupPromise = (async (): Promise<Record<string, unknown>> => {
  // ── Tiered lookup: Amazon first (most accurate), then fallbacks ──

  let best: ProductResult | null = null;
  try {
    if (barcode) {
      const barcodeResult = await searchOPFFBarcode(barcode, productName, brand, petType, req.signal);
      best = pickBestResult([barcodeResult], productName);
    }

  if (!best && scrapingBeeKey) {
    // TIER 1: Amazon + OPFF in parallel (Amazon is most reliable)
    console.log("[LOOKUP] Tier 1: Amazon + OPFF");
    const tier1 = await Promise.allSettled([
      searchAmazon(productName, brand, petType, scrapingBeeKey, req.signal),
      searchOPFF(productName, brand, petType, req.signal),
    ]);

    const tier1Results = tier1.map((s) =>
      s.status === "fulfilled" ? s.value : ({ found: false, source: "error" } as ProductResult),
    );

    best = pickBestResult(tier1Results, productName);

    // TIER 2: If Amazon/OPFF failed, try DFA/CFA + universal
    if (!best) {
      console.log("[LOOKUP] Tier 1 failed — trying Tier 2: DFA/CFA + universal");
      const siteConfigs = SITE_CONFIGS[petType] || SITE_CONFIGS.dog;
      const tier2Promises: Promise<ProductResult>[] = siteConfigs.map(
        (config) => scrapeViaGoogle(config, productName, brand, scrapingBeeKey, req.signal),
      );
      tier2Promises.push(universalIngredientSearch(productName, brand, petType, scrapingBeeKey, req.signal));

      const tier2 = await Promise.allSettled(tier2Promises);
      const tier2Results = tier2.map((s) =>
        s.status === "fulfilled" ? s.value : ({ found: false, source: "error" } as ProductResult),
      );

      best = pickBestResult(tier2Results, productName);
    }
  } else if (!best) {
    // No ScrapingBee key — OPFF only
    console.log("[LOOKUP] OPFF only (no ScrapingBee key)");
    const opffResult = await searchOPFF(productName, brand, petType, req.signal);
    best = pickBestResult([opffResult], productName);
  }

  } catch (lookupErr) {
    console.error("[LOOKUP] Lookup error:", (lookupErr as Error).message);
  }

  if (!best) {
    console.log("[LOOKUP] No catalog ingredient data found for:", productName, `(${petType})`);
    return {
      found: false,
      reason: "no_verified_data",
      petType,
    };
  }

  // Final sanity gate: even if a scraper said it found something, refuse to cache
  // results whose ingredient list looks like junk (page chrome, JSON, etc.).
  const cleanIngredients = sanitizeIngredientList(best.ingredients || []);
  const cleanIngredientText = cleanIngredients.join(", ");
  if (cleanIngredients.length < 5 || !isPlausibleIngredientList(best.ingredients || [])) {
    console.log("[LOOKUP] Rejecting result — ingredient list failed plausibility check:", best.source, best.ingredients?.length);
    return {
      found: false,
      reason: "implausible_ingredients",
      petType,
    };
  }

  // ── Cache the result (90-day TTL) — AWAITED so concurrent writes don't race ──
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const displayProductName = cleanDisplayText(best.productName || productName) || productName;
  const displayBrand = cleanDisplayText(best.brand || brand || "") || null;
  if (isLikelyNonProductCatalogRow(displayProductName, displayBrand)) {
    console.log("[LOOKUP] Rejecting result — non-product catalog page:", best.source, displayProductName);
    return {
      found: false,
      reason: "non_product_catalog_page",
      petType,
    };
  }
  try {
    const { error } = await runSupabaseQuery(
      "Product data cache write",
      PRODUCT_LOOKUP_CACHE_WRITE_TIMEOUT_MS,
      req.signal,
      (signal) => supabase
        .from("product_data")
        .upsert(
          {
            cache_key: cacheKey,
            product_name: displayProductName,
            brand: displayBrand,
            ingredients: cleanIngredients,
            ingredient_text: cleanIngredientText,
            ingredient_count: cleanIngredients.length,
            nutritional_info: best.nutritionalInfo || null,
            source: best.source,
            source_url: best.sourceUrl || null,
            image_url: best.imageUrl || null,
            scraped_at: new Date().toISOString(),
            expires_at: expiresAt,
          },
          { onConflict: "cache_key" },
        )
        .abortSignal(signal),
    );
    if (error) console.error("[LOOKUP] Cache write failed:", error.message);
    else console.log("[LOOKUP] Cached:", cacheKey);
  } catch (writeErr) {
    console.error("[LOOKUP] Cache write error:", (writeErr as Error).message);
  }

  console.log("[LOOKUP] Result:", best.source, "|", cleanIngredients.length, "ingredients |", best.productName);

  return {
    found: true,
    source: best.source,
    cacheKey,
    productName: displayProductName,
    brand: displayBrand,
    ingredients: cleanIngredients,
    ingredientText: cleanIngredientText,
    ingredientCount: cleanIngredients.length,
    nutritionalInfo: best.nutritionalInfo,
    sourceUrl: best.sourceUrl,
    barcode: best.barcode || barcode || null,
    imageUrl: best.imageUrl || null,
    rating: best.rating || null,
  };
  })(); // end lookupPromise IIFE

  // Register this in-flight work so concurrent callers can dedup to it.
  _inflight.set(cacheKey, lookupPromise);
  // Auto-cleanup after TTL so the map doesn't grow unbounded.
  setTimeout(() => { _inflight.delete(cacheKey); }, INFLIGHT_TTL_MS);
  // Also clear the slot once the work resolves — by then the DB row exists,
  // so the next caller hits the cache path at the top of the handler.
  lookupPromise.finally(() => _inflight.delete(cacheKey));

  const payload = await lookupPromise;
  return jsonResponse(payload);
});
