#!/usr/bin/env node
/**
 * DogFoodAdvisor scraper — fixed version.
 *
 * DFA structure: each brand page has ONE analyzed recipe with ingredients
 * in p#ingredients, recipe name in div.ic__title h5. Related brand pages
 * are linked in div.single__related-reviews-block.
 *
 * Strategy:
 * 1. Start from category listing pages → find brand URLs
 * 2. Scrape each brand page → extract p#ingredients + recipe name
 * 3. Follow related review links → find more product line pages
 * 4. Save all to DB
 *
 * Run: node scripts/mega-scraper/dfa-fixed.js
 */

const {
  parseIngredients, extractBrand,
  dbSave, dbGetExisting,
  scrapePage, log, delay,
} = require("./lib");

const CATEGORY_URLS = [
  "https://www.dogfoodadvisor.com/dog-food-reviews/dry/",
  "https://www.dogfoodadvisor.com/dog-food-reviews/canned/",
  "https://www.dogfoodadvisor.com/dog-food-reviews/raw/",
  "https://www.dogfoodadvisor.com/dog-food-reviews/dehydrated/",
  "https://www.dogfoodadvisor.com/dog-food-reviews/fresh/",
  "https://www.dogfoodadvisor.com/dog-food-reviews/freeze-dried/",
];

