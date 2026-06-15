import { parse as parsePartialJson } from "partial-json";
import { supabase } from "./supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/env";
import { reportNetworkError, reportNetworkSuccess } from "./network";

const ANALYZE_URL = `${SUPABASE_URL}/functions/v1/analyze`;
const PRODUCT_LOOKUP_URL = `${SUPABASE_URL}/functions/v1/product-lookup`;

// Detect streaming capability at module load
// expo/fetch provides ReadableStream; without it, streaming SSE gets truncated
let streamFetch = global.fetch;
let canStream = false;
try {
  const expoFetch = require("expo/fetch");
  if (expoFetch?.fetch) {
    streamFetch = expoFetch.fetch;
    canStream = true;
    console.log("[CLAUDE] Streaming enabled (expo/fetch)");
  }
} catch {
  // expo/fetch not available (production builds)
}
if (!canStream) {
  console.log("[CLAUDE] Streaming disabled — will use non-streaming mode for complete responses");
}

// Deduplicate concurrent token refreshes — only one in-flight at a time
let _refreshPromise = null;
const AUTH_HEADER_TIMEOUT_MS = 4000;

const GUEST_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
};

function _authRecoveryError(detail = "Session expired") {
  const err = new Error(`${detail}. Please sign in again to continue.`);
  err.name = "AuthSessionError";
  err.code = "AUTH_SESSION_EXPIRED";
  return err;
}

function _authUnknownError(detail = "Could not confirm your session") {
  const err = new Error(`${detail}. Please check your connection and try again.`);
  err.name = "AuthSessionUnknownError";
  err.code = "AUTH_SESSION_UNKNOWN";
  return err;
}

function _isAuthRecoveryError(err) {
  return err?.code === "AUTH_SESSION_EXPIRED" ||
    err?.code === "AUTH_SESSION_UNKNOWN" ||
    err?.name === "AuthSessionError" ||
    err?.name === "AuthSessionUnknownError";
}

function _abortError() {
  return new DOMException("Aborted", "AbortError");
}

function _throwIfAborted(signal) {
  if (signal?.aborted) throw _abortError();
}

function _withAbort(promise, signal) {
  if (!signal) return promise;
  _throwIfAborted(signal);
  let abortFromParent;
  const abortPromise = new Promise((_, reject) => {
    abortFromParent = () => reject(_abortError());
    signal.addEventListener("abort", abortFromParent, { once: true });
  });
  return Promise.race([
    promise,
    abortPromise,
  ]).finally(() => {
    if (abortFromParent) signal.removeEventListener("abort", abortFromParent);
  });
}

function _withAuthTimeout(promise, signal, label, timeoutMs = AUTH_HEADER_TIMEOUT_MS) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(_authUnknownError(`${label} timed out`));
    }, timeoutMs);
  });

  return _withAbort(Promise.race([promise, timeoutPromise]), signal).finally(() => {
    clearTimeout(timeout);
  });
}

function _startTimedRequest(label, timeoutMs, parentSignal) {
  const controller = new AbortController();
  let didTimeout = false;
  let abortFromParent = null;
  const timeout = setTimeout(() => {
    didTimeout = true;
    console.log(`[CLAUDE] ${label} timeout (${Math.round(timeoutMs / 1000)}s) — aborting`);
    controller.abort();
  }, timeoutMs);

  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timeout);
      throw _abortError();
    }
    abortFromParent = () => controller.abort();
    parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      if (abortFromParent) parentSignal?.removeEventListener("abort", abortFromParent);
    },
    didTimeout: () => didTimeout,
    timeoutError: () => {
      const err = new Error(`${label} timed out. Please try again.`);
      err.name = "TimeoutError";
      err.code = "REQUEST_TIMEOUT";
      return err;
    },
  };
}

function _throwTimeoutIfDeadlineAbort(err, request) {
  if (err?.name === "AbortError" && request?.didTimeout?.()) {
    throw request.timeoutError();
  }
  throw err;
}

function _analysisServerError(message, status) {
  const err = new Error(message);
  err.name = "AnalysisServerError";
  err.status = status;
  err.retryable = status >= 500;
  err.code = err.retryable ? "ANALYSIS_SERVER_ERROR" : "ANALYSIS_CLIENT_ERROR";
  return err;
}

