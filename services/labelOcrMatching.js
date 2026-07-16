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
const QUERY_NOISE = new Set([
  "all",
  "appropriate",
  "bag",
  "biolosically",
  "breeds",
  "balanced",
  "caught",
  "cat",
  "cats",
  "complete",
  "crafted",
  "crunchy",
  "dha",
  "df",
  "dog",
  "dogs",
  "every",
  "ecommendeo",
  "essential",
  "essentials",
  "food",
  "foods",
  "fis",
  "high",
  "ib",
  "kibble",
  "made",
  "maman",
  "natural",
  "needs",
  "net",
  "new",
  "nutrition",
  "nutritious",
  "nuteitional",
  "no",
  "ounces",
  "pound",
  "pounds",
  "real",
  "recommended",
  "recommendeo",
  "serving",
  "shreds",
  "since",
  "support",
  "tailbred",
  "taste",
  "the",
  "to",
  "veterinarian",
  "vet",
  "weight",
  "wild",
  "puppies",
]);
const MEASUREMENT_TERMS = new Set([
  "g",
  "gram",
  "grams",
  "kg",
  "lb",
  "lbs",
  "oz",
]);
const OCR_TOKEN_ALIASES = new Map([
  ["cats", "cat"],
  ["dogs", "dog"],
  ["hearted", "wholehearted"],
  ["ib", "lb"],
  ["kittens", "kitten"],
  ["orien", "orijen"],
  ["0z", "oz"],
  ["puppies", "puppy"],
  ["bravor", "brown"],
  ["recipo", "recipe"],
  ["rico", "rice"],
  ["webdar", "cheddar"],
]);
const OCR_PHRASE_ALIASES = new Map([
  ["grand chien", "large dog"],
  ["good gut", "goodgut"],
  ["hill s", "hill"],
  ["raw mix", "rawmix"],
  ["whole hearted", "wholehearted"],
]);
const IDENTITY_HINTS = new Set([
  "adult", "ancient", "beef", "bison", "brown", "cat", "cheddar", "chicken", "cod", "consult",
  "dehydrated", "dog", "duck", "fish", "free", "grain", "grains", "gravy", "indoor", "kitten",
  "goodgut", "lamb", "large", "liver", "mature", "mousse", "oatmeal", "pate", "prairie", "puppy", "pumpkin", "rabbit",
  "rawmix", "rice", "salmon", "senior", "sensitive", "small", "stew", "sweet", "trout", "tuna", "turkey",
  "urinary", "venison", "whitefish",
]);
const MAX_QUERY_COUNT = 8;
const MIN_CANDIDATE_SCORE = 0.34;
const AUTO_OPEN_SCORE = 0.68;
const AUTO_OPEN_MARGIN = 0.09;
const BRAND_NOISE = new Set(["and", "food", "foods", "nutrition", "pet", "pets", "the"]);
const KNOWN_BRAND_PHRASES = [
  "hill science diet",
  "purina pro plan",
  "purina one",
  "fancy feast",
  "royal canin",
  "stella chewy",
  "the honest kitchen",
  "blue buffalo",
  "open farm",
  "wholehearted",
  "wellness",
  "instinct",
  "orijen",
  "acana",
];
const SEARCH_BRAND_ALIASES = new Map([
  ["hill science diet", "science diet"],
]);
const LIFE_STAGE_TERMS = new Set([
  "kitten", "mature", "puppy", "senior",
]);
const PRIMARY_RECIPE_TERMS = new Set([
  "beef", "bison", "chicken", "cod", "crab", "duck", "fish", "goat", "lamb", "liver",
  "mackerel", "pollock", "quail", "rabbit", "salmon", "sardine", "sardines", "shrimp",
  "trout", "tuna", "turkey", "venison", "whitefish",
]);
const REQUIRED_OCR_VARIANT_TERMS = new Set([
  "95", "ancient", "coat", "consult", "core", "cravings", "digestive", "digestion", "freshdried", "goodgut",
  "game", "harvest", "healthy", "indoor", "kitten", "large", "mixers", "peakboost",
  "mature", "perfect", "prairie", "prescription", "puppy", "rawmix", "reserve", "senior", "sensitive", "skin",
  "small", "toy", "urinary", "weight", "wilderness",
]);
const CANDIDATE_ONLY_VARIANT_TERMS = new Set([
  "95", "healthy", "indoor", "large", "prescription", "puppy", "senior", "small", "toy",
  "urinary", "weight",
]);

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  let normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [phrase, replacement] of OCR_PHRASE_ALIASES) {
    normalized = normalized.replace(new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "g"), replacement);
  }
  normalized = normalized
    .split(" ")
    .map((token) => OCR_TOKEN_ALIASES.get(token) || token)
    .join(" ");
  return normalized;
}

