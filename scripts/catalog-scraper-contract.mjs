import crypto from "node:crypto";

export const SCRAPER_EXTRACTOR_VERSION = "2026-06-25-verified-us-catalog-v1";

export const SCRAPER_ADAPTERS = new Set([
  "licensed_feed",
  "shopify",
  "wordpress",
  "woocommerce",
  "bigcommerce",
  "demandware_sfcc",
  "algolia",
  "official_api",
  "json_ld",
  "sitemap_html",
  "official_label_ocr",
]);

export const VERIFIED_SOURCE_QUALITIES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
]);

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

const NON_COMPLETE_PATTERNS = [
  /\b(treat|treats|snack|snacks|chew|chews|chewies|jerky|biscuit|biscuits|cookie|cookies|stick|sticks|chip|chips|cheek roll|cheek rolls|beef cheek)\b/i,
  /\bantlers?\b/i,
  /\bdental\s+(?:treat|treats|chew|chews|chewies|snack|snacks|bone|bones)\b/i,
  /\b(topper|toppers|mixer|mixers|meal enhancer|enhancer|enhancers)\b/i,
  /\b(?:bone broth|broth|stock)\s+(?:topper|toppers|mixer|mixers|supplement|supplements|enhancer|enhancers)\b/i,
  /\b(?:topper|toppers|mixer|mixers|supplement|supplements|enhancer|enhancers)\s+(?:bone broth|broth|stock)\b/i,
  /\bkibble\s+sauces?\b/i,
  /\b(base mix|base mixes|pre mix|pre mixes|premix|premixes)\b/i,
  /\bk9\s+mobility\s+ultra\b/i,
  /\b(?:puree|purees|pur[eé]e|pur[eé]es|bisque|bisques|lickable|lickables)\s+(?:treat|treats|topper|toppers|mixer|mixers|snack|snacks)\b/i,
  /\b(?:treat|treats|topper|toppers|mixer|mixers|snack|snacks)\s+(?:puree|purees|pur[eé]e|pur[eé]es|bisque|bisques|lickable|lickables)\b/i,
  /\b(supplement|supplements|vitamin|complementary)\b/i,
  /\b(variety packs?|bundles?|samplers?|sample packs?|starter packs?|starter kits?|(?:new\s+)?(?:puppy|kitten)\s+packs?|(?:puppy|kitten)\s+essentials\s+packs?|essentials\s+packs?)\b/i,
  /\b(?:hydration|trial|sample|assortment|discovery|intro|welcome)\s+kits?\b/i,
  /\b(?:dog|cat|pet)\s+toys?\b|\btoys?\s+(?:for|with|set|plush|plushie|squeaky|squeaker|tug|rope|balls?)\b/i,
  /\b(?:plush|plushie|squeaky|squeaker|tennis\s+balls?|toy\s+balls?|balls?\s+(?:toy|toys|launcher|set|for)|tug|rope|catnip)\b/i,
  /\b(?:t[-\s]?shirt|shirt|bandana|cooler|gift\s*card|container|patches?|sticker|merch|apparel)\b/i,
  /\b(?:cleaner|cleaners|stain|odor|odour|housebreaking\s+aid|wipes?|frontline|flea|tick)\b/i,
  /\b(?:dog|cat|pet|food|water|feeding|feeder|slow[-\s]+feeder|stainless(?:\s+steel)?|ceramic|elevated|collapsible|travel|non[-\s]?skid|anti[-\s]?gulp|replacement|double)\s+bowls?\b|\bbowls?\s+(?:for|stand|mat|set|holder|insert|replacement)\b/i,
  /\b(litter|grooming|shampoo)\b/i,
  /^(?:almo\s+nature\s+)?(?:cat|dog)\s+products$/i,
];

