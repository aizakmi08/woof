import { parse as parsePartialJson } from "partial-json";
import { supabase } from "./supabase";
import { SUPABASE_URL } from "../config/env";

const ANALYZE_URL = `${SUPABASE_URL}/functions/v1/analyze`;

// Try expo/fetch for ReadableStream body support, fall back to global fetch
let streamFetch = global.fetch;
try {
  const expoFetch = require("expo/fetch");
  if (expoFetch && expoFetch.fetch) {
    streamFetch = expoFetch.fetch;
    console.log("[CLAUDE] Using expo/fetch for streaming support");
  }
} catch {
  console.log("[CLAUDE] expo/fetch not available, using global fetch");
}

async function _getAuthHeaders() {
  let { data: { session } } = await supabase.auth.getSession();

  // If token is expired or will expire within 60s, refresh proactively
  if (session?.expires_at && Date.now() / 1000 > session.expires_at - 60) {
    console.log("[CLAUDE] Token expired or expiring soon, refreshing...");
    const { data } = await supabase.auth.refreshSession();
    if (data.session) session = data.session;
  }

  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated. Please sign in first.");
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
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
    throw new Error(message);
  }

  console.log(`[TIMER] Claude API response: ${Date.now() - t0}ms`);
  let firstChunk = true;
  let firstParsed = false;
  let accumulated = "";
  let lastUpdateTime = 0;
  const THROTTLE_MS = 100;

  // Try ReadableStream first
  if (response.body && typeof response.body.getReader === "function") {
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
    console.log("[CLAUDE] ReadableStream not available, falling back to text SSE parse");
    const text = await response.text();
    accumulated = extractTextFromSSE(text);
  }

  if (!accumulated) {
    throw new Error("No response from Claude.");
  }

  // Final parse with strict JSON
  const final = cleanAndParse(accumulated);
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

  // Streaming path
  if (onUpdate) {
    try {
      return await _callStreaming({
        mode: "photo",
        payload,
        onUpdate,
        signal,
      });
    } catch (err) {
      if (err.name === "AbortError" || signal?.aborted) throw err;
      console.log("[CLAUDE] Streaming failed, retrying non-streaming:", err.message);
    }
  }

  // Non-streaming path (fallback or no onUpdate)
  const controller = new AbortController();
  const elapsed = Date.now() - t0;
  const remainingMs = Math.max(10000, 60000 - elapsed);
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

  // Streaming path
  if (onUpdate) {
    try {
      return await _callStreaming({
        mode: "verified",
        payload,
        onUpdate,
        signal,
      });
    } catch (err) {
      if (err.name === "AbortError" || signal?.aborted) throw err;
      console.log("[CLAUDE] Streaming failed, retrying non-streaming:", err.message);
    }
  }

  // Non-streaming path (fallback or no onUpdate)
  const controller = new AbortController();
  const elapsed = Date.now() - t0;
  const remainingMs = Math.max(10000, 60000 - elapsed);
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
