import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_OUTPUT_DIR = "outputs/catalog-verified-us-pipeline/current";
const DEFAULT_MCP_GROUP_SIZE = "1";
const DEFAULT_LIVE_AUDIT_LIMIT = "10000";

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

function readJsonIfExists(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function runNodeStep({ name, args, outputDir, allowFailure = false }) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  });
  const step = {
    name,
    args,
    status: result.status === 0 ? "succeeded" : "failed",
    duration_ms: Date.now() - startedAt,
    stdout_path: path.join(outputDir, "logs", `${name}.stdout.log`),
    stderr_path: path.join(outputDir, "logs", `${name}.stderr.log`),
    error: result.error?.message || (result.status === 0 ? null : `exit_${result.status}`),
  };
  writeText(step.stdout_path, result.stdout || "");
  writeText(step.stderr_path, result.stderr || "");
  if (step.status !== "succeeded" && !allowFailure) {
    throw Object.assign(new Error(`${name} failed: ${compact(result.stderr || result.stdout || step.error)}`), { step });
  }
  return step;
}

function dashboardSummary() {
  const dashboard = readJsonIfExists("outputs/catalog-us-market-coverage-dashboard/current/dashboard.json", {});
  return dashboard.summary || dashboard || {};
}

function writeMarkdown(summary, outputDir) {
  const dashboard = summary.dashboard || {};
  const pendingImport = summary.pending_import || {};
  const rejectedWorklist = summary.rejected_worklist || {};
  const sourceFeedWorklist = summary.source_feed_worklist || {};
  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  const lines = [
    "# Woof Verified US Catalog Pipeline",
    "",
    `Generated at: ${summary.generated_at}`,
    "",
    "## Status",
    "",
    `- Overall status: ${summary.status}`,
    `- Live import status: ${summary.live_import_status}`,
    `- Verified-ready rows: ${dashboard.verified_ready_rows || 0}/${dashboard.verified_ready_goal || 12000}`,
    `- Pending validated import rows: ${pendingImport.pending_rows || 0}`,
    `- Raw import-rejected rows: ${pendingImport.import_rejected_rows || 0}`,
    `- Unique repair/exclusion tasks: ${rejectedWorklist.rejected_candidate_count || 0}`,
    `- Source-feed worklist rows: ${sourceFeedWorklist.row_count || 0}`,
    `- Source-feed queue source: ${sourceFeedWorklist.queue_source || "unknown"}`,
    `- Open actionable affected products: ${dashboard.open_actionable_affected_products || 0}`,
    `- Total queue affected products: ${dashboard.total_queue_affected_products || 0}`,
    "",
    "## Repair Breakdown",
    "",
    ...Object.entries(rejectedWorklist.rejected_by_repair_type || {}).map(([type, count]) => `- ${type}: ${count}`),
    "",
    "## Outputs",
    "",
    `- Pending import delta: \`outputs/catalog-pending-import-delta/current/manifest.json\``,
    `- Repair worklist: \`outputs/catalog-rejected-candidate-worklist/current/worklist.json\``,
    `- Evidence request pack: \`outputs/catalog-rejected-evidence-requests/current/manifest.json\``,
    `- Coverage dashboard: \`outputs/catalog-us-market-coverage-dashboard/current/dashboard.json\``,
    "",
    "## Steps",
    "",
    "| Step | Status | Duration ms | Error |",
    "|---|---|---:|---|",
    ...steps.map((step) => `| ${step.name} | ${step.status} | ${step.duration_ms} | ${compact(step.error).replace(/\|/g, "\\|")} |`),
    "",
  ];
  writeText(path.join(outputDir, "summary.md"), `${lines.join("\n")}\n`);
}

