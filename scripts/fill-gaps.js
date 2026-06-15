/**
 * Fill gaps in the product database.
 *
 * Targets:
 * 1. Products with <20 ingredients (clearly incomplete for kibble/dry food)
 * 2. Products missing from the DB entirely
 *
 * Strategy: Google → scrape (JS if needed) → GPT-4o-mini extract from text → save
 * Same pipeline as build-database.js but with corrected threshold.
 *
 * Run: node scripts/fill-gaps.js
 */

const SBKEY = process.env.SBKEY;
const OKEY = process.env.OKEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const BLOCKED = new Set(["amazon.com", "chewy.com", "walmart.com", "target.com", "petsmart.com", "petco.com", "google.com", "youtube.com", "facebook.com", "reddit.com", "instagram.com", "tiktok.com", "pinterest.com", "twitter.com", "x.com"]);
const JS_HEAVY = new Set(["royalcanin.com", "purina.com", "hillspet.com", "bluebuffalo.com", "iams.com", "nutro.com", "pedigree.com"]);

// Minimum ingredient count to consider a product "complete"
// Dry kibble: 30-70 ingredients, wet food: 15-35, treats: 8-25
// Using 20 as universal threshold — anything below is almost certainly incomplete
const MIN_COMPLETE = 20;

// ── Products to fill ──────────────────────────────────────────
// Includes: all products from build-database.js master list + additional popular products
const PRODUCTS = [
  // ═══ INCOMPLETE IN DB (< 20 ingredients) — need re-scraping ═══
  "Acana Red Meat Recipe Grain Free",
  "Acana Wholesome Grains Free Run Poultry",
  "Diamond Naturals Adult Chicken and Rice",
  "Friskies Surfin Turfin Favorites Dry Cat Food",
  "Fromm Gold Adult Dry Dog Food",
  "Hills Science Diet Adult Chicken Barley Entree Canned",
  "Iams ProActive Health Indoor Weight Hairball Care Cat Food",
  "Nutro Ultra Adult Dry Dog Food",
  "Nutro Wholesome Essentials Adult Chicken Brown Rice",
  "Nutro Wholesome Essentials Indoor Adult Chicken Cat Food",
  "Orijen Cat and Kitten Grain Free Dry Cat Food",
  "Orijen Original Grain Free Dry Dog Food",
  "Orijen Puppy Grain Free Dry Dog Food",
  "Orijen Six Fish Grain Free Dry Dog Food",
  "Pedigree Complete Nutrition Puppy Chicken",
  "Purina ONE Tender Selects Chicken Cat Food",
  "Rachael Ray Nutrish Real Chicken and Veggies",
  "Rachael Ray Nutrish Zero Grain Chicken",
  "Taste of the Wild High Prairie Grain Free",
  "Victor Hi-Pro Plus Formula",
  "Victor Purpose Nutra Pro",
  "Fancy Feast Broths Classic Chicken",
  "Rachael Ray Nutrish Indoor Complete Chicken Lentils Cat Food",
  "Pedigree Complete Nutrition Adult Chicken",
  // ═══ MISSING FROM DB — never scraped ═══
  "Blue Buffalo Wilderness Adult Chicken Cat Food",
  "Purina ONE SmartBlend Chicken and Rice",
  "Purina Dog Chow Complete Adult Lamb",
  "Beneful Healthy Weight Chicken",
  "Fancy Feast Gems Mousse Pate Chicken",
  "Fancy Feast Gravy Lovers Chicken Feast",
  "Sheba Perfect Portions Pate Chicken",
  "Friskies Shreds Chicken Gravy Cat Food",
  "Blue Buffalo Blue Bits Chicken Dog Treats",
  "Greenies Original Large Dog Dental Treats",
  "Milk Bone Original Dog Biscuits",
  "Zuke Mini Naturals Chicken Dog Treats",
  "Temptations Classic Tasty Chicken Cat Treats",
  "Temptations Classic Seafood Medley Cat Treats",
  "Greenies Feline Chicken Cat Dental Treats",
  "Crave High Protein Chicken Grain Free Dog Food",
  "Wag Dry Dog Food Salmon Sweet Potato",
  "Wag Dry Dog Food Chicken Brown Rice",
  "Natural Balance Limited Ingredient Chicken Sweet Potato",
  "American Journey Chicken Sweet Potato Grain Free Dog Food",
  "Nulo Freestyle Grain Free Turkey Sweet Potato Dog Food",
  "Stella and Chewy Freeze Dried Raw Chicken Dinner Patties",
  "Farmers Dog Fresh Turkey Recipe",
  "Ollie Fresh Chicken Recipe Dog Food",
  "Just Food For Dogs Chicken and White Rice",
  "Spot and Tango Unkibble Beef and Barley Dog Food",
  "Open Farm Gently Cooked Grass Fed Beef Dog Food",
  "Open Farm Meat Balls Harvest Chicken Recipe",
  // ═══ ADDITIONAL POPULAR PRODUCTS (from prepopulate list, not in DB) ═══
  "Purina Pro Plan Large Breed Adult Chicken Rice",
  "Purina Pro Plan Small Breed Adult Chicken Rice",
  "Purina Pro Plan Senior 7 Plus Chicken Rice",
  "Purina Pro Plan Weight Management Chicken Rice",
  "Blue Buffalo Life Protection Formula Lamb and Brown Rice",
  "Blue Buffalo Life Protection Formula Fish and Brown Rice",
  "Blue Buffalo Wilderness Salmon Recipe Dog Food",
  "Blue Buffalo Basics Turkey and Potato Dog Food",
  "Blue Buffalo Tastefuls Indoor Chicken Cat Food",
  "Blue Buffalo Life Protection Formula Kitten Chicken",
  "Royal Canin Medium Puppy Dry Dog Food",
  "Royal Canin Large Breed Puppy Dry Dog Food",
  "Royal Canin Small Breed Puppy Dry Dog Food",
  "Royal Canin Labrador Retriever Adult Dry Dog Food",
  "Royal Canin Digestive Care Cat Food",
  "Royal Canin Urinary Care Cat Food",
  "Royal Canin Aging 12 Plus Senior Cat Food",
  "Hills Science Diet Sensitive Stomach Skin Chicken Dog Food",
  "Hills Science Diet Perfect Weight Chicken Dog Food",
  "Hills Science Diet Senior 7 Plus Chicken Dog Food",
  "Hills Science Diet Small Breed Adult Chicken Dog Food",
  "Hills Science Diet Kitten Chicken Recipe Cat Food",
  "Hills Science Diet Sensitive Stomach Skin Cat Food",
  "Iams ProActive Health Smart Puppy Dog Food",
  "Iams ProActive Health Healthy Weight Dog Food",
  "Iams ProActive Health Kitten Chicken Cat Food",
  "Pedigree High Protein Beef and Lamb Dog Food",
  "Pedigree Puppy Growth Protection Chicken Dog Food",
  "Taste of the Wild Sierra Mountain Lamb Dog Food",
  "Taste of the Wild Ancient Prairie Puppy Dog Food",
  "Taste of the Wild Canyon River Trout Cat Food",
  "Taste of the Wild Rocky Mountain Venison Cat Food",
  "Merrick Grain Free Real Chicken Sweet Potato Dog Food",
  "Wellness Complete Health Puppy Deboned Chicken Dog Food",
  "Wellness Complete Health Small Breed Turkey Oatmeal Dog Food",
  "Nutro Wholesome Essentials Puppy Chicken Dog Food",
  "Nutro Wholesome Essentials Large Breed Chicken Dog Food",
  "Canidae All Life Stages Multi Protein Dog Food",
  "Nulo Freestyle Adult Salmon Peas Dog Food",
  "Meow Mix Tender Centers Salmon Chicken Cat Food",
  "Meow Mix Indoor Health Dry Cat Food",
  "Friskies Indoor Delights Dry Cat Food",
  "Purina Pro Plan Kitten Chicken Rice Cat Food",
  "Purina Pro Plan Sensitive Skin Stomach Cat Lamb Rice",
  "Purina ONE Healthy Kitten Formula Cat Food",
  "Purina Beggin Strips Bacon Flavor Dog Treats",
  "Old Mother Hubbard Classic Biscuits Dog Treats",
  "Delectables Squeeze Up Chicken Cat Treats",
  "Inaba Churu Chicken Recipe Cat Treats",
  "Cesar Classic Loaf Grilled Chicken Dog Food",
  "Pedigree Chopped Ground Dinner Chicken Canned Dog Food",
  "Rachael Ray Nutrish Real Beef Pea Brown Rice Dog Food",
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
  const brands = [
    "Blue Buffalo", "Purina Pro Plan", "Purina ONE", "Purina", "Taste of the Wild",
    "Orijen", "Acana", "Hills Science Diet", "Royal Canin", "Iams",
    "Kirkland", "Diamond Naturals", "Victor", "Rachael Ray Nutrish", "Rachael Ray",
    "Merrick", "Nutro", "Canidae", "Wellness", "Fromm", "Instinct",
    "The Honest Kitchen", "Open Farm", "Pedigree", "Ol Roy", "Kibbles n Bits",
    "Beneful", "Gravy Train", "Cesar", "Meow Mix", "Friskies", "9 Lives",
    "Kit and Kaboodle", "Fancy Feast", "Sheba", "Tiki Cat", "Greenies",
    "Milk Bone", "Zuke", "Temptations", "Crave", "Wag", "Natural Balance",
    "Whole Earth Farms", "American Journey", "Nulo", "Stella and Chewy",
    "Farmers Dog", "Ollie", "Just Food For Dogs", "Spot and Tango",
    "Old Mother Hubbard", "Delectables", "Inaba", "Whiskas",
  ];
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
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  const idx = text.toLowerCase().indexOf("ingredient");
  if (idx >= 0) {
    return text.slice(Math.max(0, idx - 500), Math.min(text.length, idx + 5000));
  }
  return text.slice(0, 6000);
}

