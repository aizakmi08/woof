#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  inferPetTypes,
  inferPrimaryPetType,
  analysisCacheBaseKeys,
  analysisCacheKeyForPetType,
} = require("./catalog-pet-type");
const {
  CURRENT_ANALYSIS_SCHEMA_VERSION,
  schemaValidAnalysis,
} = require("./analysis-cache-schema");

const DEFAULT_LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DEFAULT_MIN_ROWS = 12_000;
const DEFAULT_MIN_READY_ROWS = 10_000;
const DEFAULT_MAX_EXPIRED_PERCENT = 5;
const DEFAULT_MAX_DUPLICATE_NAME_PERCENT = 20;
const DEFAULT_MAX_DIRTY_DISPLAY_ROWS = 0;
const DEFAULT_MAX_NON_PRODUCT_ROWS = 0;
const DEFAULT_MIN_ANALYSIS_CACHE_ROWS = 8_000;
const DEFAULT_MIN_PUBLISHED_NUTRIENT_ROWS = 500;
const REST_PAGE_SIZE = 1000;
const NUTRIENT_TARGET_PRIORITY_DESCRIPTION = "market_brand,source_trust,source_url,image,ingredient_count,pet_type_specificity,name";
const DEFAULT_NUTRIENT_RESEARCH_BATCH_SIZE = 25;
const DEFAULT_NUTRIENT_RESEARCH_BATCH_COUNT = 100;
const SOURCE_NUTRIENT_TARGET_PRIORITY = new Map([
  ["brand", 0],
  ["manufacturer", 0],
  ["manual", 1],
  ["web_verified", 1],
  ["store_brand", 2],
  ["amazon", 3],
  ["dfa", 4],
  ["opff", 5],
  ["openfoodfacts", 5],
  ["user_ocr", 6],
]);
const MARKET_BRAND_NUTRIENT_PRIORITY = new Map([
  ["purina pro plan", 0],
  ["hill's science diet", 0],
  ["hills science diet", 0],
  ["royal canin", 0],
  ["blue buffalo", 0],
  ["purina one", 1],
  ["fancy feast", 1],
  ["friskies", 1],
  ["iams", 1],
  ["pedigree", 1],
  ["cesar", 2],
  ["sheba", 2],
  ["meow mix", 2],
  ["whiskas", 2],
  ["temptations", 2],
  ["greenies", 2],
  ["nutro", 2],
  ["rachael ray nutrish", 2],
  ["wellness", 2],
  ["merrick", 2],
  ["taste of the wild", 3],
  ["natural balance", 3],
  ["diamond naturals", 3],
  ["freshpet", 3],
  ["acana", 3],
  ["orijen", 3],
  ["instinct", 3],
  ["tiki cat", 3],
  ["weruva", 3],
  ["nulo", 3],
  ["canidae", 3],
  ["stella & chewy", 3],
  ["open farm", 3],
  ["fromm", 3],
  ["victor", 3],
  ["solid gold", 3],
]);

const warnOnly = process.argv.includes("--warn-only");
const jsonOnly = process.argv.includes("--json");
const exportNutrientTargetsArg = process.argv.find((arg) => arg.startsWith("--export-nutrient-targets="));
const exportNutrientTargetsPath = exportNutrientTargetsArg
  ? path.resolve(process.cwd(), exportNutrientTargetsArg.split("=")[1])
  : null;
const exportNutrientResearchBatchesArg = process.argv.find((arg) => arg.startsWith("--export-nutrient-research-batches="));
const exportNutrientResearchBatchesPath = exportNutrientResearchBatchesArg
  ? path.resolve(process.cwd(), exportNutrientResearchBatchesArg.split("=")[1])
  : null;
let lastFetchedRows = null;

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

const dbUrl =
  process.env.PRODUCT_CATALOG_DB_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  null;
const restUrl = process.env.SUPABASE_URL || null;
const restKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  null;
const restServiceKey =
  process.env.PRODUCT_CATALOG_SERVICE_KEY ||
  process.env.ANALYSIS_CACHE_AUDIT_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  null;

const thresholds = {
  minRows: numberFromEnv("PRODUCT_CATALOG_MIN_ROWS", DEFAULT_MIN_ROWS),
  minReadyRows: numberFromEnv("PRODUCT_CATALOG_MIN_READY_ROWS", DEFAULT_MIN_READY_ROWS),
  maxExpiredPercent: numberFromEnv("PRODUCT_CATALOG_MAX_EXPIRED_PERCENT", DEFAULT_MAX_EXPIRED_PERCENT),
  maxDuplicateNamePercent: numberFromEnv("PRODUCT_CATALOG_MAX_DUPLICATE_NAME_PERCENT", DEFAULT_MAX_DUPLICATE_NAME_PERCENT),
  maxDirtyDisplayRows: numberFromEnv("PRODUCT_CATALOG_MAX_DIRTY_DISPLAY_ROWS", DEFAULT_MAX_DIRTY_DISPLAY_ROWS),
  maxNonProductRows: numberFromEnv("PRODUCT_CATALOG_MAX_NON_PRODUCT_ROWS", DEFAULT_MAX_NON_PRODUCT_ROWS),
  minAnalysisCacheRows: numberFromEnv("PRODUCT_CATALOG_MIN_ANALYSIS_CACHE_ROWS", DEFAULT_MIN_ANALYSIS_CACHE_ROWS),
  minPublishedNutrientRows: numberFromEnv("PRODUCT_CATALOG_MIN_NUTRIENT_ROWS", DEFAULT_MIN_PUBLISHED_NUTRIENT_ROWS),
};

