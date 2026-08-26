import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import {
  extractPublishedAnalysisFromHtml,
  extractPublishedAnalysisFromText,
  mergePublishedAnalysis,
  publishedAnalysisPdfSource,
} from "./catalog-published-analysis.mjs";
import { extractProduct } from "./catalog-page-feed-extract.mjs";

const failures = [];
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const hills = extractPublishedAnalysisFromHtml(`
  <h3>Average Nutrient &amp; Caloric Content</h3>
  <table><tr><td>Nutrient</td><td>Dry Matter<sup>1</sup> %</td></tr>
    <tr><td>Protein</td><td>25.9 %</td></tr>
    <tr><td>Fat</td><td>15.8 %</td></tr>
    <tr><td>Crude Fiber</td><td>1.2 %</td></tr>
    <tr><td>Calcium</td><td>0.97 %</td></tr>
    <tr><td>Phosphorus</td><td>0.79 %</td></tr>
  </table>
`, "https://www.hillspet.com/example");
expect(hills?.typical_analysis?.protein === 25.9, "Hill's dry-matter protein was not parsed");
expect(hills?.typical_analysis?.calcium === 0.97, "Hill's dry-matter calcium was not parsed");
expect(hills?.typical_analysis?.analysis_type === "typical", "Hill's average analysis was not normalized as typical");

const hillsFeedRow = await extractProduct(`
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Adult Example Chicken Recipe Dog Food",
    brand: { "@type": "Brand", name: "Hill's Science Diet" },
    url: "https://www.hillspet.com/dog-food/science-diet-adult-example-dry",
    image: "https://www.hillspet.com/example.png",
    ingredientStatement: "Chicken, Brown Rice, Chicken Meal, Barley, Chicken Fat, Flaxseed, Dried Beet Pulp, Taurine, Vitamin E Supplement, Zinc Sulfate",
  })}</script>
  <h3>Average Nutrient &amp; Caloric Content</h3>
  <table><tr><td>Nutrient</td><td>Dry Matter %</td></tr>
    <tr><td>Protein</td><td>25.9 %</td></tr>
    <tr><td>Fat</td><td>15.8 %</td></tr>
    <tr><td>Crude Fiber</td><td>1.2 %</td></tr>
    <tr><td>Calcium</td><td>0.97 %</td></tr>
    <tr><td>Phosphorus</td><td>0.79 %</td></tr>
  </table>
`, "https://www.hillspet.com/dog-food/science-diet-adult-example-dry", {
  allowRemoteEnrichment: false,
});
const hillsFeedInfo = JSON.parse(hillsFeedRow.nutritional_info || "{}");
expect(hillsFeedInfo.typical_analysis?.calcium === 0.97, "Page feed did not carry the extracted typical analysis");
expect(hillsFeedInfo.published_analysis_source?.status === "extracted", "Page feed did not carry nutrient provenance");

const naturesLogic = extractPublishedAnalysisFromHtml(`
  <h2>Nutritional Information</h2>
  <table><tr><th>Protein, Fat &amp; Amino Acids</th><th>Actual Analysis Units Dry Matter Basis</th></tr>
    <tr><td>CRUDE PROTEIN</td><td>32.0 %</td></tr>
    <tr><td>CRUDE FAT</td><td>17.8 %</td></tr>
    <tr><td>CRUDE FIBER</td><td>3.51 %</td></tr>
  </table>
  <table><tr><th>Minerals</th><th>Actual Analysis Units Dry Matter Basis</th></tr>
    <tr><td>Calcium</td><td>3.52 %</td></tr>
    <tr><td>Phosphorus</td><td>1.96 %</td></tr>
    <tr><td>Ash</td><td>13.7 %</td></tr>
  </table>
`, "https://natureslogic.com/example");
expect(naturesLogic?.typical_analysis?.calcium === 3.52, "Nature's Logic calcium was not merged across tables");
expect(naturesLogic?.typical_analysis?.phosphorus === 1.96, "Nature's Logic phosphorus was not merged across tables");

const guaranteedOnly = extractPublishedAnalysisFromHtml(`
  <h3>Guaranteed Analysis</h3><table><tr><th>Nutrient</th><th>Percentage</th></tr>
  <tr><td>Crude Protein</td><td>30% min</td></tr><tr><td>Crude Fat</td><td>15% min</td></tr></table>
`, "https://example.com/guaranteed");
expect(guaranteedOnly === null, "Guaranteed analysis must not be promoted to typical analysis");

const fromm = extractPublishedAnalysisFromText(`
TYPICAL ANALYSIS*
Nutrient Name Units As-Is Basis Dry Matter Basis
Moisture % 8.09
Dry matter % 91.92
Protein % 25.8 28.08
Fat % 15.92 17.3
Fiber % 2.44 2.66
Ash % 6.22 6.77
Phosphorus % 1.08 1.17
Calcium % 1.53 1.66
*The data in our typical analysis is composed of calculated values.
NUTRITIONAL ADEQUACY STATEMENT
`, "https://cdn.frommfamily.com/example.pdf");
expect(fromm?.typical_analysis?.protein === 28.08, "Fromm dry-matter protein column was not selected");
expect(fromm?.typical_analysis?.calcium === 1.66, "Fromm dry-matter calcium column was not selected");

const pdfSource = publishedAnalysisPdfSource(`
  <a href="https://cdn.frommfamily.com/products/ta/example.pdf"><span>Typical Analysis</span></a>
`, "https://frommfamily.com/example");
expect(pdfSource?.source_url.endsWith("/example.pdf"), "Typical-analysis PDF source was not detected");

const queued = JSON.parse(mergePublishedAnalysis("formulated to meet AAFCO profiles", null, pdfSource));
expect(queued.adequacy_statement.includes("AAFCO"), "Existing adequacy text was not preserved");
expect(queued.published_analysis_source.status === "requires_verified_extraction", "Unparsed PDF was not queued for verified extraction");

const manufacturerPreferenceMigration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260826002500_prefer_manufacturer_source_versions_in_verified_search.sql"
  ),
  "utf8"
);
expect(
  /PARTITION BY[\s\S]*?ORDER BY\s+CASE[\s\S]*?source_quality = 'manufacturer'[\s\S]*?scored\.adjusted_rank DESC/.test(
    manufacturerPreferenceMigration
  ),
  "Verified-search deduplication must retain the manufacturer source before comparing retailer rank"
);

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Published typical/actual analysis parser checks passed.");