async function googleSearch(query) {
  const params = new URLSearchParams({ api_key: SBKEY, search: query, nb_results: "10" });
  const r = await fetch(`https://app.scrapingbee.com/api/v1/store/google?${params}`, { signal: AbortSignal.timeout(15000) });
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
  const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, { signal: AbortSignal.timeout(needsJs ? 25000 : 15000) });
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
      model: "gpt-4o-mini", temperature: 0, max_tokens: 1500,
      messages: [
        {
          role: "system",
          content: `Extract the COMPLETE ingredient list from this web page text about a pet food product.

RULES:
- Extract ONLY ingredients that are ACTUALLY written in the provided text
- Do NOT add, modify, or guess any ingredients from your training knowledge
- Return them in the exact order they appear on the label
- Include EVERYTHING: vitamins, minerals, preservatives, supplements, amino acid chelates
- Keep parenthetical groupings intact (e.g. "Vitamin E Supplement (Mixed Tocopherols)")
- The ingredient list usually starts with a protein (chicken, beef, salmon, turkey, etc.) or grain

Return JSON: {"found": true, "ingredients": "Ingredient1, Ingredient2, ..."}
If no ingredient list exists in the text: {"found": false}`
        },
        { role: "user", content: `Product: ${productName}\n\nWeb page text:\n${pageText.slice(0, 4000)}` }
      ]
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return null;
  const d = await r.json();
  try {
    const p = JSON.parse(d.choices[0].message.content);
    if (p.found && p.ingredients) {
      const list = p.ingredients.split(",").map(i => i.trim()).filter(i => i.length > 0 && i.length < 200);
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

async function getDbStatus(name, brand) {
  const key = normKey(brand, name);
  const r = await fetch(`${SB_URL}/rest/v1/product_data?cache_key=eq.${encodeURIComponent(key)}&select=ingredient_count`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) return { exists: false, count: 0 };
  const d = await r.json();
  if (d.length > 0) return { exists: true, count: d[0].ingredient_count };
  return { exists: false, count: 0 };
}

async function processProduct(name, idx, total) {
  const brand = extractBrand(name);
  const pad = name.substring(0, 55).padEnd(55);
  process.stdout.write(`[${String(idx+1).padStart(3)}/${total}] ${pad} `);

  // Check DB status
  const db = await getDbStatus(name, brand);
  if (db.exists && db.count >= MIN_COMPLETE) {
    console.log(`SKIP (${db.count} ingredients)`);
    return "skip";
  }

  const label = db.exists ? `UPDATE (${db.count}→?)` : "NEW";

  // Google search — try quoted and unquoted
  let urls = await googleSearch(`"${name}" ingredients list`);
  if (urls.length < 2) {
    const more = await googleSearch(`${name} ingredients`);
    urls = [...new Set([...urls, ...more])];
  }

  if (urls.length === 0) {
    console.log(`✗ ${label} no Google results`);
    return "fail";
  }

  // Try up to 5 pages
  for (let i = 0; i < Math.min(urls.length, 5); i++) {
    try {
      const text = await scrapePage(urls[i]);
      if (!text || text.length < 100) continue;

      const result = await gptExtract(text, name);
      if (result && result.list.length >= 5) {
        // Only save if it's actually better than what's in the DB
        if (db.exists && result.list.length <= db.count) {
          console.log(`SKIP ${label} (scraped ${result.list.length} ≤ existing ${db.count})`);
          return "skip";
        }
        const ok = await save(name, brand, result.list, result.text);
        if (ok) {
          const domain = new URL(urls[i]).hostname.replace("www.", "");
          console.log(`✓ ${label} ${result.list.length} ingredients (${domain})`);
          return "ok";
        }
      }
    } catch {}
  }

  console.log(`✗ ${label} not found in ${Math.min(urls.length, 5)} pages`);
  return "fail";
}

async function main() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  FILLING PRODUCT DATABASE GAPS`);
  console.log(`══════════════════════════════════════════════════`);
  console.log(`Products to check: ${PRODUCTS.length}`);
  console.log(`Min complete threshold: ${MIN_COMPLETE} ingredients`);
  console.log(`Strategy: Google → scrape → GPT extract from text`);
  console.log(`══════════════════════════════════════════════════\n`);

  let ok = 0, fail = 0, skip = 0;
  const failures = [];

  const START = parseInt(process.env.START || "0", 10);
  for (let i = START; i < PRODUCTS.length; i++) {
    const result = await processProduct(PRODUCTS[i], i, PRODUCTS.length);
    if (result === "ok") ok++;
    else if (result === "skip") skip++;
    else { fail++; failures.push(PRODUCTS[i]); }

    // 2s delay between products
    if (i < PRODUCTS.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  RESULTS`);
  console.log(`══════════════════════════════════════════════════`);
  console.log(`New/Updated: ${ok}`);
  console.log(`Skipped:     ${skip} (already complete)`);
  console.log(`Failed:      ${fail}`);
  console.log(`Total:       ${PRODUCTS.length}`);

  if (failures.length > 0) {
    console.log(`\nFailed products (${failures.length}):`);
    failures.forEach(f => console.log(`  - ${f}`));
  }
}

main().catch(console.error);
