import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const OCR_SCRIPT = "scripts/ocr-image-text.swift";
const DEFAULT_PRODUCTS_API_URL = "https://solidgoldpet.com/products.json?limit=250";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/solid-gold";
const DEFAULT_SOURCE = "solid-gold";
const DEFAULT_BRAND = "Solid Gold";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 250;
const DEFAULT_FETCH_RETRIES = 3;
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
  /\b(variety\s+pack|sampler|bundle)\b/i,
  /\b(treat|treats|snack|snacks|chew|chews|jerky|biscuit|biscuits|dental)\b/i,
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|meal mixer|meal enhancer|enhancer|enhancers)\b/i,
  /\b(?:air\s*dried)\s+(?:topper|toppers|meal\s+topper|meal\s+or\s+topper)\b/i,
  /\b(bone broth|broth topper|broth toppers|stock|squeeze|squeezeable|mousse)\b/i,
  /\b(puree|purees|puree|purees|bisque|bisques|lickable|lickables)\b/i,
  /\b(supplement|supplements|complement|complementary|vitamin|probiotic)\b/i,
];
const MARKETING_IMAGE_PATTERNS = [
  /realingredients?/i,
  /real[_-]?ingredient/i,
  /perfectshred/i,
  /premiumkibble/i,
  /guthealth/i,
  /lifestyle/i,
  /benefits/i,
  /promise/i,
  /crosssell/i,
  /front/i,
  /vetrecommend/i,
];
const PROTEIN_TERMS = [
  "alaskan pollock",
  "beef tripe",
  "blended tuna",
  "chicken",
  "duck",
  "lamb",
  "mackerel",
  "oatmeal",
  "pollock",
  "quail",
  "salmon",
  "sardine",
  "shrimp",
  "tuna",
  "turkey",
  "venison",
  "whitefish",
  "beef",
  "bison",
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

function hasLikelyIngredientOcrArtifacts(value) {
  const text = compact(value);
  return (
    /[{}]/.test(text)
    || /\b[A-Za-z]{2,}[0-9][A-Za-z]+\b/.test(text)
    || /(^|[^A-Za-z])-\s*Ascorbyl-2-Polyphosphate\b/i.test(text)
    || /\bSupplement\.\s+preserved\s+with\b/i.test(text)
    || /\bI(?:Vitamin|min|max|preservative|Ferrous)\b/i.test(text)
    || /\b(?:Fructooli[0-9]osaccharides|Manganese[0-9]e|preserNative|subtillis|cooper\s+sulfate|sufate|sultate|ch[io]ride|calcium\s+lodate|lodate|pyridoxine\s+vitamin\s+b-?6|niain|nacin|nutri\*nt|r[0-9]cogniz[0-9]d|[0-9]ssential|potss+sium|vitss?min|d\.calcium)\b/i.test(text)
    || /\bMi\s+nerals\b/i.test(text)
  );
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

function normalizeText(value) {
  return compact(decodeEntities(value))
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|[^\x00-\x7F]|[®™©]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value, baseUrl = "https://solidgoldpet.com/") {
  const text = compact(value);
  if (!text || /^data:/i.test(text)) return "";
  try {
    return new URL(text.replace(/^\/\//, "https://"), baseUrl).toString();
  } catch {
    return text;
  }
}

function normalizeGtin(value) {
  const digits = compact(value).replace(/[^0-9]/g, "");
  return digits.length >= 8 ? digits : "";
}

function productTags(product) {
  if (Array.isArray(product.tags)) return product.tags.map(compact).filter(Boolean);
  return String(product.tags || "")
    .split(",")
    .map(compact)
    .filter(Boolean);
}

function productUrl(product) {
  return `https://solidgoldpet.com/products/${product.handle}`;
}

function sourceUrlForVariant(product, variant = {}) {
  return variant.id ? `${productUrl(product)}?variant=${variant.id}` : productUrl(product);
}

async function fetchWithRetry(url, {
  accept,
  retries = DEFAULT_FETCH_RETRIES,
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WoofCatalogVerifier/1.0 (Solid Gold official Shopify OCR import)",
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

function isFoodProduct(product) {
  const type = compact(product.product_type);
  if (type !== "Dry Food" && type !== "Wet Food") return false;
  const identity = [
    product.title,
    product.handle,
    product.product_type,
    productTags(product).join(" "),
  ].join(" ");
  return !NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identity));
}

function inferPetType(product) {
  const authoritativeText = normalizeText([
    product.title,
    product.product_type,
    productTags(product).join(" "),
  ].join(" "));
  const authoritativeDog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(authoritativeText);
  const authoritativeCat = /\b(cat|cats|kitten|kittens|feline)\b/.test(authoritativeText);
  if (authoritativeDog && !authoritativeCat) return "dog";
  if (authoritativeCat && !authoritativeDog) return "cat";

  const text = normalizeText([
    product.title,
    product.handle,
    product.product_type,
    productTags(product).join(" "),
  ].join(" "));
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferLifeStage(product) {
  const text = normalizeText([
    product.title,
    product.handle,
    productTags(product).join(" "),
  ].join(" "));
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  if (/\ball\s+life\s+stages\b/.test(text)) return "all life stages";
  return "";
}

function inferFoodForm(product) {
  const text = normalizeText([product.product_type, product.title, product.handle].join(" "));
  if (/\bdry\b/.test(text)) return "dry";
  if (/\bwet|pate|pat[eé]|shreds|gravy|can\b/.test(text)) return "wet";
  return "";
}

function looksLikePackageSize(value) {
  return /\b(\d+(?:\.\d+)?\s*(?:oz|ounce|lb|lbs|pound|pack|ct|count|can|bowl)|pack of|case|tray)\b/i.test(compact(value));
}

function proteinTermsIn(value) {
  const text = normalizeText(value);
  return PROTEIN_TERMS.filter((term) => {
    const normalized = normalizeText(term);
    return new RegExp(`(^|\\s)${normalized.replace(/\s+/g, "\\s+")}(\\s|$)`).test(text);
  });
}

function inferFlavor(product, variant = {}) {
  const option1 = compact(variant.option1);
  if (option1 && !looksLikePackageSize(option1)) return option1;

  const tagFlavor = productTags(product)
    .filter((tag) => !/^(dog|cat|dry food|wet food|everyday nutrition|sensitive stomach|high protein|nutrientboost|flag_|save|whole grain|grain free|weight control|gut health)$/i.test(tag))
    .find((tag) => proteinTermsIn(tag).length > 0);
  if (tagFlavor) return tagFlavor;

  const title = compact(product.title);
  const terms = proteinTermsIn(title);
  return terms.length > 0 ? terms.join(" & ") : "";
}

function packageSizeForVariant(variant = {}) {
  const option2 = compact(variant.option2);
  if (option2) return option2;
  const option1 = compact(variant.option1);
  if (looksLikePackageSize(option1)) return option1;
  return compact(variant.title);
}

function cleanProductName(product) {
  return compact(decodeEntities(product.title))
    .replace(/[®™©]/g, "")
    .replace(/\s*\|\s*Solid Gold\s*$/i, "")
    .replace(/\s{2,}/g, " ");
}

function imageText(image = {}) {
  return [image.src, image.alt].map(compact).join(" ");
}

function ingredientCandidateScore(image, product, flavor) {
  const text = imageText(image);
  const filename = normalizeText(path.basename(new URL(normalizeUrl(image.src)).pathname));
  const alt = normalizeText(image.alt);
  let score = 0;

  if (/(^|[_\-\s])ingredients?([_\-\s]|$)/i.test(text)) score += 140;
  if (/\bingredients?\b/i.test(image.alt || "")) score += 180;
  if (/ingredient list|ingredients and guaranteed|guaranteed analysis/i.test(image.alt || "")) score += 120;
  if (/(^|[_\-\s])back([_\-\s]|$)/i.test(text) || /\bback\b/i.test(image.alt || "")) score += 85;
  if (/(^|[_\-\s])right([_\-\s]|$)/i.test(text) || /\bright\b/i.test(image.alt || "")) score += 65;
  if (/label/i.test(image.alt || "")) score += 30;
  if (/\b(?:feeding|suggested daily portions|guaranteed analysis|nutritional information)\b/i.test(image.alt || "") && !/\bingredients?\b/i.test(image.alt || "")) score -= 130;
  if (/\bingredient\s+checklist\b/i.test(image.alt || "")) score -= 280;
  if (/(^|[_\-\s])left([_\-\s]|$)/i.test(text) && !/\bingredients?\b/i.test(image.alt || "")) score -= 60;

  for (const pattern of MARKETING_IMAGE_PATTERNS) {
    if (pattern.test(filename) || pattern.test(alt)) score -= 100;
  }

  const flavorTerms = proteinTermsIn(flavor);
  const imageTerms = proteinTermsIn(text);
  const productTerms = proteinTermsIn([product.title, productTags(product).join(" ")].join(" "));
  const termsToMatch = flavorTerms.length > 0 ? flavorTerms : productTerms;
  for (const term of termsToMatch) {
    if (imageTerms.includes(term)) score += 50;
  }
  for (const term of imageTerms) {
    if (termsToMatch.length > 0 && !termsToMatch.includes(term)) score -= 35;
  }

  return score;
}

function ingredientImageForProduct(product, flavor) {
  const images = Array.isArray(product.images) ? product.images : [];
  const candidates = images
    .map((image) => ({
      image,
      score: ingredientCandidateScore(image, product, flavor),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0] || null;
}

function productImageForVariant(product, variant = {}) {
  const images = Array.isArray(product.images) ? product.images : [];
  const variantImage = images.find((image) => Array.isArray(image.variant_ids) && image.variant_ids.includes(variant.id));
  const barcode = normalizeGtin(variant.barcode);
  const barcodeImage = images.find((image) => barcode && String(image.src || "").includes(barcode));
  const flavor = inferFlavor(product, variant);
  const flavorTerms = proteinTermsIn(flavor);
  const flavorImage = images.find((image) => {
    const terms = proteinTermsIn(imageText(image));
    return flavorTerms.length > 0 && flavorTerms.every((term) => terms.includes(term)) && !/ingredients|back|right/i.test(imageText(image));
  });
  return normalizeUrl(variantImage?.src || barcodeImage?.src || flavorImage?.src || product.image?.src || images[0]?.src);
}

async function downloadImage(url, imagesDir) {
  const imageUrl = normalizeUrl(url);
  const extension = path.extname(new URL(imageUrl).pathname).replace(/[^.a-z0-9]/gi, "") || ".img";
  const filename = `${crypto.createHash("sha1").update(imageUrl).digest("hex")}${extension}`;
  const filePath = path.join(imagesDir, filename);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return filePath;

  const response = await fetchWithRetry(imageUrl, {
    accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
  });
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

function convertedImagePath(imagePath) {
  const outputPath = imagePath.replace(/\.[^.]+$/i, ".ocr.jpg");
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) return outputPath;

  const converted = spawnSync("sips", ["-s", "format", "jpeg", "-Z", "3000", imagePath, "--out", outputPath], {
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

function ocrImage(imagePath, timeoutMs) {
  return runOcrImage(imagePath, [], timeoutMs);
}

function ocrImageCandidates(imagePath, timeoutMs) {
  const candidates = [];
  const seen = new Set();
  for (const mode of OCR_MODES) {
    const text = runOcrImage(imagePath, mode.args, timeoutMs);
    const key = compact(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const ingredientStatement = ingredientStatementFromOcr(text);
    candidates.push({
      mode: mode.label,
      text,
      ingredient_statement: ingredientStatement,
      guaranteed_analysis: guaranteedAnalysisFromOcr(text),
      plausible: isPlausibleIngredientStatement(ingredientStatement),
    });
  }
  return candidates;
}

function cleanOcrText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\bPotassium\s+lodidel\b/g, "Potassium Iodide")
    .replace(/\bPotassium\s+lodide\b/g, "Potassium Iodide")
    .replace(/\bPotassium\s+lodides\b/g, "Potassium Iodide")
    .replace(/\bCalcium\s+lodate\b/gi, "Calcium Iodate")
    .replace(/\blodidel\b/g, "Iodide")
    .replace(/\blodide\b/g, "Iodide")
    .replace(/\blodate\b/gi, "Iodate")
    .replace(/\bIbs\b/g, "lbs")
    .replace(/\bChlo-\s+ride\b/gi, "Chloride")
    .replace(/\bHydro-\s+chloride\b/gi, "Hydrochloride")
    .replace(/\bCran-\s+berries\b/gi, "Cranberries")
    .replace(/\bSun-\s*flower\b/gi, "Sunflower")
    .replace(/\bMono-\s*nitrate\b/gi, "Mononitrate")
    .replace(/\bSupple-\s*ment\b/gi, "Supplement")
    .replace(/\bVita-\s*min\b/gi, "Vitamin")
    .replace(/\bPoly-\s*phosphate\b/gi, "Polyphosphate")
    .replace(/\bVitamins\s+Vitamin\s+E\b/g, "Vitamins (Vitamin E")
    .replace(/\bVitaminE\b/g, "Vitamin E")
    .replace(/\bZine\s+(Oxide|Sulfate|Proteinate)\b/g, "Zinc $1")
    .replace(/\bRibotlavin\b/g, "Riboflavin")
    .replace(/\bSufate\b/g, "Sulfate")
    .replace(/\bChoride\b/g, "Chloride")
    .replace(/\bNacin\b/g, "Niacin")
    .replace(/\bVitamin\s+Da\b/g, "Vitamin D3")
    .replace(/\bCopperAmino\b/g, "Copper Amino")
    .replace(/\bMinerals\s+(Zinc|Reduced|Ferrous|Iron|Sodium|Manganese|Copper|Potassium)\b/g, "Minerals ($1")
    .replace(/\bnutritionall\b/gi, "nutritional")
    .split(/\n+/)
    .map(compact)
    .filter(Boolean)
    .join("\n");
}

function lineStartsIngredientSection(line) {
  return /^ingredients?\s*:?\b/i.test(line) && !/guaranteed\s+analysis/i.test(line);
}

function ingredientStatementFromOcr(ocrText) {
  const lines = String(ocrText || "").split(/\n+/).map(compact).filter(Boolean);
  let start = lines.findIndex(lineStartsIngredientSection);
  if (start === -1) {
    const titleIndex = lines.findIndex((line) => /^ingredients?\s*&\s*guaranteed\s+analysis/i.test(line));
    if (titleIndex !== -1) {
      start = lines.findIndex((line, index) => index > titleIndex && /^ingredients?\s*:/i.test(line));
    }
  }
  if (start === -1) return "";

  const collected = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^(calorie content|guaranteed analysis|feeding|feed\s|AAFCO)\b/i.test(line)) break;
    collected.push(line);
  }

  return compact(collected.join(" "))
    .replace(/^ingredients?\s*:?\s*/i, "")
    .replace(/\b(?:nutritionally complete|solid gold\b[\s\S]*?\bis formulated to meet|this product is formulated|calorie content|guaranteed analysis|feeding instructions|AAFCO)\b[\s\S]*$/i, "")
    .replace(/([A-Za-z])-\s+([a-z])/g, "$1$2")
    .replace(/2-\s+Poly/gi, "2-Poly")
    .replace(/\b(Barley|Iodate)\.\s+(Oatmeal|Dried Chicory)\b/g, "$1, $2")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

function guaranteedAnalysisFromOcr(ocrText) {
  const lines = String(ocrText || "").split(/\n+/).map(compact).filter(Boolean);
  const start = lines.findIndex((line) => /^guaranteed\s+analysis\b/i.test(line));
  if (start === -1) return "";
  const collected = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^(feeding|feed\s|AAFCO)\b/i.test(line)) break;
    collected.push(line);
  }
  return compact(collected.join(" "))
    .replace(/\s+/g, " ")
    .trim();
}

function isPlausibleIngredientStatement(value) {
  const text = compact(value);
  if (!text || text.length < 35) return false;
  if (hasUnbalancedParentheses(text)) return false;
  if (hasLikelyIngredientOcrArtifacts(text)) return false;
  if (/\b(?:real\s+\w+\s+is\s+the\s+#?1\s+ingredient|the perfect shred|premium kibble|find a store|shop all|subscribe|add to cart|feeding instructions|calorie content|guaranteed analysis|nutrients to support|healthy skin\s*&\s*coat)\b/i.test(text)) return false;
  if (/\b(?:lodide|lodate|grouna|rlaxseea|mixec|suntlower|sunttower)\b/i.test(text)) return false;
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 5) return false;
  if (items.some((item) => item.length > 220)) return false;
  return true;
}

function textFromHtml(value) {
  return compact(stripTags(value));
}

function productAccordionText(html, headingPattern) {
  const detailsPattern = /<details\b[\s\S]*?<\/details>/gi;
  for (const match of html.matchAll(detailsPattern)) {
    const block = match[0];
    const title = textFromHtml(block.match(/<summary\b[\s\S]*?<\/summary>/i)?.[0] || "");
    if (headingPattern.test(title)) return textFromHtml(block);
  }
  return "";
}

function guaranteedAnalysisFromHtml(html) {
  const text = productAccordionText(html, /ingredients?\s*&\s*guaranteed\s+analysis/i);
  if (!text) return "";
  return compact(text)
    .replace(/^ingredients?\s*&\s*guaranteed\s+analysis\s*/i, "Guaranteed Analysis ")
    .replace(/\bServing Guidance\b[\s\S]*$/i, "")
    .replace(/\bFeeding Instructions\b[\s\S]*$/i, "")
    .trim();
}

function rowsForProduct({ product, html, ingredientStatement, ocrText, wantedUrls = new Set() }) {
  const variants = Array.isArray(product.variants) && product.variants.length > 0
    ? product.variants
    : [{ id: product.id, title: "", barcode: "", option1: "" }];
  const petType = inferPetType(product);
  const productName = cleanProductName(product);
  const productLine = compact(product.product_type);
  const foodForm = inferFoodForm(product);
  const lifeStage = inferLifeStage(product);
  const fallbackAnalysis = guaranteedAnalysisFromHtml(html) || guaranteedAnalysisFromOcr(ocrText);
  return variants.map((variant) => {
    const gtin = normalizeGtin(variant.barcode);
    const packageSize = packageSizeForVariant(variant);
    const sourceUrl = sourceUrlForVariant(product, variant);
    return {
      cache_key: gtin ? `${DEFAULT_SOURCE}:${gtin}` : `${DEFAULT_SOURCE}:${product.handle}:${compact(variant.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      gtin,
      product_name: productName,
      brand: DEFAULT_BRAND,
      product_line: productLine,
      flavor: inferFlavor(product, variant),
      life_stage: lifeStage,
      food_form: foodForm,
      package_size: packageSize,
      pet_type: petType,
      ingredient_statement: ingredientStatement,
      product_image_url: productImageForVariant(product, variant),
      product_url: sourceUrl,
      is_complete_food: "true",
      guaranteed_analysis: fallbackAnalysis,
      source_quality: "manufacturer",
      ingredient_verification_status: "label_ocr_verified",
      image_verification_status: "manufacturer",
    };
  }).filter((row) => (
    wantedUrls.size === 0
    || wantedUrls.has(productUrl(product))
    || wantedUrls.has(row.product_url)
  ));
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
    dog_rows: rows.filter((row) => row.pet_type === "dog").length,
    cat_rows: rows.filter((row) => row.pet_type === "cat").length,
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
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function windowItems(items, offset, limit) {
  return limit === null ? items.slice(offset) : items.slice(offset, offset + limit);
}

async function main() {
  const outputDir = compact(getArg("--output-dir")) || DEFAULT_OUTPUT_DIR;
  const productsApiUrl = compact(getArg("--products-api-url")) || DEFAULT_PRODUCTS_API_URL;
  const urlOffset = nonNegativeInteger(getArg("--url-offset"), 0);
  const urlLimit = positiveInteger(getArg("--url-limit"), null);
  const extractTimeoutMs = positiveInteger(getArg("--extract-timeout-ms"), 480_000);
  const importTimeoutMs = positiveInteger(getArg("--import-timeout-ms"), 60_000);
  const ocrTimeoutMs = positiveInteger(getArg("--ocr-timeout-ms"), 30_000);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), DEFAULT_FETCH_DELAY_MS);
  const allowPartialProducts = hasArg("--allow-partial-products");
  const urlListPath = compact(getArg("--url-list"));

  fs.mkdirSync(outputDir, { recursive: true });
  const imagesDir = path.join(outputDir, "nutrition-images");
  fs.mkdirSync(imagesDir, { recursive: true });
  const feedPath = path.join(outputDir, "feed.csv");
  const urlsPath = path.join(outputDir, "urls.txt");
  const rawOcrPath = path.join(outputDir, "ocr-raw-texts.json");
  const reportPath = path.join(outputDir, "report.json");
  const sqlDir = path.join(outputDir, "sql");

  const apiPayload = await fetchJson(productsApiUrl);
  const discoveredProducts = Array.isArray(apiPayload.products) ? apiPayload.products : [];
  const wantedUrls = new Set(
    urlListPath && fs.existsSync(urlListPath)
      ? fs.readFileSync(urlListPath, "utf8").split(/\r?\n/).map(compact).filter(Boolean)
      : []
  );
  const candidateProducts = discoveredProducts
    .filter(isFoodProduct)
    .filter((product) => {
      if (wantedUrls.size === 0) return true;
      if (wantedUrls.has(productUrl(product))) return true;
      const variants = Array.isArray(product.variants) ? product.variants : [];
      return variants.some((variant) => wantedUrls.has(sourceUrlForVariant(product, variant)));
    });
  const selected = windowItems(candidateProducts, urlOffset, urlLimit);
  fs.writeFileSync(urlsPath, `${selected.map(productUrl).join("\n")}\n`, "utf8");
  if (selected.length === 0) throw new Error("Solid Gold import found zero complete-food product candidates.");

  const startedAt = Date.now();
  const rows = [];
  const ocrEvidence = [];
  const warnings = [];

  for (const [index, listedProduct] of selected.entries()) {
    if (Date.now() - startedAt > extractTimeoutMs) {
      throw new Error(`Solid Gold OCR extraction timed out after ${extractTimeoutMs}ms`);
    }

    const url = productUrl(listedProduct);
    try {
      await sleep(fetchDelayMs);
      const [{ product }, html] = await Promise.all([
        fetchJson(`${url}.json`),
        fetchText(url),
      ]);
      const flavor = inferFlavor(product, product.variants?.[0] || {});
      const candidate = ingredientImageForProduct(product, flavor);
      let ingredientStatement = "";
      let ocrText = "";
      let selectedOcrMode = "";
      let ocrCandidates = [];
      let ingredientImagePath = "";
      if (candidate?.image?.src) {
        ingredientImagePath = await downloadImage(candidate.image.src, imagesDir);
        ocrCandidates = ocrImageCandidates(ingredientImagePath, ocrTimeoutMs);
        const selectedCandidate = ocrCandidates.find((item) => item.plausible) || null;
        ocrText = selectedCandidate?.text || ocrCandidates[0]?.text || "";
        selectedOcrMode = selectedCandidate?.mode || "";
        ingredientStatement = selectedCandidate?.ingredient_statement || "";
      }
      if (!isPlausibleIngredientStatement(ingredientStatement)) {
        warnings.push(`${url}: missing_or_implausible_ocr_ingredients`);
        ingredientStatement = "";
      }

      rows.push(...rowsForProduct({ product, html, ingredientStatement, ocrText, wantedUrls }));
      ocrEvidence.push({
        id: product.id,
        url,
        selected_image_url: normalizeUrl(candidate?.image?.src || ""),
        selected_image_score: candidate?.score || 0,
        selected_image_alt: compact(candidate?.image?.alt || ""),
        local_ingredient_image_path: ingredientImagePath,
        ocr_text: ocrText,
        selected_ocr_mode: selectedOcrMode,
        ocr_candidates: ocrCandidates.map((item) => ({
          mode: item.mode,
          plausible: item.plausible,
          ingredient_statement: item.ingredient_statement,
        })),
        ingredient_statement: ingredientStatement,
      });

      if ((index + 1) % 10 === 0) {
        console.error(`Processed ${index + 1}/${selected.length} Solid Gold products`);
      }
    } catch (error) {
      if (!allowPartialProducts) throw error;
      warnings.push(`${url}: ${error.message || error}`);
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
    products_api_url: productsApiUrl,
    discovered_products: discoveredProducts.length,
    complete_food_candidates: candidateProducts.length,
    url_offset: urlOffset,
    url_limit: urlLimit,
    input_url_list_path: urlListPath || null,
    prepared_products: selected.length,
    fetch_delay_ms: fetchDelayMs,
    feed: feedSummary(rows),
    rows_with_ingredient_image: ocrEvidence.filter((item) => compact(item.selected_image_url)).length,
    rows_with_ocr_text: ocrEvidence.filter((item) => compact(item.ocr_text)).length,
    plausible_ingredient_products: ocrEvidence.filter((item) => isPlausibleIngredientStatement(item.ingredient_statement)).length,
    plausible_ingredient_rows: rows.filter((row) => isPlausibleIngredientStatement(row.ingredient_statement)).length,
    sql_rows: manifest.total_sql_rows,
    feed_path: feedPath,
    url_list_path: urlsPath,
    raw_ocr_path: rawOcrPath,
    sql_dir: sqlDir,
    extraction_warnings: warnings.join("\n"),
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Solid Gold official Shopify OCR batch prepared: ${DEFAULT_SOURCE}`);
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
