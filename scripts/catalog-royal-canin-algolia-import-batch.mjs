import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/royal-canin-mars-petcare";
const DEFAULT_SOURCE = "royal-canin-mars-petcare";
const DEFAULT_ALGOLIA_APP_ID = "GDAKRUQ0DG";
// Public search token embedded in Royal Canin's official web bundle.
const DEFAULT_ALGOLIA_QUERY_TOKEN = "da13b75669012876b467c7cb91d14281";
const DEFAULT_ALGOLIA_INDEX = "prod_apif-products_en_US";
const DEFAULT_HITS_PER_PAGE = 500;
const DEFAULT_SQL_CHUNK_SIZE = 25;
const ALGOLIA_REFERER = "https://www.royalcanin.com/us/view-all-products";
const ALGOLIA_ORIGIN = "https://www.royalcanin.com";
const CSV_HEADERS = [
  "cache_key",
  "gtin",
  "product_name",
  "brand",
  "product_line",
  "flavor",
  "life_stage",
  "food_form",
  "package_size",
  "pet_type",
  "ingredient_statement",
  "ingredient_source_url",
  "product_image_url",
  "image_source_url",
  "product_url",
  "is_complete_food",
  "guaranteed_analysis",
];

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

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function stripIngredientPrefix(value) {
  return compact(value)
    .replace(/^(?:ingredients?|composition)\s*:\s*/i, "")
    .replace(/^ingredient\s*:\s*/i, "");
}

function compositionText(hit, labels) {
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  const row = Array.isArray(hit?.composition)
    ? hit.composition.find((item) => wanted.has(compact(item?.label).toLowerCase()) && compact(item?.description))
    : null;
  return compact(row?.description || "");
}

function ingredientStatement(hit) {
  return stripIngredientPrefix(
    compositionText(hit, ["ingredients"])
      || compositionText(hit, ["composition"])
  );
}

function nutrientPanel(hit) {
  const evidence = {
    guaranteed_analysis: compositionText(hit, ["guaranteed_analysis"]).replace(/^guaranteed analysis\s*:\s*/i, ""),
    calorie_content: compositionText(hit, ["calorie_content"]).replace(/^calorie content\s*:\s*/i, ""),
    aafco_statement: compositionText(hit, ["aafco_statement"]),
    legal_text_heading: compositionText(hit, ["legal_text_heading"]) || compact(hit?.legal_text_heading),
  };
  return JSON.stringify(Object.fromEntries(
    Object.entries(evidence).filter(([, value]) => compact(value))
  ));
}

function isCompleteFood(hit) {
  const identityText = [
    hit?.product_title,
    hit?.digital_sub_category?.label,
    hit?.product_category?.label,
  ].map(compact).join(" ");
  const compositionEvidence = JSON.stringify(hit?.composition || []);

  if (/\b(treat|treats|supplement|soft chews?)\b/i.test(identityText)) return false;
  if (/\b(?:intermittent|supplemental)\s+feeding\s+only\b/i.test(compositionEvidence)) return false;
  return true;
}

function packageSize(pack = {}) {
  const count = Number(pack.number);
  const weight = compact(pack.weight);
  const unit = compact(pack.unit);
  const format = compact(pack.format);
  const size = weight && unit
    ? `${Number.isFinite(count) && count > 1 ? `${count} x ` : ""}${weight} ${unit}`
    : "";
  return compact([size, format && !size.includes(format) ? format : ""].filter(Boolean).join(" "));
}

function slugPart(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9\-+& ]/gi, "")
    .replace(/\s+/g, "-");
}

function identityKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identityTokens(value) {
  return identityKey(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !new Set([
      "food",
      "canned",
      "care",
      "canin",
      "royal",
      "with",
    ]).has(token));
}

function gtinNeedles(gtin) {
  const digits = compact(gtin).replace(/\D/g, "");
  if (!digits) return [];
  return [...new Set([
    digits,
    digits.replace(/^0+/, ""),
    digits.padStart(14, "0"),
  ].filter(Boolean))];
}

