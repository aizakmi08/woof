import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_SITEMAP_URL = "https://www.thehonestkitchen.com/sitemap_products_1.xml?from=7558707642618&to=9203487342842";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/the-honest-kitchen";
const DEFAULT_SOURCE = "the-honest-kitchen";
const DEFAULT_BRAND = "The Honest Kitchen";
const DEFAULT_MAX_URLS = 250;
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 250;
const DEFAULT_FETCH_RETRIES = 3;
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
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|meal mixer|meal enhancer|enhancer|enhancers)\b/i,
  /\b(bone broth|chunky broth|broth topper|broth toppers|stock)\b/i,
  /\b(?:gravy|sauce)\s+(?:topper|toppers|mixer|mixers|enhancer|enhancers)\b/i,
  /\b(?:topper|toppers|mixer|mixers|enhancer|enhancers)\s+(?:gravy|sauce)\b/i,
  /\b(puree|purees|pur[eé]e|pur[eé]es|bisque|bisques|lickable|lickables)\b/i,
  /\b(supplement|supplements|complement|complementary|vitamin pack|probiotic|base mix|baking mix|muffin mix|cake mix)\b/i,
  /\b(chip clip|bundle)\b/i,
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
  if (value === null || value === undefined || value === "") return fallback;
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
    .replace(/<\/(p|div|li|tr|section|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function normalizeGtin(value) {
  const digits = compact(value).replace(/[^0-9]/g, "");
  return digits.length >= 8 ? digits : "";
}

function normalizeUrl(value, baseUrl) {
  const text = compact(value);
  if (!text) return "";
  try {
    return new URL(text.replace(/^\/\//, "https://"), baseUrl).toString();
  } catch {
    return text;
  }
}

async function fetchWithRetry(url, {
  accept,
  retries = DEFAULT_FETCH_RETRIES,
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WoofCatalogVerifier/1.0 (The Honest Kitchen official Shopify import)",
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

async function fetchText(url, accept = "text/html,application/xhtml+xml") {
  const response = await fetchWithRetry(url, {
    accept,
  });
  return response.text();
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, {
    accept: "application/json",
  });
  return response.json();
}

function productUrlsFromSitemap(xml, maxUrls) {
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map(([, value]) => decodeEntities(value))
    .filter((url) => /^https:\/\/www\.thehonestkitchen\.com\/products\//i.test(url))
    .filter((url) => !/[?&]variant=/.test(url));
  return [...new Set(urls)].slice(0, maxUrls);
}

function textFromHtml(value) {
  return compact(stripTags(value));
}

function blockByControlledHeading(html, labelPattern) {
  const buttonPattern = /<button\b[^>]*\baria-controls=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi;
  for (const match of html.matchAll(buttonPattern)) {
    const [, id, labelHtml] = match;
    if (!labelPattern.test(textFromHtml(labelHtml))) continue;

    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blockMatch = html.match(new RegExp(`<div\\b[^>]*\\bid=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/transition-expand>`, "i"));
    if (blockMatch?.[1]) return blockMatch[1];
  }
  return "";
}

function cleanIngredientText(value) {
  return compact(value)
    .replace(/^ingredients?\s*:?\s*/i, "")
    .replace(/\s+\b(?:nutrition|feeding|transition|calories)\b[\s\S]*$/i, "")
    .replace(/\s{2,}/g, " ");
}

function isPlausibleIngredientStatement(value) {
  const text = cleanIngredientText(value);
  if (text.length < 20) return false;
  if (/\b(?:discover|shop all|subscribe|add to cart|view nutrient profile|feeding guidelines|transition instructions)\b/i.test(text)) return false;
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 5) return false;
  return items.every((item) => item.length <= 180);
}

function cleanLabeledIngredientValue(value) {
  return compact(value)
    .replace(/^\*+\s*/, "")
    .replace(/^[*:]\s*/, "")
    .replace(/[.;]\s*$/g, "");
}

function labeledIngredientParagraphs(block) {
  const labels = new Map();
  const rawParagraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, paragraph]) => compact(stripTags(paragraph)))
    .filter(Boolean);
  const paragraphs = rawParagraphs
    .map(cleanIngredientText)
    .filter(Boolean);

  for (const paragraph of rawParagraphs) {
    const match = paragraph.match(/^\s*(main ingredients?|ingredients?|vitamins?|minerals?)\s*:\s*([\s\S]+)$/i);
    if (!match) continue;
    labels.set(match[1].toLowerCase().replace(/\s+/g, " "), cleanLabeledIngredientValue(match[2]));
  }

  return { labels, paragraphs };
}

function expandLabeledIngredientGroups(block) {
  const { labels, paragraphs } = labeledIngredientParagraphs(block);
  const mainText = labels.get("main ingredients")
    || labels.get("main ingredient")
    || labels.get("ingredients")
    || labels.get("ingredient")
    || "";
  if (!mainText) return "";

  let ingredientText = mainText;
  const minerals = labels.get("minerals") || labels.get("mineral") || "";
  const vitamins = labels.get("vitamins") || labels.get("vitamin") || "";

  if (minerals) ingredientText = ingredientText.replace(/\bminerals?\*+(?=\s*[,.;]|$)/gi, minerals);
  if (vitamins) ingredientText = ingredientText.replace(/\bvitamins?\*+(?=\s*[,.;]|$)/gi, vitamins);

  ingredientText = compact(ingredientText)
    .replace(/^:\s*/, "")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\.\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\.\.+/g, ".")
    .replace(/\s{2,}/g, " ");

  if (/\b(?:minerals?|vitamins?)\*+(?=\s*[,.;]|$)/i.test(ingredientText)) {
    return paragraphs.find(isPlausibleIngredientStatement) || "";
  }

  return isPlausibleIngredientStatement(ingredientText) ? ingredientText : "";
}

function extractIngredients(html) {
  const block = blockByControlledHeading(html, /^ingredients$/i);
  const expanded = expandLabeledIngredientGroups(block);
  if (expanded) return expanded;

  const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, paragraph]) => cleanIngredientText(stripTags(paragraph)))
    .filter(Boolean);
  const text = paragraphs.find(isPlausibleIngredientStatement) || cleanIngredientText(stripTags(block));
  return isPlausibleIngredientStatement(text) ? text : "";
}

