import AsyncStorage from "@react-native-async-storage/async-storage";
import { productIsVerifiedReady } from "./catalogQuality";
import { createLogger } from "./logger";

const logger = createLogger("CATALOG_SEARCH_CACHE");
const CACHE_PREFIX = "@woof_catalog_search_cache_v6:";
const CACHE_INDEX_KEY = "@woof_catalog_search_cache_index_v6";
const MAX_CACHE_ENTRIES = 50;
const MAX_PRODUCTS_PER_ENTRY = 25;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_CACHED_PRODUCT_RANK = 3;
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
const PRODUCT_QUERY_REQUIRED_TERMS = new Set([
  "adult",
  "senior",
  "puppy",
  "kitten",
  "small",
  "large",
  "weight",
  "indoor",
  "hairball",
  "sensitive",
  "digestive",
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
]);
const NON_ADULT_LIFE_STAGE_TERMS = new Set([
  "puppy",
  "kitten",
  "senior",
  "mature",
]);

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeQuery(value) {
  return compact(value)
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
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

function hasSourceEvidence(product = {}) {
  return Boolean(compact(product.sourceUrl || product.source_url));
}

function hasVerifiedIngredients(product = {}) {
  const ingredientCount = Number(
    product.ingredientCount ||
    (Array.isArray(product.ingredients) ? product.ingredients.length : 0) ||
    0
  );
  const hasIngredients = Boolean(compact(product.ingredientsText)) || ingredientCount >= 5;
  if (!hasIngredients || !hasSourceEvidence(product)) return false;
  const status = compact(product.ingredientVerificationStatus).toLowerCase();
  return VERIFIED_INGREDIENT_STATUSES.has(status);
}

function hasVerifiedImage(product = {}) {
  const imageUrl = compact(product.imageUrl || product.image_url);
  if (!imageUrl || imageUrl.startsWith("data:") || !hasSourceEvidence(product)) return false;
  const status = compact(product.imageVerificationStatus).toLowerCase();
  return VERIFIED_IMAGE_STATUSES.has(status);
}

function hasRequiredQueryTerms(product = {}, queryText = "") {
  const queryTokens = tokenSet(queryText);
  const productTokens = tokenSet(productIdentityText(product));

  for (const token of queryTokens) {
    if (!PRODUCT_QUERY_REQUIRED_TERMS.has(token)) continue;
    if (productTokens.has(token)) continue;
    if (token === "adult") {
      const hasNonAdultLifeStage = [...NON_ADULT_LIFE_STAGE_TERMS].some((term) => productTokens.has(term));
      if (!hasNonAdultLifeStage) continue;
    }

    return false;
  }

  return true;
}

function cachedProductIsVisible(product = {}, queryText = "") {
  return (
    (product.sourceKind || "catalog") === "catalog" &&
    productIsVerifiedReady(product, { queryText }) &&
    Number(product.rank || 0) >= MIN_CACHED_PRODUCT_RANK
  );
}

function cacheKey(query, petType = null) {
  const normalized = normalizeQuery(query);
  const scope = petType === "dog" || petType === "cat" ? petType : "all";
  return normalized ? `${scope}:${normalized}` : null;
}

function storageKey(key) {
  return `${CACHE_PREFIX}${key}`;
}

function serializeProduct(product = {}) {
  return {
    id: product.id || null,
    cacheKey: product.cacheKey || null,
    gtin: product.gtin || null,
    barcode: product.barcode || null,
    productName: product.productName || "",
    brand: product.brand || "",
    productLine: product.productLine || null,
    flavor: product.flavor || null,
    lifeStage: product.lifeStage || null,
    foodForm: product.foodForm || null,
    packageSize: product.packageSize || null,
    petType: product.petType || "unknown",
    imageUrl: product.imageUrl || null,
    imageSource: product.imageSource || null,
    imageFallback: !!product.imageFallback,
    ingredientCount: Number(product.ingredientCount || 0),
    ingredients: Array.isArray(product.ingredients) ? product.ingredients.slice(0, 120) : [],
    ingredientsText: product.ingredientsText || "",
    nutriments: product.nutriments || null,
    nutritionalInfo: product.nutritionalInfo || null,
    nutrientPanel: product.nutrientPanel || null,
    hasPublishedNutrients: !!product.hasPublishedNutrients,
    source: product.source || null,
    sourceQuality: product.sourceQuality || null,
    sourceUrl: product.sourceUrl || null,
    ingredientVerificationStatus: product.ingredientVerificationStatus || null,
    imageVerificationStatus: product.imageVerificationStatus || null,
    verifiedAt: product.verifiedAt || null,
    rank: Number(product.rank || 0),
    sourceKind: product.sourceKind || "catalog",
  };
}

async function readIndex() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function writeIndex(nextIndex) {
  const unique = [...new Set(nextIndex)].slice(0, MAX_CACHE_ENTRIES);
  await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(unique));
  return unique;
}

export async function getCachedCatalogSearch(query, { petType = null, limit = MAX_PRODUCTS_PER_ENTRY } = {}) {
  const key = cacheKey(query, petType);
  if (!key) return null;

  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return null;

    const entry = JSON.parse(raw);
    const cachedAt = Number(entry.cachedAt || 0);
    const products = Array.isArray(entry.products) ? entry.products : [];
    if (!cachedAt || Date.now() - cachedAt > CACHE_TTL_MS || products.length === 0) {
      await AsyncStorage.removeItem(storageKey(key));
      return null;
    }
    const visibleProducts = products.filter((product) => cachedProductIsVisible(
      product,
      entry.query || query
    ));
    if (visibleProducts.length === 0) {
      await AsyncStorage.removeItem(storageKey(key));
      return null;
    }

    return {
      query: entry.query || query,
      cachedAt,
      products: visibleProducts.slice(0, Math.min(Math.max(limit, 1), MAX_PRODUCTS_PER_ENTRY)),
    };
  } catch (err) {
    logger.debug("[CATALOG_SEARCH_CACHE] read failed:", err.message);
    return null;
  }
}

export async function saveCachedCatalogSearch(query, products, { petType = null } = {}) {
  const key = cacheKey(query, petType);
  if (!key || !Array.isArray(products) || products.length === 0) return false;

  try {
    const serialized = products
      .filter((product) => product?.productName)
      .slice(0, MAX_PRODUCTS_PER_ENTRY)
      .map(serializeProduct)
      .filter((product) => cachedProductIsVisible(product, query));
    if (serialized.length === 0) return false;

    await AsyncStorage.setItem(storageKey(key), JSON.stringify({
      query: compact(query),
      cachedAt: Date.now(),
      products: serialized,
    }));

    const previous = await readIndex();
    const nextIndex = await writeIndex([key, ...previous.filter((entry) => entry !== key)]);
    const evicted = previous.filter((entry) => !nextIndex.includes(entry));
    if (evicted.length > 0) {
      await AsyncStorage.multiRemove(evicted.map(storageKey));
    }
    return true;
  } catch (err) {
    logger.debug("[CATALOG_SEARCH_CACHE] save failed:", err.message);
    return false;
  }
}

export async function clearCatalogSearchCache() {
  try {
    const index = await readIndex();
    await AsyncStorage.multiRemove([CACHE_INDEX_KEY, ...index.map(storageKey)]);
  } catch (err) {
    logger.debug("[CATALOG_SEARCH_CACHE] clear failed:", err.message);
  }
}
