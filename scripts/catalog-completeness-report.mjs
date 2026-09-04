import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const DEFAULT_DAYS = 30;
const DEFAULT_MIN_READY_PRODUCTS = 12000;
const DEFAULT_MIN_IMAGE_RATE = 0.9;
const DEFAULT_MIN_READY_BRANDS = 750;
const DEFAULT_MIN_DOG_PRODUCTS = 5000;
const DEFAULT_MIN_CAT_PRODUCTS = 3000;
const DEFAULT_MAX_UNKNOWN_PET_TYPE_RATE = 0.05;
const DEFAULT_MIN_VERIFIED_INGREDIENT_RATE = 1;
const DEFAULT_MIN_VERIFIED_IMAGE_RATE = 0.95;
const DEFAULT_MIN_STRUCTURED_IDENTITY_RATE = 0.95;
const DEFAULT_MAX_OPEN_QUEUE_ROWS = 0;
const DEFAULT_MAX_OPEN_QUEUE_AFFECTED_PRODUCTS = 0;
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

function fallbackSql({
  days,
  minReadyProducts,
  minImageRate,
  minReadyBrands,
  minDogProducts,
  minCatProducts,
  maxUnknownPetTypeRate,
  minVerifiedIngredientRate,
  minVerifiedImageRate,
  minStructuredIdentityRate,
  maxOpenQueueRows,
  maxOpenQueueAffectedProducts,
}) {
  return `
-- Run in Supabase SQL Editor with a privileged role.
WITH ready AS (
  SELECT *
  FROM public.product_data
  WHERE expires_at > now()
    AND ingredient_count >= 5
    AND is_complete_food = TRUE
    AND catalog_exclusion_reason IS NULL
),
summary AS (
  SELECT
    (SELECT count(*) FROM public.product_data) AS total_rows,
    count(*) AS ready_rows,
    count(*) FILTER (WHERE image_url IS NOT NULL AND image_url !~* '^data:') AS ready_with_image,
    count(*) FILTER (
      WHERE ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
        AND COALESCE(NULLIF(trim(ingredient_text), ''), '') <> ''
        AND COALESCE(NULLIF(trim(source_url), ''), '') <> ''
    ) AS ready_with_verified_ingredients,
    count(*) FILTER (
      WHERE image_url IS NOT NULL
        AND image_url !~* '^data:'
        AND image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
        AND COALESCE(NULLIF(trim(source_url), ''), '') <> ''
    ) AS ready_with_verified_image,
    count(*) FILTER (
      WHERE COALESCE(
        NULLIF(trim(gtin), ''),
        NULLIF(trim(product_line), ''),
        NULLIF(trim(flavor), ''),
        NULLIF(trim(life_stage), ''),
        NULLIF(trim(food_form), '')
      ) IS NOT NULL
    ) AS ready_with_structured_identity,
    count(DISTINCT nullif(trim(brand), '')) AS ready_brands,
    count(*) FILTER (
      WHERE pet_type = 'dog'
        OR (
          lower(concat_ws(' ', product_name, brand, cache_key, source_url)) ~ '\\m(dog|dogs|puppy|puppies|canine|canines|pup)\\M'
          AND lower(concat_ws(' ', product_name, brand, cache_key, source_url)) !~ '\\m(cat|cats|kitten|kittens|feline|felines|kitty)\\M'
        )
    ) AS ready_dog_rows,
    count(*) FILTER (
      WHERE pet_type = 'cat'
        OR (
          lower(concat_ws(' ', product_name, brand, cache_key, source_url)) ~ '\\m(cat|cats|kitten|kittens|feline|felines|kitty)\\M'
          AND lower(concat_ws(' ', product_name, brand, cache_key, source_url)) !~ '\\m(dog|dogs|puppy|puppies|canine|canines|pup)\\M'
        )
    ) AS ready_cat_rows,
    count(*) FILTER (
      WHERE COALESCE(pet_type, 'unknown') NOT IN ('dog', 'cat')
        AND lower(concat_ws(' ', product_name, brand, cache_key, source_url)) !~ '\\m(dog|dogs|puppy|puppies|canine|canines|pup|cat|cats|kitten|kittens|feline|felines|kitty)\\M'
    ) AS ready_unknown_pet_type_rows,
    round(
      count(*) FILTER (WHERE image_url IS NOT NULL AND image_url !~* '^data:')::numeric
      / greatest(count(*), 1),
      4
    ) AS image_rate,
    round(
      count(*) FILTER (
        WHERE ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
          AND COALESCE(NULLIF(trim(ingredient_text), ''), '') <> ''
          AND COALESCE(NULLIF(trim(source_url), ''), '') <> ''
      )::numeric
      / greatest(count(*), 1),
      4
    ) AS verified_ingredient_rate,
    round(
      count(*) FILTER (
        WHERE image_url IS NOT NULL
          AND image_url !~* '^data:'
          AND image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
          AND COALESCE(NULLIF(trim(source_url), ''), '') <> ''
      )::numeric
      / greatest(count(*), 1),
      4
    ) AS verified_image_rate,
    round(
      count(*) FILTER (
        WHERE COALESCE(
          NULLIF(trim(gtin), ''),
          NULLIF(trim(product_line), ''),
          NULLIF(trim(flavor), ''),
          NULLIF(trim(life_stage), ''),
          NULLIF(trim(food_form), '')
        ) IS NOT NULL
      )::numeric
      / greatest(count(*), 1),
      4
    ) AS structured_identity_rate,
    round(
      count(*) FILTER (
      WHERE COALESCE(pet_type, 'unknown') NOT IN ('dog', 'cat')
        AND lower(concat_ws(' ', product_name, brand, cache_key, source_url)) !~ '\\m(dog|dogs|puppy|puppies|canine|canines|pup|cat|cats|kitten|kittens|feline|felines|kitty)\\M'
    )::numeric
      / greatest(count(*), 1),
      4
    ) AS unknown_pet_type_rate
  FROM ready
),
source_breakdown AS (
  SELECT
    source,
    count(*) AS ready_rows,
    count(*) FILTER (WHERE image_url IS NULL OR image_url ~* '^data:') AS missing_images,
    count(*) FILTER (
      WHERE ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
        AND COALESCE(NULLIF(trim(source_url), ''), '') <> ''
    ) AS verified_ingredient_rows,
    count(*) FILTER (
      WHERE image_url IS NOT NULL
        AND image_url !~* '^data:'
        AND image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
        AND COALESCE(NULLIF(trim(source_url), ''), '') <> ''
    ) AS verified_image_rows,
    count(DISTINCT nullif(trim(brand), '')) AS brands
  FROM ready
  GROUP BY source
  ORDER BY ready_rows DESC
),
queue_summary AS (
  SELECT
    count(*) FILTER (WHERE status IN ('open', 'in_progress')) AS open_queue_rows,
    COALESCE(
      sum(affected_product_count) FILTER (WHERE status IN ('open', 'in_progress')),
      0
    ) AS open_queue_affected_products,
    count(*) FILTER (
      WHERE status IN ('open', 'in_progress')
        AND needs_verified_ingredients
    ) AS open_queue_needs_verified_ingredients,
    count(*) FILTER (
      WHERE status IN ('open', 'in_progress')
        AND needs_verified_image
    ) AS open_queue_needs_verified_image,
    count(*) FILTER (
      WHERE status IN ('open', 'in_progress')
        AND needs_pet_type
    ) AS open_queue_needs_pet_type
  FROM public.catalog_acquisition_queue
),
coverage_gaps AS (
  SELECT
    metadata->>'normalized_query' AS normalized_query,
    count(*) AS events,
    max(created_at) AS last_seen_at,
    max(COALESCE(metadata->>'verification_gap_reasons', metadata->>'miss_reason')) AS sample_reason,
    max(COALESCE((metadata->>'product_gap_count')::int, 0)) AS max_product_gap_count,
    max(COALESCE((metadata->>'needs_verified_ingredient_count')::int, 0)) AS max_needs_verified_ingredient_count,
    max(COALESCE((metadata->>'needs_verified_image_count')::int, 0)) AS max_needs_verified_image_count,
    max(COALESCE((metadata->>'unknown_pet_type_count')::int, 0)) AS max_unknown_pet_type_count
  FROM public.product_events
  WHERE created_at >= now() - interval '${days} days'
    AND event_name IN ('catalog_lookup_miss', 'catalog_lookup_failed', 'catalog_verification_gap')
  GROUP BY metadata->>'normalized_query'
  ORDER BY events DESC, last_seen_at DESC
  LIMIT 25
)
SELECT jsonb_build_object(
  'thresholds', jsonb_build_object(
    'min_ready_products', ${minReadyProducts},
    'min_image_rate', ${minImageRate},
    'min_ready_brands', ${minReadyBrands},
    'min_dog_products', ${minDogProducts},
    'min_cat_products', ${minCatProducts},
    'max_unknown_pet_type_rate', ${maxUnknownPetTypeRate},
    'min_verified_ingredient_rate', ${minVerifiedIngredientRate},
    'min_verified_image_rate', ${minVerifiedImageRate},
    'min_structured_identity_rate', ${minStructuredIdentityRate},
    'max_open_queue_rows', ${maxOpenQueueRows},
    'max_open_queue_affected_products', ${maxOpenQueueAffectedProducts}
  ),
  'summary', (SELECT to_jsonb(summary.*) FROM summary),
  'queue_summary', (SELECT to_jsonb(queue_summary.*) FROM queue_summary),
  'source_breakdown', (SELECT jsonb_agg(to_jsonb(source_breakdown.*)) FROM source_breakdown),
  'coverage_gaps', (SELECT jsonb_agg(to_jsonb(coverage_gaps.*)) FROM coverage_gaps)
) AS catalog_completeness;`.trim();
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

function hasIngredientText(row) {
  return Boolean(String(row.ingredient_text || "").trim());
}

function hasVerifiedIngredients(row) {
  return (
    hasSourceEvidence(row)
    && hasIngredientText(row)
    && VERIFIED_INGREDIENT_STATUSES.has(String(row.ingredient_verification_status || "").toLowerCase())
  );
}

function hasVerifiedImage(row) {
  return hasSourceEvidence(row) && hasImage(row) && VERIFIED_IMAGE_STATUSES.has(String(row.image_verification_status || "").toLowerCase());
}

function hasStructuredIdentity(row) {
  return Boolean(
    String(row.gtin || "").trim()
      || String(row.product_line || "").trim()
      || String(row.flavor || "").trim()
      || String(row.life_stage || "").trim()
      || String(row.food_form || "").trim()
  );
}

function inferredPetType(row) {
  if (row.pet_type === "dog" || row.pet_type === "cat") return row.pet_type;

  const text = String(`${row.product_name || ""} ${row.brand || ""} ${row.cache_key || ""} ${row.source_url || ""}`).toLowerCase();
  const hasDog = /\b(dog|dogs|puppy|puppies|canine|canines|pup)\b/.test(text);
  const hasCat = /\b(cat|cats|kitten|kittens|feline|felines|kitty)\b/.test(text);

  if (hasDog && !hasCat) return "dog";
  if (hasCat && !hasDog) return "cat";
  return "unknown";
}

function summarizeRows(rows) {
  const ready = rows.filter(isReady);
  const readyWithImage = ready.filter(hasImage);
  const readyWithVerifiedIngredients = ready.filter(hasVerifiedIngredients);
  const readyWithVerifiedImage = ready.filter(hasVerifiedImage);
  const readyWithStructuredIdentity = ready.filter(hasStructuredIdentity);
  const readyBrands = new Set(ready.map((row) => String(row.brand || "").trim()).filter(Boolean));
  const petTypeBreakdown = {
    dog: ready.filter((row) => inferredPetType(row) === "dog").length,
    cat: ready.filter((row) => inferredPetType(row) === "cat").length,
    unknown: ready.filter((row) => inferredPetType(row) === "unknown").length,
  };
  const sourceMap = new Map();

  for (const row of ready) {
    const source = row.source || "unknown";
    const stats = sourceMap.get(source) || {
      source,
      readyRows: 0,
      missingImages: 0,
      verifiedIngredientRows: 0,
      verifiedImageRows: 0,
      brands: new Set(),
    };

    stats.readyRows += 1;
    if (!hasImage(row)) stats.missingImages += 1;
    if (hasVerifiedIngredients(row)) stats.verifiedIngredientRows += 1;
    if (hasVerifiedImage(row)) stats.verifiedImageRows += 1;
    if (String(row.brand || "").trim()) stats.brands.add(String(row.brand).trim());
    sourceMap.set(source, stats);
  }

  return {
    totalRows: rows.length,
    readyRows: ready.length,
    readyWithImage: readyWithImage.length,
    readyWithVerifiedIngredients: readyWithVerifiedIngredients.length,
    readyWithVerifiedImage: readyWithVerifiedImage.length,
    readyWithStructuredIdentity: readyWithStructuredIdentity.length,
    readyBrands: readyBrands.size,
    imageRate: ready.length > 0 ? readyWithImage.length / ready.length : 0,
    verifiedIngredientRate: ready.length > 0 ? readyWithVerifiedIngredients.length / ready.length : 0,
    verifiedImageRate: ready.length > 0 ? readyWithVerifiedImage.length / ready.length : 0,
    structuredIdentityRate: ready.length > 0 ? readyWithStructuredIdentity.length / ready.length : 0,
    unknownPetTypeRate: ready.length > 0 ? petTypeBreakdown.unknown / ready.length : 0,
    petTypeBreakdown,
    sourceBreakdown: [...sourceMap.values()]
      .map((stats) => ({
        source: stats.source,
        readyRows: stats.readyRows,
        missingImages: stats.missingImages,
        verifiedIngredientRows: stats.verifiedIngredientRows,
        verifiedImageRows: stats.verifiedImageRows,
        brands: stats.brands.size,
      }))
      .sort((left, right) => right.readyRows - left.readyRows),
  };
}

function summarizeQueueRows(rows) {
  const openRows = rows.filter((row) => ["open", "in_progress"].includes(row.status));

  return {
    openQueueRows: openRows.length,
    openQueueAffectedProducts: openRows.reduce((sum, row) => sum + Number(row.affected_product_count || 0), 0),
    openQueueNeedsVerifiedIngredients: openRows.filter((row) => row.needs_verified_ingredients).length,
    openQueueNeedsVerifiedImage: openRows.filter((row) => row.needs_verified_image).length,
    openQueueNeedsPetType: openRows.filter((row) => row.needs_pet_type).length,
  };
}

async function coverageGaps(client, days) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const events = await fetchAll(
    client,
    "product_events",
    "created_at,event_name,metadata",
    (query) => query
      .in("event_name", ["catalog_lookup_miss", "catalog_lookup_failed", "catalog_verification_gap"])
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000)
  );
  const byQuery = new Map();

  for (const event of events) {
    const query = String(event.metadata?.normalized_query || "").trim() || "[blank]";
    const stats = byQuery.get(query) || {
      query,
      events: 0,
      lastSeenAt: event.created_at,
      sampleReason: Array.isArray(event.metadata?.verification_gap_reasons)
        ? event.metadata.verification_gap_reasons.join(", ")
        : (event.metadata?.miss_reason || "unknown"),
      maxProductGapCount: 0,
      maxNeedsVerifiedIngredientCount: 0,
      maxNeedsVerifiedImageCount: 0,
      maxUnknownPetTypeCount: 0,
    };

    stats.events += 1;
    if (event.created_at > stats.lastSeenAt) stats.lastSeenAt = event.created_at;
    stats.maxProductGapCount = Math.max(stats.maxProductGapCount, Number(event.metadata?.product_gap_count || 0));
    stats.maxNeedsVerifiedIngredientCount = Math.max(
      stats.maxNeedsVerifiedIngredientCount,
      Number(event.metadata?.needs_verified_ingredient_count || 0)
    );
    stats.maxNeedsVerifiedImageCount = Math.max(
      stats.maxNeedsVerifiedImageCount,
      Number(event.metadata?.needs_verified_image_count || 0)
    );
    stats.maxUnknownPetTypeCount = Math.max(
      stats.maxUnknownPetTypeCount,
      Number(event.metadata?.unknown_pet_type_count || 0)
    );
    byQuery.set(query, stats);
  }

  return [...byQuery.values()]
    .sort((left, right) => right.events - left.events || String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)))
    .slice(0, 25);
}

