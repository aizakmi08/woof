import { parse as parsePartialJson } from "partial-json";
import { supabase } from "./supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/env";
import { fetch as rnFetch, polyfill } from "react-native-fetch-api";

// Polyfill ReadableStream for production builds
polyfill();

const ANALYZE_URL = `${SUPABASE_URL}/functions/v1/analyze`;

// Use react-native-fetch-api for proper streaming support in production
const streamFetch = rnFetch;
console.log("[CLAUDE] Using react-native-fetch-api for streaming support");

async function _getAuthHeaders() {
  let { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.log("[CLAUDE] Session error:", sessionError.message);
    throw new Error("Authentication error. Please sign out and back in.");
  }

  if (!session) {
    console.log("[CLAUDE] No active session");
    throw new Error("Not authenticated. Please sign in first.");
  }

  const now = Date.now() / 1000;
  const expiresAt = session.expires_at || 0;
  const expiresIn = expiresAt - now;

  console.log(`[CLAUDE] Session check:`, {
    userId: session.user?.id?.slice(0, 8) + '...',
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    expiresIn: Math.round(expiresIn) + 's',
    hasRefreshToken: !!session.refresh_token,
  });

  // ALWAYS refresh if token is expired or will expire within 5 minutes
  if (expiresIn < 300) {
    console.log("[CLAUDE] Token expired or expiring soon, force refreshing...");
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.log("[CLAUDE] Token refresh failed:", refreshError.message);
      // Token is completely dead - force sign out
      console.log("[CLAUDE] Forcing sign out due to dead token");
      await supabase.auth.signOut().catch(() => {});
      throw new Error("Session expired. Please sign in again.");
    }
    if (data.session) {
      session = data.session;
      console.log("[CLAUDE] Token refreshed successfully, new expiry:", new Date(data.session.expires_at * 1000).toISOString());
    } else {
      console.log("[CLAUDE] Refresh returned no session");
      await supabase.auth.signOut().catch(() => {});
      throw new Error("Session expired. Please sign in again.");
    }
  }

  const token = session?.access_token;
  if (!token) {
    console.log("[CLAUDE] No access token in session");
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
function extractTextFromSSE(sseText) {
  let result = "";
  const lines = sseText.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") break;
    try {
      const event = JSON.parse(data);
      if (event.type === "content_block_delta" && event.delta?.text) {
        result += event.delta.text;
      }
    } catch {
      // skip malformed lines
    }
  }
  return result;
}

// Streaming engine — reads SSE chunks and calls onUpdate with partial JSON
async function _callStreaming({ mode, payload, onUpdate, signal }) {
  const t0 = Date.now();
  console.log("[CLAUDE] Stream started");

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const headers = await _getAuthHeaders();

  const response = await streamFetch(ANALYZE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ mode, ...payload, stream: true }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    let message = `Analysis error (${response.status})`;
    try {
      const err = JSON.parse(errBody);
      message = err.error || message;
    } catch {
      message = errBody || message;
    }

    // Log the actual server error for debugging
    console.log(`[CLAUDE] Server error ${response.status}:`, message);

    throw new Error(message);
  }

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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (firstChunk) {
          firstChunk = false;
          console.log(`[TIMER] Claude first chunk: ${Date.now() - t0}ms`);
        }
        const lines = chunk.split("\n");
        const prevLen = accumulated.length;

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);
            if (event.type === "content_block_delta" && event.delta?.text) {
              accumulated += event.delta.text;
            }
          } catch {
            // skip malformed SSE lines
          }
        }

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
      if (remaining) {
        const lines = remaining.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const event = JSON.parse(data);
            if (event.type === "content_block_delta" && event.delta?.text) {
              accumulated += event.delta.text;
            }
          } catch {
            // skip malformed lines
          }
        }
      }
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

  onUpdate(final);
  console.log("[CLAUDE] Stream complete:", final.productName, "| score:", final.overallScore);
  console.log(`[TIMER] Claude stream total: ${Date.now() - t0}ms`);
  return final;
}

// Non-streaming fallback
async function _callNonStreaming({ mode, payload, signal }) {
  console.log("[CLAUDE] Non-streaming call");

  const headers = await _getAuthHeaders();

  const response = await fetch(ANALYZE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ mode, ...payload, stream: false }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    let message = `Analysis error (${response.status})`;
    try {
      const err = JSON.parse(errBody);
      message = err.error || message;
    } catch {
      message = errBody || message;
    }

    // Log the actual server error for debugging
    console.log(`[CLAUDE] Server error ${response.status}:`, message);

    throw new Error(message);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error("No response from Claude.");
  }

  return cleanAndParse(content);
}

export async function analyzeIngredients(base64Image, { onUpdate, signal, cacheKey } = {}) {
  console.log("[CLAUDE] analyzeIngredients called (photo-only mode)");
  const t0 = Date.now();

  const payload = { imageBase64: base64Image };
  if (cacheKey) payload.cacheKey = cacheKey;

  // Streaming path with retry
  if (onUpdate) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await _callStreaming({
          mode: "photo",
          payload,
          onUpdate,
          signal,
        });
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) throw err;
        if (attempt === 0) {
          console.log("[CLAUDE] Streaming attempt 1 failed, retrying:", err.message);
          continue;
        }
        console.log("[CLAUDE] Streaming attempt 2 failed, falling back to non-streaming:", err.message);
      }
    }
  }

  // Non-streaming path (fallback or no onUpdate)
  const controller = new AbortController();
  const elapsed = Date.now() - t0;
  const remainingMs = Math.max(10000, 90000 - elapsed);
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
    });
    console.log("[CLAUDE] analyzeIngredients result:", result.productName, "| score:", result.overallScore);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeWithData(opffProduct, base64Image, { onUpdate, signal, cacheKey } = {}) {
  console.log("[CLAUDE] analyzeWithData called (verified data mode) | product:", opffProduct.productName, "| hasImage:", !!base64Image);
  const t0 = Date.now();

  const payload = { opffProduct };
  if (base64Image) payload.imageBase64 = base64Image;
  if (cacheKey) payload.cacheKey = cacheKey;

  // Streaming path with retry
  if (onUpdate) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await _callStreaming({
          mode: "verified",
          payload,
          onUpdate,
          signal,
        });
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) throw err;
        if (attempt === 0) {
          console.log("[CLAUDE] Streaming attempt 1 failed, retrying:", err.message);
          continue;
        }
        console.log("[CLAUDE] Streaming failed after 2 attempts:", err.message);
      }
    }
  }

  // Non-streaming path (fallback or no onUpdate)
  const controller = new AbortController();
  const elapsed = Date.now() - t0;
  const remainingMs = Math.max(10000, 90000 - elapsed);
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
    });
    console.log("[CLAUDE] analyzeWithData result:", result.productName, "| score:", result.overallScore);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
