#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analysisService = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const cacheService = fs.readFileSync(path.join(root, "services/cache.js"), "utf8");
const analyzeEdge = fs.readFileSync(
  path.join(root, "supabase/functions/analyze/index.ts"),
  "utf8"
);
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const nonStreamCompletionBlock = analyzeEdge.slice(
  analyzeEdge.indexOf("// Non-streaming: parse response, cache, then return to client"),
  analyzeEdge.indexOf("// For identify mode, return the reconstructed content with prefill")
);

function assert(condition, message) {
  if (!condition) {
    console.error(`user OCR ingestion guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  !analysisService.includes("saveProductData") &&
    analysisService.includes('const sourceMeta = _ingredientSourceMeta("user_ocr")') &&
    analysisService.includes("source: sourceMeta.source") &&
    analysisService.includes("sourceTrustLevel: sourceMeta.trustLevel") &&
    analysisService.includes("ingredients: ingredientArray"),
  "OCR recovery must send user_ocr provenance to Edge instead of calling a client catalog-write helper"
);

assert(
  cacheService.includes('if (source === "user_ocr")') &&
    cacheService.includes("Skipped direct user OCR catalog write"),
  "direct client user_ocr writes to shared product_data must remain disabled"
);

assert(
  analyzeEdge.includes('"source"') &&
    analyzeEdge.includes("saveTrustedUserOcrProductData") &&
    analyzeEdge.includes("const safeProduct = sanitizeOpffProduct(opffProduct)") &&
    analyzeEdge.includes('safeProduct.source !== "user_ocr"') &&
    analyzeEdge.includes("sanitizeIngredientListForCatalog") &&
    analyzeEdge.includes('supabase.rpc("save_product_data"') &&
    analyzeEdge.includes('p_source: "user_ocr"') &&
    analyzeEdge.includes('logAuditEvent("user_ocr_catalog_ingestion"'),
  "Edge must own the trusted user OCR product_data write through sanitized service-role RPC input"
);

assert(
  analyzeEdge.includes('outcome: "saved"') &&
    analyzeEdge.includes('outcome: "skipped"') &&
    analyzeEdge.includes("ingredientCount: ingredients.length") &&
    !/user_ocr_catalog_ingestion[\s\S]{0,500}(productName|resolvedKey|ingredientText),/.test(analyzeEdge),
  "user OCR ingestion audit markers must be outcome-focused and avoid product names, cache keys, and raw ingredient text"
);

assert(
  /if \(isValid\) \{[\s\S]{0,500}if \(mode === "verified"\) \{[\s\S]{0,160}saveTrustedUserOcrProductData[\s\S]{0,260}writeToCache/.test(
    analyzeEdge
  ),
  "trusted user OCR product_data saves must happen only after schema-valid verified analysis"
);

assert(
  nonStreamCompletionBlock.includes('runBackgroundTask(\n          "Non-stream user OCR catalog save"') &&
    nonStreamCompletionBlock.includes("saveTrustedUserOcrProductData(supabase, analysis!, opffProduct, cacheKey),") &&
    !nonStreamCompletionBlock.includes("await saveTrustedUserOcrProductData"),
  "non-stream verified OCR responses must register best-effort catalog ingestion as a background task instead of waiting on it"
);

assert(
  packageJson.includes('"test:user-ocr-ingestion": "node scripts/test-user-ocr-ingestion-guards.js"') &&
    packageJson.includes("npm run test:user-ocr-ingestion"),
  "user OCR ingestion guard must be wired into package scripts"
);

console.log("user OCR ingestion guard passed");
