import fc from "fast-check";
import {
  LABEL_RESOLUTION_DECISIONS,
  labelIdentityText,
  reconcileLabelOutcomes,
} from "../../services/labelResolution";

const base = Object.freeze({
  brand: "Invented Pantry",
  productName: "Everyday Rabbit Recipe",
  productLine: "Heritage Series",
  petType: "dog",
  lifeStage: "adult",
  foodForm: "dry",
  packageSize: "8 lb bag",
  dietCondition: "weight_management",
  breedSize: "small",
  grainFree: true,
  confidence: 0.99,
  found: true,
});

const siblingDimensions = Object.freeze([
  { petType: "cat" },
  { brand: "Other Pantry" },
  { productLine: "Modern Series" },
  { lifeStage: "puppy" },
  { productName: "Everyday Rabbit Recipe Adult 11+" },
  { foodForm: "wet" },
  { dietCondition: "urinary" },
  { breedSize: "large" },
  { grainFree: false },
  { packageSize: "13 oz can" },
]);

const ocrMutations = Object.freeze([
  (text) => text,
  (text) => text.replace(/rabbit/i, "rabbi"),
  (text) => text.replace(/heritage/i, "heri tage"),
  (text) => text.replace(/\s+/g, "   "),
  (text) => `${text} Shop now delivery deal`,
  (text) => `${text} soutien digestif`,
  (text) => `${text} supports shiny coats and happy pets`,
  (text) => `${text} ${text}`,
]);

function outcome(path, identification, selectedProduct, query) {
  return {
    path,
    result: {
      identification,
      selectedProduct,
      products: [selectedProduct],
      query,
    },
  };
}

describe("resolver sibling-substitution invariant", () => {
  test("synthetic sibling catalogs never auto-open the wrong formula under OCR damage", () => {
    fc.assert(fc.property(
      fc.constantFrom(...siblingDimensions),
      fc.constantFrom(...ocrMutations),
      (siblingChange, mutateOcr) => {
        const sibling = {
          ...base,
          ...siblingChange,
          cacheKey: `sibling:${Object.keys(siblingChange)[0]}`,
        };
        const ocrText = mutateOcr(labelIdentityText(base));
        const result = reconcileLabelOutcomes([
          outcome("cloud_image", base, sibling, labelIdentityText(base)),
          outcome("on_device_ocr", base, sibling, ocrText),
        ], { autoOpenEnabled: true, strictMatching: true });

        return result.decision !== LABEL_RESOLUTION_DECISIONS.EXACT_CONFIRMED
          && result.confirmedProduct == null
          && result.selectedProduct == null;
      }
    ), { numRuns: 160 });
  });
});
