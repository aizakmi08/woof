export const LABEL_RESOLUTION_DECISIONS = Object.freeze({
  EXACT_CONFIRMED: "exact_confirmed",
  RECOGNIZERS_DISAGREE: "recognizers_disagree",
  NO_EXACT_VARIANT: "no_exact_variant",
  NON_COMPLETE_CONFIRMED: "non_complete_confirmed",
  NOT_READABLE: "not_readable",
  TIMED_OUT: "timed_out",
});

const PURINA_PARENT_TERMS = new Set(["purina", "nestle purina"]);
const CONSUMER_BRAND_ALIASES = [
  ["moist & meaty", ["moist and meaty", "moist meaty"]],
  ["purina pro plan", ["purina pro plan", "pro plan"]],
  ["purina one", ["purina one"]],
  ["fancy feast", ["fancy feast"]],
  ["beneful", ["beneful"]],
  ["friskies", ["friskies"]],
  ["cat chow", ["cat chow"]],
  ["dog chow", ["dog chow"]],
  ["hill's science diet", ["hill s science diet", "hills science diet", "science diet"]],
  ["royal canin", ["royal canin"]],
  ["open farm", ["open farm"]],
];
const PRODUCT_LINE_TERMS = new Set([
  "advantedge",
  "beneful",
  "bright mind",
  "complete essentials",
  "fancy feast",
  "goodgut",
  "harvest",
  "moist and meaty",
  "natural choice",
  "open prairie",
  "originals",
  "pro plan",
  "purina one",
  "proactive health",
  "rawmix",
  "science diet",
  "small bites",
  "small breed",
  "small mini",
  "tide and terrain",
  "wild ocean",
]);
const EXCLUSIVE_PRODUCT_LINE_GROUPS = [
  new Set(["small bites", "small breed", "small mini"]),
];
const LIFE_STAGE_GROUPS = [
  new Set(["puppy"]),
  new Set(["kitten"]),
  new Set(["senior", "mature", "7"]),
  new Set(["adult"]),
];
const FORM_GROUPS = [
  new Set(["freeze dried", "dehydrated", "air dried"]),
  new Set([
    "wet",
    "canned",
    "pate",
    "loaf",
    "mousse",
    "stew",
    "gravy",
    "pouch",
    "entree",
    "classic ground",
    "chunks in gravy",
    "chunks in sauce",
    "can",
    "tray",
    "tub",
    "cup",
    "cups",
  ]),
  new Set(["semi moist", "soft dry", "soft"]),
  new Set(["dry", "kibble", "clusters", "minichunks"]),
  new Set(["fresh", "refrigerated", "frozen"]),
];
const WET_FORM_GROUP = 1;
const DRY_FORM_GROUP = 3;
const FORMULA_VARIANT_TERMS = new Set([
  "ancient grains",
  "brown rice",
  "grain free",
  "limited ingredient",
  "minichunks",
  "raw coated",
  "shredded blend",
  "small bites",
]);
const CONDITION_TERMS = new Set([
  "digestive",
  "hairball",
  "hydrolyzed",
  "indoor",
  "joint",
  "large breed",
  "mobility",
  "sensitive",
  "small breed",
  "skin and coat",
  "urinary",
  "vegetarian",
  "weight management",
]);
const RECIPE_TERMS = new Set([
  "beef",
  "bison",
  "cheddar",
  "chicken",
  "cod",
  "crab",
  "duck",
  "fish",
  "goat",
  "lamb",
  "liver",
  "mackerel",
  "ocean",
  "pollock",
  "pumpkin",
  "quail",
  "rabbit",
  "salmon",
  "sardine",
  "shrimp",
  "tilapia",
  "trout",
  "tuna",
  "turkey",
  "venison",
  "whitefish",
]);
const NON_COMPLETE_PATTERNS = [
  { category: "treat", pattern: /\b(treat|treats|snack|snacks|chew|chews)\b/i, reason: "Pet treats are not complete pet food." },
  { category: "topper", pattern: /\b(topper|toppers)\b/i, reason: "Food toppers are not complete pet food." },
  { category: "mixer", pattern: /\b(meal\s+mixers?|raw\s+boost\s+mixers?|mixers?)\b/i, reason: "Meal mixers are not complete pet food." },
  { category: "supplement", pattern: /\b(supplement|supplements|booster|boosters)\b/i, reason: "Supplements and boosters are not complete pet food." },
];
const NON_COMPLETE_CORROBORATION = [
  /\b(intermittent|supplemental)\s+feeding\b/i,
  /\bnot\s+(?:a\s+)?complete\b/i,
  /\bcomplementary\s+(?:pet\s+)?food\b/i,
  /\bfeed\s+as\s+a\s+(?:treat|snack|topper)\b/i,
  /\bintended\s+for\s+(?:intermittent|supplemental)\b/i,
];
const COMPLETE_FOOD_EVIDENCE = [
  /\bcomplete\s+and\s+balanced\b/i,
  /\bformulated\s+to\s+meet\b.*\baafco\b/i,
  /\bcomplete\s+(?:dog|cat|pet)\s+food\b/i,
];

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeIdentityText(value) {
  return compact(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bsmall and mini\b/g, "small mini")
    .replace(/\bgrains? and legume free\b/g, "grain free")
    .trim();
}

