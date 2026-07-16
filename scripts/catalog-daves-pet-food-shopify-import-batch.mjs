import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_PRODUCTS_API_URL = "https://davespetfood.com/products.json?limit=250";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/daves-pet-food";
const DEFAULT_SOURCE = "daves-pet-food";
const DEFAULT_BRAND = "Dave's Pet Food";
const DEFAULT_BASE_URL = "https://davespetfood.com/";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_MAX_PAGES = 5;
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
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|meal mixer|enhancer|enhancers)\b/i,
  /\b(bone broth|broth topper|broth toppers|stock|gravy topper|sauce topper)\b/i,
  /\b(puree|purees|bisque|bisques|lickable|lickables)\b/i,
  /\b(supplement|supplements|complement|complementary|vitamin|probiotic|kidney support)\b/i,
  /\b(variety pack|variety packs|bundle|bundles|sampler|samplers|sample pack|multipack|multi pack)\b/i,
  /\b(gift card|bowl|toy|apparel|merch)\b/i,
];
const INGREDIENT_REJECT_PATTERNS = /\b(?:add to cart|shop now|feeding directions|feed at room temperature|customer reviews|subscribe|mission is to provide|key benefits|guaranteed analysis|every juicy|juicy bite|loaded with wholesome|look and feel|furbaby|fur baby|free from artificial|anything artificial|with no grains|even kitties|healthy muscles|lustrous coat)\b/i;
const PROTEIN_TERMS = [
  "beef",
  "chicken",
  "duck",
  "fish",
  "lamb",
  "salmon",
  "tuna",
  "turkey",
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
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

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
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
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGtin(value) {
  const digits = compact(value).replace(/[^0-9]/g, "");
  return digits.length >= 8 ? digits : "";
}

function normalizeUrl(value, baseUrl = DEFAULT_BASE_URL) {
  const text = compact(value);
  if (!text || /^data:/i.test(text)) return "";
  try {
    return new URL(text.replace(/^\/\//, "https://"), baseUrl).toString();
  } catch {
    return text;
  }
}

function productTags(product) {
  if (Array.isArray(product.tags)) return product.tags.map(compact).filter(Boolean);
  return String(product.tags || "")
    .split(",")
    .map(compact)
    .filter(Boolean);
}

function productType(product) {
  return compact(product.product_type || product.type);
}

function productUrl(product) {
  return normalizeUrl(product.url || `/products/${product.handle}`, DEFAULT_BASE_URL).replace(/\.js$/i, "");
}

function productIdentity(product) {
  return [
    product.title,
    product.handle,
    productType(product),
    product.vendor,
    productTags(product).join(" "),
  ].join(" ");
}

function isFoodCandidate(product) {
  const text = normalizeText(productIdentity(product));
  const foodType = /\b(cat food|dog food|wet cat|wet dog|dry cat|dry dog|canned|pate|pat |stew|recipe)\b/.test(text);
  if (!foodType) return false;
  return !NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(productIdentity(product)));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WoofCatalogVerifier/1.0 (Dave's Pet Food official Shopify import)",
      "Accept": "application/json",
    },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function productsApiPageUrl(productsApiUrl, page) {
  const url = new URL(productsApiUrl);
  if (!url.searchParams.has("limit")) url.searchParams.set("limit", "250");
  url.searchParams.set("page", String(page));
  return url.toString();
}

async function fetchProducts(productsApiUrl, { maxProducts, maxPages }) {
  const products = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = productsApiPageUrl(productsApiUrl, page);
    const payload = await fetchJson(pageUrl);
    const pageProducts = Array.isArray(payload.products) ? payload.products : [];
    products.push(...pageProducts);
    if (pageProducts.length < Number(new URL(pageUrl).searchParams.get("limit") || 250)) break;
    if (products.length >= maxProducts) break;
  }
  return products.slice(0, maxProducts);
}

function cleanIngredientText(value) {
  return compact(value)
    .replace(/^ingredients?\s*:?\s*/i, "")
    .replace(/^made in [a-z\s]+\/\s*/i, "")
    .replace(/\s+\b(?:guaranteed analysis|feeding directions|feed at room temperature|key benefits)\b[\s\S]*$/i, "")
    .replace(/\s{2,}/g, " ");
}

function isPlausibleIngredientStatement(value) {
  const text = cleanIngredientText(value);
  if (text.length < 40) return false;
  if (/^[.\s]+/.test(text)) return false;
  if (INGREDIENT_REJECT_PATTERNS.test(text)) return false;
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 8) return false;
  return items.every((item) => item.length <= 220);
}

function paragraphTexts(html) {
  const blocks = [...String(html || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, paragraph]) => compact(stripTags(paragraph)))
    .filter(Boolean);
  return blocks.length > 0 ? blocks : [compact(stripTags(html))].filter(Boolean);
}

