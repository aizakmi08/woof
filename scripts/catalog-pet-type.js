const CAT_TERMS = [
  "cat", "cats", "kitten", "kittens", "feline", "hairball", "litter",
  "fancy feast", "friskies", "sheba", "tiki cat", "meow mix", "9 lives",
  "temptations", "whiskas", "delectables", "kit & kaboodle", "kit and kaboodle",
];

const DOG_TERMS = [
  "dog", "dogs", "puppy", "puppies", "canine", "large breed", "small breed",
  "pedigree", "cesar", "beneful", "milk-bone", "milk bone", "greenies",
  "kibbles", "beggin", "pup", "pup above", "bully stick",
];

const CAT_SOURCES = new Set(["cfa", "cats"]);
const DOG_SOURCES = new Set(["dfa", "dog_food_advisor"]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;|amp/g, " ")
    .replace(/[^a-z0-9\s&'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function petTypeSignals(row) {
  const source = normalizeText(row?.source);
  const text = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`);
  let cat = CAT_SOURCES.has(source);
  let dog = DOG_SOURCES.has(source);

  if (CAT_TERMS.some((term) => hasTerm(text, term))) cat = true;
  if (DOG_TERMS.some((term) => hasTerm(text, term))) dog = true;

  return { cat, dog };
}

function inferPetTypes(row, { includeAmbiguous = true } = {}) {
  const explicit = row?.pet_type || row?.petType;
  if (explicit === "dog" || explicit === "cat") return [explicit];

  const { cat, dog } = petTypeSignals(row);
  if (cat && !dog) return ["cat"];
  if (dog && !cat) return ["dog"];
  return includeAmbiguous ? ["dog", "cat"] : [];
}

function inferPrimaryPetType(row) {
  const types = inferPetTypes(row, { includeAmbiguous: false });
  return types[0] || null;
}

function normalizeAnalysisBaseKey(value) {
  if (!value || typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[-/&]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function analysisBaseKeySpellingVariants(cacheKey) {
  const key = typeof cacheKey === "string" ? cacheKey.trim() : "";
  if (!key) return [];
  const variants = new Set([key]);
  const replacements = [
    [/grain free/g, "grainfree"],
    [/grainfree/g, "grain free"],
    [/high protein/g, "highprotein"],
    [/highprotein/g, "high protein"],
    [/multi protein/g, "multiprotein"],
    [/multiprotein/g, "multi protein"],
    [/raw mix/g, "rawmix"],
    [/rawmix/g, "raw mix"],
    [/freeze dried/g, "freezedried"],
    [/freezedried/g, "freeze dried"],
    [/air dried/g, "airdried"],
    [/airdried/g, "air dried"],
  ];
  for (const [pattern, replacement] of replacements) {
    for (const existing of [...variants]) {
      if (variants.size >= 32) break;
      const variant = existing.replace(pattern, replacement).replace(/\s+/g, " ").trim();
      if (variant) variants.add(variant);
    }
  }
  return [...variants];
}

function analysisBaseKeyVariants(...values) {
  const normalized = values.map((value) => normalizeAnalysisBaseKey(value)).filter(Boolean);
  return [...new Set(normalized.flatMap((key) => analysisBaseKeySpellingVariants(key)))];
}

function analysisCacheBaseKeys(row) {
  const cacheKey = typeof row?.cache_key === "string" ? row.cache_key.trim() : "";
  const productName = typeof row?.product_name === "string" ? row.product_name.trim() : "";
  const brand = typeof row?.brand === "string" ? row.brand.trim() : "";
  return [...new Set([
    cacheKey,
    ...analysisBaseKeyVariants(productName),
    ...(brand && productName ? analysisBaseKeyVariants(`${brand} ${productName}`) : []),
  ].filter(Boolean))];
}

function analysisCacheKeyForPetType(cacheKey, petType) {
  const key = typeof cacheKey === "string" ? cacheKey.trim() : "";
  return key && (petType === "dog" || petType === "cat") ? `${key}__${petType}` : "";
}

module.exports = {
  inferPetTypes,
  inferPrimaryPetType,
  normalizeAnalysisBaseKey,
  analysisBaseKeySpellingVariants,
  analysisBaseKeyVariants,
  analysisCacheBaseKeys,
  analysisCacheKeyForPetType,
};
