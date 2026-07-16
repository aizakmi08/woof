import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_PRODUCTS_API_URL = "https://iandloveandyou.com/products.json?limit=250";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/i-and-love-and-you";
const DEFAULT_SOURCE = "i-and-love-and-you";
const DEFAULT_BRAND = "I AND LOVE AND YOU";
const DEFAULT_BASE_URL = "https://iandloveandyou.com/";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 250;
const DEFAULT_FETCH_RETRIES = 3;
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
const FOOD_PRODUCT_TYPES = new Set([
  "cat canned",
  "dog canned",
  "dry cat",
  "dry dog",
  "raw dog",
]);
const NON_COMPLETE_FOOD_IDENTITY_PATTERNS = [
  /\b(variety\s+pack|sampler|starter\s+kit|bundle|assorted|assortment|multipack|mixed\s+pack)\b/i,
  /\b(treat|treats|snack|snacks|chew|chews|jerky|biscuit|biscuits|dental)\b/i,
  /\b(topper|toppers|meal\s+topper|food\s+topper|mixer|mixers|meal\s+mixer|meal\s+enhancer|enhancer|enhancers)\b/i,
  /\b(bone\s+broth|broth|stock|gravy|sauce)\b/i,
  /\b(puree|purees|puree|purees|bisque|bisques|lickable|lickables)\b/i,
  /\b(supplement|supplements|complement|complementary|vitamin|probiotic)\b/i,
  /\b(gift\s+card|bowl|merch|toy|apparel)\b/i,
];
const INGREDIENT_REJECT_PATTERNS = /\b(?:where to buy|feeding guide|directions|featured ingredients|real ingredients|real recipes|nutritional facts|nutritional info|customer reviews|more products|shop now|learn more|add to cart|subscribe)\b/i;
const PROTEIN_TERMS = [
  "chicken",
  "turkey",
  "duck",
  "beef",
  "bison",
  "lamb",
  "salmon",
  "trout",
  "whitefish",
  "tuna",
  "sardine",
  "mackerel",
  "fish",
  "poultry",
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
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&frac14;/gi, "1/4")
    .replace(/&frac12;/gi, "1/2")
    .replace(/&frac34;/gi, "3/4")
    .replace(/&hellip;|&#8230;/gi, "...")
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

function textFromHtml(value) {
  return compact(stripTags(value));
}

function normalizeText(value) {
  return compact(decodeEntities(value))
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|[^\x00-\x7F]|[®™©]/g, " ")
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

function productType(product) {
  return compact(product.product_type || product.type);
}

function productTags(product) {
  if (Array.isArray(product.tags)) return product.tags.map(compact).filter(Boolean);
  return String(product.tags || "")
    .split(",")
    .map(compact)
    .filter(Boolean);
}

function productUrl(product) {
  return normalizeUrl(product.url || `/products/${product.handle}`, DEFAULT_BASE_URL).replace(/\.js$/i, "");
}

async function fetchWithRetry(url, {
  accept,
  retries = DEFAULT_FETCH_RETRIES,
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WoofCatalogVerifier/1.0 (I AND LOVE AND YOU official Shopify import)",
        "Accept": accept,
      },
    });
    if (response.ok) return response;

    lastError = new Error(`${url}: HTTP ${response.status}`);
    if (response.status !== 429 || attempt === retries) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1));
  }
  throw lastError;
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, {
    accept: "application/json",
  });
  return response.json();
}

async function fetchText(url) {
  const response = await fetchWithRetry(url, {
    accept: "text/html,application/xhtml+xml",
  });
  return response.text();
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

function isFoodProduct(product) {
  const type = normalizeText(productType(product));
  if (!FOOD_PRODUCT_TYPES.has(type)) return false;
  const identity = [
    product.title,
    product.handle,
    productType(product),
    productTags(product).join(" "),
  ].join(" ");
  return !NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identity));
}

