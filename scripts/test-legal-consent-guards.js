#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const consentSource = fs.readFileSync(path.join(root, "services/legalConsent.js"), "utf8");
const searchHandlerStart = homeSource.indexOf("const handleSearchResultPress = useCallback");
const searchHandlerEnd = homeSource.indexOf("const loadHistory = useCallback", searchHandlerStart);
const searchHandlerBlock = homeSource.slice(searchHandlerStart, searchHandlerEnd);

function assert(condition, message) {
  if (!condition) {
    console.error(`legal consent guard failed: ${message}`);
    process.exit(1);
  }
}

function includesInOrder(source, terms) {
  let cursor = 0;
  for (const term of terms) {
    const idx = source.indexOf(term, cursor);
    if (idx < 0) return false;
    cursor = idx + term.length;
  }
  return true;
}

assert(
  consentSource.includes('LEGAL_CONSENT_VERSION = "2026-06-08"') &&
    consentSource.includes("@woof_legal_consent_") &&
    consentSource.includes("hasAcceptedLegalConsent") &&
    consentSource.includes("acceptLegalConsent"),
  "legal consent service must persist a dated acceptance version"
);

assert(
  homeSource.includes("hasAcceptedLegalConsent") &&
    homeSource.includes("acceptLegalConsent") &&
    homeSource.includes("runWithLegalConsent"),
  "Home must load and enforce legal consent before protected actions"
);

for (const action of [
  "navigation.navigate(\"Scanner\")",
  "navigation.navigate(\"Results\", {",
  "navigation.navigate(\"Results\", {\n        mode: \"human_food\"",
  "navigation.navigate(\"Scanner\", { mode: \"human_food\"",
]) {
  const idx = homeSource.indexOf(action);
  assert(idx >= 0, `expected protected action not found: ${action}`);
  const before = homeSource.slice(Math.max(0, idx - 3600), idx);
  assert(
    before.includes("runWithLegalConsent(() => {"),
    `protected action must be wrapped in runWithLegalConsent: ${action}`
  );
}

assert(
  searchHandlerStart >= 0 &&
    searchHandlerEnd > searchHandlerStart &&
    includesInOrder(searchHandlerBlock, [
      "runWithLegalConsent(() => {",
      "if (!canScan())",
      "let catalogSnapshot = buildSearchRowCatalogSnapshot(item, cacheKey);",
      "let validation = validationFromCatalogSnapshot(catalogSnapshot);",
      "if (!validation) {",
      "const validationCtl = new AbortController();",
      "validation = await getProductDataByCacheKey(cacheKey, {",
      "signal: validationCtl.signal",
      "if (validationCtl.signal.aborted)",
      "handleRejectedValidation(validation)",
      "catalogSnapshot = catalogSnapshot || buildCatalogSnapshot(validation, validatedCacheKey);",
      "analysisService.startAnalysis({",
      'navigation.navigate("Results", {',
      'mode: "search"',
    ]) &&
    !searchHandlerBlock.includes("initialValidation") &&
    !searchHandlerBlock.includes("finalValidation") &&
    /}, \[canScan, navigation, clearSearch, recordRecentSearch, runWithLegalConsent, releaseSearchTap, isPro\]\);/.test(homeSource),
  "search Results navigation must remain protected and validate the selected row only after consent and quota checks"
);

assert(
  homeSource.includes("Before your first check") &&
    homeSource.includes("Agree and Continue") &&
    homeSource.includes("Terms") &&
    homeSource.includes("Privacy Policy") &&
    homeSource.includes("legalDocument") &&
    homeSource.includes("<WebView"),
  "Home must present an explicit consent modal with readable Terms and Privacy"
);

assert(
  /if \(!canCheckHumanFood\(\)\) \{[\s\S]{0,120}human_food_limit/.test(homeSource) &&
    /if \(!canCheckHumanFood\(\)\) \{[\s\S]{0,140}human_food_limit[\s\S]{0,80}return;[\s\S]{0,120}\}\s*try \{[\s\S]{0,120}analysisService\.startAnalysis\(\{[\s\S]{0,120}mode: "human_food",[\s\S]{0,120}foodName: text,[\s\S]{0,80}petType: safetyPetType,[\s\S]{0,80}isPro,[\s\S]{0,160}\}\);[\s\S]{0,160}Background text analysis start failed[\s\S]{0,120}navigation\.navigate\("Results", \{[\s\S]{0,80}mode: "human_food"/.test(homeSource) &&
    /}, \[safetyFoodText, safetyPetType, canCheckHumanFood, navigation, closeSafetyModal, runWithLegalConsent, isPro\]\);/.test(homeSource) &&
    !/Is This Safe for My Pet\?[\s\S]{0,420}!canScan\(\)/.test(homeSource),
  "human-food text entry must use human-food quota and pre-start analysis before Results navigation"
);

console.log("legal consent guard passed");
