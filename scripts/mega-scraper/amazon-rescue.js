#!/usr/bin/env node
/**
 * Amazon Rescue — finds ingredients for products Amazon couldn't show.
 *
 * Strategy:
 * 1. Scrape each "missed" ASIN to get the product TITLE (no JS, 1 credit)
 * 2. Google search "[title] ingredients" to find ingredients on third-party sites
 * 3. Extract ingredients from the third-party page
 *
 * This is smarter than JS rendering because:
 * - Third-party sites show ingredients in plain HTML (not hidden behind tabs)
 * - 2 credits per product vs 5 for JS rendering
 * - Higher success rate
 *
 * Run: node scripts/mega-scraper/amazon-rescue.js
 */

const {
  normalizeCacheKey, extractBrand, parseIngredients,
  dbSave, dbGetExisting,
  scrapeIngredients, extractIngredientsFromHtml,
  scrapePage, stripHtml, gptExtractIngredients,
  log, delay,
  SB_URL, SB_KEY, SBKEY,
} = require("./lib");

const fs = require("fs");

// Load ASINs from the deep scrape cache
const DEEP_CACHE = "/tmp/amazon-asins-deep.json";
const BROAD_CACHE = "/tmp/amazon-asins.json";
const RESCUE_PROGRESS = "/tmp/amazon-rescue-progress.json";

async function getTitle(asin) {
  const url = `https://www.amazon.com/dp/${asin}`;
  const params = new URLSearchParams({ api_key: SBKEY, url, render_js: "false", country_code: "us" });
  try {
    const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const html = await r.text();
    if (html.length < 1000) return null;

    const titleMatch = html.match(/id="productTitle"[^>]*>([^<]+)</i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let title = titleMatch?.[1]?.trim()
      ?.replace(/\s*[-|:]?\s*Amazon\.com.*$/i, "")
      ?.replace(/\s*\d+(\.\d+)?\s*(oz|lb|lbs|kg|g|pound|ounce|count|pack|ct|can|pouch|bag)s?\b.*/gi, "")
      ?.trim();
    if (!title || title.length < 5 || title.length > 200) return null;

    const brand = (html.match(/id="bylineInfo"[^>]*>(?:Visit the\s+)?([^<]+?)(?:\s+Store)?<\/a>/i) ||
                   html.match(/"brand"\s*:\s*"([^"]+)"/i))?.[1]?.trim() || extractBrand(title);
    const imgMatch = html.match(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i) ||
                     html.match(/data-old-hires="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i);

    // Also try to extract ingredients from Amazon page directly (some pages work without JS)
    let result = extractIngredientsFromHtml(html);
    if (result && result.ingredients.length >= 5) {
      return { title, brand, imageUrl: imgMatch?.[1] || null, ingredients: result.ingredients, text: result.text, fromAmazon: true };
    }

    const patterns = [
      /Ingredients<\/(?:h[1-6]|span|div|p|b|strong)[^>]*>\s*<(?:p|div|span)[^>]*>([^<]{20,5000})/i,
      /(?:Ingredients|INGREDIENTS)\s*[:]\s*([^<]{20,5000})/i,
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) {
        const ingredients = parseIngredients(m[1].trim());
        if (ingredients.length >= 3)
          return { title, brand, imageUrl: imgMatch?.[1] || null, ingredients, text: m[1].trim(), fromAmazon: true };
      }
    }

    return { title, brand, imageUrl: imgMatch?.[1] || null, ingredients: null };
  } catch { return null; }
}

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  AMAZON RESCUE — FIND MISSING INGREDIENTS");
  console.log("  Strategy: Get title → Google for ingredients");
  console.log("══════════════════════════════════════════════════\n");

  // Collect all ASINs from previous runs
  let allAsins = new Set();
  for (const cache of [DEEP_CACHE, BROAD_CACHE]) {
    if (fs.existsSync(cache)) {
      const data = JSON.parse(fs.readFileSync(cache, "utf8"));
      data.forEach(a => allAsins.add(a));
    }
  }

  if (allAsins.size === 0) {
    log("RESCUE", "No cached ASINs found. Run amazon-fast.js or amazon-deep.js first.");
    return;
  }

  log("RESCUE", `Total ASINs from previous runs: ${allAsins.size}`);

  // Load progress (skip already-processed ASINs)
  let processed = new Set();
  if (fs.existsSync(RESCUE_PROGRESS)) {
    processed = new Set(JSON.parse(fs.readFileSync(RESCUE_PROGRESS, "utf8")));
    log("RESCUE", `Already processed: ${processed.size} — resuming`);
  }

  const todo = [...allAsins].filter(a => !processed.has(a));
  log("RESCUE", `ASINs to process: ${todo.length}\n`);

  let imported = 0, skipped = 0, noTitle = 0, noIng = 0, alreadyInDb = 0;
  const BATCH = 10; // 10 parallel — max speed

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);

    const results = await Promise.allSettled(batch.map(async (asin) => {
      processed.add(asin);
      const info = await getTitle(asin);
      if (!info) return "no_title";

      const existing = await dbGetExisting(info.title, info.brand);
      if (existing && existing.ingredient_count >= 5) return "in_db";

      // Only use Amazon-extracted ingredients — skip Google (too slow)
      if (info.ingredients && info.ingredients.length >= 3) {
        const saved = await dbSave(info.title, info.brand, info.ingredients, info.text, "amazon", `https://www.amazon.com/dp/${asin}`, info.imageUrl);
        if (saved) return "imported";
      }
      return "no_ing";
    }));

    for (const r of results) {
      const v = r.status === "fulfilled" ? r.value : "no_ing";
      if (v === "imported") imported++;
      else if (v === "in_db") alreadyInDb++;
      else if (v === "no_title") noTitle++;
      else noIng++;
    }

    if ((i + BATCH) % 200 === 0 || i + BATCH >= todo.length) {
      fs.writeFileSync(RESCUE_PROGRESS, JSON.stringify([...processed]));
      log("RESCUE", `Progress: ${i + BATCH}/${todo.length} | imported: ${imported} | in DB: ${alreadyInDb} | no ing: ${noIng}`);
    }
  }

  // Save final progress
  fs.writeFileSync(RESCUE_PROGRESS, JSON.stringify([...processed]));

  console.log("\n══════════════════════════════════════════════════");
  console.log(`Processed:    ${todo.length}`);
  console.log(`Imported:     ${imported}`);
  console.log(`Already in DB: ${alreadyInDb}`);
  console.log(`No title:     ${noTitle}`);
  console.log(`No ingredients: ${noIng}`);
  console.log(`Credits:      ~${(todo.length - alreadyInDb) * 2}`);
}

main().catch(console.error);
