import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_CHUNK_SIZE = 8;
const PAGE_SIZE = 1000;
const VERIFIED_SOURCE_QUALITIES = new Set(["gdsn", "official", "manufacturer", "retailer_verified"]);
const VERIFIED_INGREDIENT_STATUSES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
]);
const VERIFIED_IMAGE_STATUSES = new Set(["official", "manufacturer", "retailer_verified"]);

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalUrl(value) {
  return compact(value).replace(/\/+$/g, "");
}

function normalizedText(value) {
  return compact(String(value || "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " "));
}

function identityKey(brand, productName) {
  const brandKey = normalizedText(brand);
  let nameKey = normalizedText(productName);
  if (brandKey && nameKey.startsWith(`${brandKey} `)) {
    nameKey = compact(nameKey.slice(brandKey.length + 1));
  }
  return compact(nameKey) || "";
}

function normalizedPackageSize(value) {
  return normalizedText(value);
}

function normalizedGtin(value) {
  return compact(value).replace(/\D+/g, "");
}

function liveIdentityKeysFor(row) {
  const brand = normalizedText(row.brand);
  const identity = identityKey(row.brand, row.product_name);
  if (!brand || !identity) return [];

  const petType = normalizedText(row.pet_type);
  const gtin = normalizedGtin(row.gtin);
  const packageSize = normalizedPackageSize(row.package_size);
  const keys = new Set([
    `${brand}|${identity}|${petType}|${gtin}|${packageSize}`,
    `${brand}|${identity}|${petType}|${gtin}|`,
    `${brand}|${identity}|${petType}||${packageSize}`,
    `${brand}|${identity}|${petType}||`,
  ]);
  if (!petType) {
    keys.add(`${brand}|${identity}|||`);
  }
  return [...keys];
}

function candidateIdentityKeysFor(row) {
  const brand = normalizedText(row.brand);
  const identity = identityKey(row.brand, row.product_name);
  if (!brand || !identity) return [];

  const petType = normalizedText(row.pet_type);
  const gtin = normalizedGtin(row.gtin);
  const packageSize = normalizedPackageSize(row.package_size);
  const keys = new Set([
    `${brand}|${identity}|${petType}|${gtin}|${packageSize}`,
  ]);
  if (gtin) keys.add(`${brand}|${identity}|${petType}|${gtin}|`);
  if (packageSize) keys.add(`${brand}|${identity}|${petType}||${packageSize}`);
  keys.add(`${brand}|${identity}|${petType}||`);
  if (!petType) {
    keys.add(`${brand}|${identity}|||`);
  }
  return [...keys];
}

function hasStrictIdentityMatch(row, live) {
  const keys = candidateIdentityKeysFor(row);
  if (keys.length === 0) return false;
  return keys.some((key) => live.strictIdentityKeys.has(key));
}

function sqlText(value) {
  return `$woof_catalog_text$${String(value ?? "").replace(/\$woof_catalog_text\$/g, "")}$woof_catalog_text$`;
}

function sqlJson(value) {
  return `$woof_catalog_json$${JSON.stringify(value ?? {})}$woof_catalog_json$::jsonb`;
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
  const manifestDir = path.dirname(manifestPath);
  const rows = [];

  for (const chunk of manifest.chunks || []) {
    const chunkFile = compact(chunk.file);
    const chunkPath = path.isAbsolute(chunkFile)
      ? chunkFile
      : fs.existsSync(chunkFile)
        ? chunkFile
        : path.resolve(manifestDir, chunkFile);
    rows.push(...parsePayloadRows(fs.readFileSync(chunkPath, "utf8")));
  }

  return { manifest, rows };
}

function supabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for live missing-row comparison.");
  }

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isStrictReady(row) {
  const sourceUrl = canonicalUrl(row.source_url);
  const imageUrl = compact(row.image_url);
  const ingredientText = compact(row.ingredient_text);

  return Boolean(
    sourceUrl
      && ingredientText
      && imageUrl
      && !/^data:/i.test(imageUrl)
      && row.verified_at
      && Number(row.ingredient_count || 0) >= 5
      && row.is_complete_food === true
      && !row.catalog_exclusion_reason
      && VERIFIED_SOURCE_QUALITIES.has(compact(row.source_quality).toLowerCase())
      && VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status).toLowerCase())
      && VERIFIED_IMAGE_STATUSES.has(compact(row.image_verification_status).toLowerCase())
  );
}

function hasUnbalancedParentheses(value) {
  let depth = 0;
  for (const char of String(value || "")) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) return true;
    }
  }
  return depth !== 0;
}

