#!/usr/bin/env node
/**
 * Amazon Deep Scraper — brand-by-brand searches to find EVERY product.
 *
 * Strategy: Instead of broad category searches, search for each specific brand.
 * This catches products that don't appear in category searches.
 *
 * Optimizations:
 * - Cached ASINs from previous runs are loaded + extended
 * - No JS rendering (1 credit/page)
 * - 3 parallel product scrapes
 * - Skip already-imported products
 */

const {
  normalizeCacheKey, extractBrand, parseIngredients,
  dbSave, dbGetExisting,
  gptExtractIngredients, stripHtml, extractIngredientsFromHtml,
  log, delay,
  SB_URL, SB_KEY, SBKEY,
} = require("./lib");

const fs = require("fs");
const ASIN_CACHE = "/tmp/amazon-asins-deep.json";

// Every major pet food brand sold on Amazon US
const BRAND_SEARCHES = [
  // ── TOP 50 DOG FOOD BRANDS ──
  "Purina Pro Plan dog food","Purina ONE dog food","Purina Dog Chow","Purina Beyond dog food",
  "Blue Buffalo dog food","Blue Buffalo Wilderness dog food","Blue Buffalo Basics dog food",
  "Blue Buffalo Life Protection dog food","Blue Buffalo Tastefuls dog food",
  "Hills Science Diet dog food","Hills Prescription Diet dog food",
  "Royal Canin dog food","Royal Canin breed specific dog food",
  "Iams dog food","Iams ProActive Health dog food",
  "Pedigree dog food","Pedigree Complete Nutrition",
  "Merrick dog food","Merrick Grain Free dog food","Merrick Backcountry dog food",
  "Taste of the Wild dog food","Taste of the Wild Ancient Grains dog food",
  "Wellness dog food","Wellness CORE dog food","Wellness Complete Health dog food",
  "Nutro dog food","Nutro Ultra dog food","Nutro Wholesome Essentials dog food",
  "Rachael Ray Nutrish dog food","Rachael Ray Nutrish Zero Grain dog food",
  "Diamond Naturals dog food","Diamond dog food",
  "Victor dog food","Victor Hi-Pro dog food",
  "Canidae dog food","Canidae Pure dog food","Canidae All Life Stages dog food",
  "Orijen dog food","Orijen freeze dried dog food",
  "Acana dog food","Acana Singles dog food",
  "Fromm dog food","Fromm Gold dog food","Fromm Four Star dog food",
  "Instinct dog food","Instinct Raw Boost dog food","Instinct Original dog food",
  "Nulo dog food","Nulo Freestyle dog food","Nulo MedalSeries dog food",
  "Open Farm dog food","Open Farm Ancient Grains dog food",
  "Stella and Chewys dog food","Stella Chewys freeze dried dog food",
  "The Honest Kitchen dog food","Honest Kitchen Clusters dog food",
  "Eukanuba dog food","Bil-Jac dog food",
  "Natural Balance dog food","Natural Balance LID dog food",
  "Solid Gold dog food","Halo dog food",
  "Earthborn Holistic dog food","Ziwi Peak dog food",
  "Farmina dog food","Farmina N&D dog food",
  "Crave dog food","Wag dog food",
  "Kirkland Signature dog food","4Health dog food",
  "WholeHearted dog food","Authority dog food","Simply Nourish dog food",
  "Pure Balance dog food","Ol Roy dog food",
  "Kindfull dog food","Heart to Tail dog food",
  "American Journey dog food","Whole Earth Farms dog food",
  "Nature's Recipe dog food","Avoderm dog food",
  "Rawz dog food","Koha dog food","Primal dog food",
  "Lotus dog food","Wysong dog food","Annamaet dog food",
  "Dr Tim's dog food","Grandma Lucy's dog food",
  "Castor and Pollux dog food","I and Love and You dog food",
  "Jinx dog food","Sundays dog food","Nom Nom dog food",
  "JustFoodForDogs","Spot and Tango dog food","Ollie dog food",
  "Freshpet dog food","A Pup Above dog food",
  "Beneful dog food","Purina Beneful dog food",
  "Cesar dog food","Alpo dog food",
  "Kibbles n Bits dog food","Gravy Train dog food",
  "Sportmix dog food","Eagle Pack dog food",
  // ── TOP 50 CAT FOOD BRANDS ──
  "Purina Pro Plan cat food","Purina ONE cat food","Purina Cat Chow",
  "Fancy Feast cat food","Fancy Feast Classic Pate","Fancy Feast Gravy Lovers",
  "Fancy Feast Gems Mousse","Fancy Feast Medleys","Fancy Feast Broths",
  "Friskies cat food","Friskies Pate cat food","Friskies Shreds cat food",
  "Blue Buffalo cat food","Blue Buffalo Wilderness cat food","Blue Buffalo Indoor cat food",
  "Hills Science Diet cat food","Hills Prescription Diet cat food",
  "Royal Canin cat food","Royal Canin Indoor cat food","Royal Canin Kitten cat food",
  "Iams cat food","Iams ProActive Health cat food",
  "Meow Mix cat food","Meow Mix Tender Centers","Meow Mix Indoor",
  "Sheba cat food","Sheba Perfect Portions",
  "9 Lives cat food","Kit and Kaboodle cat food",
  "Temptations cat treats","Temptations Classic cat treats",
  "Wellness cat food","Wellness CORE cat food",
  "Merrick cat food","Merrick Purrfect Bistro cat food",
  "Tiki Cat food","Tiki Cat Luau","Tiki Cat After Dark",
  "Weruva cat food","Weruva BFF cat food",
  "Instinct cat food","Instinct Original cat food",
  "Nutro cat food","Nutro Indoor cat food",
  "Orijen cat food","Acana cat food",
  "Nulo cat food","Farmina cat food",
  "Open Farm cat food","Stella and Chewys cat food",
  "Fussie Cat food","Rawz cat food",
  "Delectables cat treats","INABA Churu cat treats",
  "Greenies cat treats","Greenies Feline dental cat treats",
  "WholeHearted cat food","Simply Nourish cat food",
  "Special Kitty cat food","Pure Balance cat food",
  // ── DOG TREATS ──
  "Greenies dog treats","Greenies dental dog treats",
  "Milk Bone dog treats","Milk Bone dog biscuits",
  "Zuke's dog treats","Zuke's Mini Naturals",
  "Blue Buffalo dog treats","Blue Bits dog treats",
  "Old Mother Hubbard dog treats","Beggin Strips dog treats",
  "Purina Busy Bone dog treats","Dentastix dog treats",
  "Whimzees dog treats","Barkbox dog treats",
  "Himalayan dog chew","Yak cheese dog chew",
  "Nylabone dog chews","Bully sticks for dogs",
  // ── SPECIALTY/NICHE ──
  "freeze dried raw dog food","dehydrated dog food",
  "fresh dog food subscription","air dried dog food",
  "grain free dog food","limited ingredient dog food",
  "senior dog food","puppy food","large breed dog food","small breed dog food",
  "freeze dried raw cat food","grain free cat food",
  "kitten food","senior cat food","indoor cat food",
  "lickable cat treats squeeze","cat food topper",
];

