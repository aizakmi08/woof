#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const DEFAULT_BACKFILL_INPUT = ".tmp/catalog-backfill-current-targets.json";
const DEFAULT_BACKFILL_REPORT = ".tmp/catalog-backfill-report.jsonl";
const DEFAULT_BACKFILL_MISSING_EXPORT = ".tmp/catalog-backfill-current-prioritized.json";
const DEFAULT_HALO_SHOPIFY_TARGET_INPUT = ".tmp/halo-shopify-catalog-targets.json";
const DEFAULT_HALO_OFFICIAL_PRODUCT_INPUT = ".tmp/halo-official-product-data.json";
const DEFAULT_HALO_OFFICIAL_PRODUCT_REPORT = ".tmp/halo-official-product-backfill-report.jsonl";
const DEFAULT_BLUEBUFFALO_SITEMAP_TARGET_INPUT = ".tmp/bluebuffalo-sitemap-catalog-targets.json";
const DEFAULT_BLUEBUFFALO_OFFICIAL_PRODUCT_INPUT = ".tmp/bluebuffalo-official-product-data.json";
const DEFAULT_BLUEBUFFALO_OFFICIAL_PRODUCT_REPORT = ".tmp/bluebuffalo-official-product-backfill-report.jsonl";
const DEFAULT_MERRICK_SITEMAP_TARGET_INPUT = ".tmp/merrick-sitemap-catalog-targets.json";
const DEFAULT_MERRICK_OFFICIAL_PRODUCT_INPUT = ".tmp/merrick-official-product-data.json";
const DEFAULT_MERRICK_OFFICIAL_PRODUCT_REPORT = ".tmp/merrick-official-product-backfill-report.jsonl";
const DEFAULT_WELLNESS_SITEMAP_TARGET_INPUT = ".tmp/wellness-sitemap-catalog-targets.json";
const DEFAULT_WELLNESS_OFFICIAL_PRODUCT_INPUT = ".tmp/wellness-official-product-data.json";
const DEFAULT_WELLNESS_OFFICIAL_PRODUCT_REPORT = ".tmp/wellness-official-product-backfill-report.jsonl";
const DEFAULT_CANIDAE_SITEMAP_TARGET_INPUT = ".tmp/canidae-sitemap-catalog-targets.json";
const DEFAULT_CANIDAE_OFFICIAL_PRODUCT_INPUT = ".tmp/canidae-official-product-data.json";
const DEFAULT_CANIDAE_OFFICIAL_PRODUCT_REPORT = ".tmp/canidae-official-product-backfill-report.jsonl";
const DEFAULT_HILLSPET_SITEMAP_TARGET_INPUT = ".tmp/hillspet-sitemap-catalog-targets.json";
const DEFAULT_HILLSPET_OFFICIAL_PRODUCT_INPUT = ".tmp/hillspet-official-product-data.json";
const DEFAULT_HILLSPET_OFFICIAL_PRODUCT_REPORT = ".tmp/hillspet-official-product-backfill-report.jsonl";
const DEFAULT_OPENFARM_SHOPIFY_TARGET_INPUT = ".tmp/openfarm-shopify-catalog-targets.json";
const DEFAULT_OPENFARM_OFFICIAL_PRODUCT_INPUT = ".tmp/openfarm-official-product-data.json";
const DEFAULT_OPENFARM_OFFICIAL_PRODUCT_REPORT = ".tmp/openfarm-official-product-backfill-report.jsonl";
const DEFAULT_ROYALCANIN_SITEMAP_TARGET_INPUT = ".tmp/royalcanin-sitemap-catalog-targets.json";
const DEFAULT_ROYALCANIN_OFFICIAL_PRODUCT_INPUT = ".tmp/royalcanin-official-product-data.json";
const DEFAULT_ROYALCANIN_OFFICIAL_PRODUCT_REPORT = ".tmp/royalcanin-official-product-backfill-report.jsonl";
const DEFAULT_FRESHPET_SITEMAP_TARGET_INPUT = ".tmp/freshpet-sitemap-catalog-targets.json";
const DEFAULT_FRESHPET_OFFICIAL_PRODUCT_INPUT = ".tmp/freshpet-official-product-data.json";
const DEFAULT_FRESHPET_OFFICIAL_PRODUCT_REPORT = ".tmp/freshpet-official-product-backfill-report.jsonl";
const DEFAULT_WERUVA_SITEMAP_TARGET_INPUT = ".tmp/weruva-sitemap-catalog-targets.json";
const DEFAULT_WERUVA_OFFICIAL_PRODUCT_INPUT = ".tmp/weruva-official-product-data.json";
const DEFAULT_WERUVA_OFFICIAL_PRODUCT_REPORT = ".tmp/weruva-official-product-backfill-report.jsonl";
const DEFAULT_TIKIPETS_SITEMAP_TARGET_INPUT = ".tmp/tikipets-sitemap-catalog-targets.json";
const DEFAULT_TIKIPETS_OFFICIAL_PRODUCT_INPUT = ".tmp/tikipets-official-product-data.json";
const DEFAULT_TIKIPETS_OFFICIAL_PRODUCT_REPORT = ".tmp/tikipets-official-product-backfill-report.jsonl";
const DEFAULT_PURINA_SITEMAP_TARGET_INPUTS = [
  ".tmp/purinaproplan-sitemap-catalog-targets.json",
  ".tmp/purinaone-sitemap-catalog-targets.json",
  ".tmp/fancyfeast-sitemap-catalog-targets.json",
  ".tmp/friskies-sitemap-catalog-targets.json",
];
const DEFAULT_PURINA_OFFICIAL_PRODUCT_INPUT = ".tmp/purina-official-product-data.json";
const DEFAULT_PURINA_OFFICIAL_PRODUCT_REPORT = ".tmp/purina-official-product-backfill-report.jsonl";
const DEFAULT_FROMM_SITEMAP_TARGET_INPUT = ".tmp/fromm-sitemap-catalog-targets.json";
const DEFAULT_FROMM_OFFICIAL_PRODUCT_INPUT = ".tmp/fromm-official-product-data.json";
const DEFAULT_FROMM_OFFICIAL_PRODUCT_REPORT = ".tmp/fromm-official-product-backfill-report.jsonl";
const DEFAULT_TASTEOFTHEWILD_SITEMAP_TARGET_INPUT = ".tmp/tasteofthewild-sitemap-catalog-targets.json";
const DEFAULT_TASTEOFTHEWILD_OFFICIAL_PRODUCT_INPUT = ".tmp/tasteofthewild-official-product-data.json";
const DEFAULT_TASTEOFTHEWILD_OFFICIAL_PRODUCT_REPORT = ".tmp/tasteofthewild-official-product-backfill-report.jsonl";
const DEFAULT_ACANA_SITEMAP_TARGET_INPUT = ".tmp/acana-sitemap-catalog-targets.json";
const DEFAULT_ACANA_OFFICIAL_PRODUCT_INPUT = ".tmp/acana-official-product-data.json";
const DEFAULT_ACANA_OFFICIAL_PRODUCT_REPORT = ".tmp/acana-official-product-backfill-report.jsonl";
const DEFAULT_ORIJEN_SITEMAP_TARGET_INPUT = ".tmp/orijen-sitemap-catalog-targets.json";
const DEFAULT_ORIJEN_OFFICIAL_PRODUCT_INPUT = ".tmp/orijen-official-product-data.json";
const DEFAULT_ORIJEN_OFFICIAL_PRODUCT_REPORT = ".tmp/orijen-official-product-backfill-report.jsonl";
const DEFAULT_ZIGNATURE_SITEMAP_TARGET_INPUT = ".tmp/zignature-sitemap-catalog-targets.json";
const DEFAULT_ZIGNATURE_OFFICIAL_PRODUCT_INPUT = ".tmp/zignature-official-product-data.json";
const DEFAULT_ZIGNATURE_OFFICIAL_PRODUCT_REPORT = ".tmp/zignature-official-product-backfill-report.jsonl";
const DEFAULT_PRECOMPUTE_INPUT = ".tmp/precompute-eligible-targets.json";
const DEFAULT_PRECOMPUTE_REPORT = ".tmp/precompute-report.jsonl";
const DEFAULT_PRECOMPUTE_ELIGIBLE_EXPORT = ".tmp/precompute-eligible-targets.json";
const DEFAULT_SPECIES_MIGRATION_REPORT = ".tmp/analysis-cache-species-migration.jsonl";
const DEFAULT_NUTRIENT_VALIDATED_INPUT = ".tmp/nutrient-panel-validated-current-targets.json";
const DEFAULT_NUTRIENT_RESEARCH_TARGET_EXPORT = ".tmp/nutrient-panel-targets-sanitized.json";
const DEFAULT_NUTRIENT_INPUT = fs.existsSync(path.resolve(root, DEFAULT_NUTRIENT_VALIDATED_INPUT))
  ? DEFAULT_NUTRIENT_VALIDATED_INPUT
  : DEFAULT_NUTRIENT_RESEARCH_TARGET_EXPORT;