function hasIngredientOcrArtifacts(value) {
  const text = String(value || "");
  return (
    /[{}]/.test(text)
    || /\b[0-9][a-z]{1,20}\b/i.test(text)
    || /\b[A-Za-z]{2,}[0-9][A-Za-z]+\b/i.test(text)
    || /\(\s*\)/.test(text)
    || hasUnbalancedParentheses(text)
    || /(^|[^A-Za-z])-\s*Ascorbyl-2-Polyphosphate\b/i.test(text)
    || /\bSupplement\.\s+preserved\s+with\b/i.test(text)
    || /\bI(Vitamin|min|max|preservative|Ferrous)\b/i.test(text)
    || /\b(Fructooli[0-9]osaccharides|Manganese[0-9]e|preserNative|subtillis|cooper\s+sulfate|sufate|sultate|ch[io]ride|calcium\s+lodate|lodate|pyridoxine\s+vitamin\s+b-?6|niain|nacin|nutri\*nt|r[0-9]cogniz[0-9]d|[0-9]ssential|potss+sium|vitss?min|d\.calcium)\b/i.test(text)
    || /\bMi\s+nerals\b/i.test(text)
  );
}

function validationRejectionReasons(row) {
  const reasons = [];
  const sourceUrl = canonicalUrl(row.source_url);
  const ingredientText = compact(row.ingredient_text);
  const imageUrl = compact(row.image_url);
  const ingredientCount = Number(row.ingredient_count || 0) || ingredientText.split(/\s*,\s*/).filter(Boolean).length;
  const sourceQuality = compact(row.source_quality).toLowerCase();
  const ingredientStatus = compact(row.ingredient_verification_status).toLowerCase();
  const imageStatus = compact(row.image_verification_status).toLowerCase();

  if (!sourceUrl) reasons.push("missing_source_url");
  if (!ingredientText) reasons.push("missing_ingredient_text");
  if (!imageUrl) reasons.push("missing_image_url");
  if (/^data:/i.test(imageUrl)) reasons.push("inline_image_url");
  if (ingredientCount < 5) reasons.push("ingredient_count_below_5");
  if (row.is_complete_food !== true) reasons.push("not_complete_food");
  if (compact(row.catalog_exclusion_reason)) reasons.push("catalog_exclusion_reason_present");
  if (!VERIFIED_SOURCE_QUALITIES.has(sourceQuality)) reasons.push("unverified_source_quality");
  if (!VERIFIED_INGREDIENT_STATUSES.has(ingredientStatus)) reasons.push("unverified_ingredient_status");
  if (!VERIFIED_IMAGE_STATUSES.has(imageStatus)) reasons.push("unverified_image_status");
  if (hasUnbalancedParentheses(ingredientText)) reasons.push("unbalanced_ingredient_parentheses");
  if (hasIngredientOcrArtifacts(ingredientText)) reasons.push("ingredient_ocr_artifact");

  return reasons;
}

function ingredientDiagnostic(row) {
  const ingredientText = compact(row.ingredient_text);
  return {
    gtin: compact(row.gtin),
    pet_type: compact(row.pet_type),
    package_size: compact(row.package_size),
    ingredient_count: Number(row.ingredient_count || 0) || ingredientText.split(/\s*,\s*/).filter(Boolean).length,
    ingredient_text_length: ingredientText.length,
    ingredient_text_tail: ingredientText.slice(-180),
    image_url: compact(row.image_url || row.front_image_url || row.product_image_url),
  };
}

function strictImportCandidateReport(rows) {
  const accepted = [];
  const rejected = [];

  for (const row of rows) {
    const reasons = validationRejectionReasons(row);
    if (reasons.length === 0) {
      accepted.push(row);
      continue;
    }
    rejected.push({
      cache_key: row.cache_key || "",
      product_name: row.product_name || "",
      brand: row.brand || "",
      source: row.source || "",
      source_quality: row.source_quality || "",
      source_url: row.source_url || "",
      ingredient_verification_status: row.ingredient_verification_status || "",
      image_verification_status: row.image_verification_status || "",
      ...ingredientDiagnostic(row),
      reasons,
    });
  }

  return { accepted, rejected };
}

