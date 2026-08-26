import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_BROWSER_ORIGINS = new Set([
  "http://localhost:19006",
  "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://127.0.0.1:19006",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8082",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Expose-Headers":
    "X-Woof-Function-Name, X-Woof-Function-Audit-Version",
  "Vary": "Origin",
};

const FUNCTION_NAME = "analyze";
const FUNCTION_AUDIT_VERSION = "2026-08-26-edge-eric-nutrient-balance-v2";
const NUTRITION_SCORING_VERSION = "2026-08-26-eric-v2";
const DEPLOYMENT_HEADERS = {
  "X-Woof-Function-Name": FUNCTION_NAME,
  "X-Woof-Function-Audit-Version": FUNCTION_AUDIT_VERSION,
};

// ── Constants ────────────────────────────────────────────────────────

// Keep this aligned with ScannerScreen's MAX_CLIENT_IMAGE_BASE64_LENGTH.
// Lowering the Edge cap prevents older clients from forwarding oversized
// image payloads to Claude, which directly increases Supabase egress.
const MAX_IMAGE_B64_LENGTH = 2_400_000; // ~1.8 MB decoded
const MAX_FIELD_LENGTH = 10_000;
// Stay well below Supabase's 150-second free-tier request ceiling. A bounded
// failure lets scan usage reverse cleanly instead of ending as a platform 503.
const CLAUDE_TIMEOUT_MS = 45_000;
const STREAM_CACHE_TIMEOUT_MS = 50_000;

const OPFF_ALLOWED_FIELDS = new Set([
  "productName", "brand", "petType", "lifeStage", "foodForm", "ingredientsText",
  "nutriments", "nutriscoreGrade", "novaGroup", "barcode",
  "ingredients", "imageUrl", "source", "sourceUrl", "sourceQuality",
  "ingredientVerificationStatus", "imageVerificationStatus", "verifiedAt",
  "hasPublishedNutrients", "nutritionalInfo", "nutrientPanel", "analysisType", "basis",
]);
const VERIFIED_INGREDIENT_STATUSES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
]);

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function configuredAllowedOrigins(): Set<string> {
  const configured = Deno.env.get("WOOF_ALLOWED_ORIGINS") || "";
  const origins = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_BROWSER_ORIGINS, ...origins]);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (!origin) {
    return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS, "Access-Control-Allow-Origin": "*" };
  }

  if (configuredAllowedOrigins().has(origin)) {
    return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS, "Access-Control-Allow-Origin": origin };
  }

  return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS };
}

// ── System prompts (server-side only — never sent to client) ─────────