function extractIngredients(product) {
  const paragraphs = paragraphTexts(product.body_html);
  for (const paragraph of paragraphs) {
    const ingredientMatch = paragraph.match(/\bingredients?\s*:?\s*([\s\S]+)$/i);
    if (ingredientMatch?.[1] && isPlausibleIngredientStatement(ingredientMatch[1])) {
      return cleanIngredientText(ingredientMatch[1]);
    }

    const madeInMatch = paragraph.match(/\bmade in [a-z\s]+\/\s*([\s\S]+)$/i);
    if (madeInMatch?.[1] && isPlausibleIngredientStatement(madeInMatch[1])) {
      return cleanIngredientText(madeInMatch[1]);
    }
  }
  return "";
}

function inferPetType(product) {
  const text = normalizeText(productIdentity(product));
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferLifeStage(product) {
  const text = normalizeText(productIdentity(product));
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  if (/\ball life stages\b/.test(text) || /\baafco\b/.test(text)) return "all life stages";
  return "";
}

function inferFoodForm(product, variant = null, packageSize = "") {
  const text = normalizeText([
    productIdentity(product),
    variant?.title,
    variant?.option1,
    variant?.option2,
    packageSize,
  ].join(" "));
  if (/\bdry|kibble\b/.test(text)) return "dry";
  if (/\bwet|can|canned|pate|pat |stew|gravy|aspic|sauce\b/.test(text)) return "wet";
  return "";
}

function inferFlavor(product) {
  const title = compact(product.title).replace(/\s+\/\s*[\s\S]+$/g, "");
  const proteins = PROTEIN_TERMS.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(title));
  return proteins.length > 0
    ? proteins.map((term) => term.replace(/\b\w/g, (letter) => letter.toUpperCase())).join(" + ")
    : "";
}

function inferProductLine(product) {
  const title = compact(product.title).replace(/\s+\/\s*[\s\S]+$/g, "");
  if (/naturally healthy/i.test(title)) return "Naturally Healthy";
  if (/restricted diet/i.test(title)) return "Restricted Diet";
  if (/95%/i.test(title)) return "95% Meat";
  return productType(product);
}

function variantPackageSize(product, variant) {
  return compact(variant?.option1 || variant?.title || product.title.match(/\b\d+(?:\.\d+)?\s*(?:oz|lb|lbs|can|cans)\b/i)?.[0] || "");
}

function imageForProduct(product) {
  const image = product.image?.src || product.featured_image || product.images?.[0]?.src || product.images?.[0];
  return normalizeUrl(typeof image === "string" ? image : image?.src);
}

