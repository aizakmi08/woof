import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

// ── Constants ────────────────────────────────────────────────────────

const MAX_IMAGE_B64_LENGTH = 7_000_000; // ~5 MB decoded
const MAX_FIELD_LENGTH = 10_000;
const CLAUDE_TIMEOUT_MS = 90_000;
const STREAM_CACHE_TIMEOUT_MS = 120_000;

const OPFF_ALLOWED_FIELDS = new Set([
  "productName", "brand", "petType", "ingredientsText",
  "nutriments", "nutriscoreGrade", "novaGroup", "barcode",
  "ingredients", "imageUrl",
]);

// ── System prompts (server-side only — never sent to client) ─────────

const PHOTO_SYSTEM_PROMPT = `You are a pet food expert. Analyze the pet food product in this photo.

CRITICAL RULES:
- Identify the brand and product name from the packaging.
- ACCURACY IS PARAMOUNT. Never guess or fabricate ingredients. Only list ingredients you are confident are in this specific product.
- If an ingredient label is visible, transcribe every ingredient you can read from the label.
- If no label is visible, use your knowledge of this EXACT product. Do NOT confuse it with other products from the same brand. If unsure about specific ingredients, say so in the summary rather than guessing wrong.
- List the COMPLETE ingredient list. Pet foods have 15-40 ingredients including vitamins, minerals, and supplements.
- Include customer sentiment, nutritional breakdown, and safety info.

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
  "customerRating": {
    "score": 4.2,
    "outOf": 5,
    "totalReviews": "approximate number like 5000+",
    "sentiment": "short summary of what customers say",
    "commonPraises": ["2-4 word tag", "2-4 word tag", "2-4 word tag"],
    "commonComplaints": ["2-4 word tag", "2-4 word tag"]
  },
  "categories": [
    { "name": "Protein Quality", "score": 1-100, "detail": "brief assessment" },
    { "name": "Ingredient Safety", "score": 1-100, "detail": "brief assessment" },
    { "name": "Nutritional Balance", "score": 1-100, "detail": "brief assessment" },
    { "name": "Filler Content", "score": 1-100, "detail": "higher is better (less filler)" },
    { "name": "Additives & Preservatives", "score": 1-100, "detail": "higher is better (fewer harmful additives)" }
  ],
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
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2"],
  "recallHistory": "None known" | "description of recalls",
  "ingredients": [
    { "name": "ingredient", "category": "protein|carb|fat|fiber|vitamin|mineral|preservative|other", "rating": "good|bad|neutral", "reason": "1-2 sentences explaining this quality rating", "description": "1-2 sentences explaining what this ingredient is in plain english", "alternatives": ["better alt 1", "better alt 2"] }
  ],
  "verdict": "2-3 sentence recommendation."
}

CRITICAL: List EVERY ingredient — do NOT abbreviate or summarize. A typical pet food has 15-30+ ingredients including vitamins and minerals. If you only list 4-5 ingredients, you are doing it wrong. Include every vitamin, mineral, supplement, and additive.

For each ingredient: "description" explains what it is. "reason" explains the quality rating. "alternatives" is an array of 2-3 better alternatives ONLY for neutral or bad ingredients (omit or set null for good ingredients).

Score tiers: 90-100 Excellent, 80-89 Good, 70-79 Fair, 60-69 Poor, 1-59 Very Poor.
Good: wholesome proteins, healthy fats, named meat sources, probiotics, omega fatty acids.
Bad: BHA/BHT/ethoxyquin, by-products, excessive fillers, sugar, artificial colors, propylene glycol.
Neutral: common fillers that aren't harmful but aren't remarkable.

IMPORTANT formatting rules:
- commonPraises and commonComplaints MUST be short pill tags of 2-4 words max. Examples: "Great taste", "Affordable price", "Coat improvement", "Contains by-products", "Picky eater approved". NEVER use full sentences.
- primaryProteinSource: use just the protein name (e.g. "Chicken", "Salmon Meal", "Deboned Chicken"). Do NOT include "By-Products" or long qualifiers.
- lifestage: keep concise (e.g. "All Life Stages", "Adult", "Puppy", "Senior"). Do NOT write "Adult Dogs (1+ years)" — just "Adult".

If not pet food: { "error": "Could not identify this as a pet food product. Try getting the brand name in the shot." }`;

