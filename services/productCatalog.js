import { supabase } from "./supabase";
import { identifyProductLabel } from "./claude";
import {
  CATALOG_QUALITY_STATES,
  catalogVerificationState,
  productIsVerifiedReady as catalogProductIsVerifiedReady,
} from "./catalogQuality";
import { createLogger } from "./logger";
import {
  filterProductsForOcr,
  labelOcrSearchQueries,
  normalizeLabelOcrText,
  pickVerifiedProductForOcr,
  primaryPackageOcrText,
  rankProductsForOcr,
} from "./labelOcrMatching";
import {
  adultAgeBand,
  compareLabelIdentities,
  consumerBrandForIdentity,
  evaluateNonCompleteFoodEvidence,
  productFormulaKey,
} from "./labelResolution";

export {
  labelOcrProductMatchScore,
  labelOcrSearchQueries,
} from "./labelOcrMatching";

const logger = createLogger("CATALOG");
const DEFAULT_LIMIT = 16;
// These are network ceilings, not target latencies. Real iPhones previously
// abandoned healthy PostgREST work at 2.5-2.8 seconds while the server later
// returned 200. The label identity RPC below is intentionally lightweight and
// normally completes far earlier, but retains enough cold-start/network margin.
const CATALOG_RPC_TIMEOUT_MS = 6_000;
const LABEL_RPC_TIMEOUT_MS = 4_500;
const CATALOG_PRODUCT_CACHE_TTL_MS = 10 * 60 * 1000;
const CATALOG_PRODUCT_CACHE_MAX_ENTRIES = 24;
const catalogProductCache = new Map();
const LABEL_IDENTITY_RPC = "search_verified_product_identities_for_label";
const LEGACY_LABEL_RPC = "search_verified_products_for_label_fast";
const MIN_SCORABLE_CATALOG_RANK = 3;
const LABEL_AUTO_OPEN_CONFIDENCE = 0.78;
const LABEL_AUTO_OPEN_CANDIDATE_COUNT = 5;
const LABEL_MARKETING_BENEFIT_PATTERNS = [
  /\bsupports?\s+sensitive\s+skin\s+(?:&|and)\s+stomach(?:\s+guaranteed)?\b/gi,
  /\bsensitive\s+skin\s+(?:&|and)\s+stomach\s+guaranteed\b/gi,
  /\bfor\s+digestion\s+immune\s+system\s+(?:&|and)\s+organ\s+health\b/gi,
  /\bcalcium\s+(?:&|and)\s+phosphorus\s+for\s+strong\s+bones\b/gi,
  /\bformulated\s+to\s+support\s+whole\s+body\s+health\s+(?:&|and)\s+vitality\b/gi,
  /\bproactive\s*5[\s\S]{0,120}?\bskin\s*(?:&|and)\s*coat\b/gi,
];
const MATCH_STOP_WORDS = new Set([
  "adult",
  "and",
  "cat",
  "dog",
  "dry",
  "food",
  "for",
  "formula",
  "free",
  "grain",
  "in",
  "of",
  "recipe",
  "the",
  "with",
  "wet",
]);
const LABEL_GENERIC_TERMS = new Set([
  "adult",
  "bag",
  "breed",
  "can",
  "cat",
  "dog",
  "dry",
  "food",
  "formula",
  "fresh",
  "health",
  "kitten",
  "large",
  "medium",
  "nutrition",
  "puppy",
  "recipe",
  "small",
  "toy",
  "wet",
]);
const VERIFIED_INGREDIENT_STATUSES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
]);
const VERIFIED_IMAGE_STATUSES = new Set([
  "official",
  "manufacturer",
  "retailer_verified",
]);
const LABEL_REQUIRED_MATCH_TERMS = new Set([
  "adult",
  "senior",
  "puppy",
  "kitten",
  "small",
  "toy",
  "large",
  "weight",
  "indoor",
  "hairball",
  "sensitive",
  "digestive",
  "digestion",
  "perfect",
  "urinary",
  "mobility",
  "joint",
  "skin",
  "coat",
  "ancient",
  "grains",
  "grain",
  "free",
  "95",
  "hydrolyzed",
  "vegetarian",
  "plant",
  "salmon",
  "chicken",
  "beef",
  "turkey",
  "lamb",
  "duck",
  "fish",
  "game",
  "goat",
  "whitefish",
  "ocean",
  "tuna",
  "trout",
  "venison",
  "insect",
  "bison",
  "broth",
  "crab",
  "pollock",
  "cod",
  "liver",
  "mackerel",
  "mousse",
  "sole",
  "shrimp",
  "prawn",
  "prawns",
  "pumpkin",
  "quail",
  "rabbit",
  "sardine",
  "sardines",
  "seabass",
  "tilapia",
  "cluster",
  "clusters",
  "dehydrated",
  "cuts",
  "gravy",
  "loaf",
  "minced",
  "morsels",
  "oatmeal",
  "pate",
  "pat",
  "paté",
  "rice",
  "shreds",
  "stew",
  "stews",
  "potato",
  "sweet",
  "wholemade",
  "prime",
  "rib",
  "filet",
  "mignon",
  "giblets",
  "blend",
  "core",
  "cravings",
  "freshdried",
  "gourmet",
  "harvest",
  "mixers",
  "peakboost",
  "prescription",
  "rawmix",
  "reserve",
  "science",
  "superfoods",
  "prairie",
  "wild",
  "wilderness",
]);
const NON_ADULT_LIFE_STAGE_TERMS = new Set([
  "puppy",
  "kitten",
  "senior",
  "mature",
]);
const SEARCH_TEXTURE_EQUIVALENTS = {
  gravy: ["sauce"],
  loaf: ["pate", "mousse"],
  mousse: ["pate", "loaf"],
  morsels: ["dry", "kibble"],
  pat: ["pate", "loaf", "mousse"],
  pate: ["loaf", "mousse"],
  sauce: ["gravy"],
  stew: ["stews"],
  stews: ["stew"],
};
const PRIMARY_RECIPE_TERMS = new Set([
  "beef",
  "bison",
  "chicken",
  "cod",
  "crab",
  "duck",
  "fish",
  "goat",
  "insect",
  "lamb",
  "liver",
  "mackerel",
  "pollock",
  "quail",
  "rabbit",
  "salmon",
  "sardine",
  "sardines",
  "seabass",
  "shrimp",
  "sole",
  "tilapia",
  "trout",
  "tuna",
  "turkey",
  "venison",
  "whitefish",
]);
const LABEL_VARIANT_CONFLICT_TERMS = new Set([
  ...PRIMARY_RECIPE_TERMS,
  "95",
  "adult",
  "ancient",
  "blend",
  "broth",
  "coat",
  "core",
  "cravings",
  "cuts",
  "dehydrated",
  "digestive",
  "digestion",
  "free",
  "freshdried",
  "game",
  "giant",
  "gourmet",
  "grains",
  "grain",
  "gravy",
  "hairball",
  "harvest",
  "hydrolyzed",
  "indoor",
  "joint",
  "kitten",
  "large",
  "loaf",
  "mature",
  "medium",
  "minced",
  "mixers",
  "mobility",
  "morsels",
  "mousse",
  "pate",
  "peakboost",
  "perfect",
  "plant",
  "prairie",
  "prescription",
  "puppy",
  "rawmix",
  "reserve",
  "sauce",
  "science",
  "senior",
  "sensitive",
  "shreds",
  "skin",
  "small",
  "stew",
  "stews",
  "superfoods",
  "topper",
  "toppers",
  "toy",
  "treat",
  "treats",
  "urinary",
  "vegetarian",
  "weight",
  "wild",
  "wilderness",
]);
const LABEL_BRAND_NOISE_TERMS = new Set([
  "food",
  "foods",
  "nutrition",
  "pet",
  "pets",
]);
const NON_COMPLETE_FOOD_PATTERNS = [
  { pattern: /\b(treat|treats)\b/i, reason: "Pet treats are not complete pet food." },
  { pattern: /\b(topper|toppers)\b/i, reason: "Food toppers are not complete pet food." },
  { pattern: /\b(meal\s+mixers?|raw\s+boost\s+mixers?|mixers?)\b/i, reason: "Meal mixers are not complete pet food." },
  { pattern: /\b(daily\s+boosters?|bone\s+broth\s+boosters?)\b/i, reason: "Meal boosters are not complete pet food." },
  { pattern: /\bhealthy\s+cravings\b/i, reason: "Meal complements are not complete pet food." },
  { pattern: /\b(perfect\s+)?complement\s+to\b/i, reason: "Meal complements are not complete pet food." },
  { pattern: /\b(supplement|supplements)\b/i, reason: "Supplements are not complete pet food." },
];
const CATALOG_SEARCH_CANONICAL_TERMS = new Set([
  ...LABEL_REQUIRED_MATCH_TERMS,
  "acana",
  "balance",
  "bil",
  "blue",
  "buffalo",
  "canidae",
  "canin",
  "cesar",
  "chewy",
  "crave",
  "diamond",
  "diet",
  "eukanuba",
  "fancy",
  "farm",
  "farmina",
  "feast",
  "friskies",
  "freshpet",
  "fromm",
  "gold",
  "goodbowl",
  "goodgut",
  "hill",
  "hills",
  "honest",
  "iams",
  "instinct",
  "jac",
  "jinx",
  "kirkland",
  "lotus",
  "meow",
  "merrick",
  "minichunks",
  "mix",
  "natural",
  "nourish",
  "nulo",
  "nutro",
  "open",
  "orijen",
  "pedigree",
  "plan",
  "pro",
  "proactive",
  "purina",
  "royal",
  "science",
  "sheba",
  "simply",
  "solid",
  "stella",
  "taste",
  "tiki",
  "victor",
  "wellness",
  "weruva",
  "whole",
  "wholehearted",
  "wild",
]);
const CATALOG_SEARCH_PHRASE_ALIASES = new Map([
  ["advanced edge", "advantedge"],
  ["hills", "hill s"],
  ["pro pln", "pro plan"],
  ["whole hearted", "wholehearted"],
]);
const LABEL_RELAXED_RECIPE_NOISE = new Set([
  "broth",
  "cuts",
  "dehydrated",
  "filet",
  "gravy",
  "loaf",
  "minced",
  "morsels",
  "mousse",
  "pate",
  "shreds",
  "stew",
  "stews",
]);
const SEARCH_RELAXED_NOISE = new Set([
  "adult",
  "and",
  "cage",
  "cat",
  "cats",
  "dog",
  "dogs",
  "dry",
  "food",
  "foods",
  "formula",
  "free",
  "grain",
  "in",
  "natural",
  "recipe",
  "savory",
  "the",
  "wet",
  "with",
]);

function editDistance(leftValue, rightValue) {
  const left = String(leftValue || "");
  const right = String(rightValue || "");
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const distances = Array.from(
    { length: left.length + 1 },
    (_, leftIndex) => Array.from(
      { length: right.length + 1 },
      (_, rightIndex) => leftIndex === 0 ? rightIndex : leftIndex,
    ),
  );

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      distances[leftIndex][rightIndex] = Math.min(
        distances[leftIndex][rightIndex - 1] + 1,
        distances[leftIndex - 1][rightIndex] + 1,
        distances[leftIndex - 1][rightIndex - 1] + substitutionCost,
      );

      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        distances[leftIndex][rightIndex] = Math.min(
          distances[leftIndex][rightIndex],
          distances[leftIndex - 2][rightIndex - 2] + 1,
        );
      }
    }
  }

  return distances[left.length][right.length];
}

