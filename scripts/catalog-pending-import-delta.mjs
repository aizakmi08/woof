import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_IMPORT_ROOT = "outputs/catalog-source-imports";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-pending-import-delta/current";
const PAGE_SIZE = 1000;
const DEFAULT_CHUNK_SIZE = 25;
const DEFAULT_MCP_GROUP_SIZE = 5;
const VERIFIED_SOURCE_QUALITIES = new Set(["gdsn", "official", "manufacturer", "retailer_verified"]);
const VERIFIED_INGREDIENT_STATUSES = new Set(["gdsn", "official", "manufacturer", "retailer_verified", "label_ocr_verified"]);
const VERIFIED_IMAGE_STATUSES = new Set(["official", "manufacturer", "retailer_verified"]);

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

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizedIdentityText(...values) {
  return compact(values.filter(Boolean).join(" "))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readJsonIfExists(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function textValue(value) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function compactTextValue(value) {
  const text = textValue(value);
  return text ? text.replace(/\s+/g, " ") : undefined;
}

function compactIdentityTextValue(value) {
  const text = textValue(value);
  return text ? text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ") : undefined;
}

function cleanArray(value) {
  if (!Array.isArray(value)) return undefined;
  const values = value.map(textValue).filter(Boolean);
  return values.length ? values : undefined;
}

function cleanJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.keys(value).length ? value : undefined;
}

function cleanBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function sqlStringConcatLiteral(value, width = 1600) {
  const text = String(value || "");
  const parts = [];
  for (let index = 0; index < text.length; index += width) {
    parts.push(text.slice(index, index + width));
  }
  return parts.map((part) => `'${part}'`).join(" ||\n        ");
}

function sqlText(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function omitUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function writeCsv(rows, filePath, headers) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function readOnlyKey() {
  return serviceRoleKey() || process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
}

function supabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = readOnlyKey();
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchProductRowsFromSupabase() {
  const client = supabaseClient();
  if (!client) return { rows: [], source: "missing_supabase_env", live: false };
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("product_data")
      .select([
        "cache_key",
        "product_name",
        "brand",
        "gtin",
        "source",
        "source_url",
        "pet_type",
        "package_size",
        "image_url",
        "ingredient_text",
        "ingredient_count",
        "source_quality",
        "ingredient_verification_status",
        "image_verification_status",
        "verified_at",
        "expires_at",
        "is_complete_food",
        "catalog_exclusion_reason",
      ].join(","))
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { rows, source: "live_supabase_product_data", live: true };
}

function loadProductRows(options) {
  if (!options.catalogSnapshotPath) return null;
  const parsed = readJsonIfExists(options.catalogSnapshotPath, []);
  if (Array.isArray(parsed)) return { rows: parsed, source: options.catalogSnapshotPath, live: false };
  if (Array.isArray(parsed.rows)) return { rows: parsed.rows, source: options.catalogSnapshotPath, live: false };
  if (Array.isArray(parsed.products)) return { rows: parsed.products, source: options.catalogSnapshotPath, live: false };
  return { rows: [], source: options.catalogSnapshotPath, live: false };
}

function hasSourceEvidence(row = {}) {
  return Boolean(compact(row.source_url || row.product_url || row.url));
}

function hasIngredientText(row = {}) {
  return Boolean(compact(row.ingredient_text || row.ingredient_statement || row.ingredients_text));
}

function hasFrontImage(row = {}) {
  const imageUrl = compact(row.image_url || row.front_image_url || row.product_image_url);
  return Boolean(imageUrl) && !/^data:/i.test(imageUrl);
}

function hasUnbalancedParentheses(value) {
  let depth = 0;
  for (const char of String(value || "")) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return true;
  }
  return depth !== 0;
}

function hasUnbalancedSquareBrackets(value) {
  let depth = 0;
  for (const char of String(value || "")) {
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (depth < 0) return true;
  }
  return depth !== 0;
}

function hasLikelyIngredientOcrArtifacts(value) {
  const text = String(value || "");
  return (
    /\b[0-9][a-z]{1,20}\b/.test(text)
    || /\b[A-Za-z]{2,}[0-9][A-Za-z]+\b/.test(text)
    || /\(\s*\)/.test(text)
    || hasUnbalancedParentheses(text)
    || hasUnbalancedSquareBrackets(text)
    || /(^|[^A-Za-z])-\s*Ascorbyl-2-Polyphosphate\b/i.test(text)
    || /\bSupplement\.\s+preserved\s+with\b/i.test(text)
    || /\bI(Vitamin|min|max|preservative|Ferrous)\b/i.test(text)
    || /\b(pyr\s+idoxine|pantot\s+henate|ribo\s+flavin|thia\s+mine|bio\s+tin)\b/i.test(text)
    || /\b(Fructooli[0-9]osaccharides|Manganese[0-9]e|preserNative|subtillis|cooper\s+sulfate|sufate|sultate|ch[io]ride|calcium\s+lodate|lodate|pyridoxine\s+vitamin\s+b-?6|niain|nacin|nutri\*nt|r[0-9]cogniz[0-9]d|[0-9]ssential|potss+sium|vitss?min|d\.calcium)\b/i.test(text)
    || /\bMi\s+nerals\b/i.test(text)
  );
}

function hasCurlyIngredientGroup(value) {
  return /[{}]/.test(String(value || ""));
}

function hasOnlyAllowedCurlyIngredientGroups(value) {
  const text = String(value || "");
  if (!hasCurlyIngredientGroup(text)) return true;
  const openCount = (text.match(/\{/g) || []).length;
  const closeCount = (text.match(/\}/g) || []).length;
  if (openCount !== closeCount) return false;
  const withoutAllowedGroups = text.replace(/(^|,\s*)(Vitamins?|Minerals?)\s*\{[^{}]+\}/gi, "");
  return !hasCurlyIngredientGroup(withoutAllowedGroups);
}

function allowsCurlyIngredientGroups(row = {}) {
  return (
    compact(row.source_quality).toLowerCase() === "manufacturer"
    && compact(row.ingredient_verification_status).toLowerCase() === "manufacturer"
    && hasOnlyAllowedCurlyIngredientGroups(row.ingredient_text || row.ingredient_statement || row.ingredients_text)
  );
}

function hasCoreFoodSignal(value) {
  return (
    /(^| )(food|foods|dry|wet|kibble|pate|pat|mousse|entrees?|stews?|loaf|canned|cans?|formula|recipe|meal|dinner|raw|fresh|freezedried|freeze dried|airdried|air dried|dehydrated|pupp(y|ies)|kitten|kittens|adult|senior|complete|balanced)( |$)/.test(value)
    || /(^| )all life stages( |$)/.test(value)
  );
}

function countPackRejectionReason(row = {}) {
  const productName = normalizedIdentityText(row.product_name);
  const identityText = normalizedIdentityText(
    row.product_name,
    row.product_line,
    row.flavor,
    row.package_size,
  );
  const sourceIdentityText = normalizedIdentityText(identityText, row.source_url);
  const hasCount = /(^| )[0-9]+[ ]*(ct|count)( |$)/.test(productName);
  if (!hasCount) return "";

  const nonSingleFormulaRe = /(^| )(variety|varieties|variety packs?|bundles?|samplers?|samples?|sample packs?|starter packs?|starter kits?|multipacks?|multi packs?|(?:new )?(?:puppy|kitten) packs?|(?:puppy|kitten) essentials packs?|essentials packs?)( |$)/;
  if (nonSingleFormulaRe.test(productName) || nonSingleFormulaRe.test(sourceIdentityText)) {
    return "non_single_formula_pack";
  }

  const coreFoodSignal = hasCoreFoodSignal(productName) || hasCoreFoodSignal(identityText);
  const singleFormulaCountCase = (
    coreFoodSignal
    && /(^| )(care|nutrition|mousse|sauce|wet|dry|adult|kitten|puppy|senior|formula|recipe|diet|food|foods)( |$)/.test(identityText)
  );
  const hasRecipeSpecificTerm = /(^| )(chicken|beef|steak|turkey|salmon|lamb|duck|tuna|whitefish|venison|pork|rabbit|cod|trout|bison|filet|mignon|prime rib|bacon|cheese|rice|vegetable|veggie|noodle)( |$)/.test(productName);

  if (!hasRecipeSpecificTerm && !singleFormulaCountCase) return "ambiguous_count_pack";
  return "";
}

function importRejectionReason(row = {}) {
  const identityText = [
    row.product_name,
    row.product_line,
    row.flavor,
    row.package_size,
    row.source_url,
  ].map(compact).join(" ");
  if (/\b(sample|trial)\b/i.test(identityText)) return "sample_or_trial_product";
  if (/(^| )(variety|varieties|variety packs?|bundles?|samplers?|samples?|sample packs?|starter packs?|starter kits?|multipacks?|multi packs?|(?:new )?(?:puppy|kitten) packs?|(?:puppy|kitten) essentials packs?|essentials packs?)( |$)/i.test(identityText)) {
    return "non_single_formula_pack";
  }
  const countPackReason = countPackRejectionReason(row);
  if (countPackReason) return countPackReason;
  const ingredientText = row.ingredient_text || row.ingredient_statement || row.ingredients_text || "";
  if (hasCurlyIngredientGroup(ingredientText) && !allowsCurlyIngredientGroups(row)) return "ingredient_ocr_artifact";
  if (hasUnbalancedParentheses(ingredientText)) return "unbalanced_ingredient_parentheses";
  if (hasLikelyIngredientOcrArtifacts(ingredientText)) return "ingredient_ocr_artifact";
  return "";
}

function isCurrentCompleteDogCatFood(row = {}) {
  if (row.pet_type !== "dog" && row.pet_type !== "cat") return false;
  if (row.is_complete_food === false) return false;
  if (compact(row.catalog_exclusion_reason)) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return false;
  return true;
}

function isVerifiedReady(row = {}) {
  return (
    isCurrentCompleteDogCatFood(row)
    && numeric(row.ingredient_count) >= 5
    && hasIngredientText(row)
    && hasSourceEvidence(row)
    && hasFrontImage(row)
    && VERIFIED_SOURCE_QUALITIES.has(compact(row.source_quality || "manufacturer").toLowerCase())
    && VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status).toLowerCase())
    && VERIFIED_IMAGE_STATUSES.has(compact(row.image_verification_status).toLowerCase())
  );
}