const VERIFIED_DATA_PROMPT = `You are a pet food expert. You have been given REAL, VERIFIED ingredient and nutrition data from a product database. Do NOT guess or make up any data — analyze ONLY what is provided.

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
  "customerRating": {
    "score": 4.0,
    "outOf": 5,
    "totalReviews": "N/A - database rating",
    "sentiment": "Assessment based on verified ingredient quality",
    "commonPraises": ["2-4 word tag based on real ingredients"],
    "commonComplaints": ["2-4 word tag based on real ingredients"]
  },
  "categories": [
    { "name": "Protein Quality", "score": 1-100, "detail": "based on verified data" },
    { "name": "Ingredient Safety", "score": 1-100, "detail": "based on verified data" },
    { "name": "Nutritional Balance", "score": 1-100, "detail": "based on verified data" },
    { "name": "Filler Content", "score": 1-100, "detail": "higher = less filler" },
    { "name": "Additives & Preservatives", "score": 1-100, "detail": "higher = fewer harmful" }
  ],
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
  "pros": ["pro based on real data"],
  "cons": ["con based on real data"],
  "recallHistory": "None known",
  "ingredients": [
    { "name": "ingredient", "category": "protein|carb|fat|fiber|vitamin|mineral|preservative|other", "rating": "good|bad|neutral", "reason": "1-2 sentences explaining this quality rating", "description": "1-2 sentences explaining what this ingredient is in plain english", "alternatives": ["better alt 1", "better alt 2"] }
  ],
  "verdict": "2-3 sentence recommendation based on verified data."
}

For each ingredient: "description" explains what it is. "reason" explains the quality rating. "alternatives" is an array of 2-3 better alternatives ONLY for neutral or bad ingredients (omit or set null for good ingredients).

Score tiers: 90-100 Excellent, 80-89 Good, 70-79 Fair, 60-69 Poor, 1-59 Very Poor.
Good: wholesome proteins, healthy fats, named meat sources, probiotics, omega fatty acids.
Bad: BHA/BHT/ethoxyquin, by-products, excessive fillers, sugar, artificial colors, propylene glycol.
Neutral: common fillers that aren't harmful but aren't remarkable.

IMPORTANT formatting rules:
- commonPraises and commonComplaints MUST be short pill tags of 2-4 words max. Examples: "Great taste", "Affordable price", "Coat improvement", "Contains by-products", "Picky eater approved". NEVER use full sentences.
- primaryProteinSource: use just the protein name (e.g. "Chicken", "Salmon Meal", "Deboned Chicken"). Do NOT include "By-Products" or long qualifiers.
- lifestage: keep concise (e.g. "All Life Stages", "Adult", "Puppy", "Senior"). Do NOT write "Adult Dogs (1+ years)" — just "Adult".`;

// ── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
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
  return [
    `Product: ${safe.productName || "Unknown"}`,
    safe.brand ? `Brand: ${safe.brand}` : null,
    safe.petType ? `Pet Type: ${safe.petType}` : null,
    safe.ingredientsText
      ? `\nIngredients List:\n${safe.ingredientsText}`
      : null,
    n.protein != null ? `Protein: ${n.protein}g per 100g` : null,
    n.fat != null ? `Fat: ${n.fat}g per 100g` : null,
    n.fiber != null ? `Fiber: ${n.fiber}g per 100g` : null,
    n.energy != null ? `Energy: ${n.energy} kcal per 100g` : null,
    safe.nutriscoreGrade
      ? `Nutriscore Grade: ${String(safe.nutriscoreGrade).toUpperCase()}`
      : null,
    safe.novaGroup ? `NOVA Group: ${safe.novaGroup}` : null,
  ]
    .filter(Boolean)
    .join("\n");
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
 * Validate analysis response has required fields.
 */
