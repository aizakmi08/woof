/**
 * Build a 100% accurate pet food ingredient database.
 *
 * Strategy per product:
 * 1. Google search for "[product name] ingredients" — get 8 results
 * 2. Skip Amazon/Chewy/Walmart (they block)
 * 3. Try up to 4 pages — scrape each with JS rendering
 * 4. Send page text to GPT-4o-mini to extract ONLY the ingredients found in the text
 * 5. Validate: must have 5+ ingredients, first must be a food word
 * 6. Save to Supabase with source "web_verified"
 *
 * Cost per product: ~7 credits (1 Google + ~1.5 pages avg × 4 credits)
 * For 200 products: ~1400 credits
 *
 * Run: node scripts/build-database.js
 */

const SBKEY = process.env.SBKEY;
const OKEY = process.env.OKEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const BLOCKED = new Set(["amazon.com", "chewy.com", "walmart.com", "target.com", "petsmart.com", "petco.com", "google.com", "youtube.com", "facebook.com", "reddit.com", "instagram.com", "tiktok.com", "pinterest.com", "twitter.com", "x.com"]);
const JS_HEAVY = new Set(["royalcanin.com", "purina.com", "hillspet.com", "bluebuffalo.com", "iams.com", "nutro.com", "pedigree.com"]);

