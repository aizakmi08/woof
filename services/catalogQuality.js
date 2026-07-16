export const CATALOG_QUALITY_STATES = {
  VERIFIED_READY: "verified_ready",
  IDENTITY_ONLY: "identity_only",
  NEEDS_INGREDIENTS: "needs_ingredients",
  NEEDS_IMAGE: "needs_image",
  AMBIGUOUS_VARIANT: "ambiguous_variant",
  EXCLUDED: "excluded",
};

export const VERIFIED_INGREDIENT_STATUSES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
]);

export const VERIFIED_IMAGE_STATUSES = new Set([
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
const PRODUCT_QUERY_EQUIVALENT_TERMS = {
  loaf: new Set(["mousse", "pat", "pate"]),
  mousse: new Set(["loaf", "pat", "pate"]),
  pat: new Set(["loaf", "mousse", "pate"]),
  pate: new Set(["loaf", "mousse", "pat"]),
};

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lower(value) {
  return compact(value).toLowerCase();
}

function normalizeText(value) {
  return compact(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

export function productIdentityText(product = {}) {
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

export function productHasSourceEvidence(product = {}) {
  return Boolean(compact(product.sourceUrl || product.source_url));
}

export function productHasMinimumIngredients(product = {}) {
  const ingredientCount = Number(
    product.ingredientCount ||
    product.ingredient_count ||
    (Array.isArray(product.ingredients) ? product.ingredients.length : 0) ||
    0
  );
  return Boolean(compact(product.ingredientsText || product.ingredientText || product.ingredient_text)) || ingredientCount >= 5;
}

export function productHasKnownPetType(product = {}) {
  const petType = lower(product.petType || product.pet_type);
  return petType === "dog" || petType === "cat";
}

export function productHasVerifiedIngredients(product = {}) {
  if (!productHasMinimumIngredients(product)) return false;
  if (!productHasSourceEvidence(product)) return false;

  const status = lower(product.ingredientVerificationStatus || product.ingredient_verification_status);
  return VERIFIED_INGREDIENT_STATUSES.has(status);
}

export function productHasVerifiedImage(product = {}) {
  const imageUrl = compact(product.imageUrl || product.image_url);
  if (!imageUrl || /^data:/i.test(imageUrl)) return false;
  if (!productHasSourceEvidence(product)) return false;

  const status = lower(product.imageVerificationStatus || product.image_verification_status);
  return VERIFIED_IMAGE_STATUSES.has(status);
}

export function productMatchesQueryTerms(product = {}, queryText = "") {
  const queryTokens = tokenSet(queryText);
  const productTokens = tokenSet(productIdentityText(product));

  for (const token of queryTokens) {
    if (!PRODUCT_QUERY_REQUIRED_TERMS.has(token)) continue;
    if (productTokens.has(token)) continue;
    if ([...(PRODUCT_QUERY_EQUIVALENT_TERMS[token] || [])].some((term) => productTokens.has(term))) {
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

export function productIsCurrentCompleteFood(product = {}) {
  if (product.isCompleteFood === false || product.is_complete_food === false) return false;
  if (compact(product.catalogExclusionReason || product.catalog_exclusion_reason)) return false;
  const expiresAt = product.expiresAt || product.expires_at;
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return false;
  return true;
}

export function catalogQualityState(product = {}, { queryText = "", ambiguous = false } = {}) {
  if (!product || !compact(product.productName || product.product_name)) {
    return CATALOG_QUALITY_STATES.IDENTITY_ONLY;
  }

  if (!productIsCurrentCompleteFood(product)) {
    return CATALOG_QUALITY_STATES.EXCLUDED;
  }

  if (ambiguous) {
    return CATALOG_QUALITY_STATES.AMBIGUOUS_VARIANT;
  }

  if (!productHasKnownPetType(product)) {
    return CATALOG_QUALITY_STATES.IDENTITY_ONLY;
  }

  if (queryText && !productMatchesQueryTerms(product, queryText)) {
    return CATALOG_QUALITY_STATES.AMBIGUOUS_VARIANT;
  }

  if (!productHasVerifiedIngredients(product)) {
    return CATALOG_QUALITY_STATES.NEEDS_INGREDIENTS;
  }

  if (!productHasVerifiedImage(product)) {
    return CATALOG_QUALITY_STATES.NEEDS_IMAGE;
  }

  return CATALOG_QUALITY_STATES.VERIFIED_READY;
}

export function productIsVerifiedReady(product = {}, options = {}) {
  return catalogQualityState(product, options) === CATALOG_QUALITY_STATES.VERIFIED_READY;
}

export function catalogQualityLabel(state) {
  switch (state) {
    case CATALOG_QUALITY_STATES.VERIFIED_READY:
      return "Verified ingredients";
    case CATALOG_QUALITY_STATES.NEEDS_INGREDIENTS:
      return "Needs ingredients";
    case CATALOG_QUALITY_STATES.NEEDS_IMAGE:
      return "Needs product image";
    case CATALOG_QUALITY_STATES.AMBIGUOUS_VARIANT:
      return "Needs exact recipe match";
    case CATALOG_QUALITY_STATES.EXCLUDED:
      return "Not a scorable food";
    case CATALOG_QUALITY_STATES.IDENTITY_ONLY:
    default:
      return "Identity only";
  }
}

export function catalogVerificationState(product = {}, options = {}) {
  const state = catalogQualityState(product, options);
  const gaps = [];

  if (!productHasKnownPetType(product)) gaps.push("unknown_pet_type");
  if (!productHasVerifiedIngredients(product)) gaps.push("unverified_ingredients");
  if (!productHasVerifiedImage(product)) {
    gaps.push(compact(product.imageUrl || product.image_url) ? "unverified_image" : "missing_image");
  }
  if (state === CATALOG_QUALITY_STATES.AMBIGUOUS_VARIANT) gaps.push("ambiguous_variant");
  if (state === CATALOG_QUALITY_STATES.EXCLUDED) gaps.push("excluded");

  return {
    state,
    label: catalogQualityLabel(state),
    readyToScore: state === CATALOG_QUALITY_STATES.VERIFIED_READY,
    gaps: [...new Set(gaps)],
    source: compact(product.source),
    sourceQuality: compact(product.sourceQuality || product.source_quality),
    sourceUrl: compact(product.sourceUrl || product.source_url),
    verifiedAt: compact(product.verifiedAt || product.verified_at),
    ingredientVerificationStatus: compact(product.ingredientVerificationStatus || product.ingredient_verification_status),
    imageVerificationStatus: compact(product.imageVerificationStatus || product.image_verification_status),
  };
}
