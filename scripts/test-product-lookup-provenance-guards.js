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
    console.error(`product lookup provenance guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  lookupSource.includes("servedFromCache?: boolean"),
  "ProductResult must expose servedFromCache separately from source provenance"
);

assert(
  lookupSource.includes("function collectLookupCacheKeys(") &&
    lookupSource.includes("const lookupCacheKeys = collectLookupCacheKeys(productName, brand, searchTerms)") &&
    /\.in\("cache_key", lookupCacheKeys\)[\s\S]{0,180}\.order\("ingredient_count", \{ ascending: false \}\)[\s\S]{0,120}\.order\("updated_at", \{ ascending: false \}\)[\s\S]{0,100}\.limit\(Math\.min\(lookupCacheKeys\.length \* 5, 25\)\)/.test(lookupSource) &&
    /for \(const cached of cachedRows \|\| \[\]\)[\s\S]{0,220}const cachedIngredients = Array\.isArray\(cached\?\.ingredients\) \? cached\.ingredients : \[\];[\s\S]{0,120}const cleanCachedIngredients = sanitizeIngredientList\(cachedIngredients\);[\s\S]{0,140}cleanCachedIngredients\.length >= 5 && isPlausibleIngredientList\(cachedIngredients\)/.test(lookupSource) &&
    lookupSource.includes("const cachedResult: ProductResult = {") &&
    lookupSource.includes('source: cached.source || "cache"') &&
    lookupSource.includes("servedFromCache: true") &&
    lookupSource.includes("const hitCacheKey = cached.cache_key || cacheKey") &&
    lookupSource.includes("cacheKey: hitCacheKey") &&
    /validateProductMatch\(cachedResult, productName, brand, petType\)[\s\S]{0,160}Rejecting cached row — product match failed[\s\S]{0,80}continue;/.test(lookupSource) &&
    !lookupSource.includes(".maybeSingle()"),
  "product-lookup cache hits must scan bounded primary/searchTerm alias candidates, sanitize ingredients, validate product match, preserve cached.source, return the persisted cache key, and mark servedFromCache separately"
);

assert(
  lookupSource.includes("Rejecting cached row — ingredient list failed plausibility check") &&
    /Rejecting cached row[\s\S]{0,160}continue;/.test(lookupSource),
  "product-lookup must reject implausible cached product_data rows and continue to the next candidate or fresh lookup"
);

assert(
  lookupSource.includes("function normalizeCatalogNameForQuality") &&
    lookupSource.includes("function isLikelyNonProductCatalogRow") &&
    lookupSource.includes("ingredients? (?:amp |and )?nutritional value") &&
    lookupSource.includes("ingredients? guide") &&
    lookupSource.includes("(?:dog|cat|pet) (?:food|treat) trends?") &&
    lookupSource.includes("Rejecting cached row — non-product catalog page") &&
    lookupSource.includes("Rejecting result — non-product catalog page") &&
    lookupSource.includes('reason: "non_product_catalog_page"'),
  "product-lookup must reject obvious content/article pages before returning or writing product_data rows"
);

assert(
  !/source:\s*"cache"/.test(lookupSource),
  "product-lookup must not overwrite provenance with source: \"cache\""
);

assert(
  /imageUrl: cached\.image_url \|\| null/.test(lookupSource) &&
    /image_url: best\.imageUrl \|\| null/.test(lookupSource),
  "product-lookup must persist and return image_url consistently"
);

assert(
  /source_url: best\.sourceUrl \|\| null/.test(lookupSource) &&
    /sourceUrl: cached\.source_url/.test(lookupSource),
  "product-lookup must preserve source URL on fresh writes and cache hits"
);

assert(
  /return jsonResponse\(\{[\s\S]{0,220}servedFromCache: true,[\s\S]{0,120}cacheKey: hitCacheKey,[\s\S]{0,160}productName: cachedResult\.productName/.test(lookupSource) &&
    /return \{[\s\S]{0,120}found: true,[\s\S]{0,80}source: best\.source,[\s\S]{0,80}cacheKey,[\s\S]{0,120}productName: displayProductName/.test(lookupSource),
  "product-lookup responses must expose the persisted cacheKey for cache hits and fresh writes"
);

assert(
  /function sanitizeIngredientList\(items: unknown\[\]\): string\[\][\s\S]{0,360}\.filter\(isPlausibleIngredient\)/.test(lookupSource),
  "product-lookup must keep one sanitizer for ingredient arrays before persisting or returning them"
);

assert(
  /const cleanIngredients = sanitizeIngredientList\(best\.ingredients \|\| \[\]\);[\s\S]{0,80}const cleanIngredientText = cleanIngredients\.join\(", "\);[\s\S]{0,220}cleanIngredients\.length < 5 \|\| !isPlausibleIngredientList\(best\.ingredients \|\| \[\]\)/.test(lookupSource) &&
    /ingredients: cleanIngredients,[\s\S]{0,80}ingredient_text: cleanIngredientText,[\s\S]{0,80}ingredient_count: cleanIngredients\.length/.test(lookupSource) &&
    /ingredients: cleanIngredients,[\s\S]{0,80}ingredientText: cleanIngredientText,[\s\S]{0,80}ingredientCount: cleanIngredients\.length/.test(lookupSource),
  "fresh product-lookup writes and responses must use the sanitized ingredient array, derived text, and derived count"
);

console.log("product lookup provenance guard passed");
