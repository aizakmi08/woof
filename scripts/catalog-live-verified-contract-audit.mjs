import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeScraperCandidate,
  validateScraperCandidate,
  VERIFIED_SOURCE_QUALITIES,
  VERIFIED_INGREDIENT_STATUSES,
  VERIFIED_IMAGE_STATUSES,
} from "./catalog-scraper-contract.mjs";
import { splitIngredientStatement } from "../services/catalogIngredients.js";

const DEFAULT_LIMIT = 500;
const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_SAMPLE_LIMIT = 50;
const PRODUCT_SELECT = [
  "id",
  "cache_key",
  "gtin",
  "product_name",
  "brand",
  "ingredients",
  "ingredient_text",
  "nutritional_info",
  "source",
  "source_url",
  "image_url",
  "nutrient_panel",
  "has_published_nutrients",
  "is_complete_food",
  "catalog_exclusion_reason",
  "pet_type",
  "source_quality",
  "ingredient_verification_status",
  "image_verification_status",
  "verified_at",
  "product_line",
  "flavor",
  "life_stage",
  "food_form",
  "package_size",
  "updated_at",
].join(",");

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasArg(name) {
  return process.argv.includes(name);
}

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function env(name) {
  return compact(process.env[name]);
}

function supabaseUrl() {
  return env("SUPABASE_URL") || env("EXPO_PUBLIC_SUPABASE_URL");
}

function supabaseKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY")
    || env("SUPABASE_ANON_KEY")
    || env("EXPO_PUBLIC_SUPABASE_ANON_KEY");
}

function liveRowToCandidate(row = {}) {
  return normalizeScraperCandidate({
    cache_key: row.cache_key || `live:${row.id}`,
    gtin: row.gtin,
    product_name: row.product_name,
    brand: row.brand,
    product_line: row.product_line,
    flavor: row.flavor,
    life_stage: row.life_stage,
    food_form: row.food_form,
    package_size: row.package_size,
    pet_type: row.pet_type,
    ingredient_text: row.ingredient_text,
    ingredients: row.ingredients,
    front_image_url: row.image_url,
    source: row.source,
    source_url: row.source_url,
    source_quality: row.source_quality,
    ingredient_verification_status: row.ingredient_verification_status,
    image_verification_status: row.image_verification_status,
    is_complete_food: row.is_complete_food,
    nutrient_panel: row.nutrient_panel,
    nutritional_info: row.nutritional_info,
    verified_at: row.verified_at,
  });
}

function addCount(map, key) {
  const normalized = compact(key) || "unknown";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function countObject(map) {
  return Object.fromEntries([...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => compact(value) === compact(right[index]));
}

async function fetchVerifiedRows(client, {
  limit,
  offset,
  pageSize,
  source,
  brand,
}) {
  const rows = [];
  let total = null;
  while (rows.length < limit) {
    const take = Math.min(pageSize, limit - rows.length);
    const from = offset + rows.length;
    const to = from + take - 1;
    let query = client
      .from("product_data")
      .select(PRODUCT_SELECT, { count: rows.length === 0 ? "exact" : undefined })
      .eq("is_complete_food", true)
      .is("catalog_exclusion_reason", null)
      .in("source_quality", [...VERIFIED_SOURCE_QUALITIES])
      .in("ingredient_verification_status", [...VERIFIED_INGREDIENT_STATUSES])
      .in("image_verification_status", [...VERIFIED_IMAGE_STATUSES])
      .order("id", { ascending: true })
      .range(from, to);

    if (source) query = query.eq("source", source);
    if (brand) query = query.ilike("brand", brand);

    const { data, error, count } = await query;
    if (error) throw error;
    if (typeof count === "number") total = count;
    if (!data?.length) {
      return { rows, total: total ?? rows.length };
    }
    rows.push(...data);
    if (data.length < take) {
      return { rows, total: total ?? rows.length };
    }
  }
  return { rows, total };
}

async function main() {
  const url = supabaseUrl();
  const key = supabaseKey();
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  const offset = positiveInteger(getArg("--offset"), 0);
  const pageSize = positiveInteger(getArg("--page-size"), DEFAULT_PAGE_SIZE);
  const sampleLimit = positiveInteger(getArg("--sample-limit"), DEFAULT_SAMPLE_LIMIT);
  const source = compact(getArg("--source"));
  const brand = compact(getArg("--brand"));
  const failOnFinding = hasArg("--fail-on-finding");

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY.");
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { rows, total } = await fetchVerifiedRows(client, {
    limit,
    offset,
    pageSize,
    source,
    brand,
  });

  const failedByReason = new Map();
  const failedBySource = new Map();
  const scannedBySource = new Map();
  const failures = [];

  for (const row of rows) {
    addCount(scannedBySource, row.source);
    const candidate = liveRowToCandidate(row);
    const validation = validateScraperCandidate(candidate);
    const statementIngredients = splitIngredientStatement(row.ingredient_text);
    const statementArrayMatches = arraysEqual(row.ingredients, statementIngredients);
    if (validation.ok && statementArrayMatches) continue;

    const reasons = [...validation.reasons];
    if (!statementArrayMatches) reasons.push("ingredient_statement_array_mismatch");

    addCount(failedBySource, row.source);
    for (const reason of reasons) addCount(failedByReason, reason);
    if (failures.length < sampleLimit) {
      failures.push({
        id: row.id,
        cache_key: row.cache_key,
        product_name: row.product_name,
        brand: row.brand,
        source: row.source,
        source_url: row.source_url,
        pet_type: row.pet_type,
        package_size: row.package_size,
        ingredient_verification_status: row.ingredient_verification_status,
        image_verification_status: row.image_verification_status,
        verified_at: row.verified_at,
        updated_at: row.updated_at,
        ingredient_preview: compact(row.ingredient_text).slice(0, 240),
        image_url: row.image_url,
        reasons,
      });
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    mode: "read_only_live_verified_contract_audit",
    filters: {
      source: source || null,
      brand: brand || null,
      offset,
      limit,
      page_size: pageSize,
      sample_limit: sampleLimit,
    },
    summary: {
      total_matching_rows: total,
      scanned_rows: rows.length,
      failed_rows: [...failedBySource.values()].reduce((sum, count) => sum + count, 0),
      passed_rows: rows.length - [...failedBySource.values()].reduce((sum, count) => sum + count, 0),
      failed_by_reason: countObject(failedByReason),
      scanned_by_source: countObject(scannedBySource),
      failed_by_source: countObject(failedBySource),
    },
    failures,
  };

  console.log(JSON.stringify(payload, null, 2));
  if (failOnFinding && payload.summary.failed_rows > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