function printReport({ summary, queueSummary, gaps, thresholds }) {
  console.log("Catalog completeness report");
  console.log(`Total product_data rows: ${summary.totalRows}`);
  console.log(`Ready complete dog/cat food rows: ${summary.readyRows}`);
  console.log(`Ready rows with images: ${summary.readyWithImage}`);
  console.log(`Image rate: ${(summary.imageRate * 100).toFixed(1)}%`);
  console.log(`Ready rows with verified ingredients: ${summary.readyWithVerifiedIngredients}`);
  console.log(`Verified ingredient rate: ${(summary.verifiedIngredientRate * 100).toFixed(1)}%`);
  console.log(`Ready rows with verified images: ${summary.readyWithVerifiedImage}`);
  console.log(`Verified image rate: ${(summary.verifiedImageRate * 100).toFixed(1)}%`);
  console.log(`Ready rows with structured identity: ${summary.readyWithStructuredIdentity}`);
  console.log(`Structured identity rate: ${(summary.structuredIdentityRate * 100).toFixed(1)}%`);
  console.log(`Ready brands: ${summary.readyBrands}`);
  console.log(`Dog rows: ${summary.petTypeBreakdown.dog}`);
  console.log(`Cat rows: ${summary.petTypeBreakdown.cat}`);
  console.log(`Unknown pet-type rows: ${summary.petTypeBreakdown.unknown}`);
  console.log(`Unknown pet-type rate: ${(summary.unknownPetTypeRate * 100).toFixed(1)}%`);

  console.log("\nOpen acquisition queue:");
  console.table([queueSummary]);

  console.log("\nSource breakdown:");
  console.table(summary.sourceBreakdown);

  if (gaps.length > 0) {
    console.log("\nRecent lookup gaps:");
    console.table(gaps);
  } else {
    console.log("\nRecent lookup gaps: none logged in the selected window.");
  }

  console.log("\nThresholds:");
  console.table([thresholds]);
}

