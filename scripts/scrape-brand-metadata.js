#!/usr/bin/env node
/**
 * scrape-brand-metadata.js — ScrapingBee + GPT pipeline that enriches
 * brand_metadata for brands in product_data not yet hand-seeded.
 *
 * Flow per brand:
 *   1. Google via ScrapingBee: "{brand} pet food quality testing manufacturing"
 *   2. Pick top 3-5 pages; scrape each with ScrapingBee (JS rendering for
 *      known JS-heavy domains).
 *   3. Concatenate stripped text; feed to GPT-4o-mini with an extraction prompt
 *      that returns a brand_metadata-shaped JSON object.
 *   4. Upsert. Confidence derived from source quality (page count, brand-page
 *      present, explicit certifications found).
 *
 * Safe defaults:
 *   --limit=50   only process 50 brands per run (checkpointing not strictly
 *                needed since the brand list is filtered by "not in metadata yet")
 *   --min-scans=5 only pull brands with ≥5 scans (skip noise)
 *   --budget=5000  abort once approx ScrapingBee credits used reach N
 *
 * Usage:
 *   node scripts/scrape-brand-metadata.js --dry-run --limit=3
 *   node scripts/scrape-brand-metadata.js --limit=100 --budget=3000
 *   node scripts/scrape-brand-metadata.js --brand="Nom Nom"
 *
 * Env:
 *   SBKEY (ScrapingBee), OKEY (OpenAI), SUPABASE_SERVICE_ROLE_KEY (Supabase writes)
 */

const SB_URL = process.env.SUPABASE_URL;
// Same defaults as scripts/mega-scraper/lib.js so env vars are optional. Override
// via SBKEY/OKEY env if you want to swap keys without editing code.
const SBKEY = process.env.SBKEY;
const OKEY = process.env.OKEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = true] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const DRY_RUN = !!args["dry-run"];
const LIMIT = parseInt(args.limit || "50");
const MIN_SCANS = parseInt(args["min-scans"] || "1");
const BUDGET_CREDITS = parseInt(args.budget || "5000");
const SINGLE_BRAND = args.brand;

const JS_HEAVY = new Set([
  "royalcanin.com", "purina.com", "hillspet.com", "bluebuffalo.com",
  "iams.com", "nutro.com", "pedigree.com", "chewy.com", "amazon.com",
  "walmart.com", "target.com", "petsmart.com", "petco.com",
]);

const BLOCKED = new Set([
  "google.com", "youtube.com", "facebook.com", "reddit.com",
  "instagram.com", "tiktok.com", "pinterest.com", "twitter.com", "x.com",
]);

// Rough credit tracking — ScrapingBee bills ~1 credit for static, ~5 for JS.
// This is an estimate; actual billing comes from their dashboard.
let creditsSpent = 0;

function normalizeBrand(s) {
  return s
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|®|™|\u00ae|\u2122/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Supabase helpers ─────────────────────────────────────────────────

async function getBrandsNeedingMetadata() {
  if (SINGLE_BRAND) {
    return [{ brand: SINGLE_BRAND, product_count: 1 }];
  }

  // Use the get_brands_needing_metadata RPC (migration 019). Does the JOIN +
  // aggregation server-side instead of pulling 10k rows and filtering in Node.
  const r = await fetch(`${SB_URL}/rest/v1/rpc/get_brands_needing_metadata`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_min_scans: MIN_SCANS, p_limit: LIMIT }),
  });

  if (!r.ok) {
    console.log(`[db] get_brands_needing_metadata RPC failed (${r.status}), falling back to client-side filter`);
    return getBrandsNeedingMetadataFallback();
  }
  return r.json();
}

