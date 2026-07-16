import fs from "node:fs";
import path from "node:path";

const DEFAULT_WORKLIST = "outputs/catalog-rejected-candidate-worklist/current/worklist.json";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-rejected-evidence-requests/current";

const TEMPLATE_HEADERS = [
  "cache_key",
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
  "verified_at",
  "source_name",
  "source_license",
  "evidence_url",
  "evidence_issue",
  "rejection_reasons",
  "rejection_stage",
  "repair_type",
  "candidate_ingredient_text_tail",
  "reviewer_notes",
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) values.push(value);
  }
  return values;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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

function sourceQuality(row) {
  const quality = compact(row.source_quality).toLowerCase();
  return ["gdsn", "official", "manufacturer", "retailer_verified"].includes(quality) ? quality : "manufacturer";
}

function ingredientVerificationFor(quality) {
  if (quality === "gdsn") return "gdsn";
  if (quality === "retailer_verified") return "retailer_verified";
  if (quality === "official") return "official";
  return "manufacturer";
}

function imageVerificationFor(row, quality) {
  const status = compact(row.image_verification_status).toLowerCase();
  if (["official", "manufacturer", "retailer_verified"].includes(status)) return status;
  if (quality === "retailer_verified") return "retailer_verified";
  if (quality === "official") return "official";
  return "manufacturer";
}

function loadWorklist(worklistPath) {
  const payload = JSON.parse(fs.readFileSync(worklistPath, "utf8"));
  return Array.isArray(payload.rows) ? payload.rows : [];
}

function selectedRows(rows) {
  const sourceFilters = new Set(getArgs("--source").map(normalizeKey).filter(Boolean));
  const issueFilters = new Set(getArgs("--evidence-issue").map(compact).filter(Boolean));
  const limit = positiveInteger(getArg("--limit"), 0);
  const includeExcluded = hasArg("--include-excluded");
  const selected = rows.filter((row) => {
    if (sourceFilters.size > 0 && !sourceFilters.has(normalizeKey(row.source))) return false;
    if (issueFilters.size > 0 && !issueFilters.has(compact(row.evidence_issue))) return false;
    if (!includeExcluded && compact(row.repair_type).startsWith("exclude_")) return false;
    return true;
  });
  return limit > 0 ? selected.slice(0, limit) : selected;
}

function templateRow(row) {
  return {
    cache_key: compact(row.cache_key),
    gtin: compact(row.gtin),
    product_name: compact(row.product_name),
    brand: compact(row.brand),
    package_size: compact(row.package_size),
    pet_type: compact(row.pet_type),
    ingredient_statement: "",
    product_image_url: compact(row.image_url),
    product_url: compact(row.source_url),
    is_complete_food: "true",
    verified_at: "",
    source_name: compact(row.source),
    source_license: "authorized manufacturer/licensed feed or official reusable source required",
    evidence_url: compact(row.source_url),
    evidence_issue: compact(row.evidence_issue),
    rejection_reasons: compact(row.rejection_reasons),
    rejection_stage: compact(row.rejection_stage),
    repair_type: compact(row.repair_type),
    candidate_ingredient_text_tail: compact(row.ingredient_text_tail),
    reviewer_notes: "Fill exact source-backed ingredient_statement. Do not reuse candidate_ingredient_text_tail as ingredients.",
  };
}

function importCommand(row, templatePath) {
  const quality = sourceQuality(row);
  return [
    "node scripts/catalog-official-feed-import.mjs",
    "--file", shellQuote(templatePath),
    "--source", shellQuote(row.source),
    "--source-quality", quality,
    "--ingredient-verification", ingredientVerificationFor(quality),
    "--image-verification", imageVerificationFor(row, quality),
    "--expected-brand", shellQuote(row.brand),
    "--emit-sql-rpc",
    "--emit-sql-dir", shellQuote(`outputs/catalog-evidence-repair-imports/${row.source}/sql`),
    "--sql-payload-format", "base64",
  ].join(" ");
}

