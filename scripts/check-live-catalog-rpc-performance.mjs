import { spawnSync } from "node:child_process";
import process from "node:process";

const projectRef = process.env.SUPABASE_PROJECT_REF || "rhlgvrywjralxrjcdtrw";
const samplesPerScenario = 3;
const minimumRealisticRows = 10_000;

function parseCliJson(output) {
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Supabase CLI did not return JSON");
  return JSON.parse(output.slice(start));
}

function query(sql) {
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "--project-ref", projectRef, sql],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || "Supabase query failed").trim());
  }
  return parseCliJson(result.stdout).rows || [];
}

function planNodes(node, collected = []) {
  if (!node || typeof node !== "object") return collected;
  collected.push({
    nodeType: node["Node Type"] || null,
    relation: node["Relation Name"] || null,
    indexName: node["Index Name"] || null,
  });
  for (const child of node.Plans || []) planNodes(child, collected);
  return collected;
}

function explain(sql) {
  const rows = query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
  const report = rows[0]?.["QUERY PLAN"]?.[0];
  if (!report) throw new Error("EXPLAIN did not return a JSON plan");
  return {
    executionMs: Number(report["Execution Time"]),
    nodes: planNodes(report.Plan),
  };
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

const boundary = query(`
  SELECT
    (SELECT count(*) FROM public.product_data) AS product_rows,
    to_regprocedure('public.search_verified_product_teasers(text,integer)') IS NOT NULL AS has_teaser_search,
    to_regprocedure('public.resolve_verified_product_teaser_by_gtin(text,integer)') IS NOT NULL AS has_teaser_gtin,
    to_regclass('public.idx_product_data_normalized_gtin') IS NOT NULL AS has_product_gtin_index,
    NOT has_function_privilege('authenticated', 'public.search_products(text,integer)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.search_verified_products(text,integer)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.search_verified_products_for_label_fast(text[],integer)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.search_verified_products_for_label_ocr(text[],integer)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.search_verified_products_for_label_ocr_text(text,integer)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.search_verified_products_ranked_v1(text,integer)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.resolve_verified_product_by_gtin(text,integer)', 'EXECUTE')
      AS legacy_full_rpcs_revoked
`)[0];

if (!boundary || Number(boundary.product_rows) < minimumRealisticRows) {
  console.error(`BLOCKED(live catalog performance): expected at least ${minimumRealisticRows} product rows`);
  process.exit(2);
}
if (!boundary.has_teaser_search || !boundary.has_teaser_gtin || !boundary.has_product_gtin_index) {
  console.error("BLOCKED(live catalog performance): approval-gated catalog boundary/index migrations are not installed");
  process.exit(2);
}
if (!boundary.legacy_full_rpcs_revoked) {
  console.error("FAIL(live catalog performance): an authenticated legacy full-row RPC is still callable");
  process.exit(1);
}

const scenarios = [
  {
    name: "typed search — Nature's Logic",
    budgetMs: 2_000,
    sql: "SELECT * FROM public.search_verified_product_teasers('Nature''s Logic', 16);",
  },
  {
    name: "typed search — Hill's Science Diet",
    budgetMs: 2_000,
    sql: "SELECT * FROM public.search_verified_product_teasers('Hill''s Science Diet', 16);",
  },
  {
    name: "label identity — Nature's Logic",
    budgetMs: 2_000,
    sql: "SELECT * FROM public.search_verified_product_identities_for_label(ARRAY['Nature''s Logic Rabbit','Nature''s Logic Dog'], 32);",
  },
  {
    name: "label identity — Hill's Science Diet",
    budgetMs: 2_000,
    sql: "SELECT * FROM public.search_verified_product_identities_for_label(ARRAY['Hill''s Science Diet Adult 7+','Hill''s Adult Dog'], 32);",
  },
  {
    name: "barcode teaser",
    budgetMs: 500,
    sql: "SELECT * FROM public.resolve_verified_product_teaser_by_gtin('850013992768', 8);",
  },
];

const results = [];
let failed = false;
for (const scenario of scenarios) {
  const samples = [];
  for (let index = 0; index < samplesPerScenario; index += 1) {
    samples.push(explain(scenario.sql).executionMs);
  }
  const p50Ms = percentile(samples, 0.5);
  const p95Ms = percentile(samples, 0.95);
  const passed = p95Ms <= scenario.budgetMs;
  failed ||= !passed;
  results.push({ ...scenario, sql: undefined, samples, p50Ms, p95Ms, passed });
}

const indexProbes = [
  {
    name: "full-text product search",
    expectedIndex: "idx_product_data_search_document",
    sql: `SELECT product.cache_key
      FROM public.product_data product
      WHERE product.search_document @@ plainto_tsquery('simple', 'nature logic rabbit')
      ORDER BY ts_rank_cd(product.search_document, plainto_tsquery('simple', 'nature logic rabbit')) DESC
      LIMIT 12;`,
  },
  {
    name: "normalized GTIN product lookup",
    expectedIndex: "idx_product_data_normalized_gtin",
    sql: `SELECT product.cache_key
      FROM public.product_data product
      WHERE ltrim(regexp_replace(COALESCE(product.gtin, ''), '[^0-9]', '', 'g'), '0') = '850013992768'
      LIMIT 8;`,
  },
];

const plans = indexProbes.map((probe) => {
  const report = explain(probe.sql);
  const indexes = report.nodes.map((node) => node.indexName).filter(Boolean);
  const sequentialProductScan = report.nodes.some(
    (node) => node.nodeType === "Seq Scan" && node.relation === "product_data"
  );
  const passed = indexes.includes(probe.expectedIndex) && !sequentialProductScan;
  failed ||= !passed;
  return {
    name: probe.name,
    executionMs: report.executionMs,
    expectedIndex: probe.expectedIndex,
    indexes,
    sequentialProductScan,
    passed,
  };
});

console.log(JSON.stringify({
  projectRef,
  productRows: Number(boundary.product_rows),
  samplesPerScenario,
  results,
  plans,
}, null, 2));

if (failed) process.exit(1);
console.log("Live catalog RPC performance check passed.");
