#!/usr/bin/env node
/**
 * Open Farm Complete Product Scraper
 *
 * Scrapes EVERY product from openfarmpet.com:
 * - Dog food (dry, wet, freeze-dried, gently cooked, raw)
 * - Cat food (dry, wet, freeze-dried)
 * - Dog treats
 * - Cat treats
 *
 * Extracts: product name, full ingredient list, product image
 *
 * Run: node scripts/mega-scraper/openfarm.js
 */

const {
  parseIngredients, extractIngredientsFromHtml,
  dbSave, dbGetExisting,
  scrapePage, stripHtml, gptExtractIngredients,
  log, delay,
} = require("./lib");

const BRAND = "Open Farm";

// All Open Farm category pages
const CATEGORY_URLS = [
  // Dog food
  "https://openfarmpet.com/dog-food/",
  "https://openfarmpet.com/dog-food/dry-dog-food/",
  "https://openfarmpet.com/dog-food/wet-dog-food/",
  "https://openfarmpet.com/dog-food/freeze-dried-raw-dog-food/",
  "https://openfarmpet.com/dog-food/gently-cooked-dog-food/",
  "https://openfarmpet.com/dog-food/rustic-blend-dog-food/",
  "https://openfarmpet.com/dog-food/raw-dog-food/",
  // Cat food
  "https://openfarmpet.com/cat-food/",
  "https://openfarmpet.com/cat-food/dry-cat-food/",
  "https://openfarmpet.com/cat-food/wet-cat-food/",
  "https://openfarmpet.com/cat-food/freeze-dried-raw-cat-food/",
  "https://openfarmpet.com/cat-food/rustic-blend-cat-food/",
  // Treats
  "https://openfarmpet.com/dog-treats/",
  "https://openfarmpet.com/cat-treats/",
];

async function findProductUrls() {
  const productUrls = new Set();

  for (const catUrl of CATEGORY_URLS) {
    try {
      const html = await scrapePage(catUrl, true); // JS rendering needed
      if (!html) {
        log("OPENFARM", `Failed to load: ${catUrl}`);
        continue;
      }

      // Find product page links
      const matches = html.match(/href="(https?:\/\/openfarmpet\.com\/(?:dog-food|cat-food|dog-treats|cat-treats)\/[a-z0-9-]+\/?)"/gi) || [];
      for (const m of matches) {
        const url = m.match(/href="([^"]+)"/)?.[1]?.replace(/\/$/, "");
        // Skip category pages (they end with a category name)
        if (url && !CATEGORY_URLS.some(c => url === c.replace(/\/$/, ""))) {
          productUrls.add(url);
        }
      }

      // Also try href patterns without full domain
      const relMatches = html.match(/href="\/((?:dog-food|cat-food|dog-treats|cat-treats)\/[a-z0-9-]+\/?)"/gi) || [];
      for (const m of relMatches) {
        const path = m.match(/href="\/([^"]+)"/)?.[1]?.replace(/\/$/, "");
        if (path && !CATEGORY_URLS.some(c => c.includes(path))) {
          productUrls.add(`https://openfarmpet.com/${path}`);
        }
      }

      log("OPENFARM", `${catUrl.split("openfarmpet.com")[1]} → ${productUrls.size} total product URLs`);
    } catch (err) {
      log("OPENFARM", `Error: ${err.message}`);
    }
    await delay(1500);
  }

  return [...productUrls];
}

