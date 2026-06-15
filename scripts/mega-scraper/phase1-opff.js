#!/usr/bin/env node
/**
 * Phase 1: Open Pet Food Facts Bulk Import
 *
 * Free API — imports all US pet food products with ingredient data.
 * Provides barcodes, product names, brands, and ingredients.
 * ~5,000-15,000 products available, many with complete ingredient lists.
 *
 * Cost: $0 (free API, no ScrapingBee needed)
 * Run:  node scripts/mega-scraper/phase1-opff.js
 */

const {
  normalizeCacheKey, extractBrand, detectPetType,
  parseIngredients, validateIngredients,
  dbSave, dbGetExisting,
  log, progress, delay,
} = require("./lib");

const OPFF_API = "https://world.openpetfoodfacts.org/api/v2/search";
const PAGE_SIZE = 100;

// Min ingredients to consider "complete" — skip if already in DB with more
const MIN_INGREDIENTS = 5;

async function fetchPage(page, country) {
  const params = new URLSearchParams({
    page_size: String(PAGE_SIZE),
    page: String(page),
    fields: "product_name,brands,ingredients_text,code,categories_tags,countries_tags,image_url,nutriments",
    ...(country && { countries_tags_en: country }),
  });

  const r = await fetch(`${OPFF_API}?${params}`, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "WoofApp/1.0 (pet-food-database-builder)" },
  });
  if (!r.ok) throw new Error(`OPFF API ${r.status}`);
  return r.json();
}

function cleanProductName(name) {
  if (!name) return "";
  return name
    .replace(/\s*\d+(\.\d+)?\s*(oz|lb|lbs|kg|g|pound|ounce)s?\b/gi, "")
    .replace(/\s*-\s*\d+\s*(count|pack|ct|can|pouch|bag)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function importFromOPFF() {
  log("OPFF", "Starting Open Pet Food Facts import...");

  // First, get total count
  const probe = await fetchPage(1, "united-states");
  const totalProducts = probe.count || 0;
  const totalPages = Math.ceil(totalProducts / PAGE_SIZE);
  log("OPFF", `Found ${totalProducts} US pet food products (${totalPages} pages)`);

  let imported = 0, skipped = 0, noIngredients = 0, invalid = 0, errors = 0;
  let processed = 0;

  for (let page = 1; page <= totalPages; page++) {
    log("OPFF", `Page ${page}/${totalPages}...`);

    let data;
    try {
      data = await fetchPage(page, "united-states");
    } catch (err) {
      log("OPFF", `Page ${page} fetch error: ${err.message}`);
      errors++;
      await delay(2000);
      continue;
    }

    const products = data.products || [];
    if (products.length === 0) break;

    for (const p of products) {
      processed++;
      const name = cleanProductName(p.product_name);
      const brand = p.brands || extractBrand(name);
      const ingredientText = p.ingredients_text;

      if (!name || name.length < 3) {
        invalid++;
        continue;
      }

      if (!ingredientText || ingredientText.length < 10) {
        noIngredients++;
        continue;
      }

      // Parse ingredients
      const ingredients = parseIngredients(ingredientText);
      if (ingredients.length < MIN_INGREDIENTS) {
        invalid++;
        continue;
      }

      // Check if already in DB with more ingredients
      const existing = await dbGetExisting(name, brand);
      if (existing && existing.ingredient_count >= ingredients.length) {
        skipped++;
        continue;
      }

      // Save to DB
      const saved = await dbSave(name, brand, ingredients, ingredientText, "opff", null);
      if (saved) {
        imported++;
        if (imported % 50 === 0) {
          log("OPFF", `Progress: ${imported} imported, ${skipped} skipped, ${processed}/${totalProducts} processed`);
        }
      } else {
        errors++;
      }
    }

    // Small delay between pages to be respectful
    await delay(500);
  }

  // Also try global products (not US-tagged but sold in US)
  log("OPFF", "Checking global products...");
  const globalCategories = [
    "en:cat-food", "en:dog-food", "en:cat-treats", "en:dog-treats",
    "en:dry-cat-food", "en:dry-dog-food", "en:wet-cat-food", "en:wet-dog-food",
  ];

  for (const cat of globalCategories) {
    try {
      const params = new URLSearchParams({
        page_size: "100",
        page: "1",
        fields: "product_name,brands,ingredients_text,code,categories_tags",
        categories_tags: cat,
      });
      const r = await fetch(`${OPFF_API}?${params}`, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "WoofApp/1.0" },
      });
      if (!r.ok) continue;
      const data = await r.json();
      const catPages = Math.min(Math.ceil((data.count || 0) / 100), 50); // Cap at 50 pages per category

      for (let pg = 1; pg <= catPages; pg++) {
        try {
          const pageParams = new URLSearchParams({
            page_size: "100", page: String(pg),
            fields: "product_name,brands,ingredients_text,code,categories_tags",
            categories_tags: cat,
          });
          const pageR = await fetch(`${OPFF_API}?${pageParams}`, {
            signal: AbortSignal.timeout(15000),
            headers: { "User-Agent": "WoofApp/1.0" },
          });
          if (!pageR.ok) continue;
          const pageData = await pageR.json();

          for (const p of (pageData.products || [])) {
            const name = cleanProductName(p.product_name);
            const brand = p.brands || extractBrand(name);
            const ingredientText = p.ingredients_text;
            if (!name || !ingredientText || ingredientText.length < 10) continue;

            const ingredients = parseIngredients(ingredientText);
            if (ingredients.length < MIN_INGREDIENTS) continue;

            const existing = await dbGetExisting(name, brand);
            if (existing && existing.ingredient_count >= ingredients.length) {
              skipped++;
              continue;
            }

            const saved = await dbSave(name, brand, ingredients, ingredientText, "opff", null);
            if (saved) imported++;
          }
        } catch {}
        await delay(300);
      }
    } catch (err) {
      log("OPFF", `Category ${cat} error: ${err.message}`);
    }
  }

  return { imported, skipped, noIngredients, invalid, errors, processed };
}

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  PHASE 1: OPEN PET FOOD FACTS IMPORT");
  console.log("══════════════════════════════════════════════════\n");

  const start = Date.now();
  const results = await importFromOPFF();
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);

  console.log("\n══════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("══════════════════════════════════════════════════");
  console.log(`Imported:       ${results.imported}`);
  console.log(`Skipped:        ${results.skipped} (already in DB with equal/more ingredients)`);
  console.log(`No ingredients: ${results.noIngredients}`);
  console.log(`Invalid:        ${results.invalid}`);
  console.log(`Errors:         ${results.errors}`);
  console.log(`Time:           ${elapsed}s`);
  console.log(`Cost:           $0 (free API)`);
}

main().catch(console.error);