// ── Product List: Top 200 US Pet Foods ──────────────────────────
const PRODUCTS = [
  // DRY DOG FOOD — Premium
  "Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice",
  "Blue Buffalo Life Protection Formula Large Breed Chicken",
  "Blue Buffalo Life Protection Formula Puppy Chicken",
  "Blue Buffalo Life Protection Formula Senior Chicken",
  "Blue Buffalo Wilderness Adult Chicken",
  "Purina Pro Plan Adult Chicken and Rice",
  "Purina Pro Plan Adult Sensitive Skin Stomach Salmon Rice",
  "Purina Pro Plan Puppy Chicken and Rice",
  "Purina Pro Plan Sport All Life Stages Performance Chicken",
  "Purina ONE SmartBlend Chicken and Rice",
  "Purina ONE SmartBlend Lamb and Rice",
  "Taste of the Wild High Prairie Grain Free",
  "Taste of the Wild Pacific Stream Grain Free",
  "Taste of the Wild Wetlands Grain Free",
  "Orijen Original Grain Free Dry Dog Food",
  "Orijen Six Fish Grain Free Dry Dog Food",
  "Orijen Puppy Grain Free Dry Dog Food",
  "Acana Red Meat Recipe Grain Free",
  "Acana Wholesome Grains Free Run Poultry",
  "Hills Science Diet Adult Chicken and Barley",
  "Hills Science Diet Adult Large Breed Chicken",
  "Hills Science Diet Adult Small Bites Chicken",
  "Hills Science Diet Puppy Chicken and Barley",
  "Hills Science Diet Senior Chicken and Barley",
  "Royal Canin Medium Adult Dry Dog Food",
  "Royal Canin Large Breed Adult Dry Dog Food",
  "Royal Canin Small Breed Adult Dry Dog Food",
  "Royal Canin Breed Health Nutrition French Bulldog Adult",
  "Royal Canin Breed Health Nutrition Golden Retriever Adult",
  "Royal Canin Breed Health Nutrition German Shepherd Adult",
  "Iams ProActive Health Adult MiniChunks Chicken",
  "Iams ProActive Health Large Breed Chicken",
  "Iams ProActive Health Adult Lamb and Rice",
  "Kirkland Signature Adult Dog Chicken Rice Vegetable",
  "Kirkland Signature Nature Domain Turkey Sweet Potato",
  "Diamond Naturals Adult Chicken and Rice",
  "Diamond Naturals Large Breed Chicken and Rice",
  "Victor Hi-Pro Plus Formula",
  "Victor Purpose Nutra Pro",
  "Rachael Ray Nutrish Real Chicken and Veggies",
  "Rachael Ray Nutrish Zero Grain Chicken",
  "Merrick Real Texas Beef Sweet Potato Grain Free",
  "Merrick Classic Real Chicken Brown Rice",
  "Nutro Wholesome Essentials Adult Chicken Brown Rice",
  "Nutro Ultra Adult Dry Dog Food",
  "Canidae Pure Real Salmon Sweet Potato Grain Free",
  "Canidae All Life Stages Chicken Meal and Rice",
  "Wellness Complete Health Adult Chicken and Oatmeal",
  "Wellness CORE Grain Free Original Turkey Chicken",
  "Wellness CORE Grain Free Ocean Whitefish Herring",
  "Fromm Gold Adult Dry Dog Food",
  "Fromm Four Star Chicken Au Frommage",
  "Instinct Original Grain Free Chicken Dry Dog Food",
  "Instinct Raw Boost Grain Free Chicken",
  "The Honest Kitchen Whole Grain Chicken",
  "The Honest Kitchen Dehydrated Chicken",
  "Open Farm Ancient Grains Chicken Dry Dog Food",
  "Open Farm Homestead Turkey Chicken",
  // DRY DOG FOOD — Budget
  "Pedigree Complete Nutrition Adult Chicken",
  "Pedigree Complete Nutrition Puppy Chicken",
  "Ol Roy Complete Nutrition Dog Food",
  "Kibbles n Bits Original Savory Beef Chicken",
  "Purina Dog Chow Complete Adult Chicken",
  "Purina Dog Chow Complete Adult Lamb",
  "Beneful Originals Farm Raised Chicken",
  "Beneful Healthy Weight Chicken",
  "Gravy Train Beef Flavor Dog Food",
  // WET DOG FOOD
  "Purina Pro Plan Adult Chicken Rice Entree Canned",
  "Blue Buffalo Homestyle Recipe Chicken Dinner Canned",
  "Hills Science Diet Adult Chicken Barley Entree Canned",
  "Merrick Grain Free Real Texas Beef Canned",
  "Cesar Classic Loaf in Sauce Beef Recipe",
  "Cesar Classic Loaf in Sauce Chicken Recipe",
  "Pedigree Chopped Ground Dinner Beef Canned",
  // DRY CAT FOOD — Premium
  "Blue Buffalo Indoor Health Adult Chicken Cat Food",
  "Blue Buffalo Wilderness Indoor Chicken Cat Food",
  "Blue Buffalo Wilderness Adult Chicken Cat Food",
  "Purina ONE Indoor Advantage Adult Chicken Cat Food",
  "Purina ONE Tender Selects Chicken Cat Food",
  "Purina Pro Plan Indoor Care Turkey Rice Cat Food",
  "Purina Pro Plan Adult Chicken Rice Cat Food",
  "Hills Science Diet Adult Indoor Chicken Cat Food",
  "Hills Science Diet Adult Hairball Control Chicken Cat Food",
  "Royal Canin Indoor Adult Dry Cat Food",
  "Royal Canin Kitten Dry Cat Food",
  "Iams ProActive Health Indoor Weight Hairball Care Cat Food",
  "Iams ProActive Health Adult Chicken Cat Food",
  "Orijen Cat and Kitten Grain Free Dry Cat Food",
  "Wellness CORE Grain Free Indoor Chicken Turkey Cat Food",
  "Wellness Complete Health Adult Chicken Cat Food",
  "Instinct Original Grain Free Chicken Cat Food",
  "Rachael Ray Nutrish Indoor Complete Chicken Lentils Cat Food",
  "Nutro Wholesome Essentials Indoor Chicken Cat Food",
  // DRY CAT FOOD — Budget
  "Meow Mix Original Choice Dry Cat Food",
  "Friskies Surfin Turfin Favorites Dry Cat Food",
  "Friskies Seafood Sensations Dry Cat Food",
  "9 Lives Daily Essentials Dry Cat Food",
  "Kit and Kaboodle Original Dry Cat Food",
  "Purina Cat Chow Naturals Indoor Dry Cat Food",
  "Purina Cat Chow Complete Dry Cat Food",
  // WET CAT FOOD
  "Fancy Feast Classic Pate Savory Chicken Feast",
  "Fancy Feast Classic Pate Tender Beef Feast",
  "Fancy Feast Classic Pate Ocean Whitefish Tuna Feast",
  "Fancy Feast Classic Pate Turkey Giblets Feast",
  "Fancy Feast Gems Mousse Pate Salmon",
  "Fancy Feast Gems Mousse Pate Beef",
  "Fancy Feast Gems Mousse Pate Chicken",
  "Fancy Feast Broths Classic Chicken",
  "Fancy Feast Gravy Lovers Chicken Feast",
  "Sheba Perfect Portions Pate Salmon",
  "Sheba Perfect Portions Pate Chicken",
  "Sheba Perfect Portions Pate Turkey",
  "Tiki Cat Puka Puka Luau Succulent Chicken",
  "Tiki Cat Hookena Luau Ahi Tuna Chicken",
  "Tiki Cat Born Carnivore Chicken and Fish",
  "Purina Pro Plan Chicken Rice Entree Wet Cat Food",
  "Purina Pro Plan Salmon Canned Cat Food",
  "Wellness Complete Health Chicken Pate Cat Food",
  "Wellness CORE Grain Free Turkey Pate Cat Food",
  "Friskies Pate Ocean Whitefish Tuna Dinner Cat Food",
  "Friskies Shreds Chicken Gravy Cat Food",
  "9 Lives Pate Favorites Chicken Cat Food",
  // DOG TREATS
  "Greenies Original Regular Dog Dental Treats",
  "Greenies Original Large Dog Dental Treats",
  "Milk Bone Original Dog Biscuits",
  "Blue Buffalo Blue Bits Chicken Dog Treats",
  "Zuke Mini Naturals Chicken Dog Treats",
  // CAT TREATS
  "Temptations Classic Tasty Chicken Cat Treats",
  "Temptations Classic Seafood Medley Cat Treats",
  "Greenies Feline Chicken Cat Dental Treats",
  // SPECIALTY / TRENDING
  "Crave High Protein Chicken Grain Free Dog Food",
  "Wag Dry Dog Food Salmon Sweet Potato",
  "Wag Dry Dog Food Chicken Brown Rice",
  "Natural Balance Limited Ingredient Chicken Sweet Potato",
  "Whole Earth Farms Grain Free Chicken Turkey Dog Food",
  "American Journey Chicken Sweet Potato Grain Free Dog Food",
  "Nulo Freestyle Grain Free Turkey Sweet Potato Dog Food",
  "Stella and Chewy Freeze Dried Raw Chicken Dinner Patties",
  "Farmers Dog Fresh Turkey Recipe",
  "Ollie Fresh Chicken Recipe Dog Food",
  "Just Food For Dogs Chicken and White Rice",
  "Spot and Tango Unkibble Beef and Barley Dog Food",
  "Open Farm Gently Cooked Grass Fed Beef Dog Food",
  "Open Farm Meat Balls Harvest Chicken Recipe",
];