const DEFAULT_NUTRIENT_REPORT = ".tmp/nutrient-panel-backfill-report.jsonl";
const DEFAULT_NUTRIENT_TARGET_EXPORT = ".tmp/nutrient-panel-normalized-targets.json";
const DEFAULT_NUTRIENT_RESEARCH_BATCH_EXPORT = ".tmp/nutrient-panel-research-batches.json";
const DEFAULT_OUTPUT = ".tmp/catalog-growth-readiness.json";
const DEFAULT_CONCURRENCY = 3;
const MAX_RECOMMENDED_CONCURRENCY = 8;
const DEFAULT_MIN_BACKFILL_TARGETS = 3000;
const DEFAULT_MIN_PRECOMPUTE_TARGETS = 8000;
const DEFAULT_MIN_NUTRIENT_TARGETS = 500;
const NUTRIENT_PERCENT_FIELDS = [
  "protein_pct",
  "fat_pct",
  "fiber_pct",
  "moisture_pct",
  "ash_pct",
  "calcium_pct",
  "phosphorus_pct",
  "omega_3_pct",
  "omega_6_pct",
];
const NUTRIENT_CALORIE_FIELDS = ["calories_per_cup", "calories_per_kg"];

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const noOutput = args.includes("--no-output");
const fastScoresOnly = args.includes("--fast-scores-only");

function argValue(name, fallback) {
  const arg = args.find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : fallback;
}

const backfillInput = argValue("--backfill-input", DEFAULT_BACKFILL_INPUT);
const backfillReport = argValue("--backfill-report", DEFAULT_BACKFILL_REPORT);
const backfillMissingExport = argValue("--backfill-missing-export", DEFAULT_BACKFILL_MISSING_EXPORT);
const haloOfficialProductInput = argValue("--halo-official-product-input", DEFAULT_HALO_OFFICIAL_PRODUCT_INPUT);
const haloOfficialProductReport = argValue("--halo-official-product-report", DEFAULT_HALO_OFFICIAL_PRODUCT_REPORT);
const bluebuffaloOfficialProductInput = argValue("--bluebuffalo-official-product-input", DEFAULT_BLUEBUFFALO_OFFICIAL_PRODUCT_INPUT);
const bluebuffaloOfficialProductReport = argValue("--bluebuffalo-official-product-report", DEFAULT_BLUEBUFFALO_OFFICIAL_PRODUCT_REPORT);
const merrickOfficialProductInput = argValue("--merrick-official-product-input", DEFAULT_MERRICK_OFFICIAL_PRODUCT_INPUT);
const merrickOfficialProductReport = argValue("--merrick-official-product-report", DEFAULT_MERRICK_OFFICIAL_PRODUCT_REPORT);
const wellnessOfficialProductInput = argValue("--wellness-official-product-input", DEFAULT_WELLNESS_OFFICIAL_PRODUCT_INPUT);
const wellnessOfficialProductReport = argValue("--wellness-official-product-report", DEFAULT_WELLNESS_OFFICIAL_PRODUCT_REPORT);
const canidaeOfficialProductInput = argValue("--canidae-official-product-input", DEFAULT_CANIDAE_OFFICIAL_PRODUCT_INPUT);
const canidaeOfficialProductReport = argValue("--canidae-official-product-report", DEFAULT_CANIDAE_OFFICIAL_PRODUCT_REPORT);
const hillspetOfficialProductInput = argValue("--hillspet-official-product-input", DEFAULT_HILLSPET_OFFICIAL_PRODUCT_INPUT);
const hillspetOfficialProductReport = argValue("--hillspet-official-product-report", DEFAULT_HILLSPET_OFFICIAL_PRODUCT_REPORT);
const openfarmOfficialProductInput = argValue("--openfarm-official-product-input", DEFAULT_OPENFARM_OFFICIAL_PRODUCT_INPUT);
const openfarmOfficialProductReport = argValue("--openfarm-official-product-report", DEFAULT_OPENFARM_OFFICIAL_PRODUCT_REPORT);
const royalcaninOfficialProductInput = argValue("--royalcanin-official-product-input", DEFAULT_ROYALCANIN_OFFICIAL_PRODUCT_INPUT);
const royalcaninOfficialProductReport = argValue("--royalcanin-official-product-report", DEFAULT_ROYALCANIN_OFFICIAL_PRODUCT_REPORT);
const freshpetOfficialProductInput = argValue("--freshpet-official-product-input", DEFAULT_FRESHPET_OFFICIAL_PRODUCT_INPUT);
const freshpetOfficialProductReport = argValue("--freshpet-official-product-report", DEFAULT_FRESHPET_OFFICIAL_PRODUCT_REPORT);
const weruvaOfficialProductInput = argValue("--weruva-official-product-input", DEFAULT_WERUVA_OFFICIAL_PRODUCT_INPUT);
const weruvaOfficialProductReport = argValue("--weruva-official-product-report", DEFAULT_WERUVA_OFFICIAL_PRODUCT_REPORT);
const tikipetsOfficialProductInput = argValue("--tikipets-official-product-input", DEFAULT_TIKIPETS_OFFICIAL_PRODUCT_INPUT);
const tikipetsOfficialProductReport = argValue("--tikipets-official-product-report", DEFAULT_TIKIPETS_OFFICIAL_PRODUCT_REPORT);
const purinaOfficialProductInput = argValue("--purina-official-product-input", DEFAULT_PURINA_OFFICIAL_PRODUCT_INPUT);
const purinaOfficialProductReport = argValue("--purina-official-product-report", DEFAULT_PURINA_OFFICIAL_PRODUCT_REPORT);
const frommOfficialProductInput = argValue("--fromm-official-product-input", DEFAULT_FROMM_OFFICIAL_PRODUCT_INPUT);
const frommOfficialProductReport = argValue("--fromm-official-product-report", DEFAULT_FROMM_OFFICIAL_PRODUCT_REPORT);
const tasteofthewildOfficialProductInput = argValue("--tasteofthewild-official-product-input", DEFAULT_TASTEOFTHEWILD_OFFICIAL_PRODUCT_INPUT);
const tasteofthewildOfficialProductReport = argValue("--tasteofthewild-official-product-report", DEFAULT_TASTEOFTHEWILD_OFFICIAL_PRODUCT_REPORT);
const acanaOfficialProductInput = argValue("--acana-official-product-input", DEFAULT_ACANA_OFFICIAL_PRODUCT_INPUT);
const acanaOfficialProductReport = argValue("--acana-official-product-report", DEFAULT_ACANA_OFFICIAL_PRODUCT_REPORT);
const orijenOfficialProductInput = argValue("--orijen-official-product-input", DEFAULT_ORIJEN_OFFICIAL_PRODUCT_INPUT);
const orijenOfficialProductReport = argValue("--orijen-official-product-report", DEFAULT_ORIJEN_OFFICIAL_PRODUCT_REPORT);
const zignatureOfficialProductInput = argValue("--zignature-official-product-input", DEFAULT_ZIGNATURE_OFFICIAL_PRODUCT_INPUT);
const zignatureOfficialProductReport = argValue("--zignature-official-product-report", DEFAULT_ZIGNATURE_OFFICIAL_PRODUCT_REPORT);
const precomputeInput = argValue("--precompute-input", DEFAULT_PRECOMPUTE_INPUT);
const precomputeReport = argValue("--precompute-report", DEFAULT_PRECOMPUTE_REPORT);
const precomputeEligibleExport = argValue("--precompute-eligible-export", DEFAULT_PRECOMPUTE_ELIGIBLE_EXPORT);
const speciesMigrationReport = argValue("--species-migration-report", DEFAULT_SPECIES_MIGRATION_REPORT);
const nutrientInput = argValue("--nutrient-input", DEFAULT_NUTRIENT_INPUT);
const nutrientReport = argValue("--nutrient-report", DEFAULT_NUTRIENT_REPORT);
const nutrientTargetExport = argValue("--nutrient-target-export", DEFAULT_NUTRIENT_TARGET_EXPORT);
const nutrientResearchTargetExport = argValue("--nutrient-research-target-export", DEFAULT_NUTRIENT_RESEARCH_TARGET_EXPORT);
const nutrientResearchBatchExport = argValue("--nutrient-research-batches-export", DEFAULT_NUTRIENT_RESEARCH_BATCH_EXPORT);
const output = argValue("--output", DEFAULT_OUTPUT);
const concurrency = Number(argValue("--concurrency", String(DEFAULT_CONCURRENCY)));
const minBackfillTargets = Number(argValue("--min-backfill-targets", String(DEFAULT_MIN_BACKFILL_TARGETS)));
const minPrecomputeTargets = Number(argValue("--min-precompute-targets", String(DEFAULT_MIN_PRECOMPUTE_TARGETS)));
const minNutrientTargets = Number(argValue("--min-nutrient-targets", String(DEFAULT_MIN_NUTRIENT_TARGETS)));

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run check:catalog-growth
  npm run check:catalog-growth -- --strict --output=.tmp/catalog-growth-readiness.json

