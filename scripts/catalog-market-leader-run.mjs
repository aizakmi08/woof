import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-market-leaders/current";
const DEFAULT_INPUT_DROPZONE_DIR = "inputs/catalog-authorized-feeds";
const DEFAULT_SCRAPE_MODE = "extract";
const DEFAULT_SOURCE_TIMEOUT_MINUTES = "12";
const TARGET_PRIORITY = {
  tier_1_us_retail: 1,
  tier_2_us_retail: 2,
};
const RETAILER_SOURCE_OWNERS = new Set(["chewy", "petco", "petsmart", "walmart"]);

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

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sourceSlugFor(target = {}) {
  return normalizeKey(target.sourceSlug || target.sourceOwner || target.brand || "catalog-source");
}

function targetAccessStatus(target = {}) {
  return target.accessStatus || (target.discovery ? "runnable" : "requires_authorized_feed");
}

function sourceOwnerKey(target = {}) {
  const owner = compact(target.sourceOwner);
  const match = owner.match(/^(Chewy|Petco|PetSmart|Walmart)(?:\b|\s*\/)/i);
  return normalizeKey(match?.[1] || "");
}

function isMarketLeaderTarget(target = {}) {
  return (
    target.coverageTier === "tier_1_us_retail"
    || RETAILER_SOURCE_OWNERS.has(sourceOwnerKey(target))
  );
}

function loadTargets() {
  return JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"))
    .map((target) => ({
      ...target,
      sourceSlug: sourceSlugFor(target),
      accessStatus: targetAccessStatus(target),
    }))
    .filter(isMarketLeaderTarget)
    .sort((left, right) => (
      (TARGET_PRIORITY[left.coverageTier] || 99) - (TARGET_PRIORITY[right.coverageTier] || 99)
      || left.accessStatus.localeCompare(right.accessStatus)
      || left.sourceSlug.localeCompare(right.sourceSlug)
    ));
}

function selectedTargets() {
  const brandFilters = new Set(getArgs("--brand").map(normalizeKey).filter(Boolean));
  const sourceFilters = new Set(getArgs("--source").map(normalizeKey).filter(Boolean));
  const accessFilters = new Set(getArgs("--access-status").map(compact).filter(Boolean));
  const onlyRunnable = hasArg("--only-runnable");
  const onlyRestricted = hasArg("--only-restricted");
  const limit = positiveInteger(getArg("--limit"), 0);

  const rows = loadTargets().filter((target) => {
    if (brandFilters.size > 0) {
      const keys = [target.brand, ...(target.aliases || [])].map(normalizeKey);
      if (!keys.some((key) => brandFilters.has(key))) return false;
    }
    if (sourceFilters.size > 0 && !sourceFilters.has(normalizeKey(target.sourceSlug))) return false;
    if (accessFilters.size > 0 && !accessFilters.has(target.accessStatus)) return false;
    if (onlyRunnable && target.accessStatus !== "runnable") return false;
    if (onlyRestricted && target.accessStatus === "runnable") return false;
    return true;
  });

  return limit > 0 ? rows.slice(0, limit) : rows;
}

function shellQuote(value) {
  return `"${String(value || "").replace(/(["\\$`])/g, "\\$1")}"`;
}

function commandLine(args) {
  return args.map((arg) => (/\s/.test(arg) ? shellQuote(arg) : arg)).join(" ");
}

function runNode(args, { outputDir, name, allowFailure = false, timeoutMs = 30 * 60_000 } = {}) {
  fs.mkdirSync(path.join(outputDir, "logs"), { recursive: true });
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
    timeout: timeoutMs,
  });
  const row = {
    name,
    args,
    status: result.status === 0 ? "succeeded" : "failed",
    duration_ms: Date.now() - startedAt,
    stdout_path: path.join(outputDir, "logs", `${name}.stdout.log`),
    stderr_path: path.join(outputDir, "logs", `${name}.stderr.log`),
    error: result.error?.message || (result.status === 0 ? "" : `exit_${result.status}`),
  };
  fs.writeFileSync(row.stdout_path, result.stdout || "", "utf8");
  fs.writeFileSync(row.stderr_path, result.stderr || "", "utf8");
  if (row.status !== "succeeded" && !allowFailure) {
    throw Object.assign(new Error(`${name} failed: ${compact(result.stderr || result.stdout || row.error)}`), { step: row });
  }
  return row;
}

