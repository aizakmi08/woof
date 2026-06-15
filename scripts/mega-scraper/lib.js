/**
 * Shared library for the mega-scraper pipeline.
 * DB operations, ScrapingBee wrapper, GPT extraction, validation.
 */

// ── Config ──────────────────────────────────────────────────────────

const SBKEY = process.env.SBKEY;
const OKEY = process.env.OKEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const JS_HEAVY_DOMAINS = new Set([
  "royalcanin.com", "purina.com", "hillspet.com", "bluebuffalo.com",
  "iams.com", "nutro.com", "pedigree.com", "chewy.com", "amazon.com",
  "walmart.com", "target.com", "petsmart.com", "petco.com",
]);

const BLOCKED_DOMAINS = new Set([
  "google.com", "youtube.com", "facebook.com", "reddit.com",
  "instagram.com", "tiktok.com", "pinterest.com", "twitter.com", "x.com",
]);

// ── Normalization ───────────────────────────────────────────────────

function normalizeCacheKey(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBrand(name) {
  const brands = [
    "Blue Buffalo", "Purina Pro Plan", "Purina ONE", "Purina Dog Chow",
    "Purina Cat Chow", "Purina Beneful", "Purina Beggin", "Purina Busy",
    "Purina Beyond", "Purina", "Taste of the Wild", "Orijen", "Acana",
    "Hills Science Diet", "Hill's Science Diet", "Royal Canin", "Iams",
    "Kirkland Signature", "Diamond Naturals", "Diamond", "Victor",
    "Rachael Ray Nutrish", "Rachael Ray", "Merrick", "Nutro", "Canidae",
    "Wellness CORE", "Wellness", "Fromm", "Instinct", "The Honest Kitchen",
    "Open Farm", "Pedigree", "Ol Roy", "Kibbles n Bits", "Beneful",
    "Gravy Train", "Cesar", "Meow Mix", "Friskies", "9 Lives",
    "Kit and Kaboodle", "Kit & Kaboodle", "Fancy Feast", "Sheba",
    "Tiki Cat", "Greenies", "Milk Bone", "Milk-Bone", "Zuke's", "Zuke",
    "Temptations", "Crave", "Wag", "Natural Balance", "Whole Earth Farms",
    "American Journey", "Nulo", "Stella & Chewy's", "Stella and Chewy",
    "The Farmer's Dog", "Farmers Dog", "Ollie", "Just Food For Dogs",
    "Spot & Tango", "Spot and Tango", "Old Mother Hubbard", "Delectables",
    "Inaba", "Whiskas", "Authority", "Simply Nourish", "WholeHearted",
    "Blue Wilderness", "Earthborn Holistic", "Solid Gold", "Halo",
    "Castor & Pollux", "Nature's Variety", "Weruva", "Ziwi Peak",
    "Primal", "Answers Pet Food", "Rawz", "Koha", "FirstMate",
    "Petcurean", "Go! Solutions", "Now Fresh", "Gather",
    "Merrick Backcountry", "Merrick Purrfect Bistro",
    "Nature's Recipe", "Avoderm", "Lotus", "Evangers", "Party Animal",
    "Newman's Own", "Castor and Pollux", "I and Love and You",
    "Tuscan Natural", "Wysong", "Annamaet", "Blackwood", "Inception",
    "Farmina", "Grandma Lucy's", "Dr. Tim's", "Eagle Pack",
    "Eukanuba", "Bil-Jac", "SportMix", "4Health", "Pure Balance",
  ];
  const lower = name.toLowerCase();
  for (const b of brands) {
    if (lower.startsWith(b.toLowerCase())) return b;
  }
  return name.split(" ").slice(0, 2).join(" ");
}

function detectPetType(name, brand, categories) {
  const lower = (name + " " + (brand || "") + " " + (categories || "")).toLowerCase();
  const catKeywords = ["cat", "feline", "kitten", "indoor cat", "hairball"];
  const dogKeywords = ["dog", "canine", "puppy", "large breed", "small breed"];
  const catBrands = ["fancy feast", "friskies", "sheba", "tiki cat", "meow mix", "9 lives", "kit and kaboodle", "kit & kaboodle", "temptations", "whiskas"];
  const dogBrands = ["pedigree", "kibbles n bits", "cesar", "beneful", "ol roy", "gravy train", "milk bone", "milk-bone", "greenies"];

  if (catBrands.some(b => lower.includes(b))) return "cat";
  if (dogBrands.some(b => lower.includes(b))) return "dog";
  if (catKeywords.some(k => lower.includes(k))) return "cat";
  if (dogKeywords.some(k => lower.includes(k))) return "dog";
  return "unknown";
}

// ── Ingredient Parsing ──────────────────────────────────────────────

function parseIngredients(text) {
  if (!text || typeof text !== "string") return [];
  // Remove trailing period, normalize whitespace
  let clean = text.replace(/\.$/, "").replace(/\s+/g, " ").trim();
  // Split on commas but not inside parentheses/brackets
  const parts = [];
  let current = "";
  let depth = 0;
  for (const ch of clean) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }
  const last = current.trim();
  if (last) parts.push(last);
  return parts.filter(i => i.length > 1 && i.length < 250);
}