Options:
  --backfill-input=path.json             Catalog target manifest for product-lookup backfill
  --backfill-report=path.jsonl           Resumable catalog-backfill report path
  --backfill-missing-export=path.json    Refreshed missing-target export path
  --halo-official-product-input=path.json
                                       Parsed official Halo ingredients/nutrients input
  --halo-official-product-report=path.jsonl
                                       Resumable official Halo product-data write report
  --bluebuffalo-official-product-input=path.json
                                       Parsed official Blue Buffalo ingredients/nutrients input
  --bluebuffalo-official-product-report=path.jsonl
                                       Resumable official Blue Buffalo product-data write report
  --merrick-official-product-input=path.json
                                       Parsed official Merrick ingredients/nutrients input
  --merrick-official-product-report=path.jsonl
                                       Resumable official Merrick product-data write report
  --wellness-official-product-input=path.json
                                       Parsed official Wellness ingredients/nutrients input
  --wellness-official-product-report=path.jsonl
                                       Resumable official Wellness product-data write report
  --canidae-official-product-input=path.json
                                       Parsed official Canidae ingredients/nutrients input
  --canidae-official-product-report=path.jsonl
                                       Resumable official Canidae product-data write report
  --hillspet-official-product-input=path.json
                                       Parsed official Hill's ingredients/nutrients input
  --hillspet-official-product-report=path.jsonl
                                       Resumable official Hill's product-data write report
  --openfarm-official-product-input=path.json
                                       Parsed official Open Farm ingredients/nutrients input
  --openfarm-official-product-report=path.jsonl
                                       Resumable official Open Farm product-data write report
  --royalcanin-official-product-input=path.json
                                       Parsed official Royal Canin ingredients/nutrients input
  --royalcanin-official-product-report=path.jsonl
                                       Resumable official Royal Canin product-data write report
  --freshpet-official-product-input=path.json
                                       Parsed official Freshpet ingredients/nutrients input
  --freshpet-official-product-report=path.jsonl
                                       Resumable official Freshpet product-data write report
  --weruva-official-product-input=path.json
                                       Parsed official Weruva ingredients/nutrients input
  --weruva-official-product-report=path.jsonl
                                       Resumable official Weruva product-data write report
  --tikipets-official-product-input=path.json
                                       Parsed official Tiki Pets ingredients/nutrients input
  --tikipets-official-product-report=path.jsonl
                                       Resumable official Tiki Pets product-data write report
  --purina-official-product-input=path.json
                                       Parsed official Purina-family ingredients input
  --purina-official-product-report=path.jsonl
                                       Resumable official Purina-family product-data write report
  --fromm-official-product-input=path.json
                                       Parsed official Fromm ingredients/nutrients input
  --fromm-official-product-report=path.jsonl
                                       Resumable official Fromm product-data write report
  --tasteofthewild-official-product-input=path.json
                                       Parsed official Taste of the Wild ingredients/nutrients input
  --tasteofthewild-official-product-report=path.jsonl
                                       Resumable official Taste of the Wild product-data write report
  --acana-official-product-input=path.json
                                       Parsed official ACANA ingredients/nutrients input
  --acana-official-product-report=path.jsonl
                                       Resumable official ACANA product-data write report
  --orijen-official-product-input=path.json
                                       Parsed official ORIJEN ingredients/nutrients input
  --orijen-official-product-report=path.jsonl
                                       Resumable official ORIJEN product-data write report
  --zignature-official-product-input=path.json
                                       Parsed official Zignature-family ingredients/nutrients input
  --zignature-official-product-report=path.jsonl
                                       Resumable official Zignature-family product-data write report
  --precompute-input=path.json           Existing analysis-cache eligible-target manifest
  --precompute-report=path.jsonl         Resumable analysis precompute report path
  --precompute-eligible-export=path.json Refreshed eligible analysis-cache export path
  --species-migration-report=path.jsonl  Resumable analysis-cache species-key migration report path
  --nutrient-input=path.json             Validated nutrient-panel input with cacheKey + nutrientPanel
  --nutrient-report=path.jsonl           Resumable nutrient-panel backfill report path
  --nutrient-target-export=path.json     Normalized nutrient-panel target export path
  --nutrient-research-target-export=path.json
                                       Redacted missing-panel research target export path
  --nutrient-research-batches-export=path.json
                                       Redacted nutrient research batch export path
  --min-backfill-targets=N               Required pending or already verified catalog rows (default ${DEFAULT_MIN_BACKFILL_TARGETS})
  --min-precompute-targets=N             Required pending or already verified score-cache rows (default ${DEFAULT_MIN_PRECOMPUTE_TARGETS})
  --min-nutrient-targets=N               Required write-ready or already verified nutrient panels (default ${DEFAULT_MIN_NUTRIENT_TARGETS})
  --output=path.json                     Write redacted readiness report (default ${DEFAULT_OUTPUT})
  --concurrency=N                        Recommended service-key batch concurrency, 1-${MAX_RECOMMENDED_CONCURRENCY}
  --strict                               Exit nonzero when required files or service keys are missing
  --fast-scores-only                     Gate only analysis-cache precompute readiness for fast score loading
  --no-output                            Print only; do not write the readiness report
