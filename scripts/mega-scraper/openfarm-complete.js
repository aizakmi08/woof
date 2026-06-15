#!/usr/bin/env node
/**
 * Complete Open Farm catalog — finds ingredients for ALL missing products
 * using Google search + ScrapingBee + GPT extraction.
 */

const { scrapeIngredients, dbSave, dbGetExisting, log, delay } = require("./lib");

const BRAND = "Open Farm";

// Every Open Farm product that needs to be in the database
const ALL_PRODUCTS = [
  // ── DOG KIBBLE — Ancient Grains ──
  "Open Farm Small Breed Ancient Grains Dog Kibble",
  "Open Farm Salmon Ancient Grains Puppy Dog Kibble",
  // ── DOG KIBBLE — Grain-Free ──
  "Open Farm New Zealand Venison Grain-Free Dog Kibble",
  "Open Farm Small Breed Grain-Free Dog Kibble",
  "Open Farm Salmon Grain-Free Puppy Dog Kibble",
  "Open Farm Chicken Whitefish Healthy Weight Grain-Free Dog Kibble",
  // ── DOG KIBBLE — Tailored / Functional ──
  "Open Farm Salmon Oatmeal Skin Coat Health Dog Kibble",
  "Open Farm Pollock Oatmeal Digestive Health Dog Kibble",
  // ── DOG KIBBLE — GoodGut ──
  "Open Farm GoodGut Harvest Chicken Dog Kibble",
  "Open Farm GoodGut Grass-Fed Beef Dog Kibble",
  "Open Farm GoodGut Wild-Caught Salmon Dog Kibble",
  // ── DOG KIBBLE — Kind Earth ──
  "Open Farm Kind Earth Plant-Based Dog Kibble",
  "Open Farm Kind Earth Premium Insect Dog Kibble",
  // ── DOG — Air Dried ──
  "Open Farm Harvest Chicken Air Dried Dog Food",
  "Open Farm Surf Turf Air Dried Dog Food",
  "Open Farm Pollock Lamb Air Dried Dog Food",
  // ── DOG — Epic Blend Grain-Free ──
  "Open Farm Epic Blend Chicken Superfood Grain-Free Dog Kibble",
  "Open Farm Epic Blend Beef Superfood Grain-Free Dog Kibble",
  "Open Farm Epic Blend Salmon Superfood Grain-Free Dog Kibble",
  // ── DOG — RawMix missing variants ──
  "Open Farm RawMix Great Plains Ancient Grains Dog Kibble",
  "Open Farm RawMix Tide Terrain Ancient Grains Dog Kibble",
  "Open Farm RawMix Large Breed Ancient Grains Dog Kibble",
  "Open Farm RawMix Ancient Grains Puppy Dog Kibble",
  "Open Farm RawMix Great Plains Grain-Free Dog Kibble",
  "Open Farm RawMix Tide Terrain Grain-Free Dog Kibble",
  "Open Farm RawMix Large Breed Grain-Free Dog Kibble",
  "Open Farm RawMix Grain-Free Puppy Dog Kibble",
  // ── DOG — Freshly Crafted (Gently Cooked) missing ──
  "Open Farm Surf Turf Grain-Free Freshly Crafted Dog Food",
  "Open Farm Pasture-Raised Lamb Freshly Crafted Dog Food",
  "Open Farm Wild-Caught Fish Freshly Crafted Dog Food",
  "Open Farm Puppy Grain-Free Freshly Crafted Dog Food",
  "Open Farm Tummy Rescue Freshly Crafted Dog Food",
  "Open Farm Goodbowl Harvest Chicken Freshly Crafted Dog Food",
  "Open Farm Goodbowl Grass-Fed Beef Freshly Crafted Dog Food",
  // ── DOG — Freshly Crafted Rolls ──
  "Open Farm Goodbowl Harvest Chicken Freshly Crafted Roll Dog Food",
  "Open Farm Goodbowl Chicken Grass-Fed Beef Freshly Crafted Roll Dog Food",
  "Open Farm Goodbowl Turkey Salmon Freshly Crafted Roll Dog Food",
  // ── DOG — Freshly Crafted Meatballs ──
  "Open Farm Grass-Fed Beef Pork Freshly Crafted Meatballs Dog Food",
  "Open Farm Harvest Chicken Freshly Crafted Meatballs Dog Food",
  "Open Farm Turkey Salmon Freshly Crafted Meatballs Dog Food",
  // ── DOG — Freeze-Dried Raw missing morsels ──
  "Open Farm Homestead Turkey Freeze Dried Raw Morsels Dog Food",
  "Open Farm Pasture-Raised Lamb Freeze Dried Raw Morsels Dog Food",
  "Open Farm Farmer's Table Pork Freeze Dried Raw Morsels Dog Food",
  "Open Farm Chicken Salmon Freeze Dried Raw Puppy Morsels Dog Food",
  // ── DOG — Freeze-Dried Raw Patties ──
  "Open Farm Harvest Chicken Freeze Dried Raw Patties Dog Food",
  "Open Farm Grass-Fed Beef Freeze Dried Raw Patties Dog Food",
  "Open Farm Homestead Turkey Freeze Dried Raw Patties Dog Food",
  "Open Farm Surf Turf Freeze Dried Raw Patties Dog Food",
  "Open Farm Chicken Salmon Freeze Dried Raw Puppy Patties Dog Food",
  // ── DOG — RawMix Freeze Dried Morsels ──
  "Open Farm RawMix Front Range Freeze Dried Raw Morsels Dog Food",
  "Open Farm RawMix Open Prairie Freeze Dried Raw Morsels Dog Food",
  "Open Farm RawMix Tide Terrain Freeze Dried Raw Morsels Dog Food",
  // ── DOG — Goodbowl Freeze Dried Morsels ──
  "Open Farm Goodbowl Harvest Chicken Freeze Dried Raw Morsels Dog Food",
  "Open Farm Goodbowl Grass-Fed Beef Freeze Dried Raw Morsels Dog Food",
  "Open Farm Goodbowl Wild-Caught Salmon Freeze Dried Raw Morsels Dog Food",
  // ── DOG — Wet Food Rustic Stew missing ──
  "Open Farm Chicken Salmon Rustic Stew Wet Dog Food",
  "Open Farm Herring Mackerel Rustic Stew Wet Dog Food",
  // ── DOG — Pates Original ──
  "Open Farm Harvest Chicken Pate for Dogs",
  "Open Farm Homestead Turkey Pate for Dogs",
  "Open Farm Chicken Grass-Fed Beef Pate for Dogs",
  "Open Farm Chicken Salmon Pate for Dogs",
  "Open Farm Surf Turf Pate for Dogs",
  "Open Farm Puppy Chicken Salmon Pate for Dogs",
  "Open Farm Kind Earth Plant Pate Ancient Grains for Dogs",
  // ── DOG — Pates Tailored ──
  "Open Farm Chicken Pollock Healthy Weight Pate for Dogs",
  "Open Farm Pollock Salmon Skin Coat Health Pate for Dogs",
  "Open Farm Whitefish Pollock Digestive Health Pate for Dogs",
  // ── DOG — Pates Goodbowl ──
  "Open Farm Goodbowl Harvest Chicken Grass-Fed Beef Pate for Dogs",
  "Open Farm Goodbowl Harvest Chicken Salmon Pate for Dogs",
  "Open Farm Goodbowl Harvest Chicken Pate for Dogs",
  "Open Farm Goodbowl Homestead Turkey Pate for Dogs",
  "Open Farm Goodbowl Whitefish Salmon Pate for Dogs",
  // ── DOG — Icelandic Fish Wet ──
  "Open Farm Icelandic Cod Arctic Char Wet Dog Food",
  "Open Farm Icelandic Salmon Cod Wet Dog Food",
  "Open Farm Icelandic Cod Herring Wet Dog Food",
  "Open Farm Icelandic Salmon Capelin Wet Dog Food",
  // ── DOG — Toppers ──
  "Open Farm Salmon Cod Topper for Dogs",
  "Open Farm Salmon Topper for Dogs",
  "Open Farm Arctic Char Topper for Dogs",
  // ── DOG — Supplements ──
  "Open Farm Hip Joint Health Supplement Chews for Dogs",
  "Open Farm Calming Health Supplement Chews for Dogs",
  "Open Farm Probiotic Food Supplement Chews for Dogs",
  "Open Farm Skin Coat Food Supplement Chews for Dogs",
  "Open Farm Immune Health Supplement Chews for Dogs",
  // ── DOG — Freeze Dried Raw Treats ──
  "Open Farm Freeze Dried Raw Chicken Dog Treat",
  "Open Farm Freeze Dried Raw Chicken Liver Dog Treat",
  "Open Farm Freeze Dried Raw Beef Liver Dog Treat",
  "Open Farm Freeze Dried Raw Lamb Liver Dog Treat",
  "Open Farm Freeze Dried Raw Lamb Lung Dog Treat",
  // ── DOG — Dehydrated Treats missing ──
  "Open Farm Dehydrated Pork Dog Treats",
  "Open Farm Dehydrated Cod Fish Dog Treats",
  "Open Farm Dehydrated Cod Skins Dog Treats",
  // ── DOG — Better Biscuits ──
  "Open Farm Better Biscuits Chicken Oatmeal Dog Treats",
  "Open Farm Better Biscuits Grass-Fed Beef Oatmeal Dog Treats",
  "Open Farm Better Biscuits Turkey Oatmeal Dog Treats",
  "Open Farm Better Biscuits Salmon Oatmeal Dog Treats",
  "Open Farm Better Biscuits Peanut Butter Banana Dog Treats",
  // ── DOG — Be Good Bites ──
  "Open Farm Be Good Bites Chicken Dog Treats",
  "Open Farm Be Good Bites Grass-Fed Beef Dog Treats",
  "Open Farm Be Good Bites Turkey Dog Treats",
  "Open Farm Be Good Bites Salmon Dog Treats",
  "Open Farm Be Good Bites Plant Pumpkin Dog Treats",
  "Open Farm Be Good Bites Insect Wholesome Grain Dog Treats",
  // ── DOG — Jerky Strips missing ──
  "Open Farm Jerky Strips Turkey Dog Treats",
  // ── DOG — Icelandic Air-Dried Treats ──
  "Open Farm Icelandic Air-Dried Cod Blueberry Dog Treat Bars",
  "Open Farm Icelandic Air-Dried Pollock Blueberry Dog Treat Bars",
  "Open Farm Icelandic Air-Dried Haddock Blueberry Dog Treat Bars",
  "Open Farm Icelandic Air-Dried Cod Skins Dog Treat Sticks",
  // ── CAT — Supplement ──
  "Open Farm Icelandic Herring Salmon Oil for Cats",
];

