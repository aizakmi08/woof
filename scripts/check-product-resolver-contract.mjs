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
const labelResolutionPath = path.join(root, "services", "labelResolution.js");
const cameraCropPath = path.join(root, "services", "cameraCrop.js");
const verifiedScoringPath = path.join(root, "services", "verifiedScoring.js");
const reviewPromptPolicyPath = path.join(root, "services", "reviewPromptPolicy.js");
const liveLabelFixturePath = path.join(
  __dirname,
  "fixtures",
  "live-label-lookup-cases.json"
);

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
  productMatchesQueryTerms,
  productIsVerifiedReady
};
`)();
}

function loadCatalogMergeModule() {
  const labelResolutionSource = fs.readFileSync(labelResolutionPath, "utf8")
    .replace(/\bexport const\b/g, "const")
    .replace(/\bexport function\b/g, "function");
  const source = fs.readFileSync(path.join(root, "services", "productCatalog.js"), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace(/^export\s*\{[\s\S]*?\}\s*from\s*[^;]+;\n/gm, "")
    .replace(/\bexport\s+/g, "");

  return new Function(`
    const createLogger = () => ({ debug() {} });
    const catalogProductIsVerifiedReady = () => true;
    const catalogVerificationState = () => ({ state: "verified_ready", readyToScore: true });
    let catalogHydrationCallCount = 0;
    const supabase = {
      from() {
        let cacheKey = "";
        return {
          select() { return this; },
          eq(_column, value) { cacheKey = value; return this; },
          abortSignal() { return this; },
          async maybeSingle() {
            catalogHydrationCallCount += 1;
            return {
              data: {
                cache_key: cacheKey,
                product_name: \`Fixture \${cacheKey}\`,
                brand: "Fixture Brand",
                pet_type: "dog",
                ingredient_count: 5,
                ingredients: ["chicken", "rice", "oats", "fat", "vitamins"],
              },
              error: null,
            };
          },
        };
      },
    };
    ${labelResolutionSource}
    ${source}
    return {
      collapseRepeatedIdentityText,
      catalogIdentitySearchQuery,
      catalogIdentitySearchQueries,
      correctCatalogSearchQuery,
      formulaEvidencePriority,
      formulaEvidenceSearchBoost,
      filterVerifiedLabelCatalogResults,
      filterLabelCandidatesForIdentification,
      collapseCatalogSearchSourceVersions,
      collapseFrontLabelSourceVersions,
      pickExactBarcodeVersion,
      pickVerifiedProductForIdentification,
      productRequiresExactPackageVersionForLabel,
      filterVerifiedCatalogMatchesForLookup,
      stripPackageSizeTokens,
      labelSearchQueries,
      relaxedCatalogSearchQueries,
      sortCatalogSearchProducts,
      mergeProducts,
      nonCompleteFoodReason,
      getCatalogProduct,
      catalogHydrationCalls: () => catalogHydrationCallCount,
    };
  `)();
}

function loadLabelResolutionModule() {
  const source = fs.readFileSync(labelResolutionPath, "utf8")
    .replace(/\bexport const\b/g, "const")
    .replace(/\bexport function\b/g, "function");
  return new Function(`
    ${source}
    return {
      LABEL_RESOLUTION_DECISIONS,
      compareLabelIdentities,
      evaluateNonCompleteFoodEvidence,
      productFormulaKey,
      reconcileLabelOutcomes
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
    .replace(/\bexport const\b/g, "const")
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
  const labelResolutionSource = fs.readFileSync(labelResolutionPath, "utf8");
  const labelResolutionUrl = `data:text/javascript;base64,${Buffer.from(labelResolutionSource).toString("base64")}`;
  const source = fs.readFileSync(labelOcrMatchingPath, "utf8")
    .replace('"./labelResolution"', `"${labelResolutionUrl}"`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

async function loadCameraCropModule() {
  const source = fs.readFileSync(cameraCropPath, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

async function loadReviewPromptPolicyModule() {
  const source = fs.readFileSync(reviewPromptPolicyPath, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function checkCatalogHydrationCache(catalogApi) {
  const first = await catalogApi.getCatalogProduct("fixture:cache");
  const second = await catalogApi.getCatalogProduct("fixture:cache");
  assert(
    first?.cacheKey === "fixture:cache"
      && second?.cacheKey === "fixture:cache"
      && catalogApi.catalogHydrationCalls() === 1,
    "repeated catalog hydration must reuse the bounded in-memory cache"
  );

  const aborted = new AbortController();
  aborted.abort();
  const callsBeforeAbort = catalogApi.catalogHydrationCalls();
  assert(
    await catalogApi.getCatalogProduct("fixture:aborted", { signal: aborted.signal }) === null
      && catalogApi.catalogHydrationCalls() === callsBeforeAbort,
    "an aborted hydration must not read from or write to the catalog cache"
  );

  for (let index = 0; index < 25; index += 1) {
    await catalogApi.getCatalogProduct(`fixture:lru:${index}`);
  }
  const callsBeforeEvictedRead = catalogApi.catalogHydrationCalls();
  await catalogApi.getCatalogProduct("fixture:cache");
  assert(
    catalogApi.catalogHydrationCalls() === callsBeforeEvictedRead + 1,
    "catalog hydration cache must evict its least-recently-used entry at the configured bound"
  );
}

async function checkHighlightedCameraFrameCrop() {
  const { projectScanFrameToPhoto } = await loadCameraCropModule();

  const sameAspectCrop = projectScanFrameToPhoto({
    photoWidth: 1206,
    photoHeight: 2622,
    previewWidth: 1206,
    previewHeight: 2622,
    frame: { x: 213, y: 735, width: 780, height: 780 },
  });
  assert(
    sameAspectCrop.originX === 213
      && sameAspectCrop.originY === 735
      && sameAspectCrop.width === 780
      && sameAspectCrop.height === 780,
    "camera crop must map the highlighted frame exactly when photo and preview aspect ratios match"
  );
  assert(
    sameAspectCrop.originY > 500,
    "camera crop must exclude browser tabs and surrounding text above the highlighted package"
  );

  const sensorCrop = projectScanFrameToPhoto({
    photoWidth: 3024,
    photoHeight: 4032,
    previewWidth: 390,
    previewHeight: 844,
    frame: { x: 65, y: 236, width: 260, height: 260 },
    inset: 5,
  });
  assert(
    sensorCrop.originX > 0
      && sensorCrop.originY > 0
      && sensorCrop.originX + sensorCrop.width <= 3024
      && sensorCrop.originY + sensorCrop.height <= 4032,
    "camera crop must stay inside a 4:3 sensor photo shown in a tall aspect-fill preview"
  );
  assert(
    Math.abs(sensorCrop.width - sensorCrop.height) <= 1,
    "square highlighted frame must remain square in photo pixels"
  );
}

async function checkReviewPromptCadence() {
  const policy = await loadReviewPromptPolicyModule();
  const day = 24 * 60 * 60 * 1000;

  assert(
    policy.isEligibleReviewSuccess({ score: 70, scanMode: "photo" })
      && !policy.isEligibleReviewSuccess({ score: 95, scanMode: "human_food" }),
    "only successful pet-food results may advance the app-review cadence"
  );
  assert(
    policy.reviewPromptDecision({ successCount: 1, remainingScans: 2 }).reason
      === "not_enough_successes",
    "the first result must not be interrupted by a review request"
  );
  assert(
    policy.reviewPromptDecision({ successCount: 2, remainingScans: 1 }).show === true,
    "the second successful result must be eligible even when one free scan remains"
  );
  assert(
    policy.reviewPromptDecision({ successCount: 2, remainingScans: null }).show === true,
    "an unavailable scan balance must not be misread as an exhausted free plan"
  );
  assert(
    policy.reviewPromptDecision({
      successCount: 6,
      currentVersion: "1.2.5",
      lastPromptVersion: "1.2.5",
    }).reason === "version_already_requested",
    "the same app version must never request another system review prompt"
  );
  assert(
    policy.reviewPromptDecision({
      successCount: 6,
      currentVersion: "1.2.6",
      lastPromptVersion: "1.2.5",
    }).show === true,
    "a later app version may request a review after the engagement gates pass"
  );
  assert(
    policy.reviewPromptDecision({ successCount: 2, remainingScans: 0 }).reason
      === "free_limit_exhausted",
    "the review request must not stack on the exhausted-free-plan upgrade moment"
  );
  assert(
    policy.reviewPromptDecision({
      successCount: 6,
      promptCount: 1,
      lastPromptSuccessCount: 2,
      lastPromptAt: 1,
      now: 20 * day,
      isPro: true,
    }).reason === "cooldown",
    "a repeat request must respect the 21-day first cooldown"
  );
  assert(
    policy.reviewPromptDecision({
      successCount: 5,
      promptCount: 1,
      lastPromptSuccessCount: 2,
      lastPromptAt: 1,
      now: 22 * day,
      isPro: true,
    }).reason === "not_enough_new_successes",
    "a repeat request must require four additional successful results"
  );
  assert(
    policy.reviewPromptDecision({
      successCount: 6,
      promptCount: 1,
      lastPromptSuccessCount: 2,
      lastPromptAt: 1,
      now: 22 * day,
      isPro: true,
    }).show === true,
    "a satisfied active user must become eligible again after the success and time gates"
  );
  assert(
    policy.reviewPromptDecision({
      successCount: 10,
      promptCount: 2,
      lastPromptSuccessCount: 6,
      lastPromptAt: 1,
      now: 59 * day,
      isPro: true,
    }).reason === "cooldown"
      && policy.reviewPromptDecision({
        successCount: 10,
        promptCount: 2,
        lastPromptSuccessCount: 6,
        lastPromptAt: 1,
        now: 61 * day,
        isPro: true,
      }).show === true,
    "later requests must back off to the 60-day cooldown"
  );
  assert(
    policy.reviewPromptDecision({
      successCount: 100,
      promptCount: 5,
      lastPromptSuccessCount: 90,
      lastPromptAt: 0,
      reviewCompleted: true,
      isPro: true,
    }).reason === "review_already_completed",
    "the user-reported already-reviewed state must permanently suppress reminders"
  );
}

function checkEricRegressionFixtures() {
  const fixtures = JSON.parse(fs.readFileSync(liveLabelFixturePath, "utf8"));
  const ids = new Set(fixtures.map((fixture) => fixture.id));
  for (const requiredId of [
    "eric-beneful-originals-beef-dog",
    "eric-moist-meaty-burger-cheddar-dog",
    "eric-open-farm-rawmix-wild-ocean-dog",
    "royal-canin-indoor-7-cat",
    "royal-canin-mature-consult-large-dog",
    "eric-royal-canin-appetite-control-cat",
    "eric-royal-canin-digestive-care-cat",
    "eric-royal-canin-hair-skin-care-cat",
    "eric-royal-canin-hairball-care-cat",
    "eric-royal-canin-urinary-care-cat",
    "hills-science-diet-kitten-turkey",
    "hills-science-diet-puppy-lamb",
    "live-failure-hills-adult-small-bites-lamb-rice",
    "live-failure-nutro-small-breed-senior-chicken-rice",
    "live-failure-iams-minichunks-chicken-whole-grain",
    "live-failure-nutrish-small-breed-chicken-veggies",
    "live-failure-hills-puppy-small-mini-chicken-rice",
    "live-failure-hills-adult-small-mini-chicken-rice",
  ]) {
    assert(ids.has(requiredId), `missing permanent Eric regression fixture: ${requiredId}`);
  }

  const moistMeaty = fixtures.find(
    (fixture) => fixture.id === "eric-moist-meaty-burger-cheddar-dog"
  );
  assert(
    moistMeaty?.expected_resolution === "safe_abstain"
      && moistMeaty?.package_size === "72 oz (12 pouches)"
      && /03-moist-meaty-wrong-results\.png$/.test(moistMeaty?.captured_fixture_path || "")
      && Array.isArray(moistMeaty?.visually_conflicting_cache_keys)
      && moistMeaty.visually_conflicting_cache_keys.length >= 2
      && /barcode or ingredient panel/i.test(moistMeaty?.abstention_reason || ""),
    "Eric Moist & Meaty fixture must preserve the photographed package and front-only abstention boundary"
  );
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
    queries.some((query) => /open farm.*goodgut.*beef/i.test(query)),
    "on-device OCR must preserve recipe terms for variant retrieval"
  );

  const photographedFailureQueries = [
    {
      name: "Nutrish Small Breed",
      ocr: "nelps animals in need rachaelray nutrish small breed chicken dog",
      required: [/nutrish/i, /chicken/i, /small/i],
    },
    {
      name: "Hill's Science Diet Puppy Small & Mini",
      ocr: "science diet puppy small",
      required: [/science diet/i, /puppy/i, /small/i],
    },
    {
      name: "IAMS Proactive Health Minichunks",
      ocr: "iams proactive health minichunks cacien whole gand recpl adult dog",
      required: [/iams/i, /minichunks/i, /chicken/i],
    },
    {
      name: "Hill's Science Diet Adult Small & Mini",
      ocr: "science diet small",
      required: [/science diet/i, /small/i],
    },
  ];
  for (const photographedFailure of photographedFailureQueries) {
    const generated = api.labelOcrSearchQueries(photographedFailure.ocr);
    assert(
      generated.length > 0
        && photographedFailure.required.every((pattern) => (
          generated.some((query) => pattern.test(query))
        )),
      `${photographedFailure.name} physical-scan OCR must produce a usable identity query`
    );
  }
  assert(
    api.normalizeLabelOcrText(
      "iams proactive health minichunks cacien whole gand recpl adult dog"
    ).includes("minichunks chicken whole grain recipe"),
    "physical IAMS OCR substitutions must normalize before catalog lookup"
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

  const hillsSmallBitesMatches = api.filterProductsForOcr(
    [
      { brand: "Hill's Science Diet", productName: "Adult Small & Mini Lamb Meal & Brown Rice Recipe Dry Dog Food", petType: "dog", foodForm: "dry" },
      { brand: "Hill's Science Diet", productName: "Adult Small Bites Lamb Meal & Brown Rice Recipe Dry Dog Food", petType: "dog", foodForm: "dry", packageSize: "33 lb" },
    ],
    "Hill's Science Diet Small Bites Adult Lamb Meal & Brown Rice Recipe 33 lb Dog Food"
  );
  assert(
    hillsSmallBitesMatches.length === 1 && /small bites/i.test(hillsSmallBitesMatches[0].productName),
    "on-device OCR must keep Hill's Small Bites separate from the Small & Mini sibling"
  );

  const hillsSevenOcr = [
    "Hill's Science Diet",
    "ADULT 7+",
    "SMALL & MINI",
    "CHICKEN & BROWN RICE RECIPE",
    "15.5 lb bag",
    "DOG FOOD",
  ].join("\n");
  const hillsSevenMatches = api.filterProductsForOcr(
    [
      { gtin: "052742909905", brand: "Hill's Science Diet", productName: "Adult 7+ Small & Mini Chicken & Brown Rice Recipe Dog Food", productLine: "Adult 7+ Small & Mini", flavor: "Chicken & Brown Rice Recipe", lifeStage: "senior", petType: "dog", foodForm: "dry", packageSize: "15.5 lb", rank: 8 },
      { gtin: "052742909806", brand: "Hill's Science Diet", productName: "Adult 7+ Small & Mini Chicken & Brown Rice Recipe Dog Food", productLine: "Adult 7+ Small & Mini", flavor: "Chicken & Brown Rice Recipe", lifeStage: "senior", petType: "dog", foodForm: "dry", packageSize: "4.5 lb", rank: 10 },
      { gtin: "052742909608", brand: "Hill's Science Diet", productName: "Adult 1-6 Small & Mini Chicken & Brown Rice Recipe Dog Food", productLine: "Adult 1-6 Small & Mini", flavor: "Chicken & Brown Rice Recipe", lifeStage: "adult", petType: "dog", foodForm: "dry", packageSize: "15.5 lb", rank: 12 },
      { gtin: "052742253305", brand: "Hill's Science Diet", productName: "Adult 11+ Small & Mini Chicken, Brown Rice & Barley Recipe Dog Food", productLine: "Adult 11+ Small & Mini", flavor: "Chicken, Brown Rice & Barley Recipe", lifeStage: "senior", petType: "dog", foodForm: "dry", packageSize: "4.5 lb", rank: 13 },
      { gtin: "052742815909", brand: "Hill's Science Diet", productName: "Adult 7+ Small Bites Chicken Meal, Barley & Rice Recipe Dog Food", productLine: "Adult 7+ Small Bites", flavor: "Chicken Meal, Barley & Rice Recipe", lifeStage: "senior", petType: "dog", foodForm: "dry", packageSize: "5 lb", rank: 12 },
      { gtin: "fixture-lamb", brand: "Hill's Science Diet", productName: "Adult 7+ Small & Mini Lamb Meal & Brown Rice Recipe Dog Food", productLine: "Adult 7+ Small & Mini", flavor: "Lamb Meal & Brown Rice Recipe", lifeStage: "senior", petType: "dog", foodForm: "dry", packageSize: "15.5 lb", rank: 12 },
    ],
    hillsSevenOcr
  );
  const hillsSevenRanked = api.rankProductsForOcr(hillsSevenMatches, hillsSevenOcr);
  assert(
    hillsSevenMatches.length === 2
      && hillsSevenRanked[0]?.gtin === "052742909905"
      && hillsSevenRanked[1]?.gtin === "052742909806",
    `on-device OCR must gate Adult 7+, Small & Mini, and Chicken identity, then prefer the photographed 15.5 lb package; matches=${JSON.stringify(hillsSevenMatches.map((product) => product.gtin))}; ranked=${JSON.stringify(hillsSevenRanked.map((product) => [product.gtin, product.ocrMatchScore]))}`
  );
  assert(
    api.labelOcrSearchQueries(hillsSevenOcr).every((query) => (
      !/\b15\.5\b|\blb\b|\bbag\b/i.test(query)
    )),
    "on-device OCR package-size tokens must not enter catalog retrieval queries"
  );

  const nutroSmallBreedMatches = api.filterProductsForOcr(
    [
      { brand: "Nutro", productName: "Natural Choice Senior Chicken & Brown Rice Recipe Dry Dog Food", petType: "dog", foodForm: "dry" },
      { brand: "Nutro", productName: "Natural Choice Small Breed Senior Chicken & Brown Rice Recipe Dry Dog Food", petType: "dog", foodForm: "dry", packageSize: "5 lb" },
    ],
    "Nutro Natural Choice Chicken & Brown Rice Recipe Senior 8+ Years Small Breed Dog Food 5 lb"
  );
  assert(
    nutroSmallBreedMatches.length === 1 && /small breed/i.test(nutroSmallBreedMatches[0].productName),
    "on-device OCR must keep Nutro Small Breed Senior separate from the regular Senior sibling"
  );

  const shelfLines = [
    { text: "PURINA", confidence: 0.99, bounds: { x: 0.39, y: 0.75, width: 0.17, height: 0.04 } },
    { text: "MOIST & MEATY", confidence: 0.99, bounds: { x: 0.30, y: 0.62, width: 0.35, height: 0.09 } },
    { text: "BURGER WITH CHEDDAR", confidence: 0.98, bounds: { x: 0.31, y: 0.48, width: 0.32, height: 0.05 } },
    { text: "SOFT & MEATY TEXTURE", confidence: 0.97, bounds: { x: 0.31, y: 0.37, width: 0.23, height: 0.04 } },
    { text: "PUPPY CHOW", confidence: 0.98, bounds: { x: 0.02, y: 0.35, width: 0.12, height: 0.05 } },
  ];
  const shelfText = shelfLines.map((line) => line.text).join("\n");
  const centeredShelfText = api.primaryPackageOcrText(shelfText, shelfLines);
  assert(
    /moist & meaty/i.test(centeredShelfText) && !/puppy/i.test(centeredShelfText),
    "centered package OCR must exclude a neighboring shelf package"
  );
  const moistShelfMatches = api.filterProductsForOcr(
    [
      { brand: "Moist & Meaty", productName: "Purina Moist & Meaty Burger With Cheddar Cheese Soft Dog Food", petType: "dog", foodForm: "semi-moist" },
      { brand: "Purina ONE", productName: "Purina ONE +Plus Healthy Puppy Dry Dog Food", petType: "dog", foodForm: "dry" },
    ],
    centeredShelfText
  );
  assert(
    moistShelfMatches.length === 1 && moistShelfMatches[0].brand === "Moist & Meaty",
    "neighboring puppy text must not reject the centered semi-moist product"
  );

  const openFarm = {
    brand: "Open Farm",
    productLine: "Harvest",
    productName: "Harvest Chicken & Ancient Grains Dog Kibble",
    flavor: "Chicken & Ancient Grains",
    petType: "dog",
    foodForm: "dry",
    packageSize: "4 lb",
    rank: 9,
  };
  const retailerViewerLinesIos = [
    { text: "OPEN FARM", confidence: 0.99, bounds: { x: 0.38, y: 0.90, width: 0.20, height: 0.05 } },
    { text: "HARVEST CHICKEN", confidence: 0.99, bounds: { x: 0.25, y: 0.82, width: 0.48, height: 0.06 } },
    { text: "& ANCIENT GRAINS RECIPE", confidence: 0.98, bounds: { x: 0.24, y: 0.75, width: 0.50, height: 0.05 } },
    { text: "Scannez ici pour en savoir plus", confidence: 0.92, bounds: { x: 0.28, y: 0.33, width: 0.42, height: 0.03 } },
    { text: "NET WEIGHT 4 LB", confidence: 0.98, bounds: { x: 0.42, y: 0.30, width: 0.20, height: 0.04 } },
    { text: "FOOD FOR DOGS", confidence: 0.97, bounds: { x: 0.38, y: 0.28, width: 0.22, height: 0.04 } },
    { text: "Click to see full view", confidence: 0.99, bounds: { x: 0.34, y: 0.14, width: 0.32, height: 0.04 } },
    { text: "FISH RECIPE", confidence: 0.91, bounds: { x: 0.35, y: 0.08, width: 0.20, height: 0.03 } },
    { text: "SMALL BREED CAT FOOD", confidence: 0.88, bounds: { x: 0.42, y: 0.03, width: 0.26, height: 0.03 } },
  ];
  const retailerViewerTextIos = retailerViewerLinesIos.map((line) => line.text).join("\n");
  const openFarmPackageTextIos = api.primaryPackageOcrText(
    retailerViewerTextIos,
    retailerViewerLinesIos
  );
  assert(
    /harvest chicken/i.test(openFarmPackageTextIos)
      && /ancient grains/i.test(openFarmPackageTextIos)
      && !/fish|cat food/i.test(openFarmPackageTextIos),
    "iOS OCR must exclude retailer flavor thumbnails below the main Open Farm package"
  );
  const openFarmMatchesIos = api.rankProductsForOcr(
    api.filterProductsForOcr([openFarm], openFarmPackageTextIos),
    openFarmPackageTextIos
  );
  assert(
    api.pickVerifiedProductForOcr(openFarmMatchesIos, openFarmPackageTextIos)?.productName
      === openFarm.productName,
    "the exact Open Farm Harvest Chicken package must remain a unique OCR confirmation"
  );

  const retailerViewerLinesAndroid = retailerViewerLinesIos.map((line) => ({
    ...line,
    bounds: {
      ...line.bounds,
      y: 1 - line.bounds.y - line.bounds.height,
    },
  }));
  const openFarmPackageTextAndroid = api.primaryPackageOcrText(
    retailerViewerTextIos,
    retailerViewerLinesAndroid
  );
  assert(
    /harvest chicken/i.test(openFarmPackageTextAndroid)
      && !/fish|cat food/i.test(openFarmPackageTextAndroid),
    "Android OCR must exclude retailer flavor thumbnails below the main Open Farm package"
  );
  const moistVersionConflict = {
    ...moistShelfMatches[0],
    packageSize: "72 oz (12 pouches)",
    formulaVersionProvenance: {
      manufacturer_version_conflict: true,
      gtin_resolution_policy: "abstain_on_version_conflict",
    },
  };
  const rankedMoistConflict = api.rankProductsForOcr(
    [moistVersionConflict],
    `${centeredShelfText}\n72 OZ 12 POUCHES`
  );
  assert(
    api.pickVerifiedProductForOcr(
      rankedMoistConflict,
      `${centeredShelfText}\n72 OZ 12 POUCHES`
    ) === null,
    "front-label OCR must not auto-open an ingredient-version-conflicted package"
  );
  const rankedMoistSafe = api.rankProductsForOcr(
    [{ ...moistVersionConflict, formulaVersionProvenance: null }],
    `${centeredShelfText}\n72 OZ 12 POUCHES`
  );
  assert(
    api.pickVerifiedProductForOcr(
      rankedMoistSafe,
      `${centeredShelfText}\n72 OZ 12 POUCHES`
    )?.brand === "Moist & Meaty",
    "an otherwise unique unconflicted exact package may still auto-open"
  );

  const rawMixMatches = api.filterProductsForOcr(
    [
      { brand: "Open Farm", productName: "RawMix Wild Ocean Grain-Free Dog Kibble", productLine: "RawMix Wild Ocean Grain-Free Kibble", flavor: "Salmon, Whitefish & Rockfish", petType: "dog", foodForm: "dry" },
      { brand: "Open Farm", productName: "RawMix Open Prairie Grain-Free Dog Kibble", productLine: "RawMix Open Prairie Grain-Free Kibble", flavor: "Chicken & Turkey", petType: "dog", foodForm: "dry" },
    ],
    "OPEN FARM RAWMIX FREEZE-DRIED RAW COATED BONE BROTH COATED RAW CHUNKS WILD OCEAN RECIPE GRAIN & LEGUME FREE SALMON WHITEFISH ROCKFISH FOOD FOR DOGS"
  );
  assert(
    rawMixMatches.length === 1 && /wild ocean/i.test(rawMixMatches[0].productName),
    "freeze-dried coating claims must not misclassify RawMix kibble or admit a sibling recipe"
  );

  const wholeheartedQueries = api.labelOcrSearchQueries("hearted\nplus\nBeef & Bravor Rico Recipo");
  assert(
    wholeheartedQueries.some((query) => /wholehearted/i.test(query)) &&
      wholeheartedQueries.some((query) => /rice/i.test(query)),
    "on-device OCR must normalize common package-logo and recipe OCR errors"
  );

  const nutroQueries = api.labelOcrSearchQueries(
    "NUTRO\nNATURAL CHOICE\nSUPPORTS SENSITIVE SKIN & STOMACH GUARANTEED\nLAMB & BROWN RICE RECIPE\nADULT 1+ YEARS\nSMALL BITES"
  );
  assert(
    nutroQueries.some((query) => /nutro natural choice.*lamb.*brown.*rice.*small/i.test(query)),
    "on-device OCR must build a protected Nutro Natural Choice variant query"
  );
  assert(
    nutroQueries.every((query) => !/sensitive|stomach|guaranteed/i.test(query)),
    "a Nutro benefit badge must not become an exact formula condition"
  );

  const iamsOcrText = [
    "IAMS",
    "PROACTIVE HEALTH",
    "MINICHUNKS",
    "CHICKEN & WHOLE GRAIN RECIPE",
    "FORMULATED TO SUPPORT WHOLE BODY HEALTH & VITALITY",
    "PROACTIVE 5",
    "DIGESTION • MUSCLES • IMMUNE SYSTEM • ENERGY • SKIN & COAT",
    "ADULT 1+",
    "3.3 LB",
  ].join("\n");
  const iamsCandidate = {
    brand: "IAMS",
    productLine: "Proactive Health",
    productName: "IAMS MINICHUNKS CHICKEN & WHOLE GRAINS",
    flavor: "Chicken",
    lifeStage: "adult",
    foodForm: "dry",
    petType: "dog",
    packageSize: "3.3 lb",
    rank: 9,
  };
  const iamsPackageText = api.primaryPackageOcrText(iamsOcrText);
  const iamsQueries = api.labelOcrSearchQueries(iamsOcrText);
  const iamsRanked = api.rankProductsForOcr(
    api.filterProductsForOcr([iamsCandidate], iamsPackageText),
    iamsPackageText
  );
  assert(
    iamsQueries.some(
      (query) => /iams/i.test(query) && /minichunks/i.test(query) && /chicken/i.test(query)
    ),
    "on-device OCR must build an exact IAMS MiniChunks recipe query"
  );
  assert(
    !/digestion|muscles|immune|skin|coat/i.test(iamsPackageText)
      && api.pickVerifiedProductForOcr(iamsRanked, iamsPackageText)?.productName
        === iamsCandidate.productName,
    "IAMS Proactive 5 benefit claims must not reject the exact MiniChunks formula"
  );
  assert(
    api.labelOcrSearchQueries("TestFlight build 48\nAmazon").length === 0,
    "browser and TestFlight chrome must never become a product search query"
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

  const nutroCurrent = {
    sourceKind: "catalog",
    cacheKey: "nutro:079105116213",
    gtin: "079105116213",
    brand: "Nutro",
    productLine: "Natural Choice",
    productName: "Adult Small Bites Lamb & Brown Rice Recipe",
    flavor: "Small Bites Lamb & Brown Rice Recipe",
    lifeStage: "adult",
    foodForm: "dry",
    petType: "dog",
    packageSize: "5 lb",
    availablePackageSizes: ["5 lb", "12 lb", "30 lb"],
    ingredientsText: "Lamb, chicken meal, whole grain barley, brewers rice",
    ingredientCount: 47,
    ingredientVerificationStatus: "manufacturer",
    imageVerificationStatus: "manufacturer",
    imageUrl: "https://www.nutro.com/natural-choice-small-bites-lamb.jpg",
    sourceUrl: "https://www.nutro.com/shop-dogs/adult-small-bites-lamb-brown-rice",
    sourceQuality: "manufacturer",
    formulaEvidenceTier: "manufacturer_current_exact",
    rank: 8,
  };
  const nutroRetailerVersion = {
    ...nutroCurrent,
    cacheKey: "walmart:nutro-small-bites-lamb-5lb",
    gtin: "",
    productName: "Nutro Natural Choice Adult Small Bites Dog Food Recipe Lamb & Brown Rice",
    packageSize: "5 lb",
    availablePackageSizes: [],
    foodForm: "",
    ingredientsText: "Lamb, chicken meal, split peas, brewers rice",
    ingredientCount: 43,
    ingredientVerificationStatus: "retailer_verified",
    imageVerificationStatus: "retailer_verified",
    sourceUrl: "https://www.walmart.com/ip/nutro-small-bites-lamb/123",
    sourceQuality: "retailer_verified",
    formulaEvidenceTier: "retailer_web_version",
    rank: 10,
  };
  const nutroFrontLabelResults = api.collapseFrontLabelSourceVersions([
    nutroRetailerVersion,
    nutroCurrent,
  ]);
  assert(
    nutroFrontLabelResults.length === 1
      && nutroFrontLabelResults[0].cacheKey === nutroCurrent.cacheKey
      && nutroFrontLabelResults[0].ingredientCount === 47,
    "a generic Nutro front label must resolve to one manufacturer-current formula, not package-source duplicates"
  );

  const nutroRegularBites = {
    ...nutroCurrent,
    cacheKey: "nutro:regular-lamb",
    productName: "Adult Lamb & Brown Rice Recipe Dry Dog Food",
    flavor: "Lamb & Brown Rice Recipe",
    packageSize: "30 lb",
  };
  assert(
    api.collapseFrontLabelSourceVersions([nutroCurrent, nutroRegularBites]).length === 2,
    "Small Bites and regular-kibble Nutro formulas must remain separate"
  );

  const iamsCurrent = {
    ...nutroCurrent,
    cacheKey: "iams:019014610860",
    brand: "IAMS",
    productLine: "Proactive Health",
    productName: "IAMS MINICHUNKS CHICKEN & WHOLE GRAINS",
    flavor: "Chicken",
    packageSize: "3.3, 15, 30, 38.5, 50",
    ingredientsText: "Chicken, whole grain corn, sorghum, chicken by-product meal",
    sourceQuality: "manufacturer",
    formulaEvidenceTier: "manufacturer_current_exact",
  };
  const iamsRetailerVersion = {
    ...iamsCurrent,
    cacheKey: "target:iams-minichunks-38-5",
    gtin: "019014700769",
    productLine: "IAMS Proactive Health Minichunks Chicken and Whole Grain Adult Dry Dog Food",
    productName: "IAMS Proactive Health Minichunks Chicken and Whole Grain Adult Dry Dog Food",
    flavor: "Chicken & Whole Grain",
    packageSize: "38.5 lb",
    ingredientsText: "Chicken, ground whole grain corn, sorghum, chicken by-product meal",
    sourceQuality: "retailer_verified",
    formulaEvidenceTier: "retailer_web_version",
  };
  const iamsSearchResults = api.collapseFrontLabelSourceVersions([
    iamsRetailerVersion,
    iamsCurrent,
  ]);
  assert(
    iamsSearchResults.length === 1
      && iamsSearchResults[0].cacheKey === iamsCurrent.cacheKey
      && iamsSearchResults[0].availablePackageSizes.length >= 5,
    "IAMS MiniChunks source versions must display as one current shelf formula with package sizes retained"
  );
  assert(
    api.collapseCatalogSearchSourceVersions([
      iamsRetailerVersion,
      iamsCurrent,
    ]).length === 1,
    "typed search must display one IAMS MiniChunks formula instead of retailer-source duplicates"
  );

  const barcodeBase = {
    ...sharedFormula,
    sourceKind: "catalog",
    rank: 20,
    cacheKey: "wellness:current",
    gtin: "076344210000",
    ingredientCount: 8,
    imageUrl: "https://example.com/current.jpg",
    ingredientVerificationStatus: "manufacturer",
    imageVerificationStatus: "manufacturer",
  };
  const currentPreferred = api.pickExactBarcodeVersion([
    {
      ...barcodeBase,
      formulaEvidenceTier: "retailer_web_version",
      cacheKey: "wellness:retailer",
    },
    {
      ...barcodeBase,
      formulaEvidenceTier: "manufacturer_current_exact",
      cacheKey: "wellness:current",
    },
  ]);
  assert(
    currentPreferred?.cacheKey === "wellness:current",
    "equivalent search/package records must prefer the manufacturer-current formula"
  );
  const genericSearchPreferred = api.sortCatalogSearchProducts([
    {
      ...barcodeBase,
      rank: 10,
      cacheKey: "wellness:retailer",
      formulaEvidenceTier: "retailer_web_version",
    },
    {
      ...barcodeBase,
      rank: 8,
      cacheKey: "wellness:current",
      formulaEvidenceTier: "manufacturer_current_exact",
    },
  ]);
  assert(
    genericSearchPreferred[0]?.cacheKey === "wellness:current",
    "generic search must prefer a close manufacturer-current match over a source-versioned package"
  );

  const reusedBarcode = api.pickExactBarcodeVersion([
    {
      ...barcodeBase,
      formulaEvidenceTier: "manufacturer_current_exact",
      ingredientsText: "Chicken, Oatmeal, Barley, Peas",
    },
    {
      ...barcodeBase,
      cacheKey: "wellness:older-package",
      formulaEvidenceTier: "retailer_web_version",
      ingredientsText: "Chicken Meal, Oatmeal, Barley, Peas",
    },
  ]);
  assert(
    reusedBarcode === null,
    "a reused barcode with incompatible ingredient versions must abstain"
  );
}

function checkHillsAdultSevenLabelResolution(catalogApi, labelResolutionApi) {
  const identification = {
    found: true,
    confidence: 0.96,
    brand: "Hill's Science Diet",
    productName: "Adult 7+ Small & Mini Chicken & Brown Rice Recipe Dog Food 15.5 lb bag",
    productLine: "Adult 7+ Small & Mini",
    flavor: "Chicken & Brown Rice Recipe",
    lifeStage: "Adult 7+",
    foodForm: "dry",
    packageSize: "15.5 lb",
    petType: "dog",
  };
  const formulaBase = {
    sourceKind: "catalog",
    brand: "Hill's Science Diet",
    productName: "Adult 7+ Small & Mini Chicken & Brown Rice Recipe Dog Food",
    productLine: "Adult 7+ Small & Mini",
    flavor: "Chicken & Brown Rice Recipe",
    lifeStage: "senior",
    foodForm: "dry",
    petType: "dog",
    ingredientCount: 8,
    ingredientsText: "Chicken Meal, Cracked Pearled Barley, Brown Rice, Brewers Rice",
    ingredientVerificationStatus: "manufacturer",
    imageVerificationStatus: "manufacturer",
    imageUrl: "https://example.com/hills-small-mini-7.jpg",
    sourceUrl: "https://www.hillspet.com/dog-food/sd-canine-adult-7-plus-small-mini-dry",
    formulaEvidenceTier: "manufacturer_current_exact",
    sourceQuality: "manufacturer",
    rank: 0.48,
  };
  const exactRetailPackage = {
    ...formulaBase,
    gtin: "052742909905",
    cacheKey: "petsmart-retail-catalog:052742909905",
    packageSize: "15.5 lb",
    ingredientVerificationStatus: "retailer_verified",
    imageVerificationStatus: "retailer_verified",
    sourceQuality: "retailer_verified",
    formulaEvidenceTier: "retailer_web_version",
    rank: 1.2,
  };
  const smallerManufacturerPackage = {
    ...formulaBase,
    gtin: "052742909806",
    cacheKey: "hills:052742909806",
    packageSize: "4.5 lb",
  };
  const adultOneToSix = {
    ...formulaBase,
    gtin: "052742909608",
    cacheKey: "hills:052742909608",
    productName: "Adult 1-6 Small & Mini Chicken & Brown Rice Recipe Dog Food",
    productLine: "Adult 1-6 Small & Mini",
    lifeStage: "adult",
    packageSize: "15.5 lb",
  };
  const adultElevenPlus = {
    ...formulaBase,
    gtin: "052742253305",
    cacheKey: "hills:052742253305",
    productName: "Adult 11+ Small & Mini Chicken, Brown Rice & Barley Recipe Dog Food",
    productLine: "Adult 11+ Small & Mini",
    lifeStage: "senior",
    packageSize: "4.5 lb",
    rank: 0.57,
  };
  const smallBitesSibling = {
    ...formulaBase,
    gtin: "052742815909",
    cacheKey: "hills:052742815909",
    productName: "Adult 7+ Small Bites Chicken Meal, Barley & Rice Recipe Dog Food",
    productLine: "Adult 7+ Small Bites",
    flavor: "Chicken Meal, Barley & Rice Recipe",
    packageSize: "5 lb",
  };
  const lambSibling = {
    ...formulaBase,
    gtin: "052742909905",
    cacheKey: "opff-sibling:052742909905",
    productName: "Adult 7+ Small & Mini Lamb Meal & Brown Rice Recipe Dog Food",
    flavor: "Lamb Meal & Brown Rice Recipe",
    packageSize: "15.5 lb",
  };

  const liveRankCandidates = catalogApi.filterVerifiedLabelCatalogResults(
    [smallBitesSibling, adultOneToSix, adultElevenPlus, lambSibling, smallerManufacturerPackage, exactRetailPackage]
  );
  assert(
    liveRankCandidates.includes(exactRetailPackage)
      && liveRankCandidates.includes(smallerManufacturerPackage),
    "verified label candidates must survive low identity-RPC ranks before deterministic OCR gates"
  );
  const candidates = catalogApi.filterLabelCandidatesForIdentification(
    identification,
    liveRankCandidates
  );
  assert(
    candidates[0]?.gtin === "052742909905"
      && candidates[0]?.cacheKey === exactRetailPackage.cacheKey,
    "Hill's Adult 7+ Small & Mini 15.5 lb must rank its exact verified package first"
  );
  assert(
    candidates.length === 2
      && candidates.every((candidate) => /small & mini/i.test(candidate.productName))
      && candidates.every((candidate) => !/adult 11\+/i.test(candidate.productName))
      && candidates.every((candidate) => candidate.lifeStage === "senior"),
    "Hill's Adult 7+ labels must exclude Adult 1-6, Adult 11+, Small Bites, and sibling-recipe candidates"
  );

  const collapsed = catalogApi.collapseFrontLabelSourceVersions(candidates);
  assert(
    collapsed.length === 1
      && collapsed[0].gtin === "052742909905"
      && collapsed[0].availablePackageSizes.includes("4.5 lb")
      && collapsed[0].availablePackageSizes.includes("15.5 lb"),
    "an exact photographed size must remain primary while proven same-formula sizes stay available"
  );

  const searchQueries = catalogApi.labelSearchQueries(identification);
  assert(
    searchQueries.length > 0
      && searchQueries.every((query) => !/\b15\.5\s*(?:lb|lbs)?\b|\blb\b|\bbag\b/i.test(query)),
    "structured package size must not enter any front-label catalog retrieval query"
  );

  const lifeStageConflict = labelResolutionApi.compareLabelIdentities(
    identification,
    adultOneToSix,
    { requireVisibleCandidateVariants: true }
  );
  assert(
    !lifeStageConflict.compatible && lifeStageConflict.reasonCodes.includes("life_stage_conflict"),
    "Adult 7+ must be a senior identity that conflicts with Adult 1-6"
  );
  const seniorAgeConflict = labelResolutionApi.compareLabelIdentities(
    identification,
    adultElevenPlus,
    { requireVisibleCandidateVariants: true }
  );
  assert(
    !seniorAgeConflict.compatible && seniorAgeConflict.reasonCodes.includes("life_stage_conflict"),
    "Adult 7+ must conflict with the distinct Adult 11+ senior formula"
  );
  const lineConflict = labelResolutionApi.compareLabelIdentities(
    identification,
    smallBitesSibling,
    { requireVisibleCandidateVariants: true }
  );
  assert(
    !lineConflict.compatible && lineConflict.reasonCodes.includes("product_line_conflict"),
    "Hill's Small & Mini must conflict with the Small Bites product line"
  );

  const reconciledLookupMatches = catalogApi.filterVerifiedCatalogMatchesForLookup(
    {
      gtin: "052742909905",
      brand: "Hill's Science Diet",
      productName: "Adult 7+ Small & Mini Chicken & Brown Rice Recipe Dog Food",
      productLine: "Adult 7+ Small & Mini",
      flavor: "Chicken & Brown Rice Recipe",
      lifeStage: "senior",
      foodForm: "dry",
      petType: "dog",
    },
    [lambSibling]
  );
  assert(
    reconciledLookupMatches.length === 0,
    "GTIN reconciliation must abstain instead of substituting a Lamb sibling for a Chicken formula"
  );
}

function checkPackageSizeDoesNotChangeLifeStage(labelResolutionApi) {
  const base = {
    brand: "IAMS",
    productLine: "Proactive Health",
    productName: "IAMS MiniChunks Chicken & Whole Grains",
    flavor: "Chicken",
    lifeStage: "adult",
    foodForm: "dry",
    petType: "dog",
  };
  assert(
    labelResolutionApi.productFormulaKey({ ...base, packageSize: "7 lb" })
      === labelResolutionApi.productFormulaKey({ ...base, packageSize: "38.5 lb" }),
    "package size numbers must never change adult, senior, puppy, or kitten identity"
  );
}

function checkRelaxedCatalogQueries(api) {
  const proPlanCorrection = api.correctCatalogSearchQuery(
    "Purina Pro Plen Adult Sensitive Skin and Stomach Salmon"
  );
  assert(
    /\bpro plan\b/.test(proPlanCorrection.query),
    "catalog search must correct the observed Pro Plan OCR typo"
  );

  const openFarmCorrection = api.correctCatalogSearchQuery(
    "Open Fram GoodGut Wild-Caught Salmon"
  );
  assert(
    /\bopen farm\b/.test(openFarmCorrection.query),
    "catalog search must correct the observed Open Farm OCR typo"
  );

  const hillsCorrection = api.correctCatalogSearchQuery(
    "Hills Science Diet Adult Dog Food"
  );
  assert(
    /\bhill s science diet\b/.test(hillsCorrection.query),
    "catalog search must recover Hill's Science Diet when the apostrophe is omitted"
  );

  const iamsCorrection = api.correctCatalogSearchQuery(
    "IAMS Minichnks Chiken Whole Grain"
  );
  assert(
    /\biams minichunks chicken whole grain\b/.test(iamsCorrection.query),
    "catalog search must recover common MiniChunks and chicken typing errors"
  );
  assert(
    api.catalogIdentitySearchQuery("IAMS MiniChunks Chicken Adult Dog")
      === "IAMS MiniChunks Chicken Adult",
    "typed search must apply dog/cat as a species scope without requiring it in the catalog title"
  );
  assert(
    api.catalogIdentitySearchQueries("IAMS MiniChunks Chicken Whole Grain Dog")[0]
      === "IAMS MiniChunks Chicken Whole"
      && api.catalogIdentitySearchQueries("IAMS MiniChunks Chicken Whole Grain Dog")
        .includes("IAMS MiniChunks Chicken Whole grains"),
    "typed search must retrieve singular and plural package-title variants in one bounded request"
  );

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
  assert(
    /await searchWoofCatalog\(searchQuery,\s*catalogLimit,\s*\{\s*signal\s*\}\)/.test(searchCatalogProductsSource),
    "typed catalog search must use hydrated verified-product rows so package sizes remain visible"
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

  const moistIdentification = {
    found: true,
    confidence: 0.96,
    brand: "Moist & Meaty",
    productName: "Burger with Cheddar Cheese Flavor Semi-Moist Dog Food",
    productLine: "Burger with Cheddar Cheese",
    foodForm: "semi-moist",
    petType: "dog",
  };
  const verifiedMoistCandidate = {
    sourceKind: "catalog",
    cacheKey: "petsmart-retail-catalog:038100330222",
    brand: "Moist & Meaty",
    productName: "Moist & Meaty Burger with Cheddar Cheese Flavor Semi-Moist Dog Food",
    productLine: "Burger with Cheddar Cheese",
    foodForm: "semi-moist",
    petType: "dog",
    ingredientCount: 41,
    ingredientsText: "Beef by-product, soy grits, high fructose corn syrup, wheat flour, water",
    ingredientVerificationStatus: "retailer_verified",
    imageUrl: "https://s7d2.scene7.com/is/image/PetSmart/5352499",
    imageVerificationStatus: "retailer_verified",
    sourceUrl: "https://www.petsmart.com/dog/food/canned-food/moist-and-meaty-burger-cheddar-cheese-adult-semi-moist-dog-food-72-oz-84315.html",
    formulaVersionProvenance: {
      manufacturer_version_conflict: true,
      gtin_resolution_policy: "abstain_on_version_conflict",
    },
  };
  assert(
    api.productRequiresExactPackageVersionForLabel(verifiedMoistCandidate),
    "source-version conflict provenance must require exact package evidence"
  );
  assert(
    api.pickVerifiedProductForIdentification(
      moistIdentification,
      [verifiedMoistCandidate]
    ) === null,
    "cloud label identification must not auto-open a version-conflicted front package"
  );
  assert(
    api.pickVerifiedProductForIdentification(
      moistIdentification,
      [{ ...verifiedMoistCandidate, formulaVersionProvenance: null }]
    )?.cacheKey === verifiedMoistCandidate.cacheKey,
    "an otherwise exact unconflicted cloud label candidate may still auto-open"
  );
}

function checkFoodFormBoundaryRegression(catalogApi, labelResolutionApi, ocrApi) {
  const candidate = (overrides = {}) => ({
    sourceKind: "catalog",
    cacheKey: "fixture:food-form",
    brand: "Example Nutrition",
    productName: "Example Nutrition Chicken and Rice Adult Dog Food",
    flavor: "Chicken and Rice",
    lifeStage: "adult",
    foodForm: "dry",
    packageSize: "8 lb",
    petType: "dog",
    rank: 10,
    ...overrides,
  });
  const matches = (identification, products) => (
    catalogApi.filterLabelCandidatesForIdentification(
      { found: true, confidence: 0.96, petType: "dog", ...identification },
      products
    )
  );

  const purinaDry = candidate({
    cacheKey: "census:6d34f8eedef1ed8299581434f850338d",
    gtin: "017800475686",
    brand: "Purina ONE",
    productName: "Purina ONE SmartBlend Natural Dry Dog Food with Chicken & Rice",
    flavor: "Chicken & Rice",
    foodForm: "dry",
    packageSize: "8 lb",
  });
  const purinaWet = candidate({
    cacheKey: "nestle-purina-one:017800125963",
    gtin: "017800125963",
    brand: "Purina ONE",
    productName: "Purina ONE Chicken & Brown Rice Entrée Classic Ground Wet Dog Food",
    flavor: "Chicken & Brown Rice",
    foodForm: "wet",
    packageSize: "13 oz",
  });
  const purinaDryLabel = {
    brand: "Purina ONE",
    productName: "Chicken & Rice Formula Complete Adult Dog Food Meaty Morsels",
    flavor: "Chicken & Rice",
    lifeStage: "adult",
    packageSize: "NET WT 8 LB (3.63 kg)",
  };
  const purinaMatches = matches(purinaDryLabel, [purinaWet, purinaDry]);
  assert(
    purinaMatches.length === 1 && purinaMatches[0]?.gtin === "017800475686",
    `Purina ONE Chicken & Rice 8 lb OCR must exclude every wet candidate and keep the verified dry formula; matches=${JSON.stringify(purinaMatches.map((product) => [product.gtin, product.productName]))}`
  );

  const reverseMatches = matches(
    {
      brand: "Purina ONE",
      productName: "Chicken & Brown Rice Entrée Classic Ground Adult Dog Food",
      flavor: "Chicken & Brown Rice",
      lifeStage: "adult",
      packageSize: "13 oz",
    },
    [purinaDry, purinaWet]
  );
  assert(
    reverseMatches.length === 1 && reverseMatches[0]?.gtin === "017800125963",
    "a 13 oz wet label must exclude the multi-pound dry bag"
  );

  const noFormWet = candidate({
    cacheKey: "fixture:wet-only",
    productName: "Example Nutrition Chicken and Rice Adult Dog Food",
    foodForm: "wet",
    packageSize: "",
  });
  assert(
    matches({
      brand: "Example Nutrition",
      productName: "Chicken and Rice Adult Dog Food",
      flavor: "Chicken and Rice",
      lifeStage: "adult",
    }, [noFormWet]).length === 0,
    "a label with no form or package evidence and only a wet candidate must abstain"
  );

  const inventedDry = candidate({
    cacheKey: "invented:dry",
    brand: "North Star Pet",
    productName: "North Star Pet Harvest Chicken and Rice Adult Dog Food",
    productLine: "Harvest",
    packageSize: "12 lb",
  });
  const inventedWet = candidate({
    cacheKey: "invented:wet",
    brand: "North Star Pet",
    productName: "North Star Pet Harvest Chicken and Rice Adult Dog Food",
    productLine: "Harvest",
    foodForm: "wet",
    packageSize: "12.5 oz",
  });
  const inventedMatches = matches({
    brand: "North Star Pet",
    productName: "Harvest Chicken and Rice Adult Dog Food",
    productLine: "Harvest",
    lifeStage: "adult",
    packageSize: "12 lb",
  }, [inventedWet, inventedDry]);
  assert(
    inventedMatches.length === 1 && inventedMatches[0]?.cacheKey === "invented:dry",
    "the package-form boundary must work for an invented brand without product-specific tuning"
  );

  const morselsMatches = matches({
    brand: "North Star Pet",
    productName: "Harvest Meaty Morsels Chicken and Rice Adult Dog Food",
    productLine: "Harvest",
    lifeStage: "adult",
    packageSize: "8 lb",
  }, [inventedWet, { ...inventedDry, packageSize: "8 lb" }]);
  assert(
    morselsMatches.length === 1 && morselsMatches[0]?.cacheKey === "invented:dry",
    "Meaty Morsels on an 8 lb bag must remain dry-compatible"
  );

  const dryOcrMatches = ocrApi.filterProductsForOcr(
    [purinaWet, purinaDry],
    "PURINA ONE CHICKEN & RICE FORMULA MEATY MORSELS COMPLETE ADULT DOG FOOD NET WT 8 LB (3.63 kg)",
    { requireVisibleCandidateVariants: true }
  );
  assert(
    dryOcrMatches.length === 1 && dryOcrMatches[0]?.gtin === "017800475686",
    "the on-device OCR compatibility gate must exclude the Purina wet can before ranking"
  );

  const wrongDrySize = {
    ...purinaDry,
    cacheKey: "fixture:purina-dry-13lb",
    packageSize: "13 lb",
  };
  const wrongDrySizeRanked = ocrApi.rankProductsForOcr(
    [wrongDrySize],
    "PURINA ONE CHICKEN & RICE FORMULA COMPLETE ADULT DRY DOG FOOD NET WT 8 LB"
  );
  assert(
    wrongDrySizeRanked.length === 1
      && ocrApi.pickVerifiedProductForOcr(
        wrongDrySizeRanked,
        "PURINA ONE CHICKEN & RICE FORMULA COMPLETE ADULT DRY DOG FOOD NET WT 8 LB"
      ) === null,
    "a strong same-form OCR match must not auto-open a known incompatible package weight"
  );

  const metricEquivalentDry = {
    ...purinaDry,
    cacheKey: "fixture:purina-dry-metric",
    packageSize: "3.63 kg",
  };
  const metricEquivalentRanked = ocrApi.rankProductsForOcr(
    [metricEquivalentDry],
    "PURINA ONE CHICKEN & RICE FORMULA COMPLETE ADULT DRY DOG FOOD NET WT 8 LB"
  );
  assert(
    ocrApi.pickVerifiedProductForOcr(
      metricEquivalentRanked,
      "PURINA ONE CHICKEN & RICE FORMULA COMPLETE ADULT DRY DOG FOOD NET WT 8 LB"
    )?.cacheKey === metricEquivalentDry.cacheKey,
    "equivalent imperial and metric package weights must remain auto-open compatible"
  );

  const wetMultipack = labelResolutionApi.compareLabelIdentities(
    {
      brand: "North Star Pet",
      productName: "Chicken in Gravy Wet Dog Food 12 Cans",
      packageSize: "NET WT 9.75 LB (12 x 13 OZ cans)",
      petType: "dog",
    },
    {
      ...inventedWet,
      productName: "North Star Pet Chicken in Gravy Wet Dog Food",
      productLine: "",
      packageSize: "12 x 13 oz cans",
    },
    { requireVisibleCandidateVariants: true }
  );
  assert(
    wetMultipack.compatible && !wetMultipack.reasonCodes.includes("food_form_conflict"),
    "explicit wet/container evidence must keep a multi-pound case of cans wet"
  );

  const smallDryBag = labelResolutionApi.compareLabelIdentities(
    {
      brand: "North Star Pet",
      productName: "Chicken and Rice Dry Dog Food",
      packageSize: "13 oz bag",
      petType: "dog",
    },
    {
      ...inventedDry,
      productName: "North Star Pet Chicken and Rice Dry Dog Food",
      productLine: "",
      packageSize: "13 oz bag",
    },
    { requireVisibleCandidateVariants: true }
  );
  assert(
    smallDryBag.compatible && !smallDryBag.reasonCodes.includes("food_form_conflict"),
    "explicit dry wording must keep a small ounce-denominated trial bag dry"
  );

  const bagOnlyBoundary = labelResolutionApi.compareLabelIdentities(
    {
      brand: "North Star Pet",
      productName: "Chicken and Rice Adult Dog Food",
      packageSize: "NET WT 13 OZ BAG",
      petType: "dog",
    },
    {
      ...inventedWet,
      productName: "North Star Pet Chicken and Rice Wet Dog Food",
      productLine: "",
      packageSize: "13 oz can",
    },
    { requireVisibleCandidateVariants: true }
  );
  assert(
    !bagOnlyBoundary.compatible
      && bagOnlyBoundary.reasonCodes.includes("food_form_conflict"),
    "a visible bag must never resolve to a same-weight can when explicit form text is absent"
  );

  const freezeDriedConflict = labelResolutionApi.compareLabelIdentities(
    {
      brand: "North Star Pet",
      productName: "Chicken Freeze-Dried Dog Food",
      petType: "dog",
    },
    {
      ...inventedDry,
      productName: "North Star Pet Chicken Dry Kibble Dog Food",
      foodForm: "dry",
    },
    { requireVisibleCandidateVariants: true }
  );
  assert(
    !freezeDriedConflict.compatible
      && freezeDriedConflict.reasonCodes.includes("food_form_conflict"),
    "freeze-dried and conventional dry food must remain distinct form boundaries"
  );

  const poundToOunceConflict = labelResolutionApi.compareLabelIdentities(
    purinaDryLabel,
    purinaWet,
    { requireVisibleCandidateVariants: true }
  );
  assert(
    !poundToOunceConflict.compatible
      && poundToOunceConflict.reasonCodes.includes("food_form_conflict")
      && poundToOunceConflict.reasonCodes.includes("package_size_form_conflict")
      && poundToOunceConflict.reasonCodes.includes("candidate_formula_variant_not_visible"),
    "8 lb Chicken & Rice evidence must reject a 13 oz Brown Rice wet candidate for form, package scale, and hidden variant"
  );
  const ounceToPoundConflict = labelResolutionApi.compareLabelIdentities(
    { brand: "North Star Pet", productName: "Chicken and Rice Adult Dog Food", packageSize: "13 oz", petType: "dog" },
    inventedDry,
    { requireVisibleCandidateVariants: true }
  );
  assert(
    !ounceToPoundConflict.compatible
      && ounceToPoundConflict.reasonCodes.includes("package_size_form_conflict"),
    "13 oz label evidence must decisively conflict with a multi-pound dry candidate"
  );

  const wetVocabulary = [
    "entree",
    "classic ground",
    "chunks in gravy",
    "chunks in sauce",
    "can",
    "tray",
    "tub",
    "cup",
    "cups",
  ];
  for (const term of wetVocabulary) {
    const comparison = labelResolutionApi.compareLabelIdentities(
      { brand: "North Star Pet", productLine: "Harvest", productName: `Harvest Chicken ${term} Adult Dog Food`, packageSize: "13 oz", petType: "dog" },
      { ...inventedWet, productName: `North Star Pet Chicken ${term} Adult Dog Food` },
      { requireVisibleCandidateVariants: true }
    );
    assert(comparison.compatible, `${term} must be recognized as wet-compatible`);
  }
  const realDryOpposite = labelResolutionApi.compareLabelIdentities(
    {
      brand: "IAMS",
      productName: "IAMS MiniChunks Meaty Morsels Chicken Chunks with Ground Whole Grain Corn Dry Dog Food 4 cups daily",
      packageSize: "8 lb",
      petType: "dog",
    },
    {
      brand: "IAMS",
      productName: "IAMS MiniChunks Chicken and Whole Grains Dry Dog Food",
      foodForm: "dry",
      packageSize: "8 lb",
      petType: "dog",
    },
    { requireVisibleCandidateVariants: true }
  );
  assert(
    realDryOpposite.compatible,
    "morsels, chunks, bites, ground grain, and feeding-cup text must not turn a real dry identity into wet food"
  );

  const contaminatedOcrIdentity = labelResolutionApi.reconcileLabelOutcomes([
    {
      path: "on_device_ocr",
      result: {
        query: "PURINA ONE CHICKEN & RICE FORMULA COMPLETE ADULT DOG FOOD NET WT 8 LB",
        identification: {
          found: true,
          confidence: 0.94,
          brand: purinaWet.brand,
          productName: purinaWet.productName,
          flavor: purinaWet.flavor,
          lifeStage: "adult",
          foodForm: "wet",
          packageSize: "13 oz",
          petType: "dog",
        },
        selectedProduct: { ...purinaWet, ocrMatchScore: 0.94 },
        products: [{ ...purinaWet, ocrMatchScore: 0.94 }],
      },
    },
    { path: "cloud_image", error: new Error("Label lookup timed out") },
  ], { strictMatching: true, autoOpenEnabled: true });
  assert(
    contaminatedOcrIdentity.decision !== labelResolutionApi.LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED
      && !contaminatedOcrIdentity.selectedProduct,
    "candidate-derived OCR identity must never validate its own hidden Brown Rice wet variant"
  );

  const productLineGuard = labelResolutionApi.compareLabelIdentities(
    { brand: "North Star Pet", productName: "Chicken Adult Dog Food", packageSize: "8 lb", petType: "dog" },
    { ...inventedDry, productLine: "Harvest" },
    { requireVisibleCandidateVariants: true }
  );
  assert(
    productLineGuard.reasonCodes.includes("candidate_product_line_not_visible"),
    "candidate-only protected product lines must be rejected"
  );
  const protectedFieldReasons = labelResolutionApi.compareLabelIdentities(
    { brand: "North Star Pet", productName: "Chicken Adult Dog Food", packageSize: "8 lb", petType: "dog" },
    {
      ...inventedDry,
      productName: "North Star Pet Harvest Grain Free Large Breed Sensitive Chicken Adult Dry Dog Food",
      productLine: "Harvest",
    },
    { requireVisibleCandidateVariants: true }
  ).reasonCodes;
  assert(
    protectedFieldReasons.includes("candidate_condition_not_visible")
      && protectedFieldReasons.includes("candidate_formula_variant_not_visible"),
    "diet condition, breed size, and grain-free candidate-only variants must stay behind asymmetric guards"
  );
}

function checkStrictLabelResolution(api) {
  const product = (overrides = {}) => ({
    sourceKind: "catalog",
    cacheKey: "example:1",
    brand: "Example",
    productName: "Example Adult Chicken Dry Dog Food",
    petType: "dog",
    foodForm: "dry",
    lifeStage: "adult",
    ...overrides,
  });
  const outcome = (path, identification, selectedProduct, products = [selectedProduct].filter(Boolean)) => ({
    path,
    result: {
      identification: { found: true, confidence: 0.95, ...identification },
      selectedProduct,
      products,
    },
  });

  const beneful = product({
    cacheKey: "beneful:originals",
    brand: "Beneful",
    productName: "Beneful Originals Farm-Raised Beef Dry Dog Food",
  });
  const proPlanCat = product({
    cacheKey: "pro-plan:weight-cat",
    brand: "Purina Pro Plan",
    productName: "Pro Plan Weight Management Adult Dry Cat Food",
    petType: "cat",
  });
  const benefulConflict = api.reconcileLabelOutcomes([
    outcome("on_device_ocr", {
      brand: "Beneful",
      productName: "Originals Farm-Raised Beef",
      petType: "dog",
      foodForm: "dry",
    }, beneful),
    outcome("cloud_image", {
      brand: "Purina Pro Plan",
      productName: "Weight Management Adult Dry Cat Food",
      petType: "cat",
      foodForm: "dry",
    }, proPlanCat),
  ], { strictMatching: true, autoOpenEnabled: true });
  assert(
    benefulConflict.decision === api.LABEL_RESOLUTION_DECISIONS.RECOGNIZERS_DISAGREE
      && !benefulConflict.selectedProduct,
    "Beneful dog evidence must never auto-open a Purina Pro Plan cat product"
  );

  const moistMeaty = product({
    cacheKey: "moist-meaty:burger-cheddar",
    brand: "Moist & Meaty",
    productName: "Moist & Meaty Burger with Cheddar Cheese Flavor",
  });
  const purinaOnePuppy = product({
    cacheKey: "purina-one:puppy",
    brand: "Purina ONE",
    productName: "Purina ONE +Plus Healthy Puppy Formula",
    lifeStage: "puppy",
  });
  const purinaLineConflict = api.reconcileLabelOutcomes([
    outcome("on_device_ocr", {
      brand: "Moist & Meaty",
      productName: "Burger with Cheddar Cheese Flavor",
      petType: "dog",
    }, moistMeaty),
    outcome("cloud_image", {
      brand: "Purina ONE",
      productName: "+Plus Healthy Puppy Formula",
      petType: "dog",
      lifeStage: "puppy",
    }, purinaOnePuppy),
  ], { strictMatching: true, autoOpenEnabled: true });
  assert(
    purinaLineConflict.decision === api.LABEL_RESOLUTION_DECISIONS.RECOGNIZERS_DISAGREE
      && !purinaLineConflict.selectedProduct,
    "Purina parent-brand overlap must never cross Moist & Meaty and Purina ONE"
  );

  const exact = api.reconcileLabelOutcomes([
    outcome("on_device_ocr", {
      brand: "Open Farm",
      productLine: "RawMix",
      productName: "Wild Ocean Recipe",
      petType: "dog",
      foodForm: "dry",
    }, product({
      cacheKey: "open-farm:wild-ocean-a",
      brand: "Open Farm",
      productLine: "RawMix",
      productName: "RawMix Wild Ocean Recipe Dry Dog Food",
    })),
    outcome("cloud_image", {
      brand: "Open Farm",
      productLine: "RawMix",
      productName: "Wild Ocean Recipe",
      petType: "dog",
      foodForm: "dry",
    }, product({
      cacheKey: "open-farm:wild-ocean-b",
      brand: "Open Farm",
      productLine: "RawMix",
      productName: "RawMix Wild Ocean Recipe Dry Dog Food",
    })),
  ], { strictMatching: true, autoOpenEnabled: true });
  assert(
    exact.decision === api.LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED
      && /Wild Ocean/.test(exact.selectedProduct?.productName || ""),
    "matching OCR and cloud evidence must confirm the same formula across package records"
  );

  const deterministicOcr = api.reconcileLabelOutcomes([
    outcome("on_device_ocr", {
      brand: "Open Farm",
      productLine: "RawMix",
      productName: "RawMix Wild Ocean Grain-Free Dog Kibble",
      flavor: "Wild Ocean",
      petType: "dog",
      foodForm: "dry",
      confidence: 0.91,
    }, product({
      cacheKey: "open-farm:wild-ocean-unique",
      brand: "Open Farm",
      productLine: "RawMix Wild Ocean",
      productName: "RawMix Wild Ocean Grain-Free Dog Kibble",
      ocrMatchScore: 0.91,
    })),
    { path: "cloud_image", error: new Error("Label lookup timed out") },
  ], { strictMatching: true, autoOpenEnabled: true });
  assert(
    deterministicOcr.decision === api.LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED
      && deterministicOcr.resolutionEvidence.visualConfirmation === "deterministic_ocr_photo_identity",
    "a cloud timeout must not discard one unique high-confidence OCR formula"
  );

  const iamsOcrText = [
    "IAMS",
    "PROACTIVE HEALTH",
    "MINICHUNKS",
    "CHICKEN & WHOLE GRAIN RECIPE",
    "ADULT 1+",
  ].join("\n");
  const iamsExact = product({
    cacheKey: "iams:019014610860",
    brand: "IAMS",
    productLine: "Proactive Health",
    productName: "IAMS MINICHUNKS CHICKEN & WHOLE GRAINS",
    flavor: "Chicken",
    ocrMatchScore: 0.91,
  });
  const deterministicIams = api.reconcileLabelOutcomes([
    {
      path: "on_device_ocr",
      result: {
        query: iamsOcrText,
        identification: {
          found: true,
          brand: "IAMS",
          productLine: "Proactive Health",
          productName: "IAMS MINICHUNKS CHICKEN & WHOLE GRAINS",
          flavor: "Chicken",
          lifeStage: "adult",
          foodForm: "dry",
          petType: "dog",
          confidence: 0.91,
        },
        selectedProduct: iamsExact,
        products: [iamsExact],
      },
    },
    { path: "cloud_image", error: new Error("Label lookup timed out") },
  ], { strictMatching: true, autoOpenEnabled: true });
  assert(
    deterministicIams.decision === api.LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED
      && deterministicIams.selectedProduct?.cacheKey === iamsExact.cacheKey,
    "visible IAMS product-line and recipe evidence must confirm the exact formula without cloud delay"
  );

  const totalTimeout = api.reconcileLabelOutcomes([
    { path: "on_device_ocr", error: new Error("Label catalog lookup timed out") },
    { path: "cloud_image", error: new Error("Label lookup timed out") },
  ], { strictMatching: true, autoOpenEnabled: true });
  assert(
    totalTimeout.decision === api.LABEL_RESOLUTION_DECISIONS.TIMED_OUT
      && totalTimeout.identification.found === false
      && totalTimeout.products.length === 0,
    "a timed-out scan with zero catalog candidates must never be recorded as identified"
  );

  const shelfNoise = api.evaluateNonCompleteFoodEvidence({
    lines: [
      { text: "Hill's Science Diet Adult Chicken Dry Dog Food", confidence: 0.95, bounds: { x: 0.2, y: 0.2, width: 0.6, height: 0.3 } },
      { text: "Treats", confidence: 0.96, bounds: { x: 0.91, y: 0.2, width: 0.08, height: 0.1 } },
    ],
  });
  assert(
    shelfNoise.status === "none",
    "a neighboring shelf treat label must not classify Hill's Science Diet as a treat"
  );

  const uncorroborated = api.evaluateNonCompleteFoodEvidence({
    lines: [
      { text: "Meal Topper", confidence: 0.95, bounds: { x: 0.3, y: 0.3, width: 0.4, height: 0.2 } },
    ],
  });
  assert(
    uncorroborated.status === "possible" && !uncorroborated.confirmed,
    "one product-local topper keyword must not create a 100%-confidence exclusion"
  );

  const completeMealOrTopper = api.evaluateNonCompleteFoodEvidence({
    lines: [
      {
        text: "Blue Buffalo Love Made Fresh Beef Recipe Use as a Meal or Topper Refrigerated Food for Adult Dogs",
        confidence: 0.96,
      },
    ],
  });
  assert(
    completeMealOrTopper.status === "possible" && !completeMealOrTopper.confirmed,
    "Love Made Fresh 'use as a meal or topper' must not be excluded as a non-complete topper"
  );

  const confirmedTreat = api.evaluateNonCompleteFoodEvidence({
    lines: [
      { text: "Dog Treats", confidence: 0.95 },
      { text: "Intended for intermittent or supplemental feeding only", confidence: 0.91 },
    ],
  });
  assert(
    confirmedTreat.confirmed && confirmedTreat.category === "treat",
    "non-complete classification must require corroborating product-local evidence"
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
    /Full nutrient analysis is not published/.test(withoutPublishedFacts.categories[2]?.detail || ""),
    "balance scoring must be conservative when full nutrient analysis is unavailable"
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

  assert(
    withPublishedFacts.categories[3]?.name === "Low-Nutrient Binders"
      && !JSON.stringify(withPublishedFacts).includes("Filler Content"),
    "Eric's preferred low-nutrient-binder terminology must replace the legacy filler label"
  );

  const typicalFacts = api.buildVerifiedPetFoodAnalysis({
    ...product,
    productName: "Example Adult Dog Food Typical Analysis",
    hasPublishedNutrients: true,
    nutriments: {
      protein: 30,
      fat: 16,
      fiber: 4,
      moisture: 9,
      calcium: 1.2,
      phosphorus: 0.9,
      analysisType: "typical",
      basis: "dry_matter",
    },
  });
  assert(
    typicalFacts.categories[2]?.score > withPublishedFacts.categories[2]?.score
      && typicalFacts.nutritionAnalysis.transparencyLevel === "fuller",
    "published typical dry-matter values must earn more nutrition-transparency credit than guaranteed analysis alone"
  );

  const highCalciumFacts = api.buildVerifiedPetFoodAnalysis({
    ...product,
    productName: "Nature's Logic Canine Pork Meal Feast",
    brand: "Nature's Logic",
    lifeStage: "All Life Stages",
    hasPublishedNutrients: true,
    nutriments: {
      protein: 38,
      fat: 15,
      fiber: 5,
      moisture: 9,
      calcium: 5.34,
      phosphorus: 2.84,
      analysisType: "actual analysis",
      basis: "dry matter",
    },
  });
  assert(
    highCalciumFacts.overallScore <= 35
      && highCalciumFacts.petSafety.level === "avoid"
      && highCalciumFacts.nutritionAnalysis.nutrientConcern?.code === "calcium_above_profile_maximum"
      && /1\.8% AAFCO profile maximum/.test(
        highCalciumFacts.nutritionAnalysis.nutrientConcern?.summary || ""
      ),
    "source-backed calcium above the dog profile maximum must cap the result and surface a clear concern"
  );
  assert(
    highCalciumFacts.nutritionAnalysis.calciumDryMatterPercent === "5.34%"
      && highCalciumFacts.nutritionAnalysis.calciumPhosphorusRatio === "1.88:1",
    "dry-matter calcium and Ca:P ratio must remain visible in the result payload"
  );

  const adultCalciumFacts = api.buildVerifiedPetFoodAnalysis({
    ...product,
    productName: "Example Adult Dog Food",
    lifeStage: "Adult",
    hasPublishedNutrients: true,
    nutriments: {
      protein: 28,
      fat: 15,
      fiber: 4,
      calcium: 2,
      phosphorus: 1.2,
      analysisType: "typical",
      basis: "dry matter",
    },
  });
  assert(
    adultCalciumFacts.nutritionAnalysis.nutrientConcern == null,
    "adult-maintenance calcium below 2.5% must not be mislabeled as a growth-profile violation"
  );

  const allLifeStagesCalciumFacts = api.buildVerifiedPetFoodAnalysis({
    ...product,
    productName: "Example All Life Stages Dog Food",
    lifeStage: "All Life Stages",
    hasPublishedNutrients: true,
    nutriments: {
      protein: 30,
      fat: 18,
      fiber: 4,
      calcium: 2,
      phosphorus: 1.2,
      analysisType: "typical",
      basis: "dry matter",
    },
  });
  assert(
    allLifeStagesCalciumFacts.nutritionAnalysis.nutrientConcern?.code
      === "calcium_above_profile_maximum",
    "all-life-stages dog food must use the 1.8% growth/reproduction calcium maximum"
  );

  const convertedAsFedFacts = api.buildVerifiedPetFoodAnalysis({
    ...product,
    productName: "Example Adult Dog Food As Fed",
    hasPublishedNutrients: true,
    nutriments: {
      protein: 26,
      fat: 14,
      fiber: 4,
      moisture: 10,
      calcium: 2.7,
      phosphorus: 1.35,
      analysisType: "typical",
      basis: "as_fed",
    },
  });
  assert(
    convertedAsFedFacts.nutritionAnalysis.calciumDryMatterPercent === "3%"
      && convertedAsFedFacts.nutritionAnalysis.nutrientConcern?.code === "calcium_above_profile_maximum",
    "as-fed minerals must be converted using moisture before dry-matter profile screening"
  );
}

function checkResolverWiring() {
  const appSource = fs.readFileSync(path.join(root, "App.js"), "utf8");
  const themeSource = fs.readFileSync(path.join(root, "theme.js"), "utf8");
  const performanceTimings = fs.readFileSync(
    path.join(root, "services", "performanceTimings.js"),
    "utf8"
  );
  const productCatalog = fs.readFileSync(path.join(root, "services", "productCatalog.js"), "utf8");
  const productSearchScreen = fs.readFileSync(path.join(root, "screens", "ProductSearchScreen.js"), "utf8");
  const catalogCoverage = fs.readFileSync(path.join(root, "services", "catalogCoverage.js"), "utf8");
  const runtimeConfig = fs.readFileSync(path.join(root, "services", "runtimeConfig.js"), "utf8");
  const labelIdentityMigration = fs.readFileSync(
    path.join(
      root,
      "supabase",
      "migrations",
      "20260822063856_optimize_label_identity_lookup.sql"
    ),
    "utf8"
  );
  const onDeviceLabelAudit = fs.readFileSync(
    path.join(root, "scripts", "live-on-device-label-audit.mjs"),
    "utf8"
  );
  const scannerScreen = fs.readFileSync(path.join(root, "screens", "ScannerScreen.js"), "utf8");
  const nativeLabelOcr = fs.readFileSync(
    path.join(root, "modules", "woof-label-ocr", "ios", "WoofLabelOcrModule.swift"),
    "utf8"
  );
  const resultsScreen = fs.readFileSync(path.join(root, "screens", "ResultsScreen", "index.js"), "utf8");
  const profileScreen = fs.readFileSync(path.join(root, "screens", "ProfileScreen.js"), "utf8");
  const homeScreen = fs.readFileSync(path.join(root, "screens", "HomeScreen.js"), "utf8");
  const analysisService = fs.readFileSync(path.join(root, "services", "analysisService.js"), "utf8");
  const productLookup = fs.readFileSync(
    path.join(root, "supabase", "functions", "product-lookup", "index.ts"),
    "utf8"
  );
  const labelLookup = fs.readFileSync(
    path.join(root, "supabase", "functions", "label-lookup", "index.ts"),
    "utf8"
  );
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
  const gtinVersionAbstention = fs.readFileSync(
    path.join(
      root,
      "supabase",
      "migrations",
      "20260726154008_abstain_reused_gtin_formula_versions.sql"
    ),
    "utf8"
  );
  const appSearchGtinVersionAbstention = fs.readFileSync(
    path.join(
      root,
      "supabase",
      "migrations",
      "20260804092010_enforce_verified_gtin_version_abstention_in_search.sql"
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
      && /collectLabelOutcomes/.test(productSearchScreen)
      && /reconcileLabelOutcomes/.test(productSearchScreen)
      && !/LABEL_RECONCILIATION_GRACE_MS/.test(productSearchScreen)
      && /getLabelResolutionConfig/.test(productSearchScreen),
    "ProductSearchScreen must reconcile OCR and cloud evidence under strict runtime controls"
  );
  const clearScanContextSource = productSearchScreen.match(
    /const clearScanContext = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/
  )?.[1] || "";
  assert(
    /setIdentification\(null\)/.test(clearScanContextSource)
      && /setResolutionDecision\(null\)/.test(clearScanContextSource)
      && /setResolutionEvidence\(null\)/.test(clearScanContextSource)
      && /setConfirmedFormulaKey\(""\)/.test(clearScanContextSource)
      && /source === "typed" \|\| source === "submit"[\s\S]*clearScanContext\(\)/.test(productSearchScreen),
    "typed and submitted searches must clear stale label identification and exclusion state"
  );
  assert(
    /manual_selected:\s*labelSelection && !autoOpen/.test(productSearchScreen)
      && /selection_mode:[\s\S]*manual_label_candidate/.test(productSearchScreen)
      && /recognized_label_identity:/.test(productSearchScreen)
      && /label_food_form_evidence:/.test(productSearchScreen)
      && /chosen_food_form:/.test(productSearchScreen)
      && /chosen_package_size:/.test(productSearchScreen)
      && /sourceSurface: labelCandidate \? "label_candidate_list"/.test(productSearchScreen)
      && /auto_open_fired:/.test(catalogCoverage)
      && /recognized_on_device:/.test(catalogCoverage)
      && /confirmed_candidate:/.test(catalogCoverage)
      && /top_food_form:/.test(catalogCoverage)
      && /top_package_size:/.test(catalogCoverage),
    "label telemetry must distinguish auto-open from manual selection and retain recognized versus chosen form and package identity"
  );
  assert(
    /labelCaptureStartedAt/.test(scannerScreen)
      && /capture_to_handoff_ms/.test(scannerScreen)
      && /const \[resized, labelOcr\] = await Promise\.all/.test(scannerScreen)
      && /labelOcrText: labelOcr\?\.usable/.test(scannerScreen),
    "ScannerScreen must run OCR with image optimization and hand recognized text to product search"
  );
  assert(
    /onBarcodeScanned=\{barcodeEnabled \? handleBarcodeScanned : undefined\}/.test(scannerScreen)
      && /barcodeTypes: \["ean13", "ean8", "upc_a", "upc_e"\]/.test(scannerScreen)
      && /navigation\.push\("Results",\s*\{[\s\S]*?mode:\s*"barcode",[\s\S]*?barcode:\s*barcodeValue,[\s\S]*?uri:\s*previewUri,[\s\S]*?\}\)/.test(scannerScreen)
      && /failedBarcodesThisSession\.has\(barcodeValue\)/.test(scannerScreen)
      && /barcode_ignored_after_failed_lookup/.test(scannerScreen)
      && /failedBarcode: barcode \|\| event\.barcode \|\| null/.test(resultsScreen)
      && /Barcode not in the verified catalog — capture the front label instead/.test(scannerScreen),
    "Eric's customer barcode regression must retain automatic UPC/EAN detection, loop protection, and a clear photo fallback"
  );
  assert(
    /class ErrorBoundary extends Component/.test(appSource)
      && /Something went wrong/.test(appSource)
      && /accessibilityLabel="Try again"/.test(appSource)
      && /function hasMeaningfulAnalysisResult/.test(resultsScreen)
      && /hasMeaningfulAnalysisResult\(event\.result\)/.test(resultsScreen)
      && /EMPTY_ANALYSIS_RESULT/.test(resultsScreen)
      && /<ErrorState/.test(resultsScreen),
    "Eric's post-analysis white-screen regression must always resolve to a recoverable error surface"
  );
  assert(
    /projectScanFrameToPhoto\(\{/.test(scannerScreen)
      && /recognizeLabelText\(framedPhoto\.uri\)/.test(scannerScreen)
      && /optimizePhotoForAnalysis\(framedPhoto\.uri/.test(scannerScreen)
      && /cropLabelToNormalizedRegion\(photo\.uri, normalizedCrop\)/.test(scannerScreen)
      && /crop_engine: cropEngine/.test(scannerScreen)
      && /label_image_scope: isLabelLookup \? "highlighted_scan_frame"/.test(scannerScreen),
    "ScannerScreen must send only the highlighted label frame to OCR and visual recognition"
  );
  assert(
    /AsyncFunction\("cropToNormalizedRegion"\)/.test(nativeLabelOcr)
      && /renderUprightImage\(sourceImage\)/.test(nativeLabelOcr)
      && /UIGraphicsImageRenderer/.test(nativeLabelOcr),
    "iOS label capture must normalize camera orientation before cropping the highlighted frame"
  );
  assert(
    /\.rpc\(functionName, args\)[\s\S]*\.abortSignal\(controller\.signal\)/.test(productCatalog)
      && /CATALOG_RPC_TIMEOUT_MS = 6_000/.test(productCatalog)
      && /LABEL_RPC_TIMEOUT_MS = 4_500/.test(productCatalog),
    "catalog RPCs must be cancellable and leave cold-network margin"
  );
  assert(
    /@woof_label_resolution_config_v3/.test(runtimeConfig)
      && /reconciliationTimeoutMs:\s*8_500/.test(runtimeConfig)
      && /SAFE_DEFAULT_RETRY_MS = 30 \* 1000/.test(runtimeConfig),
    "runtime config must invalidate the old timeout cache and retry transient defaults"
  );
  assert(
    /search_verified_product_identities_for_label/.test(productCatalog)
      && /search_verified_products_for_label_fast/.test(productCatalog)
      && !/search_verified_products_for_label_ocr_text/.test(productCatalog)
      && !/boundedQueries\.map\(\(query\) => searchWoofCatalog/.test(productCatalog),
    "label resolution must use the lightweight identity RPC with one rollout fallback"
  );
  assert(
    /CREATE OR REPLACE FUNCTION public\.search_verified_product_identities_for_label/.test(labelIdentityMigration)
      && /SECURITY INVOKER/.test(labelIdentityMigration)
      && /reconciliation_timeout_ms}', '9500'/.test(labelIdentityMigration)
      && /label_lookup_completed/.test(labelIdentityMigration)
      && /label_lookup_failed/.test(labelIdentityMigration),
    "database rollout must keep identity lookup invoker-safe and count label timeouts"
  );
  assert(
    /search_verified_product_identities_for_label/.test(onDeviceLabelAudit)
      && /max_results:\s*32/.test(onDeviceLabelAudit)
      && /AbortSignal\.timeout\(4_500\)/.test(onDeviceLabelAudit),
    "the on-device audit must exercise the same RPC and timeout contract as the app"
  );
  assert(
    /multi-pound upright bag or visible kibble is dry/.test(labelLookup)
      && /bag must not become wet merely because its net weight is written in ounces/.test(labelLookup)
      && /multi-can or multi-pouch case/.test(labelLookup)
      && /meaty morsels in every bite/.test(labelLookup),
    "cloud recognition must distinguish physical package form from marketing copy and multipack total weight"
  );
  assert(
    /onTimeout: abortRequests/.test(productSearchScreen)
      && /finish\(\{ cancelPending: true \}\)/.test(productSearchScreen)
      && /mergeAutomaticLabelRecovery/.test(productSearchScreen)
      && /automatic_recovery_attempted/.test(productSearchScreen)
      && /recognizedOcrRef/.test(productSearchScreen),
    "label resolution must cancel slow cloud work and automatically recover from readable OCR"
  );
  assert(
    /prefetchCatalogHydration/.test(productSearchScreen)
      && /prefetched\?\.promise \|\| getCatalogProduct\(product\.cacheKey\)/.test(productSearchScreen)
      && /hydrationOverlapMs/.test(productSearchScreen)
      && /prefetchCatalogHydration\(result\.selectedProduct, lifecycleController\.signal\)/.test(productSearchScreen)
      && !/prefetchCatalogHydration\(result\.selectedProduct, requestController\.signal\)/.test(productSearchScreen)
      && /catalog_product_hydration_completed/.test(productSearchScreen),
    "lightweight identity results must prefetch and reuse verified ingredients before analysis opens"
  );
  assert(
    /CATALOG_PRODUCT_CACHE_TTL_MS = 10 \* 60 \* 1000/.test(productCatalog)
      && /CATALOG_PRODUCT_CACHE_MAX_ENTRIES = 24/.test(productCatalog)
      && /catalogProductCache\.get\(key\)/.test(productCatalog)
      && /catalogProductCache\.delete\(catalogProductCache\.keys\(\)\.next\(\)\.value\)/.test(productCatalog),
    "successful catalog hydration must use a short-lived bounded cache across repeated scan and search paths"
  );
  assert(
    /Promise\.all\(fallbackQueries\.map\(async/.test(productCatalog)
      && /fallbackQueries = boundedQueries\.slice\(0, 2\)/.test(productCatalog)
      && /fallbackLookupSerialEquivalentMs/.test(productCatalog)
      && /fallbackLookupSavedMs/.test(productCatalog)
      && !/for \(const query of boundedQueries\.slice\(0, 2\)\)/.test(productCatalog),
    "the two bounded label fallbacks must run in parallel and quantify avoided serial wait"
  );
  assert(
    /label_scan_stage_timings/.test(performanceTimings)
      && /recognition_wall_ms/.test(productSearchScreen)
      && /fallback_lookup_wall_ms/.test(productSearchScreen)
      && /hydration_wait_ms/.test(performanceTimings),
    "label resolution must emit measured recognizer, gate, fallback, and hydration stages"
  );
  assert(
    /const runtimeConfigPromise = getLabelResolutionConfig\(\)[\s\S]*const visualPromise/.test(productSearchScreen)
      && /runtimeConfig\.reconciliationTimeoutMs - elapsedBeforeReconciliationMs/.test(productSearchScreen),
    "runtime configuration, OCR, and visual recognition must share one total resolution budget"
  );
  assert(
    /const LIGHT_THEME = buildTheme\(false\)/.test(themeSource)
      && /const DARK_THEME = buildTheme\(true\)/.test(themeSource)
      && /return scheme === "dark" \? DARK_THEME : LIGHT_THEME/.test(themeSource),
    "useTheme must return one stable object per color scheme so memoized styles do not rebuild while streaming"
  );
  assert(
    /Found: \{recognizedIdentityText\}/.test(productSearchScreen)
      && /onIdentification: \(recognizedIdentification\)/.test(productSearchScreen)
      && /prefetchResolutionImages\(result\)/.test(productSearchScreen),
    "label lookup must show recognized identity and prefetch candidate images before reconciliation finishes"
  );
  assert(
    !/messages\[messageIndex % messages\.length\]/.test(resultsScreen)
      && /messageIndex >= messages\.length/.test(resultsScreen)
      && /SLOW_LOADING_THRESHOLD_MS = 12_000/.test(resultsScreen),
    "results loading messages must stop at the final honest stage and preserve the 12-second slow threshold"
  );
  assert(
    /loggedCaptureStarts\.has\(startedAt\)/.test(performanceTimings)
      && /if \(!result\.selectedProduct\) \{[\s\S]*logCaptureToResult/.test(productSearchScreen)
      && /captureTimingMode/.test(resultsScreen),
    "capture-to-result timing must emit once at the user-visible terminal surface"
  );

  const reconcileSearchProducts = new Function(`
    const SEARCH_RESULT_LIMIT = 12;
    ${extractFunction(productSearchScreen, "productStableKey")}
    ${extractFunction(productSearchScreen, "reconcileSearchProducts")}
    return reconcileSearchProducts;
  `)();
  const reconciledSearch = reconcileSearchProducts(
    [{ cacheKey: "a", productName: "Cached A" }, { cacheKey: "b", productName: "Cached B" }],
    [{ cacheKey: "a", productName: "Fresh A" }, { cacheKey: "b", productName: "Fresh B" }, { cacheKey: "c", productName: "Fresh C" }]
  );
  assert(
    reconciledSearch.map((product) => product.cacheKey).join(",") === "a,b,c"
      && reconciledSearch[0].productName === "Fresh A",
    "network refresh must update cached search rows by stable key without replacing list order"
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
    ${extractFunction(productCatalog, "stripPackageSizeTokens")}
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
      /searchWoofCatalogForLabelIdentity\(searchQueries, 48, signal\)/.test(productCatalog) &&
      !/for \(const candidateQuery of searchQueries\)/.test(productCatalog),
    "label resolution must use the bounded fast identity query instead of sequential catalog round trips"
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
    /personalizePetSafety\(\{ \.\.\.result, dataSource \}, savedPetProfile\)/.test(resultsScreen) && /Add Pet Details/.test(resultsScreen),
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
    /formulaEvidenceTier/.test(productCatalog)
      && /formula_version_provenance/.test(productCatalog)
      && /Formula version/.test(resultsScreen),
    "catalog results must surface explicit source-version provenance"
  );
  assert(
    /versionKeys\.size !== 1/.test(productCatalog)
      && /versionKeys\.size !== 1/.test(productLookup),
    "client and Edge barcode lookup must abstain on incompatible GTIN versions"
  );
  assert(
    /count\(DISTINCT public\.catalog_normalize_ingredient_evidence/.test(
      gtinVersionAbstention
    )
      && /v_conflicting_result_count <> 0/.test(gtinVersionAbstention)
      && /v_safe_result_count <> 1/.test(gtinVersionAbstention),
    "database barcode lookup must abstain when one GTIN has multiple verified ingredient versions"
  );
  assert(
    /RENAME TO search_verified_products_unfiltered_gtin_v1/.test(
      appSearchGtinVersionAbstention
    )
      && /FROM public\.resolve_verified_product_by_gtin\(/.test(
        appSearchGtinVersionAbstention
      )
      && /FROM public\.search_verified_products_unfiltered_gtin_v1\(/.test(
        appSearchGtinVersionAbstention
      )
      && /search_verified_products\('851893001731', 8\)/.test(
        appSearchGtinVersionAbstention
      ),
    "app-facing verified search must delegate barcode-shaped input to the ingredient-version-safe resolver"
  );
  assert(
    /nutrition\.analysisTypeLabel/.test(resultsComponents)
      && /nutrition\.analysisBasisLabel/.test(resultsComponents)
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
assert(
  api.productMatchesQueryTerms(
    {
      brand: "IAMS",
      productName: "MiniChunks Chicken & Whole Grains",
      petType: "dog",
    },
    "IAMS MiniChunks Chicken Whole Grain"
  ),
  "verified catalog quality must accept safe singular/plural identity equivalents"
);
checkPetProfileCases(loadPetProfileModule());
const labelOcrMatchingApi = await loadLabelOcrMatchingModule();
checkLabelOcrMatchingCases(labelOcrMatchingApi);
await checkHighlightedCameraFrameCrop();
await checkReviewPromptCadence();
const catalogApi = loadCatalogMergeModule();
await checkCatalogHydrationCache(catalogApi);
checkFormulaVariantMerging(catalogApi);
checkRelaxedCatalogQueries(catalogApi);
checkStrictLabelCandidateMatching(catalogApi);
const labelResolutionApi = loadLabelResolutionModule();
checkHillsAdultSevenLabelResolution(catalogApi, labelResolutionApi);
checkPackageSizeDoesNotChangeLifeStage(labelResolutionApi);
checkFoodFormBoundaryRegression(catalogApi, labelResolutionApi, labelOcrMatchingApi);
checkStrictLabelResolution(labelResolutionApi);
checkVerifiedNutritionFacts(loadVerifiedScoringModule());
checkEricRegressionFixtures();
checkResolverWiring();
console.log("Product resolver contract checks passed.");
