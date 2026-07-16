import fs from "node:fs";
import path from "node:path";
import { buildSql } from "./catalog-retail-alias-candidate-sql.mjs";

const DEFAULT_OUTPUT_DIR = "outputs/catalog-retail-alias-review-packs/current";
const DEFAULT_ACTION_PLAN = "outputs/catalog-source-feed-worklist/current/worklist.json";
const DEFAULT_LIMIT = 25;
const DEFAULT_MAX_RESULTS = 12;
const DEFAULT_SAMPLE_LIMIT = 50;
const DEFAULT_BRAND_LIMIT = 12;
const REVIEW_TEMPLATE_HEADERS = [
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

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) {
      values.push(value);
      index += 1;
    }
  }
  return values;
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

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(row, headers) {
  return headers.map((header) => csvEscape(row?.[header] ?? "")).join(",");
}

function shellQuote(value) {
  return `"${String(value || "").replace(/(["\\$`])/g, "\\$1")}"`;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function selectedBrandsFromActionPlan({ actionPlanPath, brandLimit }) {
  const payload = readJsonIfExists(actionPlanPath);
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const seen = new Set();
  const selected = [];

  for (const row of rows) {
    const action = compact(row.recommendedNextAction || row.recommended_action);
    if (![
      "review_rejected_verified_source_rows",
      "official_source_current_acquire_feed_for_remaining_queue",
      "expand_official_source_import",
      "reconcile_queue_hygiene",
    ].includes(action)) {
      continue;
    }

    for (const value of String(row.brands || row.brand || "").split(";")) {
      const brand = compact(value);
      const key = normalizeKey(brand);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.push(brand);
      break;
    }

    if (selected.length >= brandLimit) break;
  }

  return selected;
}

function selectedBrands() {
  const explicitBrands = getArgs("--brand").map(compact).filter(Boolean);
  if (explicitBrands.length > 0) return explicitBrands;
  const actionPlanPath = compact(getArg("--action-plan", DEFAULT_ACTION_PLAN));
  const brandLimit = positiveInteger(getArg("--brand-limit"), DEFAULT_BRAND_LIMIT);
  return selectedBrandsFromActionPlan({ actionPlanPath, brandLimit });
}

function sampleExportSql({ brand, limit, maxResults, sampleLimit }) {
  const baseSql = buildSql({ brand, limit, maxResults, sampleLimit }).trim().replace(/;$/, "");
  const columns = [
    ["alias_candidate_status", "sample->>'alias_candidate_status'"],
    ["queue_brand", "sample->>'brand'"],
    ["queue_product_name", "sample->>'product_name'"],
    ["queue_pet_type", "sample->>'pet_type'"],
    ["queue_product_source", "sample->>'product_source'"],
    ["matched_cache_key", "sample->>'matched_cache_key'"],
    ["matched_product_name", "sample->>'matched_product_name'"],
    ["matched_pet_type", "sample->>'matched_pet_type'"],
    ["matched_source", "sample->>'matched_source'"],
    ["matched_source_url", "sample->>'matched_source_url'"],
    ["matched_rank", "sample->>'matched_rank'"],
    ["formula_alias_review_eligible", "sample->>'formula_alias_review_eligible'"],
    ["existing_reconcile_eligible", "sample->>'existing_reconcile_eligible'"],
    ["quality_guard_pass", "sample->>'quality_guard_pass'"],
    ["source_guard_pass", "sample->>'source_guard_pass'"],
    ["brand_alias_guard_pass", "sample->>'brand_alias_guard_pass'"],
    ["species_guard_pass", "sample->>'species_guard_pass'"],
    ["food_form_guard_pass", "sample->>'food_form_guard_pass'"],
    ["size_guard_pass", "sample->>'size_guard_pass'"],
    ["package_count_guard_pass", "sample->>'package_count_guard_pass'"],
    ["formula_terms_guard_pass", "sample->>'formula_terms_guard_pass'"],
    ["proof_required", "sample->>'proof_required'"],
  ];

  return `-- Read-only retail alias review sample export for ${brand}.
-- Run with a privileged Supabase role, export the result as CSV, then review
-- rows before any queue closure or source promotion. This does not update data.
WITH audit_payload AS (
${baseSql}
),
samples AS (
  SELECT jsonb_array_elements(retail_alias_candidate_audit->'samples') AS sample
  FROM audit_payload
)
SELECT
  ${columns.map(([alias, expression]) => `${expression} AS ${alias}`).join(",\n  ")}
FROM samples
ORDER BY
  CASE sample->>'alias_candidate_status'
    WHEN 'formula_alias_review_candidate' THEN 1
    WHEN 'ambiguous_formula_alias_review' THEN 2
    WHEN 'already_safe_by_existing_reconcile' THEN 3
    ELSE 4
  END,
  NULLIF(sample->>'priority_score', '')::numeric DESC NULLS LAST,
  sample->>'product_name';`;
}

