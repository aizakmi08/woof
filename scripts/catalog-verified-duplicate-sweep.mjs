import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_PER_BRAND_LIMIT = 10;
const DEFAULT_BRAND_LIMIT = 12;
const DEFAULT_DELAY_MS = 250;
const DEFAULT_OPERATIONS = ["identity"];
const OPT_IN_OPERATIONS = ["exact", "unknown", "alias"];
const AUTOMATED_DUPLICATE_CLOSERS = [
  "exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand",
  "exclude_verified_duplicate_legacy_catalog_rows_for_brand",
  "exclude_unknown_species_legacy_duplicate_rows_for_brand",
  "exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand",
];
const PRIORITY_BRANDS = [
  "Blue Buffalo",
  "Purina Pro Plan",
  "Royal Canin",
  "Fancy Feast",
  "Open Farm",
  "Wellness",
  "Nulo",
  "Friskies",
  "Nutro",
  "Hill's Science Diet",
  "Stella & Chewy's",
  "Tiki Cat",
  "The Honest Kitchen",
  "Pedigree",
  "Farmina",
  "Merrick",
  "Taste of the Wild",
  "Nutrish",
  "Orijen",
  "Beneful",
  "Purina ONE",
  "IAMS",
  "Earthborn Holistic",
  "Eukanuba",
  "Instinct",
  "Solid Gold",
  "ACANA",
  "CANIDAE",
  "VICTOR",
  "Diamond Naturals",
  "Dave's 95%",
];

const OPERATION_RPC = {
  identity: "exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand",
  exact: "exclude_verified_duplicate_legacy_catalog_rows_for_brand",
  unknown: "exclude_unknown_species_legacy_duplicate_rows_for_brand",
  alias: "exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand",
  strict: "reconcile_catalog_acquisition_queue_strict_search_for_brand",
};

const DUPLICATE_OPERATIONS = new Set(["identity", "exact", "unknown", "alias"]);

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