function validateIngredients(ingredients, productType) {
  if (!ingredients || ingredients.length < 3) return false;
  const first = ingredients[0].toLowerCase();
  const foodWords = [
    "chicken", "beef", "salmon", "turkey", "lamb", "fish", "pork", "duck",
    "venison", "bison", "rabbit", "trout", "tuna", "whitefish", "herring",
    "rice", "corn", "wheat", "barley", "oats", "peas", "potato", "sweet potato",
    "meal", "water", "broth", "liver", "deboned", "dehydrated", "ground",
    "whole grain", "organic", "fresh",
  ];
  return foodWords.some(w => first.includes(w));
}

// ── Database Operations ─────────────────────────────────────────────

async function dbSave(name, brand, ingredients, ingredientText, source, sourceUrl, imageUrl) {
  // Don't double the brand if name already starts with it
  let fullName = name;
  if (brand && !name.toLowerCase().startsWith(brand.toLowerCase())) {
    fullName = `${brand} ${name}`;
  }
  const key = normalizeCacheKey(fullName);
  if (!key || !ingredients.length) return false;

  const r = await fetch(`${SB_URL}/rest/v1/rpc/save_product_data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify({
      p_cache_key: key,
      p_product_name: name,
      p_brand: brand || "",
      p_ingredients: ingredients,
      p_ingredient_text: ingredientText,
      p_ingredient_count: ingredients.length,
      p_source: source || "web_verified",
      p_image_url: imageUrl || null,
    }),
  });
  return r.ok;
}

async function dbGetExisting(name, brand) {
  const key = normalizeCacheKey(brand ? `${brand} ${name}` : name);
  if (!key) return null;

  const r = await fetch(
    `${SB_URL}/rest/v1/product_data?cache_key=eq.${encodeURIComponent(key)}&select=ingredient_count,source`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!r.ok) return null;
  const d = await r.json();
  return d.length > 0 ? d[0] : null;
}

async function dbGetAll() {
  const r = await fetch(
    `${SB_URL}/rest/v1/product_data?select=cache_key,product_name,brand,ingredient_count,source&order=product_name`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!r.ok) return [];
  return r.json();
}

async function dbGetCount() {
  const r = await fetch(
    `${SB_URL}/rest/v1/product_data?select=cache_key&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: "count=exact" } }
  );
  const count = r.headers.get("content-range")?.split("/")[1];
  return parseInt(count || "0");
}

// ── ScrapingBee ─────────────────────────────────────────────────────

