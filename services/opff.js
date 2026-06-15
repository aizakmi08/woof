import AsyncStorage from "@react-native-async-storage/async-storage";
import { reportNetworkError, reportNetworkSuccess } from "./network";

const OPFF_BASE = "https://world.openpetfoodfacts.org";

// Local cache — successful OPFF matches are stable, but catalog misses can be
// caused by newly released or recently added products. Keep misses short-lived
// so store scans do not get stuck behind stale "known miss" entries.
const CACHE_PREFIX = "@woof_opff_";
const CACHE_HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MISS_TTL_MS = 6 * 60 * 60 * 1000;
// In-memory mirror so back-to-back scans within a session skip even AsyncStorage.
const _memCache = new Map();
const _inflightLookups = new Map();

function _cacheTtlForValue(value) {
  return value?.found === false ? CACHE_MISS_TTL_MS : CACHE_HIT_TTL_MS;
}

function _normalizeCachedValue(value) {
  if (!value || typeof value !== "object") return null;
  if (value.found === true) {
    return value.product && typeof value.product === "object" ? value : null;
  }
  if (value.found === false) {
    return { ...value, reason: value.reason || "not_found" };
  }
  return null;
}

async function _readCache(key) {
  if (_memCache.has(key)) {
    const entry = _memCache.get(key);
    const ttlMs = entry?.ttlMs || _cacheTtlForValue(entry?.value);
    if (entry?.savedAt && Date.now() - entry.savedAt <= ttlMs) {
      const normalized = _normalizeCachedValue(entry.value);
      if (normalized) {
        if (normalized !== entry.value) _memCache.set(key, { ...entry, value: normalized });
        return normalized;
      }
    }
    _memCache.delete(key);
  }
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ttlMs = parsed?.ttlMs || _cacheTtlForValue(parsed?.value);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > ttlMs) {
      AsyncStorage.removeItem(CACHE_PREFIX + key).catch(() => {});
      return null;
    }
    const normalized = _normalizeCachedValue(parsed.value);
    if (!normalized) {
      AsyncStorage.removeItem(CACHE_PREFIX + key).catch(() => {});
      return null;
    }
    _memCache.set(key, { savedAt: parsed.savedAt, ttlMs, value: normalized });
    return normalized;
  } catch {
    return null;
  }
}

async function _writeCache(key, value) {
  const savedAt = Date.now();
  const ttlMs = _cacheTtlForValue(value);
  _memCache.set(key, { savedAt, ttlMs, value });
  try {
    await AsyncStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ savedAt, ttlMs, value }),
    );
  } catch {
    // Storage full or quota exceeded — non-fatal
  }
}

function _startOpffRequest(timeoutMs, parentSignal) {
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const onParentAbort = () => controller.abort();

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener?.("abort", onParentAbort, { once: true });
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener?.("abort", onParentAbort);
    },
  };
}

async function _awaitInflightLookup(key, { signal, label } = {}) {
  const inflight = _inflightLookups.get(key);
  if (!inflight) return null;
  if (signal?.aborted) return { found: false, aborted: true };

  let abortHandler = null;
  const abortPromise = signal
    ? new Promise((resolve) => {
        abortHandler = () => resolve({ found: false, aborted: true });
        signal.addEventListener?.("abort", abortHandler, { once: true });
      })
    : null;

  try {
    console.log(`[OPFF] ${label || "lookup"} IN-FLIGHT HIT:`, key);
    return await Promise.race([
      inflight,
      ...(abortPromise ? [abortPromise] : []),
    ]);
  } finally {
    if (abortHandler) signal?.removeEventListener?.("abort", abortHandler);
  }
}

function _rememberInflightLookup(key, promise) {
  _inflightLookups.set(key, promise);
  promise.finally(() => {
    if (_inflightLookups.get(key) === promise) {
      _inflightLookups.delete(key);
    }
  });
  return promise;
}

function normalizeProduct(raw) {
  const p = raw.product || raw;

  const nutriments = p.nutriments || {};

  return {
    productName: p.product_name || p.product_name_en || "",
    brand: p.brands || "",
    petType: detectPetType(p),
    barcode: p.code || p._id || "",
    ingredientsText: p.ingredients_text || p.ingredients_text_en || "",
    ingredients: (p.ingredients || []).map((ing) => ({
      id: ing.id || "",
      text: ing.text || "",
      percent: ing.percent_estimate ?? null,
    })),
    nutriments: {
      protein: nutriments.proteins_100g ?? nutriments.proteins ?? null,
      fat: nutriments.fat_100g ?? nutriments.fat ?? null,
      fiber:
        nutriments.fiber_100g ??
        nutriments["crude-fiber_100g"] ??
        nutriments.fiber ??
        null,
      energy: nutriments["energy-kcal_100g"] ?? nutriments.energy_100g ?? null,
    },
    nutriscoreGrade: p.nutriscore_grade || p.nutrition_grades || null,
    novaGroup: p.nova_group ?? null,
    imageUrl: p.image_url || p.image_front_url || null,
  };
}

