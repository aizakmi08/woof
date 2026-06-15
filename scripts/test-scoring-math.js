#!/usr/bin/env node
/**
 * test-scoring-math.js — Unit tests for the v2 scoring rubric math.
 *
 * Runs LOCALLY with no network calls, no deployment needed. Validates:
 *   - 7-bucket weighted average computes correctly
 *   - overallScore drift correction only fires when drift > 5
 *   - Shuffled category order gets snapped back to canonical
 *   - Invalid enum values (processingMethod, aafcoStatement, etc.) normalize to "unknown"
 *   - schemaVersion is stamped on every pass through
 *   - Legacy 5-bucket input still reconciles via v1 weights
 *   - Out-of-range overallScore clamps to [1, 100]
 *   - Single-flavor "variety pack" collapses back to single-product shape
 *
 * CRITICAL: the normalizeAnalysis() implementation below is a Node-compatible
 * MIRROR of supabase/functions/analyze/index.ts#normalizeAnalysis. They must
 * stay in sync — any edit to one requires the same edit to the other.
 *
 * Usage: node scripts/test-scoring-math.js
 */

// ── MIRROR of supabase/functions/analyze/index.ts — keep these in sync ────

const ANALYSIS_SCHEMA_VERSION = 2;

const CATEGORY_WEIGHTS_V2 = [20, 15, 15, 15, 15, 10, 10];
const CATEGORY_NAMES_V2 = [
  "Protein Quality",
  "Processing Method",
  "Ingredient Safety",
  "Nutritional Balance",
  "Filler Content",
  "Manufacturer Track Record",
  "Additives & Preservatives",
];
const CATEGORY_WEIGHTS_V1 = [25, 20, 20, 20, 15];
const NUTRIENT_PERCENT_FIELDS = [
  "protein_pct",
  "fat_pct",
  "fiber_pct",
  "moisture_pct",
  "ash_pct",
  "calcium_pct",
  "phosphorus_pct",
  "omega_3_pct",
  "omega_6_pct",
];
const NUTRIENT_CALORIE_FIELDS = ["calories_per_cup", "calories_per_kg"];

