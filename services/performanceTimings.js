import { trackEvent } from "./analytics";
import { createLogger } from "./logger";

const logger = createLogger("PERFORMANCE");
const jsBootStartedAt = Date.now();
let interactiveMarked = false;
const loggedCaptureStarts = new Set();
const latestTimings = {
  jsBootStartedAt,
  coldStartInteractiveMs: null,
  coldStartSurface: null,
  tapToCameraMs: null,
  tapToCameraMode: null,
  captureToResultMs: null,
  captureToResultMode: null,
};

export function getPerformanceTimingSnapshot() {
  return { ...latestTimings };
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
