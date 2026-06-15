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
    console.error(`product lookup security guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  lookupSource.includes("AUTH_PRODUCT_LOOKUP_RATE_LIMIT_PER_HOUR") &&
    lookupSource.includes("user-product-lookup:${authenticatedUserId}") &&
    lookupSource.includes("Product lookup rate limit exceeded"),
  "authenticated product lookups must have a dedicated hourly rate limit"
);

assert(
  lookupSource.includes("if (token === supabaseServiceKey)") &&
    lookupSource.includes("isServiceRole = true"),
  "service-role bypass must require the exact configured service-role key"
);

assert(
  !lookupSource.includes("payload.role === \"service_role\"") &&
    !lookupSource.includes("payload.role === 'service_role'") &&
    !lookupSource.includes("atob(token.split"),
  "product lookup must not trust decoded JWT payload role without verification"
);

assert(
  lookupSource.includes("Authenticated rate limit check failed") &&
    lookupSource.includes("Rate limit unavailable. Please try again."),
  "authenticated product lookup rate-limit failures must fail closed"
);

assert(
  lookupSource.includes("MAX_PRODUCT_LOOKUP_NAME_LENGTH") &&
    lookupSource.includes("productName too long (max 200 chars)") &&
    lookupSource.includes("const productName = typeof body.productName === \"string\" ? body.productName.trim() : \"\""),
  "productName must be trimmed and length-clamped before lookup or scraping"
);

assert(
  lookupSource.includes("MAX_LOOKUP_BRAND_LENGTH") &&
    lookupSource.includes("brand too long (max 100 chars)") &&
    lookupSource.includes("const brand =") &&
    lookupSource.includes("body.brand.trim()"),
  "brand must be normalized and length-clamped before lookup or scraping"
);

assert(
  lookupSource.includes("MAX_LOOKUP_SEARCH_TERMS = 8") &&
    lookupSource.includes("MAX_LOOKUP_SEARCH_TERM_LENGTH = 220") &&
    lookupSource.includes("searchTerms.slice(0, MAX_LOOKUP_SEARCH_TERMS)") &&
    lookupSource.includes("trimmed.length > MAX_LOOKUP_SEARCH_TERM_LENGTH") &&
    lookupSource.includes("collectLookupCacheKeys(productName, brand, searchTerms)") &&
    !lookupSource.includes("searchAmazon(term") &&
    !lookupSource.includes("searchOPFF(term"),
  "searchTerms must be bounded and used for cache-key alias reads, not unbounded external lookup fanout"
);

console.log("product lookup security guard passed");
