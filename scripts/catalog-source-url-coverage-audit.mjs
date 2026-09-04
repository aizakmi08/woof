import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DISCOVERY_SCRIPT = "scripts/catalog-source-url-discovery.mjs";
const DEFAULT_OUTPUT_ROOT = "outputs/catalog-source-imports";
const DEFAULT_LIMIT = 10;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 180_000;

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

function sourceSlugFor(target = {}) {
  return normalizeKey(target.sourceSlug || target.sourceOwner || target.brand || "catalog-source");
}

function targetAccessStatus(target = {}) {
  return target.accessStatus || (target.discovery ? "runnable" : "requires_authorized_feed");
}

function outputSlugsFor(target = {}) {
  return [
    sourceSlugFor(target),
    ...(Array.isArray(target.outputAliases) ? target.outputAliases : []),
  ].map(normalizeKey).filter(Boolean);
}

function normalizedUrl(value) {
  try {
    const parsed = new URL(compact(value));
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/g, "");
  } catch {
    return compact(value).replace(/\/+$/g, "");
  }
}

function loadTargets() {
  return JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"))
    .filter((target) => targetAccessStatus(target) === "runnable")
    .map((target) => ({
      ...target,
      sourceSlug: sourceSlugFor(target),
    }));
}

function selectedTargets() {
  const brand = normalizeKey(getArg("--brand"));
  const source = normalizeKey(getArg("--source"));
  const tier = compact(getArg("--tier"));
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);

  return loadTargets()
    .filter((target) => {
      if (tier && target.coverageTier !== tier) return false;
      if (source && sourceSlugFor(target) !== source) return false;
      if (brand) {
        const keys = [target.brand, ...(target.aliases || [])].map(normalizeKey);
        if (!keys.includes(brand)) return false;
      }
      return true;
    })
    .sort((left, right) => (
      (left.coverageTier || "").localeCompare(right.coverageTier || "")
      || sourceSlugFor(left).localeCompare(sourceSlugFor(right))
    ))
    .slice(0, limit);
}

function existingUrlArtifacts(target, outputRoot) {
  const aliases = outputSlugsFor(target);
  const rows = [];
  if (!fs.existsSync(outputRoot)) return rows;

  for (const dirent of fs.readdirSync(outputRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const dirSlug = normalizeKey(dirent.name);
    if (!aliases.some((alias) => dirSlug === alias || dirSlug.startsWith(`${alias}-`))) continue;
    const urlPath = path.join(outputRoot, dirent.name, "urls.txt");
    if (fs.existsSync(urlPath)) rows.push(urlPath);
  }

  return rows.sort();
}

function readExistingUrls(target, outputRoot) {
  const urls = new Set();
  const artifacts = existingUrlArtifacts(target, outputRoot);
  for (const artifactPath of artifacts) {
    const text = fs.readFileSync(artifactPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const url = normalizedUrl(line);
      if (url) urls.add(url);
    }
  }
  return { urls, artifacts };
}

function discoveryArgsFor(target) {
  const discovery = target.discovery || {};
  const args = [
    DISCOVERY_SCRIPT,
    "--target-url", discovery.targetUrl || target.targetUrl,
    "--brand-term", target.brand,
    "--max-urls", String(positiveInteger(getArg("--max-urls"), positiveInteger(discovery.maxUrls, 250))),
  ];

  if (discovery.minScore !== undefined) args.push("--min-score", String(discovery.minScore));
  if (discovery.requiredUrlPattern) args.push("--required-url-pattern", discovery.requiredUrlPattern);
  if (discovery.excludedUrlPattern) args.push("--excluded-url-pattern", discovery.excludedUrlPattern);
  if (discovery.maxNestedSitemaps !== undefined) args.push("--max-nested-sitemaps", String(discovery.maxNestedSitemaps));
  if (discovery.maxCrawlPages !== undefined) args.push("--max-crawl-pages", String(discovery.maxCrawlPages));
  if (discovery.maxShopifyProductPages !== undefined) args.push("--max-shopify-product-pages", String(discovery.maxShopifyProductPages));
  if (discovery.fetchDelayMs !== undefined) args.push("--fetch-delay-ms", String(discovery.fetchDelayMs));
  for (const value of discovery.extraSitemaps || []) args.push("--extra-sitemap", String(value));
  for (const value of discovery.extraTargetUrls || []) args.push("--extra-target-url", String(value));

  return args;
}

function discoverUrls(target) {
  const timeoutMs = positiveInteger(
    getArg("--discovery-timeout-ms"),
    positiveInteger(target.discovery?.discoveryTimeoutMs, DEFAULT_DISCOVERY_TIMEOUT_MS),
  );
  const result = spawnSync(process.execPath, discoveryArgsFor(target), {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: timeoutMs,
  });

  if (result.status !== 0) {
    throw new Error([
      `discovery failed for ${sourceSlugFor(target)} with status ${result.status}`,
      result.error?.message,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }

  return result.stdout.split(/\r?\n/).map(normalizedUrl).filter(Boolean);
}

function writeMissingUrls(row, missingUrls) {
  const outputDir = compact(getArg("--write-missing-dir"));
  if (!outputDir || missingUrls.length === 0) return "";

  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${row.sourceSlug}-missing-urls.txt`);
  fs.writeFileSync(filePath, `${missingUrls.join("\n")}\n`, "utf8");
  return filePath;
}

function auditTarget(target, outputRoot) {
  const sourceSlug = sourceSlugFor(target);
  const currentUrls = discoverUrls(target);
  const { urls: existingUrls, artifacts } = readExistingUrls(target, outputRoot);
  const missingUrls = currentUrls.filter((url) => !existingUrls.has(url));
  const discoveryStatus = currentUrls.length > 0 ? "ok" : "no_urls_discovered";
  const row = {
    sourceSlug,
    brand: target.brand,
    coverageTier: target.coverageTier,
    targetUrl: target.discovery?.targetUrl || target.targetUrl,
    discoveryStatus,
    discoveredUrls: currentUrls.length,
    existingUrls: existingUrls.size,
    urlArtifacts: artifacts.length,
    missingUrls: missingUrls.length,
    missingSample: missingUrls.slice(0, 10),
  };
  const missingUrlListPath = writeMissingUrls(row, missingUrls);
  if (missingUrlListPath) {
    row.missingUrlListPath = missingUrlListPath;
    row.nextImportCommand = [
      "node scripts/catalog-source-import-batch.mjs",
      `--brand "${String(target.brand).replace(/"/g, '\\"')}"`,
      `--source ${sourceSlug}`,
      `--url-list ${missingUrlListPath}`,
      `--output-dir outputs/catalog-source-imports/${sourceSlug}-missing`,
      "--allow-partial-pages",
    ].join(" ");
  }
  return row;
}