function isVerifiedIdentityDuplicateGuardRow(row = {}) {
  return (
    isCurrentCompleteDogCatFood(row)
    && numeric(row.ingredient_count) >= 5
    && hasIngredientText(row)
    && hasSourceEvidence(row)
    && hasFrontImage(row)
    && VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status).toLowerCase())
    && VERIFIED_IMAGE_STATUSES.has(compact(row.image_verification_status).toLowerCase())
  );
}

function isTerminalExcludedLiveRow(row = {}) {
  return Boolean(compact(row.catalog_exclusion_reason));
}

function sourceGtinKey(source, gtin) {
  const normalizedSource = normalizeKey(source);
  const normalizedGtin = compact(gtin).replace(/\D+/g, "");
  return normalizedSource && normalizedGtin ? `${normalizedSource}:${normalizedGtin}` : "";
}

function sourceUrlKey(sourceUrl) {
  return compact(sourceUrl).toLowerCase().replace(/\/+$/g, "");
}

function lowerKey(value) {
  return compact(value).toLowerCase();
}

function catalogFeedIdentityKey(brand, productName) {
  const brandKey = lowerKey(String(brand || "").replace(/<[^>]+>/g, " ").replace(/[^a-z0-9]+/gi, " "));
  let nameKey = lowerKey(String(productName || "").replace(/<[^>]+>/g, " ").replace(/[^a-z0-9]+/gi, " "));
  if (brandKey && nameKey.startsWith(`${brandKey} `)) {
    nameKey = nameKey.slice(brandKey.length + 1).trim();
  }
  return nameKey.replace(/\s+/g, " ").trim();
}

