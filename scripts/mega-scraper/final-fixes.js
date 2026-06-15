#!/usr/bin/env node
/**
 * Final fixes — targets specific data quality issues:
 * 1. Products where description text was scraped instead of ingredients
 * 2. Missing variants from low-coverage brands
 * 3. Duplicate cleanup
 */

const { scrapeIngredients, dbSave, dbGetExisting, log, delay, SB_URL, SB_KEY } = require("./lib");

// Brand gaps to fill
const MISSING = [
  // Kit & Kaboodle missing
  { name: "Kit and Kaboodle Essentials Indoor Dry Cat Food", brand: "Kit and Kaboodle" },
  { name: "Kit and Kaboodle Original Dry Cat Food Chicken Salmon Turkey Flavors", brand: "Kit and Kaboodle" },
  // Special Kitty missing
  { name: "Special Kitty Gourmet Formula Dry Cat Food Seafood", brand: "Special Kitty" },
  { name: "Special Kitty Outdoor Dry Cat Food", brand: "Special Kitty" },
  { name: "Special Kitty Natural Dry Cat Food Chicken Brown Rice", brand: "Special Kitty" },
  { name: "Special Kitty Tender Favorites Variety Pack Wet Cat Food", brand: "Special Kitty" },
  // Member's Mark missing
  { name: "Member's Mark Exceed Grain Free Turkey Dry Dog Food", brand: "Member's Mark" },
  { name: "Member's Mark Exceed Large Breed Chicken Dry Dog Food", brand: "Member's Mark" },
  { name: "Member's Mark Exceed Grain Free Indoor Cat Food", brand: "Member's Mark" },
  // Stella & Chewy's — make sure key variants are covered
  { name: "Stella and Chewy's Freeze Dried Raw Stella's Super Beef Dinner Patties Dog Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Freeze Dried Raw Tantalizing Turkey Dinner Patties Dog Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Freeze Dried Raw Duck Duck Goose Dinner Patties Dog Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Raw Blend Baked Kibble Cage Free Chicken Dry Dog Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Raw Blend Baked Kibble Wild Caught Dry Dog Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Raw Blend Baked Kibble Red Meat Dry Dog Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Raw Coated Baked Kibble Cage Free Chicken Dry Dog Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Raw Coated Baked Kibble Wild Caught Dry Dog Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Absolutely Rabbit Freeze Dried Raw Dinner Morsels Cat Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Chick Chick Chicken Freeze Dried Raw Dinner Morsels Cat Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Tummy Ticklin Turkey Freeze Dried Raw Dinner Morsels Cat Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Sea-licious Salmon Cod Freeze Dried Raw Dinner Morsels Cat Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Raw Coated Baked Kibble Cage Free Chicken Dry Cat Food", brand: "Stella & Chewy's" },
  { name: "Stella and Chewy's Raw Coated Baked Kibble Wild Caught Dry Cat Food", brand: "Stella & Chewy's" },
  // Tiki Cat — expand
  { name: "Tiki Cat Luau Ahi Tuna and Chicken Wet Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat Luau Wild Salmon Wet Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat After Dark Chicken and Quail Egg Wet Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat Grill Ahi Tuna Wet Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat Silver Comfort Mousse Chicken Wet Senior Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Dog Aloha Petites Chicken Wet Dog Food", brand: "Tiki Dog" },
  // 9 Lives expand
  { name: "9 Lives Lean and Tasty Dry Cat Food Chicken Salmon Flavors", brand: "9 Lives" },
  { name: "9 Lives Plus Care Tuna Egg Dry Cat Food", brand: "9 Lives" },
  { name: "9 Lives Indoor Complete Chicken Salmon Dry Cat Food", brand: "9 Lives" },
  { name: "9 Lives Meaty Pate with Real Chicken Wet Cat Food", brand: "9 Lives" },
  { name: "9 Lives Super Supper Wet Cat Food", brand: "9 Lives" },
  { name: "9 Lives Hearty Cuts with Real Turkey Wet Cat Food", brand: "9 Lives" },
  // Ziwi Peak expand
  { name: "Ziwi Peak Air-Dried Free Range Chicken Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Grass-Fed Lamb Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried New Zealand Free Range Chicken Cat Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Mackerel and Lamb Cat Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Provenance East Cape Dry Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Provenance Otago Valley Dry Dog Food", brand: "Ziwi Peak" },
  // Primal expand
  { name: "Primal Freeze Dried Nuggets Lamb Dry Dog Food", brand: "Primal" },
  { name: "Primal Freeze Dried Nuggets Pork Dry Dog Food", brand: "Primal" },
  { name: "Primal Freeze Dried Nuggets Venison Dry Dog Food", brand: "Primal" },
  { name: "Primal Raw Frozen Formula Chicken Dry Dog Food", brand: "Primal" },
  { name: "Primal Freeze Dried Nuggets Rabbit Dry Cat Food", brand: "Primal" },
  { name: "Primal Freeze Dried Nuggets Beef and Salmon Dry Cat Food", brand: "Primal" },
  // Rawz expand
  { name: "Rawz Meal Free Turkey Dehydrated Chicken Dry Dog Food", brand: "Rawz" },
  { name: "Rawz 96 Percent Turkey Wet Dog Food", brand: "Rawz" },
  { name: "Rawz 96 Percent Lamb Wet Dog Food", brand: "Rawz" },
  { name: "Rawz Meal Free Dehydrated Chicken Duck Dry Cat Food", brand: "Rawz" },
  { name: "Rawz 96 Percent Chicken and Chicken Liver Wet Cat Food", brand: "Rawz" },
  { name: "Rawz 96 Percent Turkey and Turkey Liver Wet Cat Food", brand: "Rawz" },
];

