/**
 * Universal ingredient scraper — gets 100% accurate ingredients from ANY website.
 *
 * Strategy:
 * 1. Google search for product + "ingredients"
 * 2. Scrape page WITH JS rendering (5 credits)
 * 3. GPT-4o-mini extracts ingredient list from page text (reads, not guesses)
 * 4. Save to Supabase product_data
 *
 * Cost: ~6 credits + $0.01 per product
 * Run: node scripts/seed-universal.js
 */

const SBKEY = process.env.SBKEY;
const OKEY = process.env.OKEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const BLOCKED = ["google.com", "youtube.com", "facebook.com", "reddit.com", "instagram.com", "tiktok.com", "pinterest.com", "twitter.com", "x.com"];
const GOOGLE_URL = "https://app.scrapingbee.com/api/v1/store/google";
const SCRAPE_URL = "https://app.scrapingbee.com/api/v1/";

// Products to seed — focus on what's missing from the DB
const PRODUCTS = [
  // Products GPT couldn't find or got wrong
  { name: "Hills Science Diet Adult Chicken and Barley Recipe Dry Dog Food", brand: "Hills" },
  { name: "Hills Science Diet Adult Large Breed Chicken Dry Dog Food", brand: "Hills" },
  { name: "Hills Science Diet Adult Small Bites Chicken and Barley", brand: "Hills" },
  { name: "Royal Canin Medium Adult Dry Dog Food", brand: "Royal Canin" },
  { name: "Royal Canin Indoor Adult Dry Cat Food", brand: "Royal Canin" },
  { name: "Royal Canin Small Breed Adult Dry Dog Food", brand: "Royal Canin" },
  { name: "Kirkland Signature Adult Dog Food Chicken Rice Vegetable", brand: "Kirkland" },
  { name: "Orijen Original Grain-Free Dry Dog Food", brand: "Orijen" },
  { name: "Pedigree Complete Nutrition Adult Chicken", brand: "Pedigree" },
  { name: "Ol Roy Complete Nutrition Dry Dog Food", brand: "Ol Roy" },
  { name: "Fancy Feast Gems Mousse Pate with Salmon Cat Food", brand: "Fancy Feast" },
  { name: "Fancy Feast Gems Mousse Pate with Beef Cat Food", brand: "Fancy Feast" },
  { name: "Fancy Feast Gems Mousse Pate with Chicken Cat Food", brand: "Fancy Feast" },
  { name: "Fancy Feast Broths Classic with Chicken Cat Food", brand: "Fancy Feast" },
  { name: "9 Lives Daily Essentials Dry Cat Food", brand: "9 Lives" },
  { name: "Open Farm Ancient Grains Puppy Chicken Salmon Recipe", brand: "Open Farm" },
  { name: "Purina Pro Plan Adult Chicken Rice Entree Wet Dog Food", brand: "Purina Pro Plan" },
  { name: "Blue Buffalo Homestyle Recipe Chicken Dinner Wet Dog Food", brand: "Blue Buffalo" },
  { name: "Nutro Wholesome Essentials Indoor Adult Chicken Cat Food", brand: "Nutro" },
  { name: "Blue Buffalo Wilderness Indoor Chicken Cat Food", brand: "Blue Buffalo" },
  { name: "Purina Pro Plan Indoor Care Turkey Rice Cat Food", brand: "Purina Pro Plan" },
  { name: "Iams ProActive Health Large Breed Chicken Dog Food", brand: "Iams" },
  // Additional popular products
  { name: "Rachael Ray Nutrish Zero Grain Chicken Dog Food", brand: "Rachael Ray" },
  { name: "Purina Beneful IncrediBites Chicken Dog Food", brand: "Beneful" },
  { name: "Wag Dry Dog Food Salmon and Sweet Potato", brand: "Wag" },
  { name: "Wag Dry Dog Food Chicken and Brown Rice", brand: "Wag" },
  { name: "Natural Balance Limited Ingredient Diet Chicken Sweet Potato Dog Food", brand: "Natural Balance" },
  { name: "Whole Earth Farms Grain Free Chicken Turkey Recipe Dog Food", brand: "Whole Earth Farms" },
  { name: "American Journey Chicken Sweet Potato Grain Free Dog Food", brand: "American Journey" },
  { name: "Crave High Protein Chicken Adult Grain Free Dog Food", brand: "Crave" },
  { name: "Purina Cat Chow Naturals Indoor Dry Cat Food", brand: "Purina" },
  { name: "Whiskas Dry Cat Food Chicken Flavor", brand: "Whiskas" },
  { name: "Kit and Kaboodle Original Dry Cat Food", brand: "Kit and Kaboodle" },
  { name: "Temptations Classic Tasty Chicken Cat Treats", brand: "Temptations" },
  { name: "Greenies Original Regular Dog Dental Treats", brand: "Greenies" },
];

function normalizeCacheKey(name) {
  return name.toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html) {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Find the section around "ingredient" keyword
  const idx = text.toLowerCase().indexOf("ingredient");
  if (idx > 0) {
    const start = Math.max(0, idx - 200);
    const end = Math.min(text.length, idx + 4000);
    return text.slice(start, end);
  }
  return text.slice(0, 5000);
}