function extractDFAData(html) {
  // Extract recipe name from div.ic__title h5
  const nameMatch = html.match(/<div[^>]*class="ic__title"[^>]*>[\s\S]*?<h5[^>]*>([^<]+)<\/h5>/i);
  const recipeName = nameMatch?.[1]?.trim();

  // Extract ingredient list from p#ingredients
  const ingredientMatch = html.match(/<p[^>]*id="ingredients"[^>]*>([^<]+)<\/p>/i);
  const ingredientText = ingredientMatch?.[1]?.trim();

  // Extract star rating
  const ratingMatch = html.match(/Star rating:\s*(\d+(?:\.\d+)?)\s*star/i);
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

  // Extract related review links
  const relatedLinks = new Set();
  const relatedSection = html.match(/related-reviews-block[\s\S]*?<\/div>/i)?.[0] || "";
  const linkMatches = relatedSection.match(/href="(https?:\/\/www\.dogfoodadvisor\.com\/dog-food-reviews\/[^"]+)"/gi) || [];
  for (const m of linkMatches) {
    const url = m.match(/href="([^"]+)"/)?.[1];
    if (url) relatedLinks.add(url.replace(/\/$/, ""));
  }

  // Also find review links in the full page
  const allReviewLinks = html.match(/href="(https?:\/\/www\.dogfoodadvisor\.com\/dog-food-reviews\/[a-z0-9-]+-(?:dog-food|dry|wet|canned|raw|freeze|fresh|dehydrated|puppy|adult|senior|grain|limited|original|classic)[^"]*)"/gi) || [];
  for (const m of allReviewLinks) {
    const url = m.match(/href="([^"]+)"/)?.[1];
    if (url && !url.includes("/dry/") && !url.includes("/canned/") && !url.includes("/raw/") && !url.includes("/dehydrated/") && !url.includes("/fresh/") && !url.includes("/freeze-dried/")) {
      relatedLinks.add(url.replace(/\/$/, ""));
    }
  }

  // Extract recipe list (other products listed on the page)
  const recipeNames = [];
  const tbMatch = html.match(/<div[^>]*class="tb"[^>]*>[\s\S]*?<\/table>/i);
  if (tbMatch) {
    const rows = tbMatch[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows) {
      const tdMatch = row.match(/<td[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
                       row.match(/<td[^>]*>([^<]+)<\/td>/i);
      if (tdMatch) {
        const name = tdMatch[1].trim();
        if (name && name.length > 3 && !name.includes("Product") && !name.includes("Rating")) {
          recipeNames.push(name);
        }
      }
    }
  }

  return { recipeName, ingredientText, rating, relatedLinks: [...relatedLinks], recipeNames };
}

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DFA SCRAPER (FIXED)");
  console.log("══════════════════════════════════════════════════\n");

  // Step 1: Find brand page URLs from category listings
  const brandUrls = new Set();

  for (const catUrl of CATEGORY_URLS) {
    try {
      const html = await scrapePage(catUrl);
      if (!html) continue;

      const matches = html.match(/href="(https?:\/\/www\.dogfoodadvisor\.com\/dog-food-reviews\/[a-z0-9-]+\/?)"/gi) || [];
      for (const m of matches) {
        const url = m.match(/href="([^"]+)"/)?.[1]?.replace(/\/$/, "");
        if (url && ![...CATEGORY_URLS.map(u => u.replace(/\/$/, ""))].includes(url)) {
          brandUrls.add(url);
        }
      }
      log("DFA", `${catUrl.split("/").slice(-2, -1)}: found ${brandUrls.size} total brand URLs`);
    } catch (err) {
      log("DFA", `Error: ${err.message}`);
    }
    await delay(1500);
  }

  log("DFA", `Total brand/product line pages: ${brandUrls.size}`);

  // Step 2: Scrape each brand page for ingredients + find related pages
  const allUrls = new Set(brandUrls);
  const scrapedUrls = new Set();
  let imported = 0, skipped = 0, noIngredients = 0;

  // Process all URLs (including discovered related ones)
  const urlQueue = [...allUrls];
  let idx = 0;

  while (idx < urlQueue.length) {
    const url = urlQueue[idx];
    idx++;

    if (scrapedUrls.has(url)) continue;
    scrapedUrls.add(url);

    const shortUrl = url.replace("https://www.dogfoodadvisor.com/dog-food-reviews/", "");

    try {
      const html = await scrapePage(url);
      if (!html) {
        log("DFA", `[${idx}/${urlQueue.length}] ${shortUrl} — scrape failed`);
        continue;
      }

      const data = extractDFAData(html);

      // Add related links to queue
      for (const related of data.relatedLinks) {
        if (!allUrls.has(related)) {
          allUrls.add(related);
          urlQueue.push(related);
        }
      }

      if (!data.recipeName || !data.ingredientText) {
        noIngredients++;
        log("DFA", `[${idx}/${urlQueue.length}] ${shortUrl} — no ingredients on page`);
        continue;
      }

      const ingredients = parseIngredients(data.ingredientText);
      if (ingredients.length < 5) {
        noIngredients++;
        continue;
      }

      const brand = extractBrand(data.recipeName);

      // Check DB
      const existing = await dbGetExisting(data.recipeName, brand);
      if (existing && existing.ingredient_count >= ingredients.length) {
        skipped++;
        log("DFA", `[${idx}/${urlQueue.length}] ${data.recipeName.substring(0, 50)} — SKIP (${existing.ingredient_count} in DB)`);
        continue;
      }

      const saved = await dbSave(data.recipeName, brand, ingredients, data.ingredientText, "dfa", url);
      if (saved) {
        imported++;
        log("DFA", `[${idx}/${urlQueue.length}] ✓ ${data.recipeName.substring(0, 50)} — ${ingredients.length} ingredients`);
      }

      // Log other recipes on this page (names only, no ingredients)
      if (data.recipeNames.length > 1) {
        log("DFA", `  Also listed: ${data.recipeNames.filter(n => n !== data.recipeName).join(", ").substring(0, 80)}`);
      }
    } catch (err) {
      log("DFA", `[${idx}/${urlQueue.length}] ${shortUrl} — error: ${err.message}`);
    }

    await delay(1000);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log("  DFA RESULTS");
  console.log("══════════════════════════════════════════════════");
  console.log(`Pages scraped:  ${scrapedUrls.size}`);
  console.log(`Imported:       ${imported}`);
  console.log(`Skipped:        ${skipped} (already in DB)`);
  console.log(`No ingredients: ${noIngredients}`);
}

main().catch(console.error);
