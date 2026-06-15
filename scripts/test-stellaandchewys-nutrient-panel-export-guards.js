#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/export-stellaandchewys-nutrient-panels.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`Stella & Chewy's nutrient panel export guard failed: ${message}`);
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
  source.includes("https://www.stellaandchewys.com/sitemap.xml") &&
    source.includes("const BRAND = \"Stella & Chewy's\"") &&
    source.includes("--sitemap-index=url") &&
    source.includes("--sitemap=url") &&
    source.includes("--include-unmatched") &&
    source.includes("--skip-existing-scan") &&
    source.includes("extractProductSitemapLocs") &&
    source.includes("parseProductRows(xml, sourceSitemap)") &&
    source.includes("fetchText(sourceSitemap, \"application/xml,text/xml,*/*;q=0.8\")") &&
    source.includes("response.status === 429 || response.status >= 500") &&
    source.includes("response.headers.get(\"retry-after\")") &&
    source.includes("function pageContextText(html)") &&
    source.includes("_conv_product_tags") &&
    !source.includes("\"tags\"\\s*") &&
    source.includes("const text = `${row.name} ${row.sourceUrl}`") &&
    source.includes("const grainText = `${text} ${pageContextText(html)}`") &&
    source.includes("grainTokens: grainTokens(grainText)") &&
    source.includes("const html = await fetchText(row.sourceUrl)") &&
    source.includes("const candidate = normalizeCandidate(row, html)") &&
    source.includes("parseNutrientPanel(html, candidate.sourceUrl)") &&
    source.includes("guaranteed_analysis_data_title(?:_") &&
    source.includes("guaranteed_analysis_data_measurement(?:_") &&
    source.includes("crude\\s+protein") &&
    source.includes("metabolizable energy") &&
    !source.includes("product-lookup") &&
    !source.includes("cheerio") &&
    !source.includes("puppeteer"),
  "exporter must read official Stella & Chewy's sitemaps/product pages and parse published Guaranteed Analysis without product-lookup or browser scraping"
);

assert(
  source.includes("REJECT_TERMS") &&
    source.includes("\"meal mixer\"") &&
    source.includes("\"dinner dust\"") &&
    source.includes("\"bone broth\"") &&
    source.includes("\"trial\"") &&
    source.includes("\"treats\"") &&
    source.includes("CORE_FOOD_TERMS") &&
    source.includes("function isCandidateSitemapRow(row)") &&
    source.includes("freeze-dried raw dinner patties") &&
    source.includes("frozen raw dinner morsels") &&
    source.includes("raw coated kibble") &&
    source.includes("carnivore cravings"),
  "exporter must keep complete Stella & Chewy's foods and reject treats, toppers, mixers, broths, bundles, samples, and trial rows"
);

assert(
  source.includes("productStyleTokens") &&
    source.includes("styleCompatible(target, row)") &&
    source.includes("target.styleTokens.every((token) => row.styleTokens.includes(token))") &&
    source.includes("function grainTokens(value)") &&
    source.includes("grainCompatible(target, row)") &&
    source.includes("rowGrains.has(\"wholesome_grains\") && !targetGrains.has(\"wholesome_grains\")") &&
    source.includes("rowGrains.has(\"grain_free\") && !targetGrains.has(\"grain_free\")") &&
    !source.includes("\"poultry\",") &&
    source.includes("proteinCompatible(target, row)") &&
    source.includes("row.productForm === target.form") &&
    source.includes("row.petType === target.petType") &&
    source.includes("hasLifeStageConflict(target, row)") &&
    source.includes("distinctiveCompatible(target, row)") &&
    source.includes("missingCatalogAlias") &&
    source.includes("weakTargetTokens"),
  "exporter must match official panels to existing Stella & Chewy's catalog rows by species, form, exact style, life stage, exact protein set, and distinctive recipe tokens"
);

assert(
  source.includes("source: \"stellaandchewys_official_product_page\"") &&
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
  packageJson.includes('"export:stellaandchewys-nutrient-panels": "node scripts/export-stellaandchewys-nutrient-panels.js"') &&
    packageJson.includes('"test:stellaandchewys-nutrient-panel-export": "node scripts/test-stellaandchewys-nutrient-panel-export-guards.js"') &&
    packageJson.includes("npm run test:stellaandchewys-nutrient-panel-export"),
  "package scripts must expose Stella & Chewy's nutrient exporter and include its guard in test:guards"
);

console.log("Stella & Chewy's nutrient panel export guard passed");