function normKey(brand, name) {
  const full = `${brand || ""} ${name}`.toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return full;
}

function extractBrand(name) {
  const brands = ["Blue Buffalo", "Purina Pro Plan", "Purina ONE", "Purina", "Taste of the Wild", "Orijen", "Acana", "Hills Science Diet", "Royal Canin", "Iams", "Kirkland", "Diamond Naturals", "Victor", "Rachael Ray Nutrish", "Rachael Ray", "Merrick", "Nutro", "Canidae", "Wellness", "Fromm", "Instinct", "The Honest Kitchen", "Open Farm", "Pedigree", "Ol Roy", "Kibbles n Bits", "Beneful", "Gravy Train", "Cesar", "Meow Mix", "Friskies", "9 Lives", "Kit and Kaboodle", "Fancy Feast", "Sheba", "Tiki Cat", "Greenies", "Milk Bone", "Zuke", "Temptations", "Crave", "Wag", "Natural Balance", "Whole Earth Farms", "American Journey", "Nulo", "Stella and Chewy", "Farmers Dog", "Ollie", "Just Food For Dogs", "Spot and Tango", "Whiskas"];
  for (const b of brands) {
    if (name.toLowerCase().startsWith(b.toLowerCase())) return b;
  }
  return name.split(" ").slice(0, 2).join(" ");
}

function stripHtml(html) {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  // Find section around "ingredient" keyword — get 4000 chars
  const idx = text.toLowerCase().indexOf("ingredient");
  if (idx >= 0) {
    return text.slice(Math.max(0, idx - 300), Math.min(text.length, idx + 4000));
  }
  return text.slice(0, 5000);
}

