import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import {
  catalogVerificationState,
  productIsVerifiedReady,
} from "./catalogQuality";
import { createLogger } from "./logger";

const logger = createLogger("CATALOG_COVERAGE");
const SESSION_ID_KEY = "@woof_catalog_coverage_session_id";
const MAX_QUERY_LENGTH = 140;
const MAX_STRING_LENGTH = 160;
const VERIFIED_INGREDIENT_STATUSES = new Set([
  "gdsn",
  "official",
  "manufacturer",
  "retailer_verified",
  "label_ocr_verified",
]);
const VERIFIED_IMAGE_STATUSES = new Set([
  "official",
  "manufacturer",
  "retailer_verified",
]);

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

async function getSessionId() {
  const existing = await AsyncStorage.getItem(SESSION_ID_KEY);
  if (existing && existing.length >= 8 && existing.length <= 80) return existing;

  const next = makeId();
  await AsyncStorage.setItem(SESSION_ID_KEY, next);
  return next;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeQuery(value) {
  return compact(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function textOrNull(value, maxLength = MAX_STRING_LENGTH) {
  const text = compact(value);
  return text ? text.slice(0, maxLength) : null;
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function compactArray(values = [], limit = 120) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      if (typeof value === "string") return compact(value);
      return compact(value?.name || value?.text || value?.ingredient);
    })
    .filter(Boolean)
    .slice(0, limit);
}

function productIdentityFromSubmission({ analysis, candidateProduct, identification, query } = {}) {
  const productName = compact(
    candidateProduct?.productName ||
    analysis?.productName ||
    identification?.productName ||
    query
  );
  const brand = compact(candidateProduct?.brand || analysis?.brand || identification?.brand);
  return {
    productName,
    brand,
    cacheKey: compact(candidateProduct?.cacheKey),
    gtin: compact(candidateProduct?.gtin || candidateProduct?.barcode),
    petType: compact(candidateProduct?.petType || analysis?.petType || identification?.petType).toLowerCase(),
  };
}

function productIsReady(product) {
  return productIsVerifiedReady(product);
}

function lower(value) {
  return compact(value).toLowerCase();
}

function hasSourceEvidence(product) {
  return Boolean(compact(product?.sourceUrl || product?.source_url));
}

function hasVerifiedIngredients(product) {
  return hasSourceEvidence(product) && VERIFIED_INGREDIENT_STATUSES.has(lower(product?.ingredientVerificationStatus));
}

function hasVerifiedImage(product) {
  return hasSourceEvidence(product) && Boolean(product?.imageUrl) && VERIFIED_IMAGE_STATUSES.has(lower(product?.imageVerificationStatus));
}

function hasKnownPetType(product) {
  const petType = lower(product?.petType);
  return petType === "dog" || petType === "cat";
}

function productVerificationGaps(product) {
  if (!product) return [];
  return catalogVerificationState(product).gaps;
}

function catalogCoverageSummary(products = []) {
  const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];
  return {
    result_count: safeProducts.length,
    catalog_result_count: safeProducts.filter((product) => product.sourceKind === "catalog").length,
    opff_result_count: safeProducts.filter((product) => product.sourceKind === "opff").length,
    image_result_count: safeProducts.filter((product) => !!product.imageUrl).length,
    fallback_image_count: safeProducts.filter((product) => !!product.imageFallback).length,
    ready_result_count: safeProducts.filter(productIsReady).length,
    verified_ingredient_result_count: safeProducts.filter(hasVerifiedIngredients).length,
    verified_image_result_count: safeProducts.filter(hasVerifiedImage).length,
    known_pet_type_result_count: safeProducts.filter(hasKnownPetType).length,
  };
}

function catalogVerificationGapSummary(products = []) {
  const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];
  const gapProducts = safeProducts
    .map((product) => ({ product, gaps: productVerificationGaps(product) }))
    .filter((entry) => entry.gaps.length > 0);
  const reasons = [...new Set(gapProducts.flatMap((entry) => entry.gaps))];

  return {
    result_count: safeProducts.length,
    image_result_count: safeProducts.filter((product) => !!product.imageUrl).length,
    ready_result_count: safeProducts.filter(productIsReady).length,
    verified_ingredient_result_count: safeProducts.filter(hasVerifiedIngredients).length,
    verified_image_result_count: safeProducts.filter(hasVerifiedImage).length,
    known_pet_type_result_count: safeProducts.filter(hasKnownPetType).length,
    product_gap_count: gapProducts.length,
    needs_verified_ingredient_count: gapProducts.filter((entry) => entry.gaps.includes("unverified_ingredients")).length,
    needs_verified_image_count: gapProducts.filter((entry) => (
      entry.gaps.includes("missing_image") || entry.gaps.includes("unverified_image")
    )).length,
    missing_image_count: gapProducts.filter((entry) => entry.gaps.includes("missing_image")).length,
    unknown_pet_type_count: gapProducts.filter((entry) => entry.gaps.includes("unknown_pet_type")).length,
    verification_gap_reasons: reasons,
    top_gap_reasons: gapProducts[0]?.gaps || [],
  };
}

