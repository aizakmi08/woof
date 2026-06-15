#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/check-catalog-growth-readiness.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`catalog growth readiness guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes('require("dotenv").config({ quiet: true })') &&
    source.includes('const fs = require("fs")') &&
    !source.includes("fetch(") &&
    !source.includes("spawn(") &&
    !source.includes("exec(") &&
    !source.includes("execSync(") &&
    !source.includes("unlinkSync") &&
    !source.includes("rmSync"),
  "readiness script must be a local read-only planner with no network, process launch, or destructive file calls"
);

assert(
    source.includes('DEFAULT_BACKFILL_INPUT = ".tmp/catalog-backfill-current-targets.json"') &&
    source.includes('DEFAULT_BACKFILL_REPORT = ".tmp/catalog-backfill-report.jsonl"') &&
    source.includes('DEFAULT_BACKFILL_MISSING_EXPORT = ".tmp/catalog-backfill-current-prioritized.json"') &&
    source.includes('DEFAULT_HALO_SHOPIFY_TARGET_INPUT = ".tmp/halo-shopify-catalog-targets.json"') &&
    source.includes('DEFAULT_HALO_OFFICIAL_PRODUCT_INPUT = ".tmp/halo-official-product-data.json"') &&
    source.includes('DEFAULT_HALO_OFFICIAL_PRODUCT_REPORT = ".tmp/halo-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_BLUEBUFFALO_SITEMAP_TARGET_INPUT = ".tmp/bluebuffalo-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_BLUEBUFFALO_OFFICIAL_PRODUCT_INPUT = ".tmp/bluebuffalo-official-product-data.json"') &&
    source.includes('DEFAULT_BLUEBUFFALO_OFFICIAL_PRODUCT_REPORT = ".tmp/bluebuffalo-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_MERRICK_SITEMAP_TARGET_INPUT = ".tmp/merrick-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_MERRICK_OFFICIAL_PRODUCT_INPUT = ".tmp/merrick-official-product-data.json"') &&
    source.includes('DEFAULT_MERRICK_OFFICIAL_PRODUCT_REPORT = ".tmp/merrick-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_WELLNESS_SITEMAP_TARGET_INPUT = ".tmp/wellness-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_WELLNESS_OFFICIAL_PRODUCT_INPUT = ".tmp/wellness-official-product-data.json"') &&
    source.includes('DEFAULT_WELLNESS_OFFICIAL_PRODUCT_REPORT = ".tmp/wellness-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_CANIDAE_SITEMAP_TARGET_INPUT = ".tmp/canidae-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_CANIDAE_OFFICIAL_PRODUCT_INPUT = ".tmp/canidae-official-product-data.json"') &&
    source.includes('DEFAULT_CANIDAE_OFFICIAL_PRODUCT_REPORT = ".tmp/canidae-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_HILLSPET_SITEMAP_TARGET_INPUT = ".tmp/hillspet-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_HILLSPET_OFFICIAL_PRODUCT_INPUT = ".tmp/hillspet-official-product-data.json"') &&
    source.includes('DEFAULT_HILLSPET_OFFICIAL_PRODUCT_REPORT = ".tmp/hillspet-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_OPENFARM_SHOPIFY_TARGET_INPUT = ".tmp/openfarm-shopify-catalog-targets.json"') &&
    source.includes('DEFAULT_OPENFARM_OFFICIAL_PRODUCT_INPUT = ".tmp/openfarm-official-product-data.json"') &&
    source.includes('DEFAULT_OPENFARM_OFFICIAL_PRODUCT_REPORT = ".tmp/openfarm-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_ROYALCANIN_SITEMAP_TARGET_INPUT = ".tmp/royalcanin-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_ROYALCANIN_OFFICIAL_PRODUCT_INPUT = ".tmp/royalcanin-official-product-data.json"') &&
    source.includes('DEFAULT_ROYALCANIN_OFFICIAL_PRODUCT_REPORT = ".tmp/royalcanin-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_FRESHPET_SITEMAP_TARGET_INPUT = ".tmp/freshpet-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_FRESHPET_OFFICIAL_PRODUCT_INPUT = ".tmp/freshpet-official-product-data.json"') &&
    source.includes('DEFAULT_FRESHPET_OFFICIAL_PRODUCT_REPORT = ".tmp/freshpet-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_WERUVA_SITEMAP_TARGET_INPUT = ".tmp/weruva-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_WERUVA_OFFICIAL_PRODUCT_INPUT = ".tmp/weruva-official-product-data.json"') &&
    source.includes('DEFAULT_WERUVA_OFFICIAL_PRODUCT_REPORT = ".tmp/weruva-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_TIKIPETS_SITEMAP_TARGET_INPUT = ".tmp/tikipets-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_TIKIPETS_OFFICIAL_PRODUCT_INPUT = ".tmp/tikipets-official-product-data.json"') &&
    source.includes('DEFAULT_TIKIPETS_OFFICIAL_PRODUCT_REPORT = ".tmp/tikipets-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_PURINA_SITEMAP_TARGET_INPUTS = [') &&
    source.includes('".tmp/purinaproplan-sitemap-catalog-targets.json"') &&
    source.includes('".tmp/purinaone-sitemap-catalog-targets.json"') &&
    source.includes('".tmp/fancyfeast-sitemap-catalog-targets.json"') &&
    source.includes('".tmp/friskies-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_PURINA_OFFICIAL_PRODUCT_INPUT = ".tmp/purina-official-product-data.json"') &&
    source.includes('DEFAULT_PURINA_OFFICIAL_PRODUCT_REPORT = ".tmp/purina-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_FROMM_SITEMAP_TARGET_INPUT = ".tmp/fromm-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_FROMM_OFFICIAL_PRODUCT_INPUT = ".tmp/fromm-official-product-data.json"') &&
    source.includes('DEFAULT_FROMM_OFFICIAL_PRODUCT_REPORT = ".tmp/fromm-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_TASTEOFTHEWILD_SITEMAP_TARGET_INPUT = ".tmp/tasteofthewild-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_TASTEOFTHEWILD_OFFICIAL_PRODUCT_INPUT = ".tmp/tasteofthewild-official-product-data.json"') &&
    source.includes('DEFAULT_TASTEOFTHEWILD_OFFICIAL_PRODUCT_REPORT = ".tmp/tasteofthewild-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_ACANA_SITEMAP_TARGET_INPUT = ".tmp/acana-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_ACANA_OFFICIAL_PRODUCT_INPUT = ".tmp/acana-official-product-data.json"') &&
    source.includes('DEFAULT_ACANA_OFFICIAL_PRODUCT_REPORT = ".tmp/acana-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_ORIJEN_SITEMAP_TARGET_INPUT = ".tmp/orijen-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_ORIJEN_OFFICIAL_PRODUCT_INPUT = ".tmp/orijen-official-product-data.json"') &&
    source.includes('DEFAULT_ORIJEN_OFFICIAL_PRODUCT_REPORT = ".tmp/orijen-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_ZIGNATURE_SITEMAP_TARGET_INPUT = ".tmp/zignature-sitemap-catalog-targets.json"') &&
    source.includes('DEFAULT_ZIGNATURE_OFFICIAL_PRODUCT_INPUT = ".tmp/zignature-official-product-data.json"') &&
    source.includes('DEFAULT_ZIGNATURE_OFFICIAL_PRODUCT_REPORT = ".tmp/zignature-official-product-backfill-report.jsonl"') &&
    source.includes('DEFAULT_PRECOMPUTE_INPUT = ".tmp/precompute-eligible-targets.json"') &&
    source.includes('DEFAULT_PRECOMPUTE_REPORT = ".tmp/precompute-report.jsonl"') &&
    source.includes('DEFAULT_PRECOMPUTE_ELIGIBLE_EXPORT = ".tmp/precompute-eligible-targets.json"') &&
    source.includes('DEFAULT_SPECIES_MIGRATION_REPORT = ".tmp/analysis-cache-species-migration.jsonl"') &&
    source.includes('DEFAULT_NUTRIENT_VALIDATED_INPUT = ".tmp/nutrient-panel-validated-current-targets.json"') &&
    source.includes('DEFAULT_NUTRIENT_RESEARCH_TARGET_EXPORT = ".tmp/nutrient-panel-targets-sanitized.json"') &&
    source.includes("fs.existsSync(path.resolve(root, DEFAULT_NUTRIENT_VALIDATED_INPUT))") &&
    source.includes("? DEFAULT_NUTRIENT_VALIDATED_INPUT") &&
    source.includes(": DEFAULT_NUTRIENT_RESEARCH_TARGET_EXPORT") &&
    source.includes('DEFAULT_NUTRIENT_REPORT = ".tmp/nutrient-panel-backfill-report.jsonl"') &&
    source.includes('DEFAULT_NUTRIENT_TARGET_EXPORT = ".tmp/nutrient-panel-normalized-targets.json"') &&
    source.includes('DEFAULT_NUTRIENT_RESEARCH_BATCH_EXPORT = ".tmp/nutrient-panel-research-batches.json"') &&
    source.includes("DEFAULT_MIN_BACKFILL_TARGETS = 3000") &&
    source.includes("DEFAULT_MIN_PRECOMPUTE_TARGETS = 8000") &&
    source.includes("DEFAULT_MIN_NUTRIENT_TARGETS = 500") &&
    source.includes('DEFAULT_OUTPUT = ".tmp/catalog-growth-readiness.json"'),
  "readiness script must default to the current service-key catalog, precompute, and nutrient-panel handoff artifacts"
);