async function getBrandsNeedingMetadataFallback() {
  // Simpler: pull all product_data brands, then filter against existing brand_metadata.
  const pd = await fetch(
    `${SB_URL}/rest/v1/product_data?select=brand&brand=not.is.null&limit=10000`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  ).then((r) => r.json());

  const bm = await fetch(
    `${SB_URL}/rest/v1/brand_metadata?select=brand_normalized`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  ).then((r) => r.json());

  const have = new Set(bm.map((b) => b.brand_normalized));
  const counts = new Map();
  for (const row of pd) {
    const brand = (row.brand || "").trim();
    if (!brand) continue;
    const norm = normalizeBrand(brand);
    if (have.has(norm)) continue;
    counts.set(brand, (counts.get(brand) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_SCANS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMIT)
    .map(([brand, product_count]) => ({ brand, product_count }));
}

async function upsert(record) {
  if (DRY_RUN) return { dry: true };
  const url = `${SB_URL}/rest/v1/brand_metadata?on_conflict=brand_normalized`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(record),
  });
  if (!r.ok) return { error: `${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
  return { ok: true };
}

// ── ScrapingBee helpers ──────────────────────────────────────────────

async function googleSearch(query, numResults = 6) {
  const params = new URLSearchParams({ api_key: SBKEY, search: query, nb_results: String(numResults) });
  const url = `https://app.scrapingbee.com/api/v1/store/google?${params}`;
  creditsSpent += 1; // rough
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  const d = await r.json();
  return (d?.organic_results || [])
    .filter((r) => r.url && ![...BLOCKED].some((b) => r.url.includes(b)))
    .map((r) => ({ url: r.url.split("?")[0], title: r.title || "" }))
    .slice(0, numResults);
}

async function scrapePage(url) {
  const needsJs = [...JS_HEAVY].some((d) => url.includes(d));
  const params = new URLSearchParams({
    api_key: SBKEY,
    url,
    render_js: needsJs ? "true" : "false",
    ...(needsJs && { wait: "2500" }),
  });
  creditsSpent += needsJs ? 5 : 1;
  try {
    const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
      signal: AbortSignal.timeout(needsJs ? 30000 : 18000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    if (html.length < 300) return null;
    return html.length > 500_000 ? html.slice(0, 500_000) : html;
  } catch {
    return null;
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000); // cap per-page so GPT prompt stays manageable
}

// ── GPT extraction ───────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are extracting pet food brand quality information from web pages. Return ONE JSON object matching this exact schema:

{
  "primary_processing": "freeze-dried" | "air-dried" | "raw" | "cold-pressed" | "baked" | "extruded" | "canned" | "unknown",
  "processing_methods": ["extruded"],
  "testing_transparency": "high" | "moderate" | "low" | "unknown",
  "testing_details": "ONE short sentence (≤30 words) summarizing testing practices",
  "certifications": ["SQF", "BRC", "HACCP", "AAFCO feed trials", "Human-Grade (FDA)", "ISO 9001", "Certified Humane", "HPP-processed"],
  "third_party_tested": true | false | null,
  "country_of_manufacture": "USA" | "Canada" | "Italy" | etc,
  "owns_facility": true | false | null,
  "website_url": "https://...",
  "confidence": 0.0-1.0
}

CRITERIA:
- "primary_processing": the method most products in this brand use. For typical dry kibble = "extruded". "freeze-dried", "air-dried", "raw", "baked" ONLY when clearly stated in the content.
- "testing_transparency":
  - "high" if brand publishes lab results / has SQF/BRC certification / discloses 3rd-party testing
  - "moderate" if brand mentions testing but doesn't publish specifics
  - "low" if no public testing information found
  - "unknown" if pages didn't discuss testing at all
- "certifications": include ONLY those explicitly mentioned in the content.
- "third_party_tested": true ONLY if content explicitly says third-party or independent lab testing. null if not mentioned.
- "owns_facility": true if brand owns/operates manufacturing, false if co-packed, null if unclear.
- "confidence": your confidence in the extraction (0.5 for thin/uncertain sources, 0.9 for rich brand-page content).

Return ONLY the JSON object, no code fences, no commentary.`;

async function gptExtract(brandName, combinedText) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OKEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 500,
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        {
          role: "user",
          content: `Brand: ${brandName}\n\nPage content (concatenated from up to 5 pages):\n\n${combinedText.slice(0, 20000)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return null;
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  let cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > 0) {
      try { return JSON.parse(cleaned.slice(0, lastBrace + 1)); }
      catch { return null; }
    }
    return null;
  }
}

// ── Per-brand runner ─────────────────────────────────────────────────