const PHOTO_SYSTEM_PROMPT = `You are a pet food expert. Analyze the pet food product in this photo.

CRITICAL RULES:
- Identify the brand and product name from the packaging.
- ACCURACY IS PARAMOUNT. Never guess or fabricate ingredients. Only list ingredients you are confident are in this specific product.
- NEVER inflate scores to make products seem better than they are. Accuracy over optimism.
- If uncertain about any data point, say so in your assessment rather than guessing.
- If an ingredient label is visible, transcribe every ingredient you can read from the label.
- If no label is visible, use your knowledge of this EXACT product. Do NOT confuse it with other products from the same brand. If unsure about specific ingredients, say so in the summary rather than guessing wrong.
- List the COMPLETE ingredient list. Pet foods have 15-40 ingredients including vitamins, minerals, and supplements.
- Include nutritional breakdown and safety info.
- Do NOT invent customer reviews, customer ratings, recall alerts, or recall history. Only include facts supported by the visible label or provided product database data.

CRITICAL OUTPUT FORMAT REQUIREMENT:
- Return ONLY pure JSON - NO markdown code fences
- Start your response with an opening brace immediately
- End with a closing brace
- Do NOT wrap JSON in backtick code blocks
- Your FIRST character must be an opening brace

Use this exact format:
{
  "productName": "Brand - Product Name",
  "petType": "dog" | "cat" | "unknown",
  "overallScore": 1-100,
  "summary": "2-3 sentence overall assessment",
  "categories": [
    { "name": "Protein Quality", "score": 1-100, "detail": "brief assessment" },
    { "name": "Ingredient Safety", "score": 1-100, "detail": "brief assessment" },
    { "name": "Nutritional Balance", "score": 1-100, "detail": "brief assessment" },
    { "name": "Low-Nutrient Binders", "score": 1-100, "detail": "higher is better (less reliance on low-nutrient binders)" },
    { "name": "Additives & Preservatives", "score": 1-100, "detail": "higher is better (fewer harmful additives)" }
  ],
  "nutritionAnalysis": {
    "proteinLevel": "high" | "moderate" | "low",
    "proteinPercent": "e.g. 26%",
    "fatLevel": "high" | "moderate" | "low",
    "fatPercent": "e.g. 15%",
    "fiberPercent": "e.g. 4%",
    "moisturePercent": "e.g. 10% or N/A",
    "calciumDryMatterPercent": "source-backed dry-matter value or N/A",
    "phosphorusDryMatterPercent": "source-backed dry-matter value or N/A",
    "calciumPhosphorusRatio": "source-backed ratio such as 1.20:1 or N/A",
    "analysisTypeLabel": "Typical Analysis | Guaranteed Analysis | Nutrient Analysis",
    "analysisBasisLabel": "Dry matter | As fed | Basis not stated",
    "primaryProteinSource": "e.g. Deboned Chicken",
    "grainFree": true | false,
    "lifestage": "e.g. All Life Stages",
    "caloriesPerCup": "e.g. 380 kcal"
  },
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2"],
  "ingredients": [
    { "name": "ingredient", "category": "protein|carb|fat|fiber|vitamin|mineral|preservative|other", "rating": "good|bad|neutral", "reason": "1-2 sentences explaining this quality rating", "description": "1-2 sentences explaining what this ingredient is in plain english", "alternatives": ["better alt 1", "better alt 2"] }
  ],
  "verdict": "2-3 sentence recommendation."
}

CRITICAL: List EVERY ingredient — do NOT abbreviate or summarize. A typical pet food has 15-30+ ingredients including vitamins and minerals. If you only list 4-5 ingredients, you are doing it wrong. Include every vitamin, mineral, supplement, and additive.

For each ingredient: "description" explains what it is. "reason" explains the quality rating. "alternatives" is an array of 2-3 better alternatives ONLY for neutral or bad ingredients (omit or set null for good ingredients).

SCORING RUBRIC (be strict and evidence-based):

Overall Score = weighted average of 5 categories:
- Protein Quality (20%): Named whole meat as first ingredient = baseline 70+. Meat meal acceptable = 50-69. By-products anywhere = cap at 50. No named protein source = cap at 30.
- Ingredient Safety (20%): BHA/BHT/ethoxyquin present = auto-cap OVERALL score at 35. Propylene glycol = cap overall at 40. Menadione = penalty of -15 on this category.
- Nutritional Balance (30%): Prefer published typical/actual analysis on a dry-matter basis over guaranteed label minimums/maximums. Evaluate disclosed protein, fat, fiber, calcium, phosphorus, and Ca:P ratio against the applicable life-stage profile. Missing full nutrient data = transparency penalty. Never infer exact nutrient levels from ingredients.
- Low-Nutrient Binders (15%): Corn, wheat, or soy in top 3 ingredients = cap this category at 40. Multiple unnamed grains = cap at 30. Excessive legumes/potatoes in grain-free = cap at 55.
- Additives & Preservatives (15%): Artificial colors (Red 40, Yellow 5, Blue 2) = cap at 30. Artificial flavors = cap at 40. Natural preservatives (mixed tocopherols, rosemary) = 80+.

Score tier labels: 85-100 Excellent, 70-84 Good, 50-69 Average, 30-49 Below Average, 1-29 Poor.

CRITICAL SCORING RULES:
- NEVER inflate scores. A grocery store brand with corn as the first ingredient should score 35-50, NOT 65-75.
- By-products as a primary protein source = maximum overall score of 50.
- The overallScore MUST be mathematically consistent with category scores. If categories average to 55, overallScore must NOT be 70+.
- If source-backed dog calcium on a dry-matter basis exceeds 1.8% for growth, reproduction, or all-life-stages food, or 2.5% for adult-maintenance food, cap the OVERALL score at 35 and state the concern clearly. Do not apply these caps to values whose basis or provenance is unknown.
- If a source-backed calcium-to-phosphorus ratio is outside 1:1 to 2:1, cap the OVERALL score at 45 and recommend confirming suitability with a veterinarian.
- Justify each category score by citing specific ingredients.
- Multiple bonus ingredients (probiotics, omega-3s, named organ meats, chelated minerals) can raise score.

Good: wholesome proteins, healthy fats, named meat sources, probiotics, omega fatty acids, chelated minerals.
Bad: BHA/BHT/ethoxyquin, by-products, excessive low-nutrient binders, sugar, artificial colors, propylene glycol, menadione.
Neutral: common binders or starches that are not inherently harmful but are not major nutritional strengths (rice, barley, oats).

IMPORTANT formatting rules:
- primaryProteinSource: use just the protein name (e.g. "Chicken", "Salmon Meal", "Deboned Chicken"). Do NOT include "By-Products" or long qualifiers.
- lifestage: keep concise (e.g. "All Life Stages", "Adult", "Puppy", "Senior"). Do NOT write "Adult Dogs (1+ years)" — just "Adult".

If not pet food: { "error": "Could not identify this as a pet food product. Try getting the brand name in the shot." }`;

const LABEL_LOOKUP_PROMPT = `You identify pet food products from front packaging photos for a shopping scanner.

Your job is NOT to analyze ingredients. Your job is only to read the visible brand/product/package text and create a search query for a pet food catalog.

CRITICAL RULES:
- Use only text and packaging cues visible in the image.
- Do not invent ingredients, scores, reviews, recalls, or nutrition.
- Prefer the exact brand and product line/flavor/recipe text if visible.
- Extract visible product line, flavor/recipe, life stage, food form, and package size separately when present.
- If the product is not pet food or the label is not readable, return found=false.
- Return ONLY pure JSON with no markdown.

Use this exact JSON shape:
{
  "found": true | false,
  "productName": "visible product name or empty string",
  "brand": "visible brand or empty string",
  "productLine": "visible product line/sub-brand or empty string",
  "flavor": "visible flavor or recipe, e.g. Chicken & Brown Rice, or empty string",
  "lifeStage": "visible life stage, e.g. puppy, adult, senior, kitten, or empty string",
  "foodForm": "visible form, e.g. dry, wet, pate, freeze-dried, fresh, or empty string",
  "packageSize": "visible size/weight/count, e.g. 24 lb, 3 oz, 12 cans, or empty string",
  "petType": "dog" | "cat" | "unknown",
  "confidence": 0.0-1.0,
  "searchQuery": "best short catalog search query including exact line/flavor/form/size when visible",
  "visibleText": ["short visible words or phrases"],
  "notes": "brief uncertainty note or empty string"
}`;