function correctCatalogSearchToken(token) {
  if (token.length < 4 || /^\d+$/.test(token) || CATALOG_SEARCH_CANONICAL_TERMS.has(token)) {
    return token;
  }

  const maxDistance = token.length <= 6 ? 1 : 2;
  let bestTerm = token;
  let bestDistance = Number.POSITIVE_INFINITY;
  let tied = false;

  for (const candidate of CATALOG_SEARCH_CANONICAL_TERMS) {
    if (candidate[0] !== token[0]) continue;
    if (Math.abs(candidate.length - token.length) > maxDistance) continue;

    const distance = editDistance(token, candidate);
    if (distance > maxDistance) continue;
    if (distance < bestDistance) {
      bestTerm = candidate;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance && candidate !== bestTerm) {
      tied = true;
    }
  }

  return tied ? token : bestTerm;
}

export function correctCatalogSearchQuery(value) {
  const normalizedOriginal = normalizeText(value);
  if (!normalizedOriginal) {
    return { query: "", corrected: false, corrections: [] };
  }

  const corrections = [];
  let original = normalizedOriginal;
  for (const [phrase, replacement] of CATALOG_SEARCH_PHRASE_ALIASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "g");
    if (!pattern.test(original)) continue;
    original = original.replace(pattern, replacement);
    corrections.push({ from: phrase, to: replacement });
  }
  const correctedTokens = original.split(" ").map((token) => {
    const correctedToken = correctCatalogSearchToken(token);
    if (correctedToken !== token) {
      corrections.push({ from: token, to: correctedToken });
    }
    return correctedToken;
  });
  const query = correctedTokens.join(" ");

  return {
    query,
    corrected: corrections.length > 0,
    corrections,
  };
}

function textureSearchFallbackQueries(value) {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  const fallbacks = [];

  tokens.forEach((token, tokenIndex) => {
    for (const replacement of SEARCH_TEXTURE_EQUIVALENTS[token] || []) {
      const variant = [...tokens];
      variant[tokenIndex] = replacement;
      fallbacks.push(variant.join(" "));
    }
  });

  return [...new Set(fallbacks)].slice(0, 3);
}