async function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-verified-us-pipeline.mjs",
      "",
      "Runs the safe local verified-catalog maintenance loop: pending import delta, rejected repair worklist, evidence request pack, dashboard, and checks.",
      "",
      "Options:",
      "  --output-dir <dir>       Default: outputs/catalog-verified-us-pipeline/current",
      "  --execute-imports        Execute pending verified imports when SUPABASE_SERVICE_ROLE_KEY is set.",
      "  --mcp-group-size <n>     Forwarded to catalog-pending-import-delta. Default: 1",
      "  --live-audit-limit <n>   Verified-ready rows scanned by live contract audit. Default: 10000",
      "  --skip-checks            Skip local validation checks.",
      "  --json",
    ].join("\n"));
    return;
  }

  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  fs.mkdirSync(outputDir, { recursive: true });
  const steps = [];
  let liveImportStatus = "not_requested";

  const pendingArgs = [
    "scripts/catalog-pending-import-delta.mjs",
    "--mcp-group-size", compact(getArg("--mcp-group-size", DEFAULT_MCP_GROUP_SIZE)),
  ];
  if (hasArg("--execute-imports")) {
    if (serviceRoleKey()) {
      pendingArgs.push("--execute");
      liveImportStatus = "requested";
    } else {
      liveImportStatus = "skipped_missing_service_role_key";
    }
  }

  const stepSpecs = [
    { name: "pending-import-delta", args: pendingArgs },
    { name: "rejected-candidate-worklist", args: ["scripts/catalog-rejected-candidate-worklist.mjs"] },
    { name: "rejected-evidence-request-pack", args: ["scripts/catalog-rejected-evidence-request-pack.mjs"] },
    { name: "us-market-coverage-dashboard", args: ["scripts/catalog-us-market-coverage-dashboard.mjs"] },
    { name: "source-feed-worklist", args: ["scripts/catalog-source-feed-worklist.mjs"] },
    {
      name: "live-verified-contract-audit",
      args: [
        "scripts/catalog-live-verified-contract-audit.mjs",
        "--limit", compact(getArg("--live-audit-limit", DEFAULT_LIVE_AUDIT_LIMIT)),
        "--fail-on-finding",
      ],
    },
  ];
  if (!hasArg("--skip-checks")) {
    stepSpecs.push(
      { name: "check-js-syntax", args: ["scripts/check-js-syntax.mjs"] },
      { name: "check-catalog-scraper", args: ["scripts/check-catalog-scraper.mjs"] },
      { name: "check-catalog-quality", args: ["scripts/check-catalog-quality.mjs"] }
    );
  }

  try {
    for (const spec of stepSpecs) {
      steps.push(runNodeStep({ ...spec, outputDir }));
    }
  } catch (error) {
    if (error.step) steps.push(error.step);
    const failedSummary = {
      generated_at: new Date().toISOString(),
      status: "failed",
      live_import_status: liveImportStatus,
      output_dir: outputDir,
      steps,
    };
    writeText(path.join(outputDir, "summary.json"), `${JSON.stringify(failedSummary, null, 2)}\n`);
    writeMarkdown({
      ...failedSummary,
      dashboard: {},
      pending_import: {},
      rejected_worklist: {},
      evidence_request_pack: {},
      source_feed_worklist: {},
    }, outputDir);
    throw error;
  }

  const pendingImport = readJsonIfExists("outputs/catalog-pending-import-delta/current/manifest.json", {});
  const rejectedWorklist = readJsonIfExists("outputs/catalog-rejected-candidate-worklist/current/worklist.json", {});
  const evidencePack = readJsonIfExists("outputs/catalog-rejected-evidence-requests/current/manifest.json", {});
  const dashboard = dashboardSummary();
  const sourceFeedWorklist = readJsonIfExists("outputs/catalog-source-feed-worklist/current/manifest.json", {});
  if (liveImportStatus === "requested") {
    liveImportStatus = pendingImport.executed_import?.status || "completed_or_no_rows";
  }

  const summary = {
    generated_at: new Date().toISOString(),
    status: steps.every((step) => step.status === "succeeded") ? "succeeded" : "failed",
    live_import_status: liveImportStatus,
    output_dir: outputDir,
    pending_import: {
      pending_rows: pendingImport.pending_rows || 0,
      import_rejected_rows: pendingImport.import_rejected_rows || 0,
      sql_chunks: pendingImport.sql_chunks || 0,
      mcp_sql_chunks: pendingImport.mcp_sql_chunks || 0,
      manifest_path: "outputs/catalog-pending-import-delta/current/manifest.json",
    },
    rejected_worklist: {
      rejected_candidate_count: rejectedWorklist.rejected_candidate_count || 0,
      pending_import_rejected_raw_rows: rejectedWorklist.pending_import_rejected_raw_rows || 0,
      rejected_by_stage: rejectedWorklist.rejected_by_stage || {},
      rejected_by_repair_type: rejectedWorklist.rejected_by_repair_type || {},
      manifest_path: "outputs/catalog-rejected-candidate-worklist/current/worklist.json",
    },
    evidence_request_pack: {
      request_count: evidencePack.request_count || 0,
      affected_source_count: evidencePack.affected_source_count || 0,
      manifest_path: "outputs/catalog-rejected-evidence-requests/current/manifest.json",
    },
    source_feed_worklist: {
      row_count: sourceFeedWorklist.row_count || 0,
      queue_source: sourceFeedWorklist.queue_source || "",
      recommended_action_counts: sourceFeedWorklist.recommended_action_counts || {},
      manifest_path: "outputs/catalog-source-feed-worklist/current/manifest.json",
    },
    dashboard: {
      verified_ready_rows: dashboard.verified_ready_rows || 0,
      verified_ready_goal: dashboard.verified_ready_goal || 12000,
      pending_import_sql_rows: dashboard.pending_import_sql_rows || 0,
      import_rejected_rows: dashboard.import_rejected_rows || 0,
      open_actionable_affected_products: (
        dashboard.action_plan_total_actionable_affected_products
        || dashboard.open_gap_affected_products
        || 0
      ),
      total_queue_affected_products: dashboard.total_queue_affected_products || 0,
      completion_state: dashboard.completion_state || "unknown",
      blockers: dashboard.completion_blockers || [],
    },
    steps,
  };

  writeText(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeMarkdown(summary, outputDir);

  if (hasArg("--json")) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(JSON.stringify({
      status: summary.status,
      live_import_status: summary.live_import_status,
      verified_ready_rows: summary.dashboard.verified_ready_rows,
      pending_rows: summary.pending_import.pending_rows,
      repair_tasks: summary.rejected_worklist.rejected_candidate_count,
      output_dir: outputDir,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
