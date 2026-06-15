#!/usr/bin/env node
/**
 * Store-brand pet food scraper — covers ALL major US retailer private labels.
 *
 * Walmart, Costco, Target, PetSmart, Petco, Trader Joe's, Aldi,
 * Sam's Club, Kroger, Dollar General, BJ's, Meijer, HEB, etc.
 *
 * Uses Google search + ScrapingBee + GPT extraction.
 */

const { scrapeIngredients, dbSave, dbGetExisting, log, delay } = require("./lib");

// Every store-brand pet food product in the US market
const PRODUCTS = [
  // ══════════════════════════════════════════════
  // WALMART — Ol' Roy, Pure Balance, Special Kitty, Vibrant Life
  // ══════════════════════════════════════════════
  // Ol' Roy (Walmart budget dog food)
  { name: "Ol' Roy Complete Nutrition Dog Food", brand: "Ol' Roy" },
  { name: "Ol' Roy Dinner Rounds Dog Food", brand: "Ol' Roy" },
  { name: "Ol' Roy Kibbles & Chunks Dog Food", brand: "Ol' Roy" },
  { name: "Ol' Roy High Performance Dog Food", brand: "Ol' Roy" },
  { name: "Ol' Roy Good Moist & Meaty Dog Food Beef Flavor", brand: "Ol' Roy" },
  { name: "Ol' Roy Puppy Complete Dry Dog Food", brand: "Ol' Roy" },
  { name: "Ol' Roy Cuts in Gravy Wet Dog Food Variety Pack", brand: "Ol' Roy" },
  { name: "Ol' Roy Filet Mignon Flavor Wet Dog Food", brand: "Ol' Roy" },
  { name: "Ol' Roy Tasty Benefits Savory Beef Stew Dog Food", brand: "Ol' Roy" },
  // Pure Balance (Walmart premium)
  { name: "Pure Balance Chicken and Brown Rice Dry Dog Food", brand: "Pure Balance" },
  { name: "Pure Balance Salmon and Pea Grain Free Dry Dog Food", brand: "Pure Balance" },
  { name: "Pure Balance Lamb and Fava Bean Grain Free Dry Dog Food", brand: "Pure Balance" },
  { name: "Pure Balance Wild and Free Bison Pea and Venison Dry Dog Food", brand: "Pure Balance" },
  { name: "Pure Balance Chicken and Brown Rice Puppy Dry Dog Food", brand: "Pure Balance" },
  { name: "Pure Balance Pro Plus Chicken Small Breed Dry Dog Food", brand: "Pure Balance" },
  { name: "Pure Balance Chicken Brown Rice Wet Dog Food", brand: "Pure Balance" },
  { name: "Pure Balance Chicken Rice Stew Wet Dog Food", brand: "Pure Balance" },
  { name: "Pure Balance Chicken and Brown Rice Dry Cat Food", brand: "Pure Balance" },
  { name: "Pure Balance Salmon and Pea Grain Free Dry Cat Food", brand: "Pure Balance" },
  { name: "Pure Balance Wild and Free Chicken Dry Cat Food", brand: "Pure Balance" },
  { name: "Pure Balance Indoor Cat Chicken Dry Cat Food", brand: "Pure Balance" },
  { name: "Pure Balance Chicken Wet Cat Food Pate", brand: "Pure Balance" },
  // Special Kitty (Walmart cat food)
  { name: "Special Kitty Original Dry Cat Food", brand: "Special Kitty" },
  { name: "Special Kitty Indoor Dry Cat Food", brand: "Special Kitty" },
  { name: "Special Kitty Kitten Dry Cat Food", brand: "Special Kitty" },
  { name: "Special Kitty Classic Pate Variety Pack Wet Cat Food", brand: "Special Kitty" },
  { name: "Special Kitty Gourmet Variety Pack Wet Cat Food", brand: "Special Kitty" },
  { name: "Special Kitty Chicken Flavor Cat Treats", brand: "Special Kitty" },
  // Vibrant Life (Walmart treats)
  { name: "Vibrant Life Chicken Jerky Dog Treats", brand: "Vibrant Life" },
  { name: "Vibrant Life Mini Dental Sticks Dog Treats", brand: "Vibrant Life" },

  // ══════════════════════════════════════════════
  // COSTCO — Kirkland Signature
  // ══════════════════════════════════════════════
  { name: "Kirkland Signature Adult Dog Chicken Rice and Vegetable Formula", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Nature's Domain Turkey Meal and Sweet Potato Dog Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Nature's Domain Salmon Meal and Sweet Potato Dog Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Nature's Domain Organic Chicken and Pea Dog Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Puppy Chicken Rice and Vegetable Dog Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Healthy Weight Dog Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Small Breed Adult Dog Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Nature's Domain Beef Meal and Sweet Potato Dog Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Lamb Rice and Vegetable Dog Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Super Premium Chicken Canned Dog Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Dental Chew Dog Treats", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Chicken Jerky Dog Treats", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Maintenance Cat Chicken and Rice", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Nature's Domain Indoor Cat Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Healthy Weight Indoor Cat Food", brand: "Kirkland Signature" },
  { name: "Kirkland Signature Super Premium Cat Food Pate Variety Pack", brand: "Kirkland Signature" },

  // ══════════════════════════════════════════════
  // TARGET — Kindfull
  // ══════════════════════════════════════════════
  { name: "Kindfull Chicken and Brown Rice Dry Dog Food", brand: "Kindfull" },
  { name: "Kindfull Salmon and Brown Rice Dry Dog Food", brand: "Kindfull" },
  { name: "Kindfull Grain Free Chicken and Sweet Potato Dry Dog Food", brand: "Kindfull" },
  { name: "Kindfull Grain Free Salmon and Sweet Potato Dry Dog Food", brand: "Kindfull" },
  { name: "Kindfull Puppy Chicken and Brown Rice Dry Dog Food", brand: "Kindfull" },
  { name: "Kindfull Chicken Wet Dog Food", brand: "Kindfull" },
  { name: "Kindfull Chicken and Brown Rice Dry Cat Food", brand: "Kindfull" },
  { name: "Kindfull Salmon and Brown Rice Dry Cat Food", brand: "Kindfull" },
  { name: "Kindfull Indoor Chicken Dry Cat Food", brand: "Kindfull" },
  { name: "Kindfull Grain Free Chicken Dry Cat Food", brand: "Kindfull" },
  { name: "Kindfull Chicken Pate Wet Cat Food", brand: "Kindfull" },
  { name: "Kindfull Chicken Jerky Dog Treats", brand: "Kindfull" },
  { name: "Kindfull Dental Sticks Dog Treats", brand: "Kindfull" },

  // ══════════════════════════════════════════════
  // PETSMART — Authority, Simply Nourish
  // ══════════════════════════════════════════════
  // Authority
  { name: "Authority Chicken and Rice Adult Dry Dog Food", brand: "Authority" },
  { name: "Authority Large Breed Chicken and Rice Dry Dog Food", brand: "Authority" },
  { name: "Authority Grain Free Chicken and Pea Dry Dog Food", brand: "Authority" },
  { name: "Authority Puppy Chicken and Rice Dry Dog Food", brand: "Authority" },
  { name: "Authority Senior Chicken and Rice Dry Dog Food", brand: "Authority" },
  { name: "Authority Healthy Weight Chicken and Rice Dry Dog Food", brand: "Authority" },
  { name: "Authority Indoor Chicken and Rice Dry Cat Food", brand: "Authority" },
  { name: "Authority Chicken and Rice Adult Dry Cat Food", brand: "Authority" },
  { name: "Authority Grain Free Chicken Dry Cat Food", brand: "Authority" },
  { name: "Authority Kitten Chicken Dry Cat Food", brand: "Authority" },
  // Simply Nourish
  { name: "Simply Nourish Original Chicken and Brown Rice Dry Dog Food", brand: "Simply Nourish" },
  { name: "Simply Nourish Source Chicken Dry Dog Food Grain Free", brand: "Simply Nourish" },
  { name: "Simply Nourish Original Salmon and Sweet Potato Dry Dog Food", brand: "Simply Nourish" },
  { name: "Simply Nourish Puppy Chicken and Brown Rice Dry Dog Food", brand: "Simply Nourish" },
  { name: "Simply Nourish Senior Chicken and Brown Rice Dry Dog Food", brand: "Simply Nourish" },
  { name: "Simply Nourish Limited Ingredient Diet Turkey Dry Dog Food", brand: "Simply Nourish" },
  { name: "Simply Nourish Original Chicken and Brown Rice Dry Cat Food", brand: "Simply Nourish" },
  { name: "Simply Nourish Source Chicken Dry Cat Food Grain Free", brand: "Simply Nourish" },
  { name: "Simply Nourish Indoor Chicken Dry Cat Food", brand: "Simply Nourish" },
  { name: "Simply Nourish Chicken Pate Wet Cat Food", brand: "Simply Nourish" },

  // ══════════════════════════════════════════════
  // PETCO — WholeHearted
  // ══════════════════════════════════════════════
  { name: "WholeHearted Grain Free Chicken and Pea Dry Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Grain Free Salmon and Pea Dry Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Grain Free Beef and Pea Dry Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Chicken and Brown Rice Dry Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Grain Free Puppy Chicken Dry Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Grain Free Large Breed Chicken Dry Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Active Performance Chicken Dry Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Healthy Weight Chicken Dry Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Senior Chicken Dry Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Chicken Stew Wet Dog Food", brand: "WholeHearted" },
  { name: "WholeHearted Grain Free Chicken Dry Cat Food", brand: "WholeHearted" },
  { name: "WholeHearted Grain Free Salmon Dry Cat Food", brand: "WholeHearted" },
  { name: "WholeHearted Indoor Chicken Dry Cat Food", brand: "WholeHearted" },
  { name: "WholeHearted Chicken and Brown Rice Dry Cat Food", brand: "WholeHearted" },
  { name: "WholeHearted Kitten Chicken Dry Cat Food", brand: "WholeHearted" },
  { name: "WholeHearted Chicken Pate Wet Cat Food", brand: "WholeHearted" },
  { name: "WholeHearted Chicken Jerky Dog Treats", brand: "WholeHearted" },
  { name: "WholeHearted Dental Dog Treats", brand: "WholeHearted" },

  // ══════════════════════════════════════════════
  // TRADER JOE'S
  // ══════════════════════════════════════════════
  { name: "Trader Joe's Chicken Brown Rice and Vegetables Dog Food", brand: "Trader Joe's" },
  { name: "Trader Joe's Premium Chicken Formula Dog Food", brand: "Trader Joe's" },
  { name: "Trader Joe's Turkey and Giblets Dinner Cat Food", brand: "Trader Joe's" },
  { name: "Trader Joe's Tuna for Cats", brand: "Trader Joe's" },
  { name: "Trader Joe's Premium Cat Food Chicken Pate", brand: "Trader Joe's" },
  { name: "Trader Joe's Charlee Bear Dog Treats", brand: "Trader Joe's" },

  // ══════════════════════════════════════════════
  // ALDI — Heart to Tail
  // ══════════════════════════════════════════════
  { name: "Heart to Tail Chicken and Rice Dry Dog Food", brand: "Heart to Tail" },
  { name: "Heart to Tail Chunk Style Dry Dog Food", brand: "Heart to Tail" },
  { name: "Heart to Tail Grain Free Chicken Dry Dog Food", brand: "Heart to Tail" },
  { name: "Heart to Tail Puppy Chicken Dry Dog Food", brand: "Heart to Tail" },
  { name: "Heart to Tail Complete Cat Food", brand: "Heart to Tail" },
  { name: "Heart to Tail Indoor Cat Food", brand: "Heart to Tail" },
  { name: "Heart to Tail Variety Pack Wet Cat Food", brand: "Heart to Tail" },
  { name: "Heart to Tail Chicken Jerky Dog Treats", brand: "Heart to Tail" },

  // ══════════════════════════════════════════════
  // SAM'S CLUB — Member's Mark
  // ══════════════════════════════════════════════
  { name: "Member's Mark Exceed Chicken and Rice Dry Dog Food", brand: "Member's Mark" },
  { name: "Member's Mark Exceed Grain Free Salmon Dry Dog Food", brand: "Member's Mark" },
  { name: "Member's Mark Exceed Puppy Chicken Dry Dog Food", brand: "Member's Mark" },
  { name: "Member's Mark Exceed Chicken and Rice Dry Cat Food", brand: "Member's Mark" },
  { name: "Member's Mark Exceed Indoor Dry Cat Food", brand: "Member's Mark" },
  { name: "Member's Mark Chicken Jerky Dog Treats", brand: "Member's Mark" },

  // ══════════════════════════════════════════════
  // KROGER — various store brands
  // ══════════════════════════════════════════════
  { name: "Kroger Complete Nutrition Dry Dog Food", brand: "Kroger" },
  { name: "Kroger Abound Chicken and Brown Rice Dry Dog Food", brand: "Kroger" },
  { name: "Kroger Abound Grain Free Salmon Dry Dog Food", brand: "Kroger" },
  { name: "Kroger Abound Indoor Chicken Dry Cat Food", brand: "Kroger" },
  { name: "Kroger Complete Nutrition Dry Cat Food", brand: "Kroger" },

  // ══════════════════════════════════════════════
  // DOLLAR GENERAL — various budget brands
  // ══════════════════════════════════════════════
  { name: "Good Life Recipe Chicken Dry Dog Food", brand: "Good Life" },
  { name: "Good Life Recipe Chicken Dry Cat Food", brand: "Good Life" },
  { name: "Retriever Chunk Dog Food", brand: "Retriever" },
  { name: "Retriever Hi Protein Dog Food", brand: "Retriever" },

  // ══════════════════════════════════════════════
  // BJ'S WHOLESALE — Berkley Jensen
  // ══════════════════════════════════════════════
  { name: "Berkley Jensen Chicken and Rice Dry Dog Food", brand: "Berkley Jensen" },
  { name: "Berkley Jensen Grain Free Chicken Dry Dog Food", brand: "Berkley Jensen" },
  { name: "Berkley Jensen Chicken and Rice Dry Cat Food", brand: "Berkley Jensen" },

  // ══════════════════════════════════════════════
  // TRACTOR SUPPLY — 4Health
  // ══════════════════════════════════════════════
  { name: "4Health Original Chicken and Rice Dry Dog Food", brand: "4Health" },
  { name: "4Health Grain Free Chicken Dry Dog Food", brand: "4Health" },
  { name: "4Health Salmon and Potato Dry Dog Food", brand: "4Health" },
  { name: "4Health Large Breed Chicken Dry Dog Food", brand: "4Health" },
  { name: "4Health Puppy Chicken and Rice Dry Dog Food", brand: "4Health" },
  { name: "4Health Performance Chicken Dry Dog Food", brand: "4Health" },
  { name: "4Health Untamed Red Canyon Grain Free Dry Dog Food", brand: "4Health" },
  { name: "4Health Untamed Prairie Grain Free Dry Dog Food", brand: "4Health" },
  { name: "4Health Original Chicken and Rice Dry Cat Food", brand: "4Health" },
  { name: "4Health Grain Free Chicken Dry Cat Food", brand: "4Health" },
  { name: "4Health Indoor Chicken Dry Cat Food", brand: "4Health" },
  { name: "4Health Kitten Chicken Dry Cat Food", brand: "4Health" },

  // ══════════════════════════════════════════════
  // HEB — Heritage Ranch
  // ══════════════════════════════════════════════
  { name: "Heritage Ranch Chicken and Brown Rice Dry Dog Food", brand: "Heritage Ranch" },
  { name: "Heritage Ranch Grain Free Chicken Dry Dog Food", brand: "Heritage Ranch" },
  { name: "Heritage Ranch Salmon and Sweet Potato Dry Dog Food", brand: "Heritage Ranch" },
  { name: "Heritage Ranch Chicken and Brown Rice Dry Cat Food", brand: "Heritage Ranch" },

  // ══════════════════════════════════════════════
  // MEIJER — Meijer brand
  // ══════════════════════════════════════════════
  { name: "Meijer Naturals Chicken and Rice Dry Dog Food", brand: "Meijer" },
  { name: "Meijer Complete Nutrition Dry Dog Food", brand: "Meijer" },
  { name: "Meijer Complete Nutrition Dry Cat Food", brand: "Meijer" },

  // ══════════════════════════════════════════════
  // WINCO — Natures Menu
  // ══════════════════════════════════════════════
  { name: "Nature's Menu Chicken Meal and Rice Dry Dog Food", brand: "Nature's Menu" },
  { name: "Nature's Menu Complete Cat Dry Cat Food", brand: "Nature's Menu" },
];

