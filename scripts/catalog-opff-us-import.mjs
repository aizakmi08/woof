import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  acquisitionQueueOptions,
  printAcquisitionQueueUpdate,
  updateCatalogAcquisitionQueue,
} from "./catalog-acquisition-queue-utils.mjs";

const OPFF_BASE = "https://world.openpetfoodfacts.org";
const USER_AGENT = "Woof App - US pet food catalog import";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MIN_INGREDIENTS = 5;

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return compact(value)
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textBlob(product = {}) {
  return [
    product.product_name,
    product.product_name_en,
    product.generic_name,
    product.brands,
    product.categories,
    Array.isArray(product.categories_tags) ? product.categories_tags.join(" ") : "",
  ].map(compact).join(" ").toLowerCase();
}

function detectPetType(product = {}) {
  const text = textBlob(product);
  if (/\b(dog|dogs|puppy|puppies|canine|chien|chiens)\b/.test(text)) return "dog";
  if (/\b(cat|cats|kitten|kittens|feline|chat|chats)\b/.test(text)) return "cat";
  return "unknown";
}

function isTreatOrSupplement(product = {}) {
  return /\b(treat|treats|snack|snacks|chew|chews|supplement|topper|mixer|complementary)\b/.test(textBlob(product));
}

function isLikelyNonUsCommunityProduct(product = {}) {
  return /\b(pour|croquettes?|sachets?|gel[eé]e|st[eé]rilis[eé]|sterilis[eé]|strilis|adulte|chat|chien|chaton|chiot|p[aâ]t[eé]e|croquette|eminc[eé]s?|bouch[eé]es?|terrines?)\b/.test(textBlob(product));
}

function ingredientNames(product = {}) {
  if (Array.isArray(product.ingredients)) {
    const names = product.ingredients
      .map((ingredient) => compact(ingredient?.text || ingredient?.id || ingredient))
      .filter(Boolean);
    if (names.length > 0) return names;
  }

  const text = compact(product.ingredients_text || product.ingredients_text_en);
  if (!text) return [];
  return text
    .split(/[,;]+/)
    .map(compact)
    .filter(Boolean);
}

function nutriments(product = {}) {
  const source = product.nutriments || {};
  return {
    protein: source.proteins_100g ?? source.proteins ?? null,
    fat: source.fat_100g ?? source.fat ?? null,
    fiber: source.fiber_100g ?? source["crude-fiber_100g"] ?? source.fiber ?? null,
    energy: source["energy-kcal_100g"] ?? source.energy_100g ?? source.energy ?? null,
  };
}

function sourceUrl(product = {}) {
  const code = compact(product.code || product._id);
  return code ? `${OPFF_BASE}/product/${encodeURIComponent(code)}` : OPFF_BASE;
}

function normalizeProduct(product = {}, { minIngredients }) {
  const code = compact(product.code || product._id);
  const productName = compact(product.product_name || product.product_name_en);
  const brand = compact(product.brands);
  const ingredients = ingredientNames(product);
  const petType = detectPetType(product);
  const cacheBasis = code || normalizeText(`${brand} ${productName}`);
  const isCompleteFood = !isTreatOrSupplement(product);

  if (!cacheBasis) return { row: null, reason: "missing_cache_key" };
  if (!productName) return { row: null, reason: "missing_product_name" };
  if (!["dog", "cat"].includes(petType)) return { row: null, reason: "unknown_pet_type" };
  if (isLikelyNonUsCommunityProduct(product)) return { row: null, reason: "non_us_locale_product" };
  if (ingredients.length < minIngredients) return { row: null, reason: "missing_ingredients" };

  return {
    row: {
      cache_key: `opff:${cacheBasis}`,
      product_name: productName,
      brand,
      pet_type: petType,
      ingredients,
      ingredient_text: ingredients.join(", "),
      ingredient_count: ingredients.length,
      nutritional_info: nutriments(product),
      nutrient_panel: product.nutriments || null,
      has_published_nutrients: Boolean(product.nutriments && Object.keys(product.nutriments).length > 0),
      source: "opff",
      source_quality: "community",
      ingredient_verification_status: "community",
      image_verification_status: compact(product.image_front_url || product.image_url) ? "community" : "unverified",
      verified_at: null,
      source_url: sourceUrl(product),
      scraped_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      image_url: compact(product.image_front_url || product.image_url) || null,
      is_complete_food: isCompleteFood,
      catalog_exclusion_reason: isCompleteFood ? null : "not_complete_food",
      updated_at: new Date().toISOString(),
    },
    reason: null,
  };
}

function clientFromEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = serviceRoleKey();
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`OPFF HTTP ${response.status}`);
  }

  return response.json();
}

function pageUrl({ page, pageSize }) {
  const params = new URLSearchParams({
    action: "process",
    tagtype_0: "countries",
    tag_contains_0: "contains",
    tag_0: "united-states",
    json: "true",
    page: String(page),
    page_size: String(pageSize),
    fields: [
      "code",
      "_id",
      "product_name",
      "product_name_en",
      "generic_name",
      "brands",
      "categories",
      "categories_tags",
      "ingredients",
      "ingredients_text",
      "ingredients_text_en",
      "nutriments",
      "image_front_url",
      "image_url",
    ].join(","),
  });

  return `${OPFF_BASE}/cgi/search.pl?${params.toString()}`;
}

async function upsertRows(client, rows) {
  if (rows.length === 0) return 0;
  const { error } = await client
    .from("product_data")
    .upsert(rows, { onConflict: "cache_key" });

  if (error) throw error;
  return rows.length;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function printSkipSummary(skipped) {
  const rows = [...skipped.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);

  if (rows.length === 0) return;
  console.log("Skipped rows:");
  console.table(rows);
}

async function main() {
  const pageSize = Math.min(positiveNumber(getArg("--page-size"), DEFAULT_PAGE_SIZE), 100);
  const batchSize = Math.min(positiveNumber(getArg("--batch-size"), DEFAULT_BATCH_SIZE), 1000);
  const maxPages = positiveNumber(getArg("--max-pages"), 0);
  const minIngredients = positiveNumber(getArg("--min-ingredients"), DEFAULT_MIN_INGREDIENTS);
  const dryRun = hasArg("--dry-run");
  const acquisitionOptions = acquisitionQueueOptions({ getArg, hasArg });
  const client = clientFromEnv();

  if (!client && !dryRun) {
    throw new Error("Set SUPABASE_SERVICE_ROLE_KEY or run with --dry-run.");
  }

  const seen = new Set();
  const skipped = new Map();
  let batch = [];
  let fetched = 0;
  let normalized = 0;
  let upserted = 0;

  for (let page = 1; maxPages === 0 || page <= maxPages; page += 1) {
    const data = await fetchJson(pageUrl({ page, pageSize }));
    const products = Array.isArray(data.products) ? data.products : [];
    fetched += products.length;

    for (const product of products) {
      const { row, reason } = normalizeProduct(product, { minIngredients });
      if (!row) {
        increment(skipped, reason || "unknown");
        continue;
      }
      if (seen.has(row.cache_key)) continue;

      seen.add(row.cache_key);
      normalized += 1;
      batch.push(row);

      if (client && !dryRun && batch.length >= batchSize) {
        upserted += await upsertRows(client, batch);
        batch = [];
      }
    }

    console.log(`Page ${page}: fetched ${products.length}, normalized ${normalized}, unique ${seen.size}`);
    if (products.length < pageSize) break;
  }

  if (client && !dryRun && batch.length > 0) {
    upserted += await upsertRows(client, batch);
  }
  if (client && !dryRun) {
    printAcquisitionQueueUpdate(await updateCatalogAcquisitionQueue(client, {
      ...acquisitionOptions,
      label: "OPFF US import",
    }));
  }

  console.log(`Fetched: ${fetched}`);
  console.log(`Ready dog/cat product rows: ${normalized}`);
  console.log(`Upserted: ${upserted}`);

  if (dryRun || !client) {
    console.log("Dry run only. Add SUPABASE_SERVICE_ROLE_KEY and remove --dry-run to upsert.");
  }

  printSkipSummary(skipped);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
