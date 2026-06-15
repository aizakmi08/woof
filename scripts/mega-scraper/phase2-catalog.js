#!/usr/bin/env node
/**
 * Phase 2: Catalog Scraping — DogFoodAdvisor + Chewy + Brand Sites
 *
 * Scrapes comprehensive product catalogs to discover ALL pet food products
 * and extract their ingredient lists.
 *
 * Sources (in order):
 * 1. DogFoodAdvisor.com — ~800+ dog foods with verified ingredients
 * 2. Chewy.com — Largest US pet food catalog (~5000+ products)
 * 3. Brand websites — Direct manufacturer ingredient data
 *
 * Cost: ~5,000-15,000 ScrapingBee credits
 * Run:  node scripts/mega-scraper/phase2-catalog.js [--source=dfa|chewy|brands]
 */

const {
  normalizeCacheKey, extractBrand, detectPetType,
  parseIngredients, validateIngredients, extractIngredientsFromHtml,
  dbSave, dbGetExisting, dbGetAll,
  scrapePage, stripHtml, gptExtractIngredients,
  log, progress, delay,
  SBKEY,
} = require("./lib");

// ── DogFoodAdvisor Scraper ──────────────────────────────────────────

async function scrapeDFA() {
  log("DFA", "Scraping DogFoodAdvisor.com brand directory...");

  // Step 1: Get brand listing pages
  const brandListUrls = [
    "https://www.dogfoodadvisor.com/dog-food-reviews/dry/",
    "https://www.dogfoodadvisor.com/dog-food-reviews/canned/",
    "https://www.dogfoodadvisor.com/dog-food-reviews/raw/",
    "https://www.dogfoodadvisor.com/dog-food-reviews/dehydrated/",
    "https://www.dogfoodadvisor.com/dog-food-reviews/fresh/",
    "https://www.dogfoodadvisor.com/dog-food-reviews/freeze-dried/",
  ];

  const brandUrls = new Set();
  for (const listUrl of brandListUrls) {
    try {
      const html = await scrapePage(listUrl);
      if (!html) continue;

      // Extract brand review URLs
      const matches = html.match(/href="(https?:\/\/www\.dogfoodadvisor\.com\/dog-food-reviews\/[a-z0-9-]+\/?)"/gi) || [];
      for (const m of matches) {
        const url = m.match(/href="([^"]+)"/)?.[1];
        if (url && !url.includes("/dry/") && !url.includes("/canned/") && !url.includes("/raw/") && !url.includes("/dehydrated/") && !url.includes("/fresh/") && !url.includes("/freeze-dried/")) {
          brandUrls.add(url.replace(/\/$/, ""));
        }
      }
      log("DFA", `Found ${brandUrls.size} brand URLs from ${listUrl.split("/").slice(-2, -1)}`);
    } catch (err) {
      log("DFA", `Error fetching ${listUrl}: ${err.message}`);
    }
    await delay(1500);
  }

  log("DFA", `Total unique brand pages: ${brandUrls.size}`);

  // Step 2: Scrape each brand page for product reviews
  const productUrls = new Set();
  let brandIdx = 0;
  for (const brandUrl of brandUrls) {
    brandIdx++;
    try {
      const html = await scrapePage(brandUrl);
      if (!html) continue;

      // Find individual product review links
      const matches = html.match(/href="(https?:\/\/www\.dogfoodadvisor\.com\/dog-food-reviews\/[a-z0-9-]+-[a-z0-9-]+\/?)"/gi) || [];
      for (const m of matches) {
        const url = m.match(/href="([^"]+)"/)?.[1];
        if (url && url !== brandUrl && url.split("/").filter(Boolean).length > 4) {
          productUrls.add(url.replace(/\/$/, ""));
        }
      }

      if (brandIdx % 20 === 0) {
        log("DFA", `Brands: ${brandIdx}/${brandUrls.size} | Products found: ${productUrls.size}`);
      }
    } catch {}
    await delay(1000);
  }

  log("DFA", `Total product review pages: ${productUrls.size}`);

  // Step 3: Scrape each product for ingredients
  let imported = 0, skipped = 0, failed = 0;
  let idx = 0;
  const total = productUrls.size;

  for (const productUrl of productUrls) {
    idx++;
    try {
      const html = await scrapePage(productUrl);
      if (!html) { failed++; continue; }

      // Extract product name from title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      let productName = titleMatch?.[1]?.replace(/\s*[-|].*Dog Food Advisor.*/i, "").replace(/\s*Review\s*$/i, "").trim();
      if (!productName || productName.length < 5) { failed++; continue; }

      const brand = extractBrand(productName);

      // Check if already in DB
      const existing = await dbGetExisting(productName, brand);
      if (existing && existing.ingredient_count >= 20) {
        skipped++;
        continue;
      }

      // Try HTML extraction first
      let result = extractIngredientsFromHtml(html);

      // Fall back to GPT extraction
      if (!result || result.ingredients.length < 8) {
        const text = stripHtml(html);
        const gpt = await gptExtractIngredients(text, productName);
        if (gpt) result = { ingredients: gpt.ingredients, text: gpt.text };
      }

      if (result && result.ingredients.length >= 5) {
        // Only save if better than existing
        if (!existing || result.ingredients.length > existing.ingredient_count) {
          const saved = await dbSave(productName, brand, result.ingredients, result.text, "dfa", productUrl);
          if (saved) {
            imported++;
            progress(idx - 1, total, productName, `✓ ${result.ingredients.length} ingredients`);
          }
        } else {
          skipped++;
        }
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
    }

    if (idx % 10 === 0) await delay(1000);
    else await delay(500);
  }

  return { imported, skipped, failed, total };
}