assert(
    source.includes("PRODUCT_LOOKUP_SERVICE_KEY") &&
    source.includes("ANALYZE_SERVICE_KEY") &&
    source.includes("ANALYSIS_CACHE_MIGRATION_KEY") &&
    source.includes("NUTRIENT_PANEL_SERVICE_KEY") &&
    source.includes("HALO_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("BLUEBUFFALO_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("MERRICK_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("WELLNESS_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("CANIDAE_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("HILLSPET_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("OPENFARM_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("ROYALCANIN_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("FRESHPET_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("WERUVA_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("TIKIPETS_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("PURINA_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("FROMM_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("TASTEOFTHEWILD_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("ACANA_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("ORIJEN_PRODUCT_IMPORT_SERVICE_KEY") &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    source.includes("SUPABASE_SERVICE_KEY") &&
    source.includes("productLookupServiceKey") &&
    source.includes("analyzeServiceKey") &&
    source.includes("analysisCacheMigrationKey") &&
    source.includes("nutrientPanelServiceKey") &&
    source.includes("haloOfficialProductImportKey") &&
    source.includes("bluebuffaloOfficialProductImportKey") &&
    source.includes("merrickOfficialProductImportKey") &&
    source.includes("wellnessOfficialProductImportKey") &&
    source.includes("canidaeOfficialProductImportKey") &&
    source.includes("hillspetOfficialProductImportKey") &&
    source.includes("openfarmOfficialProductImportKey") &&
    source.includes("royalcaninOfficialProductImportKey") &&
    source.includes("freshpetOfficialProductImportKey") &&
    source.includes("weruvaOfficialProductImportKey") &&
    source.includes("tikipetsOfficialProductImportKey") &&
    source.includes("purinaOfficialProductImportKey") &&
    source.includes("frommOfficialProductImportKey") &&
    source.includes("tasteofthewildOfficialProductImportKey") &&
    source.includes("acanaOfficialProductImportKey") &&
    source.includes("orijenOfficialProductImportKey") &&
    source.includes("zignatureOfficialProductImportKey") &&
    !source.includes("process.env.PRODUCT_LOOKUP_SERVICE_KEY") &&
    !source.includes("process.env.ANALYZE_SERVICE_KEY") &&
    !source.includes("process.env.ANALYSIS_CACHE_MIGRATION_KEY") &&
    !source.includes("process.env.NUTRIENT_PANEL_SERVICE_KEY"),
  "service-key readiness must be boolean/redacted and must not print or serialize raw secrets"
);

assert(
  source.includes("readJsonManifest") &&
    source.includes("Array.isArray(parsed.targets)") &&
    source.includes("summarizeTargetManifest") &&
    source.includes("summarizeNutrientManifest") &&
    source.includes("summarizeOfficialProductDataManifest") &&
    source.includes("officialProductDataStatus") &&
    source.includes("nutrientPanelStatus") &&
    source.includes("sourceAnalysisReadyRows: parsed.sourceAnalysisReadyRows") &&
    source.includes("excludedNonCompleteFoodRows: parsed.excludedNonCompleteFoodRows") &&
    source.includes("validTargetCount") &&
    source.includes("backfillCoverageReady") &&
    source.includes("precomputeCoverageReady") &&
    source.includes("nutrientCoverageReady") &&
    source.includes("catalog backfill coverage") &&
    source.includes("score precompute coverage") &&
    source.includes("nutrient-panel write-ready coverage") &&
    source.includes("--min-backfill-targets") &&
    source.includes("--min-precompute-targets") &&
    source.includes("--min-nutrient-targets") &&
    source.includes("invalidReasons") &&
    source.includes("byPetType") &&
    source.includes("bySource"),
  "readiness script must parse and summarize target manifests, including nutrient write-readiness against the release gate, before recommending write batches"
);

assert(
    source.includes("readJsonlReport") &&
    source.includes('"catalog_backfill_result"') &&
    source.includes('"halo_official_product_result"') &&
    source.includes('"bluebuffalo_official_product_result"') &&
    source.includes('"merrick_official_product_result"') &&
    source.includes('"wellness_official_product_result"') &&
    source.includes('"canidae_official_product_result"') &&
    source.includes('"hillspet_official_product_result"') &&
    source.includes('"openfarm_official_product_result"') &&
    source.includes('"royalcanin_official_product_result"') &&
    source.includes('"freshpet_official_product_result"') &&
    source.includes('"weruva_official_product_result"') &&
    source.includes('"tikipets_official_product_result"') &&
    source.includes('"purina_official_product_result"') &&
    source.includes('"fromm_official_product_result"') &&
    source.includes('"tasteofthewild_official_product_result"') &&
    source.includes('"acana_official_product_result"') &&
    source.includes('"orijen_official_product_result"') &&
    source.includes('"zignature_official_product_result"') &&
    source.includes('"precompute_result"') &&
    source.includes('"analysis_cache_species_migration"') &&
    source.includes('"verified_migrated"') &&
    source.includes('"nutrient_panel_result"') &&
    source.includes('"verified_saved"') &&
    source.includes('"verified_cached"') &&
    source.includes('"fatal_failed"') &&
    source.includes("latestTimestamp") &&
    source.includes("latestVerifiedTimestamp") &&
    source.includes("latestFatal") &&
    source.includes("latestDone"),
  "readiness script must account for resumable JSONL report state from both handoff jobs"
);

assert(
  source.includes("function timestampMs(value)") &&
    source.includes("nutrientReportState") &&
    source.includes("catalog backfill report contains a fatal failure") &&
    source.includes("score precompute report contains a fatal failure") &&
    source.includes("analysis-cache species migration report contains a fatal failure") &&
    source.includes("nutrient-panel report contains a fatal failure") &&
    source.includes("Halo official product-data report contains a fatal failure") &&
    source.includes("Blue Buffalo official product-data report contains a fatal failure") &&
    source.includes("Merrick official product-data report contains a fatal failure") &&
    source.includes("Wellness official product-data report contains a fatal failure") &&
    source.includes("Canidae official product-data report contains a fatal failure") &&
    source.includes("Hill's official product-data report contains a fatal failure") &&
    source.includes("Open Farm official product-data report contains a fatal failure") &&
    source.includes("Royal Canin official product-data report contains a fatal failure") &&
    source.includes("Freshpet official product-data report contains a fatal failure") &&
    source.includes("Weruva official product-data report contains a fatal failure") &&
    source.includes("Tiki Pets official product-data report contains a fatal failure") &&
    source.includes("Purina official product-data report contains a fatal failure") &&
    source.includes("Fromm official product-data report contains a fatal failure") &&
    source.includes("Taste of the Wild official product-data report contains a fatal failure") &&
    source.includes("ACANA official product-data report contains a fatal failure") &&
    source.includes("ORIJEN official product-data report contains a fatal failure") &&
    source.includes("analysis precompute manifest is older than the latest verified catalog backfill") &&
    source.includes("catalog backfill input is older than verified saved rows in the report") &&
    source.includes("nutrient-panel input is older than verified saved rows in the report") &&
    source.includes("warnings") &&
    source.includes("Warnings: ${warnings.join(\"; \")}"),
  "readiness script must surface redacted fatal-report and stale-manifest warnings without turning them into raw secret output"
);

assert(
    source.includes("PRODUCT_LOOKUP_SERVICE_KEY=...") &&
    source.includes("HALO_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:halo-official-products --") &&
    source.includes("haloOfficialProductBackfill") &&
    source.includes("haloOfficialProductDryRun") &&
    source.includes("DEFAULT_HALO_SHOPIFY_TARGET_INPUT") &&
    source.includes("DEFAULT_HALO_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_HALO_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("BLUEBUFFALO_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:bluebuffalo-official-products --") &&
    source.includes("bluebuffaloOfficialProductBackfill") &&
    source.includes("bluebuffaloOfficialProductDryRun") &&
    source.includes("DEFAULT_BLUEBUFFALO_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_BLUEBUFFALO_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_BLUEBUFFALO_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("MERRICK_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:merrick-official-products --") &&
    source.includes("merrickOfficialProductBackfill") &&
    source.includes("merrickOfficialProductDryRun") &&
    source.includes("DEFAULT_MERRICK_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_MERRICK_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_MERRICK_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("WELLNESS_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:wellness-official-products --") &&
    source.includes("wellnessOfficialProductBackfill") &&
    source.includes("wellnessOfficialProductDryRun") &&
    source.includes("DEFAULT_WELLNESS_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_WELLNESS_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_WELLNESS_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("CANIDAE_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:canidae-official-products --") &&
    source.includes("canidaeOfficialProductBackfill") &&
    source.includes("canidaeOfficialProductDryRun") &&
    source.includes("DEFAULT_CANIDAE_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_CANIDAE_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_CANIDAE_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("HILLSPET_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:hillspet-official-products --") &&
    source.includes("hillspetOfficialProductBackfill") &&
    source.includes("hillspetOfficialProductDryRun") &&
    source.includes("DEFAULT_HILLSPET_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_HILLSPET_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_HILLSPET_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("OPENFARM_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:openfarm-official-products --") &&
    source.includes("openfarmOfficialProductBackfill") &&
    source.includes("openfarmOfficialProductDryRun") &&
    source.includes("DEFAULT_OPENFARM_SHOPIFY_TARGET_INPUT") &&
    source.includes("DEFAULT_OPENFARM_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_OPENFARM_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("ROYALCANIN_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:royalcanin-official-products --") &&
    source.includes("royalcaninOfficialProductBackfill") &&
    source.includes("royalcaninOfficialProductDryRun") &&
    source.includes("DEFAULT_ROYALCANIN_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_ROYALCANIN_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_ROYALCANIN_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("FRESHPET_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:freshpet-official-products --") &&
    source.includes("freshpetOfficialProductBackfill") &&
    source.includes("freshpetOfficialProductDryRun") &&
    source.includes("DEFAULT_FRESHPET_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_FRESHPET_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_FRESHPET_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("WERUVA_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:weruva-official-products --") &&
    source.includes("weruvaOfficialProductBackfill") &&
    source.includes("weruvaOfficialProductDryRun") &&
    source.includes("DEFAULT_WERUVA_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_WERUVA_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_WERUVA_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("TIKIPETS_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:tikipets-official-products --") &&
    source.includes("tikipetsOfficialProductBackfill") &&
    source.includes("tikipetsOfficialProductDryRun") &&
    source.includes("DEFAULT_TIKIPETS_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_TIKIPETS_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_TIKIPETS_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("PURINA_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:purina-official-products --") &&
    source.includes("purinaOfficialProductBackfill") &&
    source.includes("purinaOfficialProductDryRun") &&
    source.includes("DEFAULT_PURINA_SITEMAP_TARGET_INPUTS.join(\",\")") &&
    source.includes("DEFAULT_PURINA_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_PURINA_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("FROMM_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:fromm-official-products --") &&
    source.includes("frommOfficialProductBackfill") &&
    source.includes("frommOfficialProductDryRun") &&
    source.includes("DEFAULT_FROMM_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_FROMM_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_FROMM_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("TASTEOFTHEWILD_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:tasteofthewild-official-products --") &&
    source.includes("tasteofthewildOfficialProductBackfill") &&
    source.includes("tasteofthewildOfficialProductDryRun") &&
    source.includes("DEFAULT_TASTEOFTHEWILD_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_TASTEOFTHEWILD_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_TASTEOFTHEWILD_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("ACANA_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:acana-official-products --") &&
    source.includes("acanaOfficialProductBackfill") &&
    source.includes("acanaOfficialProductDryRun") &&
    source.includes("DEFAULT_ACANA_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_ACANA_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_ACANA_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("ORIJEN_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:orijen-official-products --") &&
    source.includes("orijenOfficialProductBackfill") &&
    source.includes("orijenOfficialProductDryRun") &&
    source.includes("DEFAULT_ORIJEN_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_ORIJEN_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_ORIJEN_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("ZIGNATURE_PRODUCT_IMPORT_SERVICE_KEY=...") &&
    source.includes("npm run backfill:zignature-official-products --") &&
    source.includes("zignatureOfficialProductBackfill") &&
    source.includes("zignatureOfficialProductDryRun") &&
    source.includes("DEFAULT_ZIGNATURE_SITEMAP_TARGET_INPUT") &&
    source.includes("DEFAULT_ZIGNATURE_OFFICIAL_PRODUCT_INPUT") &&
    source.includes("DEFAULT_ZIGNATURE_OFFICIAL_PRODUCT_REPORT") &&
    source.includes("npm run backfill:catalog --") &&
    source.includes("--input-only") &&
    source.includes("--resume-report") &&
    source.includes("--export-missing=") &&
    source.includes("ANALYZE_SERVICE_KEY=...") &&
    source.includes("npm run precompute:analysis --") &&
    source.includes("`${precomputeInput},${backfillReport}`") &&
    source.includes("function existingCommandInputs(...files)") &&
    source.includes("fs.existsSync(resolveRepoPath(file))") &&
    source.includes("const precomputeDemandInputs = existingCommandInputs(precomputeInput, backfillReport, precomputeReport)") &&
    source.includes("precomputeDemandInputs.length > 0") &&
    source.includes("`--demand-input='${commandPath(precomputeDemandInputs.join(\",\"))}'`") &&
    source.includes("--export-eligible=") &&
    source.includes("precomputeEligibleRefresh") &&
    /const precomputeEligibleRefresh = \[[\s\S]{0,140}"--dry-run",[\s\S]{0,220}\.\.\.\(precomputeDemandInputs\.length > 0[\s\S]{0,180}`--demand-input='\$\{commandPath\(precomputeDemandInputs\.join\(","\)\)\}'`/.test(source) &&
    source.includes("NUTRIENT_PANEL_SERVICE_KEY=...") &&
    source.includes("npm run backfill:nutrients --") &&
    source.includes("--export-targets=") &&
    source.includes("--concurrency=${concurrency}") &&
    source.includes("ANALYSIS_CACHE_MIGRATION_KEY=...") &&
    source.includes("npm run migrate:analysis-cache-species --") &&
    source.includes("--species-migration-report=path.jsonl") &&
    source.includes("const speciesMigrationReport = argValue(\"--species-migration-report\", DEFAULT_SPECIES_MIGRATION_REPORT)") &&
    source.includes("`--report='${commandPath(speciesMigrationReport)}'`") &&
    source.includes("--batch-size=50") &&
    source.includes("nutrientResearchRefresh") &&
    source.includes("npm run audit:catalog --") &&
    source.includes("const nutrientResearchTargetExport = argValue(\"--nutrient-research-target-export\", DEFAULT_NUTRIENT_RESEARCH_TARGET_EXPORT)") &&
    source.includes("--nutrient-research-target-export=path.json") &&
    source.includes("--export-nutrient-targets=") &&
    source.includes("`--export-nutrient-targets='${commandPath(nutrientResearchTargetExport)}'`") &&
    !source.includes("`--export-nutrient-targets='${commandPath(nutrientInput)}'`") &&
    source.includes("--export-nutrient-research-batches="),
  "readiness script must print exact guarded backfill, precompute, precompute refresh, nutrient-panel, and nutrient research refresh commands without overwriting the validated nutrient input"
);

assert(
    source.includes("--strict") &&
    source.includes("strict && !ready") &&
    source.includes("--fast-scores-only") &&
    source.includes('mode: fastScoresOnly ? "fast_scores" : "catalog_growth"') &&
    source.includes("fastScoreReadiness") &&
    source.includes("fastScoreBlockers") &&
    source.includes("hasAnalyzeServiceKey: env.analyzeServiceKey") &&
    source.includes("hasAnalysisCacheMigrationKey: env.analysisCacheMigrationKey") &&
    source.includes("verifiedSpeciesMigrations: speciesMigrationReportState.verifiedCount || 0") &&
    source.includes("speciesMigrationCommand: commands.speciesMigration") &&
    source.includes('console.log(`${fastScoresOnly ? "Fast-score cache" : "Catalog growth"} ready: ${ready ? "yes" : "no"}`)') &&
    source.includes("Fast-score coverage ready:") &&
    source.includes("Species migration report verified migrated:") &&
    source.includes("Next analysis-cache species migration command:") &&
    source.includes("--no-output") &&
    source.includes("fs.writeFileSync(outputPath") &&
    source.includes("ready") &&
    source.includes("blockers"),
  "readiness script must support strict CI-style failure, fast-score-only gating, and redacted JSON report output"
);

assert(
  packageJson.includes('"check:catalog-growth": "node scripts/check-catalog-growth-readiness.js"') &&
    packageJson.includes('"check:fast-scores": "node scripts/check-catalog-growth-readiness.js --fast-scores-only"') &&
    packageJson.includes('"test:catalog-growth-readiness": "node scripts/test-catalog-growth-readiness-guards.js"') &&
    packageJson.includes("npm run test:catalog-growth-readiness"),
  "package scripts must expose catalog growth and fast-score readiness and include the readiness guard in test:guards"
);

console.log("catalog growth readiness guard passed");
