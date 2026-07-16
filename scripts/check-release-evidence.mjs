import fs from "node:fs";

const evidencePath = "RELEASE_EVIDENCE.md";
const evidenceRunbookPath = "RELEASE_EVIDENCE_RUNBOOK.md";
const strict = process.argv.includes("--strict");
const requiredStatuses = new Set(["Pending", "Ready", "Blocked", "Waived"]);
const releaseBlockerStatuses = new Set(["Pending", "Blocked"]);
const placeholderPattern = /\b(TODO|TBD|placeholder|pending evidence)\b/i;
const requiredKeys = [
  "github_current_branch_ci",
  "supabase_migration_history",
  "supabase_migrations_applied",
  "supabase_edge_functions_live",
  "supabase_auth_dashboard",
  "supabase_egress_plan",
  "revenuecat_offering_packages",
  "revenuecat_webhook_sync",
  "revenuecat_purchase_restore",
  "app_store_privacy",
  "app_store_metadata",
  "app_store_live_listing",
  "eas_remote_versioning",
  "sentry_release_health",
  "testflight_guest_scan",
  "testflight_accessibility_smoke",
  "kpi_event_ingestion",
  "growth_spend_gate",
];

function fail(message) {
  failures.push(message);
}

function parseRows(source) {
  return source
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length === 4 && cells[0] !== "Key" && !cells[0].startsWith("---"))
    .map(([key, status, requiredEvidence, evidence]) => ({
      key,
      status,
      requiredEvidence,
      evidence,
    }));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractRunbookSection(source, key) {
  const regex = new RegExp(`(?:^|\\n)## ${escapeRegex(key)}\\n([\\s\\S]*?)(?=\\n## |$)`);
  return source.match(regex)?.[1]?.trim() || "";
}

if (!fs.existsSync(evidencePath)) {
  throw new Error(`${evidencePath} is missing`);
}

if (!fs.existsSync(evidenceRunbookPath)) {
  throw new Error(`${evidenceRunbookPath} is missing`);
}

const failures = [];
const evidenceSource = fs.readFileSync(evidencePath, "utf8");
const evidenceRunbookSource = fs.readFileSync(evidenceRunbookPath, "utf8");
const rows = parseRows(evidenceSource);
const rowsByKey = new Map(rows.map((row) => [row.key, row]));

if (!evidenceSource.includes("npm run check:evidence -- --strict")) {
  fail("RELEASE_EVIDENCE.md must document the strict release check command");
}

if (!evidenceSource.includes("Do not paste private keys")) {
  fail("RELEASE_EVIDENCE.md must warn against storing private release data");
}

if (!evidenceSource.includes(evidenceRunbookPath)) {
  fail(`RELEASE_EVIDENCE.md must point operators to ${evidenceRunbookPath}`);
}

if (!evidenceRunbookSource.includes("Do not store secrets")) {
  fail(`${evidenceRunbookPath} must warn against storing private release data`);
}

if (!evidenceRunbookSource.includes("npm run check:evidence -- --strict")) {
  fail(`${evidenceRunbookPath} must document the strict release check command`);
}

for (const key of requiredKeys) {
  const row = rowsByKey.get(key);
  const runbookSection = extractRunbookSection(evidenceRunbookSource, key);
  if (!row) {
    fail(`Evidence matrix is missing ${key}`);
  } else {
    if (!requiredStatuses.has(row.status)) {
      fail(`${key}: status must be one of ${[...requiredStatuses].join(", ")}`);
    }

    if (row.requiredEvidence.length < 30) {
      fail(`${key}: required evidence description is too thin`);
    }

    if (row.evidence.length < 10) {
      fail(`${key}: evidence note is missing`);
    }

    if ((row.status === "Ready" || row.status === "Waived") && placeholderPattern.test(row.evidence)) {
      fail(`${key}: ${row.status} evidence cannot contain a placeholder note`);
    }

    if ((row.status === "Ready" || row.status === "Waived") && !/\b20\d{2}-\d{2}-\d{2}\b/.test(row.evidence)) {
      fail(`${key}: ${row.status} evidence must include an ISO date`);
    }

    if (strict && releaseBlockerStatuses.has(row.status)) {
      fail(`${key}: strict mode requires Ready or Waived, found ${row.status}`);
    }

    if (strict && placeholderPattern.test(row.evidence)) {
      fail(`${key}: strict mode requires concrete evidence, found placeholder note`);
    }

    if (row.status === "Waived" && !/\bowner\b/i.test(row.evidence)) {
      fail(`${key}: waived evidence must include an owner`);
    }

    if (row.status === "Waived" && !/\b(rationale|because)\b/i.test(row.evidence)) {
      fail(`${key}: waived evidence must include a rationale`);
    }
  }

  if (!runbookSection) {
    fail(`${evidenceRunbookPath}: missing ## ${key} section`);
  } else {
    for (const marker of ["Evidence source:", "Capture steps:", "Minimum proof:", "Ready when:"]) {
      if (!runbookSection.includes(marker)) {
        fail(`${evidenceRunbookPath}: ${key} section is missing ${marker}`);
      }
    }
  }
}

for (const row of rows) {
  if (!requiredKeys.includes(row.key)) {
    fail(`Evidence matrix contains unknown key ${row.key}`);
  }
}

if (failures.length > 0) {
  console.error(`Release evidence check failed${strict ? " in strict mode" : ""}:`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

const pendingCount = rows.filter((row) => row.status === "Pending").length;
const blockedCount = rows.filter((row) => row.status === "Blocked").length;
const readyCount = rows.filter((row) => row.status === "Ready").length;
const waivedCount = rows.filter((row) => row.status === "Waived").length;

console.log(
  `Release evidence check passed${strict ? " in strict mode" : ""}: ` +
    `${readyCount} ready, ${waivedCount} waived, ${pendingCount} pending, ${blockedCount} blocked`
);