// ── Chewy.com Catalog Scraper ───────────────────────────────────────

const CHEWY_CATEGORIES = [
  // Dog food
  { url: "https://www.chewy.com/b/dry-food-288", type: "dry_dog", pet: "dog" },
  { url: "https://www.chewy.com/b/wet-food-702", type: "wet_dog", pet: "dog" },
  { url: "https://www.chewy.com/b/freeze-dried-food-2226", type: "fd_dog", pet: "dog" },
  { url: "https://www.chewy.com/b/dehydrated-food-2162", type: "dh_dog", pet: "dog" },
  { url: "https://www.chewy.com/b/fresh-food-7472", type: "fresh_dog", pet: "dog" },
  // Dog treats
  { url: "https://www.chewy.com/b/biscuits-bakery-treats-326", type: "treat_dog", pet: "dog" },
  { url: "https://www.chewy.com/b/dental-treats-338", type: "dental_dog", pet: "dog" },
  { url: "https://www.chewy.com/b/training-treats-4418", type: "train_dog", pet: "dog" },
  // Cat food
  { url: "https://www.chewy.com/b/dry-food-288_1", type: "dry_cat", pet: "cat" },
  { url: "https://www.chewy.com/b/wet-food-702_1", type: "wet_cat", pet: "cat" },
  { url: "https://www.chewy.com/b/freeze-dried-food-2226_1", type: "fd_cat", pet: "cat" },
  // Cat treats
  { url: "https://www.chewy.com/b/treats-702_1", type: "treat_cat", pet: "cat" },
];

async function scrapeChewyCategory(categoryUrl, pet) {
  const products = [];
  let page = 1;
  const maxPages = 80; // Safety cap

  while (page <= maxPages) {
    const url = page === 1 ? categoryUrl : `${categoryUrl}?page=${page}`;
    try {
      const html = await scrapePage(url, true); // Force JS rendering
      if (!html || html.length < 1000) break;

      // Extract product links
      const productLinks = html.match(/href="(\/dp\/[^"]+)"/g) || [];
      if (productLinks.length === 0) break;

      for (const link of productLinks) {
        const path = link.match(/href="([^"]+)"/)?.[1];
        if (path) {
          products.push(`https://www.chewy.com${path}`);
        }
      }

      log("CHEWY", `Category page ${page}: found ${productLinks.length} products (total: ${products.length})`);

      // Check if there's a next page
      if (!html.includes("next") && !html.includes("Next")) break;
      page++;
    } catch (err) {
      log("CHEWY", `Category page ${page} error: ${err.message}`);
      break;
    }
    await delay(2000);
  }

  return [...new Set(products)];
}