async function googleSearch(query, numResults = 10) {
  const params = new URLSearchParams({ api_key: SBKEY, search: query, nb_results: String(numResults) });
  const r = await fetch(`https://app.scrapingbee.com/api/v1/store/google?${params}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return [];
  const d = await r.json();
  return (d?.organic_results || [])
    .filter(r => r.url && ![...BLOCKED_DOMAINS].some(b => r.url.includes(b)))
    .map(r => ({ url: r.url.split("?")[0], title: r.title || "" }));
}

async function scrapePage(url, forceJs = false) {
  const needsJs = forceJs || [...JS_HEAVY_DOMAINS].some(d => url.includes(d));
  const params = new URLSearchParams({
    api_key: SBKEY,
    url,
    render_js: needsJs ? "true" : "false",
    ...(needsJs && { wait: "3000" }),
  });
  const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
    signal: AbortSignal.timeout(needsJs ? 25000 : 15000),
  });
  if (!r.ok) return null;
  const html = await r.text();
  if (html.length < 300) return null;
  return html.length > 600000 ? html.slice(0, 600000) : html;
}

function stripHtml(html) {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Focus on area around "ingredient" keyword
  const idx = text.toLowerCase().indexOf("ingredient");
  if (idx >= 0) {
    return text.slice(Math.max(0, idx - 500), Math.min(text.length, idx + 5000));
  }
  return text.slice(0, 6000);
}

// ── GPT Extraction ──────────────────────────────────────────────────

async function gptExtractIngredients(pageText, productName) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OKEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content: `Extract the COMPLETE ingredient list from this web page text about a pet food product.

RULES:
- Extract ONLY ingredients that are ACTUALLY written in the provided text
- Do NOT add, modify, or guess any ingredients from your training knowledge
- Return them in the exact order they appear on the label
- Include EVERYTHING: vitamins, minerals, preservatives, supplements, amino acid chelates
- Keep parenthetical groupings intact
- The ingredient list usually starts with a protein or grain

Return JSON: {"found": true, "ingredients": "Ingredient1, Ingredient2, ..."}
If no ingredient list exists in the text: {"found": false}`,
        },
        { role: "user", content: `Product: ${productName}\n\nWeb page text:\n${pageText.slice(0, 4000)}` },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return null;
  const d = await r.json();
  try {
    const p = JSON.parse(d.choices[0].message.content);
    if (p.found && p.ingredients) {
      const list = parseIngredients(p.ingredients);
      if (list.length >= 5) return { ingredients: list, text: p.ingredients };
    }
  } catch {}
  return null;
}

// ── HTML Ingredient Extraction (no GPT needed) ──────────────────────

function extractIngredientsFromHtml(html) {
  // Try to find ingredient blocks in raw HTML (before stripping)
  // Look for patterns like >Ingredient1, Ingredient2, ...< with 5+ commas
  const blocks = html.match(/>([^<]{60,8000})</g) || [];
  for (const b of blocks) {
    const inner = b.slice(1).trim();
    const commas = (inner.match(/,/g) || []).length;
    if (commas < 5) continue;
    const lower = inner.toLowerCase();
    // Skip code/JSON/CSS
    if (lower.includes("function") || lower.includes("=>") || lower.includes("@context") || lower.includes("{\"") || lower.includes("var ")) continue;

    const foodWords = [
      "chicken", "beef", "salmon", "turkey", "rice", "meal", "peas", "fat",
      "oil", "vitamin", "lamb", "fish", "corn", "wheat", "barley", "tuna",
      "liver", "broth", "pork", "duck", "sweet potato", "flaxseed",
    ];
    const foodCount = foodWords.filter(w => lower.includes(w)).length;
    if (foodCount < 2) continue;

    const ingredients = parseIngredients(inner);
    if (ingredients.length >= 8) {
      return { ingredients, text: inner };
    }
  }
  return null;
}

// ── Google + Scrape + Extract Pipeline ──────────────────────────────

async function scrapeIngredients(productName, brand) {
  // Try quoted search first, then unquoted
  let results = await googleSearch(`"${productName}" ingredients list`);
  if (results.length < 2) {
    const more = await googleSearch(`${productName} ${brand || ""} ingredients`);
    results = [...new Set([...results.map(r => r.url), ...more.map(r => r.url)])].map(url => ({ url }));
  }

  if (results.length === 0) return null;

  for (let i = 0; i < Math.min(results.length, 5); i++) {
    try {
      const html = await scrapePage(results[i].url);
      if (!html) continue;

      // Try direct HTML extraction first (free, no GPT credits)
      const direct = extractIngredientsFromHtml(html);
      if (direct && direct.ingredients.length >= 8) {
        return { ...direct, sourceUrl: results[i].url, method: "html" };
      }

      // Fall back to GPT extraction
      const text = stripHtml(html);
      if (text.length < 100) continue;

      const gpt = await gptExtractIngredients(text, productName);
      if (gpt && gpt.ingredients.length >= 5) {
        return { ingredients: gpt.ingredients, text: gpt.text, sourceUrl: results[i].url, method: "gpt" };
      }
    } catch {}
  }

  return null;
}

// ── Logging ─────────────────────────────────────────────────────────

function log(phase, msg) {
  console.log(`[${phase}] ${msg}`);
}

function progress(idx, total, name, status) {
  const num = `[${String(idx + 1).padStart(4)}/${total}]`;
  const pad = name.substring(0, 55).padEnd(55);
  console.log(`${num} ${pad} ${status}`);
}

// ── Delay ───────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  // Config
  SBKEY, OKEY, SB_URL, SB_KEY,
  JS_HEAVY_DOMAINS, BLOCKED_DOMAINS,
  // Normalization
  normalizeCacheKey, extractBrand, detectPetType,
  // Parsing
  parseIngredients, validateIngredients, extractIngredientsFromHtml,
  // DB
  dbSave, dbGetExisting, dbGetAll, dbGetCount,
  // Scraping
  googleSearch, scrapePage, stripHtml,
  // GPT
  gptExtractIngredients,
  // Pipeline
  scrapeIngredients,
  // Util
  log, progress, delay,
};
