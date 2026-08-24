import { LABEL_RESOLUTION_DECISIONS } from "./labelResolution";

const RESOLUTION_MISS_REASONS = Object.freeze({
  [LABEL_RESOLUTION_DECISIONS.RECOGNIZERS_DISAGREE]: "recognizers_disagree",
  [LABEL_RESOLUTION_DECISIONS.NO_EXACT_VARIANT]: "no_exact_variant",
  [LABEL_RESOLUTION_DECISIONS.NOT_READABLE]: "label_not_readable",
  [LABEL_RESOLUTION_DECISIONS.TIMED_OUT]: "timed_out",
});

export function catalogLookupMissReason({
  normalizedQuery,
  identification,
  summary = {},
  errorMessage,
  resolutionDecision,
} = {}) {
  if (errorMessage) return "lookup_failed";
  if (!normalizedQuery) return "empty_query";
  if (resolutionDecision != null) {
    if (resolutionDecision === LABEL_RESOLUTION_DECISIONS.NON_COMPLETE_CONFIRMED) return null;
    const resolutionMiss = RESOLUTION_MISS_REASONS[resolutionDecision];
    if (resolutionMiss) return resolutionMiss;
  }

  if (identification && identification.found === false) return "label_not_readable";
  if (summary.result_count === 0) return "no_results";
  if (summary.catalog_result_count === 0 && summary.opff_result_count > 0) {
    return "catalog_gap_opff_hit";
  }
  if (summary.ready_result_count === 0) return "missing_ingredients";
  if (summary.image_result_count === 0) return "missing_images";
  return null;
}
