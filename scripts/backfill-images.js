#!/usr/bin/env node
/**
 * Backfill image_url for every product missing one.
 *
 * Cascade per product:
 *   1. Google Images search via ScrapingBee → list of {landing_url, thumb_data_uri}
 *   2. For the top few landings, scrape with extract_rules for og:image (direct CDN URL)
 *   3. Fallback to base64 thumbnail as data URI (guarantees every product gets something)
 *
 * Credits per product: ~1 (search) + 1-5 (scrape, JS-heavy sites cost 5). Target mix: ~3.
 *
 * Resumable: each batch re-queries `image_url IS NULL`, so ctrl-C is safe.
 *
 * Run: node scripts/backfill-images.js [--limit=N] [--dry-run] [--no-fallback]
 */

const SBKEY = process.env.SBKEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const args = Object.fromEntries(
  process.argv.slice(2).map(a => a.split("=")).map(([k, v]) => [k.replace(/^--/, ""), v ?? true])
);
const LIMIT = args.limit ? parseInt(args.limit) : Infinity;
const DRY_RUN = !!args["dry-run"];
const NO_FALLBACK = !!args["no-fallback"];

const PAGE_SIZE = 60;
const CONCURRENCY = 4;
const LANDING_PARALLEL = 3; // scrape top-3 landings simultaneously, first success wins
const SEARCH_TIMEOUT_MS = 25000;
const SCRAPE_TIMEOUT_MS = 35000;

// Sites that need JS render or reliably block plain scrapes.
const JS_HEAVY = /chewy\.com|amazon\.com|petsmart\.com|petco\.com|bluebuffalo\.com|royalcanin\.com|purina\.com|hillspet\.com/i;

// Names that look like articles / tests / scraped junk rather than real products.
// Tightened: removed the bare colon match (was flagging real foreign names like
// "Adult Multicroquettes 'à la volaille': 40% du mélange"). Still catches article
// titles, test rows, review roundups, and anything ending in ".com".
const JUNK_NAME = /^(rpc test\b|test\s|\d+\s+best\b|\d+\s+top\b|best\s+\d+)|\s+(review|roundup|we tested)\b|\.com\b/i;

// ── DB helpers ──────────────────────────────────────────────────────

async function fetchMissingBatch() {
  const r = await fetch(
    `${SB_URL}/rest/v1/product_data?select=cache_key,product_name,brand,ingredients,ingredient_text,ingredient_count,source&image_url=is.null&order=cache_key&limit=${PAGE_SIZE}`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!r.ok) throw new Error(`fetchMissingBatch: ${r.status}`);
  return r.json();
}

async function countMissing() {
  const r = await fetch(
    `${SB_URL}/rest/v1/product_data?select=cache_key&image_url=is.null&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: "count=exact" } }
  );
  return parseInt(r.headers.get("content-range")?.split("/")[1] || "0");
}

async function saveImage(row, imageUrl) {
  // save_product_data upserts — we pass all existing fields so only image_url actually changes.
  const r = await fetch(`${SB_URL}/rest/v1/rpc/save_product_data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify({
      p_cache_key: row.cache_key,
      p_product_name: row.product_name || "",
      p_brand: row.brand || "",
      p_ingredients: row.ingredients || [],
      p_ingredient_text: row.ingredient_text || "",
      p_ingredient_count: row.ingredient_count || 0,
      p_source: row.source || "web_verified",
      p_image_url: imageUrl,
    }),
  });
  return r.ok;
}

// ── ScrapingBee ─────────────────────────────────────────────────────

async function googleImageSearch(query) {
  const params = new URLSearchParams({
    api_key: SBKEY,
    search: query,
    search_type: "images",
    nb_results: "8",
  });
  const r = await fetch(`https://app.scrapingbee.com/api/v1/store/google?${params}`, {
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  }).catch(() => null);
  if (!r || !r.ok) return [];
  const d = await r.json().catch(() => null);
  const imgs = (d?.images || []).filter(i => i.url);
  return imgs.map(i => ({ landing: i.url, thumb: i.image, domain: i.domain }));
}

