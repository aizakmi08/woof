import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  catalogObservation,
  censusFormulaKey,
  censusServingMatchKey,
  createSourceAdapter,
  diffObservations,
  expandProductVariants,
  isTerminalFormulaExclusionReason,
  normalizeIdentity,
  normalizeGtin,
  refineVisibleFormulaIdentity,
  reconcileObservationsByGtin,
  validateRunCompleteness,
} from "./catalog-census-contract.mjs";
import { stripPublicRetailerTitleArtifacts } from "./catalog-formula-identity.mjs";

{
  const mapped = buildVerifiedSourceAliasCandidates(
    [
      {
        source_url: "https://www.chewy.com/formula-a/dp/100/?size=large",
        cache_key: "formula-a",
      },
      {
        source_url: "https://www.chewy.com/formula-a/dp/100",
        cache_key: "formula-a",
      },
      {
        source_url: "https://www.chewy.com/formula-b/dp/200",
        cache_key: "missing-serving-row",
      },
    ],
    [
      { cache_key: "formula-a", product_name: "Formula A" },
      { cache_key: "formula-b", product_name: "Formula B" },
    ]
  );
  assert.deepEqual(
    mapped.get("https://chewy.com/dp/100")?.map((row) => row.cache_key),
    ["formula-a"],
    "exact retailer package aliases should map to one verified serving formula"
  );
  assert.equal(
    mapped.has("https://chewy.com/dp/200"),
    false,
    "aliases without a verified serving row must not enter the census"
  );
}

assert.equal(
  normalizeGtin("79105128254"),
  "079105128254",
  "official UPC-A values missing the zero number-system digit must normalize to 12 digits"
);
assert.equal(
  refineVisibleFormulaIdentity({
    product_name: "Instinct FreshRaw Patties Grass-Fed Beef Recipe Dog Food",
    pet_type: "dog",
    food_form: "dry",
  }).food_form,
  "frozen",
  "product-local FreshRaw identity must repair a contaminated bag-derived dry form"
);
assert.equal(
  refineVisibleFormulaIdentity({
    product_name: "Freshpet Select Fresh From the Kitchen Chicken Recipe for Dogs",
    pet_type: "dog",
    food_form: "dry",
  }).food_form,
  "fresh",
  "product-local Freshpet identity must repair a contaminated bag-derived dry form"
);
assert.equal(
  refineVisibleFormulaIdentity({
    brand: "Blue Buffalo",
    product_name: "Love Made Fresh Beef Stew Tub | Adult Dog Food",
    pet_type: "dog",
    food_form: "wet",
  }).food_form,
  "fresh",
  "Love Made Fresh refrigerated identity must outrank the generic stew texture"
);
import {
  buildVerifiedFormulaAliasIndex,
  buildVerifiedSourceAliasCandidates,
  buildServingFormulaCandidates,
  canonicalConsumerBrand,
  canonicalUrl,
  reconcilePublicObservation,
  reconcileVerifiedFormulaAlias,
} from "./catalog-public-formula-reconciliation.mjs";
import { canonicalIngredientEvidence } from "../services/catalogIngredients.js";
import {
  loadReviewedFormulaExclusions,
} from "./catalog-reviewed-exclusions.mjs";
import {
  loadReviewedFormulaConflicts,
  reconcileReviewedFormulaConflict,
} from "./catalog-reviewed-conflicts.mjs";

{
  const sourceVersions = buildServingFormulaCandidates([
    {
      formula_key: "iams-lamb-rice",
      cache_key: "iams-lamb-rice-july",
      brand: "Iams",
      product_name: "Iams Proactive Health Adult Dry Dog Food Lamb and Rice",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Lamb meal, rice, barley, chicken fat, vitamins",
      image_url: "https://images.example/iams-lamb-rice-july.jpg",
      source_url: "https://retailer.example/iams-lamb-rice-july",
      source_quality: "retailer_verified",
      ingredient_verification_status: "retailer_verified",
      image_verification_status: "retailer_verified",
      formula_evidence_tier: "retailer_web_version",
      formula_version_provenance: { captured_at: "2026-07-01T00:00:00Z" },
    },
    {
      formula_key: "iams-lamb-rice",
      cache_key: "iams-lamb-rice-august",
      brand: "Iams",
      product_name: "Iams Proactive Health Adult Dry Dog Food Lamb and Rice",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Lamb meal, rice, barley, beet pulp, vitamins",
      image_url: "https://images.example/iams-lamb-rice-august.jpg",
      source_url: "https://retailer.example/iams-lamb-rice-august",
      source_quality: "retailer_verified",
      ingredient_verification_status: "retailer_verified",
      image_verification_status: "retailer_verified",
      formula_evidence_tier: "retailer_web_version",
      formula_version_provenance: { captured_at: "2026-08-01T00:00:00Z" },
    },
  ]);
  const latestVersion = reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Iams",
    product_name: "Iams Proactive Health Lamb Rice Recipe Adult Dry Dog Food",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
  }, sourceVersions);
  assert.equal(
    latestVersion?.match?.cache_key,
    "iams-lamb-rice-august",
    "an exact unversioned identity may prefer the unique latest retailer web version"
  );
  assert.equal(
    latestVersion?.deterministic_evidence,
    "unversioned_retailer_prefers_unique_latest_web_version"
  );

  const exactTitleVersions = sourceVersions.map((candidate) => ({
    ...candidate,
    product_name: "Iams Proactive Health Adult Dry Dog Food Lamb and Rice",
    flavor: "Lamb and Rice",
  }));
  const exactTitleLatestVersion = reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Iams",
    product_name: "Iams Proactive Health Adult Dry Dog Food Lamb and Rice",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
  }, exactTitleVersions);
  assert.equal(
    exactTitleLatestVersion?.match?.cache_key,
    "iams-lamb-rice-august",
    "an exact retailer title may select its unique latest verified source version even when structured recipe metadata makes canonical tokens asymmetric"
  );

  const currentManufacturer = buildServingFormulaCandidates([{
    formula_key: "iams-lamb-rice-current",
    cache_key: "iams-lamb-rice-manufacturer-current",
    brand: "Iams",
    product_name: "Iams Proactive Health Adult Dry Dog Food Lamb and Rice",
    flavor: "Lamb and Rice",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    gtin: "0019014012345",
    ingredient_text: "Lamb meal, rice, barley, chicken fat, vitamins, minerals",
    image_url: "https://images.example/iams-lamb-rice-current.jpg",
    source_url: "https://www.iams.com/dog-food/lamb-rice",
    source_quality: "manufacturer",
    ingredient_verification_status: "manufacturer",
    image_verification_status: "manufacturer",
    formula_evidence_tier: "manufacturer_current_exact",
  }])[0];
  const olderRetailerVersion = {
    source_type: "retailer",
    source_authority: "retailer_verified",
    brand: "Iams",
    product_name: "Iams Proactive Health Adult Dry Dog Food Lamb and Rice",
    flavor: "Lamb and Rice",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    gtin: "0019014098765",
    ingredient_text: "Lamb meal, rice, barley, beet pulp, vitamins",
    image_url: "https://images.example/iams-lamb-rice-old.jpg",
  };
  const strictPackageResolution = reconcilePublicObservation(
    olderRetailerVersion,
    [currentManufacturer, ...sourceVersions]
  );
  assert.notEqual(
    strictPackageResolution?.match?.cache_key,
    "iams-lamb-rice-manufacturer-current",
    "normal package resolution must not map an older retailer GTIN to the current manufacturer formula"
  );
  const formulaCoverageResolution = reconcilePublicObservation(
    olderRetailerVersion,
    [currentManufacturer, ...sourceVersions],
    { allowFormulaCoverageFallback: true }
  );
  assert.equal(
    formulaCoverageResolution?.match?.cache_key,
    "iams-lamb-rice-manufacturer-current",
    "formula coverage may credit the exact current manufacturer identity while preserving the older retailer package as a separate unresolved version"
  );
  assert.equal(
    formulaCoverageResolution?.deterministic_evidence,
    "formula_coverage_exact_identity_prefers_current_manufacturer"
  );

  const datedOfficialVersions = buildServingFormulaCandidates([
    {
      formula_key: "iams-lamb-rice-official-july",
      cache_key: "iams-lamb-rice-official-july",
      brand: "Iams",
      product_name: "Iams Proactive Health Adult Dry Dog Food Lamb and Rice",
      flavor: "Lamb and Rice",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Lamb meal, rice, barley, chicken fat, vitamins",
      image_url: "https://images.example/iams-lamb-rice-official-july.jpg",
      source_url: "https://www.iams.com/dog-food/lamb-rice-july",
      source_quality: "manufacturer",
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      formula_evidence_tier: "web_label_version",
      verified_at: "2026-07-01T00:00:00Z",
    },
    {
      formula_key: "iams-lamb-rice-official-august",
      cache_key: "iams-lamb-rice-official-august",
      brand: "Iams",
      product_name: "Iams Proactive Health Adult Dry Dog Food Lamb and Rice",
      flavor: "Lamb and Rice",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Lamb meal, rice, barley, beet pulp, vitamins",
      image_url: "https://images.example/iams-lamb-rice-official-august.jpg",
      source_url: "https://www.iams.com/dog-food/lamb-rice-august",
      source_quality: "manufacturer",
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      formula_evidence_tier: "web_label_version",
      verified_at: "2026-08-01T00:00:00Z",
    },
  ]);
  const datedOfficialCoverage = reconcilePublicObservation(
    olderRetailerVersion,
    datedOfficialVersions,
    { allowFormulaCoverageFallback: true }
  );
  assert.equal(
    datedOfficialCoverage?.match?.cache_key,
    "iams-lamb-rice-official-august",
    "formula coverage may use the unique latest dated authoritative source version without claiming package-version equivalence"
  );
  assert.equal(
    datedOfficialCoverage?.deterministic_evidence,
    "formula_coverage_prefers_unique_latest_verified_source_version"
  );
  const tiedOfficialVersions = datedOfficialVersions.map((candidate) => ({
    ...candidate,
    verified_at: "2026-08-01T00:00:00Z",
  }));
