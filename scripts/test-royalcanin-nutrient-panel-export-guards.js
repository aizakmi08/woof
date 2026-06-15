#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-royalcanin-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Royal Canin nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.royalcanin.com/us/en-us/sitemap/sitemap-products.xml") &&
    source.includes("const BRAND = \"Royal Canin\"") &&
    source.includes("parseSitemapRows(xml)") &&
    source.includes("royalcanin\\.com\\/us\\/(dogs|cats)\\/products\\/retail-products") &&
    source.includes("response.status === 429 || response.status >= 500") &&
    source.includes("response.headers.get(\"retry-after\")") &&
    source.includes("const html = await fetchText(candidate.sourceUrl)") &&
    source.includes("parseOfficialProductName(html)") &&
    source.includes("parseNutrientPanel(html, enrichedCandidate.sourceUrl)") &&
    source.includes("Guaranteed Analysis") &&
    source.includes("Calorie Content") &&
    source.includes("data-testid=[\"']product-nutrition-content") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Royal Canin sitemap/product pages and parse published nutrition blocks without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"supplements\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"treats\"") &&
    source.includes("\"probiotics\""),
  "exporter must reject Royal Canin treats, toppers, supplements, and probiotic rows"
);

assert(
  source.includes("function isRoyalCaninCatalogRow(row)") &&
    source.includes("combined.includes(\"royal canin\")") &&
    source.includes("function matchCandidates(target, rows)") &&
    source.includes("row.petType === target.petType") &&
    source.includes("row.productForm === target.productForm") &&
    source.includes("markerCompatible(target, row)") &&
    source.includes("CONFLICT_MARKER_GROUPS") &&
    source.includes("[\"xsmall\", \"small\", \"medium\", \"large\", \"giant\"]") &&
    source.includes("[\"age5\", \"age7\", \"age8\", \"age10\", \"age12\"]") &&
    source.includes("REQUIRED_ROW_MARKERS") &&
    source.includes("distinctiveCompatible(target, row)") &&
    source.includes("target.distinctiveTokens.every((token) => row.distinctiveTokens.includes(token))") &&
    source.includes("EXTRA_GENERIC_TOKENS"),
  "exporter must match Royal Canin rows by species, form, and conservative exact distinctive product tokens"
);

assert(
    source.includes("source: \"royalcanin_official_product_page\"") &&
    source.includes("nutrientPanel: parsed.panel") &&
    source.includes("sourceUrl: enrichedCandidate.sourceUrl") &&
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
  packageJson.includes('"export:royalcanin-nutrient-panels": "node scripts/export-royalcanin-nutrient-panels.js"') &&
    packageJson.includes('"test:royalcanin-nutrient-panel-export": "node scripts/test-royalcanin-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:royalcanin-nutrient-panel-export"),
  "package scripts must expose Royal Canin nutrient exporter and include its guard in test:guards"
);

console.log("Royal Canin nutrient panel export guard passed");
