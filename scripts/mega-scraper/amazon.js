#!/usr/bin/env node
/**
 * Amazon Pet Food Scraper
 *
 * Scrapes all dog food and cat food from Amazon US:
 * 1. Search Amazon categories → collect product ASINs
 * 2. Scrape each product page → extract ingredients + image
 * 3. Save to database with image_url
 *
 * Uses ScrapingBee for reliable Amazon scraping.
 * Cost: ~1 credit per search page, ~5 credits per product page (JS)
 *
 * Run: node scripts/mega-scraper/amazon.js [--category=dog|cat|treats|all]
 */

const {
  normalizeCacheKey, extractBrand, parseIngredients,
  dbSave, dbGetExisting,
  gptExtractIngredients, stripHtml,
  log, delay,
  SBKEY,
} = require("./lib");

// ── Amazon Search URLs ──────────────────────────────────────────────

const SEARCH_QUERIES = [
  // Dog Food — Dry
  { q: "dry dog food", cat: "dog", type: "dry" },
  { q: "grain free dry dog food", cat: "dog", type: "dry" },
  { q: "large breed dry dog food", cat: "dog", type: "dry" },
  { q: "small breed dry dog food", cat: "dog", type: "dry" },
  { q: "puppy dry dog food", cat: "dog", type: "dry" },
  { q: "senior dry dog food", cat: "dog", type: "dry" },
  { q: "weight management dry dog food", cat: "dog", type: "dry" },
  { q: "limited ingredient dry dog food", cat: "dog", type: "dry" },
  { q: "high protein dry dog food", cat: "dog", type: "dry" },
  // Dog Food — Wet
  { q: "wet dog food canned", cat: "dog", type: "wet" },
  { q: "wet dog food pate", cat: "dog", type: "wet" },
  { q: "wet dog food stew", cat: "dog", type: "wet" },
  // Dog Food — Fresh/Raw/FD
  { q: "fresh dog food", cat: "dog", type: "fresh" },
  { q: "freeze dried raw dog food", cat: "dog", type: "fd" },
  { q: "dehydrated dog food", cat: "dog", type: "dehydrated" },
  // Dog Treats
  { q: "dog treats", cat: "dog", type: "treat" },
  { q: "dog dental treats", cat: "dog", type: "treat" },
  { q: "dog training treats", cat: "dog", type: "treat" },
  { q: "dog biscuits", cat: "dog", type: "treat" },
  // Cat Food — Dry
  { q: "dry cat food", cat: "cat", type: "dry" },
  { q: "indoor dry cat food", cat: "cat", type: "dry" },
  { q: "grain free dry cat food", cat: "cat", type: "dry" },
  { q: "kitten dry food", cat: "cat", type: "dry" },
  { q: "senior cat food dry", cat: "cat", type: "dry" },
  // Cat Food — Wet
  { q: "wet cat food pate", cat: "cat", type: "wet" },
  { q: "wet cat food gravy", cat: "cat", type: "wet" },
  { q: "canned cat food", cat: "cat", type: "wet" },
  { q: "cat food variety pack", cat: "cat", type: "wet" },
  // Cat Treats
  { q: "cat treats", cat: "cat", type: "treat" },
  { q: "cat dental treats", cat: "cat", type: "treat" },
  { q: "lickable cat treats", cat: "cat", type: "treat" },
];

// ── Amazon Search via ScrapingBee ───────────────────────────────────

async function searchAmazon(query, page = 1) {
  const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}&page=${page}`;
  const params = new URLSearchParams({
    api_key: SBKEY,
    url: amazonUrl,
    render_js: "true",
    wait: "3000",
    country_code: "us",
  });

  const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return [];

  const html = await r.text();
  if (html.length < 1000) return [];

  // Extract ASINs and product info from search results
  const products = [];

  // Match ASIN patterns in href="/dp/ASIN"
  const asinMatches = html.match(/\/dp\/([A-Z0-9]{10})/g) || [];
  const asins = [...new Set(asinMatches.map(m => m.replace("/dp/", "")))];

  // Also try to extract product titles from search results
  // Amazon uses data-asin attributes
  const dataAsinMatches = html.match(/data-asin="([A-Z0-9]{10})"/g) || [];
  for (const m of dataAsinMatches) {
    const asin = m.match(/data-asin="([A-Z0-9]{10})"/)?.[1];
    if (asin && !asins.includes(asin)) asins.push(asin);
  }

  // Extract image URLs from search results
  const imgMap = {};
  const imgMatches = html.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9._%-]+\.jpg/g) || [];
  // Associate images with nearby ASINs (best effort)

  for (const asin of asins) {
    products.push({
      asin,
      url: `https://www.amazon.com/dp/${asin}`,
    });
  }

  return products;
}

// ── Amazon Product Page Scraper ─────────────────────────────────────