`);
  process.exit(message ? 1 : 0);
}

function assertArgs() {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_RECOMMENDED_CONCURRENCY) {
    usage(`--concurrency must be an integer between 1 and ${MAX_RECOMMENDED_CONCURRENCY}.`);
  }
  if (!Number.isInteger(minBackfillTargets) || minBackfillTargets < 0) {
    usage("--min-backfill-targets must be a non-negative integer.");
  }
  if (!Number.isInteger(minPrecomputeTargets) || minPrecomputeTargets < 0) {
    usage("--min-precompute-targets must be a non-negative integer.");
  }
  if (!Number.isInteger(minNutrientTargets) || minNutrientTargets < 0) {
    usage("--min-nutrient-targets must be a non-negative integer.");
  }
}

function resolveRepoPath(value) {
  return path.resolve(root, value);
}

function relativeRepoPath(value) {
  return path.relative(root, resolveRepoPath(value)) || ".";
}

function readJsonManifest(file) {
  const absolutePath = resolveRepoPath(file);
  const relativePath = relativeRepoPath(file);
  if (!fs.existsSync(absolutePath)) {
    return { path: relativePath, exists: false, targets: [], summary: {}, error: "missing" };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    const targets = Array.isArray(parsed) ? parsed : Array.isArray(parsed.targets) ? parsed.targets : [];
    return {
      path: relativePath,
      exists: true,
      targetCount: targets.length,
      targets,
      generatedAt: parsed.generatedAt || "",
      source: parsed.source || "",
      summary: parsed.summary || {},
      metrics: {
        sourceAnalysisReadyRows: parsed.sourceAnalysisReadyRows,
        analysisReadyRows: parsed.analysisReadyRows,
        excludedNonCompleteFoodRows: parsed.excludedNonCompleteFoodRows,
        eligibleCount: parsed.eligibleCount,
        mergedCount: parsed.mergedCount,
        inputCount: parsed.inputCount,
        freshCacheMode: parsed.freshCacheMode,
        freshCacheRows: parsed.freshCacheRows,
      },
    };
  } catch (err) {
    return { path: relativePath, exists: true, targets: [], summary: {}, error: err.message };
  }
}

function countBy(entries, keyFn, keyName) {
  const counts = new Map();
  for (const entry of entries) {
    const value = keyFn(entry) || "unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])))
    .slice(0, 12);
}

function summarizeTargetManifest(manifest) {
  const targets = manifest.targets || [];
  return {
    path: manifest.path,
    exists: manifest.exists,
    error: manifest.error || null,
    targetCount: manifest.targetCount || 0,
    generatedAt: manifest.generatedAt || "",
    source: manifest.source || "",
    metrics: manifest.metrics || {},
    byPetType: countBy(targets, (target) => target.petType || target.pet_type || target.species, "petType"),
    bySource: countBy(targets, (target) => target.source || target.sourceFile, "source"),
  };
}

function numericValue(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nutrientPanelStatus(entry) {
  const cacheKey = String(entry?.cacheKey || entry?.cache_key || "").trim();
  if (!cacheKey) return { valid: false, reason: "missing_cache_key" };
  const panel = entry?.nutrientPanel || entry?.nutrient_panel || entry?.panel;
  if (!panel) return { valid: false, reason: "missing_nutrient_panel" };
  if (typeof panel !== "object" || Array.isArray(panel)) {
    return { valid: false, reason: "nutrient_panel_not_object" };
  }
  const basis = String(panel.basis || "").trim();
  if (!["as-fed", "dry-matter"].includes(basis)) {
    return { valid: false, reason: "invalid_or_missing_basis" };
  }

  let numericCount = 0;
  for (const field of NUTRIENT_PERCENT_FIELDS) {
    const numeric = numericValue(panel[field]);
    if (numeric == null) continue;
    if (numeric < 0 || numeric > 100) {
      return { valid: false, reason: `invalid_percentage_${field}` };
    }
    numericCount += 1;
  }
  for (const field of NUTRIENT_CALORIE_FIELDS) {
    const numeric = numericValue(panel[field]);
    if (numeric == null) continue;
    if (numeric < 0 || numeric > 10000) {
      return { valid: false, reason: `invalid_calorie_${field}` };
    }
    numericCount += 1;
  }
  if (numericCount < 2) return { valid: false, reason: "nutrient_panel_too_sparse" };
  return { valid: true, reason: null, basis };
}

function summarizeNutrientManifest(manifest) {
  const targets = manifest.targets || [];
  const invalidReasons = new Map();
  const basisCounts = new Map();
  let validTargetCount = 0;
  let withSourceUrl = 0;
  for (const target of targets) {
    const status = nutrientPanelStatus(target);
    if (!status.valid) {
      invalidReasons.set(status.reason, (invalidReasons.get(status.reason) || 0) + 1);
      continue;
    }
    validTargetCount += 1;
    basisCounts.set(status.basis, (basisCounts.get(status.basis) || 0) + 1);
    const panel = target.nutrientPanel || target.nutrient_panel || target.panel || {};
    if (panel.source_url || target.sourceUrl || target.source_url) withSourceUrl += 1;
  }
  return {
    path: manifest.path,
    exists: manifest.exists,
    error: manifest.error || null,
    targetCount: manifest.targetCount || 0,
    validTargetCount,
    invalidTargetCount: Math.max(0, (manifest.targetCount || 0) - validTargetCount),
    generatedAt: manifest.generatedAt || "",
    source: manifest.source || "",
    metrics: manifest.metrics || {},
    byPetType: countBy(targets, (target) => target.petType || target.pet_type || target.species, "petType"),
    bySource: countBy(targets, (target) => target.source || target.sourceFile, "source"),
    byBasis: [...basisCounts.entries()]
      .map(([basis, count]) => ({ basis, count }))
      .sort((a, b) => b.count - a.count || a.basis.localeCompare(b.basis)),
    invalidReasons: [...invalidReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
      .slice(0, 12),
    withSourceUrl,
  };
}

function officialProductDataStatus(entry) {
  const cacheKey = String(entry?.cacheKey || entry?.cache_key || "").trim();
  if (!cacheKey) return { valid: false, reason: "missing_cache_key" };
  const ingredients = Array.isArray(entry?.ingredients) ? entry.ingredients : [];
  if (ingredients.length < 5) return { valid: false, reason: "missing_or_sparse_ingredients" };
  if (ingredients.some((ingredient) => /https?:|<|>|\{|\}/i.test(String(ingredient || "")))) {
    return { valid: false, reason: "ingredient_payload_contamination" };
  }
  const panel = entry?.nutrientPanel || entry?.nutrient_panel || entry?.panel || null;
  if (panel) {
    const panelStatus = nutrientPanelStatus({ cacheKey, nutrientPanel: panel });
    if (!panelStatus.valid) return { valid: false, reason: `invalid_nutrient_panel_${panelStatus.reason}` };
  }
  return { valid: true, reason: null, hasNutrients: Boolean(panel) };
}

function summarizeOfficialProductDataManifest(manifest) {
  const targets = manifest.targets || [];
  const invalidReasons = new Map();
  let validTargetCount = 0;
  let withNutrients = 0;
  let ingredientTotal = 0;
  for (const target of targets) {
    const status = officialProductDataStatus(target);
    if (!status.valid) {
      invalidReasons.set(status.reason, (invalidReasons.get(status.reason) || 0) + 1);
      continue;
    }
    validTargetCount += 1;
    ingredientTotal += Array.isArray(target.ingredients) ? target.ingredients.length : 0;
    if (status.hasNutrients) withNutrients += 1;
  }
  return {
    path: manifest.path,
    exists: manifest.exists,
    error: manifest.error || null,
    targetCount: manifest.targetCount || 0,
    validTargetCount,
    invalidTargetCount: Math.max(0, (manifest.targetCount || 0) - validTargetCount),
    withNutrients,
    avgIngredientCount: validTargetCount > 0 ? Number((ingredientTotal / validTargetCount).toFixed(1)) : 0,
    generatedAt: manifest.generatedAt || "",
    source: manifest.source || "",
    metrics: manifest.metrics || {},
    byPetType: countBy(targets, (target) => target.petType || target.pet_type || target.species, "petType"),
    bySource: countBy(targets, (target) => target.source || target.sourceFile, "source"),
    invalidReasons: [...invalidReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
      .slice(0, 12),
  };
}

function readJsonlReport(file, expectedEvent, verifiedStatuses = ["verified_saved", "verified_cached"]) {
  const absolutePath = resolveRepoPath(file);
  const relativePath = relativeRepoPath(file);
  if (!fs.existsSync(absolutePath)) {
    return { path: relativePath, exists: false, lineCount: 0, events: {}, statuses: {}, verifiedCount: 0 };
  }
  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/).filter(Boolean);
  const events = {};
  const statuses = {};
  let invalid = 0;
  let verifiedCount = 0;
  let latestDone = null;
  let latestTimestamp = "";
  let latestVerifiedTimestamp = "";
  let latestFatal = null;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const event = String(entry.event || "unknown");
      const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : "";
      if (timestamp && (!latestTimestamp || Date.parse(timestamp) > Date.parse(latestTimestamp))) {
        latestTimestamp = timestamp;
      }
      events[event] = (events[event] || 0) + 1;
      if (entry.status) statuses[entry.status] = (statuses[entry.status] || 0) + 1;
      if (event === expectedEvent && verifiedStatuses.includes(entry.status)) {
        verifiedCount += 1;
        if (timestamp && (!latestVerifiedTimestamp || Date.parse(timestamp) > Date.parse(latestVerifiedTimestamp))) {
          latestVerifiedTimestamp = timestamp;
        }
      }
      if (entry.status === "fatal_failed") {
        latestFatal = {
          event,
          timestamp,
          status: entry.status,
          fatal_reason: entry.fatal_reason,
          http_status: entry.http_status,
        };
      }
      if (event.endsWith("_done")) latestDone = {
        event,
        timestamp,
        verified_saved: entry.verified_saved,
        verified_cached: entry.verified_cached,
        accepted: entry.accepted,
        unverified: entry.unverified,
        failed: entry.failed,
        not_found: entry.not_found,
      };
    } catch {
      invalid += 1;
    }
  }
  return {
    path: relativePath,
    exists: true,
    lineCount: lines.length,
    invalid,
    events,
    statuses,
    verifiedCount,
    latestTimestamp,
    latestVerifiedTimestamp,
    latestFatal,
    latestDone,
  };
}

function timestampMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : 0;
}

function buildWarnings({
  backfillManifest,
  precomputeManifest,
  nutrientManifest,
  backfillReportState,
  precomputeReportState,
  speciesMigrationReportState,
  nutrientReportState,
  haloOfficialProductReportState,
  bluebuffaloOfficialProductReportState,
  merrickOfficialProductReportState,
  wellnessOfficialProductReportState,
  canidaeOfficialProductReportState,
  hillspetOfficialProductReportState,
  openfarmOfficialProductReportState,
  royalcaninOfficialProductReportState,
  freshpetOfficialProductReportState,
  weruvaOfficialProductReportState,
  tikipetsOfficialProductReportState,
  purinaOfficialProductReportState,
  frommOfficialProductReportState,
  tasteofthewildOfficialProductReportState,
  acanaOfficialProductReportState,
  orijenOfficialProductReportState,
  zignatureOfficialProductReportState,
}) {
  const warnings = [];
  if (backfillReportState.latestFatal) {
    warnings.push(`catalog backfill report contains a fatal failure (${backfillReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/upstream limits before resuming`);
  }
  if (precomputeReportState.latestFatal) {
    warnings.push(`score precompute report contains a fatal failure (${precomputeReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/upstream limits before resuming`);
  }
  if (speciesMigrationReportState.latestFatal) {
    warnings.push(`analysis-cache species migration report contains a fatal failure (${speciesMigrationReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/cache state before resuming`);
  }
  if (nutrientReportState.latestFatal) {
    warnings.push(`nutrient-panel report contains a fatal failure (${nutrientReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (haloOfficialProductReportState.latestFatal) {
    warnings.push(`Halo official product-data report contains a fatal failure (${haloOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (bluebuffaloOfficialProductReportState.latestFatal) {
    warnings.push(`Blue Buffalo official product-data report contains a fatal failure (${bluebuffaloOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (merrickOfficialProductReportState.latestFatal) {
    warnings.push(`Merrick official product-data report contains a fatal failure (${merrickOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (wellnessOfficialProductReportState.latestFatal) {
    warnings.push(`Wellness official product-data report contains a fatal failure (${wellnessOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (canidaeOfficialProductReportState.latestFatal) {
    warnings.push(`Canidae official product-data report contains a fatal failure (${canidaeOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (hillspetOfficialProductReportState.latestFatal) {
    warnings.push(`Hill's official product-data report contains a fatal failure (${hillspetOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (openfarmOfficialProductReportState.latestFatal) {
    warnings.push(`Open Farm official product-data report contains a fatal failure (${openfarmOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (royalcaninOfficialProductReportState.latestFatal) {
    warnings.push(`Royal Canin official product-data report contains a fatal failure (${royalcaninOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (freshpetOfficialProductReportState.latestFatal) {
    warnings.push(`Freshpet official product-data report contains a fatal failure (${freshpetOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (weruvaOfficialProductReportState.latestFatal) {
    warnings.push(`Weruva official product-data report contains a fatal failure (${weruvaOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (tikipetsOfficialProductReportState.latestFatal) {
    warnings.push(`Tiki Pets official product-data report contains a fatal failure (${tikipetsOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (purinaOfficialProductReportState.latestFatal) {
    warnings.push(`Purina official product-data report contains a fatal failure (${purinaOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (frommOfficialProductReportState.latestFatal) {
    warnings.push(`Fromm official product-data report contains a fatal failure (${frommOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (tasteofthewildOfficialProductReportState.latestFatal) {
    warnings.push(`Taste of the Wild official product-data report contains a fatal failure (${tasteofthewildOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (acanaOfficialProductReportState.latestFatal) {
    warnings.push(`ACANA official product-data report contains a fatal failure (${acanaOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (orijenOfficialProductReportState.latestFatal) {
    warnings.push(`ORIJEN official product-data report contains a fatal failure (${orijenOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (zignatureOfficialProductReportState.latestFatal) {
    warnings.push(`Zignature official product-data report contains a fatal failure (${zignatureOfficialProductReportState.latestFatal.fatal_reason || "unknown"}); verify service keys/input quality before resuming`);
  }
  if (
    timestampMs(backfillReportState.latestVerifiedTimestamp) > 0 &&
    timestampMs(precomputeManifest.generatedAt) > 0 &&
    timestampMs(backfillReportState.latestVerifiedTimestamp) > timestampMs(precomputeManifest.generatedAt)
  ) {
    warnings.push("analysis precompute manifest is older than the latest verified catalog backfill; keep the backfill JSONL in the precompute --input list or regenerate the eligible manifest");
  }
  if (
    timestampMs(precomputeReportState.latestVerifiedTimestamp) > 0 &&
    timestampMs(precomputeManifest.generatedAt) > 0 &&
    timestampMs(precomputeReportState.latestVerifiedTimestamp) > timestampMs(precomputeManifest.generatedAt)
  ) {
    warnings.push("analysis precompute manifest is older than verified precompute report rows; use --resume-report and refresh --export-eligible after the batch");
  }
  if (
    timestampMs(backfillReportState.latestVerifiedTimestamp) > 0 &&
    timestampMs(backfillManifest.generatedAt) > 0 &&
    timestampMs(backfillReportState.latestVerifiedTimestamp) > timestampMs(backfillManifest.generatedAt)
  ) {
    warnings.push("catalog backfill input is older than verified saved rows in the report; use --resume-report and refresh --export-missing after the batch");
  }
  if (
    timestampMs(nutrientReportState.latestVerifiedTimestamp) > 0 &&
    timestampMs(nutrientManifest.generatedAt) > 0 &&
    timestampMs(nutrientReportState.latestVerifiedTimestamp) > timestampMs(nutrientManifest.generatedAt)
  ) {
    warnings.push("nutrient-panel input is older than verified saved rows in the report; use --resume-report and refresh --export-targets after the batch");
  }
  return warnings;
}

function hasEnv(...names) {
  return names.some((name) => Boolean(process.env[name]));
}

function commandPath(value) {
  return value.replace(/'/g, "'\"'\"'");
}

function existingCommandInputs(...files) {
  return files
    .map((file) => String(file || "").trim())
    .filter(Boolean)
    .filter((file) => fs.existsSync(resolveRepoPath(file)));
}

function buildCommands() {
  const backfill = [
    "PRODUCT_LOOKUP_SERVICE_KEY=...",
    "npm run backfill:catalog --",
    `--input='${commandPath(backfillInput)}'`,
    "--input-only",
    `--report='${commandPath(backfillReport)}'`,
    "--resume-report",
    `--export-missing='${commandPath(backfillMissingExport)}'`,
    `--concurrency=${concurrency}`,
  ].join(" ");
  const precomputeInputs = `${precomputeInput},${backfillReport}`;
  const precomputeDemandInputs = existingCommandInputs(precomputeInput, backfillReport, precomputeReport);
  const precompute = [
    "ANALYZE_SERVICE_KEY=...",
    "npm run precompute:analysis --",
    `--input='${commandPath(precomputeInputs)}'`,
    ...(precomputeDemandInputs.length > 0
      ? [`--demand-input='${commandPath(precomputeDemandInputs.join(","))}'`]
      : []),
    "--input-only",
    `--report='${commandPath(precomputeReport)}'`,
    "--resume-report",
    `--export-eligible='${commandPath(precomputeEligibleExport)}'`,
    `--concurrency=${concurrency}`,
  ].join(" ");
  const precomputeEligibleRefresh = [
    "npm run precompute:analysis --",
    "--dry-run",
    ...(precomputeDemandInputs.length > 0
      ? [`--demand-input='${commandPath(precomputeDemandInputs.join(","))}'`]
      : []),
    `--report='${commandPath(precomputeReport)}'`,
    "--resume-report",
    `--export-eligible='${commandPath(precomputeEligibleExport)}'`,
  ].join(" ");
  const speciesMigration = [
    "ANALYSIS_CACHE_MIGRATION_KEY=...",
    "npm run migrate:analysis-cache-species --",
    `--report='${commandPath(speciesMigrationReport)}'`,
    "--resume-report",
    "--batch-size=50",
  ].join(" ");
  const nutrient = [
    "NUTRIENT_PANEL_SERVICE_KEY=...",
    "npm run backfill:nutrients --",
    `--input='${commandPath(nutrientInput)}'`,
    `--export-targets='${commandPath(nutrientTargetExport)}'`,
    `--report='${commandPath(nutrientReport)}'`,
    "--resume-report",
    `--concurrency=${concurrency}`,
  ].join(" ");
  const nutrientResearchRefresh = [
    "npm run audit:catalog --",
    "--json",
    `--export-nutrient-targets='${commandPath(nutrientResearchTargetExport)}'`,
    `--export-nutrient-research-batches='${commandPath(nutrientResearchBatchExport)}'`,
  ].join(" ");
  const haloOfficialProductBackfill = [
    "HALO_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:halo-official-products --",
    `--input='${commandPath(haloOfficialProductInput)}'`,
    `--report='${commandPath(haloOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const haloOfficialProductDryRun = [
    "npm run backfill:halo-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_HALO_SHOPIFY_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(haloOfficialProductInput)}'`,
  ].join(" ");
  const bluebuffaloOfficialProductBackfill = [
    "BLUEBUFFALO_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:bluebuffalo-official-products --",
    `--input='${commandPath(bluebuffaloOfficialProductInput)}'`,
    `--report='${commandPath(bluebuffaloOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const bluebuffaloOfficialProductDryRun = [
    "npm run backfill:bluebuffalo-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_BLUEBUFFALO_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(bluebuffaloOfficialProductInput)}'`,
  ].join(" ");
  const merrickOfficialProductBackfill = [
    "MERRICK_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:merrick-official-products --",
    `--input='${commandPath(merrickOfficialProductInput)}'`,
    `--report='${commandPath(merrickOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const merrickOfficialProductDryRun = [
    "npm run backfill:merrick-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_MERRICK_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(merrickOfficialProductInput)}'`,
  ].join(" ");
  const wellnessOfficialProductBackfill = [
    "WELLNESS_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:wellness-official-products --",
    `--input='${commandPath(wellnessOfficialProductInput)}'`,
    `--report='${commandPath(wellnessOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const wellnessOfficialProductDryRun = [
    "npm run backfill:wellness-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_WELLNESS_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(wellnessOfficialProductInput)}'`,
  ].join(" ");
  const canidaeOfficialProductBackfill = [
    "CANIDAE_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:canidae-official-products --",
    `--input='${commandPath(canidaeOfficialProductInput)}'`,
    `--report='${commandPath(canidaeOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const canidaeOfficialProductDryRun = [
    "npm run backfill:canidae-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_CANIDAE_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(canidaeOfficialProductInput)}'`,
  ].join(" ");
  const hillspetOfficialProductBackfill = [
    "HILLSPET_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:hillspet-official-products --",
    `--input='${commandPath(hillspetOfficialProductInput)}'`,
    `--report='${commandPath(hillspetOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const hillspetOfficialProductDryRun = [
    "npm run backfill:hillspet-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_HILLSPET_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(hillspetOfficialProductInput)}'`,
  ].join(" ");
  const openfarmOfficialProductBackfill = [
    "OPENFARM_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:openfarm-official-products --",
    `--input='${commandPath(openfarmOfficialProductInput)}'`,
    `--report='${commandPath(openfarmOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const openfarmOfficialProductDryRun = [
    "npm run backfill:openfarm-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_OPENFARM_SHOPIFY_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(openfarmOfficialProductInput)}'`,
  ].join(" ");
  const royalcaninOfficialProductBackfill = [
    "ROYALCANIN_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:royalcanin-official-products --",
    `--input='${commandPath(royalcaninOfficialProductInput)}'`,
    `--report='${commandPath(royalcaninOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const royalcaninOfficialProductDryRun = [
    "npm run backfill:royalcanin-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_ROYALCANIN_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(royalcaninOfficialProductInput)}'`,
  ].join(" ");
  const freshpetOfficialProductBackfill = [
    "FRESHPET_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:freshpet-official-products --",
    `--input='${commandPath(freshpetOfficialProductInput)}'`,
    `--report='${commandPath(freshpetOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const freshpetOfficialProductDryRun = [
    "npm run backfill:freshpet-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_FRESHPET_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(freshpetOfficialProductInput)}'`,
  ].join(" ");
  const weruvaOfficialProductBackfill = [
    "WERUVA_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:weruva-official-products --",
    `--input='${commandPath(weruvaOfficialProductInput)}'`,
    `--report='${commandPath(weruvaOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const weruvaOfficialProductDryRun = [
    "npm run backfill:weruva-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_WERUVA_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(weruvaOfficialProductInput)}'`,
  ].join(" ");
  const tikipetsOfficialProductBackfill = [
    "TIKIPETS_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:tikipets-official-products --",
    `--input='${commandPath(tikipetsOfficialProductInput)}'`,
    `--report='${commandPath(tikipetsOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const tikipetsOfficialProductDryRun = [
    "npm run backfill:tikipets-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_TIKIPETS_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(tikipetsOfficialProductInput)}'`,
  ].join(" ");
  const purinaOfficialProductBackfill = [
    "PURINA_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:purina-official-products --",
    `--input='${commandPath(purinaOfficialProductInput)}'`,
    `--report='${commandPath(purinaOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const purinaOfficialProductDryRun = [
    "npm run backfill:purina-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_PURINA_SITEMAP_TARGET_INPUTS.join(","))}'`,
    `--export-parsed='${commandPath(purinaOfficialProductInput)}'`,
  ].join(" ");
  const frommOfficialProductBackfill = [
    "FROMM_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:fromm-official-products --",
    `--input='${commandPath(frommOfficialProductInput)}'`,
    `--report='${commandPath(frommOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const frommOfficialProductDryRun = [
    "npm run backfill:fromm-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_FROMM_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(frommOfficialProductInput)}'`,
  ].join(" ");
  const tasteofthewildOfficialProductBackfill = [
    "TASTEOFTHEWILD_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:tasteofthewild-official-products --",
    `--input='${commandPath(tasteofthewildOfficialProductInput)}'`,
    `--report='${commandPath(tasteofthewildOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const tasteofthewildOfficialProductDryRun = [
    "npm run backfill:tasteofthewild-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_TASTEOFTHEWILD_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(tasteofthewildOfficialProductInput)}'`,
  ].join(" ");
  const acanaOfficialProductBackfill = [
    "ACANA_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:acana-official-products --",
    `--input='${commandPath(acanaOfficialProductInput)}'`,
    `--report='${commandPath(acanaOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const acanaOfficialProductDryRun = [
    "npm run backfill:acana-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_ACANA_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(acanaOfficialProductInput)}'`,
  ].join(" ");
  const orijenOfficialProductBackfill = [
    "ORIJEN_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:orijen-official-products --",
    `--input='${commandPath(orijenOfficialProductInput)}'`,
    `--report='${commandPath(orijenOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const orijenOfficialProductDryRun = [
    "npm run backfill:orijen-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_ORIJEN_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(orijenOfficialProductInput)}'`,
  ].join(" ");
  const zignatureOfficialProductBackfill = [
    "ZIGNATURE_PRODUCT_IMPORT_SERVICE_KEY=...",
    "npm run backfill:zignature-official-products --",
    `--input='${commandPath(zignatureOfficialProductInput)}'`,
    `--report='${commandPath(zignatureOfficialProductReport)}'`,
    "--resume-report",
    `--concurrency=${Math.min(concurrency, 4)}`,
  ].join(" ");
  const zignatureOfficialProductDryRun = [
    "npm run backfill:zignature-official-products --",
    "--dry-run",
    `--input='${commandPath(DEFAULT_ZIGNATURE_SITEMAP_TARGET_INPUT)}'`,
    `--export-parsed='${commandPath(zignatureOfficialProductInput)}'`,
  ].join(" ");
  return {
    backfill,
    haloOfficialProductBackfill,
    haloOfficialProductDryRun,
    bluebuffaloOfficialProductBackfill,
    bluebuffaloOfficialProductDryRun,
    merrickOfficialProductBackfill,
    merrickOfficialProductDryRun,
    wellnessOfficialProductBackfill,
    wellnessOfficialProductDryRun,
    canidaeOfficialProductBackfill,
    canidaeOfficialProductDryRun,
    hillspetOfficialProductBackfill,
    hillspetOfficialProductDryRun,
    openfarmOfficialProductBackfill,
    openfarmOfficialProductDryRun,
    royalcaninOfficialProductBackfill,
    royalcaninOfficialProductDryRun,
    freshpetOfficialProductBackfill,
    freshpetOfficialProductDryRun,
    weruvaOfficialProductBackfill,
    weruvaOfficialProductDryRun,
    tikipetsOfficialProductBackfill,
    tikipetsOfficialProductDryRun,
    purinaOfficialProductBackfill,
    purinaOfficialProductDryRun,
    frommOfficialProductBackfill,
    frommOfficialProductDryRun,
    tasteofthewildOfficialProductBackfill,
    tasteofthewildOfficialProductDryRun,
    acanaOfficialProductBackfill,
    acanaOfficialProductDryRun,
    orijenOfficialProductBackfill,
    orijenOfficialProductDryRun,
    zignatureOfficialProductBackfill,
    zignatureOfficialProductDryRun,
    speciesMigration,
    precompute,
    precomputeEligibleRefresh,
    nutrient,
    nutrientResearchRefresh,
  };
}

function main() {
  assertArgs();
  const backfillManifest = summarizeTargetManifest(readJsonManifest(backfillInput));
  const haloOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(haloOfficialProductInput));
  const bluebuffaloOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(bluebuffaloOfficialProductInput));
  const merrickOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(merrickOfficialProductInput));
  const wellnessOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(wellnessOfficialProductInput));
  const canidaeOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(canidaeOfficialProductInput));
  const hillspetOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(hillspetOfficialProductInput));
  const openfarmOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(openfarmOfficialProductInput));
  const royalcaninOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(royalcaninOfficialProductInput));
  const freshpetOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(freshpetOfficialProductInput));
  const weruvaOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(weruvaOfficialProductInput));
  const tikipetsOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(tikipetsOfficialProductInput));
  const purinaOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(purinaOfficialProductInput));
  const frommOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(frommOfficialProductInput));
  const tasteofthewildOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(tasteofthewildOfficialProductInput));
  const acanaOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(acanaOfficialProductInput));
  const orijenOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(orijenOfficialProductInput));
  const zignatureOfficialProductManifest = summarizeOfficialProductDataManifest(readJsonManifest(zignatureOfficialProductInput));
  const precomputeManifest = summarizeTargetManifest(readJsonManifest(precomputeInput));
  const nutrientManifest = summarizeNutrientManifest(readJsonManifest(nutrientInput));
  const backfillReportState = readJsonlReport(backfillReport, "catalog_backfill_result");
  const haloOfficialProductReportState = readJsonlReport(haloOfficialProductReport, "halo_official_product_result");
  const bluebuffaloOfficialProductReportState = readJsonlReport(bluebuffaloOfficialProductReport, "bluebuffalo_official_product_result");
  const merrickOfficialProductReportState = readJsonlReport(merrickOfficialProductReport, "merrick_official_product_result");
  const wellnessOfficialProductReportState = readJsonlReport(wellnessOfficialProductReport, "wellness_official_product_result");
  const canidaeOfficialProductReportState = readJsonlReport(canidaeOfficialProductReport, "canidae_official_product_result");
  const hillspetOfficialProductReportState = readJsonlReport(hillspetOfficialProductReport, "hillspet_official_product_result");
  const openfarmOfficialProductReportState = readJsonlReport(openfarmOfficialProductReport, "openfarm_official_product_result");
  const royalcaninOfficialProductReportState = readJsonlReport(royalcaninOfficialProductReport, "royalcanin_official_product_result");
  const freshpetOfficialProductReportState = readJsonlReport(freshpetOfficialProductReport, "freshpet_official_product_result");
  const weruvaOfficialProductReportState = readJsonlReport(weruvaOfficialProductReport, "weruva_official_product_result");
  const tikipetsOfficialProductReportState = readJsonlReport(tikipetsOfficialProductReport, "tikipets_official_product_result");
  const purinaOfficialProductReportState = readJsonlReport(purinaOfficialProductReport, "purina_official_product_result");
  const frommOfficialProductReportState = readJsonlReport(frommOfficialProductReport, "fromm_official_product_result");
  const tasteofthewildOfficialProductReportState = readJsonlReport(tasteofthewildOfficialProductReport, "tasteofthewild_official_product_result");
  const acanaOfficialProductReportState = readJsonlReport(acanaOfficialProductReport, "acana_official_product_result");
  const orijenOfficialProductReportState = readJsonlReport(orijenOfficialProductReport, "orijen_official_product_result");
  const zignatureOfficialProductReportState = readJsonlReport(zignatureOfficialProductReport, "zignature_official_product_result");
  const precomputeReportState = readJsonlReport(precomputeReport, "precompute_result");
  const speciesMigrationReportState = readJsonlReport(
    speciesMigrationReport,
    "analysis_cache_species_migration",
    ["verified_migrated"]
  );
  const nutrientReportState = readJsonlReport(nutrientReport, "nutrient_panel_result");
  const env = {
    productLookupServiceKey: hasEnv("PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    analyzeServiceKey: hasEnv("ANALYZE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    analysisCacheMigrationKey: hasEnv("ANALYSIS_CACHE_MIGRATION_KEY", "ANALYZE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    nutrientPanelServiceKey: hasEnv("NUTRIENT_PANEL_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    haloOfficialProductImportKey: hasEnv("HALO_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    bluebuffaloOfficialProductImportKey: hasEnv("BLUEBUFFALO_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    merrickOfficialProductImportKey: hasEnv("MERRICK_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    wellnessOfficialProductImportKey: hasEnv("WELLNESS_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    canidaeOfficialProductImportKey: hasEnv("CANIDAE_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    hillspetOfficialProductImportKey: hasEnv("HILLSPET_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    openfarmOfficialProductImportKey: hasEnv("OPENFARM_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    royalcaninOfficialProductImportKey: hasEnv("ROYALCANIN_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    freshpetOfficialProductImportKey: hasEnv("FRESHPET_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    weruvaOfficialProductImportKey: hasEnv("WERUVA_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    tikipetsOfficialProductImportKey: hasEnv("TIKIPETS_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    purinaOfficialProductImportKey: hasEnv("PURINA_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    frommOfficialProductImportKey: hasEnv("FROMM_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    tasteofthewildOfficialProductImportKey: hasEnv("TASTEOFTHEWILD_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    acanaOfficialProductImportKey: hasEnv("ACANA_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    orijenOfficialProductImportKey: hasEnv("ORIJEN_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    zignatureOfficialProductImportKey: hasEnv("ZIGNATURE_PRODUCT_IMPORT_SERVICE_KEY", "PRODUCT_LOOKUP_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
  };
  const blockers = [];
  const backfillCoverageReady = (backfillManifest.targetCount || 0) + (backfillReportState.verifiedCount || 0);
  const precomputeCoverageReady = (precomputeManifest.targetCount || 0) + (precomputeReportState.verifiedCount || 0);
  const nutrientCoverageReady = (nutrientManifest.validTargetCount || 0) + (nutrientReportState.verifiedCount || 0);
  const fastScoreBlockers = [];
  if ((!backfillManifest.exists || backfillManifest.error || backfillManifest.targetCount === 0) && backfillCoverageReady < minBackfillTargets) {
    blockers.push("catalog backfill input is missing, invalid, or empty");
  }
  if ((!precomputeManifest.exists || precomputeManifest.error || precomputeManifest.targetCount === 0) && precomputeCoverageReady < minPrecomputeTargets) {
    blockers.push("analysis precompute input is missing, invalid, or empty");
    fastScoreBlockers.push("analysis precompute input is missing, invalid, or empty");
  }
  if ((!nutrientManifest.exists || nutrientManifest.error || nutrientManifest.validTargetCount === 0) && nutrientCoverageReady < minNutrientTargets) {
    blockers.push("nutrient-panel input is missing, invalid, or has no validated nutrientPanel entries");
  }
  if (!env.productLookupServiceKey) {
    blockers.push("PRODUCT_LOOKUP_SERVICE_KEY or Supabase service key is missing for catalog writes");
  }
  if (!env.analyzeServiceKey) {
    blockers.push("ANALYZE_SERVICE_KEY or Supabase service key is missing for score precompute writes");
    fastScoreBlockers.push("ANALYZE_SERVICE_KEY or Supabase service key is missing for score precompute writes");
  }
  if (!env.nutrientPanelServiceKey) {
    blockers.push("NUTRIENT_PANEL_SERVICE_KEY or Supabase service key is missing for nutrient-panel writes");
  }
  if (backfillCoverageReady < minBackfillTargets) {
    blockers.push(`catalog backfill coverage ${backfillCoverageReady} < target ${minBackfillTargets}`);
  }
  if (precomputeCoverageReady < minPrecomputeTargets) {
    blockers.push(`score precompute coverage ${precomputeCoverageReady} < target ${minPrecomputeTargets}`);
    fastScoreBlockers.push(`score precompute coverage ${precomputeCoverageReady} < target ${minPrecomputeTargets}`);
  }
  if (nutrientCoverageReady < minNutrientTargets) {
    blockers.push(`nutrient-panel write-ready coverage ${nutrientCoverageReady} < target ${minNutrientTargets}`);
  }
  const warnings = buildWarnings({
    backfillManifest,
    precomputeManifest,
    nutrientManifest,
    backfillReportState,
    precomputeReportState,
    speciesMigrationReportState,
    nutrientReportState,
    haloOfficialProductReportState,
    bluebuffaloOfficialProductReportState,
    merrickOfficialProductReportState,
    wellnessOfficialProductReportState,
    canidaeOfficialProductReportState,
    hillspetOfficialProductReportState,
    openfarmOfficialProductReportState,
    royalcaninOfficialProductReportState,
    freshpetOfficialProductReportState,
    weruvaOfficialProductReportState,
    tikipetsOfficialProductReportState,
    purinaOfficialProductReportState,
    frommOfficialProductReportState,
    tasteofthewildOfficialProductReportState,
    acanaOfficialProductReportState,
    orijenOfficialProductReportState,
    zignatureOfficialProductReportState,
  });
  const commands = buildCommands();
  const fastScoreReady = fastScoreBlockers.length === 0;
  const ready = fastScoresOnly ? fastScoreReady : blockers.length === 0;
  const activeBlockers = fastScoresOnly ? fastScoreBlockers : blockers;
  const report = {
    generatedAt: new Date().toISOString(),
    mode: fastScoresOnly ? "fast_scores" : "catalog_growth",
    ready,
    strict,
    blockers: activeBlockers,
    allBlockers: blockers,
    warnings,
    thresholds: {
      minBackfillTargets,
      minPrecomputeTargets,
      minNutrientTargets,
    },
    env,
    inputs: {
      backfillManifest,
      precomputeManifest,
      nutrientManifest,
      haloOfficialProductManifest,
      bluebuffaloOfficialProductManifest,
      merrickOfficialProductManifest,
      wellnessOfficialProductManifest,
      canidaeOfficialProductManifest,
      hillspetOfficialProductManifest,
      openfarmOfficialProductManifest,
      royalcaninOfficialProductManifest,
      freshpetOfficialProductManifest,
      weruvaOfficialProductManifest,
      tikipetsOfficialProductManifest,
      purinaOfficialProductManifest,
      frommOfficialProductManifest,
      tasteofthewildOfficialProductManifest,
      acanaOfficialProductManifest,
      orijenOfficialProductManifest,
      zignatureOfficialProductManifest,
      backfillReport: backfillReportState,
      haloOfficialProductReport: haloOfficialProductReportState,
      bluebuffaloOfficialProductReport: bluebuffaloOfficialProductReportState,
      merrickOfficialProductReport: merrickOfficialProductReportState,
      wellnessOfficialProductReport: wellnessOfficialProductReportState,
      canidaeOfficialProductReport: canidaeOfficialProductReportState,
      hillspetOfficialProductReport: hillspetOfficialProductReportState,
      openfarmOfficialProductReport: openfarmOfficialProductReportState,
      royalcaninOfficialProductReport: royalcaninOfficialProductReportState,
      freshpetOfficialProductReport: freshpetOfficialProductReportState,
      weruvaOfficialProductReport: weruvaOfficialProductReportState,
      tikipetsOfficialProductReport: tikipetsOfficialProductReportState,
      purinaOfficialProductReport: purinaOfficialProductReportState,
      frommOfficialProductReport: frommOfficialProductReportState,
      tasteofthewildOfficialProductReport: tasteofthewildOfficialProductReportState,
      acanaOfficialProductReport: acanaOfficialProductReportState,
      orijenOfficialProductReport: orijenOfficialProductReportState,
      zignatureOfficialProductReport: zignatureOfficialProductReportState,
      precomputeReport: precomputeReportState,
      speciesMigrationReport: speciesMigrationReportState,
      nutrientReport: nutrientReportState,
    },
    fastScoreReadiness: {
      ready: fastScoreReady,
      blockers: fastScoreBlockers,
      target: minPrecomputeTargets,
      queuedTargets: precomputeManifest.targetCount || 0,
      verifiedCached: precomputeReportState.verifiedCount || 0,
      verifiedSpeciesMigrations: speciesMigrationReportState.verifiedCount || 0,
      coverageReady: precomputeCoverageReady,
      hasAnalyzeServiceKey: env.analyzeServiceKey,
      hasAnalysisCacheMigrationKey: env.analysisCacheMigrationKey,
      speciesMigrationCommand: commands.speciesMigration,
      command: commands.precompute,
      refreshCommand: commands.precomputeEligibleRefresh,
    },
    commands,
    notes: [
      "This readiness check is read-only and does not run product-lookup, analyze, nutrient-panel, or Supabase writes.",
      "Run catalog backfill before analysis precompute so newly saved product_data rows can flow through the JSONL report.",
      "Run official Halo product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Blue Buffalo product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Merrick product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Wellness product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Canidae product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Hill's product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Open Farm product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Royal Canin product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Freshpet product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Weruva product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Tiki Pets product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Purina-family product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer Gatsby page-data ingredients instead of search-derived verification.",
      "Run official Fromm product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official Taste of the Wild product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official ACANA product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run official ORIJEN product-data backfill before generic product-lookup backfill when the parsed manifest is available; it uses manufacturer ingredients and nutrient panels instead of search-derived verification.",
      "Run analysis-cache species-key migration before model precompute so existing safe legacy cache rows become app-visible without another analyze call.",
      "Regenerate the precompute eligible manifest after catalog cleanup or backfill so score-cache batches target the current product_data rows.",
      "Regenerate the sanitized nutrient target/research artifacts after catalog cleanup or backfill before assigning nutrient research.",
      "Use a validated nutrient-panel input; the sanitized missing-panel research queue is not write-ready until nutrientPanel objects are filled from source data.",
      "Keep concurrency at or below 8 and lower it if product-lookup, Edge Function, model, or upstream rate limits appear.",
    ],
  };

  console.log(`${fastScoresOnly ? "Fast-score cache" : "Catalog growth"} ready: ${ready ? "yes" : "no"}`);
  console.log(`Backfill targets: ${backfillManifest.targetCount || 0} (${backfillManifest.path})`);
  console.log(`Halo official product-data targets: ${haloOfficialProductManifest.validTargetCount || 0} valid / ${haloOfficialProductManifest.targetCount || 0} total (${haloOfficialProductManifest.path})`);
  console.log(`Blue Buffalo official product-data targets: ${bluebuffaloOfficialProductManifest.validTargetCount || 0} valid / ${bluebuffaloOfficialProductManifest.targetCount || 0} total (${bluebuffaloOfficialProductManifest.path})`);
  console.log(`Merrick official product-data targets: ${merrickOfficialProductManifest.validTargetCount || 0} valid / ${merrickOfficialProductManifest.targetCount || 0} total (${merrickOfficialProductManifest.path})`);
  console.log(`Wellness official product-data targets: ${wellnessOfficialProductManifest.validTargetCount || 0} valid / ${wellnessOfficialProductManifest.targetCount || 0} total (${wellnessOfficialProductManifest.path})`);
  console.log(`Canidae official product-data targets: ${canidaeOfficialProductManifest.validTargetCount || 0} valid / ${canidaeOfficialProductManifest.targetCount || 0} total (${canidaeOfficialProductManifest.path})`);
  console.log(`Hill's official product-data targets: ${hillspetOfficialProductManifest.validTargetCount || 0} valid / ${hillspetOfficialProductManifest.targetCount || 0} total (${hillspetOfficialProductManifest.path})`);
  console.log(`Open Farm official product-data targets: ${openfarmOfficialProductManifest.validTargetCount || 0} valid / ${openfarmOfficialProductManifest.targetCount || 0} total (${openfarmOfficialProductManifest.path})`);
  console.log(`Royal Canin official product-data targets: ${royalcaninOfficialProductManifest.validTargetCount || 0} valid / ${royalcaninOfficialProductManifest.targetCount || 0} total (${royalcaninOfficialProductManifest.path})`);
  console.log(`Freshpet official product-data targets: ${freshpetOfficialProductManifest.validTargetCount || 0} valid / ${freshpetOfficialProductManifest.targetCount || 0} total (${freshpetOfficialProductManifest.path})`);
  console.log(`Weruva official product-data targets: ${weruvaOfficialProductManifest.validTargetCount || 0} valid / ${weruvaOfficialProductManifest.targetCount || 0} total (${weruvaOfficialProductManifest.path})`);
  console.log(`Tiki Pets official product-data targets: ${tikipetsOfficialProductManifest.validTargetCount || 0} valid / ${tikipetsOfficialProductManifest.targetCount || 0} total (${tikipetsOfficialProductManifest.path})`);
  console.log(`Purina official product-data targets: ${purinaOfficialProductManifest.validTargetCount || 0} valid / ${purinaOfficialProductManifest.targetCount || 0} total (${purinaOfficialProductManifest.path})`);
  console.log(`Fromm official product-data targets: ${frommOfficialProductManifest.validTargetCount || 0} valid / ${frommOfficialProductManifest.targetCount || 0} total (${frommOfficialProductManifest.path})`);
  console.log(`Taste of the Wild official product-data targets: ${tasteofthewildOfficialProductManifest.validTargetCount || 0} valid / ${tasteofthewildOfficialProductManifest.targetCount || 0} total (${tasteofthewildOfficialProductManifest.path})`);
  console.log(`ACANA official product-data targets: ${acanaOfficialProductManifest.validTargetCount || 0} valid / ${acanaOfficialProductManifest.targetCount || 0} total (${acanaOfficialProductManifest.path})`);
  console.log(`ORIJEN official product-data targets: ${orijenOfficialProductManifest.validTargetCount || 0} valid / ${orijenOfficialProductManifest.targetCount || 0} total (${orijenOfficialProductManifest.path})`);
  console.log(`Zignature official product-data targets: ${zignatureOfficialProductManifest.validTargetCount || 0} valid / ${zignatureOfficialProductManifest.targetCount || 0} total (${zignatureOfficialProductManifest.path})`);
  console.log(`Precompute targets: ${precomputeManifest.targetCount || 0} (${precomputeManifest.path})`);
  console.log(`Fast-score coverage ready: ${precomputeCoverageReady}/${minPrecomputeTargets}${env.analyzeServiceKey ? "" : " (missing ANALYZE_SERVICE_KEY or Supabase service key)"}`);
  console.log(`Nutrient-panel targets: ${nutrientManifest.validTargetCount || 0} valid / ${nutrientManifest.targetCount || 0} total (${nutrientManifest.path})`);
  console.log(`Backfill report verified saved: ${backfillReportState.verifiedCount || 0}`);
  console.log(`Halo official product report verified saved: ${haloOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Blue Buffalo official product report verified saved: ${bluebuffaloOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Merrick official product report verified saved: ${merrickOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Wellness official product report verified saved: ${wellnessOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Canidae official product report verified saved: ${canidaeOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Hill's official product report verified saved: ${hillspetOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Open Farm official product report verified saved: ${openfarmOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Royal Canin official product report verified saved: ${royalcaninOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Freshpet official product report verified saved: ${freshpetOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Weruva official product report verified saved: ${weruvaOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Tiki Pets official product report verified saved: ${tikipetsOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Purina official product report verified saved: ${purinaOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Fromm official product report verified saved: ${frommOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Taste of the Wild official product report verified saved: ${tasteofthewildOfficialProductReportState.verifiedCount || 0}`);
  console.log(`ACANA official product report verified saved: ${acanaOfficialProductReportState.verifiedCount || 0}`);
  console.log(`ORIJEN official product report verified saved: ${orijenOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Zignature official product report verified saved: ${zignatureOfficialProductReportState.verifiedCount || 0}`);
  console.log(`Species migration report verified migrated: ${speciesMigrationReportState.verifiedCount || 0}`);
  console.log(`Precompute report verified cached: ${precomputeReportState.verifiedCount || 0}`);
  console.log(`Nutrient report verified saved: ${nutrientReportState.verifiedCount || 0}`);
  if (activeBlockers.length > 0) console.log(`Blockers: ${activeBlockers.join("; ")}`);
  if (fastScoresOnly && blockers.length > activeBlockers.length) {
    console.log(`Other catalog-growth blockers: ${blockers.filter((blocker) => !activeBlockers.includes(blocker)).join("; ")}`);
  }
  if (warnings.length > 0) console.log(`Warnings: ${warnings.join("; ")}`);
  if (!fastScoresOnly) {
    console.log("Next Halo official product-data dry-run command:");
    console.log(commands.haloOfficialProductDryRun);
    console.log("Next Halo official product-data backfill command:");
    console.log(commands.haloOfficialProductBackfill);
    console.log("Next Blue Buffalo official product-data dry-run command:");
    console.log(commands.bluebuffaloOfficialProductDryRun);
    console.log("Next Blue Buffalo official product-data backfill command:");
    console.log(commands.bluebuffaloOfficialProductBackfill);
    console.log("Next Merrick official product-data dry-run command:");
    console.log(commands.merrickOfficialProductDryRun);
    console.log("Next Merrick official product-data backfill command:");
    console.log(commands.merrickOfficialProductBackfill);
    console.log("Next Wellness official product-data dry-run command:");
    console.log(commands.wellnessOfficialProductDryRun);
    console.log("Next Wellness official product-data backfill command:");
    console.log(commands.wellnessOfficialProductBackfill);
    console.log("Next Canidae official product-data dry-run command:");
    console.log(commands.canidaeOfficialProductDryRun);
    console.log("Next Canidae official product-data backfill command:");
    console.log(commands.canidaeOfficialProductBackfill);
    console.log("Next Hill's official product-data dry-run command:");
    console.log(commands.hillspetOfficialProductDryRun);
    console.log("Next Hill's official product-data backfill command:");
    console.log(commands.hillspetOfficialProductBackfill);
    console.log("Next Open Farm official product-data dry-run command:");
    console.log(commands.openfarmOfficialProductDryRun);
    console.log("Next Open Farm official product-data backfill command:");
    console.log(commands.openfarmOfficialProductBackfill);
    console.log("Next Royal Canin official product-data dry-run command:");
    console.log(commands.royalcaninOfficialProductDryRun);
    console.log("Next Royal Canin official product-data backfill command:");
    console.log(commands.royalcaninOfficialProductBackfill);
    console.log("Next Freshpet official product-data dry-run command:");
    console.log(commands.freshpetOfficialProductDryRun);
    console.log("Next Freshpet official product-data backfill command:");
    console.log(commands.freshpetOfficialProductBackfill);
    console.log("Next Weruva official product-data dry-run command:");
    console.log(commands.weruvaOfficialProductDryRun);
    console.log("Next Weruva official product-data backfill command:");
    console.log(commands.weruvaOfficialProductBackfill);
    console.log("Next Tiki Pets official product-data dry-run command:");
    console.log(commands.tikipetsOfficialProductDryRun);
    console.log("Next Tiki Pets official product-data backfill command:");
    console.log(commands.tikipetsOfficialProductBackfill);
    console.log("Next Purina official product-data dry-run command:");
    console.log(commands.purinaOfficialProductDryRun);
    console.log("Next Purina official product-data backfill command:");
    console.log(commands.purinaOfficialProductBackfill);
    console.log("Next Fromm official product-data dry-run command:");
    console.log(commands.frommOfficialProductDryRun);
    console.log("Next Fromm official product-data backfill command:");
    console.log(commands.frommOfficialProductBackfill);
    console.log("Next Taste of the Wild official product-data dry-run command:");
    console.log(commands.tasteofthewildOfficialProductDryRun);
    console.log("Next Taste of the Wild official product-data backfill command:");
    console.log(commands.tasteofthewildOfficialProductBackfill);
    console.log("Next ACANA official product-data dry-run command:");
    console.log(commands.acanaOfficialProductDryRun);
    console.log("Next ACANA official product-data backfill command:");
    console.log(commands.acanaOfficialProductBackfill);
    console.log("Next ORIJEN official product-data dry-run command:");
    console.log(commands.orijenOfficialProductDryRun);
    console.log("Next ORIJEN official product-data backfill command:");
    console.log(commands.orijenOfficialProductBackfill);
    console.log("Next Zignature official product-data dry-run command:");
    console.log(commands.zignatureOfficialProductDryRun);
    console.log("Next Zignature official product-data backfill command:");
    console.log(commands.zignatureOfficialProductBackfill);
    console.log("Next catalog backfill command:");
    console.log(commands.backfill);
  }
  console.log("Next analysis-cache species migration command:");
  console.log(commands.speciesMigration);
  console.log("Next score precompute command:");
  console.log(commands.precompute);
  console.log("Next precompute eligible refresh command:");
  console.log(commands.precomputeEligibleRefresh);
  if (!fastScoresOnly) {
    console.log("Next nutrient-panel backfill command:");
    console.log(commands.nutrient);
    console.log("Next nutrient target/research refresh command:");
    console.log(commands.nutrientResearchRefresh);
  }

  if (!noOutput) {
    const outputPath = resolveRepoPath(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Wrote readiness report: ${relativeRepoPath(output)}`);
  }

  if (strict && !ready) process.exit(1);
}

main();