function relaxedCatalogSearchQueries(value) {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  if (tokens.length < 3) return [];

  const variants = [];
  const detailMarker = tokens.findIndex((token) => token === "with" || token === "in");
  if (detailMarker >= 3) variants.push(tokens.slice(0, detailMarker).join(" "));

  const identityTokens = tokens.filter((token) => (
    !SEARCH_RELAXED_NOISE.has(token)
    && !/^\d+(?:\.\d+)?$/.test(token)
    && !/^(?:lb|lbs|oz|ounce|ounces|pound|pounds|ct|count)$/.test(token)
  ));
  if (identityTokens.length >= 2) variants.push(identityTokens.join(" "));

  const expandedVariants = variants.flatMap((query) => [
    query,
    ...textureSearchFallbackQueries(query),
  ]);

  return [...new Set(expandedVariants.map(compact))]
    .filter((query) => query.length >= 2 && normalizeText(query) !== normalizeText(value))
    .slice(0, 3);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nonCompleteFoodReason(value) {
  const identity = compact(
    typeof value === "string"
      ? value
      : labelIdentityText(value || {})
  );
  if (!identity) return "";
  return NON_COMPLETE_FOOD_PATTERNS.find(({ pattern }) => pattern.test(identity))?.reason || "";
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function collapseRepeatedIdentityText(value) {
  const tokens = compact(value).split(" ").filter(Boolean);
  if (tokens.length < 2) return tokens.join(" ");

  let changed = true;
  while (changed) {
    changed = false;
    const maxWidth = Math.min(6, Math.floor(tokens.length / 2));
    for (let width = maxWidth; width >= 1 && !changed; width -= 1) {
      for (let index = 0; index + width * 2 <= tokens.length; index += 1) {
        const left = normalizeText(tokens.slice(index, index + width).join(" "));
        const right = normalizeText(tokens.slice(index + width, index + width * 2).join(" "));
        if (!left || left !== right) continue;
        tokens.splice(index + width, width);
        changed = true;
        break;
      }
    }
  }

  return tokens.join(" ");
}

function barcodeVariants(value) {
  const digits = compact(value).replace(/\D/g, "");
  if (!digits) return [];

  const variants = new Set([digits]);
  if (digits.length === 12) variants.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith("0")) variants.add(digits.slice(1));
  return [...variants];
}

function imageOrNull(value) {
  const url = compact(value);
  if (!url || /^data:/i.test(url)) return null;
  return url;
}

function detectPetType(product = {}) {
  if (product.petType === "dog" || product.petType === "cat") return product.petType;
  if (product.pet_type === "dog" || product.pet_type === "cat") return product.pet_type;

  const text = [
    product.productName,
    product.product_name,
    product.brand,
    product.brands,
    product.categories,
    Array.isArray(product.categories_tags) ? product.categories_tags.join(" ") : "",
  ].map(compact).join(" ").toLowerCase();

  if (text.includes("dog") || text.includes("chien")) return "dog";
  if (text.includes("cat") || text.includes("chat")) return "cat";
  return "unknown";
}

function normalizePetType(value) {
  const normalized = compact(value).toLowerCase();
  return normalized === "dog" || normalized === "cat" ? normalized : null;
}

function firstCompact(...values) {
  return values.map(compact).find(Boolean) || "";
}

function petTypeFromQuery(query) {
  const text = normalizeText(query);
  if (/\b(dog|puppy|canine)\b/.test(text)) return "dog";
  if (/\b(cat|kitten|feline)\b/.test(text)) return "cat";
  return null;
}

function catalogIdentitySearchQuery(query) {
  return compact(
    String(query || "").replace(/\b(?:dogs?|cats?|canines?|felines?)\b/gi, " ")
  );
}

function catalogIdentitySearchQueries(query) {
  const baseQuery = catalogIdentitySearchQuery(query);
  if (!baseQuery) return [];

  const tokens = baseQuery.split(/\s+/).filter(Boolean);
  const morphology = {
    bite: "bites",
    bites: "bite",
    cluster: "clusters",
    clusters: "cluster",
    grain: "grains",
    grains: "grain",
    stew: "stews",
    stews: "stew",
  };
  const morphologyIndexes = tokens
    .map((token, index) => (morphology[normalizeText(token)] ? index : -1))
    .filter((index) => index >= 0);
  const variants = morphologyIndexes.length > 0
    ? [tokens.filter((_, index) => !morphologyIndexes.includes(index)).join(" "), baseQuery]
    : [baseQuery];
  tokens.forEach((token, index) => {
    const replacement = morphology[normalizeText(token)];
    if (!replacement) return;
    const variant = [...tokens];
    variant[index] = replacement;
    variants.push(variant.join(" "));
  });

  return [...new Map(variants.map((variant) => [normalizeText(variant), variant])).values()]
    .slice(0, 4);
}

function ingredientsFromRow(row = {}) {
  if (Array.isArray(row.ingredients)) {
    return row.ingredients.map(compact).filter(Boolean);
  }
  return [];
}

function ingredientsFromOpff(product = {}) {
  if (!Array.isArray(product.ingredients)) return [];
  return product.ingredients
    .map((ingredient) => {
      if (typeof ingredient === "string") return compact(ingredient);
      return compact(ingredient?.text);
    })
    .filter(Boolean);
}

function ingredientTextFromProduct(product = {}) {
  return compact(
    product.ingredientsText ||
    product.ingredientText ||
    product.ingredients_text ||
    product.ingredients_text_en ||
    ingredientsFromOpff(product).join(", ")
  );
}

function nutrientObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim().startsWith("{")) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function nutrientNumber(value) {
  if (value == null || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
  const parsed = typeof value === "string" ? Number.parseFloat(value.replace(/[% ,]/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasNumericNutrientFields(value = {}) {
  const n = nutrientObject(value);
  return [n.protein, n.crudeProtein, n.crude_protein, n.proteins_100g, n.fat, n.crudeFat, n.crude_fat, n.fat_100g,
    n.fiber, n.crudeFiber, n.crude_fiber, n.fiber_100g, n.moisture, n.moisture_100g, n.calcium,
    n.calciumPercent, n.calcium_percent, n.calcium_100g, n.phosphorus, n.phosphorusPercent,
    n.phosphorus_percent, n.phosphorus_100g].some((item) => nutrientNumber(item) != null);
}

function hasTypicalAnalysisProvenance(root = {}, candidate = {}) {
  const source = nutrientObject(root.publishedAnalysisSource || root.published_analysis_source || candidate.publishedAnalysisSource || candidate.published_analysis_source);
  const label = compact(candidate.publisherLabel || candidate.publisher_label || source.publisherLabel || source.publisher_label).toLowerCase();
  const type = compact(source.analysisType || source.analysis_type).toLowerCase();
  const explicitLabel = /\b(?:typical|actual|average nutrient|laboratory)\b/.test(label);
  return explicitLabel || (compact(source.status).toLowerCase() === "extracted"
    && /\b(?:typical|actual|average nutrient|laboratory)\b/.test(`${label} ${type}`)
    && Boolean(compact(source.sourceUrl || source.source_url)));
}

function normalizeNutriments(product = {}) {
  const direct = nutrientObject(product.nutriments);
  const nutritionalInfo = nutrientObject(product.nutritionalInfo || product.nutritional_info);
  const panel = nutrientObject(product.nutrientPanel || product.nutrient_panel);
  const root = Object.keys(direct).length ? direct : Object.keys(nutritionalInfo).length ? nutritionalInfo : panel;
  const typical = nutrientObject(root.typicalAnalysis || root.typical_analysis || root.actualAnalysis || root.actual_analysis);
  const dryMatter = nutrientObject(root.dryMatter || root.dry_matter);
  const guaranteed = nutrientObject(root.guaranteedAnalysis || root.guaranteed_analysis);
  const typicalCandidate = Object.keys(typical).length ? typical : dryMatter;
  const provenanceRoot = { ...panel, ...nutritionalInfo, ...root };
  const hasTypicalProvenance = hasTypicalAnalysisProvenance(provenanceRoot, Object.keys(typicalCandidate).length ? typicalCandidate : root);
  const n = Object.keys(typicalCandidate).length ? typicalCandidate : Object.keys(guaranteed).length ? guaranteed : hasNumericNutrientFields(root) ? root : {};
  const explicitType = compact(n.analysisType || n.analysis_type || root.analysisType || root.analysis_type || product.analysisType || product.analysis_type);
  const explicitTypeIsTypical = /\b(?:typical|actual|average nutrient|laboratory)\b/i.test(explicitType);
  const inferredAnalysisType = hasTypicalProvenance ? "typical" : Object.keys(guaranteed).length && hasNumericNutrientFields(guaranteed) ? "guaranteed" : null;
  const inferredBasis = Object.keys(dryMatter).length && hasNumericNutrientFields(dryMatter) ? "dry_matter"
    : Object.keys(guaranteed).length && hasNumericNutrientFields(guaranteed) ? "as_fed" : null;
  return {
    protein: n.protein ?? n.crudeProtein ?? n.crude_protein ?? n.proteins_100g ?? n.proteins ?? null,
    fat: n.fat ?? n.crudeFat ?? n.crude_fat ?? n.fat_100g ?? null,
    fiber: n.fiber ?? n.crudeFiber ?? n.crude_fiber ?? n.fiber_100g ?? n["crude-fiber_100g"] ?? null,
    moisture: n.moisture ?? n.moisture_100g ?? root.moisture ?? null,
    ash: n.ash ?? n.ash_100g ?? root.ash ?? null,
    calcium: n.calcium ?? n.calciumPercent ?? n.calcium_percent ?? n.calcium_100g ?? null,
    phosphorus: n.phosphorus ?? n.phosphorusPercent ?? n.phosphorus_percent ?? n.phosphorus_100g ?? null,
    energy: n.energy ?? n["energy-kcal_100g"] ?? n.energy_100g ?? null,
    analysisType: explicitTypeIsTypical && !hasTypicalProvenance ? null : explicitType || inferredAnalysisType,
    basis:
      n.basis
      || n.valueBasis
      || n.value_basis
      || n.analysisBasis
      || n.analysis_basis
      || root.basis
      || root.valueBasis
      || root.value_basis
      || root.analysisBasis
      || root.analysis_basis
      || product.basis || product.valueBasis || product.value_basis || product.analysisBasis || product.analysis_basis
      || inferredBasis,
  };
}

function productIdentityText(product = {}) {
  return [
    product.brand,
    product.productLine,
    product.productName,
    product.flavor,
    product.lifeStage,
    product.foodForm,
    product.packageSize,
    product.gtin || product.barcode,
  ].map(compact).filter(Boolean).join(" ");
}

function labelIdentityText(identification = {}) {
  return [
    identification.brand,
    identification.productLine,
    identification.productName,
    identification.flavor,
    identification.lifeStage,
    identification.foodForm,
    identification.packageSize,
    identification.searchQuery,
    identification.notes,
  ].map(compact).filter(Boolean).join(" ");
}

function stripLabelMarketingBenefitClaims(value) {
  let identityText = String(value || "");
  for (const pattern of LABEL_MARKETING_BENEFIT_PATTERNS) {
    identityText = identityText.replace(pattern, " ");
  }
  return compact(identityText);
}

export function stripPackageSizeTokens(value) {
  return compact(String(value || "")
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:-|–|—)?\s*(?:lb|lbs|pound|pounds|oz|ounce|ounces|kg|kilograms?|g|grams?|ct|count|pack|packs|cans?|pouches?)\b/gi,
      " "
    )
    .replace(/\b(?:bag|box|case)\b/gi, " ")
    .replace(/\s+/g, " "));
}

function normalizeLabelIdentification(identification = {}) {
  const normalized = {
    ...identification,
    identityEvidence: Array.isArray(identification.identityEvidence)
      ? identification.identityEvidence.map(compact).filter(Boolean).slice(0, 6)
      : [],
    marketingClaims: Array.isArray(identification.marketingClaims)
      ? identification.marketingClaims.map(compact).filter(Boolean).slice(0, 4)
      : [],
  };
  for (const field of [
    "brand",
    "productLine",
    "productName",
    "flavor",
    "lifeStage",
    "foodForm",
    "packageSize",
    "searchQuery",
  ]) {
    normalized[field] = collapseRepeatedIdentityText(
      stripLabelMarketingBenefitClaims(normalized[field])
    );
  }
  normalized.searchQuery = labelSearchQuery(normalized)
    || collapseRepeatedIdentityText(identification.searchQuery);
  return normalized;
}

function labelSearchQuery(identification = {}) {
  const productName = stripPackageSizeTokens(identification.productName);
  const brand = compact(identification.brand);
  const identityParts = [];
  if (brand && !normalizeText(productName).includes(normalizeText(brand))) {
    identityParts.push(brand);
  }
  if (productName) identityParts.push(productName);

  for (const value of [identification.productLine, identification.flavor, identification.lifeStage]) {
    const part = stripPackageSizeTokens(value);
    if (!part) continue;
    const currentIdentity = normalizeText(identityParts.join(" "));
    const normalizedPart = normalizeText(part);
    if (currentIdentity.includes(normalizedPart)) continue;
    identityParts.push(part);
  }

  // Package size and form help confirm a variant after retrieval, but including
  // them here hides valid catalog rows when the photographed SKU size differs.
  return identityParts.join(" ") || [brand, compact(identification.productLine), compact(identification.flavor)]
    .filter(Boolean)
    .join(" ");
}

function labelCoreSearchQuery(identification = {}) {
  const brand = compact(identification.brand);
  const productName = stripPackageSizeTokens(identification.productName);
  if (!productName) return [brand, compact(identification.productLine)].filter(Boolean).join(" ");
  return brand && !normalizeText(productName).includes(normalizeText(brand))
    ? `${brand} ${productName}`
    : productName;
}

function labelRecipeSearchQuery(identification = {}) {
  const brandAndLine = [identification.brand, identification.productLine]
    .map(compact)
    .filter(Boolean)
    .join(" ");
  const recipeTerms = [];
  const seen = new Set();

  for (const token of normalizeText([
    identification.productName,
    identification.flavor,
    identification.lifeStage,
  ].map(compact).filter(Boolean).join(" ")).split(" ")) {
    if (!LABEL_REQUIRED_MATCH_TERMS.has(token) || token === "adult" || seen.has(token)) continue;
    seen.add(token);
    recipeTerms.push(token);
  }

  return [brandAndLine, recipeTerms.join(" ")].filter(Boolean).join(" ");
}

function labelRelaxedRecipeSearchQuery(identification = {}) {
  const brand = compact(identification.brand);
  const recipeTerms = [];
  const seen = new Set();

  for (const token of normalizeText([
    identification.productName,
    identification.flavor,
    identification.lifeStage,
  ].map(compact).filter(Boolean).join(" ")).split(" ")) {
    if (
      !LABEL_REQUIRED_MATCH_TERMS.has(token) ||
      token === "adult" ||
      LABEL_RELAXED_RECIPE_NOISE.has(token) ||
      seen.has(token)
    ) continue;
    seen.add(token);
    recipeTerms.push(token);
  }

  return [brand, recipeTerms.join(" ")].filter(Boolean).join(" ");
}

function labelSearchQueries(identification = {}) {
  const queries = [
    labelSearchQuery(identification),
    labelCoreSearchQuery(identification),
    labelRecipeSearchQuery(identification),
    labelRelaxedRecipeSearchQuery(identification),
  ].map(stripPackageSizeTokens).filter((query) => query.length >= 2);

  return [...new Map(queries.map((query) => [normalizeText(query), query])).values()];
}

function dedupeKey(product = {}) {
  return compact(product.cacheKey || product.cache_key)
    || compact(product.gtin || product.barcode || product.code || product._id)
    || normalizeText(productIdentityText(product));
}

function formulaDedupeKey(product = {}) {
  // Package sizes remain separate GTINs for barcode lookup, but should not
  // crowd a name or label search when official evidence proves the formula is
  // identical. Do not use a fuzzy ingredient comparison here: a changed label
  // must remain a separate recipe until it is reconciled.
  const verifiedIngredientSignature = productHasVerifiedIngredients(product)
    ? normalizeText(product.ingredientsText || product.ingredientText || product.ingredient_text)
    : "";

  if (verifiedIngredientSignature) {
    const formulaIdentity = [
      product.brand,
      product.petType,
      product.foodForm,
      product.lifeStage,
      adultAgeBand(product),
      verifiedIngredientSignature,
    ].map(compact).filter(Boolean).join(" ");
    return normalizeText(formulaIdentity);
  }

  const productIdentity = [
    product.brand,
    product.productLine,
    product.productName,
    product.flavor,
    product.lifeStage,
    product.foodForm,
    product.packageSize,
    product.petType,
  ].map(compact).filter(Boolean).join(" ");

  return normalizeText(productIdentity) || dedupeKey(product);
}

function expandPackageSizeValue(value) {
  const normalized = compact(value);
  if (!normalized || !normalized.includes(",")) return normalized ? [normalized] : [];

  const parts = normalized.split(",").map(compact).filter(Boolean);
  const isPackageSizeList = parts.length > 1 && parts.every((part) => (
    /^\d+(?:\.\d+)?(?:\s*(?:lb|lbs|oz|kg|g|ct|count))?$/i.test(part)
  ));
  return isPackageSizeList ? parts : [normalized];
}

function packageSizesForProduct(product = {}) {
  const values = [
    ...(Array.isArray(product.availablePackageSizes) ? product.availablePackageSizes : []),
    product.packageSize,
  ].flatMap(expandPackageSizeValue).filter(Boolean);

  return [...new Map(values.map((size) => [normalizeText(size), size])).values()];
}

function normalizedPackageSizeSignals(value) {
  const signals = String(value || "").match(
    /\b\d+(?:\.\d+)?\s*(?:lb|lbs|pound|pounds|oz|ounce|ounces|kg|kilograms?|g|grams?|ct|count|pack|packs|cans?|pouches?)\b/gi
  ) || [];
  return new Set(signals.map((signal) => normalizeText(signal)
    .replace(/\b(?:lbs|pounds)\b/g, "lb")
    .replace(/\bounces\b/g, "oz")
    .replace(/\bkilograms?\b/g, "kg")
    .replace(/\bgrams?\b/g, "g")
    .replace(/\bcounts?\b/g, "ct")
    .replace(/\bpacks\b/g, "pack")
    .replace(/\bcans\b/g, "can")
    .replace(/\bpouches\b/g, "pouch")));
}

function packageSizeMatchScore(product = {}, lookupProduct = {}) {
  const identityComparison = compareLabelIdentities(lookupProduct, product);
  if (identityComparison.reasonCodes.includes("package_size_form_conflict")) return -1;
  const requested = normalizedPackageSizeSignals(lookupProduct.packageSize);
  if (requested.size === 0) return 0;
  const available = new Set(packageSizesForProduct(product)
    .flatMap((size) => [...normalizedPackageSizeSignals(size)]));
  if (available.size === 0) return 0;
  return [...requested].some((size) => available.has(size)) ? 1 : -0.15;
}

function mergeFormulaPackageSizes(primary = {}, duplicate = {}) {
  const availablePackageSizes = packageSizesForProduct(primary);
  const knownSizes = new Set(availablePackageSizes.map(normalizeText));

  for (const size of packageSizesForProduct(duplicate)) {
    if (knownSizes.has(normalizeText(size))) continue;
    knownSizes.add(normalizeText(size));
    availablePackageSizes.push(size);
  }

  return availablePackageSizes.length > 1
    ? { ...primary, availablePackageSizes }
    : primary;
}

function tokenSet(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !MATCH_STOP_WORDS.has(token))
  );
}