function scrapeArgsFor(target, scrapeMode) {
  const args = [
    "scripts/catalog-scrape-all.mjs",
    "--mode", scrapeMode,
    "--source", target.sourceSlug,
    "--limit", "1",
    "--source-timeout-minutes", compact(getArg("--source-timeout-minutes", DEFAULT_SOURCE_TIMEOUT_MINUTES)),
  ];
  if (hasArg("--changed-only")) args.push("--changed-only");
  if (hasArg("--continue-on-error")) args.push("--continue-on-error");
  if (hasArg("--allow-partial-pages")) args.push("--allow-partial-pages");
  if (scrapeMode === "import" && !hasArg("--execute-imports")) args.push("--dry-run");
  for (const name of ["--url-offset", "--url-limit", "--sql-chunk-size", "--batch-size"]) {
    const value = getArg(name);
    if (value) args.push(name, value);
  }
  return args;
}

function authorizedPackArgs(restrictedTargets, outputDir) {
  const args = [
    "scripts/catalog-authorized-feed-request-pack.mjs",
    "--output-dir", path.join(outputDir, "authorized-feed-requests"),
    "--all-restricted",
    "--write-input-dropzone",
    "--input-dropzone-dir", compact(getArg("--input-dropzone-dir", DEFAULT_INPUT_DROPZONE_DIR)),
    "--limit", String(Math.max(100, restrictedTargets.length + 10)),
  ];
  for (const target of restrictedTargets) args.push("--source", target.sourceSlug);
  return args;
}

function readinessArgs(outputDir) {
  return [
    "scripts/catalog-restricted-source-readiness.mjs",
    "--manifest", path.join(outputDir, "authorized-feed-requests", "manifest.json"),
    "--input-dir", "inputs/catalog-authorized-feeds",
    "--import-output-dir", "outputs/catalog-authorized-feed-imports",
  ];
}

function summarizeTargets(targets) {
  const counts = {
    total: targets.length,
    runnable: 0,
    restricted: 0,
    by_access_status: {},
    by_source_priority: {},
    by_coverage_tier: {},
  };
  for (const target of targets) {
    const accessStatus = target.accessStatus;
    counts.by_access_status[accessStatus] = (counts.by_access_status[accessStatus] || 0) + 1;
    counts.by_source_priority[target.sourcePriority] = (counts.by_source_priority[target.sourcePriority] || 0) + 1;
    counts.by_coverage_tier[target.coverageTier] = (counts.by_coverage_tier[target.coverageTier] || 0) + 1;
    if (accessStatus === "runnable") counts.runnable += 1;
    else counts.restricted += 1;
  }
  return counts;
}

function targetManifestRow(target) {
  return {
    source_slug: target.sourceSlug,
    brand: target.brand,
    aliases: Array.isArray(target.aliases) ? target.aliases : [],
    source_owner: target.sourceOwner || "",
    source_priority: target.sourcePriority || "",
    coverage_tier: target.coverageTier || "",
    access_status: target.accessStatus,
    target_url: target.targetUrl || "",
    discovery_target_url: target.discovery?.targetUrl || "",
    notes: target.notes || "",
  };
}

function writeReadme({ outputDir, summary, commands }) {
  const lines = [
    "# Woof Market-Leader Catalog Run",
    "",
    "This run targets official tier-1 US dog/cat food brands plus broad Petco, PetSmart, Chewy, and Walmart catalog acquisition targets.",
    "",
    "Verified app-ready rows still require exact source-backed ingredients, a verified front package image, dog/cat metadata, a source URL, and a verification timestamp. Restricted retailer catalogs are feed requests, not blind public-page reuse.",
    "",
    "## Summary",
    "",
    `- Targets: ${summary.total}`,
    `- Runnable official/retailer-approved targets: ${summary.runnable}`,
    `- Restricted targets needing authorized feed/snapshot/shared source: ${summary.restricted}`,
    "",
    "## Commands",
    "",
    ...commands.map((command) => `- \`${commandLine(command.args)}\``),
    "",
    "## Outputs",
    "",
    `- Manifest: \`${path.relative(process.cwd(), path.join(outputDir, "manifest.json"))}\``,
    `- Runnable source list: \`${path.relative(process.cwd(), path.join(outputDir, "runnable-sources.txt"))}\``,
    `- Restricted source list: \`${path.relative(process.cwd(), path.join(outputDir, "restricted-sources.txt"))}\``,
    `- Authorized feed pack: \`${path.relative(process.cwd(), path.join(outputDir, "authorized-feed-requests"))}\``,
    "",
  ];
  fs.writeFileSync(path.join(outputDir, "README.md"), `${lines.join("\n")}\n`, "utf8");
}

