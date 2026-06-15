#!/usr/bin/env node
/**
 * Phase 4: Pre-compute Claude analysis for all products.
 *
 * Calls the analyze Edge Function for each product that doesn't
 * already have a cached analysis. This ensures users get instant
 * results instead of waiting for Claude to analyze in real-time.
 *
 * Cost: Claude API credits (via Supabase Edge Function)
 * Run:  node scripts/mega-scraper/phase4-analyze.js [--batch=50] [--force]
 */

const {
  normalizeCacheKey, extractBrand, detectPetType,
  dbGetAll,
  log, progress, delay,
  SB_URL, SB_KEY,
} = require("./lib");

async function checkAnalysisCached(cacheKey) {
  const r = await fetch(
    `${SB_URL}/rest/v1/analysis_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=cache_key&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!r.ok) return false;
  const d = await r.json();
  return d.length > 0;
}

async function runAnalysis(product) {
  const pet = detectPetType(product.product_name, product.brand);
  const cacheKey = product.cache_key;

  const r = await fetch(`${SB_URL}/functions/v1/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
    },
    body: JSON.stringify({
      mode: "verified",
      stream: false,
      cacheKey: cacheKey,
      opffProduct: {
        productName: product.product_name,
        brand: product.brand,
        petType: pet,
        ingredientsText: product.ingredient_text || product.ingredients?.join(", "),
        nutriments: {},
      },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 100)}` };
  }

  // Parse the response — could be SSE or JSON depending on Edge Function behavior
  const contentType = r.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    // SSE response — read the full stream to completion (the EF caches internally)
    const text = await r.text();
    // Check if it completed successfully
    if (text.includes('"overallScore"')) {
      return { ok: true };
    }
    return { ok: false, error: "SSE stream incomplete" };
  }

  // JSON response
  const data = await r.json();
  if (data.content?.[0]?.text || data.analysis) {
    return { ok: true };
  }

  return { ok: false, error: "No analysis in response" };
}

async function main() {
  const batchArg = process.argv.find(a => a.startsWith("--batch="));
  const batchSize = batchArg ? parseInt(batchArg.split("=")[1]) : 0; // 0 = all
  const force = process.argv.includes("--force");

  console.log("\n══════════════════════════════════════════════════");
  console.log("  PHASE 4: PRE-COMPUTE ANALYSIS");
  console.log("══════════════════════════════════════════════════");
  console.log(`Batch: ${batchSize || "all"} | Force: ${force}\n`);

  // Get all products
  const all = await dbGetAll();
  log("ANALYZE", `Total products in DB: ${all.length}`);

  // Filter to products with sufficient ingredients
  const candidates = all.filter(p => p.ingredient_count >= 5);
  log("ANALYZE", `Products with ≥5 ingredients: ${candidates.length}`);

  // Check which already have cached analysis
  const needsAnalysis = [];
  for (const p of candidates) {
    if (!force) {
      const cached = await checkAnalysisCached(p.cache_key);
      if (cached) continue;
    }
    needsAnalysis.push(p);
    if (batchSize && needsAnalysis.length >= batchSize) break;
  }

  log("ANALYZE", `Products needing analysis: ${needsAnalysis.length}`);

  if (needsAnalysis.length === 0) {
    console.log("\nAll products already have cached analysis!");
    return;
  }

  let success = 0, failed = 0, rateLimited = 0;

  for (let i = 0; i < needsAnalysis.length; i++) {
    const p = needsAnalysis[i];
    progress(i, needsAnalysis.length, p.product_name, "analyzing...");

    try {
      const result = await runAnalysis(p);
      if (result.ok) {
        success++;
        progress(i, needsAnalysis.length, p.product_name, "✓ analyzed");
      } else {
        if (result.error?.includes("429") || result.error?.includes("rate")) {
          rateLimited++;
          log("ANALYZE", "Rate limited — waiting 30s...");
          await delay(30000);
          i--; // Retry
          continue;
        }
        failed++;
        progress(i, needsAnalysis.length, p.product_name, `✗ ${result.error}`);
      }
    } catch (err) {
      failed++;
      progress(i, needsAnalysis.length, p.product_name, `✗ ${err.message}`);
    }

    // Delay between analyses to respect rate limits
    // The analyze EF has a 20/hr rate limit per user, but we're using anon key
    await delay(3000);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("══════════════════════════════════════════════════");
  console.log(`Analyzed:     ${success}`);
  console.log(`Failed:       ${failed}`);
  console.log(`Rate limited: ${rateLimited}`);
  console.log(`Total:        ${needsAnalysis.length}`);
}

main().catch(console.error);
