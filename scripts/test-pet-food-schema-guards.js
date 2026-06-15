#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const edgeSource = fs.readFileSync(path.join(root, "supabase/functions/analyze/index.ts"), "utf8");
const claudeSource = fs.readFileSync(path.join(root, "services/claude.js"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const cacheSource = fs.readFileSync(path.join(root, "services/cache.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`pet-food schema guard failed: ${message}`);
    process.exit(1);
  }
}

for (const source of [edgeSource, claudeSource, analysisSource]) {
  assert(
    source.includes("missing ingredients") &&
      source.includes("missing categories") &&
      source.includes("missing nutritionAnalysis") &&
      source.includes("missing verdict") &&
      source.includes("missing recallHistory"),
    "pet-food validators must require rich result fields, not just productName and overallScore"
  );
}

assert(
  edgeSource.includes("function petFoodAnalysisValidationError") &&
    /function isValidAnalysis\(obj: any\): boolean \{[\s\S]{0,120}petFoodAnalysisValidationError\(obj\) === null/.test(edgeSource),
  "Edge isValidAnalysis must be backed by the pet-food schema validator"
);

assert(
  edgeSource.includes("function hasUsablePublishedNutrientPanel") &&
    edgeSource.includes('rawProduct.hasPublishedNutrients !== true') &&
    edgeSource.includes('["as-fed", "dry-matter"].includes') &&
    edgeSource.includes("return numericCount >= 2") &&
    edgeSource.indexOf("function normalizeAnalysis(obj: any, sourceProduct: any = null): any") <
      edgeSource.indexOf("hasUsablePublishedNutrientPanel(sourceProduct)") &&
    edgeSource.indexOf("hasUsablePublishedNutrientPanel(sourceProduct)") <
      edgeSource.indexOf('obj.nutrientDataCompleteness = "complete"') &&
    (edgeSource.match(/normalizeAnalysis\(analysis, opffProduct\)/g) || []).length >= 2,
  "Edge normalization must force complete nutrientDataCompleteness only from usable published nutrient panels on both response paths"
);

assert(
  edgeSource.includes('if (!["dog", "cat"].includes(obj.petType))') &&
    !edgeSource.includes('["dog", "cat", "unknown"].includes(obj.petType)') &&
    claudeSource.includes('if (!["dog", "cat"].includes(obj.petType))') &&
    cacheSource.includes('if (!["dog", "cat"].includes(analysis.petType)) return false') &&
    analysisSource.includes("if (!PET_TYPES.has(result.petType))"),
  "pet-food analysis validators must reject unknown petType consistently before cache replay or writes"
);

assert(
  /const cachedSchemaValid = mode === "human_food"[\s\S]{0,180}isValidAnalysis\(cached\?\.analysis\)[\s\S]{0,180}cachedVersion >= ANALYSIS_SCHEMA_VERSION && cachedSchemaValid/.test(edgeSource),
  "Edge pre-call cache hits must require schema-valid cached analyses"
);

assert(
  /Non-stream pet-food schema reject/.test(edgeSource) &&
    /return jsonResponse\(\{ error: "Incomplete pet-food analysis response\. Please try again\." \}, 502\)/.test(edgeSource),
  "non-streaming pet-food schema failures must return a retryable 502 error"
);

assert(
  claudeSource.includes("function petFoodValidationError") &&
    /return petFoodValidationError\(obj\);/.test(claudeSource) &&
    /const validationError = completionValidationError\(mode, parsed\);[\s\S]{0,120}Incomplete Claude response/.test(claudeSource),
  "Claude client must reject incomplete streamed and non-streamed pet-food results"
);

assert(
  analysisSource.includes("function _validatePetFoodResult") &&
    /return _validatePetFoodResult\(result\);/.test(analysisSource) &&
    /async function _saveLocalResult[\s\S]{0,260}_validateAnyCompletedResult\(analysis\)[\s\S]{0,220}_localResultFingerprint\(analysis, dataSource, opffData\)[\s\S]{0,260}_rememberLocalResultMemory\(normalizedCacheKey, \{ analysis, dataSource, opffData, savedAt \}, savedAt, fingerprint\);[\s\S]{0,180}Skipped duplicate local result write[\s\S]{0,100}await Promise\.resolve\(\);[\s\S]{0,180}AsyncStorage\.setItem/.test(analysisSource) &&
    /async function _saveLocalResultCopies[\s\S]{0,260}_validateAnyCompletedResult\(analysis\)[\s\S]{0,220}_localResultFingerprint\(analysis, dataSource, opffData\)[\s\S]{0,360}_rememberLocalResultMemory\(key, \{ analysis, dataSource, opffData, savedAt \}, savedAt, fingerprint\);[\s\S]{0,180}Skipped duplicate local result copy writes[\s\S]{0,100}await Promise\.resolve\(\);[\s\S]{0,180}AsyncStorage\.multiSet/.test(analysisSource) &&
    (() => {
      const start = analysisSource.indexOf("function _saveHistory");
      const body = analysisSource.slice(start, analysisSource.indexOf("\n}", start) + 2);
      const validateIndex = body.indexOf("_validateCompletedResult(state.result, state.mode)");
      const entryIndex = body.indexOf("const entry = {");
      const queuedIndex = body.indexOf("state.historySaveQueued = true;");
      const addIndex = body.indexOf(".then(() => addHistoryEntry(entry))");
      return start !== -1 &&
        validateIndex !== -1 &&
        entryIndex !== -1 &&
        queuedIndex !== -1 &&
        addIndex !== -1 &&
        validateIndex < entryIndex &&
        entryIndex < queuedIndex &&
        queuedIndex < addIndex;
    })(),
  "analysis service must defer best-effort persistence, synchronously queue history once, and use the pet-food schema before local cache and history writes"
);

assert(
  cacheSource.includes("function _isUsableCachedAnalysis(analysis)") &&
    /if \(!_isUsableCachedAnalysis\(row\.analysis\)\)/.test(cacheSource) &&
    /if \(!_isUsableCachedAnalysis\(data\.analysis\)\)/.test(cacheSource),
  "shared analysis-cache reads and prewarm must reject malformed pet-food analyses"
);

assert(
  edgeSource.includes('"Protein Quality"') &&
    edgeSource.includes('"Manufacturer Track Record"') &&
    claudeSource.includes("PET_CATEGORY_NAMES_V2") &&
    analysisSource.includes("PET_CATEGORY_NAMES_V2") &&
    cacheSource.includes("PET_CATEGORY_NAMES_V2"),
  "pet-food schema must enforce the v2 seven-category rubric"
);

console.log("pet-food schema guard passed");
