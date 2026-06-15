#!/usr/bin/env node
/**
 * Complete US + Canada pet food coverage.
 * Targets every brand and product line not yet fully covered.
 * Includes Canadian brands (Petcurean, FirstMate, Boreal, etc.)
 * and US brands still missing products.
 */

const { scrapeIngredients, dbSave, dbGetExisting, log, delay } = require("./lib");

const PRODUCTS = [
  // ══════════════════════════════════════════════
  // CANADIAN BRANDS
  // ══════════════════════════════════════════════
  // Petcurean (Go! Solutions, Now Fresh, Gather)
  { name: "Go! Solutions Carnivore Grain Free Chicken Turkey Duck Dry Dog Food", brand: "Go! Solutions" },
  { name: "Go! Solutions Sensitivities Limited Ingredient Salmon Dry Dog Food", brand: "Go! Solutions" },
  { name: "Go! Solutions Skin Coat Care Chicken Dry Dog Food", brand: "Go! Solutions" },
  { name: "Go! Solutions Weight Management Joint Care Chicken Dry Dog Food", brand: "Go! Solutions" },
  { name: "Go! Solutions Carnivore Grain Free Chicken Turkey Duck Dry Cat Food", brand: "Go! Solutions" },
  { name: "Go! Solutions Sensitivities Limited Ingredient Pollock Dry Cat Food", brand: "Go! Solutions" },
  { name: "Go! Solutions Carnivore Grain Free Salmon Cod Dry Cat Food", brand: "Go! Solutions" },
  { name: "Go! Solutions Indoor Chicken Turkey Trout Dry Cat Food", brand: "Go! Solutions" },
  { name: "Now Fresh Grain Free Small Breed Adult Dry Dog Food", brand: "Now Fresh" },
  { name: "Now Fresh Grain Free Large Breed Adult Dry Dog Food", brand: "Now Fresh" },
  { name: "Now Fresh Grain Free Puppy Dry Dog Food", brand: "Now Fresh" },
  { name: "Now Fresh Grain Free Senior Dry Dog Food", brand: "Now Fresh" },
  { name: "Now Fresh Grain Free Adult Dry Cat Food", brand: "Now Fresh" },
  { name: "Now Fresh Grain Free Kitten Dry Cat Food", brand: "Now Fresh" },
  { name: "Now Fresh Grain Free Senior Cat Weight Management Dry Cat Food", brand: "Now Fresh" },
  { name: "Gather Free Acres Organic Chicken Dry Dog Food", brand: "Gather" },
  { name: "Gather Wild Ocean Fish Dry Dog Food", brand: "Gather" },
  { name: "Gather Free Acres Organic Chicken Dry Cat Food", brand: "Gather" },
  // FirstMate
  { name: "FirstMate Pacific Ocean Fish Dry Dog Food", brand: "FirstMate" },
  { name: "FirstMate Chicken Meal and Oats Dry Dog Food", brand: "FirstMate" },
  { name: "FirstMate Grain Friendly Pacific Ocean Fish Dry Dog Food", brand: "FirstMate" },
  { name: "FirstMate Australian Lamb Dry Dog Food", brand: "FirstMate" },
  { name: "FirstMate Pacific Ocean Fish Dry Cat Food", brand: "FirstMate" },
  { name: "FirstMate Chicken Meal and Oats Dry Cat Food", brand: "FirstMate" },
  { name: "FirstMate Indoor Cat Pacific Ocean Fish Dry Cat Food", brand: "FirstMate" },
  // Boreal
  { name: "Boreal Original Chicken Dry Dog Food", brand: "Boreal" },
  { name: "Boreal Proper Large Breed Red Meat Dry Dog Food", brand: "Boreal" },
  { name: "Boreal Vital All Breed Red Meat Grain Free Dry Dog Food", brand: "Boreal" },
  { name: "Boreal Original Chicken Dry Cat Food", brand: "Boreal" },
  // Performatrin
  { name: "Performatrin Ultra Grain Free Chicken Dry Dog Food", brand: "Performatrin" },
  { name: "Performatrin Ultra Original Chicken Dry Dog Food", brand: "Performatrin" },
  { name: "Performatrin Ultra Grain Free Chicken Dry Cat Food", brand: "Performatrin" },
  // Nutrience
  { name: "Nutrience Original Adult Chicken Brown Rice Dry Dog Food", brand: "Nutrience" },
  { name: "Nutrience Subzero Canadian Pacific Dry Dog Food", brand: "Nutrience" },
  { name: "Nutrience Original Indoor Chicken Dry Cat Food", brand: "Nutrience" },
  { name: "Nutrience Subzero Canadian Pacific Dry Cat Food", brand: "Nutrience" },
  // Canadian Naturals
  { name: "Canadian Naturals Grain Free Chicken Dry Dog Food", brand: "Canadian Naturals" },
  { name: "Canadian Naturals Original Chicken Brown Rice Dry Dog Food", brand: "Canadian Naturals" },
  // Horizon
  { name: "Horizon Pulsar Chicken Grain Free Dry Dog Food", brand: "Horizon" },
  { name: "Horizon Legacy Adult Grain Free Dry Dog Food", brand: "Horizon" },
  // ══════════════════════════════════════════════
  // MISSING US BRANDS — Full product lines
  // ══════════════════════════════════════════════
  // Earthborn Holistic (missing variants)
  { name: "Earthborn Holistic Great Plains Feast Grain Free Dry Dog Food", brand: "Earthborn Holistic" },
  { name: "Earthborn Holistic Meadow Feast Grain Free Dry Dog Food", brand: "Earthborn Holistic" },
  { name: "Earthborn Holistic Primitive Natural Grain Free Dry Dog Food", brand: "Earthborn Holistic" },
  { name: "Earthborn Holistic Venture Alaska Pollock Dry Dog Food", brand: "Earthborn Holistic" },
  { name: "Earthborn Holistic Venture Rabbit Meal and Pumpkin Dry Dog Food", brand: "Earthborn Holistic" },
  { name: "Earthborn Holistic Unrefined Roasted Lamb Dry Dog Food", brand: "Earthborn Holistic" },
  { name: "Earthborn Holistic Unrefined Roasted Rabbit Dry Dog Food", brand: "Earthborn Holistic" },
  { name: "Earthborn Holistic Wild Sea Catch Grain Free Dry Cat Food", brand: "Earthborn Holistic" },
  { name: "Earthborn Holistic Primitive Feline Grain Free Dry Cat Food", brand: "Earthborn Holistic" },
  // Solid Gold (missing variants)
  { name: "Solid Gold Hund-N-Flocken Lamb Brown Rice Dry Dog Food", brand: "Solid Gold" },
  { name: "Solid Gold Buck Wild Venison Dry Dog Food", brand: "Solid Gold" },
  { name: "Solid Gold Leaping Waters Salmon Dry Dog Food", brand: "Solid Gold" },
  { name: "Solid Gold Wolf King Large Breed Bison Dry Dog Food", brand: "Solid Gold" },
  { name: "Solid Gold Mighty Mini Small Breed Chicken Dry Dog Food", brand: "Solid Gold" },
  { name: "Solid Gold NutrientBoost Let's Stay In Indoor Chicken Dry Cat Food", brand: "Solid Gold" },
  { name: "Solid Gold Indigo Moon High Protein Chicken Dry Cat Food", brand: "Solid Gold" },
  // Halo
  { name: "Halo Holistic Cage-Free Chicken Small Breed Dry Dog Food", brand: "Halo" },
  { name: "Halo Holistic Wild Salmon Grain Free Dry Dog Food", brand: "Halo" },
  { name: "Halo Holistic Cage-Free Chicken Dry Dog Food", brand: "Halo" },
  { name: "Halo Holistic Puppy Cage-Free Chicken Dry Dog Food", brand: "Halo" },
  { name: "Halo Holistic Senior Turkey Dry Dog Food", brand: "Halo" },
  { name: "Halo Holistic Cage-Free Chicken Indoor Cat Dry Cat Food", brand: "Halo" },
  { name: "Halo Holistic Wild Salmon Grain Free Indoor Cat Dry Cat Food", brand: "Halo" },
  // I and Love and You
  { name: "I and Love and You Naked Essentials Lamb and Bison Dry Dog Food", brand: "I and Love and You" },
  { name: "I and Love and You Nude Food Red Meat Medley Grain Free Dry Dog Food", brand: "I and Love and You" },
  { name: "I and Love and You Lovingly Simple Salmon Sweet Potato Dry Dog Food", brand: "I and Love and You" },
  { name: "I and Love and You Naked Essentials Chicken and Duck Dry Cat Food", brand: "I and Love and You" },
  { name: "I and Love and You Oh My Cod Pate Wet Cat Food", brand: "I and Love and You" },
  // Farmina N&D
  { name: "Farmina N&D Prime Chicken and Pomegranate Adult Dry Dog Food", brand: "Farmina" },
  { name: "Farmina N&D Pumpkin Chicken and Pomegranate Adult Dry Dog Food", brand: "Farmina" },
  { name: "Farmina N&D Ancestral Grain Chicken and Pomegranate Dry Dog Food", brand: "Farmina" },
  { name: "Farmina N&D Quinoa Skin Coat Venison Dry Dog Food", brand: "Farmina" },
  { name: "Farmina N&D Prime Lamb and Blueberry Puppy Dry Dog Food", brand: "Farmina" },
  { name: "Farmina N&D Prime Chicken and Pomegranate Adult Dry Cat Food", brand: "Farmina" },
  { name: "Farmina N&D Pumpkin Duck and Cantaloupe Adult Dry Cat Food", brand: "Farmina" },
  { name: "Farmina N&D Quinoa Digestion Lamb Dry Cat Food", brand: "Farmina" },
  // Rawz
  { name: "Rawz Meal Free Chicken Dry Dog Food", brand: "Rawz" },
  { name: "Rawz Meal Free Salmon Dehydrated Chicken Dry Dog Food", brand: "Rawz" },
  { name: "Rawz Meal Free Duck Dry Dog Food", brand: "Rawz" },
  { name: "Rawz Meal Free Chicken Dry Cat Food", brand: "Rawz" },
  { name: "Rawz Meal Free Salmon Dry Cat Food", brand: "Rawz" },
  { name: "Rawz 96 Percent Chicken Wet Dog Food", brand: "Rawz" },
  { name: "Rawz 96 Percent Beef Wet Dog Food", brand: "Rawz" },
  // Koha
  { name: "Koha Limited Ingredient Turkey Stew Wet Dog Food", brand: "Koha" },
  { name: "Koha Limited Ingredient Chicken Stew Wet Dog Food", brand: "Koha" },
  { name: "Koha Limited Ingredient Lamb Stew Wet Dog Food", brand: "Koha" },
  { name: "Koha Limited Ingredient Turkey Pate Wet Cat Food", brand: "Koha" },
  { name: "Koha Limited Ingredient Chicken Pate Wet Cat Food", brand: "Koha" },
  // Primal
  { name: "Primal Freeze Dried Nuggets Chicken Dry Dog Food", brand: "Primal" },
  { name: "Primal Freeze Dried Nuggets Beef Dry Dog Food", brand: "Primal" },
  { name: "Primal Freeze Dried Nuggets Duck Dry Dog Food", brand: "Primal" },
  { name: "Primal Freeze Dried Nuggets Chicken Dry Cat Food", brand: "Primal" },
  { name: "Primal Freeze Dried Nuggets Turkey Dry Cat Food", brand: "Primal" },
  // Lotus
  { name: "Lotus Oven Baked Chicken Adult Dry Dog Food", brand: "Lotus" },
  { name: "Lotus Oven Baked Lamb Adult Dry Dog Food", brand: "Lotus" },
  { name: "Lotus Oven Baked Chicken Small Breed Dry Dog Food", brand: "Lotus" },
  { name: "Lotus Oven Baked Chicken Adult Dry Cat Food", brand: "Lotus" },
  // Wysong
  { name: "Wysong Optimal Adult Dry Dog Food", brand: "Wysong" },
  { name: "Wysong Synorgon Dry Dog Food", brand: "Wysong" },
  { name: "Wysong Vitality Adult Dry Cat Food", brand: "Wysong" },
  { name: "Wysong Uretic Dry Cat Food", brand: "Wysong" },
  // Annamaet
  { name: "Annamaet Ultra 32 Chicken Dry Dog Food", brand: "Annamaet" },
  { name: "Annamaet Grain Free Lean Dry Dog Food", brand: "Annamaet" },
  { name: "Annamaet Feline Chicken and Fish Dry Cat Food", brand: "Annamaet" },
  // Nature's Variety (Instinct missing)
  { name: "Instinct Raw Boost Mixers Chicken Freeze Dried Dog Food Topper", brand: "Instinct" },
  { name: "Instinct Limited Ingredient Diet Grain Free Lamb Dry Dog Food", brand: "Instinct" },
  { name: "Instinct Raw Boost Whole Grain Chicken Dry Dog Food", brand: "Instinct" },
  { name: "Instinct Original Grain Free Duck Dry Dog Food", brand: "Instinct" },
  { name: "Instinct Original Grain Free Salmon Dry Cat Food", brand: "Instinct" },
  { name: "Instinct Limited Ingredient Diet Grain Free Rabbit Dry Cat Food", brand: "Instinct" },
  { name: "Instinct Raw Boost Mixers Chicken Freeze Dried Cat Food Topper", brand: "Instinct" },
  // Castor and Pollux / Organix
  { name: "Castor and Pollux Organix Organic Chicken and Brown Rice Dry Dog Food", brand: "Castor and Pollux" },
  { name: "Castor and Pollux Organix Grain Free Chicken Dry Dog Food", brand: "Castor and Pollux" },
  { name: "Castor and Pollux Pristine Grain Free Chicken Dry Dog Food", brand: "Castor and Pollux" },
  { name: "Castor and Pollux Organix Organic Chicken Dry Cat Food", brand: "Castor and Pollux" },
  // Avoderm (missing)
  { name: "AvoDerm Natural Chicken and Herring Dry Cat Food", brand: "AvoDerm" },
  { name: "AvoDerm Natural Indoor Hairball Chicken Dry Cat Food", brand: "AvoDerm" },
  { name: "AvoDerm Natural Puppy Chicken Dry Dog Food", brand: "AvoDerm" },
  // Blackwood
  { name: "Blackwood Chicken Meal and Rice Dry Dog Food", brand: "Blackwood" },
  { name: "Blackwood Grain Free Salmon Dry Dog Food", brand: "Blackwood" },
  // Dr. Tim's
  { name: "Dr. Tim's Active Dog Pursuit Chicken Dry Dog Food", brand: "Dr. Tim's" },
  { name: "Dr. Tim's Kinesis All Life Stages Chicken Dry Dog Food", brand: "Dr. Tim's" },
  // Grandma Lucy's
  { name: "Grandma Lucy's Artisan Chicken Freeze Dried Dry Dog Food", brand: "Grandma Lucy's" },
  { name: "Grandma Lucy's Pureformance Chicken Freeze Dried Dry Dog Food", brand: "Grandma Lucy's" },
  // Inception
  { name: "Inception Chicken Dry Dog Food", brand: "Inception" },
  { name: "Inception Fish Dry Dog Food", brand: "Inception" },
  { name: "Inception Chicken Dry Cat Food", brand: "Inception" },
  // Nature's Logic (missing)
  { name: "Nature's Logic Distinction Duck Dry Dog Food", brand: "Nature's Logic" },
  { name: "Nature's Logic Canine Chicken Meal Feast Dry Dog Food", brand: "Nature's Logic" },
  { name: "Nature's Logic Feline Chicken Meal Feast Dry Cat Food", brand: "Nature's Logic" },
  // Weruva (missing)
  { name: "Weruva Dogs in the Kitchen Goldie Lox Chicken Salmon Wet Dog Food", brand: "Weruva" },
  { name: "Weruva Dogs in the Kitchen Funk in the Trunk Chicken Pumpkin Wet Dog Food", brand: "Weruva" },
  { name: "Weruva Paw Lickin Chicken Wet Cat Food", brand: "Weruva" },
  { name: "Weruva Mideast Feast Tuna and Tilapia Wet Cat Food", brand: "Weruva" },
  { name: "Weruva Mack and Jack Mackerel and Skipjack Wet Cat Food", brand: "Weruva" },
  { name: "Weruva Best Feline Friend Tuna and Chicken Wet Cat Food", brand: "Weruva" },
  // Just Food For Dogs / Spot & Tango (missing)
  { name: "Just Food For Dogs Beef and Russet Potato Recipe", brand: "Just Food For Dogs" },
  { name: "Just Food For Dogs Turkey and Whole Wheat Macaroni Recipe", brand: "Just Food For Dogs" },
  { name: "Just Food For Dogs Lamb and Brown Rice Recipe", brand: "Just Food For Dogs" },
  { name: "Just Food For Dogs Fish and Sweet Potato Recipe", brand: "Just Food For Dogs" },
  { name: "Spot and Tango Unkibble Turkey Red Quinoa Dog Food", brand: "Spot and Tango" },
  { name: "Spot and Tango Unkibble Duck and Salmon Dog Food", brand: "Spot and Tango" },
  { name: "Spot and Tango Unkibble Lamb and Brown Rice Dog Food", brand: "Spot and Tango" },
  // Purina missing variants
  { name: "Purina Beyond Simply Natural Chicken Dry Dog Food", brand: "Purina Beyond" },
  { name: "Purina Beyond Grain Free Ocean Whitefish Dry Dog Food", brand: "Purina Beyond" },
  { name: "Purina Beyond Simply Natural Chicken Dry Cat Food", brand: "Purina Beyond" },
  { name: "Purina Beyond Grain Free Ocean Whitefish Dry Cat Food", brand: "Purina Beyond" },
  { name: "Purina Dog Chow Complete Adult Lamb Dry Dog Food", brand: "Purina Dog Chow" },
  { name: "Purina Dog Chow Complete Puppy Chicken Dry Dog Food", brand: "Purina Dog Chow" },
  { name: "Purina Cat Chow Complete Chicken Dry Cat Food", brand: "Purina Cat Chow" },
  { name: "Purina Kit & Kaboodle Original Dry Cat Food", brand: "Purina" },
  { name: "Purina Kitten Chow Nurture Chicken Dry Cat Food", brand: "Purina" },
];

async function main() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  US + CANADA COMPLETE — ${PRODUCTS.length} PRODUCTS`);
  console.log(`══════════════════════════════════════════════════\n`);

  let imported = 0, skipped = 0, failed = 0;

  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const num = `[${String(i + 1).padStart(3)}/${PRODUCTS.length}]`;

    const existing = await dbGetExisting(p.name, p.brand);
    if (existing && existing.ingredient_count >= 5) { skipped++; continue; }

    const result = await scrapeIngredients(p.name, p.brand);
    if (result && result.ingredients.length >= 1) {
      const saved = await dbSave(p.name, p.brand, result.ingredients, result.text, "web_verified", result.sourceUrl);
      if (saved) {
        imported++;
        log("USCA", `${num} ✓ ${p.name.substring(0, 50)} — ${result.ingredients.length}`);
      } else { failed++; }
    } else {
      failed++;
      log("USCA", `${num} ✗ ${p.name.substring(0, 50)}`);
    }
    await delay(2000);
  }

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`Imported: ${imported} | Skipped: ${skipped} | Failed: ${failed} | Total: ${PRODUCTS.length}`);
}
main().catch(console.error);
