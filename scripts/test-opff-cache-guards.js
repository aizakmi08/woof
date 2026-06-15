#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const opffSource = fs.readFileSync(path.join(root, "services/opff.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`OPFF cache guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  opffSource.includes("const CACHE_HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000") &&
    opffSource.includes("const CACHE_MISS_TTL_MS = 6 * 60 * 60 * 1000"),
  "OPFF cache must keep long hit TTLs and short miss TTLs"
);

assert(
  /function _cacheTtlForValue\(value\)[\s\S]{0,90}value\?\.found === false \? CACHE_MISS_TTL_MS : CACHE_HIT_TTL_MS/.test(opffSource),
  "OPFF cache TTL must be chosen from the cached lookup result"
);

assert(
  /function _normalizeCachedValue\(value\)[\s\S]{0,160}value\.found === true[\s\S]{0,120}value\.product && typeof value\.product === "object"[\s\S]{0,160}value\.found === false[\s\S]{0,120}reason: value\.reason \|\| "not_found"/.test(opffSource),
  "OPFF cache reads must reject malformed cached hits and stamp legacy misses with not_found"
);

assert(
  /const ttlMs = parsed\?\.ttlMs \|\| _cacheTtlForValue\(parsed\?\.value\)/.test(opffSource) &&
    /Date\.now\(\) - parsed\.savedAt > ttlMs/.test(opffSource),
  "OPFF cache reads must honor per-entry TTLs and age legacy misses under the new miss TTL"
);

assert(
  /if \(_memCache\.has\(key\)\)[\s\S]{0,260}Date\.now\(\) - entry\.savedAt <= ttlMs[\s\S]{0,180}_normalizeCachedValue\(entry\.value\)[\s\S]{0,160}return normalized[\s\S]{0,120}_memCache\.delete\(key\)/.test(opffSource) &&
    /const normalized = _normalizeCachedValue\(parsed\.value\)[\s\S]{0,120}AsyncStorage\.removeItem\(CACHE_PREFIX \+ key\)[\s\S]{0,160}_memCache\.set\(key, \{ savedAt: parsed\.savedAt, ttlMs, value: normalized \}\)/.test(opffSource),
  "OPFF in-memory cache mirror must honor the same per-entry TTLs"
);

assert(
  opffSource.includes("const _inflightLookups = new Map()") &&
    opffSource.includes("async function _awaitInflightLookup(key, { signal, label } = {})") &&
    opffSource.includes("signal.addEventListener?.(\"abort\", abortHandler, { once: true })") &&
    opffSource.includes("return { found: false, aborted: true }") &&
    opffSource.includes("function _rememberInflightLookup(key, promise)") &&
    opffSource.includes("_inflightLookups.get(key) === promise") &&
    /const inflight = await _awaitInflightLookup\(cacheKey, \{ signal, label: "lookupBarcode" \}\);[\s\S]{0,120}if \(inflight\) return inflight;[\s\S]{0,120}if \(signal\?\.aborted\)/.test(opffSource) &&
    /const lookupPromise = _rememberInflightLookup\(cacheKey, \(async \(\) => \{[\s\S]{0,120}const request = _startOpffRequest\(4000, signal\)/.test(opffSource) &&
    /return _awaitInflightLookup\(cacheKey, \{ signal, label: "lookupBarcode" \}\) \|\| lookupPromise;/.test(opffSource),
  "OPFF barcode lookups must coalesce same-barcode in-flight requests while letting aborted callers return without cancelling the shared lookup"
);

assert(
  /const savedAt = Date\.now\(\)/.test(opffSource) &&
    /const ttlMs = _cacheTtlForValue\(value\)/.test(opffSource) &&
    /_memCache\.set\(key, \{ savedAt, ttlMs, value \}\)/.test(opffSource) &&
    /JSON\.stringify\(\{ savedAt, ttlMs, value \}\)/.test(opffSource),
  "OPFF cache writes must persist each entry TTL"
);

assert(
  /if \(response\.status === 404\) await _writeCache\(cacheKey, result\)/.test(opffSource) &&
    /lookupBarcode[\s\S]{0,1900}!data\.product \|\| data\.status === 0[\s\S]{0,120}reason: "not_found"[\s\S]{0,120}await _writeCache\(cacheKey, result\)/.test(opffSource) &&
    /searchByName[\s\S]{0,1800}!data\.products \|\| data\.products\.length === 0[\s\S]{0,120}reason: "not_found"[\s\S]{0,120}await _writeCache\(cacheKey, result\)/.test(opffSource),
  "real OPFF misses should still be cached briefly to avoid immediate repeat requests"
);

assert(
  opffSource.includes('reason: response.status === 404 ? "not_found" : "lookup_error"') &&
    /if \(err\.name === "AbortError" && request\.didTimeout\(\)\) \{[\s\S]{0,120}return \{ found: false, reason: "timeout" \}/.test(opffSource) &&
    /return \{ found: false, reason: "lookup_error" \}/.test(opffSource) &&
    !/await _writeCache\(cacheKey, \{ found: false, reason: "lookup_error" \}\)/.test(opffSource),
  "transient OPFF failures must return retryable reasons and must not be cached as catalog misses"
);

assert(
    opffSource.includes("function _startOpffRequest(timeoutMs, parentSignal)") &&
    opffSource.includes("const onParentAbort = () => controller.abort()") &&
    opffSource.includes('parentSignal?.addEventListener?.("abort", onParentAbort, { once: true })') &&
    opffSource.includes('parentSignal?.removeEventListener?.("abort", onParentAbort)') &&
    /export async function lookupBarcode\(barcode, \{ signal \} = \{\}\)/.test(opffSource) &&
    /export async function searchByName\(name, \{ signal \} = \{\}\)/.test(opffSource) &&
    /fetch\(url, \{[\s\S]{0,120}signal: request\.signal/.test(opffSource) &&
    /if \(signal\?\.aborted\)[\s\S]{0,120}return \{ found: false, aborted: true \}/.test(opffSource),
  "OPFF network requests must be bounded and linked to the caller abort signal"
);

assert(
  /if \(err\.name === "AbortError" && request\.didTimeout\(\)\)[\s\S]{0,180}return \{ found: false, reason: "timeout" \};[\s\S]{0,180}if \(err\.name === "AbortError" && signal\?\.aborted\)[\s\S]{0,140}return \{ found: false, aborted: true \};[\s\S]{0,120}reportNetworkError\(err\)/.test(opffSource),
  "caller-cancelled OPFF barcode requests must return aborted without being reported as network failures"
);

assert(
  !/const CACHE_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000/.test(opffSource),
  "OPFF cache must not use one seven-day TTL for every value"
);

assert(
  packageJson.includes('"test:opff-cache": "node scripts/test-opff-cache-guards.js"') &&
    packageJson.includes("npm run test:opff-cache"),
  "OPFF cache guard must be wired into package scripts"
);

console.log("OPFF cache guard passed");
