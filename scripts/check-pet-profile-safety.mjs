import assert from "node:assert/strict";
import {
  hasUsablePetProfile,
  normalizePetProfile,
  parseAvoidIngredients,
  personalizePetSafety,
  petProfileSummary,
} from "../services/petProfile.js";

const verifiedAdultDogFood = {
  petType: "dog",
  lifeStage: "adult",
  productName: "Verified Adult Dog Food",
  ingredients: [
    { name: "Salmon" },
    { name: "Chicken Meal" },
    { name: "Brown Rice" },
  ],
  petSafety: {
    level: "safe",
    label: "No general concerns",
    summary: "No general concerns were found.",
  },
};

const normalized = normalizePetProfile({
  name: "  BUDDY  ",
  pet_type: "DOG",
  life_stage: "SENIOR",
  avoid_ingredients: [" Fish ", "fish", "Dairy", ""],
});
assert.deepEqual(normalized, {
  version: 1,
  name: "BUDDY",
  petType: "dog",
  lifeStage: "senior",
  avoidIngredients: ["fish", "dairy"],
});
assert.equal(hasUsablePetProfile(normalized), true);
assert.equal(petProfileSummary(normalized), "Dog • Senior • 2 avoid ingredients");

assert.deepEqual(
  parseAvoidIngredients("Chicken, chicken, Salmon,  , Beef"),
  ["chicken", "salmon", "beef"],
  "avoid ingredients should be normalized and deduplicated"
);

const missingProfile = personalizePetSafety(verifiedAdultDogFood, {});
assert.equal(missingProfile.personalized, false);
assert.equal(missingProfile.label, "General ingredient check");

const speciesMismatch = personalizePetSafety(verifiedAdultDogFood, {
  name: "Milo",
  petType: "cat",
  lifeStage: "adult",
});
assert.equal(speciesMismatch.level, "avoid");
assert.equal(speciesMismatch.label, "Not made for Milo");
assert.match(speciesMismatch.summary, /cataloged as dog food/i);

const fishAliasMatch = personalizePetSafety(verifiedAdultDogFood, {
  name: "Buddy",
  petType: "dog",
  lifeStage: "adult",
  avoidIngredients: ["Fish"],
});
assert.equal(fishAliasMatch.level, "avoid");
assert.deepEqual(fishAliasMatch.matches, ["fish"]);
assert.match(fishAliasMatch.summary, /verified ingredients match Fish/i);

const dairyAliasMatch = personalizePetSafety({
  ...verifiedAdultDogFood,
  ingredients: [{ name: "Whey Protein Concentrate" }],
}, {
  name: "Buddy",
  petType: "dog",
  lifeStage: "adult",
  avoidIngredients: ["Dairy"],
});
assert.equal(dairyAliasMatch.level, "avoid");
assert.deepEqual(dairyAliasMatch.matches, ["dairy"]);

const puppyConflict = personalizePetSafety({
  ...verifiedAdultDogFood,
  productName: "Verified Puppy Chicken Recipe",
  lifeStage: "young",
}, {
  name: "Buddy",
  petType: "dog",
  lifeStage: "adult",
});
assert.equal(puppyConflict.level, "caution");
assert.match(puppyConflict.label, /life-stage fit for Buddy/i);

const allStagesSafe = personalizePetSafety({
  ...verifiedAdultDogFood,
  productName: "Verified Food for All Life Stages",
  lifeStage: "all life stages",
}, {
  name: "Buddy",
  petType: "dog",
  lifeStage: "senior",
});
assert.equal(allStagesSafe.level, "safe");
assert.equal(allStagesSafe.label, "No saved conflicts for Buddy");
assert.equal(allStagesSafe.personalized, true);

const genericConcern = personalizePetSafety({
  ...verifiedAdultDogFood,
  petSafety: {
    level: "caution",
    summary: "Review this formula with your veterinarian.",
  },
}, {
  name: "Buddy",
  petType: "dog",
  lifeStage: "adult",
});
assert.equal(genericConcern.level, "caution");
assert.equal(genericConcern.label, "Review this food for Buddy");

console.log("Pet-profile safety behavior check passed (8 scenarios).");
