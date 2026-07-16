import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PAGE_FEED_EXTRACT_SCRIPT = "scripts/catalog-page-feed-extract.mjs";
const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_EXTRACT_TIMEOUT_MS = 180_000;
const DEFAULT_IMPORT_TIMEOUT_MS = 60_000;
const TEXT_SNAPSHOT_METADATA_ALIASES = new Map([
  ["source_url", "source_url"],
  ["sourceurl", "source_url"],
  ["product_url", "source_url"],
  ["producturl", "source_url"],
  ["url", "source_url"],
  ["product_image_url", "product_image_url"],
  ["productimageurl", "product_image_url"],
  ["image_url", "product_image_url"],
  ["imageurl", "product_image_url"],
  ["image", "product_image_url"],
  ["gtin", "gtin"],
  ["upc", "gtin"],
  ["barcode", "gtin"],
  ["sku", "sku"],
]);

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

function getArg(name, fallback = null) {
  const values = getArgs(name);
  return values.length > 0 ? values[values.length - 1] : fallback;
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

function slug(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "petco";
}

function readListFile(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map(compact)
    .filter(Boolean);
}

function walkJsonFiles(dirPath) {
  const output = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkJsonFiles(fullPath));
    } else if (/\.json$/i.test(entry.name)) {
      output.push(fullPath);
    }
  }

  return output;
}

function hasSnapshotBody(row) {
  return [
    row.html,
    row.body_html,
    row.bodyHtml,
    row.text,
    row.page_text,
    row.pageText,
    row.rendered_text,
    row.renderedText,
    row.visible_text,
    row.visibleText,
  ].some((value) => compact(value));
}

function hasSnapshotUrl(row) {
  return [
    row.source_url,
    row.sourceUrl,
    row.product_url,
    row.productUrl,
    row.url,
  ].some((value) => /^https:\/\/www\.petco\.com\/product\//i.test(compact(value)));
}

function normalizeTextSnapshotKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseTextSnapshot(raw) {
  const lines = String(raw || "").split(/\r?\n/);
  const metadata = {};
  let bodyStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*---\s*$/.test(line)) {
      bodyStart = index + 1;
      break;
    }

    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9 _-]{1,40})\s*:\s*(.*?)\s*$/);
    if (!match) break;

    const target = TEXT_SNAPSHOT_METADATA_ALIASES.get(normalizeTextSnapshotKey(match[1]));
    if (!target) break;

    const value = compact(match[2]);
    if (value) metadata[target] = value;
    bodyStart = index + 1;
  }

  const text = lines.slice(bodyStart).join("\n").trim();
  if (!text) return null;

  return {
    ...metadata,
    text,
  };
}

function readSnapshotInput(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (/\.json$/i.test(filePath)) {
    return JSON.parse(raw);
  }

  if (/\.txt$/i.test(filePath)) {
    return parseTextSnapshot(raw);
  }

  return null;
}

function snapshotEntriesFromFile(filePath) {
  try {
    const parsed = readSnapshotInput(filePath);
    const snapshots = Array.isArray(parsed) ? parsed : [parsed];
    return snapshots
      .map((snapshot, snapshotIndex) => ({ filePath, snapshot, snapshotIndex }))
      .filter(({ snapshot }) => (
        snapshot
        && !Array.isArray(snapshot)
        && typeof snapshot === "object"
        && hasSnapshotBody(snapshot)
        && hasSnapshotUrl(snapshot)
      ));
  } catch {
    return [];
  }
}

function uniquePaths(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const resolved = path.resolve(value);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    output.push(resolved);
  }
  return output;
}

function collectSnapshots() {
  const explicitSnapshots = [
    ...getArgs("--snapshot"),
    ...getArgs("--html"),
  ];
  const listFiles = getArgs("--file");
  const dirs = [
    ...getArgs("--snapshot-dir"),
    ...getArgs("--dir"),
  ];

  const candidates = [
    ...explicitSnapshots,
    ...listFiles.flatMap(readListFile),
    ...dirs.flatMap((dirPath) => walkJsonFiles(dirPath)),
  ];

  return uniquePaths(candidates).flatMap(snapshotEntriesFromFile);
}

function preparedSnapshotName(snapshotEntry, index) {
  const baseName = path.basename(snapshotEntry.filePath).replace(/\.[^.]+$/g, "");
  const arraySuffix = snapshotEntry.snapshotIndex > 0 ? `-${String(snapshotEntry.snapshotIndex + 1).padStart(3, "0")}` : "";
  return `${String(index + 1).padStart(4, "0")}-${slug(`${baseName}${arraySuffix}`)}.json`;
}

function prepareSnapshotFiles(snapshotEntries, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  return snapshotEntries.map((snapshotEntry, index) => {
    const { snapshot, filePath } = snapshotEntry;
    if (!snapshot || !hasSnapshotBody(snapshot) || !hasSnapshotUrl(snapshot)) {
      throw new Error(`Invalid Petco snapshot: ${filePath}`);
    }

    const outputPath = path.join(outputDir, preparedSnapshotName(snapshotEntry, index));
    fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return outputPath;
  });
}

