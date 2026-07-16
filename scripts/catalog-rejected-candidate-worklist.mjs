import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_IMPORT_ROOT = "outputs/catalog-source-imports";
const DEFAULT_MISSING_REPORT = "outputs/catalog-live-gap-action-plan/current/missing-live-generation-report.json";
const DEFAULT_PENDING_IMPORT_REJECTED = "outputs/catalog-pending-import-delta/current/import-rejected-rows.json";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-rejected-candidate-worklist/current";
const PAGE_SIZE = 500;
const VERIFIED_SOURCE_QUALITIES = new Set(["gdsn", "official", "manufacturer", "retailer_verified"]);
const VERIFIED_INGREDIENT_STATUSES = new Set(["gdsn", "official", "manufacturer", "retailer_verified", "label_ocr_verified"]);
const VERIFIED_IMAGE_STATUSES = new Set(["official", "manufacturer", "retailer_verified"]);

const OCR_IMPORT_COMMANDS = {
  "pedigree-mars-petcare": "npm run catalog:pedigree-ocr-import-batch",
  iams: "npm run catalog:iams-ocr-import-batch",
  "cesar-mars-petcare": "npm run catalog:cesar-ocr-import-batch",
  "solid-gold": "npm run catalog:solid-gold-import-batch",
  "natural-balance": "npm run catalog:natural-balance-api-ocr-import-batch",
};

const GENERIC_IMPORT_COMMANDS = {
  "orijen-champion-petfoods": "npm run catalog:orijen-import-batch",
  "earthborn-holistic-midwestern": "npm run catalog:earthborn-holistic-import-batch",
  "victor-pet-food": "npm run catalog:victor-import-batch",
};

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

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readJsonIfExists(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(row, headers) {
  return headers.map((header) => csvEscape(row?.[header] ?? "")).join(",");
}

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shellQuote(value) {
  return `"${String(value || "").replace(/(["\\$`])/g, "\\$1")}"`;
}

function collectManifestPathsFromReport(reportPath) {
  const report = readJsonIfExists(reportPath, {});
  const paths = new Set();
  for (const row of report.rows || []) {
    const manifestPath = compact(row.parsed?.output_manifest);
    if (manifestPath) paths.add(manifestPath);
  }
  return [...paths];
}

function collectManifestPathsFromImportRoot(importRoot) {
  const paths = [];
  if (!fs.existsSync(importRoot)) return paths;
  for (const sourceDir of fs.readdirSync(importRoot, { withFileTypes: true })) {
    if (!sourceDir.isDirectory()) continue;
    const manifestPath = path.join(importRoot, sourceDir.name, "missing-live-current", "manifest.json");
    if (fs.existsSync(manifestPath)) paths.push(manifestPath);
  }
  return paths;
}

function evidenceRepairAction(row) {
  const source = compact(row.source);
  const status = compact(row.ingredient_verification_status).toLowerCase();
  const reasons = new Set(Array.isArray(row.reasons) ? row.reasons : []);
  if (reasons.has("sample_or_trial_product")) {
    return {
      repair_type: "exclude_non_catalog_trial_sample",
      next_command: "Review source target and keep sample/trial rows excluded; import only full retail products with exact official evidence.",
      notes: "Sample or trial-size products should not become verified-ready catalog rows unless they represent an active retail variant with full source-backed evidence.",
    };
  }

  if (reasons.has("non_single_formula_pack") || reasons.has("ambiguous_count_pack")) {
    return {
      repair_type: "exclude_non_single_formula_or_ambiguous_pack",
      next_command: "Keep excluded unless the source provides SKU-level evidence for one exact formula, package, and front image.",
      notes: "Multi-formula and ambiguous count-pack rows can combine ingredients from more than one product. They are not safe verified-ready rows.",
    };
  }

  const hasIngredientParseFailure = reasons.has("unbalanced_ingredient_parentheses")
    || reasons.has("ingredient_ocr_artifact")
    || reasons.has("same_content_demoted_live_row")
    || reasons.has("truncated_ingredient_text")
    || reasons.has("incomplete_ingredient_statement");

  if (status === "label_ocr_verified" && hasIngredientParseFailure) {
    return {
      repair_type: "rerun_official_label_ocr",
      next_command: OCR_IMPORT_COMMANDS[source] || `npm run catalog:scrape-all -- --source ${shellQuote(source)} --mode import --strict-import-validation`,
      notes: "Existing OCR output is not promotable. Re-extract from official package/ingredient-panel evidence, then rerun missing-live generation.",
    };
  }

  if (status === "manufacturer" && hasIngredientParseFailure) {
    return {
      repair_type: "fix_official_parser_or_request_feed",
      next_command: GENERIC_IMPORT_COMMANDS[source] || `npm run catalog:scrape-all -- --source ${shellQuote(source)} --mode import --strict-import-validation`,
      notes: "Manufacturer-labeled evidence is malformed or truncated. Fix the source parser first; request an authorized feed if official pages do not expose exact ingredients.",
    };
  }

  return {
    repair_type: "request_authorized_feed",
    next_command: `npm run catalog:authorized-feed-request-pack -- --brand ${shellQuote(row.brand || source)} --all-restricted`,
    notes: "No safe automated repair path exists for this candidate without stronger source evidence.",
  };
}

