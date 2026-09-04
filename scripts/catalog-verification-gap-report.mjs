import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const DEFAULT_DAYS = 30;
const DEFAULT_BRAND_LIMIT = 50;
const DEFAULT_PRODUCT_LIMIT = 100;
const DEFAULT_EVENT_LIMIT = 25;
const VERIFIED_INGREDIENT_STATUSES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
]);
const VERIFIED_IMAGE_STATUSES = new Set([
  "official",
  "manufacturer",
  "retailer_verified",
]);

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

function fallbackSql({ days, brandLimit, productLimit, eventLimit }) {
  return `
-- Run in Supabase SQL Editor with a privileged role.
WITH ready AS (
  SELECT
    cache_key,
    product_name,
    NULLIF(trim(brand), '') AS brand,
    source,
    source_quality,
    COALESCE(pet_type, 'unknown') AS pet_type,
    image_url,
    ingredient_count,
    ingredient_verification_status,
    image_verification_status,
    source_url
  FROM public.product_data
  WHERE expires_at > now()
    AND ingredient_count >= 5
    AND is_complete_food = TRUE
    AND catalog_exclusion_reason IS NULL
),
classified AS (
  SELECT
    *,
    CASE
      WHEN ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
        AND COALESCE(NULLIF(trim(source_url), ''), '') <> '' THEN TRUE
      ELSE FALSE
    END AS has_verified_ingredients,
    CASE
      WHEN image_url IS NOT NULL
        AND image_url !~* '^data:'
        AND image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
        AND COALESCE(NULLIF(trim(source_url), ''), '') <> '' THEN TRUE
      ELSE FALSE
    END AS has_verified_image,
    CASE
      WHEN pet_type IN ('dog', 'cat') THEN pet_type
      WHEN lower(concat_ws(' ', product_name, brand)) ~ '\\m(dog|puppy|canine)\\M' THEN 'dog'
      WHEN lower(concat_ws(' ', product_name, brand)) ~ '\\m(cat|kitten|feline)\\M' THEN 'cat'
      ELSE 'unknown'
    END AS inferred_pet_type
  FROM ready
),
brand_gaps AS (
  SELECT
    COALESCE(brand, '[unknown brand]') AS brand,
    count(*) AS ready_rows,
    count(*) FILTER (WHERE NOT has_verified_ingredients) AS needs_verified_ingredients,
    count(*) FILTER (WHERE NOT has_verified_image) AS needs_verified_image,
    count(*) FILTER (WHERE image_url IS NULL OR image_url ~* '^data:') AS missing_image,
    count(*) FILTER (WHERE inferred_pet_type = 'unknown') AS unknown_pet_type,
    count(*) FILTER (WHERE inferred_pet_type = 'dog') AS dog_rows,
    count(*) FILTER (WHERE inferred_pet_type = 'cat') AS cat_rows,
    array_agg(DISTINCT source ORDER BY source) FILTER (WHERE source IS NOT NULL) AS sources,
    (
      count(*) FILTER (WHERE NOT has_verified_ingredients) * 5
      + count(*) FILTER (WHERE NOT has_verified_image) * 2
      + count(*) FILTER (WHERE inferred_pet_type = 'unknown') * 2
      + count(*)
    ) AS priority_score
  FROM classified
  GROUP BY COALESCE(brand, '[unknown brand]')
  HAVING count(*) FILTER (WHERE NOT has_verified_ingredients OR NOT has_verified_image OR inferred_pet_type = 'unknown') > 0
  ORDER BY priority_score DESC, ready_rows DESC
  LIMIT ${brandLimit}
),
product_gaps AS (
  SELECT
    cache_key,
    product_name,
    COALESCE(brand, '[unknown brand]') AS brand,
    source,
    source_quality,
    inferred_pet_type,
    ingredient_verification_status,
    image_verification_status,
    (image_url IS NOT NULL AND image_url !~* '^data:') AS has_image,
    source_url,
    (
      CASE WHEN NOT has_verified_ingredients THEN 5 ELSE 0 END
      + CASE WHEN NOT has_verified_image THEN 2 ELSE 0 END
      + CASE WHEN inferred_pet_type = 'unknown' THEN 2 ELSE 0 END
    ) AS gap_score
  FROM classified
  WHERE NOT has_verified_ingredients
     OR NOT has_verified_image
     OR inferred_pet_type = 'unknown'
  ORDER BY gap_score DESC, brand, product_name
  LIMIT ${productLimit}
),
lookup_gaps AS (
  SELECT
    metadata->>'normalized_query' AS normalized_query,
    count(*) AS events,
    max(created_at) AS last_seen_at,
    max(COALESCE(metadata->>'verification_gap_reasons', metadata->>'miss_reason')) AS sample_reason,
    max(COALESCE((metadata->>'result_count')::int, 0)) AS max_result_count,
    max(COALESCE((metadata->>'image_result_count')::int, 0)) AS max_image_result_count,
    max(COALESCE((metadata->>'product_gap_count')::int, 0)) AS max_product_gap_count,
    max(COALESCE((metadata->>'needs_verified_ingredient_count')::int, 0)) AS max_needs_verified_ingredient_count,
    max(COALESCE((metadata->>'needs_verified_image_count')::int, 0)) AS max_needs_verified_image_count,
    max(COALESCE((metadata->>'unknown_pet_type_count')::int, 0)) AS max_unknown_pet_type_count
  FROM public.product_events
  WHERE created_at >= now() - interval '${days} days'
    AND event_name IN ('catalog_lookup_miss', 'catalog_lookup_failed', 'catalog_lookup_completed', 'catalog_verification_gap')
  GROUP BY metadata->>'normalized_query'
  HAVING count(*) FILTER (
    WHERE event_name = 'catalog_verification_gap'
       OR event_name <> 'catalog_lookup_completed'
       OR COALESCE((metadata->>'image_result_count')::int, 0) = 0
       OR COALESCE((metadata->>'product_gap_count')::int, 0) > 0
  ) > 0
  ORDER BY events DESC, last_seen_at DESC
  LIMIT ${eventLimit}
)
SELECT jsonb_build_object(
  'brand_gaps', (SELECT jsonb_agg(to_jsonb(brand_gaps.*)) FROM brand_gaps),
  'product_gaps', (SELECT jsonb_agg(to_jsonb(product_gaps.*)) FROM product_gaps),
  'lookup_gaps', (SELECT jsonb_agg(to_jsonb(lookup_gaps.*)) FROM lookup_gaps)
) AS catalog_verification_gaps;`.trim();
}

