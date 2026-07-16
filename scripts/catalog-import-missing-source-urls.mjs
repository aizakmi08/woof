import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BATCH_SIZE = 100;

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

function canonicalUrl(value) {
  return compact(value).replace(/\/+$/g, "");
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readRows(sqlDir) {
  const manifestPath = `${sqlDir.replace(/\/+$/g, "")}/manifest.json`;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rows = [];

  for (const chunk of manifest.chunks || []) {
    const sql = fs.readFileSync(chunk.file, "utf8");
    for (const match of sql.matchAll(/decode\('([^']+)', 'base64'\)/g)) {
      rows.push(...JSON.parse(Buffer.from(match[1], "base64").toString("utf8")));
    }
  }

  return rows;
}

function keyFromEnv({ service = false } = {}) {
  if (service) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  }
  return process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
}

function supabaseClient({ service = false } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = keyFromEnv({ service }) || keyFromEnv({ service: !service });
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchLiveSourceUrls(client, source) {
  const urls = new Set();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from("product_data")
      .select("source_url")
      .eq("source", source)
      .range(from, to);

    if (error) throw error;
    for (const row of data || []) {
      const url = canonicalUrl(row.source_url);
      if (url) urls.add(url);
    }
    if (!data || data.length < pageSize) break;
  }

  return urls;
}

function filterRows(rows, { liveUrls, wantedUrls, limit }) {
  const seenUrls = new Set();
  const missing = [];

  for (const row of rows) {
    const url = canonicalUrl(row.source_url);
    if (!url || seenUrls.has(url)) continue;
    if (wantedUrls.size > 0 && !wantedUrls.has(url)) continue;
    seenUrls.add(url);
    if (liveUrls.has(url)) continue;
    missing.push(row);
    if (limit && missing.length >= limit) break;
  }

  return missing;
}

async function upsertMissingRows(client, rows, { batchSize, rpcName }) {
  let importedRows = 0;
  const batches = [];

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const { data, error } = await client.rpc(rpcName, { payload: batch });
    if (error) throw error;
    importedRows += Array.isArray(data) ? data.length : batch.length;
    batches.push({
      offset,
      submitted: batch.length,
      returned: Array.isArray(data) ? data.length : null,
    });
  }

  return { importedRows, batches };
}

async function main() {
  const sqlDir = compact(getArg("--sql-dir"));
  const source = compact(getArg("--source"));
  if (!sqlDir || !source) {
    throw new Error("Usage: node scripts/catalog-import-missing-source-urls.mjs --sql-dir <dir> --source <source> [--dry-run]");
  }

  const batchSize = positiveInteger(getArg("--batch-size"), DEFAULT_BATCH_SIZE);
  const limit = positiveInteger(getArg("--limit"), null);
  const rpcName = compact(getArg("--rpc-name", "upsert_catalog_product_feed")) || "upsert_catalog_product_feed";
  const dryRun = hasArg("--dry-run");
  const reportPath = compact(getArg("--report"));
  const wantedUrls = new Set(getArgs("--url").map(canonicalUrl).filter(Boolean));
  const rows = readRows(sqlDir);
  const readClient = supabaseClient({ service: false });
  if (!readClient) throw new Error("Missing SUPABASE_URL plus SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY for live comparison.");

  const liveUrls = await fetchLiveSourceUrls(readClient, source);
  const missingRows = filterRows(rows, { liveUrls, wantedUrls, limit });
  const serviceClient = supabaseClient({ service: true });
  const canImport = Boolean(serviceClient && keyFromEnv({ service: true }));
  let importResult = null;

  if (!dryRun && canImport && missingRows.length > 0) {
    importResult = await upsertMissingRows(serviceClient, missingRows, { batchSize, rpcName });
  }

  const summary = {
    source,
    sql_dir: sqlDir,
    sql_rows: rows.length,
    live_source_urls: liveUrls.size,
    missing_source_urls: missingRows.length,
    dry_run: dryRun || !canImport,
    import_enabled: !dryRun && canImport,
    imported_rows: importResult?.importedRows || 0,
    batches: importResult?.batches || [],
    sample_missing: missingRows.slice(0, 25).map((row) => ({
      source_url: row.source_url,
      product_name: row.product_name,
      cache_key: row.cache_key,
    })),
  };

  if (reportPath) {
    fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
