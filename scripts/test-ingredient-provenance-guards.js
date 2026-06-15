const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const componentsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/components.js"), "utf8");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const onboardingSource = fs.readFileSync(path.join(root, "screens/OnboardingScreen.js"), "utf8");
const analyzeEdge = fs.readFileSync(path.join(root, "supabase/functions/analyze/index.ts"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`ingredient provenance guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  analysisSource.includes("function _ingredientSourceMeta(source)") &&
    analysisSource.includes('trustLevel: "authoritative"') &&
    analysisSource.includes('trustLevel: "listing"') &&
    analysisSource.includes('trustLevel: "community_ocr"') &&
    analysisSource.includes('trustLevel: "scraped"') &&
    analysisSource.includes("function _stampIngredientProvenance"),
  "analysis service must classify ingredient sources by trust level"
);

assert(
  !/augmented\.ingredientSource = "verified"/.test(analysisSource) &&
    !/analysis\.ingredientSource = "verified"/.test(analysisSource) &&
    analysisSource.includes("_stampIngredientProvenance(analysis, dbResult.source)") &&
    analysisSource.includes("_stampIngredientProvenance(analysis, \"user_ocr\")"),
  "analysis results must not force scraped or user-OCR sources to verified"
);

assert(
  analysisSource.includes("dbResult.source || cachedAnalysis.dataSource") &&
    analysisSource.includes("dbResult.source || localResult.dataSource"),
  "current product_data provenance must override stale verified cache metadata"
);

assert(
  componentsSource.includes("function ingredientSourceDisplay(dataSource)") &&
    componentsSource.includes("Ingredients from label photo") &&
    componentsSource.includes("Ingredients from retailer listing") &&
    componentsSource.includes("Verified ingredients from product database"),
  "data-source badge must distinguish verified, listing, retailer, and label-photo data"
);

assert(
  resultsSource.includes('["listing", "scraped", "user_ocr", "catalog"].includes(result.ingredientSource)') &&
    resultsSource.includes("Verify against the package label before making feeding decisions") &&
    !resultsSource.includes("accurate, verified score") &&
    !resultsSource.includes("Verified score"),
  "Results must show lower-provenance ingredient notices and avoid verified-score recovery copy"
);

assert(
  homeSource.includes("function searchSourceLabel(source)") &&
    homeSource.includes('return "label photo"') &&
    homeSource.includes('return "retailer"') &&
    homeSource.includes('return "listing"'),
  "Home search pills must label non-authoritative ingredient sources without calling them verified"
);

assert(
  onboardingSource.includes("9,000+ pet food recipes") &&
    onboardingSource.includes("9,000+ products indexed") &&
    onboardingSource.includes("with source labels") &&
    !onboardingSource.includes("50,000+") &&
    !onboardingSource.includes("50,000+ verified recipes"),
  "onboarding catalog copy must stay aligned with the audited live catalog size and not claim the mixed-provenance catalog is fully verified"
);

assert(
  analyzeEdge.includes('"sourceTrustLevel", "sourceLabel", "sourceUrl"') &&
    analyzeEdge.includes("Ingredient Source Trust") &&
    analyzeEdge.includes("source-labeled ingredient data") &&
    analyzeEdge.includes("do not describe listing, scraped, or user-OCR data as verified") &&
    /const dataSource = mode === "verified"[\s\S]{0,180}safeProduct\?\.source/.test(analyzeEdge),
  "Edge verified-mode prompt and analysis_cache writes must preserve ingredient source provenance"
);

assert(
  packageJson.includes('"test:ingredient-provenance": "node scripts/test-ingredient-provenance-guards.js"') &&
    packageJson.includes("npm run test:ingredient-provenance"),
  "ingredient provenance guard must be wired into package scripts"
);

console.log("ingredient provenance guard passed");
