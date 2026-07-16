import fs from "node:fs";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_LIMIT = 250;
const FEED_HEADERS = [
  "gtin",
  "product_name",
  "brand",
  "product_line",
  "flavor",
  "life_stage",
  "food_form",
  "package_size",
  "pet_type",
  "ingredient_statement",
  "product_image_url",
  "product_url",
  "is_complete_food",
  "guaranteed_analysis",
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sqlString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function loadSourceTargets() {
  if (!fs.existsSync(SOURCE_TARGETS_PATH)) return new Map();
  const targets = JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"));
  const byBrand = new Map();

  for (const target of targets) {
    for (const value of [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])]) {
      const key = normalizeKey(value);
      if (key) byBrand.set(key, target);
    }
  }

  return byBrand;
}

function sourceQualityFor(target) {
  if (target?.sourcePriority === "gdsn") return "gdsn";
  if (target?.sourcePriority === "retailer") return "retailer_verified";
  if (target?.sourcePriority === "manufacturer") return "manufacturer";
  return "official";
}

function verificationStatusFor(sourceQuality, type) {
  if (sourceQuality === "gdsn" && type === "ingredient") return "gdsn";
  if (sourceQuality === "manufacturer") return "manufacturer";
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  return "official";
}

function targetForBrand(brand) {
  if (!brand) return null;
  return loadSourceTargets().get(normalizeKey(brand)) || null;
}

function targetComment(brand) {
  const target = targetForBrand(brand);
  if (!target) return "-- Source target: unassigned";
  const sourceSlug = target.sourceSlug || normalizeKey(target.sourceOwner || target.brand);
  const sourceQuality = sourceQualityFor(target);
  return [
    `-- Source target: ${sourceSlug}`,
    `-- Source quality: ${sourceQuality}`,
    `-- Ingredient verification: ${verificationStatusFor(sourceQuality, "ingredient")}`,
    `-- Image verification: ${verificationStatusFor(sourceQuality, "image")}`,
    `-- Access status: ${target.accessStatus || (target.discovery ? "runnable" : "requires_authorized_feed")}`,
    `-- Target URL: ${target.targetUrl || ""}`,
    `-- Import after filling required evidence:`,
    `-- node scripts/catalog-official-feed-import.mjs --file outputs/catalog-feed-templates/${sourceSlug}.csv --source ${sourceSlug} --source-quality ${sourceQuality} --ingredient-verification ${verificationStatusFor(sourceQuality, "ingredient")} --image-verification ${verificationStatusFor(sourceQuality, "image")}`,
  ].join("\n");
}

function optionalMetadataColumns(includeMetadata) {
  if (!includeMetadata) return "";
  return `,
  q.id::text AS acquisition_queue_id,
  q.priority_score,
  q.affected_product_count,
  q.needs_verified_ingredients,
  q.needs_verified_image,
  q.needs_pet_type,
  q.sample_metadata`;
}

function buildSql({ brand, limit, includeMetadata }) {
  const brandFilter = brand
    ? `\n    AND lower(trim(q.brand)) = lower(${sqlString(brand)})`
    : "";
  const brandComment = brand
    ? targetComment(brand)
    : "-- All brands. Use --brand for source-specific import command comments.";

  return `${brandComment}
-- Export this query as CSV, fill every blank evidence field from an authorized
-- source, then import through catalog-official-feed-import. Do not fill
-- ingredient_statement or product_image_url from AI output.
WITH queue_scope AS (
  SELECT
    q.*
  FROM public.catalog_acquisition_queue q
  WHERE q.status IN ('open', 'in_progress', 'imported')
    AND q.gap_type = 'product'
    AND q.product_name IS NOT NULL${brandFilter}
  ORDER BY
    q.priority_score DESC,
    q.affected_product_count DESC,
    public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
    q.updated_at DESC
  LIMIT ${limit}
)
SELECT
  ''::text AS gtin,
  q.product_name,
  q.brand,
  ''::text AS product_line,
  ''::text AS flavor,
  ''::text AS life_stage,
  ''::text AS food_form,
  ''::text AS package_size,
  CASE
    WHEN lower(COALESCE(q.pet_type, '')) IN ('dog', 'cat') THEN lower(q.pet_type)
    WHEN lower(q.product_name) ~ '\\m(dog|dogs|puppy|puppies|canine)\\M'
      AND lower(q.product_name) !~ '\\m(cat|cats|kitten|kittens|feline)\\M' THEN 'dog'
    WHEN lower(q.product_name) ~ '\\m(cat|cats|kitten|kittens|feline)\\M'
      AND lower(q.product_name) !~ '\\m(dog|dogs|puppy|puppies|canine)\\M' THEN 'cat'
    ELSE ''
  END AS pet_type,
  ''::text AS ingredient_statement,
  ''::text AS product_image_url,
  COALESCE(NULLIF(btrim(q.source_url), ''), '') AS product_url,
  'true'::text AS is_complete_food,
  ''::text AS guaranteed_analysis${optionalMetadataColumns(includeMetadata)}
FROM queue_scope q;`;
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-acquisition-feed-template-sql.mjs [--brand <brand>] [--limit 250]",
      "",
      "Prints read-only SQL that exports open acquisition product gaps as a feed",
      "template accepted by catalog-official-feed-import after exact source-backed",
      "ingredients, front image URLs, and provenance fields are filled.",
      "",
      "Options:",
      "  --brand <brand>        Restrict export to one brand/source.",
      "  --limit <n>            Rows to export. Default: 250.",
      "  --include-metadata     Add queue context columns for review tracking.",
      "",
      `Feed headers: ${FEED_HEADERS.join(", ")}`,
    ].join("\n"));
    return;
  }

  const brand = compact(getArg("--brand"));
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  const includeMetadata = hasArg("--include-metadata");

  console.log(buildSql({ brand, limit, includeMetadata }));
}

main();