function writePlan({ outputDir, mode, targets, steps = [] }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const runnableTargets = targets.filter((target) => target.accessStatus === "runnable");
  const restrictedTargets = targets.filter((target) => target.accessStatus !== "runnable");
  const scrapeMode = compact(getArg("--scrape-mode", DEFAULT_SCRAPE_MODE));
  const commands = [];
  if (runnableTargets.length > 0) {
    commands.push(...runnableTargets.map((target) => ({
      name: `scrape-${target.sourceSlug}`,
      args: scrapeArgsFor(target, scrapeMode),
    })));
  }
  if (restrictedTargets.length > 0) {
    commands.push({
      name: "authorized-feed-request-pack",
      args: authorizedPackArgs(restrictedTargets, outputDir),
    });
    commands.push({
      name: "restricted-source-readiness",
      args: readinessArgs(outputDir),
    });
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    mode,
    source_targets_path: SOURCE_TARGETS_PATH,
    output_dir: outputDir,
    scrape_mode: scrapeMode,
    summary: summarizeTargets(targets),
    commands,
    steps,
    targets: targets.map(targetManifestRow),
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "runnable-sources.txt"), `${runnableTargets.map((target) => target.sourceSlug).join("\n")}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "restricted-sources.txt"), `${restrictedTargets.map((target) => target.sourceSlug).join("\n")}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "run-commands.sh"), `${[
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    ...commands.map((command) => commandLine([process.execPath, ...command.args])),
  ].join("\n")}\n`, "utf8");
  writeReadme({ outputDir, summary: manifest.summary, commands });
  return manifest;
}

function runRestrictedPack({ outputDir, restrictedTargets, steps }) {
  if (restrictedTargets.length === 0) return;
  steps.push(runNode(authorizedPackArgs(restrictedTargets, outputDir), {
    outputDir,
    name: "authorized-feed-request-pack",
    allowFailure: hasArg("--continue-on-error"),
  }));
  steps.push(runNode(readinessArgs(outputDir), {
    outputDir,
    name: "restricted-source-readiness",
    allowFailure: true,
  }));
}

function runScrape({ outputDir, runnableTargets, steps }) {
  const scrapeMode = compact(getArg("--scrape-mode", DEFAULT_SCRAPE_MODE));
  const maxRunnable = positiveInteger(getArg("--max-runnable"), 0);
  const selected = maxRunnable > 0 ? runnableTargets.slice(0, maxRunnable) : runnableTargets;
  for (const target of selected) {
    steps.push(runNode(scrapeArgsFor(target, scrapeMode), {
      outputDir,
      name: `scrape-${target.sourceSlug}`,
      allowFailure: hasArg("--continue-on-error"),
      timeoutMs: positiveInteger(getArg("--child-timeout-minutes"), 45) * 60_000,
    }));
  }
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-market-leader-run.mjs",
      "",
      "Builds and optionally executes the Woof market-leader catalog acquisition run.",
      "",
      "Modes:",
      "  --mode plan              Write manifest, source lists, commands, and README. Default.",
      "  --mode restricted-pack   Generate authorized-feed templates/readiness for restricted sources.",
      "  --mode scrape            Run catalog-scrape-all for runnable market-leader sources.",
      "  --mode full              Generate restricted pack and run runnable source extraction/import.",
      "",
      "Options:",
      "  --output-dir <dir>       Default: outputs/catalog-market-leaders/current",
      "  --input-dropzone-dir <d> Default: inputs/catalog-authorized-feeds",
      "  --scrape-mode <mode>     extract or import. Default: extract; import is dry-run unless --execute-imports is set.",
      "  --changed-only           Forwarded to catalog-scrape-all.",
      "  --continue-on-error      Continue when a source fails and write failure logs.",
      "  --max-runnable <n>       Limit runnable sources during scrape/full.",
      "  --source <slug>          Repeatable source filter.",
      "  --brand <brand>          Repeatable brand filter.",
      "  --access-status <status> Repeatable access-status filter.",
      "  --only-runnable",
      "  --only-restricted",
      "  --json",
    ].join("\n"));
    return;
  }

  const mode = compact(getArg("--mode", "plan"));
  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const targets = selectedTargets();
  if (targets.length === 0) throw new Error("No market-leader targets matched the requested filters.");
  const runnableTargets = targets.filter((target) => target.accessStatus === "runnable");
  const restrictedTargets = targets.filter((target) => target.accessStatus !== "runnable");
  const steps = [];

  writePlan({ outputDir, mode, targets, steps });

  if (mode === "restricted-pack" || mode === "full") {
    runRestrictedPack({ outputDir, restrictedTargets, steps });
  } else if (mode === "scrape") {
    runScrape({ outputDir, runnableTargets, steps });
  } else if (mode !== "plan") {
    throw new Error(`Unsupported --mode ${mode}. Use plan, restricted-pack, scrape, or full.`);
  }

  if (mode === "full") {
    runScrape({ outputDir, runnableTargets, steps });
  }

  const manifest = writePlan({ outputDir, mode, targets, steps });
  if (hasArg("--json")) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    console.log("Market-leader catalog run prepared");
    console.log(`Output: ${outputDir}`);
    console.table([
      {
        targets: manifest.summary.total,
        runnable: manifest.summary.runnable,
        restricted: manifest.summary.restricted,
        mode,
      },
    ]);
  }
}

main();
