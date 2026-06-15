#!/usr/bin/env node
/**
 * Comprehensive data fixer — fixes ALL data quality issues:
 * 1. Re-scrapes inflated products (>65 ingredients)
 * 2. Re-scrapes incomplete dry kibble (<20 ingredients)
 * 3. Retry logic with backoff for timeout handling
 * 4. Skips foreign/non-English products
 */

const {
  normalizeCacheKey, extractBrand, parseIngredients,
  dbSave, dbGetExisting,
  googleSearch, scrapePage, stripHtml, gptExtractIngredients,
  extractIngredientsFromHtml,
  log, delay,
  SB_URL, SB_KEY, SBKEY,
} = require("./lib");

// Retry wrapper with backoff
async function scrapeWithRetry(name, brand, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        log("FIX", `  Retry ${attempt}/${maxRetries}...`);
        await delay(3000 * attempt);
      }

      // Try quoted search first
      let results = [];
      try {
        results = await googleSearch(`"${name}" ingredients list`, 8);
      } catch { }

      if (results.length < 2) {
        try {
          const more = await googleSearch(`${name} ${brand || ""} ingredients`, 8);
          const urls = new Set(results.map(r => r.url));
          for (const r of more) { if (!urls.has(r.url)) results.push(r); }
        } catch { }
      }

      if (results.length === 0) return null;

      for (let i = 0; i < Math.min(results.length, 4); i++) {
        try {
          const html = await scrapePage(results[i].url || results[i]);
          if (!html) continue;

          // Try direct HTML extraction first
          const direct = extractIngredientsFromHtml(html);
          if (direct && direct.ingredients.length >= 5) {
            return { ingredients: direct.ingredients, text: direct.text, sourceUrl: results[i].url || results[i] };
          }

          // GPT extraction
          const text = stripHtml(html);
          if (text.length < 100) continue;
          const gpt = await gptExtractIngredients(text, name);
          if (gpt && gpt.ingredients.length >= 5) {
            return { ingredients: gpt.ingredients, text: gpt.text, sourceUrl: results[i].url || results[i] };
          }
        } catch { }
      }
      return null;
    } catch (err) {
      if (attempt === maxRetries) return null;
      // Timeout — retry
    }
  }
  return null;
}

async function getAllProducts() {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/product_data?select=product_name,brand,ingredient_count,source,cache_key&order=ingredient_count.desc&offset=${offset}&limit=1000`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const d = await r.json();
    all.push(...d);
    if (d.length < 1000) break;
  }
  return all;
}

function isForeign(name) {
  return /[àâäéèêëïîôùûüçæœёйцукенгш]|pour (chien|chat)|recette|poulet|boeuf|saumon|croquette|volaille|für|hund|katze|perro|gato|chiot|chaton/i.test(name);
}

function isLegitShort(name, count) {
  const lower = name.toLowerCase();
  const shortTypes = ['treat', 'biscuit', 'dental', 'churu', 'squeeze', 'broth', 'topper', 'mousse', 'oil', 'supplement', 'chew', 'jerky', 'strip', 'stick', 'bar', 'bite', 'cube', 'roll', 'meatball', 'bone broth', 'cod skin'];
  if (shortTypes.some(k => lower.includes(k)) && count >= 1) return true;

  const freshTypes = ['fresh', 'raw', 'freeze dried', 'freeze-dried', 'dehydrated', 'gently cooked', 'freshly crafted'];
  if (freshTypes.some(k => lower.includes(k)) && count >= 5) return true;

  const wetTypes = ['wet', 'canned', 'pate', 'stew', 'loaf', 'gravy', 'chunks', 'cuts in', 'dinner', 'entree', 'feast', 'slices', 'morsels', 'shreds', 'filets'];
  if (wetTypes.some(k => lower.includes(k)) && count >= 8) return true;

  return false;
}

function isVarietyPack(name) {
  return /variety pack|multi.?pack|assort|bundle|sampler|\d+ (pack|count|ct)\b/i.test(name);
}

async function main() {
  const mode = process.argv[2] || "all"; // "inflated", "incomplete", or "all"

  console.log("\n══════════════════════════════════════════════════");
  console.log("  COMPREHENSIVE DATA FIXER");
  console.log(`  Mode: ${mode}`);
  console.log("══════════════════════════════════════════════════\n");

  const all = await getAllProducts();
  log("FIX", `Total products in DB: ${all.length}`);

  // Categorize
  const inflated = all.filter(p => p.ingredient_count > 65 && !isVarietyPack(p.product_name));
  const varietyPacks = all.filter(p => p.ingredient_count > 65 && isVarietyPack(p.product_name));
  const foreign = all.filter(p => isForeign(p.product_name));
  const incomplete = all.filter(p => {
    if (p.ingredient_count >= 20) return false;
    if (isForeign(p.product_name)) return false;
    if (isLegitShort(p.product_name, p.ingredient_count)) return false;
    if (isVarietyPack(p.product_name)) return false;
    return true;
  });

  log("FIX", `Inflated (>65, not variety): ${inflated.length}`);
  log("FIX", `Variety packs (>65, OK):     ${varietyPacks.length}`);
  log("FIX", `Foreign/non-English:         ${foreign.length} (skipping)`);
  log("FIX", `Incomplete (needs fix):       ${incomplete.length}`);
  console.log("");

  let fixed = 0, failed = 0, skipped = 0;
  let toFix = [];

  if (mode === "inflated" || mode === "all") {
    toFix.push(...inflated.map(p => ({ ...p, reason: "inflated" })));
  }
  if (mode === "incomplete" || mode === "all") {
    toFix.push(...incomplete.map(p => ({ ...p, reason: "incomplete" })));
  }

  log("FIX", `Products to fix: ${toFix.length}\n`);

  for (let i = 0; i < toFix.length; i++) {
    const p = toFix[i];
    const num = `[${String(i + 1).padStart(4)}/${toFix.length}]`;
    const brand = p.brand || extractBrand(p.product_name);

    // Skip foreign
    if (isForeign(p.product_name)) { skipped++; continue; }

    const result = await scrapeWithRetry(p.product_name, brand);

    if (result) {
      const isImprovement = p.reason === "inflated"
        ? result.ingredients.length < p.ingredient_count && result.ingredients.length >= 5
        : result.ingredients.length > p.ingredient_count;

      if (isImprovement) {
        const saved = await dbSave(p.product_name, brand, result.ingredients, result.text, "web_verified", result.sourceUrl);
        if (saved) {
          fixed++;
          log("FIX", `${num} ✓ ${p.product_name.substring(0, 45)} ${p.ingredient_count}→${result.ingredients.length}`);
        }
      } else {
        skipped++;
      }
    } else {
      failed++;
      if (i % 20 === 0) log("FIX", `${num} ✗ ${p.product_name.substring(0, 50)}`);
    }

    await delay(2500);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log(`Fixed: ${fixed} | Skipped: ${skipped} | Failed: ${failed} | Total: ${toFix.length}`);
}

main().catch(console.error);
