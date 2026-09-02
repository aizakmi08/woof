jest.mock("../../services/supabase", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));
jest.mock("../../services/claude", () => ({ identifyProductLabel: jest.fn() }));
jest.mock("../../services/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import fc from "fast-check";
import {
  catalogProductToVerifiedProduct,
  normalizeCatalogProduct,
} from "../../services/productCatalog";
import { buildVerifiedPetFoodAnalysis } from "../../services/verifiedScoring";
import { rawVerifiedCatalogRow } from "../fixtures/catalogRows";

function scoreRawRow(overrides = {}) {
  const row = rawVerifiedCatalogRow(overrides);
  return buildVerifiedPetFoodAnalysis(
    catalogProductToVerifiedProduct(normalizeCatalogProduct(row))
  );
}

function weightedCategoryScore(categories) {
  const weights = [0.2, 0.2, 0.3, 0.15, 0.15];
  return Math.round(categories.reduce((sum, category, index) => (
    sum + category.score * weights[index]
  ), 0));
}

describe("verified scoring invariants", () => {
  test("uncapped overall score is the rounded weighted category sum", () => {
    const result = scoreRawRow({
      nutritional_info: {
        guaranteed_analysis: {
          protein: 30,
          fat: 14,
          fiber: 4,
          moisture: 10,
          calcium: 1.2,
          phosphorus: 1,
        },
      },
    });
    expect(result.nutritionAnalysis.nutrientConcern).toBeNull();
    expect(result.overallScore).toBe(weightedCategoryScore(result.categories));
  });

  test.each([
    ["puppy", 1.8, 1.2, null],
    ["puppy", 1.81, 1.2, "calcium_above_profile_maximum"],
    ["adult", 2.5, 1.5, null],
    ["adult", 2.51, 1.5, "calcium_above_profile_maximum"],
    ["adult", 1, 1, null],
    ["adult", 2, 1, null],
    ["adult", 0.99, 1, "calcium_phosphorus_ratio_outside_profile"],
    ["adult", 2.01, 1, "calcium_phosphorus_ratio_outside_profile"],
  ])("enforces calcium boundary for %s at %s:%s", (lifeStage, calcium, phosphorus, concernCode) => {
    const result = scoreRawRow({
      life_stage: lifeStage,
      product_name: `${lifeStage} Rabbit Recipe`,
      nutritional_info: {
        guaranteed_analysis: {
          protein: 30,
          fat: 14,
          fiber: 4,
          moisture: 0,
          calcium,
          phosphorus,
          basis: "dry_matter",
          analysis_type: "guaranteed",
        },
      },
    });

    expect(result.nutritionAnalysis.nutrientConcern?.code || null).toBe(concernCode);
    if (concernCode === "calcium_above_profile_maximum") {
      expect(result.overallScore).toBeLessThanOrEqual(35);
    }
    if (concernCode === "calcium_phosphorus_ratio_outside_profile") {
      expect(result.overallScore).toBeLessThanOrEqual(45);
    }
  });

  test("unknown nutrient basis cannot trigger a dry-matter cap", () => {
    const result = scoreRawRow({
      nutritional_info: {
        guaranteed_analysis: {
          protein: 30,
          fat: 14,
          fiber: 4,
          calcium: 99,
          phosphorus: 0.01,
          analysis_type: "guaranteed",
          basis: "unknown",
        },
      },
    });
    expect(result.nutritionAnalysis.nutrientConcern).toBeNull();
    expect(result.nutritionAnalysis.calciumDryMatterPercent).toBe("N/A");
  });

  test("null nutrient values are unavailable, not invented as zero", () => {
    const result = scoreRawRow({
      nutritional_info: {
        guaranteed_analysis: {
          protein: null,
          fat: null,
          fiber: null,
          moisture: null,
          calcium: null,
          phosphorus: null,
        },
      },
      nutrient_panel: null,
      has_published_nutrients: true,
    });
    expect(result.nutritionAnalysis.hasPublishedNutrients).toBe(false);
    expect(result.nutritionAnalysis.proteinPercent).toBe("N/A");
    expect(result.nutritionAnalysis.caloriesPerCup).toBe("N/A");
  });

  test("guaranteed analysis is never presented as typical or actual", () => {
    const result = scoreRawRow();
    expect(result.nutritionAnalysis.analysisType).toBe("guaranteed");
    expect(result.nutritionAnalysis.analysisTypeLabel).toBe("Guaranteed Analysis");
    expect(result.summary.toLowerCase()).not.toMatch(/typical|actual/);
  });

  test("ingredient quality cannot lift a nutrient-capped product", () => {
    const result = scoreRawRow({
      ingredients: ["rabbit", "salmon", "chicken", "fish oil", "mixed tocopherols"],
      ingredient_text: "Rabbit, salmon, chicken, fish oil, mixed tocopherols",
    });
    expect(result.nutritionAnalysis.nutrientConcern?.level).toBe("avoid");
    expect(result.overallScore).toBeLessThanOrEqual(35);
  });

  test("score stays bounded for numeric strings and adversarial values", () => {
    fc.assert(fc.property(
      fc.oneof(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -10000, max: 10000 }),
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -10000, max: 10000 })
          .map((value) => `${value}%`),
        fc.constant(null)
      ),
      (protein) => {
        const result = scoreRawRow({
          nutritional_info: {
            guaranteed_analysis: {
              protein,
              fat: 14,
              fiber: 4,
              moisture: 10,
              calcium: 1.2,
              phosphorus: 1,
            },
          },
        });
        return Number.isInteger(result.overallScore)
          && result.overallScore >= 1
          && result.overallScore <= 100
          && result.nutritionAnalysis.caloriesPerCup === "N/A";
      }
    ), { numRuns: 100 });
  });
});