async function scrapeChewyProduct(productUrl) {
  try {
    const html = await scrapePage(productUrl, true);
    if (!html) return null;

    // Extract product name
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let name = titleMatch?.[1]?.replace(/\s*[-|].*Chewy.*/i, "").trim();
    if (!name) return null;

    // Extract brand
    const brandMatch = html.match(/brand['":\s]+['"]([^'"]+)['"]/i);
    const brand = brandMatch?.[1] || extractBrand(name);

    // Try HTML extraction
    let result = extractIngredientsFromHtml(html);

    if (!result || result.ingredients.length < 5) {
      const text = stripHtml(html);
      const gpt = await gptExtractIngredients(text, name);
      if (gpt) result = { ingredients: gpt.ingredients, text: gpt.text };
    }

    if (result && result.ingredients.length >= 5) {
      return { name, brand, ingredients: result.ingredients, text: result.text, url: productUrl };
    }
  } catch {}
  return null;
}

async function scrapeChewy() {
  log("CHEWY", "Scraping Chewy.com catalog...");

  let totalImported = 0, totalSkipped = 0, totalFailed = 0;

  for (const cat of CHEWY_CATEGORIES) {
    log("CHEWY", `Category: ${cat.type} (${cat.url})`);

    const productUrls = await scrapeChewyCategory(cat.url, cat.pet);
    log("CHEWY", `Found ${productUrls.length} products in ${cat.type}`);

    let catImported = 0;
    for (let i = 0; i < productUrls.length; i++) {
      const product = await scrapeChewyProduct(productUrls[i]);

      if (product) {
        const existing = await dbGetExisting(product.name, product.brand);
        if (existing && existing.ingredient_count >= product.ingredients.length) {
          totalSkipped++;
          continue;
        }

        const saved = await dbSave(product.name, product.brand, product.ingredients, product.text, "chewy", product.url);
        if (saved) {
          totalImported++;
          catImported++;
          if (catImported % 20 === 0) {
            log("CHEWY", `${cat.type}: ${catImported} imported so far`);
          }
        }
      } else {
        totalFailed++;
      }

      await delay(1500);
    }

    log("CHEWY", `${cat.type} done: ${catImported} imported`);
  }

  return { imported: totalImported, skipped: totalSkipped, failed: totalFailed };
}

// ── Brand Website Catalog Scraper ───────────────────────────────────

const BRAND_CATALOGS = [
  // Each entry: { brand, catalogUrl, productUrlPattern, needsJs }
  { brand: "Purina Pro Plan", catalogUrl: "https://www.purina.com/pro-plan/dogs/dry-dog-food", needsJs: true },
  { brand: "Purina Pro Plan", catalogUrl: "https://www.purina.com/pro-plan/cats/dry-cat-food", needsJs: true },
  { brand: "Purina ONE", catalogUrl: "https://www.purina.com/one/dogs/dry-dog-food", needsJs: true },
  { brand: "Purina ONE", catalogUrl: "https://www.purina.com/one/cats/dry-cat-food", needsJs: true },
  { brand: "Blue Buffalo", catalogUrl: "https://bluebuffalo.com/dog-food/dry-dog-food/", needsJs: true },
  { brand: "Blue Buffalo", catalogUrl: "https://bluebuffalo.com/cat-food/dry-cat-food/", needsJs: true },
  { brand: "Hill's Science Diet", catalogUrl: "https://www.hillspet.com/dog-food", needsJs: true },
  { brand: "Hill's Science Diet", catalogUrl: "https://www.hillspet.com/cat-food", needsJs: true },
  { brand: "Royal Canin", catalogUrl: "https://www.royalcanin.com/us/dogs/products/retail-products", needsJs: true },
  { brand: "Royal Canin", catalogUrl: "https://www.royalcanin.com/us/cats/products/retail-products", needsJs: true },
  { brand: "Iams", catalogUrl: "https://www.iams.com/dog/dog-food", needsJs: true },
  { brand: "Iams", catalogUrl: "https://www.iams.com/cat/cat-food", needsJs: true },
  { brand: "Nutro", catalogUrl: "https://www.nutro.com/dog-food", needsJs: true },
  { brand: "Nutro", catalogUrl: "https://www.nutro.com/cat-food", needsJs: true },
  { brand: "Wellness", catalogUrl: "https://www.wellnesspetfood.com/dog-food", needsJs: true },
  { brand: "Wellness", catalogUrl: "https://www.wellnesspetfood.com/cat-food", needsJs: true },
  { brand: "Merrick", catalogUrl: "https://www.merrickpetcare.com/dogs/food", needsJs: true },
  { brand: "Merrick", catalogUrl: "https://www.merrickpetcare.com/cats/food", needsJs: true },
  { brand: "Taste of the Wild", catalogUrl: "https://www.tasteofthewildpetfood.com/dog-formulas/", needsJs: false },
  { brand: "Taste of the Wild", catalogUrl: "https://www.tasteofthewildpetfood.com/cat-formulas/", needsJs: false },
  { brand: "Orijen", catalogUrl: "https://www.orijen.ca/en-us/dog-food", needsJs: true },
  { brand: "Orijen", catalogUrl: "https://www.orijen.ca/en-us/cat-food", needsJs: true },
  { brand: "Acana", catalogUrl: "https://www.acana.com/en-us/dog-food", needsJs: true },
  { brand: "Acana", catalogUrl: "https://www.acana.com/en-us/cat-food", needsJs: true },
  { brand: "Canidae", catalogUrl: "https://www.canidae.com/dog-food/", needsJs: true },
  { brand: "Canidae", catalogUrl: "https://www.canidae.com/cat-food/", needsJs: true },
  { brand: "Fromm", catalogUrl: "https://frfrommfamily.com/products/dog/", needsJs: false },
  { brand: "Fromm", catalogUrl: "https://frommfamily.com/products/cat/", needsJs: false },
  { brand: "Instinct", catalogUrl: "https://www.instinctpetfood.com/dogs", needsJs: true },
  { brand: "Instinct", catalogUrl: "https://www.instinctpetfood.com/cats", needsJs: true },
  { brand: "Nulo", catalogUrl: "https://nulo.com/dog-food", needsJs: true },
  { brand: "Nulo", catalogUrl: "https://nulo.com/cat-food", needsJs: true },
  { brand: "Open Farm", catalogUrl: "https://openfarmpet.com/dog-food/", needsJs: true },
  { brand: "Open Farm", catalogUrl: "https://openfarmpet.com/cat-food/", needsJs: true },
  { brand: "Rachael Ray Nutrish", catalogUrl: "https://www.nutrish.com/dogs/dry-food", needsJs: true },
  { brand: "Rachael Ray Nutrish", catalogUrl: "https://www.nutrish.com/cats/dry-food", needsJs: true },
  { brand: "Diamond Naturals", catalogUrl: "https://www.diamondpet.com/brands/diamond-naturals/dog/", needsJs: false },
  { brand: "Victor", catalogUrl: "https://www.victordogfood.com/products/dog/dry-dog-food", needsJs: true },
  { brand: "Natural Balance", catalogUrl: "https://www.naturalbalanceinc.com/dog-food", needsJs: true },
  { brand: "Natural Balance", catalogUrl: "https://www.naturalbalanceinc.com/cat-food", needsJs: true },
  { brand: "Solid Gold", catalogUrl: "https://www.solidgoldpet.com/dogs/food/", needsJs: true },
  { brand: "Halo", catalogUrl: "https://www.halopets.com/dogs/dog-food", needsJs: true },
  { brand: "Earthborn Holistic", catalogUrl: "https://www.earthbornholisticpetfood.com/dog-food/", needsJs: false },
  { brand: "Farmina", catalogUrl: "https://www.farmina.com/us/dog", needsJs: true },
  { brand: "Farmina", catalogUrl: "https://www.farmina.com/us/cat", needsJs: true },
  { brand: "Stella & Chewy's", catalogUrl: "https://www.stellaandchewys.com/dog-food", needsJs: true },
  { brand: "Stella & Chewy's", catalogUrl: "https://www.stellaandchewys.com/cat-food", needsJs: true },
  { brand: "Weruva", catalogUrl: "https://www.weruva.com/dogs/", needsJs: true },
  { brand: "Weruva", catalogUrl: "https://www.weruva.com/cats/", needsJs: true },
  { brand: "Tiki Cat", catalogUrl: "https://www.tikipets.com/cat/food/", needsJs: true },
  { brand: "Ziwi Peak", catalogUrl: "https://www.ziwipets.com/us/dog-food", needsJs: true },
  { brand: "Ziwi Peak", catalogUrl: "https://www.ziwipets.com/us/cat-food", needsJs: true },
];

async function scrapeBrandCatalog(entry) {
  const { brand, catalogUrl, needsJs } = entry;
  const results = [];

  try {
    const html = await scrapePage(catalogUrl, needsJs);
    if (!html) return results;

    // Extract product page links from the catalog
    const domain = new URL(catalogUrl).origin;
    const linkPattern = /href="([^"]*(?:product|food|formula|recipe|kibble)[^"]*)"/gi;
    const links = new Set();
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith("/")) url = domain + url;
      if (url.startsWith("http")) links.add(url);
    }

    // Also try generic internal links
    const allLinks = html.match(/href="(\/[^"]{10,})"/g) || [];
    for (const l of allLinks) {
      const path = l.match(/href="([^"]+)"/)?.[1];
      if (path && !path.includes("#") && !path.includes("javascript") && !path.includes(".css") && !path.includes(".js")) {
        const url = domain + path;
        if (!links.has(url)) links.add(url);
      }
    }

    log("BRAND", `${brand}: Found ${links.size} potential product pages`);

    // Scrape each product page
    let count = 0;
    for (const productUrl of links) {
      if (count >= 100) break; // Safety cap per brand catalog page

      try {
        const productHtml = await scrapePage(productUrl, needsJs);
        if (!productHtml) continue;

        // Extract title
        const titleMatch = productHtml.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                           productHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        let name = titleMatch?.[1]?.replace(/\s*[-|].*$/i, "").trim();
        if (!name || name.length < 5 || name.length > 200) continue;

        // Check for ingredients
        let ingredients = extractIngredientsFromHtml(productHtml);
        if (!ingredients || ingredients.ingredients.length < 5) {
          const text = stripHtml(productHtml);
          if (text.toLowerCase().includes("ingredient")) {
            const gpt = await gptExtractIngredients(text, `${brand} ${name}`);
            if (gpt) ingredients = { ingredients: gpt.ingredients, text: gpt.text };
          }
        }

        if (ingredients && ingredients.ingredients.length >= 5) {
          results.push({
            name: `${brand} ${name}`.replace(new RegExp(`^${brand}\\s+${brand}`, "i"), brand),
            brand,
            ingredients: ingredients.ingredients,
            text: ingredients.text,
            url: productUrl,
          });
          count++;
        }
      } catch {}

      await delay(1500);
    }
  } catch (err) {
    log("BRAND", `${brand} error: ${err.message}`);
  }

  return results;
}

