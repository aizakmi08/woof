#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/026_cleanup_product_display_text.sql"),
  "utf8"
);
const lookupSource = fs.readFileSync(
  path.join(root, "supabase/functions/product-lookup/index.ts"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    console.error(`catalog cleanup guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  migration.includes("UPDATE public.product_data") &&
    migration.includes("product_name_clean") &&
    migration.includes("brand_clean"),
  "catalog cleanup migration must update product_data product and brand display fields"
);

for (const token of ["&amp;", "&quot;", "&#39;", "&#039;", "&apos;", "&ndash;", "&mdash;", "&reg;", "&trade;"]) {
  assert(migration.includes(token), `catalog cleanup migration must decode or strip ${token}`);
}

assert(
  migration.includes(String.raw`'^\s*(brand|product)\s*:\s*'`) &&
    migration.includes(String.raw`'^\s*brand\s*:\s*'`),
  "catalog cleanup migration must strip scraped Brand:/Product: prefixes"
);

assert(
  lookupSource.includes("function cleanDisplayText") &&
    lookupSource.includes(".replace(/&amp;/gi, \"&\")") &&
    lookupSource.includes(".replace(/^\\s*(?:brand|product)\\s*:\\s*/i, \"\")"),
  "product lookup must sanitize scraped display text before returning or writing rows"
);

assert(
  /const displayProductName = cleanDisplayText\(best\.productName \|\| productName\)/.test(lookupSource) &&
    /const displayBrand = cleanDisplayText\(best\.brand \|\| brand \|\| ""\) \|\| null/.test(lookupSource),
  "product lookup must derive sanitized product and brand values"
);

assert(
  /product_name: displayProductName/.test(lookupSource) &&
    /brand: displayBrand/.test(lookupSource) &&
    /productName: displayProductName/.test(lookupSource),
  "product lookup must use sanitized display values for cache writes and responses"
);

console.log("catalog cleanup guard passed");