function productUrl(hit) {
  const speciesCode = compact(hit?.species?.[0]?.code).toLowerCase();
  const speciesPath = speciesCode === "dog" ? "dogs" : speciesCode === "cat" ? "cats" : "";
  const pillarCode = compact(hit?.product_pillar?.[0]?.code).toLowerCase();
  const productType = {
    sptretail: "retail-products",
    vet: "vet-products",
    pro: "pro-products",
  }[pillarCode] || "retail-products";
  const nameSlug = slugPart(hit?.product_title_url || hit?.product_title);
  const variation = compact(hit?.variation);
  const variationSlug = variation ? `/${slugPart(variation)}` : "";
  if (!speciesPath || !nameSlug || !hit?.world_wide_main_item) return "";
  return `https://www.royalcanin.com/us/${speciesPath}/products/${productType}/${nameSlug}-${hit.world_wide_main_item}${variationSlug}`;
}

function petType(hit) {
  const speciesCode = compact(hit?.species?.[0]?.code).toLowerCase();
  return ["dog", "cat"].includes(speciesCode) ? speciesCode : "";
}

function foodForm(hit) {
  return compact(hit?.technology || hit?.digital_sub_category?.label).toLowerCase();
}

function imageUrl(hit) {
  return compact(hit?.bag_image?.url || hit?.thumbnail?.url);
}

function sellableRowKey(row) {
  const gtin = compact(row.gtin);
  const packageKey = identityKey(row.package_size);
  if (!gtin && !packageKey) return `cache:${row.cache_key}`;
  return [
    identityKey(row.brand),
    identityKey(row.product_name),
    compact(row.product_url).toLowerCase(),
    gtin || "no-gtin",
    packageKey || "no-package",
  ].join("|");
}

function rowEvidenceScore(row) {
  const image = compact(row.product_image_url).toLowerCase();
  const ingredient = compact(row.ingredient_statement);
  let score = 0;
  if (ingredient) score += 100;
  if (compact(row.guaranteed_analysis)) score += 20;
  if (/\bgs1\b/.test(image)) score += 80;
  if (/\b(?:front|cf|center-front|packshot|package)\b/.test(image)) score += 30;
  if (gtinNeedles(row.gtin).some((needle) => image.includes(needle.toLowerCase()))) score += 20;
  score += Math.min(ingredient.length / 250, 20);
  return score;
}

