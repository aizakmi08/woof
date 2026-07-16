import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PAGE_FEED_EXTRACT_SCRIPT = "scripts/catalog-page-feed-extract.mjs";
const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_EXTRACT_TIMEOUT_MS = 180_000;
const DEFAULT_IMPORT_TIMEOUT_MS = 60_000;
const RETAILER_URL_PATTERNS = {
  petco: "^https://www\\.petco\\.com/product/",
  petsmart: "^https://www\\.petsmart\\.com/",
  chewy: "^https://www\\.chewy\\.com/",
  walmart: "^https://www\\.walmart\\.com/",
};
const RETAILER_SOURCE_DEFAULTS = {
  petco: "petco",
  petsmart: "petsmart",
  chewy: "chewy",
  walmart: "walmart",
};
const TEXT_SNAPSHOT_METADATA_ALIASES = new Map([
  ["source_url", "source_url"],
  ["sourceurl", "source_url"],
  ["product_url", "source_url"],
  ["producturl", "source_url"],
  ["url", "source_url"],
  ["canonical_url", "source_url"],
  ["canonicalurl", "source_url"],
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
    .replace(/^-+|-+$/g, "") || "retailer";
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueValues(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const key = slug(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function readListFile(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map(compact)
    .filter(Boolean);
}

function walkSnapshotFiles(dirPath) {
  const output = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkSnapshotFiles(fullPath));
    } else if (/\.(?:json|txt|html?)$/i.test(entry.name)) {
      output.push(fullPath);
    }
  }

  return output;
}

function sourceUrls(row) {
  return [
    row.source_url,
    row.sourceUrl,
    row.product_url,
    row.productUrl,
    row.canonical_url,
    row.canonicalUrl,
    row.url,
  ].map(compact).filter(Boolean);
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

function hasSnapshotUrl(row, sourceUrlRegex) {
  return sourceUrls(row).some((value) => sourceUrlRegex.test(value));
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

function htmlMetaContent(html, ...names) {
  for (const name of names) {
    const escaped = escapeRegex(name);
    const propertyPattern = new RegExp(`<meta\\b[^>]*\\bproperty=["']${escaped}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`, "i");
    const namePattern = new RegExp(`<meta\\b[^>]*\\bname=["']${escaped}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`, "i");
    const reversePropertyPattern = new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']+)["'][^>]*\\bproperty=["']${escaped}["'][^>]*>`, "i");
    const reverseNamePattern = new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']+)["'][^>]*\\bname=["']${escaped}["'][^>]*>`, "i");
    const match = html.match(propertyPattern)
      || html.match(namePattern)
      || html.match(reversePropertyPattern)
      || html.match(reverseNamePattern);
    if (match?.[1]) return compact(match[1]);
  }
  return "";
}

function htmlCanonicalUrl(html) {
  return compact(
    html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1]
    || html.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']canonical["'][^>]*>/i)?.[1]
    || htmlMetaContent(html, "og:url", "twitter:url")
  );
}

function htmlImageUrl(html) {
  return compact(htmlMetaContent(html, "og:image", "twitter:image", "image"));
}

function readSnapshotInput(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (/\.json$/i.test(filePath)) {
    return JSON.parse(raw);
  }

  if (/\.txt$/i.test(filePath)) {
    return parseTextSnapshot(raw);
  }

  if (/\.html?$/i.test(filePath)) {
    return {
      source_url: htmlCanonicalUrl(raw),
      product_image_url: htmlImageUrl(raw),
      html: raw,
    };
  }

  return null;
}

function snapshotEntriesFromFile(filePath, sourceUrlRegex) {
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
        && hasSnapshotUrl(snapshot, sourceUrlRegex)
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

function collectSnapshots(sourceUrlRegex) {
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
    ...dirs.flatMap((dirPath) => walkSnapshotFiles(dirPath)),
  ];

  return uniquePaths(candidates).flatMap((filePath) => snapshotEntriesFromFile(filePath, sourceUrlRegex));
}

function preparedSnapshotName(snapshotEntry, index) {
  const baseName = path.basename(snapshotEntry.filePath).replace(/\.[^.]+$/g, "");
  const arraySuffix = snapshotEntry.snapshotIndex > 0 ? `-${String(snapshotEntry.snapshotIndex + 1).padStart(3, "0")}` : "";
  return `${String(index + 1).padStart(4, "0")}-${slug(`${baseName}${arraySuffix}`)}.json`;
}