assert.equal(
  reconcilePublicObservation(
      olderRetailerVersion,
      tiedOfficialVersions,
      { allowFormulaCoverageFallback: true }
    )?.status,
    "conflicting_candidate_ingredient_evidence",
    "formula coverage must abstain when equally fresh authoritative versions disagree"
  );

  const exactIdentityCoverageCandidates = buildServingFormulaCandidates([
    {
      formula_key: "pedigree-choice-cuts-exact",
      cache_key: "pedigree-choice-cuts-exact",
      brand: "Pedigree",
      product_name:
        "Pedigree Choice Cuts in Gravy Steak & Vegetable Flavor Adult Canned Wet Dog Food can",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "wet",
    },
    {
      formula_key: "pedigree-choice-cuts-generic",
      cache_key: "pedigree-choice-cuts-generic",
      brand: "Pedigree",
      product_name:
        "CHOICE CUTS IN GRAVY Adult Wet Dog Food Can, Steak & Vegetable",
      flavor: "Steak & Vegetable",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "wet",
    },
  ]);
  const exactIdentityObservation = {
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Pedigree",
    product_name:
      "Pedigree Choice Cuts in Gravy Steak & Vegetable Flavor Adult Canned Wet Dog Food can",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "wet",
  };
  assert.equal(
    reconcilePublicObservation(
      exactIdentityObservation,
      exactIdentityCoverageCandidates
    )?.status,
    "ambiguous",
    "normal resolver matching must retain the configured sibling margin"
  );
  const exactIdentityCoverage = reconcilePublicObservation(
    exactIdentityObservation,
    exactIdentityCoverageCandidates,
    { allowFormulaCoverageFallback: true }
  );
  assert.equal(
    exactIdentityCoverage?.match?.cache_key,
    "pedigree-choice-cuts-exact",
    "formula coverage may credit one unique exact canonical token identity without changing resolver behavior"
  );
  assert.equal(
    exactIdentityCoverage?.deterministic_evidence,
    "formula_coverage_unique_exact_identity"
  );

  const tiedVersions = sourceVersions.map((candidate) => ({
    ...candidate,
    formula_version_provenance: { captured_at: "2026-08-01T00:00:00Z" },
  }));
  assert.equal(
    reconcilePublicObservation({
      source_type: "retailer",
      source_authority: "gap_discovery",
      brand: "Iams",
      product_name: "Iams Proactive Health Lamb Rice Recipe Adult Dry Dog Food",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
    }, tiedVersions)?.status,
    "conflicting_candidate_ingredient_evidence",
    "tied latest web versions with different ingredients must abstain"
  );

  const exactTitleTiedVersions = exactTitleVersions.map((candidate) => ({
    ...candidate,
    formula_version_provenance: { captured_at: "2026-08-01T00:00:00Z" },
  }));
  assert.equal(
    reconcilePublicObservation({
      source_type: "retailer",
      source_authority: "gap_discovery",
      brand: "Iams",
      product_name: "Iams Proactive Health Adult Dry Dog Food Lamb and Rice",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
    }, exactTitleTiedVersions)?.status,
    "conflicting_candidate_ingredient_evidence",
    "an exact title must still abstain when equally fresh verified versions disagree"
  );

  const reviewedAliasCandidate = buildServingFormulaCandidates([{
    formula_key: "hill-sensitive-salmon",
    cache_key: "hill:052742070261",
    brand: "Hill's Science Diet",
    product_name:
      "Hill's Science Diet Adult Sensitive Stomach & Skin Salmon & Vegetable Entree Minced Wet Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
    ingredient_text: "Salmon, chicken, broth, rice, vitamins, minerals",
    image_url: "https://images.example/hill-sensitive-salmon.jpg",
    source_url: "https://www.hillspet.com/cat-food/sensitive-salmon",
    source_quality: "manufacturer",
    ingredient_verification_status: "manufacturer",
    image_verification_status: "manufacturer",
    formula_evidence_tier: "manufacturer_current_exact",
  }])[0];
  const reviewedAliasResolution = reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Hill's Science Diet",
    product_name:
      "Hill's Science Diet Adult Sensitive Stomach & Skin Salmon & Vegetable Entree Minced Wet Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
    source_url: "https://www.chewy.com/hills-sensitive/dp/1104070",
  }, [reviewedAliasCandidate], {
    exactSourceCandidates: [reviewedAliasCandidate],
  });
  assert.equal(
    reviewedAliasResolution?.match?.cache_key,
    "hill:052742070261",
    "an exact reviewed retailer URL alias must resolve to its verified serving row even when that row retains the manufacturer PDP"
  );
  assert.equal(
    reviewedAliasResolution?.deterministic_evidence,
    "verified_retailer_source_alias"
  );

  const omittedRecipeAliasCandidate = buildServingFormulaCandidates([{
    formula_key: "eukanuba-senior-small-chicken",
    cache_key: "eukanuba-senior-small-chicken",
    brand: "Eukanuba",
    product_name: "Eukanuba Senior Small Breed Chicken Dry Dog Food",
    pet_type: "dog",
    life_stage: "senior",
    food_form: "dry",
    ingredient_text: "Chicken, corn, rice, fat, vitamins, minerals",
    image_url: "https://images.example/eukanuba-senior-small-chicken.jpg",
    source_url: "https://example.invalid/manufacturer/eukanuba-senior-small",
    source_quality: "manufacturer",
    ingredient_verification_status: "manufacturer",
    image_verification_status: "manufacturer",
    formula_evidence_tier: "manufacturer_current_exact",
  }])[0];
  const omittedRecipeAliasObservation = {
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Eukanuba",
    product_name: "Eukanuba Senior Small Breed Dry Dog Food",
    pet_type: "dog",
    life_stage: "senior",
    food_form: "dry",
    source_url: "https://www.chewy.com/eukanuba-senior-small/dp/fixture",
  };
  assert.equal(
    reconcilePublicObservation(
      omittedRecipeAliasObservation,
      [omittedRecipeAliasCandidate],
      { exactSourceCandidates: [omittedRecipeAliasCandidate] }
    )?.match?.cache_key,
    "eukanuba-senior-small-chicken",
    "an exact reviewed source alias may supply a recipe omitted by the retailer census title"
  );
  assert.equal(
    reconcilePublicObservation({
      ...omittedRecipeAliasObservation,
      product_name: "Eukanuba Senior Small Breed Lamb Dry Dog Food",
    }, [omittedRecipeAliasCandidate], {
      exactSourceCandidates: [omittedRecipeAliasCandidate],
    })?.match,
    null,
    "an exact source alias must still abstain when the visible recipe conflicts"
  );
  assert.equal(
    reconcilePublicObservation({
      ...omittedRecipeAliasObservation,
      product_name: "Eukanuba Senior Large Breed Dry Dog Food",
    }, [omittedRecipeAliasCandidate], {
      exactSourceCandidates: [omittedRecipeAliasCandidate],
    })?.match,
    null,
    "an exact source alias must still abstain across breed-size siblings"
  );
  assert.equal(
    reconcilePublicObservation({
      ...omittedRecipeAliasObservation,
      product_name: "Eukanuba Senior Small Breed Wet Dog Food",
      food_form: "wet",
    }, [omittedRecipeAliasCandidate], {
      exactSourceCandidates: [omittedRecipeAliasCandidate],
    })?.match,
    null,
    "an exact source alias must still abstain across food forms"
  );

  assert.equal(canonicalConsumerBrand("BLUE Basics"), "blue buffalo");
  assert.equal(canonicalConsumerBrand("Royal Canin Veterinary Diet"), "royal canin");
  assert.equal(
    canonicalConsumerBrand("Pro Plan Veterinary Diets"),
    "purina pro plan veterinary diets"
  );

  const conflictingReviewedAliases = sourceVersions.map((candidate) => ({
    ...candidate,
    formula_version_provenance: { captured_at: "2026-08-01T00:00:00Z" },
  }));
  assert.equal(
    reconcilePublicObservation({
      source_type: "retailer",
      source_authority: "gap_discovery",
      brand: "Iams",
      product_name: "Iams Proactive Health Lamb Rice Recipe Adult Dry Dog Food",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      source_url: "https://www.chewy.com/iams-lamb-rice/dp/fixture",
    }, conflictingReviewedAliases, {
      exactSourceCandidates: conflictingReviewedAliases,
    })?.status,
    "conflicting_candidate_ingredient_evidence",
    "reviewed retailer aliases with tied current ingredient versions must still abstain"
  );
}

const slicedTextureCandidates = buildServingFormulaCandidates([
  {
    formula_key: "wellness-turkey-salmon-pate",
    cache_key: "wellness-turkey-salmon-pate",
    brand: "Wellness",
    product_name: "Wellness Complete Health Pate Turkey & Salmon Wet Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
  },
  {
    formula_key: "wellness-turkey-salmon-sliced",
    cache_key: "wellness-turkey-salmon-sliced",
    brand: "Wellness",
    product_name: "Wellness Complete Health Sliced Turkey & Salmon Wet Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
  },
]);
assert.equal(
  reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Wellness",
    product_name: "Wellness Complete Health Sliced Turkey & Salmon Wet Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
  }, slicedTextureCandidates)?.match?.cache_key,
  "wellness-turkey-salmon-sliced",
  "sliced wet food must never resolve to the pate sibling"
);

const exactAdultSevenSourceAlias = reconcilePublicObservation(
  {
    brand: "Blue Buffalo",
    product_name: "Blue Buffalo Tastefuls Chicken & Brown Rice Recipe Adult 7+ Dry Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "dry",
    source_priority: "retailer",
    source_authority: "gap_discovery",
  },
  [
    {
      cache_key: "retailer-web:chewy:adult-seven",
      formula_key: "blue-buffalo-tastefuls-adult-seven",
      brand: "Blue Buffalo",
      product_name: "Blue Buffalo Tastefuls Chicken & Brown Rice Recipe Adult 7+ Dry Cat Food",
      pet_type: "cat",
      life_stage: "senior",
      food_form: "dry",
      ingredient_text: "Chicken, chicken meal, brown rice, barley, oatmeal, peas.",
      source_quality: "retailer_verified",
    },
  ],
  {
    exactSourceCandidates: [
      {
        cache_key: "retailer-web:chewy:adult-seven",
        formula_key: "blue-buffalo-tastefuls-adult-seven",
        brand: "Blue Buffalo",
        product_name: "Blue Buffalo Tastefuls Chicken & Brown Rice Recipe Adult 7+ Dry Cat Food",
        pet_type: "cat",
        life_stage: "senior",
        food_form: "dry",
        ingredient_text: "Chicken, chicken meal, brown rice, barley, oatmeal, peas.",
        source_quality: "retailer_verified",
      },
    ],
  }
);
assert.equal(
  exactAdultSevenSourceAlias.status,
  "matched_verified_formula",
  "an exact reviewed PDP/title must survive adult-7+ stage normalization"
);

const wellnessLineBoundaryCandidates = buildServingFormulaCandidates([
  {
    formula_key: "wellness-complete-health-large-breed",
    cache_key: "wellness-complete-health-large-breed",
    brand: "Wellness",
    product_name: "Wellness Complete Health Large Breed Chicken & Brown Rice Adult Dry Dog Food",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
  },
  {
    formula_key: "wellness-core-large-breed",
    cache_key: "wellness-core-large-breed",
    brand: "Wellness",
    product_name: "Wellness CORE Grain-Free Large Breed Chicken Adult Dry Dog Food",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
  },
]);
const wellnessLineResolution = reconcilePublicObservation({
  source_type: "retailer",
  source_authority: "gap_discovery",
  brand: "Wellness",
  product_name: "Wellness Complete Health Large Breed Chicken & Brown Rice Adult Dry Dog Food",
  pet_type: "dog",
  life_stage: "adult",
  food_form: "dry",
}, wellnessLineBoundaryCandidates);
assert.equal(
  wellnessLineResolution?.match?.cache_key,
  "wellness-complete-health-large-breed",
  "Wellness Complete Health must never resolve to the CORE sibling"
);
assert.ok(
  (wellnessLineResolution?.candidates || []).every((candidate) => (
    candidate.score >= 0
    && candidate.score <= 1
    && candidate.recall >= 0
    && candidate.recall <= 1
  )),
  "candidate scoring must stay within probability-style bounds"
);

const weruvaTextureCandidates = buildServingFormulaCandidates([
  {
    formula_key: "weruva-puree",
    cache_key: "weruva-puree",
    brand: "Weruva",
    product_name: "Weruva Chicken Puree Wet Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
  },
  {
    formula_key: "weruva-gravy",
    cache_key: "weruva-gravy",
    brand: "Weruva",
    product_name: "Weruva Chicken in Gravy Wet Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
  },
]);
assert.equal(
  reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Weruva",
    product_name: "Weruva Chicken Pureed Wet Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
  }, weruvaTextureCandidates)?.match?.cache_key,
  "weruva-puree",
  "pureed wet food must never resolve to a gravy sibling"
);

const exactRetailerPdpMetadataRepair = reconcilePublicObservation({
  source_type: "retailer",
  source_authority: "gap_discovery",
  brand: "Hill's Prescription Diet",
  product_name: "Hill's Prescription Diet Metabolic Weight + j/d Vegetable & Tuna Stew Wet Cat Food",
  pet_type: "cat",
  life_stage: "unknown",
  food_form: "wet",
  source_url: "https://www.chewy.com/hills-prescription-diet-metabolic/dp/3998006",
}, buildServingFormulaCandidates([{
  formula_key: "hills-metabolic-jd-tuna",
  cache_key: "hills-metabolic-jd-tuna",
  brand: "Hill's Prescription Diet",
  product_name: "Metabolic Weight + j/d Vegetable and Tuna Wet Cat Food",
  product_line: "Metabolic Weight + j/d Vegetable and Tuna",
  pet_type: "cat",
  life_stage: "unknown",
  food_form: "wet",
  source_url: "https://www.chewy.com/hills-prescription-diet-metabolic/dp/3998006",
}]));
assert.equal(
  exactRetailerPdpMetadataRepair?.match?.cache_key,
  "hills-metabolic-jd-tuna",
  "one exact retailer PDP may repair missing texture metadata without fuzzy sibling matching"
);
assert.equal(
  reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Natural Balance",
    product_name: "Natural Balance Duck & Potato Puppy Dry Dog Food",
    pet_type: "dog",
    life_stage: "puppy",
    food_form: "dry",
    source_url: "https://www.chewy.com/natural-balance/dp/537318",
  }, buildServingFormulaCandidates([{
    formula_key: "unsafe-cross-form",
    cache_key: "unsafe-cross-form",
    brand: "Natural Balance",
    product_name: "Natural Balance Duck & Potato Adult Wet Dog Food",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "wet",
    source_url: "https://www.chewy.com/natural-balance/dp/537318",
  }]))?.match,
  null,
  "an exact retailer URL must still abstain across life-stage and food-form boundaries"
);

const reviewedSourceMetadataRepairCandidate = buildServingFormulaCandidates([{
  formula_key: "reviewed-source-metadata-repair",
  cache_key: "reviewed-source-metadata-repair",
  brand: "Hill's Prescription Diet",
  product_name: "Metabolic Weight + j/d Vegetable and Tuna Wet Cat Food",
  pet_type: "cat",
  life_stage: "unknown",
  food_form: "wet",
  source_url: "https://example.invalid/manufacturer-row",
}]);
assert.equal(
  reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Hill's Prescription Diet",
    product_name: "Hill's Prescription Diet Metabolic Weight + j/d Vegetable & Tuna Stew Wet Cat Food",
    pet_type: "cat",
    life_stage: "unknown",
    food_form: "wet",
    source_url: "https://www.chewy.com/hills-prescription-diet-metabolic/dp/3998006",
  }, reviewedSourceMetadataRepairCandidate, {
    exactSourceCandidates: reviewedSourceMetadataRepairCandidate,
  })?.match?.cache_key,
  "reviewed-source-metadata-repair",
  "an exact evidence-backed source alias may repair missing texture metadata"
);

const royalCaninRenalCandidates = buildServingFormulaCandidates([
  {
    formula_key: "royal-canin-renal-a",
    brand: "Royal Canin",
    product_name: "Royal Canin Veterinary Diet Feline Renal Support A Adult Dry Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "dry",
  },
  {
    formula_key: "royal-canin-renal-s",
    brand: "Royal Canin",
    product_name: "Royal Canin Veterinary Diet Feline Renal Support S Adult Dry Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "dry",
  },
]);
assert.equal(
  reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Royal Canin",
    product_name: "Royal Canin Veterinary Diet Adult Renal Support A Dry Cat Food",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "dry",
  }, royalCaninRenalCandidates)?.match?.formula_key,
  "royal-canin-renal-a",
  "Royal Canin Renal Support A must not remain ambiguous with the S sibling"
);