function rowsForProduct(product, ingredients) {
  const variants = Array.isArray(product.variants) && product.variants.length > 0
    ? product.variants
    : [{ id: product.id, title: "", sku: "" }];
  const url = productUrl(product);
  const petType = inferPetType(product);
  const imageUrl = imageForProduct(product);
  const line = inferProductLine(product);
  const flavor = inferFlavor(product);

  return variants.map((variant) => {
    const gtin = normalizeGtin(variant.sku || variant.barcode);
    const packageSize = variantPackageSize(product, variant);
    return {
      cache_key: gtin ? `${DEFAULT_SOURCE}:${gtin}` : `${DEFAULT_SOURCE}:${product.handle}:${packageSize.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      gtin,
      product_name: compact(product.title),
      brand: DEFAULT_BRAND,
      product_line: line,
      flavor,
      life_stage: inferLifeStage(product),
      food_form: inferFoodForm(product, variant, packageSize),
      package_size: packageSize,
      pet_type: petType,
      ingredient_statement: ingredients,
      product_image_url: imageUrl,
      product_url: variant?.id ? `${url}?variant=${variant.id}` : url,
      is_complete_food: "true",
      guaranteed_analysis: "",
      source_quality: "manufacturer",
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
    };
  });
}

function writeCsv(filePath, rows) {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function runNode(script, args, timeoutMs) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    if (result.error?.code === "ETIMEDOUT" || result.signal) {
      throw new Error(`${script} timed out after ${timeoutMs}ms`);
    }
    throw new Error([`${script} failed with status ${result.status}`, result.stderr, result.stdout].filter(Boolean).join("\n"));
  }
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = compact(row[key]) || "unknown";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function summarizeRows(rows) {
  return {
    rows: rows.length,
    complete_food_rows: rows.filter((row) => row.is_complete_food === "true").length,
    rows_with_gtin: rows.filter((row) => normalizeGtin(row.gtin)).length,
    rows_with_ingredients: rows.filter((row) => compact(row.ingredient_statement)).length,
    rows_with_images: rows.filter((row) => compact(row.product_image_url)).length,
    dog_rows: rows.filter((row) => row.pet_type === "dog").length,
    cat_rows: rows.filter((row) => row.pet_type === "cat").length,
    by_food_form: countBy(rows, "food_form"),
  };
}

async function main() {
  const productsApiUrl = getArg("--products-api-url", DEFAULT_PRODUCTS_API_URL);
  const outputDir = getArg("--output-dir", DEFAULT_OUTPUT_DIR);
  const maxProducts = positiveInteger(getArg("--max-products"), 250);
  const maxPages = positiveInteger(getArg("--max-pages"), DEFAULT_MAX_PAGES);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const importTimeoutMs = positiveInteger(getArg("--import-timeout-ms"), 60_000);

  fs.mkdirSync(outputDir, { recursive: true });
  const feedPath = path.join(outputDir, "feed.csv");
  const rawProductsPath = path.join(outputDir, "products.json");
  const urlsPath = path.join(outputDir, "urls.txt");
  const reportPath = path.join(outputDir, "report.json");
  const sqlDir = path.join(outputDir, "sql");

  const products = await fetchProducts(productsApiUrl, { maxProducts, maxPages });
  fs.writeFileSync(rawProductsPath, `${JSON.stringify({ products }, null, 2)}\n`, "utf8");

  const rows = [];
  const skippedProducts = [];
  for (const product of products) {
    if (!isFoodCandidate(product)) {
      skippedProducts.push({ product_name: compact(product.title), handle: compact(product.handle), reason: "not_complete_food_candidate" });
      continue;
    }

    const ingredients = extractIngredients(product);
    if (!ingredients) {
      skippedProducts.push({ product_name: compact(product.title), handle: compact(product.handle), reason: "missing_ingredients" });
      continue;
    }

    const productRows = rowsForProduct(product, ingredients);
    if (productRows.some((row) => !row.pet_type || !row.product_image_url)) {
      skippedProducts.push({ product_name: compact(product.title), handle: compact(product.handle), reason: "missing_pet_type_or_image" });
      continue;
    }
    rows.push(...productRows);
  }

  writeCsv(feedPath, rows);
  fs.writeFileSync(urlsPath, `${[...new Set(rows.map((row) => row.product_url.replace(/\?variant=.*/g, "")))].join("\n")}\n`, "utf8");

  const importResult = runNode(OFFICIAL_FEED_IMPORT_SCRIPT, [
    "--file", feedPath,
    "--source", DEFAULT_SOURCE,
    "--source-quality", "manufacturer",
    "--ingredient-verification", "manufacturer",
    "--image-verification", "manufacturer",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
    "--expected-brand", DEFAULT_BRAND,
    "--expected-brand-alias", "Daves Pet Food",
    "--expected-brand-alias", "Dave's",
  ], importTimeoutMs);

  const report = {
    generated_at: new Date().toISOString(),
    brand: DEFAULT_BRAND,
    source: DEFAULT_SOURCE,
    products_api_url: productsApiUrl,
    max_products: maxProducts,
    max_pages: maxPages,
    discovered_products: products.length,
    raw_products_path: rawProductsPath,
    feed_path: feedPath,
    url_list_path: urlsPath,
    sql_dir: sqlDir,
    product_types: products.reduce((counts, product) => {
      const key = productType(product) || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
    feed: summarizeRows(rows),
    skipped_products: skippedProducts,
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Dave's Pet Food import prepared: ${rows.length} feed row(s) from ${products.length} official product(s)`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