function sqlJson(query) {
  const output = execFileSync("psql", [
    dbUrl || DEFAULT_LOCAL_DB_URL,
    "-X",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  if (!output) return null;
  return JSON.parse(output);
}

function percent(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function contentRangeCount(header) {
  if (!header) return 0;
  const total = header.split("/")[1];
  const value = Number(total);
  return Number.isFinite(value) ? value : 0;
}

function summarizeRows(rows) {
  const now = Date.now();
  const dirtyDisplayPattern = /&(?:amp|quot|apos|reg|trade|ndash|mdash);|&#x?[0-9a-f]+;|<[^>]+>|^\s*(?:brand|product)\s*:|^\s*\|+|\|+\s*$|\(\s*$|\s*[,;:]\s*$/i;
  const sourceMap = new Map();
  const duplicateMap = new Map();
  let analysisReadyRows = 0;
  let shortIngredientRows = 0;
  let expiredRows = 0;
  let publishedNutrientRows = 0;
  let imageRows = 0;
  let dirtyDisplayRows = 0;
  let nonProductRows = 0;
  const nonProductExamples = [];
  const cacheKeys = new Set();

  for (const row of rows) {
    const ingredientCount = Number(row.ingredient_count || 0);
    const isExpired = row.expires_at ? Date.parse(row.expires_at) <= now : true;
    const source = row.source || "(null)";
    const sourceEntry = sourceMap.get(source) || {
      source,
      rows: 0,
      analysis_ready_rows: 0,
      published_nutrient_rows: 0,
      total_ingredients: 0,
    };
    sourceEntry.rows += 1;
    sourceEntry.total_ingredients += ingredientCount;
    if (ingredientCount >= 5 && !isExpired) {
      analysisReadyRows += 1;
      sourceEntry.analysis_ready_rows += 1;
    }
    if (ingredientCount < 5) shortIngredientRows += 1;
    if (isExpired) expiredRows += 1;
    if (row.has_published_nutrients === true) {
      publishedNutrientRows += 1;
      sourceEntry.published_nutrient_rows += 1;
    }
    if (typeof row.image_url === "string" && row.image_url.trim()) imageRows += 1;
    if (dirtyDisplayPattern.test(`${row.product_name || ""} ${row.brand || ""}`)) dirtyDisplayRows += 1;
    if (isLikelyNonProductCatalogRow(row)) {
      nonProductRows += 1;
      if (nonProductExamples.length < 25) {
        nonProductExamples.push({
          cache_key: row.cache_key || "",
          product_name: row.product_name || "",
          brand: row.brand || "",
          source: row.source || "",
        });
      }
    }
    if (row.cache_key) cacheKeys.add(row.cache_key);
    const nameKey = String(row.product_name || "").trim().toLowerCase();
    if (nameKey) {
      const entry = duplicateMap.get(nameKey) || { name_key: nameKey, rows: 0, cacheKeys: new Set() };
      entry.rows += 1;
      if (row.cache_key) entry.cacheKeys.add(row.cache_key);
      duplicateMap.set(nameKey, entry);
    }
    sourceMap.set(source, sourceEntry);
  }

  const duplicateNames = [...duplicateMap.values()]
    .filter((entry) => entry.rows > 1)
    .map((entry) => ({
      name_key: entry.name_key,
      rows: entry.rows,
      cache_keys: entry.cacheKeys.size,
    }))
    .sort((a, b) => b.rows - a.rows || a.name_key.localeCompare(b.name_key))
    .slice(0, 25);

  const sources = [...sourceMap.values()]
    .map((source) => ({
      source: source.source,
      rows: source.rows,
      analysis_ready_rows: source.analysis_ready_rows,
      published_nutrient_rows: source.published_nutrient_rows,
      avg_ingredients: source.rows ? Number((source.total_ingredients / source.rows).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.rows - a.rows)
    .slice(0, 20);

  return {
    totalRows: rows.length,
    distinctCacheKeys: cacheKeys.size,
    distinctNames: duplicateMap.size,
    analysisReadyRows,
    shortIngredientRows,
    expiredRows,
    publishedNutrientRows,
    imageRows,
    dirtyDisplayRows,
    nonProductRows,
    nonProductExamples,
    sources,
    duplicateNames,
  };
}

function normalizeAuditName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;|&/g, " amp ")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/[^\w]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyNonProductCatalogRow(row) {
  const name = normalizeAuditName(row?.product_name);
  if (!name) return false;
  return (
    /^ingredients? (?:amp |and )?nutritional value$/.test(name) ||
    /^ingredients? guide(?: ingredients? guide)?\b/.test(name) ||
    /\b(?:dog|cat|pet) (?:food|treat) trends?\b/.test(name) ||
    (/\btrends?\b/.test(name) && /\bthe rise of\b/.test(name)) ||
    /\b(?:treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables)\b/.test(name) ||
    (/\bsamples?\b/.test(name) && /\b(?:pack|variety|bundle)\b/.test(name))
  );
}

function analysisCacheKey(row, petType) {
  const cacheKey = typeof row?.cache_key === "string" ? row.cache_key.trim() : "";
  return analysisCacheKeyForPetType(cacheKey, petType);
}

function appVisibleAnalysisCandidateKeys(row, petType) {
  return [...new Set(analysisCacheBaseKeys(row)
    .flatMap((baseKey) => [
      analysisCacheKeyForPetType(baseKey, petType),
      baseKey,
    ])
    .filter(Boolean))];
}

function cachedAnalysisMatchesPetType(analysis, petType) {
  return (petType === "dog" || petType === "cat") && analysis?.petType === petType;
}

function validFreshAnalysisByKey(rows) {
  const freshAnalysisByKey = new Map();
  for (const row of rows || []) {
    if (row?.cache_key && schemaValidAnalysis(row.analysis)) freshAnalysisByKey.set(row.cache_key, row.analysis);
  }
  return freshAnalysisByKey;
}

function appVisibleAnalysisCoverage(rows, freshAnalysisByKey) {
  const now = Date.now();
  let covered = 0;
  for (const row of rows) {
    const ingredientCount = Number(row.ingredient_count || 0);
    const isExpired = row.expires_at ? Date.parse(row.expires_at) <= now : true;
    if (ingredientCount < 5 || isExpired) continue;
    const targetPetTypes = inferPetTypes(row, { includeAmbiguous: true });
    if (targetPetTypes.length === 0) continue;
    const coveredTargets = targetPetTypes.every((petType) => {
      const candidateKeys = appVisibleAnalysisCandidateKeys(row, petType);
      return candidateKeys.some((key) => cachedAnalysisMatchesPetType(freshAnalysisByKey.get(key), petType));
    });
    if (coveredTargets) {
      covered += 1;
    }
  }
  return covered;
}

async function fetchRestRows() {
  if (!restUrl || !restKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY, or set PRODUCT_CATALOG_DB_URL/SUPABASE_DB_URL/DATABASE_URL for psql mode");
  }

  const base = `${restUrl.replace(/\/$/, "")}/rest/v1/product_data`;
  const select = "cache_key,product_name,brand,source,source_url,ingredient_count,expires_at,has_published_nutrients,image_url";
  const rows = [];

  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const to = from + REST_PAGE_SIZE - 1;
    const url = `${base}?select=${encodeURIComponent(select)}&order=product_name.asc`;
    const response = await fetch(url, {
      headers: {
        apikey: restKey,
        Authorization: `Bearer ${restKey}`,
        Range: `${from}-${to}`,
        Prefer: "count=exact",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`Supabase REST product_data ${response.status}: ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < REST_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchFreshRestAnalysisCacheRows(token = restKey) {
  if (!restUrl || !restKey) return [];
  const base = `${restUrl.replace(/\/$/, "")}/rest/v1/analysis_cache`;
  const now = encodeURIComponent(new Date().toISOString());
  const select = encodeURIComponent("cache_key,analysis,expires_at");
  const rows = [];

  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const to = from + REST_PAGE_SIZE - 1;
    const response = await fetch(`${base}?select=${select}&expires_at=gt.${now}&order=cache_key.asc`, {
      headers: {
        apikey: token,
        Authorization: `Bearer ${token}`,
        Range: `${from}-${to}`,
        Prefer: "count=exact",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`Supabase REST analysis_cache ${response.status}: ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < REST_PAGE_SIZE) break;
  }

  return rows;
}

async function restCount(path, token = restKey) {
  if (!restUrl || !restKey) return 0;
  const response = await fetch(`${restUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    method: "HEAD",
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      Prefer: "count=exact",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Supabase REST count ${path} ${response.status}: ${await response.text()}`);
  }
  return contentRangeCount(response.headers.get("content-range"));
}

function loadSqlCoverageRows() {
  return sqlJson(`
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'cache_key', cache_key,
      'product_name', product_name,
      'brand', coalesce(brand, ''),
      'ingredient_count', coalesce(array_length(ingredients, 1), 0),
      'expires_at', expires_at
    ) ORDER BY product_name), '[]'::jsonb)
    FROM public.product_data
    WHERE coalesce(array_length(ingredients, 1), 0) >= 5
      AND expires_at > now()
      AND cache_key IS NOT NULL;
  `);
}

function loadSqlFreshAnalysisCacheRows() {
  return sqlJson(`
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'cache_key', cache_key,
      'analysis', analysis
    ) ORDER BY cache_key), '[]'::jsonb)
    FROM public.analysis_cache
    WHERE expires_at > now();
  `);
}

function loadSqlMetrics() {
  const summary = sqlJson(`
    SELECT jsonb_build_object(
      'totalRows', count(*),
      'distinctCacheKeys', count(DISTINCT cache_key),
      'distinctNames', count(DISTINCT lower(product_name)),
      'analysisReadyRows', count(*) FILTER (
        WHERE coalesce(array_length(ingredients, 1), 0) >= 5
          AND expires_at > now()
      ),
      'shortIngredientRows', count(*) FILTER (
        WHERE coalesce(array_length(ingredients, 1), 0) < 5
      ),
      'expiredRows', count(*) FILTER (WHERE expires_at <= now()),
      'publishedNutrientRows', count(*) FILTER (WHERE has_published_nutrients = true),
      'imageRows', count(*) FILTER (WHERE image_url IS NOT NULL AND length(trim(image_url)) > 0),
      'dirtyDisplayRows', count(*) FILTER (
        WHERE coalesce(product_name, '') ~* '&(amp|quot|apos|reg|trade|ndash|mdash);|&#x?[0-9a-f]+;|<[^>]+>|^\\s*(brand|product)\\s*:|^\\s*\\|+|\\|+\\s*$|\\(\\s*$|\\s*[,;:]\\s*$'
          OR coalesce(brand, '') ~* '&(amp|quot|apos|reg|trade|ndash|mdash);|&#x?[0-9a-f]+;|<[^>]+>|^\\s*(brand|product)\\s*:|^\\s*\\|+|\\|+\\s*$|\\(\\s*$|\\s*[,;:]\\s*$'
      ),
      'nonProductRows', count(*) FILTER (
        WHERE lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'gi'), '[^[:alnum:]_]+', ' ', 'g')) ~* '^\\s*ingredients?\\s+(amp\\s+|and\\s+)?nutritional\\s+value\\s*$|^\\s*ingredients?\\s+guide(\\s+ingredients?\\s+guide)?\\m|\\m(dog|cat|pet)\\s+(food|treat)\\s+trends?\\M'
          OR (
            lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'gi'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\mtrends?\\M'
            AND lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'g'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\mthe\\s+rise\\s+of\\M'
          )
          OR lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'gi'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\m(treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables)\\M'
          OR (
            lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'gi'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\msamples?\\M'
            AND lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'g'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\m(pack|variety|bundle)\\M'
          )
      )
    )
    FROM public.product_data;
  `);

  const nonProductExamples = sqlJson(`
    SELECT coalesce(jsonb_agg(row_to_json(non_product_rows)), '[]'::jsonb)
    FROM (
      SELECT
        cache_key,
        product_name,
        coalesce(brand, '') AS brand,
        coalesce(source, '') AS source
      FROM public.product_data
      WHERE lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'gi'), '[^[:alnum:]_]+', ' ', 'g')) ~* '^\\s*ingredients?\\s+(amp\\s+|and\\s+)?nutritional\\s+value\\s*$|^\\s*ingredients?\\s+guide(\\s+ingredients?\\s+guide)?\\m|\\m(dog|cat|pet)\\s+(food|treat)\\s+trends?\\M'
        OR (
          lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'gi'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\mtrends?\\M'
          AND lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'g'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\mthe\\s+rise\\s+of\\M'
        )
        OR lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'gi'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\m(treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables)\\M'
        OR (
          lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'gi'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\msamples?\\M'
          AND lower(regexp_replace(regexp_replace(regexp_replace(coalesce(product_name, ''), '&amp;|&', ' amp ', 'gi'), '&#x?[0-9a-f]+;', ' ', 'g'), '[^[:alnum:]_]+', ' ', 'g')) ~* '\\m(pack|variety|bundle)\\M'
        )
      ORDER BY product_name
      LIMIT 25
    ) non_product_rows;
  `);

  const sources = sqlJson(`
    SELECT coalesce(jsonb_agg(row_to_json(source_rows)), '[]'::jsonb)
    FROM (
      SELECT
        source,
        count(*)::int AS rows,
        count(*) FILTER (
          WHERE coalesce(array_length(ingredients, 1), 0) >= 5
            AND expires_at > now()
        )::int AS analysis_ready_rows,
        count(*) FILTER (WHERE has_published_nutrients = true)::int AS published_nutrient_rows,
        round(avg(coalesce(array_length(ingredients, 1), 0))::numeric, 1)::float AS avg_ingredients
      FROM public.product_data
      GROUP BY source
      ORDER BY rows DESC NULLS LAST
      LIMIT 20
    ) source_rows;
  `);

  const duplicateNames = sqlJson(`
    SELECT coalesce(jsonb_agg(row_to_json(duplicate_rows)), '[]'::jsonb)
    FROM (
      SELECT
        lower(product_name) AS name_key,
        count(*)::int AS rows,
        count(DISTINCT cache_key)::int AS cache_keys
      FROM public.product_data
      GROUP BY lower(product_name)
      HAVING count(*) > 1
      ORDER BY rows DESC, name_key
      LIMIT 25
    ) duplicate_rows;
  `);

  const sqlCoverageRows = loadSqlCoverageRows();
  const freshAnalysisRows = loadSqlFreshAnalysisCacheRows();
  const freshAnalysisByKey = validFreshAnalysisByKey(freshAnalysisRows);
  const rawFreshAnalysisCacheRows = freshAnalysisRows.length;
  const schemaValidFreshAnalysisCacheRows = freshAnalysisByKey.size;
  const freshAnalysisCacheRows = appVisibleAnalysisCoverage(sqlCoverageRows, freshAnalysisByKey);

  return {
    ...summary,
    sources,
    duplicateNames,
    nonProductExamples,
    analysisCacheRows: sqlJson("SELECT count(*) FROM public.analysis_cache;"),
    rawFreshAnalysisCacheRows,
    freshAnalysisCacheRows,
    schemaValidFreshAnalysisCacheRows,
    appVisibleAnalysisCacheRows: freshAnalysisCacheRows,
    expiredPercent: percent(summary.expiredRows, summary.totalRows),
    duplicateNamePercent: percent(summary.totalRows - summary.distinctNames, summary.totalRows),
    analysisReadyPercent: percent(summary.analysisReadyRows, summary.totalRows),
    publishedNutrientCoveragePercent: percent(summary.publishedNutrientRows, summary.analysisReadyRows),
    freshAnalysisCacheCoveragePercent: percent(freshAnalysisCacheRows, summary.analysisReadyRows),
  };
}

async function loadMetrics() {
  if (dbUrl) {
    return { mode: "postgres", cacheCoverageVerified: true, ...loadSqlMetrics() };
  }

  const rows = await fetchRestRows();
  lastFetchedRows = rows;
  const summary = summarizeRows(rows);
  const cacheCountKey = restServiceKey || restKey;
  const cacheCoverageMode = restServiceKey ? "service_role" : "app_visible_rest";
  const cacheCoverageVerified = true;
  const freshAnalysisRows = await fetchFreshRestAnalysisCacheRows(cacheCountKey);
  const freshAnalysisByKey = validFreshAnalysisByKey(freshAnalysisRows);
  const rawFreshAnalysisCacheRows = freshAnalysisRows.length;
  const schemaValidFreshAnalysisCacheRows = freshAnalysisByKey.size;
  const freshAnalysisCacheRows = appVisibleAnalysisCoverage(rows, freshAnalysisByKey);
  const analysisCacheRows = await restCount("analysis_cache?select=cache_key", cacheCountKey);
  return {
    mode: "supabase_rest",
    ...summary,
    analysisCacheRows,
    rawFreshAnalysisCacheRows,
    schemaValidFreshAnalysisCacheRows,
    appVisibleAnalysisCacheRows: freshAnalysisCacheRows,
    freshAnalysisCacheRows,
    cacheCoverageVerified,
    cacheCoverageMode,
    expiredPercent: percent(summary.expiredRows, summary.totalRows),
    duplicateNamePercent: percent(summary.totalRows - summary.distinctNames, summary.totalRows),
    analysisReadyPercent: percent(summary.analysisReadyRows, summary.totalRows),
    publishedNutrientCoveragePercent: percent(summary.publishedNutrientRows, summary.analysisReadyRows),
    freshAnalysisCacheCoveragePercent: percent(freshAnalysisCacheRows, summary.analysisReadyRows),
  };
}

function summarizeNutrientTargets(rows) {
  const bySource = new Map();
  let withImage = 0;
  let withRemoteImage = 0;
  let withSourceUrl = 0;
  for (const row of rows) {
    const source = row.source || "(null)";
    bySource.set(source, (bySource.get(source) || 0) + 1);
    if (row.hasImage) withImage += 1;
    if (row.imageUrl) withRemoteImage += 1;
    if (row.sourceUrl) withSourceUrl += 1;
  }
  return {
    bySource: [...bySource.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
      .slice(0, 20),
    withImage,
    withRemoteImage,
    withSourceUrl,
  };
}

function argNumber(name, fallback) {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  if (!arg) return fallback;
  const value = Number(arg.slice(name.length + 1));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function nutrientResearchBatchKey(target) {
  const brand = String(target.brand || "(unknown brand)").trim().toLowerCase();
  const source = String(target.source || "product_data").trim().toLowerCase();
  const petType = target.petType === "dog" || target.petType === "cat" ? target.petType : "ambiguous";
  return `${brand}\u001f${source}\u001f${petType}`;
}

function summarizeNutrientResearchBatch(targets) {
  const first = targets[0] || {};
  const sourceUrls = [...new Set(targets.map((target) => target.sourceUrl).filter(Boolean))].slice(0, 8);
  const imageUrls = [...new Set(targets.map((target) => target.imageUrl).filter(Boolean))].slice(0, 8);
  const researchQueries = [...new Set(targets.flatMap((target) => target.researchQueries || []))].slice(0, 12);
  return {
    brand: first.brand || "",
    source: first.source || "product_data",
    petType: first.petType || "ambiguous",
    targetCount: targets.length,
    withSourceUrl: targets.filter((target) => target.sourceUrl).length,
    withImage: targets.filter((target) => target.hasImage).length,
    sourceUrls,
    imageUrls,
    researchQueries,
  };
}

function buildNutrientResearchBatches(targets, batchSize, batchCount) {
  const groups = new Map();
  for (const target of targets) {
    const key = nutrientResearchBatchKey(target);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(target);
  }

  return [...groups.values()]
    .map((group) => prioritizeNutrientTargets(group))
    .sort((a, b) => compareNutrientTargets(a[0] || {}, b[0] || {}) || b.length - a.length)
    .flatMap((group) => {
      const chunks = [];
      for (let index = 0; index < group.length; index += batchSize) {
        chunks.push(group.slice(index, index + batchSize));
      }
      return chunks;
    })
    .slice(0, batchCount)
    .map((targetsInBatch, index) => ({
      batchId: `nutrient_research_${String(index + 1).padStart(3, "0")}`,
      ...summarizeNutrientResearchBatch(targetsInBatch),
      targets: targetsInBatch.map((target) => ({
        cacheKey: target.cacheKey,
        productName: target.productName,
        brand: target.brand || "",
        source: target.source || "product_data",
        petType: target.petType,
        targetPetTypes: target.targetPetTypes,
        sourceUrl: target.sourceUrl,
        imageUrl: target.imageUrl,
        researchQueries: target.researchQueries,
        priority: target.priority,
      })),
    }));
}

function cleanNutrientTargetUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return trimmed.slice(0, 500);
}

function nutrientTargetSourcePriority(source) {
  return SOURCE_NUTRIENT_TARGET_PRIORITY.has(source)
    ? SOURCE_NUTRIENT_TARGET_PRIORITY.get(source)
    : 7;
}

function normalizeNutrientMarketBrandText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nutrientTargetMarketBrandPriority(target) {
  const brandText = normalizeNutrientMarketBrandText(target?.brand);
  const nameText = normalizeNutrientMarketBrandText(target?.productName);
  const combined = `${brandText} ${nameText}`.trim();
  if (!combined) return 99;
  for (const [brand, rank] of MARKET_BRAND_NUTRIENT_PRIORITY.entries()) {
    const normalizedBrand = normalizeNutrientMarketBrandText(brand);
    if (combined === normalizedBrand || combined.startsWith(`${normalizedBrand} `) || combined.includes(` ${normalizedBrand} `)) {
      return rank;
    }
  }
  return 99;
}

function nutrientTargetPriority(target) {
  return {
    marketBrandRank: nutrientTargetMarketBrandPriority(target),
    sourceRank: nutrientTargetSourcePriority(target.source || "product_data"),
    hasSourceUrl: Boolean(target.sourceUrl),
    hasImage: Boolean(target.hasImage),
    ingredientCount: Number(target.ingredientCount || 0),
    petTypeSpecific: target.petType === "dog" || target.petType === "cat",
  };
}

function compareNutrientTargets(a, b) {
  const priorityA = nutrientTargetPriority(a);
  const priorityB = nutrientTargetPriority(b);
  return (
    priorityA.marketBrandRank - priorityB.marketBrandRank ||
    priorityA.sourceRank - priorityB.sourceRank ||
    Number(priorityB.hasSourceUrl) - Number(priorityA.hasSourceUrl) ||
    Number(priorityB.hasImage) - Number(priorityA.hasImage) ||
    priorityB.ingredientCount - priorityA.ingredientCount ||
    Number(priorityB.petTypeSpecific) - Number(priorityA.petTypeSpecific) ||
    String(a.brand || "").localeCompare(String(b.brand || "")) ||
    String(a.productName || "").localeCompare(String(b.productName || "")) ||
    String(a.cacheKey || "").localeCompare(String(b.cacheKey || ""))
  );
}

function prioritizeNutrientTargets(targets) {
  return [...targets].sort(compareNutrientTargets);
}

function nutrientPanelResearchQueries(target) {
  const productName = String(target.productName || "").trim();
  const brand = String(target.brand || "").trim();
  const baseName = brand && productName.toLowerCase().startsWith(brand.toLowerCase())
    ? productName
    : [brand, productName].filter(Boolean).join(" ");
  const petType = target.petType === "dog" || target.petType === "cat" ? target.petType : "pet";
  return [
    `${baseName} guaranteed analysis ${petType} food`,
    `${baseName} calories protein fat fiber moisture`,
    `${baseName} nutrient panel as fed dry matter`,
  ]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 3);
}

function buildNutrientTargets(rows) {
  if (!Array.isArray(rows)) {
    return null;
  }

  const now = Date.now();
  return prioritizeNutrientTargets(rows
    .filter((row) => {
      const ingredientCount = Number(row.ingredient_count || 0);
      const isExpired = row.expires_at ? Date.parse(row.expires_at) <= now : true;
      return ingredientCount >= 5 && !isExpired && row.has_published_nutrients !== true;
    })
    .map((row) => ({
      cacheKey: row.cache_key,
      productName: row.product_name,
      brand: row.brand || "",
      source: row.source || "product_data",
      petType: inferPrimaryPetType(row) || "ambiguous",
      targetPetTypes: inferPetTypes(row, { includeAmbiguous: true }),
      ingredientCount: Number(row.ingredient_count || 0),
      hasImage: Boolean(row.image_url),
      imageUrl: cleanNutrientTargetUrl(row.image_url),
      sourceUrl: cleanNutrientTargetUrl(row.source_url),
      researchQueries: null,
      priority: null,
    }))
    .filter((target) => target.cacheKey && target.productName))
    .map((target) => ({
      ...target,
      researchQueries: nutrientPanelResearchQueries(target),
      priority: nutrientTargetPriority(target),
    }));
}

function exportNutrientResearchBatches(targets, metrics) {
  if (!exportNutrientResearchBatchesPath) return;
  if (!Array.isArray(targets)) {
    console.error("Nutrient research batch export is available only in Supabase REST audit mode.");
    return;
  }

  const batchSize = argNumber("--nutrient-research-batch-size", DEFAULT_NUTRIENT_RESEARCH_BATCH_SIZE);
  const batchCount = argNumber("--nutrient-research-batch-count", DEFAULT_NUTRIENT_RESEARCH_BATCH_COUNT);
  const batches = buildNutrientResearchBatches(targets, batchSize, batchCount);
  fs.mkdirSync(path.dirname(exportNutrientResearchBatchesPath), { recursive: true });
  fs.writeFileSync(
    exportNutrientResearchBatchesPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      analysisReadyRows: metrics.analysisReadyRows,
      publishedNutrientRows: metrics.publishedNutrientRows,
      missingPublishedNutrientRows: targets.length,
      selectionPriority: NUTRIENT_TARGET_PRIORITY_DESCRIPTION,
      batchSize,
      batchCount: batches.length,
      totalBatchTargets: batches.reduce((sum, batch) => sum + batch.targets.length, 0),
      summary: summarizeNutrientTargets(targets),
      batches,
    }, null, 2)}\n`,
    "utf8",
  );
}

function exportNutrientTargets(rows, metrics) {
  if (!exportNutrientTargetsPath && !exportNutrientResearchBatchesPath) return;
  const targets = buildNutrientTargets(rows);
  if (!Array.isArray(targets)) {
    console.error("Nutrient target export is available only in Supabase REST audit mode.");
    return;
  }

  if (exportNutrientTargetsPath) {
    fs.mkdirSync(path.dirname(exportNutrientTargetsPath), { recursive: true });
    fs.writeFileSync(
      exportNutrientTargetsPath,
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        analysisReadyRows: metrics.analysisReadyRows,
        publishedNutrientRows: metrics.publishedNutrientRows,
        missingPublishedNutrientRows: targets.length,
        selectionPriority: NUTRIENT_TARGET_PRIORITY_DESCRIPTION,
        summary: summarizeNutrientTargets(targets),
        targets,
      }, null, 2)}\n`,
      "utf8",
    );
  }
  exportNutrientResearchBatches(targets, metrics);
}

function evaluate(metrics) {
  const failures = [];
  if (metrics.totalRows < thresholds.minRows) {
    failures.push(`total rows ${metrics.totalRows} < target ${thresholds.minRows}`);
  }
  if (metrics.analysisReadyRows < thresholds.minReadyRows) {
    failures.push(`analysis-ready rows ${metrics.analysisReadyRows} < target ${thresholds.minReadyRows}`);
  }
  if (metrics.expiredPercent > thresholds.maxExpiredPercent) {
    failures.push(`expired rows ${metrics.expiredPercent}% > max ${thresholds.maxExpiredPercent}%`);
  }
  if (metrics.duplicateNamePercent > thresholds.maxDuplicateNamePercent) {
    failures.push(`duplicate-name rows ${metrics.duplicateNamePercent}% > max ${thresholds.maxDuplicateNamePercent}%`);
  }
  if (metrics.dirtyDisplayRows > thresholds.maxDirtyDisplayRows) {
    failures.push(`dirty display rows ${metrics.dirtyDisplayRows} > max ${thresholds.maxDirtyDisplayRows}`);
  }
  if ((metrics.nonProductRows || 0) > thresholds.maxNonProductRows) {
    failures.push(`non-product catalog rows ${metrics.nonProductRows} > max ${thresholds.maxNonProductRows}`);
  }
  if (metrics.publishedNutrientRows < thresholds.minPublishedNutrientRows) {
    failures.push(`published nutrient rows ${metrics.publishedNutrientRows} < target ${thresholds.minPublishedNutrientRows}`);
  }
  if (metrics.freshAnalysisCacheRows < thresholds.minAnalysisCacheRows) {
    failures.push(`fresh analysis cache rows ${metrics.freshAnalysisCacheRows} < target ${thresholds.minAnalysisCacheRows}`);
  }
  if (!metrics.cacheCoverageVerified) {
    failures.push("analysis cache coverage is not verified");
  }
  if (metrics.distinctCacheKeys !== metrics.totalRows) {
    failures.push(`cache key uniqueness drift: ${metrics.distinctCacheKeys}/${metrics.totalRows} distinct`);
  }
  return failures;
}

function printHuman(metrics, failures) {
  console.log("Product catalog audit");
  console.log(`  mode:             ${metrics.mode}`);
  console.log(`  rows:             ${metrics.totalRows}`);
  console.log(`  analysis-ready:   ${metrics.analysisReadyRows} (${metrics.analysisReadyPercent}%)`);
  console.log(`  distinct names:   ${metrics.distinctNames}`);
  console.log(`  distinct keys:    ${metrics.distinctCacheKeys}`);
  console.log(`  expired rows:     ${metrics.expiredRows} (${metrics.expiredPercent}%)`);
  console.log(`  short ingredients:${metrics.shortIngredientRows}`);
  console.log(`  dirty display:    ${metrics.dirtyDisplayRows}`);
  console.log(`  non-product rows: ${metrics.nonProductRows || 0}`);
  console.log(`  analysis cache:   ${metrics.freshAnalysisCacheRows} app-visible ready / ${metrics.analysisCacheRows} total (${metrics.freshAnalysisCacheCoveragePercent || 0}% of ready rows)`);
  console.log(`  raw fresh cache:   ${metrics.rawFreshAnalysisCacheRows ?? metrics.freshAnalysisCacheRows} rows, ${metrics.schemaValidFreshAnalysisCacheRows ?? metrics.freshAnalysisCacheRows} schema-valid keys`);
  console.log(`  cache verified:   ${metrics.cacheCoverageVerified ? `yes (${metrics.cacheCoverageMode || "verified"})` : "no"}`);
  console.log(`  nutrient rows:    ${metrics.publishedNutrientRows} (${metrics.publishedNutrientCoveragePercent || 0}% of ready rows)`);
  console.log(`  image rows:       ${metrics.imageRows}`);
  console.log("");
  console.log("Top sources:");
  for (const source of metrics.sources) {
    console.log(`  ${source.source || "(null)"}: ${source.rows} rows, ${source.analysis_ready_rows} ready, ${source.published_nutrient_rows || 0} nutrient panels, avg ${source.avg_ingredients} ingredients`);
  }
  if (metrics.duplicateNames.length > 0) {
    console.log("");
    console.log("Largest duplicate product names:");
    for (const duplicate of metrics.duplicateNames.slice(0, 10)) {
      console.log(`  ${duplicate.rows} rows / ${duplicate.cache_keys} keys: ${duplicate.name_key}`);
    }
  }
  if ((metrics.nonProductExamples || []).length > 0) {
    console.log("");
    console.log("Likely non-product catalog rows:");
    for (const example of metrics.nonProductExamples.slice(0, 10)) {
      console.log(`  ${example.source || "(null)"}: ${example.product_name} [${example.cache_key}]`);
    }
  }
  if (failures.length > 0) {
    console.log("");
    console.log(`${warnOnly ? "Warnings" : "Failures"}:`);
    for (const failure of failures) console.log(`  - ${failure}`);
  }
}

async function main() {
  let metrics;
  try {
    metrics = await loadMetrics();
  } catch (err) {
    console.error("Product catalog audit failed:", err.message);
    process.exit(warnOnly ? 0 : 1);
  }

  const failures = evaluate(metrics);
  const result = { thresholds, metrics, failures, ok: failures.length === 0 };
  exportNutrientTargets(lastFetchedRows, metrics);

  if (jsonOnly) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(metrics, failures);
  }

  if (failures.length > 0 && !warnOnly) {
    process.exit(1);
  }
}

main();