const MARKETING_INGREDIENT_PATTERNS = [
  /\b(what'?s inside|where to buy|nutritional facts|nutritional information)\b/i,
  /\b(premium quality|thoughtfully crafted|slow cooked|super-tasty|serve as a complete|made with|made without)\b/i,
  /\b(no grains?|grain free|no corn|no wheat|no soy|no meat meals?|no artificial|artificial flavors or colors)\b/i,
  /\b(includes taurine for|preferred by|world'?s finest ingredients|incredible taste)\b/i,
  /\b(complete and balanced|formulated to meet|AAFCO|calorie content)\b/i,
  /\b(healthy skin|immune health|digestive health|supports|benefits)\b/i,
];

const MULTI_FORMULA_INGREDIENT_PATTERNS = [
  /(?:^|\s)\(\d+\)\s+[^:]{2,140}?:\s+\S[\s\S]+(?:\s)\(\d+\)\s+[^:]{2,140}?:/i,
  /\b(?:includes|contains)\s+\(\d+\)\s+[^:]{2,140}?:\s+\S[\s\S]+(?:\s)\(\d+\)\s+[^:]{2,140}?:/i,
];

const CONTAMINATED_INGREDIENT_PATTERNS = [
  /\bsee\s+more\b/i,
  /\btell\s+lt\s+all\s+ingredients\b/i,
];

const PLACEHOLDER_IMAGE_PATTERNS = [
  /\b(placeholder|coming-soon|coming_soon|no-image|noimage|logo|brand-logo|lifestyle|banner)\b/i,
];
const NON_DOG_CAT_SPECIES_REGEX = /\b(parrot|parrots|cockatiel|cockatiels|parakeet|parakeets|macaw|macaws|conure|conures|cockatoo|cockatoos|finch|finches|canary|canaries|hamster|hamsters|guinea pig|guinea pigs|small animal|small animals)\b|\b(?:for birds|bird food|for rabbits|rabbit food)\b/i;
const COMPLETE_FOOD_NUTRIENT_MARKER_REGEX = /\b(taurine|vitamin|zinc|ferrous|iron\s+sulfate|manganese|copper|potassium\s+iodide|calcium\s+iodate|choline\s+chloride|biotin|folic\s+acid|riboflavin|niacin|thiamine|pyridoxine|menadione)\b/i;
const ANALYSIS_COPY_IN_INGREDIENTS_REGEX = /\b(?:crude protein|crude fat|crude fiber|moisture|ash|guaranteed analysis|calorie content|metabolizable energy|find a store|where to buy)\b|(?:^|\s)(?:max\.?|min\.?)\s*(?:\)|:|\d|%)/i;
const ALMO_ANALYSIS_COPY_IN_INGREDIENTS_REGEX = /\b(?:crude protein|crude fat|crude fiber|moisture|ash|guaranteed analysis|calorie content|metabolizable energy|find a store|pet shops on the map)\b|(?:^|\s)(?:max\.?|min\.?)\s*(?:\)|:|\d|%)/i;

