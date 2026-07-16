import fs from "node:fs";
import {
  normalizeScraperCandidate,
  summarizeScraperCandidates,
  validateScraperCandidate,
} from "./catalog-scraper-contract.mjs";

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

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value) {
  return compact(value)
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

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

  row.push(field);
  rows.push(row);

  const [headerRow, ...dataRows] = rows.filter((csvRow) => csvRow.some((value) => compact(value)));
  if (!headerRow) return [];
  const headers = headerRow.map(normalizeHeader);

  return dataRows.map((csvRow) => {
    const record = {};
    headers.forEach((header, index) => {
      if (header) record[header] = compact(csvRow[index]);
    });
    return record;
  });
}

function parseInput(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  if (raw.startsWith("[") || raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.products)) return parsed.products;
    if (Array.isArray(parsed.rows)) return parsed.rows;
    throw new Error("JSON input must be an array or contain products/rows.");
  }
  return parseCsv(raw);
}

function main() {
  const filePath = getArg("--file");
  const source = compact(getArg("--source"));
  const brand = compact(getArg("--brand"));
  const sourceQuality = compact(getArg("--source-quality"));
  const requiredSourceUrlPattern = compact(getArg("--required-source-url-pattern"));
  const expectedBrandTerms = [
    ...getArgs("--expected-brand"),
    ...getArgs("--expected-brand-alias"),
  ].flatMap((value) => String(value).split(",").map(compact).filter(Boolean));
  const failOnReject = hasArg("--fail-on-reject");
  const emitAccepted = hasArg("--emit-accepted");
  const maxRejected = positiveInteger(getArg("--max-rejected"), 25);

  if (!filePath) {
    throw new Error("Usage: node scripts/catalog-scraper-validate.mjs --file feed.csv --source source-slug");
  }

  const rows = parseInput(filePath);
  const candidates = rows.map((row) => normalizeScraperCandidate(row, {
    source,
    brand,
    sourceQuality,
  }));
  const validations = candidates.map((candidate) => validateScraperCandidate(candidate, {
    expectedBrandTerms,
    requiredSourceUrlPattern,
  }));
  const summary = summarizeScraperCandidates(candidates, validations);
  const rejected = candidates
    .map((candidate, index) => ({
      cache_key: candidate.cache_key,
      product_name: candidate.product_name,
      brand: candidate.brand,
      source_url: candidate.source_url,
      reasons: validations[index].reasons,
    }))
    .filter((row) => row.reasons.length > 0)
    .slice(0, maxRejected);

  const payload = {
    generated_at: new Date().toISOString(),
    file: filePath,
    source: source || null,
    summary,
    rejected_sample_limit: maxRejected,
    rejected,
  };

  if (emitAccepted) {
    payload.accepted = candidates.filter((_, index) => validations[index].ok);
  }

  console.log(JSON.stringify(payload, null, 2));

  if (failOnReject && summary.rejected_candidates > 0) {
    process.exit(1);
  }
}

main();
