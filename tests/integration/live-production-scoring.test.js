jest.mock("../../services/supabase", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));
jest.mock("../../services/claude", () => ({ identifyProductLabel: jest.fn() }));
jest.mock("../../services/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import {
  catalogProductToVerifiedProduct,
  normalizeCatalogProduct,
} from "../../services/productCatalog";
import { buildVerifiedPetFoodAnalysis } from "../../services/verifiedScoring";

const liveRowJson = process.env.LIVE_PRODUCT_ROW_JSON;
const describeLive = liveRowJson ? describe : describe.skip;

describeLive("live production scoring path", () => {
  test("the exact Nature's Logic row carries typical nutrients into the calcium cap", () => {
    const rawRow = JSON.parse(liveRowJson);
    const catalogProduct = normalizeCatalogProduct(rawRow);
    const verifiedProduct = catalogProductToVerifiedProduct(catalogProduct);
    const analysis = buildVerifiedPetFoodAnalysis(verifiedProduct);

    expect(rawRow.cache_key).toBe(
      "natures-logic:nature s logic distinction canine pork recipe natural pork dog food"
    );
    expect(verifiedProduct.hasPublishedNutrients).toBe(true);
    expect(analysis.nutritionAnalysis.analysisType).toBe("typical");
    expect(analysis.nutritionAnalysis.analysisBasis).toBe("dry_matter");
    expect(analysis.nutritionAnalysis.calciumDryMatterPercent).toBe("3.52%");
    expect(analysis.nutritionAnalysis.nutrientConcern?.code)
      .toBe("calcium_above_profile_maximum");
    expect(analysis.categories.find((category) => category.name === "Nutritional Balance").score)
      .toBeLessThanOrEqual(25);
    expect(analysis.overallScore).toBeLessThanOrEqual(35);
  });
});
