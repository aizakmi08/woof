import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.0";

const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
  "Vary": "Origin",
};

// ── Constants ────────────────────────────────────────────────────────

const MAX_IMAGE_B64_LENGTH = 7_000_000; // ~5 MB decoded
const MAX_REQUEST_BYTES = 8_000_000;
const MAX_FIELD_LENGTH = 10_000;
const MAX_PRODUCT_LOOKUP_NAME_LENGTH = 200;
const CLAUDE_TIMEOUT_MS = 120_000;
const STREAM_CACHE_TIMEOUT_MS = 120_000;
const EDGE_DB_TIMEOUT_MS = 8_000;
const EDGE_CACHE_READ_TIMEOUT_MS = 5_000;
const EDGE_CACHE_WRITE_TIMEOUT_MS = 5_000;
const EDGE_BRAND_PROFILE_TIMEOUT_MS = 4_000;
const EDGE_QUOTA_COMMIT_TIMEOUT_MS = 5_000;
const REVENUECAT_ENTITLEMENT_TIMEOUT_MS = 5_000;
const AUTH_PRIMARY_RATE_LIMIT_PER_HOUR = 20;
const AUTH_HELPER_RATE_LIMIT_PER_HOUR = 30;
const PRO_ENTITLEMENT_ID = "pro";
const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";

const ANALYZE_MODES = new Set([
  "photo",
  "verified",
  "human_food",
  "identify",
  "ingredients_lookup",
  "ocr_ingredients",
]);
const HELPER_MODES = new Set(["identify", "ingredients_lookup", "ocr_ingredients"]);

// Analysis rubric version. Bump when scoring logic or category shape changes so
// stale cache entries from older rubrics are ignored (client AND server).
//   v1 — original 5-bucket rubric (2025)
//   v2 — 7-bucket rubric adding Processing Method + Manufacturer Track Record,
//        AAFCO/data-completeness factored into Nutritional Balance (2026, from
//        nutritionist feedback)
const ANALYSIS_SCHEMA_VERSION = 2;

// 7-bucket weights — MUST match the category order in the system prompts and
// sum to 100. Order is enforced because we map by index, not by name.
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
// Legacy v1 weights kept only so old cached analyses still reconcile if someone
// wedges one into normalizeAnalysis by mistake — no new writes use v1.
const CATEGORY_WEIGHTS_V1 = [25, 20, 20, 20, 15];

const OPFF_ALLOWED_FIELDS = new Set([
  "productName", "brand", "petType", "ingredientsText",
  "nutriments", "nutriscoreGrade", "novaGroup", "barcode",
  "ingredients", "imageUrl",
  "source",
  "sourceTrustLevel", "sourceLabel", "sourceUrl",
  // v2 additions — full published nutrient panel from brand-page scrape.
  "nutrientPanel", "hasPublishedNutrients",
]);

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

// ── System prompts (server-side only — never sent to client) ─────────

const PHOTO_SYSTEM_PROMPT = `You are a pet food expert. Analyze the pet food product in this photo.

CRITICAL RULES — PRODUCT NAME (most important rule):
- The "productName" field MUST contain the EXACT product name as printed on the packaging in the photo.
- Read the brand, sub-brand, and variant/flavor text directly from the packaging. For example, if the package reads "Fancy Feast", "Gems", "Mousse Paté with Salmon", then productName = "Fancy Feast Gems - Mousse Paté with Salmon".
- "Gems" is NOT "Classic". "Mousse Paté" is NOT "Savory Centers". "Salmon" is NOT "Turkey". Each is a DIFFERENT product with DIFFERENT ingredients. Read the ACTUAL words — do NOT substitute a different product name from memory.
- If you cannot clearly read the full product name, include what you CAN read and note uncertainty in the summary.

VARIETY PACK DETECTION:
- If the product is a variety pack / multi-pack with MULTIPLE flavors or recipes, return a DIFFERENT format (see below).
- Signs of a variety pack: "Variety Pack", "Assorted", "Multi-Pack", multiple flavor names listed, "12 Pack", "24 Pack", "X Entrées" with multiple flavors.
- If it is a SINGLE flavor product (even if sold in multi-count like "6 cans"), use the standard single-product format.

CRITICAL RULES — INGREDIENT ACCURACY:
- ACCURACY IS PARAMOUNT. Never guess or fabricate ingredients.
- LABEL FIRST: If you can see ANY ingredient text on the photo (even partial), you MUST set "ingredientSource" to "label" and transcribe what you can read VERBATIM, in label order. Do not substitute Claude knowledge for visible text.
- If only the front of the bag is visible (no ingredient panel): set "ingredientSource" to "knowledge" AND set "needsIngredientPhoto" to true. List the ingredients you know for the EXACT product variant from training data — but flag low confidence.
- NEVER blend label text with knowledge. Either you read it from the photo (label) or you didn't (knowledge). Do not mix.
- Do NOT mix up ingredients between variants. Each sub-brand and flavor has its own formula.
- NEVER inflate scores. Accuracy over optimism.
- List the COMPLETE ingredient list — every protein, grain, fat, vitamin, mineral, supplement, preservative. A full pet food label has 25-60 ingredients. If you only output 15, you have skipped items.
- Include customer sentiment, nutritional breakdown, and safety info.

CRITICAL OUTPUT FORMAT REQUIREMENT:
- Return ONLY pure JSON - NO markdown code fences
- Start your response with an opening brace immediately
- End with a closing brace
- Do NOT wrap JSON in backtick code blocks
- Your FIRST character must be an opening brace

Use this exact format (IMPORTANT: output fields in EXACTLY this order — ingredients MUST come early):
{
  "productName": "Brand - Product Name",
  "petType": "dog" | "cat" | "unknown",
  "ingredientSource": "label" | "knowledge",
  "needsIngredientPhoto": true | false,
  "confidence": 0.0-1.0,
  "overallScore": 1-100,
  "processingMethod": "freeze-dried" | "air-dried" | "raw" | "cold-pressed" | "baked" | "extruded" | "canned" | "unknown",
  "processingDetail": "ONE short sentence on how this product is cooked (e.g. 'High-heat extruded kibble — industry standard but degrades heat-sensitive nutrients.')",
  "aafcoStatement": "Adult Maintenance" | "Growth" | "All Life Stages" | "Gestation/Lactation" | "Supplemental/Intermittent" | "None visible" | "Unknown",
  "nutrientDataCompleteness": "complete" | "partial" | "incomplete",
  "recallSeverity": "none" | "minor" | "major" | "active" | "unknown",
  "testingTransparency": "high" | "moderate" | "low" | "unknown",
  "nutritionAnalysis": {
    "proteinLevel": "high" | "moderate" | "low",
    "proteinPercent": "e.g. 26%",
    "fatLevel": "high" | "moderate" | "low",
    "fatPercent": "e.g. 15%",
    "fiberPercent": "e.g. 4%",
    "primaryProteinSource": "e.g. Deboned Chicken",
    "grainFree": true | false,
    "lifestage": "e.g. All Life Stages",
    "caloriesPerCup": "e.g. 380 kcal"
  },
  "ingredients": [
    { "name": "ingredient", "category": "protein|carb|fat|fiber|vitamin|mineral|preservative|other", "rating": "good|bad|neutral", "reason": "brief quality assessment", "description": "what this ingredient is in plain english", "alternatives": ["better alt 1"] }
  ],
  "summary": "2-3 sentence overall assessment",
  "verdict": "2-3 sentence recommendation.",
  "categories": [
    { "name": "Protein Quality", "score": 1-100, "detail": "brief assessment" },
    { "name": "Processing Method", "score": 1-100, "detail": "brief assessment of cooking method" },
    { "name": "Ingredient Safety", "score": 1-100, "detail": "brief assessment" },
    { "name": "Nutritional Balance", "score": 1-100, "detail": "AAFCO + nutrient completeness" },
    { "name": "Filler Content", "score": 1-100, "detail": "higher is better (less filler)" },
    { "name": "Manufacturer Track Record", "score": 1-100, "detail": "recalls + testing transparency" },
    { "name": "Additives & Preservatives", "score": 1-100, "detail": "higher is better (fewer harmful additives)" }
  ],
  "customerRating": {
    "score": 4.2,
    "outOf": 5,
    "totalReviews": "approximate number like 5000+",
    "sentiment": "short summary of what customers say",
    "commonPraises": ["2-4 word tag", "2-4 word tag", "2-4 word tag"],
    "commonComplaints": ["2-4 word tag", "2-4 word tag"]
  },
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2"],
  "recallHistory": "None known" | "description of recalls"
}

FOR VARIETY PACKS ONLY — use this format instead:
{
  "productName": "Brand - Variety Pack Name",
  "petType": "dog" | "cat" | "unknown",
  "isVarietyPack": true,
  "ingredientSource": "knowledge",
  "overallScore": 1-100 (average across all recipes),
  "summary": "Brief overview of the variety pack",
  "verdict": "Overall recommendation for this variety pack",
  "flavors": [
    {
      "name": "Flavor/Recipe Name (e.g. Chicken, Salmon, Turkey & Giblets)",
      "score": 1-100,
      "primaryProtein": "e.g. Chicken",
      "keyIngredients": ["top 3-5 notable ingredients"],
      "concern": "main concern or null if none"
    }
  ],
  "commonIngredients": ["ingredients shared across most/all recipes"],
  "bestFlavor": "name of highest scoring recipe",
  "worstFlavor": "name of lowest scoring recipe",
  "categories": [same 7 categories as above in the same order, averaged across recipes],
  "customerRating": {same format as above},
  "pros": ["pro 1", "pro 2"],
  "cons": ["con 1", "con 2"],
  "recallHistory": "None known" | "description"
}

List EVERY ingredient (typically 25-60 for full pet food labels) including every vitamin, mineral, supplement, probiotic, and preservative. Do NOT skip middle items to save space. Keep "reason" and "description" to ONE short sentence each. "alternatives" only for bad/neutral ingredients.

CONFIDENCE & SOURCE:
- "confidence" 0.0-1.0 = how sure you are about the ingredient list. 0.9+ if read directly off a clear label; 0.6-0.8 if knowledge for a known SKU; <0.5 if guessing.
- "needsIngredientPhoto" = true ONLY if you set ingredientSource="knowledge" AND your confidence is below 0.85. This tells the app to prompt the user for a clearer label photo.

SCORING (weighted average across 7 buckets — weights MUST sum to 100, be strict):

1. Protein Quality (20%): Named whole meat first ("Deboned Chicken", "Lamb") = 70+. Named meal ("Chicken Meal") = 50-69. By-products = cap overall score at 40 (not 50 — by-products are rendered scraps of inconsistent quality). No named species ("meat meal", "animal fat", "poultry by-product") = cap 25.

2. Processing Method (15%) — cap by method, since cooking destroys nutrients and creates carcinogens at high heat:
   - Freeze-dried raw / raw: 90+ (minimal nutrient degradation)
   - Air-dried: 85-95 (low heat, long dwell, strong retention)
   - Cold-pressed: 75-85 (lower temps than extrusion)
   - Baked / gently cooked: 70-85 (moderate heat)
   - Extruded kibble (standard high-heat): cap at 60 — high-pressure/high-heat extrusion oxidizes fats and destroys heat-sensitive vitamins; formula is re-sprayed with synthetic vitamins after.
   - Canned/retort: 55-70 (high heat, but protected from oxygen)
   - Unknown: 55 (lean pessimistic, flag it)
   Downgrade extruded by another 5-10 if product also has long ingredient list (heavy processing compounding).

3. Ingredient Safety (15%): BHA/BHT/ethoxyquin in ingredient list = cap overall 30 (not 35 — these are suspected carcinogens). Propylene glycol = cap 35. Menadione (synthetic K3) = -15 from this bucket. Carrageenan = -5. Sodium tripolyphosphate = -5.

4. Nutritional Balance (15%) — AAFCO appropriateness is the core signal here:
   - "Adult Maintenance" or "Growth" AAFCO statement (specific life stage): baseline 70-85 depending on macronutrient profile.
   - "All Life Stages": -15 from baseline (was -10 — this is a bigger compromise than most brands admit). Meets puppy-growth minimums (high calcium/phosphorus) which is NOT optimal for adult or senior dogs.
   - "Supplemental/Intermittent" (not complete & balanced): cap at 40.
   - "None visible" or "Unknown" AAFCO: -25 from baseline — red flag regardless.
   - "nutrientDataCompleteness" = "incomplete" (only guaranteed analysis, no full panel): -10 additional. The guaranteed analysis is a min/max statement — real nutrient density requires the full panel converted to dry-matter basis. Brands that hide this data get penalized.

5. Filler Content (15%): Corn, wheat, or soy in the top 3 = cap 35 (was 40). Multiple unnamed grains ("grain products", "cereal fines", "middlings") = cap 25. Named whole grains (brown rice, oats) are fine.

6. Manufacturer Track Record (10%):
   - No known recalls + high testing transparency (third-party lab testing disclosed, aflatoxin/salmonella panels, SQF/BRC certified): 85+.
   - No known recalls + moderate transparency: 70-80.
   - No known recalls + unknown testing practices: 60-70.
   - Minor old recalls (voluntary, >5 years ago, single batch): 55-70.
   - Major recall history (multiple, recent, serious contamination): 30-50.
   - Active FDA warning letter or ongoing contamination concerns: <30.
   - Use your knowledge of the brand's recall record from training data. "recallSeverity" summarizes this.

7. Additives & Preservatives (10%): Artificial colors (Red 40, Yellow 5, etc.) = cap 30. Artificial flavors = cap 40. Natural preservatives only (mixed tocopherols, rosemary extract) = 80+.

OVERALL SCORE: weighted average of the 7 categories using these weights — you MUST compute and output a value that reconciles with this formula (server will clamp if drift >5).

Tiers: 85-100 Excellent, 70-84 Good, 50-69 Average, 30-49 Below Average, 1-29 Poor.
By-products as primary protein = cap overall 40 regardless of other scores. NEVER inflate. When in doubt between two scores, pick the LOWER.

BUDGET / MASS-MARKET BRAND FLOOR (critical — these brands are over-rated by default inference):
  Iams, Pedigree, Ol' Roy, Beneful, Purina Dog Chow, Cat Chow, Alpo, Kibbles n Bits, Gravy Train, Friskies, Meow Mix, Whiskas, Cesar, Eukanuba, Pure Balance, SportMix.
  These brands use corn/wheat/soy filler and by-products aggressively. Default floor: 28-42. Do NOT score any of them above 50 unless the specific recipe has (a) named whole meat first AND (b) no corn/wheat/soy in top 3 AND (c) natural preservatives only AND (d) specific AAFCO life stage. Verify ALL four before going above 50.

ANTI-CLUSTERING RULE (critical — scoring must feel differentiated, not scripted):
  Do NOT repeatedly produce the same "convenient" number (38, 45, 50, 58, 65) for different products. Two products with similar issues MUST differ by at least ±3 based on:
    - Recall recency (active recall > recent <3yr > old 5yr+ > none)
    - Specific preservative used (ethoxyquin > BHA > BHT > mixed tocopherols)
    - AAFCO specificity (no statement < all life stages < growth-only < adult-maintenance)
    - Depth of bad items (one by-product vs. multiple; single artificial color vs. multiple)
    - Public testing (any disclosed third-party test > none)
  If your first instinct is a "38" or "45", look at what makes THIS recipe specifically different from a neighbor with the same floor, and adjust by ±3 to ±7. Numeric precision matters — the user will see many products side by side.

INFERENCE GUIDANCE (resist defaulting to "unknown" — only use it when you truly cannot tell):

• processingMethod — use the product name, brand, and form factor:
  - "Freeze-Dried" / "Freeze Dried Raw" in name → freeze-dried. (Stella & Chewy's, Primal, Vital Essentials, Small Batch)
  - "Air-Dried" / "Dehydrated" → air-dried. (ZiwiPeak, The Honest Kitchen, Sojos)
  - "Raw" / "Raw Patties" / "Raw Nuggets" → raw.
  - "Baked" / "Oven-Baked" / burger-shape dog food → baked. (Carna4, Acana Burgers, Dr. Harvey's baked)
  - "Cold-Pressed" → cold-pressed.
  - Standard dry kibble from mainstream brands (Purina, Blue Buffalo, Hill's, Royal Canin, Iams, Eukanuba, Pedigree, Kirkland, Ol' Roy, Beneful, Pro Plan, Diamond, Fromm, Orijen, Acana kibble, Taste of the Wild, Victor, Nutro, Wellness dry) → extruded.
  - Wet food in cans/trays/pouches ("Pate", "Stew", "Morsels", "Entrée") → canned.
  - unknown ONLY if the product is a true outlier and brand signals don't disambiguate.

• aafcoStatement — from the product name and packaging cues:
  - "Adult", "Senior", "Mature", "Indoor Adult" → Adult Maintenance.
  - "Puppy", "Growth", "Large Breed Puppy", "Starter", "Kitten" → Growth.
  - "All Life Stages", "All Stages" → All Life Stages.
  - "Supplement", "Topper", "Treat", "Mixer", "Bone Broth", "Meal Booster" → Supplemental/Intermittent.
  - If the packaging genuinely has no AAFCO statement visible in the photo → "None visible".
  - Unknown ONLY when you cannot tell the life-stage positioning at all.

• recallSeverity / recallHistory — use training-data knowledge of the brand:
  - "none" for brands with clean records (Orijen/Acana/Champion, Stella & Chewy's, Open Farm, Fromm, Farmina, etc.).
  - "minor" for brands with a single voluntary recall >5 years ago.
  - "major" for brands with multiple recent recalls or serious contamination (Diamond Pet Foods 2012 salmonella, certain Purina grain-free lines 2014 vitamin D, Hill's 2019 vitamin D, Midwestern Pet Foods aflatoxin 2020-2021).
  - "active" only when there is a current FDA warning letter or ongoing contamination investigation.
  - Cite the specific recall(s) you recall in recallHistory. If you don't know the brand at all → "unknown" + "Recall record could not be verified".

• testingTransparency — default "unknown" unless the brand is publicly known for:
  - third-party lab testing with published results (Champion Petfoods, Carna4, certain raw brands publish) → high
  - disclosed internal testing without third-party → moderate
  - no public testing information → low

• nutrientDataCompleteness — default "partial" unless ingredient data is clearly only min/max guaranteed analysis (→ incomplete) or the full nutrient panel is published (→ complete).

FORMAT: commonPraises/Complaints = 2-4 word tags. primaryProteinSource = protein name only. lifestage = concise ("Adult", "Puppy").

If not pet food: { "error": "Could not identify this as a pet food product." }`;