export function labelIdentityText(value = {}) {
  if (typeof value === "string") return compact(value);
  return [
    value.manufacturer,
    value.consumerBrand,
    value.brand,
    value.productLine,
    value.productName,
    value.flavor,
    value.lifeStage,
    value.foodForm,
    value.packageSize,
  ].map(compact).filter(Boolean).join(" ");
}

function phrasePresent(text, phrase) {
  return ` ${text} `.includes(` ${normalizeIdentityText(phrase)} `);
}

export function consumerBrandForIdentity(value = {}) {
  const identity = normalizeIdentityText(labelIdentityText(value));
  for (const [brand, aliases] of CONSUMER_BRAND_ALIASES) {
    if (aliases.some((alias) => phrasePresent(identity, alias))) return brand;
  }

  const explicitBrand = normalizeIdentityText(value?.consumerBrand || value?.brand);
  if (PURINA_PARENT_TERMS.has(explicitBrand)) return "purina_parent";
  return explicitBrand || "";
}

function normalizedPetType(value) {
  const petType = normalizeIdentityText(value?.petType);
  return petType === "dog" || petType === "cat" ? petType : "";
}

function matchingGroup(value, groups) {
  const text = normalizeIdentityText(labelIdentityText(value));
  return groups.findIndex((group) => [...group].some((term) => phrasePresent(text, term)));
}

function matchingFoodFormGroups(value = {}) {
  const text = normalizeIdentityText(labelIdentityText(value));
  if (/\b(?:raw|broth) coated\b/.test(text)) {
    return [DRY_FORM_GROUP];
  }
  return FORM_GROUPS
    .map((group, index) => (
      [...group].some((term) => phrasePresent(text, term)) ? index : -1
    ))
    .filter((index) => index >= 0);
}

function matchingFoodFormGroup(value = {}) {
  const matchingGroups = matchingFoodFormGroups(value);
  if (matchingGroups.length <= 1) return matchingGroups[0] ?? -1;

  const packageGroup = packageFormEvidenceGroup(value);
  return matchingGroups.includes(packageGroup) ? packageGroup : -1;
}

function weightInGrams(amount, unit) {
  if (["lb", "lbs", "pound", "pounds"].includes(unit)) return amount * 453.59237;
  if (["kg", "kilogram", "kilograms"].includes(unit)) return amount * 1000;
  if (["oz", "ounce", "ounces"].includes(unit)) return amount * 28.349523125;
  return amount;
}

export function packageWeightMeasurements(value = {}) {
  const text = compact(typeof value === "string" ? value : labelIdentityText(value)).toLowerCase();
  const measurements = [];
  const pattern = /\b(\d+(?:[.,]\d+)?)\s*(lb|lbs|pound|pounds|kg|kilogram|kilograms|oz|ounce|ounces|g|gram|grams)\b/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const amount = Number(match[1].replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      measurements.push({
        amount,
        unit: match[2],
        grams: weightInGrams(amount, match[2]),
      });
    }
  }
  return measurements;
}

export function packageWeightsOverlap(left = {}, right = {}, tolerance = 0.035) {
  const leftMeasurements = packageWeightMeasurements(left);
  const rightMeasurements = packageWeightMeasurements(right);
  if (leftMeasurements.length === 0 || rightMeasurements.length === 0) return false;

  return leftMeasurements.some((leftMeasurement) => (
    rightMeasurements.some((rightMeasurement) => {
      const difference = Math.abs(leftMeasurement.grams - rightMeasurement.grams);
      const scale = Math.max(leftMeasurement.grams, rightMeasurement.grams);
      return difference <= Math.max(2, scale * tolerance);
    })
  ));
}