function printReport(rows) {
  console.log("Catalog source URL coverage audit");
  console.table(rows.map((row) => ({
    source: row.sourceSlug,
    brand: row.brand,
    tier: row.coverageTier,
    discoveryStatus: row.discoveryStatus,
    discoveredUrls: row.discoveredUrls,
    existingUrls: row.existingUrls,
    urlArtifacts: row.urlArtifacts,
    missingUrls: row.missingUrls,
  })));
  for (const row of rows.filter((item) => item.discoveryStatus === "no_urls_discovered")) {
    console.log(`\n${row.sourceSlug}: no URLs discovered. Check whether this source needs a specialized adapter or source-target rule.`);
  }
  for (const row of rows.filter((item) => item.missingUrls > 0)) {
    console.log(`\n${row.sourceSlug} missing sample:`);
    for (const url of row.missingSample) console.log(`- ${url}`);
    if (row.nextImportCommand) console.log(`Import: ${row.nextImportCommand}`);
  }
}

function main() {
  const outputRoot = compact(getArg("--output-root", DEFAULT_OUTPUT_ROOT));
  const rows = [];
  for (const target of selectedTargets()) {
    try {
      const row = auditTarget(target, outputRoot);
      rows.push(row);
      if (hasArg("--ndjson")) console.log(JSON.stringify(row));
    } catch (error) {
      const row = {
        sourceSlug: sourceSlugFor(target),
        brand: target.brand,
        coverageTier: target.coverageTier,
        targetUrl: target.discovery?.targetUrl || target.targetUrl,
        discoveryStatus: "error",
        error: error.message || String(error),
      };
      rows.push(row);
      if (hasArg("--ndjson")) console.log(JSON.stringify(row));
      if (!hasArg("--continue-on-error")) break;
    }
  }

  if (!hasArg("--ndjson")) {
    if (hasArg("--json")) console.log(JSON.stringify(rows, null, 2));
    else printReport(rows);
  }

  if (rows.some((row) => row.error)) process.exit(1);
  if (hasArg("--fail-on-zero-discovery") && rows.some((row) => row.discoveryStatus === "no_urls_discovered")) process.exit(1);
}

main();