function productIdentityOverlap(left, right) {
  const leftTokens = new Set(identityTokens([
    left.product_name,
    left.product_line,
    left.food_form,
  ].join(" ")));
  const rightTokens = new Set(identityTokens([
    right.product_name,
    right.product_line,
    right.food_form,
  ].join(" ")));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

function copyIngredientEvidenceFromSameGtin(rows) {
  const rowsByGtin = new Map();
  for (const row of rows) {
    const gtin = compact(row.gtin);
    if (!gtin) continue;
    if (!rowsByGtin.has(gtin)) rowsByGtin.set(gtin, []);
    rowsByGtin.get(gtin).push(row);
  }

  const ingredientBackfillRows = [];
  for (const row of rows) {
    if (compact(row.ingredient_statement)) continue;
    const siblings = (rowsByGtin.get(compact(row.gtin)) || [])
      .filter((sibling) => sibling !== row)
      .filter((sibling) => compact(sibling.ingredient_statement))
      .filter((sibling) => sibling.pet_type === row.pet_type)
      .filter((sibling) => productIdentityOverlap(row, sibling) >= 0.5)
      .sort((left, right) => rowEvidenceScore(right) - rowEvidenceScore(left));
    const source = siblings[0];
    if (!source) continue;

    row.ingredient_statement = source.ingredient_statement;
    row.ingredient_source_url = source.ingredient_source_url || source.product_url;
    if (!compact(row.guaranteed_analysis)) row.guaranteed_analysis = source.guaranteed_analysis;
    ingredientBackfillRows.push({
      cache_key: row.cache_key,
      gtin: row.gtin,
      product_name: row.product_name,
      product_url: row.product_url,
      ingredient_source_url: row.ingredient_source_url,
      source_cache_key: source.cache_key,
      identity_overlap: productIdentityOverlap(row, source),
    });
  }

  return ingredientBackfillRows;
}

function dedupeSellableRows(rows) {
  const byKey = new Map();
  const duplicateRows = [];

  for (const row of rows) {
    const key = sellableRowKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    const existingScore = rowEvidenceScore(existing);
    const rowScore = rowEvidenceScore(row);
    const keepCurrent = rowScore >= existingScore;
    const kept = keepCurrent ? row : existing;
    const dropped = keepCurrent ? existing : row;
    byKey.set(key, kept);
    duplicateRows.push({
      key,
      kept_cache_key: kept.cache_key,
      dropped_cache_key: dropped.cache_key,
      kept_score: keepCurrent ? rowScore : existingScore,
      dropped_score: keepCurrent ? existingScore : rowScore,
      conflicting_ingredient_text: compact(kept.ingredient_statement) !== compact(dropped.ingredient_statement),
      conflicting_image_url: compact(kept.product_image_url) !== compact(dropped.product_image_url),
    });
  }

  return {
    rows: [...byKey.values()],
    duplicateRows,
  };
}

function packRowsForHit(hit, source) {
  const packs = Array.isArray(hit?.packs) && hit.packs.length > 0 ? hit.packs : [{}];
  return packs.map((pack, index) => {
    const ean = compact(pack?.ean);
    return {
      cache_key: `${source}:${hit.objectID || hit.world_wide_main_item}:${ean || `pack-${index + 1}`}`,
      gtin: ean,
      product_name: compact(hit.product_title),
      brand: compact(hit.brand) || "Royal Canin",
      product_line: compact(hit?.range?.label),
      flavor: "",
      life_stage: Array.isArray(hit?.lifestages) ? hit.lifestages.map(compact).filter(Boolean).join(", ") : "",
      food_form: foodForm(hit),
      package_size: packageSize(pack),
      pet_type: petType(hit),
      ingredient_statement: ingredientStatement(hit),
      ingredient_source_url: "",
      product_image_url: imageUrl(hit),
      image_source_url: productUrl(hit),
      product_url: productUrl(hit),
      is_complete_food: String(isCompleteFood(hit)),
      guaranteed_analysis: nutrientPanel(hit),
    };
  });
}

async function fetchPage({ appId, queryToken, indexName, page, hitsPerPage, filters }) {
  const params = new URLSearchParams({
    query: "",
    hitsPerPage: String(hitsPerPage),
    page: String(page),
    filters,
    analyticsTags: "view all products",
  });
  const response = await fetch(`https://${appId}-dsn.algolia.net/1/indexes/*/queries`, {
    method: "POST",
    headers: {
      "x-algolia-application-id": appId,
      "x-algolia-api-key": queryToken,
      "content-type": "application/json",
      "origin": ALGOLIA_ORIGIN,
      "referer": ALGOLIA_REFERER,
      "User-Agent": "WoofCatalogVerifier/1.0 (Royal Canin official index)",
    },
    body: JSON.stringify({
      requests: [{ indexName, params: params.toString() }],
    }),
  });

  if (!response.ok) throw new Error(`Royal Canin Algolia request failed: HTTP ${response.status}`);
  const json = await response.json();
  const result = json.results?.[0];
  if (!result || !Array.isArray(result.hits)) {
    throw new Error(`Royal Canin Algolia response did not include hits: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return result;
}

async function fetchRoyalCaninHits({ appId, queryToken, indexName, hitsPerPage, filters }) {
  const first = await fetchPage({ appId, queryToken, indexName, page: 0, hitsPerPage, filters });
  const hits = [...first.hits];
  for (let page = 1; page < first.nbPages; page += 1) {
    const result = await fetchPage({ appId, queryToken, indexName, page, hitsPerPage, filters });
    hits.push(...result.hits);
  }
  return {
    hits,
    nbHits: first.nbHits,
    nbPages: first.nbPages,
  };
}

function writeCsv(filePath, rows) {
  const lines = [
    CSV_HEADERS.join(","),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function runOfficialImport(feedPath, sqlDir, { source, sqlChunkSize, importTimeoutMs }) {
  const args = [
    OFFICIAL_FEED_IMPORT_SCRIPT,
    "--file", feedPath,
    "--source", source,
    "--source-quality", "manufacturer",
    "--ingredient-verification", "manufacturer",
    "--image-verification", "manufacturer",
    "--expected-brand", "Royal Canin",
    "--expected-brand", "Royal Canin Veterinary Diet",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
  ];
  const mcpGroupSize = positiveInteger(getArg("--sql-mcp-group-size"), 0);
  if (mcpGroupSize > 0) args.push("--sql-mcp-group-size", String(mcpGroupSize));

  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: importTimeoutMs,
  });

  if (result.status !== 0) {
    throw new Error([
      `${OFFICIAL_FEED_IMPORT_SCRIPT} failed with status ${result.status}`,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

async function main() {
  const outputDir = compact(getArg("--output-dir")) || DEFAULT_OUTPUT_DIR;
  const source = compact(getArg("--source")) || DEFAULT_SOURCE;
  const appId = compact(getArg("--app-id")) || process.env.ROYAL_CANIN_ALGOLIA_APP_ID || DEFAULT_ALGOLIA_APP_ID;
  const queryToken = compact(getArg("--query-token")) || process.env.ROYAL_CANIN_ALGOLIA_QUERY_TOKEN || DEFAULT_ALGOLIA_QUERY_TOKEN;
  const indexName = compact(getArg("--index-name")) || DEFAULT_ALGOLIA_INDEX;
  const hitsPerPage = positiveInteger(getArg("--hits-per-page"), DEFAULT_HITS_PER_PAGE);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const importTimeoutMs = positiveInteger(getArg("--import-timeout-ms"), 60_000);
  const pillar = compact(getArg("--pillar", "all")).toLowerCase();
  const filters = {
    all: "brand_code:royal_canin AND family:food",
    retail: "brand_code:royal_canin AND family:food AND product_pillar.code:sptretail",
    vet: "brand_code:royal_canin AND family:food AND product_pillar.code:vet",
  }[pillar];

  if (!filters) {
    throw new Error("--pillar must be one of: all, retail, vet");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const feedPath = path.join(outputDir, "feed.csv");
  const reportPath = path.join(outputDir, "report.json");
  const rawPath = path.join(outputDir, "raw-algolia-hits.json");
  const sqlDir = path.join(outputDir, "sql");

  const discovery = await fetchRoyalCaninHits({
    appId,
    queryToken,
    indexName,
    hitsPerPage,
    filters,
  });
  const hits = [...new Map(discovery.hits.map((hit) => [hit.objectID || `${hit.world_wide_main_item}:${hit.variation || ""}`, hit])).values()];
  const rawRows = hits.flatMap((hit) => packRowsForHit(hit, source));
  const { rows, duplicateRows } = dedupeSellableRows(rawRows);
  const ingredientBackfillRows = copyIngredientEvidenceFromSameGtin(rows);
  writeCsv(feedPath, rows);
  fs.writeFileSync(rawPath, `${JSON.stringify(hits, null, 2)}\n`, "utf8");

  const importResult = runOfficialImport(feedPath, sqlDir, {
    source,
    sqlChunkSize,
    importTimeoutMs,
  });
  const manifestPath = path.join(sqlDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const completeFormulaHits = hits.filter(isCompleteFood);
  const report = {
    generated_at: new Date().toISOString(),
    brand: "Royal Canin",
    source,
    source_quality: "manufacturer",
    official_search_page: ALGOLIA_REFERER,
    algolia_index: indexName,
    algolia_filters: filters,
    algolia_reported_hits: discovery.nbHits,
    fetched_hits: discovery.hits.length,
    deduped_formula_hits: hits.length,
    complete_formula_hits: completeFormulaHits.length,
    non_complete_formula_hits: hits.length - completeFormulaHits.length,
    formula_hits_with_ingredients: hits.filter((hit) => ingredientStatement(hit)).length,
    formula_hits_with_images: hits.filter((hit) => imageUrl(hit)).length,
    raw_pack_rows: rawRows.length,
    duplicate_sellable_pack_rows: duplicateRows.length,
    duplicate_sellable_conflict_rows: duplicateRows.filter((row) => row.conflicting_ingredient_text || row.conflicting_image_url).length,
    duplicate_sellable_rows: duplicateRows,
    same_gtin_ingredient_backfill_rows: ingredientBackfillRows.length,
    ingredient_backfill_rows: ingredientBackfillRows,
    pack_rows: rows.length,
    complete_pack_rows: rows.filter((row) => row.is_complete_food === "true").length,
    pack_rows_with_ingredients: rows.filter((row) => compact(row.ingredient_statement)).length,
    pack_rows_with_images: rows.filter((row) => compact(row.product_image_url)).length,
    sql_rows: manifest.total_sql_rows,
    sql_dir: sqlDir,
    feed_path: feedPath,
    raw_hits_path: rawPath,
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Royal Canin official index batch prepared: ${source}`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Formulas: ${report.deduped_formula_hits} (${report.complete_formula_hits} complete, ${report.non_complete_formula_hits} non-complete)`);
  console.log(`Pack rows: ${report.pack_rows}; SQL rows: ${report.sql_rows}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
