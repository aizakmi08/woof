#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const lookupSource = fs.readFileSync(
  path.join(root, "supabase/functions/product-lookup/index.ts"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    console.error(`product lookup match guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  /function validateProductMatch\([\s\S]*requestedName: string[\s\S]*requestedBrand: string \| null[\s\S]*petType: "dog" \| "cat"/.test(lookupSource),
  "product lookup must have a shared title/brand/species match validator"
);

assert(
  lookupSource.includes("hasPetTypeConflict(searchable, petType)") &&
    lookupSource.includes("rejected pet-type mismatch"),
  "match validator must reject dog/cat result mismatches"
);

assert(
  lookupSource.includes("rejected brand mismatch") &&
    lookupSource.includes("rejected title mismatch") &&
    lookupSource.includes("rejected flavor mismatch"),
  "match validator must check brand, title tokens, and requested flavor"
);

for (const source of ["chewy", "amazon"]) {
  const pattern = new RegExp(
    `source: "${source}"[\\s\\S]{0,700}validateProductMatch\\(result, productName, brand, petType\\)[\\s\\S]{0,140}return \\{ found: false, source: "${source}" \\}`
  );
  assert(
    pattern.test(lookupSource),
    `${source} lookup must validate product match before returning a positive result`
  );
}

assert(
  /for \(const result of candidates\)[\s\S]{0,260}validateProductMatch\(result, productName, brand, petType\)[\s\S]{0,120}continue;[\s\S]{0,160}return result;/.test(lookupSource),
  "opff lookup must validate each candidate before returning a positive result"
);

assert(
  /searchOPFF\(productName, brand, petType(?:, req\.signal)?\)/.test(lookupSource),
  "OPFF lookup must receive petType for dog/cat mismatch validation"
);

assert(
  lookupSource.includes("function normalizeBarcode(value: unknown): string") &&
    lookupSource.includes("const barcode = normalizeBarcode(body.barcode)") &&
    lookupSource.includes("async function searchOPFFBarcode(") &&
    lookupSource.includes("api/v2/product/${encodeURIComponent(barcode)}.json") &&
    lookupSource.includes("validateProductMatch(result, productName, brand, petType)") &&
    lookupSource.includes("const barcodeResult = await searchOPFFBarcode(barcode, productName, brand, petType, req.signal)") &&
    lookupSource.includes("best = pickBestResult([barcodeResult], productName)") &&
    lookupSource.includes("if (!best && scrapingBeeKey)") &&
    lookupSource.includes("barcode: best.barcode || barcode || null"),
  "product-lookup must prefer exact OPFF barcode ingredient lookup before broader name searches"
);

assert(
  lookupSource.includes("(r) => r.found && r.ingredients && r.ingredients.length >= 5") &&
    !lookupSource.includes("r.ingredients.length >= 10"),
  "product-lookup result picking must align with the 5+ plausible ingredient cache/write contract"
);

console.log("product lookup match guard passed");
