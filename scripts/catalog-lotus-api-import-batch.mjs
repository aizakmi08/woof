import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/lotus-pet-foods";
const DEFAULT_SOURCE = "lotus-pet-foods";
const DEFAULT_BRAND = "Lotus";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 250;
const DEFAULT_MAX_PRODUCTS = 250;
const LOTUS_BASE_URL = "https://www.lotuspetfoods.com";
const LOTUS_APP_BUNDLE_URL = `${LOTUS_BASE_URL}/main.chunk.js`;
const LOTUS_PRODUCT_INFO_URL = `${LOTUS_BASE_URL}/client/products/get-products-info`;
const BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 WoofCatalogVerifier/1.0";
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
  "product_image_url",
  "product_url",
  "is_complete_food",
  "guaranteed_analysis",
  "nutritional_info",
  "source_quality",
  "ingredient_verification_status",
  "image_verification_status",
  "ingredient_source_url",
  "image_source_url",
  "raw_source_hash",
  "content_hash",
  "extractor_version",
];
const SIZE_KEYS = ["small", "medium", "large"];
const NON_COMPLETE_FOOD_IDENTITY_PATTERNS = [
  /\b(treat|treats|snack|snacks|chew|chews|jerky|biscuit|biscuits|dental)\b/i,
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|enhancer|enhancers)\b/i,
  /\b(broth topper|broth toppers|supplement|supplements|complement|complementary|intermittent|supplemental)\b/i,
  /\b(variety pack|variety packs|bundle|bundles|sampler|samplers|sample pack|trial pack)\b/i,
  /\b(toy|bowl|scoop|leash|collar|blanket|merch|gift card)\b/i,
];
const PROTEIN_TERMS = [
  "beef",
  "chicken",
  "duck",
  "lamb",
  "pork",
  "sardine",
  "turkey",
  "venison",
  "tripe",
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) {
      values.push(value);
      index += 1;
    }
  }
  return values;
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

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function slug(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value) {
  return compact(value)
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|[®™©]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value, baseUrl = LOTUS_BASE_URL) {
  const text = compact(value);
  if (!text || /^data:/i.test(text)) return "";
  try {
    const url = new URL(text.replace(/^\/\//, "https://"), baseUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return text;
  }
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

async function fetchWithRetry(url, { accept = "application/json,text/plain,*/*", retries = 2 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept": accept,
        "Referer": LOTUS_BASE_URL,
      },
    });
    if (response.ok) return response;
    if (response.status === 203) return response;
    lastError = new Error(`${url}: HTTP ${response.status}`);
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === retries) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1));
  }
  throw lastError;
}