function prepareSnapshotFiles(snapshotEntries, outputDir, sourceUrlRegex) {
  fs.mkdirSync(outputDir, { recursive: true });

  return snapshotEntries.map((snapshotEntry, index) => {
    const { snapshot, filePath } = snapshotEntry;
    if (!snapshot || !hasSnapshotBody(snapshot) || !hasSnapshotUrl(snapshot, sourceUrlRegex)) {
      throw new Error(`Invalid retailer snapshot: ${filePath}`);
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

function feedSummary(csvText, { sourceUrlRegex, source }) {
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const dataRows = rows.slice(1);
  const ingredientIndex = header.indexOf("ingredient_statement");
  const imageIndex = header.indexOf("product_image_url");
  const sourceUrlIndex = header.indexOf("product_url");
  const cacheKeyIndex = header.indexOf("cache_key");
  const sourcePrefixRegex = new RegExp(`^${escapeRegex(source)}[-:]`, "i");

  return {
    rows: dataRows.length,
    rows_with_ingredients: dataRows.filter((row) => compact(row[ingredientIndex])).length,
    rows_with_images: dataRows.filter((row) => compact(row[imageIndex])).length,
    source_url_rows_matching_required_pattern: dataRows.filter((row) => sourceUrlRegex.test(compact(row[sourceUrlIndex]))).length,
    stable_cache_key_rows: dataRows.filter((row) => sourcePrefixRegex.test(compact(row[cacheKeyIndex]))).length,
  };
}

function retailerFromArgs() {
  const explicit = slug(getArg("--retailer", ""));
  if (explicit) return explicit;

  const source = slug(getArg("--source", ""));
  const pattern = compact(getArg("--required-source-url-pattern", ""));
  for (const retailer of Object.keys(RETAILER_URL_PATTERNS)) {
    if (source.startsWith(`${retailer}-`) || source === retailer) return retailer;
    if (pattern === RETAILER_URL_PATTERNS[retailer]) return retailer;
  }

  return "retailer";
}

function requiredSourceUrlPatternFor(retailer) {
  return compact(getArg("--required-source-url-pattern", RETAILER_URL_PATTERNS[retailer] || ""));
}

function sourceFor({ retailer, brand }) {
  const explicit = compact(getArg("--source"));
  if (explicit) return slug(explicit);

  const defaultSource = RETAILER_SOURCE_DEFAULTS[retailer] || "retailer";
  if (brand) return slug(`${defaultSource}-${brand}`);

  throw new Error("Pass --source <specific-retailer-source> or --brand <brand> so verified retailer evidence is not imported under a generic source.");
}

function usage() {
  return [
    "Usage:",
    "  node scripts/catalog-retailer-snapshot-import-batch.mjs --retailer petco --brand WholeHearted --snapshot-dir inputs/catalog-browser-snapshots/petco-wholehearted",
    "",
    "Required input:",
    "  --snapshot <file>, --file <list>, or --snapshot-dir <dir>",
    "",
    "Important flags:",
    "  --retailer <petco|petsmart|chewy|walmart>       Sets the default URL allow-list.",
    "  --required-source-url-pattern <regex>            Overrides the retailer URL allow-list.",
    "  --brand <brand>                                 Brand fallback for extraction and expected-brand import guard.",
    "  --expected-brand <brand>                        Repeatable extra brand guards.",
    "  --source <source-slug>                          Specific source slug, e.g. chewy-american-journey.",
    "  --allow-partial-pages                           Quarantine incomplete pages and continue valid rows.",
    "  --execute                                      Import with service role instead of emitting audited SQL.",
  ].join("\n");
}

function main() {
  if (hasArg("--help") || hasArg("-h")) {
    console.log(usage());
    return;
  }

  const retailer = retailerFromArgs();
  const brand = compact(getArg("--brand", ""));
  const source = sourceFor({ retailer, brand });
  const sourceQuality = compact(getArg("--source-quality", "retailer_verified"));
  const ingredientVerification = compact(getArg("--ingredient-verification", sourceQuality === "retailer_verified" ? "retailer_verified" : sourceQuality));
  const imageVerification = compact(getArg("--image-verification", sourceQuality === "retailer_verified" ? "retailer_verified" : sourceQuality));
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
  const requiredSourceUrlPattern = requiredSourceUrlPatternFor(retailer);
  if (!requiredSourceUrlPattern) {
    throw new Error("Pass --retailer petco|petsmart|chewy|walmart or --required-source-url-pattern <regex>.");
  }

  const sourceUrlRegex = new RegExp(requiredSourceUrlPattern, "i");
  const snapshots = collectSnapshots(sourceUrlRegex);
  if (snapshots.length === 0) {
    throw new Error(`${usage()}\n\nNo usable snapshots matched required source URL pattern: ${requiredSourceUrlPattern}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const preparedSnapshots = prepareSnapshotFiles(snapshots, preparedSnapshotDir, sourceUrlRegex);
  fs.writeFileSync(snapshotListPath, `${preparedSnapshots.join("\n")}\n`, "utf8");

  const extractArgs = ["--file", snapshotListPath];
  if (brand) extractArgs.push("--brand", brand);
  if (allowPartialPages) extractArgs.push("--continue-on-error");
  else extractArgs.push("--strict");

  const extracted = runNode(PAGE_FEED_EXTRACT_SCRIPT, extractArgs, { timeoutMs: extractTimeoutMs });
  fs.writeFileSync(feedPath, extracted.stdout, "utf8");

  const expectedBrands = uniqueValues([
    brand,
    ...getArgs("--expected-brand"),
    ...getArgs("--expected-brand-alias"),
  ].flatMap((value) => String(value).split(",")));
  const importArgs = [
    "--file", feedPath,
    "--source", source,
    "--source-quality", sourceQuality,
    "--ingredient-verification", ingredientVerification,
    "--image-verification", imageVerification,
    "--required-source-url-pattern", requiredSourceUrlPattern,
  ];
  for (const expectedBrand of expectedBrands) {
    importArgs.push("--expected-brand", expectedBrand);
  }

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
  const stats = feedSummary(extracted.stdout, { sourceUrlRegex, source });
  const report = {
    generated_at: new Date().toISOString(),
    retailer,
    brand,
    expected_brands: expectedBrands,
    source,
    source_quality: sourceQuality,
    ingredient_verification: ingredientVerification,
    image_verification: imageVerification,
    required_source_url_pattern: requiredSourceUrlPattern,
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
    retailer,
    source,
    required_source_url_pattern: requiredSourceUrlPattern,
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