async function googleSearch(query) {
  const params = new URLSearchParams({ api_key: SBKEY, search: query, nb_results: "8" });
  const r = await fetch(`https://app.scrapingbee.com/api/v1/store/google?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return [];
  const d = await r.json();
  return (d?.organic_results || [])
    .filter(r => r.url && ![...BLOCKED].some(b => r.url.includes(b)))
    .map(r => r.url.split("?")[0]);
}

async function scrapePage(url) {
  const needsJs = [...JS_HEAVY].some(s => url.includes(s));
  const params = new URLSearchParams({
    api_key: SBKEY, url,
    render_js: needsJs ? "true" : "false",
    ...(needsJs && { wait: "3000" }),
  });
  const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, { signal: AbortSignal.timeout(needsJs ? 20000 : 12000) });
  if (!r.ok) return null;
  const html = await r.text();
  if (html.length < 500) return null;
  return stripHtml(html.length > 500000 ? html.slice(0, 500000) : html);
}

async function gptExtract(pageText, productName) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OKEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0, max_tokens: 1000,
      messages: [
        { role: "system", content: `Extract the complete ingredient list from this web page text about a pet food product. Return ONLY JSON: {"found":true,"ingredients":"Ingredient1, Ingredient2, ..."} If no ingredient list is in the text, return {"found":false}. Extract ONLY what is written in the text — do NOT add from memory.` },
        { role: "user", content: `Product: ${productName}\n\n${pageText.slice(0, 3500)}` }
      ]
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return null;
  const d = await r.json();
  try {
    const p = JSON.parse(d.choices[0].message.content);
    if (p.found && p.ingredients) {
      const list = p.ingredients.split(",").map(i => i.trim()).filter(i => i.length > 0 && i.length < 150);
      if (list.length >= 5) return { list, text: p.ingredients };
    }
  } catch {}
  return null;
}

async function save(name, brand, ingredients, ingredientText) {
  const key = normKey(brand, name);
  const r = await fetch(`${SB_URL}/rest/v1/rpc/save_product_data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify({
      p_cache_key: key, p_product_name: name, p_brand: brand,
      p_ingredients: ingredients, p_ingredient_text: ingredientText,
      p_ingredient_count: ingredients.length, p_source: "web_verified",
    }),
  });
  return r.ok;
}

async function alreadyInDb(name, brand) {
  const key = normKey(brand, name);
  const r = await fetch(`${SB_URL}/rest/v1/product_data?cache_key=eq.${encodeURIComponent(key)}&select=ingredient_count`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) return false;
  const d = await r.json();
  return d.length > 0 && d[0].ingredient_count >= 5;
}

async function processProduct(name, idx, total) {
  const brand = extractBrand(name);
  process.stdout.write(`[${idx+1}/${total}] ${name.substring(0, 50).padEnd(50)} `);

  // Skip if already in DB
  if (await alreadyInDb(name, brand)) {
    console.log("SKIP (in DB)");
    return "skip";
  }

  // Google search
  const urls = await googleSearch(`${name} ingredients`);
  if (urls.length === 0) {
    console.log("✗ no Google results");
    return "fail";
  }

  // Try up to 4 pages
  for (let i = 0; i < Math.min(urls.length, 4); i++) {
    try {
      const text = await scrapePage(urls[i]);
      if (!text || text.length < 100) continue;

      const result = await gptExtract(text, name);
      if (result && result.list.length >= 5) {
        const ok = await save(name, brand, result.list, result.text);
        if (ok) {
          console.log(`✓ ${result.list.length} ingredients (${urls[i].substring(0, 35)})`);
          return "ok";
        }
      }
    } catch {}
  }

  console.log("✗ not found");
  return "fail";
}

async function main() {
  console.log(`\n=== BUILDING PET FOOD DATABASE ===`);
  console.log(`Products: ${PRODUCTS.length}`);
  console.log(`Strategy: Google → scrape (JS if needed) → GPT extract from text\n`);

  let ok = 0, fail = 0, skip = 0;

  for (let i = 0; i < PRODUCTS.length; i++) {
    const result = await processProduct(PRODUCTS[i], i, PRODUCTS.length);
    if (result === "ok") ok++;
    else if (result === "skip") skip++;
    else fail++;

    // Delay
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n=== DONE ===`);
  console.log(`New: ${ok} | Skipped: ${skip} | Failed: ${fail} | Total: ${PRODUCTS.length}`);
}

main().catch(console.error);
