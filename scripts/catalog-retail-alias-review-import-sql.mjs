import fs from "node:fs";
import path from "node:path";

const REQUIRED_COLUMNS = [
  "queue_brand",
  "queue_product_name",
  "matched_cache_key",
  "review_decision",
  "proof_url",
];
const REVIEW_COLUMNS = [
  "queue_brand",
  "queue_product_name",
  "queue_pet_type",
  "queue_product_source",
  "alias_candidate_status",
  "matched_cache_key",
  "matched_product_name",
  "matched_pet_type",
  "matched_source",
  "matched_source_url",
  "matched_rank",
  "review_decision",
  "proof_url",
  "reviewer_notes",
];
const ACCEPTED_DECISIONS = new Set(["accept", "accepted", "approve", "approved", "yes"]);
const DEFAULT_OUTPUT_DIR = "outputs/catalog-retail-alias-review-imports/current";

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

function normalizeHeader(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function slug(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "review";
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((value) => compact(value)));
}

function readReviewRows(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  if (rows.length === 0) throw new Error(`${filePath} is empty`);

  const headers = rows[0].map(normalizeHeader);
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) {
      throw new Error(`${filePath} is missing required column: ${column}`);
    }
  }

  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, compact(values[index])])
  ));
}

function acceptedReviewRows(rows) {
  return rows.filter((row) => (
    ACCEPTED_DECISIONS.has(compact(row.review_decision).toLowerCase())
    && compact(row.queue_brand)
    && compact(row.queue_product_name)
    && compact(row.matched_cache_key)
    && compact(row.proof_url)
  ));
}

function reviewValuesSql(rows) {
  const columns = REVIEW_COLUMNS.join(", ");
  if (rows.length === 0) {
    return `SELECT * FROM (VALUES (${REVIEW_COLUMNS.map(() => "NULL::text").join(", ")})) AS v(${columns}) WHERE FALSE`;
  }

  return `VALUES\n${rows.map((row) => `  (${REVIEW_COLUMNS.map((column) => sqlString(row[column] || "")).join(", ")})`).join(",\n")}`;
}

