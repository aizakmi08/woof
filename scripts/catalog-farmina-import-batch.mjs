import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/farmina-pet-foods";
const DEFAULT_SOURCE = "farmina-pet-foods";
const DEFAULT_BRAND = "Farmina";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 350;
const DEFAULT_FETCH_RETRIES = 3;
const DEFAULT_MAX_PRODUCTS = 400;
const FARMINA_BASE_URL = "https://www.farmina.com";
const AJAX_PRODUCTS_URL = "https://www.farmina.com/a_prodotti_eshop.php";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 WoofCatalogVerifier/1.0";
const DEFAULT_CATEGORY_URLS = [
  "https://www.farmina.com/us/eshop-d-Dog-food.html",
  "https://www.farmina.com/us/eshop-c-Cat-food.html",
];
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
  "source_quality",
  "ingredient_verification_status",
  "image_verification_status",
];
const NON_COMPLETE_FOOD_IDENTITY_PATTERNS = [
  /\b(treat|treats|snack|snacks|chew|chews|jerky|biscuit|biscuits|dental)\b/i,
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|enhancer|enhancers)\b/i,
  /\b(broth|supplement|supplements|complement|complementary|vitamin pack|probiotic)\b/i,
  /\b(bundle|sampler|sample pack|starter kit|trial pack|variety pack)\b/i,
  /\b(toy|bowl|scoop|leash|collar|blanket|merch|gift card)\b/i,
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

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&ndash;|&#8211;|&#x2013;/gi, "-")
    .replace(/&mdash;|&#8212;|&#x2014;/gi, "-")
    .replace(/&rsquo;|&#8217;|&#x2019;/gi, "'")
    .replace(/&ldquo;|&#8220;|&#x201C;/gi, "\"")
    .replace(/&rdquo;|&#8221;|&#x201D;/gi, "\"")
    .replace(/&trade;/gi, "")
    .replace(/&reg;/gi, "")
    .replace(/&copy;/gi, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function stripTags(html) {
  return decodeEntities(String(html || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|td|th|section|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function normalizeText(value) {
  return compact(decodeEntities(value))
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|[®™©]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGtin(value) {
  const digits = compact(value).replace(/[^0-9]/g, "");
  return digits.length >= 8 ? digits : "";
}

function normalizeUrl(value, baseUrl = FARMINA_BASE_URL) {
  const text = compact(decodeEntities(value));
  if (!text || /^data:/i.test(text)) return "";
  try {
    const url = new URL(text.replace(/^\/\//, "https://"), baseUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return text;
  }
}

function slug(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchWithRetry(url, {
  method = "GET",
  body = null,
  accept = "text/html,application/xhtml+xml",
  referer = "",
  retries = DEFAULT_FETCH_RETRIES,
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const headers = {
      "User-Agent": BROWSER_USER_AGENT,
      "Accept": accept,
    };
    if (referer) headers.Referer = referer;
    if (method === "POST") {
      headers.Origin = FARMINA_BASE_URL;
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
      headers["X-Requested-With"] = "XMLHttpRequest";
    }

    const response = await fetch(url, { method, headers, body });
    if (response.ok) return response;

    lastError = new Error(`${url}: HTTP ${response.status}`);
    if (response.status !== 429 || attempt === retries) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1));
  }
  throw lastError;
}

async function fetchText(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  return {
    body: await response.text(),
    finalUrl: response.url || url,
  };
}

function htmlLinks(html, baseUrl) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map(([, href]) => normalizeUrl(href, baseUrl))
    .filter(Boolean);
}

function lineUrlsFromCategory(html, baseUrl) {
  return htmlLinks(html, baseUrl)
    .filter((url) => /\/us\/eshop-dog\/Dog-food\/[^?#]+\.html$/i.test(url)
      || /\/us\/eshop-cat\/Cat-food\/[^?#]+\.html$/i.test(url));
}

function productUrlsFromListing(html, baseUrl) {
  return htmlLinks(html, baseUrl)
    .filter((url) => /^https:\/\/www\.farmina\.com\/us\/eshop\/(?:dog|cat)-food\/[^?#]+\.html$/i.test(url));
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

function hiddenInputValue(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<input\\b(?=[^>]*\\bname=["']${escaped}["'])[^>]*\\bvalue=["']([^"']*)["'][^>]*>`, "i"));
  return compact(decodeEntities(match?.[1] || ""));
}

function lineContext(html, url) {
  const idpagina = hiddenInputValue(html, "idpagina");
  const idlingua = hiddenInputValue(html, "idlingua");
  const idlinea = hiddenInputValue(html, "idlinea");
  const specie = hiddenInputValue(html, "specie") || (/\/eshop-cat\//i.test(url) ? "c" : "d");
  if (!idpagina || !idlingua || !idlinea || !specie) {
    throw new Error(`${url}: missing Farmina line form context`);
  }
  return { idpagina, idlingua, idlinea, specie };
}

async function fetchProductListingForLine(lineUrl, html) {
  const context = lineContext(html, lineUrl);
  const params = new URLSearchParams({
    prima: "si",
    idpagina: context.idpagina,
    idlingua: context.idlingua,
    idlinea: context.idlinea,
    specie: context.specie,
  });
  const response = await fetchText(AJAX_PRODUCTS_URL, {
    method: "POST",
    body: params.toString(),
    referer: lineUrl,
  });
  return response.body;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function allJsonLdNodes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(allJsonLdNodes);
  if (typeof value !== "object") return [];

  const children = [];
  if (Array.isArray(value["@graph"])) children.push(...value["@graph"].flatMap(allJsonLdNodes));
  if (value.mainEntity) children.push(...allJsonLdNodes(value.mainEntity));
  if (Array.isArray(value.itemListElement)) children.push(...value.itemListElement.flatMap((item) => allJsonLdNodes(item.item || item)));
  return [value, ...children];
}

function typeIncludes(node, expected) {
  const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
  return types.some((type) => String(type || "").toLowerCase() === expected.toLowerCase());
}

function productJsonLd(html) {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, block] of blocks) {
    const parsed = parseJsonSafe(decodeEntities(block));
    const product = allJsonLdNodes(parsed).find((node) => typeIncludes(node, "Product"));
    if (product) return product;
  }
  return {};
}

function titleText(html) {
  const title = html.match(/<h1\b[^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || "";
  return cleanProductName(stripTags(title));
}

function pageTitle(html) {
  return cleanProductName(stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
}

function cleanProductName(value) {
  return compact(decodeEntities(value))
    .replace(/[®™©]/g, "")
    .replace(/\s+-\s+Farmina Pet Foods$/i, "")
    .replace(/\s+/g, " ");
}

function productLineFromPage(html, productUrl) {
  const parts = pageTitle(html).split(/\s+-\s+/).map(compact).filter(Boolean);
  if (parts.length >= 4 && /^Farmina Pet Foods$/i.test(parts[0])) {
    return cleanProductName(parts.slice(2, -1).join(" - "));
  }

  const match = productUrl.match(/\/(?:dog|cat)-food\/([^/]+)\//i);
  if (!match) return "";
  return match[1]
    .split(/[-_]+/)
    .map((word) => word.toLowerCase() === "n&d" ? "N&D" : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function farminaLabeledParagraph(html, labels) {
  const pattern = /<span\b[^>]*class=["'][^"']*\btitoletto\b[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<p\b[^>]*class=["'][^"']*\bcomp\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  for (const match of html.matchAll(pattern)) {
    const [, labelHtml, paragraphHtml] = match;
    const label = normalizeText(stripTags(labelHtml));
    if (!labels.some((expected) => label === normalizeText(expected))) continue;
    return compact(stripTags(paragraphHtml));
  }
  return "";
}

function cleanFarminaIngredientStatement(value) {
  return compact(value)
    .replace(/\s*\bGuaranteed\s+Analysis\b\s*:?\s*[\s\S]*$/i, "")
    .replace(/\s*\bCalorie\s+Content\b\s*:?\s*[\s\S]*$/i, "");
}

function ingredientStatement(html) {
  const text = cleanFarminaIngredientStatement(farminaLabeledParagraph(html, ["ingredients"]));
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 5) return "";
  if (items.some((item) => item.length > 180)) return "";
  return text;
}

function guaranteedAnalysis(html) {
  return farminaLabeledParagraph(html, ["guaranteed analysis", "analysis"]);
}

function productImage(html, product = {}) {
  const image = Array.isArray(product.image) ? product.image[0] : product.image;
  return normalizeUrl(
    image
      || html.match(/<div\b[^>]*class=["'][^"']*\bimg50\b[^"']*["'][^>]*>\s*<img\b[^>]*src=["']([^"']+)["']/i)?.[1]
      || html.match(/<img\b[^>]*src=["']([^"']*\/fotoprodotti\/[^"']+)["'][^>]*alt=["'][^"']+["']/i)?.[1],
    FARMINA_BASE_URL
  );
}

function packageVariants(html, product = {}) {
  const rows = [];
  const radioPattern = /<input\b(?=[^>]*\bdata-sku=["']([^"']*)["'])(?=[^>]*\bdata-gtin=["']([^"']*)["'])[^>]*>\s*<label\b[^>]*>([\s\S]*?)<\/label>/gi;
  for (const match of html.matchAll(radioPattern)) {
    const [, sku, gtin, labelHtml] = match;
    rows.push({
      sku: compact(sku),
      gtin: normalizeGtin(gtin),
      package_size: compact(stripTags(labelHtml)),
    });
  }

  const offers = Array.isArray(product.offers) ? product.offers : (product.offers ? [product.offers] : []);
  for (const offer of offers) {
    const gtin = normalizeGtin(offer?.gtin13 || offer?.gtin12 || offer?.gtin14 || offer?.gtin || "");
    const sku = compact(offer?.sku);
    if (!gtin && !sku) continue;
    rows.push({ sku, gtin, package_size: "" });
  }

  const byKey = new Map();
  for (const row of rows) {
    const key = row.gtin || row.sku || normalizeText(row.package_size);
    const existing = byKey.get(key);
    if (!existing || (!existing.package_size && row.package_size)) byKey.set(key, row);
  }
  return [...byKey.values()].filter((row) => row.gtin || row.package_size || row.sku);
}

function inferPetType(productUrl, productName) {
  const text = `${productUrl} ${productName}`.toLowerCase();
  const dog = /\b(dog|puppy|canine)\b/.test(text);
  const cat = /\b(cat|kitten|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferLifeStage(productName, html) {
  const text = normalizeText(`${productName} ${html.match(/AAFCO\s+(?:Dog|Cat)\s+Food\s+Nutrient\s+Profiles[^.<]+/i)?.[0] || ""}`);
  if (/\bpuppy|puppies|baby|starter\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  if (/\ball life stages\b/.test(text)) return "all life stages";
  return "";
}

function inferFoodForm(productName, productUrl) {
  const text = normalizeText(`${productName} ${productUrl}`);
  if (/\bfreeze dried\b/.test(text)) return "freeze-dried";
  if (/\bdehydrated\b/.test(text)) return "dehydrated";
  if (/\bfrozen\b/.test(text)) return "frozen";
  if (/\b(wet|can|canned|pate|stew|gravy|morsel|chunk|shred)\b/.test(text)) return "wet";
  if (/\b(dry|kibble)\b/.test(text)) return "dry";
  if (NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(productName))) return "";
  return "dry";
}

function inferFlavor(productName, productLine) {
  let text = cleanProductName(productName);
  if (productLine) {
    text = text.replace(new RegExp(`^${productLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "");
  }
  return compact(text
    .replace(/\b(?:adult|puppy|kitten|senior|mini|medium|maxi|giant|large breed|small breed|canine formula|feline formula|wet food|dry food)\b/gi, " ")
    .replace(/\s+&\s+$/g, "")
    .replace(/\s{2,}/g, " "));
}

function isCompleteFood(productName, productUrl) {
  const identity = `${productName} ${productUrl}`;
  return !NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identity));
}

function productRowsFromDetail(html, productUrl) {
  const product = productJsonLd(html);
  const detailTitle = titleText(html) || cleanProductName(product.name);
  const productLine = productLineFromPage(html, productUrl);
  const productName = cleanProductName(detailTitle.startsWith(productLine)
    ? detailTitle
    : `${productLine} ${detailTitle}`);
  const ingredients = ingredientStatement(html);
  const imageUrl = productImage(html, product);
  const completeFood = isCompleteFood(productName, productUrl);
  const variants = packageVariants(html, product);
  const variantRows = variants.length > 0 ? variants : [{ sku: "", gtin: "", package_size: "" }];

  return variantRows.map((variant) => ({
    cache_key: `farmina:${variant.gtin || variant.sku || slug(productUrl)}:${slug(variant.package_size) || "product"}`,
    gtin: variant.gtin,
    product_name: productName,
    brand: DEFAULT_BRAND,
    product_line: productLine,
    flavor: inferFlavor(productName, productLine),
    life_stage: inferLifeStage(productName, html),
    food_form: inferFoodForm(productName, productUrl),
    package_size: variant.package_size,
    pet_type: inferPetType(productUrl, productName),
    ingredient_statement: ingredients,
    product_image_url: imageUrl,
    product_url: productUrl,
    is_complete_food: completeFood ? "true" : "false",
    guaranteed_analysis: guaranteedAnalysis(html),
    source_quality: "manufacturer",
    ingredient_verification_status: "manufacturer",
    image_verification_status: "manufacturer",
  }));
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
    rows_with_gtin: rows.filter((row) => compact(row.gtin)).length,
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
  const allowPartialPages = hasArg("--allow-partial-pages");
  const categoryUrls = getArgs("--category-url");
  const lineUrlArgs = getArgs("--line-url");
  const targetCategoryUrls = categoryUrls.length > 0 ? categoryUrls : DEFAULT_CATEGORY_URLS;

  fs.mkdirSync(outputDir, { recursive: true });
  const lineUrlsPath = path.join(outputDir, "line-urls.txt");
  const urlListPath = path.join(outputDir, "urls.txt");
  const feedPath = path.join(outputDir, "feed.csv");
  const sqlDir = path.join(outputDir, "sql");
  const reportPath = path.join(outputDir, "report.json");

  const lineUrls = [...lineUrlArgs];
  for (const categoryUrl of targetCategoryUrls) {
    const { body, finalUrl } = await fetchText(categoryUrl);
    lineUrls.push(...lineUrlsFromCategory(body, finalUrl));
    await sleep(fetchDelayMs);
  }
  const uniqueLineUrls = unique(lineUrls);
  fs.writeFileSync(lineUrlsPath, `${uniqueLineUrls.join("\n")}\n`, "utf8");

  const productUrls = [];
  const lineWarnings = [];
  for (const [index, lineUrl] of uniqueLineUrls.entries()) {
    try {
      if (index > 0) await sleep(fetchDelayMs);
      const { body: lineHtml, finalUrl } = await fetchText(lineUrl);
      const listingHtml = await fetchProductListingForLine(finalUrl, lineHtml);
      productUrls.push(...productUrlsFromListing(listingHtml, finalUrl));
    } catch (error) {
      if (!allowPartialPages) throw error;
      lineWarnings.push(`${lineUrl}: ${error.message || error}`);
    }
  }

  const uniqueProductUrls = unique(productUrls).slice(0, maxProducts);
  fs.writeFileSync(urlListPath, `${uniqueProductUrls.join("\n")}\n`, "utf8");

  const rows = [];
  const detailWarnings = [];
  for (const [index, productUrl] of uniqueProductUrls.entries()) {
    try {
      if (index > 0) await sleep(fetchDelayMs);
      const { body: productHtml, finalUrl } = await fetchText(productUrl);
      rows.push(...productRowsFromDetail(productHtml, finalUrl));
    } catch (error) {
      if (!allowPartialPages) throw error;
      detailWarnings.push(`${productUrl}: ${error.message || error}`);
    }
  }

  fs.writeFileSync(feedPath, printCsv(rows), "utf8");

  const importArgs = [
    "--file", feedPath,
    "--source", DEFAULT_SOURCE,
    "--source-quality", "manufacturer",
    "--ingredient-verification", "manufacturer",
    "--image-verification", "manufacturer",
    "--expected-brand", "Farmina",
    "--expected-brand", "Farmina Pet Foods",
    "--expected-brand", "N&D",
    "--expected-brand", "Natural & Delicious",
    "--required-source-url-pattern", "^https://www\\.farmina\\.com/us/eshop/(dog|cat)-food/",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
  ];
  const importResult = runNode(OFFICIAL_FEED_IMPORT_SCRIPT, importArgs);

  const report = {
    generated_at: new Date().toISOString(),
    brand: DEFAULT_BRAND,
    source: DEFAULT_SOURCE,
    source_quality: "manufacturer",
    ingredient_verification: "manufacturer",
    image_verification: "manufacturer",
    target_category_urls: targetCategoryUrls,
    line_urls_path: lineUrlsPath,
    url_list_path: urlListPath,
    feed_path: feedPath,
    sql_dir: sqlDir,
    max_products: maxProducts,
    fetch_delay_ms: fetchDelayMs,
    allow_partial_pages: allowPartialPages,
    discovered_line_urls: uniqueLineUrls.length,
    discovered_product_urls: unique(productUrls).length,
    prepared_product_urls: uniqueProductUrls.length,
    feed: feedSummary(rows),
    line_warnings: lineWarnings,
    detail_warnings: detailWarnings,
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Farmina source import batch prepared: ${DEFAULT_SOURCE}`);
  console.log(`Line URLs: ${lineUrlsPath}`);
  console.log(`Product URLs: ${urlListPath}`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Rows: ${report.feed.rows} (${report.feed.complete_food_rows} complete, ${report.feed.non_complete_rows} non-complete, ${report.feed.rows_with_gtin} GTIN rows)`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