function failingChecks(summary, queueSummary, thresholds) {
  const failures = [];
  if (summary.readyRows < thresholds.minReadyProducts) {
    failures.push(`ready products ${summary.readyRows} < ${thresholds.minReadyProducts}`);
  }
  if (summary.imageRate < thresholds.minImageRate) {
    failures.push(`image rate ${(summary.imageRate * 100).toFixed(1)}% < ${(thresholds.minImageRate * 100).toFixed(1)}%`);
  }
  if (summary.readyBrands < thresholds.minReadyBrands) {
    failures.push(`ready brands ${summary.readyBrands} < ${thresholds.minReadyBrands}`);
  }
  if (summary.verifiedIngredientRate < thresholds.minVerifiedIngredientRate) {
    failures.push(`verified ingredient rate ${(summary.verifiedIngredientRate * 100).toFixed(1)}% < ${(thresholds.minVerifiedIngredientRate * 100).toFixed(1)}%`);
  }
  if (summary.verifiedImageRate < thresholds.minVerifiedImageRate) {
    failures.push(`verified image rate ${(summary.verifiedImageRate * 100).toFixed(1)}% < ${(thresholds.minVerifiedImageRate * 100).toFixed(1)}%`);
  }
  if (summary.structuredIdentityRate < thresholds.minStructuredIdentityRate) {
    failures.push(`structured identity rate ${(summary.structuredIdentityRate * 100).toFixed(1)}% < ${(thresholds.minStructuredIdentityRate * 100).toFixed(1)}%`);
  }
  if (summary.petTypeBreakdown.dog < thresholds.minDogProducts) {
    failures.push(`ready dog products ${summary.petTypeBreakdown.dog} < ${thresholds.minDogProducts}`);
  }
  if (summary.petTypeBreakdown.cat < thresholds.minCatProducts) {
    failures.push(`ready cat products ${summary.petTypeBreakdown.cat} < ${thresholds.minCatProducts}`);
  }
  if (summary.unknownPetTypeRate > thresholds.maxUnknownPetTypeRate) {
    failures.push(
      `unknown pet-type rate ${(summary.unknownPetTypeRate * 100).toFixed(1)}% > ${(thresholds.maxUnknownPetTypeRate * 100).toFixed(1)}%`
    );
  }
  if (queueSummary.openQueueRows > thresholds.maxOpenQueueRows) {
    failures.push(`open acquisition queue rows ${queueSummary.openQueueRows} > ${thresholds.maxOpenQueueRows}`);
  }
  if (queueSummary.openQueueAffectedProducts > thresholds.maxOpenQueueAffectedProducts) {
    failures.push(`open acquisition queue affected products ${queueSummary.openQueueAffectedProducts} > ${thresholds.maxOpenQueueAffectedProducts}`);
  }
  return failures;
}