function requiredMatchTokenSet(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function tokenHasEquivalent(token, candidateTokens) {
  if (candidateTokens.has(token)) return true;
  if ((SEARCH_TEXTURE_EQUIVALENTS[token] || []).some((term) => candidateTokens.has(term))) {
    return true;
  }

  const equivalents = {
    cluster: ["clusters"],
    clusters: ["cluster"],
    digestive: ["digestion"],
    digestion: ["digestive"],
    grain: ["grains"],
    grains: ["grain"],
    mixer: ["mixers"],
    mixers: ["mixer"],
    stew: ["stews"],
    stews: ["stew"],
  };

  return (equivalents[token] || []).some((term) => candidateTokens.has(term));
}

function inferredFoodForm(product = {}) {
  const text = normalizeText(productIdentityText(product));
  if (!text) return "";
  const forms = new Set();
  if (/\b(freeze dried|freeze|freshdried|dehydrated|air dried)\b/.test(text)) forms.add("freeze_dried");
  if (/\b(wet|canned|can|pate|pat|loaf|mousse|stew|stews|gravy|sauce|entree|classic ground|chunks in gravy|chunks in sauce|prime cuts|slices in gravy|slices in sauce|pouch|tray|tub|cup|cups)\b/.test(text)) forms.add("wet");
  if (/\b(dry|kibble|clusters|minichunks)\b/.test(text)) forms.add("dry");
  if (/\b(fresh|refrigerated|frozen)\b/.test(text)) forms.add("fresh");
  return forms.size === 1 ? [...forms][0] : "";
}

function labelBrandCompatible(catalogProduct = {}, lookupProduct = {}) {
  const lookupConsumerBrand = consumerBrandForIdentity(lookupProduct);
  const catalogConsumerBrand = consumerBrandForIdentity(catalogProduct);
  if (lookupConsumerBrand && catalogConsumerBrand) {
    if (
      lookupConsumerBrand === "purina_parent"
      || catalogConsumerBrand === "purina_parent"
    ) {
      return false;
    }
    return lookupConsumerBrand === catalogConsumerBrand;
  }

  const lookupBrandTokens = [...requiredMatchTokenSet(lookupProduct.brand)]
    .filter((token) => !LABEL_BRAND_NOISE_TERMS.has(token));
  if (lookupBrandTokens.length === 0) return true;

  const catalogIdentityTokens = requiredMatchTokenSet(productIdentityText(catalogProduct));
  return lookupBrandTokens.every((token) => catalogIdentityTokens.has(token));
}

function hasNoConflictingCandidateVariantTerms(catalogProduct = {}, lookupProduct = {}) {
  const catalogTokens = requiredMatchTokenSet(productIdentityText(catalogProduct));
  const lookupTokens = requiredMatchTokenSet(productIdentityText(lookupProduct));
  const lookupHasPrimaryRecipe = [...PRIMARY_RECIPE_TERMS].some((term) => lookupTokens.has(term));
  const lookupShowsSeniorIdentity = lookupTokens.has("senior")
    || lookupTokens.has("mature")
    || /\badult\s+(?:7|11)\b/.test(normalizeText(productIdentityText(lookupProduct)));

  for (const token of catalogTokens) {
    if (!LABEL_VARIANT_CONFLICT_TERMS.has(token)) continue;
    if (tokenHasEquivalent(token, lookupTokens)) continue;
    if (PRIMARY_RECIPE_TERMS.has(token) && !lookupHasPrimaryRecipe) continue;
    if (
      (token === "senior" || token === "mature")
      && lookupShowsSeniorIdentity
    ) {
      continue;
    }
    if (token === "adult" && ![...NON_ADULT_LIFE_STAGE_TERMS].some((term) => lookupTokens.has(term))) {
      continue;
    }

    return false;
  }

  return true;
}

function distinctiveLabelTokenCount(identification = {}) {
  const brandTokens = tokenSet(identification.brand);
  const distinctiveTokens = new Set(normalizeText(labelIdentityText(identification))
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => (
      token.length >= 3 &&
      !MATCH_STOP_WORDS.has(token) &&
      !LABEL_GENERIC_TERMS.has(token) &&
      !brandTokens.has(token)
    )));

  return distinctiveTokens.size;
}

function overlapScore(leftValue, rightValue) {
  const left = tokenSet(leftValue);
  const right = tokenSet(rightValue);
  if (left.size === 0 || right.size === 0) return 0;

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }

  return overlap / Math.max(left.size, right.size);
}

function productHasMinimumIngredients(product = {}) {
  return Boolean(product.ingredientsText || product.ingredientCount >= 5);
}

function productHasSourceEvidence(product = {}) {
  return Boolean(compact(product.sourceUrl || product.source_url));
}

function productHasVerifiedIngredients(product = {}) {
  if (!productHasMinimumIngredients(product)) return false;
  if (!productHasSourceEvidence(product)) return false;

  const status = compact(product.ingredientVerificationStatus || product.ingredient_verification_status).toLowerCase();
  if (!status) return false;
  return VERIFIED_INGREDIENT_STATUSES.has(status);
}

function productHasDisplayImage(product = {}) {
  return Boolean(imageOrNull(product.imageUrl));
}

function productHasVerifiedImage(product = {}) {
  if (!productHasDisplayImage(product)) return false;
  const status = compact(product.imageVerificationStatus || product.image_verification_status).toLowerCase();
  return VERIFIED_IMAGE_STATUSES.has(status);
}

function hasRequiredLabelTerms(catalogProduct = {}, lookupProduct = {}) {
  const catalogTokens = requiredMatchTokenSet(productIdentityText(catalogProduct));
  const lookupTokens = requiredMatchTokenSet(productIdentityText(lookupProduct));

  for (const token of lookupTokens) {
    if (!LABEL_REQUIRED_MATCH_TERMS.has(token)) continue;
    if (tokenHasEquivalent(token, catalogTokens)) continue;
    if (token === "adult") {
      const hasNonAdultLifeStage = [...NON_ADULT_LIFE_STAGE_TERMS].some((term) => catalogTokens.has(term));
      if (!hasNonAdultLifeStage) continue;
    }
    if (token === "senior" && (catalogTokens.has("mature") || catalogTokens.has("7"))) continue;
    if (token === "mature" && (catalogTokens.has("senior") || catalogTokens.has("7"))) continue;

    return false;
  }

  return true;
}

function strongProductMatch(catalogProduct, lookupProduct) {
  if (!catalogProduct || !lookupProduct) return false;
  const catalogCode = compact(catalogProduct.gtin || catalogProduct.barcode);
  const lookupCode = compact(lookupProduct.gtin || lookupProduct.barcode);
  if (catalogCode && lookupCode && catalogCode === lookupCode) {
    return true;
  }

  const petType = lookupProduct.petType === "dog" || lookupProduct.petType === "cat"
    ? lookupProduct.petType
    : null;
  if (petType && catalogProduct.petType !== petType && catalogProduct.petType !== "unknown") {
    return false;
  }

  const brandScore = overlapScore(catalogProduct.brand, lookupProduct.brand);
  const nameScore = overlapScore(catalogProduct.productName, lookupProduct.productName);
  const combinedScore = overlapScore(
    productIdentityText(catalogProduct),
    productIdentityText(lookupProduct) || `${lookupProduct.brand} ${lookupProduct.productName}`
  );

  return (
    (brandScore >= 0.34 && nameScore >= 0.5) ||
    (brandScore >= 0.5 && combinedScore >= 0.52) ||
    combinedScore >= 0.72
  );
}

function strongLabelProductMatch(catalogProduct, lookupProduct) {
  if (!catalogProduct || !lookupProduct) return false;
  const lookupPetType = normalizePetType(lookupProduct.petType);
  if (lookupPetType && !matchesPetType(catalogProduct, lookupPetType, { allowUnknown: false })) return false;
  if (!labelBrandCompatible(catalogProduct, lookupProduct)) return false;
  const lookupConsumerBrand = consumerBrandForIdentity(lookupProduct);
  const catalogConsumerBrand = consumerBrandForIdentity(catalogProduct);
  const lookupTokens = requiredMatchTokenSet(productIdentityText(lookupProduct));
  const catalogTokens = requiredMatchTokenSet(productIdentityText(catalogProduct));
  const hasSharedPrimaryRecipe = [...PRIMARY_RECIPE_TERMS].some((term) => (
    lookupTokens.has(term) && catalogTokens.has(term)
  ));
  const hasExactStructuredPackageIdentity = Boolean(
    lookupConsumerBrand
    && lookupConsumerBrand !== "purina_parent"
    && lookupConsumerBrand === catalogConsumerBrand
    && packageSizeMatchScore(catalogProduct, lookupProduct) === 1
    && hasSharedPrimaryRecipe
  );
  const hasStrongIdentity = strongProductMatch(catalogProduct, lookupProduct)
    || overlapScore(catalogProduct.productName, lookupProduct.productName) >= 0.45
    || overlapScore(productIdentityText(catalogProduct), productIdentityText(lookupProduct)) >= 0.55
    || hasExactStructuredPackageIdentity;
  if (!hasStrongIdentity) return false;
  if (!hasRequiredLabelTerms(catalogProduct, lookupProduct)) return false;
  if (!hasNoConflictingCandidateVariantTerms(catalogProduct, lookupProduct)) return false;
  if (!compareLabelIdentities(lookupProduct, catalogProduct, {
    requireVisibleCandidateVariants: true,
  }).compatible) return false;

  const lookupFoodForm = inferredFoodForm(lookupProduct);
  const catalogFoodForm = inferredFoodForm(catalogProduct);
  if (lookupFoodForm && catalogFoodForm && lookupFoodForm !== catalogFoodForm) return false;

  const lookupIdentity = productIdentityText(lookupProduct);
  const lookupIdentityTokens = tokenSet(lookupIdentity);
  if (
    !hasExactStructuredPackageIdentity
    && lookupIdentityTokens.size >= 3
    && overlapScore(productIdentityText(catalogProduct), lookupIdentity) < 0.45
  ) {
    return false;
  }

  return true;
}

function labelCandidateMatchScore(product = {}, lookupProduct = {}) {
  const brandScore = overlapScore(productIdentityText(product), lookupProduct.brand);
  const nameScore = overlapScore(product.productName, lookupProduct.productName);
  const lineScore = overlapScore(product.productLine, lookupProduct.productLine);
  const flavorScore = overlapScore(product.flavor || product.productName, lookupProduct.flavor);
  const identityScore = overlapScore(productIdentityText(product), productIdentityText(lookupProduct));
  const sizeScore = packageSizeMatchScore(product, lookupProduct);

  return (
    brandScore * 0.2 +
    nameScore * 0.38 +
    lineScore * 0.12 +
    flavorScore * 0.15 +
    identityScore * 0.15 +
    sizeScore * 0.18
  );
}

export function filterLabelCandidatesForIdentification(identification = {}, products = []) {
  if (!identification?.found) return [];
  const lookupProduct = {
    brand: identification.brand || "",
    productName: identification.productName || identification.searchQuery || "",
    productLine: identification.productLine || "",
    flavor: identification.flavor || "",
    lifeStage: identification.lifeStage || "",
    foodForm: identification.foodForm || "",
    packageSize: identification.packageSize || "",
    petType: identification.petType || "unknown",
  };

  return (Array.isArray(products) ? products : [])
    .filter((product) => strongLabelProductMatch(product, lookupProduct))
    .map((product) => ({
      ...product,
      labelMatchScore: labelCandidateMatchScore(product, lookupProduct),
      labelPackageSizeMatch: packageSizeMatchScore(product, lookupProduct),
    }))
    .sort((left, right) => (
      Number(right.labelMatchScore || 0) - Number(left.labelMatchScore || 0) ||
      Number(right.rank || 0) - Number(left.rank || 0)
    ));
}

function strongImageMatch(catalogProduct, imageProduct) {
  if (!catalogProduct || !imageProduct?.imageUrl) return false;
  const catalogCode = compact(catalogProduct.gtin || catalogProduct.barcode);
  const imageCode = compact(imageProduct.gtin || imageProduct.barcode);
  if (catalogCode && imageCode && catalogCode === imageCode) {
    return true;
  }

  return strongProductMatch(catalogProduct, imageProduct);
}