async function main() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  STORE BRAND PET FOOD SCRAPER — ${PRODUCTS.length} PRODUCTS`);
  console.log(`══════════════════════════════════════════════════\n`);

  let imported = 0, skipped = 0, failed = 0;

  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const num = `[${String(i + 1).padStart(3)}/${PRODUCTS.length}]`;

    // Check DB
    const existing = await dbGetExisting(p.name, p.brand);
    if (existing && existing.ingredient_count >= 5) {
      skipped++;
      log("STORE", `${num} SKIP ${p.name.substring(0, 50)} (${existing.ingredient_count} in DB)`);
      continue;
    }

    log("STORE", `${num} Searching: ${p.name.substring(0, 50)}`);

    const result = await scrapeIngredients(p.name, p.brand);
    if (result && result.ingredients.length >= 3) {
      const saved = await dbSave(p.name, p.brand, result.ingredients, result.text, "store_brand", result.sourceUrl);
      if (saved) {
        imported++;
        log("STORE", `${num} ✓ ${p.name.substring(0, 50)} — ${result.ingredients.length} ingredients`);
      } else {
        failed++;
      }
    } else {
      failed++;
      log("STORE", `${num} ✗ ${p.name.substring(0, 50)} — not found`);
    }

    await delay(2000);
  }

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  RESULTS`);
  console.log(`══════════════════════════════════════════════════`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped:  ${skipped} (already in DB)`);
  console.log(`Failed:   ${failed}`);
  console.log(`Total:    ${PRODUCTS.length}`);
}

main().catch(console.error);
