import WoofLabelOcr from "../modules/woof-label-ocr";
import { createLogger } from "./logger";

const logger = createLogger("LABEL_OCR");
const MIN_TEXT_LENGTH = 6;

export function labelOcrIsAvailable() {
  return typeof WoofLabelOcr?.recognizeText === "function";
}

export function nativeLabelCropIsAvailable() {
  return typeof WoofLabelOcr?.cropToNormalizedRegion === "function";
}

export async function cropLabelToNormalizedRegion(imageUri, region = {}) {
  if (!nativeLabelCropIsAvailable() || !imageUri) return null;

  const x = Number(region.x);
  const y = Number(region.y);
  const width = Number(region.width);
  const height = Number(region.height);
  if (
    ![x, y, width, height].every(Number.isFinite)
    || x < 0
    || y < 0
    || width <= 0
    || height <= 0
    || x + width > 1.001
    || y + height > 1.001
  ) {
    return null;
  }

  try {
    const result = await WoofLabelOcr.cropToNormalizedRegion(
      imageUri,
      x,
      y,
      width,
      height
    );
    if (!result?.uri || !(Number(result.width) > 0) || !(Number(result.height) > 0)) {
      return null;
    }
    return {
      uri: String(result.uri),
      width: Number(result.width),
      height: Number(result.height),
      sourceWidth: Number(result.sourceWidth) || null,
      sourceHeight: Number(result.sourceHeight) || null,
    };
  } catch (error) {
    logger.debug("[LABEL_OCR] Native label crop failed:", error?.message || error);
    return null;
  }
}

export async function recognizeLabelText(imageUri) {
  if (!labelOcrIsAvailable() || !imageUri) return null;

  try {
    const result = await WoofLabelOcr.recognizeText(imageUri);
    const text = String(result?.text || "").trim();
    const lines = Array.isArray(result?.lines)
      ? result.lines
        .map((line) => ({
          text: String(line?.text || "").trim(),
          confidence: Number.isFinite(Number(line?.confidence)) ? Number(line.confidence) : null,
          bounds: line?.bounds && [
            line.bounds.x,
            line.bounds.y,
            line.bounds.width,
            line.bounds.height,
          ].every((value) => Number.isFinite(Number(value)))
            ? {
              x: Number(line.bounds.x),
              y: Number(line.bounds.y),
              width: Number(line.bounds.width),
              height: Number(line.bounds.height),
            }
            : null,
        }))
        .filter((line) => line.text)
      : [];

    return {
      text,
      lines,
      durationMs: Math.max(0, Number(result?.durationMs) || 0),
      usable: text.length >= MIN_TEXT_LENGTH,
    };
  } catch (error) {
    logger.debug("[LABEL_OCR] On-device recognition failed:", error?.message || error);
    return null;
  }
}
