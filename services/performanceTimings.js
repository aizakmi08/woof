import { trackEvent } from "./analytics";
import { createLogger } from "./logger";

const logger = createLogger("PERFORMANCE");
const jsBootStartedAt = Date.now();
let interactiveMarked = false;
const loggedNavigationStarts = new Set();
const loggedCaptureStarts = new Set();
const loggedLabelStageStarts = new Set();
const loggedSearchStarts = new Set();
const loggedResultsStarts = new Set();
const typedSearchDurationsMs = [];
export const PERFORMANCE_BUDGETS_MS = Object.freeze({
  coldStartInteractive: 2_500,
  tapToCamera: 1_000,
  typedSearchP50: 750,
  typedSearchP95: 2_000,
  resultsFirstPaint: 750,
  captureToResult: Object.freeze({
    barcode: 4_000,
    catalog: 4_000,
    label_lookup: 8_000,
    photo: 15_000,
    ingredient_capture: 15_000,
    human_food: 15_000,
  }),
});
const latestTimings = {
  jsBootStartedAt,
  coldStartInteractiveMs: null,
  coldStartSurface: null,
  tapToCameraMs: null,
  tapToCameraMode: null,
  captureToResultMs: null,
  captureToResultMode: null,
  typedSearchP50Ms: null,
  typedSearchP95Ms: null,
  typedSearchSampleCount: 0,
  resultsFirstPaintMs: null,
  resultsFirstPaintMode: null,
  labelScanStages: null,
};

function percentile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index];
}

function rememberStart(set, startedAt) {
  if (set.has(startedAt)) return false;
  set.add(startedAt);
  if (set.size > 50) set.delete(set.values().next().value);
  return true;
}

export function getPerformanceTimingSnapshot() {
  return {
    ...latestTimings,
    labelScanStages: latestTimings.labelScanStages
      ? { ...latestTimings.labelScanStages }
      : null,
  };
}

export function markColdStartInteractive(surface) {
  if (interactiveMarked) return null;
  interactiveMarked = true;
  const durationMs = Date.now() - jsBootStartedAt;
  latestTimings.coldStartInteractiveMs = durationMs;
  latestTimings.coldStartSurface = surface || "unknown";
  logger.debug(`[TIMER] Cold start to interactive (${surface}): ${durationMs}ms`);
  trackEvent("cold_start_interactive", {
    surface,
    duration_ms: durationMs,
    clock_scope: "js_boot_to_first_interactive_surface",
  });
  return durationMs;
}

export function navigationTimingParams(sourceSurface) {
  return {
    navigationStartedAt: Date.now(),
    navigationSourceSurface: sourceSurface,
  };
}

