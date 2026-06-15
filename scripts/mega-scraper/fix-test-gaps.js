#!/usr/bin/env node
/**
 * Fix all gaps found in the 60-product test.
 * 1 missing product + 12 with incomplete ingredient lists.
 */
const { scrapeIngredients, dbSave, dbGetExisting, log, delay } = require("./lib");

const FIX = [
  // MISSING
  { name: "Stella and Chewy's Freeze Dried Raw Stella's Super Beef Dinner Patties Dog Food", brand: "Stella & Chewy's" },
  // INCOMPLETE (dry kibble needs 20+)
  { name: "Blue Buffalo Wilderness Indoor Chicken Recipe Dry Cat Food", brand: "Blue Buffalo" },
  { name: "Pedigree Complete Nutrition Grilled Steak and Vegetable Dry Dog Food", brand: "Pedigree" },
  { name: "Kirkland Signature Healthy Weight Chicken and Vegetable Dog Food", brand: "Kirkland Signature" },
  { name: "4Health Original Chicken and Rice Formula Dry Dog Food", brand: "4Health" },
  { name: "4Health Grain Free Chicken and Potato Dry Dog Food", brand: "4Health" },
  { name: "Open Farm Wild-Caught Salmon Grain-Free Dry Cat Food", brand: "Open Farm" },
  { name: "Go Solutions Carnivore Grain Free Chicken Turkey Duck Dry Dog Food", brand: "Go! Solutions" },
  { name: "FirstMate Pacific Ocean Fish Dry Dog Food", brand: "FirstMate" },
  // These are legitimately short but let's try to get better data
  { name: "Friskies Prime Filets Variety Pack Wet Cat Food", brand: "Friskies" },
  { name: "INABA Churu Chicken Lickable Cat Treats", brand: "INABA" },
  { name: "Zuke's Mini Naturals Chicken Recipe Dog Treats", brand: "Zuke's" },
  { name: "The Farmer's Dog Fresh Turkey Recipe Dog Food", brand: "The Farmer's Dog" },
];

async function main() {
  console.log(`\n=== FIXING ${FIX.length} TEST GAPS ===\n`);
  let fixed = 0, failed = 0;

  for (let i = 0; i < FIX.length; i++) {
    const p = FIX[i];
    log("FIX", `[${i+1}/${FIX.length}] ${p.name.substring(0, 55)}`);

    const result = await scrapeIngredients(p.name, p.brand);
    if (result && result.ingredients.length >= 3) {
      const existing = await dbGetExisting(p.name, p.brand);
      if (!existing || result.ingredients.length > existing.ingredient_count) {
        const saved = await dbSave(p.name, p.brand, result.ingredients, result.text, "web_verified", result.sourceUrl);
        if (saved) {
          fixed++;
          log("FIX", `  ✓ ${result.ingredients.length} ingredients`);
        } else { failed++; }
      } else {
        log("FIX", `  SKIP (existing ${existing.ingredient_count} >= scraped ${result.ingredients.length})`);
      }
    } else {
      failed++;
      log("FIX", `  ✗ Not found`);
    }
    await delay(2500);
  }

  console.log(`\n=== DONE: ${fixed} fixed, ${failed} failed ===`);
}
main().catch(console.error);