function inferPetType(product) {
  const type = normalizeText(productType(product));
  if (/\bdog\b/.test(type)) return "dog";
  if (/\bcat\b/.test(type)) return "cat";

  const text = normalizeText([
    product.title,
    product.handle,
    productTags(product).join(" "),
  ].join(" "));
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferFoodForm(product) {
  const type = normalizeText(productType(product));
  const text = normalizeText([
    product.title,
    product.handle,
    productTags(product).join(" "),
  ].join(" "));

  if (/\braw\b/.test(type) || /\braw\b/.test(text)) return "raw";
  if (/\bcanned\b/.test(type) || /\bcan(?:ned)?\b|pate|stew|feast/.test(text)) return "wet";
  if (/\bdry\b/.test(type) || /\bkibble\b/.test(text)) return "dry";
  return "";
}

function inferLifeStage(product) {
  const titleText = normalizeText([product.title, product.handle].join(" "));
  if (/\bpuppy|puppies\b/.test(titleText)) return "puppy";
  if (/\bkitten|kittens\b/.test(titleText)) return "kitten";
  if (/\bsenior|mature\b/.test(titleText)) return "senior";
  if (/\badult\b/.test(titleText)) return "adult";
  return "";
}

function proteinTermsFrom(value) {
  const text = normalizeText(value);
  return PROTEIN_TERMS.filter((term) => new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
}

function inferProductLineAndFlavor(product) {
  const title = compact(product.title)
    .replace(/®|™|©/g, "")
    .replace(/\s+/g, " ");
  const dashParts = title.split(/\s+-\s+/);
  if (dashParts.length >= 2) {
    return {
      productLine: compact(dashParts[0]),
      flavor: compact(dashParts.slice(1).join(" - ")),
    };
  }

  const feedMeow = title.match(/^(Feed Meow\s+\S+)\s+(.+)$/i);
  if (feedMeow) {
    return {
      productLine: compact(feedMeow[1]),
      flavor: compact(feedMeow[2]),
    };
  }

  const xoxos = title.match(/^(XOXOs)\s+(.+)$/i);
  if (xoxos) {
    return {
      productLine: compact(xoxos[1]),
      flavor: compact(xoxos[2]),
    };
  }

  const normalizedTitle = normalizeText(title);
  const nakedEssentials = normalizedTitle.startsWith("naked essentials");
  const productLine = nakedEssentials
    ? compact(title.replace(/\s+(chicken|turkey|duck|beef|bison|lamb|salmon|trout|whitefish|tuna|sardine|mackerel|fish|poultry)\b[\s\S]*$/i, ""))
    : compact(productType(product));
  const proteins = proteinTermsFrom(title);
  return {
    productLine: productLine || compact(productType(product)),
    flavor: proteins.length > 0 ? proteins.join(" + ").replace(/\b(\w)/g, (letter) => letter.toUpperCase()) : "",
  };
}

function cleanIngredientText(value) {
  return compact(value)
    .replace(/^ingredients?\s*(?:list)?\s*/i, "")
    .replace(/\s+\b(?:guaranteed analysis|nutrition|feeding|directions|calories)\b[\s\S]*$/i, "")
    .replace(/\s{2,}/g, " ");
}

function isPlausibleIngredientStatement(value) {
  const text = cleanIngredientText(value);
  if (text.length < 20) return false;
  if (INGREDIENT_REJECT_PATTERNS.test(text)) return false;
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 5) return false;
  return items.every((item) => item.length <= 180);
}

function accordionContentByHeading(html, labelPattern) {
  const componentPattern = /<accordion-component\b[\s\S]*?<\/accordion-component>/gi;
  for (const match of html.matchAll(componentPattern)) {
    const component = match[0] || "";
    const heading = component.match(/<h[1-6]\b[^>]*class=["'][^"']*\baccordion__title\b[^"']*["'][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]
      || component.match(/<summary\b[\s\S]*?<\/summary>/i)?.[0]
      || "";
    if (!labelPattern.test(textFromHtml(heading))) continue;

    const content = component.match(/<div\b[^>]*class=["'][^"']*\baccordion__content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
    if (content) return content;
  }
  return "";
}

function extractIngredients(html) {
  const block = accordionContentByHeading(html, /^(ingredient list|ingredients)$/i);
  const text = cleanIngredientText(stripTags(block));
  return isPlausibleIngredientStatement(text) ? text : "";
}

function extractGuaranteedAnalysis(html) {
  const block = accordionContentByHeading(html, /^guaranteed analysis$/i);
  return compact(stripTags(block).replace(/\s{2,}/g, " "));
}

function isCompleteFood(product) {
  const identity = [
    product.title,
    product.handle,
    productType(product),
    productTags(product).join(" "),
  ].join(" ");
  return NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identity)) ? "false" : "true";
}

function imageForVariant(product, variant) {
  const variantImage = normalizeUrl(
    variant?.featured_image?.src
      || variant?.featured_media?.preview_image?.src
      || variant?.featured_media?.src,
    DEFAULT_BASE_URL
  );
  if (variantImage) return variantImage;

  const images = Array.isArray(product.images) ? product.images : [];
  const barcode = normalizeGtin(variant?.barcode);
  const packageSize = compact(variant?.title || variant?.public_title).toLowerCase().replace(/\s+/g, "-");
  const objectImage = images.find((image) => {
    if (typeof image === "string") return barcode && image.includes(barcode);
    return Array.isArray(image.variant_ids) && image.variant_ids.includes(variant.id);
  }) || images.find((image) => {
    const src = typeof image === "string" ? image : image?.src;
    const alt = typeof image === "string" ? "" : image?.alt;
    return barcode && String(src || "").includes(barcode)
      || packageSize && compact(alt).toLowerCase().replace(/\s+/g, "-").includes(packageSize);
  });
  const productImage = objectImage || product.featured_image || product.image?.src || product.media?.[0]?.src || product.media?.[0]?.preview_image?.src || images[0];
  return normalizeUrl(typeof productImage === "string" ? productImage : productImage?.src, DEFAULT_BASE_URL);
}

function rowsForProduct({ product, productUrl: officialProductUrl, ingredients, nutrition }) {
  const variants = Array.isArray(product.variants) && product.variants.length > 0
    ? product.variants
    : [{ id: product.id, title: "", barcode: "" }];
  const petType = inferPetType(product);
  const { productLine, flavor } = inferProductLineAndFlavor(product);
  const completeFood = isCompleteFood(product);

  return variants.map((variant) => {
    const gtin = normalizeGtin(variant.barcode);
    const variantTitle = compact(variant.public_title || variant.title);
    const variantUrl = variant.id ? `${officialProductUrl}?variant=${variant.id}` : officialProductUrl;
    return {
      cache_key: gtin ? `${DEFAULT_SOURCE}:${gtin}` : `${DEFAULT_SOURCE}:${product.handle}:${variantTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      gtin,
      product_name: compact(product.title),
      brand: DEFAULT_BRAND,
      product_line: productLine,
      flavor,
      life_stage: inferLifeStage(product),
      food_form: inferFoodForm(product),
      package_size: variantTitle,
      pet_type: petType,
      ingredient_statement: ingredients,
      product_image_url: imageForVariant(product, variant),
      product_url: variantUrl,
      is_complete_food: completeFood,
      guaranteed_analysis: nutrition,
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
    non_complete_rows: rows.filter((row) => row.is_complete_food === "false").length,
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
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), DEFAULT_FETCH_DELAY_MS);

  fs.mkdirSync(outputDir, { recursive: true });
  const feedPath = path.join(outputDir, "feed.csv");
  const rawProductsPath = path.join(outputDir, "products.json");
  const urlsPath = path.join(outputDir, "urls.txt");
  const reportPath = path.join(outputDir, "report.json");
  const sqlDir = path.join(outputDir, "sql");

  const products = await fetchProducts(productsApiUrl, { maxProducts, maxPages });
  fs.writeFileSync(rawProductsPath, `${JSON.stringify({ products }, null, 2)}\n`, "utf8");

  const foodProducts = products.filter(isFoodProduct);
  const productUrls = foodProducts.map(productUrl);
  fs.writeFileSync(urlsPath, `${productUrls.join("\n")}\n`, "utf8");

  const rows = [];
  const skippedProducts = [];
  const skippedNonFoodProducts = products
    .filter((product) => !isFoodProduct(product))
    .map((product) => ({
      title: compact(product.title),
      product_type: productType(product),
      handle: compact(product.handle),
      reason: "not_complete_food_candidate",
    }));

  for (const feedProduct of foodProducts) {
    const officialProductUrl = productUrl(feedProduct);
    try {
      await sleep(fetchDelayMs);
      const [detailedProduct, html] = await Promise.all([
        fetchJson(`${officialProductUrl}.js`),
        fetchText(officialProductUrl),
      ]);
      const product = {
        ...feedProduct,
        ...detailedProduct,
        product_type: productType(feedProduct) || productType(detailedProduct),
      };
      const ingredients = extractIngredients(html);
      const nutrition = extractGuaranteedAnalysis(html);
      if (!ingredients) {
        skippedProducts.push({ product_url: officialProductUrl, product_name: compact(product.title), reason: "missing_ingredients" });
        continue;
      }
      rows.push(...rowsForProduct({
        product,
        productUrl: officialProductUrl,
        ingredients,
        nutrition,
      }));
    } catch (error) {
      skippedProducts.push({ product_url: officialProductUrl, product_name: compact(feedProduct.title), reason: error.message });
    }
  }

  writeCsv(feedPath, rows);

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
    "--expected-brand-alias", "I and Love and You",
    "--expected-brand-alias", "\"I and love and you\"",
  ], importTimeoutMs);

  const report = {
    generated_at: new Date().toISOString(),
    brand: DEFAULT_BRAND,
    source: DEFAULT_SOURCE,
    products_api_url: productsApiUrl,
    max_products: maxProducts,
    max_pages: maxPages,
    fetch_delay_ms: fetchDelayMs,
    discovered_products: products.length,
    food_product_candidates: foodProducts.length,
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
    skipped_non_food_products: skippedNonFoodProducts,
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`I AND LOVE AND YOU import prepared: ${rows.length} feed row(s) from ${foodProducts.length} food product candidate(s)`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