const proPlanBoundaryCandidates = buildServingFormulaCandidates([
  {
    formula_key: "pro-plan-generic-puppy",
    brand: "Purina Pro Plan",
    product_name: "Pro Plan Puppy Chicken & Rice Formula Dry Dog Food",
    pet_type: "dog",
    life_stage: "puppy",
    food_form: "dry",
  },
  {
    formula_key: "pro-plan-large-breed-puppy",
    brand: "Purina Pro Plan",
    product_name: "Pro Plan Puppy Large Breed Chicken & Rice Formula Dry Dog Food",
    pet_type: "dog",
    life_stage: "puppy",
    food_form: "dry",
  },
  {
    formula_key: "pro-plan-small-breed-standard",
    brand: "Purina Pro Plan",
    product_name: "Pro Plan Adult Small Breed Chicken & Rice Formula Dry Dog Food",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
  },
  {
    formula_key: "pro-plan-small-breed-shredded",
    brand: "Purina Pro Plan",
    product_name: "Pro Plan Adult Small Breed Shredded Blend Chicken & Rice Formula Dry Dog Food",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
  },
]);
assert.equal(
  reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Purina Pro Plan",
    product_name: "Purina Pro Plan Puppy Dry Dog Food for Large Dogs Under 2 Years Real Chicken Rice",
    pet_type: "dog",
    life_stage: "puppy",
    food_form: "dry",
  }, proPlanBoundaryCandidates)?.match?.formula_key,
  "pro-plan-large-breed-puppy",
  "an explicit large-breed title must not compete with the generic puppy sibling"
);
assert.equal(
  reconcilePublicObservation({
    source_type: "retailer",
    source_authority: "gap_discovery",
    brand: "Purina Pro Plan",
    product_name: "Purina Pro Plan Small Breed Shredded Blend Adult Chicken Rice Dry Dog Food",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
  }, proPlanBoundaryCandidates)?.match?.formula_key,
  "pro-plan-small-breed-shredded",
  "an explicit shredded presentation must not compete with the standard kibble sibling"
);

const exactAliasIngredientText = [
  "Chicken",
  "Rice",
  "Chicken Meal",
  "Fish Oil",
  "Vitamin E Supplement",
].join(", ");
const exactAliasCandidate = buildServingFormulaCandidates([{
  cache_key: "fixture:protected-formula",
  formula_key:
    "fixture|protected brand|exact line|dog|adult|dry|chicken and rice|",
  brand: "Protected Brand",
  product_name: "Exact Line Chicken & Rice Adult Dry Dog Food",
  product_line: "Exact Line",
  flavor: "Chicken & Rice",
  pet_type: "dog",
  life_stage: "adult",
  food_form: "dry",
  ingredient_text: exactAliasIngredientText,
  ingredient_count: 5,
  source_url: "https://protected.example/products/exact-line",
  image_url: "https://protected.example/images/exact-line.png",
  formula_evidence_tier: "manufacturer_current_exact",
  source_quality: "manufacturer",
  ingredient_verification_status: "manufacturer",
  image_verification_status: "manufacturer",
  formula_version_provenance: { ingredient_text_hash: "fixture-database-hash" },
  is_complete_food: true,
}]);
const exactAliasManifest = [{
  alias_formula_key:
    "fixture|parent brand|parent brand exact line chicken rice dry dog food|dog|unknown|dry||",
  source_url: "https://retailer.example/products/123",
  official_source_url: "https://protected.example/products/exact-line",
  cache_key: "fixture:protected-formula",
  review_method: "exact_existing_formula_identity_only",
  reviewed_at: "2026-08-04T23:30:00.000Z",
  reviewed_original_evidence_tier: "unverified",
  retailer_identity_only: true,
  retailer_ingredient_verification: false,
  retailer_source_slug: "retailer-public-sitemap",
  retailer_product_id: "123",
  retailer_title: "Parent Brand Exact Line Chicken Rice Dry Dog Food",
  retailer_observed_at: "2026-08-04T22:30:00.000Z",
  retailer_front_image_url: "https://retailer.example/images/123.jpg",
  retailer_content_hash: "a".repeat(64),
  required_title_terms: [
    "parent brand",
    "exact line",
    "chicken",
    "rice",
    "dry dog food",
  ],
  observed_identity: {
    brand: "Parent Brand",
    pet_type: "dog",
    life_stage: "unknown",
    food_form: "dry",
  },
  target_identity: {
    brand: "Protected Brand",
    product_name: "Exact Line Chicken & Rice Adult Dry Dog Food",
    product_line: "Exact Line",
    flavor: "Chicken & Rice",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
  },
  official_image_url: "https://protected.example/images/exact-line.png",
  official_ingredient_count: 5,
  official_database_ingredient_hash: "fixture-database-hash",
  official_canonical_ingredient_hash: createHash("sha256")
    .update(canonicalIngredientEvidence(exactAliasIngredientText))
    .digest("hex"),
}];
const exactAliasIndex = buildVerifiedFormulaAliasIndex(
  exactAliasManifest,
  exactAliasCandidate,
  { strict: true }
);
const refreshedExactAliasManifest = [{
  ...exactAliasManifest[0],
  target_serving_formula_key: exactAliasCandidate[0].formula_key,
  refreshed_official_observed_at: "2026-08-05T00:03:03.400Z",
  refreshed_official_artifact: "outputs/catalog-source-imports/fixture/feed.csv",
  refreshed_official_source_url: exactAliasManifest[0].official_source_url,
  refreshed_official_image_url: exactAliasManifest[0].official_image_url,
  refreshed_official_canonical_ingredient_hash:
    exactAliasManifest[0].official_canonical_ingredient_hash,
}];
assert.doesNotThrow(
  () => buildVerifiedFormulaAliasIndex(
    refreshedExactAliasManifest,
    exactAliasCandidate,
    { strict: true }
  ),
  "a refreshed official artifact may lock the same exact serving formula"
);
assert.throws(
  () => buildVerifiedFormulaAliasIndex([{
    ...refreshedExactAliasManifest[0],
    target_serving_formula_key: `${exactAliasCandidate[0].formula_key} sibling`,
  }], exactAliasCandidate, { strict: true }),
  /unresolved official serving or reviewed evidence reference/,
  "a refreshed review must not cross its frozen serving formula boundary"
);
assert.throws(
  () => buildVerifiedFormulaAliasIndex([{
    ...refreshedExactAliasManifest[0],
    refreshed_official_canonical_ingredient_hash: "f".repeat(64),
  }], exactAliasCandidate, { strict: true }),
  /unresolved official serving or reviewed evidence reference/,
  "changed refreshed official ingredients must invalidate an existing-formula alias"
);
const exactPackageVisualManifest = [{
  ...exactAliasManifest[0],
  retailer_front_image_url:
    "https://target.scene7.com/is/image/Target/GUEST_fixture",
  manual_package_image_match: true,
  retailer_package_identifier: "fixture-package-123",
  official_package_identifier: "fixture-package-123",
  retailer_front_image_sha256: "b".repeat(64),
  official_artifact_image_sha256: "c".repeat(64),
}];
assert.doesNotThrow(
  () => buildVerifiedFormulaAliasIndex(
    exactPackageVisualManifest,
    exactAliasCandidate,
    { strict: true }
  ),
  "an exact frozen package image and matching package identifier may support an identity-only alias"
);
assert.throws(
  () => buildVerifiedFormulaAliasIndex([{
    ...exactPackageVisualManifest[0],
    official_package_identifier: "sibling-package-456",
  }], exactAliasCandidate, { strict: true }),
  /unresolved official serving or reviewed evidence reference/,
  "a package identifier mismatch must invalidate a visual identity alias"
);
const exactFrontLabelOcrManifest = [{
  ...exactAliasManifest[0],
  retailer_front_image_url:
    "https://image.chewy.com/catalog/general/images/fixture.jpg",
  retailer_front_image_sha256: "d".repeat(64),
  official_artifact_image_sha256: "e".repeat(64),
  manual_front_label_ocr_match: true,
  retailer_front_label_ocr:
    "EXACT LINE CHICKEN & RICE ADULT DRY DOG FOOD",
  official_front_label_ocr:
    "EXACT LINE CHICKEN AND RICE ADULT DRY DOG FOOD",
  required_ocr_terms: ["exact line", "chicken", "rice", "dry dog food"],
}];
assert.doesNotThrow(
  () => buildVerifiedFormulaAliasIndex(
    exactFrontLabelOcrManifest,
    exactAliasCandidate,
    { strict: true }
  ),
  "exact protected terms on frozen retailer and manufacturer fronts may prove identity"
);
assert.throws(
  () => buildVerifiedFormulaAliasIndex([{
    ...exactFrontLabelOcrManifest[0],
    official_front_label_ocr:
      "EXACT LINE CHICKEN ADULT DRY DOG FOOD",
  }], exactAliasCandidate, { strict: true }),
  /unresolved official serving or reviewed evidence reference/,
  "a missing protected OCR recipe term must invalidate the visual identity alias"
);
const exactFrontLabelVisualManifest = [{
  ...exactAliasManifest[0],
  retailer_front_image_url:
    "https://image.chewy.com/catalog/general/images/fixture-visual.jpg",
  retailer_front_image_sha256: "1".repeat(64),
  official_artifact_image_sha256: "2".repeat(64),
  manual_front_label_visual_match: true,
  retailer_front_label_ocr:
    "PARENT BRAND EXACT LINE CHICKEN AND RICE DRY DOG FOOD",
  protected_identity_terms: ["exact line", "chicken", "rice", "dry dog food"],
}];
assert.doesNotThrow(
  () => buildVerifiedFormulaAliasIndex(
    exactFrontLabelVisualManifest,
    exactAliasCandidate,
    { strict: true }
  ),
  "a manual review of frozen retailer and official fronts may prove identity when four protected terms agree"
);
assert.throws(
  () => buildVerifiedFormulaAliasIndex([{
    ...exactFrontLabelVisualManifest[0],
    protected_identity_terms: [
      "exact line", "chicken", "rice", "small breed", "dry dog food",
    ],
  }], exactAliasCandidate, { strict: true }),
  /unresolved official serving or reviewed evidence reference/,
  "a protected visual identity term absent from the exact target must invalidate the alias"
);
const exactAliasObservation = {
  manufacturer: "Fixture",
  formula_key: exactAliasManifest[0].alias_formula_key,
  source_url: exactAliasManifest[0].source_url,
  source_slug: exactAliasManifest[0].retailer_source_slug,
  source_external_id: exactAliasManifest[0].retailer_product_id,
  content_hash: exactAliasManifest[0].retailer_content_hash,
  observed_at: exactAliasManifest[0].retailer_observed_at,
  product_name: exactAliasManifest[0].retailer_title,
  brand: "Parent Brand",
  pet_type: "dog",
  life_stage: "unknown",
  food_form: "dry",
  image_url: exactAliasManifest[0].retailer_front_image_url,
};
function legacyRetailerRunHash(row) {
  return createHash("sha256").update(JSON.stringify({
    source_slug: row.source_slug,
    source_type: row.source_type,
    source_authority: row.source_authority,
    source_external_id: row.source_external_id,
    source_url: row.source_url,
    product_name: row.product_name,
    brand: row.brand,
    source_target_slug: row.source_target_slug,
    pet_type: row.pet_type,
    life_stage: row.life_stage,
    food_form: row.food_form,
    image_url: row.image_url,
    image_reuse_status: row.image_reuse_status,
    available_in_us: row.available_in_us,
    observed_at: row.observed_at,
  })).digest("hex");
}
assert.equal(
  reconcileVerifiedFormulaAlias(exactAliasObservation, exactAliasIndex)?.match?.cache_key,
  "fixture:protected-formula",
  "a frozen exact retailer identity must reconcile to its locked existing formula"
);
assert.equal(
  reconcileVerifiedFormulaAlias({
    ...exactAliasObservation,
    formula_key: undefined,
  }, exactAliasIndex)?.match?.cache_key,
  "fixture:protected-formula",
  "raw retailer observations must derive the same frozen formula key before catalog materialization"
);
assert.equal(
  reconcileVerifiedFormulaAlias({
    ...exactAliasObservation,
    content_hash: "b".repeat(64),
  }, exactAliasIndex),
  null,
  "changed retailer content must invalidate a frozen identity alias"
);
const exactAliasRecensusObservation = {
  ...exactAliasObservation,
  source_type: "retailer",
  source_authority: "gap_discovery",
  source_target_slug: "fixture-official",
  image_reuse_status: "discovery_only",
  available_in_us: true,
  observed_at: "2026-08-05T01:00:00.000Z",
};
exactAliasRecensusObservation.content_hash = legacyRetailerRunHash(
  exactAliasRecensusObservation
);
assert.equal(
  reconcileVerifiedFormulaAlias(
    exactAliasRecensusObservation,
    exactAliasIndex
  )?.match?.cache_key,
  "fixture:protected-formula",
  "a newly generated census hash may drift only when every frozen retailer identity field is unchanged"
);
const changedRecensusImage = {
  ...exactAliasRecensusObservation,
  image_url: "https://retailer.example/images/sibling.jpg",
};
changedRecensusImage.content_hash = legacyRetailerRunHash(changedRecensusImage);
assert.equal(
  reconcileVerifiedFormulaAlias(changedRecensusImage, exactAliasIndex),
  null,
  "a fresh census image change must invalidate the frozen exact identity alias"
);
assert.equal(
  reconcileVerifiedFormulaAlias({
    ...exactAliasObservation,
    formula_key: `${exactAliasObservation.formula_key} sibling`,
  }, exactAliasIndex),
  null,
  "a sibling formula key must not inherit a reviewed exact identity alias"
);

const base = {
  manufacturer: "Nestle Purina",
  brand: "Beneful",
  product_name: "Beneful Originals Farm-Raised Beef Dry Dog Food 14 lb",
  product_line: "Originals",
  pet_type: "dog",
  life_stage: "adult",
  food_form: "dry",
  flavor: "Farm-Raised Beef",
  source: "nestle-purina-beneful",
  source_url: "https://example.test/beneful-originals-beef",
};

