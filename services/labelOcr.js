import WoofLabelOcr from "../modules/woof-label-ocr";
import { createLogger } from "./logger";

const logger = createLogger("LABEL_OCR");
const MIN_TEXT_LENGTH = 6;

export function labelOcrIsAvailable() {
  return typeof WoofLabelOcr?.recognizeText === "function";
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