function detectPetType(p) {
  const text = [
    p.product_name,
    p.categories,
    p.categories_tags?.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes("dog") || text.includes("chien")) return "dog";
  if (text.includes("cat") || text.includes("chat")) return "cat";
  return "unknown";
}

export async function lookupBarcode(barcode, { signal } = {}) {
  if (!barcode) return { found: false, reason: "not_found" };
  const cacheKey = `b:${barcode}`;
  const cached = await _readCache(cacheKey);
  if (cached !== null) {
    console.log("[OPFF] lookupBarcode CACHE HIT:", barcode, cached.found ? `→ ${cached.product?.productName}` : "(known miss)");
    return cached;
  }
  const inflight = await _awaitInflightLookup(cacheKey, { signal, label: "lookupBarcode" });
  if (inflight) return inflight;
  if (signal?.aborted) {
    console.log("[OPFF] lookupBarcode aborted:", barcode);
    return { found: false, aborted: true };
  }

  console.log("[OPFF] lookupBarcode called with:", barcode);
  const lookupPromise = _rememberInflightLookup(cacheKey, (async () => {
    const request = _startOpffRequest(4000, signal);

    try {
      const url = `${OPFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Woof App - pet food scanner" },
        signal: request.signal,
      });

      if (!response.ok) {
        console.log("[OPFF] lookupBarcode failed — HTTP", response.status);
        // Don't cache transient failures; a 404 is a real "not found" so cache that briefly
        const result = { found: false, reason: response.status === 404 ? "not_found" : "lookup_error" };
        if (response.status === 404) await _writeCache(cacheKey, result);
        return result;
      }

      const data = await response.json();

      if (!data.product || data.status === 0) {
        console.log("[OPFF] lookupBarcode — product not found");
        const result = { found: false, reason: "not_found" };
        await _writeCache(cacheKey, result);
        return result;
      }

      const product = normalizeProduct(data);
      console.log("[OPFF] lookupBarcode — FOUND:", product.productName, "|", product.brand);
      const result = { found: true, product };
      await _writeCache(cacheKey, result);
      reportNetworkSuccess();
      return result;
    } catch (err) {
      if (err.name === "AbortError" && request.didTimeout()) {
        console.log("[OPFF] lookupBarcode timed out:", barcode);
        reportNetworkError(err);
        return { found: false, reason: "timeout" };
      }
      if (err.name === "AbortError" && signal?.aborted) {
        console.log("[OPFF] lookupBarcode aborted:", barcode);
        return { found: false, aborted: true };
      }
      console.log("[OPFF] lookupBarcode error:", err.message);
      reportNetworkError(err);
      return { found: false, reason: "lookup_error" };
    } finally {
      request.cleanup();
    }
  })());

  return _awaitInflightLookup(cacheKey, { signal, label: "lookupBarcode" }) || lookupPromise;
}

export async function searchByName(name, { signal } = {}) {
  if (!name) return { found: false, reason: "not_found" };
  const cacheKey = `n:${name.toLowerCase().trim().slice(0, 80)}`;
  const cached = await _readCache(cacheKey);
  if (cached !== null) {
    console.log("[OPFF] searchByName CACHE HIT:", name);
    return cached;
  }

  console.log("[OPFF] searchByName called with:", name);
  const request = _startOpffRequest(4000, signal);

  try {
    const url = `${OPFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(name)}&json=true&page_size=5`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Woof App - pet food scanner" },
      signal: request.signal,
    });

    if (!response.ok) {
      console.log("[OPFF] searchByName failed — HTTP", response.status);
      return { found: false, reason: "lookup_error" };
    }

    const data = await response.json();

    if (!data.products || data.products.length === 0) {
      console.log("[OPFF] searchByName — no results");
      const result = { found: false, reason: "not_found" };
      await _writeCache(cacheKey, result);
      return result;
    }

    const product = normalizeProduct(data.products[0]);
    console.log("[OPFF] searchByName — FOUND:", product.productName);
    const result = { found: true, product };
    await _writeCache(cacheKey, result);
    reportNetworkSuccess();
    return result;
  } catch (err) {
    if (signal?.aborted) {
      console.log("[OPFF] searchByName aborted:", name);
      return { found: false, aborted: true };
    }
    if (err.name === "AbortError" && request.didTimeout()) {
      console.log("[OPFF] searchByName timed out:", name);
      reportNetworkError(err);
      return { found: false, reason: "timeout" };
    }
    console.log("[OPFF] searchByName error:", err.message);
    reportNetworkError(err);
    return { found: false, reason: "lookup_error" };
  } finally {
    request.cleanup();
  }
}