async function fetchAll(client, table, select, configure) {
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = client
      .from(table)
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1);

    query = configure ? configure(query) : query;
    const { data, error } = await query;
    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

function isReady(row) {
  return (
    new Date(row.expires_at).getTime() > Date.now() &&
    Number(row.ingredient_count || 0) >= 5 &&
    row.is_complete_food === true &&
    row.catalog_exclusion_reason === null
  );
}

function hasImage(row) {
  return Boolean(row.image_url && !/^data:/i.test(row.image_url));
}

function hasSourceEvidence(row) {
  return Boolean(String(row.source_url || "").trim());
}

function hasVerifiedIngredients(row) {
  return hasSourceEvidence(row) && VERIFIED_INGREDIENT_STATUSES.has(String(row.ingredient_verification_status || "").toLowerCase());
}

function hasVerifiedImage(row) {
  return hasSourceEvidence(row) && hasImage(row) && VERIFIED_IMAGE_STATUSES.has(String(row.image_verification_status || "").toLowerCase());
}

function inferredPetType(row) {
  if (row.pet_type === "dog" || row.pet_type === "cat") return row.pet_type;

  const text = `${row.product_name || ""} ${row.brand || ""}`.toLowerCase();
  if (/\b(dog|puppy|canine)\b/.test(text)) return "dog";
  if (/\b(cat|kitten|feline)\b/.test(text)) return "cat";
  return "unknown";
}