export function normalizeLabelOcrText(value) {
  return normalizeText(value);
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

function normalizedTokens(value) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

function inferredPetType(value) {
  const tokens = normalizedTokens(value);
  if (["dog", "dogs", "puppy", "puppies", "canine"].some((token) => tokens.has(token))) return "dog";
  if (["cat", "cats", "kitten", "kittens", "feline"].some((token) => tokens.has(token))) return "cat";
  return "";
}

function inferredFoodForm(value) {
  const text = normalizeText(value);
  if (/\b(dry|kibble)\b/.test(text)) return "dry";
  if (/\b(freeze dried|freshdried|dehydrated|air dried)\b/.test(text)) return "freeze_dried";
  if (/\b(wet|canned|pate|loaf|mousse|stew|gravy|sauce|morsels|shreds|cuts|pouch|tray)\b/.test(text)) return "wet";
  if (/\b(fresh|refrigerated|frozen)\b/.test(text)) return "fresh";
  return "";
}

function brandVisibleInOcr(product = {}, ocrText = "") {
  const ocrTokens = normalizedTokens(ocrText);
  const brandTokens = normalizeText(product.brand)
    .split(" ")
    .filter((token) => token.length >= 3 && !BRAND_NOISE.has(token));
  if (brandTokens.length === 0) return true;
  return brandTokens.some((token) => ocrTokens.has(token));
}

function hasCompatibleOcrIdentity(product = {}, ocrText = "") {
  if (!brandVisibleInOcr(product, ocrText)) return false;

  const ocrPetType = inferredPetType(ocrText);
  const productPetType = inferredPetType(productIdentityText(product)) || String(product.petType || "").toLowerCase();
  if (ocrPetType && productPetType && ocrPetType !== productPetType) return false;

  const ocrFoodForm = inferredFoodForm(ocrText);
  const productFoodForm = inferredFoodForm(productIdentityText(product)) || String(product.foodForm || "").toLowerCase();
  if (ocrFoodForm && productFoodForm && ocrFoodForm !== productFoodForm) return false;

  const ocrTokens = normalizedTokens(ocrText);
  const productTokens = normalizedTokens(productIdentityText(product));
  const productVisibleIdentityTokens = normalizedTokens([
    product.productName,
    product.productLine,
    product.flavor,
  ].join(" "));
  const ocrRecipeTerms = [...PRIMARY_RECIPE_TERMS].filter((term) => ocrTokens.has(term));
  const productRecipeTerms = [...PRIMARY_RECIPE_TERMS].filter((term) => productTokens.has(term));
  if (
    ocrRecipeTerms.length > 0 &&
    productRecipeTerms.length > 0 &&
    !productRecipeTerms.some((term) => ocrTokens.has(term))
  ) {
    return false;
  }

  for (const term of REQUIRED_OCR_VARIANT_TERMS) {
    if (ocrTokens.has(term) && !productTokens.has(term)) return false;
  }
  for (const term of CANDIDATE_ONLY_VARIANT_TERMS) {
    if (productVisibleIdentityTokens.has(term) && !ocrTokens.has(term)) return false;
  }
  if (ocrTokens.has("wild") && ocrTokens.has("game") && !productTokens.has("wild")) {
    return false;
  }

  return true;
}

export function filterProductsForOcr(products = [], ocrText = "") {
  if (!normalizeText(ocrText)) return [];
  return (Array.isArray(products) ? products : [])
    .filter((product) => hasCompatibleOcrIdentity(product, ocrText));
}

function tokenSet(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !MATCH_STOP_WORDS.has(token))
  );
}