function packageFormEvidenceGroup(value = {}) {
  const packageText = normalizeIdentityText(labelIdentityText(value));
  if (
    /\b(?:cans|pouches|trays|tubs)\b/.test(packageText)
    || /\b\d+(?:[.,]\d+)?\s*(?:oz|ounce|ounces|g|gram|grams)\s+can\b/.test(packageText)
  ) {
    return WET_FORM_GROUP;
  }
  if (/\b(?:bag|bags)\b/.test(packageText)) return DRY_FORM_GROUP;

  // Explicit form wording is stronger than package scale. This keeps a
  // multi-can case whose total is expressed in pounds from becoming "dry",
  // and a small dry trial bag expressed in ounces from becoming "wet".
  if (matchingFoodFormGroups(value).length === 1) return -1;

  const measurements = packageWeightMeasurements(value);
  if (measurements.some(({ unit }) => (
    ["lb", "lbs", "pound", "pounds", "kg", "kilogram", "kilograms"].includes(unit)
  ))) {
    return DRY_FORM_GROUP;
  }

  const hasCanScaleWeight = measurements.some(({ amount, unit }) => {
    if (["oz", "ounce", "ounces"].includes(unit)) return amount <= 30;
    if (["g", "gram", "grams"].includes(unit)) return amount <= (30 * 28.349523125);
    return false;
  });
  return hasCanScaleWeight ? WET_FORM_GROUP : -1;
}

function foodFormEvidenceGroup(value = {}) {
  const visibleForm = matchingFoodFormGroup(value);
  const packageForm = packageFormEvidenceGroup(value);
  return visibleForm >= 0 ? visibleForm : packageForm;
}

function visiblePackageSize(value = {}) {
  const measurements = packageWeightMeasurements(value);
  return measurements.map(({ amount, unit }) => `${amount} ${unit}`).join(" / ");
}

function matchingLifeStageGroup(value = {}) {
  const explicitLifeStage = normalizeIdentityText(value.lifeStage || value.life_stage);
  if (explicitLifeStage && explicitLifeStage !== "unknown") {
    return LIFE_STAGE_GROUPS.findIndex((group) => (
      [...group].some((term) => phrasePresent(explicitLifeStage, term))
    ));
  }

  // Package weights such as 7 lb and 11 lb are not age evidence. Infer only
  // from shelf-facing identity fields when structured life stage is absent.
  const visibleIdentity = normalizeIdentityText([
    value.productLine,
    value.product_line,
    value.productName,
    value.product_name,
    value.flavor,
  ].map(compact).filter(Boolean).join(" "));
  return LIFE_STAGE_GROUPS.findIndex((group) => (
    [...group].some((term) => phrasePresent(visibleIdentity, term))
  ));
}

export function adultAgeBand(value = {}) {
  const text = normalizeIdentityText([
    value.lifeStage,
    value.life_stage,
    value.productLine,
    value.product_line,
    value.productName,
    value.product_name,
    value.flavor,
  ].map(compact).filter(Boolean).join(" "));
  const adultAge = text.match(/\badult\s+(7|11)(?:\s+plus)?\b/);
  if (adultAge) return `adult_${adultAge[1]}_plus`;
  const seniorAge = text.match(/\b(7|11)(?:\s+plus)?\s+(?:senior|adult)\b/);
  return seniorAge ? `adult_${seniorAge[1]}_plus` : "";
}

function presentTerms(value, terms) {
  const text = normalizeIdentityText(labelIdentityText(value));
  return [...terms].filter((term) => phrasePresent(text, term));
}

