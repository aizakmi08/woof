#!/usr/bin/env node
/**
 * Target underrepresented major US brands — fill out their full product lines.
 * Uses Google + ScrapingBee + GPT extraction.
 */

const { scrapeIngredients, dbSave, dbGetExisting, log, delay } = require("./lib");

const PRODUCTS = [
  // ══════════════════════════════════════════════
  // TASTE OF THE WILD — full line
  // ══════════════════════════════════════════════
  { name: "Taste of the Wild Appalachian Valley Small Breed Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Southwest Canyon Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Pine Forest Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Ancient Prairie Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Ancient Mountain Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Ancient Stream Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Ancient Wetlands Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Prey Angus Beef Limited Ingredient Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Prey Turkey Limited Ingredient Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Prey Trout Limited Ingredient Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Pacific Stream Puppy Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild High Prairie Puppy Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild High Prairie Canned Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Pacific Stream Canned Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Southwest Canyon Canned Dog Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Lowland Creek Cat Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Prey Angus Beef Cat Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Prey Turkey Cat Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Prey Trout Cat Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Canyon River Canned Cat Food", brand: "Taste of the Wild" },
  { name: "Taste of the Wild Rocky Mountain Canned Cat Food", brand: "Taste of the Wild" },
  // ══════════════════════════════════════════════
  // RACHAEL RAY NUTRISH — full line
  // ══════════════════════════════════════════════
  { name: "Rachael Ray Nutrish Real Beef Pea and Brown Rice Dry Dog Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish Just 6 Limited Ingredient Lamb Dry Dog Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish Dish Chicken Brown Rice Dry Dog Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish Peak Open Range Red Meat Dry Dog Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish Bright Puppy Real Chicken Dry Dog Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish SuperMedleys Turkey Dry Dog Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish Real Chicken Wet Dog Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish Savory Lamb Stew Wet Dog Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish Zero Grain Beef Potato Pea Dry Dog Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish Peak Adventurous Places Dry Cat Food", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish SuperMedleys Dry Cat Food Chicken", brand: "Rachael Ray Nutrish" },
  { name: "Rachael Ray Nutrish Purrfect Broths Chicken Wet Cat Food", brand: "Rachael Ray Nutrish" },
  // ══════════════════════════════════════════════
  // DIAMOND NATURALS — full line
  // ══════════════════════════════════════════════
  { name: "Diamond Naturals All Life Stages Chicken Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Lamb Meal and Rice Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Large Breed Lamb Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Small Breed Chicken Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Large Breed Puppy Lamb Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Puppy Chicken Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Senior Chicken Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Grain Free Chicken Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Grain Free Beef Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Extreme Athlete Chicken Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Light Lamb Dry Dog Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Indoor Cat Chicken Dry Cat Food", brand: "Diamond Naturals" },
  { name: "Diamond Naturals Kitten Chicken Dry Cat Food", brand: "Diamond Naturals" },
  // ══════════════════════════════════════════════
  // VICTOR — full line
  // ══════════════════════════════════════════════
  { name: "Victor Classic Multi-Pro Dry Dog Food", brand: "Victor" },
  { name: "Victor Classic Professional Dry Dog Food", brand: "Victor" },
  { name: "Victor Select Nutra Pro Dry Dog Food", brand: "Victor" },
  { name: "Victor Purpose Jogging Dry Dog Food", brand: "Victor" },
  { name: "Victor Purpose Performance Dry Dog Food", brand: "Victor" },
  { name: "Victor Purpose Senior Healthy Weight Dry Dog Food", brand: "Victor" },
  { name: "Victor Super Premium Yukon River Salmon Dry Dog Food", brand: "Victor" },
  { name: "Victor Super Premium Ocean Fish Dry Dog Food", brand: "Victor" },
  { name: "Victor HERO Grain Free Dry Dog Food", brand: "Victor" },
  { name: "Victor Elite Canine Dry Dog Food", brand: "Victor" },
  // ══════════════════════════════════════════════
  // EUKANUBA — full line
  // ══════════════════════════════════════════════
  { name: "Eukanuba Adult Medium Breed Chicken Dry Dog Food", brand: "Eukanuba" },
  { name: "Eukanuba Adult Large Breed Chicken Dry Dog Food", brand: "Eukanuba" },
  { name: "Eukanuba Adult Small Breed Chicken Dry Dog Food", brand: "Eukanuba" },
  { name: "Eukanuba Puppy Medium Breed Chicken Dry Dog Food", brand: "Eukanuba" },
  { name: "Eukanuba Puppy Large Breed Chicken Dry Dog Food", brand: "Eukanuba" },
  { name: "Eukanuba Puppy Small Breed Chicken Dry Dog Food", brand: "Eukanuba" },
  { name: "Eukanuba Senior Medium Breed Chicken Dry Dog Food", brand: "Eukanuba" },
  { name: "Eukanuba Senior Large Breed Chicken Dry Dog Food", brand: "Eukanuba" },
  { name: "Eukanuba Fit Body Weight Control Medium Breed Dry Dog Food", brand: "Eukanuba" },
  { name: "Eukanuba Premium Performance 30/20 Sport Dry Dog Food", brand: "Eukanuba" },
  // ══════════════════════════════════════════════
  // BIL-JAC — full line
  // ══════════════════════════════════════════════
  { name: "Bil-Jac Adult Select Dry Dog Food", brand: "Bil-Jac" },
  { name: "Bil-Jac Large Breed Adult Dry Dog Food", brand: "Bil-Jac" },
  { name: "Bil-Jac Small Breed Adult Dry Dog Food", brand: "Bil-Jac" },
  { name: "Bil-Jac Puppy Select Dry Dog Food", brand: "Bil-Jac" },
  { name: "Bil-Jac Senior Select Dry Dog Food", brand: "Bil-Jac" },
  { name: "Bil-Jac Reduced Fat Dry Dog Food", brand: "Bil-Jac" },
  { name: "Bil-Jac Frozen Dog Food", brand: "Bil-Jac" },
  // ══════════════════════════════════════════════
  // CRAVE — full line
  // ══════════════════════════════════════════════
  { name: "Crave High Protein Beef Grain Free Dry Dog Food", brand: "Crave" },
  { name: "Crave High Protein Lamb and Venison Grain Free Dry Dog Food", brand: "Crave" },
  { name: "Crave High Protein Salmon and Ocean Fish Grain Free Dry Dog Food", brand: "Crave" },
  { name: "Crave High Protein White Fish Grain Free Dry Dog Food", brand: "Crave" },
  { name: "Crave Beef Pate Grain Free Wet Dog Food", brand: "Crave" },
  { name: "Crave Chicken Pate Grain Free Wet Dog Food", brand: "Crave" },
  { name: "Crave Indoor Chicken Grain Free Dry Cat Food", brand: "Crave" },
  { name: "Crave Chicken Grain Free Dry Cat Food", brand: "Crave" },
  { name: "Crave Salmon and Ocean Fish Grain Free Dry Cat Food", brand: "Crave" },
  { name: "Crave Chicken Pate Grain Free Wet Cat Food", brand: "Crave" },
  // ══════════════════════════════════════════════
  // EAGLE PACK — full line
  // ══════════════════════════════════════════════
  { name: "Eagle Pack Natural Chicken and Pork Dry Dog Food", brand: "Eagle Pack" },
  { name: "Eagle Pack Natural Lamb and Brown Rice Dry Dog Food", brand: "Eagle Pack" },
  { name: "Eagle Pack Large and Giant Breed Chicken Dry Dog Food", brand: "Eagle Pack" },
  { name: "Eagle Pack Small Breed Chicken Dry Dog Food", brand: "Eagle Pack" },
  { name: "Eagle Pack Puppy Chicken Dry Dog Food", brand: "Eagle Pack" },
  { name: "Eagle Pack Reduced Fat Dry Dog Food", brand: "Eagle Pack" },
  { name: "Eagle Pack Indoor Cat Chicken Dry Cat Food", brand: "Eagle Pack" },
  // ══════════════════════════════════════════════
  // SPORTMIX — budget brand
  // ══════════════════════════════════════════════
  { name: "SportMix Wholesomes Chicken Meal and Rice Dry Dog Food", brand: "SportMix" },
  { name: "SportMix Wholesomes Lamb Meal and Rice Dry Dog Food", brand: "SportMix" },
  { name: "SportMix Wholesomes Grain Free Chicken Dry Dog Food", brand: "SportMix" },
  { name: "SportMix Wholesomes Large Breed Chicken Dry Dog Food", brand: "SportMix" },
  { name: "SportMix Wholesomes Puppy Chicken Dry Dog Food", brand: "SportMix" },
  // ══════════════════════════════════════════════
  // ZIWI PEAK — premium
  // ══════════════════════════════════════════════
  { name: "Ziwi Peak Air-Dried Chicken Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Lamb Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Venison Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Mackerel and Lamb Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Tripe and Lamb Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Beef Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Chicken Wet Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Lamb Wet Dog Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Chicken Cat Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Lamb Cat Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Beef Cat Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Venison Cat Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Air-Dried Mackerel and Lamb Cat Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Chicken Wet Cat Food", brand: "Ziwi Peak" },
  { name: "Ziwi Peak Lamb Wet Cat Food", brand: "Ziwi Peak" },
  // ══════════════════════════════════════════════
  // TIKI CAT — full line
  // ══════════════════════════════════════════════
  { name: "Tiki Cat Born Carnivore Chicken and Herring Dry Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat Born Carnivore Chicken and Egg Dry Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat Born Carnivore Deboned Chicken and Egg Kitten Dry Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat After Dark Chicken Wet Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat After Dark Chicken and Beef Wet Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat Grill Ahi Tuna and Crab Wet Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat Luau Wild Salmon Wet Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat Velvet Mousse Chicken Wet Cat Food", brand: "Tiki Cat" },
  { name: "Tiki Cat Stix Chicken Lickable Cat Treats", brand: "Tiki Cat" },
  // ══════════════════════════════════════════════
  // 9 LIVES — full line
  // ══════════════════════════════════════════════
  { name: "9 Lives Indoor Complete Dry Cat Food", brand: "9 Lives" },
  { name: "9 Lives Lean and Tasty Dry Cat Food", brand: "9 Lives" },
  { name: "9 Lives Plus Care Tuna and Egg Dry Cat Food", brand: "9 Lives" },
  { name: "9 Lives Meaty Pate Chicken Dinner Wet Cat Food", brand: "9 Lives" },
  { name: "9 Lives Hearty Cuts Chicken Wet Cat Food", brand: "9 Lives" },
  { name: "9 Lives Super Supper Wet Cat Food", brand: "9 Lives" },
  // ══════════════════════════════════════════════
  // SCIENCE DIET / HILL'S — prescription/vet diets
  // ══════════════════════════════════════════════
  { name: "Hill's Prescription Diet k/d Kidney Care Chicken Dry Dog Food", brand: "Hill's Prescription Diet" },
  { name: "Hill's Prescription Diet i/d Digestive Care Chicken Dry Dog Food", brand: "Hill's Prescription Diet" },
  { name: "Hill's Prescription Diet w/d Digestive Weight Chicken Dry Dog Food", brand: "Hill's Prescription Diet" },
  { name: "Hill's Prescription Diet j/d Joint Care Chicken Dry Dog Food", brand: "Hill's Prescription Diet" },
  { name: "Hill's Prescription Diet d/d Skin Support Duck Dry Dog Food", brand: "Hill's Prescription Diet" },
  { name: "Hill's Prescription Diet k/d Kidney Care Chicken Dry Cat Food", brand: "Hill's Prescription Diet" },
  { name: "Hill's Prescription Diet c/d Multicare Urinary Chicken Dry Cat Food", brand: "Hill's Prescription Diet" },
  { name: "Hill's Prescription Diet i/d Digestive Care Chicken Dry Cat Food", brand: "Hill's Prescription Diet" },
  { name: "Hill's Prescription Diet Metabolic Weight Management Chicken Dry Cat Food", brand: "Hill's Prescription Diet" },
  // ══════════════════════════════════════════════
  // ROYAL CANIN — vet diets
  // ══════════════════════════════════════════════
  { name: "Royal Canin Veterinary Diet Gastrointestinal Dry Dog Food", brand: "Royal Canin" },
  { name: "Royal Canin Veterinary Diet Hydrolyzed Protein Dry Dog Food", brand: "Royal Canin" },
  { name: "Royal Canin Veterinary Diet Urinary SO Dry Dog Food", brand: "Royal Canin" },
  { name: "Royal Canin Veterinary Diet Renal Support Dry Dog Food", brand: "Royal Canin" },
  { name: "Royal Canin Veterinary Diet Gastrointestinal Dry Cat Food", brand: "Royal Canin" },
  { name: "Royal Canin Veterinary Diet Urinary SO Dry Cat Food", brand: "Royal Canin" },
  { name: "Royal Canin Veterinary Diet Hydrolyzed Protein Dry Cat Food", brand: "Royal Canin" },
  { name: "Royal Canin Veterinary Diet Renal Support Dry Cat Food", brand: "Royal Canin" },
  // ══════════════════════════════════════════════
  // PURINA PRO PLAN — vet diets
  // ══════════════════════════════════════════════
  { name: "Purina Pro Plan Veterinary Diets EN Gastroenteric Dry Dog Food", brand: "Purina Pro Plan" },
  { name: "Purina Pro Plan Veterinary Diets HA Hydrolyzed Dry Dog Food", brand: "Purina Pro Plan" },
  { name: "Purina Pro Plan Veterinary Diets NF Kidney Function Dry Dog Food", brand: "Purina Pro Plan" },
  { name: "Purina Pro Plan Veterinary Diets JM Joint Mobility Dry Dog Food", brand: "Purina Pro Plan" },
  { name: "Purina Pro Plan Veterinary Diets EN Gastroenteric Dry Cat Food", brand: "Purina Pro Plan" },
  { name: "Purina Pro Plan Veterinary Diets UR Urinary Dry Cat Food", brand: "Purina Pro Plan" },
  { name: "Purina Pro Plan Veterinary Diets DM Dietetic Dry Cat Food", brand: "Purina Pro Plan" },
  { name: "Purina Pro Plan Veterinary Diets NF Kidney Function Dry Cat Food", brand: "Purina Pro Plan" },
];

async function main() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  UNDERREPRESENTED BRANDS — ${PRODUCTS.length} PRODUCTS`);
  console.log(`══════════════════════════════════════════════════\n`);

  let imported = 0, skipped = 0, failed = 0;

  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const num = `[${String(i + 1).padStart(3)}/${PRODUCTS.length}]`;

    const existing = await dbGetExisting(p.name, p.brand);
    if (existing && existing.ingredient_count >= 5) {
      skipped++;
      continue;
    }

    const result = await scrapeIngredients(p.name, p.brand);
    if (result && result.ingredients.length >= 3) {
      const saved = await dbSave(p.name, p.brand, result.ingredients, result.text, "web_verified", result.sourceUrl);
      if (saved) {
        imported++;
        log("BRAND", `${num} ✓ ${p.name.substring(0, 50)} — ${result.ingredients.length}`);
      } else { failed++; }
    } else {
      failed++;
      log("BRAND", `${num} ✗ ${p.name.substring(0, 50)}`);
    }
    await delay(2000);
  }

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`Imported: ${imported} | Skipped: ${skipped} | Failed: ${failed} | Total: ${PRODUCTS.length}`);
}
main().catch(console.error);
