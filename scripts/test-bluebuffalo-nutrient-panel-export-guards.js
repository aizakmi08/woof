#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-bluebuffalo-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Blue Buffalo nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.bluebuffalo.com/sitemap.xml") &&
    source.includes("sitemap\\.en\\.xml") &&
    source.includes("const BRAND = \"Blue Buffalo\"") &&
    source.includes("parseSitemapRows(indexXml)") &&
    source.includes("bluebuffalo\\.com\\/(dry|wet)-(dog|cat)-food") &&
    source.includes("response.status === 429 || response.status >= 500") &&
    source.includes("response.headers.get(\"retry-after\")") &&
    source.includes("parseNutrientPanel(await fetchText(candidate.sourceUrl), candidate.sourceUrl)") &&
    source.includes("window\\.guaranteedAnalysisHtml") &&
    source.includes("window\\.feedingGuidelinesHtml") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Blue Buffalo sitemap/product pages and parse published Guaranteed Analysis without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"variety pack\"") &&
    source.includes("\"delectables\"") &&
    source.includes("\"meal makers\"") &&
    source.includes("\"health bars\"") &&
    source.includes("\"topper\"") &&
    source.includes("\"treats\"") &&
    source.includes("\"supplements\""),
  "exporter must reject Blue Buffalo treats, toppers, supplements, variety packs, and non-core foods"
);

assert(
  source.includes("function isBlueBuffaloCatalogRow(row)") &&
    source.includes("combined.includes(\"blue buffalo\")") &&
    source.includes("function matchCandidates(target, rows)") &&
    source.includes("sameSet(target.proteinTokens, row.proteinTokens)") &&
    source.includes("compatibleOptionalGroup(target.lifeStageTokens, row.lifeStageTokens, [\"adult\"])") &&
    source.includes("compatibleOptionalGroup(target.sizeTokens, row.sizeTokens)") &&
    source.includes("compatibleOptionalGroup(target.grainTokens, row.grainTokens)") &&
    source.includes("compatibleOptionalGroup(target.healthTokens, row.healthTokens)") &&
    source.includes("row.productForm === target.productForm") &&
    source.includes("row.petType === target.petType") &&
    source.includes("distinctiveAgreement(target, row)"),
  "exporter must match by species, form, line, exact protein set, life/size/grain/health compatibility, and distinctive recipe tokens"
);

assert(
  source.includes("source: \"bluebuffalo_official_product_page\"") &&
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
  packageJson.includes('"export:bluebuffalo-nutrient-panels": "node scripts/export-bluebuffalo-nutrient-panels.js"') &&
    packageJson.includes('"test:bluebuffalo-nutrient-panel-export": "node scripts/test-bluebuffalo-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:bluebuffalo-nutrient-panel-export"),
  "package scripts must expose Blue Buffalo nutrient exporter and include its guard in test:guards"
);

console.log("Blue Buffalo nutrient panel export guard passed");
