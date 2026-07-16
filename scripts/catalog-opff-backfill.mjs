import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  acquisitionQueueOptions,
  printAcquisitionQueueUpdate,
  updateCatalogAcquisitionQueue,
} from "./catalog-acquisition-queue-utils.mjs";

const OPFF_BASE = "https://world.openpetfoodfacts.org";
const USER_AGENT = "Woof App - pet food scanner catalog backfill";
const DEFAULT_DAYS = 30;
const DEFAULT_QUERY_LIMIT = 50;
const DEFAULT_PRODUCTS_PER_QUERY = 12;

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

function detectPetType(product = {}) {
  const text = [
    product.product_name,
    product.product_name_en,
    product.brands,
    product.categories,
    Array.isArray(product.categories_tags) ? product.categories_tags.join(" ") : "",
  ].map(compact).join(" ").toLowerCase();

  if (/\b(dog|puppy|canine|chien)\b/.test(text)) return "dog";
  if (/\b(cat|kitten|feline|chat)\b/.test(text)) return "cat";
  return "unknown";
}

function ingredientNames(product = {}) {
  if (Array.isArray(product.ingredients)) {
    const names = product.ingredients
      .map((ingredient) => compact(ingredient?.text || ingredient?.id || ingredient))
      .filter(Boolean);
    if (names.length >= 5) return names;
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

function normalizeProduct(product = {}) {
  const code = compact(product.code || product._id);
  const productName = compact(product.product_name || product.product_name_en);
  const brand = compact(product.brands);
  const ingredients = ingredientNames(product);
  const petType = detectPetType(product);
  const cacheBasis = code || normalizeText(`${brand} ${productName}`);

  if (!cacheBasis || !productName || ingredients.length < 5 || !["dog", "cat"].includes(petType)) {
    return null;
  }

  return {
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
    is_complete_food: true,
    catalog_exclusion_reason: null,
  };
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

async function searchOpff(query, limit) {
  const rows = [];
  const pageSize = Math.min(Math.max(limit, 5), 25);
  const maxPages = Math.ceil(limit / pageSize);

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      action: "process",
      search_terms: query,
      tagtype_0: "countries",
      tag_contains_0: "contains",
      tag_0: "united-states",
      json: "true",
      page: String(page),
      page_size: String(pageSize),
    });
    const data = await fetchJson(`${OPFF_BASE}/cgi/search.pl?${params.toString()}`);
    const products = Array.isArray(data.products) ? data.products : [];
    rows.push(...products.map(normalizeProduct).filter(Boolean));
    if (products.length < pageSize || rows.length >= limit) break;
  }

  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.cache_key)) return false;
    seen.add(row.cache_key);
    return true;
  }).slice(0, limit);
}

async function coverageQueries(client, { days, limit }) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("product_events")
    .select("metadata,created_at,event_name")
    .in("event_name", ["catalog_lookup_miss", "catalog_lookup_failed"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit * 4);

  if (error) throw error;

  const counts = new Map();
  for (const event of data || []) {
    const query = compact(event.metadata?.normalized_query);
    if (!query || query === "[blank]") continue;
    counts.set(query, (counts.get(query) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([query]) => query)
    .slice(0, limit);
}

async function upsertRows(client, rows) {
  if (rows.length === 0) return { count: 0 };

  const { error } = await client
    .from("product_data")
    .upsert(rows, { onConflict: "cache_key" });

  if (error) throw error;
  return { count: rows.length };
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

function explicitQueries() {
  const query = getArg("--query");
  if (query) return [query];

  const terms = getArg("--queries");
  if (terms) return terms.split("|").map(compact).filter(Boolean);

  return [];
}

async function main() {
  const days = positiveNumber(getArg("--days"), DEFAULT_DAYS);
  const queryLimit = positiveNumber(getArg("--query-limit"), DEFAULT_QUERY_LIMIT);
  const productsPerQuery = positiveNumber(getArg("--products-per-query"), DEFAULT_PRODUCTS_PER_QUERY);
  const dryRun = hasArg("--dry-run");
  const acquisitionOptions = acquisitionQueueOptions({ getArg, hasArg });
  const client = clientFromEnv();
  let queries = explicitQueries();

  if (queries.length === 0) {
    if (!client) {
      throw new Error("Provide --query, --queries, or SUPABASE_SERVICE_ROLE_KEY for coverage-driven backfill.");
    }
    queries = await coverageQueries(client, { days, limit: queryLimit });
  }

  if (queries.length === 0) {
    console.log("No coverage queries to backfill yet.");
    return;
  }

  const allRows = [];
  for (const query of queries) {
    const rows = await searchOpff(query, productsPerQuery);
    console.log(`${query}: ${rows.length} OPFF candidate(s)`);
    allRows.push(...rows);
  }

  const deduped = [...new Map(allRows.map((row) => [row.cache_key, row])).values()];
  console.log(`Total unique candidates: ${deduped.length}`);

  if (dryRun || !client) {
    console.log(JSON.stringify(deduped.slice(0, 25), null, 2));
    if (!client) {
      console.log("Set SUPABASE_SERVICE_ROLE_KEY to upsert these rows into product_data.");
    }
    return;
  }

  const result = await upsertRows(client, deduped);
  console.log(`Upserted ${result.count} product_data row(s).`);
  printAcquisitionQueueUpdate(await updateCatalogAcquisitionQueue(client, {
    ...acquisitionOptions,
    label: "OPFF backfill",
  }));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
