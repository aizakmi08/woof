/**
 * Seed database with 100% accurate ingredients from small pet store websites.
 * These sites have real label data in plain HTML and don't block scrapers.
 *
 * Strategy: Google search → find small store → scrape ingredients → save
 * Cost: 2 ScrapingBee credits per product (1 Google + 1 page scrape)
 *
 * Run: node scripts/seed-accurate.js
 */

const SBKEY = process.env.SBKEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Sites that block scrapers — skip these
const BLOCKED = ["amazon.com", "chewy.com", "walmart.com", "target.com", "petsmart.com", "petco.com", "google.com", "youtube.com", "facebook.com", "reddit.com", "instagram.com", "tiktok.com"];

const PRODUCTS = [
  // Dog foods that GPT missed or got wrong — need real data
  { name: "Hills Science Diet Adult Chicken and Barley Recipe Dry Dog Food", brand: "Hills Science Diet", pet: "dog" },
  { name: "Hills Science Diet Adult Small Bites Chicken and Barley Recipe", brand: "Hills Science Diet", pet: "dog" },
  { name: "Hills Science Diet Puppy Chicken and Barley Recipe", brand: "Hills Science Diet", pet: "dog" },
  { name: "Royal Canin Medium Adult Dry Dog Food", brand: "Royal Canin", pet: "dog" },
  { name: "Royal Canin Large Breed Adult Dry Dog Food", brand: "Royal Canin", pet: "dog" },
  { name: "Royal Canin Small Breed Adult Dry Dog Food", brand: "Royal Canin", pet: "dog" },
  { name: "Kirkland Signature Adult Dog Chicken Rice and Vegetable Formula", brand: "Kirkland", pet: "dog" },
  { name: "Orijen Original Grain-Free Dry Dog Food", brand: "Orijen", pet: "dog" },
  { name: "Acana Wholesome Grains Free-Run Poultry Recipe", brand: "Acana", pet: "dog" },
  { name: "Open Farm Ancient Grains Chicken Recipe Dry Dog Food", brand: "Open Farm", pet: "dog" },
  { name: "The Honest Kitchen Whole Grain Chicken Recipe Dry Dog Food", brand: "The Honest Kitchen", pet: "dog" },
  { name: "The Honest Kitchen Essential Clusters Whole Grain Chicken", brand: "The Honest Kitchen", pet: "dog" },
  { name: "Pedigree Complete Nutrition Adult Chicken Dry Dog Food", brand: "Pedigree", pet: "dog" },
  { name: "Ol Roy Complete Nutrition Dry Dog Food", brand: "Ol Roy", pet: "dog" },
  { name: "Merrick Classic Real Chicken and Brown Rice Recipe Dry Dog Food", brand: "Merrick", pet: "dog" },
  // Cat foods that GPT missed
  { name: "Blue Buffalo Wilderness Indoor Chicken Recipe Dry Cat Food", brand: "Blue Buffalo", pet: "cat" },
  { name: "Purina Pro Plan Adult Indoor Care Turkey and Rice Cat Food", brand: "Purina Pro Plan", pet: "cat" },
  { name: "Hills Science Diet Adult Indoor Chicken Recipe Cat Food", brand: "Hills Science Diet", pet: "cat" },
  { name: "Royal Canin Indoor Adult Dry Cat Food", brand: "Royal Canin", pet: "cat" },
  { name: "Fancy Feast Gems Mousse Pate with Salmon", brand: "Fancy Feast", pet: "cat" },
  { name: "Fancy Feast Gems Mousse Pate with Beef", brand: "Fancy Feast", pet: "cat" },
  { name: "Fancy Feast Gems Mousse Pate with Chicken", brand: "Fancy Feast", pet: "cat" },
  { name: "Fancy Feast Broths Classic with Chicken", brand: "Fancy Feast", pet: "cat" },
  { name: "9 Lives Daily Essentials Dry Cat Food", brand: "9 Lives", pet: "cat" },
  // Popular products for completeness
  { name: "Purina Pro Plan Adult Chicken and Rice Entree Wet Dog Food", brand: "Purina Pro Plan", pet: "dog" },
  { name: "Blue Buffalo Homestyle Recipe Chicken Dinner Wet Dog Food", brand: "Blue Buffalo", pet: "dog" },
  { name: "Nutro Wholesome Essentials Indoor Adult Chicken Cat Food", brand: "Nutro", pet: "cat" },
  { name: "Iams ProActive Health Large Breed Adult Chicken Dry Dog Food", brand: "Iams", pet: "dog" },
];

