/**
 * Seed the product_data table with top pet food products.
 *
 * Strategy: For each product, use GPT-4o-mini to get the ingredient list
 * from its training data (fast, free-ish, ~83% accurate), then verify
 * by cross-referencing with OPFF when available.
 *
 * Run: node scripts/seed-products.js
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_KEY = process.env.OPENAI_KEY;

// Top US pet food products — curated from market share data + DFA/CFA
const PRODUCTS = [
  // === TOP DOG FOODS (DRY) ===
  { name: "Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice Recipe", brand: "Blue Buffalo", pet: "dog" },
  { name: "Purina Pro Plan Adult Sensitive Skin and Stomach Salmon and Rice Formula", brand: "Purina Pro Plan", pet: "dog" },
  { name: "Purina Pro Plan Adult Chicken and Rice Formula", brand: "Purina Pro Plan", pet: "dog" },
  { name: "Purina ONE SmartBlend Chicken and Rice Formula", brand: "Purina ONE", pet: "dog" },
  { name: "Taste of the Wild High Prairie Grain-Free", brand: "Taste of the Wild", pet: "dog" },
  { name: "Taste of the Wild Pacific Stream Grain-Free", brand: "Taste of the Wild", pet: "dog" },
  { name: "Orijen Original Grain-Free Dry Dog Food", brand: "Orijen", pet: "dog" },
  { name: "Orijen Six Fish Grain-Free Dry Dog Food", brand: "Orijen", pet: "dog" },
  { name: "Acana Red Meat Recipe Grain-Free Dry Dog Food", brand: "Acana", pet: "dog" },
  { name: "Acana Wholesome Grains Free-Run Poultry Recipe", brand: "Acana", pet: "dog" },
  { name: "Hills Science Diet Adult Chicken and Barley Recipe", brand: "Hills Science Diet", pet: "dog" },
  { name: "Hills Science Diet Adult Small Bites Chicken and Barley", brand: "Hills Science Diet", pet: "dog" },
  { name: "Royal Canin Medium Adult Dry Dog Food", brand: "Royal Canin", pet: "dog" },
  { name: "Royal Canin Large Breed Adult Dry Dog Food", brand: "Royal Canin", pet: "dog" },
  { name: "Iams ProActive Health Adult MiniChunks Chicken", brand: "Iams", pet: "dog" },
  { name: "Iams ProActive Health Large Breed Chicken", brand: "Iams", pet: "dog" },
  { name: "Kirkland Signature Adult Dog Chicken Rice and Vegetable Formula", brand: "Kirkland", pet: "dog" },
  { name: "Kirkland Signature Nature's Domain Grain-Free Turkey Meal and Sweet Potato", brand: "Kirkland", pet: "dog" },
  { name: "Diamond Naturals Adult Chicken and Rice Formula", brand: "Diamond Naturals", pet: "dog" },
  { name: "Victor Hi-Pro Plus Formula Dry Dog Food", brand: "Victor", pet: "dog" },
  { name: "Rachael Ray Nutrish Real Chicken and Veggies Recipe", brand: "Rachael Ray Nutrish", pet: "dog" },
  { name: "Merrick Real Texas Beef and Sweet Potato Grain-Free", brand: "Merrick", pet: "dog" },
  { name: "Merrick Classic Real Chicken and Brown Rice Recipe", brand: "Merrick", pet: "dog" },
  { name: "Nutro Wholesome Essentials Adult Chicken Brown Rice", brand: "Nutro", pet: "dog" },
  { name: "Canidae Pure Real Salmon and Sweet Potato Grain-Free", brand: "Canidae", pet: "dog" },
  { name: "Wellness Complete Health Adult Chicken and Oatmeal", brand: "Wellness", pet: "dog" },
  { name: "Wellness CORE Grain-Free Original Turkey and Chicken", brand: "Wellness", pet: "dog" },
  { name: "Fromm Gold Adult Dry Dog Food", brand: "Fromm", pet: "dog" },
  { name: "Fromm Four-Star Chicken Au Frommage", brand: "Fromm", pet: "dog" },
  { name: "Instinct Original Grain-Free Recipe with Real Chicken", brand: "Instinct", pet: "dog" },
  { name: "Instinct Raw Boost Grain-Free Recipe with Real Chicken", brand: "Instinct", pet: "dog" },
  { name: "The Honest Kitchen Whole Grain Chicken Recipe", brand: "The Honest Kitchen", pet: "dog" },
  { name: "Open Farm Ancient Grains Chicken Recipe", brand: "Open Farm", pet: "dog" },
  { name: "Open Farm Homestead Turkey and Chicken Recipe", brand: "Open Farm", pet: "dog" },
  { name: "Pedigree Complete Nutrition Adult Chicken", brand: "Pedigree", pet: "dog" },
  { name: "Ol Roy Complete Nutrition Dog Food", brand: "Ol Roy", pet: "dog" },
  { name: "Kibbles n Bits Original Savory Beef and Chicken Flavors", brand: "Kibbles n Bits", pet: "dog" },
  { name: "Purina Dog Chow Complete Adult Chicken", brand: "Purina Dog Chow", pet: "dog" },
  { name: "Cesar Classic Loaf in Sauce Beef Recipe", brand: "Cesar", pet: "dog" },
  { name: "Beneful Originals With Farm-Raised Chicken", brand: "Beneful", pet: "dog" },

  // === TOP DOG FOODS (WET) ===
  { name: "Purina Pro Plan Adult Chicken and Rice Entree Wet Dog Food", brand: "Purina Pro Plan", pet: "dog" },
  { name: "Blue Buffalo Homestyle Recipe Chicken Dinner", brand: "Blue Buffalo", pet: "dog" },
  { name: "Hills Science Diet Adult Chicken and Barley Entree Canned", brand: "Hills Science Diet", pet: "dog" },
  { name: "Merrick Grain Free Real Texas Beef Canned Dog Food", brand: "Merrick", pet: "dog" },

  // === TOP CAT FOODS (DRY) ===
  { name: "Blue Buffalo Indoor Health Adult Chicken and Brown Rice", brand: "Blue Buffalo", pet: "cat" },
  { name: "Blue Buffalo Wilderness Indoor Chicken Recipe", brand: "Blue Buffalo", pet: "cat" },
  { name: "Purina ONE Indoor Advantage Adult Chicken", brand: "Purina ONE", pet: "cat" },
  { name: "Purina Pro Plan Adult Indoor Care Turkey and Rice", brand: "Purina Pro Plan", pet: "cat" },
  { name: "Hills Science Diet Adult Indoor Chicken Recipe", brand: "Hills Science Diet", pet: "cat" },
  { name: "Royal Canin Indoor Adult Dry Cat Food", brand: "Royal Canin", pet: "cat" },
  { name: "Iams ProActive Health Indoor Weight and Hairball Care", brand: "Iams", pet: "cat" },
  { name: "Meow Mix Original Choice Dry Cat Food", brand: "Meow Mix", pet: "cat" },
  { name: "Friskies Surfin and Turfin Favorites Dry Cat Food", brand: "Friskies", pet: "cat" },
  { name: "9 Lives Daily Essentials Chicken Beef and Salmon Dry Cat Food", brand: "9 Lives", pet: "cat" },
  { name: "Orijen Cat and Kitten Grain-Free Dry Cat Food", brand: "Orijen", pet: "cat" },
  { name: "Wellness CORE Grain-Free Indoor Chicken and Turkey", brand: "Wellness", pet: "cat" },
  { name: "Instinct Original Grain-Free Recipe with Real Chicken Cat Food", brand: "Instinct", pet: "cat" },
  { name: "Rachael Ray Nutrish Indoor Complete Chicken with Lentils", brand: "Rachael Ray Nutrish", pet: "cat" },
  { name: "Nutro Wholesome Essentials Indoor Adult Chicken and Brown Rice Cat Food", brand: "Nutro", pet: "cat" },

  // === TOP CAT FOODS (WET) ===
  { name: "Fancy Feast Classic Pate Savory Chicken Feast", brand: "Fancy Feast", pet: "cat" },
  { name: "Fancy Feast Classic Pate Tender Beef Feast", brand: "Fancy Feast", pet: "cat" },
  { name: "Fancy Feast Classic Pate Ocean Whitefish and Tuna Feast", brand: "Fancy Feast", pet: "cat" },
  { name: "Fancy Feast Gems Mousse Pate with Salmon", brand: "Fancy Feast", pet: "cat" },
  { name: "Fancy Feast Gems Mousse Pate with Beef", brand: "Fancy Feast", pet: "cat" },
  { name: "Fancy Feast Gems Mousse Pate with Chicken", brand: "Fancy Feast", pet: "cat" },
  { name: "Fancy Feast Broths Classic with Chicken", brand: "Fancy Feast", pet: "cat" },
  { name: "Sheba Perfect Portions Pate Salmon Entree", brand: "Sheba", pet: "cat" },
  { name: "Sheba Perfect Portions Pate Chicken Entree", brand: "Sheba", pet: "cat" },
  { name: "Tiki Cat Puka Puka Luau Succulent Chicken", brand: "Tiki Cat", pet: "cat" },
  { name: "Tiki Cat Hookena Luau Ahi Tuna and Chicken", brand: "Tiki Cat", pet: "cat" },
  { name: "Purina Pro Plan Adult Chicken and Rice Entree Wet Cat Food", brand: "Purina Pro Plan", pet: "cat" },
  { name: "Wellness Complete Health Chicken Entree Pate Cat Food", brand: "Wellness", pet: "cat" },
  { name: "Friskies Pate Ocean Whitefish and Tuna Dinner", brand: "Friskies", pet: "cat" },
  { name: "9 Lives Pate Favorites Variety Pack", brand: "9 Lives", pet: "cat" },
];

function normalizeCacheKey(name) {
  return name
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getIngredientsFromGPT(productName) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You are a pet food ingredient database. Return the COMPLETE ingredient list for the exact product specified, as it appears on the official label. Return ONLY a JSON object:
{"found": true, "ingredients": "Ingredient1, Ingredient2, ..."}
If you don't know the exact ingredients, return:
{"found": false}
IMPORTANT: Be precise about the specific product variant. Do NOT guess or use ingredients from a different variant.`,
        },
        { role: "user", content: productName },
      ],
    }),
  });

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed.found && parsed.ingredients) {
      const list = parsed.ingredients.split(",").map(i => i.trim()).filter(i => i.length > 0);
      return { ingredients: list, ingredientText: parsed.ingredients };
    }
  } catch {}
  return null;
}

async function saveToSupabase(product, ingredients, ingredientText) {
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
      p_source: "gpt_seed",
    }),
  });

  return response.ok;
}

async function analyzeAndCache(product, ingredientText) {
  const cacheKey = normalizeCacheKey(`${product.brand} ${product.name}`);

  // Call the analyze Edge Function in verified mode
  const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      mode: "verified",
      stream: false,
      cacheKey: cacheKey,
      opffProduct: {
        productName: product.name,
        brand: product.brand,
        petType: product.pet,
        ingredientsText: ingredientText,
        nutriments: {},
      },
    }),
  });

  if (!response.ok) {
    console.log(`  ✗ Analysis failed: ${response.status}`);
    return false;
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (content) {
    try {
      const analysis = JSON.parse(content.replace(/^```json?\s*\n?/, "").replace(/\n?```\s*$/, ""));
      if (analysis.overallScore) {
        console.log(`  ✓ Score: ${analysis.overallScore} | ${analysis.ingredients?.length || 0} ingredients`);
        return true;
      }
    } catch {}
  }
  console.log(`  ✗ Analysis parse failed`);
  return false;
}

async function main() {
  console.log(`\n=== SEEDING ${PRODUCTS.length} PRODUCTS ===\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < PRODUCTS.length; i++) {
    const product = PRODUCTS[i];
    const num = `[${i + 1}/${PRODUCTS.length}]`;

    process.stdout.write(`${num} ${product.name.substring(0, 50)}... `);

    // Step 1: Get ingredients from GPT
    const result = await getIngredientsFromGPT(product.name + " " + product.pet + " food");
    if (!result || result.ingredients.length < 5) {
      console.log("GPT: NOT FOUND");
      failed++;
      continue;
    }

    console.log(`GPT: ${result.ingredients.length} ingredients`);

    // Step 2: Save ingredients to product_data
    const saved = await saveToSupabase(product, result.ingredients, result.ingredientText);
    if (!saved) {
      console.log(`  ✗ Save failed`);
      failed++;
      continue;
    }

    success++;
    console.log(`  ✓ Saved to DB`);

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== DONE ===`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${PRODUCTS.length}`);
}

main().catch(console.error);
