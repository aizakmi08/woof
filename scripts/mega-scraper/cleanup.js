#!/usr/bin/env node
/**
 * Cleanup script — fixes products with inflated ingredient counts.
 * Products with >60 ingredients for dry food or >40 for wet/treats
 * likely scraped extra text. Re-scrapes them from cleaner sources.
 */

const { scrapeIngredients, dbSave, dbGetExisting, extractBrand, normalizeCacheKey, log, delay, SB_URL, SB_KEY } = require("./lib");

async function getInflated() {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/product_data?select=product_name,brand,ingredient_count,cache_key&ingredient_count=gt.65&order=ingredient_count.desc&offset=${offset}&limit=1000`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const d = await r.json();
    all.push(...d);
    if (d.length < 1000) break;
  }
  return all;
}

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  CLEANUP — FIX INFLATED INGREDIENT COUNTS");
  console.log("══════════════════════════════════════════════════\n");

  const inflated = await getInflated();
  console.log(`Found ${inflated.length} products with >65 ingredients (likely inflated)\n`);

  if (inflated.length === 0) {
    console.log("Nothing to clean up!");
    return;
  }

  // Show what we're fixing
  inflated.slice(0, 20).forEach(p => {
    console.log(`  [${p.ingredient_count}] ${p.product_name.substring(0, 60)}`);
  });
  if (inflated.length > 20) console.log(`  ... and ${inflated.length - 20} more\n`);

  let fixed = 0, kept = 0, failed = 0;

  for (let i = 0; i < inflated.length; i++) {
    const p = inflated[i];
    const brand = p.brand || extractBrand(p.product_name);
    const num = `[${String(i + 1).padStart(3)}/${inflated.length}]`;

    log("FIX", `${num} Re-scraping: ${p.product_name.substring(0, 50)} (${p.ingredient_count})`);

    const result = await scrapeIngredients(p.product_name, brand);

    if (result && result.ingredients.length >= 5 && result.ingredients.length < p.ingredient_count) {
      // Found a cleaner version with fewer (more accurate) ingredients
      const saved = await dbSave(p.product_name, brand, result.ingredients, result.text, "web_verified", result.sourceUrl);
      if (saved) {
        fixed++;
        log("FIX", `${num} ✓ ${p.ingredient_count} → ${result.ingredients.length} ingredients`);
      }
    } else if (result && result.ingredients.length >= p.ingredient_count) {
      // New scrape also has high count — might actually be correct
      kept++;
      log("FIX", `${num} KEPT (re-scrape also found ${result.ingredients.length})`);
    } else {
      failed++;
      log("FIX", `${num} ✗ Could not find cleaner data`);
    }

    await delay(2000);
  }

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`Fixed: ${fixed} | Kept: ${kept} | Failed: ${failed} | Total: ${inflated.length}`);
}

main().catch(console.error);