async function main() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  OPEN FARM COMPLETE CATALOG — ${ALL_PRODUCTS.length} MISSING PRODUCTS`);
  console.log(`══════════════════════════════════════════════════\n`);

  let imported = 0, skipped = 0, failed = 0;

  for (let i = 0; i < ALL_PRODUCTS.length; i++) {
    const name = ALL_PRODUCTS[i];
    const num = `[${String(i + 1).padStart(3)}/${ALL_PRODUCTS.length}]`;

    // Check if already in DB
    const existing = await dbGetExisting(name, BRAND);
    if (existing && existing.ingredient_count >= 3) {
      skipped++;
      log("OF", `${num} SKIP ${name.substring(0, 55)} (${existing.ingredient_count} in DB)`);
      continue;
    }

    log("OF", `${num} Searching: ${name.substring(0, 55)}`);

    const result = await scrapeIngredients(name, BRAND);

    if (result && result.ingredients.length >= 1) {
      const saved = await dbSave(name, BRAND, result.ingredients, result.text, "brand", result.sourceUrl);
      if (saved) {
        imported++;
        log("OF", `${num} ✓ ${name.substring(0, 50)} — ${result.ingredients.length} ingredients`);
      } else {
        failed++;
      }
    } else {
      failed++;
      log("OF", `${num} ✗ ${name.substring(0, 55)} — not found`);
    }

    await delay(2000);
  }

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  RESULTS`);
  console.log(`══════════════════════════════════════════════════`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped:  ${skipped} (already in DB)`);
  console.log(`Failed:   ${failed}`);
  console.log(`Total:    ${ALL_PRODUCTS.length}`);
}

main().catch(console.error);