const sourceTargets = JSON.parse(fs.readFileSync("scripts/catalog-source-targets.json", "utf8"));
const reviewedFormulaAliases = JSON.parse(
  fs.readFileSync("inputs/catalog-reviewed-formula-aliases.json", "utf8")
);
const reviewedExistingFormulaIdentityAliases = JSON.parse(
  fs.readFileSync(
    "inputs/catalog-reviewed-existing-formula-identity-aliases-20260804.json",
    "utf8"
  )
);
const reviewedShebaFrontLabelOcrAliases = JSON.parse(
  fs.readFileSync(
    "inputs/catalog-reviewed-sheba-front-label-ocr-aliases-20260805.json",
    "utf8"
  )
);
const reviewedWellnessFrontLabelVisualAliases = JSON.parse(
  fs.readFileSync(
    "inputs/catalog-reviewed-wellness-front-label-visual-aliases-20260805.json",
    "utf8"
  )
);
const reviewedTikiCatDryExistingFormulaIdentityAliases = JSON.parse(
  fs.readFileSync(
    "inputs/catalog-reviewed-tiki-cat-dry-existing-formula-identity-aliases-20260804.json",
    "utf8"
  )
);
const officialFeedCanonicalStage = fs.readFileSync(
  "scripts/catalog-official-feed-canonical-stage.mjs",
  "utf8"
);
const independentCensusSource = fs.readFileSync(
  "scripts/catalog-independent-census.mjs",
  "utf8"
);
const boundedEvidencePromotion = fs.readFileSync(
  "supabase/migrations/20260803120000_allow_completed_bounded_exact_evidence_promotion.sql",
  "utf8"
);
const quarantinedBoundedEvidencePromotion = fs.readFileSync(
  "supabase/migrations/20260803121000_allow_quarantined_bounded_exact_evidence_promotion.sql",
  "utf8"
);
assert.match(
  independentCensusSource,
  /food\\s\+complement/,
  "explicit food complements must never inflate the complete-food formula denominator"
);
assert.match(
  boundedEvidencePromotion,
  /bounded_exact_evidence/,
  "bounded official formula batches must remain explicitly labeled"
);
assert.match(
  boundedEvidencePromotion,
  /expected_count, -1\) = source_run\.observed_count/,
  "bounded exact-evidence promotion must require a complete internal batch"
);
assert.match(
  boundedEvidencePromotion,
  /source_run\.rejected_count = 0/,
  "bounded exact-evidence promotion must fail closed when any observation is rejected"
);
assert.match(
  boundedEvidencePromotion,
  /REVOKE ALL ON FUNCTION public\.promote_catalog_formula\(BIGINT\) FROM authenticated/,
  "bounded promotion must remain service-role-only"
);
assert.match(
  quarantinedBoundedEvidencePromotion,
  /source_run\.error_summary = 'run_not_proven_complete'/,
  "a bounded quarantined run must be admitted only for the expected incomplete-crawl reason"
);
assert.match(
  quarantinedBoundedEvidencePromotion,
  /source_run\.observed_count = source_run\.accepted_count/,
  "every bounded exact-evidence observation must be accepted before promotion"
);
assert.match(
  quarantinedBoundedEvidencePromotion,
  /REVOKE ALL ON FUNCTION public\.promote_catalog_formula\(BIGINT\) FROM PUBLIC/,
  "quarantined bounded promotion must remain unavailable to public callers"
);
assert.match(
  officialFeedCanonicalStage,
  /censusFormulaKey/,
  "official-feed staging must use the shared canonical formula identity"
);
assert.match(
  officialFeedCanonicalStage,
  /package_size_is_sku_only/,
  "official-feed staging must preserve package size as SKU-only evidence"
);
assert.match(
  officialFeedCanonicalStage,
  /superseded_by_current_official_inventory/,
  "full official inventories must emit a reversible stale-serving guard"
);
assert.match(
  officialFeedCanonicalStage,
  /JOIN public\.product_data p ON p\.cache_key = f\.promoted_cache_key/,
  "stale-serving guards must verify exact canonical-to-serving links instead of relying on listing counts or URLs"
);
assert.match(
  officialFeedCanonicalStage,
  /Official serving identity collision/,
  "official-feed staging must reject cache-key collisions before promotion"
);
assert.match(
  officialFeedCanonicalStage,
  /--include-cache-key-file/,
  "official-feed canonical staging must support a bounded exact-serving include set"
);
assert.match(
  officialFeedCanonicalStage,
  /--sku-only-cache-key-file/,
  "official-feed staging must retain exact package/count variants as SKU-only observations"
);
assert.match(
  officialFeedCanonicalStage,
  /SKU-only rows cannot be the sole serving evidence for formulas/,
  "a SKU-only observation must never become a formula without exact serving evidence"
);
assert.match(
  officialFeedCanonicalStage,
  /Included serving identities missing from official feed/,
  "bounded canonical staging must fail closed when a requested serving identity is absent"
);
assert.match(
  officialFeedCanonicalStage,
  /function officialServingCacheKey/,
  "official feeds with blank cache keys must derive the exact serving identity from source plus GTIN"
);
assert.match(
  officialFeedCanonicalStage,
  /function importerIdentityText/,
  "GTIN-less official feeds must reuse the established deterministic serving identity"
);
assert.match(
  officialFeedCanonicalStage,
  /sourceUrlIdentitySegment/,
  "GTIN-less serving identity must remain bound to the exact official PDP path"
);
assert.match(
  officialFeedCanonicalStage,
  /Exact serving evidence incomplete or colliding/,
  "official-feed staging must verify every accepted serving row before choosing one representative per formula"
);
assert.match(
  officialFeedCanonicalStage,
  /validateScraperCandidate/,
  "official-feed canonical staging must revalidate every formula before ledger staging"
);
const pedigreeTarget = sourceTargets.find((target) => target.sourceSlug === "pedigree-mars-petcare");
assert.ok(
  pedigreeTarget?.discovery?.terminalExcludedUrls?.some((url) => url.includes("pedigreechoice-cuts-gravy-30ct")),
  "known Pedigree three-recipe variety-pack URL must remain excluded from the formula denominator"
);
assert.ok(
  pedigreeTarget?.discovery?.terminalExcludedUrls?.some((url) => url.includes("pedigree-choice-cuts-gravy-adult-soft-wet-dog-food-48ct"))
  && pedigreeTarget?.discovery?.terminalExcludedUrls?.some((url) => url.includes("choice-cuts-gravy-adult-wet-dog-food-pouches-48-count-variety-pack")),
  "the legacy and canonical Pedigree 48-count variety-pack URLs must remain excluded from the formula denominator"
);
const healthExtensionTarget = sourceTargets.find(
  (target) => target.sourceSlug === "health-extension"
);
assert.ok(
  healthExtensionTarget?.discovery?.terminalExcludedUrls?.includes(
    "https://www.healthextension.com/products/air-dried-complete-samples"
  ),
  "Health Extension's three-recipe sample parent must remain excluded from the formula denominator"
);
assert.match(
  healthExtensionTarget?.discovery?.excludedUrlPattern ?? "",
  /samples\?/,
  "Health Extension sample parents must remain excluded from future official discovery"
);
const smallbatchTarget = sourceTargets.find(
  (target) => target.sourceSlug === "smallbatch-pets"
);
assert.ok(
  smallbatchTarget?.discovery?.terminalExcludedUrls?.includes(
    "https://smallbatchpets.com/products/frozen-raw-beef-sliders-for-dogs-test"
  ),
  "the obsolete smallbatch Beef Patties test route must never re-enter the active formula denominator"
);
const royalHairSkinChunksAlias = reviewedFormulaAliases.find(
  (row) => row.source_url ===
    "https://www.royalcanin.com/us/cats/products/retail-products/intense-beauty-gravy-4071"
);
assert.equal(
  royalHairSkinChunksAlias?.cache_key,
  "royal-canin-mars-petcare:1053796:030111152855",
  "Royal Canin's legacy Intense Beauty pouch must reconcile only to the exact current same-GTIN Hair & Skin Chunks in Gravy formula"
);
assert.match(
  royalHairSkinChunksAlias?.review_reason ?? "",
  /Thin Slices in Gravy and Loaf in Sauce remain separate/,
  "Royal Canin Hair & Skin package reconciliation must preserve presentation siblings"
);
const reviewedFormulaExclusions = loadReviewedFormulaExclusions();
assert(
  reviewedFormulaExclusions.rows.every((row) => canonicalUrl(row.source_url)),
  "every reviewed terminal exclusion must canonicalize to a durable source identity"
);
assert.equal(
  canonicalUrl(
    "https://www.walmart.com/ip/Fancy-Feast-Grain-Free-Cat-Food-Complements-Seafood-Bisque-Real-Crab-1-4-oz-Pouches-16-Count/283324499"
  ),
  "https://walmart.com/ip/283324499",
  "reviewed Walmart exclusions must converge on the same durable URL used by census observations"
);
const applawsNonCompleteReviews = reviewedFormulaExclusions.rows.filter(
  (row) => row.brand === "Applaws"
);
assert.equal(
  applawsNonCompleteReviews.length,
  36,
  "the reviewed Applaws complementary-food correction must remain bounded to the 36 exact current retailer identities"
);
assert(
  applawsNonCompleteReviews.every((row) => (
    row.exclusion_reason === "non_complete_food"
    && row.authoritative_source_urls.every((url) => url.startsWith("https://applaws.com/us/"))
    && !/\b(vitality|healthy start)\b/i.test(row.product_name)
  )),
  "Applaws exclusions must use official US evidence and must never absorb complete Vitality or Healthy Start formulas"
);
const reviewedFormulaConflicts = loadReviewedFormulaConflicts();
assert.equal(
  reviewedFormulaConflicts.rows.length,
  1,
  "reviewed formula conflicts must stay bounded to exact audited source identities"
);
const moistMeatyConflictFixture = JSON.parse(
  fs.readFileSync("scripts/fixtures/catalog-scraper-cases.json", "utf8")
).find((row) => row.name ===
  "conflicting official page and linked label ingredient formulas are quarantined"
);
assert.ok(moistMeatyConflictFixture, "Moist & Meaty conflict fixture must exist");
const reviewedMoistMeatyConflict = reconcileReviewedFormulaConflict(
  {
    ...moistMeatyConflictFixture.candidate,
    front_image_url: reviewedFormulaConflicts.rows[0].front_image_url,
  },
  reviewedFormulaConflicts
);
assert.equal(
  reviewedMoistMeatyConflict?.status,
  "conflicting_exact_manufacturer_evidence",
  "the exact Purina PDP/PDF disagreement must be counted as a conflict, not a missing scrape"
);
assert.equal(
  reviewedMoistMeatyConflict?.match,
  null,
  "a reviewed manufacturer formula conflict must never select an ingredient version"
);
assert.equal(
  new Set(
    reviewedMoistMeatyConflict?.conflict?.evidence_versions
      ?.map((version) => version.normalized_ingredient_hash)
  ).size,
  3,
  "the reviewed Moist & Meaty conflict must preserve all three distinct ingredient versions"
);
assert.equal(
  reconcileReviewedFormulaConflict({
    ...moistMeatyConflictFixture.candidate,
    front_image_url: reviewedFormulaConflicts.rows[0].front_image_url,
    ingredient_text: "Chicken, rice, vitamins, minerals.",
  }, reviewedFormulaConflicts),
  null,
  "reviewed conflict status must fail closed if the observed ingredient evidence changes"
);

