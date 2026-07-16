import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const OCR_SCRIPT = "scripts/ocr-image-text.swift";
const DEFAULT_API_URL = "https://www.naturalbalanceinc.com/wp-json/wp/v2/product?per_page=100";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/natural-balance";
const DEFAULT_SOURCE = "natural-balance";
const DEFAULT_BRAND = "Natural Balance";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const OCR_MODES = [
  { label: "accurate", args: [] },
  { label: "accurate_no_language_correction", args: ["--no-language-correction"] },
  { label: "fast", args: ["--fast"] },
  { label: "fast_no_language_correction", args: ["--fast", "--no-language-correction"] },
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
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|meal mixer|meal enhancer|enhancer|enhancers)\b/i,
  /\b(bone broth|chunky broth|broth topper|broth toppers|stock)\b/i,
  /\b(?:gravy|sauce)\s+(?:topper|toppers|mixer|mixers|enhancer|enhancers)\b/i,
  /\b(?:topper|toppers|mixer|mixers|enhancer|enhancers)\s+(?:gravy|sauce)\b/i,
  /\b(puree|purees|pur[eé]e|pur[eé]es|bisque|bisques|lickable|lickables)\b/i,
  /\b(supplement|supplements|complement|complementary|vitamin pack|probiotic)\b/i,
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

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

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasUnbalancedParentheses(value) {
  const text = compact(value);
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char !== ")") continue;
    depth -= 1;
    if (depth < 0) return true;
  }
  return depth !== 0;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
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
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|section|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function firstText(...values) {
  for (const value of values) {
    const text = compact(decodeEntities(value));
    if (text) return text;
  }
  return "";
}

function absoluteUrl(value, baseUrl = "https://www.naturalbalanceinc.com/") {
  const text = compact(String(value || "").split("###").find(Boolean));
  if (!text || /^data:/i.test(text)) return "";
  try {
    return new URL(text, baseUrl).toString();
  } catch {
    return text;
  }
}

function normalizeGtin(...values) {
  for (const value of values) {
    const text = compact(value);
    const barcode = text.match(/\b(0?\d{12,14})\b/)?.[1] || "";
    const digits = barcode || text.replace(/[^0-9]/g, "");
    if (digits.length >= 12 && digits.length <= 14) return digits;
  }
  return "";
}

function cleanProductName(value) {
  return compact(decodeEntities(value))
    .replace(/[®™]/g, "")
    .replace(/\s*-\s*Natural Balance Pet Food\s*$/i, "")
    .replace(/\s{2,}/g, " ");
}

function normalizeSpecies(value) {
  const text = compact(value).toLowerCase();
  if (/^dogs?$/.test(text)) return "dog";
  if (/^cats?$/.test(text)) return "cat";
  return "";
}

function normalizeFoodForm(value) {
  const text = compact(value).toLowerCase();
  if (/^dry$/.test(text)) return "dry";
  if (/^wet$/.test(text)) return "wet";
  if (/fresh|cooked/.test(text)) return "fresh";
  return text;
}

function normalizeLifeStage(value) {
  const text = compact(value).toLowerCase();
  if (/puppy/.test(text)) return "puppy";
  if (/kitten/.test(text)) return "kitten";
  if (/senior|mature/.test(text)) return "senior";
  if (/adult/.test(text)) return "adult";
  if (/all/.test(text)) return "all life stages";
  return text;
}

function inferIsCompleteFood(row) {
  const identityText = [
    row.product_name,
    row.product_line,
    row.food_form,
    row.product_url,
  ].map(compact).join(" ").toLowerCase();
  return NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identityText)) ? "false" : "true";
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WoofCatalogVerifier/1.0 (Natural Balance official API import)",
      "Accept": "application/json",
    },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return {
    rows: await response.json(),
    total: Number(response.headers.get("x-wp-total") || 0),
    totalPages: Number(response.headers.get("x-wp-totalpages") || 1),
  };
}

async function fetchProducts(apiUrl) {
  const first = await fetchJson(apiUrl);
  const rows = [...first.rows];
  const totalPages = first.totalPages || 1;
  for (let page = 2; page <= totalPages; page += 1) {
    const separator = apiUrl.includes("?") ? "&" : "?";
    const next = await fetchJson(`${apiUrl}${separator}page=${page}`);
    rows.push(...next.rows);
  }
  return rows;
}

async function downloadImage(url, imagesDir) {
  const imageUrl = absoluteUrl(url);
  const extension = path.extname(new URL(imageUrl).pathname).replace(/[^.a-z0-9]/gi, "") || ".img";
  const filename = `${crypto.createHash("sha1").update(imageUrl).digest("hex")}${extension}`;
  const filePath = path.join(imagesDir, filename);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return filePath;

  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "WoofCatalogVerifier/1.0 (Natural Balance official API import)",
      "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
    },
  });
  if (!response.ok) throw new Error(`${imageUrl}: HTTP ${response.status}`);
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