const VERIFIED_DATA_PROMPT = `You are a pet food expert. You have been given REAL, VERIFIED ingredient and nutrition data from a product database. Do NOT guess or make up any data — analyze ONLY what is provided.

CRITICAL RULES:
- NEVER inflate scores to make products seem better than they are. Accuracy over optimism.
- If uncertain about any data point, say so in your assessment rather than guessing.
- Do NOT invent customer reviews, customer ratings, recall alerts, or recall history. Only include facts supported by the verified product database data.

Steps:
1. Analyze each ingredient and rate it (good/bad/neutral) based on pet nutrition science.
2. Assess overall nutritional quality from the verified data.
3. Provide a comprehensive score and assessment.

CRITICAL OUTPUT FORMAT REQUIREMENT:
- Return ONLY pure JSON - NO markdown code fences
- Start your response with an opening brace immediately
- End with a closing brace
- Do NOT wrap JSON in backtick code blocks
- Your FIRST character must be an opening brace

Use this exact format:
{
  "productName": "Brand - Product Name",
  "petType": "dog" | "cat" | "unknown",
  "overallScore": 1-100,
  "summary": "2-3 sentence overall assessment based on verified data",
  "categories": [
    { "name": "Protein Quality", "score": 1-100, "detail": "based on verified data" },
    { "name": "Ingredient Safety", "score": 1-100, "detail": "based on verified data" },
    { "name": "Nutritional Balance", "score": 1-100, "detail": "based on verified data" },
    { "name": "Low-Nutrient Binders", "score": 1-100, "detail": "higher = less reliance on low-nutrient binders" },
    { "name": "Additives & Preservatives", "score": 1-100, "detail": "higher = fewer harmful" }
  ],
  "nutritionAnalysis": {
    "proteinLevel": "high" | "moderate" | "low",
    "proteinPercent": "from data or N/A",
    "fatLevel": "high" | "moderate" | "low",
    "fatPercent": "from data or N/A",
    "fiberPercent": "from data or N/A",
    "moisturePercent": "from data or N/A",
    "calciumDryMatterPercent": "from data or N/A",
    "phosphorusDryMatterPercent": "from data or N/A",
    "calciumPhosphorusRatio": "from data or N/A",
    "analysisTypeLabel": "Typical Analysis | Guaranteed Analysis | Nutrient Analysis",
    "analysisBasisLabel": "Dry matter | As fed | Basis not stated",
    "primaryProteinSource": "from ingredients list",
    "grainFree": true | false,
    "lifestage": "from data or Unknown",
    "caloriesPerCup": "from data or N/A"
  },
  "pros": ["pro based on real data"],
  "cons": ["con based on real data"],
  "ingredients": [
    { "name": "ingredient", "category": "protein|carb|fat|fiber|vitamin|mineral|preservative|other", "rating": "good|bad|neutral", "reason": "1-2 sentences explaining this quality rating", "description": "1-2 sentences explaining what this ingredient is in plain english", "alternatives": ["better alt 1", "better alt 2"] }
  ],
  "verdict": "2-3 sentence recommendation based on verified data."
}

For each ingredient: "description" explains what it is. "reason" explains the quality rating. "alternatives" is an array of 2-3 better alternatives ONLY for neutral or bad ingredients (omit or set null for good ingredients).

SCORING RUBRIC (be strict and evidence-based):

Overall Score = weighted average of 5 categories:
- Protein Quality (20%): Named whole meat as first ingredient = baseline 70+. Meat meal acceptable = 50-69. By-products anywhere = cap at 50. No named protein source = cap at 30.
- Ingredient Safety (20%): BHA/BHT/ethoxyquin present = auto-cap OVERALL score at 35. Propylene glycol = cap overall at 40. Menadione = penalty of -15 on this category.
- Nutritional Balance (30%): Prefer published typical/actual analysis on a dry-matter basis over guaranteed label minimums/maximums. Evaluate disclosed protein, fat, fiber, calcium, phosphorus, and Ca:P ratio against the applicable life-stage profile. Missing full nutrient data = transparency penalty. Never infer exact nutrient levels from ingredients.
- Low-Nutrient Binders (15%): Corn, wheat, or soy in top 3 ingredients = cap this category at 40. Multiple unnamed grains = cap at 30. Excessive legumes/potatoes in grain-free = cap at 55.
- Additives & Preservatives (15%): Artificial colors (Red 40, Yellow 5, Blue 2) = cap at 30. Artificial flavors = cap at 40. Natural preservatives (mixed tocopherols, rosemary) = 80+.

Score tier labels: 85-100 Excellent, 70-84 Good, 50-69 Average, 30-49 Below Average, 1-29 Poor.

CRITICAL SCORING RULES:
- NEVER inflate scores. A grocery store brand with corn as the first ingredient should score 35-50, NOT 65-75.
- By-products as a primary protein source = maximum overall score of 50.
- The overallScore MUST be mathematically consistent with category scores. If categories average to 55, overallScore must NOT be 70+.
- If source-backed dog calcium on a dry-matter basis exceeds 1.8% for growth, reproduction, or all-life-stages food, or 2.5% for adult-maintenance food, cap the OVERALL score at 35 and state the concern clearly. Do not apply these caps to values whose basis or provenance is unknown.
- If a source-backed calcium-to-phosphorus ratio is outside 1:1 to 2:1, cap the OVERALL score at 45 and recommend confirming suitability with a veterinarian.
- Justify each category score by citing specific ingredients.

Good: wholesome proteins, healthy fats, named meat sources, probiotics, omega fatty acids, chelated minerals.
Bad: BHA/BHT/ethoxyquin, by-products, excessive low-nutrient binders, sugar, artificial colors, propylene glycol, menadione.
Neutral: common binders or starches that are not inherently harmful but are not major nutritional strengths (rice, barley, oats).

IMPORTANT formatting rules:
- primaryProteinSource: use just the protein name (e.g. "Chicken", "Salmon Meal", "Deboned Chicken"). Do NOT include "By-Products" or long qualifiers.
- lifestage: keep concise (e.g. "All Life Stages", "Adult", "Puppy", "Senior"). Do NOT write "Adult Dogs (1+ years)" — just "Adult".`;

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

IMPORTANT:
- The "summary" must be SHORT — a quick verdict like "Plain cooked chicken is safe for dogs" or "Chocolate is toxic to dogs". Not a paragraph.
- "portions" must be SPECIFIC — say "2-3 small cubes" not "small amounts".
- "preparation" must explain HOW to serve safely — "cooked, plain, no bones, no skin, no seasoning".
- "ageGuidance" is REQUIRED — puppies/kittens have different tolerances than adults.

