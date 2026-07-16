import { parse as parsePartialJson } from "partial-json";
import { supabase } from "./supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/env";
import { trackEvent } from "./analytics";
import { createLogger } from "./logger";

const ANALYZE_URL = `${SUPABASE_URL}/functions/v1/analyze`;
const LABEL_LOOKUP_URL = `${SUPABASE_URL}/functions/v1/label-lookup`;
const logger = createLogger("CLAUDE");
// Must exceed the Edge Function timeout so counted scans can be reversed
// server-side before the client aborts the request.
const CLIENT_ANALYSIS_TIMEOUT_MS = 55000;
// On-device OCR is the fast path; the cloud resolver is a short visual fallback.
const LABEL_LOOKUP_TIMEOUT_MS = 6500;
const AUTH_REFRESH_TIMEOUT_MS = 12000;

// Detect streaming capability at module load
// expo/fetch provides ReadableStream; without it, streaming SSE gets truncated
let streamFetch = global.fetch;
let canStream = false;
try {
  const expoFetch = require("expo/fetch");
  if (expoFetch?.fetch) {
    streamFetch = expoFetch.fetch;
    canStream = true;
    logger.debug("[CLAUDE] Streaming enabled (expo/fetch)");
  }
} catch {
  // expo/fetch not available (production builds)
}
if (!canStream) {
  logger.debug("[CLAUDE] Streaming disabled — will use non-streaming mode for complete responses");
}