assert.equal(
  censusFormulaKey({ ...base, package_size: "14 lb" }),
  censusFormulaKey({ ...base, package_size: "31.1 lb" }),
  "package size must not split formulas"
);
assert.notEqual(
  censusFormulaKey(base),
  censusFormulaKey({ ...base, flavor: "Salmon" }),
  "flavor must split formulas"
);
assert.equal(isTerminalFormulaExclusionReason("multi_formula_or_variety_pack"), true);
assert.equal(isTerminalFormulaExclusionReason("non_single_product_bundle"), true);
assert.equal(isTerminalFormulaExclusionReason("duplicate_verified_official_catalog_row"), false);
assert.equal(
  stripPublicRetailerTitleArtifacts(
    "Purina ONE Plus Joint Health Natural Chicken Flavor Dry Dog Food 31",
    "walmart-public-sitemap"
  ),
  "Purina ONE Plus Joint Health Natural Chicken Flavor Dry Dog Food",
  "a unitless terminal retailer bag size must not create a separate formula"
);
assert.equal(
  stripPublicRetailerTitleArtifacts(
    "Purina Pro Plan SPORT 30 20",
    "walmart-public-sitemap"
  ),
  "Purina Pro Plan SPORT 30 20",
  "protected formulation ratios must not be treated as package sizes"
);
assert.equal(
  stripPublicRetailerTitleArtifacts(
    "Blue Buffalo Chicken 38 Brown Rice Blue 39 s Stew 12",
    "target-public-sitemap"
  ),
  "Blue Buffalo Chicken & Brown Rice Blue's Stew",
  "Target entity artifacts and a terminal package size must be repaired"
);
assert.equal(
  stripPublicRetailerTitleArtifacts(
    "Rachael Ray Nutrish Zero Grain Turkey Potato Recipe Dry Dog Food Bag Packaging May Vary",
    "walmart-public-sitemap"
  ),
  "Rachael Ray Nutrish Zero Grain Turkey Potato Recipe Dry Dog Food",
  "retailer packaging-change copy must not create a separate formula"
);
assert.equal(
  stripPublicRetailerTitleArtifacts(
    "Iams Healthy Kitten Chicken Recipe Cuts In Gravy Wet Cat Food 2 Twin Pack",
    "walmart-public-sitemap"
  ),
  "Iams Healthy Kitten Chicken Recipe Cuts In Gravy Wet Cat Food",
  "twin-pack counts must remain SKU evidence instead of formula identity"
);
assert.equal(
  stripPublicRetailerTitleArtifacts(
    "Wellness Protein Bowls Adult Wholesome Grains Chicken Value Pack Fresh Alternative Dog Food",
    "chewy-public-sitemap"
  ),
  "Wellness Protein Bowls Adult Wholesome Grains Chicken Fresh Alternative Dog Food",
  "value-pack merchandising must not split a single recipe"
);
assert.notEqual(
  censusFormulaKey(base),
  censusFormulaKey({ ...base, pet_type: "cat" }),
  "species must split formulas"
);
assert.notEqual(
  censusServingMatchKey(base),
  censusServingMatchKey({ ...base, food_form: "wet" }),
  "food form must be protected"
);
assert.equal(
  censusFormulaKey({
    manufacturer: "Wellness",
    brand: "Wellness",
    product_line: "Complete Health Small Breed",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    flavor: "Turkey & Oatmeal",
  }),
  censusFormulaKey({
    manufacturer: "Wellness Pet Company",
    brand: "Wellness",
    product_line: "Complete Health Small Breed",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    flavor: "Turkey & Oatmeal",
  }),
  "known Wellness owner aliases must not create duplicate formula identities"
);
assert.equal(
  censusFormulaKey({
    manufacturer: "Nature's Recipe",
    brand: "Nature's Recipe",
    product_line: "Grain Free Large Breed Dry Dog Food",
    pet_type: "dog",
    life_stage: "unknown",
    food_form: "dry",
    flavor: "Chicken, Sweet Potato & Pumpkin",
  }),
  censusFormulaKey({
    manufacturer: "The J.M. Smucker Company",
    brand: "Nature's Recipe",
    product_line: "Grain Free Large Breed Dry Dog Food",
    pet_type: "dog",
    life_stage: "unknown",
    food_form: "dry",
    flavor: "Chicken, Sweet Potato & Pumpkin",
  }),
  "known Nature's Recipe owner aliases must not create duplicate formula identities"
);

const wellnessOfficialIdentity = refineVisibleFormulaIdentity({
  manufacturer: "Wellness",
  brand: "Wellness",
  product_name: "Wellness CORE SIGNATURE SELECTS Flaked Skipjack Tuna & Wild Salmon Entrée in Broth",
  product_line: "CORE SIGNATURE SELECTS Flaked Skipjack",
  pet_type: "cat",
  life_stage: "adult",
  food_form: "wet",
  flavor: "Tuna & Wild Salmon Entrée",
});
const wellnessRetailIdentity = refineVisibleFormulaIdentity({
  manufacturer: "Wellness",
  brand: "Wellness",
  product_name: "Wellness Signature Selects Adult Cat Wet Food, Grain Free Flaked",
  product_line: "Wellness Signature Selects Adult Cat Wet Food Grain Free Flaked",
  pet_type: "cat",
  life_stage: "adult",
  food_form: "wet",
  flavor: "Tuna & Salmon",
});
assert.equal(
  censusFormulaKey(wellnessOfficialIdentity),
  censusFormulaKey(wellnessRetailIdentity),
  "official and retailer Wellness Signature Selects naming must reconcile to one formula"
);

assert.equal(
  refineVisibleFormulaIdentity({
    brand: "Pedigree",
    product_name: "Small Dog Adult Dry Dog Food, Roasted Chicken, Rice & Vegetable",
    flavor: "Chicken",
  }).flavor,
  "Roasted Chicken, Rice & Vegetable",
  "Pedigree recipe identity must preserve every visible comma-separated recipe term"
);
assert.equal(
  refineVisibleFormulaIdentity({
    brand: "Pedigree",
    product_name: "PEDIGREE Adult Dry Dog Food – Roasted Chicken, Rice & Veg",
    flavor: "Chicken",
  }).flavor,
  "Roasted Chicken, Rice & Veg",
  "Pedigree recipe identity must preserve the full shelf-visible recipe after a title dash"
);
assert.equal(
  refineVisibleFormulaIdentity({
    brand: "Pedigree",
    product_name: "CHOPPED GROUND DINNER Adult Wet Dog Food Can, Beef, Bacon & Cheese",
    flavor: "Beef",
  }).flavor,
  "Beef, Bacon & Cheese",
  "Pedigree wet siblings must not collapse to their first protein"
);
assert.equal(
  refineVisibleFormulaIdentity({
    brand: "Crave",
    product_name: "Dry Cat Chicken & Salmon Recipe",
    pet_type: "dog",
  }).pet_type,
  "cat",
  "explicit product-local species text must repair contaminated category metadata"
);
assert.equal(
  refineVisibleFormulaIdentity({
    brand: "Hill's Prescription Diet",
    product_name: "a/d Urgent Care with Chicken Wet Dog/Cat Food",
    pet_type: "dog",
  }).pet_type,
  "dog",
  "explicit cross-species formulas must not be forced to one species from title text"
);

const expanded = expandProductVariants({
  ...base,
  variants: [
    { flavor: "Beef", size: "14 lb", upc: "012345678905" },
    { flavor: "Salmon", size: "12 lb", upc: "012345678912" },
  ],
});
assert.equal(expanded.length, 2);
assert.equal(expanded[0].gtin, "012345678905");
assert.equal(expanded[1].flavor, "Salmon");

const ambiguous = expandProductVariants({
  ...base,
  flavors: ["Beef", "Salmon"],
  sizes: ["5 lb", "14 lb"],
});
assert.equal(ambiguous.length, 2);
assert(ambiguous.every((row) => row._variant_mapping === "unmapped_flavor_size_matrix"));
assert(
  catalogObservation(ambiguous[0]).validation_reasons.includes("unmapped_flavor_size_matrix"),
  "unmapped retailer matrices must be quarantined"
);

assert.equal(validateRunCompleteness({
  paginationComplete: true,
  observedCount: 100,
  previousObservedCount: 105,
}).status, "completed");
assert.equal(validateRunCompleteness({
  paginationComplete: true,
  observedCount: 80,
  previousObservedCount: 100,
}).status, "quarantined");
assert.equal(validateRunCompleteness({
  paginationComplete: false,
  observedCount: 100,
}).status, "quarantined");
assert.equal(validateRunCompleteness({
  paginationComplete: true,
  capReached: true,
  observedCount: 1000,
}).status, "quarantined");

const diff = diffObservations(
  [{ ...base, gtin: "012345678905", content_hash: "old" }],
  [
    { ...base, gtin: "012345678905", content_hash: "new" },
    { ...base, gtin: "012345678912", flavor: "Salmon" },
  ]
);
assert.equal(diff.changed.length, 1);
assert.equal(diff.added.length, 1);
assert.equal(diff.removed.length, 0);

const reconciled = reconcileObservationsByGtin([
  catalogObservation({
    ...base,
    source_quality: "official",
    gtin: "012345678905",
  }),
  catalogObservation({
    ...base,
    product_line: "Beneful Originals Adult Dry Dog Food Farm-Raised Beef",
    life_stage: "unknown",
    flavor: "",
    source: "retailer",
    source_url: "https://retailer.test/beneful-originals-beef",
    source_quality: "retailer_verified",
    gtin: "012345678905",
  }),
]);
assert.equal(reconciled[0].formula_key, reconciled[1].formula_key);

const reviewedAliasFormulaKey =
  "royal canin|royal canin|west highland white terrier adult dry dog food|dog|adult mature|dry||";
const reviewedAliasObservation = catalogObservation({
  manufacturer: "Royal Canin",
  brand: "Royal Canin",
  product_name: "West Highland White Terrier Adult Dry Dog Food",
  product_line: "Breed Health Nutrition",
  pet_type: "dog",
  life_stage: "adult",
  food_form: "dry",
  source: "petsmart-retail-catalog",
  source_url: "https://retailer.test/royal-canin-westie",
  source_quality: "retailer_verified",
  gtin: "030111513601",
});
reviewedAliasObservation.formula_key = reviewedAliasFormulaKey;
reviewedAliasObservation.raw_payload = {
  ...(reviewedAliasObservation.raw_payload || {}),
  matched_formula_key: reviewedAliasFormulaKey,
  source_identity_reconciliation: {
    deterministic_evidence: "reviewed_official_formula_alias",
  },
};
const reviewedAliasGtinReconciliation = reconcileObservationsByGtin([
  catalogObservation({
    manufacturer: "Royal Canin Mars Petcare",
    brand: "Royal Canin",
    product_name: "West Highland White Terrier Adult Dry Dog Food",
    product_line: "Breed Health Nutrition",
    pet_type: "dog",
    life_stage: "Adult, Mature",
    food_form: "dry",
    source: "royal-canin-mars-petcare",
    source_url: "https://manufacturer.test/royal-canin-westie",
    source_quality: "manufacturer",
    gtin: "030111513601",
  }),
  reviewedAliasObservation,
]);
assert.equal(
  reviewedAliasGtinReconciliation[1].formula_key,
  reviewedAliasFormulaKey,
  "a reviewed exact package alias must not be rewritten by later generic GTIN reconciliation"
);

assert.notEqual(
  censusFormulaKey({
    brand: "Royal Canin",
    product_name: "Feline Renal Support D Thin Slices in Gravy",
    product_line: "Veterinary Health Nutrition",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
  }),
  censusFormulaKey({
    brand: "Royal Canin",
    product_name: "Feline Renal Support E Loaf in Sauce",
    product_line: "Veterinary Health Nutrition",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
  })
);
const royalCaninWeightCareDog = {
  manufacturer: "Mars Petcare",
  brand: "Royal Canin",
  product_name: "Weight Care Loaf in Sauce Canned Dog Food 13.5 oz",
  product_line: "Canine Care Nutrition",
  pet_type: "dog",
  life_stage: "adult",
  food_form: "wet",
  flavor: "",
};
assert.notEqual(
  censusFormulaKey(royalCaninWeightCareDog),
  censusFormulaKey({
    ...royalCaninWeightCareDog,
    product_name: "Digestive Care Loaf in Sauce Canned Dog Food 13.5 oz",
  }),
  "a broad Care Nutrition range must not collapse Weight Care and Digestive Care siblings"
);
assert.equal(
  censusFormulaKey(royalCaninWeightCareDog),
  censusFormulaKey({
    ...royalCaninWeightCareDog,
    product_name: "Weight Care Loaf in Sauce Canned Dog Food 12 x 13.5 oz cans",
    package_size: "12 x 13.5 oz CAN",
  }),
  "Royal Canin package size must remain a SKU child of the exact visible formula"
);
assert.notEqual(
  censusFormulaKey(royalCaninWeightCareDog),
  censusFormulaKey({
    ...royalCaninWeightCareDog,
    product_name: "Weight Care Loaf in Sauce Wet Cat Food 3 oz",
    product_line: "Feline Care Nutrition",
    pet_type: "cat",
  }),
  "Royal Canin dog and cat Weight Care formulas must remain hard-separated"
);
assert.notEqual(
  censusFormulaKey({
    manufacturer: "Hill's Pet Nutrition",
    brand: "Hill's Science Diet",
    product_name: "Adult Chicken Recipe Dry Dog Food",
    product_line: "Science Diet",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    flavor: "",
  }),
  censusFormulaKey({
    manufacturer: "Hill's Pet Nutrition",
    brand: "Hill's Science Diet",
    product_name: "Adult Salmon Recipe Dry Dog Food",
    product_line: "Science Diet",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    flavor: "",
  }),
  "a broad line with missing structured recipe must fall back to exact visible product identity"
);
assert.equal(reconciled[1].flavor, "farm raised beef");

