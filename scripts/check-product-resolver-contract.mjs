import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const qualityPath = path.join(root, "services", "catalogQuality.js");
const fixturePath = path.join(__dirname, "fixtures", "catalog-quality-cases.json");
const petProfilePath = path.join(root, "services", "petProfile.js");
const petProfileFixturePath = path.join(__dirname, "fixtures", "pet-profile-safety-cases.json");
const labelOcrMatchingPath = path.join(root, "services", "labelOcrMatching.js");
const verifiedScoringPath = path.join(root, "services", "verifiedScoring.js");

function loadCatalogQualityModule() {
  const source = fs.readFileSync(qualityPath, "utf8")
    .replace(/\bexport const\b/g, "const")
    .replace(/\bexport function\b/g, "function");

  return new Function(`
${source}
return {
  CATALOG_QUALITY_STATES,
  catalogQualityState,
  catalogVerificationState,
  productIsVerifiedReady
};
`)();
}

function loadCatalogMergeModule() {
  const source = fs.readFileSync(path.join(root, "services", "productCatalog.js"), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace(/^export\s*\{[\s\S]*?\}\s*from\s*[^;]+;\n/gm, "")
    .replace(/\bexport\s+/g, "");

  return new Function(`
    const createLogger = () => ({ debug() {} });
    ${source}
    return {
      collapseRepeatedIdentityText,
      filterLabelCandidatesForIdentification,
      relaxedCatalogSearchQueries,
      mergeProducts,
      nonCompleteFoodReason,
    };
  `)();
}

function loadPetProfileModule() {
  const source = fs.readFileSync(petProfilePath, "utf8")
    .replace(/\bexport const\b/g, "const")
    .replace(/\bexport function\b/g, "function");

  return new Function(`
${source}
return {
  hasUsablePetProfile,
  normalizePetProfile,
  parseAvoidIngredients,
  personalizePetSafety,
  petProfileSummary
};
`)();
}

function loadVerifiedScoringModule() {
  const source = fs.readFileSync(verifiedScoringPath, "utf8")
    .replace(/^import[^\n]+\n/gm, "")
    .replace(/\bexport function\b/g, "function");

  return new Function(`
    const catalogVerificationState = () => ({ state: "verified_ready", readyToScore: true });
    const splitIngredientStatement = (value) => String(value || "")
      .split(/[,;\\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    ${source}
    return { buildVerifiedPetFoodAnalysis };
  `)();
}

async function loadLabelOcrMatchingModule() {
  const source = fs.readFileSync(labelOcrMatchingPath, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist`);

  const parametersStart = source.indexOf("(", start);
  let parametersDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parametersDepth += 1;
    if (source[index] === ")") parametersDepth -= 1;
    if (parametersDepth === 0) {
      parametersEnd = index;
      break;
    }
  }
  assert(parametersEnd >= 0, `${name} parameters are incomplete`);

  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`${name} body is incomplete`);
}

function checkQualityCases(api) {
  const cases = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

  for (const testCase of cases) {
    const state = api.catalogQualityState(testCase.product, {
      queryText: testCase.queryText || "",
    });
    const ready = api.productIsVerifiedReady(testCase.product, {
      queryText: testCase.queryText || "",
    });
    const verification = api.catalogVerificationState(testCase.product, {
      queryText: testCase.queryText || "",
    });

    assert(
      state === testCase.expectedState,
      `${testCase.name}: expected ${testCase.expectedState}, got ${state}`
    );
    assert(
      ready === testCase.expectedReady,
      `${testCase.name}: expected ready=${testCase.expectedReady}, got ${ready}`
    );
    assert(
      verification.state === testCase.expectedState,
      `${testCase.name}: verification state mismatch`
    );
  }
}

function checkPetProfileCases(api) {
  const cases = JSON.parse(fs.readFileSync(petProfileFixturePath, "utf8"));

  for (const testCase of cases) {
    const safety = api.personalizePetSafety(testCase.result, testCase.profile);
    assert(
      safety.level === testCase.expectedLevel,
      `${testCase.name}: expected ${testCase.expectedLevel}, got ${safety.level}`
    );
    assert(
      safety.personalized === testCase.expectedPersonalized,
      `${testCase.name}: expected personalized=${testCase.expectedPersonalized}`
    );
    assert(
      JSON.stringify(safety.matches) === JSON.stringify(testCase.expectedMatches),
      `${testCase.name}: expected matches ${JSON.stringify(testCase.expectedMatches)}, got ${JSON.stringify(safety.matches)}`
    );
  }
}

function checkLabelOcrMatchingCases(api) {
  const ocrText = [
    "OPEN",
    "FARM",
    "Good Gut",
    "Grass-Fed Beef Recipe",
    "FOOD FOR DOGS",
  ].join("\n");
  const queries = api.labelOcrSearchQueries(ocrText);
  assert(
    queries.some((query) => /open farm goodgut/i.test(query)),
    "on-device OCR must combine nearby brand and product-line text"
  );
  assert(
    queries.some((query) => /open farm goodgut beef/i.test(query)),
    "on-device OCR must preserve recipe terms for variant retrieval"
  );

  const exact = {
    brand: "Open Farm",
    productName: "GoodGut Grass-Fed Beef Recipe",
    petType: "dog",
    rank: 8,
  };
  const sibling = {
    brand: "Open Farm",
    productName: "GoodGut Wild-Caught Salmon Recipe",
    petType: "dog",
    rank: 9,
  };
  const ranked = api.rankProductsForOcr([sibling, exact], ocrText);
  assert(
    ranked[0]?.productName === exact.productName,
    "on-device OCR must rank the photographed recipe above a sibling formula"
  );
  assert(
    api.pickVerifiedProductForOcr(ranked, ocrText)?.productName === exact.productName,
    "on-device OCR must auto-open a unique strong verified match"
  );

  const strictOcrMatches = api.filterProductsForOcr(
    [
      { brand: "Purina ONE", productName: "Purina ONE True Instinct Chicken Wet Dog Food", petType: "dog", foodForm: "wet" },
      { brand: "Instinct", productName: "Instinct Healthy Cravings Real Chicken in Gravy", petType: "dog", foodForm: "wet" },
    ],
    "Instinct Healthy Cravings Real Chicken Recipe in Savory Gravy for Dogs"
  );
  assert(
    strictOcrMatches.length === 1 && strictOcrMatches[0].brand === "Instinct",
    "on-device OCR must reject a cross-brand product whose title happens to contain the scanned brand"
  );

  const blueOcrMatches = api.filterProductsForOcr(
    [
      { brand: "Blue Buffalo", productName: "Life Protection Formula Large Breed Adult Chicken and Brown Rice Dry Dog Food", petType: "dog", foodForm: "dry" },
      { brand: "Blue Buffalo", productName: "Life Protection Formula Adult Chicken and Brown Rice Dry Dog Food", petType: "dog", foodForm: "dry" },
    ],
    "Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice Dry Dog Food"
  );
  assert(
    blueOcrMatches.length === 1 && !/large breed/i.test(blueOcrMatches[0].productName),
    "on-device OCR must reject an unpictured large-breed sibling"
  );

  const wholeheartedQueries = api.labelOcrSearchQueries("hearted\nplus\nBeef & Bravor Rico Recipo");
  assert(
    wholeheartedQueries.some((query) => /wholehearted/i.test(query)) &&
      wholeheartedQueries.some((query) => /rice/i.test(query)),
    "on-device OCR must normalize common package-logo and recipe OCR errors"
  );
}

function checkFormulaVariantMerging(api) {
  const sharedFormula = {
    brand: "Purina ONE",
    productLine: "+Plus Skin & Coat Formula Dry",
    productName: "Purina ONE +Plus Skin & Coat Formula Dry Dog Food",
    flavor: "Salmon",
    lifeStage: "adult",
    foodForm: "dry",
    petType: "dog",
    sourceUrl: "https://www.purina.com/dogs/shop/purina-one-skin-and-coat-dry-dog-food",
    ingredientVerificationStatus: "manufacturer",
    ingredientsText: "Salmon, Rice Flour, Pearled Barley, Oat Meal",
  };
  const variants = api.mergeProducts([
    { ...sharedFormula, gtin: "017800149266", packageSize: "16.5 lb" },
    { ...sharedFormula, gtin: "017800149273", packageSize: "31.1 lb" },
  ]);

  assert(variants.length === 1, "identical verified formulas in different bag sizes must collapse into one search result");
  assert(
    JSON.stringify(variants[0].availablePackageSizes) === JSON.stringify(["16.5 lb", "31.1 lb"]),
    "collapsed formulas must retain every available bag size"
  );

  const conflictingFormula = api.mergeProducts([
    { ...sharedFormula, gtin: "017800149266", packageSize: "16.5 lb" },
    {
      ...sharedFormula,
      gtin: "017800149273",
      packageSize: "31.1 lb",
      ingredientsText: "Salmon, Rice Flour, Barley, Oat Meal",
    },
  ]);
  assert(
    conflictingFormula.length === 2,
    "different verified ingredient statements must remain separate until official reconciliation"
  );
}

function checkRelaxedCatalogQueries(api) {
  const wellnessQueries = api.relaxedCatalogSearchQueries(
    "Wellness Complete Health Chicken Stew with Peas and Carrots in Savory Gravy Wet Dog Food"
  );
  assert(
    wellnessQueries.includes("wellness complete health chicken stew"),
    "catalog fallback must remove garnish text after with without losing exact recipe identity"
  );
  assert(
    wellnessQueries.includes("wellness complete health chicken stews"),
    "catalog fallback must bridge singular and plural official product titles"
  );

  const instinctQueries = api.relaxedCatalogSearchQueries(
    "Instinct FreshDried Meal Blends Cage Free Chicken Harvest Adult Dog Food"
  );
  assert(
    instinctQueries.includes("instinct freshdried meal blends chicken harvest"),
    "catalog fallback must remove packaging noise while preserving brand, line, protein, and variant"
  );

  const productCatalogSource = fs.readFileSync(
    path.join(root, "services", "productCatalog.js"),
    "utf8"
  );
  const searchCatalogProductsSource = extractFunction(
    productCatalogSource.replace("export async function searchCatalogProducts", "async function searchCatalogProducts"),
    "searchCatalogProducts"
  );
  assert(
    /verifiedResultsForQuery\(\s*fallbackQuery,\s*\{\s*relaxed:\s*true\s*\}/.test(searchCatalogProductsSource),
    "catalog fallback must validate relaxed results through the strict identity compatibility gate"
  );
  assert(
    /filterProductsForOcr\(results,\s*correctedQuery\)/.test(searchCatalogProductsSource),
    "relaxed catalog results must still enforce brand, species, form, protein, and variant compatibility"
  );
}

function checkStrictLabelCandidateMatching(api) {
  const candidate = (overrides = {}) => ({
    brand: "Example",
    productName: "Example Adult Chicken Dry Dog Food",
    flavor: "",
    lifeStage: "Adult",
    foodForm: "Dry",
    petType: "dog",
    rank: 8,
    ...overrides,
  });
  const matches = (identification, products) => (
    api.filterLabelCandidatesForIdentification(
      { found: true, confidence: 0.95, petType: "dog", ...identification },
      products
    )
  );

  assert(
    matches(
      {
        brand: "Hill's Science Diet",
        productName: "Perfect Digestion Adult Dry Dog Food",
        productLine: "Science Diet",
        lifeStage: "Adult",
        foodForm: "Dry",
      },
      [
        candidate({ brand: "Hill's", productName: "Hill's Prescription Diet J/D Joint Care Adult Wet Dog Food", productLine: "Prescription Diet", foodForm: "Wet" }),
        candidate({ brand: "Hill's", productName: "Hill's Science Diet Perfect Digestion Adult Dry Dog Food", productLine: "Science Diet" }),
      ]
    )[0]?.productLine === "Science Diet",
    "label matching must reject a Prescription Diet sibling for a Science Diet label"
  );

  assert(
    matches(
      { brand: "Instinct", productName: "Healthy Cravings Real Chicken in Gravy", flavor: "Chicken", foodForm: "Wet" },
      [
        candidate({ brand: "Purina ONE", productName: "Purina ONE True Instinct Chicken and Duck Wet Dog Food", foodForm: "Wet" }),
        candidate({ brand: "Instinct", productName: "Instinct Healthy Cravings Real Chicken in Gravy Wet Dog Food", productLine: "Healthy Cravings", foodForm: "Wet" }),
      ]
    )[0]?.brand === "Instinct",
    "label matching must never cross brands because a competitor product name contains the scanned brand"
  );

  assert(
    matches(
      { brand: "Blue Buffalo", productName: "Life Protection Formula Adult Chicken and Brown Rice", lifeStage: "Adult", foodForm: "Dry" },
      [
        candidate({ brand: "Blue Buffalo", productName: "Life Protection Formula Large Breed Adult Chicken and Brown Rice Dry Dog Food", productLine: "Life Protection Formula", flavor: "Chicken and Brown Rice" }),
        candidate({ brand: "Blue Buffalo", productName: "Life Protection Formula Adult Chicken and Brown Rice Dry Dog Food", productLine: "Life Protection Formula", flavor: "Chicken and Brown Rice" }),
      ]
    )[0]?.productName === "Life Protection Formula Adult Chicken and Brown Rice Dry Dog Food",
    "a standard adult label must reject an unpictured large-breed variant"
  );

  assert(
    matches(
      { brand: "Royal Canin", productName: "Weight Care Loaf in Gravy", productLine: "Weight Care", foodForm: "Wet" },
      [
        candidate({ brand: "Royal Canin", productName: "Royal Canin Weight Care Adult Dry Dog Food", productLine: "Weight Care", foodForm: "Dry" }),
        candidate({ brand: "Royal Canin", productName: "Royal Canin Weight Care Loaf in Sauce Wet Dog Food", productLine: "Weight Care", foodForm: "Wet" }),
      ]
    )[0]?.foodForm === "Wet",
    "wet loaf labels must reject dry siblings while treating sauce and gravy as equivalent texture wording"
  );

  assert(
    /not complete pet food/i.test(api.nonCompleteFoodReason("Instinct Raw Boost Mixers Gut Health Topper")),
    "meal mixers and toppers must be identified as out of complete-food scoring scope"
  );

  assert(
    matches(
      {
        brand: "Hill's Science Diet",
        productName: "Perfect Digestion Adult Chicken Brown Rice Dry Dog Food",
        productLine: "Science Diet Perfect Digestion",
        lifeStage: "Adult",
        foodForm: "Dry",
      },
      [
        candidate({ brand: "Hill's Science Diet", productName: "Perfect Digestion Adult Wet Cat Food Chicken Stew", petType: "cat", foodForm: "Wet" }),
        candidate({ brand: "Hill's Science Diet", productName: "Perfect Digestion Adult Chicken and Brown Rice Dry Dog Food", productLine: "Science Diet Perfect Digestion" }),
      ]
    ).length === 1,
    "Hill's dry dog labels must never return wet cat siblings"
  );

  assert(
    matches(
      { brand: "Open Farm", productName: "Grain-Free Wild-Caught Salmon Recipe", flavor: "Wild-Caught Salmon", foodForm: "Dry" },
      [
        candidate({ brand: "Open Farm", productName: "Wild-Caught Salmon Grain-Free Senior Dog Kibble", flavor: "Salmon", lifeStage: "Senior" }),
        candidate({ brand: "Open Farm", productName: "Grain-Free Wild-Caught Salmon Adult Dry Dog Food", flavor: "Wild-Caught Salmon" }),
      ]
    )[0]?.productName === "Grain-Free Wild-Caught Salmon Adult Dry Dog Food",
    "Open Farm adult labels must reject an unpictured senior variant"
  );

  assert(
    /not complete pet food/i.test(api.nonCompleteFoodReason("The Honest Kitchen Daily Boosters Turkey Bone Broth")),
    "daily broth boosters must route to the unsupported-product state"
  );

  assert(
    matches(
      { brand: "The Honest Kitchen", productName: "Gourmet Whole Food Clusters Grain Free Beef and Superfoods", flavor: "Beef" },
      [
        candidate({ brand: "The Honest Kitchen", productName: "Grain Free Clusters Adult Dog Dry Food Turkey", flavor: "Turkey" }),
        candidate({ brand: "The Honest Kitchen", productName: "Gourmet Whole Food Clusters Grain Free Beef and Superfoods", flavor: "Beef" }),
      ]
    )[0]?.flavor === "Beef",
    "a beef label must never score the turkey recipe"
  );

  assert(
    /not complete pet food/i.test(api.nonCompleteFoodReason("Stella & Chewy's Meal Mixers Savory Salmon and Cod Recipe")),
    "Stella & Chewy's meal mixers must route to the unsupported-product state"
  );

  assert(
    matches(
      { brand: "Instinct", productName: "FreshDried Meal Blends Cage-Free Chicken and Harvest Blend", productLine: "FreshDried Meal Blends", flavor: "Chicken", foodForm: "Freeze Dried" },
      [
        candidate({ brand: "Instinct", productName: "Instinct Freshly Crafted Meals Cage-Free Chicken Recipe", foodForm: "Wet" }),
        candidate({ brand: "Instinct", productName: "Instinct FreshRaw Meals Cage-Free Chicken Recipe", foodForm: "Fresh" }),
        candidate({ brand: "Instinct", productName: "Instinct FreshDried Meal Blends Cage-Free Chicken and Harvest Blend", foodForm: "Freeze Dried" }),
      ]
    )[0]?.productName.includes("FreshDried"),
    "FreshDried labels must reject Freshly Crafted and FreshRaw siblings"
  );

  assert(
    /not complete pet food/i.test(api.nonCompleteFoodReason("Instinct Grain-Free Healthy Cravings Real Chicken Recipe in Savory Gravy")),
    "Instinct Healthy Cravings complements must route to the unsupported-product state"
  );

  assert(
    matches(
      { brand: "Wellness", productName: "CORE+ Adult High-Protein Kibble Wild Game", productLine: "CORE+", flavor: "Wild Game", foodForm: "Dry" },
      [
        candidate({ brand: "Wellness", productName: "Wellness CORE 95% Beef and Carrots Wet Dog Food", productLine: "CORE 95%", flavor: "Beef", foodForm: "Wet" }),
        candidate({ brand: "Wellness", productName: "Wellness CORE+ Beef and Barley Recipe Dry Dog Food", productLine: "CORE+", flavor: "Beef" }),
        candidate({ brand: "Wellness", productName: "Wellness CORE+ Wild Game Adult Dry Dog Food", productLine: "CORE+", flavor: "Wild Game" }),
      ]
    )[0]?.flavor === "Wild Game",
    "Wellness CORE+ Wild Game labels must reject CORE 95% wet food and other CORE+ recipes"
  );

  assert(
    matches(
      { brand: "Wellness", productName: "Complete Health Chicken Stew with Peas and Carrots in Savory Gravy", productLine: "Complete Health", flavor: "Chicken", foodForm: "Wet", petType: "cat" },
      [
        candidate({ brand: "Wellness", productName: "Wellness Complete Health Adult Dry Dog Food Chicken", foodForm: "Dry", petType: "dog" }),
        candidate({ brand: "Wellness", productName: "Wellness Complete Health Chicken Stew with Peas and Carrots in Savory Gravy Wet Cat Food", foodForm: "Wet", petType: "cat" }),
      ]
    )[0]?.petType === "cat",
    "Wellness wet cat labels must reject dry dog food"
  );

  assert(
    api.collapseRepeatedIdentityText("Wellness Core Wellness Core Adult Wild Game") === "Wellness Core Adult Wild Game"
      && api.collapseRepeatedIdentityText("Open Farm Open Farm Grain Free Salmon") === "Open Farm Grain Free Salmon",
    "repeated OCR brand and product-line phrases must collapse before display and search"
  );
}

function checkVerifiedNutritionFacts(api) {
  const product = {
    productName: "Example Adult Dog Food",
    brand: "Example",
    petType: "dog",
    ingredientsText: "Chicken, brown rice, chicken meal, barley, flaxseed",
    sourceUrl: "https://example.com/product",
    ingredientVerificationStatus: "manufacturer",
    imageUrl: "https://example.com/front.jpg",
    imageVerificationStatus: "manufacturer",
    hasPublishedNutrients: false,
    nutriments: { protein: 0, fat: 0, fiber: 0 },
  };

  const withoutPublishedFacts = api.buildVerifiedPetFoodAnalysis(product);
  assert(
    withoutPublishedFacts.nutritionAnalysis.hasPublishedNutrients === false,
    "missing source-backed guaranteed analysis must stay unavailable"
  );
  assert(
    withoutPublishedFacts.nutritionAnalysis.proteinPercent === "N/A"
      && withoutPublishedFacts.nutritionAnalysis.fatPercent === "N/A"
      && withoutPublishedFacts.nutritionAnalysis.fiberPercent === "N/A",
    "missing guaranteed analysis must never render as 0%"
  );
  assert(
    /Limited guaranteed analysis data/.test(withoutPublishedFacts.categories[2]?.detail || ""),
    "balance scoring must be conservative when guaranteed analysis is unavailable"
  );

  const withPublishedFacts = api.buildVerifiedPetFoodAnalysis({
    ...product,
    hasPublishedNutrients: true,
    nutriments: { protein: 26, fat: 16, fiber: 4 },
  });
  assert(
    withPublishedFacts.nutritionAnalysis.hasPublishedNutrients === true
      && withPublishedFacts.nutritionAnalysis.proteinPercent === "26%"
      && withPublishedFacts.nutritionAnalysis.fatPercent === "16%"
      && withPublishedFacts.nutritionAnalysis.fiberPercent === "4%",
    "published guaranteed analysis must retain the exact catalog percentages"
  );
}

function checkResolverWiring() {
  const productCatalog = fs.readFileSync(path.join(root, "services", "productCatalog.js"), "utf8");
  const productSearchScreen = fs.readFileSync(path.join(root, "screens", "ProductSearchScreen.js"), "utf8");
  const scannerScreen = fs.readFileSync(path.join(root, "screens", "ScannerScreen.js"), "utf8");
  const resultsScreen = fs.readFileSync(path.join(root, "screens", "ResultsScreen", "index.js"), "utf8");
  const profileScreen = fs.readFileSync(path.join(root, "screens", "ProfileScreen.js"), "utf8");
  const homeScreen = fs.readFileSync(path.join(root, "screens", "HomeScreen.js"), "utf8");
  const analysisService = fs.readFileSync(path.join(root, "services", "analysisService.js"), "utf8");
  const historyService = fs.readFileSync(path.join(root, "services", "history.js"), "utf8");
  const resultsComponents = fs.readFileSync(path.join(root, "screens", "ResultsScreen", "components.js"), "utf8");
  const authService = fs.readFileSync(path.join(root, "services", "auth.js"), "utf8");
  const petProfileMigration = fs.readFileSync(
    path.join(root, "supabase", "migrations", "286_pet_profile_personalized_safety.sql"),
    "utf8"
  );
  const petProfileGrantRepair = fs.readFileSync(
    path.join(
      root,
      "supabase",
      "migrations",
      "295_restore_pet_profile_write_grant.sql"
    ),
    "utf8"
  );

  assert(
    /export async function resolveProduct/.test(productCatalog),
    "productCatalog must export resolveProduct"
  );
  assert(
    /type:\s*"label"/.test(productSearchScreen) && /type:\s*"search"/.test(productSearchScreen),
    "ProductSearchScreen must use resolveProduct for label and search flows"
  );
  assert(
    /type:\s*"label_text"/.test(productSearchScreen)
      && /resolveFastLabelLookup/.test(productSearchScreen)
      && /LABEL_RECONCILIATION_GRACE_MS/.test(productSearchScreen)
      && /filterProductsForOcr\([\s\S]*\[cloudSelected\][\s\S]*onDevice\.result\.query/.test(productSearchScreen),
    "ProductSearchScreen must race on-device OCR and cloud image matching without serial waits"
  );
  assert(
    /labelCaptureStartedAt/.test(scannerScreen)
      && /capture_to_handoff_ms/.test(scannerScreen)
      && !/await recognizeLabelText\(/.test(scannerScreen),
    "ScannerScreen must hand the optimized image to the result flow before on-device OCR runs"
  );
  assert(
    /CATALOG_VERIFICATION_REQUIRED/.test(analysisService),
    "analysisService must block direct catalog scoring without full verification"
  );

  const editDistanceSource = extractFunction(productCatalog, "editDistance");
  const editDistance = new Function(`${editDistanceSource}; return editDistance;`)();
  assert(
    editDistance("paln", "plan") === 1,
    "catalog search must treat adjacent letter transpositions as one typo"
  );
  assert(
    editDistance("fram", "farm") === 1,
    "catalog search must treat transposed brand letters as one typo"
  );
  assert(
    /CATALOG_SEARCH_CANONICAL_TERMS[\s\S]*"plan"/.test(productCatalog),
    "catalog search correction vocabulary must include plan"
  );
  assert(
    /CATALOG_SEARCH_CANONICAL_TERMS[\s\S]*"farm"/.test(productCatalog),
    "catalog search correction vocabulary must include the Open Farm brand token"
  );
  assert(
    /\["pro pln",\s*"pro plan"\]/.test(productCatalog),
    "catalog search must recover the common shortened Pro Plan typo"
  );
  assert(
    /useTextureSynonyms:\s*true/.test(productCatalog),
    "typed catalog search must enable the narrow texture-synonym fallback"
  );
  const labelSearchQuerySource = extractFunction(productCatalog, "labelSearchQuery");
  assert(
    /identification\.productLine/.test(labelSearchQuerySource) &&
      !/identification\.packageSize/.test(labelSearchQuerySource) &&
      !/identification\.foodForm/.test(labelSearchQuerySource),
    "label retrieval must use stable identity fields while reserving package size and form for variant confirmation"
  );
  const labelSearchQuery = new Function(`
    ${extractFunction(productCatalog, "normalizeText")}
    ${extractFunction(productCatalog, "compact")}
    ${labelSearchQuerySource}
    return labelSearchQuery;
  `)();
  assert(
    labelSearchQuery({
      brand: "Open Farm",
      productLine: "Rawmix",
      productName: "Open Farm Rawmix Open Prairie Recipe",
      flavor: "Open Prairie Recipe",
      foodForm: "raw",
      packageSize: "8 lb",
    }) === "Open Farm Rawmix Open Prairie Recipe",
    "label retrieval must remove repeated brand, line, flavor, form, and photographed package-size noise"
  );
  assert(
    labelSearchQuery({
      brand: "Open Farm",
      productLine: "GoodGut",
      productName: "GoodGut Grass-Fed Beef Recipe",
    }) === "Open Farm GoodGut Grass-Fed Beef Recipe",
    "label retrieval must preserve a brand that is not already present in the product name"
  );
  assert(
    /labelSearchQueries\(identification\)/.test(productCatalog) &&
      /searchWoofCatalogForLabelIdentity\(searchQueries, 96\)/.test(productCatalog) &&
      !/for \(const candidateQuery of searchQueries\)/.test(productCatalog),
    "label resolution must batch identity queries instead of waiting on sequential catalog round trips"
  );
  assert(
    /\["advanced edge", "advantedge"\]/.test(productCatalog) &&
      /\["whole hearted", "wholehearted"\]/.test(productCatalog) &&
      /labelRelaxedRecipeSearchQuery/.test(productCatalog),
    "label resolution must normalize split trademarks and retain a conservative recipe-only fallback"
  );
  assert(
    /if \(matches\.length > 1\) return null/.test(productCatalog),
    "label resolution must show choices instead of auto-opening an ambiguous verified variant"
  );
  assert(
    /fallbackQueries\.map\(\(fallbackQuery\) => verifiedResultsForQuery\(fallbackQuery\)\)/.test(productCatalog),
    "texture-synonym fallbacks must preserve normal verified-result filtering"
  );
  assert(
    /gtinKeys\.some\(\(key\) => seenGtins\.has\(key\)\)[\s\S]*seenFormulas\.has\(formulaKey\)[\s\S]*seenFormulas\.add\(formulaKey\)/.test(productCatalog),
    "catalog results must deduplicate displayed formulas even when their SKU GTINs differ"
  );
  assert(
    /mode === "catalog" && navigation\.canGoBack\(\)[\s\S]*navigation\.goBack\(\)[\s\S]*navigation\.popToTop\(\)/.test(resultsScreen),
    "catalog results must return to search while scan results still return Home"
  );
  assert(
    /personalizePetSafety\(result, savedPetProfile\)/.test(resultsScreen) && /Add Pet Details/.test(resultsScreen),
    "pet-food results must use saved pet details or offer the personalization path"
  );
  assert(
    /updatePetProfile/.test(authService) && /pet_profile: petProfile/.test(authService),
    "Auth context must persist normalized pet profiles"
  );
  assert(
    /PET_AVOID_PRESETS/.test(profileScreen) && /Save Pet/.test(profileScreen),
    "Profile must provide a complete pet editor"
  );
  assert(
    /source: "saved_pet_profile"/.test(homeScreen),
    "human-food checks must reuse the saved pet species"
  );
  assert(
    /hydrateHistoryDisplayImages/.test(historyService)
      && /productHasVerifiedImage\(product\)/.test(historyService)
      && /product_image_url/.test(historyService)
      && /displayImageUrl/.test(homeScreen),
    "recent scans must prefer verified catalog front images over temporary capture files"
  );
  assert(
    /catalogProduct\?\.imageUrl \|\| uri \|\| null/.test(analysisService),
    "new catalog scans must persist the verified product image for history"
  );
  assert(
    /Guaranteed Analysis/.test(resultsComponents)
      && /!nutrition\?\.hasPublishedNutrients/.test(resultsComponents),
    "results must hide unavailable nutrition instead of rendering synthetic 0% facts"
  );
  assert(
    /ADD COLUMN IF NOT EXISTS pet_profile JSONB/.test(petProfileMigration) && /GRANT UPDATE \(pet_profile, updated_at\)/.test(petProfileMigration),
    "pet profile migration must add bounded user-owned storage"
  );
  assert(
    /REVOKE UPDATE \(pet_profile, updated_at\)[\s\S]+FROM anon/.test(petProfileGrantRepair)
      && /GRANT UPDATE \(pet_profile, updated_at\)[\s\S]+TO authenticated/.test(petProfileGrantRepair),
    "pet profile grant repair must restore only authenticated user-owned writes"
  );
}

const api = loadCatalogQualityModule();
checkQualityCases(api);
checkPetProfileCases(loadPetProfileModule());
checkLabelOcrMatchingCases(await loadLabelOcrMatchingModule());
const catalogApi = loadCatalogMergeModule();
checkFormulaVariantMerging(catalogApi);
checkRelaxedCatalogQueries(catalogApi);
checkStrictLabelCandidateMatching(catalogApi);
checkVerifiedNutritionFacts(loadVerifiedScoringModule());
checkResolverWiring();
console.log("Product resolver contract checks passed.");