function identityDuplicateMapKey(row = {}) {
  const source = normalizeKey(row.source);
  const brand = lowerKey(row.brand);
  const identity = catalogFeedIdentityKey(row.brand, row.product_name);
  return source && brand && identity ? `${source}|${brand}|${identity}` : "";
}

function compatibleGtins(left, right) {
  const leftGtin = compact(left).replace(/\D+/g, "");
  const rightGtin = compact(right).replace(/\D+/g, "");
  return !leftGtin || !rightGtin || leftGtin === rightGtin;
}

function compatibleText(left, right) {
  const leftKey = lowerKey(left);
  const rightKey = lowerKey(right);
  return !leftKey || !rightKey || leftKey === rightKey;
}

function liveVerifiedIdentityMaps(productRows) {
  const maps = {
    byCacheKey: new Map(),
    bySourceGtin: new Map(),
    bySourceUrl: new Map(),
    byDuplicateIdentity: new Map(),
    byTerminalExcludedDuplicateIdentity: new Map(),
    byDemotedContentCacheKey: new Map(),
    byDemotedContentSourceGtin: new Map(),
    byDemotedContentSourceUrl: new Map(),
  };
  for (const row of productRows) {
    const verifiedReady = isVerifiedReady(row);
    const terminalExcluded = isTerminalExcludedLiveRow(row);
    const represented = verifiedReady || terminalExcluded;
    const cacheKey = compact(row.cache_key);
    const gtinKey = sourceGtinKey(row.source, row.gtin);
    const urlKey = sourceUrlKey(row.source_url);
    const contentHash = contentFingerprint(row);
    if (cacheKey) maps.byCacheKey.set(cacheKey, maps.byCacheKey.get(cacheKey) || represented);
    if (gtinKey) maps.bySourceGtin.set(gtinKey, maps.bySourceGtin.get(gtinKey) || represented);
    if (urlKey) maps.bySourceUrl.set(urlKey, maps.bySourceUrl.get(urlKey) || represented);
    if (!represented && contentHash && isCurrentCompleteDogCatFood(row)) {
      const demotedContentKey = `${contentHash}`;
      if (cacheKey) maps.byDemotedContentCacheKey.set(`${cacheKey}|${demotedContentKey}`, true);
      if (gtinKey) maps.byDemotedContentSourceGtin.set(`${gtinKey}|${demotedContentKey}`, true);
      if (urlKey) maps.byDemotedContentSourceUrl.set(`${urlKey}|${demotedContentKey}`, true);
    }
    if (isVerifiedIdentityDuplicateGuardRow(row)) {
      const duplicateKey = identityDuplicateMapKey(row);
      if (duplicateKey) {
        maps.byDuplicateIdentity.set(duplicateKey, [
          ...(maps.byDuplicateIdentity.get(duplicateKey) || []),
          row,
        ]);
      }
    }
    if (terminalExcluded) {
      const duplicateKey = identityDuplicateMapKey(row);
      if (duplicateKey) {
        maps.byTerminalExcludedDuplicateIdentity.set(duplicateKey, [
          ...(maps.byTerminalExcludedDuplicateIdentity.get(duplicateKey) || []),
          row,
        ]);
      }
    }
  }
  return maps;
}

