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
  "helps",
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
  ["cacien", "chicken"],
  ["gand", "grain"],
  ["nelps", "helps"],
  ["rachaelray", "rachael ray"],
  ["recpl", "recipe"],
  ["recipo", "recipe"],
  ["rico", "rice"],
  ["webdar", "cheddar"],
]);
const OCR_PHRASE_ALIASES = new Map([
  ["grand chien", "large dog"],
  ["good gut", "goodgut"],
  ["hill s", "hill"],
  ["moist meaty", "moist and meaty"],
  ["raw mix", "rawmix"],
  ["whole hearted", "wholehearted"],
]);
const IDENTITY_HINTS = new Set([
  "adult", "ancient", "beef", "beneful", "bison", "brown", "burger", "cat", "cheddar", "chicken", "cod", "consult",
  "dehydrated", "dog", "duck", "fish", "free", "grain", "grains", "gravy", "indoor", "kitten",
  "goodgut", "lamb", "large", "liver", "mature", "meaty", "minichunks", "moist", "mousse", "oatmeal", "ocean", "originals",
  "pate", "prairie", "proactive", "puppy", "pumpkin", "rabbit", "rawmix", "rice", "salmon", "senior", "sensitive", "small",
  "stew", "sweet", "terrain", "trout", "tuna", "turkey", "wild",
  "urinary", "venison", "whitefish",
]);
const MAX_QUERY_COUNT = 8;
const MIN_CANDIDATE_SCORE = 0.34;
const AUTO_OPEN_SCORE = 0.68;
const AUTO_OPEN_MARGIN = 0.09;
const PRIMARY_PACKAGE_MIN_X = 0.18;
const PRIMARY_PACKAGE_MAX_X = 0.82;
const PRIMARY_PACKAGE_MIN_LINES = 3;
const PAGE_CHROME_BOUNDARY_PATTERNS = [
  /\bclick\s+to\s+(?:see|view)\b/i,
  /\btap\s+to\s+(?:zoom|view)\b/i,
  /\b(?:see|view)\s+full\s+(?:image|size|view)\b/i,
];
const PAGE_CHROME_LINE_PATTERNS = [
  /\btestflight(?:\s+build)?\b/i,
  /\byc\s+application(?:\s+audit)?\b/i,
  /^\s*amazon\s*$/i,
  /\bsearch\s+amazon\b/i,
  /\b(?:join\s+prime|today['’]?s\s+deals|deliver\s+to)\b/i,
  /\b(?:chrome|file|edit|view|history|bookmarks|profiles|tab|window|help)\b.*\b(?:chrome|file|edit|view|history|bookmarks|profiles|tab|window|help)\b/i,
];
const MARKETING_BENEFIT_PATTERNS = [
  /\bsupports?\s+sensitive\s+skin\s+(?:&|and)\s+stomach(?:\s+guaranteed)?\b/gi,
  /\bsensitive\s+skin\s+(?:&|and)\s+stomach\s+guaranteed\b/gi,
  /\bfor\s+digestion\s+immune\s+system\s+(?:&|and)\s+organ\s+health\b/gi,
  /\bcalcium\s+(?:&|and)\s+phosphorus\s+for\s+strong\s+bones\b/gi,
  /\bformulated\s+to\s+support\s+whole\s+body\s+health\s+(?:&|and)\s+vitality\b/gi,
  /\bproactive\s*5[\s\S]{0,120}?\bskin\s*(?:&|and)\s*coat\b/gi,
];
const BRAND_NOISE = new Set(["and", "food", "foods", "nutrition", "pet", "pets", "the"]);
const KNOWN_BRAND_PHRASES = [
  "purina moist and meaty",
  "hill science diet",
  "rachael ray nutrish",
  "purina pro plan",
  "purina one",
  "fancy feast",
  "beneful",
  "moist and meaty",
  "royal canin",
  "stella chewy",
  "the honest kitchen",
  "blue buffalo",
  "open farm",
  "iams",
  "science diet",
  "nutrish",
  "nutro natural choice",
  "nutro",
  "wholehearted",
  "wellness",
  "instinct",
  "orijen",
  "acana",
];
const SEARCH_BRAND_ALIASES = new Map([
  ["hill science diet", "science diet"],
  ["rachael ray nutrish", "nutrish"],
  ["moist and meaty", "moist meaty"],
  ["purina moist and meaty", "moist meaty"],
]);
const LIFE_STAGE_TERMS = new Set([
  "kitten", "mature", "puppy", "senior",
]);
const PRIMARY_RECIPE_TERMS = new Set([
  "beef", "bison", "burger", "cheddar", "chicken", "cod", "crab", "duck", "fish", "goat", "lamb", "liver",
  "mackerel", "pollock", "quail", "rabbit", "salmon", "sardine", "sardines", "shrimp",
  "trout", "tuna", "turkey", "venison", "whitefish",
]);
const PROTECTED_VARIANT_PHRASES = [
  "burger with cheddar",
  "burger cheddar",
  "front range",
  "healthy weight",
  "open prairie",
  "purina one plus",
  "small bites",
  "small breed",
  "small mini",
  "tide terrain",
  "weight management",
  "wild ocean",
];
const EXCLUSIVE_PRODUCT_LINE_PHRASES = ["small bites", "small breed", "small mini"];
const REQUIRED_OCR_VARIANT_TERMS = new Set([
  "95", "ancient", "coat", "consult", "core", "cravings", "digestive", "digestion", "freshdried", "goodgut",
  "game", "harvest", "healthy", "indoor", "kitten", "large", "mixers", "peakboost",
  "mature", "perfect", "prairie", "prescription", "puppy", "rawmix", "reserve", "senior", "sensitive", "skin",
  "small", "toy", "urinary", "wilderness",
]);
const CANDIDATE_ONLY_VARIANT_TERMS = new Set([
  "95", "healthy", "indoor", "large", "plus", "prescription", "puppy", "senior", "small", "toy",
  "urinary", "weight",
]);

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripMarketingBenefitClaims(value) {
  let identityText = String(value || "");
  for (const pattern of MARKETING_BENEFIT_PATTERNS) {
    identityText = identityText.replace(pattern, " ");
  }
  return compact(identityText);
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
  return normalized.replace(/\bsmall and mini\b/g, "small mini");
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

function lifeStageGroup(value, { product = false } = {}) {
  const visibleText = product && value && typeof value === "object"
    ? [
      value.lifeStage,
      value.life_stage,
      value.productLine,
      value.product_line,
      value.productName,
      value.product_name,
      value.flavor,
    ].map(compact).filter(Boolean).join(" ")
    : value;
  const text = normalizeText(visibleText);
  if (/\bpuppy\b/.test(text)) return "puppy";
  if (/\bkitten\b/.test(text)) return "kitten";
  if (/\b(?:senior|mature)\b|\badult\s+(?:7|11)(?:\s+plus)?\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  return "";
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
  if (/\b(semi moist|soft and meaty|soft meaty)\b/.test(text)) return "semi_moist";

  // RawMix and similar kibble can truthfully advertise freeze-dried coating
  // and chunks without the complete product itself being freeze-dried.
  if (
    /\brawmix\b/.test(text) &&
    /\b(raw|broth)\s+coated\b|\braw\s+chunks?\b/.test(text)
  ) {
    return "";
  }

  const forms = new Set();
  if (/\b(dry|kibble)\b/.test(text)) forms.add("dry");
  if (/\b(freeze dried|freshdried|dehydrated|air dried)\b/.test(text)) forms.add("freeze_dried");
  if (/\b(wet|canned|pate|loaf|mousse|stew|gravy|sauce|morsels|shreds|cuts)\b/.test(text)) {
    forms.add("wet");
  }
  if (/\b(fresh|refrigerated|frozen)\b/.test(text)) forms.add("fresh");
  return forms.size === 1 ? [...forms][0] : "";
}

function canonicalFoodForm(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "_");
  if (normalized.includes("semi_moist")) return "semi_moist";
  if (normalized.includes("freeze_dried") || normalized.includes("dehydrated")) return "freeze_dried";
  if (normalized.includes("air_dried")) return "freeze_dried";
  if (normalized === "dry" || normalized.includes("kibble")) return "dry";
  if (normalized === "wet" || normalized.includes("canned")) return "wet";
  if (normalized === "fresh" || normalized.includes("refrigerated") || normalized.includes("frozen")) {
    return "fresh";
  }
  return normalized;
}

function primaryPackageOcrLines(ocrLines = []) {
  const structuredLines = (Array.isArray(ocrLines) ? ocrLines : [])
    .filter((line) => line && typeof line === "object" && compact(line.text))
    .filter((line) => {
      const confidence = Number(line.confidence);
      return !Number.isFinite(confidence) || confidence >= 0.4;
    });
  const boundedLines = structuredLines.filter((line) => {
    const bounds = line.bounds;
    return bounds && [bounds.x, bounds.y, bounds.width, bounds.height]
      .every((value) => Number.isFinite(Number(value)));
  });
  const centeredLines = boundedLines.filter((line) => {
    const centerX = Number(line.bounds.x) + Number(line.bounds.width) / 2;
    return centerX >= PRIMARY_PACKAGE_MIN_X && centerX <= PRIMARY_PACKAGE_MAX_X;
  });
  const packageLines = centeredLines.length >= PRIMARY_PACKAGE_MIN_LINES
    ? centeredLines
    : structuredLines;

  // Retailer image viewers often place flavor thumbnails and recommendations
  // directly below the main package. Vision reads that text too, which can add
  // a sibling recipe or even the wrong species to an otherwise exact label.
  // When the page exposes a clear image-viewer boundary, keep only the package
  // side of that boundary. Vision uses bottom-left coordinates on iOS while
  // Android ML Kit uses top-left coordinates, so infer the direction from the
  // boundary's normalized position instead of assuming one platform.
  const boundaryLine = packageLines.find((line) => (
    PAGE_CHROME_BOUNDARY_PATTERNS.some((pattern) => pattern.test(compact(line.text)))
  ));
  if (!boundaryLine?.bounds) return packageLines;

  const boundaryCenterY = Number(boundaryLine.bounds.y) + Number(boundaryLine.bounds.height) / 2;
  if (!Number.isFinite(boundaryCenterY) || (boundaryCenterY > 0.35 && boundaryCenterY < 0.65)) {
    return packageLines;
  }

  const packageIsAboveBoundary = boundaryCenterY >= 0.65;
  const croppedLines = packageLines.filter((line) => {
    if (!line.bounds) return false;
    const centerY = Number(line.bounds.y) + Number(line.bounds.height) / 2;
    if (!Number.isFinite(centerY)) return false;
    return packageIsAboveBoundary
      ? centerY < boundaryCenterY
      : centerY > boundaryCenterY;
  });

  return croppedLines.length >= PRIMARY_PACKAGE_MIN_LINES
    ? croppedLines
    : packageLines;
}

export function primaryPackageOcrText(ocrText, ocrLines = []) {
  const centeredLines = primaryPackageOcrLines(ocrLines);
  if (centeredLines.length < PRIMARY_PACKAGE_MIN_LINES) {
    return stripMarketingBenefitClaims(ocrText);
  }
  return stripMarketingBenefitClaims(
    centeredLines.map((line) => compact(line.text)).filter(Boolean).join("\n")
  );
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
  const productFoodForm = inferredFoodForm(productIdentityText(product))
    || canonicalFoodForm(product.foodForm);
  if (ocrFoodForm && productFoodForm && ocrFoodForm !== productFoodForm) return false;

  const ocrLifeStage = lifeStageGroup(ocrText);
  const productLifeStage = lifeStageGroup(product, { product: true });
  if (ocrLifeStage && productLifeStage && ocrLifeStage !== productLifeStage) return false;

  const ocrTokens = normalizedTokens(ocrText);
  const productTokens = normalizedTokens(productIdentityText(product));
  const normalizedOcrText = normalizeText(ocrText);
  const normalizedProductText = normalizeText(productIdentityText(product));
  const grainFreePattern = /\bgrains?(?:\s+and)?(?:\s+legume)?\s+free\b/;
  const withGrainPattern = /\b(?:with\s+grains?|ancient\s+grains?)\b/;
  const ocrSaysGrainFree = grainFreePattern.test(normalizedOcrText);
  const productSaysGrainFree = grainFreePattern.test(normalizedProductText);
  const ocrSaysWithGrain = withGrainPattern.test(normalizedOcrText);
  const productSaysWithGrain = withGrainPattern.test(normalizedProductText);
  if (ocrSaysGrainFree && (!productSaysGrainFree || productSaysWithGrain)) return false;
  if (ocrSaysWithGrain && (productSaysGrainFree || !productSaysWithGrain)) return false;

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
    ocrRecipeTerms.some((term) => !productTokens.has(term))
  ) {
    return false;
  }
  for (const phrase of PROTECTED_VARIANT_PHRASES) {
    if (normalizedOcrText.includes(phrase) && !normalizedProductText.includes(phrase)) return false;
  }
  const ocrExclusiveLine = EXCLUSIVE_PRODUCT_LINE_PHRASES.find((phrase) => (
    normalizedOcrText.includes(phrase)
  ));
  const productExclusiveLine = EXCLUSIVE_PRODUCT_LINE_PHRASES.find((phrase) => (
    normalizedProductText.includes(phrase)
  ));
  if (ocrExclusiveLine && productExclusiveLine && ocrExclusiveLine !== productExclusiveLine) {
    return false;
  }

  for (const term of REQUIRED_OCR_VARIANT_TERMS) {
    if (ocrTokens.has(term) && !productTokens.has(term)) return false;
  }
  for (const term of CANDIDATE_ONLY_VARIANT_TERMS) {
    if (
      (term === "senior" || term === "mature")
      && ocrLifeStage === "senior"
      && productLifeStage === "senior"
    ) {
      continue;
    }
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
  const primaryLines = primaryPackageOcrLines(ocrLines);
  const primaryText = primaryPackageOcrText(ocrText, ocrLines);
  const sourceLines = String(primaryText || "").split(/\r?\n/)
    .filter((line) => !PAGE_CHROME_LINE_PATTERNS.some((pattern) => pattern.test(compact(line))))
    .map(searchLine)
    .filter((line) => line.length >= 2 && distinctiveTokenCount(line) > 0)
    .slice(0, 10);

  const weighted = [];
  const add = (query, score) => {
    const compactQuery = [...new Set(
      normalizeText(query).split(" ").filter((token) => token && token !== "and")
    )]
      .slice(0, 10)
      .join(" ");
    if (compactQuery.length < 2) return;
    weighted.push({ query: compactQuery, score });
  };

  let identityHints = [...new Set(
    normalizeText(primaryText)
      .split(" ")
      .map((token) => OCR_TOKEN_ALIASES.get(token) || token)
      .filter((token) => IDENTITY_HINTS.has(token))
  )];
  if (identityHints.includes("puppy") || identityHints.includes("kitten")) {
    identityHints = identityHints.filter((token) => token !== "adult");
  }
  const normalizedOcr = normalizeText(primaryText);
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
  const packageSizeBonus = packageSizeMatchesOcr(product, normalizedOcr) ? 0.12 : 0;

  return Math.min(1, (
    brandCoverage * 0.26 +
    nameCoverage * 0.46 +
    identityCoverage * 0.28 +
    exactNameBonus +
    packageSizeBonus
  ));
}

function packageSizeMatchesOcr(product = {}, ocrText = "") {
  const packageSize = String(product.packageSize || "").toLowerCase();
  const packageSizeMatch = packageSize.match(/\b(\d+(?:\.\d+)?)\s*(lb|lbs|oz|kg|g)\b/);
  if (!packageSizeMatch) return false;
  return new RegExp(
    `\\b${packageSizeMatch[1].replace(".", "\\.")}\\s*${packageSizeMatch[2]}s?\\b`
  ).test(String(ocrText || "").toLowerCase());
}

export function rankProductsForOcr(products = [], ocrText = "") {
  return products
    .map((product) => ({
      ...product,
      ocrMatchScore: labelOcrProductMatchScore(product, ocrText),
      ocrPackageSizeMatch: packageSizeMatchesOcr(product, ocrText) ? 1 : 0,
    }))
    .filter((product) => product.ocrMatchScore >= MIN_CANDIDATE_SCORE)
    .sort((left, right) => (
      right.ocrPackageSizeMatch - left.ocrPackageSizeMatch ||
      right.ocrMatchScore - left.ocrMatchScore ||
      Number(right.rank || 0) - Number(left.rank || 0)
    ));
}

function ocrFormulaKey(product = {}) {
  const identity = normalizeText(productIdentityText(product));
  const brand = normalizeText(product.brand);
  const petType = inferredPetType(identity) || normalizeText(product.petType);
  const foodForm = inferredFoodForm(identity) || canonicalFoodForm(product.foodForm);
  const recipeTerms = [...PRIMARY_RECIPE_TERMS].filter((term) => (
    normalizedTokens(identity).has(term)
  ));
  const variantTerms = [...REQUIRED_OCR_VARIANT_TERMS].filter((term) => (
    normalizedTokens(identity).has(term)
  ));
  const variantPhrases = PROTECTED_VARIANT_PHRASES.filter((phrase) => identity.includes(phrase));
  const grainProfile = /\bgrains?(?:\s+and)?(?:\s+legume)?\s+free\b/.test(identity)
    ? "grain_free"
    : /\b(?:with\s+grains?|ancient\s+grains?)\b/.test(identity)
      ? "with_grain"
      : "";
  return [
    brand,
    petType,
    foodForm,
    grainProfile,
    ...recipeTerms.sort(),
    ...variantTerms.sort(),
    ...variantPhrases.sort(),
  ].filter(Boolean).join("|");
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

export function frontLabelRequiresExactPackageVersion(product = {}) {
  const provenance = parseFormulaVersionProvenance(product);
  const gtinPolicy = normalizeText(provenance.gtin_resolution_policy);
  const frontLabelPolicy = normalizeText(provenance.front_label_resolution_policy);
  return provenance.manufacturer_version_conflict === true
    || provenance.front_label_version_collision === true
    || gtinPolicy === "abstain on version conflict"
    || frontLabelPolicy === "safe abstain require barcode or ingredient panel";
}

export function pickVerifiedProductForOcr(products = [], ocrText = "") {
  const [best] = products;
  if (!best || best.ocrMatchScore < AUTO_OPEN_SCORE) return null;
  if (distinctiveTokenCount(ocrText) < 3) return null;
  const bestFormulaKey = ocrFormulaKey(best);
  const frontIndistinguishableVersions = products.filter(
    (product) => ocrFormulaKey(product) === bestFormulaKey
  );
  if (frontIndistinguishableVersions.some(frontLabelRequiresExactPackageVersion)) return null;
  const runnerUp = products.slice(1).find(
    (product) => ocrFormulaKey(product) !== bestFormulaKey
  );
  if (runnerUp && best.ocrMatchScore - runnerUp.ocrMatchScore < AUTO_OPEN_MARGIN) return null;
  return best;
}
