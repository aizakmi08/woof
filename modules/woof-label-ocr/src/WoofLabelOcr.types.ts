export type WoofLabelOcrLine = {
  text: string;
  confidence: number | null;
};

export type WoofLabelOcrResult = {
  text: string;
  lines: WoofLabelOcrLine[];
  durationMs: number;
};
