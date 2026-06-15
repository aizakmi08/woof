#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/031_harden_search_catalog_quality.sql"),
  "utf8"
);
const cleanMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/032_align_search_with_clean_ingredients.sql"),
  "utf8"
);
const writeRpcMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/034_harden_product_data_write_rpcs.sql"),
  "utf8"
);
const tableContractMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/035_enforce_product_data_ingredient_contract.sql"),
  "utf8"
);
const allUpdateContractMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/036_product_data_contract_all_updates.sql"),
  "utf8"
);
const searchSnapshotMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/046_search_products_with_catalog_snapshot.sql"),
  "utf8"
);
const brandOnlyCatalogMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/047_reject_brand_only_catalog_rows.sql"),
  "utf8"
);
const optimizedSearchSnapshotMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/048_reoptimize_search_products_snapshot.sql"),
  "utf8"
);
const cacheSource = fs.readFileSync(path.join(root, "services/cache.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`search catalog quality guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  migration.includes("UPDATE public.product_data") &&
    migration.includes("ingredient_count = COALESCE(array_length(ingredients, 1), 0)") &&
    migration.includes("ingredient_count IS DISTINCT FROM COALESCE(array_length(ingredients, 1), 0)"),
  "migration must repair stale ingredient_count values from the actual ingredients array"
);

assert(
  migration.includes("DELETE FROM public.product_data") &&
    migration.includes("ILIKE '%mailto:%'") &&
    migration.includes("ILIKE '%legalLinks%'") &&
    migration.includes("~ 'https?://'") &&
    migration.includes("FROM unnest(pd.ingredients)"),
  "migration must remove historical page-chrome/junk ingredient rows"
);

assert(
  /CREATE OR REPLACE FUNCTION public\.search_products/.test(migration) &&
    migration.includes("COALESCE(array_length(pd.ingredients, 1), 0) >= 5") &&
    migration.includes("COALESCE(array_length(pd.ingredients, 1), 0)::INT AS ingredient_count") &&
    migration.includes("NOT EXISTS") &&
    migration.includes("FROM unnest(pd.ingredients)") &&
    !/WHERE pd\.ingredient_count >= 5/.test(migration),
  "search_products must return only rows with at least 5 actual non-junk ingredients"
);

assert(
  cleanMigration.includes("CREATE OR REPLACE FUNCTION public.is_plausible_product_ingredient") &&
    cleanMigration.includes("UPDATE public.product_data") &&
    cleanMigration.includes("public.is_plausible_product_ingredient(ingredient.value)") &&
    cleanMigration.includes("ingredient_count = COALESCE(array_length(cleaned.clean_ingredients, 1), 0)") &&
    cleanMigration.includes("DELETE FROM public.product_data") &&
    cleanMigration.includes("COALESCE(array_length(pd.ingredients, 1), 0) < 5"),
  "latest migration must sanitize product_data ingredients and remove rows the client cannot analyze"
);

assert(
  /CREATE OR REPLACE FUNCTION public\.search_products/.test(cleanMigration) &&
    cleanMigration.includes("clean_ingredients") &&
    cleanMigration.includes("clean_ingredient_count") &&
    cleanMigration.includes("COALESCE(array_length(c.clean_ingredients, 1), 0) >= 5") &&
    cleanMigration.includes("r.clean_ingredient_count AS ingredient_count") &&
    cleanMigration.includes("ORDER BY r.rank DESC, r.clean_ingredient_count DESC"),
  "search_products must rank and return rows by sanitized ingredient count, not raw array length"
);

assert(
  cacheSource.includes("function _normalizeUsableRow(data)") &&
    /return \(normalized\.ingredients\?\.length \|\| 0\) >= 5 \? normalized : null;/.test(cacheSource) &&
    cacheSource.includes("return best.normalized;"),
  "client product_data lookups must reject rows after ingredient sanitization"
);

assert(
  /function _sanitizeIngredients\(list\) \{[\s\S]{0,180}\.map\(\(item\) => item\.trim\(\)\)[\s\S]{0,80}\.filter\(_isPlausibleIngredient\)/.test(cacheSource) &&
    /const cleanedIngredients = _sanitizeIngredients\(data\.ingredients\);[\s\S]{0,80}const cleanedText = cleanedIngredients\.join\(", "\);/.test(cacheSource) &&
    /ingredients: cleanedIngredients,[\s\S]{0,80}ingredientText: cleanedText,[\s\S]{0,80}ingredientCount: cleanedIngredients\.length/.test(cacheSource) &&
    !/ingredientText: data\.ingredient_text/.test(cacheSource),
  "client product_data normalization must derive ingredient text and count from the sanitized ingredient array"
);

assert(
  migration.includes("REVOKE ALL ON FUNCTION public.search_products(TEXT, INT)") &&
    cleanMigration.includes("REVOKE ALL ON FUNCTION public.search_products(TEXT, INT)") &&
    cleanMigration.includes("GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INT)") &&
    migration.includes("TO anon, authenticated"),
  "search_products permissions must remain explicit after replacement"
);

assert(
  /CREATE OR REPLACE FUNCTION public\.save_product_data/.test(writeRpcMigration) &&
    /CREATE OR REPLACE FUNCTION public\.save_product_data_with_nutrients/.test(writeRpcMigration) &&
    writeRpcMigration.includes("public.is_plausible_product_ingredient(ingredient.value)") &&
    writeRpcMigration.includes("clean_ingredient_text := array_to_string(clean_ingredients, ', ')") &&
    writeRpcMigration.includes("clean_ingredient_count := COALESCE(array_length(clean_ingredients, 1), 0)") &&
    writeRpcMigration.includes("clean_ingredient_count < 5") &&
    writeRpcMigration.includes("clean_ingredients") &&
    writeRpcMigration.includes("clean_ingredient_text") &&
    writeRpcMigration.includes("clean_ingredient_count") &&
    !/VALUES \([\s\S]{0,260}p_ingredient_text[\s\S]{0,120}p_ingredient_count/.test(writeRpcMigration),
  "product_data write RPCs must sanitize ingredients and derive text/count inside the database"
);

assert(
  writeRpcMigration.includes("REVOKE ALL ON FUNCTION public.save_product_data(TEXT, TEXT, TEXT, TEXT[], TEXT, INTEGER, TEXT, TEXT)") &&
    writeRpcMigration.includes("GRANT EXECUTE ON FUNCTION public.save_product_data(TEXT, TEXT, TEXT, TEXT[], TEXT, INTEGER, TEXT, TEXT)") &&
    writeRpcMigration.includes("TO service_role") &&
    writeRpcMigration.includes("REVOKE ALL ON FUNCTION public.save_product_data_with_nutrients(TEXT, TEXT, TEXT, TEXT[], TEXT, INT, TEXT, TEXT, JSONB)") &&
    writeRpcMigration.includes("GRANT EXECUTE ON FUNCTION public.save_product_data_with_nutrients(TEXT, TEXT, TEXT, TEXT[], TEXT, INT, TEXT, TEXT, JSONB)"),
  "hardened product_data write RPC permissions must remain service-role only"
);

assert(
  /CREATE OR REPLACE FUNCTION public\.enforce_product_data_ingredient_contract/.test(tableContractMigration) &&
    tableContractMigration.includes("public.is_plausible_product_ingredient(ingredient.value)") &&
    tableContractMigration.includes("clean_ingredient_count < 5") &&
    tableContractMigration.includes("NEW.ingredients := clean_ingredients") &&
    tableContractMigration.includes("NEW.ingredient_text := array_to_string(clean_ingredients, ', ')") &&
    tableContractMigration.includes("NEW.ingredient_count := clean_ingredient_count") &&
    tableContractMigration.includes("CREATE TRIGGER trg_product_data_ingredient_contract") &&
    tableContractMigration.includes("BEFORE INSERT OR UPDATE OF ingredients, ingredient_text, ingredient_count") &&
    tableContractMigration.includes("ON public.product_data"),
  "product_data table must enforce the sanitized ingredient/count contract for direct inserts and upserts"
);

assert(
  allUpdateContractMigration.includes("DROP TRIGGER IF EXISTS trg_product_data_ingredient_contract") &&
    allUpdateContractMigration.includes("CREATE TRIGGER trg_product_data_ingredient_contract") &&
    allUpdateContractMigration.includes("BEFORE INSERT OR UPDATE") &&
    !allUpdateContractMigration.includes("UPDATE OF ingredients, ingredient_text, ingredient_count") &&
    allUpdateContractMigration.includes("EXECUTE FUNCTION public.enforce_product_data_ingredient_contract()"),
  "product_data ingredient contract trigger must run on every direct update, not only ingredient-column updates"
);

assert(
  searchSnapshotMigration.includes("DROP FUNCTION IF EXISTS public.search_products(TEXT, INT)") &&
    searchSnapshotMigration.includes("ingredients TEXT[]") &&
    searchSnapshotMigration.includes("ingredient_text TEXT") &&
    searchSnapshotMigration.includes("nutritional_info JSONB") &&
    searchSnapshotMigration.includes("nutrient_panel JSONB") &&
    searchSnapshotMigration.includes("has_published_nutrients BOOLEAN") &&
    searchSnapshotMigration.includes("source_url TEXT") &&
    searchSnapshotMigration.includes("public.is_plausible_product_ingredient(ingredient.value)") &&
    searchSnapshotMigration.includes("r.clean_ingredients AS ingredients") &&
    searchSnapshotMigration.includes("array_to_string(r.clean_ingredients, ', ') AS ingredient_text") &&
    searchSnapshotMigration.includes("COALESCE(r.has_published_nutrients, FALSE) AS has_published_nutrients") &&
    searchSnapshotMigration.includes("COALESCE(array_length(c.clean_ingredients, 1), 0) >= 5") &&
    searchSnapshotMigration.includes("ORDER BY r.rank DESC, r.clean_ingredient_count DESC") &&
    searchSnapshotMigration.includes("GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INT)") &&
    searchSnapshotMigration.includes("TO anon, authenticated") &&
    searchSnapshotMigration.includes("NOTIFY pgrst, 'reload schema'"),
  "search_products must return a sanitized catalog snapshot so Home can skip duplicate product_data reads only for analysis-ready rows"
);

assert(
  brandOnlyCatalogMigration.includes("CREATE OR REPLACE FUNCTION public.is_likely_non_product_catalog_row") &&
    brandOnlyCatalogMigration.includes("product_name IN (brand, brand || ' ' || brand)") &&
    brandOnlyCatalogMigration.includes("DELETE FROM public.product_data") &&
    brandOnlyCatalogMigration.includes("public.is_likely_non_product_catalog_row(product_name, brand)") &&
    brandOnlyCatalogMigration.includes("IF NEW.image_url ILIKE 'data:%' THEN") &&
    brandOnlyCatalogMigration.includes("NEW.image_url := NULL") &&
    brandOnlyCatalogMigration.includes("UPDATE public.product_data") &&
    brandOnlyCatalogMigration.includes("SET image_url = NULL") &&
    brandOnlyCatalogMigration.includes("WHERE image_url ILIKE 'data:%'"),
  "catalog contract must reject exact brand-only rows and strip inline data images before they bloat search payloads"
);

assert(
  /CREATE OR REPLACE FUNCTION public\.search_products/.test(brandOnlyCatalogMigration) &&
    brandOnlyCatalogMigration.includes("AND NOT public.is_likely_non_product_catalog_row(pd.product_name, pd.brand)") &&
    brandOnlyCatalogMigration.includes("CASE WHEN pd.image_url ILIKE 'data:%' THEN NULL ELSE pd.image_url END AS image_url") &&
    brandOnlyCatalogMigration.includes("COALESCE(array_length(c.clean_ingredients, 1), 0) >= 5") &&
    brandOnlyCatalogMigration.includes("r.clean_ingredients AS ingredients") &&
    brandOnlyCatalogMigration.includes("GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INT)") &&
    brandOnlyCatalogMigration.includes("TO anon, authenticated") &&
    brandOnlyCatalogMigration.includes("NOTIFY pgrst, 'reload schema'"),
  "search_products must defensively exclude brand-only rows and null inline image URLs even before cleanup finishes"
);

assert(
  optimizedSearchSnapshotMigration.includes("CREATE INDEX IF NOT EXISTS idx_product_data_name_lower_trgm") &&
    optimizedSearchSnapshotMigration.includes("CREATE INDEX IF NOT EXISTS idx_product_data_brand_lower_trgm") &&
    optimizedSearchSnapshotMigration.includes("WITH matched AS") &&
    optimizedSearchSnapshotMigration.includes("ORDER BY rank DESC, pd.ingredient_count DESC") &&
    optimizedSearchSnapshotMigration.includes("LIMIT candidate_limit") &&
    optimizedSearchSnapshotMigration.includes("sanitized AS") &&
    optimizedSearchSnapshotMigration.indexOf("WITH matched AS") < optimizedSearchSnapshotMigration.indexOf("sanitized AS"),
  "search_products must rank and cap matching rows before unnesting ingredient arrays for snapshots"
);

assert(
  /CREATE OR REPLACE FUNCTION public\.search_products/.test(optimizedSearchSnapshotMigration) &&
    optimizedSearchSnapshotMigration.includes("AND pd.ingredient_count >= 5") &&
    optimizedSearchSnapshotMigration.includes("AND NOT public.is_likely_non_product_catalog_row(pd.product_name, pd.brand)") &&
    optimizedSearchSnapshotMigration.includes("CASE WHEN pd.image_url ILIKE 'data:%' THEN NULL ELSE pd.image_url END AS image_url") &&
    optimizedSearchSnapshotMigration.includes("public.is_plausible_product_ingredient(ingredient.value)") &&
    optimizedSearchSnapshotMigration.includes("s.clean_ingredients AS ingredients") &&
    optimizedSearchSnapshotMigration.includes("WHERE COALESCE(array_length(s.clean_ingredients, 1), 0) >= 5") &&
    optimizedSearchSnapshotMigration.includes("GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INT)") &&
    optimizedSearchSnapshotMigration.includes("TO anon, authenticated") &&
    optimizedSearchSnapshotMigration.includes("NOTIFY pgrst, 'reload schema'"),
  "optimized search_products must preserve the sanitized snapshot and catalog quality contract"
);

assert(
  packageJson.includes('"test:search-catalog-quality": "node scripts/test-search-catalog-quality-guards.js"') &&
    packageJson.includes("npm run test:search-catalog-quality"),
  "search catalog quality guard must be wired into package scripts"
);

console.log("search catalog quality guard passed");