function isRepresentedByVerifiedLiveRow(row, maps) {
  const cacheKey = compact(row.cache_key);
  const gtinKey = sourceGtinKey(row.source, row.gtin);
  const urlKey = sourceUrlKey(row.source_url);
  const duplicateKey = identityDuplicateMapKey(row);
  const duplicateRows = duplicateKey ? maps.byDuplicateIdentity.get(duplicateKey) || [] : [];
  const terminalExcludedRows = duplicateKey ? maps.byTerminalExcludedDuplicateIdentity.get(duplicateKey) || [] : [];
  return (
    (cacheKey && maps.byCacheKey.get(cacheKey) === true)
    || (gtinKey && maps.bySourceGtin.get(gtinKey) === true)
    || (urlKey && maps.bySourceUrl.get(urlKey) === true)
    || duplicateRows.some((liveRow) => (
      compact(liveRow.cache_key) !== compact(row.cache_key)
      && compatibleGtins(liveRow.gtin, row.gtin)
      && compatibleText(liveRow.package_size, row.package_size)
      && compatibleText(liveRow.pet_type, row.pet_type)
    ))
    || terminalExcludedRows.some((liveRow) => (
      compact(liveRow.cache_key) !== compact(row.cache_key)
      && compatibleGtins(liveRow.gtin, row.gtin)
      && compatibleText(liveRow.package_size, row.package_size)
      && compatibleText(liveRow.pet_type, row.pet_type)
    ))
  );
}

function liveDemotionBlockReason(row, maps) {
  const contentHash = contentFingerprint(row);
  if (!contentHash) return "";
  const cacheKey = compact(row.cache_key);
  const gtinKey = sourceGtinKey(row.source, row.gtin);
  const urlKey = sourceUrlKey(row.source_url);
  if (
    (cacheKey && maps.byDemotedContentCacheKey.get(`${cacheKey}|${contentHash}`))
    || (gtinKey && maps.byDemotedContentSourceGtin.get(`${gtinKey}|${contentHash}`))
    || (urlKey && maps.byDemotedContentSourceUrl.get(`${urlKey}|${contentHash}`))
  ) {
    return "same_content_demoted_live_row";
  }
  return "";
}

function contentFingerprint(row = {}) {
  const sourceUrl = sourceUrlKey(row.source_url || row.product_url || row.url);
  const ingredientText = compact(row.ingredient_text || row.ingredient_statement || row.ingredients_text);
  const imageUrl = compact(row.image_url || row.front_image_url || row.product_image_url);
  if (!sourceUrl || !ingredientText || !imageUrl) return "";
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([sourceUrl, ingredientText, imageUrl]))
    .digest("hex");
}

function rowImportIdentity(row = {}) {
  return (
    compact(row.cache_key)
    || sourceGtinKey(row.source, row.gtin)
    || sourceUrlKey(row.source_url)
    || `${normalizeKey(row.source)}:${crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex")}`
  );
}

function guardRejectionKeys(row = {}) {
  return [
    compact(row.cache_key) ? `cache:${compact(row.cache_key)}` : "",
    sourceGtinKey(row.source, row.gtin) ? `gtin:${sourceGtinKey(row.source, row.gtin)}` : "",
    sourceUrlKey(row.source_url || row.product_url || row.url)
      ? `url:${sourceUrlKey(row.source_url || row.product_url || row.url)}`
      : "",
  ].filter(Boolean);
}

function decodeSqlPayloadRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const marker = "decode('";
  const start = text.indexOf(marker);
  if (start === -1) return [];
  const payloadStart = start + marker.length;
  const payloadEnd = text.indexOf("'", payloadStart);
  if (payloadEnd === -1) return [];
  const decoded = Buffer.from(text.slice(payloadStart, payloadEnd), "base64").toString("utf8");
  const rows = JSON.parse(decoded);
  return Array.isArray(rows) ? rows : [];
}

function sqlChunkFilesFromManifest(manifest = {}) {
  return (Array.isArray(manifest.chunks) ? manifest.chunks : [])
    .map((chunk) => compact(chunk.file))
    .filter(Boolean);
}

function manifestPayloadRows(manifest = {}) {
  const rows = [];
  for (const filePath of sqlChunkFilesFromManifest(manifest)) {
    rows.push(...decodeSqlPayloadRows(filePath));
  }
  return rows;
}

