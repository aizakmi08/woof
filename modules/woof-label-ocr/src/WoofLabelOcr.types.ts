export type WoofLabelOcrLine = {
  text: string;
  confidence: number | null;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};

export type WoofLabelOcrResult = {
  text: string;
  lines: WoofLabelOcrLine[];
  durationMs: number;
};

export type WoofLabelCropResult = {
  uri: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
};
