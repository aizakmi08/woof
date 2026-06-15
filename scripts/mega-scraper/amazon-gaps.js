#!/usr/bin/env node
/**
 * Fill Amazon gaps — re-scrapes products that Amazon couldn't provide
 * ingredients for, using Google search + third-party retailer sites.
 *
 * Strategy: Search Amazon for top bestsellers, then for each product
 * NOT in our DB, Google search for ingredients on DogFoodAdvisor,
 * Chewy product pages, small pet stores, etc.
 */

const {
  scrapeIngredients, dbSave, dbGetExisting, extractBrand,
  parseIngredients, extractIngredientsFromHtml,
  scrapePage, stripHtml, gptExtractIngredients,
  googleSearch, log, delay,
  SB_URL, SB_KEY, SBKEY,
} = require("./lib");

// Top Amazon pet food searches — focused on bestsellers most likely to be scanned
const AMAZON_SEARCHES = [
  // Top bestselling dry dog foods
  "amazon bestseller dry dog food",
  "most popular dry dog food 2024 2025",
  "top selling dog food brands amazon",
  "best dry dog food amazon top rated",
  // Top wet dog
  "amazon bestseller wet dog food canned",
  "most popular canned dog food",
  // Top dry cat
  "amazon bestseller dry cat food",
  "most popular dry cat food brands",
  "top selling cat food amazon",
  // Top wet cat
  "amazon bestseller wet cat food",
  "most popular canned cat food pate",
  "best wet cat food variety pack",
  // Top treats
  "amazon bestseller dog treats",
  "most popular dog treats 2024 2025",
  "amazon bestseller cat treats",
  "most popular cat treats lickable",
  // Specific popular products likely to be scanned
  "Honest Kitchen Essential Clusters ingredients",
  "Honest Kitchen Whole Food Clusters ingredients",
  "Honest Kitchen Dehydrated dog food ingredients",
  "Honest Kitchen cat food ingredients",
  "Blue Buffalo Life Protection dry dog food all flavors ingredients",
  "Purina Pro Plan Complete Essentials all flavors ingredients",
  "Hill's Science Diet all varieties ingredients",
  "Royal Canin breed specific dog food ingredients",
  "Iams ProActive Health all varieties ingredients",
  "Pedigree Complete Nutrition all varieties ingredients",
  "Fancy Feast Classic Pate all flavors ingredients",
  "Friskies all varieties dry cat food ingredients",
  "Meow Mix all varieties ingredients",
  "Wellness Complete Health all varieties dog food ingredients",
  "Merrick Grain Free all varieties dog food ingredients",
  "Taste of the Wild all varieties ingredients",
  "Nutro Wholesome Essentials all varieties ingredients",
  "Rachael Ray Nutrish all varieties dog food ingredients",
  "Canidae all varieties dog food ingredients",
  "Nulo all varieties dog food ingredients",
  "Stella Chewy freeze dried all varieties ingredients",
  "Greenies dental treats all sizes ingredients",
  "Temptations cat treats all flavors ingredients",
  "Milk Bone dog treats all varieties ingredients",
  "Zuke Mini Naturals all flavors ingredients",
];

async function discoverAndFill() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  AMAZON GAP FILLER — ${AMAZON_SEARCHES.length} SEARCHES`);
  console.log(`══════════════════════════════════════════════════\n`);

  let totalDiscovered = 0, totalImported = 0, totalSkipped = 0;

  for (let i = 0; i < AMAZON_SEARCHES.length; i++) {
    const query = AMAZON_SEARCHES[i];
    log("GAP", `[${i + 1}/${AMAZON_SEARCHES.length}] "${query}"`);

    try {
      const results = await googleSearch(query, 10);

      for (const r of results) {
        try {
          const html = await scrapePage(r.url || r);
          if (!html || html.length < 500) continue;

          // Look for ingredient blocks in the page
          const directExtract = extractIngredientsFromHtml(html);

          if (directExtract && directExtract.ingredients.length >= 5) {
            // Try to identify the product name
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                               html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            let name = titleMatch?.[1]
              ?.replace(/\s*[-|:]?\s*(?:Amazon|Chewy|PetSmart|Petco|DogFoodAdvisor|Dog Food Advisor).*$/i, "")
              ?.replace(/\s*\d+(\.\d+)?\s*(oz|lb|lbs|kg|g)s?\b.*/gi, "")
              ?.trim();
            if (!name || name.length < 5 || name.length > 200) continue;

            const brand = extractBrand(name);
            const existing = await dbGetExisting(name, brand);
            if (existing && existing.ingredient_count >= directExtract.ingredients.length) {
              totalSkipped++;
              continue;
            }

            const saved = await dbSave(name, brand, directExtract.ingredients, directExtract.text, "web_verified", r.url || r);
            if (saved) {
              totalImported++;
              totalDiscovered++;
              log("GAP", `  ✓ ${name.substring(0, 55)} — ${directExtract.ingredients.length} ingredients`);
            }
          } else {
            // Try GPT extraction
            const text = stripHtml(html);
            if (text.length < 100 || !text.toLowerCase().includes("ingredient")) continue;

            const gpt = await gptExtractIngredients(text, query);
            if (gpt && gpt.ingredients.length >= 5) {
              // Get product name from GPT too
              const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
              let name = titleMatch?.[1]?.replace(/\s*[-|:].*$/i, "").trim();
              if (!name || name.length < 5) continue;

              const brand = extractBrand(name);
              const existing = await dbGetExisting(name, brand);
              if (!existing || existing.ingredient_count < gpt.ingredients.length) {
                const saved = await dbSave(name, brand, gpt.ingredients, gpt.text, "web_verified", r.url || r);
                if (saved) {
                  totalImported++;
                  totalDiscovered++;
                  log("GAP", `  ✓ ${name.substring(0, 55)} — ${gpt.ingredients.length} ingredients (GPT)`);
                }
              }
            }
          }
        } catch {}
        await delay(1500);
      }
    } catch (err) {
      log("GAP", `  Error: ${err.message}`);
    }
    await delay(2000);
  }

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`Discovered: ${totalDiscovered} | Imported: ${totalImported} | Skipped: ${totalSkipped}`);
}

discoverAndFill().catch(console.error);
