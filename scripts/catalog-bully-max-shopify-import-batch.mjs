import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_PRODUCTS_API_URL = "https://shop.bullymax.com/products.json?limit=250";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/bully-max";
const DEFAULT_SOURCE = "bully-max";
const DEFAULT_BRAND = "Bully Max";
const DEFAULT_BASE_URL = "https://shop.bullymax.com/";
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
  "dog food",
  "non-prescription dog food",
]);
const NON_COMPLETE_FOOD_IDENTITY_PATTERNS = [
  /\b(bundle|combo|starter\s+pack|food\s+and\s+supplement|supplement|nutrition\s+plan)\b/i,
  /\b(treat|treats|snack|snacks|chew|chews|jerky|biscuit|biscuits|dental)\b/i,
  /\b(topper|toppers|meal\s+topper|food\s+topper|mixer|mixers|meal\s+mixer|meal\s+enhancer|enhancer|enhancers)\b/i,
  /\b(base\s+mix|weight\s+gainer|salmon\s+oil|liquid|tablet|tablets|tabs)\b/i,
  /\b(gift\s+card|accessories|accessory|toy|bowl|scoop|leash|collar|shirt|calendar|beanie|blanket|patch)\b/i,
  /\bdry\s*&\s*wet\b/i,
];
const INGREDIENT_REJECT_PATTERNS = /\b(?:dog food advisor|feeding instructions|feeding guide|directions|customer reviews|shop now|learn more|no artificial colors|no artificial flavors|no artificial preservatives|no corn|no wheat|no soy|real ingredients|healthy weight|muscle mass|first ingredient is|ingredients are listed in order|our formula contains all the vitamins)\b/i;
const PROTEIN_TERMS = [
  "chicken",
  "beef",
  "lamb",
  "pork",
  "fish",
  "salmon",
];
const INGREDIENT_TEXT_FIXES = [
  [/\bMeaI\b/g, "Meal"],
  [/\bTocopheroIs\b/g, "Tocopherols"],
  [/\bPIain\b/g, "Plain"],
  [/\bPearIed\b/g, "Pearled"],
  [/\bWhoIe\b/g, "Whole"],
  [/\bFIaxseed\b/g, "Flaxseed"],
  [/\bFIaxseeds\b/g, "Flaxseeds"],
  [/\bFIavor\b/g, "Flavor"],
  [/\bOiI\b/g, "Oil"],
  [/\bSuppIement\b/g, "Supplement"],
  [/\bHydrochIoride\b/g, "Hydrochloride"],
  [/\bSuIfate\b/g, "Sulfate"],
  [/\bCaIcium\b/g, "Calcium"],
  [/\bDL_Methionine\b/g, "DL-Methionine"],
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
    .replace(/&rsquo;|&#8217;/gi, "'")
    .replace(/&ldquo;|&#8220;/gi, "\"")
    .replace(/&rdquo;|&#8221;/gi, "\"")
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
        "User-Agent": "WoofCatalogVerifier/1.0 (Bully Max official Shopify import)",
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
  ].join(" ");
  return !NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identity));
}

function textFromDescription(description) {
  return compact(stripTags(description)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/[\u2013\u2014]/g, "-"));
}