function buildSql(rows, { apply }) {
  const valuesSql = reviewValuesSql(rows);
  const updateSql = apply ? `
, excluded_products AS (
  UPDATE public.product_data pd
  SET
    catalog_exclusion_reason = COALESCE(NULLIF(pd.catalog_exclusion_reason, ''), 'duplicate_verified_official_catalog_row'),
    updated_at = now()
  FROM validated_review_rows vr
  WHERE pd.cache_key = vr.legacy_cache_key
    AND pd.catalog_exclusion_reason IS NULL
  RETURNING pd.cache_key
),
resolved_queue AS (
  UPDATE public.catalog_acquisition_queue q
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason = 'human-reviewed retail/community alias matched verified source-backed catalog row',
    updated_at = now(),
    sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'retail_alias_review_closed_at', now(),
        'retail_alias_review_closed_by', 'catalog-retail-alias-review-import-sql',
        'matched_cache_key', vr.matched_cache_key,
        'matched_product_name', vr.matched_product_name,
        'matched_brand', vr.matched_brand,
        'matched_pet_type', vr.matched_pet_type,
        'matched_source', vr.matched_source,
        'matched_source_quality', vr.matched_source_quality,
        'matched_source_url', vr.matched_source_url,
        'proof_url', vr.proof_url,
        'reviewer_notes', vr.reviewer_notes,
        'review_decision', vr.review_decision
      )
  FROM validated_review_rows vr
  WHERE q.id = vr.queue_id
  RETURNING q.id
)` : "";
  const appliedCounts = apply ? `,
  'excluded_rows', (SELECT count(*) FROM excluded_products),
  'resolved_queue_rows', (SELECT count(*) FROM resolved_queue)` : "";

  return `${apply ? "BEGIN;\n\n" : ""}-- ${apply ? "Apply" : "Dry-run"} human-reviewed retail/community alias queue closures.
-- This SQL never imports ingredients from retail/community rows.
-- Runtime guards require the matched row to be verified_ready with source-backed
-- ingredients, a verified front image, and a source URL.
WITH review_rows(${REVIEW_COLUMNS.join(", ")}) AS (
${valuesSql}
),
accepted_review_rows AS (
  SELECT *
  FROM review_rows
  WHERE lower(trim(review_decision)) IN ('accept', 'accepted', 'approve', 'approved', 'yes')
    AND NULLIF(trim(queue_brand), '') IS NOT NULL
    AND NULLIF(trim(queue_product_name), '') IS NOT NULL
    AND NULLIF(trim(matched_cache_key), '') IS NOT NULL
    AND NULLIF(trim(proof_url), '') IS NOT NULL
),
validated_review_rows AS (
  SELECT DISTINCT
    q.id AS queue_id,
    q.cache_key AS legacy_cache_key,
    ar.queue_brand,
    ar.queue_product_name,
    ar.queue_pet_type,
    ar.queue_product_source,
    ar.review_decision,
    ar.proof_url,
    ar.reviewer_notes,
    matched.cache_key AS matched_cache_key,
    matched.product_name AS matched_product_name,
    matched.brand AS matched_brand,
    matched.pet_type AS matched_pet_type,
    matched.source AS matched_source,
    matched.source_quality AS matched_source_quality,
    matched.source_url AS matched_source_url
  FROM accepted_review_rows ar
  JOIN public.catalog_acquisition_queue q
    ON lower(trim(q.brand)) = lower(trim(ar.queue_brand))
   AND lower(trim(q.product_name)) = lower(trim(ar.queue_product_name))
   AND (
      NULLIF(trim(ar.queue_pet_type), '') IS NULL
      OR lower(trim(q.pet_type)) = lower(trim(ar.queue_pet_type))
    )
   AND (
      NULLIF(trim(ar.queue_product_source), '') IS NULL
      OR lower(trim(q.product_source)) = lower(trim(ar.queue_product_source))
    )
  JOIN public.product_data legacy
    ON legacy.cache_key = q.cache_key
  JOIN public.product_data matched
    ON matched.cache_key = ar.matched_cache_key
  WHERE q.gap_type = 'product'
    AND q.status IN ('open', 'in_progress')
    AND q.product_source IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr', 'brand')
    AND legacy.catalog_exclusion_reason IS NULL
    AND COALESCE(NULLIF(q.source_url, ''), NULLIF(legacy.source_url, '')) IS NULL
    AND COALESCE(legacy.ingredient_verification_status, 'unverified') NOT IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )
    AND public.catalog_quality_state(
      matched.pet_type,
      matched.is_complete_food,
      matched.catalog_exclusion_reason,
      matched.ingredient_text,
      matched.ingredient_count,
      matched.ingredient_verification_status,
      matched.image_url,
      matched.image_verification_status,
      matched.source_url,
      matched.expires_at
    ) = 'verified_ready'
    AND matched.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
    AND matched.source NOT IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr')
    AND COALESCE(NULLIF(matched.source_url, ''), '') <> ''
)${updateSql}
SELECT jsonb_build_object(
  'mode', ${sqlString(apply ? "apply" : "dry_run")},
  'accepted_review_rows', (SELECT count(*) FROM accepted_review_rows),
  'validated_review_rows', (SELECT count(*) FROM validated_review_rows),
  'invalid_or_stale_review_rows', (SELECT count(*) FROM accepted_review_rows) - (SELECT count(*) FROM validated_review_rows)${appliedCounts}
) AS retail_alias_review_import_result;
${apply ? "\nCOMMIT;\n" : ""}`;
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-retail-alias-review-import-sql.mjs --input <review.csv>",
      "",
      "Builds privileged SQL from a human-reviewed retail alias CSV.",
      "",
      "Options:",
      "  --input <path>       Required review CSV.",
      "  --output-dir <dir>   Default: outputs/catalog-retail-alias-review-imports/current.",
      "  --output <path>      Write SQL to an explicit file instead of output-dir.",
      "  --apply              Emit applying SQL. Default emits dry-run SQL.",
      "  --stdout            Print SQL instead of writing a file.",
    ].join("\n"));
    return;
  }

  const inputPath = compact(getArg("--input"));
  if (!inputPath) throw new Error("--input is required");

  const reviewRows = readReviewRows(inputPath);
  const rows = acceptedReviewRows(reviewRows);
  const apply = hasArg("--apply");
  const sql = buildSql(rows, { apply });

  if (hasArg("--stdout")) {
    console.log(sql);
    return;
  }

  const explicitOutput = compact(getArg("--output"));
  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const outputPath = explicitOutput || path.join(
    outputDir,
    `${slug(path.basename(inputPath).replace(/\.[a-z0-9]+$/i, ""))}-${apply ? "apply" : "dry-run"}.sql`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${sql.trim()}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    input_path: inputPath,
    output_path: outputPath,
    mode: apply ? "apply" : "dry_run",
    input_rows: reviewRows.length,
    accepted_rows: rows.length,
  }, null, 2));
}

main();