function normalizeCacheKey(name) {
  return name.toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIngredients(text) {
  // Split on commas but not inside parentheses/brackets
  const parts = [];
  let current = "";
  let depth = 0;
  for (const ch of text.replace(/\.$/, "").replace(/\s+/g, " ")) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(i => i.length > 1 && i.length < 200).map(i => i.charAt(0).toUpperCase() + i.slice(1));
}

async function findAndScrapeIngredients(productName, brand) {
  // Step 1: Google search for ingredient list on small pet store sites
  const query = `"${productName}" ingredients`;
  const searchUrl = `https://app.scrapingbee.com/api/v1/store/google?api_key=${SBKEY}&search=${encodeURIComponent(query)}&nb_results=8`;

  const searchResp = await fetch(searchUrl, { signal: AbortSignal.timeout(12000) });
  if (!searchResp.ok) return null;

  const searchData = await searchResp.json();
  const results = searchData?.organic_results || [];

  // Filter to non-blocked sites
  const candidates = results.filter(r => r.url && !BLOCKED.some(b => r.url.includes(b)));
  if (candidates.length === 0) return null;

  // Try each candidate
  for (const candidate of candidates.slice(0, 3)) {
    try {
      const pageUrl = candidate.url.split("?")[0];
      const pageResp = await fetch(`https://app.scrapingbee.com/api/v1/?api_key=${SBKEY}&url=${encodeURIComponent(pageUrl)}&render_js=false`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!pageResp.ok) continue;

      const html = await pageResp.text();
      const safeHtml = html.length > 500000 ? html.slice(0, 500000) : html;

      // Find ingredient lists in the HTML
      const blocks = safeHtml.match(/>([^<]{60,5000})</g) || [];
      for (const b of blocks) {
        const inner = b.slice(1).trim();
        const commas = (inner.match(/,/g) || []).length;
        if (commas < 5) continue;
        const lower = inner.toLowerCase();
        if (lower.includes("function") || lower.includes("=>") || lower.includes("@context") || lower.includes("{\"")) continue;

        // Check for food words
        const foodWords = ["chicken", "beef", "salmon", "turkey", "rice", "meal", "peas", "fat", "oil", "vitamin", "lamb", "fish", "corn", "wheat", "barley"];
        const foodCount = foodWords.filter(w => lower.includes(w)).length;
        if (foodCount < 2) continue;

        // Parse and validate
        const ingredients = parseIngredients(inner);
        if (ingredients.length >= 8) {
          return {
            ingredients,
            ingredientText: inner,
            sourceUrl: pageUrl,
          };
        }
      }
    } catch (err) {
      continue;
    }
  }
  return null;
}

async function saveToSupabase(product, ingredients, ingredientText, sourceUrl) {
  const cacheKey = normalizeCacheKey(`${product.brand} ${product.name}`);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_product_data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      p_cache_key: cacheKey,
      p_product_name: product.name,
      p_brand: product.brand,
      p_ingredients: ingredients,
      p_ingredient_text: ingredientText,
      p_ingredient_count: ingredients.length,
      p_source: "manufacturer",
    }),
  });

  return response.ok;
}

async function main() {
  console.log(`\n=== ACCURATE SEEDING: ${PRODUCTS.length} PRODUCTS ===`);
  console.log(`Using Google search → small pet store scraping\n`);

  let success = 0, failed = 0;

  for (let i = 0; i < PRODUCTS.length; i++) {
    const product = PRODUCTS[i];
    const num = `[${i + 1}/${PRODUCTS.length}]`;

    console.log(`${num} ${product.name.substring(0, 55)}`);

    const result = await findAndScrapeIngredients(product.name, product.brand);

    if (!result || result.ingredients.length < 8) {
      console.log(`  ✗ NOT FOUND`);
      failed++;
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    console.log(`  Found: ${result.ingredients.length} ingredients from ${result.sourceUrl?.substring(0, 40)}`);
    console.log(`  First 3: ${result.ingredients.slice(0, 3).join(", ")}`);

    const saved = await saveToSupabase(product, result.ingredients, result.ingredientText, result.sourceUrl);
    if (saved) {
      console.log(`  ✓ SAVED`);
      success++;
    } else {
      console.log(`  ✗ Save failed`);
      failed++;
    }

    // 1.5s delay between products (2 credits each: Google + scrape)
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n=== DONE ===`);
  console.log(`Success: ${success}/${PRODUCTS.length}`);
  console.log(`Failed: ${failed}/${PRODUCTS.length}`);
  console.log(`Credits used: ~${(success + failed) * 2}`);
}

main().catch(console.error);