function identityFormulaKey(product = {}) {
  const identity = normalizeIdentityText(labelIdentityText(product));
  const lifeStageGroup = matchingLifeStageGroup(product);
  const foodFormGroup = matchingFoodFormGroup(product);
  const protectedParts = [
    ...presentTerms(product, PRODUCT_LINE_TERMS),
    ...presentTerms(product, RECIPE_TERMS),
    ...presentTerms(product, CONDITION_TERMS),
    ...presentTerms(product, FORMULA_VARIANT_TERMS),
  ].sort();
  if (lifeStageGroup >= 0 && lifeStageGroup !== LIFE_STAGE_GROUPS.length - 1) {
    protectedParts.push([...LIFE_STAGE_GROUPS[lifeStageGroup]][0]);
  }
  const ageBand = adultAgeBand(product);
  if (ageBand) protectedParts.push(`age:${ageBand}`);
  if (foodFormGroup >= 0) {
    protectedParts.push(`form:${foodFormGroup}`);
  }
  const formulaParts = [
    consumerBrandForIdentity(product),
    normalizedPetType(product),
    ...new Set(protectedParts),
  ].filter(Boolean);

  if (formulaParts.length >= 3) return formulaParts.join("|");
  return identity
    .replace(/\b\d+(?:\.\d+)?\s*(?:lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|ct|count|pack)\b/g, " ")
    .replace(/\b(?:adult|natural|food|formula|recipe|with|real|purina)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productFormulaKey(product = {}) {
  return compact(product.formulaKey || product.formula_key) || identityFormulaKey(product);
}

export function compareLabelIdentities(left = {}, right = {}, {
  requireVisibleCandidateVariants = false,
} = {}) {
  const agreementFields = [];
  const disagreementFields = [];
  const reasonCodes = [];
  const leftPetType = normalizedPetType(left);
  const rightPetType = normalizedPetType(right);

  if (leftPetType && rightPetType) {
    if (leftPetType === rightPetType) agreementFields.push("pet_type");
    else {
      disagreementFields.push("pet_type");
      reasonCodes.push("cross_species");
    }
  }

  const leftBrand = consumerBrandForIdentity(left);
  const rightBrand = consumerBrandForIdentity(right);
  if (leftBrand && rightBrand) {
    if (leftBrand === rightBrand && leftBrand !== "purina_parent") {
      agreementFields.push("consumer_brand");
    } else {
      disagreementFields.push("consumer_brand");
      reasonCodes.push(
        leftBrand === "purina_parent" || rightBrand === "purina_parent"
          ? "parent_brand_not_sufficient"
          : "cross_brand_line"
      );
    }
  }

  const leftLifeStage = matchingLifeStageGroup(left);
  const rightLifeStage = matchingLifeStageGroup(right);
  const leftAgeBand = adultAgeBand(left);
  const rightAgeBand = adultAgeBand(right);
  if (leftLifeStage >= 0 && rightLifeStage >= 0) {
    if (
      leftLifeStage === rightLifeStage
      && (!leftAgeBand || !rightAgeBand || leftAgeBand === rightAgeBand)
    ) agreementFields.push("life_stage");
    else {
      disagreementFields.push("life_stage");
      reasonCodes.push("life_stage_conflict");
    }
  } else if (
    requireVisibleCandidateVariants
    && rightLifeStage >= 0
    && rightLifeStage !== LIFE_STAGE_GROUPS.length - 1
    && leftLifeStage < 0
  ) {
    disagreementFields.push("life_stage");
    reasonCodes.push("candidate_life_stage_not_visible");
  }

  const leftPackageForm = packageFormEvidenceGroup(left);
  const rightPackageForm = packageFormEvidenceGroup(right);
  const leftForm = foodFormEvidenceGroup(left);
  const rightForm = foodFormEvidenceGroup(right);
  if (leftForm >= 0 && rightForm >= 0) {
    if (leftForm === rightForm) agreementFields.push("food_form");
    else {
      disagreementFields.push("food_form");
      reasonCodes.push("food_form_conflict");
    }
  } else if (requireVisibleCandidateVariants && rightForm >= 0 && leftForm < 0) {
    disagreementFields.push("food_form");
    reasonCodes.push("candidate_food_form_not_visible");
  }

  const packageFormConflict = (
    leftPackageForm >= 0
    && rightForm >= 0
    && leftPackageForm !== rightForm
  ) || (
    rightPackageForm >= 0
    && leftForm >= 0
    && rightPackageForm !== leftForm
  );
  if (packageFormConflict) {
    disagreementFields.push("package_size");
    reasonCodes.push("package_size_form_conflict");
  } else if (
    leftPackageForm >= 0
    && rightPackageForm >= 0
    && leftPackageForm === rightPackageForm
  ) {
    agreementFields.push("package_size_form");
  }

  const leftLines = presentTerms(left, PRODUCT_LINE_TERMS);
  const rightLines = presentTerms(right, PRODUCT_LINE_TERMS);
  const exclusiveLineConflict = EXCLUSIVE_PRODUCT_LINE_GROUPS.some((group) => {
    const leftExclusiveLines = leftLines.filter((term) => group.has(term));
    const rightExclusiveLines = rightLines.filter((term) => group.has(term));
    return leftExclusiveLines.length > 0
      && rightExclusiveLines.length > 0
      && !leftExclusiveLines.some((term) => rightExclusiveLines.includes(term));
  });
  if (exclusiveLineConflict) {
    disagreementFields.push("product_line");
    reasonCodes.push("product_line_conflict");
  }
  if (leftLines.length && rightLines.length) {
    if (!exclusiveLineConflict && leftLines.some((term) => rightLines.includes(term))) {
      agreementFields.push("product_line");
    }
    else {
      disagreementFields.push("product_line");
      reasonCodes.push("product_line_conflict");
    }
  }
  if (requireVisibleCandidateVariants) {
    const hiddenCandidateLines = rightLines.filter((term) => !leftLines.includes(term));
    if (hiddenCandidateLines.length) {
      disagreementFields.push("product_line");
      reasonCodes.push("candidate_product_line_not_visible");
    }
  }

  const leftRecipes = presentTerms(left, RECIPE_TERMS);
  const rightRecipes = presentTerms(right, RECIPE_TERMS);
  if (leftRecipes.length && rightRecipes.length) {
    if (leftRecipes.some((term) => rightRecipes.includes(term))) agreementFields.push("recipe");
    else {
      disagreementFields.push("recipe");
      reasonCodes.push("recipe_conflict");
    }
  }

  if (requireVisibleCandidateVariants) {
    const hiddenCandidateRecipes = rightRecipes.filter((term) => !leftRecipes.includes(term));
    if (leftRecipes.length && hiddenCandidateRecipes.length) {
      disagreementFields.push("recipe");
      reasonCodes.push("candidate_recipe_not_visible");
    }

    const visibleConditions = presentTerms(left, CONDITION_TERMS);
    const candidateConditions = presentTerms(right, CONDITION_TERMS);
    const hiddenCandidateConditions = candidateConditions.filter((term) => !visibleConditions.includes(term));
    if (hiddenCandidateConditions.length) {
      disagreementFields.push("condition");
      reasonCodes.push("candidate_condition_not_visible");
    }

    const visibleFormulaVariants = presentTerms(left, FORMULA_VARIANT_TERMS);
    const candidateFormulaVariants = presentTerms(right, FORMULA_VARIANT_TERMS);
    const hiddenCandidateFormulaVariants = candidateFormulaVariants.filter(
      (term) => !visibleFormulaVariants.includes(term)
    );
    if (hiddenCandidateFormulaVariants.length) {
      disagreementFields.push("formula_variant");
      reasonCodes.push("candidate_formula_variant_not_visible");
    }
  }

  return {
    compatible: disagreementFields.length === 0,
    agreementFields: [...new Set(agreementFields)],
    disagreementFields: [...new Set(disagreementFields)],
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function normalizedBounds(line = {}) {
  const bounds = line.bounds || line.boundingBox || {};
  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function isMainProductLine(line = {}) {
  const confidence = Number(line.confidence);
  if (Number.isFinite(confidence) && confidence < 0.4) return false;
  const bounds = normalizedBounds(line);
  if (!bounds) return true;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return centerX >= 0.12 && centerX <= 0.88 && centerY >= 0.08 && centerY <= 0.92;
}

export function evaluateNonCompleteFoodEvidence({
  text = "",
  lines = [],
  identification = {},
} = {}) {
  const localLines = (Array.isArray(lines) ? lines : [])
    .filter(isMainProductLine)
    .map((line) => compact(typeof line === "string" ? line : line?.text))
    .filter(Boolean);
  const localText = compact(localLines.join(" ") || text || labelIdentityText(identification));
  const completeConflict = COMPLETE_FOOD_EVIDENCE.some((pattern) => pattern.test(localText));
  const matches = NON_COMPLETE_PATTERNS.filter(({ pattern }) => pattern.test(localText));
  const cloudCategory = normalizeIdentityText(identification.productCategory);
  const cloudEvidence = Array.isArray(identification.categoryEvidence)
    ? identification.categoryEvidence.map(compact).filter(Boolean)
    : [];
  const cloudConfirmed = ["treat", "topper", "mixer", "supplement"].includes(cloudCategory)
    && cloudEvidence.length > 0;
  const corroborated = NON_COMPLETE_CORROBORATION.some((pattern) => pattern.test(localText))
    || matches.length >= 2
    || cloudConfirmed;
  const match = matches[0] || (
    cloudConfirmed
      ? NON_COMPLETE_PATTERNS.find(({ category }) => category === cloudCategory)
      : null
  );

  if (!match) {
    return { status: "none", confirmed: false, category: "", reason: "", evidence: [] };
  }

  const evidence = [
    ...localLines.filter((line) => NON_COMPLETE_PATTERNS.some(({ pattern }) => pattern.test(line))),
    ...cloudEvidence,
  ].slice(0, 6);

  if (completeConflict || !corroborated) {
    return {
      status: "possible",
      confirmed: false,
      category: match.category,
      reason: "Could not confirm whether this is a complete food.",
      evidence,
    };
  }

  return {
    status: "confirmed",
    confirmed: true,
    category: match.category,
    reason: match.reason,
    evidence,
  };
}

function productKey(product = {}) {
  return compact(productFormulaKey(product) || product.cacheKey || product.id || product.gtin);
}

function mergeCandidateProducts(outcomes = []) {
  const merged = new Map();
  for (const outcome of outcomes) {
    for (const product of outcome?.result?.products || []) {
      const key = productKey(product);
      if (!key || merged.has(key)) continue;
      merged.set(key, product);
    }
  }
  return [...merged.values()];
}

function outcomeIdentity(outcome) {
  return outcome?.result?.identification || {};
}

function outcomeSelected(outcome) {
  return outcome?.result?.selectedProduct || null;
}

function outcomeTimedOut(outcome) {
  return outcome?.error?.name === "AbortError"
    || /timed?\s*out|timeout|abort/i.test(String(outcome?.error?.message || ""));
}

function deterministicOcrProduct(outcome) {
  const selected = outcomeSelected(outcome);
  if (!selected) return null;
  const identification = outcomeIdentity(outcome);
  const confidence = Number(identification.confidence || selected.ocrMatchScore || 0);
  if (confidence < 0.82) return null;
  const brand = consumerBrandForIdentity(identification);
  if (!brand || brand === "purina_parent") return null;

  const protectedIdentityTerms = [
    ...presentTerms(identification, PRODUCT_LINE_TERMS),
    ...presentTerms(identification, RECIPE_TERMS),
    ...presentTerms(identification, CONDITION_TERMS),
    ...presentTerms(identification, FORMULA_VARIANT_TERMS),
  ];
  const rawOcrEvidence = normalizeIdentityText(
    outcome?.result?.query || outcome?.result?.searchedQuery
  );
  const visibleProductLine = normalizeIdentityText(
    identification.productLine || selected.productLine
  );
  if (
    visibleProductLine.length >= 4
    && phrasePresent(rawOcrEvidence, visibleProductLine)
  ) {
    protectedIdentityTerms.push(`visible_line:${visibleProductLine}`);
  }
  if (new Set(protectedIdentityTerms).size < 2) return null;

  const otherFormula = (outcome?.result?.products || []).find(
    (product) => productKey(product) !== productKey(selected)
  );
  if (
    otherFormula
    && confidence - Number(otherFormula.ocrMatchScore || 0) < 0.12
  ) return null;

  const comparison = compareLabelIdentities(
    outcomeVisibleIdentity(outcome),
    selected,
    { requireVisibleCandidateVariants: true }
  );
  return comparison.compatible ? selected : null;
}

function visiblePetType(value) {
  const text = normalizeIdentityText(value);
  if (/\b(?:dog|dogs|canine)\b/.test(text)) return "dog";
  if (/\b(?:cat|cats|feline)\b/.test(text)) return "cat";
  return "";
}

function outcomeVisibleIdentity(outcome) {
  const identification = outcomeIdentity(outcome);
  if (outcome?.path !== "on_device_ocr") return identification;

  const visibleText = compact(outcome?.result?.query || outcome?.result?.ocrText);
  if (!visibleText) return identification;
  return {
    ...identification,
    manufacturer: "",
    consumerBrand: "",
    brand: "",
    productLine: "",
    productName: visibleText,
    flavor: "",
    lifeStage: "",
    foodForm: "",
    packageSize: visiblePackageSize(visibleText),
    petType: visiblePetType(visibleText),
  };
}

function identityEvidence(identity = {}) {
  const explicitFoodForm = compact(identity.foodForm);
  const formEvidenceGroup = foodFormEvidenceGroup(identity);
  return {
    manufacturer: compact(identity.manufacturer),
    consumerBrand: consumerBrandForIdentity(identity),
    brand: compact(identity.brand),
    productLine: compact(identity.productLine),
    productName: compact(identity.productName),
    flavor: compact(identity.flavor),
    lifeStage: compact(identity.lifeStage),
    foodForm: explicitFoodForm,
    foodFormEvidence: formEvidenceGroup === DRY_FORM_GROUP
      ? "dry"
      : formEvidenceGroup === WET_FORM_GROUP
        ? "wet"
        : explicitFoodForm,
    packageSize: compact(identity.packageSize) || visiblePackageSize(identity),
    petType: normalizedPetType(identity) || "unknown",
  };
}

function outcomeConfidenceMargin(outcome) {
  const selected = outcomeSelected(outcome);
  if (!selected) return null;
  const selectedKey = productKey(selected);
  const selectedScore = Number(
    selected.ocrMatchScore
    || selected.labelMatchScore
    || outcomeIdentity(outcome).confidence
  );
  const runnerUp = (outcome?.result?.products || []).find(
    (product) => productKey(product) !== selectedKey
  );
  const runnerScore = Number(runnerUp?.ocrMatchScore || runnerUp?.labelMatchScore);
  if (!Number.isFinite(selectedScore)) return null;
  return Number.isFinite(runnerScore)
    ? Math.max(0, selectedScore - runnerScore)
    : selectedScore;
}

function resultNote(decision) {
  switch (decision) {
    case LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED:
      return "Exact product identity confirmed from the captured label.";
    case LABEL_RESOLUTION_DECISIONS.RECOGNIZERS_DISAGREE:
      return "Woof could not confirm one exact product from this photo.";
    case LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT:
      return "The product line was recognized, but the exact recipe was not confirmed.";
    case LABEL_RESOLUTION_DECISIONS.NON_COMPLETE_CONFIRMED:
      return "This label was confirmed as a treat, topper, mixer, or supplement.";
    case LABEL_RESOLUTION_DECISIONS.TIMED_OUT:
      return "The photo took too long to confirm. The recognized text is ready to search.";
    case LABEL_RESOLUTION_DECISIONS.NOT_READABLE:
      return "No readable product identity was found. Retake the front label or search by name.";
    default:
      return "Choose a matching package only if the brand and recipe are exact.";
  }
}

export function reconcileLabelOutcomes(outcomes = [], {
  autoOpenEnabled = false,
  strictMatching = true,
} = {}) {
  const completed = outcomes.filter((outcome) => outcome?.result);
  const visual = completed.find((outcome) => outcome.path === "cloud_image");
  const ocr = completed.find((outcome) => outcome.path === "on_device_ocr");
  const errors = outcomes.filter((outcome) => outcome?.error);
  const products = mergeCandidateProducts(completed);
  const primary = ocr || visual || completed[0] || null;
  const primaryIdentification = { ...outcomeIdentity(primary) };
  const visualIdentification = outcomeIdentity(visual);
  const ocrIdentification = outcomeIdentity(ocr);
  const visibleOcrIdentification = outcomeVisibleIdentity(ocr);
  const visualSelected = outcomeSelected(visual);
  const ocrSelected = outcomeSelected(ocr);
  const identityComparison = visual && ocr
    ? compareLabelIdentities(visibleOcrIdentification, visualIdentification)
    : { compatible: true, agreementFields: [], disagreementFields: [], reasonCodes: [] };
  const bothExcluded = visualIdentification.excluded === true && ocrIdentification.excluded === true;
  let decision = LABEL_RESOLUTION_DECISIONS.NOT_READABLE;
  let confirmedProduct = null;
  const reasonCodes = [...identityComparison.reasonCodes];

  if (completed.length === 0) {
    decision = errors.some(outcomeTimedOut)
      ? LABEL_RESOLUTION_DECISIONS.TIMED_OUT
      : LABEL_RESOLUTION_DECISIONS.NOT_READABLE;
  } else if (bothExcluded) {
    decision = LABEL_RESOLUTION_DECISIONS.NON_COMPLETE_CONFIRMED;
  } else if (
    visualIdentification.excluded === true
    || ocrIdentification.excluded === true
    || (visual && ocr && !identityComparison.compatible)
  ) {
    decision = LABEL_RESOLUTION_DECISIONS.RECOGNIZERS_DISAGREE;
    reasonCodes.push("recognizer_identity_conflict");
  } else if (visual && ocr && visualSelected && ocrSelected) {
    const sameFormula = productKey(visualSelected) === productKey(ocrSelected);
    const visibleCandidateComparisons = [
      compareLabelIdentities(
        visibleOcrIdentification,
        visualSelected,
        { requireVisibleCandidateVariants: true }
      ),
      compareLabelIdentities(
        visualIdentification,
        visualSelected,
        { requireVisibleCandidateVariants: true }
      ),
    ];
    if (sameFormula && visibleCandidateComparisons.every((comparison) => comparison.compatible)) {
      decision = LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED;
      confirmedProduct = visualSelected;
    } else {
      decision = LABEL_RESOLUTION_DECISIONS.RECOGNIZERS_DISAGREE;
      reasonCodes.push(
        ...visibleCandidateComparisons.flatMap((comparison) => comparison.reasonCodes),
        sameFormula ? "candidate_variant_not_confirmed" : "recognizers_selected_different_products"
      );
    }
  } else if (visual && ocr) {
    decision = products.length > 0
      ? LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT
      : LABEL_RESOLUTION_DECISIONS.NOT_READABLE;
    reasonCodes.push("exact_candidate_not_supported_by_both_paths");
  } else if (errors.some(outcomeTimedOut)) {
    const deterministicProduct = ocr ? deterministicOcrProduct(ocr) : null;
    if (deterministicProduct) {
      decision = LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED;
      confirmedProduct = deterministicProduct;
      reasonCodes.push("deterministic_ocr_unique_identity");
    } else {
      decision = products.length > 0
        ? LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT
        : LABEL_RESOLUTION_DECISIONS.TIMED_OUT;
      reasonCodes.push("recognizer_timed_out");
    }
  } else {
    const deterministicProduct = ocr ? deterministicOcrProduct(ocr) : null;
    if (deterministicProduct) {
      decision = LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED;
      confirmedProduct = deterministicProduct;
      reasonCodes.push("deterministic_ocr_unique_identity");
    } else {
      decision = products.length > 0
        ? LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT
        : LABEL_RESOLUTION_DECISIONS.NOT_READABLE;
      reasonCodes.push("single_recognizer_only");
    }
  }

  const selectedProduct = decision === LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED
    && autoOpenEnabled
    && strictMatching
    ? confirmedProduct
    : null;
  const labelRead = Boolean(
    primaryIdentification.found
    || visualIdentification.found
    || ocrIdentification.found
    || completed.length > 0
  );
  const identification = {
    ...primaryIdentification,
    // `found` is a catalog/identity outcome, not merely "some OCR text was
    // readable". A timeout with zero candidates must never report success.
    found: ![
      LABEL_RESOLUTION_DECISIONS.NOT_READABLE,
      LABEL_RESOLUTION_DECISIONS.TIMED_OUT,
    ].includes(decision),
    labelRead,
    excluded: decision === LABEL_RESOLUTION_DECISIONS.NON_COMPLETE_CONFIRMED,
    exclusionReason: decision === LABEL_RESOLUTION_DECISIONS.NON_COMPLETE_CONFIRMED
      ? (primaryIdentification.exclusionReason || "This is not a complete pet food.")
      : "",
    notes: resultNote(decision),
  };

  return {
    decision,
    status: decision,
    identification,
    products,
    confirmedProduct,
    selectedProduct,
    confidence: Math.min(
      Number(visualIdentification.confidence || 0),
      Number(ocrIdentification.confidence || 0)
    ),
    resolutionEvidence: {
      pathsAvailable: completed.map((outcome) => outcome.path),
      pathsFailed: errors.map((outcome) => outcome.path),
      recognizedIdentity: {
        onDeviceOcr: identityEvidence(visibleOcrIdentification),
        cloudImage: identityEvidence(visualIdentification),
      },
      agreementFields: identityComparison.agreementFields,
      disagreementFields: identityComparison.disagreementFields,
      reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
      rejectedCandidateReasons: [...new Set(reasonCodes.filter(Boolean))],
      confidenceMargin: {
        onDeviceOcr: outcomeConfidenceMargin(ocr),
        cloudImage: outcomeConfidenceMargin(visual),
      },
      stageLatencyMs: Object.fromEntries(
        outcomes
          .filter((outcome) => outcome?.path)
          .map((outcome) => [outcome.path, Number(outcome.latencyMs) || null])
      ),
      visualConfirmation: confirmedProduct
        ? (reasonCodes.includes("deterministic_ocr_unique_identity")
          ? "deterministic_ocr_photo_identity"
          : "cloud_and_ocr_catalog_agreement")
        : "not_confirmed",
      strictMatching,
      autoOpenEnabled,
      autoOpenFired: Boolean(selectedProduct),
      resultMode: selectedProduct ? "auto_open" : "candidate_list_or_abstention",
      confirmedCandidate: identityEvidence(confirmedProduct || {}),
    },
  };
}