If not food: { "error": "Could not identify this as a food item. Please try again with a clearer photo." }`;

// ── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = CORS_HEADERS,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...DEPLOYMENT_HEADERS, ...headers, "Content-Type": "application/json" },
  });
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

function buildVerifiedDataText(opffProduct: Record<string, any>): string {
  const safe = sanitizeOpffProduct(opffProduct);
  const n = safe.nutriments || {};
  const analysisType = n.analysisType || n.analysis_type || safe.analysisType;
  const basis = n.basis || n.valueBasis || n.value_basis || n.analysisBasis || n.analysis_basis || safe.basis;
  return [
    `Product: ${safe.productName || "Unknown"}`,
    safe.brand ? `Brand: ${safe.brand}` : null,
    safe.petType ? `Pet Type: ${safe.petType}` : null,
    safe.lifeStage ? `Life Stage: ${safe.lifeStage}` : null,
    safe.ingredientsText
      ? `\nIngredients List:\n${safe.ingredientsText}`
      : null,
    safe.hasPublishedNutrients === true ? "Nutrient provenance: published source data" : null,
    analysisType ? `Analysis type: ${analysisType}` : null,
    basis ? `Analysis basis: ${basis}` : null,
    n.protein != null ? `Protein: ${n.protein}%` : null,
    n.fat != null ? `Fat: ${n.fat}%` : null,
    n.fiber != null ? `Fiber: ${n.fiber}%` : null,
    n.moisture != null ? `Moisture: ${n.moisture}%` : null,
    n.calcium != null ? `Calcium: ${n.calcium}%` : null,
    n.phosphorus != null ? `Phosphorus: ${n.phosphorus}%` : null,
    n.energy != null ? `Energy: ${n.energy} kcal per 100g` : null,
    safe.nutriscoreGrade
      ? `Nutriscore Grade: ${String(safe.nutriscoreGrade).toUpperCase()}`
      : null,
    safe.novaGroup ? `NOVA Group: ${safe.novaGroup}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function hasVerifiedIngredientData(product: Record<string, any>): boolean {
  const ingredientsText = typeof product.ingredientsText === "string"
    ? product.ingredientsText.trim()
    : "";
  const ingredients = Array.isArray(product.ingredients) ? product.ingredients : [];
  const hasIngredients = ingredients.length >= 3 || ingredientsText.length >= 30;
  if (!hasIngredients) return false;

  const status = typeof product.ingredientVerificationStatus === "string"
    ? product.ingredientVerificationStatus.toLowerCase()
    : "";
  return VERIFIED_INGREDIENT_STATUSES.has(status);
}

/**
 * Same normalization as client-side — must produce identical keys.
 */
function normalizeCacheKey(productName: string): string {
  return productName
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
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
 * Validate and normalize Claude's final response before returning or caching it.
 */
function isPlainObject(value: any): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: any): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("missing required string");
  }
  return value.trim();
}

function optionalString(value: any, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function stringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function numberInRange(value: any, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error("number out of range");
  }
  return Math.round(parsed);
}

function normalizeConfidence(value: any): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function normalizePetFoodPetType(value: any): string {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (["dog", "cat", "unknown"].includes(normalized)) return normalized;
  throw new Error("invalid pet type");
}

function normalizeHumanFoodPetType(value: any): string {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (normalized === "dog" || normalized === "cat") return normalized;
  throw new Error("invalid pet type");
}

function normalizeSafetyLevel(value: any): string {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (["safe", "caution", "dangerous"].includes(normalized)) return normalized;
  throw new Error("invalid safety level");
}

function normalizeAgeSafety(value: any): string {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (["safe", "caution", "avoid"].includes(normalized)) return normalized;
  return "caution";
}

function normalizeIngredients(value: any): Record<string, any>[] {
  if (!Array.isArray(value)) {
    throw new Error("missing ingredients");
  }

  const ingredients = value
    .filter(isPlainObject)
    .map((item) => {
      const rating = String(item.rating || "").toLowerCase();
      return {
        name: optionalString(item.name),
        category: optionalString(item.category, "other"),
        rating: ["good", "neutral", "bad"].includes(rating) ? rating : "neutral",
        reason: optionalString(item.reason),
        description: optionalString(item.description),
        alternatives: Array.isArray(item.alternatives)
          ? stringArray(item.alternatives)
          : null,
      };
    })
    .filter((item) => item.name);

  if (ingredients.length === 0) {
    throw new Error("missing ingredients");
  }

  return ingredients;
}

function normalizeCategories(value: any): Record<string, any>[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isPlainObject)
    .map((item) => ({
      name: optionalString(item.name),
      score: Number.isFinite(Number(item.score))
        ? Math.max(1, Math.min(100, Math.round(Number(item.score))))
        : 50,
      detail: optionalString(item.detail),
    }))
    .filter((item) => item.name);
}