function isOfficialAlmoNatureProductUrl(value) {
  try {
    const url = new URL(compact(value));
    return /(^|\.)almonature\.com$/i.test(url.hostname)
      && /^\/en-us\/(?:cat|dog)-products\/[A-Za-z0-9-]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
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

function urlHostMatches(value, pattern) {
  try {
    return pattern.test(new URL(compact(value)).hostname);
  } catch {
    return false;
  }
}

function isEarthbornOfficialFrontPackageImage(candidate = {}) {
  const imageUrl = compact(candidate.front_image_url);
  return Boolean(
    urlHostMatches(candidate.source_url, /(^|\.)earthbornholisticpetfood\.com$/i)
    && urlHostMatches(imageUrl, /(^|\.)earthbornholisticpetfood\.com$/i)
    && /\/wp-content\/uploads\//i.test(imageUrl)
    && /\b(?:can|bag|package|packaging)[-_ ]?front\b/i.test(imageUrl)
    && !/\b(?:customer|testimonial|mega[-_ ]?menu|navigation|hero|icon|story|blog|lifestyle|logo|banner)\b/i.test(imageUrl)
  );
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

function hasTrustedFreshpetShortIngredientEvidence({ candidate, sourceQuality, ingredientStatus, ingredients }) {
  const ingredientText = compact(candidate.ingredient_text);
  const completeFoodEvidence = joinedEvidenceText(
    candidate.guaranteed_analysis,
    candidate.nutrient_panel,
    candidate.nutritional_info
  );
  if (!isOfficialFreshpetProductUrl(candidate.source_url)) return false;
  if (sourceQuality !== "manufacturer") return false;
  if (ingredientStatus !== "manufacturer") return false;
  if (!/^freshpet$/i.test(compact(candidate.brand))) return false;
  if (!["dog", "cat"].includes(candidate.pet_type)) return false;
  if (ingredientText.length < 45) return false;
  if (ingredients.length < 10 || ingredients.length >= 20) return false;
  if (!hasCoreGuaranteedAnalysis(completeFoodEvidence)) return false;
  if (!/\bformulated\s+to\s+meet\b[\s\S]{0,220}\bAAFCO\b/i.test(completeFoodEvidence)) return false;
  if (/(?:\.\.\.|…)/.test(ingredientText)) return false;
  if (ANALYSIS_COPY_IN_INGREDIENTS_REGEX.test(ingredientText)) {
    return false;
  }
  if (MARKETING_INGREDIENT_PATTERNS.some((pattern) => pattern.test(ingredientText))) return false;
  return true;
}

function hasTrustedLotusRawShortIngredientEvidence({ candidate, sourceQuality, ingredientStatus, ingredients }) {
  const expectedPetType = officialLotusRawFoodPetType(candidate.source_url);
  const ingredientText = compact(candidate.ingredient_text);
  const completeFoodEvidence = joinedEvidenceText(
    candidate.guaranteed_analysis,
    candidate.nutrient_panel,
    candidate.nutritional_info
  );

  if (!expectedPetType) return false;
  if (candidate.pet_type !== expectedPetType) return false;
  if (sourceQuality !== "manufacturer") return false;
  if (ingredientStatus !== "manufacturer") return false;
  if (!/^lotus$/i.test(compact(candidate.brand))) return false;
  if (ingredientText.length < 150) return false;
  if (ingredients.length < 10 || ingredients.length >= 20) return false;
  if (/(?:\.\.\.|…)/.test(ingredientText)) return false;
  if (ANALYSIS_COPY_IN_INGREDIENTS_REGEX.test(ingredientText)) {
    return false;
  }
  if (MARKETING_INGREDIENT_PATTERNS.some((pattern) => pattern.test(ingredientText))) return false;
  if (!/\b(?:tricalcium phosphate|vitamin\s*e|manganese amino acid chelate|maganese amino acid chelate|dried egg shell|organic dried dulse)\b/i.test(ingredientText)) {
    return false;
  }
  if (!/"(?:protein|fat|fiber|moisture)"\s*:/i.test(completeFoodEvidence)) return false;
  if (!/\btaurine\b/i.test(completeFoodEvidence)) return false;
  if (!/\ball\s+life\s+stage\b/i.test(completeFoodEvidence)) return false;

  return true;
}

function hasLotusRawCompleteFoodEvidence(candidate, ingredients) {
  const expectedPetType = officialLotusRawFoodPetType(candidate.source_url);
  const ingredientText = compact(candidate.ingredient_text);
  const completeFoodEvidence = joinedEvidenceText(
    candidate.guaranteed_analysis,
    candidate.nutrient_panel,
    candidate.nutritional_info
  );

  return Boolean(
    expectedPetType
    && candidate.pet_type === expectedPetType
    && /^lotus$/i.test(compact(candidate.brand))
    && ingredientText.length >= 150
    && ingredients.length >= 10
    && ingredients.length < 20
    && /\b(?:tricalcium phosphate|vitamin\s*e|manganese amino acid chelate|maganese amino acid chelate|dried egg shell|organic dried dulse)\b/i.test(ingredientText)
    && /"(?:protein|fat|fiber|moisture)"\s*:/i.test(completeFoodEvidence)
    && /\btaurine\b/i.test(completeFoodEvidence)
    && /\ball\s+life\s+stage\b/i.test(completeFoodEvidence)
  );
}

function hasTrustedShortIngredientEvidence({ candidate, sourceQuality, ingredientStatus, ingredients }) {
  const ingredientText = compact(candidate.ingredient_text);
  if (hasTrustedFreshpetShortIngredientEvidence({
    candidate,
    sourceQuality,
    ingredientStatus,
    ingredients,
  })) {
    return true;
  }
  if (hasTrustedLotusRawShortIngredientEvidence({
    candidate,
    sourceQuality,
    ingredientStatus,
    ingredients,
  })) {
    return true;
  }

  const completeFoodEvidence = joinedEvidenceText(
    candidate.guaranteed_analysis,
    candidate.nutrient_panel,
    candidate.nutritional_info,
  );
  if (!isOfficialAlmoNatureProductUrl(candidate.source_url)) return false;
  if (sourceQuality !== "manufacturer") return false;
  if (ingredientStatus !== "manufacturer") return false;
  if (!/^almo nature$/i.test(compact(candidate.brand))) return false;
  if (!/\b(?:aafco|complete|balanced|formulated\s+to\s+meet|maintenance|growth)\b/i.test(completeFoodEvidence)) return false;
  if (ingredientText.length < 20) return false;
  if (ingredients.length < 2 || ingredients.length >= 5) return false;
  if (!/\b\d+(?:\.\d+)?\s*%/.test(ingredientText)) return false;
  if (/(?:\.\.\.|…)/.test(ingredientText)) return false;
  if (ALMO_ANALYSIS_COPY_IN_INGREDIENTS_REGEX.test(ingredientText)) {
    return false;
  }
  if (MARKETING_INGREDIENT_PATTERNS.some((pattern) => pattern.test(ingredientText))) return false;
  return true;
}

function hasCompleteFoodIngredientEvidence(candidate, ingredients) {
  if (hasLotusRawCompleteFoodEvidence(candidate, ingredients)) return true;

  const ingredientText = ingredients.join(", ");
  if (/^\s*(?:main|key)\s+ingredients\s*:/i.test(ingredientText)) return false;
  if (COMPLETE_FOOD_NUTRIENT_MARKER_REGEX.test(ingredientText)) return true;
  if (ingredients.length >= 20) return true;

  const nutrientEvidence = joinedEvidenceText(
    candidate.guaranteed_analysis,
    candidate.nutrient_panel,
    candidate.nutritional_info,
  );
  return (
    ingredients.length >= 15
    && /\b(aafco|complete|balanced|formulated\s+to\s+meet|maintenance|growth)\b/i.test(nutrientEvidence)
  );
}

const PROTEIN_TERMS = new Set([
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

export function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compactIdentityText(value) {
  return compact(String(value || "").replace(/<[^>]*>/g, " "));
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

function hasUnbalancedSquareBrackets(value) {
  const text = compact(value);
  let depth = 0;
  for (const char of text) {
    if (char === "[") depth += 1;
    if (char !== "]") continue;
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
    || hasUnbalancedSquareBrackets(text)
    || /(^|[^A-Za-z])-\s*Ascorbyl-2-Polyphosphate\b/i.test(text)
    || /\bSupplement\.\s+preserved\s+with\b/i.test(text)
    || /\bI(?:Vitamin|min|max|preservative|Ferrous)\b/i.test(text)
    || /\b(?:pyr\s+idoxine|pantot\s+henate|ribo\s+flavin|thia\s+mine|bio\s+tin)\b/i.test(text)
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

function allowsCurlyIngredientGroups(candidate = {}, sourceQuality = "", ingredientStatus = "") {
  return (
    compact(sourceQuality || candidate.source_quality).toLowerCase() === "manufacturer"
    && compact(ingredientStatus || candidate.ingredient_verification_status).toLowerCase() === "manufacturer"
    && hasOnlyAllowedCurlyIngredientGroups(candidate.ingredient_text)
  );
}

export function normalizeText(value) {
  return compact(value)
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  const text = compact(value);
  if (!text || /^data:/i.test(text)) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
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

function normalizeGtin(value) {
  const digits = compact(value).replace(/\D/g, "");
  return digits.length >= 8 ? digits : "";
}

function normalizePetType(value, row = {}) {
  const explicit = compact(value).toLowerCase();
  if (explicit === "dog" || explicit === "cat") return explicit;

  const text = normalizeText([
    row.product_name,
    row.productName,
    row.brand,
    row.product_line,
    row.productLine,
    row.source_url,
    row.product_url,
  ].join(" "));
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "unknown";
}

function parseIngredients(row = {}) {
  if (Array.isArray(row.ingredients)) {
    return row.ingredients
      .map((ingredient) => compact(
        typeof ingredient === "string" ? ingredient : ingredient?.text || ingredient?.name
      ))
      .filter(Boolean);
  }

  const text = compact(
    row.ingredient_text
    || row.ingredientText
    || row.ingredient_statement
    || row.ingredients_text
    || row.ingredientsText
    || row.ingredients
  );
  if (!text) return [];
  return text.split(/[,;]+/).map(compact).filter(Boolean);
}

function proteinSet(value) {
  const output = new Set();
  for (const token of normalizeText(value).split(" ")) {
    if (PROTEIN_TERMS.has(token)) output.add(token);
  }
  return output;
}

function hasNoProteinOverlap(left, right) {
  if (!left.size || !right.size) return false;
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

function ingredientRecipePrefix(value) {
  return compact(value).match(/^\s*([^:]{1,120}?\brecipe)\s*:/i)?.[1] || "";
}

function nutrientPanelRecipeLabel(value) {
  return compact(value).match(/\b([a-z][a-z\s&,+-]{0,80}?\brecipe)\b/i)?.[1] || "";
}

function variantProteinSet(...values) {
  return proteinSet(values.map(compact).join(" "));
}

function ingredientLeadProteinSet(value) {
  const withoutRecipePrefix = compact(value).replace(/^\s*[^:]{1,120}?\brecipe\s*:\s*/i, "");
  return proteinSet(withoutRecipePrefix.split(/[,;]+/).slice(0, 3).join(" "));
}

function hasVariantIngredientMismatch({
  productName = "",
  productLine = "",
  flavor = "",
  packageSize = "",
  ingredientText = "",
} = {}) {
  const ingredientPrefixProteins = proteinSet(ingredientRecipePrefix(ingredientText));
  const explicitVariantProteins = variantProteinSet(flavor, packageSize);
  const fallbackIdentityProteins = variantProteinSet(productName, productLine);
  const declaredProteins = explicitVariantProteins.size > 0
    ? explicitVariantProteins
    : fallbackIdentityProteins;

  if (hasNoProteinOverlap(declaredProteins, ingredientPrefixProteins)) return true;

  const packageSizeProteins = variantProteinSet(packageSize);
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
  const nutrientRecipeProteins = proteinSet(nutrientPanelRecipeLabel(nutrientPanel));
  if (nutrientRecipeProteins.size === 0) return false;

  const explicitVariantProteins = variantProteinSet(flavor, packageSize);
  const fallbackIdentityProteins = variantProteinSet(productName, productLine);
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
  const sourceUrlProteins = proteinSet(sourceUrl);
  if (sourceUrlProteins.size === 0) return false;

  const declaredProteins = variantProteinSet(productName, productLine, flavor);
  return hasNoProteinOverlap(declaredProteins, sourceUrlProteins);
}

function canonicalDryWetForm(value) {
  const text = normalizeText(value);
  if (/\bwet\b|\bcans?\b|\bcanned\b|\bpate\b|\bpat\b|\bstews?\b|\bmorsels?\b|\bchunks?\b|\bshreds?\b|\bloaf\b/.test(text)) return "wet";
  if (/\bdry\b|\bkibble\b/.test(text)) return "dry";
  return "";
}

function sourceEvidenceFoodForm(...values) {
  let wet = false;
  let dry = false;
  for (const value of values) {
    const raw = compact(value).toLowerCase();
    if (!raw) continue;
    let text = raw;
    try {
      text = decodeURIComponent(raw);
    } catch {
      text = raw;
    }
    if (/\/(?:dog|cat)-wet-food(?:\/|$)|\/wet-(?:dog|cat)-food(?:\/|$)|\/wet-food(?:\/|$)|wet-food-for-(?:dogs|cats)(?:\/|$)|(?:^|[\/_.-])wet(?:[\/_.-]|$)/.test(text)) wet = true;
    if (/\/(?:dog|cat)-dry-food(?:\/|$)|\/dry-(?:dog|cat)-food(?:\/|$)|\/dry-food(?:\/|$)|dry-food-for-(?:dogs|cats)(?:\/|$)|(?:^|[\/_.-])dry(?:[\/_.-]|$)/.test(text)) dry = true;
  }
  if (wet === dry) return "";
  return wet ? "wet" : "dry";
}

function boolValue(value, fallback = true) {
  if (typeof value === "boolean") return value;
  const text = compact(value).toLowerCase();
  if (!text) return fallback;
  if (["true", "1", "yes", "complete", "complete_food"].includes(text)) return true;
  if (["false", "0", "no", "treat", "supplement", "complementary"].includes(text)) return false;
  return fallback;
}

export function candidateContentHash(candidate = {}) {
  const identity = [
    candidate.cache_key,
    candidate.gtin,
    candidate.product_name,
    candidate.brand,
    candidate.product_line,
    candidate.flavor,
    candidate.life_stage,
    candidate.food_form,
    candidate.package_size,
    candidate.pet_type,
    candidate.ingredient_text,
    candidate.front_image_url,
    candidate.source_url,
  ].map(compact).join("\n");
  return crypto.createHash("sha256").update(identity, "utf8").digest("hex");
}

export function normalizeScraperCandidate(row = {}, defaults = {}) {
  const source = compact(row.source || defaults.source);
  const brand = compactIdentityText(row.brand || row.brand_name || defaults.brand);
  const productName = compactIdentityText(row.product_name || row.productName || row.name || row.item_name);
  const ingredients = parseIngredients(row);
  const ingredientText = compact(
    row.ingredient_text
    || row.ingredientText
    || row.ingredient_statement
    || row.ingredients_text
    || row.ingredientsText
    || ingredients.join(", ")
  );
  const sourceUrl = normalizeUrl(row.source_url || row.product_url || row.url || defaults.sourceUrl);
  const imageUrl = normalizeUrl(
    row.front_image_url
    || row.product_image_url
    || row.image_url
    || row.image
    || row.image_front_url
  );
  const sourceQuality = compact(row.source_quality || row.sourceQuality || defaults.sourceQuality || "manufacturer").toLowerCase();
  const ingredientStatus = compact(
    row.ingredient_verification_status
    || row.ingredientVerificationStatus
    || defaults.ingredientVerificationStatus
    || (sourceQuality === "gdsn" ? "gdsn" : sourceQuality === "retailer_verified" ? "retailer_verified" : "manufacturer")
  ).toLowerCase();
  const imageStatus = compact(
    row.image_verification_status
    || row.imageVerificationStatus
    || defaults.imageVerificationStatus
    || (sourceQuality === "retailer_verified" ? "retailer_verified" : "manufacturer")
  ).toLowerCase();

  const gtin = normalizeGtin(row.gtin || row.barcode || row.upc || row.ean);
  const explicitCacheKey = compact(row.cache_key || row.cacheKey);
  const cacheKey = explicitCacheKey
    || (gtin ? `${source}:${gtin}` : `${source}:${normalizeText(`${brand} ${productName} ${sourceUrlIdentitySegment(sourceUrl)}`)}`);

  const candidate = {
    cache_key: cacheKey,
    gtin: gtin || null,
    product_name: productName,
    brand,
    product_line: compactIdentityText(row.product_line || row.productLine || row.line),
    flavor: compactIdentityText(row.flavor || row.flavour || row.recipe),
    life_stage: compactIdentityText(row.life_stage || row.lifeStage || row.lifestage),
    food_form: compactIdentityText(row.food_form || row.foodForm || row.form || row.format),
    package_size: compactIdentityText(row.package_size || row.packageSize || row.net_weight || row.size),
    pet_type: normalizePetType(row.pet_type || row.petType || row.species, row),
    ingredient_text: ingredientText,
    ingredients,
    ingredient_source_url: normalizeUrl(row.ingredient_source_url || row.ingredientSourceUrl || sourceUrl),
    ingredient_verification_status: ingredientStatus,
    front_image_url: imageUrl,
    image_source_url: normalizeUrl(row.image_source_url || row.imageSourceUrl || sourceUrl),
    image_verification_status: imageStatus,
    source,
    source_quality: sourceQuality,
    source_url: sourceUrl,
    is_complete_food: boolValue(row.is_complete_food ?? row.isCompleteFood, true),
    guaranteed_analysis: row.guaranteed_analysis ?? row.guaranteedAnalysis ?? "",
    nutrient_panel: row.nutrient_panel ?? row.nutrientPanel ?? row.nutriments ?? "",
    nutritional_info: row.nutritional_info || row.nutritionalInfo || null,
    scraped_at: compact(row.scraped_at || row.scrapedAt) || new Date().toISOString(),
    verified_at: compact(row.verified_at || row.verifiedAt || defaults.verifiedAt) || new Date().toISOString(),
    raw_source_hash: compact(row.raw_source_hash || row.rawSourceHash || defaults.rawSourceHash),
    extractor_version: compact(row.extractor_version || row.extractorVersion || defaults.extractorVersion || SCRAPER_EXTRACTOR_VERSION),
  };
  candidate.content_hash = compact(row.content_hash || row.contentHash) || candidateContentHash(candidate);
  return candidate;
}

export function validateScraperCandidate(candidate = {}, options = {}) {
  const reasons = [];
  const sourceQuality = compact(candidate.source_quality).toLowerCase();
  const ingredientStatus = compact(candidate.ingredient_verification_status).toLowerCase();
  const imageStatus = compact(candidate.image_verification_status).toLowerCase();
  const identityText = normalizeText([
    candidate.brand,
    candidate.product_name,
    candidate.product_line,
    candidate.flavor,
    candidate.life_stage,
    candidate.food_form,
    candidate.package_size,
    candidate.source,
    sourceUrlIdentitySegment(candidate.source_url),
  ].join(" "));
  const ingredientText = compact(candidate.ingredient_text);
  const ingredients = Array.isArray(candidate.ingredients) && candidate.ingredients.length > 0
    ? candidate.ingredients.map(compact).filter(Boolean)
    : ingredientText.split(/[,;]+/).map(compact).filter(Boolean);
  const hasTrustedShortIngredients = hasTrustedShortIngredientEvidence({
    candidate,
    sourceQuality,
    ingredientStatus,
    ingredients,
  });

  if (!compact(candidate.cache_key)) reasons.push("missing_cache_key");
  if (!compact(candidate.product_name)) reasons.push("missing_product_name");
  if (!compact(candidate.brand)) reasons.push("missing_brand");
  if (!["dog", "cat"].includes(candidate.pet_type)) reasons.push("unknown_pet_type");
  if (NON_DOG_CAT_SPECIES_REGEX.test(identityText) || NON_DOG_CAT_SPECIES_REGEX.test(compact(candidate.source_url))) {
    reasons.push("non_dog_cat_product");
  }
  if (!candidate.is_complete_food) reasons.push("not_complete_food");
  if (NON_COMPLETE_PATTERNS.some((pattern) => pattern.test(identityText))) reasons.push("non_complete_identity");
  if (!ingredientText) reasons.push("missing_ingredient_text");
  if (ingredients.length < 5 && !hasTrustedShortIngredients) reasons.push("too_few_ingredients");
  if (ingredientText.length < 30 && !hasTrustedShortIngredients) reasons.push("ingredient_text_too_short");
  if (/(?:\.\.\.|…)/.test(ingredientText)) reasons.push("truncated_ingredient_text");
  if (hasUnbalancedParentheses(ingredientText)) reasons.push("unbalanced_ingredient_parentheses");
  const hasDisallowedCurlyGroups = hasCurlyIngredientGroup(ingredientText)
    && !allowsCurlyIngredientGroups(candidate, sourceQuality, ingredientStatus);
  if (hasDisallowedCurlyGroups || hasLikelyIngredientOcrArtifacts(ingredientText)) {
    reasons.push("ingredient_ocr_artifact");
  }
  if (ANALYSIS_COPY_IN_INGREDIENTS_REGEX.test(ingredientText)) reasons.push("analysis_copy_in_ingredients");
  if (MARKETING_INGREDIENT_PATTERNS.some((pattern) => pattern.test(ingredientText))) reasons.push("marketing_copy_as_ingredients");
  if (CONTAMINATED_INGREDIENT_PATTERNS.some((pattern) => pattern.test(ingredientText))) {
    reasons.push("contaminated_ingredient_statement");
  }
  if (MULTI_FORMULA_INGREDIENT_PATTERNS.some((pattern) => pattern.test(ingredientText))) {
    reasons.push("multi_formula_or_variety_pack");
  }
  if (candidate.is_complete_food && !hasTrustedShortIngredients && !hasCompleteFoodIngredientEvidence(candidate, ingredients)) {
    reasons.push("incomplete_ingredient_statement");
  }
  if (!candidate.front_image_url) reasons.push("missing_front_image_url");
  if (
    candidate.front_image_url
    && PLACEHOLDER_IMAGE_PATTERNS.some((pattern) => pattern.test(candidate.front_image_url))
    && !isEarthbornOfficialFrontPackageImage(candidate)
  ) {
    reasons.push("non_front_or_placeholder_image");
  }
  if (!candidate.source_url) reasons.push("missing_source_url");
  if (!candidate.verified_at) reasons.push("missing_verified_at");
  if (!VERIFIED_SOURCE_QUALITIES.has(sourceQuality)) reasons.push("unverified_source_quality");
  if (!VERIFIED_INGREDIENT_STATUSES.has(ingredientStatus)) reasons.push("unverified_ingredient_status");
  if (!VERIFIED_IMAGE_STATUSES.has(imageStatus)) reasons.push("unverified_image_status");
  if (ingredientStatus === "label_ocr_candidate" || ingredientStatus === "ai_extracted") {
    reasons.push("unreviewed_ocr_or_ai_ingredients");
  }

  if (hasVariantIngredientMismatch({
    productName: candidate.product_name,
    productLine: candidate.product_line,
    flavor: candidate.flavor,
    packageSize: candidate.package_size,
    ingredientText,
  })) {
    reasons.push("variant_ingredient_mismatch");
  }
  if (hasVariantNutrientMismatch({
    productName: candidate.product_name,
    productLine: candidate.product_line,
    flavor: candidate.flavor,
    packageSize: candidate.package_size,
    nutrientPanel: joinedEvidenceText(
      candidate.guaranteed_analysis,
      candidate.nutrient_panel,
      candidate.nutritional_info,
    ),
  })) {
    reasons.push("variant_nutrient_mismatch");
  }
  if (hasVariantSourceUrlMismatch({
    productName: candidate.product_name,
    productLine: candidate.product_line,
    flavor: candidate.flavor,
    sourceUrl: candidate.source_url,
  })) {
    reasons.push("variant_source_url_mismatch");
  }

  const sourceFoodForm = sourceEvidenceFoodForm(
    candidate.source_url,
    candidate.front_image_url,
    candidate.image_source_url,
  );
  const declaredFoodForm = canonicalDryWetForm(candidate.food_form);
  const identityFoodForm = canonicalDryWetForm([
    candidate.product_name,
    candidate.product_line,
  ].join(" "));
  if (sourceFoodForm && declaredFoodForm && sourceFoodForm !== declaredFoodForm) {
    reasons.push("food_form_source_mismatch");
  }
  if (sourceFoodForm && identityFoodForm && sourceFoodForm !== identityFoodForm) {
    reasons.push("identity_source_form_mismatch");
  }

  const expectedBrandTerms = Array.isArray(options.expectedBrandTerms) ? options.expectedBrandTerms : [];
  if (expectedBrandTerms.length > 0) {
    const brandKey = normalizeText(candidate.brand);
    const identityKey = normalizeText([candidate.brand, candidate.product_name].join(" "));
    const matchesExpected = expectedBrandTerms
      .map(normalizeText)
      .filter(Boolean)
      .some((term) => brandKey === term || identityKey.startsWith(term) || identityKey.includes(` ${term} `));
    if (!matchesExpected) reasons.push("brand_source_mismatch");
  }

  if (candidate.source_url && options.requiredSourceUrlPattern) {
    const pattern = typeof options.requiredSourceUrlPattern === "string"
      ? new RegExp(options.requiredSourceUrlPattern, "i")
      : options.requiredSourceUrlPattern;
    if (pattern && !pattern.test(candidate.source_url)) reasons.push("source_url_pattern_mismatch");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function scraperCandidateToOfficialFeedRow(candidate = {}) {
  return {
    cache_key: candidate.cache_key,
    gtin: candidate.gtin,
    product_name: candidate.product_name,
    brand: candidate.brand,
    product_line: candidate.product_line,
    flavor: candidate.flavor,
    life_stage: candidate.life_stage,
    food_form: candidate.food_form,
    package_size: candidate.package_size,
    pet_type: candidate.pet_type,
    ingredient_statement: candidate.ingredient_text,
    product_image_url: candidate.front_image_url,
    product_url: candidate.source_url,
    is_complete_food: candidate.is_complete_food,
    source: candidate.source,
    source_quality: candidate.source_quality,
    ingredient_verification_status: candidate.ingredient_verification_status,
    image_verification_status: candidate.image_verification_status,
    verified_at: candidate.verified_at,
  };
}

export function summarizeScraperCandidates(candidates = [], validations = []) {
  const rejectedByReason = new Map();
  validations.forEach((validation) => {
    if (validation.ok) return;
    for (const reason of validation.reasons) {
      rejectedByReason.set(reason, (rejectedByReason.get(reason) || 0) + 1);
    }
  });

  return {
    total_candidates: candidates.length,
    accepted_candidates: validations.filter((validation) => validation.ok).length,
    rejected_candidates: validations.filter((validation) => !validation.ok).length,
    rejected_by_reason: Object.fromEntries([...rejectedByReason.entries()].sort()),
  };
}
