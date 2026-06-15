#!/usr/bin/env node
/**
 * test-calibration.js — Scoring calibration test for the v2 rubric.
 *
 * Unlike test-accuracy.js (which tests ingredient parsing against OPFF ground
 * truth), this test validates that the SCORING rubric produces defensible
 * numbers for well-known products across the quality spectrum.
 *
 * Each product has an expert-informed expected score RANGE. If the edge
 * function returns a score outside that range, the calibration fails — which
 * means either:
 *   - Claude is mis-judging a bucket (e.g. scoring extruded kibble too high)
 *   - The prompt needs tightening
 *   - Our expected range is wrong and needs revisiting with Eric
 *
 * We also validate:
 *   - schemaVersion === 2
 *   - categories.length === 7
 *   - processingMethod matches expected value
 *   - aafcoStatement is a valid enum
 *   - All seven category scores are present and in [0, 100]
 *
 * Usage:
 *   node scripts/test-calibration.js                  # all products
 *   node scripts/test-calibration.js --product=orijen # filter by substring
 *   node scripts/test-calibration.js --verbose        # print full per-product breakdown
 *
 * REQUIRES: the updated analyze EF must be deployed (supabase functions deploy analyze).
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANALYZE_URL = `${SUPABASE_URL}/functions/v1/analyze`;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = true] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

// ── Calibration panel ────────────────────────────────────────────────
//
// Each entry: name + verified ingredient text + expected scoring envelope.
// Ranges are informed by mainstream canine-nutrition consensus (AAFCO, canine
// nutritionist reviews). Give Claude a reasonable corridor — if it consistently
// overshoots or undershoots across multiple products, the prompt is off.

const PRODUCTS = [
  {
    slug: "stella-chewys-beef",
    productName: "Stella & Chewy's Stella's Super Beef Dinner Patties Freeze-Dried Raw",
    brand: "Stella & Chewy's",
    // Simplified ingredient list (real product has more)
    ingredientsText:
      "Beef, Beef Heart, Beef Liver, Beef Kidney, Beef Bone, Pumpkin Seed, Organic Cranberries, Organic Spinach, Organic Broccoli, Organic Beets, Organic Carrots, Organic Squash, Organic Blueberries, Fenugreek Seed, Potassium Chloride, Sodium Phosphate, Sodium Chloride, Choline Chloride, Dried Pediococcus acidilactici Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Tocopherols (Preservative), Taurine, Zinc Proteinate, Iron Proteinate, Vitamin E Supplement, Thiamine Mononitrate, Copper Proteinate, Manganese Proteinate, Sodium Selenite, Niacin Supplement, d-Calcium Pantothenate, Riboflavin Supplement, Vitamin A Supplement, Vitamin B12 Supplement, Pyridoxine Hydrochloride, Vitamin D3 Supplement, Folic Acid, Potassium Iodide.",
    expectedScoreMin: 80,
    expectedScoreMax: 95,
    expectedProcessing: "freeze-dried",
    tier: "top",
  },
  {
    slug: "orijen-original",
    productName: "Orijen Original Dry Dog Food",
    brand: "Orijen",
    ingredientsText:
      "Deboned chicken, deboned turkey, yellowtail flounder, whole eggs, whole Atlantic mackerel, chicken liver, turkey liver, chicken heart, turkey heart, whole Atlantic herring, dehydrated chicken, dehydrated turkey, dehydrated mackerel, dehydrated chicken liver, dehydrated turkey liver, whole green peas, whole navy beans, whole red lentils, chicken necks, chicken kidney, whole pinto beans, whole chickpeas, whole green lentils, whole yellow peas, lentil fiber, chicken fat, natural chicken flavor, herring oil, ground chicken bone, chicken cartilage, turkey cartilage, dried kelp, freeze-dried chicken liver, freeze-dried turkey liver, whole pumpkin, whole butternut squash, kale, spinach, mustard greens, collard greens, turnip greens, whole carrots, whole red delicious apples, whole Bartlett pears, pumpkin seeds, sunflower seeds, zinc proteinate, mixed tocopherols (preservative), chicory root, turmeric, sarsaparilla root, althea root, rosehips, juniper berries, dried Lactobacillus acidophilus fermentation product, dried Bifidobacterium animalis fermentation product, dried Lactobacillus casei fermentation product.",
    expectedScoreMin: 75,
    expectedScoreMax: 90,
    expectedProcessing: "extruded",
    tier: "high",
  },
  {
    slug: "open-farm-rawmix",
    productName: "Open Farm RawMix Grasslands Recipe Dog Food",
    brand: "Open Farm",
    ingredientsText:
      "Lamb, Beef, Cod, Chickpeas, Tapioca, Lentils, Beef Fat (Preserved with Mixed Tocopherols), Natural Flavors, Salmon Oil (Preserved with Mixed Tocopherols), Cod Meal, Pumpkin, Freeze-Dried Lamb, Freeze-Dried Beef Liver, Freeze-Dried Lamb Heart, Freeze-Dried Beef Tripe, Freeze-Dried Chicken, Sunflower Oil, Coconut, Carrots, Apples, Spinach, Blueberries, Cranberries, Lentil Fiber, Salt, Vitamin E Supplement, Zinc Proteinate, Potassium Chloride, Choline Chloride, Niacin Supplement, Thiamine Mononitrate, Calcium Pantothenate, Copper Proteinate, Vitamin A Supplement, Riboflavin Supplement, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Vitamin D3 Supplement, Folic Acid, Sodium Selenite, Manganese Proteinate, Calcium Iodate, Rosemary Extract, Dried Lactobacillus acidophilus Fermentation Product, Dried Bifidobacterium animalis Fermentation Product.",
    expectedScoreMin: 70,
    expectedScoreMax: 88,
    expectedProcessing: null, // could be extruded with freeze-dried toppers
    tier: "high",
  },
  {
    slug: "blue-buffalo-life-protection",
    productName: "Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice Recipe Dog Food",
    brand: "Blue Buffalo",
    ingredientsText:
      "Deboned Chicken, Chicken Meal, Brown Rice, Barley, Oatmeal, Chicken Fat (preserved with Mixed Tocopherols), Flaxseed (source of Omega 3 and 6 Fatty Acids), Peas, Fish Meal (source of Glucosamine), Natural Flavor, Dried Tomato Pomace, Potatoes, Pea Starch, Dehydrated Alfalfa Meal, Alfalfa Nutrient Concentrate, Whole Carrots, Sweet Potatoes, Blueberries, Cranberries, Barley Grass, Parsley, Garlic, Dried Kelp, Turmeric, Dried Chicory Root, Yucca Schidigera Extract, L-Carnitine, Vitamin E Supplement, Ferrous Sulfate, Zinc Amino Acid Chelate, Iron Amino Acid Chelate, Zinc Sulfate, Copper Sulfate, Niacin, Folic Acid, Biotin, Sodium Selenite, Manganese Sulfate, Manganese Amino Acid Chelate, Copper Amino Acid Chelate, Potassium Iodide, Thiamine Mononitrate, Ascorbic Acid, Pyridoxine Hydrochloride, Vitamin A Supplement, Vitamin B12 Supplement, Calcium Pantothenate, Riboflavin, Vitamin D3 Supplement, Choline Chloride, Preserved with Mixed Tocopherols.",
    expectedScoreMin: 55,
    expectedScoreMax: 72,
    expectedProcessing: "extruded",
    tier: "mid",
  },
  {
    slug: "purina-pro-plan-adult",
    productName: "Purina Pro Plan Complete Essentials Shredded Blend Chicken & Rice Adult Dry Dog Food",
    brand: "Purina Pro Plan",
    ingredientsText:
      "Chicken, rice, whole grain wheat, poultry by-product meal (natural source of glucosamine), corn gluten meal, soybean meal, beef fat naturally preserved with mixed-tocopherols, whole grain corn, fish meal (natural source of glucosamine), dried egg product, animal digest, wheat bran, calcium phosphate, calcium carbonate, potassium chloride, salt, sorbic acid (a preservative), Vitamin E supplement, mono and dicalcium phosphate, L-Lysine monohydrochloride, choline chloride, zinc proteinate, zinc sulfate, ferrous sulfate, manganese proteinate, niacin, Vitamin A supplement, calcium pantothenate, copper proteinate, manganese sulfate, copper sulfate, thiamine mononitrate, garlic oil, pyridoxine hydrochloride, riboflavin supplement, Vitamin B-12 supplement, calcium iodate, folic acid, biotin, Vitamin D-3 supplement, menadione sodium bisulfite complex (source of Vitamin K activity), sodium selenite.",
    expectedScoreMin: 35,
    expectedScoreMax: 58,
    expectedProcessing: "extruded",
    tier: "low-mid",
    // Flags: menadione (-15 Safety), by-product meal (cap 50), corn/wheat/soy in top 5 (cap 40 Filler)
  },
  {
    slug: "beneful-originals",
    productName: "Purina Beneful Originals with Real Beef Adult Dry Dog Food",
    brand: "Beneful",
    ingredientsText:
      "Beef, whole grain corn, barley, rice, whole grain wheat, corn gluten meal, chicken by-product meal (natural source of glucosamine), beef fat naturally preserved with mixed-tocopherols, soybean meal, oat meal, glycerin, egg and chicken flavor, poultry and pork digest, mono and dicalcium phosphate, calcium carbonate, salt, potassium chloride, dried carrots, dried peas, MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate, calcium iodate, sodium selenite], choline chloride, sorbic acid (a preservative), VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), Vitamin A supplement, calcium pantothenate (Vitamin B-5), thiamine mononitrate (Vitamin B-1), Vitamin B-12 supplement, riboflavin supplement (Vitamin B-2), pyridoxine hydrochloride (Vitamin B-6), folic acid (Vitamin B-9), Vitamin D-3 supplement, biotin (Vitamin B-7), Vitamin K, menadione sodium bisulfite complex], L-Lysine monohydrochloride, garlic oil, Red 40, Yellow 5, Yellow 6, Blue 2.",
    expectedScoreMin: 20,
    expectedScoreMax: 45,
    expectedProcessing: "extruded",
    tier: "low",
    // Flags: artificial colors (Red 40 etc → cap 30 Additives), by-product meal, corn/wheat first 5
  },
  {
    slug: "ol-roy-complete",
    productName: "Ol' Roy Complete Nutrition Chunky Dry Dog Food",
    brand: "Ol' Roy",
    ingredientsText:
      "Ground yellow corn, meat and bone meal, soybean meal, animal fat (preserved with BHA), poultry by-product meal, natural flavor, salt, calcium carbonate, potassium chloride, choline chloride, Yellow 6, Yellow 5, Red 40, Blue 2, zinc sulfate, iron oxide, vitamin E supplement, iron sulfate, niacin supplement, vitamin A supplement, copper sulfate, calcium pantothenate, manganese sulfate, thiamine mononitrate, pyridoxine hydrochloride, riboflavin supplement, vitamin D3 supplement, biotin, calcium iodate, vitamin B12 supplement, sodium selenite, folic acid, menadione sodium bisulfite complex.",
    expectedScoreMin: 10,
    expectedScoreMax: 30,
    expectedProcessing: "extruded",
    tier: "bottom",
    // Flags: BHA (cap 35), by-products, unnamed meat/animal, corn first (cap 40), artificial colors (cap 30), menadione
  },
  {
    slug: "fromm-gold-adult",
    productName: "Fromm Gold Adult Dry Dog Food",
    brand: "Fromm",
    ingredientsText:
      "Duck, Chicken Meal, Chicken, Oatmeal, Pearled Barley, Brown Rice, Menhaden Fish Meal, Lamb, White Rice, Dried Whole Egg, Cheese, Pork Meat Meal, Potatoes, Dried Tomato Pomace, Chicken Fat, Flaxseed, Salmon Oil, Carrots, Lettuce, Celery, Alfalfa Sprouts, Chicken Cartilage, Monosodium Phosphate, Salt, DL-Methionine, Potassium Chloride, Calcium Carbonate, Taurine, Chicory Root Extract, Yucca Schidigera Extract, Sodium Selenite, Sorbic Acid (Preservative), Vitamins [Vitamin A Supplement, Vitamin D3 Supplement, Vitamin E Supplement, Niacin, d-Calcium Pantothenate, Thiamine Mononitrate, Pyridoxine Hydrochloride, Riboflavin Supplement, Folic Acid, Biotin, Vitamin B12 Supplement, Ascorbic Acid], Minerals [Zinc Proteinate, Iron Proteinate, Copper Proteinate, Manganese Proteinate, Ethylenediamine Dihydriodide, Cobalt Proteinate], Probiotics [Dried Lactobacillus Acidophilus Fermentation Product, Dried Bifidobacterium Longum Fermentation Product, Dried Lactobacillus Plantarum Fermentation Product, Dried Enterococcus Faecium Fermentation Product].",
    expectedScoreMin: 65,
    expectedScoreMax: 82,
    expectedProcessing: "extruded",
    tier: "high-mid",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

async function callAnalyze(payload, timeoutMs = 60000) {
  const t0 = Date.now();
  const res = await fetch(ANALYZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ stream: true, ...payload }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`analyze ${res.status}: ${text.slice(0, 300)}`);
  }

  const ct = res.headers.get("content-type") || "";
  let fullText = "";

  if (ct.includes("text/event-stream")) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try {
          const evt = JSON.parse(p);
          if (evt.type === "content_block_delta" && evt.delta?.text) fullText += evt.delta.text;
          else if (evt.content?.[0]?.text) fullText += evt.content[0].text;
        } catch {}
      }
    }
  } else {
    const body = await res.json();
    fullText = body?.content?.[0]?.text || "";
  }

  const cleaned = fullText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  let analysis;
  try {
    analysis = JSON.parse(cleaned);
  } catch {
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > 0) {
      analysis = JSON.parse(cleaned.slice(0, lastBrace + 1));
    } else {
      throw new Error(`JSON parse failed. Raw (first 300): ${cleaned.slice(0, 300)}`);
    }
  }

  return { analysis, timeMs: Date.now() - t0 };
}

// ── Per-product runner ──────────────────────────────────────────────

const CATEGORY_NAMES_V2 = [
  "Protein Quality",
  "Processing Method",
  "Ingredient Safety",
  "Nutritional Balance",
  "Filler Content",
  "Manufacturer Track Record",
  "Additives & Preservatives",
];

async function runOne(product) {
  const checks = [];
  const failures = [];

  let analysis, timeMs;
  try {
    const result = await callAnalyze({
      mode: "verified",
      opffProduct: {
        productName: product.productName,
        brand: product.brand,
        petType: "dog",
        ingredientsText: product.ingredientsText,
        nutriments: {},
      },
    });
    analysis = result.analysis;
    timeMs = result.timeMs;
  } catch (err) {
    return { slug: product.slug, status: "error", error: err.message };
  }

  // ── Structural checks (schema correctness) ─────────────────────────
  checks.push({ name: "schemaVersion === 2", pass: analysis.schemaVersion === 2, got: analysis.schemaVersion });
  checks.push({
    name: "categories.length === 7",
    pass: Array.isArray(analysis.categories) && analysis.categories.length === 7,
    got: analysis.categories?.length,
  });

  const catNames = (analysis.categories || []).map((c) => c?.name);
  const namesOK = CATEGORY_NAMES_V2.every((n) => catNames.includes(n));
  checks.push({ name: "all 7 canonical category names present", pass: namesOK, got: catNames });

  const catScoresOK = (analysis.categories || []).every((c) => {
    const s = Number(c?.score);
    return Number.isFinite(s) && s >= 0 && s <= 100;
  });
  checks.push({ name: "all category scores ∈ [0, 100]", pass: catScoresOK });

  // ── Field presence ────────────────────────────────────────────────
  checks.push({ name: "processingMethod present", pass: !!analysis.processingMethod, got: analysis.processingMethod });
  checks.push({ name: "aafcoStatement present", pass: !!analysis.aafcoStatement, got: analysis.aafcoStatement });
  checks.push({ name: "nutrientDataCompleteness present", pass: !!analysis.nutrientDataCompleteness, got: analysis.nutrientDataCompleteness });
  checks.push({ name: "recallSeverity present", pass: !!analysis.recallSeverity, got: analysis.recallSeverity });
  checks.push({ name: "testingTransparency present", pass: !!analysis.testingTransparency, got: analysis.testingTransparency });

  // ── Enum validity (normalizeAnalysis should snap to known enums) ──
  const VALID_PROCESSING = new Set(["freeze-dried", "air-dried", "raw", "cold-pressed", "baked", "extruded", "canned", "unknown"]);
  const VALID_AAFCO = new Set(["Adult Maintenance", "Growth", "All Life Stages", "Gestation/Lactation", "Supplemental/Intermittent", "None visible", "Unknown"]);
  checks.push({ name: "processingMethod is valid enum", pass: VALID_PROCESSING.has(analysis.processingMethod), got: analysis.processingMethod });
  checks.push({ name: "aafcoStatement is valid enum", pass: VALID_AAFCO.has(analysis.aafcoStatement), got: analysis.aafcoStatement });

  // ── Calibration: score within expected range ─────────────────────
  const scoreInRange = typeof analysis.overallScore === "number" &&
    analysis.overallScore >= product.expectedScoreMin &&
    analysis.overallScore <= product.expectedScoreMax;
  checks.push({
    name: `overallScore ∈ [${product.expectedScoreMin}, ${product.expectedScoreMax}]`,
    pass: scoreInRange,
    got: analysis.overallScore,
    critical: true,
  });

  // ── Calibration: processing method matches expectation (if set) ──
  if (product.expectedProcessing) {
    checks.push({
      name: `processingMethod === ${product.expectedProcessing}`,
      pass: analysis.processingMethod === product.expectedProcessing,
      got: analysis.processingMethod,
      critical: true,
    });
  }

  const allPass = checks.every((c) => c.pass);
  for (const c of checks) if (!c.pass) failures.push(c);

  return {
    slug: product.slug,
    status: allPass ? "pass" : "fail",
    tier: product.tier,
    expectedRange: [product.expectedScoreMin, product.expectedScoreMax],
    actualScore: analysis.overallScore,
    processing: analysis.processingMethod,
    aafco: analysis.aafcoStatement,
    completeness: analysis.nutrientDataCompleteness,
    recallSeverity: analysis.recallSeverity,
    testingTransparency: analysis.testingTransparency,
    schemaVersion: analysis.schemaVersion,
    categoryScores: (analysis.categories || []).map((c) => ({ name: c?.name, score: c?.score })),
    timeMs,
    checks,
    failures,
  };
}

// ── Main ────────────────────────────────────────────────────────────

(async () => {
  const filter = args.product;
  const targets = PRODUCTS.filter((p) => !filter || p.slug.includes(filter));

  console.log(`\n=== Calibration test — ${targets.length} product(s) ===\n`);

  const results = [];
  for (const p of targets) {
    process.stdout.write(`  ${p.slug.padEnd(30)} `);
    const r = await runOne(p);
    results.push(r);

    if (r.status === "error") {
      console.log(`\u001b[31mERROR\u001b[0m — ${r.error}`);
      continue;
    }

    const tag = r.status === "pass" ? "\u001b[32mPASS\u001b[0m" : "\u001b[31mFAIL\u001b[0m";
    console.log(`${tag} score=${r.actualScore} (expected ${r.expectedRange[0]}-${r.expectedRange[1]}) processing=${r.processing} AAFCO=${r.aafco}`);

    if (r.failures.length > 0) {
      for (const f of r.failures) {
        const mark = f.critical ? "✗ CRITICAL" : "✗";
        console.log(`      \u001b[31m${mark}\u001b[0m ${f.name}` + (f.got !== undefined ? `  got: ${JSON.stringify(f.got)}` : ""));
      }
    }

    if (args.verbose) {
      console.log(`      categories:`);
      for (const c of r.categoryScores) console.log(`        ${c.name.padEnd(30)} ${c.score}`);
      console.log(`      recall: ${r.recallSeverity}  testing: ${r.testingTransparency}  completeness: ${r.completeness}`);
    }
  }

  // Summary
  const errors = results.filter((r) => r.status === "error");
  const passes = results.filter((r) => r.status === "pass");
  const fails = results.filter((r) => r.status === "fail");

  console.log("\n=== Summary ===");
  console.log(`  Pass:   ${passes.length}/${results.length}`);
  console.log(`  Fail:   ${fails.length}/${results.length}`);
  console.log(`  Error:  ${errors.length}/${results.length}`);

  // Breakdown by failure type
  const byFailure = new Map();
  for (const r of fails) {
    for (const f of r.failures) {
      byFailure.set(f.name, (byFailure.get(f.name) || 0) + 1);
    }
  }
  if (byFailure.size > 0) {
    console.log("\n  Most common failures:");
    const sorted = [...byFailure.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted.slice(0, 10)) {
      console.log(`    ${count}×  ${name}`);
    }
  }

  // Write report
  const fs = require("fs");
  const path = require("path");
  const reportDir = path.join(__dirname, "..", "test-fixtures");
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `_calibration-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n  Full report: ${reportPath}`);

  process.exit(fails.length + errors.length === 0 ? 0 : 1);
})();
