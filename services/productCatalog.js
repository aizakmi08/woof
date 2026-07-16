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
  rankProductsForOcr,
} from "./labelOcrMatching";

export {
  labelOcrProductMatchScore,
  labelOcrSearchQueries,
} from "./labelOcrMatching";

const logger = createLogger("CATALOG");
const DEFAULT_LIMIT = 16;
const MIN_SCORABLE_CATALOG_RANK = 3;
const LABEL_AUTO_OPEN_CONFIDENCE = 0.78;
const LABEL_AUTO_OPEN_CANDIDATE_COUNT = 5;
const MATCH_STOP_WORDS = new Set([
  "adult",
  "and",
  "cat",
  "chicken",
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
  "wholehearted",
  "wild",
]);
const CATALOG_SEARCH_PHRASE_ALIASES = new Map([
  ["advanced edge", "advantedge"],
  ["hill s", "hills"],
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

function normalizeNutriments(product = {}) {
  const n = product.nutriments || product.nutritionalInfo || product.nutrient_panel || {};
  return {
    protein: n.protein ?? n.proteins_100g ?? n.proteins ?? null,
    fat: n.fat ?? n.fat_100g ?? null,
    fiber: n.fiber ?? n.fiber_100g ?? n["crude-fiber_100g"] ?? null,
    energy: n.energy ?? n["energy-kcal_100g"] ?? n.energy_100g ?? null,
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

function normalizeLabelIdentification(identification = {}) {
  const normalized = { ...identification };
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
    normalized[field] = collapseRepeatedIdentityText(normalized[field]);
  }
  normalized.searchQuery = labelSearchQuery(normalized)
    || collapseRepeatedIdentityText(identification.searchQuery);
  return normalized;
}

function labelSearchQuery(identification = {}) {
  const productName = compact(identification.productName);
  const brand = compact(identification.brand);
  const identityParts = [];
  if (brand && !normalizeText(productName).includes(normalizeText(brand))) {
    identityParts.push(brand);
  }
  if (productName) identityParts.push(productName);

  for (const value of [identification.productLine, identification.flavor, identification.lifeStage]) {
    const part = compact(value);
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
  const productName = compact(identification.productName);
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
  ].map(compact).filter((query) => query.length >= 2);

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

function packageSizesForProduct(product = {}) {
  const values = [
    ...(Array.isArray(product.availablePackageSizes) ? product.availablePackageSizes : []),
    product.packageSize,
  ].map(compact).filter(Boolean);

  return [...new Map(values.map((size) => [normalizeText(size), size])).values()];
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
  if (/\b(freeze dried|freeze|freshdried|dehydrated|air dried)\b/.test(text)) return "freeze_dried";
  if (/\b(wet|canned|can|pate|pat|loaf|mousse|stew|stews|gravy|sauce|morsels|shreds|cuts|pouch|tray)\b/.test(text)) return "wet";
  if (/\b(dry|kibble)\b/.test(text)) return "dry";
  if (/\b(fresh|refrigerated|frozen)\b/.test(text)) return "fresh";
  return "";
}

function labelBrandCompatible(catalogProduct = {}, lookupProduct = {}) {
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

  for (const token of catalogTokens) {
    if (!LABEL_VARIANT_CONFLICT_TERMS.has(token)) continue;
    if (tokenHasEquivalent(token, lookupTokens)) continue;
    if (PRIMARY_RECIPE_TERMS.has(token) && !lookupHasPrimaryRecipe) continue;
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
  const hasStrongIdentity = strongProductMatch(catalogProduct, lookupProduct)
    || overlapScore(catalogProduct.productName, lookupProduct.productName) >= 0.45
    || overlapScore(productIdentityText(catalogProduct), productIdentityText(lookupProduct)) >= 0.55;
  if (!hasStrongIdentity) return false;
  if (!hasRequiredLabelTerms(catalogProduct, lookupProduct)) return false;
  if (!hasNoConflictingCandidateVariantTerms(catalogProduct, lookupProduct)) return false;

  const lookupFoodForm = inferredFoodForm(lookupProduct);
  const catalogFoodForm = inferredFoodForm(catalogProduct);
  if (lookupFoodForm && catalogFoodForm && lookupFoodForm !== catalogFoodForm) return false;

  const lookupIdentity = productIdentityText(lookupProduct);
  const lookupIdentityTokens = tokenSet(lookupIdentity);
  if (lookupIdentityTokens.size >= 3 && overlapScore(productIdentityText(catalogProduct), lookupIdentity) < 0.45) {
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

  return (
    brandScore * 0.2 +
    nameScore * 0.38 +
    lineScore * 0.12 +
    flavorScore * 0.15 +
    identityScore * 0.15
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
    nutritionalInfo: row.nutritionalInfo || row.nutritional_info || null,
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
    rank: Number(row.rank) || 0,
    sourceKind,
  };

  return {
    ...product,
    verificationState: catalogVerificationState(product),
    catalogQualityState: catalogVerificationState(product).state,
  };
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
    if (productTokens.has(token)) continue;
    if ((SEARCH_TEXTURE_EQUIVALENTS[token] || []).some((term) => productTokens.has(term))) {
      continue;
    }
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

function filterScorableCatalogResults(products = [], queryText = "") {
  return products.filter((product) => (
    product?.sourceKind === "catalog" &&
    catalogProductIsVerifiedReady(product, { queryText }) &&
    Number(product.rank || 0) >= MIN_SCORABLE_CATALOG_RANK
  ));
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

async function searchWoofCatalog(query, limit) {
  const params = {
    q: query,
    max_results: limit,
  };

  const { data, error } = await supabase.rpc("search_verified_products", params);

  if (!error) {
    return (data || []).map((row) => normalizeCatalogProduct(row, "catalog"));
  }

  logger.debug("[CATALOG] search_verified_products error; falling back:", error.message);
  const { data: fallbackData, error: fallbackError } = await supabase.rpc("search_products", params);

  if (fallbackError) {
    logger.debug("[CATALOG] search_products error:", fallbackError.message);
    return [];
  }

  return (fallbackData || []).map((row) => normalizeCatalogProduct(row, "catalog"));
}

async function searchWoofCatalogForLabelOcr(ocrText, queries, limit) {
  const boundedQueries = (Array.isArray(queries) ? queries : [])
    .map(compact)
    .filter((query) => query.length >= 2)
    .slice(0, 12);
  if (boundedQueries.length === 0) return [];

  const canonicalOcrText = normalizeLabelOcrText(ocrText);
  const focusedBatches = await Promise.all(
    boundedQueries
      .slice(0, 4)
      .map((query) => searchWoofCatalog(query, 25))
  );
  const focusedCandidates = rankProductsForOcr(
    filterProductsForOcr(focusedBatches.flat(), canonicalOcrText),
    canonicalOcrText
  );
  if (focusedCandidates.length > 0) {
    return focusedCandidates;
  }

  const { data: textData, error: textError } = await supabase.rpc(
    "search_verified_products_for_label_ocr_text",
    {
      ocr_text: canonicalOcrText,
      max_results: Math.min(Math.max(limit, 1), 96),
    }
  );
  if (!textError && (textData || []).length > 0) {
    return (textData || []).map((row) => normalizeCatalogProduct(row, "catalog"));
  }

  const { data, error } = await supabase.rpc("search_verified_products_for_label_ocr", {
    queries: boundedQueries,
    max_results: Math.min(Math.max(limit, 1), 96),
  });

  if (!error) {
    return (data || []).map((row) => normalizeCatalogProduct(row, "catalog"));
  }

  logger.debug(
    "[CATALOG] Label OCR text and batch search unavailable; falling back:",
    textError?.message || error.message
  );
  const batches = await Promise.all(
    boundedQueries.map((query) => searchWoofCatalog(query, Math.min(Math.max(Math.ceil(limit / 8), 8), 25)))
  );
  return batches.flat();
}

async function searchWoofCatalogForLabelIdentity(queries, limit) {
  const boundedQueries = (Array.isArray(queries) ? queries : [])
    .map(compact)
    .filter((query) => query.length >= 2)
    .slice(0, 12);
  if (boundedQueries.length === 0) return [];

  const { data, error } = await supabase.rpc("search_verified_products_for_label_ocr", {
    queries: boundedQueries,
    max_results: Math.min(Math.max(limit, 1), 96),
  });
  if (!error) {
    return (data || []).map((row) => normalizeCatalogProduct(row, "catalog"));
  }

  logger.debug("[CATALOG] Structured label batch search unavailable; using one direct lookup:", error.message);
  return searchWoofCatalog(boundedQueries[0], Math.min(Math.max(limit, 1), 25));
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
          await searchWoofCatalog(searchQuery, catalogLimit),
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

  return mergeProducts(catalogResults, [], catalogLimit, targetPetType);
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
} = {}) {
  if (type === "label_text") {
    const ocrText = compact(query);
    const searchQueries = labelOcrSearchQueries(ocrText, ocrLines);
    const targetPetType = normalizePetType(petType) || petTypeFromQuery(ocrText);
    const exclusionReason = nonCompleteFoodReason(ocrText);

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

    const candidates = signal?.aborted
      ? []
      : filterProductsForOcr(
        filterScorableCatalogResults(
          filterByPetType(
            await searchWoofCatalogForLabelOcr(ocrText, searchQueries, 96),
            targetPetType
          )
        ),
        ocrText
      );
    const rankedCandidates = rankProductsForOcr(candidates, ocrText);
    const merged = mergeProducts(
      rankedCandidates,
      [],
      Math.min(Math.max(limit * 3, 20), 25),
      targetPetType
    );
    const ranked = merged.slice(0, limit);
    const selectedProduct = pickVerifiedProductForOcr(ranked, ocrText);
    const bestProduct = selectedProduct || ranked[0] || null;
    const searchedQuery = bestProduct
      ? [bestProduct.brand, bestProduct.productName].map(compact).filter(Boolean).join(" ")
      : searchQueries[0];
    const confidence = bestProduct?.ocrMatchScore || 0;
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
      notes: selectedProduct ? "Matched from the front label on this device." : "Choose the matching package variant.",
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
    });
  }

  if (type === "label") {
    const rawIdentification = normalizeLabelIdentification(
      await identifyProductLabel(imageBase64, { signal })
    );
    const exclusionReason = nonCompleteFoodReason(rawIdentification);
    const identification = exclusionReason
      ? {
        ...rawIdentification,
        excluded: true,
        exclusionReason,
        notes: exclusionReason,
      }
      : rawIdentification;
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
    const candidates = signal?.aborted
      ? []
      : filterScorableCatalogResults(
        filterByPetType(
          await searchWoofCatalogForLabelIdentity(searchQueries, 96),
          targetPetType
        )
      );
    const strictCandidates = filterLabelCandidatesForIdentification(identification, candidates);
    const products = mergeProducts(strictCandidates, [], limit, targetPetType);
    const selectedProduct = pickVerifiedProductForIdentification(identification, products);

    return buildResolveProductResult({
      type,
      query: searchQuery,
      searchedQuery: effectiveQuery,
      identification,
      products,
      selectedProduct,
      confidence: identification?.confidence ?? 0,
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

export async function getCatalogProduct(cacheKey) {
  const key = compact(cacheKey);
  if (!key) return null;

  const { data, error } = await supabase
    .from("product_data")
    .select("cache_key, product_name, brand, gtin, product_line, flavor, life_stage, food_form, package_size, pet_type, ingredients, ingredient_text, ingredient_count, nutritional_info, nutrient_panel, has_published_nutrients, source, source_quality, ingredient_verification_status, image_verification_status, verified_at, source_url, image_url")
    .eq("cache_key", key)
    .maybeSingle();

  if (error) {
    logger.debug("[CATALOG] getCatalogProduct error:", error.message);
    return null;
  }

  return data ? normalizeCatalogProduct(data, "catalog") : null;
}

export async function findVerifiedCatalogProductByBarcode(barcode, { signal } = {}) {
  const variants = barcodeVariants(barcode);
  if (variants.length === 0) return null;
  if (signal?.aborted) return null;

  const products = [];
  for (const variant of variants) {
    if (signal?.aborted) return null;
    const matches = await searchWoofCatalog(variant, 8);
    for (const product of matches) {
      const productBarcodes = barcodeVariants(product.gtin || product.barcode);
      if (!productBarcodes.some((candidate) => variants.includes(candidate))) continue;
      products.push(product);
    }
  }

  return filterScorableCatalogResults(products)
    .sort((left, right) => Number(right.ingredientCount || 0) - Number(left.ingredientCount || 0))[0] || null;
}

export async function findVerifiedCatalogProductForLookup(lookupProduct, { signal, limit = 8 } = {}) {
  const searchQuery = compact(productIdentityText(lookupProduct));
  if (searchQuery.length < 3) return null;

  if (signal?.aborted) return null;

  const targetPetType = normalizePetType(lookupProduct?.petType) || petTypeFromQuery(searchQuery);
  const catalogResults = filterByPetType(
    await searchWoofCatalog(searchQuery, Math.min(Math.max(limit, 1), 12)),
    targetPetType
  );

  if (signal?.aborted) return null;

  const match = catalogResults.find((product) => (
    product.sourceKind === "catalog" &&
    productHasVerifiedIngredients(product) &&
    productHasVerifiedImage(product) &&
    strongProductMatch(product, lookupProduct)
  ));

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
    strongLabelProductMatch(product, lookupProduct)
  ));

  if (hasSpeciesAmbiguousLabelMatches(identification, matches)) return null;
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
    nutriments: product.nutriments || normalizeNutriments(product),
    nutriscoreGrade: product.nutriscoreGrade || null,
    novaGroup: product.novaGroup || null,
    imageUrl: product.imageUrl || null,
    source: product.source || null,
    sourceQuality: product.sourceQuality || null,
    ingredientVerificationStatus: product.ingredientVerificationStatus || null,
    imageVerificationStatus: product.imageVerificationStatus || null,
    verifiedAt: product.verifiedAt || null,
    sourceUrl: product.sourceUrl || null,
    sourceKind: product.sourceKind || "catalog",
  };

  return {
    ...verifiedProduct,
    verificationState: catalogVerificationState(verifiedProduct),
    catalogQualityState: catalogVerificationState(verifiedProduct).state,
  };
}
