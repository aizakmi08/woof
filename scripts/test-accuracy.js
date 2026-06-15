#!/usr/bin/env node
/**
 * test-accuracy.js — End-to-end accuracy test for the analyze pipeline.
 *
 * Pipeline:
 *   1. OpenPetFoodFacts JSON API gives us product image URL + ground-truth ingredients
 *      (this is the same source the app uses for its "verified" mode, so it's the
 *      right yardstick for accuracy).
 *   2. We download the product label image
 *   3. POST it to the deployed analyze edge function (mode=photo, guest)
 *   4. Parse the SSE stream, extract the final analysis JSON
 *   5. Diff product name + ingredients + score against OPFF ground truth
 *   6. Print verdict per product + overall accuracy/timing summary
 *
 * Usage:
 *   node scripts/test-accuracy.js                # all products
 *   node scripts/test-accuracy.js --limit=3      # first 3
 *   node scripts/test-accuracy.js --product=blue # filter slugs
 *   node scripts/test-accuracy.js --refresh      # re-download images
 *
 * If OPFF lacks an image for a product, falls back to ScrapingBee Google Images.
 */

const fs = require("fs");
const path = require("path");

const SBKEY = process.env.SBKEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ANALYZE_URL = `${SUPABASE_URL}/functions/v1/analyze`;
const FIXTURES_DIR = path.join(__dirname, "..", "test-fixtures");

// Test products are auto-discovered from OPFF (see discoverProducts()).
// We filter for: English ingredient text (no accents), >=100 chars, has front image.

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = true] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);

// ── Helpers ──────────────────────────────────────────────────────────

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

const UA = "WoofAccuracyTest/1.0 (test@woof.app)";

function looksEnglish(text) {
  if (!text) return false;
  if (/[àâäæçéèêëîïôöùûüÿñœáíóúüżąćęłńśźżğşıčćđšžåøæ]/i.test(text)) return false;
  // Strong English signal: presence of common English food words
  const eng = /\b(chicken|beef|lamb|fish|salmon|turkey|rice|wheat|corn|meal|protein|vitamin|mineral|with|and|the|water|broth)\b/i;
  return eng.test(text);
}

function highResImage(url) {
  if (!url) return url;
  // OPFF stores .400.jpg (small). Use .full.jpg for original-resolution scan.
  return url.replace(/\.\d+\.jpg(\?.*)?$/, ".full.jpg$1");
}

async function discoverProducts(targetCount = 12) {
  // Search OPFF for popular pet foods, filter for English text + image + ingredients.
  // Try multiple seed searches to get a diverse mix of dog & cat products.
  const seeds = [
    { q: "dog food chicken", petType: "dog", page_size: 100 },
    { q: "cat food", petType: "cat", page_size: 100 },
    { q: "purina", petType: "dog", page_size: 50 },
    { q: "wellness pet", petType: "dog", page_size: 50 },
    { q: "blue buffalo", petType: "dog", page_size: 50 },
    { q: "fancy feast", petType: "cat", page_size: 50 },
  ];

  const seen = new Set();
  const products = [];

  for (const seed of seeds) {
    if (products.length >= targetCount) break;
    const params = new URLSearchParams({
      search_terms: seed.q,
      fields: "code,product_name,product_name_en,brands,ingredients_text,ingredients_text_en,image_front_url,image_url,categories_tags",
      page_size: String(seed.page_size),
      sort_by: "unique_scans_n",
    });
    const url = `https://world.openpetfoodfacts.org/cgi/search.pl?action=process&json=1&${params}`;
    let data;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      data = await r.json();
    } catch { continue; }

    for (const p of data.products || []) {
      if (products.length >= targetCount) break;
      if (seen.has(p.code)) continue;
      const name = p.product_name_en || p.product_name || "";
      const ing = p.ingredients_text_en || p.ingredients_text || "";
      const img = p.image_front_url || p.image_url;
      if (!name || !img || !ing) continue;
      if (ing.length < 80) continue;
      if (!looksEnglish(ing) || !looksEnglish(name)) continue;
      // Filter to pet food categories
      const tags = (p.categories_tags || []).join(" ");
      const isPet = /pet|dog|cat/i.test(tags) || /dog|cat|puppy|kitten/i.test(name.toLowerCase());
      if (!isPet) continue;

      seen.add(p.code);
      const slugBase = (name || p.code).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "");
      products.push({
        slug: `${slugBase}-${p.code.slice(-4)}`,
        barcode: p.code,
        petType: seed.petType,
        expectedFirstIngredient: parseIngredientList(ing)[0] || null,
        _opff: {
          productName: name,
          brand: p.brands || "",
          ingredientsText: ing,
          imageUrl: highResImage(img),
        },
      });
    }
  }

  return products;
}