function evidenceIssueFor(row) {
  const status = compact(row.ingredient_verification_status).toLowerCase();
  const reasons = new Set(Array.isArray(row.reasons)
    ? row.reasons
    : compact(row.rejection_reasons).split("|").filter(Boolean));
  const reasonText = [...reasons].join(", ") || "unknown validation failure";

  if (reasons.has("sample_or_trial_product")) {
    return {
      evidence_issue: "non_catalog_trial_sample",
      evidence_detail: "Candidate appears to be a sample/trial item. Keep it excluded unless a full retail product variant has exact source-backed ingredient and image evidence.",
    };
  }

  if (reasons.has("non_single_formula_pack") || reasons.has("ambiguous_count_pack")) {
    return {
      evidence_issue: "non_single_formula_or_ambiguous_pack",
      evidence_detail: "Candidate appears to be a multi-formula pack or an ambiguous count-pack row. Keep it excluded unless one exact product formula can be verified from source evidence.",
    };
  }

  if (status === "manufacturer") {
    return {
      evidence_issue: "official_source_text_failed_validation",
      evidence_detail: `Manufacturer/official text failed strict ingredient validation: ${reasonText}. Use corrected official source evidence or an authorized feed before import.`,
    };
  }

  if (status === "label_ocr_verified") {
    return {
      evidence_issue: "official_label_ocr_failed_validation",
      evidence_detail: `Official label OCR failed strict ingredient validation: ${reasonText}. Re-extract from better official label/package evidence before import.`,
    };
  }

  return {
    evidence_issue: "insufficient_verified_evidence",
    evidence_detail: `Candidate failed strict ingredient validation: ${reasonText}. Acquire stronger source-backed evidence before import.`,
  };
}

function ingredientEvidenceFailureKind(row) {
  const status = compact(row.ingredient_verification_status).toLowerCase();
  const tail = compact(row.ingredient_text_tail);
  const reasons = new Set(Array.isArray(row.reasons)
    ? row.reasons
    : compact(row.rejection_reasons).split("|").filter(Boolean));
  const isOcr = status === "label_ocr_verified";
  if (reasons.has("sample_or_trial_product")) return "non_catalog_trial_sample";
  if (reasons.has("non_single_formula_pack") || reasons.has("ambiguous_count_pack")) {
    return "non_single_formula_or_ambiguous_pack";
  }
  if (reasons.has("unbalanced_ingredient_parentheses") || reasons.has("ingredient_ocr_artifact")) {
    return isOcr ? "label_ocr_malformed" : "official_source_malformed";
  }
  if (reasons.has("same_content_demoted_live_row")) {
    return isOcr ? "label_ocr_demoted_same_content" : "official_source_demoted_same_content";
  }

  const likelyTruncated = (
    reasons.has("truncated_ingredient_text")
    || reasons.has("incomplete_ingredient_statement")
    || (tail && !/[.!?)\]]$/.test(tail))
    || /\b(?:pyridox|pantothenate|chloride|supplement|vitamin|mineral|sulfate|iodide)$/i.test(tail)
  );

  if (likelyTruncated) return isOcr ? "label_ocr_truncated" : "official_source_truncated";
  return isOcr ? "label_ocr_failed_validation" : "official_source_failed_validation";
}

