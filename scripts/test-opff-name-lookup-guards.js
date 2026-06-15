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
    console.error(`OPFF name lookup guard failed: ${message}`);
    process.exit(1);
  }
}

const start = lookupSource.indexOf("async function searchOPFF");
const end = lookupSource.indexOf("// ── Pick Best Result", start);
assert(start !== -1 && end !== -1, "searchOPFF function must be present");

const opffSource = lookupSource.slice(start, end);

assert(
  /const candidates: ProductResult\[\] = data\.products[\s\S]{0,120}\.map\(\(product: any\)/.test(opffSource) &&
    /\.filter\(\(candidate: ProductResult \| null\): candidate is ProductResult => Boolean\(candidate\)\)/.test(opffSource),
  "OPFF must build typed candidates from all returned products"
);

assert(
  !/data\.products\.find\([\s\S]{0,220}\)\s*\|\|\s*data\.products\[0\]/.test(opffSource),
  "OPFF must not select the first ingredient-bearing result without validating alternatives"
);

assert(
  opffSource.includes("product.categories") &&
    opffSource.includes("product.categories_tags") &&
    opffSource.includes("product.labels_tags") &&
    opffSource.includes("product._keywords") &&
    opffSource.includes("matchText"),
  "OPFF candidates must include category/tag metadata in match text"
);

assert(
  /for \(const result of candidates\)[\s\S]{0,260}validateProductMatch\(result, productName, brand, petType\)[\s\S]{0,120}continue;[\s\S]{0,160}return result;/.test(opffSource),
  "OPFF must validate each candidate before returning a positive match"
);

assert(
  /const searchable = normalizeMatchText\([\s\S]{0,160}result\.matchText/.test(lookupSource),
  "shared product matcher must include source-specific matchText"
);

assert(
  /sourceUrl: product\.code[\s\S]{0,90}\?[\s\S]{0,140}: undefined/.test(opffSource),
  "OPFF sourceUrl must not publish an undefined barcode URL"
);

console.log("OPFF name lookup guard passed");
