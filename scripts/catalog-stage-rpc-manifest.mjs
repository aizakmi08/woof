import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resolveChunkPath(manifestPath, filePath) {
  const manifestDir = path.dirname(manifestPath);
  if (path.isAbsolute(filePath)) return filePath;
  if (fs.existsSync(filePath)) return filePath;
  return path.resolve(manifestDir, filePath);
}

function parsePayloadRows(sql) {
  const rows = [];
  for (const match of sql.matchAll(/decode\('([^']+)', 'base64'\)/g)) {
    rows.push(...JSON.parse(Buffer.from(match[1], "base64").toString("utf8")));
  }
  for (const match of sql.matchAll(/decode\('([0-9a-fA-F]+)', 'hex'\)/g)) {
    rows.push(...JSON.parse(Buffer.from(match[1], "hex").toString("utf8")));
  }
  return rows;
}

function readManifestRows(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rows = [];
  for (const chunk of manifest.chunks || []) {
    const file = compact(chunk.file);
    if (!file) continue;
    rows.push(...parsePayloadRows(fs.readFileSync(resolveChunkPath(manifestPath, file), "utf8")));
  }
  return { manifest, rows };
}

function supabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");
  }
  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function main() {
  const manifestPath = compact(getArg("--manifest"));
  const rpcName = compact(getArg("--rpc-name"));
  const importKey = compact(getArg("--import-key"));
  const batchSize = Math.min(positiveInteger(getArg("--batch-size"), 100), 250);
  const offset = nonNegativeInteger(getArg("--offset"), 0);
  const limit = positiveInteger(getArg("--limit"), 0);
  const dryRun = hasArg("--dry-run");

  if (!manifestPath || !rpcName || !importKey) {
    throw new Error("Usage: node scripts/catalog-stage-rpc-manifest.mjs --manifest manifest.json --rpc-name rpc --import-key key");
  }

  const { manifest, rows: allRows } = readManifestRows(manifestPath);
  const rows = allRows.slice(offset, limit > 0 ? offset + limit : undefined);
  console.log(`Manifest source: ${manifest.source || ""}`);
  console.log(`Manifest rows: ${allRows.length}`);
  console.log(`Rows selected: ${rows.length}`);
  console.log(`Batch size: ${batchSize}`);

  if (dryRun) return;

  const client = supabaseClient();
  let staged = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { data, error } = await client.rpc(rpcName, {
      payload: batch,
      import_key: importKey,
    });
    if (error) {
      throw new Error(`Stage failed at offset ${offset + index}: ${error.message}`);
    }
    staged += Number(data || 0);
    console.log(`Staged ${Math.min(index + batch.length, rows.length)}/${rows.length}`);
  }
  console.log(`Staged rows written: ${staged}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