function rowPriority(row) {
  const reasons = new Set(Array.isArray(row.reasons) ? row.reasons : []);
  if (reasons.has("sample_or_trial_product")) return 5 + numeric(row.affected_products);
  if (reasons.has("non_single_formula_pack") || reasons.has("ambiguous_count_pack")) {
    return 5 + numeric(row.affected_products);
  }
  return (
    (compact(row.ingredient_verification_status).toLowerCase() === "manufacturer" ? 1000 : 0)
    + (reasons.has("unbalanced_ingredient_parentheses") ? 100 : 0)
    + (reasons.has("ingredient_ocr_artifact") ? 50 : 0)
    + numeric(row.affected_products)
  );
}

function candidateKey(source, cacheKey, sourceUrl) {
  return `${compact(source)}|${compact(cacheKey) || compact(sourceUrl)}`;
}

function ingredientTextTail(value) {
  const text = compact(value);
  return text.length > 180 ? text.slice(-180) : text;
}

function ingredientCount(value) {
  const text = compact(value);
  if (!text) return 0;
  return text
    .split(",")
    .map(compact)
    .filter(Boolean)
    .length;
}

function reasonsForPendingImportRejection(row) {
  return compact(row.import_rejection_reason || row.rejection_reasons || row.reason)
    .split("|")
    .map(compact)
    .filter(Boolean);
}

function worklistRowFromRejection({ rejection, source, sourceQuality, manifestPath, mtimeMs, rejectionStage }) {
  const reasons = Array.isArray(rejection.reasons)
    ? rejection.reasons
    : reasonsForPendingImportRejection(rejection);
  const ingredientText = compact(rejection.ingredient_text || rejection.ingredient_statement);
  const base = {
    source,
    source_quality: compact(rejection.source_quality || sourceQuality),
    brand: compact(rejection.brand),
    cache_key: compact(rejection.cache_key),
    product_name: compact(rejection.product_name),
    source_url: compact(rejection.source_url),
    gtin: compact(rejection.gtin),
    pet_type: compact(rejection.pet_type),
    package_size: compact(rejection.package_size),
    ingredient_count: numeric(rejection.ingredient_count) || ingredientCount(ingredientText),
    ingredient_text_length: numeric(rejection.ingredient_text_length) || ingredientText.length,
    ingredient_text_tail: compact(rejection.ingredient_text_tail) || ingredientTextTail(ingredientText),
    ingredient_verification_status: compact(rejection.ingredient_verification_status),
    image_verification_status: compact(rejection.image_verification_status),
    image_url: compact(rejection.image_url || rejection.front_image_url),
    rejection_reasons: reasons.join("|"),
    rejection_stage: rejectionStage,
    manifest_path: manifestPath,
    rejected_missing_rows_for_source: numeric(rejection.rejected_missing_rows_for_source),
  };
  const action = evidenceRepairAction({
    ...base,
    reasons,
  });
  const evidence = evidenceIssueFor({
    ...base,
    reasons,
  });
  return {
    ...base,
    ...evidence,
    ingredient_evidence_failure_kind: ingredientEvidenceFailureKind({
      ...base,
      reasons,
    }),
    repair_type: action.repair_type,
    next_command: action.next_command,
    notes: action.notes,
    priority_score: rowPriority({
      ...base,
      reasons,
    }),
    _mtimeMs: mtimeMs,
  };
}

function applyRejectedRow(rowsByKey, row) {
  const key = candidateKey(row.source, row.cache_key, row.source_url);
  if (!row.source || key.endsWith("|")) return;
  const current = rowsByKey.get(key);
  if (!current || row._mtimeMs >= current._mtimeMs) {
    rowsByKey.set(key, row);
  }
}

function pendingImportRejectedRows(pendingImportRejectedPath) {
  const rows = readJsonIfExists(pendingImportRejectedPath, []);
  return Array.isArray(rows) ? rows : [];
}

function readOnlyKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || ""
  );
}

function supabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = readOnlyKey();
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function chunked(values, size = PAGE_SIZE) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function sourceScopedKey(source, value) {
  return `${normalizeKey(source)}|${compact(value)}`;
}