function normalizeCatalogProduct(raw = {}, sourceKind = "catalog") {
  const row = raw.product || raw;
  const productName = compact(row.productName || row.product_name || row.product_name_en || row.product_name);
  const brand = compact(row.brand || row.brands);
  const ingredients = sourceKind === "opff" ? ingredientsFromOpff(row) : ingredientsFromRow(row);
  const ingredientsText = sourceKind === "opff"
    ? ingredientTextFromProduct(row)
    : compact(row.ingredientText || row.ingredient_text || ingredients.join(", "));
  const nutritionalInfo = row.nutritionalInfo || row.nutritional_info || null;
  const formulaEvidenceTier = firstCompact(
    row.formulaEvidenceTier,
    row.formula_evidence_tier,
    nutritionalInfo?.formula_evidence_tier
  );
  const formulaVersionProvenance =
    row.formulaVersionProvenance
    || row.formula_version_provenance
    || nutritionalInfo?.formula_version_provenance
    || null;

  const product = {
    id: row.id || row.cache_key || row.code || row._id || `${sourceKind}:${dedupeKey({ brand, productName })}`,
    cacheKey: compact(row.cacheKey || row.cache_key || normalizeText(productName)),
    gtin: firstCompact(row.gtin, row.barcode, row.code, row._id),
    barcode: firstCompact(row.barcode, row.gtin, row.code, row._id),
    productName,
    brand,
    productLine: firstCompact(row.productLine, row.product_line, row.line),
    flavor: firstCompact(row.flavor, row.flavour, row.recipe),
    lifeStage: firstCompact(row.lifeStage, row.life_stage, row.lifestage),
    foodForm: firstCompact(row.foodForm, row.food_form, row.form, row.format),
    packageSize: firstCompact(row.packageSize, row.package_size, row.pack_size, row.size, row.net_weight),
    availablePackageSizes: Array.isArray(row.availablePackageSizes || row.available_package_sizes)
      ? [...new Map((row.availablePackageSizes || row.available_package_sizes)
        .map(compact)
        .filter(Boolean)
        .map((size) => [normalizeText(size), size])).values()]
      : [],
    petType: detectPetType({ ...row, productName, brand }),
    imageUrl: imageOrNull(row.imageUrl || row.image_url || row.image_front_url),
    ingredientCount: Number(row.ingredientCount ?? row.ingredient_count ?? ingredients.length) || 0,
    ingredients,
    ingredientsText,
    nutriments: normalizeNutriments(row),
    nutritionalInfo,
    nutrientPanel: row.nutrientPanel || row.nutrient_panel || null,
    hasPublishedNutrients: row.hasPublishedNutrients ?? row.has_published_nutrients ?? false,
    source: compact(row.source) || (sourceKind === "opff" ? "open_pet_food_facts" : "woof_catalog"),
    sourceQuality: compact(row.sourceQuality || row.source_quality) || (sourceKind === "opff" ? "community" : "unknown"),
    ingredientVerificationStatus: compact(row.ingredientVerificationStatus || row.ingredient_verification_status) || (sourceKind === "opff" ? "community" : ""),
    imageVerificationStatus: compact(row.imageVerificationStatus || row.image_verification_status) || (
      imageOrNull(row.imageUrl || row.image_url || row.image_front_url)
        ? (sourceKind === "opff" ? "community" : "")
        : "unverified"
    ),
    verifiedAt: compact(row.verifiedAt || row.verified_at),
    sourceUrl: compact(row.sourceUrl || row.source_url || row.url),
    formulaEvidenceTier,
    formulaVersionProvenance,
    rank: Number(row.rank) || 0,
    sourceKind,
  };

  return {
    ...product,
    verificationState: catalogVerificationState(product),
    catalogQualityState: catalogVerificationState(product).state,
  };
}