function convertedImagePath(imagePath) {
  const outputPath = imagePath.replace(/\.[^.]+$/i, ".ocr.jpg");
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) return outputPath;

  const converted = spawnSync("sips", ["-s", "format", "jpeg", "-Z", "2400", imagePath, "--out", outputPath], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });
  if (converted.status !== 0) {
    throw new Error(["sips conversion failed", converted.stderr, converted.stdout].filter(Boolean).join("\n"));
  }
  return outputPath;
}

function runOcrImage(imagePath, args, timeoutMs) {
  const ocrPath = convertedImagePath(imagePath);
  const result = spawnSync("swift", [OCR_SCRIPT, ...args, ocrPath], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: process.env.CLANG_MODULE_CACHE_PATH || "/private/tmp/woof-clang-module-cache",
    },
  });
  if (result.status !== 0) {
    if (result.error?.code === "ETIMEDOUT" || result.signal) {
      throw new Error(`${OCR_SCRIPT} timed out after ${timeoutMs}ms`);
    }
    throw new Error([`OCR failed for ${ocrPath}`, result.stderr, result.stdout].filter(Boolean).join("\n"));
  }
  return cleanOcrText(result.stdout || "");
}

function ocrImageCandidates(imagePath, timeoutMs) {
  const candidates = [];
  const seen = new Set();
  for (const mode of OCR_MODES) {
    const text = runOcrImage(imagePath, mode.args, timeoutMs);
    const key = compact(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push({ mode: mode.label, text });
  }
  return candidates;
}

function cleanOcrText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\bPotassium\s+lodidel\b/g, "Potassium Iodide")
    .replace(/\bPotassium\s+lodide\b/g, "Potassium Iodide")
    .replace(/\bCalcium\s+lodate\b/gi, "Calcium Iodate")
    .replace(/\bElaxseed\b/g, "Flaxseed")
    .replace(/\blodidel\b/g, "Iodide")
    .replace(/\blodide\b/g, "Iodide")
    .replace(/\blodate\b/gi, "Iodate")
    .replace(/\bBIZ\b/g, "B12")
    .replace(/\bLASCORBYL2\b/g, "L-ASCORBYL-2")
    .replace(/\bDE-METHIONINE\b/g, "DL-METHIONINE")
    .replace(/\bDOCOSAHEXANENOIC\b/gi, "DOCOSAHEXAENOIC")
    .replace(/\bVITAMIN Bl2\b/g, "VITAMIN B12")
    .replace(/\bMixec\b/g, "Mixed")
    .replace(/\bBeet\s+ulo\b/gi, "Beet Pulp")
    .replace(/\bGuar\s+aum\b/gi, "Guar Gum")
    .replace(/\bsun(?:flower|tower|tiower|ttower)\s+u(?:ll|nl|l|il)\b/gi, "Sunflower Oil")
    .replace(/\bGrouna\s+rlaxseed\s+i\b/gi, "Ground Flaxseed")
    .replace(/\bsalmon\s+U(?:ni|li|nil)\b/gi, "Salmon Oil")
    .replace(/\bCanola Oil\s+\(Preserved with Mixed Tocopherols,\s+Flaxseed\b/gi, "Canola Oil (Preserved with Mixed Tocopherols), Flaxseed")
    .replace(/\bGuar Gum,\s+salt,/gi, "Guar Gum, Salt,")
    .split(/\n+/)
    .map(compact)
    .filter(Boolean)
    .join("\n");
}

function ingredientStatementFromOcr(ocrText) {
  const lines = String(ocrText || "").split(/\n+/).map(compact).filter(Boolean);
  const start = lines.findIndex((line) => /^ingredients?\b/i.test(line));
  if (start === -1) return "";
  const collected = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^(this product|ingredients subject|guaranteed analysis|feeding|calorie content)\b/i.test(line)) break;
    collected.push(line);
  }
  return compact(collected.join(" "))
    .replace(/^ingredients?\s*:?\s*/i, "")
    .replace(/\b(Vitamins?\s*\([^)]*\bFolic Acid),\s+(Taurine)\b/gi, "$1), $2")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ");
}