const VERIFIED_DATA_PROMPT = `You are a pet food expert. You have been given REAL, VERIFIED ingredient and nutrition data from a product database. Do NOT guess or make up any data — analyze ONLY what is provided.

CRITICAL RULES:
- NEVER inflate scores to make products seem better than they are. Accuracy over optimism.
- If uncertain about any data point, say so in your assessment rather than guessing.

INGREDIENT COMPLETENESS — THIS IS NON-NEGOTIABLE:
- The user is shown the COMPLETE label ingredient list. If your "ingredients" array is missing items they will see a blank entry.
- You MUST output ONE ENTRY for EVERY ingredient in the input list — including every vitamin, every mineral, every supplement, every probiotic, every preservative.
- Output them in the EXACT SAME ORDER as the input. Do not reorder, group, or summarize.
- Do NOT skip "boring" middle items. A 50-ingredient label MUST produce a 50-entry array.
- Per-item fields are intentionally minimal so you have room for the full list.

Steps:
1. For EVERY ingredient in the input, emit one entry: name, category, rating, one-sentence reason.
2. Assess overall nutritional quality from the verified data.
3. Provide a comprehensive score and assessment.

CRITICAL OUTPUT FORMAT REQUIREMENT:
- Return ONLY pure JSON - NO markdown code fences
- Start your response with an opening brace immediately
- End with a closing brace
- Do NOT wrap JSON in backtick code blocks
- Your FIRST character must be an opening brace

Use this exact format (IMPORTANT: output fields in EXACTLY this order — ingredients MUST come early):
{
  "productName": "Brand - Product Name",
  "petType": "dog" | "cat" | "unknown",
  "overallScore": 1-100,
  "processingMethod": "freeze-dried" | "air-dried" | "raw" | "cold-pressed" | "baked" | "extruded" | "canned" | "unknown",
  "processingDetail": "ONE short sentence (≤20 words) on cooking method",
  "aafcoStatement": "Adult Maintenance" | "Growth" | "All Life Stages" | "Gestation/Lactation" | "Supplemental/Intermittent" | "None visible" | "Unknown",
  "nutrientDataCompleteness": "complete" | "partial" | "incomplete",
  "recallSeverity": "none" | "minor" | "major" | "active" | "unknown",
  "testingTransparency": "high" | "moderate" | "low" | "unknown",
  "nutritionAnalysis": {
    "proteinLevel": "high" | "moderate" | "low",
    "proteinPercent": "from data or N/A",
    "fatLevel": "high" | "moderate" | "low",
    "fatPercent": "from data or N/A",
    "fiberPercent": "from data or N/A",
    "primaryProteinSource": "from ingredients list",
    "grainFree": true | false,
    "lifestage": "from data or Unknown",
    "caloriesPerCup": "from data or N/A"
  },
  "ingredients": [
    { "name": "ingredient (verbatim)", "category": "protein|carb|fat|fiber|vitamin|mineral|preservative|other", "rating": "good|bad|neutral", "reason": "ONE plain-english sentence (≤15 words) explaining what it is and why it's rated this way" }
  ],
  "summary": "ONE sentence overall assessment (≤25 words)",
  "verdict": "ONE sentence recommendation (≤20 words)",
  "categories": [
    { "name": "Protein Quality", "score": 1-100, "detail": "≤8 words" },
    { "name": "Processing Method", "score": 1-100, "detail": "≤8 words — cooking method" },
    { "name": "Ingredient Safety", "score": 1-100, "detail": "≤8 words" },
    { "name": "Nutritional Balance", "score": 1-100, "detail": "≤8 words — AAFCO + completeness" },
    { "name": "Filler Content", "score": 1-100, "detail": "≤8 words" },
    { "name": "Manufacturer Track Record", "score": 1-100, "detail": "≤8 words — recalls + testing" },
    { "name": "Additives & Preservatives", "score": 1-100, "detail": "≤8 words" }
  ],
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2"],
  "recallHistory": "None known"
}

Per-ingredient: "reason" ≤15 words, plain English. NO "description" or "alternatives" fields — keeping the per-item payload lean is what lets you fit all 50+ ingredients in one response.

REMEMBER: every ingredient in the input must produce one entry. No exceptions for vitamins, minerals, supplements, or trailing extracts.

SCORING (weighted average across 7 buckets, weights sum to 100 — be strict):

1. Protein Quality (20%): Named whole meat first = 70+. Named meal = 50-69. By-products = cap overall 40 (not 50 — rendered scraps of inconsistent quality). Unnamed species = cap 25.

2. Processing Method (15%): Freeze-dried raw/raw 90+, air-dried 85-95, cold-pressed 75-85, baked 70-85, extruded kibble cap 60, canned 55-70, unknown 55. Extrusion destroys heat-sensitive nutrients and requires synthetic vitamin re-spraying.

3. Ingredient Safety (15%): BHA/BHT/ethoxyquin = cap overall 30 (suspected carcinogens). Propylene glycol = cap 35. Menadione = -15. Carrageenan = -5.

4. Nutritional Balance (15%): AAFCO + completeness. Specific AAFCO life stage ("Adult Maintenance", "Growth") = baseline 70-85. "All Life Stages" = -15 (meets puppy minimums; NOT optimal for adults/seniors). "Supplemental/Intermittent" = cap 40. No AAFCO visible = -25. "nutrientDataCompleteness" = "incomplete" = additional -10 (brands hiding full nutrient panels get penalized).

5. Filler Content (15%): Corn/wheat/soy in top 3 = cap 35. Multiple unnamed grains = cap 25.

6. Manufacturer Track Record (10%): No recalls + high transparency (third-party testing, SQF/BRC certified) = 85+. No recalls + moderate = 70-80. No recalls + unknown testing = 60-70. Minor old recalls = 55-70. Major recalls = 30-50. Active FDA action = <30. Use training-data knowledge of the brand.

7. Additives & Preservatives (10%): Artificial colors = cap 30. Artificial flavors = cap 40. Natural preservatives only = 80+.

OVERALL SCORE: weighted average across the 7 categories. Must reconcile with the weighted formula (server clamps drift >5).
Tiers: 85-100 Excellent, 70-84 Good, 50-69 Average, 30-49 Below Average, 1-29 Poor.
By-products as primary protein = cap overall 40. NEVER inflate. When in doubt between two scores, pick the LOWER.

BUDGET / MASS-MARKET BRAND FLOOR (critical — these brands are over-rated by default inference):
  Iams, Pedigree, Ol' Roy, Beneful, Purina Dog Chow, Cat Chow, Alpo, Kibbles n Bits, Gravy Train, Friskies, Meow Mix, Whiskas, Cesar, Eukanuba, Pure Balance, SportMix.
  Default floor: 28-42. Do NOT score any of them above 50 unless the specific recipe has ALL FOUR: named whole meat first AND no corn/wheat/soy in top 3 AND natural preservatives only AND specific AAFCO life stage.

ANTI-CLUSTERING RULE: Do NOT repeatedly produce the same "convenient" number (38, 45, 50, 58, 65) for different products. Two products with similar issues MUST differ by at least ±3 based on: recall recency, specific preservative used, AAFCO specificity, depth of bad items, public testing disclosure. If your first instinct is 38/45, find the specific differentiator and adjust by ±3 to ±7.

INFERENCE (resist "unknown" — use brand/name cues):
- processingMethod: "Freeze-Dried"/"Raw" in name → freeze-dried/raw. "Air-Dried"/"Dehydrated" → air-dried. "Baked"/"Oven-Baked" → baked. "Cold-Pressed" → cold-pressed. Mainstream dry kibble (Purina/Blue/Hill's/Royal Canin/Iams/Kirkland/Ol' Roy/Pro Plan/Orijen kibble/Acana kibble/Fromm/Taste of the Wild/Victor/Diamond) → extruded. Cans/trays/pouches → canned.
- aafcoStatement: "Adult/Senior/Mature" → Adult Maintenance. "Puppy/Growth/Kitten" → Growth. "All Life Stages/All Stages" → All Life Stages. "Supplement/Topper/Booster/Treat" → Supplemental/Intermittent. Default Unknown only when truly ambiguous.
- recallSeverity: brands with documented major recalls (Diamond 2012, certain Purina Pro Plan 2014 grain-free, Hill's 2019 vit D, Midwestern Pet Foods 2020-21 aflatoxin) → major/active. Clean-record brands (Orijen/Acana/Champion, Stella & Chewy's, Open Farm, Fromm, Farmina) → none. Single old voluntary recall → minor. Cite specifically in recallHistory; "unknown" only for truly obscure brands.
- testingTransparency: default low. "high" only if brand publicly publishes third-party lab results (rare).
- nutrientDataCompleteness: "incomplete" if only guaranteed analysis min/max visible, "complete" if full nutrient panel known, else "partial".

FORMAT: commonPraises/Complaints = 2-4 word tags. primaryProteinSource = protein name only. lifestage = concise.`;