const firstMateCurrentIngredients = [
  "Boneless chicken, Deboned Tuna, Water sufficient for processing, Potato,",
  "Minerals, (Salt, Calcium Carbonate, Monodicalcium phosphate, Choline chloride,",
  "Potassium chloride, Zinc Proteinate, Iron Proteinate, Copper Proteinate,",
  "Manganese Proteinate, Calcium Iodate)",
].join(" ");
const firstMateObservation = catalogObservation({
  manufacturer: "FirstMate",
  brand: "FirstMate",
  product_name: "Cage Free Chicken & Wild Tuna 50/50 Formula for Cats 5.5oz - 24 Cans",
  product_line: "Cage Free",
  flavor: "Chicken & Wild Tuna Formula",
  pet_type: "cat",
  life_stage: "unknown",
  food_form: "unknown",
  ingredient_text: firstMateCurrentIngredients,
  source: "firstmate",
  source_url: "https://firstmate.test/chicken-tuna",
  source_quality: "manufacturer",
}, {
  sourceSlug: "firstmate",
  sourceType: "manufacturer",
  sourceAuthority: "manufacturer",
});
const firstMateCandidates = buildServingFormulaCandidates([
  {
    cache_key: "firstmate:legacy",
    manufacturer: "FirstMate",
    brand: "FirstMate",
    product_name: firstMateObservation.product_name,
    product_line: "Cage Free",
    flavor: "Chicken & Wild Tuna Formula",
    pet_type: "cat",
    life_stage: "unknown",
    food_form: "wet",
    ingredient_text: `Ingredients: ${firstMateCurrentIngredients
      .replace("(Salt", "( Salt")
      .replace(")", " )")}`,
    ingredient_count: 6,
    source_url: firstMateObservation.source_url,
  },
  {
    cache_key: "firstmate:current",
    manufacturer: "FirstMate",
    brand: "FirstMate",
    product_name: firstMateObservation.product_name,
    product_line: "50/50 Limited Ingredient",
    flavor: "Cage-Free Chicken & Wild Tuna Formula",
    pet_type: "cat",
    life_stage: "all life stages",
    food_form: "wet",
    ingredient_text: firstMateCurrentIngredients,
    ingredient_count: 6,
    source_url: firstMateObservation.source_url,
  },
]);
const firstMateCurrentResolution = reconcilePublicObservation(
  firstMateObservation,
  firstMateCandidates
);
assert.equal(
  firstMateCurrentResolution.match?.cache_key,
  "firstmate:current",
  "punctuation-only ingredient formatting must not create a false version conflict, and the most complete exact official identity must win"
);
const conflictingFormulaVersion = reconcilePublicObservation(
  firstMateObservation,
  buildServingFormulaCandidates([
    ...firstMateCandidates,
    {
      ...firstMateCandidates[1],
      cache_key: "firstmate:new-formula",
      ingredient_text: firstMateCurrentIngredients.replace("Boneless chicken", "Boneless turkey"),
    },
  ])
);
assert.equal(
  conflictingFormulaVersion.status,
  "conflicting_exact_manufacturer_evidence",
  "a real ingredient change at the same manufacturer URL must remain quarantined as a formula-version conflict"
);
const seniorOfficialUrlResolution = reconcilePublicObservation(
  catalogObservation({
    manufacturer: "Nestle Purina",
    brand: "Purina Pro Plan",
    product_name: "Purina Pro Plan Adult 7+ Indoor Chicken & Rice Formula Dry Cat Food",
    product_line: "Adult 7+ Indoor",
    flavor: "Chicken & Rice Formula",
    pet_type: "cat",
    // Simulates contaminated source metadata that ignored the visible "7+".
    life_stage: "adult",
    food_form: "dry",
    source: "purina-pro-plan",
    source_url: "https://purina.test/adult-seven-plus",
    source_quality: "manufacturer",
  }, {
    sourceSlug: "purina-pro-plan",
    sourceType: "manufacturer",
    sourceAuthority: "manufacturer",
  }),
  buildServingFormulaCandidates([
    {
      cache_key: "pro-plan:adult-seven-plus",
      manufacturer: "Nestle Purina",
      brand: "Purina Pro Plan",
      product_name: "Purina Pro Plan Adult 7+ Indoor Chicken & Rice Formula Dry Cat Food",
      product_line: "Adult 7+ Indoor",
      flavor: "Chicken & Rice Formula",
      pet_type: "cat",
      life_stage: "senior",
      food_form: "dry",
      ingredient_text: "Chicken, Rice, Corn Gluten Meal, Wheat, Fish Meal",
      source_url: "https://purina.test/adult-seven-plus",
    },
    {
      cache_key: "pro-plan:adult-indoor",
      manufacturer: "Nestle Purina",
      brand: "Purina Pro Plan",
      product_name: "Purina Pro Plan Adult Indoor Chicken & Rice Formula Dry Cat Food",
      product_line: "Adult Indoor",
      flavor: "Chicken & Rice Formula",
      pet_type: "cat",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Chicken, Rice, Corn Gluten Meal, Wheat, Fish Meal",
      source_url: "https://purina.test/adult-indoor",
    },
  ])
);
assert.equal(
  seniorOfficialUrlResolution.match?.cache_key,
  "pro-plan:adult-seven-plus",
  "exact official URL and title must repair contaminated structured life-stage metadata before fuzzy sibling ranking"
);
const refinedDrySenior = refineVisibleFormulaIdentity({
  brand: "Purina Pro Plan",
  product_name: "Purina Pro Plan Adult 7+ Indoor Chicken & Rice Formula Dry Cat Food",
  pet_type: "dog",
  life_stage: "adult",
  food_form: "fresh",
});
assert.equal(
  refinedDrySenior.pet_type,
  "cat",
  "explicit product-local species must repair contaminated category metadata"
);
assert.equal(
  refinedDrySenior.life_stage,
  "senior",
  "visible Adult 7+ identity must outrank contaminated ordinary-adult metadata"
);
assert.equal(
  refinedDrySenior.food_form,
  "dry",
  "visible dry cat food identity must outrank contaminated fresh metadata"
);
assert.equal(
  refineVisibleFormulaIdentity({
    product_name: "Fresh Chicken Recipe Adult Dry Dog Food",
    food_form: "fresh",
  }).food_form,
  "dry",
  "fresh ingredient wording must not override an explicit dry-food form"
);
const exactIngredientAliasResolution = reconcilePublicObservation(
  catalogObservation({
    manufacturer: "General Mills",
    brand: "Blue Buffalo",
    product_name: "Blue Buffalo Freedom Complete & Balanced Nutrition Adult Grain-Free Chicken & Potatoes Dry Dog Food",
    product_line: "Freedom",
    flavor: "Chicken & Potatoes",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    source: "chewy-public-sitemap",
    source_url: "https://chewy.test/freedom-chicken",
    source_quality: "retailer",
  }, {
    sourceSlug: "chewy-public-sitemap",
    sourceType: "retailer",
    sourceAuthority: "retailer",
  }),
  buildServingFormulaCandidates([
    {
      cache_key: "blue:petsmart-freedom-chicken",
      manufacturer: "General Mills",
      brand: "Blue Buffalo",
      product_name: "Blue Buffalo Freedom Adult Dry Dog Food - Grain Free, Chicken & Potatoes",
      product_line: "Freedom",
      flavor: "Chicken & Potatoes",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Chicken, Potatoes, Peas, Chicken Meal, Flaxseed",
      source_url: "https://petsmart.test/freedom-chicken",
    },
    {
      cache_key: "blue:official-freedom-chicken",
      manufacturer: "General Mills",
      brand: "Blue Buffalo",
      product_name: "BLUE Freedom Adult Dry Dog Food - Grain-Free Chicken",
      product_line: "Freedom",
      flavor: "Chicken",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Ingredients: Chicken, Potatoes, Peas, Chicken Meal, Flaxseed",
      source_url: "https://blue.test/freedom-chicken",
    },
  ])
);
assert.equal(
  exactIngredientAliasResolution.status,
  "matched_verified_formula",
  "verified aliases with exact ingredients and mutually compatible protected identity must not create a false ambiguity"
);
assert.equal(
  exactIngredientAliasResolution.candidates[0].equivalent_formula_keys.length,
  2,
  "evidence-identical retailer and manufacturer aliases must collapse to one formula candidate"
);
const exactRetailerEvidenceResolution = reconcilePublicObservation(
  catalogObservation({
    manufacturer: "PetSmart",
    brand: "Simply Nourish",
    product_name: "Simply Nourish Grain Free Wet Dog Food - Flaked, Tuna & Salmon Stew",
    product_line: "Grain Free",
    flavor: "Tuna & Salmon",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "wet",
    ingredient_text: "Tuna, Salmon, Fish Broth, Potato Starch, Minerals",
    source: "petsmart-retail-catalog",
    source_url: "https://petsmart.test/tuna-salmon-stew",
    source_quality: "retailer_verified",
  }, {
    sourceSlug: "petsmart-retail-catalog",
    sourceType: "retailer",
    sourceAuthority: "retailer_verified",
  }),
  buildServingFormulaCandidates([
    {
      cache_key: "simply-nourish:tuna-salmon-current",
      manufacturer: "PetSmart",
      brand: "Simply Nourish",
      product_name: "Simply Nourish Grain Free Wet Dog Food - Flaked, Tuna & Salmon Stew, 10 oz",
      product_line: "Grain Free",
      flavor: "Tuna & Salmon",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "wet",
      ingredient_text: "Tuna, Salmon, Fish Broth, Potato Starch, Minerals",
      source_url: "https://petsmart.test/tuna-salmon-stew",
    },
    {
      cache_key: "simply-nourish:tuna-salmon-old",
      manufacturer: "PetSmart",
      brand: "Simply Nourish",
      product_name: "Simply Nourish Grain Free Wet Dog Food - Flaked, Tuna & Salmon Stew, 3 oz",
      product_line: "Grain Free",
      flavor: "Tuna & Salmon",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "wet",
      ingredient_text: "Tuna, Salmon, Water, Potato Starch, Minerals",
      source_url: "https://petsmart.test/tuna-salmon-stew",
    },
  ])
);
assert.equal(
  exactRetailerEvidenceResolution.match?.cache_key,
  "simply-nourish:tuna-salmon-current",
  "an exact retailer URL plus exact current ingredient statement must select the matching package-size alias without inheriting an older formula"
);
const conflictingAliasVersions = reconcilePublicObservation(
  catalogObservation({
    manufacturer: "General Mills",
    brand: "Blue Buffalo",
    product_name: "Blue Buffalo Freedom Adult Dry Dog Food Grain-Free Chicken",
    product_line: "Freedom",
    flavor: "Chicken",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    source: "walmart-public-sitemap",
    source_url: "https://walmart.test/freedom-chicken",
    source_quality: "retailer",
  }, {
    sourceSlug: "walmart-public-sitemap",
    sourceType: "retailer",
    sourceAuthority: "retailer",
  }),
  buildServingFormulaCandidates([
    {
      cache_key: "blue:freedom-chicken-v1",
      manufacturer: "General Mills",
      brand: "Blue Buffalo",
      product_name: "Blue Buffalo Freedom Adult Dry Dog Food Grain-Free Chicken",
      product_line: "Freedom",
      flavor: "Chicken",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Chicken, Potatoes, Peas, Chicken Meal, Flaxseed",
      source_url: "https://blue.test/freedom-chicken-v1",
    },
    {
      cache_key: "blue:freedom-chicken-v2",
      manufacturer: "General Mills",
      brand: "Blue Buffalo",
      product_name: "Blue Buffalo Freedom Adult Dry Dog Food Grain-Free Chicken",
      product_line: "Freedom",
      flavor: "Chicken",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Chicken, Potatoes, Peas, Turkey Meal, Flaxseed",
      source_url: "https://blue.test/freedom-chicken-v2",
    },
  ])
);
assert.equal(
  conflictingAliasVersions.status,
  "conflicting_candidate_ingredient_evidence",
  "identical titles with materially different ingredient statements must remain quarantined as an unresolved formula-version conflict"
);
const eukanubaSmallBitesResolution = reconcilePublicObservation(
  catalogObservation({
    manufacturer: "Mars Petcare",
    brand: "Eukanuba",
    product_name: "Eukanuba Premium Performance 26/16 Exercise Small Bites Adult Dog Food",
    product_line: "Premium Performance 26/16 Exercise Small Bites",
    flavor: "",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    source: "chewy-public-sitemap",
    source_url: "https://www.chewy.com/eukanuba-premium-performance-2616/dp/1274870",
    source_quality: "retailer",
  }, {
    sourceSlug: "chewy-public-sitemap",
    sourceType: "retailer",
    sourceAuthority: "retailer",
  }),
  buildServingFormulaCandidates([{
    cache_key: "eukanuba:regular-26-16",
    manufacturer: "Mars Petcare",
    brand: "Eukanuba",
    product_name: "Eukanuba Premium Performance 26/16 Exercise Dry Dog Food",
    product_line: "Premium Performance 26/16 Exercise",
    flavor: "Chicken",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    ingredient_text: "Chicken, Brewers Rice, Chicken By-Product Meal, Corn, Wheat",
    source_url: "https://www.eukanuba.com/products/dry/premium-performance-2616-exercise-dry-dog-food",
  }])
);
assert.equal(
  eukanubaSmallBitesResolution.match,
  null,
  "small-bites kibble must remain a distinct unresolved formula instead of inheriting the regular sibling's ingredients"
);
{
  const coverageCandidates = buildServingFormulaCandidates([
    {
      cache_key: "test-brand:prime-barley",
      brand: "Test Brand",
      product_name: "Test Brand Prime Chicken Brown Rice Barley Adult Dry Dog Food",
      product_line: "Prime",
      flavor: "Chicken Brown Rice Barley",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Chicken, Rice, Barley, Fat, Vitamins",
      image_url: "https://images.test/prime-barley.jpg",
      source_url: "https://manufacturer.test/prime-barley",
      source_quality: "manufacturer",
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
    },
    {
      cache_key: "test-brand:prime-rice",
      brand: "Test Brand",
      product_name: "Test Brand Prime Chicken Brown Rice Adult Dry Dog Food",
      product_line: "Prime",
      flavor: "Chicken Brown Rice",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Chicken, Rice, Fat, Vitamins, Minerals",
      image_url: "https://images.test/prime-rice.jpg",
      source_url: "https://manufacturer.test/prime-rice",
      source_quality: "manufacturer",
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
    },
  ]);
  const longerRetailerIdentity = {
    brand: "Test Brand",
    product_name: "Test Brand Prime Chicken Brown Rice Barley Recipe Adult Dry Dog Food with Probiotics",
    product_line: "Prime",
    flavor: "Chicken Brown Rice Barley",
    pet_type: "dog",
    life_stage: "adult",
    food_form: "dry",
    source_type: "retailer",
    source_authority: "gap_discovery",
  };
  assert.equal(
    reconcilePublicObservation(longerRetailerIdentity, coverageCandidates).match,
    null,
    "the runtime resolver must retain its ordinary ambiguity margin"
  );
  const coverageMatch = reconcilePublicObservation(
    longerRetailerIdentity,
    coverageCandidates,
    { allowFormulaCoverageFallback: true }
  );
  assert.equal(coverageMatch.match?.cache_key, "test-brand:prime-barley");
  assert.equal(
    coverageMatch.deterministic_evidence,
    "formula_coverage_protected_exact_recipe"
  );
  assert.notEqual(
    reconcilePublicObservation(
      {
        ...longerRetailerIdentity,
        product_name: "Test Brand Prime Chicken Brown Rice Barley Recipe Adult Dog Food with Probiotics",
        food_form: "unknown",
      },
      coverageCandidates,
      { allowFormulaCoverageFallback: true }
    ).deterministic_evidence,
    "formula_coverage_protected_exact_recipe",
    "the new coverage fallback must not infer a formula's food form from an unknown retailer title"
  );

  const currentManufacturerVersion = buildServingFormulaCandidates([
    {
      cache_key: "royal-canin:pug-current",
      brand: "Royal Canin",
      product_name: "Pug Adult Dry Dog Food",
      product_line: "Breed Health Nutrition",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Corn, Chicken Meal, Rice, Chicken Fat, Vitamins",
      image_url: "https://images.test/royal-pug-current.jpg",
      source_url: "https://manufacturer.test/royal-canin/pug-adult",
      source_quality: "manufacturer",
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      formula_evidence_tier: "manufacturer_current_exact",
      verified_at: "2026-08-01T00:00:00Z",
    },
    {
      cache_key: "royal-canin:pug-retailer-old",
      brand: "Royal Canin",
      product_name: "Royal Canin Breed Health Nutrition Pug Adult Dry Dog Food",
      flavor: "Other",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Corn, Chicken Meal, Rice, Beet Pulp, Vitamins",
      image_url: "https://images.test/royal-pug-old.jpg",
      source_url: "https://retailer.test/royal-canin-pug",
      source_quality: "retailer_verified",
      ingredient_verification_status: "retailer_verified",
      image_verification_status: "retailer_verified",
      formula_evidence_tier: "retailer_web_version",
      verified_at: "2026-07-01T00:00:00Z",
    },
  ]);
  const currentFormulaResolution = reconcilePublicObservation(
    {
      brand: "Royal Canin",
      product_name: "Royal Canin Breed Health Nutrition Pug Adult Dry Dog Food",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      source_type: "retailer",
      source_authority: "gap_discovery",
    },
    currentManufacturerVersion,
    { allowFormulaCoverageFallback: true }
  );
  assert.equal(
    currentFormulaResolution.match?.cache_key,
    "royal-canin:pug-current",
    "formula coverage should prefer the unique current manufacturer version of the same exact protected formula"
  );
  assert.equal(
    currentFormulaResolution.deterministic_evidence,
    "formula_coverage_prefers_unique_current_manufacturer"
  );
}
{
  const unsafeSibling = (observation, candidate, message) => {
    assert.equal(
      reconcilePublicObservation(
        observation,
        buildServingFormulaCandidates([candidate]),
        { allowFormulaCoverageFallback: true }
      ).match,
      null,
      message
    );
  };
  unsafeSibling(
    {
      brand: "Blue Buffalo",
      product_name: "Blue Buffalo Freedom Healthy Weight Chicken Adult Dry Dog Food",
      product_line: "Freedom",
      flavor: "Chicken",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
    },
    {
      cache_key: "blue:wilderness-weight",
      brand: "Blue Buffalo",
      product_name: "Blue Buffalo Wilderness Healthy Weight Chicken Adult Dry Dog Food",
      product_line: "Wilderness",
      flavor: "Chicken",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Chicken, Chicken Meal, Peas, Barley, Vitamins",
    },
    "Freedom must never inherit Wilderness ingredients"
  );
  unsafeSibling(
    {
      brand: "Wellness",
      product_name: "Wellness CORE RawRev Original Turkey Adult Dry Dog Food",
      product_line: "CORE RawRev",
      flavor: "Turkey",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
    },
    {
      cache_key: "wellness:core-plus-turkey",
      brand: "Wellness",
      product_name: "Wellness CORE+ Original Turkey Adult Dry Dog Food",
      product_line: "CORE+",
      flavor: "Turkey",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Turkey, Chicken Meal, Peas, Barley, Vitamins",
    },
    "RawRev must not silently inherit a CORE+ formula version"
  );
  unsafeSibling(
    {
      brand: "Pedigree",
      product_name: "Pedigree Big Dog Adult Roasted Chicken Rice Vegetable Dry Dog Food",
      flavor: "Chicken Rice Vegetable",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
    },
    {
      cache_key: "pedigree:generic-adult",
      brand: "Pedigree",
      product_name: "Pedigree Adult Roasted Chicken Rice Vegetable Dry Dog Food",
      flavor: "Chicken Rice Vegetable",
      pet_type: "dog",
      life_stage: "adult",
      food_form: "dry",
      ingredient_text: "Corn, Chicken Meal, Rice, Fat, Vitamins",
    },
    "Big Dog must remain a large-breed formula boundary"
  );
}
const renamedOfficialFormulaResolution = reconcilePublicObservation(
  catalogObservation({
    manufacturer: "Annamaet",
    brand: "Annamaet",
    product_name: "MEDIUM & LARGE BREED SALMON FORMULA",
    product_line: "Medium & Large Breed",
    flavor: "Salmon Formula",
    pet_type: "dog",
    life_stage: "unknown",
    food_form: "unknown",
    ingredient_text: "Salmon Meal, Brown Rice, Millet, Rolled Oats, Lamb Meal",
    source: "annamaet",
    source_url: "https://annamaet.test/option-formula",
    source_quality: "manufacturer",
  }, {
    sourceSlug: "annamaet",
    sourceType: "manufacturer",
    sourceAuthority: "manufacturer",
  }),
  buildServingFormulaCandidates([{
    cache_key: "annamaet:option",
    manufacturer: "Annamaet",
    brand: "Annamaet",
    product_name: "OPTION FORMULA",
    product_line: "OPTION FORMULA",
    flavor: "",
    pet_type: "dog",
    life_stage: "unknown",
    food_form: "unknown",
    ingredient_text: "Salmon Meal, Brown Rice, Millet, Rolled Oats, Lamb Meal",
    source_url: "https://annamaet.test/option-formula",
  }])
);
assert.equal(
  renamedOfficialFormulaResolution.match?.cache_key,
  "annamaet:option",
  "an exact current official URL and ingredient statement must reconcile a renamed title without guessing across recipes"
);
const shelfBrandRepairResolution = reconcilePublicObservation(
  catalogObservation({
    manufacturer: "FirstMate",
    // Simulates a manufacturer-wide adapter assigning its parent brand.
    brand: "FirstMate",
    product_name: "KASIKS Cage-Free Chicken Formula for Dogs",
    product_line: "Cage-Free",
    flavor: "Chicken Formula",
    pet_type: "dog",
    life_stage: "unknown",
    food_form: "unknown",
    ingredient_text: "Boneless chicken, Water, Pea Starch, Minerals, Salt",
    source: "firstmate",
    source_url: "https://firstmate.test/kasiks-chicken",
    source_quality: "manufacturer",
  }, {
    sourceSlug: "firstmate",
    sourceType: "manufacturer",
    sourceAuthority: "manufacturer",
  }),
  buildServingFormulaCandidates([
    {
      cache_key: "firstmate:contaminated-kasiks",
      manufacturer: "FirstMate",
      brand: "FirstMate",
      product_name: "KASIKS Cage-Free Chicken Formula for Dogs",
      product_line: "KASIKS Cage-Free",
      flavor: "Chicken Formula",
      pet_type: "dog",
      life_stage: "unknown",
      food_form: "wet",
      ingredient_text: "Boneless chicken, Water, Pea Starch, Minerals, Salt",
      source_url: "https://firstmate.test/kasiks-chicken",
    },
    {
      cache_key: "kasiks:chicken",
      manufacturer: "FirstMate",
      brand: "KASIKS",
      product_name: "KASIKS Cage-Free Chicken Formula for Dogs",
      product_line: "Cage-Free",
      flavor: "Chicken Formula",
      pet_type: "dog",
      life_stage: "all life stages",
      food_form: "wet",
      ingredient_text: "Boneless chicken, Water, Pea Starch, Minerals, Salt",
      source_url: "https://firstmate.test/kasiks-chicken",
    },
  ])
);
assert.equal(
  shelfBrandRepairResolution.match?.brand,
  "kasiks",
  "an exact official product may repair a parent-brand assignment only when the distinct serving brand is visibly the leading shelf identity"
);
assert.equal(
  reconcilePublicObservation({
    ...firstMateObservation,
    source_url: "https://firstmate.test/hidden-brand",
  }, buildServingFormulaCandidates([{
    cache_key: "kasiks:hidden",
    manufacturer: "FirstMate",
    brand: "KASIKS",
    product_name: "Cage-Free Chicken Formula for Dogs",
    product_line: "Cage-Free",
    flavor: "Chicken Formula",
    pet_type: "cat",
    life_stage: "unknown",
    food_form: "wet",
    ingredient_text: firstMateCurrentIngredients,
    source_url: "https://firstmate.test/hidden-brand",
  }])).match,
  null,
  "a hidden or absent consumer brand may not cross a shelf-brand boundary"
);