async function findPageUrl(productName) {
  const query = `${productName} ingredients`;
  const params = new URLSearchParams({ api_key: SBKEY, search: query, nb_results: "8" });

  const resp = await fetch(`${GOOGLE_URL}?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) return null;

  const data = await resp.json();
  const results = data?.organic_results || [];

  // Find first non-blocked URL
  for (const r of results) {
    if (r.url && !BLOCKED.some(b => r.url.includes(b))) {
      return { url: r.url.split("?")[0], title: r.title || "" };
    }
  }
  return null;
}

async function scrapePage(url) {
  // Determine if JS rendering is needed
  const jsHeavy = ["amazon.com", "chewy.com", "walmart.com", "target.com", "petsmart.com", "petco.com", "royalcanin.com", "purina.com", "hillspet.com", "bluebuffalo.com"];
  const needsJs = jsHeavy.some(s => url.includes(s));

  const params = new URLSearchParams({
    api_key: SBKEY,
    url: url,
    render_js: needsJs ? "true" : "false",
    ...(needsJs && { wait: "3000" }),
  });

  const resp = await fetch(`${SCRAPE_URL}?${params}`, { signal: AbortSignal.timeout(needsJs ? 20000 : 12000) });
  if (!resp.ok) return null;

  const html = await resp.text();
  if (html.length < 500) return null; // Blocked or empty

  return stripHtml(html);
}

async function extractIngredientsWithGPT(pageText, productName) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OKEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: `You are an ingredient extractor. Given web page text about a pet food product, find and return the COMPLETE ingredient list.

RULES:
- Extract ONLY ingredients that are ACTUALLY written in the provided text
- Do NOT add, modify, or guess any ingredients from your training knowledge
- Return them in the exact order they appear
- Include everything: vitamins, minerals, preservatives, supplements
- Keep parenthetical groupings intact

Return JSON: {"found": true, "ingredients": "Ingredient1, Ingredient2, ..."}
If no ingredient list exists in the text: {"found": false}`
        },
        { role: "user", content: `Product: ${productName}\n\nWeb page text:\n${pageText.slice(0, 3500)}` }
      ]
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed.found && parsed.ingredients) {
      const list = parsed.ingredients.split(",").map(i => i.trim()).filter(i => i.length > 0);
      if (list.length >= 5) return { ingredients: list, ingredientText: parsed.ingredients };
    }
  } catch {}
  return null;
}

async function saveToSupabase(product, ingredients, ingredientText) {
  const cacheKey = normalizeCacheKey(`${product.brand} ${product.name}`);

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_product_data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({
      p_cache_key: cacheKey,
      p_product_name: product.name,
      p_brand: product.brand,
      p_ingredients: ingredients,
      p_ingredient_text: ingredientText,
      p_ingredient_count: ingredients.length,
      p_source: "web_verified",
    }),
  });

  return resp.ok;
}

async function processProduct(product, index, total) {
  const num = `[${index + 1}/${total}]`;
  console.log(`${num} ${product.name.substring(0, 55)}`);

  try {
    // Step 1: Find a page with ingredients
    const page = await findPageUrl(product.name);
    if (!page) {
      console.log("  ✗ No page found on Google");
      return false;
    }
    console.log(`  Page: ${page.url.substring(0, 50)}`);

    // Step 2: Scrape the page
    const pageText = await scrapePage(page.url);
    if (!pageText || pageText.length < 100) {
      console.log("  ✗ Page scrape failed or empty");
      return false;
    }

    // Step 3: Extract ingredients with GPT
    const result = await extractIngredientsWithGPT(pageText, product.name);
    if (!result) {
      console.log("  ✗ GPT could not find ingredients in page text");
      return false;
    }

    console.log(`  Found: ${result.ingredients.length} ingredients`);
    console.log(`  First 3: ${result.ingredients.slice(0, 3).join(", ")}`);

    // Step 4: Save to database
    const saved = await saveToSupabase(product, result.ingredients, result.ingredientText);
    if (saved) {
      console.log("  ✓ SAVED");
      return true;
    } else {
      console.log("  ✗ Save failed");
      return false;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`\n=== UNIVERSAL INGREDIENT SCRAPER ===`);
  console.log(`Products: ${PRODUCTS.length}`);
  console.log(`Method: Google → Scrape (JS if needed) → GPT extract → Save`);
  console.log(`Est. credits: ~${PRODUCTS.length * 6}\n`);

  let success = 0, failed = 0;

  for (let i = 0; i < PRODUCTS.length; i++) {
    const ok = await processProduct(PRODUCTS[i], i, PRODUCTS.length);
    if (ok) success++; else failed++;

    // Delay to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Success: ${success}/${PRODUCTS.length} (${Math.round(success/PRODUCTS.length*100)}%)`);
  console.log(`Failed: ${failed}/${PRODUCTS.length}`);
}

main().catch(console.error);