const HUMAN_FOOD_PROMPT = `You are a veterinary nutrition expert. A pet owner is showing you a HUMAN food item and wants to know if it is safe for their pet to eat.

CRITICAL IDENTIFICATION RULES:
- Look VERY carefully at the image. Describe what you actually see — color, texture, shape, packaging, labels.
- If you see a label or packaging, read it and use that to identify the food. The label is ALWAYS more reliable than visual appearance.
- Do NOT confuse similar-looking meats: chicken is light pink/white when raw, pale white when cooked. Pork is light pink. Beef is dark red. Shrimp is pink/orange and curved. Look at the ACTUAL colors and shapes.
- If you cannot confidently identify the food from the image, set foodName to "Unidentified food" and safetyLevel to "caution" with a note to verify.
- NEVER guess between similar foods. If it looks like chicken but you aren't sure, say "Appears to be chicken (verify before feeding)".
- ACCURACY IS PARAMOUNT. A wrong identification could be dangerous.

CRITICAL OUTPUT FORMAT REQUIREMENT:
- Return ONLY pure JSON - NO markdown code fences
- Start your response with an opening brace immediately
- Your FIRST character must be an opening brace

Use this exact format:
{
  "foodName": "Name of the food identified",
  "confidence": 0.0-1.0,
  "petType": "dog" | "cat",
  "safetyLevel": "safe" | "caution" | "dangerous",
  "summary": "1 short sentence, max 15 words",
  "explanation": "2-3 sentences explaining why, citing specific compounds or nutrients",
  "toxicCompounds": ["compound name"] or [],
  "symptoms": "What symptoms to watch for, or 'N/A' if safe",
  "portions": "Specific portion guidance (e.g. '1-2 small pieces, no bones or skin') or 'Do not feed'",
  "benefits": ["short benefit phrase"] or [],
  "alternatives": ["safer alternative"] or [],
  "ageGuidance": {
    "puppiesOrKittens": "safe" | "caution" | "avoid",
    "adults": "safe" | "caution" | "avoid",
    "seniors": "safe" | "caution" | "avoid",
    "note": "Brief age-specific note (e.g. 'Too hard for puppies under 12 weeks' or 'Safe for all ages in moderation')"
  },
  "preparation": "How to prepare safely (e.g. 'Must be cooked, plain, no seasoning, bones removed') or 'N/A'",
  "disclaimer": "Individual pets may have allergies. Always consult your veterinarian."
}

Safety classifications:
- "safe": Pet can eat this in moderation with no known risks
- "caution": Risks or conditions apply (e.g., lactose, bones, seasoning)
- "dangerous": Toxic or harmful — do not feed

KNOWN TOXIC FOODS (always classify as "dangerous"):
- Dogs: grapes, raisins, chocolate, xylitol/birch sugar, onions, garlic (large amounts), macadamia nuts, alcohol, caffeine, avocado pit/skin, raw yeast dough, nutmeg
- Cats: onions, garlic, chocolate, caffeine, alcohol, grapes, raisins, xylitol, raw eggs, lilies

CONFIDENCE SCORING:
- 0.9-1.0: Clear photo, confident identification (label visible, or distinctive food)
- 0.7-0.89: Likely identification but some ambiguity (no label, similar-looking foods)
- 0.5-0.69: Uncertain — could be multiple foods. Set safetyLevel to "caution" if ANY possibility is dangerous.
- Below 0.5: Cannot identify. Set foodName to "Unidentified food" and safetyLevel to "caution".
- When in doubt between a safe and dangerous food (e.g., dark round fruit = grapes or blueberries?), ALWAYS default to "dangerous" and explain both possibilities.

IMPORTANT:
- The "summary" must be SHORT — a quick verdict like "Plain cooked chicken is safe for dogs" or "Chocolate is toxic to dogs". Not a paragraph.
- "portions" must be SPECIFIC — say "2-3 small cubes" not "small amounts".
- "preparation" must explain HOW to serve safely — "cooked, plain, no bones, no skin, no seasoning".
- "ageGuidance" is REQUIRED — puppies/kittens have different tolerances than adults.

If not food: { "error": "Could not identify this as a food item. Please try again with a clearer photo." }`;

const OCR_INGREDIENTS_PROMPT = `You are an OCR system reading a pet food ingredient label. Extract the COMPLETE ingredient list EXACTLY as printed.

CRITICAL RULES:
- Transcribe ONLY what you can see in the image. Do NOT add ingredients from your training knowledge or memory.
- If a word is partially obscured, write what you can read and mark it with [unclear].
- Do NOT reorder ingredients. The order on the label matters (descending by weight).
- Include ALL text: vitamins, minerals, preservatives, supplements, and their parenthetical groupings.
- Keep original punctuation and groupings like "Minerals (Zinc Sulfate, Iron Sulfate)" as one item.

Return ONLY this JSON:
{
  "success": true,
  "ingredientText": "Chicken, Chicken Meal, Brown Rice, Oatmeal, ...",
  "ingredientCount": 35,
  "confidence": 0.95
}

If the image does NOT show an ingredient label or is unreadable:
{"success": false, "reason": "No ingredient label visible"}`;

const IDENTIFY_PROMPT = `You are an OCR system. Extract text from this pet food package image.

STEP 1: List every piece of text you can see on the packaging. Read each word exactly as printed. Do NOT infer, guess, or substitute any text from your knowledge. If a word says "OPEN FARM", write "Open Farm" — NOT "Honest Kitchen" or any other brand.

STEP 2: From the text you read, identify:
- Brand name (usually the largest/most prominent text, often with a logo)
- Product name/type (e.g. "Meat Balls", "Classic Paté", "Raw Boost")
- Flavor/variant (e.g. "Harvest Chicken Recipe", "Grass-Fed Beef Recipe")

STEP 3: Combine them into productName.

CRITICAL: The brand name on the package is FINAL. If the package says "Open Farm", the brand is "Open Farm" — even if the product description sounds like another brand. You are reading text, not identifying products from memory.

CRITICAL OUTPUT FORMAT REQUIREMENT:
- Return ONLY pure JSON - NO markdown code fences
- Your FIRST character must be an opening brace

Return ONLY this JSON:
{
  "identified": true,
  "confidence": 0.95,
  "textReadFromPackage": ["OPEN FARM", "Fresh & Gently Cooked", "GRASS-FED BEEF RECIPE", "FOOD FOR DOGS", "16 OZ"],
  "productName": "Open Farm Fresh & Gently Cooked Grass-Fed Beef Recipe",
  "brand": "Open Farm",
  "subBrand": "Fresh & Gently Cooked",
  "variant": "Grass-Fed Beef Recipe",
  "petType": "dog",
  "lifeStage": "adult",
  "productType": "wet",
  "size": "16 oz",
  "searchTerms": ["Open Farm Grass-Fed Beef Recipe", "Open Farm Gently Cooked Beef", "Open Farm Beef dog food", "Open Farm Beef"]
}

RULES:
1. "textReadFromPackage" MUST list every distinct text element you can see. This forces you to actually read before naming.
2. "brand" MUST come from textReadFromPackage — it is the most prominent brand text/logo on the package.
3. "productName" is assembled from textReadFromPackage items. Do NOT use any text not in that list.
4. "confidence" reflects text readability: 0.95+ clear, 0.7-0.94 partial, below 0.7 guessing.
5. Do NOT analyze ingredients or provide scores. ONLY read text and identify.
6. "searchTerms" MUST have 4-6 entries — these are alternate query strings used for database lookup. Include:
   a. The full assembled product name
   b. brand + variant (most distinctive form)
   c. brand + flavor noun only ("Open Farm Beef")
   d. brand + sub-brand ("Open Farm Gently Cooked")
   e. variant words alone ("Grass-Fed Beef Recipe")
   The more variations you provide, the better the chance we find an existing entry in our database.`;

// ── Helpers ──────────────────────────────────────────────────────────

function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("Origin");
  if (!origin) {
    return BASE_CORS_HEADERS;
  }

  const allowedOrigins = (Deno.env.get("ALLOWED_CORS_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const isDevelopmentOrigin =
    Deno.env.get("ENVIRONMENT") !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin);

  if (!allowedOrigins.includes(origin) && !isDevelopmentOrigin) {
    return null;
  }

  return {
    ...BASE_CORS_HEADERS,
    "Access-Control-Allow-Origin": origin,
  };
}