async function fetchText(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  return {
    body: await response.text(),
    finalUrl: response.url || url,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  const text = await response.text();
  if (!response.ok || !/^\s*[{[]/.test(text)) {
    return {
      ok: false,
      status: response.status,
      text,
      json: null,
    };
  }
  return {
    ok: true,
    status: response.status,
    text,
    json: JSON.parse(text),
  };
}

function unique(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(compact).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function discoverProductRoutes(bundleText) {
  const routes = [];
  const routePattern = /\/product-view\/(dog|cat)\/[^"'`\\\s]+/g;
  for (const match of bundleText.matchAll(routePattern)) {
    const rawPath = match[0].replace(/#.+$/g, "");
    if (/\/product-view\/(?:dog|cat)\/[^/]+\/?$/i.test(rawPath)) continue;
    const idMatch = rawPath.match(/-(\d+)(?:$|[/?#])/);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);
    if (!Number.isFinite(id) || id <= 0) continue;
    const route = normalizeUrl(rawPath);
    routes.push({
      id,
      route,
      petType: rawPath.match(/^\/product-view\/(dog|cat)\//i)?.[1]?.toLowerCase() || "",
      foodType: rawPath.match(/^\/product-view\/(?:dog|cat)\/([^/]+)\//i)?.[1] || "",
    });
  }

  const byId = new Map();
  for (const route of routes) {
    const current = byId.get(route.id);
    if (!current) {
      byId.set(route.id, route);
      continue;
    }
    const currentScore = /%[0-9a-f]{2}/i.test(current.route) ? 1 : 2;
    const nextScore = /%[0-9a-f]{2}/i.test(route.route) ? 1 : 2;
    if (nextScore > currentScore) byId.set(route.id, route);
  }
  return [...byId.values()].sort((left, right) => left.id - right.id);
}

function cleanProductName(value) {
  return compact(value)
    .replace(/\s*-\s*/g, " ")
    .replace(/\bRaw\s+Foods\b/gi, "Raw Food")
    .replace(/\s+/g, " ");
}

function titleCase(value) {
  return compact(value)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.length <= 3 && /^[A-Z]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function productLineFromRoute(foodType) {
  const normalized = compact(foodType).replace(/-/g, " ").toLowerCase();
  if (normalized === "raw foods") return "Raw Food";
  return titleCase(normalized);
}

function inferPetType(route = {}, productName = "") {
  if (route.petType === "dog" || route.petType === "cat") return route.petType;
  const text = normalizeText(productName);
  const dog = /\b(dog|puppy|canine)\b/.test(text);
  const cat = /\b(cat|kitten|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferFoodForm(route = {}, productName = "") {
  const text = normalizeText(`${route.foodType || ""} ${productName}`);
  if (/\b(raw food|raw foods)\b/.test(text)) return "raw";
  if (/\b(regular bites|small bites|kibble)\b/.test(text)) return "dry";
  if (/\b(juicy|pate|loaf|stew|can|canned)\b/.test(text)) return "wet";
  if (/\btreats?\b/.test(text)) return "treat";
  return "";
}

function inferLifeStage(productName, descriptions = []) {
  const text = normalizeText(`${productName} ${descriptions.join(" ")}`);
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\ball life stages?\b/.test(text)) return "all life stages";
  if (/\badult\b/.test(text)) return "adult";
  return "";
}

function inferFlavor(productName) {
  const normalized = normalizeText(productName);
  const proteins = PROTEIN_TERMS.filter((protein) => normalized.includes(protein));
  if (proteins.length > 0) return titleCase(unique(proteins).join(" "));
  return cleanProductName(productName)
    .replace(/\b(?:dog|cat|regular|small|bites|kibble|raw|food|just|juicy|pate|loaf|stew|adult|puppy|senior)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCompleteFood(productName, route = {}, descriptions = []) {
  const identity = `${productName} ${route.route || ""} ${descriptions.join(" ")}`;
  return !NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identity));
}

function ingredientItems(value) {
  if (Array.isArray(value)) return value.map(compact).filter(Boolean);
  const text = compact(value);
  if (!text) return [];
  return text.split(/[,;]+/).map(compact).filter(Boolean);
}

function frontImageFor(variant) {
  const front = variant?.front || {};
  return normalizeUrl(front.zoom || front.main || front.thumb || "");
}

function imageEvidenceText(variant) {
  try {
    return JSON.stringify(variant || {});
  } catch {
    return "";
  }
}

function numberTokens(value) {
  const text = compact(value);
  const tokens = [];
  for (const match of text.matchAll(/\d+(?:\.\d+)?/g)) {
    const raw = match[0];
    tokens.push(raw);
    tokens.push(raw.replace(".", ""));
    tokens.push(String(Math.round(Number(raw))));
  }
  return unique(tokens);
}

function scoreVariantForPackage(variant, packageSize, fallbackIndex, candidateIndex) {
  const evidence = imageEvidenceText(variant).toLowerCase();
  let score = fallbackIndex === candidateIndex ? 10 : 0;
  for (const token of numberTokens(packageSize)) {
    if (token && evidence.includes(token.toLowerCase())) score += 4;
  }
  if (/\boz\b/i.test(packageSize) && /\boz|ounce/i.test(evidence)) score += 2;
  if (/\blb|lbs|pound/i.test(packageSize) && /\blb|lbs|pound/i.test(evidence)) score += 2;
  return score;
}

function variantsForProduct(additions = {}) {
  const available = SIZE_KEYS
    .map((key, index) => ({ key, index, variant: additions[key] }))
    .filter((row) => frontImageFor(row.variant));
  const sizes = Array.isArray(additions.size) ? additions.size.map(compact).filter(Boolean) : [];
  if (sizes.length === 0) {
    return available.slice(0, 1).map((row) => ({
      packageSize: "",
      imageUrl: frontImageFor(row.variant),
      imageVariantKey: row.key,
    }));
  }

  return sizes.map((packageSize, index) => {
    const fallbackIndex = sizes.length === available.length ? index : Math.min(index, Math.max(available.length - 1, 0));
    const best = [...available].sort((left, right) => (
      scoreVariantForPackage(right.variant, packageSize, fallbackIndex, right.index)
      - scoreVariantForPackage(left.variant, packageSize, fallbackIndex, left.index)
    ))[0];
    return {
      packageSize,
      imageUrl: frontImageFor(best?.variant),
      imageVariantKey: best?.key || "",
    };
  }).filter((row) => row.imageUrl);
}

function nutritionalInfo(product) {
  return {
    as_fed: product.as_fed || {},
    dry_matter: product.dry_matter || {},
    calories: product.calories || {},
    description: Array.isArray(product.description) ? product.description : [],
  };
}

function productRows(product, route) {
  const additions = product.products_additions?.[0] || {};
  const name = cleanProductName(product.name);
  const descriptions = Array.isArray(product.description) ? product.description.map(compact).filter(Boolean) : [];
  const ingredients = ingredientItems(product.ingredients);
  const ingredientStatement = ingredients.join(", ");
  const productLine = productLineFromRoute(route.foodType);
  const completeFood = isCompleteFood(name, route, descriptions);
  const sourceUrl = route.route;
  const rawHash = hashObject({
    product_id: product.product_id,
    source_url: sourceUrl,
    name: product.name,
    ingredients: product.ingredients,
    guaranteed_analysis: product.guaranteed_analysis,
    products_additions: product.products_additions,
  });

  return variantsForProduct(additions).map((variant) => {
    const cacheKey = [
      DEFAULT_SOURCE,
      product.product_id,
      slug(name),
      slug(variant.packageSize || variant.imageVariantKey || "product"),
    ].join(":");
    const contentHash = hashObject({
      cacheKey,
      name,
      packageSize: variant.packageSize,
      ingredientStatement,
      imageUrl: variant.imageUrl,
      sourceUrl,
    });
    return {
      cache_key: cacheKey,
      gtin: "",
      product_name: name,
      brand: DEFAULT_BRAND,
      product_line: productLine,
      flavor: inferFlavor(name),
      life_stage: inferLifeStage(name, descriptions),
      food_form: inferFoodForm(route, name),
      package_size: variant.packageSize,
      pet_type: inferPetType(route, name),
      ingredient_statement: ingredientStatement,
      product_image_url: variant.imageUrl,
      product_url: sourceUrl,
      is_complete_food: completeFood ? "true" : "false",
      guaranteed_analysis: JSON.stringify(product.guaranteed_analysis || {}),
      nutritional_info: JSON.stringify(nutritionalInfo(product)),
      source_quality: "manufacturer",
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      ingredient_source_url: sourceUrl,
      image_source_url: sourceUrl,
      raw_source_hash: rawHash,
      content_hash: contentHash,
      extractor_version: "lotus-official-api-v1",
    };
  });
}

function printCsv(rows) {
  return [
    CSV_HEADERS.join(","),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n") + "\n";
}

function feedSummary(rows) {
  return {
    rows: rows.length,
    complete_food_rows: rows.filter((row) => row.is_complete_food === "true").length,
    non_complete_rows: rows.filter((row) => row.is_complete_food === "false").length,
    rows_with_ingredients: rows.filter((row) => compact(row.ingredient_statement)).length,
    rows_with_images: rows.filter((row) => compact(row.product_image_url)).length,
    rows_with_package_size: rows.filter((row) => compact(row.package_size)).length,
  };
}

function runNode(script, args, { timeoutMs = 120_000 } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    throw new Error([
      `${script} failed with status ${result.status}`,
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
  const maxProducts = positiveInteger(getArg("--max-products"), DEFAULT_MAX_PRODUCTS);
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), DEFAULT_FETCH_DELAY_MS);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const requestedIds = getArgs("--id").map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
  const allowPartialPages = hasArg("--allow-partial-pages");

  fs.mkdirSync(outputDir, { recursive: true });
  const rawDir = path.join(outputDir, "raw");
  fs.mkdirSync(rawDir, { recursive: true });
  const urlListPath = path.join(outputDir, "urls.txt");
  const feedPath = path.join(outputDir, "feed.csv");
  const sqlDir = path.join(outputDir, "sql");
  const reportPath = path.join(outputDir, "report.json");

  const bundle = await fetchText(LOTUS_APP_BUNDLE_URL, { accept: "application/javascript,text/javascript,*/*" });
  fs.writeFileSync(path.join(rawDir, "main.chunk.js"), bundle.body, "utf8");
  const discoveredRoutes = discoverProductRoutes(bundle.body);
  const routes = requestedIds.length > 0
    ? requestedIds.map((id) => discoveredRoutes.find((route) => route.id === id) || {
      id,
      route: normalizeUrl(`/product-view/product/product/product-${id}`),
      petType: "",
      foodType: "",
    })
    : discoveredRoutes.slice(0, maxProducts);
  fs.writeFileSync(urlListPath, `${routes.map((route) => route.route).join("\n")}\n`, "utf8");

  const rows = [];
  const warnings = [];
  const skippedProducts = [];
  for (const [index, route] of routes.entries()) {
    try {
      if (index > 0) await sleep(fetchDelayMs);
      const url = new URL(LOTUS_PRODUCT_INFO_URL);
      url.searchParams.set("type", "product_id");
      url.searchParams.set("value", String(route.id));
      const result = await fetchJson(url.toString());
      if (!result.ok || !result.json?.product_id) {
        skippedProducts.push({ id: route.id, route: route.route, status: result.status, reason: compact(result.text).slice(0, 160) });
        continue;
      }
      fs.writeFileSync(path.join(rawDir, `product-${route.id}.json`), `${JSON.stringify(result.json, null, 2)}\n`, "utf8");
      rows.push(...productRows(result.json, route));
    } catch (error) {
      if (!allowPartialPages) throw error;
      warnings.push(`${route.route}: ${error.message || error}`);
    }
  }

  fs.writeFileSync(feedPath, printCsv(rows), "utf8");

  const importArgs = [
    "--file", feedPath,
    "--source", DEFAULT_SOURCE,
    "--source-quality", "manufacturer",
    "--ingredient-verification", "manufacturer",
    "--image-verification", "manufacturer",
    "--expected-brand", DEFAULT_BRAND,
    "--required-source-url-pattern", "^https://www\\.lotuspetfoods\\.com/product-view/",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
    "--emit-skip-details",
  ];
  const importResult = runNode(OFFICIAL_FEED_IMPORT_SCRIPT, importArgs);

  const report = {
    generated_at: new Date().toISOString(),
    brand: DEFAULT_BRAND,
    source: DEFAULT_SOURCE,
    source_quality: "manufacturer",
    ingredient_verification: "manufacturer",
    image_verification: "manufacturer",
    bundle_url: LOTUS_APP_BUNDLE_URL,
    product_info_url: LOTUS_PRODUCT_INFO_URL,
    raw_dir: rawDir,
    url_list_path: urlListPath,
    feed_path: feedPath,
    sql_dir: sqlDir,
    max_products: maxProducts,
    fetch_delay_ms: fetchDelayMs,
    allow_partial_pages: allowPartialPages,
    discovered_routes: discoveredRoutes.length,
    requested_routes: routes.length,
    skipped_products: skippedProducts,
    feed: feedSummary(rows),
    warnings,
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Lotus source import batch prepared: ${DEFAULT_SOURCE}`);
  console.log(`Product URLs: ${urlListPath}`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Rows: ${report.feed.rows} (${report.feed.complete_food_rows} complete, ${report.feed.non_complete_rows} non-complete)`);
  if (skippedProducts.length > 0) console.log(`Skipped products: ${skippedProducts.length}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
