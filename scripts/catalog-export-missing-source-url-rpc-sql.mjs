import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function canonicalUrl(value) {
  return compact(value).replace(/\/+$/g, "");
}

function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function safeFileSegment(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "catalog-source";
}

function readRows(sqlDir) {
  const manifestPath = path.join(sqlDir.replace(/\/+$/g, ""), "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rows = [];

  for (const chunk of manifest.chunks || []) {
    const chunkPath = path.isAbsolute(chunk.file) ? chunk.file : chunk.file;
    if (!fs.existsSync(chunkPath)) continue;
    const sql = fs.readFileSync(chunkPath, "utf8");
    for (const match of sql.matchAll(/decode\('([^']+)', 'base64'\)/g)) {
      rows.push(...JSON.parse(Buffer.from(match[1], "base64").toString("utf8")));
    }
    for (const match of sql.matchAll(/decode\('([0-9a-fA-F]+)', 'hex'\)/g)) {
      rows.push(...JSON.parse(Buffer.from(match[1], "hex").toString("utf8")));
    }
  }

  return rows;
}

function supabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
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
    const { data, error } = await client
      .from("product_data")
      .select("source_url")
      .eq("source", source)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    for (const row of data || []) {
      const url = canonicalUrl(row.source_url);
      if (url) urls.add(url);
    }
    if (!data || data.length < pageSize) break;
  }

  return urls;
}

function missingRows(rows, liveUrls) {
  const seen = new Set();
  const missing = [];

  for (const row of rows) {
    const url = canonicalUrl(row.source_url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!liveUrls.has(url)) missing.push(row);
  }

  return missing;
}

function emitMcpGroupSql(rows) {
  const values = rows.map((row, index) => {
    const payload = JSON.stringify([row]);
    return `    (${index + 1}, '${md5(payload)}', '${Buffer.from(payload, "utf8").toString("hex")}')`;
  });

  return `
WITH payloads(row_number, expected_md5, payload_hex) AS (
  VALUES
${values.join(",\n")}
),
decoded_payloads AS (
  SELECT
    row_number,
    expected_md5,
    convert_from(decode(payload_hex, 'hex'), 'UTF8') AS payload_text
  FROM payloads
),
guarded_payloads AS (
  SELECT
    row_number,
    (
      CASE
        WHEN md5(payload_text) = expected_md5 THEN payload_text
        ELSE (1 / (CASE WHEN payload_text IS NULL THEN 0 ELSE 0 END))::TEXT
      END
    )::jsonb AS payload
  FROM decoded_payloads
),
grouped_upserts AS (
  SELECT
    row_number,
    (SELECT count(*) FROM public.upsert_catalog_product_feed(payload))::INTEGER AS upserted_rows
  FROM guarded_payloads
)
SELECT
  count(*) AS attempted_rows,
  COALESCE(sum(upserted_rows), 0)::INTEGER AS upserted_rows
FROM grouped_upserts;
`.trim();
}

function writeSqlFiles(rows, { outputDir, source, groupSize }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const sourceSegment = safeFileSegment(source);
  const files = [];

  for (const file of fs.readdirSync(outputDir)) {
    if (file === "manifest.json" || /^mcp-\d{4}-/.test(file)) {
      fs.unlinkSync(path.join(outputDir, file));
    }
  }

  for (let offset = 0; offset < rows.length; offset += groupSize) {
    const groupRows = rows.slice(offset, offset + groupSize);
    const index = String(files.length + 1).padStart(4, "0");
    const file = path.join(
      outputDir,
      `mcp-${index}-${sourceSegment}-missing-offset-${offset}-rows-${groupRows.length}.sql`
    );
    const sql = [
      `-- Source: ${source}`,
      "-- Mode: missing-source-url-rpc",
      "-- Payload format: hex",
      `-- Offset: ${offset}`,
      `-- Rows: ${groupRows.length}`,
      emitMcpGroupSql(groupRows),
      "",
    ].join("\n");
    fs.writeFileSync(file, sql, "utf8");
    files.push({ file, offset, rows: groupRows.length });
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    source,
    total_missing_rows: rows.length,
    group_size: groupSize,
    files,
  };
  const manifestFile = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifestFile, files };
}

async function main() {
  const sqlDir = compact(getArg("--sql-dir"));
  const source = compact(getArg("--source"));
  const outputDir = compact(getArg("--emit-sql-dir"));
  const groupSize = positiveInteger(getArg("--group-size"), 2);

  if (!sqlDir || !source || !outputDir) {
    throw new Error("Usage: node scripts/catalog-export-missing-source-url-rpc-sql.mjs --sql-dir <dir> --source <source> --emit-sql-dir <dir>");
  }

  const client = supabaseClient();
  if (!client) throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY for live comparison.");

  const rows = readRows(sqlDir);
  const liveUrls = await fetchLiveSourceUrls(client, source);
  const missing = missingRows(rows, liveUrls);
  const written = writeSqlFiles(missing, { outputDir, source, groupSize });

  console.log(JSON.stringify({
    source,
    sql_dir: sqlDir,
    live_source_urls: liveUrls.size,
    input_rows: rows.length,
    missing_source_urls: missing.length,
    emit_sql_dir: outputDir,
    group_size: groupSize,
    files: written.files,
    manifest: written.manifestFile,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