function normalizeBrand(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueValues(values) {
  const seen = new Set();
  const result = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const key = normalizeBrand(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function sqlString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
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

function loadSourceTargetBrands({ includeAliases }) {
  if (!fs.existsSync(SOURCE_TARGETS_PATH)) return [];
  const targets = JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"));
  const values = [];
  for (const target of targets) {
    values.push(target.brand);
    if (includeAliases && Array.isArray(target.aliases)) {
      values.push(...target.aliases);
    }
  }
  return uniqueValues(values);
}

function selectedBrands() {
  const explicitBrands = getArgs("--brand");
  const includeAliases = hasArg("--include-aliases");
  const useSourceTargets = hasArg("--source-targets");
  const limit = positiveInteger(getArg("--limit"), DEFAULT_BRAND_LIMIT);

  if (explicitBrands.length > 0) {
    return uniqueValues(explicitBrands).slice(0, limit);
  }
  if (useSourceTargets) {
    return loadSourceTargetBrands({ includeAliases }).slice(0, limit);
  }
  return PRIORITY_BRANDS.slice(0, limit);
}

function selectedOperations() {
  const requested = compact(getArg("--operations"));
  const values = requested
    ? requested.split(",").map(compact).filter(Boolean)
    : [...DEFAULT_OPERATIONS];
  if (hasArg("--include-legacy-search-closures")) {
    values.push(...OPT_IN_OPERATIONS);
  }
  if (hasArg("--include-strict-reconcile") && !values.includes("strict")) {
    values.push("strict");
  }

  const invalid = values.filter((value) => !OPERATION_RPC[value]);
  if (invalid.length > 0) {
    throw new Error(`Unsupported --operations value(s): ${invalid.join(", ")}`);
  }
  return values;
}

function operationClosers(operations) {
  const closers = operations
    .filter((operation) => DUPLICATE_OPERATIONS.has(operation))
    .map((operation) => OPERATION_RPC[operation]);
  return uniqueValues(closers);
}

function auditClosersFor(operations) {
  if (hasArg("--audit-all-closures") || hasArg("--include-legacy-search-closures")) {
    return AUTOMATED_DUPLICATE_CLOSERS;
  }
  return operationClosers(operations);
}

function sqlArray(values) {
  if (!values || values.length === 0) return "ARRAY[]::TEXT[]";
  return `ARRAY[${values.map(sqlString).join(", ")}]::TEXT[]`;
}

function auditSql({ brands, operations, sampleLimit }) {
  if (hasArg("--skip-audit")) return "";
  const auditBrands = hasArg("--audit-all-brands") ? [] : brands;
  const closers = auditClosersFor(operations);
  if (closers.length === 0) return "";
  return `SELECT public.catalog_duplicate_closure_audit(${sqlArray(auditBrands)}, ${sqlArray(closers)}, ${sampleLimit}) AS duplicate_closure_audit;`;
}

function strictReconcileAuditSql({ brands, operations, sampleLimit }) {
  if (hasArg("--skip-audit") || !operations.includes("strict")) return "";
  const auditBrands = hasArg("--audit-all-brands") ? [] : brands;
  return `SELECT public.catalog_strict_reconcile_audit(${sqlArray(auditBrands)}, now() - interval '30 minutes', ${sampleLimit}) AS strict_reconcile_audit;`;
}

function fallbackSql({ brands, operations, perBrandLimit, auditSampleLimit }) {
  const statements = [];
  for (const brand of brands) {
    statements.push(`-- ${brand}`);
    for (const operation of operations) {
      const rpc = OPERATION_RPC[operation];
      statements.push(
        `SELECT ${sqlString(operation)} AS operation, ${sqlString(brand)} AS brand, public.${rpc}(${sqlString(brand)}, ${perBrandLimit}) AS result;`
      );
    }
  }

  return [
    "-- Run with a privileged role. Keep these statements separate if Supabase times out.",
    "-- This closes only verified duplicate/strict-search queue rows; it does not promote unverified ingredients.",
    "-- The identity operation joins direct same-brand verified-ready rows before slower search-based fallbacks.",
    "-- Default runs identity only. Use --include-legacy-search-closures only after auditing package/line variants.",
    ...statements,
    "",
    "-- Required post-run audits. Apply supabase/migrations/246_duplicate_closure_audit_rpc.sql and 248_harden_strict_reconcile_audit.sql first if these RPCs do not exist.",
    auditSql({ brands, operations, sampleLimit: auditSampleLimit }),
    strictReconcileAuditSql({ brands, operations, sampleLimit: auditSampleLimit }),
  ].join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countResolved(operation, data) {
  if (!data || typeof data !== "object") return 0;
  if (operation === "strict") return Number(data.resolved_product_strict_search_rows || 0);
  return Number(data.resolved_queue_rows || 0);
}

async function runSweep(client, { brands, operations, perBrandLimit, delayMs, continueOnError }) {
  const results = [];
  for (const brand of brands) {
    for (const operation of operations) {
      const rpc = OPERATION_RPC[operation];
      const row = {
        brand,
        operation,
        rpc,
      };
      try {
        const { data, error } = await client.rpc(rpc, {
          p_brand: brand,
          p_max_rows: perBrandLimit,
        });
        if (error) throw error;
        row.result = data;
        row.resolved_rows = countResolved(operation, data);
        row.status = "succeeded";
      } catch (error) {
        row.status = "failed";
        row.error = error.message || String(error);
        if (!continueOnError) throw new Error(`${rpc} failed for ${brand}: ${row.error}`);
      }
      results.push(row);
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  return results;
}

function auditFailureRows(audit) {
  return Number(audit?.summary?.failure_rows || 0);
}

async function runClosureAudit(client, { brands, operations, sampleLimit }) {
  if (hasArg("--skip-audit")) {
    return {
      skipped: true,
      reason: "skip_audit",
    };
  }
  const auditBrands = hasArg("--audit-all-brands") ? [] : brands;
  const closers = auditClosersFor(operations);
  if (closers.length === 0) {
    return {
      skipped: true,
      reason: "no_duplicate_closures_in_operation_scope",
    };
  }
  const { data, error } = await client.rpc("catalog_duplicate_closure_audit", {
    p_brands: auditBrands,
    p_closers: closers,
    p_sample_limit: sampleLimit,
  });
  if (error) throw new Error(`catalog_duplicate_closure_audit failed: ${error.message || String(error)}`);
  const failures = auditFailureRows(data);
  if (failures > 0) {
    const failureText = JSON.stringify(data?.failures || [], null, 2);
    throw new Error(`Duplicate closure audit failed with ${failures} unsafe closure(s): ${failureText}`);
  }
  return data;
}

async function runStrictReconcileAudit(client, { brands, operations, sinceIso, sampleLimit }) {
  if (hasArg("--skip-audit")) {
    return {
      skipped: true,
      reason: "skip_audit",
    };
  }
  if (!operations.includes("strict")) {
    return {
      skipped: true,
      reason: "strict_reconcile_not_requested",
    };
  }
  const auditBrands = hasArg("--audit-all-brands") ? [] : brands;
  const { data, error } = await client.rpc("catalog_strict_reconcile_audit", {
    p_brands: auditBrands,
    p_since: sinceIso,
    p_sample_limit: sampleLimit,
  });
  if (error) throw new Error(`catalog_strict_reconcile_audit failed: ${error.message || String(error)}`);
  const failures = auditFailureRows(data);
  if (failures > 0) {
    const failureText = JSON.stringify(data?.failures || [], null, 2);
    throw new Error(`Strict reconcile audit failed with ${failures} unsafe closure(s): ${failureText}`);
  }
  return data;
}

function printHelp() {
  console.log([
    "Usage: node scripts/catalog-verified-duplicate-sweep.mjs [--brand <brand>] [--sql]",
    "",
    "Safely drains stale acquisition queue rows already covered by verified official catalog rows.",
    "Requires SUPABASE_SERVICE_ROLE_KEY to execute; otherwise prints bounded SQL.",
    "",
    "Options:",
    "  --brand <brand>              Repeatable. Overrides default priority brand list.",
    "  --limit <n>                  Max brands to process. Default: 12.",
    "  --per-brand-limit <n>        Max queue rows per brand/function call. Default: 10.",
    "  --operations <list>          Comma list: identity,exact,unknown,alias,strict. Default: identity.",
    "  --include-legacy-search-closures",
    "                                Adds exact, unknown, and alias duplicate closures. Audit variants first.",
    "  --include-strict-reconcile   Adds strict verified-search queue reconcile.",
    "  --source-targets             Use brands from catalog-source-targets.json instead of priority list.",
    "  --include-aliases            Include source-target aliases with --source-targets.",
    "  --delay-ms <n>               Delay between RPC calls. Default: 250.",
    "  --audit-sample-limit <n>     Max unsafe closure examples in post-run audit. Default: 50.",
    "  --audit-all-closures         Audit every automated duplicate closer after execution.",
    "  --audit-all-brands           Audit every brand after execution instead of selected brands only.",
    "  --skip-audit                 Skip post-run duplicate closure audit. Avoid unless running read-only SQL manually.",
    "  --sql                        Print SQL instead of executing.",
    "  --json                       Emit JSON payload.",
    "  --continue-on-error          Continue after a brand/function error.",
  ].join("\n"));
}

async function main() {
  if (hasArg("--help")) {
    printHelp();
    return;
  }

  const brands = selectedBrands();
  const operations = selectedOperations();
  const perBrandLimit = positiveInteger(getArg("--per-brand-limit"), DEFAULT_PER_BRAND_LIMIT);
  const delayMs = positiveInteger(getArg("--delay-ms"), DEFAULT_DELAY_MS);
  const auditSampleLimit = positiveInteger(getArg("--audit-sample-limit"), 50);
  const json = hasArg("--json");
  const forceSql = hasArg("--sql");
  const client = forceSql ? null : clientFromEnv();

  if (!client) {
    const sql = fallbackSql({ brands, operations, perBrandLimit, auditSampleLimit });
    if (json) {
      console.log(JSON.stringify({
        mode: "sql",
        brands,
        operations,
        per_brand_limit: perBrandLimit,
        audit_sample_limit: auditSampleLimit,
        audit_required: !hasArg("--skip-audit"),
        sql,
      }, null, 2));
    } else {
      console.log(sql);
    }
    return;
  }

  const startedAtDate = new Date();
  const startedAt = startedAtDate.getTime();
  const results = await runSweep(client, {
    brands,
    operations,
    perBrandLimit,
    delayMs,
    continueOnError: hasArg("--continue-on-error"),
  });
  const audit = await runClosureAudit(client, {
    brands,
    operations,
    sampleLimit: auditSampleLimit,
  });
  const strictReconcileAudit = await runStrictReconcileAudit(client, {
    brands,
    operations,
    sinceIso: startedAtDate.toISOString(),
    sampleLimit: auditSampleLimit,
  });
  const payload = {
    mode: "execute",
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    brands,
    operations,
    per_brand_limit: perBrandLimit,
    resolved_rows: results.reduce((sum, row) => sum + Number(row.resolved_rows || 0), 0),
    audit,
    duplicate_audit: audit,
    strict_reconcile_audit: strictReconcileAudit,
    results,
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Verified duplicate sweep resolved ${payload.resolved_rows} row(s) across ${brands.length} brand(s).`);
  if (audit?.summary) {
    console.log(`Duplicate closure audit passed: ${audit.summary.failure_rows} failure(s), ${audit.summary.active_closed_rows} active audited closure(s).`);
  } else if (audit?.skipped) {
    console.log(`Duplicate closure audit skipped: ${audit.reason}.`);
  }
  if (strictReconcileAudit?.summary) {
    console.log(`Strict reconcile audit passed: ${strictReconcileAudit.summary.failure_rows} failure(s), ${strictReconcileAudit.summary.strict_resolved_rows} audited closure(s).`);
  } else if (strictReconcileAudit?.skipped) {
    console.log(`Strict reconcile audit skipped: ${strictReconcileAudit.reason}.`);
  }
  console.table(results.map((row) => ({
    brand: row.brand,
    operation: row.operation,
    status: row.status,
    resolvedRows: row.resolved_rows || 0,
    error: row.error || "",
  })));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
