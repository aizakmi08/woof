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
import {
  getCachedCatalogSearch,
  saveCachedCatalogSearch,
} from "../../services/catalogSearchCache";
import {
  MAPPER_FIDELITY_FIELDS,
  rawVerifiedCatalogRow,
} from "../fixtures/catalogRows";

describe("catalog mapper regression", () => {
  test("published nutrients survive raw row to scorer", () => {
    const rawRow = rawVerifiedCatalogRow();
    const catalogProduct = normalizeCatalogProduct(rawRow);
    const verifiedProduct = catalogProductToVerifiedProduct(catalogProduct);
    const result = buildVerifiedPetFoodAnalysis(verifiedProduct);

    for (const field of MAPPER_FIDELITY_FIELDS) {
      expect(verifiedProduct).toHaveProperty(field);
      if (field === "ingredients") continue;
      expect(verifiedProduct[field]).toEqual(catalogProduct[field]);
    }
    expect(verifiedProduct.ingredients.map((ingredient) => ingredient.text))
      .toEqual(catalogProduct.ingredients);
    expect(result.nutritionAnalysis.hasPublishedNutrients).toBe(true);
    expect(result.categories.find((category) => category.name === "Nutritional Balance").score)
      .toBeLessThanOrEqual(25);
    expect(result.overallScore).toBeLessThanOrEqual(35);
  });

  test("every downstream field survives the production search cache", async () => {
    const product = normalizeCatalogProduct(rawVerifiedCatalogRow());

    await expect(saveCachedCatalogSearch("Nature's Logic", [product], { petType: "dog" }))
      .resolves.toBe(true);
    const cached = await getCachedCatalogSearch("Nature's Logic", { petType: "dog" });

    expect(cached.products).toHaveLength(1);
    for (const field of MAPPER_FIDELITY_FIELDS) {
      expect(cached.products[0][field]).toEqual(product[field]);
    }
  });
});
