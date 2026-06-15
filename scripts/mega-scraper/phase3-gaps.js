#!/usr/bin/env node
/**
 * Phase 3: Gap Filler — Google Search + Scrape + GPT Extract
 *
 * For products still missing or with incomplete ingredients after
 * Phase 1 (OPFF) and Phase 2 (catalogs), this uses Google search
 * to find ingredient lists on small pet store websites.
 *
 * Also discovers new products by searching Google for pet food categories
 * and following product links.
 *
 * Cost: ~2-7 ScrapingBee credits per product
 * Run:  node scripts/mega-scraper/phase3-gaps.js [--discover] [--min=20]
 */

const {
  normalizeCacheKey, extractBrand, detectPetType,
  parseIngredients, extractIngredientsFromHtml,
  dbSave, dbGetExisting, dbGetAll,
  googleSearch, scrapePage, stripHtml, gptExtractIngredients,
  scrapeIngredients,
  log, progress, delay,
} = require("./lib");

// ── Fix Incomplete Products ─────────────────────────────────────────

async function fixIncomplete(minIngredients = 20) {
  log("GAPS", `Finding products with < ${minIngredients} ingredients...`);

  const all = await dbGetAll();
  const incomplete = all.filter(p => p.ingredient_count < minIngredients);

  // Filter out products that are legitimately short
  const legit = incomplete.filter(p => {
    const lower = p.product_name.toLowerCase();
    // Treats, broths, fresh food can have fewer ingredients
    const isShort = ["treat", "biscuit", "dental", "churu", "squeeze", "broth", "fresh", "raw", "freeze dried"].some(k => lower.includes(k));
    if (isShort && p.ingredient_count >= 5) return false;
    return true;
  });

  log("GAPS", `${legit.length} products need better ingredient data`);

  let fixed = 0, failed = 0;

  for (let i = 0; i < legit.length; i++) {
    const p = legit[i];
    const brand = p.brand || extractBrand(p.product_name);

    progress(i, legit.length, p.product_name, "searching...");

    const result = await scrapeIngredients(p.product_name, brand);

    if (result && result.ingredients.length > p.ingredient_count) {
      const saved = await dbSave(p.product_name, brand, result.ingredients, result.text, "web_verified", result.sourceUrl);
      if (saved) {
        fixed++;
        progress(i, legit.length, p.product_name, `✓ ${p.ingredient_count}→${result.ingredients.length}`);
      }
    } else {
      failed++;
      progress(i, legit.length, p.product_name, `✗ no better data found`);
    }

    await delay(2000);
  }

  return { fixed, failed, total: legit.length };
}

// ── Discover New Products ───────────────────────────────────────────

const DISCOVERY_QUERIES = [
  // Dog food — dry
  "best dry dog food brands 2024 ingredients",
  "top rated dry dog food complete ingredient list",
  "premium dry dog food ingredients label",
  "grain free dry dog food ingredients",
  "large breed dry dog food ingredients",
  "small breed dry dog food ingredients",
  "puppy dry dog food ingredients",
  "senior dry dog food ingredients",
  "weight management dry dog food ingredients",
  "sensitive stomach dry dog food ingredients",
  "limited ingredient dry dog food",
  // Dog food — wet
  "best wet dog food ingredients",
  "canned dog food ingredients label",
  "premium wet dog food ingredients",
  // Dog treats
  "dog dental treats ingredients",
  "dog training treats ingredients",
  "dog biscuits ingredients label",
  // Cat food — dry
  "best dry cat food brands ingredients",
  "top rated dry cat food ingredients label",
  "indoor cat food ingredients",
  "grain free cat food ingredients",
  "kitten dry food ingredients",
  "senior cat food ingredients",
  "hairball control cat food ingredients",
  // Cat food — wet
  "best wet cat food ingredients",
  "canned cat food pate ingredients",
  "cat food in gravy ingredients",
  // Cat treats
  "cat treats ingredients label",
  "cat dental treats ingredients",
  // Specific brands not well covered
  "4health dog food ingredients",
  "pure balance dog food ingredients",
  "authority dog food ingredients",
  "simply nourish dog food ingredients",
  "wholehearted dog food ingredients",
  "nature's recipe dog food ingredients",
  "avoderm dog food ingredients",
  "eukanuba dog food ingredients",
  "bil-jac dog food ingredients",
  "eagle pack dog food ingredients",
  "earthborn holistic dog food ingredients",
  "solid gold dog food ingredients",
  "halo dog food ingredients",
  "farmina dog food ingredients",
  "rawz dog food ingredients",
  "koha cat food ingredients",
  "weruva cat food ingredients",
  "tiki cat food ingredients list",
  "ziwi peak dog food ingredients",
  "primal pet food ingredients",
];

