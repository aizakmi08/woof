import { catalogVerificationState } from "./catalogQuality";
import { splitIngredientStatement } from "./catalogIngredients";

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lower(value) {
  return compact(value).toLowerCase();
}

function clampScore(value) {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const clean = compact(value);
    const key = lower(clean);
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

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

export function ingredientNamesFromProduct(product = {}) {
  const fromText = splitIngredientStatement(
    product.ingredientsText || product.ingredientText || product.ingredient_text || ""
  );
  if (fromText.length > 0) return unique(fromText);

  const fromArray = Array.isArray(product.ingredients)
    ? product.ingredients
      .map((ingredient) => {
        if (typeof ingredient === "string") return ingredient;
        return ingredient?.text || ingredient?.name || ingredient?.id || "";
      })
      .filter(Boolean)
    : [];

  return unique(fromArray);
}

export function hasVerifiedIngredientData(product = {}) {
  const names = ingredientNamesFromProduct(product);
  const hasIngredients = names.length >= 3 || compact(product.ingredientsText || product.ingredientText).length >= 30;
  if (!hasIngredients) return false;
  if (!compact(product.sourceUrl || product.source_url)) return false;

  const status = lower(product.ingredientVerificationStatus || product.ingredient_verification_status);
  if (!status) return false;
  return VERIFIED_INGREDIENT_STATUSES.has(status);
}

export function hasVerifiedProductImageData(product = {}) {
  const imageUrl = compact(product.imageUrl || product.image_url);
  if (!imageUrl || /^data:/i.test(imageUrl)) return false;
  if (!compact(product.sourceUrl || product.source_url)) return false;

  const status = lower(product.imageVerificationStatus || product.image_verification_status);
  if (!status) return false;
  return VERIFIED_IMAGE_STATUSES.has(status);
}

const ANIMAL_TERMS = [
  "chicken", "turkey", "beef", "lamb", "salmon", "duck", "venison", "pork",
  "rabbit", "bison", "trout", "herring", "whitefish", "cod", "tuna", "sardine",
  "mackerel", "egg", "liver", "heart", "ocean fish", "fish"
];

const GRAIN_TERMS = ["corn", "wheat", "soy", "rice", "barley", "oat", "sorghum", "millet"];
const LEGUME_STARCH_TERMS = ["pea", "lentil", "chickpea", "garbanzo", "potato", "tapioca"];
const BAD_PRESERVATIVES = ["bha", "bht", "ethoxyquin"];
const ARTIFICIAL_COLORS = ["red 40", "yellow 5", "yellow 6", "blue 2", "blue 1", "caramel color", "artificial color"];
const NATURAL_PRESERVATIVES = ["mixed tocopherols", "tocopherol", "rosemary extract", "citric acid"];
const GOOD_SUPPORTS = ["probiotic", "lactobacillus", "dried fermentation", "omega", "fish oil", "flaxseed", "taurine", "glucosamine", "chondroitin"];

function isByProduct(name) {
  const text = lower(name);
  return text.includes("by-product") || text.includes("by product");
}

function isMeatMeal(name) {
  const text = lower(name);
  return includesAny(text, ANIMAL_TERMS) && text.includes("meal") && !isByProduct(text);
}

function isWholeAnimalProtein(name) {
  const text = lower(name);
  return includesAny(text, ANIMAL_TERMS) && !text.includes("meal") && !isByProduct(text);
}

function isPlantProteinConcentrate(name) {
  const text = lower(name);
  return text.includes("gluten meal") || text.includes("pea protein") || text.includes("soy protein") || text.includes("potato protein");
}

function primaryProteinSource(names) {
  const protein = names.find((name) => (
    isWholeAnimalProtein(name) || isMeatMeal(name) || isByProduct(name) || isPlantProteinConcentrate(name)
  ));
  return protein || names[0] || "Unknown";
}

function ingredientCategory(name) {
  const text = lower(name);
  if (isWholeAnimalProtein(text) || isMeatMeal(text) || isByProduct(text) || isPlantProteinConcentrate(text)) return "protein";
  if (text.includes("oil") || text.includes("fat")) return "fat";
  if (text.includes("fiber") || text.includes("cellulose") || text.includes("beet pulp")) return "fiber";
  if (text.includes("vitamin")) return "vitamin";
  if (text.includes("mineral") || text.includes("zinc") || text.includes("iron") || text.includes("copper") || text.includes("selen")) return "mineral";
  if (includesAny(text, BAD_PRESERVATIVES) || includesAny(text, NATURAL_PRESERVATIVES)) return "preservative";
  if (includesAny(text, GRAIN_TERMS) || includesAny(text, LEGUME_STARCH_TERMS)) return "carb";
  return "other";
}

function ingredientRating(name, index) {
  const text = lower(name);
  if (
    includesAny(text, BAD_PRESERVATIVES) ||
    includesAny(text, ARTIFICIAL_COLORS) ||
    text.includes("propylene glycol") ||
    text.includes("menadione") ||
    text.includes("added sugar") ||
    text === "sugar"
  ) {
    return "bad";
  }
  if (isByProduct(text)) return index <= 4 ? "bad" : "neutral";
  if (isWholeAnimalProtein(text) || isMeatMeal(text) || includesAny(text, GOOD_SUPPORTS) || includesAny(text, NATURAL_PRESERVATIVES)) return "good";
  if (isPlantProteinConcentrate(text)) return "neutral";
  return "neutral";
}

function ingredientReason(name, rating, index) {
  const text = lower(name);
  if (rating === "good") {
    if (isWholeAnimalProtein(text)) return "A named animal ingredient supports transparent protein quality.";
    if (isMeatMeal(text)) return "A named meat meal can be a concentrated animal protein source.";
    if (includesAny(text, GOOD_SUPPORTS)) return "This can support digestion, skin, coat, joints, or essential amino acid balance.";
    return "This ingredient is generally acceptable in a complete pet food formula.";
  }
  if (rating === "bad") {
    if (includesAny(text, BAD_PRESERVATIVES)) return "This synthetic preservative is a red flag in pet food scoring.";
    if (includesAny(text, ARTIFICIAL_COLORS)) return "Artificial colors add no nutritional value and lower additive quality.";
    if (text.includes("propylene glycol")) return "Propylene glycol is a strong safety concern in this rubric.";
    if (text.includes("menadione")) return "Menadione is a controversial vitamin K source and is penalized.";
    if (isByProduct(text) && index <= 4) return "By-products high in the list reduce protein transparency.";
    return "This ingredient lowers the quality score under Woof's ingredient rubric.";
  }
  if (includesAny(text, ["corn", "wheat", "soy"]) && index <= 2) {
    return "This common filler appears high in the ingredient list.";
  }
  if (includesAny(text, LEGUME_STARCH_TERMS)) {
    return "Useful in some formulas, but too many legumes or starches can dilute animal protein.";
  }
  return "This is a neutral ingredient; it is common but not a major quality driver.";
}

function ingredientDescription(name) {
  const text = lower(name);
  if (isWholeAnimalProtein(text)) return "A named animal ingredient used as a protein source.";
  if (isMeatMeal(text)) return "A rendered, concentrated animal protein ingredient from a named source.";
  if (isByProduct(text)) return "An animal-derived ingredient with less transparent composition than named meat.";
  if (includesAny(text, GRAIN_TERMS) || includesAny(text, LEGUME_STARCH_TERMS)) return "A carbohydrate or starch source used for energy, texture, or kibble structure.";
  if (text.includes("oil") || text.includes("fat")) return "A fat source that can provide energy and fatty acids.";
  if (text.includes("vitamin") || text.includes("mineral")) return "A micronutrient added to make the food nutritionally complete.";
  if (includesAny(text, BAD_PRESERVATIVES) || includesAny(text, NATURAL_PRESERVATIVES)) return "A preservative used to protect shelf stability.";
  return "An ingredient listed on the product's formula.";
}

function ingredientAlternatives(rating) {
  if (rating === "good") return null;
  if (rating === "bad") return ["named meat ingredients", "natural preservatives", "formulas without artificial colors"];
  return ["more named animal protein", "simpler carbohydrate sources"];
}

function scoreProtein(names) {
  const first = lower(names[0]);
  let score = 58;
  let detail = "Protein quality is based on the first ingredients and protein transparency.";

  if (isWholeAnimalProtein(first)) {
    score = 82;
    detail = "A named animal ingredient leads the formula.";
  } else if (isMeatMeal(first)) {
    score = 66;
    detail = "A named meat meal leads the formula; concentrated but less ideal than whole meat.";
  } else if (isByProduct(first)) {
    score = 42;
    detail = "A by-product appears as the primary protein source.";
  } else if (isPlantProteinConcentrate(first)) {
    score = 38;
    detail = "A plant protein concentrate appears high in the formula.";
  }

  const animalCount = names.filter((name) => isWholeAnimalProtein(name) || isMeatMeal(name)).length;
  const byProductHigh = names.slice(0, 5).some(isByProduct);
  const plantProteinHigh = names.slice(0, 5).some(isPlantProteinConcentrate);

  if (animalCount >= 3) score += 6;
  if (byProductHigh) score = Math.min(score, 50);
  if (plantProteinHigh) score -= 8;

  return { score: clampScore(score), detail };
}

function scoreSafety(names) {
  const all = lower(names.join(" "));
  let score = 84;
  let detail = "No major synthetic preservative safety flags were found in the ingredient list.";

  if (includesAny(all, BAD_PRESERVATIVES)) {
    score = 30;
    detail = "BHA, BHT, or ethoxyquin appears in the formula.";
  } else if (all.includes("propylene glycol")) {
    score = 35;
    detail = "Propylene glycol appears in the formula.";
  } else if (all.includes("menadione")) {
    score = 62;
    detail = "Menadione is present and lowers ingredient safety.";
  } else if (names.some((name) => isByProduct(name))) {
    score = 70;
    detail = "By-products reduce ingredient transparency.";
  }

  return { score: clampScore(score), detail };
}

function numeric(value) {
  const parsed = typeof value === "string"
    ? Number.parseFloat(value.replace(/[% ,]/g, ""))
    : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasPublishedGuaranteedAnalysis(product = {}) {
  const hasPublishedNutrients = product.hasPublishedNutrients === true
    || product.has_published_nutrients === true;
  if (!hasPublishedNutrients) return false;

  const nutriments = product.nutriments || {};
  return [nutriments.protein, nutriments.fat, nutriments.fiber]
    .some((value) => numeric(value) != null);
}

function scoreBalance(nutriments = {}, petType = "unknown") {
  const protein = numeric(nutriments.protein);
  const fat = numeric(nutriments.fat);
  const fiber = numeric(nutriments.fiber);
  let score = 68;
  let detail = "Limited guaranteed analysis data is available, so balance is scored conservatively.";

  if (protein != null || fat != null || fiber != null) {
    score = 74;
    detail = "Protein, fat, and fiber data were considered from the product record.";

    if (petType === "cat" && protein != null && protein < 8) score -= 12;
    if (petType !== "cat" && protein != null && protein < 18) score -= 8;
    if (protein != null && protein >= 25) score += 6;
    if (fat != null && fat >= 8 && fat <= 22) score += 5;
    if (fiber != null && fiber > 8) score -= 7;
  }

  return { score: clampScore(score), detail };
}

function scoreFillers(names) {
  const topThree = names.slice(0, 3).map(lower);
  const all = names.map(lower);
  let score = 78;
  let detail = "No heavy top-three corn, wheat, or soy filler pattern was found.";

  const topFiller = topThree.some((name) => includesAny(name, ["corn", "wheat", "soy"]));
  const unnamedGrains = all.filter((name) => name.includes("grain") || name.includes("cereal")).length;
  const legumesAndStarches = all.filter((name) => includesAny(name, LEGUME_STARCH_TERMS)).length;

  if (topFiller) {
    score = 40;
    detail = "Corn, wheat, or soy appears in the top three ingredients.";
  } else if (unnamedGrains >= 2) {
    score = 35;
    detail = "Multiple generic grain ingredients reduce filler quality.";
  } else if (legumesAndStarches >= 4) {
    score = 55;
    detail = "Several legumes or starches appear in the formula.";
  } else if (legumesAndStarches >= 2) {
    score = 66;
    detail = "Some legumes or starches are present but not dominant.";
  }

  return { score: clampScore(score), detail };
}

function scoreAdditives(names) {
  const all = lower(names.join(" "));
  let score = 82;
  let detail = "No major artificial additive concerns were found.";

  if (includesAny(all, ARTIFICIAL_COLORS)) {
    score = 30;
    detail = "Artificial colors appear in the formula.";
  } else if (all.includes("artificial flavor")) {
    score = 40;
    detail = "Artificial flavor appears in the formula.";
  } else if (includesAny(all, NATURAL_PRESERVATIVES)) {
    score = 88;
    detail = "Natural preservatives such as tocopherols or rosemary are used.";
  }

  if (all.includes("sugar") || all.includes("corn syrup")) score = Math.min(score, 55);
  return { score: clampScore(score), detail };
}

function levelFromPercent(value, high, low) {
  const number = numeric(value);
  if (number == null) return "unknown";
  if (number >= high) return "high";
  if (number <= low) return "low";
  return "moderate";
}

function percentText(value) {
  const number = numeric(value);
  return number == null ? "N/A" : `${number}%`;
}

function lifestageFromName(name) {
  const text = lower(name);
  if (text.includes("puppy")) return "Puppy";
  if (text.includes("kitten")) return "Kitten";
  if (text.includes("senior")) return "Senior";
  if (text.includes("adult")) return "Adult";
  if (text.includes("all life stages")) return "All Life Stages";
  return "Unknown";
}

function buildPros(names, categories) {
  const pros = [];
  if (categories[0].score >= 70) pros.push("Uses a transparent named protein source.");
  if (names.some((name) => includesAny(lower(name), GOOD_SUPPORTS))) pros.push("Includes functional support ingredients.");
  if (categories[3].score >= 70) pros.push("Does not rely heavily on top-listed corn, wheat, or soy fillers.");
  if (categories[4].score >= 80) pros.push("Avoids major artificial additive concerns.");
  return pros.slice(0, 4);
}

function buildCons(names, categories) {
  const cons = [];
  if (categories[0].score <= 50) cons.push("Protein source transparency is limited.");
  if (categories[3].score <= 55) cons.push("Filler or starch content lowers the score.");
  if (categories[4].score <= 55) cons.push("Artificial additives or sweeteners reduce quality.");
  if (names.some(isByProduct)) cons.push("Contains by-products, which are less transparent than named meats.");
  return cons.slice(0, 4);
}

function buildPetSafety({ names, score, safetyScore, petType }) {
  const all = lower(names.join(" "));
  const petLabel = petType === "cat" ? "cat" : petType === "dog" ? "dog" : "pet";

  if (includesAny(all, BAD_PRESERVATIVES) || all.includes("propylene glycol")) {
    return {
      level: "avoid",
      label: `Avoid for your ${petLabel}`,
      summary: "The verified ingredient list contains a major safety flag under Woof's rubric.",
    };
  }

  if (score < 50 || safetyScore < 60 || names.some(isByProduct)) {
    return {
      level: "caution",
      label: `Use caution for your ${petLabel}`,
      summary: "This food may be usable, but the verified ingredients show quality or transparency tradeoffs.",
    };
  }

  return {
    level: "safe",
    label: `Looks safe for your ${petLabel}`,
    summary: "No major ingredient safety flags were found in the verified catalog ingredient list.",
  };
}

export function buildVerifiedPetFoodAnalysis(product = {}) {
  const names = ingredientNamesFromProduct(product);
  if (!hasVerifiedIngredientData(product) || names.length === 0) {
    throw new Error("Verified ingredient list is required before scoring this product.");
  }

  const petType = ["dog", "cat"].includes(product.petType) ? product.petType : "unknown";
  const hasPublishedNutrients = hasPublishedGuaranteedAnalysis(product);
  const nutriments = hasPublishedNutrients ? (product.nutriments || {}) : {};
  const protein = scoreProtein(names);
  const safety = scoreSafety(names);
  const balance = scoreBalance(nutriments, petType);
  const filler = scoreFillers(names);
  const additives = scoreAdditives(names);
  const categories = [
    { name: "Protein Quality", score: protein.score, detail: protein.detail },
    { name: "Ingredient Safety", score: safety.score, detail: safety.detail },
    { name: "Nutritional Balance", score: balance.score, detail: balance.detail },
    { name: "Filler Content", score: filler.score, detail: filler.detail },
    { name: "Additives & Preservatives", score: additives.score, detail: additives.detail },
  ];

  let overallScore = (
    protein.score * 0.25 +
    safety.score * 0.20 +
    balance.score * 0.20 +
    filler.score * 0.20 +
    additives.score * 0.15
  );

  const all = lower(names.join(" "));
  if (includesAny(all, BAD_PRESERVATIVES)) overallScore = Math.min(overallScore, 35);
  if (all.includes("propylene glycol")) overallScore = Math.min(overallScore, 40);
  if (isByProduct(primaryProteinSource(names))) overallScore = Math.min(overallScore, 50);

  const score = clampScore(overallScore);
  const ingredientStatus = lower(product.ingredientVerificationStatus || product.ingredient_verification_status);
  const sourceLabel = ingredientStatus
    ? `${ingredientStatus.replace(/_/g, " ")} catalog record`
    : product.sourceKind === "opff"
      ? "Open Pet Food Facts record"
      : "Woof catalog record";
  const primaryProtein = primaryProteinSource(names);
  const pros = buildPros(names, categories);
  const cons = buildCons(names, categories);
  const rawProductName = product.productName || "Pet Food";
  const brand = product.brand || "Unknown";
  const displayProductName = brand !== "Unknown" && !lower(rawProductName).includes(lower(brand))
    ? `${brand} - ${rawProductName}`
    : rawProductName;
  const verificationState = catalogVerificationState(product);
  const petSafety = buildPetSafety({
    names,
    score,
    safetyScore: safety.score,
    petType,
  });

  return {
    productName: displayProductName,
    brand,
    gtin: product.gtin || product.barcode || "",
    productLine: product.productLine || "",
    flavor: product.flavor || "",
    lifeStage: product.lifeStage || "",
    foodForm: product.foodForm || "",
    packageSize: product.packageSize || "",
    petType,
    imageUrl: product.imageUrl || null,
    sourceUrl: product.sourceUrl || null,
    overallScore: score,
    summary: `Scored from the ingredient list in the ${sourceLabel}. ${primaryProtein} is the primary protein signal used for this result.`,
    categories,
    nutritionAnalysis: {
      hasPublishedNutrients,
      proteinLevel: levelFromPercent(nutriments.protein, petType === "cat" ? 10 : 24, petType === "cat" ? 7 : 18),
      proteinPercent: percentText(nutriments.protein),
      fatLevel: levelFromPercent(nutriments.fat, 18, 7),
      fatPercent: percentText(nutriments.fat),
      fiberPercent: percentText(nutriments.fiber),
      primaryProteinSource: primaryProtein,
      grainFree: !names.some((name) => includesAny(lower(name), GRAIN_TERMS)),
      lifestage: lifestageFromName(product.productName),
      // Do not label a generic energy field as calories per cup without an
      // exact source-backed serving basis.
      caloriesPerCup: "N/A",
    },
    pros,
    cons,
    ingredients: names.map((name, index) => {
      const rating = ingredientRating(name, index);
      return {
        name,
        category: ingredientCategory(name),
        rating,
        reason: ingredientReason(name, rating, index),
        description: ingredientDescription(name),
        alternatives: ingredientAlternatives(rating),
      };
    }),
    verdict: score >= 70
      ? "This looks like a stronger option based on the verified ingredient list. Review the ingredient details for your pet's specific sensitivities."
      : score >= 50
        ? "This food is usable but has tradeoffs in protein transparency, fillers, or additive quality. Compare it with higher-scoring foods before buying."
        : "This product has notable ingredient quality concerns under Woof's rubric. Consider a formula with clearer named proteins and fewer filler or additive flags.",
    petSafety,
    catalogQualityState: verificationState.state,
    verificationState,
    ingredientVerification: {
      status: ingredientStatus || "verified_record",
      source: product.source || product.sourceKind || "catalog",
      sourceQuality: product.sourceQuality || product.source_quality || null,
      sourceUrl: product.sourceUrl || null,
      ingredientCount: names.length,
      verifiedAt: product.verifiedAt || product.verified_at || null,
      imageStatus: product.imageVerificationStatus || product.image_verification_status || null,
      readyToScore: verificationState.readyToScore,
    },
  };
}
