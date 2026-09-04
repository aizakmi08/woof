import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("services/catalogMiss.js", "utf8")
  .replace(/^import[^\n]+\n/gm, "")
  .replace(/\bexport function\b/g, "function");

const { catalogLookupMissReason } = new Function(`
  const LABEL_RESOLUTION_DECISIONS = {
    EXACT_CONFIRMED: "exact_confirmed",
    RECOGNIZERS_DISAGREE: "recognizers_disagree",
    NO_EXACT_VARIANT: "no_exact_variant",
    NON_COMPLETE_CONFIRMED: "non_complete_confirmed",
    NOT_READABLE: "not_readable",
    TIMED_OUT: "timed_out",
  };
  ${source}
  return { catalogLookupMissReason };
`)();

assert.equal(
  catalogLookupMissReason({
    normalizedQuery: "science diet small",
    resolutionDecision: null,
    summary: { result_count: 0, catalog_result_count: 0, opff_result_count: 0 },
  }),
  "no_results",
  "a zero-result typed search must log no_results even without a label resolution decision"
);

assert.equal(
  catalogLookupMissReason({
    normalizedQuery: "science diet small",
    resolutionDecision: null,
    summary: {
      result_count: 2,
      catalog_result_count: 2,
      opff_result_count: 0,
      ready_result_count: 2,
      image_result_count: 2,
    },
  }),
  null,
  "a typed search with ready results must not log a catalog miss"
);

assert.equal(
  catalogLookupMissReason({
    normalizedQuery: "community product",
    resolutionDecision: null,
    summary: {
      result_count: 1,
      catalog_result_count: 0,
      opff_result_count: 1,
      ready_result_count: 1,
      image_result_count: 1,
    },
  }),
  "catalog_gap_opff_hit",
  "an OPFF-only typed-search result must remain visible to the catalog-gap funnel"
);

assert.equal(
  catalogLookupMissReason({
    normalizedQuery: "pet food topper",
    resolutionDecision: "non_complete_confirmed",
    summary: { result_count: 0 },
  }),
  null,
  "a confirmed non-complete product must not be counted as a pet-food catalog miss"
);

console.log("Catalog miss checks passed (typed zero-result, ready-result, OPFF-gap, and non-complete cases)");