async function scrapeProduct(url) {
  try {
    const html = await scrapePage(url, true);
    if (!html || html.length < 2000) return null;

    // Extract product name
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let name = titleMatch?.[1]
      ?.replace(/\s*[-|].*Open Farm.*/i, "")
      ?.replace(/\s*[-|].*openfarmpet.*/i, "")
      ?.trim();
    if (!name || name.length < 3) return null;

    // Ensure brand prefix
    if (!name.toLowerCase().startsWith("open farm")) {
      name = `Open Farm ${name}`;
    }

    // Extract product image
    const imgMatch = html.match(/og:image"[^>]*content="([^"]+)"/i) ||
                     html.match(/class="product[^"]*image[^"]*"[^>]*src="([^"]+)"/i) ||
                     html.match(/<img[^>]*src="(https:\/\/[^"]*openfarmpet[^"]*\.(?:jpg|png|webp)[^"]*)"/i);
    const imageUrl = imgMatch?.[1] || null;

    // Extract ingredients — try HTML extraction first
    let result = extractIngredientsFromHtml(html);

    // Fall back to GPT extraction
    if (!result || result.ingredients.length < 3) {
      const text = stripHtml(html);
      if (text.toLowerCase().includes("ingredient")) {
        const gpt = await gptExtractIngredients(text, name);
        if (gpt) result = { ingredients: gpt.ingredients, text: gpt.text };
      }
    }

    if (!result || result.ingredients.length < 3) return null;

    return {
      name,
      brand: BRAND,
      ingredients: result.ingredients,
      ingredientText: result.text,
      imageUrl,
      url,
    };
  } catch (err) {
    log("OPENFARM", `Scrape error for ${url}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  OPEN FARM COMPLETE PRODUCT SCRAPER");
  console.log("══════════════════════════════════════════════════\n");

  // Step 1: Find all product URLs
  log("OPENFARM", "Finding all product URLs...");
  const productUrls = await findProductUrls();
  log("OPENFARM", `Found ${productUrls.length} product pages\n`);

  if (productUrls.length === 0) {
    log("OPENFARM", "No product URLs found. Trying Google fallback...");

    // Fallback: use Google to find Open Farm products
    const { googleSearch } = require("./lib");
    const searches = [
      "site:openfarmpet.com dog food ingredients",
      "site:openfarmpet.com cat food ingredients",
      "Open Farm dog food complete ingredient list",
      "Open Farm cat food complete ingredient list",
      "Open Farm dog treats ingredients",
    ];

    for (const q of searches) {
      const results = await googleSearch(q, 10);
      for (const r of results) {
        if (r.url.includes("openfarmpet.com") && !CATEGORY_URLS.some(c => r.url.includes(c.replace(/\/$/, "")))) {
          productUrls.push(r.url);
        }
      }
      await delay(1500);
    }

    // Also try scraping third-party sites for Open Farm products
    const thirdPartySearches = [
      "Open Farm Ancient Grains dog food ingredients",
      "Open Farm Homestead Turkey dog food ingredients",
      "Open Farm Harvest Chicken dog food ingredients",
      "Open Farm Grass-Fed Beef dog food ingredients",
      "Open Farm Pasture-Raised Lamb dog food ingredients",
      "Open Farm Wild-Caught Salmon dog food ingredients",
      "Open Farm Puppy dog food ingredients",
      "Open Farm Senior dog food ingredients",
      "Open Farm RawMix dog food ingredients",
      "Open Farm Gently Cooked dog food ingredients",
      "Open Farm Rustic Blend dog food ingredients",
      "Open Farm Freeze Dried Raw dog food ingredients",
      "Open Farm Bone Broth dog food ingredients",
      "Open Farm dry cat food ingredients",
      "Open Farm wet cat food ingredients",
      "Open Farm Rustic Blend cat food ingredients",
      "Open Farm cat treats ingredients",
      "Open Farm dog treats ingredients",
    ];

    for (const q of thirdPartySearches) {
      log("OPENFARM", `Searching: "${q}"`);
      const { scrapeIngredients } = require("./lib");
      const result = await scrapeIngredients(q.replace(" ingredients", ""), "Open Farm");

      if (result && result.ingredients.length >= 3) {
        const name = q.replace(" ingredients", "").replace("Open Farm ", "Open Farm ");
        const existing = await dbGetExisting(name, BRAND);

        if (!existing || existing.ingredient_count < result.ingredients.length) {
          const saved = await dbSave(name, BRAND, result.ingredients, result.text, "brand", result.sourceUrl);
          if (saved) {
            log("OPENFARM", `✓ ${name} — ${result.ingredients.length} ingredients`);
          }
        }
      }
      await delay(2000);
    }

    return;
  }

  // Step 2: Scrape each product page
  let imported = 0, skipped = 0, failed = 0;

  for (let i = 0; i < productUrls.length; i++) {
    const url = productUrls[i];
    const shortUrl = url.split("openfarmpet.com")[1] || url;

    const product = await scrapeProduct(url);

    if (!product) {
      failed++;
      log("OPENFARM", `[${i + 1}/${productUrls.length}] ✗ ${shortUrl} — no ingredients`);
      await delay(1500);
      continue;
    }

    // Check DB
    const existing = await dbGetExisting(product.name, BRAND);
    if (existing && existing.ingredient_count >= product.ingredients.length) {
      skipped++;
      log("OPENFARM", `[${i + 1}/${productUrls.length}] SKIP ${product.name.substring(0, 50)} (${existing.ingredient_count} in DB)`);
      await delay(1000);
      continue;
    }

    const saved = await dbSave(
      product.name, BRAND,
      product.ingredients, product.ingredientText,
      "brand", product.url, product.imageUrl
    );

    if (saved) {
      imported++;
      log("OPENFARM", `[${i + 1}/${productUrls.length}] ✓ ${product.name.substring(0, 50)} — ${product.ingredients.length} ingredients`);
    } else {
      failed++;
    }

    await delay(1500);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log("  OPEN FARM RESULTS");
  console.log("══════════════════════════════════════════════════");
  console.log(`Product pages: ${productUrls.length}`);
  console.log(`Imported:      ${imported}`);
  console.log(`Skipped:       ${skipped} (already in DB)`);
  console.log(`Failed:        ${failed}`);
}

main().catch(console.error);
