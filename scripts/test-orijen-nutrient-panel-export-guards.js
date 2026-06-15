#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-orijen-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`ORIJEN nutrient panel export guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("require(\"dotenv\").config({ quiet: true })") &&
    source.includes("const SUPABASE_URL = process.env.SUPABASE_URL") &&
    source.includes("const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY") &&
    source.includes("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env."),
  "exporter must load env quietly and use anon Supabase reads only"
);

assert(
  source.includes("https://www.orijenpetfoods.com/en-US/sitemap_0.xml") &&
    source.includes("const BRAND = \"ORIJEN\"") &&
    source.includes("parseSitemapRows(xml)") &&
    source.includes("parsedProductPath") &&
    source.includes("www\\.orijenpetfoods\\.com\\/en-US\\/(dogs|cats)\\/(dog-food|cat-food)") &&
    source.includes("response.status === 429 || response.status >= 500") &&
    source.includes("response.headers.get(\"retry-after\")") &&
    source.includes("parseNutrientPanel(await fetchText(candidate.sourceUrl), candidate.sourceUrl)") &&
    source.includes("<h2[^>]*>\\s*Guaranteed Analysis\\s*<\\/h2>") &&
    source.includes("metabolizable energy") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official ORIJEN sitemap/product pages and parse published Guaranteed Analysis without product-lookup or browser scraping"
);

assert(
    source.includes("REJECT_TERMS") &&
    source.includes("\"bundle\"") &&
    source.includes("\"variety pack\"") &&
    source.includes("\"fdt\"") &&
    source.includes("\"freeze dried treat\"") &&
    source.includes("\"jerky\"") &&
    source.includes("\"treats\"") &&
    source.includes("function parsedProductPath(url)") &&
    source.includes("REJECT_TERMS.some((term) => hasTerm(text, term))"),
  "exporter must reject treats, FDT rows, jerky, toppers, catnip, litter, accessories, and other non-food rows"
);

assert(
  source.includes("function lineTokens(value)") &&
    source.includes("amazing_grains") &&
    source.includes("grain_free") &&
    source.includes("guardian_8") &&
    source.includes("six_fish") &&
    source.includes("regional_red") &&
    source.includes("LINE_CONFLICT_GROUPS") &&
    source.includes("[\"amazing_grains\", \"grain_free\"]") &&
    source.includes("[\"large_breed\", \"small_breed\"]") &&
    source.includes("\\bpuppy large\\b") &&
    source.includes("\\blarge breeds\\b") &&
    source.includes("lineCompatible(target, row)") &&
    source.includes("proteinCompatible(target, row)") &&
    source.includes("distinctiveCompatible(target, row)") &&
    source.includes("row.productForm === target.form") &&
    source.includes("row.petType === target.petType"),
  "exporter must match ORIJEN panels by species, form, product line, life/size tokens, protein tokens, and distinctive recipe tokens"
);

assert(
  source.includes("source: \"orijen_official_product_page\"") &&
    source.includes("nutrientPanel: parsed.panel") &&
    source.includes("sourceUrl: candidate.sourceUrl") &&
    source.includes("summary: summarizeTargets(targets)") &&
    source.includes("targets,") &&
    !source.includes("ingredients:") &&
    !source.includes("ingredientText") &&
    !source.includes("ingredients_text") &&
    !source.includes("analysisPayload") &&
    !source.includes("base64"),
  "targets must stay nutrient-backfill-compatible and avoid ingredient, analysis payload, or image-base64 data"
);

assert(
  packageJson.includes('"export:orijen-nutrient-panels": "node scripts/export-orijen-nutrient-panels.js"') &&
    packageJson.includes('"test:orijen-nutrient-panel-export": "node scripts/test-orijen-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:orijen-nutrient-panel-export"),
  "package scripts must expose ORIJEN nutrient exporter and include its guard in test:guards"
);

console.log("ORIJEN nutrient panel export guard passed");