function acquisitionNeed(row) {
  const needs = [];
  if (row.needsVerifiedIngredients > 0) needs.push("official/manufacturer ingredients");
  if (row.needsVerifiedImage > 0) needs.push("verified product images");
  if (row.unknownPetType > 0) needs.push("pet-type taxonomy");
  return needs.join(" + ");
}

function summarizeBrands(rows, limit) {
  const byBrand = new Map();

  for (const row of rows.filter(isReady)) {
    const brand = compact(row.brand) || "[unknown brand]";
    const petType = inferredPetType(row);
    const stats = byBrand.get(brand) || {
      brand,
      readyRows: 0,
      needsVerifiedIngredients: 0,
      needsVerifiedImage: 0,
      missingImage: 0,
      unknownPetType: 0,
      dogRows: 0,
      catRows: 0,
      sources: new Set(),
    };

    stats.readyRows += 1;
    if (!hasVerifiedIngredients(row)) stats.needsVerifiedIngredients += 1;
    if (!hasVerifiedImage(row)) stats.needsVerifiedImage += 1;
    if (!hasImage(row)) stats.missingImage += 1;
    if (petType === "unknown") stats.unknownPetType += 1;
    if (petType === "dog") stats.dogRows += 1;
    if (petType === "cat") stats.catRows += 1;
    if (row.source) stats.sources.add(row.source);
    byBrand.set(brand, stats);
  }

  return [...byBrand.values()]
    .filter((row) => row.needsVerifiedIngredients > 0 || row.needsVerifiedImage > 0 || row.unknownPetType > 0)
    .map((row) => ({
      brand: row.brand,
      readyRows: row.readyRows,
      needsVerifiedIngredients: row.needsVerifiedIngredients,
      needsVerifiedImage: row.needsVerifiedImage,
      missingImage: row.missingImage,
      unknownPetType: row.unknownPetType,
      dogRows: row.dogRows,
      catRows: row.catRows,
      sources: [...row.sources].sort().slice(0, 5).join(", "),
      acquisitionNeed: acquisitionNeed(row),
      priorityScore: row.needsVerifiedIngredients * 5 + row.needsVerifiedImage * 2 + row.unknownPetType * 2 + row.readyRows,
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore || right.readyRows - left.readyRows)
    .slice(0, limit);
}

function summarizeProducts(rows, limit) {
  return rows
    .filter(isReady)
    .map((row) => {
      const petType = inferredPetType(row);
      const needsVerifiedIngredients = !hasVerifiedIngredients(row);
      const needsVerifiedImage = !hasVerifiedImage(row);
      const unknownPetType = petType === "unknown";
      return {
        cacheKey: row.cache_key,
        productName: row.product_name,
        brand: compact(row.brand) || "[unknown brand]",
        source: row.source || "unknown",
        sourceQuality: row.source_quality || "unknown",
        petType,
        ingredientStatus: row.ingredient_verification_status || "unverified",
        imageStatus: row.image_verification_status || "unverified",
        hasImage: hasImage(row),
        gapScore: (needsVerifiedIngredients ? 5 : 0) + (needsVerifiedImage ? 2 : 0) + (unknownPetType ? 2 : 0),
        sourceUrl: row.source_url || null,
      };
    })
    .filter((row) => row.gapScore > 0)
    .sort((left, right) => right.gapScore - left.gapScore || left.brand.localeCompare(right.brand) || left.productName.localeCompare(right.productName))
    .slice(0, limit);
}

async function lookupGaps(client, { days, limit }) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const events = await fetchAll(
    client,
    "product_events",
    "created_at,event_name,metadata",
    (query) => query
      .in("event_name", ["catalog_lookup_completed", "catalog_lookup_miss", "catalog_lookup_failed", "catalog_verification_gap"])
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000)
  );
  const byQuery = new Map();

  for (const event of events) {
    const metadata = event.metadata || {};
    const query = compact(metadata.normalized_query) || "[blank]";
    const imageResultCount = Number(metadata.image_result_count || 0);
    const productGapCount = Number(metadata.product_gap_count || 0);
    const isGap = event.event_name === "catalog_verification_gap" ||
      event.event_name !== "catalog_lookup_completed" ||
      imageResultCount === 0 ||
      productGapCount > 0;
    if (!isGap) continue;

    const stats = byQuery.get(query) || {
      query,
      events: 0,
      lastSeenAt: event.created_at,
      sampleReason: Array.isArray(metadata.verification_gap_reasons)
        ? metadata.verification_gap_reasons.join(", ")
        : (metadata.miss_reason || "none"),
      maxResultCount: 0,
      maxImageResultCount: 0,
      maxProductGapCount: 0,
      maxNeedsVerifiedIngredientCount: 0,
      maxNeedsVerifiedImageCount: 0,
      maxUnknownPetTypeCount: 0,
    };

    stats.events += 1;
    if (event.created_at > stats.lastSeenAt) stats.lastSeenAt = event.created_at;
    stats.maxResultCount = Math.max(stats.maxResultCount, Number(metadata.result_count || 0));
    stats.maxImageResultCount = Math.max(stats.maxImageResultCount, imageResultCount);
    stats.maxProductGapCount = Math.max(stats.maxProductGapCount, productGapCount);
    stats.maxNeedsVerifiedIngredientCount = Math.max(
      stats.maxNeedsVerifiedIngredientCount,
      Number(metadata.needs_verified_ingredient_count || 0)
    );
    stats.maxNeedsVerifiedImageCount = Math.max(
      stats.maxNeedsVerifiedImageCount,
      Number(metadata.needs_verified_image_count || 0)
    );
    stats.maxUnknownPetTypeCount = Math.max(
      stats.maxUnknownPetTypeCount,
      Number(metadata.unknown_pet_type_count || 0)
    );
    byQuery.set(query, stats);
  }

  return [...byQuery.values()]
    .sort((left, right) => right.events - left.events || String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)))
    .slice(0, limit);
}

