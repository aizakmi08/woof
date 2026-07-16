const PET_TYPES = new Set(["dog", "cat"]);
const LIFE_STAGES = new Set(["young", "adult", "senior"]);
const MAX_AVOID_INGREDIENTS = 20;

export const PET_AVOID_PRESETS = [
  "Chicken",
  "Beef",
  "Dairy",
  "Egg",
  "Fish",
  "Wheat",
  "Corn",
  "Soy",
];

const AVOID_TERM_ALIASES = {
  dairy: ["milk", "cheese", "whey", "casein", "lactose", "butter"],
  egg: ["egg", "eggs", "egg product"],
  fish: [
    "fish",
    "salmon",
    "tuna",
    "trout",
    "whitefish",
    "cod",
    "herring",
    "mackerel",
    "sardine",
    "pollock",
    "menhaden",
    "anchovy",
  ],
  poultry: ["poultry", "chicken", "turkey", "duck"],
};

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedText(value) {
  return compact(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return compact(value)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function parseAvoidIngredients(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  const ingredients = [];

  for (const item of source) {
    const normalized = normalizedText(item).slice(0, 60);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ingredients.push(normalized);
    if (ingredients.length >= MAX_AVOID_INGREDIENTS) break;
  }

  return ingredients;
}

export function normalizePetProfile(value = {}) {
  const petType = PET_TYPES.has(normalizedText(value.petType || value.pet_type))
    ? normalizedText(value.petType || value.pet_type)
    : "";
  const lifeStage = LIFE_STAGES.has(normalizedText(value.lifeStage || value.life_stage))
    ? normalizedText(value.lifeStage || value.life_stage)
    : "adult";

  return {
    version: 1,
    name: compact(value.name).slice(0, 40),
    petType,
    lifeStage,
    avoidIngredients: parseAvoidIngredients(value.avoidIngredients || value.avoid_ingredients),
  };
}

export function hasUsablePetProfile(value) {
  const profile = normalizePetProfile(value);
  return Boolean(profile.name && profile.petType);
}

export function petLifeStageLabel(profileValue) {
  const profile = normalizePetProfile(profileValue);
  if (profile.lifeStage === "young") return profile.petType === "cat" ? "Kitten" : "Puppy";
  if (profile.lifeStage === "senior") return "Senior";
  return "Adult";
}

export function petProfileSummary(profileValue) {
  const profile = normalizePetProfile(profileValue);
  if (!hasUsablePetProfile(profile)) return "Add pet details";
  const species = profile.petType === "cat" ? "Cat" : "Dog";
  const avoidCount = profile.avoidIngredients.length;
  return [
    species,
    petLifeStageLabel(profile),
    avoidCount > 0 ? `${avoidCount} avoid ingredient${avoidCount === 1 ? "" : "s"}` : "No avoid ingredients",
  ].join(" • ");
}

function ingredientNames(result = {}) {
  return (Array.isArray(result.ingredients) ? result.ingredients : [])
    .map((ingredient) => normalizedText(
      typeof ingredient === "string" ? ingredient : ingredient?.name || ingredient?.text
    ))
    .filter(Boolean);
}

function phraseMatches(value, phrase) {
  const text = ` ${normalizedText(value)} `;
  const query = ` ${normalizedText(phrase)} `;
  return query.length > 2 && text.includes(query);
}

function matchedAvoidTerms(result, profile) {
  const names = ingredientNames(result);
  return profile.avoidIngredients.filter((term) => {
    const aliases = AVOID_TERM_ALIASES[term] || [term];
    return aliases.some((alias) => names.some((name) => phraseMatches(name, alias)));
  });
}

function productLifeStage(result = {}) {
  const value = normalizedText([
    result.lifeStage,
    result.nutritionAnalysis?.lifestage,
    result.productName,
  ].filter(Boolean).join(" "));
  if (/\b(all life stages|all stages)\b/.test(value)) return "all";
  if (/\b(puppy|kitten|growth)\b/.test(value)) return "young";
  if (/\b(senior|mature)\b/.test(value)) return "senior";
  if (/\b(adult|maintenance)\b/.test(value)) return "adult";
  return "unknown";
}

function hasLifeStageConflict(result, profile) {
  const productStage = productLifeStage(result);
  if (productStage === "all" || productStage === "unknown") return false;
  if (profile.lifeStage === "young") return productStage !== "young";
  return productStage === "young";
}

function joinedTerms(terms) {
  const labels = terms.map(titleCase);
  if (labels.length <= 1) return labels[0] || "";
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export function personalizePetSafety(result = {}, profileValue = {}) {
  const generic = result.petSafety || {};
  const profile = normalizePetProfile(profileValue);

  if (!hasUsablePetProfile(profile)) {
    return {
      level: generic.level || "caution",
      label: "General ingredient check",
      summary: "Add pet details to check the verified ingredients against a saved species, life stage, and avoid list.",
      personalized: false,
      matches: [],
      profileLabel: "",
    };
  }

  const profileLabel = `${profile.name} • ${profile.petType === "cat" ? "Cat" : "Dog"} • ${petLifeStageLabel(profile)}`;
  const resultPetType = normalizedText(result.petType);
  if (PET_TYPES.has(resultPetType) && resultPetType !== profile.petType) {
    return {
      level: "avoid",
      label: `Not made for ${profile.name}`,
      summary: `This is cataloged as ${resultPetType} food, but ${profile.name}'s saved profile is ${profile.petType}.`,
      personalized: true,
      matches: [],
      profileLabel,
    };
  }

  const matches = matchedAvoidTerms(result, profile);
  if (matches.length > 0) {
    return {
      level: "avoid",
      label: `Conflicts with ${profile.name}'s avoid list`,
      summary: `The verified ingredients match ${joinedTerms(matches)} from the saved avoid list.`,
      personalized: true,
      matches,
      profileLabel,
    };
  }

  if (hasLifeStageConflict(result, profile)) {
    return {
      level: "caution",
      label: `Check life-stage fit for ${profile.name}`,
      summary: `This formula's stated life stage does not match ${profile.name}'s saved life stage. Confirm suitability with your veterinarian.`,
      personalized: true,
      matches: [],
      profileLabel,
    };
  }

  if (generic.level === "avoid") {
    return {
      ...generic,
      label: `Ingredient safety concern for ${profile.name}`,
      personalized: true,
      matches: [],
      profileLabel,
    };
  }

  if (generic.level === "caution") {
    return {
      ...generic,
      label: `Review this food for ${profile.name}`,
      personalized: true,
      matches: [],
      profileLabel,
    };
  }

  return {
    level: "safe",
    label: `No saved conflicts for ${profile.name}`,
    summary: "No saved avoid ingredients or life-stage conflicts were found in the verified catalog data.",
    personalized: true,
    matches: [],
    profileLabel,
  };
}