function liveRowIsStrictReady(row = {}) {
  return (
    ["dog", "cat"].includes(compact(row.pet_type).toLowerCase())
    && row.is_complete_food === true
    && !compact(row.catalog_exclusion_reason)
    && compact(row.source_url)
    && compact(row.ingredient_text)
    && numeric(row.ingredient_count) >= 5
    && compact(row.image_url)
    && !/^data:/i.test(compact(row.image_url))
    && VERIFIED_SOURCE_QUALITIES.has(compact(row.source_quality))
    && VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status))
    && VERIFIED_IMAGE_STATUSES.has(compact(row.image_verification_status))
  );
}

async function fetchStrictReadyRowsByField(client, field, values) {
  const uniqueValues = [...new Set(values.map(compact).filter(Boolean))];
  const rows = [];
  for (const group of chunked(uniqueValues)) {
    const { data, error } = await client
      .from("product_data")
      .select([
        "cache_key",
        "source",
        "source_url",
        "pet_type",
        "is_complete_food",
        "catalog_exclusion_reason",
        "ingredient_text",
        "ingredient_count",
        "image_url",
        "source_quality",
        "ingredient_verification_status",
        "image_verification_status",
      ].join(","))
      .in(field, group);
    if (error) throw error;
    rows.push(...(data || []).filter(liveRowIsStrictReady));
  }
  return rows;
}

async function filterResolvedLiveRows(rows, options = {}) {
  if (options.skipLiveResolution) {
    return {
      rows,
      resolved: [],
      liveResolutionSource: "skipped_by_flag",
    };
  }

  const client = supabaseClient();
  if (!client || rows.length === 0) {
    return {
      rows,
      resolved: [],
      liveResolutionSource: client ? "no_rows" : "missing_supabase_env",
    };
  }

  const cacheKeys = rows.map((row) => row.cache_key);
  const sourceUrls = rows.map((row) => row.source_url);
  const liveRows = [
    ...await fetchStrictReadyRowsByField(client, "cache_key", cacheKeys),
    ...await fetchStrictReadyRowsByField(client, "source_url", sourceUrls),
  ];
  const liveByCacheKey = new Set();
  const liveBySourceUrl = new Set();
  for (const liveRow of liveRows) {
    if (compact(liveRow.cache_key)) {
      liveByCacheKey.add(sourceScopedKey(liveRow.source, liveRow.cache_key));
    }
    if (compact(liveRow.source_url)) {
      liveBySourceUrl.add(sourceScopedKey(liveRow.source, liveRow.source_url));
    }
  }

  const resolved = [];
  const unresolved = [];
  for (const row of rows) {
    const cacheResolved = compact(row.cache_key)
      && liveByCacheKey.has(sourceScopedKey(row.source, row.cache_key));
    const urlResolved = compact(row.source_url)
      && liveBySourceUrl.has(sourceScopedKey(row.source, row.source_url));
    if (cacheResolved || urlResolved) {
      resolved.push(row);
    } else {
      unresolved.push(row);
    }
  }

  return {
    rows: unresolved,
    resolved,
    liveResolutionSource: "live_supabase_product_data",
  };
}