function printReport({ brandRows, productRows, eventRows, days }) {
  console.log("Catalog verification gap report");
  console.log(`Recent lookup window: ${days} day(s)`);

  console.log("\nTop brand acquisition priorities:");
  console.table(brandRows);

  console.log("\nTop product records needing verification:");
  console.table(productRows);

  if (eventRows.length > 0) {
    console.log("\nRecent lookup/image gaps:");
    console.table(eventRows);
  } else {
    console.log("\nRecent lookup/image gaps: none logged in the selected window.");
  }
}

async function main() {
  const days = positiveNumber(getArg("--days"), DEFAULT_DAYS);
  const brandLimit = positiveNumber(getArg("--brand-limit"), DEFAULT_BRAND_LIMIT);
  const productLimit = positiveNumber(getArg("--product-limit"), DEFAULT_PRODUCT_LIMIT);
  const eventLimit = positiveNumber(getArg("--event-limit"), DEFAULT_EVENT_LIMIT);
  const json = hasArg("--json");
  const client = clientFromEnv();

  if (!client) {
    console.log("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    console.log("Use this SQL instead:\n");
    console.log(fallbackSql({ days, brandLimit, productLimit, eventLimit }));
    return;
  }

  const rows = await fetchAll(
    client,
    "product_data",
    [
      "cache_key",
      "product_name",
      "brand",
      "source",
      "source_quality",
      "pet_type",
      "image_url",
      "ingredient_count",
      "ingredient_verification_status",
      "image_verification_status",
      "is_complete_food",
      "catalog_exclusion_reason",
      "expires_at",
      "source_url",
    ].join(",")
  );
  const brandRows = summarizeBrands(rows, brandLimit);
  const productRows = summarizeProducts(rows, productLimit);
  const eventRows = await lookupGaps(client, { days, limit: eventLimit });

  if (json) {
    console.log(JSON.stringify({ brandRows, productRows, eventRows, days }, null, 2));
  } else {
    printReport({ brandRows, productRows, eventRows, days });
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
