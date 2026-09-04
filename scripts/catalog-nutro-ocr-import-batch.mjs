import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_URL_DISCOVERY_SCRIPT = "scripts/catalog-source-url-discovery.mjs";
const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const OCR_SCRIPT = "scripts/ocr-image-text.swift";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/nutro";
const DEFAULT_SOURCE = "nutro";
const DEFAULT_BRAND = "Nutro";
const DEFAULT_TARGET_URL = "https://www.nutro.com/";
const DEFAULT_REQUIRED_URL_PATTERN = "^https://www\\.nutro\\.com/products/";
const DEFAULT_MAX_URLS = 250;
const DEFAULT_MIN_SCORE = 1;
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

function visibleText(html) {
  return compact(decodeEntities(stripTags(html)));
}

function absoluteUrl(value, baseUrl) {
  const text = compact(value);
  if (!text || /^data:/i.test(text)) return "";
  try {
    return new URL(text, baseUrl || undefined).toString();
  } catch {
    return text;
  }
}

function firstText(...values) {
  for (const value of values) {
    const text = compact(decodeEntities(value));
    if (text) return text;
  }
  return "";
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

function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const nodes = [];

  for (const [, raw] of blocks) {
    try {
      nodes.push(...allJsonLdNodes(JSON.parse(decodeEntities(raw).trim())));
    } catch {
      // Keep extracting from other evidence blocks.
    }
  }

  return nodes;
}

function typeIncludes(node, expected) {
  const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
  return types.some((type) => String(type || "").toLowerCase() === expected.toLowerCase());
}

function productNode(nodes) {
  return nodes.find((node) => typeIncludes(node, "Product")) || null;
}

function metaContent(html, ...names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeEntities(match[1]);
    }
  }
  return "";
}

function canonicalUrl(html, baseUrl) {
  const match = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  return absoluteUrl(match?.[1], baseUrl);
}

function normalizeImage(value, baseUrl) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = normalizeImage(item, baseUrl);
      if (image) return image;
    }
    return "";
  }
  if (typeof value === "object" && value) {
    return absoluteUrl(value.url || value.contentUrl || value["@id"], baseUrl);
  }
  return absoluteUrl(value, baseUrl);
}

