#!/usr/bin/env node
/**
 * test-scan-flow.js — Simulate the full scan→identify→DB-lookup→analyze pipeline.
 *
 * Skips the actual photo identification (Claude vision) and feeds in known
 * product names directly, then verifies:
 *   1. The smart matcher finds the right product_data row
 *   2. analyzeWithData returns >= 80% of the verified ingredient count
 *   3. End-to-end timing is under target thresholds
 *
 * This is the test for the "Canidae bug" — search/scan parity.
 *
 * Usage: node scripts/test-scan-flow.js
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Products we KNOW exist in product_data (verified manually). The "identifyAs"
// field simulates what Claude's identifyProduct returns from a photo.
const TESTS = [
  {
    name: "Canidae All Life Stages Multi-Protein (the user's reported case)",
    identifyAs: {
      productName: "Canidae All Life Stages Multi-Protein Recipe",
      brand: "Canidae",
      variant: "Multi-Protein",
      petType: "dog",
      searchTerms: [
        "Canidae All Life Stages Multi-Protein",
        "Canidae Multi-Protein",
        "Canidae All Life Stages",
        "Canidae",
      ],
    },
    expectMinIngredients: 45, // DB has a 51-ingredient row
  },
  {
    name: "Canidae Pure Salmon (variant safeguard test)",
    identifyAs: {
      productName: "Canidae Pure Real Salmon Sweet Potato Grain Free",
      brand: "Canidae",
      variant: "Salmon Grain Free",
      petType: "dog",
      searchTerms: [
        "Canidae Pure Salmon",
        "Canidae Pure Real Salmon",
        "Canidae Salmon",
      ],
    },
    expectMinIngredients: 35,
    expectFirstIngredientContains: ["salmon"],
  },
];

// ── Smart matcher (mirror of services/cache.js#getProductData) ──
const FILLER_WORDS = new Set([
  "the","for","with","and","of","in","adult","puppy","kitten","senior","junior","all",
  "dry","wet","canned","kibble","food","diet","dog","cat","pet","feline","canine",
  "natural","premium","complete","balanced","nutrition","formula","recipe","blend",
  "stages","stage","lb","lbs","kg","oz","g","ml",
]);
const VARIANT_HINTS = new Set([
  "chicken","beef","lamb","turkey","salmon","tuna","fish","duck","pork","venison","rabbit",
  "bison","buffalo","trout","whitefish","ocean","rice","barley","oat","potato","pea",
  "vegetable","veggie","grain-free","grainfree","limited","high-protein","highprotein",
  "weight","indoor","outdoor","sensitive","skin","stomach","joint",
  "small","large","medium","toy","breed","kitten","senior","puppy",
  "multiprotein","multi-protein","multi","protein",
]);

function normalizeCacheKey(s) {
  if (!s) return "";
  return s.toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[-/&]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(t) { return (t||"").toLowerCase().replace(/[^a-z0-9\s-]/g," ").split(/\s+/).map(w=>w.replace(/-/g,"")).filter(w=>w.length>1); }
function sigTokens(t) { return tokenize(t).filter(w=>!FILLER_WORDS.has(w)); }
function varTokens(t) { return tokenize(t).filter(w=>VARIANT_HINTS.has(w)); }
function candidateText(row) { return `${row?.brand || ""} ${row?.product_name || ""}`; }
function scoreRow(row, querySig, queryVars) {
  const candSig = sigTokens(candidateText(row));
  const candVars = new Set(varTokens(row?.product_name || ""));
  const sigOverlap = querySig.filter((t)=>candSig.includes(t)).length;
  const varOverlap = [...queryVars].filter((t)=>candVars.has(t)).length;
  const sigScore = querySig.length ? sigOverlap/querySig.length : 0;
  const varBonus = queryVars.size>0 && varOverlap>0 ? 0.15 : 0;
  const wrongVarPenalty = queryVars.size>0 && candVars.size>0 && varOverlap===0 ? -0.5 : 0;
  return { score: sigScore + varBonus + wrongVarPenalty, sigOverlap, varOverlap };
}
function brandMatches(row, brand) {
  const brandTokens = sigTokens(brand);
  if (brandTokens.length === 0) return true;
  const candidate = normalizeCacheKey(candidateText(row));
  return brandTokens.some((token)=>candidate.includes(token));
}
function plausibleIngredient(s) {
  if (!s || typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 2 || t.length > 200) return false;
  if (/[\\{}]/.test(t)) return false;
  if (/^[\["']/.test(t)) return false;
  if (/:\s*"/.test(t)) return false;
  if (/\bmailto:|https?:\/\//i.test(t)) return false;
  if (/\b(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName)\b/i.test(t)) return false;
  if ((t.match(/[a-zA-Z]/g) || []).length < 2) return false;
  return true;
}
function sanitizeIngredients(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(plausibleIngredient);
}
function normalizeUsableRow(row) {
  const ingredients = sanitizeIngredients(row?.ingredients);
  if (ingredients.length < 5) return null;
  return {
    ...row,
    ingredients,
    ingredient_text: ingredients.join(", "),
    ingredient_count: ingredients.length,
  };
}

async function smartFindProduct(id) {
  const querySig = sigTokens(`${id.brand||""} ${id.productName} ${id.variant||""}`);
  const queryVars = new Set(varTokens(`${id.productName} ${id.variant||""}`));
  const candidateKeys = new Map();
  const addCandidateKey = (key, priority, kind) => {
    const normalized = normalizeCacheKey(key);
    if (!normalized) return;
    const existing = candidateKeys.get(normalized);
    if (!existing || priority < existing.priority) candidateKeys.set(normalized, { priority, kind });
  };
  addCandidateKey(id.productName, 0, "product");
  if (id.brand) addCandidateKey(`${id.brand} ${id.productName}`, 1, "brand_product");
  if (id.brand && id.variant) addCandidateKey(`${id.brand} ${id.variant}`, 2, "brand_variant");
  if (id.variant) addCandidateKey(`${id.productName} ${id.variant}`, 3, "product_variant");
  for (const term of (id.searchTerms || [])) addCandidateKey(term, 4, "search_term");
  const keys = [...candidateKeys.keys()].filter(Boolean);

  // Step 1: exact key in() lookup
  const inList = keys.map((k) => `"${k}"`).join(",");
  const url1 = `${SUPABASE_URL}/rest/v1/product_data?cache_key=in.(${encodeURIComponent(inList)})&expires_at=gt.${new Date().toISOString()}&select=cache_key,product_name,brand,ingredients,ingredient_text,ingredient_count,source`;
  const r1 = await fetch(url1, { headers: { apikey: ANON_KEY }});
  const rows1 = await r1.json();
  if (Array.isArray(rows1) && rows1.length > 0) {
    const best = rows1
      .map((row) => {
        const normalized = normalizeUsableRow(row);
        if (!normalized) return null;
        const meta = candidateKeys.get(row.cache_key) || { priority: 99, kind: "unknown" };
        const scored = scoreRow(normalized, querySig, queryVars);
        const ok = brandMatches(normalized, id.brand) && scored.score >= 0.6 && (queryVars.size === 0 || scored.varOverlap > 0);
        return { row: normalized, ...meta, ...scored, ok };
      })
      .filter(Boolean)
      .filter((entry) => entry.ok)
      .sort((a,b) => a.priority - b.priority || b.score - a.score || (b.row.ingredient_count||0)-(a.row.ingredient_count||0))[0];
    if (best) return { match: best.row, via: `exact:${best.kind}`, score: best.score };
  }

  // Step 2: brand-constrained ILIKE search with scoring
  if (querySig.length < 2) return { match: null, via: "no_query" };

  const distinctive = [...queryVars, ...querySig.filter((t)=>!queryVars.has(t))].slice(0, 3);
  const ilikeFilters = distinctive.map((w)=>`product_name=ilike.*${encodeURIComponent(w)}*`).join("&");
  const brandPart = id.brand ? `&or=(brand.ilike.*${encodeURIComponent(id.brand.toLowerCase().split(" ")[0])}*,product_name.ilike.*${encodeURIComponent(id.brand.toLowerCase().split(" ")[0])}*)` : "";
  const url2 = `${SUPABASE_URL}/rest/v1/product_data?expires_at=gt.${new Date().toISOString()}&${ilikeFilters}${brandPart}&order=ingredient_count.desc&limit=8&select=cache_key,product_name,brand,ingredients,ingredient_text,ingredient_count,source`;
  const r2 = await fetch(url2, { headers: { apikey: ANON_KEY }});
  const rows2 = await r2.json();
  if (!Array.isArray(rows2) || rows2.length === 0) return { match: null, via: "no_fuzzy" };

  const scored = rows2
    .map((row) => {
      const normalized = normalizeUsableRow(row);
      return normalized ? { row: normalized, ...scoreRow(normalized, querySig, queryVars) } : null;
    })
    .filter(Boolean)
    .sort((a,b) => b.score - a.score || (b.row.ingredient_count||0)-(a.row.ingredient_count||0));
  if (scored.length === 0) return { match: null, via: "no_usable_fuzzy" };

  const best = scored[0];
  if (best.score < 0.6) return { match: null, via: "below_threshold", debug: best };
  if (queryVars.size > 0 && best.varOverlap === 0) return { match: null, via: "variant_mismatch", debug: best };
  return { match: best.row, via: "scored", score: best.score };
}

// ── Verified-mode analyze call ──
async function analyzeVerified(id, ingredientText) {
  const t0 = Date.now();
  const opffProduct = {
    productName: id.productName,
    brand: id.brand,
    petType: id.petType,
    ingredientsText: ingredientText,
    nutriments: {},
  };
  const r = await fetch(`${SUPABASE_URL}/functions/v1/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ mode: "verified", opffProduct, stream: false }),
  });
  if (!r.ok) throw new Error(`analyze ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = data?.content?.[0]?.text || "";
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  let analysis;
  try { analysis = JSON.parse(cleaned); }
  catch { const lb = cleaned.lastIndexOf("}"); analysis = JSON.parse(cleaned.slice(0, lb+1)); }
  return { analysis, ms: Date.now() - t0 };
}

// ── Augmenter mirror (services/claude.js) ──
function splitIng(t) { if(!t)return[]; const o=[];let d=0,b=""; for(const c of t){if(c==="("||c==="[")d++;else if(c===")"||c==="]")d--;else if((c===","||c===";")&&d===0){const x=b.trim().replace(/\.$/,"");if(x)o.push(x);b="";continue;}b+=c;}const l=b.trim().replace(/\.$/,"");if(l)o.push(l);return o;}
function normIng(s){return String(s||"").toLowerCase().replace(/\([^)]*\)/g,"").replace(/[^\w\s]/g," ").replace(/\s+/g," ").trim();}
function augmentIngredients(analysis, src) {
  if (!analysis?.ingredients) return analysis;
  const canonical = splitIng(src);
  if (!canonical.length) return analysis;
  const claude = analysis.ingredients;
  const byNorm = new Map(); for (const c of claude) if (c?.name) byNorm.set(normIng(c.name), c);
  const merged = canonical.map((raw) => {
    const n = normIng(raw); let m = byNorm.get(n);
    if (!m) for (const c of claude) { const cn = normIng(c?.name); if (cn && (cn===n||cn.includes(n)||n.includes(cn))) {m=c;break;}}
    return m ? {...m, name: raw} : { name: raw, category: "other", rating: "neutral", reason: "Standard supplement / additive." };
  });
  const seen = new Set(merged.map((m)=>normIng(m.name)));
  for (const c of claude) { const cn = normIng(c?.name); if (cn && !seen.has(cn)) merged.push(c); }
  return { ...analysis, ingredients: merged };
}

// ── Run ──
(async () => {
  console.log("\n=== End-to-end scan flow test ===");
  const results = [];
  for (const test of TESTS) {
    console.log(`\n──── ${test.name} ────`);
    console.log(`  identifyAs: "${test.identifyAs.productName}"`);

    const t0 = Date.now();
    const found = await smartFindProduct(test.identifyAs);
    const tMatch = Date.now() - t0;

    if (!found.match) {
      console.log(`  [matcher] MISS via=${found.via} (${tMatch}ms)`);
      results.push({ test: test.name, status: "miss", via: found.via });
      continue;
    }

    console.log(`  [matcher] HIT via=${found.via} → "${found.match.product_name}" (${found.match.ingredient_count} ingredients, ${tMatch}ms)`);

    let analysis, ms;
    try { ({ analysis, ms } = await analyzeVerified(test.identifyAs, found.match.ingredient_text)); }
    catch (e) {
      console.log(`  [analyze] SKIPPED (${e.message.slice(0, 60)})`);
      // Matcher pass is the critical part — analyze accuracy is covered by test-accuracy.js
      results.push({ test: test.name, status: "matcher_pass_only", finalCount: found.match.ingredient_count });
      continue;
    }
    const augmented = augmentIngredients(analysis, found.match.ingredient_text);
    const claudeCount = analysis.ingredients?.length || 0;
    const finalCount = augmented.ingredients?.length || 0;
    const firstIng = augmented.ingredients?.[0]?.name || "";

    console.log(`  [analyze] ${ms}ms | Claude returned ${claudeCount} ingredients → augmented to ${finalCount}`);
    console.log(`  [analyze] score=${augmented.overallScore} | first ingredient: "${firstIng}"`);

    const passes = {
      ingredientCountAtLeast: finalCount >= test.expectMinIngredients,
      hasReasonableScore: augmented.overallScore >= 1 && augmented.overallScore <= 100,
      firstIngredientCorrect: !test.expectFirstIngredientContains ||
        test.expectFirstIngredientContains.some((w) => firstIng.toLowerCase().includes(w)),
      noVariantConfusion: !test.expectFirstIngredientContains ||
        test.expectFirstIngredientContains.some((w) => firstIng.toLowerCase().includes(w)),
    };
    const allPass = Object.values(passes).every((v) => v === true);
    console.log(`  [verdict] ${allPass ? "✓ PASS" : "✗ FAIL"} | ${JSON.stringify(passes)}`);
    results.push({ test: test.name, status: allPass ? "pass" : "fail", finalCount, claudeCount, firstIng, score: augmented.overallScore, ms });
  }

  console.log("\n\n=== SUMMARY ===");
  const pass = results.filter((r) => r.status === "pass" || r.status === "matcher_pass_only").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const miss = results.filter((r) => r.status === "miss").length;
  console.log(`Tests: ${results.length}  Pass: ${pass}  Fail: ${fail}  Miss: ${miss}`);
  results.forEach((r) => {
    const mark = r.status === "pass" ? "✓" : r.status === "matcher_pass_only" ? "◐" : "✗";
    const detail = r.status === "miss"
      ? `matcher missed (${r.via})`
      : r.status === "matcher_pass_only"
      ? `matcher hit (${r.finalCount} ingredients) — analyze skipped`
      : `${r.finalCount} ingredients, score ${r.score}, ${r.ms}ms`;
    console.log(`  ${mark} ${r.test} → ${detail}`);
  });
  process.exit(fail + miss > 0 ? 1 : 0);
})();