const gtinConflict = reconcileObservationsByGtin([
  catalogObservation({ ...base, gtin: "012345678905" }),
  catalogObservation({
    ...base,
    brand: "Fancy Feast",
    pet_type: "cat",
    gtin: "012345678905",
  }),
]);
assert(gtinConflict.every((row) => (
  row.validation_status === "quarantined"
  && row.validation_reasons.includes("gtin_hard_identity_conflict")
)));

const explicitDogCatFormula = reconcileObservationsByGtin([
  catalogObservation({
    manufacturer: "Hill's Pet Nutrition",
    brand: "Hill's Prescription Diet",
    product_name: "a/d with Chicken Wet Dog/Cat Food",
    product_line: "a/d",
    pet_type: "dog",
    life_stage: "unknown",
    food_form: "wet",
    flavor: "Chicken",
    source: "hill-s-pet-nutrition",
    source_url: "https://www.hillspet.com/dog-food/prescription-diet-ad-urgent-care-canned",
    source_quality: "official",
    gtin: "052742567006",
  }),
  catalogObservation({
    manufacturer: "Hill's Pet Nutrition",
    brand: "Hill's Prescription Diet",
    product_name: "Hill's Prescription Diet a/d Urgent Care Adult Dog & Cat Food - Chicken",
    product_line: "a/d",
    pet_type: "cat",
    life_stage: "adult",
    food_form: "wet",
    flavor: "Chicken",
    source: "retailer",
    source_url: "https://retailer.test/hills-ad-urgent-care",
    source_quality: "retailer_verified",
    gtin: "052742567006",
  }),
]);
assert.equal(explicitDogCatFormula[0].formula_key, explicitDogCatFormula[1].formula_key);
assert(explicitDogCatFormula.every((row) => row.validation_status !== "quarantined"));

assert.throws(() => createSourceAdapter({ sourceSlug: "x" }), /discover/);
const adapter = createSourceAdapter({
  sourceSlug: "official-test",
  sourceType: "manufacturer",
  discover: async () => [],
  fetch: async () => ({}),
});
assert.equal(adapter.sourceSlug, "official-test");
assert(Object.isFrozen(adapter));