function worklistRows(manifestPaths, pendingImportRejectedPath) {
  const manifests = [];
  for (const manifestPath of manifestPaths) {
    const manifest = readJsonIfExists(manifestPath, null);
    if (!manifest) continue;
    const mtimeMs = fs.existsSync(manifestPath) ? fs.statSync(manifestPath).mtimeMs : 0;
    manifests.push({ manifestPath, manifest, mtimeMs });
  }

  const acceptedByKey = new Map();
  for (const { manifest, mtimeMs } of manifests) {
    for (const accepted of manifest.accepted_missing_candidates || []) {
      const source = compact(accepted.source || manifest.source);
      const key = candidateKey(source, accepted.cache_key, accepted.source_url);
      if (!source || key.endsWith("|")) continue;
      const current = acceptedByKey.get(key);
      if (!current || mtimeMs > current.mtimeMs) {
        acceptedByKey.set(key, { mtimeMs });
      }
    }
  }

  const rowsByKey = new Map();
  for (const { manifestPath, manifest, mtimeMs } of manifests) {
    for (const rejection of manifest.validation_rejections || []) {
      const source = compact(rejection.source || manifest.source);
      const sourceUrl = compact(rejection.source_url);
      const cacheKey = compact(rejection.cache_key);
      const key = candidateKey(source, cacheKey, sourceUrl);
      if (!source || key.endsWith("|")) continue;

      const accepted = acceptedByKey.get(key);
      if (accepted && accepted.mtimeMs >= mtimeMs) continue;

      applyRejectedRow(rowsByKey, worklistRowFromRejection({
        rejection: {
          ...rejection,
          source_url: sourceUrl,
          cache_key: cacheKey,
          rejected_missing_rows_for_source: manifest.rejected_missing_rows,
        },
        source,
        sourceQuality: manifest.source_quality,
        manifestPath,
        mtimeMs,
        rejectionStage: "missing_live_validation",
      }));
    }
  }

  const pendingMtimeMs = fs.existsSync(pendingImportRejectedPath) ? fs.statSync(pendingImportRejectedPath).mtimeMs + 1 : 0;
  for (const rejection of pendingImportRejectedRows(pendingImportRejectedPath)) {
    const source = compact(rejection.source);
    const manifestPath = compact(rejection.source_manifest_path) || pendingImportRejectedPath;
    applyRejectedRow(rowsByKey, worklistRowFromRejection({
      rejection,
      source,
      sourceQuality: rejection.source_quality,
      manifestPath,
      mtimeMs: pendingMtimeMs,
      rejectionStage: "pending_import_delta",
    }));
  }

  const rows = [...rowsByKey.values()].map(({ _mtimeMs, ...row }) => row);
  rows.sort((left, right) => (
    right.priority_score - left.priority_score
    || left.source.localeCompare(right.source)
    || left.product_name.localeCompare(right.product_name)
  ));
  return rows;
}

function summarize(rows, options) {
  const countsFor = (field) => rows.reduce((map, row) => {
    const key = compact(row[field]) || "unknown";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});

  return {
    generated_at: new Date().toISOString(),
    report_source: options.reportPath || "",
    import_root: options.importRoot,
    pending_import_rejected_path: options.pendingImportRejectedPath,
    pending_import_rejected_raw_rows: options.pendingImportRejectedRawRows,
    live_resolution_source: options.liveResolutionSource,
    resolved_live_rejected_candidates: options.resolvedLiveRejectedCandidates,
    rejected_candidate_count: rows.length,
    affected_source_count: new Set(rows.map((row) => row.source)).size,
    rejected_by_stage: countsFor("rejection_stage"),
    rejected_by_source: countsFor("source"),
    rejected_by_repair_type: countsFor("repair_type"),
    rejected_by_evidence_issue: countsFor("evidence_issue"),
    rejected_by_ingredient_evidence_failure_kind: countsFor("ingredient_evidence_failure_kind"),
    rejected_by_ingredient_status: countsFor("ingredient_verification_status"),
  };
}

function writeCsv(rows, filePath) {
  const headers = [
    "source",
    "brand",
    "product_name",
    "cache_key",
    "ingredient_verification_status",
    "image_verification_status",
    "rejection_reasons",
    "evidence_issue",
    "ingredient_evidence_failure_kind",
    "evidence_detail",
    "ingredient_count",
    "ingredient_text_length",
    "ingredient_text_tail",
    "repair_type",
    "source_url",
    "image_url",
    "rejection_stage",
    "manifest_path",
    "next_command",
    "notes",
  ];
  fs.writeFileSync(filePath, `${[headers.join(","), ...rows.map((row) => csvLine(row, headers))].join("\n")}\n`, "utf8");
}