async function searchAmazon(query, page) {
  const url = `https://www.amazon.com/s?k=${encodeURIComponent(query)}&page=${page}`;
  const params = new URLSearchParams({
    api_key: SBKEY, url, render_js: "false", country_code: "us",
  });
  const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return [];
  const html = await r.text();
  if (html.length < 1000) return [];
  const asins = new Set();
  (html.match(/\/dp\/([A-Z0-9]{10})/g) || []).forEach(m => asins.add(m.replace("/dp/", "")));
  (html.match(/data-asin="([A-Z0-9]{10})"/g) || []).forEach(m => {
    const a = m.match(/data-asin="([A-Z0-9]{10})"/)?.[1]; if (a) asins.add(a);
  });
  return [...asins];
}

async function scrapeProduct(asin) {
  const url = `https://www.amazon.com/dp/${asin}`;
  const params = new URLSearchParams({ api_key: SBKEY, url, render_js: "false", country_code: "us" });
  let html;
  try {
    const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, { signal: AbortSignal.timeout(12000) });
    if (r.ok) html = await r.text();
  } catch {}
  if (!html || html.length < 2000) return null;

  const titleMatch = html.match(/id="productTitle"[^>]*>([^<]+)</i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
  let title = titleMatch?.[1]?.trim()?.replace(/\s*[-|:]?\s*Amazon\.com.*$/i, "")
    ?.replace(/\s*\d+(\.\d+)?\s*(oz|lb|lbs|kg|g|pound|ounce|count|pack|ct|can|pouch|bag)s?\b.*/gi, "")?.trim();
  if (!title || title.length < 5) return null;

  const brand = (html.match(/id="bylineInfo"[^>]*>(?:Visit the\s+)?([^<]+?)(?:\s+Store)?<\/a>/i) ||
                 html.match(/"brand"\s*:\s*"([^"]+)"/i))?.[1]?.trim() || extractBrand(title);
  const imgMatch = html.match(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i) ||
                   html.match(/data-old-hires="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i);
  const imageUrl = imgMatch?.[1] || null;

  let result = extractIngredientsFromHtml(html);
  if (result && result.ingredients.length >= 5)
    return { name: title, brand, ingredients: result.ingredients, ingredientText: result.text, imageUrl, asin, url };

  const patterns = [
    /Ingredients<\/(?:h[1-6]|span|div|p|b|strong)[^>]*>\s*<(?:p|div|span)[^>]*>([^<]{20,5000})/i,
    /(?:Ingredients|INGREDIENTS)\s*[:]\s*([^<]{20,5000})/i,
    /Ingredients<\/(?:th|td|dt)[^>]*>\s*<(?:td|dd)[^>]*>([^<]{20,5000})/i,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      const ingredients = parseIngredients(m[1].trim());
      if (ingredients.length >= 3) return { name: title, brand, ingredients, ingredientText: m[1].trim(), imageUrl, asin, url };
    }
  }

  const text = stripHtml(html);
  if (text.length > 200 && text.toLowerCase().includes("ingredient")) {
    const gpt = await gptExtractIngredients(text, `${brand} ${title}`);
    if (gpt && gpt.ingredients.length >= 3)
      return { name: title, brand, ingredients: gpt.ingredients, ingredientText: gpt.text, imageUrl, asin, url };
  }
  return null;
}

