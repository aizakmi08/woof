#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migration = [
  "supabase/migrations/037_enforce_product_data_display_contract.sql",
  "supabase/migrations/038_harden_product_display_punctuation.sql",
  "supabase/migrations/042_reject_non_product_catalog_rows.sql",
  "supabase/migrations/047_reject_brand_only_catalog_rows.sql",
  "supabase/migrations/049_reject_non_complete_food_catalog_rows.sql",
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`product display contract guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  migration.includes("CREATE OR REPLACE FUNCTION public.clean_product_display_text") &&
    migration.includes("'&amp;', '&', 'gi'") &&
    migration.includes("'&quot;', '\"', 'gi'") &&
    migration.includes("'&#39;|&#039;|&apos;'") &&
    migration.includes("'&#x?[0-9a-f]+;'") &&
    migration.includes("'&reg;|&trade;'") &&
    migration.includes("'^\\s*(brand|product)\\s*:\\s*'") &&
    migration.includes("'^\\s*\\|+\\s*'") &&
    migration.includes("'\\s*\\(\\s*$'") &&
    migration.includes("'\\s*[,;:]\\s*$'"),
  "migration must provide reusable product display text cleaning"
);

assert(
  /CREATE OR REPLACE FUNCTION public\.enforce_product_data_ingredient_contract/.test(migration) &&
    migration.includes("NEW.product_name := COALESCE(public.clean_product_display_text(NEW.product_name), NEW.product_name)") &&
    migration.includes("NEW.brand := public.clean_product_display_text(NEW.brand)") &&
    migration.includes("public.is_likely_non_product_catalog_row(NEW.product_name, NEW.brand)") &&
    migration.includes("Invalid product_data non-product payload") &&
    migration.includes("public.is_plausible_product_ingredient(ingredient.value)") &&
    migration.includes("clean_ingredient_count < 5"),
  "product_data trigger function must clean display fields and reject non-product rows while preserving ingredient contract"
);

assert(
  migration.includes("DELETE FROM public.product_data") &&
    migration.includes("COALESCE(array_length(ingredients, 1), 0) < 5") &&
    migration.includes("public.is_likely_non_product_catalog_row(product_name, brand)") &&
    migration.includes("UPDATE public.product_data") &&
    migration.includes("product_name = COALESCE(public.clean_product_display_text(product_name), product_name)") &&
    migration.includes("brand = public.clean_product_display_text(brand)"),
  "migration must clean existing rows and remove non-analysis-ready rows"
);

assert(
  migration.includes("CREATE OR REPLACE FUNCTION public.normalize_product_catalog_name") &&
    migration.includes("CREATE OR REPLACE FUNCTION public.is_likely_non_product_catalog_row") &&
    migration.includes("^ingredients? (amp |and )?nutritional value$") &&
    migration.includes("^ingredients? guide( ingredients? guide)?( |$)") &&
    migration.includes("(^| )(dog|cat|pet) (food|treat) trends?( |$)") &&
    migration.includes("(^| )the rise of( |$)") &&
    migration.includes("(^| )(treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables)( |$)") &&
    migration.includes("(^| )samples?( |$)") &&
    migration.includes("(^| )(pack|variety|bundle)( |$)") &&
    migration.includes("product_name IN (brand, brand || ' ' || brand)"),
  "migration must define a conservative reusable non-product catalog-row detector for article, brand-only, treat, topper, supplement, accessory, and sample-pack rows"
);

assert(
  migration.includes("IF NEW.image_url ILIKE 'data:%' THEN") &&
    migration.includes("NEW.image_url := NULL") &&
    migration.includes("UPDATE public.product_data") &&
    migration.includes("SET image_url = NULL") &&
    migration.includes("WHERE image_url ILIKE 'data:%'"),
  "product_data display contract must strip inline data-image payloads from existing and future rows"
);

assert(
  migration.includes("DROP TRIGGER IF EXISTS trg_product_data_ingredient_contract") &&
    migration.includes("CREATE TRIGGER trg_product_data_ingredient_contract") &&
    migration.includes("BEFORE INSERT OR UPDATE") &&
    migration.includes("EXECUTE FUNCTION public.enforce_product_data_ingredient_contract()"),
  "product_data trigger must continue running for every insert/update"
);

assert(
  packageJson.includes('"test:product-display-contract": "node scripts/test-product-display-contract-guards.js"') &&
    packageJson.includes("npm run test:product-display-contract"),
  "product display contract guard must be wired into package scripts"
);

console.log("product display contract guard passed");