async function discoverProducts() {
  log("DISCOVER", `Running ${DISCOVERY_QUERIES.length} discovery searches...`);

  let discovered = 0, imported = 0;

  for (let i = 0; i < DISCOVERY_QUERIES.length; i++) {
    const query = DISCOVERY_QUERIES[i];
    log("DISCOVER", `[${i + 1}/${DISCOVERY_QUERIES.length}] "${query}"`);

    const results = await googleSearch(query, 10);

    for (const r of results) {
      try {
        const html = await scrapePage(r.url);
        if (!html || html.length < 500) continue;

        // Look for multiple product ingredient blocks on the page
        const ingredientBlocks = [];
        const blocks = html.match(/>([^<]{80,8000})</g) || [];

        for (const b of blocks) {
          const inner = b.slice(1).trim();
          const commas = (inner.match(/,/g) || []).length;
          if (commas < 5) continue;
          const lower = inner.toLowerCase();
          if (lower.includes("function") || lower.includes("=>") || lower.includes("{\"")) continue;

          const foodWords = ["chicken", "beef", "salmon", "turkey", "rice", "meal", "vitamin", "fat", "oil"];
          const foodCount = foodWords.filter(w => lower.includes(w)).length;
          if (foodCount >= 2) {
            const ingredients = parseIngredients(inner);
            if (ingredients.length >= 8) {
              ingredientBlocks.push({ ingredients, text: inner });
            }
          }
        }

        // Try to find product names near ingredient blocks
        for (const block of ingredientBlocks) {
          // Use GPT to identify the product name from the surrounding context
          const text = stripHtml(html);
          try {
            const resp = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${require("./lib").OKEY}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0,
                max_tokens: 200,
                messages: [
                  {
                    role: "system",
                    content: 'Given this pet food ingredient list and web page context, identify the EXACT product name (brand + product). Return JSON: {"name":"Brand Product Name","brand":"Brand"}',
                  },
                  {
                    role: "user",
                    content: `Ingredients: ${block.text.slice(0, 500)}\n\nPage context: ${text.slice(0, 1000)}`,
                  },
                ],
              }),
              signal: AbortSignal.timeout(10000),
            });
            if (!resp.ok) continue;
            const d = await resp.json();
            const parsed = JSON.parse(d.choices[0].message.content);
            if (parsed.name && parsed.name.length > 5) {
              const existing = await dbGetExisting(parsed.name, parsed.brand);
              if (!existing || existing.ingredient_count < block.ingredients.length) {
                const saved = await dbSave(parsed.name, parsed.brand || extractBrand(parsed.name), block.ingredients, block.text, "discovered", r.url);
                if (saved) {
                  imported++;
                  log("DISCOVER", `  ✓ NEW: ${parsed.name} (${block.ingredients.length} ingredients)`);
                }
              }
              discovered++;
            }
          } catch {}
        }
      } catch {}
      await delay(1500);
    }
    await delay(2000);
  }

  return { discovered, imported };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const discover = process.argv.includes("--discover");
  const minArg = process.argv.find(a => a.startsWith("--min="));
  const min = minArg ? parseInt(minArg.split("=")[1]) : 20;

  console.log("\n══════════════════════════════════════════════════");
  console.log("  PHASE 3: GAP FILLING");
  console.log("══════════════════════════════════════════════════\n");

  const start = Date.now();

  // Always fix incomplete first
  const fixResults = await fixIncomplete(min);
  console.log(`\nFix Results: ${fixResults.fixed} fixed, ${fixResults.failed} failed out of ${fixResults.total}`);

  // Optionally discover new products
  if (discover) {
    const discoverResults = await discoverProducts();
    console.log(`\nDiscovery Results: ${discoverResults.imported} imported, ${discoverResults.discovered} discovered`);
  }

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\nTotal time: ${elapsed} minutes`);
}

main().catch(console.error);