function searchLine(value) {
  const tokens = normalizeText(value)
    .split(" ")
    .map((token) => OCR_TOKEN_ALIASES.get(token) || token)
    .filter((token) => (
      token.length >= 2 &&
      !QUERY_NOISE.has(token) &&
      !MEASUREMENT_TERMS.has(token) &&
      !/^\d+(?:\.\d+)?$/.test(token)
    ));

  return [...new Set(tokens)].slice(0, 8).join(" ");
}

function distinctiveTokenCount(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => (
      token.length >= 3 &&
      !MATCH_STOP_WORDS.has(token) &&
      !QUERY_NOISE.has(token)
    )).length;
}

function tokenCoverage(needleValue, haystackValue) {
  const needle = tokenSet(needleValue);
  const haystack = tokenSet(haystackValue);
  if (needle.size === 0) return 0;

  let matches = 0;
  needle.forEach((token) => {
    if (haystack.has(token)) matches += 1;
  });
  return matches / needle.size;
}

export function labelOcrSearchQueries(ocrText, ocrLines = []) {
  const sourceLines = (Array.isArray(ocrLines) && ocrLines.length > 0
    ? ocrLines.map((line) => {
      if (typeof line === "string") return line;
      const confidence = Number(line?.confidence);
      if (Number.isFinite(confidence) && confidence < 0.4) return "";
      return line?.text;
    })
    : String(ocrText || "").split(/\r?\n/))
    .map(searchLine)
    .filter((line) => line.length >= 2 && distinctiveTokenCount(line) > 0)
    .slice(0, 10);

  const weighted = [];
  const add = (query, score) => {
    const compactQuery = [...new Set(normalizeText(query).split(" ").filter(Boolean))]
      .slice(0, 10)
      .join(" ");
    if (compactQuery.length < 2) return;
    weighted.push({ query: compactQuery, score });
  };

  let identityHints = [...new Set(
    normalizeText(ocrText)
      .split(" ")
      .map((token) => OCR_TOKEN_ALIASES.get(token) || token)
      .filter((token) => IDENTITY_HINTS.has(token))
  )];
  if (identityHints.includes("puppy") || identityHints.includes("kitten")) {
    identityHints = identityHints.filter((token) => token !== "adult");
  }
  const normalizedOcr = normalizeText(ocrText);
  const detectedBrand = KNOWN_BRAND_PHRASES.find((brand) => normalizedOcr.includes(brand)) || "";
  const focusedIdentityHints = identityHints.filter((token) => (
    !["adult", "free", "grain", "grains", "gravy", "wet", "dry"].includes(token)
  ));
  if (detectedBrand) {
    const speciesHints = focusedIdentityHints.filter((token) => token === "cat" || token === "dog");
    const variantHints = focusedIdentityHints.filter((token) => token !== "cat" && token !== "dog");
    const prioritizedVariantHints = [
      ...variantHints.filter((token) => LIFE_STAGE_TERMS.has(token)),
      ...variantHints.filter((token) => PRIMARY_RECIPE_TERMS.has(token)),
      ...variantHints.filter((token) => (
        !LIFE_STAGE_TERMS.has(token) && !PRIMARY_RECIPE_TERMS.has(token)
      )),
    ];
    const searchBrandAlias = SEARCH_BRAND_ALIASES.get(detectedBrand);
    if (searchBrandAlias && prioritizedVariantHints.length > 0) {
      add(`${searchBrandAlias} ${prioritizedVariantHints.slice(0, 2).join(" ")}`, 510);
      add(`${searchBrandAlias} ${prioritizedVariantHints.slice(0, 2).join(" ")} ${speciesHints.join(" ")}`, 508);
    }
    add(`${detectedBrand} ${prioritizedVariantHints.join(" ")} ${speciesHints.join(" ")}`, 500);
    if (prioritizedVariantHints.length > 0) {
      add(`${detectedBrand} ${prioritizedVariantHints[0]}`, 498);
      add(`${detectedBrand} ${prioritizedVariantHints[0]} ${speciesHints.join(" ")}`, 496);
      add(`${detectedBrand} ${prioritizedVariantHints.slice(0, 2).join(" ")} ${speciesHints.join(" ")}`, 494);
    }
  }

  if (sourceLines.length > 0) {
    add(`${sourceLines.slice(0, 3).join(" ")} ${identityHints.join(" ")}`, 300);
  }
  if (sourceLines.length > 1) {
    add(`${sourceLines.slice(0, 2).join(" ")} ${identityHints.join(" ")}`, 280);
  }

  sourceLines.forEach((line, index) => add(line, 90 - index * 3));
  sourceLines.forEach((line, leftIndex) => {
    const maxRight = Math.min(sourceLines.length, leftIndex + 5);
    for (let rightIndex = leftIndex + 1; rightIndex < maxRight; rightIndex += 1) {
      add(`${line} ${sourceLines[rightIndex]}`, 150 - leftIndex * 6 - rightIndex * 2);
    }
  });

  if (sourceLines.length >= 2) add(sourceLines.slice(0, 3).join(" "), 170);
  for (let index = 2; index < Math.min(sourceLines.length, 8); index += 1) {
    add(`${sourceLines[0]} ${sourceLines[index]}`, 145 - index);
  }

  const focusedLines = sourceLines.filter((line) => {
    const tokens = normalizeText(line).split(" ").filter(Boolean);
    if (tokens.length === 0 || tokens.length > 5) return false;
    return tokens.length <= 3 || tokens.some((token) => IDENTITY_HINTS.has(token));
  });
  if (focusedLines.length > 0) {
    add(`${focusedLines.slice(0, 5).join(" ")} ${identityHints.join(" ")}`, 360);
    add(focusedLines.slice(0, 5).join(" "), 355);
    focusedLines.forEach((line, leftIndex) => {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < Math.min(focusedLines.length, leftIndex + 4);
        rightIndex += 1
      ) {
        add(`${line} ${focusedLines[rightIndex]} ${identityHints.join(" ")}`, 330 - leftIndex * 4);
        add(`${line} ${focusedLines[rightIndex]}`, 345 - leftIndex * 4);
      }
    });
  }

  const deduped = new Map();
  weighted.forEach(({ query, score }) => {
    const key = normalizeText(query);
    const current = deduped.get(key);
    if (!current || score > current.score) deduped.set(key, { query, score });
  });

  return [...deduped.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_QUERY_COUNT)
    .map(({ query }) => query);
}