function nutritionNumber(value: any): number | null {
  if (value == null || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
  const parsed = typeof value === "string" ? Number.parseFloat(value.replace(/[% ,]/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function nutrientPercent(value: any): string {
  const n = nutritionNumber(value); if (n == null) return "N/A";
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
function sourceNutritionEvidence(product: Record<string, any> | null): Record<string, any> {
  const p = isPlainObject(product) ? product : {};
  const n = isPlainObject(p.nutriments) ? p.nutriments : {};
  const sourceUrl = optionalString(p.sourceUrl || p.source_url || p.nutritionalInfo?.published_analysis_source?.source_url);
  const published = (p.hasPublishedNutrients === true || p.has_published_nutrients === true)
    && [n.protein, n.fat, n.fiber, n.moisture, n.calcium, n.phosphorus].some((v) => nutritionNumber(v) != null)
    && Boolean(sourceUrl);
  const typeText = optionalString(n.analysisType || n.analysis_type || p.analysisType).toLowerCase().replace(/[_-]+/g, " ");
  const basisText = optionalString(n.basis || n.valueBasis || n.value_basis || n.analysisBasis || n.analysis_basis || p.basis).toLowerCase().replace(/[_-]+/g, " ");
  const analysisType = /typical|actual|average nutrient|laboratory/.test(typeText) ? "typical" : /guaranteed|^ga$/.test(typeText) ? "guaranteed" : "unknown";
  const analysisBasis = /dry matter|^dm$|^dmb$/.test(basisText) ? "dry_matter" : /as fed|as is|^af$/.test(basisText) ? "as_fed" : "unknown";
  const moisture = nutritionNumber(n.moisture);
  const dm = (value: any) => { const amount = nutritionNumber(value); if (amount == null) return null; if (analysisBasis === "dry_matter") return amount; if (analysisBasis === "as_fed" && moisture != null && moisture < 100) return amount / ((100 - moisture) / 100); return null; };
  const calciumDm = published ? dm(n.calcium) : null;
  const phosphorusDm = published ? dm(n.phosphorus) : null;
  const ratio = calciumDm != null && phosphorusDm != null && phosphorusDm > 0 ? calciumDm / phosphorusDm : null;
  const lifeStage = optionalString(p.lifeStage || p.life_stage);
  let concern = null;
  if (published && optionalString(p.petType || p.pet_type).toLowerCase() === "dog" && calciumDm != null) {
    const maximum = /puppy|growth|reproduction|all life stages/i.test(lifeStage) ? 1.8 : 2.5;
    if (calciumDm > maximum) concern = { level: "avoid", code: "calcium_above_profile_maximum", summary: `Published calcium is ${nutrientPercent(calciumDm)} on a dry-matter basis, above the ${maximum}% AAFCO profile maximum used for this life-stage screen.`, calciumDryMatterPercent: calciumDm, profileMaximumPercent: maximum, lifeStage };
  }
  if (!concern && published && ratio != null && (ratio < 1 || ratio > 2)) concern = { level: "caution", code: "calcium_phosphorus_ratio_outside_profile", summary: `The published calcium-to-phosphorus ratio is ${ratio.toFixed(2)}:1, outside the 1:1 to 2:1 profile range used by this screen.` };
  const comparable = analysisBasis === "dry_matter" || (analysisBasis === "as_fed" && moisture != null);
  const transparencyLevel = published && analysisType === "typical" && comparable ? "fuller" : published && analysisType === "guaranteed" ? "limited" : "unknown";
  return { published, n, analysisType, analysisBasis, calciumDm, phosphorusDm, ratio, lifeStage, concern, transparencyLevel };
}

function normalizeNutritionAnalysis(value: any, sourceProduct: Record<string, any> | null = null): Record<string, any> {
  if (!isPlainObject(value)) {
    throw new Error("missing nutrition analysis");
  }
  const e = sourceNutritionEvidence(sourceProduct);
  return {
    proteinLevel: e.published ? optionalString(value.proteinLevel, "unknown") : "unknown",
    proteinPercent: e.published ? nutrientPercent(e.n.protein) : "N/A",
    fatLevel: e.published ? optionalString(value.fatLevel, "unknown") : "unknown",
    fatPercent: e.published ? nutrientPercent(e.n.fat) : "N/A",
    fiberPercent: e.published ? nutrientPercent(e.n.fiber) : "N/A",
    moisturePercent: e.published ? nutrientPercent(e.n.moisture) : "N/A",
    calciumDryMatterPercent: nutrientPercent(e.calciumDm),
    phosphorusDryMatterPercent: nutrientPercent(e.phosphorusDm),
    calciumPhosphorusRatio: e.ratio == null ? "N/A" : `${e.ratio.toFixed(2)}:1`,
    analysisType: e.analysisType,
    analysisTypeLabel: e.analysisType === "typical" ? "Typical analysis" : e.analysisType === "guaranteed" ? "Guaranteed analysis" : "Nutrient analysis",
    analysisBasis: e.analysisBasis,
    analysisBasisLabel: e.analysisBasis === "dry_matter" ? "Dry matter" : e.analysisBasis === "as_fed" ? "As fed" : "Basis not stated",
    hasPublishedNutrients: e.published,
    transparencyLevel: e.transparencyLevel,
    transparencyNote: e.transparencyLevel === "fuller" ? "This brand publishes its full typical analysis on a dry-matter basis, which raises its Nutritional Balance score." : e.transparencyLevel === "limited" ? "Only the label's guaranteed minimums and maximums are published, so Nutritional Balance is scored conservatively." : "A numeric, source-backed nutrient analysis is not published for this product, so Nutritional Balance is scored conservatively.",
    nutrientConcern: e.concern,
    primaryProteinSource: optionalString(value.primaryProteinSource),
    grainFree: typeof value.grainFree === "boolean" ? value.grainFree : null,
    lifestage: e.lifeStage || optionalString(value.lifestage),
    caloriesPerCup: "N/A",
  };
}

function validatePetFoodAnalysis(obj: Record<string, any>, sourceProduct: Record<string, any> | null = null): Record<string, any> {
  if (!isPlainObject(obj) || obj.error) {
    throw new Error("invalid pet-food analysis");
  }

  const categories = normalizeCategories(obj.categories);
  const ingredients = normalizeIngredients(obj.ingredients);
  const nutritionAnalysis = normalizeNutritionAnalysis(obj.nutritionAnalysis, sourceProduct);
  const weights = new Map([["protein quality", .2], ["ingredient safety", .2], ["nutritional balance", .3], ["low-nutrient binders", .15], ["additives & preservatives", .15]]);
  const scores = new Map(categories.map((c) => [c.name.toLowerCase(), c.score]));
  if (![...weights.keys()].every((name) => scores.has(name))) throw new Error("missing scoring categories");
  const weighted = Math.round([...weights].reduce((sum, [name, weight]) => sum + Number(scores.get(name)) * weight, 0));
  let overallScore = numberInRange(obj.overallScore, 1, 100);
  if (Math.abs(overallScore - weighted) > 2) { console.warn("[ANALYZE] Corrected inconsistent overall score", { reported: overallScore, weighted }); overallScore = weighted; }
  const ingredientText = ingredients.map((i) => i.name).join(" ").toLowerCase();
  const primary = optionalString(nutritionAnalysis.primaryProteinSource).toLowerCase();
  const cap = (maximum: number, reason: string) => { if (overallScore > maximum) { overallScore = maximum; console.warn("[ANALYZE] Applied server-side score cap", { maximum, reason }); } };
  if (/\b(?:bha|bht|ethoxyquin)\b/.test(ingredientText)) cap(35, "prohibited preservative");
  if (ingredientText.includes("propylene glycol")) cap(40, "propylene glycol");
  if (/by[ -]?product/.test(primary) || /by[ -]?product/.test(optionalString(ingredients[0]?.name).toLowerCase())) cap(50, "by-product primary");
  if (nutritionAnalysis.nutrientConcern?.level === "avoid") cap(35, "calcium profile maximum");
  if (nutritionAnalysis.nutrientConcern?.level === "caution") cap(45, "calcium-to-phosphorus ratio");
  return {
    ...obj,
    productName: requiredString(obj.productName),
    brand: optionalString(obj.brand, "Unknown"),
    petType: normalizePetFoodPetType(obj.petType),
    overallScore,
    scoringVersion: NUTRITION_SCORING_VERSION,
    summary: requiredString(obj.summary),
    verdict: requiredString(obj.verdict),
    ingredients,
    categories,
    nutritionAnalysis,
    customerRating: null,
    recallHistory: "",
    pros: stringArray(obj.pros),
    cons: stringArray(obj.cons),
  };
}

function validateHumanFoodAnalysis(obj: Record<string, any>): Record<string, any> {
  if (!isPlainObject(obj) || obj.error) {
    throw new Error("invalid human-food analysis");
  }

  const ageGuidance = isPlainObject(obj.ageGuidance) ? obj.ageGuidance : null;
  if (!ageGuidance) {
    throw new Error("missing age guidance");
  }

  return {
    ...obj,
    foodName: requiredString(obj.foodName),
    petType: normalizeHumanFoodPetType(obj.petType),
    safetyLevel: normalizeSafetyLevel(obj.safetyLevel),
    summary: requiredString(obj.summary),
    explanation: requiredString(obj.explanation),
    toxicCompounds: stringArray(obj.toxicCompounds),
    symptoms: optionalString(obj.symptoms, "N/A"),
    portions: requiredString(obj.portions),
    benefits: stringArray(obj.benefits),
    alternatives: stringArray(obj.alternatives),
    ageGuidance: {
      puppiesOrKittens: normalizeAgeSafety(ageGuidance.puppiesOrKittens),
      adults: normalizeAgeSafety(ageGuidance.adults),
      seniors: normalizeAgeSafety(ageGuidance.seniors),
      note: requiredString(ageGuidance.note),
    },
    preparation: requiredString(obj.preparation),
    disclaimer: optionalString(
      obj.disclaimer,
      "Individual pets may have allergies. Always consult your veterinarian.",
    ),
  };
}

function validateLabelLookup(obj: Record<string, any>): Record<string, any> {
  if (!isPlainObject(obj)) {
    throw new Error("invalid label lookup");
  }

  const productName = optionalString(obj.productName);
  const brand = optionalString(obj.brand);
  const productLine = optionalString(obj.productLine);
  const flavor = optionalString(obj.flavor);
  const lifeStage = optionalString(obj.lifeStage);
  const foodForm = optionalString(obj.foodForm);
  const packageSize = optionalString(obj.packageSize);
  const searchQuery = optionalString(obj.searchQuery);
  const normalizedPetType = (() => {
    const petType = String(obj.petType || "").toLowerCase().trim();
    return ["dog", "cat", "unknown"].includes(petType) ? petType : "unknown";
  })();
  const found = obj.found !== false && Boolean(productName || searchQuery);

  return {
    found,
    productName,
    brand,
    productLine,
    flavor,
    lifeStage,
    foodForm,
    packageSize,
    petType: normalizedPetType,
    confidence: normalizeConfidence(obj.confidence),
    searchQuery: searchQuery || [brand, productLine, productName, flavor, lifeStage, foodForm, packageSize].filter(Boolean).join(" "),
    visibleText: stringArray(obj.visibleText).slice(0, 12),
    notes: optionalString(obj.notes),
  };
}

function validateAnalysisResult(
  mode: string,
  obj: Record<string, any> | null,
  sourceProduct: Record<string, any> | null = null,
): Record<string, any> | null {
  if (!obj) return null;

  try {
    if (mode === "label_lookup") {
      return validateLabelLookup(obj);
    }
    if (mode === "human_food") {
      return validateHumanFoodAnalysis(obj);
    }
    return validatePetFoodAnalysis(obj, sourceProduct);
  } catch (err) {
    console.error("[ANALYZE] Invalid Claude response:", (err as Error).message);
    return null;
  }
}

function replaceClaudeTextContent(
  data: Record<string, any>,
  analysis: Record<string, any>,
): Record<string, any> {
  const content = Array.isArray(data.content) ? [...data.content] : [];
  content[0] = {
    ...(isPlainObject(content[0]) ? content[0] : { type: "text" }),
    text: JSON.stringify(analysis),
  };

  return { ...data, content };
}

function streamErrorEvent(
  error: string,
  scanUsage: Record<string, any> | null,
): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(
    `data: ${JSON.stringify({
      type: "woof_error",
      error,
      code: "ANALYSIS_STREAM_FAILED",
      scanUsage,
    })}\n\n`,
  );
}

function streamScanUsageEvent(scanUsage: Record<string, any> | null): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(
    `data: ${JSON.stringify({
      type: "woof_scan_usage",
      scanUsage,
    })}\n\n`,
  );
}

function streamValidatedAnalysisEvent(analysis: Record<string, any>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify({ type: "woof_validated_analysis", analysis })}\n\n`);
}

/**
 * Write analysis result to analysis_cache. Fire-and-forget.
 */
async function writeToCache(
  supabase: SupabaseClient,
  analysis: Record<string, any>,
  mode: string,
  cacheKey: string | null,
  opffProduct: Record<string, any> | null,
): Promise<void> {
  // Derive cache key from productName if not provided
  const resolvedKey = cacheKey || normalizeCacheKey(analysis.productName || "");
  if (!resolvedKey) return;

  const lookupType = cacheKey ? "barcode" : "name";
  const dataSource = mode === "verified" ? "verified" : "ai";
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("analysis_cache")
    .upsert(
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
      { onConflict: "cache_key" },
    );

  if (error) {
    console.error("[ANALYZE] Cache write failed:", error.message);
  } else {
    console.log("[ANALYZE] Cached result for:", resolvedKey);
  }
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const responseHeaders = corsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    jsonResponse(body, status, responseHeaders);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── 1. Auth ────────────────────────────────────────────────────────

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing auth token" }, 401);
  }

  const token = authHeader.substring(7);
  if (!token) {
    return json({ error: "Invalid auth token" }, 401);
  }

  let supabaseUrl: string;
  let supabaseServiceKey: string;
  try {
    supabaseUrl = requiredEnv("SUPABASE_URL");
    supabaseServiceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  } catch (error) {
    console.error("[ANALYZE] Server configuration error:", (error as Error).message);
    return json({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error("[ANALYZE] Auth failed:", authError?.message || "No user");
    return json({ error: "Invalid auth token" }, 401);
  }

  // ── 2. Rate limiting (atomic RPC) ─────────────────────────────────

  const { data: allowed, error: rlError } = await supabase.rpc(
    "check_rate_limit",
    { p_user_id: user.id },
  );

  if (rlError) {
    console.error("[ANALYZE] Rate limit check failed:", rlError.message);
    // Fail open — don't block users if the rate limit table has issues
  } else if (allowed === false) {
    return json(
      { error: "Rate limit exceeded. Please wait before scanning again." },
      429,
    );
  }

  // ── 3. Parse request body ─────────────────────────────────────────

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    mode,
    imageBase64,
    opffProduct,
    stream = true,
    cacheKey = null,
    petType = null,
    scanId = null,
  } = body;

  if (!mode || !["photo", "verified", "human_food", "label_lookup"].includes(mode)) {
    return json(
      { error: 'Invalid mode. Expected "photo", "verified", "human_food", or "label_lookup".' },
      400,
    );
  }

  // ── 4. Build Claude messages (with input validation) ────────────

  let systemPrompt: string;
  let verifiedProductContext: Record<string, any> | null = null;
  const userContent: Array<Record<string, any>> = [];

  if (mode === "photo") {
    systemPrompt = PHOTO_SYSTEM_PROMPT;

    if (!imageBase64) {
      return json(
        { error: "imageBase64 is required for photo mode" },
        400,
      );
    }

    // Validate base64 image size before forwarding to Claude.
    if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_B64_LENGTH) {
      return json(
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
      text: "Identify this pet food product and analyze it.",
    });
  } else if (mode === "label_lookup") {
    systemPrompt = LABEL_LOOKUP_PROMPT;

    if (!imageBase64) {
      return json(
        { error: "imageBase64 is required for label_lookup mode" },
        400,
      );
    }

    if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_B64_LENGTH) {
      return json(
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
      text: "Read the visible pet food label and return the best catalog search query.",
    });
  } else if (mode === "verified") {
    systemPrompt = VERIFIED_DATA_PROMPT;

    if (!opffProduct || typeof opffProduct !== "object") {
      return json(
        { error: "opffProduct is required for verified mode" },
        400,
      );
    }

    // Sanitize opffProduct before use
    const safeProduct = sanitizeOpffProduct(opffProduct);
    verifiedProductContext = safeProduct;
    if (!hasVerifiedIngredientData(safeProduct)) {
      return json(
        { error: "Verified ingredient provenance is required for verified mode" },
        422,
      );
    }

    if (imageBase64) {
      // Validate image size before forwarding to Claude.
      if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_B64_LENGTH) {
        return json(
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

    userContent.push({
      type: "text",
      text: `Here is verified product database data. Analyze and rate this product using ONLY this real data:\n\n${buildVerifiedDataText(safeProduct)}`,
    });
  } else if (mode === "human_food") {
    systemPrompt = HUMAN_FOOD_PROMPT;

    if (!imageBase64) {
      return json(
        { error: "imageBase64 is required for human_food mode" },
        400,
      );
    }
    if (!petType || (petType !== "dog" && petType !== "cat")) {
      return json(
        { error: 'petType ("dog" or "cat") is required for human_food mode' },
        400,
      );
    }
    if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_B64_LENGTH) {
      return json(
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
  }

  // ── 5. Entitlement check (atomic free-scan consumption) ─────────

  let scanUsage: Record<string, any> | null = null;

  if (mode !== "label_lookup") {
    const entitlementScanMode = mode === "verified" ? "barcode" : mode;
    const { data, error: scanUsageError } = await supabase.rpc(
      "consume_scan",
      {
        p_user_id: user.id,
        p_scan_id: typeof scanId === "string" ? scanId : null,
        p_scan_mode: entitlementScanMode,
        p_free_limit: 3,
      },
    );

    if (scanUsageError) {
      console.error("[ANALYZE] Scan entitlement check failed:", scanUsageError.message);
      return json({ error: "Could not verify scan entitlement" }, 500);
    }

    scanUsage = data;

    if (!scanUsage?.allowed) {
      return json(
        {
          error: "Free scan limit reached. Upgrade to keep scanning.",
          reason: scanUsage?.reason || "free_limit_reached",
          scanUsage,
        },
        402,
      );
    }
  }

  const reverseConsumedScan = async (
    reversalReason: string,
  ): Promise<Record<string, any> | null> => {
    if (!scanUsage?.counted) return scanUsage || null;

    const consumedScanId =
      typeof scanUsage.scan_id === "string"
        ? scanUsage.scan_id
        : typeof scanId === "string"
          ? scanId
          : null;

    if (!consumedScanId) return scanUsage;

    const { data, error } = await supabase.rpc("reverse_scan", {
      p_user_id: user.id,
      p_scan_id: consumedScanId,
      p_reversal_reason: reversalReason,
    });

    if (error) {
      console.error("[ANALYZE] Scan reversal failed:", error.message);
      return scanUsage;
    }

    return data || scanUsage;
  };

  // ── 6. Call Claude API (with timeout) ──────────────────────────

  let anthropicKey: string;
  try {
    anthropicKey = requiredEnv("ANTHROPIC_API_KEY");
  } catch (error) {
    console.error("[ANALYZE] Server configuration error:", (error as Error).message);
    const reversedUsage = await reverseConsumedScan("server_configuration_error");
    return json(
      { error: "Server configuration error", scanUsage: reversedUsage },
      500,
    );
  }

  const fetchController = new AbortController();
  const fetchTimeout = setTimeout(() => fetchController.abort(), CLAUDE_TIMEOUT_MS);

  let claudeResponse: Response;
  try {
    claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: mode === "label_lookup" ? 512 : (mode === "human_food" ? 2048 : 8192),
        stream,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: fetchController.signal,
    });
  } catch (err) {
    clearTimeout(fetchTimeout);
    if ((err as Error).name === "AbortError") {
      const reversedUsage = await reverseConsumedScan("claude_timeout");
      return json(
        { error: "Analysis timed out. Please try again.", scanUsage: reversedUsage },
        504,
      );
    }
    console.error("[ANALYZE] Claude fetch error:", err);
    const reversedUsage = await reverseConsumedScan("claude_fetch_failed");
    return json(
      { error: "Failed to reach analysis service", scanUsage: reversedUsage },
      502,
    );
  } finally {
    clearTimeout(fetchTimeout);
  }

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text().catch(() => "");
    console.error(
      `[ANALYZE] Claude API ${claudeResponse.status}:`,
      errText.slice(0, 500),
    );
    const reversedUsage = await reverseConsumedScan(`claude_api_${claudeResponse.status}`);
    return json(
      {
        error: `Analysis service error (${claudeResponse.status})`,
        scanUsage: reversedUsage,
      },
      claudeResponse.status >= 500 ? 502 : claudeResponse.status,
    );
  }

  // ── 7. Return response + write to cache ────────────────────────────

  if (stream) {
    if (!claudeResponse.body) {
      const reversedUsage = await reverseConsumedScan("empty_stream_body");
      return json(
        { error: "No analysis response returned", scanUsage: reversedUsage },
        502,
      );
    }

    let streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let streamResultDelivered = false;

    const clientStream = new ReadableStream({
      async start(controller) {
        streamReader = claudeResponse.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        const cacheTimeout = setTimeout(() => {
          streamReader?.cancel().catch(() => {});
        }, STREAM_CACHE_TIMEOUT_MS);

        try {
          while (true) {
            const { done, value } = await streamReader.read();
            if (done) break;
            controller.enqueue(value);
            accumulated += decoder.decode(value, { stream: true });
          }

          accumulated += decoder.decode();
          const text = extractTextFromSSE(accumulated);

          if (!text) {
            const reversedUsage = await reverseConsumedScan("empty_stream_response");
            controller.enqueue(
              streamErrorEvent("No analysis response returned", reversedUsage),
            );
            return;
          }

          const analysis = validateAnalysisResult(mode, cleanAndParse(text), verifiedProductContext);
          if (!analysis) {
            const reversedUsage = await reverseConsumedScan("invalid_stream_response");
            controller.enqueue(
              streamErrorEvent(
                "Analysis response failed validation. Please try again.",
                reversedUsage,
              ),
            );
            return;
          }

          if (mode !== "human_food" && mode !== "label_lookup") {
            writeToCache(supabase, analysis, mode, cacheKey, verifiedProductContext).catch(
              (err) => console.error("[ANALYZE] Stream cache write failed:", err.message),
            );
          }

          controller.enqueue(streamValidatedAnalysisEvent(analysis));
          controller.enqueue(streamScanUsageEvent(scanUsage));
          streamResultDelivered = true;
        } catch (err) {
          console.error("[ANALYZE] Stream proxy error:", (err as Error).message);
          const reversedUsage = await reverseConsumedScan("stream_proxy_failed");
          controller.enqueue(
            streamErrorEvent("Analysis stream failed. Please try again.", reversedUsage),
          );
        } finally {
          clearTimeout(cacheTimeout);
          streamReader?.releaseLock();
          streamReader = null;
          controller.close();
        }
      },
      async cancel() {
        if (!streamResultDelivered) {
          await reverseConsumedScan("client_stream_cancelled");
        }
        await streamReader?.cancel().catch(() => {});
      },
    });

    return new Response(clientStream, {
      headers: {
        ...responseHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  // Non-streaming: parse response, cache, then return to client
  let data: Record<string, any>;
  try {
    data = await claudeResponse.json();
  } catch (err) {
    console.error("[ANALYZE] Claude JSON response parse failed:", (err as Error).message);
    const reversedUsage = await reverseConsumedScan("invalid_claude_json");
    return json(
      { error: "Analysis response was invalid. Please try again.", scanUsage: reversedUsage },
      502,
    );
  }

  const content = data.content?.[0]?.text;

  if (!content) {
    const reversedUsage = await reverseConsumedScan("empty_nonstream_response");
    return json(
      { error: "No analysis response returned", scanUsage: reversedUsage },
      502,
    );
  }

  const analysis = validateAnalysisResult(mode, cleanAndParse(content), verifiedProductContext);
  if (!analysis) {
    const reversedUsage = await reverseConsumedScan("invalid_nonstream_response");
    return json(
      {
        error: "Analysis response failed validation. Please try again.",
        scanUsage: reversedUsage,
      },
      502,
    );
  }

  if (mode !== "human_food" && mode !== "label_lookup") {
    // Fire-and-forget cache write — don't delay the response
    writeToCache(supabase, analysis, mode, cacheKey, verifiedProductContext).catch(
      (err) => console.error("[ANALYZE] Non-stream cache error:", err.message),
    );
  }

  const responseBody = replaceClaudeTextContent(data, analysis);
  responseBody.scanUsage = scanUsage;

  return new Response(JSON.stringify(responseBody), {
    headers: { ...responseHeaders, "Content-Type": "application/json" },
  });
});
