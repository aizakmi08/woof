import fc from "fast-check";
import { compareLabelIdentities } from "../../services/labelResolution";

const baseIdentity = {
  brand: "Invented Pantry",
  productName: "Everyday Rabbit Recipe",
  petType: "dog",
};

const boundaries = [
  {
    name: "species",
    reason: "candidate_species_not_visible",
    base: { ...baseIdentity, petType: "" },
    value: { petType: "dog" },
    sibling: { petType: "cat" },
  },
  {
    name: "brand family",
    reason: "candidate_brand_not_visible",
    base: { productName: "Everyday Rabbit Recipe", petType: "dog" },
    value: { brand: "Invented Pantry" },
    sibling: { brand: "Other Pantry" },
  },
  {
    name: "product line",
    reason: "candidate_product_line_not_visible",
    base: baseIdentity,
    value: { productLine: "Heritage Series" },
    sibling: { productLine: "Modern Series" },
  },
  {
    name: "life stage",
    reason: "candidate_life_stage_not_visible",
    base: baseIdentity,
    value: { lifeStage: "senior" },
    sibling: { lifeStage: "puppy" },
  },
  {
    name: "age band",
    reason: "candidate_age_band_not_visible",
    base: { ...baseIdentity, lifeStage: "adult" },
    value: { productName: "Everyday Rabbit Recipe Adult 7+", lifeStage: "adult" },
    sibling: { productName: "Everyday Rabbit Recipe Adult 11+", lifeStage: "adult" },
  },
  {
    name: "food form",
    reason: "candidate_food_form_not_visible",
    base: baseIdentity,
    value: { foodForm: "dry" },
    sibling: { foodForm: "wet" },
  },
  {
    name: "diet condition",
    reason: "candidate_diet_condition_not_visible",
    base: baseIdentity,
    value: { dietCondition: "weight_management" },
    sibling: { dietCondition: "urinary" },
  },
  {
    name: "breed size",
    reason: "candidate_breed_size_not_visible",
    base: baseIdentity,
    value: { breedSize: "small" },
    sibling: { breedSize: "large" },
  },
  {
    name: "grain-free",
    reason: "candidate_grain_free_not_visible",
    base: baseIdentity,
    value: { grainFree: true },
    sibling: { grainFree: false },
  },
  {
    name: "package form",
    reason: "candidate_package_form_not_visible",
    base: baseIdentity,
    value: { packageSize: "8 lb bag" },
    sibling: { packageSize: "13 oz can" },
  },
];

describe("protected label boundary completeness", () => {
  test.each(boundaries)("$name covers all value-presence combinations", ({ base, value, reason }) => {
    const neither = compareLabelIdentities(base, base, { requireVisibleCandidateVariants: true });
    const labelOnly = compareLabelIdentities({ ...base, ...value }, base, { requireVisibleCandidateVariants: true });
    const candidateOnly = compareLabelIdentities(base, { ...base, ...value }, { requireVisibleCandidateVariants: true });
    const both = compareLabelIdentities(
      { ...base, ...value },
      { ...base, ...value },
      { requireVisibleCandidateVariants: true }
    );

    expect(neither.compatible).toBe(true);
    expect(labelOnly.compatible).toBe(true);
    expect(candidateOnly.compatible).toBe(false);
    expect(candidateOnly.reasonCodes).toContain(reason);
    expect(both.compatible).toBe(true);
  });

  test.each(boundaries)("$name rejects a conflicting sibling", ({ base, value, sibling }) => {
    const comparison = compareLabelIdentities(
      { ...base, ...value },
      { ...base, ...sibling },
      { requireVisibleCandidateVariants: true }
    );

    expect(comparison.compatible).toBe(false);
  });

  test("a generated sibling is never accepted when its protected value is not visible", () => {
    fc.assert(fc.property(
      fc.constantFrom(...boundaries),
      fc.uuid(),
      (boundary, noise) => {
        const visible = {
          ...boundary.base,
          productName: `${boundary.base.productName || "Everyday Recipe"} ${noise}`,
        };
        const candidate = { ...visible, ...boundary.value };
        const comparison = compareLabelIdentities(visible, candidate, {
          requireVisibleCandidateVariants: true,
        });
        return !comparison.compatible && comparison.reasonCodes.includes(boundary.reason);
      }
    ), { numRuns: 100 });
  });
});
