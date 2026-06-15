#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`pet-food species guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  analysisSource.includes('const PET_TYPES = new Set(["dog", "cat"])') &&
    analysisSource.includes("function _knownPetType(value)") &&
    analysisSource.includes("if (!PET_TYPES.has(result.petType))") &&
    analysisSource.includes('return "missing petType";'),
  "completed pet-food analyses must require an explicit dog/cat petType"
);

assert(
  !/petType:\s*[^,\n]*\|\|\s*"unknown"/.test(analysisSource) &&
    !/const petType\s*=\s*[^;\n]*\|\|\s*"unknown"/.test(analysisSource),
  "pet-food analysis paths must not default missing species to unknown"
);

assert(
  /_runPhoto\(\{ tempId, base64, uri, petType, signal, state, isPro \}\)/.test(analysisSource) &&
    /async function _runPhoto\(\{ tempId, base64, uri, petType: routePetType, signal, state, isPro \}\)/.test(analysisSource) &&
    /const petType = _knownPetType\(routePetType\) \|\| _knownPetType\(identification\.petType\);/.test(analysisSource),
  "photo flow must honor a selected petType and sanitize model-detected petType"
);

for (const mode of ["search", "photo", "photo_with_ingredients"]) {
  assert(
    new RegExp(`type: "need_pet_type",[\\s\\S]{0,180}mode: "${mode}"`).test(analysisSource),
    `${mode} flow must pause for species confirmation when petType is missing`
  );
}

assert(
  analysisSource.includes("function _analysisCacheKey(cacheKey, petType)") &&
    analysisSource.includes('return `${cacheKey}__${resolvedPetType}`;') &&
    analysisSource.includes("_getSpeciesCachedAnalysis") &&
    analysisSource.includes("_getSpeciesLocalResult"),
  "pet-food analysis cache lookups and saves must be species-specific"
);

function functionBody(name) {
  const start = analysisSource.indexOf(`async function ${name}(`);
  const end = analysisSource.indexOf("\n// ──", start + 1);
  return start === -1 ? "" : analysisSource.slice(start, end === -1 ? undefined : end);
}

const startAnalysisBody = analysisSource.slice(
  analysisSource.indexOf("export function startAnalysis"),
  analysisSource.indexOf("async function _runBarcode")
);
const searchBody = functionBody("_runSearch");
assert(
  startAnalysisBody.includes('mode === "barcode"') &&
    startAnalysisBody.includes("_analysisCacheKey(barcode, petType) || barcode") &&
    startAnalysisBody.includes("const searchBaseKey = mode === \"search\"") &&
    startAnalysisBody.includes("_analysisCacheKey(searchBaseKey, petType) || searchBaseKey") &&
    startAnalysisBody.includes("const identifiedEstimateBaseKey = mode === \"photo_with_ingredients\" && !ingredientBase64") &&
    startAnalysisBody.includes("normalizeCacheKey(preIdentifiedBrand ? `${preIdentifiedBrand} ${preIdentifiedName}` : preIdentifiedName)") &&
    startAnalysisBody.includes("_analysisCacheKey(identifiedEstimateBaseKey, petType) || identifiedEstimateBaseKey") &&
    searchBody.includes("const serviceCacheKey = _analysisCacheKey(realCacheKey, resolvedPetType) || realCacheKey;") &&
    searchBody.includes("_rekey(tempId, serviceCacheKey, state);"),
  "barcode, search, and identified estimate analysis service keys must be species-specific to prevent dog/cat reuse collisions"
);

const photoWithIngredientsBody = functionBody("_runPhotoWithIngredients");
const photoBody = functionBody("_runPhoto");
assert(
  photoWithIngredientsBody.includes("const targetBaseKey = !ingredientBase64 && realCacheKey") &&
    photoWithIngredientsBody.includes('`${realCacheKey}__estimate`') &&
    photoWithIngredientsBody.includes("const analysisKey = _analysisCacheKey(targetBaseKey, resolvedPetType);") &&
    photoWithIngredientsBody.includes("const targetKey = analysisKey || targetBaseKey;") &&
    photoWithIngredientsBody.includes("_rekey(tempId, targetKey, state);") &&
    photoWithIngredientsBody.includes("notifyKey = targetKey || tempId;") &&
    !photoWithIngredientsBody.includes("_rekey(notifyKey, analysisKey, state);") &&
    photoBody.includes("const serviceAnalysisKey = _analysisCacheKey(realCacheKey, petType);") &&
    photoBody.includes("_rekey(notifyKey, serviceAnalysisKey, state);") &&
    photoBody.includes("notifyKey = serviceAnalysisKey;"),
  "photo and ingredient-label service keys must become species-specific after species is known"
);

assert(
  resultsSource.includes("function NeedsPetTypeCard") &&
    resultsSource.includes('event.type === "need_pet_type"') &&
    resultsSource.includes("const handleChoosePetType = useCallback") &&
    resultsSource.includes('accessibilityLabel="Analyze for a dog"') &&
    resultsSource.includes('accessibilityLabel="Analyze for a cat"'),
  "Results must render a dog/cat confirmation UI for ambiguous pet-food scans"
);

assert(
  resultsSource.includes("function cachedHistoryMatchesPetType(analysis, petType, scanMode)") &&
    resultsSource.includes('if (scanMode === "human_food") return true;') &&
    resultsSource.includes("return analysis.petType === petType;") &&
    resultsSource.includes("function historyReplayFromHits(source, hits, replayCacheKeys, petType, scanMode)") &&
    resultsSource.includes('const analysis = source === "local"') &&
    resultsSource.includes("hit?.analysis") &&
    resultsSource.includes("hit?.hit") &&
    /if \(analysis && cachedHistoryMatchesPetType\(analysis, petType, scanMode\)\) \{[\s\S]{0,160}return \{[\s\S]{0,80}analysis,/.test(resultsSource) &&
    /active && active\.status === "complete" && cachedHistoryMatchesPetType\(active\.result, petType, scanMode\)/.test(resultsSource) &&
    resultsSource.includes("historyReplayFromHits(settled.source, settled.hits, replayCacheKeys, petType, scanMode)"),
  "history replay must not show cached pet-food analysis for the wrong species"
);

assert(
  /navigation\.replace\("Results", \{[\s\S]{0,180}mode: "search"[\s\S]{0,360}petType: selectedPetType/.test(resultsSource) &&
    /navigation\.replace\("Results", \{[\s\S]{0,180}mode: "photo_with_ingredients"[\s\S]{0,260}petType: selectedPetType/.test(resultsSource) &&
    /navigation\.replace\("Results", \{[\s\S]{0,120}mode: "photo"[\s\S]{0,120}petType: selectedPetType/.test(resultsSource),
  "species confirmation must restart search, photo, and ingredient-label analyses with the selected petType"
);

assert(
  resultsSource.includes("cacheKey: needsPetType.cacheKey || cacheKey") &&
    resultsSource.includes("catalogSnapshot: needsPetType.catalogSnapshot || catalogSnapshot"),
  "search species confirmation must preserve the validated catalog snapshot so it does not re-query product_data"
);

console.log("pet-food species guard passed");