function parseFormulaVersionProvenance(product = {}) {
  const raw = product.formulaVersionProvenance
    || product.formula_version_provenance
    || product.nutritionalInfo?.formula_version_provenance
    || product.nutritional_info?.formula_version_provenance
    || null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function productRequiresExactPackageVersionForLabel(product = {}) {
  const provenance = parseFormulaVersionProvenance(product);
  const gtinPolicy = normalizeText(provenance.gtin_resolution_policy);
  const frontLabelPolicy = normalizeText(provenance.front_label_resolution_policy);
  return provenance.manufacturer_version_conflict === true
    || provenance.front_label_version_collision === true
    || gtinPolicy === "abstain on version conflict"
    || frontLabelPolicy === "safe abstain require barcode or ingredient panel";
}

function formulaEvidencePriority(product = {}) {
  switch (compact(product.formulaEvidenceTier)) {
    case "manufacturer_current_exact":
      return 4;
    case "retailer_web_version":
      return 3;
    case "web_label_version":
      return 2;
    case "conflicted":
      return 0;
    default:
      return 1;
  }
}

function formulaEvidenceSearchBoost(product = {}) {
  switch (compact(product.formulaEvidenceTier)) {
    case "manufacturer_current_exact":
      return 3;
    case "retailer_web_version":
      return 1;
    case "web_label_version":
      return 0.5;
    default:
      return 0;
  }
}

function sortCatalogSearchProducts(products = []) {
  return [...products].sort((left, right) => (
    Number(right.labelPackageSizeMatch || 0) - Number(left.labelPackageSizeMatch || 0)
    || Number(right.labelMatchScore || 0) - Number(left.labelMatchScore || 0)
    ||
    (
      Number(right.rank || 0)
      + formulaEvidenceSearchBoost(right)
    ) - (
      Number(left.rank || 0)
      + formulaEvidenceSearchBoost(left)
    )
    || formulaEvidencePriority(right) - formulaEvidencePriority(left)
    || Number(right.ingredientCount || 0) - Number(left.ingredientCount || 0)
    || Date.parse(right.verifiedAt || 0) - Date.parse(left.verifiedAt || 0)
  ));
}

function isManufacturerCurrentFormula(product = {}) {
  if (compact(product.formulaEvidenceTier) === "manufacturer_current_exact") return true;
  const sourceQuality = normalizeText(product.sourceQuality || product.source_quality);
  const ingredientStatus = normalizeText(
    product.ingredientVerificationStatus || product.ingredient_verification_status
  );
  return ["manufacturer", "official"].includes(sourceQuality)
    && ["manufacturer", "official"].includes(ingredientStatus);
}

function sameFrontLabelFormula(left = {}, right = {}) {
  const leftBrand = consumerBrandForIdentity(left);
  const rightBrand = consumerBrandForIdentity(right);
  if (!leftBrand || leftBrand === "purina_parent" || leftBrand !== rightBrand) return false;

  const leftPetType = normalizePetType(left.petType);
  const rightPetType = normalizePetType(right.petType);
  if (leftPetType && rightPetType && leftPetType !== rightPetType) return false;
  if (productRequiresExactPackageVersionForLabel(left)) return false;
  if (productRequiresExactPackageVersionForLabel(right)) return false;

  const leftFormulaKey = productFormulaKey(left);
  const rightFormulaKey = productFormulaKey(right);
  if (
    leftFormulaKey
    && rightFormulaKey
    && leftFormulaKey === rightFormulaKey
    && leftFormulaKey.split("|").length >= 4
  ) {
    return true;
  }

  const forward = compareLabelIdentities(left, right, {
    requireVisibleCandidateVariants: true,
  });
  const reverse = compareLabelIdentities(right, left, {
    requireVisibleCandidateVariants: true,
  });
  if (!forward.compatible || !reverse.compatible) return false;

  const agreements = new Set([...forward.agreementFields, ...reverse.agreementFields]);
  if (!agreements.has("consumer_brand")) return false;
  if (!agreements.has("recipe") && !agreements.has("product_line")) return false;

  return overlapScore(productIdentityText(left), productIdentityText(right)) >= 0.5;
}

export function collapseFrontLabelSourceVersions(products = []) {
  const sorted = sortCatalogSearchProducts(Array.isArray(products) ? products : []);
  const currentFormulas = sorted.filter(isManufacturerCurrentFormula);
  if (currentFormulas.length === 0) return sorted;

  const consumed = new Set();
  const collapsed = [];
  for (const product of currentFormulas) {
    const currentKey = dedupeKey(product);
    if (consumed.has(currentKey)) continue;
    let current = product;
    consumed.add(currentKey);
    for (const candidate of sorted) {
      const candidateKey = dedupeKey(candidate);
      if (consumed.has(candidateKey)) continue;
      if (!sameFrontLabelFormula(current, candidate)) continue;
      current = Number(candidate.labelPackageSizeMatch || 0) > Number(current.labelPackageSizeMatch || 0)
        ? mergeFormulaPackageSizes(candidate, current)
        : mergeFormulaPackageSizes(current, candidate);
      consumed.add(candidateKey);
    }
    collapsed.push(current);
  }

  for (const product of sorted) {
    const key = dedupeKey(product);
    if (consumed.has(key)) continue;
    collapsed.push(product);
    consumed.add(key);
  }

  return sortCatalogSearchProducts(collapsed);
}

export function collapseCatalogSearchSourceVersions(products = []) {
  const sorted = sortCatalogSearchProducts(Array.isArray(products) ? products : []);
  const grouped = new Map();

  for (const product of sorted) {
    const formulaKey = productFormulaKey(product);
    const canGroup = formulaKey && formulaKey.split("|").length >= 4;
    const groupKey = canGroup ? formulaKey : `row:${dedupeKey(product)}`;
    const group = grouped.get(groupKey) || [];
    group.push(product);
    grouped.set(groupKey, group);
  }

  const collapsed = [];
  for (const group of grouped.values()) {
    const currentVersions = group.filter(isManufacturerCurrentFormula);
    const currentIngredientSignatures = new Set(
      currentVersions
        .map((product) => normalizeText(product.ingredientsText || product.ingredientText))
        .filter(Boolean)
    );

    // Two competing manufacturer-current statements are a real formula
    // conflict. Preserve both until evidence reconciles them.
    if (currentVersions.length === 0 || currentIngredientSignatures.size > 1) {
      collapsed.push(...group);
      continue;
    }

    let primary = sortCatalogSearchProducts(currentVersions)[0];
    const retained = [];
    for (const candidate of group) {
      if (candidate === primary) continue;
      if (productRequiresExactPackageVersionForLabel(candidate)) {
        retained.push(candidate);
        continue;
      }
      primary = mergeFormulaPackageSizes(primary, candidate);
    }
    collapsed.push(primary, ...retained);
  }

  return sortCatalogSearchProducts(collapsed);
}

function exactBarcodeVersionKey(product = {}) {
  return normalizeText([
    product.brand,
    product.petType,
    product.productLine,
    product.flavor,
    product.lifeStage,
    product.foodForm,
    product.ingredientsText,
  ].map(compact).filter(Boolean).join(" "));
}

function pickExactBarcodeVersion(products = []) {
  const scorable = filterScorableCatalogResults(products);
  if (scorable.length === 0) return null;

  const uniqueProducts = [
    ...new Map(
      scorable.map((product) => [
        compact(product.cacheKey || product.gtin || product.barcode),
        product,
      ])
    ).values(),
  ];
  const versionKeys = new Set(uniqueProducts.map(exactBarcodeVersionKey).filter(Boolean));

  // GTINs can be reused after a recipe change. A barcode alone cannot choose
  // between incompatible ingredient versions, so require package-photo
  // confirmation instead of silently preferring one version.
  if (versionKeys.size !== 1) return null;

  return sortCatalogSearchProducts(uniqueProducts)[0] || null;
}

function matchesPetType(product, petType, { allowUnknown = true } = {}) {
  if (!petType) return true;
  if (product.petType === petType) return true;
  return allowUnknown && product.petType === "unknown";
}

function filterByPetType(products = [], petType, options) {
  return products.filter((product) => matchesPetType(product, petType, options));
}

function hasRequiredQueryTerms(product = {}, queryText = "") {
  const productTokens = requiredMatchTokenSet(productIdentityText(product));
  const queryTokens = requiredMatchTokenSet(queryText);

  for (const token of queryTokens) {
    if (!LABEL_REQUIRED_MATCH_TERMS.has(token)) continue;
    if (tokenHasEquivalent(token, productTokens)) continue;
    if (token === "adult") {
      const hasNonAdultLifeStage = [...NON_ADULT_LIFE_STAGE_TERMS].some((term) => productTokens.has(term));
      if (!hasNonAdultLifeStage) continue;
    }

    return false;
  }

  return true;
}

function filterByRequiredQueryTerms(products = [], queryText = "") {
  return products.filter((product) => hasRequiredQueryTerms(product, queryText));
}

export function filterVerifiedLabelCatalogResults(products = [], queryText = "") {
  return products.filter((product) => (
    product?.sourceKind === "catalog" &&
    catalogProductIsVerifiedReady(product, { queryText })
  ));
}

function filterScorableCatalogResults(products = [], queryText = "") {
  return filterVerifiedLabelCatalogResults(products, queryText)
    .filter((product) => Number(product.rank || 0) >= MIN_SCORABLE_CATALOG_RANK);
}

function hasSpeciesAmbiguousLabelMatches(identification = {}, matches = []) {
  if (normalizePetType(identification.petType)) return false;

  const petTypes = new Set(
    matches
      .map((product) => normalizePetType(product.petType))
      .filter(Boolean)
  );

  return petTypes.size > 1;
}

function productWithVerificationState(product = {}, queryText = "") {
  if (!product) return null;
  const verificationState = catalogVerificationState(product, { queryText });
  return {
    ...product,
    verificationState,
    catalogQualityState: verificationState.state,
  };
}

function productsWithVerificationState(products = [], queryText = "") {
  return (Array.isArray(products) ? products : [])
    .map((product) => productWithVerificationState(product, queryText))
    .filter(Boolean);
}

function resolverStatus({ type, identification, products, selectedProduct }) {
  const isLabelResolution = type === "label" || type === "label_text";
  if (isLabelResolution && identification?.excluded) return CATALOG_QUALITY_STATES.EXCLUDED;
  if (isLabelResolution && identification?.found === false) return "label_not_readable";
  if (selectedProduct?.verificationState?.readyToScore) return CATALOG_QUALITY_STATES.VERIFIED_READY;
  if (products.some((product) => product.verificationState?.readyToScore)) {
    return isLabelResolution ? CATALOG_QUALITY_STATES.AMBIGUOUS_VARIANT : CATALOG_QUALITY_STATES.VERIFIED_READY;
  }
  if (products.length > 0) {
    return products[0].verificationState?.state || CATALOG_QUALITY_STATES.IDENTITY_ONLY;
  }
  if (isLabelResolution && identification?.found) return CATALOG_QUALITY_STATES.NEEDS_INGREDIENTS;
  return "not_found";
}

function buildResolveProductResult({
  type,
  query,
  searchedQuery = query,
  identification = null,
  products = [],
  selectedProduct = null,
  confidence = null,
  stageTimings = null,
} = {}) {
  const verificationQuery = compact(searchedQuery || query);
  // Catalog evidence quality is independent from how a user worded the
  // lookup. Variant ambiguity belongs to the resolver, not the product row.
  const verifiedProducts = productsWithVerificationState(products);
  const selected = selectedProduct
    ? productWithVerificationState(selectedProduct)
    : null;
  const status = resolverStatus({
    type,
    identification,
    products: verifiedProducts,
    selectedProduct: selected,
  });

  return {
    type,
    status,
    confidence: confidence ?? identification?.confidence ?? (selected ? 1 : 0),
    query: compact(query),
    searchedQuery: verificationQuery,
    queryWasCorrected: normalizeText(query) !== normalizeText(verificationQuery),
    identification,
    products: verifiedProducts,
    selectedProduct: selected,
    recommendedProduct: selected,
    stageTimings,
    verificationState: selected?.verificationState || verifiedProducts[0]?.verificationState || {
      state: status,
      label: status === CATALOG_QUALITY_STATES.EXCLUDED
        ? "Not a complete food"
        : status === "not_found"
          ? "No verified match"
          : "Verification needed",
      readyToScore: false,
      gaps: status === CATALOG_QUALITY_STATES.EXCLUDED
        ? ["excluded"]
        : status === "not_found"
          ? ["not_found"]
          : ["unverified_ingredients"],
    },
  };
}

function mergeProducts(primary = [], secondary = [], limit = DEFAULT_LIMIT, petType = null) {
  const seenGtins = new Set();
  const seenFormulas = new Set();
  const formulaIndex = new Map();
  const merged = [];

  for (const product of [...primary, ...secondary]) {
    if (!product?.productName) continue;
    if (!matchesPetType(product, petType)) continue;

    const gtinKeys = barcodeVariants(product.gtin || product.barcode);
    const formulaKey = formulaDedupeKey(product);
    const isDuplicate = gtinKeys.some((key) => seenGtins.has(key))
      || seenFormulas.has(formulaKey);

    if (!formulaKey) continue;
    if (seenFormulas.has(formulaKey)) {
      const existingIndex = formulaIndex.get(formulaKey);
      if (existingIndex !== undefined) {
        merged[existingIndex] = mergeFormulaPackageSizes(merged[existingIndex], product);
      }
      continue;
    }
    if (isDuplicate) continue;
    gtinKeys.forEach((key) => seenGtins.add(key));
    seenFormulas.add(formulaKey);
    formulaIndex.set(formulaKey, merged.length);
    merged.push(product);
    if (merged.length >= limit) break;
  }

  return merged;
}

function rpcFunctionUnavailable(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "PGRST202"
    || code === "42883"
    || /function .* does not exist|could not find the function/i.test(message);
}

function catalogRequestError(message, name = "Error") {
  const error = new Error(message);
  error.name = name;
  return error;
}

async function runCatalogRpc(functionName, args, {
  signal,
  timeoutMs = CATALOG_RPC_TIMEOUT_MS,
} = {}) {
  if (signal?.aborted) throw catalogRequestError("Catalog request aborted", "AbortError");

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener?.("abort", onAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await supabase
      .rpc(functionName, args)
      .abortSignal(controller.signal);

    if (timedOut) {
      throw catalogRequestError(`${functionName} timed out after ${timeoutMs}ms`, "TimeoutError");
    }
    if (signal?.aborted) {
      throw catalogRequestError("Catalog request aborted", "AbortError");
    }
    return response;
  } catch (error) {
    if (timedOut) {
      throw catalogRequestError(`${functionName} timed out after ${timeoutMs}ms`, "TimeoutError");
    }
    if (signal?.aborted || controller.signal.aborted) {
      throw catalogRequestError("Catalog request aborted", "AbortError");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

async function searchWoofCatalog(query, limit, {
  signal,
  allowLegacyFallback = true,
  timeoutMs = CATALOG_RPC_TIMEOUT_MS,
} = {}) {
  const normalizedQuery = compact(query);
  if (/^[0-9]{8,14}$/.test(normalizedQuery)) {
    const { data: skuData, error: skuError } = await runCatalogRpc(
      "resolve_verified_product_by_gtin",
      {
        q: normalizedQuery,
        max_results: limit,
      },
      { signal, timeoutMs }
    );
    if (!skuError && (skuData || []).length > 0) {
      return (skuData || []).map((row) => normalizeCatalogProduct(row, "catalog"));
    }
    if (skuError) {
      if (!rpcFunctionUnavailable(skuError)) throw skuError;
      logger.debug(
        "[CATALOG] Barcode RPC unavailable; falling back to verified search:",
        skuError.message
      );
    }
  }

  const params = {
    q: normalizedQuery,
    max_results: limit,
  };

  const { data, error } = await runCatalogRpc(
    "search_verified_products",
    params,
    { signal, timeoutMs }
  );

  if (!error) {
    return sortCatalogSearchProducts(
      (data || []).map((row) => normalizeCatalogProduct(row, "catalog"))
    );
  }

  if (!allowLegacyFallback || !rpcFunctionUnavailable(error)) throw error;

  logger.debug("[CATALOG] Verified search RPC unavailable; using legacy search:", error.message);
  const { data: fallbackData, error: fallbackError } = await runCatalogRpc(
    "search_products",
    params,
    { signal, timeoutMs }
  );

  if (fallbackError) {
    throw fallbackError;
  }

  return sortCatalogSearchProducts(
    (fallbackData || []).map((row) => normalizeCatalogProduct(row, "catalog"))
  );
}

async function searchWoofCatalogFuzzy(query, limit, { signal } = {}) {
  const { data, error } = await runCatalogRpc(
    "search_products",
    { q: compact(query), max_results: limit },
    { signal, timeoutMs: CATALOG_RPC_TIMEOUT_MS }
  );
  if (error) {
    logger.debug("[CATALOG] Fuzzy fallback unavailable:", error.message);
    return [];
  }
  return sortCatalogSearchProducts(
    (data || []).map((row) => normalizeCatalogProduct(row, "catalog"))
  );
}

async function searchWoofCatalogForLabelOcr(ocrText, queries, limit, signal) {
  const startedAt = Date.now();
  const seenQueries = new Set();
  const boundedQueries = (Array.isArray(queries) ? queries : [])
    .map(compact)
    .filter((query) => {
      const key = normalizeText(query);
      if (query.length < 2 || !key || seenQueries.has(key)) return false;
      seenQueries.add(key);
      return true;
    })
    .slice(0, 4);
  if (boundedQueries.length === 0) {
    return {
      products: [],
      timings: {
        totalMs: Date.now() - startedAt,
        fallbackTriggered: false,
        fallbackReason: "no_query",
      },
    };
  }

  const canonicalOcrText = normalizeLabelOcrText(ocrText);
  const fastRpcStartedAt = Date.now();
  const { data, error } = await searchWoofCatalogLabelIdentities(
    boundedQueries,
    limit,
    signal
  );
  const fastRpcMs = Date.now() - fastRpcStartedAt;
  const fastRawCount = Array.isArray(data) ? data.length : 0;
  let fastGateMs = 0;
  let fastVisibleCandidateCount = 0;
  if (!error) {
    const fastGateStartedAt = Date.now();
    const fastCandidates = rankProductsForOcr(
      filterProductsForOcr(
        (data || []).map((row) => normalizeCatalogProduct(row, "catalog")),
        canonicalOcrText,
        { requireVisibleCandidateVariants: true }
      ),
      canonicalOcrText
    );
    fastGateMs = Date.now() - fastGateStartedAt;
    fastVisibleCandidateCount = fastCandidates.length;
    if (fastCandidates.length > 0) {
      return {
        products: fastCandidates,
        timings: {
          totalMs: Date.now() - startedAt,
          fastRpcMs,
          fastRawCount,
          fastGateMs,
          fastVisibleCandidateCount,
          fallbackTriggered: false,
          fallbackReason: null,
          fallbackQueryCount: 0,
          fallbackLookupWallMs: 0,
          fallbackLookupSerialEquivalentMs: 0,
          fallbackLookupSavedMs: 0,
        },
      };
    }
  } else if (!rpcFunctionUnavailable(error)) {
    throw error;
  }

  // Backward-compatible rollout path: at most two parallel indexed lookups.
  // Never revive the previous 4 + 1 + 1 + 12 concurrent request fan-out.
  const fallbackQueries = boundedQueries.slice(0, 2);
  const fallbackLookupStartedAt = Date.now();
  const fallbackLookups = await Promise.all(fallbackQueries.map(async (fallbackQuery) => {
    if (signal?.aborted) return { matches: [], latencyMs: 0 };
    const lookupStartedAt = Date.now();
    const matches = await searchWoofCatalog(fallbackQuery, 16, {
      signal,
      allowLegacyFallback: false,
      timeoutMs: LABEL_RPC_TIMEOUT_MS,
    });
    return {
      matches,
      latencyMs: Date.now() - lookupStartedAt,
    };
  }));
  const fallbackLookupWallMs = Date.now() - fallbackLookupStartedAt;
  const fallbackLookupSerialEquivalentMs = fallbackLookups.reduce(
    (total, lookup) => total + lookup.latencyMs,
    0
  );
  const fallbackCandidates = fallbackLookups.flatMap((lookup) => lookup.matches);
  const fallbackGateStartedAt = Date.now();
  const rankedFallbackCandidates = rankProductsForOcr(
    filterProductsForOcr(fallbackCandidates, canonicalOcrText, {
      requireVisibleCandidateVariants: true,
    }),
    canonicalOcrText
  );
  const fallbackGateMs = Date.now() - fallbackGateStartedAt;

  return {
    products: rankedFallbackCandidates.length > 0
      ? rankedFallbackCandidates
      : fallbackCandidates,
    timings: {
      totalMs: Date.now() - startedAt,
      fastRpcMs,
      fastRawCount,
      fastGateMs,
      fastVisibleCandidateCount,
      fallbackTriggered: true,
      fallbackReason: error ? "identity_rpc_unavailable" : "rank_floor_empty",
      fallbackQueryCount: fallbackQueries.length,
      fallbackIndividualMs: fallbackLookups.map((lookup) => lookup.latencyMs),
      fallbackRawCount: fallbackCandidates.length,
      fallbackGateMs,
      fallbackLookupWallMs,
      fallbackLookupSerialEquivalentMs,
      fallbackLookupSavedMs: Math.max(
        0,
        fallbackLookupSerialEquivalentMs - fallbackLookupWallMs
      ),
    },
  };
}

async function searchWoofCatalogForLabelIdentity(queries, limit, signal) {
  const startedAt = Date.now();
  const boundedQueries = (Array.isArray(queries) ? queries : [])
    .map(compact)
    .filter((query) => query.length >= 2)
    .slice(0, 4);
  if (boundedQueries.length === 0) {
    return {
      products: [],
      timings: { totalMs: Date.now() - startedAt, fallbackTriggered: false },
    };
  }

  const fastRpcStartedAt = Date.now();
  const { data, error } = await searchWoofCatalogLabelIdentities(
    boundedQueries,
    limit,
    signal
  );
  const fastRpcMs = Date.now() - fastRpcStartedAt;
  if (!error) {
    return {
      products: (data || []).map((row) => normalizeCatalogProduct(row, "catalog")),
      timings: {
        totalMs: Date.now() - startedAt,
        fastRpcMs,
        fastRawCount: Array.isArray(data) ? data.length : 0,
        fallbackTriggered: false,
      },
    };
  }
  if (!rpcFunctionUnavailable(error)) throw error;

  logger.debug("[CATALOG] Fast label search unavailable; using one direct lookup:", error.message);
  const fallbackStartedAt = Date.now();
  const products = await searchWoofCatalog(boundedQueries[0], Math.min(Math.max(limit, 1), 16), {
    signal,
    allowLegacyFallback: false,
    timeoutMs: LABEL_RPC_TIMEOUT_MS,
  });
  return {
    products,
    timings: {
      totalMs: Date.now() - startedAt,
      fastRpcMs,
      fastRawCount: Array.isArray(data) ? data.length : 0,
      fallbackTriggered: true,
      fallbackReason: "identity_rpc_unavailable",
      fallbackQueryCount: 1,
      fallbackLookupWallMs: Date.now() - fallbackStartedAt,
    },
  };
}

async function searchWoofCatalogLabelIdentities(queries, limit, signal) {
  const args = {
    queries,
    max_results: Math.min(Math.max(limit, 1), 32),
  };
  const identityResponse = await runCatalogRpc(
    LABEL_IDENTITY_RPC,
    args,
    { signal, timeoutMs: LABEL_RPC_TIMEOUT_MS }
  );
  if (!identityResponse.error) return identityResponse;
  if (!rpcFunctionUnavailable(identityResponse.error)) return identityResponse;

  // Backward-compatible only while the new migration propagates. This remains
  // one request, never the previous multi-query fan-out.
  logger.debug(
    "[CATALOG] Lightweight label identity RPC unavailable; using legacy label RPC:",
    identityResponse.error.message
  );
  return runCatalogRpc(
    LEGACY_LABEL_RPC,
    args,
    { signal, timeoutMs: LABEL_RPC_TIMEOUT_MS }
  );
}

export async function searchCatalogProducts(query, {
  limit = DEFAULT_LIMIT,
  signal,
  petType,
  useTextureSynonyms = false,
} = {}) {
  const term = compact(query);
  if (term.length < 2) return [];

  const correctedQuery = correctCatalogSearchQuery(term).query || term;
  const catalogLimit = Math.min(Math.max(limit, 1), 25);
  const targetPetType = normalizePetType(petType) || petTypeFromQuery(correctedQuery);
  const verifiedResultsForQuery = async (searchQuery, { relaxed = false } = {}) => {
    if (signal?.aborted) return [];
    const validationQuery = relaxed ? searchQuery : correctedQuery;
    const results = filterScorableCatalogResults(
      filterByRequiredQueryTerms(
        filterByPetType(
          await searchWoofCatalog(searchQuery, catalogLimit, { signal }),
          targetPetType
        ),
        validationQuery
      ),
      validationQuery
    );

    // Long shelf-label wording can contain garnish or texture text that is
    // absent from the official catalog title. The relaxed lookup retrieves by
    // the stable identity, then re-applies the strict label compatibility gate
    // so brand, species, form, protein, and meaningful variants still agree.
    return relaxed
      ? filterProductsForOcr(results, correctedQuery)
      : results;
  };

  let catalogResults = await verifiedResultsForQuery(correctedQuery);
  if (catalogResults.length === 0 && useTextureSynonyms && !signal?.aborted) {
    const fallbackQueries = textureSearchFallbackQueries(correctedQuery);
    if (fallbackQueries.length > 0) {
      const fallbackResults = await Promise.all(
        fallbackQueries.map((fallbackQuery) => verifiedResultsForQuery(fallbackQuery))
      );
      catalogResults = fallbackResults.flat();
    }
  }
  if (catalogResults.length === 0 && !signal?.aborted) {
    const relaxedQueries = relaxedCatalogSearchQueries(correctedQuery);
    if (relaxedQueries.length > 0) {
      const relaxedResults = await Promise.all(
        relaxedQueries.map((fallbackQuery) => verifiedResultsForQuery(
          fallbackQuery,
          { relaxed: true }
        ))
      );
      catalogResults = relaxedResults.flat();
    }
  }
  if (
    catalogResults.length === 0
    && normalizeText(correctedQuery) !== normalizeText(term)
    && !signal?.aborted
  ) {
    const fuzzyResults = await searchWoofCatalogFuzzy(term, catalogLimit, { signal });
    catalogResults = filterScorableCatalogResults(
      filterByRequiredQueryTerms(
        filterByPetType(fuzzyResults, targetPetType),
        correctedQuery
      ),
      correctedQuery
    );
  }

  // A typed formula name should show one shelf formula, not one card per
  // retailer/package record. Keep exact source versions in the catalog for
  // barcode resolution, but prefer the current manufacturer version when the
  // visible identity is compatible and no version-collision flag is present.
  return mergeProducts(
    collapseCatalogSearchSourceVersions(catalogResults),
    [],
    catalogLimit,
    targetPetType
  );
}

export async function resolveProduct({
  type,
  query,
  ocrLines,
  imageBase64,
  barcode,
  limit = DEFAULT_LIMIT,
  signal,
  petType,
  onIdentification,
} = {}) {
  if (type === "label_text") {
    const ocrText = compact(query);
    const packageOcrText = primaryPackageOcrText(ocrText, ocrLines);
    const searchQueries = labelOcrSearchQueries(ocrText, ocrLines);
    const targetPetType = normalizePetType(petType) || petTypeFromQuery(packageOcrText);
    const nonCompleteEvidence = evaluateNonCompleteFoodEvidence({
      text: ocrText,
      lines: ocrLines,
    });
    const exclusionReason = nonCompleteEvidence.confirmed
      ? nonCompleteEvidence.reason
      : "";

    if (exclusionReason) {
      return buildResolveProductResult({
        type,
        query: ocrText,
        identification: {
          found: true,
          excluded: true,
          exclusionReason,
          productName: "Pet food topper, mixer, treat, or supplement",
          petType: targetPetType || "unknown",
          confidence: 1,
          searchQuery: "",
          notes: exclusionReason,
          exclusionEvidence: nonCompleteEvidence.evidence,
          productCategory: nonCompleteEvidence.category,
        },
        products: [],
        confidence: 1,
      });
    }

    if (!ocrText || searchQueries.length === 0) {
      return buildResolveProductResult({
        type,
        query: ocrText,
        identification: { found: false, confidence: 0, searchQuery: "" },
        products: [],
        confidence: 0,
      });
    }

    const lookupStartedAt = Date.now();
    const labelLookup = signal?.aborted
      ? { products: [], timings: { totalMs: 0, aborted: true } }
      : await searchWoofCatalogForLabelOcr(packageOcrText, searchQueries, 48, signal);
    const candidateGateStartedAt = Date.now();
    const candidates = filterProductsForOcr(
      filterVerifiedLabelCatalogResults(
        filterByPetType(labelLookup.products, targetPetType)
      ),
      packageOcrText,
      { requireVisibleCandidateVariants: true }
    );
    const rankedCandidates = rankProductsForOcr(candidates, packageOcrText);
    const merged = mergeProducts(
      collapseFrontLabelSourceVersions(rankedCandidates),
      [],
      Math.min(Math.max(limit * 3, 20), 25),
      targetPetType
    );
    const ranked = merged.slice(0, limit);
    const selectedProduct = pickVerifiedProductForOcr(ranked, packageOcrText);
    const bestProduct = selectedProduct || ranked[0] || null;
    const searchedQuery = bestProduct
      ? [bestProduct.brand, bestProduct.productName].map(compact).filter(Boolean).join(" ")
      : searchQueries[0];
    const confidence = bestProduct?.ocrMatchScore || 0;
    const candidateGateMs = Date.now() - candidateGateStartedAt;
    const identification = bestProduct ? {
      found: true,
      confidence,
      brand: bestProduct.brand || "",
      productName: bestProduct.productName || "",
      productLine: bestProduct.productLine || "",
      flavor: bestProduct.flavor || "",
      lifeStage: bestProduct.lifeStage || "",
      foodForm: bestProduct.foodForm || "",
      packageSize: bestProduct.packageSize || "",
      petType: bestProduct.petType || targetPetType || "unknown",
      petTypeFromText: Boolean(targetPetType),
      searchQuery: searchedQuery,
      notes: selectedProduct
        ? "Matched from the front label on this device."
        : nonCompleteEvidence.status === "possible"
          ? "Woof saw non-complete-food wording but could not confirm it belongs to the centered product."
          : "Choose the matching package variant.",
      classificationStatus: nonCompleteEvidence.status,
      productCategory: nonCompleteEvidence.category,
      categoryEvidence: nonCompleteEvidence.evidence,
    } : {
      found: false,
      confidence: 0,
      petTypeFromText: Boolean(targetPetType),
      searchQuery: "",
    };

    return buildResolveProductResult({
      type,
      query: ocrText,
      searchedQuery,
      identification,
      products: ranked,
      selectedProduct,
      confidence,
      stageTimings: {
        ...labelLookup.timings,
        lookupAndGateMs: Date.now() - lookupStartedAt,
        candidateGateMs,
        preGateCandidateCount: labelLookup.products.length,
        postGateCandidateCount: ranked.length,
      },
    });
  }

  if (type === "label") {
    const rawIdentification = normalizeLabelIdentification(
      await identifyProductLabel(imageBase64, { signal })
    );
    try {
      onIdentification?.(rawIdentification);
    } catch (callbackError) {
      logger.debug("[CATALOG] Label identification callback failed:", callbackError?.message || callbackError);
    }
    const nonCompleteEvidence = evaluateNonCompleteFoodEvidence({
      identification: rawIdentification,
    });
    const exclusionReason = nonCompleteEvidence.confirmed
      ? nonCompleteEvidence.reason
      : "";
    const identification = exclusionReason
      ? {
        ...rawIdentification,
        excluded: true,
        exclusionReason,
        exclusionEvidence: nonCompleteEvidence.evidence,
        notes: exclusionReason,
      }
      : {
        ...rawIdentification,
        excluded: false,
        classificationStatus: nonCompleteEvidence.status,
      };
    const searchQueries = labelSearchQueries(identification);
    const searchQuery = searchQueries[0] || "";

    if (identification?.excluded) {
      return buildResolveProductResult({
        type,
        query: searchQuery,
        identification,
        products: [],
        confidence: identification?.confidence ?? 0,
      });
    }

    if (!searchQuery) {
      return buildResolveProductResult({
        type,
        query: "",
        identification,
        products: [],
        confidence: identification?.confidence ?? 0,
      });
    }

    const effectiveQuery = correctCatalogSearchQuery(searchQuery).query || searchQuery;
    const targetPetType = normalizePetType(identification?.petType);
    const lookupStartedAt = Date.now();
    const labelLookup = signal?.aborted
      ? { products: [], timings: { totalMs: 0, aborted: true } }
      : await searchWoofCatalogForLabelIdentity(searchQueries, 48, signal);
    const candidateGateStartedAt = Date.now();
    const candidates = filterVerifiedLabelCatalogResults(
      filterByPetType(labelLookup.products, targetPetType)
    );
    const strictCandidates = filterLabelCandidatesForIdentification(identification, candidates);
    const products = mergeProducts(
      collapseFrontLabelSourceVersions(strictCandidates),
      [],
      limit,
      targetPetType
    );
    const selectedProduct = pickVerifiedProductForIdentification(identification, products);
    const candidateGateMs = Date.now() - candidateGateStartedAt;

    return buildResolveProductResult({
      type,
      query: searchQuery,
      searchedQuery: effectiveQuery,
      identification,
      products,
      selectedProduct,
      confidence: identification?.confidence ?? 0,
      stageTimings: {
        ...labelLookup.timings,
        lookupAndGateMs: Date.now() - lookupStartedAt,
        candidateGateMs,
        preGateCandidateCount: labelLookup.products.length,
        postGateCandidateCount: products.length,
      },
    });
  }

  if (type === "barcode") {
    const product = await findVerifiedCatalogProductByBarcode(barcode, { signal });
    return buildResolveProductResult({
      type,
      query: barcode,
      products: product ? [product] : [],
      selectedProduct: product,
      confidence: product ? 1 : 0,
    });
  }

  const term = compact(query);
  const correctedQuery = correctCatalogSearchQuery(term).query || term;
  const products = await searchCatalogProducts(correctedQuery, {
    limit,
    signal,
    petType,
    useTextureSynonyms: true,
  });
  return buildResolveProductResult({
    type: "search",
    query: term,
    searchedQuery: correctedQuery,
    products,
    confidence: products.length > 0 ? 1 : 0,
  });
}

export async function getCatalogProduct(cacheKey, { signal } = {}) {
  const key = compact(cacheKey);
  if (!key) return null;
  if (signal?.aborted) return null;

  const cached = catalogProductCache.get(key);
  if (cached) {
    if ((Date.now() - cached.cachedAt) <= CATALOG_PRODUCT_CACHE_TTL_MS) {
      // Refresh insertion order so the bounded map behaves as an LRU cache.
      catalogProductCache.delete(key);
      catalogProductCache.set(key, cached);
      return cached.product;
    }
    catalogProductCache.delete(key);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener?.("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), CATALOG_RPC_TIMEOUT_MS);
  let data;
  let error;
  try {
    ({ data, error } = await supabase
      .from("product_data")
      .select("cache_key, product_name, brand, gtin, product_line, flavor, life_stage, food_form, package_size, pet_type, ingredients, ingredient_text, ingredient_count, nutritional_info, nutrient_panel, has_published_nutrients, source, source_quality, ingredient_verification_status, image_verification_status, verified_at, source_url, image_url, formula_evidence_tier, formula_version_provenance")
      .eq("cache_key", key)
      .abortSignal(controller.signal)
      .maybeSingle());
  } catch (requestError) {
    logger.debug("[CATALOG] getCatalogProduct request failed:", requestError?.message || requestError);
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.("abort", onAbort);
  }

  if (error) {
    logger.debug("[CATALOG] getCatalogProduct error:", error.message);
    return null;
  }

  if (!data) return null;

  const product = normalizeCatalogProduct(data, "catalog");
  catalogProductCache.set(key, { product, cachedAt: Date.now() });
  while (catalogProductCache.size > CATALOG_PRODUCT_CACHE_MAX_ENTRIES) {
    catalogProductCache.delete(catalogProductCache.keys().next().value);
  }
  return product;
}

export async function findVerifiedCatalogProductByBarcode(barcode, { signal } = {}) {
  const variants = barcodeVariants(barcode);
  if (variants.length === 0) return null;
  if (signal?.aborted) return null;

  const products = [];
  for (const variant of variants) {
    if (signal?.aborted) return null;
    const matches = await searchWoofCatalog(variant, 8, { signal });
    for (const product of matches) {
      const productBarcodes = barcodeVariants(product.gtin || product.barcode);
      if (!productBarcodes.some((candidate) => variants.includes(candidate))) continue;
      products.push(product);
    }
  }

  return pickExactBarcodeVersion(products);
}

export async function findVerifiedCatalogProductForLookup(lookupProduct, { signal, limit = 8 } = {}) {
  const searchQuery = compact(productIdentityText(lookupProduct));
  if (searchQuery.length < 3) return null;

  if (signal?.aborted) return null;

  const targetPetType = normalizePetType(lookupProduct?.petType) || petTypeFromQuery(searchQuery);
  const catalogResults = filterByPetType(
    await searchWoofCatalog(searchQuery, Math.min(Math.max(limit, 1), 12), { signal }),
    targetPetType
  );

  if (signal?.aborted) return null;

  const match = filterVerifiedCatalogMatchesForLookup(lookupProduct, catalogResults)[0] || null;

  if (!match) return null;
  if (match.imageUrl || !lookupProduct?.imageUrl || !strongImageMatch(match, lookupProduct)) {
    return match;
  }

  return {
    ...match,
    imageUrl: lookupProduct.imageUrl,
    imageSource: lookupProduct.source || "open_pet_food_facts",
    imageFallback: true,
  };
}

export function filterVerifiedCatalogMatchesForLookup(lookupProduct, catalogResults = []) {
  return (Array.isArray(catalogResults) ? catalogResults : []).filter((product) => (
    product.sourceKind === "catalog" &&
    productHasVerifiedIngredients(product) &&
    productHasVerifiedImage(product) &&
    strongProductMatch(product, lookupProduct) &&
    labelBrandCompatible(product, lookupProduct) &&
    hasRequiredLabelTerms(product, lookupProduct) &&
    hasNoConflictingCandidateVariantTerms(product, lookupProduct) &&
    compareLabelIdentities(lookupProduct, product, {
      requireVisibleCandidateVariants: true,
    }).compatible
  ));
}

export function pickVerifiedProductForIdentification(identification, products = []) {
  if (!identification?.found) return null;
  if (Number(identification.confidence || 0) < LABEL_AUTO_OPEN_CONFIDENCE) return null;
  if (distinctiveLabelTokenCount(identification) < 2) return null;

  const lookupProduct = {
    brand: identification.brand || "",
    productName: identification.productName || identification.searchQuery || "",
    productLine: identification.productLine || "",
    flavor: identification.flavor || "",
    lifeStage: identification.lifeStage || "",
    foodForm: identification.foodForm || "",
    packageSize: identification.packageSize || "",
    petType: identification.petType || "unknown",
  };

  const candidates = Array.isArray(products)
    ? products.slice(0, LABEL_AUTO_OPEN_CANDIDATE_COUNT)
    : [];

  const matches = candidates.filter((product) => (
    product?.sourceKind === "catalog" &&
    productHasVerifiedIngredients(product) &&
    productHasVerifiedImage(product) &&
    strongLabelProductMatch(product, lookupProduct) &&
    compareLabelIdentities(lookupProduct, product, {
      requireVisibleCandidateVariants: true,
    }).compatible
  ));

  if (hasSpeciesAmbiguousLabelMatches(identification, matches)) return null;
  if (matches.some(productRequiresExactPackageVersionForLabel)) return null;
  if (matches.length > 1) return null;

  return matches[0] || null;

}

export async function identifyLabelAndSearch(base64Image, { signal, limit = DEFAULT_LIMIT } = {}) {
  const result = await resolveProduct({
    type: "label",
    imageBase64: base64Image,
    signal,
    limit,
  });

  return {
    identification: result.identification,
    products: result.products,
    recommendedProduct: result.selectedProduct,
    status: result.status,
    confidence: result.confidence,
    verificationState: result.verificationState,
  };
}

export function catalogProductToVerifiedProduct(product = {}) {
  const ingredients = Array.isArray(product.ingredients)
    ? product.ingredients.map((ingredient) => (
      typeof ingredient === "string"
        ? { id: "", text: ingredient, percent: null }
        : ingredient
    ))
    : [];

  const verifiedProduct = {
    id: product.id || null,
    cacheKey: product.cacheKey || product.cache_key || "",
    productName: product.productName,
    brand: product.brand,
    gtin: product.gtin || product.barcode || "",
    productLine: product.productLine || "",
    flavor: product.flavor || "",
    lifeStage: product.lifeStage || "",
    foodForm: product.foodForm || "",
    packageSize: product.packageSize || "",
    petType: product.petType || "unknown",
    barcode: product.barcode || "",
    ingredientsText: product.ingredientsText || product.ingredientText || product.ingredients?.join(", ") || "",
    ingredients,
    nutriments: normalizeNutriments(product),
    nutritionalInfo: product.nutritionalInfo || product.nutritional_info || null,
    nutrientPanel: product.nutrientPanel || product.nutrient_panel || null,
    hasPublishedNutrients: product.hasPublishedNutrients === true || product.has_published_nutrients === true,
    analysisType: product.analysisType || product.analysis_type || product.nutriments?.analysisType || product.nutriments?.analysis_type || null,
    basis: product.basis || product.valueBasis || product.value_basis || product.analysisBasis || product.analysis_basis || product.nutriments?.basis || null,
    nutriscoreGrade: product.nutriscoreGrade || null,
    novaGroup: product.novaGroup || null,
    imageUrl: product.imageUrl || product.image_url || null,
    source: product.source || null,
    sourceQuality: product.sourceQuality || product.source_quality || null,
    ingredientVerificationStatus: product.ingredientVerificationStatus || product.ingredient_verification_status || null,
    imageVerificationStatus: product.imageVerificationStatus || product.image_verification_status || null,
    verifiedAt: product.verifiedAt || product.verified_at || null,
    sourceUrl: product.sourceUrl || product.source_url || null,
    sourceKind: product.sourceKind || "catalog",
    ingredientCount: Number(product.ingredientCount || product.ingredient_count || ingredients.length) || 0,
    availablePackageSizes: Array.isArray(product.availablePackageSizes || product.available_package_sizes) ? product.availablePackageSizes || product.available_package_sizes : [],
    isCompleteFood: product.isCompleteFood ?? product.is_complete_food ?? true,
    catalogExclusionReason: product.catalogExclusionReason || product.catalog_exclusion_reason || "",
    formulaEvidenceTier: product.formulaEvidenceTier || product.formula_evidence_tier || product.nutritionalInfo?.formula_evidence_tier || product.nutritional_info?.formula_evidence_tier || null,
    formulaVersionProvenance: product.formulaVersionProvenance || product.formula_version_provenance || product.nutritionalInfo?.formula_version_provenance || product.nutritional_info?.formula_version_provenance || null,
    expiresAt: product.expiresAt || product.expires_at || null,
  };

  return {
    ...verifiedProduct,
    verificationState: catalogVerificationState(verifiedProduct),
    catalogQualityState: catalogVerificationState(verifiedProduct).state,
  };
}