async function refreshSessionWithTimeout(timeoutMs = AUTH_REFRESH_TIMEOUT_MS) {
  let timeoutId;
  try {
    return await Promise.race([
      supabase.auth.refreshSession(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Session refresh timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function _getAuthHeaders() {
  let { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    logger.debug("[CLAUDE] Session error:", sessionError.message);
    throw new Error("Authentication error. Please sign out and back in.");
  }

  if (!session) {
    logger.debug("[CLAUDE] No active session");
    throw new Error("Not authenticated. Please sign in first.");
  }

  const now = Date.now() / 1000;
  const expiresAt = session.expires_at || 0;
  const expiresIn = expiresAt - now;

  logger.debug(`[CLAUDE] Session check:`, {
    userId: session.user?.id?.slice(0, 8) + '...',
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    expiresIn: Math.round(expiresIn) + 's',
    hasRefreshToken: !!session.refresh_token,
  });

  // ALWAYS refresh if token is expired or will expire within 5 minutes
  if (expiresIn < 300) {
    logger.debug("[CLAUDE] Token expired or expiring soon, force refreshing...");
    const { data, error: refreshError } = await refreshSessionWithTimeout();
    if (refreshError) {
      logger.debug("[CLAUDE] Token refresh failed:", refreshError.message);
      // Token is completely dead - force sign out
      logger.debug("[CLAUDE] Forcing sign out due to dead token");
      await supabase.auth.signOut().catch(() => {});
      throw new Error("Session expired. Please sign in again.");
    }
    if (data.session) {
      session = data.session;
      logger.debug("[CLAUDE] Token refreshed successfully, new expiry:", new Date(data.session.expires_at * 1000).toISOString());
    } else {
      logger.debug("[CLAUDE] Refresh returned no session");
      await supabase.auth.signOut().catch(() => {});
      throw new Error("Session expired. Please sign in again.");
    }
  }

  const token = session?.access_token;
  if (!token) {
    logger.debug("[CLAUDE] No access token in session");
    throw new Error("Not authenticated. Please sign in first.");
  }

  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
  };
}

function cleanAndParse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

// Extract text content from SSE text blob (fallback when ReadableStream not available)
function buildStreamEventError(event) {
  const error = new Error(event.error || "Analysis stream failed. Please try again.");
  error.code = event.code || "ANALYSIS_STREAM_FAILED";
  error.scanUsage = event.scanUsage || null;
  return error;
}

function buildStreamIncompleteError() {
  const error = new Error("Analysis stream ended before completion confirmation. Retrying...");
  error.code = "ANALYSIS_STREAM_INCOMPLETE";
  return error;
}

function processSSELine(line, state) {
  if (!line.startsWith("data: ")) return;
  const data = line.slice(6).trim();
  if (!data || data === "[DONE]") return;

  try {
    const event = JSON.parse(data);
    if (event.type === "content_block_delta" && event.delta?.text) {
      state.text += event.delta.text;
    } else if (event.type === "woof_error") {
      state.error = buildStreamEventError(event);
    } else if (event.type === "woof_scan_usage") {
      state.scanUsageConfirmed = true;
      state.scanUsage = event.scanUsage || null;
    }
  } catch {
    // skip malformed lines
  }
}

function processSSEText(text, state) {
  const lines = `${state.pendingLine}${text}`.split("\n");
  state.pendingLine = lines.pop() || "";
  for (const line of lines) processSSELine(line, state);
}

function flushSSEText(state) {
  if (state.pendingLine) {
    processSSELine(state.pendingLine, state);
    state.pendingLine = "";
  }
}

function createSSEState() {
  return { text: "", error: null, pendingLine: "", scanUsage: null, scanUsageConfirmed: false };
}

function attachScanUsage(result, scanUsage) {
  if (!scanUsage || !result || typeof result !== "object") return result;
  Object.defineProperty(result, "__scanUsage", {
    value: scanUsage,
    enumerable: false,
    configurable: true,
  });
  return result;
}

function attachErrorScanUsage(error, scanUsage) {
  if (!scanUsage || !error || typeof error !== "object" || error.scanUsage) return error;
  error.scanUsage = scanUsage;
  return error;
}

function hasCountedScanUsage(error) {
  return error?.scanUsage?.counted === true;
}

function payloadImageLength(payload) {
  return typeof payload?.imageBase64 === "string" ? payload.imageBase64.length : 0;
}

function hasImagePayload(payload) {
  return payloadImageLength(payload) > 0;
}

function maxStreamingAttempts(payload) {
  return hasImagePayload(payload) ? 1 : 2;
}

function shouldRetryAnalysisError(error) {
  if (hasCountedScanUsage(error)) return false;
  if (error?.code === "SCAN_LIMIT_REACHED") return false;
  if (typeof error?.status === "number" && error.status < 500) return false;
  return true;
}

function buildRequestBody({ mode, payload, stream, attempt }) {
  const body = JSON.stringify({ mode, ...payload, stream });
  const imageBase64Length = payloadImageLength(payload);

  trackEvent("analysis_upload_started", {
    mode,
    stream,
    attempt,
    scan_id: payload?.scanId || null,
    has_image: imageBase64Length > 0,
    image_base64_length: imageBase64Length,
    estimated_image_decoded_bytes: Math.round(imageBase64Length * 0.75),
    estimated_request_bytes: body.length,
    scan_id_present: !!payload?.scanId,
    cache_key_present: !!payload?.cacheKey,
  }).catch(() => {});

  return body;
}

function buildImageRetrySuppressedError(error) {
  const message =
    error?.code === "ANALYSIS_STREAM_INCOMPLETE"
      ? "Analysis connection ended before completion. Please try again."
      : error?.message || "Analysis upload failed. Please try again.";

  const wrapped = new Error(message);
  wrapped.code = "ANALYSIS_IMAGE_RETRY_SUPPRESSED";
  wrapped.originalCode = error?.code || null;
  wrapped.status = Number.isFinite(error?.status) ? error.status : null;
  wrapped.scanUsage = error?.scanUsage || null;
  return wrapped;
}

function suppressImageNonStreamingFallback({ mode, payload, error, attemptedRequestCount }) {
  const imageBase64Length = payloadImageLength(payload);
  const wrapped = buildImageRetrySuppressedError(error);

  trackEvent("analysis_image_retry_suppressed", {
    mode,
    scan_id: payload?.scanId || null,
    attempted_request_count: attemptedRequestCount,
    image_base64_length: imageBase64Length,
    estimated_image_decoded_bytes: Math.round(imageBase64Length * 0.75),
    original_error_code: wrapped.originalCode,
    http_status: wrapped.status,
  }).catch(() => {});

  logger.debug("[CLAUDE] Image payload already uploaded; skipping non-streaming fallback:", wrapped.message);
  return wrapped;
}

function extractTextFromSSE(sseText) {
  const state = createSSEState();
  processSSEText(sseText, state);
  flushSSEText(state);
  if (state.error) throw state.error;
  return state.text;
}

function buildServerError(status, bodyText) {
  let message = `Analysis error (${status})`;
  let parsed = null;

  try {
    parsed = JSON.parse(bodyText);
    message = parsed.error || message;
  } catch {
    message = bodyText || message;
  }

  const error = new Error(message);
  error.status = status;
  error.scanUsage = parsed?.scanUsage || null;

  if (status === 402 || parsed?.reason === "free_limit_reached") {
    error.code = "SCAN_LIMIT_REACHED";
  }

  return error;
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Analysis response missing ${fieldName}. Please try again.`);
  }
  return value.trim();
}

function optionalString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberInRange(value, fieldName, min, max) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Analysis response has invalid ${fieldName}. Please try again.`);
  }
  return Math.round(parsed);
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizePetFoodPetType(value) {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (["dog", "cat", "unknown"].includes(normalized)) return normalized;
  throw new Error("Analysis response missing pet type. Please try again.");
}

function normalizeHumanFoodPetType(value) {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (normalized === "dog" || normalized === "cat") return normalized;
  throw new Error("Analysis response missing pet type. Please try again.");
}

function normalizeSafetyLevel(value) {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (["safe", "caution", "dangerous"].includes(normalized)) return normalized;
  throw new Error("Analysis response missing safety level. Please try again.");
}

function normalizeConfidence(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeAgeSafety(value) {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (["safe", "caution", "avoid"].includes(normalized)) return normalized;
  return "caution";
}

function normalizeIngredients(value) {
  if (!Array.isArray(value)) {
    throw new Error("Analysis response missing ingredients. Please try again.");
  }

  const ingredients = value
    .filter(isPlainObject)
    .map((item) => ({
      name: optionalString(item.name),
      rating: ["good", "neutral", "bad"].includes(String(item.rating).toLowerCase())
        ? String(item.rating).toLowerCase()
        : "neutral",
      description: optionalString(item.description),
      reason: optionalString(item.reason),
      alternatives: Array.isArray(item.alternatives) ? stringArray(item.alternatives) : null,
    }))
    .filter((item) => item.name);

  if (ingredients.length === 0) {
    throw new Error("Analysis response missing ingredients. Please try again.");
  }

  return ingredients;
}

function normalizeCategories(value) {
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

function normalizeNutritionAnalysis(value) {
  if (!isPlainObject(value)) return null;

  return {
    proteinLevel: optionalString(value.proteinLevel),
    proteinPercent: optionalString(value.proteinPercent),
    fatLevel: optionalString(value.fatLevel),
    fatPercent: optionalString(value.fatPercent),
    fiberPercent: optionalString(value.fiberPercent),
    primaryProteinSource: optionalString(value.primaryProteinSource),
    grainFree: typeof value.grainFree === "boolean" ? value.grainFree : null,
    lifestage: optionalString(value.lifestage),
    caloriesPerCup: optionalString(value.caloriesPerCup),
  };
}

function validatePetFoodAnalysis(result) {
  if (!isPlainObject(result) || result.error) {
    throw new Error(result?.error || "Invalid analysis response from Claude.");
  }

  const normalized = {
    ...result,
    productName: requiredString(result.productName, "product name"),
    brand: optionalString(result.brand, "Unknown"),
    petType: normalizePetFoodPetType(result.petType),
    overallScore: numberInRange(result.overallScore, "overall score", 1, 100),
    summary: requiredString(result.summary, "summary"),
    verdict: requiredString(result.verdict, "verdict"),
    ingredients: normalizeIngredients(result.ingredients),
    categories: normalizeCategories(result.categories),
    nutritionAnalysis: normalizeNutritionAnalysis(result.nutritionAnalysis),
    customerRating: null,
    recallHistory: "",
  };

  if (!normalized.nutritionAnalysis) {
    throw new Error("Analysis response missing nutrition details. Please try again.");
  }

  return normalized;
}

function validateHumanFoodAnalysis(result) {
  if (!isPlainObject(result) || result.error) {
    throw new Error(result?.error || "Invalid human food response from Claude.");
  }

  const ageGuidance = isPlainObject(result.ageGuidance) ? result.ageGuidance : null;
  if (!ageGuidance) {
    throw new Error("Analysis response missing age guidance. Please try again.");
  }

  return {
    ...result,
    foodName: requiredString(result.foodName, "food name"),
    petType: normalizeHumanFoodPetType(result.petType),
    safetyLevel: normalizeSafetyLevel(result.safetyLevel),
    summary: requiredString(result.summary, "summary"),
    explanation: requiredString(result.explanation, "explanation"),
    toxicCompounds: stringArray(result.toxicCompounds),
    symptoms: optionalString(result.symptoms, "N/A"),
    portions: requiredString(result.portions, "portion guidance"),
    benefits: stringArray(result.benefits),
    alternatives: stringArray(result.alternatives),
    ageGuidance: {
      puppiesOrKittens: normalizeAgeSafety(ageGuidance.puppiesOrKittens),
      adults: normalizeAgeSafety(ageGuidance.adults),
      seniors: normalizeAgeSafety(ageGuidance.seniors),
      note: requiredString(ageGuidance.note, "age guidance note"),
    },
    preparation: requiredString(result.preparation, "preparation guidance"),
    disclaimer: optionalString(
      result.disclaimer,
      "Individual pets may have allergies. Always consult your veterinarian.",
    ),
  };
}

function validateLabelLookupResult(result) {
  if (!isPlainObject(result)) {
    throw new Error("Product label response was invalid. Please try again.");
  }

  const found = result.found !== false && !!(
    optionalString(result.productName) ||
    optionalString(result.searchQuery)
  );

  return {
    found,
    productName: optionalString(result.productName),
    brand: optionalString(result.brand),
    productLine: optionalString(result.productLine),
    flavor: optionalString(result.flavor),
    lifeStage: optionalString(result.lifeStage),
    foodForm: optionalString(result.foodForm),
    packageSize: optionalString(result.packageSize),
    petType: ["dog", "cat", "unknown"].includes(String(result.petType).toLowerCase())
      ? String(result.petType).toLowerCase()
      : "unknown",
    confidence: normalizeConfidence(result.confidence),
    searchQuery: optionalString(result.searchQuery),
    visibleText: stringArray(result.visibleText),
    notes: optionalString(result.notes),
  };
}

function validateAnalysisResult(mode, result) {
  if (mode === "label_lookup") {
    return validateLabelLookupResult(result);
  }

  if (mode === "human_food") {
    return validateHumanFoodAnalysis(result);
  }

  return validatePetFoodAnalysis(result);
}

// Streaming engine — reads SSE chunks and calls onUpdate with partial JSON
async function _callStreaming({ mode, payload, onUpdate, signal, attempt = 1 }) {
  const t0 = Date.now();
  logger.debug("[CLAUDE] Stream started");

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const headers = await _getAuthHeaders();

  const response = await streamFetch(ANALYZE_URL, {
    method: "POST",
    headers,
    body: buildRequestBody({ mode, payload, stream: true, attempt }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    const error = buildServerError(response.status, errBody);

    // Log the actual server error for debugging
    logger.debug(`[CLAUDE] Server error ${response.status}:`, error.message);

    throw error;
  }

  logger.debug(`[TIMER] Claude API response: ${Date.now() - t0}ms`);

  // Verify streaming support
  const hasReadableStream = response.body && typeof response.body.getReader === "function";
  logger.debug(`[CLAUDE] ReadableStream available: ${hasReadableStream}`);

  let firstChunk = true;
  let firstParsed = false;
  const streamState = createSSEState();
  let lastUpdateTime = 0;
  const THROTTLE_MS = 100;

  // Try ReadableStream first
  if (hasReadableStream) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (firstChunk) {
          firstChunk = false;
          logger.debug(`[TIMER] Claude first chunk: ${Date.now() - t0}ms`);
        }
        const prevLen = streamState.text.length;
        processSSEText(chunk, streamState);

        if (prevLen === 0 && streamState.text.length > 0) {
          logger.debug(`[CLAUDE] Stream starts with: ${JSON.stringify(streamState.text.slice(0, 80))}`);
        }

        // Throttled partial JSON parse
        const now = Date.now();
        if (now - lastUpdateTime >= THROTTLE_MS && streamState.text.length > 0) {
          lastUpdateTime = now;
          try {
            let textToParse = streamState.text.trimStart();
            if (textToParse.startsWith("```")) {
              textToParse = textToParse.replace(/^```(?:json)?\s*\n?/, "");
            }
            const partial = parsePartialJson(textToParse);
            if (partial && typeof partial === "object") {
              if (!firstParsed) {
                firstParsed = true;
                logger.debug(`[TIMER] Claude first parsed JSON: ${Date.now() - t0}ms`);
              }
              onUpdate(partial);
            }
          } catch {
            // partial JSON not parseable yet
          }
        }
      }
      // Flush any remaining bytes from the decoder
      const remaining = decoder.decode();
      if (remaining) {
        processSSEText(remaining, streamState);
      }
      flushSSEText(streamState);
    } finally {
      reader.releaseLock();
    }
  } else {
    // Fallback: read entire response as text and extract SSE
    logger.debug("[CLAUDE] ⚠️ ReadableStream not available, falling back to text SSE parse (slower, waits for full response)");
    const text = await response.text();
    processSSEText(text, streamState);
    flushSSEText(streamState);
    if (streamState.error) throw streamState.error;
    logger.debug(`[CLAUDE] Fallback text response length: ${text.length} chars, extracted: ${streamState.text.length} chars`);
  }

  if (streamState.error) throw streamState.error;
  if (!streamState.scanUsageConfirmed || !streamState.scanUsage) {
    throw attachErrorScanUsage(buildStreamIncompleteError(), streamState.scanUsage);
  }

  const accumulated = streamState.text;

  if (!accumulated) {
    throw new Error("No response from Claude.");
  }

  // Final parse — try strict JSON first, fall back to partial JSON if incomplete
  let final;
  try {
    final = cleanAndParse(accumulated);
  } catch (err) {
    logger.debug("[CLAUDE] Final parse failed (incomplete stream?), using partial JSON:", err.message);
    // Strip markdown and try partial parse
    let textToParse = accumulated.trim();
    if (textToParse.startsWith("```")) {
      textToParse = textToParse.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    try {
      final = parsePartialJson(textToParse);
    } catch (partialErr) {
      // If even partial parse fails, throw original error
      throw attachErrorScanUsage(
        new Error(`Failed to parse Claude response: ${err.message}`),
        streamState.scanUsage
      );
    }
  }

  if (!final || typeof final !== "object") {
    throw attachErrorScanUsage(
      new Error("Invalid response format from Claude."),
      streamState.scanUsage
    );
  }

  const validated = validateAnalysisResult(mode, final);
  attachScanUsage(validated, streamState.scanUsage);

  onUpdate(validated);
  logger.debug("[CLAUDE] Stream complete:", validated.productName || validated.foodName, "| score:", validated.overallScore ?? validated.safetyLevel);
  logger.debug(`[TIMER] Claude stream total: ${Date.now() - t0}ms`);
  return validated;
}

// Non-streaming fallback
async function _callNonStreaming({ mode, payload, signal, attempt = 1 }) {
  logger.debug("[CLAUDE] Non-streaming call");

  const headers = await _getAuthHeaders();

  const response = await fetch(ANALYZE_URL, {
    method: "POST",
    headers,
    body: buildRequestBody({ mode, payload, stream: false, attempt }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    const error = buildServerError(response.status, errBody);

    // Log the actual server error for debugging
    logger.debug(`[CLAUDE] Server error ${response.status}:`, error.message);

    throw error;
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error("No response from Claude.");
  }

  const validated = validateAnalysisResult(mode, cleanAndParse(content));
  return attachScanUsage(validated, data.scanUsage || null);
}

export async function analyzeIngredients(base64Image, { onUpdate, signal, cacheKey, scanId } = {}) {
  logger.debug("[CLAUDE] analyzeIngredients called (photo-only mode) | canStream:", canStream);
  const t0 = Date.now();

  const payload = { imageBase64: base64Image };
  if (cacheKey) payload.cacheKey = cacheKey;
  if (scanId) payload.scanId = scanId;
  let nextAttempt = 1;
  let lastStreamingError = null;

  // Streaming path — only when ReadableStream is available
  if (onUpdate && canStream) {
    const streamingAttempts = maxStreamingAttempts(payload);
    for (let attempt = 0; attempt < streamingAttempts; attempt++) {
      try {
        const requestAttempt = nextAttempt++;
        return await _callStreaming({
          mode: "photo",
          payload,
          onUpdate,
          signal,
          attempt: requestAttempt,
        });
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) throw err;
        if (!shouldRetryAnalysisError(err)) throw err;
        lastStreamingError = err;
        if (attempt < streamingAttempts - 1) {
          logger.debug(`[CLAUDE] Streaming attempt ${attempt + 1} failed, retrying:`, err.message);
          continue;
        }
        logger.debug(`[CLAUDE] Streaming failed after ${streamingAttempts} attempt(s):`, err.message);
      }
    }
  }

  if (lastStreamingError && hasImagePayload(payload) && hasCountedScanUsage(lastStreamingError)) {
    throw suppressImageNonStreamingFallback({
      mode: "photo",
      payload,
      error: lastStreamingError,
      attemptedRequestCount: nextAttempt - 1,
    });
  }

  // Non-streaming path — guaranteed complete response
  const controller = new AbortController();
  const elapsed = Date.now() - t0;
  const remainingMs = Math.max(10000, CLIENT_ANALYSIS_TIMEOUT_MS - elapsed);
  const timeout = setTimeout(() => controller.abort(), remainingMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const result = await _callNonStreaming({
      mode: "photo",
      payload,
      signal: controller.signal,
      attempt: nextAttempt,
    });
    logger.debug("[CLAUDE] analyzeIngredients result:", result.productName, "| score:", result.overallScore);
    // Deliver complete result to subscriber
    if (onUpdate) onUpdate(result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function identifyProductLabel(base64Image, { signal } = {}) {
  logger.debug("[CLAUDE] identifyProductLabel called");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LABEL_LOOKUP_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const headers = await _getAuthHeaders();
    const response = await fetch(LABEL_LOOKUP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ imageBase64: base64Image }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw buildServerError(response.status, errBody);
    }

    return validateLabelLookupResult(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeWithData(opffProduct, base64Image, { onUpdate, signal, cacheKey, scanId } = {}) {
  logger.debug("[CLAUDE] analyzeWithData called (verified data mode) | product:", opffProduct.productName, "| hasImage:", !!base64Image, "| canStream:", canStream);
  const t0 = Date.now();

  const payload = { opffProduct };
  if (base64Image) payload.imageBase64 = base64Image;
  if (cacheKey) payload.cacheKey = cacheKey;
  if (scanId) payload.scanId = scanId;
  let nextAttempt = 1;
  let lastStreamingError = null;

  // Streaming path — only when ReadableStream is available
  if (onUpdate && canStream) {
    const streamingAttempts = maxStreamingAttempts(payload);
    for (let attempt = 0; attempt < streamingAttempts; attempt++) {
      try {
        const requestAttempt = nextAttempt++;
        return await _callStreaming({
          mode: "verified",
          payload,
          onUpdate,
          signal,
          attempt: requestAttempt,
        });
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) throw err;
        if (!shouldRetryAnalysisError(err)) throw err;
        lastStreamingError = err;
        if (attempt < streamingAttempts - 1) {
          logger.debug(`[CLAUDE] Streaming attempt ${attempt + 1} failed, retrying:`, err.message);
          continue;
        }
        logger.debug(`[CLAUDE] Streaming failed after ${streamingAttempts} attempt(s):`, err.message);
      }
    }
  }

  if (lastStreamingError && hasImagePayload(payload) && hasCountedScanUsage(lastStreamingError)) {
    throw suppressImageNonStreamingFallback({
      mode: "verified",
      payload,
      error: lastStreamingError,
      attemptedRequestCount: nextAttempt - 1,
    });
  }

  // Non-streaming path — guaranteed complete response
  const controller = new AbortController();
  const elapsed = Date.now() - t0;
  const remainingMs = Math.max(10000, CLIENT_ANALYSIS_TIMEOUT_MS - elapsed);
  const timeout = setTimeout(() => controller.abort(), remainingMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const result = await _callNonStreaming({
      mode: "verified",
      payload,
      signal: controller.signal,
      attempt: nextAttempt,
    });
    logger.debug("[CLAUDE] analyzeWithData result:", result.productName, "| score:", result.overallScore);
    // Deliver complete result to subscriber
    if (onUpdate) onUpdate(result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeHumanFood(base64Image, petType, { onUpdate, signal, scanId } = {}) {
  logger.debug("[CLAUDE] analyzeHumanFood called | petType:", petType, "| canStream:", canStream);
  const t0 = Date.now();

  const payload = { imageBase64: base64Image, petType };
  if (scanId) payload.scanId = scanId;
  let nextAttempt = 1;
  let lastStreamingError = null;

  if (onUpdate && canStream) {
    const streamingAttempts = maxStreamingAttempts(payload);
    for (let attempt = 0; attempt < streamingAttempts; attempt++) {
      try {
        const requestAttempt = nextAttempt++;
        return await _callStreaming({
          mode: "human_food",
          payload,
          onUpdate,
          signal,
          attempt: requestAttempt,
        });
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) throw err;
        if (!shouldRetryAnalysisError(err)) throw err;
        lastStreamingError = err;
        if (attempt < streamingAttempts - 1) {
          logger.debug(`[CLAUDE] Human food streaming attempt ${attempt + 1} failed, retrying:`, err.message);
          continue;
        }
        logger.debug(`[CLAUDE] Human food streaming failed after ${streamingAttempts} attempt(s):`, err.message);
      }
    }
  }

  if (lastStreamingError && hasImagePayload(payload) && hasCountedScanUsage(lastStreamingError)) {
    throw suppressImageNonStreamingFallback({
      mode: "human_food",
      payload,
      error: lastStreamingError,
      attemptedRequestCount: nextAttempt - 1,
    });
  }

  // Non-streaming fallback
  const controller = new AbortController();
  const elapsed = Date.now() - t0;
  const remainingMs = Math.max(10000, CLIENT_ANALYSIS_TIMEOUT_MS - elapsed);
  const timeout = setTimeout(() => controller.abort(), remainingMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const result = await _callNonStreaming({
      mode: "human_food",
      payload,
      signal: controller.signal,
      attempt: nextAttempt,
    });
    logger.debug("[CLAUDE] analyzeHumanFood result:", result.foodName, "| safety:", result.safetyLevel);
    if (onUpdate) onUpdate(result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