function numericPanelField(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasUsablePublishedNutrientPanel(rawProduct) {
  if (!rawProduct || typeof rawProduct !== "object") return false;
  if (rawProduct.hasPublishedNutrients !== true) return false;

  const panel = rawProduct.nutrientPanel;
  if (!panel || typeof panel !== "object" || Array.isArray(panel)) return false;
  if (!["as-fed", "dry-matter"].includes(String(panel.basis || "").trim())) return false;

  let numericCount = 0;
  for (const field of NUTRIENT_PERCENT_FIELDS) {
    const numeric = numericPanelField(panel[field]);
    if (numeric == null) continue;
    if (numeric < 0 || numeric > 100) return false;
    numericCount++;
  }
  for (const field of NUTRIENT_CALORIE_FIELDS) {
    const numeric = numericPanelField(panel[field]);
    if (numeric == null) continue;
    if (numeric < 0 || numeric > 10000) return false;
    numericCount++;
  }

  return numericCount >= 2;
}

function normalizeAnalysis(obj, sourceProduct = null) {
  if (!obj || typeof obj !== "object" || obj.error) return obj;

  if (obj.isVarietyPack === true && (!Array.isArray(obj.flavors) || obj.flavors.length < 2)) {
    delete obj.isVarietyPack;
    delete obj.flavors;
    delete obj.bestFlavor;
    delete obj.worstFlavor;
    delete obj.commonIngredients;
  }

  if (Array.isArray(obj.categories) && obj.categories.length === 7) {
    const byName = new Map();
    for (const cat of obj.categories) {
      if (cat && typeof cat.name === "string") byName.set(cat.name, cat);
    }
    if (CATEGORY_NAMES_V2.every((n) => byName.has(n))) {
      obj.categories = CATEGORY_NAMES_V2.map((n) => byName.get(n));
    }
  }

  if (Array.isArray(obj.categories) && typeof obj.overallScore === "number") {
    const weights =
      obj.categories.length === 7 ? CATEGORY_WEIGHTS_V2 :
      obj.categories.length === 5 ? CATEGORY_WEIGHTS_V1 :
      null;

    if (weights) {
      let weightedSum = 0;
      let weightTotal = 0;
      for (let i = 0; i < obj.categories.length; i++) {
        const score = Number(obj.categories[i]?.score);
        if (Number.isFinite(score) && score >= 0 && score <= 100) {
          weightedSum += score * weights[i];
          weightTotal += weights[i];
        }
      }
      if (weightTotal > 0) {
        const expected = Math.round(weightedSum / weightTotal);
        const drift = Math.abs(obj.overallScore - expected);
        if (drift > 5) {
          obj.overallScore = expected;
        }
      }
    }
  }

  if (typeof obj.overallScore === "number") {
    obj.overallScore = Math.max(1, Math.min(100, Math.round(obj.overallScore)));
  }

  const PROCESSING_METHODS = new Set([
    "freeze-dried", "air-dried", "raw", "cold-pressed",
    "baked", "extruded", "canned", "unknown",
  ]);
  const AAFCO_STATEMENTS = new Set([
    "Adult Maintenance", "Growth", "All Life Stages",
    "Gestation/Lactation", "Supplemental/Intermittent",
    "None visible", "Unknown",
  ]);
  const COMPLETENESS = new Set(["complete", "partial", "incomplete"]);
  const RECALL_SEVERITY = new Set(["none", "minor", "major", "active", "unknown"]);
  const TESTING_TRANSPARENCY = new Set(["high", "moderate", "low", "unknown"]);

  if (obj.processingMethod != null && !PROCESSING_METHODS.has(obj.processingMethod)) {
    obj.processingMethod = "unknown";
  }
  if (obj.aafcoStatement != null && !AAFCO_STATEMENTS.has(obj.aafcoStatement)) {
    obj.aafcoStatement = "Unknown";
  }
  if (obj.nutrientDataCompleteness != null && !COMPLETENESS.has(obj.nutrientDataCompleteness)) {
    obj.nutrientDataCompleteness = "partial";
  }
  if (hasUsablePublishedNutrientPanel(sourceProduct)) {
    obj.nutrientDataCompleteness = "complete";
  }
  if (obj.recallSeverity != null && !RECALL_SEVERITY.has(obj.recallSeverity)) {
    obj.recallSeverity = "unknown";
  }
  if (obj.testingTransparency != null && !TESTING_TRANSPARENCY.has(obj.testingTransparency)) {
    obj.testingTransparency = "unknown";
  }

  obj.schemaVersion = ANALYSIS_SCHEMA_VERSION;

  return obj;
}

// ── Tiny assertion helpers ────────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  \u001b[31m✗\u001b[0m ${name}`);
    console.log(`    \u001b[31m${err.message}\u001b[0m`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || "expected"}: ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeep(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || "mismatch"}:\n  expected: ${b}\n  actual:   ${a}`);
}

// Build a canonical 7-bucket category input. Weights [20,15,15,15,15,10,10].
function cats(scores) {
  return CATEGORY_NAMES_V2.map((name, i) => ({ name, score: scores[i], detail: "..." }));
}

// ── Tests ────────────────────────────────────────────────────────────

console.log("\n=== normalizeAnalysis: scoring math ===\n");

test("7-bucket weighted average — all 80s → overall 80", () => {
  const scores = [80, 80, 80, 80, 80, 80, 80];
  // Claude returned 90 (drift of 10 from expected 80). Should correct.
  const out = normalizeAnalysis({ overallScore: 90, categories: cats(scores) });
  assertEqual(out.overallScore, 80, "expected drift correction to 80");
});

test("7-bucket weighted average — mixed scores reconcile correctly", () => {
  // Weights: [20,15,15,15,15,10,10]
  // Scores:  [90,50,80,70,60,40,95]
  // Sum = 90*20+50*15+80*15+70*15+60*15+40*10+95*10 = 1800+750+1200+1050+900+400+950 = 7050
  // Avg = 7050/100 = 70.5 → rounded = 71
  const out = normalizeAnalysis({ overallScore: 60, categories: cats([90, 50, 80, 70, 60, 40, 95]) });
  assertEqual(out.overallScore, 71, "expected 71 from weighted average");
});

test("drift ≤5 preserved — no correction", () => {
  // Expected = 80, Claude returned 83 → drift of 3 → no correction.
  const out = normalizeAnalysis({ overallScore: 83, categories: cats([80, 80, 80, 80, 80, 80, 80]) });
  assertEqual(out.overallScore, 83, "score within ±5 tolerance should be preserved");
});

test("drift exactly 5 preserved (boundary)", () => {
  const out = normalizeAnalysis({ overallScore: 85, categories: cats([80, 80, 80, 80, 80, 80, 80]) });
  assertEqual(out.overallScore, 85, "drift of exactly 5 should NOT trigger correction");
});

test("drift of 6 triggers correction", () => {
  const out = normalizeAnalysis({ overallScore: 86, categories: cats([80, 80, 80, 80, 80, 80, 80]) });
  assertEqual(out.overallScore, 80, "drift of 6 should correct");
});

test("Shuffled category order snaps back to canonical", () => {
  const shuffled = [
    { name: "Additives & Preservatives", score: 10, detail: "" },
    { name: "Protein Quality", score: 20, detail: "" },
    { name: "Manufacturer Track Record", score: 30, detail: "" },
    { name: "Processing Method", score: 40, detail: "" },
    { name: "Nutritional Balance", score: 50, detail: "" },
    { name: "Filler Content", score: 60, detail: "" },
    { name: "Ingredient Safety", score: 70, detail: "" },
  ];
  const out = normalizeAnalysis({ overallScore: 50, categories: shuffled });
  assertDeep(
    out.categories.map((c) => c.name),
    CATEGORY_NAMES_V2,
    "reordered categories should match canonical order",
  );
  // Scores must travel with their names, not their old indices:
  assertEqual(out.categories[0].score, 20, "Protein Quality should be 20 after reorder");
  assertEqual(out.categories[6].score, 10, "Additives & Preservatives should be 10 after reorder");
});

test("Shuffled reorder makes drift math correct", () => {
  // Same shuffled scores as above. After reorder to canonical:
  // [Protein=20, Processing=40, Safety=70, Nutrition=50, Filler=60, Track=30, Additives=10]
  // Weighted sum = 20*20 + 40*15 + 70*15 + 50*15 + 60*15 + 30*10 + 10*10
  //             = 400 + 600 + 1050 + 750 + 900 + 300 + 100 = 4100
  // Weighted avg = 4100/100 = 41
  const shuffled = [
    { name: "Additives & Preservatives", score: 10, detail: "" },
    { name: "Protein Quality", score: 20, detail: "" },
    { name: "Manufacturer Track Record", score: 30, detail: "" },
    { name: "Processing Method", score: 40, detail: "" },
    { name: "Nutritional Balance", score: 50, detail: "" },
    { name: "Filler Content", score: 60, detail: "" },
    { name: "Ingredient Safety", score: 70, detail: "" },
  ];
  const out = normalizeAnalysis({ overallScore: 99, categories: shuffled });
  assertEqual(out.overallScore, 41, "post-reorder weighted avg should be 41");
});

test("Category missing a name field — skip reorder, continue", () => {
  // If reorder can't happen (name mismatch), weighted math still runs on given order.
  const categories = [
    { name: "Unknown Category", score: 50, detail: "" },
    ...CATEGORY_NAMES_V2.slice(1).map((n) => ({ name: n, score: 80, detail: "" })),
  ];
  const out = normalizeAnalysis({ overallScore: 75, categories });
  // Weighted sum on given order = 50*20 + 80*(15+15+15+15+10+10) = 1000 + 80*80 = 7400
  // Avg = 7400/100 = 74 → drift from 75 = 1 → no correction
  assertEqual(out.overallScore, 75, "drift ≤5 preserved even when reorder skipped");
});

test("Legacy v1 (5-bucket) still reconciles", () => {
  const scoresV1 = [
    { name: "Protein Quality", score: 80, detail: "" },
    { name: "Ingredient Safety", score: 80, detail: "" },
    { name: "Nutritional Balance", score: 80, detail: "" },
    { name: "Filler Content", score: 80, detail: "" },
    { name: "Additives & Preservatives", score: 80, detail: "" },
  ];
  // v1 weights: [25,20,20,20,15] → all 80s → weighted avg = 80
  const out = normalizeAnalysis({ overallScore: 99, categories: scoresV1 });
  assertEqual(out.overallScore, 80, "v1 5-bucket should correct 99 → 80");
});

test("Score clamps to [1, 100]", () => {
  const a = normalizeAnalysis({ overallScore: 150 });
  assertEqual(a.overallScore, 100, "150 should clamp to 100");
  const b = normalizeAnalysis({ overallScore: -20 });
  assertEqual(b.overallScore, 1, "-20 should clamp to 1");
  const c = normalizeAnalysis({ overallScore: 0 });
  assertEqual(c.overallScore, 1, "0 should clamp to 1");
});

test("schemaVersion stamped on success", () => {
  const out = normalizeAnalysis({ overallScore: 50 });
  assertEqual(out.schemaVersion, 2, "schemaVersion should be stamped");
});

test("Error object passes through without stamping", () => {
  const out = normalizeAnalysis({ error: "Could not identify" });
  assertEqual(out.schemaVersion, undefined, "errors should not get schemaVersion");
});

test("Null / non-object input returns as-is", () => {
  assertEqual(normalizeAnalysis(null), null, "null in → null out");
  assertEqual(normalizeAnalysis(undefined), undefined, "undefined in → undefined out");
});

console.log("\n=== normalizeAnalysis: enum validation ===\n");

test("Invalid processingMethod → 'unknown'", () => {
  const out = normalizeAnalysis({ overallScore: 50, processingMethod: "microwaved" });
  assertEqual(out.processingMethod, "unknown", "unknown method should normalize");
});

test("Valid processingMethod preserved", () => {
  const out = normalizeAnalysis({ overallScore: 50, processingMethod: "freeze-dried" });
  assertEqual(out.processingMethod, "freeze-dried", "valid method preserved");
});

test("Invalid aafcoStatement → 'Unknown'", () => {
  const out = normalizeAnalysis({ overallScore: 50, aafcoStatement: "Senior Maintenance" });
  assertEqual(out.aafcoStatement, "Unknown", "unknown AAFCO should normalize");
});

test("Valid aafcoStatement preserved (All Life Stages)", () => {
  const out = normalizeAnalysis({ overallScore: 50, aafcoStatement: "All Life Stages" });
  assertEqual(out.aafcoStatement, "All Life Stages", "valid AAFCO preserved");
});

test("Invalid nutrientDataCompleteness → 'partial'", () => {
  const out = normalizeAnalysis({ overallScore: 50, nutrientDataCompleteness: "exhaustive" });
  assertEqual(out.nutrientDataCompleteness, "partial", "unknown completeness → partial");
});

test("Published nutrient panel forces nutrientDataCompleteness complete", () => {
  const out = normalizeAnalysis(
    { overallScore: 50, nutrientDataCompleteness: "incomplete" },
    {
      hasPublishedNutrients: true,
      nutrientPanel: {
        basis: "as-fed",
        protein_pct: 28,
        fat_pct: 16,
      },
    },
  );
  assertEqual(out.nutrientDataCompleteness, "complete", "usable published panel should override model output");
});

test("Placeholder nutrient panel does not force complete", () => {
  const out = normalizeAnalysis(
    { overallScore: 50, nutrientDataCompleteness: "partial" },
    {
      hasPublishedNutrients: true,
      nutrientPanel: {
        basis: "as-fed",
        protein_pct: 28,
      },
    },
  );
  assertEqual(out.nutrientDataCompleteness, "partial", "single numeric panel field is not enough");
});

test("Invalid recallSeverity → 'unknown'", () => {
  const out = normalizeAnalysis({ overallScore: 50, recallSeverity: "catastrophic" });
  assertEqual(out.recallSeverity, "unknown");
});

test("Invalid testingTransparency → 'unknown'", () => {
  const out = normalizeAnalysis({ overallScore: 50, testingTransparency: "excellent" });
  assertEqual(out.testingTransparency, "unknown");
});

test("Null enum values stay null (not stamped)", () => {
  const out = normalizeAnalysis({ overallScore: 50 });
  assertEqual(out.processingMethod, undefined, "unset enum stays unset");
  assertEqual(out.aafcoStatement, undefined);
});

console.log("\n=== normalizeAnalysis: variety-pack guard ===\n");

test("isVarietyPack=true with 1 flavor collapses to single product", () => {
  const out = normalizeAnalysis({
    overallScore: 70,
    isVarietyPack: true,
    flavors: [{ name: "Chicken", score: 70 }],
    bestFlavor: "Chicken",
    worstFlavor: "Chicken",
    commonIngredients: ["chicken"],
  });
  assertEqual(out.isVarietyPack, undefined, "isVarietyPack should be deleted");
  assertEqual(out.flavors, undefined);
  assertEqual(out.bestFlavor, undefined);
});

test("isVarietyPack=true with 3 flavors preserved", () => {
  const out = normalizeAnalysis({
    overallScore: 70,
    isVarietyPack: true,
    flavors: [
      { name: "Chicken", score: 70 },
      { name: "Salmon", score: 80 },
      { name: "Turkey", score: 75 },
    ],
  });
  assertEqual(out.isVarietyPack, true, "legitimate variety pack preserved");
  assertEqual(out.flavors.length, 3);
});

test("isVarietyPack=false untouched", () => {
  const out = normalizeAnalysis({ overallScore: 70, isVarietyPack: false });
  assertEqual(out.isVarietyPack, false);
});

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
process.exit(0);
