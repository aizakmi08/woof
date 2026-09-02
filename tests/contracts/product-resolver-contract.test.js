jest.mock("../../services/supabase", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));
jest.mock("../../services/claude", () => ({ identifyProductLabel: jest.fn() }));
jest.mock("../../services/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { projectScanFrameToPhoto } from "../../services/cameraCrop";
import {
  catalogVerificationState,
  productIsVerifiedReady,
} from "../../services/catalogQuality";
import {
  filterProductsForOcr,
  labelOcrSearchQueries,
  primaryPackageOcrText,
} from "../../services/labelOcrMatching";
import {
  compareLabelIdentities,
  evaluateNonCompleteFoodEvidence,
} from "../../services/labelResolution";
import {
  normalizeCatalogProduct,
} from "../../services/productCatalog";
import {
  isEligibleReviewSuccess,
  reviewPromptDecision,
} from "../../services/reviewPromptPolicy";
import { rawVerifiedCatalogRow } from "../fixtures/catalogRows";

describe("product resolver production contracts", () => {
  test("a raw PostgREST catalog row reaches the real verification gate", () => {
    const product = normalizeCatalogProduct(rawVerifiedCatalogRow());

    expect(catalogVerificationState(product).state).toBe("verified_ready");
    expect(productIsVerifiedReady(product)).toBe(true);
  });

  test("front-label OCR keeps the centered package and rejects a sibling", () => {
    const lines = [
      { text: "OPEN FARM", confidence: 0.99, bounds: { x: 0.38, y: 0.72, width: 0.2, height: 0.05 } },
      { text: "HARVEST CHICKEN", confidence: 0.99, bounds: { x: 0.25, y: 0.62, width: 0.48, height: 0.06 } },
      { text: "ANCIENT GRAINS RECIPE", confidence: 0.98, bounds: { x: 0.24, y: 0.54, width: 0.5, height: 0.05 } },
      { text: "FISH RECIPE", confidence: 0.91, bounds: { x: 0.02, y: 0.03, width: 0.2, height: 0.03 } },
    ];
    const text = lines.map((line) => line.text).join("\n");
    const packageText = primaryPackageOcrText(text, lines);
    const matches = filterProductsForOcr([
      { brand: "Open Farm", productName: "Harvest Chicken & Ancient Grains Dog Kibble", petType: "dog", foodForm: "dry" },
      { brand: "Open Farm", productName: "Harvest Fish & Ancient Grains Dog Kibble", petType: "dog", foodForm: "dry" },
    ], packageText);

    expect(labelOcrSearchQueries(text, lines)).not.toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(matches[0].productName).toContain("Chicken");
  });

  test("a dry bag cannot be compatible with a canned sibling", () => {
    const comparison = compareLabelIdentities(
      { brand: "Acme", productName: "Rabbit Recipe 8 lb bag", foodForm: "dry", petType: "dog" },
      { brand: "Acme", productName: "Rabbit Recipe 13 oz can", foodForm: "wet", petType: "dog" },
      { requireVisibleCandidateVariants: true }
    );

    expect(comparison.compatible).toBe(false);
    expect(comparison.reasonCodes).toEqual(expect.arrayContaining([
      "food_form_conflict",
      "package_size_form_conflict",
    ]));
  });

  test("human food cannot advance app-review eligibility", () => {
    expect(isEligibleReviewSuccess({ score: 95, scanMode: "human_food" })).toBe(false);
    expect(isEligibleReviewSuccess({ score: 80, scanMode: "photo" })).toBe(true);
    expect(reviewPromptDecision({ successCount: 2, remainingScans: 1 }).show).toBe(true);
  });

  test("unidentified food remains caution instead of receiving pet-food confidence", () => {
    expect(evaluateNonCompleteFoodEvidence({ text: "unreadable package" })).toMatchObject({
      status: "none",
      confirmed: false,
    });
  });

  test("camera geometry maps the highlighted frame into photo pixels", () => {
    expect(projectScanFrameToPhoto({
      photoWidth: 1206,
      photoHeight: 2622,
      previewWidth: 1206,
      previewHeight: 2622,
      frame: { x: 213, y: 735, width: 780, height: 780 },
    })).toEqual({ originX: 213, originY: 735, width: 780, height: 780 });
  });
});