function cleanProductName(value, brand = "") {
  const text = compact(decodeEntities(value))
    .replace(/\bTM\b/g, "")
    .replace(/[®™]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const cleanBrand = compact(brand);
  const withoutTrailingBrand = cleanBrand ? text.replace(new RegExp(`\\s*[|–-]\\s*${cleanBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "").trim() : text;

  if (/^eukanuba$/i.test(cleanBrand) && /^euk\s+prem\s+perf\b/i.test(withoutTrailingBrand)) {
    return withoutTrailingBrand
      .replace(/^euk\s+prem\s+perf\b/i, "Premium Performance")
      .replace(/\bSPORT\b/g, "Sport")
      .replace(/\s+/g, " ")
      .trim();
  }

  return withoutTrailingBrand;
}

function normalizeBrand(value) {
  if (typeof value === "string") return compact(value);
  return compact(value?.name || value?.brand || value?.["@id"]);
}

function normalizeGtin(value) {
  const digits = compact(value).replace(/[^0-9]/g, "");
  return digits.length >= 8 ? digits : "";
}

function parseDrupalSettings(html) {
  const match = html.match(/<script\b[^>]*data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return {};
  try {
    return JSON.parse(decodeEntities(match[1]).trim());
  } catch {
    return {};
  }
}

function parseTaxonomy(settings) {
  const taxonomy = settings?.dataLayer?.taxonomy;
  if (!taxonomy) return {};
  if (typeof taxonomy === "object") return taxonomy;
  try {
    return JSON.parse(taxonomy);
  } catch {
    return {};
  }
}

function parseDataLayerSettings(html) {
  const match = String(html || "").match(/window\.dataLayerSettings\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i);
  if (!match?.[1]) return {};
  try {
    return JSON.parse(decodeEntities(match[1]).trim());
  } catch {
    return {};
  }
}

function pageDataValue(settings, ...names) {
  const pageData = settings?.page_data || {};
  for (const name of names) {
    const value = pageData[name];
    if (Array.isArray(value)) return value.map(compact).filter(Boolean).join(", ");
    const text = compact(value);
    if (text) return text;
  }
  return "";
}

function taxonomyValue(taxonomy, ...names) {
  const expected = new Set(names.map((name) => compact(name).toLowerCase()));
  for (const [key, value] of Object.entries(taxonomy || {})) {
    if (!expected.has(compact(key).toLowerCase())) continue;
    if (Array.isArray(value)) return value.map(compact).filter(Boolean).join(", ");
    return compact(value);
  }
  return "";
}

function singleTaxonomyValue(taxonomy, ...names) {
  const expected = new Set(names.map((name) => compact(name).toLowerCase()));
  for (const [key, value] of Object.entries(taxonomy || {})) {
    if (!expected.has(compact(key).toLowerCase())) continue;
    if (!Array.isArray(value)) return compact(value);
    const values = value.map(compact).filter(Boolean);
    return values.length === 1 ? values[0] : "";
  }
  return "";
}

function singlePageDataValue(settings, ...names) {
  const pageData = settings?.page_data || {};
  for (const name of names) {
    const value = pageData[name];
    if (!Array.isArray(value)) {
      const text = compact(value);
      if (text) return text;
      continue;
    }
    const values = value.map(compact).filter(Boolean);
    if (values.length === 1) return values[0];
  }
  return "";
}

function inferPetType(...values) {
  const text = values.map(compact).join(" ").toLowerCase();
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferLifeStage(name) {
  const text = compact(name).toLowerCase();
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  if (/\ball life stages\b/.test(text)) return "all life stages";
  return "";
}

function inferFoodForm(name) {
  const text = compact(name).toLowerCase();
  if (/\bfreeze[- ]?dried\b/.test(text)) return "freeze-dried";
  if (/\bdehydrated\b/.test(text)) return "dehydrated";
  if (/\bfrozen\b/.test(text)) return "frozen";
  if (/\bfresh\b/.test(text)) return "fresh";
  if (/\bwet|can|canned|pate|pat[eé]|stew|gravy|morsels|chunks|shreds\b/.test(text)) return "wet";
  if (/\bdry|kibble\b/.test(text)) return "dry";
  return "";
}

function cleanFoodForm(value, fallbackText = "") {
  const text = compact(value).toLowerCase();
  const inferred = inferFoodForm(fallbackText);
  if (!text) return inferred;
  if (text.includes(",")) return inferred;
  if (/\btreat|chew|biscuit|dental\b/.test(text) && inferred && inferred !== "treat") return inferred;
  if (/\bdry\b/.test(text)) return "dry";
  if (/\bwet|can|canned|pouch|pate|pat[eé]|stew|gravy|morsels|chunks|shreds\b/.test(text)) return "wet";
  return inferred || text;
}

function inferProductLine(name, brand) {
  const cleanName = compact(name);
  const cleanBrand = compact(brand);
  if (!cleanName || !cleanBrand) return "";
  const withoutBrand = cleanName.replace(new RegExp(`^${cleanBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  const parts = withoutBrand.split(/,|\b(?:Chicken|Beef|Turkey|Salmon|Lamb|Duck|Tuna|Whitefish|Venison|Pork|Rabbit|Cod|Trout)\b/i);
  return cleanProductName(parts[0] || "")
    .replace(/\b(?:dog|cat|puppy|kitten|food)\b/gi, "")
    .replace(/\s*[–—-]\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removePhrase(value, phrase) {
  const text = compact(value);
  const cleanPhrase = compact(phrase);
  if (!text || !cleanPhrase) return text;
  return text.replace(new RegExp(`\\b${cleanPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ");
}

function inferFlavor(name, brand = "", productLine = "") {
  const text = removePhrase(removePhrase(name, brand), productLine)
    .replace(/\b(?:dog|cat|puppy|kitten|adult|senior|dry|wet|food|kibble|canned|can|lb|lbs|oz|ct|count|pack)\b/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ");
  const recipeMatch = text.match(/(?:^|,\s*)([^,]{3,100}?\b(?:recipe|formula|dinner|entree|entr[eé]e|flavor)\b)/i);
  if (recipeMatch?.[1]) return compact(recipeMatch[1]);
  const proteinMatch = text.match(/\b(chicken|beef|turkey|salmon|lamb|duck|tuna|whitefish|venison|pork|rabbit|cod|trout)(?:\s*(?:&|and|with)\s*[a-z ]{2,40})?/i);
  return compact(proteinMatch?.[0] || "");
}

function inferIsCompleteFood({ productName = "", productLine = "", productUrl = "", category = "" } = {}) {
  const identityText = [
    productName,
    productLine,
    category,
    productUrl,
  ].map(compact).join(" ").toLowerCase();

  return NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identityText)) ? "false" : "true";
}

function officialImageUrl(value) {
  const url = compact(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const marker = "/sites/g/files/";
    const index = parsed.pathname.indexOf(marker);
    if (parsed.pathname.startsWith("/cdn-cgi/image/") && index !== -1) {
      parsed.pathname = parsed.pathname.slice(index);
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function firstSrcsetUrl(value) {
  return compact(value)
    .split(",")
    .map((candidate) => compact(candidate).split(/\s+/)[0])
    .find(Boolean) || "";
}

function imageUrlFromTag(tag, baseUrl) {
  const candidates = [
    tag.match(/\bsrc=(["'])([\s\S]*?)\1/i)?.[2],
    tag.match(/\bdata-src=(["'])([\s\S]*?)\1/i)?.[2],
    firstSrcsetUrl(tag.match(/\bsrcset=(["'])([\s\S]*?)\1/i)?.[2] || ""),
  ]
    .map((candidate) => decodeEntities(compact(candidate)))
    .filter((candidate) => candidate && !candidate.startsWith("data:"));

  const url = absoluteUrl(candidates[0] || "", baseUrl);
  return officialImageUrl(url);
}

function imageByAlt(html, baseUrl, expectedPattern) {
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => tag);
  for (const tag of images) {
    const alt = tag.match(/\balt=(["'])([\s\S]*?)\1/i)?.[2] || "";
    if (!expectedPattern.test(decodeEntities(alt))) continue;
    const url = imageUrlFromTag(tag, baseUrl);
    if (url) return url;
  }
  return "";
}

function productHeroHtml(html) {
  const startIndex = html.search(/<section\b[^>]*class=(["'])[^"']*\bpdp-hero\b[^"']*\1/i);
  if (startIndex === -1) return "";

  const rest = html.slice(startIndex);
  const stopPatterns = [
    /<div\b[^>]*data-block-plugin-id=(["'])recommendations_module\1/i,
    /<section\b[^>]*class=(["'])[^"']*\brecommendations\b[^"']*\1/i,
    /<div\b[^>]*data-block-plugin-id=(["'])pn_rating_bazarvoice_block\1/i,
  ];
  const stopIndex = stopPatterns
    .map((pattern) => rest.search(pattern))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0];

  return rest.slice(0, stopIndex || undefined);
}

function productGalleryImageUrls(html, baseUrl) {
  const heroHtml = productHeroHtml(html);
  if (!heroHtml) return [];

  const urls = [...heroHtml.matchAll(/<img\b[^>]*>/gi)]
    .map(([tag]) => imageUrlFromTag(tag, baseUrl))
    .filter((url) => /\/migrate-product-files\/images\//i.test(url));

  return [...new Set(urls)];
}

function isRedirectLoopError(error) {
  return /redirect|maximum|too many/i.test(String(error?.message || error));
}

async function fetchWithRetry(url, options, { attempts = 3, delayMs = 500 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      lastError = new Error(`${url}: HTTP ${response.status}`);
      if (response.status >= 300 && response.status < 400) break;
    } catch (error) {
      lastError = error;
      if (isRedirectLoopError(error)) break;
    }
    if (attempt < attempts) await sleep(delayMs * attempt);
  }
  throw lastError || new Error(`${url}: fetch failed`);
}

async function fetchText(url) {
  const response = await fetchWithRetry(url, {
    headers: {
      "User-Agent": "WoofCatalogVerifier/1.0 (official OCR import)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  return {
    html: await response.text(),
    sourceUrl: response.url || url,
  };
}

async function downloadImage(url, imagesDir) {
  const imageUrl = officialImageUrl(url);
  const extension = path.extname(new URL(imageUrl).pathname).replace(/[^.a-z0-9]/gi, "") || ".png";
  const filename = `${crypto.createHash("sha1").update(imageUrl).digest("hex")}${extension}`;
  const filePath = path.join(imagesDir, filename);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return filePath;

  const response = await fetchWithRetry(imageUrl, {
    headers: {
      "User-Agent": "WoofCatalogVerifier/1.0 (official OCR import)",
      "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
    },
  });
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

function runOcrImage(imagePath, args, timeoutMs) {
  const result = spawnSync("swift", [OCR_SCRIPT, ...args, imagePath], {
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
    throw new Error([`OCR failed for ${imagePath}`, result.stderr, result.stdout].filter(Boolean).join("\n"));
  }

  return cleanOcrText(result.stdout || "");
}

function ocrImage(imagePath, timeoutMs) {
  return runOcrImage(imagePath, [], timeoutMs);
}

function ocrImageCandidates(imagePath, timeoutMs, sourceUrl = "") {
  const candidates = [];
  const seen = new Set();
  for (const mode of OCR_MODES) {
    const text = runOcrImage(imagePath, mode.args, timeoutMs);
    const key = compact(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const ingredientStatement = ingredientStatementFromOcr(text, sourceUrl);
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

function candidateEvidence(imageUrl, imagePath, candidates) {
  return candidates.map((candidate) => ({
    image_url: imageUrl,
    local_image_path: imagePath,
    mode: candidate.mode,
    plausible: candidate.plausible,
    ingredient_statement: candidate.ingredient_statement,
  }));
}

function cleanOcrText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\bPotassium\s+lodidel\b/g, "Potassium Iodide")
    .replace(/\bPotassium\s+lodide\b/g, "Potassium Iodide")
    .replace(/\blodidel\b/g, "Iodide")
    .replace(/\blodide\b/g, "Iodide")
    .replace(/\bcalcium\s+iodatel\b/gi, "calcium iodate]")
    .replace(/\bfolic\s+acidl\b/gi, "folic acid]")
    .replace(/(\d)lU\/kg\b/g, "$1 IU/kg")
    .replace(/(\d)1U\/kg\b/g, "$1 IU/kg")
    .replace(/\blU\/kg\b/g, "IU/kg")
    .replace(/\b1U\/kg\b/g, "IU/kg")
    .replace(/\bBHA\s*\/\s*CITRIC\b/gi, "BHA AND CITRIC")
    .replace(/\bBYPRODUCT\b/gi, "BY-PRODUCT")
    .replace(/\bCITRIC ACID[IJ]\s*,/gi, "CITRIC ACID]),")
    .replace(/\bCITRIC ACID[IJ]\s*\)/gi, "CITRIC ACID])")
    .replace(/\bCITRIC ACID[IJ]\b/gi, "CITRIC ACID]")
    .replace(/\bCITRIC ACID\)\]/gi, "CITRIC ACID])")
    .replace(/\bCitric Acid!\)/g, "Citric Acid])")
    .replace(/\bAlfalta\b/g, "Alfalfa")
    .replace(/\bPantonenate\b/g, "Pantothenate")
    .replace(/\bNatura\s+Flavors\b/g, "Natural Flavors")
    .replace(/\bManganese®\s+Sulfate\b/g, "Manganese Sulfate")
    .replace(/\bMangane5e\b/g, "Manganese")
    .replace(/\bCooper\s+Sulfate\b/g, "Copper Sulfate")
    .replace(/\bCholine\s+Choride\b/gi, "Choline Chloride")
    .replace(/\bPotsssium\b/gi, "Potassium")
    .replace(/\bVitsmin\b/gi, "Vitamin")
    .replace(/\bD\.Calcium\b/g, "D-Calcium")
    .replace(/\bOxidel\b/g, "Oxide")
    .replace(/\bsubtillis\b/gi, "subtilis")
    .replace(/\bpreseNativel\b/g, "preservative")
    .replace(/\bIpreservativel\b/g, "(preservative)")
    .replace(/\bZine\s+(Oxide|Sulfate)\b/g, "Zinc $1")
    .replace(/\bPolyphos\s+phate\b/g, "Polyphosphate")
    .replace(/\bL-Ascorbyl-2-Polyphosphate\s+\[Vitamin C\)/gi, "L-Ascorbyl-2-Polyphosphate (source of Vitamin C)")
    .replace(/\b(Thiamine Mononitrate|Riboflavin Supplement|Pyridoxine Hydrochloride)\s+\[Vitamin (B[126])\]/gi, "$1 (source of Vitamin $2)")
    .replace(/\bRiboflavin Supplement\s+source of vitamin B2\)/gi, "Riboflavin Supplement (source of vitamin B2)")
    .replace(/\bAACO\b/g, "AAFCO")
    .replace(/\bDocosahexanenoic\b/g, "Docosahexaenoic")
    .replace(/\bVitamln\b/g, "Vitamin")
    .replace(/\bFoIic\b/g, "Folic")
    .split(/\n+/)
    .map(compact)
    .filter(Boolean)
    .join("\n");
}

function extractOcrSection(ocrText, startPattern, stopPatterns = []) {
  const lines = String(ocrText || "")
    .replace(/-\s*\n\s*(?=[a-z])/g, "")
    .split(/\n+/)
    .map(compact)
    .filter(Boolean);
  const startIndex = lines.findIndex((line) => startPattern.test(line));
  if (startIndex === -1) return "";

  const collected = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > startIndex && stopPatterns.some((pattern) => pattern.test(line))) break;
    collected.push(line);
  }

  return compact(collected.join(" "));
}

function isMarsNutritionImageSource(sourceUrl) {
  const text = String(sourceUrl || "").toLowerCase();
  if (/(^|[/:.])(?:pedigree|cesar)\.com(?:[/:]|$)/.test(text)) return true;

  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    return /(^|\.)pedigree\.com$/i.test(host) || /(^|\.)cesar\.com$/i.test(host);
  } catch {
    return false;
  }
}

function debugOcrParser(message, details = {}) {
  if (!hasArg("--debug-ocr-parser")) return;
  console.error(`[OCR_PARSE] ${message} ${JSON.stringify(details)}`);
}

function ingredientStatementFromMarsNutritionOcr(ocrText, sourceUrl) {
  if (!isMarsNutritionImageSource(sourceUrl)) {
    debugOcrParser("source_rejected", { sourceUrl });
    return "";
  }

  const normalized = decodeEntities(ocrText)
    .replace(/\r/g, "\n")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const analysisIndex = normalized.search(/\bGuaranteed Analysis\b/i);
  const ingredientEndIndex = analysisIndex === -1 ? normalized.length : analysisIndex;

  const beforeAnalysis = normalized.slice(0, ingredientEndIndex).trim();
  const labelStartIndex = marsNutritionIngredientLabelStartIndex(beforeAnalysis);
  const startIndex = labelStartIndex >= 0 ? labelStartIndex : marsNutritionIngredientStartIndex(beforeAnalysis);
  if (startIndex < 0 || (labelStartIndex < 0 && startIndex > 120)) {
    debugOcrParser("start_rejected", {
      sourceUrl,
      labelStartIndex,
      startIndex,
      beforeAnalysis: beforeAnalysis.slice(0, 180),
    });
    return "";
  }

  const candidate = beforeAnalysis.slice(startIndex)
    .replace(/^ingredients?\s*:?\s*/i, "")
    .replace(/\b(CITRIC ACID)\)\]/gi, "$1])")
    .replace(/\b(CITRIC ACID)[IJ]\s*,/gi, "$1]),")
    .replace(/\b(CITRIC ACID)[IJ]\s*\)/gi, "$1])")
    .replace(/\b(CITRIC ACID)[IJ]\b/gi, "$1]")
    .replace(/\bfolic\s+acidl\b/gi, "folic acid]")
    .replace(/\bcalcium\s+iodatel\b/gi, "calcium iodate]")
    .replace(/\bCholine\s+Choride\b/gi, "Choline Chloride")
    .replace(/\bPotsssium\b/gi, "Potassium")
    .replace(/\bVitsmin\b/gi, "Vitamin")
    .replace(/\bD\.Calcium\b/g, "D-Calcium")
    .replace(/\b(Pyridoxine Hydrochloride)\s+Vitamin\s+(B6)\)/gi, "$1 (Vitamin $2)")
    .replace(/\b(Vitamins?\s*\([^)]*\bVitamin B12 Supplement),\s+(Natural [A-Z0-9][^,]* Flavor)\b/gi, "$1), $2")
    .replace(/\b(Vitamins?\s*\([^)]*\bFolic Acid)\s*\.?$/gi, "$1)")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\s+\.$/, "")
    .trim();
  if (!candidate) {
    debugOcrParser("candidate_empty", { sourceUrl });
    return "";
  }
  if (/\b(?:Guaranteed Analysis|Crude Protein|Crude Fat|Crude Fiber|Moisture|Calorie Content)\b/i.test(candidate)) {
    debugOcrParser("candidate_contains_analysis", { sourceUrl, candidate: candidate.slice(0, 180) });
    return "";
  }
  if (!isPlausibleIngredientStatement(candidate)) {
    debugOcrParser("candidate_implausible", { sourceUrl, candidate: candidate.slice(0, 240) });
    return "";
  }

  const ingredientCount = candidate.split(/[,;]+/).map(compact).filter(Boolean).length;
  if (ingredientCount < 10) {
    debugOcrParser("too_few_ingredients", { sourceUrl, ingredientCount, candidate: candidate.slice(0, 180) });
    return "";
  }
  if (!/\b(?:minerals?|vitamins?|choline chloride|vitamin [A-Z0-9]+|zinc sulfate|potassium iodide|biotin|riboflavin|thiamine|folic acid|sodium nitrite)\b/i.test(candidate)) {
    debugOcrParser("micronutrient_evidence_missing", { sourceUrl, candidate: candidate.slice(0, 180) });
    return "";
  }

  debugOcrParser("candidate_accepted", { sourceUrl, ingredientCount, candidate: candidate.slice(0, 180) });
  return candidate;
}

function marsNutritionIngredientStartIndex(value) {
  const text = String(value || "");
  const casedIndex = text.search(/\b(?:SUFFICIENT WATER FOR PROCESSING|WATER SUFFICIENT FOR PROCESSING|GROUND WHOLE GRAIN CORN|CHICKEN(?=\s*,)|BEEF(?=\s*,)|TURKEY(?=\s*,)|LAMB(?=\s*,)|PORK(?=\s*,)|SALMON(?=\s*,)|WHITEFISH(?=\s*,)|DUCK(?=\s*,)|MEAT BY-PRODUCTS|MEAT AND BONE MEAL)\b/);
  if (casedIndex >= 0 && casedIndex <= 160) return casedIndex;

  return text.search(/\b(?:sufficient water for processing|water sufficient for processing|ground whole grain corn|chicken(?=\s*,)|beef(?=\s*,)|turkey(?=\s*,)|lamb(?=\s*,)|pork(?=\s*,)|salmon(?=\s*,)|whitefish(?=\s*,)|duck(?=\s*,)|water(?=\s*,)|chicken broth|beef broth|pork by-products|meat by-products|meat and bone meal)\b/i);
}

function marsNutritionIngredientLabelStartIndex(value) {
  const text = String(value || "");
  const matches = [...text.matchAll(/\bingredients?\s*:?\s*/gi)];
  let acceptedIndex = -1;
  for (const match of matches) {
    const afterLabel = text.slice(match.index + match[0].length);
    if (isMarsNutritionIngredientLead(afterLabel)) acceptedIndex = match.index;
  }
  return acceptedIndex;
}

function isMarsNutritionIngredientLead(value) {
  const text = compact(String(value || "").slice(0, 180));
  return /^(?:sufficient water for processing|water sufficient for processing|ground whole grain corn|rice flour|wheat flour|meat by-products|meat and bone meal|pork by-products|chicken liver|beef liver|chicken broth|beef broth|fish broth|water\s*,|chicken\s*,|beef\s*,|turkey\s*,|lamb\s*,|pork\s*,|salmon\s*,|whitefish\s*,|duck\s*,|ocean fish\s*,)/i.test(text);
}

function cleanOcrIngredientCandidate(value) {
  return compact(value)
    .replace(/^ingredients?\s*:?\s*/i, "")
    .replace(/\b(Calorie\s+content|Guaranteed\s+Analysis|Crude\s+Protein)\b[\s\S]*$/i, "")
    .replace(/\b(CITRIC ACID)\)\]/gi, "$1])")
    .replace(/\b(CITRIC ACID)[IJ]\s*,/gi, "$1]),")
    .replace(/\b(CITRIC ACID)[IJ]\s*\)/gi, "$1])")
    .replace(/\b(CITRIC ACID)[IJ]\b/gi, "$1]")
    .replace(/\bfolic\s+acidl\b/gi, "folic acid]")
    .replace(/\bcalcium\s+iodatel\b/gi, "calcium iodate]")
    .replace(/\bCholine\s+Choride\b/gi, "Choline Chloride")
    .replace(/\bPotsssium\b/gi, "Potassium")
    .replace(/\bVitsmin\b/gi, "Vitamin")
    .replace(/\bD\.Calcium\b/g, "D-Calcium")
    .replace(/\b(Pyridoxine Hydrochloride)\s+Vitamin\s+(B6)\)/gi, "$1 (Vitamin $2)")
    .replace(/\b(Vitamins?\s*\([^)]*\bVitamin B12 Supplement),\s+(Natural [A-Z0-9][^,]* Flavor)\b/gi, "$1), $2")
    .replace(/\b(Vitamins?\s*\([^)]*\bFolic Acid)\s*\.?$/gi, "$1)")
    .replace(/\b(Potassium Iodide),\s+(Flaxseed Oil)\b/gi, "$1), $2")
    .replace(/\bsupplement,\s*riboflavin\b/gi, "supplement, riboflavin")
    .replace(/\bsulfate,\s*rosemary\b/gi, "sulfate, rosemary")
    .replace(/\b(Folic Acid,\s+Caramel Color,\s+Xanthan Gum,\s+Iron Oxide)\s*\.?$/i, "$1)")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function inlineIngredientStatementFromOcr(ocrText) {
  const normalized = decodeEntities(ocrText)
    .replace(/\r/g, "\n")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const labels = [...normalized.matchAll(/\bingredients?\s*:\s*/gi)];
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const afterLabel = normalized.slice(labels[index].index + labels[index][0].length);
    const stopIndex = afterLabel.search(/\b(?:Guaranteed Analysis|Calorie Content|Feeding Guidelines|Directions)\b/i);
    const candidate = cleanOcrIngredientCandidate(stopIndex >= 0 ? afterLabel.slice(0, stopIndex) : afterLabel);
    if (isPlausibleIngredientStatement(candidate)) return candidate;
  }
  return "";
}

function ingredientStatementFromOcr(ocrText, sourceUrl = "") {
  let labeledIngredientStatement = cleanOcrIngredientCandidate(extractOcrSection(ocrText, /^ingredients?\b/i, [
    /^guaranteed\s+analysis\b/i,
    /^feeding\b/i,
    /^calorie\s+content\b/i,
  ]));

  if (isMarsNutritionImageSource(sourceUrl)) {
    labeledIngredientStatement = normalizeMarsLabeledIngredientCandidate(labeledIngredientStatement);
  }

  if (isPlausibleIngredientStatement(labeledIngredientStatement)) return labeledIngredientStatement;
  const inlineIngredientStatement = inlineIngredientStatementFromOcr(ocrText);
  if (isPlausibleIngredientStatement(inlineIngredientStatement)) return inlineIngredientStatement;
  debugOcrParser("labeled_candidate_rejected", {
    sourceUrl,
    candidate: labeledIngredientStatement.slice(0, 180),
  });
  return ingredientStatementFromMarsNutritionOcr(ocrText, sourceUrl);
}

function normalizeMarsLabeledIngredientCandidate(value) {
  const text = compact(value);
  if (!text) return "";

  const labelStartIndex = marsNutritionIngredientLabelStartIndex(text);
  if (labelStartIndex >= 0) {
    return text.slice(labelStartIndex)
      .replace(/^ingredients?\s*:?\s*/i, "")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  const startIndex = marsNutritionIngredientStartIndex(text);
  if (startIndex > 0 && startIndex <= 160) {
    return text.slice(startIndex)
      .replace(/^ingredients?\s*:?\s*/i, "")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  return text;
}

function guaranteedAnalysisFromOcr(ocrText) {
  const calorie = extractOcrSection(ocrText, /^calorie\s+content\b/i, [/^ingredients?\b/i]);
  const analysis = extractOcrSection(ocrText, /^guaranteed\s+analysis\b/i, [/^ingredients?\b/i, /^feeding\b/i]);
  return [calorie, analysis].map(compact).filter(Boolean).join("\n");
}

function isPlausibleIngredientStatement(value) {
  const text = compact(value);
  if (!text || text.length < 20) return false;
  if (hasUnbalancedParentheses(text)) return false;
  if (hasLikelyIngredientOcrArtifacts(text)) return false;
  if (/^(?:from around the world|made in the usa|with the finest)\b/i.test(text)) return false;
  if (/\bfrom around the world\s+ingredients\b/i.test(text)) return false;
  if (/^(meal|by-product meal|protein meal|fat|flavor)\b\s*[,;]/i.test(text)) return false;
  if (/\bCITRIC ACID[IJ]\b/i.test(text)) return false;
  if (/\b(?:iodatel|acidl|favors|pule|carbonale|carmitime|chioride|navors|oried|puip|hiber|lisa|oll|812)\b/i.test(text)) return false;
  if (/\b(?:folic|vitamin|riboflavin supplement|pyridoxine hydrochloride|thiamine mononitrate)\.?$/i.test(text) && !/\bfolic acid\.?$/i.test(text)) {
    return false;
  }
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 5) return false;
  if (items.some((item) => item.length > 180)) return false;
  return true;
}

function htmlIngredientStatement(html) {
  const matches = [...html.matchAll(/<(h4|span)\b[^>]*>\s*Ingredients\s*<\/\1>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  for (const match of matches) {
    const text = compact(decodeEntities(stripTags(match[2])))
      .replace(/^ingredients?\s*:?\s*/i, "")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s+/g, " ");
    if (isPlausibleIngredientStatement(text)) return text;
  }
  return "";
}

function htmlGuaranteedAnalysis(html) {
  const heading = html.match(/<(h4|span)\b[^>]*>\s*Guaranteed Analysis\s*<\/\1>/i);
  if (!heading?.index) return "";

  const rest = html.slice(heading.index, heading.index + 12_000);
  const table = rest.match(/<table\b[\s\S]*?<\/table>/i)?.[0] || "";
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(([, rowHtml]) => [...rowHtml.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map(([, cellHtml]) => compact(decodeEntities(stripTags(cellHtml))))
      .filter(Boolean))
    .filter((cells) => cells.length >= 2 && !/^column\s+\d+$/i.test(cells[0]))
    .map((cells) => `${cells[0]} ${cells.slice(1).join(" ")}`);

  const calorie = rest.match(/<(h4|span)\b[^>]*>\s*Calorie Content\s*\(Calculated\)\s*:?\s*<\/\1>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[2] || "";
  return [
    rows.length > 0 ? `Guaranteed Analysis ${rows.join(", ")}` : "",
    calorie ? `Calorie Content (Calculated): ${compact(decodeEntities(stripTags(calorie)))}` : "",
  ].filter(Boolean).join("\n");
}

function extractProductFields(html, sourceUrl, defaultBrand) {
  const nodes = extractJsonLd(html);
  const product = productNode(nodes) || {};
  const text = visibleText(html);
  const settings = parseDrupalSettings(html);
  const taxonomy = parseTaxonomy(settings);
  const dataLayerSettings = parseDataLayerSettings(html);
  const canonical = canonicalUrl(html, sourceUrl);
  const productUrl = firstText(product.url, product.offers?.url, canonical, sourceUrl);
  const rawProductName = firstText(
    product.name,
    metaContent(html, "og:title", "twitter:title"),
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  );
  const brand = firstText(normalizeBrand(product.brand), metaContent(html, "product:brand", "og:brand"), defaultBrand);
  const productDescription = firstText(product.description, metaContent(html, "description", "og:description", "twitter:description"));
  const productName = cleanProductName(rawProductName, brand);
  const category = Array.isArray(product.category) ? product.category.join(" ") : product.category;
  const productLine = firstText(singleTaxonomyValue(taxonomy, "Sub brand"), inferProductLine(productName, brand));
  const foodForm = cleanFoodForm(
    firstText(singlePageDataValue(dataLayerSettings, "food_type"), singleTaxonomyValue(taxonomy, "Food Type")),
    `${productName} ${productUrl}`
  );
  const petType = firstText(pageDataValue(dataLayerSettings, "specie"), taxonomyValue(taxonomy, "Specie"), inferPetType(productName, productUrl, productDescription, category, text.slice(0, 500))).toLowerCase()
    .replace(/^dogs?$/, "dog")
    .replace(/^cats?$/, "cat");

  return {
    gtin: normalizeGtin(product.gtin14 || product.gtin13 || product.gtin12 || product.gtin8 || product.gtin || product.sku),
    product_name: productName,
    brand,
    product_line: productLine,
    flavor: firstText(taxonomyValue(taxonomy, "Flavor"), inferFlavor(productName, brand, productLine)),
    life_stage: firstText(singlePageDataValue(dataLayerSettings, "lifestage"), singleTaxonomyValue(taxonomy, "Lifestage", "Life stage"), inferLifeStage(productName)).toLowerCase(),
    food_form: foodForm,
    package_size: firstText(taxonomyValue(taxonomy, "Product size", "Size"), pageDataValue(dataLayerSettings, "size")),
    pet_type: petType,
    product_image_url: normalizeImage(product.image || metaContent(html, "og:image", "twitter:image"), sourceUrl),
    product_url: productUrl,
    is_complete_food: inferIsCompleteFood({ productName, productLine, productUrl, category }),
    ingredient_image_url: officialImageUrl(imageByAlt(html, sourceUrl, /ingredients\s+image/i)),
    guaranteed_analysis_image_url: officialImageUrl(imageByAlt(html, sourceUrl, /guaranteed\s+analysis\s+image/i)),
    gallery_image_urls: productGalleryImageUrls(html, sourceUrl),
  };
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

function runDiscovery({ brand, targetUrl, maxUrls, minScore, requiredUrlPattern, timeoutMs }) {
  const args = [
    SOURCE_URL_DISCOVERY_SCRIPT,
    "--target-url", targetUrl,
    "--brand-term", brand,
    "--max-urls", String(maxUrls),
    "--min-score", String(minScore),
    "--required-url-pattern", requiredUrlPattern,
  ];
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    throw new Error([
      `${SOURCE_URL_DISCOVERY_SCRIPT} failed with status ${result.status}`,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function runOfficialImport(feedPath, sqlDir, { source, expectedBrands, sqlChunkSize, importTimeoutMs }) {
  const args = [
    OFFICIAL_FEED_IMPORT_SCRIPT,
    "--file", feedPath,
    "--source", source,
    "--source-quality", "manufacturer",
    "--ingredient-verification", "label_ocr_verified",
    "--image-verification", "manufacturer",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
  ];
  for (const expectedBrand of expectedBrands) {
    args.push("--expected-brand", expectedBrand);
  }
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

function windowUrls(urls, offset, limit) {
  return limit === null ? urls.slice(offset) : urls.slice(offset, offset + limit);
}

async function main() {
  const outputDir = compact(getArg("--output-dir")) || DEFAULT_OUTPUT_DIR;
  const source = compact(getArg("--source")) || DEFAULT_SOURCE;
  const brand = compact(getArg("--brand")) || DEFAULT_BRAND;
  const expectedBrands = getArgs("--expected-brand").map(compact).filter(Boolean);
  if (expectedBrands.length === 0) {
    expectedBrands.push(brand);
    const upperBrand = brand.toUpperCase();
    if (upperBrand !== brand) expectedBrands.push(upperBrand);
  }
  const targetUrl = compact(getArg("--target-url")) || DEFAULT_TARGET_URL;
  const urlListPath = compact(getArg("--url-list"));
  const maxUrls = positiveInteger(getArg("--max-urls"), DEFAULT_MAX_URLS);
  const minScore = Number(getArg("--min-score") ?? DEFAULT_MIN_SCORE);
  const requiredUrlPattern = compact(getArg("--required-url-pattern")) || DEFAULT_REQUIRED_URL_PATTERN;
  const urlOffset = nonNegativeInteger(getArg("--url-offset"), 0);
  const urlLimit = positiveInteger(getArg("--url-limit"), null);
  const discoveryTimeoutMs = positiveInteger(getArg("--discovery-timeout-ms"), 120_000);
  const extractTimeoutMs = positiveInteger(getArg("--extract-timeout-ms"), 360_000);
  const importTimeoutMs = positiveInteger(getArg("--import-timeout-ms"), 60_000);
  const ocrTimeoutMs = positiveInteger(getArg("--ocr-timeout-ms"), 30_000);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const allowPartialPages = hasArg("--allow-partial-pages");

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
  const discovery = wantedUrls.size > 0
    ? { stdout: [...wantedUrls].join("\n"), stderr: "" }
    : runDiscovery({
      brand,
      targetUrl,
      maxUrls,
      minScore,
      requiredUrlPattern,
      timeoutMs: discoveryTimeoutMs,
    });
  const discoveredUrls = [...new Set(discovery.stdout.split(/\r?\n/).map(compact).filter(Boolean))];
  const filteredUrls = wantedUrls.size > 0 ? [...wantedUrls] : discoveredUrls;
  const urls = windowUrls(filteredUrls, urlOffset, urlLimit);
  fs.writeFileSync(urlsPath, `${urls.join("\n")}\n`, "utf8");
  if (urls.length === 0) throw new Error(`${brand} OCR import found zero product URLs.`);

  const startedAt = Date.now();
  const rows = [];
  const ocrEvidence = [];
  const warnings = [];

  for (const [index, url] of urls.entries()) {
    if (Date.now() - startedAt > extractTimeoutMs) {
      throw new Error(`${brand} OCR extraction timed out after ${extractTimeoutMs}ms`);
    }

    try {
      const { html, sourceUrl } = await fetchText(url);
      const product = extractProductFields(html, sourceUrl, brand);
      let ocrText = "";
      let ingredientSource = "html";
      let ingredientStatement = htmlIngredientStatement(html);
      let guaranteedAnalysis = htmlGuaranteedAnalysis(html);
      let ingredientImagePath = "";
      let ingredientImageUrl = product.ingredient_image_url;
      let selectedOcrMode = "";
      let ocrCandidates = [];
      const productSourceUrl = product.product_url || sourceUrl || url;

      if (!isPlausibleIngredientStatement(ingredientStatement) && ingredientImageUrl) {
        ingredientSource = "ocr";
        ingredientImagePath = await downloadImage(ingredientImageUrl, imagesDir);
        const primaryOcrCandidates = ocrImageCandidates(ingredientImagePath, ocrTimeoutMs, productSourceUrl);
        ocrCandidates.push(...candidateEvidence(ingredientImageUrl, ingredientImagePath, primaryOcrCandidates));
        const selectedCandidate = primaryOcrCandidates.find((candidate) => candidate.plausible) || null;
        ocrText = selectedCandidate?.text || primaryOcrCandidates[0]?.text || "";
        selectedOcrMode = selectedCandidate?.mode || "";
        ingredientStatement = selectedCandidate?.ingredient_statement || "";
        debugOcrParser("primary_image_result", {
          sourceUrl: productSourceUrl,
          ingredientImageUrl,
          selectedOcrMode,
          statementLength: ingredientStatement.length,
          plausible: isPlausibleIngredientStatement(ingredientStatement),
          statement: ingredientStatement.slice(0, 180),
        });
        guaranteedAnalysis = firstText(guaranteedAnalysis, selectedCandidate?.guaranteed_analysis, guaranteedAnalysisFromOcr(ocrText));
      }

      if (!ingredientStatement && product.guaranteed_analysis_image_url) {
        ingredientSource = "ocr";
        const fallbackImagePath = await downloadImage(product.guaranteed_analysis_image_url, imagesDir);
        const fallbackOcrCandidates = ocrImageCandidates(fallbackImagePath, ocrTimeoutMs, productSourceUrl);
        ocrCandidates.push(...candidateEvidence(product.guaranteed_analysis_image_url, fallbackImagePath, fallbackOcrCandidates));
        const selectedCandidate = fallbackOcrCandidates.find((candidate) => candidate.plausible) || null;
        const fallbackOcr = selectedCandidate?.text || fallbackOcrCandidates[0]?.text || "";
        ocrText = [ocrText, fallbackOcr].map(compact).filter(Boolean).join("\n\n");
        guaranteedAnalysis = firstText(guaranteedAnalysis, selectedCandidate?.guaranteed_analysis, guaranteedAnalysisFromOcr(fallbackOcr));
        if (selectedCandidate) {
          selectedOcrMode = selectedCandidate.mode;
          ingredientStatement = selectedCandidate.ingredient_statement;
          ingredientImageUrl = product.guaranteed_analysis_image_url;
          ingredientImagePath = fallbackImagePath;
        }
        debugOcrParser("fallback_image_result", {
          sourceUrl: productSourceUrl,
          ingredientImageUrl: product.guaranteed_analysis_image_url,
          selectedOcrMode,
          statementLength: ingredientStatement.length,
          plausible: isPlausibleIngredientStatement(ingredientStatement),
          statement: ingredientStatement.slice(0, 180),
        });
      }

      if (!isPlausibleIngredientStatement(ingredientStatement)) {
        const alreadyTried = new Set([ingredientImageUrl, product.guaranteed_analysis_image_url].map(officialImageUrl).filter(Boolean));
        for (const candidateUrl of product.gallery_image_urls) {
          const candidateImageUrl = officialImageUrl(candidateUrl);
          if (!candidateImageUrl || alreadyTried.has(candidateImageUrl)) continue;

          ingredientSource = "ocr";
          const candidateImagePath = await downloadImage(candidateImageUrl, imagesDir);
          const galleryOcrCandidates = ocrImageCandidates(candidateImagePath, ocrTimeoutMs, productSourceUrl);
          ocrCandidates.push(...candidateEvidence(candidateImageUrl, candidateImagePath, galleryOcrCandidates));
          const selectedCandidate = galleryOcrCandidates.find((candidate) => candidate.plausible) || null;
          if (!selectedCandidate) {
            continue;
          }

          ingredientImageUrl = candidateImageUrl;
          ingredientImagePath = candidateImagePath;
          selectedOcrMode = selectedCandidate.mode;
          ocrText = selectedCandidate.text;
          ingredientStatement = selectedCandidate.ingredient_statement;
          guaranteedAnalysis = firstText(guaranteedAnalysis, selectedCandidate.guaranteed_analysis);
          break;
        }
      }

      if (!isPlausibleIngredientStatement(ingredientStatement)) {
        warnings.push(`${url}: missing_or_implausible_ocr_ingredients`);
        ingredientStatement = "";
        ingredientSource = "";
      }

      rows.push({
        cache_key: `${source}:${product.gtin || product.product_url}`,
        gtin: product.gtin,
        product_name: product.product_name,
        brand: product.brand,
        product_line: product.product_line,
        flavor: product.flavor,
        life_stage: product.life_stage,
        food_form: product.food_form,
        package_size: product.package_size,
        pet_type: product.pet_type,
        ingredient_statement: ingredientStatement,
        product_image_url: product.product_image_url,
        product_url: product.product_url,
        is_complete_food: product.is_complete_food,
        guaranteed_analysis: guaranteedAnalysis,
        source_quality: "manufacturer",
        ingredient_verification_status: "label_ocr_verified",
        image_verification_status: "manufacturer",
      });
      ocrEvidence.push({
        url,
        ingredient_source: isPlausibleIngredientStatement(ingredientStatement) ? ingredientSource : "",
        ingredient_image_url: ingredientImageUrl,
        guaranteed_analysis_image_url: product.guaranteed_analysis_image_url,
        local_ingredient_image_path: ingredientImagePath,
        ocr_text: ocrText,
        selected_ocr_mode: selectedOcrMode,
        ocr_candidates: ocrCandidates,
      });

      if ((index + 1) % 25 === 0) {
        console.error(`Processed ${index + 1}/${urls.length} ${brand} pages`);
      }
    } catch (error) {
      if (!allowPartialPages) throw error;
      warnings.push(`${url}: ${error.message || error}`);
    }
  }

  writeCsv(feedPath, rows);
  fs.writeFileSync(rawOcrPath, `${JSON.stringify(ocrEvidence, null, 2)}\n`, "utf8");
  const importResult = runOfficialImport(feedPath, sqlDir, { source, expectedBrands, sqlChunkSize, importTimeoutMs });
  const manifestPath = path.join(sqlDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const report = {
    generated_at: new Date().toISOString(),
    brand,
    source,
    source_quality: "manufacturer",
    ingredient_verification: "label_ocr_verified",
    image_verification: "manufacturer",
    target_url: targetUrl,
    required_url_pattern: requiredUrlPattern,
    discovered_urls: discoveredUrls.length,
    filtered_urls: filteredUrls.length,
    input_url_list_path: urlListPath || null,
    url_offset: urlOffset,
    url_limit: urlLimit,
    prepared_urls: urls.length,
    feed: feedSummary(rows),
    rows_with_ingredient_image: ocrEvidence.filter((item) => compact(item.ingredient_image_url)).length,
    rows_with_ocr_text: ocrEvidence.filter((item) => compact(item.ocr_text)).length,
    rows_with_html_ingredients: ocrEvidence.filter((item) => item.ingredient_source === "html").length,
    rows_with_ocr_ingredients: ocrEvidence.filter((item) => item.ingredient_source === "ocr").length,
    plausible_ingredient_rows: rows.filter((row) => isPlausibleIngredientStatement(row.ingredient_statement)).length,
    sql_rows: manifest.total_sql_rows,
    feed_path: feedPath,
    url_list_path: urlsPath,
    raw_ocr_path: rawOcrPath,
    sql_dir: sqlDir,
    discovery_warnings: compact(discovery.stderr),
    extraction_warnings: warnings.join("\n"),
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`${brand} official OCR batch prepared: ${source}`);
  console.log(`URLs: ${urlsPath}`);
  console.log(`Feed: ${feedPath}`);
  console.log(`OCR evidence: ${rawOcrPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Rows: ${report.feed.rows}; OCR ingredient rows: ${report.plausible_ingredient_rows}; SQL rows: ${report.sql_rows}`);
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
