import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { extractProduct, readSource } from "./catalog-page-feed-extract.mjs";
import { mergePublishedAnalysis } from "./catalog-published-analysis.mjs";

const DEFAULT_BRANDS = ["Hill's Science Diet", "Fromm", "Nature's Logic", "Open Farm"];

function getArgs(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function getArg(name, fallback = "") {
  const values = getArgs(name);
  return values.length > 0 ? values.at(-1) : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJson(value[key])])
  );
}

function normalizedIdentity(value) {
  return compact(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:dog|cat|food|dry|wet|recipe|formula)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identityOverlap(left, right) {
  const leftTokens = new Set(normalizedIdentity(left).split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(normalizedIdentity(right).split(" ").filter((token) => token.length > 2));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

function sqlLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function emitSql(patches) {
  if (patches.length === 0) return "-- No source-backed analysis patches were generated.";
  const rows = patches.map((patch) => `  (${sqlLiteral(patch.cache_key)}, ${sqlLiteral(JSON.stringify(patch.nutritional_info))}::jsonb)`);
  return `-- Source-backed typical/actual analysis enrichment.\n-- Values are scoped to exact existing cache keys; formula metadata is preserved in each merged payload.\nWITH patches(cache_key, nutritional_info) AS (\n  VALUES\n${rows.join(",\n")}\n)\nUPDATE public.product_data AS product\nSET nutritional_info = patches.nutritional_info,\n    has_published_nutrients = TRUE,\n    updated_at = NOW()\nFROM patches\nWHERE product.cache_key = patches.cache_key;`;
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function rowsForBrand(client, brand, limit) {
  const { data, error } = await client
    .from("product_data")
    .select("cache_key,brand,product_name,source_url,nutritional_info,ingredient_verification_status")
    .eq("brand", brand)
    .in("ingredient_verification_status", ["manufacturer", "official"])
    .not("source_url", "is", null)
    .order("product_name", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`${brand}: ${error.message}`);
  return data || [];
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const brands = getArgs("--brand");
  const selectedBrands = brands.length > 0 ? brands : DEFAULT_BRANDS;
  const limitPerBrand = Math.max(1, Number.parseInt(getArg("--limit-per-brand", "10"), 10) || 10);
  const fetchDelayMs = Math.max(0, Number.parseInt(getArg("--fetch-delay-ms", "250"), 10) || 0);
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = [];
  for (const brand of selectedBrands) {
    rows.push(...await rowsForBrand(client, brand, limitPerBrand));
  }

  const bySource = new Map();
  for (const row of rows) {
    const sourceUrl = compact(row.source_url);
    if (!sourceUrl) continue;
    if (!bySource.has(sourceUrl)) bySource.set(sourceUrl, []);
    bySource.get(sourceUrl).push(row);
  }

  const patches = [];
  const sources = [];
  for (const [index, [sourceUrl, sourceRows]] of [...bySource.entries()].entries()) {
    if (index > 0) await sleep(fetchDelayMs);
    try {
      const source = await readSource(sourceUrl);
      const extracted = await extractProduct(source.html, source.sourceUrl, {
        pageData: source.pageData,
        sourceOverrides: source.sourceOverrides,
        allowRemoteEnrichment: true,
      });
      const pageInfo = parseObject(extracted.nutritional_info);
      const analysis = pageInfo.typical_analysis
        ? {
            typical_analysis: pageInfo.typical_analysis,
            published_analysis_source: pageInfo.published_analysis_source,
          }
        : null;
      const queuedSource = !analysis && pageInfo.published_analysis_source
        ? pageInfo.published_analysis_source
        : null;
      const overlap = Math.max(...sourceRows.map((row) => identityOverlap(row.product_name, extracted.product_name)));
      if (overlap < 0.5) {
        sources.push({ source_url: sourceUrl, status: "identity_mismatch", extracted_product_name: extracted.product_name, overlap });
        continue;
      }
      if (!analysis && !queuedSource) {
        sources.push({ source_url: sourceUrl, status: "no_published_analysis", extracted_product_name: extracted.product_name });
        continue;
      }

      for (const row of sourceRows) {
        const nutritionalInfo = parseObject(mergePublishedAnalysis(
          row.nutritional_info,
          analysis,
          queuedSource
        ));
        if (
          JSON.stringify(stableJson(nutritionalInfo))
          === JSON.stringify(stableJson(parseObject(row.nutritional_info)))
        ) continue;
        patches.push({
          cache_key: row.cache_key,
          brand: row.brand,
          product_name: row.product_name,
          source_url: sourceUrl,
          status: analysis ? "extracted" : "requires_verified_extraction",
          nutritional_info: nutritionalInfo,
        });
      }
      sources.push({
        source_url: sourceUrl,
        status: analysis ? "extracted" : "requires_verified_extraction",
        extracted_product_name: extracted.product_name,
        rows: sourceRows.length,
      });
    } catch (error) {
      sources.push({ source_url: sourceUrl, status: "error", error: compact(error.message || error) });
    }
  }

  if (hasArg("--sql")) {
    process.stdout.write(`${emitSql(patches)}\n`);
    return;
  }

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    brands: selectedBrands,
    candidate_rows: rows.length,
    source_pages: bySource.size,
    patches,
    sources,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
