const mockTrackEvent = jest.fn(() => Promise.resolve());

jest.mock("../../services/analytics", () => ({
  trackEvent: (...args) => mockTrackEvent(...args),
}));
jest.mock("../../services/logger", () => ({
  createLogger: () => ({ debug: jest.fn() }),
}));

import {
  evaluatePerformanceSnapshot,
  logCaptureToResult,
  logLabelScanStageTimings,
  logResultsFirstPaint,
  logTapToCamera,
  logTypedSearchComplete,
  PERFORMANCE_BUDGETS_MS,
} from "../../services/performanceTimings";

describe("performance timing event idempotency", () => {
  beforeEach(() => {
    mockTrackEvent.mockClear();
    jest.spyOn(Date, "now").mockReturnValue(10_000);
  });

  test("a scanner effect rerender records tap-to-camera only once", () => {
    expect(logTapToCamera({
      navigationStartedAt: 9_750,
      sourceSurface: "home",
      mode: "barcode",
    })).toBe(250);
    expect(logTapToCamera({
      navigationStartedAt: 9_750,
      sourceSurface: "home",
      mode: "barcode",
    })).toBeNull();

    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
  });

  test("result and label-stage completion timings remain idempotent", () => {
    expect(logCaptureToResult({ captureStartedAt: 9_000, mode: "label_lookup" })).toBe(1_000);
    expect(logCaptureToResult({ captureStartedAt: 9_000, mode: "label_lookup" })).toBeNull();
    expect(logLabelScanStageTimings({ captureStartedAt: 9_001, stageTimings: {}, outcome: "success" }))
      .toMatchObject({ captureToFirstResultMs: 999 });
    expect(logLabelScanStageTimings({ captureStartedAt: 9_001, stageTimings: {}, outcome: "success" }))
      .toBeNull();

    expect(mockTrackEvent).toHaveBeenCalledTimes(2);
  });

  test("typed-search percentiles and Results first paint are measured once", () => {
    expect(logTypedSearchComplete({ searchStartedAt: 9_500, outcome: "success", resultCount: 4 }))
      .toBe(500);
    expect(logTypedSearchComplete({ searchStartedAt: 9_500, outcome: "success", resultCount: 4 }))
      .toBeNull();
    expect(logResultsFirstPaint({ navigationStartedAt: 9_800, mode: "catalog" })).toBe(200);
    expect(logResultsFirstPaint({ navigationStartedAt: 9_800, mode: "catalog" })).toBeNull();
    expect(mockTrackEvent).toHaveBeenCalledTimes(2);
  });

  test("performance budget evaluator fails values beyond each committed limit", () => {
    const atBudget = evaluatePerformanceSnapshot({
      coldStartInteractiveMs: PERFORMANCE_BUDGETS_MS.coldStartInteractive,
      tapToCameraMs: PERFORMANCE_BUDGETS_MS.tapToCamera,
      captureToResultMs: PERFORMANCE_BUDGETS_MS.captureToResult.label_lookup,
      captureToResultMode: "label_lookup",
      typedSearchP50Ms: PERFORMANCE_BUDGETS_MS.typedSearchP50,
      typedSearchP95Ms: PERFORMANCE_BUDGETS_MS.typedSearchP95,
      resultsFirstPaintMs: PERFORMANCE_BUDGETS_MS.resultsFirstPaint,
    });
    expect(Object.values(atBudget).every((value) => value === true)).toBe(true);

    const overBudget = evaluatePerformanceSnapshot({
      coldStartInteractiveMs: PERFORMANCE_BUDGETS_MS.coldStartInteractive + 1,
      tapToCameraMs: PERFORMANCE_BUDGETS_MS.tapToCamera + 1,
      captureToResultMs: PERFORMANCE_BUDGETS_MS.captureToResult.label_lookup + 1,
      captureToResultMode: "label_lookup",
      typedSearchP50Ms: PERFORMANCE_BUDGETS_MS.typedSearchP50 + 1,
      typedSearchP95Ms: PERFORMANCE_BUDGETS_MS.typedSearchP95 + 1,
      resultsFirstPaintMs: PERFORMANCE_BUDGETS_MS.resultsFirstPaint + 1,
    });
    expect(Object.values(overBudget).every((value) => value === false)).toBe(true);
  });
});