async function fetchLiveSourceRows(client, source) {
  const allUrls = new Set();
  const strictUrls = new Set();
  const strictIdentityKeys = new Set();
  let totalRows = 0;
  let strictRows = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await client
      .from("product_data")
      .select([
        "id",
        "source_url",
        "brand",
        "product_name",
        "pet_type",
        "gtin",
        "package_size",
        "source_quality",
        "ingredient_verification_status",
        "image_verification_status",
        "verified_at",
        "ingredient_count",
        "ingredient_text",
        "image_url",
        "is_complete_food",
        "catalog_exclusion_reason",
      ].join(","))
      .eq("source", source)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    for (const row of data || []) {
      totalRows += 1;
      const url = canonicalUrl(row.source_url);
      if (url) allUrls.add(url);
      if (isStrictReady(row)) {
        strictRows += 1;
        strictUrls.add(url);
        for (const key of liveIdentityKeysFor(row)) {
          strictIdentityKeys.add(key);
        }
      }
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  return { allUrls, strictUrls, strictIdentityKeys, totalRows, strictRows };
}

function uniqueRowsBySourceUrl(rows) {
  const seen = new Set();
  const output = [];
  for (const row of rows) {
    const url = canonicalUrl(row.source_url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push(row);
  }
  return output;
}

function importSqlForRows(rows) {
  const payload = JSON.stringify(rows);
  const digest = crypto.createHash("md5").update(payload).digest("hex");
  const encoded = Buffer.from(payload, "utf8").toString("base64");
  return `SELECT count(*) AS upserted_rows
FROM public.upsert_catalog_product_feed((SELECT (
  CASE
    WHEN md5(payload_text) = '${digest}' THEN payload_text
    ELSE (1 / (CASE WHEN payload_text IS NULL THEN 0 ELSE 0 END))::TEXT
  END
)::jsonb
FROM (SELECT convert_from(decode('${encoded}', 'base64'), 'UTF8') AS payload_text) AS payload_guard));
`;
}

function evidenceSqlForRows(rows, manifest) {
  const values = rows.map((row) => [
    sqlText(row.cache_key),
    sqlText(row.ingredient_source_url || row.source_url),
    sqlText(row.image_source_url || row.source_url),
    sqlText(row.raw_source_hash || ""),
    sqlText(row.content_hash || ""),
  ].join(", ")).map((value) => `    (${value})`).join(",\n");

  const source = compact(manifest.source || rows[0]?.source);
  const sourceQuality = compact(manifest.source_quality || rows[0]?.source_quality);
  const extractorVersion = compact(rows[0]?.extractor_version || "2026-06-25-verified-us-catalog-v1");

  return `WITH requested_cache_keys(
  cache_key,
  ingredient_source_url,
  image_source_url,
  raw_source_hash,
  content_hash
) AS (
  VALUES
${values}
),
selected_products AS (
  SELECT
    pd.*,
    requested_cache_keys.ingredient_source_url AS audit_ingredient_source_url,
    requested_cache_keys.image_source_url AS audit_image_source_url,
    requested_cache_keys.raw_source_hash AS audit_raw_source_hash,
    requested_cache_keys.content_hash AS audit_content_hash
  FROM public.product_data pd
  JOIN requested_cache_keys ON requested_cache_keys.cache_key = pd.cache_key
),
import_run AS (
  INSERT INTO public.catalog_import_runs (
    status,
    mode,
    source,
    source_quality,
    extractor_version,
    total_candidates,
    accepted_candidates,
    rejected_candidates,
    imported_rows,
    verified_ready_rows,
    report,
    finished_at
  )
  VALUES (
    'succeeded',
    'rpc_sql_missing_only',
    ${sqlText(source)},
    ${sqlText(sourceQuality)},
    ${sqlText(extractorVersion)},
    ${rows.length},
    ${rows.length},
    0,
    (SELECT count(*) FROM selected_products),
    (SELECT count(*) FROM selected_products pd WHERE pd.pet_type IN ('dog', 'cat')
      AND COALESCE(NULLIF(btrim(pd.source_url), ''), '') <> ''
      AND COALESCE(NULLIF(btrim(pd.ingredient_text), ''), '') <> ''
      AND COALESCE(NULLIF(btrim(pd.image_url), ''), '') <> ''
      AND pd.image_url NOT ILIKE 'data:%'
      AND pd.verified_at IS NOT NULL
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND pd.source_quality IN ('gdsn','official','manufacturer','retailer_verified')
      AND pd.ingredient_verification_status IN ('gdsn','official','manufacturer','retailer_verified','label_ocr_verified')
      AND pd.image_verification_status IN ('official','manufacturer','retailer_verified')),
    ${sqlJson({
      generated_by: "catalog-generated-sql-missing-import",
      evidence_source: "product_data_after_missing_feed_upsert",
      row_count: rows.length,
    })},
    now()
  )
  RETURNING id
),
inserted_evidence AS (
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
    evidence
  )
  SELECT
    (SELECT id FROM import_run),
    pd.cache_key,
    pd.gtin,
    pd.product_name,
    pd.brand,
    pd.pet_type,
    pd.source,
    pd.source_quality,
    pd.source_url,
    COALESCE(NULLIF(btrim(pd.audit_ingredient_source_url), ''), pd.source_url),
    COALESCE(NULLIF(btrim(pd.audit_image_source_url), ''), pd.source_url),
    pd.ingredient_verification_status,
    pd.image_verification_status,
    NULLIF(btrim(pd.audit_raw_source_hash), ''),
    COALESCE(NULLIF(btrim(pd.audit_content_hash), ''), md5(concat_ws('|', pd.cache_key, pd.source, pd.source_url, pd.ingredient_text, pd.image_url))),
    ${sqlText(extractorVersion)},
    'promoted',
    jsonb_build_object(
      'ingredient_count', pd.ingredient_count,
      'has_image', COALESCE(NULLIF(btrim(pd.image_url), ''), '') <> '',
      'has_source_url', COALESCE(NULLIF(btrim(pd.source_url), ''), '') <> '',
      'verified_at', pd.verified_at
    )
  FROM selected_products pd
  ON CONFLICT DO NOTHING
  RETURNING 1
)
SELECT
  (SELECT id FROM import_run) AS run_id,
  (SELECT count(*) FROM selected_products) AS selected_products,
  (SELECT count(*) FROM inserted_evidence) AS inserted_evidence_rows;
`;
}

function writeChunks(rows, manifest, outputDir, chunkSize, rejectedRows = []) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const chunks = [];
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunkRows = rows.slice(offset, offset + chunkSize);
    const index = chunks.length + 1;
    const file = path.join(outputDir, `${String(index).padStart(4, "0")}-missing-rpc-offset-${offset}-rows-${chunkRows.length}.sql`);
    fs.writeFileSync(file, importSqlForRows(chunkRows), "utf8");
    chunks.push({ file, offset, rows: chunkRows.length });
  }

  const evidenceFile = path.join(outputDir, "9998-missing-import-audit-and-evidence.sql");
  if (rows.length > 0) {
    fs.writeFileSync(evidenceFile, evidenceSqlForRows(rows, manifest), "utf8");
  }

  const outputManifest = {
    generated_at: new Date().toISOString(),
    source: manifest.source || rows[0]?.source || rejectedRows[0]?.source || null,
    source_quality: manifest.source_quality || rows[0]?.source_quality || null,
    total_missing_rows: rows.length,
    accepted_missing_candidates: rows.map((row) => ({
      cache_key: compact(row.cache_key),
      product_name: compact(row.product_name),
      brand: compact(row.brand),
      source: compact(row.source || manifest.source),
      source_quality: compact(row.source_quality || manifest.source_quality),
      source_url: canonicalUrl(row.source_url),
      ingredient_verification_status: compact(row.ingredient_verification_status),
      image_verification_status: compact(row.image_verification_status),
    })),
    rejected_missing_rows: rejectedRows.length,
    validation_rejections: rejectedRows,
    chunk_size: chunkSize,
    chunks,
    audit_evidence_file: rows.length > 0 ? evidenceFile : null,
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(outputManifest, null, 2)}\n`, "utf8");
  return outputManifest;
}

async function main() {
  const manifestPath = compact(getArg("--manifest"));
  const source = compact(getArg("--source"));
  const outputDir = compact(getArg("--output-dir", "outputs/catalog-source-imports/missing-import"));
  const chunkSize = positiveInteger(getArg("--chunk-size"), DEFAULT_CHUNK_SIZE);

  if (!manifestPath || !source) {
    throw new Error("Usage: node scripts/catalog-generated-sql-missing-import.mjs --manifest path/to/manifest.json --source source-slug [--output-dir out] [--chunk-size 8]");
  }

  const { manifest, rows } = readManifestRows(manifestPath);
  const localRows = uniqueRowsBySourceUrl(rows.filter((row) => compact(row.source) === source));
  const live = await fetchLiveSourceRows(supabaseClient(), source);
  const urlMissingRows = localRows.filter((row) => !live.strictUrls.has(canonicalUrl(row.source_url)));
  const missingRows = urlMissingRows.filter((row) => !hasStrictIdentityMatch(row, live));
  const strictReport = strictImportCandidateReport(missingRows);
  const outputManifest = writeChunks(strictReport.accepted, manifest, outputDir, chunkSize, strictReport.rejected);

  console.log(JSON.stringify({
    source,
    local_unique_source_urls: localRows.length,
    live_rows: live.totalRows,
    live_strict_rows: live.strictRows,
    url_missing_rows: urlMissingRows.length,
    identity_already_live_rows: urlMissingRows.length - missingRows.length,
    missing_candidate_rows: missingRows.length,
    rejected_missing_rows: strictReport.rejected.length,
    missing_rows: strictReport.accepted.length,
    output_manifest: path.join(outputDir, "manifest.json"),
    chunks: outputManifest.chunks.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