function runNode(script, args, { timeoutMs } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: timeoutMs,
  });

  if (result.status !== 0) {
    if (result.error?.code === "ETIMEDOUT" || result.signal) {
      throw new Error(`${script} timed out after ${timeoutMs}ms`);
    }

    throw new Error([
      `${script} failed with status ${result.status}`,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((value) => compact(value)));
}

function feedSummary(csvText) {
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const dataRows = rows.slice(1);
  const ingredientIndex = header.indexOf("ingredient_statement");
  const imageIndex = header.indexOf("product_image_url");
  const sourceUrlIndex = header.indexOf("product_url");
  const cacheKeyIndex = header.indexOf("cache_key");

  return {
    rows: dataRows.length,
    rows_with_ingredients: dataRows.filter((row) => compact(row[ingredientIndex])).length,
    rows_with_images: dataRows.filter((row) => compact(row[imageIndex])).length,
    petco_source_rows: dataRows.filter((row) => /^https:\/\/www\.petco\.com\/product\//i.test(compact(row[sourceUrlIndex]))).length,
    stable_cache_key_rows: dataRows.filter((row) => /^petco[-:]/i.test(compact(row[cacheKeyIndex]))).length,
  };
}

function main() {
  const brand = compact(getArg("--brand", "WholeHearted"));
  const source = slug(getArg("--source", /\bwhole\s*hearted\b|\bwholehearted\b/i.test(brand) ? "petco-wholehearted" : "petco"));
  const outputDir = compact(getArg("--output-dir")) || `outputs/catalog-source-imports/${source}-snapshots`;
  const sqlDir = path.join(outputDir, "sql");
  const preparedSnapshotDir = path.join(outputDir, "snapshots");
  const snapshotListPath = path.join(outputDir, "snapshots.txt");
  const feedPath = path.join(outputDir, "feed.csv");
  const reportPath = path.join(outputDir, "report.json");
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const extractTimeoutMs = positiveInteger(getArg("--extract-timeout-ms"), DEFAULT_EXTRACT_TIMEOUT_MS);
  const importTimeoutMs = positiveInteger(getArg("--import-timeout-ms"), DEFAULT_IMPORT_TIMEOUT_MS);
  const allowPartialPages = hasArg("--allow-partial-pages");
  const execute = hasArg("--execute");
  const requiredSourceUrlPattern = compact(getArg("--required-source-url-pattern", "^https://www\\.petco\\.com/product/"));

  const snapshots = collectSnapshots();
  if (snapshots.length === 0) {
    throw new Error("Usage: node scripts/catalog-petco-snapshot-import-batch.mjs --snapshot-dir snapshots/ [--brand WholeHearted]");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const preparedSnapshots = prepareSnapshotFiles(snapshots, preparedSnapshotDir);
  fs.writeFileSync(snapshotListPath, `${preparedSnapshots.join("\n")}\n`, "utf8");

  const extractArgs = ["--file", snapshotListPath, "--brand", brand];
  if (allowPartialPages) extractArgs.push("--continue-on-error");
  else extractArgs.push("--strict");

  const extracted = runNode(PAGE_FEED_EXTRACT_SCRIPT, extractArgs, { timeoutMs: extractTimeoutMs });
  fs.writeFileSync(feedPath, extracted.stdout, "utf8");

  const importArgs = [
    "--file", feedPath,
    "--source", source,
    "--source-quality", "retailer_verified",
    "--ingredient-verification", "retailer_verified",
    "--image-verification", "retailer_verified",
    "--expected-brand", brand,
    "--required-source-url-pattern", requiredSourceUrlPattern,
  ];

  if (execute) {
    importArgs.push("--acquisition-reconcile-batches", "3");
  } else {
    importArgs.push(
      "--emit-sql-rpc",
      "--emit-sql-dir", sqlDir,
      "--sql-chunk-size", String(sqlChunkSize),
      "--sql-payload-format", "base64"
    );
  }

  const imported = runNode(OFFICIAL_FEED_IMPORT_SCRIPT, importArgs, { timeoutMs: importTimeoutMs });
  const stats = feedSummary(extracted.stdout);
  const report = {
    generated_at: new Date().toISOString(),
    brand,
    source,
    mode: execute ? "execute" : "emit_sql",
    output_dir: outputDir,
    snapshot_count: snapshots.length,
    feed_path: feedPath,
    sql_dir: execute ? null : sqlDir,
    feed_stats: stats,
    page_extract_stderr: extracted.stderr.trim(),
    import_stdout: imported.stdout.trim(),
    import_stderr: imported.stderr.trim(),
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    snapshot_count: snapshots.length,
    feed_path: feedPath,
    sql_dir: execute ? null : sqlDir,
    report_path: reportPath,
    feed_stats: stats,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
