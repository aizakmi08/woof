import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeFetchText } from "./catalog-safe-fetch.mjs";

const TEMPLATE_HEADERS = [
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
  "ingredient_source_url",
  "image_source_url",
  "is_complete_food",
  "guaranteed_analysis",
  "nutritional_info",
];
const REQUIRED_VERIFIED_FIELDS = [
  "product_name",
  "brand",
  "pet_type",
  "ingredient_statement",
  "product_image_url",
  "product_url",
];
const FORCE_HTTPS_HOSTS = new Set([
  "nutrish.com",
  "www.nutrish.com",
]);
const SNAPSHOT_OVERRIDE_ALIASES = new Map([
  ["cache_key", "cache_key"],
  ["cachekey", "cache_key"],
  ["gtin", "gtin"],
  ["barcode", "gtin"],
  ["upc", "gtin"],
  ["product_name", "product_name"],
  ["productname", "product_name"],
  ["name", "product_name"],
  ["brand", "brand"],
  ["product_line", "product_line"],
  ["productline", "product_line"],
  ["flavor", "flavor"],
  ["flavour", "flavor"],
  ["life_stage", "life_stage"],
  ["lifestage", "life_stage"],
  ["food_form", "food_form"],
  ["foodform", "food_form"],
  ["package_size", "package_size"],
  ["packagesize", "package_size"],
  ["net_weight", "package_size"],
  ["pet_type", "pet_type"],
  ["pettype", "pet_type"],
  ["ingredient_statement", "ingredient_statement"],
  ["ingredient_text", "ingredient_statement"],
  ["ingredients", "ingredient_statement"],
  ["product_image_url", "product_image_url"],
  ["image_url", "product_image_url"],
  ["image", "product_image_url"],
  ["product_url", "product_url"],
  ["source_url", "product_url"],
  ["url", "product_url"],
  ["is_complete_food", "is_complete_food"],
  ["iscompletefood", "is_complete_food"],
  ["guaranteed_analysis", "guaranteed_analysis"],
  ["nutrient_panel", "guaranteed_analysis"],
  ["nutritional_analysis_disclaimer", "nutritional_info"],
  ["nutritional_info", "nutritional_info"],
  ["nutritionalinfo", "nutritional_info"],
]);
const NON_COMPLETE_FOOD_IDENTITY_PATTERNS = [
  /\b(treat|treats|snack|snacks|chew|chews|chewy|chewies|jerky|biscuit|biscuits|cookie|cookies|stick|sticks|chip|chips|cheek roll|cheek rolls|beef cheek)\b/i,
  /\bdental\s+(?:treat|treats|chew|chews|chewies|snack|snacks|bone|bones)\b/i,
  /\bbones?\b(?![-\s]+broth)|\bantlers?\b/i,
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|meal mixer|meal enhancer|enhancer|enhancers)\b/i,
  /\b(?:bone broth|chunky broth|broth|stock)\s+(?:topper|toppers|mixer|mixers|supplement|supplements|enhancer|enhancers)\b/i,
  /\b(?:topper|toppers|mixer|mixers|supplement|supplements|enhancer|enhancers)\s+(?:bone broth|chunky broth|broth|stock)\b/i,
  /\b(?:gravy|sauce)\s+(?:topper|toppers|mixer|mixers|enhancer|enhancers)\b/i,
  /\b(?:topper|toppers|mixer|mixers|enhancer|enhancers)\s+(?:gravy|sauce)\b/i,
  /\bkibble\s+sauces?\b/i,
  /\bk9\s+mobility\s+ultra\b/i,
  /\b(supplement|supplements|complement|complementary|vitamin pack)\b/i,
  /\b(?:toys?\b(?![-\s]+breed)|plush|plushie|squeaky|squeaker|tennis\s+balls?|balls?|tug|rope|catnip)\b/i,
  /\b(?:t[-\s]?shirt|shirt|bandana|cooler|gift\s*card|container|lid|patches?|sticker|merch|apparel)\b/i,
  /\b(?:cleaner|cleaners|stain|odor|odour|housebreaking\s+aid|wipes?|frontline|flea|tick)\b/i,
  /\b(?:grooming|shampoo|litter)\b/i,
  /\b(?:dog|cat|pet|food|water|feeding|feeder|slow[-\s]+feeder|stainless(?:\s+steel)?|ceramic|elevated|collapsible|travel|non[-\s]?skid|anti[-\s]?gulp|replacement|double)\s+bowls?\b|\bbowls?\s+(?:for|stand|mat|set|holder|insert|replacement)\b|\bfeeders?\b/i,
  /\b(variety[-\s]*packs?|bundles?|samplers?|samples?|sample[-\s]*packs?|starter[-\s]*(?:packs?|kits?)|multi[-\s]*packs?|multipacks?|(?:new[-\s]+)?(?:puppy|kitten)[-\s]+packs?|(?:puppy|kitten)[-\s]+essentials[-\s]+packs?|essentials[-\s]+packs?)\b/i,
  /\bblue bits\b/i,
];
const NON_COMPLETE_FOOD_CATEGORY_PATTERNS = [
  /\b(treat|treats|snack|snacks|chew|chews|chewy|chewies|jerky|biscuit|biscuits|cookie|cookies)\b/i,
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|meal mixer|meal enhancer|enhancer|enhancers)\b/i,
  /\b(variety[-\s]*packs?|bundles?|samplers?|samples?|sample[-\s]*packs?|starter[-\s]*(?:packs?|kits?)|multi[-\s]*packs?|multipacks?)\b/i,
];
const SOFT_NON_COMPLETE_FOOD_IDENTITY_PATTERNS = [
  /\b(puree|purees|pur[eé]e|pur[eé]es|bisque|bisques|lickable|lickables)\b/i,
];
const COMPLETE_FOOD_NUTRIENT_MARKER_REGEX = /\b(?:taurine|vitamin|zinc|ferrous|iron\s+sulfate|manganese|copper|potassium\s+iodide|calcium\s+iodate|choline\s+chloride|biotin|folic\s+acid|riboflavin|niacin|thiamine|pyridoxine|menadione)\b/i;
const PAGE_DATA_CACHE = new Map();
const PDF_TEXT_CACHE = new Map();