function applyIngredientTextFixes(value) {
  return INGREDIENT_TEXT_FIXES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function cleanIngredientText(value) {
  return compact(applyIngredientTextFixes(value)
    .replace(/^ingredients?\s*(?:list)?\s*:?\s*/i, "")
    .replace(/\s{2,}/g, " "));
}

function normalizedNutrientName(value) {
  const text = compact(value).toLowerCase();
  if (text.includes("protein")) return "Crude Protein";
  if (text.includes("fat")) return "Crude Fat";
  if (text.includes("fiber") || text.includes("fibre")) return "Crude Fiber";
  if (text.includes("moisture")) return "Moisture";
  if (text.includes("calcium")) return "Calcium";
  if (text.includes("phosphorus")) return "Phosphorus";
  if (text.includes("omega") && text.includes("6")) return "Omega 6";
  if (text.includes("omega") && text.includes("3")) return "Omega 3";
  if (text.includes("ash")) return "Ash";
  if (text.includes("microorganisms")) return "Total Microorganisms";
  return titleCase(value);
}

function normalizedNutrientQualifier(value) {
  const text = compact(value).toLowerCase();
  if (!text) return "";
  if (text === "min" || text === "minimum" || text.includes("less than")) return "MIN";
  if (text === "max" || text === "maximum" || text.includes("more than")) return "MAX";
  return text.toUpperCase();
}

function extractNutrientClauses(value) {
  const text = compact(applyIngredientTextFixes(value)
    .replace(/^\?+\s*/, "")
    .replace(/\*not recognized as an essential nutrient[\s\S]*$/i, "")
    .replace(/\bthis formula meets[\s\S]*$/i, "")
    .replace(/\bnote:\s*[\s\S]*$/i, "")
    .replace(/\bcalorie content\b[\s\S]*$/i, ""));
  const nutrientPattern = /\b((?:crude\s+)?protein|(?:crude\s+)?fat|(?:crude\s+)?fib(?:er|re)|moisture|calcium|phosphorus|omega\s*6|omega\s*3|ash|total\s+microorganisms)\b\s*(?:\((min|max|minimum|maximum)\)|\b(min|max|minimum|maximum|not\s+less\s+than|not\s+more\s+than)\b)?\s*:?\s*(?:\b(min|max|minimum|maximum|not\s+less\s+than|not\s+more\s+than)\b)?\s*([0-9]+(?:\.[0-9]+)?\s*(?:m\s*)?(?:%|cfu\/lb\.?))/gi;
  const clauses = [];
  const seen = new Set();
  for (const match of text.matchAll(nutrientPattern)) {
    const name = normalizedNutrientName(match[1]);
    const qualifier = normalizedNutrientQualifier(match[2] || match[3] || match[4]);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clauses.push(compact([name, qualifier, match[5]].filter(Boolean).join(" ")));
  }
  return clauses;
}

function cleanGuaranteedAnalysis(value) {
  const clauses = extractNutrientClauses(value);
  const hasRequiredNutrients = clauses.some((clause) => /\bprotein\b/i.test(clause))
    && clauses.some((clause) => /\bfat\b/i.test(clause))
    && clauses.some((clause) => /\bfib(?:er|re)\b/i.test(clause))
    && clauses.some((clause) => /\bmoisture\b/i.test(clause));
  return hasRequiredNutrients ? clauses.join(" | ") : "";
}

function earliestMarkerIndex(text, startIndex) {
  const markers = [
    /\bguaranteed analysis\b/i,
    /\bwhat(?:'s| is) the guaranteed analysis\b/i,
    /\bwhat(?:'s| is) the calorie content\b/i,
    /\bhigh-calorie content\b/i,
    /\bfeeding instructions\b/i,
    /\bfeeding guide\b/i,
    /\bfaq\b/i,
    /\bis this dog food safe\b/i,
    /\bhow much is a serving\b/i,
    /\bvisit our dog food calculator\b/i,
    /\bno recalls\b/i,
  ];
  let end = text.length;
  const tail = text.slice(startIndex);
  for (const marker of markers) {
    const match = marker.exec(tail);
    if (!match) continue;
    end = Math.min(end, startIndex + match.index);
  }
  return end;
}

function plausibleIngredientStatement(value) {
  const text = cleanIngredientText(value);
  if (text.length < 20) return false;
  if (INGREDIENT_REJECT_PATTERNS.test(text)) return false;
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 5) return false;
  return items.every((item) => item.length <= 180);
}

function ingredientCandidates(text) {
  const candidates = [];
  const labelPatterns = [
    /\bingredient list\s*:?\s*/gi,
    /\bwhat are the ingredients\??\s*/gi,
    /\bingredients\s*:?\s+/gi,
  ];
  for (const pattern of labelPatterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index + match[0].length;
      if (!/[A-Z]/.test(text.slice(start, start + 12))) continue;
      const end = earliestMarkerIndex(text, start);
      candidates.push(text.slice(start, end));
    }
  }
  return candidates;
}

function extractIngredients(description) {
  const text = textFromDescription(description);
  for (const candidate of ingredientCandidates(text)) {
    const cleaned = cleanIngredientText(candidate);
    if (plausibleIngredientStatement(cleaned)) return cleaned;
  }
  return "";
}

function extractGuaranteedAnalysis(description) {
  const text = textFromDescription(description);
  const labels = [
    /\bguaranteed analysis\b\s*:?\s*/i,
    /\bwhat(?:'s| is) the guaranteed analysis\??\s*/i,
  ];
  for (const label of labels) {
    const match = label.exec(text);
    if (!match) continue;
    const start = match.index + match[0].length;
    let end = text.length;
    for (const marker of [
      /\bwhat(?:'s| is) the calorie content\b/i,
      /\bhigh-calorie content\b/i,
      /\bfeeding instructions\b/i,
      /\bfeeding guide\b/i,
      /\bfaq\b/i,
      /\bis this dog food safe\b/i,
      /\bhow much is a serving\b/i,
    ]) {
      const tailMatch = marker.exec(text.slice(start));
      if (tailMatch) end = Math.min(end, start + tailMatch.index);
    }
    const analysis = cleanGuaranteedAnalysis(text.slice(start, end));
    if (analysis) {
      return analysis;
    }
  }
  return "";
}

function inferPetType() {
  return "dog";
}

function inferFoodForm(product) {
  const text = normalizeText([product.title, product.handle, productType(product)].join(" "));
  if (/\bwet|instant\b/.test(text)) return "wet";
  if (/\braw\b/.test(text)) return "raw";
  return "dry";
}

function inferLifeStage(product) {
  const text = normalizeText([product.title, product.handle, productType(product)].join(" "));
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  return "adult";
}

function proteinTermsFrom(value) {
  const text = normalizeText(value);
  return PROTEIN_TERMS.filter((term) => new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
}

function titleCase(value) {
  return compact(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

function inferFlavor({ product, ingredients }) {
  const proteins = proteinTermsFrom([product.title, productTags(product).join(" "), ingredients.split(/[,;]+/).slice(0, 8).join(" ")].join(" "));
  if (proteins.includes("chicken")) return "Chicken";
  if (proteins.includes("beef")) return "Beef";
  if (proteins.includes("lamb")) return "Lamb";
  if (proteins.length > 0) return proteins.slice(0, 2).map(titleCase).join(" + ");
  return "";
}

function inferProductLine(product) {
  const title = compact(product.title).replace(/^Bully Max\s*/i, "");
  const line = title
    .replace(/\s+(Chicken|Beef|Lamb)\b[\s\S]*$/i, "")
    .replace(/\s+(Dry|Wet)?\s*Dog Food[\s\S]*$/i, "")
    .replace(/\s+Puppy Food[\s\S]*$/i, "")
    .replace(/\s+-\s*\d+\s*Pack$/i, "");
  return compact(line) || compact(productType(product));
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
  const matched = images.find((image) => {
    if (typeof image === "string") return barcode && image.includes(barcode);
    return Array.isArray(image.variant_ids) && image.variant_ids.includes(variant.id);
  }) || images.find((image) => {
    const src = typeof image === "string" ? image : image?.src;
    const alt = typeof image === "string" ? "" : image?.alt;
    return barcode && String(src || "").includes(barcode)
      || packageSize && compact(alt).toLowerCase().replace(/\s+/g, "-").includes(packageSize);
  });
  const productImage = matched || product.featured_image || product.image?.src || product.media?.[0]?.src || product.media?.[0]?.preview_image?.src || images[0];
  return normalizeUrl(typeof productImage === "string" ? productImage : productImage?.src, DEFAULT_BASE_URL);
}

function rowsForProduct({ product, productUrl: officialProductUrl, ingredients, nutrition }) {
  const variants = Array.isArray(product.variants) && product.variants.length > 0
    ? product.variants
    : [{ id: product.id, title: "", barcode: "" }];
  const flavor = inferFlavor({ product, ingredients });

  return variants.map((variant) => {
    const gtin = normalizeGtin(variant.barcode);
    const variantTitle = compact(variant.public_title || variant.title);
    const variantUrl = variant.id ? `${officialProductUrl}?variant=${variant.id}` : officialProductUrl;
    return {
      cache_key: gtin ? `${DEFAULT_SOURCE}:${gtin}` : `${DEFAULT_SOURCE}:${product.handle}:${variantTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      gtin,
      product_name: compact(product.title),
      brand: DEFAULT_BRAND,
      product_line: inferProductLine(product),
      flavor,
      life_stage: inferLifeStage(product),
      food_form: inferFoodForm(product),
      package_size: variantTitle,
      pet_type: inferPetType(product),
      ingredient_statement: ingredients,
      product_image_url: imageForVariant(product, variant),
      product_url: variantUrl,
      is_complete_food: "true",
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
  fs.writeFileSync(urlsPath, `${foodProducts.map(productUrl).join("\n")}\n`, "utf8");

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
      const product = await fetchJson(`${officialProductUrl}.js`);
      const mergedProduct = {
        ...feedProduct,
        ...product,
        product_type: productType(feedProduct) || productType(product),
      };
      const ingredients = extractIngredients(mergedProduct.description || mergedProduct.body_html);
      const nutrition = extractGuaranteedAnalysis(mergedProduct.description || mergedProduct.body_html);
      if (!ingredients) {
        skippedProducts.push({ product_url: officialProductUrl, product_name: compact(mergedProduct.title), reason: "missing_ingredients" });
        continue;
      }
      if (!nutrition) {
        skippedProducts.push({ product_url: officialProductUrl, product_name: compact(mergedProduct.title), reason: "missing_guaranteed_analysis" });
        continue;
      }
      rows.push(...rowsForProduct({
        product: mergedProduct,
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

  console.log(`Bully Max import prepared: ${rows.length} feed row(s) from ${foodProducts.length} food product candidate(s)`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