export function logTapToCamera({ navigationStartedAt, sourceSurface, mode }) {
  const startedAt = Number(navigationStartedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  if (loggedNavigationStarts.has(startedAt)) return null;
  loggedNavigationStarts.add(startedAt);
  if (loggedNavigationStarts.size > 50) {
    loggedNavigationStarts.delete(loggedNavigationStarts.values().next().value);
  }
  const durationMs = Math.max(0, Date.now() - startedAt);
  latestTimings.tapToCameraMs = durationMs;
  latestTimings.tapToCameraMode = mode || "unknown";
  logger.debug(`[TIMER] Tap to camera (${mode || "unknown"}): ${durationMs}ms`);
  trackEvent("tap_to_camera_ready", {
    duration_ms: durationMs,
    source_surface: sourceSurface || "unknown",
    scan_mode: mode || "unknown",
  });
  return durationMs;
}

export function logCaptureToResult({ captureStartedAt, mode, outcome }) {
  const startedAt = Number(captureStartedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  if (loggedCaptureStarts.has(startedAt)) return null;
  loggedCaptureStarts.add(startedAt);
  if (loggedCaptureStarts.size > 50) {
    loggedCaptureStarts.delete(loggedCaptureStarts.values().next().value);
  }
  const durationMs = Math.max(0, Date.now() - startedAt);
  latestTimings.captureToResultMs = durationMs;
  latestTimings.captureToResultMode = mode || "unknown";
  logger.debug(`[TIMER] Capture to result (${mode || "unknown"}): ${durationMs}ms`);
  trackEvent("capture_to_result", {
    duration_ms: durationMs,
    scan_mode: mode || "unknown",
    outcome: outcome || "unknown",
  });
  return durationMs;
}

export function logTypedSearchComplete({ searchStartedAt, outcome, resultCount }) {
  const startedAt = Number(searchStartedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || !rememberStart(loggedSearchStarts, startedAt)) {
    return null;
  }
  const durationMs = Math.max(0, Date.now() - startedAt);
  typedSearchDurationsMs.push(durationMs);
  if (typedSearchDurationsMs.length > 50) typedSearchDurationsMs.shift();
  latestTimings.typedSearchP50Ms = percentile(typedSearchDurationsMs, 0.5);
  latestTimings.typedSearchP95Ms = percentile(typedSearchDurationsMs, 0.95);
  latestTimings.typedSearchSampleCount = typedSearchDurationsMs.length;
  trackEvent("typed_search_timing", {
    duration_ms: durationMs,
    p50_ms: latestTimings.typedSearchP50Ms,
    p95_ms: latestTimings.typedSearchP95Ms,
    sample_count: typedSearchDurationsMs.length,
    result_count: Number(resultCount) || 0,
    outcome: outcome || "unknown",
  });
  return durationMs;
}

export function logResultsFirstPaint({ navigationStartedAt, mode }) {
  const startedAt = Number(navigationStartedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || !rememberStart(loggedResultsStarts, startedAt)) {
    return null;
  }
  const durationMs = Math.max(0, Date.now() - startedAt);
  latestTimings.resultsFirstPaintMs = durationMs;
  latestTimings.resultsFirstPaintMode = mode || "unknown";
  trackEvent("results_first_paint", {
    duration_ms: durationMs,
    scan_mode: mode || "unknown",
  });
  return durationMs;
}

export function evaluatePerformanceSnapshot(snapshot = latestTimings) {
  const mode = snapshot.captureToResultMode || "unknown";
  const captureBudget = PERFORMANCE_BUDGETS_MS.captureToResult[mode] ?? null;
  return {
    coldStartInteractive: snapshot.coldStartInteractiveMs == null
      ? null
      : snapshot.coldStartInteractiveMs <= PERFORMANCE_BUDGETS_MS.coldStartInteractive,
    tapToCamera: snapshot.tapToCameraMs == null
      ? null
      : snapshot.tapToCameraMs <= PERFORMANCE_BUDGETS_MS.tapToCamera,
    captureToResult: snapshot.captureToResultMs == null || captureBudget == null
      ? null
      : snapshot.captureToResultMs <= captureBudget,
    typedSearchP50: snapshot.typedSearchP50Ms == null
      ? null
      : snapshot.typedSearchP50Ms <= PERFORMANCE_BUDGETS_MS.typedSearchP50,
    typedSearchP95: snapshot.typedSearchP95Ms == null
      ? null
      : snapshot.typedSearchP95Ms <= PERFORMANCE_BUDGETS_MS.typedSearchP95,
    resultsFirstPaint: snapshot.resultsFirstPaintMs == null
      ? null
      : snapshot.resultsFirstPaintMs <= PERFORMANCE_BUDGETS_MS.resultsFirstPaint,
  };
}

export function logLabelScanStageTimings({
  captureStartedAt,
  stageTimings,
  outcome,
}) {
  const startedAt = Number(captureStartedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || !stageTimings) return null;
  if (loggedLabelStageStarts.has(startedAt)) return null;
  loggedLabelStageStarts.add(startedAt);
  if (loggedLabelStageStarts.size > 50) {
    loggedLabelStageStarts.delete(loggedLabelStageStarts.values().next().value);
  }

  const completed = {
    ...stageTimings,
    captureToFirstResultMs: Math.max(0, Date.now() - startedAt),
    outcome: outcome || "unknown",
  };
  latestTimings.labelScanStages = completed;
  logger.debug(`[TIMER] Label scan stages: ${JSON.stringify(completed)}`);
  trackEvent("label_scan_stage_timings", {
    camera_capture_ms: completed.cameraCaptureMs ?? null,
    scan_frame_crop_ms: completed.scanFrameCropMs ?? null,
    image_optimization_and_ocr_wall_ms: completed.imageOptimizationAndOcrWallMs ?? null,
    on_device_ocr_ms: completed.onDeviceOcrMs ?? null,
    capture_to_handoff_ms: completed.captureToHandoffMs ?? null,
    capture_to_resolver_ms: completed.captureToResolverMs ?? null,
    recognition_wall_ms: completed.recognitionWallMs ?? null,
    visual_path_ms: completed.visualPathMs ?? null,
    ocr_path_ms: completed.ocrPathMs ?? null,
    reconciliation_ms: completed.reconciliationMs ?? null,
    catalog_identity_rpc_ms: completed.catalogIdentityRpcMs ?? null,
    candidate_gate_ms: completed.candidateGateMs ?? null,
    fast_raw_count: completed.fastRawCount ?? null,
    fast_visible_candidate_count: completed.fastVisibleCandidateCount ?? null,
    fallback_triggered: completed.fallbackTriggered === true,
    fallback_reason: completed.fallbackReason ?? null,
    fallback_query_count: completed.fallbackQueryCount ?? 0,
    fallback_lookup_wall_ms: completed.fallbackLookupWallMs ?? 0,
    fallback_lookup_serial_equivalent_ms: completed.fallbackLookupSerialEquivalentMs ?? 0,
    fallback_lookup_saved_ms: completed.fallbackLookupSavedMs ?? 0,
    hydration_total_ms: completed.hydrationTotalMs ?? null,
    hydration_wait_ms: completed.hydrationWaitMs ?? null,
    capture_to_first_result_ms: completed.captureToFirstResultMs,
    outcome: completed.outcome,
  });
  return completed;
}