function rawCacheDir(segment = "") {
  const dir = compact(getArg("--raw-cache-dir"));
  return dir && segment ? path.join(dir, segment) : dir;
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

function getArg(name, fallback = null) {
  const values = getArgs(name);
  return values.length > 0 ? values[values.length - 1] : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<span\b[^>]*class=["'][^"']*\bdots\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<\/?span\b[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|section|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
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

function decodeEscapedHtmlFragment(value) {
  return decodeEntities(String(value || "")
    .replace(/\\u\{([0-9a-f]+)\}/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t"));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function visibleText(html) {
  return compact(decodeEntities(stripTags(html)));
}

function absoluteUrl(value, baseUrl) {
  const text = compact(value);
  if (!text) return "";
  try {
    const url = new URL(text, baseUrl || undefined);
    if (FORCE_HTTPS_HOSTS.has(url.hostname.toLowerCase())) url.protocol = "https:";
    return url.toString();
  } catch {
    return text;
  }
}

function normalizeGtin(value) {
  const digits = compact(value).replace(/[^0-9]/g, "");
  return digits.length >= 8 ? digits : "";
}

function normalizeBrand(value) {
  if (typeof value === "string") return compact(value);
  return compact(value?.name || value?.brand || value?.["@id"]);
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

function normalizeMaybeRelativeImage(value, baseUrl) {
  const image = normalizeImage(value, baseUrl);
  if (!image) return "";
  try {
    const parsed = new URL(image, baseUrl || undefined);
    return parsed.toString();
  } catch {
    return image;
  }
}

function imageFromAttributes(tag, baseUrl) {
  const zoom = tag.match(/\bdata-zoom-image=["']([^"']+)["']/i)?.[1];
  const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
  return absoluteUrl(decodeEntities(zoom || src), baseUrl);
}

function imageFromSrcSet(value, baseUrl) {
  const first = compact(decodeEntities(value).split(",")[0]?.replace(/\s+\d+[wx]\s*$/i, ""));
  return first ? absoluteUrl(first, baseUrl) : "";
}

function extractPageImage(html, baseUrl) {
  const primaryImages = html.match(/<div\b[^>]*class=["'][^"']*\bprimary-images\b[^"']*["'][^>]*>[\s\S]{0,12000}/i)?.[0] || "";
  if (primaryImages) {
    const activeImage = primaryImages.match(/<div\b[^>]*class=["'][^"']*\bcarousel-item\b[^"']*\bactive\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/i)?.[0];
    const zoomImage = activeImage ? imageFromAttributes(activeImage, baseUrl) : "";
    if (zoomImage) return zoomImage;

    const productImage = primaryImages.match(/<img\b[^>]*(?:\bimage-zoom-carousel\b|\bitemprop=["']image["'])[^>]*>/i)?.[0];
    const image = productImage ? imageFromAttributes(productImage, baseUrl) : "";
    if (image) return image;
  }

  const responsiveThumbImage = [...html.matchAll(/\b(?:data-srcset|srcset|data-src|src)=["']([^"']*image-thumb__[^"']*__responsive_[^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi)]
    .map(([, value]) => value.includes(",") ? imageFromSrcSet(value, baseUrl) : absoluteUrl(decodeEntities(value), baseUrl))
    .find(Boolean);
  if (responsiveThumbImage) return responsiveThumbImage;

  const productPackagingImage = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map(([tag]) => ({
      tag,
      src: tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] || "",
      alt: tag.match(/\balt=["']([^"']+)["']/i)?.[1] || "",
    }))
    .filter(({ src }) => /\/product-images\//i.test(src))
    .filter(({ src }) => !/\/styles\/product_teaser\//i.test(src))
    .filter(({ src, alt }) => !/\b(back|thumbnail)\b/i.test(`${src} ${alt}`))
    .find(({ src, alt }) => /\bfront\b/i.test(src) || /\bproduct packaging image 1\b/i.test(alt));
  if (productPackagingImage) return imageFromAttributes(productPackagingImage.tag, baseUrl);

  const productUploadImage = [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']*\/uploads\/products\/[^"']+)["'][^>]*>/gi)]
    .map(([tag]) => imageFromAttributes(tag, baseUrl))
    .find(Boolean);
  return productUploadImage || "";
}

function extractDiamondPetFrontImage(html, sourceUrl) {
  if (!hostMatches(sourceUrl, /(^|\.)diamondpet\.com$/i)) return "";

  const hero = html.match(/<section\b[^>]*id=["']product["'][^>]*>[\s\S]{0,30000}?<\/section>/i)?.[0] || html;
  const candidates = [...hero.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>[\s\S]{0,1200}?<img\b[^>]*>/gi)]
    .map(([, href]) => absoluteUrl(decodeEntities(href), sourceUrl))
    .filter(Boolean)
    .filter((url) => /diamondpet\.com\/wp-content\/uploads\//i.test(url))
    .filter((url) => !/\b(?:back|thumb|thumbnail)\b/i.test(url));

  return candidates.find((url) => /\bfront\b/i.test(url)) || candidates[0] || "";
}

function extractPurinaShopProductImage(html, sourceUrl) {
  let slug = "";
  try {
    const parsed = new URL(sourceUrl);
    if (!/(^|\.)purina\.com$/i.test(parsed.hostname)) return "";
    if (!/^\/(?:cats|dogs)\/shop\//i.test(parsed.pathname)) return "";
    slug = compact(parsed.pathname.split("/").filter(Boolean).pop()).toLowerCase();
  } catch {
    return "";
  }
  if (!slug) return "";

  const candidates = [...new Set([
    ...String(html || "").matchAll(/(?:https?:\\?\/\\?\/[^"'<>\\\s]+|\/sites\/default\/files\/[^"'<>\\\s]+)\.(?:jpe?g|png|webp)(?:\?[^"'<>\\\s]*)?/gi),
  ].map((match) => absoluteUrl(decodeEntities(match[0].replace(/\\\//g, "/")), sourceUrl)).filter(Boolean))];

  return candidates.find((url) => url.toLowerCase().includes(slug)) || "";
}

function firstText(...values) {
  for (const value of values) {
    const text = compact(decodeEntities(value));
    if (text) return text;
  }
  return "";
}

function joinedText(...values) {
  return values.map((value) => compact(decodeEntities(value))).filter(Boolean).join(" ");
}

function isPlausibleIngredientStatement(value) {
  const text = compact(value);
  if (!text) return false;
  if (text.length < 20) return false;
  if (/^(?:from around the world|made in the usa|with the finest)\b/i.test(text)) return false;
  if (/\bfrom around the world\s+ingredients\b/i.test(text)) return false;
  if (/[.!?]\s+[A-Z]/.test(text)) return false;
  if (/\b(?:what's inside|where to buy|nutritional facts|nutritional info|nutritional information|nutrients to support|premium-quality|premium quality|zinpro|propath|no corn,\s*wheat,\s*soy|never any corn,\s*wheat,\s*soy|artificial fillers|artificial flavors or colors|made without|guaranteed levels|the only kibble|one animal protein|one vegetable|food sensitivities|natural omegas|immune health|digestive health|healthy skin\s*&\s*coat|skin barrier|paw pad repair|vegetables,\s*fruits and other wholesome ingredients|complete,\s*balanced)\b/i.test(text)) return false;
  if (/\b(?:complete and balanced|taste(?:s)? (?:cats|dogs) love|sensory experience|maintain lean muscle|offer your|specific needs|overall nourishment|created to meet|delivers the taste|with tastes)\b/i.test(text)) {
    return false;
  }

  const items = text
    .split(/[,;]+/)
    .map(compact)
    .filter(Boolean);

  if (items.length < 5) return false;
  const longItems = items.filter((item) => item.length > 140).length;
  if (longItems > 0) return false;

  return true;
}

function firstIngredientText(...values) {
  for (const value of values) {
    const text = cleanIngredientCandidate(decodeEntities(value));
    if (isPlausibleIngredientStatement(text)) return text;
  }
  return "";
}

function isPlausibleNutritionHeadingIngredientStatement(value) {
  const text = cleanIngredientCandidate(value);
  if (text.length < 50 || text.length > 2600) return false;
  if (/\b(?:Calorie Content|Caloric Content|Guaranteed Analysis|Crude Protein|Crude Fat|Crude Fiber|Moisture|Customer Reviews|Add a review|Feeding Instructions)\b/i.test(text)) {
    return false;
  }

  const items = text
    .split(/[,;]+/)
    .map(compact)
    .filter(Boolean);
  if (items.length < 8) return false;
  if (!COMPLETE_FOOD_NUTRIENT_MARKER_REGEX.test(text)) return false;

  const veryLongItems = items.filter((item) => item.length > 520).length;
  return veryLongItems === 0;
}

function hasCoreGuaranteedAnalysis(value) {
  const text = compact(value);
  return [
    /\bcrude\s+protein\b[\s\S]{0,40}\d/i,
    /\bcrude\s+fat\b[\s\S]{0,40}\d/i,
    /\bcrude\s+fiber\b[\s\S]{0,40}\d/i,
    /\bmoisture\b[\s\S]{0,40}\d/i,
  ].every((pattern) => pattern.test(text));
}

function isAlmoNatureProductSource(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    return /(^|\.)almonature\.com$/i.test(url.hostname)
      && /^\/en-us\/(?:cat|dog)-products\/[A-Za-z0-9-]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractAlmoNatureProductSegment(html) {
  return decodeEntities(
    html.match(/<div\b[^>]*\bid=["']product["'][^>]*\bdata-segment=["']([^"']+)["']/i)?.[1]
      || html.match(/\bconst\s+segment\s*=\s*["']([^"']+)["']/i)?.[1]
      || ""
  );
}

function extractAlmoNatureComposition(html, sourceUrl) {
  if (!isAlmoNatureProductSource(sourceUrl)) return "";

  const match = html.match(/<div\b[^>]*\bid=["']composition["'][^>]*>([\s\S]*?)<\/div>/i);
  const text = cleanIngredientCandidate(stripTags(match?.[1] || ""))
    .replace(/\s+Find a store\b[\s\S]*$/i, "")
    .replace(/\s+Pet shops on the map\b[\s\S]*$/i, "")
    .replace(/\s+\.\s*$/, ".")
    .trim();

  if (!text) return "";
  if (/\b(?:crude protein|crude fat|crude fiber|moisture|guaranteed analysis|calorie content|metabolizable energy)\b/i.test(text)) return "";
  const ingredients = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (ingredients.length < 2) return "";

  const hasPercentageComposition = /\b\d+(?:\.\d+)?\s*%/.test(text);
  if (!hasPercentageComposition) {
    const segment = extractAlmoNatureProductSegment(html);
    const pageEvidence = joinedText(segment, text, extractAlmoNatureGuaranteedAnalysis(html, sourceUrl));
    const isCompleteSegment = /\bcomplete\b/i.test(segment)
      || /\bcomplete\s*(?:&|and)\s*balanced\b/i.test(pageEvidence);
    if (!isCompleteSegment) return "";
    if (ingredients.length < 5) return "";
    if (!COMPLETE_FOOD_NUTRIENT_MARKER_REGEX.test(pageEvidence)) return "";
    if (!hasCoreGuaranteedAnalysis(pageEvidence)) return "";
  }

  return text;
}

function extractAlmoNatureGuaranteedAnalysis(html, sourceUrl) {
  if (!isAlmoNatureProductSource(sourceUrl)) return "";

  const match = html.match(/<div\b[^>]*class=["'][^"']*\bProduct__analytical\b[^"']*["'][^>]*>\s*<div\b[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const text = compact(decodeEntities(stripTags(match?.[1] || "")));
  if (!/\b(?:crude protein|crude fat|crude fiber|moisture)\b/i.test(text)) return "";
  return text;
}

function normalizeIngredientGroupPunctuation(value) {
  return cleanIngredientCandidate(value)
    .replace(/\.\s+(?=(?:vitamins?|minerals?|trace minerals?|amino acids?)\b)/gi, ", ");
}

function cleanIngredientCandidate(value) {
  return compact(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s*\|\s*/g, ", ")
    .replace(/^(?:(?:guaranteed analysis|analysis|feeding instructions|our ingredients|ingredients)\s+)+/i, "")
    .replace(/^[:;\-\s]+/, "")
    .replace(/\.\s+(?=(?:Dried Lactobacillus|Dried Bifidobacterium|Dried Enterococcus|Vitamins?|Minerals?)\b)/g, ", ")
    .replace(/\.\s+(?=(?:Magnesium Sulfate|Choline Chloride|Fish Oil|Celery Powder|Turmeric Powder|Ginger Powder|Coconut Oil)\b)/gi, ", ")
    .replace(/\s+Contains a source of live\b[\s\S]*$/i, "")
    .replace(/\s+\(?ME\s+CALCULATED\)?\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:Calorie Content|Caloric Content|Guaranteed Analysis)\b[\s\S]*$/i, "")
    .replace(/\s+Metabolizable energy\b[\s\S]*$/i, "")
    .replace(/\s+\b[^.]{0,240}?\bis\s+formulated\s+to\s+meet\s+the\s+nutritional\s+levels\s+established\s+by\s+the\s+AAFCO\b[\s\S]*$/i, "")
    .replace(/\s+\b[A-Z]\d{4,8}(?:-\d{1,4})?\.?\s*$/i, "")
    .replace(/\s+\b\d[A-Z]\d{4,8}(?:-\d{1,4})?\.?\s*$/i, "")
    .replace(/\s+\b[A-Z]{1,5}\d{2,8}\.?\s*$/i, "")
    .replace(/\s+\b[A-Z]?\d{5,}\s*$/i, "")
    .replace(/\s+\b[A-Z]\d{5,}\s*$/i, "")
    .replace(/\bpyr\s+idoxine\b/gi, "pyridoxine")
    .replace(/\bpantot\s+henate\b/gi, "pantothenate")
    .replace(/\bribo\s+flavin\b/gi, "riboflavin")
    .replace(/\bthia\s+mine\b/gi, "thiamine")
    .replace(/\bbio\s+tin\b/gi, "biotin")
    .replace(/,\s*$/g, "")
    .replace(/\s{2,}/g, " ");
}

function normalizeBlueBuffaloIngredientText(value, sourceUrl) {
  if (!hostMatches(sourceUrl, /(^|\.)bluebuffalo\.com$/i)) return value;
  return cleanIngredientCandidate(value)
    .replace(/\{/g, "(")
    .replace(/\bCalcium\s+lodate\b/gi, "Calcium Iodate")
    .replace(/\bCalcium Pantothenate\s+(\(?Vitamin B5\))/gi, (_, alias) => `Calcium Pantothenate (${alias.replace(/^\(+/, "").replace(/\)+$/, "")})`)
    .replace(/\bL-Ascorbyl-2-Polyphosphate\s+(\(?(?:source of )?Vitamin C\))/gi, (_, alias) => `L-Ascorbyl-2-Polyphosphate (${alias.replace(/^\(+/, "").replace(/\)+$/, "")})`);
}

function normalizeEarthbornIngredientText(value, sourceUrl) {
  if (!hostMatches(sourceUrl, /(^|\.)earthbornholisticpetfood\.com$/i)) return value;
  return cleanIngredientCandidate(value)
    .replace(/\b(Minerals\s*\[[^\]]*?Sodium Selenite)\)\]/gi, "$1]")
    .replace(/\b(Minerals\s*\[[^\]]*?Sodium Selenite)\),\s*(?=Potassium Chloride\b)/gi, "$1], ")
    .replace(/\b(Minerals\s*\([^)]*?Sodium Selenite)\],\s*(?=Potassium Chloride\b)/gi, "$1), ");
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

function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const nodes = [];

  for (const [, raw] of blocks) {
    try {
      nodes.push(...allJsonLdNodes(JSON.parse(decodeEntities(raw).trim())));
    } catch {
      // Bad third-party JSON-LD should not block extraction from other page evidence.
    }
  }

  return nodes;
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

function decodeAttributeEntities(value) {
  return decodeEntities(value).replace(/&quot;/gi, "\"").replace(/&#34;/g, "\"");
}

function canonicalUrl(html, baseUrl) {
  const match = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  return absoluteUrl(match?.[1], baseUrl);
}

function productPageUrl(...values) {
  for (const value of values) {
    const url = absoluteUrl(value);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (/\/(?:where-to-buy|store-locator|stores?)(?:\/|$)/i.test(parsed.pathname)) continue;
    } catch {
      // Keep non-URL source identifiers if a future source emits one.
    }
    return url;
  }
  return "";
}

function purinaShopEvidenceUrl(sourceUrl, canonical) {
  for (const value of [sourceUrl, canonical]) {
    const url = absoluteUrl(value);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (!/(^|\.)purina\.com$/i.test(parsed.hostname)) continue;
      if (!/^\/(?:cats|dogs)\/shop\//i.test(parsed.pathname)) continue;
      return url;
    } catch {
      // Ignore malformed URL candidates.
    }
  }
  return "";
}

function inferBrandFromUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();
    if (host.endsWith("diamondpet.com")) {
      if (pathname.includes("/diamond-naturals-grain-free/")) return "Diamond Naturals Grain-Free";
      if (pathname.includes("/diamond-naturals/")) return "Diamond Naturals";
      if (pathname.includes("/diamond-care/")) return "Diamond CARE";
      if (pathname.includes("/diamond-pro89/")) return "Diamond Pro89";
      if (pathname.includes("/diamond/")) return "Diamond";
    }
  } catch {
    return "";
  }

  return "";
}

function extractSection(text, labels, stopLabels) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const stopPattern = stopLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:^|\\b)(${labelPattern})\\s*:?\\s+([\\s\\S]{12,1800}?)(?=\\b(?:${stopPattern})\\s*:?\\s+|$)`, "i");
  const match = text.match(pattern);
  return compact(match?.[2] || "");
}

function extractIngredients(text) {
  return extractSection(text, [
    "Ingredients",
    "Ingredient List",
    "Ingredient Statement",
  ], [
    "View All Ingredients",
    "Download the full ingredient list",
    "Guaranteed Analysis",
    "Feeding and Nutrition",
    "Feeding Guide",
    "Calorie Content",
    "Feeding Guidelines",
    "Feeding Instructions",
    "Nutrition",
    "Description",
    "About",
  ]);
}

function extractNutritionBlockIngredients(text) {
  const normalized = compact(decodeEntities(String(text || "")));
  if (!normalized) return "";

  const matches = normalized.matchAll(/\bIngredients\s*:\s*/gi);
  for (const match of matches) {
    const start = match.index + match[0].length;
    const before = normalized.slice(Math.max(0, match.index - 700), match.index);
    const hasNutritionContext = /\b(?:Nutrition\s*&\s*Ingredients|Recipe\s+Breakdown|Crude\s+Protein|Crude\s+Fat|Crude\s+Fiber|Moisture|Calories?)\b/i.test(before);
    if (!hasNutritionContext) continue;

    const rest = normalized.slice(start);
    const stop = rest.search(/\b(?:Daily\s+Feeding\s+Guidelines|Feeding\s+Guidelines|Feeding\s+Guide|Feeding\s+Instructions|Guaranteed\s+Analysis|Calorie\s+Content|Caloric\s+Content|A\s+Fresh\s+Approach|Description|About\s+This|Size\s+\d|Quantity\s+Add\s+to\s+cart)\b/i);
    const candidate = cleanIngredientCandidate(stop === -1 ? rest.slice(0, 1200) : rest.slice(0, stop));
    if (/\b(?:Crude\s+Protein|Crude\s+Fat|Crude\s+Fiber|Moisture|Calories?|Kcal)\b/i.test(candidate)) continue;

    const ingredientText = firstIngredientText(candidate);
    if (ingredientText) return ingredientText;
  }

  return "";
}

function extractNutritionIngredientsHeadingBlock(text) {
  const normalized = compact(decodeEntities(String(text || "")));
  if (!normalized) return "";

  const patterns = [
    /\bNutrition\s+Nutrition\s+Ingredients\s+/ig,
    /\bNutrition\s+Ingredients\s+/ig,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const before = normalized.slice(Math.max(0, match.index - 900), match.index);
      const after = normalized.slice(match.index + match[0].length);
      if (!/\b(?:Details|Features\s*&\s*Benefits|Complete\s*&\s*Balanced|AAFCO|Add\s+to\s+cart)\b/i.test(before)) continue;

      const stop = after.search(/\b(?:Calorie\s+Content|Caloric\s+Content|Guaranteed\s+Analysis|Feeding\s+Instructions|Feeding\s+Guidelines|Customer\s+Reviews|Add\s+a\s+review|Transition\s+Instructions)\b/i);
      const candidate = cleanIngredientCandidate(stop === -1 ? after.slice(0, 1800) : after.slice(0, stop))
        .replace(/^(?:new|old)\s+formula\s*:?\s*/i, "")
        .replace(/\s+Any time you change formulas\b[\s\S]*$/i, "");
      if (/\b(?:Crude\s+Protein|Crude\s+Fat|Crude\s+Fiber|Moisture|Kcals?)\b/i.test(candidate)) continue;

      const ingredientText = firstIngredientText(candidate);
      if (ingredientText) return ingredientText;
      if (isPlausibleNutritionHeadingIngredientStatement(candidate)) return candidate;
    }
  }

  return "";
}

function extractFormulaLabelParagraphIngredients(html) {
  const paragraphs = [...String(html || "").matchAll(/<p\b[^>]*>([\s\S]{0,5000}?)<\/p>/gi)]
    .map(([, paragraphHtml]) => paragraphHtml);

  for (const paragraphHtml of paragraphs) {
    const label = compact(decodeEntities(stripTags(
      paragraphHtml.match(/<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>/i)?.[1] || ""
    )));
    if (!/^(?:new formula|old formula|ingredients?)\s*:?\s*$/i.test(label)) continue;

    const text = cleanIngredientCandidate(stripTags(paragraphHtml))
      .replace(/^(?:new|old)\s+formula\s*:?\s*/i, "")
      .replace(/^ingredients?\s*:?\s*/i, "")
      .replace(/\s+Any time you change formulas\b[\s\S]*$/i, "");
    const ingredientText = firstIngredientText(text);
    if (ingredientText) return ingredientText;
    if (isPlausibleNutritionHeadingIngredientStatement(text)) return text;
  }

  return "";
}

function isMarsNutritionImageSource(sourceUrl) {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    return /(^|\.)pedigree\.com$/i.test(host) || /(^|\.)cesar\.com$/i.test(host);
  } catch {
    return false;
  }
}

function extractMarsNutritionImageIngredients(text, sourceUrl) {
  if (!isMarsNutritionImageSource(sourceUrl)) return "";

  const normalized = decodeEntities(text)
    .replace(/\r/g, "\n")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const analysisIndex = normalized.search(/\bGuaranteed Analysis\b/i);
  if (analysisIndex === -1) return "";

  const beforeAnalysis = normalized.slice(0, analysisIndex).trim();
  const labelStartIndex = marsNutritionIngredientLabelStartIndex(beforeAnalysis);
  const startIndex = labelStartIndex >= 0 ? labelStartIndex : marsNutritionIngredientStartIndex(beforeAnalysis);
  if (startIndex < 0 || (labelStartIndex < 0 && startIndex > 120)) return "";

  const candidate = cleanIngredientCandidate(beforeAnalysis.slice(startIndex))
    .replace(/\s+\.$/, "")
    .trim();
  if (!candidate) return "";
  if (/\b(?:Guaranteed Analysis|Crude Protein|Crude Fat|Crude Fiber|Moisture|Calorie Content)\b/i.test(candidate)) return "";
  if (!isPlausibleIngredientStatement(candidate)) return "";

  const ingredientCount = candidate.split(/[,;]+/).map(compact).filter(Boolean).length;
  if (ingredientCount < 10) return "";
  if (!/\b(?:minerals?|vitamins?|choline chloride|vitamin [A-Z0-9]+|zinc sulfate|potassium iodide|biotin|riboflavin|thiamine|folic acid|sodium nitrite)\b/i.test(candidate)) {
    return "";
  }

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

function titleMatchesAccordionItem(itemHtml, title) {
  const cleanTitle = title.toLowerCase();
  const text = decodeAttributeEntities(itemHtml).toLowerCase();
  return text.includes(`"dc:title":"${cleanTitle}"`)
    || text.includes(`>${cleanTitle}<`)
    || text.includes(`cmp-accordion__title">${cleanTitle}`);
}

function extractAemAccordionText(html, title) {
  const items = html.split(/<div\b[^>]*class=["'][^"']*cmp-accordion__item[^"']*["'][^>]*>/i);
  for (const item of items) {
    if (!titleMatchesAccordionItem(item, title)) continue;

    const panelMatch = item.match(/<div\b[^>]*class=["'][^"']*cmp-accordion__panel[^"']*["'][^>]*>([\s\S]*)/i);
    if (!panelMatch?.[1]) continue;
    const panelHtml = panelMatch?.[1] || item;
    return compact(decodeEntities(stripTags(panelHtml))
      .replace(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), ""));
  }

  return "";
}

function extractAccordionBlock(html, value) {
  const marker = `data-accordion-value="${value}"`;
  const start = html.indexOf(marker);
  if (start === -1) return "";

  const rest = html.slice(start + marker.length);
  const nextAccordion = rest.search(/<div\b[^>]*data-accordion-value=["'][^"']+["']/i);
  return nextAccordion === -1 ? rest : rest.slice(0, nextAccordion);
}

function extractIngredientList(html) {
  const block = extractAccordionBlock(html, "ingredients");
  if (!block) return "";

  const items = [...block.matchAll(/<li\b[\s\S]*?<\/li>/gi)]
    .map(([itemHtml]) => compact(decodeEntities(stripTags(itemHtml))))
    .map((text) => text.replace(/\bView All Ingredients\b[\s\S]*$/i, ""))
    .map(compact)
    .filter((text) => text.length >= 2 && text.length <= 120)
    .filter((text) => !/^(ingredients?|view all ingredients|download the full ingredient list)$/i.test(text));

  return items.length >= 5 ? items.join(", ") : "";
}

function headingTextMatches(value, labels) {
  const text = compact(decodeEntities(stripTags(value))).toLowerCase();
  return labels.some((label) => text === label || text.includes(label));
}

function extractHeadingParagraphIngredientText(html) {
  const labels = ["ingredients", "ingredient list", "ingredient statement", "full ingredient list"];
  const headingPattern = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let match;

  while ((match = headingPattern.exec(html)) !== null) {
    if (!headingTextMatches(match[1], labels)) continue;

    const rest = html.slice(match.index + match[0].length);
    const stop = rest.search(/<h[1-4]\b|<div\b[^>]*(?:id=["'](?:guaranteed-analysis|general-analysis|feeding-guide)["']|class=["'][^"']*(?:analysis|tab-pane))/i);
    const block = stop === -1 ? rest.slice(0, 4000) : rest.slice(0, stop);
    const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(([, paragraphHtml]) => cleanIngredientCandidate(stripTags(paragraphHtml)))
      .filter(Boolean);

    const listItems = [...block.matchAll(/<li\b[\s\S]*?<\/li>/gi)]
      .map(([itemHtml]) => cleanIngredientCandidate(stripTags(itemHtml)))
      .filter((text) => text.length >= 2 && text.length <= 140);
    if (listItems.length >= 5) paragraphs.push(listItems.join(", "));

    const ingredientText = firstIngredientText(...paragraphs);
    if (ingredientText) return ingredientText;
  }

  return "";
}

function isBlackwoodSource(sourceUrl) {
  return hostMatches(sourceUrl, /(^|\.)blackwoodpetfood\.com$/i);
}

function extractBlackwoodFullIngredientList(html, sourceUrl = "") {
  if (!isBlackwoodSource(sourceUrl)) return "";

  const heading = html.match(/<h[1-4]\b[^>]*>\s*Full Ingredient List\s*<\/h[1-4]>/i);
  if (heading?.index === undefined) return "";

  const rest = html.slice(heading.index + heading[0].length);
  const stop = rest.search(/<div\b[^>]*class=["'][^"']*\btab\b[^"']*\btab-guaranteed-analysis\b|<h[1-4]\b/i);
  const block = stop === -1 ? rest.slice(0, 6000) : rest.slice(0, stop);
  const text = cleanIngredientCandidate(stripTags(block));
  return firstIngredientText(text);
}

function extractFarminaTitolettoParagraph(html, labels) {
  const pattern = /<span\b[^>]*class=["'][^"']*\btitoletto\b[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<p\b[^>]*class=["'][^"']*\bcomp\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  for (const match of html.matchAll(pattern)) {
    const [, labelHtml, paragraphHtml] = match;
    if (!headingTextMatches(labelHtml, labels)) continue;
    return compact(stripTags(paragraphHtml));
  }
  return "";
}

function extractFarminaIngredients(html) {
  return firstIngredientText(extractFarminaTitolettoParagraph(html, ["ingredients"]));
}

function extractInlineIngredientList(html) {
  const headingPattern = /<h[1-4]\b[^>]*class=["'][^"']*\binfo-title\b[^"']*["'][^>]*>\s*Ingredients\s*<\/h[1-4]>/gi;
  let match;

  while ((match = headingPattern.exec(html)) !== null) {
    const rest = html.slice(match.index + match[0].length);
    const listHtml = rest.match(/<ul\b[^>]*class=["'][^"']*\bcomma-separated-list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1];
    if (!listHtml) continue;

    const ingredients = [...listHtml.matchAll(/<li\b[\s\S]*?<\/li>/gi)]
      .map(([itemHtml]) => cleanIngredientCandidate(stripTags(itemHtml)))
      .filter((text) => text.length >= 2 && text.length <= 140)
      .filter((text) => !/^(ingredients?|view all ingredients)$/i.test(text));
    if (ingredients.length < 5) {
      ingredients.push(...[...listHtml.matchAll(/<a\b[^>]*class=["'][^"']*\bpopup-trigger\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)]
        .map(([, itemHtml]) => cleanIngredientCandidate(stripTags(itemHtml)))
        .filter((text) => text.length >= 2 && text.length <= 140)
        .filter((text) => !/^(ingredients?|view all ingredients)$/i.test(text)));
    }

    const ingredientText = firstIngredientText(ingredients.join(", "));
    if (ingredientText) return ingredientText;
  }

  return "";
}

function extractProductIngredientsList(html) {
  const blocks = [...html.matchAll(/<ul\b[^>]*class=(["'])(?=[^"']*\bproduct-ingredients-list\b)(?=[^"']*\blist-ingredients\b)[^"']*\1[^>]*>([\s\S]*?)<\/ul>/gi)]
    .map(([, , blockHtml]) => blockHtml);

  for (const block of blocks) {
    const ingredients = [...block.matchAll(/<li\b[\s\S]*?<\/li>/gi)]
      .map(([itemHtml]) => cleanIngredientCandidate(stripTags(itemHtml)))
      .filter((text) => text.length >= 2 && text.length <= 140)
      .filter((text) => !/^(ingredients?|view all ingredients|description)$/i.test(text));

    const ingredientText = firstIngredientText(ingredients.join(", "));
    if (ingredientText) return ingredientText;
  }

  return "";
}

function extractProductSpecIngredients(html) {
  const items = [...html.matchAll(/<li\b[^>]*class=["'][^"']*\bproduct-spec__item\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)]
    .map(([, itemHtml]) => itemHtml);

  for (const itemHtml of items) {
    const labelHtml = itemHtml.match(/<div\b[^>]*class=["'][^"']*\bproduct-spec__label\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    if (!headingTextMatches(labelHtml, ["ingredients"])) continue;

    const valueHtml = itemHtml.match(/<div\b[^>]*class=["'][^"']*\bproduct-spec__value\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const text = cleanIngredientCandidate(stripTags(valueHtml)).replace(/^(?:ingredients\s*)+/i, "");
    const ingredientText = firstIngredientText(text);
    if (ingredientText) return ingredientText;
  }

  return "";
}

function normalizeInlineIngredientLabel(value) {
  return compact(value)
    .replace(/^i\s+ngredients\b/i, "Ingredients")
    .replace(/^ingredients?\s*[:\-]?\s*/i, "");
}

function extractInlineLabeledIngredients(html) {
  const blocks = [...html.matchAll(/<(p|li)\b[^>]*>([\s\S]{0,5000}?)<\/\1>/gi)]
    .map(([, , blockHtml]) => blockHtml);

  for (const block of blocks) {
    const text = compact(decodeEntities(stripTags(block)))
      .replace(/^i\s+ngredients\b/i, "Ingredients");
    if (!/^ingredients?\s*[:\-]/i.test(text)) continue;

    const ingredientText = firstIngredientText(normalizeInlineIngredientLabel(text));
    if (ingredientText) return ingredientText;
  }

  return "";
}

function labelPattern(labels) {
  return labels
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("|");
}

function findStrongLabelIndex(html, labels, fromIndex = 0) {
  const pattern = new RegExp(`<strong\\b[^>]*>\\s*(?:${labelPattern(labels)})\\s*:?\\s*(?:&nbsp;)?\\s*<\\/strong>`, "ig");
  pattern.lastIndex = fromIndex;
  const match = pattern.exec(html);
  return match ? match.index : -1;
}

function extractStrongLabelSectionBlock(html, labels, stopLabels, limit = 6000) {
  const pattern = new RegExp(`<strong\\b[^>]*>\\s*(?:${labelPattern(labels)})\\s*:?\\s*(?:&nbsp;)?\\s*<\\/strong>`, "ig");
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const start = match.index + match[0].length;
    const labelParagraphStart = html.lastIndexOf("<p", match.index);
    const labelParagraphEnd = html.indexOf("</p>", start);
    const blockStart = labelParagraphStart !== -1 && labelParagraphEnd !== -1 && labelParagraphEnd - match.index < 500
      ? labelParagraphStart
      : start;
    let end = Math.min(start + limit, html.length);

    const stopIndex = findStrongLabelIndex(html, stopLabels, start);
    if (stopIndex !== -1 && stopIndex < end) end = stopIndex;

    const nextAccordion = html.slice(start, end).search(/<div\b[^>]*class=["'][^"']*\baccordion\b[^"']*["']/i);
    if (nextAccordion !== -1) end = start + nextAccordion;

    const block = html.slice(blockStart, end);
    const text = compact(decodeEntities(stripTags(block)));
    if (text.length >= 20) return block;
  }

  return "";
}

function extractStrongLabelIngredients(html) {
  const block = extractStrongLabelSectionBlock(html, ["Ingredients", "Ingredient List", "Ingredient Statement"], [
    "Calorie Content",
    "Caloric Content",
    "Guaranteed Analysis",
    "Feeding Guide",
    "Feeding Guidelines",
    "Feeding Instructions",
    "Nutrition",
    "Description",
    "About",
  ]);
  if (!block) return "";
  return extractIngredientTextFromBlock(block);
}

function extractIngredientDescriptionText(html) {
  const blocks = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bingredient-description\b[^"']*["'][^>]*>([\s\S]{0,120000}?)<\/div>/gi)]
    .map(([, blockHtml]) => blockHtml);

  for (const block of blocks) {
    const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(([, paragraphHtml]) => cleanIngredientCandidate(stripTags(paragraphHtml)))
      .filter(Boolean);
    const ingredientText = firstIngredientText(...paragraphs);
    if (ingredientText) return ingredientText;
  }

  return "";
}

function extractIngredientItemList(html) {
  const names = [...html.matchAll(/<span\b[^>]*class=["'][^"']*\bingredient-item\b[^"']*["'][^>]*>\s*([^<]+?)\s*<span\b[^>]*class=["'][^"']*\btooltip-text\b/gi)]
    .map(([, value]) => cleanIngredientCandidate(decodeEntities(value)))
    .filter((text) => text.length >= 2 && text.length <= 140)
    .filter((text) => !/^(ingredients?|view all ingredients|description)$/i.test(text));

  return firstIngredientText(names.join(", "));
}

function extractIngredientsTabPane(html) {
  const elementorTabText = extractIngredientTextFromBlock(extractElementorDataTabBlock(html, ["ingredients"]));
  if (elementorTabText) return elementorTabText;

  const block = extractBlockById(html, "ingredients")
    || extractBlockById(html, "ingredients-tab-pane")
    || extractBlockById(html, "ingredients-accordion-panel")
    || extractBlockById(html, "ingredients-pane")
    || extractBlockById(html, "ingredients-collapse")
    || extractBlockById(html, "prod_ingredients")
    || extractCollapseContentByTitle(html, ["ingredients", "ingredient list", "ingredient statement"])
    || extractControlledTabBlock(html, "Ingredients");
  if (!block) return "";

  const text = cleanIngredientCandidate(stripTags(block))
    .replace(/^(?:ingredients\s*)+/i, "")
    .replace(/\b(?:guaranteed analysis|calorie content|feeding guide|aafco statement|sizes)\b[\s\S]*$/i, "");
  return firstIngredientText(text);
}

function extractIngredientClassBlock(html) {
  const match = html.match(/<div\b[^>]*class=["'][^"']*\bingredients\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!match?.[1]) return "";

  const text = cleanIngredientCandidate(stripTags(match[1]))
    .replace(/^(?:ingredients\s*)+/i, "");
  return firstIngredientText(text);
}

function extractBlackwoodProductName(html, sourceUrl = "") {
  if (!isBlackwoodSource(sourceUrl)) return "";

  const formula = compact(decodeEntities(stripTags(
    html.match(/<div\b[^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>[\s\S]*?<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || ""
  )));
  const title = compact(decodeEntities(stripTags(
    html.match(/<span\b[^>]*class=["'][^"']*\bbreadcrumb_last\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || ""
  )));

  if (title && formula && !title.toLowerCase().includes(formula.toLowerCase())) {
    return `${title} ${formula}`;
  }
  return formula || title;
}

function extractModalBlock(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idMatch = html.match(new RegExp(`\\bid=["']${escaped}["']`, "i"));
  if (!idMatch?.index) return "";

  const start = html.lastIndexOf("<div", idMatch.index);
  if (start === -1) return "";

  const rest = html.slice(start);
  const nextModal = rest.slice(1).search(/<div\b[^>]*class=["'][^"']*\bmodal\b[^"']*["'][^>]*id=["'][^"']+["']/i);
  return nextModal === -1 ? rest : rest.slice(0, nextModal + 1);
}

function extractModalImageAlt(html, id) {
  const block = extractModalBlock(html, id);
  if (!block) return "";

  const values = [...block.matchAll(/<img\b[^>]*\balt=(["'])([\s\S]*?)\1[^>]*>/gi)]
    .map(([, , value]) => compact(decodeEntities(value)))
    .filter(Boolean);

  return firstText(...values);
}

function extractIngredientsModal(html) {
  return extractModalImageAlt(html, "ingredientsModal");
}

function extractModalDrawerContentBlock(html, contentId) {
  const escaped = contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<div\\b(?=[^>]*\\bclass=["'][^"']*\\bmodalDrawerContent\\b[^"']*["'])(?=[^>]*\\bdata-modal-content-id=["']${escaped}["'])[^>]*>`, "i"));
  if (!match?.index) return "";

  const rest = html.slice(match.index + match[0].length);
  const nextModal = rest.search(/<div\b(?=[^>]*\bclass=["'][^"']*\bmodalDrawerContent\b[^"']*["'])(?=[^>]*\bdata-modal-content-id=["'][^"']+["'])/i);
  return nextModal === -1 ? rest.slice(0, 12000) : rest.slice(0, nextModal);
}

function extractModalDrawerIngredients(html) {
  const block = extractModalDrawerContentBlock(html, "Ingredients");
  return extractIngredientTextFromBlock(block);
}

function normalizeOpenFarmIngredientName(value) {
  return compact(value)
    .replace(/^G\.A\.P\.\s*Step\s*\d+\s+/i, "")
    .replace(/\s+/g, " ");
}

function extractOpenFarmIngredientsModal(html) {
  const start = html.indexOf('class="ingredients-modal"');
  if (start === -1) return "";

  const rest = html.slice(start);
  const completeLink = rest.indexOf("View Complete Ingredients");
  const block = completeLink === -1 ? rest.slice(0, 180_000) : rest.slice(0, completeLink);
  const ingredients = [...block.matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi)]
    .map(([, itemHtml]) => normalizeOpenFarmIngredientName(decodeEntities(stripTags(itemHtml))))
    .filter((text) => text.length >= 2 && text.length <= 120)
    .filter((text) => !/^(ingredients?|complete ingredients|why they'll love it)$/i.test(text));

  return ingredients.length >= 5 ? ingredients.join(", ") : "";
}

function extractJustFoodForDogsRealIngredients(html, sourceUrl = "") {
  if (!hostMatches(sourceUrl, /(^|\.)justfoodfordogs\.com$/i)) return "";

  const currentModal = extractJustFoodForDogsCurrentRealIngredientsModal(html);
  if (currentModal) return currentModal;

  const block = html.match(/<div\b[^>]*class=["'][^"']*\breal--ingredients\b[^"']*["'][^>]*>([\s\S]{0,80000}?)<\/div>\s*<\/div>\s*<\/div>/i)?.[1] || "";
  if (!block) return "";

  const ingredients = [];
  for (const [itemHtml] of block.matchAll(/<li\b[\s\S]*?<\/li>/gi)) {
    const name = cleanIngredientCandidate(stripTags(
      itemHtml.match(/<span\b[^>]*class=["'][^"']*\breal--ingredients__details-table__name\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || ""
    ));
    if (!name || name.length > 140 || /^(?:real ingredients?|ingredient)$/i.test(name)) continue;

    const valueHtml = itemHtml.match(/<span\b[^>]*class=["'][^"']*\breal--ingredients__details-table__value\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || "";
    const valueText = compact(decodeEntities(stripTags(valueHtml)));
    const nutrientBlend = valueText.match(/\b(Dicalcium\s+Phosphate[\s\S]{20,1200})$/i)?.[1] || "";
    ingredients.push(nutrientBlend ? `${name} (${cleanIngredientCandidate(nutrientBlend)})` : name);
  }

  return firstIngredientText(ingredients.join(", "));
}

function extractJustFoodForDogsCurrentRealIngredientsModal(html) {
  const block = extractModalBlock(html, "realIngredientsModal");
  if (!block) return "";

  const titles = [...block.matchAll(/<p\b[^>]*class=["'][^"']*\bpdp__real-ingredients-modal__tile-title\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, titleHtml]) => cleanIngredientCandidate(stripTags(titleHtml)))
    .filter((name) => name && name.length <= 140)
    .filter((name) => !/^(?:real ingredients?|ingredient|details|nutritional facts)$/i.test(name));
  if (titles.length < 5) return "";

  const copies = [...block.matchAll(/<p\b[^>]*class=["'][^"']*\bpdp__real-ingredients-modal__tile-copy\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, copyHtml]) => compact(decodeEntities(stripTags(copyHtml))));
  const nutrientBlendCopy = copies.find((copy) => /\bDicalcium\s+Phosphate\b/i.test(copy)) || "";
  const nutrientBlend = nutrientBlendCopy.match(/\b(Dicalcium\s+Phosphate[\s\S]{20,1400})$/i)?.[1] || "";

  const ingredients = titles.map((name) => (
    nutrientBlend && /^JustFoodForDogs\s+Nutrient\s+Blend$/i.test(name)
      ? `${name} (${cleanIngredientCandidate(nutrientBlend)})`
      : name
  ));

  return firstIngredientText(ingredients.join(", "));
}

function extractJustFoodForDogsAdequacyStatement(html, sourceUrl = "") {
  if (!hostMatches(sourceUrl, /(^|\.)justfoodfordogs\.com$/i) && !/\bJustFoodForDogs\b/i.test(html)) return "";

  const text = visibleText(html);
  const statements = [];
  const completeMatch = text.match(/\bJustFoodForDogs\s+[^.]{2,180}?\s+(?:is\s+)?formulated\s+to\s+meet\s+the\s+nutritional\s+levels\s+established\s+by\s+the\s+AAFCO\s+(?:Dog|Cat)(?:\s+Food)?\s+Nutrient\s+Profiles?[^.]{0,240}(?:\.|$)/i)?.[0];
  if (completeMatch) statements.push(completeMatch);

  const feedingTrialMatch = text.match(/\bFeeding\s+trials\s+using\s+AAFCO\s+procedures\s+substantiate\s+that\s+the\s+JustFoodForDogs\s+[^.]{2,220}?\s+provides\s+complete\s+and\s+balanced\s+nutrition[^.]{0,180}(?:\.|$)/i)?.[0];
  if (feedingTrialMatch) statements.push(feedingTrialMatch);

  const supplementalMatch = text.match(/\bJustFoodForDogs\s+[^.]{2,180}?\s+is\s+intended\s+for\s+intermittent\s+or\s+supplemental\s+feeding[^.]{0,180}(?:\.|$)/i)?.[0];
  if (supplementalMatch) statements.push(supplementalMatch);

  return compact(statements.join(" "));
}

function inferJustFoodForDogsCompleteFoodFromAdequacy(sourceUrl, adequacyStatement, fallback) {
  if (!hostMatches(sourceUrl, /(^|\.)justfoodfordogs\.com$/i) && !/\bJustFoodForDogs\b/i.test(adequacyStatement)) return fallback;
  if (hasSupplementalFeedingEvidence(adequacyStatement)) return "false";
  if (hasCompleteNutritionEvidence(adequacyStatement)) return "true";
  return fallback;
}

function extractGuaranteedAnalysisModal(html) {
  const block = extractModalBlock(html, "guaranteedAnalysisModal");
  return block ? compact(decodeEntities(stripTags(block))) : "";
}

function titleTextMatches(value, labels) {
  const text = compact(decodeEntities(stripTags(value))).toLowerCase();
  return labels.some((label) => text === label || text === `our ${label}`);
}

function extractElementorDataTabBlock(html, labels) {
  const normalizedLabels = labels.map((label) => compact(label).toLowerCase()).filter(Boolean);
  const titles = html.matchAll(/<div\b(?=[^>]*\belementor-tab-title\b)(?=[^>]*\bdata-tab=(["'])([^"']+)\1)[^>]*>([\s\S]*?)<\/div>/gi);

  for (const match of titles) {
    if (!titleTextMatches(match[3], normalizedLabels)) continue;

    const tab = match[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rest = html.slice(match.index + match[0].length);
    const contentMatch = rest.match(new RegExp(`<div\\b(?=[^>]*\\belementor-tab-content\\b)(?=[^>]*\\bdata-tab=(["'])${tab}\\1)[^>]*>`, "i"));
    if (contentMatch?.index === undefined) continue;

    const contentBody = rest.slice(contentMatch.index + contentMatch[0].length);
    const nextTab = contentBody.search(/<div\b[^>]*class=["'][^"']*\belementor-tab-title\b[^"']*["'][^>]*\bdata-tab=["'][^"']+["']/i);
    return nextTab === -1 ? contentBody.slice(0, 8000) : contentBody.slice(0, nextTab);
  }

  return "";
}

function extractIngredientTextFromBlock(block) {
  if (!block) return "";

  const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, paragraphHtml]) => cleanIngredientCandidate(stripTags(paragraphHtml)))
    .filter(Boolean);
  const listItems = [...block.matchAll(/<li\b[\s\S]*?<\/li>/gi)]
    .map(([itemHtml]) => cleanIngredientCandidate(stripTags(itemHtml)))
    .filter((text) => text.length >= 2 && text.length <= 140);
  if (listItems.length >= 5) paragraphs.push(listItems.join(", "));

  return firstIngredientText(...paragraphs, cleanIngredientCandidate(stripTags(block)));
}

function extractDiamondPetIngredientsTabPane(html, sourceUrl) {
  if (!hostMatches(sourceUrl, /(^|\.)diamondpet\.com$/i)) return "";

  const tabMatch = html.match(/<div\b[^>]*class=["'][^"']*\bingredients-tab\b[^"']*["'][^>]*>[\s\S]{0,12000}?(?=<div\b[^>]*class=["'][^"']*\btab-pane\b|<\/div>\s*<\/div>\s*<\/div>)/i);
  const block = tabMatch?.[0] || extractBlockById(html, "Ingredients") || extractBlockById(html, "ingredients");
  if (!block) return "";

  const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, paragraphHtml]) => cleanIngredientCandidate(stripTags(paragraphHtml)))
    .filter(Boolean)
    .filter((text) => !/\b(?:facility in which this food is made|trace amounts of these other ingredients)\b/i.test(text));

  return firstIngredientText(...paragraphs, cleanIngredientCandidate(stripTags(block)));
}

function extractControlledTabBlock(html, title) {
  const expectedTitle = title.toLowerCase();
  const buttons = html.matchAll(/<button\b[\s\S]*?<\/button>/gi);

  for (const [buttonHtml] of buttons) {
    const buttonTitle = compact(decodeEntities(stripTags(buttonHtml))).toLowerCase();
    if (buttonTitle !== expectedTitle) continue;

    const controlId = buttonHtml.match(/\baria-controls=(["'])([^"']+)\1/i)?.[2];
    if (!controlId) continue;

    const block = extractBlockById(html, controlId);
    if (block) return block;
  }

  return "";
}

function extractCollapseContentByTitle(html, labels) {
  const expectedLabels = labels.map((label) => label.toLowerCase());
  const sections = html.matchAll(/<collapsible-section\b[\s\S]*?<\/collapsible-section>/gi);

  for (const [sectionHtml] of sections) {
    const title = compact(decodeEntities(stripTags(
      sectionHtml.match(/<span\b[^>]*class=["'][^"']*\bwt-collapse__trigger__title\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || ""
    ))).toLowerCase();
    if (!expectedLabels.includes(title)) continue;

    const content = sectionHtml.match(/<div\b[^>]*class=["'][^"']*\bwt-collapse__target__content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i)?.[1];
    if (content) return content;
  }

  return "";
}

function extractDiviTabBlock(html, labels) {
  const expectedLabels = labels.map((label) => label.toLowerCase());
  const controls = html.matchAll(/<li\b[^>]*class=(["'])(?=[^"']*\bet_pb_tab_(\d+)\b)[^"']*\1[^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi);

  for (const control of controls) {
    const tabId = control[2];
    const title = compact(decodeEntities(stripTags(control[3]))).toLowerCase();
    if (!expectedLabels.includes(title)) continue;

    const tabClassPattern = new RegExp(`\\bet_pb_tab_${tabId}\\b`, "i");
    const tabStart = html.slice(control.index).search(/<div\b[^>]*class=["'][^"']*\bet_pb_tab\b[^"']*["'][^>]*>/i);
    if (tabStart === -1) continue;

    let absoluteStart = control.index + tabStart;
    let foundMatchingTab = false;
    while (absoluteStart !== -1 && absoluteStart < html.length) {
      const divMatch = html.slice(absoluteStart).match(/<div\b[^>]*class=["']([^"']*\bet_pb_tab\b[^"']*)["'][^>]*>/i);
      if (!divMatch?.[0]) break;

      const currentStart = absoluteStart + divMatch.index;
      if (tabClassPattern.test(divMatch[1])) {
        absoluteStart = currentStart;
        foundMatchingTab = true;
        break;
      }
      absoluteStart = currentStart + divMatch[0].length;
    }

    if (!foundMatchingTab) continue;

    const rest = html.slice(absoluteStart);
    const nextTab = rest.slice(1).search(/<div\b[^>]*class=["'][^"']*\bet_pb_tab\b[^"']*\bet_pb_tab_\d+\b[^"']*["'][^>]*>/i);
    const block = nextTab === -1 ? rest.slice(0, 8000) : rest.slice(0, nextTab + 1);
    const contentMatch = block.match(/<div\b[^>]*class=["'][^"']*\bet_pb_tab_content\b[^"']*["'][^>]*>([\s\S]*)/i);
    return contentMatch?.[1] || block;
  }

  return "";
}

function extractDiviTabIngredients(html) {
  const block = extractDiviTabBlock(html, ["ingredients", "ingredient list", "ingredient statement"]);
  if (!block) return "";
  return firstIngredientText(cleanIngredientCandidate(stripTags(block)));
}

function extractBlockById(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idMatch = html.match(new RegExp(`\\bid=["']${escaped}["']`, "i"));
  if (!idMatch?.index) return "";

  const start = html.lastIndexOf("<div", idMatch.index);
  if (start === -1) return "";

  const rest = html.slice(start);
  const nextPane = rest.slice(1).search(/<div\b[^>]*class=["'][^"']*\btab-pane\b/i);
  return nextPane === -1 ? rest.slice(0, 8000) : rest.slice(0, nextPane + 1);
}

function extractDefinitionListRows(block) {
  const cells = [...block.matchAll(/<(dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(([, tag, cellHtml]) => ({
      tag: tag.toLowerCase(),
      text: compact(decodeEntities(stripTags(cellHtml))),
    }))
    .filter((cell) => cell.text);
  const rows = [];

  for (let index = 0; index < cells.length - 1; index += 1) {
    const label = cells[index];
    const value = cells[index + 1];
    if (label.tag !== "dt" || value.tag !== "dd") continue;
    if (/^ingredient$/i.test(label.text) && /^amount$/i.test(value.text)) continue;
    rows.push(`${label.text} ${value.text}`);
  }

  return rows;
}

function extractTableRows(block) {
  const rows = [];
  for (const [, rowHtml] of block.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowHtml.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map(([, cellHtml]) => compact(decodeEntities(stripTags(cellHtml))))
      .filter(Boolean);
    if (cells.length < 2) continue;
    if (/^ingredient$/i.test(cells[0]) && /^amount$/i.test(cells[1])) continue;
    rows.push(`${cells[0]} ${cells.slice(1).join(" ")}`);
  }
  return rows;
}

function extractInlineNutrientRows(block) {
  const text = compact(decodeEntities(stripTags(block))
    .replace(/\*Not recognized as an essential nutrient[\s\S]*$/i, ""));
  const rows = [...text.matchAll(/\b(?:crude\s+protein|crude\s+fat|crude\s+fiber|moisture|omega[-\s]?\d+\s+fatty\s+acids?|taurine|calcium|phosphorus|zinc|selenium|vitamin\s+e|dha|epa|glucosamine|chondroitin)\b[\s\S]{0,90}?\d+(?:\.\d+)?\s*(?:%|mg\/kg|iu\/kg|kcal\/kg)/gi)]
    .map(([row]) => compact(row));
  return [...new Set(rows)];
}

function extractGuaranteedAnalysisHtml(html) {
  const blocks = [];
  const farminaAnalysisBlock = extractFarminaTitolettoParagraph(html, ["guaranteed analysis", "analysis"]);
  if (farminaAnalysisBlock) blocks.push(farminaAnalysisBlock);
  const strongLabelAnalysisBlock = extractStrongLabelSectionBlock(html, ["Guaranteed Analysis", "Analysis"], [
    "Feeding Guide",
    "Feeding Guidelines",
    "Feeding Instructions",
    "Nutritional Adequacy Statement",
    "Ingredients",
    "Calorie Content",
    "Caloric Content",
    "Description",
    "About",
  ]);
  if (strongLabelAnalysisBlock) blocks.push(strongLabelAnalysisBlock);
  const elementorAnalysisBlock = extractElementorDataTabBlock(html, ["guaranteed analysis", "analysis"]);
  if (elementorAnalysisBlock) blocks.push(elementorAnalysisBlock);
  const diviAnalysisBlock = extractDiviTabBlock(html, ["guaranteed analysis", "analysis"]);
  if (diviAnalysisBlock) blocks.push(diviAnalysisBlock);
  const controlledTabBlock = extractControlledTabBlock(html, "Guaranteed Analysis");
  if (controlledTabBlock) blocks.push(controlledTabBlock);
  const jinxAnalysisBlock = html.match(/<div\b[^>]*class=["'][^"']*\btab-content-2\b[^"']*["'][^>]*>([\s\S]{0,12000}?)(?=<div\b[^>]*class=["'][^"']*\btab-content-\d\b|<\/main>|<\/body>|$)/i)?.[1];
  if (jinxAnalysisBlock) blocks.push(jinxAnalysisBlock);
  const firstMateAnalysisBlock = extractBlockById(html, "analysis");
  if (firstMateAnalysisBlock) blocks.push(firstMateAnalysisBlock);
  const tabBlock = extractBlockById(html, "guaranteed-analysis");
  if (tabBlock) blocks.push(tabBlock);
  const productGuaranteeBlock = extractBlockById(html, "prod_guarantee");
  if (productGuaranteeBlock) blocks.push(productGuaranteeBlock);
  const collapseAnalysisBlock = extractCollapseContentByTitle(html, ["guaranteed analysis", "analysis"]);
  if (collapseAnalysisBlock) blocks.push(collapseAnalysisBlock);
  const analysisAndCalorieBlock = extractBlockById(html, "analysis-and-calorie-pane")
    || extractBlockById(html, "analysis-and-calorie-collapse");
  if (analysisAndCalorieBlock) blocks.push(analysisAndCalorieBlock);

  const headingPattern = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let match;
  while ((match = headingPattern.exec(html)) !== null) {
    if (!headingTextMatches(match[1], ["guaranteed analysis", "analysis"])) continue;
    const rest = html.slice(match.index + match[0].length);
    const stop = rest.search(/<h[1-4]\b|<div\b[^>]*(?:id=["'](?:ingredients|feeding-guide|general-analysis)["']|class=["'][^"']*(?:tab-pane))/i);
    blocks.push(stop === -1 ? rest.slice(0, 4000) : rest.slice(0, stop));
  }

  for (const block of blocks) {
    const definitionRows = extractDefinitionListRows(block);
    if (definitionRows.length >= 2) return definitionRows.join(", ");

    const tableRows = extractTableRows(block)
      .filter((text) => /\b(?:protein|fat|fiber|moisture|taurine|omega|vitamin|dha|epa|calcium|phosphorus|zinc|selenium|glucosamine|chondroitin|minimum|maximum|kcal|mg\/kg|iu\/kg|%)\b/i.test(text));
    if (tableRows.length >= 2) return tableRows.join(", ");

    const listRows = [...block.matchAll(/<li\b[\s\S]*?<\/li>/gi)]
      .map(([itemHtml]) => compact(decodeEntities(stripTags(itemHtml))))
      .filter((text) => /\b(?:protein|fat|fiber|moisture|taurine|omega|vitamin|dha|epa|calcium|phosphorus|kcal)\b/i.test(text));
    if (listRows.length >= 2) return listRows.join(", ");

    const inlineRows = extractInlineNutrientRows(block);
    if (inlineRows.length >= 2) return inlineRows.join(", ");
  }

  return "";
}

function firstEscapedMarker(html, markers, fromIndex = 0) {
  let best = null;
  for (const marker of markers) {
    const index = html.indexOf(marker, fromIndex);
    if (index === -1) continue;
    if (!best || index < best.index) best = { index, marker };
  }
  return best;
}

function earliestEscapedStop(html, markers, fromIndex, fallbackEnd) {
  let best = fallbackEnd;
  for (const marker of markers) {
    const index = html.indexOf(marker, fromIndex);
    if (index !== -1 && index < best) best = index;
  }
  return best;
}

const PETSMART_ESCAPED_INGREDIENT_MARKERS = [
  "\\u003cstrong\\u003eIngredients:\\u003c/strong\\u003e",
  "\\u003cstrong\\u003eIngredients: \\u003c/strong\\u003e",
  "\\u003cstrong\\u003eIngredients:\\u003cbr /\\u003e\\u003c/strong\\u003e",
  "\\u003cstrong\\u003eIngredients: \\u003cbr /\\u003e\\u003c/strong\\u003e",
  "\\u003cstrong\\u003eIngredients\\u003c/strong\\u003e",
  "\\u003cb\\u003eIngredients:\\u003c/b\\u003e",
  "\\u003cb\\u003eIngredients: \\u003c/b\\u003e",
  "\\u003cb\\u003eIngredients:\\u003cbr /\\u003e\\u003c/b\\u003e",
  "\\u003cb\\u003eIngredients: \\u003cbr /\\u003e\\u003c/b\\u003e",
  "\\u003cb\\u003eIngredients\\u003c/b\\u003e",
];
const PETSMART_ESCAPED_GA_MARKERS = [
  "\\u003cstrong\\u003eGuaranteed Analysis:\\u003c/strong\\u003e",
  "\\u003cstrong\\u003eGuaranteed Analysis: \\u003c/strong\\u003e",
  "\\u003cstrong\\u003eGuaranteed Analysis:\\u003cbr /\\u003e\\u003c/strong\\u003e",
  "\\u003cstrong\\u003eGuaranteed Analysis: \\u003cbr /\\u003e\\u003c/strong\\u003e",
  "\\u003cb\\u003eGuaranteed Analysis:\\u003c/b\\u003e",
  "\\u003cb\\u003eGuaranteed Analysis: \\u003c/b\\u003e",
  "\\u003cb\\u003eGuaranteed Analysis:\\u003cbr /\\u003e\\u003c/b\\u003e",
  "\\u003cb\\u003eGuaranteed Analysis: \\u003cbr /\\u003e\\u003c/b\\u003e",
];

function extractPetSmartEscapedIngredientCandidates(html) {
  const ingredientStopMarkers = [
    ...PETSMART_ESCAPED_GA_MARKERS,
    "\\u003cstrong\\u003eCalorie Content",
    "\\u003cstrong\\u003eCaloric Content",
    "\\u003cb\\u003eCaloric Content",
    "\\u003cb\\u003eCalorie Content",
    "\\u003cp\\u003eOur natural ingredients",
    "\\u003cp\\u003eAdded vitamins",
    "\\u003cstrong\\u003eFEEDING INSTRUCTIONS",
    "\\u003cb\\u003eFEEDING INSTRUCTIONS",
  ];
  const candidates = [];
  const seen = new Set();
  let searchIndex = 0;

  while (searchIndex < html.length) {
    const match = firstEscapedMarker(html, PETSMART_ESCAPED_INGREDIENT_MARKERS, searchIndex);
    if (!match) break;

    const contentStart = match.index + match.marker.length;
    const fallbackEnd = Math.min(contentStart + 3000, html.length);
    const contentEnd = earliestEscapedStop(html, ingredientStopMarkers, contentStart, fallbackEnd);
    const text = normalizeIngredientGroupPunctuation(stripTags(decodeEscapedHtmlFragment(html.slice(contentStart, contentEnd))))
      .replace(/^ingredients?\s*:?\s*/i, "");
    const key = text.toLowerCase();
    if (text && !seen.has(key)) {
      seen.add(key);
      candidates.push(text);
    }

    searchIndex = contentStart;
  }

  return candidates;
}

function extractPetSmartEscapedIngredients(html) {
  return firstIngredientText(...extractPetSmartEscapedIngredientCandidates(html));
}

function extractPetSmartEscapedGuaranteedAnalysis(html) {
  const stopMarkers = [
    "\\u003cstrong\\u003eCalorie Content",
    "\\u003cstrong\\u003eCaloric Content",
    "\\u003cb\\u003eCaloric Content",
    "\\u003cb\\u003eCalorie Content",
    "\\u003cstrong\\u003eFEEDING INSTRUCTIONS",
    "\\u003cb\\u003eFEEDING INSTRUCTIONS",
    "\\u003cstrong\\u003eFeeding Instructions",
    "\\u003cstrong\\u003eFeeding Guidelines",
    "\\u003cstrong\\u003eNutritional Adequacy Statement",
    "\\u003cstrong\\u003eDESCRIPTION",
    "\\u003cstrong\\u003eDescription",
  ];
  let searchIndex = 0;

  while (searchIndex < html.length) {
    const match = firstEscapedMarker(html, PETSMART_ESCAPED_GA_MARKERS, searchIndex);
    if (!match) break;
    const markerIndex = match.index;

    let contentEnd = Math.min(markerIndex + 4000, html.length);
    for (const stopMarker of stopMarkers) {
      const stopIndex = html.indexOf(stopMarker, markerIndex + match.marker.length);
      if (stopIndex !== -1 && stopIndex < contentEnd) {
        const paragraphStart = html.lastIndexOf("\\u003cp", stopIndex);
        contentEnd = paragraphStart > markerIndex ? paragraphStart : stopIndex;
      }
    }

    const paragraphStart = html.lastIndexOf("\\u003cp", markerIndex);
    const contentStart = paragraphStart !== -1 && markerIndex - paragraphStart < 300 ? paragraphStart : markerIndex;
    const decoded = decodeEscapedHtmlFragment(html.slice(contentStart, contentEnd));
    const rows = decoded
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .split(/\r?\n/)
      .map((row) => compact(stripTags(row)))
      .map((text) => text.replace(/^guaranteed analysis\s*:?\s*/i, ""))
      .map((text) => text.replace(/,?\s*br>\s*/gi, ", "))
      .filter(Boolean)
      .filter((text) => !/\b(?:not recognized as an essential nutrient|aafco|nutrient profiles)\b/i.test(text))
      .filter((text) => /\b(?:protein|fat|fiber|moisture|taurine|omega|vitamin|dha|epa|calcium|phosphorus|zinc|selenium|glucosamine|chondroitin|linoleic|bacillus|minimum|maximum|kcal|mg\/kg|iu\/kg|cfu)\b|\((?:min|max)\)|%/i.test(text));

    if (rows.length >= 2) return rows.join(", ");

    const fallback = compact(stripTags(decoded))
      .replace(/^guaranteed analysis\s*:?\s*/i, "");
    if (/\bprotein\b/i.test(fallback) && /\b(?:fat|fiber|moisture)\b/i.test(fallback)) return fallback;

    searchIndex = markerIndex + match.marker.length;
  }

  return "";
}

function hostMatches(sourceUrl, pattern) {
  try {
    return pattern.test(new URL(sourceUrl).hostname);
  } catch {
    return false;
  }
}

function isPetcoProductSource(sourceUrl, html) {
  return hostMatches(sourceUrl, /(^|\.)petco\.com$/i)
    || /\bPrimary Brand\b[\s\S]{0,160}\bWholeHearted\b/i.test(html)
    || /\bassets\.petco\.com\/petco\/image\/upload\b/i.test(html);
}

function extractPetcoSpec(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stopLabels = [
    "Primary Brand",
    "Primary Flavor",
    "Lifestage",
    "Life Stage",
    "Breed Sizes",
    "Breed Size",
    "Weight",
    "SKU",
    "Length",
    "Width",
    "Height",
    "Food Texture",
    "Food Form",
    "Special Diet",
    "Health Feature",
    "Item Dimensions",
    "Shipping Dimensions",
    "Ingredients",
    "Guaranteed Analysis",
    "Description",
  ].filter((item) => item.toLowerCase() !== label.toLowerCase());
  const stopPattern = stopLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`\\b${escaped}\\s+([\\s\\S]{1,160}?)(?=\\s+(?:${stopPattern})\\b|$)`, "i"));
  return compact(match?.[1] || "");
}

function cleanPetcoPackageSize(value) {
  return compact(value)
    .replace(/\bpounds?\b/gi, "LBS")
    .replace(/\blbs?\.?\b/gi, "LBS")
    .replace(/\bounces?\b/gi, "OZ")
    .replace(/\boz\.?\b/gi, "OZ")
    .replace(/\s+/g, " ");
}

function stripPetcoPackageSize(value) {
  return compact(value)
    .replace(/,\s*\d+(?:\.\d+)?\s*(?:lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams)\.?\s*$/i, "")
    .replace(/\s+\d+(?:\.\d+)?\s*(?:lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams)\.?\s*$/i, "")
    .trim();
}

function extractPetcoHeading(html) {
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map(([, headingHtml]) => compact(decodeEntities(stripTags(headingHtml))))
    .filter((heading) => /\b(?:dog|cat)\s+food\b/i.test(heading));
  return firstText(...headings);
}

function extractPetcoProductNameFromText(text, brand) {
  const expectedBrand = compact(brand);
  const escapedBrand = expectedBrand
    ? expectedBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : "[A-Z][A-Za-z&' -]{2,40}";
  const identityText = text.split(/\bIngredients\b(?!\s*&|\s+and)/i)[0] || text;
  const packageSuffix = ",\\s*\\d+(?:\\.\\d+)?\\s*(?:lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams)\\.?"
  const match = identityText.match(new RegExp(`\\b(${escapedBrand}\\s+[\\s\\S]{8,170}?\\b(?:Dog|Cat)\\s+Food(?:${packageSuffix})?)\\b`, "i"));
  return stripPetcoPackageSize(match?.[1] || "");
}

function extractPetcoRecipeFlavor(productName, brand) {
  const text = removePhrase(productName, brand)
    .replace(/\b(?:all life stages|adult|senior|puppy|kitten|dry|wet|dog|cat|food)\b/gi, " ")
    .replace(/\s+/g, " ");
  const match = text.match(/\b([a-z][a-z '&-]{2,90}?\b(?:recipe|formula|dinner|entree|entr[eé]e|flavor))\b/i);
  return compact(match?.[1] || "");
}

function cleanPetcoAssetUrl(value, baseUrl) {
  const text = compact(decodeEntities(value))
    .replace(/\\\//g, "/")
    .replace(/[),.;]+$/g, "");
  return absoluteUrl(text, baseUrl);
}

function extractPetcoImageUrl(html, baseUrl) {
  const decoded = decodeEscapedHtmlFragment(html);
  const rawMatch = decoded.match(/https?:\/\/assets\.petco\.com\/petco\/image\/upload\/[^\s"'<>\\)]+/i)
    || decoded.match(/\/\/assets\.petco\.com\/petco\/image\/upload\/[^\s"'<>\\)]+/i);
  if (rawMatch?.[0]) return cleanPetcoAssetUrl(rawMatch[0], baseUrl);

  const sku = extractPetcoSku(visibleText(html), html);
  return sku ? `https://assets.petco.com/petco/image/upload/c_pad%2Cdpr_1.0%2Cf_auto%2Cq_auto%2Ch_636%2Cw_636/c_pad%2Ch_636%2Cw_636/l_bypetco-badge%2Cfl_relative%2Cw_0.20%2Cg_south_east%2Ce_sharpen/${sku}-center-1` : "";
}

function extractPetcoSectionAfterLabel(text, label, stopLabels) {
  return extractPetcoSectionsAfterLabel(text, label, stopLabels)[0] || "";
}

function extractPetcoSectionsAfterLabel(text, label, stopLabels) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = new RegExp(`\\b${escaped}\\b(?!\\s*&|\\s+and)\\s*:?\\s*`, "gi");
  const stopPattern = new RegExp(`\\b(?:${stopLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const sections = [];
  let match;

  while ((match = labelPattern.exec(text)) !== null) {
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const stop = rest.search(stopPattern);
    const section = compact(stop === -1 ? rest.slice(0, 3000) : rest.slice(0, stop));
    if (section.length > 0) sections.push(section);
  }

  return sections;
}

function extractPetcoIngredients(text) {
  const sections = extractPetcoSectionsAfterLabel(text, "Ingredients", [
    "Guaranteed Analysis",
    "Calorie Content",
    "Description",
    "Specifications",
    "Item Dimensions",
    "Reviews",
    "Directions",
  ]);
  return firstIngredientText(...sections);
}

function cleanPetcoGuaranteedAnalysis(section) {
  const text = compact(section)
    .replace(/^guaranteed analysis\s*:?\s*/i, "")
    .replace(/\s+\*Not recognized as an essential nutrient\b/i, "; *Not recognized as an essential nutrient")
    .replace(/\s+\bDHA,?\s+(?:Savory\s+Chicken|Chicken\s+and\s+Oatmeal)\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:Starting\s+at\s+\$|\$\d+(?:\.\d{2})?\s+was\s+\$)\b[\s\S]*$/i, "");
  const rows = extractInlineNutrientRows(text);
  if (rows.length >= 2) return rows.join("; ");
  if (/\bprotein\b/i.test(text) && /\b(?:fat|fiber|moisture)\b/i.test(text)) return text;
  return "";
}

function extractPetcoGuaranteedAnalysis(text) {
  const section = extractPetcoSectionAfterLabel(text, "Guaranteed Analysis", [
    "Calorie Content",
    "Description",
    "Specifications",
    "Item Dimensions",
    "Reviews",
    "Directions",
    "Feeding Instructions",
  ]);
  return cleanPetcoGuaranteedAnalysis(section);
}

function extractPetcoSkuFromHtml(html) {
  const decoded = decodeEscapedHtmlFragment(html);
  return firstText(
    decoded.match(/\bproductSku\s*=\s*['"]([A-Z0-9-]{4,30})['"]/i)?.[1],
    decoded.match(/["']sku["']\s*:\s*["']([A-Z0-9-]{4,30})["']/i)?.[1],
    decoded.match(/\/([A-Z0-9-]{4,30})-center-1\b/i)?.[1]
  );
}

function extractPetcoSku(text, html = "") {
  return compact(extractPetcoSkuFromHtml(html) || text.match(/\bSKU\s+([A-Z0-9-]{4,30})\b/i)?.[1] || "");
}

function petcoCacheKeyFor(brand, sku) {
  const cleanSku = compact(sku);
  if (!cleanSku) return "";
  if (/\bwhole\s*hearted\b|\bwholehearted\b/i.test(brand)) return `petco-wholehearted:${cleanSku}`;
  return `petco:${cleanSku}`;
}

function extractPetcoEvidence(html, sourceUrl) {
  if (!isPetcoProductSource(sourceUrl, html)) return {};

  const text = visibleText(html);
  const primaryBrand = firstText(extractPetcoSpec(text, "Primary Brand"));
  const title = stripPetcoPackageSize(firstText(
    extractPetcoHeading(html),
    cleanProductName(metaContent(html, "og:title", "twitter:title"), primaryBrand),
    cleanProductName(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], primaryBrand),
    extractPetcoProductNameFromText(text, primaryBrand)
  ).replace(/\s*[|–-]\s*Petco\s*$/i, ""));
  const inferredBrand = firstText(
    primaryBrand,
    title.match(/^\s*(WholeHearted)\b/i)?.[1]
  );
  const packageSize = cleanPetcoPackageSize(firstText(
    extractPetcoSpec(text, "Weight"),
    inferPackageSize(title)
  ));
  const sku = extractPetcoSku(text, html);
  const primaryFlavor = extractPetcoSpec(text, "Primary Flavor");
  const titleFlavor = extractPetcoRecipeFlavor(title, inferredBrand) || inferFlavor(title, inferredBrand, "");
  const flavor = titleFlavor && (!primaryFlavor || titleFlavor.toLowerCase().includes(primaryFlavor.toLowerCase()))
    ? titleFlavor
    : firstText(primaryFlavor, titleFlavor);

  return {
    cacheKey: petcoCacheKeyFor(inferredBrand, sku),
    productName: title,
    brand: inferredBrand,
    flavor,
    lifeStage: extractPetcoSpec(text, "Lifestage") || extractPetcoSpec(text, "Life Stage"),
    foodForm: firstText(extractPetcoSpec(text, "Food Form"), inferFoodForm(title)),
    packageSize,
    petType: inferPetType(title, sourceUrl, text.slice(0, 600)),
    ingredientStatement: extractPetcoIngredients(text),
    imageUrl: extractPetcoImageUrl(html, sourceUrl),
    guaranteedAnalysis: extractPetcoGuaranteedAnalysis(text),
    productUrl: hostMatches(sourceUrl, /(^|\.)petco\.com$/i) ? sourceUrl : "",
  };
}

function extractInfoTitlePanelText(html, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<h[1-4]\\b[^>]*class=["'][^"']*\\binfo-title\\b[^"']*["'][^>]*>\\s*${escaped}\\s*<\\/h[1-4]>`, "i"));
  if (!match?.index) return "";

  const rest = html.slice(match.index + match[0].length);
  const nextPanel = rest.slice(1).search(/<div\b[^>]*class=["'][^"']*\binfo-item\b/i);
  const block = nextPanel === -1 ? rest.slice(0, 2000) : rest.slice(0, nextPanel + 1);
  return compact(decodeEntities(stripTags(block)));
}

function extractFrommGuaranteedAnalysis(html) {
  return [extractInfoTitlePanelText(html, "Caloric Content"), extractInfoTitlePanelText(html, "Guaranteed Analysis")]
    .filter(Boolean)
    .join(", ");
}

function extractGuaranteedAnalysis(text) {
  const section = compact(extractSection(text, [
    "Guaranteed Analysis",
    "Analysis",
  ], [
    "Ingredients",
    "Calorie Content",
    "Feeding Guidelines",
    "Feeding Instructions",
    "Description",
    "About",
  ])
    .replace(/\bI\s+ngredients\s*:?\s*[\s\S]*$/i, "")
    .replace(/\bIngredients\s*:?\s*[\s\S]*$/i, "")
    .replace(/\b(?:How do I feed|Feeding Guidelines|Feeding Instructions)\b[\s\S]*$/i, ""));
  if (!/\b(?:protein|fat|fiber|moisture|taurine|omega|vitamin|dha|epa|calcium|phosphorus|zinc|selenium|glucosamine|chondroitin|minimum|maximum|kcal|mg\/kg|iu\/kg)\b|%/i.test(section)) {
    return "";
  }
  return section;
}

function extractCompleteFoodEvidenceText(text) {
  const section = compact(extractSection(text, [
    "Guaranteed Analysis",
    "Analysis",
    "Nutritional Guarantee",
    "Nutritional Adequacy",
    "Nutritional Adequacy Statement",
  ], [
    "Ingredients",
    "Calorie Content",
    "Feeding Guidelines",
    "Feeding Instructions",
    "Description",
    "About",
  ]));
  return /\b(?:complete\s*(?:&|and)\s*balanced|formulated\s+to\s+meet|AAFCO|supplemental\s+feeding|intermittent|maintenance|growth)\b/i.test(section)
    ? section
    : "";
}

function parseWindowJson(html, variableName) {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`window\\.${escaped}\\s*=\\s*({[\\s\\S]*?});`, "i"));
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function parseScriptJsonById(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<script\\b[^>]*\\bid=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i"));
  if (!match?.[1]) return null;

  try {
    return JSON.parse(decodeEntities(match[1]).trim());
  } catch {
    return null;
  }
}

function pageDataUrlFor(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    if (!/(^|\.)purina\.com$/i.test(url.hostname)) return "";
    if (url.pathname.startsWith("/page-data/")) return "";
    const pathname = url.pathname.replace(/\/+$/g, "") || "/";
    return `${url.origin}/page-data${pathname}/page-data.json`;
  } catch {
    return "";
  }
}

async function fetchJsonQuietly(url) {
  const cacheKey = compact(url);
  if (!cacheKey) return null;
  if (PAGE_DATA_CACHE.has(cacheKey)) return PAGE_DATA_CACHE.get(cacheKey);

  try {
    const response = await safeFetchText(cacheKey, {
      userAgent: "WoofCatalogVerifier/1.0 (source-evidence extraction)",
      accept: "application/json",
      cacheDir: rawCacheDir("page-data"),
    });
    const json = JSON.parse(response.body);
    PAGE_DATA_CACHE.set(cacheKey, json);
    return json;
  } catch {
    PAGE_DATA_CACHE.set(cacheKey, null);
    return null;
  }
}

function cachePathsForUrl(cacheDir, url, extension = "body") {
  const key = crypto.createHash("sha256").update(url, "utf8").digest("hex");
  return {
    bodyPath: path.join(cacheDir, `${key}.${extension}`),
    metaPath: path.join(cacheDir, `${key}.json`),
  };
}

async function fetchPdfBytesQuietly(url) {
  const sourceUrl = compact(url);
  if (!sourceUrl) return null;

  const cacheDir = rawCacheDir("pdf-labels");
  const cache = cacheDir ? cachePathsForUrl(cacheDir, sourceUrl, "pdf") : null;
  if (cache && fs.existsSync(cache.bodyPath)) {
    return fs.readFileSync(cache.bodyPath);
  }

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "WoofCatalogVerifier/1.0 (source-evidence extraction)",
        "Accept": "application/pdf",
      },
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (cache) {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cache.bodyPath, bytes);
      fs.writeFileSync(cache.metaPath, `${JSON.stringify({
        url: sourceUrl,
        final_url: response.url || sourceUrl,
        content_type: response.headers.get("content-type") || "",
        fetched_at: new Date().toISOString(),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      }, null, 2)}\n`, "utf8");
    }
    return bytes;
  } catch {
    return null;
  }
}

function pythonCandidates() {
  const candidates = [
    process.env.WOOF_PYTHON_BIN,
    process.env.PYTHON,
  ].filter(Boolean);

  const runtimePython = process.execPath.replace(/\/node\/bin\/node(?:\.exe)?$/i, "/python/bin/python3");
  if (runtimePython !== process.execPath && fs.existsSync(runtimePython)) {
    candidates.push(runtimePython);
  }

  candidates.push("python3", "python");
  return [...new Set(candidates.map(compact).filter(Boolean))];
}

function extractPdfTextWithPython(bytes) {
  if (!bytes?.length) return "";

  const tmpPath = path.join(os.tmpdir(), `woof-label-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pdf`);
  fs.writeFileSync(tmpPath, bytes);
  try {
    const script = [
      "import sys",
      "try:",
      "    from pypdf import PdfReader",
      "except Exception:",
      "    sys.exit(2)",
      "reader = PdfReader(sys.argv[1])",
      "print('\\n'.join(page.extract_text() or '' for page in reader.pages))",
    ].join("\n");

    for (const pythonBin of pythonCandidates()) {
      const result = spawnSync(pythonBin, ["-c", script, tmpPath], {
        encoding: "utf8",
        timeout: 20000,
        maxBuffer: 2 * 1024 * 1024,
      });
      if (result.status === 0 && compact(result.stdout)) {
        return result.stdout;
      }
    }
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Temporary PDF cleanup is best-effort only.
    }
  }

  return "";
}

function isOfficialPurinaUrl(value) {
  try {
    const parsed = new URL(value);
    return /(^|\.)purina\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function labelDeckUrlFromGatsbyNode(node, baseUrl) {
  const labelDeck = node?.relationships?.label_deck || node?.label_deck || null;
  const url = absoluteUrl(
    labelDeck?.url
      || labelDeck?.relationships?.file?.url
      || labelDeck?.file?.url
      || labelDeck?.uri,
    baseUrl
  );
  return isOfficialPurinaUrl(url) ? url : "";
}

function extractIngredientsFromOfficialLabelText(value) {
  const text = String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
  if (!text) return "";

  const labelPattern = /\bINGREDIENTS\s*:/gi;
  for (const match of text.matchAll(labelPattern)) {
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const stop = rest.search(/\b(?:GUARANTEED\s+ANALYSIS|CALORIE\s+CONTENT|CALORIC\s+CONTENT|NUTRITIONAL\s+ADEQUACY|FEEDING\s+(?:DIRECTIONS|GUIDELINES|INSTRUCTIONS)|AAFCO|DISTRIBUTED\s+BY|MANUFACTURED\s+BY|PRODUCT\s+OF|NET\s+WT|PURINA\s+(?:TRADEMARKS|CAT|DOG))\b/i);
    const candidate = cleanIngredientCandidate(stop === -1 ? rest.slice(0, 2600) : rest.slice(0, stop));
    const ingredientText = firstIngredientText(candidate);
    if (ingredientText) return ingredientText;
  }

  return "";
}

async function officialLabelPdfIngredients(gatsbyNode, baseUrl) {
  const labelDeckUrl = labelDeckUrlFromGatsbyNode(gatsbyNode, baseUrl);
  if (!labelDeckUrl) return { ingredientText: "", sourceUrl: "" };
  if (PDF_TEXT_CACHE.has(labelDeckUrl)) return PDF_TEXT_CACHE.get(labelDeckUrl);

  const bytes = await fetchPdfBytesQuietly(labelDeckUrl);
  const pdfText = extractPdfTextWithPython(bytes);
  const ingredientText = extractIngredientsFromOfficialLabelText(pdfText);
  const result = ingredientText
    ? { ingredientText, sourceUrl: labelDeckUrl }
    : { ingredientText: "", sourceUrl: "" };
  PDF_TEXT_CACHE.set(labelDeckUrl, result);
  return result;
}

function sameHostUrl(value, baseUrl) {
  try {
    const parsed = new URL(value);
    const base = new URL(baseUrl);
    return parsed.hostname.toLowerCase() === base.hostname.toLowerCase();
  } catch {
    return false;
  }
}

function officialIngredientPdfUrlFromHtml(html, baseUrl) {
  const source = String(html || "");
  for (const match of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const [, attrs, labelHtml] = match;
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/i)?.[1];
    if (!href) continue;

    const title = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const label = compact(`${visibleText(labelHtml)} ${decodeEntities(title)}`);
    if (!/\b(?:download\s+the\s+)?full\s+ingredient\s+list\b|\bingredients?\s+(?:list|pdf|form)\b/i.test(label)) continue;

    const url = absoluteUrl(href, baseUrl);
    if (sameHostUrl(url, baseUrl)) return url;
  }

  return "";
}

async function officialPagePdfIngredients(html, baseUrl) {
  const pdfUrl = officialIngredientPdfUrlFromHtml(html, baseUrl);
  if (!pdfUrl) return { ingredientText: "", sourceUrl: "" };
  if (PDF_TEXT_CACHE.has(pdfUrl)) return PDF_TEXT_CACHE.get(pdfUrl);

  const bytes = await fetchPdfBytesQuietly(pdfUrl);
  const pdfText = extractPdfTextWithPython(bytes);
  const ingredientText = extractIngredientsFromOfficialLabelText(pdfText);
  const result = ingredientText
    ? { ingredientText, sourceUrl: pdfUrl }
    : { ingredientText: "", sourceUrl: "" };
  PDF_TEXT_CACHE.set(pdfUrl, result);
  return result;
}

function shopifyProductJsonUrlFor(sourceUrl, html = "") {
  try {
    const url = new URL(sourceUrl);
    if (!/\/products\/[^/?#]+\/?$/i.test(url.pathname)) return "";
    url.hash = "";
    url.search = "";
    url.pathname = `${url.pathname.replace(/\/+$/g, "")}.js`;
    return url.toString();
  } catch {
    return "";
  }
}

async function fetchShopifyProductData(sourceUrl, html) {
  const url = shopifyProductJsonUrlFor(sourceUrl, html);
  return url ? fetchJsonQuietly(url) : null;
}

async function fetchPageDataFor(sourceUrl) {
  const url = pageDataUrlFor(sourceUrl);
  return url ? fetchJsonQuietly(url) : null;
}

function pageDataNode(pageData) {
  return pageData?.result?.data?.node && typeof pageData.result.data.node === "object"
    ? pageData.result.data.node
    : null;
}

function extractGatsbyImageUrl(value, baseUrl) {
  const images = value?.gatsbyImage?.images || value?.images || null;
  const fallback = images?.fallback?.src || "";
  if (fallback) return normalizeMaybeRelativeImage(fallback, baseUrl);

  const sourceSet = images?.sources?.[0]?.srcSet || "";
  const firstSource = compact(sourceSet.split(",")[0]?.replace(/\s+\d+w\s*$/i, ""));
  return firstSource ? normalizeMaybeRelativeImage(firstSource, baseUrl) : "";
}

function extractGatsbyNodeImage(node, baseUrl) {
  return normalizeMaybeRelativeImage(
    node?.relationships?.image?.url
      || node?.relationships?.image?.relationships?.file?.url
      || node?.image?.url
      || extractGatsbyImageUrl(node?.relationships?.image, baseUrl)
      || extractGatsbyImageUrl(node?.image, baseUrl),
    baseUrl
  );
}

function ingredientNamesFromGatsbyNode(node) {
  const ingredients = Array.isArray(node?.relationships?.ingredients)
    ? node.relationships.ingredients
    : [];
  return ingredients
    .map((ingredient) => compact(ingredient?.name))
    .filter((name) => name.length >= 2 && name.length <= 140)
    .filter((name) => !/^(ingredients?|view all ingredients)$/i.test(name));
}

function ingredientTextFromGatsbyNode(node) {
  const ingredients = ingredientNamesFromGatsbyNode(node);
  return ingredients.length >= 5 ? ingredients.join(", ") : "";
}

function skusFromGatsbyNode(node) {
  return Array.isArray(node?.relationships?.skus) ? node.relationships.skus : [];
}

function gtinFromGatsbyNode(node) {
  for (const sku of skusFromGatsbyNode(node)) {
    const gtin = normalizeGtin(sku?.upc || sku?.gtin || sku?.ean || sku?.barcode);
    if (gtin) return gtin;
  }
  return "";
}

function packageSizeFromGatsbyNode(node) {
  const sku = skusFromGatsbyNode(node).find((item) => item?.size || item?.description || item?.shortDescription);
  if (!sku) return "";
  return firstText(
    sku.shortDescription,
    [sku.size, sku.description].map(compact).filter(Boolean).join(" ")
  );
}

function pathAliasFromGatsbyNode(node) {
  return compact(node?.path?.alias || node?.url || "");
}

function absolutePurinaUrl(pathAlias, baseUrl) {
  if (!pathAlias) return "";
  return absoluteUrl(pathAlias, baseUrl || "https://www.purina.com/");
}

async function fetchGatsbyNodeByPath(pathAlias, baseUrl) {
  const url = absolutePurinaUrl(pathAlias, baseUrl);
  const data = await fetchPageDataFor(url);
  return pageDataNode(data);
}

function uniqueIngredientNames(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

async function bundleFormulasFromGatsbyNode(node, baseUrl) {
  const includedProducts = Array.isArray(node?.relationships?.products)
    ? node.relationships.products
    : [];
  const formulas = [];

  for (const included of includedProducts) {
    const includedUrl = absolutePurinaUrl(pathAliasFromGatsbyNode(included), baseUrl);
    const childNode = ingredientNamesFromGatsbyNode(included).length >= 5
      ? included
      : await fetchGatsbyNodeByPath(pathAliasFromGatsbyNode(included), baseUrl);
    const ingredients = ingredientNamesFromGatsbyNode(childNode);
    if (ingredients.length < 5) continue;

    formulas.push({
      product_name: cleanProductName(firstText(childNode?.title, childNode?.name, included?.title), ""),
      product_url: includedUrl,
      gtin: gtinFromGatsbyNode(childNode) || null,
      ingredients,
    });
  }

  return formulas;
}

function bundleIngredientText(formulas) {
  const union = uniqueIngredientNames(formulas.flatMap((formula) => formula.ingredients || []));
  return union.length >= 5 ? union.join(", ") : "";
}

function bundleNutrientPanel(formulas) {
  if (!Array.isArray(formulas) || formulas.length === 0) return "";
  return JSON.stringify({
    bundle_formulas: formulas,
    ingredient_evidence: "Official Purina page-data included product ingredient relationships",
  });
}

function extractNextDataProduct(html) {
  return parseScriptJsonById(html, "__NEXT_DATA__")?.props?.pageProps?.product || null;
}

function extractShopifyImage(product, baseUrl) {
  return normalizeMaybeRelativeImage(product?.featured_image || product?.images?.[0], baseUrl);
}

function extractShopifyGtin(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  for (const variant of variants) {
    const gtin = normalizeGtin(variant?.barcode);
    if (gtin) return gtin;
  }
  return "";
}

function extractShopifyPackageSize(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const option = variants
    .flatMap((variant) => [variant?.public_title, variant?.option1, variant?.option2, variant?.option3])
    .map(compact)
    .find((value) => /\b\d+(?:\.\d+)?\s?(?:lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|ct|count|pack)\b/i.test(value));
  return option || "";
}

function extractShopifyDescriptionIngredients(product) {
  const description = decodeEscapedHtmlFragment(firstText(
    product?.description,
    product?.body_html,
    product?.bodyHtml
  ));
  if (!description) return "";

  return extractStrongLabelIngredients(description)
    || extractInlineLabeledIngredients(description)
    || extractHeadingParagraphIngredientText(description)
    || firstIngredientText(extractIngredients(visibleText(description)));
}

function shopifyMediaAltText(product) {
  const media = Array.isArray(product?.media) ? product.media : [];
  return media
    .map((item) => compact(item?.alt))
    .filter(Boolean)
    .join(" ");
}

function shopifyTagText(product) {
  return Array.isArray(product?.tags) ? product.tags.join(" ") : compact(product?.tags);
}

function freshpetProductData(product) {
  return product?.data && typeof product.data === "object" ? product.data : {};
}

function extractFreshpetImage(data) {
  const images = Array.isArray(data.images) ? data.images : [];
  const frontImage = images.find((image) => image?.frontPackageImage) || images[0] || {};
  return normalizeImage(frontImage.zoomImage || frontImage.image || frontImage.thumbnail || data.listingImage || data.listingAltImage);
}

function extractFreshpetGtin(data) {
  const sizes = Array.isArray(data.sizes) ? data.sizes : [];
  return normalizeGtin(sizes.find((size) => size?.upc)?.upc || "");
}

function extractFreshpetPackageSize(data) {
  const sizes = Array.isArray(data.sizes) ? data.sizes : [];
  return firstText(sizes.find((size) => size?.size)?.size);
}

function extractFreshpetGuaranteedAnalysis(data) {
  const full = data.fullGuaranteedAnalysis && typeof data.fullGuaranteedAnalysis === "object"
    ? data.fullGuaranteedAnalysis
    : null;
  if (full) {
    const rows = Object.values(full)
      .map((row) => {
        const label = compact(row?.label);
        const unit = compact(row?.unit);
        const value = row?.asFed;
        if (!label || value === undefined || value === null || value === -1) return "";
        const formatted = unit === "%" && Number.isFinite(Number(value))
          ? `${Number(value) * 100}%`
          : `${value}${unit ? ` ${unit}` : ""}`;
        return `${label} ${formatted}`;
      })
      .filter(Boolean);
    if (rows.length >= 2) return rows.join(", ");
  }

  const simple = data.nutritionalAnalysis && typeof data.nutritionalAnalysis === "object"
    ? data.nutritionalAnalysis
    : null;
  if (!simple) return "";

  return Object.entries(simple)
    .map(([key, value]) => `${key.replace(/([a-z])([A-Z])/g, "$1 $2")} ${value}`)
    .join(", ");
}

function extractFreshpetNutritionalInfo(data) {
  const disclaimer = compact(data.nutritionalAnalysisDisclaimer);
  const metaDescription = compact(data.metaDescription);
  if (!disclaimer && !metaDescription) return "";
  return JSON.stringify({
    source: "freshpet_official_next_data",
    nutritionalAnalysisDisclaimer: disclaimer,
    metaDescription,
  });
}

function extractWindowTemplate(html, variableName) {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp("window\\." + escaped + "\\s*=\\s*`([\\s\\S]*?)`", "i"));
  return match?.[1] || "";
}

function extractIngredientsJson(html) {
  const ingredientsJson = parseWindowJson(html, "ingredientsJson");
  const ingredients = Array.isArray(ingredientsJson?.ingredients)
    ? ingredientsJson.ingredients.map((ingredient) => cleanIngredientJsonName(ingredient?.name)).filter(Boolean)
    : [];
  return ingredients.length >= 5 ? ingredients.join(", ") : "";
}

function cleanIngredientJsonName(value) {
  return compact(value)
    .replace(/\s+This product was made using\b[\s\S]*$/i, "")
    .replace(/\s+Actual product packaging\b[\s\S]*$/i, "")
    .replace(/\s+Product availability\b[\s\S]*$/i, "")
    .replace(/[.]+$/g, "")
    .trim();
}

function additionalPropertyValue(product, ...names) {
  const expected = new Set(names.map((name) => compact(name).toLowerCase()));
  const properties = Array.isArray(product?.additionalProperty)
    ? product.additionalProperty
    : [];

  for (const property of properties) {
    const name = compact(property?.name).toLowerCase();
    const value = compact(property?.value);
    if (expected.has(name) && value) return value;
  }

  return "";
}

function normalizeAnalysisTable(value) {
  return compact(value)
    .replace(/\|?Nutrient\|?@@\|?Amount\|?##\s*/i, "")
    .replace(/\s*##\s*/g, ", ")
    .replace(/\s*@@\s*/g, " ")
    .replace(/\|/g, " ")
    .replace(/,\s*$/g, "");
}

function extractAnalysisTable(html) {
  const template = extractWindowTemplate(html, "guaranteedAnalysisHtml");
  if (!template) return "";

  const rows = [...template.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(([, rowHtml]) => [...rowHtml.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map(([, cellHtml]) => compact(decodeEntities(stripTags(cellHtml))))
      .filter(Boolean))
    .filter((cells) => cells.length >= 2 && !/^ingredient$/i.test(cells[0]))
    .map((cells) => `${cells[0]} ${cells.slice(1).join(" ")}`);

  return rows.join(", ");
}

function inferPetType(...values) {
  const text = values.map(compact).join(" ").toLowerCase();
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferPurinaPetTypeFromShopUrl(value) {
  try {
    const parsed = new URL(value);
    if (!/(^|\.)purina\.com$/i.test(parsed.hostname)) return "";
    if (/^\/dogs\/shop\//i.test(parsed.pathname)) return "dog";
    if (/^\/cats\/shop\//i.test(parsed.pathname)) return "cat";
  } catch {
    return "";
  }
  return "";
}

function inferPetTypeFromSourceUrl(value) {
  try {
    const parsed = new URL(value);
    const pathText = decodeURIComponent(parsed.pathname)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ");
    const dog = /\b(?:dog|dogs|puppy|puppies|canine)\b/.test(pathText);
    const cat = /\b(?:cat|cats|kitten|kittens|feline)\b/.test(pathText);
    if (dog && !cat) return "dog";
    if (cat && !dog) return "cat";
  } catch {
    return "";
  }
  return "";
}

function hasNonDogCatSpeciesEvidence(...values) {
  const text = values.map(compact).join(" ").toLowerCase();
  return /\b(parrot|parrots|cockatiel|cockatiels|parakeet|parakeets|macaw|macaws|conure|conures|cockatoo|cockatoos|finch|finches|canary|canaries|hamster|hamsters|guinea pig|guinea pigs|small animal|small animals)\b|\b(?:for birds|bird food|for rabbits|rabbit food)\b/.test(text);
}

function inferPetTypeFromProductClass(html) {
  const classText = html.match(/<div\b[^>]*itemscope[^>]*itemtype=(["'])https?:\/\/schema\.org\/Product\1[^>]*class=(["'])([^"']+)\2/i)?.[3]
    || html.match(/<div\b[^>]*class=(["'])([^"']*\btype-product\b[^"']*)\1[^>]*itemscope/i)?.[2]
    || "";
  const dog = /\bproduct_cat-(?:dog-food|dogs?|puppy|puppies)\b/i.test(classText);
  const cat = /\bproduct_cat-(?:cat-food|cats?|kitten|kittens)\b/i.test(classText);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferPetTypeFromAafcoStatement(html) {
  const text = compact(decodeEntities(stripTags(html)));
  const dog = /\bAAFCO\s+Dog\s+Food\s+Nutrient\s+Profiles\b/i.test(text);
  const cat = /\bAAFCO\s+Cat\s+Food\s+Nutrient\s+Profiles\b/i.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferJustFoodForDogsPetType(sourceUrl, ...values) {
  if (!hostMatches(sourceUrl, /(^|\.)justfoodfordogs\.com$/i)) return "";
  const text = values.map(compact).join(" ").toLowerCase();
  if (/\b(cat|cats|kitten|kittens|feline)\b/.test(text) || /\/for-cats\//i.test(sourceUrl)) return "cat";
  return "dog";
}

function inferLifeStage(...values) {
  const text = values.map(compact).join(" ").toLowerCase();
  const identityText = values.slice(0, 2).map(compact).join(" ").toLowerCase();
  if (/\bpuppy|puppies\b/.test(identityText)) return "puppy";
  if (/\bkitten|kittens\b/.test(identityText)) return "kitten";
  if (/\ball life stages\b|\bgrowth and maintenance\b|\bmaintenance and growth\b/.test(text)) return "all life stages";
  if (/\b(?:dog|dogs|cat|cats)\s+(?:and|&|or)\s+(?:puppy|puppies|kitten|kittens)\b|\b(?:puppy|puppies|kitten|kittens)\s+(?:and|&|or)\s+(?:dog|dogs|cat|cats)\b/.test(text)) {
    return "all life stages";
  }
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  return "";
}

function inferFoodForm(name) {
  const text = compact(name).toLowerCase();
  if (/\bair[- ]?dried\b/.test(text)) return "air-dried";
  if (/\bsteam[- ]?dried\b/.test(text)) return "steam-dried";
  if (/\bfreeze[- ]?dried\b/.test(text)) return "freeze-dried";
  if (/\bdehydrated\b/.test(text)) return "dehydrated";
  if (/\bfrozen\b/.test(text)) return "frozen";
  if (/\bfresh\b/.test(text)) return "fresh";
  if (/\b(?:wet|can|canned|pate|pat[eé]|stew|gravy|morsels|chunks|shreds)\b/.test(text)) return "wet";
  if (/\bdry|kibble\b/.test(text)) return "dry";
  return "";
}

function inferFoodFormFromSourceEvidence(...values) {
  let wet = false;
  let dry = false;
  for (const value of values) {
    const text = compact(value).toLowerCase();
    if (!text) continue;
    let decoded = text;
    try {
      decoded = decodeURIComponent(text);
    } catch {
      decoded = text;
    }
    if (/\/(?:dog|cat)-wet-food(?:\/|$)|\/wet-(?:dog|cat)-food(?:\/|$)|\/wet-food(?:\/|$)|wet-food-for-(?:dogs|cats)(?:\/|$)|(?:^|[\/_.-])wet(?:[\/_.-]|$)/.test(decoded)) wet = true;
    if (/\/(?:dog|cat)-dry-food(?:\/|$)|\/dry-(?:dog|cat)-food(?:\/|$)|\/dry-food(?:\/|$)|dry-food-for-(?:dogs|cats)(?:\/|$)|(?:^|[\/_.-])dry(?:[\/_.-]|$)/.test(decoded)) dry = true;
    if (/\b(?:wet|canned)\s+(?:dog|cat|pet)\s+food\b|\b(?:stew|stews|pate|morsels|cuts|shreds)\b/.test(decoded)) wet = true;
    if (/\bdry\s+(?:dog|cat|pet)\s+food\b|\bkibble\b/.test(decoded)) dry = true;
  }
  if (wet === dry) return "";
  return wet ? "wet" : "dry";
}

function normalizeProductNameForSourceEvidence(productName, {
  sourceUrl = "",
  imageUrl = "",
  sourceFoodForm = "",
} = {}) {
  let text = compact(productName).replace(/<\/?sup[^>]*>/gi, "");
  if (!text) return text;

  if (/bluebuffalo\.com\/wet-dog-food\/natural-veterinary-diet\/wm-wet-food-for-dogs\/?$/i.test(sourceUrl)) {
    return compact(text
      .replace(/\bDry\s+Dog\s+Food\s+Weight\s+Management\s+\+\s+Mobility\s+Support\b/i, "W+M Weight Management + Mobility Support Wet Dog Food")
      .replace(/\bNatural\s+Veterinary\s+Diet\s+Weight\s+Management\s+\+\s+Mobility\s+Support\s+Wet\s+Dog\s+Food\b/i, "Natural Veterinary Diet W+M Weight Management + Mobility Support Wet Dog Food"));
  }

  if (
    /wellnesspetfood\.com\/product-catalog\/wellness-complete-health-stews-[^/]+\/?$/i.test(sourceUrl)
    && !/\bstews?\b/i.test(text)
  ) {
    text = text.replace(/\bComplete Health\b/i, "Complete Health Stews");
  }

  const form = sourceFoodForm || inferFoodFormFromSourceEvidence(sourceUrl, imageUrl);
  if (form === "wet" && /\bdry\b/i.test(text) && !/\bwet\b/i.test(text)) {
    text = text.replace(/\bDry\b/g, "Wet").replace(/\bdry\b/g, "wet");
  } else if (form === "dry" && /\bwet\b/i.test(text) && !/\bdry\b/i.test(text)) {
    text = text.replace(/\bWet\b/g, "Dry").replace(/\bwet\b/g, "dry");
  }
  return compact(text);
}

function completeFoodIdentityText(...values) {
  return values.map(compact)
    .join(" ")
    .toLowerCase()
    .replace(/\/cat\/food-and-treats\/(?=(?:dry-food|wet-food|canned-food)\/)/g, "/cat/food/");
}

function hasSupplementalFeedingEvidence(...values) {
  const text = completeFoodIdentityText(...values);
  if (hasCompleteNutritionEvidence(text)) return false;
  return /\b(?:complementary food|complementary pet food|intermittent or supplemental feeding only|intermittent and supplemental feeding only|intended for intermittent|intended for supplemental|supplemental feeding only|supplemental feeding|to be fed with a complete and balanced)\b/.test(text);
}

function hasCompleteNutritionEvidence(value) {
  const text = compact(value).toLowerCase();
  const plainCompleteBalanced = /\bcomplete\s*(?:&|and)\s*balanced\b/.test(text)
    && !/\bto\s+be\s+fed\s+with\s+a\s+complete\s*(?:&|and)\s*balanced\b/.test(text);
  return /\bformulated to meet\b[\s\S]{0,220}\baafco\b/.test(text)
    || /\bcomplete\s*(?:&|and)\s*balanced\s+(?:nutrition|for\s+(?:all\s+life\s+stages|growth|maintenance)|fuel)\b/.test(text)
    || plainCompleteBalanced;
}

function hasUnavailableProductEvidence(...values) {
  const text = completeFoodIdentityText(...values);
  return /\b(?:no longer available|currently unavailable|discontinued|has been discontinued|not available)\b/.test(text);
}

function extractUnavailableProductNotice(html) {
  const body = String(html || "");
  const noticeNearTitle = body.match(/<h1\b[\s\S]{0,2600}\b(?:no longer available|currently unavailable|discontinued|has been discontinued|not available)\b/i)?.[0];
  if (!noticeNearTitle) return "";
  return compact(decodeEntities(stripTags(noticeNearTitle)));
}

function inferIsCompleteFood({
  productName = "",
  productLine = "",
  productUrl = "",
  category = "",
  feedingEvidence = "",
  availabilityEvidence = "",
} = {}) {
  const identityText = completeFoodIdentityText(
    productName,
    productLine,
    productUrl,
    category,
  );
  const hardIdentityText = completeFoodIdentityText(
    productName,
    productLine,
    productUrl,
  );
  const categoryText = completeFoodIdentityText(category);
  const hasCompleteEvidence = hasCompleteNutritionEvidence(feedingEvidence);

  if (hasUnavailableProductEvidence(productName, productLine, productUrl, category, availabilityEvidence)) return "false";
  if (hasSupplementalFeedingEvidence(feedingEvidence, availabilityEvidence)) return "false";
  if (isKnownNonCompleteSourceProduct({ productName, productLine, productUrl, category })) return "false";
  if (NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(hardIdentityText))) return "false";
  if (NON_COMPLETE_FOOD_CATEGORY_PATTERNS.some((pattern) => pattern.test(categoryText))) return "false";
  if (hasCompleteEvidence) return "true";
  if (NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identityText))) return "false";
  if (SOFT_NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(identityText))) return "false";
  return "true";
}

function isKnownNonCompleteSourceProduct({ productName = "", productLine = "", productUrl = "", category = "" } = {}) {
  const identityText = completeFoodIdentityText(
    productName,
    productLine,
    category,
    productUrl,
  );

  return (
    /wellnesspetfood\.com\/product-catalog\/(?:old-mother-hubbard|whimzees)\b/.test(identityText)
    || /\b(?:old mother hubbard|whimzees)\b/.test(identityText)
    || (/almonature\.com\/en-us\/(?:cat|dog)-products\/[A-Za-z0-9-]+/.test(identityText) && /\b(?:cat|dog) products\b/.test(identityText))
    || /annamaet\.com\/products\/(?:annamaet-recovery-chews|endure|enhance|glycocharge|impact)(?:\/|$)/.test(identityText)
    || /orijenpetfoods\.com\/en-us\/(?:dogs|cats)\/(?:dog|cat)-food\/[^ ]+\/ds-ori-fdt-[^ ]+\.html\b/.test(identityText)
    || /openfarmpet\.com\/products\/(?:new-(?:puppy|kitten)-pack|puppy-essentials-pack)(?:\/|$)/.test(identityText)
    || /ziwipets\.com\/products\/air-dried-test-flight-digital(?:\/|$)/.test(identityText)
    || /\btest flight digital\b/.test(identityText)
  );
}

function canonicalSourceBrand({ brand = "", productName = "", productUrl = "" } = {}) {
  const currentBrand = compact(brand);
  const identityText = [currentBrand, productName, productUrl].map(compact).join(" ").toLowerCase();
  const productIdentityText = [productName, productUrl].map(compact).join(" ").toLowerCase();

  if (/us\.k9felinenatural\.com\//.test(identityText) || /\bk9\s+feline\s+natural\b/.test(identityText)) {
    if (/\b(?:cat|kitten)\b|cat-food/.test(productIdentityText)) return "Feline Natural";
    if (/\b(?:dog|puppy)\b|dog-food/.test(productIdentityText)) return "K9 Natural";
  }

  if (/ziwipets\.com\//.test(identityText) || /\bziwi(?:\s+pets(?:\s+usa)?)?\b/.test(identityText)) {
    return "Ziwi Peak";
  }

  if (/hillspet\.com\//.test(identityText)) {
    if (/\/(?:cat-food|dog-food)\/prescription-diet-/.test(identityText)) return "Hill's Prescription Diet";
    if (/\/(?:cat-food|dog-food)\/science-diet-/.test(identityText)) return "Hill's Science Diet";
    if (/\bhills?\s+pet\b/.test(identityText) || /\bhill'?s\b/.test(identityText)) return "Hill's";
  }

  if (/wellnesspetfood\.com\//.test(identityText)) {
    if (/\bold mother hubbard\b|\/old-mother-hubbard/.test(identityText)) return "Old Mother Hubbard";
    if (/\bwhimzees\b|\/whimzees/.test(identityText)) return "WHIMZEES";
    if (/\bwellness\b/.test(identityText)) return "Wellness";
  }

  if (/stellaandchewys\.com\//.test(identityText) || /\bstella\s*(?:&|and)?\s*chewy'?s?(?:\s+dtc)?\b/.test(identityText)) {
    return "Stella & Chewy's";
  }

  if (/\broyal\s+canin\b/.test(identityText) || /royalcanin\.com\//.test(identityText)) {
    return "Royal Canin";
  }

  if (/\bnutro\b/.test(identityText) || /nutro\.com\//.test(identityText)) {
    return "Nutro";
  }

  if (/\bfarmina(?:\s+pet\s+foods)?\b|\bn\s*&?\s*d\b/.test(identityText) || /farmina\.com\//.test(identityText)) {
    return "Farmina";
  }

  if (/tikipets\.com\//.test(identityText) || /\btiki\s+pets\b/.test(identityText)) {
    if (/\btiki\s+dog\b|\b(?:dog|dogs|puppy|puppies)\b/.test(identityText)) return "Tiki Dog";
    if (/\btiki\s+cat\b|\b(?:cat|cats|kitten|kittens)\b/.test(identityText)) return "Tiki Cat";
    return "Tiki Pets";
  }

  return currentBrand;
}

function inferPackageSize(name) {
  const match = compact(name).match(/\b\d+(?:\.\d+)?\s?(?:lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|ct|count|pack)\b/i);
  return compact(match?.[0] || "");
}

function cleanProductName(value, brand = "") {
  const text = compact(decodeEntities(value))
    .replace(/[‘’]/g, "'")
    .replace(/\bTM\b/g, "")
    .replace(/[®™]/g, "")
    .replace(/\s*[|–-]\s*Blue Buffalo\s*$/i, "")
    .replace(/\s*[|–-]\s*Diamond Pet Foods\s*$/i, "")
    .replace(/\s*[|–-]\s*The Peak in Pet Nutrition Since 1986\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const cleanBrand = compact(brand);
  return cleanBrand ? text.replace(new RegExp(`\\s*[|–-]\\s*${cleanBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+Pet\\s+Foods?)?\\s*$`, "i"), "").trim() : text;
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
  const recipeMatch = text.match(/(?:^|,\s*)([^,]{3,80}?\b(?:recipe|formula|dinner|entree|entr[eé]e|flavor)\b)/i);
  if (recipeMatch?.[1]) return compact(recipeMatch[1]);
  const proteinMatch = text.match(/\b(chicken|beef|turkey|salmon|lamb|duck|tuna|whitefish|venison|pork|rabbit|cod|trout)(?:\s*(?:&|and|with)\s*[a-z ]{2,30})?/i);
  return compact(proteinMatch?.[0] || "");
}

function inferProductLine(name, brand) {
  const cleanName = compact(name);
  const cleanBrand = compact(brand);
  if (!cleanName || !cleanBrand) return "";
  const withoutBrand = cleanName.replace(new RegExp(`^${cleanBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  const parts = withoutBrand.split(/,|\b(?:Chicken|Beef|Turkey|Salmon|Lamb|Duck|Tuna|Whitefish|Venison|Pork|Rabbit|Cod|Trout)\b/i);
  return cleanProductName(parts[0] || "")
    .replace(/\b(?:dog|cat|puppy|kitten|food)\b/gi, "")
    .replace(/\s*[-–|]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function productNode(nodes) {
  return nodes.find((node) => typeIncludes(node, "Product"))
    || nodes.find((node) => typeIncludes(node, "ProductGroup"))
    || null;
}

function applySourceOverrides(row, sourceOverrides = {}) {
  const output = { ...row };
  for (const [field, value] of Object.entries(sourceOverrides || {})) {
    if (!SNAPSHOT_OVERRIDE_ALIASES.has(field)) continue;
    const target = SNAPSHOT_OVERRIDE_ALIASES.get(field);
    const text = compact(value);
    if (text) output[target] = text;
  }
  return output;
}

async function extractProduct(html, sourceUrl, { pageData = null, sourceOverrides = {} } = {}) {
  const nodes = extractJsonLd(html);
  const product = productNode(nodes) || {};
  const gatsbyNode = pageDataNode(pageData);
  const nextDataProduct = extractNextDataProduct(html);
  const freshpetData = freshpetProductData(nextDataProduct);
  const bundleFormulas = gatsbyNode ? await bundleFormulasFromGatsbyNode(gatsbyNode, sourceUrl) : [];
  const bundleIngredients = bundleIngredientText(bundleFormulas);
  const bundlePanel = bundleNutrientPanel(bundleFormulas);
  const text = visibleText(html);
  const petcoEvidence = extractPetcoEvidence(html, sourceUrl);
  const canonical = canonicalUrl(html, sourceUrl);
  const rawProductUrl = productPageUrl(
    purinaShopEvidenceUrl(sourceUrl, canonical),
    petcoEvidence.productUrl,
    product.url,
    absolutePurinaUrl(pathAliasFromGatsbyNode(gatsbyNode), sourceUrl),
    product.offers?.url,
    canonical,
    sourceUrl
  );
  const productUrl = absoluteUrl(rawProductUrl, sourceUrl);
  const shopifyProduct = await fetchShopifyProductData(sourceUrl, html)
    || (productUrl && productUrl !== sourceUrl ? await fetchShopifyProductData(productUrl, html) : null);
  const officialLabelIngredients = await officialLabelPdfIngredients(gatsbyNode, productUrl || sourceUrl);
  const officialPagePdf = await officialPagePdfIngredients(html, productUrl || sourceUrl);
  const rawProductName = firstText(
    petcoEvidence.productName,
    shopifyProduct?.title,
    extractBlackwoodProductName(html, sourceUrl),
    freshpetData.name,
    nextDataProduct?.name,
    gatsbyNode?.title,
    gatsbyNode?.name,
    product.name,
    metaContent(html, "og:title", "twitter:title"),
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  );
  const cliBrand = getArg("--brand");
  const pageBrand = firstText(
    petcoEvidence.brand,
    normalizeBrand(product.brand),
    normalizeBrand(shopifyProduct?.vendor),
    metaContent(html, "product:brand", "og:brand"),
    inferBrandFromUrl(productUrl || sourceUrl),
    metaContent(html, "og:site_name")
  );
  const brand = hasArg("--prefer-page-brand")
    ? firstText(pageBrand, cliBrand)
    : firstText(cliBrand, pageBrand);
  const canonicalBrand = canonicalSourceBrand({ brand, productName: rawProductName, productUrl });
  const productDescription = firstText(
    freshpetData.description,
    product.description,
    shopifyProduct?.description,
    metaContent(html, "description", "og:description", "twitter:description")
  );
  const metaEvidence = joinedText(
    metaContent(html, "og:title", "twitter:title"),
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
    metaContent(html, "description", "og:description", "twitter:description")
  );
  const justFoodForDogsAdequacyStatement = extractJustFoodForDogsAdequacyStatement(html, sourceUrl);
  const feedingEvidence = joinedText(
    additionalPropertyValue(product, "feedingGuidelines"),
    additionalPropertyValue(product, "nutritionStatement"),
    additionalPropertyValue(product, "feedingStatement"),
    additionalPropertyValue(product, "AAFCOStatement"),
    justFoodForDogsAdequacyStatement
  );
  const pageImage = extractPageImage(html, sourceUrl);
  const purinaShopImage = extractPurinaShopProductImage(html, sourceUrl);
  const diamondPetImage = extractDiamondPetFrontImage(html, sourceUrl);
  const imageUrl = petcoEvidence.imageUrl
    || purinaShopImage
    || diamondPetImage
    || pageImage
    || normalizeImage(product.image, sourceUrl)
    || extractShopifyImage(shopifyProduct, sourceUrl)
    || extractGatsbyNodeImage(gatsbyNode, sourceUrl)
    || extractFreshpetImage(freshpetData)
    || normalizeImage(metaContent(html, "og:image", "twitter:image"), sourceUrl);
  const sourceFoodForm = inferFoodFormFromSourceEvidence(
    productUrl,
    imageUrl,
    productDescription,
    metaEvidence
  );
  const productName = normalizeProductNameForSourceEvidence(cleanProductName(rawProductName, canonicalBrand), {
    sourceUrl: productUrl,
    imageUrl,
    sourceFoodForm,
  });
  const trustedNutritionIngredients = extractFormulaLabelParagraphIngredients(html)
    || extractNutritionIngredientsHeadingBlock(text);
  let ingredients = extractAlmoNatureComposition(html, sourceUrl)
    || trustedNutritionIngredients
    || firstIngredientText(
    officialLabelIngredients.ingredientText,
    officialPagePdf.ingredientText,
    petcoEvidence.ingredientStatement,
    freshpetData.allIngredients,
    extractShopifyDescriptionIngredients(shopifyProduct),
    product.ingredients,
    product.ingredientStatement,
    ingredientTextFromGatsbyNode(gatsbyNode),
    bundleIngredients,
    additionalPropertyValue(product, "ingredientsAnalysis"),
    extractFarminaIngredients(html),
    extractIngredientsJson(html),
    extractIngredientsModal(html),
    extractModalDrawerIngredients(html),
    extractOpenFarmIngredientsModal(html),
    extractJustFoodForDogsRealIngredients(html, sourceUrl),
    extractProductIngredientsList(html),
    extractProductSpecIngredients(html),
    extractIngredientItemList(html),
    extractStrongLabelIngredients(html),
    extractInlineLabeledIngredients(html),
    extractIngredientDescriptionText(html),
    extractInlineIngredientList(html),
    extractIngredientClassBlock(html),
    extractBlackwoodFullIngredientList(html, sourceUrl),
    extractDiamondPetIngredientsTabPane(html, sourceUrl),
    extractIngredientsTabPane(html),
    extractIngredientList(html),
    extractDiviTabIngredients(html),
    extractHeadingParagraphIngredientText(html),
    extractAemAccordionText(html, "Ingredients"),
    extractPetSmartEscapedIngredients(html),
    extractMarsNutritionImageIngredients(text, sourceUrl),
    extractNutritionBlockIngredients(text),
    extractIngredients(text)
  );
  ingredients = normalizeBlueBuffaloIngredientText(ingredients, productUrl || sourceUrl);
  ingredients = normalizeEarthbornIngredientText(ingredients, productUrl || sourceUrl);
  const guaranteedAnalysis = firstText(
    petcoEvidence.guaranteedAnalysis,
    extractAlmoNatureGuaranteedAnalysis(html, sourceUrl),
    bundlePanel,
    extractFreshpetGuaranteedAnalysis(freshpetData),
    product.nutrition && JSON.stringify(product.nutrition),
    normalizeAnalysisTable(additionalPropertyValue(product, "ingredientsAnalysisTable")),
    extractAnalysisTable(html),
    extractFrommGuaranteedAnalysis(html),
    extractGuaranteedAnalysisHtml(html),
    extractGuaranteedAnalysisModal(html),
    extractPetSmartEscapedGuaranteedAnalysis(html),
    extractGuaranteedAnalysis(text)
  );
  const gtin = normalizeGtin(
    extractFreshpetGtin(freshpetData) || extractShopifyGtin(shopifyProduct) || gtinFromGatsbyNode(gatsbyNode) || product.gtin14 || product.gtin13 || product.gtin12 || product.gtin8 || product.gtin || metaContent(html, "gtin", "upc", "upcUnit", "upc_unit") || product.sku
  );

  const productLine = inferProductLine(productName, canonicalBrand);
  const category = firstText(
    Array.isArray(product.category) ? product.category.join(" ") : product.category,
    shopifyProduct?.type,
    shopifyTagText(shopifyProduct)
  );
  const categoryEvidence = joinedText(category, metaEvidence);
  const shopifyAltText = shopifyMediaAltText(shopifyProduct);
  const inferredPetType = firstText(petcoEvidence.petType, freshpetData.petType)
    || inferPurinaPetTypeFromShopUrl(productUrl || sourceUrl)
    || inferPetTypeFromSourceUrl(productUrl || sourceUrl)
    || inferPetTypeFromProductClass(html)
    || inferJustFoodForDogsPetType(productUrl, productName, productUrl, productDescription, categoryEvidence)
    || inferPetType(productName, productUrl, categoryEvidence, shopifyTagText(shopifyProduct), shopifyAltText)
    || inferPetType(productName, productUrl, productDescription, categoryEvidence, shopifyTagText(shopifyProduct), shopifyAltText)
    || inferPetTypeFromAafcoStatement(html)
    || inferPetType(productName, canonicalBrand, product.category, productUrl, metaEvidence, shopifyAltText, text.slice(0, 500));
  const petType = hasNonDogCatSpeciesEvidence(productName, productLine, productUrl, categoryEvidence)
    ? ""
    : inferredPetType;

  const isCompleteFood = inferJustFoodForDogsCompleteFoodFromAdequacy(productUrl || sourceUrl, justFoodForDogsAdequacyStatement, inferIsCompleteFood({
    productName,
    productLine,
    productUrl,
    category: categoryEvidence,
    feedingEvidence: joinedText(feedingEvidence, guaranteedAnalysis, extractCompleteFoodEvidenceText(text)),
    availabilityEvidence: joinedText(productDescription, metaEvidence, extractUnavailableProductNotice(html)),
  }));

  return applySourceOverrides({
    cache_key: petcoEvidence.cacheKey,
    gtin,
    product_name: productName,
    brand: canonicalBrand,
    product_line: productLine,
    flavor: firstText(petcoEvidence.flavor, inferFlavor(productName, canonicalBrand, productLine)),
    life_stage: firstText(petcoEvidence.lifeStage, inferLifeStage(productName, productUrl, productDescription, category, shopifyTagText(shopifyProduct))),
    food_form: firstText(petcoEvidence.foodForm, sourceFoodForm, inferFoodForm(productName)),
    package_size: firstText(petcoEvidence.packageSize, extractFreshpetPackageSize(freshpetData), extractShopifyPackageSize(shopifyProduct), packageSizeFromGatsbyNode(gatsbyNode), metaContent(html, "skuSize", "sku_size"), inferPackageSize(productName)),
    pet_type: petType,
    ingredient_statement: ingredients,
    product_image_url: imageUrl,
    product_url: productUrl,
    ingredient_source_url: officialLabelIngredients.sourceUrl || officialPagePdf.sourceUrl || productUrl,
    image_source_url: productUrl,
    is_complete_food: isCompleteFood,
    guaranteed_analysis: guaranteedAnalysis,
    nutritional_info: extractFreshpetNutritionalInfo(freshpetData),
  }, sourceOverrides);
}

function missingFields(row) {
  return REQUIRED_VERIFIED_FIELDS.filter((field) => !compact(row[field]));
}

function printCsv(rows) {
  console.log(TEMPLATE_HEADERS.join(","));
  for (const row of rows) {
    console.log(TEMPLATE_HEADERS.map((header) => csvEscape(row[header])).join(","));
  }
}

function looksLikeRecoverableProductHtml(html) {
  const source = String(html || "");
  if (!/<html\b/i.test(source) || !/<body\b/i.test(source)) return false;
  if (!/\bproduct-content\b|\bproduct-tabs\b|application\/ld\+json/i.test(source)) return false;
  return /Full Ingredient List|Ingredients|Guaranteed Analysis/i.test(source);
}

function normalizedOverrideKey(key) {
  return String(key || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function snapshotTextToHtml(text) {
  return `<html><body><pre>${escapeHtml(text)}</pre></body></html>`;
}

function snapshotHtml(snapshot) {
  const html = firstText(snapshot.html, snapshot.body_html, snapshot.bodyHtml);
  const text = firstText(
    snapshot.text,
    snapshot.page_text,
    snapshot.pageText,
    snapshot.rendered_text,
    snapshot.renderedText,
    snapshot.visible_text,
    snapshot.visibleText
  );

  if (html && text) {
    return `${html}\n<section data-woof-rendered-text-snapshot="true"><pre>${escapeHtml(text)}</pre></section>`;
  }
  if (html) return html;
  return text ? snapshotTextToHtml(text) : "";
}

function snapshotSourceUrl(snapshot, fallbackUrl) {
  return firstText(
    snapshot.source_url,
    snapshot.sourceUrl,
    snapshot.product_url,
    snapshot.productUrl,
    snapshot.url,
    fallbackUrl
  );
}

function snapshotOverrides(snapshot) {
  const output = {};
  for (const [key, value] of Object.entries(snapshot || {})) {
    const normalizedKey = normalizedOverrideKey(key);
    const target = SNAPSHOT_OVERRIDE_ALIASES.get(normalizedKey);
    if (!target) continue;
    const text = compact(value);
    if (text) output[target] = text;
  }
  return output;
}

function parseSnapshotSource(source, raw, fallbackSourceUrl) {
  if (!/\.json(?:l|ndjson)?$/i.test(source)) return null;

  let snapshot = null;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return null;
  const html = snapshotHtml(snapshot);
  const sourceUrl = snapshotSourceUrl(snapshot, fallbackSourceUrl);
  if (!html || !sourceUrl) return null;

  return {
    html,
    sourceUrl,
    pageData: null,
    sourceOverrides: snapshotOverrides(snapshot),
  };
}

async function readSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await safeFetchText(source, {
      userAgent: "WoofCatalogVerifier/1.0 (source-evidence extraction)",
      accept: "text/html,application/xhtml+xml",
      cacheDir: rawCacheDir("pages"),
      returnErrorBody: true,
    });
    const html = response.body;
    if (response.status >= 400 && !looksLikeRecoverableProductHtml(html)) {
      throw new Error(`${source}: HTTP ${response.status}`);
    }
    const sourceUrl = response.finalUrl || source;
    return {
      html,
      sourceUrl,
      pageData: await fetchPageDataFor(sourceUrl),
      sourceOverrides: {},
    };
  }

  const raw = fs.readFileSync(source, "utf8");
  const sourceUrl = getArg("--source-url") || `file://${path.resolve(source)}`;
  const snapshot = parseSnapshotSource(source, raw, sourceUrl);
  if (snapshot) return snapshot;
  return { html: raw, sourceUrl, pageData: null, sourceOverrides: {} };
}

async function main() {
  const sources = [
    ...getArgs("--url"),
    ...getArgs("--html"),
  ];
  const file = getArg("--file");
  const json = hasArg("--json");
  const strict = hasArg("--strict");
  const continueOnError = hasArg("--continue-on-error");
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), 0);

  if (file) {
    const rows = fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map(compact)
      .filter(Boolean);
    sources.push(...rows);
  }

  if (sources.length === 0) {
    throw new Error("Usage: node scripts/catalog-page-feed-extract.mjs --url https://... or --html product-page.html");
  }

  const rows = [];
  const warnings = [];

  for (const [index, source] of sources.entries()) {
    try {
      if (index > 0) await sleep(fetchDelayMs);
      const { html, sourceUrl, pageData, sourceOverrides } = await readSource(source);
      const row = await extractProduct(html, sourceUrl, { pageData, sourceOverrides });
      const missing = missingFields(row);
      if (missing.length > 0) {
        warnings.push(`${source}: missing ${missing.join(", ")}`);
      }
      rows.push(row);
    } catch (error) {
      if (!continueOnError) throw error;
      warnings.push(`${source}: ${error.message || error}`);
    }
  }

  if (json) {
    console.log(JSON.stringify({ rows, warnings }, null, 2));
  } else {
    printCsv(rows);
    for (const warning of warnings) console.error(`Warning: ${warning}`);
  }

  if (strict && warnings.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