const independentCensus = fs.readFileSync("scripts/catalog-independent-census.mjs", "utf8");
assert.match(independentCensus, /--public-source-mode/);
assert.match(independentCensus, /chewy-public-sitemap/);
assert.match(independentCensus, /denominator_mode/);
assert.match(independentCensus, /coverage-breakdown\.json/);
assert.match(independentCensus, /by_retailer_pet_type/);
assert.match(independentCensus, /amazon/);
assert.match(
  independentCensus,
  /catalog-reviewed-cesar-retailer-identity-aliases-20260804\.json/,
  "the independent census must include the reviewed Cesar identity manifest"
);
assert.match(
  independentCensus,
  /catalog-reviewed-iams-retailer-identity-aliases-20260804\.json/,
  "the independent census must include the reviewed IAMS identity manifest"
);
assert.match(
  independentCensus,
  /catalog-reviewed-existing-formula-identity-aliases-20260804\.json/,
  "the independent census must include the frozen existing-formula identity manifest"
);
assert.match(
  independentCensus,
  /catalog-reviewed-sheba-front-label-ocr-aliases-20260805\.json/,
  "the independent census must include the reviewed Sheba front-label OCR manifest"
);
assert.equal(reviewedShebaFrontLabelOcrAliases.length, 23);
assert.equal(
  new Set(reviewedShebaFrontLabelOcrAliases.map((row) => row.source_url)).size,
  reviewedShebaFrontLabelOcrAliases.length,
  "every Sheba OCR alias must be bound to one exact retailer source URL"
);
assert(reviewedShebaFrontLabelOcrAliases.every((row) => (
  row.review_method === "exact_existing_formula_identity_only"
  && row.manual_front_label_ocr_match === true
  && row.required_ocr_terms?.length >= 4
  && row.required_ocr_terms.every((term) => (
    normalizeIdentity(row.retailer_front_label_ocr).replaceAll(" ", "")
      .includes(normalizeIdentity(term).replaceAll(" ", ""))
    && normalizeIdentity(row.official_front_label_ocr).replaceAll(" ", "")
      .includes(normalizeIdentity(term).replaceAll(" ", ""))
  ))
  && /^[a-f0-9]{64}$/u.test(row.retailer_front_image_sha256)
  && /^[a-f0-9]{64}$/u.test(row.official_artifact_image_sha256)
  && row.retailer_identity_only === true
  && row.retailer_ingredient_verification === false
)));
assert.match(
  independentCensus,
  /catalog-reviewed-wellness-front-label-visual-aliases-20260805\.json/,
  "the independent census must include the reviewed Wellness visual manifest"
);
assert.equal(reviewedWellnessFrontLabelVisualAliases.length, 40);
assert.equal(
  reviewedWellnessFrontLabelVisualAliases.filter((row) => (
    /\/141775$|\/141779$/u.test(row.source_url)
  )).length,
  2,
  "the reviewed exact-duplicate repair must unlock both held Wellness dry-cat identities"
);
assert(reviewedWellnessFrontLabelVisualAliases.every((row) => (
  row.review_method === "exact_existing_formula_identity_only"
  && row.manual_front_label_visual_match === true
  && row.protected_identity_terms?.length >= 4
  && /^[a-f0-9]{64}$/u.test(row.retailer_front_image_sha256)
  && /^[a-f0-9]{64}$/u.test(row.official_artifact_image_sha256)
  && row.retailer_identity_only === true
  && row.retailer_ingredient_verification === false
)));
const reviewedTerminalExclusions = loadReviewedFormulaExclusions();
const shebaVarietyPackExclusions = reviewedTerminalExclusions.rows.filter(
  (row) => row.brand === "Sheba"
);
assert.equal(shebaVarietyPackExclusions.length, 3);
assert(shebaVarietyPackExclusions.every(
  (row) => row.exclusion_reason === "variety_pack_parent"
));
const wellnessLambMixerExclusions = reviewedTerminalExclusions.rows.filter(
  (row) => row.brand === "Wellness"
    && /\/34378$/u.test(row.source_url)
);
assert.equal(wellnessLambMixerExclusions.length, 1);
assert.equal(wellnessLambMixerExclusions[0].exclusion_reason, "non_complete_food");
const bilJacEnhancerExclusions = reviewedTerminalExclusions.rows.filter(
  (row) => row.brand === "Bil-Jac"
);
const tikiMegaPackExclusions = reviewedTerminalExclusions.rows.filter(
  (row) => row.brand === "Tiki Cat"
    && /\/18849722734$/u.test(row.source_url)
);
assert.equal(tikiMegaPackExclusions.length, 1);
assert.equal(tikiMegaPackExclusions[0].exclusion_reason, "variety_pack_parent");
assert(
  tikiMegaPackExclusions[0].authoritative_source_urls.every(
    (url) => url.startsWith("https://tikipets.com/")
  ),
  "Tiki Cat Tuna Mega Pack must be excluded only from exact current manufacturer evidence"
);
assert.equal(bilJacEnhancerExclusions.length, 1);
assert.equal(bilJacEnhancerExclusions[0].exclusion_reason, "non_complete_food");
assert(
  bilJacEnhancerExclusions[0].authoritative_source_urls.every(
    (url) => url.startsWith("https://www.bil-jac.com/")
  ),
  "Bil-Jac BreakThru Biotics must be excluded only from current manufacturer evidence"
);
assert.equal(
  reviewedExistingFormulaIdentityAliases.length,
  7,
  "the existing-formula identity pass must remain bounded to seven manually reviewed aliases"
);
assert.equal(
  new Set(reviewedExistingFormulaIdentityAliases.map((row) => row.alias_formula_key)).size,
  reviewedExistingFormulaIdentityAliases.length,
  "each reviewed existing-formula alias must have a unique formula identity"
);
assert.equal(
  new Set(reviewedExistingFormulaIdentityAliases.map((row) => row.source_url)).size,
  reviewedExistingFormulaIdentityAliases.length,
  "each reviewed existing-formula alias must have a unique retailer source URL"
);
assert(
  reviewedExistingFormulaIdentityAliases.every((row) => (
    row.review_method === "exact_existing_formula_identity_only"
    && row.reviewed_original_evidence_tier === "unverified"
    && row.retailer_identity_only === true
    && row.retailer_ingredient_verification === false
    && /^[a-f0-9]{64}$/u.test(row.retailer_content_hash)
    && /^[a-f0-9]{64}$/u.test(row.official_database_ingredient_hash)
    && /^[a-f0-9]{64}$/u.test(row.official_canonical_ingredient_hash)
    && row.required_title_terms?.length >= 4
    && row.target_formula_key
    && row.official_source_url
    && row.official_image_url
    && row.official_ingredient_count > 0
  )),
  "existing-formula aliases must preserve exact retailer identity and locked manufacturer evidence without claiming retailer ingredient verification"
);
const reviewedShebaPackageAliases = reviewedExistingFormulaIdentityAliases.filter(
  (row) => row.target_identity?.brand === "Sheba"
    && row.manual_package_image_match === true
);
assert.equal(reviewedShebaPackageAliases.length, 2);
assert(reviewedShebaPackageAliases.every((row) => (
  row.manual_package_image_match === true
  && row.retailer_package_identifier === row.official_package_identifier
  && /^[a-f0-9]{64}$/u.test(row.retailer_front_image_sha256)
  && /^[a-f0-9]{64}$/u.test(row.official_artifact_image_sha256)
  && row.retailer_front_image_url.startsWith(
    "https://target.scene7.com/is/image/Target/"
  )
)));
const reviewedShebaWalmartTitleAlias = reviewedExistingFormulaIdentityAliases.find(
  (row) => row.retailer_product_id === "17840402846"
);
assert(reviewedShebaWalmartTitleAlias);
assert.equal(reviewedShebaWalmartTitleAlias.retailer_source_slug, "walmart-public-sitemap");
assert.equal(reviewedShebaWalmartTitleAlias.retailer_front_image_url, "");
assert(reviewedShebaWalmartTitleAlias.required_title_terms.includes("flaky salmon"));
assert.equal(
  reviewedShebaWalmartTitleAlias.cache_key,
  "sheba-mars-petcare:023100152301"
);
assert.match(
  independentCensus,
  /catalog-reviewed-tiki-cat-dry-existing-formula-identity-aliases-20260804\.json/,
  "the independent census must include the refreshed Tiki Cat dry identity manifest"
);
assert.equal(
  reviewedTikiCatDryExistingFormulaIdentityAliases.length,
  4,
  "the refreshed Tiki Cat dry pass must remain bounded to four exact formulas"
);
assert(
  reviewedTikiCatDryExistingFormulaIdentityAliases.every((row) => (
    row.review_method === "exact_existing_formula_identity_only"
    && row.reviewed_original_evidence_tier === "unverified"
    && row.retailer_identity_only === true
    && row.retailer_ingredient_verification === false
    && row.observed_identity?.brand === "Tiki Cat"
    && row.observed_identity?.pet_type === "cat"
    && row.observed_identity?.food_form === "dry"
    && row.target_identity?.brand === "Tiki Cat"
    && row.target_identity?.pet_type === "cat"
    && row.target_identity?.food_form === "dry"
    && row.target_formula_id
    && row.target_formula_key
    && row.target_serving_formula_key
    && row.required_title_terms?.length >= 6
    && /^[a-f0-9]{64}$/u.test(row.retailer_content_hash)
    && /^[a-f0-9]{64}$/u.test(row.official_database_ingredient_hash)
    && /^[a-f0-9]{64}$/u.test(row.official_canonical_ingredient_hash)
    && [
      "outputs/catalog-source-imports/tiki-cat-dry-exact-official-refresh-20260804/feed.csv",
      "outputs/catalog-source-imports/tiki-cat-dry-exact-official-refresh-v2-20260804/feed.csv",
    ].includes(row.refreshed_official_artifact)
    && row.refreshed_official_source_url === row.official_source_url
    && row.refreshed_official_image_url === row.official_image_url
    && row.refreshed_official_canonical_ingredient_hash
      === row.official_canonical_ingredient_hash
    && !Number.isNaN(new Date(row.refreshed_official_observed_at).getTime())
  )),
  "Tiki Cat dry aliases must retain exact retailer identity and refreshed official ingredient/image evidence"
);
assert.match(independentCensus, /liveByFormulaKey\.get\(formulaKey\)/);
assert.match(
  independentCensus,
  /reconcileReviewedFormulaConflict/,
  "the independent census must classify exact reviewed formula-version conflicts"
);
assert.match(
  independentCensus,
  /formula\.formula_evidence_tier !== "conflicted"/,
  "unresolved and conflicted counts must remain mutually exclusive"
);
assert.doesNotMatch(
  independentCensus,
  /gtins\.map\(\(gtin\) => liveByGtin\.get\(gtin\)\)/,
  "a shared retailer GTIN must not independently verify sibling formula identities"
);

const censusStage = fs.readFileSync("scripts/catalog-census-stage.mjs", "utf8");
assert.match(censusStage, /stage_catalog_census_members/);
assert.match(censusStage, /record_catalog_coverage_breakdown/);
assert.match(
  censusStage,
  /evidence_tier_coverage: report\.evidence_tier_coverage \|\| \{\}/,
  "durable snapshots must retain strict and source-versioned evidence-tier counts"
);
assert.match(
  censusStage,
  /--snapshot-only/,
  "durable coverage snapshots must be recordable without restaging every source observation"
);
assert.ok(
  censusStage.indexOf("report.lane7_reviewed_replay?.ledger_fingerprint")
    < censusStage.indexOf("report.lane7_extraction_tranche?.ledger_fingerprint"),
  "a reviewed replay must own the durable ledger provenance ahead of its inherited extraction tranche"
);

const censusSnapshotVerify = fs.readFileSync(
  "scripts/catalog-census-snapshot-verify.mjs",
  "utf8"
);
assert.ok(
  censusSnapshotVerify.indexOf("snapshot.details?.lane7_reviewed_replay")
    < censusSnapshotVerify.indexOf("snapshot.details?.lane7_extraction_tranche"),
  "durable verification must report reviewed replay arithmetic ahead of inherited extraction arithmetic"
);

const durabilityMigration = fs.readFileSync(
  "supabase/migrations/20260724232100_catalog_release_durability.sql",
  "utf8"
);
assert.match(durabilityMigration, /catalog_formulas_active_identity_hash_idx/);
assert.match(durabilityMigration, /catalog_formula_aliases/);
assert.match(durabilityMigration, /catalog_formula_identity_conflicts/);
assert.match(durabilityMigration, /enqueue_catalog_lookup_miss_trigger/);
assert.match(durabilityMigration, /catalog_census_unresolved_members/);
assert.match(durabilityMigration, /catalog_coverage_dimensions/);

const formulaLedgerMigration = fs.readFileSync(
  "supabase/migrations/20260724235055_catalog_census_formula_ledger.sql",
  "utf8"
);
assert.match(formulaLedgerMigration, /catalog_census_formula_members/);
assert.match(formulaLedgerMigration, /PRIMARY KEY \(snapshot_id, formula_key\)/);
assert.match(formulaLedgerMigration, /stage_catalog_census_members_without_formula_ledger/);

const durabilityIndexes = fs.readFileSync(
  "supabase/migrations/20260724235554_catalog_durability_indexes.sql",
  "utf8"
);
assert.match(durabilityIndexes, /catalog_census_formula_members_formula_fk_idx/);
assert.match(durabilityIndexes, /catalog_formula_identity_conflicts_canonical_idx/);
assert.match(durabilityIndexes, /catalog_formula_identity_conflicts_conflicting_idx/);

const catalogMissSource = fs.readFileSync("services/catalogMiss.js", "utf8")
  .replace(/^import[^\n]+\n/gm, "")
  .replace(/\bexport function\b/g, "function");
const catalogMiss = new Function(`
  const LABEL_RESOLUTION_DECISIONS = {
    EXACT_CONFIRMED: "exact_confirmed",
    RECOGNIZERS_DISAGREE: "recognizers_disagree",
    NO_EXACT_VARIANT: "no_exact_variant",
    NON_COMPLETE_CONFIRMED: "non_complete_confirmed",
    NOT_READABLE: "not_readable",
    TIMED_OUT: "timed_out",
  };
  ${catalogMissSource}
  return { catalogLookupMissReason };
`)();
assert.equal(catalogMiss.catalogLookupMissReason({
  normalizedQuery: "open farm rawmix wild ocean",
  resolutionDecision: "no_exact_variant",
  summary: { result_count: 3, ready_result_count: 3, image_result_count: 3 },
}), "no_exact_variant");
assert.equal(catalogMiss.catalogLookupMissReason({
  normalizedQuery: "pet food topper",
  resolutionDecision: "non_complete_confirmed",
  summary: { result_count: 0 },
}), null);
assert.equal(catalogMiss.catalogLookupMissReason({
  normalizedQuery: "iams minichunks",
  resolutionDecision: null,
  summary: { result_count: 4, ready_result_count: 4, image_result_count: 4 },
}), null);

const formulaRekeyMigration = fs.readFileSync(
  "supabase/migrations/323_reconcile_authoritative_formula_rekeys_by_gtin.sql",
  "utf8"
);
assert.match(formulaRekeyMigration, /existing\.formula_key <> incoming\.formula_key/);
assert.match(formulaRekeyMigration, /crossed a brand, species, or food-form boundary/);
assert.match(formulaRekeyMigration, /UPDATE public\.catalog_skus sku/);
assert.match(formulaRekeyMigration, /authoritative_formula_rekeyed_gtins/);

const deferredGtinGuardMigration = fs.readFileSync(
  "supabase/migrations/324_defer_catalog_gtin_formula_consistency.sql",
  "utf8"
);
assert.match(deferredGtinGuardMigration, /CREATE CONSTRAINT TRIGGER/);
assert.match(deferredGtinGuardMigration, /DEFERRABLE INITIALLY DEFERRED/);

const exactGtinServingLinkMigration = fs.readFileSync(
  "supabase/migrations/325_link_staged_formula_to_exact_serving_gtin.sql",
  "utf8"
);
assert.match(exactGtinServingLinkMigration, /serving\.gtin = incoming\.gtin/);
assert.match(exactGtinServingLinkMigration, /exact_gtin_serving_links/);

console.log("Independent catalog census contract check passed");
