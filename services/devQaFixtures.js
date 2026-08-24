const now = new Date().toISOString();

const chickenIngredients = [
  { name: "Chicken", rating: "good", category: "Animal protein", explanation: "Named protein source." },
  { name: "Brown Rice", rating: "neutral", category: "Carbohydrate", explanation: "Grain ingredient." },
  { name: "Chicken Fat", rating: "neutral", category: "Fat", explanation: "Named animal fat." },
  { name: "Dried Beet Pulp", rating: "neutral", category: "Fiber", explanation: "Fiber source." },
  { name: "Mixed Tocopherols", rating: "good", category: "Preservative", explanation: "Preservative source." },
];

export const DEV_QA_PET_RESULT = {
  productName: "QA Chicken & Brown Rice Adult Recipe",
  brand: "QA Fixture",
  petType: "dog",
  overallScore: 82,
  verdict: "A source-backed fixture used only in development to verify the Results layout. The production app never serves this fixture as catalog evidence.",
  petSafety: { level: "safe" },
  ingredients: chickenIngredients,
  categories: [
    { name: "Ingredient quality", score: 84, detail: "Development fixture for layout verification." },
    { name: "Protein clarity", score: 80, detail: "Development fixture for layout verification." },
    { name: "Additive profile", score: 82, detail: "Development fixture for layout verification." },
  ],
  nutritionAnalysis: {
    hasPublishedNutrients: true,
    analysisTypeLabel: "Guaranteed Analysis",
    analysisBasisLabel: "As fed",
    primaryProteinSource: "Chicken",
    grainFree: false,
    lifestage: "Adult",
    caloriesPerCup: "365 kcal/cup",
    proteinPercent: "26%",
    proteinLevel: "moderate",
    fatPercent: "15%",
    fatLevel: "moderate",
    fiberPercent: "4%",
    moisturePercent: "10%",
  },
  ingredientVerification: {
    verified: true,
    status: "verified_ready",
    source: "manufacturer",
    sourceQuality: "manufacturer_current_exact",
    imageStatus: "manufacturer",
    formulaEvidenceTier: "manufacturer_current_exact",
    verifiedAt: now,
  },
  dataSource: "verified",
};

export const DEV_QA_PARTIAL_RESULT = {
  productName: DEV_QA_PET_RESULT.productName,
  brand: DEV_QA_PET_RESULT.brand,
  petType: DEV_QA_PET_RESULT.petType,
  ingredientVerification: DEV_QA_PET_RESULT.ingredientVerification,
  dataSource: "verified",
};

export const DEV_QA_PET_AVOID_PROFILE = {
  name: "Rex",
  petType: "dog",
  lifeStage: "adult",
  avoidIngredients: ["chicken"],
};

function humanFoodResult(safetyLevel) {
  const labels = {
    safe: { foodName: "Plain Cooked Carrot", summary: "Development-only safe-state fixture.", portions: "Small pieces" },
    caution: { foodName: "Cheese", summary: "Development-only caution-state fixture.", portions: "Small amount" },
    dangerous: { foodName: "Chocolate", summary: "Development-only dangerous-state fixture.", portions: "Do not feed" },
    unidentified: { foodName: "Unidentified Food", summary: "The item could not be identified from this development fixture.", portions: "N/A" },
  };
  const item = labels[safetyLevel] || labels.unidentified;
  return {
    ...item,
    petType: "dog",
    safetyLevel: safetyLevel === "unidentified" ? "unknown" : safetyLevel,
    preparation: safetyLevel === "safe" ? "Plain" : "N/A",
    ageGuidance: {
      note: safetyLevel === "safe" ? "All ages" : "Ask a veterinarian",
      puppiesOrKittens: safetyLevel === "safe" ? "safe" : "caution",
      adults: safetyLevel === "dangerous" ? "avoid" : safetyLevel === "safe" ? "safe" : "caution",
      seniors: safetyLevel === "dangerous" ? "avoid" : safetyLevel === "safe" ? "safe" : "caution",
    },
    explanation: "This is a development-only fixture for testing state presentation.",
    symptoms: safetyLevel === "dangerous" ? "Contact a veterinarian or pet poison service for guidance." : "N/A",
    toxicCompounds: safetyLevel === "dangerous" ? ["Development fixture warning"] : [],
    benefits: safetyLevel === "safe" ? ["Development fixture benefit"] : [],
  };
}

export const DEV_QA_HUMAN_RESULTS = {
  safe: humanFoodResult("safe"),
  caution: humanFoodResult("caution"),
  dangerous: humanFoodResult("dangerous"),
  unidentified: humanFoodResult("unidentified"),
};

export const DEV_QA_SEARCH_PRODUCTS = [
  {
    cacheKey: "dev-qa-small-5lb",
    productName: "QA Small Breed Chicken Recipe",
    brand: "QA Fixture",
    petType: "dog",
    form: "dry",
    packageSize: "5 lb bag",
    packageSizes: ["5 lb bag"],
    ingredientCount: 5,
    ingredients: chickenIngredients,
    ingredientVerificationStatus: "manufacturer",
    imageVerificationStatus: "manufacturer",
    imageUrl: "https://qa.invalid/dev-product-5lb.png",
    sourceUrl: "https://qa.invalid/dev-product-5lb",
    source: "manufacturer",
    sourceQuality: "manufacturer_current_exact",
  },
  {
    cacheKey: "dev-qa-small-15lb",
    productName: "QA Small Breed Chicken Recipe",
    brand: "QA Fixture",
    petType: "dog",
    form: "dry",
    packageSize: "15 lb bag",
    packageSizes: ["15 lb bag"],
    ingredientCount: 5,
    ingredients: chickenIngredients,
    ingredientVerificationStatus: "manufacturer",
    imageVerificationStatus: "manufacturer",
    imageUrl: "https://qa.invalid/dev-product-15lb.png",
    sourceUrl: "https://qa.invalid/dev-product-15lb",
    source: "manufacturer",
    sourceQuality: "manufacturer_current_exact",
  },
];

export const DEV_QA_HISTORY = [
  {
    id: "dev-history-pet-1",
    productName: DEV_QA_PET_RESULT.productName,
    overallScore: 82,
    petType: "dog",
    dateScanned: now,
    cacheKey: "dev-history-pet-1",
    scanMode: "catalog",
    dataSource: "verified",
  },
  ...Object.entries(DEV_QA_HUMAN_RESULTS).map(([state, result], index) => ({
    id: `dev-history-human-${state}`,
    productName: result.foodName,
    foodName: result.foodName,
    overallScore: null,
    petType: "dog",
    dateScanned: new Date(Date.now() - (index + 1) * 60_000).toISOString(),
    cacheKey: `dev-history-human-${state}`,
    scanMode: "human_food",
    dataSource: "ai",
    safetyLevel: result.safetyLevel,
    resultSnapshot: result,
  })),
];