function writeMarkdown(summary, rows, filePath) {
  const lines = [
    "# Catalog Rejected Candidate Worklist",
    "",
    `Generated at: ${summary.generated_at}`,
    "",
    "## Summary",
    "",
    `- Rejected candidates: ${summary.rejected_candidate_count}`,
    `- Affected sources: ${summary.affected_source_count}`,
    "",
    "## Repair Types",
    "",
    ...Object.entries(summary.rejected_by_repair_type).map(([type, count]) => `- ${type}: ${count}`),
    "",
    "## Rejection Stages",
    "",
    ...Object.entries(summary.rejected_by_stage).map(([stage, count]) => `- ${stage}: ${count}`),
    "",
    "## Evidence Issues",
    "",
    ...Object.entries(summary.rejected_by_evidence_issue).map(([issue, count]) => `- ${issue}: ${count}`),
    "",
    "## Ingredient Evidence Failures",
    "",
    ...Object.entries(summary.rejected_by_ingredient_evidence_failure_kind).map(([issue, count]) => `- ${issue}: ${count}`),
    "",
    "## Sources",
    "",
    ...Object.entries(summary.rejected_by_source).map(([source, count]) => `- ${source}: ${count}`),
    "",
    "## Worklist",
    "",
    "| Source | Product | Issue | Evidence Failure | Reasons | Repair | Next Command |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((row) => [
      row.source,
      row.product_name,
      row.evidence_issue,
      row.ingredient_evidence_failure_kind,
      row.rejection_reasons,
      row.repair_type,
      row.next_command,
    ].map((value) => compact(value).replace(/\|/g, "\\|")).join(" | ")).map((line) => `| ${line} |`),
    "",
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function writeReports(rows, summary, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "worklist.json"), `${JSON.stringify({ ...summary, rows }, null, 2)}\n`, "utf8");
  writeCsv(rows, path.join(outputDir, "worklist.csv"));
  writeMarkdown(summary, rows, path.join(outputDir, "worklist.md"));
}

function printSummary(summary, outputDir) {
  console.log(JSON.stringify({
    rejected_candidate_count: summary.rejected_candidate_count,
    affected_source_count: summary.affected_source_count,
    rejected_by_stage: summary.rejected_by_stage,
    rejected_by_repair_type: summary.rejected_by_repair_type,
    rejected_by_evidence_issue: summary.rejected_by_evidence_issue,
    output_dir: outputDir,
  }, null, 2));
}

async function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-rejected-candidate-worklist.mjs [--report path] [--import-root dir] [--output-dir dir]",
      "",
      "Builds a repair worklist for missing-live candidates rejected by strict ingredient validation.",
      "",
      "Options:",
      "  --report <path>       Missing-live generation report. Default: outputs/catalog-live-gap-action-plan/current/missing-live-generation-report.json",
      "  --import-root <dir>   Fallback manifest scan root. Default: outputs/catalog-source-imports",
      "  --pending-import-rejected <path>  Default: outputs/catalog-pending-import-delta/current/import-rejected-rows.json",
      "  --output-dir <dir>    Default: outputs/catalog-rejected-candidate-worklist/current",
      "  --skip-live-resolution  Do not query live product_data to drop already-resolved rejected rows.",
      "  --fail-on-rejections  Exit 1 when rejected candidates exist.",
      "  --json                Print full JSON payload.",
    ].join("\n"));
    return;
  }

  const reportPath = compact(getArg("--report", DEFAULT_MISSING_REPORT));
  const importRoot = compact(getArg("--import-root", DEFAULT_IMPORT_ROOT));
  const pendingImportRejectedPath = compact(getArg("--pending-import-rejected", DEFAULT_PENDING_IMPORT_REJECTED));
  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const skipLiveResolution = hasArg("--skip-live-resolution");
  const manifestPaths = [...new Set([
    ...(fs.existsSync(reportPath) ? collectManifestPathsFromReport(reportPath) : []),
    ...collectManifestPathsFromImportRoot(importRoot),
  ])];
  const rawRows = worklistRows(manifestPaths, pendingImportRejectedPath);
  const {
    rows,
    resolved,
    liveResolutionSource,
  } = await filterResolvedLiveRows(rawRows, { skipLiveResolution });
  const summary = summarize(rows, {
    reportPath,
    importRoot,
    pendingImportRejectedPath,
    pendingImportRejectedRawRows: pendingImportRejectedRows(pendingImportRejectedPath).length,
    liveResolutionSource,
    resolvedLiveRejectedCandidates: resolved.length,
  });

  writeReports(rows, summary, outputDir);
  if (hasArg("--json")) {
    console.log(JSON.stringify({ ...summary, rows }, null, 2));
  } else {
    printSummary(summary, outputDir);
  }

  if (hasArg("--fail-on-rejections") && rows.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