function summaryExportSql({ brand, limit, maxResults, sampleLimit }) {
  const baseSql = buildSql({ brand, limit, maxResults, sampleLimit }).trim().replace(/;$/, "");
  return `-- Read-only retail alias review summary for ${brand}.
WITH audit_payload AS (
${baseSql}
),
summary_rows AS (
  SELECT jsonb_array_elements(retail_alias_candidate_audit->'summary') AS summary
  FROM audit_payload
)
SELECT
  summary->>'alias_candidate_status' AS alias_candidate_status,
  NULLIF(summary->>'rows', '')::integer AS rows,
  NULLIF(summary->>'affected_products', '')::integer AS affected_products,
  NULLIF(summary->>'avg_priority', '')::numeric AS avg_priority
FROM summary_rows
ORDER BY rows DESC, alias_candidate_status;`;
}

function writeBrandPack({ outputDir, brand, limit, maxResults, sampleLimit }) {
  const key = normalizeKey(brand);
  const sqlDir = path.join(outputDir, "sql");
  const templateDir = path.join(outputDir, "templates");
  const docDir = path.join(outputDir, "docs");
  fs.mkdirSync(sqlDir, { recursive: true });
  fs.mkdirSync(templateDir, { recursive: true });
  fs.mkdirSync(docDir, { recursive: true });

  const auditSqlPath = path.join(sqlDir, `${key}-retail-alias-audit.sql`);
  const samplesSqlPath = path.join(sqlDir, `${key}-retail-alias-samples.sql`);
  const summarySqlPath = path.join(sqlDir, `${key}-retail-alias-summary.sql`);
  const templatePath = path.join(templateDir, `${key}-retail-alias-review.csv`);
  const docsPath = path.join(docDir, `${key}.md`);

  fs.writeFileSync(auditSqlPath, `${buildSql({ brand, limit, maxResults, sampleLimit })}\n`, "utf8");
  fs.writeFileSync(samplesSqlPath, `${sampleExportSql({ brand, limit, maxResults, sampleLimit })}\n`, "utf8");
  fs.writeFileSync(summarySqlPath, `${summaryExportSql({ brand, limit, maxResults, sampleLimit })}\n`, "utf8");
  fs.writeFileSync(templatePath, `${REVIEW_TEMPLATE_HEADERS.map(csvEscape).join(",")}\n`, "utf8");
  fs.writeFileSync(docsPath, `${[
    `# ${brand} Retail Alias Review`,
    "",
    "Use this pack to review retail/community product titles that may map to an existing verified catalog row.",
    "",
    "The SQL files are read-only. They never import ingredients, never mark rows verified-ready, and never close queue gaps.",
    "",
    "## Files",
    "",
    `- Audit JSON SQL: \`${path.relative(outputDir, auditSqlPath)}\``,
    `- Sample export SQL: \`${path.relative(outputDir, samplesSqlPath)}\``,
    `- Summary SQL: \`${path.relative(outputDir, summarySqlPath)}\``,
    `- Review CSV template: \`${path.relative(outputDir, templatePath)}\``,
    "",
    "## Review Rules",
    "",
    "- Accept only rows where the matched verified catalog row has exact source-backed ingredient text and a verified front image.",
    "- Reject rows when species, life stage, food form, flavor, package count, or formula terms are ambiguous.",
    "- Do not copy ingredients from a retail/community row. Ingredient truth must remain from the verified catalog row or an authorized source feed.",
    "- Any accepted alias still needs a guarded queue-closure/import path before it can affect app results.",
    "",
    "## Suggested Command",
    "",
    "```bash",
    `node scripts/catalog-retail-alias-review-pack.mjs --brand ${shellQuote(brand)}`,
    "```",
    "",
  ].join("\n")}`, "utf8");

  return {
    brand,
    key,
    audit_sql_path: auditSqlPath,
    samples_sql_path: samplesSqlPath,
    summary_sql_path: summarySqlPath,
    template_path: templatePath,
    docs_path: docsPath,
  };
}

function writeReadme({ outputDir, packs, limit, maxResults, sampleLimit }) {
  const readmePath = path.join(outputDir, "README.md");
  fs.writeFileSync(readmePath, `${[
    "# Retail Alias Review Packs",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "These packs turn retailer/community title gaps into a reviewable evidence workflow.",
    "They do not scrape retailer pages, do not reuse retailer ingredients, and do not update Supabase.",
    "",
    "## Scope",
    "",
    `- Queue rows per brand: ${limit}`,
    `- Search results per row: ${maxResults}`,
    `- Sample rows per brand: ${sampleLimit}`,
    "",
    "## Brands",
    "",
    ...packs.map((pack) => `- ${pack.brand}: \`${path.relative(outputDir, pack.samples_sql_path)}\``),
    "",
    "## Required Follow-up",
    "",
    "Run the sample export SQL with a privileged Supabase role, export the rows as CSV, and review only rows that preserve exact source-backed ingredients and verified front images.",
    "Accepted rows should feed a guarded alias/queue-closure migration or an authorized source feed, not a direct ingredient import.",
    "",
  ].join("\n")}`, "utf8");
  return readmePath;
}

function printHelp() {
  console.log([
    "Usage: node scripts/catalog-retail-alias-review-pack.mjs [--brand <brand>]",
    "",
    "Writes read-only SQL and CSV templates for reviewing retail/community title",
    "aliases against existing verified-ready catalog rows.",
    "",
    "Options:",
    "  --brand <brand>        Repeatable. Defaults to top source-feed worklist brands.",
    "  --brand-limit <n>      Default top-brand count when --brand is omitted. Default: 12.",
    "  --limit <n>            Queue rows to inspect per brand. Default: 25.",
    "  --max-results <n>      search_verified_products result count. Default: 12.",
    "  --sample-limit <n>     Returned sample rows. Default: 50.",
    "  --action-plan <path>   Default: outputs/catalog-source-feed-worklist/current/worklist.json.",
    "  --output-dir <dir>     Default: outputs/catalog-retail-alias-review-packs/current.",
  ].join("\n"));
}

function main() {
  if (hasArg("--help")) {
    printHelp();
    return;
  }

  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const brands = selectedBrands();
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  const maxResults = positiveInteger(getArg("--max-results"), DEFAULT_MAX_RESULTS);
  const sampleLimit = positiveInteger(getArg("--sample-limit"), DEFAULT_SAMPLE_LIMIT);

  if (brands.length === 0) {
    throw new Error("No brands selected. Pass --brand or provide a source-feed worklist.");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const packs = brands.map((brand) => writeBrandPack({ outputDir, brand, limit, maxResults, sampleLimit }));
  const readmePath = writeReadme({ outputDir, packs, limit, maxResults, sampleLimit });
  const manifest = {
    generated_at: new Date().toISOString(),
    type: "retail_alias_review_pack",
    output_dir: outputDir,
    brand_count: packs.length,
    queue_row_limit_per_brand: limit,
    max_results: maxResults,
    sample_limit: sampleLimit,
    readme_path: readmePath,
    packs,
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Retail alias review pack`);
  console.log(`Brands: ${packs.length}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Manifest: ${path.join(outputDir, "manifest.json")}`);
}

main();