async function main() {
  const thresholds = {
    minReadyProducts: positiveNumber(getArg("--min-ready-products"), DEFAULT_MIN_READY_PRODUCTS),
    minImageRate: positiveNumber(getArg("--min-image-rate"), DEFAULT_MIN_IMAGE_RATE),
    minReadyBrands: positiveNumber(getArg("--min-ready-brands"), DEFAULT_MIN_READY_BRANDS),
    minDogProducts: positiveNumber(getArg("--min-dog-products"), DEFAULT_MIN_DOG_PRODUCTS),
    minCatProducts: positiveNumber(getArg("--min-cat-products"), DEFAULT_MIN_CAT_PRODUCTS),
    maxUnknownPetTypeRate: positiveNumber(getArg("--max-unknown-pet-type-rate"), DEFAULT_MAX_UNKNOWN_PET_TYPE_RATE),
    minVerifiedIngredientRate: positiveNumber(getArg("--min-verified-ingredient-rate"), DEFAULT_MIN_VERIFIED_INGREDIENT_RATE),
    minVerifiedImageRate: positiveNumber(getArg("--min-verified-image-rate"), DEFAULT_MIN_VERIFIED_IMAGE_RATE),
    minStructuredIdentityRate: positiveNumber(getArg("--min-structured-identity-rate"), DEFAULT_MIN_STRUCTURED_IDENTITY_RATE),
    maxOpenQueueRows: positiveNumber(getArg("--max-open-queue-rows"), DEFAULT_MAX_OPEN_QUEUE_ROWS),
    maxOpenQueueAffectedProducts: positiveNumber(
      getArg("--max-open-queue-affected-products"),
      DEFAULT_MAX_OPEN_QUEUE_AFFECTED_PRODUCTS
    ),
  };
  const days = positiveNumber(getArg("--days"), DEFAULT_DAYS);
  const reportOnly = hasArg("--report-only");
  const json = hasArg("--json");
  const client = clientFromEnv();

  if (!client) {
    console.log("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    console.log("Use this SQL instead:\n");
    console.log(fallbackSql({ days, ...thresholds }));
    process.exit(reportOnly ? 0 : 1);
  }

  const rows = await fetchAll(
    client,
    "product_data",
    "cache_key,product_name,brand,source,source_url,pet_type,image_url,ingredient_count,is_complete_food,catalog_exclusion_reason,expires_at"
      + ",gtin,product_line,flavor,life_stage,food_form,package_size"
      + ",ingredient_text,ingredient_verification_status,image_verification_status"
  );
  const queueRows = await fetchAll(
    client,
    "catalog_acquisition_queue",
    "status,affected_product_count,needs_verified_ingredients,needs_verified_image,needs_pet_type"
  );
  const summary = summarizeRows(rows);
  const queueSummary = summarizeQueueRows(queueRows);
  const gaps = await coverageGaps(client, days);
  const failures = failingChecks(summary, queueSummary, thresholds);

  if (json) {
    console.log(JSON.stringify({ summary, queueSummary, gaps, thresholds, failures }, null, 2));
  } else {
    printReport({ summary, queueSummary, gaps, thresholds });
  }

  if (failures.length > 0 && !reportOnly) {
    console.error(`Catalog completeness failed: ${failures.join("; ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
