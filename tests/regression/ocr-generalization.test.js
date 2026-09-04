import { labelOcrSearchQueries } from "../../services/labelOcrMatching";

describe("OCR preprocessing generalizes beyond benchmark products", () => {
  test("generic marketing claims are removed for an invented brand", () => {
    const queries = labelOcrSearchQueries(
      "Invented Pantry Rabbit Adult Recipe Formulated to support whole body health & vitality"
    );
    const combined = queries.join(" ").toLowerCase();

    expect(combined).toContain("invented pantry");
    expect(combined).toContain("rabbit");
    expect(combined).not.toContain("whole body health");
  });

  test("normal retailer chrome is filtered without QA-environment names", () => {
    const lines = [
      "Invented Pantry",
      "Rabbit Adult Recipe",
      "Search Amazon",
      "Deliver to 90210",
    ].map((text, index) => ({
      text,
      confidence: 0.99,
      bounds: { x: 0.25, y: 0.2 + (index * 0.12), width: 0.5, height: 0.06 },
    }));
    const queries = labelOcrSearchQueries(lines.map((line) => line.text).join("\n"), lines);
    const combined = queries.join(" ").toLowerCase();

    expect(combined).not.toContain("amazon");
    expect(combined).not.toContain("deliver");
    expect(combined).toContain("rabbit");
  });
});