function isValidAnalysis(obj: any): boolean {
  return (
    obj != null &&
    typeof obj === "object" &&
    !obj.error &&
    typeof obj.productName === "string" &&
    obj.productName.length > 0 &&
    typeof obj.overallScore === "number" &&
    obj.overallScore >= 1 &&
    obj.overallScore <= 100
  );
}

/**
 * Write analysis result to analysis_cache. Fire-and-forget.
 */
async function writeToCache(
  supabase: ReturnType<typeof createClient>,
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
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── 1. Auth ────────────────────────────────────────────────────────

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing auth token" }, 401);
  }

  const token = authHeader.substring(7);
  if (!token) {
    return jsonResponse({ error: "Invalid auth token" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error("[ANALYZE] Auth failed:", authError?.message || "No user");
    return jsonResponse({ error: "Invalid auth token" }, 401);
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
    return jsonResponse(
      { error: "Rate limit exceeded. Max 20 scans per hour." },
      429,
    );
  }

  // ── 3. Parse request body ─────────────────────────────────────────

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const {
    mode,
    imageBase64,
    opffProduct,
    stream = true,
    cacheKey = null,
  } = body;

  if (!mode || (mode !== "photo" && mode !== "verified")) {
    return jsonResponse(
      { error: 'Invalid mode. Expected "photo" or "verified".' },
      400,
    );
  }

  // ── 4. Build Claude messages (with input validation) ────────────

  let systemPrompt: string;
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
      text: "Identify this pet food product and analyze it.",
    });
  } else {
    // verified mode
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

    userContent.push({
      type: "text",
      text: `Here is VERIFIED data from Open Pet Food Facts. Analyze and rate this product using ONLY this real data:\n\n${buildVerifiedDataText(safeProduct)}`,
    });
  }

  // ── 5. Call Claude API (with timeout) ──────────────────────────

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    console.error("[ANALYZE] ANTHROPIC_API_KEY not set");
    return jsonResponse({ error: "Server configuration error" }, 500);
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
        max_tokens: 4096,
        stream,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: fetchController.signal,
    });
  } catch (err) {
    clearTimeout(fetchTimeout);
    if ((err as Error).name === "AbortError") {
      return jsonResponse({ error: "Analysis timed out. Please try again." }, 504);
    }
    console.error("[ANALYZE] Claude fetch error:", err);
    return jsonResponse({ error: "Failed to reach analysis service" }, 502);
  } finally {
    clearTimeout(fetchTimeout);
  }

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text().catch(() => "");
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

    // Background: read cacheStream, accumulate SSE text, parse, and write to cache (with timeout)
    (async () => {
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
          const analysis = cleanAndParse(text);
          if (isValidAnalysis(analysis)) {
            await writeToCache(supabase, analysis!, mode, cacheKey, opffProduct);
          }
        }
      } catch (err) {
        console.error("[ANALYZE] Stream cache error:", (err as Error).message);
      } finally {
        clearTimeout(cacheTimeout);
      }
    })();

    return new Response(clientStream, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  // Non-streaming: parse response, cache, then return to client
  const data = await claudeResponse.json();
  const content = data.content?.[0]?.text;

  if (content) {
    const analysis = cleanAndParse(content);
    if (isValidAnalysis(analysis)) {
      // Fire-and-forget cache write — don't delay the response
      writeToCache(supabase, analysis!, mode, cacheKey, opffProduct).catch(
        (err) => console.error("[ANALYZE] Non-stream cache error:", err.message),
      );
    }
  }

  return new Response(JSON.stringify(data), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
