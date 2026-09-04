import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { splitIngredientStatement } from "../services/catalogIngredients.js";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import {
  acquisitionQueueOptions,
  printAcquisitionQueueUpdate,
  updateCatalogAcquisitionQueue,
} from "./catalog-acquisition-queue-utils.mjs";
import {
  normalizeScraperCandidate,
  validateScraperCandidate,
} from "./catalog-scraper-contract.mjs";

const DEFAULT_SOURCE = "official_feed";
const DEFAULT_BATCH_SIZE = 500;
const requireOptional = createRequire(import.meta.url);
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;
const HEADER_ALIASES = new Map([
  ["additional_product_identification", "gtin"],
  ["barcode", "barcode"],
  ["brand", "brand"],
  ["brand_name", "brand"],
  ["brand_owner_name", "manufacturer"],
  ["brandname", "brand"],
  ["cache_key", "cacheKey"],
  ["catalog_number", "code"],
  ["catalog_product_url", "sourceUrl"],
  ["category_path", "category"],
  ["code", "barcode"],
  ["complete_and_balanced", "isCompleteFood"],
  ["complete_food", "isCompleteFood"],
  ["consumer_facing_product_name", "productName"],
  ["consumer_unit_size", "packageSize"],
  ["data_provider_url", "sourceUrl"],
  ["description", "productName"],
  ["ean", "barcode"],
  ["ean_upc", "barcode"],
  ["expires_at", "expiresAt"],
  ["expiresat", "expiresAt"],
  ["flavor_name", "flavor"],
  ["gtin", "gtin"],
  ["gtin_12", "gtin"],
  ["gtin_13", "gtin"],
  ["gtin_14", "gtin"],
  ["guaranteed_analysis", "nutrientPanel"],
  ["guaranteed_analysis_statement", "nutrientPanel"],
  ["gdsn_publication_date", "verifiedAt"],
  ["global_trade_item_number", "gtin"],
  ["gpc_category", "category"],
  ["hero_image_url", "imageUrl"],
  ["image", "imageUrl"],
  ["image_front_url", "imageUrl"],
  ["image_source", "imageSourceUrl"],
  ["image_verification_status", "imageVerificationStatus"],
  ["image_url", "imageUrl"],
  ["image_url_front", "imageUrl"],
  ["information_provider_product_url", "sourceUrl"],
  ["ingredient_declaration", "ingredientText"],
  ["ingredient_evidence_url", "ingredientSourceUrl"],
  ["ingredient_list", "ingredientText"],
  ["ingredient_statement", "ingredientText"],
  ["ingredient_statement_en", "ingredientText"],
  ["ingredient_verification_status", "ingredientVerificationStatus"],
  ["ingredient_text", "ingredientText"],
  ["ingredient_text_en", "ingredientText"],
  ["ingredients", "ingredientsText"],
  ["ingredients_list", "ingredientText"],
  ["ingredients_statement", "ingredientText"],
  ["ingredients_text", "ingredientsText"],
  ["is_complete_and_balanced", "isCompleteFood"],
  ["is_complete_food", "isCompleteFood"],
  ["item_name", "productName"],
  ["item_description", "productName"],
  ["last_changed_date", "verifiedAt"],
  ["last_verified_at", "verifiedAt"],
  ["last_verified_date", "verifiedAt"],
  ["manufacturer", "manufacturer"],
  ["main_image_url", "imageUrl"],
  ["name", "name"],
  ["net_content", "packageSize"],
  ["net_contents", "packageSize"],
  ["nutrient_panel", "nutrientPanel"],
  ["nutriments", "nutriments"],
  ["nutrition_facts", "nutrientPanel"],
  ["nutritional_analysis", "nutrientPanel"],
  ["official_url", "sourceUrl"],
  ["flavor", "flavor"],
  ["flavour", "flavor"],
  ["packshot_url", "imageUrl"],
  ["front_image_url", "imageUrl"],
  ["front_image_source_url", "imageSourceUrl"],
  ["front_of_pack_image_url", "imageUrl"],
  ["front_package_image_url", "imageUrl"],
  ["food_form", "foodForm"],
  ["functional_name", "productName"],
  ["form", "foodForm"],
  ["format", "foodForm"],
  ["content_hash", "contentHash"],
  ["extractor_version", "extractorVersion"],
  ["image_source_url", "imageSourceUrl"],
  ["ingredient_source_url", "ingredientSourceUrl"],
  ["life_stage", "lifeStage"],
  ["life_stage_description", "lifeStage"],
  ["lifestage", "lifeStage"],
  ["line", "productLine"],
  ["modified_date", "verifiedAt"],
  ["net_weight", "packageSize"],
  ["package_size", "packageSize"],
  ["package_weight", "packageSize"],
  ["pack_size", "packageSize"],
  ["pdp_url", "sourceUrl"],
  ["pet_food_form", "foodForm"],
  ["pet_species", "petType"],
  ["pet_type", "petType"],
  ["primary_image_url", "imageUrl"],
  ["product_category", "category"],
  ["product_description", "productName"],
  ["product_form", "foodForm"],
  ["product_gtin", "gtin"],
  ["product_image_url", "imageUrl"],
  ["product_image", "imageUrl"],
  ["product_information_url", "sourceUrl"],
  ["product_line", "productLine"],
  ["product_line_name", "productLine"],
  ["product_name", "productName"],
  ["product_page_url", "sourceUrl"],
  ["product_url", "sourceUrl"],
  ["product_variant", "flavor"],
  ["raw_source_hash", "rawSourceHash"],
  ["recipe", "flavor"],
  ["size", "packageSize"],
  ["source", "source"],
  ["source_product_url", "sourceUrl"],
  ["source_quality", "sourceQuality"],
  ["source_url", "sourceUrl"],
  ["species", "petType"],
  ["sub_brand", "productLine"],
  ["subbrand", "productLine"],
  ["target_life_stage", "lifeStage"],
  ["target_species", "petType"],
  ["taxonomy", "category"],
  ["trade_item_description", "productName"],
  ["trade_item_gtin", "gtin"],
  ["upc", "barcode"],
  ["upc_code", "barcode"],
  ["url", "sourceUrl"],
  ["variant", "productLine"],
  ["variant_description", "flavor"],
  ["verification_evidence_url", "sourceUrl"],
  ["verification_url", "sourceUrl"],
  ["verified_at", "verifiedAt"],
]);
const SOURCE_QUALITIES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "retailer",
  "community",
  "user_ocr",
  "ai_ocr",
  "scraped",
  "unknown",
]);
const INGREDIENT_VERIFICATION_STATUSES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
  "community",
  "ai_extracted",
  "unverified",
]);
const IMAGE_VERIFICATION_STATUSES = new Set([
  "official",
  "manufacturer",
  "retailer_verified",
  "community",
  "scan_preview",
  "unverified",
]);
const COMPLETE_FOOD_NUTRIENT_MARKER_REGEX = /\b(taurine|vitamin|zinc|ferrous|iron\s+sulfate|manganese|copper|potassium\s+iodide|calcium\s+iodate|choline\s+chloride|biotin|folic\s+acid|riboflavin|niacin|thiamine|pyridoxine|menadione)\b/i;
const ANALYSIS_COPY_IN_INGREDIENTS_REGEX = /\b(?:crude protein|crude fat|crude fiber|moisture|ash|guaranteed analysis|calorie content|metabolizable energy|find a store|where to buy)\b|(?:^|\s)(?:max\.?|min\.?)\s*(?:\)|:|\d|%)/i;
const RECIPE_PROTEIN_TERMS = new Set([
  "beef",
  "bison",
  "chicken",
  "cod",
  "duck",
  "fish",
  "lamb",
  "mackerel",
  "pollock",
  "pork",
  "rabbit",
  "salmon",
  "sardine",
  "shrimp",
  "sole",
  "trout",
  "tuna",
  "turkey",
  "venison",
  "whitefish",
]);
const FISH_PROTEIN_TERMS = new Set([
  "cod",
  "fish",
  "herring",
  "mackerel",
  "pollock",
  "salmon",
  "sardine",
  "shrimp",
  "sole",
  "trout",
  "tuna",
  "whitefish",
]);

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) values.push(value);
  }
  return values;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function positiveInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function safeFileSegment(value, fallback = "feed") {
  const segment = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return segment || fallback;
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
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
    /\b[0-9][a-z]{1,20}\b/i.test(text)
    || /\b[A-Za-z]{2,}[0-9][A-Za-z]+\b/.test(text)
    || /\(\s*\)/.test(text)
    || /(^|[^A-Za-z])-\s*Ascorbyl-2-Polyphosphate\b/i.test(text)
    || /\bSupplement\.\s+preserved\s+with\b/i.test(text)
    || /\bI(?:Vitamin|min|max|preservative|Ferrous)\b/i.test(text)
    || /\b(?:Fructooli[0-9]osaccharides|Manganese[0-9]e|preserNative|subtillis|cooper\s+sulfate|sufate|sultate|ch[io]ride|calcium\s+lodate|lodate|pyridoxine\s+vitamin\s+b-?6|niain|nacin|nutri\*nt|r[0-9]cogniz[0-9]d|[0-9]ssential|potss+sium|vitss?min|d\.calcium)\b/i.test(text)
    || /\bMi\s+nerals\b/i.test(text)
  );
}

function hasCurlyIngredientGroup(value) {
  return /[{}]/.test(compact(value));
}

function hasOnlyAllowedCurlyIngredientGroups(value) {
  const text = compact(value);
  if (!hasCurlyIngredientGroup(text)) return true;
  const openCount = (text.match(/\{/g) || []).length;
  const closeCount = (text.match(/\}/g) || []).length;
  if (openCount !== closeCount) return false;
  const withoutAllowedGroups = text.replace(/(^|,\s*)(Vitamins?|Minerals?)\s*\{[^{}]+\}/gi, "");
  return !hasCurlyIngredientGroup(withoutAllowedGroups);
}

function allowsCurlyIngredientGroups({ ingredientText, sourceQuality, ingredientVerificationStatus }) {
  return (
    compact(sourceQuality).toLowerCase() === "manufacturer"
    && compact(ingredientVerificationStatus).toLowerCase() === "manufacturer"
    && hasOnlyAllowedCurlyIngredientGroups(ingredientText)
  );
}

function decodeCommonHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#34;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, "\"")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanIngredientStatement(value) {
  let text = compact(decodeCommonHtmlEntities(value));
  if (!text) return "";

  text = text.replace(/<[^>]+>/g, " ");
  text = compact(text);

  // Handles pasted rich-text fragments such as id="isPasted"> that some Shopify pages expose.
  for (let index = 0; index < 3; index += 1) {
    const next = compact(text
      .replace(/^(?:"|')?\s*(?:[a-z][\w:-]*=(?:"[^"]*"|'[^']*'|[^\s>]+)\s*)+>+\s*/i, "")
      .replace(/^["'\s>]+(?=[A-Za-z0-9])/g, ""));
    if (next === text) break;
    text = next;
  }

  return compact(text)
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/([(])\s+/g, "$1");
}

function normalizeText(value) {
  return compact(value)
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedIdentityText(...values) {
  return normalizeText(values.map(compact).join(" "))
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function skipDetailFor(row = {}, reason = "unknown") {
  return {
    reason,
    product_name: compact(row.productName || row.product_name || row.name),
    brand: compact(row.brand || row.brands || row.manufacturer),
    source_url: compact(row.sourceUrl || row.source_url || row.url),
    cache_key: compact(row.cacheKey || row.cache_key),
  };
}

function expectedBrandConfig({ getArgs: readArgs, hasArg: readHasArg }) {
  const terms = uniqueValues([
    ...readArgs("--expected-brand"),
    ...readArgs("--expected-brand-alias"),
  ].flatMap((value) => String(value).split(",")));

  return {
    terms,
    keys: new Set(terms.map(normalizeText).filter(Boolean)),
    allowMismatch: readHasArg("--allow-source-brand-mismatch"),
  };
}

function sourceUrlPatternConfig(patternText) {
  const text = compact(patternText);
  if (!text) return null;

  try {
    return new RegExp(text, "i");
  } catch (error) {
    throw new Error(`Invalid --required-source-url-pattern: ${error.message}`);
  }
}

function startsWithBrandTerm(value, brandKey) {
  const text = normalizeText(value);
  return text === brandKey || text.startsWith(`${brandKey} `);
}

function sourceBrandMatches({ brand, productName }, expectedBrandKeys) {
  if (!expectedBrandKeys?.size) return true;

  const brandKey = normalizeText(brand);
  if (brandKey && expectedBrandKeys.has(brandKey)) return true;

  return [...expectedBrandKeys].some((expectedBrandKey) => startsWithBrandTerm(productName, expectedBrandKey));
}

function normalizeGtin(value) {
  return compact(value).replace(/[^0-9]/g, "");
}

function sourceUrlIdentitySegment(value) {
  try {
    const pathSegments = decodeURIComponent(new URL(compact(value)).pathname)
      .split("/")
      .map(compact)
      .filter(Boolean);
    return pathSegments.slice(-2).join(" ");
  } catch {
    return "";
  }
}

function duplicatedGtinsByIdentity(rows = []) {
  const identitiesByGtin = new Map();

  for (const row of rows) {
    const gtin = normalizeGtin(row.gtin || row.barcode || row.upc || row.ean || row.code);
    if (!gtin) continue;

    const productName = compact(row.productName || row.product_name || row.name);
    const sourceUrl = compact(row.sourceUrl || row.source_url || row.url || row.product_url);
    const feedSource = compact(row.source) || "";
    const brand = canonicalSourceBrand({
      brand: row.brand || row.brands || row.manufacturer,
      productName,
      sourceUrl,
      source: feedSource,
    });
    const identity = normalizedIdentityText(
      productName,
      brand,
      row.productLine || row.product_line || row.line,
      row.flavor || row.flavour || row.recipe,
      row.packageSize || row.package_size || row.pack_size || row.size || row.net_weight,
      row.petType || row.pet_type || row.species,
      row.ingredientText || row.ingredient_text || row.ingredientsText || row.ingredients_text,
      Array.isArray(row.ingredients) ? row.ingredients.join(", ") : "",
      row.imageUrl || row.image_url || row.frontImageUrl || row.front_image_url || row.product_image_url || row.image
    );

    if (!identity) continue;
    if (!identitiesByGtin.has(gtin)) identitiesByGtin.set(gtin, new Set());
    identitiesByGtin.get(gtin).add(identity);
  }

  return new Set(
    [...identitiesByGtin.entries()]
      .filter(([, identities]) => identities.size > 1)
      .map(([gtin]) => gtin)
  );
}

function normalizePetType(value, row = {}) {
  const explicit = compact(value).toLowerCase();
  if (explicit === "dog" || explicit === "cat") return explicit;

  const text = normalizeText([
    row.productName,
    row.product_name,
    row.name,
    row.brand,
    row.category,
    row.categories,
  ].map(compact).join(" "));

  const dog = /\b(dog|puppy|canine)\b/.test(text);
  const cat = /\b(cat|kitten|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "unknown";
}

function normalizeLifeStage(value, row = {}) {
  const explicit = compact(value).toLowerCase();
  if (["puppy", "kitten", "senior", "adult", "all life stages"].includes(explicit)) return explicit;

  const text = normalizeText([
    row.productName,
    row.product_name,
    row.name,
    row.productLine,
    row.product_line,
    row.category,
    row.categories,
    row.productUrl,
    row.product_url,
    row.sourceUrl,
    row.source_url,
    row.url,
  ].map(compact).join(" "));

  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  if (/\ball life stages\b/.test(text)) return "all life stages";
  return "";
}

function ingredientsFrom(row = {}) {
  if (Array.isArray(row.ingredients)) {
    return row.ingredients
      .map((ingredient) => cleanIngredientStatement(
        typeof ingredient === "string"
          ? ingredient
          : ingredient?.text || ingredient?.name || ingredient?.id
      ))
      .filter(Boolean);
  }

  const text = cleanIngredientStatement(row.ingredientText || row.ingredient_text || row.ingredientsText || row.ingredients_text);
  if (!text) return [];
  return splitIngredientStatement(text);
}

function hasContaminatedIngredientText(ingredients) {
  const text = compact(ingredients.join(", "));
  return (
    /(?:\.\.\.|…)/.test(text)
    || ANALYSIS_COPY_IN_INGREDIENTS_REGEX.test(text)
    || /\b(?:what's inside|where to buy|nutritional facts|nutritional info|nutritional information|nutrients to support|premium-quality|premium quality|zinpro|propath|no corn,\s*wheat,\s*soy|artificial flavors or colors|made without|guaranteed levels|the only kibble|one animal protein|one vegetable|food sensitivities|natural omegas|immune health|digestive health|healthy skin\s*&\s*coat|skin barrier|paw pad repair|vegetables,\s*fruits and other wholesome ingredients|see\s+more|tell\s+lt\s+all\s+ingredients)\b/i.test(text)
  );
}

function hasCoreFoodSignal(productName) {
  return (
    /(^| )(food|foods|dry|wet|kibble|pate|pat|mousse|entrees?|stews?|loaf|canned|cans?|formula|recipe|meal|dinner|raw|fresh|freezedried|freeze dried|airdried|air dried|dehydrated|pupp(y|ies)|kitten|kittens|adult|senior|complete|balanced)( |$)/.test(productName)
    || /(^| )all life stages( |$)/.test(productName)
  );
}

function isKnownNonDogCatPetProduct({
  productName = "",
  productLine = "",
  sourceUrl = "",
  category = "",
  petType = "",
} = {}) {
  const identityText = normalizedIdentityText(productName, productLine, sourceUrl, category);
  const nonDogCatSpecies = /(^| )(parrot|parrots|cockatiel|cockatiels|parakeet|parakeets|macaw|macaws|conure|conures|cockatoo|cockatoos|finch|finches|canary|canaries|hamster|hamsters|guinea pig|guinea pigs)( |$)/.test(identityText)
    || /(^| )(?:for birds|bird food|for rabbits|rabbit food|small animal|small animals)( |$)/.test(identityText);
  if (nonDogCatSpecies) return true;
  return !["dog", "cat"].includes(compact(petType).toLowerCase()) && /(^| )(small animal|small animals)( |$)/.test(identityText);
}

function isLikelyNonProductCatalogRow(productNameValue, brandValue, sourceUrlValue = "", productLineValue = "") {
  const productName = normalizeText(productNameValue);
  const identityText = normalizedIdentityText(productNameValue, productLineValue, sourceUrlValue);
  const brand = normalizeText(brandValue);
  const coreFoodSignal = hasCoreFoodSignal(productName) || hasCoreFoodSignal(identityText);
  const nonProductTermRe = /(^| )(treats?|treaties?|jerky|biscuits?|cookies?|chews?|chewies|sticks?|chips?|cheek rolls?|beef cheek|antlers?|snacks?|toppers?|topping|mixers?|kibble sauces?|purees?|supplements?|catnip|litter|lickables?|delectables|rawhide|bully sticks?|pizzle|pill pockets?|munchy|dumbbells?)( |$)/;
  const accessoryTermRe = /(^| )(toys?(?! breed)|plush|plushie|squeaky|squeaker|tennis balls?|toy balls?|balls? (?:toy|toys|launcher|set|for)|tug|rope|cleaners?|stain|odor|odour|housebreaking aid|wipes?|frontline|flea|tick|grooming|shampoo|feeders?)( |$)/;
  const storageMerchTermRe = /(^| )(shirts?|t[- ]shirts?|bandanas?|coolers?|gift cards?|containers?|patches?|stickers?|merch|apparel)( |$)/;
  const bowlAccessoryRe = /(^| )(dog|cat|pet|food|water|feeding|feeder|slow feeder|stainless|stainless steel|ceramic|elevated|collapsible|travel|non skid|anti gulp|replacement|double) bowls?( |$)|(^| )bowls? (for|stand|mat|set|holder|insert|replacement)( |$)/;
  const nonSingleFormulaRe = /(^| )(variety|varieties|variety packs?|bundles?|samplers?|samples?|sample packs?|starter packs?|starter kits?|multipacks?|multi packs?|(?:new )?(?:puppy|kitten) packs?|(?:puppy|kitten) essentials packs?|essentials packs?)( |$)/;
  const singleFormulaCountCase = (
    /(^| )[0-9]+[ ]*(ct|count)( |$)/.test(productName)
    && coreFoodSignal
    && !nonSingleFormulaRe.test(productName)
    && !nonSingleFormulaRe.test(identityText)
    && /(^| )(care|nutrition|mousse|sauce|wet|dry|adult|kitten|puppy|senior|formula|recipe|diet|food|foods)( |$)/.test(identityText)
  );
  const ambiguousCountPack = (
    /(^| )[0-9]+[ ]*(ct|count)( |$)/.test(productName)
    && !/(^| )(chicken|beef|steak|turkey|salmon|lamb|duck|tuna|whitefish|venison|pork|rabbit|cod|trout|bison|filet|mignon|prime rib|bacon|cheese|rice|vegetable|veggie|noodle)( |$)/.test(productName)
    && !singleFormulaCountCase
  );
  const brothNonProduct = (
    (
      /(^| )(bone broth|broth toppers?|broth topping|broth mixers?|broth supplements?)( |$)/.test(productName)
      && !coreFoodSignal
    )
    || (
      /(^| )broths?( |$)/.test(productName)
      && !coreFoodSignal
    )
  );

  return (
    /^ingredients? (amp |and )?nutritional value$/.test(productName)
    || /^ingredients? guide( ingredients? guide)?( |$)/.test(productName)
    || /^(cat|dog) products?$/.test(productName)
    || /(^| )(dog|cat|pet) (food|treat) trends?( |$)/.test(productName)
    || (
      /(^| )trends?( |$)/.test(productName)
      && /(^| )the rise of( |$)/.test(productName)
    )
    || nonProductTermRe.test(productName)
    || storageMerchTermRe.test(identityText)
    || (accessoryTermRe.test(identityText) && !coreFoodSignal)
    || (bowlAccessoryRe.test(identityText) && !/(^| )(poke|farm) bowl( |$)/.test(identityText))
    || nonSingleFormulaRe.test(productName)
    || nonSingleFormulaRe.test(identityText)
    || ambiguousCountPack
    || /(^| )blue bits( |$)/.test(productName)
    || brothNonProduct
    || /(^| )(nutri cal|nutrical|nutritional gel|high calorie gel|highcalorie gel)( |$)/.test(productName)
    || /(dog|cat)treats?/.test(productName)
    || (
      /(^| )(training|sausage|sausages)( |$)/.test(productName)
      && !coreFoodSignal
    )
    || (
      /(^| )(treats?|chews?|snacks?|rawhide)( |$)/.test(brand)
      && !coreFoodSignal
    )
    || (
      Boolean(brand)
      && (productName === brand || productName === `${brand} ${brand}`)
    )
    || (
      ["ingredients guide", "dog treat"].includes(brand)
      && (
        /^ingredients? guide( ingredients? guide)?( |$)/.test(productName)
        || /(^| )(dog|cat|pet) (food|treat) trends?( |$)/.test(productName)
        || nonProductTermRe.test(productName)
        || brothNonProduct
        || /(dog|cat)treats?/.test(productName)
      )
    )
  );
}

function parseBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = compact(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "y", "complete", "complete_food"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "treat", "supplement", "complementary"].includes(normalized)) return false;
  return fallback;
}

function isKnownNonCompleteSourceProduct({ productName = "", productLine = "", sourceUrl = "", source = "" } = {}) {
  const identityText = normalizedIdentityText(productName, productLine, sourceUrl, source);
  const completeDietOverride = /(^| )(complete diet|complete and balanced|complete food|complete meal)( |$)/.test(identityText);
  const baseMixNonComplete = (
    /(^| )(base mix|base mixes|pre mix|pre mixes|premix|premixes)( |$)/.test(identityText)
    && !completeDietOverride
  );

  return (
    baseMixNonComplete
    || /(^| )kibble sauces?( |$)/.test(identityText)
    || /(^| )k9 mobility ultra( |$)/.test(identityText)
    || /(^| )starter packs?( |$)/.test(identityText)
    || /(^| )(?:new )?(?:puppy|kitten) packs?( |$)/.test(identityText)
    || /(^| )(?:puppy|kitten )?essentials packs?( |$)/.test(identityText)
    || /\borijenpetfoods com\b[\s\S]*\bds ori fdt\b/.test(identityText)
    || /(^| )wellnesspetfood com product catalog (old mother hubbard|whimzees)( |$)/.test(identityText)
    || /(^| )(old mother hubbard|whimzees)( |$)/.test(identityText)
    || (source === "grandma-lucy-s" && /(^| )(sample|organic|singles?|top it|pumpkin pouch|pre mix|pre-mix|simple replacement)( |$)/.test(identityText))
  );
}

function proteinTokenSet(value) {
  const proteins = new Set();
  for (const token of normalizedIdentityText(value).split(" ")) {
    if (RECIPE_PROTEIN_TERMS.has(token)) proteins.add(token);
  }
  return proteins;
}

function ingredientRecipePrefix(value) {
  const match = compact(value).match(/^\s*([^:]{1,120}?\brecipe)\s*:/i);
  return match ? match[1] : "";
}

function ingredientLeadProteinSet(value) {
  const withoutRecipePrefix = compact(value).replace(/^\s*[^:]{1,120}?\brecipe\s*:\s*/i, "");
  return proteinTokenSet(withoutRecipePrefix.split(/[,;]+/).slice(0, 3).join(" "));
}

function nutrientPanelRecipeLabel(value) {
  const match = compact(value).match(/\b([a-z][a-z\s&,+-]{0,80}?\brecipe)\b/i);
  return match ? match[1] : "";
}

function hasNoProteinOverlap(left, right) {
  if (left.size === 0 || right.size === 0) return false;
  if (
    (left.has("fish") && [...right].some((protein) => FISH_PROTEIN_TERMS.has(protein)))
    || (right.has("fish") && [...left].some((protein) => FISH_PROTEIN_TERMS.has(protein)))
  ) {
    return false;
  }
  for (const protein of left) {
    if (right.has(protein)) return false;
  }
  return true;
}

function hasVariantIngredientMismatch({
  productName = "",
  productLine = "",
  flavor = "",
  packageSize = "",
  ingredientText = "",
} = {}) {
  const ingredientPrefixProteins = proteinTokenSet(ingredientRecipePrefix(ingredientText));

  const explicitVariantProteins = proteinTokenSet([flavor, packageSize].map(compact).join(" "));
  const fallbackIdentityProteins = proteinTokenSet([productName, productLine].map(compact).join(" "));
  const declaredProteins = explicitVariantProteins.size > 0
    ? explicitVariantProteins
    : fallbackIdentityProteins;

  if (hasNoProteinOverlap(declaredProteins, ingredientPrefixProteins)) return true;

  const packageSizeProteins = proteinTokenSet(packageSize);
  const leadIngredientProteins = ingredientLeadProteinSet(ingredientText);
  return hasNoProteinOverlap(packageSizeProteins, leadIngredientProteins);
}

function hasVariantNutrientMismatch({
  productName = "",
  productLine = "",
  flavor = "",
  packageSize = "",
  nutrientPanel = "",
} = {}) {
  const nutrientRecipeProteins = proteinTokenSet(nutrientPanelRecipeLabel(nutrientPanel));
  if (nutrientRecipeProteins.size === 0) return false;

  const explicitVariantProteins = proteinTokenSet([flavor, packageSize].map(compact).join(" "));
  const fallbackIdentityProteins = proteinTokenSet([productName, productLine].map(compact).join(" "));
  const declaredProteins = explicitVariantProteins.size > 0
    ? explicitVariantProteins
    : fallbackIdentityProteins;

  return hasNoProteinOverlap(declaredProteins, nutrientRecipeProteins);
}

function hasVariantSourceUrlMismatch({
  productName = "",
  productLine = "",
  flavor = "",
  sourceUrl = "",
} = {}) {
  const sourceUrlProteins = proteinTokenSet(sourceUrl);
  if (sourceUrlProteins.size === 0) return false;

  const declaredProteins = proteinTokenSet([productName, productLine, flavor].map(compact).join(" "));
  return hasNoProteinOverlap(declaredProteins, sourceUrlProteins);
}

function hasInvalidPackageSize(value) {
  const text = normalizedIdentityText(value);
  return /(^| )(unit upc|per ellen|unknown size|unknown package|n a)( |$)/.test(text);
}

function canonicalSourceBrand({ brand = "", productName = "", sourceUrl = "", source = "" } = {}) {
  const currentBrand = compact(brand);
  const identityText = normalizeText([currentBrand, productName, sourceUrl, source].map(compact).join(" "));
  const productIdentityText = normalizeText([productName, sourceUrl].map(compact).join(" "));

  if (source === "k9-natural" || /(^| )us k9felinenatural com( |$)/.test(identityText) || /(^| )k9 feline natural( |$)/.test(identityText)) {
    if (/(^| )(cat|kitten|cat food)( |$)/.test(productIdentityText)) return "Feline Natural";
    if (/(^| )(dog|puppy|dog food)( |$)/.test(productIdentityText)) return "K9 Natural";
  }

  if (/(^| )hillspet com( |$)/.test(identityText) || source === "hill-s-pet-nutrition") {
    if (/(^| )(cat[- ]food|dog[- ]food) prescription[- ]diet(?:[ -]|$)/.test(identityText)) return "Hill's Prescription Diet";
    if (/(^| )(cat[- ]food|dog[- ]food) science[- ]diet(?:[ -]|$)/.test(identityText)) return "Hill's Science Diet";
    if (/(^| )hills? pet( |$)/.test(identityText) || /(^| )hills?( |$)/.test(identityText)) return "Hill's";
  }

  if (/(^| )wellnesspetfood com( |$)/.test(identityText) || source === "wellness-pet-company") {
    if (/(^| )old mother hubbard( |$)/.test(identityText)) return "Old Mother Hubbard";
    if (/(^| )whimzees( |$)/.test(identityText)) return "WHIMZEES";
    if (/(^| )wellness( |$)/.test(identityText)) return "Wellness";
  }

  if (/(^| )stellaandchewys com( |$)/.test(identityText) || source === "stella-and-chewys" || /(^| )stella (?:and |)chewy s(?: dtc)?( |$)/.test(identityText)) {
    return "Stella & Chewy's";
  }

  if (/(^| )royal canin( |$)/.test(identityText) || source === "royal-canin-mars-petcare") {
    return "Royal Canin";
  }

  if (/(^| )nutro( |$)/.test(identityText) || source === "nutro") {
    return "Nutro";
  }

  if (/(^| )farmina(?: pet foods)?( |$)/.test(identityText) || /(^| )n d( |$)/.test(identityText) || source === "farmina-pet-foods") {
    return "Farmina";
  }

  if (/(^| )tikipets com( |$)/.test(identityText) || source === "tiki-pets") {
    if (/(^| )tiki dog( |$)/.test(identityText) || /(^| )(dog|dogs|puppy|puppies)( |$)/.test(identityText)) return "Tiki Dog";
    if (/(^| )tiki cat( |$)/.test(identityText) || /(^| )(cat|cats|kitten|kittens)( |$)/.test(identityText)) return "Tiki Cat";
    if (currentBrand === "TIKI PETS") return "Tiki Pets";
  }

  return currentBrand;
}

function cacheBrandFor({ brand = "", source = "" } = {}) {
  if (source === "k9-natural" && /^feline natural$/i.test(compact(brand))) {
    return "K9 Natural";
  }
  return compact(brand);
}

function cachePackageSizeFor({ packageSize = "", brand = "", source = "" } = {}) {
  if (source === "k9-natural" && /^feline natural$/i.test(compact(brand))) {
    return "";
  }
  return compact(packageSize);
}

function parseMaybeJson(value) {
  if (!value || typeof value !== "string") return value || null;
  const text = compact(value);
  if (!text || !/^[{[]/.test(text)) return text || null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function evidenceValueText(value) {
  if (!value) return "";
  if (typeof value === "string") return compact(value);
  try {
    return compact(JSON.stringify(value));
  } catch {
    return compact(value);
  }
}

function joinedEvidenceText(...values) {
  return compact(values.map(evidenceValueText).filter(Boolean).join(" "));
}

function isOfficialFreshpetProductUrl(value) {
  try {
    const url = new URL(compact(value));
    return /(^|\.)freshpet\.com$/i.test(url.hostname)
      && /^\/products\/[A-Za-z0-9-]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function officialLotusRawFoodPetType(value) {
  try {
    const url = new URL(compact(value));
    if (!/(^|\.)lotuspetfoods\.com$/i.test(url.hostname)) return "";
    const match = url.pathname.match(/^\/product-view\/(cat|dog)\/raw-food\/[A-Za-z0-9-]+\/?$/i);
    return match?.[1]?.toLowerCase() || "";
  } catch {
    return "";
  }
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

function hasTrustedFreshpetShortIngredientEvidence(ingredients, row = {}, context = {}) {
  const ingredientText = compact(ingredients.join(", "));
  const evidence = joinedEvidenceText(
    row.nutrientPanel,
    row.nutrient_panel,
    row.nutriments,
    row.guaranteedAnalysis,
    row.guaranteed_analysis,
    row.nutritionalInfo,
    row.nutritional_info
  );
  if (!isOfficialFreshpetProductUrl(context.sourceUrl || row.sourceUrl || row.source_url || row.url)) return false;
  if (compact(context.sourceQuality).toLowerCase() !== "manufacturer") return false;
  if (compact(context.ingredientVerificationStatus).toLowerCase() !== "manufacturer") return false;
  if (!/^freshpet$/i.test(compact(context.brand || row.brand))) return false;
  if (!["dog", "cat"].includes(compact(context.petType || row.petType || row.pet_type).toLowerCase())) return false;
  if (ingredientText.length < 45) return false;
  if (ingredients.length < 10 || ingredients.length >= 20) return false;
  if (!hasCoreGuaranteedAnalysis(evidence)) return false;
  if (!/\bformulated\s+to\s+meet\b[\s\S]{0,220}\bAAFCO\b/i.test(evidence)) return false;
  return true;
}

function hasTrustedLotusRawShortIngredientEvidence(ingredients, row = {}, context = {}) {
  const sourceUrl = context.sourceUrl || row.sourceUrl || row.source_url || row.url;
  const expectedPetType = officialLotusRawFoodPetType(sourceUrl);
  const petType = compact(context.petType || row.petType || row.pet_type).toLowerCase();
  const ingredientText = compact(ingredients.join(", "));
  const evidence = joinedEvidenceText(
    row.nutrientPanel,
    row.nutrient_panel,
    row.nutriments,
    row.guaranteedAnalysis,
    row.guaranteed_analysis,
    row.nutritionalInfo,
    row.nutritional_info
  );

  if (!expectedPetType || petType !== expectedPetType) return false;
  if (compact(context.sourceQuality).toLowerCase() !== "manufacturer") return false;
  if (compact(context.ingredientVerificationStatus).toLowerCase() !== "manufacturer") return false;
  if (!/^lotus$/i.test(compact(context.brand || row.brand))) return false;
  if (ingredientText.length < 150) return false;
  if (ingredients.length < 10 || ingredients.length >= 20) return false;
  if (/(?:\.\.\.|…)/.test(ingredientText)) return false;
  if (ANALYSIS_COPY_IN_INGREDIENTS_REGEX.test(ingredientText)) {
    return false;
  }
  if (!/\b(?:tricalcium phosphate|vitamin\s*e|manganese amino acid chelate|maganese amino acid chelate|dried egg shell|organic dried dulse)\b/i.test(ingredientText)) {
    return false;
  }
  if (!/"(?:protein|fat|fiber|moisture)"\s*:/i.test(evidence)) return false;
  if (!/\btaurine\b/i.test(evidence)) return false;
  if (!/\ball\s+life\s+stage\b/i.test(evidence)) return false;
  return true;
}

function normalizedEnum(value, allowed, fallback) {
  const normalized = compact(value).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function requiresSourceEvidence({
  ingredientVerificationStatus,
  imageVerificationStatus,
  sourceQuality,
}) {
  return (
    ["gdsn", "official", "manufacturer", "retailer_verified", "label_ocr_verified"].includes(ingredientVerificationStatus)
    || ["official", "manufacturer", "retailer_verified"].includes(imageVerificationStatus)
    || ["gdsn", "official", "manufacturer", "retailer_verified"].includes(sourceQuality)
  );
}

function hasCompleteFoodIngredientEvidence(ingredients, row = {}, context = {}) {
  const ingredientText = ingredients.join(", ");
  if (/^\s*(?:main|key)\s+ingredients\s*:/i.test(ingredientText)) return false;
  if (hasTrustedLotusRawShortIngredientEvidence(ingredients, row, context)) return true;
  if (COMPLETE_FOOD_NUTRIENT_MARKER_REGEX.test(ingredientText)) return true;
  if (ingredients.length >= 20) return true;

  const nutrientEvidence = joinedEvidenceText(
    row.nutrientPanel ||
    row.nutrient_panel ||
    row.nutriments ||
    row.guaranteedAnalysis ||
    row.guaranteed_analysis,
    row.nutritionalInfo,
    row.nutritional_info
  );
  if (
    ingredients.length >= 15 &&
    /\b(aafco|complete|balanced|formulated\s+to\s+meet|maintenance|growth)\b/i.test(nutrientEvidence)
  ) {
    return true;
  }

  return hasTrustedFreshpetShortIngredientEvidence(ingredients, row, context);
}

function normalizeHeader(value) {
  const key = String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return HEADER_ALIASES.get(key) || key;
}

function rawKey(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function scalarText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return compact(value);
  }
  if (Array.isArray(value)) {
    return compact(value.map(scalarText).filter(Boolean).join(", "));
  }
  if (typeof value === "object") {
    for (const key of ["_", "value", "text", "name", "description", "statement", "declaration", "url", "href", "uri", "contentUrl"]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const text = scalarText(value[key]);
        if (text) return text;
      }
    }
  }
  return "";
}

function isUrlLike(value) {
  return /^https?:\/\//i.test(compact(value));
}

function collectDeepValues(value, visitor, pathSegments = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDeepValues(item, visitor, [...pathSegments, String(index)]));
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeHeader(key);
    const raw = rawKey(key);
    visitor({ key, raw, normalizedKey, value: nestedValue, pathSegments });
    collectDeepValues(nestedValue, visitor, [...pathSegments, raw]);
  }
}

function firstDeepText(row, normalizedKeys, rawKeys = new Set()) {
  let result = "";
  collectDeepValues(row, ({ raw, normalizedKey, value }) => {
    if (result) return;
    if (!normalizedKeys.has(normalizedKey) && !rawKeys.has(raw)) return;
    result = scalarText(value);
  });
  return result;
}

function collectNestedUrlCandidates(row, { mode }) {
  const candidates = [];
  const sourceRawKeys = new Set([
    "catalog_product_url",
    "data_provider_url",
    "information_provider_product_url",
    "official_url",
    "pdp_url",
    "product_information_url",
    "product_page_url",
    "product_url",
    "source_product_url",
    "source_url",
    "url",
    "verification_evidence_url",
    "verification_url",
  ]);
  const imageRawKeys = new Set([
    "content_url",
    "front_image_url",
    "front_of_pack_image_url",
    "front_package_image_url",
    "hero_image_url",
    "href",
    "image",
    "image_url",
    "main_image_url",
    "packshot_url",
    "primary_image_url",
    "src",
    "uri",
    "url",
  ]);

  collectDeepValues(row, ({ raw, value, pathSegments }) => {
    const url = scalarText(value);
    if (!isUrlLike(url)) return;

    const objectPath = pathSegments.join(" ");
    const parent = pathSegments.length ? pathSegments[pathSegments.length - 1] : "";
    const context = normalizeText(`${objectPath} ${parent} ${raw}`);
    const inImageContext = /\b(image|images|media|asset|assets|picture|pictures|photo|photos|packshot|front)\b/.test(context);
    const inSourceContext = /\b(product|pdp|catalog|source|official|information|provider|verification|evidence|link|links|url)\b/.test(context);

    if (mode === "image") {
      if (!imageRawKeys.has(raw) || (!inImageContext && raw === "url")) return;
      const score = /\b(front|front_of_pack|main|primary|hero|packshot|package)\b/.test(context) ? 3 : inImageContext ? 2 : 1;
      candidates.push({ url, score });
      return;
    }

    if (!sourceRawKeys.has(raw)) return;
    if (inImageContext) return;
    const hasStrongSourceKey = raw !== "url";
    const hasSourceContext = /\b(product|pdp|catalog|source|official|information|provider|verification|evidence|link|links)\b/.test(context);
    if (!hasStrongSourceKey && !hasSourceContext) return;
    const score = /\b(product|pdp|catalog|official|information|verification|evidence)\b/.test(context) ? 3 : 1;
    candidates.push({ url, score });
  });

  return candidates.sort((left, right) => right.score - left.score).map((candidate) => candidate.url);
}

function nestedImageUrl(row) {
  return collectNestedUrlCandidates(row, { mode: "image" })[0] || "";
}

function nestedSourceUrl(row) {
  return collectNestedUrlCandidates(row, { mode: "source" })[0] || "";
}

function nestedIngredients(row) {
  let list = null;
  collectDeepValues(row, ({ raw, normalizedKey, value, pathSegments }) => {
    if (list) return;
    const context = normalizeText([...pathSegments, raw].join(" "));
    if (
      Array.isArray(value)
      && (normalizedKey === "ingredientsText" || raw === "ingredients" || /\bingredient/.test(context))
    ) {
      const values = value.map((ingredient) => scalarText(ingredient)).filter(Boolean);
      if (values.length >= 3) list = values;
    }
  });
  return list;
}

function applyNestedFeedAliases(normalized, original) {
  const assign = (key, value) => {
    if (compact(normalized[key])) return;
    const text = scalarText(value);
    if (text) normalized[key] = text;
  };
  const assignDeep = (key, normalizedKeys, rawKeys = new Set()) => {
    assign(key, firstDeepText(original, normalizedKeys, rawKeys));
  };

  assignDeep("gtin", new Set(["gtin", "barcode", "code"]));
  assignDeep("productName", new Set(["productName", "name"]), new Set(["trade_item_description", "consumer_facing_product_name", "functional_name"]));
  assignDeep("brand", new Set(["brand"]), new Set(["brand_name", "brandname"]));
  assignDeep("manufacturer", new Set(["manufacturer"]), new Set(["brand_owner_name"]));
  assignDeep("productLine", new Set(["productLine"]), new Set(["sub_brand", "subbrand", "product_line_name"]));
  assignDeep("flavor", new Set(["flavor"]), new Set(["variant_description", "flavor_name"]));
  assignDeep("lifeStage", new Set(["lifeStage"]), new Set(["life_stage_description", "target_life_stage"]));
  assignDeep("foodForm", new Set(["foodForm"]), new Set(["pet_food_form", "product_form"]));
  assignDeep("packageSize", new Set(["packageSize"]), new Set(["net_content", "net_contents", "consumer_unit_size"]));
  assignDeep("petType", new Set(["petType"]), new Set(["target_species", "pet_species"]));
  assignDeep("ingredientText", new Set(["ingredientText", "ingredientsText"]), new Set(["ingredient_declaration", "ingredient_statement", "ingredient_list"]));
  assignDeep("nutrientPanel", new Set(["nutrientPanel", "nutriments"]), new Set(["guaranteed_analysis_statement", "nutrition_facts", "nutritional_analysis"]));
  assignDeep("sourceUrl", new Set(["sourceUrl"]), new Set(["product_information_url", "product_page_url", "pdp_url", "catalog_product_url", "information_provider_product_url"]));
  assignDeep("verifiedAt", new Set(["verifiedAt"]), new Set(["gdsn_publication_date", "last_changed_date", "modified_date"]));
  assignDeep("category", new Set(["category", "categories"]), new Set(["gpc_category", "product_category", "category_path"]));
  assign("imageUrl", nestedImageUrl(original));
  assign("sourceUrl", nestedSourceUrl(original));

  const ingredientList = nestedIngredients(original);
  if (!Array.isArray(normalized.ingredients) && ingredientList?.length) {
    normalized.ingredients = ingredientList;
  }
  if (Array.isArray(original.ingredients) && !Array.isArray(normalized.ingredients)) {
    normalized.ingredients = original.ingredients;
  }
  if (Array.isArray(normalized.ingredientsText) && !Array.isArray(normalized.ingredients)) {
    normalized.ingredients = normalized.ingredientsText;
  }
  return normalized;
}

function normalizeRecordKeys(row = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const normalized = { ...row };
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(key);
    if (!normalizedKey || normalizedKey in normalized) continue;
    if (normalizedKey === "ingredientsText" && Array.isArray(value)) {
      normalized.ingredients = value;
    } else {
      normalized[normalizedKey] = value;
    }
  }
  return applyNestedFeedAliases(normalized, row);
}

function xmlParserModule() {
  try {
    return requireOptional("xml2js");
  } catch {
    return null;
  }
}

function rowCompletenessScore(row = {}) {
  return [
    row.gtin || row.barcode || row.code,
    row.productName || row.product_name || row.name,
    row.brand || row.manufacturer,
    row.petType || row.pet_type,
    row.ingredientText || row.ingredient_text || row.ingredientsText || row.ingredients_text || (Array.isArray(row.ingredients) ? row.ingredients.join(", ") : ""),
    row.imageUrl || row.image_url,
    row.sourceUrl || row.source_url || row.url,
  ].filter((value) => compact(value)).length;
}

function isLikelyXmlProductRow(row = {}) {
  const hasName = Boolean(compact(row.productName || row.product_name || row.name));
  const hasIdentity = Boolean(compact(row.gtin || row.barcode || row.code || row.brand || row.manufacturer));
  const hasEvidence = Boolean(compact(
    row.ingredientText
    || row.ingredient_text
    || row.ingredientsText
    || row.ingredients_text
    || row.imageUrl
    || row.image_url
    || row.sourceUrl
    || row.source_url
    || row.url
    || (Array.isArray(row.ingredients) ? row.ingredients.join(", ") : "")
  ));
  return hasName && hasIdentity && hasEvidence;
}

function hasDirectXmlProductSignal(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const signalKeys = new Set([
    "gtin",
    "barcode",
    "code",
    "productName",
    "name",
    "brand",
    "manufacturer",
    "ingredientText",
    "ingredientsText",
    "imageUrl",
    "sourceUrl",
  ]);
  return Object.keys(value).some((key) => signalKeys.has(normalizeHeader(key)));
}

function xmlRowDedupeKey(row = {}) {
  return normalizeText([
    row.gtin || row.barcode || row.code,
    row.brand || row.manufacturer,
    row.productName || row.product_name || row.name,
    row.ingredientText || row.ingredient_text || row.ingredientsText || row.ingredients_text || (Array.isArray(row.ingredients) ? row.ingredients.join(", ") : ""),
    row.imageUrl || row.image_url,
    row.sourceUrl || row.source_url || row.url,
  ].map(compact).join(" "));
}

function extractRowsFromXmlObject(parsed) {
  const candidates = [];

  function visit(value, pathSegments = []) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...pathSegments, String(index)]));
      return;
    }

    const normalized = normalizeRecordKeys(value);
    if (pathSegments.length > 0 && hasDirectXmlProductSignal(value) && isLikelyXmlProductRow(normalized)) {
      candidates.push(normalized);
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      visit(nestedValue, [...pathSegments, rawKey(key)]);
    }
  }

  visit(parsed);

  if (candidates.length === 0) {
    const rootRow = normalizeRecordKeys(parsed);
    if (isLikelyXmlProductRow(rootRow)) candidates.push(rootRow);
  }

  const byKey = new Map();
  for (const row of candidates) {
    const key = xmlRowDedupeKey(row);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || rowCompletenessScore(row) > rowCompletenessScore(existing)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

async function parseXmlFeed(raw) {
  const xml2js = xmlParserModule();
  if (!xml2js?.parseStringPromise) {
    throw new Error("XML feed parsing requires xml2js to be installed.");
  }

  const parsed = await xml2js.parseStringPromise(raw, {
    explicitArray: false,
    explicitCharkey: false,
    mergeAttrs: true,
    normalizeTags: false,
    trim: true,
  });
  return extractRowsFromXmlObject(parsed);
}

function delimiterFieldCount(line, delimiter) {
  let count = 1;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(raw) {
  const headerLine = raw.split(/\r?\n/).find((line) => compact(line)) || "";
  const candidates = [",", "\t", "|", ";"];
  return candidates
    .map((delimiter) => ({ delimiter, fields: delimiterFieldCount(headerLine, delimiter) }))
    .sort((left, right) => right.fields - left.fields)[0]?.delimiter || ",";
}

function parseCsv(raw, delimiter = detectDelimiter(raw)) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  const [headerRow, ...dataRows] = rows.filter((csvRow) => csvRow.some((value) => compact(value)));
  if (!headerRow) return [];

  const headers = headerRow.map(normalizeHeader);
  return dataRows.map((csvRow) => {
    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = compact(csvRow[index]);
    });
    return normalizeRecordKeys(record);
  });
}

function parseJsonFeed(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed.map(normalizeRecordKeys);
  if (Array.isArray(parsed.products)) return parsed.products.map(normalizeRecordKeys);
  if (Array.isArray(parsed.items)) return parsed.items.map(normalizeRecordKeys);
  if (Array.isArray(parsed.tradeItems)) return parsed.tradeItems.map(normalizeRecordKeys);
  if (Array.isArray(parsed.trade_items)) return parsed.trade_items.map(normalizeRecordKeys);
  throw new Error("JSON feed must be an array or an object with products/items/tradeItems.");
}

function parseNdjsonFeed(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => normalizeRecordKeys(JSON.parse(line)));
}

function looksDelimitedFeed(raw, filePath) {
  if (/\.(?:csv|tsv|tab|psv|txt)$/i.test(filePath)) return true;
  return delimiterFieldCount(raw.split(/\r?\n/).find((line) => compact(line)) || "", detectDelimiter(raw)) > 1;
}

function readFeedText(filePath) {
  const raw = fs.readFileSync(filePath);
  const isGzip = /\.gz$/i.test(filePath) || (raw[0] === GZIP_MAGIC_0 && raw[1] === GZIP_MAGIC_1);
  const buffer = isGzip ? zlib.gunzipSync(raw) : raw;
  return buffer.toString("utf8").trim();
}

async function parseFeed(filePath) {
  const raw = readFeedText(filePath);
  if (!raw) return [];

  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      return parseJsonFeed(raw);
    } catch (error) {
      if (!/\.(?:jsonl|ndjson)$/i.test(filePath) && !/\n\s*[{[]/.test(raw)) throw error;
      return parseNdjsonFeed(raw);
    }
  }

  if (/\.xml$/i.test(filePath) || /^<\?xml|^<[A-Za-z_:][\s\S]*>/.test(raw)) {
    return parseXmlFeed(raw);
  }

  if (looksDelimitedFeed(raw, filePath)) {
    return parseCsv(raw);
  }

  return parseNdjsonFeed(raw);
}

function normalizeProduct(row = {}, {
  source,
  requireImage = true,
  requireSourceUrl = true,
  sourceQuality,
  ingredientVerificationStatus,
  imageVerificationStatus,
  includeNonComplete = false,
  expectedBrandKeys = new Set(),
  allowSourceBrandMismatch = false,
  requiredSourceUrlPattern = null,
  duplicateGtins = new Set(),
}) {
  const gtin = normalizeGtin(row.gtin || row.barcode || row.upc || row.ean || row.code);
  const productName = compact(row.productName || row.product_name || row.name);
  const rawBrand = compact(row.brand || row.brands || row.manufacturer);
  const productLine = compact(row.productLine || row.product_line || row.line);
  const flavor = compact(row.flavor || row.flavour || row.recipe);
  const lifeStage = normalizeLifeStage(row.lifeStage || row.life_stage || row.lifestage, row);
  const foodForm = compact(row.foodForm || row.food_form || row.form || row.format);
  const packageSize = compact(row.packageSize || row.package_size || row.pack_size || row.size || row.net_weight);
  const ingredientText = cleanIngredientStatement(row.ingredientText || row.ingredient_text || row.ingredientsText || row.ingredients_text);
  const nutrientPanel = compact(row.nutrientPanel || row.nutrient_panel || row.nutriments);
  const ingredients = ingredientsFrom(row);
  const petType = normalizePetType(row.petType || row.pet_type, row);
  const feedSource = compact(row.source) || source;
  const imageUrl = compact(row.imageUrl || row.image_url || row.frontImageUrl || row.front_image_url || row.image) || null;
  const sourceUrl = compact(row.sourceUrl || row.source_url || row.url) || null;
  const ingredientSourceUrl = compact(row.ingredientSourceUrl || row.ingredient_source_url) || sourceUrl;
  const imageSourceUrl = compact(row.imageSourceUrl || row.image_source_url) || sourceUrl;
  const rawSourceHash = compact(row.rawSourceHash || row.raw_source_hash);
  const contentHash = compact(row.contentHash || row.content_hash);
  const extractorVersion = compact(row.extractorVersion || row.extractor_version);
  const category = compact(row.category || row.categories);
  const brand = canonicalSourceBrand({ brand: rawBrand, productName, sourceUrl, source: feedSource });
  const isCompleteFood = isKnownNonCompleteSourceProduct({
    productName,
    productLine,
    sourceUrl,
    source: feedSource,
  })
    ? false
    : parseBoolean(row.isCompleteFood ?? row.is_complete_food, true);
  const explicitCacheKey = compact(row.cacheKey || row.cache_key);
  const identityCacheBasis = normalizeText(`${cacheBrandFor({ brand, source: feedSource })} ${productName} ${cachePackageSizeFor({ packageSize, brand, source: feedSource })} ${sourceUrlIdentitySegment(sourceUrl)}`);
  const gtinCacheBasis = gtin && !duplicateGtins.has(gtin) ? gtin : "";
  const cacheBasis = explicitCacheKey || gtinCacheBasis || identityCacheBasis;
  const rowSourceQuality = normalizedEnum(
    row.sourceQuality || row.source_quality,
    SOURCE_QUALITIES,
    sourceQuality
  );
  const rowIngredientVerification = normalizedEnum(
    row.ingredientVerificationStatus || row.ingredient_verification_status,
    INGREDIENT_VERIFICATION_STATUSES,
    ingredientVerificationStatus
  );
  const rowImageVerification = normalizedEnum(
    row.imageVerificationStatus || row.image_verification_status,
    IMAGE_VERIFICATION_STATUSES,
    imageUrl ? imageVerificationStatus : "unverified"
  );

  if (!cacheBasis) return { product: null, reason: "missing_cache_key" };
  if (!productName) return { product: null, reason: "missing_product_name" };
  if (isKnownNonDogCatPetProduct({ productName, productLine, sourceUrl, category, petType })) {
    return { product: null, reason: "non_dog_cat_product" };
  }
  if (isLikelyNonProductCatalogRow(productName, brand, sourceUrl, productLine)) return { product: null, reason: "non_product_catalog_row" };
  if (!isCompleteFood && !includeNonComplete) return { product: null, reason: "not_complete_food" };
  if (!allowSourceBrandMismatch && !sourceBrandMatches({ brand, productName }, expectedBrandKeys)) {
    return { product: null, reason: "brand_source_mismatch" };
  }
  if (!["dog", "cat"].includes(petType)) return { product: null, reason: "unknown_pet_type" };
  if (ingredients.length < 5) return { product: null, reason: "missing_ingredients" };
  if (hasUnbalancedParentheses(ingredientText)) {
    return { product: null, reason: "unbalanced_ingredient_parentheses" };
  }
  const hasDisallowedCurlyGroups = hasCurlyIngredientGroup(ingredientText)
    && !allowsCurlyIngredientGroups({
      ingredientText,
      sourceQuality: rowSourceQuality,
      ingredientVerificationStatus: rowIngredientVerification,
    });
  if (hasDisallowedCurlyGroups || hasLikelyIngredientOcrArtifacts(ingredientText)) {
    return { product: null, reason: "ingredient_ocr_artifact" };
  }
  if (hasContaminatedIngredientText(ingredients)) return { product: null, reason: "contaminated_ingredient_statement" };
  if (hasVariantIngredientMismatch({ productName, productLine, flavor, packageSize, ingredientText })) {
    return { product: null, reason: "variant_ingredient_mismatch" };
  }
  if (hasVariantNutrientMismatch({ productName, productLine, flavor, packageSize, nutrientPanel })) {
    return { product: null, reason: "variant_nutrient_mismatch" };
  }
  if (sourceUrl && hasVariantSourceUrlMismatch({ productName, productLine, flavor, sourceUrl })) {
    return { product: null, reason: "variant_source_url_mismatch" };
  }
  if (packageSize && hasInvalidPackageSize(packageSize)) {
    return { product: null, reason: "invalid_package_size" };
  }
  if (isCompleteFood && !hasCompleteFoodIngredientEvidence(ingredients, row, {
    brand,
    ingredientVerificationStatus: rowIngredientVerification,
    petType,
    source: feedSource,
    sourceQuality: rowSourceQuality,
    sourceUrl,
  })) {
    return { product: null, reason: "incomplete_ingredient_statement" };
  }
  if (requireImage && !imageUrl) return { product: null, reason: "missing_image" };
  if (requireSourceUrl && !sourceUrl && requiresSourceEvidence({
    ingredientVerificationStatus: rowIngredientVerification,
    imageVerificationStatus: rowImageVerification,
    sourceQuality: rowSourceQuality,
  })) {
    return { product: null, reason: "missing_source_url" };
  }
  if (sourceUrl && requiredSourceUrlPattern && !requiredSourceUrlPattern.test(sourceUrl)) {
    return { product: null, reason: "source_url_pattern_mismatch" };
  }

  return {
    product: {
      cache_key: explicitCacheKey || `${feedSource}:${cacheBasis}`,
      product_name: productName,
      brand,
      gtin: gtin || null,
      product_line: productLine || null,
      flavor: flavor || null,
      life_stage: lifeStage || null,
      food_form: foodForm || null,
      package_size: packageSize || null,
      pet_type: petType,
      ingredients,
      ingredient_text: ingredientText || ingredients.join(", "),
      ingredient_count: ingredients.length,
      nutritional_info: parseMaybeJson(row.nutritionalInfo || row.nutritional_info),
      nutrient_panel: parseMaybeJson(nutrientPanel),
      has_published_nutrients: parseBoolean(row.hasPublishedNutrients ?? row.has_published_nutrients, Boolean(row.nutrientPanel ?? row.nutrient_panel ?? row.nutriments)),
      source: feedSource,
      source_quality: rowSourceQuality,
      ingredient_verification_status: rowIngredientVerification,
      image_verification_status: rowImageVerification,
      verified_at: compact(row.verifiedAt || row.verified_at) || new Date().toISOString(),
      source_url: sourceUrl,
      ingredient_source_url: ingredientSourceUrl,
      image_source_url: imageSourceUrl,
      raw_source_hash: rawSourceHash || null,
      content_hash: contentHash || null,
      extractor_version: extractorVersion || null,
      scraped_at: new Date().toISOString(),
      expires_at: compact(row.expiresAt || row.expires_at) || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      image_url: imageUrl,
      is_complete_food: isCompleteFood,
      catalog_exclusion_reason: isCompleteFood
        ? null
        : compact(row.catalogExclusionReason || row.catalog_exclusion_reason) || "not_complete_food",
      updated_at: new Date().toISOString(),
    },
    reason: null,
  };
}

function anonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
}

function clientFromEnv({ useAnonKey = false } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = useAnonKey ? anonKey() : serviceRoleKey();
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function upsertRows(client, rows, { rpcName = "upsert_catalog_product_feed", importKey = "" } = {}) {
  const args = { payload: rows };
  if (importKey) args.import_key = importKey;

  const { data, error } = await client.rpc(rpcName, args);

  if (error) throw error;
  return Array.isArray(data) ? data.length : rows.length;
}

async function createImportRun(client, {
  source,
  sourceQuality,
  mode,
  dryRun,
  importKey,
  totalCandidates,
  acceptedCandidates,
  rejectedCandidates,
  extractorVersion,
}) {
  const { data, error } = await client
    .from("catalog_import_runs")
    .insert({
      status: dryRun ? "dry_run" : "running",
      mode,
      source,
      source_quality: sourceQuality,
      import_key: importKey || null,
      dry_run: dryRun,
      total_candidates: totalCandidates,
      accepted_candidates: acceptedCandidates,
      rejected_candidates: rejectedCandidates,
      extractor_version: extractorVersion || null,
      report: {},
    })
    .select("id")
    .single();

  if (error) {
    console.error(`Warning: catalog_import_runs audit unavailable: ${error.message}`);
    return null;
  }
  return data?.id || null;
}

async function finishImportRun(client, runId, patch) {
  if (!runId) return;
  const { error } = await client
    .from("catalog_import_runs")
    .update({
      ...patch,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) {
    console.error(`Warning: catalog_import_runs update failed: ${error.message}`);
  }
}

function evidenceRowsFor(products, runId) {
  return products.map((product) => ({
    run_id: runId,
    cache_key: product.cache_key,
    gtin: product.gtin || null,
    product_name: product.product_name,
    brand: product.brand,
    pet_type: product.pet_type,
    source: product.source,
    source_quality: product.source_quality,
    source_url: product.source_url,
    ingredient_source_url: product.ingredient_source_url || product.source_url,
    image_source_url: product.image_source_url || product.source_url,
    ingredient_verification_status: product.ingredient_verification_status,
    image_verification_status: product.image_verification_status,
    raw_source_hash: product.raw_source_hash || null,
    content_hash: product.content_hash || null,
    extractor_version: product.extractor_version || null,
    review_state: "promoted",
    evidence: {
      ingredient_count: product.ingredient_count,
      has_image: Boolean(product.image_url),
      has_source_url: Boolean(product.source_url),
      verified_at: product.verified_at,
    },
  }));
}

async function insertEvidenceRows(client, rows, { batchSize = 500 } = {}) {
  if (!rows.length) return;
  for (let index = 0; index < rows.length; index += batchSize) {
    const { error } = await client
      .from("catalog_product_evidence")
      .insert(rows.slice(index, index + batchSize));
    if (error) {
      console.error(`Warning: catalog_product_evidence insert failed: ${error.message}`);
      return;
    }
  }
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sqlDollarQuoted(value, baseTag = "woof_catalog_payload") {
  const text = String(value);
  let tag = baseTag.replace(/[^a-zA-Z0-9_]/g, "_") || "woof_catalog_payload";
  let suffix = 0;
  while (text.includes(`$${tag}$`)) {
    suffix += 1;
    tag = `${baseTag}_${suffix}`;
  }
  return `$${tag}$${text}$${tag}$`;
}

function md5Hex(value) {
  return crypto.createHash("md5").update(value, "utf8").digest("hex");
}

function sqlPayloadTextExpression(payload, payloadFormat) {
  if (payloadFormat === "base64") {
    return `convert_from(decode('${Buffer.from(payload, "utf8").toString("base64")}', 'base64'), 'UTF8')`;
  }
  if (payloadFormat === "hex") {
    return `convert_from(decode('${Buffer.from(payload, "utf8").toString("hex")}', 'hex'), 'UTF8')`;
  }
  return sqlDollarQuoted(payload);
}

function sqlPayloadExpression(payload, payloadFormat) {
  const payloadTextExpression = sqlPayloadTextExpression(payload, payloadFormat);
  const expectedMd5 = md5Hex(payload);
  const checksumFailureExpression = "(1 / (CASE WHEN payload_text IS NULL THEN 0 ELSE 0 END))::TEXT";
  return `(SELECT (
      CASE
        WHEN md5(payload_text) = '${expectedMd5}' THEN payload_text
        ELSE ${checksumFailureExpression}
      END
    )::jsonb
    FROM (SELECT ${payloadTextExpression} AS payload_text) AS payload_guard)`;
}

function compactSqlPayloadRow(product) {
  const payload = {};
  for (const [key, value] of Object.entries(product)) {
    if (value === null || value === undefined) continue;
    if (key === "ingredient_count") continue;
    payload[key] = value;
  }
  return payload;
}

function emitUpsertSql(rows, { payloadFormat = "json" } = {}) {
  const columns = [
    "cache_key",
    "product_name",
    "brand",
    "gtin",
    "product_line",
    "flavor",
    "life_stage",
    "food_form",
    "package_size",
    "pet_type",
    "ingredients",
    "ingredient_text",
    "ingredient_count",
    "nutritional_info",
    "nutrient_panel",
    "has_published_nutrients",
    "source",
    "source_quality",
    "ingredient_verification_status",
    "image_verification_status",
    "verified_at",
    "source_url",
    "scraped_at",
    "expires_at",
    "image_url",
    "is_complete_food",
    "catalog_exclusion_reason",
    "updated_at",
  ];
  const assignments = columns
    .filter((column) => column !== "cache_key")
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(",\n    ");
  const payload = JSON.stringify(rows.map(compactSqlPayloadRow));

  return `
WITH feed AS (
  SELECT *
  FROM jsonb_to_recordset(${sqlPayloadExpression(payload, payloadFormat)}) AS product(
    cache_key TEXT,
    product_name TEXT,
    brand TEXT,
    gtin TEXT,
    product_line TEXT,
    flavor TEXT,
    life_stage TEXT,
    food_form TEXT,
    package_size TEXT,
    pet_type TEXT,
    ingredients JSONB,
    ingredient_text TEXT,
    nutritional_info JSONB,
    nutrient_panel JSONB,
    has_published_nutrients BOOLEAN,
    source TEXT,
    source_quality TEXT,
    ingredient_verification_status TEXT,
    image_verification_status TEXT,
    verified_at TIMESTAMPTZ,
    source_url TEXT,
    scraped_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    image_url TEXT,
    is_complete_food BOOLEAN,
    catalog_exclusion_reason TEXT,
    updated_at TIMESTAMPTZ
  )
),
normalized AS (
  SELECT
    cache_key,
    product_name,
    brand,
    gtin,
    product_line,
    flavor,
    life_stage,
    food_form,
    package_size,
    pet_type,
    COALESCE((
      SELECT array_agg(value ORDER BY ordinal)
      FROM jsonb_array_elements_text(COALESCE(ingredients, '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinal)
    ), public.catalog_split_ingredient_statement(NULLIF(ingredient_text, '')), ARRAY[]::TEXT[]) AS ingredients,
    ingredient_text,
    nutritional_info,
    nutrient_panel,
    COALESCE(has_published_nutrients, FALSE) AS has_published_nutrients,
    source,
    source_quality,
    ingredient_verification_status,
    image_verification_status,
    verified_at,
    source_url,
    scraped_at,
    expires_at,
    image_url,
    COALESCE(is_complete_food, TRUE) AS is_complete_food,
    catalog_exclusion_reason,
    updated_at
  FROM feed
)
INSERT INTO public.product_data (${columns.join(", ")})
SELECT
  cache_key,
  product_name,
  brand,
  gtin,
  product_line,
  flavor,
  life_stage,
  food_form,
  package_size,
  pet_type,
  ingredients,
  COALESCE(NULLIF(ingredient_text, ''), array_to_string(ingredients, ', ')) AS ingredient_text,
  COALESCE(array_length(ingredients, 1), 0) AS ingredient_count,
  nutritional_info,
  nutrient_panel,
  has_published_nutrients,
  source,
  source_quality,
  ingredient_verification_status,
  image_verification_status,
  verified_at,
  source_url,
  scraped_at,
  expires_at,
  image_url,
  is_complete_food,
  catalog_exclusion_reason,
  updated_at
FROM normalized
ON CONFLICT (cache_key) DO UPDATE SET
    ${assignments}
RETURNING cache_key, product_name, brand, source_url;
`.trim();
}

function emitUpsertRpcSql(rows, { payloadFormat = "json" } = {}) {
  const payload = JSON.stringify(rows.map(compactSqlPayloadRow));
  return `
SELECT count(*) AS upserted_rows
FROM public.upsert_catalog_product_feed(${sqlPayloadExpression(payload, payloadFormat)});
`.trim();
}

function emitMcpRpcGroupSql(rows, { payloadFormat = "base64" } = {}) {
  if (payloadFormat === "hex") {
    const values = rows.map((row, index) => {
      const payload = JSON.stringify([compactSqlPayloadRow(row)]);
      const payloadHex = Buffer.from(payload, "utf8").toString("hex");
      return `    (${index + 1}, '${md5Hex(payload)}', '${payloadHex}')`;
    });

    return `
WITH payloads(row_number, expected_md5, payload_hex) AS (
  VALUES
${values.join(",\n")}
),
decoded_payloads AS (
  SELECT
    row_number,
    expected_md5,
    convert_from(decode(payload_hex, 'hex'), 'UTF8') AS payload_text
  FROM payloads
),
guarded_payloads AS (
  SELECT
    row_number,
    (
      CASE
        WHEN md5(payload_text) = expected_md5 THEN payload_text
        ELSE (1 / (CASE WHEN payload_text IS NULL THEN 0 ELSE 0 END))::TEXT
      END
    )::jsonb AS payload
  FROM decoded_payloads
),
grouped_upserts AS (
  SELECT
    row_number,
    (SELECT count(*) FROM public.upsert_catalog_product_feed(payload))::INTEGER AS upserted_rows
  FROM guarded_payloads
)
SELECT
  count(*) AS attempted_rows,
  COALESCE(sum(upserted_rows), 0)::INTEGER AS upserted_rows
FROM grouped_upserts;
`.trim();
  }

  const selects = rows.map((row, index) => {
    const payload = JSON.stringify([compactSqlPayloadRow(row)]);
    return `
  SELECT
    ${index + 1} AS row_number,
    (SELECT count(*) FROM public.upsert_catalog_product_feed(${sqlPayloadExpression(payload, payloadFormat)}))::INTEGER AS upserted_rows`.trim();
  });

  return `
WITH grouped_upserts AS (
${selects.join("\n  UNION ALL\n")}
)
SELECT
  count(*) AS attempted_rows,
  COALESCE(sum(upserted_rows), 0)::INTEGER AS upserted_rows
FROM grouped_upserts;
`.trim();
}

function emitAcquisitionRefreshSql() {
  return `
SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;
SELECT public.reconcile_catalog_acquisition_queue_batch(10) AS reconcile_result;
`.trim();
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return sqlDollarQuoted(String(value), "woof_catalog_text");
}

function sqlJsonbLiteral(value) {
  return `${sqlDollarQuoted(JSON.stringify(value ?? {}), "woof_catalog_json")}::jsonb`;
}

function strictReadySqlPredicate(alias = "pd") {
  return `
    ${alias}.pet_type IN ('dog', 'cat')
    AND COALESCE(NULLIF(btrim(${alias}.source_url), ''), '') <> ''
    AND COALESCE(NULLIF(btrim(${alias}.ingredient_text), ''), '') <> ''
    AND COALESCE(NULLIF(btrim(${alias}.image_url), ''), '') <> ''
    AND ${alias}.image_url NOT ILIKE 'data:%'
    AND ${alias}.verified_at IS NOT NULL
    AND ${alias}.ingredient_count >= 5
    AND ${alias}.is_complete_food = TRUE
    AND ${alias}.catalog_exclusion_reason IS NULL
    AND ${alias}.source_quality IN ('gdsn','official','manufacturer','retailer_verified')
    AND ${alias}.ingredient_verification_status IN ('gdsn','official','manufacturer','retailer_verified','label_ocr_verified')
    AND ${alias}.image_verification_status IN ('official','manufacturer','retailer_verified')
  `.trim();
}

function emitAuditEvidenceSql(rows, {
  source,
  sourceQuality,
  mode,
  expectedBrands = [],
  extractorVersion = "",
} = {}) {
  const evidenceByCacheKey = new Map();
  for (const row of rows) {
    const cacheKey = compact(row.cache_key);
    if (!cacheKey || evidenceByCacheKey.has(cacheKey)) continue;
    evidenceByCacheKey.set(cacheKey, row);
  }
  const valuesSql = evidenceByCacheKey.size > 0
    ? [...evidenceByCacheKey.values()].map((row) => `    (${[
      sqlLiteral(row.cache_key),
      sqlLiteral(row.ingredient_source_url || row.source_url),
      sqlLiteral(row.image_source_url || row.source_url),
      sqlLiteral(row.raw_source_hash || ""),
      sqlLiteral(row.content_hash || ""),
    ].join(", ")})`).join(",\n")
    : `    (NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT)`;
  const report = {
    generated_by: "catalog-official-feed-import",
    evidence_source: "product_data_after_feed_upsert",
    expected_brands: expectedBrands,
    row_count: rows.length,
  };

  return `
WITH requested_cache_keys(
  cache_key,
  ingredient_source_url,
  image_source_url,
  raw_source_hash,
  content_hash
) AS (
  VALUES
${valuesSql}
),
selected_products AS (
  SELECT
    pd.*,
    keys.ingredient_source_url AS audit_ingredient_source_url,
    keys.image_source_url AS audit_image_source_url,
    keys.raw_source_hash AS audit_raw_source_hash,
    keys.content_hash AS audit_content_hash
  FROM public.product_data pd
  JOIN requested_cache_keys keys ON keys.cache_key = pd.cache_key
  WHERE pd.source = ${sqlLiteral(source)}
),
import_run AS (
  INSERT INTO public.catalog_import_runs (
    status,
    mode,
    source,
    source_quality,
    extractor_version,
    total_candidates,
    accepted_candidates,
    rejected_candidates,
    imported_rows,
    verified_ready_rows,
    report,
    finished_at,
    updated_at
  )
  VALUES (
    'succeeded',
    ${sqlLiteral(`${mode}_sql`)},
    ${sqlLiteral(source)},
    ${sqlLiteral(sourceQuality)},
    ${sqlLiteral(extractorVersion)},
    ${rows.length},
    ${rows.length},
    0,
    (SELECT count(*) FROM selected_products),
    (SELECT count(*) FROM selected_products pd WHERE ${strictReadySqlPredicate("pd")}),
    ${sqlJsonbLiteral(report)},
    now(),
    now()
  )
  RETURNING id
),
inserted_evidence AS (
  INSERT INTO public.catalog_product_evidence (
    run_id,
    cache_key,
    gtin,
    product_name,
    brand,
    pet_type,
    source,
    source_quality,
    source_url,
    ingredient_source_url,
    image_source_url,
    ingredient_verification_status,
    image_verification_status,
    raw_source_hash,
    content_hash,
    extractor_version,
    review_state,
    evidence
  )
  SELECT
    (SELECT id FROM import_run),
    pd.cache_key,
    pd.gtin,
    pd.product_name,
    pd.brand,
    pd.pet_type,
    pd.source,
    pd.source_quality,
    pd.source_url,
    COALESCE(NULLIF(btrim(pd.audit_ingredient_source_url), ''), pd.source_url),
    COALESCE(NULLIF(btrim(pd.audit_image_source_url), ''), pd.source_url),
    pd.ingredient_verification_status,
    pd.image_verification_status,
    NULLIF(btrim(pd.audit_raw_source_hash), ''),
    COALESCE(NULLIF(btrim(pd.audit_content_hash), ''), md5(concat_ws('|', pd.cache_key, pd.source, pd.source_url, pd.ingredient_text, pd.image_url))),
    ${sqlLiteral(extractorVersion)},
    'promoted',
    jsonb_build_object(
      'ingredient_count', pd.ingredient_count,
      'has_image', COALESCE(NULLIF(btrim(pd.image_url), ''), '') <> '',
      'has_source_url', COALESCE(NULLIF(btrim(pd.source_url), ''), '') <> '',
      'verified_at', pd.verified_at
    )
  FROM selected_products pd
  ON CONFLICT DO NOTHING
  RETURNING 1
)
SELECT
  (SELECT id FROM import_run) AS run_id,
  (SELECT count(*) FROM selected_products) AS selected_products,
  (SELECT count(*) FROM inserted_evidence) AS inserted_evidence_rows;
`.trim();
}

function cleanSqlOutputDir(outputDir, sourceSegment, mode) {
  if (!fs.existsSync(outputDir)) return;
  const chunkPattern = new RegExp(`^\\d{4}-${sourceSegment}-${mode}-offset-\\d+-rows-\\d+\\.sql$`);
  const mcpGroupPattern = new RegExp(`^mcp-\\d{4}-${sourceSegment}-${mode}-offset-\\d+-rows-\\d+\\.sql$`);
  for (const file of fs.readdirSync(outputDir)) {
    if (
      chunkPattern.test(file)
      || mcpGroupPattern.test(file)
      || file === "manifest.json"
      || file === "9998-import-audit-and-evidence.sql"
      || file === "9999-refresh-catalog-acquisition-queue.sql"
    ) {
      fs.unlinkSync(`${outputDir.replace(/\/+$/g, "")}/${file}`);
    }
  }
}

function writeSqlChunks(rows, {
  outputDir,
  source,
  sourceQuality,
  mode,
  payloadFormat,
  sqlOffset,
  chunkSize,
  mcpGroupSize = 0,
  expectedBrands = [],
  extractorVersion = "",
}) {
  fs.mkdirSync(outputDir, { recursive: true });

  const chunkFiles = [];
  const mcpGroupFiles = [];
  const sourceSegment = safeFileSegment(source);
  const emitSqlForMode = mode === "rpc" ? emitUpsertRpcSql : emitUpsertSql;
  cleanSqlOutputDir(outputDir, sourceSegment, mode);

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunkRows = rows.slice(index, index + chunkSize);
    const chunkOffset = sqlOffset + index;
    const chunkNumber = String(chunkFiles.length + 1).padStart(4, "0");
    const filename = `${chunkNumber}-${sourceSegment}-${mode}-offset-${chunkOffset}-rows-${chunkRows.length}.sql`;
    const filePath = `${outputDir.replace(/\/+$/g, "")}/${filename}`;
    const sql = [
      `-- Source: ${source}`,
      `-- Source quality: ${sourceQuality}`,
      expectedBrands.length > 0 ? `-- Expected brands: ${expectedBrands.join(", ")}` : null,
      `-- Mode: ${mode}`,
      `-- Payload format: ${payloadFormat}`,
      `-- Offset: ${chunkOffset}`,
      `-- Rows: ${chunkRows.length}`,
      emitSqlForMode(chunkRows, { payloadFormat }),
      "",
    ].filter((line) => line !== null).join("\n");

    fs.writeFileSync(filePath, sql, "utf8");
    chunkFiles.push({
      file: filePath,
      offset: chunkOffset,
      rows: chunkRows.length,
    });
  }

  if (mode === "rpc" && mcpGroupSize > 0) {
    for (let index = 0; index < rows.length; index += mcpGroupSize) {
      const groupRows = rows.slice(index, index + mcpGroupSize);
      const groupOffset = sqlOffset + index;
      const groupNumber = String(mcpGroupFiles.length + 1).padStart(4, "0");
      const filename = `mcp-${groupNumber}-${sourceSegment}-${mode}-offset-${groupOffset}-rows-${groupRows.length}.sql`;
      const filePath = `${outputDir.replace(/\/+$/g, "")}/${filename}`;
      const sql = [
        `-- Source: ${source}`,
        `-- Source quality: ${sourceQuality}`,
        expectedBrands.length > 0 ? `-- Expected brands: ${expectedBrands.join(", ")}` : null,
        `-- Mode: ${mode}`,
        `-- Payload format: ${payloadFormat}`,
        `-- MCP group size: ${mcpGroupSize}`,
        `-- Offset: ${groupOffset}`,
        `-- Rows: ${groupRows.length}`,
        emitMcpRpcGroupSql(groupRows, { payloadFormat }),
        "",
      ].filter((line) => line !== null).join("\n");

      fs.writeFileSync(filePath, sql, "utf8");
      mcpGroupFiles.push({
        file: filePath,
        offset: groupOffset,
        rows: groupRows.length,
      });
    }
  }

  const refreshFile = `${outputDir.replace(/\/+$/g, "")}/9999-refresh-catalog-acquisition-queue.sql`;
  const auditEvidenceFile = `${outputDir.replace(/\/+$/g, "")}/9998-import-audit-and-evidence.sql`;
  fs.writeFileSync(auditEvidenceFile, `${emitAuditEvidenceSql(rows, {
    source,
    sourceQuality,
    mode,
    expectedBrands,
    extractorVersion,
  })}\n`, "utf8");
  fs.writeFileSync(refreshFile, `${emitAcquisitionRefreshSql()}\n`, "utf8");

  const manifest = {
    generated_at: new Date().toISOString(),
    source,
    source_quality: sourceQuality,
    expected_brands: expectedBrands,
    mode,
    payload_format: payloadFormat,
    sql_offset: sqlOffset,
    total_sql_rows: rows.length,
    chunk_size: chunkSize,
    mcp_group_size: mcpGroupSize,
    chunks: chunkFiles,
    mcp_groups: mcpGroupFiles,
    audit_evidence_file: auditEvidenceFile,
    refresh_file: refreshFile,
  };
  const manifestFile = `${outputDir.replace(/\/+$/g, "")}/manifest.json`;
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    chunkCount: chunkFiles.length,
    mcpGroupCount: mcpGroupFiles.length,
    manifestFile,
    auditEvidenceFile,
    refreshFile,
  };
}

async function main() {
  const filePath = getArg("--file");
  const source = compact(getArg("--source", DEFAULT_SOURCE)) || DEFAULT_SOURCE;
  const batchSize = Math.min(positiveNumber(getArg("--batch-size"), DEFAULT_BATCH_SIZE), 1000);
  const dryRun = hasArg("--dry-run");
  const emitSql = hasArg("--emit-sql");
  const emitSqlRpc = hasArg("--emit-sql-rpc");
  const emitSqlDir = compact(getArg("--emit-sql-dir"));
  const sqlOffset = nonNegativeInteger(getArg("--sql-offset"), 0);
  const sqlLimit = positiveInteger(getArg("--sql-limit"), null);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), sqlLimit || 25);
  const sqlMcpGroupSize = nonNegativeInteger(getArg("--sql-mcp-group-size"), 0);
  const requestedSqlPayloadFormat = getArg("--sql-payload-format", "json");
  const sqlPayloadFormat = ["base64", "hex"].includes(requestedSqlPayloadFormat)
    ? requestedSqlPayloadFormat
    : "json";
  const requireImage = !hasArg("--allow-missing-image");
  const requireSourceUrl = !hasArg("--allow-missing-source-url");
  const includeNonComplete = hasArg("--include-non-complete");
  const rpcName = compact(getArg("--rpc-name", "upsert_catalog_product_feed")) || "upsert_catalog_product_feed";
  const importKey = compact(getArg("--import-key"));
  const useAnonKey = hasArg("--use-anon-key");
  const skipAcquisitionRefresh = hasArg("--skip-acquisition-refresh");
  const emitSkipDetails = hasArg("--emit-skip-details");
  const requiredSourceUrlPattern = sourceUrlPatternConfig(getArg("--required-source-url-pattern"));
  const importStartedAt = Date.now();
  const sourceQuality = normalizedEnum(getArg("--source-quality"), SOURCE_QUALITIES, "official");
  const ingredientVerificationStatus = normalizedEnum(
    getArg("--ingredient-verification"),
    INGREDIENT_VERIFICATION_STATUSES,
    sourceQuality === "gdsn" ? "gdsn" : sourceQuality === "manufacturer" ? "manufacturer" : "official"
  );
  const imageVerificationStatus = normalizedEnum(
    getArg("--image-verification"),
    IMAGE_VERIFICATION_STATUSES,
    sourceQuality === "manufacturer" ? "manufacturer" : "official"
  );
  const expectedBrands = expectedBrandConfig({ getArgs, hasArg });
  const acquisitionOptions = acquisitionQueueOptions({ getArg, hasArg });
  const client = clientFromEnv({ useAnonKey });

  if (!filePath) {
    throw new Error("Usage: node scripts/catalog-official-feed-import.mjs --file products.csv --source manufacturer_name");
  }
  if (!client && !dryRun && !emitSql && !emitSqlRpc) {
    throw new Error(useAnonKey
      ? "Set SUPABASE_URL and SUPABASE_ANON_KEY or run with --dry-run."
      : "Set SUPABASE_SERVICE_ROLE_KEY or run with --dry-run.");
  }

  const feedRows = await parseFeed(filePath);
  const duplicateGtins = duplicatedGtinsByIdentity(feedRows);
  if (duplicateGtins.size > 0) {
    console.warn(`Duplicate GTINs across distinct products will use source-page cache keys: ${[...duplicateGtins].join(", ")}`);
  }
  const skipped = new Map();
  const skippedDetails = [];
  const products = [];

  for (const row of feedRows) {
    const { product, reason } = normalizeProduct(row, {
      source,
      requireImage,
      requireSourceUrl,
      sourceQuality,
      ingredientVerificationStatus,
      imageVerificationStatus,
      includeNonComplete,
      expectedBrandKeys: expectedBrands.keys,
      allowSourceBrandMismatch: expectedBrands.allowMismatch,
      requiredSourceUrlPattern,
      duplicateGtins,
    });
    if (!product) {
      increment(skipped, reason || "unknown");
      if (emitSkipDetails) skippedDetails.push(skipDetailFor(row, reason || "unknown"));
      continue;
    }
    const scraperCandidate = normalizeScraperCandidate(product, {
      source,
      sourceQuality,
      ingredientVerificationStatus,
      imageVerificationStatus,
      verifiedAt: product.verified_at,
    });
    const scraperValidation = validateScraperCandidate(scraperCandidate, {
      expectedBrandTerms: expectedBrands.terms,
      requiredSourceUrlPattern,
    });
    if (!scraperValidation.ok) {
      const reason = `scraper_contract:${scraperValidation.reasons[0] || "rejected"}`;
      increment(skipped, reason);
      if (emitSkipDetails) skippedDetails.push(skipDetailFor(product, reason));
      continue;
    }
    products.push({
      ...product,
      content_hash: product.content_hash || scraperCandidate.content_hash,
      raw_source_hash: product.raw_source_hash || scraperCandidate.raw_source_hash || null,
      extractor_version: product.extractor_version || scraperCandidate.extractor_version || null,
    });
  }

  const deduped = [...new Map(products.map((product) => [product.cache_key, product])).values()];
  let upserted = 0;
  const rejectedCount = [...skipped.values()].reduce((total, count) => total + count, 0);
  const extractorVersion = compact(getArg("--extractor-version"))
    || compact(deduped.find((product) => product.extractor_version)?.extractor_version);
  let importRunId = null;

  if (emitSqlDir && !emitSql && !emitSqlRpc) {
    throw new Error("--emit-sql-dir requires --emit-sql or --emit-sql-rpc.");
  }

  if (emitSql || emitSqlRpc) {
    const sqlRows = deduped.slice(sqlOffset, sqlLimit ? sqlOffset + sqlLimit : undefined);
    if (emitSqlDir) {
      const result = writeSqlChunks(sqlRows, {
        outputDir: emitSqlDir,
        source,
        sourceQuality,
        mode: emitSqlRpc ? "rpc" : "inline-upsert",
        payloadFormat: sqlPayloadFormat,
        sqlOffset,
        chunkSize: sqlChunkSize,
        mcpGroupSize: sqlMcpGroupSize,
        expectedBrands: expectedBrands.terms,
        extractorVersion,
      });
      console.log(`Wrote ${result.chunkCount} SQL chunk file(s) to ${emitSqlDir}`);
      if (sqlMcpGroupSize > 0) {
        console.log(`Wrote ${result.mcpGroupCount} MCP group SQL file(s) to ${emitSqlDir}`);
      }
      console.log(`Manifest: ${result.manifestFile}`);
      console.log(`Audit/evidence SQL: ${result.auditEvidenceFile}`);
      console.log(`Refresh SQL: ${result.refreshFile}`);
      console.error(`Input rows: ${feedRows.length}`);
      console.error(`Normalized rows: ${deduped.length}`);
      console.error(`SQL rows: ${sqlRows.length}`);
      console.error(`SQL mode: ${emitSqlRpc ? "rpc" : "inline-upsert"}`);
      console.error(`SQL payload format: ${sqlPayloadFormat}`);
      if (expectedBrands.terms.length > 0) {
        console.error(`Expected brands: ${expectedBrands.terms.join(", ")}`);
      }
      console.error(`SQL chunk size: ${sqlChunkSize}`);
      if (sqlMcpGroupSize > 0) {
        console.error(`SQL MCP group size: ${sqlMcpGroupSize}`);
      }
      if (sqlOffset > 0 || sqlLimit) {
        console.error(`SQL window: offset ${sqlOffset}, limit ${sqlLimit || "all"}`);
      }
      if (skipped.size > 0) {
        console.error(`Skipped rows: ${JSON.stringify(Object.fromEntries(skipped))}`);
      }
      return;
    }

    console.log(emitSqlRpc
      ? emitUpsertRpcSql(sqlRows, { payloadFormat: sqlPayloadFormat })
      : emitUpsertSql(sqlRows, { payloadFormat: sqlPayloadFormat }));
    console.error(`Input rows: ${feedRows.length}`);
    console.error(`Normalized rows: ${deduped.length}`);
    console.error(`SQL rows: ${sqlRows.length}`);
    console.error(`SQL mode: ${emitSqlRpc ? "rpc" : "inline-upsert"}`);
    console.error(`SQL payload format: ${sqlPayloadFormat}`);
    if (expectedBrands.terms.length > 0) {
      console.error(`Expected brands: ${expectedBrands.terms.join(", ")}`);
    }
    if (sqlOffset > 0 || sqlLimit) {
      console.error(`SQL window: offset ${sqlOffset}, limit ${sqlLimit || "all"}`);
    }
    if (skipped.size > 0) {
      console.error(`Skipped rows: ${JSON.stringify(Object.fromEntries(skipped))}`);
    }
    return;
  }

  if (client) {
    importRunId = await createImportRun(client, {
      source,
      sourceQuality,
      mode: "official_feed_import",
      dryRun,
      importKey,
      totalCandidates: feedRows.length,
      acceptedCandidates: deduped.length,
      rejectedCandidates: rejectedCount,
      extractorVersion,
    });
  }

  if (client && !dryRun) {
    try {
      for (let index = 0; index < deduped.length; index += batchSize) {
        upserted += await upsertRows(client, deduped.slice(index, index + batchSize), {
          rpcName,
          importKey,
        });
      }
      if (importRunId) {
        await insertEvidenceRows(client, evidenceRowsFor(deduped, importRunId), { batchSize });
      }
      if (!skipAcquisitionRefresh) {
        printAcquisitionQueueUpdate(await updateCatalogAcquisitionQueue(client, {
          ...acquisitionOptions,
          label: "official feed import",
        }));
      }
      await finishImportRun(client, importRunId, {
        status: "succeeded",
        imported_rows: upserted,
        duration_ms: Date.now() - importStartedAt,
        report: {
          skipped: Object.fromEntries(skipped),
        },
      });
    } catch (error) {
      await finishImportRun(client, importRunId, {
        status: "failed",
        imported_rows: upserted,
        duration_ms: Date.now() - importStartedAt,
        error_message: error.message || String(error),
        report: {
          skipped: Object.fromEntries(skipped),
        },
      });
      throw error;
    }
  } else if (client && dryRun) {
    await finishImportRun(client, importRunId, {
      status: "dry_run",
      imported_rows: 0,
      duration_ms: Date.now() - importStartedAt,
      report: {
        skipped: Object.fromEntries(skipped),
      },
    });
  }

  console.log(`Input rows: ${feedRows.length}`);
  console.log(`Normalized rows: ${deduped.length}`);
  console.log(`Upserted rows: ${upserted}`);
  if (expectedBrands.terms.length > 0) {
    console.log(`Expected brands: ${expectedBrands.terms.join(", ")}`);
  }
  if (dryRun || !client) console.log("Dry run only. Add SUPABASE_SERVICE_ROLE_KEY and remove --dry-run to upsert.");

  if (skipped.size > 0) {
    console.log("Skipped rows:");
    console.table([...skipped.entries()].map(([reason, count]) => ({ reason, count })));
  }
  if (emitSkipDetails) {
    console.log(JSON.stringify({ skipped: skippedDetails }, null, 2));
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