function findSourceManifests(importRoot, sourceFilter) {
  if (!fs.existsSync(importRoot)) return [];
  const requestedSource = normalizeKey(sourceFilter || "");
  const manifests = [];
  for (const entry of fs.readdirSync(importRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = normalizeKey(entry.name);
    if (requestedSource && source !== requestedSource) continue;
    for (const dirName of ["sql", "sql-mcp"]) {
      const manifestPath = path.join(importRoot, entry.name, dirName, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        manifests.push({ source, manifestPath, manifest: readJsonIfExists(manifestPath, {}) });
        break;
      }
    }
  }
  manifests.sort((left, right) => left.source.localeCompare(right.source));
  return manifests;
}

function findGuardRejectionFiles(importRoot, sourceFilter) {
  if (!fs.existsSync(importRoot)) return [];
  const requestedSource = normalizeKey(sourceFilter || "");
  const files = [];
  for (const entry of fs.readdirSync(importRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = normalizeKey(entry.name);
    if (requestedSource && source !== requestedSource) continue;
    const sourceDir = path.join(importRoot, entry.name);
    for (const child of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (child.isFile() && /^live-guard-rejections-.*\.json$/i.test(child.name)) {
        files.push({ source, filePath: path.join(sourceDir, child.name) });
      }
    }
  }
  files.sort((left, right) => left.filePath.localeCompare(right.filePath));
  return files;
}

function loadGuardRejections(importRoot, sourceFilter) {
  const byKey = new Map();
  for (const file of findGuardRejectionFiles(importRoot, sourceFilter)) {
    const payload = readJsonIfExists(file.filePath, {});
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const resolvedCacheKeys = new Set((Array.isArray(payload.resolved_cache_keys) ? payload.resolved_cache_keys : [])
      .map(compact)
      .filter(Boolean));
    for (const row of rows) {
      if (resolvedCacheKeys.has(compact(row.cache_key))) continue;
      const entry = {
        source: file.source,
        file_path: file.filePath,
        rejection_reason: compact(payload.rejection_reason) || "live_guard_rejected",
        row,
      };
      for (const key of guardRejectionKeys(row)) {
        if (!byKey.has(key)) byKey.set(key, entry);
      }
    }
  }
  return byKey;
}

function guardRejectionForRow(row, guardRejections) {
  for (const key of guardRejectionKeys(row)) {
    const rejection = guardRejections.get(key);
    if (rejection) return rejection;
  }
  return null;
}

function shouldCountGuardRejectionForSource(sourceManifest, row, guardRejection) {
  const manifestSource = normalizeKey(sourceManifest.source);
  const rowSource = normalizeKey(row.source);
  const rejectionSource = normalizeKey(guardRejection?.source);
  return (
    !rowSource
    || manifestSource === rowSource
    || (rejectionSource && manifestSource === rejectionSource)
  );
}

function sqlPayloadExpression(rows) {
  const payload = JSON.stringify(rows.map(compactImportPayloadRow));
  const payloadBase64 = Buffer.from(payload, "utf8").toString("base64");
  const checksum = crypto.createHash("md5").update(payload).digest("hex");
  return `(SELECT (
      CASE
        WHEN md5(payload_text) = '${checksum}' THEN payload_text
        ELSE (1 / (CASE WHEN payload_text IS NULL THEN 0 ELSE 0 END))::TEXT
      END
    )::jsonb
    FROM (SELECT convert_from(decode(${sqlStringConcatLiteral(payloadBase64)}, 'base64'), 'UTF8') AS payload_text) AS payload_guard)`;
}

function compactImportPayloadRow(row) {
  const imageUrl = textValue(row.image_url) || textValue(row.front_image_url);
  return omitUndefined({
    cache_key: compactTextValue(row.cache_key),
    product_name: compactIdentityTextValue(row.product_name),
    brand: compactIdentityTextValue(row.brand),
    gtin: compactTextValue(row.gtin),
    product_line: compactIdentityTextValue(row.product_line),
    flavor: compactIdentityTextValue(row.flavor),
    life_stage: compactIdentityTextValue(row.life_stage),
    food_form: compactIdentityTextValue(row.food_form),
    package_size: compactIdentityTextValue(row.package_size),
    pet_type: compactIdentityTextValue(row.pet_type),
    ingredients: cleanArray(row.ingredients),
    ingredient_text: textValue(row.ingredient_text),
    nutritional_info: cleanJson(row.nutritional_info),
    nutrient_panel: cleanJson(row.nutrient_panel),
    has_published_nutrients: cleanBoolean(row.has_published_nutrients),
    source: compactTextValue(row.source),
    source_quality: compactTextValue(row.source_quality),
    ingredient_verification_status: compactTextValue(row.ingredient_verification_status),
    image_verification_status: compactTextValue(row.image_verification_status),
    verified_at: compactTextValue(row.verified_at),
    source_url: textValue(row.source_url),
    scraped_at: compactTextValue(row.scraped_at),
    expires_at: compactTextValue(row.expires_at),
    image_url: imageUrl,
    is_complete_food: cleanBoolean(row.is_complete_food),
    catalog_exclusion_reason: compactTextValue(row.catalog_exclusion_reason),
    updated_at: compactTextValue(row.updated_at),
  });
}

function upsertSql(rows) {
  return `SELECT count(*) AS upserted_rows
FROM public.upsert_catalog_product_feed(${sqlPayloadExpression(rows)});`;
}

function upsertMcpGroupSql(rows) {
  const values = rows.map((row, index) => {
    const payload = JSON.stringify([compactImportPayloadRow(row)]);
    const payloadHex = Buffer.from(payload, "utf8").toString("hex");
    const checksum = crypto.createHash("md5").update(payload).digest("hex");
    return `    (${index + 1}, '${checksum}', '${payloadHex}')`;
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

function refreshSql() {
  return [
    "SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;",
    "SELECT public.reconcile_catalog_acquisition_queue_batch(10) AS reconcile_result;",
  ].join("\n");
}

function evidenceSql(rows) {
  if (rows.length === 0) return "";
  const sourceValues = Array.from(new Set(rows.map((row) => compact(row.source)).filter(Boolean))).sort();
  const qualityValues = Array.from(new Set(rows.map((row) => compact(row.source_quality)).filter(Boolean))).sort();
  const extractorValues = Array.from(new Set(rows.map((row) => compact(row.extractor_version)).filter(Boolean))).sort();
  const values = rows.map((row) => [
    sqlText(row.cache_key),
    sqlText(row.ingredient_source_url || row.source_url),
    sqlText(row.image_source_url || row.source_url),
    sqlText(row.raw_source_hash || ""),
    sqlText(row.content_hash || ""),
  ].join(", ")).map((value) => `    (${value})`).join(",\n");

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
    finished_at,
    updated_at
  )
  VALUES (
    'succeeded',
    'pending_delta_rpc_sql',
    ${sqlText(sourceValues.length === 1 ? sourceValues[0] : "mixed_pending_delta")},
    ${sqlText(qualityValues.length === 1 ? qualityValues[0] : "mixed")},
    ${sqlText(extractorValues[0] || "2026-06-25-verified-us-catalog-v1")},
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
      AND pd.image_verification_status IN ('official','manufacturer','retailer_verified')
      AND NOT public.catalog_has_ingredient_ocr_artifacts(pd.ingredient_text)),
    ${sqlJson({
      generated_by: "catalog-pending-import-delta",
      evidence_source: "product_data_after_pending_feed_upsert",
      row_count: rows.length,
    })},
    now(),
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
    ${sqlText(extractorValues[0] || "2026-06-25-verified-us-catalog-v1")},
    'promoted',
    jsonb_build_object(
      'ingredient_count', pd.ingredient_count,
      'has_image', COALESCE(NULLIF(btrim(pd.image_url), ''), '') <> '',
      'has_source_url', COALESCE(NULLIF(btrim(pd.source_url), ''), '') <> '',
      'verified_at', pd.verified_at,
      'artifact_guard_checked', NOT public.catalog_has_ingredient_ocr_artifacts(pd.ingredient_text)
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

async function executePendingImport(rows, { batchSize = DEFAULT_CHUNK_SIZE } = {}) {
  if (rows.length === 0) return { attempted_rows: 0, upserted_rows: 0, batches: 0 };
  const key = serviceRoleKey();
  if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY before running with --execute.");
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  if (!supabaseUrl) throw new Error("Set SUPABASE_URL before running with --execute.");
  const client = createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let upsertedRows = 0;
  let batches = 0;
  for (const chunk of chunksFor(rows, batchSize)) {
    const payload = chunk.rows.map(compactImportPayloadRow);
    const { data, error } = await client.rpc("upsert_catalog_product_feed", { payload });
    if (error) throw error;
    upsertedRows += Array.isArray(data) ? data.length : 0;
    batches += 1;
  }
  return { attempted_rows: rows.length, upserted_rows: upsertedRows, batches };
}

function chunksFor(rows, chunkSize) {
  const chunks = [];
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    chunks.push({ offset, rows: rows.slice(offset, offset + chunkSize) });
  }
  return chunks;
}

function writeMarkdown(summary, sourceSummaries, outputDir) {
  const lines = [
    "# Pending Verified Catalog Import Delta",
    "",
    `Generated at: ${summary.generated_at}`,
    `Product source: ${summary.product_source}`,
    "",
    "## Summary",
    "",
    `- Sources scanned: ${summary.sources_scanned}`,
    `- Sources with manifests: ${summary.sources_with_manifests}`,
    `- Sources with pending rows: ${summary.sources_with_pending_rows}`,
    `- Manifest rows scanned: ${summary.manifest_rows_scanned}`,
    `- Pending verified rows: ${summary.pending_rows}`,
    `- Import-rejected rows: ${summary.import_rejected_rows}`,
    `- SQL chunks: ${summary.sql_chunks}`,
    `- Apply audit/evidence SQL: ${summary.audit_evidence_file || "none"}`,
    `- Apply refresh SQL: ${summary.refresh_sql_file}`,
    "",
    "## Sources",
    "",
    "| Source | Manifest Rows | Pending Rows | Import Rejected Rows | SQL Chunks | Manifest |",
    "|---|---:|---:|---:|---:|---|",
    ...sourceSummaries
      .filter((source) => source.pending_rows > 0 || source.import_rejected_rows > 0)
      .map((source) => `| ${source.source} | ${source.manifest_rows} | ${source.pending_rows} | ${source.import_rejected_rows} | ${source.sql_chunks} | ${source.source_manifest_path} |`),
    "",
  ];
  fs.writeFileSync(path.join(outputDir, "report.md"), `${lines.join("\n")}\n`, "utf8");
}

function writeOutputs({ outputDir, sourceSummaries, pendingRows, rejectedRows, chunkSize, options, productSource }) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(path.join(outputDir, "sql"), { recursive: true, force: true });
  fs.rmSync(path.join(outputDir, "sql-mcp"), { recursive: true, force: true });
  fs.mkdirSync(path.join(outputDir, "sql"), { recursive: true });
  fs.mkdirSync(path.join(outputDir, "sql-mcp"), { recursive: true });

  const chunks = chunksFor(pendingRows, chunkSize);
  const chunkMetadata = [];
  for (const [index, chunk] of chunks.entries()) {
    const fileName = `${String(index + 1).padStart(4, "0")}-pending-verified-import-offset-${chunk.offset}-rows-${chunk.rows.length}.sql`;
    const filePath = path.join(outputDir, "sql", fileName);
    fs.writeFileSync(filePath, `${upsertSql(chunk.rows)}\n`, "utf8");
    chunkMetadata.push({
      file: filePath,
      offset: chunk.offset,
      rows: chunk.rows.length,
      sources: Array.from(new Set(chunk.rows.map((row) => compact(row.source)).filter(Boolean))).sort(),
    });
  }

  const mcpGroupSize = options.mcpGroupSize;
  const mcpGroupMetadata = [];
  if (mcpGroupSize > 0) {
    const mcpChunks = chunksFor(pendingRows, mcpGroupSize);
    for (const [index, chunk] of mcpChunks.entries()) {
      const fileName = `mcp-${String(index + 1).padStart(4, "0")}-pending-verified-import-offset-${chunk.offset}-rows-${chunk.rows.length}.sql`;
      const filePath = path.join(outputDir, "sql-mcp", fileName);
      fs.writeFileSync(filePath, `${upsertMcpGroupSql(chunk.rows)}\n`, "utf8");
      mcpGroupMetadata.push({
        file: filePath,
        offset: chunk.offset,
        rows: chunk.rows.length,
        sources: Array.from(new Set(chunk.rows.map((row) => compact(row.source)).filter(Boolean))).sort(),
      });
    }
  }

  const refreshFile = path.join(outputDir, "sql", "9999-refresh-catalog-acquisition-queue.sql");
  fs.writeFileSync(refreshFile, `${refreshSql()}\n`, "utf8");
  const evidenceFile = path.join(outputDir, "sql", "9998-pending-import-audit-and-evidence.sql");
  if (pendingRows.length > 0) {
    fs.writeFileSync(evidenceFile, evidenceSql(pendingRows), "utf8");
  }

  const summary = {
    generated_at: new Date().toISOString(),
    product_source: productSource.source,
    live_product_data: productSource.live,
    import_root: options.importRoot,
    output_dir: outputDir,
    source_filter: options.source || "",
    chunk_size: chunkSize,
    sources_scanned: sourceSummaries.length,
    sources_with_manifests: sourceSummaries.filter((source) => source.source_manifest_path).length,
    sources_with_pending_rows: sourceSummaries.filter((source) => source.pending_rows > 0).length,
    manifest_rows_scanned: sourceSummaries.reduce((sum, source) => sum + source.manifest_rows, 0),
    pending_rows: pendingRows.length,
    import_rejected_rows: rejectedRows.length,
    sql_chunks: chunkMetadata.length,
    mcp_group_size: mcpGroupSize,
    mcp_sql_chunks: mcpGroupMetadata.length,
    audit_evidence_file: pendingRows.length > 0 ? evidenceFile : null,
    refresh_sql_file: refreshFile,
    chunks: chunkMetadata,
    mcp_groups: mcpGroupMetadata,
    source_summaries: sourceSummaries,
  };

  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "pending-rows.json"), `${JSON.stringify(pendingRows, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "import-rejected-rows.json"), `${JSON.stringify(rejectedRows, null, 2)}\n`, "utf8");
  writeCsv(sourceSummaries, path.join(outputDir, "source-summary.csv"), [
    "source",
    "source_manifest_path",
    "manifest_rows",
    "pending_rows",
    "import_rejected_rows",
    "sql_chunks",
    "sample_pending_identity",
  ]);
  writeMarkdown(summary, sourceSummaries, outputDir);
  return summary;
}

async function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-pending-import-delta.mjs",
      "",
      "Builds minimal SQL chunks for source-manifest rows not represented by a verified live catalog row.",
      "",
      "Options:",
      "  --import-root <dir>         Default: outputs/catalog-source-imports",
      "  --output-dir <dir>          Default: outputs/catalog-pending-import-delta/current",
      "  --catalog-snapshot <path>   Use product_data-style rows instead of Supabase live rows",
      "  --source <source-slug>      Limit to one source directory",
      "  --chunk-size <n>            Default: 25",
      "  --mcp-group-size <n>        Default: 5; use 0 to skip sql-mcp output",
      "  --execute                   Upsert pending rows through Supabase RPC; requires service role key",
      "  --json",
    ].join("\n"));
    return;
  }

  const options = {
    importRoot: compact(getArg("--import-root", DEFAULT_IMPORT_ROOT)),
    outputDir: compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR)),
    catalogSnapshotPath: compact(getArg("--catalog-snapshot")),
    source: compact(getArg("--source")),
    chunkSize: positiveInteger(getArg("--chunk-size"), DEFAULT_CHUNK_SIZE),
    mcpGroupSize: nonNegativeInteger(getArg("--mcp-group-size"), DEFAULT_MCP_GROUP_SIZE),
  };

  const productSource = loadProductRows(options) || await fetchProductRowsFromSupabase();
  const liveMaps = liveVerifiedIdentityMaps(productSource.rows);
  const manifests = findSourceManifests(options.importRoot, options.source);
  const guardRejections = loadGuardRejections(options.importRoot, options.source);
  const pendingRowsByIdentity = new Map();
  const rejectedRowsByIdentity = new Map();
  const sourceSummaries = [];

  function addRejectedRow(row, rejection) {
    const identity = rowImportIdentity(row);
    if (!rejectedRowsByIdentity.has(identity)) {
      rejectedRowsByIdentity.set(identity, {
        ...row,
        ...rejection,
      });
    }
  }

  for (const sourceManifest of manifests) {
    const rows = manifestPayloadRows(sourceManifest.manifest);
    const sourcePendingRowsByIdentity = new Map();
    let sourceRejectedRows = 0;
    for (const row of rows) {
      if (isRepresentedByVerifiedLiveRow(row, liveMaps)) continue;
      const liveDemotionReason = liveDemotionBlockReason(row, liveMaps);
      if (liveDemotionReason) {
        sourceRejectedRows += 1;
        addRejectedRow(row, {
          import_rejection_reason: liveDemotionReason,
          source_manifest_path: sourceManifest.manifestPath,
        });
        continue;
      }
      const rejectionReason = importRejectionReason(row);
      if (rejectionReason) {
        sourceRejectedRows += 1;
        addRejectedRow(row, {
          import_rejection_reason: rejectionReason,
          source_manifest_path: sourceManifest.manifestPath,
        });
        continue;
      }
      const guardRejection = guardRejectionForRow(row, guardRejections);
      if (guardRejection) {
        if (shouldCountGuardRejectionForSource(sourceManifest, row, guardRejection)) {
          sourceRejectedRows += 1;
        }
        addRejectedRow(row, {
          import_rejection_reason: "live_guard_rejected",
          live_guard_rejection_reason: guardRejection.rejection_reason,
          live_guard_rejection_file: guardRejection.file_path,
          source_manifest_path: sourceManifest.manifestPath,
        });
        continue;
      }
      const identity = rowImportIdentity(row);
      if (!sourcePendingRowsByIdentity.has(identity)) sourcePendingRowsByIdentity.set(identity, row);
      if (!pendingRowsByIdentity.has(identity)) pendingRowsByIdentity.set(identity, row);
    }
    const sourcePendingRows = Array.from(sourcePendingRowsByIdentity.values());
    sourceSummaries.push({
      source: sourceManifest.source,
      source_manifest_path: sourceManifest.manifestPath,
      manifest_rows: rows.length,
      pending_rows: sourcePendingRows.length,
      import_rejected_rows: sourceRejectedRows,
      sql_chunks: Math.ceil(sourcePendingRows.length / options.chunkSize),
      sample_pending_identity: sourcePendingRows
        .slice(0, 8)
        .map((row) => compact(row.cache_key || row.gtin || row.source_url))
        .join("; "),
    });
  }

  sourceSummaries.sort((left, right) => right.pending_rows - left.pending_rows || left.source.localeCompare(right.source));
  const pendingRows = Array.from(pendingRowsByIdentity.values()).sort((left, right) => (
    compact(left.source).localeCompare(compact(right.source))
    || rowImportIdentity(left).localeCompare(rowImportIdentity(right))
  ));
  const rejectedRows = Array.from(rejectedRowsByIdentity.values()).sort((left, right) => (
    compact(left.source).localeCompare(compact(right.source))
    || rowImportIdentity(left).localeCompare(rowImportIdentity(right))
  ));
  const summary = writeOutputs({
    outputDir: options.outputDir,
    sourceSummaries,
    pendingRows,
    rejectedRows,
    chunkSize: options.chunkSize,
    options,
    productSource,
  });
  if (hasArg("--execute")) {
    const execution = await executePendingImport(pendingRows, { batchSize: options.chunkSize });
    summary.execution = execution;
    fs.writeFileSync(path.join(options.outputDir, "manifest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }

  if (hasArg("--json")) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("Pending verified catalog import delta");
    console.log(`Pending rows: ${summary.pending_rows}`);
    console.log(`Import-rejected rows: ${summary.import_rejected_rows}`);
    console.log(`Sources with pending rows: ${summary.sources_with_pending_rows}`);
    console.log(`SQL chunks: ${summary.sql_chunks}`);
    console.log(`MCP SQL chunks: ${summary.mcp_sql_chunks}`);
    console.log(`Manifest: ${path.join(options.outputDir, "manifest.json")}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