async function _analysisErrorFromResponse(response) {
  const errBody = await response.text().catch(() => "");
  let message = `Analysis error (${response.status})`;
  try {
    const err = JSON.parse(errBody);
    message = err.error || message;
  } catch {
    message = errBody || message;
  }
  console.log(`[CLAUDE] Server error ${response.status}:`, message);
  return _analysisServerError(message, response.status);
}

function _isNonRetryableAnalysisError(err) {
  if (!err) return false;
  const status = Number(err.status);
  if (Number.isFinite(status) && status >= 400 && status < 500) return true;
  if (err.code === "ANALYSIS_CLIENT_ERROR") return true;
  if (err?.name === "AnalysisServerError" && err.retryable === false) return true;
  const message = String(err.message || "");
  return /free scan limit|daily free safety check|upgrade to pro|quota|unauthorized|forbidden|session expired/i.test(message);
}

const PET_CATEGORY_NAMES_V2 = [
  "Protein Quality",
  "Processing Method",
  "Ingredient Safety",
  "Nutritional Balance",
  "Filler Content",
  "Manufacturer Track Record",
  "Additives & Preservatives",
];

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function petFoodValidationError(obj) {
  if (!obj || typeof obj !== "object" || obj.error) {
    return "missing analysis object";
  }
  if (!hasText(obj.productName)) return "missing productName";
  if (!["dog", "cat"].includes(obj.petType)) return "missing petType";

  const score = Number(obj.overallScore);
  if (!Number.isFinite(score) || score < 1 || score > 100) {
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

  if (!Array.isArray(obj.categories) || obj.categories.length !== PET_CATEGORY_NAMES_V2.length) {
    return "missing categories";
  }
  const categoryNames = new Set(
    obj.categories
      .filter((category) =>
        category &&
        typeof category === "object" &&
        hasText(category.name) &&
        Number.isFinite(Number(category.score)) &&
        Number(category.score) >= 1 &&
        Number(category.score) <= 100 &&
        hasText(category.detail)
      )
      .map((category) => category.name)
  );
  if (!PET_CATEGORY_NAMES_V2.every((name) => categoryNames.has(name))) {
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

function completionValidationError(mode, obj) {
  if (!obj || typeof obj !== "object" || obj.error) {
    return "missing analysis object";
  }

  if (mode === "human_food") {
    const safetyLevels = new Set(["safe", "caution", "dangerous"]);
    if (typeof obj.foodName !== "string" || obj.foodName.trim().length === 0) {
      return "missing foodName";
    }
    if (!safetyLevels.has(obj.safetyLevel)) {
      return "missing safetyLevel";
    }
    return null;
  }

  return petFoodValidationError(obj);
}

async function _getAuthHeaders(signal, { timeoutMs = AUTH_HEADER_TIMEOUT_MS } = {}) {
  let { data: { session }, error: sessionError } = await _withAuthTimeout(
    supabase.auth.getSession(),
    signal,
    "Session check",
    timeoutMs,
  );

  if (sessionError) {
    console.log("[CLAUDE] Session error:", sessionError.message);
    throw _authRecoveryError("Session expired");
  }

  if (!session) {
    console.log("[CLAUDE] No session — using guest mode");
    return GUEST_HEADERS;
  }

  const expiresIn = (session.expires_at || 0) - Date.now() / 1000;

  // Refresh if token expires within 5 minutes
  if (expiresIn < 300) {
    // Deduplicate: reuse in-flight refresh if one is already running
    if (!_refreshPromise) {
      _refreshPromise = supabase.auth.refreshSession().finally(() => {
        _refreshPromise = null;
      });
    }
    const { data, error: refreshError } = await _withAuthTimeout(
      _refreshPromise,
      signal,
      "Session refresh",
      timeoutMs,
    );

    if (refreshError || !data?.session) {
      console.log("[CLAUDE] Token refresh failed:", refreshError?.message || "no session");
      await supabase.auth.signOut().catch(() => {});
      throw _authRecoveryError("Session expired");
    }
    session = data.session;
    console.log("[CLAUDE] Token refreshed");
  }

  const token = session?.access_token;
  if (!token) {
    await supabase.auth.signOut().catch(() => {});
    throw _authRecoveryError("Session expired");
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

// Split a raw ingredient text into ordered ingredient names, respecting parentheses.
// Used to augment Claude's output with ingredients it skipped (e.g. mid-list vitamins).
// Same plausibility filter the cache layer uses — if scraped junk somehow leaks
// into a sourceText, this stops the augmenter from manufacturing fake ingredients
// out of JSON tokens, URLs, or page chrome.
function _isPlausibleIngredientToken(s) {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 2 || t.length > 200) return false;
  if (/[\\{}]/.test(t)) return false;
  if (/^[\["']/.test(t)) return false;
  if (/:\s*"/.test(t)) return false;
  if (/\bmailto:|https?:\/\//i.test(t)) return false;
  if (/\b(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName)\b/i.test(t)) return false;
  if ((t.match(/[a-zA-Z]/g) || []).length < 2) return false;
  return true;
}

function splitIngredientText(text) {
  if (!text || typeof text !== "string") return [];
  // Whole-text rejection: if the source is obviously scraped page chrome, return
  // an empty list rather than producing dozens of junk "ingredients".
  if (/\\"|legalLinks|reportAbuseLink|siteSettings|mailto:/i.test(text)) return [];

  const tokens = [];
  let depth = 0, buf = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if ((ch === "," || ch === ";") && depth === 0) {
      const t = buf.trim().replace(/\.$/, "");
      if (t) tokens.push(t);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const last = buf.trim().replace(/\.$/, "");
  if (last) tokens.push(last);
  return tokens.filter(_isPlausibleIngredientToken);
}

function _normIng(s) {
  return String(s || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Categorize a missing ingredient by name keywords so the augmented entry is at
// least useful to the UI without re-calling Claude.
function _guessCategory(name) {
  const n = _normIng(name);
  if (/vitamin|biotin|niacin|riboflavin|thiamine|pyridoxine|folic|tocopherol|ascorb|choline|menadione/.test(n)) return "vitamin";
  if (/zinc|iron|copper|selenite|manganese|calcium|potassium|sodium|chloride|sulfate|proteinate|mineral|iodate|magnesium|phosph/.test(n)) return "mineral";
  if (/preservative|bha|bht|ethoxyquin|tocopherol|rosemary extract|citric acid/.test(n)) return "preservative";
  if (/oil|fat|tallow|lard/.test(n)) return "fat";
  if (/fiber|beet pulp|cellulose|psyllium|inulin|fos|chicory/.test(n)) return "fiber";
  if (/chicken|beef|lamb|turkey|fish|salmon|duck|venison|pork|liver|meal|protein|egg|meat/.test(n)) return "protein";
  if (/rice|corn|wheat|barley|oat|sorghum|millet|potato|tapioca|quinoa|peas|legume/.test(n)) return "carb";
  return "other";
}

// Conservative default rating for unrated/missing ingredients. Anything matching
// known-bad markers is flagged; everything else is neutral so we never silently
// upgrade a sketchy ingredient that Claude skipped.
function _defaultRating(name) {
  const n = _normIng(name);
  if (/bha|bht|ethoxyquin|propylene glycol|menadione|artificial color|red 40|yellow 5|blue 2|fd&c/.test(n)) return "bad";
  if (/by[- ]?product|meat and bone meal|animal digest|corn syrup|sugar/.test(n)) return "neutral";
  return "neutral";
}

// Merge Claude's `analysis.ingredients[]` with a canonical ingredient list parsed
// from the verified source text. Ensures EVERY ingredient on the label appears
// in the result, in the original label order. Claude's annotations are preserved
// for matched items; gaps are filled with sensible defaults.
export function augmentIngredients(analysis, sourceText) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const canonical = splitIngredientText(sourceText);
  if (canonical.length === 0) return analysis;

  const claudeList = Array.isArray(analysis.ingredients) ? analysis.ingredients : [];
  // Build a lookup of Claude's annotations by normalized name (and by first significant token)
  const byNorm = new Map();
  const byHead = new Map();
  for (const c of claudeList) {
    if (!c || typeof c !== "object" || !c.name) continue;
    const n = _normIng(c.name);
    if (!n) continue;
    byNorm.set(n, c);
    const head = n.split(" ")[0];
    if (head && !byHead.has(head)) byHead.set(head, c);
  }

  const merged = canonical.map((rawName) => {
    const n = _normIng(rawName);
    let match = byNorm.get(n);
    if (!match) {
      // Try fuzzy: any claude entry whose normalized name is contained in / contains this one
      for (const c of claudeList) {
        const cn = _normIng(c?.name);
        if (!cn) continue;
        if (cn === n || cn.includes(n) || n.includes(cn)) { match = c; break; }
      }
    }
    if (!match) {
      const head = n.split(" ")[0];
      if (head) match = byHead.get(head);
    }
    if (match) {
      return {
        ...match,
        name: rawName, // prefer canonical label spelling
      };
    }
    // Synthesize a minimal entry for ingredients Claude omitted.
    return {
      name: rawName,
      category: _guessCategory(rawName),
      rating: _defaultRating(rawName),
      reason: "Standard supplement / additive.",
    };
  });

  // If Claude returned EXTRA ingredients not in the canonical list (rare), append them.
  const mergedKeys = new Set(merged.map((m) => _normIng(m.name)));
  for (const c of claudeList) {
    const cn = _normIng(c?.name);
    if (cn && !mergedKeys.has(cn)) merged.push(c);
  }

  const before = claudeList.length, after = merged.length;
  // Streaming fires this dozens of times — only log when the gap changes meaningfully
  // (first fill, and every 10-ingredient milestone). Keeps Metro readable.
  const gap = after - before;
  if (gap > 0) {
    const milestone = `${before}->${after}`;
    if (_lastAugmentLog !== milestone && (before === 0 || before % 10 === 0 || gap > 5)) {
      console.log(`[AUGMENT] Ingredients: ${before} → ${after} (filled ${gap} from source label)`);
      _lastAugmentLog = milestone;
    }
  }
  return { ...analysis, ingredients: merged };
}

let _lastAugmentLog = null;

function _consumeSseRecord(record, onText) {
  const dataLines = [];
  for (const rawLine of record.split(/\r?\n/)) {
    if (!rawLine.startsWith("data:")) continue;
    dataLines.push(rawLine.slice(5).replace(/^ /, ""));
  }

  if (dataLines.length === 0) return false;

  const data = dataLines.join("\n");
  if (data === "[DONE]") return true;

  try {
    const event = JSON.parse(data);
    if (event.type === "content_block_delta" && event.delta?.text) {
      onText(event.delta.text);
    }
  } catch {
    // Skip malformed complete events; incomplete events stay buffered until EOF.
  }

  return false;
}

function _consumeSseText(input, state, onText, { flush = false } = {}) {
  state.buffer += input;
  const records = state.buffer.split(/\r?\n\r?\n/);
  state.buffer = records.pop() ?? "";

  for (const record of records) {
    if (_consumeSseRecord(record, onText)) state.done = true;
  }

  if (flush && state.buffer.trim()) {
    if (_consumeSseRecord(state.buffer, onText)) state.done = true;
    state.buffer = "";
  }
}

// Extract text content from SSE text blob (fallback when ReadableStream not available)
function extractTextFromSSE(sseText) {
  let result = "";
  const state = { buffer: "", done: false };
  _consumeSseText(sseText, state, (text) => {
    result += text;
  }, { flush: true });
  return result;
}

// Streaming engine — reads SSE chunks and calls onUpdate with partial JSON
async function _callStreaming({ mode, payload, onUpdate, signal }) {
  const t0 = Date.now();
  console.log("[CLAUDE] Stream started");

  const call = _startTimedRequest("Stream response", 30000, signal);

  let response;
  try {
    const headers = await _getAuthHeaders(call.signal);
    response = await streamFetch(ANALYZE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ mode, ...payload, stream: true }),
      signal: call.signal,
    });
  } catch (err) {
    call.cleanup();
    const reported = err?.name === "AbortError" && call.didTimeout() ? call.timeoutError() : err;
    if (reported?.name !== "AbortError") reportNetworkError(reported);
    _throwTimeoutIfDeadlineAbort(err, call);
  }

  try {
    if (!response.ok) {
      const err = await _analysisErrorFromResponse(response);
      reportNetworkError(err);
      throw err;
    }
    reportNetworkSuccess();

    console.log(`[TIMER] Claude API response: ${Date.now() - t0}ms`);

    // Verify streaming support
    const hasReadableStream = response.body && typeof response.body.getReader === "function";
    console.log(`[CLAUDE] ReadableStream available: ${hasReadableStream}`);

    let firstChunk = true;
    let firstParsed = false;
    let accumulated = "";
    let lastUpdateTime = 0;
    const THROTTLE_MS = 100;

    // Try ReadableStream first
    if (hasReadableStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const sseState = { buffer: "", done: false };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          if (firstChunk) {
            firstChunk = false;
            console.log(`[TIMER] Claude first chunk: ${Date.now() - t0}ms`);
          }
          const prevLen = accumulated.length;
          _consumeSseText(chunk, sseState, (text) => {
            accumulated += text;
          });

          if (prevLen === 0 && accumulated.length > 0) {
            console.log(`[CLAUDE] Stream starts with: ${JSON.stringify(accumulated.slice(0, 80))}`);
          }

          // Throttled partial JSON parse
          const now = Date.now();
          if (now - lastUpdateTime >= THROTTLE_MS && accumulated.length > 0) {
            lastUpdateTime = now;
            try {
              let textToParse = accumulated.trimStart();
              if (textToParse.startsWith("```")) {
                textToParse = textToParse.replace(/^```(?:json)?\s*\n?/, "");
              }
              const partial = parsePartialJson(textToParse);
              if (partial && typeof partial === "object") {
                if (!firstParsed) {
                  firstParsed = true;
                  console.log(`[TIMER] Claude first parsed JSON: ${Date.now() - t0}ms`);
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
        _consumeSseText(remaining, sseState, (text) => {
          accumulated += text;
        }, { flush: true });
      } finally {
        reader.releaseLock();
      }
    } else {
      // Fallback: read entire response as text and extract SSE
      console.log("[CLAUDE] ⚠️ ReadableStream not available, falling back to text SSE parse (slower, waits for full response)");
      const text = await response.text();
      accumulated = extractTextFromSSE(text);
      console.log(`[CLAUDE] Fallback text response length: ${text.length} chars, extracted: ${accumulated.length} chars`);
    }

    if (!accumulated) {
      throw new Error("No response from Claude.");
    }

    // Final parse — try strict JSON first, fall back to partial JSON if incomplete
    let final;
    try {
      final = cleanAndParse(accumulated);
    } catch (err) {
      console.log("[CLAUDE] Final parse failed (incomplete stream?), using partial JSON:", err.message);
      // Strip markdown and try partial parse
      let textToParse = accumulated.trim();
      if (textToParse.startsWith("```")) {
        textToParse = textToParse.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }
      try {
        final = parsePartialJson(textToParse);
      } catch (partialErr) {
        // If even partial parse fails, throw original error
        throw new Error(`Failed to parse Claude response: ${err.message}`);
      }
    }

    if (!final || typeof final !== "object") {
      throw new Error("Invalid response format from Claude.");
    }

    const validationError = completionValidationError(mode, final);
    if (validationError) {
      throw new Error(`Incomplete Claude stream: ${validationError}`);
    }

    onUpdate(final);
    console.log("[CLAUDE] Stream complete:", final.productName, "| score:", final.overallScore);
    console.log(`[TIMER] Claude stream total: ${Date.now() - t0}ms`);
    return final;
  } catch (err) {
    _throwTimeoutIfDeadlineAbort(err, call);
  } finally {
    call.cleanup();
  }
}

// Non-streaming fallback
async function _callNonStreaming({ mode, payload, signal }) {
  console.log("[CLAUDE] Non-streaming call");

  const headers = await _getAuthHeaders(signal);

  const response = await fetch(ANALYZE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ mode, ...payload, stream: false }),
    signal,
  });

  if (!response.ok) {
    throw await _analysisErrorFromResponse(response);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error("No response from Claude.");
  }

  const parsed = cleanAndParse(content);
  const validationError = completionValidationError(mode, parsed);
  if (validationError) {
    throw new Error(`Incomplete Claude response: ${validationError}`);
  }
  return parsed;
}

export async function analyzeIngredients(base64Image, { onUpdate, signal, cacheKey, clientProStatus = false } = {}) {
  console.log("[CLAUDE] analyzeIngredients called (photo-only mode) | canStream:", canStream);
  const t0 = Date.now();

  const payload = { imageBase64: base64Image, serverQuotaAccounting: true };
  if (cacheKey) payload.cacheKey = cacheKey;
  if (clientProStatus === true) payload.clientProStatus = true;

  // Streaming path — only when ReadableStream is available
  if (onUpdate && canStream) {
    try {
      return await _callStreaming({
        mode: "photo",
        payload,
        onUpdate,
        signal,
      });
    } catch (err) {
      if (_isNonRetryableAnalysisError(err)) throw err;
      if (err.name === "AbortError" || signal?.aborted) throw err;
      if (err.code === "REQUEST_TIMEOUT") throw err;
      console.log("[CLAUDE] Streaming failed, falling back to non-streaming:", err.message);
    }
  }

  // Non-streaming path — guaranteed complete response.
  // Keep fallback bounded so failed streaming does not turn scans into a 2-minute wait.
  const request = _startTimedRequest("Photo analysis", 60000, signal);

  try {
    const result = await _callNonStreaming({
      mode: "photo",
      payload,
      signal: request.signal,
    });
    console.log("[CLAUDE] analyzeIngredients result:", result.productName, "| score:", result.overallScore);
    // Deliver complete result to subscriber
    if (onUpdate) onUpdate(result);
    return result;
  } catch (err) {
    const reported = err?.name === "AbortError" && request.didTimeout() ? request.timeoutError() : err;
    if (reported?.name !== "AbortError") reportNetworkError(reported);
    _throwTimeoutIfDeadlineAbort(err, request);
  } finally {
    request.cleanup();
  }
}

export async function analyzeWithData(opffProduct, base64Image, { onUpdate, signal, cacheKey, lookupType, cacheAliases, clientProStatus = false } = {}) {
  console.log("[CLAUDE] analyzeWithData called (verified data mode) | product:", opffProduct.productName, "| hasImage:", !!base64Image, "| canStream:", canStream);

  const payload = { opffProduct, serverQuotaAccounting: true };
  if (base64Image) payload.imageBase64 = base64Image;
  if (cacheKey) payload.cacheKey = cacheKey;
  if (lookupType) payload.lookupType = lookupType;
  if (Array.isArray(cacheAliases) && cacheAliases.length > 0) payload.cacheAliases = cacheAliases;
  if (clientProStatus === true) payload.clientProStatus = true;

  // Wrap onUpdate so streaming partial results are augmented in real time —
  // user sees the full ingredient list even if Claude is still mid-stream.
  const sourceText = opffProduct?.ingredientsText || "";
  const wrapUpdate = onUpdate
    ? (partial) => onUpdate(augmentIngredients(partial, sourceText))
    : undefined;

  // Streaming path — only when ReadableStream is available
  if (onUpdate && canStream) {
    try {
      const result = await _callStreaming({
        mode: "verified",
        payload,
        onUpdate: wrapUpdate,
        signal,
      });
      return augmentIngredients(result, sourceText);
    } catch (err) {
      if (_isNonRetryableAnalysisError(err)) throw err;
      if (err.name === "AbortError" || signal?.aborted) throw err;
      if (err.code === "REQUEST_TIMEOUT") throw err;
      console.log("[CLAUDE] Streaming failed, falling back to non-streaming:", err.message);
    }
  }

  // Non-streaming path — guaranteed complete response.
  // Keep fallback bounded so failed streaming does not turn scans into a 2-minute wait.
  const request = _startTimedRequest("Verified analysis", 60000, signal);

  try {
    const raw = await _callNonStreaming({
      mode: "verified",
      payload,
      signal: request.signal,
    });
    const result = augmentIngredients(raw, sourceText);
    console.log("[CLAUDE] analyzeWithData result:", result.productName, "| score:", result.overallScore, "| ingredients:", result.ingredients?.length);
    if (onUpdate) onUpdate(result);
    return result;
  } catch (err) {
    const reported = err?.name === "AbortError" && request.didTimeout() ? request.timeoutError() : err;
    if (reported?.name !== "AbortError") reportNetworkError(reported);
    _throwTimeoutIfDeadlineAbort(err, request);
  } finally {
    request.cleanup();
  }
}

/**
 * Analyze whether a human food is safe for a pet.
 * Accepts either a base64 photo OR a text foodName. petType required.
 */
export async function analyzeHumanFood(input, petType, { onUpdate, signal, clientProStatus = false } = {}) {
  // Backwards compatible: input can be a base64 string (photo path) or
  // an object { foodName } (text path).
  const isTextInput = typeof input === "object" && input !== null && typeof input.foodName === "string";
  const payload = isTextInput
    ? { foodName: input.foodName.trim(), petType, serverQuotaAccounting: true }
    : { imageBase64: input, petType, serverQuotaAccounting: true };
  if (clientProStatus === true) payload.clientProStatus = true;

  console.log("[CLAUDE] analyzeHumanFood called | petType:", petType, "|", isTextInput ? `text: "${payload.foodName}"` : "photo", "| canStream:", canStream);

  if (onUpdate && canStream) {
    try {
      return await _callStreaming({
        mode: "human_food",
        payload,
        onUpdate,
        signal,
      });
    } catch (err) {
      if (_isNonRetryableAnalysisError(err)) throw err;
      if (err.name === "AbortError" || signal?.aborted) throw err;
      if (err.code === "REQUEST_TIMEOUT") throw err;
      console.log("[CLAUDE] Human food streaming failed, falling back to non-streaming:", err.message);
    }
  }

  // Non-streaming fallback — bounded for quick retry on bad store connections.
  const request = _startTimedRequest("Human food analysis", 45000, signal);

  try {
    const result = await _callNonStreaming({
      mode: "human_food",
      payload,
      signal: request.signal,
    });
    console.log("[CLAUDE] analyzeHumanFood result:", result.foodName, "| safety:", result.safetyLevel);
    if (onUpdate) onUpdate(result);
    return result;
  } catch (err) {
    const reported = err?.name === "AbortError" && request.didTimeout() ? request.timeoutError() : err;
    if (reported?.name !== "AbortError") reportNetworkError(reported);
    _throwTimeoutIfDeadlineAbort(err, request);
  } finally {
    request.cleanup();
  }
}

/**
 * Stage 1 of photo flow: Identify the product from packaging photo.
 * Fast, non-streaming call — returns identification JSON.
 */
export async function identifyProduct(base64Image, { signal } = {}) {
  console.log("[CLAUDE] identifyProduct called");
  const t0 = Date.now();

  const request = _startTimedRequest("identifyProduct", 15000, signal);

  try {
    const headers = await _getAuthHeaders(request.signal);
    const response = await fetch(ANALYZE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "identify",
        imageBase64: base64Image,
        stream: false,
      }),
      signal: request.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      let message = `Identification failed (${response.status})`;
      try {
        const err = JSON.parse(errBody);
        message = err.error || message;
      } catch {}
      throw new Error(message);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      throw new Error("No identification response from Claude.");
    }

    const result = cleanAndParse(content);
    console.log(`[CLAUDE] identifyProduct result:`, result?.identified ? result.productName : "not identified", `(${Date.now() - t0}ms)`);
    return result;
  } catch (err) {
    _throwTimeoutIfDeadlineAbort(err, request);
  } finally {
    request.cleanup();
  }
}

/**
 * OCR ingredient label photo — reads real ingredients from a label image.
 * Uses Claude via Edge Function with strict anti-hallucination prompt.
 */
export async function ocrIngredients(base64Image, productName, { signal } = {}) {
  console.log("[CLAUDE] ocrIngredients called for:", productName);
  const t0 = Date.now();

  const request = _startTimedRequest("ocrIngredients", 20000, signal);

  try {
    const headers = await _getAuthHeaders(request.signal);
    const response = await fetch(ANALYZE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "ocr_ingredients",
        imageBase64: base64Image,
        productName,
        stream: false,
      }),
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`OCR failed (${response.status})`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) return { success: false, reason: "No response" };

    const result = cleanAndParse(content);
    const elapsed = Date.now() - t0;
    console.log(`[CLAUDE] ocrIngredients: ${result?.success ? result.ingredientCount + " ingredients" : "failed"} (${elapsed}ms)`);
    return result || { success: false, reason: "Parse error" };
  } catch (err) {
    if (_isAuthRecoveryError(err)) throw err;
    if (err?.name === "AbortError" && request.didTimeout()) {
      const timeoutErr = request.timeoutError();
      console.log("[CLAUDE] ocrIngredients timeout:", timeoutErr.message);
      return { success: false, reason: timeoutErr.message, code: timeoutErr.code };
    }
    console.log("[CLAUDE] ocrIngredients error:", err.message);
    return { success: false, reason: err.message };
  } finally {
    request.cleanup();
  }
}

/**
 * Look up ingredients via GPT-4o-mini knowledge.
 * Fast (~2s), accurate for well-known brands, no scraping needed.
 */
export async function lookupIngredients(productName, { signal, timeoutMs = 12000 } = {}) {
  console.log("[CLAUDE] lookupIngredients called:", productName);
  const t0 = Date.now();

  const request = _startTimedRequest("lookupIngredients", timeoutMs, signal);

  try {
    const headers = await _getAuthHeaders(request.signal);
    const response = await fetch(ANALYZE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "ingredients_lookup",
        productName,
        stream: false,
      }),
      signal: request.signal,
    });

    if (!response.ok) {
      console.log("[CLAUDE] lookupIngredients HTTP error:", response.status);
      return { found: false };
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) return { found: false };

    const result = cleanAndParse(content);
    const elapsed = Date.now() - t0;

    if (result?.found && result?.ingredients) {
      // Parse comma-separated string into array
      const ingredientList = typeof result.ingredients === "string"
        ? result.ingredients.split(",").map(i => i.trim()).filter(i => i.length > 0)
        : result.ingredients;

      console.log(`[CLAUDE] lookupIngredients: ${ingredientList.length} ingredients (${elapsed}ms) confidence: ${result.confidence}`);
      return {
        found: true,
        source: "gpt",
        ingredients: ingredientList,
        ingredientText: typeof result.ingredients === "string" ? result.ingredients : ingredientList.join(", "),
        ingredientCount: ingredientList.length,
        confidence: result.confidence || 0.9,
      };
    }

    console.log(`[CLAUDE] lookupIngredients: not found (${elapsed}ms)`);
    return { found: false };
  } catch (err) {
    if (_isAuthRecoveryError(err)) throw err;
    console.log("[CLAUDE] lookupIngredients error:", err.message);
    if (err?.name === "AbortError" && request.didTimeout()) {
      return { found: false, error: request.timeoutError().message, code: "REQUEST_TIMEOUT" };
    }
    return { found: false };
  } finally {
    request.cleanup();
  }
}

/**
 * Stage 2 of photo flow: Look up verified product data via web scraping.
 * Calls the product-lookup edge function.
 */
export async function lookupProduct(productName, brand, searchTerms, { signal } = {}) {
  console.log("[CLAUDE] lookupProduct called:", productName, "| brand:", brand);
  const t0 = Date.now();

  const request = _startTimedRequest("lookupProduct", 25000, signal);

  try {
    const headers = await _getAuthHeaders(request.signal);
    let response;
    try {
      response = await fetch(PRODUCT_LOOKUP_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ productName, brand, searchTerms }),
        signal: request.signal,
      });
      reportNetworkSuccess();
    } catch (err) {
      const reported = err?.name === "AbortError" && request.didTimeout() ? request.timeoutError() : err;
      if (reported?.name !== "AbortError") reportNetworkError(reported);
      _throwTimeoutIfDeadlineAbort(err, request);
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      let message = `Product lookup failed (${response.status})`;
      try {
        const err = JSON.parse(errBody);
        message = err.error || message;
      } catch {}
      throw new Error(message);
    }

    const result = await response.json();
    console.log(`[CLAUDE] lookupProduct result:`, result.found ? `${result.source} (${result.ingredientCount} ingredients)` : "not found", `(${Date.now() - t0}ms)`);
    return result;
  } catch (err) {
    _throwTimeoutIfDeadlineAbort(err, request);
  } finally {
    request.cleanup();
  }
}