function isPlausibleIngredientStatement(value) {
  const text = compact(value);
  if (!text || text.length < 20) return false;
  if (hasUnbalancedParentheses(text)) return false;
  if (/\b(?:where to buy|nutritional facts|guaranteed levels|immune health|digestive health|healthy skin\s*&\s*coat)\b/i.test(text)) return false;
  if (/\b(?:lodide|lodate|ulo|unil|grouna|rlaxseea|mixec|suntlower|sunttower)\b/i.test(text)) return false;
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 5) return false;
  if (items.some((item) => item.length > 190)) return false;
  return true;
}

function cleanAnalysis(...values) {
  return values
    .map((value) => compact(decodeEntities(stripTags(value))))
    .filter(Boolean)
    .join("\n");
}

function bestProductImage(acf = {}) {
  return firstText(
    absoluteUrl(acf.website_new_look_image),
    absoluteUrl(String(acf.website_hero || "").split("###").reverse().find(Boolean)),
    absoluteUrl(acf.fg_image),
    absoluteUrl(acf.feed_with_confidence_image)
  );
}

function imageTextForGtin(acf = {}) {
  return [
    acf.ingredients_image,
    acf.ga_image,
    acf.website_hero,
    acf.website_new_look_image,
    acf.fg_image,
    acf.feed_with_confidence_image,
  ].map(compact).join(" ");
}

function rowFromProduct(product, ingredientStatement) {
  const acf = product.acf || {};
  const productName = cleanProductName(firstText(acf.nb_website_product_name, product.title?.rendered));
  const productLine = cleanProductName(firstText(acf.nb_website_brand, acf.sanitized_brand, acf.parent_for_web));
  const row = {
    cache_key: `${DEFAULT_SOURCE}:${product.id}`,
    gtin: normalizeGtin(imageTextForGtin(acf), acf.parent_gtin, acf.item_no),
    product_name: productName,
    brand: DEFAULT_BRAND,
    product_line: productLine,
    flavor: cleanProductName(firstText(acf.primary_flavor, productName)),
    life_stage: normalizeLifeStage(acf.life_stage),
    food_form: normalizeFoodForm(acf.type),
    package_size: compact(acf.available_sizes),
    pet_type: normalizeSpecies(acf.species),
    ingredient_statement: ingredientStatement,
    product_image_url: bestProductImage(acf),
    product_url: absoluteUrl(product.link || acf.full_product_url),
    is_complete_food: "true",
    guaranteed_analysis: cleanAnalysis(acf.calorie_content, acf.guaranteed_analysis, acf.nutritional_statement),
    source_quality: "manufacturer",
    ingredient_verification_status: "label_ocr_verified",
    image_verification_status: "manufacturer",
  };
  row.is_complete_food = inferIsCompleteFood(row);
  return row;
}