async function scrapeOgImage(url) {
  const needsJs = JS_HEAVY.test(url);
  const params = new URLSearchParams({
    api_key: SBKEY,
    url,
    render_js: needsJs ? "true" : "false",
  });
  params.append("extract_rules", JSON.stringify({
    og_image: 'meta[property="og:image"]@content',
    twitter_image: 'meta[name="twitter:image"]@content',
  }));
  if (needsJs) params.set("wait", "2000");

  const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
    signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const d = await r.json().catch(() => null);
  if (!d) return null;
  const candidate = d.og_image || d.twitter_image;
  if (!candidate || typeof candidate !== "string") return null;
  if (!/^https?:\/\//.test(candidate)) return null;
  if (/\.svg(\?|$)/i.test(candidate)) return null;
  if (candidate.length > 2000) return null;
  return candidate;
}

// ── Image discovery ─────────────────────────────────────────────────

async function findImage(row) {
  const brand = (row.brand || "").trim();
  const name = (row.product_name || "").trim();
  if (!name) return null;
  const query = brand && !name.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${name} pet food`
    : `${name} pet food`;

  const results = await googleImageSearch(query);
  if (results.length === 0) return null;

  // Parallel: scrape top landings simultaneously, first success wins.
  // ~3× faster than serial when the first landing fails (Chewy blocks etc).
  const topN = results.slice(0, LANDING_PARALLEL);
  const scrapes = topN.map((r, i) =>
    scrapeOgImage(r.landing).then(og =>
      og ? { url: og, source: `og:${r.domain}`, rank: i } : null
    )
  );
  const firstHit = await Promise.any(
    scrapes.map(p => p.then(v => v ?? Promise.reject()))
  ).catch(() => null);
  if (firstHit) return firstHit;

  // Fallback: scan ALL results (not just [0]) for a base64 thumbnail.
  // Guarantees every real product gets something when og:image extraction fails.
  if (!NO_FALLBACK) {
    for (const r of results) {
      if (r.thumb?.startsWith("data:image")) {
        return { url: r.thumb, source: `thumb:${r.domain}` };
      }
    }
  }
  return null;
}

// ── Pool ────────────────────────────────────────────────────────────

async function processWithPool(items, worker, concurrency) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await worker(items[i], i); }
      catch (e) { results[i] = { error: e.message }; }
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const total = await countMissing();
  console.log(`▶ ${total} products missing image_url`);
  if (DRY_RUN) console.log("▶ DRY RUN — no DB writes");
  if (NO_FALLBACK) console.log("▶ No-fallback mode — og:image only, skip base64 thumbnails");
  if (Number.isFinite(LIMIT)) console.log(`▶ Limit: ${LIMIT}`);
  console.log("");

  // Track cache_keys we've already tried this run so empty/junk rows don't get
  // re-processed across batches (they stay in the IS-NULL set forever and
  // would otherwise burn credits on every batch query).
  const seen = new Set();
  let processed = 0, savedOg = 0, savedThumb = 0, noImage = 0, junk = 0, errors = 0;
  const started = Date.now();

  while (processed < LIMIT) {
    const batch = await fetchMissingBatch();
    if (batch.length === 0) break;

    // Filter out cache_keys we've already processed this run.
    // Stops us re-hitting ScrapingBee on empty/junk rows that persist in the IS-NULL set.
    const fresh = batch.filter(r => !seen.has(r.cache_key));
    if (fresh.length === 0) {
      console.log("▶ Entire batch was already-tried rows — all remaining rows have been attempted. Exiting.");
      break;
    }
    for (const r of fresh) seen.add(r.cache_key);

    const take = Math.min(fresh.length, LIMIT - processed);
    const slice = fresh.slice(0, take);

    const results = await processWithPool(slice, async (row) => {
      if (JUNK_NAME.test(row.product_name || "")) {
        return { row, status: "junk-name" };
      }
      const found = await findImage(row);
      if (!found) return { row, status: "no-image" };
      if (DRY_RUN) return { row, status: "would-save", ...found };
      const ok = await saveImage(row, found.url);
      return { row, status: ok ? "saved" : "save-failed", ...found };
    }, CONCURRENCY);

    for (const r of results) {
      processed++;
      if (!r) { errors++; continue; }
      const name = (r.row?.product_name || "").slice(0, 50);
      if (r.status === "saved" || r.status === "would-save") {
        if (r.source?.startsWith("og:")) savedOg++; else savedThumb++;
        const preview = r.url.startsWith("data:") ? `${r.url.slice(0, 30)}…(${r.url.length}b)` : r.url.slice(0, 80);
        console.log(`✓ [${processed}/${Math.min(total, LIMIT)}] ${name} [${r.source}] ${preview}`);
      } else if (r.status === "no-image") {
        noImage++;
        console.log(`· [${processed}/${Math.min(total, LIMIT)}] ${name} — no image found`);
      } else if (r.status === "junk-name") {
        junk++;
        console.log(`⊘ [${processed}/${Math.min(total, LIMIT)}] ${name} — junk name, skipped`);
      } else {
        errors++;
        console.log(`✗ [${processed}/${Math.min(total, LIMIT)}] ${name} — ${r.status} ${r.error || ""}`);
      }
    }

    const elapsed = (Date.now() - started) / 1000;
    const rate = processed / elapsed;
    const remaining = Math.min(total, LIMIT) - processed;
    const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : "?";
    console.log(`─ ${savedOg} og · ${savedThumb} thumb · ${noImage} empty · ${junk} junk · ${errors} err · ~${etaMin} min left\n`);

    if (!DRY_RUN) {
      // In live mode, fetchMissingBatch re-queries so we progress naturally as saves shrink the is-null set.
      // Junk-named rows don't shrink it, so we detect: is the NEXT batch's first cache_key the same as this one's?
      const batchSaved = results.filter(x => x?.status === "saved").length;
      const batchJunk = results.filter(x => x?.status === "junk-name").length;
      if (batchSaved === 0 && batchJunk === 0 && batch.length === PAGE_SIZE) {
        console.log("▶ Batch made no progress — bailing to avoid infinite loop");
        break;
      }
      // If the whole batch was junk-named, we need to move past them. Exit with advice.
      if (batchSaved === 0 && batchJunk === batch.length) {
        console.log("▶ Entire batch was junk-named rows — they'd re-appear next batch. Exiting; clean those rows first.");
        break;
      }
    } else {
      // In dry-run, fetchMissingBatch always returns the same rows. Exit after one batch.
      break;
    }
  }

  const mins = Math.round((Date.now() - started) / 60000);
  console.log(`\n═ Done in ${mins} min · ${savedOg} og · ${savedThumb} thumb · ${noImage} empty · ${junk} junk · ${errors} errors`);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
