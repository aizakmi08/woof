import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_GROUP_SIZE = 25;

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

function safeFileSegment(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "catalog-source";
}

function md5(value) {
  return crypto.createHash("md5").update(String(value || ""), "utf8").digest("hex");
}

function sqlString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function readRows(sqlDir) {
  const manifestPath = path.join(sqlDir.replace(/\/+$/g, ""), "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rows = [];

  for (const chunk of manifest.chunks || []) {
    const chunkFile = compact(chunk.file);
    const chunkPath = path.isAbsolute(chunkFile)
      ? chunkFile
      : fs.existsSync(chunkFile)
        ? chunkFile
        : path.resolve(path.dirname(manifestPath), chunkFile);
    if (!fs.existsSync(chunkPath)) continue;
    const sql = fs.readFileSync(chunkPath, "utf8");
    for (const match of sql.matchAll(/decode\('([^']+)', 'base64'\)/g)) {
      rows.push(...JSON.parse(Buffer.from(match[1], "base64").toString("utf8")));
    }
    for (const match of sql.matchAll(/decode\('([0-9a-fA-F]+)', 'hex'\)/g)) {
      rows.push(...JSON.parse(Buffer.from(match[1], "hex").toString("utf8")));
    }
  }

  return { manifest, rows };
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

function filterMissingRows(rows, { liveUrls, wantedUrls, limit }) {
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

function payloadSql(rows, { source, sourceQuality, coverageTier, extractorVersion, importKey }) {
  const payloadText = JSON.stringify(rows);
  const payloadMd5 = md5(payloadText);
  const payloadHex = Buffer.from(payloadText, "utf8").toString("hex");
  const totalRows = rows.length;

  return `
DO $catalog_import$
DECLARE
  v_payload JSONB;
  v_run_id UUID;
  v_source_urls JSONB := '[]'::jsonb;
  v_imported_rows INTEGER := 0;
  v_evidence_rows INTEGER := 0;
  v_verified_ready_rows INTEGER := 0;
BEGIN
  SELECT payload_text::jsonb
  INTO v_payload
  FROM (
    SELECT
      ${sqlString(payloadMd5)} AS expected_md5,
      convert_from(decode(${sqlString(payloadHex)}, 'hex'), 'UTF8') AS payload_text
  ) decoded_payload
  WHERE md5(payload_text) = expected_md5;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Catalog payload checksum mismatch for import key %', ${sqlString(importKey)};
  END IF;

  SELECT COALESCE(jsonb_agg(source_url ORDER BY source_url), '[]'::jsonb)
  INTO v_source_urls
  FROM jsonb_to_recordset(v_payload) AS row(source_url TEXT);

  INSERT INTO public.catalog_import_runs (
    status,
    mode,
    source,
    source_quality,
    coverage_tier,
    target_url,
    extractor_version,
    import_key,
    dry_run,
    total_candidates,
    accepted_candidates,
    rejected_candidates,
    report
  )
  VALUES (
    'running',
    'import',
    ${sqlString(source)},
    ${sqlString(sourceQuality)},
    NULLIF(${sqlString(coverageTier)}, ''),
    NULLIF((SELECT min(source_url) FROM jsonb_to_recordset(v_payload) AS row(source_url TEXT)), ''),
    NULLIF(${sqlString(extractorVersion)}, ''),
    ${sqlString(importKey)},
    FALSE,
    ${totalRows},
    ${totalRows},
    0,
    jsonb_build_object(
      'import_reason', 'missing_source_url',
      'payload_md5', ${sqlString(payloadMd5)},
      'source_urls', v_source_urls
    )
  )
  RETURNING id INTO v_run_id;

  SELECT count(*)::INTEGER
  INTO v_imported_rows
  FROM public.upsert_catalog_product_feed(v_payload);

  INSERT INTO public.catalog_product_evidence (
    run_id,
    cache_key,
    gtin,
    product_name,
    brand,
    pet_type,
    source,
    source_quality,
    source_url,
    ingredient_source_url,
    image_source_url,
    ingredient_verification_status,
    image_verification_status,
    raw_source_hash,
    content_hash,
    extractor_version,
    review_state,
    evidence,
    updated_at
  )
  SELECT
    v_run_id,
    payload_rows.cache_key,
    payload_rows.gtin,
    payload_rows.product_name,
    payload_rows.brand,
    payload_rows.pet_type,
    payload_rows.source,
    payload_rows.source_quality,
    payload_rows.source_url,
    COALESCE(NULLIF(payload_rows.ingredient_source_url, ''), payload_rows.source_url),
    COALESCE(NULLIF(payload_rows.image_source_url, ''), payload_rows.source_url),
    payload_rows.ingredient_verification_status,
    payload_rows.image_verification_status,
    md5(concat_ws('|', payload_rows.source_url, payload_rows.ingredient_text, payload_rows.image_url)),
    COALESCE(NULLIF(payload_rows.content_hash, ''), md5(concat_ws('|', payload_rows.source_url, payload_rows.ingredient_text, payload_rows.image_url))),
    NULLIF(payload_rows.extractor_version, ''),
    'promoted',
    jsonb_build_object(
      'import_reason', 'missing_source_url',
      'product_line', payload_rows.product_line,
      'flavor', payload_rows.flavor,
      'life_stage', payload_rows.life_stage,
      'food_form', payload_rows.food_form,
      'package_size', payload_rows.package_size,
      'front_image_url', payload_rows.image_url,
      'ingredient_text', payload_rows.ingredient_text
    ),
    now()
  FROM jsonb_to_recordset(v_payload) AS payload_rows(
    cache_key TEXT,
    product_name TEXT,
    brand TEXT,
    gtin TEXT,
    product_line TEXT,
    flavor TEXT,
    life_stage TEXT,
    food_form TEXT,
    package_size TEXT,
    pet_type TEXT,
    ingredient_text TEXT,
    source TEXT,
    source_quality TEXT,
    ingredient_verification_status TEXT,
    image_verification_status TEXT,
    source_url TEXT,
    ingredient_source_url TEXT,
    image_source_url TEXT,
    image_url TEXT,
    extractor_version TEXT,
    content_hash TEXT
  )
  ON CONFLICT (cache_key, source, content_hash) WHERE content_hash IS NOT NULL
  DO UPDATE SET
    run_id = EXCLUDED.run_id,
    review_state = 'promoted',
    evidence = EXCLUDED.evidence,
    updated_at = now();

  GET DIAGNOSTICS v_evidence_rows = ROW_COUNT;

  SELECT count(*)::INTEGER
  INTO v_verified_ready_rows
  FROM public.product_data product
  JOIN jsonb_to_recordset(v_payload) AS payload_rows(source TEXT, source_url TEXT)
    ON product.source = payload_rows.source
   AND regexp_replace(COALESCE(product.source_url, ''), '/+$', '') = regexp_replace(COALESCE(payload_rows.source_url, ''), '/+$', '')
  WHERE COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
    AND COALESCE(NULLIF(trim(product.ingredient_text), ''), '') <> ''
    AND COALESCE(NULLIF(trim(product.image_url), ''), '') <> ''
    AND product.image_url NOT ILIKE 'data:%'
    AND product.verified_at IS NOT NULL
    AND product.ingredient_count >= 5
    AND product.is_complete_food = TRUE
    AND product.catalog_exclusion_reason IS NULL
    AND product.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
    AND product.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
    AND product.image_verification_status IN ('official', 'manufacturer', 'retailer_verified');

  UPDATE public.catalog_import_runs
  SET
    status = 'succeeded',
    finished_at = now(),
    updated_at = now(),
    imported_rows = v_imported_rows,
    verified_ready_rows = v_verified_ready_rows,
    report = report || jsonb_build_object(
      'upserted_rows', v_imported_rows,
      'evidence_rows', v_evidence_rows,
      'verified_ready_rows', v_verified_ready_rows
    )
  WHERE id = v_run_id;
END
$catalog_import$;

SELECT
  id,
  source,
  import_key,
  status,
  imported_rows,
  verified_ready_rows,
  report
FROM public.catalog_import_runs
WHERE import_key = ${sqlString(importKey)}
ORDER BY created_at DESC
LIMIT 1;
`.trim();
}

function writeSqlFiles(rows, { outputDir, source, groupSize, sourceQuality, coverageTier, extractorVersion }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const sourceSegment = safeFileSegment(source);
  const files = [];
  const generatedAt = new Date().toISOString();

  for (const file of fs.readdirSync(outputDir)) {
    if (file === "manifest.json" || /^audited-\d{4}-/.test(file)) {
      fs.unlinkSync(path.join(outputDir, file));
    }
  }

  for (let offset = 0; offset < rows.length; offset += groupSize) {
    const groupRows = rows.slice(offset, offset + groupSize);
    const index = String(files.length + 1).padStart(4, "0");
    const importKey = `${source}:missing-source-url:${generatedAt}:offset-${offset}`;
    const file = path.join(
      outputDir,
      `audited-${index}-${sourceSegment}-missing-offset-${offset}-rows-${groupRows.length}.sql`
    );
    fs.writeFileSync(file, `${payloadSql(groupRows, {
      source,
      sourceQuality,
      coverageTier,
      extractorVersion,
      importKey,
    })}\n`, "utf8");
    files.push({ file, offset, rows: groupRows.length, import_key: importKey });
  }

  const manifest = {
    generated_at: generatedAt,
    source,
    source_quality: sourceQuality,
    coverage_tier: coverageTier || null,
    extractor_version: extractorVersion || null,
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
  const groupSize = positiveInteger(getArg("--group-size"), DEFAULT_GROUP_SIZE);
  const limit = positiveInteger(getArg("--limit"), null);
  const coverageTier = compact(getArg("--coverage-tier"));
  const wantedUrls = new Set(getArgs("--url").map(canonicalUrl).filter(Boolean));

  if (!sqlDir || !source || !outputDir) {
    throw new Error("Usage: node scripts/catalog-export-missing-source-url-audited-sql.mjs --sql-dir <dir> --source <source> --emit-sql-dir <dir>");
  }

  const client = supabaseClient();
  if (!client) throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY for live comparison.");

  const { manifest, rows } = readRows(sqlDir);
  const liveUrls = await fetchLiveSourceUrls(client, source);
  const missing = filterMissingRows(rows, { liveUrls, wantedUrls, limit });
  const sourceQuality = compact(manifest.source_quality || missing[0]?.source_quality || rows[0]?.source_quality);
  const extractorVersion = compact(missing[0]?.extractor_version || rows[0]?.extractor_version);
  const written = writeSqlFiles(missing, {
    outputDir,
    source,
    groupSize,
    sourceQuality,
    coverageTier,
    extractorVersion,
  });

  console.log(JSON.stringify({
    source,
    sql_dir: sqlDir,
    live_source_urls: liveUrls.size,
    input_rows: rows.length,
    missing_source_urls: missing.length,
    emit_sql_dir: outputDir,
    group_size: groupSize,
    manifest: written.manifestFile,
    files: written.files,
    sample_missing: missing.slice(0, 20).map((row) => ({
      product_name: row.product_name,
      source_url: row.source_url,
      cache_key: row.cache_key,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