function revalidationCommand(row) {
  return [
    "node scripts/catalog-generated-sql-missing-import.mjs",
    "--manifest", shellQuote(`outputs/catalog-evidence-repair-imports/${row.source}/sql/manifest.json`),
    "--source", shellQuote(row.source),
    "--output-dir", shellQuote(`outputs/catalog-evidence-repair-imports/${row.source}/missing-live-current`),
  ].join(" ");
}

function groupBySource(rows) {
  const groups = new Map();
  for (const row of rows) {
    const source = compact(row.source) || "unknown-source";
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(row);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function sourceDoc(source, rows, relativeTemplatePath) {
  const brands = [...new Set(rows.map((row) => compact(row.brand)).filter(Boolean))].join(", ");
  const issueCounts = rows.reduce((map, row) => {
    const issue = compact(row.evidence_issue) || "unknown";
    map[issue] = (map[issue] || 0) + 1;
    return map;
  }, {});
  return `# ${source} Rejected Evidence Request

Brands: ${brands}
Rejected products: ${rows.length}

## Evidence Issues

${Object.entries(issueCounts).map(([issue, count]) => `- ${issue}: ${count}`).join("\n")}

## Required Evidence

- Exact ingredient statement copied from authorized product content, official package label, or licensed feed.
- One real front package image URL for the exact variant.
- Product/evidence URL and verification date.
- Active US dog/cat complete food products only.
- No inferred ingredients, no AI-generated ingredients, no OCR text unless manually verified against official label evidence.

## Template

\`${relativeTemplatePath}\`

The template intentionally leaves \`ingredient_statement\` blank. The \`candidate_ingredient_text_tail\` column is diagnostic only and must not be imported as source truth.

## Import After Repair

Place the completed template under:

\`inputs/catalog-evidence-repairs/${source}/feed.csv\`

Then run the per-row import commands from \`request-index.csv\`, review emitted SQL, rerun missing-live validation, and only apply rows that pass strict validation.
`;
}

function rootReadme(summary) {
  return `# Woof Rejected Evidence Request Pack

Generated at: ${summary.generated_at}
Rejected products: ${summary.request_count}
Affected sources: ${summary.affected_source_count}

## Purpose

This pack converts strict-validation rejects into product-level acquisition requests. It is for fixing exact ingredient/image evidence gaps without weakening catalog truth rules.

## Rules

- Keep rejected rows out of \`verified_ready\` until exact ingredients and front image evidence are source-backed.
- Do not repair ingredient text by guessing.
- Do not paste \`candidate_ingredient_text_tail\` into \`ingredient_statement\`.
- Use \`rejection_stage\` and \`repair_type\` to distinguish evidence repairs from rows that should stay excluded.
- Excluded rows remain in the rejected-candidate worklist; this pack defaults to repairable evidence gaps only.
- After a completed feed is received, run guarded import and missing-live validation before applying SQL.

## Files

- \`request-index.csv\`: all rejected products and commands.
- \`templates/<source>.csv\`: fillable source/product templates.
- \`docs/<source>.md\`: source-specific instructions.

## Evidence Issue Counts

${Object.entries(summary.rejected_by_evidence_issue).map(([issue, count]) => `- ${issue}: ${count}`).join("\n")}

## Rejection Stage Counts

${Object.entries(summary.rejected_by_stage).map(([stage, count]) => `- ${stage}: ${count}`).join("\n")}
`;
}

function writePack(rows, worklistPath, outputDir) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  const templateDir = path.join(outputDir, "templates");
  const docsDir = path.join(outputDir, "docs");
  fs.mkdirSync(templateDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const indexHeaders = [
    "source",
    "brand",
    "product_name",
    "cache_key",
    "gtin",
    "pet_type",
    "package_size",
    "source_url",
    "candidate_front_image_url",
    "evidence_issue",
    "evidence_detail",
    "rejection_reasons",
    "rejection_stage",
    "repair_type",
    "ingredient_count",
    "ingredient_text_length",
    "candidate_ingredient_text_tail",
    "template_path",
    "import_command",
    "revalidation_command",
  ];

  const indexRows = [];
  const sources = [];
  for (const [source, sourceRows] of groupBySource(rows)) {
    const templatePath = path.join(templateDir, `${source}.csv`);
    const docPath = path.join(docsDir, `${source}.md`);
    const relativeTemplatePath = path.relative(outputDir, templatePath);
    fs.writeFileSync(templatePath, `${[
      TEMPLATE_HEADERS.join(","),
      ...sourceRows.map((row) => csvLine(templateRow(row), TEMPLATE_HEADERS)),
    ].join("\n")}\n`, "utf8");
    fs.writeFileSync(docPath, sourceDoc(source, sourceRows, relativeTemplatePath), "utf8");

    sources.push({
      source,
      rejected_products: sourceRows.length,
      template_path: path.relative(process.cwd(), templatePath),
      docs_path: path.relative(process.cwd(), docPath),
    });

    for (const row of sourceRows) {
      indexRows.push({
        source,
        brand: compact(row.brand),
        product_name: compact(row.product_name),
        cache_key: compact(row.cache_key),
        gtin: compact(row.gtin),
        pet_type: compact(row.pet_type),
        package_size: compact(row.package_size),
        source_url: compact(row.source_url),
        candidate_front_image_url: compact(row.image_url),
        evidence_issue: compact(row.evidence_issue),
        evidence_detail: compact(row.evidence_detail),
        rejection_reasons: compact(row.rejection_reasons),
        rejection_stage: compact(row.rejection_stage),
        repair_type: compact(row.repair_type),
        ingredient_count: row.ingredient_count || "",
        ingredient_text_length: row.ingredient_text_length || "",
        candidate_ingredient_text_tail: compact(row.ingredient_text_tail),
        template_path: path.relative(process.cwd(), templatePath),
        import_command: importCommand(row, `inputs/catalog-evidence-repairs/${source}/feed.csv`),
        revalidation_command: revalidationCommand(row),
      });
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    worklist_path: worklistPath,
    output_dir: outputDir,
    request_count: rows.length,
    affected_source_count: sources.length,
    rejected_by_evidence_issue: rows.reduce((map, row) => {
      const issue = compact(row.evidence_issue) || "unknown";
      map[issue] = (map[issue] || 0) + 1;
      return map;
    }, {}),
    rejected_by_stage: rows.reduce((map, row) => {
      const stage = compact(row.rejection_stage) || "unknown";
      map[stage] = (map[stage] || 0) + 1;
      return map;
    }, {}),
    rejected_by_repair_type: rows.reduce((map, row) => {
      const repairType = compact(row.repair_type) || "unknown";
      map[repairType] = (map[repairType] || 0) + 1;
      return map;
    }, {}),
    template_headers: TEMPLATE_HEADERS,
    sources,
  };

  fs.writeFileSync(path.join(outputDir, "request-index.csv"), `${[
    indexHeaders.join(","),
    ...indexRows.map((row) => csvLine(row, indexHeaders)),
  ].join("\n")}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "README.md"), rootReadme(summary), "utf8");
  return summary;
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-rejected-evidence-request-pack.mjs [--worklist path] [--output-dir dir]",
      "",
      "Generates product-level evidence request templates from rejected strict-validation candidates.",
      "",
      "Options:",
      "  --worklist <path>               Default: outputs/catalog-rejected-candidate-worklist/current/worklist.json",
      "  --output-dir <dir>              Default: outputs/catalog-rejected-evidence-requests/current",
      "  --source <source-slug>          Repeatable source filter.",
      "  --evidence-issue <issue>        Repeatable evidence issue filter.",
      "  --include-excluded             Include worklist rows whose repair_type starts with exclude_.",
      "  --limit <n>",
      "  --json",
    ].join("\n"));
    return;
  }

  const worklistPath = compact(getArg("--worklist", DEFAULT_WORKLIST));
  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const rows = selectedRows(loadWorklist(worklistPath));
  const summary = writePack(rows, worklistPath, outputDir);

  if (hasArg("--json")) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(JSON.stringify({
      request_count: summary.request_count,
      affected_source_count: summary.affected_source_count,
      rejected_by_evidence_issue: summary.rejected_by_evidence_issue,
      rejected_by_stage: summary.rejected_by_stage,
      rejected_by_repair_type: summary.rejected_by_repair_type,
      output_dir: outputDir,
    }, null, 2));
  }
}

main();