function makeJsonResponse(
  body: Record<string, unknown>,
  status = 200,
  corsHeaders: Record<string, string> = BASE_CORS_HEADERS,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function startLinkedTimedRequest(label: string, timeoutMs: number, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    console.log(`[ANALYZE] ${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    controller.abort();
  }, timeoutMs);
  const abortFromParent = () => {
    console.log(`[ANALYZE] ${label} aborted because client request closed`);
    controller.abort();
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    abort: () => controller.abort(),
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function runSupabaseQuery(
  label: string,
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  buildQuery: (signal: AbortSignal) => PromiseLike<any>,
): Promise<any> {
  const request = startLinkedTimedRequest(label, timeoutMs, parentSignal);
  try {
    return await buildQuery(request.signal);
  } finally {
    request.cleanup();
  }
}

function logAuditEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.log("[ANALYZE_AUDIT]", JSON.stringify({ event, ...fields }));
}

function runBackgroundTask(label: string, task: Promise<unknown>): void {
  const guarded = task.catch((err) => {
    console.error(`[ANALYZE] ${label} background task failed:`, (err as Error).message);
  });
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (typeof edgeRuntime?.waitUntil === "function") {
    edgeRuntime.waitUntil(guarded);
  }
}

function parseRevenueCatExpiration(expiresDate: unknown): string | null {
  if (typeof expiresDate !== "string" || !expiresDate) return null;
  const ms = Date.parse(expiresDate);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function isRevenueCatEntitlementActive(entitlement: Record<string, unknown> | null): boolean {
  if (!entitlement) return false;
  const expiresAt = parseRevenueCatExpiration(entitlement.expires_date);
  if (!expiresAt) return true;
  return Date.parse(expiresAt) > Date.now();
}

function isStoredProExpirationActive(profile: { pro_expires_at?: unknown } | null): boolean {
  const expiresAt = parseRevenueCatExpiration(profile?.pro_expires_at);
  return Boolean(expiresAt && Date.parse(expiresAt) > Date.now());
}

function subscriptionSyncUnavailableResponse(corsHeaders: Record<string, string> = BASE_CORS_HEADERS): Response {
  return makeJsonResponse(
    {
      error: "Subscription sync unavailable. Please try again in a moment.",
      code: "subscription_sync_unavailable",
    },
    503,
    corsHeaders,
  );
}

async function recoverProEntitlementFromRevenueCat(
  supabase: any,
  userId: string,
  parentSignal?: AbortSignal,
): Promise<{ checked: boolean; active: boolean }> {
  const revenueCatApiKey = Deno.env.get("REVENUECAT_REST_API_KEY") || "";
  if (!revenueCatApiKey) {
    logAuditEvent("revenuecat_entitlement_recovery", {
      outcome: "skipped",
      reason: "missing_api_key",
    });
    return { checked: false, active: false };
  }

  const request = startLinkedTimedRequest(
    "RevenueCat entitlement recovery",
    REVENUECAT_ENTITLEMENT_TIMEOUT_MS,
    parentSignal,
  );

  try {
    const response = await fetch(`${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${revenueCatApiKey}`,
        "Accept": "application/json",
      },
      signal: request.signal,
    });

    if (!response.ok) {
      logAuditEvent("revenuecat_entitlement_recovery", {
        outcome: "failed",
        status: response.status,
      });
      return { checked: true, active: false };
    }

    const data = await response.json();
    const entitlement = data?.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID] || null;
    const active = isRevenueCatEntitlementActive(entitlement);
    const expiresAt = parseRevenueCatExpiration(entitlement?.expires_date);

    if (active) {
      const { error } = await runSupabaseQuery(
        "RevenueCat entitlement profile update",
        EDGE_DB_TIMEOUT_MS,
        parentSignal,
        (signal) => supabase
          .from("profiles")
          .update({
            is_pro: true,
            pro_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId)
          .abortSignal(signal),
      );

      if (error) {
        logAuditEvent("revenuecat_entitlement_recovery", {
          outcome: "profile_update_failed",
        });
        console.error("[ANALYZE] RevenueCat entitlement profile update failed:", error.message);
        return { checked: true, active: false };
      }
    }

    logAuditEvent("revenuecat_entitlement_recovery", {
      outcome: active ? "activated" : "inactive",
      hasExpiration: Boolean(expiresAt),
    });
    return { checked: true, active };
  } catch (err) {
    logAuditEvent("revenuecat_entitlement_recovery", {
      outcome: request.didTimeout() ? "timeout" : "failed",
    });
    console.error("[ANALYZE] RevenueCat entitlement recovery failed:", (err as Error).message);
    return { checked: true, active: false };
  } finally {
    request.cleanup();
  }
}

/**
 * Sanitize opffProduct: strip unknown fields, enforce size limits.
 */
function sanitizeOpffProduct(raw: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(raw)) {
    if (!OPFF_ALLOWED_FIELDS.has(key)) continue;
    const val = raw[key];
    if (typeof val === "string" && val.length > MAX_FIELD_LENGTH) {
      sanitized[key] = val.slice(0, MAX_FIELD_LENGTH);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

function numericPanelField(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasUsablePublishedNutrientPanel(rawProduct: any): boolean {
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

function buildVerifiedDataText(opffProduct: Record<string, any>): string {
  const safe = sanitizeOpffProduct(opffProduct);
  const n = safe.nutriments || {};
  const panel = safe.nutrientPanel || null;
  const sourceLabel = typeof safe.sourceLabel === "string" && safe.sourceLabel.trim()
    ? safe.sourceLabel.trim()
    : "Ingredient data";
  const sourceTrustLevel = typeof safe.sourceTrustLevel === "string" && safe.sourceTrustLevel.trim()
    ? safe.sourceTrustLevel.trim()
    : "unknown";

  const lines: (string | null)[] = [
    `Product: ${safe.productName || "Unknown"}`,
    safe.brand ? `Brand: ${safe.brand}` : null,
    safe.petType ? `Pet Type: ${safe.petType}` : null,
    `Ingredient Source: ${sourceLabel}`,
    `Ingredient Source Trust: ${sourceTrustLevel}`,
    safe.sourceUrl ? `Ingredient Source URL: ${safe.sourceUrl}` : null,
    safe.ingredientsText ? `\nIngredients List:\n${safe.ingredientsText}` : null,
  ];

  // Prefer the full published nutrient panel when present (brand-site scrape
  // data — most accurate). Includes the DM-basis flag so Claude knows whether
  // to convert before scoring. When absent, fall back to per-100g OPFF data
  // or just the guaranteed analysis from the bag.
  if (panel && typeof panel === "object") {
    lines.push("\nFull Nutrient Panel (from brand source — use THIS for Nutritional Balance scoring):");
    lines.push(`  Basis: ${panel.basis || "as-fed (unspecified)"}`);
    if (panel.protein_pct != null) lines.push(`  Protein: ${panel.protein_pct}%`);
    if (panel.fat_pct != null) lines.push(`  Fat: ${panel.fat_pct}%`);
    if (panel.fiber_pct != null) lines.push(`  Fiber: ${panel.fiber_pct}%`);
    if (panel.moisture_pct != null) lines.push(`  Moisture: ${panel.moisture_pct}%`);
    if (panel.ash_pct != null) lines.push(`  Ash: ${panel.ash_pct}%`);
    if (panel.calcium_pct != null) lines.push(`  Calcium: ${panel.calcium_pct}%`);
    if (panel.phosphorus_pct != null) lines.push(`  Phosphorus: ${panel.phosphorus_pct}%`);
    if (panel.omega_3_pct != null) lines.push(`  Omega-3: ${panel.omega_3_pct}%`);
    if (panel.omega_6_pct != null) lines.push(`  Omega-6: ${panel.omega_6_pct}%`);
    if (panel.calories_per_cup != null) lines.push(`  Calories: ${panel.calories_per_cup} kcal/cup`);
    if (panel.calories_per_kg != null) lines.push(`  Calories: ${panel.calories_per_kg} kcal/kg`);
    lines.push("\nNote: nutrientDataCompleteness = \"complete\" for this product — the brand publishes a full panel. Score accordingly (do not apply the -10 incomplete-data penalty).");
  } else {
    // Fallback: per-100g OPFF data. Less complete than a full panel but better
    // than nothing. Claude should flag nutrientDataCompleteness = "incomplete"
    // or "partial" when this is the only nutrient data available.
    if (n.protein != null) lines.push(`Protein: ${n.protein}g per 100g`);
    if (n.fat != null) lines.push(`Fat: ${n.fat}g per 100g`);
    if (n.fiber != null) lines.push(`Fiber: ${n.fiber}g per 100g`);
    if (n.energy != null) lines.push(`Energy: ${n.energy} kcal per 100g`);
  }

  if (safe.nutriscoreGrade) lines.push(`Nutriscore Grade: ${String(safe.nutriscoreGrade).toUpperCase()}`);
  if (safe.novaGroup) lines.push(`NOVA Group: ${safe.novaGroup}`);

  return lines.filter(Boolean).join("\n");
}

/**
 * Same normalization as client-side — must produce identical keys.
 */
function normalizeCacheKey(productName: string): string {
  return productName
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    // MUST match services/cache.js#normalizeCacheKey — hyphens → space so
    // "multi-protein" tokenizes the same way the scrapers stored it.
    .replace(/[-/&]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract accumulated text content from raw SSE data.
 */
function extractTextFromSSE(sseText: string): string {
  let result = "";
  for (const line of sseText.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") break;
    try {
      const event = JSON.parse(data);
      if (event.type === "content_block_delta" && event.delta?.text) {
        result += event.delta.text;
      }
    } catch {
      // skip malformed SSE lines
    }
  }
  return result;
}

/**
 * Parse Claude's raw text output into JSON, stripping markdown fences.
 */
function cleanAndParse(text: string): Record<string, any> | null {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "");
    }
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Validate analysis response has required fields.
 */
function hasText(value: any): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function petFoodAnalysisValidationError(obj: any): string | null {
  if (obj == null || typeof obj !== "object" || obj.error) {
    return "missing analysis object";
  }
  if (!hasText(obj.productName)) {
    return "missing productName";
  }
  if (!["dog", "cat"].includes(obj.petType)) {
    return "missing petType";
  }
  if (
    typeof obj.overallScore !== "number" ||
    obj.overallScore < 1 ||
    obj.overallScore > 100
  ) {
    return "missing overallScore";
  }
  if (!hasText(obj.summary)) return "missing summary";
  if (!hasText(obj.verdict)) return "missing verdict";

  if (!Array.isArray(obj.ingredients) || obj.ingredients.length < 3) {
    return "missing ingredients";
  }
  for (const ingredient of obj.ingredients) {
    if (
      !ingredient ||
      typeof ingredient !== "object" ||
      !hasText(ingredient.name) ||
      !hasText(ingredient.category) ||
      !["good", "bad", "neutral"].includes(ingredient.rating) ||
      !hasText(ingredient.reason)
    ) {
      return "invalid ingredient";
    }
  }

  if (!Array.isArray(obj.categories) || obj.categories.length !== CATEGORY_NAMES_V2.length) {
    return "missing categories";
  }
  const categoryNames = new Set(
    obj.categories
      .filter((category: any) =>
        category &&
        typeof category === "object" &&
        hasText(category.name) &&
        typeof category.score === "number" &&
        category.score >= 1 &&
        category.score <= 100 &&
        hasText(category.detail)
      )
      .map((category: any) => category.name),
  );
  if (!CATEGORY_NAMES_V2.every((name) => categoryNames.has(name))) {
    return "invalid categories";
  }

  const nutrition = obj.nutritionAnalysis;
  if (
    !nutrition ||
    typeof nutrition !== "object" ||
    !hasText(nutrition.proteinLevel) ||
    !hasText(nutrition.fatLevel) ||
    !hasText(nutrition.primaryProteinSource)
  ) {
    return "missing nutritionAnalysis";
  }

  if (!hasText(obj.processingMethod)) return "missing processingMethod";
  if (!hasText(obj.processingDetail)) return "missing processingDetail";
  if (!hasText(obj.aafcoStatement)) return "missing aafcoStatement";
  if (!hasText(obj.nutrientDataCompleteness)) return "missing nutrientDataCompleteness";
  if (!hasText(obj.recallSeverity)) return "missing recallSeverity";
  if (!hasText(obj.recallHistory)) return "missing recallHistory";
  if (!hasText(obj.testingTransparency)) return "missing testingTransparency";

  return null;
}

function isValidAnalysis(obj: any): boolean {
  return petFoodAnalysisValidationError(obj) === null;
}

/**
 * Server-side post-processing guard rails. Runs after Claude returns and BEFORE
 * we cache the result, so every user (now and in the future) gets the corrected
 * version. Responsibilities:
 *   1. Reconcile overallScore against the weighted average of category scores —
 *      Claude occasionally drifts by a few points. We clamp when drift >5.
 *   2. Repair an isVarietyPack=true response that only has one flavor (e.g.
 *      a 12-pack of a single recipe) — collapse back to single-product shape.
 *   3. Stamp the result with schemaVersion so future cache invalidations
 *      can distinguish this rubric from older ones.
 *   4. Normalize new v2 enum fields (processingMethod, aafcoStatement, etc.)
 *      so UI can rely on a known vocabulary without re-validating each render.
 */
function normalizeAnalysis(obj: any, sourceProduct: any = null): any {
  if (!obj || typeof obj !== "object" || obj.error) return obj;

  // Variety-pack guard: collapse to single-product format if there's <=1 flavor.
  if (obj.isVarietyPack === true && (!Array.isArray(obj.flavors) || obj.flavors.length < 2)) {
    delete obj.isVarietyPack;
    delete obj.flavors;
    delete obj.bestFlavor;
    delete obj.worstFlavor;
    delete obj.commonIngredients;
  }

  // Defensive category reorder: we map weights by index, so if Claude ever
  // returns the 7 categories in a different order (a paraphrase, or shuffled),
  // the weighted-average would compute the wrong number. Match by name first
  // and snap back to canonical order when we have a clean match.
  if (Array.isArray(obj.categories) && obj.categories.length === 7) {
    const byName = new Map<string, any>();
    for (const cat of obj.categories) {
      if (cat && typeof cat.name === "string") byName.set(cat.name, cat);
    }
    if (CATEGORY_NAMES_V2.every((n) => byName.has(n))) {
      obj.categories = CATEGORY_NAMES_V2.map((n) => byName.get(n));
    }
  }

  // Score consistency: clamp overallScore to the weighted average of categories.
  // v2 uses 7 buckets (weights 20/15/15/15/15/10/10). v1 legacy uses 5 buckets
  // (weights 25/20/20/20/15) — we still handle them so a stale cached entry that
  // somehow re-enters this function doesn't break.
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
          console.log(`[ANALYZE] Score drift corrected: ${obj.overallScore} → ${expected} (was ${drift} off weighted avg, ${obj.categories.length} buckets)`);
          obj.overallScore = expected;
        }
      }
    }
  }

  // Score bounds — Claude occasionally returns out-of-range values
  if (typeof obj.overallScore === "number") {
    obj.overallScore = Math.max(1, Math.min(100, Math.round(obj.overallScore)));
  }

  // Normalize v2 enum fields defensively — treat anything unrecognized as "unknown".
  // Claude is reliable but an unexpected string would break the UI chip components.
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

  // Stamp the rubric version so future reads can ignore pre-v2 cache entries.
  obj.schemaVersion = ANALYSIS_SCHEMA_VERSION;

  return obj;
}

/**
 * Validate human food safety response has required fields.
 */
function isValidHumanFoodAnalysis(obj: any): boolean {
  const hasText = (value: any) => typeof value === "string" && value.trim().length > 0;
  const age = obj?.ageGuidance;
  return (
    obj != null &&
    typeof obj === "object" &&
    !obj.error &&
    hasText(obj.foodName) &&
    ["dog", "cat"].includes(obj.petType) &&
    ["safe", "caution", "dangerous"].includes(obj.safetyLevel) &&
    hasText(obj.summary) &&
    hasText(obj.explanation) &&
    hasText(obj.symptoms) &&
    hasText(obj.portions) &&
    hasText(obj.preparation) &&
    hasText(obj.disclaimer) &&
    age != null &&
    typeof age === "object" &&
    ["safe", "caution", "avoid"].includes(age.puppiesOrKittens) &&
    ["safe", "caution", "avoid"].includes(age.adults) &&
    ["safe", "caution", "avoid"].includes(age.seniors) &&
    hasText(age.note)
  );
}

/**
 * Normalize a brand string the same way seed-brand-recalls.js does, so the
 * lookup key matches what was inserted into brand_recalls.brand_normalized.
 */
function normalizeBrandForLookup(brand: string): string {
  if (!brand) return "";
  return brand
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|®|™|\u00ae|\u2122/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract a brand guess from a Claude-generated product name. Claude is
 * prompted to format as "Brand - Product Name" so the brand is the segment
 * before the first dash. Falls back to the first 2 tokens when no dash is
 * present. Not perfect — the lookup layer tries exact then progressive trims.
 */
function extractBrandFromProductName(productName: string): string | null {
  if (!productName) return null;
  const beforeDash = productName.split(/\s*[–—-]\s*/)[0];
  if (beforeDash && beforeDash !== productName) return beforeDash.trim();
  const tokens = productName.split(/\s+/);
  if (tokens.length >= 2) return tokens.slice(0, 2).join(" ");
  return tokens[0] || null;
}

/**
 * Build the progressive brand-trim candidate list. Tries "Purina Pro Plan"
 * first, then "Purina Pro", then "Purina" — so a sub-brand product still
 * matches the parent brand's record when that's the only row we have.
 */
function brandLookupCandidates(rawBrand: string): string[] {
  const full = normalizeBrandForLookup(rawBrand);
  if (!full) return [];
  const tokens = full.split(" ").filter(Boolean);
  const candidates = [full];
  if (tokens.length >= 2) candidates.push(tokens.slice(0, 2).join(" "));
  if (tokens.length >= 1) candidates.push(tokens[0]);
  const seen = new Set<string>();
  return candidates.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
}

/**
 * Apply authoritative brand data (metadata + recalls) onto the analysis in a
 * SINGLE database round-trip via the get_brand_profile RPC. Replaces the
 * pre-019 pair of helpers (applyBrandMetadata + applyBrandRecalls), each of
 * which did up to 3 progressive-trim queries — this cuts latency from up to
 * 6 round-trips to 1 per analysis.
 *
 * Overrides Claude's inferred values only when a trusted record exists:
 *   - processingMethod, testingTransparency: brand_metadata (seed always
 *     trusted; scraped rows require confidence >= 0.6 to override)
 *   - recallSeverity, recallHistory: brand_recalls aggregated by
 *     get_brand_recall_summary (always trusted — FDA-sourced)
 *
 * Also surfaces UI-only fields (testingDetails, brandCertifications,
 * countryOfManufacture, thirdPartyTested) so the client can render badges.
 * Runs BEFORE writeToCache so both the current user AND every future
 * cached-read user get the authoritative version.
 */
type BrandProfileRow = {
  matched_metadata_brand?: string | null;
  metadata_source?: string | null;
  metadata_confidence?: number | string | null;
  primary_processing?: string | null;
  testing_transparency?: string | null;
  testing_details?: string | null;
  certifications?: unknown;
  country_of_manufacture?: string | null;
  third_party_tested?: boolean | null;
  matched_recall_brand?: string | null;
  recall_count?: number | null;
  recall_severity?: string | null;
  recall_summary?: string | null;
};

async function applyBrandProfile(
  supabase: any,
  analysis: Record<string, any>,
  brandHint: string | null,
  parentSignal?: AbortSignal,
): Promise<void> {
  if (!analysis || typeof analysis !== "object" || analysis.error) return;

  const rawBrand = brandHint || extractBrandFromProductName(analysis.productName || "");
  if (!rawBrand) return;

  const candidates = brandLookupCandidates(rawBrand);
  if (candidates.length === 0) return;

  try {
    const { data, error } = await runSupabaseQuery(
      "Brand profile lookup",
      EDGE_BRAND_PROFILE_TIMEOUT_MS,
      parentSignal,
      (signal) => supabase.rpc("get_brand_profile", {
        p_candidates: candidates,
      }).abortSignal(signal),
    );
    if (error) {
      console.log("[ANALYZE] get_brand_profile error:", error.message);
      return;
    }
    const rows = data as BrandProfileRow[] | null;
    if (!rows || rows.length === 0) return;
    const row = rows[0];

    // ── Metadata overrides ───────────────────────────────────────────
    if (row.matched_metadata_brand) {
      const trusted = row.metadata_source === "seed" || Number(row.metadata_confidence ?? 0) >= 0.6;
      if (trusted) {
        if (row.primary_processing && row.primary_processing !== "unknown") {
          analysis.processingMethod = row.primary_processing;
        }
        if (row.testing_transparency && row.testing_transparency !== "unknown") {
          analysis.testingTransparency = row.testing_transparency;
        }
        if (row.testing_details) analysis.testingDetails = row.testing_details;
        if (Array.isArray(row.certifications) && row.certifications.length > 0) {
          analysis.brandCertifications = row.certifications;
        }
        if (row.country_of_manufacture) analysis.countryOfManufacture = row.country_of_manufacture;
        if (row.third_party_tested === true) analysis.thirdPartyTested = true;
        analysis.brandMetadataSource = row.metadata_source;
        console.log(
          `[ANALYZE] brand_metadata override for "${rawBrand}" (matched "${row.matched_metadata_brand}"): proc=${row.primary_processing}, testing=${row.testing_transparency}, src=${row.metadata_source}`,
        );
      }
    }

    // ── Recall overrides (always trust FDA-sourced data) ─────────────
    const recallCount = Number(row.recall_count ?? 0);
    if (row.matched_recall_brand && recallCount > 0) {
      analysis.recallSeverity = row.recall_severity;
      analysis.recallHistory = row.recall_summary;
      analysis.recallSource = "fda_verified";
      console.log(
        `[ANALYZE] brand_recalls override for "${rawBrand}" (matched "${row.matched_recall_brand}"): ${row.recall_severity}, ${recallCount} recall(s)`,
      );
    }
  } catch (e) {
    console.log("[ANALYZE] applyBrandProfile exception:", (e as Error).message);
  }
}

/**
 * Write analysis result to analysis_cache. Fire-and-forget.
 */
function normalizeCacheAliases(cacheAliases: unknown, primaryKey: string, analysis: Record<string, any>): string[] {
  if (!Array.isArray(cacheAliases)) return [];
  const petType = typeof analysis?.petType === "string" ? analysis.petType : "";
  const aliases: string[] = [];
  for (const raw of cacheAliases) {
    if (aliases.length >= 3) break;
    if (typeof raw !== "string") continue;
    const key = raw.trim();
    if (!key || key === primaryKey || key.length > 180) continue;
    if (!/^[a-z0-9 _-]+(?:__(?:dog|cat))?$/.test(key)) continue;
    const suffix = key.match(/__(dog|cat)$/)?.[1] || "";
    if (suffix && suffix !== petType) continue;
    if (!aliases.includes(key)) aliases.push(key);
  }
  return aliases;
}

async function writeToCache(
  supabase: any,
  analysis: Record<string, any>,
  mode: string,
  cacheKey: string | null,
  opffProduct: Record<string, any> | null,
  requestedLookupType: string | null = null,
  cacheAliases: unknown = null,
  parentSignal?: AbortSignal,
): Promise<void> {
  if (mode === "human_food") {
    console.log("[ANALYZE] Skipping shared cache write for human_food");
    return;
  }

  // Derive cache key for shared pet-food analyses.
  const resolvedKey = cacheKey || normalizeCacheKey(analysis.productName || "");
  if (!resolvedKey) return;

  const barcodeLikeKey = /^[0-9]{8,14}$/.test(resolvedKey);
  const lookupType = requestedLookupType === "barcode"
    ? "barcode"
    : requestedLookupType === "name"
      ? "name"
      : barcodeLikeKey
        ? "barcode"
        : "name";
  const safeProduct = mode === "verified" && opffProduct ? sanitizeOpffProduct(opffProduct) : null;
  const dataSource = mode === "verified"
    ? (typeof safeProduct?.source === "string" && safeProduct.source.trim() ? safeProduct.source.trim() : "verified")
    : "ai";
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const aliases = normalizeCacheAliases(cacheAliases, resolvedKey, analysis);
  const cacheRows = [
    {
      cache_key: resolvedKey,
      lookup_type: lookupType,
      analysis,
      data_source: dataSource,
      opff_data: mode === "verified" ? opffProduct : null,
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
    },
    ...aliases.map((aliasKey) => ({
      cache_key: aliasKey,
      lookup_type: "name",
      analysis,
      data_source: dataSource,
      opff_data: mode === "verified" ? opffProduct : null,
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
    })),
  ];

  const { error } = await runSupabaseQuery(
    "Analysis cache write",
    EDGE_CACHE_WRITE_TIMEOUT_MS,
    parentSignal,
    (signal) => supabase
      .from("analysis_cache")
      .upsert(
        cacheRows,
        { onConflict: "cache_key" },
      )
      .abortSignal(signal),
  );

  if (error) {
    console.error("[ANALYZE] Cache write failed:", error.message);
  } else {
    console.log("[ANALYZE] Cached result for:", resolvedKey, aliases.length ? `+ ${aliases.length} alias(es)` : "");
  }
}

function sanitizeIngredientListForCatalog(list: unknown[]): string[] {
  return list
    .filter((item: unknown) => typeof item === "string")
    .map((item: string) => item.trim())
    .filter((item) => {
      if (item.length < 2 || item.length > 200) return false;
      if (/[\\{}]/.test(item)) return false;
      if (/:\s*"/.test(item)) return false;
      if (/\bmailto:|https?:\/\//i.test(item)) return false;
      return (item.match(/[a-zA-Z]/g) || []).length >= 2;
    });
}

function parseIngredientTextForCatalog(ingredientText: string | null | undefined): string[] {
  if (!ingredientText || typeof ingredientText !== "string") return [];
  return sanitizeIngredientListForCatalog(ingredientText.split(","));
}

async function saveTrustedUserOcrProductData(
  supabase: any,
  analysis: Record<string, any>,
  opffProduct: Record<string, any> | null,
  cacheKey: string | null,
  parentSignal?: AbortSignal,
): Promise<void> {
  if (!opffProduct) return;
  const safeProduct = sanitizeOpffProduct(opffProduct);
  if (safeProduct.source !== "user_ocr") return;

  const productName =
    typeof safeProduct.productName === "string" && safeProduct.productName.trim()
      ? safeProduct.productName.trim()
      : typeof analysis.productName === "string"
        ? analysis.productName.trim()
        : "";
  const brand = typeof safeProduct.brand === "string" ? safeProduct.brand.trim() : "";
  const ingredientText =
    typeof safeProduct.ingredientsText === "string" ? safeProduct.ingredientsText.trim() : "";
  const ingredients = Array.isArray(safeProduct.ingredients)
    ? sanitizeIngredientListForCatalog(safeProduct.ingredients)
    : parseIngredientTextForCatalog(ingredientText);
  const resolvedKey = cacheKey || normalizeCacheKey(brand ? `${brand} ${productName}` : productName);

  if (!resolvedKey || !productName || ingredientText.length < 10 || ingredients.length < 5) {
    logAuditEvent("user_ocr_catalog_ingestion", {
      outcome: "skipped",
      reason: !resolvedKey
        ? "missing_cache_key"
        : !productName
          ? "missing_product_name"
          : ingredientText.length < 10
            ? "short_ingredient_text"
            : "few_ingredients",
      hasBrand: Boolean(brand),
      ingredientTextLength: ingredientText.length,
      ingredientCount: ingredients.length,
    });
    console.log("[ANALYZE] Skipping user OCR catalog save: insufficient trusted payload");
    return;
  }

  const { error } = await runSupabaseQuery(
    "User OCR catalog save",
    EDGE_CACHE_WRITE_TIMEOUT_MS,
    parentSignal,
    (signal) => supabase.rpc("save_product_data", {
      p_cache_key: resolvedKey,
      p_product_name: productName,
      p_brand: brand,
      p_ingredients: ingredients,
      p_ingredient_text: ingredientText,
      p_ingredient_count: ingredients.length,
      p_source: "user_ocr",
      p_image_url: typeof safeProduct.imageUrl === "string" ? safeProduct.imageUrl : null,
    }).abortSignal(signal),
  );

  if (error) {
    logAuditEvent("user_ocr_catalog_ingestion", {
      outcome: "failed",
      hasBrand: Boolean(brand),
      ingredientCount: ingredients.length,
    });
    console.error("[ANALYZE] User OCR catalog save failed:", error.message);
  } else {
    logAuditEvent("user_ocr_catalog_ingestion", {
      outcome: "saved",
      hasBrand: Boolean(brand),
      ingredientCount: ingredients.length,
    });
    console.log("[ANALYZE] Saved trusted user OCR product data:", resolvedKey);
  }
}

async function commitCompletedQuota(
  supabase: any,
  user: { id: string } | null,
  quotaProfile: { is_pro?: boolean } | null,
  mode: string,
  serverQuotaAccounting: boolean,
  parentSignal?: AbortSignal,
): Promise<number | null> {
  if (!serverQuotaAccounting || !user || !quotaProfile || quotaProfile.is_pro) {
    logAuditEvent("completed_quota_accounting", {
      outcome: "skipped",
      reason: !serverQuotaAccounting
        ? "client_opt_out"
        : !user
          ? "guest"
          : !quotaProfile
            ? "missing_profile"
            : "pro",
      mode,
    });
    return null;
  }

  const rpcName = mode === "human_food"
    ? "increment_human_food_count"
    : "increment_scan_count";

  const { data, error } = await runSupabaseQuery(
    "Completed quota commit",
    EDGE_QUOTA_COMMIT_TIMEOUT_MS,
    parentSignal,
    (signal) => supabase.rpc(rpcName, {
      p_user_id: user.id,
    }).abortSignal(signal),
  );

  if (error) {
    logAuditEvent("completed_quota_accounting", {
      outcome: "failed",
      mode,
      rpcName,
    });
    console.error("[ANALYZE] Completed quota commit failed:", error.message);
    return null;
  }

  const committedCount = typeof data === "number" ? data : null;
  logAuditEvent("completed_quota_accounting", {
    outcome: "committed",
    mode,
    rpcName,
    hasCommittedCount: committedCount !== null,
  });
  return committedCount;
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (body: Record<string, unknown>, status = 200): Response =>
    makeJsonResponse(body, status, corsHeaders || BASE_CORS_HEADERS);

  if (!corsHeaders) {
    return jsonResponse({ error: "Origin not allowed" }, 403);
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: "Request body too large" }, 413);
  }

  // ── 1. Auth (optional — guest access allowed) ──────────────────────

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let user: {
    id: string;
    email?: string | null;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  } | null = null;

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token) {
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !authUser) {
        console.error("[ANALYZE] Auth failed:", authError?.message || "No user");
        return jsonResponse({ error: "Invalid auth token" }, 401);
      }
      user = authUser;
    }
  }

  // ── 2. Parse request body ─────────────────────────────────────────

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  let {
    mode,
    imageBase64,
    opffProduct,
    stream = true,
    cacheKey = null,
    cacheAliases = null,
    lookupType = null,
    petType = null,
    serverQuotaAccounting = false,
    clientProStatus = false,
  } = body;

  const requestedLookupType =
    lookupType === "barcode" || lookupType === "name" ? lookupType : null;

  if (!mode || !ANALYZE_MODES.has(mode)) {
    return jsonResponse(
      { error: 'Invalid mode. Expected "photo", "verified", "human_food", "identify", or "ingredients_lookup".' },
      400,
    );
  }

  const isHelperMode = HELPER_MODES.has(mode);
  let quotaProfileForAccounting: { is_pro?: boolean } | null = null;

  // ── 3. Rate limiting + scan count enforcement ───────────────────

  if (user) {
    // Authenticated primary scans and authenticated helper calls use separate
    // buckets so helper OCR/lookup calls cannot consume the main scan bucket or
    // create an unbounded signed-in AI-spend path.
    const { data: allowed, error: rlError } = await runSupabaseQuery(
      "Authenticated rate limit check",
      EDGE_DB_TIMEOUT_MS,
      req.signal,
      (signal) => (
        isHelperMode
          ? supabase.rpc("check_ip_rate_limit", {
              p_ip_address: `user-helper:${user.id}`,
              p_max_requests: AUTH_HELPER_RATE_LIMIT_PER_HOUR,
              p_window_minutes: 60,
            })
          : supabase.rpc("check_rate_limit", {
              p_user_id: user.id,
              p_max_requests: AUTH_PRIMARY_RATE_LIMIT_PER_HOUR,
              p_window_minutes: 60,
            })
      ).abortSignal(signal),
    );

    if (rlError) {
      console.error("[ANALYZE] Rate limit check failed:", rlError.message);
      return jsonResponse({ error: "Rate limit unavailable. Please try again." }, 503);
    } else if (allowed === false) {
      return jsonResponse(
        {
          error: isHelperMode
            ? "Too many analysis helper requests. Please wait and try again."
            : "Rate limit exceeded. Max 20 scans per hour.",
        },
        429,
      );
    }
  }

  // Anonymous IP rate limiting protects all public modes, including helpers.
  if (!user) {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (clientIp === "unknown") {
      return jsonResponse({ error: "Unable to verify request origin" }, 403);
    }

    const { data: allowed, error: rlError } = await runSupabaseQuery(
      "Anonymous rate limit check",
      EDGE_DB_TIMEOUT_MS,
      req.signal,
      (signal) => supabase.rpc(
        "check_ip_rate_limit",
        { p_ip_address: clientIp, p_max_requests: 15, p_window_minutes: 60 },
      ).abortSignal(signal),
    );

    if (rlError) {
      console.error("[ANALYZE] IP rate limit check failed:", rlError.message);
      return jsonResponse({ error: "Rate limit unavailable. Please try again." }, 503);
    } else if (allowed === false) {
      console.log("[ANALYZE] IP rate limited:", clientIp);
      return jsonResponse(
        { error: "Rate limit exceeded. Please sign in for more scans." },
        429,
      );
    }
  }

  // Server-side quota for free users — split by feature so they can't be tricked.
  //   • Pet-food scan modes (photo/verified/barcode): 3 LIFETIME free scans
  //   • Human-food check (text or photo): 1 PER UTC DAY (atomic RPC handles reset)
  // Helper modes bypass quota because they are sub-calls, but they are still
  // separately rate-limited above for authenticated users and by IP for guests.
  if (user && !isHelperMode) {
    try {
      const { data: profile, error: profileError } = await runSupabaseQuery(
        "Profile quota lookup",
        EDGE_DB_TIMEOUT_MS,
        req.signal,
        (signal) => supabase
          .from("profiles")
          .select("is_pro, scan_count, pro_expires_at")
          .eq("id", user.id)
          .abortSignal(signal)
          .maybeSingle(),
      );

      if (profileError) {
        console.error("[ANALYZE] Profile lookup failed:", profileError.message);
        return jsonResponse({ error: "Quota check unavailable. Please try again." }, 503);
      }

      let quotaProfile = profile;
      if (!quotaProfile) {
        console.error("[ANALYZE] Missing profile row; repairing:", user.id);
        const displayName =
          (user.user_metadata?.full_name as string | undefined) ||
          (user.user_metadata?.name as string | undefined) ||
          user.email?.split("@")[0] ||
          null;

        const { data: repairedProfile, error: repairError } = await runSupabaseQuery(
          "Profile repair",
          EDGE_DB_TIMEOUT_MS,
          req.signal,
          (signal) => supabase
            .from("profiles")
            .upsert(
              {
                id: user.id,
                display_name: displayName,
                avatar_url: (user.user_metadata?.avatar_url as string | undefined) || null,
                email: user.email || null,
                provider: (user.app_metadata?.provider as string | undefined) || null,
              },
              { onConflict: "id" },
            )
            .select("is_pro, scan_count, pro_expires_at")
            .abortSignal(signal)
            .single(),
        );

        if (repairError || !repairedProfile) {
          console.error("[ANALYZE] Profile repair failed:", repairError?.message || "No profile");
          return jsonResponse({ error: "Account setup unavailable. Please try again." }, 503);
        }

        quotaProfile = repairedProfile;
      }

      if (!quotaProfile.is_pro && isStoredProExpirationActive(quotaProfile)) {
        const { error: expiryRepairError } = await runSupabaseQuery(
          "Profile entitlement expiry repair",
          EDGE_DB_TIMEOUT_MS,
          req.signal,
          (signal) => supabase
            .from("profiles")
            .update({
              is_pro: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", user.id)
            .abortSignal(signal),
        );

        logAuditEvent("profile_entitlement_expiry_repair", {
          outcome: expiryRepairError ? "update_failed" : "repaired",
        });
        if (expiryRepairError) {
          console.error("[ANALYZE] Profile entitlement expiry repair failed:", expiryRepairError.message);
        }
        quotaProfile = { ...quotaProfile, is_pro: true };
      }

      if (!quotaProfile.is_pro && clientProStatus === true) {
        const recovered = await recoverProEntitlementFromRevenueCat(supabase, user.id, req.signal);
        if (recovered.active) {
          quotaProfile = { ...quotaProfile, is_pro: true };
        } else if (!recovered.checked) {
          return subscriptionSyncUnavailableResponse(corsHeaders);
        }
      }

      quotaProfileForAccounting = quotaProfile;

      if (!quotaProfile.is_pro) {
        if (mode === "human_food") {
          // Read-only check — actual atomic increment happens after a successful Claude response
          // through commitCompletedQuota() below (so failed checks don't burn quota).
          const { data: usedToday, error: hfErr } = await runSupabaseQuery(
            "Human food quota lookup",
            EDGE_DB_TIMEOUT_MS,
            req.signal,
            (signal) => supabase.rpc(
              "get_human_food_count_today",
              { p_user_id: user.id },
            ).abortSignal(signal),
          );
          if (hfErr) {
            console.error("[ANALYZE] Human food quota check failed:", hfErr.message);
          } else if ((usedToday || 0) >= 1) {
            const recovered = await recoverProEntitlementFromRevenueCat(supabase, user.id, req.signal);
            if (recovered.active) {
              quotaProfile = { ...quotaProfile, is_pro: true };
              quotaProfileForAccounting = quotaProfile;
            } else if (!recovered.checked) {
              return subscriptionSyncUnavailableResponse(corsHeaders);
            } else {
              return jsonResponse(
                { error: "You've used your daily free safety check. Upgrade to Pro for unlimited checks." },
                403,
              );
            }
          }
        } else {
          // Pet food scan: 3 lifetime
          if ((quotaProfile.scan_count || 0) >= 3) {
            const recovered = await recoverProEntitlementFromRevenueCat(supabase, user.id, req.signal);
            if (recovered.active) {
              quotaProfile = { ...quotaProfile, is_pro: true };
              quotaProfileForAccounting = quotaProfile;
            } else if (!recovered.checked) {
              return subscriptionSyncUnavailableResponse(corsHeaders);
            } else {
              return jsonResponse(
                { error: "Free scan limit reached. Upgrade to Pro for unlimited scans." },
                403,
              );
            }
          }
        }
      }
      // New clients set serverQuotaAccounting=true, so the Edge Function commits
      // quota only after a schema-valid result. Old clients omit the flag and
      // keep their post-result client RPC path, avoiding double-counting during rollout.
    } catch (e) {
      console.error("[ANALYZE] Scan limit check failed:", (e as Error).message);
      return jsonResponse({ error: "Quota check unavailable. Please try again." }, 503);
    }
  }

  // Anonymous human_food gets a stricter IP cap on top of the general one (already applied above).
  // Effectively rate-limits guest abuse before they sign up.
  if (!user && mode === "human_food") {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (clientIp === "unknown") {
      return jsonResponse({ error: "Unable to verify request origin" }, 403);
    }

    const { data: allowed, error: hfRateError } = await runSupabaseQuery(
      "Guest human-food rate limit check",
      EDGE_DB_TIMEOUT_MS,
      req.signal,
      (signal) => supabase.rpc("check_ip_rate_limit", {
        p_ip_address: `hf:${clientIp}`,
        p_max_requests: 1,
        p_window_minutes: 24 * 60,
      }).abortSignal(signal),
    );
    if (hfRateError) {
      console.error("[ANALYZE] Human-food IP rate limit failed:", hfRateError.message);
      return jsonResponse({ error: "Rate limit unavailable. Please try again." }, 503);
    }
    if (allowed === false) {
      return jsonResponse(
        { error: "Guest free safety check used. Try again later, sign in, or upgrade for more." },
        429,
      );
    }
  }

  // Force non-streaming for identify mode (fast, lightweight call)
  if (mode === "identify") {
    stream = false;
  }

  // ── 4. Build Claude messages (with input validation) ────────────

  let systemPrompt = "";
  const userContent: Array<Record<string, any>> = [];

  if (mode === "photo") {
    systemPrompt = PHOTO_SYSTEM_PROMPT;

    if (!imageBase64) {
      return jsonResponse(
        { error: "imageBase64 is required for photo mode" },
        400,
      );
    }

    // Validate base64 image size (max ~5MB decoded)
    if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_B64_LENGTH) {
      return jsonResponse(
        { error: "Image too large. Please use a smaller image." },
        413,
      );
    }

    userContent.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
    });
    userContent.push({
      type: "text",
      text: "Analyze this pet food product. Set productName to the EXACT text printed on the packaging (brand + sub-brand + variant + flavor). Output JSON only.",
    });
  } else if (mode === "verified") {
    systemPrompt = VERIFIED_DATA_PROMPT;

    if (!opffProduct || typeof opffProduct !== "object") {
      return jsonResponse(
        { error: "opffProduct is required for verified mode" },
        400,
      );
    }

    // Sanitize opffProduct before use
    const safeProduct = sanitizeOpffProduct(opffProduct);

    if (imageBase64) {
      // Validate image size in verified mode too
      if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_B64_LENGTH) {
        return jsonResponse(
          { error: "Image too large. Please use a smaller image." },
          413,
        );
      }

      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: imageBase64,
        },
      });
    }

    // Count ingredients in the source so we can tell Claude exactly how many entries it must produce.
    const ingCount = safeProduct.ingredientsText
      ? safeProduct.ingredientsText.split(/[,;](?![^()]*\))/).filter((s: string) => s.trim().length > 1).length
      : 0;

    userContent.push({
      type: "text",
      text:
        `Here is source-labeled ingredient data. Analyze and rate this product using ONLY this provided data, and do not describe listing, scraped, or user-OCR data as verified unless Ingredient Source Trust is authoritative:\n\n${buildVerifiedDataText(safeProduct)}` +
        (ingCount > 0
          ? `\n\nThe ingredient list above contains EXACTLY ${ingCount} ingredients. Your "ingredients" array MUST contain ${ingCount} entries — one for each, in the exact same order, including every vitamin, mineral, supplement, and additive. Do NOT skip middle items.`
          : ""),
    });
  } else if (mode === "human_food") {
    systemPrompt = HUMAN_FOOD_PROMPT;

    if (!petType || (petType !== "dog" && petType !== "cat")) {
      return jsonResponse(
        { error: 'petType ("dog" or "cat") is required for human_food mode' },
        400,
      );
    }

    // Two entry modes: photo OR text. At least one is required.
    const foodNameInput = typeof body.foodName === "string" ? body.foodName.trim() : "";
    if (!imageBase64 && !foodNameInput) {
      return jsonResponse(
        { error: "Either imageBase64 or foodName is required for human_food mode" },
        400,
      );
    }

    if (imageBase64) {
      if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_B64_LENGTH) {
        return jsonResponse(
          { error: "Image too large. Please use a smaller image." },
          413,
        );
      }
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
      });
      userContent.push({
        type: "text",
        text: `Identify this human food and assess whether it is safe for a ${petType} to eat.`,
      });
    } else {
      // Text-only path — clamp to prevent abuse of the model for unrelated prompts.
      if (foodNameInput.length > 200) {
        return jsonResponse({ error: "foodName too long (max 200 chars)." }, 400);
      }
      userContent.push({
        type: "text",
        text: `Assess whether "${foodNameInput.replace(/"/g, '\\"')}" is safe for a ${petType} to eat. Treat this as the food the user is asking about. Use the same schema as if you had been shown a photo — set confidence to 0.9 unless the name is genuinely ambiguous (e.g. "berries" without specifying which kind).`,
      });
    }
  } else if (mode === "identify") {
    systemPrompt = IDENTIFY_PROMPT;

    if (!imageBase64) {
      return jsonResponse(
        { error: "imageBase64 is required for identify mode" },
        400,
      );
    }
    if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_B64_LENGTH) {
      return jsonResponse(
        { error: "Image too large. Please use a smaller image." },
        413,
      );
    }

    userContent.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
    });
    userContent.push({
      type: "text",
      text: "List every word of text visible on this packaging. What does the brand name say? What does the product name say? What does the flavor/recipe say? Return JSON only — do NOT guess or substitute brand names.",
    });
  } else if (mode === "ocr_ingredients") {
    systemPrompt = OCR_INGREDIENTS_PROMPT;
    stream = false;

    if (!imageBase64) {
      return jsonResponse({ error: "imageBase64 is required for ocr_ingredients mode" }, 400);
    }
    if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_B64_LENGTH) {
      return jsonResponse({ error: "Image too large." }, 413);
    }

    userContent.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
    });
    const rawProductNameHint = typeof body.productName === "string" ? body.productName.trim() : "";
    if (rawProductNameHint.length > MAX_PRODUCT_LOOKUP_NAME_LENGTH) {
      return jsonResponse({ error: "productName too long (max 200 chars)." }, 400);
    }
    const productNameHint = rawProductNameHint ? ` for "${rawProductNameHint.replace(/"/g, '\\"')}"` : "";
    userContent.push({
      type: "text",
      text: `Read the complete ingredient list${productNameHint} from this label photo. Transcribe every ingredient exactly as printed. Return JSON only.`,
    });
  }

  // ── 4.5. Pre-call cache check (skip Claude if we already have a result) ──

  if (mode !== "identify" && mode !== "ocr_ingredients") {
    let preCacheKey: string | null = null;

    if (mode === "human_food" && petType) {
      // Can't check human food cache pre-call — we don't know the foodName yet
      // (It comes from Claude's response, not the request)
    } else if (cacheKey) {
      // New clients send lookupType. Older clients fall back to a barcode-shaped key heuristic.
      preCacheKey = cacheKey;
    } else if (mode === "verified" && opffProduct?.productName) {
      preCacheKey = normalizeCacheKey(opffProduct.productName);
    }

    if (preCacheKey) {
      try {
        const { data: cached } = await runSupabaseQuery(
          "Pre-call cache lookup",
          EDGE_CACHE_READ_TIMEOUT_MS,
          req.signal,
          (signal) => supabase
            .from("analysis_cache")
            .select("analysis, data_source, opff_data")
            .eq("cache_key", preCacheKey)
            .gt("expires_at", new Date().toISOString())
            .abortSignal(signal)
            .maybeSingle(),
        );

        // Stale-rubric guard: entries without schemaVersion, or with a version
        // older than the current one, were scored under a previous rubric and
        // must NOT be served. They'll be overwritten by the fresh Claude call
        // below via writeToCache → upsert (onConflict: cache_key).
        const cachedVersion = Number(cached?.analysis?.schemaVersion || 0);
        const cachedSchemaValid = mode === "human_food"
          ? isValidHumanFoodAnalysis(cached?.analysis)
          : isValidAnalysis(cached?.analysis);
        if (cached?.analysis && cachedVersion >= ANALYSIS_SCHEMA_VERSION && cachedSchemaValid) {
          console.log("[ANALYZE] Pre-call cache HIT:", preCacheKey, "(v" + cachedVersion + ")");
          await commitCompletedQuota(
            supabase,
            user,
            quotaProfileForAccounting,
            mode,
            serverQuotaAccounting === true,
            req.signal,
          );
          return jsonResponse(
            { content: [{ type: "text", text: JSON.stringify(cached.analysis) }] },
          );
        } else if (cached?.analysis && cachedVersion >= ANALYSIS_SCHEMA_VERSION) {
          console.log("[ANALYZE] Pre-call cache malformed, re-scoring:", preCacheKey, petFoodAnalysisValidationError(cached.analysis));
        } else if (cached?.analysis) {
          console.log("[ANALYZE] Pre-call cache STALE, re-scoring:", preCacheKey, "(v" + cachedVersion + ")");
        }
      } catch (e) {
        console.log("[ANALYZE] Pre-call cache check error:", (e as Error).message);
        // Non-blocking: proceed to Claude API
      }
    }
  }

  // ── 5. Call Claude API (with timeout) ──────────────────────────

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    console.error("[ANALYZE] ANTHROPIC_API_KEY not set");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  // ── 5a. IDENTIFY mode: use GPT-4o-mini (better OCR) ────────────
  if (mode === "identify") {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("[ANALYZE] OPENAI_API_KEY not set, falling back to Claude for identify");
    } else {
      const identifyRequest = startLinkedTimedRequest("GPT identify", 15000, req.signal);

      try {
        // Build the image content for GPT-4o-mini
        const imageB64 = userContent.find((c: any) => c.type === "image")?.source?.data;
        const textPrompt = userContent.find((c: any) => c.type === "text")?.text || "";

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            max_tokens: 512,
            temperature: 0,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${imageB64}`, detail: "high" },
                  },
                  { type: "text", text: textPrompt },
                ],
              },
            ],
          }),
          signal: identifyRequest.signal,
        });

        if (gptResponse.ok) {
          const gptData = await gptResponse.json();
          const gptContent = gptData.choices?.[0]?.message?.content;

          if (gptContent) {
            console.log("[ANALYZE] GPT-4o-mini identify response:", gptContent.slice(0, 200));

            // Parse and return in Claude-compatible format
            let parsed = cleanAndParse(gptContent);
            if (!parsed && gptContent.includes("{")) {
              // Try extracting JSON from within text
              const jsonMatch = gptContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) parsed = cleanAndParse(jsonMatch[0]);
            }

            if (parsed?.productName || parsed?.identified) {
              return jsonResponse({
                content: [{ type: "text", text: JSON.stringify(parsed) }],
              });
            }
          }
        } else {
          const errText = await gptResponse.text().catch(() => "");
          console.error(`[ANALYZE] GPT-4o-mini error ${gptResponse.status}:`, errText.slice(0, 300));
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (req.signal.aborted && !identifyRequest.didTimeout()) {
            return jsonResponse({ error: "Request cancelled." }, 499);
          }
          if (identifyRequest.didTimeout()) {
            return jsonResponse({ error: "Identification timed out. Please try again." }, 504);
          }
        }
        console.error("[ANALYZE] GPT-4o-mini failed:", (err as Error).message);
      } finally {
        identifyRequest.cleanup();
      }

      // If GPT failed, fall through to Claude below
      console.log("[ANALYZE] GPT-4o-mini failed, falling back to Claude for identify");
    }
  }

  // ── 5a2. INGREDIENTS_LOOKUP mode: use GPT-4o-mini to look up ingredients ──
  if (mode === "ingredients_lookup") {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const productNameForLookup = typeof body.productName === "string" ? body.productName.trim() : "";

    if (!openaiKey || !productNameForLookup) {
      return jsonResponse({ found: false, reason: "missing_config" });
    }
    if (productNameForLookup.length > MAX_PRODUCT_LOOKUP_NAME_LENGTH) {
      return jsonResponse({ error: "productName too long (max 200 chars)." }, 400);
    }

    const ingredientsLookupRequest = startLinkedTimedRequest("GPT ingredients lookup", 10000, req.signal);
    try {
      const gptResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 800,
          messages: [
            {
              role: "system",
              content: `You are a pet food ingredient database. When given a pet food product name, return the COMPLETE ingredient list exactly as it appears on the product label. Return ONLY a JSON object with this format:
{"found": true, "ingredients": "Deboned Chicken, Chicken Meal, Brown Rice, ...", "confidence": 0.95}
If you are not confident about the exact ingredients for this SPECIFIC product variant, return:
{"found": false, "reason": "unknown product"}
IMPORTANT: Be precise about the exact variant. "Blue Buffalo Life Protection Chicken" has different ingredients from "Blue Buffalo Wilderness Salmon". Return ingredients ONLY for the exact product asked.`,
            },
            { role: "user", content: productNameForLookup },
          ],
        }),
        signal: ingredientsLookupRequest.signal,
      });

      if (gptResp.ok) {
        const gptData = await gptResp.json();
        const gptContent = gptData.choices?.[0]?.message?.content;
        if (gptContent) {
          const parsed = cleanAndParse(gptContent);
          if (parsed?.found && parsed?.ingredients) {
            console.log(`[ANALYZE] GPT ingredients lookup: found ${typeof parsed.ingredients === 'string' ? parsed.ingredients.split(',').length : 0} ingredients`);
            return jsonResponse({
              content: [{ type: "text", text: JSON.stringify(parsed) }],
            });
          }
          // Return the not-found response
          return jsonResponse({
            content: [{ type: "text", text: JSON.stringify(parsed || { found: false }) }],
          });
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        if (req.signal.aborted && !ingredientsLookupRequest.didTimeout()) {
          return jsonResponse({ error: "Request cancelled." }, 499);
        }
        if (ingredientsLookupRequest.didTimeout()) {
          return jsonResponse({ content: [{ type: "text", text: '{"found": false, "reason": "lookup timeout"}' }] });
        }
      }
      console.error("[ANALYZE] GPT ingredients lookup failed:", (err as Error).message);
    } finally {
      ingredientsLookupRequest.cleanup();
    }

    return jsonResponse({ content: [{ type: "text", text: '{"found": false}' }] });
  }

  // ── 5b. All other modes (and identify fallback): use Claude ──────
  const claudeRequest = startLinkedTimedRequest("Claude analysis", CLAUDE_TIMEOUT_MS, req.signal);

  let claudeResponse: Response;
  try {
    claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        // Prompt caching is enabled by default for Sonnet/Haiku 4.5 — the
        // system block below uses cache_control so the 3KB prompt costs
        // only on the first call within a 5-minute window.
      },
      body: JSON.stringify({
        // Model selection by mode — Haiku is 4-5x faster than Sonnet and accurate
        // enough for the mechanical tasks (reading text, scoring known ingredients).
        // Sonnet retained for the photo-only path where vision judgment matters more
        // and for human_food where mis-identifying chocolate vs. blueberries is high-stakes.
        model:
          mode === "identify"        ? "claude-haiku-4-5-20251001" :   // text OCR off a bag
          mode === "ocr_ingredients" ? "claude-haiku-4-5-20251001" :   // text OCR off a label
          mode === "verified"        ? "claude-haiku-4-5-20251001" :   // scoring a known ingredient list
          mode === "human_food"      ? "claude-sonnet-4-5-20250929" :  // safety-critical
          /* photo */                  "claude-sonnet-4-5-20250929",   // vision + scoring
        max_tokens:
          mode === "identify" ? 512 :
          mode === "ocr_ingredients" ? 2048 :
          mode === "human_food" ? 4096 :
          mode === "verified" ? 16000 : // slimmed schema fits in 16k easily even for 60-ingredient lists
          16384,
        stream,
        // Use the structured system block format so we can attach cache_control —
        // the system prompt is the same across millions of calls so caching it
        // saves ~80% of input-token cost AND ~200-400ms of latency on cache hits.
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: mode === "identify"
          ? [
              { role: "user", content: userContent },
              { role: "assistant", content: '{"identified":true,"textReadFromPackage":["' },
            ]
          : [{ role: "user", content: userContent }],
        // Deterministic for any mode where the input fully specifies the output.
        // identify: reading text — deterministic.
        // verified: scoring a known ingredient list — must be consistent across users.
        // ocr_ingredients: transcribing text — deterministic.
        // Photo and human_food still get a tiny bit of variation since they involve
        // judgment calls on ambiguous images.
        temperature:
          mode === "identify" || mode === "verified" || mode === "ocr_ingredients" ? 0 : 0.2,
      }),
      signal: claudeRequest.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      if (req.signal.aborted && !claudeRequest.didTimeout()) {
        claudeRequest.cleanup();
        return jsonResponse({ error: "Request cancelled." }, 499);
      }
      claudeRequest.cleanup();
      return jsonResponse({ error: "Analysis timed out. Please try again." }, 504);
    }
    console.error("[ANALYZE] Claude fetch error:", err);
    claudeRequest.cleanup();
    return jsonResponse({ error: "Failed to reach analysis service" }, 502);
  }

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text().catch(() => "");
    claudeRequest.cleanup();
    console.error(
      `[ANALYZE] Claude API ${claudeResponse.status}:`,
      errText.slice(0, 500),
    );
    return jsonResponse(
      { error: `Analysis service error (${claudeResponse.status})` },
      claudeResponse.status >= 500 ? 502 : claudeResponse.status,
    );
  }

  // ── 6. Return response + write to cache ────────────────────────────

  if (stream) {
    // Tee the stream: one branch goes to client, the other accumulates for caching
    const [clientStream, cacheStream] = claudeResponse.body!.tee();
    const clientReader = clientStream.getReader();
    const abortableClientStream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await clientReader.read();
          if (done) {
            controller.close();
            claudeRequest.cleanup();
            return;
          }
          controller.enqueue(value);
        } catch (err) {
          controller.error(err);
          claudeRequest.cleanup();
        }
      },
      async cancel() {
        claudeRequest.abort();
        await clientReader.cancel().catch(() => {});
        claudeRequest.cleanup();
      },
    });

    // Background: read cacheStream, accumulate SSE text, parse, and write to cache (with timeout)
    runBackgroundTask("Stream cache/quota persistence", (async () => {
      const reader = cacheStream.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      const cacheTimeout = setTimeout(() => {
        reader.cancel().catch(() => {});
      }, STREAM_CACHE_TIMEOUT_MS);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
        }
        // Final flush
        accumulated += decoder.decode();
        // Extract text content from SSE events
        const text = extractTextFromSSE(accumulated);
        if (text) {
          let analysis = cleanAndParse(text);
          if (analysis && mode === "human_food" && petType) {
            analysis.petType = petType;
          }
          // Server-side guards: fix score drift + bogus variety-pack flags before cache.
          if (analysis && mode !== "human_food" && mode !== "identify" && mode !== "ocr_ingredients") {
            analysis = normalizeAnalysis(analysis, opffProduct);
            // Single-round-trip brand-level overrides (metadata + recalls).
            // Runs before cache write so every future user also sees the
            // authoritative version, not Claude's inferred one.
            const brandHint = opffProduct?.brand || null;
            await applyBrandProfile(supabase, analysis as Record<string, any>, brandHint);
          }
          const isValid = mode === "human_food"
            ? isValidHumanFoodAnalysis(analysis)
            : isValidAnalysis(analysis);
          if (
            analysis &&
            mode !== "human_food" &&
            mode !== "identify" &&
            mode !== "ocr_ingredients" &&
            !isValid
          ) {
            console.log("[ANALYZE] Stream pet-food schema reject:", petFoodAnalysisValidationError(analysis));
          }
          if (isValid) {
            await commitCompletedQuota(
              supabase,
              user,
              quotaProfileForAccounting,
              mode,
              serverQuotaAccounting === true,
            );
            if (mode === "verified") {
              await saveTrustedUserOcrProductData(supabase, analysis!, opffProduct, cacheKey);
            }
            await writeToCache(supabase, analysis!, mode, cacheKey, opffProduct, requestedLookupType, cacheAliases);
          }
        }
      } catch (err) {
        console.error("[ANALYZE] Stream cache error:", (err as Error).message);
      } finally {
        clearTimeout(cacheTimeout);
        claudeRequest.cleanup();
      }
    })());

    return new Response(abortableClientStream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  // Non-streaming: parse response, cache, then return to client
  const data = await claudeResponse.json().finally(() => claudeRequest.cleanup());
  let content = data.content?.[0]?.text;

  // For identify mode with prefill, prepend the assistant prefill to reconstruct complete JSON
  if (mode === "identify" && content && !content.trimStart().startsWith("{")) {
    content = '{"identified":true,"textReadFromPackage":["' + content;
  }

  if (content) {
    let analysis = cleanAndParse(content);
    if (analysis && mode === "human_food" && petType) {
      analysis.petType = petType;
      if (data.content?.[0]) {
        data.content[0].text = JSON.stringify(analysis);
      }
    }
    if (analysis && mode !== "human_food" && mode !== "identify" && mode !== "ocr_ingredients") {
      analysis = normalizeAnalysis(analysis, opffProduct);
      // Single-round-trip brand-level overrides (metadata + recalls).
      // Awaited (not fire-and-forget) because the non-stream path must include
      // the overrides in the response to the client, not just in the cached row.
      const brandHint = opffProduct?.brand || null;
      await applyBrandProfile(supabase, analysis as Record<string, any>, brandHint, req.signal);
      // Re-serialize so the client receives the corrected score + authoritative
      // recall data, not Claude's raw output.
      if (data.content?.[0] && analysis) {
        data.content[0].text = JSON.stringify(analysis);
      }
    }
    const isValid = mode === "human_food"
      ? isValidHumanFoodAnalysis(analysis)
      : isValidAnalysis(analysis);
    if (mode === "human_food" && !isValid) {
      return jsonResponse({ error: "Incomplete human-food safety response. Please try again." }, 502);
    }
    if (
      analysis &&
      mode !== "human_food" &&
      mode !== "identify" &&
      mode !== "ocr_ingredients" &&
      !isValid
    ) {
      const reason = petFoodAnalysisValidationError(analysis);
      console.log("[ANALYZE] Non-stream pet-food schema reject:", reason);
      return jsonResponse({ error: "Incomplete pet-food analysis response. Please try again." }, 502);
    }
    if (isValid) {
      await commitCompletedQuota(
        supabase,
        user,
        quotaProfileForAccounting,
        mode,
        serverQuotaAccounting === true,
        req.signal,
      );
      if (mode === "verified") {
        // Catalog growth is valuable, but the completed score should not wait
        // on a best-effort product_data write in the non-stream response path.
        runBackgroundTask(
          "Non-stream user OCR catalog save",
          saveTrustedUserOcrProductData(supabase, analysis!, opffProduct, cacheKey),
        );
      }
      // Fire-and-forget cache write — don't delay the response
      runBackgroundTask(
        "Non-stream cache write",
        writeToCache(supabase, analysis!, mode, cacheKey, opffProduct, requestedLookupType, cacheAliases),
      );
    }
  }

  // For identify mode, return the reconstructed content with prefill
  if (mode === "identify" && content && data.content?.[0]) {
    data.content[0].text = content;
  }

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