function extractNutrition(html) {
  const block = blockByControlledHeading(html, /^(nutrition|guaranteed analysis)$/i);
  return compact(stripTags(block)
    .replace(/\bView Nutrient Profile\b[\s\S]*$/i, "")
    .replace(/\s{2,}/g, " "));
}

function productTags(product) {
  if (Array.isArray(product.tags)) return product.tags.map(compact).filter(Boolean);
  return String(product.tags || "")
    .split(",")
    .map(compact)
    .filter(Boolean);
}

function inferPetType(product, url) {
  const text = [
    product.title,
    product.product_type,
    product.handle,
    productTags(product).join(" "),
    url,
  ].map(compact).join(" ").toLowerCase();
  const dog = /\b(dog|puppy|canine)\b/.test(text);
  const cat = /\b(cat|kitten|feline|c[aâ]t[eé])\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferLifeStage(product) {
  const text = [product.title, product.product_type, product.handle].join(" ").toLowerCase();
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  return "";
}

function inferFoodForm(product) {
  const text = [product.title, product.product_type, product.handle, productTags(product).join(" ")].join(" ").toLowerCase();
  if (/\bdehydrated\b/.test(text)) return "dehydrated";
  if (/\bdry|clusters?\b/.test(text)) return "dry";
  if (/\bwet|p[aâ]t[eé]|mousse|stew|pour overs?\b/.test(text)) return "wet";
  if (/\bbroth|goat'?s milk\b/.test(text)) return "broth";
  return "";
}

function inferFlavor(product) {
  const recipe = productTags(product).find((tag) => /^recipe::/i.test(tag));
  if (recipe) return compact(recipe.replace(/^recipe::/i, ""));

  const title = compact(product.title);
  const proteinMatch = title.match(/\b(chicken|beef|turkey|salmon|lamb|duck|white fish|fish|cod)(?:\s*(?:&|and|with|,)\s*(?:chicken|beef|turkey|salmon|lamb|duck|white fish|fish|cod|oat|rice|superfoods|veggies|vegetables|goat's milk|goat milk))*\b/i);
  return compact(proteinMatch?.[0] || "");
}

function isCompleteFood(product, url) {
  const identity = [
    product.title,
    product.product_type,
    product.handle,
    url,
  ].map(compact).join(" ");
  return NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identity)) ? "false" : "true";
}

function imageForVariant(product, variant) {
  const images = Array.isArray(product.images) ? product.images : [];
  const barcode = normalizeGtin(variant?.barcode);
  const packageSize = compact(variant?.title).toLowerCase().replace(/\s+/g, "-");

  const matched = images.find((image) => Array.isArray(image.variant_ids) && image.variant_ids.includes(variant.id))
    || images.find((image) => barcode && String(image.src || "").includes(barcode))
    || images.find((image) => packageSize && compact(image.alt).toLowerCase().replace(/\s+/g, "-").includes(packageSize));

  return normalizeUrl(matched?.src || product.image?.src || images[0]?.src, "https://www.thehonestkitchen.com/");
}

function rowsForProduct({ product, productUrl, ingredients, nutrition }) {
  const variants = Array.isArray(product.variants) && product.variants.length > 0
    ? product.variants
    : [{ id: product.id, title: "", barcode: "" }];
  const petType = inferPetType(product, productUrl);
  const completeFood = isCompleteFood(product, productUrl);
  return variants.map((variant) => {
    const gtin = normalizeGtin(variant.barcode);
    const variantUrl = variant.id ? `${productUrl}?variant=${variant.id}` : productUrl;
    return {
      cache_key: gtin ? `${DEFAULT_SOURCE}:${gtin}` : `${DEFAULT_SOURCE}:${product.handle}:${compact(variant.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      gtin,
      product_name: compact(product.title),
      brand: DEFAULT_BRAND,
      product_line: compact(product.product_type),
      flavor: inferFlavor(product),
      life_stage: inferLifeStage(product),
      food_form: inferFoodForm(product),
      package_size: compact(variant.title),
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

function summarize(rows) {
  return {
    rows: rows.length,
    complete_food_rows: rows.filter((row) => row.is_complete_food === "true").length,
    non_complete_rows: rows.filter((row) => row.is_complete_food === "false").length,
    rows_with_gtin: rows.filter((row) => normalizeGtin(row.gtin)).length,
    rows_with_ingredients: rows.filter((row) => compact(row.ingredient_statement)).length,
    rows_with_images: rows.filter((row) => compact(row.product_image_url)).length,
    dog_rows: rows.filter((row) => row.pet_type === "dog").length,
    cat_rows: rows.filter((row) => row.pet_type === "cat").length,
  };
}

async function main() {
  const sitemapUrl = getArg("--sitemap-url", DEFAULT_SITEMAP_URL);
  const outputDir = getArg("--output-dir", DEFAULT_OUTPUT_DIR);
  const maxUrls = positiveInteger(getArg("--max-urls"), DEFAULT_MAX_URLS);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const importTimeoutMs = positiveInteger(getArg("--import-timeout-ms"), 60_000);
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), DEFAULT_FETCH_DELAY_MS);

  fs.mkdirSync(outputDir, { recursive: true });
  const feedPath = path.join(outputDir, "feed.csv");
  const urlsPath = path.join(outputDir, "urls.txt");
  const reportPath = path.join(outputDir, "report.json");
  const sqlDir = path.join(outputDir, "sql");

  const sitemapXml = await fetchText(sitemapUrl, "application/xml,text/xml");
  const productUrls = productUrlsFromSitemap(sitemapXml, maxUrls);
  fs.writeFileSync(urlsPath, `${productUrls.join("\n")}\n`, "utf8");

  const rows = [];
  const skippedProducts = [];
  for (const productUrl of productUrls) {
    try {
      await sleep(fetchDelayMs);
      const [{ product }, html] = await Promise.all([
        fetchJson(`${productUrl}.json`),
        fetchText(productUrl),
      ]);
      const ingredients = extractIngredients(html);
      const nutrition = extractNutrition(html);
      if (!ingredients) {
        skippedProducts.push({ product_url: productUrl, reason: "missing_ingredients" });
        continue;
      }
      rows.push(...rowsForProduct({ product, productUrl, ingredients, nutrition }));
    } catch (error) {
      skippedProducts.push({ product_url: productUrl, reason: error.message });
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
  ], importTimeoutMs);

  const report = {
    generated_at: new Date().toISOString(),
    brand: DEFAULT_BRAND,
    source: DEFAULT_SOURCE,
    sitemap_url: sitemapUrl,
    max_urls: maxUrls,
    fetch_delay_ms: fetchDelayMs,
    discovered_product_urls: productUrls.length,
    feed_path: feedPath,
    url_list_path: urlsPath,
    sql_dir: sqlDir,
    feed: summarize(rows),
    skipped_products: skippedProducts,
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`The Honest Kitchen import prepared: ${rows.length} feed row(s) from ${productUrls.length} product URL(s)`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
}

main();