async function scrapeAmazonProduct(asin) {
  const url = `https://www.amazon.com/dp/${asin}`;
  const params = new URLSearchParams({
    api_key: SBKEY,
    url,
    render_js: "true",
    wait: "3000",
    country_code: "us",
  });

  const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return null;

  const html = await r.text();
  if (html.length < 2000) return null;

  // Extract product title
  const titleMatch = html.match(/id="productTitle"[^>]*>([^<]+)</i) ||
                     html.match(/<title[^>]*>([^<]+)<\/title>/i);
  let title = titleMatch?.[1]?.trim()
    ?.replace(/\s*[-|:]?\s*Amazon\.com.*$/i, "")
    ?.replace(/\s*\d+(\.\d+)?\s*(oz|lb|lbs|kg|g|pound|ounce|count|pack|ct|can|pouch|bag)s?\b.*/gi, "")
    ?.trim();
  if (!title || title.length < 5) return null;

  // Extract brand
  const brandMatch = html.match(/id="bylineInfo"[^>]*>(?:Visit the\s+)?([^<]+?)(?:\s+Store)?<\/a>/i) ||
                     html.match(/"brand"\s*:\s*"([^"]+)"/i) ||
                     html.match(/Brand<\/td>\s*<td[^>]*>([^<]+)/i);
  const brand = brandMatch?.[1]?.trim() || extractBrand(title);

  // Extract main product image
  const imgMatch = html.match(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i) ||
                   html.match(/id="landingImage"[^>]*src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i) ||
                   html.match(/data-old-hires="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i);
  const imageUrl = imgMatch?.[1] || null;

  // Extract ingredients — multiple possible locations on Amazon
  let ingredientText = null;

  // Method 1: "Important information" section
  const importantMatch = html.match(/Ingredients<\/(?:h[1-6]|span|div|p|b|strong)[^>]*>\s*<(?:p|div|span)[^>]*>([^<]{20,5000})/i);
  if (importantMatch) ingredientText = importantMatch[1].trim();

  // Method 2: "Ingredients" in product description
  if (!ingredientText) {
    const descMatch = html.match(/(?:Ingredients|INGREDIENTS)\s*[:]\s*([^<]{20,5000})/i);
    if (descMatch) ingredientText = descMatch[1].trim();
  }

  // Method 3: Product details section
  if (!ingredientText) {
    const detailMatch = html.match(/Active Ingredients|Inactive Ingredients|Ingredients<\/(?:th|td|dt)[^>]*>\s*<(?:td|dd)[^>]*>([^<]{20,5000})/i);
    if (detailMatch) ingredientText = detailMatch[1].trim();
  }

  // Method 4: Try GPT extraction from full page text
  if (!ingredientText) {
    const text = stripHtml(html);
    if (text.toLowerCase().includes("ingredient")) {
      const gpt = await gptExtractIngredients(text, `${brand} ${title}`);
      if (gpt) ingredientText = gpt.text;
    }
  }

  if (!ingredientText) return null;

  // Clean up ingredient text
  ingredientText = ingredientText
    .replace(/\.\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const ingredients = parseIngredients(ingredientText);
  if (ingredients.length < 3) return null;

  return {
    name: title,
    brand,
    ingredients,
    ingredientText,
    imageUrl,
    asin,
    url,
  };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const categoryArg = process.argv.find(a => a.startsWith("--category="))?.split("=")[1] || "all";
  const maxPagesPerQuery = parseInt(process.argv.find(a => a.startsWith("--pages="))?.split("=")[1] || "5");

  const queries = SEARCH_QUERIES.filter(q => {
    if (categoryArg === "all") return true;
    if (categoryArg === "treats") return q.type === "treat";
    return q.cat === categoryArg;
  });

  console.log("\n══════════════════════════════════════════════════");
  console.log("  AMAZON PET FOOD SCRAPER");
  console.log("══════════════════════════════════════════════════");
  console.log(`Queries: ${queries.length}`);
  console.log(`Pages per query: ${maxPagesPerQuery}`);
  console.log(`Category: ${categoryArg}\n`);

  // Phase 1: Collect all product ASINs from search results
  const allProducts = new Map(); // ASIN → product info

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    log("AMAZON", `[${i + 1}/${queries.length}] Searching: "${q.q}"`);

    for (let page = 1; page <= maxPagesPerQuery; page++) {
      try {
        const products = await searchAmazon(q.q, page);
        let newCount = 0;
        for (const p of products) {
          if (!allProducts.has(p.asin)) {
            allProducts.set(p.asin, { ...p, cat: q.cat, type: q.type });
            newCount++;
          }
        }
        log("AMAZON", `  Page ${page}: ${products.length} products (${newCount} new) — total: ${allProducts.size}`);

        if (products.length < 5) break; // No more results
      } catch (err) {
        log("AMAZON", `  Page ${page} error: ${err.message}`);
      }
      await delay(2000);
    }
    await delay(1500);
  }

  log("AMAZON", `\nTotal unique products found: ${allProducts.size}`);

  // Phase 2: Scrape each product page for ingredients + image
  let imported = 0, skipped = 0, failed = 0, noIngredients = 0;
  const products = [...allProducts.values()];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const num = `[${String(i + 1).padStart(4)}/${products.length}]`;

    try {
      // Scrape the product page
      const product = await scrapeAmazonProduct(p.asin);

      if (!product) {
        noIngredients++;
        if (i % 50 === 0) log("AMAZON", `${num} ${p.asin} — no ingredients found`);
        await delay(2000);
        continue;
      }

      // Check if already in DB with better data
      const existing = await dbGetExisting(product.name, product.brand);
      if (existing && existing.ingredient_count >= product.ingredients.length) {
        skipped++;
        await delay(1500);
        continue;
      }

      // Save to DB with image
      const saved = await dbSave(
        product.name, product.brand,
        product.ingredients, product.ingredientText,
        "amazon", product.url, product.imageUrl
      );

      if (saved) {
        imported++;
        log("AMAZON", `${num} ✓ ${product.name.substring(0, 50)} — ${product.ingredients.length} ingredients`);
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      if (err.message?.includes("timeout")) {
        log("AMAZON", `${num} timeout — skipping`);
      }
    }

    await delay(2000);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log("  AMAZON RESULTS");
  console.log("══════════════════════════════════════════════════");
  console.log(`Products found:     ${allProducts.size}`);
  console.log(`Imported:           ${imported}`);
  console.log(`Skipped:            ${skipped} (already in DB)`);
  console.log(`No ingredients:     ${noIngredients}`);
  console.log(`Failed:             ${failed}`);
}

main().catch(console.error);