function missReason({ normalizedQuery, identification, summary, errorMessage }) {
  if (errorMessage) return "lookup_failed";
  if (!normalizedQuery) return "empty_query";
  if (identification && identification.found === false) return "label_not_readable";
  if (summary.result_count === 0) return "no_results";
  if (summary.catalog_result_count === 0 && summary.opff_result_count > 0) return "catalog_gap_opff_hit";
  if (summary.ready_result_count === 0) return "missing_ingredients";
  if (summary.image_result_count === 0) return "missing_images";
  return null;
}

export async function logCatalogLookupEvent({
  source = "unknown",
  query,
  identification,
  products = [],
  resolverStatus,
  verificationState,
  latencyMs,
  errorMessage,
} = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return false;

    const normalizedQuery = normalizeQuery(
      query ||
      identification?.searchQuery ||
      [identification?.brand, identification?.productName].filter(Boolean).join(" ")
    );
    const summary = catalogCoverageSummary(products);
    const reason = missReason({
      normalizedQuery,
      identification,
      summary,
      errorMessage,
    });
    const topProduct = Array.isArray(products) ? products[0] : null;
    const eventName = errorMessage
      ? "catalog_lookup_failed"
      : reason
        ? "catalog_lookup_miss"
        : "catalog_lookup_completed";

    const { error } = await supabase.rpc("log_product_event", {
      p_event_name: eventName,
      p_session_id: await getSessionId(),
      p_metadata: {
        platform: Platform.OS,
        source: textOrNull(source, 40) || "unknown",
        normalized_query: normalizedQuery,
        query_length: normalizedQuery.length,
        query_token_count: normalizedQuery ? normalizedQuery.split(" ").filter(Boolean).length : 0,
        label_found: typeof identification?.found === "boolean" ? identification.found : null,
        label_confidence: numberOrNull(identification?.confidence),
        label_pet_type: textOrNull(identification?.petType, 20),
        resolver_status: textOrNull(resolverStatus, 40),
        verification_state: textOrNull(verificationState?.state, 40),
        verification_gaps: Array.isArray(verificationState?.gaps) ? verificationState.gaps.slice(0, 10) : [],
        latency_ms: numberOrNull(latencyMs),
        miss_reason: reason,
        coverage_gap: reason === "catalog_gap_opff_hit",
        ...summary,
        top_cache_key: textOrNull(topProduct?.cacheKey, 120),
        top_source_kind: textOrNull(topProduct?.sourceKind, 24),
        top_source: textOrNull(topProduct?.source, 40),
        top_brand: textOrNull(topProduct?.brand, 80),
        top_product_name: textOrNull(topProduct?.productName, 120),
      },
    });

    if (error) {
      logger.debug("[CATALOG_COVERAGE] log_product_event error:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    logger.debug("[CATALOG_COVERAGE] log failed:", err.message);
    return false;
  }
}

export async function logCatalogVerificationGapEvent({
  source = "unknown",
  query,
  identification,
  products = [],
  selectedProduct,
  resolverStatus,
  verificationState,
  trigger = "lookup",
  latencyMs,
} = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return false;

    const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];
    const inspectedProducts = selectedProduct
      ? [selectedProduct, ...safeProducts.filter((product) => product?.cacheKey !== selectedProduct.cacheKey)]
      : safeProducts;
    const summary = catalogVerificationGapSummary(inspectedProducts);
    if (summary.product_gap_count === 0) return false;

    const normalizedQuery = normalizeQuery(
      query ||
      identification?.searchQuery ||
      [identification?.brand, identification?.productName].filter(Boolean).join(" ") ||
      selectedProduct?.productName
    );
    const topProduct = selectedProduct || inspectedProducts[0] || null;

    const { error } = await supabase.rpc("log_product_event", {
      p_event_name: "catalog_verification_gap",
      p_session_id: await getSessionId(),
      p_metadata: {
        platform: Platform.OS,
        source: textOrNull(source, 40) || "unknown",
        trigger: textOrNull(trigger, 40) || "lookup",
        normalized_query: normalizedQuery,
        query_length: normalizedQuery.length,
        query_token_count: normalizedQuery ? normalizedQuery.split(" ").filter(Boolean).length : 0,
        label_found: typeof identification?.found === "boolean" ? identification.found : null,
        label_confidence: numberOrNull(identification?.confidence),
        label_pet_type: textOrNull(identification?.petType, 20),
        resolver_status: textOrNull(resolverStatus, 40),
        verification_state: textOrNull(verificationState?.state, 40),
        verification_gaps: Array.isArray(verificationState?.gaps) ? verificationState.gaps.slice(0, 10) : [],
        latency_ms: numberOrNull(latencyMs),
        ...summary,
        top_cache_key: textOrNull(topProduct?.cacheKey, 120),
        top_source_kind: textOrNull(topProduct?.sourceKind, 24),
        top_source: textOrNull(topProduct?.source, 40),
        top_source_quality: textOrNull(topProduct?.sourceQuality, 40),
        top_brand: textOrNull(topProduct?.brand, 80),
        top_product_name: textOrNull(topProduct?.productName, 120),
        top_pet_type: textOrNull(topProduct?.petType, 20),
        top_ingredient_verification_status: textOrNull(topProduct?.ingredientVerificationStatus, 40),
        top_image_verification_status: textOrNull(topProduct?.imageVerificationStatus, 40),
        top_has_image: !!topProduct?.imageUrl,
      },
    });

    if (error) {
      logger.debug("[CATALOG_COVERAGE] verification gap log_product_event error:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    logger.debug("[CATALOG_COVERAGE] verification gap log failed:", err.message);
    return false;
  }
}

export async function submitCatalogIngredientCapture({
  analysis,
  query,
  candidateProduct,
  identification,
  source = "ingredient_capture",
  scanId,
  sourceSurface,
} = {}) {
  try {
    const identity = productIdentityFromSubmission({
      analysis,
      candidateProduct,
      identification,
      query,
    });
    const ingredientNames = compactArray(analysis?.ingredients);
    const ingredientText = compact(
      analysis?.ingredientText ||
      analysis?.ingredientsText ||
      ingredientNames.join(", ")
    );

    if (!identity.productName && !identity.brand && !query) {
      logger.debug("[CATALOG_COVERAGE] Skipping ingredient submission without product identity");
      return { submitted: false, reason: "missing_identity" };
    }
    if (!ingredientText || ingredientNames.length === 0) {
      logger.debug("[CATALOG_COVERAGE] Skipping ingredient submission without ingredients");
      return { submitted: false, reason: "missing_ingredients" };
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      logger.debug("[CATALOG_COVERAGE] Skipping ingredient submission without an authenticated session");
      return { submitted: false, reason: "not_authenticated" };
    }

    const { data, error } = await supabase.rpc("submit_catalog_ingredient_capture", {
      p_product_name: identity.productName || query || "Unknown product",
      p_brand: identity.brand || null,
      p_pet_type: identity.petType === "dog" || identity.petType === "cat" ? identity.petType : null,
      p_normalized_query: normalizeQuery(query || identity.productName),
      p_cache_key: identity.cacheKey || null,
      p_gtin: identity.gtin || null,
      p_ingredient_text: ingredientText.slice(0, 10000),
      p_ingredients: ingredientNames,
      p_metadata: {
        platform: Platform.OS,
        source: textOrNull(source, 40) || "ingredient_capture",
        source_surface: textOrNull(sourceSurface, 60),
        scan_id: textOrNull(scanId, 80),
        label_found: typeof identification?.found === "boolean" ? identification.found : null,
        label_confidence: numberOrNull(identification?.confidence),
        candidate_cache_key: textOrNull(candidateProduct?.cacheKey, 120),
        candidate_source: textOrNull(candidateProduct?.source, 60),
        candidate_source_quality: textOrNull(candidateProduct?.sourceQuality, 60),
        ingredient_count: ingredientNames.length,
      },
    });

    if (error) {
      logger.debug("[CATALOG_COVERAGE] submit_catalog_ingredient_capture error:", error.message);
      return { submitted: false, reason: "rpc_error", error };
    }

    return { submitted: true, data };
  } catch (err) {
    logger.debug("[CATALOG_COVERAGE] ingredient submission failed:", err.message);
    return { submitted: false, reason: "exception", error: err };
  }
}