async function scrapeBrands() {
  log("BRAND", `Scraping ${BRAND_CATALOGS.length} brand catalog pages...`);

  let totalImported = 0, totalSkipped = 0;

  for (const entry of BRAND_CATALOGS) {
    const products = await scrapeBrandCatalog(entry);

    for (const p of products) {
      const existing = await dbGetExisting(p.name, p.brand);
      if (existing && existing.ingredient_count >= p.ingredients.length) {
        totalSkipped++;
        continue;
      }

      const saved = await dbSave(p.name, p.brand, p.ingredients, p.text, "brand", p.url);
      if (saved) totalImported++;
    }

    log("BRAND", `${entry.brand}: ${products.length} products found`);
    await delay(2000);
  }

  return { imported: totalImported, skipped: totalSkipped };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const source = process.argv.find(a => a.startsWith("--source="))?.split("=")[1] || "all";

  console.log("\n══════════════════════════════════════════════════");
  console.log("  PHASE 2: CATALOG SCRAPING");
  console.log("══════════════════════════════════════════════════");
  console.log(`Source: ${source}\n`);

  const start = Date.now();

  if (source === "dfa" || source === "all") {
    const dfa = await scrapeDFA();
    console.log(`\nDFA Results: ${dfa.imported} imported, ${dfa.skipped} skipped, ${dfa.failed} failed`);
  }

  if (source === "chewy" || source === "all") {
    const chewy = await scrapeChewy();
    console.log(`\nChewy Results: ${chewy.imported} imported, ${chewy.skipped} skipped, ${chewy.failed} failed`);
  }

  if (source === "brands" || source === "all") {
    const brands = await scrapeBrands();
    console.log(`\nBrand Results: ${brands.imported} imported, ${brands.skipped} skipped`);
  }

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\nTotal time: ${elapsed} minutes`);
}

main().catch(console.error);
