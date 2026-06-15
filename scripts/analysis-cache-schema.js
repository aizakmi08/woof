const CURRENT_ANALYSIS_SCHEMA_VERSION = 2;
const PET_CATEGORY_NAMES_V2 = [
  "Protein Quality",
  "Processing Method",
  "Ingredient Safety",
  "Nutritional Balance",
  "Filler Content",
  "Manufacturer Track Record",
  "Additives & Preservatives",
];

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function schemaValidAnalysis(analysis, { requirePetType = true } = {}) {
  if (!analysis || typeof analysis !== "object" || analysis.error) return false;
  if (Number(analysis.schemaVersion || 0) < CURRENT_ANALYSIS_SCHEMA_VERSION) return false;
  if (typeof analysis.productName !== "string" || analysis.productName.trim().length === 0) return false;
  if (requirePetType && analysis.petType !== "dog" && analysis.petType !== "cat") return false;

  const score = Number(analysis.overallScore);
  if (!Number.isFinite(score) || score < 1 || score > 100) return false;
  if (!hasText(analysis.summary) || !hasText(analysis.verdict)) return false;

  if (!Array.isArray(analysis.ingredients) || analysis.ingredients.length < 3) return false;
  for (const ingredient of analysis.ingredients) {
    if (
      !ingredient ||
      typeof ingredient !== "object" ||
      !hasText(ingredient.name) ||
      !hasText(ingredient.category) ||
      !["good", "bad", "neutral"].includes(ingredient.rating) ||
      !hasText(ingredient.reason)
    ) {
      return false;
    }
  }

  if (!Array.isArray(analysis.categories) || analysis.categories.length !== PET_CATEGORY_NAMES_V2.length) {
    return false;
  }
  const categoryNames = new Set(
    analysis.categories
      .filter((category) =>
        category &&
        typeof category === "object" &&
        hasText(category.name) &&
        Number.isFinite(Number(category.score)) &&
        Number(category.score) >= 1 &&
        Number(category.score) <= 100 &&
        hasText(category.detail)
      )
      .map((category) => category.name)
  );
  if (!PET_CATEGORY_NAMES_V2.every((name) => categoryNames.has(name))) return false;

  const nutrition = analysis.nutritionAnalysis;
  if (
    !nutrition ||
    typeof nutrition !== "object" ||
    !hasText(nutrition.proteinLevel) ||
    !hasText(nutrition.fatLevel) ||
    !hasText(nutrition.primaryProteinSource)
  ) {
    return false;
  }

  return (
    hasText(analysis.processingMethod) &&
    hasText(analysis.processingDetail) &&
    hasText(analysis.aafcoStatement) &&
    hasText(analysis.nutrientDataCompleteness) &&
    hasText(analysis.recallSeverity) &&
    hasText(analysis.recallHistory) &&
    hasText(analysis.testingTransparency)
  );
}

module.exports = {
  CURRENT_ANALYSIS_SCHEMA_VERSION,
  PET_CATEGORY_NAMES_V2,
  schemaValidAnalysis,
};