export function labelOcrProductMatchScore(product = {}, ocrText = "") {
  const normalizedOcr = normalizeText(ocrText);
  if (!normalizedOcr) return 0;

  const identity = productIdentityText(product);
  const brandCoverage = tokenCoverage(product.brand, normalizedOcr);
  const nameCoverage = tokenCoverage(product.productName, normalizedOcr);
  const identityCoverage = tokenCoverage(identity, normalizedOcr);
  const normalizedName = normalizeText(product.productName);
  const exactNameBonus = normalizedName.length >= 8 && normalizedOcr.includes(normalizedName) ? 0.14 : 0;
  const packageSize = normalizeText(product.packageSize);
  const packageSizeMatch = packageSize.match(/\b(\d+(?:\.\d+)?)\s*(lb|lbs|oz|kg|g)\b/);
  const packageSizeBonus = packageSizeMatch && new RegExp(
    `\\b${packageSizeMatch[1].replace(".", "\\.")}\\s*${packageSizeMatch[2]}s?\\b`
  ).test(normalizedOcr)
    ? 0.12
    : 0;

  return Math.min(1, (
    brandCoverage * 0.26 +
    nameCoverage * 0.46 +
    identityCoverage * 0.28 +
    exactNameBonus +
    packageSizeBonus
  ));
}

export function rankProductsForOcr(products = [], ocrText = "") {
  return products
    .map((product) => ({
      ...product,
      ocrMatchScore: labelOcrProductMatchScore(product, ocrText),
    }))
    .filter((product) => product.ocrMatchScore >= MIN_CANDIDATE_SCORE)
    .sort((left, right) => (
      right.ocrMatchScore - left.ocrMatchScore ||
      Number(right.rank || 0) - Number(left.rank || 0)
    ));
}

export function pickVerifiedProductForOcr(products = [], ocrText = "") {
  const [best, runnerUp] = products;
  if (!best || best.ocrMatchScore < AUTO_OPEN_SCORE) return null;
  if (distinctiveTokenCount(ocrText) < 3) return null;
  if (runnerUp && best.ocrMatchScore - runnerUp.ocrMatchScore < AUTO_OPEN_MARGIN) return null;
  return best;
}
