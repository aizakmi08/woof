import { supabase } from "./supabase";
import { createLogger } from "./logger";
import { hasVerifiedIngredientData, hasVerifiedProductImageData } from "./verifiedScoring";

const logger = createLogger("CACHE");

/**
 * Deterministic normalization for cache key matching.
 * Lowercase, strip trademark symbols, remove generic food terms,
 * remove non-alphanumeric (except spaces), collapse whitespace.
 */
export function normalizeCacheKey(productName) {
  if (!productName || typeof productName !== "string") return "";
  return productName
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Look up a cached analysis by cache key.
 * Returns { hit: true, analysis, dataSource, opffData } on hit,
 * or { hit: false } on miss or any error.
 */
export async function getCachedAnalysis(cacheKey) {
  if (!cacheKey || typeof cacheKey !== "string") return { hit: false };

  try {
    const { data, error } = await supabase
      .from("analysis_cache")
      .select("analysis, data_source, opff_data")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .single();

    if (error || !data) {
      if (error && error.code !== "PGRST116") {
        logger.debug("[CACHE] MISS for key:", cacheKey, error.message);
      } else {
        logger.debug("[CACHE] MISS for key:", cacheKey);
      }
      return { hit: false };
    }

    logger.debug("[CACHE] HIT for key:", cacheKey);

    if (
      data.data_source === "verified" &&
      (!hasVerifiedIngredientData(data.opff_data || {}) || !hasVerifiedProductImageData(data.opff_data || {}))
    ) {
      logger.debug("[CACHE] Ignoring verified cache without ingredient and image provenance:", cacheKey);
      return { hit: false };
    }

    // Increment hit count (fire-and-forget)
    supabase.rpc("increment_cache_hit", { p_key: cacheKey }).catch(() => {});

    return {
      hit: true,
      analysis: data.analysis,
      dataSource: data.data_source || "ai",
      opffData: data.opff_data || null,
    };
  } catch (err) {
    logger.debug("[CACHE] Error during lookup:", err.message);
    return { hit: false };
  }
}