async function runBrand(brandName, productCount) {
  console.log(`\n── ${brandName} (${productCount} products, ${creditsSpent} credits spent)`);

  // 1. Google search
  const query = `${brandName} pet food quality testing manufacturing`;
  const searchResults = await googleSearch(query, 6);
  if (searchResults.length === 0) {
    console.log(`  [search] no results — skipping`);
    return { skip: true, reason: "no search results" };
  }
  console.log(`  [search] ${searchResults.length} candidate pages`);

  // 2. Scrape the top pages (target 3 useful pages).
  const pagesText = [];
  const scrapedUrls = [];
  for (const result of searchResults) {
    if (pagesText.length >= 3) break;
    const html = await scrapePage(result.url);
    if (!html) continue;
    const text = stripHtml(html);
    if (text.length < 500) continue; // Too thin, move on
    pagesText.push(`=== SOURCE: ${result.url} ===\n${text}`);
    scrapedUrls.push(result.url);
    console.log(`  [scrape] ${result.url.slice(0, 80)} (${text.length}ch)`);
  }

  if (pagesText.length === 0) {
    return { skip: true, reason: "no scrapable content" };
  }

  // 3. GPT extract
  const extracted = await gptExtract(brandName, pagesText.join("\n\n"));
  if (!extracted) {
    return { skip: true, reason: "gpt extraction failed" };
  }

  // 4. Build the record
  const record = {
    brand_normalized: normalizeBrand(brandName),
    brand_display: brandName,
    processing_methods: extracted.processing_methods || [extracted.primary_processing].filter(Boolean),
    primary_processing: extracted.primary_processing || "unknown",
    testing_transparency: extracted.testing_transparency || "unknown",
    testing_details: extracted.testing_details || null,
    certifications: extracted.certifications || [],
    third_party_tested: extracted.third_party_tested ?? null,
    country_of_manufacture: extracted.country_of_manufacture || null,
    owns_facility: extracted.owns_facility ?? null,
    website_url: extracted.website_url || (scrapedUrls[0] ? new URL(scrapedUrls[0]).origin : null),
    quality_page_url: scrapedUrls[0] || null,
    source: "scrape",
    confidence: Math.min(1, Math.max(0, extracted.confidence ?? 0.6)),
    last_scraped_at: new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`  [extract]`, JSON.stringify({
      proc: record.primary_processing,
      testing: record.testing_transparency,
      certs: record.certifications,
      country: record.country_of_manufacture,
      conf: record.confidence,
    }));
    return { ok: true, record };
  }

  const res = await upsert(record);
  if (res.error) {
    console.log(`  [upsert] FAIL: ${res.error}`);
    return { fail: true, reason: res.error };
  }
  console.log(`  [upsert] ok — proc=${record.primary_processing}  testing=${record.testing_transparency}  conf=${record.confidence}`);
  return { ok: true };
}

// ── Main ─────────────────────────────────────────────────────────────

(async () => {
  if (!DRY_RUN && (!SBKEY || !OKEY || !SERVICE_ROLE_KEY)) {
    console.error("✗ Missing env: SBKEY, OKEY, SUPABASE_SERVICE_ROLE_KEY required for non-dry run.");
    process.exit(1);
  }

  console.log(`\n=== Brand metadata scrape ===`);
  console.log(`  Limit:      ${LIMIT} brands`);
  console.log(`  Min scans:  ${MIN_SCANS}`);
  console.log(`  Budget:     ~${BUDGET_CREDITS} credits`);
  console.log(`  Dry run:    ${DRY_RUN}`);

  const brands = await getBrandsNeedingMetadata();
  console.log(`  Found:      ${brands.length} brands needing metadata`);

  let okCount = 0, failCount = 0, skipCount = 0;
  for (const b of brands) {
    if (creditsSpent >= BUDGET_CREDITS) {
      console.log(`\n[STOP] Credit budget reached: ${creditsSpent}/${BUDGET_CREDITS}`);
      break;
    }
    try {
      const res = await runBrand(b.brand, b.product_count);
      if (res.ok) okCount++;
      else if (res.skip) { skipCount++; console.log(`  [skip] ${res.reason}`); }
      else if (res.fail) failCount++;
    } catch (err) {
      failCount++;
      console.log(`  [ERROR] ${err.message}`);
    }
    // Gentle pacing
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== Done ===`);
  console.log(`  Upserted: ${okCount}   Skipped: ${skipCount}   Failed: ${failCount}`);
  console.log(`  Credits used (approx): ${creditsSpent}`);
})().catch((err) => {
  console.error("\n✗ Fatal:", err.message);
  process.exit(1);
});