async function fixBadScrapes() {
  log("FIX", "Finding products with description text instead of ingredients...");

  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/product_data?select=product_name,brand,ingredient_count,ingredient_text,cache_key&order=cache_key&offset=${offset}&limit=1000`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const d = await r.json();
    all.push(...d);
    if (d.length < 1000) break;
  }

  // Find products where ingredient_text starts with marketing/description text
  const badPatterns = [
    /^treat your/i, /^every /i, /^made with/i, /^our /i, /^this /i,
    /^a /i, /^the /i, /^we /i, /^packed with/i, /^crafted/i,
    /^featuring/i, /^contains/i, /^includes/i,
  ];

  const bad = all.filter(p => {
    if (!p.ingredient_text) return false;
    const first50 = p.ingredient_text.substring(0, 50);
    return badPatterns.some(pat => pat.test(first50));
  });

  log("FIX", `Found ${bad.length} products with description text as ingredients`);

  let fixed = 0;
  for (let i = 0; i < bad.length; i++) {
    const p = bad[i];
    const brand = p.brand || "";
    const result = await scrapeIngredients(p.product_name, brand);
    if (result && result.ingredients.length >= 3) {
      const saved = await dbSave(p.product_name, brand, result.ingredients, result.text, "web_verified", result.sourceUrl);
      if (saved) {
        fixed++;
        log("FIX", `✓ Fixed bad scrape: ${p.product_name.substring(0, 50)}`);
      }
    }
    await delay(2500);
  }
  return fixed;
}

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  FINAL DATA FIXES");
  console.log("══════════════════════════════════════════════════\n");

  // 1. Fix bad scrapes
  const badFixed = await fixBadScrapes();
  console.log(`\nBad scrapes fixed: ${badFixed}\n`);

  // 2. Fill brand gaps
  log("FIX", `Filling ${MISSING.length} brand gaps...\n`);
  let imported = 0, skipped = 0, failed = 0;

  for (let i = 0; i < MISSING.length; i++) {
    const p = MISSING[i];
    const num = `[${String(i + 1).padStart(2)}/${MISSING.length}]`;

    const existing = await dbGetExisting(p.name, p.brand);
    if (existing && existing.ingredient_count >= 3) { skipped++; continue; }

    const result = await scrapeIngredients(p.name, p.brand);
    if (result && result.ingredients.length >= 1) {
      const saved = await dbSave(p.name, p.brand, result.ingredients, result.text, "web_verified", result.sourceUrl);
      if (saved) {
        imported++;
        log("FIX", `${num} ✓ ${p.name.substring(0, 50)} — ${result.ingredients.length}`);
      } else { failed++; }
    } else {
      failed++;
      log("FIX", `${num} ✗ ${p.name.substring(0, 50)}`);
    }
    await delay(2500);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log(`Bad scrapes fixed:  ${badFixed}`);
  console.log(`Brand gaps filled:  ${imported}`);
  console.log(`Skipped:            ${skipped}`);
  console.log(`Failed:             ${failed}`);
}

main().catch(console.error);