async function fetchOpff(barcode) {
  // Used only when we need to refresh a cached fixture that lacks _opff data.
  const url = `https://world.openpetfoodfacts.org/api/v2/product/${barcode}.json`;
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`OPFF ${r.status} for ${barcode}`);
  const data = await r.json();
  if (data.status !== 1 || !data.product) throw new Error(`OPFF: not found ${barcode}`);
  const p = data.product;
  return {
    productName: p.product_name_en || p.product_name || null,
    brand: p.brands || null,
    ingredientsText: p.ingredients_text_en || p.ingredients_text || null,
    imageUrl: p.image_front_url || p.image_url || null,
  };
}

async function googleImageSearch(query) {
  const params = new URLSearchParams({
    api_key: SBKEY,
    search: `${query} pet food bag front label`,
    search_type: "images",
    nb_results: "5",
  });
  const r = await fetch(`https://app.scrapingbee.com/api/v1/store/google?${params}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return null;
  const data = await r.json();
  const first = (data?.images_results || [])[0];
  return first?.image || first?.thumbnail || null;
}

async function downloadImage(imageUrl, outPath) {
  const r = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Image fetch ${r.status}: ${imageUrl}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return buf;
}

// Mirror of services/claude.js#augmentIngredients — backfills any ingredients
// Claude skipped, using the canonical source list (verified mode only).
function augmentIngredients(analysis, sourceText) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const canonical = parseIngredientList(sourceText);
  if (!canonical.length) return analysis;
  const claudeList = Array.isArray(analysis.ingredients) ? analysis.ingredients : [];
  const norm = (s) => String(s || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const byNorm = new Map();
  for (const c of claudeList) { if (c?.name) byNorm.set(norm(c.name), c); }
  const merged = canonical.map((rawName) => {
    const n = norm(rawName);
    let m = byNorm.get(n);
    if (!m) for (const c of claudeList) {
      const cn = norm(c?.name);
      if (cn && (cn === n || cn.includes(n) || n.includes(cn))) { m = c; break; }
    }
    return m ? { ...m, name: rawName } : { name: rawName, category: "other", rating: "neutral", reason: "Standard supplement / additive." };
  });
  const seen = new Set(merged.map((m) => norm(m.name)));
  for (const c of claudeList) { const cn = norm(c?.name); if (cn && !seen.has(cn)) merged.push(c); }
  return { ...analysis, ingredients: merged };
}

function parseIngredientList(text) {
  if (!text) return [];
  // OPFF format strips parens but may use semicolons. Split on commas and semicolons,
  // respecting parentheses/brackets.
  const tokens = [];
  let depth = 0, buf = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if ((ch === "," || ch === ";") && depth === 0) {
      tokens.push(buf.trim()); buf = ""; continue;
    }
    buf += ch;
  }
  if (buf.trim()) tokens.push(buf.trim());
  return tokens.map(normalize).filter((s) => s && s.length > 1);
}

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(organic|natural|dried|dehydrated|fresh|whole|ground|powdered|hydrolyzed|deboned)\b/g, "$1") // keep markers but normalize
    .replace(/[^\w\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Common multi-language synonyms — used so Claude's English translation of
// foreign-language labels still counts as a correct match.
const SYNONYMS = [
  ["meat and animal derivatives", "carni e derivati", "carnes y subproductos animales", "viandes et sous-produits", "meat and bone meal", "meat by products", "subproductos animales"],
  ["chicken", "pollo", "poulet", "huhn", "kyckling"],
  ["beef", "manzo", "vacuno", "rind", "boeuf"],
  ["fish", "pesce", "pescado", "poisson", "fisch"],
  ["turkey", "tacchino", "pavo", "dinde"],
  ["lamb", "agnello", "cordero", "agneau", "lamm"],
  ["salmon", "salmone", "salmón", "saumon", "lachs"],
  ["rice", "riso", "arroz", "riz", "reis"],
  ["wheat", "grano", "trigo", "blé", "weizen"],
  ["corn", "mais", "maíz", "maïs", "cereales", "cereali"],
  ["minerals", "minerali", "minerales", "minéraux", "sostanze minerali"],
  ["vitamins", "vitamine", "vitaminas", "vitamines"],
  ["vegetables", "verdure", "vegetales", "légumes"],
  ["sugars", "zuccheri", "azucares", "sucres", "azúcares"],
  ["oils and fats", "oli e grassi", "aceites y grasas", "huiles et graisses"],
  ["yeast", "lievito", "levadura", "levure"],
];

function expandSynonyms(s) {
  const n = normalize(s);
  for (const group of SYNONYMS) {
    if (group.some((g) => n === g || n.includes(g))) return group[0]; // canonical first form
  }
  return n;
}

function fuzzyMatch(a, b) {
  const an = expandSynonyms(a), bn = expandSynonyms(b);
  if (!an || !bn) return false;
  if (an === bn) return true;
  if (an.includes(bn) || bn.includes(an)) return true;
  const at = new Set(an.split(" ").filter(Boolean));
  const bt = new Set(bn.split(" ").filter(Boolean));
  const small = at.size <= bt.size ? at : bt;
  const big   = at.size <= bt.size ? bt : at;
  if (!small.size) return false;
  let hit = 0; for (const t of small) if (big.has(t)) hit++;
  return hit / small.size >= 0.6;
}

async function callAnalyze(payload) {
  const t0 = Date.now();
  const res = await fetch(ANALYZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      // No Authorization header — guest mode. The EF treats Authorization=Bearer
      // as a user JWT and rejects it if it's actually the anon key.
    },
    body: JSON.stringify({ stream: true, ...payload }),
  });
  const tFirstByte = Date.now() - t0;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`analyze ${res.status}: ${text.slice(0, 300)}`);
  }

  const ct = res.headers.get("content-type") || "";
  let fullText = "", firstChunkAt = null;

  if (ct.includes("text/event-stream")) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (firstChunkAt === null) firstChunkAt = Date.now() - t0;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "content_block_delta" && evt.delta?.text) fullText += evt.delta.text;
          else if (evt.delta?.text) fullText += evt.delta.text;
          else if (evt.content?.[0]?.text) fullText += evt.content[0].text;
        } catch {}
      }
    }
  } else {
    const body = await res.json();
    fullText = body?.content?.[0]?.text || "";
  }

  const tTotal = Date.now() - t0;

  let cleaned = fullText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  let analysis;
  try {
    analysis = JSON.parse(cleaned);
  } catch {
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > 0) {
      try { analysis = JSON.parse(cleaned.slice(0, lastBrace + 1)); }
      catch { throw new Error(`JSON parse failed. Raw: ${cleaned.slice(0, 200)}`); }
    } else {
      throw new Error(`No JSON. Raw: ${cleaned.slice(0, 200)}`);
    }
  }

  return { analysis, timing: { tFirstByte, firstChunkAt, tTotal }, rawLength: fullText.length };
}

// ── Per-product runner ──────────────────────────────────────────────

async function runOne(product) {
  console.log(`\n──── ${product.slug} (${product.barcode}) ────`);
  ensureDir(FIXTURES_DIR);
  const fixturePath = path.join(FIXTURES_DIR, `${product.slug}.json`);
  const imagePath = path.join(FIXTURES_DIR, `${product.slug}.jpg`);

  // 1. Ground truth — prefer _opff inlined from discovery, else fetch fresh.
  let fixture;
  if (fs.existsSync(fixturePath) && !args.refresh) {
    fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    console.log("  [cache] using cached fixture");
  } else {
    let opff = product._opff;
    if (!opff) {
      console.log("  [opff] fetching ground truth...");
      try { opff = await fetchOpff(product.barcode); }
      catch (e) { return { slug: product.slug, status: "skip", reason: e.message }; }
    }
    fixture = { ...product, ...opff, scrapedAt: new Date().toISOString() };
    delete fixture._opff;
    fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
    console.log(`  [opff] name="${fixture.productName}" image=${fixture.imageUrl ? "ok" : "MISSING"} ingredients=${fixture.ingredientsText?.length || 0}ch`);
  }

  if (!fixture.imageUrl) return { slug: product.slug, status: "skip", reason: "no image" };
  if (!fixture.ingredientsText) return { slug: product.slug, status: "skip", reason: "no ground-truth ingredients" };

  // 2. Image
  let imgBuf;
  if (fs.existsSync(imagePath) && !args.refresh) {
    imgBuf = fs.readFileSync(imagePath);
  } else {
    console.log("  [download] fetching image...");
    try { imgBuf = await downloadImage(fixture.imageUrl, imagePath); }
    catch (e) { return { slug: product.slug, status: "skip", reason: `download: ${e.message}` }; }
  }
  console.log(`  [image] ${(imgBuf.length / 1024).toFixed(0)} KB`);
  const imageBase64 = imgBuf.toString("base64");
  if (imageBase64.length > 6_500_000) {
    return { slug: product.slug, status: "skip", reason: "image too large" };
  }

  // 3. Analyze — choose mode based on --mode flag
  console.log(`  [analyze] calling EF (mode=${args.mode || "photo"})...`);
  let result;
  try {
    if (args.mode === "verified") {
      // Simulates the search→tap flow: send the verified ingredient text + product info
      const opffProduct = {
        productName: fixture.productName,
        brand: fixture.brand || "",
        petType: product.petType,
        ingredientsText: fixture.ingredientsText,
        nutriments: {},
      };
      result = await callAnalyze({ mode: "verified", opffProduct });
    } else {
      result = await callAnalyze({ mode: "photo", imageBase64 });
    }
  }
  catch (e) { return { slug: product.slug, status: "error", error: e.message }; }
  const { analysis: rawAnalysis, timing } = result;
  // Mirror client-side augmentation for verified mode so the test reflects what users actually see.
  const rawIngCount = rawAnalysis.ingredients?.length || 0;
  const analysis = args.mode === "verified"
    ? augmentIngredients(rawAnalysis, fixture.ingredientsText)
    : rawAnalysis;
  const augmentedCount = analysis.ingredients?.length || 0;
  console.log(`  [analyze] firstByte=${timing.tFirstByte}ms firstChunk=${timing.firstChunkAt ?? "n/a"}ms total=${timing.tTotal}ms (${result.rawLength} chars)`);
  if (args.mode === "verified" && augmentedCount !== rawIngCount) {
    console.log(`  [augment] Claude returned ${rawIngCount} ingredients → augmented to ${augmentedCount}`);
  }

  // 4. Diff
  const expected = parseIngredientList(fixture.ingredientsText);
  const actual = (analysis.ingredients || []).map((i) => normalize(i.name || ""));

  const expBrand = (fixture.brand || "").split(",")[0].trim().toLowerCase();
  const gotName = (analysis.productName || "").toLowerCase();
  const productNameMatch = expBrand && gotName.includes(expBrand);

  const firstIngMatch = analysis.ingredients?.[0]?.name
    ? fuzzyMatch(analysis.ingredients[0].name, product.expectedFirstIngredient)
    : false;

  const checkTop = expected.slice(0, 8);
  const actualWindow = actual.slice(0, 12);
  let topNHits = 0;
  for (const e of checkTop) if (actualWindow.some((a) => fuzzyMatch(a, e))) topNHits++;
  const topNPct = checkTop.length ? Math.round((topNHits / checkTop.length) * 100) : null;

  const out = {
    slug: product.slug,
    status: "ok",
    timing,
    expected: {
      brand: fixture.brand,
      productName: fixture.productName,
      firstIngredient: product.expectedFirstIngredient,
      topIngredients: checkTop,
    },
    actual: {
      productName: analysis.productName,
      petType: analysis.petType,
      ingredientSource: analysis.ingredientSource,
      overallScore: analysis.overallScore,
      firstIngredient: analysis.ingredients?.[0]?.name,
      ingredientCountFromClaude: rawIngCount,
      ingredientCountAfterAugment: augmentedCount,
      topIngredients: actual.slice(0, 8),
    },
    checks: {
      productNameMatch,
      firstIngredientMatch: firstIngMatch,
      petTypeMatch: analysis.petType === product.petType,
      topIngredientOverlap: `${topNHits}/${checkTop.length} (${topNPct}%)`,
      topIngredientPct: topNPct,
      enoughIngredients: (analysis.ingredients?.length || 0) >= 8,
      reasonableScore: typeof analysis.overallScore === "number" && analysis.overallScore >= 0 && analysis.overallScore <= 100,
    },
  };

  console.log(`  [diff] name=${productNameMatch?"✓":"✗"} pet=${out.checks.petTypeMatch?"✓":"✗"} firstIng=${firstIngMatch?"✓":"✗"} topOverlap=${out.checks.topIngredientOverlap} score=${analysis.overallScore} src=${analysis.ingredientSource}`);
  console.log(`  [diff] expected first: "${product.expectedFirstIngredient}"  |  got: "${analysis.ingredients?.[0]?.name}"`);
  if (topNPct !== null && topNPct < 70) {
    console.log(`  [diff] EXPECTED top: ${checkTop.slice(0,6).join(" | ")}`);
    console.log(`  [diff] ACTUAL  top: ${actual.slice(0,6).join(" | ")}`);
  }
  return out;
}

(async () => {
  const limit = args.limit ? parseInt(args.limit) : 8;
  console.log(`Discovering up to ${limit} test products from OPFF...`);
  const discovered = await discoverProducts(limit * 2);
  const filter = args.product;
  const targets = discovered.filter((p) => !filter || p.slug.includes(filter)).slice(0, limit);

  console.log(`\n=== Accuracy test: ${targets.length} product(s) ===`);
  const results = [];
  for (const p of targets) {
    try { results.push(await runOne(p)); }
    catch (e) {
      console.error(`  [ERROR] ${p.slug}: ${e.message}`);
      results.push({ slug: p.slug, status: "error", error: e.message });
    }
  }

  console.log("\n\n=== SUMMARY ===");
  const ok = results.filter((r) => r.status === "ok");
  const errors = results.filter((r) => r.status === "error");
  const skips = results.filter((r) => r.status === "skip");
  const nameAcc = ok.filter((r) => r.checks.productNameMatch).length;
  const firstAcc = ok.filter((r) => r.checks.firstIngredientMatch).length;
  const petAcc = ok.filter((r) => r.checks.petTypeMatch).length;
  const avgTopPct = ok.length ? Math.round(ok.reduce((s, r) => s + (r.checks.topIngredientPct || 0), 0) / ok.length) : 0;
  const avgTotal = ok.length ? Math.round(ok.reduce((s, r) => s + r.timing.tTotal, 0) / ok.length) : 0;
  const avgFirst = ok.length ? Math.round(ok.reduce((s, r) => s + (r.timing.firstChunkAt || 0), 0) / ok.length) : 0;

  console.log(`Tested: ${results.length}  OK: ${ok.length}  Errors: ${errors.length}  Skipped: ${skips.length}`);
  console.log(`Brand-name match:        ${nameAcc}/${ok.length}`);
  console.log(`Pet-type match:          ${petAcc}/${ok.length}`);
  console.log(`First-ingredient match:  ${firstAcc}/${ok.length}`);
  console.log(`Top-8 overlap avg:       ${avgTopPct}%`);
  console.log(`Avg time-to-first-chunk: ${avgFirst}ms`);
  console.log(`Avg total time:          ${avgTotal}ms`);
  if (errors.length) {
    console.log("\nErrors:");
    errors.forEach((e) => console.log(`  - ${e.slug}: ${e.error}`));
  }
  if (skips.length) {
    console.log("\nSkipped:");
    skips.forEach((s) => console.log(`  - ${s.slug}: ${s.reason}`));
  }

  ensureDir(FIXTURES_DIR);
  const reportPath = path.join(FIXTURES_DIR, `_report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nFull report: ${reportPath}`);
})();