function writeCsv(filePath, rows) {
  const lines = [
    CSV_HEADERS.join(","),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
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

function runOfficialImport(feedPath, sqlDir, { sqlChunkSize, importTimeoutMs }) {
  const args = [
    OFFICIAL_FEED_IMPORT_SCRIPT,
    "--file", feedPath,
    "--source", DEFAULT_SOURCE,
    "--source-quality", "manufacturer",
    "--ingredient-verification", "label_ocr_verified",
    "--image-verification", "manufacturer",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
    "--expected-brand", DEFAULT_BRAND,
  ];
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
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
}

async function main() {
  const outputDir = compact(getArg("--output-dir")) || DEFAULT_OUTPUT_DIR;
  const apiUrl = compact(getArg("--api-url")) || DEFAULT_API_URL;
  const urlListPath = compact(getArg("--url-list"));
  const urlOffset = nonNegativeInteger(getArg("--url-offset"), 0);
  const urlLimit = positiveInteger(getArg("--url-limit"), null);
  const extractTimeoutMs = positiveInteger(getArg("--extract-timeout-ms"), 360_000);
  const importTimeoutMs = positiveInteger(getArg("--import-timeout-ms"), 60_000);
  const ocrTimeoutMs = positiveInteger(getArg("--ocr-timeout-ms"), 30_000);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);

  fs.mkdirSync(outputDir, { recursive: true });
  const imagesDir = path.join(outputDir, "nutrition-images");
  fs.mkdirSync(imagesDir, { recursive: true });
  const feedPath = path.join(outputDir, "feed.csv");
  const urlsPath = path.join(outputDir, "urls.txt");
  const rawOcrPath = path.join(outputDir, "ocr-raw-texts.json");
  const reportPath = path.join(outputDir, "report.json");
  const sqlDir = path.join(outputDir, "sql");

  const wantedUrls = new Set(
    urlListPath && fs.existsSync(urlListPath)
      ? fs.readFileSync(urlListPath, "utf8").split(/\r?\n/).map(compact).filter(Boolean)
      : []
  );
  const products = (await fetchProducts(apiUrl))
    .filter((product) => product?.acf?.live_on_production !== false);
  const filteredProducts = wantedUrls.size > 0
    ? products.filter((product) => wantedUrls.has(compact(product.link)))
    : products;
  const selected = urlLimit === null
    ? filteredProducts.slice(urlOffset)
    : filteredProducts.slice(urlOffset, urlOffset + urlLimit);
  fs.writeFileSync(urlsPath, `${selected.map((product) => product.link).join("\n")}\n`, "utf8");
  if (selected.length === 0) throw new Error("Natural Balance API import found zero products.");

  const startedAt = Date.now();
  const rows = [];
  const ocrEvidence = [];
  const warnings = [];

  for (const [index, product] of selected.entries()) {
    if (Date.now() - startedAt > extractTimeoutMs) {
      throw new Error(`Natural Balance OCR extraction timed out after ${extractTimeoutMs}ms`);
    }
    const acf = product.acf || {};
    let ingredientStatement = "";
    let ocrText = "";
    let selectedOcrMode = "";
    let ocrCandidates = [];
    let ingredientImagePath = "";
    try {
      ingredientImagePath = await downloadImage(acf.ingredients_image, imagesDir);
      ocrCandidates = ocrImageCandidates(ingredientImagePath, ocrTimeoutMs);
      for (const candidate of ocrCandidates) {
        const candidateStatement = ingredientStatementFromOcr(candidate.text);
        if (!isPlausibleIngredientStatement(candidateStatement)) continue;
        ingredientStatement = candidateStatement;
        ocrText = candidate.text;
        selectedOcrMode = candidate.mode;
        break;
      }
      if (!ingredientStatement) {
        warnings.push(`${product.link}: missing_or_implausible_ocr_ingredients`);
        ocrText = ocrCandidates[0]?.text || "";
      }
    } catch (error) {
      warnings.push(`${product.link}: ${error.message || error}`);
    }

    rows.push(rowFromProduct(product, ingredientStatement));
    ocrEvidence.push({
      id: product.id,
      url: product.link,
      ingredient_image_url: absoluteUrl(acf.ingredients_image),
      local_ingredient_image_path: ingredientImagePath,
      ocr_text: ocrText,
      selected_ocr_mode: selectedOcrMode,
      ocr_candidates: ocrCandidates.map((candidate) => {
        const candidateStatement = ingredientStatementFromOcr(candidate.text);
        return {
          mode: candidate.mode,
          ingredient_statement: candidateStatement,
          plausible: isPlausibleIngredientStatement(candidateStatement),
        };
      }),
      ingredient_statement: ingredientStatement,
    });
    if ((index + 1) % 25 === 0) {
      console.error(`Processed ${index + 1}/${selected.length} Natural Balance products`);
    }
  }

  writeCsv(feedPath, rows);
  fs.writeFileSync(rawOcrPath, `${JSON.stringify(ocrEvidence, null, 2)}\n`, "utf8");
  const importResult = runOfficialImport(feedPath, sqlDir, { sqlChunkSize, importTimeoutMs });
  const manifest = JSON.parse(fs.readFileSync(path.join(sqlDir, "manifest.json"), "utf8"));
  const report = {
    generated_at: new Date().toISOString(),
    brand: DEFAULT_BRAND,
    source: DEFAULT_SOURCE,
    source_quality: "manufacturer",
    ingredient_verification: "label_ocr_verified",
    image_verification: "manufacturer",
    api_url: apiUrl,
    discovered_products: products.length,
    filtered_products: filteredProducts.length,
    input_url_list_path: urlListPath || null,
    url_offset: urlOffset,
    url_limit: urlLimit,
    prepared_products: selected.length,
    feed: feedSummary(rows),
    rows_with_ingredient_image: selected.filter((product) => compact(product?.acf?.ingredients_image)).length,
    rows_with_ocr_text: ocrEvidence.filter((item) => compact(item.ocr_text)).length,
    plausible_ingredient_rows: rows.filter((row) => isPlausibleIngredientStatement(row.ingredient_statement)).length,
    sql_rows: manifest.total_sql_rows,
    feed_path: feedPath,
    selected_url_list_path: urlsPath,
    raw_ocr_path: rawOcrPath,
    sql_dir: sqlDir,
    extraction_warnings: warnings.join("\n"),
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Natural Balance official API OCR batch prepared: ${DEFAULT_SOURCE}`);
  console.log(`URLs: ${urlsPath}`);
  console.log(`Feed: ${feedPath}`);
  console.log(`OCR evidence: ${rawOcrPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Rows: ${report.feed.rows}; OCR ingredient rows: ${report.plausible_ingredient_rows}; SQL rows: ${report.sql_rows}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
