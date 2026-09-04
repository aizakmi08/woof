import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

const hostLastFetchAt = new Map();

function cacheKeyFor(url) {
  return crypto.createHash("sha256").update(url, "utf8").digest("hex");
}

function cachePaths(cacheDir, url) {
  const key = cacheKeyFor(url);
  return {
    bodyPath: path.join(cacheDir, `${key}.body`),
    metaPath: path.join(cacheDir, `${key}.json`),
  };
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response?.headers?.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 750 * attempt;
}

async function waitForHostDelay(sourceUrl, fetchDelayMs) {
  const delayMs = Number(fetchDelayMs) || 0;
  if (delayMs <= 0) return;

  let host = "";
  try {
    host = new URL(sourceUrl).host;
  } catch {
    return;
  }
  if (!host) return;

  const now = Date.now();
  const waitMs = Math.max(0, (hostLastFetchAt.get(host) || 0) + delayMs - now);
  if (waitMs > 0) await sleep(waitMs);
  hostLastFetchAt.set(host, Date.now());
}

export async function safeFetchText(url, {
  accept = "text/html,application/xhtml+xml,application/xml,text/xml,text/plain",
  userAgent = "WoofCatalogVerifier/1.0",
  cacheDir = "",
  attempts = 3,
  fetchDelayMs = 0,
  extraHeaders = {},
  returnErrorBody = false,
} = {}) {
  const sourceUrl = compact(url);
  if (!sourceUrl) throw new Error("safeFetchText requires a URL.");

  const cache = cacheDir ? cachePaths(cacheDir, sourceUrl) : null;
  const cachedMeta = cache ? readJsonIfExists(cache.metaPath) : null;
  const headers = {
    "User-Agent": userAgent,
    "Accept": accept,
    ...extraHeaders,
  };
  if (cachedMeta?.etag) headers["If-None-Match"] = cachedMeta.etag;
  if (cachedMeta?.last_modified) headers["If-Modified-Since"] = cachedMeta.last_modified;

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await waitForHostDelay(sourceUrl, fetchDelayMs);
    let response = null;
    try {
      response = await fetch(sourceUrl, { headers });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === attempts) break;
      await sleep(750 * attempt);
      continue;
    }
    if (response.status === 304 && cache && fs.existsSync(cache.bodyPath)) {
      return {
        body: fs.readFileSync(cache.bodyPath, "utf8"),
        finalUrl: cachedMeta.final_url || sourceUrl,
        contentType: cachedMeta.content_type || "",
        fromCache: true,
        status: 304,
      };
    }

    const body = await response.text();
    if (response.ok) {
      if (cache) {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cache.bodyPath, body, "utf8");
        fs.writeFileSync(cache.metaPath, `${JSON.stringify({
          url: sourceUrl,
          final_url: response.url || sourceUrl,
          content_type: response.headers.get("content-type") || "",
          etag: response.headers.get("etag") || "",
          last_modified: response.headers.get("last-modified") || "",
          fetched_at: new Date().toISOString(),
          sha256: crypto.createHash("sha256").update(body, "utf8").digest("hex"),
        }, null, 2)}\n`, "utf8");
      }
      return {
        body,
        finalUrl: response.url || sourceUrl,
        contentType: response.headers.get("content-type") || "",
        fromCache: false,
        status: response.status,
      };
    }

    lastError = new Error(`${sourceUrl}: HTTP ${response.status}`);
    if (returnErrorBody && attempt === attempts) {
      return {
        body,
        finalUrl: response.url || sourceUrl,
        contentType: response.headers.get("content-type") || "",
        fromCache: false,
        status: response.status,
      };
    }
    if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === attempts) break;
    await sleep(retryDelayMs(response, attempt));
  }

  if (cache && fs.existsSync(cache.bodyPath)) {
    return {
      body: fs.readFileSync(cache.bodyPath, "utf8"),
      finalUrl: cachedMeta?.final_url || sourceUrl,
      contentType: cachedMeta?.content_type || "",
      fromCache: true,
      status: cachedMeta ? 200 : 0,
      stale: true,
    };
  }

  throw lastError || new Error(`${sourceUrl}: fetch failed`);
}