async function processBatch(products, total, stats) {
  const results = await Promise.allSettled(products.map(async (p) => {
    const product = await scrapeProduct(p.asin);
    if (!product) return "no_ing";
    const existing = await dbGetExisting(product.name, product.brand);
    if (existing && existing.ingredient_count >= product.ingredients.length) return "skip";
    const saved = await dbSave(product.name, product.brand, product.ingredients, product.ingredientText, "amazon", product.url, product.imageUrl);
    if (saved) { log("AMAZON", `[${stats.imported + 1}/${total}] ✓ ${product.name.substring(0, 50)} — ${product.ingredients.length}`); return "imported"; }
    return "failed";
  }));
  for (const r of results) {
    const v = r.status === "fulfilled" ? r.value : "failed";
    stats[v === "imported" ? "imported" : v === "skip" ? "skipped" : v === "no_ing" ? "noIng" : "failed"]++;
  }
}

async function main() {
  const maxPages = 5;
  const batchSize = 3;

  console.log("\n══════════════════════════════════════════════════");
  console.log("  AMAZON DEEP SCRAPER — BRAND-BY-BRAND");
  console.log(`  ${BRAND_SEARCHES.length} brand searches × ${maxPages} pages`);
  console.log("══════════════════════════════════════════════════\n");

  // Load or build ASIN list
  let allAsins;
  if (fs.existsSync(ASIN_CACHE)) {
    allAsins = new Set(JSON.parse(fs.readFileSync(ASIN_CACHE, "utf8")));
    log("AMAZON", `Loaded ${allAsins.size} cached ASINs`);
  } else {
    allAsins = new Set();
    // Also load previous ASINs to extend
    if (fs.existsSync("/tmp/amazon-asins.json")) {
      const prev = JSON.parse(fs.readFileSync("/tmp/amazon-asins.json", "utf8"));
      prev.forEach(a => allAsins.add(a));
      log("AMAZON", `Loaded ${allAsins.size} ASINs from previous broad scrape`);
    }

    for (let i = 0; i < BRAND_SEARCHES.length; i++) {
      const q = BRAND_SEARCHES[i];
      log("AMAZON", `[${i + 1}/${BRAND_SEARCHES.length}] "${q}"`);
      for (let page = 1; page <= maxPages; page++) {
        try {
          const asins = await searchAmazon(q, page);
          let n = 0;
          for (const a of asins) { if (!allAsins.has(a)) { allAsins.add(a); n++; } }
          if (n > 0) log("AMAZON", `  Page ${page}: ${asins.length} (${n} new) — total: ${allAsins.size}`);
          if (asins.length < 5) break;
        } catch {}
        await delay(1000);
      }
      await delay(800);
      // Save progress every 20 brands
      if (i % 20 === 0) fs.writeFileSync(ASIN_CACHE, JSON.stringify([...allAsins]));
    }
    fs.writeFileSync(ASIN_CACHE, JSON.stringify([...allAsins]));
    log("AMAZON", `Cached ${allAsins.size} ASINs`);
  }

  log("AMAZON", `\nTotal unique ASINs: ${allAsins.size}`);

  // Scrape
  const asinList = [...allAsins].map(a => ({ asin: a }));
  const stats = { imported: 0, skipped: 0, noIng: 0, failed: 0 };

  for (let i = 0; i < asinList.length; i += batchSize) {
    const batch = asinList.slice(i, i + batchSize);
    await processBatch(batch, asinList.length, stats);
    if ((i + batchSize) % 150 === 0) {
      log("AMAZON", `Progress: ${i + batchSize}/${asinList.length} | imported: ${stats.imported} | skipped: ${stats.skipped} | no ing: ${stats.noIng}`);
    }
    await delay(400);
  }

  // Keep cache for rescue script
  // try { fs.unlinkSync(ASIN_CACHE); } catch {}

  console.log("\n══════════════════════════════════════════════════");
  console.log(`Products: ${allAsins.size} | Imported: ${stats.imported} | Skipped: ${stats.skipped} | No ing: ${stats.noIng} | Failed: ${stats.failed}`);
  console.log(`Credits: ~${allAsins.size + BRAND_SEARCHES.length * maxPages}`);
}

main().catch(console.error);
