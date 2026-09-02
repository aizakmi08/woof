const mockTrackEvent = jest.fn(() => Promise.resolve());

jest.mock("../../services/analytics", () => ({
  trackEvent: (...args) => mockTrackEvent(...args),
}));
jest.mock("../../services/logger", () => ({
  createLogger: () => ({ debug: jest.fn() }),
}));

import {
  logCaptureToResult,
  logLabelScanStageTimings,
  logTapToCamera,
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
});
